/*!
 * terminal-keyboard.js - 网页终端快捷键处理（复制/粘贴/透传）
 *
 * 快捷键定义：
 *   Ctrl+Insert / Ctrl+Shift+C → 复制选中文本到剪贴板
 *     （Ctrl+Shift+C 无选中时透传 \x03 SIGINT）
 *   Shift+Insert / Ctrl+Shift+V → 从剪贴板粘贴到终端
 *   Ctrl+A / Ctrl+C / Ctrl+E 等 → 透传给 shell（xterm 默认行为）
 *
 * UMD 模块：浏览器环境挂 window.handleTerminalKeydown，Node 环境 module.exports
 * 用于 attachCustomKeyEventHandler：返回 true 透传，false 阻止 xterm 默认处理
 */
(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.handleTerminalKeydown = factory();
    }
})(typeof window !== 'undefined' ? window : this, function() {

    /**
     * 终端键盘事件处理
     * @param {KeyboardEvent} e - 键盘事件
     * @param {Object} term - xterm Terminal 实例（需有 getSelection/paste 方法）
     * @param {Object} [clipboard] - navigator.clipboard 对象（HTTPS 下可用）
     * @returns {boolean} true 透传给 xterm 默认处理，false 阻止默认处理
     */
    function handleTerminalKeydown(e, term, clipboard) {
        // 只处理 keydown，其他事件（keyup/keypress）透传
        if (e.type !== 'keydown') return true;

        var ctrl = e.ctrlKey;
        var shift = e.shiftKey;
        var key = e.key;

        // Ctrl+Shift+C → 复制选中（无选中透传 \x03）
        // Shift 按下时 e.key 可能为 'C' 或 'c'（依赖浏览器/键盘布局），两者都匹配
        if (ctrl && shift && (key === 'C' || key === 'c')) {
            var sel = term.getSelection();
            if (sel) {
                if (clipboard && clipboard.writeText) {
                    clipboard.writeText(sel).catch(function() {});
                }
                return false; // 阻止 xterm 默认，避免发送 \x03
            }
            return true; // 无选中，透传 SIGINT
        }

        // Ctrl+Insert → 复制选中
        if (ctrl && key === 'Insert') {
            var sel2 = term.getSelection();
            if (sel2 && clipboard && clipboard.writeText) {
                clipboard.writeText(sel2).catch(function() {});
            }
            return false; // Insert 不需要透传给 shell
        }

        // Ctrl+Shift+V → 粘贴
        if (ctrl && shift && (key === 'V' || key === 'v')) {
            if (clipboard && clipboard.readText) {
                clipboard.readText().then(function(text) {
                    if (text) term.paste(text);
                }).catch(function() {});
            }
            return false;
        }

        // Shift+Insert → 粘贴
        if (shift && key === 'Insert') {
            if (clipboard && clipboard.readText) {
                clipboard.readText().then(function(text) {
                    if (text) term.paste(text);
                }).catch(function() {});
            }
            return false;
        }

        // 其他快捷键（Ctrl+A 行首 / Ctrl+C 中断 / Ctrl+E 行尾 等）全部透传
        return true;
    }

    return handleTerminalKeydown;
});
