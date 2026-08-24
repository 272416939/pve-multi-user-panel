const { execute, queryOne, queryAll, mysqlNow, mysqlToday } = require('./db-core');

// 快照配置操作
const snapshotConfig = {
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
};

// 快照日志操作
const snapshotLogs = {
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
};

// 备份配置操作
const backupConfig = {
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
};

// 备份操作
const backups = {
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO backups (vm_id, ct_id, user_id, storage, notes, type, rootfs_storage, pve_node_id, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [data.vm_id, data.ct_id || null, data.user_id, data.storage, data.notes || '', data.type || 'vm', data.rootfs_storage || '', data.pve_node_id || null]
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
    // 进行中备份 - 按 VM（type='vm'）
    getRunningByVmId: (vmId) => queryAll(
        "SELECT * FROM backups WHERE vm_id = ? AND type = 'vm' AND (status = 'running' OR status = 'pending')",
        [vmId]
    ),
    // 进行中备份 - 按容器（type='lxc'）
    getRunningByCtId: (ctId) => queryAll(
        "SELECT * FROM backups WHERE ct_id = ? AND type = 'lxc' AND (status = 'running' OR status = 'pending')",
        [ctId]
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
};

// 备份日志操作
const backupLogs = {
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
};

// 恢复任务操作
const restoreTasks = {
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
};

module.exports = { snapshotConfig, snapshotLogs, backupConfig, backups, backupLogs, restoreTasks };
