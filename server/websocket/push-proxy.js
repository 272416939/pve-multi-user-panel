const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/token');
const dbg = require('../utils/debug');

const pushProxy = new WebSocketServer({ noServer: true });

const HEARTBEAT_INTERVAL = 30000;
const STATUS_INTERVAL = 3000;
const UNREAD_INTERVAL = 30000;
const TICKET_TTL = 5 * 60;

const SUBSCRIPTIONS = new Map();

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

let pveApiCache = null;
let dbCache = null;

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
    let counts;
    try {
        const allMessages = await db.messages.getAll();
        const grouped = {};
        for (const m of allMessages) {
            if (m.is_read) continue;
            if (!grouped[m.user_id]) grouped[m.user_id] = 0;
            grouped[m.user_id]++;
        }
        counts = grouped;
    } catch (e) {
        return;
    }

    for (const [ws, info] of SUBSCRIPTIONS) {
        send(ws, { type: 'unread', count: counts[info.userId] || 0 });
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

    for (const vmid of vms) {
        try {
            const raw = await pveApi.getVmStatus(vmid);
            statusCache.set('vm:' + vmid, raw);
        } catch (e) {}
    }
    for (const vmid of lxcs) {
        try {
            const raw = await pveApi.getLxcStatus(vmid);
            statusCache.set('lxc:' + vmid, raw);
        } catch (e) {}
    }

    if (statusCache.size === 0) return;

    for (const [ws, info] of SUBSCRIPTIONS) {
        const updates = [];
        for (const v of info.vms) {
            const s = statusCache.get('vm:' + v);
            if (s) updates.push({ vmid: v, type: 'vm', status: s });
        }
        for (const l of info.lxcs) {
            const s = statusCache.get('lxc:' + l);
            if (s) updates.push({ vmid: l, type: 'lxc', status: s });
        }
        if (updates.length > 0) {
            send(ws, { type: 'status', updates });
        }
    }
}

pushProxy.on('connection', (clientWs, request) => {
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
        vms: new Set(),
        lxcs: new Set(),
        lastPong: Date.now()
    };

    SUBSCRIPTIONS.set(clientWs, info);
    dbg(`[Push] 已连接: ${decoded.username}(${decoded.userId})`);

    const db = getDb();
    db.messages.getUnreadCount ? db.messages.getUnreadCount(decoded.userId)
        .then(c => send(clientWs, { type: 'unread', count: c || 0 }))
        .catch(() => {}) : null;

    const pingInterval = setInterval(() => {
        if (info.lastPong && Date.now() - info.lastPong > HEARTBEAT_INTERVAL * 2) {
            clientWs.terminate();
        }
    }, 15000);

    clientWs.on('pong', () => {
        info.lastPong = Date.now();
    });

    clientWs.on('message', (data) => {
        try {
            const msg = JSON.parse(data.toString());
            switch (msg.type) {
                case 'subscribe':
                    if (msg.vmid && Number.isInteger(msg.vmid)) {
                        if (msg.isLxc) {
                            info.lxcs.add(msg.vmid);
                        } else {
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

function ensureTimers() {
    if (!hbTimer) hbTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    if (!statusTimer) statusTimer = setInterval(pushStatus, STATUS_INTERVAL);
    if (!unreadTimer) unreadTimer = setInterval(pushUnreadCount, UNREAD_INTERVAL);
}

pushProxy.on('connection', () => { ensureTimers(); });

module.exports = pushProxy;
