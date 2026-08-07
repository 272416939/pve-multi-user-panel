const db = require('../api/db');
const ikuaiApi = require('../api/ikuai-api');
const { getWanInterfaces } = require('./dhcp');

// 解析 ikuai_id 字段，兼容旧格式（纯字符串）和新格式（JSON 数组）
// 返回 [{interface, id}] 数组（单一来源：routes/network.js 复用本定义）
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

// 序列化 ikuai_id 数组为 JSON 字符串（单一来源）
function stringifyIkuaiIds(arr) {
    return JSON.stringify(arr || []);
}

// 删除爱快侧一条规则的旧配置（按 ikuai_id 优先；无 id 时按 端口+旧IP 匹配删除）
async function deleteIkuaiRule(rule) {
    const oldIds = parseIkuaiIds(rule.ikuai_id);
    if (oldIds.length > 0) {
        for (const old of oldIds) {
            try {
                if (old.id) await ikuaiApi.deletePortForward(old.id);
            } catch (e) {
                console.error(`[port-forward-sync] ikuai 删除旧规则 ${old.id} 失败:`, e.message);
            }
        }
        return;
    }
    if (!ikuaiApi.isConfigured()) return;
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

// 设备 IP 变化后，重建其全部端口转发规则（爱快删旧建新 + DB 回写新 IP）
// 绑定子网 / 开机兜底重绑时调用；解绑不删规则（重绑时自动更新闭环）
// 返回成功处理的规则条数（失败不影响其他规则与主流程）
async function rebuildPortForwardsForDevice(type, vmid, newIp) {
    if (!newIp || !ikuaiApi.isConfigured()) return 0;
    let rules = [];
    try {
        rules = type === 'vm' ? await db.portForwards.getByVmId(vmid) : await db.portForwards.getByCtId(vmid);
    } catch (e) {
        console.error('[port-forward-sync] 查询设备转发规则失败:', e.message);
        return 0;
    }
    if (rules.length === 0) return 0;

    let rebuilt = 0;
    for (const rule of rules) {
        try {
            // 1. 删除爱快旧规则（按 ikuai_id / 端口+旧IP 匹配）
            await deleteIkuaiRule(rule);
            // 2. 用新 IP 重建
            const wanIfaces = await getWanInterfaces();
            const comment = (rule.name || '转发') + (type === 'lxc' ? '_CT' + vmid : '_VM' + vmid);
            const ifaceStr = wanIfaces.join(',');
            let newIkuaiIds = [];
            let syncStatus = 'failed';
            try {
                await ikuaiApi.addPortForward({
                    ip: newIp,
                    internal_port: rule.internal_port,
                    external_port: rule.external_port,
                    protocol: rule.protocol || 'tcp',
                    comment,
                    enabled: true,
                    interface: ifaceStr
                });
                // 爱快 add 不返回 ID，从规则列表反查
                const ikuaiRules = await ikuaiApi.getPortForwards();
                const match = ikuaiRules.find(r =>
                    String(r.wan_port) === String(rule.external_port) &&
                    String(r.lan_port) === String(rule.internal_port) &&
                    (r.lan_ip || r.lan_addr) === newIp
                );
                if (match) newIkuaiIds.push({ interface: ifaceStr, id: String(match.id) });
                syncStatus = newIkuaiIds.length > 0 ? 'synced' : 'failed';
            } catch (e) {
                console.error(`[port-forward-sync] 重建规则 ${rule.id} 到接口 ${ifaceStr} 失败:`, e.message);
            }
            // 3. DB 回写新 IP 与同步状态
            await db.portForwards.update(rule.id, {
                ip: newIp,
                ikuai_id: stringifyIkuaiIds(newIkuaiIds),
                sync_status: syncStatus
            });
            rebuilt++;
            console.log(`[port-forward-sync] 规则 ${rule.id} IP ${rule.ip} → ${newIp}（${syncStatus}）`);
        } catch (e) {
            console.error(`[port-forward-sync] 处理规则 ${rule.id} 失败:`, e.message);
        }
    }
    return rebuilt;
}

module.exports = { parseIkuaiIds, stringifyIkuaiIds, rebuildPortForwardsForDevice };
