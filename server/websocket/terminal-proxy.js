const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const { createTerminalPty } = require('../api/ssh-exec');
const { JWT_SECRET } = require('../utils/token');
const dbg = require('../utils/debug');

const terminalProxy = new WebSocketServer({ noServer: true });

// 验证 terminal ticket（包含 vmid + userId + 过期时间）
function validateTicket(token) {
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        // 检查是否为 terminal 类型 ticket
        if (decoded.type !== 'terminal') return null;
        // 检查是否过期
        if (decoded.exp && Date.now() / 1000 > decoded.exp) return null;
        return decoded;
    } catch (e) {
        return null;
    }
}

terminalProxy.on('connection', (clientWs, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const vmid = url.searchParams.get('vmid');
    const ticket = url.searchParams.get('token');

    // P0-C1 修复：必须提供有效 ticket 才能连接
    if (!vmid || !ticket) {
        clientWs.close(4008, '缺少认证参数');
        return;
    }

    const decoded = validateTicket(ticket);
    if (!decoded) {
        clientWs.close(4403, '认证失败或 ticket 已过期');
        dbg(`[Terminal] 拒绝无效连接: vmid=${vmid}`);
        return;
    }

    // 校验 ticket 中的 vmid 是否匹配请求的 vmid
    if (decoded.vmid !== parseInt(vmid)) {
        clientWs.close(4403, 'ticket 与目标容器不匹配');
        dbg(`[Terminal] vmid 不匹配: ticket=${decoded.vmid}, request=${vmid}`);
        return;
    }

    dbg(`[Terminal] 认证通过: user=${decoded.username}(${decoded.userId}) → LXC ${vmid}`);

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

    clientWs.on('close', () => { session.close(); });
    clientWs.on('error', () => { session.close(); });
});

module.exports = terminalProxy;
