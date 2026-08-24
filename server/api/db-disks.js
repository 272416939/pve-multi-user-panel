const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 存储分组
const storageGroups = {
    getAll: () => queryAll('SELECT * FROM storage_groups ORDER BY sort_order ASC, id ASC'),
    getById: (id) => queryOne('SELECT * FROM storage_groups WHERE id = ?', [parseInt(id)]),
    create: async (data) => {
        const [result] = await execute(
            'INSERT INTO storage_groups (name, sort_order) VALUES (?, ?)',
            [data.name || '', parseInt(data.sort_order) || 0]
        );
        return queryOne('SELECT * FROM storage_groups WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'sort_order'];
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
        fields.push('updated_at = ?');
        values.push(mysqlNow());
        values.push(parseInt(id));
        await execute(`UPDATE storage_groups SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM storage_groups WHERE id = ?', [parseInt(id)]);
    },
    delete: (id) => execute('DELETE FROM storage_groups WHERE id = ?', [parseInt(id)]),
    countDisksByGroup: (groupId) => queryOne('SELECT COUNT(*) AS cnt FROM disks WHERE storage_group_id = ? AND status != ?', [parseInt(groupId), 'destroyed'])
};

// 硬盘规格
const diskSpecs = {
    getAll: () => queryAll('SELECT ds.*, sg.name AS group_name FROM disk_specs ds LEFT JOIN storage_groups sg ON ds.storage_group_id = sg.id ORDER BY sg.sort_order, ds.id'),
    getById: (id) => queryOne('SELECT * FROM disk_specs WHERE id = ?', [parseInt(id)]),
    getByGroup: (groupId) => queryAll('SELECT * FROM disk_specs WHERE storage_group_id = ? AND enabled = 1 ORDER BY id', [parseInt(groupId)]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO disk_specs (name, disk_type, storage_group_id, enabled, min_size_gb, max_size_gb, price_per_gb, quarterly_discount, yearly_discount, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max, storage_pool, disk_format, description, pve_node_id)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [data.name || '', data.disk_type, parseInt(data.storage_group_id), data.enabled ? 1 : 0, parseInt(data.min_size_gb) || 10, parseInt(data.max_size_gb) || 2000, parseFloat(data.price_per_gb) || 0, parseInt(data.quarterly_discount) || 0, parseInt(data.yearly_discount) || 0, data.mbps_rd || null, data.mbps_rd_max || null, data.mbps_wr || null, data.mbps_wr_max || null, data.iops_rd || null, data.iops_rd_max || null, data.iops_wr || null, data.iops_wr_max || null, data.storage_pool || '', data.disk_format || null, data.description || null, data.pve_node_id || null]
        );
        return queryOne('SELECT * FROM disk_specs WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'disk_type', 'storage_group_id', 'enabled', 'min_size_gb', 'max_size_gb', 'price_per_gb', 'quarterly_discount', 'yearly_discount', 'mbps_rd', 'mbps_rd_max', 'mbps_wr', 'mbps_wr_max', 'iops_rd', 'iops_rd_max', 'iops_wr', 'iops_wr_max', 'storage_pool', 'disk_format', 'description', 'pve_node_id'];
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
        fields.push('updated_at = ?');
        values.push(mysqlNow());
        values.push(parseInt(id));
        await execute(`UPDATE disk_specs SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM disk_specs WHERE id = ?', [parseInt(id)]);
    },
    delete: (id) => execute('DELETE FROM disk_specs WHERE id = ?', [parseInt(id)]),
    countDisksBySpec: (specId) => queryOne('SELECT COUNT(*) AS cnt FROM disks WHERE spec_id = ? AND status != ?', [parseInt(specId), 'destroyed'])
};

// 磁盘资产台账
const disks = {
    getById: (id) => queryOne('SELECT * FROM disks WHERE id = ?', [parseInt(id)]),
    getByUserId: (userId) => queryAll('SELECT d.*, u.username, sg.name AS group_name, ds.name AS spec_name FROM disks d LEFT JOIN users u ON d.user_id = u.id LEFT JOIN storage_groups sg ON d.storage_group_id = sg.id LEFT JOIN disk_specs ds ON d.spec_id = ds.id WHERE d.user_id = ? ORDER BY d.id DESC', [parseInt(userId)]),
    getAll: () => queryAll('SELECT d.*, u.username, sg.name AS group_name, ds.name AS spec_name FROM disks d LEFT JOIN users u ON d.user_id = u.id LEFT JOIN storage_groups sg ON d.storage_group_id = sg.id LEFT JOIN disk_specs ds ON d.spec_id = ds.id ORDER BY d.id DESC'),
    getByVolumeId: (volId) => queryOne('SELECT * FROM disks WHERE volume_id = ?', [volId]),
    // 查询绑定到指定 VMID 的所有磁盘
    getByBindVmid: (vmid) => queryAll('SELECT * FROM disks WHERE bind_vmid = ?', [parseInt(vmid)]),
    // 查询该 volume_id 是否被任何非 destroyed 的 disk 记录引用（用于跨 VM 归属校验）
    existsActiveByVolumeId: (volId) => queryOne("SELECT id FROM disks WHERE volume_id = ? AND status != 'destroyed' LIMIT 1", [volId]),
    // 删除绑定到指定 VMID 的 legacy 磁盘记录（不操作 PVE，VM 移除/销毁时调用）
    deleteByBindVmid: (vmid) => execute('DELETE FROM disks WHERE bind_vmid = ? AND is_legacy = 1', [parseInt(vmid)]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO disks (volume_id, disk_name, spec_id, user_id, storage_group_id, storage_pool, disk_type, disk_format, capacity_gb, status, price_per_gb, quarterly_discount, yearly_discount, auto_renew, is_legacy, expire_time, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [data.volume_id, data.disk_name || '', data.spec_id || null, parseInt(data.user_id), parseInt(data.storage_group_id), data.storage_pool, data.disk_type, data.disk_format || null, parseInt(data.capacity_gb), data.status || 'free', parseFloat(data.price_per_gb) || 0, parseInt(data.quarterly_discount) || 0, parseInt(data.yearly_discount) || 0, data.auto_renew ? 1 : 0, data.is_legacy ? 1 : 0, data.expire_time || null, data.mbps_rd || null, data.mbps_rd_max || null, data.mbps_wr || null, data.mbps_wr_max || null, data.iops_rd || null, data.iops_rd_max || null, data.iops_wr || null, data.iops_wr_max || null]
        );
        return queryOne('SELECT * FROM disks WHERE id = ?', [result.insertId]);
    },
    updateStatus: (id, status) => execute('UPDATE disks SET status = ?, updated_at = ? WHERE id = ?', [status, mysqlNow(), parseInt(id)]),
    bind: (id, vmid, bus, dev) => execute('UPDATE disks SET status = ?, bind_vmid = ?, bind_bus = ?, bind_dev = ?, updated_at = ? WHERE id = ?', ['bound', parseInt(vmid), bus, parseInt(dev), mysqlNow(), parseInt(id)]),
    unbind: (id) => execute('UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, updated_at = ? WHERE id = ?', ['free', mysqlNow(), parseInt(id)]),
    updateExpire: (id, expireTime) => execute('UPDATE disks SET expire_time = ?, updated_at = ? WHERE id = ?', [expireTime, mysqlNow(), parseInt(id)]),
    updateCapacity: (id, capacityGb) => execute('UPDATE disks SET capacity_gb = ?, updated_at = ? WHERE id = ?', [parseInt(capacityGb), mysqlNow(), parseInt(id)]),
    markDestroyed: (id) => execute('UPDATE disks SET status = ?, updated_at = ? WHERE id = ?', ['destroyed', mysqlNow(), parseInt(id)]),
    // 切换自动续费开关（0=关闭, 1=开启）
    updateAutoRenew: (id, enabled) => execute('UPDATE disks SET auto_renew = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, mysqlNow(), parseInt(id)]),
    // 更新中转 VM 托管信息（游离盘托管位置）
    updateHolding: (id, holdingVmid, holdingSlot) => execute('UPDATE disks SET holding_vmid = ?, holding_slot = ?, updated_at = ? WHERE id = ?', [holdingVmid === null ? null : parseInt(holdingVmid), holdingSlot, mysqlNow(), parseInt(id)]),
    // 查询指定中转 VM 上已占用的槽位
    getByHoldingVmid: (holdingVmid) => queryAll('SELECT * FROM disks WHERE holding_vmid = ? AND status != ?', [parseInt(holdingVmid), 'destroyed']),
    // 更新磁盘字段（仅更新提供值的字段）
    update: (id, data) => {
        const fields = [];
        const values = [];
        if (data.disk_name !== undefined) {
            fields.push('disk_name = ?');
            values.push(data.disk_name);
        }
        if (data.storage_group_id !== undefined) {
            fields.push('storage_group_id = ?');
            values.push(parseInt(data.storage_group_id));
        }
        if (data.spec_id !== undefined) {
            fields.push('spec_id = ?');
            values.push(data.spec_id || null);
        }
        fields.push('updated_at = ?');
        values.push(mysqlNow());
        values.push(parseInt(id));
        return execute(`UPDATE disks SET ${fields.join(', ')} WHERE id = ?`, values);
    },
    // 硬删除：仅允许删除已销毁状态的磁盘记录（清理已销毁的磁盘记录用）
    hardDelete: (id) => execute('DELETE FROM disks WHERE id = ? AND status = ?', [parseInt(id), 'destroyed']),
    // 更新磁盘 volume_id（恢复后同槽位换了新卷时使用）
    updateVolumeId: (id, volumeId) => execute('UPDATE disks SET volume_id = ?, updated_at = ? WHERE id = ?', [volumeId, mysqlNow(), parseInt(id)]),
    getExpiring: () => queryAll("SELECT * FROM disks WHERE status IN ('free','bound','grace') AND expire_time IS NOT NULL AND expire_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)"),
    // 更新绑定到指定 VMID 的 legacy 磁盘的 user_id（VM 换绑时同步）
    updateUserId: (vmid, userId) => execute('UPDATE disks SET user_id = ?, updated_at = ? WHERE bind_vmid = ? AND is_legacy = 1', [parseInt(userId), mysqlNow(), parseInt(vmid)])
};

// 磁盘生命周期配置
const diskLifecycleConfig = {
    get: () => queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1'),
    upsert: async (data) => {
        var existing = await queryOne('SELECT id FROM disk_lifecycle_config WHERE id = 1');
        if (existing) {
            const allowedColumns = ['warn_days', 'warn_frequency', 'grace_days', 'grace_frequency', 'retention_days', 'auto_renew_days'];
            const fields = [];
            const values = [];
            for (const key of Object.keys(data)) {
                if (allowedColumns.includes(key)) {
                    fields.push(`${key} = ?`);
                    values.push(data[key]);
                }
            }
            if (fields.length === 0) return queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1');
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            await execute(`UPDATE disk_lifecycle_config SET ${fields.join(', ')} WHERE id = 1`, values);
        } else {
            await execute(
                'INSERT INTO disk_lifecycle_config (id, warn_days, warn_frequency, grace_days, grace_frequency, retention_days, auto_renew_days) VALUES (1,?,?,?,?,?,?)',
                [parseInt(data.warn_days) || 7, data.warn_frequency || 'daily', parseInt(data.grace_days) || 3, data.grace_frequency || 'twice_daily', parseInt(data.retention_days) || 15, parseInt(data.auto_renew_days) || 1]
            );
        }
        return queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1');
    }
};

module.exports = { storageGroups, diskSpecs, disks, diskLifecycleConfig };
