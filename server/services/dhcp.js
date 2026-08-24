const crypto = require('crypto');
const db = require('../api/db');

// IP 地址转数值（比较大小用）
function ipToInt(ip) {
    return ip.split('.').reduce((acc, part) => acc * 256 + parseInt(part), 0);
}

/**
 * 解析爱快节点上下文（多节点）：
 * @param {object|null} nodeCtx - { pveNodeId } 或 { ikuaiNodeId }；缺省=默认爱快节点（旧单节点行为兼容）
 * @returns {Promise<{client: object|null, nodeId: number|null}>} client 为 null 表示无可用的爱快节点
 */
async function resolveIkuaiCtx(nodeCtx) {
    try {
        let nodeId = null;
        if (nodeCtx && nodeCtx.ikuaiNodeId != null) {
            nodeId = nodeCtx.ikuaiNodeId;
        } else if (nodeCtx && nodeCtx.pveNodeId != null) {
            const pn = await db.pveNodes.get(nodeCtx.pveNodeId);
            nodeId = pn ? pn.ikuai_node_id : null;
            if (!nodeId) return { client: null, nodeId: null }; // PVE 节点未配对爱快
        } else {
            nodeId = await db.ikuaNodes.getDefaultId();
        }
        if (nodeId == null) return { client: null, nodeId: null };
        const { getIkuaiClient } = require('../api/ikuai-clients');
        const client = await getIkuaiClient(nodeId);
        return { client, nodeId };
    } catch (e) {
        console.error('[DHCP] 解析爱快节点失败:', e.message);
        return { client: null, nodeId: null };
    }
}

// 判断 IP 是否在地址池内（addr_pool 格式: "172.16.0.2-172.16.0.255"）
function isIpInAddrPool(ip, addrPool) {
    if (!ip || !addrPool) return false;
    const parts = String(addrPool).split('-');
    if (parts.length !== 2) return false;
    const start = parts[0].trim();
    const end = parts[1].trim();
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
    const ipNum = ipToInt(ip);
    return ipNum >= ipToInt(start) && ipNum <= ipToInt(end);
}

// 解析地址池起止（subnet 传 { addr_pool }），返回 { startNum, endNum, prefix }
function parsePool(subnet) {
    const pool = (subnet && subnet.addr_pool) ? subnet.addr_pool : '';
    if (pool) {
        const parts = String(pool).split('-');
        if (parts.length === 2) {
            const startParts = parts[0].trim().split('.').map(Number);
            const endParts = parts[1].trim().split('.').map(Number);
            if (startParts.length === 4 && endParts.length === 4) {
                return {
                    startNum: startParts[3] || 2,
                    endNum: endParts[3] || 255,
                    prefix: startParts.slice(0, 3).join('.') + '.'
                };
            }
        }
    }
    return null;
}

async function pickUnusedStaticIp(subnet, nodeCtx) {
    const { client, nodeId } = await resolveIkuaiCtx(nodeCtx);
    if (!client) return '';
    try {
        let rangeStart, rangeEnd, subnetPrefix;
        const parsed = parsePool(subnet);
        if (parsed) {
            rangeStart = parsed.startNum;
            rangeEnd = parsed.endNum;
            subnetPrefix = parsed.prefix;
        } else {
            // 回退：未绑定子网时使用该节点的 DHCP 配置范围
            const startFull = (await db.config.getIkuaiSetting('dhcp:ip_range_start', nodeId)) || '10.0.0.110';
            const endFull = (await db.config.getIkuaiSetting('dhcp:ip_range_end', nodeId)) || '10.0.0.199';
            rangeStart = parseInt(startFull.split('.').pop()) || 110;
            rangeEnd = parseInt(endFull.split('.').pop()) || 199;
            subnetPrefix = startFull.split('.').slice(0, 3).join('.') + '.';
        }

        const bindings = await client.getDhcpStaticBindings();
        const usedIps = new Set(bindings.map(b => b.ip));

        const candidates = [];
        for (let i = rangeStart; i <= rangeEnd; i++) {
            const ip = subnetPrefix + i;
            if (!usedIps.has(ip)) candidates.push(ip);
        }
        if (candidates.length === 0) {
            console.warn('[DHCP] IP 范围已用尽:', rangeStart + '-' + rangeEnd);
            return '';
        }
        const picked = candidates[crypto.randomInt(0, candidates.length)];
        return picked;
    } catch (e) {
        console.error('[DHCP] 选取空闲 IP 失败:', e.message);
        return '';
    }
}

// nodeCtx: { pveNodeId } / { ikuaiNodeId }，见 resolveIkuaiCtx
async function createDhcpStaticBinding(type, vmid, mac, preferredIp, subnet, nodeCtx) {
    const { client, nodeId } = await resolveIkuaiCtx(nodeCtx);
    if (!client || !mac) return '';
    try {
        const bindings = await client.getDhcpStaticBindings();
        const existing = bindings.find(b => b.mac === mac.toLowerCase());
        if (existing) {
            console.log(`[DHCP] MAC ${mac} 已有静态绑定: ${existing.ip}，跳过创建`);
            return existing.ip;
        }

        // 优先使用指定的 IP（用户手动输入），否则在子网池/配置范围内随机选取
        let ip = '';
        if (preferredIp) {
            const ipBase = preferredIp.split('/')[0]; // 去掉 CIDR 后缀
            const alreadyUsed = bindings.some(b => b.ip === ipBase);
            if (alreadyUsed) {
                console.warn(`[DHCP] 指定 IP ${ipBase} 已被占用，改为随机选取`);
            } else {
                ip = ipBase;
            }
        }
        if (!ip) {
            ip = await pickUnusedStaticIp(subnet, nodeCtx);
        }
        if (!ip) return '';

        const comment = type === 'vm' ? `VM-${vmid}` : `CT-${vmid}`;
        // 已绑定子网时使用子网的 VLAN 接口/网关，否则回退节点 DHCP 配置
        const iface = (subnet && subnet.vlan_name) ? subnet.vlan_name : ((await db.config.getIkuaiSetting('dhcp:interface', nodeId)) || 'lan2');
        const gateway = (subnet && subnet.gateway) ? subnet.gateway : ((await db.config.getIkuaiSetting('dhcp:gateway', nodeId)) || '10.0.0.1');
        const dns1 = (await db.config.getIkuaiSetting('dhcp:dns1', nodeId)) || '180.76.76.76';
        const dns2 = (await db.config.getIkuaiSetting('dhcp:dns2', nodeId)) || '223.5.5.5';

        await client.addDhcpStaticBinding(mac, ip, comment, iface, gateway, dns1, dns2);
        console.log(`[DHCP] 静态绑定创建成功: ${type}/${vmid} ${mac} → ${ip} (${iface})`);
        return ip;
    } catch (e) {
        console.error(`[DHCP] 创建静态绑定失败 (${type}/${vmid}):`, e.message);
        return '';
    }
}

// 重新绑定 DHCP 静态绑定（解绑旧子网后换绑新子网 / 开机兜底）：先删旧绑定，再在新子网池分配 IP 创建
async function rebindDhcpForDevice(type, vmid, subnet, mac, nodeCtx) {
    await removeDhcpStaticBinding(type, vmid, nodeCtx);
    if (!mac || !subnet) return '';
    const ip = await pickUnusedStaticIp(subnet, nodeCtx);
    if (!ip) return '';
    return createDhcpStaticBinding(type, vmid, mac, ip, subnet, nodeCtx);
}

async function removeDhcpStaticBinding(type, vmid, nodeCtx) {
    const { client } = await resolveIkuaiCtx(nodeCtx);
    if (!client) return;
    try {
        const bindings = await client.getDhcpStaticBindings();
        const comment = type === 'vm' ? `VM-${vmid}` : `CT-${vmid}`;
        const match = bindings.find(b => b.comment === comment);
        if (match && match.id) {
            await client.deleteDhcpStaticBinding(match.id);
            console.log(`[DHCP] 静态绑定已删除: ${comment} (IP=${match.ip})`);
        }
    } catch (e) {
        console.error(`[DHCP] 删除静态绑定失败 (${type}/${vmid}):`, e.message);
    }
}

async function updateDhcpStaticBindingIp(type, vmid, newIp, nodeCtx) {
    const { client } = await resolveIkuaiCtx(nodeCtx);
    if (!client) return false;
    try {
        const bindings = await client.getDhcpStaticBindings();
        const comment = type === 'vm' ? `VM-${vmid}` : `CT-${vmid}`;
        const match = bindings.find(b => b.comment === comment);
        if (match && match.id) {
            await client.editDhcpStaticBinding(match.id, match.mac, newIp, comment);
            console.log(`[DHCP] 静态绑定 IP 更新成功: ${comment} → ${newIp}`);
            return true;
        } else {
            console.warn(`[DHCP] 未找到 ${comment} 的静态绑定`);
            return false;
        }
    } catch (e) {
        console.error(`[DHCP] 更新静态绑定 IP 失败 (${type}/${vmid}):`, e.message);
        return false;
    }
}

async function getWanInterface(nodeCtx) {
    const ifaces = await getWanInterfaces(nodeCtx);
    return ifaces[0] || '';
}

// 支持多外网线路：返回所有已配置的外网接口数组（按爱快节点作用域读取配置）
async function getWanInterfaces(nodeCtx) {
    const { client, nodeId } = await resolveIkuaiCtx(nodeCtx);
    const raw = await db.config.getIkuaiSetting('forward:wan_interface', nodeId);
    // 新格式：JSON 数组字符串 ["wan1","wan2"]
    if (raw) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                if (parsed.length > 0) return parsed.filter(Boolean);
            } else if (typeof parsed === 'string' && parsed) {
                return [parsed];
            }
        } catch (_) {
            // 旧格式：单个接口名字符串
            if (raw) return [raw];
        }
    }
    // 未配置：自动检测
    if (!client) return [];
    try {
        const ifaces = await client.getInterfaces();
        const wanIfaces = ifaces.filter(i => i.type === 'wan');
        if (wanIfaces.length > 0) {
            const firstWan = wanIfaces[0].name;
            await db.config.setIkuaiSetting('forward:wan_interface', JSON.stringify([firstWan]), nodeId);
            console.log('[端口转发] 自动检测到外网接口:', firstWan);
            return [firstWan];
        }
    } catch (e) {
        console.error('[端口转发] 自动检测外网接口失败:', e.message);
    }
    return [];
}

module.exports = { createDhcpStaticBinding, removeDhcpStaticBinding, updateDhcpStaticBindingIp, pickUnusedStaticIp, rebindDhcpForDevice, isIpInAddrPool, getWanInterface, getWanInterfaces, resolveIkuaiCtx };
