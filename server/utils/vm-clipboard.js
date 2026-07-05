/*!
 * vm-clipboard.js - VM 剪贴板命令构造与输出解析工具
 *
 * 用于通过 PVE QEMU Guest Agent (QMP guest-exec) 在 Windows guest 内
 * 读写剪贴板。命令注入防护：文本通过 stdin 传递，不拼接到命令行参数。
 *
 * 导出：
 *   buildSetClipboardCommand(text) - 构造写入剪贴板的命令
 *   buildGetClipboardCommand()     - 构造读取剪贴板的命令
 *   parseClipboardOutput(base64)   - 解析 guest-exec 返回的 base64 stdout
 */
'use strict';

/**
 * 构造写入剪贴板的命令（Windows PowerShell）
 * 通过 stdin 传入文本，避免命令行参数注入
 * @param {string} text - 要写入剪贴板的文本
 * @returns {{command: string[], inputData: string}} command 数组 + base64 编码的 stdin 数据
 */
function buildSetClipboardCommand(text) {
    // $input 从 stdin 读取所有行，管道传给 Set-Clipboard
    return {
        command: ['powershell.exe', '-NoProfile', '-Command', '$input | Set-Clipboard'],
        inputData: Buffer.from(text, 'utf8').toString('base64')
    };
}

/**
 * 构造读取剪贴板的命令（Windows PowerShell）
 * 输出到 stdout，由 guest-exec status 的 out-data 返回（base64）
 * @returns {{command: string[]}} command 数组
 */
function buildGetClipboardCommand() {
    return {
        command: ['powershell.exe', '-NoProfile', '-Command', 'Get-Clipboard']
    };
}

/**
 * 解析 guest-exec 返回的 base64 stdout
 * @param {string} base64Stdout - base64 编码的 stdout
 * @returns {string} 解码后的文本（CRLF→LF，去除末尾换行）
 */
function parseClipboardOutput(base64Stdout) {
    if (!base64Stdout) return '';
    var text = Buffer.from(base64Stdout, 'base64').toString('utf8');
    // Windows 换行转 Unix 换行
    text = text.replace(/\r\n/g, '\n');
    // 去除末尾单个换行（Get-Clipboard 末尾会带 \n）
    text = text.replace(/\n$/, '');
    return text;
}

module.exports = {
    buildSetClipboardCommand: buildSetClipboardCommand,
    buildGetClipboardCommand: buildGetClipboardCommand,
    parseClipboardOutput: parseClipboardOutput
};
