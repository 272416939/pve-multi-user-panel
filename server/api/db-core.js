const mysql = require('mysql2/promise');

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
// 连接池预热：启动时调用一次，提前建立第一条连接。
// mysql2 连接池按需建连，远程库的 TCP 握手 + 认证可达数秒，
// 若不做预热，服务器启动后首个用户请求会全额承担该延迟
async function ping() {
    await getPool().query('SELECT 1');
    return true;
}

module.exports = {
    getPool,
    mysqlNow,
    mysqlToday,
    sanitizeParams,
    execute,
    queryOne,
    queryAll,
    ping,
};
