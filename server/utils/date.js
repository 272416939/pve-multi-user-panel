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

module.exports = { formatLocalDate, now, today };
