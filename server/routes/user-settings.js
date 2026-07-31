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
        res.json(settings);
    } catch (e) {
        console.error('[user-settings] 更新通知设置失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
