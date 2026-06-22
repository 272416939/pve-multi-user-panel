const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const CryptoJS = require('crypto-js');
const fs = require('fs');

/**
 * 生成指定长度的随机强密码
 * @param {number} length - 密码长度，默认 16
 * @returns {string} 随机密码字符串
 */
function generateRandomPassword(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    const array = new Uint8Array(length);
    crypto.randomFillSync(array);
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
    }
    return result;
}

const dbFile = path.join(__dirname, '../../data/pve-panel.db');

// 确保 data 目录存在
const dataDir = path.dirname(dbFile);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// 统一本地时间工具函数：返回 YYYY-MM-DD HH:MM:SS 格式的本地时间
function sqliteNow() {
    var d = new Date();
    var local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 19).replace('T', ' ');
}
function sqliteToday() {
    return sqliteNow().slice(0, 10);
}

// 检查是否需要从旧JSON数据库迁移数据
const jsonDbFile = path.join(__dirname, '../../db.json');
let needMigration = false;
if (fs.existsSync(jsonDbFile) && !fs.existsSync(dbFile)) {
    needMigration = true;
    console.log('检测到旧JSON数据库，将进行数据迁移...');
}

// 初始化数据库连接
const db = new Database(dbFile);
db.pragma('journal_mode = WAL'); // 开启WAL模式，提高并发性能

// 数据库初始化函数
function initDb() {
    // 创建用户表
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            avatar TEXT DEFAULT '',
            bio TEXT DEFAULT '',
            email TEXT DEFAULT '',
            emailVerified INTEGER DEFAULT 0,
            totp_secret TEXT DEFAULT '',
            totp_enabled INTEGER DEFAULT 0,
            must_change_password INTEGER DEFAULT 0,
            password_salt TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    try { db.exec("ALTER TABLE users ADD COLUMN balance TEXT DEFAULT '0.00'"); } catch (_) {}

    // 创建虚拟机表
    db.exec(`
        CREATE TABLE IF NOT EXISTS vms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vm_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            name TEXT DEFAULT '',
            expiration_date TEXT,
            renewal_price TEXT DEFAULT '',
            reminderSent INTEGER DEFAULT 0,
            lastReminderDate TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    try { db.exec('ALTER TABLE vms ADD COLUMN renewal_period TEXT DEFAULT \'month\''); } catch (_) {}
    try { db.exec('ALTER TABLE vms ADD COLUMN backup_storage TEXT DEFAULT \'\''); } catch (_) {}

    // 创建虚拟机提醒记录表
    db.exec(`
        CREATE TABLE IF NOT EXISTS vm_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vm_id INTEGER NOT NULL,
            days INTEGER NOT NULL,
            sent_at TEXT NOT NULL,
            FOREIGN KEY (vm_id) REFERENCES vms(id)
        )
    `);

    // 创建备忘录表
    db.exec(`
        CREATE TABLE IF NOT EXISTS memos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            title TEXT DEFAULT '',
            content TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建密码重置令牌表
    db.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            email TEXT,
            token TEXT UNIQUE NOT NULL,
            type TEXT DEFAULT 'password_reset',
            expires_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建 CDK 兑换码表
    db.exec(`
        CREATE TABLE IF NOT EXISTS cdk_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            duration_days INTEGER NOT NULL,
            created_by INTEGER NOT NULL,
            target_user_id INTEGER,
            created_at TEXT NOT NULL,
            expires_at TEXT,
            is_used INTEGER DEFAULT 0,
            used_by INTEGER,
            used_vm_id INTEGER,
            used_at TEXT,
            batch_id TEXT,
            FOREIGN KEY (created_by) REFERENCES users(id),
            FOREIGN KEY (target_user_id) REFERENCES users(id),
            FOREIGN KEY (used_by) REFERENCES users(id),
            FOREIGN KEY (used_vm_id) REFERENCES vms(id)
        )
    `);

    // 创建配置表
    db.exec(`
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    `);

    // 创建站内消息表
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid INTEGER NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            type INTEGER NOT NULL DEFAULT 1,
            is_read INTEGER NOT NULL DEFAULT 0,
            send_type INTEGER NOT NULL DEFAULT 1,
            link_url TEXT DEFAULT '',
            link_text TEXT DEFAULT '',
            batch_id TEXT DEFAULT '',
            created_at TEXT NOT NULL
        )
    `);

    // 创建刷新令牌表
    db.exec(`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token TEXT UNIQUE NOT NULL,
            device_name TEXT DEFAULT '',
            ip TEXT DEFAULT '',
            user_agent TEXT DEFAULT '',
            created_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            revoked INTEGER DEFAULT 0,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建快照操作日志表
    db.exec(`
        CREATE TABLE IF NOT EXISTS snapshot_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            vm_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建恢复码表
    db.exec(`
        CREATE TABLE IF NOT EXISTS recovery_codes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            used INTEGER DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建备份表
    db.exec(`
        CREATE TABLE IF NOT EXISTS backups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vm_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            storage TEXT NOT NULL,
            filename TEXT DEFAULT '',
            size INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            pve_upid TEXT DEFAULT '',
            progress INTEGER DEFAULT 0,
            notes TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            completed_at TEXT,
            error_msg TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建备份索引
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_backups_vm_id ON backups(vm_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_backups_status ON backups(status)');
    } catch (e) {}

    // 创建备份操作日志表
    db.exec(`
        CREATE TABLE IF NOT EXISTS backup_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            vm_id INTEGER NOT NULL,
            action TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建恢复任务表
    db.exec(`
        CREATE TABLE IF NOT EXISTS restore_tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vm_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            backup_id INTEGER NOT NULL,
            pve_upid TEXT DEFAULT '',
            progress INTEGER DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
            completed_at TEXT,
            error_msg TEXT DEFAULT '',
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (backup_id) REFERENCES backups(id)
        )
    `);

    // 创建恢复任务索引
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_restore_tasks_vm_id ON restore_tasks(vm_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_restore_tasks_status ON restore_tasks(status)');
    } catch (e) {}

    // 创建 LXC 容器表
    db.exec(`
        CREATE TABLE IF NOT EXISTS lxc_containers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ct_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            name TEXT DEFAULT '',
            expiration_date TEXT,
            renewal_price TEXT DEFAULT '',
            reminderSent INTEGER DEFAULT 0,
            lastReminderDate TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    try { db.exec('ALTER TABLE lxc_containers ADD COLUMN renewal_period TEXT DEFAULT \'month\''); } catch (_) {}

    // 创建 LXC 提醒记录表
    db.exec(`
        CREATE TABLE IF NOT EXISTS lxc_reminders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ct_id INTEGER NOT NULL,
            days INTEGER NOT NULL,
            sent_at TEXT NOT NULL,
            FOREIGN KEY (ct_id) REFERENCES lxc_containers(id)
        )
    `);

    // 创建端口转发表
    db.exec(`
        CREATE TABLE IF NOT EXISTS port_forwards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            vm_id INTEGER,
            ct_id INTEGER,
            name TEXT DEFAULT '',
            ip TEXT NOT NULL,
            mac TEXT DEFAULT '',
            internal_port INTEGER NOT NULL,
            external_port INTEGER NOT NULL,
            protocol TEXT DEFAULT 'tcp',
            enabled INTEGER DEFAULT 1,
            source TEXT DEFAULT 'panel',
            sync_status TEXT DEFAULT 'synced',
            ikuai_id TEXT DEFAULT '',
            created_at TEXT DEFAULT (datetime('now','localtime')),
            updated_at TEXT DEFAULT (datetime('now','localtime'))
        )
    `);

    // 创建交易记录表
    db.exec(`
        CREATE TABLE IF NOT EXISTS transaction_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            order_no TEXT NOT NULL UNIQUE,
            pay_time TEXT,
            pay_method TEXT DEFAULT '',
            trade_type TEXT NOT NULL DEFAULT 'recharge',
            amount TEXT DEFAULT '0.00',
            period TEXT DEFAULT NULL,
            period_count INTEGER DEFAULT NULL,
            balance_before TEXT DEFAULT '0.00',
            balance_after TEXT DEFAULT '0.00',
            resource_type TEXT DEFAULT NULL,
            resource_id INTEGER DEFAULT NULL,
            trade_no TEXT DEFAULT NULL,
            api_trade_no TEXT DEFAULT NULL,
            created_at TEXT DEFAULT (datetime('now','localtime')),
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    `);

    // 创建 orders 表
    db.exec(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'vm',
        package_id INTEGER NOT NULL,
        template_id INTEGER DEFAULT 0,
        period TEXT NOT NULL DEFAULT 'month',
        period_count INTEGER NOT NULL DEFAULT 1,
        amount TEXT NOT NULL DEFAULT '0.00',
        cores INTEGER DEFAULT 0,
        memory INTEGER DEFAULT 0,
        disk_size INTEGER DEFAULT 0,
        resource_name TEXT DEFAULT '',
        resource_id TEXT DEFAULT '',
        status TEXT NOT NULL DEFAULT 'completed',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);
    try { db.exec('ALTER TABLE orders ADD COLUMN mac_group_id TEXT DEFAULT ""'); } catch (e) {}

    // 创建消息索引
    try {
        db.exec('CREATE INDEX IF NOT EXISTS idx_messages_uid ON messages(uid)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_messages_unread ON messages(uid, is_read)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at)');
    } catch (e) {}

    // vm_templates 表
    db.exec(`CREATE TABLE IF NOT EXISTS vm_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        template_vmid INTEGER NOT NULL DEFAULT 0,
        cores INTEGER NOT NULL DEFAULT 1,
        memory INTEGER NOT NULL DEFAULT 1024,
        disk_size INTEGER NOT NULL DEFAULT 20,
        network_bridge TEXT NOT NULL DEFAULT 'vmbr0',
        network_model TEXT NOT NULL DEFAULT 'virtio',
        os_type TEXT NOT NULL DEFAULT '',
        ciuser TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    try { db.exec('ALTER TABLE vm_templates ADD COLUMN target_storage TEXT NOT NULL DEFAULT "local-lvm"'); } catch (e) {}
    try { db.exec('ALTER TABLE vm_templates ADD COLUMN clone_mode TEXT NOT NULL DEFAULT "full"'); } catch (e) {}
    try { db.exec('ALTER TABLE vm_templates ADD COLUMN cpu_affinity TEXT NOT NULL DEFAULT ""'); } catch (e) {}
    try { db.exec('ALTER TABLE vm_templates ADD COLUMN mac_group_id TEXT DEFAULT ""'); } catch (e) {}
    try { db.exec('ALTER TABLE vm_templates ADD COLUMN ciuser TEXT NOT NULL DEFAULT ""'); } catch (e) {}

    // lxc_templates 表
    db.exec(`CREATE TABLE IF NOT EXISTS lxc_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        ostemplate TEXT NOT NULL DEFAULT '',
        storage TEXT NOT NULL DEFAULT 'local',
        cores INTEGER NOT NULL DEFAULT 1,
        memory INTEGER NOT NULL DEFAULT 512,
        swap INTEGER NOT NULL DEFAULT 512,
        disk_size INTEGER NOT NULL DEFAULT 8,
        network_bridge TEXT NOT NULL DEFAULT 'vmbr0',
        network_mode TEXT NOT NULL DEFAULT 'dhcp',
        ipv6_enabled INTEGER NOT NULL DEFAULT 1,
        ip6_mode TEXT NOT NULL DEFAULT 'dhcp',
        ip6_addr TEXT NOT NULL DEFAULT '',
        ip4_addr TEXT NOT NULL DEFAULT '',
        unprivileged INTEGER NOT NULL DEFAULT 1,
        features TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    try { db.exec('ALTER TABLE lxc_templates ADD COLUMN rootfs_storage TEXT NOT NULL DEFAULT "local-lvm"'); } catch (e) {}
    try { db.exec('ALTER TABLE lxc_templates ADD COLUMN mac_group_id TEXT DEFAULT ""'); } catch (e) {}

    try {
        db.prepare(`ALTER TABLE lxc_templates ADD COLUMN ipv6_enabled INTEGER NOT NULL DEFAULT 1`).run();
    } catch (e) {}
    try {
        db.prepare(`ALTER TABLE lxc_templates ADD COLUMN ip6_mode TEXT NOT NULL DEFAULT 'dhcp'`).run();
    } catch (e) {}
    try {
        db.prepare(`ALTER TABLE lxc_templates ADD COLUMN ip6_addr TEXT NOT NULL DEFAULT ''`).run();
    } catch (e) {}
    try {
        db.prepare(`ALTER TABLE lxc_templates ADD COLUMN ip4_addr TEXT NOT NULL DEFAULT ''`).run();
    } catch (e) {}

    // vm_packages 表
    db.exec(`CREATE TABLE IF NOT EXISTS vm_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        template_id INTEGER NOT NULL DEFAULT 0,
        cores INTEGER NOT NULL DEFAULT 1,
        memory INTEGER NOT NULL DEFAULT 1024,
        disk_size INTEGER NOT NULL DEFAULT 20,
        monthly_price REAL NOT NULL DEFAULT 0,
        quarterly_price REAL NOT NULL DEFAULT 0,
        yearly_price REAL NOT NULL DEFAULT 0,
        stock INTEGER,
        sold_count INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    // lxc_packages 表
    db.exec(`CREATE TABLE IF NOT EXISTS lxc_packages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL DEFAULT '',
        template_id INTEGER NOT NULL DEFAULT 0,
        cores INTEGER NOT NULL DEFAULT 1,
        memory INTEGER NOT NULL DEFAULT 512,
        swap INTEGER NOT NULL DEFAULT 512,
        disk_size INTEGER NOT NULL DEFAULT 8,
        monthly_price REAL NOT NULL DEFAULT 0,
        quarterly_price REAL NOT NULL DEFAULT 0,
        yearly_price REAL NOT NULL DEFAULT 0,
        stock INTEGER,
        sold_count INTEGER NOT NULL DEFAULT 0,
        cpu_model TEXT NOT NULL DEFAULT '',
        bandwidth INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    )`);

    // 初始化默认配置
    initDefaultConfig();

    // 检查并创建默认管理员用户
    createDefaultAdmin();
    
    // 数据库迁移：添加新字段（兼容已有数据库）
    migrateSchema();
}

// 数据库 schema 迁移
function migrateSchema() {
    // 检查并添加 renewal_price 字段
    try {
        db.exec(`ALTER TABLE vms ADD COLUMN renewal_price TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 renewal_price 字段失败:', e.message);
        }
    }
    // 检查并添加 target_user_id 字段
    try {
        db.exec(`ALTER TABLE cdk_codes ADD COLUMN target_user_id INTEGER`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 target_user_id 字段失败:', e.message);
        }
    }
    // 检查并添加 2FA 字段
    try {
        db.exec(`ALTER TABLE users ADD COLUMN totp_secret TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 totp_secret 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE users ADD COLUMN totp_enabled INTEGER DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 totp_enabled 字段失败:', e.message);
        }
    }
    // 检查并添加 VM 备份存储位置字段
    try {
        db.exec(`ALTER TABLE vms ADD COLUMN backup_storage TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 backup_storage 字段失败:', e.message);
        }
    }
    // 检查并添加 backups 表的 type 字段（vm/lxc 区分）
    try {
        db.exec(`ALTER TABLE backups ADD COLUMN type TEXT DEFAULT 'vm'`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 backups.type 字段失败:', e.message);
        }
    }
    // 检查并添加 backups 表的 ct_id 字段
    try {
        db.exec(`ALTER TABLE backups ADD COLUMN ct_id INTEGER`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 backups.ct_id 字段失败:', e.message);
        }
    }
    // 检查并添加 cdk_codes 表的 used_ct_id 字段
    try {
        db.exec(`ALTER TABLE cdk_codes ADD COLUMN used_ct_id INTEGER`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 cdk_codes.used_ct_id 字段失败:', e.message);
        }
    }
    // 修复已有 LXC 备份记录的 ct_id 和 type（修复前 ct_id 为 NULL、type 为 'vm'）
    try {
        const orphaned = db.prepare(`SELECT id, pve_upid FROM backups WHERE vm_id = 0 AND ct_id IS NULL AND type = 'vm'`).all();
        const fixStmt = db.prepare(`UPDATE backups SET ct_id = ?, type = 'lxc' WHERE id = ?`);
        for (const row of orphaned) {
            if (row.pve_upid) {
                // UPID 格式: UPID:node:pid:pstart:starttime:vzdump:CTID:user:
                const parts = row.pve_upid.split(':');
                if (parts.length >= 7 && parts[5] === 'vzdump') {
                    const ctId = parseInt(parts[6]);
                    if (!isNaN(ctId)) {
                        fixStmt.run(ctId, row.id);
                        console.log(`修复备份记录 ID=${row.id}: 设置 ct_id=${ctId}, type='lxc'`);
                    }
                }
            }
        }
    } catch (e) {
        console.error('修复 LXC 备份记录失败:', e.message);
    }

    // 添加 backups 表的 rootfs_storage 字段
    try {
        db.exec(`ALTER TABLE backups ADD COLUMN rootfs_storage TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 backups.rootfs_storage 字段失败:', e.message);
        }
    }

    // 迁移 vms 表 dhcp_static_ip 字段
    try {
        db.exec(`ALTER TABLE vms ADD COLUMN dhcp_static_ip TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vms.dhcp_static_ip 字段失败:', e.message);
        }
    }

    // 迁移 lxc_containers 表 dhcp_static_ip 字段
    try {
        db.exec(`ALTER TABLE lxc_containers ADD COLUMN dhcp_static_ip TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_containers.dhcp_static_ip 字段失败:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE vms ADD COLUMN ikuai_mac_group_id TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vms.ikuai_mac_group_id 字段失败:', e.message);
        }
    }

    try {
        db.exec(`ALTER TABLE lxc_containers ADD COLUMN ikuai_mac_group_id TEXT DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_containers.ikuai_mac_group_id 字段失败:', e.message);
        }
    }

    // 迁移 transaction_records 表 trade_no 字段
    try {
        db.exec(`ALTER TABLE transaction_records ADD COLUMN trade_no TEXT DEFAULT NULL`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 transaction_records.trade_no 字段失败:', e.message);
        }
    }

    // 迁移套餐库存字段
    try {
        db.exec(`ALTER TABLE vm_packages ADD COLUMN stock INTEGER`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vm_packages.stock 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE vm_packages ADD COLUMN sold_count INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vm_packages.sold_count 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE lxc_packages ADD COLUMN stock INTEGER`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_packages.stock 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE lxc_packages ADD COLUMN sold_count INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_packages.sold_count 字段失败:', e.message);
        }
    }

    // 迁移套餐排序字段
    try {
        db.exec(`ALTER TABLE vm_packages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vm_packages.sort_order 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE lxc_packages ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_packages.sort_order 字段失败:', e.message);
        }
    }

    // 迁移 cpu_model 和 bandwidth 字段
    try {
        db.exec(`ALTER TABLE vm_packages ADD COLUMN cpu_model TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vm_packages.cpu_model 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE vm_packages ADD COLUMN bandwidth INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 vm_packages.bandwidth 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE lxc_packages ADD COLUMN cpu_model TEXT NOT NULL DEFAULT ''`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_packages.cpu_model 字段失败:', e.message);
        }
    }
    try {
        db.exec(`ALTER TABLE lxc_packages ADD COLUMN bandwidth INTEGER NOT NULL DEFAULT 0`);
    } catch (e) {
        if (!e.message.includes('duplicate column name')) {
            console.error('迁移 lxc_packages.bandwidth 字段失败:', e.message);
        }
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
    };

    for (const [key, value] of Object.entries(defaultConfigs)) {
        const existing = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
        if (!existing) {
            db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run(key, value);
        }
    }
}

// 创建默认管理员账户
function createDefaultAdmin() {
    const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!adminExists) {
        // C-2R 修复：优先读取环境变量，否则自动生成强随机密码
        const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || generateRandomPassword(16);
        const adminSalt = crypto.randomBytes(16).toString('hex');
        const hashedPassword = CryptoJS.SHA256(adminSalt + defaultAdminPassword).toString();

        db.prepare(`
            INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, must_change_password, password_salt, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run('admin', hashedPassword, 'admin', '', '', '', 0, 1, adminSalt, sqliteNow());

        console.log('================================================');
        console.log('  ⚠ 默认管理员账号已创建（此信息仅显示一次）');
        console.log(`  用户名: admin`);
        console.log(`  密码:   ${defaultAdminPassword}`);
        console.log('  ⚠ 请立即登录并修改密码！');
        console.log('================================================');
    }

    // 兼容旧数据库：添加 must_change_password 字段（如果不存在）
    try {
        db.prepare(`ALTER TABLE users ADD COLUMN must_change_password INTEGER DEFAULT 0`).run();
    } catch (e) {
        // 字段已存在，忽略错误
    }

    // 兼容旧数据库：添加 password_salt 字段（如果不存在）
    try {
        db.prepare(`ALTER TABLE users ADD COLUMN password_salt TEXT DEFAULT ''`).run();
    } catch (e) {
        // 字段已存在，忽略错误
    }

    // 兼容旧数据库：添加 is_active 字段（如果不存在）
    try {
        db.exec("ALTER TABLE users ADD COLUMN is_active INTEGER DEFAULT 1");
    } catch (e) {
        // 字段已存在，忽略错误
    }
}

// 从旧JSON数据库迁移数据
function migrateFromJson() {
    if (!needMigration) return;

    try {
        // 先初始化表格结构
        initDb();
        
        // 清理现有的初始数据（避免冲突）
        db.prepare('DELETE FROM users').run();
        db.prepare('DELETE FROM vms').run();
        db.prepare('DELETE FROM vm_reminders').run();
        db.prepare('DELETE FROM memos').run();
        db.prepare('DELETE FROM password_reset_tokens').run();
        db.prepare('DELETE FROM config').run();
        
        const jsonData = JSON.parse(fs.readFileSync(jsonDbFile, 'utf8'));
        
        console.log('开始迁移数据...');
        
        // 迁移用户
        if (jsonData.users && jsonData.users.length > 0) {
            const insertUser = db.prepare(`
                INSERT INTO users (id, username, password, role, avatar, bio, email, emailVerified, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            for (const user of jsonData.users) {
                insertUser.run(
                    user.id,
                    user.username,
                    user.password,
                    user.role || 'user',
                    user.avatar || '',
                    user.bio || '',
                    user.email || '',
                    user.emailVerified ? 1 : 0,
                    user.created_at || sqliteNow()
                );
            }
            console.log(`迁移了 ${jsonData.users.length} 个用户`);
        }
        
        // 迁移虚拟机
        if (jsonData.vms && jsonData.vms.length > 0) {
            const insertVm = db.prepare(`
                INSERT INTO vms (id, vm_id, user_id, name, expiration_date, reminderSent, lastReminderDate, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `);
            const insertReminder = db.prepare(`
                INSERT INTO vm_reminders (vm_id, days, sent_at)
                VALUES (?, ?, ?)
            `);
            
            for (const vm of jsonData.vms) {
                insertVm.run(
                    vm.id,
                    vm.vm_id,
                    vm.user_id,
                    vm.name || '',
                    vm.expiration_date || null,
                    vm.reminderSent ? 1 : 0,
                    vm.lastReminderDate || '',
                    vm.created_at || sqliteNow()
                );
                
                // 迁移提醒记录
                if (vm.reminders && vm.reminders.length > 0) {
                    for (const days of vm.reminders) {
                        insertReminder.run(vm.id, days, sqliteNow());
                    }
                }
            }
            console.log(`迁移了 ${jsonData.vms.length} 个虚拟机`);
        }
        
        // 迁移备忘录
        if (jsonData.memos && jsonData.memos.length > 0) {
            const insertMemo = db.prepare(`
                INSERT INTO memos (id, user_id, title, content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            for (const memo of jsonData.memos) {
                insertMemo.run(
                    memo.id,
                    memo.user_id,
                    memo.title || '',
                    memo.content || '',
                    memo.created_at || sqliteNow(),
                    memo.updated_at || sqliteNow()
                );
            }
            console.log(`迁移了 ${jsonData.memos.length} 个备忘录`);
        }
        
        // 迁移SMTP配置
        if (jsonData.smtpConfig) {
            const smtp = jsonData.smtpConfig;
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('smtp:host', smtp.host || '');
            setConfig.run('smtp:port', smtp.port?.toString() || '587');
            setConfig.run('smtp:secure', smtp.secure ? '1' : '0');
            setConfig.run('smtp:user', smtp.user || '');
            setConfig.run('smtp:password', smtp.password || '');
            setConfig.run('smtp:from', smtp.from || '');
            setConfig.run('smtp:enabled', smtp.enabled ? '1' : '0');
            console.log('迁移了SMTP配置');
        }
        
        // 迁移提醒配置
        if (jsonData.reminderConfig) {
            const reminder = jsonData.reminderConfig;
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('reminder:days1', reminder.days1?.toString() || '7');
            setConfig.run('reminder:days2', reminder.days2?.toString() || '3');
            setConfig.run('reminder:days3', reminder.days3?.toString() || '1');
            console.log('迁移了提醒配置');
        }
        
        // 迁移密码重置令牌
        if (jsonData.passwordResetTokens && jsonData.passwordResetTokens.length > 0) {
            const insertToken = db.prepare(`
                INSERT INTO password_reset_tokens (user_id, email, token, type, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `);
            for (const token of jsonData.passwordResetTokens) {
                insertToken.run(
                    token.userId,
                    token.email || null,
                    token.token,
                    token.type || 'password_reset',
                    token.expiresAt
                );
            }
            console.log(`迁移了 ${jsonData.passwordResetTokens.length} 个密码重置令牌`);
        }
        
        console.log('数据迁移完成！');
        
        // 重命名旧JSON文件作为备份
        const backupFile = path.join(__dirname, '../../db.json.backup');
        fs.renameSync(jsonDbFile, backupFile);
        console.log(`旧JSON数据库已备份为: ${backupFile}`);
        
    } catch (error) {
        console.error('数据迁移失败:', error);
        throw error;
    }
}

// 如果有旧JSON数据库，先迁移
if (needMigration) {
    migrateFromJson();
} else {
    // 没有旧数据库，正常初始化
    initDb();
}

// 导出数据库操作函数
module.exports = {
    // 数据库连接
    db,

    // 时间工具函数（统一本地时间 YYYY-MM-DD HH:MM:SS）
    now: sqliteNow,
    today: sqliteToday,

    // 用户操作
    users: {
        getAll: () => db.prepare('SELECT * FROM users').all(),
        getById: (id) => db.prepare('SELECT * FROM users WHERE id = ?').get(id),
        getByUsername: (username) => db.prepare('SELECT * FROM users WHERE username = ?').get(username),
        create: (user) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO users (username, password, role, avatar, bio, email, emailVerified, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                user.username,
                user.password,
                user.role || 'user',
                user.avatar || '',
                user.bio || '',
                user.email || '',
                user.emailVerified ? 1 : 0,
                user.created_at || sqliteNow()
            );
            return db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid);
        },
        update: (id, updates) => {
            // M-9 + R3-8 修复：列名白名单防 SQL 注入（列名与实际表结构匹配）
            const allowedColumns = ['username', 'email', 'password', 'password_salt', 'avatar', 'bio', 'role', 'is_active',
                'must_change_password', 'emailVerified', 'balance'];
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
            
            db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM users WHERE id = ?').run(id),
    },
    
    // 虚拟机操作
    vms: {
        getAll: () => db.prepare('SELECT * FROM vms').all(),
        getByUserId: (userId) => db.prepare('SELECT * FROM vms WHERE user_id = ?').all(userId),
        getById: (id) => db.prepare('SELECT * FROM vms WHERE id = ?').get(id),
        create: (vm) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO vms (vm_id, user_id, name, expiration_date, renewal_price, renewal_period, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                vm.vm_id,
                vm.user_id,
                vm.name || '',
                vm.expiration_date || null,
                vm.renewal_price || '',
                vm.renewal_period || 'month',
                sqliteNow()
            );
            return db.prepare('SELECT * FROM vms WHERE id = ?').get(lastInsertRowid);
        },
        update: (id, updates) => {
            // M-9: 列名白名单防 SQL 注入
            const allowedColumns = ['name', 'vm_id', 'user_id', 'username', 'expiration_date',
                'renewal_price', 'renewal_period', 'config', 'status', 'dhcp_static_ip', 'ikuai_mac_group_id', 'backup_storage', 'reminderSent', 'lastReminderDate'];
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

            db.prepare(`UPDATE vms SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            return db.prepare('SELECT * FROM vms WHERE id = ?').get(id);
        },
        delete: (id) => {
            // 先解关联 CDK 引用，再删除虚拟机（避免外键约束冲突）
            db.prepare('UPDATE cdk_codes SET used_vm_id = NULL WHERE used_vm_id = ?').run(id);
            return db.prepare('DELETE FROM vms WHERE id = ?').run(id);
        },
        // 虚拟机提醒记录操作
        reminders: {
            getByVmId: (vmId) => db.prepare('SELECT * FROM vm_reminders WHERE vm_id = ?').all(vmId),
            add: (vmId, days) => {
                db.prepare('INSERT INTO vm_reminders (vm_id, days, sent_at) VALUES (?, ?, ?)').run(
                    vmId,
                    days,
                    sqliteNow()
                );
            },
            clear: (vmId) => db.prepare('DELETE FROM vm_reminders WHERE vm_id = ?').run(vmId),
            countExpiredDays: (vmId) => {
                const result = db.prepare(`
                    SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM vm_reminders 
                    WHERE vm_id = ? AND days = 0
                `).get(vmId);
                return result?.count || 0;
            },
            getTodayExpired: () => {
                const today = sqliteToday();
                return db.prepare(`
                    SELECT vm_id FROM vm_reminders 
                    WHERE days = 0 AND sent_at LIKE ?
                `).all(today + '%');
            },
            getTodayAll: () => {
                const today = sqliteToday();
                return db.prepare(`
                    SELECT * FROM vm_reminders 
                    WHERE sent_at LIKE ?
                `).all(today + '%');
            }
        }
    },
    
    // CDK 兑换码操作
    cdk: {
        getAll: () => db.prepare(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            ORDER BY c.created_at DESC
        `).all(),
        getById: (id) => db.prepare('SELECT * FROM cdk_codes WHERE id = ?').get(id),
        getByCode: (code) => db.prepare('SELECT * FROM cdk_codes WHERE code = ?').get(code),
        getByBatchId: (batchId) => db.prepare(`
            SELECT c.*, creator.username as creator_username, user.username as used_username, v.name as used_vm_name, v.vm_id as used_vm_vmid, target.username as target_username
            FROM cdk_codes c
            LEFT JOIN users creator ON c.created_by = creator.id
            LEFT JOIN users user ON c.used_by = user.id
            LEFT JOIN users target ON c.target_user_id = target.id
            LEFT JOIN vms v ON c.used_vm_id = v.id
            WHERE c.batch_id = ? ORDER BY c.created_at
        `).all(batchId),
        getUnused: () => db.prepare('SELECT * FROM cdk_codes WHERE is_used = 0').all(),
        getUsed: () => db.prepare('SELECT * FROM cdk_codes WHERE is_used = 1').all(),
        create: (cdk) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO cdk_codes (code, duration_days, created_by, target_user_id, created_at, expires_at, batch_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                cdk.code,
                cdk.duration_days,
                cdk.created_by,
                cdk.target_user_id || null,
                cdk.created_at || sqliteNow(),
                cdk.expires_at || null,
                cdk.batch_id || null
            );
            return db.prepare('SELECT * FROM cdk_codes WHERE id = ?').get(lastInsertRowid);
        },
        markAsUsed: (id, userId, vmId, ctId) => {
            let info;
            if (ctId) {
                info = db.prepare(`
                    UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_ct_id = ?, used_at = ?
                    WHERE id = ? AND is_used = 0
                `).run(userId, vmId, ctId, sqliteNow(), id);
            } else {
                info = db.prepare(`
                    UPDATE cdk_codes SET is_used = 1, used_by = ?, used_vm_id = ?, used_at = ?
                    WHERE id = ? AND is_used = 0
                `).run(userId, vmId, sqliteNow(), id);
            }
            return { affected: info.changes, cdk: db.prepare('SELECT * FROM cdk_codes WHERE id = ?').get(id) };
        },
        delete: (id) => db.prepare('DELETE FROM cdk_codes WHERE id = ?').run(id),
        deleteBatch: (ids) => {
            if (!ids || ids.length === 0) return;
            const placeholders = ids.map(() => '?').join(',');
            const stmt = db.prepare(`DELETE FROM cdk_codes WHERE id IN (${placeholders})`);
            stmt.run(...ids);
        },
        deleteExpired: () => {
            return db.prepare(`
                DELETE FROM cdk_codes 
                WHERE is_used = 0 AND expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now')
            `).run();
        },
        deleteExpiredOrUsed: () => {
            return db.prepare(`
                DELETE FROM cdk_codes 
                WHERE is_used = 1 OR (expires_at IS NOT NULL AND datetime(expires_at) <= datetime('now'))
            `).run();
        },
        getActiveCount: () => {
            return db.prepare(`
                SELECT COUNT(*) as count FROM cdk_codes 
                WHERE is_used = 0 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
            `).get();
        }
    },

    // 备忘录操作
    memos: {
        getByUserId: (userId) => db.prepare('SELECT * FROM memos WHERE user_id = ?').all(userId),
        getById: (id) => db.prepare('SELECT * FROM memos WHERE id = ?').get(id),
        create: (memo) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO memos (user_id, title, content, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                memo.user_id,
                memo.title || '',
                memo.content || '',
                sqliteNow(),
                sqliteNow()
            );
            return db.prepare('SELECT * FROM memos WHERE id = ?').get(lastInsertRowid);
        },
        update: (id, updates) => {
            // M-9: 列名白名单防 SQL 注入
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
            values.push(sqliteNow());
            values.push(id);
            
            db.prepare(`UPDATE memos SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            return db.prepare('SELECT * FROM memos WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM memos WHERE id = ?').run(id)
    },
    
    // 密码重置令牌操作
    passwordResetTokens: {
        getAll: () => db.prepare('SELECT * FROM password_reset_tokens').all(),
        getByToken: (token) => db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token),
        create: (tokenData) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO password_reset_tokens (user_id, email, token, type, expires_at)
                VALUES (?, ?, ?, ?, ?)
            `).run(
                tokenData.userId,
                tokenData.email || null,
                tokenData.token,
                tokenData.type || 'password_reset',
                tokenData.expiresAt
            );
            return db.prepare('SELECT * FROM password_reset_tokens WHERE id = ?').get(lastInsertRowid);
        },
        delete: (id) => db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(id),
        deleteByUserId: (userId) => db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(userId),
        deleteByType: (userId, type) => db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ? AND type = ?').run(userId, type)
    },
    
    // 站内消息操作
    messages: {
        create: (data) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO messages (uid, title, content, type, send_type, link_url, link_text, batch_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                data.uid,
                data.title || '',
                data.content || '',
                data.type || 1,
                data.send_type || 1,
                data.link_url || '',
                data.link_text || '',
                data.batch_id || '',
                sqliteNow()
            );
            return db.prepare('SELECT * FROM messages WHERE id = ?').get(lastInsertRowid);
        },
        getByUser: (uid, type, page = 1, pageSize = 20) => {
            const offset = (page - 1) * pageSize;
            let where = '(uid = ? OR uid = 0)';
            const params = [uid];
            if (type && type !== 'all') {
                where += ' AND type = ?';
                params.push(parseInt(type));
            }
            const total = db.prepare(`SELECT COUNT(*) as count FROM messages WHERE ${where}`).get(...params);
            const list = db.prepare(`
                SELECT * FROM messages WHERE ${where}
                ORDER BY is_read ASC, created_at DESC LIMIT ? OFFSET ?
            `).all(...params, pageSize, offset);
            return { list, total: total.count, page, pageSize };
        },
        getById: (id) => db.prepare('SELECT * FROM messages WHERE id = ?').get(id),
        getUnreadCount: (uid) => {
            const result = db.prepare(`
                SELECT COUNT(*) as count FROM messages 
                WHERE (uid = ? OR uid = 0) AND is_read = 0
            `).get(uid);
            return result?.count || 0;
        },
        markRead: (id) => db.prepare('UPDATE messages SET is_read = 1 WHERE id = ?').run(id),
        markAllRead: (uid) => db.prepare(`
            UPDATE messages SET is_read = 1 WHERE (uid = ? OR uid = 0) AND is_read = 0
        `).run(uid),
        delete: (id, uid) => db.prepare('DELETE FROM messages WHERE id = ? AND (uid = ? OR uid = 0)').run(id, uid),
        deleteAll: (uid) => db.prepare('DELETE FROM messages WHERE (uid = ? OR uid = 0) AND is_read = 1').run(uid),
        getStats: () => {
            const total = db.prepare('SELECT COUNT(*) as count FROM messages').get();
            const unread = db.prepare('SELECT COUNT(*) as count FROM messages WHERE is_read = 0').get();
            const byType = db.prepare(`
                SELECT type, COUNT(*) as count FROM messages GROUP BY type
            `).all();
            return { total: total.count, unread: unread.count, byType };
        }
    },
    
    // 配置操作
    config: {
        getSmtp: () => ({
            host: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:host')?.value || '',
            port: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:port')?.value || '587'),
            secure: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:secure')?.value === '1',
            user: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:user')?.value || '',
            password: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:password')?.value || '',
            from: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:from')?.value || '',
            from_name: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:from_name')?.value || '',
            enabled: db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:enabled')?.value === '1'
        }),
        setSmtp: (smtpConfig) => {
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('smtp:host', smtpConfig.host ?? '');
            setConfig.run('smtp:port', String(smtpConfig.port ?? 587));
            setConfig.run('smtp:secure', smtpConfig.secure ? '1' : '0');
            setConfig.run('smtp:user', smtpConfig.user ?? '');
            setConfig.run('smtp:password', smtpConfig.password !== undefined ? smtpConfig.password : 
                (db.prepare('SELECT value FROM config WHERE key = ?').get('smtp:password')?.value || ''));
            setConfig.run('smtp:from', smtpConfig.from ?? '');
            setConfig.run('smtp:from_name', smtpConfig.from_name ?? '');
            setConfig.run('smtp:enabled', smtpConfig.enabled ? '1' : '0');
        },
        getReminder: () => ({
            days1: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('reminder:days1')?.value) || 7,
            days2: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('reminder:days2')?.value) || 3,
            days3: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('reminder:days3')?.value) || 1
        }),
        setReminder: (reminderConfig) => {
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('reminder:days1', String(reminderConfig.days1 ?? 7));
            setConfig.run('reminder:days2', String(reminderConfig.days2 ?? 3));
            setConfig.run('reminder:days3', String(reminderConfig.days3 ?? 1));
        },
        // 简单的键值存储接口
        get: (key) => db.prepare('SELECT value FROM config WHERE key = ?').get(key)?.value,
        set: (key, value) => db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value)
    },
    
    // 刷新令牌操作
    refreshTokens: {
        create: (data) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO refresh_tokens (user_id, token, device_name, ip, user_agent, created_at, expires_at, revoked)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0)
            `).run(
                data.user_id,
                data.token,
                data.device_name || '',
                data.ip || '',
                data.user_agent || '',
                data.created_at || sqliteNow(),
                data.expires_at
            );
            return db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(lastInsertRowid);
        },
        getByToken: (token) => db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token),
        getById: (id) => db.prepare('SELECT * FROM refresh_tokens WHERE id = ?').get(id),
        getByUserId: (userId) => db.prepare(`
            SELECT * FROM refresh_tokens WHERE user_id = ? AND revoked = 0 AND expires_at > datetime('now')
            ORDER BY created_at DESC
        `).all(userId),
        revoke: (id) => db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?').run(id),
        deleteByToken: (token) => db.prepare('DELETE FROM refresh_tokens WHERE token = ?').run(token),
        revokeByUserId: (userId, excludeId) => {
            if (excludeId) {
                db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND id != ?').run(userId, excludeId);
            } else {
                db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ?').run(userId);
            }
        },
        revokeByUserAndDevice: (userId, deviceName) => {
            db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND device_name = ? AND revoked = 0')
              .run(userId, deviceName);
        },
        cleanup: () => db.prepare('DELETE FROM refresh_tokens WHERE expires_at <= datetime("now") OR revoked = 1').run()
    },

    // 快照配置操作
    snapshotConfig: {
        get: () => ({
            max_per_vm: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('snapshot:max_per_vm')?.value) || 5,
            daily_create_limit: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('snapshot:daily_create_limit')?.value) || 20,
            daily_restore_limit: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('snapshot:daily_restore_limit')?.value) || 10
        }),
        set: (cfg) => {
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('snapshot:max_per_vm', String(cfg.max_per_vm ?? 5));
            setConfig.run('snapshot:daily_create_limit', String(cfg.daily_create_limit ?? 20));
            setConfig.run('snapshot:daily_restore_limit', String(cfg.daily_restore_limit ?? 10));
        }
    },

    // 快照日志操作
    snapshotLogs: {
        add: (userId, vmId, action) => {
            db.prepare('INSERT INTO snapshot_logs (user_id, vm_id, action, created_at) VALUES (?, ?, ?, ?)').run(
                userId, vmId, action, sqliteNow()
            );
        },
        getDailyCount: (userId, action) => {
            const today = sqliteToday();
            const result = db.prepare(`
                SELECT COUNT(*) as count FROM snapshot_logs
                WHERE user_id = ? AND action = ? AND created_at >= ?
            `).get(userId, action, today);
            return result?.count || 0;
        }
    },

    // 2FA 操作
    twofa: {
        getSecret: (userId) => db.prepare('SELECT totp_secret FROM users WHERE id = ?').get(userId)?.totp_secret || '',
        setSecret: (userId, secret) => db.prepare('UPDATE users SET totp_secret = ? WHERE id = ?').run(secret, userId),
        isEnabled: (userId) => {
            const row = db.prepare('SELECT totp_enabled FROM users WHERE id = ?').get(userId);
            return row ? row.totp_enabled === 1 : false;
        },
        enable: (userId) => db.prepare('UPDATE users SET totp_enabled = 1 WHERE id = ?').run(userId),
        disable: (userId) => db.prepare('UPDATE users SET totp_enabled = 0, totp_secret = \'\' WHERE id = ?').run(userId),
        // 恢复码
        getRecoveryCodes: (userId) => db.prepare('SELECT id, code, used, created_at FROM recovery_codes WHERE user_id = ? ORDER BY id').all(userId),
        getUnusedRecoveryCodes: (userId) => db.prepare('SELECT code FROM recovery_codes WHERE user_id = ? AND used = 0').all(userId),
        addRecoveryCodes: (userId, codes) => {
            const stmt = db.prepare('INSERT INTO recovery_codes (user_id, code) VALUES (?, ?)');
            const insertAll = db.transaction((codes) => {
                for (const code of codes) {
                    stmt.run(userId, code);
                }
            });
            insertAll(codes);
        },
        markRecoveryCodeUsed: (code) => db.prepare('UPDATE recovery_codes SET used = 1 WHERE code = ? AND used = 0').run(code),
        deleteRecoveryCodes: (userId) => db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(userId),
        getUnusedRecoveryCodeCount: (userId) => {
            const result = db.prepare('SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used = 0').get(userId);
            return result?.count || 0;
        }
    },

    // 备份配置操作
    backupConfig: {
        get: () => ({
            default_storage: db.prepare('SELECT value FROM config WHERE key = ?').get('backup:default_storage')?.value || 'local',
            max_per_vm: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('backup:max_per_vm')?.value) || 3,
            daily_limit: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('backup:daily_limit')?.value) || 3
        }),
        set: (cfg) => {
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('backup:default_storage', cfg.default_storage ?? 'local');
            setConfig.run('backup:max_per_vm', String(cfg.max_per_vm ?? 3));
            setConfig.run('backup:daily_limit', String(cfg.daily_limit ?? 3));
        }
    },

    // 备份操作
    backups: {
        create: (data) => {
            const result = db.prepare(`INSERT INTO backups (vm_id, ct_id, user_id, storage, notes, type, rootfs_storage, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`).run(
                data.vm_id, data.ct_id || null, data.user_id, data.storage, data.notes || '', data.type || 'vm', data.rootfs_storage || ''
            );
            return { id: result.lastInsertRowid };
        },
        getById: (id) => db.prepare('SELECT * FROM backups WHERE id = ?').get(id),
        getByVmId: (vmId) => db.prepare('SELECT * FROM backups WHERE vm_id = ? ORDER BY created_at DESC').all(vmId),
        getByStatus: (status) => db.prepare('SELECT * FROM backups WHERE status = ?').all(status),
        getByUserAndDate: (userId, date) => db.prepare(`SELECT COUNT(*) as count FROM backups WHERE user_id = ? AND created_at >= ?`).get(userId, date)?.count || 0,
        getCountByVmId: (vmId, userId) => {
            if (userId) {
                return db.prepare(`SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND user_id = ? AND status != 'failed'`).get(vmId, userId)?.count || 0;
            }
            return db.prepare(`SELECT COUNT(*) as count FROM backups WHERE vm_id = ? AND status != 'failed'`).get(vmId)?.count || 0;
        },
        updateProgress: (id, progress, pveUpid) => db.prepare('UPDATE backups SET progress = ?, pve_upid = ?, status = \'running\' WHERE id = ?').run(progress, pveUpid, id),
        complete: (id, filename, size) => db.prepare(`UPDATE backups SET status = 'completed', progress = 100, filename = ?, size = ?, completed_at = datetime('now','localtime') WHERE id = ?`).run(filename, size || 0, id),
        fail: (id, errorMsg) => db.prepare(`UPDATE backups SET status = 'failed', error_msg = ?, completed_at = datetime('now','localtime') WHERE id = ?`).run(errorMsg, id),
        delete: (id) => db.prepare('DELETE FROM backups WHERE id = ?').run(id),
        deleteBatch: (ids) => {
            const placeholders = ids.map(() => '?').join(',');
            db.prepare(`DELETE FROM backups WHERE id IN (${placeholders})`).run(...ids);
        },
        getRunningBackups: () => db.prepare(`SELECT * FROM backups WHERE status = 'running' OR status = 'pending'`).all(),
        getByCtId: (ctId) => db.prepare("SELECT * FROM backups WHERE ct_id = ? AND type = 'lxc' ORDER BY created_at DESC").all(ctId),
        getCountByCtId: (ctId, userId) => {
            if (userId) {
                return db.prepare(`SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND user_id = ? AND type = 'lxc' AND status != 'failed'`).get(ctId, userId)?.count || 0;
            }
            return db.prepare(`SELECT COUNT(*) as count FROM backups WHERE ct_id = ? AND type = 'lxc' AND status != 'failed'`).get(ctId)?.count || 0;
        }
    },

    // 备份日志操作
    backupLogs: {
        add: (userId, vmId, action) => db.prepare('INSERT INTO backup_logs (user_id, vm_id, action) VALUES (?, ?, ?)').run(userId, vmId, action),
        getDailyCount: (userId) => {
            const today = sqliteToday();
            const result = db.prepare(`SELECT COUNT(*) as count FROM backup_logs WHERE user_id = ? AND action = 'create' AND created_at >= ?`).get(userId, today);
            return result?.count || 0;
        }
    },

    // 恢复任务操作
    restoreTasks: {
        create: (data) => {
            const result = db.prepare(`INSERT INTO restore_tasks (vm_id, user_id, backup_id, pve_upid, status) VALUES (?, ?, ?, ?, 'pending')`).run(
                data.vm_id, data.user_id, data.backup_id, data.pve_upid || ''
            );
            return { id: result.lastInsertRowid };
        },
        getById: (id) => db.prepare('SELECT * FROM restore_tasks WHERE id = ?').get(id),
        getByVmId: (vmId) => db.prepare('SELECT * FROM restore_tasks WHERE vm_id = ? ORDER BY created_at DESC').all(vmId),
        getRunning: () => db.prepare(`SELECT * FROM restore_tasks WHERE status = 'running' OR status = 'pending'`).all(),
        getRunningByVmId: (vmId) => db.prepare(`SELECT * FROM restore_tasks WHERE vm_id = ? AND (status = 'running' OR status = 'pending')`).all(vmId),
        updateProgress: (id, progress, pveUpid) => db.prepare(`UPDATE restore_tasks SET progress = ?, pve_upid = ?, status = 'running' WHERE id = ?`).run(progress, pveUpid, id),
        complete: (id) => db.prepare(`UPDATE restore_tasks SET status = 'completed', progress = 100, completed_at = datetime('now','localtime') WHERE id = ?`).run(id),
        fail: (id, errorMsg) => db.prepare(`UPDATE restore_tasks SET status = 'failed', error_msg = ?, completed_at = datetime('now','localtime') WHERE id = ?`).run(errorMsg, id),
        deleteByBackupId: (backupId) => db.prepare('DELETE FROM restore_tasks WHERE backup_id = ?').run(backupId),
    },

    // LXC 配置操作
    lxcConfig: {
        get: () => ({
            max_per_vm: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:max_per_vm')?.value) || 3,
            default_storage: db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:default_storage')?.value || 'local',
            default_memory: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:default_memory')?.value) || 512,
            default_cores: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:default_cores')?.value) || 1,
            default_disk: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:default_disk')?.value) || 8,
            default_swap: parseInt(db.prepare('SELECT value FROM config WHERE key = ?').get('lxc:default_swap')?.value) || 512
        }),
        set: (cfg) => {
            const setConfig = db.prepare('REPLACE INTO config (key, value) VALUES (?, ?)');
            setConfig.run('lxc:max_per_vm', String(cfg.max_per_vm ?? 3));
            setConfig.run('lxc:default_storage', cfg.default_storage ?? 'local');
            setConfig.run('lxc:default_memory', String(cfg.default_memory ?? 512));
            setConfig.run('lxc:default_cores', String(cfg.default_cores ?? 1));
            setConfig.run('lxc:default_disk', String(cfg.default_disk ?? 8));
            setConfig.run('lxc:default_swap', String(cfg.default_swap ?? 512));
        }
    },

    // LXC 容器操作
    lxcContainers: {
        getAll: () => db.prepare('SELECT * FROM lxc_containers').all(),
        getByUserId: (userId) => db.prepare('SELECT * FROM lxc_containers WHERE user_id = ?').all(userId),
        getById: (id) => db.prepare('SELECT * FROM lxc_containers WHERE id = ?').get(id),
        getByCtId: (ctId) => db.prepare('SELECT * FROM lxc_containers WHERE ct_id = ?').all(ctId),
        create: (ct) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO lxc_containers (ct_id, user_id, name, expiration_date, renewal_price, renewal_period, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
                ct.ct_id,
                ct.user_id,
                ct.name || '',
                ct.expiration_date || null,
                ct.renewal_price || '',
                ct.renewal_period || 'month',
                sqliteNow()
            );
            return db.prepare('SELECT * FROM lxc_containers WHERE id = ?').get(lastInsertRowid);
        },
        update: (id, updates) => {
            // M-9: 列名白名单防 SQL 注入
            const allowedColumns = ['name', 'ct_id', 'user_id', 'username', 'expiration_date',
                'renewal_price', 'renewal_period', 'config', 'status', 'dhcp_static_ip', 'ikuai_mac_group_id', 'reminderSent', 'lastReminderDate'];
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

            db.prepare(`UPDATE lxc_containers SET ${fields.join(', ')} WHERE id = ?`).run(...values);
            return db.prepare('SELECT * FROM lxc_containers WHERE id = ?').get(id);
        },
        delete: (id) => {
            // 先解关联 CDK 引用，再删除容器
            db.prepare('UPDATE cdk_codes SET used_ct_id = NULL WHERE used_ct_id = ?').run(id);
            return db.prepare('DELETE FROM lxc_containers WHERE id = ?').run(id);
        },
        // LXC 容器提醒记录操作
        reminders: {
            getByCtId: (ctId) => db.prepare('SELECT * FROM lxc_reminders WHERE ct_id = ?').all(ctId),
            add: (ctId, days) => {
                db.prepare('INSERT INTO lxc_reminders (ct_id, days, sent_at) VALUES (?, ?, ?)').run(
                    ctId,
                    days,
                    sqliteNow()
                );
            },
            clear: (ctId) => db.prepare('DELETE FROM lxc_reminders WHERE ct_id = ?').run(ctId),
            countExpiredDays: (ctId) => {
                const result = db.prepare(`
                    SELECT COUNT(DISTINCT DATE(sent_at)) as count FROM lxc_reminders 
                    WHERE ct_id = ? AND days = 0
                `).get(ctId);
                return result?.count || 0;
            },
            getTodayExpired: () => {
                const today = sqliteToday();
                return db.prepare(`
                    SELECT ct_id FROM lxc_reminders 
                    WHERE days = 0 AND sent_at LIKE ?
                `).all(today + '%');
            },
            getTodayAll: () => {
                const today = sqliteToday();
                return db.prepare(`
                    SELECT * FROM lxc_reminders 
                    WHERE sent_at LIKE ?
                `).all(today + '%');
            }
        }
    },

    // 端口转发操作
    portForwards: {
        getAll: () => db.prepare('SELECT * FROM port_forwards ORDER BY created_at DESC').all(),
        getByType: (type) => db.prepare('SELECT * FROM port_forwards WHERE type = ? ORDER BY created_at DESC').all(type),
        getById: (id) => db.prepare('SELECT * FROM port_forwards WHERE id = ?').get(id),
        getByUserId: (userId) => {
            const userVms = db.prepare('SELECT vm_id FROM vms WHERE user_id = ?').all(userId);
            const userCts = db.prepare('SELECT ct_id FROM lxc_containers WHERE user_id = ?').all(userId);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let rules = [];
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                rules = rules.concat(db.prepare(`SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`).all(...vmIds));
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                rules = rules.concat(db.prepare(`SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`).all(...ctIds));
            }
            return rules.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        },
        getByVmId: (vmId) => db.prepare("SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC").all(vmId),
        getByCtId: (ctId) => db.prepare("SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC").all(ctId),
        getByDeviceId: (type, deviceId) => {
            if (type === 'vm') return db.prepare("SELECT * FROM port_forwards WHERE type = 'vm' AND vm_id = ? ORDER BY created_at DESC").all(deviceId);
            return db.prepare("SELECT * FROM port_forwards WHERE type = 'lxc' AND ct_id = ? ORDER BY created_at DESC").all(deviceId);
        },
        getCountByUserId: (userId) => {
            const userVms = db.prepare('SELECT vm_id FROM vms WHERE user_id = ?').all(userId);
            const userCts = db.prepare('SELECT ct_id FROM lxc_containers WHERE user_id = ?').all(userId);
            const vmIds = userVms.map(v => v.vm_id);
            const ctIds = userCts.map(c => c.ct_id);
            let count = 0;
            if (vmIds.length > 0) {
                const placeholders = vmIds.map(() => '?').join(',');
                const r = db.prepare(`SELECT COUNT(*) as c FROM port_forwards WHERE type = 'vm' AND vm_id IN (${placeholders})`).get(...vmIds);
                count += r?.c || 0;
            }
            if (ctIds.length > 0) {
                const placeholders = ctIds.map(() => '?').join(',');
                const r = db.prepare(`SELECT COUNT(*) as c FROM port_forwards WHERE type = 'lxc' AND ct_id IN (${placeholders})`).get(...ctIds);
                count += r?.c || 0;
            }
            return count;
        },
        create: (data) => {
            const result = db.prepare(`
                INSERT INTO port_forwards (type, vm_id, ct_id, name, ip, mac, internal_port, external_port, protocol, enabled, source, sync_status, ikuai_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
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
                sqliteNow(),
                sqliteNow()
            );
            return db.prepare('SELECT * FROM port_forwards WHERE id = ?').get(result.lastInsertRowid);
        },
        update: (id, data) => {
            // M-9 修复：列名白名单
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
            values.push(sqliteNow(), id);
            db.prepare(`UPDATE port_forwards SET ${fields.join(', ')}, updated_at = ? WHERE id = ?`).run(...values);
            return db.prepare('SELECT * FROM port_forwards WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM port_forwards WHERE id = ?').run(id),
        deleteByDevice: (type, deviceId) => {
            if (type === 'vm') return db.prepare("DELETE FROM port_forwards WHERE type = 'vm' AND vm_id = ?").run(deviceId);
            return db.prepare("DELETE FROM port_forwards WHERE type = 'lxc' AND ct_id = ?").run(deviceId);
        },
        getUsedPorts: () => {
            return db.prepare('SELECT external_port, type, vm_id, ct_id, ip, internal_port, protocol FROM port_forwards').all();
        },
        getByExternalPort: (port) => db.prepare('SELECT * FROM port_forwards WHERE external_port = ?').all(port),
    },

    // 交易记录操作
    transactionRecords: {
        create: (record) => {
            const { lastInsertRowid } = db.prepare(`
                INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                record.user_id, record.order_no, record.pay_time || null, record.pay_method || '',
                record.trade_type || 'recharge', record.amount || '0.00',
                record.period || null, record.period_count || null,
                record.balance_before || '0.00', record.balance_after || '0.00',
                record.resource_type || null, record.resource_id || null,
                record.trade_no || null, record.api_trade_no || null,
                sqliteNow()
            );
            return db.prepare('SELECT * FROM transaction_records WHERE id = ?').get(lastInsertRowid);
        },
        getAll: (params) => {
            var sql = 'SELECT * FROM transaction_records WHERE 1=1';
            var args = [];
            if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
            if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
            if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
            if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
            if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
            if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
            sql += ' ORDER BY created_at DESC';
            if (params.limit) { sql += ' LIMIT ?'; args.push(params.limit); }
            if (params.offset) { sql += ' OFFSET ?'; args.push(params.offset); }
            return db.prepare(sql).all(...args);
        },
        countAll: (params) => {
            var sql = 'SELECT COUNT(*) as total FROM transaction_records WHERE 1=1';
            var args = [];
            if (params.user_id) { sql += ' AND user_id = ?'; args.push(params.user_id); }
            if (params.trade_type) { sql += ' AND trade_type = ?'; args.push(params.trade_type); }
            if (params.pay_method) { sql += ' AND pay_method = ?'; args.push(params.pay_method); }
            if (params.order_no) { sql += ' AND order_no = ?'; args.push(params.order_no); }
            if (params.start_time) { sql += ' AND pay_time >= ?'; args.push(params.start_time); }
            if (params.end_time) { sql += ' AND pay_time <= ?'; args.push(params.end_time); }
            return db.prepare(sql).get(...args)?.total || 0;
        },
        getByUserId: (userId, params) => {
            return db.transactionRecords.getAll(Object.assign({}, params, { user_id: userId }));
        },
        getByOrderNo: (orderNo) => {
            return db.prepare('SELECT * FROM transaction_records WHERE order_no = ?').get(orderNo);
        }
    },

    // 订单操作
    orders: {
        create: (data) => {
            const stmt = db.prepare(`INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (@order_no, @user_id, @type, @package_id, @template_id, @period, @period_count, @amount, @cores, @memory, @disk_size, @resource_name, @resource_id, @status)`);
            const info = stmt.run({
                order_no: data.order_no, user_id: data.user_id, type: data.type || 'vm',
                package_id: data.package_id, template_id: data.template_id || 0,
                period: data.period || 'month', period_count: data.period_count || 1,
                amount: data.amount || '0.00', cores: data.cores || 0, memory: data.memory || 0,
                disk_size: data.disk_size || 0, resource_name: data.resource_name || '',
                resource_id: data.resource_id || '', status: data.status || 'completed'
            });
            return db.prepare('SELECT * FROM orders WHERE id = ?').get(info.lastInsertRowid);
        },
        getByUser: (userId) => db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(userId),
        getAll: (params) => {
            var page = params.page || 1;
            var limit = params.limit || 20;
            var offset = (page - 1) * limit;
            var where = [];
            var args = [];
            if (params.order_no) { where.push('o.order_no = ?'); args.push(params.order_no); }
            if (params.type) { where.push('o.type = ?'); args.push(params.type); }
            if (params.status) { where.push('o.status = ?'); args.push(params.status); }
            if (params.start_time) { where.push('o.created_at >= ?'); args.push(params.start_time); }
            if (params.end_time) { where.push('o.created_at <= ?'); args.push(params.end_time); }
            var whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
            var countArgs = args.slice();
            var total = db.prepare('SELECT COUNT(*) as total FROM orders o ' + whereClause).get(...countArgs).total;
            args.push(limit, offset);
            var rows = db.prepare(`
                SELECT o.*, u.username,
                    COALESCE(vp.name, lxp.name, '') as package_name
                FROM orders o
                LEFT JOIN users u ON o.user_id = u.id
                LEFT JOIN vm_packages vp ON o.type = 'vm' AND o.package_id = vp.id
                LEFT JOIN lxc_packages lxp ON o.type = 'lxc' AND o.package_id = lxp.id
                ${whereClause}
                ORDER BY o.id DESC LIMIT ? OFFSET ?
            `).all(...args);
            return { rows, total, page, limit };
        },
        getByOrderNo: (orderNo) => db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo),
    },

    // VM 模板操作
    vmTemplates: {
        getAll: () => db.prepare('SELECT * FROM vm_templates ORDER BY id DESC').all(),
        getById: (id) => db.prepare('SELECT * FROM vm_templates WHERE id = ?').get(id),
        create: (data) => {
            const stmt = db.prepare(`INSERT INTO vm_templates (name, template_vmid, cores, memory, disk_size, network_bridge, network_model, os_type, ciuser, target_storage, clone_mode, cpu_affinity, mac_group_id, description, status) VALUES (@name, @template_vmid, @cores, @memory, @disk_size, @network_bridge, @network_model, @os_type, @ciuser, @target_storage, @clone_mode, @cpu_affinity, @mac_group_id, @description, @status)`);
            const info = stmt.run({
                name: data.name || '', template_vmid: data.template_vmid || 0, cores: data.cores || 1,
                memory: data.memory || 1024, disk_size: data.disk_size || 20,
                network_bridge: data.network_bridge || 'vmbr0', network_model: data.network_model || 'virtio',
                os_type: data.os_type || '',
                ciuser: data.ciuser || '',
                target_storage: data.target_storage || 'local-lvm',
                clone_mode: data.clone_mode || 'full',
                cpu_affinity: data.cpu_affinity || '',
                mac_group_id: data.mac_group_id || '',
                description: data.description || '', status: data.status || 'active'
            });
            return db.prepare('SELECT * FROM vm_templates WHERE id = ?').get(info.lastInsertRowid);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'template_vmid', 'cores', 'memory', 'disk_size', 'network_bridge', 'network_model', 'os_type', 'ciuser', 'target_storage', 'clone_mode', 'cpu_affinity', 'mac_group_id', 'description', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            updates.updated_at = sqliteNow();
            const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
            const stmt = db.prepare(`UPDATE vm_templates SET ${fields} WHERE id = @id`);
            stmt.run({ ...updates, id });
            return db.prepare('SELECT * FROM vm_templates WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM vm_templates WHERE id = ?').run(id)
    },

    // LXC 模板操作
    lxcTemplates: {
        getAll: () => db.prepare('SELECT * FROM lxc_templates ORDER BY id DESC').all(),
        getById: (id) => db.prepare('SELECT * FROM lxc_templates WHERE id = ?').get(id),
        create: (data) => {
            const stmt = db.prepare(`INSERT INTO lxc_templates (name, ostemplate, storage, rootfs_storage, cores, memory, swap, disk_size, network_bridge, network_mode, ipv6_enabled, ip6_mode, ip6_addr, ip4_addr, unprivileged, features, mac_group_id, description, status) VALUES (@name, @ostemplate, @storage, @rootfs_storage, @cores, @memory, @swap, @disk_size, @network_bridge, @network_mode, @ipv6_enabled, @ip6_mode, @ip6_addr, @ip4_addr, @unprivileged, @features, @mac_group_id, @description, @status)`);
            const info = stmt.run({
                name: data.name || '', ostemplate: data.ostemplate || '', storage: data.storage || 'local',
                rootfs_storage: data.rootfs_storage || 'local-lvm',
                cores: data.cores || 1, memory: data.memory || 512, swap: data.swap || 512,
                disk_size: data.disk_size || 8, network_bridge: data.network_bridge || 'vmbr0',
                network_mode: data.network_mode || 'dhcp',
                ipv6_enabled: data.ipv6_enabled !== undefined ? data.ipv6_enabled : 1,
                ip6_mode: data.ip6_mode || 'dhcp', ip6_addr: data.ip6_addr || '', ip4_addr: data.ip4_addr || '',
                unprivileged: data.unprivileged !== undefined ? data.unprivileged : 1,
                features: data.features || '', mac_group_id: data.mac_group_id || '',
                description: data.description || '', status: data.status || 'active'
            });
            return db.prepare('SELECT * FROM lxc_templates WHERE id = ?').get(info.lastInsertRowid);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'ostemplate', 'storage', 'cores', 'memory', 'swap', 'disk_size', 'network_bridge', 'network_mode', 'ipv6_enabled', 'ip6_mode', 'ip6_addr', 'ip4_addr', 'unprivileged', 'features', 'description', 'rootfs_storage', 'mac_group_id', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            updates.updated_at = sqliteNow();
            const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
            const stmt = db.prepare(`UPDATE lxc_templates SET ${fields} WHERE id = @id`);
            stmt.run({ ...updates, id });
            return db.prepare('SELECT * FROM lxc_templates WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM lxc_templates WHERE id = ?').run(id)
    },

    // VM 套餐操作
    vmPackages: {
        getAll: () => db.prepare('SELECT p.*, t.name as template_name FROM vm_packages p LEFT JOIN vm_templates t ON p.template_id = t.id ORDER BY p.sort_order ASC, p.id DESC').all(),
        getById: (id) => db.prepare('SELECT p.*, t.name as template_name FROM vm_packages p LEFT JOIN vm_templates t ON p.template_id = t.id WHERE p.id = ?').get(id),
        create: (data) => {
            const stmt = db.prepare(`INSERT INTO vm_packages (name, template_id, cores, memory, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status) VALUES (@name, @template_id, @cores, @memory, @disk_size, @monthly_price, @quarterly_price, @yearly_price, @stock, @sort_order, @cpu_model, @bandwidth, @description, @status)`);
            const info = stmt.run({
                name: data.name || '', template_id: data.template_id || 0, cores: data.cores || 1,
                memory: data.memory || 1024, disk_size: data.disk_size || 20,
                monthly_price: data.monthly_price || 0, quarterly_price: data.quarterly_price || 0,
                yearly_price: data.yearly_price || 0, stock: data.stock || null, sort_order: data.sort_order || 0, cpu_model: data.cpu_model || '', bandwidth: data.bandwidth || 0, description: data.description || '', status: data.status || 'active'
            });
            return db.prepare('SELECT * FROM vm_packages WHERE id = ?').get(info.lastInsertRowid);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            updates.updated_at = sqliteNow();
            const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
            const stmt = db.prepare(`UPDATE vm_packages SET ${fields} WHERE id = @id`);
            stmt.run({ ...updates, id });
            return db.prepare('SELECT * FROM vm_packages WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM vm_packages WHERE id = ?').run(id)
    },

    // LXC 套餐操作
    lxcPackages: {
        getAll: () => db.prepare('SELECT p.*, t.name as template_name FROM lxc_packages p LEFT JOIN lxc_templates t ON p.template_id = t.id ORDER BY p.sort_order ASC, p.id DESC').all(),
        getById: (id) => db.prepare('SELECT p.*, t.name as template_name FROM lxc_packages p LEFT JOIN lxc_templates t ON p.template_id = t.id WHERE p.id = ?').get(id),
        create: (data) => {
            const stmt = db.prepare(`INSERT INTO lxc_packages (name, template_id, cores, memory, swap, disk_size, monthly_price, quarterly_price, yearly_price, stock, sort_order, cpu_model, bandwidth, description, status) VALUES (@name, @template_id, @cores, @memory, @swap, @disk_size, @monthly_price, @quarterly_price, @yearly_price, @stock, @sort_order, @cpu_model, @bandwidth, @description, @status)`);
            const info = stmt.run({
                name: data.name || '', template_id: data.template_id || 0, cores: data.cores || 1,
                memory: data.memory || 512, swap: data.swap || 512, disk_size: data.disk_size || 8,
                monthly_price: data.monthly_price || 0, quarterly_price: data.quarterly_price || 0,
                yearly_price: data.yearly_price || 0, stock: data.stock || null, sort_order: data.sort_order || 0, cpu_model: data.cpu_model || '', bandwidth: data.bandwidth || 0, description: data.description || '', status: data.status || 'active'
            });
            return db.prepare('SELECT * FROM lxc_packages WHERE id = ?').get(info.lastInsertRowid);
        },
        update: (id, updates) => {
            const allowedColumns = ['name', 'template_id', 'cores', 'memory', 'swap', 'disk_size', 'monthly_price', 'quarterly_price', 'yearly_price', 'stock', 'sold_count', 'sort_order', 'cpu_model', 'bandwidth', 'description', 'status'];
            for (const key of Object.keys(updates)) {
                if (!allowedColumns.includes(key)) delete updates[key];
            }
            updates.updated_at = sqliteNow();
            const fields = Object.keys(updates).map(k => `${k} = @${k}`).join(', ');
            const stmt = db.prepare(`UPDATE lxc_packages SET ${fields} WHERE id = @id`);
            stmt.run({ ...updates, id });
            return db.prepare('SELECT * FROM lxc_packages WHERE id = ?').get(id);
        },
        delete: (id) => db.prepare('DELETE FROM lxc_packages WHERE id = ?').run(id)
    },
};
