// server/utils/disk-utils.js - 磁盘 PVE 命令封装（安全设计：白名单正则 + parseInt + 枚举校验）
// 安全规则：所有用户可控参数在拼接前经过 validateParam 校验，永不全量拼接用户输入

var crypto = require('crypto');
var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
var pveApi = require('../api/pve-api');
var { calculateAmount } = require('./order-utils');
var logger = require('./logger');

// ==================== 参数白名单校验 ====================
// 参照文档 7.2.1 节：每个参数在拼接前经过严格白名单校验
var PARAM_PATTERNS = {
  vmid:     { type: 'int', min: 100, max: 999999999 },
  storage:  { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ },
  volumeId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./\-]+$/ },
  bus:      { type: 'enum', values: ['scsi', 'sata', 'virtio'] },
  dev:      { type: 'int', min: 1, max: 30 }, // 永不从 0 开始（系统盘保护）
  sizeGb:   { type: 'int', min: 1, max: 10000 },
  diskType: { type: 'enum', values: ['NVME', 'SATA', 'HDD', 'U2'] },
  diskFormat: { type: 'enum', values: ['raw', 'qcow2', 'vmdk', 'subvol'] },
};

// 系统盘总线设备名防护：禁止操作 *0（如 scsi0、virtio0、sata0）
function isSystemDiskBus(bus, dev) {
  return parseInt(dev) === 0;
}

// 校验总线设备名（如 scsi1）非系统盘
function validateBusDev(bus, dev) {
  var safeBus = validateParam('bus', bus);
  var safeDev = validateParam('dev', dev);
  if (isSystemDiskBus(safeBus, safeDev)) {
    throw new Error('禁止操作系统盘（' + safeBus + safeDev + '）');
  }
  return safeBus + safeDev;
}

function validateParam(name, value) {
  var rule = PARAM_PATTERNS[name];
  if (!rule) throw new Error('未知参数: ' + name);

  if (rule.type === 'int') {
    var num = parseInt(value);
    if (!Number.isInteger(num) || num < rule.min || num > rule.max) {
      throw new Error('参数 ' + name + ' 超出有效范围 (' + rule.min + '-' + rule.max + ')');
    }
    return num;
  }

  if (rule.type === 'enum') {
    if (rule.values.indexOf(value) === -1) {
      throw new Error('参数 ' + name + ' 值无效，允许值: ' + rule.values.join(', '));
    }
    return value;
  }

  if (rule.type === 'string' && rule.pattern) {
    if (!rule.pattern.test(value)) {
      throw new Error('参数 ' + name + ' 格式无效');
    }
    return value;
  }

  throw new Error('参数 ' + name + ' 校验规则异常');
}

// ==================== 系统盘防护 ====================
// 参照文档 7.5 节：永不触碰系统盘 vm-*-disk-0，三层过滤
function validateVolumeId(volumeId) {
  // 第一层：正则白名单
  validateParam('volumeId', volumeId);
  // 第二层：前缀校验（仅允许数据盘卷）
  var parts = volumeId.split(':');
  var volName = parts[1] || '';
  // DIR/BTRFS 存储的 volume_id 含子路径（如 9999/vm-9999-disk-0.raw），
  // 需取最后一段 / 之后的实际卷名再做前缀校验
  var lastSeg = volName.split('/').pop() || volName;
  // 允许 vm- 前缀（PVE 命名规范）、disk-pool- 前缀或 imported- 前缀（存量导入）
  if (lastSeg.indexOf('vm-') !== 0 && lastSeg.indexOf('disk-pool-') !== 0 && lastSeg.indexOf('imported-') !== 0) {
    throw new Error('不允许操作非数据盘卷（仅允许 disk-pool- 或 imported- 前缀）');
  }
  // 第三层：禁止操作系统盘（兼容 .raw/.qcow2/.vmdk/.subvol 扩展名）
  if (/disk-0(\.(raw|qcow2|vmdk|subvol))?$/.test(lastSeg)) {
    throw new Error('禁止操作系统盘');
  }
  return volumeId;
}

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

// 从 volume_id 推断磁盘格式（如 vm-9999-disk-0.raw -> raw）
// 用于 qm set 时自动附加 format=xxx 参数（DIR 存储的 raw 文件必须显式指定 format）
function inferDiskFormat(volumeId) {
  if (!volumeId) return '';
  var parts = volumeId.split(':');
  var volName = parts[1] || '';
  var m = volName.match(/\.(raw|qcow2|vmdk|subvol)$/);
  return m ? m[1] : '';
}

// 挂载磁盘到 VM（注入限速参数）- qm set <vmid> --<bus><dev> <vol>,qos...
async function bindDisk(vmid, volumeId, bus, dev, qosParams) {
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
  await runSshCommand(cmd);
  return { bus: bus, dev: parseInt(dev) };
}

// 卸载磁盘 - qm unlink <vmid> --idlist <bus><dev>
// qm unlink 优于 qm set --delete：不留划线状态（Linux VM 完全清理）
// Windows VM 可能首次报 "virtioscsi busy"，但 guest 内磁盘已被移除，
// 此时自动重试一次即可成功从 PVE 配置移除（无需用户手动到 PVE 点还原）
async function unbindDisk(vmid, bus, dev) {
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
        return;
      } catch (e2) {
        // 重试仍失败，提示用户手动处理
        throw new Error('磁盘已在虚拟机内卸载，但 PVE 配置仍保留划线状态，请到 PVE 管理界面点击该磁盘的「还原」后再次卸载');
      }
    }
    throw e;
  }
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
        logger.error('[disk-utils] 卸载中转磁盘失败:', e.message);
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

// ==================== 计费计算 ====================
// 参照文档 8.4 节：复用 calculateAmount，price_per_gb * capacity 作为 monthlyPrice
function calcDiskAmount(spec, capacityGb, period, periodCount) {
  var monthlyPrice = parseFloat(spec.price_per_gb) * parseInt(capacityGb);
  return calculateAmount(
    monthlyPrice,
    period,
    periodCount,
    parseInt(spec.quarterly_discount) || 0,
    parseInt(spec.yearly_discount) || 0
  );
}

// 续费金额（使用磁盘购买时的价格快照）
function calcRenewAmount(disk, period, periodCount) {
  var monthlyPrice = parseFloat(disk.price_per_gb) * parseInt(disk.capacity_gb);
  return calculateAmount(
    monthlyPrice,
    period,
    periodCount,
    parseInt(disk.quarterly_discount) || 0,
    parseInt(disk.yearly_discount) || 0
  );
}

/**
 * 计算扩容费用
 * 新增容量 × 每GiB月单价 ÷ 30 × 剩余天数（按天折算）
 * @param {number} oldSizeGb - 当前容量 GiB
 * @param {number} newSizeGb - 新容量 GiB
 * @param {number} pricePerGb - 月每GiB单价
 * @param {string|Date} expireTime - 当前到期时间
 * @returns {number} 扩容费用，-1 表示已过期
 */
function calcResizeAmount(oldSizeGb, newSizeGb, pricePerGb, expireTime) {
  var diffGb = newSizeGb - oldSizeGb;
  if (diffGb <= 0 || pricePerGb <= 0) return 0;
  var now = new Date();
  var expire = new Date(expireTime);
  if (expire <= now) return -1;
  var diffMs = expire - now;
  var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  var amount = (diffGb * pricePerGb / 30) * diffDays;
  return parseFloat(amount.toFixed(2));
}

// ==================== 系统切换内部函数（仅供 os-switch-utils.js 使用） ====================
// 绕过 dev=0 检查，仅通过 Node.js 进程内 require 访问，不暴露给 HTTP 路由层

/**
 * 从 PVE VM config 中提取所有磁盘 volume_id
 * 精确区分系统盘、数据盘和 CD-ROM：
 * - 系统盘：dev=0 且不是 CD-ROM（ide 总线 dev=0 也可能是光驱，需额外判断）
 * - CD-ROM：media=cdrom 或无 volume_id（仅挂载 ISO 镜像）
 * - 数据盘：不是系统盘也不是 CD-ROM 的磁盘
 * @param {object} config - PVE getVmConfig 返回的配置
 * @returns {object} { all: [volume_id, ...], system: [volume_id, ...], data: [volume_id, ...] }
 */
function getVmDiskVolumes(config) {
  if (!config || typeof config !== 'object') return { all: [], system: [], data: [] };
  var all = [];
  var system = [];
  var data = [];
  // PVE 磁盘设备命名规范：scsi0-30, sata0-30, virtio0-30, ide0-3
  var busList = ['scsi', 'sata', 'virtio', 'ide'];
  for (var b = 0; b < busList.length; b++) {
    var bus = busList[b];
    var maxDev = bus === 'ide' ? 3 : 30;
    for (var d = 0; d <= maxDev; d++) {
      var key = bus + d;
      var val = config[key];
      if (!val || typeof val !== 'string') continue;

      // 值格式如 "local-lvm:vm-100-disk-0,size=32G" 或 "media=cdrom" 或 "local:iso/debian.iso,media=cdrom"
      var parts = val.split(',');
      var volPart = parts[0];
      if (!volPart) continue;

      // 判断是否为 CD-ROM：media=cdrom 或 挂载的是 ISO 文件（非磁盘卷）
      var isCdrom = false;
      for (var p = 0; p < parts.length; p++) {
        if (parts[p] === 'media=cdrom') {
          isCdrom = true;
          break;
        }
      }
      // 如果 volume_id 部分以 .iso 结尾，也视为光驱
      if (volPart.toLowerCase().indexOf('.iso') > -1) {
        isCdrom = true;
      }

      // 跳过 CD-ROM（光驱不参与快照对账）
      if (isCdrom) continue;

      // 如果已经包含冒号则为完整 volume_id
      if (volPart.indexOf(':') === -1) continue; // 非标准格式跳过

      all.push(volPart);
      // 系统盘判定：device=0 的盘即为系统盘
      if (d === 0) {
        system.push(volPart);
      } else {
        data.push(volPart);
      }
    }
  }
  return { all: all, system: system, data: data };
}

/**
 * 判断 volume_id 是否是系统盘（*-disk-0）
 * @param {string} volumeId
 * @returns {boolean}
 */
function isSystemDiskVol(volumeId) {
  if (!volumeId || typeof volumeId !== 'string') return false;
  var parts = volumeId.split(':');
  var volName = parts[1] || '';
  var lastSeg = volName.split('/').pop() || volName;
  return /disk-0(\.(raw|qcow2|vmdk|subvol))?$/.test(lastSeg);
}

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
			  validateParam,
			  validateVolumeId,
			  createDisk,
			  bindDisk,
			  unbindDisk,
			  resizeDisk,
			  destroyDisk,
			  getSystemDiskBus,
			  getAvailableDevNumber,
			  checkStorageCapacity,
			  calcDiskAmount,
			  calcRenewAmount,
			  calcResizeAmount,
			  inferDiskFormat,
			  getVmDiskVolumes,
			  isSystemDiskVol,
			  _internal,
			};
