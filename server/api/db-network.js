const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 多节点：列表类查询统一 JOIN 带出 pve_node_name / zone_name / ikuai_node_name（对齐 db-vms.js 先例），前端零转换展示
const PF_SELECT = 'SELECT pf.*, pn.name AS pve_node_name, z.name AS zone_name, z.id AS zone_id, ik.name AS ikuai_node_name FROM port_forwards pf ' +
    'LEFT JOIN pve_nodes pn ON pf.pve_node_id = pn.id ' +
    'LEFT JOIN zones z ON pn.zone_id = z.id ' +
    'LEFT JOIN ikuai_nodes ik ON pf.ikuai_node_id = ik.id';

// 端口转发操作
const portForwards = {
    getAll: () => queryAll(PF_SELECT + ' ORDER BY pf.created_at DESC'),
    getByType: (type) => queryAll(
        PF_SELECT + ' WHERE pf.type = ? ORDER BY pf.created_at DESC',
        [type]
    ),
    getById: (id) => queryOne(PF_SELECT + ' WHERE pf.id = ?', [id]),
    getByUserId: async (userId) => {
        const userVms = await queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
        const userCts = await queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
        const vmIds = userVms.map(v => v.vm_id);
        const ctIds = userCts.map(c => c.ct_id);
        let rules = [];
        if (vmIds.length > 0) {
            const placeholders = vmIds.map(() => '?').join(',');
            rules = rules.concat(await queryAll(
                PF_SELECT + ` WHERE pf.type = 'vm' AND pf.vm_id IN (${placeholders})`,
                vmIds
            ));
        }
        if (ctIds.length > 0) {
            const placeholders = ctIds.map(() => '?').join(',');
            rules = rules.concat(await queryAll(
                PF_SELECT + ` WHERE pf.type = 'lxc' AND pf.ct_id IN (${placeholders})`,
                ctIds
            ));
        }
        return rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    // nodeId 可选作用域：多节点后 vmid/ctid 不再全局唯一，已知节点时必须带第二参数
    getByVmId: (vmId, nodeId) => (nodeId != null
        ? queryAll(PF_SELECT + " WHERE pf.type = 'vm' AND pf.vm_id = ? AND pf.pve_node_id = ? ORDER BY pf.created_at DESC", [vmId, nodeId])
        : queryAll(PF_SELECT + " WHERE pf.type = 'vm' AND pf.vm_id = ? ORDER BY pf.created_at DESC", [vmId])),
    getByCtId: (ctId, nodeId) => (nodeId != null
        ? queryAll(PF_SELECT + " WHERE pf.type = 'lxc' AND pf.ct_id = ? AND pf.pve_node_id = ? ORDER BY pf.created_at DESC", [ctId, nodeId])
        : queryAll(PF_SELECT + " WHERE pf.type = 'lxc' AND pf.ct_id = ? ORDER BY pf.created_at DESC", [ctId])),
    getByDeviceId: (type, deviceId, nodeId) => (type === 'vm'
        ? portForwards.getByVmId(deviceId, nodeId)
        : portForwards.getByCtId(deviceId, nodeId)),

    getCountByUserId: async (userId) => {
        const userVms = await queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
        const userCts = await queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
        const vmIds = userVms.map(v => v.vm_id);
        const ctIds = userCts.map(c => c.ct_id);
        let count = 0;
        if (vmIds.length > 0) {
            const placeholders = vmIds.map(() => '?').join(',');
            const r = await queryOne(
                `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                vmIds
            );
            count += r?.c || 0;
        }
        if (ctIds.length > 0) {
            const placeholders = ctIds.map(() => '?').join(',');
            const r = await queryOne(
                `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                ctIds
            );
            count += r?.c || 0;
        }
        return count;
    },
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO port_forwards (type, vm_id, ct_id, name, ip, mac, internal_port, external_port, protocol, enabled, source, sync_status, ikuai_id, ikuai_node_id, pve_node_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.type,
                data.vm_id || null,
                data.ct_id || null,
                data.name || '',
                data.ip,
                data.mac || '',
                data.internal_port,
                data.external_port,
                data.protocol || 'tcp',
                data.enabled !== undefined ? data.enabled : 1,
                data.source || 'panel',
                data.sync_status || 'pending',
                data.ikuai_id || '',
                data.ikuai_node_id || null,
                data.pve_node_id || null,
                mysqlNow(),
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM port_forwards WHERE id = ?', [result.insertId]);
    },
    update: async (id, data) => {
        const allowedColumns = ['name', 'type', 'vm_id', 'ct_id', 'ip', 'mac', 'internal_port', 'external_port', 'protocol', 'enabled', 'source', 'sync_status', 'ikuai_id', 'ikuai_node_id', 'pve_node_id'];
        for (const key of Object.keys(data)) {
            if (!allowedColumns.includes(key)) {
                delete data[key];
            }
        }
        if (Object.keys(data).length === 0) return;
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            fields.push(`${key} = ?`);
            values.push(value);
        }
        values.push(mysqlNow(), id);
        await execute(`UPDATE port_forwards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, values);
        return queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM port_forwards WHERE id = ?', [id]),
    // 按 VMID 更新 MAC 地址（系统切换时使用；nodeId 可选作用域，跨节点同 vmid 不串写）
    updateMacByVmid: (vmid, newMac, nodeId) => (nodeId != null
        ? execute("UPDATE port_forwards SET mac = ? WHERE type = 'vm' AND vm_id = ? AND pve_node_id = ?", [newMac, parseInt(vmid), nodeId])
        : execute("UPDATE port_forwards SET mac = ? WHERE type = 'vm' AND vm_id = ?", [newMac, parseInt(vmid)])),
    // nodeId 可选作用域：删设备规则时必须带节点，否则会连带删掉其他节点同号设备的规则
    deleteByDevice: (type, deviceId, nodeId) => {
        const col = type === 'vm' ? 'vm_id' : 'ct_id';
        const t = type === 'vm' ? 'vm' : 'lxc';
        if (nodeId != null) {
            return execute(
                `DELETE FROM port_forwards WHERE type = ? AND ${col} = ? AND pve_node_id = ?`,
                [t, deviceId, nodeId]
            );
        }
        return execute(`DELETE FROM port_forwards WHERE type = ? AND ${col} = ?`, [t, deviceId]);
    },
    // 随机端口分配用：必须带出 ikuai_node_id，否则调用方的节点作用域过滤会退化为全局占用
    getUsedPorts: () => {
        return queryAll(
            'SELECT external_port, type, vm_id, ct_id, ip, internal_port, protocol, ikuai_node_id, pve_node_id FROM port_forwards'
        );
    },
    // ikuaiNodeId 可选作用域：不同爱快节点各有独立 WAN，同一外网端口可复用，唯一性只在节点内成立
    getByExternalPort: (port, ikuaiNodeId) => (ikuaiNodeId != null
        ? queryAll(
            'SELECT * FROM port_forwards WHERE external_port = ? AND (ikuai_node_id = ? OR ikuai_node_id IS NULL)',
            [port, ikuaiNodeId]
        )
        : queryAll('SELECT * FROM port_forwards WHERE external_port = ?', [port])),
};

module.exports = { portForwards };
