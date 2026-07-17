const mysql = require('mysql2/promise');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');

/**
 * 生成指定长度的随机强密码（使用 crypto.randomBytes，兼容 Node.js）
 * @param {number} length - 密码长度，默认 16
 * @returns {string} 随机密码字符串
 */
function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    const bytes = crypto.randomBytes(length);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

// MySQL 5.7 兼容的日期格式: YYYY-MM-DD HH:MM:SS（本地时间）
function mysqlNow() {
    var d = new Date();
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 19).replace('T', ' ');
}
function mysqlToday() {
    return mysqlNow().slice(0, 10);
}
// 连接池单例
let pool = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.MYSQL_HOST || 'localhost',
            port: parseInt(process.env.MYSQL_PORT || '3306'),
            user: process.env.MYSQL_USER || 'root',
            password: process.env.MYSQL_PASSWORD || '',
            database: process.env.MYSQL_DATABASE || 'pve_panel',
            charset: 'utf8mb4',
            connectionLimit: parseInt(process.env.MYSQL_CONNECTION_LIMIT || '10'),
            queueLimit: parseInt(process.env.MYSQL_QUEUE_LIMIT || '0'),
            waitForConnections: true,
            connectTimeout: parseInt(process.env.MYSQL_ACQUIRE_TIMEOUT_MS || '10000'),
            dateStrings: true,
            timezone: '+08:00',
        });
    }
    return pool;
}

// 将 ISO 8601 日期字符串转换为 MySQL DATETIME 格式（调用方可能传入 toISOString() 的值）
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
function sanitizeParams(params) {
    if (!Array.isArray(params)) return params;
    return params.map(p => (typeof p === 'string' && ISO_DATE_RE.test(p))
        ? p.slice(0, 19).replace('T', ' ') : p);
}

// 核心 async 查询函数
async function execute(sql, params = []) {
    return getPool().execute(sql, sanitizeParams(params));
}
async function queryOne(sql, params = []) {
    const [rows] = await getPool().query(sql, sanitizeParams(params));
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}
async function queryAll(sql, params = []) {
    const [rows] = await getPool().query(sql, sanitizeParams(params));
    return Array.isArray(rows) ? rows : [];
}

// 数据库初始化函数（异步）
async function initDb() {
    // 创建用户表（包含 is_active 列 — M-1 修复）
    await execute(`
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
            is_active INT DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    try { await execute("ALTER TABLE users ADD COLUMN balance DECIMAL(10,2) DEFAULT 0.00"); } catch (_) {}

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

    try { await execute('ALTER TABLE vms ADD COLUMN renewal_period VARCHAR(20) DEFAULT \'month\''); } catch (_) {}
    try { await execute('ALTER TABLE vms ADD COLUMN monthly_price VARCHAR(50) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE vms ADD COLUMN quarterly_discount VARCHAR(10) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE vms ADD COLUMN yearly_discount VARCHAR(10) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE vms ADD COLUMN pve_upid VARCHAR(200) DEFAULT \'\''); } catch (_) {}
    // 关机原因：null=未关机/正常, 'manual'=用户手动关机, 'expired'=到期自动关机
    try { await execute('ALTER TABLE vms ADD COLUMN shutdown_reason VARCHAR(20) DEFAULT NULL'); } catch (_) {}

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
            content TEXT,
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

    // 创建站内消息表（utf8mb4 支持 emoji 等四字节字符）
    await execute(`
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

    // 创建备份表（size 为 BIGINT）
    await execute(`
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
            error_msg TEXT,
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

    try { await execute('ALTER TABLE lxc_containers ADD COLUMN renewal_period VARCHAR(20) DEFAULT \'month\''); } catch (_) {}
    try { await execute('ALTER TABLE lxc_containers ADD COLUMN monthly_price VARCHAR(50) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE lxc_containers ADD COLUMN quarterly_discount VARCHAR(10) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE lxc_containers ADD COLUMN yearly_discount VARCHAR(10) DEFAULT \'\''); } catch (_) {}
    try { await execute('ALTER TABLE lxc_containers ADD COLUMN pve_upid VARCHAR(200) DEFAULT \'\''); } catch (_) {}
    // 关机原因：null=未关机/正常, 'manual'=用户手动关机, 'expired'=到期自动关机
    try { await execute('ALTER TABLE lxc_containers ADD COLUMN shutdown_reason VARCHAR(20) DEFAULT NULL'); } catch (_) {}

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

    // 创建交易记录表
    await execute(`
        CREATE TABLE IF NOT EXISTS transaction_records (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            order_no VARCHAR(200) NOT NULL UNIQUE,
            pay_time DATETIME,
            pay_method VARCHAR(50) DEFAULT '',
            trade_type VARCHAR(50) NOT NULL DEFAULT 'recharge',
            amount DECIMAL(10,2) DEFAULT 0.00,
            period VARCHAR(20) DEFAULT NULL,
            period_count INT DEFAULT NULL,
            balance_before DECIMAL(10,2) DEFAULT 0.00,
            balance_after DECIMAL(10,2) DEFAULT 0.00,
            resource_type VARCHAR(10) DEFAULT NULL,
            resource_id INT DEFAULT NULL,
            trade_no VARCHAR(200) DEFAULT NULL,
            api_trade_no VARCHAR(200) DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_tr_user_id (user_id),
            INDEX idx_tr_order_no (order_no)
        )
    `);

    // PAY-1/2/3 修复：充值待处理订单表（回调时从本地记录获取 userId/amount，不信任回调参数）
    await execute(`
        CREATE TABLE IF NOT EXISTS pending_orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_no VARCHAR(200) NOT NULL UNIQUE,
            user_id INT NOT NULL,
            amount DECIMAL(10,2) NOT NULL,
            pay_method VARCHAR(50) DEFAULT '',
            status VARCHAR(20) DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            processed_at DATETIME DEFAULT NULL,
            INDEX idx_po_order_no (order_no),
            INDEX idx_po_user_id (user_id)
        )
    `);

    // 创建 orders 表
    await execute(`CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_no VARCHAR(32) UNIQUE NOT NULL,
        user_id INT NOT NULL,
        type VARCHAR(10) NOT NULL DEFAULT 'vm',
        package_id INT NOT NULL,
        template_id INT DEFAULT 0,
        period VARCHAR(20) NOT NULL DEFAULT 'month',
        period_count INT NOT NULL DEFAULT 1,
        amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        cores INT DEFAULT 0,
        memory INT DEFAULT 0,
        disk_size INT DEFAULT 0,
        resource_name VARCHAR(255) DEFAULT '',
        resource_id VARCHAR(50) DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'completed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_orders_user (user_id),
        INDEX idx_orders_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    // vm_templates 表
    await execute(`CREATE TABLE IF NOT EXISTS vm_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        template_vmid INT NOT NULL DEFAULT 0,
        cores INT NOT NULL DEFAULT 1,
        memory INT NOT NULL DEFAULT 1024,
        disk_size INT NOT NULL DEFAULT 20,
        network_bridge VARCHAR(50) NOT NULL DEFAULT 'vmbr0',
        network_model VARCHAR(50) NOT NULL DEFAULT 'virtio',
        os_type VARCHAR(100) NOT NULL DEFAULT '',
        ciuser VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW()
    )`);

    // lxc_templates 表
    await execute(`CREATE TABLE IF NOT EXISTS lxc_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        ostemplate VARCHAR(255) NOT NULL DEFAULT '',
        storage VARCHAR(100) NOT NULL DEFAULT 'local',
        cores INT NOT NULL DEFAULT 1,
        memory INT NOT NULL DEFAULT 512,
        swap INT NOT NULL DEFAULT 512,
        disk_size INT NOT NULL DEFAULT 8,
        network_bridge VARCHAR(50) NOT NULL DEFAULT 'vmbr0',
        network_mode VARCHAR(20) NOT NULL DEFAULT 'dhcp',
        ipv6_enabled TINYINT(1) NOT NULL DEFAULT 1,
        ip6_mode VARCHAR(20) NOT NULL DEFAULT 'dhcp',
        ip6_addr TEXT NOT NULL,
        ip4_addr TEXT NOT NULL,
        unprivileged INT NOT NULL DEFAULT 1,
        features TEXT NOT NULL,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW()
    )`);

    // package_groups 表（套餐分组）
    await execute(`CREATE TABLE IF NOT EXISTS package_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        type VARCHAR(10) NOT NULL DEFAULT 'vm',
        sort_order INT NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW()
    )`);

    // vm_packages 表
    await execute(`CREATE TABLE IF NOT EXISTS vm_packages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        template_id INT NOT NULL DEFAULT 0,
        cores INT NOT NULL DEFAULT 1,
        memory INT NOT NULL DEFAULT 1024,
        disk_size INT NOT NULL DEFAULT 20,
        monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        quarterly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        yearly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        stock INT,
        sold_count INT NOT NULL DEFAULT 0,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW()
    )`);

    // lxc_packages 表
    await execute(`CREATE TABLE IF NOT EXISTS lxc_packages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        template_id INT NOT NULL DEFAULT 0,
        cores INT NOT NULL DEFAULT 1,
        memory INT NOT NULL DEFAULT 512,
        swap INT NOT NULL DEFAULT 512,
        disk_size INT NOT NULL DEFAULT 8,
        monthly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        quarterly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        yearly_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        stock INT,
        sold_count INT NOT NULL DEFAULT 0,
        cpu_model VARCHAR(255) NOT NULL DEFAULT '',
        bandwidth INT NOT NULL DEFAULT 0,
        description TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW()
    )`);

    // 创建存储分组表
    await execute(`
    CREATE TABLE IF NOT EXISTS storage_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        sort_order INT DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // 创建硬盘规格表
    await execute(`
    CREATE TABLE IF NOT EXISTS disk_specs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL DEFAULT '',
        disk_type VARCHAR(20) NOT NULL,
        storage_group_id INT NOT NULL,
        enabled TINYINT(1) DEFAULT 1,
        min_size_gb INT NOT NULL DEFAULT 10,
        max_size_gb INT NOT NULL DEFAULT 2000,
        price_per_gb DECIMAL(10,4) NOT NULL DEFAULT 0.0000,
        quarterly_discount INT DEFAULT 0,
        yearly_discount INT DEFAULT 0,
        mbps_rd INT DEFAULT NULL,
        mbps_rd_max INT DEFAULT NULL,
        mbps_wr INT DEFAULT NULL,
        mbps_wr_max INT DEFAULT NULL,
        iops_rd INT DEFAULT NULL,
        iops_rd_max INT DEFAULT NULL,
        iops_wr INT DEFAULT NULL,
        iops_wr_max INT DEFAULT NULL,
        storage_pool VARCHAR(100) NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_disk_specs_group (storage_group_id)
    )`);

    // 创建磁盘资产台账表
    await execute(`
    CREATE TABLE IF NOT EXISTS disks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        volume_id VARCHAR(255) NOT NULL UNIQUE,
        disk_name VARCHAR(100) DEFAULT '',
        spec_id INT DEFAULT NULL,
        user_id INT NOT NULL,
        storage_group_id INT NOT NULL,
        storage_pool VARCHAR(100) NOT NULL,
        disk_type VARCHAR(20) NOT NULL,
        capacity_gb INT NOT NULL,
        status ENUM('free','bound','grace','expired','destroyed') DEFAULT 'free',
        bind_vmid INT DEFAULT NULL,
        bind_bus VARCHAR(10) DEFAULT NULL,
        bind_dev INT DEFAULT NULL,
        price_per_gb DECIMAL(10,4) NOT NULL,
        quarterly_discount INT DEFAULT 0,
        yearly_discount INT DEFAULT 0,
        auto_renew TINYINT(1) DEFAULT 0,
        create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        expire_time DATETIME DEFAULT NULL,
        mbps_rd INT DEFAULT NULL,
        mbps_rd_max INT DEFAULT NULL,
        mbps_wr INT DEFAULT NULL,
        mbps_wr_max INT DEFAULT NULL,
        iops_rd INT DEFAULT NULL,
        iops_rd_max INT DEFAULT NULL,
        iops_wr INT DEFAULT NULL,
        iops_wr_max INT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_disks_user (user_id),
        INDEX idx_disks_status (status),
        INDEX idx_disks_vmid (bind_vmid)
    )`);

    // 创建磁盘生命周期配置表
    await execute(`
    CREATE TABLE IF NOT EXISTS disk_lifecycle_config (
        id INT PRIMARY KEY DEFAULT 1,
        warn_days INT DEFAULT 7,
        warn_frequency VARCHAR(20) DEFAULT 'daily',
        grace_days INT DEFAULT 3,
        grace_frequency VARCHAR(20) DEFAULT 'twice_daily',
        shutdown_timeout INT DEFAULT 300,
        retention_days INT DEFAULT 15,
        auto_renew_days INT DEFAULT 1,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`);

    // 初始化默认配置
    await initDefaultConfig();

    // 检查并创建默认管理员用户
    await createDefaultAdmin();

    // 数据库迁移：添加新字段（兼容已有数据库）
    await migrateSchema();

    console.log('[数据库] MySQL 初始化完成');
}

// 数据库 schema 迁移（异步）
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

    async function safeAddIndex(tableName, indexName, columns) {
        try {
            await execute('CREATE INDEX ' + indexName + ' ON ' + tableName + '(' + columns + ')');
            console.log('[db] 索引创建成功:', indexName);
        } catch (e) {
            // 索引已存在则忽略
            if (e.code !== 'ER_DUP_KEYNAME' && e.errno !== 1061) {
                console.warn('[db] 创建索引失败:', indexName, e.message);
            }
        }
    }

    await safeAlter('vms', 'renewal_price', "TEXT");
    await safeAlter('cdk_codes', 'target_user_id', 'INT');
    await safeAlter('users', 'totp_secret', "TEXT");
    await safeAlter('users', 'totp_enabled', 'INT DEFAULT 0');
    await safeAlter('vms', 'backup_storage', "TEXT");
    await safeAlter('backups', "type", "VARCHAR(10) DEFAULT 'vm'");
    await safeAlter('backups', 'ct_id', 'INT');
    await safeAlter('cdk_codes', 'used_ct_id', 'INT');
    await safeAlter('backups', 'rootfs_storage', "TEXT");
    await safeAlter('vms', 'dhcp_static_ip', "TEXT");
    await safeAlter('lxc_containers', 'dhcp_static_ip', "TEXT");
    await safeAlter('vms', 'ikuai_mac_group_id', "TEXT");
    await safeAlter('lxc_containers', 'ikuai_mac_group_id', "TEXT");

    await safeAlter('transaction_records', 'trade_no', 'VARCHAR(200) DEFAULT NULL');
    await safeAlter('transaction_records', 'api_trade_no', 'VARCHAR(200) DEFAULT NULL');

    await safeAlter('vm_templates', 'target_storage', "VARCHAR(100) NOT NULL DEFAULT 'local-lvm'");
    await safeAlter('vm_templates', 'clone_mode', "VARCHAR(20) NOT NULL DEFAULT 'full'");
    await safeAlter('vm_templates', 'cpu_affinity', "VARCHAR(255) NOT NULL DEFAULT ''");

    await safeAlter('lxc_templates', 'rootfs_storage', "VARCHAR(100) DEFAULT 'local-lvm'");
    await safeAlter('vm_templates', 'mac_group_id', "TEXT");
    await safeAlter('vm_templates', 'ciuser', "VARCHAR(100) NOT NULL DEFAULT ''");
    await safeAlter('vm_packages', 'stock', 'INT');
    await safeAlter('vm_packages', 'sold_count', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_packages', 'stock', 'INT');
    await safeAlter('lxc_packages', 'sold_count', "INT NOT NULL DEFAULT 0");

    await safeAlter('vm_packages', 'sort_order', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_packages', 'sort_order', "INT NOT NULL DEFAULT 0");
    await safeAlter('vm_packages', 'cpu_model', "VARCHAR(255) NOT NULL DEFAULT ''");
    await safeAlter('vm_packages', 'bandwidth', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_packages', 'cpu_model', "VARCHAR(255) NOT NULL DEFAULT ''");
    await safeAlter('lxc_packages', 'bandwidth', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_templates', 'mac_group_id', "TEXT");
    await safeAlter('vm_packages', 'group_id', "INT DEFAULT NULL");
    await safeAlter('vm_packages', 'quarterly_discount', "INT NOT NULL DEFAULT 0");
    await safeAlter('vm_packages', 'yearly_discount', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_packages', 'group_id', "INT DEFAULT NULL");
    await safeAlter('lxc_packages', 'quarterly_discount', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_packages', 'yearly_discount', "INT NOT NULL DEFAULT 0");
    await safeAlter('lxc_templates', 'ipv6_enabled', "TINYINT(1) NOT NULL DEFAULT 1");
    await safeAlter('lxc_templates', 'ip6_mode', "VARCHAR(20) NOT NULL DEFAULT 'dhcp'");
    await safeAlter('lxc_templates', 'ip6_addr', "TEXT NOT NULL");
    await safeAlter('lxc_templates', 'ip4_addr', "TEXT NOT NULL");

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

    // PERF-01: 补全数据库索引
    await safeAddIndex('vm_reminders', 'idx_vm_reminders_vm_id', 'vm_id, days, sent_at');
    await safeAddIndex('lxc_reminders', 'idx_lxc_reminders_ct_id', 'ct_id, days, sent_at');
    await safeAddIndex('port_forwards', 'idx_port_forwards_type_vm', 'type, vm_id');
    await safeAddIndex('port_forwards', 'idx_port_forwards_type_ct', 'type, ct_id');
    await safeAddIndex('port_forwards', 'idx_port_forwards_ext_port', 'external_port');
    await safeAddIndex('snapshot_logs', 'idx_snapshot_logs_user', 'user_id, action, created_at');
    await safeAddIndex('backup_logs', 'idx_backup_logs_user', 'user_id, action, created_at');
    await safeAddIndex('recovery_codes', 'idx_recovery_codes_user', 'user_id');
    await safeAddIndex('refresh_tokens', 'idx_refresh_tokens_user', 'user_id, revoked, expires_at');
    await safeAddIndex('password_reset_tokens', 'idx_prt_email', 'email, type, expires_at');
    await safeAddIndex('users', 'idx_users_email', 'email');
    await safeAddIndex('vms', 'idx_vms_vm_id', 'vm_id');
    await safeAddIndex('lxc_containers', 'idx_lxc_ct_id', 'ct_id');
    await safeAddIndex('cdk_codes', 'idx_cdk_batch', 'batch_id, is_used, expires_at');
    await safeAddIndex('orders', 'idx_orders_status', 'status, type, user_id');
    await safeAddIndex('pending_orders', 'idx_pending_orders_status', 'status');

    // 注：孤立端口转发规则（vm_id 和 ct_id 均为 NULL）不再自动迁移为 general 类型
    // 如需修改类型，请管理员在端口转发管理界面手动编辑
}

// 初始化默认配置（异步）
async function initDefaultConfig() {
    const defaultConfigs = {
        'smtp:host': '',
        'smtp:port': '587',
        'smtp:secure': '0',
        'smtp:user': '',
        'smtp:password': '',
        'smtp:from': '',
        'smtp:enabled': '0',
        'smtp:strict_tls': '0',
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
        'forward:wan_interface': '["adsl1"]',
        'forward:max_per_user': '10',
        'dhcp:ip_range_start': '10.0.0.110',
        'dhcp:ip_range_end': '10.0.0.199',
        'dhcp:interface': 'lan2',
        'dhcp:gateway': '10.0.0.1',
        'dhcp:dns1': '119.29.29.29',
        'dhcp:dns2': '223.5.5.5',
        'pay:base_url': 'https://pay.microgg.cn/',
        'pay:v1_enabled': '1',
        'pay:v2_enabled': '0',
        'pay:alipay_enabled': '1',
        'pay:wxpay_enabled': '1',
        'pay:min_amount': '0.01',
        'pay:max_amount': '999999.99',
        'register:enabled': '0',
        'site:name': 'PVE 多用户控制面板',
        'site:logo_text': 'PVE 面板',
        'site:login_title': 'PVE Panel',
        'pve:host': '',
        'pve:api_token': '',
        'pve:ssh_host': '',
        'pve:ssh_port': '22',
        'pve:ssh_user': 'root',
        'pve:ssh_password': '',
        'pve:strict_tls': '0',
        'redis:host': '',
        'redis:port': '6379',
        'redis:password': '',
        'redis:db': '0',
        'redis:prefix': 'pve:',
        'disk:temp_vmid': '9999',
    };

    for (const [key, value] of Object.entries(defaultConfigs)) {
        await execute(
            'INSERT IGNORE INTO config (`key`, value) VALUES (?, ?)',
            [key, value]
        );
    }
}

// 创建默认管理员账户（异步，含 is_active 迁移）
async function createDefaultAdmin() {
    const adminExists = await queryOne('SELECT id FROM users WHERE username = ?', ['admin']);
    if (!adminExists) {
        const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || generateRandomPassword(16);
        const { hashPassword } = require('../utils/password-hash');
        const hashedPassword = await hashPassword(defaultAdminPassword);

        await execute(
            `INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, must_change_password, password_salt, is_active, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, ?)`,
            ['admin', hashedPassword, 'admin', '', '', '', 0, 1, mysqlNow()]
        );

        console.log('================================================');
        console.log('  ⚠ 默认管理员账号已创建（此信息仅显示一次）');
        console.log('  用户名: admin');
        console.log('  密码:   ' + defaultAdminPassword);
        console.log('  ⚠ 请立即登录并修改密码！（首登已强制改密）');
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
        await execute("ALTER TABLE users ADD COLUMN password_salt TEXT");
    } catch (e) {
        // 字段已存在，忽略错误
    }

    // M-1 修复：添加 is_active 字段（如果不存在）
    try {
        await execute("ALTER TABLE users ADD COLUMN is_active INT DEFAULT 1");
    } catch (e) {
        // 字段已存在，忽略错误
    }
}

// 导出数据库操作函数（全部 async）
module.exports = {
    // 数据库连接
    db: { connection: getPool },

    // 暴露连接池获取函数（供 with-transaction.js 等工具使用）
    getPool: getPool,

    // 时间工具函数（统一本地时间 YYYY-MM-DD HH:MM:SS）
    now: mysqlNow,
    today: mysqlToday,

    // 用户操作
    users: {
        getAll: () => queryAll('SELECT * FROM users'),
        getPaginated: async (params) => {
            var page = parseInt(params.page) || 1;
            var limit = Math.min(parseInt(params.limit) || 20, 200);
            var offset = (page - 1) * limit;
            var where = [];
            var args = [];
            if (params.keyword) {
                where.push('(username LIKE ? OR email LIKE ?)');
                var kw = '%' + params.keyword + '%';
                args.push(kw, kw);
            }
            if (params.role) { where.push('role = ?'); args.push(params.role); }
            var whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';
            var countArgs = args.slice();
            var totalRow = await queryOne('SELECT COUNT(*) as total FROM users' + whereClause, countArgs);
            args.push(limit, offset);
            var rows = await queryAll('SELECT * FROM users' + whereClause + ' ORDER BY id DESC LIMIT ? OFFSET ?', args);
            return { rows: rows, total: totalRow.total, page: page, limit: limit };
        },
        getById: (id) => queryOne('SELECT * FROM users WHERE id = ?', [id]),
        getByUsername: (username) => queryOne('SELECT * FROM users WHERE username = ?', [username]),
        getByEmail: (email) => queryOne('SELECT * FROM users WHERE email = ?', [email]),
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
                    user.created_at || mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM users WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            // M-2 修复：白名单包含 bio
            const allowedColumns = ['username', 'email', 'password', 'password_salt', 'avatar', 'bio', 'role', 'is_active',
                'must_change_password', 'emailVerified', 'balance'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
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
            return queryOne('SELECT * FROM users WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM users WHERE id = ?', [id]),
        // PAY-6 修复：原子余额增量更新，避免 read-modify-write 竞态
        incrementBalance: async (id, amount) => {
            await execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [amount, id]);
            return queryOne('SELECT * FROM users WHERE id = ?', [id]);
        },
    },

    // 虚拟机操作
    vms: {
        getAll: () => queryAll('SELECT * FROM vms'),
        getByUserId: (userId) => queryAll('SELECT * FROM vms WHERE user_id = ?', [userId]),
        getById: (id) => queryOne('SELECT * FROM vms WHERE id = ?', [id]),
        getByVmid: (vmid) => queryOne('SELECT * FROM vms WHERE vm_id = ?', [parseInt(vmid)]),
        create: async (vm) => {
            const [result] = await execute(
                `INSERT INTO vms (vm_id, user_id, name, expiration_date, renewal_price, renewal_period, monthly_price, quarterly_discount, yearly_discount, pve_upid, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    vm.vm_id,
                    vm.user_id,
                    vm.name || '',
                    vm.expiration_date || null,
                    vm.renewal_price || '',
                    vm.renewal_period || 'month',
                    vm.monthly_price || '',
                    vm.quarterly_discount || '',
                    vm.yearly_discount || '',
                    vm.pve_upid || '',
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM vms WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'vm_id', 'user_id', 'expiration_date',
                'renewal_price', 'renewal_period', 'monthly_price', 'quarterly_discount', 'yearly_discount', 'pve_upid', 'dhcp_static_ip', 'ikuai_mac_group_id', 'backup_storage', 'reminderSent', 'lastReminderDate', 'shutdown_reason'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
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
            return queryOne('SELECT * FROM vms WHERE id = ?', [id]);
        },
        delete: async (id) => {
            await execute('UPDATE cdk_codes SET used_vm_id = NULL WHERE used_vm_id = ?', [id]);
            return execute('DELETE FROM vms WHERE id = ?', [id]);
        },
        // 虚拟机提醒记录操作
        reminders: {
            getByVmId: (vmId) => queryAll('SELECT * FROM vm_reminders WHERE vm_id = ?', [vmId]),
            add: (vmId, days) => {
                return execute(
                    'INSERT INTO vm_reminders (vm_id, days, sent_at) VALUES (?, ?, ?)',
                    [vmId, days, mysqlNow()]
                );
            },
            clear: (vmId) => execute('DELETE FROM vm_reminders WHERE vm_id = ?', [vmId]),
            countExpiredDays: async (vmId) => {
                const result = await queryOne(
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
        create: async (cdk) => {
            const created = cdk.created_at ? String(cdk.created_at).replace('T', ' ').replace('Z', '').slice(0, 19) : mysqlNow();
            const expires = cdk.expires_at ? String(cdk.expires_at).replace('T', ' ').replace('Z', '').slice(0, 19) : null;
            const [result] = await execute(
                `INSERT INTO cdk_codes (code, duration_days, created_by, target_user_id, created_at, expires_at, batch_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    cdk.code,
                    cdk.duration_days,
                    cdk.created_by,
                    cdk.target_user_id || null,
                    created,
                    expires,
                    cdk.batch_id || null
                ]
            );
            return queryOne('SELECT * FROM cdk_codes WHERE id = ?', [result.insertId]);
        },
        markAsUsed: async (id, userId, vmId, ctId) => {
            let result;
            if (ctId) {
                [result] = await execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_ct_id = ?, used_at = ?
                     WHERE id = ? AND is_used = 0`,
                    [userId, vmId, ctId, mysqlNow(), id]
                );
            } else {
                [result] = await execute(
                    `UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_at = ?
                     WHERE id = ? AND is_used = 0`,
                    [userId, vmId, mysqlNow(), id]
                );
            }
            return { affected: result.affectedRows, cdk: await queryOne('SELECT * FROM cdk_codes WHERE id = ?', [id]) };
        },
        delete: (id) => execute('DELETE FROM cdk_codes WHERE id = ?', [id]),
        deleteBatch: (ids) => {
            if (!ids || ids.length === 0) return;
            const placeholders = ids.map(() => '?').join(',');
            return execute(`DELETE FROM cdk_codes WHERE id IN (${placeholders})`, ids);
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
        create: async (memo) => {
            const [result] = await execute(
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
        update: async (id, updates) => {
            const allowedColumns = ['title', 'content', 'user_id'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);

            await execute(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM memos WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM memos WHERE id = ?', [id])
    },

    // 密码重置令牌操作
    passwordResetTokens: {
        getAll: () => queryAll('SELECT * FROM password_reset_tokens'),
        getByToken: (token) => queryOne('SELECT * FROM password_reset_tokens WHERE token = ?', [token]),
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
            return queryOne('SELECT * FROM password_reset_tokens WHERE id = ?', [result.insertId]);
        },
        delete: (id) => execute('DELETE FROM password_reset_tokens WHERE id = ?', [id]),
        deleteByUserId: (userId) => execute('DELETE FROM password_reset_tokens WHERE user_id = ?', [userId]),
        deleteByType: (userId, type) => execute(
            'DELETE FROM password_reset_tokens WHERE user_id = ? AND type = ?',
            [userId, type]
        ),
        deleteByEmailAndType: (email, type) => execute(
            'DELETE FROM password_reset_tokens WHERE email = ? AND type = ?',
            [email, type]
        ),
        getByEmailAndType: (email, type) => queryOne(
            'SELECT * FROM password_reset_tokens WHERE email = ? AND type = ? ORDER BY expires_at DESC LIMIT 1',
            [email, type]
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
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM messages WHERE id = ?', [result.insertId]);
        },
        getByUser: async (uid, type, page = 1, pageSize = 20) => {
            // SQL-2 修复：parseInt + 上限保护
            page = parseInt(page) || 1;
            pageSize = Math.min(parseInt(pageSize) || 20, 200);
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
        getById: (id) => queryOne('SELECT * FROM messages WHERE id = ?', [id]),
        getUnreadCount: async (uid) => {
            const result = await queryOne(
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
        getStats: async () => {
            const total = await queryOne('SELECT COUNT(*) as count FROM messages');
            const unread = await queryOne("SELECT COUNT(*) as count FROM messages WHERE is_read = 0");
            const byType = await queryAll('SELECT type, COUNT(*) as count FROM messages GROUP BY type');
            return { total: total.count, unread: unread.count, byType };
        }
    },

    // 配置操作
    config: {
        getSmtp: async () => {
            const keys = ['smtp:host', 'smtp:port', 'smtp:secure', 'smtp:user', 'smtp:password', 'smtp:from', 'smtp:from_name', 'smtp:enabled'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            return {
                host: map['smtp:host'] || '',
                port: parseInt(map['smtp:port'] || '587'),
                secure: map['smtp:secure'] === '1',
                user: map['smtp:user'] || '',
                password: map['smtp:password'] || '',
                from: map['smtp:from'] || '',
                from_name: map['smtp:from_name'] || '',
                enabled: map['smtp:enabled'] === '1'
            };
        },
        setSmtp: async (smtpConfig) => {
            const currentPassword = (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '';
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:host', smtpConfig.host ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:port', String(smtpConfig.port ?? 587)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:secure', smtpConfig.secure ? '1' : '0']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:user', smtpConfig.user ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:password', smtpConfig.password !== undefined ? smtpConfig.password : currentPassword]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:from', smtpConfig.from ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:from_name', smtpConfig.from_name ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:enabled', smtpConfig.enabled ? '1' : '0']);
        },
        getReminder: async () => {
            const keys = ['reminder:days1', 'reminder:days2', 'reminder:days3'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            return {
                days1: parseInt(map['reminder:days1']) || 7,
                days2: parseInt(map['reminder:days2']) || 3,
                days3: parseInt(map['reminder:days3']) || 1
            };
        },
        setReminder: async (reminderConfig) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days1', String(reminderConfig.days1 ?? 7)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days2', String(reminderConfig.days2 ?? 3)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['reminder:days3', String(reminderConfig.days3 ?? 1)]);
        },
        getPve: async () => {
            const keys = ['pve:host', 'pve:api_token', 'pve:ssh_host', 'pve:ssh_port', 'pve:ssh_user', 'pve:ssh_password', 'pve:strict_tls'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            const { decrypt } = require('../utils/crypto-utils');
            return {
                host: map['pve:host'] || '',
                api_token: decrypt(map['pve:api_token'] || ''),
                ssh_host: map['pve:ssh_host'] || '',
                ssh_port: parseInt(map['pve:ssh_port'] || '22'),
                ssh_user: map['pve:ssh_user'] || 'root',
                ssh_password: decrypt(map['pve:ssh_password'] || ''),
                strict_tls: map['pve:strict_tls'] === '1'
            };
        },
        setPve: async (pveConfig) => {
            const { encrypt, isMasked } = require('../utils/crypto-utils');
            const current = await module.exports.config.getPve();
            // 加密敏感字段，脱敏值跳过
            var apiToken = pveConfig.api_token;
            if (apiToken !== undefined && !isMasked(apiToken)) {
                apiToken = encrypt(apiToken);
            } else {
                apiToken = encrypt(current.api_token); // 保留旧值（重新加密）
            }
            var sshPassword = pveConfig.ssh_password;
            if (sshPassword !== undefined && !isMasked(sshPassword)) {
                sshPassword = encrypt(sshPassword);
            } else {
                sshPassword = encrypt(current.ssh_password);
            }
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:host', pveConfig.host ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:api_token', apiToken]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:ssh_host', pveConfig.ssh_host ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:ssh_port', String(pveConfig.ssh_port ?? 22)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:ssh_user', pveConfig.ssh_user ?? 'root']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:ssh_password', sshPassword]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['pve:strict_tls', pveConfig.strict_tls ? '1' : '0']);
        },
        getRedis: async () => {
            const keys = ['redis:host', 'redis:port', 'redis:password', 'redis:db', 'redis:prefix'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            const { decrypt } = require('../utils/crypto-utils');
            return {
                host: map['redis:host'] || '',
                port: parseInt(map['redis:port'] || '6379'),
                password: decrypt(map['redis:password'] || ''),
                db: parseInt(map['redis:db'] || '0'),
                prefix: map['redis:prefix'] || 'pve:'
            };
        },
        setRedis: async (redisConfig) => {
            const { encrypt, decrypt, isMasked } = require('../utils/crypto-utils');
            var currentPasswordRow = await queryOne('SELECT value FROM config WHERE `key` = ?', ['redis:password']);
            var currentPassword = currentPasswordRow ? currentPasswordRow.value : '';
            var decryptedCurrent = currentPassword && currentPassword.includes(':') ? decrypt(currentPassword) : '';
            // 加密密码，脱敏值跳过
            var password = redisConfig.password;
            if (password !== undefined && !isMasked(password)) {
                password = encrypt(password);
            } else {
                password = encrypt(decryptedCurrent); // 保留旧值（重新加密）
            }
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['redis:host', redisConfig.host ?? '']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['redis:port', String(redisConfig.port ?? 6379)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['redis:password', password]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['redis:db', String(redisConfig.db ?? 0)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['redis:prefix', redisConfig.prefix ?? 'pve:']);
        },
        get: async (key) => (await queryOne('SELECT value FROM config WHERE `key` = ?', [key]))?.value,
        set: (key, value) => execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', [key, value])
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
        revokeByUserId: async (userId, excludeId) => {
            if (excludeId) {
                await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND id != ?', [userId, excludeId]);
            } else {
                await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?', [userId]);
            }
        },
        revokeByUserAndDevice: async (userId, deviceName) => {
            await execute('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND device_name = ? AND revoked = 0',
              [userId, deviceName]);
        },
        cleanup: () => execute("DELETE FROM refresh_tokens WHERE expires_at <= NOW() OR revoked = 1")
    },

    // 快照配置操作
    snapshotConfig: {
        get: async () => {
            const keys = ['snapshot:max_per_vm', 'snapshot:daily_create_limit', 'snapshot:daily_restore_limit'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            return {
                max_per_vm: parseInt(map['snapshot:max_per_vm']) || 5,
                daily_create_limit: parseInt(map['snapshot:daily_create_limit']) || 20,
                daily_restore_limit: parseInt(map['snapshot:daily_restore_limit']) || 10
            };
        },
        set: async (cfg) => {
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:max_per_vm', String(cfg.max_per_vm ?? 5)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_create_limit', String(cfg.daily_create_limit ?? 20)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['snapshot:daily_restore_limit', String(cfg.daily_restore_limit ?? 10)]);
        }
    },

    // 快照日志操作
    snapshotLogs: {
        add: (userId, vmId, action) => {
            return execute(
                'INSERT INTO snapshot_logs (user_id, vm_id, action, created_at) VALUES (?, ?, ?, ?)',
                [userId, vmId, action, mysqlNow()]
            );
        },
        getDailyCount: async (userId, action) => {
            const today = mysqlToday();
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
        setSecret: (userId, secret) => execute('UPDATE users SET totp_secret = ? WHERE id = ?', [secret, userId]),
        isEnabled: async (userId) => {
            const row = await queryOne('SELECT totp_enabled FROM users WHERE id = ?', [userId]);
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
        addRecoveryCodes: async function(userId, codes) {
            const stmt = 'INSERT INTO recovery_codes (user_id, code) VALUES (?, ?)';
            for (const code of codes) {
                await execute(stmt, [userId, code]);
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
        get: async () => {
            const keys = ['backup:default_storage', 'backup:max_per_vm', 'backup:daily_limit'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            return {
                default_storage: map['backup:default_storage'] || 'local',
                max_per_vm: parseInt(map['backup:max_per_vm']) || 3,
                daily_limit: parseInt(map['backup:daily_limit']) || 3
            };
        },
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
        getById: (id) => queryOne('SELECT * FROM backups WHERE id = ?', [id]),
        getByVmId: (vmId) => queryAll(
            'SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at DESC',
            [vmId]
        ),
        getByStatus: (status) => queryAll('SELECT * FROM backups WHERE status = ?', [status]),
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
            return execute(`DELETE FROM backups WHERE id IN (${placeholders})`, ids);
        },
        getRunningBackups: () => queryAll(
            "SELECT * FROM backups WHERE status = 'running' OR status = 'pending'"
        ),
        getByCtId: (ctId) => queryAll(
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
        add: (userId, vmId, action) => execute(
            'INSERT INTO backup_logs (user_id, vm_id, action) VALUES (?, ?, ?)',
            [userId, vmId, action]
        ),
        getDailyCount: async (userId) => {
            const today = mysqlToday();
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
        get: async () => {
            const keys = ['lxc:max_per_vm', 'lxc:default_storage', 'lxc:default_memory', 'lxc:default_cores', 'lxc:default_disk', 'lxc:default_swap'];
            const placeholders = keys.map(() => '?').join(',');
            const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
            const map = {};
            rows.forEach(r => { map[r.key] = r.value; });
            return {
                max_per_vm: parseInt(map['lxc:max_per_vm']) || 3,
                default_storage: map['lxc:default_storage'] || 'local',
                default_memory: parseInt(map['lxc:default_memory']) || 512,
                default_cores: parseInt(map['lxc:default_cores']) || 1,
                default_disk: parseInt(map['lxc:default_disk']) || 8,
                default_swap: parseInt(map['lxc:default_swap']) || 512
            };
        },
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
        getAll: () => queryAll('SELECT * FROM lxc_containers'),
        getByUserId: (userId) => queryAll('SELECT * FROM lxc_containers WHERE user_id = ?', [userId]),
        getById: (id) => queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]),
        getByCtId: (ctId) => queryAll('SELECT * FROM lxc_containers WHERE ct_id = ?', [ctId]),
        findByUpid: (upid) => queryOne('SELECT * FROM lxc_containers WHERE pve_upid = ? LIMIT 1', [upid]),
        create: async (ct) => {
            const [result] = await execute(
                `INSERT INTO lxc_containers (ct_id, user_id, name, expiration_date, renewal_price, renewal_period, monthly_price, quarterly_discount, yearly_discount, pve_upid, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    ct.ct_id,
                    ct.user_id,
                    ct.name || '',
                    ct.expiration_date || null,
                    ct.renewal_price || '',
                    ct.renewal_period || 'month',
                    ct.monthly_price || '',
                    ct.quarterly_discount || '',
                    ct.yearly_discount || '',
                    ct.pve_upid || '',
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'ct_id', 'user_id', 'expiration_date',
                'renewal_price', 'renewal_period', 'monthly_price', 'quarterly_discount', 'yearly_discount', 'pve_upid', 'dhcp_static_ip', 'ikuai_mac_group_id', 'reminderSent', 'lastReminderDate', 'shutdown_reason'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
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
            return queryOne('SELECT * FROM lxc_containers WHERE id = ?', [id]);
        },
        delete: async (id) => {
            await execute('UPDATE cdk_codes SET used_ct_id = NULL WHERE used_ct_id = ?', [id]);
            return execute('DELETE FROM lxc_containers WHERE id = ?', [id]);
        },
        // LXC 容器提醒记录操作
        reminders: {
            getByCtId: (ctId) => queryAll('SELECT * FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            add: (ctId, days) => {
                return execute(
                    'INSERT INTO lxc_reminders (ct_id, days, sent_at) VALUES (?, ?, ?)',
                    [ctId, days, mysqlNow()]
                );
            },
            clear: (ctId) => execute('DELETE FROM lxc_reminders WHERE ct_id = ?', [ctId]),
            countExpiredDays: async (ctId) => {
                const result = await queryOne(
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
                    mysqlNow(),
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM port_forwards WHERE id = ?', [result.insertId]);
        },
        update: async (id, data) => {
            const allowedColumns = ['name', 'type', 'vm_id', 'ct_id', 'ip', 'mac', 'internal_port', 'external_port', 'protocol', 'enabled', 'source', 'sync_status', 'ikuai_id'];
            for (const key of Object.keys(data)) {
                if (!allowedColumns.includes(key)) {
                    delete data[key];
                }
            }
            if (Object.keys(data).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(data)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            values.push(mysqlNow(), id);
            await execute(`UPDATE port_forwards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`, values);
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

    // 初始化入口（供外部调用，已改为 async）
    initDb,

    // 交易记录操作
    transactionRecords: {
        create: async (record) => {
            const [result] = await execute(
                `INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    record.user_id, record.order_no, record.pay_time || null, record.pay_method || '',
                    record.trade_type || 'recharge', record.amount || '0.00',
                    record.period || null, record.period_count || null,
                    record.balance_before || '0.00', record.balance_after || '0.00',
                    record.resource_type || null, record.resource_id || null,
                    record.trade_no || null,
                    record.api_trade_no || null,
                    mysqlNow()
                ]
            );
            return queryOne('SELECT * FROM transaction_records WHERE id = ?', [result.insertId]);
        },
        getAll: async (params) => {
            var sql = 'SELECT * FROM transaction_records WHERE 1=1';
            var args = [];
            if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
            if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
            if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
            if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
            if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
            if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
            sql += ' ORDER BY created_at DESC';
            // SQL-2 修复：LIMIT/OFFSET 强制 parseInt + 上限保护
            var limit = parseInt(params.limit) || 0;
            var offset = parseInt(params.offset) || 0;
            if (limit > 0) {
                limit = Math.min(limit, 200);
                sql += ' LIMIT ?'; args.push(limit);
            }
            if (offset > 0) { sql += ' OFFSET ?'; args.push(offset); }
            return queryAll(sql, args);
        },
        countAll: async (params) => {
            var sql = 'SELECT COUNT(*) as total FROM transaction_records WHERE 1=1';
            var args = [];
            if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
            if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
            if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
            if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
            if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
            if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
            const row = await queryOne(sql, args);
            return row?.total || 0;
        },
        getByUserId: (userId, params) => {
            return module.exports.transactionRecords.getAll(Object.assign({}, params, { user_id: userId }));
        },
        getByOrderNo: (orderNo) => {
            return queryOne('SELECT * FROM transaction_records WHERE order_no = ?', [orderNo]);
        }
    },

    // PAY-1/2/3 修复：充值待处理订单操作
    pendingOrders: {
        create: async (data) => {
            await execute(
                `INSERT INTO pending_orders (order_no, user_id, amount, pay_method, status, created_at)
                 VALUES (?, ?, ?, ?, 'pending', ?)`,
                [data.order_no, data.user_id, data.amount, data.pay_method || '', mysqlNow()]
            );
        },
        getByOrderNo: (orderNo) => queryOne('SELECT * FROM pending_orders WHERE order_no = ?', [orderNo]),
        markProcessed: (orderNo) => execute('UPDATE pending_orders SET status = ?, processed_at = ? WHERE order_no = ?', ['processed', mysqlNow(), orderNo]),
    },

    // 订单操作
    orders: {
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.order_no, data.user_id, data.type || 'vm',
                    data.package_id, data.template_id || 0,
                    data.period || 'month', data.period_count || 1,
                    data.amount || '0.00', data.cores || 0, data.memory || 0,
                    data.disk_size || 0, data.resource_name || '',
                    data.resource_id || '', data.status || 'completed'
                ]
            );
            return queryOne('SELECT * FROM orders WHERE id = ?', [result.insertId]);
        },
        getByUser: (userId, params) => {
            return module.exports.orders.getAll(Object.assign({}, params, { user_id: userId }));
        },
        getAll: async (params) => {
            // SQL-2 修复：parseInt + 上限保护
            var page = parseInt(params.page) || 1;
            var limit = Math.min(parseInt(params.limit) || 20, 200);
            var offset = (page - 1) * limit;
            var where = [];
            var args = [];
            if (params.order_no) { where.push('o.order_no = ?'); args.push(params.order_no); }
            if (params.user_id) { where.push('o.user_id = ?'); args.push(params.user_id); }
            if (params.type) { where.push('o.type = ?'); args.push(params.type); }
            if (params.status) { where.push('o.status = ?'); args.push(params.status); }
            if (params.start_time) { where.push('o.created_at >= ?'); args.push(params.start_time); }
            if (params.end_time) { where.push('o.created_at <= ?'); args.push(params.end_time); }
            var whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
            var countArgs = args.slice();
            var totalRow = await queryOne('SELECT COUNT(*) as total FROM orders o ' + whereClause, countArgs);
            args.push(limit, offset);
            var rows = await queryAll(`
                SELECT o.*, u.username,
                    COALESCE(vp.name, lxp.name, o.resource_name, '') as package_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                LEFT JOIN vm_packages vp ON o.type = 'vm' AND o.package_id = vp.id
                LEFT JOIN lxc_packages lxp ON o.type = 'lxc' AND o.package_id = lxp.id
                ${whereClause}
                ORDER BY o.id DESC LIMIT ? OFFSET ?
            `, args);
            return { rows, total: totalRow.total, page, limit };
        },
        getByOrderNo: (orderNo) => queryOne('SELECT * FROM orders WHERE order_no = ?', [orderNo]),
        updateStatus: (orderNo, status) => execute('UPDATE orders SET `status` = ? WHERE order_no = ?', [status, orderNo]),
    },

    // VM 模板操作
    vmTemplates: {
        getAll: () => queryAll('SELECT * FROM vm_templates ORDER BY id DESC'),
        getById: (id) => queryOne('SELECT * FROM vm_templates WHERE id = ?', [id]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO vm_templates (name, template_vmid, cores, memory, disk_size, network_bridge, network_model, os_type, ciuser, target_storage, clone_mode, cpu_affinity, mac_group_id, description, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name || '', data.template_vmid || 0, data.cores || 1,
                    data.memory || 1024, data.disk_size || 20,
                    data.network_bridge || 'vmbr0', data.network_model || 'virtio',
                    data.os_type || '',
                    data.ciuser || '',
                    data.target_storage || 'local-lvm',
                    data.clone_mode || 'full',
                    data.cpu_affinity || '',
                    data.mac_group_id || '',
                    data.description || '', data.status || 'active'
                ]
            );
            return queryOne('SELECT * FROM vm_templates WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'template_vmid', 'cores', 'memory', 'disk_size', 'network_bridge', 'network_model', 'os_type', 'ciuser', 'target_storage', 'clone_mode', 'cpu_affinity', 'mac_group_id', 'description', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);
            await execute(`UPDATE vm_templates SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM vm_templates WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM vm_templates WHERE id = ?', [id])
    },

    // LXC 模板操作
    lxcTemplates: {
        getAll: () => queryAll('SELECT * FROM lxc_templates ORDER BY id DESC'),
        getById: (id) => queryOne('SELECT * FROM lxc_templates WHERE id = ?', [id]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO lxc_templates (name, ostemplate, storage, rootfs_storage, cores, memory, swap, disk_size, network_bridge, network_mode, ipv6_enabled, ip6_mode, ip6_addr, ip4_addr, unprivileged, features, mac_group_id, description, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name || '', data.ostemplate || '', data.storage || 'local',
                    data.rootfs_storage || 'local-lvm',
                    data.cores || 1, data.memory || 512, data.swap || 512,
                    data.disk_size || 8, data.network_bridge || 'vmbr0',
                    data.network_mode || 'dhcp',
                    data.ipv6_enabled !== undefined ? data.ipv6_enabled : 1,
                    data.ip6_mode || 'dhcp', data.ip6_addr || '', data.ip4_addr || '',
                    data.unprivileged !== undefined ? data.unprivileged : 1,
                    data.features || '', data.mac_group_id || '', data.description || '', data.status || 'active'
                ]
            );
            return queryOne('SELECT * FROM lxc_templates WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'ostemplate', 'storage', 'cores', 'memory', 'swap', 'disk_size', 'network_bridge', 'network_mode', 'ipv6_enabled', 'ip6_mode', 'ip6_addr', 'ip4_addr', 'unprivileged', 'features', 'description', 'rootfs_storage', 'mac_group_id', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);
            await execute(`UPDATE lxc_templates SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM lxc_templates WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM lxc_templates WHERE id = ?', [id])
    },

    // VM 套餐操作
    vmPackages: {
        getAll: () => queryAll('SELECT p.*, t.name as template_name, g.name as group_name FROM vm_packages p LEFT JOIN vm_templates t ON p.template_id = t.id LEFT JOIN package_groups g ON p.group_id = g.id ORDER BY p.sort_order DESC, p.id DESC'),
        getById: (id) => queryOne('SELECT p.*, t.name as template_name, g.name as group_name FROM vm_packages p LEFT JOIN vm_templates t ON p.template_id = t.id LEFT JOIN package_groups g ON p.group_id = g.id WHERE p.id = ?', [id]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO vm_packages (name, template_id, cores, memory, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status, group_id, quarterly_discount, yearly_discount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name || '', data.template_id || 0, data.cores || 1,
                    data.memory || 1024, data.disk_size || 20,
                    data.monthly_price || 0, data.quarterly_price || 0,
                    data.yearly_price || 0, (data.stock === '' || data.stock === undefined || data.stock === null) ? -1 : parseInt(data.stock), data.sort_order || 0, data.cpu_model || '', data.bandwidth || 0, data.description || '', data.status || 'active',
                    data.group_id || null, data.quarterly_discount || 0, data.yearly_discount || 0
                ]
            );
            return queryOne('SELECT * FROM vm_packages WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status', 'group_id', 'quarterly_discount', 'yearly_discount'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);
            await execute(`UPDATE vm_packages SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM vm_packages WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM vm_packages WHERE id = ?', [id]),
        batchUpdateSortOrder: async function(ids) {
            if (!Array.isArray(ids) || ids.length === 0) return;
            var total = ids.length;
            var sql = 'UPDATE vm_packages SET sort_order = ? WHERE id = ?';
            for (var i = 0; i < ids.length; i++) {
                var sortOrder = (total - i) * 10;
                await execute(sql, [sortOrder, parseInt(ids[i])]);
            }
        }
    },

    // LXC 套餐操作
    lxcPackages: {
        getAll: () => queryAll('SELECT p.*, t.name as template_name, g.name as group_name FROM lxc_packages p LEFT JOIN lxc_templates t ON p.template_id = t.id LEFT JOIN package_groups g ON p.group_id = g.id ORDER BY p.sort_order DESC, p.id DESC'),
        getById: (id) => queryOne('SELECT p.*, t.name as template_name, g.name as group_name FROM lxc_packages p LEFT JOIN lxc_templates t ON p.template_id = t.id LEFT JOIN package_groups g ON p.group_id = g.id WHERE p.id = ?', [id]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO lxc_packages (name, template_id, cores, memory, swap, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status, group_id, quarterly_discount, yearly_discount)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    data.name || '', data.template_id || 0, data.cores || 1,
                    data.memory || 512, data.swap || 512, data.disk_size || 8,
                    data.monthly_price || 0, data.quarterly_price || 0,
                    data.yearly_price || 0, (data.stock === '' || data.stock === undefined || data.stock === null) ? -1 : parseInt(data.stock), data.sort_order || 0, data.cpu_model || '', data.bandwidth || 0, data.description || '', data.status || 'active',
                    data.group_id || null, data.quarterly_discount || 0, data.yearly_discount || 0
                ]
            );
            return queryOne('SELECT * FROM lxc_packages WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'swap', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status', 'group_id', 'quarterly_discount', 'yearly_discount'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);
            await execute(`UPDATE lxc_packages SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM lxc_packages WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM lxc_packages WHERE id = ?', [id]),
        batchUpdateSortOrder: async function(ids) {
            if (!Array.isArray(ids) || ids.length === 0) return;
            var total = ids.length;
            var sql = 'UPDATE lxc_packages SET sort_order = ? WHERE id = ?';
            for (var i = 0; i < ids.length; i++) {
                var sortOrder = (total - i) * 10;
                await execute(sql, [sortOrder, parseInt(ids[i])]);
            }
        }
    },

    // 套餐分组操作
    packageGroups: {
        getAll: () => queryAll('SELECT * FROM package_groups ORDER BY sort_order DESC, id ASC'),
        getByType: (type) => queryAll('SELECT * FROM package_groups WHERE type = ? ORDER BY sort_order DESC, id ASC', [type]),
        getById: (id) => queryOne('SELECT * FROM package_groups WHERE id = ?', [id]),
        create: async (data) => {
            const [result] = await execute(
                'INSERT INTO package_groups (name, type, sort_order) VALUES (?, ?, ?)',
                [data.name || '', data.type || 'vm', data.sort_order || 0]
            );
            return queryOne('SELECT * FROM package_groups WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'type', 'sort_order'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(id);
            await execute(`UPDATE package_groups SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM package_groups WHERE id = ?', [id]);
        },
        delete: (id) => execute('DELETE FROM package_groups WHERE id = ?', [id]),
        batchUpdateSortOrder: async function(ids) {
            if (!Array.isArray(ids) || ids.length === 0) return;
            var total = ids.length;
            var sql = 'UPDATE package_groups SET sort_order = ? WHERE id = ?';
            for (var i = 0; i < ids.length; i++) {
                var sortOrder = (total - i) * 10;
                await execute(sql, [sortOrder, parseInt(ids[i])]);
            }
        }
    },

    // ==================== 硬盘管理 ====================

    // 存储分组
    storageGroups: {
        getAll: () => queryAll('SELECT * FROM storage_groups ORDER BY sort_order, id'),
        getById: (id) => queryOne('SELECT * FROM storage_groups WHERE id = ?', [parseInt(id)]),
        create: async (data) => {
            const [result] = await execute(
                'INSERT INTO storage_groups (name, sort_order) VALUES (?, ?)',
                [data.name || '', parseInt(data.sort_order) || 0]
            );
            return queryOne('SELECT * FROM storage_groups WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'sort_order'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(parseInt(id));
            await execute(`UPDATE storage_groups SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM storage_groups WHERE id = ?', [parseInt(id)]);
        },
        delete: (id) => execute('DELETE FROM storage_groups WHERE id = ?', [parseInt(id)]),
        countDisksByGroup: (groupId) => queryOne('SELECT COUNT(*) AS cnt FROM disks WHERE storage_group_id = ? AND status != ?', [parseInt(groupId), 'destroyed'])
    },

    // 硬盘规格
    diskSpecs: {
        getAll: () => queryAll('SELECT ds.*, sg.name AS group_name FROM disk_specs ds LEFT JOIN storage_groups sg ON ds.storage_group_id = sg.id ORDER BY sg.sort_order, ds.id'),
        getById: (id) => queryOne('SELECT * FROM disk_specs WHERE id = ?', [parseInt(id)]),
        getByGroup: (groupId) => queryAll('SELECT * FROM disk_specs WHERE storage_group_id = ? AND enabled = 1 ORDER BY id', [parseInt(groupId)]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO disk_specs (name, disk_type, storage_group_id, enabled, min_size_gb, max_size_gb, price_per_gb, quarterly_discount, yearly_discount, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max, storage_pool, description)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [data.name || '', data.disk_type, parseInt(data.storage_group_id), data.enabled ? 1 : 0, parseInt(data.min_size_gb) || 10, parseInt(data.max_size_gb) || 2000, parseFloat(data.price_per_gb) || 0, parseInt(data.quarterly_discount) || 0, parseInt(data.yearly_discount) || 0, data.mbps_rd || null, data.mbps_rd_max || null, data.mbps_wr || null, data.mbps_wr_max || null, data.iops_rd || null, data.iops_rd_max || null, data.iops_wr || null, data.iops_wr_max || null, data.storage_pool || '', data.description || null]
            );
            return queryOne('SELECT * FROM disk_specs WHERE id = ?', [result.insertId]);
        },
        update: async (id, updates) => {
            const allowedColumns = ['name', 'disk_type', 'storage_group_id', 'enabled', 'min_size_gb', 'max_size_gb', 'price_per_gb', 'quarterly_discount', 'yearly_discount', 'mbps_rd', 'mbps_rd_max', 'mbps_wr', 'mbps_wr_max', 'iops_rd', 'iops_rd_max', 'iops_wr', 'iops_wr_max', 'storage_pool', 'description'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            if (Object.keys(updates).length === 0) return;
            const fields = [];
            const values = [];
            for (const [key, value] of Object.entries(updates)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
            fields.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(parseInt(id));
            await execute(`UPDATE disk_specs SET ${fields.join(', ')} WHERE id = ?`, values);
            return queryOne('SELECT * FROM disk_specs WHERE id = ?', [parseInt(id)]);
        },
        delete: (id) => execute('DELETE FROM disk_specs WHERE id = ?', [parseInt(id)]),
        countDisksBySpec: (specId) => queryOne('SELECT COUNT(*) AS cnt FROM disks WHERE spec_id = ? AND status != ?', [parseInt(specId), 'destroyed'])
    },

    // 磁盘资产台账
    disks: {
        getById: (id) => queryOne('SELECT * FROM disks WHERE id = ?', [parseInt(id)]),
        getByUserId: (userId) => queryAll('SELECT d.*, u.username, sg.name AS group_name, ds.name AS spec_name FROM disks d LEFT JOIN users u ON d.user_id = u.id LEFT JOIN storage_groups sg ON d.storage_group_id = sg.id LEFT JOIN disk_specs ds ON d.spec_id = ds.id WHERE d.user_id = ? ORDER BY d.id DESC', [parseInt(userId)]),
        getAll: () => queryAll('SELECT d.*, u.username, sg.name AS group_name, ds.name AS spec_name FROM disks d LEFT JOIN users u ON d.user_id = u.id LEFT JOIN storage_groups sg ON d.storage_group_id = sg.id LEFT JOIN disk_specs ds ON d.spec_id = ds.id ORDER BY d.id DESC'),
        getByVolumeId: (volId) => queryOne('SELECT * FROM disks WHERE volume_id = ?', [volId]),
        create: async (data) => {
            const [result] = await execute(
                `INSERT INTO disks (volume_id, disk_name, spec_id, user_id, storage_group_id, storage_pool, disk_type, capacity_gb, status, price_per_gb, quarterly_discount, yearly_discount, auto_renew, expire_time, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [data.volume_id, data.disk_name || '', data.spec_id || null, parseInt(data.user_id), parseInt(data.storage_group_id), data.storage_pool, data.disk_type, parseInt(data.capacity_gb), data.status || 'free', parseFloat(data.price_per_gb) || 0, parseInt(data.quarterly_discount) || 0, parseInt(data.yearly_discount) || 0, data.auto_renew ? 1 : 0, data.expire_time || null, data.mbps_rd || null, data.mbps_rd_max || null, data.mbps_wr || null, data.mbps_wr_max || null, data.iops_rd || null, data.iops_rd_max || null, data.iops_wr || null, data.iops_wr_max || null]
            );
            return queryOne('SELECT * FROM disks WHERE id = ?', [result.insertId]);
        },
        updateStatus: (id, status) => execute('UPDATE disks SET status = ?, updated_at = ? WHERE id = ?', [status, mysqlNow(), parseInt(id)]),
        bind: (id, vmid, bus, dev) => execute('UPDATE disks SET status = ?, bind_vmid = ?, bind_bus = ?, bind_dev = ?, updated_at = ? WHERE id = ?', ['bound', parseInt(vmid), bus, parseInt(dev), mysqlNow(), parseInt(id)]),
        unbind: (id) => execute('UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, updated_at = ? WHERE id = ?', ['free', mysqlNow(), parseInt(id)]),
        updateExpire: (id, expireTime) => execute('UPDATE disks SET expire_time = ?, updated_at = ? WHERE id = ?', [expireTime, mysqlNow(), parseInt(id)]),
        updateCapacity: (id, capacityGb) => execute('UPDATE disks SET capacity_gb = ?, updated_at = ? WHERE id = ?', [parseInt(capacityGb), mysqlNow(), parseInt(id)]),
        markDestroyed: (id) => execute('UPDATE disks SET status = ?, updated_at = ? WHERE id = ?', ['destroyed', mysqlNow(), parseInt(id)]),
        // 切换自动续费开关（0=关闭, 1=开启）
        updateAutoRenew: (id, enabled) => execute('UPDATE disks SET auto_renew = ?, updated_at = ? WHERE id = ?', [enabled ? 1 : 0, mysqlNow(), parseInt(id)]),
        // 硬删除：仅允许删除已销毁状态的磁盘记录（清理已销毁的磁盘记录用）
        hardDelete: (id) => execute('DELETE FROM disks WHERE id = ? AND status = ?', [parseInt(id), 'destroyed']),
        getExpiring: () => queryAll("SELECT * FROM disks WHERE status IN ('free','bound','grace') AND expire_time IS NOT NULL AND expire_time <= DATE_ADD(NOW(), INTERVAL 7 DAY)")
    },

    // 磁盘生命周期配置
    diskLifecycleConfig: {
        get: () => queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1'),
        upsert: async (data) => {
            var existing = await queryOne('SELECT id FROM disk_lifecycle_config WHERE id = 1');
            if (existing) {
                const allowedColumns = ['warn_days', 'warn_frequency', 'grace_days', 'grace_frequency', 'shutdown_timeout', 'retention_days', 'auto_renew_days'];
                const fields = [];
                const values = [];
                for (const key of Object.keys(data)) {
                    if (allowedColumns.includes(key)) {
                        fields.push(`${key} = ?`);
                        values.push(data[key]);
                    }
                }
                if (fields.length === 0) return queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1');
                fields.push('updated_at = ?');
                values.push(mysqlNow());
                await execute(`UPDATE disk_lifecycle_config SET ${fields.join(', ')} WHERE id = 1`, values);
            } else {
                await execute(
                    'INSERT INTO disk_lifecycle_config (id, warn_days, warn_frequency, grace_days, grace_frequency, shutdown_timeout, retention_days, auto_renew_days) VALUES (1,?,?,?,?,?,?,?)',
                    [parseInt(data.warn_days) || 7, data.warn_frequency || 'daily', parseInt(data.grace_days) || 3, data.grace_frequency || 'twice_daily', parseInt(data.shutdown_timeout) || 300, parseInt(data.retention_days) || 15, parseInt(data.auto_renew_days) || 1]
                );
            }
            return queryOne('SELECT * FROM disk_lifecycle_config WHERE id = 1');
        }
    }
};
