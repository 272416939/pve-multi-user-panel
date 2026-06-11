/**
 * 数据库工厂模块
 * 根据 .env 中 DB_TYPE 配置加载对应数据库驱动：
 *   - sqlite (默认): better-sqlite3，本地文件数据库（同步 API）
 *   - mysql: mysql2/promise，远程 MySQL 5.7+ 连接池（异步 API）
 *
 * 所有路由/中间件/服务文件统一 require('./api/db') 即可，
 * 无需关心底层使用哪种数据库。
 *
 * 调用方统一使用 await 调用 db 方法：
 *   const users = await db.users.getAll();
 * （SQLite 模式下 await 同步值无性能开销）
 */

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let dbInstance;

if (dbType === 'mysql') {
    console.log('[数据库] 当前使用: mysql');
    dbInstance = require('./db-mysql');
    // MySQL initDb 是异步的，由 server.js 在启动时调用 await db.initDb()
} else {
    console.log('[数据库] 当前使用: sqlite');
    dbInstance = require('./db-sqlite');
    // SQLite initDb 是同步的，立即执行
    dbInstance.initDb();
}

module.exports = dbInstance;
