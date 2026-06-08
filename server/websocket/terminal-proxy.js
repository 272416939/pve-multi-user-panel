const { WebSocketServer, WebSocket } = require('ws');
const { createTerminalPty } = require('../api/ssh-exec');
const dbg = require('../utils/debug');

const terminalProxy = new WebSocketServer({ noServer: true });

terminalProxy.on('connection', (clientWs, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const vmid = url.searchParams.get('vmid');

    if (!vmid) {
        clientWs.close(4000, '缺少 vmid 参数');
        return;
    }

    const sshHost = process.env.PVE_SSH_HOST;
    const sshPassword = process.env.PVE_SSH_PASSWORD;
    if (!sshHost || !sshPassword) {
        clientWs.close(1011, 'SSH 配置不完整');
        return;
    }

    dbg(`[Terminal] Opening SSH PTY for LXC ${vmid}`);

    let pendingResize = { rows: 24, cols: 80 };

    const session = createTerminalPty(
        sshHost, 'root', sshPassword, vmid,
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
