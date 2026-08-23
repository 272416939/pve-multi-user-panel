const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createDhcpStaticBinding, getWanInterface, getWanInterfaces } = require('../services/dhcp');
// ikuai_id 解析/序列化单一来源（services/port-forward-sync.js，禁止本地双份拷贝）
const { parseIkuaiIds, stringifyIkuaiIds, deleteIkuaiRuleStrict } = require('../services/port-forward-sync');
const dbg = require('../utils/debug');
const { safeError } = require('../utils/safe-error');
// CNAME 域名配置校验纯函数（utils/cname-validate.js，格式与前端 parseCnameEntries 对齐）
const { validateCnameDomain, splitCnameEntry } = require('../utils/cname-validate');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
// 统一审计埋点（utils/audit-log.js 导出，route 内不复刻包装函数）
const { auditAction } = require('../utils/audit-log');

// 端口转发审计详情：新增端口[内网]→[外网] + 资源标识（general 无标识）
function portAuditDetail(action, rule, vmId, ctId) {
    var detail = action + '端口[' + rule.internal_port + ']→[' + rule.external_port + ']';
    if (vmId) detail += ' VM ' + vmId;
    else if (ctId) detail += ' LXC ' + ctId;
    return detail;
}

// 网络配置字段审计标签：请求字段 → 中文标签 → 默认值（db 未设置时等价于该默认值，与 GET /admin/network/config 返回一致）
const NETWORK_CHANGE_FIELDS = {
    port_range_start: { label: '端口段起始', fallback: '50000' },
    port_range_end: { label: '端口段结束', fallback: '60000' },
    default_protocol: { label: '默认协议', fallback: 'tcp' },
    max_per_user: { label: '每用户端口上限', fallback: '10' },
    dhcp_ip_range_start: { label: 'DHCP起始IP', fallback: '10.0.0.110' },
    dhcp_ip_range_end: { label: 'DHCP结束IP', fallback: '10.0.0.199' },
    dhcp_interface: { label: 'DHCP接口', fallback: 'lan2' },
    dhcp_gateway: { label: 'DHCP网关', fallback: '10.0.0.1' },
    dhcp_dns1: { label: 'DHCP DNS1', fallback: '180.76.76.76' },
    dhcp_dns2: { label: 'DHCP DNS2', fallback: '223.5.5.5' },
    vlan_ip_segment_start: { label: 'VLAN IP段', fallback: '172.16.0.1' },
    vlan_id_start: { label: 'VLAN起始ID', fallback: '1000' },
    vlan_interface: { label: 'VLAN接口', fallback: 'lan1' },
    vlan_max_per_user: { label: '每用户子网上限', fallback: '5' }
};

// 按实际变化的网络配置字段生成审计详情（返回 ['中文标签:新值', ...]，无变化返回空数组）
// 外网接口特殊处理：入库为 JSON 数组，排序后比较（顺序变化不算变更）
function buildNetworkChanges(before, after) {
    var changes = [];
    Object.keys(NETWORK_CHANGE_FIELDS).forEach(function(k) {
        var raw = before[k];
        if (raw === null || raw === undefined || raw === '') raw = NETWORK_CHANGE_FIELDS[k].fallback;
        var oldV = String(raw).trim();
        var newV = String(after[k] == null ? NETWORK_CHANGE_FIELDS[k].fallback : after[k]).trim();
        if (oldV !== newV) changes.push(NETWORK_CHANGE_FIELDS[k].label + ':' + newV);
    });
    var oldWan = before.wan_interface || '';
    var oldWanArr = [];
    try { oldWanArr = JSON.parse(oldWan); if (!Array.isArray(oldWanArr)) oldWanArr = []; } catch (_) { oldWanArr = oldWan ? oldWan.split(',') : []; }
    var oldWanKey = oldWanArr.filter(Boolean).map(function(s) { return String(s).trim(); }).sort().join(',');
    var newWanKey = (after.wan_interface || []).filter(Boolean).map(function(s) { return String(s).trim(); }).sort().join(',');
    if (oldWanKey !== newWanKey) changes.push('外网接口:' + (newWanKey || '空'));
    return changes;
}

// CNAME 域名变更审计详情：条目级 diff（新增/删除/修改），无变化返回空串
// 条目格式 label||.domain（splitCnameEntry 解析，与前端 parseCnameEntries 对齐）
function buildCnameDetail(oldStr, newStr) {
    function parseCname(str) {
        return (str || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).map(function(entry) {
            return splitCnameEntry(entry);
        });
    }
    var oldItems = parseCname(oldStr);
    var newItems = parseCname(newStr);
    var oldKeys = {}, newKeys = {};
    oldItems.forEach(function(it) { oldKeys[it.label + '||' + it.domain] = true; });
    newItems.forEach(function(it) { newKeys[it.label + '||' + it.domain] = true; });
    var added = [], removed = [], modified = [];
    newItems.forEach(function(ni) {
        var key = ni.label + '||' + ni.domain;
        if (oldKeys[key]) return; // 条目无变化
        var oldSameLabel = null;
        for (var i = 0; i < oldItems.length; i++) {
            if (oldItems[i].label === ni.label) { oldSameLabel = oldItems[i]; break; }
        }
        if (oldSameLabel) modified.push(ni.label + '||' + oldSameLabel.domain + '→' + ni.domain);
        else added.push(key);
    });
    oldItems.forEach(function(oi) {
        var key = oi.label + '||' + oi.domain;
        if (newKeys[key]) return;
        var newSameLabel = newItems.some(function(ni) { return ni.label === oi.label; });
        if (!newSameLabel) removed.push(key);
    });
    var parts = [];
    if (added.length) parts.push('新增:' + added.join(','));
    if (removed.length) parts.push('删除:' + removed.join(','));
    if (modified.length) parts.push('修改:' + modified.join(','));
    if (!parts.length) return '';
    return '更新CNAME域名(' + parts.join(',') + ')';
}

router.get('/admin/network/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let ifaceList = [];
        try { ifaceList = JSON.parse(await db.config.get('forward:iface_list') || '[]'); } catch (_) {}
        // wan_interface 返回逗号分隔字符串（前端文本框使用），兼容旧格式（单值字符串）和新格式（JSON 数组）
        let wanInterface = '';
        const rawWan = await db.config.get('forward:wan_interface');
        if (rawWan) {
            try {
                const parsed = JSON.parse(rawWan);
                if (Array.isArray(parsed)) wanInterface = parsed.filter(Boolean).join(',');
                else if (typeof parsed === 'string') wanInterface = parsed;
            } catch (_) { wanInterface = rawWan; }
        }
        res.json({
            port_range_start: parseInt(await db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(await db.config.get('forward:port_range_end')) || 60000,
            default_protocol: await db.config.get('forward:default_protocol') || 'tcp',
            wan_interface: wanInterface,
            max_per_user: parseInt(await db.config.get('forward:max_per_user')) || 10,
            iface_list: ifaceList,
            dhcp_ip_range_start: await db.config.get('dhcp:ip_range_start') || '10.0.0.110',
            dhcp_ip_range_end: await db.config.get('dhcp:ip_range_end') || '10.0.0.199',
            dhcp_interface: await db.config.get('dhcp:interface') || 'lan2',
            dhcp_gateway: await db.config.get('dhcp:gateway') || '10.0.0.1',
            dhcp_dns1: await db.config.get('dhcp:dns1') || '180.76.76.76',
            dhcp_dns2: await db.config.get('dhcp:dns2') || '223.5.5.5',
            vlan_ip_segment_start: await db.config.get('vlan:ip_segment_start') || '172.16.0.1',
            vlan_id_start: parseInt(await db.config.get('vlan:id_start')) || 1000,
            vlan_interface: await db.config.get('vlan:interface') || 'lan1',
            vlan_max_per_user: parseInt(await db.config.get('vlan:max_per_user')) || 5,
            cname_domain: await db.config.get('cname:domain') || ''
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/admin/network/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { port_range_start, port_range_end, default_protocol, wan_interface, max_per_user,
                dhcp_ip_range_start, dhcp_ip_range_end, dhcp_interface, dhcp_gateway, dhcp_dns1, dhcp_dns2,
                vlan_ip_segment_start, vlan_id_start, vlan_interface, vlan_max_per_user,
                cname_domain } = req.body;
        // 私有网络 VLAN 设置校验：IP 段必须为合法 IPv4，VLAN ID 起始值必须在 2~4090
        const ipv4Re = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (vlan_ip_segment_start !== undefined && !ipv4Re.test(String(vlan_ip_segment_start).trim())) {
            return res.status(400).json({ error: 'IP 段开始范围必须是合法 IPv4 地址' });
        }
        if (vlan_id_start !== undefined) {
            const vlanIdNum = parseInt(vlan_id_start);
            if (!Number.isInteger(vlanIdNum) || vlanIdNum < 2 || vlanIdNum > 4090) {
                return res.status(400).json({ error: 'VLANID 开始范围必须是 2~4090 的整数' });
            }
        }
        if (vlan_max_per_user !== undefined) {
            const vlanMaxNum = parseInt(vlan_max_per_user);
            if (!Number.isInteger(vlanMaxNum) || vlanMaxNum < 0 || vlanMaxNum > 1000) {
                return res.status(400).json({ error: '每用户子网数量上限必须是 0~1000 的整数' });
            }
        }
        // L-1 修复：端口段/max_per_user/DHCP IP 段/接口/cname 域名校验（防负值/非法 IP/超长串入库）
        if (port_range_start !== undefined) {
            const startNum = parseInt(port_range_start);
            if (!Number.isInteger(startNum) || startNum < 1 || startNum > 65535) {
                return res.status(400).json({ error: '端口段起始值必须是 1~65535 的整数' });
            }
        }
        if (port_range_end !== undefined) {
            const endNum = parseInt(port_range_end);
            if (!Number.isInteger(endNum) || endNum < 1 || endNum > 65535) {
                return res.status(400).json({ error: '端口段结束值必须是 1~65535 的整数' });
            }
        }
        if (port_range_start !== undefined && port_range_end !== undefined) {
            if (parseInt(port_range_start) >= parseInt(port_range_end)) {
                return res.status(400).json({ error: '端口段起始值必须小于结束值' });
            }
        }
        if (max_per_user !== undefined) {
            const maxNum = parseInt(max_per_user);
            if (!Number.isInteger(maxNum) || maxNum < 0 || maxNum > 1000) {
                return res.status(400).json({ error: '每用户端口转发上限必须是 0~1000 的整数' });
            }
        }
        if (dhcp_ip_range_start !== undefined && !ipv4Re.test(String(dhcp_ip_range_start).trim())) {
            return res.status(400).json({ error: 'DHCP IP 段起始值必须是合法 IPv4 地址' });
        }
        if (dhcp_ip_range_end !== undefined && !ipv4Re.test(String(dhcp_ip_range_end).trim())) {
            return res.status(400).json({ error: 'DHCP IP 段结束值必须是合法 IPv4 地址' });
        }
        if (dhcp_gateway !== undefined && !ipv4Re.test(String(dhcp_gateway).trim())) {
            return res.status(400).json({ error: 'DHCP 网关必须是合法 IPv4 地址' });
        }
        if (dhcp_dns1 !== undefined && !ipv4Re.test(String(dhcp_dns1).trim())) {
            return res.status(400).json({ error: 'DHCP DNS1 必须是合法 IPv4 地址' });
        }
        if (dhcp_dns2 !== undefined && !ipv4Re.test(String(dhcp_dns2).trim())) {
            return res.status(400).json({ error: 'DHCP DNS2 必须是合法 IPv4 地址' });
        }
        // 接口名与域名：白名单字符 + 长度限制
        const ifaceRe = /^[a-zA-Z0-9_.:-]{1,32}$/;
        if (dhcp_interface !== undefined && !ifaceRe.test(String(dhcp_interface).trim())) {
            return res.status(400).json({ error: 'DHCP 接口名格式无效（仅字母数字_.:-，≤32字符）' });
        }
        if (vlan_interface !== undefined && !ifaceRe.test(String(vlan_interface).trim())) {
            return res.status(400).json({ error: 'VLAN 接口名格式无效（仅字母数字_.:-，≤32字符）' });
        }
        // CNAME 校验：支持前端 label||.domain 逗号分隔多条目格式（含旧格式兼容），逐条校验域名与长度
        if (cname_domain !== undefined) {
            const cnameResult = validateCnameDomain(cname_domain);
            if (!cnameResult.ok) {
                return res.status(400).json({ error: cnameResult.error || 'CNAME 域名格式无效或过长' });
            }
        }
        // 操作审计前置：读取变更前的配置值（用于按实际变化字段生成审计）
        const before = {
            port_range_start: await db.config.get('forward:port_range_start'),
            port_range_end: await db.config.get('forward:port_range_end'),
            default_protocol: await db.config.get('forward:default_protocol'),
            wan_interface: await db.config.get('forward:wan_interface'),
            max_per_user: await db.config.get('forward:max_per_user'),
            dhcp_ip_range_start: await db.config.get('dhcp:ip_range_start'),
            dhcp_ip_range_end: await db.config.get('dhcp:ip_range_end'),
            dhcp_interface: await db.config.get('dhcp:interface'),
            dhcp_gateway: await db.config.get('dhcp:gateway'),
            dhcp_dns1: await db.config.get('dhcp:dns1'),
            dhcp_dns2: await db.config.get('dhcp:dns2'),
            vlan_ip_segment_start: await db.config.get('vlan:ip_segment_start'),
            vlan_id_start: await db.config.get('vlan:id_start'),
            vlan_interface: await db.config.get('vlan:interface'),
            vlan_max_per_user: await db.config.get('vlan:max_per_user'),
            cname_domain: await db.config.get('cname:domain')
        };
        // wan_interface 存储为 JSON 数组，兼容前端传入逗号分隔字符串、数组或单值
        let wanIfaceToStore = [];
        if (Array.isArray(wan_interface)) {
            wanIfaceToStore = wan_interface.filter(Boolean);
        } else if (typeof wan_interface === 'string') {
            wanIfaceToStore = wan_interface.split(',').map(s => s.trim()).filter(Boolean);
        }
        // 归一化后的新值（入库值与审计 diff 共用，避免两处口径不一致）
        const after = {
            port_range_start: String(port_range_start ?? 50000),
            port_range_end: String(port_range_end ?? 60000),
            default_protocol: default_protocol || 'tcp',
            wan_interface: wanIfaceToStore,
            max_per_user: String(max_per_user ?? 10),
            dhcp_ip_range_start: dhcp_ip_range_start || '10.0.0.110',
            dhcp_ip_range_end: dhcp_ip_range_end || '10.0.0.199',
            dhcp_interface: dhcp_interface || 'lan2',
            dhcp_gateway: dhcp_gateway || '10.0.0.1',
            dhcp_dns1: dhcp_dns1 || '180.76.76.76',
            dhcp_dns2: dhcp_dns2 || '223.5.5.5',
            vlan_ip_segment_start: String(vlan_ip_segment_start || '172.16.0.1').trim(),
            vlan_id_start: String(vlan_id_start ?? 1000),
            vlan_interface: (vlan_interface || 'lan1').trim(),
            vlan_max_per_user: String(vlan_max_per_user ?? 5),
            cname_domain: (cname_domain || '').trim()
        };
        const setConfig = db.config.set;
        await setConfig('forward:port_range_start', after.port_range_start);
        await setConfig('forward:port_range_end', after.port_range_end);
        await setConfig('forward:default_protocol', after.default_protocol);
        await setConfig('forward:wan_interface', JSON.stringify(after.wan_interface));
        await setConfig('forward:max_per_user', after.max_per_user);
        await setConfig('dhcp:ip_range_start', after.dhcp_ip_range_start);
        await setConfig('dhcp:ip_range_end', after.dhcp_ip_range_end);
        await setConfig('dhcp:interface', after.dhcp_interface);
        await setConfig('dhcp:gateway', after.dhcp_gateway);
        await setConfig('dhcp:dns1', after.dhcp_dns1);
        await setConfig('dhcp:dns2', after.dhcp_dns2);
        await setConfig('vlan:ip_segment_start', after.vlan_ip_segment_start);
        await setConfig('vlan:id_start', after.vlan_id_start);
        await setConfig('vlan:interface', after.vlan_interface);
        await setConfig('vlan:max_per_user', after.vlan_max_per_user);
        await setConfig('cname:domain', after.cname_domain);
        // 操作审计：按实际变化的字段记录（改了什么记什么；CNAME 单独成条，不再混入网络配置）
        try {
            const { auditLog } = require('../utils/audit-log');
            const changes = buildNetworkChanges(before, after);
            const cnameDetail = buildCnameDetail(before.cname_domain, after.cname_domain);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.network', resourceType: 'config', resourceId: 'network', details: '更新网络配置(' + changes.join(',') + ')', req });
            }
            if (cnameDetail) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.cname', resourceType: 'config', resourceId: 'cname', details: cnameDetail, req });
            }
        } catch (e) {}
        res.json({ message: '网络配置已更新' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// CNAME 域名配置：所有已登录用户可读取，仅管理员可写入
// 注意：路由挂载在 /api 前缀下（server.js），此处写 /cname，真实 URL 为 /api/cname（与前端 api('/cname') 对齐）
router.get('/cname', authMiddleware, async (req, res) => {
    try {
        const domain = await db.config.get('cname:domain') || '';
        res.json({ cname_domain: domain });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// P2-H1⑤ 修复：iKuai 接口信息需管理员权限（泄露内网拓扑）
router.get('/ikuai/interfaces', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const interfaces = await ikuaiApi.getInterfaces();
        const wanIfaces = interfaces.filter(i => i.type === 'wan');
        
        // 自动对比：已存储的 WAN 接口中，移除 ikuai 上已不存在的接口
        const storedIfaces = await getWanInterfaces();
        if (storedIfaces.length > 0 && wanIfaces.length > 0) {
            const wanNames = wanIfaces.map(i => i.name);
            const valid = storedIfaces.filter(name => wanNames.includes(name));
            if (valid.length !== storedIfaces.length) {
                // 全部失效时回退到第一个可用 WAN 接口
                const toStore = valid.length > 0 ? valid : [wanIfaces[0].name];
                await db.config.set('forward:wan_interface', JSON.stringify(toStore));
                console.log(`[端口转发] 接口配置已更新: ${storedIfaces.join(',')} → ${toStore.join(',')}`);
            }
        }
        
        // 缓存完整接口列表到数据库（含 WAN + LAN），前端加载后直接使用
        await db.config.set('forward:iface_list', JSON.stringify(interfaces));
        
        res.json(interfaces);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/ikuai/sync-dhcp-bindings', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const bindings = await ikuaiApi.getDhcpStaticBindings();
        let updated = 0, skipped = 0, errors = 0;

        // PERF-05: 循环外一次性获取所有 VM 和 LXC，构建 Map，避免循环内全表查询（N+1）
        const allVms = await db.vms.getAll();
        const vmByVmId = {};
        allVms.forEach(v => { vmByVmId[v.vm_id] = v; });
        const allLxc = await db.lxcContainers.getAll();
        const lxcByCtId = {};
        allLxc.forEach(l => { lxcByCtId[l.ct_id] = l; });

        for (const b of bindings) {
            // comment 格式: VM-{id} 或 CT-{id}
            const vmMatch = b.comment.match(/^VM-(\d+)$/);
            const ctMatch = b.comment.match(/^CT-(\d+)$/);

            if (!vmMatch && !ctMatch) {
                skipped++;
                continue;
            }

            try {
                if (vmMatch) {
                    const vmId = parseInt(vmMatch[1]);
                    const vm = vmByVmId[vmId];
                    if (vm && vm.dhcp_static_ip !== b.ip) {
                        await db.vms.update(vm.id, { dhcp_static_ip: b.ip });
                        updated++;
                    } else {
                        skipped++;
                    }
                } else if (ctMatch) {
                    const ctId = parseInt(ctMatch[1]);
                    const ct = lxcByCtId[ctId];
                    if (ct && ct.dhcp_static_ip !== b.ip) {
                        await db.lxcContainers.update(ct.id, { dhcp_static_ip: b.ip });
                        updated++;
                    } else {
                        skipped++;
                    }
                }
            } catch (e) {
                console.error(`[sync-dhcp] 更新 ${b.comment} 失败:`, e.message);
                errors++;
            }
        }

        console.log(`[sync-dhcp] 同步完成: 更新 ${updated}, 跳过 ${skipped}, 错误 ${errors}`);
        // 操作审计：同步 iKuai DHCP 绑定
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.network.sync-dhcp', resourceType: 'network', details: '同步DHCP绑定:更新 ' + updated + ' 条,跳过 ' + skipped + ',错误 ' + errors, req });
        } catch (e) {}
        res.json({ updated, skipped, errors, total: bindings.length });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards', authMiddleware, async (req, res) => {
    try {
        const { type, vm_id, ct_id, search } = req.query;
        let rules;
        if (req.user.role === 'admin') {
            if (type) rules = await db.portForwards.getByType(type);
            else rules = await db.portForwards.getAll();
        } else {
            rules = await db.portForwards.getByUserId(req.user.id);
            if (type) rules = rules.filter(r => r.type === type);
        }
        // 搜索过滤：按 IP、内网端口、外网端口、名称匹配
        if (search && search.trim()) {
            var s = search.trim().toLowerCase();
            rules = rules.filter(function(r) {
                return (r.ip && r.ip.toLowerCase().indexOf(s) > -1) ||
                       String(r.internal_port || '').indexOf(s) > -1 ||
                       String(r.external_port || '').indexOf(s) > -1 ||
                       (r.name && r.name.toLowerCase().indexOf(s) > -1);
            });
        }
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/port-forwards', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const { type, vm_id, ct_id, name, ip, internal_port, external_port, protocol } = req.body;
        if (!type || !ip || !internal_port || !external_port) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        // type 白名单校验
        const allowedTypes = ['vm', 'lxc', 'general'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({ error: '无效的转发类型' });
        }
        // L-4 修复：protocol 白名单（tcp/udp）+ name 长度限制与控制字符剔除
        const finalProtocol = String(protocol || 'tcp').toLowerCase();
        if (!['tcp', 'udp'].includes(finalProtocol)) {
            return res.status(400).json({ error: '无效的协议，必须为 tcp 或 udp' });
        }
        const finalName = String(name || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50);
        // general 类型强制 vm_id/ct_id 为 null
        const finalVmId = type === 'vm' ? (vm_id || null) : null;
        const finalCtId = type === 'lxc' ? (ct_id || null) : null;
        // 基础合法性校验：端口物理范围（TCP/UDP 端口为 16 位无符号整数），对所有用户（含管理员）生效
        if (internal_port < 1 || internal_port > 65535 || external_port < 1 || external_port > 65535) {
            return res.status(400).json({ error: '端口必须在 1-65535 之间' });
        }

        // L-2 修复：IPv4 格式合法性校验
        if (!/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
            return res.status(400).json({ error: '无效的 IP 地址格式' });
        }

        const config = {
            port_range_start: parseInt(await db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(await db.config.get('forward:port_range_end')) || 60000,
            max_per_user: parseInt(await db.config.get('forward:max_per_user')) || 10,
        };
        // 普通用户检查端口范围和数量限制；管理员不受此限制
        if (req.user.role !== 'admin') {
            if (external_port < config.port_range_start || external_port > config.port_range_end) {
                return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
            }
            const count = await db.portForwards.getCountByUserId(req.user.id);
            if (count >= config.max_per_user) {
                return res.status(400).json({ error: `转发规则数量已达上限（${config.max_per_user} 条），如需新增请联系管理员` });
            }
        }
        // 新增：校验目标资源归属（general 类型 vm_id/ct_id 均为 null，天然跳过）
        if (finalVmId && !isAdmin) {
            const userVms = await db.vms.getByUserId(req.user.id);
            const ownedVm = userVms.find(v => v.vm_id == finalVmId);
            if (!ownedVm) {
                return res.status(403).json({ error: '无权为此虚拟机创建转发规则' });
            }
            // M-2 修复：到期资源拦截（端口转发属于资源使用）
            if (ownedVm.expiration_date && new Date(ownedVm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请先续费' });
            }
        }
        if (finalCtId && !isAdmin) {
            const userCts = await db.lxcContainers.getByUserId(req.user.id);
            const ownedCt = userCts.find(c => c.ct_id == finalCtId);
            if (!ownedCt) {
                return res.status(403).json({ error: '无权为此容器创建转发规则' });
            }
            // M-2 修复：到期资源拦截（端口转发属于资源使用）
            if (ownedCt.expiration_date && new Date(ownedCt.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请先续费' });
            }
        }
        const existing = await db.portForwards.getByExternalPort(external_port);
        if (existing.length > 0) {
            return res.status(400).json({ error: '外网端口已被占用，请更换' });
        }
        if (ikuaiApi.isConfigured()) {
            try {
                const ikuaiRules = await ikuaiApi.getPortForwards();
                const conflict = ikuaiRules.find(r => String(r.wan_port) === String(external_port));
                if (conflict) {
                    return res.status(400).json({ error: '外网端口已被占用，请更换' });
                }
            } catch (e) {
                console.error('[端口转发] ikuai 端口检查失败:', e.message);
            }
        }
        // 先写入本地
        const rule = await db.portForwards.create({
            type, vm_id: finalVmId, ct_id: finalCtId,
            name: finalName, ip, internal_port, external_port,
            protocol: finalProtocol, sync_status: 'pending'
        });
        // 同步到 ikuai（一条规则支持多外网接口，interface 字段传逗号分隔值）
        try {
            const wanIfaces = await getWanInterfaces();
            // comment 根据 type 区分：general → _GENERAL，lxc → _CT${ct_id}，vm → _VM${vm_id}
            const comment = type === 'general'
                ? `${finalName || '转发'}_GENERAL`
                : type === 'lxc'
                    ? `${finalName || '转发'}_CT${finalCtId}`
                    : `${finalName || '转发'}_VM${finalVmId}`;
            const ifaceStr = wanIfaces.join(',');
            let ikuaiIds = [];
            try {
                await ikuaiApi.addPortForward({ ip, internal_port, external_port, protocol: finalProtocol, comment, enabled: true, interface: ifaceStr });
                // 爱快 add 接口不返回 ID，从 ikuai 规则列表反查
                try {
                    const ikuaiRules = await ikuaiApi.getPortForwards();
                    const match = ikuaiRules.find(r =>
                        String(r.wan_port) === String(external_port) &&
                        String(r.lan_port) === String(internal_port) &&
                        (r.lan_ip || r.lan_addr) === ip
                    );
                    if (match) ikuaiIds.push({ interface: ifaceStr, id: String(match.id) });
                } catch (_) {}
            } catch (e) {
                console.error(`[端口转发] 同步到接口 ${ifaceStr} 失败:`, e.message);
            }
            // 同步状态：有 id=synced，无 id=failed
            const syncStatus = ikuaiIds.length > 0 ? 'synced' : 'failed';
            await db.portForwards.update(rule.id, { sync_status: syncStatus, ikuai_id: stringifyIkuaiIds(ikuaiIds) });
            rule.sync_status = syncStatus;
            rule.ikuai_id = stringifyIkuaiIds(ikuaiIds);
        } catch (e) {
            await db.portForwards.update(rule.id, { sync_status: 'failed' });
            rule.sync_status = 'failed';
            console.error('[端口转发] 同步到 ikuai 失败:', e.message);
        }
        await auditAction(req, 'network.port.add', portAuditDetail('新增', rule, finalVmId, finalCtId), { resourceType: 'port-forward', resourceId: rule.id });
        res.json(rule);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/port-forwards/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = await db.portForwards.getById(id);
        if (!existing) return res.status(404).json({ error: '规则不存在' });
        if (req.user.role !== 'admin') {
            const userRules = await db.portForwards.getByUserId(req.user.id);
            if (!userRules.find(r => r.id === id)) return res.status(403).json({ error: '无权限' });
        }
        const { name, ip, internal_port, external_port, protocol, type, vm_id, ct_id } = req.body;

        // V6-I2 修复：删除中（deleting）的规则禁止编辑——删除流程先置中间态再外呼爱快，
        // 期间 PUT 会把 sync_status 覆盖回 synced/pending 且改动的规则最终仍被物理删除
        if (existing.sync_status === 'deleting') {
            return res.status(409).json({ error: '该规则正在删除中，无法编辑' });
        }

        // L-2🔶 修复：修改 IP 时同步格式校验（与 POST 端点一致）
        if (ip !== undefined && ip !== null) {
            if (!/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
                return res.status(400).json({ error: '无效的 IP 地址格式' });
            }
        }

        // 类型变更校验：type 必须是 vm/lxc/general 之一
        if (type !== undefined && type !== null && !['vm', 'lxc', 'general'].includes(type)) {
            return res.status(400).json({ error: '无效的类型，必须为 vm/lxc/general' });
        }
        // L-4 修复：protocol 白名单 + name 长度限制与控制字符剔除（与 POST 端点一致）
        if (protocol !== undefined && protocol !== null) {
            if (!['tcp', 'udp'].includes(String(protocol).toLowerCase())) {
                return res.status(400).json({ error: '无效的协议，必须为 tcp 或 udp' });
            }
        }
        const finalName = name !== undefined && name !== null
            ? String(name).replace(/[\x00-\x1f\x7f]/g, '').slice(0, 50)
            : existing.name;
        // 计算生效的 type/vm_id/ct_id（未传则用 existing 的值）
        const effectiveType = type || existing.type;
        const effectiveVmId = effectiveType === 'vm' ? (vm_id !== undefined ? vm_id : existing.vm_id) : null;
        const effectiveCtId = effectiveType === 'lxc' ? (ct_id !== undefined ? ct_id : existing.ct_id) : null;
        // 类型为 vm/lxc 时必须有对应设备 ID
        if (effectiveType === 'vm' && !effectiveVmId) return res.status(400).json({ error: 'VM 类型必须指定虚拟机' });
        if (effectiveType === 'lxc' && !effectiveCtId) return res.status(400).json({ error: 'LXC 类型必须指定容器' });

        // V3-03 修复：目标资源归属校验（与 POST 端点一致，防止普通用户将转发指向他人资源）
        if (req.user.role !== 'admin') {
            if (effectiveVmId) {
                const ownedVm = (await db.vms.getByUserId(req.user.id)).find(v => v.vm_id == effectiveVmId);
                if (!ownedVm) return res.status(403).json({ error: '无权为此虚拟机创建转发规则' });
                // M-2 修复：到期资源拦截（端口转发编辑属于资源使用）
                if (ownedVm.expiration_date && new Date(ownedVm.expiration_date) < new Date()) {
                    return res.status(403).json({ error: '虚拟机已到期，请先续费' });
                }
            }
            if (effectiveCtId) {
                const ownedCt = (await db.lxcContainers.getByUserId(req.user.id)).find(c => c.ct_id == effectiveCtId);
                if (!ownedCt) return res.status(403).json({ error: '无权为此容器创建转发规则' });
                // M-2 修复：到期资源拦截（端口转发编辑属于资源使用）
                if (ownedCt.expiration_date && new Date(ownedCt.expiration_date) < new Date()) {
                    return res.status(403).json({ error: '容器已到期，请先续费' });
                }
            }
        }

        if (external_port) {
            const config = {
                port_range_start: parseInt(await db.config.get('forward:port_range_start')) || 50000,
                port_range_end: parseInt(await db.config.get('forward:port_range_end')) || 60000,
            };
            // 普通用户检查端口范围；管理员不受此限制
            if (req.user.role !== 'admin') {
                if (external_port < config.port_range_start || external_port > config.port_range_end) {
                    return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
                }
            }
            const conflict = (await db.portForwards.getByExternalPort(external_port)).filter(r => r.id !== id);
            if (conflict.length > 0) return res.status(400).json({ error: '外网端口已被占用，请更换' });
        }
        // 检测端口/IP/类型/设备 ID 变更，需要同步爱快（类型或设备 ID 变化会导致 ikuai comment 变化）
        const portChanged = external_port && Number(external_port) !== Number(existing.external_port);
        const ipChanged = ip && ip !== existing.ip;
        const internalChanged = internal_port && Number(internal_port) !== Number(existing.internal_port);
        const typeChanged = type && type !== existing.type;
        const vmIdChanged = effectiveType === 'vm' && String(effectiveVmId) !== String(existing.vm_id || '');
        const ctIdChanged = effectiveType === 'lxc' && String(effectiveCtId) !== String(existing.ct_id || '');
        const needIkuaiSync = ipChanged || portChanged || internalChanged || typeChanged || vmIdChanged || ctIdChanged;
        let newIkuaiIds = parseIkuaiIds(existing.ikuai_id);
        if (needIkuaiSync) {
            await db.portForwards.update(id, { sync_status: 'pending' });
            try {
                // 删除旧的所有接口上的 ikuai 规则
                const oldIds = parseIkuaiIds(existing.ikuai_id);
                for (const old of oldIds) {
                    try {
                        if (old.id) await ikuaiApi.deletePortForward(old.id);
                    } catch (e) {
                        console.error(`[端口转发] 删除旧规则 ${old.id} 失败:`, e.message);
                    }
                }
                if (oldIds.length === 0 && ikuaiApi.isConfigured()) {
                    // 没有 ikuai_id，按旧端口信息匹配删除
                    const ikuaiRules = await ikuaiApi.getPortForwards();
                    const oldMatches = ikuaiRules.filter(r =>
                        String(r.wan_port) === String(existing.external_port) &&
                        String(r.lan_port) === String(existing.internal_port) &&
                        (r.lan_ip || r.lan_addr) === existing.ip
                    );
                    for (const m of oldMatches) {
                        try { await ikuaiApi.deletePortForward(m.id); } catch (_) {}
                    }
                }
                // 重新创建一条规则，interface 字段传逗号分隔的多接口值
                const wanIfaces = await getWanInterfaces();
                // comment 根据生效类型区分：general → _GENERAL，lxc → _CT${ct_id}，vm → _VM${vm_id}
                const comment = effectiveType === 'general'
                    ? `${finalName || '转发'}_GENERAL`
                    : effectiveType === 'lxc'
                        ? `${finalName || '转发'}_CT${effectiveCtId}`
                        : `${finalName || '转发'}_VM${effectiveVmId}`;
                const ifaceStr = wanIfaces.join(',');
                newIkuaiIds = [];
                try {
                    await ikuaiApi.addPortForward({ ip: ip || existing.ip, internal_port: internal_port || existing.internal_port, external_port: external_port || existing.external_port, protocol: protocol || existing.protocol, comment, enabled: true, interface: ifaceStr });
                    try {
                        const ikuaiRules = await ikuaiApi.getPortForwards();
                        const match = ikuaiRules.find(r =>
                            String(r.wan_port) === String(external_port || existing.external_port) &&
                            String(r.lan_port) === String(internal_port || existing.internal_port) &&
                            (r.lan_ip || r.lan_addr) === (ip || existing.ip)
                        );
                        if (match) newIkuaiIds.push({ interface: ifaceStr, id: String(match.id) });
                    } catch (_) {}
                } catch (e) {
                    console.error(`[端口转发] 编辑同步到接口 ${ifaceStr} 失败:`, e.message);
                }
            } catch (e) {
                await db.portForwards.update(id, { sync_status: 'failed' });
                return res.status(500).json({ error: safeError(e) });
            }
        }
        const updates = {};
        if (name !== undefined) updates.name = finalName;
        if (ip !== undefined) updates.ip = ip;
        if (internal_port !== undefined) updates.internal_port = internal_port;
        if (external_port !== undefined) updates.external_port = external_port;
        if (protocol !== undefined) updates.protocol = String(protocol).toLowerCase();
        // 支持 type/vm_id/ct_id 更新：切换类型时按新类型互斥设置设备 ID（vm→lxc 时 vm_id 置 null，反之亦然）
        if (type !== undefined && type !== null) {
            updates.type = type;
            updates.vm_id = type === 'vm' ? (vm_id !== undefined ? vm_id : existing.vm_id) : null;
            updates.ct_id = type === 'lxc' ? (ct_id !== undefined ? ct_id : existing.ct_id) : null;
        } else {
            // 未改类型但显式传了设备 ID
            if (vm_id !== undefined) updates.vm_id = existing.type === 'vm' ? vm_id : null;
            if (ct_id !== undefined) updates.ct_id = existing.type === 'lxc' ? ct_id : null;
        }
        if (!needIkuaiSync) updates.sync_status = existing.sync_status;
        else {
            updates.sync_status = newIkuaiIds.length > 0 ? 'synced' : 'failed';
            updates.ikuai_id = stringifyIkuaiIds(newIkuaiIds);
        }
        const updated = await db.portForwards.update(id, updates);
        // 操作审计：编辑端口转发规则（补漏：add/delete 均有埋点，edit 原先缺失）
        try {
            await auditAction(req, 'network.port.update', portAuditDetail('编辑', Object.assign({}, existing, updates), existing.vm_id, existing.ct_id), { resourceType: 'port-forward', resourceId: id });
        } catch (e) {}
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.delete('/port-forwards/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const rule = await db.portForwards.getById(id);
        if (!rule) return res.status(404).json({ error: '规则不存在' });
        if (req.user.role !== 'admin') {
            const userRules = await db.portForwards.getByUserId(req.user.id);
            if (!userRules.find(r => r.id === id)) return res.status(403).json({ error: '无权限' });
        }
        if (rule.sync_status === 'orphan') {
            await db.portForwards.delete(id);
            await auditAction(req, 'network.port.delete', portAuditDetail('删除', rule, rule.vm_id, rule.ct_id), { resourceType: 'port-forward', resourceId: id });
            return res.json({ message: '规则已删除' });
        }
        // 记录删除意图（防止删除过程中服务重启：残留 deleting 记录由启动对账收敛）
        await db.portForwards.update(id, { sync_status: 'deleting' });
        // 同步删除爱快侧（失败不删 DB，恢复原状态，前端提示重试）
        const delResult = await deleteIkuaiRuleStrict(rule);
        if (!delResult.deleted) {
            await db.portForwards.update(id, { sync_status: rule.sync_status || 'synced' });
            await auditAction(req, 'network.port.delete', portAuditDetail('删除', rule, rule.vm_id, rule.ct_id) + '（失败：爱快删除失败）', { resourceType: 'port-forward', resourceId: id });
            return res.status(500).json({ error: '爱快删除失败: ' + delResult.error });
        }
        await db.portForwards.delete(id);
        await auditAction(req, 'network.port.delete', portAuditDetail('删除', rule, rule.vm_id, rule.ct_id), { resourceType: 'port-forward', resourceId: id });
        res.json({ message: '规则已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/port-forwards/batch-delete', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '请选择要删除的规则' });
        }
        const results = { success: 0, failed: 0 };
        for (const id of ids) {
            try {
                const rule = await db.portForwards.getById(id);
                if (!rule) continue;
                if (rule.sync_status !== 'orphan') {
                    // 记录删除意图（防重启中断残留 synced 记录被对账误标孤儿）
                    await db.portForwards.update(id, { sync_status: 'deleting' });
                    // 同步删除爱快侧（失败不删 DB，恢复原状态并计入 failed）
                    const delResult = await deleteIkuaiRuleStrict(rule);
                    if (!delResult.deleted) {
                        await db.portForwards.update(id, { sync_status: rule.sync_status || 'synced' });
                        await auditAction(req, 'network.port.delete', portAuditDetail('删除', rule, rule.vm_id, rule.ct_id) + '（失败：爱快删除失败）', { resourceType: 'port-forward', resourceId: id });
                        results.failed++;
                        continue;
                    }
                }
                await db.portForwards.delete(id);
                // 操作审计：批量删除逐条记录明细
                await auditAction(req, 'network.port.delete', portAuditDetail('删除', rule, rule.vm_id, rule.ct_id), { resourceType: 'port-forward', resourceId: id });
                results.success++;
            } catch (e) {
                results.failed++;
            }
        }
        // 操作审计：批量写入后即时收敛该用户日志到保留上限（防短暂超限，无需等整点清理）
        try {
            var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
            await db.auditLogs.trimUserOverflow(req.user.id, keepCount);
        } catch (_) {}
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards/random-port', authMiddleware, async (req, res) => {
    try {
        // SEC-02: 代理外部 API（ikuai）端点加速率限制，防止滥用导致外部系统 DoS
        const rateLimitKey = 'ratelimit:random-port:' + req.user.id;
        const rateLimitResult = await checkConfiguredRateLimit('random_port', rateLimitKey);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试', retryAfter: rateLimitResult.retryAfter });
        }
        const portRangeStart = parseInt(await db.config.get('forward:port_range_start')) || 50000;
        const portRangeEnd = parseInt(await db.config.get('forward:port_range_end')) || 60000;
        const usedPorts = new Set((await db.portForwards.getUsedPorts()).map(r => r.external_port));
        // 也从 ikuai 获取已用端口
        if (ikuaiApi.isConfigured()) {
            try {
                const ikuaiRules = await ikuaiApi.getPortForwards();
                ikuaiRules.forEach(r => {
                    if (r.wan_port) usedPorts.add(parseInt(r.wan_port));
                });
            } catch (e) {}
        }
        // 管理员不受系统配置的端口范围限制，使用 1-65535 全范围；普通用户使用配置范围
        const isAdmin = req.user.role === 'admin';
        const start = isAdmin ? 1 : portRangeStart;
        const end = isAdmin ? 65535 : portRangeEnd;
        const available = [];
        for (let p = start; p <= end; p++) {
            if (!usedPorts.has(p)) available.push(p);
        }
        if (available.length === 0) {
            return res.status(400).json({ error: '端口范围内无可用端口' });
        }
        const randomPort = available[crypto.randomInt(0, available.length)];
        res.json({ port: randomPort });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards/check-port', authMiddleware, async (req, res) => {
    try {
        // M-3 修复：外呼爱快全量端口表，必须限速（admin 可配置）
        const checkRate = await checkConfiguredRateLimit('port_check', 'ratelimit:port-check:' + req.user.id);
        if (!checkRate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', retryAfter: checkRate.retryAfter });

        const port = parseInt(req.query.port);
        if (!port || port < 1 || port > 65535) {
            return res.status(400).json({ error: '无效端口' });
        }
        const existing = await db.portForwards.getByExternalPort(port);
        if (existing.length > 0) {
            return res.json({ available: false });
        }
        if (ikuaiApi.isConfigured()) {
            try {
                const ikuaiRules = await ikuaiApi.getPortForwards();
                if (ikuaiRules.some(r => String(r.wan_port) === String(port))) {
                    return res.json({ available: false });
                }
            } catch (e) {}
        }
        res.json({ available: true });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards/config', authMiddleware, async (req, res) => {
    try {
        const maxPerUser = parseInt(await db.config.get('forward:max_per_user')) || 10;
        const totalCount = await db.portForwards.getCountByUserId(req.user.id);
        res.json({
            max_per_user: maxPerUser,
            port_range_start: parseInt(await db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(await db.config.get('forward:port_range_end')) || 60000,
            used: totalCount,
            remaining: Math.max(0, maxPerUser - totalCount)
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards/extract-ips', authMiddleware, async (req, res) => {
    try {
        // M-3 修复：N+1 外呼爱快+PVE，必须限速（admin 可配置）
        const extractRate = await checkConfiguredRateLimit('port_extract_ips', 'ratelimit:port-extract-ips:' + req.user.id);
        if (!extractRate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', retryAfter: extractRate.retryAfter });

        const devices = [];
        const isAdmin = req.user.role === 'admin';
        const myVms = isAdmin ? await db.vms.getAll() : await db.vms.getByUserId(req.user.id);
        const myCts = isAdmin ? await db.lxcContainers.getAll() : await db.lxcContainers.getByUserId(req.user.id);
        let dhcpLeases = [];
        let lanIps = [];
        if (ikuaiApi.isConfigured()) {
            try { dhcpLeases = await ikuaiApi.getDhcpLeases(); } catch (e) {}
            try { lanIps = await ikuaiApi.getLanIps(); } catch (e) {}
        }
        function findIpByMac(mac) {
            if (!mac) return '';
            if (dhcpLeases.length > 0) {
                const lease = dhcpLeases.find(l => String(l.mac || l.hwaddr || '').toLowerCase() === mac);
                if (lease) return lease.ip || lease.ipaddr || '';
            }
            if (lanIps.length > 0) {
                const lan = lanIps.find(l => String(l.mac || '').toLowerCase() === mac);
                if (lan) return lan.ip || '';
            }
            return '';
        }
        for (const vm of myVms) {
            const user = await db.users.getById(vm.user_id);
            let ip = '';
            // 优先使用数据库存储的 DHCP 静态绑定 IP
            if (vm.dhcp_static_ip) {
                ip = vm.dhcp_static_ip;
            } else {
                let mac = '';
                try {
                    const config = await pveApi.getVmConfig(vm.vm_id);
                    const net0 = config?.net0 || '';
                    const macMatch = net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                    if (macMatch) mac = macMatch[0].toLowerCase();
                    ip = findIpByMac(mac);
                    dbg(`[extract-ips] VM ${vm.vm_id}: net0=${net0}, mac=${mac}, ip=${ip}`);
                } catch (e) {
                    dbg(`[extract-ips] VM ${vm.vm_id} 获取配置失败:`, e.message);
                }
            }
            devices.push({
                type: 'vm', device_id: vm.vm_id, name: vm.name || 'VM ' + vm.vm_id,
                ip, mac: '', user: user?.username || ''
            });
        }
        for (const ct of myCts) {
            const user = await db.users.getById(ct.user_id);
            let ip = '';
            // 优先使用数据库存储的 DHCP 静态绑定 IP
            if (ct.dhcp_static_ip) {
                ip = ct.dhcp_static_ip;
            } else {
                try {
                    const config = await pveApi.getLxcConfig(ct.ct_id);
                    const net0 = config?.net0 || '';
                    const ipMatch = net0.match(/ip=([0-9.]+)/);
                    if (ipMatch) ip = ipMatch[1];
                    // 如果没拿到静态 IP 或使用 DHCP，尝试通过 MAC 从 DHCP 租约或 LAN IP 匹配
                    if (!ip) {
                        const hwaddrMatch = net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                        if (hwaddrMatch) {
                            ip = findIpByMac(hwaddrMatch[0].toLowerCase());
                        }
                    }
                    dbg(`[extract-ips] CT ${ct.ct_id}: net0=${net0}, ip=${ip}`);
                } catch (e) {
                    dbg(`[extract-ips] CT ${ct.ct_id} 获取配置失败:`, e.message);
                }
            }
            devices.push({
                type: 'lxc', device_id: ct.ct_id, name: ct.name || 'CT ' + ct.ct_id,
                ip, user: user?.username || ''
            });
        }
        res.json(devices);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});


module.exports = router;
