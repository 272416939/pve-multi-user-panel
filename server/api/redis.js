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
        // 连接保活：每 30s 发送 PING，防止长连接被中间设备断开
        keepAlive: 30000,
        // 启用 NO_DELAY 算法，降低小包延迟
        noDelay: true,
        // 单连接多路复用（ioredis 默认模式，无需连接池）
        // enableOfflineQueue: true（默认）— 离线时排队请求，连接恢复后批量执行
        enableOfflineQueue: true,
        // 离线队列上限（防止积压过多请求）
        offlineQueueMaxItems: 1000
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

/**
 * 重置 Redis 客户端连接
 * 用于配置变更后热更新 Redis 连接（从 DB 读取配置后调用）
 */
function resetClient() {
    if (_redis) {
        try {
            _redis.disconnect();
        } catch (e) {
            // 忽略断开异常
        }
    }
    _redis = null;
}

module.exports = { getRedis, getRedisClient, resetClient };
