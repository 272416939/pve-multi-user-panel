// server/routes/log.js - dashboard 日志查询/导出/清空
// 安全设计：authMiddleware + 数据范围锁死 req.user.id（用户只能看/清自己的日志）
const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware } = require('../middleware/auth');
const { checkRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');
// 审计分类单一来源：白名单/中文名/action→分类映射均来自 db-messaging.js，禁止本地拷贝
const { AUDIT_CATEGORIES, AUDIT_CATEGORY_NAMES, actionToCategory } = require('../api/db-messaging');
const { getIpLocations } = require('../services/ip-location');

// details 兼容三种形态：展示文本 / JSON 对象（旧记录）/ JSON 字符串
function buildDetailText(details) {
    if (!details) return '';
    var trimmed = String(details).trim();
    if (trimmed.indexOf('{') === 0) {
        try {
            var obj = JSON.parse(trimmed);
            if (obj && typeof obj === 'object') {
                if (typeof obj.text === 'string') return obj.text;
                return JSON.stringify(obj);
            }
        } catch (_) { /* 非 JSON，按原文展示 */ }
    }
    return trimmed;
}

// 组装 user.login 行详情：登录成功,帐号:xxx,登录IP:ip:port>归属地:xxx
function buildLoginDetailText(obj, location) {
    var statusText = obj.status === 'failed' ? '登录失败' : '登录成功';
    var parts = [statusText];
    if (obj.account) parts.push('帐号:' + obj.account);
    if (obj.ip) {
        var ipPart = obj.ip;
        if (location) ipPart += '>归属地:' + location;
        parts.push('登录IP:' + ipPart);
    }
    if (obj.device && !obj.account && !obj.ip) parts.push('设备:' + obj.device);
    return parts.join(',');
}

// 组装操作日志详情展示文本：
// - user.login 行按「登录成功,帐号:xxx,登录IP:ip>归属地:xxx」格式（已含归属地，不再加前缀）
// - 其余行取文本（兼容旧 JSON 记录）并加操作者 IP 归属地前缀：IP(归属地) 详情
// - 列表与导出共用
function buildRowDetail(r, locMap) {
    if (r.action === 'user.login') {
        // user.login 详情已含 登录IP:...>归属地:...，加前缀会重复，直接返回
        try {
            var obj = JSON.parse(r.details || '{}');
            if (obj && typeof obj === 'object') {
                var rawIp = String(obj.ip || '').replace(/:\d+$/, '');
                return buildLoginDetailText(obj, locMap[rawIp] || '');
            }
            return buildDetailText(r.details);
        } catch (_) {
            return buildDetailText(r.details);
        }
    }
    var detailText = buildDetailText(r.details);
    var ipPrefix = '';
    if (r.ip) {
        ipPrefix = r.ip + (locMap[r.ip] ? '(' + locMap[r.ip] + ') ' : ' ');
    }
    return ipPrefix + detailText;
}

// ========== 操作日志列表 ==========
router.get('/logs/operation', authMiddleware, async (req, res) => {
    try {
        var category = (req.query.category || '').trim();
        if (category && AUDIT_CATEGORIES.indexOf(category) === -1) {
            return res.status(400).json({ error: '无效的操作类型' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });

        var result = await db.auditLogs.getListWithPaging({
            userId: req.user.id,
            page: req.query.page,
            limit: req.query.limit,
            category: category,
            keyword: keyword
        });

        // 操作者 IP 归属地批量解析（全部行）
        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }));

        result.rows = result.rows.map(function(r) {
            return {
                id: r.id,
                username: r.username,
                action: r.action,
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
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 登录日志列表 ==========
router.get('/logs/login', authMiddleware, async (req, res) => {
    try {
        var status = (req.query.status || '').trim();
        if (status && ['success', 'failed'].indexOf(status) === -1) {
            return res.status(400).json({ error: '无效的登录状态' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });

        var result = await db.loginLogs.getListWithPaging({
            userId: req.user.id,
            page: req.query.page,
            limit: req.query.limit,
            status: status,
            keyword: keyword
        });

        var locMap = await getIpLocations(result.rows.map(function(r) { return r.ip; }));

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
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 导出（CSV，带 BOM 保证 Excel 中文不乱码） ==========
// V4-06 修复：字段转义下沉到 utils/csv.js（引号转义 + 公式注入防护），此处保留包装保持调用点不变
const { escapeCsvField } = require('../utils/csv');
function csvEscape(v) {
    return escapeCsvField(v);
}

// Excel/WPS 打开 CSV 时会把 yyyy-MM-dd HH:mm:ss 自动识别为日期并隐藏秒（默认格式 yyyy/m/d h:mm），
// 时间字段追加零宽空格(U+200B)强制按文本原样显示，保证秒可见
const CSV_TIME_SUFFIX = '\u200B';

// 导出时间字段（含秒）+ 零宽空格防 Excel 吞秒
function csvTime(v) {
    return v ? String(v) + CSV_TIME_SUFFIX : '';
}

router.get('/logs/operation/export', authMiddleware, async (req, res) => {
    try {
        var category = (req.query.category || '').trim();
        if (category && AUDIT_CATEGORIES.indexOf(category) === -1) {
            return res.status(400).json({ error: '无效的操作类型' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });

        var result = await db.auditLogs.getListWithPaging({
            userId: req.user.id,
            page: 1,
            limit: 2000,
            category: category,
            keyword: keyword
        });
        var rows = result.rows;

        // 操作者 IP 归属地批量解析（全部行，详情含 IP 归属地前缀）
        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }));

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
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/logs/login/export', authMiddleware, async (req, res) => {
    try {
        var status = (req.query.status || '').trim();
        if (status && ['success', 'failed'].indexOf(status) === -1) {
            return res.status(400).json({ error: '无效的登录状态' });
        }
        var keyword = (req.query.keyword || '').trim();
        if (keyword.length > 50) return res.status(400).json({ error: '搜索关键词过长' });

        var result = await db.loginLogs.getListWithPaging({
            userId: req.user.id,
            page: 1,
            limit: 2000,
            status: status,
            keyword: keyword
        });
        var rows = result.rows;

        var locMap = await getIpLocations(rows.map(function(r) { return r.ip; }));

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
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 清空（二次确认串 + 限速 + 仅清当前用户） ==========
router.post('/logs/operation/clear', authMiddleware, async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_OPERATION_LOGS') {
            return res.status(400).json({ error: '确认串不正确' });
        }
        var limit = await checkRateLimit('log-clear-op:' + req.user.id, 5, 60000);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        await db.auditLogs.clearByUser(req.user.id);
        res.json({ message: '操作日志已清空' });
    } catch (e) {
        console.error('[logs] 清空操作日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/logs/login/clear', authMiddleware, async (req, res) => {
    try {
        if (req.body.confirm !== 'CLEAR_LOGIN_LOGS') {
            return res.status(400).json({ error: '确认串不正确' });
        }
        var limit = await checkRateLimit('log-clear-login:' + req.user.id, 5, 60000);
        if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        await db.loginLogs.clearByUser(req.user.id);
        res.json({ message: '登录日志已清空' });
    } catch (e) {
        console.error('[logs] 清空登录日志失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
