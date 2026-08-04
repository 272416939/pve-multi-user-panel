// server/services/disk-ops.js - 磁盘 PVE/SSH 命令操作
// 规范第七节：基础设施命令调用进 services/，不掺业务决策
// 自 utils/disk-utils.js 拆分：PVE/SSH 命令封装（createDisk/bindDisk/unbindDisk/resizeDisk/destroyDisk 等）

var crypto = require('crypto');
var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
var pveApi = require('../api/pve-api');
var logger = require('../utils/logger');
// 校验纯函数来自 utils/disk-validation.js（单一来源）
var { validateParam, validateVolumeId, validateBusDev, inferDiskFormat } = require('../utils/disk-validation');

// ==================== SSH 命令执行封装 ====================
async function runSshCommand(cmd) {
  var sshConfig = await getPveSshConfig();
  if (!sshConfig.host || !sshConfig.password) {
    throw new Error('PVE SSH 配置不完整');
  }
  var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
  if (result.code !== 0) {
    throw new Error('SSH 命令执行失败: ' + (result.stderr || result.stdout || '未知错误'));
  }
  return result.stdout.trim();
}

// ==================== 磁盘操作 ====================

// 创建游离磁盘 - pvesm alloc <storage> <vmid> <filename> <size> [OPTIONS]
// 注意：pvesm alloc 的 vmid 参数必须是一个真实存在的 VM ID
// 使用临时 VMID（disk:temp_vmid 配置项，默认 9999）作为中转
// diskFormat：文件系统类存储（dir/btrfs/nfs/cephfs）需传扩展名（raw/qcow2/vmdk/subvol），
//             块设备类存储（lvm/lvmthin/zfspool/rbd）传 null/undefined
async function createDisk(storage, sizeGb, userId, tempVmid, diskFormat) {
  var safeStorage = validateParam('storage', storage);
  var safeSize = validateParam('sizeGb', sizeGb);
  var safeUserId = parseInt(userId) || 0;
  var safeVmid = parseInt(tempVmid) || 9999;

  // 校验临时 VMID 范围
  if (!Number.isInteger(safeVmid) || safeVmid < 100 || safeVmid > 999999999) {
    safeVmid = 9999;
  }

  // 服务端生成卷名（PVE 命名规范：vm-{vmid}-disk-{数字}）
  var randSuffix = crypto.randomBytes(4).readUInt32BE(0) % 10000;
  var volName = 'vm-' + safeVmid + '-disk-' + randSuffix;
  // DIR/BTRFS 等文件系统类存储的卷名必须带扩展名（.raw/.qcow2/.vmdk）
  // pvesm alloc 对这类存储的卷名解析规则：必须有扩展名才能识别格式
  if (diskFormat) {
    var safeFormat = validateParam('diskFormat', diskFormat);
    volName = volName + '.' + safeFormat;
  }

  // pvesm alloc 语法：pvesm alloc <storage> <vmid> <filename> <size>
  // vmid 必须是一个真实存在的 VM ID（不能为 0）
  var cmd = 'pvesm alloc ' + safeStorage + ' ' + safeVmid + ' ' + volName + ' ' + safeSize + 'G';
  var stdout = await runSshCommand(cmd);
  logger.debug('[createDisk] pvesm alloc stdout:', JSON.stringify(stdout), 'volName:', volName, 'storage:', safeStorage);

  // 解析返回的 volume_id
  // pvesm alloc 对不同存储类型的 stdout 格式不同：
  // - LVM/LVM-thin：单行，直接返回完整 volume_id（storage:vm-9999-disk-0）
  // - DIR/BTRFS：多行，最后一行为 "successfully created 'storage:9999/vm-...ext'"
  //   真正的 volume_id 在单引号中，含子路径 <vmid>/
  var volumeId = safeStorage + ':' + volName; // 兜底
  if (stdout) {
    // 优先匹配 "successfully created 'xxx'" 中的 volume_id（DIR 存储场景）
    var m = stdout.match(/successfully created '([^']+)'/);
    if (m && m[1]) {
      volumeId = m[1].trim();
    } else if (stdout.indexOf(':') > -1 && stdout.indexOf(safeStorage) === 0) {
      // 单行完整 volume_id（LVM 场景）
      volumeId = stdout.trim();
    }
  }
  logger.debug('[createDisk] 返回 volume_id:', volumeId);
  return volumeId;
}

// 挂载磁盘到 VM（注入限速参数）- qm set <vmid> --<bus><dev> <vol>,qos...
// 支持两种模式：
//  1. 游离卷直接挂载（disk 未托管在中转 VM 上）：qm set 直接挂载
//  2. 中转托管盘：调用 holding-vm.moveDiskFromHolding 从 9999 转移到目标 VM
async function bindDisk(vmid, volumeId, bus, dev, qosParams, holdingVmid, holdingSlot) {
  // 如果磁盘托管在中转 VM 上，先 moveDisk 到目标 VM
  if (holdingVmid && holdingSlot) {
    var holdingService = require('../services/holding-vm');
    await holdingService.moveDiskFromHolding(holdingVmid, holdingSlot, vmid, bus + dev);
    // moveDisk 后 volume_id 会变（PVE 重命名），返回新 volume_id 由调用方更新台账
    var newVolumeId = volumeId;
    try {
      var newConfig = await pveApi.getVmConfig(vmid);
      var newVolPart = newConfig[bus + dev] ? newConfig[bus + dev].split(',')[0] : '';
      if (newVolPart) newVolumeId = newVolPart;
    } catch (e) {
      logger.debug('[bindDisk] moveDisk 后读取新 volume_id 失败，沿用旧值:', e.message);
    }
    return { bus: bus, dev: parseInt(dev), volume_id: newVolumeId, moved: true };
  }

  var safeVmid = validateParam('vmid', vmid);
  var safeVol = validateVolumeId(volumeId);
  var busDev = validateBusDev(bus, dev); // 校验并拼接，禁止系统盘位置
  qosParams = qosParams || {};

  // 拼接限速参数（从数据库规格读取，非用户输入）
  // 注意：volume_id 本身已含扩展名（DIR 存储：storage:9999/vm-...qcow2），
  // PVE 会从扩展名自动识别格式，不要再附加 format=xxx（否则会冲突报错）
  var diskConfig = safeVol;
  var qosFields = ['mbps_rd', 'mbps_rd_max', 'mbps_wr', 'mbps_wr_max', 'iops_rd', 'iops_rd_max', 'iops_wr', 'iops_wr_max'];
  for (var i = 0; i < qosFields.length; i++) {
    var f = qosFields[i];
    if (qosParams[f] !== null && qosParams[f] !== undefined && qosParams[f] !== '') {
      diskConfig += ',' + f + '=' + parseInt(qosParams[f]);
    }
  }

  var cmd = 'qm set ' + safeVmid + ' --' + busDev + ' ' + diskConfig;
  try {
    await runSshCommand(cmd);
    return { bus: bus, dev: parseInt(dev), volume_id: volumeId, moved: false };
  } catch (err) {
    // 自愈：直接挂载失败，可能卷已因 move_disk 被重命名（托管在中转 VM）
    // 尝试在中转 VM 中按「存储前缀 + disk-编号」查找实际卷
    var errMsg = err && err.message ? String(err.message) : '';
    if (errMsg.indexOf('does not exist') !== -1 || errMsg.indexOf('not exist') !== -1) {
      try {
        var holdingService = require('../services/holding-vm');
        var found = await holdingService.findVolumeInHolding(volumeId);
        if (found) {
          logger.warn('[bindDisk] 卷 ' + volumeId + ' 不在目标 VM，在中转 VM 找到实际卷 ' + found.volume_id + '（槽位 ' + found.holdingSlot + '），改走 moveDisk 转移');
          await holdingService.moveDiskFromHolding(found.holdingVmid, found.holdingSlot, safeVmid, busDev);
          // 读取转移后的新 volume_id
          var newVolAfterMove = volumeId;
          try {
            var cfgAfterMove = await pveApi.getVmConfig(safeVmid);
            var volPartAfter = cfgAfterMove[busDev] ? cfgAfterMove[busDev].split(',')[0] : '';
            if (volPartAfter) newVolAfterMove = volPartAfter;
          } catch (_) {}
          return { bus: bus, dev: parseInt(dev), volume_id: newVolAfterMove, moved: true, holding_cleared: true };
        }
      } catch (selfHealErr) {
        logger.warn('[bindDisk] 自愈查找中转 VM 失败:', selfHealErr.message);
      }
    }
    throw err;
  }
}

// 卸载磁盘 - 从用户 VM 转移到中转 VM 托管
// 流程：qm unlink 摘除槽位 → 变成 unused0 → moveDisk 转移到中转 VM scsiX
// 中转托管后，用户 VM 销毁不会连带删除数据盘卷
async function unbindDisk(vmid, bus, dev, holdingVmid) {
  var safeVmid = validateParam('vmid', vmid);
  var busDev = validateBusDev(bus, dev); // 禁止系统盘位置

  var cmd = 'qm unlink ' + safeVmid + ' --idlist ' + busDev;
  try {
    await runSshCommand(cmd);
  } catch (e) {
    var errMsg = e.message || '';
    // busy 错误（Windows VM 常见）：guest 内磁盘已卸载，PVE 配置仍保留
    // 自动重试一次（此时 guest 内已无磁盘占用，unlink 应能成功清理 PVE 配置）
    if (errMsg.indexOf('still busy') !== -1 || errMsg.indexOf('hotplug') !== -1) {
      logger.debug('[unbindDisk] 首次 unlink 报 busy，等待 1 秒后重试...');
      await new Promise(function(resolve) { setTimeout(resolve, 1000); });
      try {
        await runSshCommand(cmd);
        logger.debug('[unbindDisk] 重试 unlink 成功，PVE 配置已清理');
      } catch (e2) {
        // 重试仍失败，提示用户手动处理
        throw new Error('磁盘已在虚拟机内卸载，但 PVE 配置仍保留划线状态，请到 PVE 管理界面点击该磁盘的「还原」后再次卸载');
      }
    } else {
      throw e;
    }
  }

  // 转移托管：unlink 后卷变为 unused0，moveDisk 到中转 VM
  // 查找 unused 槽位（unlink 后第一个空闲 unusedN）
  var unusedSlot = null;
  try {
    var cfgAfterUnlink = await pveApi.getVmConfig(safeVmid);
    for (var ui = 0; ui <= 9; ui++) {
      if (cfgAfterUnlink['unused' + ui]) {
        unusedSlot = 'unused' + ui;
        break;
      }
    }
  } catch (e) {}

  if (!unusedSlot) {
    logger.debug('[unbindDisk] 未找到 unused 槽位，跳过 moveDisk（卷可能已移除）');
    return { holdingVmid: null, holdingSlot: null };
  }

  // 分配到中转 VM 的空闲槽位
  var holdingService = require('../services/holding-vm');
  var targetHoldingVmid = holdingVmid || await holdingService.getHoldingVmid();
  await holdingService.ensureHoldingVm(targetHoldingVmid);
  var freeSlot = await holdingService.findFreeHoldingSlot(targetHoldingVmid);
  if (!freeSlot) {
    // 中转 VM 槽位满（当前单节点场景 30 块足够，暂不自动扩容）
    throw new Error('中转 VM ' + targetHoldingVmid + ' 槽位已满，请先挂载部分磁盘后再卸载');
  }

  await holdingService.moveDiskToHolding(safeVmid, unusedSlot, targetHoldingVmid, freeSlot);
  logger.info('[unbindDisk] 磁盘已从 VM ' + safeVmid + ' 转移到中转 VM ' + targetHoldingVmid + ' 槽位 ' + freeSlot);

  // moveDisk 后 PVE 会重命名卷（vm-<userVM>-disk-N → vm-<holding>-disk-N），需返回新 volume_id
  var newVolumeId = null;
  try {
    var holdingConfig = await pveApi.getVmConfig(targetHoldingVmid);
    if (holdingConfig && holdingConfig[freeSlot]) {
      newVolumeId = holdingConfig[freeSlot].split(',')[0];
    }
  } catch (e) {}

  return { holdingVmid: targetHoldingVmid, holdingSlot: freeSlot, volume_id: newVolumeId };
}

// 扩容磁盘 - qm resize <vmid> <bus+dev> <size>
// 已挂载磁盘：使用 bind_vmid + bind_bus + bind_dev（如 scsi1，禁止 scsi0）
// 游离磁盘：先挂载到中转 VM（scsi30），扩容后再卸载
async function resizeDisk(volumeId, newSizeGb, tempVmid, bindVmid, bindBus, bindDev) {
  var safeVol = validateVolumeId(volumeId);
  var safeSize = validateParam('sizeGb', newSizeGb);

  if (bindVmid && Number.isInteger(parseInt(bindVmid)) && parseInt(bindVmid) >= 100 && bindBus && bindDev) {
    // 已挂载磁盘：校验总线设备名（禁止系统盘 scsi0/virtio0/sata0）
    var safeVmid = parseInt(bindVmid);
    var busDev = validateBusDev(bindBus, bindDev);
    var cmd = 'qm resize ' + safeVmid + ' ' + busDev + ' ' + safeSize + 'G';
    await runSshCommand(cmd);
  } else {
    // 游离磁盘：挂载到中转 VM（scsi30 避免冲突，且 != 0 系统盘位置）-> 扩容 -> 卸载
    var transitVmid = parseInt(tempVmid) || 9999;
    if (!Number.isInteger(transitVmid) || transitVmid < 100 || transitVmid > 999999999) {
      transitVmid = 9999;
    }
    // 挂载到中转 VM（scsi30 固定位置，非系统盘 scsi0）
    // volume_id 已含扩展名，PVE 自动识别格式，无需附加 format=
    var attachCmd = 'qm set ' + transitVmid + ' --scsi30 ' + safeVol;
    await runSshCommand(attachCmd);
    try {
      // 执行扩容（scsi30 非 0，安全）
      var resizeCmd = 'qm resize ' + transitVmid + ' scsi30 ' + safeSize + 'G';
      await runSshCommand(resizeCmd);
    } finally {
      // 无论成功失败都卸载
      try {
        var detachCmd = 'qm set ' + transitVmid + ' --delete scsi30';
        await runSshCommand(detachCmd);
      } catch (e) {
        logger.error('[disk-ops] 卸载中转磁盘失败:', e.message);
      }
    }
  }
}

// 销毁磁盘 - pvesm free <vol>
async function destroyDisk(volumeId) {
  var safeVol = validateVolumeId(volumeId);
  var cmd = 'pvesm free ' + safeVol;
  await runSshCommand(cmd);
}

// 读取系统盘总线类型 - qm config <vmid> | grep
async function getSystemDiskBus(vmid) {
  var safeVmid = validateParam('vmid', vmid);
  var config = await pveApi.getVmConfig(safeVmid);
  if (config.scsi0) return 'scsi';
  if (config.sata0) return 'sata';
  if (config.virtio0) return 'virtio';
  return 'scsi'; // 默认
}

// 读取 VM 配置，查找空闲设备号
async function getAvailableDevNumber(vmid, bus) {
  var safeVmid = validateParam('vmid', vmid);
  var safeBus = validateParam('bus', bus);
  var config = await pveApi.getVmConfig(safeVmid);

  // 从 1 号开始查找空闲设备号（永不占用 0 号系统盘）
  for (var dev = 1; dev <= 30; dev++) {
    var key = safeBus + dev;
    if (!config[key]) return dev;
  }
  throw new Error('虚拟机 ' + safeVmid + ' 的 ' + safeBus + ' 总线已满（最多 30 个设备）');
}

// 检查存储池剩余容量
async function checkStorageCapacity(storage, requestedGb) {
  var safeStorage = validateParam('storage', storage);
  var safeSize = validateParam('sizeGb', requestedGb);
  try {
    var storageList = await pveApi.getAllStorages();
    var target = null;
    if (storageList && Array.isArray(storageList)) {
      for (var i = 0; i < storageList.length; i++) {
        if (storageList[i].storage === safeStorage) {
          target = storageList[i];
          break;
        }
      }
    }
    if (!target) return true; // 无法查询时放行，PVE 层会兜底
    var total = parseInt(target.total) || 0;
    var used = parseInt(target.used) || 0;
    var available = total - used;
    // PVE 返回字节，转 GiB
    available = Math.floor(available / (1024 * 1024 * 1024));
    if (safeSize > available) {
      throw new Error('存储池 ' + safeStorage + ' 剩余容量不足（剩余 ' + available + ' GiB，需要 ' + safeSize + ' GiB）');
    }
    return true;
  } catch (e) {
    if (e.message.indexOf('剩余容量不足') > -1) throw e;
    return true; // 查询失败时放行
  }
}

// ==================== 系统切换内部函数（仅供 os-switch-utils.js 使用） ====================
// 绕过 dev=0 检查，仅通过 Node.js 进程内 require 访问，不暴露给 HTTP 路由层
const _internal = {
  unbindSystemDisk: async (vmid, bus) => {
    var safeVmid = validateParam('vmid', vmid);
    if (!['scsi', 'sata', 'virtio'].includes(bus)) throw new Error('invalid bus');
    var cmd = 'qm unlink ' + safeVmid + ' --idlist ' + bus + '0';
    await runSshCommand(cmd);
  },
  destroySystemDisk: async (volumeId) => {
    if (!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./\-]+$/.test(volumeId)) {
      throw new Error('invalid volume id');
    }
    var parts = volumeId.split(':');
    var volName = parts[1] || '';
    var lastSeg = volName.split('/').pop() || volName;
    if (!/^(vm-|disk-pool-|imported-)/.test(lastSeg)) {
      throw new Error('invalid volume prefix');
    }
    var cmd = 'pvesm free ' + volumeId;
    // 使用 execSSH 直接调用以便对"卷不存在"做容错
    var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
    var cfg = await getPveSshConfig();
    var result = await execSSH(cfg.host, cfg.username, cfg.password, cmd);
    if (result.code !== 0) {
      var errMsg = (result.stderr || result.stdout || '').toLowerCase();
      // 卷不存在视为已清理，不抛异常
      if (errMsg.indexOf('does not exist') !== -1 || errMsg.indexOf('not exist') !== -1 || errMsg.indexOf('no such') !== -1) {
        return;
      }
      throw new Error('释放磁盘失败: ' + volumeId + ' - ' + (result.stderr || result.stdout || ''));
    }
  }
};

module.exports = {
  createDisk,
  bindDisk,
  unbindDisk,
  resizeDisk,
  destroyDisk,
  getSystemDiskBus,
  getAvailableDevNumber,
  checkStorageCapacity,
  inferDiskFormat,
  _internal,
};
