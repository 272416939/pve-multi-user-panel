// server/services/holding-vm.js - 游离数据盘中转 VM 托管服务
// 卸载数据盘后，将其 moveDisk 到常驻中转 VM（默认 9999）托管，
// 避免用户销毁 VM 时连带删除数据盘卷。
// 后续扩展：9999 槽位（scsi1-30 + unused0-9）满后可自动创建新的中转 VM。

const db = require('../api/db');
const { getPveClient } = require('../api/pve-clients');
const { execSSH, getPveSshConfig } = require('../api/ssh-exec');

// 默认中转 VM ID（从 config 读取，可配置）
const DEFAULT_HOLDING_VMID = 9999;
// 中转 VM 最大槽位数（scsi1~scsi30）
const MAX_SLOTS = 30;

// ==================== 节点上下文解析 ====================
// 多节点：中转 VM 必须与用户 VM 同节点，按目标 VM/磁盘行的 pve_node_id 解析（查不到回退默认节点）
async function resolveNodeIdByVmid(vmid) {
  try {
    var row = await db.vms.getByVmid(vmid);
    if (row && row.pve_node_id != null) return row.pve_node_id;
  } catch (e) {}
  return null;
}

async function resolveNodeIdByVolumeId(volumeId) {
  try {
    var row = await db.disks.getByVolumeId(volumeId);
    if (row && row.pve_node_id != null) return row.pve_node_id;
  } catch (e) {}
  return null;
}

/**
 * 获取中转 VM ID（从 DB config 读取，默认 9999）
 */
async function getHoldingVmid() {
  try {
    var cfgVal = await db.config.get('disk:temp_vmid');
    if (cfgVal) return parseInt(cfgVal);
  } catch (e) {}
  return DEFAULT_HOLDING_VMID;
}

/**
 * 确保中转 VM 存在（不存在则通过 SSH qm create 创建最小 VM）
 * @param {number} holdingVmid
 * @param {number|null} nodeId - pve_nodes.id（null=默认节点）
 */
async function ensureHoldingVm(holdingVmid, nodeId) {
  var vmid = parseInt(holdingVmid) || DEFAULT_HOLDING_VMID;
  var pve = await getPveClient(nodeId != null ? nodeId : null);
  try {
    await pve.getVmConfig(vmid);
    return vmid; // 已存在
  } catch (e) {
    // VM 不存在，创建最小配置（无磁盘，仅承载托管数据盘）
    var sshConfig = await getPveSshConfig(nodeId != null ? nodeId : null);
    if (!sshConfig.host || !sshConfig.password) throw new Error('SSH 配置不完整');
    // qm create <vmid> --name holding-disk --memory 64 --cores 1 --net0 none --scsihw virtio-scsi-pci
    var cmd = 'qm create ' + vmid + ' --name holding-disk --memory 64 --cores 1 --scsihw virtio-scsi-pci';
    var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd, 600000, sshConfig.port);
    if (result.code !== 0) {
      // 可能并发创建，已存在则忽略
      try {
        await pve.getVmConfig(vmid);
        return vmid;
      } catch (e2) {
        throw new Error('创建中转 VM ' + vmid + ' 失败: ' + (result.stderr || result.stdout || ''));
      }
    }
    console.log('[holding-vm] 中转 VM ' + vmid + ' 已创建');
    return vmid;
  }
}

/**
 * 扫描中转 VM 配置，查找空闲 scsi 槽位（scsi1~scsi30）
 * @param {number} holdingVmid
 * @param {number|null} nodeId - pve_nodes.id（null=默认节点）
 * @returns {Promise<string|null>} 空闲槽位键（如 'scsi3'），无空闲返回 null
 */
async function findFreeHoldingSlot(holdingVmid, nodeId) {
  var config;
  var pve = await getPveClient(nodeId != null ? nodeId : null);
  try {
    config = await pve.getVmConfig(holdingVmid);
  } catch (e) {
    config = {};
  }
  for (var dev = 1; dev <= MAX_SLOTS; dev++) {
    var key = 'scsi' + dev;
    if (!config[key]) {
      return key;
    }
  }
  return null;
}

/**
 * 将磁盘从用户 VM 转移到中转 VM 托管
 * @param {number} sourceVmid - 用户 VM ID
 * @param {string} sourceDisk - 源磁盘标识（如 'scsi1' 或 'unused0'）
 * @param {number} holdingVmid - 中转 VM ID
 * @param {string} targetSlot - 目标槽位（如 'scsi3'）
 * @param {number|null} nodeId - pve_nodes.id（null=默认节点，按 sourceVmid 行回退解析）
 */
async function moveDiskToHolding(sourceVmid, sourceDisk, holdingVmid, targetSlot, nodeId) {
  // 校验参数（防止注入）
  if (!/^scsi\d+$/.test(String(sourceDisk)) && !/^unused\d+$/.test(String(sourceDisk))) {
    throw new Error('无效的源磁盘标识: ' + sourceDisk);
  }
  if (!/^scsi\d+$/.test(String(targetSlot))) {
    throw new Error('无效的目标槽位: ' + targetSlot);
  }
  nodeId = nodeId != null ? nodeId : await resolveNodeIdByVmid(sourceVmid);
  var pve = await getPveClient(nodeId != null ? nodeId : null);
  var upid = await pve.moveDisk(sourceVmid, sourceDisk, holdingVmid, targetSlot);
  try {
    await pve.waitForTask(upid, 300000);
  } catch (e) {
    // 任务等待失败：如果目标槽位实际已存在，说明 move 已完成，容错
    var verify = null;
    try {
      verify = await pve.getVmConfig(holdingVmid);
    } catch (_) {}
    if (!(verify && verify[targetSlot])) {
      throw e;
    }
    console.log('[holding-vm] move_disk 任务状态异常但目标槽位已存在，视为完成: ' + targetSlot);
  }
  return targetSlot;
}

/**
 * 将磁盘从中转 VM 转移到用户 VM
 * @param {number} holdingVmid - 中转 VM ID
 * @param {string} sourceSlot - 中转 VM 上的源槽位（如 'scsi3'）
 * @param {number} targetVmid - 用户 VM ID
 * @param {string} targetSlot - 目标槽位（如 'scsi7'）
 * @param {number|null} nodeId - pve_nodes.id（null=默认节点，按 targetVmid 行回退解析）
 */
async function moveDiskFromHolding(holdingVmid, sourceSlot, targetVmid, targetSlot, nodeId) {
  if (!/^scsi\d+$/.test(String(sourceSlot)) && !/^unused\d+$/.test(String(sourceSlot))) {
    throw new Error('无效的源槽位: ' + sourceSlot);
  }
  if (!/^scsi\d+$/.test(String(targetSlot))) {
    throw new Error('无效的目标槽位: ' + targetSlot);
  }
  nodeId = nodeId != null ? nodeId : await resolveNodeIdByVmid(targetVmid);
  var pve = await getPveClient(nodeId != null ? nodeId : null);
  var upid = await pve.moveDisk(holdingVmid, sourceSlot, targetVmid, targetSlot);
  try {
    await pve.waitForTask(upid, 300000);
  } catch (e) {
    // 任务等待失败：如果目标 VM 槽位实际已存在，说明 move 已完成，容错
    var verify = null;
    try {
      verify = await pve.getVmConfig(targetVmid);
    } catch (_) {}
    if (!(verify && verify[targetSlot])) {
      throw e;
    }
    console.log('[holding-vm] move_disk 任务状态异常但目标槽位已存在，视为完成: ' + targetSlot);
  }
  return targetSlot;
}

/**
 * 在中转 VM 中查找与给定 volume_id 匹配的实际卷（自愈用）
 * move_disk 会重命名卷（vm-<旧VM>-disk-<N> → vm-<新VM>-disk-<N>），
 * 但存储前缀和磁盘编号不变。DB 中 volume_id 可能已过期，
 * 用「存储前缀 + disk-编号」在中转 VM 中定位实际卷。
 * @param {string} volumeId - DB 中可能过期的 volume_id
 * @param {number|null} nodeId - pve_nodes.id（null=默认节点，按 volume_id 磁盘行回退解析）
 * @returns {Promise<object|null>} { holdingVmid, holdingSlot, volume_id } 或 null
 */
async function findVolumeInHolding(volumeId, nodeId) {
  if (!volumeId || typeof volumeId !== 'string') return null;
  var holdingVmid = await getHoldingVmid();
  nodeId = nodeId != null ? nodeId : await resolveNodeIdByVolumeId(volumeId);
  var pve = await getPveClient(nodeId != null ? nodeId : null);
  var config = null;
  try { config = await pve.getVmConfig(holdingVmid); } catch (e) { return null; }
  if (!config) return null;

  // 解析磁盘编号和存储前缀：hdd5:101/vm-101-disk-0.qcow2 -> idx=0, storage=hdd5
  var m = String(volumeId).match(/disk-(\d+)(\.(raw|qcow2|vmdk|subvol))?$/);
  if (!m) return null;
  var diskIdx = m[1];
  var storage = String(volumeId).split(':')[0];
  if (!storage) return null;

  // 扫描中转 VM 的 scsi 槽位（含 unused）
  for (var dev = 1; dev <= 30; dev++) {
    var val = config['scsi' + dev];
    if (!val) continue;
    var vol = val.split(',')[0];
    if (!vol) continue;
    // 存储前缀匹配 + 卷名含 disk-<idx>
    if (vol.indexOf(storage + ':') === 0 && new RegExp('disk-' + diskIdx + '(\\.|$)').test(vol)) {
      return { holdingVmid: holdingVmid, holdingSlot: 'scsi' + dev, volume_id: vol };
    }
  }
  // 也检查 unused 槽位
  for (var ui = 0; ui <= 9; ui++) {
    var uval = config['unused' + ui];
    if (!uval) continue;
    var uvol = String(uval).split(',')[0];
    if (uvol && uvol.indexOf(storage + ':') === 0 && new RegExp('disk-' + diskIdx + '(\\.|$)').test(uvol)) {
      return { holdingVmid: holdingVmid, holdingSlot: 'unused' + ui, volume_id: uvol };
    }
  }
  return null;
}

module.exports = {
  DEFAULT_HOLDING_VMID,
  getHoldingVmid,
  ensureHoldingVm,
  findFreeHoldingSlot,
  moveDiskToHolding,
  moveDiskFromHolding,
  findVolumeInHolding,
};
