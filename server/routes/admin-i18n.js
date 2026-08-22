/**
 * i18n 管理端端点（全部 authMiddleware + adminMiddleware + 写路径限速 i18n_op）
 * 功能：新建/重命名/删除自定义语言、查看条目、批量保存覆盖、恢复默认
 * 解析公式与安全边界见 services/i18n.js；存储全 DB 单轨（语言文件永不写入）
 */

const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { safeError } = require('../utils/safe-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const i18nService = require('../services/i18n');

const MAX_NAME_LEN = 64;
const MAX_VALUE_LEN = 2000;
const MAX_BATCH = 500;

// 语言名称校验：trim 后 1-64 字符，禁控制字符与 < >（与其他站点配置输入同规则）
function validateName(name) {
    if (typeof name !== 'string') return '语言名称不能为空';
    const v = name.trim();
    if (v.length === 0 || v.length > MAX_NAME_LEN) {
        return '语言名称长度必须为 1-' + MAX_NAME_LEN + ' 个字符';
    }
    if (/[<>\u0000-\u001f]/.test(v)) return '语言名称不能包含 < > 或控制字符';
    return null;
}

// 写操作限速（统一规则 i18n_op，按用户）
async function rateLimit(req, res) {
    const opLimit = await checkConfiguredRateLimit('i18n_op', 'ratelimit:i18n-op:' + req.user.id);
    if (!opLimit.allowed) {
        res.status(429).json({ error: '操作过于频繁，请稍后再试', retryAfter: opLimit.retryAfter });
        return false;
    }
    return true;
}

// GET /admin/i18n/languages/:code/entries - 条目列表（全量逻辑 key：key/original/value/override/is_new）
router.get('/admin/i18n/languages/:code/entries', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const code = String(req.params.code || '');
        const lang = await db.i18n.getLanguage(code);
        if (!lang) return res.status(404).json({ error: '未知语言' });
        const entries = await i18nService.getLocaleEntries(code);
        res.json({
            language: { code: lang.code, name: lang.name, base_code: lang.base_code, is_system: !!lang.is_system },
            entries: entries
        });
    } catch (error) {
        console.error('获取 i18n 条目失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// POST /admin/i18n/languages - 新建自定义语言（复制源限定系统语言）
router.post('/admin/i18n/languages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!(await rateLimit(req, res))) return;
        const { name, base_code } = req.body || {};
        const nameErr = validateName(name);
        if (nameErr) return res.status(400).json({ error: nameErr });
        if (typeof base_code !== 'string' || !(await i18nService.isSupportedLocale(base_code))) {
            return res.status(400).json({ error: '复制源语言不存在' });
        }
        const base = await db.i18n.getLanguage(base_code);
        if (!base || !base.is_system) {
            return res.status(400).json({ error: '复制源仅支持内置系统语言' });
        }
        const result = await i18nService.createCustomLanguage({
            name: name.trim(),
            base_code: base_code,
            createdBy: req.user.id
        });
        // 操作审计：新建语言
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({
                userId: req.user.id, username: req.user.username, action: 'admin.i18n.lang-create',
                resourceType: 'i18n-language', resourceId: result.code,
                details: '新建语言[' + result.code + ' ' + name.trim() + ']，复制自[' + base_code + ']', req
            });
        } catch (e) {}
        res.json({ message: '语言创建成功', code: result.code });
    } catch (error) {
        if (error && error.status) return res.status(error.status).json({ error: error.message });
        console.error('新建 i18n 语言失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// PUT /admin/i18n/languages/:code - 重命名（仅自定义语言）
router.put('/admin/i18n/languages/:code', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!(await rateLimit(req, res))) return;
        const code = String(req.params.code || '');
        const lang = await db.i18n.getLanguage(code);
        if (!lang) return res.status(404).json({ error: '未知语言' });
        if (lang.is_system) return res.status(400).json({ error: '内置语言不可重命名' });
        const { name } = req.body || {};
        const nameErr = validateName(name);
        if (nameErr) return res.status(400).json({ error: nameErr });
        await db.i18n.updateName(code, name.trim());
        // 改名只影响语言列表的 name，无关词条内容——只失效列表，不重建各语言 locale/entries 包（避免过度失效）
        await i18nService.invalidateI18nLanguages();
        // 操作审计：重命名语言
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({
                userId: req.user.id, username: req.user.username, action: 'admin.i18n.lang-rename',
                resourceType: 'i18n-language', resourceId: code,
                details: '重命名语言[' + code + ']：' + lang.name + ' → ' + name.trim(), req
            });
        } catch (e) {}
        res.json({ message: '语言重命名成功' });
    } catch (error) {
        console.error('重命名 i18n 语言失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// DELETE /admin/i18n/languages/:code - 删除自定义语言
// 守卫：站点默认语言或仍有用户偏好引用 → 409（防悬挂引用）；级联删覆盖
router.delete('/admin/i18n/languages/:code', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!(await rateLimit(req, res))) return;
        const code = String(req.params.code || '');
        const lang = await db.i18n.getLanguage(code);
        if (!lang) return res.status(404).json({ error: '未知语言' });
        if (lang.is_system) return res.status(400).json({ error: '内置语言不可删除' });
        const using = await db.i18n.countUsersUsing(code);
        if (using && using.n > 0) {
            return res.status(409).json({ error: '仍有 ' + using.n + ' 个用户正在使用该语言，请先切换用户语言偏好' });
        }
        const siteLang = (await db.config.get('site:lang')) || 'zh-CN';
        if (siteLang === code) {
            return res.status(409).json({ error: '该语言为当前系统默认语言，请先切换' });
        }
        const name = lang.name;
        await db.i18n.deleteLanguage(code);
        // 删除语言：清语言列表 + 只删该语言内容（含移除其残留缓存）；快照隔离使其他语言不受影响
        await i18nService.invalidateI18nCache([code]);
        // 操作审计：删除语言
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({
                userId: req.user.id, username: req.user.username, action: 'admin.i18n.lang-delete',
                resourceType: 'i18n-language', resourceId: code,
                details: '删除语言[' + code + ' ' + name + ']及其全部覆盖', req
            });
        } catch (e) {}
        res.json({ message: '语言删除成功' });
    } catch (error) {
        console.error('删除 i18n 语言失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// PUT /admin/i18n/languages/:code/entries - 批量保存覆盖（'' 删覆盖恢复基线）
router.put('/admin/i18n/languages/:code/entries', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!(await rateLimit(req, res))) return;
        const code = String(req.params.code || '');
        const lang = await db.i18n.getLanguage(code);
        if (!lang) return res.status(404).json({ error: '未知语言' });
        const body = req.body || {};
        if (!Array.isArray(body.entries)) {
            return res.status(400).json({ error: 'entries 必须是数组' });
        }
        if (body.entries.length > MAX_BATCH) {
            return res.status(400).json({ error: '单次最多保存 ' + MAX_BATCH + ' 个词条' });
        }
        // 基线 key 白名单：拒绝任意 key（防覆盖表脏数据/注入非法键）
        const baselineKeys = await i18nService.getBaselineKeys(code);
        const keySet = {};
        baselineKeys.forEach(function (k) { keySet[k] = true; });
        const deduped = {};
        for (const e of body.entries) {
            if (!e || typeof e.key !== 'string' || !keySet[e.key]) {
                return res.status(400).json({ error: '包含无效词条 key' });
            }
            if (typeof e.value !== 'string' || e.value.length > MAX_VALUE_LEN) {
                return res.status(400).json({ error: '词条值必须是字符串且不超过 ' + MAX_VALUE_LEN + ' 字符' });
            }
            deduped[e.key] = e.value;
        }
        const entries = Object.keys(deduped).map(function (k) { return { key: k, value: deduped[k] }; });
        await db.i18n.saveOverrides(code, entries, req.user.id);
        await i18nService.invalidateI18nCache([code]);
        // 操作审计：批量保存（只记 key 列表摘要，不记内容防刷屏）
        try {
            const { auditLog } = require('../utils/audit-log');
            const listStr = entries.slice(0, 20).map(function (e) { return e.key; }).join(', ');
            const suffix = entries.length > 20 ? '…(+' + (entries.length - 20) + ')' : '';
            await auditLog({
                userId: req.user.id, username: req.user.username, action: 'admin.i18n.entry-update',
                resourceType: 'i18n-language', resourceId: code,
                details: '保存语言[' + code + ' ' + lang.name + ']词条覆盖 ' + entries.length + ' 条（' + listStr + suffix + '）', req
            });
        } catch (e) {}
        res.json({ message: '保存成功' });
    } catch (error) {
        console.error('保存 i18n 词条失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// POST /admin/i18n/languages/:code/reset - 清空全部覆盖（恢复基线：系统=内置文件 / 自定义=快照+源文件）
router.post('/admin/i18n/languages/:code/reset', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (!(await rateLimit(req, res))) return;
        const code = String(req.params.code || '');
        const lang = await db.i18n.getLanguage(code);
        if (!lang) return res.status(404).json({ error: '未知语言' });
        await db.i18n.deleteOverrides(code);
        await i18nService.invalidateI18nCache([code]);
        // 操作审计：恢复默认
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({
                userId: req.user.id, username: req.user.username, action: 'admin.i18n.entry-reset',
                resourceType: 'i18n-language', resourceId: code,
                details: '恢复语言[' + code + ' ' + lang.name + ']词条（清空全部覆盖）', req
            });
        } catch (e) {}
        res.json({ message: '已恢复默认' });
    } catch (error) {
        console.error('恢复 i18n 默认失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

module.exports = router;
