function getSiteUrl(req) {
    if (process.env.SITE_URL) {
        return process.env.SITE_URL.replace(/\/+$/, '');
    }
    // H-10 修复：不允许从请求头获取 host（防止 Host 注入攻击）
    console.warn('[security] SITE_URL 未配置，密码重置链接生成失败');
    return null;
}

module.exports = getSiteUrl;
