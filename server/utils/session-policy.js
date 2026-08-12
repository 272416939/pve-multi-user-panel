// 会话活跃/免登录策略（纯函数，叶子层，仅依赖 utils/token 常量）
//
// 语义（与产品约定一致）：
//  - remember=1（登录勾选「7天内无需登录」）：7 天固定倒计时（登录时刻起算，刷新/操作不顺延），
//    7 天内完全不因闲置踢出；超过 7 天转为「2 小时无操作」规则——2 小时内有操作保持登录，
//    连续 2 小时无操作才退出重新登录
//  - remember=0（未勾选）：2 小时无操作即退出重新登录
//
// 注意：last_active_at 只由真实业务请求（authMiddleware 节流）更新；
// 前端每 10 分钟自动保活刷新（/auth/refresh）不更新活跃时间，否则开着的页面永远不踢，功能失效。
const { REFRESH_TOKEN_DAYS } = require('./token');

const INACTIVITY_HOURS = 2;
const INACTIVITY_MS = INACTIVITY_HOURS * 60 * 60 * 1000;

// 统一转毫秒时间戳（DATETIME 字符串 'YYYY-MM-DD HH:MM:SS' 由 V8 按本地时间解析，与 formatLocalDate 写入一致）
function toMs(v) {
    if (v === null || v === undefined || v === '') return null;
    const t = new Date(v).getTime();
    return Number.isNaN(t) ? null : t;
}

/**
 * 计算「7天内无需登录」的固定倒计时锚点（登录时刻 + 7 天，毫秒时间戳）
 */
function computeSessionDeadlineMs(loginTimeMs) {
    return (toMs(loginTimeMs) || Date.now()) + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * 判断 refresh token 是否允许续期
 * @param {object} session - { remember, session_deadline, last_active_at, created_at }（DATETIME 字符串或毫秒时间戳）
 * @param {number} nowMs - 当前时间戳
 * @returns {boolean}
 */
function isRefreshAllowed(session, nowMs) {
    const now = toMs(nowMs) || Date.now();
    const deadline = toMs(session && session.session_deadline);
    // 勾选且未到期：7 天内完全不因闲置踢出（防「勾选了也 2 小时踢」bug）
    if (session && session.remember && deadline && now < deadline) return true;
    // 未勾选 / 勾选但已超 7 天：走「2 小时无操作」规则（last_active_at 缺失回退 created_at）
    const last = toMs((session && session.last_active_at) || (session && session.created_at));
    if (last === null) return true; // 时间缺失（异常数据）时放行，避免误杀正常会话
    return now - last <= INACTIVITY_MS;
}

/**
 * 计算新 refresh token 记录的过期时间（毫秒时间戳）
 * 勾选且未到期 → 恒等于 7 天锚点（固定倒计时，刷新不顺延）；其余 → now + 2 小时
 */
function computeNextExpiryMs(session, nowMs) {
    const now = toMs(nowMs) || Date.now();
    const deadline = toMs(session && session.session_deadline);
    if (session && session.remember && deadline && now < deadline) return deadline;
    return now + INACTIVITY_MS;
}

module.exports = {
    INACTIVITY_HOURS,
    INACTIVITY_MS,
    computeSessionDeadlineMs,
    isRefreshAllowed,
    computeNextExpiryMs
};
