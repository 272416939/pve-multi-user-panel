/**
 * 数据库工厂模块
 * 根据 .env 中 DB_TYPE 配置加载对应数据库驱动：
 *   - sqlite (默认): better-sqlite3，本地文件数据库
 *   - mysql: mysql2/promise，远程 MySQL 5.7+ 连接池
 *
 * 所有路由/中间件/服务文件统一 require('./api/db') 即可，
 * 无需关心底层使用哪种数据库。
 */

const dbType = (process.env.DB_TYPE || 'sqlite').toLowerCase();

let dbInstance;

if (dbType === 'mysql') {
    console.log('[数据库] 当前使用: mysql');
    dbInstance = require('./db-mysql');
    dbInstance.initDb(); // 同步调用
} else {
    console.log('[数据库] 当前使用: sqlite');
    dbInstance = require('./db-sqlite');
}

module.exports = dbInstance;
