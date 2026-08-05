/**
 * 将 Date 对象格式化为本地时间字符串 YYYY-MM-DD HH:MM:SS
 * 避免 toISOString() 转换为 UTC，兼容 MySQL 5.7 DATETIME 格式
 * @param {Date} d - 日期对象
 * @returns {string} 本地时间字符串
 */
function formatLocalDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return y + '-' + m + '-' + dd + ' ' + h + ':' + mi + ':' + s;
}

/**
 * 获取当前本地时间字符串（快捷方法）
 * @returns {string} 当前本地时间 YYYY-MM-DD HH:MM:SS
 */
function now() {
    return formatLocalDate(new Date());
}

/**
 * 获取今天的日期字符串
 * @returns {string} 今天日期 YYYY-MM-DD
 */
function today() {
    return formatLocalDate(new Date()).slice(0, 10);
}

/**
 * 查询参数日期规范化（日志等列表筛选共用，单一来源）：
 * 校验 YYYY-MM-DD 或 YYYY-MM-DD HH:MM:SS；非法返回 null；结束日期纯日期补全天边界 23:59:59
 * @param {string} v - 原始参数值
 * @param {boolean} isEnd - 是否为结束日期（结束日期纯日期补 23:59:59）
 * @returns {string|null}
 */
function normalizeDateParam(v, isEnd) {
    if (!v) return '';
    var s = String(v).trim();
    if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/.test(s)) return null;
    if (isEnd && s.length === 10) s += ' 23:59:59';
    return s;
}

module.exports = { formatLocalDate, now, today, normalizeDateParam };
