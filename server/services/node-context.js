// server/services/node-context.js - 多节点上下文解析（资产行 → 节点/可用区/配对爱快配置）
const db = require('../api/db');

/**
 * 按资产行集合解析「pve_node_id → 该节点配对爱快的 CNAME 后缀」映射。
 * 多节点下不同爱快可配不同的 cname:domain，旧实现只读默认节点作用域导致他区资产后缀错误。
 * 未配对爱快/解析失败的行回退默认爱快节点作用域（与 getIkuaiSetting 回退链一致）。
 * @param {Array<{pve_node_id?: number|null}>} rows - 资产行（vms/lxc_containers 等）
 * @returns {Promise<Object>} { [pveNodeId]: string }
 */
async function buildCnameByPveMap(rows) {
    const map = {};
    const pveIds = [...new Set((rows || []).map(r => r.pve_node_id).filter(id => id != null))];
    for (const pid of pveIds) {
        try {
            const pn = await db.pveNodes.get(pid);
            const ikId = pn && pn.ikuai_node_id != null ? pn.ikuai_node_id : null;
            map[pid] = await db.config.getIkuaiSetting('cname:domain', ikId) || '';
        } catch (_) {
            map[pid] = '';
        }
    }
    return map;
}

/**
 * 解析 PVE 节点的可用区名（日志/审计/通知等文案的节点消歧用）。
 * 无可用区时回退节点名；解析失败返回 ''（调用方自行兜底占位）。
 * @param {number|null} pveNodeId
 * @returns {Promise<string>}
 */
async function getZoneLabelByPve(pveNodeId) {
    if (pveNodeId == null) return '';
    try {
        const pn = await db.pveNodes.get(pveNodeId);
        if (!pn) return '';
        if (pn.zone_id != null) {
            const z = await db.zones.get(pn.zone_id);
            if (z && z.name) return z.name;
        }
        return pn.name || '';
    } catch (_) {
        return '';
    }
}

/**
 * 给订单行批量附加 zone_label（订单/流水页的 vmid 跨节点歧义消解）：
 * vm/lxc 订单经套餐→节点→可用区精确解析；disk 订单经磁盘台账解析。
 * @param {Array<Object>} rows - orders 行
 * @returns {Promise<Array<Object>>}
 */
async function attachOrderZoneLabels(rows) {
    for (const o of (rows || [])) {
        try {
            if ((o.type === 'vm' || o.type === 'lxc') && o.package_id) {
                const pkg = o.type === 'vm' ? await db.vmPackages.getById(o.package_id) : await db.lxcPackages.getById(o.package_id);
                o.zone_label = pkg ? await getZoneLabelByPve(pkg.pve_node_id) : '';
            } else if (o.type === 'disk' && o.resource_id) {
                const d = await db.disks.getById(parseInt(o.resource_id));
                o.zone_label = d ? await getZoneLabelByPve(d.pve_node_id) : '';
            } else {
                o.zone_label = '';
            }
        } catch (_) {
            o.zone_label = '';
        }
    }
    return rows;
}

/**
 * 资产节点的邮件/站内信变量：{ zone_name, pve_node_name }（未解析出时为空串，渲染端整行折叠）
 * @param {number|null} pveNodeId
 * @returns {Promise<{zone_name: string, pve_node_name: string}>}
 */
async function assetNodeVars(pveNodeId) {
    if (pveNodeId == null) return { zone_name: '', pve_node_name: '' };
    try {
        const pn = await db.pveNodes.get(pveNodeId);
        if (!pn) return { zone_name: '', pve_node_name: '' };
        let zone = '';
        if (pn.zone_id != null) {
            const z = await db.zones.get(pn.zone_id);
            zone = z ? z.name : '';
        }
        return { zone_name: zone || pn.name || '', pve_node_name: pn.name || '' };
    } catch (_) {
        return { zone_name: '', pve_node_name: '' };
    }
}

module.exports = { buildCnameByPveMap, getZoneLabelByPve, attachOrderZoneLabels, assetNodeVars };
