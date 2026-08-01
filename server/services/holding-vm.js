// server/services/holding-vm.js - 游离数据盘中转 VM 托管服务
// 卸载数据盘后，将其 moveDisk 到常驻中转 VM（默认 9999）托管，
// 避免用户销毁 VM 时连带删除数据盘卷。
// 后续扩展：9999 槽位（scsi1-30 + unused0-9）满后可自动创建新的中转 VM。

const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { execSSH, getPveSshConfig } = require('../api/ssh-exec');

// 默认中转 VM ID（从 config 读取，可配置）
const DEFAULT_HOLDING_VMID = 9999;
// 中转 VM 最大槽位数（scsi1~scsi30）
const MAX_SLOTS = 30;

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
 */
async function ensureHoldingVm(holdingVmid) {
  var vmid = parseInt(holdingVmid) || DEFAULT_HOLDING_VMID;
  try {
    await pveApi.getVmConfig(vmid);
    return vmid; // 已存在
  } catch (e) {
    // VM 不存在，创建最小配置（无磁盘，仅承载托管数据盘）
    var sshConfig = await getPveSshConfig();
    if (!sshConfig.host || !sshConfig.password) throw new Error('SSH 配置不完整');
    // qm create <vmid> --name holding-disk --memory 64 --cores 1 --net0 none --scsihw virtio-scsi-pci
    var cmd = 'qm create ' + vmid + ' --name holding-disk --memory 64 --cores 1 --scsihw virtio-scsi-pci';
    var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
    if (result.code !== 0) {
      // 可能并发创建，已存在则忽略
      try {
        await pveApi.getVmConfig(vmid);
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
 * @returns {Promise<string|null>} 空闲槽位键（如 'scsi3'），无空闲返回 null
 */
async function findFreeHoldingSlot(holdingVmid) {
  var config;
  try {
    config = await pveApi.getVmConfig(holdingVmid);
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
 */
async function moveDiskToHolding(sourceVmid, sourceDisk, holdingVmid, targetSlot) {
  // 校验参数（防止注入）
  if (!/^scsi\d+$/.test(String(sourceDisk)) && !/^unused\d+$/.test(String(sourceDisk))) {
    throw new Error('无效的源磁盘标识: ' + sourceDisk);
  }
  if (!/^scsi\d+$/.test(String(targetSlot))) {
    throw new Error('无效的目标槽位: ' + targetSlot);
  }
  var upid = await pveApi.moveDisk(sourceVmid, sourceDisk, holdingVmid, targetSlot);
  try {
    await pveApi.waitForTask(upid, 300000);
  } catch (e) {
    // 任务等待失败：如果目标槽位实际已存在，说明 move 已完成，容错
    var verify = null;
    try {
      verify = await pveApi.getVmConfig(holdingVmid);
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
 */
async function moveDiskFromHolding(holdingVmid, sourceSlot, targetVmid, targetSlot) {
  if (!/^scsi\d+$/.test(String(sourceSlot)) && !/^unused\d+$/.test(String(sourceSlot))) {
    throw new Error('无效的源槽位: ' + sourceSlot);
  }
  if (!/^scsi\d+$/.test(String(targetSlot))) {
    throw new Error('无效的目标槽位: ' + targetSlot);
  }
  var upid = await pveApi.moveDisk(holdingVmid, sourceSlot, targetVmid, targetSlot);
  try {
    await pveApi.waitForTask(upid, 300000);
  } catch (e) {
    // 任务等待失败：如果目标 VM 槽位实际已存在，说明 move 已完成，容错
    var verify = null;
    try {
      verify = await pveApi.getVmConfig(targetVmid);
    } catch (_) {}
    if (!(verify && verify[targetSlot])) {
      throw e;
    }
    console.log('[holding-vm] move_disk 任务状态异常但目标槽位已存在，视为完成: ' + targetSlot);
  }
  return targetSlot;
}

module.exports = {
  DEFAULT_HOLDING_VMID,
  getHoldingVmid,
  ensureHoldingVm,
  findFreeHoldingSlot,
  moveDiskToHolding,
  moveDiskFromHolding,
};
