const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// CDK 兑换码操作
const cdk = {
    getAll: () => queryAll(`
        SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
        FROM cdk_codes c
        LEFT JOIN users creator ON c.created_by = creator.id
        LEFT JOIN users user ON c.used_by = user.id
        LEFT JOIN users target ON c.target_user_id = target.id
        LEFT JOIN vms v ON c.used_vm_id = v.id
        ORDER BY c.created_at DESC
    `),
    getById: (id) => queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]),
    getByCode: (code) => queryOne('SELECT * FROM cdk_codes WHERE code = ?', [code]),
    getByBatchId: (batchId) => queryAll(`
        SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
        FROM cdk_codes c
        LEFT JOIN users creator ON c.created_by = creator.id
        LEFT JOIN users user ON c.used_by = user.id
        LEFT JOIN users target ON c.target_user_id = target.id
        LEFT JOIN vms v ON c.used_vm_id = v.id
        WHERE c.batch_id = ? ORDER BY c.created_at
    `, [batchId]),
    getUnused: () => queryAll('SELECT * FROM cdk_codes WHERE is_used = 0'),
    getUsed: () => queryAll('SELECT * FROM cdk_codes WHERE is_used = 1'),
    create: async (cdk) => {
        const created = cdk.created_at ? String(cdk.created_at).replace('T', ' ').replace('Z', '').slice(0, 19) : mysqlNow();
        const expires = cdk.expires_at ? String(cdk.expires_at).replace('T', ' ').replace('Z', '').slice(0, 19) : null;
        const [result] = await execute(
            `INSERT INTO cdk_codes (code, duration_days, created_by, target_user_id, created_at, expires_at, batch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                cdk.code,
                cdk.duration_days,
                cdk.created_by,
                cdk.target_user_id || null,
                created,
                expires,
                cdk.batch_id || null
            ]
        );
        return queryOne('SELECT * FROM cdk_codes WHERE id = ?', [result.insertId]);
    },
    markAsUsed: async (id, userId, vmId, ctId) => {
        let result;
        if (ctId) {
            [result] = await execute(
                `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_ct_id = ?, used_at = ?
                 WHERE id = ? AND is_used = 0`,
                [userId, vmId, ctId, mysqlNow(), id]
            );
        } else {
            [result] = await execute(
                `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_at = ?
                 WHERE id = ? AND is_used = 0`,
                [userId, vmId, mysqlNow(), id]
            );
        }
        return { affected: result.affectedRows, cdk: await queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]) };
    },
    delete: (id) => execute('DELETE FROM cdk_codes WHERE id = ?', [id]),
    deleteBatch: (ids) => {
        if (!ids || ids.length === 0) return;
        const placeholders = ids.map(() => '?').join(',');
        return execute(`DELETE FROM cdk_codes WHERE id IN (${placeholders})`, ids);
    },
    deleteExpired: () => {
        return execute(
            `DELETE FROM cdk_codes
             WHERE is_used = 0 AND expires_at IS NOT NULL AND expires_at <= NOW()`
        );
    },
    deleteExpiredOrUsed: () => {
        return execute(
            `DELETE FROM cdk_codes
             WHERE is_used = 1 OR (expires_at IS NOT NULL AND expires_at <= NOW())`
        );
    },
    getActiveCount: () => {
        return queryOne(
            `SELECT COUNT(*) as count FROM cdk_codes
             WHERE is_used = 0 AND (expires_at IS NULL OR expires_at > NOW())`
        );
    }
};

// 交易记录操作
const transactionRecords = {
    create: async (record) => {
        const [result] = await execute(
            `INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                record.user_id, record.order_no, record.pay_time || null, record.pay_method || '',
                record.trade_type || 'recharge', record.amount || '0.00',
                record.period || null, record.period_count || null,
                record.balance_before || '0.00', record.balance_after || '0.00',
                record.resource_type || null, record.resource_id || null,
                record.trade_no || null,
                record.api_trade_no || null,
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM transaction_records WHERE id = ?', [result.insertId]);
    },
    getAll: async (params) => {
        var sql = 'SELECT * FROM transaction_records WHERE 1=1';
        var args = [];
        if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
        if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
        if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
        if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
        if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
        if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
        sql += ' ORDER BY id DESC';
        // SQL-2 修复：LIMIT/OFFSET 强制 parseInt + 上限保护
        var limit = parseInt(params.limit) || 0;
        var offset = parseInt(params.offset) || 0;
        if (limit > 0) {
            limit = Math.min(limit, 200);
            sql += ' LIMIT ?'; args.push(limit);
        }
        if (offset > 0) { sql += ' OFFSET ?'; args.push(offset); }
        return queryAll(sql, args);
    },
    countAll: async (params) => {
        var sql = 'SELECT COUNT(*) as total FROM transaction_records WHERE 1=1';
        var args = [];
        if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
        if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
        if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
        if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
        if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
        if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
        const row = await queryOne(sql, args);
        return row?.total || 0;
    },
    getByUserId: (userId, params) => {
        return transactionRecords.getAll(Object.assign({}, params, { user_id: userId }));
    },
    getByOrderNo: (orderNo) => {
        return queryOne('SELECT * FROM transaction_records WHERE order_no = ?', [orderNo]);
    }
};

// PAY-1/2/3 修复：充值待处理订单操作
const pendingOrders = {
    create: async (data) => {
        await execute(
            `INSERT INTO pending_orders (order_no, user_id, amount, pay_method, status, created_at)
             VALUES (?, ?, ?, ?, 'pending', ?)`,
            [data.order_no, data.user_id, data.amount, data.pay_method || '', mysqlNow()]
        );
    },
    getByOrderNo: (orderNo) => queryOne('SELECT * FROM pending_orders WHERE order_no = ?', [orderNo]),
    markProcessed: (orderNo) => execute('UPDATE pending_orders SET status = ?, processed_at = ? WHERE order_no = ?', ['processed', mysqlNow(), orderNo]),
};

// 订单操作
const orders = {
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status, order_kind)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.order_no, data.user_id, data.type || 'vm',
                data.package_id, data.template_id || 0,
                data.period || 'month', data.period_count || 1,
                data.amount || '0.00', data.cores || 0, data.memory || 0,
                data.disk_size || 0, data.resource_name || '',
                data.resource_id || '', data.status || 'completed',
                data.order_kind || 'new'
            ]
        );
        return queryOne('SELECT * FROM orders WHERE id = ?', [result.insertId]);
    },
    getByUser: (userId, params) => {
        return orders.getAll(Object.assign({}, params, { user_id: userId }));
    },
    getAll: async (params) => {
        // SQL-2 修复：parseInt + 上限保护
        var page = parseInt(params.page) || 1;
        var limit = Math.min(parseInt(params.limit) || 20, 200);
        var offset = (page - 1) * limit;
        var where = [];
        var args = [];
        if (params.order_no) { where.push('o.order_no = ?'); args.push(params.order_no); }
        if (params.user_id) { where.push('o.user_id = ?'); args.push(params.user_id); }
        if (params.type) { where.push('o.type = ?'); args.push(params.type); }
        if (params.status) { where.push('o.status = ?'); args.push(params.status); }
        if (params.resource_id) { where.push('o.resource_id = ?'); args.push(String(params.resource_id)); }
        if (params.start_time) { where.push('o.created_at >= ?'); args.push(params.start_time); }
        if (params.end_time) { where.push('o.created_at <= ?'); args.push(params.end_time); }
        var whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
        var countArgs = args.slice();
        var totalRow = await queryOne('SELECT COUNT(*) as total FROM orders o ' + whereClause, countArgs);
        args.push(limit, offset);
        var rows = await queryAll(`
            SELECT o.*, u.username,
                COALESCE(vp.name, lxp.name, o.resource_name, '') as package_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.id
            LEFT JOIN vm_packages vp ON o.type = 'vm' AND o.package_id = vp.id
            LEFT JOIN lxc_packages lxp ON o.type = 'lxc' AND o.package_id = lxp.id
            ${whereClause}
            ORDER BY o.id DESC LIMIT ? OFFSET ?
        `, args);
        return { rows, total: totalRow.total, page, limit };
    },
    getByOrderNo: (orderNo) => queryOne('SELECT * FROM orders WHERE order_no = ?', [orderNo]),
    updateStatus: (orderNo, status) => execute('UPDATE orders SET `status` = ? WHERE order_no = ?', [status, orderNo]),
};

module.exports = { cdk, transactionRecords, pendingOrders, orders };
