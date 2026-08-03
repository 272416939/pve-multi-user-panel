/**
 * 修复脏数据脚本：refresh_tokens 的 created_at / expires_at 时区偏差（+8 小时）
 *
 * 问题：auth.js 登录/刷新 token 时用 new Date().toISOString()（UTC 墙钟时间）写入
 * MySQL DATETIME，而项目其他时间均按 Asia/Shanghai 本地时间写入、前端 formatDate
 * 按本地时间解析显示，导致"登录设备管理"页显示的登录时间慢 8 小时，
 * 且 expires_at > NOW() 判定使 token 提前 8 小时过期。
 *
 * 用法：
 *   node scripts/fix-refresh-token-timezone.js          # 仅查询不修改（dry-run）
 *   node scripts/fix-refresh-token-timezone.js --apply  # 实际修复
 */
require('dotenv').config();
const db = require('../server/api/db');

(async () => {
  await db.initDb();
  const pool = db.getPool();
  const applyMode = process.argv.includes('--apply');

  console.log('=== 修复 refresh_tokens 时区偏差（UTC 墙钟 → Asia/Shanghai 本地时间）===');
  console.log('模式:', applyMode ? 'APPLY (实际修复)' : 'DRY-RUN (仅查询)');

  const [rows] = await pool.execute(
    'SELECT id, device_name, created_at, expires_at FROM refresh_tokens WHERE revoked = 0'
  );

  if (rows.length === 0) {
    console.log('无未撤销记录，无需修复');
    process.exit(0);
  }

  console.log('待修正记录:', rows.length);
  rows.forEach(r => {
    console.log(`  #${r.id} [${r.device_name}] created_at=${r.created_at} expires_at=${r.expires_at}`);
  });

  if (!applyMode) {
    console.log('DRY-RUN：未做任何修改。确认无误后加 --apply 执行。');
    process.exit(0);
  }

  const [result] = await pool.execute(
    `UPDATE refresh_tokens
       SET created_at = DATE_ADD(created_at, INTERVAL 8 HOUR),
           expires_at = DATE_ADD(expires_at, INTERVAL 8 HOUR)
     WHERE revoked = 0`
  );
  console.log('已修正行数:', result.affectedRows);

  // 验证
  const [after] = await pool.execute(
    'SELECT id, device_name, created_at, expires_at FROM refresh_tokens WHERE revoked = 0'
  );
  console.log('=== 修正后 ===');
  after.forEach(r => {
    console.log(`  #${r.id} [${r.device_name}] created_at=${r.created_at} expires_at=${r.expires_at}`);
  });
  process.exit(0);
})().catch(e => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
