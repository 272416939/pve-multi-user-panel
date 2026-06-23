(function() {
    const params = new URLSearchParams(location.search);
    const vmid = params.get('vmid');
    const token = params.get('token');

    if (!vmid || !token) {
        document.getElementById('statusText').textContent = '参数缺失：vmid 或认证 token';
        document.getElementById('statusText').className = 'error';
        return;
    }

    document.getElementById('connInfo').textContent = 'CT ' + vmid;

    const term = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 14,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: { background: '#000000', foreground: '#d4d4d4' },
        cols: 80,
        rows: 24
    });

    const fitAddon = new FitAddon.FitAddon();
    term.loadAddon(fitAddon);
    term.open(document.getElementById('terminal-container'));
    fitAddon.fit();

    window.addEventListener('resize', () => fitAddon.fit());

    const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = wsProto + '//' + location.host + '/term-proxy?vmid=' + encodeURIComponent(vmid) + '&token=' + encodeURIComponent(token);

    let ws;
    let wsConnected = false;

    function connect() {
        const statusEl = document.getElementById('statusText');
        statusEl.textContent = '正在连接...';
        statusEl.className = '';

        ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';

        ws.onopen = function() {
            wsConnected = true;
            statusEl.textContent = '已连接';
            statusEl.className = 'connected';
            term.focus();

            // 发送 resize 信息
            sendResize();
        };

        ws.onmessage = function(evt) {
            if (evt.data instanceof ArrayBuffer) {
                term.write(new Uint8Array(evt.data));
            }
        };

        ws.onclose = function() {
            wsConnected = false;
            statusEl.textContent = '连接已断开';
            statusEl.className = 'error';
        };

        ws.onerror = function() {
            if (!wsConnected) {
                statusEl.textContent = '连接失败';
                statusEl.className = 'error';
            }
        };
    }

    function sendResize() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            const dims = fitAddon.proposeDimensions();
            if (dims) {
                // PVE xtermjs 通过 resize 消息调整
                ws.send(JSON.stringify({ resize: { cols: dims.cols, rows: dims.rows } }));
            }
        }
    }

    // 终端输入 → WebSocket
    term.onData(function(data) {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    });

    // 窗口调整大小
    let resizeTimer;
    window.addEventListener('resize', function() {
        fitAddon.fit();
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(sendResize, 200);
    });

    connect();
})();
