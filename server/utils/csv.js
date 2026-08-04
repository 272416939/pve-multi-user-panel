/**
 * csv.js - CSV 字段转义（V4-06 修复）
 *
 * 防 CSV 公式注入（OWASP CSV Injection）：以 = + - @ 或控制字符（\t \r）开头的字段
 * 前缀单引号，阻止 Excel/WPS 将其解析为公式执行（如 =cmd|... 或 =HYPERLINK(...)）；
 * 引号包裹 + " 转义为 "" 保证含逗号/引号/换行的字段在表格中正确显示。
 * utils 叶子层，无任何依赖。
 */
'use strict';

/**
 * 转义单个 CSV 字段（引号包裹 + 公式前缀防护）
 * @param {*} v - 任意字段值
 * @returns {string} 已转义字段（含外层引号）
 */
function escapeCsvField(v) {
    var s = String(v === undefined || v === null ? '' : v);
    // 公式注入防护：危险前缀（= + - @ 及制表/回车控制符）前加单引号，强制按文本处理
    if (/^[=+\-@\t\r]/.test(s)) {
        s = "'" + s;
    }
    return '"' + s.replace(/"/g, '""') + '"';
}

module.exports = { escapeCsvField };
