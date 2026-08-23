/**
 * password-hash.js - 统一密码哈希工具
 *
 * 安全升级：从 SHA256(salt+password) 迁移到 bcrypt（cost=12）
 * 兼容旧格式：bcrypt / SHA256(salt) / SHA256(无盐)
 * Lazy re-hash：登录验证成功后自动升级旧格式到 bcrypt
 *
 * 性能（2026-08-20 1000 并发注册推演会话）：
 * 原 bcryptjs 是纯 JS 实现，hash 跑在主线程——50 并发实测事件循环停顿 5053ms，
 * 1000 并发注册/登录会把整个 Node 进程冻住数分钟（全站卡死）。
 * 换原生 bcrypt（C++ addon）：async API 走 libuv 线程池，50 并发实测停顿 23ms 零阻塞，
 * 且 hash 格式与 bcryptjs 完全互通（双向 verify 实测兼容，存量用户无缝）。
 * bcryptjs 仅保留给 SHA256 旧格式 verify 路径的 CryptoJS 依赖场景，hash/compare 全走原生包。
 */
const bcrypt = require('bcrypt');
const bcryptjs = require('bcryptjs');
const CryptoJS = require('crypto-js');

const BCRYPT_COST = 12;

/**
 * 使用 bcrypt 哈希密码（原生包 async，libuv 线程池执行，主线程零阻塞）
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

    // 格式1：bcrypt（$2a$ / $2b$ / $2y$ 开头）——原生包 verify（线程池，不卡主线程）
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

/**
 * 密码强度校验（V6-M2 收敛为单一来源：注册 / 找回密码 / 独立改密 / profile 改密共用）
 * 规则：至少 8 位，包含小写字母、大写字母和特殊字符 (@#$%^&*!)
 * @param {string} plain
 * @returns {boolean}
 */
const PASSWORD_STRENGTH_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&*!]).{8,}$/;
function isStrongPassword(plain) {
    return typeof plain === 'string' && PASSWORD_STRENGTH_RE.test(plain);
}

module.exports = { hashPassword, verifyPassword, needsUpgrade, isStrongPassword, BCRYPT_COST };
