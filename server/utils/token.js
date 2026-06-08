const jwt = require('jsonwebtoken');
const CryptoJS = require('crypto-js');
const db = require('../api/db-sqlite');

const JWT_SECRET = process.env.JWT_SECRET || CryptoJS.lib.WordArray.random(32).toString();
const JWT_EXPIRES_IN = '15m';
const REFRESH_TOKEN_DAYS = 7;

function generateToken() {
    return CryptoJS.lib.WordArray.random(32).toString();
}

function generateAccessToken(user, deviceId) {
    const payload = { id: user.id, username: user.username, role: user.role };
    if (deviceId) payload.deviceId = deviceId;
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

function generateRefreshToken() {
    return CryptoJS.lib.WordArray.random(32).toString();
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
