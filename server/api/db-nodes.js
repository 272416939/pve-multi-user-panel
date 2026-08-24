const { execute, queryOne, queryAll, mysqlNow } = require('./db-core');

// ========== 区域管理域数据访问（地域 regions / 可用区 zones / PVE 节点 pve_nodes / 爱快节点 ikuai_nodes）==========
// 敏感字段（password/api_key/api_token/ssh_password）AES 加密存储：
// - 列表查询不取密文列，仅返回 has_xxx 布尔标记（避免解密开销与意外泄漏）
// - 单条 get 返回解密后的完整行（路由层负责 maskSecret 掩码回显）

// 默认节点解析缓存（getDefault* 每请求都会被工厂/shim 调用，走 30s 内存缓存）
const _defaultCache = { pve: { id: null, at: 0 }, ikuai: { id: null, at: 0 } };
const DEFAULT_CACHE_TTL = 30 * 1000;

function clearDefaultCache() {
    _defaultCache.pve.at = 0;
    _defaultCache.ikuai.at = 0;
}

// ---------- 地域 ----------
const regions = {
    list: () => queryAll('SELECT * FROM regions ORDER BY sort_order DESC, id ASC'),
    get: (id) => queryOne('SELECT * FROM regions WHERE id = ?', [id]),
    getByName: (name) => queryOne('SELECT * FROM regions WHERE name = ?', [name]),
    create: async ({ name, remark, sort_order }) => {
        const [result] = await execute(
            'INSERT INTO regions (name, remark, sort_order) VALUES (?, ?, ?)',
            [name, remark || '', sort_order || 0]
        );
        return result.insertId;
    },
    update: (id, { name, remark, sort_order }) => execute(
        'UPDATE regions SET name = ?, remark = ?, sort_order = ? WHERE id = ?',
        [name, remark || '', sort_order || 0, id]
    ),
    remove: (id) => execute('DELETE FROM regions WHERE id = ?', [id]),
};

// ---------- 可用区 ----------
const zones = {
    list: () => queryAll(
        `SELECT z.*, r.name AS region_name
         FROM zones z LEFT JOIN regions r ON z.region_id = r.id
         ORDER BY r.sort_order DESC, r.id ASC, z.sort_order DESC, z.id ASC`),
    getByRegion: (regionId) => queryAll('SELECT * FROM zones WHERE region_id = ? ORDER BY sort_order DESC, id ASC', [regionId]),
    get: (id) => queryOne('SELECT * FROM zones WHERE id = ?', [id]),
    getByNameInRegion: (regionId, name) => queryOne('SELECT * FROM zones WHERE region_id = ? AND name = ?', [regionId, name]),
    create: async ({ region_id, name, remark, sort_order }) => {
        const [result] = await execute(
            'INSERT INTO zones (region_id, name, remark, sort_order) VALUES (?, ?, ?, ?)',
            [region_id, name, remark || '', sort_order || 0]
        );
        return result.insertId;
    },
    update: (id, { region_id, name, remark, sort_order }) => execute(
        'UPDATE zones SET region_id = ?, name = ?, remark = ?, sort_order = ? WHERE id = ?',
        [region_id, name, remark || '', sort_order || 0, id]
    ),
    remove: (id) => execute('DELETE FROM zones WHERE id = ?', [id]),
};

// ---------- 爱快节点 ----------
const IKUAI_SECRET_FIELDS = ['password', 'api_key'];

function ikuaiListFields() {
    // 列表不取密文列，用布尔标记替代
    return [
        'id', 'name', 'version', 'host', 'username', 'strict_tls', 'enabled',
        'latency_ms', 'last_check_at', 'last_ok_at', 'last_error', 'sort_order', 'created_at',
        "(password IS NOT NULL AND password != '') AS has_password",
        "(api_key IS NOT NULL AND api_key != '') AS has_api_key"
    ].join(', ');
}

const ikuaNodes = {
    list: () => queryAll(`SELECT ${ikuaiListFields()} FROM ikuai_nodes ORDER BY sort_order DESC, id ASC`),
    get: async (id) => {
        const row = await queryOne('SELECT * FROM ikuai_nodes WHERE id = ?', [id]);
        if (row) {
            const { decrypt } = require('../utils/crypto-utils');
            row.password = decrypt(row.password || '');
            row.api_key = decrypt(row.api_key || '');
        }
        return row;
    },
    // 默认节点（过渡 shim 与工厂兜底）：enabled 优先，sort_order 大者优先，其次 id 小者
    getDefaultId: async () => {
        const c = _defaultCache.ikuai;
        if (c.at && Date.now() - c.at < DEFAULT_CACHE_TTL) return c.id;
        const row = await queryOne(
            'SELECT id FROM ikuai_nodes ORDER BY enabled DESC, sort_order DESC, id ASC LIMIT 1');
        c.id = row ? row.id : null;
        c.at = Date.now();
        return c.id;
    },
    getDefault: async () => {
        const id = await ikuaNodes.getDefaultId();
        return id ? ikuaNodes.get(id) : null;
    },
    create: async (n) => {
        const { encrypt } = require('../utils/crypto-utils');
        const [result] = await execute(
            `INSERT INTO ikuai_nodes (name, version, host, username, password, api_key, strict_tls, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                n.name,
                n.version === 'v4' ? 'v4' : 'v3',
                n.host || '',
                n.username || '',
                n.password ? encrypt(String(n.password).trim()) : '',
                n.api_key ? encrypt(String(n.api_key).trim()) : '',
                n.strict_tls ? 1 : 0,
                n.enabled === false ? 0 : 1,
                n.sort_order || 0
            ]
        );
        clearDefaultCache();
        return result.insertId;
    },
    update: async (id, n) => {
        const { encrypt, isMasked } = require('../utils/crypto-utils');
        const current = await ikuaNodes.get(id);
        if (!current) return 0;
        // 掩码值/空值保留旧密码（重新加密写回），与 smtp/pve 同模式
        var password = current.password;
        if (n.password !== undefined && !isMasked(n.password)) {
            password = String(n.password).trim();
        }
        var apiKey = current.api_key;
        if (n.api_key !== undefined && !isMasked(n.api_key)) {
            apiKey = String(n.api_key).trim();
        }
        const rows = await execute(
            `UPDATE ikuai_nodes SET name = ?, version = ?, host = ?, username = ?, password = ?, api_key = ?,
             strict_tls = ?, enabled = ?, sort_order = ? WHERE id = ?`,
            [
                n.name ?? current.name,
                n.version === 'v4' ? 'v4' : 'v3',
                n.host ?? current.host,
                n.username ?? current.username,
                password ? encrypt(password) : '',
                apiKey ? encrypt(apiKey) : '',
                (n.strict_tls ?? current.strict_tls) ? 1 : 0,
                (n.enabled ?? current.enabled) ? 1 : 0,
                n.sort_order ?? current.sort_order,
                id
            ]
        );
        clearDefaultCache();
        return rows.affectedRows ?? 1;
    },
    remove: (id) => {
        clearDefaultCache();
        return execute('DELETE FROM ikuai_nodes WHERE id = ?', [id]);
    },
    // 连接探测结果回写（定时任务/手动测试共用）
    updateProbe: (id, { latency_ms, ok, error }) => execute(
        'UPDATE ikuai_nodes SET latency_ms = ?, last_check_at = NOW(), last_ok_at = ?, last_error = ? WHERE id = ?',
        [latency_ms ?? null, ok ? mysqlNow() : null, error || '', id]
    ),
    // 引用计数（删除资产检测）：配对的 PVE 节点 / 私有子网 / 端口转发
    countReferences: async (id) => ({
        pveNodes: (await queryOne('SELECT COUNT(*) AS c FROM pve_nodes WHERE ikuai_node_id = ?', [id])).c,
        subnets: (await queryOne('SELECT COUNT(*) AS c FROM subnets WHERE ikuai_node_id = ?', [id])).c,
        portForwards: (await queryOne('SELECT COUNT(*) AS c FROM port_forwards WHERE ikuai_node_id = ?', [id])).c
    })
};

// ---------- PVE 节点 ----------
function pveListFields() {
    return [
        'n.id', 'n.name', 'n.zone_id', 'n.ikuai_node_id', 'n.api_host', 'n.ssh_host', 'n.ssh_port',
        'n.ssh_user', 'n.strict_tls', 'n.backup_storage', 'n.enabled',
        'n.latency_ms', 'n.last_check_at', 'n.last_ok_at', 'n.last_error', 'n.sort_order', 'n.created_at',
        "(n.api_token IS NOT NULL AND n.api_token != '') AS has_api_token",
        "(n.ssh_password IS NOT NULL AND n.ssh_password != '') AS has_ssh_password",
        'z.name AS zone_name', 'r.name AS region_name', 'z.region_id',
        'ik.name AS ikuai_name', 'ik.version AS ikuai_version'
    ].join(', ');
}

const pveNodes = {
    list: () => queryAll(
        `SELECT ${pveListFields()}
         FROM pve_nodes n
         LEFT JOIN zones z ON n.zone_id = z.id
         LEFT JOIN regions r ON z.region_id = r.id
         LEFT JOIN ikuai_nodes ik ON n.ikuai_node_id = ik.id
         ORDER BY n.sort_order DESC, n.id ASC`),
    get: async (id) => {
        const row = await queryOne('SELECT * FROM pve_nodes WHERE id = ?', [id]);
        if (row) {
            const { decrypt } = require('../utils/crypto-utils');
            row.api_token = decrypt(row.api_token || '');
            row.ssh_password = decrypt(row.ssh_password || '');
        }
        return row;
    },
    getDefaultId: async () => {
        const c = _defaultCache.pve;
        if (c.at && Date.now() - c.at < DEFAULT_CACHE_TTL) return c.id;
        const row = await queryOne(
            'SELECT id FROM pve_nodes ORDER BY enabled DESC, sort_order DESC, id ASC LIMIT 1');
        c.id = row ? row.id : null;
        c.at = Date.now();
        return c.id;
    },
    getDefault: async () => {
        const id = await pveNodes.getDefaultId();
        return id ? pveNodes.get(id) : null;
    },
    create: async (n) => {
        const { encrypt } = require('../utils/crypto-utils');
        const [result] = await execute(
            `INSERT INTO pve_nodes (name, zone_id, ikuai_node_id, api_host, api_token, ssh_host, ssh_port, ssh_user,
             ssh_password, strict_tls, backup_storage, enabled, sort_order)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                n.name,
                n.zone_id,
                n.ikuai_node_id || null,
                n.api_host || '',
                n.api_token ? encrypt(String(n.api_token).trim()) : '',
                n.ssh_host || '',
                n.ssh_port || 22,
                n.ssh_user || 'root',
                n.ssh_password ? encrypt(String(n.ssh_password).trim()) : '',
                n.strict_tls ? 1 : 0,
                n.backup_storage || 'local',
                n.enabled === false ? 0 : 1,
                n.sort_order || 0
            ]
        );
        clearDefaultCache();
        return result.insertId;
    },
    update: async (id, n) => {
        const { encrypt, isMasked } = require('../utils/crypto-utils');
        const current = await pveNodes.get(id);
        if (!current) return 0;
        var apiToken = current.api_token;
        if (n.api_token !== undefined && !isMasked(n.api_token)) {
            apiToken = String(n.api_token).trim();
        }
        var sshPassword = current.ssh_password;
        if (n.ssh_password !== undefined && !isMasked(n.ssh_password)) {
            sshPassword = String(n.ssh_password).trim();
        }
        const rows = await execute(
            `UPDATE pve_nodes SET name = ?, zone_id = ?, ikuai_node_id = ?, api_host = ?, api_token = ?,
             ssh_host = ?, ssh_port = ?, ssh_user = ?, ssh_password = ?, strict_tls = ?, backup_storage = ?,
             enabled = ?, sort_order = ? WHERE id = ?`,
            [
                n.name ?? current.name,
                n.zone_id ?? current.zone_id,
                n.ikuai_node_id !== undefined ? (n.ikuai_node_id || null) : current.ikuai_node_id,
                n.api_host ?? current.api_host,
                apiToken ? encrypt(apiToken) : '',
                n.ssh_host ?? current.ssh_host,
                n.ssh_port ?? current.ssh_port,
                n.ssh_user ?? current.ssh_user,
                sshPassword ? encrypt(sshPassword) : '',
                (n.strict_tls ?? current.strict_tls) ? 1 : 0,
                n.backup_storage ?? current.backup_storage,
                (n.enabled ?? current.enabled) ? 1 : 0,
                n.sort_order ?? current.sort_order,
                id
            ]
        );
        clearDefaultCache();
        return rows.affectedRows ?? 1;
    },
    remove: (id) => {
        clearDefaultCache();
        return execute('DELETE FROM pve_nodes WHERE id = ?', [id]);
    },
    updateProbe: (id, { latency_ms, ok, error }) => execute(
        'UPDATE pve_nodes SET latency_ms = ?, last_check_at = NOW(), last_ok_at = ?, last_error = ? WHERE id = ?',
        [latency_ms ?? null, ok ? mysqlNow() : null, error || '', id]
    ),
    // 引用计数（删除资产检测）
    countReferences: async (id) => ({
        vms: (await queryOne('SELECT COUNT(*) AS c FROM vms WHERE pve_node_id = ?', [id])).c,
        lxcs: (await queryOne('SELECT COUNT(*) AS c FROM lxc_containers WHERE pve_node_id = ?', [id])).c,
        disks: (await queryOne("SELECT COUNT(*) AS c FROM disks WHERE pve_node_id = ? AND status != 'destroyed'", [id])).c,
        backups: (await queryOne('SELECT COUNT(*) AS c FROM backups WHERE pve_node_id = ?', [id])).c,
        vmPackages: (await queryOne('SELECT COUNT(*) AS c FROM vm_packages WHERE pve_node_id = ?', [id])).c,
        lxcPackages: (await queryOne('SELECT COUNT(*) AS c FROM lxc_packages WHERE pve_node_id = ?', [id])).c,
        vmTemplates: (await queryOne('SELECT COUNT(*) AS c FROM vm_templates WHERE pve_node_id = ?', [id])).c,
        lxcTemplates: (await queryOne('SELECT COUNT(*) AS c FROM lxc_templates WHERE pve_node_id = ?', [id])).c,
        osTemplates: (await queryOne('SELECT COUNT(*) AS c FROM os_templates WHERE pve_node_id = ?', [id])).c,
        diskSpecs: (await queryOne('SELECT COUNT(*) AS c FROM disk_specs WHERE pve_node_id = ?', [id])).c
    })
};

// ---------- 区域/可用区资产概览（后台管理页展示绑定关系） ----------
const overviews = {
    // 地域列表 + 各自绑定的可用区/PVE节点/爱快/套餐/实例计数
    regionsOverview: () => queryAll(
        `SELECT r.*,
            (SELECT COUNT(*) FROM zones z WHERE z.region_id = r.id) AS zone_count,
            (SELECT COUNT(*) FROM pve_nodes n JOIN zones z ON n.zone_id = z.id WHERE z.region_id = r.id) AS pve_node_count,
            (SELECT COUNT(DISTINCT n.ikuai_node_id) FROM pve_nodes n JOIN zones z ON n.zone_id = z.id
                WHERE z.region_id = r.id AND n.ikuai_node_id IS NOT NULL) AS ikuai_node_count,
            (SELECT COUNT(*) FROM vm_packages p JOIN pve_nodes n ON p.pve_node_id = n.id
                JOIN zones z ON n.zone_id = z.id WHERE z.region_id = r.id) +
            (SELECT COUNT(*) FROM lxc_packages p JOIN pve_nodes n ON p.pve_node_id = n.id
                JOIN zones z ON n.zone_id = z.id WHERE z.region_id = r.id) AS package_count,
            (SELECT COUNT(*) FROM vms v JOIN pve_nodes n ON v.pve_node_id = n.id
                JOIN zones z ON n.zone_id = z.id WHERE z.region_id = r.id) +
            (SELECT COUNT(*) FROM lxc_containers c JOIN pve_nodes n ON c.pve_node_id = n.id
                JOIN zones z ON n.zone_id = z.id WHERE z.region_id = r.id) AS instance_count
         FROM regions r
         ORDER BY r.sort_order DESC, r.id ASC`),
    // 可用区列表 + 各自绑定的 PVE节点/爱快(去重)/套餐/实例计数
    zonesOverview: () => queryAll(
        `SELECT z.*, r.name AS region_name,
            (SELECT COUNT(*) FROM pve_nodes n WHERE n.zone_id = z.id) AS pve_node_count,
            (SELECT COUNT(DISTINCT n.ikuai_node_id) FROM pve_nodes n
                WHERE n.zone_id = z.id AND n.ikuai_node_id IS NOT NULL) AS ikuai_node_count,
            (SELECT COUNT(*) FROM vm_packages p JOIN pve_nodes n ON p.pve_node_id = n.id WHERE n.zone_id = z.id) +
            (SELECT COUNT(*) FROM lxc_packages p JOIN pve_nodes n ON p.pve_node_id = n.id WHERE n.zone_id = z.id) AS package_count,
            (SELECT COUNT(*) FROM vms v JOIN pve_nodes n ON v.pve_node_id = n.id WHERE n.zone_id = z.id) +
            (SELECT COUNT(*) FROM lxc_containers c JOIN pve_nodes n ON c.pve_node_id = n.id WHERE n.zone_id = z.id) AS instance_count
         FROM zones z LEFT JOIN regions r ON z.region_id = r.id
         ORDER BY r.sort_order DESC, r.id ASC, z.sort_order DESC, z.id ASC`)
};

module.exports = { regions, zones, ikuaNodes, pveNodes, overviews, clearDefaultCache };
