/*!
 * terminal-shortcuts-help.js - 网页终端快捷键说明 HTML 生成
 *
 * 生成快捷键说明的 HTML 字符串，用于在终端页面显示帮助弹窗。
 * UMD 模块：浏览器环境挂 window.getShortcutsHelpHTML，Node 环境 module.exports
 */
(function(root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.getShortcutsHelpHTML = factory();
    }
})(typeof window !== 'undefined' ? window : this, function() {

    /**
     * 返回快捷键说明的 HTML 字符串
     * @returns {string} HTML 内容（table 结构，无 script 标签）
     */
    function getShortcutsHelpHTML() {
        return [
            '<div class="shortcuts-help">',
            '<h3>终端快捷键说明</h3>',
            '<table class="shortcuts-table">',
            '<thead><tr><th>快捷键</th><th>功能</th></tr></thead>',
            '<tbody>',
            '<tr><td><kbd>Ctrl+Insert</kbd></td><td>复制选中文本到剪贴板</td></tr>',
            '<tr><td><kbd>Ctrl+Shift+C</kbd></td><td>复制选中文本（无选中时无操作）</td></tr>',
            '<tr><td><kbd>Shift+Insert</kbd></td><td>从剪贴板粘贴到终端</td></tr>',
            '<tr><td><kbd>Ctrl+Shift+V</kbd></td><td>从剪贴板粘贴到终端</td></tr>',
            '<tr><td><kbd>Ctrl+A</kbd></td><td>透传：光标移到行首</td></tr>',
            '<tr><td><kbd>Ctrl+C</kbd></td><td>透传：发送 SIGINT 中断信号</td></tr>',
            '<tr><td><kbd>Ctrl+E</kbd></td><td>透传：光标移到行尾</td></tr>',
            '</tbody>',
            '</table>',
            '<p class="shortcuts-tip">提示：复制需先选中文本，粘贴需浏览器支持剪贴板 API（HTTPS 环境）</p>',
            '</div>'
        ].join('');
    }

    return getShortcutsHelpHTML;
});
