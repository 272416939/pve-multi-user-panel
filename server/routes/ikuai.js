const express = require('express');
const router = express.Router();
// 多节点：MAC 分组按节点取客户端——?node_id=（PVE 节点 id）解析其配对爱快；缺省=默认爱快节点
const { getIkuaiClient, getIkuaiClientForPve } = require('../api/ikuai-clients');
const { findEnabledNode } = require('../utils/locate-asset');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');

// 用户侧：MAC 分组列表（无需 admin，用于套餐订购时选择分组）
router.get('/mac-groups', authMiddleware, async (req, res) => {
    try {
        // L-12 修复：外呼爱快接口必须限速（admin 可配置）
        const rate = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-query:' + req.user.id);
        if (!rate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: rate.retryAfter });
        // 多节点：传 ?node_id= 时校验节点有效并按配对爱快取分组（订购页/分配表单按区域联动）
        let ikuaiApi;
        if (req.query.node_id !== undefined && req.query.node_id !== '') {
            const nodeRow = await findEnabledNode(req.query.node_id);
            if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
            ikuaiApi = await getIkuaiClientForPve(nodeRow.id);
        } else {
            ikuaiApi = await getIkuaiClient(null); // 缺省：默认爱快节点
        }
        // 配置惰性加载（面板 DB 优先 + .env 迁移），加载后同步判断
        await ikuaiApi.ensureConfig();
        if (!ikuaiApi.isConfigured()) return res.json([]);
        res.json(await ikuaiApi.getMacGroups());
    } catch (e) {
        console.error('[ikuai] 获取MAC分组失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.get('/ikuai/mac-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // L-12 修复：外呼爱快接口必须限速（admin 可配置）
        const rate = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-query:' + req.user.id);
        if (!rate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: rate.retryAfter });
        let ikuaiApi;
        if (req.query.node_id !== undefined && req.query.node_id !== '') {
            const nodeRow = await findEnabledNode(req.query.node_id);
            if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
            ikuaiApi = await getIkuaiClientForPve(nodeRow.id);
        } else {
            ikuaiApi = await getIkuaiClient(null); // 缺省：默认爱快节点
        }
        await ikuaiApi.ensureConfig();
        if (!ikuaiApi.isConfigured()) {
            return res.json([]);
        }
        const groups = await ikuaiApi.getMacGroups();
        res.json(groups);
    } catch (e) {
        console.error('[ikuai] 获取MAC分组失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
