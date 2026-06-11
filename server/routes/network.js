const express = require('express');
const router = express.Router();
const db = require('../api/db-sqlite');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createDhcpStaticBinding, getWanInterface } = require('../services/dhcp');
const dbg = require('../utils/debug');
router.get('/admin/network/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let ifaceList = [];
        try { ifaceList = JSON.parse(db.config.get('forward:iface_list') || '[]'); } catch (_) {}
        res.json({
            port_range_start: parseInt(db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(db.config.get('forward:port_range_end')) || 60000,
            default_protocol: db.config.get('forward:default_protocol') || 'tcp',
            wan_interface: db.config.get('forward:wan_interface') || '',
            max_per_user: parseInt(db.config.get('forward:max_per_user')) || 10,
            iface_list: ifaceList,
            dhcp_ip_range_start: db.config.get('dhcp:ip_range_start') || '10.0.0.110',
            dhcp_ip_range_end: db.config.get('dhcp:ip_range_end') || '10.0.0.199',
            dhcp_interface: db.config.get('dhcp:interface') || 'lan2',
            dhcp_gateway: db.config.get('dhcp:gateway') || '10.0.0.1',
            dhcp_dns1: db.config.get('dhcp:dns1') || '119.29.29.29',
            dhcp_dns2: db.config.get('dhcp:dns2') || '223.5.5.5'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/admin/network/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { port_range_start, port_range_end, default_protocol, wan_interface, max_per_user,
                dhcp_ip_range_start, dhcp_ip_range_end, dhcp_interface, dhcp_gateway, dhcp_dns1, dhcp_dns2 } = req.body;
        const setConfig = db.config.set;
        setConfig('forward:port_range_start', String(port_range_start ?? 50000));
        setConfig('forward:port_range_end', String(port_range_end ?? 60000));
        setConfig('forward:default_protocol', default_protocol || 'tcp');
        setConfig('forward:wan_interface', wan_interface || '');
        setConfig('forward:max_per_user', String(max_per_user ?? 10));
        setConfig('dhcp:ip_range_start', dhcp_ip_range_start || '10.0.0.110');
        setConfig('dhcp:ip_range_end', dhcp_ip_range_end || '10.0.0.199');
        setConfig('dhcp:interface', dhcp_interface || 'lan2');
        setConfig('dhcp:gateway', dhcp_gateway || '10.0.0.1');
        setConfig('dhcp:dns1', dhcp_dns1 || '119.29.29.29');
        setConfig('dhcp:dns2', dhcp_dns2 || '223.5.5.5');
        res.json({ message: '网络配置已更新' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// P2-H1⑤ 修复：iKuai 接口信息需管理员权限（泄露内网拓扑）
router.get('/ikuai/interfaces', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const interfaces = await ikuaiApi.getInterfaces();
        const wanIfaces = interfaces.filter(i => i.type === 'wan');
        
        // 自动对比：若已存储的 WAN 接口在 ikuai 上已不存在，自动替换为第一个可用 WAN 接口
        const storedIface = db.config.get('forward:wan_interface');
        if (storedIface && wanIfaces.length > 0) {
            const exists = wanIfaces.some(i => i.name === storedIface);
            if (!exists) {
                const newIface = wanIfaces[0].name;
                db.config.set('forward:wan_interface', newIface);
                console.log(`[端口转发] 接口 ${storedIface} 已不存在，自动切换为 ${newIface}`);
            }
        }
        
        // 缓存完整接口列表到数据库（含 WAN + LAN），前端加载后直接使用
        db.config.set('forward:iface_list', JSON.stringify(interfaces));
        
        res.json(interfaces);
    } catch (e) {
        res.status(500).json({ error: '获取接口列表失败: ' + e.message });
    }
});

router.post('/ikuai/sync-dhcp-bindings', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const bindings = await ikuaiApi.getDhcpStaticBindings();
        let updated = 0, skipped = 0, errors = 0;

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
                    const vm = db.vms.getAll().find(v => v.vm_id === vmId);
                    if (vm && vm.dhcp_static_ip !== b.ip) {
                        db.vms.update(vm.id, { dhcp_static_ip: b.ip });
                        updated++;
                    } else {
                        skipped++;
                    }
                } else if (ctMatch) {
                    const ctId = parseInt(ctMatch[1]);
                    const ct = db.lxcContainers.getByCtId(ctId);
                    if (ct && ct.length > 0 && ct[0].dhcp_static_ip !== b.ip) {
                        db.lxcContainers.update(ct[0].id, { dhcp_static_ip: b.ip });
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
        res.json({ updated, skipped, errors, total: bindings.length });
    } catch (e) {
        res.status(500).json({ error: '同步 DHCP 静态绑定失败: ' + e.message });
    }
});

router.get('/port-forwards', authMiddleware, async (req, res) => {
    try {
        const { type, vm_id, ct_id } = req.query;
        let rules;
        if (req.user.role === 'admin') {
            if (type) rules = db.portForwards.getByType(type);
            else rules = db.portForwards.getAll();
        } else {
            rules = db.portForwards.getByUserId(req.user.id);
            if (type) rules = rules.filter(r => r.type === type);
        }
        res.json(rules);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/port-forwards', authMiddleware, async (req, res) => {
    try {
        const isAdmin = req.user.role === 'admin';
        const { type, vm_id, ct_id, name, ip, internal_port, external_port, protocol } = req.body;
        if (!type || !ip || !internal_port || !external_port) {
            return res.status(400).json({ error: '缺少必要参数' });
        }
        if (internal_port < 1 || internal_port > 65535 || external_port < 1 || external_port > 65535) {
            return res.status(400).json({ error: '端口必须在 1-65535 之间' });
        }

        // L-2 修复：IPv4 格式合法性校验
        if (!/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
            return res.status(400).json({ error: '无效的 IP 地址格式' });
        }

        // 普通用户禁止内网保留地址段
        if (!isAdmin) {
            const parts = ip.split('.').map(Number);
            const isPrivate = (
                (parts[0] === 10) ||
                (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
                (parts[0] === 192 && parts[1] === 168) ||
                (parts[0] === 127)
            );
            if (isPrivate) {
                return res.status(400).json({ error: '不允许指向内网保留 IP 地址' });
            }
        }

        const config = {
            port_range_start: parseInt(db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(db.config.get('forward:port_range_end')) || 60000,
            max_per_user: parseInt(db.config.get('forward:max_per_user')) || 10,
        };
        if (external_port < config.port_range_start || external_port > config.port_range_end) {
            return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
        }
        // 普通用户检查数量限制
        if (req.user.role !== 'admin') {
            const count = db.portForwards.getCountByUserId(req.user.id);
            if (count >= config.max_per_user) {
                return res.status(400).json({ error: `转发规则数量已达上限（${config.max_per_user} 条），如需新增请联系管理员` });
            }
        }
        // 新增：校验目标资源归属
        if (vm_id && !isAdmin) {
            const userVms = db.vms.getByUserId(req.user.id);
            const ownedVm = userVms.some(v => v.vm_id == vm_id);
            if (!ownedVm) {
                return res.status(403).json({ error: '无权为此虚拟机创建转发规则' });
            }
        }
        if (ct_id && !isAdmin) {
            const userCts = db.lxcContainers.getByUserId(req.user.id);
            const ownedCt = userCts.some(c => c.ct_id == ct_id);
            if (!ownedCt) {
                return res.status(403).json({ error: '无权为此容器创建转发规则' });
            }
        }
        // 校验端口冲突（本地 + ikuai）
        const existing = db.portForwards.getByExternalPort(external_port);
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
        const rule = db.portForwards.create({
            type, vm_id: vm_id || null, ct_id: ct_id || null,
            name: name || '', ip, internal_port, external_port,
            protocol: protocol || 'tcp', sync_status: 'pending'
        });
        // 同步到 ikuai
        try {
            const wanIface = await getWanInterface();
            const comment = `${name || '转发'}_VM${vm_id}`;
            await ikuaiApi.addPortForward({ ip, internal_port, external_port, protocol: protocol || 'tcp', comment, enabled: true, interface: wanIface });
            // 爱快 add 接口不返回 ID，从 ikuai 规则列表反查
            let ikuaiId = '';
            try {
                const ikuaiRules = await ikuaiApi.getPortForwards();
                const match = ikuaiRules.find(r =>
                    String(r.wan_port) === String(external_port) &&
                    String(r.lan_port) === String(internal_port) &&
                    (r.lan_ip || r.lan_addr) === ip
                );
                if (match) ikuaiId = String(match.id);
            } catch (_) {}
            db.portForwards.update(rule.id, { sync_status: 'synced', ikuai_id: ikuaiId });
            rule.sync_status = 'synced';
        } catch (e) {
            db.portForwards.update(rule.id, { sync_status: 'failed' });
            rule.sync_status = 'failed';
            console.error('[端口转发] 同步到 ikuai 失败:', e.message);
        }
        res.json(rule);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.put('/port-forwards/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const existing = db.portForwards.getById(id);
        if (!existing) return res.status(404).json({ error: '规则不存在' });
        if (req.user.role !== 'admin') {
            const userRules = db.portForwards.getByUserId(req.user.id);
            if (!userRules.find(r => r.id === id)) return res.status(403).json({ error: '无权限' });
        }
        const { name, ip, internal_port, external_port, protocol } = req.body;
        if (external_port) {
            const config = {
                port_range_start: parseInt(db.config.get('forward:port_range_start')) || 50000,
                port_range_end: parseInt(db.config.get('forward:port_range_end')) || 60000,
            };
            if (external_port < config.port_range_start || external_port > config.port_range_end) {
                return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
            }
            const conflict = db.portForwards.getByExternalPort(external_port).filter(r => r.id !== id);
            if (conflict.length > 0) return res.status(400).json({ error: '外网端口已被占用，请更换' });
        }
        // 检测端口或 IP 变更，需要同步爱快
        const portChanged = external_port && Number(external_port) !== Number(existing.external_port);
        const ipChanged = ip && ip !== existing.ip;
        const internalChanged = internal_port && Number(internal_port) !== Number(existing.internal_port);
        const needIkuaiSync = ipChanged || portChanged || internalChanged;
        let newIkuaiId = existing.ikuai_id || '';
        if (needIkuaiSync) {
            db.portForwards.update(id, { sync_status: 'pending' });
            try {
                if (existing.ikuai_id) {
                    await ikuaiApi.deletePortForward(existing.ikuai_id);
                } else if (ikuaiApi.isConfigured()) {
                    // 没有 ikuai_id，按旧端口信息匹配删除
                    const ikuaiRules = await ikuaiApi.getPortForwards();
                    const oldMatch = ikuaiRules.find(r =>
                        String(r.wan_port) === String(existing.external_port) &&
                        String(r.lan_port) === String(existing.internal_port) &&
                        (r.lan_ip || r.lan_addr) === existing.ip
                    );
                    if (oldMatch) await ikuaiApi.deletePortForward(oldMatch.id);
                }
                const wanIface = await getWanInterface();
                const comment = `${name || existing.name || '转发'}_VM${existing.vm_id}`;
                await ikuaiApi.addPortForward({ ip: ip || existing.ip, internal_port: internal_port || existing.internal_port, external_port: external_port || existing.external_port, protocol: protocol || existing.protocol, comment, enabled: true, interface: wanIface });
                try {
                    const ikuaiRules = await ikuaiApi.getPortForwards();
                    const match = ikuaiRules.find(r =>
                        String(r.wan_port) === String(external_port || existing.external_port) &&
                        String(r.lan_port) === String(internal_port || existing.internal_port) &&
                        (r.lan_ip || r.lan_addr) === (ip || existing.ip)
                    );
                    if (match) newIkuaiId = String(match.id);
                } catch (_) {}
            } catch (e) {
                db.portForwards.update(id, { sync_status: 'failed' });
                return res.status(500).json({ error: '同步到 ikuai 失败，数据已保留: ' + e.message });
            }
        }
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (ip !== undefined) updates.ip = ip;
        if (internal_port !== undefined) updates.internal_port = internal_port;
        if (external_port !== undefined) updates.external_port = external_port;
        if (protocol !== undefined) updates.protocol = protocol;
        if (!needIkuaiSync) updates.sync_status = existing.sync_status;
        else {
            updates.sync_status = 'synced';
            if (newIkuaiId) updates.ikuai_id = newIkuaiId;
        }
        const updated = db.portForwards.update(id, updates);
        res.json(updated);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.delete('/port-forwards/:id', authMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const rule = db.portForwards.getById(id);
        if (!rule) return res.status(404).json({ error: '规则不存在' });
        if (req.user.role !== 'admin') {
            const userRules = db.portForwards.getByUserId(req.user.id);
            if (!userRules.find(r => r.id === id)) return res.status(403).json({ error: '无权限' });
        }
        // 孤儿规则直接删本地
        if (rule.sync_status === 'orphan') {
            db.portForwards.delete(id);
            return res.json({ message: '规则已删除' });
        }
        // 正常规则同步删除
        try {
            if (rule.ikuai_id) {
                await ikuaiApi.deletePortForward(rule.ikuai_id);
            } else if (ikuaiApi.isConfigured()) {
                // 如果没有 ikuai_id，尝试按端口匹配删除
                const ikuaiRules = await ikuaiApi.getPortForwards();
                const match = ikuaiRules.find(r =>
                    String(r.wan_port) === String(rule.external_port) &&
                    String(r.lan_port) === String(rule.internal_port) &&
                    (r.lan_ip || r.lan_addr) === rule.ip
                );
                if (match) {
                    await ikuaiApi.deletePortForward(match.id);
                }
            }
        } catch (e) {
            console.error('[端口转发] ikuai 删除失败:', e.message);
        }
        db.portForwards.delete(id);
        res.json({ message: '规则已删除' });
    } catch (e) {
        res.status(500).json({ error: e.message });
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
                const rule = db.portForwards.getById(id);
                if (!rule) continue;
                if (rule.sync_status !== 'orphan' && rule.ikuai_id) {
                    try {
                        await ikuaiApi.deletePortForward(rule.ikuai_id);
                    } catch (e) {
                        console.error(`[批量删除] ikuai 删除 ID=${id} 失败:`, e.message);
                    }
                }
                db.portForwards.delete(id);
                results.success++;
            } catch (e) {
                results.failed++;
            }
        }
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/port-forwards/random-port', authMiddleware, async (req, res) => {
    try {
        const portRangeStart = parseInt(db.config.get('forward:port_range_start')) || 50000;
        const portRangeEnd = parseInt(db.config.get('forward:port_range_end')) || 60000;
        const usedPorts = new Set(db.portForwards.getUsedPorts().map(r => r.external_port));
        // 也从 ikuai 获取已用端口
        if (ikuaiApi.isConfigured()) {
            try {
                const ikuaiRules = await ikuaiApi.getPortForwards();
                ikuaiRules.forEach(r => {
                    if (r.wan_port) usedPorts.add(parseInt(r.wan_port));
                });
            } catch (e) {}
        }
        const available = [];
        for (let p = portRangeStart; p <= portRangeEnd; p++) {
            if (!usedPorts.has(p)) available.push(p);
        }
        if (available.length === 0) {
            return res.status(400).json({ error: '端口范围内无可用端口' });
        }
        const randomPort = available[Math.floor(Math.random() * available.length)];
        res.json({ port: randomPort });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/port-forwards/check-port', authMiddleware, async (req, res) => {
    try {
        const port = parseInt(req.query.port);
        if (!port || port < 1 || port > 65535) {
            return res.status(400).json({ error: '无效端口' });
        }
        const existing = db.portForwards.getByExternalPort(port);
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
        res.status(500).json({ error: e.message });
    }
});

router.get('/port-forwards/config', authMiddleware, async (req, res) => {
    try {
        const maxPerUser = parseInt(db.config.get('forward:max_per_user')) || 10;
        const totalCount = db.portForwards.getCountByUserId(req.user.id);
        res.json({
            max_per_user: maxPerUser,
            port_range_start: parseInt(db.config.get('forward:port_range_start')) || 50000,
            port_range_end: parseInt(db.config.get('forward:port_range_end')) || 60000,
            used: totalCount,
            remaining: Math.max(0, maxPerUser - totalCount)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.get('/port-forwards/extract-ips', authMiddleware, async (req, res) => {
    try {
        const devices = [];
        const myVms = db.vms.getByUserId(req.user.id);
        const myCts = db.lxcContainers.getByUserId(req.user.id);
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
            const user = db.users.getById(vm.user_id);
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
            const user = db.users.getById(ct.user_id);
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
        res.status(500).json({ error: e.message });
    }
});


module.exports = router;
