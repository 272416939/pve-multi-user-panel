const express = require('express');
const router = express.Router();
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.message || String(e);
    return '操作失败，请稍后重试';
}

router.get('/ikuai/mac-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
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
