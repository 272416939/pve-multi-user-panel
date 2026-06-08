const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/token');
const db = require('../api/db-sqlite');

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ error: '未授权' });
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.twofa_pending) {
            return res.status(401).json({ error: '2FA 验证未完成' });
        }
        if (decoded.deviceId) {
            const device = db.refreshTokens.getById(decoded.deviceId);
            if (!device || device.revoked) {
                return res.status(401).json({ error: '该设备已被强制下线', code: 'TOKEN_EXPIRED' });
            }
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

module.exports = { authMiddleware, adminMiddleware };
