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
  console.log('[createDisk] pvesm alloc stdout:', JSON.stringify(stdout), 'volName:', volName, 'storage:', safeStorage);

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
  console.log('[createDisk] 返回 volume_id:', volumeId);
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

// 卸载磁盘 - qm set <vmid> --delete <bus><dev>
// 标准卸载方式，兼容所有存储类型（DIR/LVM/BTRFS 等）
// 注意：Windows VM 可能因磁盘仍被占用而报 "still busy in guest"，
// 但此时 guest 内磁盘实际已卸载，PVE 配置层留划线状态（用户可手动点还原清理）
async function unbindDisk(vmid, bus, dev) {
  var safeVmid = validateParam('vmid', vmid);
  var busDev = validateBusDev(bus, dev); // 禁止系统盘位置

  var cmd = 'qm set ' + safeVmid + ' --delete ' + busDev;
  try {
    await runSshCommand(cmd);
  } catch (e) {
    var errMsg = e.message || '';
    // busy 错误（Windows VM 常见）：guest 内磁盘已卸载，PVE 留划线状态
    if (errMsg.indexOf('still busy') !== -1 || errMsg.indexOf('hotplug') !== -1) {
      throw new Error('磁盘已在虚拟机内卸载，但 PVE 配置仍保留划线状态，请到 PVE 管理界面点击该磁盘的「还原」按钮清理');
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
        console.error('[disk-utils] 卸载中转磁盘失败:', e.message);
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
};
