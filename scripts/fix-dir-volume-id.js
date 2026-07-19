/**
 * 修复脏数据脚本：补全 DIR 存储磁盘的 volume_id 子路径
 *
 * 问题：之前 createDisk 的 stdout 解析逻辑有 bug，DIR 存储返回的 volume_id
 * 缺少子路径（hdd5:vm-9999-disk-8225.raw），正确格式应为
 * hdd5:9999/vm-9999-disk-8225.raw（含 <vmid>/ 子路径）
 *
 * 用法：
 *   node scripts/fix-dir-volume-id.js          # 仅查询不修改（dry-run）
 *   node scripts/fix-dir-volume-id.js --apply  # 实际修复
 */
require('dotenv').config();
const db = require('../server/api/db');

(async () => {
  await db.initDb();
  const pool = db.getPool();
  const applyMode = process.argv.includes('--apply');

  console.log('=== 修复 DIR 存储 volume_id 脏数据 ===');
  console.log('模式:', applyMode ? 'APPLY (实际修复)' : 'DRY-RUN (仅查询)');

  // 查找所有带扩展名但缺子路径的磁盘记录
  // 脏数据特征：volume_id 形如 storage:vm-9999-disk-xxx.raw（volName 不含 /）
  // 正确格式：storage:9999/vm-9999-disk-xxx.raw（volName 含 <vmid>/ 子路径）
  const [rows] = await pool.execute(`
    SELECT id, volume_id, status, disk_format, storage_pool, bind_vmid, spec_id
    FROM disks
    WHERE volume_id NOT LIKE '%:/%'
      AND (volume_id LIKE '%.raw' OR volume_id LIKE '%.qcow2'
           OR volume_id LIKE '%.vmdk' OR volume_id LIKE '%.subvol')
      AND status != 'destroyed'
  `);

  console.log('找到脏数据记录:', rows.length);

  if (rows.length === 0) {
    console.log('无需修复');
    process.exit(0);
  }

  const fixed = [];
  for (const disk of rows) {
    // 解析 volume_id: <storage>:<volName>
    const parts = disk.volume_id.split(':');
    if (parts.length !== 2) {
      console.log('[跳过] disk.id=' + disk.id + ' volume_id 格式异常:', disk.volume_id);
      continue;
    }
    const storage = parts[0];
    const volName = parts[1]; // 如 vm-9999-disk-8225.raw

    // 从卷名提取 vmid：vm-<vmid>-disk-<n>.<ext>
    const m = volName.match(/^vm-(\d+)-disk-\d+\./);
    if (!m) {
      console.log('[跳过] disk.id=' + disk.id + ' 卷名不匹配 vm-<vmid>-disk-N.<ext>:', volName);
      continue;
    }
    const vmid = m[1]; // 9999

    // 构造正确 volume_id：<storage>:<vmid>/<volName>
    const correctVolId = storage + ':' + vmid + '/' + volName;
    console.log('[修复] disk.id=' + disk.id +
      ' | 旧: ' + disk.volume_id +
      ' | 新: ' + correctVolId +
      ' (status=' + disk.status + ')');

    if (applyMode) {
      await pool.execute('UPDATE disks SET volume_id = ? WHERE id = ?', [correctVolId, disk.id]);
      console.log('  -> 已更新');
    }
    fixed.push({ id: disk.id, old: disk.volume_id, new: correctVolId });
  }

  console.log('\n=== 完成 ===');
  console.log('修复记录数:', fixed.length);
  if (!applyMode) {
    console.log('\n以上为 DRY-RUN 预览，实际修复请运行:');
    console.log('  node scripts/fix-dir-volume-id.js --apply');
  }
  process.exit(0);
})().catch(e => {
  console.error('脚本失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
