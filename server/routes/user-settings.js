// server/routes/user-settings.js - 用户通知设置路由
// 安全设计：authMiddleware + 只操作 req.user.id + 字段白名单 + 速率限制

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { checkRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');

// 获取用户通知设置
router.get('/user/notification-settings', authMiddleware, async (req, res) => {
    try {
        const db = require('../api/db');
        const settings = await db.userSettings.getByUserId(req.user.id);
        res.json(settings);
    } catch (e) {
        console.error('[user-settings] 获取通知设置失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// 更新用户通知设置（支持部分更新，自动保存）
router.put('/user/notification-settings', authMiddleware, async (req, res) => {
    // SEC-02: 速率限制 - 每用户 60 秒 30 次
    var limit = await checkRateLimit('settings:' + req.user.id, 30, 60000);
    if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试' });

    try {
        const db = require('../api/db');
        // B-1: 只操作 req.user.id 的记录，不接受 user_id 参数
        const settings = await db.userSettings.upsert(req.user.id, req.body);
        // 操作审计：通知设置变更（打开/关闭具体通知）
        try {
            const FIELD_LABELS = {
                email_notifications_enabled: '邮件通知', notify_vm_provisioned: 'VM开通通知',
                notify_lxc_provisioned: 'LXC开通通知', notify_account_password: '账号密码通知',
                notify_vm_refund: 'VM退款通知', notify_lxc_refund: 'LXC退款通知',
                notify_disk_purchase: '硬盘购买通知', notify_disk_resize: '硬盘扩容通知',
                notify_disk_renewal: '硬盘续费通知', notify_disk_refund: '硬盘退款通知',
                notify_disk_destroy_refund: '硬盘销毁退款通知', notify_recharge: '充值通知',
                notify_renewal: '续费通知', notify_expiry_reminder: '到期提醒通知',
                notify_expiry_alert: '到期预警通知', notify_backup_result: '备份结果通知'
            };
            const changed = [];
            for (var key of Object.keys(req.body || {})) {
                if (!FIELD_LABELS[key]) continue;
                changed.push((req.body[key] ? '打开' : '关闭') + '[' + FIELD_LABELS[key] + ']');
            }
            if (changed.length > 0) {
                const { auditLog } = require('../utils/audit-log');
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'setting.notification', details: '更新通知设置：' + changed.join('、'), req });
            }
        } catch (_) {}
        res.json(settings);
    } catch (e) {
        console.error('[user-settings] 更新通知设置失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
