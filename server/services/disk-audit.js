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
const diskUtils = require('../utils/disk-utils');

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

  var volumes = diskUtils.getVmDiskVolumes(config);
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
 * @param {number} vmId - VM ID
 * @param {number} userId - 用户 ID
 * @param {string|object|null} preSnapshotRaw - 恢复前快照（仅审计追溯）
 */
async function auditAfterRestore(vmId, userId, preSnapshotRaw) {
  // 1. 获取恢复后 PVE 配置
  var afterConfig;
  try {
    afterConfig = await pveApi.getVmConfig(vmId);
  } catch (e) {
    console.error('[盘审计] 获取恢复后 VM ' + vmId + ' 配置失败:', e.message);
    return;
  }

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
        if (!knownDisk.is_legacy && knownDisk.volume_id !== volPart) {
          // 付费数据盘：volume_id 变了，更新台账
          try {
            await db.disks.updateVolumeId(knownDisk.id, volPart);
            console.log('[盘审计] 数据盘 ' + knownDisk.id + ' volume_id 已更新: ' + knownDisk.volume_id + ' -> ' + volPart);
          } catch (e) {
            console.error('[盘审计] 更新数据盘 ' + knownDisk.id + ' volume_id 失败:', e.message);
          }
        }
        // legacy 盘不做任何操作（随 VM 管理）
        delete slotMap[slotKey];
      } else {
        // === 未知槽位 → 幽灵盘 ===
        // 再次安全检查：确认不是系统盘
        if (diskUtils.isSystemDiskVol(volPart)) continue;
        // 防止并发竞态：刚挂载的新盘已被 DB 记录但不在本次查询中？不可能，因为我们是最新查询
        // 销毁幽灵盘
        try {
          console.warn('[盘审计] 发现幽灵盘 ' + volPart + '（槽位 ' + slotKey + ', VM ' + vmId + ', 用户 ' + userId + '），执行销毁');
          await diskUtils.destroyDisk(volPart);
          console.log('[盘审计] 幽灵盘 ' + volPart + ' 已销毁');
        } catch (e) {
          console.error('[盘审计] 销毁幽灵盘 ' + volPart + ' 失败:', e.message);
        }
      }
    }
  }

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
