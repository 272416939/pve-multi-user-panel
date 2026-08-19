// server/services/disk-audit.js - 磁盘对账审计（恢复后幽灵盘清理 + 丢失盘修复）
// 在 VM 恢复完成后执行，比对 PVE 侧磁盘与 DB 台账，处理差异
// 策略：设备槽位匹配（bind_bus+bind_dev），而非 volume_id 匹配
//       qmrestore --force 会重新生成 volume_id，但设备槽位保持不变
//
// 安全设计：
// - 永不对 dev=0（系统盘槽位）执行任何操作
// - 已知槽位（无论 legacy 还是付费盘）的盘永不销毁
// - 只销毁 PVE 中存在、DB 完全无记录（含 legacy）的未知槽位幽灵盘

const db = require('../api/db');
const pveApi = require('../api/pve-api');
// 磁盘域拆分（规范第七节）：纯函数走 utils/disk-validation.js，PVE 命令走 services/disk-ops.js
const { getVmDiskVolumes } = require('../utils/disk-validation');
const diskOps = require('./disk-ops');

/**
 * 获取 VM 当前的磁盘快照，并持久化到 vm_disk_snapshots 表
 * @param {number} vmId
 * @param {number} userId
 * @returns {object} { pve_config, active_disk_vol_ids, system_vol_ids, known_slots }
 */
async function takeDiskSnapshot(vmId, userId) {
  var config = null;
  try {
    config = await pveApi.getVmConfig(vmId);
  } catch (e) {
    console.error('[盘审计] 获取 VM ' + vmId + ' 配置失败:', e.message);
    config = {};
  }

  var volumes = getVmDiskVolumes(config);
  var allDisks = await db.disks.getByBindVmid(vmId);

  // 记录所有磁盘的槽位（含 legacy），用于对账时识别已知槽位
  var knownSlots = {};
  var activeDiskVolIds = [];

  for (var i = 0; i < allDisks.length; i++) {
    var d = allDisks[i];
    if (d.status === 'destroyed') continue;
    if (d.bind_bus && d.bind_dev !== null && d.bind_dev !== undefined) {
      knownSlots[d.bind_bus + d.bind_dev] = true;
    }
    if (!d.is_legacy && d.status !== 'destroyed') {
      activeDiskVolIds.push(d.volume_id);
    }
  }

  var snapshot = {
    pve_config: config,
    active_disk_vol_ids: activeDiskVolIds,
    system_vol_ids: volumes.system,
    known_slots: Object.keys(knownSlots)
  };

  // 写入持久化快照（供后续审计追溯）
  await db.vmDiskSnapshots.upsert(vmId, userId, snapshot);
  console.log('[快照] VM ' + vmId + ' 磁盘快照已更新（系统盘 ' + volumes.system.length + ', 数据盘 ' + volumes.data.length + '）');
  return snapshot;
}

/**
 * 恢复完成后执行磁盘对账
 *
 * 对账策略（设备槽位匹配）：
 *   PVE 恢复后所有磁盘 volume_id 会重新生成，
 *   但设备槽位（scsi1/scsi2/virtio1...）保持不变。
 *   用槽位匹配已购数据盘，而非 volume_id。
 *
 * 安全约束：
 * - 幽灵盘处理前必须校验该 volume_id 是否已被其他 VM 使用（跨 VM 迁移场景）
 * - 如果该 volume_id 存在于 DB 中且状态非 destroyed，说明是已迁移到其他 VM 的数据盘，不能销毁
 *
 * @param {number} vmId - VM ID
 * @param {number} userId - 用户 ID
 * @param {string|object|null} preSnapshotRaw - 恢复前快照（仅审计追溯）
 */
async function auditAfterRestore(vmId, userId, preSnapshotRaw) {
  console.log('[盘审计] === 开始对账 VM ' + vmId + '（用户 ' + userId + '）===');

  // 等 1 秒让 PVE 刷新配置缓存
  await new Promise(function(resolve) { setTimeout(resolve, 1000); });

  // 1. 获取恢复后 PVE 配置
  var afterConfig;
  try {
    afterConfig = await pveApi.getVmConfig(vmId);
  } catch (e) {
    console.error('[盘审计] 获取恢复后 VM ' + vmId + ' 配置失败:', e.message);
    return;
  }

  // 打印 PVE 配置中所有磁盘槽位用于调试
  var debugSlots = [];
  var busList = ['scsi', 'sata', 'virtio'];
  for (var tb = 0; tb < busList.length; tb++) {
    for (var td = 0; td <= 30; td++) {
      var tk = busList[tb] + td;
      if (afterConfig[tk]) {
        debugSlots.push(tk + '=' + afterConfig[tk].substring(0, 80));
      }
    }
  }
  console.log('[盘审计] PVE 恢复后配置磁盘槽位:', debugSlots.join(', '));

  // 2. 获取当前绑定到此 VM 的所有磁盘（含 legacy）
  var allBoundDisks = await db.disks.getByBindVmid(vmId);
  // 仅处理非 destroyed 的记录
  var activeDisks = allBoundDisks.filter(function(d) { return d.status !== 'destroyed'; });

  // 3. 建立已知槽位映射 { 'scsi1': {disk}, 'scsi2': {disk}, ... }
  //    包含 legacy 盘和付费数据盘
  var slotMap = {};
  for (var i = 0; i < activeDisks.length; i++) {
    var disk = activeDisks[i];
    if (disk.bind_bus && disk.bind_dev !== null && disk.bind_dev !== undefined) {
      var sk = disk.bind_bus + disk.bind_dev;
      slotMap[sk] = disk;
    }
  }

  // 4. 遍历 PVE 恢复后的所有磁盘槽位（跳过系统盘槽位 dev=0）
  var busList = ['scsi', 'sata', 'virtio'];
  for (var b = 0; b < busList.length; b++) {
    var bus = busList[b];
    for (var dev = 1; dev <= 30; dev++) {
      var slotKey = bus + dev;
      var val = afterConfig[slotKey];
      if (!val || typeof val !== 'string') continue;

      var volPart = val.split(',')[0];
      if (!volPart || volPart.indexOf(':') === -1) continue;

      if (slotMap[slotKey]) {
        // === 已知槽位 ===
        var knownDisk = slotMap[slotKey];
        console.log('[盘审计]   ［已知槽位］' + slotKey + ' = ' + volPart + '（台账ID ' + knownDisk.id + ', legacy=' + knownDisk.is_legacy + '）');
        if (!knownDisk.is_legacy && knownDisk.volume_id !== volPart) {
          // 付费数据盘：volume_id 变了，更新台账并释放旧卷
          var oldVolId = knownDisk.volume_id;
          try {
            await db.disks.updateVolumeId(knownDisk.id, volPart);
            console.log('[盘审计] 数据盘 ' + knownDisk.id + ' volume_id 已更新: ' + oldVolId + ' -> ' + volPart);
            // 释放旧卷（PVE 恢复后旧卷仍残留在存储池，不释放会变成孤儿）
            try {
              await diskOps._internal.destroySystemDisk(oldVolId);
              console.log('[盘审计] 旧卷 ' + oldVolId + ' 已释放');
            } catch (oldErr) {
              console.error('[盘审计] 释放旧卷 ' + oldVolId + ' 失败:', oldErr.message);
            }
          } catch (e) {
            console.error('[盘审计] 更新数据盘 ' + knownDisk.id + ' volume_id 失败:', e.message);
          }
        }
        // legacy 盘不做任何操作（随 VM 管理）
        delete slotMap[slotKey];
      } else {
        // === 未知槽位 → 幽灵盘 ===
        // 注意：此处不通过 volume 名判断系统盘（*-disk-0 可能是数据盘卷名）
        // 系统盘已由 dev=0 排除，dev>=1 的槽位无论卷名都是数据盘
        console.log('[盘审计]   ［幽灵盘］' + slotKey + ' = ' + volPart + ' → 即将销毁');
        // 安全校验：检查该 volume_id 是否已被其他 VM 使用（跨 VM 迁移场景）
        // 如果用户把盘从 VM200 卸载后挂载到 VM101，VM200 恢复时该 volume_id 仍存在于 DB，
        // 且绑定到了 VM101，此时不能销毁——必须跳过
        var activeRef = null;
        try {
          activeRef = await db.disks.existsActiveByVolumeId(volPart);
        } catch (e) {}
        if (activeRef && activeRef.id) {
          console.log('[盘审计]   ［跳过］幽灵盘 ' + volPart + ' 已被其他 VM 使用（台账ID ' + activeRef.id + '），跳过销毁');
          continue;
        }

        // 幽灵盘处理：先 detach 再销毁，最后清理 unused 残留
        // 注意：qm set --delete 或 qm unlink 后 PVE 会生成 unused0 配置行，
        //       pvesm free 后 unused 行仍残留，需额外清理
        try {
          var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
          var sshCfg = await getPveSshConfig();

          // 第一步：用 qm unlink 彻底 detach（比 qm set --delete 更干净）
          var unlinkCmd = 'qm unlink ' + vmId + ' --idlist ' + slotKey;
          var unlinkResult = await execSSH(sshCfg.host, sshCfg.username, sshCfg.password, unlinkCmd, 600000, sshCfg.port);
          if (unlinkResult.code !== 0) {
            console.log('[盘审计] qm unlink ' + slotKey + ' 结果: ' + (unlinkResult.stderr || unlinkResult.stdout || ''));
          } else {
            console.log('[盘审计] 已从 VM ' + vmId + ' 摘除槽位 ' + slotKey);
          }

          // 第二步：销毁卷（宽松校验路径，不拦截 disk-0 卷名）
          await diskOps._internal.destroySystemDisk(volPart);
          console.log('[盘审计] 幽灵盘 ' + volPart + ' 已销毁');

          // 第三步：清理 PVE 可能留下的 unused0~unused9 残留配置行
          // qm unlink 后 PVE 会生成 unused0=hdd5:200/vm-200-disk-0.qcow2，
          // 即使卷已 pvesm free 释放，unused 行仍会残留
          for (var ui = 0; ui <= 9; ui++) {
            var unusedKey = 'unused' + ui;
            var cleanCmd = 'qm set ' + vmId + ' --delete ' + unusedKey;
            var cleanResult = await execSSH(sshCfg.host, sshCfg.username, sshCfg.password, cleanCmd, 600000, sshCfg.port);
            if (cleanResult.code === 0) {
              console.log('[盘审计] 已清理残留配置 ' + unusedKey);
            }
          }
        } catch (e) {
          console.error('[盘审计] 销毁幽灵盘 ' + volPart + ' 失败:', e.message);
        }
      }
    }
  }

  console.log('[盘审计] === 对账完成（VM ' + vmId + ', 待确认丢失槽位: ' + Object.keys(slotMap).length + '）===');

  // 5. 处理丢失的数据盘：槽位在 slotMap 中但 PVE 中已不存在
  var lostSlots = Object.keys(slotMap);
  for (var k = 0; k < lostSlots.length; k++) {
    var lostDisk = slotMap[lostSlots[k]];
    if (lostDisk.is_legacy) continue; // legacy 盘丢失不报（恢复覆盖正常）
    console.error('[盘审计] 数据盘 ' + lostDisk.id + ' (' + lostDisk.volume_id + ') 在恢复后丢失！槽位 ' + lostSlots[k] + ' 已不存在');
    // TODO: 可扩展自动触发退款或通知管理员
  }

  // 6. 更新快照为恢复后状态
  try {
    await takeDiskSnapshot(vmId, userId);
  } catch (e) {
    console.error('[盘审计] 更新快照失败:', e.message);
  }
}

module.exports = {
  takeDiskSnapshot,
  auditAfterRestore,
};
