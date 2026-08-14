const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// 配置操作
const config = {
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
            // V4-03 修复：SMTP 密码 AES 加密存储，读取时解密（decrypt 对存量明文自动透传）
            password: require('../utils/crypto-utils').decrypt(map['smtp:password'] || ''),
            from: map['smtp:from'] || '',
            from_name: map['smtp:from_name'] || '',
            enabled: map['smtp:enabled'] === '1'
        };
    },
    setSmtp: async (smtpConfig) => {
        const currentPassword = (await queryOne('SELECT value FROM config WHERE `key` = ?', ['smtp:password']))?.value || '';
        // V4-03 修复：SMTP 密码 AES 加密存储，掩码值跳过（保留旧值）
        var smtpPassword = smtpConfig.password;
        var storedSmtpPassword = currentPassword;
        if (smtpPassword !== undefined && !require('../utils/crypto-utils').isMasked(smtpPassword)) {
            storedSmtpPassword = require('../utils/crypto-utils').encrypt(String(smtpPassword).trim());
        }
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:host', smtpConfig.host ?? '']);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:port', String(smtpConfig.port ?? 587)]);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:secure', smtpConfig.secure ? '1' : '0']);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:user', smtpConfig.user ?? '']);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['smtp:password', storedSmtpPassword]);
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
        const current = await config.getPve();
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
    // 爱快路由器配置（面板在线管理；.env 仅作首次迁移种子，迁移后即清空）
    getIkuai: async () => {
        const keys = ['ikuai:host', 'ikuai:username', 'ikuai:password', 'ikuai:strict_tls'];
        const placeholders = keys.map(() => '?').join(',');
        const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        const { decrypt } = require('../utils/crypto-utils');
        return {
            host: map['ikuai:host'] || '',
            username: map['ikuai:username'] || '',
            password: decrypt(map['ikuai:password'] || ''),
            strict_tls: map['ikuai:strict_tls'] === '1'
        };
    },
    setIkuai: async (ikuaiConfig) => {
        const { encrypt, isMasked } = require('../utils/crypto-utils');
        const current = await config.getIkuai();
        // 加密敏感字段，脱敏值跳过（保留旧值）
        var password = ikuaiConfig.password;
        if (password !== undefined && !isMasked(password)) {
            password = encrypt(String(password).trim());
        } else {
            password = encrypt(current.password); // 保留旧值（重新加密）
        }
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ikuai:host', ikuaiConfig.host ?? '']);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ikuai:username', ikuaiConfig.username ?? '']);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ikuai:password', password]);
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ikuai:strict_tls', ikuaiConfig.strict_tls ? '1' : '0']);
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
    set: (key, value) => execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', [key, value]),

    // ========== 邮件外壳样式（邮件样式编辑） ==========
    // 键规则：mail:shell_<key>，参数定义与默认值单一来源 constants/email-templates.js 的 EMAIL_SHELL_PARAMS
    getEmailShell: async () => {
        const { EMAIL_SHELL_PARAMS } = require('../constants/email-templates');
        const keys = EMAIL_SHELL_PARAMS.map(p => 'mail:shell_' + p.key);
        const placeholders = keys.map(() => '?').join(',');
        const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        const shell = {};
        EMAIL_SHELL_PARAMS.forEach(p => {
            const raw = map['mail:shell_' + p.key];
            const def = p.default;
            if (p.type === 'number') {
                shell[p.key] = raw !== undefined && raw !== '' ? parseInt(raw) : def;
            } else {
                shell[p.key] = raw !== undefined && raw !== '' ? raw : def;
            }
        });
        return shell;
    },
    setEmailShell: async (shell) => {
        const { EMAIL_SHELL_PARAMS } = require('../constants/email-templates');
        for (const p of EMAIL_SHELL_PARAMS) {
            const val = shell[p.key];
            if (val === undefined || val === null) continue;
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['mail:shell_' + p.key, String(val)]);
        }
    },

    // ========== 限速配置（安全防护·限速设置） ==========
    // 键规则：ratelimit:master_enabled（总开关）+ ratelimit:<ruleKey>:enabled/max/window，
    // 规则白名单与默认值单一来源 server/constants.js 的 RATE_LIMIT_RULES
    getRateLimits: async () => {
        const { RATE_LIMIT_RULES } = require('../constants');
        const keys = ['ratelimit:master_enabled'];
        Object.keys(RATE_LIMIT_RULES).forEach(ruleKey => {
            keys.push('ratelimit:' + ruleKey + ':enabled', 'ratelimit:' + ruleKey + ':max', 'ratelimit:' + ruleKey + ':window');
        });
        const placeholders = keys.map(() => '?').join(',');
        const rows = await queryAll('SELECT `key`, value FROM config WHERE `key` IN (' + placeholders + ')', keys);
        const map = {};
        rows.forEach(r => { map[r.key] = r.value; });
        const rules = {};
        Object.keys(RATE_LIMIT_RULES).forEach(ruleKey => {
            const rule = RATE_LIMIT_RULES[ruleKey];
            rules[ruleKey] = {
                enabled: map['ratelimit:' + ruleKey + ':enabled'] !== '0',
                max: parseInt(map['ratelimit:' + ruleKey + ':max']) || rule.max,
                windowSec: parseInt(map['ratelimit:' + ruleKey + ':window']) || rule.windowSec
            };
        });
        return {
            master_enabled: map['ratelimit:master_enabled'] !== '0',
            rules
        };
    },
    setRateLimits: async (payload) => {
        const { RATE_LIMIT_RULES } = require('../constants');
        // 白名单兜底：未知 ruleKey 一律跳过（路由层已校验，这里防绕过）
        await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ratelimit:master_enabled', payload.master_enabled ? '1' : '0']);
        for (const ruleKey of Object.keys(payload.rules || {})) {
            if (!RATE_LIMIT_RULES[ruleKey]) continue;
            const rule = payload.rules[ruleKey];
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ratelimit:' + ruleKey + ':enabled', rule.enabled ? '1' : '0']);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ratelimit:' + ruleKey + ':max', String(rule.max)]);
            await execute('REPLACE INTO config (`key`, value) VALUES (?, ?)', ['ratelimit:' + ruleKey + ':window', String(rule.windowSec)]);
        }
    }
};

// 刷新令牌操作
const refreshTokens = {
    create: async (data) => {
        const [result] = await execute(
            `INSERT INTO refresh_tokens (user_id, token, device_name, ip, user_agent, created_at, expires_at, revoked, remember, session_deadline, last_active_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
            [
                data.user_id,
                data.token,
                data.device_name || '',
                data.ip || '',
                data.user_agent || '',
                data.created_at || mysqlNow(),
                data.expires_at,
                data.remember ? 1 : 0,
                data.session_deadline || null,
                data.last_active_at || null
            ]
        );
        return queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [result.insertId]);
    },
    getByToken: (token) => queryOne('SELECT * FROM refresh_tokens WHERE token = ?', [token]),
    getById: (id) => queryOne('SELECT * FROM refresh_tokens WHERE id = ?', [id]),
    // 更新最后活跃时间（authMiddleware 节流调用；只写活跃时间，不触碰其他字段）
    // 注意：mysqlNow() 是 JS 函数，必须在 JS 侧调用后作为参数传入，不能写进 SQL（MySQL 无此存储函数）
    touchActivity: (id) => execute('UPDATE refresh_tokens SET last_active_at = ? WHERE id = ?', [mysqlNow(), id]),
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
};

// LXC 配置操作
const lxcConfig = {
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
};

module.exports = { config, refreshTokens, lxcConfig };
