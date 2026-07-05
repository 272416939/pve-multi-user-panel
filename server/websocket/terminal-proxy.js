const { WebSocketServer, WebSocket } = require('ws');
const { createTerminalPty } = require('../api/ssh-exec');
const dbg = require('../utils/debug');
const consoleSession = require('../utils/console-session');

const terminalProxy = new WebSocketServer({ noServer: true });

terminalProxy.on('connection', async (clientWs, request) => {
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

    const { vmid, userId, username } = sessionData;
    if (!vmid) {
        clientWs.close(4008, '会话数据不完整');
        return;
    }

    dbg(`[Terminal] 认证通过: user=${username}(${userId}) → LXC ${vmid}`);

    const sshHost = process.env.PVE_SSH_HOST;
    const sshPassword = process.env.PVE_SSH_PASSWORD;
    if (!sshHost || !sshPassword) {
        clientWs.close(1011, 'SSH 配置不完整');
        return;
    }

    dbg(`[Terminal] Opening SSH PTY for LXC ${vmid}`);

    let pendingResize = { rows: 24, cols: 80 };

    const session = createTerminalPty(
        sshHost, 'root', sshPassword, parseInt(vmid),
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
        }
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
