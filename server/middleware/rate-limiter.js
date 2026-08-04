const { getRedisClient } = require('../api/redis');

const memoryStore = new Map();

// 限速配置缓存（60s TTL）：每个限速点每请求都触发检查，避免每请求查库
// （参照 services/ip-location.js 的 enabledCache 模式，保存配置时调 invalidateRateLimitCache 立即生效）
const RATE_CONFIG_TTL = 60 * 1000;
let rateConfigCache = null;
let rateConfigCacheTime = 0;

/**
 * 读取限速配置（总开关 + 各规则 enabled/max/windowSec），60s 内存缓存。
 * DB 读取失败降级为「全开启 + 注册表默认值」——宁可保持限速，也不因配置故障裸奔。
 */
async function getRateLimitConfig() {
    var now = Date.now();
    if (rateConfigCache !== null && now - rateConfigCacheTime < RATE_CONFIG_TTL) {
        return rateConfigCache;
    }
    try {
        // 惰性 require，避免 middleware 与 api 层顶层循环依赖
        rateConfigCache = await require('../api/db').config.getRateLimits();
    } catch (e) {
        console.warn('[rate-limiter] 读取限速配置失败，使用默认规则:', e.message);
        var { RATE_LIMIT_RULES } = require('../constants');
        var rules = {};
        Object.keys(RATE_LIMIT_RULES).forEach(function(k) {
            rules[k] = { enabled: true, max: RATE_LIMIT_RULES[k].max, windowSec: RATE_LIMIT_RULES[k].windowSec };
        });
        rateConfigCache = { master_enabled: true, rules: rules };
    }
    rateConfigCacheTime = now;
    return rateConfigCache;
}

/** 失效限速配置缓存（保存配置后调用，让新配置立即生效） */
function invalidateRateLimitCache() {
    rateConfigCache = null;
    rateConfigCacheTime = 0;
}

/**
 * 配置化限速检查（安全防护·限速设置入口）
 * @param {string} ruleKey - 规则 key（RATE_LIMIT_RULES 注册表白名单，单一来源 server/constants.js）
 * @param {string} key - 限速计数 key（调用方按场景拼装，如 'ratelimit:login:'+ip+':'+username）
 * 总开关或单规则关闭 → 直接放行；否则按配置（次数/时间窗）调 checkRateLimit
 */
async function checkConfiguredRateLimit(ruleKey, key) {
    var cfg = await getRateLimitConfig();
    if (!cfg.master_enabled) return { allowed: true };
    var rule = cfg.rules[ruleKey];
    if (!rule || !rule.enabled) return { allowed: true };
    return checkRateLimit(key, rule.max, rule.windowSec * 1000);
}

/**
 * 限速器 Lua 脚本（原子操作）
 * INCR + EXPIRE 在一个 Lua 脚本中执行，避免竞态条件导致 TTL 丢失
 *
 * KEYS[1] = 限速 key
 * ARGV[1] = 窗口大小（秒）
 * ARGV[2] = 最大允许次数
 *
 * 返回 {count, ttl}：
 *   count = 当前累计次数
 *   ttl = 剩余 TTL（秒）
 */
const RATE_LIMIT_LUA = [
    'local count = redis.call("INCR", KEYS[1])',
    'local ttl = 0',
    'if count == 1 then',
    '    redis.call("EXPIRE", KEYS[1], ARGV[1])',
    '    ttl = tonumber(ARGV[1])',
    'else',
    '    ttl = redis.call("TTL", KEYS[1])',
    '    if ttl < 0 then',
    '        -- 兜底：如果 EXPIRE 丢失（理论上不会，但防御性处理），重新设置',
    '        redis.call("EXPIRE", KEYS[1], ARGV[1])',
    '        ttl = tonumber(ARGV[1])',
    '    end',
    'end',
    'return {count, ttl}'
].join('\n');

/**
 * 获取限速器 Lua 脚本（供测试验证）
 */
function getRateLimitScript() {
    return RATE_LIMIT_LUA;
}

async function checkRateLimit(key, maxAttempts, windowMs) {
    const redis = getRedisClient();
    if (redis) {
        return redisRateLimit(redis, key, maxAttempts, windowMs);
    }
    return memoryRateLimit(key, maxAttempts, windowMs);
}

async function redisRateLimit(redis, key, maxAttempts, windowMs) {
    try {
        const windowSec = Math.ceil(windowMs / 1000);
        // 使用 Lua 脚本保证 INCR + EXPIRE 原子性
        const result = await redis.eval(
            RATE_LIMIT_LUA, 1, key, windowSec, maxAttempts
        );
        const count = parseInt(result[0]);
        const ttl = parseInt(result[1]);
        if (count > maxAttempts) {
            return { allowed: false, retryAfter: ttl > 0 ? ttl : 60 };
        }
        return { allowed: true };
    } catch (e) {
        console.warn('[rate-limiter] Redis 不可用，使用内存回退:', e.message);
        return memoryRateLimit(key, maxAttempts, windowMs);
    }
}

function memoryRateLimit(key, maxAttempts, windowMs) {
    const now = Date.now();
    const record = memoryStore.get(key);
    if (!record || now - record.lastAttempt > windowMs) {
        memoryStore.set(key, { count: 1, lastAttempt: now });
        return { allowed: true };
    }
    if (record.count >= maxAttempts) {
        const retryAfter = Math.ceil((windowMs - (now - record.lastAttempt)) / 1000);
        return { allowed: false, retryAfter };
    }
    record.count++;
    record.lastAttempt = now;
    return { allowed: true };
}

module.exports = { checkRateLimit, checkConfiguredRateLimit, getRateLimitScript, invalidateRateLimitCache };
