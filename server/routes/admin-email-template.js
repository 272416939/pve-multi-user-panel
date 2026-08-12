const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { EMAIL_TEMPLATES, EMAIL_TEMPLATE_CATEGORIES, GLOBAL_VARIABLES, EMAIL_SHELL_PARAMS } = require('../constants/email-templates');
const { invalidateTemplateCache } = require('../services/email-template');
const { invalidateEmailShellCache } = require('../utils/email');
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
        // 注意：site_name 不预设 example（渲染引擎自动读取 DB 站点名），保证预览与真实发送一致
        const exampleVars = {};
        (def.variables || []).forEach(function (v) { exampleVars[v.name] = v.example || '【' + v.label + '】'; });
        GLOBAL_VARIABLES.forEach(function (v) {
            if (v.name !== 'site_name') exampleVars[v.name] = v.example || '';
        });

        const { renderRaw } = require('../services/email-template');
        const { createEmailTemplate } = require('../utils/email');
        const rendered = await renderRaw({ code: code, subject: subject, title: title || '', content: content, variables: def.variables || [] }, exampleVars);
        // shell 覆盖：预览「邮件外壳样式」编辑中的未保存参数（部分字段与 DB 值合并，缺省回退默认）
        const shell = (req.body && req.body.shell) || undefined;
        const html = await createEmailTemplate(rendered.title, rendered.content, rendered.site_name, shell);
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

// ==================== 邮件外壳样式（参数化 + 高级自定义 CSS） ====================

// 校验单个 shell 参数（颜色/数字/文案长度），返回错误文案或 null
function validateShellParam(p, value) {
    if (value === undefined || value === null) return null;
    if (p.type === 'color') {
        if (!/^#[0-9a-fA-F]{6}$/.test(String(value))) {
            return p.label + ' 须为 #RRGGBB 格式颜色';
        }
    } else if (p.type === 'number') {
        var num = parseInt(value);
        if (!Number.isInteger(num) || num < (p.min != null ? p.min : 0) || num > (p.max != null ? p.max : 100000)) {
            return p.label + ' 须为 ' + (p.min != null ? p.min : 0) + '-' + (p.max != null ? p.max : 100000) + ' 的整数';
        }
    } else {
        var str = String(value || '');
        var maxLen = p.maxLen || 200;
        if (str.length > maxLen) {
            return p.label + ' 不能超过 ' + maxLen + ' 字符';
        }
    }
    return null;
}

// GET /admin/email-shell - 获取外壳样式（参数定义含默认值 + 当前值，前端面板展示）
router.get('/admin/email-shell', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const values = await db.config.getEmailShell();
        res.json({ params: EMAIL_SHELL_PARAMS, values: values });
    } catch (error) {
        console.error('获取邮件外壳样式失败:', error.message);
        res.status(500).json({ error: '获取邮件外壳样式失败' });
    }
});

// PUT /admin/email-shell - 保存外壳样式（参数白名单校验 + 缓存失效 + 字段级审计）
router.put('/admin/email-shell', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const body = req.body || {};
        // 参数白名单：只接受 EMAIL_SHELL_PARAMS 声明的键
        const toSave = {};
        const errors = [];
        EMAIL_SHELL_PARAMS.forEach(function (p) {
            const val = body[p.key];
            if (val === undefined || val === null) return;
            const err = validateShellParam(p, val);
            if (err) {
                errors.push(err);
            } else {
                toSave[p.key] = p.type === 'number' ? parseInt(val) : String(val).trim();
            }
        });
        if (errors.length > 0) {
            return res.status(400).json({ error: errors.join('；') });
        }

        // 保存前取旧配置（审计 diff 用）
        const oldShell = await db.config.getEmailShell();
        await db.config.setEmailShell(toSave);
        // 失效外壳缓存，让新样式立即生效
        await invalidateEmailShellCache();

        // 操作审计：字段级 diff（自定义 CSS 源码不记入日志防刷屏，只记「已更新」标记）
        try {
            const { auditLog } = require('../utils/audit-log');
            const newShell = await db.config.getEmailShell();
            const changes = buildFieldDiff(oldShell, newShell, EMAIL_SHELL_PARAMS.filter(function (p) { return p.type !== 'css'; }).map(function (p) {
                if (p.type === 'number') return { key: p.key, label: p.label, num: true };
                return { key: p.key, label: p.label };
            }));
            if (oldShell.custom_css !== newShell.custom_css) changes.push('自定义样式 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.email-shell', resourceType: 'config', resourceId: 'email-shell', details: '更新邮件外壳样式；变更:' + changes.join(', '), req });
            }
        } catch (e) {}

        res.json({ message: '邮件外壳样式保存成功', values: await db.config.getEmailShell() });
    } catch (error) {
        console.error('保存邮件外壳样式失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// POST /admin/email-shell/reset - 恢复默认外壳样式（注册表默认值覆盖 + 缓存失效 + 审计）
router.post('/admin/email-shell/reset', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const defaults = {};
        EMAIL_SHELL_PARAMS.forEach(function (p) { defaults[p.key] = p.default; });
        await db.config.setEmailShell(defaults);
        await invalidateEmailShellCache();

        // 操作审计：恢复默认
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.email-shell', resourceType: 'config', resourceId: 'email-shell', details: '恢复邮件外壳样式默认', req });
        } catch (e) {}

        res.json({ message: '已恢复默认邮件外壳样式', values: await db.config.getEmailShell() });
    } catch (error) {
        console.error('恢复邮件外壳样式失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

module.exports = router;
