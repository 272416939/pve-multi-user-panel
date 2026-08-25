const { execute, queryOne, queryAll, mysqlNow, mysqlToday } = require('./db-core');

// 虚拟机操作
// 多节点：列表类查询统一 JOIN 带出 pve_node_name / zone_name（对齐套餐查询先例），前端零转换展示
const VM_SELECT = 'SELECT v.*, pn.name AS pve_node_name, z.name AS zone_name FROM vms v ' +
    'LEFT JOIN pve_nodes pn ON v.pve_node_id = pn.id ' +
    'LEFT JOIN zones z ON pn.zone_id = z.id';
const CT_SELECT = 'SELECT c.*, pn.name AS pve_node_name, z.name AS zone_name FROM lxc_containers c ' +
    'LEFT JOIN pve_nodes pn ON c.pve_node_id = pn.id ' +
    'LEFT JOIN zones z ON pn.zone_id = z.id';

// 虚拟机操作
const vms = {
    getAll: () => queryAll(VM_SELECT),
    getByUserId: (userId) => queryAll(VM_SELECT + ' WHERE v.user_id = ?', [userId]),
    getById: (id) => queryOne(VM_SELECT + ' WHERE v.id = ?', [parseInt(id)]),
    // nodeId 可选作用域：多节点后 vmid 不再全局唯一，已知节点时必须带第二参数
    getByVmid: (vmid, nodeId) => (nodeId != null
        ? queryOne(VM_SELECT + ' WHERE v.vm_id = ? AND v.pve_node_id = ?', [parseInt(vmid), nodeId])
        : queryOne(VM_SELECT + ' WHERE v.vm_id = ?', [parseInt(vmid)])),
    create: async (vm) => {
        const [result] = await execute(
             `INSERT INTO vms (vm_id, user_id, name, expiration_date, renewal_price, renewal_period, monthly_price, quarterly_discount, yearly_discount, pve_upid, current_os_template_id, subnet_id, pve_node_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                vm.vm_id,
                vm.user_id,
                vm.name || '',
                vm.expiration_date || null,
                vm.renewal_price || '',
                vm.renewal_period || 'month',
                vm.monthly_price || '',
                vm.quarterly_discount || '',
                vm.yearly_discount || '',
                vm.pve_upid || '',
                vm.current_os_template_id || null,
                vm.subnet_id || null,
                vm.pve_node_id || null,
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM vms WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'vm_id', 'user_id', 'expiration_date',
            'renewal_price', 'renewal_period', 'monthly_price', 'quarterly_discount', 'yearly_discount', 'pve_upid', 'dhcp_static_ip', 'ikuai_mac_group_id', 'backup_storage', 'reminderSent', 'lastReminderDate', 'shutdown_reason',
            'current_os_template_id', 'last_os_switch_at', 'os_switch_pve_upid', 'subnet_id', 'pve_node_id'];
        for (const key of Object.keys(updates)) {
            if (!allowedColumns.includes(key)) delete updates[key];
        }
        if (Object.keys(updates).length === 0) return;
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'reminderSent') {
                fields.push('reminderSent = ?');
                values.push(value ? 1 : 0);
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        values.push(id);

        await execute(`UPDATE vms SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM vms WHERE id = ?', [id]);
    },
    delete: async (id) => {
        await execute('UPDATE cdk_codes SET used_vm_id = NULL WHERE used_vm_id = ?', [id]);
        return execute('DELETE FROM vms WHERE id = ?', [id]);
    },
    // 虚拟机提醒记录操作
    reminders: {
        getByVmId: (vmId) => queryAll('SELECT * FROM vm_reminders WHERE vm_id = ?', [vmId]),
        add: (vmId, days) => {
            return execute(
                'INSERT INTO vm_reminders (vm_id, days, sent_at) VALUES (?, ?, ?)',
                [vmId, days, mysqlNow()]
            );
        },
        clear: (vmId) => execute('DELETE FROM vm_reminders WHERE vm_id = ?', [vmId]),
        countExpiredDays: async (vmId) => {
            const result = await queryOne(
                `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM vm_reminders
                 WHERE vm_id = ? AND days = 0`,
                [vmId]
            );
            return result?.count || 0;
        },
        getTodayExpired: () => {
            const today = mysqlToday();
            return queryAll(
                "SELECT vm_id FROM vm_reminders WHERE days = 0 AND sent_at LIKE ?",
                [today + '%']
            );
        },
        getTodayAll: () => {
            const today = mysqlToday();
            return queryAll(
                'SELECT * FROM vm_reminders WHERE sent_at LIKE ?',
                [today + '%']
            );
        }
    }
};

// LXC 容器操作
const lxcContainers = {
    getAll: () => queryAll(CT_SELECT),
    getByUserId: (userId) => queryAll(CT_SELECT + ' WHERE c.user_id = ?', [userId]),
    getById: (id) => queryOne(CT_SELECT + ' WHERE c.id = ?', [parseInt(id)]),
    getByCtId: (ctId, nodeId) => (nodeId != null
        ? queryAll(CT_SELECT + ' WHERE c.ct_id = ? AND c.pve_node_id = ?', [ctId, nodeId])
        : queryAll(CT_SELECT + ' WHERE c.ct_id = ?', [ctId])),
    findByUpid: (upid) => queryOne('SELECT * FROM lxc_containers WHERE pve_upid = ? LIMIT 1', [upid]),
    create: async (ct) => {
        const [result] = await execute(
            `INSERT INTO lxc_containers (ct_id, user_id, name, expiration_date, renewal_price, renewal_period, monthly_price, quarterly_discount, yearly_discount, pve_upid, subnet_id, pve_node_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                ct.ct_id,
                ct.user_id,
                ct.name || '',
                ct.expiration_date || null,
                ct.renewal_price || '',
                ct.renewal_period || 'month',
                ct.monthly_price || '',
                ct.quarterly_discount || '',
                ct.yearly_discount || '',
                ct.pve_upid || '',
                ct.subnet_id || null,
                ct.pve_node_id || null,
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'ct_id', 'user_id', 'expiration_date',
            'renewal_price', 'renewal_period', 'monthly_price', 'quarterly_discount', 'yearly_discount', 'pve_upid', 'dhcp_static_ip', 'ikuai_mac_group_id', 'reminderSent', 'lastReminderDate', 'shutdown_reason', 'subnet_id', 'pve_node_id'];
        for (const key of Object.keys(updates)) {
            if (!allowedColumns.includes(key)) delete updates[key];
        }
        if (Object.keys(updates).length === 0) return;
        const fields = [];
        const values = [];

        for (const [key, value] of Object.entries(updates)) {
            if (key === 'reminderSent') {
                fields.push('reminderSent = ?');
                values.push(value ? 1 : 0);
            } else {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        values.push(id);

        await execute(`UPDATE lxc_containers SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]);
    },
    delete: async (id) => {
        await execute('UPDATE cdk_codes SET used_ct_id = NULL WHERE used_ct_id = ?', [id]);
        return execute('DELETE FROM lxc_containers WHERE id = ?', [id]);
    },
    // LXC 容器提醒记录操作
    reminders: {
        getByCtId: (ctId) => queryAll('SELECT * FROM lxc_reminders WHERE ct_id = ?', [ctId]),
        add: (ctId, days) => {
            return execute(
                'INSERT INTO lxc_reminders (ct_id, days, sent_at) VALUES (?, ?, ?)',
                [ctId, days, mysqlNow()]
            );
        },
        clear: (ctId) => execute('DELETE FROM lxc_reminders WHERE ct_id = ?', [ctId]),
        countExpiredDays: async (ctId) => {
            const result = await queryOne(
                `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM lxc_reminders
                 WHERE ct_id = ? AND days = 0`,
                [ctId]
            );
            return result?.count || 0;
        },
        getTodayExpired: () => {
            const today = mysqlToday();
            return queryAll(
                "SELECT ct_id FROM lxc_reminders WHERE days = 0 AND sent_at LIKE ?",
                [today + '%']
            );
        },
        getTodayAll: () => {
            const today = mysqlToday();
            return queryAll(
                'SELECT * FROM lxc_reminders WHERE sent_at LIKE ?',
                [today + '%']
            );
        }
    }
};

// 模板查询 JOIN 片段（多节点：带出 pve_node_name/zone_name 供 admin 列表展示）
const NODE_ZONE_JOIN = ' LEFT JOIN pve_nodes pn ON t.pve_node_id = pn.id LEFT JOIN zones z ON pn.zone_id = z.id';

// VM 模板操作
const vmTemplates = {
    getAll: () => queryAll('SELECT t.*, pn.name AS pve_node_name, z.name AS zone_name FROM vm_templates t' + NODE_ZONE_JOIN + ' ORDER BY t.id DESC'),
    getById: (id) => queryOne('SELECT * FROM vm_templates WHERE id = ?', [id]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO vm_templates (name, template_vmid, cores, memory, disk_size, network_bridge, network_model, os_type, ciuser, target_storage, clone_mode, cpu_affinity, mac_group_id, description, status, pve_node_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name || '', data.template_vmid || 0, data.cores || 1,
                data.memory || 1024, data.disk_size || 20,
                data.network_bridge || 'vmbr0', data.network_model || 'virtio',
                data.os_type || '',
                data.ciuser || '',
                data.target_storage || 'local-lvm',
                data.clone_mode || 'full',
                data.cpu_affinity || '',
                data.mac_group_id || '',
                data.description || '', data.status || 'active',
                data.pve_node_id || null
            ]
        );
        return queryOne('SELECT * FROM vm_templates WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'template_vmid', 'cores', 'memory', 'disk_size', 'network_bridge', 'network_model', 'os_type', 'ciuser', 'target_storage', 'clone_mode', 'cpu_affinity', 'mac_group_id', 'description', 'status', 'pve_node_id'];
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
        await execute(`UPDATE vm_templates SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM vm_templates WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM vm_templates WHERE id = ?', [id])
};

// LXC 模板操作
const lxcTemplates = {
    getAll: () => queryAll('SELECT t.*, pn.name AS pve_node_name, z.name AS zone_name FROM lxc_templates t' + NODE_ZONE_JOIN + ' ORDER BY t.id DESC'),
    getById: (id) => queryOne('SELECT * FROM lxc_templates WHERE id = ?', [id]),
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO lxc_templates (name, ostemplate, storage, rootfs_storage, cores, memory, swap, disk_size, network_bridge, network_mode, ipv6_enabled, ip6_mode, ip6_addr, ip4_addr, unprivileged, features, mac_group_id, description, status, pve_node_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name || '', data.ostemplate || '', data.storage || 'local',
                data.rootfs_storage || 'local-lvm',
                data.cores || 1, data.memory || 512, data.swap || 512,
                data.disk_size || 8, data.network_bridge || 'vmbr0',
                data.network_mode || 'dhcp',
                data.ipv6_enabled !== undefined ? data.ipv6_enabled : 1,
                data.ip6_mode || 'dhcp', data.ip6_addr || '', data.ip4_addr || '',
                data.unprivileged !== undefined ? data.unprivileged : 1,
                data.features || '', data.mac_group_id || '', data.description || '', data.status || 'active',
                data.pve_node_id || null
            ]
        );
        return queryOne('SELECT * FROM lxc_templates WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'ostemplate', 'storage', 'cores', 'memory', 'swap', 'disk_size', 'network_bridge', 'network_mode', 'ipv6_enabled', 'ip6_mode', 'ip6_addr', 'ip4_addr', 'unprivileged', 'features', 'description', 'rootfs_storage', 'mac_group_id', 'status', 'pve_node_id'];
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
        await execute(`UPDATE lxc_templates SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM lxc_templates WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM lxc_templates WHERE id = ?', [id])
};

// 可切换系统模板（os_templates）
const osTemplates = {
    getAll: () => queryAll('SELECT t.*, pn.name AS pve_node_name, z.name AS zone_name FROM os_templates t' + NODE_ZONE_JOIN + ' ORDER BY t.sort_order DESC, t.id DESC'),
    getById: (id) => queryOne('SELECT * FROM os_templates WHERE id = ?', [parseInt(id)]),
    getEnabled: () => queryAll("SELECT t.*, pn.name AS pve_node_name, z.name AS zone_name FROM os_templates t" + NODE_ZONE_JOIN + " WHERE t.enabled = 1 AND t.status = 'active' ORDER BY t.sort_order DESC, t.id DESC"),
    getByTemplateVmid: (vmid) => queryAll('SELECT * FROM os_templates WHERE template_vmid = ?', [parseInt(vmid)]),
    create: async (data) => {
        const [result] = await execute(
`INSERT INTO os_templates (name, template_vmid, os_type, os_version, ostype, arch, target_storage, disk_format, ciuser, description, icon, sort_order, allowed_package_ids, enabled, status, pve_node_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.name || '', parseInt(data.template_vmid) || 0,
                data.os_type || '', data.os_version || '',
                data.ostype || '', data.arch || 'x86_64',
                data.target_storage || 'local-lvm', data.disk_format || '',
                data.ciuser || '', data.description || '',
                data.icon || '', parseInt(data.sort_order) || 0,
                data.allowed_package_ids || '', data.enabled === false ? 0 : 1,
                data.status || 'active',
                data.pve_node_id || null
            ]
        );
        return queryOne('SELECT * FROM os_templates WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['name', 'template_vmid', 'os_type', 'os_version', 'ostype', 'arch', 'target_storage', 'disk_format', 'ciuser', 'description', 'icon', 'sort_order', 'allowed_package_ids', 'enabled', 'status', 'pve_node_id'];
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
        await execute(`UPDATE os_templates SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM os_templates WHERE id = ?', [parseInt(id)]);
    },
    delete: (id) => execute('DELETE FROM os_templates WHERE id = ?', [parseInt(id)]),
    countByTemplateVmid: (vmid) => queryOne('SELECT COUNT(*) AS c FROM os_templates WHERE template_vmid = ? AND enabled = 1', [parseInt(vmid)]),
    // 批量保存拖拽排序：sort_order 值越大越靠前，与查询 ORDER BY sort_order DESC 语义一致（第一个 id 最大）
    batchUpdateSortOrder: async function(ids) {
        if (!Array.isArray(ids) || ids.length === 0) return;
        var total = ids.length;
        for (var i = 0; i < ids.length; i++) {
            var sortOrder = (total - i) * 10;
            await execute('UPDATE os_templates SET sort_order = ?, updated_at = ? WHERE id = ?', [sortOrder, mysqlNow(), parseInt(ids[i])]);
        }
    }
};

// 系统切换日志（vm_os_switch_logs）
const vmOsSwitchLogs = {
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO vm_os_switch_logs (vm_id, user_id, from_os_template_id, to_os_template_id, new_system_volume_id, status, order_no)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                parseInt(data.vm_id), parseInt(data.user_id),
                data.from_os_template_id || null, parseInt(data.to_os_template_id),
                data.new_system_volume_id || '',
                data.status || 'pending', data.order_no || ''
            ]
        );
        return queryOne('SELECT * FROM vm_os_switch_logs WHERE id = ?', [result.insertId]);
    },
    getById: (id) => queryOne('SELECT * FROM vm_os_switch_logs WHERE id = ?', [parseInt(id)]),
    getByVmid: (vmid) => queryAll('SELECT * FROM vm_os_switch_logs WHERE vm_id = ? ORDER BY id DESC LIMIT 20', [parseInt(vmid)]),
    getByOrderNo: (orderNo) => queryOne('SELECT * FROM vm_os_switch_logs WHERE order_no = ?', [orderNo]),
    getRunningByVmid: (vmid) => queryOne("SELECT * FROM vm_os_switch_logs WHERE vm_id = ? AND status IN ('pending', 'running') ORDER BY id DESC LIMIT 1", [parseInt(vmid)]),
    getStaleRunning: (beforeTime) => queryAll("SELECT * FROM vm_os_switch_logs WHERE status = 'running' AND started_at < ?", [beforeTime]),
    update: async (id, updates) => {
        const allowedColumns = ['status', 'fail_stage', 'error_message', 'admin_intervention_required', 'new_system_volume_id', 'finished_at'];
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
        await execute(`UPDATE vm_os_switch_logs SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM vm_os_switch_logs WHERE id = ?', [parseInt(id)]);
    },
    countTodayByUser: (userId) => queryOne("SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE user_id = ? AND DATE(started_at) = CURDATE()", [parseInt(userId)]),
    // 管理端翻页（keyword 模糊匹配：用户名/VMID/来源/目标系统名；日期按 started_at 范围）
    getListWithPaging: (filters) => {
        const { page = 1, limit = 20, status, vm_id, user_id, username, keyword, start_date, end_date, before_date } = filters;
        const offset = (Math.min(page, 1000) - 1) * Math.min(limit, 200);
        let sql = `SELECT l.*, u.username,
                          from_t.name AS from_os_template_name,
                          to_t.name AS to_os_template_name
                   FROM vm_os_switch_logs l
                   LEFT JOIN users u ON l.user_id = u.id
                   LEFT JOIN os_templates from_t ON l.from_os_template_id = from_t.id
                   LEFT JOIN os_templates to_t ON l.to_os_template_id = to_t.id
                   WHERE 1=1`;
        const params = [];
        if (status) { sql += ' AND l.status = ?'; params.push(status); }
        if (vm_id) { sql += ' AND l.vm_id = ?'; params.push(parseInt(vm_id)); }
        if (user_id) { sql += ' AND l.user_id = ?'; params.push(parseInt(user_id)); }
        if (username) { sql += ' AND u.username LIKE ?'; params.push('%' + username + '%'); }
        if (keyword) {
            const kw = '%' + keyword + '%';
            sql += ' AND (u.username LIKE ? OR l.vm_id LIKE ? OR from_t.name LIKE ? OR to_t.name LIKE ?)';
            params.push(kw, kw, kw, kw);
        }
        if (start_date) { sql += ' AND l.started_at >= ?'; params.push(start_date); }
        if (end_date) { sql += ' AND l.started_at <= ?'; params.push(end_date); }
        if (before_date) { sql += ' AND l.started_at < ?'; params.push(before_date); }
        sql += ' ORDER BY l.id DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);
        return queryAll(sql, params);
    },
    countWithFilters: (filters) => {
        const { status, vm_id, user_id, username, keyword, start_date, end_date, before_date } = filters;
        let sql = 'SELECT COUNT(*) AS c FROM vm_os_switch_logs l LEFT JOIN users u ON l.user_id = u.id LEFT JOIN os_templates from_t ON l.from_os_template_id = from_t.id LEFT JOIN os_templates to_t ON l.to_os_template_id = to_t.id WHERE 1=1';
        const params = [];
        if (status) { sql += ' AND l.status = ?'; params.push(status); }
        if (vm_id) { sql += ' AND l.vm_id = ?'; params.push(parseInt(vm_id)); }
        if (user_id) { sql += ' AND l.user_id = ?'; params.push(parseInt(user_id)); }
        if (username) { sql += ' AND u.username LIKE ?'; params.push('%' + username + '%'); }
        if (keyword) {
            const kw = '%' + keyword + '%';
            sql += ' AND (u.username LIKE ? OR l.vm_id LIKE ? OR from_t.name LIKE ? OR to_t.name LIKE ?)';
            params.push(kw, kw, kw, kw);
        }
        if (start_date) { sql += ' AND l.started_at >= ?'; params.push(start_date); }
        if (end_date) { sql += ' AND l.started_at <= ?'; params.push(end_date); }
        if (before_date) { sql += ' AND l.started_at < ?'; params.push(before_date); }
        return queryOne(sql, params);
    },
    // 用户端翻页
    getByUserId: (userId, page = 1, limit = 10) => {
        const offset = (Math.min(page, 1000) - 1) * Math.min(limit, 50);
        return queryAll('SELECT * FROM vm_os_switch_logs WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [parseInt(userId), parseInt(limit), offset]);
    },
    countByUserId: (userId) => queryOne('SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE user_id = ?', [parseInt(userId)]),
    getByVmidWithPaging: (vmid, page = 1, limit = 10) => {
        const offset = (Math.min(page, 1000) - 1) * Math.min(limit, 50);
        return queryAll('SELECT * FROM vm_os_switch_logs WHERE vm_id = ? ORDER BY id DESC LIMIT ? OFFSET ?', [parseInt(vmid), parseInt(limit), offset]);
    },
    countByVmid: (vmid) => queryOne('SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE vm_id = ?', [parseInt(vmid)]),
    // 删除方法（含安全保护）
    deleteById: async (id) => {
        const log = await queryOne("SELECT status, admin_intervention_required FROM vm_os_switch_logs WHERE id = ?", [parseInt(id)]);
        if (!log) return { deleted: 0 };
        if (log.status === 'running') {
            const err = new Error('运行中的日志禁止删除');
            err.code = 'LOG_RUNNING';
            throw err;
        }
        // execute 返回 [ResultSetHeader, fields]，需解构取 affectedRows（否则恒为 undefined）
        const [result] = await execute("DELETE FROM vm_os_switch_logs WHERE id = ? AND status != 'running'", [parseInt(id)]);
        return { deleted: result.affectedRows };
    },
    batchDelete: async (criteria) => {
        const { ids, status, vm_id, user_id, before_date } = criteria;
        let sql = "DELETE FROM vm_os_switch_logs WHERE status != 'running'";
        const params = ['running'];
        if (ids && Array.isArray(ids) && ids.length > 0) {
            sql += ' AND id IN (' + ids.map(() => '?').join(',') + ')';
            params.push(...ids.map(id => parseInt(id)));
        } else {
            if (status) { sql += ' AND status = ?'; params.push(status); }
            if (vm_id) { sql += ' AND vm_id = ?'; params.push(parseInt(vm_id)); }
            if (user_id) { sql += ' AND user_id = ?'; params.push(parseInt(user_id)); }
            if (before_date) { sql += ' AND started_at < ?'; params.push(before_date); }
        }
        const skipped = await queryOne("SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE status = 'running'" +
            (ids && ids.length ? ' AND id IN (' + ids.map(() => '?').join(',') + ')' : ''),
            ids && ids.length ? ['running', ...ids.map(id => parseInt(id))] : ['running']);
        const [result] = await execute(sql, params);
        return { deleted: result.affectedRows, skipped_running: skipped.c };
    },
    clearAllExceptRunningAndIntervention: async () => {
        const [result] = await execute("DELETE FROM vm_os_switch_logs WHERE status != 'running' AND admin_intervention_required = 0");
        const skippedRunning = await queryOne("SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE status = 'running'");
        const skippedIntervention = await queryOne("SELECT COUNT(*) AS c FROM vm_os_switch_logs WHERE admin_intervention_required = 1");
        return {
            deleted: result.affectedRows,
            skipped_running: skippedRunning.c,
            skipped_intervention: skippedIntervention.c
        };
    }
};

// VM 磁盘快照（恢复前后对账，防止幽灵盘）
const vmDiskSnapshots = {
    upsert: (vmId, userId, diskSnapshot) => execute(
        `REPLACE INTO vm_disk_snapshots (vm_id, user_id, disk_snapshot)
         VALUES (?, ?, ?)`,
        [parseInt(vmId), parseInt(userId), JSON.stringify(diskSnapshot)]
    ),
    getByVmId: (vmId) => queryOne(
        'SELECT * FROM vm_disk_snapshots WHERE vm_id = ?',
        [parseInt(vmId)]
    ),
    getAll: () => queryAll('SELECT * FROM vm_disk_snapshots'),
    delete: (vmId) => execute(
        'DELETE FROM vm_disk_snapshots WHERE vm_id = ?',
        [parseInt(vmId)]
    ),
};

module.exports = { vms, lxcContainers, vmTemplates, lxcTemplates, osTemplates, vmOsSwitchLogs, vmDiskSnapshots };
