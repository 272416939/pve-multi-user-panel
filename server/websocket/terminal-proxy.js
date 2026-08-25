const { WebSocketServer, WebSocket } = require('ws');
const { createTerminalPty } = require('../api/ssh-exec');
const dbg = require('../utils/debug');
const consoleSession = require('../utils/console-session');

const terminalProxy = new WebSocketServer({ noServer: true });

// L-6 修复：终端 WS 连接数上限（与 push-proxy 一致），防止认证用户并发打满 PVE 节点 SSH 连接
const MAX_CONNECTIONS = 200;
const MAX_CONNECTIONS_PER_IP = 10;
let currentConnections = 0;
const ipConnectionCount = new Map();

terminalProxy.on('connection', async (clientWs, request) => {
    // 连接数上限检查（在消耗 session 前拦截，避免无效会话被计数）
    const remoteAddr = request.socket.remoteAddress;
    const ipCount = ipConnectionCount.get(remoteAddr) || 0;
    if (currentConnections >= MAX_CONNECTIONS) {
        clientWs.close(1013, '服务器连接数已达上限，请稍后再试');
        return;
    }
    if (ipCount >= MAX_CONNECTIONS_PER_IP) {
        clientWs.close(1013, '当前 IP 连接数已达上限，请稍后再试');
        return;
    }
    currentConnections++;
    ipConnectionCount.set(remoteAddr, ipCount + 1);

    // V6-I1 修复：released 标志防 close/error 双注册重复释放（同 vnc-proxy）
    let released = false;
    const releaseConnection = () => {
        if (released) return;
        released = true;
        const c = ipConnectionCount.get(remoteAddr) || 1;
        if (c <= 1) ipConnectionCount.delete(remoteAddr);
        else ipConnectionCount.set(remoteAddr, c - 1);
        currentConnections = Math.max(0, currentConnections - 1);
    };
    clientWs.on('close', releaseConnection);
    clientWs.on('error', releaseConnection);

    const url = new URL(request.url, `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('session');

    if (!sessionId) {
        clientWs.close(4008, '缺少会话参数');
        return;
    }

    // 单次性消费 session（获取后立即删除，防止重放）
    const sessionData = await consoleSession.consumeSession(sessionId);
    if (!sessionData) {
        clientWs.close(4403, '会话已失效或已过期');
        dbg('[Terminal] 拒绝无效或已过期的 session');
        return;
    }

    const { vmid, userId, username, nodeId } = sessionData;
    if (!vmid) {
        clientWs.close(4008, '会话数据不完整');
        return;
    }

    dbg(`[Terminal] 认证通过: user=${username}(${userId}) → LXC ${vmid}`);

    const { getPveSshConfig } = require('../api/ssh-exec');
    // 多节点：SSH 必须连容器所在节点（nodeId 由 /lxc/:vmid/terminal 创建会话时写入）
    const sshConfig = await getPveSshConfig(nodeId != null ? nodeId : null);
    if (!sshConfig.host || !sshConfig.password) {
        clientWs.close(1011, 'SSH 配置不完整：请在面板设置 PVE SSH 连接信息');
        return;
    }

    dbg(`[Terminal] Opening SSH PTY for LXC ${vmid}`);

    let pendingResize = { rows: 24, cols: 80 };

    const session = createTerminalPty(
        sshConfig.host, sshConfig.username, sshConfig.password, parseInt(vmid),
        pendingResize,
        (data) => {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        },
        (err) => {
            console.error(`[Terminal] SSH error for ${vmid}:`, err.message);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close(1011, err.message);
            }
        },
        () => {
            dbg(`[Terminal] SSH session closed for ${vmid}`);
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.close();
            }
        },
        sshConfig.port
    );

    // 空闲超时检测：30 分钟无数据自动断开，防止连接泄漏
    let lastActivity = Date.now();
    clientWs.on('message', () => { lastActivity = Date.now(); });
    const idleCheckInterval = setInterval(() => {
        if (Date.now() - lastActivity > 30 * 60 * 1000) {
            clientWs.close(4000, '空闲超时，自动断开');
        }
    }, 60000);

    clientWs.on('message', (data) => {
        if (Buffer.isBuffer(data)) {
            try {
                const msg = JSON.parse(data.toString());
                if (msg.resize) {
                    session.resize(msg.resize.rows, msg.resize.cols);
                    return;
                }
            } catch (e) {
            }
        }
        session.write(data);
    });

    clientWs.on('close', () => { clearInterval(idleCheckInterval); session.close(); });
    clientWs.on('error', () => { clearInterval(idleCheckInterval); session.close(); });
});

module.exports = terminalProxy;
