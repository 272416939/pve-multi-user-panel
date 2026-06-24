var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
const { safeError } = require('../utils/safe-error');

// VM 模板列表
router.get('/admin/vm-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var list = await db.vmTemplates.getAll();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// VM 模板创建
router.post('/admin/vm-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { mac_group_id = '' } = req.body;
        var t = await db.vmTemplates.create({ ...req.body, mac_group_id });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// VM 模板更新
router.put('/admin/vm-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { mac_group_id = '' } = req.body;
        var t = await db.vmTemplates.update(parseInt(req.params.id), { ...req.body, mac_group_id });
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// VM 模板删除（检查是否被套餐引用）
router.delete('/admin/vm-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        var packages = await db.vmPackages.getAll();
        var ref = packages.find(function(p) { return p.template_id === id; });
        if (ref) return res.status(400).json({ error: '该模板被套餐 [' + ref.name + '] 引用，请先删除套餐' });
        await db.vmTemplates.delete(id);
        res.json({ message: '已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// LXC 模板列表
router.get('/admin/lxc-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try { var list = await db.lxcTemplates.getAll(); res.json(list); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// LXC 模板创建
router.post('/admin/lxc-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { mac_group_id = '' } = req.body;
        var t = await db.lxcTemplates.create({ ...req.body, mac_group_id });
        res.json(t);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// LXC 模板更新
router.put('/admin/lxc-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { mac_group_id = '' } = req.body;
        var t = await db.lxcTemplates.update(parseInt(req.params.id), { ...req.body, mac_group_id });
        res.json(t);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// LXC 模板删除
router.delete('/admin/lxc-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        var packages = await db.lxcPackages.getAll();
        var ref = packages.find(function(p) { return p.template_id === id; });
        if (ref) return res.status(400).json({ error: '该模板被套餐 [' + ref.name + '] 引用，请先删除套餐' });
        await db.lxcTemplates.delete(id);
        res.json({ message: '已删除' });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

module.exports = router;
