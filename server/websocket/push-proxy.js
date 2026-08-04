const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../utils/token');
const { _applyRate } = require('../utils/pve-rate');
const dbg = require('../utils/debug');
// 状态缓存读写抽离到 services/status-cache.js（规范第七节：websocket 只做连接管理与推送）
const statusCache = require('../services/status-cache');

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

    const statusCacheLocal = new Map();

    for (const vmid of vms) {
        try {
            const raw = await pveApi.getVmStatus(vmid);
            const s = _applyRate('vm:' + vmid, raw);
            statusCacheLocal.set('vm:' + vmid, s);
            statusCache.setStatusCache('vm:' + vmid, s);
        } catch (e) {}
    }
    for (const vmid of lxcs) {
        try {
            const raw = await pveApi.getLxcStatus(vmid);
            const s = _applyRate('lxc:' + vmid, raw);
            statusCacheLocal.set('lxc:' + vmid, s);
            statusCache.setStatusCache('lxc:' + vmid, s);
        } catch (e) {}
    }

    // 并行查询 DB 台账，合并"进行中"状态到推送，避免 PVE status 与台账竞态造成徽标闪现
    const busyMap = await computeBusyState(vms, lxcs);

    if (statusCacheLocal.size === 0) return;

    for (const [ws, info] of SUBSCRIPTIONS) {
        const updates = [];
        for (const v of info.vms) {
            const s = statusCacheLocal.get('vm:' + v);
            if (s) {
                const st = Object.assign({}, s);
                const busy = busyMap.vm.get(v);
                if (busy) { st.status = busy; }
                updates.push(Object.assign({ vmid: v, type: 'vm', status: st, isDetail: info.detailVms.has(v) }, busy ? { busy } : {}));
            }
        }
        for (const l of info.lxcs) {
            const s = statusCacheLocal.get('lxc:' + l);
            if (s) {
                const st = Object.assign({}, s);
                const busy = busyMap.lxc.get(l);
                if (busy) { st.status = busy; }
                updates.push(Object.assign({ vmid: l, type: 'lxc', status: st, isDetail: info.detailLxcs.has(l) }, busy ? { busy } : {}));
            }
        }
        if (updates.length > 0) {
            send(ws, { type: 'status', updates });
        }
    }
}

// 汇总 DB 台账的进行中状态，返回 Map：vm -> 'switch'|'backup'|'restore'，lxc -> 'backup'|'restore'
// 仅在 VM/容器确实有进行中任务时返回（此时 ws 推送的瞬时 PVE status 不可信，避免闪现运行中）
async function computeBusyState(vms, lxcs) {
    const db = getDb();
    const result = { vm: new Map(), lxc: new Map() };
    try {
        statusCache.pruneCompleted();
        // 备份（含 pending/running）
        const runningBackups = await db.backups.getRunningBackups();
        const runningRestores = await db.restoreTasks.getRunning();
        const backupVms = new Set(), restoreVms = new Set();
        const backupCts = new Set(), restoreCts = new Set();
        runningBackups.forEach(b => {
            if (b.type === 'lxc' && b.ct_id) backupCts.add(b.ct_id);
            else if (b.vm_id) backupVms.add(b.vm_id);
        });
        runningRestores.forEach(t => {
            if (t.vm_id) restoreVms.add(t.vm_id);
        });

        for (const v of vms) {
            let busy = null;
            try {
                const sw = await db.vmOsSwitchLogs.getRunningByVmid(v);
                if (sw) busy = 'switch';
                else if (backupVms.has(v)) busy = 'backup';
                else if (restoreVms.has(v)) busy = 'restore';
            } catch (_) {}
            // 台账不再进行中，但刚完成不久（可能瞬时报 running）：宽限期内仍按 busy 抑制闪现
            if (!busy && statusCache.isRecentlyCompleted(v)) busy = 'backup';
            if (busy) result.vm.set(v, busy);
        }
        for (const l of lxcs) {
            let busy = null;
            if (backupCts.has(l)) busy = 'backup';
            else if (restoreCts.has(l)) busy = 'restore';
            if (!busy && statusCache.isRecentlyCompleted(l)) busy = 'backup';
            if (busy) result.lxc.set(l, busy);
        }
    } catch (e) {
        console.error('[pushStatus] 合并进行中状态失败:', e.message);
    }
    return result;
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
    // SEC-003 修复：校验可信代理后再信任 x-forwarded-for
    // WebSocket upgrade 不经 Express 中间件，trust proxy 不生效
    const remoteAddr = request.socket.remoteAddress;
    const isTrustedProxy = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';
    const clientIp = isTrustedProxy
        ? (request.headers['x-forwarded-for'] || '').split(',')[0].trim() || remoteAddr
        : remoteAddr;
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
