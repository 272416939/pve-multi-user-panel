/*!
 * console-session.js - 控制台/终端会话存储
 *
 * 用不透明的 session ID 替代 URL 中的敏感参数（ticket/JWT token/node/port/userId），
 * session 数据存服务端（Redis + 内存回退），避免敏感信息在浏览器历史/日志/Referer 中泄露。
 *
 * - Session ID: crypto.randomBytes(32).toString('hex')，64 字符，256 位熵
 * - TTL: 300 秒（5 分钟）
 * - 单次性：consumeSession 获取后立即删除，防止重放
 */
const crypto = require('crypto');
const { getRedisClient } = require('../api/redis');

const SESSION_TTL_SEC = 300; // 5 分钟
const SESSION_PREFIX = 'console:session:';
const sessionRegistry = new Map(); // 内存回退（Redis 不可用时）

/**
 * 创建会话，返回不透明的 session ID
 * @param {Object} data - 要存储的会话数据（必须可 JSON 序列化）
 * @returns {Promise<string>} 64 字符 hex session ID
 */
async function createSession(data) {
    const sessionId = crypto.randomBytes(32).toString('hex');
    const value = JSON.stringify(data);
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.setex(SESSION_PREFIX + sessionId, SESSION_TTL_SEC, value);
            return sessionId;
        } catch (e) {
            // Redis 异常时回退到内存
        }
    }
    // 内存回退
    sessionRegistry.set(sessionId, { data, createdAt: Date.now() });
    return sessionId;
}

/**
 * 获取会话数据（不删除）
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function getSession(sessionId) {
    if (!sessionId) return null;
    const redis = getRedisClient();
    if (redis) {
        try {
            const value = await redis.get(SESSION_PREFIX + sessionId);
            if (value) return JSON.parse(value);
            return null;
        } catch (e) {
            // Redis 异常时回退到内存
        }
    }
    // 内存回退：检查过期
    const entry = sessionRegistry.get(sessionId);
    if (!entry) return null;
    if (Date.now() - entry.createdAt > SESSION_TTL_SEC * 1000) {
        sessionRegistry.delete(sessionId);
        return null;
    }
    return entry.data;
}

/**
 * 消费会话（获取并立即删除，单次性）
 * @param {string} sessionId
 * @returns {Promise<Object|null>}
 */
async function consumeSession(sessionId) {
    const data = await getSession(sessionId);
    if (data) await deleteSession(sessionId);
    return data;
}

/**
 * 删除会话
 * @param {string} sessionId
 * @returns {Promise<void>}
 */
async function deleteSession(sessionId) {
    if (!sessionId) return;
    const redis = getRedisClient();
    if (redis) {
        try {
            await redis.del(SESSION_PREFIX + sessionId);
        } catch (e) {
            // 忽略删除错误
        }
    }
    sessionRegistry.delete(sessionId);
}

module.exports = { createSession, getSession, consumeSession, deleteSession };
