const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 用户操作
const users = {
    getAll: () => queryAll('SELECT * FROM users ORDER BY id ASC'),
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
    // V4-02 修复：原子条件扣款（防并发读-改-写 TOCTOU 双花）
    // 余额不足时 affectedRows = 0，由调用方抛"余额不足"并回滚事务
    decrementBalance: async (id, amount) => execute(
        'UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ? AND balance >= ?',
        [amount, id, amount]
    ),
};

// 密码重置令牌操作
const passwordResetTokens = {
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
};

// 2FA 操作
const twofa = {
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
};

// 用户通知设置
const userSettings = {
    // 默认通知设置（全部开启）
    DEFAULTS: {
        email_notifications_enabled: 1,
        notify_vm_provisioned: 1,
        notify_lxc_provisioned: 1,
        notify_account_password: 1,
        notify_vm_refund: 1,
        notify_lxc_refund: 1,
        notify_disk_purchase: 1,
        notify_disk_resize: 1,
        notify_disk_renewal: 1,
        notify_disk_refund: 1,
        notify_disk_destroy_refund: 1,
        notify_recharge: 1,
        notify_renewal: 1,
        notify_expiry_reminder: 1,
        notify_expiry_alert: 1,
        notify_backup_result: 1
    },
    // 允许更新的字段白名单
    ALLOWED_FIELDS: [
        'email_notifications_enabled',
        'notify_vm_provisioned', 'notify_lxc_provisioned', 'notify_account_password',
        'notify_vm_refund', 'notify_lxc_refund',
        'notify_disk_purchase', 'notify_disk_resize', 'notify_disk_renewal',
        'notify_disk_refund', 'notify_disk_destroy_refund',
        'notify_recharge', 'notify_renewal',
        'notify_expiry_reminder', 'notify_expiry_alert',
        'notify_backup_result'
    ],
    getByUserId: async (userId) => {
        var row = await queryOne('SELECT * FROM user_settings WHERE user_id = ?', [parseInt(userId)]);
        if (!row) {
            // 不存在则返回默认值
            return Object.assign({ user_id: parseInt(userId) }, userSettings.DEFAULTS);
        }
        return row;
    },
    getField: async (userId, fieldName) => {
        if (!userSettings.ALLOWED_FIELDS.includes(fieldName)) return 1;
        var row = await queryOne('SELECT `' + fieldName + '` FROM user_settings WHERE user_id = ?', [parseInt(userId)]);
        if (!row) return 1; // 默认开启
        return row[fieldName] !== undefined ? row[fieldName] : 1;
    },
    upsert: async (userId, fields) => {
        // 白名单过滤
        var safeFields = {};
        for (var key of Object.keys(fields)) {
            if (userSettings.ALLOWED_FIELDS.includes(key)) {
                // 值校验：只能是 0 或 1
                safeFields[key] = fields[key] ? 1 : 0;
            }
        }
        if (Object.keys(safeFields).length === 0) return userSettings.getByUserId(userId);

        var existing = await queryOne('SELECT id FROM user_settings WHERE user_id = ?', [parseInt(userId)]);
        if (existing) {
            // UPDATE
            var setClauses = [];
            var values = [];
            for (var [k, v] of Object.entries(safeFields)) {
                setClauses.push('`' + k + '` = ?');
                values.push(v);
            }
            setClauses.push('updated_at = ?');
            values.push(mysqlNow());
            values.push(parseInt(userId));
            await execute('UPDATE user_settings SET ' + setClauses.join(', ') + ' WHERE user_id = ?', values);
        } else {
            // INSERT
            var columns = ['user_id'];
            var placeholders = ['?'];
            var insertValues = [parseInt(userId)];
            for (var [k2, v2] of Object.entries(safeFields)) {
                columns.push('`' + k2 + '`');
                placeholders.push('?');
                insertValues.push(v2);
            }
            await execute('INSERT INTO user_settings (' + columns.join(', ') + ') VALUES (' + placeholders.join(', ') + ')', insertValues);
        }
        return userSettings.getByUserId(userId);
    }
};

module.exports = { users, passwordResetTokens, twofa, userSettings };
