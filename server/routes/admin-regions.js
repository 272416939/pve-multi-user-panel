// 区域管理（地域/可用区）CRUD —— 仅管理员
const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.message || String(e);
    return '操作失败，请稍后重试';
}

// 名称/备注校验（禁 HTML 标签注入 + 长度限制）
function validateName(name) {
    if (!name || typeof name !== 'string') return { error: '名称不能为空', code: 'NAME_REQUIRED' };
    const trimmed = name.trim();
    if (!trimmed) return { error: '名称不能为空', code: 'NAME_REQUIRED' };
    if (trimmed.length > 50) return { error: '名称最长 50 个字符', code: 'NAME_TOO_LONG' };
    if (/[<>]/.test(trimmed)) return { error: '名称不能包含 HTML 标签', code: 'NAME_INVALID_CHARS' };
    return { value: trimmed };
}

function validateRemark(remark) {
    if (remark === undefined || remark === null) return { value: '' };
    const trimmed = String(remark).trim();
    if (trimmed.length > 200) return { error: '备注最长 200 个字符', code: 'REMARK_TOO_LONG' };
    if (/[<>]/.test(trimmed)) return { error: '备注不能包含 HTML 标签', code: 'REMARK_INVALID_CHARS' };
    return { value: trimmed };
}

function validateSortOrder(sortOrder) {
    if (sortOrder === undefined || sortOrder === null || sortOrder === '') return { value: 0 };
    const n = parseInt(sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 99999) return { error: '排序值必须是 0~99999 的整数', code: 'SORT_ORDER_INVALID' };
    return { value: n };
}

async function audit(req, action, resourceType, resourceId, details) {
    try {
        await require('../utils/audit-log').auditLog({
            userId: req.user.id, username: req.user.username,
            action, resourceType, resourceId, details, req
        });
    } catch (_) {}
}

// ==================== 地域 ====================

// 列表（含绑定资产概览计数）
router.get('/admin/regions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const rows = await db.nodeOverviews.regionsOverview();
        res.json({ regions: rows });
    } catch (e) {
        console.error('[regions] 列表失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 新增
router.post('/admin/regions', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const nameCheck = validateName(req.body.name);
        if (nameCheck.error) return res.status(400).json({ error: nameCheck.error, code: nameCheck.code });
        const remarkCheck = validateRemark(req.body.remark);
        if (remarkCheck.error) return res.status(400).json({ error: remarkCheck.error, code: remarkCheck.code });
        const sortCheck = validateSortOrder(req.body.sort_order);
        if (sortCheck.error) return res.status(400).json({ error: sortCheck.error, code: sortCheck.code });
        const dup = await db.regions.getByName(nameCheck.value);
        if (dup) return res.status(400).json({ error: '同名地域已存在', code: 'REGION_DUPLICATE' });
        const id = await db.regions.create({ name: nameCheck.value, remark: remarkCheck.value, sort_order: sortCheck.value });
        await audit(req, 'admin.region.create', 'region', id, '新增地域: ' + nameCheck.value);
        res.json({ message: '地域已创建', id });
    } catch (e) {
        console.error('[regions] 新增失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 更新
router.put('/admin/regions/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的地域 ID', code: 'REGION_NOT_FOUND' });
        const region = await db.regions.get(id);
        if (!region) return res.status(404).json({ error: '地域不存在', code: 'REGION_NOT_FOUND' });
        const nameCheck = validateName(req.body.name);
        if (nameCheck.error) return res.status(400).json({ error: nameCheck.error, code: nameCheck.code });
        const remarkCheck = validateRemark(req.body.remark);
        if (remarkCheck.error) return res.status(400).json({ error: remarkCheck.error, code: remarkCheck.code });
        const sortCheck = validateSortOrder(req.body.sort_order);
        if (sortCheck.error) return res.status(400).json({ error: sortCheck.error, code: sortCheck.code });
        const dup = await db.regions.getByName(nameCheck.value);
        if (dup && dup.id !== id) return res.status(400).json({ error: '同名地域已存在', code: 'REGION_DUPLICATE' });
        await db.regions.update(id, { name: nameCheck.value, remark: remarkCheck.value, sort_order: sortCheck.value });
        await audit(req, 'admin.region.update', 'region', id, '更新地域: ' + region.name + ' → ' + nameCheck.value);
        res.json({ message: '地域已更新' });
    } catch (e) {
        console.error('[regions] 更新失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 删除（有可用区时拦截）
router.delete('/admin/regions/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的地域 ID', code: 'REGION_NOT_FOUND' });
        const region = await db.regions.get(id);
        if (!region) return res.status(404).json({ error: '地域不存在', code: 'REGION_NOT_FOUND' });
        const zoneCount = (await require('../api/db-core').queryOne(
            'SELECT COUNT(*) AS c FROM zones WHERE region_id = ?', [id])).c;
        if (zoneCount > 0) {
            return res.status(409).json({
                error: '该地域下还有 ' + zoneCount + ' 个可用区，请先删除或迁移可用区',
                code: 'REGION_HAS_ZONES'
            });
        }
        await db.regions.remove(id);
        await audit(req, 'admin.region.delete', 'region', id, '删除地域: ' + region.name);
        res.json({ message: '地域已删除' });
    } catch (e) {
        console.error('[regions] 删除失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ==================== 可用区 ====================

// 列表（含 PVE 节点/爱快/套餐/实例计数）
router.get('/admin/zones', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const rows = await db.nodeOverviews.zonesOverview();
        // 附每可用区节点明细（chips 展示用）
        const nodes = await db.pveNodes.list();
        const byZone = {};
        nodes.forEach(n => {
            if (!byZone[n.zone_id]) byZone[n.zone_id] = [];
            byZone[n.zone_id].push({ id: n.id, name: n.name, ikuai_node_id: n.ikuai_node_id, ikuai_name: n.ikuai_name, enabled: n.enabled });
        });
        rows.forEach(z => { z.nodes = byZone[z.id] || []; });
        res.json({ zones: rows });
    } catch (e) {
        console.error('[zones] 列表失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 新增
router.post('/admin/zones', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const regionId = parseInt(req.body.region_id);
        if (!Number.isInteger(regionId)) return res.status(400).json({ error: '请选择所属地域', code: 'ZONE_REGION_REQUIRED' });
        const region = await db.regions.get(regionId);
        if (!region) return res.status(404).json({ error: '所属地域不存在', code: 'REGION_NOT_FOUND' });
        const nameCheck = validateName(req.body.name);
        if (nameCheck.error) return res.status(400).json({ error: nameCheck.error, code: nameCheck.code });
        const remarkCheck = validateRemark(req.body.remark);
        if (remarkCheck.error) return res.status(400).json({ error: remarkCheck.error, code: remarkCheck.code });
        const sortCheck = validateSortOrder(req.body.sort_order);
        if (sortCheck.error) return res.status(400).json({ error: sortCheck.error, code: sortCheck.code });
        const dup = await db.zones.getByNameInRegion(regionId, nameCheck.value);
        if (dup) return res.status(400).json({ error: '该地域下已存在同名可用区', code: 'ZONE_DUPLICATE' });
        const id = await db.zones.create({ region_id: regionId, name: nameCheck.value, remark: remarkCheck.value, sort_order: sortCheck.value });
        await audit(req, 'admin.zone.create', 'zone', id, '新增可用区: ' + region.name + ' / ' + nameCheck.value);
        res.json({ message: '可用区已创建', id });
    } catch (e) {
        console.error('[zones] 新增失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 更新
router.put('/admin/zones/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的可用区 ID', code: 'ZONE_NOT_FOUND' });
        const zone = await db.zones.get(id);
        if (!zone) return res.status(404).json({ error: '可用区不存在', code: 'ZONE_NOT_FOUND' });
        const regionId = parseInt(req.body.region_id);
        if (!Number.isInteger(regionId)) return res.status(400).json({ error: '请选择所属地域', code: 'ZONE_REGION_REQUIRED' });
        const region = await db.regions.get(regionId);
        if (!region) return res.status(404).json({ error: '所属地域不存在', code: 'REGION_NOT_FOUND' });
        const nameCheck = validateName(req.body.name);
        if (nameCheck.error) return res.status(400).json({ error: nameCheck.error, code: nameCheck.code });
        const remarkCheck = validateRemark(req.body.remark);
        if (remarkCheck.error) return res.status(400).json({ error: remarkCheck.error, code: remarkCheck.code });
        const sortCheck = validateSortOrder(req.body.sort_order);
        if (sortCheck.error) return res.status(400).json({ error: sortCheck.error, code: sortCheck.code });
        const dup = await db.zones.getByNameInRegion(regionId, nameCheck.value);
        if (dup && dup.id !== id) return res.status(400).json({ error: '该地域下已存在同名可用区', code: 'ZONE_DUPLICATE' });
        await db.zones.update(id, { region_id: regionId, name: nameCheck.value, remark: remarkCheck.value, sort_order: sortCheck.value });
        await audit(req, 'admin.zone.update', 'zone', id, '更新可用区: ' + zone.name + ' → ' + nameCheck.value);
        res.json({ message: '可用区已更新' });
    } catch (e) {
        console.error('[zones] 更新失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 删除（区内仍有 PVE 节点时拦截）
router.delete('/admin/zones/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '无效的可用区 ID', code: 'ZONE_NOT_FOUND' });
        const zone = await db.zones.get(id);
        if (!zone) return res.status(404).json({ error: '可用区不存在', code: 'ZONE_NOT_FOUND' });
        const nodeCount = (await require('../api/db-core').queryOne(
            'SELECT COUNT(*) AS c FROM pve_nodes WHERE zone_id = ?', [id])).c;
        if (nodeCount > 0) {
            return res.status(409).json({
                error: '该可用区下仍有 ' + nodeCount + ' 个 PVE 节点，请先删除或迁移节点',
                code: 'ZONE_IN_USE'
            });
        }
        await db.zones.remove(id);
        await audit(req, 'admin.zone.delete', 'zone', id, '删除可用区: ' + zone.name);
        res.json({ message: '可用区已删除' });
    } catch (e) {
        console.error('[zones] 删除失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
