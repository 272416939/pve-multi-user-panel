/**
 * crypto-utils.js - PVE 敏感配置加密/解密 + 打码工具
 * AES-256-GCM 对称加密，密钥从 JWT_SECRET 派生（PBKDF2）
 */
'use strict';
const crypto = require('crypto');
require('dotenv').config();

// 从 token.js 获取 JWT_SECRET（统一密钥源，确保与 JWT 签名使用同一密钥）
const { JWT_SECRET } = require('./token');
if (!JWT_SECRET) {
    console.error('🚨 [crypto-utils] JWT_SECRET 为空，敏感配置加密将不可用！');
}
// V3-13 修复：支持独立加密密钥 ENCRYPTION_KEY（与 JWT 签名密钥分离，JWT 泄露不影响库内密文）
// 未配置时回退到从 JWT_SECRET 派生（PBKDF2 100k 轮），并输出告警建议配置独立密钥
const ENCRYPTION_KEY_SOURCE = process.env.ENCRYPTION_KEY || JWT_SECRET;
if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠️ [crypto-utils] 未设置独立加密密钥 ENCRYPTION_KEY，当前从 JWT_SECRET 派生加密密钥；' +
        'JWT_SECRET 泄露将导致数据库内 PVE 凭据可解密，生产环境强烈建议设置 ENCRYPTION_KEY');
}
// 从密钥源派生固定加密密钥（PBKDF2 100k 轮），与 JWT 签名隔离
const ENCRYPTION_KEY = crypto.pbkdf2Sync(ENCRYPTION_KEY_SOURCE, 'pve-panel-encryption-salt', 100000, 32, 'sha256');
const ALGORITHM = 'aes-256-gcm';

/**
 * AES-256-GCM 加密
 * @param {string} text - 明文
 * @returns {string} 格式: base64(iv):base64(ciphertext):base64(tag)
 */
function encrypt(text) {
    if (!text) return '';
    var iv = crypto.randomBytes(12);
    var cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    var encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    var tag = cipher.getAuthTag();
    return iv.toString('base64') + ':' + encrypted.toString('base64') + ':' + tag.toString('base64');
}

/**
 * AES-256-GCM 解密
 * @param {string} encrypted - 格式: base64(iv):base64(ciphertext):base64(tag)
 * @returns {string} 明文
 */
function decrypt(encrypted) {
    if (!encrypted) return '';
    // 如果不是加密格式（不含冒号），说明是明文（兼容旧数据）
    if (!encrypted.includes(':')) return encrypted;
    var parts = encrypted.split(':');
    if (parts.length !== 3) return '';
    try {
        var iv = Buffer.from(parts[0], 'base64');
        var ciphertext = Buffer.from(parts[1], 'base64');
        var tag = Buffer.from(parts[2], 'base64');
        var decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch (e) {
        return '';
    }
}

/**
 * 敏感值打码（前端展示用）
 * @param {string} value - 原始值
 * @returns {string} 打码后的值，如 root****-xxxx
 */
function maskSecret(value) {
    if (!value) return '';
    if (value.length < 5) return '****';
    if (value.includes('****')) return value;
    if (value.length <= 6) return value[0] + '****' + value[value.length - 1];
    var prefix = value.substring(0, 4);
    var suffix = value.substring(value.length - 4);
    return prefix + '****' + suffix;
}

/**
 * 判断值是否为打码值（保存时跳过）
 * @param {string} value
 * @returns {boolean}
 */
function isMasked(value) {
    return !!(value && value.includes('****'));
}

module.exports = { encrypt, decrypt, maskSecret, isMasked };
