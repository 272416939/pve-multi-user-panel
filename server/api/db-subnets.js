const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 多节点：列表类查询统一 JOIN 带出 pve_node_name / zone_name（对齐 db-vms.js 先例），前端零转换展示
const SUBNET_JOIN = ' LEFT JOIN pve_nodes pn ON s.pve_node_id = pn.id LEFT JOIN zones z ON pn.zone_id = z.id';
const SUBNET_NODE_FIELDS = ', pn.name AS pve_node_name, z.name AS zone_name, z.id AS zone_id';

// 私有网络子网（VLAN + DHCP 服务端台账）
// 一个子网 = 爱快一个 VLAN 接口 + 一个 DHCP 服务端 + 一个 /24 网段
const subnets = {
    getAll: () => queryAll('SELECT s.*' + SUBNET_NODE_FIELDS + ' FROM subnets s' + SUBNET_JOIN + ' ORDER BY s.id DESC'),
    // 管理员视角：全部子网 + 所有者用户名（search 可选：用户名/VLAN名称/VLAN ID/网关 模糊匹配，参数化 LIKE）
    // nodeId 可选作用域：管理端按所属 PVE 节点筛选
    getAllWithOwner: async (search, nodeId) => {
        const base = 'SELECT s.*, u.username' + SUBNET_NODE_FIELDS + ' FROM subnets s LEFT JOIN users u ON s.user_id = u.id' + SUBNET_JOIN;
        const where = [];
        const params = [];
        if (search) {
            const kw = '%' + search + '%';
            where.push('(u.username LIKE ? OR s.vlan_name LIKE ? OR s.vlan_id LIKE ? OR s.gateway LIKE ?)');
            params.push(kw, kw, kw, kw);
        }
        if (nodeId != null) {
            where.push('s.pve_node_id = ?');
            params.push(nodeId);
        }
        const sql = base + (where.length > 0 ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY s.id DESC';
        return queryAll(sql, params);
    },
    // 管理员视角：各子网绑定设备数（一次查询避免 N+1）
    getBoundCounts: async () => {
        const vms = await queryAll('SELECT subnet_id, COUNT(*) AS cnt FROM vms WHERE subnet_id IS NOT NULL GROUP BY subnet_id');
        const cts = await queryAll('SELECT subnet_id, COUNT(*) AS cnt FROM lxc_containers WHERE subnet_id IS NOT NULL GROUP BY subnet_id');
        const vm = {};
        const lxc = {};
        vms.forEach(r => { if (r.subnet_id) vm[r.subnet_id] = r.cnt; });
        cts.forEach(r => { if (r.subnet_id) lxc[r.subnet_id] = r.cnt; });
        return { vm, lxc };
    },
    getByUserId: (userId) => queryAll('SELECT s.*' + SUBNET_NODE_FIELDS + ' FROM subnets s' + SUBNET_JOIN + ' WHERE s.user_id = ? ORDER BY s.id DESC', [parseInt(userId)]),
    getById: (id) => queryOne('SELECT s.*' + SUBNET_NODE_FIELDS + ' FROM subnets s' + SUBNET_JOIN + ' WHERE s.id = ?', [parseInt(id)]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO subnets (user_id, vlan_name, vlan_id, gateway, netmask, addr_pool, interface, available, ikuai_vlan_id, ikuai_dhcp_id, ikuai_node_id, pve_node_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.user_id,
                data.vlan_name,
                data.vlan_id,
                data.gateway,
                data.netmask || '255.255.255.0',
                data.addr_pool,
                data.interface,
                data.available || 0,
                data.ikuai_vlan_id || '',
                data.ikuai_dhcp_id || '',
                data.ikuai_node_id || null,
                data.pve_node_id || null,
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM subnets WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['available', 'ikuai_vlan_id', 'ikuai_dhcp_id', 'ikuai_node_id', 'pve_node_id'];
        for (const key of Object.keys(updates)) {
            if (!allowedColumns.includes(key)) delete updates[key];
        }
        if (Object.keys(updates).length === 0) return;
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        values.push(parseInt(id));
        await execute(`UPDATE subnets SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM subnets WHERE id = ?', [parseInt(id)]);
    },
    delete: (id) => execute('DELETE FROM subnets WHERE id = ?', [parseInt(id)]),
    // 已使用的 vlan_id 列表（创建子网分配 VLAN ID 用）
    // 多节点：传 ikuaiNodeId 时仅统计该爱快节点的子网（不同节点可复用 VLAN ID）
    getUsedVlanIds: async (ikuaiNodeId) => {
        const rows = ikuaiNodeId != null
            ? await queryAll('SELECT vlan_id FROM subnets WHERE ikuai_node_id = ?', [ikuaiNodeId])
            : await queryAll('SELECT vlan_id FROM subnets');
        return rows.map(r => r.vlan_id);
    },
    // 已使用的网关 IP 列表（创建子网分配网段用；节点作用域同上）
    getUsedGateways: async (ikuaiNodeId) => {
        const rows = ikuaiNodeId != null
            ? await queryAll('SELECT gateway FROM subnets WHERE ikuai_node_id = ?', [ikuaiNodeId])
            : await queryAll('SELECT gateway FROM subnets');
        return rows.map(r => r.gateway);
    },
    // 子网下绑定的设备数（删除子网时校验，>0 禁止删除）
    getBoundCount: async (subnetId) => {
        const vm = await queryOne('SELECT COUNT(*) AS cnt FROM vms WHERE subnet_id = ?', [parseInt(subnetId)]);
        const ct = await queryOne('SELECT COUNT(*) AS cnt FROM lxc_containers WHERE subnet_id = ?', [parseInt(subnetId)]);
        return { vm: vm?.cnt || 0, lxc: ct?.cnt || 0 };
    },
    // 绑定到子网的设备清单（子网详情/审计用）
    getBoundDevices: async (subnetId) => {
        const vms = await queryAll('SELECT vm_id FROM vms WHERE subnet_id = ?', [parseInt(subnetId)]);
        const cts = await queryAll('SELECT ct_id FROM lxc_containers WHERE subnet_id = ?', [parseInt(subnetId)]);
        return {
            vms: vms.map(r => r.vm_id),
            lxc: cts.map(r => r.ct_id)
        };
    }
};

module.exports = { subnets };
