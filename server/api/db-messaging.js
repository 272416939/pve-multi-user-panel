const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// V3-14 修复：敏感操作审计日志
const auditLogs = {
    create: async (data) => {
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
                data.details ? JSON.stringify(data.details) : null,
                mysqlNow()
            ]
        );
        return result.insertId;
    }
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

module.exports = { auditLogs, memos, messages };
