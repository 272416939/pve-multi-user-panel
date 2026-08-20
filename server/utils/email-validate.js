/**
 * 邮箱地址校验纯函数（全站唯一来源）
 *
 * 背景（2026-08-20 排查）：原各路由散落的宽松正则 /^[^\s@]+@[^\s@]+\.[^\s@]+$/
 * 放行了末尾带句点的地址（如 tjmcpe@yeah.net.），SMTP 服务器在 RCPT TO 阶段
 * 返回 "500 Error: bad syntax" 拒收——校验通过 ≠ 服务器接受，必须在入面板前
 * 收紧到「SMTP 兼容」的格式。
 *
 * 收紧点（对照 RFC 5321/5322 与主流 SMTP 服务器实际行为）：
 *   - local part：ASCII 字母/数字/常见符号（.-_+），开头结尾不为 .，不出现 ..，
 *     拒绝中文/全角/引号/空格等（部分服务器接受但兼容性差，且多为手误输入）
 *   - domain：标准 DNS 域名（每段 1-63、字母数字连字符、不以 - 开头结尾），
 *     末尾句点必须剥离前判定为非法（tjmcpe@yeah.net. → 拒绝）
 *   - 总长 ≤ 254（RFC 5321 forward-path 上限）
 *
 * 使用：服务端所有接收邮箱的端点统一 require 本模块，禁止本地再写正则
 * （先例：cname-validate.js / password-hash.js isStrongPassword 单一来源）。
 * 前端对应校验见 login-page.js（注册/验证码），文案保持「邮箱格式不正确」一致。
 */

// local part：ASCII 可见符号子集（排除引号/反斜杠/逗号/分号等 SMTP 结构字符与控制字符）
var LOCAL_RE = /^[A-Za-z0-9]([A-Za-z0-9._+-]{0,62}[A-Za-z0-9])?$/;
// 标准 DNS 域名：label.label.tld，每段 1-63、不以 - 开头结尾（与 cname-validate 的 DOMAIN_RE 同源）
var DOMAIN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
// 总长上限（含 @，RFC 5321 forward-path）
var MAX_EMAIL_LEN = 254;

/**
 * 校验邮箱地址（SMTP 兼容格式）
 * @param {*} email - 待校验值（非字符串直接判非法）
 * @returns {boolean}
 */
function isValidEmail(email) {
    if (typeof email !== 'string') return false;
    var s = email.trim();
    if (!s || s.length > MAX_EMAIL_LEN) return false;
    var at = s.lastIndexOf('@');
    if (at < 1 || at === s.length - 1) return false;
    var local = s.substring(0, at);
    var domain = s.substring(at + 1);
    // 末尾句点（本次事故根因）：tjmcpe@yeah.net. 在 RCPT TO 阶段被拒
    if (domain.endsWith('.')) return false;
    if (local.indexOf('..') > -1) return false; // 连续点（local 长度短时 LOCAL_RE 可变段可选会漏拦）
    return LOCAL_RE.test(local) && DOMAIN_RE.test(domain);
}

module.exports = { isValidEmail };
