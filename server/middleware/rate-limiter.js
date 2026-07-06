const { getRedisClient } = require('../api/redis');

const memoryStore = new Map();

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

module.exports = { checkRateLimit, getRateLimitScript };
