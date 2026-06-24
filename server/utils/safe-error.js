/**
 * 统一安全错误处理函数
 * 生产环境返回通用错误信息，DEBUG 模式返回详细错误
 * @param {Error} e - 异常对象
 * @returns {string} 安全的错误消息
 */
function safeError(e) {
    if (process.env.DEBUG === 'true') return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
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

module.exports = { safeError, sanitizeUser };
