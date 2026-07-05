const { WebSocketServer, WebSocket } = require('ws');
const https = require('https');
const net = require('net');
const tls = require('tls');
const crypto = require('crypto');
const pveApi = require('../api/pve-api');
const dbg = require('../utils/debug');
const consoleSession = require('../utils/console-session');

const vncProxy = new WebSocketServer({ noServer: true });

vncProxy.on('connection', async (clientWs, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sessionId = url.searchParams.get('session');

    if (!sessionId) {
        clientWs.close(4000, '缺少会话参数');
        return;
    }

    // 单次性消费 session（获取后立即删除，防止重放）
    const sessionData = await consoleSession.consumeSession(sessionId);
    if (!sessionData) {
        console.warn('[VNC Proxy] 拒绝无效或已过期的 session');
        clientWs.close(4001, '会话已失效或已过期');
        return;
    }

    const { node, vmid, port, ticket, type } = sessionData;
    if (!node || !vmid || !port || !ticket) {
        clientWs.close(4000, '会话数据不完整');
        return;
    }

    dbg(`[VNC Proxy] 连接建立: type=${type || 'qemu'}, vmid=${vmid}, node=${node}`);

    if (type === 'lxc') {
        const pveHost = new URL(pveApi.host).hostname;
        handleLxcVncTcpProxy(clientWs, pveHost, parseInt(port), ticket);
        return;
    }

    const agent = new https.Agent({ rejectUnauthorized: false });
    const vmType = 'qemu';
    const pveWsUrl = `${pveApi.host.replace(/^http/, 'ws')}/api2/json/nodes/${node}/${vmType}/${vmid}/vncwebsocket?port=${port}&vncticket=${encodeURIComponent(ticket)}`;

    const pveWs = new WebSocket(pveWsUrl, [], {
        headers: {
            'Authorization': `PVEAPIToken=${pveApi.apiToken}`,
            'Origin': pveApi.host
        },
        agent: agent,
        perMessageDeflate: false,
        followRedirects: false,
        rejectUnauthorized: false
    });

    pveWs.on('open', () => {
        const clientStream = WebSocket.createWebSocketStream(clientWs, { decodeStrings: false, objectMode: false });
        const pveStream = WebSocket.createWebSocketStream(pveWs, { decodeStrings: false, objectMode: false });
        clientStream.pipe(pveStream);
        pveStream.pipe(clientStream);
        clientStream.on('error', () => {});
        pveStream.on('error', () => {});
    });

    pveWs.on('error', (err) => {
        console.error('PVE WebSocket 错误:', err.message);
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close(1011, 'PVE 连接失败');
        }
    });

    pveWs.on('close', () => {
        if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.close();
        }
    });

    clientWs.on('close', () => {
        if (pveWs.readyState === WebSocket.OPEN) {
            pveWs.close();
        }
    });

    clientWs.on('error', () => {
        if (pveWs.readyState === WebSocket.OPEN) {
            pveWs.close();
        }
    });
});

/**
 * LXC VNC 代理：直连 PVE VNC 端口，完成 VeNCrypt X509Plain TLS 认证
 *
 * PVE LXC VNC 仅支持 VeNCrypt(19) → X509Plain(262)，浏览器 noVNC 无法处理。
 * 本函数：
 *   1. net.connect() 直连 PVE VNC 代理端口
 *   2. 完成 VeNCrypt 子协商后，tls.connect() 将 TCP 升级为 TLS
 *   3. 通过 TLS 发送 Plain auth（root + ticket）完成认证
 *   4. 对浏览器呈现标准 VNC Auth（type 2），noVNC 原生支持
 *   5. 认证后桥接浏览器 WS ↔ TLS socket
 */
function handleLxcVncTcpProxy(clientWs, pveHost, port, ticket) {
    console.log(`[LXC VNC] TCP connecting ${pveHost}:${port}`);
    const rawSocket = net.createConnection({ host: pveHost, port }, () => {
        console.log('[LXC VNC] TCP connected');
        startRfb(rawSocket);
    });

    rawSocket.on('error', (err) => {
        console.error('[LXC VNC] TCP error:', err.message);
        safeClose(clientWs);
    });

    function safeClose(ws) {
        try { if (ws.readyState === WebSocket.OPEN) ws.close(); } catch (e) {}
    }

    let readBuf = Buffer.alloc(0);
    let readCallback = null;
    let bridgeMode = false;

    rawSocket.on('data', (data) => {
        if (bridgeMode) return;
        readBuf = Buffer.concat([readBuf, data]);
        if (readCallback) {
            const cb = readCallback;
            readCallback = null;
            cb();
        }
    });

    function tcpRead(size, timeout) {
        if (!timeout) timeout = 15000;
        return new Promise((resolve, reject) => {
            if (readBuf.length >= size) {
                const result = readBuf.slice(0, size);
                readBuf = readBuf.slice(size);
                return resolve(result);
            }
            const timer = setTimeout(() => {
                readCallback = null;
                reject(new Error('TCP read timeout (' + size + ' bytes)'));
            }, timeout);
            readCallback = function() {
                if (readBuf.length >= size) {
                    clearTimeout(timer);
                    const result = readBuf.slice(0, size);
                    readBuf = readBuf.slice(size);
                    resolve(result);
                }
            };
        });
    }

    async function startRfb(socket) {
        try {
            const ver = await tcpRead(12);
            clientWs.send(ver);
            console.log('[LXC VNC] RFB version:', ver.toString().trim());

            clientWs.on('message', function onVer(data) {
                clientWs.removeListener('message', onVer);
                var cv = Buffer.isBuffer(data) ? data : Buffer.from(data);
                if (cv.length >= 12) {
                    cv = cv.slice(0, 12);
                    socket.write(cv);
                    console.log('[LXC VNC] Client version sent');
                    doVeNCrypt(socket);
                }
            });
        } catch (e) {
            console.error('[LXC VNC] Version error:', e.message);
            safeClose(clientWs);
        }
    }

    async function doVeNCrypt(socket) {
        try {
            var num = await tcpRead(1);
            var types = Array.from(await tcpRead(num[0]));
            console.log('[LXC VNC] Security types:', types);

            clientWs.send(Buffer.from([1, 2]));

            if (!types.includes(19)) {
                throw new Error('PVE does not advertise VeNCrypt');
            }

            socket.write(Buffer.from([19]));

            clientWs.on('message', function onChoice(data) {
                clientWs.removeListener('message', onChoice);
                doVeNCryptSubtypes(socket);
            });
        } catch (e) {
            console.error('[LXC VNC] VeNCrypt error:', e.message);
            safeClose(clientWs);
        }
    }

    async function doVeNCryptSubtypes(socket) {
        try {
            var vv = await tcpRead(2);
            console.log('[LXC VNC] VeNCrypt version:', vv[0], vv[1]);
            socket.write(Buffer.from([0, 2]));

            var ack = await tcpRead(1);
            if (ack[0] !== 0) throw new Error('ACK failed: ' + ack[0]);

            var sn = await tcpRead(1);
            var subData = await tcpRead(sn[0] * 4);
            var subtypes = [];
            for (var i = 0; i < sn[0]; i++) {
                subtypes.push(subData.readUInt32BE(i * 4));
            }
            console.log('[LXC VNC] VeNCrypt subtypes:', subtypes);

            if (subtypes.includes(256)) {
                console.log('[LXC VNC] Using Plain auth');
                var sb = Buffer.alloc(4);
                sb.writeUInt32BE(256, 0);
                socket.write(sb);

                var user = Buffer.from('root');
                var pass = Buffer.from(ticket);
                var auth = Buffer.alloc(8 + user.length + pass.length);
                auth.writeUInt32BE(user.length, 0);
                auth.writeUInt32BE(pass.length, 4);
                user.copy(auth, 8);
                pass.copy(auth, 8 + user.length);
                socket.write(auth);

                var result = await tcpRead(4);
                console.log('[LXC VNC] Plain SecurityResult:', result.readUInt32BE(0));
                browserAuthThenBridge(socket);
            } else if (subtypes.includes(262)) {
                console.log('[LXC VNC] X509Plain, removing listeners and starting TLS...');
                var sb = Buffer.alloc(4);
                sb.writeUInt32BE(262, 0);
                socket.write(sb);

                await new Promise(function(go) { setTimeout(go, 200); });

                socket.removeAllListeners('data');
                if (readBuf.length > 0) {
                    socket.unshift(readBuf);
                    readBuf = Buffer.alloc(0);
                }

                var tlsSocket = tls.connect({
                    socket: socket,
                    rejectUnauthorized: false,
                    requestCert: false,
                    minVersion: 'TLSv1',
                    maxVersion: 'TLSv1.2',
                    ciphers: 'ALL:@SECLEVEL=0',
                    secureOptions: crypto.constants.SSL_OP_ALL | crypto.constants.SSL_OP_NO_TICKET,
                    session: false
                });

                tlsSocket.once('secureConnect', async function() {
                    console.log('[LXC VNC] TLS established');

                    var user = Buffer.from('root');
                    var pass = Buffer.from(ticket);
                    var auth = Buffer.alloc(8 + user.length + pass.length);
                    auth.writeUInt32BE(user.length, 0);
                    auth.writeUInt32BE(pass.length, 4);
                    user.copy(auth, 8);
                    pass.copy(auth, 8 + user.length);
                    tlsSocket.write(auth);

                    var result = await tlsRead(tlsSocket, 4);
                    console.log('[LXC VNC] TLS SecurityResult:', result ? result.readUInt32BE(0) : 'null');
                    browserAuthThenBridge(tlsSocket);
                });

                tlsSocket.once('error', function(err) {
                    console.error('[LXC VNC] TLS error:', err.message);
                    safeClose(clientWs);
                });

                function tlsRead(ts, size, timeout) {
                    if (!timeout) timeout = 15000;
                    return new Promise(function(resolve, reject) {
                        var buf = Buffer.alloc(0);
                        var timer = setTimeout(function() {
                            ts.removeListener('data', handler);
                            reject(new Error('TLS read timeout'));
                        }, timeout);
                        var handler = function(data) {
                            buf = Buffer.concat([buf, data]);
                            if (buf.length >= size) {
                                clearTimeout(timer);
                                ts.removeListener('data', handler);
                                resolve(buf.slice(0, size));
                            }
                        };
                        ts.on('data', handler);
                    });
                }
            } else {
                throw new Error('No supported VeNCrypt subtype: ' + subtypes.join(','));
            }
        } catch (e) {
            console.error('[LXC VNC] VeNCrypt subtypes error:', e.message);
            safeClose(clientWs);
        }
    }

    function browserAuthThenBridge(pveSocket) {
        clientWs.send(crypto.randomBytes(16));

        clientWs.on('message', function onResp(data) {
            clientWs.removeListener('message', onResp);
            clientWs.send(Buffer.from([0, 0, 0, 0]));

            clientWs.on('message', function onInit(data) {
                clientWs.removeListener('message', onInit);
                var ci = Buffer.isBuffer(data) ? data.slice(0, 1) : Buffer.from(data).slice(0, 1);
                pveSocket.write(ci);
                readServerInitAndBridge(pveSocket);
            });
        });
    }

    function readServerInitAndBridge(pveSocket) {
        var buf = Buffer.alloc(0);
        var onData = function(data) {
            buf = Buffer.concat([buf, data]);
            if (buf.length >= 4) {
                pveSocket.removeListener('data', onData);
                clientWs.send(buf);
                console.log('[LXC VNC] ServerInit forwarded, bridging');
                bridgeMode = true;
                startBridge(pveSocket);
            }
        };
        pveSocket.on('data', onData);
        setTimeout(function() {
            pveSocket.removeListener('data', onData);
            if (!bridgeMode && buf.length > 0) {
                clientWs.send(buf);
                bridgeMode = true;
                startBridge(pveSocket);
            }
        }, 10000);
    }

    function startBridge(pveSocket) {
        bridgeMode = true;

        pveSocket.on('data', function(data) {
            if (clientWs.readyState === WebSocket.OPEN) {
                clientWs.send(data);
            }
        });

        clientWs.on('message', function(data) {
            if (pveSocket.writable) {
                var buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
                pveSocket.write(buf);
            }
        });

        pveSocket.on('close', function() { safeClose(clientWs); });
        pveSocket.on('error', function() {});
        clientWs.on('close', function() { try { pveSocket.end(); } catch (e) {} });
        clientWs.on('error', function() { try { pveSocket.end(); } catch (e) {} });

        console.log('[LXC VNC] Bridge established');
    }
}

module.exports = vncProxy;
