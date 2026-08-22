const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const QRCode = require('qrcode');
const otplib = require('otplib');
const db = require('../api/db');
const { JWT_SECRET, generateToken } = require('../utils/token');
const upload = require('../config/multer');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const getSiteUrl = require('../utils/site-url');
const { sendTemplateEmail } = require('../services/email-template');
const { hashPassword, verifyPassword, isStrongPassword } = require('../utils/password-hash');
const { getIpLocation, getIpLocations } = require('../services/ip-location');
const { invalidateDeviceCache, invalidateUserActiveCache, clearDeviceCache } = require('../middleware/auth');
const { sanitizeUser } = require('../utils/safe-error');
// 本地时间格式化统一走 utils/date.js（规范第八节：禁止 toISOString 直写）
const { formatLocalDate } = require('../utils/date');
const { isValidEmail } = require('../utils/email-validate');
// profileCache 单一来源在 services/profile-cache.js（admin-user 等模块共用失效入口），TTL=FRONTEND_CACHE_TTL
const { profileCache, invalidateProfile } = require('../services/profile-cache');
// 统一审计埋点（utils/audit-log.js 导出，route 内不复刻包装函数）
const { auditAction } = require('../utils/audit-log');

// M-1 修复：敏感操作二次验证（改密/换绑邮箱/重生成恢复码）
// 支持三种凭据（满足其一）：current_password 当前密码 / code 6 位 2FA 动态码 / code 恢复码（一次性）
// 返回 { ok, error? }；验证失败次数超过阈值时由调用方限速兜底
async function verifySensitiveAction(user, body, req) {
    var currentPassword = body.current_password || '';
    if (currentPassword) {
        var passwordOk = await verifyPassword(currentPassword, user.password, user.password_salt);
        if (passwordOk) return { ok: true };
    }

    var code = String(body.code || '');
    if (code) {
        // 2FA 动态码（仅对已启用 2FA 的用户）
        var secret = await db.twofa.getSecret(user.id);
        if (secret) {
            try {
                if (/^\d{6}$/.test(code) && otplib.verifySync({ token: code, secret }).valid) {
                    return { ok: true };
                }
            } catch (e) {}
        }
        // 恢复码（一次性，使用即作废）
        var recoveryCodes = await db.twofa.getUnusedRecoveryCodes(user.id);
        for (var rc of recoveryCodes) {
            if (code === rc.code) {
                await db.twofa.markRecoveryCodeUsed(code);
                return { ok: true };
            }
        }
    }

    // 验证失败统一文案，不区分密码/动态码，防止枚举
    return { ok: false, error: '验证失败：请提供正确的当前密码或 2FA 验证码' };
}

// 改密公共逻辑：哈希更新 + 撤销全部 refresh token + 清活跃状态/资料缓存
// 供 PUT /user/password 与 PUT /user/profile（兼容旧调用方）复用
async function changeUserPassword(userId, newPassword) {
    await db.users.update(userId, {
        password: await hashPassword(newPassword),
        password_salt: null,
        // C-2 修复：用户主动改密后清除强制改密标记
        must_change_password: 0
    });
    // H-8 修复：密码变更后撤销该用户所有 refresh token
    await db.refreshTokens.revokeByUserId(userId);
    // 批量撤销后清空设备缓存，否则旧 token 最长 60s 内仍能通过设备校验
    await clearDeviceCache();
    // 清除用户活跃状态缓存
    await invalidateUserActiveCache(userId);
    // 清除资料缓存
    await profileCache.del(String(userId));
}

router.post('/user/2fa/setup', authMiddleware, async (req, res) => {
    try {
        const user = await db.users.getById(req.user.id);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (await db.twofa.isEnabled(user.id)) {
            return res.status(400).json({ error: '2FA 已启用，请先禁用后再重新设置' });
        }

        const secret = otplib.generateSecret();
        await db.twofa.setSecret(user.id, secret);

        const siteName = await db.config.get('site:name') || 'PVE 多用户控制面板';
        const otpauth = otplib.generateURI({ issuer: siteName, label: user.username, secret, type: 'totp' });
        const qrcode = await QRCode.toDataURL(otpauth);

        res.json({ secret, qrcode });
    } catch (error) {
        console.error('获取 2FA 设置信息失败:', error.message);
        if (error.stack) console.error(error.stack);
        res.status(500).json({ error: '获取 2FA 设置信息失败' });
    }
});

router.post('/user/2fa/verify', authMiddleware, async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ error: '缺少验证码' });

        const secret = await db.twofa.getSecret(req.user.id);
        if (!secret) return res.status(400).json({ error: '请先获取 2FA 密钥' });

        const isValid = otplib.verifySync({ token: code, secret }).valid;
        if (!isValid) return res.status(400).json({ error: '验证码错误' });

        await db.twofa.enable(req.user.id);

        const codes = [];
        for (let i = 0; i < 8; i++) {
            codes.push(crypto.randomBytes(10).toString('hex').toUpperCase());
        }
        await db.twofa.deleteRecoveryCodes(req.user.id);
        await db.twofa.addRecoveryCodes(req.user.id, codes);

        await auditAction(req, 'security.2fa.enable', '启用二次验证');
        res.json({ message: '2FA 已启用', recovery_codes: codes });
    } catch (error) {
        console.error('启用 2FA 失败:', error.message);
        res.status(500).json({ error: '启用 2FA 失败' });
    }
});

router.post('/user/2fa/disable', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: '需要验证密码' });

        const user = await db.users.getById(req.user.id);
        let passwordMatch = await verifyPassword(password, user.password, user.password_salt);
        if (!passwordMatch) {
            return res.status(401).json({ error: '密码错误' });
        }

        await db.twofa.disable(req.user.id);
        await db.twofa.deleteRecoveryCodes(req.user.id);

        await auditAction(req, 'security.2fa.disable', '关闭二次验证');
        res.json({ message: '2FA 已禁用' });
    } catch (error) {
        res.status(500).json({ error: '禁用 2FA 失败' });
    }
});

router.get('/user/2fa/status', authMiddleware, async (req, res) => {
    const enabled = await db.twofa.isEnabled(req.user.id);
    const recoveryCount = await db.twofa.getUnusedRecoveryCodeCount(req.user.id);
    res.json({ enabled, recovery_count: recoveryCount });
});

router.get('/user/2fa/recovery-codes', authMiddleware, async (req, res) => {
    try {
        const codes = await db.twofa.getRecoveryCodes(req.user.id);
        res.json({ codes });
    } catch (error) {
        res.status(500).json({ error: '获取恢复码失败' });
    }
});

router.post('/user/2fa/recovery-codes/regenerate', authMiddleware, async (req, res) => {
    // M-1 修复：重生成恢复码需要二次验证（当前密码/2FA 动态码/恢复码）
    const user = await db.users.getById(req.user.id);
    if (!user) return res.status(404).json({ error: '用户不存在' });
    const secondary = await verifySensitiveAction(user, req.body, req);
    if (!secondary.ok) return res.status(403).json({ error: secondary.error });
    try {
        const newCodes = [];
        for (let i = 0; i < 8; i++) {
            newCodes.push(crypto.randomBytes(10).toString('hex').toUpperCase());
        }
        await db.twofa.deleteRecoveryCodes(req.user.id);
        await db.twofa.addRecoveryCodes(req.user.id, newCodes);
        await auditAction(req, 'security.recovery-codes', '重新生成恢复码');
        res.json({ message: '恢复码已重新生成', recovery_codes: newCodes });
    } catch (error) {
        res.status(500).json({ error: '重新生成恢复码失败' });
    }
});

router.post('/admin/user/:id/disable-2fa', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await db.users.getById(req.params.id);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        await db.twofa.disable(req.params.id);
        await db.twofa.deleteRecoveryCodes(req.params.id);
        // 操作审计：管理员禁用用户 2FA
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.user.disable-2fa', resourceType: 'user', resourceId: parseInt(req.params.id), details: '关闭 用户[' + user.username + '] 的2FA', req });
        } catch (e) {}
        res.json({ message: `已为用户 ${user.username} 禁用 2FA` });
    } catch (error) {
        res.status(500).json({ error: '禁用 2FA 失败' });
    }
});

router.get('/user/devices', authMiddleware, async (req, res) => {
    const devices = await db.refreshTokens.getByUserId(req.user.id);
    // UApiPro IP 归属地：批量查询（services/ip-location.js 统一实现，去重+缓存+容错；500ms 预算不阻塞列表）
    const locMap = await getIpLocations(devices.map(d => d.ip), { timeBudgetMs: 500 });
    devices.forEach(d => { d.ip_location = locMap[d.ip] || ''; });
    res.json(devices);
});

router.delete('/user/devices/:id', authMiddleware, async (req, res) => {
    const deviceId = parseInt(req.params.id);
    const device = await db.refreshTokens.getById(deviceId);
    if (!device || device.user_id !== req.user.id) {
        return res.status(404).json({ error: '设备不存在' });
    }
    await db.refreshTokens.revoke(deviceId);
    await invalidateDeviceCache(deviceId);
    // 操作审计：手动下线设备（含 IP 归属地）
    const loc = await getIpLocation(device.ip || '');
    await auditAction(req, 'security.device.logout', '下线设备[' + (device.device_name || '未知设备') + '] IP:' + (device.ip || '') + (loc ? ' 归属地:' + loc : ''));
    res.json({ message: '设备已下线' });
});

router.delete('/user/devices', authMiddleware, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const current = await db.refreshTokens.getByToken(refreshToken);
        if (current) {
            await db.refreshTokens.revokeByUserId(req.user.id, current.id);
            await clearDeviceCache();
            await auditAction(req, 'security.device.logout', '下线其他设备');
            return res.json({ message: '其他设备已下线' });
        }
    }
    await db.refreshTokens.revokeByUserId(req.user.id);
    await clearDeviceCache();
    await auditAction(req, 'security.device.logout', '下线全部设备');
    res.json({ message: '所有设备已下线' });
});

router.get('/user/profile', authMiddleware, async (req, res) => {
    try {
        const cached = await profileCache.get(String(req.user.id));
        if (cached) return res.json(cached);

        const user = await db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const safeUser = sanitizeUser(user);
        // balance 随对象一起缓存但允许脏值：前端余额显示全部走 /wallet/balance（直查 DB），
        // 余额写路径多为事务内直写 SQL 无统一入口，不为零消费字段逐路径补失效（见 services/profile-cache.js）
        await profileCache.set(String(req.user.id), safeUser);
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

router.get('/user/nav', authMiddleware, (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const items = [];

    if (isAdmin) {
        items.push({ id: 'vms', label: '虚拟机管理', href: 'admin?section=vms' });
        items.push({ id: 'lxc', label: 'LXC容器管理', href: 'admin?section=lxc' });
        items.push({ id: 'admin', label: '管理后台', href: 'admin?section=admin' });
    } else {
        items.push({ id: 'vms', label: '我的虚拟机', href: 'dashboard' });
        items.push({ id: 'lxc', label: '我的LXC容器', href: 'dashboard?section=lxc' });
    }

    items.push({ id: 'user-center', label: '用户中心', href: 'user-center' });

    res.json({ items });
});

router.put('/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = await db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const { username, password, bio } = req.body;

        // V6-L4 修复：强制改密未完成期间仅放行改密操作（authMiddleware 白名单放行本端点
        // 用于提交新密码），先改用户名/简介会绕过强制改密意图
        if (user.must_change_password && !password) {
            return res.status(403).json({ error: '请先完成强制修改密码后再修改个人资料', code: 'MUST_CHANGE_PASSWORD' });
        }

        // M-1 修复：修改密码必须二次验证（当前密码/2FA 动态码/恢复码）
        if (password) {
            // V6-M2 修复：改密必须过强度校验（首登强制改密弹窗走本端点，此前仅 /user/password
            // 有校验——同功能两条路径规则不一致，弱密码即可清除 must_change_password 标记）
            if (!isStrongPassword(password)) {
                return res.status(400).json({ error: '密码至少 8 位，且需包含大小写字母和特殊字符 (@#$%^&*!)' });
            }
            const secondary = await verifySensitiveAction(user, req.body, req);
            if (!secondary.ok) return res.status(403).json({ error: secondary.error });
        }
        
        const updates = {};
        
        if (username && username !== user.username) {
            const allUsers = await db.users.getAll();
            if (allUsers.find(u => u.username === username)) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            updates.username = username;
        }
        
        if (password) {
            await changeUserPassword(req.user.id, password);
        }
        
        if (bio !== undefined) {
            updates.bio = bio;
        }
        
        await db.users.update(req.user.id, updates);
        
        const updatedUser = await db.users.getById(req.user.id);
        const safeUser = sanitizeUser(updatedUser);
        await profileCache.del(String(req.user.id));
        // 操作审计：个人资料/简介编辑（改密单独走 password.reset.self，归「重置密码」分类）
        const changed = [];
        if (username && username !== user.username) changed.push('用户名');
        if (bio !== undefined) changed.push('个人简介');
        if (changed.length > 0) {
            await auditAction(req, 'setting.profile', '编辑个人资料：' + changed.join('、'));
        }
        if (password) {
            await auditAction(req, 'password.reset.self', '重置登录密码');
        }
        res.json({ message: '资料更新成功', user: safeUser });
    } catch (error) {
        res.status(500).json({ error: '更新资料失败' });
    }
});

// 用户主动重置密码（独立接口：密码强度校验 + 二次验证 + 独立审计）
// 前端个人设置「修改密码」卡片专用；审计归日志页「重置密码」分类
router.put('/user/password', authMiddleware, async (req, res) => {
    try {
        const { password } = req.body;

        // 密码强度校验（V6-M2 收敛：与注册/忘记密码共用 utils/password-hash 公共函数）
        if (!isStrongPassword(password)) {
            return res.status(400).json({ error: '密码至少 8 位，且需包含大小写字母和特殊字符 (@#$%^&*!)' });
        }

        const user = await db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // 二次验证：当前密码/2FA 动态码/恢复码（与换绑邮箱一致，防 token 泄露后改密接管账号）
        const secondary = await verifySensitiveAction(user, req.body, req);
        if (!secondary.ok) return res.status(403).json({ error: secondary.error });

        await changeUserPassword(req.user.id, password);
        // 操作审计：归「重置密码」分类
        await auditAction(req, 'password.reset.self', '重置登录密码');

        const updatedUser = await db.users.getById(req.user.id);
        const safeUser = sanitizeUser(updatedUser);
        res.json({ message: '密码重置成功，请使用新密码登录', user: safeUser });
    } catch (error) {
        console.error('重置密码失败', error);
        res.status(500).json({ error: '重置密码失败' });
    }
});

router.get('/user/memos', authMiddleware, async (req, res) => {
    try {
        const memos = await db.memos.getByUserId(req.user.id);
        res.json(memos);
    } catch (error) {
        res.status(500).json({ error: '获取备忘录失败' });
    }
});

router.post('/user/memos', authMiddleware, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        const newMemo = await db.memos.create({
            user_id: req.user.id,
            title: title || '',
            content: content || ''
        });
        
        await auditAction(req, 'setting.memo.create', '编辑备忘录[' + String(title || '无标题').substring(0, 30) + ']');
        res.json(newMemo);
    } catch (error) {
        res.status(500).json({ error: '创建备忘录失败' });
    }
});

router.put('/user/memos/:id', authMiddleware, async (req, res) => {
    try {
        const memoId = parseInt(req.params.id);
        const memo = await db.memos.getById(memoId);
        
        if (!memo || memo.user_id !== req.user.id) {
            return res.status(404).json({ error: '备忘录不存在' });
        }
        
        const { title, content } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        
        const updatedMemo = await db.memos.update(memoId, updates);
        await auditAction(req, 'setting.memo.update', '编辑备忘录[' + String(title !== undefined ? title : memo.title || '无标题').substring(0, 30) + ']');
        res.json({ message: '备忘录更新成功', memo: updatedMemo });
    } catch (error) {
        res.status(500).json({ error: '更新备忘录失败' });
    }
});

router.delete('/user/memos/:id', authMiddleware, async (req, res) => {
    try {
        const memoId = parseInt(req.params.id);
        const memo = await db.memos.getById(memoId);
        
        if (!memo || memo.user_id !== req.user.id) {
            return res.status(404).json({ error: '备忘录不存在' });
        }
        
        await db.memos.delete(memoId);
        await auditAction(req, 'setting.memo.delete', '删除备忘录[' + String(memo.title || '无标题').substring(0, 30) + ']');
        res.json({ message: '备忘录删除成功' });
    } catch (error) {
        res.status(500).json({ error: '删除备忘录失败' });
    }
});

router.post('/user/avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '请选择要上传的图片' });
        }

        // M-8: 上传后校验文件头魔数，防止伪造扩展名的恶意文件
        try {
            const fd = fs.openSync(req.file.path, 'r');
            const buf = Buffer.alloc(4);
            fs.readSync(fd, buf, 0, 4, 0);
            fs.closeSync(fd);

            const header = Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
            const validHeaders = ['89504E47', 'FFD8FF', '47494638', '52494646']; // PNG, JPEG, GIF, WebP
            if (!validHeaders.some(h => header.startsWith(h))) {
                fs.unlinkSync(req.file.path);
                return res.status(400).json({ error: '文件格式不合法（魔数不匹配）' });
            }
        } catch (e) {
            // 读不到文件时删除并报错
            if (req.file.path && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(400).json({ error: '文件校验失败，请重新上传' });
        }

        const user = await db.users.getById(req.user.id);
        if (!user) {
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: '用户不存在' });
        }

        if (user.avatar && user.avatar.startsWith('/images/')) {
            const oldPath = path.join(__dirname, '../../images', path.basename(user.avatar));
            if (fs.existsSync(oldPath)) {
                try {
                    fs.unlinkSync(oldPath);
                } catch (e) {
                    console.error('删除旧头像失败', e);
                }
            }
        }

        const avatarPath = `/images/${req.file.filename}`;
        await db.users.update(req.user.id, { avatar: avatarPath });
        // 失效 profileCache（修复头像更新后 60s 内仍返回旧 URL 的 bug）
        await profileCache.del(String(req.user.id));
        if (process.env.DEBUG === 'true') console.log('[avatar] 上传成功:', req.file.path, '→', avatarPath);

        const updatedUser = await db.users.getById(req.user.id);
        const safeUser = sanitizeUser(updatedUser);
        res.json({ message: '头像上传成功', avatar: avatarPath, user: safeUser });
    } catch (error) {
        console.error('上传头像失败', error);
        res.status(500).json({ error: '上传头像失败' });
    }
});

router.put('/user/email', authMiddleware, async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: '请提供邮箱地址' });
        }
        
        // 邮箱格式校验（单一来源 email-validate.js：收紧正则，拒绝末尾句点等 SMTP 不兼容格式）
        if (!isValidEmail(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }
        
        const user = await db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }

        // M-1 修复：换绑邮箱必须二次验证（当前密码/2FA 动态码/恢复码），防止 token 泄露后接管邮箱
        // 仅「换绑」（邮箱变更）要求二次验证；重发验证邮件（邮箱未变）不要求
        var isRebind = !user.email || user.email !== email;
        if (isRebind) {
            const secondary = await verifySensitiveAction(user, req.body, req);
            if (!secondary.ok) return res.status(403).json({ error: secondary.error });
        }

        // 限速：发送邮箱验证邮件统一按用户限速（重发/首次绑定/换绑，防邮件轰炸）
        // 放在二次验证之后、写库之前 —— 429 时不修改邮箱、不生成 token、不消耗 SMTP
        const emailRateLimit = await checkConfiguredRateLimit('email_verify', `ratelimit:email-verify:${req.user.id}`);
        if (!emailRateLimit.allowed) {
            return res.status(429).json({
                error: '验证邮件发送过于频繁，请稍后再试',
                retryAfter: emailRateLimit.retryAfter
            });
        }
        
        const allUsers = await db.users.getAll();
        const existingUser = allUsers.find(u => u.email === email && u.id !== req.user.id);
        if (existingUser) {
            return res.status(400).json({ error: '该邮箱已被使用' });
        }
        
        await db.users.update(req.user.id, { email, emailVerified: false });
        // 缓存 TTL 已延长到 1h，换绑/绑定邮箱后必须立即失效，否则用户中心一直显示旧邮箱
        await invalidateProfile(req.user.id);

        // 操作审计：邮箱变更埋点（换绑/首次绑定记录，重发验证不记录）
        // 场景显式枚举：换绑（已有邮箱且变更）→ setting.email.change；首次绑定（从未绑过）→ setting.email.bind
        if (user.email && user.email !== email) {
            await auditAction(req, 'setting.email.change', '换绑邮箱为：' + email);
        } else if (!user.email) {
            await auditAction(req, 'setting.email.bind', '绑定邮箱：' + email);
        }
        
        const verifyToken = generateToken();
        const expiresAt = new Date(Date.now() + 3600000);
        
        await db.passwordResetTokens.deleteByType(req.user.id, 'email_verify');
        
        await db.passwordResetTokens.create({
            userId: req.user.id,
            email,
            token: verifyToken,
            type: 'email_verify',
            expiresAt: formatLocalDate(expiresAt)
        });
        
        try {
            const verifyUrl = `${getSiteUrl(req)}/api/user/verify-email/${verifyToken}`;
            // 三种发信场景区分模板（显式枚举，禁止落入默认 else）：
            // 1. 换绑（已有邮箱且变更）→ 换绑验证模板，展示新邮箱 + 安全提醒
            // 2. 重发验证（已有邮箱且未变）→ 中性验证模板，不再出现注册文案
            // 3. 首次绑定（从未绑过邮箱）→ 注册欢迎验证模板
            var isEmailRebind = !!user.email && user.email !== email;
            var isResendVerify = !!user.email && user.email === email;
            var tplCode;
            if (isEmailRebind) {
                tplCode = 'email_verify_rebind';
            } else if (isResendVerify) {
                tplCode = 'email_verify_resend';
            } else {
                tplCode = 'email_verify_first';
            }
            // 邮箱验证邮件（模板: email_verify_*）走队列异步发送：
            // 发送失败本来就被下方 catch 吞掉（邮箱已保存，仍提示查收），同步等待无反馈价值；
            // 队列 3 次重试反而提升送达率，失败计入管理端队列统计。{site_name} 由渲染引擎注入
            await sendTemplateEmail(email, tplCode, { username: user.username, email: email, link: verifyUrl });
        } catch (emailError) {
            console.error('发送验证邮件失败，但邮箱已保存', emailError);
        }
        
        const updatedUser = await db.users.getById(req.user.id);
        const safeUser = sanitizeUser(updatedUser);
        res.json({ message: '邮箱绑定成功！请查收验证邮件', user: safeUser });
    } catch (error) {
        console.error('绑定邮箱失败', error);
        res.status(500).json({ error: '绑定邮箱失败' });
    }
});

router.get('/user/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const verifyRecord = await db.passwordResetTokens.getByToken(token);
        
        if (!verifyRecord || verifyRecord.type !== 'email_verify' || new Date(verifyRecord.expiresAt) <= new Date()) {
            const siteUrl = getSiteUrl(req) || '';
            return res.redirect(siteUrl + '/user-center?email_verified=0&reason=expired');
        }

        const user = await db.users.getById(verifyRecord.user_id);
        if (!user) {
            const siteUrl = getSiteUrl(req) || '';
            return res.redirect(siteUrl + '/user-center?email_verified=0&reason=user_not_found');
        }

        await db.users.update(verifyRecord.user_id, { emailVerified: true });
        // 失效 profileCache：否则用户中心 60s 内仍显示「未验证」（与头像上传失效模式一致）
        await profileCache.del(String(verifyRecord.user_id));
        await db.passwordResetTokens.delete(verifyRecord.id);

        const siteUrl = getSiteUrl(req) || '';
        res.redirect(siteUrl + '/user-center?email_verified=1');
    } catch (error) {
        console.error('验证邮箱失败', error);
        const siteUrl = getSiteUrl(req) || '';
        res.redirect(siteUrl + '/user-center?email_verified=0&reason=error');
    }
});

// WebSocket push ticket
router.get('/user/push-ticket', authMiddleware, async (req, res) => {
    try {
        const ticket = jwt.sign(
            { type: 'push', userId: req.user.id, username: req.user.username, role: req.user.role },
            JWT_SECRET,
            { expiresIn: '5m', algorithm: 'HS256' }
        );
        res.json({ ticket });
    } catch (error) {
        res.status(500).json({ error: '生成ticket失败' });
    }
});

module.exports = router;
