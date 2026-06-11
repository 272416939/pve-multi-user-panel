const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const jwt = require('jsonwebtoken');
const otplib = require('otplib');
const db = require('../api/db-sqlite');
const { JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_DAYS, generateToken, generateAccessToken, generateRefreshToken, generatePartialToken } = require('../utils/token');
const getSiteUrl = require('../utils/site-url');
const { createEmailTemplate, sendEmail } = require('../utils/email');

// M-1 修复：登录速率限制（内存实现，防止暴力破解）
const loginAttempts = new Map(); // key: "ip:username" → { count, lastAttempt }
const LOGIN_RATE_LIMIT = 5;      // 每分钟最大尝试次数
const LOGIN_WINDOW_MS = 60 * 1000; // 时间窗口（毫秒）

function checkLoginRateLimit(ip, username) {
    const key = `${ip}:${username}`;
    const now = Date.now();
    const record = loginAttempts.get(key);

    if (!record || now - record.lastAttempt > LOGIN_WINDOW_MS) {
        // 新窗口或已过期，重置计数
        loginAttempts.set(key, { count: 1, lastAttempt: now });
        return { allowed: true };
    }

    if (record.count >= LOGIN_RATE_LIMIT) {
        const retryAfter = Math.ceil((LOGIN_WINDOW_MS - (now - record.lastAttempt)) / 1000);
        return { allowed: false, retryAfter };
    }

    record.count++;
    record.lastAttempt = now;
    return { allowed: true };
}

router.post('/login', async (req, res) => {
    const { username, password, device_name } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';

    // M-1 修复：检查登录速率限制
    const rateLimit = checkLoginRateLimit(ip, username);
    if (!rateLimit.allowed) {
        return res.status(429).json({
            error: '登录尝试过于频繁，请稍后再试',
            retryAfter: rateLimit.retryAfter
        });
    }
    
    const user = db.users.getByUsername(username);

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
            db.users.update(user.id, {
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
    
    const record = db.refreshTokens.create({
        user_id: user.id,
        token: refreshToken,
        device_name: device_name || ua.substring(0, 100),
        ip,
        user_agent: ua,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000).toISOString()
    });

    if (db.twofa.isEnabled(user.id)) {
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
    // H-15 修复：2FA 验证速率限制（每用户每分钟 3 次）
    if (!_tfaRateLimit) _tfaRateLimit = new Map();
    const tfaKey = `${req.ip}:${req.body?.userId || req.body?.username}`;
    const now = Date.now();
    const tfaRecord = _tfaRateLimit.get(tfaKey);
    if (tfaRecord && now - tfaRecord.lastAttempt < 60000) {
        if (tfaRecord.count >= 3) {
            return res.status(429).json({ error: '2FA 验证过于频繁，请 60 秒后重试' });
        }
        tfaRecord.count++;
        tfaRecord.lastAttempt = now;
    } else {
        _tfaRateLimit.set(tfaKey, { count: 1, lastAttempt: now });
    }

    const { partial_token, code, refresh_token: reqRefreshToken } = req.body;
    if (!partial_token || !code) {
        return res.status(400).json({ error: '缺少参数' });
    }

    let decoded;
    try {
        decoded = jwt.verify(partial_token, JWT_SECRET);
        if (!decoded.twofa_pending) {
            return res.status(400).json({ error: '无效的令牌' });
        }
    } catch (err) {
        return res.status(401).json({ error: '令牌已过期或无效，请重新登录' });
    }

    const user = db.users.getById(decoded.id);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }

    let isValidTotp = false;
    if (/^\d{6}$/.test(code)) {
        const secret = db.twofa.getSecret(user.id);
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
            record = db.refreshTokens.getByToken(refreshToken);
        }
        if (!record || record.revoked || new Date(record.expires_at) <= new Date()) {
            const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
            const ua = req.headers['user-agent'] || '';
            refreshToken = generateRefreshToken();
            record = db.refreshTokens.create({
                user_id: user.id,
                token: refreshToken,
                device_name: ua.substring(0, 100),
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

    const recoveryCodes = db.twofa.getUnusedRecoveryCodes(user.id);
    for (const rc of recoveryCodes) {
        if (code === rc.code) {
            db.twofa.markRecoveryCodeUsed(code);
            let record;
            let refreshToken = reqRefreshToken;
            if (refreshToken) {
                record = db.refreshTokens.getByToken(refreshToken);
            }
            if (!record || record.revoked || new Date(record.expires_at) <= new Date()) {
                const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
                const ua = req.headers['user-agent'] || '';
                refreshToken = generateRefreshToken();
                record = db.refreshTokens.create({
                    user_id: user.id,
                    token: refreshToken,
                    device_name: ua.substring(0, 100),
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

        // 验证 refresh token
        let decoded;
        try {
            decoded = jwt.verify(refreshToken, JWT_SECRET);
        } catch (e) {
            return res.status(401).json({ error: 'refreshToken 无效或已过期' });
        }

        // H-11 修复：立即撤销旧 refresh token（防重放）
        db.refreshTokens.deleteByToken(refreshToken);

        // 查找用户（在撤销前已通过 getByToken 获取过 record，但撤销后需重新确认）
        const record = db.refreshTokens.getByToken(refreshToken);
        if (!record || !record.user_id) {
            return res.status(401).json({ error: 'refreshToken 已失效' });
        }

        const user = db.users.getById(record.user_id);
        if (!user || !user.is_active) {
            return res.status(401).json({ error: '用户不存在或已被禁用' });
        }

        // 签发新的 access token + 新的 refresh token
        const newAccessToken = generateAccessToken(user, record.id);
        const newRefreshToken = generateRefreshToken();

        // 存储新的 refresh token
        const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        db.refreshTokens.create({
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
    if (refreshToken) {
        const record = db.refreshTokens.getByToken(refreshToken);
        if (record) {
            db.refreshTokens.revoke(record.id);
        }
    }
    res.json({ message: '登出成功' });
});

router.post('/auth/forgot-password', async (req, res) => {
    // H-16 修复：密码重置邮件速率限制（每 IP 每 10 分钟 1 次）
    if (!_forgotPwdRateLimit) _forgotPwdRateLimit = new Map();
    const forgotKey = `forgot:${req.ip}`;
    const now = Date.now();
    const forgotRecord = _forgotPwdRateLimit.get(forgotKey);
    if (forgotRecord && now - forgotRecord.lastAttempt < 600000) {
        return res.status(429).json({ error: '密码重置邮件发送过于频繁，请 10 分钟后重试' });
    }
    _forgotPwdRateLimit.set(forgotKey, { count: 1, lastAttempt: now });

    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱地址' });
        }
        
        const allUsers = db.users.getAll();
        const user = allUsers.find(u => u.email === email && u.emailVerified);
        
        if (!user) {
            return res.json({ message: '如果邮箱已绑定，重置链接已发送' });
        }
        
        const token = generateToken();
        const expiresAt = new Date(Date.now() + 3600000);
        
        db.passwordResetTokens.deleteByType(user.id, 'password_reset');
        
        db.passwordResetTokens.create({
            userId: user.id,
            token: token,
            type: 'password_reset',
            expiresAt: expiresAt.toISOString()
        });
        
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
        
        const resetToken = db.passwordResetTokens.getByToken(token);
        
        if (!resetToken || resetToken.type !== 'password_reset' || new Date(resetToken.expiresAt) <= new Date()) {
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
        
        const resetToken = db.passwordResetTokens.getByToken(token);
        
        if (!resetToken || resetToken.type !== 'password_reset' || new Date(resetToken.expiresAt) <= new Date()) {
            return res.status(400).json({ error: '链接无效或已过期' });
        }
        
        const user = db.users.getById(resetToken.user_id);
        
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const salt = crypto.randomBytes(16).toString('hex');
        db.users.update(resetToken.user_id, {
            password: CryptoJS.SHA256(salt + newPassword).toString(),
            password_salt: salt
        });

        // H-8 修复：密码重置后撤销该用户所有 refresh token
        db.refreshTokens.revokeByUserId(user.id);

        db.passwordResetTokens.delete(resetToken.id);
        
        res.json({ message: '密码重置成功，请使用新密码登录' });
    } catch (error) {
        res.status(500).json({ error: '重置失败' });
    }
});

module.exports = router;
