// server/utils/disk-utils.js - 磁盘 PVE 命令封装（安全设计：白名单正则 + parseInt + 枚举校验）
// 安全规则：所有用户可控参数在拼接前经过 validateParam 校验，永不全量拼接用户输入

var crypto = require('crypto');
var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
var pveApi = require('../api/pve-api');
var { calculateAmount } = require('./order-utils');

// ==================== 参数白名单校验 ====================
// 参照文档 7.2.1 节：每个参数在拼接前经过严格白名单校验
var PARAM_PATTERNS = {
  vmid:     { type: 'int', min: 100, max: 999999999 },
  storage:  { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ },
  volumeId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_.\-]+$/ },
  bus:      { type: 'enum', values: ['scsi', 'sata', 'virtio'] },
  dev:      { type: 'int', min: 1, max: 30 }, // 永不从 0 开始（系统盘保护）
  sizeGb:   { type: 'int', min: 1, max: 10000 },
  diskType: { type: 'enum', values: ['NVME', 'SATA', 'HDD', 'U2'] },
};

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
  // 第二层：前缀校验（仅允许 disk-pool- 前缀的数据盘）
  var parts = volumeId.split(':');
  var volName = parts[1] || '';
  // 允许 vm- 前缀（PVE 命名规范）、disk-pool- 前缀或 imported- 前缀（存量导入）
  if (volName.indexOf('vm-') !== 0 && volName.indexOf('disk-pool-') !== 0 && volName.indexOf('imported-') !== 0) {
    throw new Error('不允许操作非数据盘卷（仅允许 disk-pool- 或 imported- 前缀）');
  }
  // 第三层：禁止操作系统盘
  if (/disk-0$/.test(volName)) {
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
async function createDisk(storage, sizeGb, userId, tempVmid) {
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

  // pvesm alloc 语法：pvesm alloc <storage> <vmid> <filename> <size>
  // vmid 必须是一个真实存在的 VM ID（不能为 0）
  var cmd = 'pvesm alloc ' + safeStorage + ' ' + safeVmid + ' ' + volName + ' ' + safeSize + 'G';
  var stdout = await runSshCommand(cmd);

  // 解析返回的 volume_id
  var volumeId = safeStorage + ':' + volName;
  // pvesm alloc 有时返回完整 volume_id，有时返回 volname
  if (stdout && stdout.indexOf(':') > -1 && stdout.indexOf(safeStorage) === 0) {
    volumeId = stdout.trim();
  }
  return volumeId;
}

// 挂载磁盘到 VM（注入限速参数）- qm set <vmid> --<bus><dev> <vol>,qos...
async function bindDisk(vmid, volumeId, bus, dev, qosParams) {
  var safeVmid = validateParam('vmid', vmid);
  var safeVol = validateVolumeId(volumeId);
  var safeBus = validateParam('bus', bus);
  var safeDev = validateParam('dev', dev);
  qosParams = qosParams || {};

  // VM 状态前置检查（必须关机）
  var vmStatus = await pveApi.getVmStatus(safeVmid);
  if (vmStatus.status !== 'stopped') {
    throw new Error('虚拟机必须处于关机状态才能挂载磁盘');
  }

  // 拼接限速参数（从数据库规格读取，非用户输入）
  var diskConfig = safeVol;
  var qosFields = ['mbps_rd', 'mbps_rd_max', 'mbps_wr', 'mbps_wr_max', 'iops_rd', 'iops_rd_max', 'iops_wr', 'iops_wr_max'];
  for (var i = 0; i < qosFields.length; i++) {
    var f = qosFields[i];
    if (qosParams[f] !== null && qosParams[f] !== undefined && qosParams[f] !== '') {
      diskConfig += ',' + f + '=' + parseInt(qosParams[f]);
    }
  }

  var cmd = 'qm set ' + safeVmid + ' --' + safeBus + safeDev + ' ' + diskConfig;
  await runSshCommand(cmd);
  return { bus: safeBus, dev: safeDev };
}

// 卸载磁盘 - qm set <vmid> --delete <bus><dev>
async function unbindDisk(vmid, bus, dev) {
  var safeVmid = validateParam('vmid', vmid);
  var safeBus = validateParam('bus', bus);
  var safeDev = validateParam('dev', dev);

  // VM 状态前置检查（必须关机）
  var vmStatus = await pveApi.getVmStatus(safeVmid);
  if (vmStatus.status !== 'stopped') {
    throw new Error('虚拟机正在运行，需先关机再卸载');
  }

  var cmd = 'qm set ' + safeVmid + ' --delete ' + safeBus + safeDev;
  await runSshCommand(cmd);
}

// 扩容磁盘 - pvesm resize <vol> <size>G
async function resizeDisk(volumeId, newSizeGb) {
  var safeVol = validateVolumeId(volumeId);
  var safeSize = validateParam('sizeGb', newSizeGb);

  var cmd = 'pvesm resize ' + safeVol + ' ' + safeSize + 'G';
  await runSshCommand(cmd);
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
};
