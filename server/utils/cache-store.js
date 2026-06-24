/**
 * 通用缓存工具 — Redis 优先，内存回退
 * 提供统一的 get/set/del/clear 接口，自动处理 Redis 不可用场景
 */
const redisClient = require('../api/redis').getRedisClient();

// 获取 Redis keyPrefix（ioredis 自动给 set/get/del 加前缀，但 SCAN 不加）
function getRedisPrefix() {
    if (redisClient && redisClient.options && redisClient.options.keyPrefix) {
        return redisClient.options.keyPrefix;
    }
    return '';
}

// SCAN + DEL：修复 ioredis keyPrefix 双前缀问题
// SCAN 返回的 key 带前缀，DEL 会自动加前缀，所以需要去掉前缀后再传给 DEL
async function scanDel(pattern) {
    if (!redisClient) return;
    var prefix = getRedisPrefix();
    var fullPattern = prefix + pattern;
    var cursor = '0';
    do {
        var reply = await redisClient.scan(cursor, 'MATCH', fullPattern, 'COUNT', 100);
        cursor = reply[0];
        var keys = reply[1];
        if (keys.length > 0) {
            // 去掉前缀，因为 ioredis 的 del 会自动加前缀
            var strippedKeys = keys.map(function(k) {
                return prefix.length > 0 && k.startsWith(prefix) ? k.slice(prefix.length) : k;
            });
            await redisClient.del(strippedKeys);
        }
    } while (cursor !== '0');
}

// 进程内存回退缓存（按 namespace 隔离）
const memoryStores = {};

function getMemoryStore(namespace, ttlMs) {
    if (!memoryStores[namespace]) {
        memoryStores[namespace] = { map: new Map(), ttl: ttlMs || 60000 };
    }
    return memoryStores[namespace];
}

// 后台清理内存缓存（每 60 秒）
setInterval(function() {
    var now = Date.now();
    for (var ns in memoryStores) {
        var s = memoryStores[ns];
        for (var entry of s.map) {
            if (now - entry[1].ts > s.ttl) {
                s.map.delete(entry[0]);
            }
        }
    }
}, 60000);

/**
 * 创建一个带 TTL 的缓存实例
 * @param {string} namespace - 命名空间（如 'profile', 'unread'）
 * @param {number} ttlSeconds - TTL（秒）
 */
function create(namespace, ttlSeconds) {
    var ttlMs = (ttlSeconds || 60) * 1000;
    var memStore = getMemoryStore(namespace, ttlMs);

    var cache = {
        /**
         * 读取缓存（自动反序列化 JSON）
         * @param {string} key
         * @param {function} [loader] - 可选的回源函数，缓存未命中时调用
         * @returns {Promise<any|null>}
         */
        async get(key, loader) {
            var fullKey = namespace + ':' + key;
            // 1. 内存缓存
            var entry = memStore.map.get(key);
            if (entry && Date.now() - entry.ts < memStore.ttl) {
                return entry.value;
            }
            if (entry) memStore.map.delete(key);

            // 2. Redis 缓存
            if (redisClient) {
                try {
                    var raw = await redisClient.get(fullKey);
                    if (raw !== null) {
                        try { return JSON.parse(raw); }
                        catch (e) { return raw; }
                    }
                } catch (e) {
                    // Redis 异常，静默回退
                }
            }

            // 3. 缓存未命中且有 loader，回源查询（缓存穿透防护）
            if (typeof loader === 'function') {
                var value = await loader(key);
                if (value === null || value === undefined) {
                    // 缓存空值防止穿透，短 TTL
                    await cache.set(key, null, Math.floor(ttlSeconds / 4 || 10));
                    return null;
                }
                await cache.set(key, value);
                return value;
            }

            return null;
        },

        /**
         * 写入缓存（自动序列化 JSON）
         * @param {string} key
         * @param {any} value
         * @param {number} [customTtl] - 自定义 TTL（秒），不传则用默认值
         */
        async set(key, value, customTtl) {
            var fullKey = namespace + ':' + key;
            var ttl = customTtl || ttlSeconds;
            // 添加 ±10% 随机偏移防止雪崩
            var jitter = Math.floor(ttl * 0.1 * (Math.random() - 0.5) * 2);
            var actualTtl = ttl + jitter;
            // 写内存
            memStore.map.set(key, { value: value, ts: Date.now() });
            // 写 Redis
            if (redisClient) {
                try {
                    var raw = (typeof value === 'string') ? value : JSON.stringify(value);
                    await redisClient.set(fullKey, raw, 'EX', actualTtl);
                } catch (e) {
                    // Redis 异常，静默回退
                }
            }
        },

        /**
         * 删除缓存
         */
        async del(key) {
            var fullKey = namespace + ':' + key;
            memStore.map.delete(key);
            if (redisClient) {
                try { await redisClient.del(fullKey); } catch (e) {}
            }
        },

        /**
         * 清空该命名空间下所有缓存
         */
        async clear() {
            memStore.map.clear();
            await scanDel(namespace + ':*');
        },

        /**
         * 仅清空内存缓存（不操作 Redis）
         */
        clearMemory() {
            memStore.map.clear();
        }
    };
    return cache;
}

/**
 * 清空所有缓存（Redis + 内存）
 * 用于站点设置的"清除缓存"功能
 * 只删除带 REDIS_PREFIX 前缀的 key，不影响其他服务
 */
async function clearAll() {
    // 1. 清空所有内存缓存
    for (var ns in memoryStores) {
        memoryStores[ns].map.clear();
    }
    // 2. 清空 Redis 中所有带前缀的 key（不影响其他服务）
    await scanDel('*');
}

module.exports = { create, clearAll };
