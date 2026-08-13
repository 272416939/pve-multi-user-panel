/**
 * ip-location.js - UApiPro (uapis.cn) IP 归属地查询服务
 *
 * 调用 uapis.cn /api/v1/network/ipinfo 查询公网 IP 归属地：
 * - 认证头 X-API-Key（留空则使用游客免费额度，有限流）
 * - source=commercial 获取中文运营商名（isp）与完整区域信息
 *
 * 三层缓存架构（行业惯例，避免重复外呼产生费用）：
 * - L2 Redis/内存缓存（7 天 TTL，短期加速层）
 * - L3 数据库持久缓存 ip_locations 表（30 天有效，重启不丢；首次外呼成功后入库）
 * - L1 single-flight 外呼去重：同一 IP 并发查询只外呼一次，成功写回 L2+L3
 * - 任何失败静默降级返回 ''，绝不影响主流程（失败不写负缓存，API 恢复立即生效）
 */
'use strict';
const axios = require('axios');
const db = require('../api/db');
const { decrypt } = require('../utils/crypto-utils');
const cacheStore = require('../utils/cache-store');

const API_URL = 'https://uapis.cn/api/v1/network/ipinfo';
const CACHE_TTL_SECONDS = 7 * 24 * 3600; // 7 天（IP 归属地极少变动）
const REQUEST_TIMEOUT = 5000;

const ipCache = cacheStore.create('ip-location', CACHE_TTL_SECONDS);

// uapipro 启用开关缓存（60s TTL）：日志页每行 IP 都调用 getIpLocation，
// 若每次查 DB 配置，一页 20 行 = 20 次并发 DB 查询，属无谓开销
const ENABLED_CACHE_TTL = 60 * 1000;
let enabledCache = null;
let enabledCacheTime = 0;

// uapipro API Key 缓存（60s TTL）：外呼并发时避免每个外呼各查一次 DB（解密开销亦省）
let apiKeyCache = null;
let apiKeyCacheTime = 0;

/** 读取 uapipro 启用开关（60s 内存缓存，保存配置时调用 invalidateEnabledCache 失效） */
async function isUapiProEnabled() {
    var now = Date.now();
    if (enabledCache !== null && now - enabledCacheTime < ENABLED_CACHE_TTL) {
        return enabledCache;
    }
    try {
        enabledCache = (await db.config.get('uapipro:enabled')) === '1';
    } catch (e) {
        enabledCache = false;
    }
    enabledCacheTime = now;
    return enabledCache;
}

/** 读取 uapipro API Key（60s 内存缓存，与启用开关共用失效入口） */
async function getApiKeyCached() {
    var now = Date.now();
    if (apiKeyCache !== null && now - apiKeyCacheTime < ENABLED_CACHE_TTL) {
        return apiKeyCache;
    }
    try {
        apiKeyCache = decrypt(await db.config.get('uapipro:api_key') || '');
    } catch (e) {
        apiKeyCache = '';
    }
    apiKeyCacheTime = now;
    return apiKeyCache;
}

/** 保存 UApiPro 配置后失效开关/Key 缓存（admin-config.js 调用） */
function invalidateEnabledCache() {
    enabledCache = null;
    enabledCacheTime = 0;
    apiKeyCache = null;
    apiKeyCacheTime = 0;
}

// 同一 IP 的进行中外呼（single-flight 去重）：
// 多个请求同时查询同一 IP 时只外呼一次，其余请求复用其结果，避免并发重复外呼
const inFlight = new Map();

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

/**
 * 归一化并校验 IP：剥离 ::ffff: 前缀；内网/保留/回环地址跳过（无需查询）
 * @param {string} ip
 * @returns {string|null} 规范化后的公网 IP；不合法或内网地址返回 null
 */
function normalizeIp(ip) {
    if (!ip || typeof ip !== 'string') return null;
    var value = ip.trim();
    if (!value) return null;
    // 剥离 IPv4-mapped IPv6 前缀（Express req.ip 在双栈下可能为 ::ffff:1.2.3.4）
    if (value.toLowerCase().startsWith('::ffff:')) {
        value = value.substring(7);
    }
    var m = IPV4_RE.exec(value);
    if (m) {
        var parts = m.slice(1).map(Number);
        if (parts.some(function (p) { return p > 255; })) return null;
        if (isPrivateIpv4(parts)) return null;
        return value;
    }
    if (IPV6_RE.test(value)) {
        var lower = value.toLowerCase();
        // 回环 ::1、未指定 ::、链路本地 fe80::、ULA fc00::/7
        if (lower === '::1' || lower === '::' || lower.startsWith('fe80:') ||
            lower.startsWith('fc') || lower.startsWith('fd')) {
            return null;
        }
        return value;
    }
    return null;
}

/** 判断 IPv4 是否为内网/保留/回环段 */
function isPrivateIpv4(parts) {
    var a = parts[0];
    var b = parts[1];
    if (a === 10) return true;                       // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true;          // 192.168.0.0/16
    if (a === 127) return true;                       // 回环
    if (a === 0) return true;                         // 未指定
    if (a === 169 && b === 254) return true;          // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
    return false;
}

/**
 * 清洗 region 并拼装展示文本：isp + ' ' + region
 * "示例省 示例市 示例区 示例区" → 去连续重复 → "示例省 示例市 示例区"（再由 stripAdminSuffix 去行政区后缀）
 * @param {object} data - uapis.cn 响应体
 * @returns {string|null}
 */
function formatLocation(data) {
    if (!data || typeof data !== 'object') return null;
    var region = (typeof data.region === 'string' ? data.region : '').trim();
    var isp = (typeof data.isp === 'string' ? data.isp : '').trim();
    var llc = (typeof data.llc === 'string' ? data.llc : '').trim();
    if (!region && !isp && !llc) return null;

    var parts = [];
    var seen = {};
    region.split(/\s+/).filter(Boolean).forEach(function (seg) {
        if (seen[seg]) return; // 去连续重复（如 "示例区 示例区"）
        seen[seg] = true;
        parts.push(parts.length === 0 ? seg : stripAdminSuffix(seg));
    });

    var provider = isp || llc;
    var text = parts.join(' ');
    if (provider) text = provider + ' ' + text;
    return text.trim() || null;
}

/** 去除行政区后缀（首段即国家名不处理）："海南省"→"海南"、"内蒙古自治区"→"内蒙古" */
function stripAdminSuffix(seg) {
    return seg
        .replace(/(特别行政区|自治区|自治州|自治县|自治旗)$/, '')
        .replace(/(壮族|回族|维吾尔族|藏族|蒙古族)$/, '') // 广西壮族自治区 → 广西
        .replace(/[省市区县盟旗]$/, '');
}

/** 从 uapis.cn 查询（真实外呼，无缓存） */
async function loadFromUapi(ip) {
    var apiKey = await getApiKeyCached();
    var headers = {};
    if (apiKey) headers['X-API-Key'] = apiKey;
    var resp = await axios.get(API_URL, {
        params: { ip: ip, source: 'commercial' },
        headers: headers,
        timeout: REQUEST_TIMEOUT
    });
    var data = resp.data;
    if (!data || typeof data !== 'object' || data.error) return null;
    return formatLocation(data);
}

/**
 * 获取 IP 归属地（三层缓存：Redis 短期层 → DB 持久层 → 外呼写回），失败返回 ''
 * 供业务接口（如 /user/devices）使用，绝不抛异常
 * @param {string} ip
 * @returns {Promise<string>}
 */
async function getIpLocation(ip) {
    var normalized = normalizeIp(ip);
    if (!normalized) return '';
    try {
        if (!(await isUapiProEnabled())) return '';
        // L2: Redis/内存缓存（7 天 TTL，短期加速层；重启即丢）
        var loc = await ipCache.get(normalized);
        if (loc !== null) {
            return typeof loc === 'string' ? loc : '';
        }
        // L3: DB 持久缓存（30 天有效，重启不丢；命中零外呼，顺带回填 Redis 短期层）
        try {
            var rows = await db.ipLocations.batchGet([normalized]);
            if (rows.length > 0 && rows[0].location) {
                ipCache.set(normalized, rows[0].location).catch(function () {});
                return rows[0].location;
            }
        } catch (e) {
            console.error('[IP归属地] 读缓存表失败:', ip, e.message);
        }
        // L1: single-flight：同一 IP 已有外呼进行中时直接复用，不重复外呼
        if (inFlight.has(normalized)) {
            return inFlight.get(normalized);
        }
        var pending = (async () => {
            var fetched = await loadFromUapi(normalized);
            if (fetched) {
                // 显式 set 而非 loader 形式：外呼失败（null）不写缓存，
                // 避免失败结果被负缓存（cache-store 对 null 缓存 TTL/4），API 恢复后立即生效
                ipCache.set(normalized, fetched).catch(function () {});
                // 首次查询入库（30 天有效）；入库失败不影响本次返回
                try { await db.ipLocations.upsert(normalized, fetched); } catch (e) {
                    console.error('[IP归属地] 写入缓存表失败:', normalized, e.message);
                }
                return fetched;
            }
            return '';
        })().finally(function() {
            inFlight.delete(normalized);
        });
        inFlight.set(normalized, pending);
        return pending;
    } catch (e) {
        console.error('[IP归属地] 查询失败:', ip, e.message);
        return '';
    }
}
/**
 * 强制新鲜查询一次（供 admin 测试接口使用，不走缓存、不受启用开关限制）
 * @param {string} ip
 * @returns {Promise<{ip: string, location: string}>}
 */
async function queryIpLocation(ip) {
    var normalized = normalizeIp(ip);
    if (!normalized) throw new Error('仅支持公网 IPv4/IPv6 地址');
    var location = await loadFromUapi(normalized);
    return { ip: normalized, location: location || '' };
}

/**
 * 批量获取 IP 归属地（去重 + 先批量读 DB 持久缓存 + 未命中并发外呼写回，失败返回空串）
 * 供列表类接口（日志页/设备列表）使用，避免 N 次串行外呼
 * @param {string[]} ipList
 * @param {Object} [opts] - { timeBudgetMs }：外呼阶段的耗时预算（毫秒），0/缺省 = 无限制（等待全部完成）。
 *   清 Redis 后缓存未命中的 IP 需外呼（每个最多 5s 超时）——列表接口传预算保证首屏不阻塞；
 *   超预算未完成的外呼不取消，后台继续执行并写回 Redis/DB 缓存（getIpLocation 内部完成），
 *   本次响应归属地留空，下次加载命中缓存零外呼
 * @returns {Promise<Object>} { ip: location } 映射
 */
async function getIpLocations(ipList, opts) {
    var timeBudgetMs = (opts && opts.timeBudgetMs > 0) ? opts.timeBudgetMs : 0;
    var startedAt = Date.now();
    var locMap = {};
    var unique = Array.from(new Set((ipList || []).filter(Boolean)));
    if (unique.length === 0) return locMap;
    // L3: 先批量读 DB 持久缓存（1 次 IN 查询），命中即零外呼
    try {
        var cached = await db.ipLocations.batchGet(unique);
        cached.forEach(function (r) {
            if (r.location) locMap[r.ip] = r.location;
        });
    } catch (e) {
        console.error('[IP归属地] 批量读缓存表失败:', e.message);
    }
    // 未命中的 IP 走单查链路（Redis → 外呼 → 写回 DB）
    var missing = unique.filter(function (ip) { return !locMap[ip]; });
    if (missing.length > 0) {
        // 每个任务完成后写入共享 locMap（JS 单线程无竞态）；
        // getIpLocation 内部已把成功结果写回 Redis/DB 缓存
        var settled = Promise.allSettled(missing.map(function (ip) {
            return getIpLocation(ip).then(function (loc) { if (loc) locMap[ip] = loc; });
        }));
        if (timeBudgetMs > 0) {
            var remaining = timeBudgetMs - (Date.now() - startedAt);
            if (remaining > 0) {
                await Promise.race([settled, delay(remaining)]);
            }
            // 预算耗尽即返回：未完成的外呼继续后台执行并写回缓存，
            // 本次响应归属地留空，下次加载命中缓存零外呼（不丢数据、不增费用）
        } else {
            await settled;
        }
    }
    return locMap;
}

/** 延迟工具（时间预算用） */
function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

module.exports = { getIpLocation, queryIpLocation, getIpLocations, normalizeIp, invalidateEnabledCache };
