const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware } = require('../middleware/auth');
const { createDhcpStaticBinding, removeDhcpStaticBinding, isIpInAddrPool } = require('../services/dhcp');
const { rebuildPortForwardsForDevice } = require('../services/port-forward-sync');
const { safeError } = require('../utils/safe-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { auditAction } = require('../utils/audit-log');

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

// 生成 VLAN 备注：用户{username}网络组NT-{6位随机}
function generateVlanComment(username) {
    const rand = crypto.randomBytes(3).toString('hex').slice(0, 6);
    return '用户' + username + '网络组NT-' + rand;
}

// 刷新子网 DHCP 剩余可用数（从爱快查询回写 DB）
async function refreshSubnetAvailable(subnet) {
    if (!subnet || !ikuaiApi.isConfigured()) return;
    try {
        const server = await ikuaiApi.getDhcpServerByInterface(subnet.vlan_name);
        if (server) {
            await db.subnets.update(subnet.id, { available: server.available || 0, ikuai_dhcp_id: String(server.id) });
        }
    } catch (e) {
        console.error('[subnet] 刷新可用 IP 失败:', e.message);
    }
}

// 校验设备归属 + 关机状态，返回 { record, status } 或 { error }
async function checkDeviceAccess(req, type, vmid) {
    const record = type === 'vm'
        ? (await db.vms.getAll()).find(v => v.vm_id === vmid)
        : (await db.lxcContainers.getAll()).find(c => c.ct_id === vmid);
    if (!record) {
        return { error: { status: 404, message: (type === 'vm' ? '虚拟机' : '容器') + '不存在' } };
    }
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
        return { error: { status: 403, message: '无权限操作此' + (type === 'vm' ? '虚拟机' : '容器') } };
    }
    // 绑定/解绑必须关机（运行中拒绝操作）
    let status = null;
    try {
        status = type === 'vm' ? await pveApi.getVmStatus(vmid) : await pveApi.getLxcStatus(vmid);
    } catch (e) {
        status = null;
    }
    if (status && status.status === 'running') {
        return { error: { status: 400, message: '请先关闭服务器，关机后才能进行子网操作' } };
    }
    return { record, status };
}

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
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 新建子网（创建爱快 VLAN + DHCP 服务端） =====
router.post('/subnets', authMiddleware, async (req, res) => {
    // 限速：防止频繁外呼爱快导致外部系统被拖垮
    const rateLimitResult = await checkConfiguredRateLimit('subnet_create', 'ratelimit:subnet-create:' + req.user.id);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: '创建子网过于频繁，请稍后再试' });
    }
    try {
        // 1. 读取 admin 配置
        const segStart = (await db.config.get('vlan:ip_segment_start') || '172.16.0.1').trim();
        const idStart = parseInt(await db.config.get('vlan:id_start')) || 1000;
        const iface = (await db.config.get('vlan:interface') || 'lan1').trim();
        const dns1 = await db.config.get('dhcp:dns1') || '180.76.76.76';
        const dns2 = await db.config.get('dhcp:dns2') || '223.5.5.5';
        if (!VALID_IP_RE.test(segStart)) return res.status(400).json({ error: 'IP 段开始范围配置无效，请联系管理员' });
        if (idStart < 2 || idStart > 4090) return res.status(400).json({ error: 'VLANID 开始范围必须在 2~4090 之间' });
        if (!iface) return res.status(400).json({ error: '所属接口未配置，请联系管理员' });
        if (!ikuaiApi.isConfigured()) return res.status(400).json({ error: '爱快未配置，无法创建子网' });

        // 2. 已占用清单（DB 台账 + 爱快实际，双源合并防冲突）
        const dbVlanIds = await db.subnets.getUsedVlanIds();
        const dbGateways = await db.subnets.getUsedGateways();
        let ikuaiVlans = [];
        try {
            ikuaiVlans = await ikuaiApi.getVlans();
        } catch (e) {
            console.error('[subnet] 获取爱快 VLAN 列表失败:', e.message);
            return res.status(500).json({ error: '获取爱快 VLAN 列表失败，请稍后重试' });
        }
        const usedVlanIds = new Set(dbVlanIds.concat(ikuaiVlans.map(v => parseInt(v.vlan_id)).filter(n => Number.isInteger(n))));
        const usedGateways = new Set(dbGateways.concat(ikuaiVlans.map(v => v.ip_addr).filter(Boolean)));
        const existingNames = ikuaiVlans.map(v => v.vlan_name).filter(Boolean);

        // 3. 分配 VLAN ID（从配置起始值递增）
        let vlanId = idStart;
        while (usedVlanIds.has(vlanId)) vlanId++;
        if (vlanId > 4090) return res.status(400).json({ error: 'VLAN ID 已用尽（上限 4090），请联系管理员调整起始值' });

        // 4. 分配网关 IP（倒数第二位 +1，直到未占用）
        const baseParts = segStart.split('.').map(Number);
        let gw = null;
        let seg = baseParts[2];
        for (let i = 0; i < 256 - baseParts[2]; i++) {
            const candidate = baseParts[0] + '.' + baseParts[1] + '.' + seg + '.1';
            if (!usedGateways.has(candidate)) { gw = candidate; break; }
            seg++;
        }
        if (!gw) return res.status(400).json({ error: 'IP 段已用尽，请联系管理员调整起始网段' });

        // 5. VLAN 名称（系统内置，随机生成）
        const vlanName = generateVlanName(existingNames);
        if (!vlanName) return res.status(400).json({ error: 'VLAN 名称生成失败，请重试' });

        // 6. 爱快创建 VLAN + DHCP 服务端
        const prefix = gw.split('.').slice(0, 3).join('.');
        const addrPool = prefix + '.2-' + prefix + '.255';
        const comment = generateVlanComment(req.user.username);

        await ikuaiApi.addVlan({ vlan_id: vlanId, vlan_name: vlanName, ip_addr: gw, interface: iface, netmask: '255.255.255.0', comment });
        let dhcpId = '';
        let available = 0;
        try {
            await ikuaiApi.addDhcpServer({ interface: vlanName, addr_pool: addrPool, netmask: '255.255.255.0', gateway: gw, dns1, dns2 });
            // 爱快对新建 DHCP 服务端的 available 为异步计算，轮询重试获取
            for (let attempt = 0; attempt < 3; attempt++) {
                await new Promise(r => setTimeout(r, 1000));
                const server = await ikuaiApi.getDhcpServerByInterface(vlanName);
                if (server) {
                    dhcpId = String(server.id);
                    available = server.available || 0;
                    if (available > 0) break;
                }
            }
            // 兜底：仍取不到时按池容量减去已绑定静态 IP 估算（与爱快语义一致）
            if (available <= 0) {
                try {
                    const bindings = await ikuaiApi.getDhcpStaticBindings();
                    const bound = bindings.filter(b => b.interface === vlanName).length;
                    available = Math.max(0, 254 - bound);
                } catch (_) {}
            }
        } catch (e) {
            // DHCP 服务端创建失败：回滚已创建的 VLAN，避免孤儿资源
            try {
                const vlans = await ikuaiApi.getVlans();
                const created = vlans.find(v => v.vlan_name === vlanName);
                if (created && created.id) await ikuaiApi.deleteVlan(created.id);
            } catch (_) {}
            return res.status(500).json({ error: '创建 DHCP 服务端失败: ' + safeError(e) });
        }

        // 反查 VLAN id（add 不返回 id）
        let ikuaiVlanId = '';
        try {
            const vlans = await ikuaiApi.getVlans();
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
            ikuai_dhcp_id: dhcpId
        });

        await auditAction(req, 'subnet.create', '创建子网 ' + vlanName + ' (VLAN ' + vlanId + ', 网关 ' + gw + ', 地址池 ' + addrPool + ')', { resourceType: 'subnet', resourceId: subnet.id });
        res.json(subnet);
    } catch (e) {
        console.error('[subnet] 创建子网失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 删除子网（有绑定设备禁止删除） =====
router.delete('/subnets/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const subnet = await db.subnets.getById(id);
        if (!subnet) return res.status(404).json({ error: '子网不存在' });
        if (req.user.role !== 'admin' && subnet.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权限操作此子网' });
        }
        const bound = await db.subnets.getBoundCount(id);
        if (bound.vm + bound.lxc > 0) {
            return res.status(400).json({ error: '该子网下已有 ' + (bound.vm + bound.lxc) + ' 台服务器绑定，无法删除' });
        }
        // 清理爱快侧资源（尽力而为，失败不阻断 DB 删除）
        if (ikuaiApi.isConfigured()) {
            if (subnet.ikuai_dhcp_id) {
                try { await ikuaiApi.deleteDhcpServer(subnet.ikuai_dhcp_id); } catch (e) { console.error('[subnet] 删除 DHCP 服务端失败:', e.message); }
            }
            if (subnet.ikuai_vlan_id) {
                try { await ikuaiApi.deleteVlan(subnet.ikuai_vlan_id); } catch (e) { console.error('[subnet] 删除 VLAN 失败:', e.message); }
            }
        }
        await db.subnets.delete(id);
        await auditAction(req, 'subnet.delete', '删除子网 ' + subnet.vlan_name + ' (VLAN ' + subnet.vlan_id + ')', { resourceType: 'subnet', resourceId: id });
        res.json({ message: '子网已删除' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 刷新子网可用 IP 数（绑定/类似操作时回写） =====
router.post('/subnets/:id/refresh', authMiddleware, async (req, res) => {
    const rateLimitResult = await checkConfiguredRateLimit('subnet_refresh', 'ratelimit:subnet-refresh:' + req.user.id);
    if (!rateLimitResult.allowed) {
        return res.status(429).json({ error: '刷新过于频繁，请稍后再试' });
    }
    try {
        const id = parseInt(req.params.id);
        const subnet = await db.subnets.getById(id);
        if (!subnet) return res.status(404).json({ error: '子网不存在' });
        if (req.user.role !== 'admin' && subnet.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权限操作此子网' });
        }
        await refreshSubnetAvailable(subnet);
        const updated = await db.subnets.getById(id);
        await auditAction(req, 'subnet.refresh', '刷新子网 ' + subnet.vlan_name + ' 可用IP: ' + (updated ? updated.available : 0), { resourceType: 'subnet', resourceId: id });
        res.json({ available: updated ? updated.available : 0 });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== VM 绑定子网 =====
router.post('/vm/:vmid/bind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const subnetId = parseInt(req.body.subnet_id);
        if (!Number.isInteger(subnetId) || subnetId <= 0) return res.status(400).json({ error: '请选择要绑定的子网' });
        const subnet = await db.subnets.getById(subnetId);
        if (!subnet) return res.status(404).json({ error: '子网不存在' });

        const access = await checkDeviceAccess(req, 'vm', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message });
        const vm = access.record;
        // 非管理员：设备与子网必须同属当前用户
        if (req.user.role !== 'admin' && subnet.user_id !== vm.user_id) {
            return res.status(403).json({ error: '子网与虚拟机不属于同一用户' });
        }
        // 已绑定子网的设备必须先解绑
        if (vm.subnet_id) {
            return res.status(400).json({ error: '该虚拟机已绑定子网，请先解绑后再绑定新的子网' });
        }

        // PVE 网卡写入 VLAN tag（保留原 mac/bridge/model）
        let net0 = '';
        try {
            const config = await pveApi.getVmConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取虚拟机配置失败: ' + safeError(e) });
        }
        if (!net0) return res.status(400).json({ error: '虚拟机网卡配置异常，无法绑定子网' });
        if (net0.indexOf('tag=') > -1) return res.status(400).json({ error: '虚拟机网卡已存在 VLAN 标记，请先解绑' });
        try {
            await pveApi.updateVmConfig(vmid, { net0: net0 + ',tag=' + subnet.vlan_id });
        } catch (e) {
            return res.status(500).json({ error: '写入 VLAN 标记失败: ' + safeError(e) });
        }

        // 清除旧的 DHCP 静态绑定并立即创建新子网的绑定
        let dhcpIp = '';
        try {
            const config = await pveApi.getVmConfig(vmid);
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
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== LXC 绑定子网 =====
router.post('/lxc/:vmid/bind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const subnetId = parseInt(req.body.subnet_id);
        if (!Number.isInteger(subnetId) || subnetId <= 0) return res.status(400).json({ error: '请选择要绑定的子网' });
        const subnet = await db.subnets.getById(subnetId);
        if (!subnet) return res.status(404).json({ error: '子网不存在' });

        const access = await checkDeviceAccess(req, 'lxc', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message });
        const ct = access.record;
        if (req.user.role !== 'admin' && subnet.user_id !== ct.user_id) {
            return res.status(403).json({ error: '子网与容器不属于同一用户' });
        }
        if (ct.subnet_id) {
            return res.status(400).json({ error: '该容器已绑定子网，请先解绑后再绑定新的子网' });
        }

        let net0 = '';
        try {
            const config = await pveApi.getLxcConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取容器配置失败: ' + safeError(e) });
        }
        if (!net0) return res.status(400).json({ error: '容器网卡配置异常，无法绑定子网' });
        if (net0.indexOf('tag=') > -1) return res.status(400).json({ error: '容器网卡已存在 VLAN 标记，请先解绑' });
        try {
            await pveApi.updateLxcConfig(vmid, { net0: net0 + ',tag=' + subnet.vlan_id });
        } catch (e) {
            return res.status(500).json({ error: '写入 VLAN 标记失败: ' + safeError(e) });
        }

        let dhcpIp = '';
        try {
            const config = await pveApi.getLxcConfig(vmid);
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
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== VM 解绑子网 =====
router.post('/vm/:vmid/unbind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const access = await checkDeviceAccess(req, 'vm', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message });
        const vm = access.record;
        if (!vm.subnet_id) return res.status(400).json({ error: '该虚拟机未绑定子网' });
        const subnet = await db.subnets.getById(vm.subnet_id);

        // PVE 网卡移除 VLAN tag
        let net0 = '';
        try {
            const config = await pveApi.getVmConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取虚拟机配置失败: ' + safeError(e) });
        }
        const newNet0 = net0.replace(/,\s*tag=\d+/, '');
        if (newNet0 !== net0) {
            try {
                await pveApi.updateVmConfig(vmid, { net0: newNet0 });
            } catch (e) {
                return res.status(500).json({ error: '移除 VLAN 标记失败: ' + safeError(e) });
            }
        }

        try { await removeDhcpStaticBinding('vm', vmid); } catch (e) { console.error('[subnet] VM 解绑 DHCP 失败:', e.message); }
        await db.vms.update(vm.id, { subnet_id: null, dhcp_static_ip: '' });
        if (subnet) await refreshSubnetAvailable(subnet);
        await auditAction(req, 'subnet.unbind.vm', 'VM ' + vmid + ' 解绑子网 ' + (subnet ? subnet.vlan_name : String(vm.subnet_id)), { resourceType: 'subnet', resourceId: vm.subnet_id });
        res.json({ message: '解绑成功' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== LXC 解绑子网 =====
router.post('/lxc/:vmid/unbind-subnet', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const access = await checkDeviceAccess(req, 'lxc', vmid);
        if (access.error) return res.status(access.error.status).json({ error: access.error.message });
        const ct = access.record;
        if (!ct.subnet_id) return res.status(400).json({ error: '该容器未绑定子网' });
        const subnet = await db.subnets.getById(ct.subnet_id);

        let net0 = '';
        try {
            const config = await pveApi.getLxcConfig(vmid);
            net0 = (config && config.net0) || '';
        } catch (e) {
            return res.status(500).json({ error: '读取容器配置失败: ' + safeError(e) });
        }
        const newNet0 = net0.replace(/,\s*tag=\d+/, '');
        if (newNet0 !== net0) {
            try {
                await pveApi.updateLxcConfig(vmid, { net0: newNet0 });
            } catch (e) {
                return res.status(500).json({ error: '移除 VLAN 标记失败: ' + safeError(e) });
            }
        }

        try { await removeDhcpStaticBinding('lxc', vmid); } catch (e) { console.error('[subnet] LXC 解绑 DHCP 失败:', e.message); }
        await db.lxcContainers.update(ct.id, { subnet_id: null, dhcp_static_ip: '' });
        if (subnet) await refreshSubnetAvailable(subnet);
        await auditAction(req, 'subnet.unbind.lxc', 'LXC ' + vmid + ' 解绑子网 ' + (subnet ? subnet.vlan_name : String(ct.subnet_id)), { resourceType: 'subnet', resourceId: ct.subnet_id });
        res.json({ message: '解绑成功' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
