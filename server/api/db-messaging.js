const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// V3-14 修复：敏感操作审计日志
// 操作类型分类（dashboard 操作日志筛选，action 前缀约定见下方映射）
// 单一来源：白名单/中文名/action→分类/分类→SQL 条件全部收敛于此，路由层 require 复用，禁止拷贝
const AUDIT_CATEGORIES = ['user_login', 'vm_lxc', 'password', 'purchase', 'disk', 'setting', 'security', 'admin'];

const AUDIT_CATEGORY_NAMES = {
    user_login: '用户登陆',
    vm_lxc: '操作VM/LXC',
    password: '重置密码',
    purchase: '新购/续费',
    disk: '硬盘管理',
    setting: '功能设置',
    security: '安全设置',
    admin: '后台管理'
};

// action 前缀 → 分类（与 category → SQL 条件映射一一对应）
// 新购/续费统一分类：开通VM/LXC(order.*)、购买硬盘(disk.purchase)、续费(disk.renew/auto-renew/vm.renew/lxc.renew)
function actionToCategory(action) {
    action = String(action || '');
    if (action === 'user.login' || action === 'user.register') return 'user_login';
    if (/^(order\.|disk\.(purchase|renew|auto-renew)|vm\.renew|lxc\.renew)/.test(action)) return 'purchase';
    if (/^(vm|lxc|backup|snapshot|network|subnet)\./.test(action)) return 'vm_lxc';
    if (/^password\./.test(action)) return 'password';
    if (/^disk\./.test(action)) return 'disk';
    if (/^setting\./.test(action)) return 'setting';
    if (/^security\./.test(action)) return 'security';
    // 后台管理操作（admin.<子域>.<动作>）
    if (/^admin\./.test(action)) return 'admin';
    return '';
}

// 后台操作（admin.*）二级子域白名单（单一来源）：
// admin-logs 路由 action_prefix 校验 + admin 日志中心「操作类型」下拉的取值依据，
// action 命名规范：admin.<子域>.<动作>，禁止在路由层拷贝此白名单
const ADMIN_SUB_CATEGORIES = {
    user: '用户管理',
    config: '配置管理',
    disk: '磁盘管理',
    vm: '虚拟机管理',
    lxc: 'LXC管理',
    package: '套餐管理',
    'package-group': '套餐分组',
    template: '模板管理',
    'os-template': 'OS模板',
    'email-template': '邮件模板',
    i18n: '国际化',
    cdk: 'CDK管理',
    backup: '备份管理',
    message: '消息管理',
    network: '网络管理',
    order: '订单开通',
    log: '日志管理',
    cache: '缓存管理',
    system: '系统操作',
    security: '安全设置'
};

// category -> SQL 条件（参数化），返回 [whereSql, args]
function buildAuditCategoryWhere(category) {
    switch (category) {
        case 'user_login': return ['action IN (?, ?)', ['user.login', 'user.register']];
        case 'vm_lxc': return ['(action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ? OR action LIKE ?)', ['vm.%', 'lxc.%', 'backup.%', 'snapshot.%', 'network.%', 'subnet.%']];
        case 'password': return ['action LIKE ?', ['password.%']];
        case 'purchase': return ['action IN (?, ?, ?, ?, ?, ?, ?)', ['order.vm', 'order.lxc', 'disk.purchase', 'disk.renew', 'disk.auto-renew', 'vm.renew', 'lxc.renew']];
        case 'disk': return ['action LIKE ?', ['disk.%']];
        case 'setting': return ['action LIKE ?', ['setting.%']];
        case 'security': return ['action LIKE ?', ['security.%']];
        case 'admin': return ['action LIKE ?', ['admin.%']];
        default: return ['', []];
    }
}

// 每用户日志保留上限清理（防写爆数据库，供定时任务调用）：
// 只处理超限用户（GROUP BY HAVING COUNT > keep），取该用户第 keep+1 条 id 作为 cutoff，
// 删除更旧的记录——走 user_id 索引，保留最新 keep 条不误删
// table 仅限本文件内部白名单（audit_logs / login_logs），非用户输入
const LOG_TRIM_TABLES = ['audit_logs', 'login_logs'];

// 单用户收敛：该用户超过 keep 条时删除更旧记录，返回删除数（不足 keep 条返回 0）
// audit_logs 的 admin.* 域日志由 trimAdminLogs 按全站独立上限管理，用户维度收敛排除，
// 防止「后台操作日志被 admin 账号自身用户操作挤掉 / 管理批量操作挤占用户记录」的相互挤占
async function trimUserOverflow(table, userId, keepCount) {
    if (LOG_TRIM_TABLES.indexOf(table) === -1) return 0;
    var keep = Math.max(parseInt(keepCount) || 5000, 100);
    var uid = parseInt(userId);
    if (!Number.isInteger(uid) || uid < 1) return 0;
    var excludeAdmin = table === 'audit_logs' ? " AND action NOT LIKE 'admin.%'" : '';
    var cutoff = await queryOne('SELECT id FROM ' + table + ' WHERE user_id = ?' + excludeAdmin + ' ORDER BY id DESC LIMIT 1 OFFSET ?', [uid, keep]);
    if (!cutoff) return 0;
    // execute 返回 [ResultSetHeader, fields]，需解构取 affectedRows（否则恒为 undefined）
    const [result] = await execute('DELETE FROM ' + table + ' WHERE user_id = ?' + excludeAdmin + ' AND id < ?', [uid, cutoff.id]);
    return result.affectedRows || 0;
}

// 后台操作日志全站独立收敛：admin.* 行按全站保留最新 keepAdminCount 条（与用户维度隔离，
// 独立配置 log:keep_admin_count，不被任何单用户的操作量挤掉）
async function trimAdminLogs(keepAdminCount) {
    var keep = Math.max(parseInt(keepAdminCount) || 5000, 100);
    var cutoff = await queryOne("SELECT id FROM audit_logs WHERE action LIKE 'admin.%' ORDER BY id DESC LIMIT 1 OFFSET ?", [keep]);
    if (!cutoff) return 0;
    const [result] = await execute("DELETE FROM audit_logs WHERE action LIKE 'admin.%' AND id < ?", [cutoff.id]);
    return result.affectedRows || 0;
}

async function trimTableOverflow(table, keepCount, keepAdminCount) {
    if (LOG_TRIM_TABLES.indexOf(table) === -1) return 0;
    var total = 0;
    // 后台操作日志按全站独立上限收敛（仅 audit_logs 有 admin 域）
    if (table === 'audit_logs') {
        total += await trimAdminLogs(keepAdminCount);
    }
    var keep = Math.max(parseInt(keepCount) || 5000, 100);
    var users = await queryAll('SELECT user_id FROM ' + table + ' GROUP BY user_id HAVING COUNT(*) > ?', [keep]);
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
    // 分页查询：传入 userId 锁死该用户（用户端隔离）；不传 userId 为全站视图（admin 端）。
    // scope 白名单：'user' 仅用户操作（排除 admin.*）/ 'admin' 仅后台操作 / 其他默认全部；
    // actionPrefix 为后台操作二级子域筛选（如 'admin.user.'，白名单由路由层基于 ADMIN_SUB_CATEGORIES 校验）
    getListWithPaging: async (params) => {
        var page = parseInt(params.page) || 1;
        var limit = Math.min(parseInt(params.limit) || 20, 200);  // D-3: LIMIT 上限保护
        var offset = (page - 1) * limit;
        var where = [];
        var args = [];
        if (params.userId) {
            where.push('user_id = ?');
            args.push(parseInt(params.userId));
        }
        if (params.scope === 'user') {
            where.push("action NOT LIKE 'admin.%'");
        } else if (params.scope === 'admin') {
            where.push("action LIKE 'admin.%'");
        }
        // 后台操作二级子域筛选（action_prefix 如 'admin.user.'；支持逗号分隔多值 'vm,lxc'，
        // 子域名白名单由路由层基于 ADMIN_SUB_CATEGORIES 校验，此处只拼 SQL）
        if (params.actionPrefix) {
            var prefixes = String(params.actionPrefix).split(',').filter(Boolean);
            if (prefixes.length > 0) {
                where.push('(' + prefixes.map(function() { return 'action LIKE ?'; }).join(' OR ') + ')');
                prefixes.forEach(function(p) { args.push('admin.' + p + '.%'); });
            }
        }
        if (params.filterUserId) {
            where.push('user_id = ?');
            args.push(parseInt(params.filterUserId));
        }
        if (params.username) {
            // 用户名模糊搜索（与 keyword 的 LIKE 风格一致）
            where.push('username LIKE ?');
            args.push('%' + String(params.username) + '%');
        }
        if (params.category && AUDIT_CATEGORIES.indexOf(params.category) !== -1) {
            var cat = buildAuditCategoryWhere(params.category);
            where.push(cat[0]);
            args = args.concat(cat[1]);
        }
        if (params.keyword) {
            where.push('(details LIKE ? OR ip_loc.location LIKE ?)');
            var kw = '%' + params.keyword + '%';
            args.push(kw, kw);
        }
        if (params.startDate) {
            where.push('created_at >= ?');
            args.push(params.startDate);
        }
        if (params.endDate) {
            where.push('created_at <= ?');
            args.push(params.endDate);
        }
        // 无筛选条件时不得生成空 WHERE（全站视图默认），否则 SQL 语法错误；
        // 关键字匹配归属地文本时需 JOIN ip_locations 持久缓存表（列表与 COUNT 同步）
        var joinClause = params.keyword ? ' LEFT JOIN ip_locations ip_loc ON ip_loc.ip = audit_logs.ip' : '';
        var whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';
        var totalRow = await queryOne('SELECT COUNT(*) AS total FROM audit_logs' + joinClause + whereClause, args);
        var rows = await queryAll(
            'SELECT id, user_id, username, action, resource_type, resource_id, audit_logs.ip, details, created_at FROM audit_logs' + joinClause + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?',
            args.concat([limit, offset])
        );
        return { rows: rows, total: totalRow.total, page: page, limit: limit };
    },
    deleteById: async (id) => {
        const [result] = await execute('DELETE FROM audit_logs WHERE id = ?', [parseInt(id) || 0]);
        return result;
    },
    // 批量删除（ids 长度白名单由路由层校验 1-500）
    batchDeleteByIds: async (ids) => {
        var list = ids.map(function(x) { return parseInt(x); }).filter(function(x) { return Number.isInteger(x) && x > 0; });
        if (list.length === 0) return { deleted: 0 };
        var placeholders = list.map(function() { return '?'; }).join(',');
        const [result] = await execute('DELETE FROM audit_logs WHERE id IN (' + placeholders + ')', list);
        return { deleted: result.affectedRows || 0 };
    },
    // 清空：scope 'user' 清用户操作（排除 admin.*）/ 'admin' 仅清后台操作 / 其他清全部
    clearAll: async (scope) => {
        if (scope === 'user') {
            const [r1] = await execute("DELETE FROM audit_logs WHERE action NOT LIKE 'admin.%'");
            return { deleted: r1.affectedRows || 0 };
        }
        if (scope === 'admin') {
            const [r2] = await execute("DELETE FROM audit_logs WHERE action LIKE 'admin.%'");
            return { deleted: r2.affectedRows || 0 };
        }
        const [r3] = await execute('DELETE FROM audit_logs');
        return { deleted: r3.affectedRows || 0 };
    },
    clearByUser: (userId) => execute('DELETE FROM audit_logs WHERE user_id = ?', [userId]),
    // 每用户保留最新 keepCount 条 + 后台操作按全站保留最新 keepAdminCount 条（供定时任务调用）
    trimOverflow: (keepCount, keepAdminCount) => trimTableOverflow('audit_logs', keepCount, keepAdminCount),
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
    // 分页查询：传入 userId 锁死该用户（用户端隔离）；不传 userId 为全站视图（admin 端）。
    // login_logs 无 admin 域概念，无 scope/actionPrefix 筛选
    getListWithPaging: async (params) => {
        var page = parseInt(params.page) || 1;
        var limit = Math.min(parseInt(params.limit) || 20, 200);  // D-3: LIMIT 上限保护
        var offset = (page - 1) * limit;
        var where = [];
        var args = [];
        if (params.userId) {
            where.push('user_id = ?');
            args.push(parseInt(params.userId));
        }
        if (params.filterUserId) {
            where.push('user_id = ?');
            args.push(parseInt(params.filterUserId));
        }
        if (params.username) {
            // 用户名模糊搜索（与 keyword 的 LIKE 风格一致）
            where.push('username LIKE ?');
            args.push('%' + String(params.username) + '%');
        }
        if (params.status && ['success', 'failed'].indexOf(params.status) !== -1) {
            where.push('status = ?');
            args.push(params.status);
        }
        if (params.keyword) {
            // 归属地表有 ip 列，裸 ip LIKE 会歧义，需限定 login_logs.ip
            where.push('(username LIKE ? OR login_logs.ip LIKE ? OR user_agent LIKE ? OR ip_loc.location LIKE ?)');
            var kw = '%' + params.keyword + '%';
            args.push(kw, kw, kw, kw);
        }
        if (params.startDate) {
            where.push('created_at >= ?');
            args.push(params.startDate);
        }
        if (params.endDate) {
            where.push('created_at <= ?');
            args.push(params.endDate);
        }
        // 无筛选条件时不得生成空 WHERE（全站视图默认），否则 SQL 语法错误；
        // 关键字匹配归属地文本时需 JOIN ip_locations 持久缓存表（列表与 COUNT 同步）
        var joinClause = params.keyword ? ' LEFT JOIN ip_locations ip_loc ON ip_loc.ip = login_logs.ip' : '';
        var whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';
        var totalRow = await queryOne('SELECT COUNT(*) AS total FROM login_logs' + joinClause + whereClause, args);
        var rows = await queryAll(
            'SELECT id, user_id, username, login_logs.ip, user_agent, status, details, created_at FROM login_logs' + joinClause + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?',
            args.concat([limit, offset])
        );
        return { rows: rows, total: totalRow.total, page: page, limit: limit };
    },
    deleteById: async (id) => {
        const [result] = await execute('DELETE FROM login_logs WHERE id = ?', [parseInt(id) || 0]);
        return result;
    },
    batchDeleteByIds: async (ids) => {
        var list = ids.map(function(x) { return parseInt(x); }).filter(function(x) { return Number.isInteger(x) && x > 0; });
        if (list.length === 0) return { deleted: 0 };
        var placeholders = list.map(function() { return '?'; }).join(',');
        const [result] = await execute('DELETE FROM login_logs WHERE id IN (' + placeholders + ')', list);
        return { deleted: result.affectedRows || 0 };
    },
    clearAll: async () => {
        const [result] = await execute('DELETE FROM login_logs');
        return { deleted: result.affectedRows || 0 };
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
        // I-5 修复：备忘录内容服务端净化（防未来改为 v-html 渲染时的存储型 XSS）
        const { sanitizeTitle, sanitizeMessageContent } = require('../utils/message-sanitize');
        const [result] = await execute(
            `INSERT INTO memos (user_id, title, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                memo.user_id,
                sanitizeTitle(memo.title),
                sanitizeMessageContent(memo.content),
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
        // I-5 修复：备忘录内容服务端净化（与 create 一致）
        const { sanitizeTitle, sanitizeMessageContent } = require('../utils/message-sanitize');
        if (updates.title !== undefined) updates.title = sanitizeTitle(updates.title);
        if (updates.content !== undefined) updates.content = sanitizeMessageContent(updates.content);
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
        // V4-05 修复：创建链路统一服务端净化（覆盖群发/LXC 通知/任务通知/管理员补发等全部路径）
        const { sanitizeTitle, sanitizeMessageContent, sanitizeLinkUrl, sanitizeLinkText } = require('../utils/message-sanitize');
        const [result] = await execute(
            `INSERT INTO messages (uid, title, content, type, send_type, link_url, link_text, batch_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                data.uid,
                sanitizeTitle(data.title),
                sanitizeMessageContent(data.content),
                data.type || 1,
                data.send_type || 1,
                sanitizeLinkUrl(data.link_url),
                sanitizeLinkText(data.link_text),
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

module.exports = { auditLogs, loginLogs, memos, messages, AUDIT_CATEGORIES, AUDIT_CATEGORY_NAMES, actionToCategory, ADMIN_SUB_CATEGORIES };
