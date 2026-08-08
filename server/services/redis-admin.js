// server/services/redis-admin.js - Redis 配置管理与运维服务
// 规范第七节：基础设施运维进 services/，路由只做响应组装
// 从 routes/admin-config.js 抽取：Redis 热更新、测试连接、一键清缓存

const db = require('../api/db');
const { safeError } = require('../utils/safe-error');

/**
 * 应用 Redis 配置（写 process.env + 重置客户端连接）
 * @param {object} config - { host, port, password, db, prefix }
 */
async function applyRedisConfig(config) {
    // 热更新 Redis 连接
    try {
        var newCfg = await db.config.getRedis();
        if (newCfg.host) {
            process.env.REDIS_HOST = newCfg.host;
            process.env.REDIS_PORT = String(newCfg.port || 6379);
            process.env.REDIS_PASSWORD = newCfg.password || '';
            process.env.REDIS_DB = String(newCfg.db || 0);
            process.env.REDIS_PREFIX = newCfg.prefix || 'pve:';
        } else {
            delete process.env.REDIS_HOST;
        }
        require('../api/redis').resetClient();
        // 邮件队列 Worker 依赖 Redis 连接，配置变更后重启（Redis 未配置时内部跳过，邮件走同步发送）
        try {
            require('../queue/email-queue').restartEmailWorker();
        } catch (e) {
            console.warn('[redis-admin] 重启邮件队列 Worker 失败:', e.message);
        }
    } catch (e) {
        console.error('热更新 Redis 连接失败:', e.message);
    }
}

/**
 * 测试 Redis 连接（创建临时连接，不重试，PING 验证）
 * 返回 { success: boolean, message: string }
 * @param {object} opts - { host, port, password, db }
 */
async function testRedisConnection(opts) {
    var { host, port, password, db: redisDb } = opts;
    if (!host) {
        return { success: false, message: '请填写 Redis 地址再测试' };
    }
    // 如果密码是打码值，从数据库获取真实密码
    var { isMasked } = require('../utils/crypto-utils');
    if (isMasked(password || '')) {
        var savedConfig = await db.config.getRedis();
        password = savedConfig.password;
    }
    // 创建临时测试连接
    const Redis = require('ioredis');
    var testClient = new Redis({
        host: host,
        port: parseInt(port) || 6379,
        password: password || undefined,
        db: parseInt(redisDb) || 0,
        retryStrategy: null,    // 不重试
        maxRetriesPerRequest: 1,
        connectionTimeout: 5000,
        lazyConnect: true
    });
    try {
        await testClient.connect();
        var pong = await testClient.ping();
        if (pong === 'PONG') {
            return { success: true, message: 'Redis 连接成功 (PONG)' };
        }
        return { success: true, message: 'Redis 连接成功（响应: ' + pong + '）' };
    } catch (e) {
        return { success: false, message: '连接失败: ' + safeError(e) };
    } finally {
        try { testClient.disconnect(); } catch (e) {}
    }
}

/**
 * 一键清除所有缓存（Redis + 内存 + 站点配置进程缓存 + 页面渲染缓存）
 * @param {object} app - express app（用于清理 app.locals.siteConfigCache）
 */
async function clearAllCaches(app) {
    var cacheStore = require('../utils/cache-store');
    await cacheStore.clearAll();
    // 清除站点配置的进程内存缓存（clearAll 已清 Redis，这里补清 app.locals）
    if (app && app.locals.siteConfigCache) {
        app.locals.siteConfigCache.data = null;
        app.locals.siteConfigCache.expires = 0;
    }
    // 清除 Redis 页面渲染缓存
    try {
        var redis = require('../api/redis').getRedisClient();
        if (redis) {
            await redis.del('page:login');
        }
    } catch (e) {}
}

module.exports = { applyRedisConfig, testRedisConnection, clearAllCaches };
