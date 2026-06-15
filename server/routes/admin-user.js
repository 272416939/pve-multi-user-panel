const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    const users = (await db.users.getAll()).map(({ password, ...rest }) => rest);
    res.json(users);
});

router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, password, role, email, emailVerified } = req.body;
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
    
    const { password: _, ...safeUser } = newUser;
    res.json(safeUser);
});

router.delete('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id);

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

    await db.users.delete(userId);
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
        const salt = crypto.randomBytes(16).toString('hex');
        updates.password = CryptoJS.SHA256(salt + password).toString();
        updates.password_salt = salt;
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
        await db.users.update(userId, { balance: newBalance.toFixed(2) });

        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ADMIN_RECHARGE_' + dateStr + '_' + String(Math.floor(Math.random() * 900000 + 100000));

        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString().slice(0, 19).replace('T', ' '),
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
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
