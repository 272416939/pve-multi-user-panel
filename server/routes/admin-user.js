const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const db = require('../api/db');
const { authMiddleware, adminMiddleware, invalidateUserActiveCache } = require('../middleware/auth');
const cacheStore = require('../utils/cache-store');
const { isUsernameBlacklisted } = require('../utils/username-blacklist');
// 用户列表缓存（30s TTL，低频变更场景）
const userListCache = cacheStore.create('admin_users', 30);

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var hasQuery = req.query.page || req.query.keyword || req.query.role;
        if (hasQuery) {
            var page = parseInt(req.query.page) || 1;
            var limit = parseInt(req.query.limit) || 20;
            var keyword = (req.query.keyword || '').trim();
            var role = req.query.role || '';
            if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });
            if (role && !['admin', 'user'].includes(role)) return res.status(400).json({ error: '无效的角色' });
            var result = await db.users.getPaginated({ page: page, limit: limit, keyword: keyword, role: role });
            result.rows = result.rows.map(({ password, password_salt, totp_secret, ...rest }) => rest);
            return res.json(result);
        }
        const cached = await userListCache.get('list');
        if (cached) return res.json(cached);
        const users = (await db.users.getAll()).map(({ password, password_salt, totp_secret, ...rest }) => rest);
        await userListCache.set('list', users);
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: '获取用户列表失败' });
    }
});

router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, password, role, email, emailVerified } = req.body;

    if (!password) {
        return res.status(400).json({ error: '密码不能为空' });
    }

    if (role && !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
    }

    // AUTH-14 修复：用户名黑名单 + 长度校验
    if (!username || username.length < 3 || username.length > 32) {
        return res.status(400).json({ error: '用户名长度必须为 3-32 个字符' });
    }
    if (isUsernameBlacklisted(username)) {
        return res.status(400).json({ error: '该用户名不可用' });
    }

    // AUTH-14 修复：密码强度校验
    if (password.length < 8) {
        return res.status(400).json({ error: '密码至少8位' });
    }

    // AUTH-14 修复：邮箱格式校验
    if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hashedPassword = CryptoJS.SHA256(salt + password).toString();
    
    if (await db.users.getByUsername(username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }
    
    if (email) {
        const allUsers = await db.users.getAll();
        if (allUsers.find(u => u.email === email)) {
            return res.status(400).json({ error: '该邮箱已被使用' });
        }
    }
    
    const newUser = await db.users.create({
        username,
        password: hashedPassword,
        password_salt: salt,
        role: role || 'user',
        email: email || '',
        emailVerified: !!emailVerified
    });
    
    const { password: _, password_salt: __, totp_secret: ___, ...safeUser } = newUser;
    await userListCache.del('list');
    res.json(safeUser);
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id);

    if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: '不能删除自己的账号' });
    }

    const userVms = await db.vms.getByUserId(userId);
    for (const vm of userVms) {
        await db.vms.delete(vm.id);
    }

    // M-3 修复：删除用户时同步清理 LXC 容器分配记录
    const userCts = await db.lxcContainers.getByUserId(userId);
    for (const ct of userCts) {
        await db.lxcContainers.delete(ct.id);
    }

    const userMemos = await db.memos.getByUserId(userId);
    for (const memo of userMemos) {
        await db.memos.delete(memo.id);
    }

    await db.passwordResetTokens.deleteByUserId(userId);

    await db.refreshTokens.revokeByUserId(userId);
    if (db.recoveryCodes) await db.recoveryCodes.deleteByUserId(userId);

    await db.users.delete(userId);
    await userListCache.del('list');
    await invalidateUserActiveCache(userId);
    res.json({ message: '用户删除成功' });
});

router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, password, role, email, emailVerified } = req.body;
    
    const user = await db.users.getById(userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
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
        if (password.length < 8) {
            return res.status(400).json({ error: '密码至少8位' });
        }
        const salt = crypto.randomBytes(16).toString('hex');
        updates.password = CryptoJS.SHA256(salt + password).toString();
        updates.password_salt = salt;
        await db.refreshTokens.revokeByUserId(parseInt(req.params.id));
    }

    if (role && !['admin', 'user'].includes(role)) {
        return res.status(400).json({ error: '无效的角色' });
    }
    if (role && parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: '不能修改自己的角色' });
    }
    if (role) {
        updates.role = role;
    }
    
    if (email !== undefined) {
        if (email && email !== user.email) {
            const allUsers = await db.users.getAll();
            if (allUsers.find(u => u.email === email && u.id !== userId)) {
                return res.status(400).json({ error: '该邮箱已被使用' });
            }
            updates.email = email;
            updates.emailVerified = false;
        } else if (email === '') {
            updates.email = '';
            updates.emailVerified = false;
        }
    }
    
    if (emailVerified !== undefined) {
        updates.emailVerified = emailVerified;
    }
    
    await db.users.update(userId, updates);
    await userListCache.del('list');
    await invalidateUserActiveCache(userId);
    res.json({ message: '用户更新成功' });
});

// 管理员手动为用户充值
router.post('/users/:id/recharge', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var userId = parseInt(req.params.id);
        var amount = parseFloat(req.body.amount);

        if (!amount || amount <= 0 || !isFinite(amount)) {
            return res.status(400).json({ error: '充值金额必须为正数' });
        }

        var user = await db.users.getById(userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        var oldBalance = parseFloat(user.balance || '0');
        var newBalance = oldBalance + amount;
        // PAY-6 修复：原子余额增量更新
        await db.users.incrementBalance(userId, amount);

        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ADMIN_RECHARGE_' + dateStr + '_' + crypto.randomBytes(4).toString('hex');

        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: db.now(),
            pay_method: 'manual', trade_type: 'admin_recharge',
            amount: amount.toFixed(2),
            period: 'month', period_count: 1,
            balance_before: oldBalance.toFixed(2),
            balance_after: newBalance.toFixed(2),
            trade_no: '', api_trade_no: ''
        });

        try {
            await db.messages.create({
                uid: userId, title: '余额充值成功',
                content: '管理员为您充值 ¥' + amount.toFixed(2) + '，当前余额：¥' + newBalance.toFixed(2) + '。',
                type: 1, is_read: 0, send_type: 1
            });
        } catch (e) { console.error('[admin] recharge message failed', e); }

        res.json({ success: true, balance: newBalance.toFixed(2), message: '充值成功' });
    } catch (e) {
        console.error('[admin] recharge error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
