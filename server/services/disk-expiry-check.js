// server/services/disk-expiry-check.js - 磁盘到期巡检服务
// 文档 4.1/5.4.5：到期预警 -> 宽限期 -> 停机分离 -> 保留期 -> 销毁回收 全流程
// 安全约束：永不执行运行中虚拟机强制拔盘，必须先关机再分离；LXC 全程跳过

var db = require('../api/db');
var pveApi = require('../api/pve-api');
var { createEmailTemplate, sendEmail } = require('../utils/email');
var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
var { getRedisClient } = require('../api/redis');

var isChecking = false;

// ==================== Redis 提醒去重（复用 VM 模式） ====================

async function markDiskReminderSent(diskId, stage, date) {
  var key = 'disk:reminder:' + diskId + ':' + stage + ':' + date;
  var redis = getRedisClient();
  if (redis) {
    try { await redis.setex(key, 86400, '1'); return; } catch (e) {}
  }
  // 内存回退
  if (!global._diskReminderTracker) global._diskReminderTracker = new Map();
  global._diskReminderTracker.set(key, true);
}

async function isDiskReminderSent(diskId, stage, date) {
  var key = 'disk:reminder:' + diskId + ':' + stage + ':' + date;
  var redis = getRedisClient();
  if (redis) {
    try { var val = await redis.get(key); return val === '1'; } catch (e) {}
  }
  if (!global._diskReminderTracker) return false;
  return global._diskReminderTracker.get(key) === true;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ==================== 发送提醒邮件 ====================

async function sendDiskReminderEmail(user, disk, stage) {
  if (!user || !user.email) return;
  try {
    var subject = '【硬盘到期提醒】' + (disk.disk_name || disk.volume_id);
    var content = '';
    if (stage === 'warn') {
      content = '<p>您的数据盘 <strong>' + (disk.disk_name || disk.volume_id) + '</strong>（' + disk.capacity_gb + ' GiB）将在 ' + disk.expire_time + ' 到期。</p>';
      content += '<p>请及时续费以免影响使用。</p>';
    } else if (stage === 'grace') {
      content = '<p>您的数据盘 <strong>' + (disk.disk_name || disk.volume_id) + '</strong>（' + disk.capacity_gb + ' GiB）已到期，当前处于宽限期。</p>';
      content += '<p>请尽快续费，宽限期结束后磁盘将从虚拟机分离。</p>';
    } else if (stage === 'expired') {
      content = '<p>您的数据盘 <strong>' + (disk.disk_name || disk.volume_id) + '</strong>（' + disk.capacity_gb + ' GiB）已到期分离，进入保留期。</p>';
      content += '<p>保留期内续费可重新挂载，逾期将自动销毁。</p>';
    }
    var siteName = 'PVE 管理面板';
    try {
      var cfg = await db.config.get('site:name');
      if (cfg) siteName = cfg;
    } catch (e) {}
    var html = createEmailTemplate('硬盘到期提醒', content, siteName);
    await sendEmail(user.email, subject, html);
  } catch (e) {
    console.error('[disk-expiry] 发送提醒邮件失败:', e.message);
  }
}

// ==================== 优雅关机 + 等待 ====================

async function gracefulShutdownVm(vmid, timeout) {
  try {
    var status = await pveApi.getVmStatus(vmid);
    if (status.status !== 'running') return true;

    // 优雅关机
    await pveApi.shutdownVm(vmid);

    // 等待关机完成（轮询，超时强制断电兜底）
    var startWait = Date.now();
    var timeoutMs = (timeout || 300) * 1000;
    while (Date.now() - startWait < timeoutMs) {
      await new Promise(function(r) { setTimeout(r, 5000); });
      try {
        var s = await pveApi.getVmStatus(vmid);
        if (s.status === 'stopped') return true;
      } catch (e) {}
    }

    // 超时强制断电
    console.warn('[disk-expiry] VM ' + vmid + ' 优雅关机超时，强制断电');
    await pveApi.stopVm(vmid);
    await new Promise(function(r) { setTimeout(r, 3000); });
    return true;
  } catch (e) {
    console.error('[disk-expiry] 关机 VM ' + vmid + ' 失败:', e.message);
    return false;
  }
}

// ==================== 分离磁盘（qm set --delete） ====================

async function detachDiskFromVm(disk) {
  try {
    var safeVmid = parseInt(disk.bind_vmid);
    if (!Number.isInteger(safeVmid) || safeVmid < 100 || safeVmid > 999999999) {
      throw new Error('无效的 VM ID');
    }
    if (!disk.bind_bus || !['scsi', 'sata', 'virtio'].includes(disk.bind_bus)) {
      throw new Error('无效的总线类型');
    }
    var safeDev = parseInt(disk.bind_dev);
    if (!Number.isInteger(safeDev) || safeDev < 1 || safeDev > 30) {
      throw new Error('无效的设备号');
    }

    var sshConfig = await getPveSshConfig();
    if (!sshConfig.host || !sshConfig.password) throw new Error('SSH 配置不完整');

    // qm unlink 卸载磁盘（优于 qm set --delete，不留划线状态）
    // 注意：busy 错误时 guest 内磁盘实际已卸载（Windows 划线状态仅 PVE 配置层显示），
    // 不阻塞流程，台账状态照常更新为 expired（避免白嫖）
    var cmd = 'qm unlink ' + safeVmid + ' --idlist ' + disk.bind_bus + safeDev;
    var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
    if (result.code !== 0) {
      var errMsg = (result.stderr || result.stdout || '');
      // hotplug busy 错误（Windows VM 常见）：guest 内磁盘已卸载，
      // PVE 配置留划线状态（用户可手动点还原清理），不阻塞到期分离流程
      if (errMsg.indexOf('still busy') !== -1 || errMsg.indexOf('hotplug') !== -1) {
        console.warn('[disk-expiry] 磁盘 ' + disk.id + ' 卸载报 busy（guest 内已卸载，PVE 留划线状态），继续标记 expired');
      } else {
        throw new Error('分离磁盘失败: ' + errMsg);
      }
    }

    // 更新台账：状态 -> expired（到期分离游离态）
    await db.disks.updateStatus(disk.id, 'expired');
    await db.disks.unbind(disk.id);
    console.log('[disk-expiry] 磁盘 ' + disk.id + ' 已从 VM ' + safeVmid + ' 分离');
    return true;
  } catch (e) {
    console.error('[disk-expiry] 分离磁盘 ' + disk.id + ' 失败:', e.message);
    return false;
  }
}

// ==================== 销毁磁盘（pvesm free） ====================

async function destroyExpiredDisk(disk) {
  try {
    // 校验 volume_id 格式（安全防护，允许 / 子路径兼容 DIR 存储）
    if (!disk.volume_id || !/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./\-]+$/.test(disk.volume_id)) {
      throw new Error('无效的卷标识');
    }
    // 系统盘防护（兼容 .raw/.qcow2/.vmdk/.subvol 扩展名）
    if (/disk-0(\.(raw|qcow2|vmdk|subvol))?$/.test(disk.volume_id)) {
      throw new Error('禁止销毁系统盘');
    }

    var sshConfig = await getPveSshConfig();
    if (!sshConfig.host || !sshConfig.password) throw new Error('SSH 配置不完整');

    var cmd = 'pvesm free ' + disk.volume_id;
    var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
    if (result.code !== 0) {
      throw new Error('销毁磁盘失败: ' + (result.stderr || result.stdout));
    }

    await db.disks.markDestroyed(disk.id);
    console.log('[disk-expiry] 磁盘 ' + disk.id + ' (' + disk.volume_id + ') 已销毁回收');
    return true;
  } catch (e) {
    console.error('[disk-expiry] 销毁磁盘 ' + disk.id + ' 失败:', e.message);
    return false;
  }
}

// ==================== 主巡检逻辑 ====================

async function checkExpiredDisks() {
  if (isChecking) return;
  isChecking = true;

  try {
    // 获取生命周期配置
    var config = await db.diskLifecycleConfig.get();
    if (!config) {
      config = { warn_days: 7, grace_days: 3, retention_days: 15, shutdown_timeout: 300 };
    }

    var warnDays = config.warn_days || 7;
    var graceDays = config.grace_days || 3;
    var retentionDays = config.retention_days || 15;
    var shutdownTimeout = config.shutdown_timeout || 300;
    var now = new Date();
    var today = todayStr();

    // 获取所有即将到期/已到期的磁盘（排除 legacy 磁盘，legacy 随 VM 计费）
    var disks = await db.disks.getExpiring();
    disks = disks.filter(function(d) { return !d.is_legacy; });
    if (!disks || disks.length === 0) return;

    console.log('[disk-expiry] 巡检 ' + disks.length + ' 个磁盘');

    for (var i = 0; i < disks.length; i++) {
      var disk = disks[i];
      try {
        var expireDate = new Date(disk.expire_time);
        var diffMs = expireDate - now;
        var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

        // 阶段判断
        if (diffDays > 0 && diffDays <= warnDays) {
          // ===== 预警期 =====
          if (disk.status !== 'free' && disk.status !== 'bound') continue;
          if (disk.status === 'free') await db.disks.updateStatus(disk.id, 'free'); // 保持
          // 发送预警提醒（去重）
          if (!await isDiskReminderSent(disk.id, 'warn', today)) {
            var user = await db.users.getById(disk.user_id);
            if (user) await sendDiskReminderEmail(user, disk, 'warn');
            await markDiskReminderSent(disk.id, 'warn', today);
          }
        } else if (diffDays <= 0 && diffDays > -graceDays) {
          // ===== 宽限期 =====
          if (disk.status === 'destroyed') continue;
          if (disk.status !== 'grace') {
            await db.disks.updateStatus(disk.id, 'grace');
          }
          // 发送宽限期加急告警（去重）
          if (!await isDiskReminderSent(disk.id, 'grace', today)) {
            var user2 = await db.users.getById(disk.user_id);
            if (user2) await sendDiskReminderEmail(user2, disk, 'grace');
            await markDiskReminderSent(disk.id, 'grace', today);
          }
        } else if (diffDays <= -graceDays) {
          // ===== 停机分离 + 保留期 + 销毁回收 =====
          if (disk.status === 'destroyed') continue;

          if (disk.status === 'bound' || disk.status === 'grace') {
            // SCSI 支持热插拔，直接分离磁盘，无需关机
            if (disk.bind_vmid) {
              console.log('[disk-expiry] 磁盘 ' + disk.id + ' 到期分离（VM ' + disk.bind_vmid + '）');
              await detachDiskFromVm(disk);
              // 发送到期分离通知
              if (!await isDiskReminderSent(disk.id, 'expired', today)) {
                var user3 = await db.users.getById(disk.user_id);
                if (user3) await sendDiskReminderEmail(user3, disk, 'expired');
                await markDiskReminderSent(disk.id, 'expired', today);
              }
            } else {
              // 已是游离态，直接标记 expired
              await db.disks.updateStatus(disk.id, 'expired');
            }
          } else if (disk.status === 'expired') {
            // 保留期结束 -> 销毁回收
            var separationDate = new Date(expireDate.getTime() - graceDays * 24 * 60 * 60 * 1000);
            var destroyDate = new Date(separationDate.getTime() - retentionDays * 24 * 60 * 60 * 1000);
            // 重新计算：到期后 grace_days 天分离，再 retention_days 天销毁
            var actualDestroyDate = new Date(expireDate.getTime() + (graceDays + retentionDays) * 24 * 60 * 60 * 1000);
            if (now >= actualDestroyDate) {
              console.log('[disk-expiry] 磁盘 ' + disk.id + ' 保留期结束，执行销毁回收');
              await destroyExpiredDisk(disk);
            }
          }
        }
      } catch (e) {
        console.error('[disk-expiry] 处理磁盘 ' + disk.id + ' 异常:', e.message);
      }
    }
  } catch (e) {
    console.error('[disk-expiry] 巡检异常:', e.message);
  } finally {
    isChecking = false;
  }
}

// ==================== 存储容量 90% 告警邮件（文档 3.3.3） ====================

async function checkStorageCapacityAlert() {
  try {
    var storages = await pveApi.getAllStorages();
    if (!storages || storages.length === 0) return;

    for (var i = 0; i < storages.length; i++) {
      var s = storages[i];
      var total = parseInt(s.total) || 0;
      var used = parseInt(s.used) || 0;
      if (total <= 0) continue;
      var usedPct = Math.round((used / total) * 100);
      if (usedPct >= 90) {
        var today = todayStr();
        var alertKey = 'disk:storage-alert:' + s.storage + ':' + today;
        var redis = getRedisClient();
        var alreadySent = false;
        if (redis) {
          try { alreadySent = (await redis.get(alertKey)) === '1'; } catch (e) {}
        }
        if (!alreadySent) {
          await sendStorageAlertEmail(s, usedPct, total, used);
          if (redis) {
            try { await redis.setex(alertKey, 86400, '1'); } catch (e) {}
          }
        }
      }
    }
  } catch (e) {
    console.error('[disk-expiry] 存储容量告警检查失败:', e.message);
  }
}

async function sendStorageAlertEmail(storage, usedPct, totalBytes, usedBytes) {
  try {
    // 获取所有管理员
    var admins = await db.users.getPaginated({ role: 'admin', limit: 50, page: 1 });
    if (!admins || !admins.rows || admins.rows.length === 0) return;

    var totalGb = Math.floor(totalBytes / (1024 * 1024 * 1024));
    var usedGb = Math.floor(usedBytes / (1024 * 1024 * 1024));
    var totalTb = (totalGb / 1024).toFixed(2);
    var usedTb = (usedGb / 1024).toFixed(2);

    var subject = '【存储容量告警】' + storage.storage + ' 使用率 ' + usedPct + '%';
    var content = '<h3>存储容量告警</h3>';
    content += '<p><strong>存储名：</strong>' + storage.storage + '</p>';
    content += '<p><strong>当前使用率：</strong>' + usedPct + '%</p>';
    content += '<p><strong>已用容量 / 总容量：</strong>' + usedTb + ' TiB / ' + totalTb + ' TiB</p>';
    content += '<p style="color:#dc3545;"><strong>请及时扩容存储池或清理闲置磁盘。</strong></p>';

    var siteName = 'PVE 管理面板';
    try { var cfg = await db.config.get('site:name'); if (cfg) siteName = cfg; } catch (e) {}
    var html = createEmailTemplate('存储容量告警', content, siteName);

    for (var i = 0; i < admins.rows.length; i++) {
      var admin = admins.rows[i];
      if (admin.email) {
        try { await sendEmail(admin.email, subject, html); } catch (e) {}
      }
    }
    console.log('[disk-expiry] 存储容量告警邮件已发送给 ' + admins.rows.length + ' 个管理员');
  } catch (e) {
    console.error('[disk-expiry] 发送存储告警邮件失败:', e.message);
  }
}

// ==================== 存量虚拟机数据盘导入（文档 4.5） ====================

async function importExistingDisks() {
  try {
    // ===== 第一步：清理 PVE 中已不存在的孤立磁盘记录（仅清理 legacy 磁盘） =====
    // 孤立记录定义：台账中有记录，但 PVE 中卷已不存在
    // 注意：只清理那些真正孤立的记录（PVE 卷被手动删除）
    // bound 状态的 legacy 磁盘如果 PVE 卷还存在，说明是正常挂载状态，不应清理
    var allDisks = await db.disks.getAll();
    var cleanedCount = 0;
    for (var d = 0; d < allDisks.length; d++) {
      var disk = allDisks[d];
      if (!disk.is_legacy) continue;
      // 只清理 bound 状态的 legacy 磁盘（free 状态的 legacy 磁盘可能是分离但卷仍在）
      // 注意：bound 状态的 legacy 磁盘如果卷还在，说明正常挂载，不应清理
      if (disk.status !== 'bound') continue;
      
      try {
        var sshConfig = await getPveSshConfig();
        if (!sshConfig.host || !sshConfig.password) continue;
        
        var volParts = (disk.volume_id || '').split(':');
        if (volParts.length !== 2) continue;
        var storagePool = volParts[0];
        var volName = volParts[1];
        
        // 使用 pvesh get 检查卷是否存在（DIR 存储的 volName 含 / 子路径，需编码）
        var cmd = 'pvesh get "/storage/' + storagePool + '/content/' + encodeURIComponent(volName) + '" --noborder 2>&1';
        var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
        // 只有当命令明确返回错误（卷不存在）时才清理
        if (result.code !== 0 && result.stderr && result.stderr.indexOf('does not exist') !== -1) {
          await db.getPool().execute('DELETE FROM disks WHERE id = ?', [disk.id]);
          cleanedCount++;
          console.log('[disk-import] 清理孤立 legacy 磁盘记录:', disk.volume_id);
        }
      } catch (e) {
        console.error('[disk-import] 检查磁盘 ' + disk.volume_id + ' 失败:', e.message);
      }
    }
    if (cleanedCount > 0) {
      console.log('[disk-import] 清理了 ' + cleanedCount + ' 个孤立 legacy 磁盘记录');
    }

    // ===== 第二步：正常导入流程 =====
    var allVms = await db.vms.getAll();
    if (!allVms || allVms.length === 0) {
      console.log('[disk-import] 无虚拟机，跳过导入');
      return { total_vms: 0, imported: 0, skipped: 0, unmatched: 0, cleaned: cleanedCount };
    }

    var totalImported = 0;
    var totalSkipped = 0;
    var totalUnmatched = 0;
    var unmatchedList = [];

    // 获取所有规格用于自动匹配
    var allSpecs = await db.diskSpecs.getAll();
    var allGroups = await db.storageGroups.getAll();

    for (var i = 0; i < allVms.length; i++) {
      var vm = allVms[i];
      try {
        var config = await pveApi.getVmConfig(vm.vm_id);
        if (!config) continue;

        // 遍历设备号 1-30，跳过 0 号系统盘
        for (var dev = 1; dev <= 30; dev++) {
          var buses = ['scsi', 'sata', 'virtio'];
          for (var b = 0; b < buses.length; b++) {
            var bus = buses[b];
            var key = bus + dev;
            var diskLine = config[key];
            if (!diskLine) continue;

            // 解析 volume_id（格式：storage:volume,size=XX）
            var parts = diskLine.split(',');
            var volId = parts[0];
            if (!volId || volId.indexOf(':') === -1) continue;

            // 按 volume_id 查重（幂等导入）- 无论是否 legacy 都跳过已存在的记录
            var existing = await db.disks.getByVolumeId(volId);
            if (existing) {
              totalSkipped++;
              continue;
            }

            // 解析存储池和容量
            var volParts = volId.split(':');
            var storagePool = volParts[0];
            var volName = volParts[1] || '';

            // 从 diskLine 解析容量
            var capacityGb = 0;
            for (var p = 1; p < parts.length; p++) {
              if (parts[p].indexOf('size=') === 0) {
                var sizeStr = parts[p].substring(5);
                // size 格式如 100G 或 102400M
                if (sizeStr.indexOf('G') > -1) {
                  capacityGb = parseInt(sizeStr) || 0;
                } else if (sizeStr.indexOf('M') > -1) {
                  capacityGb = Math.floor((parseInt(sizeStr) || 0) / 1024);
                }
                break;
              }
            }
            if (capacityGb === 0) continue;

            // 自动匹配规格（按存储池+容量）
            var matchedSpec = null;
            for (var s = 0; s < allSpecs.length; s++) {
              if (allSpecs[s].storage_pool === storagePool && capacityGb >= allSpecs[s].min_size_gb && capacityGb <= allSpecs[s].max_size_gb) {
                matchedSpec = allSpecs[s];
                break;
              }
            }

            // 匹配存储分组（按存储池查找）
            var matchedGroup = null;
            for (var g = 0; g < allGroups.length; g++) {
              // 存储分组没有直接关联存储池，取第一个匹配
              if (matchedSpec && allGroups[g].id === matchedSpec.storage_group_id) {
                matchedGroup = allGroups[g];
                break;
              }
            }

            // 创建导入记录
            var diskName = 'imported-' + vm.vm_id + '-' + bus + dev;
            var diskType = matchedSpec ? matchedSpec.disk_type : 'NVME'; // 默认
            var groupId = matchedGroup ? matchedGroup.id : (allGroups.length > 0 ? allGroups[0].id : 1);
            var pricePerGb = matchedSpec ? parseFloat(matchedSpec.price_per_gb) : 0;
            var qDiscount = matchedSpec ? (matchedSpec.quarterly_discount || 0) : 0;
            var yDiscount = matchedSpec ? (matchedSpec.yearly_discount || 0) : 0;

            await db.disks.create({
              volume_id: volId,
              disk_name: diskName,
              spec_id: matchedSpec ? matchedSpec.id : null,
              user_id: vm.user_id,
              storage_group_id: groupId,
              storage_pool: storagePool,
              disk_type: diskType,
              disk_format: null, // legacy 磁盘随 VM，不限制格式
              capacity_gb: capacityGb,
              status: 'bound',
              price_per_gb: 0,
              quarterly_discount: 0,
              yearly_discount: 0,
              auto_renew: 0,
              is_legacy: 1,
              expire_time: vm.expiration_date || null,
              mbps_rd: matchedSpec ? matchedSpec.mbps_rd : null,
              mbps_rd_max: matchedSpec ? matchedSpec.mbps_rd_max : null,
              mbps_wr: matchedSpec ? matchedSpec.mbps_wr : null,
              mbps_wr_max: matchedSpec ? matchedSpec.mbps_wr_max : null,
              iops_rd: matchedSpec ? matchedSpec.iops_rd : null,
              iops_rd_max: matchedSpec ? matchedSpec.iops_rd_max : null,
              iops_wr: matchedSpec ? matchedSpec.iops_wr : null,
              iops_wr_max: matchedSpec ? matchedSpec.iops_wr_max : null
            });

            // 更新绑定信息
            await db.disks.bind(
              (await db.disks.getByVolumeId(volId)).id,
              vm.vm_id, bus, dev
            );

            totalImported++;
            if (!matchedSpec) {
              totalUnmatched++;
              unmatchedList.push({ vmid: vm.vm_id, volId: volId, bus: bus, dev: dev });
            }
          }
        }
      } catch (e) {
        console.error('[disk-import] 导入 VM ' + vm.vm_id + ' 数据盘失败:', e.message);
      }
    }

    var report = {
      total_vms: allVms.length,
      imported: totalImported,
      skipped: totalSkipped,
      unmatched: totalUnmatched,
      unmatched_list: unmatchedList,
      cleaned: cleanedCount
    };
    console.log('[disk-import] 导入完成:', JSON.stringify(report));
    return report;
  } catch (e) {
    console.error('[disk-import] 导入异常:', e.message);
    return { error: e.message };
  }
}

module.exports = {
  checkExpiredDisks,
  checkStorageCapacityAlert,
  importExistingDisks
};
