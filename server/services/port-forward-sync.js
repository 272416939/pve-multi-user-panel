const db = require('../api/db');
// 多节点：按规则/设备的归属爱快节点取客户端（工厂缓存复用；null=默认节点兜底）
const { getIkuaiClient } = require('../api/ikuai-clients');
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

// 多节点：按规则行的归属爱快节点解析客户端（rule 为 null/缺 ikuai_node_id 时回退默认节点）
async function getRuleIkuaiClient(rule) {
    const nodeId = rule && rule.ikuai_node_id != null ? rule.ikuai_node_id : null;
    return getIkuaiClient(nodeId);
}

// 删除爱快侧一条规则的旧配置（按 ikuai_id 优先；无 id 时按 端口+旧IP 匹配删除）
async function deleteIkuaiRule(rule) {
    const ik = await getRuleIkuaiClient(rule);
    const oldIds = parseIkuaiIds(rule.ikuai_id);
    if (oldIds.length > 0) {
        for (const old of oldIds) {
            try {
                if (old.id) await ik.deletePortForward(old.id);
            } catch (e) {
                console.error(`[port-forward-sync] ikuai 删除旧规则 ${old.id} 失败:`, e.message);
            }
        }
        return;
    }
    if (!ik.isConfigured()) return;
    const ikuaiRules = await ik.getPortForwards();
    const matches = ikuaiRules.filter(r =>
        String(r.wan_port) === String(rule.external_port) &&
        String(r.lan_port) === String(rule.internal_port) &&
        (r.lan_ip || r.lan_addr) === rule.ip
    );
    for (const m of matches) {
        try { await ik.deletePortForward(m.id); } catch (_) {}
    }
}

// 严格删除爱快侧规则（删除端点用，区别于 deleteIkuaiRule 的尽力而为）：
// - 任一步删除报错 → 回查爱快全量列表核对目标是否实际已删（幂等，防重试死循环：
//   爱快已删成但响应异常时，重试会报"规则不存在"，回查后视为已删除）
// - 返回 { deleted: true } 表示爱快侧已无目标规则（含未配置/无匹配），可继续删 DB；
//   返回 { deleted: false, error } 表示删除失败，调用方不得删 DB
async function deleteIkuaiRuleStrict(rule) {
    const ik = await getRuleIkuaiClient(rule);
    if (!ik.isConfigured()) return { deleted: true }; // 未配置：无爱快侧可删
    const oldIds = parseIkuaiIds(rule.ikuai_id);
    let failed = null;
    if (oldIds.length > 0) {
        for (const old of oldIds) {
            if (!old.id) continue;
            try {
                await ik.deletePortForward(old.id);
            } catch (e) {
                failed = e.message;
            }
        }
    } else {
        // 无 ikuai_id：按 端口+IP 匹配删除（兼容旧数据，尽力而为）
        let ikuaiRules;
        try {
            ikuaiRules = await ik.getPortForwards();
        } catch (e) {
            return { deleted: false, error: e.message };
        }
        const matches = ikuaiRules.filter(r =>
            String(r.wan_port) === String(rule.external_port) &&
            String(r.lan_port) === String(rule.internal_port) &&
            (r.lan_ip || r.lan_addr) === rule.ip
        );
        for (const m of matches) {
            try { await ik.deletePortForward(m.id); } catch (_) {}
        }
    }
    if (failed) {
        // 删除报错后回查爱快列表：目标规则已不在则视为删除成功
        try {
            const ikuaiRules = await ik.getPortForwards();
            const idSet = new Set(ikuaiRules.map(r => String(r.id || r._id || '')));
            // 全部目标 id 均已不在爱快 → 视为已删除
            const allGone = oldIds.length > 0 && oldIds.every(o => !o.id || !idSet.has(String(o.id)));
            const keyGone = !ikuaiRules.some(r =>
                String(r.wan_port) === String(rule.external_port) &&
                String(r.lan_port) === String(rule.internal_port) &&
                (r.lan_ip || r.lan_addr) === rule.ip
            );
            if (allGone || keyGone) return { deleted: true };
        } catch (_) {}
        return { deleted: false, error: failed };
    }
    return { deleted: true };
}

// 设备 IP 变化后，重建其全部端口转发规则（爱快删旧建新 + DB 回写新 IP）
// 绑定子网 / 开机兜底重绑时调用；解绑不删规则（重绑时自动更新闭环）
// 多节点：pveNodeId 已知时必须传入（调用方多已持有设备行），跨节点同 vmid 才不会串改
// 返回成功处理的规则条数（失败不影响其他规则与主流程）
async function rebuildPortForwardsForDevice(type, vmid, newIp, pveNodeId) {
    // 多节点：先查设备行得归属 PVE 节点 → 配对爱快节点（查不到行/未配对回退默认爱快）
    let devNode = pveNodeId != null ? pveNodeId : null;
    if (devNode == null) {
        try {
            const devRow = type === 'vm'
                ? await db.vms.getByVmid(vmid)
                : (await db.lxcContainers.getByCtId(vmid))[0];
            devNode = devRow ? devRow.pve_node_id : null;
        } catch (_) {}
    }
    let ikNodeId = null;
    if (devNode != null) {
        const pn = await db.pveNodes.get(devNode);
        ikNodeId = pn ? pn.ikuai_node_id : null;
    }
    const ik = await getIkuaiClient(ikNodeId);
    if (!newIp || !ik.isConfigured()) return 0;
    let rules = [];
    try {
        rules = type === 'vm'
            ? await db.portForwards.getByVmId(vmid, devNode)
            : await db.portForwards.getByCtId(vmid, devNode);
    } catch (e) {
        console.error('[port-forward-sync] 查询设备转发规则失败:', e.message);
        return 0;
    }
    if (rules.length === 0) return 0;

    let rebuilt = 0;
    for (const rule of rules) {
        try {
            // 1. 删除爱快旧规则（按 ikuai_id / 端口+旧IP 匹配，按规则自身归属节点路由）
            await deleteIkuaiRule(rule);
            // 2. 用新 IP 重建（WAN 接口按配对爱快节点作用域读取）
            const wanIfaces = await getWanInterfaces({ ikuaiNodeId: ikNodeId });
            const comment = (rule.name || '转发') + (type === 'lxc' ? '_CT' + vmid : '_VM' + vmid);
            const ifaceStr = wanIfaces.join(',');
            let newIkuaiIds = [];
            let syncStatus = 'failed';
            try {
                await ik.addPortForward({
                    ip: newIp,
                    internal_port: rule.internal_port,
                    external_port: rule.external_port,
                    protocol: rule.protocol || 'tcp',
                    comment,
                    enabled: true,
                    interface: ifaceStr
                });
                // 爱快 add 不返回 ID，从规则列表反查
                const ikuaiRules = await ik.getPortForwards();
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
            // 3. DB 回写新 IP 与同步状态（节点归属一并落库，保持规则与设备配对一致）
            await db.portForwards.update(rule.id, {
                ip: newIp,
                ikuai_id: stringifyIkuaiIds(newIkuaiIds),
                sync_status: syncStatus,
                ikuai_node_id: ikNodeId,
                pve_node_id: devNode
            });
            rebuilt++;
            console.log(`[port-forward-sync] 规则 ${rule.id} IP ${rule.ip} → ${newIp}（${syncStatus}）`);
        } catch (e) {
            console.error(`[port-forward-sync] 处理规则 ${rule.id} 失败:`, e.message);
        }
    }
    return rebuilt;
}

module.exports = { parseIkuaiIds, stringifyIkuaiIds, deleteIkuaiRuleStrict, rebuildPortForwardsForDevice };
