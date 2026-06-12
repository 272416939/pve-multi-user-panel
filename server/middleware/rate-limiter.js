const { getRedisClient } = require('../api/redis');

const memoryStore = new Map();

async function checkRateLimit(key, maxAttempts, windowMs) {
    const redis = getRedisClient();
    if (redis) {
        return redisRateLimit(redis, key, maxAttempts, windowMs);
    }
    return memoryRateLimit(key, maxAttempts, windowMs);
}

async function redisRateLimit(redis, key, maxAttempts, windowMs) {
    try {
        const count = await redis.incr(key);
        if (count === 1) {
            await redis.expire(key, Math.ceil(windowMs / 1000));
        }
        if (count > maxAttempts) {
            const ttl = await redis.ttl(key);
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

module.exports = { checkRateLimit };
