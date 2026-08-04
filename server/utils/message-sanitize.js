/**
 * message-sanitize.js - 站内信内容服务端净化（V4-05 修复）
 *
 * V3-04 仅在群发端点实现净化；现下沉为共享工具（utils 叶子层），
 * 并在 db-messaging.messages.create 内统一调用，覆盖所有创建路径（群发/LXC 通知/任务通知/管理员补发），
 * 纵深防御防存储型 XSS（前端 DOMPurify/插值为第一道防线，服务端入库净化为第二道）。
 * 净化幂等：群发端点预净化后 create 再次净化结果不变。
 */
'use strict';

/**
 * 净化消息标题：剥 HTML 标签 + 截断 500
 */
function sanitizeTitle(text) {
    return String(text == null ? '' : text).replace(/<[^>]*>/g, '').substring(0, 500);
}

/**
 * 净化消息内容：保留基本换行/列表语义，剔除 HTML 标签、危险协议与内联事件，截断 50000
 */
function sanitizeMessageContent(text) {
    var s = String(text == null ? '' : text);
    // 1. 剔除 script/style 块及其内容
    s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, '');
    // 2. 剥离剩余 HTML 标签
    s = s.replace(/<[^>]*>/g, '');
    // 3. 剔除危险协议链接（javascript:/data:/vbscript:）
    s = s.replace(/(javascript|data|vbscript)\s*:/gi, '$1&#58;');
    // 4. 截断长度（与服务端限制一致）
    if (s.length > 50000) s = s.substring(0, 50000);
    return s;
}

/**
 * 净化链接 URL：剥危险协议（javascript:/data:/vbscript:）+ 截断 500
 */
function sanitizeLinkUrl(url) {
    return String(url == null ? '' : url).substring(0, 500).replace(/(javascript|data|vbscript)\s*:/gi, '');
}

/**
 * 净化链接文本：剥 HTML 标签 + 截断 200
 */
function sanitizeLinkText(text) {
    return String(text == null ? '' : text).replace(/<[^>]*>/g, '').substring(0, 200);
}

module.exports = { sanitizeTitle, sanitizeMessageContent, sanitizeLinkUrl, sanitizeLinkText };
