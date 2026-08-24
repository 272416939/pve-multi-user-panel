/**
 * 统一安全错误处理函数
 * 生产环境返回通用错误信息，DEBUG 模式返回脱敏后的详细错误
 * @param {Error} e - 异常对象
 * @param {string} [context] - 可选的自定义上下文文案（如 "PVE 操作失败"）
 *                             不传时默认返回 '系统运行错误，请稍后重试'
 * @returns {string} 安全的错误消息
 */

// 脱敏函数：替换路径、URL、IP 地址等敏感信息
function sanitizeErrorMsg(msg) {
    if (!msg) return '';
    // Windows 路径：C:\xxx 或 E:\xxx
    msg = msg.replace(/[A-Za-z]:\\[^\s,;)"'\]]+/g, '<路径>');
    // Linux 路径：/var/lib/xx，至少含 2 级路径
    msg = msg.replace(/\/[^\s,;)"'\]]+\/[^\s,;)"'\]]+/g, '<路径>');
    // URL
    msg = msg.replace(/https?:\/\/[^\s,;)"'\]]+/g, '<URL>');
    // IP 地址
    msg = msg.replace(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, '<IP>');
    return msg;
}

function safeError(e, context) {
    if (process.env.DEBUG === 'true') {
        var raw = e.response?.data?.message || e.message || String(e);
        var cleaned = sanitizeErrorMsg(raw);
        return context ? context + ': ' + cleaned : cleaned;
    }
    return context || '系统运行错误，请稍后重试';
}

/**
 * 剔除用户对象中的敏感字段（password, password_salt, totp_secret, recovery_codes, api_key）
 * 用于所有返回用户信息的 API 响应
 * @param {object} user - 原始用户对象
 * @returns {object} 剔除敏感字段后的安全用户对象
 */
function sanitizeUser(user) {
    if (!user) return user;
    const { password, password_salt, totp_secret, recovery_codes, api_key, ...safeUser } = user;
    return safeUser;
}

module.exports = { safeError, sanitizeUser, sanitizeErrorMsg };
