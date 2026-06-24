const env = process.env;

function getRedis() {
    const host = env.REDIS_HOST;
    if (!host) return null;

    const Redis = require('ioredis');
    const port = parseInt(env.REDIS_PORT || '6379');
    const password = env.REDIS_PASSWORD || undefined;
    const db = parseInt(env.REDIS_DB || '0');
    const prefix = env.REDIS_PREFIX || 'pve:';

    const safeLog = `${host}:${port} (db=${db}, prefix=${prefix}${password ? ', auth=***' : ', no-auth'})`;

    let retryCount = 0;
    const redis = new Redis({
        host, port, password, db, keyPrefix: prefix,
        retryStrategy(times) {
            if (times > 3) {
                console.warn(`[redis] 连接失败(${safeLog})，已重试${times-1}次，回退到内存模式`);
                return null;
            }
            retryCount = times;
            return Math.min(times * 1000, 3000);
        },
        maxRetriesPerRequest: 3,
        lazyConnect: false,
        connectionTimeout: 10000,
    });

    redis.on('connect', () => {
        console.log(`[redis] 已连接: ${safeLog}`);
    });

    redis.on('error', (err) => {
        console.error('[redis] 连接错误:', err.message);
    });

    return redis;
}

let _redis = null;
function getRedisClient() {
    if (_redis === null) _redis = getRedis();
    return _redis;
}

module.exports = { getRedis, getRedisClient };
