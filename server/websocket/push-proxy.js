const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/token');
const { _applyRate } = require('../utils/pve-rate');
const dbg = require('../utils/debug');

const pushProxy = new WebSocketServer({ noServer: true });

const HEARTBEAT_INTERVAL = 30000;
const STATUS_INTERVAL = 3000;
const UNREAD_INTERVAL = 30000;
const TICKET_TTL = 5 * 60;

const SUBSCRIPTIONS = new Map();
const MAX_CONNECTIONS = 1000; // 全局连接上限
const MAX_PER_IP = 20; // 单 IP 连接上限

function validateTicket(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
        if (decoded.type !== 'push') return null;
        if (decoded.exp && Date.now() / 1000 > decoded.exp) return null;
        return decoded;
    } catch (e) {
        return null;
    }
}

function heartbeat() {
    const now = Date.now();
    const dead = [];
    for (const [ws, info] of SUBSCRIPTIONS) {
        if (now - info.lastPong > HEARTBEAT_INTERVAL * 2) {
            dead.push(ws);
        } else if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }
    for (const ws of dead) {
        ws.terminate();
        SUBSCRIPTIONS.delete(ws);
    }
}

function send(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
}

function pushToUser(userId, data) {
    for (const [ws, info] of SUBSCRIPTIONS) {
        if (info.userId === userId) {
            send(ws, data);
        }
    }
}

let pveApiCache = null;
let dbCache = null;
let statusCacheGlobal = new Map();

function getPveApi() {
    if (!pveApiCache) pveApiCache = require('../api/pve-api');
    return pveApiCache;
}

function getDb() {
    if (!dbCache) dbCache = require('../api/db');
    return dbCache;
}

async function pushUnreadCount() {
    const db = getDb();
    for (const [ws, info] of SUBSCRIPTIONS) {
        try {
            const c = await db.messages.getUnreadCount(info.userId);
            send(ws, { type: 'unread', count: typeof c === 'number' ? c : 0 });
        } catch (e) {}
    }
}

async function pushStatus() {
    const pveApi = getPveApi();
    const vms = new Set();
    const lxcs = new Set();

    for (const [, info] of SUBSCRIPTIONS) {
        for (const v of info.vms) { vms.add(v); }
        for (const l of info.lxcs) { lxcs.add(l); }
    }

    const statusCache = new Map();

    // 存储前检查全局缓存大小，超过上限时清理最旧的条目，防止内存泄漏
    if (statusCacheGlobal.size > 10000) {
        const keysToDelete = Array.from(statusCacheGlobal.keys()).slice(0, 2000);
        keysToDelete.forEach(k => statusCacheGlobal.delete(k));
    }

    for (const vmid of vms) {
        try {
            const raw = await pveApi.getVmStatus(vmid);
            const s = _applyRate('vm:' + vmid, raw);
            statusCache.set('vm:' + vmid, s);
            statusCacheGlobal.set('vm:' + vmid, { s, ts: Date.now() });
        } catch (e) {}
    }
    for (const vmid of lxcs) {
        try {
            const raw = await pveApi.getLxcStatus(vmid);
            const s = _applyRate('lxc:' + vmid, raw);
            statusCache.set('lxc:' + vmid, s);
            statusCacheGlobal.set('lxc:' + vmid, { s, ts: Date.now() });
        } catch (e) {}
    }

    if (statusCache.size === 0) return;

    for (const [ws, info] of SUBSCRIPTIONS) {
        const updates = [];
        for (const v of info.vms) {
            const s = statusCache.get('vm:' + v);
            if (s) updates.push({ vmid: v, type: 'vm', status: s, isDetail: info.detailVms.has(v) });
        }
        for (const l of info.lxcs) {
            const s = statusCache.get('lxc:' + l);
            if (s) updates.push({ vmid: l, type: 'lxc', status: s, isDetail: info.detailLxcs.has(l) });
        }
        if (updates.length > 0) {
            send(ws, { type: 'status', updates });
        }
    }
}

async function checkResourceOwnership(userId, role, vmid, isLxc) {
    if (role === 'admin') return true;
    try {
        const db = getDb();
        if (isLxc) {
            const rows = await db.lxcContainers.getByCtId(vmid);
            return rows && rows.some(r => r.user_id === userId);
        } else {
            const vms = await db.vms.getByUserId(userId);
            return vms && vms.some(v => v.vm_id === vmid);
        }
    } catch (e) {
        return false;
    }
}

pushProxy.on('connection', async (clientWs, request) => {
    // PERF-30: 连接数上限检查
    if (SUBSCRIPTIONS.size >= MAX_CONNECTIONS) {
        clientWs.close(1013, '服务器繁忙，连接数已满');
        return;
    }
    const clientIp = (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || request.socket.remoteAddress;
    const ipConnections = Array.from(SUBSCRIPTIONS.values()).filter(s => s.ip === clientIp).length;
    if (ipConnections >= MAX_PER_IP) {
        clientWs.close(1013, '单IP连接数超限');
        return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);
    const ticket = url.searchParams.get('ticket');

    if (!ticket) {
        clientWs.close(4008, '缺少认证参数');
        return;
    }

    const decoded = validateTicket(ticket);
    if (!decoded) {
        clientWs.close(4403, '认证失败或ticket已过期');
        dbg('[Push] 拒绝无效连接');
        return;
    }

    const info = {
        userId: decoded.userId,
        username: decoded.username,
        role: decoded.role || 'user',
        ip: clientIp,
        vms: new Set(),
        lxcs: new Set(),
        detailVms: new Set(),
        detailLxcs: new Set(),
        lastPong: Date.now()
    };

    SUBSCRIPTIONS.set(clientWs, info);
    dbg(`[Push] 已连接: ${decoded.username}(${decoded.userId})`);

    const db = getDb();
    try {
        const c = await db.messages.getUnreadCount(decoded.userId);
        send(clientWs, { type: 'unread', count: typeof c === 'number' ? c : 0 });
    } catch (e) {}

    const areTimersStarted = !!hbTimer;
    if (!areTimersStarted) ensureTimers();

    const pingInterval = setInterval(() => {
        if (info.lastPong && Date.now() - info.lastPong > HEARTBEAT_INTERVAL * 2) {
            clientWs.terminate();
        }
    }, 15000);

    clientWs.on('pong', () => {
        info.lastPong = Date.now();
    });

    clientWs.on('message', async (data) => {
        try {
            const msg = JSON.parse(data.toString());
            switch (msg.type) {
                case 'subscribe':
                    if (msg.vmid && Number.isInteger(msg.vmid)) {
                        if (!(await checkResourceOwnership(decoded.userId, info.role, msg.vmid, msg.isLxc))) {
                            break;
                        }
                        if (msg.isLxc) {
                            info.lxcs.add(msg.vmid);
                        } else {
                            info.vms.add(msg.vmid);
                        }
                    }
                    break;
                case 'subscribe-detail':
                    if (msg.vmid && Number.isInteger(msg.vmid)) {
                        if (!(await checkResourceOwnership(decoded.userId, info.role, msg.vmid, msg.isLxc))) {
                            break;
                        }
                        if (msg.isLxc) {
                            info.detailLxcs.add(msg.vmid);
                            info.lxcs.add(msg.vmid);
                        } else {
                            info.detailVms.add(msg.vmid);
                            info.vms.add(msg.vmid);
                        }
                    }
                    break;
                case 'unsubscribe':
                    if (msg.vmid) {
                        info.vms.delete(msg.vmid);
                        info.lxcs.delete(msg.vmid);
                    }
                    break;
                case 'unsubscribe-detail':
                    if (msg.vmid) {
                        info.detailVms.delete(msg.vmid);
                        info.detailLxcs.delete(msg.vmid);
                    }
                    break;
                case 'ping':
                    send(clientWs, { type: 'pong' });
                    break;
            }
        } catch (e) {}
    });

    clientWs.on('close', () => {
        clearInterval(pingInterval);
        SUBSCRIPTIONS.delete(clientWs);
        dbg(`[Push] 已断开: ${decoded.username}`);
    });

    clientWs.on('error', () => {
        clearInterval(pingInterval);
        SUBSCRIPTIONS.delete(clientWs);
    });
});

let hbTimer = null;
let statusTimer = null;
let unreadTimer = null;
let tickTimer = null;

function ensureTimers() {
    if (!hbTimer) hbTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    if (!statusTimer) statusTimer = setInterval(pushStatus, STATUS_INTERVAL);
    if (!unreadTimer) unreadTimer = setInterval(pushUnreadCount, UNREAD_INTERVAL);
    if (!tickTimer) tickTimer = setInterval(() => {
        for (const [ws] of SUBSCRIPTIONS) {
            send(ws, { type: 'tick' });
        }
    }, 60000);
}

module.exports = pushProxy;
module.exports.pushUnreadCount = pushUnreadCount;
module.exports.pushToUser = pushToUser;
module.exports.getStatusCache = function(key, userId) {
    var cacheKey = userId ? userId + ':' + key : key;
    var e = statusCacheGlobal.get(cacheKey);
    if (!e && userId) {
        // 兼容旧数据：pushStatus 存储时未带 userId 前缀，回退到不带 userId 的 key
        e = statusCacheGlobal.get(key);
    }
    if (e && Date.now() - e.ts < 5000) return e.s;
    if (e) statusCacheGlobal.delete(cacheKey);
    return null;
};
