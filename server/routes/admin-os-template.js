// server/routes/admin-os-template.js - 管理员 OS 模板管理 + 切换日志管理
const express = require('express');
const router = express.Router();
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { safeError } = require('../utils/safe-error');
// 单一来源：模板状态白名单统一走 constants（规范第七节）
const { TEMPLATE_STATUS } = require('../constants');
// 日期参数校验单一来源：utils/date.js（与 admin-logs.js 共用，禁止本地拷贝）
const { normalizeDateParam } = require('../utils/date');

// 所有端点都需要管理员权限
// 路径前缀限定：只拦截 /admin/* 请求，避免拦截所有经过的 /api 请求（express 前缀挂载陷阱）
router.use('/admin', authMiddleware, adminMiddleware);

// ==================== PVE 模板配置自动填充 ====================

// GET /api/admin/pve-template-config/:vmid — 读取 PVE 模板 VM 配置，返回自动填充字段
router.get('/admin/pve-template-config/:vmid', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的 VMID' });
        }
        const config = await pveApi.getVmConfig(vmid);
        if (!config) {
            return res.status(404).json({ error: 'PVE 模板不存在' });
        }

        // 从 config 解析系统盘容量
        let systemDiskSize = 20;
        const buses = ['scsi', 'sata', 'virtio'];
        for (const bus of buses) {
            const raw = String(config[bus + '0'] || '');
            const m = raw.match(/size=(\d+)([GM])/i);
            if (m) {
                const v = parseInt(m[1]);
                systemDiskSize = m[2].toUpperCase() === 'M' ? Math.ceil(v / 1024) : v;
                break;
            }
        }

        // 从 ostype 映射到 os_type（PVE 所有 ostype 覆盖）
        const ostype = config.ostype || '';
        if (process.env.DEBUG === 'true') console.log('[pve-template-config] VM ' + vmid + ' ostype:', JSON.stringify(ostype));
        let osType = '';
        let osVersion = '';
        // PVE 9.x 使用 win10/win11/win2019 等格式，老版本用 w10/w11/w2k19
        const raw = ostype.toLowerCase().replace(/^microsoft\s*/i, '');
        if (raw.startsWith('l')) {
            osType = 'linux';
            osVersion = raw.substring(1) || '';
        } else if (raw === 'win10' || raw === 'w10') {
            osType = 'windows';
            osVersion = '10';
        } else if (raw === 'win11' || raw === 'w11') {
            osType = 'windows';
            osVersion = '11';
        } else if (raw === 'win7') {
            osType = 'windows';
            osVersion = '7';
        } else if (raw === 'win8' || raw === 'wvista') {
            osType = 'windows';
            osVersion = raw === 'win8' ? '8' : 'vista';
        } else if (raw === 'wxp' || raw === 'winxp') {
            osType = 'windows';
            osVersion = 'xp';
        } else if (raw === 'w2k' || raw === 'win2000') {
            osType = 'windows';
            osVersion = '2000';
        } else if (/^(w2k3|win2003|win2k3)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2003';
        } else if (/^(w2k8|win2008|win2k8)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2008';
        } else if (/^(w2k12|win2012|win2k12)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2012';
        } else if (/^(w2k16|win2016|win2k16)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2016';
        } else if (/^(w2k19|win2019|win2k19)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2019';
        } else if (/^(w2k22|win2022|win2k22)$/.test(raw)) {
            osType = 'windows';
            osVersion = 'server 2022';
        } else if (raw === 'solaris') {
            osType = 'solaris';
        } else if (raw === 'other' || raw === '') {
            osType = 'other';
        } else {
            // 兜底：保留原始值
            osType = raw;
        }

        // 从 config 解析 name 用作模板名称
        const name = config.name || ('VM ' + vmid);

        // 从 config 解析 ciuser
        const ciuser = config.ciuser || '';

        // 判断架构
        const arch = config.arch || 'x86_64';

        // 从 config 解析 target_storage 从 scsi0/sata0/virtio0 的 volume_id 提取
        let targetStorage = 'local-lvm';
        for (const bus of buses) {
            const raw = String(config[bus + '0'] || '');
            if (raw) {
                const parts = raw.split(':');
                if (parts.length > 0 && parts[0]) {
                    targetStorage = parts[0];
                }
                break;
            }
        }

        res.json({
            success: true,
            data: {
                name: name,
                os_type: osType,
                os_version: osVersion,
                ostype: ostype,
                arch: arch,
                target_storage: targetStorage,
                ciuser: ciuser
            }
        });
    } catch (e) {
        console.error('[pve-template-config] 读取模板配置失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ==================== OS 模板 CRUD ====================

// GET /api/admin/os-templates
router.get('/admin/os-templates', async (req, res) => {
    try {
        const list = await db.osTemplates.getAll();
        res.json({ success: true, data: list });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// GET /api/admin/os-templates/:id
router.get('/admin/os-templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id <= 0) return res.status(400).json({ error: '无效的 ID' });
        const tpl = await db.osTemplates.getById(id);
        if (!tpl) return res.status(404).json({ error: '模板不存在' });
        res.json({ success: true, data: tpl });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// POST /api/admin/os-templates — 创建
router.post('/admin/os-templates', async (req, res) => {
    try {
        const data = req.body;
        if (!data.name || !data.template_vmid) {
            return res.status(400).json({ error: '名称和模板 VMID 必填' });
        }
        const templateVmid = parseInt(data.template_vmid);
        if (!Number.isInteger(templateVmid) || templateVmid < 100 || templateVmid > 999999999) {
            return res.status(400).json({ error: '无效的模板 VMID' });
        }
        // 校验 template_vmid 在 PVE 中确实是模板
        const vms = await pveApi.getVms({ templateOnly: true });
        if (!vms.find(v => v.vmid === templateVmid)) {
            return res.status(400).json({ error: '指定的 VMID 在 PVE 中不是模板' });
        }
        const id = await db.osTemplates.create({
            name: String(data.name).slice(0, 255),
            template_vmid: templateVmid,
            os_type: String(data.os_type || '').slice(0, 50),
            os_version: String(data.os_version || '').slice(0, 50),
            ostype: String(data.ostype || '').slice(0, 20),
            arch: ['x86_64', 'aarch64'].includes(data.arch) ? data.arch : 'x86_64',
            disk_format: ['', 'raw', 'qcow2', 'vmdk'].includes(data.disk_format) ? data.disk_format : '',
            target_storage: String(data.target_storage || 'local-lvm').slice(0, 100),
            ciuser: String(data.ciuser || '').slice(0, 100),
            description: String(data.description || '').slice(0, 5000),
            icon: String(data.icon || '').slice(0, 100),
            sort_order: parseInt(data.sort_order) || 0,
            allowed_package_ids: String(data.allowed_package_ids || '').slice(0, 500),
            enabled: data.enabled === false ? 0 : 1,
            status: TEMPLATE_STATUS.includes(data.status) ? data.status : 'active'
        });
        // 操作审计：创建 OS 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.os-template.create', resourceType: 'os-template', resourceId: id, details: '创建OS模板:' + String(data.name || '') + '(模板VMID:' + templateVmid + ')', req });
        } catch (e) {}
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// PUT /api/admin/os-templates/:id — 更新
router.put('/admin/os-templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id <= 0) return res.status(400).json({ error: '无效的 ID' });
        const existing = await db.osTemplates.getById(id);
        if (!existing) return res.status(404).json({ error: '模板不存在' });

        const allowedFields = ['name', 'template_vmid', 'os_type', 'os_version', 'ostype', 'arch', 'target_storage', 'disk_format', 'ciuser', 'description', 'icon', 'sort_order', 'allowed_package_ids', 'enabled', 'status'];
        const updates = {};
        for (const key of allowedFields) {
            if (req.body[key] !== undefined) {
                updates[key] = req.body[key];
            }
        }
        if (updates.template_vmid !== undefined) {
            const vmid = parseInt(updates.template_vmid);
            if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
                return res.status(400).json({ error: '无效的模板 VMID' });
            }
        }
        // 目标磁盘格式白名单（跨存储切换时作为 PVE move_disk 的 format 参数，非法值会导致切换失败）
        if (updates.disk_format !== undefined && !['', 'raw', 'qcow2', 'vmdk'].includes(updates.disk_format)) {
            return res.status(400).json({ error: '无效的目标磁盘格式' });
        }
        const result = await db.osTemplates.update(id, updates);
        // 操作审计：更新 OS 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.os-template.update', resourceType: 'os-template', resourceId: id, details: '更新OS模板:' + (existing.name || id) + (updates.enabled !== undefined ? '(启用:' + (updates.enabled ? '是' : '否') + ')' : ''), req });
        } catch (e) {}
        res.json({ success: true, data: result });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// DELETE /api/admin/os-templates/:id — 删除（检查引用）
router.delete('/admin/os-templates/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id <= 0) return res.status(400).json({ error: '无效的 ID' });
        const tpl = await db.osTemplates.getById(id);
        if (!tpl) return res.status(404).json({ error: '模板不存在' });
        // 检查是否有 VM 正在使用该 OS 模板
        const vms = await db.vms.getAll();
        const usedBy = vms.filter(v => v.current_os_template_id === id);
        if (usedBy.length > 0) {
            return res.status(400).json({
                error: `有 ${usedBy.length} 个 VM 正在使用该系统模板，请先迁移后再删除`,
                used_by_vms: usedBy.map(v => ({ vm_id: v.vm_id, name: v.name }))
            });
        }
        await db.osTemplates.delete(id);
        // 操作审计：删除 OS 模板
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.os-template.delete', resourceType: 'os-template', resourceId: id, details: '删除OS模板:' + (tpl.name || id), req });
        } catch (e) {}
        res.json({ success: true, message: '已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// GET /api/admin/os-templates/:id/vms — 查看哪些 VM 正在使用该 OS
router.get('/admin/os-templates/:id/vms', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id <= 0) return res.status(400).json({ error: '无效的 ID' });
        const vms = await db.vms.getAll();
        const filtered = vms.filter(v => v.current_os_template_id === id);
        res.json({ success: true, data: filtered });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ==================== 切换日志管理 ====================

// 切换日志状态白名单（列表筛选；删除/清空的 running 保护在 db 层另行校验）
const OS_SWITCH_LOG_STATUS = ['success', 'failed', 'running', 'pending', 'rolled_back'];

// GET /api/admin/os-switch-logs — 翻页查询（支持过滤）
router.get('/admin/os-switch-logs', async (req, res) => {
    try {
        const status = (req.query.status || '').trim();
        if (status && OS_SWITCH_LOG_STATUS.indexOf(status) === -1) {
            return res.status(400).json({ error: '无效的日志状态' });
        }
        const username = (req.query.username || '').trim();
        if (username.length > 64) return res.status(400).json({ error: '用户名过长' });
        const keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });
        const vmId = (req.query.vm_id || '').trim();
        if (vmId && !/^\d+$/.test(vmId)) return res.status(400).json({ error: '无效的 VMID' });
        const userId = (req.query.user_id || '').trim();
        if (userId && !/^\d+$/.test(userId)) return res.status(400).json({ error: '无效的用户ID' });
        const startDate = normalizeDateParam(req.query.start_date || '', false);
        const endDate = normalizeDateParam(req.query.end_date || '', true);
        if (startDate === null || endDate === null) return res.status(400).json({ error: '无效的日期格式' });
        const filters = {
            page: Math.min(parseInt(req.query.page) || 1, 1000),
            limit: Math.min(parseInt(req.query.limit) || 20, 200),
            status: status,
            vm_id: vmId,
            user_id: userId,
            username: username,
            keyword: keyword,
            start_date: startDate,
            end_date: endDate,
            before_date: req.query.before_date
        };
        const logs = await db.vmOsSwitchLogs.getListWithPaging(filters);
        // countWithFilters 返回 { c: N } 行对象，转数字 total（接口契约：total 为数字，供前端分页/条数统计）
        const countRow = await db.vmOsSwitchLogs.countWithFilters(filters);
        res.json({ success: true, data: logs, total: countRow ? (countRow.c || 0) : 0, page: filters.page, limit: filters.limit });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// DELETE /api/admin/os-switch-logs/:id — 单条删除（运行中日志禁删）
router.delete('/admin/os-switch-logs/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!id || id <= 0) return res.status(400).json({ error: '无效的日志 ID' });
        const log = await db.vmOsSwitchLogs.getById(id);
        if (!log) return res.status(404).json({ error: '日志不存在' });
        if (log.status === 'running') {
            return res.status(400).json({ error: '运行中的日志禁止删除' });
        }
        if (log.admin_intervention_required && req.query.force !== '1') {
            return res.status(400).json({ error: '该日志标记为需管理员介入，删除请加 ?force=1 二次确认' });
        }
        const result = await db.vmOsSwitchLogs.deleteById(id);
        // 操作审计：删除系统切换日志
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.log.delete.os-switch', resourceType: 'os-switch-log', resourceId: id, details: '删除切换日志 #' + id, req });
        } catch (e) {}
        res.json({ success: true, message: '日志已删除', deleted: result.deleted });
    } catch (e) {
        if (e.code === 'LOG_RUNNING') {
            return res.status(400).json({ error: e.message });
        }
        res.status(500).json({ error: safeError(e) });
    }
});

// POST /api/admin/os-switch-logs/batch-delete — 批量删除
router.post('/admin/os-switch-logs/batch-delete', async (req, res) => {
    try {
        const { ids, status, vm_id, user_id, before_date } = req.body;
        if (ids && (!Array.isArray(ids) || ids.length === 0 || ids.length > 500)) {
            return res.status(400).json({ error: 'ids 必须是 1-500 长度的数组' });
        }
        const result = await db.vmOsSwitchLogs.batchDelete({ ids, status, vm_id, user_id, before_date });
        // 操作审计：批量删除系统切换日志
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.log.delete.os-switch', resourceType: 'os-switch-log', details: '批量删除切换日志 ' + result.deleted + ' 条(跳过运行中 ' + result.skipped_running + ' 条)', req });
        } catch (e) {}
        res.json({
            success: true,
            message: `已删除 ${result.deleted} 条，跳过 ${result.skipped_running} 条运行中日志`,
            deleted: result.deleted,
            skipped_running: result.skipped_running
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// POST /api/admin/os-switch-logs/clear — 清空全部（高危，需确认串）
router.post('/admin/os-switch-logs/clear', async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_ALL_OS_SWITCH_LOGS') {
            return res.status(400).json({ error: '高危操作，请传入 confirm: "CLEAR_ALL_OS_SWITCH_LOGS" 二次确认' });
        }
        const result = await db.vmOsSwitchLogs.clearAllExceptRunningAndIntervention();
        // 操作审计：清空系统切换日志
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.log.clear.os-switch', resourceType: 'os-switch-log', details: '清空切换日志 ' + result.deleted + ' 条(保留运行中 ' + result.skipped_running + ' + 需介入 ' + result.skipped_intervention + ')', req });
        } catch (e) {}
        res.json({
            success: true,
            message: `已清空 ${result.deleted} 条，保留 ${result.skipped_running} 条运行中 + ${result.skipped_intervention} 条需介入日志`,
            deleted: result.deleted,
            skipped_running: result.skipped_running,
            skipped_intervention: result.skipped_intervention
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;