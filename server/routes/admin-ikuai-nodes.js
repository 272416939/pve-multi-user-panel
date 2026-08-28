// 爱快节点管理（多节点表单化）—— 仅管理员
// 连接信息存 ikuai_nodes 行（AES 加密）；网络四组设置存节点作用域键 ikuai:<nodeId>:<key>
const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { maskSecret } = require('../utils/crypto-utils');
const { friendlyTestError } = require('../utils/friendly-test-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { getIkuaiClient, invalidateIkuaiClient } = require('../api/ikuai-clients');
const { validateCnameDomain } = require('../utils/cname-validate');

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
    if (!name) return { error: '请填写节点名称', code: 'NODE_NAME_REQUIRED' };
    if (name.length > 100) return { error: '节点名称最长 100 个字符', code: 'NODE_NAME_TOO_LONG' };
    if (/[<>]/.test(name)) return { error: '节点名称不能包含 HTML 标签', code: 'NODE_NAME_INVALID_CHARS' };
    const version = body.version === 'v4' ? 'v4' : 'v3';
    const host = String(body.host || '').trim();
    if (!host) return { error: '请先填写爱快地址', code: 'IKUAI_URL_REQUIRED' };
    if (!/^https?:\/\/\S+$/i.test(host)) {
        return { error: '爱快地址必须以 http:// 或 https:// 开头', code: 'IKUAI_URL_SCHEME' };
    }
    // SSRF 防护：禁止携带用户凭据片段的 URL 形态（与既有保存端点一致的白名单思路）
    if (version === 'v4' && !/^https:\/\/\S+$/i.test(host)) {
        return { error: 'V4 接口仅支持 HTTPS，地址必须以 https:// 开头（可带端口，未填默认 443）', code: 'IKUAI_V4_HTTPS_REQUIRED' };
    }
    return { value: { name, version, host } };
}

// 网络四组设置校验（与 admin-config network-config 端点同规则）
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const IFACE_RE = /^[a-zA-Z0-9_.:-]{1,32}$/;

function validateNetworkSettings(body) {
    const n = body.network || {};
    const intIn = (v, min, max) => {
        if (v === undefined || v === null || v === '') return null;
        const num = parseInt(v);
        if (!Number.isInteger(num) || num < min || num > max) return false;
        return num;
    };
    const checks = [
        ['port_range_start', 1, 65535, '端口段起始值必须是 1~65535 的整数', 'PORT_START_INT'],
        ['port_range_end', 1, 65535, '端口段结束值必须是 1~65535 的整数', 'PORT_END_INT'],
        ['max_per_user', 0, 1000, '每用户端口转发上限必须是 0~1000 的整数', 'FORWARD_LIMIT_INT'],
        ['vlan_id_start', 2, 4090, 'VLANID 开始范围必须是 2~4090 的整数', 'VLAN_START_INT'],
        ['vlan_max_per_user', 0, 1000, '每用户子网数量上限必须是 0~1000 的整数', 'SUBNET_LIMIT_INT']
    ];
    for (const [key, min, max, msg, code] of checks) {
        if (n[key] !== undefined) {
            const r = intIn(n[key], min, max);
            if (r === false) return { error: msg, code };
        }
    }
    if (n.port_range_start !== undefined && n.port_range_end !== undefined) {
        if (parseInt(n.port_range_start) >= parseInt(n.port_range_end)) {
            return { error: '端口段起始值必须小于结束值', code: 'PORT_START_LT_END' };
        }
    }
    const ipv4Fields = [
        ['dhcp_ip_range_start', 'DHCP IP 段起始值必须是合法 IPv4 地址', 'DHCP_START_IPV4'],
        ['dhcp_ip_range_end', 'DHCP IP 段结束值必须是合法 IPv4 地址', 'DHCP_END_IPV4'],
        ['dhcp_gateway', 'DHCP 网关必须是合法 IPv4 地址', 'DHCP_GW_IPV4'],
        ['dhcp_dns1', 'DHCP DNS1 必须是合法 IPv4 地址', 'DHCP_DNS1_IPV4'],
        ['dhcp_dns2', 'DHCP DNS2 必须是合法 IPv4 地址', 'DHCP_DNS2_IPV4'],
        ['vlan_ip_segment_start', 'IP 段开始范围必须是合法 IPv4 地址', 'IP_START_IPV4']
    ];
    for (const [key, msg, code] of ipv4Fields) {
        if (n[key] !== undefined && n[key] !== '' && !IPV4_RE.test(String(n[key]).trim())) {
            return { error: msg, code };
        }
    }
    for (const key of ['dhcp_interface', 'vlan_interface']) {
        if (n[key] !== undefined && n[key] !== '' && !IFACE_RE.test(String(n[key]).trim())) {
            return { error: '接口名格式无效（仅字母数字_.:-，≤32字符）', code: 'IFNAME_INVALID' };
        }
    }
    if (n.cname_domain !== undefined && n.cname_domain !== '') {
        const r = validateCnameDomain(n.cname_domain);
        if (!r.ok) return { error: r.error || 'CNAME 域名格式无效或过长', code: r.code };
    }
    return { value: n };
}

// 网络四组设置持久化（只写提供的键；写入节点作用域）
async function saveNetworkSettings(nodeId, n) {
    const set = db.config.setIkuaiSetting;
    if (n.port_range_start !== undefined) await set('forward:port_range_start', String(parseInt(n.port_range_start)), nodeId);
    if (n.port_range_end !== undefined) await set('forward:port_range_end', String(parseInt(n.port_range_end)), nodeId);
    if (n.default_protocol !== undefined) await set('forward:default_protocol', String(n.default_protocol).trim(), nodeId);
    if (n.wan_interface !== undefined) {
        let arr = [];
        if (Array.isArray(n.wan_interface)) arr = n.wan_interface.filter(Boolean);
        else if (typeof n.wan_interface === 'string') arr = n.wan_interface.split(',').map(s => s.trim()).filter(Boolean);
        await set('forward:wan_interface', JSON.stringify(arr), nodeId);
    }
    if (n.max_per_user !== undefined) await set('forward:max_per_user', String(parseInt(n.max_per_user)), nodeId);
    if (n.dhcp_ip_range_start !== undefined) await set('dhcp:ip_range_start', String(n.dhcp_ip_range_start).trim(), nodeId);
    if (n.dhcp_ip_range_end !== undefined) await set('dhcp:ip_range_end', String(n.dhcp_ip_range_end).trim(), nodeId);
    if (n.dhcp_interface !== undefined) await set('dhcp:interface', String(n.dhcp_interface).trim(), nodeId);
    if (n.dhcp_gateway !== undefined) await set('dhcp:gateway', String(n.dhcp_gateway).trim(), nodeId);
    if (n.dhcp_dns1 !== undefined) await set('dhcp:dns1', String(n.dhcp_dns1).trim(), nodeId);
    if (n.dhcp_dns2 !== undefined) await set('dhcp:dns2', String(n.dhcp_dns2).trim(), nodeId);
    if (n.vlan_ip_segment_start !== undefined) await set('vlan:ip_segment_start', String(n.vlan_ip_segment_start).trim(), nodeId);
    if (n.vlan_id_start !== undefined) await set('vlan:id_start', String(parseInt(n.vlan_id_start)), nodeId);
    if (n.vlan_interface !== undefined) await set('vlan:interface', String(n.vlan_interface).trim(), nodeId);
    if (n.vlan_max_per_user !== undefined) await set('vlan:max_per_user', String(parseInt(n.vlan_max_per_user)), nodeId);
    if (n.cname_domain !== undefined) await set('cname:domain', String(n.cname_domain).trim(), nodeId);
}

// ==================== 测试连接 ====================

// 表单当前值测试：敏感字段占位判定 = 与 maskSecret(已保存值) 精确相等才回退读库（cf3ca4f 范式）
// body.node_id 存在时回退源为该节点行（编辑态），否则为旧全局配置
async function resolveTestParams(body) {
    var saved;
    if (body.node_id !== undefined && body.node_id !== null && body.node_id !== '') {
        saved = await db.ikuaNodes.get(parseInt(body.node_id));
        if (!saved) return { error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' };
    } else {
        saved = await db.config.getIkuai();
    }
    var host = String(body.host !== undefined ? body.host : (saved.host || '')).trim();
    var version = body.version === 'v4' ? 'v4' : (saved.version === 'v4' ? 'v4' : 'v3');
    var username = String(body.username !== undefined ? body.username : (saved.username || '')).trim();
    var savedPwdMask = maskSecret(saved.password || '');
    var savedApiKeyMask = maskSecret(saved.api_key || '');
    var apiKeyEmpty = body.api_key === undefined || body.api_key === '';
    var pwdChanged = body.password !== undefined && body.password !== '' && body.password !== savedPwdMask;
    var apiKeyChanged = !apiKeyEmpty && body.api_key !== savedApiKeyMask;
    var password = pwdChanged ? body.password : (saved.password || '');
    var apiKey = apiKeyChanged ? body.api_key : (saved.api_key || '');
    var strictTls = body.strict_tls !== undefined ? !!body.strict_tls : !!saved.strict_tls;
    return { params: { host, username, password, api_key: apiKey, version, strict_tls: strictTls } };
}

async function runTest(res, params) {
    try {
        // 独立测试实例：不落库、不动任何节点客户端缓存与登录态（testConnectionWith 静态路径）
        const { IkuaiApi } = require('../api/ikuai-api');
        var tester = new IkuaiApi(null);
        var result = await tester.testConnectionWith(params);
        return { ok: true, info: result || null };
    } catch (e) {
        console.error('[ikuai-nodes] 测试连接失败:', e.message);
        var reason = friendlyTestError(e);
        res.status(400).json({ error: reason, code: 'IKUAI_TEST_FAILED', params: [reason] });
        return { ok: false };
    }
}

// VLAN 父接口不得是设备上已有的 VLAN 子接口（VLAN 不能嵌套，选中后建子网必失败）。
// 走静态路径按表单凭据枚举，best-effort：枚举失败（网络/权限）不阻断保存。
// 返回 true=已响应 400，调用方须直接 return。
async function rejectNestedVlanIface(res, params, vlanIface) {
    var name = String(vlanIface || '').trim();
    if (!name) return false;
    try {
        const { IkuaiApi } = require('../api/ikuai-api');
        var probe = new IkuaiApi(null);
        var names = await probe.getVlanNamesWith(params);
        if (Array.isArray(names) && names.indexOf(name) > -1) {
            res.status(400).json({
                error: 'VLAN 父接口不能选择已有的 VLAN 子接口，请选择物理 LAN 接口',
                code: 'VLAN_PARENT_IS_VLAN'
            });
            return true;
        }
    } catch (e) {
        console.error('[ikuai-nodes] VLAN 父接口校验跳过（枚举失败）:', e.message);
    }
    return false;
}

// 表单当前值测试（未保存即可测；不落库不写审计）
router.post('/admin/ikuai/nodes/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        var resolved = await resolveTestParams(req.body || {});
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        // 测试端点是连通性验证：不需要节点名称/区域等基础信息，只校验地址与凭据
        var p = resolved.params;
        if (!p.host) return res.status(400).json({ error: '请先填写爱快地址', code: 'IKUAI_URL_REQUIRED' });
        if (!/^https?:\/\/\S+$/i.test(p.host)) {
            return res.status(400).json({ error: '爱快地址必须以 http:// 或 https:// 开头', code: 'IKUAI_URL_SCHEME' });
        }
        if (p.version === 'v4' && !/^https:\/\/\S+$/i.test(p.host)) {
            return res.status(400).json({ error: 'V4 接口仅支持 HTTPS，地址必须以 https:// 开头（可带端口，未填默认 443）', code: 'IKUAI_V4_HTTPS_REQUIRED' });
        }
        if (p.version === 'v4' && !p.api_key) {
            return res.status(400).json({ error: 'V4 模式需要填写 API Token', code: 'IKUAI_V4_KEY_REQUIRED' });
        }
        if (p.version !== 'v4' && (!p.username || !p.password)) {
            return res.status(400).json({ error: 'V3 模式需要填写用户名与密码', code: 'IKUAI_CREDENTIALS_REQUIRED' });
        }
        var result = await runTest(res, p);
        if (result.ok) res.json({ message: '连接成功', info: result.info });
    } catch (e) {
        console.error('[ikuai-nodes] 测试端点异常:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 行级手动测试（用已保存凭据真实测试 + 回写探测列）
router.post('/admin/ikuai/nodes/:id/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const node = await db.ikuaNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        var started = Date.now();
        var result = await runTest(res, {
            host: node.host, username: node.username, password: node.password,
            api_key: node.api_key, version: node.version, strict_tls: !!node.strict_tls
        });
        if (!result.ok) {
            await db.ikuaNodes.updateProbe(id, { latency_ms: null, ok: false, error: '手动测试失败', code: 'MANUAL_TEST_FAILED' });
            return;
        }
        var latency = Date.now() - started;
        await db.ikuaNodes.updateProbe(id, { latency_ms: latency, ok: true, error: '' });
        res.json({ message: '连接成功（' + latency + 'ms）', info: result.info });
    } catch (e) {
        console.error('[ikuai-nodes] 手动测试异常:', e.message);
        try { await db.ikuaNodes.updateProbe(parseInt(req.params.id), { latency_ms: null, ok: false, error: safeError(e) }); } catch (_) {}
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ==================== CRUD ====================

// 列表（不含密文，返回 has_ 标记 + 探测状态）
router.get('/admin/ikuai/nodes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        res.json({ nodes: await db.ikuaNodes.list() });
    } catch (e) {
        console.error('[ikuai-nodes] 列表失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 轻量状态轮询（30s 定时任务回写后前端拉取）
router.get('/admin/ikuai/nodes/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        res.json({ nodes: await db.ikuaNodes.list() });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 节点外网接口列表（表单 WAN 下拉实时刷新）
router.get('/admin/ikuai/nodes/interfaces', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-ifaces:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: rateLimitResult.retryAfter });
        }
        const nodeId = req.query.node_id ? parseInt(req.query.node_id) : null;
        var client = await getIkuaiClient(nodeId);
        var list = await client.getInterfaces();
        res.json({ interfaces: list || [] });
    } catch (e) {
        console.error('[ikuai-nodes] 获取接口失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 详情（编辑预填：连接字段掩码 + 节点作用域网络设置）
router.get('/admin/ikuai/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const node = await db.ikuaNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const g = (k) => db.config.getIkuaiSetting(k, id);
        const network = {
            port_range_start: await g('forward:port_range_start'),
            port_range_end: await g('forward:port_range_end'),
            default_protocol: await g('forward:default_protocol'),
            wan_interface: await g('forward:wan_interface'),
            max_per_user: await g('forward:max_per_user'),
            dhcp_ip_range_start: await g('dhcp:ip_range_start'),
            dhcp_ip_range_end: await g('dhcp:ip_range_end'),
            dhcp_interface: await g('dhcp:interface'),
            dhcp_gateway: await g('dhcp:gateway'),
            dhcp_dns1: await g('dhcp:dns1'),
            dhcp_dns2: await g('dhcp:dns2'),
            vlan_ip_segment_start: await g('vlan:ip_segment_start'),
            vlan_id_start: await g('vlan:id_start'),
            vlan_interface: await g('vlan:interface'),
            vlan_max_per_user: await g('vlan:max_per_user'),
            cname_domain: await g('cname:domain')
        };
        res.json({
            node: {
                id: node.id, name: node.name, version: node.version, host: node.host,
                username: node.username,
                password: maskSecret(node.password || ''),
                api_key: maskSecret(node.api_key || ''),
                has_password: !!node.password, has_api_key: !!node.api_key,
                strict_tls: !!node.strict_tls, enabled: !!node.enabled,
                sort_order: node.sort_order,
                latency_ms: node.latency_ms, last_ok_at: node.last_ok_at,
                last_check_at: node.last_check_at, last_error: node.last_error
            },
            network
        });
    } catch (e) {
        console.error('[ikuai-nodes] 详情失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 新增（强制测试门禁：测试通过才能提交）
router.post('/admin/ikuai/nodes', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-node-save:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_OP', retryAfter: rateLimitResult.retryAfter });
        }
        var body = req.body || {};
        var base = validateNodeBase(body);
        if (base.error) return res.status(400).json({ error: base.error, code: base.code });
        var netCheck = validateNetworkSettings(body);
        if (netCheck.error) return res.status(400).json({ error: netCheck.error, code: netCheck.code });
        var resolved = await resolveTestParams(body);
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        // 凭据完整性校验
        var p = resolved.params;
        if (p.version === 'v4') {
            if (!p.api_key) return res.status(400).json({ error: 'V4 模式需要填写 API Token', code: 'IKUAI_V4_KEY_REQUIRED' });
        } else if (!p.username || !p.password) {
            return res.status(400).json({ error: 'V3 模式需要填写用户名与密码', code: 'IKUAI_CREDENTIALS_REQUIRED' });
        }
        // 强制测试门禁：失败直接 400 阻断保存
        var result = await runTest(res, p);
        if (!result.ok) return;
        if (await rejectNestedVlanIface(res, p, (netCheck.value || {}).vlan_interface)) return;
        const id = await db.ikuaNodes.create({
            name: base.value.name, version: base.value.version, host: base.value.host,
            username: p.username, password: p.version === 'v3' ? p.password : '',
            api_key: p.version === 'v4' ? p.api_key : '',
            strict_tls: p.strict_tls, enabled: body.enabled !== false,
            sort_order: body.sort_order || 0
        });
        await saveNetworkSettings(id, netCheck.value || {});
        invalidateIkuaiClient(id);
        await audit(req, 'admin.node.ikuai.create', 'ikuai_node', id,
            '新增爱快节点: ' + base.value.name + ' (' + base.value.version.toUpperCase() + ' ' + base.value.host + ')');
        res.json({ message: '节点已创建', id });
    } catch (e) {
        console.error('[ikuai-nodes] 新增失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 更新（同样强制测试门禁）
router.put('/admin/ikuai/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-node-save:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_OP', retryAfter: rateLimitResult.retryAfter });
        }
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const existing = await db.ikuaNodes.get(id);
        if (!existing) return res.status(404).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        var body = req.body || {};
        Object.assign(body, { node_id: id }); // 掩码回退源=本节点
        var base = validateNodeBase(body);
        if (base.error) return res.status(400).json({ error: base.error, code: base.code });
        var netCheck = validateNetworkSettings(body);
        if (netCheck.error) return res.status(400).json({ error: netCheck.error, code: netCheck.code });
        var resolved = await resolveTestParams(body);
        if (resolved.error) return res.status(400).json({ error: resolved.error, code: resolved.code });
        var p = resolved.params;
        if (p.version === 'v4') {
            if (!p.api_key) return res.status(400).json({ error: 'V4 模式需要填写 API Token', code: 'IKUAI_V4_KEY_REQUIRED' });
        } else if (!p.username || !p.password) {
            return res.status(400).json({ error: 'V3 模式需要填写用户名与密码', code: 'IKUAI_CREDENTIALS_REQUIRED' });
        }
        var result = await runTest(res, p);
        if (!result.ok) return;
        if (await rejectNestedVlanIface(res, p, (netCheck.value || {}).vlan_interface)) return;
        await db.ikuaNodes.update(id, {
            name: base.value.name, version: base.value.version, host: base.value.host,
            username: p.username, password: p.password, api_key: p.api_key,
            strict_tls: p.strict_tls, enabled: body.enabled !== false,
            sort_order: body.sort_order !== undefined ? body.sort_order : existing.sort_order
        });
        await saveNetworkSettings(id, netCheck.value || {});
        invalidateIkuaiClient(id);
        await audit(req, 'admin.node.ikuai.update', 'ikuai_node', id,
            '更新爱快节点: ' + existing.name + ' → ' + base.value.name + '（凭据' +
            ((body.password !== undefined && body.password !== '') || (body.api_key !== undefined && body.api_key !== '') ? '有变更' : '未变更') + '）');
        res.json({ message: '节点已更新' });
    } catch (e) {
        console.error('[ikuai-nodes] 更新失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 删除（资产检测拦截：被 PVE 配对/私有子网/端口转发引用时拒绝）
router.delete('/admin/ikuai/nodes/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        if (!Number.isInteger(id)) return res.status(400).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const node = await db.ikuaNodes.get(id);
        if (!node) return res.status(404).json({ error: '节点不存在', code: 'IKUAI_NODE_NOT_FOUND' });
        const refs = await db.ikuaNodes.countReferences(id);
        const total = refs.pveNodes + refs.subnets + refs.portForwards;
        if (total > 0) {
            return res.status(409).json({
                error: '该节点仍被占用，无法删除',
                code: 'IKUAI_NODE_IN_USE',
                refs
            });
        }
        await db.ikuaNodes.remove(id);
        // 清理节点作用域配置键
        try { await require('../api/db-core').execute("DELETE FROM config WHERE `key` LIKE ?", ['ikuai:' + id + ':%']); } catch (_) {}
        invalidateIkuaiClient(id);
        await audit(req, 'admin.node.ikuai.delete', 'ikuai_node', id, '删除爱快节点: ' + node.name + ' (' + node.host + ')');
        res.json({ message: '节点已删除' });
    } catch (e) {
        console.error('[ikuai-nodes] 删除失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
