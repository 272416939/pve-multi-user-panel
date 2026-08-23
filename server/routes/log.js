// server/routes/log.js - dashboard 日志查询/导出/清空
// 安全设计：authMiddleware + 数据范围锁死 req.user.id（用户只能看/清自己的日志）
const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware } = require('../middleware/auth');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');
// 审计分类单一来源：白名单/中文名/action→分类映射均来自 db-messaging.js，禁止本地拷贝
const { AUDIT_CATEGORIES, AUDIT_CATEGORY_NAMES, actionToCategory } = require('../api/db-messaging');
const { getIpLocations } = require('../services/ip-location');
// 日志详情/CSV 组装统一走 utils/log-format.js（单一来源，admin 端复用，禁止本地拷贝）
const { buildRowDetail, csvEscape, csvTime } = require('../utils/log-format');

// ========== 操作日志列表 ==========
router.get('/logs/operation', authMiddleware, async (req, res) => {
    try {
        var category = (req.query.category || '').trim();
        if (category && AUDIT_CATEGORIES.indexOf(category) === -1) {
            return res.status(400).json({ error: '无效的操作类型', code: 'INVALID_ACTION' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长', code: 'KEYWORD_TOO_LONG' });

        var result = await db.auditLogs.getListWithPaging({
            userId: req.user.id,
            page: req.query.page,
            limit: req.query.limit,
            category: category,
            keyword: keyword
        });

        // 操作者 IP 归属地批量解析（全部行；500ms 预算不阻塞首屏，未命中外呼后台写回缓存）
        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }), { timeBudgetMs: 500 });

        result.rows = result.rows.map(function(r) {
            return {
                id: r.id,
                username: r.username,
                action: r.action,
                category_key: actionToCategory(r.action),
                category_name: AUDIT_CATEGORY_NAMES[actionToCategory(r.action)] || '其他',
                detail_text: buildRowDetail(r, locMap),
                created_at: r.created_at
            };
        });

        // 保留上限（前端 Tips 提示用）
        var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
        res.json({ rows: result.rows, total: result.total, page: result.page, limit: result.limit, keep_count: keepCount });
    } catch (e) {
        console.error('[logs] 操作日志查询失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ========== 登录日志列表 ==========
router.get('/logs/login', authMiddleware, async (req, res) => {
    try {
        var status = (req.query.status || '').trim();
        if (status && ['success', 'failed'].indexOf(status) === -1) {
            return res.status(400).json({ error: '无效的登录状态', code: 'INVALID_LOGIN_STATE' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长', code: 'KEYWORD_TOO_LONG' });

        var result = await db.loginLogs.getListWithPaging({
            userId: req.user.id,
            page: req.query.page,
            limit: req.query.limit,
            status: status,
            keyword: keyword
        });

        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }), { timeBudgetMs: 500 });

        result.rows = result.rows.map(function(r) {
            return {
                id: r.id,
                username: r.username,
                ip: r.ip,
                ip_location: locMap[r.ip] || '',
                user_agent: r.user_agent,
                status: r.status,
                details: r.details,
                created_at: r.created_at
            };
        });

        // 保留上限（前端 Tips 提示用）
        var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
        res.json({ rows: result.rows, total: result.total, page: result.page, limit: result.limit, keep_count: keepCount });
    } catch (e) {
        console.error('[logs] 登录日志查询失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ========== 导出（CSV，带 BOM 保证 Excel 中文不乱码） ==========
// V4-06 修复：字段转义下沉到 utils/csv.js（引号转义 + 公式注入防护），
// 时间零宽空格防吞秒统一在 utils/log-format.js，此处直接复用

router.get('/logs/operation/export', authMiddleware, async (req, res) => {
    try {
        var category = (req.query.category || '').trim();
        if (category && AUDIT_CATEGORIES.indexOf(category) === -1) {
            return res.status(400).json({ error: '无效的操作类型', code: 'INVALID_ACTION' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长', code: 'KEYWORD_TOO_LONG' });

        var result = await db.auditLogs.getListWithPaging({
            userId: req.user.id,
            page: 1,
            limit: 2000,
            category: category,
            keyword: keyword
        });
        var rows = result.rows;

        // 操作者 IP 归属地批量解析（全部行，详情含 IP 归属地前缀；2s 预算防大量未命中外呼拖慢导出）
        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }), { timeBudgetMs: 2000 });

        var csvRows = ['用户,操作类型,详情,操作时间'];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            csvRows.push([
                csvEscape(r.username),
                csvEscape(AUDIT_CATEGORY_NAMES[actionToCategory(r.action)] || '其他'),
                csvEscape(buildRowDetail(r, locMap)),
                csvEscape(csvTime(r.created_at))
            ].join(','));
        }
        var csv = '\uFEFF' + csvRows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=operation_logs.csv');
        res.send(csv);
    } catch (e) {
        console.error('[logs] 操作日志导出失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.get('/logs/login/export', authMiddleware, async (req, res) => {
    try {
        var status = (req.query.status || '').trim();
        if (status && ['success', 'failed'].indexOf(status) === -1) {
            return res.status(400).json({ error: '无效的登录状态', code: 'INVALID_LOGIN_STATE' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长', code: 'KEYWORD_TOO_LONG' });

        var result = await db.loginLogs.getListWithPaging({
            userId: req.user.id,
            page: 1,
            limit: 2000,
            status: status,
            keyword: keyword
        });
        var rows = result.rows;

        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }), { timeBudgetMs: 2000 });

        var csvRows = ['IP地址,归属地,用户代理,登陆状态,时间'];
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            csvRows.push([
                csvEscape(r.ip),
                csvEscape(locMap[r.ip] || ''),
                csvEscape(r.user_agent),
                csvEscape(r.status === 'success' ? '登录成功' : '登录失败'),
                csvEscape(csvTime(r.created_at))
            ].join(','));
        }
        var csv = '\uFEFF' + csvRows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=login_logs.csv');
        res.send(csv);
    } catch (e) {
        console.error('[logs] 登录日志导出失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// ========== 清空（二次确认串 + 限速 + 仅清当前用户） ==========
router.post('/logs/operation/clear', authMiddleware, async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_OPERATION_LOGS') {
            return res.status(400).json({ error: '确认串不正确', code: 'CONFIRM_MISMATCH' });
        }
        var limit = await checkConfiguredRateLimit('log_clear_op', 'log-clear-op:' + req.user.id);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_OP', retryAfter: limit.retryAfter });
        await db.auditLogs.clearByUser(req.user.id);
        res.json({ message: '操作日志已清空' });
    } catch (e) {
        console.error('[logs] 清空操作日志失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.post('/logs/login/clear', authMiddleware, async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_LOGIN_LOGS') {
            return res.status(400).json({ error: '确认串不正确', code: 'CONFIRM_MISMATCH' });
        }
        var limit = await checkConfiguredRateLimit('log_clear_login', 'log-clear-login:' + req.user.id);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试', code: 'RATE_LIMITED_OP', retryAfter: limit.retryAfter });
        await db.loginLogs.clearByUser(req.user.id);
        res.json({ message: '登录日志已清空' });
    } catch (e) {
        console.error('[logs] 清空登录日志失败:', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
