const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// V3-14 修复：敏感操作审计日志
// 操作类型分类（dashboard 操作日志筛选，action 前缀约定见下方映射）
const AUDIT_CATEGORIES = ['user_login', 'vm_lxc', 'password', 'order', 'disk', 'setting', 'security'];

// category -> SQL 条件（参数化），返回 [whereSql, args]
function buildAuditCategoryWhere(category) {
    switch (category) {
        case 'user_login': return ['action = ?', ['user.login']];
        case 'vm_lxc': return ['(action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ?)', ['vm.%', 'lxc.%', 'backup.%', 'snapshot.%']];
        case 'password': return ['action LIKE ?', ['password.%']];
        case 'order': return ['action LIKE ?', ['order.%']];
        case 'disk': return ['action LIKE ?', ['disk.%']];
        case 'setting': return ['action LIKE ?', ['setting.%']];
        case 'security': return ['action LIKE ?', ['security.%']];
        default: return ['', []];
    }
}

const auditLogs = {
    create: async (data) => {
        // details 兼容两种形态：字符串（展示文本，原样存储）/ 对象（旧记录 JSON 序列化）
        var detailsVal = null;
        if (data.details !== undefined && data.details !== null && data.details !== '') {
            detailsVal = (typeof data.details === 'string') ? data.details : JSON.stringify(data.details);
        }
        const [result] = await execute(
            'INSERT INTO audit_logs (user_id, username, action, resource_type, resource_id, ip, user_agent, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                parseInt(data.user_id) || 0,
                String(data.username || ''),
                String(data.action || ''),
                String(data.resource_type || ''),
                String(data.resource_id || ''),
                String(data.ip || ''),
                String(data.user_agent || ''),
                detailsVal,
                mysqlNow()
            ]
        );
        return result.insertId;
    },
    // 分页查询（范围锁死 user_id，防止越权查看他人日志）
    getListWithPaging: async (params) => {
        var page = parseInt(params.page) || 1;
        var limit = Math.min(parseInt(params.limit) || 20, 200);  // D-3: LIMIT 上限保护
        var offset = (page - 1) * limit;
        var where = ['user_id = ?'];
        var args = [parseInt(params.userId) || 0];
        if (params.category && AUDIT_CATEGORIES.indexOf(params.category) !== -1) {
            var cat = buildAuditCategoryWhere(params.category);
            where.push(cat[0]);
            args = args.concat(cat[1]);
        }
        if (params.keyword) {
            where.push('details LIKE ?');
            args.push('%' + params.keyword + '%');
        }
        var whereClause = ' WHERE ' + where.join(' AND ');
        var totalRow = await queryOne('SELECT COUNT(*) AS total FROM audit_logs' + whereClause, args);
        var rows = await queryAll(
            'SELECT id, user_id, username, action, resource_type, resource_id, ip, details, created_at FROM audit_logs' + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?',
            args.concat([limit, offset])
        );
        return { rows: rows, total: totalRow.total, page: page, limit: limit };
    },
    clearByUser: (userId) => execute('DELETE FROM audit_logs WHERE user_id = ?', [userId])
};

// 登录日志（登录成功/失败）
const loginLogs = {
    create: async (data) => {
        const [result] = await execute(
            'INSERT INTO login_logs (user_id, username, ip, user_agent, status, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                parseInt(data.user_id) || 0,
                String(data.username || ''),
                String(data.ip || ''),
                String(data.user_agent || ''),
                String(data.status || 'success'),
                data.details || null,
                mysqlNow()
            ]
        );
        return result.insertId;
    },
    getListWithPaging: async (params) => {
        var page = parseInt(params.page) || 1;
        var limit = Math.min(parseInt(params.limit) || 20, 200);  // D-3: LIMIT 上限保护
        var offset = (page - 1) * limit;
        var where = ['user_id = ?'];
        var args = [parseInt(params.userId) || 0];
        if (params.status && ['success', 'failed'].indexOf(params.status) !== -1) {
            where.push('status = ?');
            args.push(params.status);
        }
        if (params.keyword) {
            where.push('(username LIKE ? OR ip LIKE ? OR user_agent LIKE ?)');
            var kw = '%' + params.keyword + '%';
            args.push(kw, kw, kw);
        }
        var whereClause = ' WHERE ' + where.join(' AND ');
        var totalRow = await queryOne('SELECT COUNT(*) AS total FROM login_logs' + whereClause, args);
        var rows = await queryAll(
            'SELECT id, user_id, username, ip, user_agent, status, details, created_at FROM login_logs' + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?',
            args.concat([limit, offset])
        );
        return { rows: rows, total: totalRow.total, page: page, limit: limit };
    },
    clearByUser: (userId) => execute('DELETE FROM login_logs WHERE user_id = ?', [userId])
};

// 备忘录操作
const memos = {
    getByUserId: (userId) => queryAll('SELECT * FROM memos WHERE user_id = ?', [userId]),
    getById: (id) => queryOne('SELECT * FROM memos WHERE id = ?', [id]),
    create: async (memo) => {
        const [result] = await execute(
            `INSERT INTO memos (user_id, title, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                memo.user_id,
                memo.title || '',
                memo.content || '',
                mysqlNow(),
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM memos WHERE id = ?', [result.insertId]);
    },
    update: async (id, updates) => {
        const allowedColumns = ['title', 'content', 'user_id'];
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

        await execute(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`, values);
        return queryOne('SELECT * FROM memos WHERE id = ?', [id]);
    },
    delete: (id) => execute('DELETE FROM memos WHERE id = ?', [id])
};

// 站内消息操作
const messages = {
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO messages (uid, title, content, type, send_type, link_url, link_text, batch_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.uid,
                data.title || '',
                data.content || '',
                data.type || 1,
                data.send_type || 1,
                data.link_url || '',
                data.link_text || '',
                data.batch_id || '',
                mysqlNow()
            ]
        );
        return queryOne('SELECT * FROM messages WHERE id = ?', [result.insertId]);
    },
    getByUser: async (uid, type, page = 1, pageSize = 20) => {
        // SQL-2 修复：parseInt + 上限保护
        page = parseInt(page) || 1;
        pageSize = Math.min(parseInt(pageSize) || 20, 200);
        const offset = (page - 1) * pageSize;
        let where = '(uid = ? OR uid = 0)';
        const params = [uid];
        if (type && type !== 'all') {
            where += ' AND type = ?';
            params.push(parseInt(type));
        }
        const totalResult = await queryOne(`SELECT COUNT(*) as count FROM messages WHERE ${where}`, params);
        const list = await queryAll(
            `SELECT * FROM messages WHERE ${where}
             ORDER BY is_read ASC, created_at DESC LIMIT ? OFFSET ?`,
            [...params, pageSize, offset]
        );
        return { list, total: totalResult.count, page, pageSize };
    },
    getById: (id) => queryOne('SELECT * FROM messages WHERE id = ?', [id]),
    getUnreadCount: async (uid) => {
        const result = await queryOne(
            `SELECT COUNT(*) as count FROM messages
             WHERE (uid = ? OR uid = 0) AND is_read = 0`,
            [uid]
        );
        return result?.count || 0;
    },
    markRead: (id) => execute('UPDATE messages SET is_read = 1 WHERE id = ?', [id]),
    markAllRead: (uid) => execute(
        "UPDATE messages SET is_read = 1 WHERE (uid = ? OR uid = 0) AND is_read = 0",
        [uid]
    ),
    delete: (id, uid) => execute(
        'DELETE FROM messages WHERE id = ? AND (uid = ? OR uid = 0)',
        [id, uid]
    ),
    deleteAll: (uid) => execute(
        "DELETE FROM messages WHERE (uid = ? OR uid = 0) AND is_read = 1",
        [uid]
    ),
    getStats: async () => {
        const total = await queryOne('SELECT COUNT(*) as count FROM messages');
        const unread = await queryOne("SELECT COUNT(*) as count FROM messages WHERE is_read = 0");
        const byType = await queryAll('SELECT type, COUNT(*) as count FROM messages GROUP BY type');
        return { total: total.count, unread: unread.count, byType };
    }
};

module.exports = { auditLogs, loginLogs, memos, messages, AUDIT_CATEGORIES };
