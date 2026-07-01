const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createDhcpStaticBinding, getWanInterface, getWanInterfaces } = require('../services/dhcp');
const dbg = require('../utils/debug');
const { safeError } = require('../utils/safe-error');

// 解析 ikuai_id 字段，兼容旧格式（纯字符串）和新格式（JSON 数组）
// 返回 [{interface, id}] 数组
function parseIkuaiIds(raw) {
    if (!raw) return [];
    if (typeof raw !== 'string') return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
    // 旧格式：纯 ID 字符串
    return [{ interface: '', id: raw }];
}

// 序列化 ikuai_id 数组为 JSON 字符串
function stringifyIkuaiIds(arr) {
    return JSON.stringify(arr || []);
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
            dhcp_dns1: await db.config.get('dhcp:dns1') || '119.29.29.29',
            dhcp_dns2: await db.config.get('dhcp:dns2') || '223.5.5.5',
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
                cname_domain } = req.body;
        const setConfig = db.config.set;
        await setConfig('forward:port_range_start', String(port_range_start ?? 50000));
        await setConfig('forward:port_range_end', String(port_range_end ?? 60000));
        await setConfig('forward:default_protocol', default_protocol || 'tcp');
        // wan_interface 存储为 JSON 数组，兼容前端传入逗号分隔字符串、数组或单值
        let wanIfaceToStore = [];
        if (Array.isArray(wan_interface)) {
            wanIfaceToStore = wan_interface.filter(Boolean);
        } else if (typeof wan_interface === 'string') {
            wanIfaceToStore = wan_interface.split(',').map(s => s.trim()).filter(Boolean);
        }
        await setConfig('forward:wan_interface', JSON.stringify(wanIfaceToStore));
        await setConfig('forward:max_per_user', String(max_per_user ?? 10));
        await setConfig('dhcp:ip_range_start', dhcp_ip_range_start || '10.0.0.110');
        await setConfig('dhcp:ip_range_end', dhcp_ip_range_end || '10.0.0.199');
        await setConfig('dhcp:interface', dhcp_interface || 'lan2');
        await setConfig('dhcp:gateway', dhcp_gateway || '10.0.0.1');
        await setConfig('dhcp:dns1', dhcp_dns1 || '119.29.29.29');
        await setConfig('dhcp:dns2', dhcp_dns2 || '223.5.5.5');
        await setConfig('cname:domain', (cname_domain || '').trim());
        res.json({ message: '网络配置已更新' });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// CNAME 域名配置：所有已登录用户可读取，仅管理员可写入
router.get('/api/cname', authMiddleware, async (req, res) => {
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
        res.json({ updated, skipped, errors, total: bindings.length });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards', authMiddleware, async (req, res) => {
    try {
        const { type, vm_id, ct_id } = req.query;
        let rules;
        if (req.user.role === 'admin') {
            if (type) rules = await db.portForwards.getByType(type);
            else rules = await db.portForwards.getAll();
        } else {
            rules = await db.portForwards.getByUserId(req.user.id);
            if (type) rules = rules.filter(r => r.type === type);
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
        // general 类型强制 vm_id/ct_id 为 null
        const finalVmId = type === 'vm' ? (vm_id || null) : null;
        const finalCtId = type === 'lxc' ? (ct_id || null) : null;
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
        if (external_port < config.port_range_start || external_port > config.port_range_end) {
            return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
        }
        // 普通用户检查数量限制
        if (req.user.role !== 'admin') {
            const count = await db.portForwards.getCountByUserId(req.user.id);
            if (count >= config.max_per_user) {
                return res.status(400).json({ error: `转发规则数量已达上限（${config.max_per_user} 条），如需新增请联系管理员` });
            }
        }
        // 新增：校验目标资源归属（general 类型 vm_id/ct_id 均为 null，天然跳过）
        if (finalVmId && !isAdmin) {
            const userVms = await db.vms.getByUserId(req.user.id);
            const ownedVm = userVms.some(v => v.vm_id == finalVmId);
            if (!ownedVm) {
                return res.status(403).json({ error: '无权为此虚拟机创建转发规则' });
            }
        }
        if (finalCtId && !isAdmin) {
            const userCts = await db.lxcContainers.getByUserId(req.user.id);
            const ownedCt = userCts.some(c => c.ct_id == finalCtId);
            if (!ownedCt) {
                return res.status(403).json({ error: '无权为此容器创建转发规则' });
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
            name: name || '', ip, internal_port, external_port,
            protocol: protocol || 'tcp', sync_status: 'pending'
        });
        // 同步到 ikuai（一条规则支持多外网接口，interface 字段传逗号分隔值）
        try {
            const wanIfaces = await getWanInterfaces();
            // comment 根据 type 区分：general → _GENERAL，lxc → _CT${ct_id}，vm → _VM${vm_id}
            const comment = type === 'general'
                ? `${name || '转发'}_GENERAL`
                : type === 'lxc'
                    ? `${name || '转发'}_CT${finalCtId}`
                    : `${name || '转发'}_VM${finalVmId}`;
            const ifaceStr = wanIfaces.join(',');
            let ikuaiIds = [];
            try {
                await ikuaiApi.addPortForward({ ip, internal_port, external_port, protocol: protocol || 'tcp', comment, enabled: true, interface: ifaceStr });
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
        const { name, ip, internal_port, external_port, protocol } = req.body;

        // L-2🔶 修复：修改 IP 时同步格式校验（与 POST 端点一致）
        if (ip !== undefined && ip !== null) {
            if (!/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip)) {
                return res.status(400).json({ error: '无效的 IP 地址格式' });
            }
        }

        if (external_port) {
            const config = {
                port_range_start: parseInt(await db.config.get('forward:port_range_start')) || 50000,
                port_range_end: parseInt(await db.config.get('forward:port_range_end')) || 60000,
            };
            if (external_port < config.port_range_start || external_port > config.port_range_end) {
                return res.status(400).json({ error: `外网端口必须在 ${config.port_range_start}-${config.port_range_end} 范围内` });
            }
            const conflict = (await db.portForwards.getByExternalPort(external_port)).filter(r => r.id !== id);
            if (conflict.length > 0) return res.status(400).json({ error: '外网端口已被占用，请更换' });
        }
        // 检测端口或 IP 变更，需要同步爱快
        const portChanged = external_port && Number(external_port) !== Number(existing.external_port);
        const ipChanged = ip && ip !== existing.ip;
        const internalChanged = internal_port && Number(internal_port) !== Number(existing.internal_port);
        const needIkuaiSync = ipChanged || portChanged || internalChanged;
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
                // comment 根据 existing.type 区分：general → _GENERAL，lxc → _CT${ct_id}，vm → _VM${vm_id}
                const comment = existing.type === 'general'
                    ? `${name || existing.name || '转发'}_GENERAL`
                    : existing.type === 'lxc'
                        ? `${name || existing.name || '转发'}_CT${existing.ct_id}`
                        : `${name || existing.name || '转发'}_VM${existing.vm_id}`;
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
        if (name !== undefined) updates.name = name;
        if (ip !== undefined) updates.ip = ip;
        if (internal_port !== undefined) updates.internal_port = internal_port;
        if (external_port !== undefined) updates.external_port = external_port;
        if (protocol !== undefined) updates.protocol = protocol;
        if (!needIkuaiSync) updates.sync_status = existing.sync_status;
        else {
            updates.sync_status = newIkuaiIds.length > 0 ? 'synced' : 'failed';
            updates.ikuai_id = stringifyIkuaiIds(newIkuaiIds);
        }
        const updated = await db.portForwards.update(id, updates);
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
            return res.json({ message: '规则已删除' });
        }
        // 正常规则同步删除（多接口）
        try {
            const oldIds = parseIkuaiIds(rule.ikuai_id);
            if (oldIds.length > 0) {
                for (const old of oldIds) {
                    try {
                        if (old.id) await ikuaiApi.deletePortForward(old.id);
                    } catch (e) {
                        console.error(`[端口转发] ikuai 删除 ${old.id} 失败:`, e.message);
                    }
                }
            } else if (ikuaiApi.isConfigured()) {
                // 如果没有 ikuai_id，尝试按端口匹配删除（兼容旧数据）
                const ikuaiRules = await ikuaiApi.getPortForwards();
                const matches = ikuaiRules.filter(r =>
                    String(r.wan_port) === String(rule.external_port) &&
                    String(r.lan_port) === String(rule.internal_port) &&
                    (r.lan_ip || r.lan_addr) === rule.ip
                );
                for (const m of matches) {
                    try { await ikuaiApi.deletePortForward(m.id); } catch (_) {}
                }
            }
        } catch (e) {
            console.error('[端口转发] ikuai 删除失败:', e.message);
        }
        await db.portForwards.delete(id);
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
                    const oldIds = parseIkuaiIds(rule.ikuai_id);
                    for (const old of oldIds) {
                        try {
                            if (old.id) await ikuaiApi.deletePortForward(old.id);
                        } catch (e) {
                            console.error(`[批量删除] ikuai 删除 ${old.id} 失败:`, e.message);
                        }
                    }
                }
                await db.portForwards.delete(id);
                results.success++;
            } catch (e) {
                results.failed++;
            }
        }
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/port-forwards/random-port', authMiddleware, async (req, res) => {
    try {
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
        const available = [];
        for (let p = portRangeStart; p <= portRangeEnd; p++) {
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
