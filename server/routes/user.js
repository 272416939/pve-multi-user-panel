const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const QRCode = require('qrcode');
const otplib = require('otplib');
const db = require('../api/db-sqlite');
const upload = require('../config/multer');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const getSiteUrl = require('../utils/site-url');
const { createEmailTemplate, sendEmail } = require('../utils/email');

const generateToken = require('../utils/token');

router.post('/user/2fa/setup', authMiddleware, async (req, res) => {
    try {
        const user = db.users.getById(req.user.id);
        if (!user) return res.status(404).json({ error: '用户不存在' });
        if (db.twofa.isEnabled(user.id)) {
            return res.status(400).json({ error: '2FA 已启用，请先禁用后再重新设置' });
        }

        const secret = otplib.generateSecret();
        db.twofa.setSecret(user.id, secret);

        const otpauth = otplib.generateURI({ issuer: 'PVE管理面板', label: user.username, secret, type: 'totp' });
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

        const secret = db.twofa.getSecret(req.user.id);
        if (!secret) return res.status(400).json({ error: '请先获取 2FA 密钥' });

        const isValid = otplib.verifySync({ token: code, secret }).valid;
        if (!isValid) return res.status(400).json({ error: '验证码错误' });

        db.twofa.enable(req.user.id);

        const codes = [];
        for (let i = 0; i < 8; i++) {
            codes.push(crypto.randomBytes(10).toString('hex').toUpperCase());
        }
        db.twofa.deleteRecoveryCodes(req.user.id);
        db.twofa.addRecoveryCodes(req.user.id, codes);

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

        const user = db.users.getById(req.user.id);
        let passwordMatch = false;
        if (user.password_salt && user.password_salt.length > 0) {
            const saltedHash = CryptoJS.SHA256(user.password_salt + password).toString();
            passwordMatch = (user.password === saltedHash);
        } else {
            const legacyHash = CryptoJS.SHA256(password).toString();
            passwordMatch = (user.password === legacyHash);
        }
        if (!passwordMatch) {
            return res.status(401).json({ error: '密码错误' });
        }

        db.twofa.disable(req.user.id);
        db.twofa.deleteRecoveryCodes(req.user.id);

        res.json({ message: '2FA 已禁用' });
    } catch (error) {
        res.status(500).json({ error: '禁用 2FA 失败' });
    }
});

router.get('/user/2fa/status', authMiddleware, async (req, res) => {
    const enabled = db.twofa.isEnabled(req.user.id);
    const recoveryCount = db.twofa.getUnusedRecoveryCodeCount(req.user.id);
    res.json({ enabled, recovery_count: recoveryCount });
});

router.get('/user/2fa/recovery-codes', authMiddleware, async (req, res) => {
    try {
        const codes = db.twofa.getRecoveryCodes(req.user.id);
        res.json({ codes });
    } catch (error) {
        res.status(500).json({ error: '获取恢复码失败' });
    }
});

router.post('/user/2fa/recovery-codes/regenerate', authMiddleware, async (req, res) => {
    try {
        const newCodes = [];
        for (let i = 0; i < 8; i++) {
            newCodes.push(crypto.randomBytes(10).toString('hex').toUpperCase());
        }
        db.twofa.deleteRecoveryCodes(req.user.id);
        db.twofa.addRecoveryCodes(req.user.id, newCodes);
        res.json({ message: '恢复码已重新生成', recovery_codes: newCodes });
    } catch (error) {
        res.status(500).json({ error: '重新生成恢复码失败' });
    }
});

router.post('/admin/user/:id/disable-2fa', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = db.users.getById(req.params.id);
        if (!user) return res.status(404).json({ error: '用户不存在' });

        db.twofa.disable(req.params.id);
        db.twofa.deleteRecoveryCodes(req.params.id);
        res.json({ message: `已为用户 ${user.username} 禁用 2FA` });
    } catch (error) {
        res.status(500).json({ error: '禁用 2FA 失败' });
    }
});

router.get('/user/devices', authMiddleware, async (req, res) => {
    const devices = db.refreshTokens.getByUserId(req.user.id);
    res.json(devices);
});

router.delete('/user/devices/:id', authMiddleware, async (req, res) => {
    const deviceId = parseInt(req.params.id);
    const device = db.refreshTokens.getById(deviceId);
    if (!device || device.user_id !== req.user.id) {
        return res.status(404).json({ error: '设备不存在' });
    }
    db.refreshTokens.revoke(deviceId);
    res.json({ message: '设备已下线' });
});

router.delete('/user/devices', authMiddleware, async (req, res) => {
    const { refreshToken } = req.body;
    if (refreshToken) {
        const current = db.refreshTokens.getByToken(refreshToken);
        if (current) {
            db.refreshTokens.revokeByUserId(req.user.id, current.id);
            return res.json({ message: '其他设备已下线' });
        }
    }
    db.refreshTokens.revokeByUserId(req.user.id);
    res.json({ message: '所有设备已下线' });
});

router.get('/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const { password, ...safeUser } = user;
        res.json(safeUser);
    } catch (error) {
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

router.get('/user/nav', authMiddleware, (req, res) => {
    const isAdmin = req.user.role === 'admin';
    const items = [];

    if (isAdmin) {
        items.push({ id: 'vms', label: '虚拟机管理', href: 'admin.html?section=vms' });
        items.push({ id: 'lxc', label: 'LXC容器管理', href: 'admin.html?section=lxc' });
        items.push({ id: 'admin', label: '管理后台', href: 'admin.html?section=admin' });
    } else {
        items.push({ id: 'vms', label: '我的虚拟机', href: 'dashboard.html' });
        items.push({ id: 'lxc', label: '我的LXC容器', href: 'dashboard.html?section=lxc' });
    }

    items.push({ id: 'user-center', label: '用户中心', href: 'user-center.html' });

    res.json({ items });
});

router.put('/user/profile', authMiddleware, async (req, res) => {
    try {
        const user = db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const { username, password, bio } = req.body;
        const updates = {};
        
        if (username && username !== user.username) {
            const allUsers = db.users.getAll();
            if (allUsers.find(u => u.username === username)) {
                return res.status(400).json({ error: '用户名已存在' });
            }
            updates.username = username;
        }
        
        if (password) {
            const salt = crypto.randomBytes(16).toString('hex');
            updates.password = CryptoJS.SHA256(salt + password).toString();
            updates.password_salt = salt;
            // C-2 修复：用户主动改密后清除强制改密标记
            updates.must_change_password = 0;
            // H-8 修复：密码变更后撤销该用户所有 refresh token
            db.refreshTokens.revokeByUserId(req.user.id);
        }
        
        if (bio !== undefined) {
            updates.bio = bio;
        }
        
        db.users.update(req.user.id, updates);
        
        const updatedUser = db.users.getById(req.user.id);
        const { password: _, ...safeUser } = updatedUser;
        res.json({ message: '资料更新成功', user: safeUser });
    } catch (error) {
        res.status(500).json({ error: '更新资料失败' });
    }
});

router.get('/user/memos', authMiddleware, async (req, res) => {
    try {
        const memos = db.memos.getByUserId(req.user.id);
        res.json(memos);
    } catch (error) {
        res.status(500).json({ error: '获取备忘录失败' });
    }
});

router.post('/user/memos', authMiddleware, async (req, res) => {
    try {
        const { title, content } = req.body;
        
        const newMemo = db.memos.create({
            user_id: req.user.id,
            title: title || '',
            content: content || ''
        });
        
        res.json(newMemo);
    } catch (error) {
        res.status(500).json({ error: '创建备忘录失败' });
    }
});

router.put('/user/memos/:id', authMiddleware, async (req, res) => {
    try {
        const memoId = parseInt(req.params.id);
        const memo = db.memos.getById(memoId);
        
        if (!memo || memo.user_id !== req.user.id) {
            return res.status(404).json({ error: '备忘录不存在' });
        }
        
        const { title, content } = req.body;
        const updates = {};
        if (title !== undefined) updates.title = title;
        if (content !== undefined) updates.content = content;
        
        const updatedMemo = db.memos.update(memoId, updates);
        res.json({ message: '备忘录更新成功', memo: updatedMemo });
    } catch (error) {
        res.status(500).json({ error: '更新备忘录失败' });
    }
});

router.delete('/user/memos/:id', authMiddleware, async (req, res) => {
    try {
        const memoId = parseInt(req.params.id);
        const memo = db.memos.getById(memoId);
        
        if (!memo || memo.user_id !== req.user.id) {
            return res.status(404).json({ error: '备忘录不存在' });
        }
        
        db.memos.delete(memoId);
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
            if (!validHeaders.includes(header)) {
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

        const user = db.users.getById(req.user.id);
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
        db.users.update(req.user.id, { avatar: avatarPath });
        console.log('[avatar] 上传成功:', req.file.path, '→', avatarPath);

        const updatedUser = db.users.getById(req.user.id);
        const { password: _, ...safeUser } = updatedUser;
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
        
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.status(400).json({ error: '邮箱格式不正确' });
        }
        
        const user = db.users.getById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        const allUsers = db.users.getAll();
        const existingUser = allUsers.find(u => u.email === email && u.id !== req.user.id);
        if (existingUser) {
            return res.status(400).json({ error: '该邮箱已被使用' });
        }
        
        db.users.update(req.user.id, { email, emailVerified: false });
        
        const verifyToken = generateToken();
        const expiresAt = new Date(Date.now() + 3600000);
        
        db.passwordResetTokens.deleteByType(req.user.id, 'email_verify');
        
        db.passwordResetTokens.create({
            userId: req.user.id,
            email,
            token: verifyToken,
            type: 'email_verify',
            expiresAt: expiresAt.toISOString()
        });
        
        try {
            const verifyUrl = `${getSiteUrl(req)}?verifyEmail=${verifyToken}`;
            const emailContent = `
                <p>您好，</p>
                <p>感谢您注册 PVE 多用户控制面板！</p>
                <p>请点击下方按钮验证您的邮箱地址：</p>
                <p style="text-align: center;">
                    <a href="${verifyUrl}" class="btn" target="_blank">验证邮箱地址</a>
                </p>
                <div class="divider"></div>
                <p style="color: #718096; font-size: 14px;">
                    如果按钮无法点击，请复制以下链接到浏览器：<br>
                    <a href="${verifyUrl}" style="word-break: break-all;">${verifyUrl}</a>
                </p>
                <div class="info-box">
                    <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快验证。</p>
                </div>
            `;
            await sendEmail(
                email,
                '邮箱验证 - PVE 管理面板',
                createEmailTemplate('请验证您的邮箱', emailContent)
            );
        } catch (emailError) {
            console.error('发送验证邮件失败，但邮箱已保存', emailError);
        }
        
        const updatedUser = db.users.getById(req.user.id);
        const { password: _, ...safeUser } = updatedUser;
        res.json({ message: '邮箱绑定成功！请查收验证邮件', user: safeUser });
    } catch (error) {
        console.error('绑定邮箱失败', error);
        res.status(500).json({ error: '绑定邮箱失败' });
    }
});

router.get('/user/verify-email/:token', async (req, res) => {
    try {
        const { token } = req.params;
        
        const verifyRecord = db.passwordResetTokens.getByToken(token);
        
        if (!verifyRecord || verifyRecord.type !== 'email_verify' || new Date(verifyRecord.expiresAt) <= new Date()) {
            return res.status(400).json({ error: '验证链接无效或已过期' });
        }
        
        const user = db.users.getById(verifyRecord.user_id);
        if (!user) {
            return res.status(404).json({ error: '用户不存在' });
        }
        
        db.users.update(verifyRecord.user_id, { emailVerified: true });
        db.passwordResetTokens.delete(verifyRecord.id);
        
        res.json({ message: '邮箱验证成功！' });
    } catch (error) {
        console.error('验证邮箱失败', error);
        res.status(500).json({ error: '验证失败' });
    }
});

module.exports = router;
