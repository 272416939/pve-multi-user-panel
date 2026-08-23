/**
 * CNAME 域名配置校验纯函数（PUT /admin/network/config 使用）
 *
 * 存储格式（与前端 public/js/admin/network.js 约定一致）：
 *   逗号分隔的多条目，每条为 label||.domain（前端 55b0484 起），兼容旧格式：
 *   中文.域名（07a91b1~59e54f7 时期）、.域名、裸域名
 * 拆分规则与前端 parseCnameEntries 保持对齐：
 *   - 含 || → label = 前段，domain = 后段
 *   - 匹配 /^([\u4e00-\u9fa5]+)(\..+)$/ → label = 中文前缀，domain = 剩余
 *   - 其余 → label = ''，domain = 整条
 *
 * 安全约束（延续 b08ba2d V5 审计 L-1 意图，防非法/超长串入库）：
 *   - 整串 ≤ 4096 字符（config 表 value 为 TEXT）
 *   - label ≤ 50 字符，禁止控制字符 / , / ||（结构字符防解析歧义）
 *   - domain 允许前导 .，剥离后为合法 DNS 域名（每段 1-63，ASCII 字母数字连字符），单条 ≤ 253
 */

// 标准 DNS 域名：label.label.tld，每段 1-63 字符、ASCII 字母数字连字符、不以 - 开头结尾
var DOMAIN_RE = /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
// 整串长度上限（config 表 value 为 TEXT，防超长串入库）
var MAX_TOTAL_LEN = 4096;
// 单条 label（节点名称）长度上限
var MAX_LABEL_LEN = 50;

// 拆分单条条目为 {label, domain}，与前端 parseCnameEntries（public/js/admin/network.js）逻辑一致
function splitCnameEntry(entry) {
    var sep = entry.indexOf('||');
    if (sep > -1) {
        return { label: entry.substring(0, sep), domain: entry.substring(sep + 2) };
    }
    // 旧格式兼容: 中文前缀 + .域名（如 自动.auto.mcsr.cc）
    var match = entry.match(/^([\u4e00-\u9fa5]+)(\..+)$/);
    if (match) return { label: match[1], domain: match[2] };
    // 无标签：.域名 或 裸域名
    return { label: '', domain: entry };
}

// 校验单条 label（节点名称）：长度 + 结构字符/控制字符黑名单
// V6-L2 修复：改白名单收紧（中文/字母/数字/空格/连字符/下划线/点），剔除 <>"'& 等 HTML 元字符——
// label 存 config 表永久保留，防存储型 XSS 种子（当前前端纯文本渲染，纵深防御）；
// 空 label 合法（.域名 / 裸域名条目无标签）
var LABEL_RE = /^[\u4e00-\u9fa5a-zA-Z0-9 _\-\.]{0,50}$/;
function isValidLabel(label) {
    if (label.length > MAX_LABEL_LEN) return false;
    if (/[\x00-\x1f\x7f]/.test(label)) return false;  // 控制字符
    if (label.indexOf(',') > -1) return false;        // 逗号破坏条目分隔
    if (label.indexOf('||') > -1) return false;       // || 破坏标签分隔
    return LABEL_RE.test(label);
}

// 校验单条 domain：允许前导 .，剥离后为合法 DNS 域名且 ≤253
function isValidDomain(domain) {
    if (!domain) return false;
    var d = domain.startsWith('.') ? domain.substring(1) : domain;
    return DOMAIN_RE.test(d);
}

/**
 * 校验 CNAME 域名配置字符串（逗号分隔多条目）
 * @param {string|undefined|null} str - 前端提交的 cname_domain
 * @returns {{ok: boolean, error?: string}} ok=false 时 error 为给用户看的消息
 */
function validateCnameDomain(str) {
    if (str === undefined || str === null) return { ok: true };
    var domainStr = String(str).trim();
    if (!domainStr) return { ok: true };
    if (domainStr.length > MAX_TOTAL_LEN) {
        return { ok: false, error: 'CNAME 域名格式无效或过长' };
    }
    var entries = domainStr.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    for (var i = 0; i < entries.length; i++) {
        var item = splitCnameEntry(entries[i]);
        if (!isValidLabel(item.label) || !isValidDomain(item.domain)) {
            return { ok: false, error: 'CNAME 域名格式无效或过长' };
        }
    }
    return { ok: true };
}

module.exports = { validateCnameDomain, splitCnameEntry };
