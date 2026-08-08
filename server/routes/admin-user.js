const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const db = require('../api/db');
const { authMiddleware, adminMiddleware, invalidateUserActiveCache } = require('../middleware/auth');
const cacheStore = require('../utils/cache-store');
const { isUsernameBlacklisted } = require('../utils/username-blacklist');
const { generateOrderNo } = require('../utils/order-utils');
const { withTransaction } = require('../utils/with-transaction');
const { safeError } = require('../utils/safe-error');
const { hashPassword, verifyPassword } = require('../utils/password-hash');
// 用户列表缓存（30s TTL，低频变更场景）
const userListCache = cacheStore.create('admin_users', 30);

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
  try {
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

    const hashedPassword = await hashPassword(password);

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
        role: role || 'user',
        email: email || '',
        emailVerified: !!emailVerified
    });
    
    // 操作审计：管理员创建用户
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.user.create', resourceType: 'user', resourceId: newUser.id, details: '创建用户:' + username + '(角色:' + (role || 'user') + (email ? ',邮箱:' + email : '') + ')', req });
    } catch (_) {}
    
    const { password: _, password_salt: __, totp_secret: ___, ...safeUser } = newUser;
    await userListCache.del('list');
    res.json(safeUser);
  } catch (e) {
    console.error('[admin] create user error:', e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);

    if (parseInt(req.params.id) === req.user.id) {
        return res.status(400).json({ error: '不能删除自己的账号' });
    }

    // V3-14 修复：删除用户审计（对齐创建/修改/重置密码的字符串 details 规范）
    try {
        const { auditLog } = require('../utils/audit-log');
        const targetUser = await db.users.getById(userId);
        await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.user.delete', resourceType: 'user', resourceId: userId, details: '删除用户[' + (targetUser ? targetUser.username : userId) + ']', req });
    } catch (_) {}

    // ARCH-11: 级联删除放入事务，保证原子性
    await withTransaction(async (conn) => {
        await conn.execute('DELETE FROM vms WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM lxc_containers WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM memos WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM recovery_codes WHERE user_id = ?', [userId]);
        await conn.execute('DELETE FROM users WHERE id = ?', [userId]);
    });
    await userListCache.del('list');
    await invalidateUserActiveCache(userId);
    res.json({ message: '用户删除成功' });
  } catch (e) {
    console.error('[admin] delete user error:', e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
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
        updates.password = await hashPassword(password);
        updates.password_salt = null;
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
    // 操作审计：管理员修改用户资料（角色/用户名/邮箱变更摘要；密码重置单独记 password.reset.admin）
    try {
        var changeParts = [];
        if (updates.username) changeParts.push('用户名:' + user.username + '→' + updates.username);
        if (updates.role) changeParts.push('角色:' + user.role + '→' + updates.role);
        if (updates.email !== undefined && String(updates.email) !== String(user.email)) changeParts.push('邮箱:' + user.email + '→' + updates.email);
        const { auditLog } = require('../utils/audit-log');
        if (changeParts.length > 0) {
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.user.update', resourceType: 'user', resourceId: userId, details: '修改用户[' + (user.username || userId) + ']:' + changeParts.join(','), req });
        }
    } catch (_) {}
    // 操作审计：管理员重置用户密码（记录到管理员自己的操作日志）
    if (password) {
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'password.reset.admin', resourceType: 'user', resourceId: userId, details: '重置用户[' + (user.username || userId) + ']密码', req });
        } catch (_) {}
    }
    res.json({ message: '用户更新成功' });
  } catch (e) {
    console.error('[admin] update user error:', e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

// 管理员手动为用户充值
router.post('/users/:id/recharge', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var userId = parseInt(req.params.id);
        var amount = parseFloat(req.body.amount);

        if (!amount || amount <= 0 || !isFinite(amount)) {
            return res.status(400).json({ error: '充值金额必须为正数' });
        }
        // L-3 修复：人工充值金额上限（与 pay:max_amount 默认值一致，防误填超大值）
        var maxRecharge = parseFloat(await db.config.get('pay:max_amount')) || 999999.99;
        if (amount > maxRecharge) {
            return res.status(400).json({ error: '单次充值金额不能超过 ' + maxRecharge.toFixed(2) });
        }

        var user = await db.users.getById(userId);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        var oldBalance = parseFloat(user.balance || '0');
        var newBalance = oldBalance + amount;
        // PAY-6 修复：原子余额增量更新
        await db.users.incrementBalance(userId, amount);

        var orderNo = generateOrderNo('syspay');

        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: db.now(),
            pay_method: 'manual', trade_type: 'admin_recharge',
            amount: amount.toFixed(2),
            period: 'month', period_count: 1,
            balance_before: oldBalance.toFixed(2),
            balance_after: newBalance.toFixed(2),
            trade_no: '', api_trade_no: ''
        });

        // 操作审计：人工充值（资金操作，含金额与前后余额）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.user.recharge', resourceType: 'user', resourceId: userId, details: '人工充值:用户[' + (user.username || userId) + '] +¥' + amount.toFixed(2) + ',余额 ¥' + oldBalance.toFixed(2) + '→¥' + newBalance.toFixed(2), req });
        } catch (_) {}

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
