/**
 * 清理非 legacy 孤立磁盘脚本
 * 
 * 孤立磁盘定义：
 * - 台账中 bind_vmid 指向一个 VM，但该 VM 记录在 vms 表中已不存在
 *   （管理员在 PVE 直接销毁了 VM，未通过面板操作）
 * - 状态为 bound（已挂载）
 * - 非 legacy（非导入磁盘）
 * 
 * 修复策略：
 * 1. 首先尝试更新台账状态为 free（如果 PVE 卷还存在，可重新分配）
 * 2. 如果 PVE 卷也不存在（被 destroyVm 连带销毁），直接清理台账
 * 
 * 用法：
 *   node scripts/clean-orphan-disks.js          # DRY-RUN 仅查询
 *   node scripts/clean-orphan-disks.js --apply  # 实际清理
 *   node scripts/clean-orphan-disks.js --force  # 不检查 PVE 卷是否存在，直接清理台账
 */
require('dotenv').config();
const db = require('../server/api/db');
const { execSSH, getPveSshConfig } = require('../server/api/ssh-exec');

(async () => {
  await db.initDb();
  const pool = db.getPool();
  const applyMode = process.argv.includes('--apply');
  const forceMode = process.argv.includes('--force');

  console.log('=== 清理非 legacy 孤立磁盘 ===');
  console.log('模式:', forceMode ? 'FORCE (不检查 PVE 直接清理台账)' :
    (applyMode ? 'APPLY (实际清理)' : 'DRY-RUN (仅查询)'));

  // 查找所有已挂载但 VM 不存在的非 legacy 磁盘
  // 多节点：JOIN 必须同时匹配节点（d.pve_node_id = v.pve_node_id），
  // 否则跨节点同 vmid 会把「本节点已销毁、他节点恰好同号」的盘误判为仍存活（漏清），
  // 或在安全模式下于错误节点上 pvesm 检查不到卷而误删台账
  const [rows] = await pool.execute(`
    SELECT d.id, d.volume_id, d.status, d.bind_vmid, d.is_legacy, d.disk_name,
           d.storage_pool, d.capacity_gb, d.pve_node_id
    FROM disks d
    LEFT JOIN vms v ON d.bind_vmid = v.vm_id
      AND (d.pve_node_id IS NULL OR v.pve_node_id IS NULL OR v.pve_node_id = d.pve_node_id)
    WHERE d.bind_vmid IS NOT NULL
      AND v.vm_id IS NULL
      AND d.status = 'bound'
      AND d.is_legacy = 0
    ORDER BY d.id
  `);

  console.log('找到孤立非 legacy 磁盘:', rows.length);
  console.log(JSON.stringify(rows, null, 2));

  if (rows.length === 0) {
    console.log('\n无需清理');
    process.exit(0);
  }

  if (forceMode) {
    // 强制模式：不检查 PVE 卷，直接清理台账
    for (const disk of rows) {
      console.log('[清理] disk.id=' + disk.id + ' vol=' + disk.volume_id + ' 强制清理台账');
      if (applyMode) {
        await pool.execute('UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, updated_at = NOW() WHERE id = ?', ['free', disk.id]);
        console.log('  -> 已重置为 free');
      }
    }
  } else {
    // 安全模式：检查 PVE 卷是否存在
    // 多节点：按磁盘所属节点解析 SSH（同节点复用），pvesm 必须在卷所在节点执行
    const sshConfigCache = new Map(); // nodeKey -> sshConfig|null

    for (const disk of rows) {
      var volParts = (disk.volume_id || '').split(':');
      if (volParts.length !== 2) {
        console.log('[跳过] disk.id=' + disk.id + ' volume_id 格式异常');
        continue;
      }
      var storagePool = volParts[0];
      if (!/^[a-zA-Z0-9_-]+$/.test(storagePool)) {
        console.log('[跳过] disk.id=' + disk.id + ' 存储池名非法: ' + JSON.stringify(storagePool));
        continue;
      }

      var diskNodeId = disk.pve_node_id != null ? disk.pve_node_id : null;
      var nodeKey = String(diskNodeId);
      var sshConfig;
      if (sshConfigCache.has(nodeKey)) {
        sshConfig = sshConfigCache.get(nodeKey);
      } else {
        try {
          sshConfig = await getPveSshConfig(diskNodeId);
        } catch (e) {
          console.error('[跳过] 节点 #' + nodeKey + ' SSH 配置解析失败:', e.message);
          sshConfig = null;
        }
        sshConfigCache.set(nodeKey, sshConfig);
      }
      if (!sshConfig || !sshConfig.host || !sshConfig.password) {
        console.log('[跳过] disk.id=' + disk.id + ' 所在节点 #' + nodeKey + ' SSH 配置不完整（可用 --force 跳过检查）');
        continue;
      }

      // 检查 PVE 卷是否存在
      try {
        var cmd = 'pvesm list ' + storagePool + ' 2>&1';
        var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
        var exists = false;
        var lines = (result.stdout || '').split('\n');
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim();
          if (!line || line.indexOf('Volid') === 0) continue;
          var firstSpace = line.indexOf(' ');
          var volId = firstSpace > 0 ? line.substring(0, firstSpace) : line;
          if (volId === disk.volume_id) { exists = true; break; }
        }

        if (exists) {
          console.log('[保留] disk.id=' + disk.id + ' vol=' + disk.volume_id + ' PVE 卷仍存在，重置为 free');
          if (applyMode) {
            await pool.execute('UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, updated_at = NOW() WHERE id = ?', ['free', disk.id]);
            console.log('  -> 已重置为 free');
          }
        } else {
          console.log('[清理] disk.id=' + disk.id + ' vol=' + disk.volume_id + ' PVE 卷已不存在');
          if (applyMode) {
            await pool.execute('DELETE FROM disks WHERE id = ?', [disk.id]);
            console.log('  -> 已删除台账');
          }
        }
      } catch (e) {
        console.error('[失败] disk.id=' + disk.id + ' 检查 PVE 出错:', e.message);
      }
    }
  }

  console.log('\n=== 完成 ===');
  if (!applyMode) {
    console.log('\nDRY-RUN 预览，实际清理请运行:');
    console.log('  node scripts/clean-orphan-disks.js --apply   # 安全模式：检查 PVE 卷后清理');
    console.log('  node scripts/clean-orphan-disks.js --force  --apply  # 强制模式：直接清理台账');
  }
  process.exit(0);
})().catch(e => {
  console.error('脚本失败:', e.message);
  process.exit(1);
});
