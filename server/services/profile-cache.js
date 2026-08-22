// server/services/profile-cache.js - GET /user/profile 响应缓存（单一来源）
// 抽离自 routes/user.js 模块私有变量：admin-user 等其他模块需要失效目标用户的
// profile 缓存（管理员改邮箱/角色/强制改密标记），模块私有实例没有失效入口。
// TTL 用 FRONTEND_CACHE_TTL（3600s）——前提是所有写 users 表可缓存字段的路径都
// 调 invalidateProfile：改资料/改密/头像/邮箱验证（user.js）、换绑邮箱（user.js）、
// 管理员编辑（admin-user.js）。忘记密码重置只写 password（被 sanitizeUser 剔除）无需失效。
// 注意：balance 在缓存对象内但允许脏值——前端余额显示全部走 /wallet/balance（直查 DB），
// 余额写路径 8+ 处事务内直写 SQL 无统一入口，不为零消费字段逐路径补失效。
const cacheStore = require('../utils/cache-store');
const { FRONTEND_CACHE_TTL } = require('../constants');

const profileCache = cacheStore.create('profile', FRONTEND_CACHE_TTL);

async function invalidateProfile(userId) {
    await profileCache.del(String(userId));
}

module.exports = { profileCache, invalidateProfile };
