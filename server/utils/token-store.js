/**
 * Token Store — 验证码/找回密码 token 的统一存储
 * 优先使用 Redis（短期数据高频读写），Redis 不可用时回退到数据库
 */
const redisClient = require('../api/redis').getRedisClient();
const db = require('../api/db');

// ==================== 验证码（注册验证码） ====================

/**
 * 存储注册验证码
 * @param {string} email - 邮箱
 * @param {string} code - 验证码
 * @param {number} ttlSeconds - 有效期（秒）
 */
async function setRegisterCode(email, code, ttlSeconds) {
    // 先删除数据库中旧的验证码
    await db.passwordResetTokens.deleteByEmailAndType(email, 'register_code');

    if (redisClient) {
        try {
            await redisClient.set('register_code:' + email, code, 'EX', ttlSeconds);
            return;
        } catch (e) {
            console.warn('[token-store] Redis setRegisterCode 失败，回退到数据库:', e.message);
        }
    }
    // 回退：存入数据库
    var expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    var d = new Date(expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60000);
    await db.passwordResetTokens.create({
        userId: 0,
        email: email,
        token: code,
        type: 'register_code',
        expiresAt: d.toISOString().slice(0, 19).replace('T', ' ')
    });
}

/**
 * 获取注册验证码
 * @param {string} email - 邮箱
 * @returns {Promise<string|null>} 验证码或 null
 */
async function getRegisterCode(email) {
    if (redisClient) {
        try {
            var code = await redisClient.get('register_code:' + email);
            if (code) return code;
            // Redis 中没有，可能是回退模式下存入了数据库
        } catch (e) {
            console.warn('[token-store] Redis getRegisterCode 失败，回退到数据库:', e.message);
        }
    }
    // 回退：从数据库查询
    var record = await db.passwordResetTokens.getByEmailAndType(email, 'register_code');
    if (!record) return null;
    if (new Date(record.expires_at) <= new Date()) return null;
    return record.token;
}

/**
 * 删除注册验证码
 * @param {string} email - 邮箱
 */
async function delRegisterCode(email) {
    if (redisClient) {
        try { await redisClient.del('register_code:' + email); } catch (e) {}
    }
    await db.passwordResetTokens.deleteByEmailAndType(email, 'register_code');
}

// ==================== 找回密码 Token ====================

/**
 * 存储找回密码 token
 * @param {string} token - 重置 token
 * @param {number} userId - 用户 ID
 * @param {number} ttlSeconds - 有效期（秒）
 */
async function setResetToken(token, userId, ttlSeconds) {
    // 先删除数据库中旧的 token
    await db.passwordResetTokens.deleteByType(userId, 'password_reset');

    if (redisClient) {
        try {
            await redisClient.set('reset_token:' + token, String(userId), 'EX', ttlSeconds);
            return;
        } catch (e) {
            console.warn('[token-store] Redis setResetToken 失败，回退到数据库:', e.message);
        }
    }
    // 回退：存入数据库
    var expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    var d = new Date(expiresAt.getTime() - expiresAt.getTimezoneOffset() * 60000);
    await db.passwordResetTokens.create({
        userId: userId,
        token: token,
        type: 'password_reset',
        expiresAt: d.toISOString().slice(0, 19).replace('T', ' ')
    });
}

/**
 * 获取找回密码 token 对应的用户 ID
 * @param {string} token - 重置 token
 * @returns {Promise<number|null>} 用户 ID 或 null
 */
async function getResetToken(token) {
    if (redisClient) {
        try {
            var userId = await redisClient.get('reset_token:' + token);
            if (userId) return parseInt(userId);
        } catch (e) {
            console.warn('[token-store] Redis getResetToken 失败，回退到数据库:', e.message);
        }
    }
    // 回退：从数据库查询
    var record = await db.passwordResetTokens.getByToken(token);
    if (!record || record.type !== 'password_reset') return null;
    if (new Date(record.expires_at) <= new Date()) return null;
    return record.user_id;
}

/**
 * 删除找回密码 token
 * @param {string} token - 重置 token
 */
async function delResetToken(token) {
    if (redisClient) {
        try { await redisClient.del('reset_token:' + token); } catch (e) {}
    }
    // 数据库中也删除（兼容回退模式下存入的记录）
    var record = await db.passwordResetTokens.getByToken(token);
    if (record) {
        await db.passwordResetTokens.delete(record.id);
    }
}

module.exports = {
    setRegisterCode,
    getRegisterCode,
    delRegisterCode,
    setResetToken,
    getResetToken,
    delResetToken
};
