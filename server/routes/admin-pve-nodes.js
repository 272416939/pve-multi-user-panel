// PVE 节点管理（多节点表单化，快照&备份策略并入本页）—— 仅管理员
const express = require('express');
const router = express.Router();
const axios = require('axios');
const https = require('https');
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { maskSecret } = require('../utils/crypto-utils');
const { friendlyTestError } = require('../utils/friendly-test-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { getPveClient, invalidatePveClient } = require('../api/pve-clients');

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.message || String(e);
    return '操作失败，请稍后重试';
}

async function audit(req, action, resourceType, resourceId, details) {
    try {
        await require('../utils/audit-log').auditLog({
            userId: req.user.id, username: req.user.username,
            action, resourceType, resourceId, details, req
        });
    } catch (_) {}
}

// ==================== 校验 ====================

function validateNodeBase(body) {
    const name = String(body.name || '').trim();
    if (!name) return { error: '请填写节点名称', code: 'NAME_REQUIRED' };
    if (name.length > 100) return { error: '节点名称最长 100 个字符', code: 'NAME_TOO_LONG' };
    if (/[<>]/.test(name)) return { error: '节点名称不能包含 HTML 标签', code: 'NAME_INVALID_CHARS' };
    const zoneId = parseInt(body.zone_id);
    if (!Number.isInteger(zoneId)) return { error: '请选择所属可用区', code: 'ZONE_REQUIRED' };
    const apiHost = String(body.api_host || '').trim();
    if (!apiHost) return { error: '请填写 PVE API 地址', code: 'PVE_URL_REQUIRED' };
    if (!/^https?:\/\/\S+$/i.test(apiHost)) {
        return { error: 'PVE API 地址必须以 http:// 或 https:// 开头', code: 'PVE_URL_SCHEME' };
    }
    const sshHost = String(body.ssh_host || '').trim();
    if (!sshHost) return { error: '请填写 SSH 主机地址', code: 'SSH_HOST_REQUIRED' };
    let sshPort = parseInt(body.ssh_port);
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) sshPort = 22;
    const sshUser = String(body.ssh_user || '').trim() || 'root';
    if (sshUser.length > 64) return { error: 'SSH 用户名过长', code: 'SSH_USER_INVALID' };
    // 配对爱快必选（端口转发/DHCP/VLAN 都落在配对爱快上）
    const ikuaiNodeId = parseInt(body.ikuai_node_id);
    if (!Number.isInteger(ikuaiNodeId)) return { error: '请选择关联爱快节点', code: 'IKUAI_PAIRED_REQUIRED' };
    return {
        value: {
            name, zone_id: zoneId, api_host: apiHost.replace(/\/+$/, ''),
            ssh_host: sshHost, ssh_port: sshPort, ssh_user: sshUser,
            ikuai_node_id: ikuaiNodeId,
            backup_storage: String(body.backup_storage || 'local').trim().slice(0, 100),
            enabled: body.enabled !== false,
            sort_order: parseInt(body.sort_order) || 0
        }
    };
}

// 表单当前值测试参数（掩码精确匹配回退；node_id 存在时回退源为该节点行）
async function resolveTestParams(body) {
    var saved;
    if (body.node_id !== undefined && body.node_id !== null && body.node_id !== '') {
        saved = await db.pveNodes.get(parseInt(body.node_id));
        if (!saved) return { error: '节点不存在', code: 'PVE_NODE_NOT_FOUND' };
    } else {
        saved = await db.config.getPve();
    }
    var host = String(body.api_host !== undefined ? body.api_host : (saved.host !== undefined ? saved.host : (saved.api_host || ''))).trim();
    var tokenMask = maskSecret(saved.api_token || '');
    var tokenChanged = body.api_token !== undefined && body.api_token !== '' && body.api_token !== tokenMask;
    var apiToken = tokenChanged ? body.api_token : (saved.api_token || '');
    var pwdMask = maskSecret(saved.ssh_password || '');
    var pwdChanged = body.ssh_password !== undefined && body.ssh_password !== '' && body.ssh_password !== pwdMask;
    var sshPassword = pwdChanged ? body.ssh_password : (saved.ssh_password || '');
    var strictTls = body.strict_tls !== undefined ? !!body.strict_tls : !!saved.strict_tls;
    return {
        params: {
            host,
            api_token: apiToken,
            ssh_host: String(body.ssh_host !== undefined ? body.ssh_host : (saved.ssh_host || '')).trim(),
            ssh_port: parseInt(body.ssh_port !== undefined ? body.ssh_port : (saved.ssh_port || 22)) || 22,
            ssh_user: String(body.ssh_user !== undefined ? body.ssh_user : (saved.ssh_user || 'root')).trim() || 'root',
            ssh_password: sshPassword,
            strict_tls: strictTls
        }
    };
}

// ==================== 测试连接 ====================

// 表单当前值测试（未保存即可测；不落库不写审计）
router.post('/admin/pve/nodes/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        var resolved = await resolveTestParams(req.body || {});
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        var pveApiSingleton = require('../api/pve-api'); // testConnection 为静态路径，与实例配置无关
        var result = await pveApiSingleton.testConnection(resolved.params);
        if (!result.success) {
            return res.status(400).json({ error: result.message, code: 'PVE_TEST_FAILED', params: [result.message] });
        }
        res.json({ message: result.message, info: result.info || null });
    } catch (e) {
        console.error('[pve-nodes] 测试端点异常:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 行级手动测试（已保存凭据 + 回写探测列）
router.post('/admin/pve/nodes/:id/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        const id = parseInt(req.params.id);
        const node = await db.pveNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'PVE_NODE_NOT_FOUND' });
        var pveApiSingleton = require('../api/pve-api');
        var started = Date.now();
        var result = await pveApiSingleton.testConnection({
            host: node.api_host,
            api_token: node.api_token,
            strict_tls: !!node.strict_tls,
            ssh_host: node.ssh_host,
            ssh_port: node.ssh_port,
            ssh_user: node.ssh_user,
            ssh_password: node.ssh_password
        });
        if (!result.success) {
            await db.pveNodes.updateProbe(id, { latency_ms: null, ok: false, error: result.message });
            return res.status(400).json({ error: result.message, code: 'PVE_TEST_FAILED', params: [result.message] });
        }
        var latency = Date.now() - started;
        await db.pveNodes.updateProbe(id, { latency_ms: latency, ok: true, error: '' });
        res.json({ message: result.message + '（' + latency + 'ms）', info: result.info || null });
    } catch (e) {
        console.error('[pve-nodes] 手动测试异常:', e.message);
        try { await db.pveNodes.updateProbe(parseInt(req.params.id), { latency_ms: null, ok: false, error: safeError(e) }); } catch (_) {}
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ==================== CRUD ====================

router.get('/admin/pve/nodes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        res.json({ nodes: await db.pveNodes.list() });
    } catch (e) {
        console.error('[pve-nodes] 列表失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 轻量状态轮询
router.get('/admin/pve/nodes/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        res.json({ nodes: await db.pveNodes.list() });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 表单下拉选项（可用区 + 爱快节点）
router.get('/admin/pve/nodes/form-options', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const zones = await db.zones.list();
        const ikua = await db.ikuaNodes.list();
        res.json({ zones, ikua_nodes: ikua });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 详情（编辑预填：凭据掩码）
router.get('/admin/pve/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const node = await db.pveNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'PVE_NODE_NOT_FOUND' });
        res.json({
            node: {
                id: node.id, name: node.name, zone_id: node.zone_id,
                ikuai_node_id: node.ikuai_node_id,
                api_host: node.api_host,
                api_token: maskSecret(node.api_token || ''),
                has_api_token: !!node.api_token,
                ssh_host: node.ssh_host, ssh_port: node.ssh_port, ssh_user: node.ssh_user,
                ssh_password: maskSecret(node.ssh_password || ''),
                has_ssh_password: !!node.ssh_password,
                strict_tls: !!node.strict_tls,
                backup_storage: node.backup_storage,
                enabled: !!node.enabled, sort_order: node.sort_order,
                latency_ms: node.latency_ms, last_ok_at: node.last_ok_at,
                last_check_at: node.last_check_at, last_error: node.last_error
            }
        });
    } catch (e) {
        console.error('[pve-nodes] 详情失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 新增（强制测试门禁）
router.post('/admin/pve/nodes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-node-save:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        var body = req.body || {};
        var base = validateNodeBase(body);
        if (base.error) return res.status(400).json({ error: base.error, code: base.code });
        const zone = await db.zones.get(base.value.zone_id);
        if (!zone) return res.status(404).json({ error: '所属可用区不存在', code: 'ZONE_NOT_FOUND' });
        const ik = await db.ikuaNodes.get(base.value.ikuai_node_id);
        if (!ik) return res.status(404).json({ error: '关联的爱快节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        var resolved = await resolveTestParams(body);
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        var p = resolved.params;
        if (!p.api_token) return res.status(400).json({ error: '请填写 API Token', code: 'PVE_TOKEN_REQUIRED' });
        // 强制测试门禁
        var pveApiSingleton = require('../api/pve-api');
        var testResult = await pveApiSingleton.testConnection(p);
        if (!testResult.success) {
            return res.status(400).json({ error: testResult.message, code: 'PVE_TEST_FAILED', params: [testResult.message] });
        }
        const id = await db.pveNodes.create({
            name: base.value.name, zone_id: base.value.zone_id, ikuai_node_id: base.value.ikuai_node_id,
            api_host: base.value.api_host, api_token: p.api_token,
            ssh_host: base.value.ssh_host, ssh_port: base.value.ssh_port, ssh_user: base.value.ssh_user,
            ssh_password: p.ssh_password,
            strict_tls: p.strict_tls, backup_storage: base.value.backup_storage,
            enabled: base.value.enabled, sort_order: base.value.sort_order
        });
        invalidatePveClient(id);
        await audit(req, 'admin.node.pve.create', 'pve_node', id,
            '新增PVE节点: ' + base.value.name + ' (' + base.value.api_host + ')');
        res.json({ message: '节点已创建', id });
    } catch (e) {
        console.error('[pve-nodes] 新增失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 更新（强制测试门禁）
router.put('/admin/pve/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-node-save:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        const id = parseInt(req.params.id);
        const existing = await db.pveNodes.get(id);
        if (!existing) return res.status(404).json({ error: '节点不存在', code: 'PVE_NODE_NOT_FOUND' });
        var body = req.body || {};
        Object.assign(body, { node_id: id }); // 掩码回退源=本节点
        var base = validateNodeBase(body);
        if (base.error) return res.status(400).json({ error: base.error, code: base.code });
        const zone = await db.zones.get(base.value.zone_id);
        if (!zone) return res.status(404).json({ error: '所属可用区不存在', code: 'ZONE_NOT_FOUND' });
        const ik = await db.ikuaNodes.get(base.value.ikuai_node_id);
        if (!ik) return res.status(404).json({ error: '关联的爱快节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        var resolved = await resolveTestParams(body);
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        var p = resolved.params;
        if (!p.api_token) return res.status(400).json({ error: '请填写 API Token', code: 'PVE_TOKEN_REQUIRED' });
        var pveApiSingleton = require('../api/pve-api');
        var testResult = await pveApiSingleton.testConnection(p);
        if (!testResult.success) {
            return res.status(400).json({ error: testResult.message, code: 'PVE_TEST_FAILED', params: [testResult.message] });
        }
        await db.pveNodes.update(id, {
            name: base.value.name, zone_id: base.value.zone_id, ikuai_node_id: base.value.ikuai_node_id,
            api_host: base.value.api_host, api_token: p.api_token,
            ssh_host: base.value.ssh_host, ssh_port: base.value.ssh_port, ssh_user: base.value.ssh_user,
            ssh_password: p.ssh_password,
            strict_tls: p.strict_tls, backup_storage: base.value.backup_storage,
            enabled: base.value.enabled,
            sort_order: body.sort_order !== undefined ? base.value.sort_order : existing.sort_order
        });
        invalidatePveClient(id);
        // 配对关系变化时同步失效对应爱快客户端缓存（无状态影响，仅保险）
        await audit(req, 'admin.node.pve.update', 'pve_node', id,
            '更新PVE节点: ' + existing.name + ' → ' + base.value.name + '（凭据' +
            ((body.api_token !== undefined && body.api_token !== '') || (body.ssh_password !== undefined && body.ssh_password !== '') ? '有变更' : '未变更') + '）');
        res.json({ message: '节点已更新' });
    } catch (e) {
        console.error('[pve-nodes] 更新失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 删除（资产检测拦截）
router.delete('/admin/pve/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const node = await db.pveNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'PVE_NODE_NOT_FOUND' });
        const refs = await db.pveNodes.countReferences(id);
        const total = Object.values(refs).reduce((a, b) => a + b, 0);
        if (total > 0) {
            return res.status(409).json({
                error: '该节点仍被占用，无法删除',
                code: 'PVE_NODE_IN_USE',
                refs
            });
        }
        await db.pveNodes.remove(id);
        invalidatePveClient(id);
        await audit(req, 'admin.node.pve.delete', 'pve_node', id, '删除PVE节点: ' + node.name + ' (' + node.api_host + ')');
        res.json({ message: '节点已删除' });
    } catch (e) {
        console.error('[pve-nodes] 删除失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 备份存储列表：按已保存节点的客户端实时拉取（编辑态下拉）
router.get('/admin/pve/nodes/storages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-storages:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: rateLimitResult.retryAfter });
        }
        const nodeId = req.query.node_id ? parseInt(req.query.node_id) : null;
        if (nodeId == null) {
            return res.status(400).json({ error: '缺少 node_id 参数', code: 'PVE_NODE_NOT_FOUND' });
        }
        const client = await getPveClient(nodeId);
        const list = await client.getStorageList();
        res.json({ storages: list || [] });
    } catch (e) {
        console.error('[pve-nodes] 获取存储列表失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 备份存储列表（新增态预览：按表单连接值直接拉取，不落库）
router.post('/admin/pve/nodes/storages-preview', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-storages:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: rateLimitResult.retryAfter });
        }
        var resolved = await resolveTestParams(req.body || {});
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        var host = resolved.params.host.replace(/\/+$/, '');
        var agent = new https.Agent({ keepAlive: false, rejectUnauthorized: !!resolved.params.strict_tls });
        var resp;
        try {
            resp = await axios.get(host + '/api2/json/storage', {
                headers: { Authorization: 'PVEAPIToken=' + resolved.params.api_token },
                httpsAgent: agent,
                timeout: 10000
            });
        } catch (e) {
            var reason = friendlyTestError(e);
            return res.status(400).json({ error: '获取存储列表失败: ' + reason, code: 'PVE_STORAGES_FAILED', params: [reason] });
        }
        res.json({ storages: (resp.data && resp.data.data) || [] });
    } catch (e) {
        console.error('[pve-nodes] 存储预览异常:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
