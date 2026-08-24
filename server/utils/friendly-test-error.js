/**
 * 测试连接类端点的错误 → 可操作中文原因（管理员调试自家设备用）
 *
 * 与 safeError 的区别：safeError 生产环境返回通用文案（适合普通业务操作防信息泄露）；
 * 测试端点（爱快/PVE/Redis 测试连接按钮）需要给具体原因——连接超时/被拒/无法解析/认证失败，
 * 这些是管理员自己输入的设备配置相关，非面板内部路径/堆栈等敏感信息。
 *
 * 映射规则：
 * - 已是友好中文（含中文逗号/冒号的说明，如「爱快 V4 认证失败：API Token 无效或已过期」）直接透传
 * - 超时 / 连接被拒绝 / 无法解析主机名 → 固定中文提示
 * - Redis/PVE 认证类错误（WRONGPASS/NOAUTH/invalid credential）→ 认证失败提示
 * - V3 风格登录失败（含 ErrMsg 的设备返回）→ 提取 ErrMsg，否则通用登录失败提示
 * - 其余透传原始错误（连接层错误本身可读，非敏感）
 */
function friendlyTestError(e) {
    var msg = (e && e.message) ? String(e.message) : String(e || '未知错误');
    var reason;
    // 已是友好中文说明（含中文标点）直接透传，避免把具体原因再套一层
    if (/[\u4e00-\u9fa5]，/.test(msg) || /[\u4e00-\u9fa5]：/.test(msg)) reason = msg;
    else if (/超时|timed? ?out/i.test(msg)) reason = '连接超时，请检查地址与网络连通性';
    else if (/ECONNREFUSED|连接被拒绝/i.test(msg)) reason = '连接被拒绝，请检查地址与端口';
    else if (/Connection is closed|connection closed|ECONNRESET|socket hang up/i.test(msg)) reason = '无法连接，连接被关闭，请检查地址与端口';
    else if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) reason = '无法解析主机名，请检查地址';
    else if (/WRONGPASS|invalid username-password|NOAUTH|AUTH failed|认证失败/i.test(msg)) reason = '认证失败，请检查账号/密码/Token 是否正确';
    else if (/登录失败/i.test(msg)) {
        var m = msg.match(/ErrMsg["']?\s*[:=]\s*["']([^"']+)["']/);
        reason = m ? ('登录失败：' + m[1]) : '登录失败，请检查用户名与密码';
    } else reason = msg;
    return reason;
}

module.exports = { friendlyTestError };
