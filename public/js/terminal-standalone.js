(function() {
    // 等待翻译就绪（最多 3s 兜底）再启动，保证状态文案取到当前语言
    function whenI18nReady(fn) {
        if (window.__i18n && window.__i18n.isLoaded()) return fn();
        var start = Date.now();
        var iv = setInterval(function () {
            if ((window.__i18n && window.__i18n.isLoaded()) || Date.now() - start > 3000) {
                clearInterval(iv);
                fn();
            }
        }, 50);
    }

    function boot() {
        var T = function (k) { return window.__i18n.t(k); };
        document.title = T('terminal.docTitle');

        const params = new URLSearchParams(location.search);
        const session = params.get('session');

        if (!session) {
            document.getElementById('statusText').textContent = T('terminal.missingSid');
            document.getElementById('statusText').className = 'error';
            return;
        }

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

        // 自定义快捷键：Ctrl+Shift+C/Insert 复制、Ctrl+Shift+V/Shift+Insert 粘贴、其他透传
        term.attachCustomKeyEventHandler(function(e) {
            return handleTerminalKeydown(e, term, navigator.clipboard);
        });

        window.addEventListener('resize', () => fitAddon.fit());

        const wsProto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = wsProto + '//' + location.host + '/term-proxy?session=' + encodeURIComponent(session);

        let ws;
        let wsConnected = false;

        function connect() {
            const statusEl = document.getElementById('statusText');
            statusEl.textContent = T('terminal.connecting');
            statusEl.className = '';

            ws = new WebSocket(wsUrl);
            ws.binaryType = 'arraybuffer';

            ws.onopen = function() {
                wsConnected = true;
                statusEl.textContent = T('vnc.connected');
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
                statusEl.textContent = T('terminal.disconnected');
                statusEl.className = 'error';
            };

            ws.onerror = function() {
                if (!wsConnected) {
                    statusEl.textContent = T('vnc.failed');
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

        // 快捷键说明 modal：点击按钮显示，点击关闭/遮罩/ESC 隐藏
        (function initShortcutsModal() {
            var btn = document.getElementById('shortcutsBtn');
            var modal = document.getElementById('shortcutsModal');
            var closeBtn = document.getElementById('shortcutsCloseBtn');
            var content = document.getElementById('shortcutsContent');
            if (!btn || !modal || !closeBtn || !content) return;

            // 注入快捷键说明 HTML（来自 terminal-shortcuts-help.js）
            if (typeof getShortcutsHelpHTML === 'function') {
                content.innerHTML = getShortcutsHelpHTML();
            }

            function openModal() {
                modal.classList.add('show');
                closeBtn.focus();
            }
            function closeModal() {
                modal.classList.remove('show');
                term.focus();
            }

            btn.addEventListener('click', openModal);
            closeBtn.addEventListener('click', closeModal);
            // 点击遮罩区域关闭
            modal.addEventListener('click', function(e) {
                if (e.target === modal) closeModal();
            });
            // ESC 关闭
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape' && modal.classList.contains('show')) {
                    closeModal();
                }
            });
        })();

        connect();
    }

    whenI18nReady(boot);
})();
