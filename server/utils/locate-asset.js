/**
 * locate-asset.js - 多节点资产定位工具（vmid/ctid → 台账行）
 *
 * 背景：多节点后 vmid/ctid 只在「单节点内」唯一，跨节点可重复。
 * 旧代码 `getAll().find(v => v.vm_id === id)` 取任意首行存在两类风险：
 *  - 越权面：普通用户请求他人资产编号时可能命中他人行（或被他人行挡住）
 *  - 错节点：命中他节点同号行导致客户端路由到错误 PVE
 *
 * 语义：
 *  - 普通用户：仅在本人名下（user_id === userId）匹配
 *      · 命中 0 行 → { row: null }（调用方按「未分配/无权限」拒绝）
 *      · 命中 ≥2 行（同人跨节点同号）→ { ambiguous: true }，调用方返回 409 AMBIGUOUS_VMID
 *  - 管理员：全量匹配；可选 nodeIdQuery（?node_id=）精确到节点；
 *      未指定且多行 → ambiguous（要求前端带节点参数消歧），单行/零行照常
 *  - 显式 nodeIdQuery 对管理员与普通用户都生效（用于严格分步选择的管理界面）
 */
async function locateAssetRow(type, idNum, opts) {
    // 行内懒加载（utils 叶子层规范，禁止顶层 require api 层）
    var db = require('../api/db');
    var rows;
    if (type === 'lxc') {
        rows = (await db.lxcContainers.getAll()).filter(function (r) { return r.ct_id === idNum; });
    } else {
        rows = (await db.vms.getAll()).filter(function (r) { return r.vm_id === idNum; });
    }

    var isAdmin = !!(opts && opts.isAdmin);
    var userId = opts ? opts.userId : null;
    var nodeIdQuery = opts ? opts.nodeIdQuery : null;

    var parsedNode = null;
    if (nodeIdQuery !== undefined && nodeIdQuery !== null && nodeIdQuery !== '') {
        var n = parseInt(nodeIdQuery);
        if (Number.isInteger(n) && n > 0) parsedNode = n;
    }

    var candidates = rows;
    if (!isAdmin && userId != null) {
        candidates = candidates.filter(function (r) { return r.user_id === userId; });
    }
    if (parsedNode != null) {
        candidates = candidates.filter(function (r) { return r.pve_node_id === parsedNode; });
    }

    if (candidates.length > 1) return { ambiguous: true, total: candidates.length };
    return { row: candidates[0] || null, ambiguous: false };
}

/**
 * 校验并解析节点参数（?node_id= / body.pve_node_id）：
 * 返回节点行（含解密字段的完整行）；无效/不存在/未启用一律返回 null，由调用方统一 400。
 * 安全：用户可控参数必须经此白名单校验后才可用于取客户端/写库。
 */
async function findEnabledNode(raw) {
    var n = parseInt(raw);
    if (!Number.isInteger(n) || n <= 0) return null;
    var db = require('../api/db');
    var node = await db.pveNodes.get(n);
    if (!node || node.enabled === 0) return null;
    return node;
}

module.exports = { locateAssetRow, findEnabledNode };
