const express = require('express');
const router = express.Router();
const db = require('../api/db-sqlite');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { loadSentRemindersFromDb, checkExpiredVms, checkExpiredLxc } = require('../services/expiry-check');
const pkg = require('../../package.json');
router.get('/admin/storage', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getStorageList();
        res.json(storages.map(s => ({ id: s.storage, type: s.type, path: s.path, content: s.content })));
    } catch (error) {
        res.status(500).json({ error: '获取存储列表失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.post('/check-expired', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await checkExpiredVms();
        await checkExpiredLxc();
        res.json({ message: '检查完成' });
    } catch (error) {
        console.error('手动检查失败:', error);
        res.status(500).json({ error: '检查失败' });
    }
});

router.get('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = db.config.getSmtp();
        const { password, ...configWithoutPassword } = config;
        res.json(configWithoutPassword);
    } catch (error) {
        console.error('获取 SMTP 配置失败:', error);
        res.status(500).json({ error: '获取配置失败' });
    }
});

router.put('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { host, port, secure, user, password, from, enabled } = req.body;
        
        db.config.setSmtp({
            host: host || '',
            port: port || 587,
            secure: !!secure,
            user: user || '',
            password: password !== undefined ? password : db.config.getSmtp().password,
            from: from || '',
            enabled: !!enabled
        });
        
        const { password: _, ...configWithoutPassword } = db.config.getSmtp();
        res.json({ message: '配置更新成功', config: configWithoutPassword });
    } catch (error) {
        console.error('更新 SMTP 配置失败:', error);
        res.status(500).json({ error: '更新配置失败' });
    }
});

router.post('/admin/smtp/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { testEmail } = req.body;
        if (!testEmail) {
            return res.status(400).json({ error: '请提供测试邮箱' });
        }
        
        const emailContent = `
            <p>您好，</p>
            <p>恭喜！您的 SMTP 配置测试成功！</p>
            <div class="divider"></div>
            <p>现在您可以正常使用邮件功能了，包括：</p>
            <ul style="margin-left: 20px; color: #4a5568;">
                <li>邮箱验证</li>
                <li>密码重置</li>
                <li>虚拟机到期提醒</li>
                <li>续费提醒</li>
            </ul>
        `;
        await sendEmail(testEmail, 'SMTP 配置测试', createEmailTemplate('测试邮件', emailContent));
        res.json({ message: '测试邮件发送成功' });
    } catch (error) {
        console.error('测试 SMTP 配置失败:', error);
        res.status(500).json({ error: '测试失败: ' + error.message });
    }
});

router.get('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = db.config.getReminder();
        res.json(config);
    } catch (error) {
        console.error('获取提醒配置失败:', error);
        res.status(500).json({ error: '获取配置失败' });
    }
});

router.put('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { days1, days2, days3 } = req.body;
        
        db.config.setReminder({
            days1: days1 !== undefined ? parseInt(days1) : 7,
            days2: days2 !== undefined ? parseInt(days2) : 3,
            days3: days3 !== undefined ? parseInt(days3) : 1
        });
        
        res.json({ message: '提醒配置更新成功', config: db.config.getReminder() });
    } catch (error) {
        console.error('更新提醒配置失败:', error);
        res.status(500).json({ error: '更新配置失败' });
    }
});

router.get('/version', (req, res) => {
    res.json({ version: pkg.version });
});


module.exports = router;
