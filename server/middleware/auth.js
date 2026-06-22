const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWT_SECRET } = require('../utils/token');
const db = require('../api/db');
const cacheStore = require('../utils/cache-store');

// 设备校验缓存（60s TTL）— 避免每次请求查 DB
const deviceCache = cacheStore.create('device', 60);
// 用户活跃状态缓存（30s TTL）— 禁用用户最多 30s 后被踢出
const userActiveCache = cacheStore.create('user_active', 30);
// JWT 黑名单缓存（默认 24h TTL，实际按 token 剩余有效期设置）
const jwtBlacklistCache = cacheStore.create('jwt_blacklist', 86400);

/**
 * 计算 token 的 SHA256 哈希（作为黑名单 key）
 */
function getTokenHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * 将 access token 加入黑名单（登出时调用）
 * @param {string} token - JWT access token
 * @param {number} exp - token 过期时间戳（秒）
 */
async function blacklistToken(token, exp) {
    var tokenHash = getTokenHash(token);
    var now = Math.floor(Date.now() / 1000);
    var remainingTtl = exp - now;
    if (remainingTtl > 0) {
        await jwtBlacklistCache.set(tokenHash, 1, remainingTtl);
    }
}

/**
 * 清除设备缓存（撤销设备时调用）
 */
async function invalidateDeviceCache(deviceId) {
    if (deviceId) await deviceCache.del(String(deviceId));
}

/**
 * 清除用户活跃状态缓存（禁用/启用用户时调用）
 */
async function invalidateUserActiveCache(userId) {
    if (userId) await userActiveCache.del(String(userId));
}

const authMiddleware = async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '未授权' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.twofa_pending) {
            return res.status(401).json({ error: '2FA 验证未完成' });
        }

        // 1. 检查 JWT 黑名单（登出后立即失效）
        const tokenHash = getTokenHash(token);
        const blacklisted = await jwtBlacklistCache.get(tokenHash);
        if (blacklisted) {
            return res.status(401).json({ error: '令牌已失效', code: 'TOKEN_EXPIRED' });
        }

        // 2. 设备校验（走缓存，避免每请求查 DB）
        if (decoded.deviceId) {
            let device = await deviceCache.get(String(decoded.deviceId));
            if (device === null) {
                // 缓存未命中，查数据库
                const dbDevice = await db.refreshTokens.getById(decoded.deviceId);
                if (!dbDevice || dbDevice.revoked) {
                    return res.status(401).json({ error: '该设备已被强制下线', code: 'TOKEN_EXPIRED' });
                }
                device = { user_id: dbDevice.user_id, revoked: dbDevice.revoked };
                await deviceCache.set(String(decoded.deviceId), device);
            }
            if (!device || device.revoked) {
                return res.status(401).json({ error: '该设备已被强制下线', code: 'TOKEN_EXPIRED' });
            }
        }

        // 3. 检查用户 is_active 状态（走缓存，修复被禁用用户仍可操作的漏洞）
        let isActive = await userActiveCache.get(String(decoded.id));
        if (isActive === null) {
            const user = await db.users.getById(decoded.id);
            if (!user) {
                return res.status(401).json({ error: '用户不存在', code: 'TOKEN_EXPIRED' });
            }
            isActive = user.is_active ? 1 : 0;
            await userActiveCache.set(String(decoded.id), isActive);
        }
        if (!isActive) {
            return res.status(401).json({ error: '账号已被禁用', code: 'ACCOUNT_DISABLED' });
        }

        req.user = decoded;
        next();
    } catch (err) {
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: '令牌已过期', code: 'TOKEN_EXPIRED' });
        }
        return res.status(401).json({ error: '令牌无效' });
    }
};

const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: '需要管理员权限' });
    }
    next();
};

module.exports = {
    authMiddleware,
    adminMiddleware,
    blacklistToken,
    invalidateDeviceCache,
    invalidateUserActiveCache
};
