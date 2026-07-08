/**
 * password-hash.js - 统一密码哈希工具
 *
 * 安全升级：从 SHA256(salt+password) 迁移到 bcrypt（cost=12）
 * 兼容旧格式：bcrypt / SHA256(salt) / SHA256(无盐)
 * Lazy re-hash：登录验证成功后自动升级旧格式到 bcrypt
 */
const bcrypt = require('bcryptjs');
const CryptoJS = require('crypto-js');

const BCRYPT_COST = 12;

/**
 * 使用 bcrypt 哈希密码
 * @param {string} plain - 明文密码
 * @returns {Promise<string>} bcrypt hash（$2b$ 开头）
 */
async function hashPassword(plain) {
    return bcrypt.hash(plain, BCRYPT_COST);
}

/**
 * 验证密码（兼容三种格式）
 * @param {string} plain - 用户输入的明文密码
 * @param {string} hash - 数据库存储的 hash
 * @param {string} [salt] - 旧格式 SHA256 的 salt（bcrypt 不需要）
 * @returns {Promise<boolean>} 是否匹配
 */
async function verifyPassword(plain, hash, salt) {
    if (!hash) return false;

    // 格式1：bcrypt（$2a$ / $2b$ / $2y$ 开头）
    if (hash.startsWith('$2')) {
        return bcrypt.compare(plain, hash);
    }

    // 格式2：SHA256(salt + password) - 旧格式
    if (salt && salt.length > 0) {
        const saltedHash = CryptoJS.SHA256(salt + plain).toString();
        return hash === saltedHash;
    }

    // 格式3：SHA256(password) - 最旧的无盐格式
    const legacyHash = CryptoJS.SHA256(plain).toString();
    return hash === legacyHash;
}

/**
 * 判断 hash 是否需要升级到 bcrypt
 * @param {string} hash - 数据库存储的 hash
 * @returns {boolean} true 表示需要升级
 */
function needsUpgrade(hash) {
    return !hash || !hash.startsWith('$2');
}

module.exports = { hashPassword, verifyPassword, needsUpgrade, BCRYPT_COST };