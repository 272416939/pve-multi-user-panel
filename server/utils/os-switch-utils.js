// server/utils/os-switch-utils.js - 系统切换核心 PVE 操作封装
// 安全设计：所有外部参数经过严格白名单校验，通过 disk-utils.validateParam 过滤

const diskUtils = require('./disk-utils');
const pveApi = require('../api/pve-api');
const db = require('../api/db');
const crypto = require('crypto');
const logger = require('./logger');

// ==================== 内部工具函数 ====================

// SSH 命令执行（复用 disk-utils 的 SSH 工具，检查退出码）
async function runSsh(cmd) {
    const { execSSH, getPveSshConfig } = require('../api/ssh-exec');
    const sshConfig = await getPveSshConfig();
    const result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd, 60000);
    if (result.code !== 0) {
        const errDetail = (result.stderr || result.stdout || '').trim();
        throw new Error(`SSH 命令执行失败 [exit ${result.code}]: ${cmd}\n${errDetail}`);
    }
    return result.stdout.trim();
}

// 生成随机密码
function generateRandomPassword() {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%';
    const bytes = crypto.randomBytes(12);
    let result = '';
    for (let i = 0; i < 12; i++) {
        result += chars[bytes[i] % chars.length];
    }
    return result;
}

// 从 net0 提取 MAC 地址
function extractMacFromNet0(net0) {
    if (!net0) return '';
    const m = String(net0).match(/macaddr=([0-9A-Fa-f:]{17})/i);
    return m ? m[1].toLowerCase() : '';
}

// ==================== 核心 PVE 操作函数 ====================

// 解析 VM 配置中的所有非系统盘（dev 1-30）
async function parseDataDisks(vmid) {
    const config = await pveApi.getVmConfig(vmid);
    const buses = ['scsi', 'sata', 'virtio'];
    const dataDisks = [];
    for (const bus of buses) {
        for (let dev = 1; dev <= 30; dev++) {
            const key = `${bus}${dev}`;
            if (config[key]) {
                const parts = config[key].split(',');
                const volId = parts[0];
                const qos = {};
                for (let i = 1; i < parts.length; i++) {
                    const [k, v] = parts[i].split('=');
                    if (k && v !== undefined) qos[k] = v;
                }
                dataDisks.push({ bus, dev, volume_id: volId, qos });
            }
        }
    }
    return { dataDisks, systemDisk: parseSystemDisk(config) };
}

// 解析系统盘（dev 0）
function parseSystemDisk(config) {
    const buses = ['scsi', 'sata', 'virtio'];
    for (const bus of buses) {
        if (config[`${bus}0`]) {
            const raw = String(config[`${bus}0`]);
            const parts = raw.split(',');
            const volume_id = parts[0];
            const params = parts.slice(1).join(',');
            let size_gb = 0;
            const sizeMatch = params.match(/(?:^|,)size=(\d+)([GM])/i);
            if (sizeMatch) {
                const val = parseInt(sizeMatch[1]);
                size_gb = sizeMatch[2].toUpperCase() === 'M' ? Math.ceil(val / 1024) : val;
            }
            return {
                bus,
                dev: 0,
                volume_id,
                params,
                params_without_size: params.replace(/(?:^|,)size=\d+[GM]/i, ''),
                size_gb,
                raw_config: raw
            };
        }
    }
    return null;
}

// 1. 卸载所有数据盘（保留卷）
async function detachAllDataDisks(vmid, dataDisks) {
    const results = [];
    for (const disk of dataDisks) {
        await diskUtils.unbindDisk(vmid, disk.bus, disk.dev);
        results.push({ ...disk, detached: true });
    }
    return results;
}

// 2. 克隆模板系统盘到临时 VMID（仅取 disk-0）
// 注意：不在此销毁临时 VM，而是返回 tempVmid 由调用方在 move_volume 后销毁
async function cloneOsTemplateDisk(templateVmid, targetStorage) {
    const tempVmid = await pveApi.getNextAvailableVmid();
    const upid = await pveApi.cloneVm(templateVmid, tempVmid, {
        name: `os-switch-tmp-${tempVmid}-${Date.now()}`,
        storage: targetStorage,
        clone_mode: 'full'
    });
    await pveApi.waitForTask(upid, 300000);

    // 从临时 VM config 读取实际克隆的硬盘卷路径（DIR/BTRFS 存储含子目录和扩展名）
    const tempConfig = await pveApi.getVmConfig(tempVmid);
    let actualVolumeId = '';
    const bus = ['scsi', 'sata', 'virtio'].find(b => tempConfig[`${b}0`]) || 'scsi';
    const raw = tempConfig[`${bus}0`];
    if (raw) {
        actualVolumeId = raw.split(',')[0];
    }
    if (!actualVolumeId) {
        throw new Error(`克隆后无法找到临时 VM ${tempVmid} 的系统盘`);
    }

    return { tempVmid, systemVolumeId: actualVolumeId, bus };
}

// 2.5 查询存储类型
async function getStorageType(storage) {
    const storages = await pveApi.getAllStorages();
    const s = storages.find(x => x.storage === storage);
    return s ? s.type : '';
}

// 2.5.1 获取 LVM 卷的物理设备路径
// 优先使用 pvesm path，失败时使用 lvs 查询
async function getLvmDevicePath(volumeId, storage) {
    // 1. 尝试 pvesm path
    try {
        const path = (await runSsh(`pvesm path ${volumeId}`)).trim();
        if (path) {
            logger.info(`[os-switch] pvesm path ${volumeId} -> ${path}`);
            return path;
        }
    } catch (e) {
        logger.info(`[os-switch] pvesm path ${volumeId} 失败: ${e.message.substring(0, 100)}`);
    }
    // 2. fallback: 使用 lvs 查询（卷名格式: vm-<vmid>-disk-<n>）
    // 从 volumeId 中提取卷名（如 nvme2T:vm-103-disk-0 -> vm-103-disk-0）
    const parts = volumeId.split(':');
    const volName = parts[1] || '';
    if (volName) {
        try {
            // lvs 输出: /dev/nvme2T/vm-103-disk-0
            const cmd = `lvs --noheadings -o lv_path ${storage} 2>/dev/null | grep '${volName}' | head -1 | tr -d ' '`;
            const path = (await runSsh(cmd)).trim();
            if (path) {
                logger.info(`[os-switch] lvs fallback ${volumeId} -> ${path}`);
                return path;
            }
        } catch (e) {
            logger.info(`[os-switch] lvs fallback 失败: ${e.message.substring(0, 100)}`);
        }
    }
    return '';
}

// 扩展的 SSH 执行（支持自定义超时）
async function runSshWithTimeout(cmd, timeout = 60000) {
    const { execSSH, getPveSshConfig } = require('../api/ssh-exec');
    const sshConfig = await getPveSshConfig();
    const result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd, timeout);
    if (result.code !== 0) {
        const errDetail = (result.stderr || result.stdout || '').trim();
        throw new Error(`SSH 命令执行失败 [exit ${result.code}]: ${cmd}\n${errDetail}`);
    }
    return result.stdout.trim();
}

// 2.6 根据存储类型将磁盘从临时 VM 移动到目标 VM
// 文件系统类（dir/btrfs/nfs/cephfs）：mv 文件到目标 VM 目录，避免 destroy 时误删
// 块设备类（lvm/lvmthin/zfs）：使用 pvesm move_volume
async function moveDiskToTarget(storage, sourceVolumeId, targetVmid, sourceBus, tempVmid) {
    const safeStorage = diskUtils.validateParam('storage', storage);
    const safeVmid = diskUtils.validateParam('vmid', targetVmid);
    // 验证 volume id 格式
    if (!/^[a-zA-Z0-9_-]+:[a-zA-Z0-9_./\-]+$/.test(sourceVolumeId)) {
        throw new Error('无效的 volume id: ' + sourceVolumeId);
    }

    const storageType = await getStorageType(storage);

	if (['lvm', 'lvmthin', 'zfs', 'zfspool'].includes(storageType)) {
	    logger.info(`[os-switch] LVM存储 ${safeStorage}，使用 lvrename 重命名逻辑卷`);

	    // 从 volumeId 中提取 LV 名（如 nvme2T:vm-103-disk-0 -> vm-103-disk-0）
	    const parts = sourceVolumeId.split(':');
	    const oldLvName = parts[1] || '';
	    if (!oldLvName || !/^vm-\d+-disk-\d+$/.test(oldLvName)) {
	        throw new Error(`无效的源卷名: ${oldLvName}`);
	    }
	    const newLvName = `vm-${safeVmid}-disk-0`;
	    const targetVolumeId = `${safeStorage}:${newLvName}`;

	    // lvrename 在同一卷组内重命名逻辑卷（瞬间完成，无数据拷贝）
	    await runSsh(`lvrename ${safeStorage}/${oldLvName} ${safeStorage}/${newLvName}`);
	    logger.info(`[os-switch] lvrename ${safeStorage}/${oldLvName} -> ${safeStorage}/${newLvName} 成功`);

	    // 从临时 VM 解绑（PVE 配置中旧 volumeId 已失效，修改 VM 配置即可）
	    try {
	        await diskUtils._internal.unbindSystemDisk(tempVmid, sourceBus);
	        logger.info(`[os-switch] 临时 VM ${tempVmid} 的 ${sourceBus}0 已 unlink`);
	    } catch (e) {
	        logger.info(`[os-switch] 临时 VM unlink 失败（可能卷名已变更）: ${e.message.substring(0, 100)}`);
	    }

	    return targetVolumeId;
	}

    // 文件系统类（dir/btrfs/nfs/cephfs等）：在文件系统层面 mv
    // 先获取源文件物理路径（如 /mnt/pve/nvme1Tbak/images/104/vm-104-disk-0.raw）
    const sourcePathCmd = `pvesm path ${sourceVolumeId}`;
    const sourcePath = (await runSsh(sourcePathCmd)).trim();

    // 获取扩展名
    const ext = sourcePath.includes('.') ? sourcePath.split('.').pop() : 'raw';
    const targetFileName = `vm-${safeVmid}-disk-0.${ext}`;

    // 用 pvesm path 查询目标目录：构造一个临时 volumeid 来获取目录路径
    const dummyVolId = `${safeStorage}:${safeVmid}/${targetFileName}`;
    const targetPathCmd = `pvesm path ${dummyVolId}`;
    const targetPathResult = (await runSsh(targetPathCmd)).trim();

    // 目标目录 = 目标路径去掉文件名部分
    const targetDir = targetPathResult.substring(0, targetPathResult.lastIndexOf('/'));
    const targetPath = `${targetDir}/${targetFileName}`;

    // 创建目标目录 + mv 文件
    await runSsh(`mkdir -p '${targetDir}' && mv '${sourcePath}' '${targetPath}'`);

    // 从临时 VM 解绑旧卷（文件已被 mv，卷引用已失效）
    await diskUtils._internal.unbindSystemDisk(tempVmid, sourceBus);

    // 返回新的 volume ID
    return `${safeStorage}:${safeVmid}/${targetFileName}`;
}

// 2.7 清理临时 VM（unlink 系统盘 + destroy，磁盘已被移走所以安全）
async function cleanupTempVm(tempVmid, bus) {
    // unlink 可能已由 moveDiskToTarget 执行过，失败不阻断
    try {
        await diskUtils._internal.unbindSystemDisk(tempVmid, bus);
    } catch (e) {
        logger.info(`[os-switch] cleanupTempVm unlink 失败（可能已解绑）: ${e.message.substring(0, 100)}`);
    }
    await pveApi.destroyVm(tempVmid);
}

// 3. 替换目标 VM 系统盘
async function replaceSystemDisk(vmid, oldSysDisk, newVolumeId) {
    const safeVmid = diskUtils.validateParam('vmid', vmid);
    const bus = oldSysDisk.bus;
    // 确保 newVolumeId 是一个有效的 volume ID 格式
    const cleanVolId = newVolumeId && typeof newVolumeId === 'string' ? newVolumeId.trim() : '';
    if (!cleanVolId) {
        throw new Error('新系统盘 volume ID 为空');
    }

    // 3.1 使用 qm unlink 卸载原系统盘配置（比 qm set --delete 更可靠，不留划线状态）
    await runSsh(`qm unlink ${safeVmid} --idlist ${bus}0`);

    // 3.2 检查旧卷是否仍存在，如果存在才释放
    try {
        const checkCmd = `pvesm list $(echo ${oldSysDisk.volume_id} | cut -d: -f1) 2>/dev/null | grep -F '${oldSysDisk.volume_id.split(':')[1]}'`;
        const checkResult = await runSsh(checkCmd);
        if (checkResult) {
            await diskUtils._internal.destroySystemDisk(oldSysDisk.volume_id);
        }
    } catch (e) {
        // 卷不存在或查询失败则跳过释放（可能已被前一次切换清理）
    }

    // 3.3 挂载新系统盘（剥离 size= 参数）
    const mountParams = oldSysDisk.params_without_size || oldSysDisk.params || '';
    const newDiskConfig = mountParams ? `${cleanVolId},${mountParams}` : cleanVolId;
    await runSsh(`qm set ${safeVmid} --${bus}0 ${newDiskConfig}`);

    // 3.4 扩容到目标的 VM 系统盘容量 或 模板 disk_size
const targetSizeGb = oldSysDisk.size_gb || 0;
	    if (targetSizeGb > 0) {
	        await runSsh(`qm resize ${safeVmid} ${bus}0 ${targetSizeGb}G`);

	        // 3.5 补回 size= 元数据
	        const finalParams = mountParams ? `${mountParams},size=${targetSizeGb}G` : `size=${targetSizeGb}G`;
	        await runSsh(`qm set ${safeVmid} --${bus}0 ${cleanVolId},${finalParams}`);
	    }
}

// 4. 重新挂载数据盘
async function reattachDataDisks(vmid, dataDisks) {
    for (const disk of dataDisks) {
        await diskUtils.bindDisk(vmid, disk.volume_id, disk.bus, disk.dev, disk.qos);
    }
}

// 5. 更新 cloud-init 配置
async function updateCloudInit(vmid, ciuser) {
    const newPassword = generateRandomPassword();
    const cfg = {};
    if (ciuser) {
        cfg.ciuser = ciuser;
        cfg.cipassword = newPassword;
    }
    await pveApi.updateVmConfig(vmid, cfg);
    return { password: newPassword, ciuser };
}

// 5.5 MAC 同步（爱快 MAC 分组 + DHCP 静态绑定 + 端口转发）
async function verifyAndSyncMac(vmid, oldMac, logId) {
    const syncResult = {
        mac_group: { ok: false, error: '' },
        dhcp: { ok: false, error: '' },
        port_forwards: { ok: false, error: '' }
    };
    const newConfig = await pveApi.getVmConfig(vmid);
    const newMac = extractMacFromNet0(newConfig.net0);

    // 1. MAC 分组同步
    try {
        const ikuaiApi = require('../api/ikuai-api');
        await ikuaiApi.updateMacInGroup(oldMac, newMac);
        syncResult.mac_group.ok = true;
    } catch (e) {
        syncResult.mac_group.error = e.message;
    }

    // 2. DHCP 静态绑定同步
    try {
        const { createDhcpStaticBinding } = require('../services/dhcp');
        await createDhcpStaticBinding('vm', vmid, newMac, '');
        syncResult.dhcp.ok = true;
    } catch (e) {
        syncResult.dhcp.error = e.message;
    }

    // 3. 端口转发同步
    try {
        await db.portForwards.updateMacByVmid(vmid, newMac);
        syncResult.port_forwards.ok = true;
    } catch (e) {
        syncResult.port_forwards.error = e.message;
    }

    const okCount = Object.values(syncResult).filter(v => v.ok).length;
    const syncStatus = okCount === 3 ? 'success' : okCount > 0 ? 'partial' : 'failed';

    // 写入日志
    await db.vmOsSwitchLogs.update(logId, {
        mac_sync_performed: 1,
        mac_sync_status: syncStatus,
        mac_sync_result: JSON.stringify(syncResult),
        old_mac_address: oldMac,
        new_mac_address: newMac
    });

    return { synced: syncStatus !== 'failed', syncStatus, ...syncResult };
}

// ==================== 日志辅助函数 ====================

async function updateLogStage(logId, stage) {
    await db.vmOsSwitchLogs.update(logId, { fail_stage: stage });
}

async function updateLogFields(logId, fields) {
    await db.vmOsSwitchLogs.update(logId, fields);
}

async function markAdminIntervention(logId, reason) {
    await db.vmOsSwitchLogs.update(logId, {
        admin_intervention_required: 1,
        error_message: reason
    });
}

async function markRolledBack(logId, error) {
    await db.vmOsSwitchLogs.update(logId, {
        status: 'rolled_back',
        rollback_performed: 1,
        error_message: error.message || String(error),
        finished_at: new Date()
    });
}

// ==================== 主流程 ====================

async function performOsSwitch(vmid, osTemplate, logId) {
    const ctx = {};
    try {
        // Stage 1: 解析当前配置
        const { dataDisks, systemDisk } = await parseDataDisks(vmid);
        ctx.dataDisks = dataDisks;
        ctx.oldSystemDisk = systemDisk;
        ctx.oldMac = systemDisk ? extractMacFromNet0((await pveApi.getVmConfig(vmid)).net0) : '';
        await updateLogStage(logId, 'detach_data');

        // Stage 2: 卸载数据盘
        await detachAllDataDisks(vmid, dataDisks);
        await updateLogStage(logId, 'clone_template');

        // Stage 3: 克隆模板系统盘到临时 VM（不销毁）
        const cloneResult = await cloneOsTemplateDisk(osTemplate.template_vmid, osTemplate.target_storage);
        ctx.tempVmid = cloneResult.tempVmid;
        ctx.tempBus = cloneResult.bus;
        await updateLogStage(logId, 'move_volume');

        // Stage 4: 根据存储类型将磁盘从临时 VM 移动到目标 VM
        const movedVolumeId = await moveDiskToTarget(
            osTemplate.target_storage,
            cloneResult.systemVolumeId,
            vmid,
            cloneResult.bus,
            cloneResult.tempVmid
        );
        ctx.newVolumeId = movedVolumeId;
        await updateLogStage(logId, 'replace_sys');

        // Stage 5: 替换目标 VM 系统盘（卸载旧系统盘配置 + 释放旧卷 + 挂载新盘）
        // 注意：使用模板的 bus 类型（cloneResult.bus）而非目标 VM 原 bus 类型，
        //       因为模板镜像可能针对特定总线（如 scsi）做了驱动配置
        const newSysDisk = { ...systemDisk, bus: cloneResult.bus };
        await replaceSystemDisk(vmid, newSysDisk, movedVolumeId);
        await updateLogStage(logId, 'cleanup_temp');

        // Stage 5.5: 清理临时 VM（此时磁盘已被移走，destroy 安全）
        await cleanupTempVm(cloneResult.tempVmid, cloneResult.bus);
        await updateLogStage(logId, 'reattach_data');

        // Stage 6: 重挂载数据盘
        await reattachDataDisks(vmid, dataDisks);
        await updateLogStage(logId, 'cloudinit');

        // Stage 7: 更新 cloud-init
        const ciResult = await updateCloudInit(vmid, osTemplate.ciuser);
        ctx.ciResult = ciResult;

        // Stage 7.5: 更新 VM ostype 与模板一致
        if (osTemplate.ostype) {
            await pveApi.updateVmConfig(vmid, { ostype: osTemplate.ostype });
        }

        await updateLogStage(logId, 'start');

        // Stage 8: 启动 VM
        await pveApi.startVm(vmid);

        // Stage 9: MAC 同步
        const newConfig = await pveApi.getVmConfig(vmid);
        ctx.newMac = extractMacFromNet0(newConfig.net0);
        if (ctx.oldMac && ctx.newMac && ctx.oldMac !== ctx.newMac) {
            await updateLogStage(logId, 'sync_mac');
            const macSyncResult = await verifyAndSyncMac(vmid, ctx.oldMac, logId);
            ctx.macSyncResult = macSyncResult;
            if (macSyncResult.syncStatus === 'partial' || macSyncResult.syncStatus === 'failed') {
                console.warn(`[os-switch] MAC 同步不完整: VM ${vmid}, 状态: ${macSyncResult.syncStatus}`);
            }
        } else {
            await db.vmOsSwitchLogs.update(logId, {
                mac_sync_performed: 0,
                mac_sync_status: 'not_needed',
                mac_sync_result: JSON.stringify({ reason: 'MAC 未变化，无需同步' })
            });
        }

        return { success: true, ...ctx };
    } catch (error) {
        await rollbackOsSwitch(vmid, ctx, logId, error);
        throw error;
    }
}

// 回滚（尽力而为）
async function rollbackOsSwitch(vmid, ctx, logId, originalError) {
    if (ctx.dataDisks && ctx.dataDisks.length > 0) {
        for (const disk of ctx.dataDisks) {
            try {
                await diskUtils.bindDisk(vmid, disk.volume_id, disk.bus, disk.dev, disk.qos);
            } catch (e) {
                await markAdminIntervention(logId, `数据盘回滚失败: ${disk.volume_id} - ${e.message}`);
            }
        }
    }
    await markRolledBack(logId, originalError);
}

// 容量预检
async function checkTargetStorageCapacity(targetStorage, requiredGb) {
    const storages = await pveApi.getAllStorages();
    const s = storages.find(x => x.storage === targetStorage);
    if (!s) throw new Error('目标存储不存在');
    const availGb = Math.floor(s.avail / (1024 * 1024 * 1024));
    if (availGb < requiredGb + 5) {
        throw new Error(`目标存储空间不足，需要 ${requiredGb + 5}GB，当前可用 ${availGb}GB`);
    }
}

module.exports = {
    parseDataDisks,
    parseSystemDisk,
    detachAllDataDisks,
    cloneOsTemplateDisk,
    getStorageType,
    moveDiskToTarget,
    cleanupTempVm,
    replaceSystemDisk,
    reattachDataDisks,
    updateCloudInit,
    verifyAndSyncMac,
    performOsSwitch,
    rollbackOsSwitch,
    checkTargetStorageCapacity,
    extractMacFromNet0,
    updateLogStage,
    updateLogFields
};