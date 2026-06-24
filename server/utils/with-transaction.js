/**
 * 数据库事务封装工具
 * 基于 mysql2/promise 连接池，提供原子性事务操作
 * 使用方式：
 *   const result = await withTransaction(async (conn) => {
 *       await conn.execute('UPDATE users SET balance = balance - ? WHERE id = ?', [amount, userId]);
 *       await conn.execute('INSERT INTO orders ...', [...]);
 *       return { success: true };
 *   });
 */
const db = require('../api/db');

/**
 * 在事务中执行一组数据库操作
 * @param {Function} fn - 接收 conn 参数的 async 函数，返回业务结果
 * @returns {Promise<any>} fn 的返回值
 * @throws {Error} 事务失败时回滚并抛出原始错误
 */
async function withTransaction(fn) {
    const pool = db.getPool();
    const conn = await pool.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (err) {
        try {
            await conn.rollback();
        } catch (rollbackErr) {
            console.error('[withTransaction] rollback failed:', rollbackErr.message);
        }
        throw err;
    } finally {
        conn.release();
    }
}

module.exports = { withTransaction };
