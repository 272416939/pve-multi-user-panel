// server/utils/os-switch-utils.js - 系统切换核心 PVE 操作封装
// 安全设计：所有外部参数经过严格白名单校验，通过 disk-utils.validateParam 过滤

const diskUtils = require('./disk-utils');
const pveApi = require('../api/pve-api');
const db = require('../api/db');
const crypto = require('crypto');
const logger = require('./logger');

// ==================== 内部工具函数 ====================

// SSH 命令执行（复用 disk-utils 的 SSH 工具）
async function runSsh(cmd) {
    const { execSSH, getPveSshConfig } = require('../api/ssh-exec');
    const sshConfig = await getPveSshConfig();
    return execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd, 60000);
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
    const buses = ['scsi', 'sata', 'virtio'];
    for (const bus of buses) {
        if (tempConfig[`${bus}0`]) {
            actualVolumeId = tempConfig[`${bus}0`].split(',')[0];
            break;
        }
    }
    if (!actualVolumeId) {
        throw new Error(`克隆后无法找到临时 VM ${tempVmid} 的系统盘`);
    }

    // 从临时 VM unlink 系统盘（卷保留）
    await diskUtils._internal.unbindSystemDisk(tempVmid, 'scsi');
    // 删除临时 VM（卷已 unlink，不会被删除）
    await pveApi.destroyVm(tempVmid);
    return { tempVmid, systemVolumeId: actualVolumeId };
}

// 3. 替换目标 VM 系统盘
async function replaceSystemDisk(vmid, oldSysDisk, newVolumeId) {
    const safeVmid = diskUtils.validateParam('vmid', vmid);
    const bus = oldSysDisk.bus;

    // 3.1 卸载原系统盘配置（仅删除 qm config，不删卷）
    await runSsh(`qm set ${safeVmid} --delete ${bus}0`);

    // 3.2 释放原系统盘卷
    await diskUtils._internal.destroySystemDisk(oldSysDisk.volume_id);

    // 3.3 挂载新系统盘（剥离 size= 参数）
    const mountParams = oldSysDisk.params_without_size || oldSysDisk.params || '';
    const newDiskConfig = mountParams ? `${newVolumeId},${mountParams}` : newVolumeId;
    await runSsh(`qm set ${safeVmid} --${bus}0 ${newDiskConfig}`);

    // 3.4 扩容到原 VM 系统盘容量（PVE 只能扩容不能缩容，取原容量确保不缩水）
    const targetSizeGb = oldSysDisk.size_gb || 0;
    if (targetSizeGb > 0) {
        await runSsh(`qm resize ${safeVmid} ${bus}0 ${targetSizeGb}G`);

        // 3.5 补回 size= 元数据
        const finalParams = mountParams ? `${mountParams},size=${targetSizeGb}G` : `size=${targetSizeGb}G`;
        await runSsh(`qm set ${safeVmid} --${bus}0 ${newVolumeId},${finalParams}`);
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

        // Stage 3: 克隆模板系统盘
        const cloneResult = await cloneOsTemplateDisk(osTemplate.template_vmid, osTemplate.target_storage);
        ctx.newVolumeId = cloneResult.systemVolumeId;
        await updateLogStage(logId, 'replace_sys');

        // Stage 4: 替换系统盘（容量按原 VM 系统盘容量）
        await replaceSystemDisk(vmid, systemDisk, cloneResult.systemVolumeId);
        await updateLogStage(logId, 'reattach_data');

        // Stage 5: 重挂载数据盘
        await reattachDataDisks(vmid, dataDisks);
        await updateLogStage(logId, 'cloudinit');

        // Stage 6: 更新 cloud-init
        const ciResult = await updateCloudInit(vmid, osTemplate.ciuser);
        ctx.ciResult = ciResult;

        // Stage 6.5: 更新 VM ostype 与模板一致
        if (osTemplate.ostype) {
            await pveApi.updateVmConfig(vmid, { ostype: osTemplate.ostype });
        }

        await updateLogStage(logId, 'start');

        // Stage 7: 启动 VM
        await pveApi.startVm(vmid);

        // Stage 8: MAC 同步
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