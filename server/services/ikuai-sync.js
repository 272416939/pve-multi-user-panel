const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');

async function syncPortForwardsFromIkuai() {
    console.log('[ikuai] 启动同步: 正在从 ikuai 拉取端口映射...');
    try {
        const ikuaiRules = await ikuaiApi.getPortForwards();
        if (!ikuaiRules.length) {
            console.log('[ikuai] 启动同步: ikuai 无规则，跳过');
            return;
        }
        const localRules = db.portForwards.getAll();
        const localKeys = new Map();
        localRules.forEach(r => {
            const key = `${r.ip}:${r.internal_port}:${r.external_port}:${r.protocol}`;
            localKeys.set(key, r.id);
        });
        const ipToDevice = new Map();
        const allVms = db.vms.getAll();
        const allCts = db.lxcContainers.getAll();
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
        for (const vm of allVms) {
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
        }
        for (const ct of allCts) {
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
        let reassociated = 0;
        for (const localRule of localRules) {
            if (localRule.vm_id || localRule.ct_id) continue;
            if (localRule.ip && ipToDevice.has(localRule.ip)) {
                const dev = ipToDevice.get(localRule.ip);
                db.portForwards.update(localRule.id, {
                    type: dev.type,
                    vm_id: dev.type === 'vm' ? dev.device_id : null,
                    ct_id: dev.type === 'lxc' ? dev.device_id : null,
                    name: dev.name || localRule.name
                });
                reassociated++;
            }
        }
        if (reassociated > 0) console.log(`[ikuai] 重新关联 ${reassociated} 条孤立规则`);
        let imported = 0, skipped = 0, orphaned = 0;
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
                db.portForwards.create({
                    type: deviceType || 'vm',
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
                    ikuai_id: String(rule.id || rule._id || '')
                });
                imported++;
            } catch (e) {
                console.error('[端口转发] 导入规则失败:', e.message);
            }
        }
        for (const r of localRules) {
            if (!matchedLocalIds.has(r.id)) {
                db.portForwards.update(r.id, { sync_status: 'orphan' });
                orphaned++;
            }
        }
        console.log(`[ikuai] 启动同步: ikuai=${ikuaiRules.length}条, 本地=${localRules.length}条, 导入=${imported}, 跳过=${skipped}, 标记孤立=${orphaned}`);
    } catch (e) {
        console.error('[ikuai] 启动同步失败:', e.message);
    }
}

module.exports = { syncPortForwardsFromIkuai };
