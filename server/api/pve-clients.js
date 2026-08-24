/**
 * PVE 多节点客户端工厂
 * - getPveClient(nodeId)：按节点返回绑定的 PveApi 实例（缓存复用；nodeId 为空时解析默认节点）
 * - invalidatePveClient(nodeId?)：节点配置增删改后失效缓存实例（admin-pve-nodes 路由调用）
 */
const { PveApi } = require('./pve-api');

// nodeId -> PveApi 实例
const _clients = new Map();

async function resolveNodeId(nodeId) {
    if (nodeId != null) return nodeId;
    const db = require('./db');
    const defaultId = await db.pveNodes.getDefaultId();
    if (defaultId == null) {
        // 尚未建立任何节点：返回默认单例（走旧全局键引导路径，全新安装兼容）
        return null;
    }
    return defaultId;
}

async function getPveClient(nodeId) {
    const id = await resolveNodeId(nodeId);
    if (id == null) {
        // 无任何节点的引导路径：默认单例回退读旧全局 config 键
        return require('./pve-api');
    }
    let client = _clients.get(id);
    if (!client) {
        client = new PveApi(id);
        _clients.set(id, client);
    }
    return client;
}

function invalidatePveClient(nodeId) {
    if (nodeId == null) {
        _clients.clear();
    } else {
        _clients.delete(Number(nodeId));
    }
}

module.exports = { getPveClient, invalidatePveClient };
