/**
 * log-format.js - 日志详情/CSV 展示文本统一组装（单一来源）
 *
 * 从 routes/log.js 抽出，供用户端（routes/log.js）与 admin 端（routes/admin-logs.js）
 * 共同复用，禁止双份拷贝。utils 叶子层，仅依赖 utils/csv.js。
 */
'use strict';

const { escapeCsvField } = require('../utils/csv');

// details 兼容三种形态：展示文本 / JSON 对象（旧记录）/ JSON 字符串
function buildDetailText(details) {
    if (!details) return '';
    var trimmed = String(details).trim();
    if (trimmed.indexOf('{') === 0) {
        try {
            var obj = JSON.parse(trimmed);
            if (obj && typeof obj === 'object') {
                if (typeof obj.text === 'string') return obj.text;
                return JSON.stringify(obj);
            }
        } catch (_) { /* 非 JSON，按原文展示 */ }
    }
    return trimmed;
}

// 组装 user.login 行详情：登录成功,帐号:xxx,登录IP:ip:port>归属地:xxx
function buildLoginDetailText(obj, location) {
    var statusText = obj.status === 'failed' ? '登录失败' : '登录成功';
    var parts = [statusText];
    if (obj.account) parts.push('帐号:' + obj.account);
    if (obj.ip) {
        var ipPart = obj.ip;
        if (location) ipPart += '>归属地:' + location;
        parts.push('登录IP:' + ipPart);
    }
    if (obj.device && !obj.account && !obj.ip) parts.push('设备:' + obj.device);
    return parts.join(',');
}

// 组装操作日志详情展示文本：
// - user.login 行按「登录成功,帐号:xxx,登录IP:ip>归属地:xxx」格式（已含归属地，不再加前缀）
// - 其余行取文本（兼容旧 JSON 记录）并加操作者 IP 归属地前缀：IP(归属地) 详情
// - 列表与导出共用
function buildRowDetail(r, locMap) {
    if (r.action === 'user.login') {
        // user.login 详情已含 登录IP:...>归属地:...，加前缀会重复，直接返回
        try {
            var obj = JSON.parse(r.details || '{}');
            if (obj && typeof obj === 'object') {
                var rawIp = String(obj.ip || '').replace(/:\d+$/, '');
                return buildLoginDetailText(obj, locMap[rawIp] || '');
            }
            return buildDetailText(r.details);
        } catch (_) {
            return buildDetailText(r.details);
        }
    }
    var detailText = buildDetailText(r.details);
    var ipPrefix = '';
    if (r.ip) {
        ipPrefix = r.ip + (locMap[r.ip] ? '(' + locMap[r.ip] + ') ' : ' ');
    }
    return ipPrefix + detailText;
}

// Excel/WPS 打开 CSV 时会把 yyyy-MM-dd HH:mm:ss 自动识别为日期并隐藏秒（默认格式 yyyy/m/d h:mm），
// 时间字段追加零宽空格(U+200B)强制按文本原样显示，保证秒可见
const CSV_TIME_SUFFIX = '\u200B';

// 导出时间字段（含秒）+ 零宽空格防 Excel 吞秒
function csvTime(v) {
    return v ? String(v) + CSV_TIME_SUFFIX : '';
}

module.exports = { buildDetailText, buildLoginDetailText, buildRowDetail, csvEscape: escapeCsvField, csvTime, CSV_TIME_SUFFIX };
