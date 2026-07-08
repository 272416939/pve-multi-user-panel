const { Client } = require('ssh2');

/**
 * 通过 SSH 在 PVE 节点上执行命令
 * @param {string} host - SSH 主机地址
 * @param {string} username - SSH 用户名
 * @param {string} password - SSH 密码
 * @param {string} command - 要执行的命令
 * @param {number} timeout - 超时时间（毫秒），默认 10 分钟
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function execSSH(host, username, password, command, timeout = 600000) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            conn.end();
            reject(new Error(`SSH 命令执行超时 (${timeout / 1000}s): ${command}`));
        }, timeout);

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    conn.end();
                    reject(err);
                    return;
                }
                stream.on('data', (data) => { stdout += data.toString(); });
                stream.stderr.on('data', (data) => { stderr += data.toString(); });
                stream.on('close', (code) => {
                    clearTimeout(timer);
                    conn.end();
                    if (!timedOut) {
                        resolve({ stdout, stderr, code });
                    }
                });
            });
        });

        conn.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        conn.connect({
            host,
            username,
            password,
            readyTimeout: 10000,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3
        });
    });
}

/**
 * 从数据库获取 PVE SSH 配置（解密密码）
 * @returns {Promise<{host: string, username: string, password: string, port: number}>}
 */
async function getPveSshConfig() {
    const db = require('./db');
    const config = await db.config.getPve();
    return {
        host: config.ssh_host || '',
        username: config.ssh_user || 'root',
        password: config.ssh_password || '',
        port: config.ssh_port || 22
    };
}

/**
 * 通过 SSH 在 PVE 节点上执行 pct restore 命令（强制覆盖恢复 LXC 容器）
 */
async function restoreLxcBySSH(vmid, volid, storage) {
    const sshConfig = await getPveSshConfig();
    const host = sshConfig.host;
    const username = sshConfig.username;
    const password = sshConfig.password;

    if (!host || !password) {
        throw new Error('SSH 配置不完整：请在面板管理后台 > 系统设置 > PVE节点设置 中配置 SSH 连接信息');
    }

    // R3-4 修复：白名单校验防止命令注入
    if (!/^[a-zA-Z0-9_-]+:backup\/[a-zA-Z0-9_.\-]+$/.test(volid)) {
        throw new Error('无效的备份路径格式');
    }
    if (storage && !/^[a-zA-Z0-9_-]+$/.test(storage)) {
        throw new Error('无效的存储名称');
    }

    vmid = parseInt(vmid);
    if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
        throw new Error('无效的容器 ID');
    }

    let cmd = `pct restore ${vmid} ${volid} --force 1`;
    if (storage) {
        cmd += ` --storage ${storage}`;
    }

    return await execSSH(host, username, password, cmd);
}

/**
 * 通过 SSH + PTY 创建 LXC 容器终端会话（交互式）
 * 使用 conn.exec() 直接启动 lxc-console，跳过 bash shell 中间层，
 * 避免宿主机 shell 提示符暴露给终端用户
 * @param {string} host - SSH 主机地址
 * @param {string} username - SSH 用户名
 * @param {string} password - SSH 密码
 * @param {number} vmid - 容器 ID
 * @param {object} pty - PTY 尺寸 { rows, cols }
 * @param {function} onData - 数据回调 (buffer)
 * @param {function} onError - 错误回调 (err)
 * @param {function} onClose - 关闭回调 ()
 * @returns {object} - { conn, resize, write, close }
 */
function createTerminalPty(host, username, password, vmid, pty, onData, onError, onClose) {
    // R3-6 修复：vmid 严格白名单校验，与 lxc-attach 保持一致
    vmid = parseInt(vmid);
    if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
        onError(new Error('无效的容器 ID'));
        return { conn: null, resize: () => {}, write: () => {}, close: () => {} };
    }

    const conn = new Client();
    let shellStream = null;

    conn.on('ready', () => {
        // 直接用 exec 启动 lxc-console 并分配 PTY，不经过 shell 中转
        conn.exec(`lxc-console -n ${vmid}`, {
            pty: {
                rows: pty.rows || 24,
                cols: pty.cols || 80,
                term: 'xterm-256color'
            }
        }, (err, stream) => {
            if (err) {
                conn.end();
                onError(err);
                return;
            }
            shellStream = stream;

            stream.on('data', (data) => { onData(data); });
            stream.stderr.on('data', (data) => { onData(data); });
            stream.on('close', () => {
                conn.end();
                onClose();
            });
        });
    });

    conn.on('error', (err) => {
        onError(err);
    });

    conn.connect({
        host,
        username,
        password,
        readyTimeout: 10000,
        keepaliveInterval: 15000,
        keepaliveCountMax: 3
    });

    return {
        conn,
        /** 调整终端窗口大小 */
        resize: (rows, cols) => {
            if (shellStream && shellStream.setWindow) {
                shellStream.setWindow(rows, cols, 0, 0);
            }
        },
        /** 写入数据到 SSH 流 */
        write: (data) => {
            if (shellStream && shellStream.writable) {
                shellStream.write(data);
            }
        },
        /** 关闭连接 */
        close: () => { conn.end(); }
    };
}

/**
 * 通过 SSH 执行命令并通过 stdin 传入数据（避免 shell 字符串拼接注入）
 * @param {string} host - SSH 主机地址
 * @param {string} username - SSH 用户名
 * @param {string} password - SSH 密码
 * @param {string} command - 要执行的命令（不包含用户输入）
 * @param {string} stdinData - 通过 stdin 传入的数据
 * @param {number} timeout - 超时时间（毫秒），默认 30 秒
 * @returns {Promise<{stdout: string, stderr: string, code: number}>}
 */
function execSSHWithStdin(host, username, password, command, stdinData, timeout = 30000) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let stdout = '';
        let stderr = '';
        let timedOut = false;

        const timer = setTimeout(() => {
            timedOut = true;
            conn.end();
            reject(new Error(`SSH 命令执行超时 (${timeout / 1000}s): ${command}`));
        }, timeout);

        conn.on('ready', () => {
            conn.exec(command, (err, stream) => {
                if (err) {
                    clearTimeout(timer);
                    conn.end();
                    reject(err);
                    return;
                }
                // 关键：通过 stdin 写入数据，而非拼入命令字符串
                if (stdinData) {
                    stream.stdin.write(stdinData);
                    stream.stdin.end();
                }
                stream.on('data', (data) => { stdout += data.toString(); });
                stream.stderr.on('data', (data) => { stderr += data.toString(); });
                stream.on('close', (code) => {
                    clearTimeout(timer);
                    conn.end();
                    if (!timedOut) {
                        resolve({ stdout, stderr, code });
                    }
                });
            });
        });

        conn.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        conn.connect({
            host,
            username,
            password,
            readyTimeout: 10000,
            keepaliveInterval: 10000,
            keepaliveCountMax: 3
        });
    });
}

module.exports = { execSSH, execSSHWithStdin, restoreLxcBySSH, createTerminalPty, getPveSshConfig };