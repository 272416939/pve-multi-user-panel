/**
 * ip-location.js - UApiPro (uapis.cn) IP 归属地查询服务
 *
 * 调用 uapis.cn /api/v1/network/ipinfo 查询公网 IP 归属地：
 * - 认证头 X-API-Key（留空则使用游客免费额度，有限流）
 * - source=commercial 获取中文运营商名（isp）与完整区域信息
 * - 结果带 7 天缓存（Redis 优先，内存回退）
 * - 任何失败静默降级返回 ''，绝不影响主流程
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
    var apiKey = decrypt(await db.config.get('uapipro:api_key') || '');
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
 * 获取 IP 归属地（带 7 天缓存 + 启用开关校验），失败返回 ''
 * 供业务接口（如 /user/devices）使用，绝不抛异常
 * @param {string} ip
 * @returns {Promise<string>}
 */
async function getIpLocation(ip) {
    var normalized = normalizeIp(ip);
    if (!normalized) return '';
    try {
        var enabled = await db.config.get('uapipro:enabled');
        if (enabled !== '1') return '';
        var loc = await ipCache.get(normalized, loadFromUapi);
        return typeof loc === 'string' ? loc : '';
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
 * 批量获取 IP 归属地（去重 + 并发 + 容错，失败返回空串）
 * 供列表类接口（日志页/设备列表）使用，避免 N 次串行外呼
 * @param {string[]} ipList
 * @returns {Promise<Object>} { ip: location } 映射
 */
async function getIpLocations(ipList) {
    var locMap = {};
    var unique = Array.from(new Set((ipList || []).filter(Boolean)));
    if (unique.length > 0) {
        var results = await Promise.allSettled(unique.map(function(ip) { return getIpLocation(ip); }));
        unique.forEach(function(ip, i) {
            if (results[i].status === 'fulfilled') locMap[ip] = results[i].value || '';
        });
    }
    return locMap;
}

module.exports = { getIpLocation, queryIpLocation, getIpLocations, normalizeIp };
