// server/services/status-cache.js - VM/LXC 实时状态缓存服务
// 规范第七节：状态缓存读写抽离 websocket 层，供路由/轮询服务复用（单一来源）
// 从 websocket/push-proxy.js 抽取：statusCacheGlobal 读写 + 备份恢复完成宽限窗口

// 备份/恢复/切换完成后短暂宽限窗口（ms）：此期间 PVE 可能仍报瞬时 running，
// 若立即放行会闪现运行中。窗口内仍合并为 backup（显示备份中），直到台账落定。
const COMPLETED_GRACE_MS = 5000;

// vmid -> 完成时间戳（内存态，仅用于抑制瞬时闪现）
const recentlyCompleted = new Map();
function markCompleted(vmid) {
    recentlyCompleted.set(vmid, Date.now());
}
function pruneCompleted() {
    const now = Date.now();
    for (const [k, t] of recentlyCompleted) {
        if (now - t > COMPLETED_GRACE_MS) recentlyCompleted.delete(k);
    }
}

// 全局状态缓存（vmid -> { s: status, ts }），供 getStatusCache 读取
const statusCacheGlobal = new Map();

// 写入状态缓存（超过上限时清理最旧条目，防止内存泄漏）
function setStatusCache(key, status) {
    if (statusCacheGlobal.size > 10000) {
        const keysToDelete = Array.from(statusCacheGlobal.keys()).slice(0, 2000);
        keysToDelete.forEach(k => statusCacheGlobal.delete(k));
    }
    statusCacheGlobal.set(key, { s: status, ts: Date.now() });
}

/**
 * 读取 VM/LXC 实时状态缓存（5 秒内有效）
 * @param {string} key - 'vm:<vmid>' | 'lxc:<vmid>'
 * @param {number} [userId] - 兼容旧数据：pushStatus 存储时未带 userId 前缀，回退到不带 userId 的 key
 * @returns {object|null}
 */
function getStatusCache(key, userId) {
    var cacheKey = userId ? userId + ':' + key : key;
    var e = statusCacheGlobal.get(cacheKey);
    if (!e && userId) {
        // 兼容旧数据：pushStatus 存储时未带 userId 前缀，回退到不带 userId 的 key
        e = statusCacheGlobal.get(key);
    }
    if (e && Date.now() - e.ts < 5000) return e.s;
    if (e) statusCacheGlobal.delete(cacheKey);
    return null;
}

/**
 * 标记 backup/restore 完成（供状态推送抑制瞬时 running 闪现）
 * @param {number} vmid
 */
function markBackupRestoreComplete(vmid) {
    markCompleted(vmid);
}

/**
 * 判断 vmid 是否在完成宽限窗口内（台账已不再进行中但 PVE 可能瞬时报 running）
 * @param {number} vmid
 * @returns {boolean}
 */
function isRecentlyCompleted(vmid) {
    pruneCompleted();
    return recentlyCompleted.has(vmid);
}

// ==================== 多节点缓存键（单一来源，读写两端共用防漂移） ====================
// 多节点后 vmid 跨节点可重复，缓存/限速键必须带节点维度：'vm:<nodeId|d>:<id>'
function nodeKeyPart(nodeId) {
    return nodeId == null ? 'd' : String(nodeId);
}
function vmStatusKey(nodeId, vmid) {
    return 'vm:' + nodeKeyPart(nodeId) + ':' + vmid;
}
function lxcStatusKey(nodeId, ctId) {
    return 'lxc:' + nodeKeyPart(nodeId) + ':' + ctId;
}

module.exports = { setStatusCache, getStatusCache, markBackupRestoreComplete, isRecentlyCompleted, pruneCompleted, vmStatusKey, lxcStatusKey, nodeKeyPart };
