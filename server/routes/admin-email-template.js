const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { EMAIL_TEMPLATES, EMAIL_TEMPLATE_CATEGORIES, GLOBAL_VARIABLES } = require('../constants/email-templates');
const { invalidateTemplateCache } = require('../services/email-template');
const { safeError } = require('../utils/safe-error');
// 审计字段级 diff 通用工具（规范第十一节：更新类审计从 DB 新旧状态 diff 生成，不从请求体拼接）
const { buildFieldDiff } = require('../utils/audit-diff');

const MAX_CONTENT_LEN = 65536;
const MAX_SUBJECT_LEN = 200;
const VAR_RE = /\{([a-z0-9_]+)\}/g;
const GLOBAL_VAR_NAMES = ['site_name', 'now', 'site_url'];

// 模板 code 白名单（防任意写；单一来源 constants/email-templates.js）
function isKnownCode(code) {
    return !!EMAIL_TEMPLATES[code];
}

/**
 * 变量白名单校验：subject/title/content 中出现的 {xxx} 必须 ∈ 模板声明变量 ∪ 通用变量
 * 防管理员拼错变量名（渲染时未知变量会原样出现在邮件里）
 */
function validateTemplateVars(code, subject, title, content) {
    var declared = {};
    (EMAIL_TEMPLATES[code].variables || []).forEach(function (v) { declared[v.name] = true; });
    GLOBAL_VAR_NAMES.forEach(function (n) { declared[n] = true; });

    var text = (subject || '') + (title || '') + (content || '');
    var bad = [];
    var m;
    var re = new RegExp(VAR_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
        if (!declared[m[1]] && bad.indexOf(m[1]) === -1) {
            bad.push(m[1]);
        }
    }
    return bad;
}

// 解析 DB 行 variables JSON → 数组
function parseVariables(row) {
    if (typeof row.variables === 'string') {
        try {
            row.variables = JSON.parse(row.variables || '[]') || [];
        } catch (e) {
            row.variables = [];
        }
    }
    if (!Array.isArray(row.variables)) row.variables = [];
    return row;
}

// GET /admin/email-templates - 模板列表（含分类/通用变量定义，前端变量面板使用）
router.get('/admin/email-templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const rows = await db.emailTemplates.getAll();
        res.json({
            templates: rows.map(parseVariables),
            categories: EMAIL_TEMPLATE_CATEGORIES,
            globalVariables: GLOBAL_VARIABLES
        });
    } catch (error) {
        console.error('获取邮件模板列表失败:', error.message);
        res.status(500).json({ error: '获取邮件模板失败' });
    }
});

// PUT /admin/email-templates/:code - 保存模板（版本自增 + 缓存失效 + 字段级审计）
router.put('/admin/email-templates/:code', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const code = String(req.params.code || '');
        if (!isKnownCode(code)) {
            return res.status(400).json({ error: '未知的邮件模板: ' + code });
        }
        const { subject, title, content } = req.body || {};
        if (typeof subject !== 'string' || subject.trim().length === 0 || subject.length > MAX_SUBJECT_LEN) {
            return res.status(400).json({ error: '邮件主题必填且不超过 ' + MAX_SUBJECT_LEN + ' 字符' });
        }
        if (typeof title !== 'string' || title.length > MAX_SUBJECT_LEN) {
            return res.status(400).json({ error: '副标题不超过 ' + MAX_SUBJECT_LEN + ' 字符' });
        }
        if (typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '邮件正文不能为空' });
        }
        if (content.length > MAX_CONTENT_LEN) {
            return res.status(400).json({ error: '邮件正文过长（上限 64KB）' });
        }
        // 变量白名单校验（防拼错变量）
        const badVars = validateTemplateVars(code, subject, title, content);
        if (badVars.length > 0) {
            return res.status(400).json({ error: '包含未声明变量: ' + badVars.map(function (v) { return '{' + v + '}'; }).join(', ') + '，请从可用变量中选择' });
        }

        // 保存前取旧记录（审计 diff 用）
        const oldTpl = await db.emailTemplates.getByCode(code);
        await db.emailTemplates.update(code, { subject: subject.trim(), title: (title || '').trim(), content: content }, req.user.id);
        // 失效模板缓存，让新内容立即生效
        await invalidateTemplateCache();

        // 操作审计：字段级 diff（正文只记「已更新」标记，不记录原文防刷屏）
        try {
            const { auditLog } = require('../utils/audit-log');
            const newTpl = await db.emailTemplates.getByCode(code);
            const changes = buildFieldDiff(oldTpl, newTpl, [
                { key: 'subject', label: '主题' },
                { key: 'title', label: '副标题' }
            ]);
            if (oldTpl && oldTpl.content !== newTpl.content) changes.push('正文 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.email-template.update', resourceType: 'email-template', resourceId: code, details: '更新邮件模板[' + newTpl.name + ']；变更:' + changes.join(', '), req });
            }
        } catch (e) {}

        res.json({ message: '模板保存成功', template: parseVariables(await db.emailTemplates.getByCode(code)) });
    } catch (error) {
        console.error('保存邮件模板失败:', error.message);
        res.status(500).json({ error: '保存模板失败' });
    }
});

// POST /admin/email-templates/:code/preview - 预览（用模板声明变量的示例值渲染完整邮件外壳）
// 入参为当前编辑内容（未保存），服务端复用渲染引擎（renderRaw）保证与真实发送一致
router.post('/admin/email-templates/:code/preview', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const code = String(req.params.code || '');
        const def = EMAIL_TEMPLATES[code];
        if (!def) {
            return res.status(400).json({ error: '未知的邮件模板: ' + code });
        }
        const { subject, title, content } = req.body || {};
        if (typeof subject !== 'string' || subject.trim().length === 0) {
            return res.status(400).json({ error: '邮件主题必填' });
        }
        if (typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '邮件正文不能为空' });
        }
        const badVars = validateTemplateVars(code, subject, title, content);
        if (badVars.length > 0) {
            return res.status(400).json({ error: '包含未声明变量: ' + badVars.map(function (v) { return '{' + v + '}'; }).join(', ') + '，请从可用变量中选择' });
        }

        // 用示例值构建预览变量（模板声明变量 + 通用变量）
        const exampleVars = {};
        (def.variables || []).forEach(function (v) { exampleVars[v.name] = v.example || '【' + v.label + '】'; });
        GLOBAL_VARIABLES.forEach(function (v) { exampleVars[v.name] = v.example || ''; });

        const { renderRaw } = require('../services/email-template');
        const { createEmailTemplate } = require('../utils/email');
        const rendered = await renderRaw({ code: code, subject: subject, title: title || '', content: content, variables: def.variables || [] }, exampleVars);
        const html = createEmailTemplate(rendered.title, rendered.content, rendered.site_name);
        res.json({ subject: rendered.subject, html: html });
    } catch (error) {
        console.error('预览邮件模板失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// POST /admin/email-templates/:code/reset - 恢复默认（常量注册表覆盖 + 缓存失效 + 审计）
router.post('/admin/email-templates/:code/reset', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const code = String(req.params.code || '');
        const def = EMAIL_TEMPLATES[code];
        if (!def) {
            return res.status(400).json({ error: '未知的邮件模板: ' + code });
        }
        await db.emailTemplates.resetToDefault(def, req.user.id);
        await invalidateTemplateCache();

        // 操作审计：恢复默认
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.email-template.reset', resourceType: 'email-template', resourceId: code, details: '恢复邮件模板默认[' + def.name + ']', req });
        } catch (e) {}

        res.json({ message: '已恢复默认模板', template: parseVariables(await db.emailTemplates.getByCode(code)) });
    } catch (error) {
        console.error('恢复邮件模板默认失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

module.exports = router;
