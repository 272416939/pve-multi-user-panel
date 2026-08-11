// server/routes/user-settings.js - 用户通知设置路由
// 安全设计：authMiddleware + 只操作 req.user.id + 字段白名单 + 速率限制

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
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
    var limit = await checkConfiguredRateLimit('notification_settings', 'settings:' + req.user.id);
    if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: limit.retryAfter });

    try {
        const db = require('../api/db');
        // B-1: 只操作 req.user.id 的记录，不接受 user_id 参数
        // 保存前取旧设置（审计 diff 用）
        const oldSettings = await db.userSettings.getByUserId(req.user.id);
        const settings = await db.userSettings.upsert(req.user.id, req.body);
        const newSettings = await db.userSettings.getByUserId(req.user.id);
        // 操作审计：通知设置变更（旧 vs 新 diff，只记实际变化的开关，如「邮件通知: 开→关」）
        try {
            const FIELD_LABELS = {
                email_notifications_enabled: '邮件通知', notify_vm_provisioned: 'VM开通通知',
                notify_lxc_provisioned: 'LXC开通通知', notify_account_password: '账号密码通知',
                notify_subnet_provisioned: '子网开通通知',
                notify_vm_refund: 'VM退款通知', notify_lxc_refund: 'LXC退款通知',
                notify_disk_purchase: '硬盘购买通知', notify_disk_resize: '硬盘扩容通知',
                notify_disk_renewal: '硬盘续费通知', notify_disk_refund: '硬盘退款通知',
                notify_disk_destroy_refund: '硬盘销毁退款通知', notify_recharge: '充值通知',
                notify_renewal: '续费通知', notify_expiry_reminder: '到期提醒通知',
                notify_expiry_alert: '到期预警通知', notify_backup_result: '备份结果通知'
            };
            const { auditLog } = require('../utils/audit-log');
            const { buildFieldDiff } = require('../utils/audit-diff');
            const fieldDefs = Object.keys(FIELD_LABELS).map(function (k) {
                return { key: k, label: FIELD_LABELS[k], bool: true };
            });
            const changes = buildFieldDiff(oldSettings, newSettings, fieldDefs);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'setting.notification', details: '更新通知设置；变更:' + changes.join(', '), req });
            }
        } catch (_) {}
        res.json(settings);
    } catch (e) {
        console.error('[user-settings] 更新通知设置失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// 获取用户界面模板偏好（'' = 跟随站点默认）+ 站点全局默认（供前端「跟随站点默认」即时应用）
router.get('/user/template', authMiddleware, async (req, res) => {
    try {
        const db = require('../api/db');
        var { UI_TEMPLATES } = require('../constants');
        var settings = await db.userSettings.getByUserId(req.user.id);
        var template = settings.template;
        // 兼容旧数据：非法值归一为跟随站点默认
        if (template !== '' && !UI_TEMPLATES.includes(template)) template = '';
        var siteDefault = await db.config.get('site:template') || 'default';
        if (!UI_TEMPLATES.includes(siteDefault)) siteDefault = 'default';
        res.json({ template: template || '', siteDefault: siteDefault });
    } catch (e) {
        console.error('[user-settings] 获取界面模板失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// 更新用户界面模板偏好（'' = 跟随站点默认，'default' / 'saas' = 个人固定）
router.put('/user/template', authMiddleware, async (req, res) => {
    // SEC-02: 速率限制 - 每用户 60 秒 30 次
    var limit = await checkConfiguredRateLimit('notification_settings', 'settings:' + req.user.id);
    if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: limit.retryAfter });

    try {
        const db = require('../api/db');
        var { UI_TEMPLATES } = require('../constants');
        var template = req.body && req.body.template;
        // B-1: 只操作 req.user.id 的记录，不接受 user_id 参数；白名单校验
        if (typeof template !== 'string' || (template !== '' && !UI_TEMPLATES.includes(template))) {
            return res.status(400).json({ error: '界面模板参数不合法' });
        }
        var settings = await db.userSettings.upsert(req.user.id, { template: template });
        var siteDefault = await db.config.get('site:template') || 'default';
        if (!UI_TEMPLATES.includes(siteDefault)) siteDefault = 'default';
        // 操作审计：界面模板偏好变更
        try {
            const { auditLog } = require('../utils/audit-log');
            var label = template === 'saas' ? 'SAAS企业风' : (template === 'default' ? '赛博霓虹' : '跟随站点默认');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'setting.template', resourceType: 'setting', resourceId: 'template', details: '更新界面模板偏好：' + label, req });
        } catch (_) {}
        res.json({ template: (settings && settings.template) || '', siteDefault: siteDefault });
    } catch (e) {
        console.error('[user-settings] 更新界面模板失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
