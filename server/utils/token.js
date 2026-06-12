const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const fs = require('fs');
const path = require('path');
const db = require('../api/db');

// 尝试从多个来源获取 JWT_SECRET
let JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    // 尝试从持久化文件读取
    const secretFile = path.join(__dirname, '../../.jwt-secret');
    try {
        if (fs.existsSync(secretFile)) {
            JWT_SECRET = fs.readFileSync(secretFile, 'utf8').trim();
        }
    } catch (e) {}

    if (!JWT_SECRET) {
        // 生成新的并持久化
        JWT_SECRET = require('crypto').randomBytes(64).toString('hex');
        try {
            fs.writeFileSync(secretFile, JWT_SECRET, 'utf8');
            console.log('已生成新的 JWT_SECRET 并保存到 .jwt-secret 文件');
        } catch (e) {
            console.warn('无法保存 JWT_SECRET 到文件，每次重启将生成新 token');
        }
    }
}
// M-10 修复：检测示例/危险 JWT_SECRET 值
const DANGEROUS_SECRETS = ['your-secret-key-change-this-in-production', 'secret', 'jwt-secret', 'change-me', 'default-secret', '', 'undefined', 'null'];
if (DANGEROUS_SECRETS.includes(JWT_SECRET)) {
    console.error('');
    console.error('╔════════════════════════════════════════╗');
    console.error('║  🚨 安全警告：JWT_SECRET 使用了示例值！     ║');
    console.error('║  请立即设置为随机密钥！                ║');
    console.error('╚════════════════════════════════════════╝');
    console.error('');
}
const JWT_EXPIRES_IN = '60m';
const REFRESH_TOKEN_DAYS = 7;

function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generateAccessToken(user, deviceId) {
    const payload = { id: user.id, username: user.username, role: user.role };
    if (deviceId) payload.deviceId = deviceId;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
}

function generatePartialToken(user) {
    return jwt.sign(
        { id: user.id, username: user.username, role: user.role, twofa_pending: true },
        JWT_SECRET,
        { expiresIn: '5m' }
    );
}

module.exports = {
    JWT_SECRET,
    JWT_EXPIRES_IN,
    REFRESH_TOKEN_DAYS,
    generateToken,
    generateAccessToken,
    generateRefreshToken,
    generatePartialToken
};
