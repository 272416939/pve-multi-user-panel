// server/api/db-ip.js - IP 归属地持久化缓存（ip_locations 表）
// 数据访问层：只做 SQL 封装，不掺业务决策（低耦合规范第七节）。
// 归属地首次外呼查询成功后入库，30 天内直接读库零外呼（TTL 由查询条件过滤过期行）
const { execute, queryAll } = require('./db-core');

// IP 归属地缓存有效期（天）：同一 IP 归属地仅在运营商 IP 段重新规划时变动（月/年级别），
// 30 天过期后重新外呼一次更新（行业惯例展示型业务 7~30 天 TTL）
const IP_LOCATION_TTL_DAYS = 30;

// 归属地缓存操作
const ipLocations = {
    /**
     * 批量读取缓存（只返回 30 天内有更新的有效行；过期行视为未命中）
     * @param {string[]} ips - 归一化后的 IP 列表
     * @returns {Promise<Array<{ip: string, location: string}>>}
     */
    batchGet: async (ips) => {
        var list = Array.from(new Set((ips || []).filter(Boolean)));
        if (list.length === 0) return [];
        var placeholders = list.map(function () { return '?'; }).join(',');
        return queryAll(
            'SELECT ip, location FROM ip_locations WHERE ip IN (' + placeholders + ') AND updated_at > NOW() - INTERVAL ' + IP_LOCATION_TTL_DAYS + ' DAY',
            list
        );
    },
    /**
     * 写入/刷新缓存（首次查询入库；已存在则更新归属地与刷新时间）
     * @param {string} ip - 归一化后的 IP
     * @param {string} location - 归属地文本（空串不写入，避免覆盖有效值）
     */
    upsert: async (ip, location) => {
        if (!ip || !location) return;
        await execute(
            'INSERT INTO ip_locations (ip, location, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE location = VALUES(location), updated_at = NOW()',
            [ip, location]
        );
    }
};

module.exports = { ipLocations, IP_LOCATION_TTL_DAYS };
