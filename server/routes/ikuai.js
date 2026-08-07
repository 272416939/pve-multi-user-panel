const express = require('express');
const router = express.Router();
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');

// 用户侧：MAC 分组列表（无需 admin，用于套餐订购时选择分组）
router.get('/mac-groups', authMiddleware, async (req, res) => {
    try {
        // L-12 修复：外呼爱快接口必须限速（admin 可配置）
        const rate = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-query:' + req.user.id);
        if (!rate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', retryAfter: rate.retryAfter });
        if (!ikuaiApi.isConfigured()) return res.json([]);
        res.json(await ikuaiApi.getMacGroups());
    } catch (e) {
        console.error('[ikuai] 获取MAC分组失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/ikuai/mac-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // L-12 修复：外呼爱快接口必须限速（admin 可配置）
        const rate = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-query:' + req.user.id);
        if (!rate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', retryAfter: rate.retryAfter });
        if (!ikuaiApi.isConfigured()) {
            return res.json([]);
        }
        const groups = await ikuaiApi.getMacGroups();
        res.json(groups);
    } catch (e) {
        console.error('[ikuai] 获取MAC分组失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
