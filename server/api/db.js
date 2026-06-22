/**
 * 数据库模块（MySQL 唯一驱动）
 *
 * 所有路由/中间件/服务文件统一 require('./api/db') 即可。
 * initDb() 由 server.js 在启动时调用 await db.initDb() 完成建表和迁移。
 */

console.log('[数据库] 当前使用: mysql');

module.exports = require('./db-mysql');
