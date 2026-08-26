var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
const { safeError } = require('../utils/safe-error');

// 多节点：模板必须绑定有效启用的 PVE 节点；返回节点行或 null
async function tplNode(rawNodeId) {
    const { findEnabledNode } = require('../utils/locate-asset');
    return findEnabledNode(rawNodeId);
}

// VM 模板列表
router.get('/admin/vm-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var list = await db.vmTemplates.getAll();
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// VM 模板创建
router.post('/admin/vm-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 多节点：节点必填校验（template_vmid 为遗留字段不再强校验——克隆源已改由系统模板提供，用户下单自选）
        var nodeRow = await tplNode(req.body.pve_node_id);
        if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
        var { mac_group_id = '' } = req.body;
        var t = await db.vmTemplates.create({ ...req.body, mac_group_id });
        // 操作审计：创建 VM 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.create', resourceType: 'vm-template', resourceId: t.id, details: '创建VM模板:' + (req.body.name || t.id), req });
        } catch (e) {}
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// VM 模板更新
// 审计 diff 字段定义（单一来源）：VM 模板可编辑字段全量纳入
var VM_TEMPLATE_DIFF_FIELDS = [
    { key: 'name', label: '名称' },
    { key: 'template_vmid', label: '模板VMID', num: true },
    { key: 'cores', label: '核心', num: true },
    { key: 'memory', label: '内存', num: true, fmt: function (v) { return v + 'MB'; } },
    { key: 'disk_size', label: '磁盘', num: true, fmt: function (v) { return v + 'G'; } },
    { key: 'network_bridge', label: '网桥' },
    { key: 'network_model', label: '网卡型号' },
    { key: 'os_type', label: '系统类型' },
    { key: 'ciuser', label: '云初始化用户' },
    { key: 'target_storage', label: '存储位置' },
    { key: 'clone_mode', label: '克隆模式', fmt: function (v) { return v === 'full' ? '完整克隆' : v; } },
    { key: 'cpu_affinity', label: 'CPU亲和' },
    { key: 'mac_group_id', label: 'MAC分组', fmt: function (v) { return v ? '#' + v : '无'; } },
    { key: 'description', label: '描述', fmt: function (v) { return String(v).length > 30 ? String(v).slice(0, 30) + '…' : v; } },
    { key: 'status', label: '状态', fmt: function (v) { return v === 'active' ? '启用' : (v || '无'); } }
];

router.put('/admin/vm-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 多节点：改绑节点时校验节点有效（template_vmid 为遗留字段不再强校验，见 POST 注释）
        var oldT = await db.vmTemplates.getById(parseInt(req.params.id));
        if (req.body.pve_node_id !== undefined) {
            var nodeRow = await tplNode(req.body.pve_node_id);
            if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
        }
        var { mac_group_id = '' } = req.body;
        // 保存前取旧记录（审计 diff 用）
        var t = await db.vmTemplates.update(parseInt(req.params.id), { ...req.body, mac_group_id });
        // 操作审计：更新 VM 模板（DB 新旧记录字段级 diff）
        try {
            const { auditLog } = require('../utils/audit-log');
            const { buildFieldDiff } = require('../utils/audit-diff');
            var changes = oldT ? buildFieldDiff(oldT, t, VM_TEMPLATE_DIFF_FIELDS) : [];
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.update', resourceType: 'vm-template', resourceId: parseInt(req.params.id), details: '更新VM模板 #' + parseInt(req.params.id) + '；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json(t);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// VM 模板删除（检查是否被套餐引用）
router.delete('/admin/vm-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        var packages = await db.vmPackages.getAll();
        var ref = packages.find(function(p) { return p.template_id === id; });
        if (ref) return res.status(400).json({ error: '该模板被套餐 [' + ref.name + '] 引用，请先删除套餐', code: 'TPL_IN_USE_PKGS', params: [ref.name] });
        await db.vmTemplates.delete(id);
        // 操作审计：删除 VM 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.delete', resourceType: 'vm-template', resourceId: id, details: '删除VM模板 #' + id, req });
        } catch (e) {}
        res.json({ message: '已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// LXC 模板列表
router.get('/admin/lxc-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try { var list = await db.lxcTemplates.getAll(); res.json(list); } catch (e) { res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' }); }
});

// LXC 模板创建
router.post('/admin/lxc-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 多节点：节点必填校验
        var nodeRow = await tplNode(req.body.pve_node_id);
        if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
        var { mac_group_id = '' } = req.body;
        var t = await db.lxcTemplates.create({ ...req.body, mac_group_id });
        // 操作审计：创建 LXC 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.create', resourceType: 'lxc-template', resourceId: t.id, details: '创建LXC模板:' + (req.body.name || t.id), req });
        } catch (e) {}
        res.json(t);
    } catch (e) { res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' }); }
});

// LXC 模板更新
// 审计 diff 字段定义（单一来源）：LXC 模板可编辑字段全量纳入
var LXC_TEMPLATE_DIFF_FIELDS = [
    { key: 'name', label: '名称' },
    { key: 'ostemplate', label: '模板' },
    { key: 'storage', label: '存储' },
    { key: 'rootfs_storage', label: '根存储' },
    { key: 'cores', label: '核心', num: true },
    { key: 'memory', label: '内存', num: true, fmt: function (v) { return v + 'MB'; } },
    { key: 'swap', label: 'Swap', num: true, fmt: function (v) { return v + 'MB'; } },
    { key: 'disk_size', label: '磁盘', num: true, fmt: function (v) { return v + 'G'; } },
    { key: 'network_bridge', label: '网桥' },
    { key: 'network_mode', label: '网络模式' },
    { key: 'ipv6_enabled', label: 'IPv6', bool: true },
    { key: 'ip6_mode', label: 'IPv6模式' },
    { key: 'ip6_addr', label: 'IPv6地址' },
    { key: 'ip4_addr', label: 'IPv4地址' },
    { key: 'unprivileged', label: '非特权容器', bool: true },
    { key: 'features', label: '特性' },
    { key: 'mac_group_id', label: 'MAC分组', fmt: function (v) { return v ? '#' + v : '无'; } },
    { key: 'description', label: '描述', fmt: function (v) { return String(v).length > 30 ? String(v).slice(0, 30) + '…' : v; } },
    { key: 'status', label: '状态', fmt: function (v) { return v === 'active' ? '启用' : (v || '无'); } }
];

router.put('/admin/lxc-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 多节点：改绑节点时校验目标节点有效
        if (req.body.pve_node_id !== undefined) {
            var nodeRow = await tplNode(req.body.pve_node_id);
            if (!nodeRow) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
        }
        var { mac_group_id = '' } = req.body;
        // 保存前取旧记录（审计 diff 用）
        var oldT = await db.lxcTemplates.getById(parseInt(req.params.id));
        var t = await db.lxcTemplates.update(parseInt(req.params.id), { ...req.body, mac_group_id });
        // 操作审计：更新 LXC 模板（DB 新旧记录字段级 diff）
        try {
            const { auditLog } = require('../utils/audit-log');
            const { buildFieldDiff } = require('../utils/audit-diff');
            var changes = oldT ? buildFieldDiff(oldT, t, LXC_TEMPLATE_DIFF_FIELDS) : [];
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.update', resourceType: 'lxc-template', resourceId: parseInt(req.params.id), details: '更新LXC模板 #' + parseInt(req.params.id) + '；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json(t);
    } catch (e) { res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' }); }
});

// LXC 模板删除
router.delete('/admin/lxc-templates/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        var packages = await db.lxcPackages.getAll();
        var ref = packages.find(function(p) { return p.template_id === id; });
        if (ref) return res.status(400).json({ error: '该模板被套餐 [' + ref.name + '] 引用，请先删除套餐' });
        await db.lxcTemplates.delete(id);
        // 操作审计：删除 LXC 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.template.delete', resourceType: 'lxc-template', resourceId: id, details: '删除LXC模板 #' + id, req });
        } catch (e) {}
        res.json({ message: '已删除' });
    } catch (e) { res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' }); }
});

module.exports = router;
