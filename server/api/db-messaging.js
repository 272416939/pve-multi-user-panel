const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// V3-14 修复：敏感操作审计日志
// 操作类型分类（dashboard 操作日志筛选，action 前缀约定见下方映射）
// 单一来源：白名单/中文名/action→分类/分类→SQL 条件全部收敛于此，路由层 require 复用，禁止拷贝
const AUDIT_CATEGORIES = ['user_login', 'vm_lxc', 'password', 'order', 'disk', 'setting', 'security'];

const AUDIT_CATEGORY_NAMES = {
    user_login: '用户登陆',
    vm_lxc: '操作VM/LXC',
    password: '重置密码',
    order: '服务开通',
    disk: '硬盘管理',
    setting: '功能设置',
    security: '安全设置'
};

// action 前缀 → 分类（与 category → SQL 条件映射一一对应）
function actionToCategory(action) {
    action = String(action || '');
    if (action === 'user.login') return 'user_login';
    if (/^(vm|lxc|backup|snapshot|network)\./.test(action)) return 'vm_lxc';
    if (/^password\./.test(action)) return 'password';
    if (/^order\./.test(action)) return 'order';
    if (/^disk\./.test(action)) return 'disk';
    if (/^setting\./.test(action)) return 'setting';
    if (/^security\./.test(action)) return 'security';
    return '';
}

// category -> SQL 条件（参数化），返回 [whereSql, args]
function buildAuditCategoryWhere(category) {
    switch (category) {
        case 'user_login': return ['action = ?', ['user.login']];
        case 'vm_lxc': return ['(action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ?)', ['vm.%', 'lxc.%', 'backup.%', 'snapshot.%', 'network.%']];
        case 'password': return ['action LIKE ?', ['password.%']];
        case 'order': return ['action LIKE ?', ['order.%']];
        case 'disk': return ['action LIKE ?', ['disk.%']];
        case 'setting': return ['action LIKE ?', ['setting.%']];
        case 'security': return ['action LIKE ?', ['security.%']];
        default: return ['', []];
    }
}

// 每用户日志保留上限清理（防写爆数据库，供定时任务调用）：
// 只处理超限用户（GROUP BY HAVING COUNT > keep），取该用户第 keep+1 条 id 作为 cutoff，
// 删除更旧的记录——走 user_id 索引，保留最新 keep 条不误删
// table 仅限本文件内部白名单（audit_logs / login_logs），非用户输入
const LOG_TRIM_TABLES = ['audit_logs', 'login_logs'];

// 单用户收敛：该用户超过 keep 条时删除更旧记录，返回删除数（不足 keep 条返回 0）
async function trimUserOverflow(table, userId, keepCount) {
    if (LOG_TRIM_TABLES.indexOf(table) === -1) return 0;
    var keep = Math.max(parseInt(keepCount) || 5000, 100);
    var uid = parseInt(userId);
    if (!Number.isInteger(uid) || uid < 1) return 0;
    var cutoff = await queryOne('SELECT id FROM ' + table + ' WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?', [uid, keep]);
    if (!cutoff) return 0;
    var result = await execute('DELETE FROM ' + table + ' WHERE user_id = ? AND id < ?', [uid, cutoff.id]);
    return result.affectedRows || 0;
}

async function trimTableOverflow(table, keepCount) {
    if (LOG_TRIM_TABLES.indexOf(table) === -1) return 0;
    var keep = Math.max(parseInt(keepCount) || 5000, 100);
    var users = await queryAll('SELECT user_id FROM ' + table + ' GROUP BY user_id HAVING COUNT(*) > ?', [keep]);
    var total = 0;
    for (var i = 0; i < users.length; i++) {
        total += await trimUserOverflow(table, users[i].user_id, keep);
    }
    return total;
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
    clearByUser: (userId) => execute('DELETE FROM audit_logs WHERE user_id = ?', [userId]),
    // 每用户保留最新 keepCount 条，返回删除总数（供定时任务调用）
    trimOverflow: (keepCount) => trimTableOverflow('audit_logs', keepCount),
    // 单用户即时收敛（供批量操作后调用，瞬时回到保留上限内）
    trimUserOverflow: (userId, keepCount) => trimUserOverflow('audit_logs', userId, keepCount)
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
    clearByUser: (userId) => execute('DELETE FROM login_logs WHERE user_id = ?', [userId]),
    // 每用户保留最新 keepCount 条，返回删除总数（供定时任务调用）
    trimOverflow: (keepCount) => trimTableOverflow('login_logs', keepCount),
    // 单用户即时收敛（供批量操作后调用，瞬时回到保留上限内）
    trimUserOverflow: (userId, keepCount) => trimUserOverflow('login_logs', userId, keepCount)
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

module.exports = { auditLogs, loginLogs, memos, messages, AUDIT_CATEGORIES, AUDIT_CATEGORY_NAMES, actionToCategory };
