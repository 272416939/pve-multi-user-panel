const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const jwt = require('jsonwebtoken');
const otplib = require('otplib');
const db = require('../api/db');
const { JWT_SECRET, JWT_EXPIRES_IN, REFRESH_TOKEN_DAYS, generateToken, generateAccessToken, generateRefreshToken, generatePartialToken, generateCode } = require('../utils/token');
// 会话策略：勾选「7天内无需登录」→ 7天固定倒计时（登录时刻起算，刷新不顺延）；未勾选 → 2小时无操作退出
const { computeSessionDeadlineMs, isRefreshAllowed, computeNextExpiryMs, INACTIVITY_MS } = require('../utils/session-policy');
const getSiteUrl = require('../utils/site-url');
const { sendTemplateEmail } = require('../services/email-template');
const { isUsernameBlacklisted } = require('../utils/username-blacklist');
const { isValidEmail } = require('../utils/email-validate');
const tokenStore = require('../utils/token-store');
const { blacklistToken, invalidateDeviceCache, invalidateUserActiveCache, clearDeviceCache } = require('../middleware/auth');

const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { sanitizeUser } = require('../utils/safe-error');
const { hashPassword, verifyPassword, needsUpgrade, isStrongPassword } = require('../utils/password-hash');
// 本地时间格式化统一走 utils/date.js（规范第八节：禁止自写/复用 toISOString 直写）
const { formatLocalDate } = require('../utils/date');
const RATELIMIT_PREFIX = 'ratelimit:login:';

async function checkLoginRateLimit(ip, username) {
    const key = `${RATELIMIT_PREFIX}${ip}:${username}`;
    return checkConfiguredRateLimit('login', key);
}

// 登录日志埋点（成功/失败），写入失败不阻断登录流程
async function writeLoginLog(entry) {
    try {
        await db.loginLogs.create({
            user_id: entry.userId || 0,
            username: entry.username || '',
            ip: entry.ip || '',
            user_agent: entry.ua || '',
            status: entry.status || 'success',
            details: entry.details || null
        });
    } catch (e) {
        console.warn('[auth] 登录日志写入失败:', e.message);
    }
}

// 登录成功埋点：写登录日志 + 操作审计（details 结构化，展示时拼接归属地）
async function logLoginSuccess(user, req, deviceName) {
    const ua = req.headers['user-agent'] || '';
    const ip = req.ip;
    const ipWithPort = (req.socket && req.socket.remotePort) ? ip + ':' + req.socket.remotePort : ip;
    await writeLoginLog({ userId: user.id, username: user.username, ip, ua, status: 'success' });
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: user.id, username: user.username, action: 'user.login', details: { status: 'success', account: user.username, ip: ipWithPort, device: deviceName || ua.substring(0, 100) }, req });
    } catch (_) {}
}

router.post('/login', async (req, res) => {
    const { username, password, device_name, remember: rememberRaw } = req.body;
    // 勾选「7天内无需登录」标记（兼容 boolean / 1 / '1' 三种入参形态）
    const remember = (rememberRaw === true || rememberRaw === 1 || rememberRaw === '1') ? 1 : 0;
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
            return res.status(400).json({ error: '用户名或密码不正确，请核对信息后重试' });
        }
    } else {
        user = await db.users.getByUsername(username);
    }

    if (!user) {
        await writeLoginLog({ username: username, ip, ua: req.headers['user-agent'] || '', status: 'failed', details: '用户名不存在' });
        return res.status(401).json({ error: '用户名或密码不正确，请核对信息后重试' });
    }

    let passwordMatch = await verifyPassword(password, user.password, user.password_salt);

// Lazy migration: 旧格式密码验证成功后自动升级到 bcrypt
if (passwordMatch && needsUpgrade(user.password)) {
    const newHash = await hashPassword(password);
    await db.users.update(user.id, {
        password: newHash,
        password_salt: null  // bcrypt 自带盐，清除旧 salt
    });
}

    if (!passwordMatch) {
        await writeLoginLog({ userId: user.id, username: user.username, ip, ua: req.headers['user-agent'] || '', status: 'failed', details: '密码错误' });
        return res.status(401).json({ error: '用户名或密码不正确，请核对信息后重试' });
    }

    if (!user.is_active) {
        await writeLoginLog({ userId: user.id, username: user.username, ip, ua: req.headers['user-agent'] || '', status: 'failed', details: '账号已被禁用' });
        return res.status(403).json({ error: '账号已被禁用' });
    }

    // V6-H2 修复：2FA 开启的用户在第一步（仅验证密码）不下发任何可用会话凭证——
    // 此前第一步就创建并返回 refresh_token，仅持密码者可直接调 /auth/refresh 换取完整
    // 会话绕过 2FA；会话记录改到第二步验证通过后创建（同设备旧会话撤销也随之后移，
    // 避免仅持密码者用伪造 device_name 提前踢掉用户同设备会话）
    if (await db.twofa.isEnabled(user.id)) {
        const partialToken = generatePartialToken(user);
        const safeUser = sanitizeUser(user);
        return res.json({
            twofa_required: true,
            partial_token: partialToken,
            user: safeUser
        });
    }

    const refreshToken = generateRefreshToken();
    const ua = req.headers['user-agent'] || '';
    const deviceName = (device_name || ua.substring(0, 100));
    await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);

    // 会话策略：勾选 → 7天固定倒计时（锚点 login+7d，刷新不顺延）；未勾选 → 2小时无操作退出
    const nowMs = Date.now();
    const sessionDeadline = remember ? formatLocalDate(new Date(computeSessionDeadlineMs(nowMs))) : null;
    const record = await db.refreshTokens.create({
        user_id: user.id,
        token: refreshToken,
        device_name: deviceName,
        ip,
        user_agent: ua,
        created_at: formatLocalDate(new Date()),
        expires_at: remember ? sessionDeadline : formatLocalDate(new Date(nowMs + INACTIVITY_MS)),
        remember,
        session_deadline: sessionDeadline,
        last_active_at: formatLocalDate(new Date())
    });

    const token = generateAccessToken(user, record.id);

    const safeUser = sanitizeUser(user);
    // V3-14 修复：登录成功审计 + 登录日志
    await logLoginSuccess(user, req, deviceName);
    // P1-C2 修复：如果用户需要强制改密，在响应中标记
    if (user.must_change_password) {
        return res.json({ token, refreshToken, user: safeUser, must_change_password: true });
    }
    res.json({ token, refreshToken, user: safeUser });
});

router.post('/login/2fa', async (req, res) => {
    // AUTH-6 修复：解析 partial_token 获取 userId 作为限速 key，避免依赖前端传值导致 key 失效
    let rateLimitUserId = null;
    try {
        const decodedForLimit = jwt.verify(req.body.partial_token, JWT_SECRET, { algorithms: ['HS256'] });
        rateLimitUserId = decodedForLimit.id;
    } catch (err) {
        // 令牌无效，后续校验会拦截
    }

    const tfaLimit = await checkConfiguredRateLimit('login_2fa', `ratelimit:2fa:${req.ip}:${rateLimitUserId || 'unknown'}`);
    if (!tfaLimit.allowed) {
        return res.status(429).json({ error: '2FA 验证过于频繁，请稍后再试', retryAfter: tfaLimit.retryAfter });
    }

    const { partial_token, code, refresh_token: reqRefreshToken } = req.body;
    if (!partial_token || !code) {
        return res.status(400).json({ error: '缺少参数' });
    }
    // 2FA 第二步重建记录时沿用第一步勾选的「7天内无需登录」标记（前端 verifyTwofa 会带 remember）
    const remember = (req.body.remember === true || req.body.remember === 1 || req.body.remember === '1') ? 1 : 0;

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
        // V6-H2 修复：仅接受本用户的会话记录（防借用他人 token 顶替 device_id 签发访问令牌）
        if (!record || record.user_id !== user.id || record.revoked || new Date(record.expires_at) <= new Date()) {
            const ip = req.ip;
            const ua = req.headers['user-agent'] || '';
            const deviceName = ua.substring(0, 100);
            await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);
            refreshToken = generateRefreshToken();
            // 会话策略：勾选 → 7天固定倒计时；未勾选 → 2小时无操作退出
            const nowMs = Date.now();
            const sessionDeadline = remember ? formatLocalDate(new Date(computeSessionDeadlineMs(nowMs))) : null;
            record = await db.refreshTokens.create({
                user_id: user.id,
                token: refreshToken,
                device_name: deviceName,
                ip,
                user_agent: ua,
                created_at: formatLocalDate(new Date()),
                expires_at: remember ? sessionDeadline : formatLocalDate(new Date(nowMs + INACTIVITY_MS)),
                remember,
                session_deadline: sessionDeadline,
                last_active_at: formatLocalDate(new Date())
            });
        }

        // 2FA 验证通过：登录成功埋点
        await logLoginSuccess(user, req, (req.headers['user-agent'] || '').substring(0, 100));

        const token = generateAccessToken(user, record.id);
        const safeUser = sanitizeUser(user);
        if (user.must_change_password) {
            return res.json({ token, refreshToken, user: safeUser, must_change_password: true });
        }
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
            // V6-H2 修复：仅接受本用户的会话记录（与 TOTP 路径一致）
            if (!record || record.user_id !== user.id || record.revoked || new Date(record.expires_at) <= new Date()) {
                const ip = req.ip;
                const ua = req.headers['user-agent'] || '';
                const deviceName = ua.substring(0, 100);
                await db.refreshTokens.revokeByUserAndDevice(user.id, deviceName);
                refreshToken = generateRefreshToken();
                // V6-M1 修复：恢复码路径补全会话策略三字段（此前漏写致 last_active_at=NULL，
                // isRefreshAllowed 回退 created_at 又被每次刷新重置 → 2 小时无操作规则对该路径永不触发）
                const nowMs = Date.now();
                const sessionDeadline = remember ? formatLocalDate(new Date(computeSessionDeadlineMs(nowMs))) : null;
                record = await db.refreshTokens.create({
                    user_id: user.id,
                    token: refreshToken,
                    device_name: deviceName,
                    ip,
                    user_agent: ua,
                    created_at: formatLocalDate(new Date()),
                    expires_at: remember ? sessionDeadline : formatLocalDate(new Date(nowMs + INACTIVITY_MS)),
                    remember,
                    session_deadline: sessionDeadline,
                    last_active_at: formatLocalDate(new Date())
                });
            }
            // 恢复码验证通过：登录成功埋点
            await logLoginSuccess(user, req, (req.headers['user-agent'] || '').substring(0, 100));

            const token = generateAccessToken(user, record.id);
            const safeUser = sanitizeUser(user);
            if (user.must_change_password) {
                return res.json({ token, refreshToken, user: safeUser, must_change_password: true });
            }
            return res.json({ token, refreshToken, user: safeUser });
        }
    }

    await writeLoginLog({ userId: user.id, username: user.username, ip: req.ip, ua: req.headers['user-agent'] || '', status: 'failed', details: '2FA验证码错误' });
    return res.status(401).json({ error: '验证码错误' });
});

router.post('/auth/refresh', async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('refresh', 'ratelimit:refresh:' + req.ip);
        if (!rateLimitResult.allowed) return res.status(429).json({ error: '请求过于频繁，请稍后再试', retryAfter: rateLimitResult.retryAfter });

        const { refreshToken } = req.body;
        if (!refreshToken) return res.status(400).json({ error: '缺少 refreshToken' });

        // R3-1 修复：refreshToken 是纯随机字符串（非 JWT），直接用 DB 查询校验，移除无效的 jwt.verify
        const record = await db.refreshTokens.getByToken(refreshToken);
        // V6-H1 修复：已撤销（revoked）的 token 一律拒绝——登出/改密/管理员强制下线均只置
        // revoked=1 保留行至每日清理，此前漏检该项导致被撤销 token 仍可续期「复活」会话
        if (!record || !record.user_id || record.revoked) {
            return res.status(401).json({ error: 'refreshToken 已失效' });
        }

        // 会话策略门禁：未勾选且 2 小时无操作 / 勾选但已超 7 天且 2 小时无操作 → 拒绝续期，要求重新登录
        // （不区分勾选状态返回同一文案，防枚举会话类型）
        if (!isRefreshAllowed(record, Date.now())) {
            return res.status(401).json({ error: '登录已过期，请重新登录', code: 'TOKEN_EXPIRED' });
        }

        // 立即撤销旧 refresh token（防重放）
        await db.refreshTokens.deleteByToken(refreshToken);

        const user = await db.users.getById(record.user_id);
        if (!user || !user.is_active) {
            return res.status(401).json({ error: '用户不存在或已被禁用' });
        }

        // 签发新的 access token + 新的 refresh token
        const newRefreshToken = generateRefreshToken();

        // 勾选会话续期不延长 7 天锚点（固定倒计时，computeNextExpiryMs 恒返回原 deadline）；
        // 新记录继承旧记录的 remember / session_deadline / last_active_at——
        // last_active_at 不更新为当前时间（自动保活刷新不计活跃，2 小时无操作以真实业务请求为准）
        const nextExpiryMs = computeNextExpiryMs(record, Date.now());
        // V6-M1 修复：created_at 保留登录锚点不被刷新重置（设备页「登录时间」语义）；
        // last_active_at 为 NULL 的存量记录（恢复码路径历史数据）以旧 created_at 治愈，
        // 消除「回退 created_at + 刷新重置」叠加导致 2 小时无操作规则永不触发的旁路
        const newRecord = await db.refreshTokens.create({
            user_id: user.id,
            device_name: record.device_name,
            token: newRefreshToken,
            ip: req.ip,
            user_agent: req.headers['user-agent'] || '',
            created_at: record.created_at || formatLocalDate(new Date()),
            expires_at: formatLocalDate(new Date(nextExpiryMs)),
            remember: record.remember,
            session_deadline: record.session_deadline,
            last_active_at: record.last_active_at || record.created_at
        });

        // 用新记录的 id 生成 access token，确保设备校验通过
        const newAccessToken = generateAccessToken(user, newRecord.id);

        res.json({ token: newAccessToken, refreshToken: newRefreshToken });
    } catch (error) {
        console.error('[auth] refresh token 错误:', error.message);
        res.status(500).json({ error: 'token 刷新失败' });
    }
});

router.post('/logout', async (req, res) => {
    // L-12 修复：登出端点按 IP 限速（匿名可调，防 DoS；保持 token 过期也可登出）
    const logoutRate = await checkConfiguredRateLimit('logout', 'ratelimit:logout:' + req.ip);
    if (!logoutRate.allowed) {
        return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: logoutRate.retryAfter });
    }
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
    const forgotLimit = await checkConfiguredRateLimit('forgot', `ratelimit:forgot:${req.ip}`);
    if (!forgotLimit.allowed) {
        return res.status(429).json({ error: '密码重置邮件发送过于频繁，请稍后再试', retryAfter: forgotLimit.retryAfter });
    }

    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱地址' });
        }
        // 邮箱格式校验（单一来源 email-validate.js；格式非法直接 400，不进入用户枚举查询）
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
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

        // 密码重置邮件（模板: password_reset）走队列异步发送：
        // 响应文案统一防枚举、发送失败不反馈给用户，同步等待 SMTP 1-3s 纯拖慢接口无反馈价值；
        // 队列 3 次重试反而提升送达率，失败计入管理端队列统计
        await sendTemplateEmail(user.email, 'password_reset', { username: user.username, link: resetUrl });
        res.json({ message: '如果邮箱已绑定，重置链接已发送' });
    } catch (error) {
        res.status(500).json({ error: '请求失败' });
    }
});

router.get('/auth/reset-password/:token', async (req, res) => {
    try {
        const resetLimit = await checkConfiguredRateLimit('reset_pwd', `ratelimit:reset-pwd:${req.ip}`);
        if (!resetLimit.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: resetLimit.retryAfter });
        }

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
        const resetLimit = await checkConfiguredRateLimit('reset_pwd', `ratelimit:reset-pwd:${req.ip}`);
        if (!resetLimit.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: resetLimit.retryAfter });
        }

        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        
        // V6-M2 收敛：公共强度校验函数（与注册/改密一致）
        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ error: '密码至少8位，需包含大小写字母和特殊字符' });
        }
        
        const userId = await tokenStore.getResetToken(token);
        if (!userId) {
            return res.status(400).json({ error: '链接无效或已过期' });
        }

        const user = await db.users.getById(userId);

        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const hashedPassword = await hashPassword(newPassword);
        await db.users.update(userId, {
            password: hashedPassword,
            password_salt: null
        });

        // H-8 修复：密码重置后撤销该用户所有 refresh token
        await db.refreshTokens.revokeByUserId(userId);
        // 批量撤销后清空设备缓存，旧 token 立即失效
        await clearDeviceCache();
        // 清除用户活跃状态缓存，确保被禁用状态立即生效
        await invalidateUserActiveCache(userId);

        // 删除已使用的 token
        await tokenStore.delResetToken(token);

        // 操作审计：重置密码（未登录场景，userId 记被重置用户；D 类缺埋点补全）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: userId, username: user.username || '', action: 'password.reset', resourceType: 'user', resourceId: userId, details: '重置密码(账号:' + (user.username || '') + ')', req });
        } catch (e) {}

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

        // 邮箱格式校验（单一来源 email-validate.js）
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }

        // AUTH-9 修复：不泄露邮箱是否已注册，统一返回成功响应
        const existingUser = await db.users.getByEmail(email);
        if (existingUser) {
            return res.json({ success: true, message: '验证码已发送' });
        }

        // 限速1：同一邮箱 1 次/60 秒
        const emailLimit = await checkConfiguredRateLimit('register_code', `ratelimit:register-code:${email}`);
        if (!emailLimit.allowed) {
            return res.status(429).json({
                error: '验证码发送过于频繁，请稍后再试',
                retryAfter: emailLimit.retryAfter
            });
        }

        // 限速2：同一 IP 5 次/小时
        const ipLimit = await checkConfiguredRateLimit('register_code_ip', `ratelimit:register-code-ip:${req.ip}`);
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

        try {
            // 注册验证码邮件（模板: register_code，同步发送保证反馈；{site_name} 由渲染引擎注入）
            await sendTemplateEmail(email, 'register_code', { code: code }, { sync: true });
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
        const ipLimit = await checkConfiguredRateLimit('register', `ratelimit:register:${req.ip}`);
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
            return res.status(400).json({ error: '注册失败，请检查输入信息' });
        }

        // 校验密码强度（V6-M2 收敛：公共校验函数）
        if (!isStrongPassword(password)) {
            return res.status(400).json({ error: '密码必须至少 8 位，包含大小写字母和特殊字符' });
        }

        // 校验邮箱（单一来源 email-validate.js）
        if (!email || !isValidEmail(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }
        const existingEmail = await db.users.getByEmail(email);
        if (existingEmail) {
            return res.status(400).json({ error: '注册失败，请检查输入信息' });
        }

        // 校验验证码（通过 token-store，优先 Redis）
        const storedCode = await tokenStore.getRegisterCode(email);
        if (!storedCode || storedCode !== code) {
            return res.status(400).json({ error: '验证码错误或已过期' });
        }

        // 创建用户
        const hashedPassword = await hashPassword(password);
        const newUser = await db.users.create({
            username,
            password: hashedPassword,
            role: 'user',
            email,
            emailVerified: true
        });

        // 删除已使用的验证码
        await tokenStore.delRegisterCode(email);

        // 操作审计：用户自助注册（D 类缺埋点补全；action 映射见 db-messaging.js user_login 分类）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: newUser.id, username: username, action: 'user.register', resourceType: 'user', resourceId: newUser.id, details: '注册账号:' + username, req });
        } catch (e) {}

        res.json({ success: true, message: '注册成功，请登录' });
    } catch (error) {
        console.error('[register] 错误:', error.message);
        res.status(500).json({ error: '注册失败，请稍后重试' });
    }
});

module.exports = router;
