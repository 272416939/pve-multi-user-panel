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

/**
 * 统一审计埋点封装（路由层专用，消除各路由文件重复包装函数）：
 * - 自动从 req.user 取 userId/username
 * - resourceType 默认取 action 首段（vm.start → 'vm'），可用 opts 覆盖
 * - resourceId 默认从 req.params.vmid 提取（整数校验），可用 opts 覆盖
 * - 内置 try/catch，审计失败绝不影响主业务
 * @param {Object} req
 * @param {string} action - 域.动作 点分命名，如 'vm.start' / 'network.port.add'
 * @param {string} details - 中文可读展示文本（含套餐名/容量/金额/IP 归属地等明细）
 * @param {Object} [opts] - { resourceType, resourceId } 覆盖默认提取
 */
async function auditAction(req, action, details, opts) {
    try {
        opts = opts || {};
        var resourceType = opts.resourceType || String(action || '').split('.')[0] || '';
        var resourceId = (opts.resourceId !== undefined) ? opts.resourceId : '';
        if (!resourceId && req && req.params) {
            var vmid = parseInt(req.params.vmid);
            if (Number.isInteger(vmid)) resourceId = vmid;
        }
        await auditLog({
            userId: (req && req.user) ? req.user.id : 0,
            username: (req && req.user) ? req.user.username : '',
            action: action,
            resourceType: resourceType,
            resourceId: resourceId,
            details: details,
            req: req
        });
    } catch (_) {}
}

module.exports = { auditLog, auditAction };