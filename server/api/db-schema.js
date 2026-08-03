const crypto = require('crypto');
const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

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
        price_per_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
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
        disk_format VARCHAR(20) DEFAULT NULL,
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
        disk_format VARCHAR(20) DEFAULT NULL,
        capacity_gb INT NOT NULL,
        status ENUM('free','bound','grace','expired','destroyed') DEFAULT 'free',
        bind_vmid INT DEFAULT NULL,
        bind_bus VARCHAR(10) DEFAULT NULL,
        bind_dev INT DEFAULT NULL,
        price_per_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        quarterly_discount INT DEFAULT 0,
        yearly_discount INT DEFAULT 0,
        auto_renew TINYINT(1) DEFAULT 0,
        is_legacy TINYINT(1) DEFAULT 0,
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
        INDEX idx_disks_vmid (bind_vmid),
        INDEX idx_disks_legacy (is_legacy)
    )`);

    // 中转 VM 托管字段（游离数据盘托管在常驻中转 VM 上，防止用户 VM 销毁连带删除）
    try { await execute("ALTER TABLE disks ADD COLUMN holding_vmid INT DEFAULT NULL"); } catch (_) {}
    try { await execute("ALTER TABLE disks ADD COLUMN holding_slot VARCHAR(10) DEFAULT NULL"); } catch (_) {}

	    // 创建磁盘生命周期配置表
	    await execute(`
	    CREATE TABLE IF NOT EXISTS disk_lifecycle_config (
	        id INT PRIMARY KEY DEFAULT 1,
	        warn_days INT DEFAULT 7,
	        warn_frequency VARCHAR(20) DEFAULT 'daily',
	        grace_days INT DEFAULT 3,
	        grace_frequency VARCHAR(20) DEFAULT 'twice_daily',
	        retention_days INT DEFAULT 15,
	        auto_renew_days INT DEFAULT 1,
	        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
	    )`);

	    // 创建 VM 磁盘快照表（用于恢复后对账，防止幽灵盘）
	    await execute(`
	    CREATE TABLE IF NOT EXISTS vm_disk_snapshots (
	        vm_id          INT NOT NULL,
	        user_id        INT NOT NULL,
	        disk_snapshot  JSON NOT NULL,
	        created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
	        updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	        PRIMARY KEY (vm_id),
	        INDEX idx_user (user_id)
	    )`);

	    // 给 restore_tasks 添加 pre_snapshot 列（用于恢复前后对账）
	    try { await execute("ALTER TABLE restore_tasks ADD COLUMN pre_snapshot JSON DEFAULT NULL"); } catch (_) {}

	    // 创建可切换系统模板表（os_templates）
    await execute(`
    CREATE TABLE IF NOT EXISTS os_templates (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL DEFAULT '',
        template_vmid INT NOT NULL DEFAULT 0,
        os_type VARCHAR(50) NOT NULL DEFAULT '',
        os_version VARCHAR(50) NOT NULL DEFAULT '',
        ostype VARCHAR(20) NOT NULL DEFAULT '',
        arch VARCHAR(20) NOT NULL DEFAULT 'x86_64',
        target_storage VARCHAR(100) NOT NULL DEFAULT 'local-lvm',
        ciuser VARCHAR(100) NOT NULL DEFAULT '',
        description TEXT NOT NULL,
        icon VARCHAR(100) NOT NULL DEFAULT '',
        sort_order INT NOT NULL DEFAULT 0,
        allowed_package_ids VARCHAR(500) NOT NULL DEFAULT '',
        enabled TINYINT(1) NOT NULL DEFAULT 1,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        created_at DATETIME NOT NULL DEFAULT NOW(),
        updated_at DATETIME NOT NULL DEFAULT NOW(),
        INDEX idx_os_templates_enabled (enabled),
        INDEX idx_os_templates_vmid (template_vmid)
    )`);

    // 创建系统切换日志表（vm_os_switch_logs）
    await execute(`
    CREATE TABLE IF NOT EXISTS vm_os_switch_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vm_id INT NOT NULL,
        user_id INT NOT NULL,
        from_os_template_id INT DEFAULT NULL,
        to_os_template_id INT NOT NULL,
        new_system_volume_id VARCHAR(255) DEFAULT '',
        status VARCHAR(20) NOT NULL DEFAULT 'pending',
        fail_stage VARCHAR(50) DEFAULT '',
        error_message TEXT DEFAULT NULL,
        admin_intervention_required TINYINT(1) NOT NULL DEFAULT 0,
        amount_charged DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        order_no VARCHAR(64) DEFAULT '',
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        finished_at DATETIME DEFAULT NULL,
        INDEX idx_vm_os_switch_logs_vmid (vm_id),
        INDEX idx_vm_os_switch_logs_user (user_id),
        INDEX idx_vm_os_switch_logs_status (status)
    )`);

    // V3-14 修复：敏感操作审计日志表
    await execute(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL DEFAULT 0,
            username VARCHAR(64) DEFAULT '',
            action VARCHAR(64) NOT NULL,
            resource_type VARCHAR(32) DEFAULT '',
            resource_id VARCHAR(64) DEFAULT '',
            ip VARCHAR(64) DEFAULT '',
            user_agent VARCHAR(500) DEFAULT '',
            details TEXT,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_audit_user (user_id),
            INDEX idx_audit_action (action),
            INDEX idx_audit_created (created_at)
        ) CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // 创建用户通知设置表
    await execute(`
        CREATE TABLE IF NOT EXISTS user_settings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL UNIQUE,
            email_notifications_enabled INT DEFAULT 1,
            notify_vm_provisioned INT DEFAULT 1,
            notify_lxc_provisioned INT DEFAULT 1,
            notify_account_password INT DEFAULT 1,
            notify_vm_refund INT DEFAULT 1,
            notify_lxc_refund INT DEFAULT 1,
            notify_disk_purchase INT DEFAULT 1,
            notify_disk_resize INT DEFAULT 1,
            notify_disk_renewal INT DEFAULT 1,
            notify_disk_refund INT DEFAULT 1,
            notify_disk_destroy_refund INT DEFAULT 1,
            notify_recharge INT DEFAULT 1,
            notify_renewal INT DEFAULT 1,
            notify_expiry_reminder INT DEFAULT 1,
            notify_expiry_alert INT DEFAULT 1,
            notify_backup_result INT DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_settings_user (user_id)
        )
    `);

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

    await safeAlter('vms', 'current_os_template_id', 'INT DEFAULT NULL');
    await safeAlter('vms', 'last_os_switch_at', 'DATETIME DEFAULT NULL');
    await safeAlter('vms', 'os_switch_pve_upid', "VARCHAR(200) DEFAULT ''");
    await safeAlter('vm_packages', 'default_os_template_id', 'INT DEFAULT NULL');
    // os_templates 表迁移：新增 ostype 列（兼容旧表）
    try {
        await execute("ALTER TABLE os_templates ADD COLUMN ostype VARCHAR(20) NOT NULL DEFAULT '' AFTER os_version");
        console.log('[db] 迁移: os_templates.ostype 列已添加');
    } catch (e) {
        if (!e.message.toLowerCase().includes('duplicate')) console.error('[db] 迁移 os_templates.ostype 失败:', e.message);
    }
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

    // 价格精度统一为 2 位小数（原 4 位：DECIMAL(10,4) -> DECIMAL(10,2)）
    // 检查列类型后再决定是否执行（避免每次启动重复打印迁移日志）
    async function checkColumnType(tableName, columnName) {
        try {
            var rows = await queryAll("SELECT DATA_TYPE, NUMERIC_PRECISION, NUMERIC_SCALE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?", [tableName, columnName]);
            return rows && rows[0] ? { type: rows[0].DATA_TYPE, precision: rows[0].NUMERIC_PRECISION, scale: rows[0].NUMERIC_SCALE } : null;
        } catch (e) { return null; }
    }
    var specPriceType = await checkColumnType('disk_specs', 'price_per_gb');
    if (specPriceType && (specPriceType.scale !== 2)) {
        try {
            await execute("ALTER TABLE disk_specs MODIFY COLUMN price_per_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00");
            console.log('[db] 迁移: disk_specs.price_per_gb -> DECIMAL(10,2)');
        } catch (e) {
            console.error('[db] 迁移 disk_specs.price_per_gb 失败:', e.message);
        }
    }
    var diskPriceType = await checkColumnType('disks', 'price_per_gb');
    if (diskPriceType && (diskPriceType.scale !== 2)) {
        try {
            await execute("ALTER TABLE disks MODIFY COLUMN price_per_gb DECIMAL(10,2) NOT NULL DEFAULT 0.00");
            console.log('[db] 迁移: disks.price_per_gb -> DECIMAL(10,2)');
        } catch (e) {
            console.error('[db] 迁移 disks.price_per_gb 失败:', e.message);
        }
    }

    // 磁盘规格新增 disk_format 列（DIR/BTRFS 等文件系统存储需要扩展名）
    try {
        await execute("ALTER TABLE disk_specs ADD COLUMN disk_format VARCHAR(20) DEFAULT NULL AFTER storage_pool");
        console.log('[db] 迁移: disk_specs.disk_format 列已添加');
    } catch (e) {
        if (!e.message.toLowerCase().includes('duplicate')) console.error('[db] 迁移 disk_specs.disk_format 失败:', e.message);
    }
    // 磁盘台账新增 disk_format 列（从 spec 复制，用于判断是否支持扩容）
    try {
        await execute("ALTER TABLE disks ADD COLUMN disk_format VARCHAR(20) DEFAULT NULL AFTER disk_type");
        console.log('[db] 迁移: disks.disk_format 列已添加');
    } catch (e) {
        if (!e.message.toLowerCase().includes('duplicate')) console.error('[db] 迁移 disks.disk_format 失败:', e.message);
    }

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

    // os_templates 表迁移：新增 disk_format 列（目标磁盘格式，如 raw/qcow2/vmdk）
    await safeAlter('os_templates', 'disk_format', "VARCHAR(20) NOT NULL DEFAULT '' AFTER target_storage");

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
        'uapipro:enabled': '0',
        'uapipro:api_key': '',
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

// 兼容旧数据库：添加 is_legacy 字段（如果不存在）+ 存量迁移
try {
    await execute("ALTER TABLE disks ADD COLUMN is_legacy TINYINT(1) DEFAULT 0");
    // 存量迁移：将名称以 imported- 开头的磁盘标记为 legacy
    await execute("UPDATE disks SET is_legacy = 1 WHERE disk_name LIKE 'imported-%' AND is_legacy = 0");
    console.log('[DB] disks.is_legacy 字段迁移完成');
} catch (e) {
    // 字段已存在，忽略错误
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

module.exports = {
    initDb,
    generateRandomPassword,
};
