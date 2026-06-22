// 用户名黑名单 - 禁止注册的敏感用户名
const USERNAME_BLACKLIST = [
    'admin', 'administrator', 'root', 'system', 'support', 'sys',
    'guest', 'test', 'demo', 'super', 'sa', 'user', 'help',
    'api', 'config', 'master', 'manager', 'operator', 'service',
    'info', 'webmaster', 'security', 'login', 'register', 'signup',
    'null', 'undefined', 'console', 'shell', 'bash', 'sudo',
    'server', 'client', 'public', 'private', 'unknown', 'anonymous'
];

// 检查用户名是否在黑名单中（大小写不敏感）
function isUsernameBlacklisted(name) {
    if (!name || typeof name !== 'string') return true;
    var lower = name.toLowerCase().trim();
    return USERNAME_BLACKLIST.indexOf(lower) !== -1;
}

module.exports = { USERNAME_BLACKLIST, isUsernameBlacklisted };
