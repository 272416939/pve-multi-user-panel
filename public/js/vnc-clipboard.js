/*!
 * vnc-clipboard.js - VNC 控制台剪贴板中转 API
 *
 * 通过后端 API 调用 PVE QEMU Guest Agent 读写 Windows VM 剪贴板，
 * 绕过 QEMU VNC 不支持剪贴板同步的限制。
 *
 * 快捷键：
 *   Ctrl+Shift+C / Ctrl+Insert → 拉取 VM 剪贴板到浏览器剪贴板（VM → 浏览器）
 *   Ctrl+Shift+V / Shift+Insert → 推送浏览器剪贴板到 VM（浏览器 → VM）
 *
 * UMD 模块：浏览器环境挂 window.VncClipboard，Node 环境 module.exports
 */
(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.VncClipboard = factory();
    }
})(typeof window !== 'undefined' ? window : this, function() {

    /**
     * VNC 键盘事件处理
     * @param {KeyboardEvent} e - 键盘事件
     * @param {number} vmid - VM ID（用于调用后端 API）
     * @param {Object} clipboard - navigator.clipboard 对象（HTTPS 下可用）
     * @param {Function} [fetchFn] - 可选的自定义 fetch（用于测试；默认 window.fetch）
     * @returns {boolean} true 透传给 noVNC 默认处理，false 阻止默认
     */
    function handleVncClipboardKeydown(e, vmid, clipboard, fetchFn) {
        // 只处理 keydown，其他事件（keyup/keypress）透传
        if (e.type !== 'keydown') return true;

        var ctrl = e.ctrlKey;
        var shift = e.shiftKey;
        var key = e.key;
        var fetch = fetchFn || (typeof window !== 'undefined' ? window.fetch.bind(window) : null);

        // Ctrl+Shift+C / Ctrl+Insert → 拉取 VM 剪贴板到浏览器
        if ((ctrl && shift && (key === 'C' || key === 'c')) || (ctrl && key === 'Insert')) {
            e.preventDefault();
            if (fetch && clipboard && clipboard.writeText) {
                fetch('/api/vm/' + vmid + '/clipboard')
                    .then(function(res) { return res.json(); })
                    .then(function(data) {
                        if (data && data.text) {
                            clipboard.writeText(data.text).catch(function() {});
                        }
                    })
                    .catch(function() { /* 静默失败，避免泄露错误细节 */ });
            }
            return false;
        }

        // Ctrl+Shift+V / Shift+Insert → 推送浏览器剪贴板到 VM
        if ((ctrl && shift && (key === 'V' || key === 'v')) || (shift && key === 'Insert')) {
            e.preventDefault();
            if (clipboard && clipboard.readText && fetch) {
                clipboard.readText().then(function(text) {
                    if (!text) return;
                    fetch('/api/vm/' + vmid + '/clipboard', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text: text })
                    }).catch(function() { /* 静默失败 */ });
                }).catch(function() {});
            }
            return false;
        }

        // 其他快捷键透传给 noVNC 处理（Ctrl+A/Ctrl+C 等由 noVNC 转发给 VM）
        return true;
    }

    return {
        handleVncClipboardKeydown: handleVncClipboardKeydown
    };
});
