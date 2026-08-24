/**
 * 爱快多节点客户端工厂
 * - getIkuaiClient(nodeId)：按节点返回绑定的 IkuaiApi 门面实例（缓存复用；nodeId 为空时解析默认节点）
 * - getIkuaiClientForPve(pveNodeId)：按 PVE 节点的配对关系（pve_nodes.ikuai_node_id）取爱快客户端——
 *   端口转发/DHCP/VLAN/MAC 分组等 NAT 类操作一律经此路由到资产所在节点的上级爱快
 * - invalidateIkuaiClient(nodeId?)：节点配置增删改后失效缓存实例
 */
const { IkuaiApi } = require('./ikuai-api');

// nodeId -> IkuaiApi 实例
const _clients = new Map();

async function resolveNodeId(nodeId) {
    if (nodeId != null) return nodeId;
    const db = require('./db');
    return await db.ikuaNodes.getDefaultId();
}

async function getIkuaiClient(nodeId) {
    const id = await resolveNodeId(nodeId);
    if (id == null) {
        // 无任何节点的引导路径：默认单例回退读旧全局 config 键
        return require('./ikuai-api');
    }
    let client = _clients.get(id);
    if (!client) {
        client = new IkuaiApi(id);
        _clients.set(id, client);
    }
    return client;
}

/**
 * 按 PVE 节点配对取爱快客户端。pveNodeId 为空时走默认 PVE 节点的配对。
 * 配对缺失（ikuai_node_id 为 NULL）或配对的爱快不存在时抛错，由调用方转为友好提示。
 */
async function getIkuaiClientForPve(pveNodeId) {
    const db = require('./db');
    let pveNode;
    if (pveNodeId != null) {
        pveNode = await db.pveNodes.get(pveNodeId);
    } else {
        pveNode = await db.pveNodes.getDefault();
    }
    if (!pveNode) {
        throw Object.assign(new Error('PVE 节点不存在，无法定位配对爱快'), { code: 'PVE_NODE_NOT_FOUND' });
    }
    if (!pveNode.ikuai_node_id) {
        throw Object.assign(new Error(`PVE 节点「${pveNode.name}」未配置关联爱快节点`), { code: 'IKUAI_NODE_NOT_PAIRED' });
    }
    const ik = await db.ikuaNodes.get(pveNode.ikuai_node_id);
    if (!ik) {
        throw Object.assign(new Error(`PVE 节点「${pveNode.name}」关联的爱快节点已不存在`), { code: 'IKUAI_NODE_NOT_FOUND' });
    }
    return getIkuaiClient(pveNode.ikuai_node_id);
}

function invalidateIkuaiClient(nodeId) {
    if (nodeId == null) {
        _clients.clear();
    } else {
        _clients.delete(Number(nodeId));
    }
}

module.exports = { getIkuaiClient, getIkuaiClientForPve, invalidateIkuaiClient };
