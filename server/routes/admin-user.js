const express = require('express');
const router = express.Router();
const CryptoJS = require('crypto-js');
const db = require('../api/db-sqlite');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

router.get('/users', authMiddleware, adminMiddleware, async (req, res) => {
    const users = db.users.getAll().map(({ password, ...rest }) => rest);
    res.json(users);
});

router.post('/users', authMiddleware, adminMiddleware, async (req, res) => {
    const { username, password, role, email, emailVerified } = req.body;
    const salt = CryptoJS.lib.WordArray.random(16).toString();
    const hashedPassword = CryptoJS.SHA256(salt + password).toString();
    
    if (db.users.getByUsername(username)) {
        return res.status(400).json({ error: '用户名已存在' });
    }
    
    if (email) {
        const allUsers = db.users.getAll();
        if (allUsers.find(u => u.email === email)) {
            return res.status(400).json({ error: '该邮箱已被使用' });
        }
    }
    
    const newUser = db.users.create({
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

    const userVms = db.vms.getByUserId(userId);
    for (const vm of userVms) {
        db.vms.delete(vm.id);
    }

    // M-3 修复：删除用户时同步清理 LXC 容器分配记录
    const userCts = db.lxcContainers.getByUserId(userId);
    for (const ct of userCts) {
        db.lxcContainers.delete(ct.id);
    }

    const userMemos = db.memos.getByUserId(userId);
    for (const memo of userMemos) {
        db.memos.delete(memo.id);
    }

    db.passwordResetTokens.deleteByUserId(userId);

    db.users.delete(userId);
    res.json({ message: '用户删除成功' });
});

router.put('/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const userId = parseInt(req.params.id);
    const { username, password, role, email, emailVerified } = req.body;
    
    const user = db.users.getById(userId);
    if (!user) {
        return res.status(404).json({ error: '用户不存在' });
    }
    
    const updates = {};
    
    if (username && username !== user.username) {
        const allUsers = db.users.getAll();
        if (allUsers.find(u => u.username === username)) {
            return res.status(400).json({ error: '用户名已存在' });
        }
        updates.username = username;
    }
    
    if (password) {
        const salt = CryptoJS.lib.WordArray.random(16).toString();
        updates.password = CryptoJS.SHA256(salt + password).toString();
        updates.password_salt = salt;
    }
    
    if (role) {
        updates.role = role;
    }
    
    if (email !== undefined) {
        if (email && email !== user.email) {
            const allUsers = db.users.getAll();
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
    
    db.users.update(userId, updates);
    
    res.json({ message: '用户更新成功' });
});

module.exports = router;
