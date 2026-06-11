const mysql = require('sync-mysql');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

/**
 * 生成指定长度的随机强密码
 * @param {number} length - 密码长度，默认 16
 * @returns {string} 随机密码字符串
 */
function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

// MySQL 5.7 兼容的日期格式: YYYY-MM-DD HH:MM:SS（非 ISO 8601）
function mysqlNow() {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
}
function mysqlToday() {
    return mysqlNow().slice(0, 10);
}

// 单例连接（Node.js 单线程，单连接足够）
// 注意：sync-mysql 连接断开后必须先 destroy 旧连接再创建新的，否则 MySQL 连接池会耗尽
let _connection = null;

// 统一的连接配置（所有地方共用，确保 charset 等参数一致）
function getConnectionConfig() {
    return {
        host: process.env.MYSQL_HOST || 'localhost',
        port: parseInt(process.env.MYSQL_PORT || '3306'),
        user: process.env.MYSQL_USER || 'root',
        password: process.env.MYSQL_PASSWORD || '',
        database: process.env.MYSQL_DATABASE || 'pve_panel',
        charset: 'utf8mb4',           // 必须设置！否则 4 字节 emoji 会报错
        connectTimeout: 10000,         // 10 秒连接超时
    };
}

function getConnection() {
    try {
        // 检查连接是否可用
        if (_connection && _connection.state && _connection.state !== 'disconnected') {
            return _connection;
        }
    } catch (e) {
        // 连接状态检查异常，需要重建
    }
    // 销毁旧连接（防止连接池耗尽导致 ER_CON_COUNT_ERROR）
    if (_connection) {
        try { _connection.destroy(); } catch (e) { /* ignore */ }
        _connection = null;
    }
    _connection = new mysql(getConnectionConfig());
    return _connection;
}

// 将 ISO 8601 日期字符串转换为 MySQL DATETIME 格式（调用方可能传入 toISOString() 的值）
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function sanitizeParams(params) {
    if (!Array.isArray(params)) return params;
    return params.map(p => (typeof p === 'string' && ISO_DATE_RE.test(p))
        ? p.slice(0, 19).replace('T', ' ') : p);
}

// 辅助函数：执行查询返回单行（带连接错误自动恢复）
function queryOne(sql, params = []) {
    try {
        const rows = getConnection().query(sql, sanitizeParams(params));
        return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    } catch (e) {
        // 连接类错误（断开/超限/超时）：销毁旧连接，重试一次
        if (isConnectionError(e)) {
            forceReconnect();
            const rows = getConnection().query(sql, sanitizeParams(params));
            return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
        }
        throw e;
    }
}

// 辅助函数：执行查询返回多行（带连接错误自动恢复）
function queryAll(sql, params = []) {
    try {
        const result = getConnection().query(sql, sanitizeParams(params));
        return Array.isArray(result) ? result : [];
    } catch (e) {
        if (isConnectionError(e)) {
            forceReconnect();
            const result = getConnection().query(sql, sanitizeParams(params));
            return Array.isArray(result) ? result : [];
        }
        throw e;
    }
}

// 辅助函数：执行写入返回 result（带连接错误自动恢复）
function execute(sql, params = []) {
    try {
        return getConnection().query(sql, sanitizeParams(params));
    } catch (e) {
        if (isConnectionError(e)) {
            forceReconnect();
            return getConnection().query(sql, sanitizeParams(params));
        }
        throw e;
    }
}

// 判断是否为连接级错误（需要重建连接）
function isConnectionError(e) {
    const code = e.code || '';
    return ['PROTOCOL_CONNECTION_LOST', 'ER_CON_COUNT_ERROR', 'ECONNRESET',
            'ETIMEDOUT', 'EPIPE', 'ER_ACCESS_DENIED_ERROR'].includes(code)
        || (e.message && /lost connection|too many connections|connect timeout/i.test(e.message));
}

// 强制重建连接
function forceReconnect() {
    if (_connection) {
        try { _connection.destroy(); } catch (e) { /* ignore */ }
        _connection = null;
    }
}

// 数据库初始化函数（同步）
function initDb() {
    // 创建用户表
    execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            avatar TEXT,
            bio TEXT,
            email VARCHAR(255) DEFAULT '',
            emailVerified INT DEFAULT 0,
            totp_secret TEXT,
            totp_enabled INT DEFAULT 0,
            must_change_password INT DEFAULT 0,
            password_salt TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建虚拟机表
    execute(`
        CREATE TABLE IF NOT EXISTS vms (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            user_id INT NOT NULL,
            name VARCHAR(255) DEFAULT '',
            expiration_date DATETIME,
            renewal_price VARCHAR(50) DEFAULT '',
            reminderSent INT DEFAULT 0,
            lastReminderDate VARCHAR(50) DEFAULT '',
            backup_storage VARCHAR(100) DEFAULT '',
            dhcp_static_ip VARCHAR(50) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_vms_user_id (user_id)
        )
    `);

    // 创建虚拟机提醒记录表
    execute(`
        CREATE TABLE IF NOT EXISTS vm_reminders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            days INT NOT NULL,
            sent_at DATETIME NOT NULL
        )
    `);

    // 创建备忘录表
    execute(`
        CREATE TABLE IF NOT EXISTS memos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(500) DEFAULT '',
            content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建密码重置令牌表
    execute(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            email VARCHAR(255),
            token VARCHAR(512) UNIQUE NOT NULL,
            type VARCHAR(50) DEFAULT 'password_reset',
            expires_at DATETIME NOT NULL
        )
    `);

    // 创建 CDK 兑换码表
    execute(`
        CREATE TABLE IF NOT EXISTS cdk_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            code VARCHAR(100) UNIQUE NOT NULL,
            duration_days INT NOT NULL,
            created_by INT NOT NULL,
            target_user_id INT,
            created_at DATETIME NOT NULL,
            expires_at DATETIME,
            is_used INT DEFAULT 0,
            used_by INT,
            used_vm_id INT,
            used_ct_id INT,
            used_at DATETIME,
            batch_id VARCHAR(100)
        )
    `);

    // 创建配置表
    execute(`
        CREATE TABLE IF NOT EXISTS config (
            \`key\` VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    // 创建站内消息表（utf8mb4 支持 emoji 等四字节字符）
    execute(`
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uid INT NOT NULL,
            title VARCHAR(500) NOT NULL DEFAULT '',
            content TEXT NOT NULL,
            type INT NOT NULL DEFAULT 1,
            is_read INT NOT NULL DEFAULT 0,
            send_type INT NOT NULL DEFAULT 1,
            link_url VARCHAR(500) DEFAULT '',
            link_text VARCHAR(200) DEFAULT '',
            batch_id VARCHAR(100) DEFAULT '',
            created_at DATETIME NOT NULL,
            INDEX idx_messages_uid (uid),
            INDEX idx_messages_unread (uid, is_read),
            INDEX idx_messages_created (created_at)
        ) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建刷新令牌表
    execute(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            token VARCHAR(512) UNIQUE NOT NULL,
            device_name VARCHAR(255) DEFAULT '',
            ip VARCHAR(50) DEFAULT '',
            user_agent VARCHAR(500) DEFAULT '',
            created_at DATETIME NOT NULL,
            expires_at DATETIME NOT NULL,
            revoked INT DEFAULT 0
        )
    `);

    // 创建快照操作日志表
    execute(`
        CREATE TABLE IF NOT EXISTS snapshot_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            vm_id INT NOT NULL,
            action VARCHAR(50) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建恢复码表
    execute(`
        CREATE TABLE IF NOT EXISTS recovery_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            code VARCHAR(50) NOT NULL,
            used INT DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建备份表
    execute(`
        CREATE TABLE IF NOT EXISTS backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            user_id INT NOT NULL,
            storage VARCHAR(100) NOT NULL,
            filename VARCHAR(500) DEFAULT '',
            size BIGINT DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            pve_upid VARCHAR(200) DEFAULT '',
            progress INT DEFAULT 0,
            notes TEXT,
            type VARCHAR(10) DEFAULT 'vm',
            ct_id INT,
            rootfs_storage VARCHAR(100) DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT NOW(),
            completed_at DATETIME,
            error_msg TEXT,
            INDEX idx_backups_vm_id (vm_id),
            INDEX idx_backups_status (status)
        )
    `);

    // 创建备份操作日志表
    execute(`
        CREATE TABLE IF NOT EXISTS backup_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            vm_id INT NOT NULL,
            action VARCHAR(50) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建恢复任务表
    execute(`
        CREATE TABLE IF NOT EXISTS restore_tasks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            user_id INT NOT NULL,
            backup_id INT NOT NULL,
            pve_upid VARCHAR(200) DEFAULT '',
            progress INT DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            created_at DATETIME NOT NULL DEFAULT NOW(),
            completed_at DATETIME,
            error_msg TEXT,
            INDEX idx_restore_tasks_vm_id (vm_id),
            INDEX idx_restore_tasks_status (status)
        )
    `);

    // 创建 LXC 容器表
    execute(`
        CREATE TABLE IF NOT EXISTS lxc_containers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ct_id INT NOT NULL,
            user_id INT NOT NULL,
            name VARCHAR(255) DEFAULT '',
            expiration_date DATETIME,
            renewal_price VARCHAR(50) DEFAULT '',
            reminderSent INT DEFAULT 0,
            lastReminderDate VARCHAR(50) DEFAULT '',
            dhcp_static_ip VARCHAR(50) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_lxc_user_id (user_id)
        )
    `);

    // 创建 LXC 提醒记录表
    execute(`
        CREATE TABLE IF NOT EXISTS lxc_reminders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ct_id INT NOT NULL,
            days INT NOT NULL,
            sent_at DATETIME NOT NULL
        )
    `);

    // 创建端口转发表
    execute(`
        CREATE TABLE IF NOT EXISTS port_forwards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            type VARCHAR(10) NOT NULL,
            vm_id INT,
            ct_id INT,
            name VARCHAR(200) DEFAULT '',
            ip VARCHAR(50) NOT NULL,
            mac VARCHAR(50) DEFAULT '',
            internal_port INT NOT NULL,
            external_port INT NOT NULL,
            protocol VARCHAR(10) DEFAULT 'tcp',
            enabled INT DEFAULT 1,
            source VARCHAR(50) DEFAULT 'panel',
            sync_status VARCHAR(20) DEFAULT 'synced',
            ikuai_id VARCHAR(100) DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 初始化默认配置
    initDefaultConfig();

    // 检查并创建默认管理员用户
    createDefaultAdmin();

    // 数据库迁移：添加新字段（兼容已有数据库）
    migrateSchema();

    // SQLite → MySQL 数据迁移（仅在 MySQL 空表且 SQLite 有数据时执行）
    migrateFromSQLite();

    console.log('[数据库] MySQL 初始化完成');
}

// 数据库 schema 迁移
function migrateSchema() {
    function safeAlter(table, column, definition) {
        try {
            execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        } catch (e) {
            if (!e.message.toLowerCase().includes('duplicate')) {
                console.error(`迁移 ${table}.${column} 字段失败:`, e.message);
            }
        }
    }

    safeAlter('vms', 'renewal_price', "TEXT");
    safeAlter('cdk_codes', 'target_user_id', 'INT');
    safeAlter('users', 'totp_secret', "TEXT");
    safeAlter('users', 'totp_enabled', 'INT DEFAULT 0');
    safeAlter('vms', 'backup_storage', "TEXT");
    safeAlter('backups', "type", "VARCHAR(10) DEFAULT 'vm'");
    safeAlter('backups', 'ct_id', 'INT');
    safeAlter('cdk_codes', 'used_ct_id', 'INT');
    safeAlter('backups', 'rootfs_storage', "TEXT");
    safeAlter('vms', 'dhcp_static_ip', "TEXT");
    safeAlter('lxc_containers', 'dhcp_static_ip', "TEXT");

    // 修复已有 LXC 备份记录的 ct_id 和 type
    try {
        const orphaned = queryAll("SELECT id, pve_upid FROM backups WHERE vm_id = 0 AND ct_id IS NULL AND type = 'vm'");
        for (const row of orphaned) {
            if (row.pve_upid) {
                const parts = row.pve_upid.split(':');
                if (parts.length >= 7 && parts[5] === 'vzdump') {
                    const ctId = parseInt(parts[6]);
                    if (!isNaN(ctId)) {
                        execute("UPDATE backups SET ct_id = ?, type = 'lxc' WHERE id = ?", [ctId, row.id]);
                        console.log(`修复备份记录 ID=${row.id}: 设置 ct_id=${ctId}, type='lxc'`);
                    }
                }
            }
        }
    } catch (e) {
        console.error('修复 LXC 备份记录失败:', e.message);
    }
}

// 初始化默认配置
function initDefaultConfig() {
    const defaultConfigs = {
        'smtp:host': '',
        'smtp:port': '587',
        'smtp:secure': '0',
        'smtp:user': '',
        'smtp:password': '',
        'smtp:from': '',
        'smtp:enabled': '0',
        'reminder:days1': '7',
        'reminder:days2': '3',
        'reminder:days3': '1',
        'snapshot:max_per_vm': '5',
        'snapshot:daily_create_limit': '20',
        'snapshot:daily_restore_limit': '10',
        'backup:default_storage': 'local',
        'backup:max_per_vm': '3',
        'backup:daily_limit': '3',
        'lxc:max_per_vm': '3',
        'lxc:default_storage': 'local',
        'lxc:default_memory': '512',
        'lxc:default_cores': '1',
        'lxc:default_disk': '8',
        'lxc:default_swap': '512',
        'forward:port_range_start': '50000',
        'forward:port_range_end': '60000',
        'forward:default_protocol': 'tcp',
        'forward:wan_interface': 'adsl1',
        'forward:max_per_user': '10',
        'dhcp:ip_range_start': '10.0.0.110',
        'dhcp:ip_range_end': '10.0.0.199',
        'dhcp:interface': 'lan2',
        'dhcp:gateway': '10.0.0.1',
        'dhcp:dns1': '119.29.29.29',
        'dhcp:dns2': '223.5.5.5',
    };

    for (const [key, value] of Object.entries(defaultConfigs)) {
        execute(
            'INSERT IGNORE INTO config (`key`, value) VALUES (?, ?)',
            [key, value]
        );
    }
}

// 创建默认管理员账户
function createDefaultAdmin() {
    const adminExists = queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || generateRandomPassword(16);
        const adminSalt = crypto.randomBytes(16).toString('hex');
        const hashedPassword = CryptoJS.SHA256(adminSalt + defaultAdminPassword).toString();

        execute(
            `INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, must_change_password, password_salt, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['admin', hashedPassword, 'admin', '', '', '', 0, 1, adminSalt, mysqlNow()]
        );

        console.log('================================================');
        console.log('  ⚠ 默认管理员账号已创建（此信息仅显示一次）');
        console.log('  用户名: admin');
        console.log(`  密码:   ${defaultAdminPassword}`);
        console.log('  ⚠ 请立即登录并修改密码！');
        console.log('================================================');
    }

    // 兼容旧数据库：添加 must_change_password 字段（如果不存在）
    try {
        execute("ALTER TABLE users ADD COLUMN must_change_password INT DEFAULT 0");
    } catch (e) {
        // 字段已存在，忽略错误
    }

    // 兼容旧数据库：添加 password_salt 字段（如果不存在）
    try {
        execute("ALTER TABLE users ADD COLUMN password_salt TEXT");
    } catch (e) {
        // 字段已存在，忽略错误
    }
}

// SQLite → MySQL 数据迁移
// 当首次切换到 MySQL 模式时，自动将 SQLite 数据导入 MySQL
function migrateFromSQLite() {
    const path = require('path');
    const fs = require('fs');
    const sqliteDbFile = path.join(__dirname, '../../data/pve-panel.db');

    // 1. 检查 SQLite 文件是否存在
    if (!fs.existsSync(sqliteDbFile)) {
        return; // 没有 SQLite 数据库，无需迁移
    }

    // 2. 检查 MySQL 是否已有数据（users 表超过 1 行说明已迁移过或有独立数据）
    const userCount = queryOne('SELECT COUNT(*) AS cnt FROM users');
    if (userCount && userCount.cnt > 1) {
        return; // MySQL 已有数据，跳过迁移
    }

    console.log('[迁移] 检测到 SQLite 数据库，开始迁移到 MySQL...');

    // 3. 预处理：修复已创建的表结构问题（首次建表时可能缺少这些设置）
    try { execute('ALTER TABLE messages CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'); } catch(e) {}
    try { execute('ALTER TABLE backups MODIFY COLUMN size BIGINT DEFAULT 0'); } catch(e) {}

    let sqliteDb;
    try {
        const Database = require('better-sqlite3');
        sqliteDb = new Database(sqliteDbFile, { readonly: true });
    } catch (e) {
        console.warn('[迁移] 无法打开 SQLite 数据库:', e.message);
        return;
    }

    let totalMigrated = 0;

    // 特殊表配置：列名需要反引号包裹（MySQL 保留字）或特殊类型转换
    const tableConfig = {
        config: { backtickColumns: ['key'] },
        backups: { intToBigInt: ['size'] },   // SQLite 无类型限制，size 可能超 INT 范围
    };

    try {
        // 需要迁移的表列表（按依赖顺序：用户表优先）
        const tables = [
            'users',           // 用户表（其他表依赖 user_id）
            'config',          // 配置表（key 是保留字）
            'cdk_codes',       // CDK 兑换码
            'vms',             // 虚拟机
            'vm_reminders',    // VM 提醒记录
            'lxc_containers',  // LXC 容器
            'lxc_reminders',   // LXC 提醒记录
            'memos',           // 备忘录
            'messages',        // 站内消息（utf8mb4 已在上面 ALTER 过）
            'password_reset_tokens', // 密码重置令牌
            'refresh_tokens',  // 刷新令牌
            'snapshot_logs',   // 快照日志
            'recovery_codes',  // 恢复码
            'backups',         // 备份（size 已改为 BIGINT）
            'backup_logs',     // 备份日志
            'restore_tasks',   // 恢复任务
            'port_forwards',   // 端口转发
        ];

        for (const table of tables) {
            try {
                // 检查 SQLite 表是否存在
                const tblInfo = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
                if (!tblInfo) continue;

                // 从 SQLite 读取所有数据
                const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
                if (!rows || rows.length === 0) continue;

                const columns = Object.keys(rows[0]);

                // 跳过 users 表中的默认管理员（MySQL 已创建）
                let rowsToMigrate = rows;
                if (table === 'users') {
                    rowsToMigrate = rows.filter(r => r.username !== 'admin');
                }
                if (rowsToMigrate.length === 0) continue;

                // 构建列名：对保留字列加反引号
                const cfg = tableConfig[table] || {};
                const colNames = columns.map(col => {
                    return (cfg.backtickColumns && cfg.backtickColumns.includes(col)) ? `\`${col}\`` : col;
                }).join(', ');

                const placeholders = columns.map(() => '?').join(', ');
                // 有唯一键/主键的表用 ON DUPLICATE KEY UPDATE 避免重复插入错误
                const hasUniqueKey = ['config', 'users', 'cdk_codes', 'port_forwards', 'refresh_tokens', 'password_reset_tokens', 'recovery_codes'].includes(table);
                let stmt;
                if (hasUniqueKey) {
                    const updatePart = columns.map(col => {
                        const quoted = (cfg.backtickColumns && cfg.backtickColumns.includes(col)) ? `\`${col}\`` : col;
                        return `${quoted}=VALUES(${quoted})`;
                    }).join(', ');
                    stmt = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updatePart}`;
                } else {
                    stmt = `INSERT INTO ${table} (${colNames}) VALUES (${placeholders})`;
                }

                for (const row of rowsToMigrate) {
                    const values = columns.map(col => {
                        let val = row[col];
                        // 将 SQLite 的 ISO 日期字符串转为 MySQL DATETIME 格式
                        if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
                            val = val.slice(0, 19).replace('T', ' ');
                        }
                        // 处理 Buffer 类型（SQLite BLOB）
                        if (Buffer.isBuffer(val)) {
                            val = val.toString('binary');
                        }
                        // 处理超大数值（SQLite 无类型限制，MySQL INT/BIGINT 有范围）
                        if (cfg.intToBigInt && cfg.intToBigInt.includes(col) && typeof val === 'number') {
                            val = Math.floor(val); // 确保整数
                        }
                        return val;
                    });
                    execute(stmt, values);
                }

                totalMigrated += rowsToMigrate.length;
                console.log(`[迁移] ${table}: 迁移 ${rowsToMigrate.length} 条数据`);
            } catch (e) {
                console.warn(`[迁移] 表 ${table} 迁移失败:`, e.message);
            }
        }

        if (totalMigrated > 0) {
            console.log(`[迁移] 完成！共迁移 ${totalMigrated} 条数据从 SQLite 到 MySQL`);
        } else {
            console.log('[迁移] SQLite 数据库为空或无需迁移');
        }
    } finally {
        sqliteDb.close();
        // 迁移结束后强制重建连接（迁移过程可能产生大量临时连接或异常状态）
        // 确保后续正常操作使用一个全新的干净连接
        if (_connection) {
            try { _connection.destroy(); } catch (e) { /* ignore */ }
            _connection = null;
        }
        _connection = new mysql(getConnectionConfig());
        console.log('[迁移] 连接已重建，可正常使用');
    }
}

// 导出数据库操作函数
module.exports = {
    // 数据库连接
    db: { connection: getConnection },

    // 用户操作
    users: {
        getAll: () => queryAll('SELECT * FROM users'),
        getById: (id) => queryOne('SELECT * FROM users WHERE id = ?', [id]),
        getByUsername: (username) => queryOne('SELECT * FROM users WHERE username = ?', [username]),
        create: (user) => {
            const result = execute(
                `INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    user.username,
                    user.password,
                    user.role || 'user',
                    user.avatar || '',
                    user.bio || '',
                    user.email || '',
                    user.emailVerified ? 1 : 0,
                    user.created_at || mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
        },
        update: (id, updates) => {
            const allowedColumns = ['username', 'email', 'password', 'password_salt', 'avatar', 'role', 'is_active',
                'must_change_password', 'emailVerified'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (key === 'emailVerified') {
                    fields.push('emailVerified = ?');
                    values.push(value ? 1 : 0);
                } else {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            }
            values.push(id);

            execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM users WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM users WHERE id = ?', [id]),
    },

    // 虚拟机操作
    vms: {
        getAll: () => queryAll('SELECT * FROM vms'),
        getByUserId: (userId) => queryAll('SELECT * FROM vms WHERE user_id = ?', [userId]),
        getById: (id) => queryOne('SELECT * FROM vms WHERE id = ?', [id]),
        create: (vm) => {
            const result = execute(
                `INSERT INTO vms (vm_id, user_id, name, expiration_date, renewal_price, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    vm.vm_id,
                    vm.user_id,
                    vm.name || '',
                    vm.expiration_date || null,
                    vm.renewal_price || '',
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM vms WHERE id = ?', [result.insertId]);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'vm_id', 'user_id', 'username', 'expiration_date',
                'renewal_price', 'config', 'status', 'dhcp_static_ip', 'reminderSent', 'lastReminderDate'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (key === 'reminderSent') {
                    fields.push('reminderSent = ?');
                    values.push(value ? 1 : 0);
                } else {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            }
            values.push(id);

            execute(`UPDATE vms SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM vms WHERE id = ?', [id]);
        },
        delete: (id) => {
            execute('UPDATE cdk_codes SET used_vm_id = NULL WHERE used_vm_id = ?', [id]);
            return execute('DELETE FROM vms WHERE id = ?', [id]);
        },
        // 虚拟机提醒记录操作
        reminders: {
            getByVmId: (vmId) => queryAll('SELECT * FROM vm_reminders WHERE vm_id = ?', [vmId]),
            add: (vmId, days) => {
                execute(
                    'INSERT INTO vm_reminders (vm_id, days, sent_at) VALUES (?, ?, ?)',
                    [vmId, days, mysqlNow()]
                );
            },
            clear: (vmId) => execute('DELETE FROM vm_reminders WHERE vm_id = ?', [vmId]),
            countExpiredDays: (vmId) => {
                const result = queryOne(
                    `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM vm_reminders
                     WHERE vm_id = ? AND days = 0`,
                    [vmId]
                );
                return result?.count || 0;
            },
            getTodayExpired: () => {
                const today = mysqlToday();
                return queryAll(
                    "SELECT vm_id FROM vm_reminders WHERE days = 0 AND sent_at LIKE ?",
                    [today + '%']
                );
            },
            getTodayAll: () => {
                const today = mysqlToday();
                return queryAll(
                    'SELECT * FROM vm_reminders WHERE sent_at LIKE ?',
                    [today + '%']
                );
            }
        }
    },

    // CDK 兑换码操作
    cdk: {
        getAll: () => queryAll(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            ORDER BY c.created_at DESC
        `),
        getById: (id) => queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]),
        getByCode: (code) => queryOne('SELECT * FROM cdk_codes WHERE code = ?', [code]),
        getByBatchId: (batchId) => queryAll(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            WHERE c.batch_id = ? ORDER BY c.created_at
        `, [batchId]),
        getUnused: () => queryAll('SELECT * FROM cdk_codes WHERE is_used = 0'),
        getUsed: () => queryAll('SELECT * FROM cdk_codes WHERE is_used = 1'),
        create: (cdk) => {
            const result = execute(
                `INSERT INTO cdk_codes (code, duration_days, created_by, target_user_id, created_at, expires_at, batch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    cdk.code,
                    cdk.duration_days,
                    cdk.created_by,
                    cdk.target_user_id || null,
                    cdk.created_at || mysqlNow(),
                    cdk.expires_at || null,
                    cdk.batch_id || null
                ]
            );
            return queryOne('SELECT * FROM cdk_codes WHERE id = ?', [result.insertId]);
        },
        markAsUsed: (id, userId, vmId, ctId) => {
            if (ctId) {
                execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_ct_id = ?, used_at = ?
                     WHERE id = ?`,
                    [userId, vmId, ctId, mysqlNow(), id]
                );
            } else {
                execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_at = ?
                     WHERE id = ?`,
                    [userId, vmId, mysqlNow(), id]
                );
            }
            return queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM cdk_codes WHERE id = ?', [id]),
        deleteBatch: (ids) => {
            if (!ids || ids.length === 0) return;
            const placeholders = ids.map(() => '?').join(',');
            execute(`DELETE FROM cdk_codes WHERE id IN (${placeholders})`, ids);
        },
        deleteExpired: () => {
            return execute(
                `DELETE FROM cdk_codes
                 WHERE is_used = 0 AND expires_at IS NOT NULL AND expires_at <= NOW()`
            );
        },
        deleteExpiredOrUsed: () => {
            return execute(
                `DELETE FROM cdk_codes
                 WHERE is_used = 1 OR (expires_at IS NOT NULL AND expires_at <= NOW())`
            );
        },
        getActiveCount: () => {
            return queryOne(
                `SELECT COUNT(*) as count FROM cdk_codes
                 WHERE is_used = 0 AND (expires_at IS NULL OR expires_at > NOW())`
            );
        }
    },

    // 备忘录操作
    memos: {
        getByUserId: (userId) => queryAll('SELECT * FROM memos WHERE user_id = ?', [userId]),
        getById: (id) => queryOne('SELECT * FROM memos WHERE id = ?', [id]),
        create: (memo) => {
            const result = execute(
                `INSERT INTO memos (user_id, title, content, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    memo.user_id,
                    memo.title || '',
                    memo.content || '',
                    mysqlNow(),
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM memos WHERE id = ?', [result.insertId]);
        },
        update: (id, updates) => {
            const allowedColumns = ['title', 'content', 'user_id'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);

            execute(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM memos WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM memos WHERE id = ?', [id])
    },

    // 密码重置令牌操作
    passwordResetTokens: {
        getAll: () => queryAll('SELECT * FROM password_reset_tokens'),
        getByToken: (token) => queryOne('SELECT * FROM password_reset_tokens WHERE token = ?', [token]),
        create: (tokenData) => {
            const result = execute(
                `INSERT INTO password_reset_tokens (user_id, email, token, type, expires_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    tokenData.userId,
                    tokenData.email || null,
                    tokenData.token,
                    tokenData.type || 'password_reset',
                    tokenData.expiresAt
                ]
            );
            return queryOne('SELECT * FROM password_reset_tokens WHERE id = ?', [result.insertId]);
        },
        delete: (id) => execute('DELETE FROM password_reset_tokens WHERE id = ?', [id]),
        deleteByUserId: (userId) => execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]),
        deleteByType: (userId, type) => execute(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND type = ?',
            [userId, type]
        )
    },

    // 站内消息操作
    messages: {
        create: (data) => {
            const result = execute(
                `INSERT INTO messages (uid, title, content, type, send_type, link_url, link_text, batch_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.uid,
                    data.title || '',
                    data.content || '',
                    data.type || 1,
                    data.send_type || 1,
                    data.link_url || '',
                    data.link_text || '',
                    data.batch_id || '',
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM messages WHERE id = ?', [result.insertId]);
        },
        getByUser: (uid, type, page = 1, pageSize = 20) => {
            const offset = (page - 1) * pageSize;
            let where = '(uid = ? OR uid = 0)';
            const params = [uid];
            if (type && type !== 'all') {
                where += ' AND type = ?';
                params.push(parseInt(type));
            }
            const totalResult = queryOne(`SELECT COUNT(*) as count FROM messages WHERE ${where}`, params);
            const list = queryAll(
                `SELECT * FROM messages WHERE ${where}
                 ORDER BY is_read ASC, created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset]
            );
            return { list, total: totalResult.count, page, pageSize };
        },
        getById: (id) => queryOne('SELECT * FROM messages WHERE id = ?', [id]),
        getUnreadCount: (uid) => {
            const result = queryOne(
                `SELECT COUNT(*) as count FROM messages
                 WHERE (uid = ? OR uid = 0) AND is_read = 0`,
                [uid]
            );
            return result?.count || 0;
        },
        markRead: (id) => execute('UPDATE messages SET is_read = 1 WHERE id = ?', [id]),
        markAllRead: (uid) => execute(
            "UPDATE messages SET is_read = 1 WHERE (uid = ? OR uid = 0) AND is_read = 0",
            [uid]
        ),
        delete: (id, uid) => execute(
            'DELETE FROM messages WHERE id = ? AND (uid = ? OR uid = 0)',
            [id, uid]
        ),
        deleteAll: (uid) => execute(
            "DELETE FROM messages WHERE (uid = ? OR uid = 0) AND is_read = 1",
            [uid]
        ),
        getStats: () => {
            const total = queryOne('SELECT COUNT(*) as count FROM messages');
            const unread = queryOne("SELECT COUNT(*) as count FROM messages WHERE is_read = 0");
            const byType = queryAll('SELECT type, COUNT(*) as count FROM messages GROUP BY type');
            return { total: total.count, unread: unread.count, byType };
        }
    },

    // 配置操作
    config: {
        getSmtp: () => ({
            host: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:host']))?.value || '',
            port: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:port']))?.value || '587'),
            secure: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:secure']))?.value === '1',
            user: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:user']))?.value || '',
            password: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '',
            from: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:from']))?.value || '',
            enabled: (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:enabled']))?.value === '1'
        }),
        setSmtp: (smtpConfig) => {
            const currentPassword = (queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '';
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:host', smtpConfig.host ?? '']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:port', String(smtpConfig.port ?? 587)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:secure', smtpConfig.secure ? '1' : '0']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:user', smtpConfig.user ?? '']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:password', smtpConfig.password !== undefined ? smtpConfig.password : currentPassword]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:from', smtpConfig.from ?? '']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:enabled', smtpConfig.enabled ? '1' : '0']);
        },
        getReminder: () => ({
            days1: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days1']))?.value) || 7,
            days2: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days2']))?.value) || 3,
            days3: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days3']))?.value) || 1
        }),
        setReminder: (reminderConfig) => {
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days1', String(reminderConfig.days1 ?? 7)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days2', String(reminderConfig.days2 ?? 3)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days3', String(reminderConfig.days3 ?? 1)]);
        },
        get: (key) => (queryOne('SELECT value FROM config WHERE `key` = ?', [key]))?.value,
        set: (key, value) => execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', [key, value])
    },

    // 刷新令牌操作
    refreshTokens: {
        create: (data) => {
            const result = execute(
                `INSERT INTO refresh_tokens (user_id, token, device_name, ip, user_agent, created_at, expires_at, revoked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                [
                    data.user_id,
                    data.token,
                    data.device_name || '',
                    data.ip || '',
                    data.user_agent || '',
                    data.created_at || mysqlNow(),
                    data.expires_at
                ]
            );
            return queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [result.insertId]);
        },
        getByToken: (token) => queryOne('SELECT * FROM refresh_tokens WHERE token = ?', [token]),
        getById: (id) => queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [id]),
        getByUserId: (userId) => queryAll(
            `SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > NOW()
             ORDER BY created_at DESC`,
            [userId]
        ),
        revoke: (id) => execute('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [id]),
        deleteByToken: (token) => execute('DELETE FROM refresh_tokens WHERE token = ?', [token]),
        revokeByUserId: (userId, excludeId) => {
            if (excludeId) {
                execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND id != ?', [userId, excludeId]);
            } else {
                execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
            }
        },
        cleanup: () => execute("DELETE FROM refresh_tokens WHERE expires_at <= NOW() OR revoked = 1")
    },

    // 快照配置操作
    snapshotConfig: {
        get: () => ({
            max_per_vm: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:max_per_vm']))?.value) || 5,
            daily_create_limit: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:daily_create_limit']))?.value) || 20,
            daily_restore_limit: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:daily_restore_limit']))?.value) || 10
        }),
        set: (cfg) => {
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:max_per_vm', String(cfg.max_per_vm ?? 5)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_create_limit', String(cfg.daily_create_limit ?? 20)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_restore_limit', String(cfg.daily_restore_limit ?? 10)]);
        }
    },

    // 快照日志操作
    snapshotLogs: {
        add: (userId, vmId, action) => {
            execute(
                'INSERT INTO snapshot_logs (user_id, vm_id, action, created_at) VALUES (?, ?, ?, ?)',
                [userId, vmId, action, mysqlNow()]
            );
        },
        getDailyCount: (userId, action) => {
            const today = mysqlToday();
            const result = queryOne(
                `SELECT COUNT(*) as count FROM snapshot_logs
                 WHERE user_id = ? AND action = ? AND created_at >= ?`,
                [userId, action, today]
            );
            return result?.count || 0;
        }
    },

    // 2FA 操作
    twofa: {
        getSecret: (userId) => (queryOne('SELECT totp_secret FROM users WHERE id = ?', [userId]))?.totp_secret || '',
        setSecret: (userId, secret) => execute('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]),
        isEnabled: (userId) => {
            const row = queryOne('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
            return row ? row.totp_enabled === 1 : false;
        },
        enable: (userId) => execute('UPDATE users SET totp_enabled = 1 WHERE id = ?', [userId]),
        disable: (userId) => execute("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?", [userId]),
        // 恢复码
        getRecoveryCodes: (userId) => queryAll(
            'SELECT id, code, used, created_at FROM recovery_codes WHERE user_id = ? ORDER BY id',
            [userId]
        ),
        getUnusedRecoveryCodes: (userId) => queryAll(
            'SELECT code FROM recovery_codes WHERE user_id = ? AND used = 0',
            [userId]
        ),
        addRecoveryCodes: function(userId, codes) {
            const stmt = 'INSERT INTO recovery_codes (user_id, code) VALUES (?, ?)';
            for (const code of codes) {
                execute(stmt, [userId, code]);
            }
        },
        markRecoveryCodeUsed: (code) => execute(
            'UPDATE recovery_codes SET used = 1 WHERE code = ? AND used = 0',
            [code]
        ),
        deleteRecoveryCodes: (userId) => execute(
            'DELETE FROM recovery_codes WHERE user_id = ?',
            [userId]
        ),
        getUnusedRecoveryCodeCount: (userId) => {
            const result = queryOne(
                'SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used = 0',
                [userId]
            );
            return result?.count || 0;
        }
    },

    // 备份配置操作
    backupConfig: {
        get: () => ({
            default_storage: (queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:default_storage']))?.value || 'local',
            max_per_vm: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:max_per_vm']))?.value) || 3,
            daily_limit: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:daily_limit']))?.value) || 3
        }),
        set: (cfg) => {
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:default_storage', cfg.default_storage ?? 'local']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:max_per_vm', String(cfg.max_per_vm ?? 3)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:daily_limit', String(cfg.daily_limit ?? 3)]);
        }
    },

    // 备份操作
    backups: {
        create: (data) => {
            const result = execute(
                `INSERT INTO backups (vm_id, ct_id, user_id, storage, notes, type, rootfs_storage, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [data.vm_id, data.ct_id || null, data.user_id, data.storage, data.notes || '', data.type || 'vm', data.rootfs_storage || '']
            );
            return { id: result.insertId };
        },
        getById: (id) => queryOne('SELECT * FROM backups WHERE id = ?', [id]),
        getByVmId: (vmId) => queryAll(
            'SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at DESC',
            [vmId]
        ),
        getByStatus: (status) => queryAll('SELECT * FROM backups WHERE status = ?', [status]),
        getByUserAndDate: (userId, date) => {
            const result = queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE user_id = ? AND created_at >= ?`,
                [userId, date]
            );
            return result?.count || 0;
        },
        getCountByVmId: (vmId, userId) => {
            if (userId) {
                const result = queryOne(
                    `SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND user_id = ? AND status != 'failed'`,
                    [vmId, userId]
                );
                return result?.count || 0;
            }
            const result = queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND status != 'failed'`,
                [vmId]
            );
            return result?.count || 0;
        },
        updateProgress: (id, progress, pveUpid) => execute(
            "UPDATE backups SET progress = ?, pve_upid = ?, status = 'running' WHERE id = ?",
            [progress, pveUpid, id]
        ),
        complete: (id, filename, size) => execute(
            "UPDATE backups SET status = 'completed', progress = 100, filename = ?, size = ?, completed_at = NOW() WHERE id = ?",
            [filename, size || 0, id]
        ),
        fail: (id, errorMsg) => execute(
            "UPDATE backups SET status = 'failed', error_msg = ?, completed_at = NOW() WHERE id = ?",
            [errorMsg, id]
        ),
        delete: (id) => execute('DELETE FROM backups WHERE id = ?', [id]),
        deleteBatch: (ids) => {
            const placeholders = ids.map(() => '?').join(',');
            execute(`DELETE FROM backups WHERE id IN (${placeholders})`, ids);
        },
        getRunningBackups: () => queryAll(
            "SELECT * FROM backups WHERE status = 'running' OR status = 'pending'"
        ),
        getByCtId: (ctId) => queryAll(
            "SELECT * FROM backups WHERE ct_id = ? AND type = 'lxc' ORDER BY created_at DESC",
            [ctId]
        ),
        getCountByCtId: (ctId, userId) => {
            if (userId) {
                const result = queryOne(
                    `SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND user_id = ? AND type = 'lxc' AND status != 'failed'`,
                    [ctId, userId]
                );
                return result?.count || 0;
            }
            const result = queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND type = 'lxc' AND status != 'failed'`,
                [ctId]
            );
            return result?.count || 0;
        }
    },

    // 备份日志操作
    backupLogs: {
        add: (userId, vmId, action) => execute(
            'INSERT INTO backup_logs (user_id, vm_id, action) VALUES (?, ?, ?)',
            [userId, vmId, action]
        ),
        getDailyCount: (userId) => {
            const today = mysqlToday();
            const result = queryOne(
                `SELECT COUNT(*) as count FROM backup_logs WHERE user_id = ? AND action = 'create' AND created_at >= ?`,
                [userId, today]
            );
            return result?.count || 0;
        }
    },

    // 恢复任务操作
    restoreTasks: {
        create: (data) => {
            const result = execute(
                `INSERT INTO restore_tasks (vm_id, user_id, backup_id, pve_upid, status)
                 VALUES (?, ?, ?, ?, 'pending')`,
                [data.vm_id, data.user_id, data.backup_id, data.pve_upid || '']
            );
            return { id: result.insertId };
        },
        getById: (id) => queryOne('SELECT * FROM restore_tasks WHERE id = ?', [id]),
        getByVmId: (vmId) => queryAll(
            'SELECT * FROM restore_tasks WHERE vm_id = ? ORDER BY created_at DESC',
            [vmId]
        ),
        getRunning: () => queryAll(
            "SELECT * FROM restore_tasks WHERE status = 'running' OR status = 'pending'"
        ),
        getRunningByVmId: (vmId) => queryAll(
            "SELECT * FROM restore_tasks WHERE vm_id = ? AND (status = 'running' OR status = 'pending')",
            [vmId]
        ),
        updateProgress: (id, progress, pveUpid) => execute(
            "UPDATE restore_tasks SET progress = ?, pve_upid = ?, status = 'running' WHERE id = ?",
            [progress, pveUpid, id]
        ),
        complete: (id) => execute(
            "UPDATE restore_tasks SET status = 'completed', progress = 100, completed_at = NOW() WHERE id = ?",
            [id]
        ),
        fail: (id, errorMsg) => execute(
            "UPDATE restore_tasks SET status = 'failed', error_msg = ?, completed_at = NOW() WHERE id = ?",
            [errorMsg, id]
        ),
        deleteByBackupId: (backupId) => execute(
            'DELETE FROM restore_tasks WHERE backup_id = ?',
            [backupId]
        ),
    },

    // LXC 配置操作
    lxcConfig: {
        get: () => ({
            max_per_vm: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:max_per_vm']))?.value) || 3,
            default_storage: (queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_storage']))?.value || 'local',
            default_memory: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_memory']))?.value) || 512,
            default_cores: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_cores']))?.value) || 1,
            default_disk: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_disk']))?.value) || 8,
            default_swap: parseInt((queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_swap']))?.value) || 512
        }),
        set: (cfg) => {
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:max_per_vm', String(cfg.max_per_vm ?? 3)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_storage', cfg.default_storage ?? 'local']);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_memory', String(cfg.default_memory ?? 512)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_cores', String(cfg.default_cores ?? 1)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_disk', String(cfg.default_disk ?? 8)]);
            execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_swap', String(cfg.default_swap ?? 512)]);
        }
    },

    // LXC 容器操作
    lxcContainers: {
        getAll: () => queryAll('SELECT * FROM lxc_containers'),
        getByUserId: (userId) => queryAll('SELECT * FROM lxc_containers WHERE user_id = ?', [userId]),
        getById: (id) => queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]),
        getByCtId: (ctId) => queryAll('SELECT * FROM lxc_containers WHERE ct_id = ?', [ctId]),
        create: (ct) => {
            const result = execute(
                `INSERT INTO lxc_containers (ct_id, user_id, name, expiration_date, renewal_price, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    ct.ct_id,
                    ct.user_id,
                    ct.name || '',
                    ct.expiration_date || null,
                    ct.renewal_price || '',
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [result.insertId]);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'ct_id', 'user_id', 'username', 'expiration_date',
                'renewal_price', 'config', 'status', 'dhcp_static_ip', 'reminderSent', 'lastReminderDate'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (key === 'reminderSent') {
                    fields.push('reminderSent = ?');
                    values.push(value ? 1 : 0);
                } else {
                    fields.push(`${key} = ?`);
                    values.push(value);
                }
            }
            values.push(id);

            execute(`UPDATE lxc_containers SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]);
        },
        delete: (id) => {
            execute('UPDATE cdk_codes SET used_ct_id = NULL WHERE used_ct_id = ?', [id]);
            return execute('DELETE FROM lxc_containers WHERE id = ?', [id]);
        },
        // LXC 容器提醒记录操作
        reminders: {
            getByCtId: (ctId) => queryAll('SELECT * FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            add: (ctId, days) => {
                execute(
                    'INSERT INTO lxc_reminders (ct_id, days, sent_at) VALUES (?, ?, ?)',
                    [ctId, days, mysqlNow()]
                );
            },
            clear: (ctId) => execute('DELETE FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            countExpiredDays: (ctId) => {
                const result = queryOne(
                    `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM lxc_reminders
                     WHERE ct_id = ? AND days = 0`,
                    [ctId]
                );
                return result?.count || 0;
            },
            getTodayExpired: () => {
                const today = mysqlToday();
                return queryAll(
                    "SELECT ct_id FROM lxc_reminders WHERE days = 0 AND sent_at LIKE ?",
                    [today + '%']
                );
            },
            getTodayAll: () => {
                const today = mysqlToday();
                return queryAll(
                    'SELECT * FROM lxc_reminders WHERE sent_at LIKE ?',
                    [today + '%']
                );
            }
        }
    },

    // 端口转发操作
    portForwards: {
        getAll: () => queryAll('SELECT * FROM port_forwards ORDER BY created_at DESC'),
        getByType: (type) => queryAll(
            'SELECT * FROM port_forwards WHERE type = ? ORDER BY created_at DESC',
            [type]
        ),
        getById: (id) => queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]),
        getByUserId: (userId) => {
            const userVms = queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
            const userCts = queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let rules = [];
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                rules = rules.concat(queryAll(
                    `SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                    vmIds
                ));
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                rules = rules.concat(queryAll(
                    `SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                    ctIds
                ));
            }
            return rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        getByVmId: (vmId) => queryAll(
            "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
            [vmId]
        ),
        getByCtId: (ctId) => queryAll(
            "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
            [ctId]
        ),
        getByDeviceId: (type, deviceId) => {
            if (type === 'vm') return queryAll(
                "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
                [deviceId]
            );
            return queryAll(
                "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
                [deviceId]
            );
        },
        getCountByUserId: (userId) => {
            const userVms = queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
            const userCts = queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let count = 0;
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                const r = queryOne(
                    `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                    vmIds
                );
                count += r?.c || 0;
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                const r = queryOne(
                    `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                    ctIds
                );
                count += r?.c || 0;
            }
            return count;
        },
        create: (data) => {
            const result = execute(
                `INSERT INTO port_forwards (type, vm_id, ct_id, name, ip, mac, internal_port, external_port, protocol, enabled, source, sync_status, ikuai_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.type,
                    data.vm_id || null,
                    data.ct_id || null,
                    data.name || '',
                    data.ip,
                    data.mac || '',
                    data.internal_port,
                    data.external_port,
                    data.protocol || 'tcp',
                    data.enabled !== undefined ? data.enabled : 1,
                    data.source || 'panel',
                    data.sync_status || 'pending',
                    data.ikuai_id || '',
                    mysqlNow(),
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM port_forwards WHERE id = ?', [result.insertId]);
        },
        update: (id, data) => {
            const allowedColumns = ['name', 'type', 'vm_id', 'ct_id', 'ip', 'mac', 'internal_port', 'external_port', 'protocol', 'enabled', 'source', 'sync_status', 'ikuai_id'];
            for (const key of Object.keys(data)) {
                if (!allowedColumns.includes(key)) {
                    delete data[key];
                }
            }
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(data)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            values.push(mysqlNow(), id);
            execute(`UPDATE port_forwards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, values);
            return queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM port_forwards WHERE id = ?', [id]),
        deleteByDevice: (type, deviceId) => {
            if (type === 'vm') return execute(
                "DELETE FROM port_forwards WHERE type = 'vm' AND vm_id = ?",
                [deviceId]
            );
            return execute(
                "DELETE FROM port_forwards WHERE type = 'lxc' AND ct_id = ?",
                [deviceId]
            );
        },
        getUsedPorts: () => {
            return queryAll(
                'SELECT external_port, type, vm_id, ct_id, ip, internal_port, protocol FROM port_forwards'
            );
        },
        getByExternalPort: (port) => queryAll(
            'SELECT * FROM port_forwards WHERE external_port = ?',
            [port]
        ),
    },

    // 初始化入口（供外部调用）
    initDb,
};
