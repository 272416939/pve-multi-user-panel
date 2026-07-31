// server/utils/audit-log.js - 敏感操作审计日志（V3-14）
// 异步写入、失败不阻断主流程；所有敏感写操作（登录/余额/销毁/删除等）埋点
const db = require('../api/db');

/**
 * 记录审计日志
 * @param {Object} opts
 * @param {number|string} opts.userId - 操作用户 ID（系统/定时任务传 0）
 * @param {string} [opts.username]
 * @param {string} opts.action - 动作，如 'user.login' / 'disk.destroy' / 'vm.destroy'
 * @param {string} [opts.resourceType]
 * @param {string|number} [opts.resourceId]
 * @param {Object} [opts.details]
 * @param {Object} [opts.req] - 可选，提供 req 时自动提取 ip/user_agent
 */
async function auditLog(opts) {
    try {
        if (!opts || !opts.action) return;
        var req = opts.req || null;
        await db.auditLogs.create({
            user_id: opts.userId != null ? opts.userId : (req ? (req.user ? req.user.id : 0) : 0),
            username: opts.username || (req && req.user ? req.user.username : ''),
            action: opts.action,
            resource_type: opts.resourceType || '',
            resource_id: opts.resourceId != null ? opts.resourceId : '',
            ip: (req && req.ip) || '',
            user_agent: (req && req.headers && req.headers['user-agent']) || '',
            details: opts.details || {}
        });
    } catch (e) {
        // 审计失败不影响业务，仅记录服务端日志
        console.warn('[audit] 审计日志写入失败:', e.message);
    }
}

module.exports = { auditLog };