const mysql = require('mysql2/promise');
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

// 初始化 MySQL 连接池
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: parseInt(process.env.MYSQL_PORT || '3306'),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'pve_panel',
    waitForConnections: true,
    connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10'),
    queueLimit: parseInt(process.env.MYSQL_QUEUE_LIMIT || '0'),
    acquireTimeout: parseInt(process.env.MYSQL_ACQUIRE_TIMEOUT_MS || '60000'),
});

// 辅助函数：获取连接
async function getConnection() {
    return await pool.getConnection();
}

// 辅助函数：执行查询返回单行
async function queryOne(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
}

// 辅助函数：执行查询返回多行
async function queryAll(sql, params = []) {
    const [rows] = await pool.execute(sql, params);
    return rows;
}

// 辅助函数：执行写入返回 result
async function execute(sql, params = []) {
    return await pool.execute(sql, params);
}

// 数据库初始化函数（异步）
async function initDb() {
    // 创建用户表
    await execute(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(255) UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            avatar TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            email VARCHAR(255) DEFAULT '',
            emailVerified INT DEFAULT 0,
            totp_secret TEXT DEFAULT '',
            totp_enabled INT DEFAULT 0,
            must_change_password INT DEFAULT 0,
            password_salt TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建虚拟机表
    await execute(`
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
    await execute(`
        CREATE TABLE IF NOT EXISTS vm_reminders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            days INT NOT NULL,
            sent_at DATETIME NOT NULL
        )
    `);

    // 创建备忘录表
    await execute(`
        CREATE TABLE IF NOT EXISTS memos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(500) DEFAULT '',
            content TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 创建密码重置令牌表
    await execute(`
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
    await execute(`
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
    await execute(`
        CREATE TABLE IF NOT EXISTS config (
            \`key\` VARCHAR(255) PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    // 创建站内消息表
    await execute(`
        CREATE TABLE IF NOT EXISTS messages (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uid INT NOT NULL,
            title VARCHAR(500) NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
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
        )
    `);

    // 创建刷新令牌表
    await execute(`
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
    await execute(`
        CREATE TABLE IF NOT EXISTS snapshot_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            vm_id INT NOT NULL,
            action VARCHAR(50) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建恢复码表
    await execute(`
        CREATE TABLE IF NOT EXISTS recovery_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            code VARCHAR(50) NOT NULL,
            used INT DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建备份表
    await execute(`
        CREATE TABLE IF NOT EXISTS backups (
            id INT AUTO_INCREMENT PRIMARY KEY,
            vm_id INT NOT NULL,
            user_id INT NOT NULL,
            storage VARCHAR(100) NOT NULL,
            filename VARCHAR(500) DEFAULT '',
            size INT DEFAULT 0,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            pve_upid VARCHAR(200) DEFAULT '',
            progress INT DEFAULT 0,
            notes TEXT DEFAULT '',
            type VARCHAR(10) DEFAULT 'vm',
            ct_id INT,
            rootfs_storage VARCHAR(100) DEFAULT '',
            created_at DATETIME NOT NULL DEFAULT NOW(),
            completed_at DATETIME,
            error_msg TEXT DEFAULT '',
            INDEX idx_backups_vm_id (vm_id),
            INDEX idx_backups_status (status)
        )
    `);

    // 创建备份操作日志表
    await execute(`
        CREATE TABLE IF NOT EXISTS backup_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            vm_id INT NOT NULL,
            action VARCHAR(50) NOT NULL,
            created_at DATETIME NOT NULL DEFAULT NOW()
        )
    `);

    // 创建恢复任务表
    await execute(`
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
            error_msg TEXT DEFAULT '',
            INDEX idx_restore_tasks_vm_id (vm_id),
            INDEX idx_restore_tasks_status (status)
        )
    `);

    // 创建 LXC 容器表
    await execute(`
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
    await execute(`
        CREATE TABLE IF NOT EXISTS lxc_reminders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            ct_id INT NOT NULL,
            days INT NOT NULL,
            sent_at DATETIME NOT NULL
        )
    `);

    // 创建端口转发表
    await execute(`
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
    await initDefaultConfig();

    // 检查并创建默认管理员用户
    await createDefaultAdmin();

    // 数据库迁移：添加新字段（兼容已有数据库）
    await migrateSchema();
}

// 数据库 schema 迁移
async function migrateSchema() {
    async function safeAlter(table, column, definition) {
        try {
            await execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
        } catch (e) {
            if (!e.message.toLowerCase().includes('duplicate')) {
                console.error(`迁移 ${table}.${column} 字段失败:`, e.message);
            }
        }
    }

    await safeAlter('vms', 'renewal_price', "TEXT DEFAULT ''");
    await safeAlter('cdk_codes', 'target_user_id', 'INT');
    await safeAlter('users', 'totp_secret', "TEXT DEFAULT ''");
    await safeAlter('users', 'totp_enabled', 'INT DEFAULT 0');
    await safeAlter('vms', 'backup_storage', "TEXT DEFAULT ''");
    await safeAlter('backups', "type", "VARCHAR(10) DEFAULT 'vm'");
    await safeAlter('backups', 'ct_id', 'INT');
    await safeAlter('cdk_codes', 'used_ct_id', 'INT');
    await safeAlter('backups', 'rootfs_storage', "TEXT DEFAULT ''");
    await safeAlter('vms', 'dhcp_static_ip', "TEXT DEFAULT ''");
    await safeAlter('lxc_containers', 'dhcp_static_ip', "TEXT DEFAULT ''");

    // 修复已有 LXC 备份记录的 ct_id 和 type
    try {
        const orphaned = await queryAll("SELECT id, pve_upid FROM backups WHERE vm_id = 0 AND ct_id IS NULL AND type = 'vm'");
        for (const row of orphaned) {
            if (row.pve_upid) {
                const parts = row.pve_upid.split(':');
                if (parts.length >= 7 && parts[5] === 'vzdump') {
                    const ctId = parseInt(parts[6]);
                    if (!isNaN(ctId)) {
                        await execute("UPDATE backups SET ct_id = ?, type = 'lxc' WHERE id = ?", [ctId, row.id]);
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
async function initDefaultConfig() {
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
        await execute(
            'INSERT IGNORE INTO config (`key`, value) VALUES (?, ?)',
            [key, value]
        );
    }
}

// 创建默认管理员账户
async function createDefaultAdmin() {
    const adminExists = await queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || generateRandomPassword(16);
        const adminSalt = crypto.randomBytes(16).toString('hex');
        const hashedPassword = CryptoJS.SHA256(adminSalt + defaultAdminPassword).toString();

        await execute(
            `INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, must_change_password, password_salt, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ['admin', hashedPassword, 'admin', '', '', '', 0, 1, adminSalt, new Date().toISOString()]
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
        await execute("ALTER TABLE users ADD COLUMN must_change_password INT DEFAULT 0");
    } catch (e) {
        // 字段已存在，忽略错误
    }

    // 兼容旧数据库：添加 password_salt 字段（如果不存在）
    try {
        await execute("ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''");
    } catch (e) {
        // 字段已存在，忽略错误
    }
}

// 导出数据库操作函数
module.exports = {
    // 数据库连接池
    db: pool,

    // 用户操作
    users: {
        getAll: async () => await queryAll('SELECT * FROM users'),
        getById: async (id) => await queryOne('SELECT * FROM users WHERE id = ?', [id]),
        getByUsername: async (username) => await queryOne('SELECT * FROM users WHERE username = ?', [username]),
        create: async (user) => {
            const [result] = await execute(
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
                    user.created_at || new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
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

            await execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
            return await queryOne('SELECT * FROM users WHERE id = ?', [id]);
        },
        delete: async (id) => await execute('DELETE FROM users WHERE id = ?', [id]),
    },

    // 虚拟机操作
    vms: {
        getAll: async () => await queryAll('SELECT * FROM vms'),
        getByUserId: async (userId) => await queryAll('SELECT * FROM vms WHERE user_id = ?', [userId]),
        getById: async (id) => await queryOne('SELECT * FROM vms WHERE id = ?', [id]),
        create: async (vm) => {
            const [result] = await execute(
                `INSERT INTO vms (vm_id, user_id, name, expiration_date, renewal_price, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    vm.vm_id,
                    vm.user_id,
                    vm.name || '',
                    vm.expiration_date || null,
                    vm.renewal_price || '',
                    new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM vms WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
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

            await execute(`UPDATE vms SET ${fields.join(', ')} WHERE id = ?`, values);
            return await queryOne('SELECT * FROM vms WHERE id = ?', [id]);
        },
        delete: async (id) => {
            await execute('UPDATE cdk_codes SET used_vm_id = NULL WHERE used_vm_id = ?', [id]);
            return await execute('DELETE FROM vms WHERE id = ?', [id]);
        },
        // 虚拟机提醒记录操作
        reminders: {
            getByVmId: async (vmId) => await queryAll('SELECT * FROM vm_reminders WHERE vm_id = ?', [vmId]),
            add: async (vmId, days) => {
                await execute(
                    'INSERT INTO vm_reminders (vm_id, days, sent_at) VALUES (?, ?, ?)',
                    [vmId, days, new Date().toISOString()]
                );
            },
            clear: async (vmId) => await execute('DELETE FROM vm_reminders WHERE vm_id = ?', [vmId]),
            countExpiredDays: async (vmId) => {
                const result = await queryOne(
                    `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM vm_reminders
                     WHERE vm_id = ? AND days = 0`,
                    [vmId]
                );
                return result?.count || 0;
            },
            getTodayExpired: async () => {
                const today = new Date().toISOString().split('T')[0];
                return await queryAll(
                    "SELECT vm_id FROM vm_reminders WHERE days = 0 AND sent_at LIKE ?",
                    [today + '%']
                );
            },
            getTodayAll: async () => {
                const today = new Date().toISOString().split('T')[0];
                return await queryAll(
                    'SELECT * FROM vm_reminders WHERE sent_at LIKE ?',
                    [today + '%']
                );
            }
        }
    },

    // CDK 兑换码操作
    cdk: {
        getAll: async () => await queryAll(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            ORDER BY c.created_at DESC
        `),
        getById: async (id) => await queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]),
        getByCode: async (code) => await queryOne('SELECT * FROM cdk_codes WHERE code = ?', [code]),
        getByBatchId: async (batchId) => await queryAll(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            WHERE c.batch_id = ? ORDER BY c.created_at
        `, [batchId]),
        getUnused: async () => await queryAll('SELECT * FROM cdk_codes WHERE is_used = 0'),
        getUsed: async () => await queryAll('SELECT * FROM cdk_codes WHERE is_used = 1'),
        create: async (cdk) => {
            const [result] = await execute(
                `INSERT INTO cdk_codes (code, duration_days, created_by, target_user_id, created_at, expires_at, batch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    cdk.code,
                    cdk.duration_days,
                    cdk.created_by,
                    cdk.target_user_id || null,
                    cdk.created_at || new Date().toISOString(),
                    cdk.expires_at || null,
                    cdk.batch_id || null
                ]
            );
            return await queryOne('SELECT * FROM cdk_codes WHERE id = ?', [result.insertId]);
        },
        markAsUsed: async (id, userId, vmId, ctId) => {
            if (ctId) {
                await execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_ct_id = ?, used_at = ?
                     WHERE id = ?`,
                    [userId, vmId, ctId, new Date().toISOString(), id]
                );
            } else {
                await execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_at = ?
                     WHERE id = ?`,
                    [userId, vmId, new Date().toISOString(), id]
                );
            }
            return await queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]);
        },
        delete: async (id) => await execute('DELETE FROM cdk_codes WHERE id = ?', [id]),
        deleteBatch: async (ids) => {
            if (!ids || ids.length === 0) return;
            const placeholders = ids.map(() => '?').join(',');
            await execute(`DELETE FROM cdk_codes WHERE id IN (${placeholders})`, ids);
        },
        deleteExpired: async () => {
            return await execute(
                `DELETE FROM cdk_codes
                 WHERE is_used = 0 AND expires_at IS NOT NULL AND expires_at <= NOW()`
            );
        },
        deleteExpiredOrUsed: async () => {
            return await execute(
                `DELETE FROM cdk_codes
                 WHERE is_used = 1 OR (expires_at IS NOT NULL AND expires_at <= NOW())`
            );
        },
        getActiveCount: async () => {
            return await queryOne(
                `SELECT COUNT(*) as count FROM cdk_codes
                 WHERE is_used = 0 AND (expires_at IS NULL OR expires_at > NOW())`
            );
        }
    },

    // 备忘录操作
    memos: {
        getByUserId: async (userId) => await queryAll('SELECT * FROM memos WHERE user_id = ?', [userId]),
        getById: async (id) => await queryOne('SELECT * FROM memos WHERE id = ?', [id]),
        create: async (memo) => {
            const [result] = await execute(
                `INSERT INTO memos (user_id, title, content, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    memo.user_id,
                    memo.title || '',
                    memo.content || '',
                    new Date().toISOString(),
                    new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM memos WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
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
            values.push(new Date().toISOString());
            values.push(id);

            await execute(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`, values);
            return await queryOne('SELECT * FROM memos WHERE id = ?', [id]);
        },
        delete: async (id) => await execute('DELETE FROM memos WHERE id = ?', [id])
    },

    // 密码重置令牌操作
    passwordResetTokens: {
        getAll: async () => await queryAll('SELECT * FROM password_reset_tokens'),
        getByToken: async (token) => await queryOne('SELECT * FROM password_reset_tokens WHERE token = ?', [token]),
        create: async (tokenData) => {
            const [result] = await execute(
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
            return await queryOne('SELECT * FROM password_reset_tokens WHERE id = ?', [result.insertId]);
        },
        delete: async (id) => await execute('DELETE FROM password_reset_tokens WHERE id = ?', [id]),
        deleteByUserId: async (userId) => await execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]),
        deleteByType: async (userId, type) => await execute(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND type = ?',
            [userId, type]
        )
    },

    // 站内消息操作
    messages: {
        create: async (data) => {
            const [result] = await execute(
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
                    new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM messages WHERE id = ?', [result.insertId]);
        },
        getByUser: async (uid, type, page = 1, pageSize = 20) => {
            const offset = (page - 1) * pageSize;
            let where = '(uid = ? OR uid = 0)';
            const params = [uid];
            if (type && type !== 'all') {
                where += ' AND type = ?';
                params.push(parseInt(type));
            }
            const totalResult = await queryOne(`SELECT COUNT(*) as count FROM messages WHERE ${where}`, params);
            const list = await queryAll(
                `SELECT * FROM messages WHERE ${where}
                 ORDER BY is_read ASC, created_at DESC LIMIT ? OFFSET ?`,
                [...params, pageSize, offset]
            );
            return { list, total: totalResult.count, page, pageSize };
        },
        getById: async (id) => await queryOne('SELECT * FROM messages WHERE id = ?', [id]),
        getUnreadCount: async (uid) => {
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM messages
                 WHERE (uid = ? OR uid = 0) AND is_read = 0`,
                [uid]
            );
            return result?.count || 0;
        },
        markRead: async (id) => await execute('UPDATE messages SET is_read = 1 WHERE id = ?', [id]),
        markAllRead: async (uid) => await execute(
            "UPDATE messages SET is_read = 1 WHERE (uid = ? OR uid = 0) AND is_read = 0",
            [uid]
        ),
        delete: async (id, uid) => await execute(
            'DELETE FROM messages WHERE id = ? AND (uid = ? OR uid = 0)',
            [id, uid]
        ),
        deleteAll: async (uid) => await execute(
            "DELETE FROM messages WHERE (uid = ? OR uid = 0) AND is_read = 1",
            [uid]
        ),
        getStats: async () => {
            const total = await queryOne('SELECT COUNT(*) as count FROM messages');
            const unread = await queryOne("SELECT COUNT(*) as count FROM messages WHERE is_read = 0");
            const byType = await queryAll('SELECT type, COUNT(*) as count FROM messages GROUP BY type');
            return { total: total.count, unread: unread.count, byType };
        }
    },

    // 配置操作
    config: {
        getSmtp: async () => ({
            host: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:host']))?.value || '',
            port: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:port']))?.value || '587'),
            secure: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:secure']))?.value === '1',
            user: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:user']))?.value || '',
            password: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '',
            from: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:from']))?.value || '',
            enabled: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:enabled']))?.value === '1'
        }),
        setSmtp: async (smtpConfig) => {
            const currentPassword = (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '';
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:host', smtpConfig.host ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:port', String(smtpConfig.port ?? 587)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:secure', smtpConfig.secure ? '1' : '0']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:user', smtpConfig.user ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:password', smtpConfig.password !== undefined ? smtpConfig.password : currentPassword]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:from', smtpConfig.from ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:enabled', smtpConfig.enabled ? '1' : '0']);
        },
        getReminder: async () => ({
            days1: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days1']))?.value) || 7,
            days2: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days2']))?.value) || 3,
            days3: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['reminder:days3']))?.value) || 1
        }),
        setReminder: async (reminderConfig) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days1', String(reminderConfig.days1 ?? 7)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days2', String(reminderConfig.days2 ?? 3)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days3', String(reminderConfig.days3 ?? 1)]);
        },
        get: async (key) => (await queryOne('SELECT value FROM config WHERE `key` = ?', [key]))?.value,
        set: async (key, value) => await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', [key, value])
    },

    // 刷新令牌操作
    refreshTokens: {
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO refresh_tokens (user_id, token, device_name, ip, user_agent, created_at, expires_at, revoked)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
                [
                    data.user_id,
                    data.token,
                    data.device_name || '',
                    data.ip || '',
                    data.user_agent || '',
                    data.created_at || new Date().toISOString(),
                    data.expires_at
                ]
            );
            return await queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [result.insertId]);
        },
        getByToken: async (token) => await queryOne('SELECT * FROM refresh_tokens WHERE token = ?', [token]),
        getById: async (id) => await queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [id]),
        getByUserId: async (userId) => await queryAll(
            `SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > NOW()
             ORDER BY created_at DESC`,
            [userId]
        ),
        revoke: async (id) => await execute('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', [id]),
        deleteByToken: async (token) => await execute('DELETE FROM refresh_tokens WHERE token = ?', [token]),
        revokeByUserId: async (userId, excludeId) => {
            if (excludeId) {
                await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND id != ?', [userId, excludeId]);
            } else {
                await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
            }
        },
        cleanup: async () => await execute("DELETE FROM refresh_tokens WHERE expires_at <= NOW() OR revoked = 1")
    },

    // 快照配置操作
    snapshotConfig: {
        get: async () => ({
            max_per_vm: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:max_per_vm']))?.value) || 5,
            daily_create_limit: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:daily_create_limit']))?.value) || 20,
            daily_restore_limit: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['snapshot:daily_restore_limit']))?.value) || 10
        }),
        set: async (cfg) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:max_per_vm', String(cfg.max_per_vm ?? 5)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_create_limit', String(cfg.daily_create_limit ?? 20)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_restore_limit', String(cfg.daily_restore_limit ?? 10)]);
        }
    },

    // 快照日志操作
    snapshotLogs: {
        add: async (userId, vmId, action) => {
            await execute(
                'INSERT INTO snapshot_logs (user_id, vm_id, action, created_at) VALUES (?, ?, ?, ?)',
                [userId, vmId, action, new Date().toISOString()]
            );
        },
        getDailyCount: async (userId, action) => {
            const today = new Date().toISOString().split('T')[0];
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM snapshot_logs
                 WHERE user_id = ? AND action = ? AND created_at >= ?`,
                [userId, action, today]
            );
            return result?.count || 0;
        }
    },

    // 2FA 操作
    twofa: {
        getSecret: async (userId) => (await queryOne('SELECT totp_secret FROM users WHERE id = ?', [userId]))?.totp_secret || '',
        setSecret: async (userId, secret) => await execute('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]),
        isEnabled: async (userId) => {
            const row = await queryOne('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
            return row ? row.totp_enabled === 1 : false;
        },
        enable: async (userId) => await execute('UPDATE users SET totp_enabled = 1 WHERE id = ?', [userId]),
        disable: async (userId) => await execute("UPDATE users SET totp_enabled = 0, totp_secret = '' WHERE id = ?", [userId]),
        // 恢复码
        getRecoveryCodes: async (userId) => await queryAll(
            'SELECT id, code, used, created_at FROM recovery_codes WHERE user_id = ? ORDER BY id',
            [userId]
        ),
        getUnusedRecoveryCodes: async (userId) => await queryAll(
            'SELECT code FROM recovery_codes WHERE user_id = ? AND used = 0',
            [userId]
        ),
        addRecoveryCodes: async function(userId, codes) {
            const conn = await getConnection();
            try {
                await conn.beginTransaction();
                const stmt = 'INSERT INTO recovery_codes (user_id, code) VALUES (?, ?)';
                for (const code of codes) {
                    await conn.execute(stmt, [userId, code]);
                }
                await conn.commit();
            } catch (e) {
                await conn.rollback();
                throw e;
            } finally {
                conn.release();
            }
        },
        markRecoveryCodeUsed: async (code) => await execute(
            'UPDATE recovery_codes SET used = 1 WHERE code = ? AND used = 0',
            [code]
        ),
        deleteRecoveryCodes: async (userId) => await execute(
            'DELETE FROM recovery_codes WHERE user_id = ?',
            [userId]
        ),
        getUnusedRecoveryCodeCount: async (userId) => {
            const result = await queryOne(
                'SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used = 0',
                [userId]
            );
            return result?.count || 0;
        }
    },

    // 备份配置操作
    backupConfig: {
        get: async () => ({
            default_storage: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:default_storage']))?.value || 'local',
            max_per_vm: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:max_per_vm']))?.value) || 3,
            daily_limit: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['backup:daily_limit']))?.value) || 3
        }),
        set: async (cfg) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:default_storage', cfg.default_storage ?? 'local']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:max_per_vm', String(cfg.max_per_vm ?? 3)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['backup:daily_limit', String(cfg.daily_limit ?? 3)]);
        }
    },

    // 备份操作
    backups: {
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO backups (vm_id, ct_id, user_id, storage, notes, type, rootfs_storage, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
                [data.vm_id, data.ct_id || null, data.user_id, data.storage, data.notes || '', data.type || 'vm', data.rootfs_storage || '']
            );
            return { id: result.insertId };
        },
        getById: async (id) => await queryOne('SELECT * FROM backups WHERE id = ?', [id]),
        getByVmId: async (vmId) => await queryAll(
            'SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at DESC',
            [vmId]
        ),
        getByStatus: async (status) => await queryAll('SELECT * FROM backups WHERE status = ?', [status]),
        getByUserAndDate: async (userId, date) => {
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE user_id = ? AND created_at >= ?`,
                [userId, date]
            );
            return result?.count || 0;
        },
        getCountByVmId: async (vmId, userId) => {
            if (userId) {
                const result = await queryOne(
                    `SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND user_id = ? AND status != 'failed'`,
                    [vmId, userId]
                );
                return result?.count || 0;
            }
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND status != 'failed'`,
                [vmId]
            );
            return result?.count || 0;
        },
        updateProgress: async (id, progress, pveUpid) => await execute(
            "UPDATE backups SET progress = ?, pve_upid = ?, status = 'running' WHERE id = ?",
            [progress, pveUpid, id]
        ),
        complete: async (id, filename, size) => await execute(
            "UPDATE backups SET status = 'completed', progress = 100, filename = ?, size = ?, completed_at = NOW() WHERE id = ?",
            [filename, size || 0, id]
        ),
        fail: async (id, errorMsg) => await execute(
            "UPDATE backups SET status = 'failed', error_msg = ?, completed_at = NOW() WHERE id = ?",
            [errorMsg, id]
        ),
        delete: async (id) => await execute('DELETE FROM backups WHERE id = ?', [id]),
        deleteBatch: async (ids) => {
            const placeholders = ids.map(() => '?').join(',');
            await execute(`DELETE FROM backups WHERE id IN (${placeholders})`, ids);
        },
        getRunningBackups: async () => await queryAll(
            "SELECT * FROM backups WHERE status = 'running' OR status = 'pending'"
        ),
        getByCtId: async (ctId) => await queryAll(
            "SELECT * FROM backups WHERE ct_id = ? AND type = 'lxc' ORDER BY created_at DESC",
            [ctId]
        ),
        getCountByCtId: async (ctId, userId) => {
            if (userId) {
                const result = await queryOne(
                    `SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND user_id = ? AND type = 'lxc' AND status != 'failed'`,
                    [ctId, userId]
                );
                return result?.count || 0;
            }
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND type = 'lxc' AND status != 'failed'`,
                [ctId]
            );
            return result?.count || 0;
        }
    },

    // 备份日志操作
    backupLogs: {
        add: async (userId, vmId, action) => await execute(
            'INSERT INTO backup_logs (user_id, vm_id, action) VALUES (?, ?, ?)',
            [userId, vmId, action]
        ),
        getDailyCount: async (userId) => {
            const today = new Date().toISOString().split('T')[0];
            const result = await queryOne(
                `SELECT COUNT(*) as count FROM backup_logs WHERE user_id = ? AND action = 'create' AND created_at >= ?`,
                [userId, today]
            );
            return result?.count || 0;
        }
    },

    // 恢复任务操作
    restoreTasks: {
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO restore_tasks (vm_id, user_id, backup_id, pve_upid, status)
                 VALUES (?, ?, ?, ?, 'pending')`,
                [data.vm_id, data.user_id, data.backup_id, data.pve_upid || '']
            );
            return { id: result.insertId };
        },
        getById: async (id) => await queryOne('SELECT * FROM restore_tasks WHERE id = ?', [id]),
        getByVmId: async (vmId) => await queryAll(
            'SELECT * FROM restore_tasks WHERE vm_id = ? ORDER BY created_at DESC',
            [vmId]
        ),
        getRunning: async () => await queryAll(
            "SELECT * FROM restore_tasks WHERE status = 'running' OR status = 'pending'"
        ),
        getRunningByVmId: async (vmId) => await queryAll(
            "SELECT * FROM restore_tasks WHERE vm_id = ? AND (status = 'running' OR status = 'pending')",
            [vmId]
        ),
        updateProgress: async (id, progress, pveUpid) => await execute(
            "UPDATE restore_tasks SET progress = ?, pve_upid = ?, status = 'running' WHERE id = ?",
            [progress, pveUpid, id]
        ),
        complete: async (id) => await execute(
            "UPDATE restore_tasks SET status = 'completed', progress = 100, completed_at = NOW() WHERE id = ?",
            [id]
        ),
        fail: async (id, errorMsg) => await execute(
            "UPDATE restore_tasks SET status = 'failed', error_msg = ?, completed_at = NOW() WHERE id = ?",
            [errorMsg, id]
        ),
        deleteByBackupId: async (backupId) => await execute(
            'DELETE FROM restore_tasks WHERE backup_id = ?',
            [backupId]
        ),
    },

    // LXC 配置操作
    lxcConfig: {
        get: async () => ({
            max_per_vm: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:max_per_vm']))?.value) || 3,
            default_storage: (await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_storage']))?.value || 'local',
            default_memory: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_memory']))?.value) || 512,
            default_cores: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_cores']))?.value) || 1,
            default_disk: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_disk']))?.value) || 8,
            default_swap: parseInt((await queryOne('SELECT value FROM config WHERE `key` = ?', ['lxc:default_swap']))?.value) || 512
        }),
        set: async (cfg) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:max_per_vm', String(cfg.max_per_vm ?? 3)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_storage', cfg.default_storage ?? 'local']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_memory', String(cfg.default_memory ?? 512)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_cores', String(cfg.default_cores ?? 1)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_disk', String(cfg.default_disk ?? 8)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['lxc:default_swap', String(cfg.default_swap ?? 512)]);
        }
    },

    // LXC 容器操作
    lxcContainers: {
        getAll: async () => await queryAll('SELECT * FROM lxc_containers'),
        getByUserId: async (userId) => await queryAll('SELECT * FROM lxc_containers WHERE user_id = ?', [userId]),
        getById: async (id) => await queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]),
        getByCtId: async (ctId) => await queryAll('SELECT * FROM lxc_containers WHERE ct_id = ?', [ctId]),
        create: async (ct) => {
            const [result] = await execute(
                `INSERT INTO lxc_containers (ct_id, user_id, name, expiration_date, renewal_price, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    ct.ct_id,
                    ct.user_id,
                    ct.name || '',
                    ct.expiration_date || null,
                    ct.renewal_price || '',
                    new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM lxc_containers WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
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

            await execute(`UPDATE lxc_containers SET ${fields.join(', ')} WHERE id = ?`, values);
            return await queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]);
        },
        delete: async (id) => {
            await execute('UPDATE cdk_codes SET used_ct_id = NULL WHERE used_ct_id = ?', [id]);
            return await execute('DELETE FROM lxc_containers WHERE id = ?', [id]);
        },
        // LXC 容器提醒记录操作
        reminders: {
            getByCtId: async (ctId) => await queryAll('SELECT * FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            add: async (ctId, days) => {
                await execute(
                    'INSERT INTO lxc_reminders (ct_id, days, sent_at) VALUES (?, ?, ?)',
                    [ctId, days, new Date().toISOString()]
                );
            },
            clear: async (ctId) => await execute('DELETE FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            countExpiredDays: async (ctId) => {
                const result = await queryOne(
                    `SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM lxc_reminders
                     WHERE ct_id = ? AND days = 0`,
                    [ctId]
                );
                return result?.count || 0;
            },
            getTodayExpired: async () => {
                const today = new Date().toISOString().split('T')[0];
                return await queryAll(
                    "SELECT ct_id FROM lxc_reminders WHERE days = 0 AND sent_at LIKE ?",
                    [today + '%']
                );
            },
            getTodayAll: async () => {
                const today = new Date().toISOString().split('T')[0];
                return await queryAll(
                    'SELECT * FROM lxc_reminders WHERE sent_at LIKE ?',
                    [today + '%']
                );
            }
        }
    },

    // 端口转发操作
    portForwards: {
        getAll: async () => await queryAll('SELECT * FROM port_forwards ORDER BY created_at DESC'),
        getByType: async (type) => await queryAll(
            'SELECT * FROM port_forwards WHERE type = ? ORDER BY created_at DESC',
            [type]
        ),
        getById: async (id) => await queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]),
        getByUserId: async (userId) => {
            const userVms = await queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
            const userCts = await queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let rules = [];
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                rules = rules.concat(await queryAll(
                    `SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                    vmIds
                ));
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                rules = rules.concat(await queryAll(
                    `SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                    ctIds
                ));
            }
            return rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        getByVmId: async (vmId) => await queryAll(
            "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
            [vmId]
        ),
        getByCtId: async (ctId) => await queryAll(
            "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
            [ctId]
        ),
        getByDeviceId: async (type, deviceId) => {
            if (type === 'vm') return await queryAll(
                "SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC",
                [deviceId]
            );
            return await queryAll(
                "SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC",
                [deviceId]
            );
        },
        getCountByUserId: async (userId) => {
            const userVms = await queryAll('SELECT vm_id FROM vms WHERE user_id = ?', [userId]);
            const userCts = await queryAll('SELECT ct_id FROM lxc_containers WHERE user_id = ?', [userId]);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let count = 0;
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                const r = await queryOne(
                    `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`,
                    vmIds
                );
                count += r?.c || 0;
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                const r = await queryOne(
                    `SELECT COUNT(*) as c FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`,
                    ctIds
                );
                count += r?.c || 0;
            }
            return count;
        },
        create: async (data) => {
            const [result] = await execute(
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
                    new Date().toISOString(),
                    new Date().toISOString()
                ]
            );
            return await queryOne('SELECT * FROM port_forwards WHERE id = ?', [result.insertId]);
        },
        update: async (id, data) => {
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
            values.push(new Date().toISOString(), id);
            await execute(`UPDATE port_forwards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, values);
            return await queryOne('SELECT * FROM port_forwards WHERE id = ?', [id]);
        },
        delete: async (id) => await execute('DELETE FROM port_forwards WHERE id = ?', [id]),
        deleteByDevice: async (type, deviceId) => {
            if (type === 'vm') return await execute(
                "DELETE FROM port_forwards WHERE type = 'vm' AND vm_id = ?",
                [deviceId]
            );
            return await execute(
                "DELETE FROM port_forwards WHERE type = 'lxc' AND ct_id = ?",
                [deviceId]
            );
        },
        getUsedPorts: async () => {
            return await queryAll(
                'SELECT external_port, type, vm_id, ct_id, ip, internal_port, protocol FROM port_forwards'
            );
        },
        getByExternalPort: async (port) => await queryAll(
            'SELECT * FROM port_forwards WHERE external_port = ?',
            [port]
        ),
    },

    // 初始化入口（供外部调用）
    initDb,
};
