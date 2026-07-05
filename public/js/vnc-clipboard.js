/*!
 * vnc-clipboard.js - VNC 控制台剪贴板快捷键处理
 *
 * 功能：
 *   1. 监听 noVNC clipboard 事件，缓存 VM 剪贴板文本（VM → 浏览器，被动同步）
 *   2. 处理键盘快捷键：
 *      Ctrl+Shift+C / Ctrl+Insert → 复制 VM 剪贴板到浏览器剪贴板
 *      Ctrl+Shift+V / Shift+Insert → 粘贴浏览器剪贴板到 VM
 *
 * 设计：
 *   - 与 terminal-keyboard.js 保持一致的快捷键和返回值约定
 *   - VM → 浏览器采用被动缓存（避免权限提示频繁弹出）
 *   - 仅支持 HTTPS 环境（navigator.clipboard API）
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
     * 创建剪贴板状态对象
     * @returns {{lastClipboardText: string}}
     */
    function createClipboardState() {
        return { lastClipboardText: '' };
    }

    /**
     * 处理 noVNC clipboard 事件，缓存 VM 剪贴板文本
     * @param {{lastClipboardText: string}} state
     * @param {{text: string}} detail - noVNC clipboard 事件的 detail
     */
    function handleVncClipboardEvent(state, detail) {
        if (!detail || !detail.text) return;
        state.lastClipboardText = detail.text;
    }

    /**
     * VNC 键盘事件处理
     * @param {KeyboardEvent} e - 键盘事件
     * @param {Object} rfb - noVNC RFB 实例（需有 clipboardPasteFrom 方法）
     * @param {{lastClipboardText: string}} state - 剪贴板状态
     * @param {Object} [clipboard] - navigator.clipboard 对象（HTTPS 下可用）
     * @returns {boolean} true 透传给 noVNC 默认处理，false 阻止默认
     */
    function handleVncClipboardKeydown(e, rfb, state, clipboard) {
        // 只处理 keydown，其他事件（keyup/keypress）透传
        if (e.type !== 'keydown') return true;

        var ctrl = e.ctrlKey;
        var shift = e.shiftKey;
        var key = e.key;

        // Ctrl+Shift+C / Ctrl+Insert → 复制 VM 剪贴板到浏览器
        if ((ctrl && shift && (key === 'C' || key === 'c')) || (ctrl && key === 'Insert')) {
            var text = state.lastClipboardText;
            if (text && clipboard && clipboard.writeText) {
                clipboard.writeText(text).catch(function() {});
            }
            e.preventDefault(); // 阻止浏览器原生 copy 事件
            return false;
        }

        // Ctrl+Shift+V / Shift+Insert → 粘贴浏览器剪贴板到 VM
        if ((ctrl && shift && (key === 'V' || key === 'v')) || (shift && key === 'Insert')) {
            if (clipboard && clipboard.readText && rfb && rfb.clipboardPasteFrom) {
                clipboard.readText().then(function(text) {
                    if (text) rfb.clipboardPasteFrom(text);
                }).catch(function() {});
            }
            e.preventDefault(); // 阻止浏览器原生 paste 事件
            return false;
        }

        // 其他快捷键透传给 noVNC 处理（Ctrl+A/Ctrl+C 等由 noVNC 转发给 VM）
        return true;
    }

    return {
        createClipboardState: createClipboardState,
        handleVncClipboardEvent: handleVncClipboardEvent,
        handleVncClipboardKeydown: handleVncClipboardKeydown
    };
});
