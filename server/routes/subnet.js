const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
// 多节点：按节点/配对关系取客户端（工厂缓存复用；null=默认节点兜底）
const { getPveClient } = require('../api/pve-clients');
const { getIkuaiClient } = require('../api/ikuai-clients');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createDhcpStaticBinding, removeDhcpStaticBinding, isIpInAddrPool } = require('../services/dhcp');
const { rebuildPortForwardsForDevice } = require('../services/port-forward-sync');
const { safeError } = require('../utils/safe-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { auditAction } = require('../utils/audit-log');
const { shouldSendEmail } = require('../utils/email');
const { sendTemplateEmail } = require('../services/email-template');

const VALID_IP_RE = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

// VLAN 名称：vlan_VPC + 7 位随机（数字+大小写字母），共 15 位（爱快要求 vlan_ 开头且 ≤15 位）
function generateVlanName(existingNames) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let attempt = 0; attempt < 20; attempt++) {
        let rand = '';
        for (let i = 0; i < 7; i++) rand += chars[crypto.randomInt(0, chars.length)];
        const name = 'vlan_VPC' + rand;
        if (!existingNames.includes(name)) return name;
    }
    return null;
}

// 生成 VLAN 备注：仅记录所属用户（如 用户admin）
function generateVlanComment(username) {
    return '用户' + username;
}

// 轮询爱快 DHCP 服务端 available：500ms 间隔（爱快异步计算约 5-6 秒），
// 值与静态绑定基准值（池容量-静态绑定数）一致时提前退出（值未变/已算完场景秒回），
// 最长轮询 16 次（8 秒）后取最后一次，仍取不到用基准值兜底
// 多节点：ikNodeId 指定子网归属的爱快节点（null=默认爱快节点）
async function pollDhcpAvailable(vlanName, ikNodeId) {
    const ik = await getIkuaiClient(ikNodeId || null);
    // 基准值：池容量(254) - 该接口静态绑定数（实测与爱快最终 available 一致）
    let baseline = 0;
    try {
        const bindings = await ik.getDhcpStaticBindings();
        baseline = Math.max(0, 254 - bindings.filter(b => b.interface === vlanName).length);
    } catch (_) {}
    let prev = 0;
    let stable = 0;
    let available = 0;
    let dhcpId = '';
    for (let attempt = 0; attempt < 16; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 500));
        const server = await ik.getDhcpServerByInterface(vlanName);
        if (!server) continue;
        dhcpId = String(server.id);
        const cur = server.available || 0;
        available = cur;
        if (cur === prev && cur > 0) {
            stable++;
            // 与基准值一致（爱快已算完或值未变）连续 2 次即返回
            if (baseline > 0 && cur === baseline && stable >= 2) break;
        } else {
            stable = 0;
        }
        prev = cur;
    }
    if (available <= 0 && baseline > 0) available = baseline;
    return { available, dhcpId };
}

// 刷新子网 DHCP 剩余可用数（绑定/解绑/手动刷新统一入口）
// 多节点：按子网归属的 ikuai_node_id 解析爱快客户端
async function refreshSubnetAvailable(subnet) {
    if (!subnet) return;
    try {
        const ik = await getIkuaiClient(subnet.ikuai_node_id || null);
        if (!ik.isConfigured()) return;
        const { available, dhcpId } = await pollDhcpAvailable(subnet.vlan_name, subnet.ikuai_node_id || null);
        await db.subnets.update(subnet.id, { available, ikuai_dhcp_id: dhcpId || subnet.ikuai_dhcp_id || '' });
    } catch (e) {
        console.error('[subnet] 刷新可用 IP 失败:', e.message);
    }
}

// 校验设备归属 + 关机状态，返回 { record, status } 或 { error }
// opts.allowRunning = true 时允许运行中操作（管理员绑定子网特权）
async function checkDeviceAccess(req, type, vmid, opts) {
    const record = type === 'vm'
        ? (await db.vms.getAll()).find(v => v.vm_id === vmid)
        : (await db.lxcContainers.getAll()).find(c => c.ct_id === vmid);
    if (!record) {
        return { error: { status: 404, message: (type === 'vm' ? '虚拟机' : '容器') + '不存在' } };
    }
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
        return { error: { status: 403, message: '无权限操作此' + (type === 'vm' ? '虚拟机' : '容器') } };
    }
    // 普通用户绑定/解绑必须关机；管理员绑定可运行中操作（解绑仍要求关机）
    // 多节点：按设备归属 PVE 节点解析客户端（查不到节点行回退默认）
    let status = null;
    try {
        const pc = await getPveClient(record.pve_node_id);
        status = type === 'vm' ? await pc.getVmStatus(vmid) : await pc.getLxcStatus(vmid);
    } catch (e) {
        status = null;
    }
    if (status && status.status === 'running' && !(opts && opts.allowRunning)) {
        return { error: { status: 400, message: '请先关闭服务器，关机后才能进行子网操作' } };
    }
    return { record, status };
}

// ===== 子网配额（创建弹窗展示已用/上限，admin 不限 max=0） =====
router.get('/subnets/quota', authMiddleware, async (req, res) => {
    try {
        const max = req.user.role === 'admin' ? 0 : (parseInt(await db.config.getIkuaiSetting('vlan:max_per_user')) || 5);
        const used = (await db.subnets.getByUserId(req.user.id)).length;
        res.json({ used, max });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 子网列表（仅当前用户自己的子网，admin 一视同仁，不泄露他人网段） =====
router.get('/subnets', authMiddleware, async (req, res) => {
    try {
        const list = await db.subnets.getByUserId(req.user.id);

        // 绑定设备统计（一次查询避免 N+1）
        const myVms = await db.vms.getByUserId(req.user.id);
        const myCts = await db.lxcContainers.getByUserId(req.user.id);
        const vmCount = {};
        const ctCount = {};
        myVms.forEach(v => { if (v.subnet_id) vmCount[v.subnet_id] = (vmCount[v.subnet_id] || 0) + 1; });
        myCts.forEach(c => { if (c.subnet_id) ctCount[c.subnet_id] = (ctCount[c.subnet_id] || 0) + 1; });

        const result = list.map(s => {
            const gwParts = (s.gateway || '').split('.');
            return {
                id: s.id,
                vlan_name: s.vlan_name,
                vlan_id: s.vlan_id,
                gateway: s.gateway,
                netmask: s.netmask,
                addr_pool: s.addr_pool,
                cidr: gwParts.length === 4 ? gwParts.slice(0, 3).join('.') + '.0/24' : '',
                available: s.available,
                vm_count: vmCount[s.id] || 0,
                lxc_count: ctCount[s.id] || 0,
                created_at: s.created_at
            };
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 管理员：全部私有网络列表（含所有者用户名、绑定设备数） =====
router.get('/admin/subnets', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const search = (req.query.search || '').trim();
        if (search.length > 50) return res.status(400).json({ error: '搜索关键词过长', code: 'KEYWORD_TOO_LONG' });

        const list = await db.subnets.getAllWithOwner(search || undefined);

        // 绑定设备统计（一次查询避免 N+1）
        const counts = await db.subnets.getBoundCounts();

        const result = list.map(s => {
            const gwParts = (s.gateway || '').split('.');
            return {
                id: s.id,
                username: s.username || '',
                vlan_name: s.vlan_name,
                vlan_id: s.vlan_id,
                gateway: s.gateway,
                netmask: s.netmask,
                addr_pool: s.addr_pool,
                cidr: gwParts.length === 4 ? gwParts.slice(0, 3).join('.') + '.0/24' : '',
                available: s.available,
                interface: s.interface,
                vm_count: counts.vm[s.id] || 0,
                lxc_count: counts.lxc[s.id] || 0,
                created_at: s.created_at
            };
        });
        res.json(result);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 新建子网（创建爱快 VLAN + DHCP 服务端） =====
router.post('/subnets', authMiddleware, async (req, res) => {
    // 限速：防止频繁外呼爱快导致外部系统被拖垮
    const rateLimitResult = await checkConfiguredRateLimit('subnet_create', 'ratelimit:subnet-create:' + req.user.id);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: '创建子网过于频繁，请稍后再试', code: 'RATE_LIMITED_SUBNET_CREATE', retryAfter: rateLimitResult.retryAfter });
        }
    // 每用户子网数量上限（普通用户受限，管理员不限，与端口转发 max_per_user 一致）
    if (req.user.role !== 'admin') {
        const maxPerUser = parseInt(await db.config.getIkuaiSetting('vlan:max_per_user')) || 5;
        if (maxPerUser > 0) {
            const userSubnetCount = (await db.subnets.getByUserId(req.user.id)).length;
            if (userSubnetCount >= maxPerUser) {
                return res.status(400).json({ error: '子网数量已达上限（' + maxPerUser + ' 个），如需更多请联系管理员', code: 'SUBNET_LIMIT_REACHED', params: [maxPerUser] });
            }
        }
    }
    try {
        // 多节点：当前创建流程无节点选择，子网归属默认爱快节点（R3）
        const ikNodeId = await db.ikuaNodes.getDefaultId();
        const ik = await getIkuaiClient(ikNodeId);
        // 1. 读取 admin 配置
        const segStart = (await db.config.getIkuaiSetting('vlan:ip_segment_start') || '172.16.0.1').trim();
        const idStart = parseInt(await db.config.getIkuaiSetting('vlan:id_start')) || 1000;
        const iface = (await db.config.getIkuaiSetting('vlan:interface') || 'lan1').trim();
        const dns1 = await db.config.getIkuaiSetting('dhcp:dns1') || '180.76.76.76';
        const dns2 = await db.config.getIkuaiSetting('dhcp:dns2') || '223.5.5.5';
        if (!VALID_IP_RE.test(segStart)) return res.status(400).json({ error: 'IP 段开始范围配置无效，请联系管理员', code: 'SUBNET_RANGE_CFG_INVALID' });
        if (idStart < 2 || idStart > 4090) return res.status(400).json({ error: 'VLANID 开始范围必须在 2~4090 之间', code: 'VLAN_START_RANGE' });
        if (!iface) return res.status(400).json({ error: '所属接口未配置，请联系管理员', code: 'SUBNET_IFACE_NOT_CONFIGURED' });
        if (!ik.isConfigured()) return res.status(400).json({ error: '爱快未配置，无法创建子网', code: 'IKUAI_NOT_CONFIGURED' });

        // 2. 已占用清单（DB 台账 + 爱快实际，双源合并防冲突）
        const dbVlanIds = await db.subnets.getUsedVlanIds();
        const dbGateways = await db.subnets.getUsedGateways();
        let ikuaiVlans = [];
        try {
            ikuaiVlans = await ik.getVlans();
        } catch (e) {
            console.error('[subnet] 获取爱快 VLAN 列表失败:', e.message);
            return res.status(500).json({ error: '获取爱快 VLAN 列表失败，请稍后重试', code: 'IKUAI_VLAN_LIST_FAILED' });
        }
        const usedVlanIds = new Set(dbVlanIds.concat(ikuaiVlans.map(v => parseInt(v.vlan_id)).filter(n => Number.isInteger(n))));
        const usedGateways = new Set(dbGateways.concat(ikuaiVlans.map(v => v.ip_addr).filter(Boolean)));
        const existingNames = ikuaiVlans.map(v => v.vlan_name).filter(Boolean);

        // 3. 分配 VLAN ID（从配置起始值递增）
        let vlanId = idStart;
        while (usedVlanIds.has(vlanId)) vlanId++;
        if (vlanId > 4090) return res.status(400).json({ error: 'VLAN ID 已用尽（上限 4090），请联系管理员调整起始值', code: 'VLAN_EXHAUSTED' });

        // 4. 分配网关 IP（倒数第二位 +1，直到未占用）
        const baseParts = segStart.split('.').map(Number);
        let gw = null;
        let seg = baseParts[2];
        for (let i = 0; i < 256 - baseParts[2]; i++) {
            const candidate = baseParts[0] + '.' + baseParts[1] + '.' + seg + '.1';
            if (!usedGateways.has(candidate)) { gw = candidate; break; }
            seg++;
        }
        if (!gw) return res.status(400).json({ error: 'IP 段已用尽，请联系管理员调整起始网段', code: 'IP_POOL_EXHAUSTED' });

        // 5. VLAN 名称（系统内置，随机生成）
        const vlanName = generateVlanName(existingNames);
        if (!vlanName) return res.status(400).json({ error: 'VLAN 名称生成失败，请重试', code: 'VLAN_NAME_GEN_FAILED' });

        // 5.5 接口有效性预校验（best-effort：枚举为空时跳过，避免误拦截）
        // 爱快对无效接口返回 30001「写入数据失败」，这里提前给出可读提示
        const vlanIfaces = await ik.getVlanInterfaces();
        if (vlanIfaces.length > 0 && !vlanIfaces.includes(iface)) {
            // 接口清单属内网拓扑信息，仅管理员可见详情，普通用户给通用提示
            const ifaceErr = req.user.role === 'admin'
                ? `所属接口 ${iface} 在爱快设备上不可用（可用接口：${vlanIfaces.join(', ')}），请到系统设置-网络配置中修改`
                : '所属接口配置无效，请联系管理员';
            return res.status(400).json({ error: ifaceErr });
        }

        // 6. 爱快创建 VLAN + DHCP 服务端
        const prefix = gw.split('.').slice(0, 3).join('.');
        const addrPool = prefix + '.2-' + prefix + '.255';
        const comment = generateVlanComment(req.user.username);

        try {
            await ik.addVlan({ vlan_id: vlanId, vlan_name: vlanName, ip_addr: gw, interface: iface, netmask: '255.255.255.0', comment });
        } catch (e) {
            // 爱快对「参数错误/账号无写权限」统一返回 30001 写入数据失败，附加排查指引
            return res.status(500).json({ error: safeError(e) + '；如持续失败，请检查面板连接爱快的账号是否被限制为只读或缺少模块写权限' });
        }
        let dhcpId = '';
        let available = 0;
        try {
            await ik.addDhcpServer({ interface: vlanName, addr_pool: addrPool, netmask: '255.255.255.0', gateway: gw, dns1, dns2 });
            // 爱快对新建 DHCP 服务端的 available 为异步计算，统一轮询（创建时基准值=254，算完即返回）
            const polled = await pollDhcpAvailable(vlanName, ikNodeId);
            dhcpId = polled.dhcpId;
            available = polled.available;
        } catch (e) {
            // DHCP 服务端创建失败：回滚已创建的 VLAN，避免孤儿资源
            try {
                const vlans = await ik.getVlans();
                const created = vlans.find(v => v.vlan_name === vlanName);
                if (created && created.id) await ik.deleteVlan(created.id);
            } catch (_) {}
            return res.status(500).json({ error: '创建 DHCP 服务端失败: ' + safeError(e), code: 'DHCP_CREATE_FAILED', params: [safeError(e)] });
        }

        // 反查 VLAN id（add 不返回 id）
        let ikuaiVlanId = '';
        try {
            const vlans = await ik.getVlans();
            const created = vlans.find(v => v.vlan_name === vlanName);
            if (created) ikuaiVlanId = String(created.id);
        } catch (_) {}

        const subnet = await db.subnets.create({
            user_id: req.user.id,
            vlan_name: vlanName,
            vlan_id: vlanId,
            gateway: gw,
            netmask: '255.255.255.0',
            addr_pool: addrPool,
            interface: iface,
            available,
            ikuai_vlan_id: ikuaiVlanId,
            ikuai_dhcp_id: dhcpId,
            ikuai_node_id: ikNodeId
        });

        await auditAction(req, 'subnet.create', '创建子网 ' + vlanName + ' (VLAN ' + vlanId + ', 网关 ' + gw + ', 地址池 ' + addrPool + ')', { resourceType: 'subnet', resourceId: subnet.id });

        // 站内信通知：子网开通成功（VLAN ID/所属接口等内部细节仅管理员审计可见，不展示给用户）
        try {
            await db.messages.create({
                uid: req.user.id,
                title: '子网开通成功',
                content: '您的私有网络子网已开通成功！\nVLAN 名称：' + vlanName + '\n网关：' + gw + '\n地址池：' + addrPool,
                type: 2,
                send_type: 1
            });
        } catch (msgErr) {
            console.error('[subnet] 站内信发送失败:', msgErr.message);
        }
        // 邮件通知：子网开通成功（受用户通知设置 notify_subnet_provisioned 开关控制；模板: subnet_provisioned）
        try {
            var subnetUser = await db.users.getById(req.user.id);
            if (subnetUser && subnetUser.email && subnetUser.emailVerified && subnetUser.email.includes('@')) {
                if (await shouldSendEmail(req.user.id, 'notify_subnet_provisioned')) {
                    await sendTemplateEmail(subnetUser.email, 'subnet_provisioned', {
                        vlan_name: vlanName,
                        gateway: gw,
                        address_pool: addrPool
                    });
                }
            }
        } catch (emailErr) {
            console.error('[subnet] 邮件发送失败:', emailErr.message);
        }

        res.json(subnet);
    } catch (e) {
        console.error('[subnet] 创建子网失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 删除子网（有绑定设备禁止删除） =====
router.delete('/subnets/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const subnet = await db.subnets.getById(id);
        if (!subnet) return res.status(404).json({ error: '子网不存在', code: 'SUBNET_NOT_FOUND' });
        if (req.user.role !== 'admin' && subnet.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权限操作此子网', code: 'SUBNET_NO_PERM' });
        }
        const bound = await db.subnets.getBoundCount(id);
        if (bound.vm + bound.lxc > 0) {
            return res.status(400).json({ error: '该子网下已有 ' + (bound.vm + bound.lxc) + ' 台服务器绑定，无法删除', code: 'SUBNET_HAS_VMS', params: [bound.vm + bound.lxc] });
        }
        // 清理爱快侧资源（尽力而为，失败不阻断 DB 删除）
        // 多节点：按子网归属的 ikuai_node_id 解析客户端
        const ik = await getIkuaiClient(subnet.ikuai_node_id || null);
        if (ik.isConfigured()) {
            if (subnet.ikuai_dhcp_id) {
                try { await ik.deleteDhcpServer(subnet.ikuai_dhcp_id); } catch (e) { console.error('[subnet] 删除 DHCP 服务端失败:', e.message); }
            }
            if (subnet.ikuai_vlan_id) {
                try { await ik.deleteVlan(subnet.ikuai_vlan_id); } catch (e) { console.error('[subnet] 删除 VLAN 失败:', e.message); }
            }
        }
        await db.subnets.delete(id);
        await auditAction(req, 'subnet.delete', '删除子网 ' + subnet.vlan_name + ' (VLAN ' + subnet.vlan_id + ')', { resourceType: 'subnet', resourceId: id });
        res.json({ message: '子网已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 批量刷新当前用户全部子网可用 IP =====
// 爱快 dhcp_server show 一次返回全部服务端（含 available），无需逐个子网轮询
router.post('/subnets/refresh', authMiddleware, async (req, res) => {
    const rateLimitResult = await checkConfiguredRateLimit('subnet_refresh', 'ratelimit:subnet-refresh:' + req.user.id);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: '刷新过于频繁，请稍后再试', code: 'RATE_LIMITED_REFRESH', retryAfter: rateLimitResult.retryAfter });
        }
    try {
        const subnets = await db.subnets.getByUserId(req.user.id);
        if (subnets.length === 0) return res.json({ updated: 0 });

        // 多节点：子网可能分布在多个爱快节点，按 ikuai_node_id 分组拉取（null=默认爱快节点）
        const groupsByIk = new Map();
        for (const s of subnets) {
            const key = s.ikuai_node_id == null ? '@default' : String(s.ikuai_node_id);
            if (!groupsByIk.has(key)) groupsByIk.set(key, []);
            groupsByIk.get(key).push(s);
        }
        // 1. 按节点一次拉取全部 DHCP 服务端（爱快批量返回 available）+ 静态绑定基准
        let servers = [];
        const boundByIface = {};
        for (const [key] of groupsByIk) {
            const gik = await getIkuaiClient(key === '@default' ? null : Number(key));
            if (!gik.isConfigured()) continue;
            try { servers = servers.concat(await gik.getDhcpServers()); } catch (e) { console.error('[subnet] 批量刷新获取 DHCP 服务端失败:', e.message); }
            try {
                const bindings = await gik.getDhcpStaticBindings();
                bindings.forEach(b => { if (b.interface) boundByIface[b.interface] = (boundByIface[b.interface] || 0) + 1; });
            } catch (_) {}
        }
        let serverByIface = {};
        servers.forEach(x => { serverByIface[x.interface] = x; });

        // 2. 基准值：池容量(254) - 静态绑定数（按节点合并后判断爱快是否计算完成 + 兜底）
        const baseline = {};
        subnets.forEach(s => { baseline[s.vlan_name] = Math.max(0, 254 - (boundByIface[s.vlan_name] || 0)); });

        // 3. 爱快 available 为异步计算（变更后约 5-6 秒）：轮询 show 直到全部与基准值一致，最长 8 秒
        const allMatched = function() {
            return subnets.every(s => {
                const v = serverByIface[s.vlan_name];
                return v && v.available > 0 && baseline[s.vlan_name] !== undefined && v.available === baseline[s.vlan_name];
            });
        };
        for (let attempt = 0; attempt < 4 && !allMatched(); attempt++) {
            await new Promise(r => setTimeout(r, 2000));
            // 多节点：逐节点重拉 DHCP 服务端（available 异步计算）
            serverByIface = {};
            for (const [key] of groupsByIk) {
                const gik = await getIkuaiClient(key === '@default' ? null : Number(key));
                if (!gik.isConfigured()) continue;
                try {
                    const again = await gik.getDhcpServers();
                    again.forEach(x => { serverByIface[x.interface] = x; });
                } catch (_) {}
            }
        }

        // 4. 批量回写 DB（爱快值优先，取不到时用基准值）
        let updated = 0;
        for (const s of subnets) {
            const server = serverByIface[s.vlan_name];
            let available = server ? (server.available || 0) : 0;
            if (available <= 0 && baseline[s.vlan_name] !== undefined) available = baseline[s.vlan_name];
            const updates = { available };
            if (server && String(server.id)) updates.ikuai_dhcp_id = String(server.id);
            await db.subnets.update(s.id, updates);
            updated++;
        }
        await auditAction(req, 'subnet.refresh', '批量刷新子网可用IP: 更新 ' + updated + ' 个子网', { resourceType: 'subnet' });
        res.json({ updated });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== 刷新子网可用 IP 数（绑定/类似操作时回写） =====
router.post('/subnets/:id/refresh', authMiddleware, async (req, res) => {
    const rateLimitResult = await checkConfiguredRateLimit('subnet_refresh', 'ratelimit:subnet-refresh:' + req.user.id);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: '刷新过于频繁，请稍后再试', code: 'RATE_LIMITED_REFRESH', retryAfter: rateLimitResult.retryAfter });
        }
    try {
        const id = parseInt(req.params.id);
        const subnet = await db.subnets.getById(id);
        if (!subnet) return res.status(404).json({ error: '子网不存在', code: 'SUBNET_NOT_FOUND' });
        if (req.user.role !== 'admin' && subnet.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权限操作此子网', code: 'SUBNET_NO_PERM' });
        }
        await refreshSubnetAvailable(subnet);
        const updated = await db.subnets.getById(id);
        await auditAction(req, 'subnet.refresh', '刷新子网 ' + subnet.vlan_name + ' 可用IP: ' + (updated ? updated.available : 0), { resourceType: 'subnet', resourceId: id });
        res.json({ available: updated ? updated.available : 0 });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== VM 绑定子网 =====
router.post('/vm/:vmid/bind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的设备 ID', code: 'INVALID_DEVICE_ID' });
        const subnetId = parseInt(req.body.subnet_id);
        if (!Number.isInteger(subnetId) || subnetId <= 0) return res.status(400).json({ error: '请选择要绑定的子网', code: 'SUBNET_SELECT_REQUIRED' });
        const subnet = await db.subnets.getById(subnetId);
        if (!subnet) return res.status(404).json({ error: '子网不存在', code: 'SUBNET_NOT_FOUND' });

        const access = await checkDeviceAccess(req, 'vm', vmid, { allowRunning: req.user.role === 'admin' });
        if (access.error) return res.status(access.error.status).json({ error: access.error.message, code: access.error.code });
        const vm = access.record;
        // 非管理员：设备与子网必须同属当前用户
        if (req.user.role !== 'admin' && subnet.user_id !== vm.user_id) {
            return res.status(403).json({ error: '子网与虚拟机不属于同一用户', code: 'SUBNET_VM_OWNER_MISMATCH' });
        }
        // M-2 修复：到期资源拦截（子网绑定属于资源使用）
        if (req.user.role !== 'admin' && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
            return res.status(403).json({ error: '虚拟机已到期，请先续费', code: 'VM_EXPIRED_RENEW' });
        }
        // 已绑定子网的设备必须先解绑
        if (vm.subnet_id) {
            return res.status(400).json({ error: '该虚拟机已绑定子网，请先解绑后再绑定新的子网', code: 'VM_ALREADY_BOUND_SUBNET' });
        }

        // PVE 网卡写入 VLAN tag（保留原 mac/bridge/model）
        // 多节点：按设备归属 PVE 节点解析客户端（查不到节点行回退默认）
        const vmPve = await getPveClient(vm.pve_node_id);
        let net0 = '';
        try {
            const config = await vmPve.getVmConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取虚拟机配置失败: ' + safeError(e), code: 'VM_CFG_READ_FAILED', params: [safeError(e)] });
        }
        if (!net0) return res.status(400).json({ error: '虚拟机网卡配置异常，无法绑定子网', code: 'VM_NIC_ABNORMAL' });
        if (net0.indexOf('tag=') > -1) return res.status(400).json({ error: '虚拟机网卡已存在 VLAN 标记，请先解绑', code: 'VM_NIC_VLAN_EXISTS' });
        try {
            await vmPve.updateVmConfig(vmid, { net0: net0 + ',tag=' + subnet.vlan_id });
        } catch (e) {
            return res.status(500).json({ error: '写入 VLAN 标记失败: ' + safeError(e), code: 'VLAN_TAG_WRITE_FAILED', params: [safeError(e)] });
        }

        // 清除旧的 DHCP 静态绑定并立即创建新子网的绑定
        let dhcpIp = '';
        try {
            const config = await vmPve.getVmConfig(vmid);
            const macMatch = ((config && config.net0) || '').match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (macMatch) {
                await removeDhcpStaticBinding('vm', vmid);
                dhcpIp = await createDhcpStaticBinding('vm', vmid, macMatch[0], '', subnet);
            }
        } catch (e) {
            console.error('[subnet] VM 绑定 DHCP 失败:', e.message);
        }

        await db.vms.update(vm.id, { subnet_id: subnetId, dhcp_static_ip: dhcpIp || '' });
        await refreshSubnetAvailable(subnet);
        // 设备 IP 已更换：同步重建端口转发（爱快删旧建新 + DB 回写新 IP）
        let rebuiltCount = 0;
        if (dhcpIp) {
            rebuiltCount = await rebuildPortForwardsForDevice('vm', vmid, dhcpIp);
        }
        await auditAction(req, 'subnet.bind.vm', 'VM ' + vmid + ' 绑定子网 ' + subnet.vlan_name + ' (VLAN ' + subnet.vlan_id + ')' + (dhcpIp ? ', 分配IP ' + dhcpIp : '') + (rebuiltCount > 0 ? ', 更新端口转发 ' + rebuiltCount + ' 条' : ''), { resourceType: 'subnet', resourceId: subnetId });
        res.json({ message: '绑定成功', dhcp_static_ip: dhcpIp, subnet_id: subnetId, port_forwards_rebuilt: rebuiltCount });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== LXC 绑定子网 =====
router.post('/lxc/:vmid/bind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的设备 ID', code: 'INVALID_DEVICE_ID' });
        const subnetId = parseInt(req.body.subnet_id);
        if (!Number.isInteger(subnetId) || subnetId <= 0) return res.status(400).json({ error: '请选择要绑定的子网', code: 'SUBNET_SELECT_REQUIRED' });
        const subnet = await db.subnets.getById(subnetId);
        if (!subnet) return res.status(404).json({ error: '子网不存在', code: 'SUBNET_NOT_FOUND' });

        const access = await checkDeviceAccess(req, 'lxc', vmid, { allowRunning: req.user.role === 'admin' });
        if (access.error) return res.status(access.error.status).json({ error: access.error.message, code: access.error.code });
        const ct = access.record;
        if (req.user.role !== 'admin' && subnet.user_id !== ct.user_id) {
            return res.status(403).json({ error: '子网与容器不属于同一用户', code: 'SUBNET_LXC_OWNER_MISMATCH' });
        }
        // M-2 修复：到期资源拦截（子网绑定属于资源使用）
        if (req.user.role !== 'admin' && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
            return res.status(403).json({ error: '容器已到期，请先续费', code: 'LXC_EXPIRED_RENEW' });
        }
        if (ct.subnet_id) {
            return res.status(400).json({ error: '该容器已绑定子网，请先解绑后再绑定新的子网', code: 'LXC_ALREADY_BOUND_SUBNET' });
        }

        // 多节点：按设备归属 PVE 节点解析客户端（查不到节点行回退默认）
        const ctPve = await getPveClient(ct.pve_node_id);
        let net0 = '';
        try {
            const config = await ctPve.getLxcConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取容器配置失败: ' + safeError(e), code: 'LXC_CFG_READ_FAILED', params: [safeError(e)] });
        }
        if (!net0) return res.status(400).json({ error: '容器网卡配置异常，无法绑定子网', code: 'LXC_NIC_ABNORMAL' });
        if (net0.indexOf('tag=') > -1) return res.status(400).json({ error: '容器网卡已存在 VLAN 标记，请先解绑', code: 'LXC_NIC_VLAN_EXISTS' });
        try {
            await ctPve.updateLxcConfig(vmid, { net0: net0 + ',tag=' + subnet.vlan_id });
        } catch (e) {
            return res.status(500).json({ error: '写入 VLAN 标记失败: ' + safeError(e), code: 'VLAN_TAG_WRITE_FAILED', params: [safeError(e)] });
        }

        let dhcpIp = '';
        try {
            const config = await ctPve.getLxcConfig(vmid);
            const macMatch = ((config && config.net0) || '').match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (macMatch) {
                await removeDhcpStaticBinding('lxc', vmid);
                dhcpIp = await createDhcpStaticBinding('lxc', vmid, macMatch[0], '', subnet);
            }
        } catch (e) {
            console.error('[subnet] LXC 绑定 DHCP 失败:', e.message);
        }

        await db.lxcContainers.update(ct.id, { subnet_id: subnetId, dhcp_static_ip: dhcpIp || '' });
        await refreshSubnetAvailable(subnet);
        // 设备 IP 已更换：同步重建端口转发（爱快删旧建新 + DB 回写新 IP）
        let rebuiltCount = 0;
        if (dhcpIp) {
            rebuiltCount = await rebuildPortForwardsForDevice('lxc', vmid, dhcpIp);
        }
        await auditAction(req, 'subnet.bind.lxc', 'LXC ' + vmid + ' 绑定子网 ' + subnet.vlan_name + ' (VLAN ' + subnet.vlan_id + ')' + (dhcpIp ? ', 分配IP ' + dhcpIp : '') + (rebuiltCount > 0 ? ', 更新端口转发 ' + rebuiltCount + ' 条' : ''), { resourceType: 'subnet', resourceId: subnetId });
        res.json({ message: '绑定成功', dhcp_static_ip: dhcpIp, subnet_id: subnetId, port_forwards_rebuilt: rebuiltCount });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== VM 解绑子网 =====
router.post('/vm/:vmid/unbind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的设备 ID', code: 'INVALID_DEVICE_ID' });
        const access = await checkDeviceAccess(req, 'vm', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message, code: access.error.code });
        const vm = access.record;
        // M-2 修复：到期资源拦截（子网解绑同样属于资源管理操作，仅放行销毁类）
        if (req.user.role !== 'admin' && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
            return res.status(403).json({ error: '虚拟机已到期，请先续费', code: 'VM_EXPIRED_RENEW' });
        }
        if (!vm.subnet_id) return res.status(400).json({ error: '该虚拟机未绑定子网', code: 'VM_NOT_BOUND_SUBNET' });
        const subnet = await db.subnets.getById(vm.subnet_id);

        // PVE 网卡移除 VLAN tag（多节点：按设备归属 PVE 节点解析客户端，查不到节点行回退默认）
        const vmPve = await getPveClient(vm.pve_node_id);
        let net0 = '';
        try {
            const config = await vmPve.getVmConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取虚拟机配置失败: ' + safeError(e), code: 'VM_CFG_READ_FAILED', params: [safeError(e)] });
        }
        const newNet0 = net0.replace(/,\s*tag=\d+/, '');
        if (newNet0 !== net0) {
            try {
                await vmPve.updateVmConfig(vmid, { net0: newNet0 });
            } catch (e) {
                return res.status(500).json({ error: '移除 VLAN 标记失败: ' + safeError(e), code: 'VLAN_TAG_REMOVE_FAILED', params: [safeError(e)] });
            }
        }

        try { await removeDhcpStaticBinding('vm', vmid); } catch (e) { console.error('[subnet] VM 解绑 DHCP 失败:', e.message); }
        await db.vms.update(vm.id, { subnet_id: null, dhcp_static_ip: '' });
        if (subnet) await refreshSubnetAvailable(subnet);
        await auditAction(req, 'subnet.unbind.vm', 'VM ' + vmid + ' 解绑子网 ' + (subnet ? subnet.vlan_name : String(vm.subnet_id)), { resourceType: 'subnet', resourceId: vm.subnet_id });
        res.json({ message: '解绑成功' });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ===== LXC 解绑子网 =====
router.post('/lxc/:vmid/unbind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的设备 ID', code: 'INVALID_DEVICE_ID' });
        const access = await checkDeviceAccess(req, 'lxc', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message, code: access.error.code });
        const ct = access.record;
        // M-2 修复：到期资源拦截（子网解绑同样属于资源管理操作，仅放行销毁类）
        if (req.user.role !== 'admin' && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
            return res.status(403).json({ error: '容器已到期，请先续费', code: 'LXC_EXPIRED_RENEW' });
        }
        if (!ct.subnet_id) return res.status(400).json({ error: '该容器未绑定子网', code: 'LXC_NOT_BOUND_SUBNET' });
        const subnet = await db.subnets.getById(ct.subnet_id);

        // 多节点：按设备归属 PVE 节点解析客户端（查不到节点行回退默认）
        const ctPve = await getPveClient(ct.pve_node_id);
        let net0 = '';
        try {
            const config = await ctPve.getLxcConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取容器配置失败: ' + safeError(e), code: 'LXC_CFG_READ_FAILED', params: [safeError(e)] });
        }
        const newNet0 = net0.replace(/,\s*tag=\d+/, '');
        if (newNet0 !== net0) {
            try {
                await ctPve.updateLxcConfig(vmid, { net0: newNet0 });
            } catch (e) {
                return res.status(500).json({ error: '移除 VLAN 标记失败: ' + safeError(e), code: 'VLAN_TAG_REMOVE_FAILED', params: [safeError(e)] });
            }
        }

        try { await removeDhcpStaticBinding('lxc', vmid); } catch (e) { console.error('[subnet] LXC 解绑 DHCP 失败:', e.message); }
        await db.lxcContainers.update(ct.id, { subnet_id: null, dhcp_static_ip: '' });
        if (subnet) await refreshSubnetAvailable(subnet);
        await auditAction(req, 'subnet.unbind.lxc', 'LXC ' + vmid + ' 解绑子网 ' + (subnet ? subnet.vlan_name : String(ct.subnet_id)), { resourceType: 'subnet', resourceId: ct.subnet_id });
        res.json({ message: '解绑成功' });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
