/**
 * 邮件模板渲染引擎
 *
 * 职责：模板读取（DB 优先 + 常量注册表兜底）→ 变量替换 → 套共享外壳 → 发送
 * - getTemplate(code)：cache-store 缓存（TTL 300s），保存/恢复默认后 invalidateTemplateCache() 主动失效
 * - renderTemplate(code, vars)：返回 { subject, title, content, site_name }
 * - sendTemplateEmail(to, code, vars, { sync })：sync=true 走 sendEmail（验证码/重置/测试等即时反馈场景），
 *   否则走 enqueueEmail（通知类异步队列）
 *
 * 变量规则：
 * - 占位符 {snake_case}；只替换模板 variables 声明 + 通用变量，未知变量保留原文 + console.warn
 * - 通用变量自动注入：{site_name} / {now} / {site_url}
 * - subject/title 与 content 中的变量值默认做 HTML 实体转义（防用户可控值注入邮件 HTML）；
 *   仅 variables 注册表中显式标记 html: true 的变量（调用方传入完整 HTML 片段，如 {cdk_list}）
 *   在 content 中原样插入（V6-M3）
 * - 值为空的变量所在行自动折叠：独占行或行内唯一变量、无嵌套标签的行整行删除（如"续费价格："行）
 */
const { create } = require('../utils/cache-store');
const { EMAIL_TEMPLATES } = require('../constants/email-templates');

const templateCache = create('email_template', 300);

const VAR_RE = /\{([a-z0-9_]+)\}/g;

// 通用变量（自动注入 + 白名单）
const GLOBAL_VAR_NAMES = ['site_name', 'now', 'site_url'];

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * 空值变量行折叠：模板中声明的变量，若其值为空（undefined/null/''），
 * 所在行（独占行或行内唯一变量、无嵌套标签）整行删除
 * 如：<p style="margin-bottom: 4px;">续费价格：{renewal_price}</p> → renewal_price 为空时整行消失
 * @param {string} html 原始模板正文
 * @param {object} vars 变量值
 * @param {object} declared 变量白名单 {name: true}（未声明变量不折叠，替换阶段保留原文供管理员发现）
 */
function foldEmptyLines(html, vars, declared) {
    var result = html;
    // 收集模板中出现的全部变量，逐个折叠
    var found = {};
    var m;
    var collectRe = new RegExp(VAR_RE.source, 'g');
    while ((m = collectRe.exec(html)) !== null) {
        found[m[1]] = true;
    }
    Object.keys(found).forEach(function (name) {
        // 只折叠已声明变量（未声明的拼写错误保留原文 + 替换阶段 warn）
        if (declared && !declared[name]) return;
        var val = vars[name];
        if (val === undefined || val === null || val === '') {
            // 情况一：裸独占行（无标签包裹，如 {cdk_list}，值为调用方传入的完整 HTML 或空串）
            result = result.replace(new RegExp('^\\s*\\{' + name + '\\}\\s*$', 'gm'), '');
            // 情况二：标签包裹的行（独占行或行内唯一变量、无嵌套标签）
            var re = new RegExp('<([a-z]+)[^>]*>\\s*[^<]*\\{' + name + '\\}[^<]*</\\1>', 'g');
            result = result.replace(re, function (match) {
                // 行内还包含其他变量时不折叠（如"备份{status}。{detail}"的 {detail} 空值保留行）
                var other = match.replace(new RegExp('\\{' + name + '\\}', 'g'), '');
                if (VAR_RE.test(other)) return match;
                return '';
            });
        }
    });
    return result;
}

/**
 * 取模板：DB 优先（管理员可编辑），DB 缺失回退常量注册表默认（兜底，保证邮件必达）
 * @param {string} code 模板标识
 * @returns {Promise<object|null>} { code, name, category, subject, title, content, variables[] }
 */
async function getTemplate(code) {
    return templateCache.get(code, async function (key) {
        var db = require('../api/db');
        var tpl = await db.emailTemplates.getByCode(key);
        if (tpl) {
            if (typeof tpl.variables === 'string') {
                try {
                    tpl.variables = JSON.parse(tpl.variables || '[]') || [];
                } catch (e) {
                    tpl.variables = [];
                }
            }
            if (!Array.isArray(tpl.variables)) tpl.variables = [];
            return tpl;
        }
        var def = EMAIL_TEMPLATES[key];
        if (def) {
            return {
                code: def.code, name: def.name, category: def.category,
                subject: def.subject, title: def.title, content: def.content,
                variables: def.variables || []
            };
        }
        return null;
    });
}

/**
 * 失效模板缓存（保存/恢复默认后调用，下次渲染立即取新内容）
 */
async function invalidateTemplateCache() {
    await templateCache.clear();
}

/**
 * Quill 2 列表输出规范化（纯函数，可测试）
 *
 * Quill 2 无论有序/无序均输出 `<ol>` 标签 + `<li data-list="bullet"/"ordered">` 属性区分，
 * 而邮件客户端（QQ 邮箱/Outlook 等）不支持属性选择器，CSS 兼容方案（ol > li[data-list=bullet]）在真实邮件中失效，
 * 无序列表会按 <ol> 显示数字。渲染时统一转换为标准标签（所有客户端原生支持）：
 * - 整块 li 均为 data-list="bullet" 的 <ol> → <ul>，移除 data-list 属性
 * - data-list="ordered" 的 <ol> 保持，移除 data-list 属性
 * - 同时清除 Quill 列表标记 UI span（.ql-ui，编辑器内显示圆点/数字用，邮件里为空节点）
 * @param {string} html 正文 HTML
 * @returns {string} 规范化后的 HTML
 */
function normalizeQuillLists(html) {
    return String(html || '')
        .replace(/<ol>([\s\S]*?)<\/ol>/g, function (match, inner) {
            if (/data-list="bullet"/.test(inner) && !/data-list="ordered"/.test(inner)) {
                // 无序：<ol> → <ul>，移除 data-list 属性
                return '<ul>' + inner.replace(/data-list="bullet"/g, '') + '</ul>';
            }
            // 有序：保留 <ol>，移除 data-list 属性
            return '<ol>' + inner.replace(/data-list="ordered"/g, '') + '</ol>';
        })
        // 清除 Quill 列表标记 UI span（邮件中为空节点）
        .replace(/<span class="ql-ui"[^>]*><\/span>/g, '');
}

/**
 * 用模板对象渲染（不读 DB/缓存；预览接口复用：传入注册表变量定义 + 前端编辑的 subject/title/content）
 * @param {object} tpl { subject, title, content, variables[] }
 * @param {object} vars 变量值
 * @returns {Promise<{subject:string,title:string,content:string,site_name:string}>}
 */
async function renderRaw(tpl, vars) {
    var variables = Object.assign({}, vars || {});
    // 通用变量自动注入（{site_name} 站点名；{now} 当前时间；{site_url} 站点地址）
    if (variables.site_name === undefined || variables.site_name === null) {
        var siteName = '';
        try {
            siteName = await require('../api/db').config.get('site:name');
        } catch (e) {}
        variables.site_name = siteName || '云服务控制台';
    }
    if (variables.now === undefined || variables.now === null) {
        variables.now = new Date().toLocaleString('zh-CN');
    }
    if (variables.site_url === undefined || variables.site_url === null) {
        variables.site_url = process.env.SITE_URL || '';
    }

    // 白名单：模板声明变量 + 通用变量
    var allowed = {};
    var htmlAllowed = {}; // 允许原样插入 HTML 的变量（注册表 html: true 标记，如 cdk_list）
    (tpl.variables || []).forEach(function (v) {
        allowed[v.name] = true;
        if (v.html) htmlAllowed[v.name] = true;
    });
    GLOBAL_VAR_NAMES.forEach(function (n) { allowed[n] = true; });

    function renderText(text, escapeValues) {
        return text.replace(VAR_RE, function (m, name) {
            if (!allowed[name]) {
                console.warn('[email-template] 模板 ' + tpl.code + ' 包含未声明变量: ' + m);
                return m; // 未知变量保留原样（管理员可在管理端看到并修正）
            }
            var val = variables[name];
            if (val === undefined || val === null) {
                console.warn('[email-template] 模板 ' + tpl.code + ' 变量 ' + m + ' 未传值，按空处理');
                return '';
            }
            // V6-M3：content 中仅 html 标记变量原样插入（调用方传完整 HTML 片段），其余一律转义
            if (!escapeValues && !htmlAllowed[name]) return escapeHtml(val);
            return escapeValues ? escapeHtml(val) : String(val);
        });
    }

    var subject = renderText(tpl.subject, true);
    var title = renderText(tpl.title || '', true);
    // 先折叠（基于原始模板 + 声明白名单），再替换变量，最后规范化 Quill 列表输出（标准 ul/ol，邮件客户端兼容）
    var content = normalizeQuillLists(renderText(foldEmptyLines(tpl.content, variables, allowed), false));

    return { subject: subject, title: title, content: content, site_name: variables.site_name };
}

/**
 * 渲染模板
 * @param {string} code 模板标识
 * @param {object} vars 变量值（snake_case，与模板 variables 白名单对应）
 * @returns {Promise<{subject:string,title:string,content:string,site_name:string}>}
 */
async function renderTemplate(code, vars) {
    var tpl = await getTemplate(code);
    if (!tpl) {
        throw new Error('邮件模板不存在: ' + code);
    }
    return renderRaw(tpl, vars);
}

/**
 * 渲染并发送模板邮件
 * @param {string} to 收件人邮箱
 * @param {string} code 模板标识
 * @param {object} vars 变量值
 * @param {object} [opts] { sync: true } 同步发送（sendEmail，即时反馈场景）；默认异步队列 enqueueEmail
 */
async function sendTemplateEmail(to, code, vars, opts) {
    opts = opts || {};
    var rendered = await renderTemplate(code, vars);
    var { createEmailTemplate } = require('../utils/email');
    var html = await createEmailTemplate(rendered.title, rendered.content, rendered.site_name);
    if (opts.sync) {
        try {
            await require('../utils/email').sendEmail(to, rendered.subject, html);
        } catch (e) {
            // 同步路径（验证码/换绑/SMTP 测试）不进 BullMQ 队列，失败计入队列模块统计，
            // 否则管理端「重试后失败」恒为 0、同步失败完全不可见（2026-08-20 排查教训）
            try { require('../queue/email-queue').recordSyncFailure(e); } catch (_) {}
            throw e;
        }
        return true;
    }
    await require('../queue/email-queue').enqueueEmail(to, rendered.subject, html);
    return true;
}

module.exports = { getTemplate, renderTemplate, renderRaw, sendTemplateEmail, invalidateTemplateCache, foldEmptyLines, normalizeQuillLists };
