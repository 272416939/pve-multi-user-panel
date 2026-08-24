const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 端口转发操作
const portForwards = {
    getAll: () => queryAll('SELECT * FROM port_forwards ORDER BY created_at DESC'),
    getByType: (type) => queryAll(
        'SELECT * FROM port_forwards WHERE type = ? ORDER BY created_at DESC',
        [type]
    ),
    getById: (id) => queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]),
    getByUserId: async (userId) => {
        const userVms = await queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
        const userCts = await queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
        const vmIds = userVms.map(v => v.vm_id);
        const ctIds = userCts.map(c => c.ct_id);
        let rules = [];
        if (vmIds.length > 0) {
            const placeholders = vmIds.map(() => '?').join(',');
            rules = rules.concat(await queryAll(
                `SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                vmIds
            ));
        }
        if (ctIds.length > 0) {
            const placeholders = ctIds.map(() => '?').join(',');
            rules = rules.concat(await queryAll(
                `SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                ctIds
            ));
        }
        return rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    },
    getByVmId: (vmId) => queryAll(
        "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
        [vmId]
    ),
    getByCtId: (ctId) => queryAll(
        "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
        [ctId]
    ),
    getByDeviceId: (type, deviceId) => {
        if (type === 'vm') return queryAll(
            "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
            [deviceId]
        );
        return queryAll(
            "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
            [deviceId]
        );
    },
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
            `INSERT INTO port_forwards (type, vm_id, ct_id, name, ip, mac, internal_port, external_port, protocol, enabled, source, sync_status, ikuai_id, ikuai_node_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                mysqlNow(),
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM port_forwards WHERE id = ?', [result.insertId]);
    },
    update: async (id, data) => {
        const allowedColumns = ['name', 'type', 'vm_id', 'ct_id', 'ip', 'mac', 'internal_port', 'external_port', 'protocol', 'enabled', 'source', 'sync_status', 'ikuai_id', 'ikuai_node_id'];
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
    // 按 VMID 更新 MAC 地址（系统切换时使用）
    updateMacByVmid: (vmid, newMac) => execute(
        "UPDATE port_forwards SET mac = ? WHERE type = 'vm' AND vm_id = ?",
        [newMac, parseInt(vmid)]
    ),
    deleteByDevice: (type, deviceId) => {
        if (type === 'vm') return execute(
            "DELETE FROM port_forwards WHERE type = 'vm' AND vm_id = ?",
            [deviceId]
        );
        return execute(
            "DELETE FROM port_forwards WHERE type = 'lxc' AND ct_id = ?",
            [deviceId]
        );
    },
    getUsedPorts: () => {
        return queryAll(
            'SELECT external_port, type, vm_id, ct_id, ip, internal_port, protocol FROM port_forwards'
        );
    },
    getByExternalPort: (port) => queryAll(
        'SELECT * FROM port_forwards WHERE external_port = ?',
        [port]
    ),
};

module.exports = { portForwards };
