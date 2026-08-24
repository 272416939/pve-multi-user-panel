const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 套餐查询统一带出所属 PVE 节点/可用区/地域（多节点：admin 编辑与用户端区域筛选都需要）
const VM_PKG_SELECT = 'SELECT p.*, t.name as template_name, g.name as group_name, ' +
    'n.name as pve_node_name, z.id as zone_id, z.name as zone_name, r.id as region_id, r.name as region_name ' +
    'FROM vm_packages p ' +
    'LEFT JOIN vm_templates t ON p.template_id = t.id ' +
    'LEFT JOIN package_groups g ON p.group_id = g.id ' +
    'LEFT JOIN pve_nodes n ON p.pve_node_id = n.id ' +
    'LEFT JOIN zones z ON n.zone_id = z.id ' +
    'LEFT JOIN regions r ON z.region_id = r.id ';
const LXC_PKG_SELECT = 'SELECT p.*, t.name as template_name, g.name as group_name, ' +
    'n.name as pve_node_name, z.id as zone_id, z.name as zone_name, r.id as region_id, r.name as region_name ' +
    'FROM lxc_packages p ' +
    'LEFT JOIN lxc_templates t ON p.template_id = t.id ' +
    'LEFT JOIN package_groups g ON p.group_id = g.id ' +
    'LEFT JOIN pve_nodes n ON p.pve_node_id = n.id ' +
    'LEFT JOIN zones z ON n.zone_id = z.id ' +
    'LEFT JOIN regions r ON z.region_id = r.id ';

// VM 套餐操作
const vmPackages = {
    getAll: () => queryAll(VM_PKG_SELECT + 'ORDER BY p.sort_order DESC, p.id DESC'),
    getById: (id) => queryOne(VM_PKG_SELECT + 'WHERE p.id = ?', [id]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO vm_packages (name, template_id, cores, memory, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status, group_id, quarterly_discount, yearly_discount, pve_node_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name || '', data.template_id || 0, data.cores || 1,
                data.memory || 1024, data.disk_size || 20,
                data.monthly_price || 0, data.quarterly_price || 0,
                data.yearly_price || 0, (data.stock === '' || data.stock === undefined || data.stock === null) ? -1 : parseInt(data.stock), data.sort_order || 0, data.cpu_model || '', data.bandwidth || 0, data.description || '', data.status || 'active',
                data.group_id || null, data.quarterly_discount || 0, data.yearly_discount || 0,
                data.pve_node_id || null
            ]
        );
        return queryOne('SELECT * FROM vm_packages WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status', 'group_id', 'quarterly_discount', 'yearly_discount', 'pve_node_id'];
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
        values.push(mysqlNow(), id);
        await execute(`UPDATE vm_packages SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM vm_packages WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM vm_packages WHERE id = ?', [id]),
    updateStock: (id, stock) => execute('UPDATE vm_packages SET stock = ? WHERE id = ?', [stock, id]),
    incrementSoldCount: (id) => execute('UPDATE vm_packages SET sold_count = sold_count + 1 WHERE id = ?', [id]),
    batchUpdateSortOrder: async function(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        var total = ids.length;
        var sql = 'UPDATE vm_packages SET sort_order = ? WHERE id = ?';
        for (var i = 0; i < ids.length; i++) {
            var sortOrder = (total - i) * 10;
            await execute(sql, [sortOrder, parseInt(ids[i])]);
        }
    }
};

// LXC 套餐操作
const lxcPackages = {
    getAll: () => queryAll(LXC_PKG_SELECT + 'ORDER BY p.sort_order DESC, p.id DESC'),
    getById: (id) => queryOne(LXC_PKG_SELECT + 'WHERE p.id = ?', [id]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO lxc_packages (name, template_id, cores, memory, swap, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status, group_id, quarterly_discount, yearly_discount, pve_node_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name || '', data.template_id || 0, data.cores || 1,
                data.memory || 512, data.swap || 512, data.disk_size || 8,
                data.monthly_price || 0, data.quarterly_price || 0,
                data.yearly_price || 0, (data.stock === '' || data.stock === undefined || data.stock === null) ? -1 : parseInt(data.stock), data.sort_order || 0, data.cpu_model || '', data.bandwidth || 0, data.description || '', data.status || 'active',
                data.group_id || null, data.quarterly_discount || 0, data.yearly_discount || 0,
                data.pve_node_id || null
            ]
        );
        return queryOne('SELECT * FROM lxc_packages WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'swap', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status', 'group_id', 'quarterly_discount', 'yearly_discount', 'pve_node_id'];
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
        values.push(id);
        await execute(`UPDATE lxc_packages SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM lxc_packages WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM lxc_packages WHERE id = ?', [id]),
    batchUpdateSortOrder: async function(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        var total = ids.length;
        var sql = 'UPDATE lxc_packages SET sort_order = ? WHERE id = ?';
        for (var i = 0; i < ids.length; i++) {
            var sortOrder = (total - i) * 10;
            await execute(sql, [sortOrder, parseInt(ids[i])]);
        }
    }
};

// 套餐分组操作
const packageGroups = {
    getAll: () => queryAll('SELECT * FROM package_groups ORDER BY sort_order DESC, id ASC'),
    getByType: (type) => queryAll('SELECT * FROM package_groups WHERE type = ? ORDER BY sort_order DESC, id ASC', [type]),
    getById: (id) => queryOne('SELECT * FROM package_groups WHERE id = ?', [id]),
    create: async (data) => {
        const [result] = await execute(
            'INSERT INTO package_groups (name, type, sort_order) VALUES (?, ?, ?)',
            [data.name || '', data.type || 'vm', data.sort_order || 0]
        );
        return queryOne('SELECT * FROM package_groups WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'type', 'sort_order'];
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
        values.push(id);
        await execute(`UPDATE package_groups SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM package_groups WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM package_groups WHERE id = ?', [id]),
    batchUpdateSortOrder: async function(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        var total = ids.length;
        var sql = 'UPDATE package_groups SET sort_order = ? WHERE id = ?';
        for (var i = 0; i < ids.length; i++) {
            var sortOrder = (total - i) * 10;
            await execute(sql, [sortOrder, parseInt(ids[i])]);
        }
    }
};

module.exports = { vmPackages, lxcPackages, packageGroups };
