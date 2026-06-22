const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const jwt = require('jsonwebtoken');
const otplib = require('otplib');
const db = require('../api/db');
const { JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_DAYS, generateToken, generateAccessToken, generateRefreshToken, generatePartialToken, generateCode } = require('../utils/token');
const getSiteUrl = require('../utils/site-url');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { isUsernameBlacklisted } = require('../utils/username-blacklist');
const tokenStore = require('../utils/token-store');
const { blacklistToken, invalidateDeviceCache, invalidateUserActiveCache } = require('../middleware/auth');

const { checkRateLimit } = require('../middleware/rate-limiter');
const RATELIMIT_PREFIX = 'ratelimit:login:';

// 本地时间格式化：返回 YYYY-MM-DD HH:MM:SS（Asia/Shanghai）
// 避免使用 toISOString()（UTC）导致 MySQL DATETIME 丢失时区信息
function formatLocalDateTime(date) {
    var d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function checkLoginRateLimit(ip, username) {
    const key = `${RATELIMIT_PREFIX}${ip}:${username}`;
    return checkRateLimit(key, 5, 60000);
}

router.post('/login', async (req, res) => {
    const { username, password, device_name } = req.body;
    // R3-2 修复：使用 req.ip（基于 TCP 连接，不可伪造）替代 x-forwarded-for
    const ip = req.ip;

    // M-1 修复：检查登录速率限制
    const rateLimit = await checkLoginRateLimit(ip, username);
    if (!rateLimit.allowed) {
        return res.status(429).json({
            error: '登录尝试过于频繁，请稍后再试',
            retryAfter: rateLimit.retryAfter
        });
    }
    
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username);
    var user;
    if (isEmail) {
        user = await db.users.getByEmail(username);
        if (user && !user.emailVerified) {
            return res.status(400).json({ error: '该邮箱尚未验证，请先完成验证' });
        }
    } else {
        user = await db.users.getByUsername(username);
    }

    if (!user) {
        return res.status(401).json({ error: '用户名或密码不正确，请核对信息后重试' });
    }

    let passwordMatch = false;

    if (user.password_salt && user.password_salt.length > 0) {
        // 有盐模式：SHA256(salt + password)
        const saltedHash = CryptoJS.SHA256(user.password_salt + password).toString();
        passwordMatch = (user.password === saltedHash);
    } else {
        // 兼容无盐旧模式：SHA256(password)
        const legacyHash = CryptoJS.SHA256(password).toString();
        passwordMatch = (user.password === legacyHash);

        // Lazy migration: 旧密码首次登录成功后自动 re-hash
        if (passwordMatch) {
            const newSalt = crypto.randomBytes(16).toString('hex');
            const newHash = CryptoJS.SHA256(newSalt + password).toString();
            await db.users.update(user.id, {
                password: newHash,
                password_salt: newSalt
            });
        }
    }

    if (!passwordMatch) {
        return res.status(401).json({ error: '用户名或密码不正确，请核对信息后重试' });
    }

    const refreshToken = generateRefreshToken();
    const ua = req.headers['user-agent'] || '';
    const deviceName = (device_name || ua.substring(0, 100));
    await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);
    
    const record = await db.refreshTokens.create({
        user_id: user.id,
        token: refreshToken,
        device_name: deviceName,
        ip,
        user_agent: ua,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });

    if (await db.twofa.isEnabled(user.id)) {
        const partialToken = generatePartialToken(user);
        const { password: _, ...safeUser } = user;
        return res.json({
            twofa_required: true,
            partial_token: partialToken,
            refresh_token: refreshToken,
            user: safeUser
        });
    }
    
    const token = generateAccessToken(user, record.id);

    const { password: _, ...safeUser } = user;
    // P1-C2 修复：如果用户需要强制改密，在响应中标记
    if (user.must_change_password) {
        return res.json({ token, refreshToken, user: safeUser, must_change_password: true });
    }
    res.json({ token, refreshToken, user: safeUser });
});

router.post('/login/2fa', async (req, res) => {
    const tfaLimit = await checkRateLimit(`ratelimit:2fa:${req.ip}:${req.body?.userId || req.body?.username}`, 3, 60000);
    if (!tfaLimit.allowed) {
        return res.status(429).json({ error: '2FA 验证过于频繁，请 60 秒后重试' });
    }

    const { partial_token, code, refresh_token: reqRefreshToken } = req.body;
    if (!partial_token || !code) {
        return res.status(400).json({ error: '缺少参数' });
    }

    let decoded;
    try {
        decoded = jwt.verify(partial_token, JWT_SECRET, { algorithms: ['HS256'] });
        if (!decoded.twofa_pending) {
            return res.status(400).json({ error: '无效的令牌' });
        }
    } catch (err) {
        return res.status(401).json({ error: '令牌已过期或无效，请重新登录' });
    }

    const user = await db.users.getById(decoded.id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    let isValidTotp = false;
    if (/^\d{6}$/.test(code)) {
        const secret = await db.twofa.getSecret(user.id);
        if (secret) {
            try {
                isValidTotp = otplib.verifySync({ token: code, secret }).valid;
            } catch {
            }
        }
    }

    if (isValidTotp) {
        let record;
        let refreshToken = reqRefreshToken;
        if (refreshToken) {
            record = await db.refreshTokens.getByToken(refreshToken);
        }
        if (!record || record.revoked || new Date(record.expires_at) <= new Date()) {
            const ip = req.ip;
            const ua = req.headers['user-agent'] || '';
            const deviceName = ua.substring(0, 100);
            await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);
            refreshToken = generateRefreshToken();
            record = await db.refreshTokens.create({
                user_id: user.id,
                token: refreshToken,
                device_name: deviceName,
                ip,
                user_agent: ua,
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
            });
        }

        const token = generateAccessToken(user, record.id);
        const { password: _, ...safeUser } = user;
        return res.json({ token, refreshToken, user: safeUser });
    }

    const recoveryCodes = await db.twofa.getUnusedRecoveryCodes(user.id);
    for (const rc of recoveryCodes) {
        if (code === rc.code) {
            await db.twofa.markRecoveryCodeUsed(code);
            let record;
            let refreshToken = reqRefreshToken;
            if (refreshToken) {
                record = await db.refreshTokens.getByToken(refreshToken);
            }
            if (!record || record.revoked || new Date(record.expires_at) <= new Date()) {
                const ip = req.ip;
                const ua = req.headers['user-agent'] || '';
                const deviceName = ua.substring(0, 100);
                await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);
                refreshToken = generateRefreshToken();
                record = await db.refreshTokens.create({
                    user_id: user.id,
                    token: refreshToken,
                    device_name: deviceName,
                    ip,
                    user_agent: ua,
                    created_at: new Date().toISOString(),
                    expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
                });
            }
            const token = generateAccessToken(user, record.id);
            const { password: _, ...safeUser } = user;
            return res.json({ token, refreshToken, user: safeUser });
        }
    }

    return res.status(401).json({ error: '验证码错误' });
});

router.post('/auth/refresh', async (req, res) => {
    try {
        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: '缺少 refreshToken' });

        // R3-1 修复：refreshToken 是纯随机字符串（非 JWT），直接用 DB 查询校验，移除无效的 jwt.verify
        const record = await db.refreshTokens.getByToken(refreshToken);
        if (!record || !record.user_id) {
            return res.status(401).json({ error: 'refreshToken 已失效' });
        }

        // 立即撤销旧 refresh token（防重放）
        await db.refreshTokens.deleteByToken(refreshToken);

        const user = await db.users.getById(record.user_id);
        if (!user || !user.is_active) {
            return res.status(401).json({ error: '用户不存在或已被禁用' });
        }

        // 签发新的 access token + 新的 refresh token
        const newAccessToken = generateAccessToken(user, record.id);
        const newRefreshToken = generateRefreshToken();

        // 存储新的 refresh token
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        await db.refreshTokens.create({
            user_id: user.id,
            device_name: record.device_name,
            token: newRefreshToken,
            ip: req.ip,
            user_agent: req.headers['user-agent'] || '',
            created_at: new Date().toISOString(),
            expires_at: expiresAt.toISOString()
        });

        res.json({ token: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
        console.error('[auth] refresh token 错误:', error.message);
        res.status(500).json({ error: 'token 刷新失败' });
    }
});

router.post('/logout', async (req, res) => {
    const { refreshToken } = req.body;
    // 将 access token 加入黑名单（从 Authorization header 读取）
    const accessToken = req.headers.authorization?.replace('Bearer ', '');
    if (accessToken) {
        try {
            const decoded = jwt.decode(accessToken);
            if (decoded && decoded.exp) {
                await blacklistToken(accessToken, decoded.exp);
            }
        } catch (e) {}
    }
    if (refreshToken) {
        const record = await db.refreshTokens.getByToken(refreshToken);
        if (record) {
            await db.refreshTokens.revoke(record.id);
            // 清除设备缓存
            await invalidateDeviceCache(record.id);
        }
    }
    res.json({ message: '登出成功' });
});

router.post('/auth/forgot-password', async (req, res) => {
    const forgotLimit = await checkRateLimit(`ratelimit:forgot:${req.ip}`, 1, 600000);
    if (!forgotLimit.allowed) {
        return res.status(429).json({ error: '密码重置邮件发送过于频繁，请 10 分钟后重试' });
    }

    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱地址' });
        }
        
        const allUsers = await db.users.getAll();
        const user = allUsers.find(u => u.email === email && u.emailVerified);
        
        if (!user) {
            return res.json({ message: '如果邮箱已绑定，重置链接已发送' });
        }
        
        const token = generateToken();

        // 使用 token-store 存储（优先 Redis，回退数据库）
        await tokenStore.setResetToken(token, user.id, 3600);
        
        // H-10 修复：检查 SITE_URL 是否已配置
        const siteUrl = getSiteUrl(req);
        if (!siteUrl) {
            return res.status(500).json({ error: '邮件服务未正确配置，无法发送密码重置链接' });
        }

        const resetUrl = `${siteUrl}?resetPassword=${token}`;
        const emailContent = `
            <p>您好 <strong>${user.username}</strong>，</p>
            <p>我们收到了您的密码重置请求。</p>
            <p>请点击下方按钮重置您的密码：</p>
            <p style="text-align: center;">
                <a href="${resetUrl}" class="btn" target="_blank">重置密码</a>
            </p>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                如果按钮无法点击，请复制以下链接到浏览器：<br>
                <a href="${resetUrl}" style="word-break: break-all;">${resetUrl}</a>
            </p>
            <div class="info-box">
                <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快操作。</p>
            </div>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                <strong>如果您没有请求重置密码</strong>，请忽略此邮件，您的密码不会被修改。
            </p>
        `;
        
        await sendEmail(user.email, '密码重置', createEmailTemplate('密码重置请求', emailContent));
        res.json({ message: '如果邮箱已绑定，重置链接已发送' });
    } catch (error) {
        res.status(500).json({ error: '请求失败' });
    }
});

router.get('/auth/reset-password/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const userId = await tokenStore.getResetToken(token);
        if (!userId) {
            return res.status(400).json({ error: '链接无效或已过期' });
        }

        res.json({ valid: true });
    } catch (error) {
        res.status(500).json({ error: '验证失败' });
    }
});

router.post('/auth/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        if (newPassword.length < 6) {
            return res.status(400).json({ error: '密码至少需要 6 个字符' });
        }
        
        const userId = await tokenStore.getResetToken(token);
        if (!userId) {
            return res.status(400).json({ error: '链接无效或已过期' });
        }

        const user = await db.users.getById(userId);

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const salt = crypto.randomBytes(16).toString('hex');
        await db.users.update(userId, {
            password: CryptoJS.SHA256(salt + newPassword).toString(),
            password_salt: salt
        });

        // H-8 修复：密码重置后撤销该用户所有 refresh token
        await db.refreshTokens.revokeByUserId(userId);
        // 清除用户活跃状态缓存，确保被禁用状态立即生效
        await invalidateUserActiveCache(userId);

        // 删除已使用的 token
        await tokenStore.delResetToken(token);
        
        res.json({ message: '密码重置成功，请使用新密码登录' });
    } catch (error) {
        res.status(500).json({ error: '重置失败' });
    }
});

// ========== 注册功能 ==========

// PUBLIC: 注册开关状态查询（无需认证）
router.get('/register/status', async (req, res) => {
    try {
        const enabled = await db.config.get('register:enabled');
        res.json({ enabled: enabled === '1' });
    } catch (e) {
        res.json({ enabled: false });
    }
});

// PUBLIC: 发送注册验证码
router.post('/register/send-code', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱地址' });
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }

        // 校验邮箱未被占用
        const existingUser = await db.users.getByEmail(email);
        if (existingUser) {
            return res.status(400).json({ error: '邮箱已被使用' });
        }

        // 限速1：同一邮箱 1 次/60 秒
        const emailLimit = await checkRateLimit(`ratelimit:register-code:${email}`, 1, 60000);
        if (!emailLimit.allowed) {
            return res.status(429).json({
                error: '验证码发送过于频繁，请稍后再试',
                retryAfter: emailLimit.retryAfter
            });
        }

        // 限速2：同一 IP 5 次/小时
        const ipLimit = await checkRateLimit(`ratelimit:register-code-ip:${req.ip}`, 5, 3600000);
        if (!ipLimit.allowed) {
            return res.status(429).json({
                error: '请求过于频繁，请稍后再试',
                retryAfter: ipLimit.retryAfter
            });
        }

        // 生成 6 位验证码
        const code = generateCode();

        // 使用 token-store 存储验证码（优先 Redis，回退数据库，10 分钟有效期）
        await tokenStore.setRegisterCode(email, code, 600);

        // 生成邮件 HTML
        var siteName = await db.config.get('site:name') || 'PVE 多用户控制面板';
        var html = createEmailTemplate('注册验证码 - ' + siteName,
            '<p>您好，您正在进行账号注册，验证码为：</p>' +
            '<div style="text-align:center;margin:20px 0;">' +
            '<span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#7c3aed;background:#f5f3ff;padding:12px 24px;border-radius:8px;display:inline-block;">' + code + '</span>' +
            '</div>' +
            '<p style="color:#666;">验证码有效期为 10 分钟，请尽快使用。</p>' +
            '<p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件。</p>', siteName);

        try {
            await sendEmail(email, '注册验证码 - ' + siteName, html);
        } catch (sendErr) {
            console.error('[register] 邮件发送失败:', sendErr.message);
            return res.status(500).json({ error: '邮件发送失败，请检查邮箱配置或联系管理员' });
        }

        res.json({ success: true, message: '验证码已发送' });
    } catch (error) {
        console.error('[register/send-code] 错误:', error.message);
        res.status(500).json({ error: '操作失败，请稍后重试' });
    }
});

// PUBLIC: 用户注册
router.post('/register', async (req, res) => {
    try {
        // 校验注册开关
        const enabled = await db.config.get('register:enabled');
        if (enabled !== '1') {
            return res.status(403).json({ error: '注册功能已关闭' });
        }

        // 限速：同一 IP 3 次/小时
        const ipLimit = await checkRateLimit(`ratelimit:register:${req.ip}`, 3, 3600000);
        if (!ipLimit.allowed) {
            return res.status(429).json({
                error: '注册请求过于频繁，请稍后再试',
                retryAfter: ipLimit.retryAfter
            });
        }

        const { username, password, email, code } = req.body;

        // 校验用户名
        if (!username || username.length < 3 || username.length > 32) {
            return res.status(400).json({ error: '用户名长度必须为 3-32 个字符' });
        }
        if (isUsernameBlacklisted(username)) {
            return res.status(400).json({ error: '该用户名不可用' });
        }
        const existingUsername = await db.users.getByUsername(username);
        if (existingUsername) {
            return res.status(400).json({ error: '用户名已存在' });
        }

        // 校验密码强度
        const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&*!]).{8,}$/;
        if (!passwordRegex.test(password || '')) {
            return res.status(400).json({ error: '密码必须至少 8 位，包含大小写字母和特殊字符' });
        }

        // 校验邮箱
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }
        const existingEmail = await db.users.getByEmail(email);
        if (existingEmail) {
            return res.status(400).json({ error: '邮箱已被使用' });
        }

        // 校验验证码（通过 token-store，优先 Redis）
        const storedCode = await tokenStore.getRegisterCode(email);
        if (!storedCode || storedCode !== code) {
            return res.status(400).json({ error: '验证码错误或已过期' });
        }

        // 创建用户
        const salt = crypto.randomBytes(16).toString('hex');
        const hashedPassword = CryptoJS.SHA256(salt + password).toString();
        const newUser = await db.users.create({
            username,
            password: hashedPassword,
            role: 'user',
            email,
            emailVerified: true
        });
        // 补充 salt（create 不接受 password_salt 字段）
        await db.users.update(newUser.id, { password_salt: salt });

        // 删除已使用的验证码
        await tokenStore.delRegisterCode(email);

        res.json({ success: true, message: '注册成功，请登录' });
    } catch (error) {
        console.error('[register] 错误:', error.message);
        res.status(500).json({ error: '注册失败，请稍后重试' });
    }
});

module.exports = router;
