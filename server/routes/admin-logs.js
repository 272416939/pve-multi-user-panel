// server/routes/admin-logs.js - admin 全站日志管理（操作日志/登录日志 全局视图 + 导出/删除/清空）
// 安全设计：authMiddleware + adminMiddleware；数据范围为全站（不锁 req.user.id），
// 与用户端 routes/log.js（锁 req.user.id）互补；管理员删除/清空操作自身亦写入审计（admin.log.*）
const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');
// 审计分类/子域白名单单一来源：均来自 db-messaging.js，禁止本地拷贝
const { AUDIT_CATEGORIES, AUDIT_CATEGORY_NAMES, actionToCategory, ADMIN_SUB_CATEGORIES } = require('../api/db-messaging');
// 日期参数校验单一来源：utils/date.js（admin-os-template.js 复用同一实现）
const { normalizeDateParam } = require('../utils/date');
const { getIpLocations } = require('../services/ip-location');
// 日志详情/CSV 组装统一走 utils/log-format.js（与用户端共用，禁止双份拷贝）
const { buildRowDetail, csvEscape, csvTime } = require('../utils/log-format');

// 所有端点都需要管理员权限
// 路径前缀限定：只拦截 /admin/* 请求，避免拦截所有经过的 /api 请求（express 前缀挂载陷阱）
router.use('/admin', authMiddleware, adminMiddleware);

// scope 白名单：user = 仅用户操作（排除 admin.*）/ admin = 仅后台操作 / all = 全部
const SCOPE_WHITELIST = ['user', 'admin', 'all'];

// action_prefix 二级子域校验（支持逗号分隔多值，如 'vm,lxc'），非法返回 null
function validateActionPrefix(prefix) {
    if (!prefix) return true;
    var parts = String(prefix).split(',');
    for (var i = 0; i < parts.length; i++) {
        var p = parts[i].trim();
        if (!p || ADMIN_SUB_CATEGORIES[p] === undefined) return false;
    }
    return true;
}

// 后台操作二级子域中文名（单一来源 ADMIN_SUB_CATEGORIES）：action 形如 admin.<子域>.<动作>，
// 列表「操作类型」列与 CSV 导出共用，禁止前端自行拷贝映射
function subCategoryName(action) {
    var parts = String(action || '').split('.');
    if (parts.length >= 3 && parts[0] === 'admin') {
        return ADMIN_SUB_CATEGORIES[parts[1]] || '';
    }
    return '';
}

// 校验操作日志通用筛选参数（列表与导出共用），返回规范化参数对象；非法返回 { error }
function buildOperationFilters(req) {
    var scope = (req.query.scope || 'all').trim();
    if (SCOPE_WHITELIST.indexOf(scope) === -1) return { error: '无效的查询范围' };
    var category = (req.query.category || '').trim();
    if (category && AUDIT_CATEGORIES.indexOf(category) === -1) return { error: '无效的操作类型' };
    var actionPrefix = (req.query.action_prefix || '').trim();
    if (!validateActionPrefix(actionPrefix)) return { error: '无效的操作类型' };
    var keyword = (req.query.keyword || '').trim();
    if (keyword.length > 50) return { error: '搜索关键词过长' };
    var filterUserId = (req.query.user_id || '').trim();
    if (filterUserId && !/^\d+$/.test(filterUserId)) return { error: '无效的用户ID' };
    var username = (req.query.username || '').trim();
    if (username.length > 64) return { error: '用户名过长' };
    var startDate = normalizeDateParam(req.query.start_date || '', false);
    var endDate = normalizeDateParam(req.query.end_date || '', true);
    if (startDate === null || endDate === null) return { error: '无效的日期格式' };
    return {
        scope: scope, category: category, actionPrefix: actionPrefix,
        filterUserId: filterUserId, username: username,
        keyword: keyword, startDate: startDate, endDate: endDate
    };
}

// 校验登录日志通用筛选参数（列表与导出共用），返回规范化参数对象；非法返回 { error }
function buildLoginFilters(req) {
    var status = (req.query.status || '').trim();
    if (status && ['success', 'failed'].indexOf(status) === -1) return { error: '无效的登录状态' };
    var keyword = (req.query.keyword || '').trim();
    if (keyword.length > 50) return { error: '搜索关键词过长' };
    var filterUserId = (req.query.user_id || '').trim();
    if (filterUserId && !/^\d+$/.test(filterUserId)) return { error: '无效的用户ID' };
    var username = (req.query.username || '').trim();
    if (username.length > 64) return { error: '用户名过长' };
    var startDate = normalizeDateParam(req.query.start_date || '', false);
    var endDate = normalizeDateParam(req.query.end_date || '', true);
    if (startDate === null || endDate === null) return { error: '无效的日期格式' };
    return {
        status: status, filterUserId: filterUserId, username: username,
        keyword: keyword, startDate: startDate, endDate: endDate
    };
}

// 审计埋点统一封装（删除/清空日志属敏感写操作，按规范十一埋点；失败不影响主流程）
function auditLogAction(req, action, details) {
    try {
        const { auditAction } = require('../utils/audit-log');
        auditAction(req, action, details);
    } catch (_) { /* 审计失败不影响主流程 */ }
}

// ========== 操作日志列表（全站） ==========
router.get('/admin/logs/operation', async (req, res) => {
    try {
        var filters = buildOperationFilters(req);
        if (filters.error) return res.status(400).json({ error: filters.error });

        var result = await db.auditLogs.getListWithPaging({
            page: req.query.page,
            limit: req.query.limit,
            scope: filters.scope,
            category: filters.category,
            actionPrefix: filters.actionPrefix,
            filterUserId: filters.filterUserId,
            username: filters.username,
            keyword: filters.keyword,
            startDate: filters.startDate,
            endDate: filters.endDate
        });

        // 操作者 IP 归属地批量解析（全部行）
        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }));

        result.rows = result.rows.map(function(r) {
            return {
                id: r.id,
                user_id: r.user_id,
                username: r.username,
                action: r.action,
                category_name: AUDIT_CATEGORY_NAMES[actionToCategory(r.action)] || '其他',
                sub_category_name: subCategoryName(r.action),
                detail_text: buildRowDetail(r, locMap),
                created_at: r.created_at
            };
        });

        // 保留上限（前端 Tips 提示用）：用户操作按用户维度 / 后台操作按全站维度
        var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
        var keepAdminCount = parseInt(await db.config.get('log:keep_admin_count')) || 5000;
        res.json({ rows: result.rows, total: result.total, page: result.page, limit: result.limit, keep_count: keepCount, keep_admin_count: keepAdminCount });
    } catch (e) {
        console.error('[admin-logs] 操作日志查询失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 登录日志列表（全站） ==========
router.get('/admin/logs/login', async (req, res) => {
    try {
        var filters = buildLoginFilters(req);
        if (filters.error) return res.status(400).json({ error: filters.error });

        var result = await db.loginLogs.getListWithPaging({
            page: req.query.page,
            limit: req.query.limit,
            status: filters.status,
            filterUserId: filters.filterUserId,
            username: filters.username,
            keyword: filters.keyword,
            startDate: filters.startDate,
            endDate: filters.endDate
        });

        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }));

        result.rows = result.rows.map(function(r) {
            return {
                id: r.id,
                user_id: r.user_id,
                username: r.username,
                ip: r.ip,
                ip_location: locMap[r.ip] || '',
                user_agent: r.user_agent,
                status: r.status,
                details: r.details,
                created_at: r.created_at
            };
        });

        var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
        res.json({ rows: result.rows, total: result.total, page: result.page, limit: result.limit, keep_count: keepCount });
    } catch (e) {
        console.error('[admin-logs] 登录日志查询失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 导出（CSV，带 BOM + 公式注入防护 + 零宽空格防吞秒） ==========
router.get('/admin/logs/operation/export', async (req, res) => {
    try {
        var filters = buildOperationFilters(req);
        if (filters.error) return res.status(400).json({ error: filters.error });

        var result = await db.auditLogs.getListWithPaging({
            page: 1,
            limit: 2000,
            scope: filters.scope,
            category: filters.category,
            actionPrefix: filters.actionPrefix,
            filterUserId: filters.filterUserId,
            username: filters.username,
            keyword: filters.keyword,
            startDate: filters.startDate,
            endDate: filters.endDate
        });
        var rows = result.rows;

        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }));

        // 操作类型列与列表一致：后台操作显示子域中文名（如 admin.config.log → 配置管理），
        // 具体动作在详情列；非后台操作显示完整 action
        var csvRows = ['用户,操作类型,详情,操作时间'];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            csvRows.push([
                csvEscape(r.username),
                csvEscape(subCategoryName(r.action) || r.action),
                csvEscape(buildRowDetail(r, locMap)),
                csvEscape(csvTime(r.created_at))
            ].join(','));
        }
        var csv = '\uFEFF' + csvRows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=admin_operation_logs.csv');
        res.send(csv);
    } catch (e) {
        console.error('[admin-logs] 操作日志导出失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/admin/logs/login/export', async (req, res) => {
    try {
        var filters = buildLoginFilters(req);
        if (filters.error) return res.status(400).json({ error: filters.error });

        var result = await db.loginLogs.getListWithPaging({
            page: 1,
            limit: 2000,
            status: filters.status,
            filterUserId: filters.filterUserId,
            username: filters.username,
            keyword: filters.keyword,
            startDate: filters.startDate,
            endDate: filters.endDate
        });
        var rows = result.rows;

        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }));

        var csvRows = ['用户,IP地址,归属地,用户代理,登陆状态,时间'];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            csvRows.push([
                csvEscape(r.username),
                csvEscape(r.ip),
                csvEscape(locMap[r.ip] || ''),
                csvEscape(r.user_agent),
                csvEscape(r.status === 'success' ? '登录成功' : '登录失败'),
                csvEscape(csvTime(r.created_at))
            ].join(','));
        }
        var csv = '\uFEFF' + csvRows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=admin_login_logs.csv');
        res.send(csv);
    } catch (e) {
        console.error('[admin-logs] 登录日志导出失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 单条删除 ==========
router.delete('/admin/logs/operation/:id', async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的日志 ID' });
        var result = await db.auditLogs.deleteById(id);
        if (!result.affectedRows) return res.status(404).json({ error: '日志不存在' });
        auditLogAction(req, 'admin.log.delete', '删除操作日志 #' + id);
        res.json({ success: true, message: '日志已删除' });
    } catch (e) {
        console.error('[admin-logs] 删除操作日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.delete('/admin/logs/login/:id', async (req, res) => {
    try {
        var id = parseInt(req.params.id);
        if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: '无效的日志 ID' });
        var result = await db.loginLogs.deleteById(id);
        if (!result.affectedRows) return res.status(404).json({ error: '日志不存在' });
        auditLogAction(req, 'admin.log.delete', '删除登录日志 #' + id);
        res.json({ success: true, message: '日志已删除' });
    } catch (e) {
        console.error('[admin-logs] 删除登录日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 批量删除 ==========
router.post('/admin/logs/operation/batch-delete', async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
            return res.status(400).json({ error: 'ids 必须是 1-500 长度的数组' });
        }
        var result = await db.auditLogs.batchDeleteByIds(ids);
        auditLogAction(req, 'admin.log.delete', '批量删除操作日志 ' + result.deleted + ' 条');
        res.json({ success: true, message: '已删除 ' + result.deleted + ' 条', deleted: result.deleted });
    } catch (e) {
        console.error('[admin-logs] 批量删除操作日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/admin/logs/login/batch-delete', async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
            return res.status(400).json({ error: 'ids 必须是 1-500 长度的数组' });
        }
        var result = await db.loginLogs.batchDeleteByIds(ids);
        auditLogAction(req, 'admin.log.delete', '批量删除登录日志 ' + result.deleted + ' 条');
        res.json({ success: true, message: '已删除 ' + result.deleted + ' 条', deleted: result.deleted });
    } catch (e) {
        console.error('[admin-logs] 批量删除登录日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 清空（高危，需确认串 + 限速；操作日志按 scope 区分用户操作/后台操作） ==========
router.post('/admin/logs/operation/clear', async (req, res) => {
    try {
        var scope = (req.body.scope || 'user').trim();
        if (SCOPE_WHITELIST.indexOf(scope) === -1) return res.status(400).json({ error: '无效的查询范围' });
        var confirmStr = scope === 'admin' ? 'CLEAR_ALL_ADMIN_LOGS' : 'CLEAR_ALL_OPERATION_LOGS';
        if (req.body.confirm !== confirmStr) {
            return res.status(400).json({ error: '确认串不正确' });
        }
        var limit = await checkConfiguredRateLimit('log_clear_op', 'log-clear-op:' + req.user.id);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: limit.retryAfter });
        var result = await db.auditLogs.clearAll(scope);
        var scopeText = scope === 'admin' ? '后台操作日志' : (scope === 'user' ? '用户操作日志' : '全部操作日志');
        auditLogAction(req, 'admin.log.clear', '清空' + scopeText + ' ' + result.deleted + ' 条');
        res.json({ message: scopeText + '已清空 ' + result.deleted + ' 条', deleted: result.deleted });
    } catch (e) {
        console.error('[admin-logs] 清空操作日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/admin/logs/login/clear', async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_ALL_LOGIN_LOGS') {
            return res.status(400).json({ error: '确认串不正确' });
        }
        var limit = await checkConfiguredRateLimit('log_clear_login', 'log-clear-login:' + req.user.id);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: limit.retryAfter });
        var result = await db.loginLogs.clearAll();
        auditLogAction(req, 'admin.log.clear', '清空登录日志 ' + result.deleted + ' 条');
        res.json({ message: '登录日志已清空 ' + result.deleted + ' 条', deleted: result.deleted });
    } catch (e) {
        console.error('[admin-logs] 清空登录日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
