// server/utils/disk-validation.js - 磁盘参数校验（纯函数，无外部依赖）
// 规范第七节：纯工具进 utils/，不依赖 api/services 层
// 自 utils/disk-utils.js 拆分：白名单校验 + 卷名安全校验 + 系统盘判定

// 单一来源：磁盘类型/格式白名单统一走 constants（规范第七节）
var { DISK_TYPES, DISK_FORMATS } = require('../constants');

// ==================== 参数白名单校验 ====================
// 参照文档 7.2.1 节：每个参数在拼接前经过严格白名单校验
var PARAM_PATTERNS = {
  vmid:     { type: 'int', min: 100, max: 999999999 },
  storage:  { type: 'string', pattern: /^[a-zA-Z0-9_-]+$/ },
  volumeId: { type: 'string', pattern: /^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./\-]+$/ },
  bus:      { type: 'enum', values: ['scsi', 'sata', 'virtio'] },
  dev:      { type: 'int', min: 1, max: 30 }, // 永不从 0 开始（系统盘保护）
  sizeGb:   { type: 'int', min: 1, max: 10000 },
  diskType: { type: 'enum', values: DISK_TYPES },
  diskFormat: { type: 'enum', values: DISK_FORMATS },
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

// ==================== 卷名安全校验 ====================
// 系统盘保护在总线/设备号层（validateBusDev 禁止 dev=0），卷名本身不决定是否系统盘
// PVE 恢复后 volume_id 可能为 vm-<target>-disk-0（编号从 0 开始），这仍然是数据盘
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

module.exports = {
  PARAM_PATTERNS,
  validateParam,
  validateVolumeId,
  validateBusDev,
  isSystemDiskBus,
  inferDiskFormat,
  getVmDiskVolumes,
  isSystemDiskVol,
};
