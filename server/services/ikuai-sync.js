const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { parseIkuaiIds, deleteIkuaiRuleStrict } = require('./port-forward-sync');
const { auditLog } = require('../utils/audit-log');

async function syncPortForwardsFromIkuai() {
    console.log('[ikuai] 启动同步: 正在从 ikuai 拉取端口映射...');
    try {
        const ikuaiRules = await ikuaiApi.getPortForwards();
        if (!ikuaiRules.length) {
            console.log('[ikuai] 启动同步: ikuai 无规则，跳过');
            return;
        }
        const localRules = await db.portForwards.getAll();
        const localKeys = new Map();
        localRules.forEach(r => {
            const key = `${r.ip}:${r.internal_port}:${r.external_port}:${r.protocol}`;
            localKeys.set(key, r.id);
        });
        const ipToDevice = new Map();
        const allVms = await db.vms.getAll();
        const allCts = await db.lxcContainers.getAll();
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
        // 合并所有设备，分批并行处理，每批 10 个
        const allDevices = [
            ...allVms.map(vm => ({ type: 'vm', device: vm })),
            ...allCts.map(ct => ({ type: 'lxc', device: ct }))
        ];
        const batchSize = 10;
        for (let i = 0; i < allDevices.length; i += batchSize) {
            const batch = allDevices.slice(i, i + batchSize);
            await Promise.all(batch.map(async (item) => {
                try {
                    if (item.type === 'vm') {
                        const vm = item.device;
                        let ip = '';
                        let mac = '';
                        try {
                            const config = await pveApi.getVmConfig(vm.vm_id);
                            const net0 = config?.net0 || '';
                            const macMatch = net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                            if (macMatch) mac = macMatch[0].toLowerCase();
                            ip = findIpByMac(mac);
                        } catch (e) {}
                        if (ip) ipToDevice.set(ip, { type: 'vm', device_id: vm.vm_id, name: vm.name || 'VM ' + vm.vm_id });
                    } else {
                        const ct = item.device;
                        let ip = '';
                        try {
                            const config = await pveApi.getLxcConfig(ct.ct_id);
                            const net0 = config?.net0 || '';
                            const ipMatch = net0.match(/ip=([0-9.]+)/);
                            if (ipMatch) ip = ipMatch[1];
                            if (!ip) {
                                const hwaddrMatch = net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                                if (hwaddrMatch) {
                                    ip = findIpByMac(hwaddrMatch[0].toLowerCase());
                                }
                            }
                        } catch (e) {}
                        if (ip) ipToDevice.set(ip, { type: 'lxc', device_id: ct.ct_id, name: ct.name || 'CT ' + ct.ct_id });
                    }
                } catch (e) {
                    console.error('[ikuai-sync] 设备配置获取失败:', item.device.id || item.device.vm_id || item.device.ct_id, e.message);
                }
            }));
        }
        let reassociated = 0;
        for (const localRule of localRules) {
            if (localRule.vm_id || localRule.ct_id) continue;
            if (localRule.ip && ipToDevice.has(localRule.ip)) {
                const dev = ipToDevice.get(localRule.ip);
                await db.portForwards.update(localRule.id, {
                    type: dev.type,
                    vm_id: dev.type === 'vm' ? dev.device_id : null,
                    ct_id: dev.type === 'lxc' ? dev.device_id : null,
                    name: dev.name || localRule.name
                });
                reassociated++;
            }
        }
        if (reassociated > 0) console.log(`[ikuai] 重新关联 ${reassociated} 条孤立规则`);
        let imported = 0, skipped = 0, cleaned = 0, recovered = 0, orphaned = 0;
        const matchedLocalIds = new Set();
        for (const rule of ikuaiRules) {
            const rIp = rule.lan_ip || rule.lan_addr || '';
            const rPort = rule.lan_port || '';
            const rWan = rule.wan_port || '';
            const rProto = rule.protocol || '';
            const key = `${rIp}:${rPort}:${rWan}:${rProto}`;
            if (localKeys.has(key)) {
                matchedLocalIds.add(localKeys.get(key));
                skipped++;
                continue;
            }
            const comment = rule.comment || rule.remark || '';
            let deviceType = null, deviceId = null, deviceName = '';
            const vmMatch = comment.match(/_VM(\d+)/i);
            const ctMatch = comment.match(/_CT(\d+)/i);
            if (vmMatch) {
                deviceType = 'vm';
                deviceId = parseInt(vmMatch[1]);
                deviceName = comment.split(' - ')[0] || '';
            } else if (ctMatch) {
                deviceType = 'lxc';
                deviceId = parseInt(ctMatch[1]);
                deviceName = comment.split(' - ')[0] || '';
            } else if (rIp && ipToDevice.has(rIp)) {
                const dev = ipToDevice.get(rIp);
                deviceType = dev.type;
                deviceId = dev.device_id;
                deviceName = dev.name;
            }
            try {
                await db.portForwards.create({
                    type: deviceType || 'general',
                    vm_id: deviceType === 'vm' ? deviceId : null,
                    ct_id: deviceType === 'lxc' ? deviceId : null,
                    name: deviceName || comment || `ikuai_${rule.id || ''}`,
                    ip: rIp,
                    internal_port: parseInt(rPort),
                    external_port: parseInt(rWan),
                    protocol: rProto,
                    enabled: rule.enabled === 'yes' || rule.enabled === '1' || rule.enabled === 1 ? 1 : 0,
                    source: 'ikuai_sync',
                    sync_status: 'synced',
                    ikuai_id: JSON.stringify([{ interface: rule.interface || '', id: String(rule.id || rule._id || '') }])
                });
                imported++;
            } catch (e) {
                console.error('[端口转发] 导入规则失败:', e.message);
            }
        }
        // 判断本地规则是否仍存在于爱快（ikuai_id 精确匹配优先，端口 key 兜底）
        const ikuaiIdSet = new Set(ikuaiRules.map(r => String(r.id || r._id || '')));
        function ikuaiRuleExists(r) {
            const ids = parseIkuaiIds(r.ikuai_id);
            if (ids.some(o => o.id && ikuaiIdSet.has(String(o.id)))) return true;
            return ikuaiRules.some(x =>
                String(x.lan_ip || x.lan_addr || '') === String(r.ip) &&
                String(x.lan_port || '') === String(r.internal_port) &&
                String(x.wan_port || '') === String(r.external_port) &&
                String(x.protocol || '').toLowerCase() === String(r.protocol || '').toLowerCase()
            );
        }
        // 中断删除收敛：删除流程加了 deleting 标记后服务重启（爱快已删、DB 未删）的残留记录
        for (const r of localRules) {
            if (r.sync_status !== 'deleting') continue;
            if (!ikuaiRuleExists(r)) {
                // 爱快已无此规则 → 删除意图已完成，收敛物理删除
                await db.portForwards.delete(r.id);
                await auditLog({ userId: 0, username: 'system', action: 'network.port.delete', resourceType: 'port-forward', resourceId: r.id, details: `对账收敛删除中断的端口转发规则[${r.internal_port}]→[${r.external_port}]` });
                cleaned++;
                continue;
            }
            // 爱快仍有 → 重试删除一次；失败回滚为 synced 并显式告警（不静默、不伪造删除）
            try {
                const retry = await deleteIkuaiRuleStrict(r);
                if (retry.deleted) {
                    await db.portForwards.delete(r.id);
                    await auditLog({ userId: 0, username: 'system', action: 'network.port.delete', resourceType: 'port-forward', resourceId: r.id, details: `对账重试删除中断的端口转发规则[${r.internal_port}]→[${r.external_port}]` });
                    cleaned++;
                } else {
                    await db.portForwards.update(r.id, { sync_status: 'synced' });
                    recovered++;
                    console.warn(`[ikuai] 中断删除规则 ${r.id} 重试失败(${retry.error})，已回滚为 synced，请人工检查`);
                }
            } catch (e) {
                await db.portForwards.update(r.id, { sync_status: 'synced' });
                recovered++;
                console.warn(`[ikuai] 中断删除规则 ${r.id} 重试异常(${e.message})，已回滚为 synced`);
            }
        }
        // 孤儿清理：DB 有、爱快确认无的 synced/orphan 记录直接物理删除（爱快侧已无规则，删除安全）
        // pending/failed（创建中间态）不自动清理，保留给用户处理
        for (const r of localRules) {
            if (matchedLocalIds.has(r.id)) continue;
            if (r.sync_status !== 'synced' && r.sync_status !== 'orphan') continue;
            await db.portForwards.delete(r.id);
            await auditLog({ userId: 0, username: 'system', action: 'network.port.delete', resourceType: 'port-forward', resourceId: r.id, details: `对账清理孤儿端口转发规则[${r.internal_port}]→[${r.external_port}]（爱快侧已无此规则）` });
            orphaned++;
        }
        console.log(`[ikuai] 启动同步: ikuai=${ikuaiRules.length}条, 本地=${localRules.length}条, 导入=${imported}, 跳过=${skipped}, 收敛中断删除=${cleaned}${recovered ? `(回滚${recovered})` : ''}, 清理孤儿=${orphaned}`);
    } catch (e) {
        console.error('[ikuai] 启动同步失败:', e.message);
    }
}

module.exports = { syncPortForwardsFromIkuai };
