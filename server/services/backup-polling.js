const db = require('../api/db');
const { getPveClient } = require('../api/pve-clients');
const { shouldSendEmail } = require('../utils/email');
const { sendTemplateEmail } = require('./email-template');
const { pushToUser } = require('../websocket/push-proxy');
// 备份/恢复完成标记抽离到 services/status-cache.js（规范第七节：状态缓存单一来源）
const { markBackupRestoreComplete } = require('./status-cache');
const { takeDiskSnapshot, auditAfterRestore } = require('./disk-audit');

const lxcBackupPollingMap = new Map();

async function startLxcBackupPolling(backupId, upid, vmid) {
    if (lxcBackupPollingMap.has(backupId)) return;
    console.log(`[LXC备份轮询] 开始监控备份 ${backupId} (UPID: ${upid})`);

    // 多节点：按备份行 pve_node_id 解析（无行/无节点回退默认并报告）
    const backupRow = await db.backups.getById(backupId);
    if (!backupRow || backupRow.pve_node_id == null) {
        console.warn(`[LXC备份轮询] 备份 ${backupId} ${backupRow ? '无 pve_node_id' : '行不存在'}，回退默认节点`);
    }
    const nodeId = backupRow && backupRow.pve_node_id != null ? backupRow.pve_node_id : null;
    const pve = await getPveClient(nodeId != null ? nodeId : null);

    const interval = setInterval(async () => {
        try {
            const task = await pve.getTaskStatus(upid);
            if (!task) return;

            const pct = task.percentage || 0;
            await db.backups.updateProgress(backupId, Math.round(pct), upid);

            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                lxcBackupPollingMap.delete(backupId);

                const backupRecord = await db.backups.getById(backupId);
                const storage = backupRecord ? backupRecord.storage : 'local';
                let filename = '';
                let size = 0;
                try {
                    const contents = await pve.getStorageContent(storage);
                    const prefix = `vzdump-lxc-${vmid}-`;
                    const match = contents
                        .filter(c => c.volid && c.volid.includes(prefix))
                        .sort((a, b) => new Date(b.ctime || 0) - new Date(a.ctime || 0))[0];
                    if (match) {
                        filename = match.volid.split('/').pop() || '';
                        size = match.size || 0;
                    }
                } catch (e) {
                    console.error('获取备份文件信息失败:', e.message);
                }

                await db.backups.complete(backupId, filename, size);
                console.log(`[LXC备份轮询] 备份 ${backupId} 完成`);

                markBackupRestoreComplete(vmid);
                sendLxcBackupNotification(vmid, backupId, 'completed');
            } else if (task.status === 'stopped' && task.exitstatus !== 'OK') {
                clearInterval(interval);
                lxcBackupPollingMap.delete(backupId);
                const errorMsg = task.errors || '备份失败';
                await db.backups.fail(backupId, errorMsg);
                console.log(`[LXC备份轮询] 备份 ${backupId} 失败:`, errorMsg);
                sendLxcBackupNotification(vmid, backupId, 'failed');
            }
        } catch (error) {
            console.error(`[LXC备份轮询] 查询失败 ${backupId}:`, error.message);
        }
    }, 3000);

    lxcBackupPollingMap.set(backupId, interval);
}

async function sendLxcBackupNotification(vmid, backupId, status) {
    try {
        const backup = await db.backups.getById(backupId);
        if (!backup) return;
        const user = await db.users.getById(backup.user_id);
        if (!user) return;

        pushToUser(backup.user_id, { type: 'backup-done', backupId: backupId, ct_id: vmid, status: status, pve_node_id: nodeId != null ? nodeId : null });

        const title = status === 'completed' ? 'LXC 容器备份完成' : 'LXC 容器备份失败';
        const content = status === 'completed'
            ? `您的 LXC 容器 (CT ${vmid}) 备份已完成。`
            : `您的 LXC 容器 (CT ${vmid}) 备份失败: ${backup.error_msg || '未知错误'}`;

        await db.messages.create({
            uid: backup.user_id,
            title,
            content,
            type: 2,
            send_type: 1
        });

        if (user.email && user.emailVerified) {
            try {
                if (await shouldSendEmail(user.id, 'notify_backup_result')) {
                    // LXC 备份结果通知（模板: lxc_backup_result，{status} 区分完成/失败）
                    await sendTemplateEmail(user.email, 'lxc_backup_result', {
                        username: user.username,
                        vmid: vmid,
                        status: status === 'completed' ? '完成' : '失败',
                        detail: status === 'completed' ? '' : '原因：' + (backup.error_msg || '未知错误')
                    }, { pveNodeId: nodeId });
                }
            } catch (e) {
                console.error('LXC 备份通知邮件发送失败:', e.message);
            }
        }
    } catch (e) {
        console.error('发送 LXC 备份通知失败:', e.message);
    }
}

const lxcRestorePollingMap = new Map();

async function startLxcRestorePolling(taskId, upid, vmid) {
    if (lxcRestorePollingMap.has(taskId)) return;
    console.log(`[LXC恢复轮询] 开始监控恢复 ${taskId} (UPID: ${upid})`);

    // 多节点：恢复任务无 pve_node_id，经其关联备份行解析（无行/无节点回退默认并报告）
    const taskRow = await db.restoreTasks.getById(taskId);
    let nodeId = null;
    if (taskRow && taskRow.backup_id) {
        const backupRow = await db.backups.getById(taskRow.backup_id);
        if (backupRow && backupRow.pve_node_id != null) nodeId = backupRow.pve_node_id;
    }
    if (nodeId == null) console.warn(`[LXC恢复轮询] 恢复任务 ${taskId} 无法定位节点，回退默认节点`);
    const pve = await getPveClient(nodeId != null ? nodeId : null);

    const interval = setInterval(async () => {
        try {
            const task = await pve.getTaskStatus(upid);
            if (!task) return;

            const pct = task.percentage || 0;
            await db.restoreTasks.updateProgress(taskId, Math.round(pct), upid);

            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                lxcRestorePollingMap.delete(taskId);
                await db.restoreTasks.complete(taskId);
                console.log(`[LXC恢复轮询] 恢复 ${taskId} 完成`);
                markBackupRestoreComplete(vmid);
                sendLxcRestoreNotification(vmid, taskId, 'completed');
            } else if (task.status === 'stopped' && task.exitstatus !== 'OK') {
                clearInterval(interval);
                lxcRestorePollingMap.delete(taskId);
                const errorMsg = task.errors || '恢复失败';
                await db.restoreTasks.fail(taskId, errorMsg);
                console.log(`[LXC恢复轮询] 恢复 ${taskId} 失败:`, errorMsg);
                sendLxcRestoreNotification(vmid, taskId, 'failed');
            }
        } catch (error) {
            console.error(`[LXC恢复轮询] 查询失败 ${taskId}:`, error.message);
        }
    }, 3000);

    lxcRestorePollingMap.set(taskId, interval);
}

async function sendLxcRestoreNotification(vmid, taskId, status) {
    try {
        const task = await db.restoreTasks.getById(taskId);
        if (!task) return;
        const user = await db.users.getById(task.user_id);
        if (!user) return;

        pushToUser(task.user_id, { type: 'restore-done', taskId: taskId, ct_id: vmid, status: status, pve_node_id: nodeId != null ? nodeId : null });

        const title = status === 'completed' ? 'LXC 容器恢复完成' : 'LXC 容器恢复失败';
        const content = status === 'completed'
            ? `您的 LXC 容器 (CT ${vmid}) 已恢复完成。`
            : `您的 LXC 容器 (CT ${vmid}) 恢复失败: ${task.error_msg || '未知错误'}`;

        await db.messages.create({
            uid: task.user_id,
            title,
            content,
            type: 2,
            send_type: 1
        });

        if (user.email && user.emailVerified) {
            try {
                if (await shouldSendEmail(user.id, 'notify_backup_result')) {
                    // LXC 恢复结果通知（模板: lxc_restore_result）
                    await sendTemplateEmail(user.email, 'lxc_restore_result', {
                        username: user.username,
                        vmid: vmid,
                        status: status === 'completed' ? '完成' : '失败',
                        detail: status === 'completed' ? '' : '原因：' + (task.error_msg || '未知错误')
                    }, { pveNodeId: nodeId });
                }
            } catch (e) {
                console.error('LXC 恢复通知邮件发送失败:', e.message);
            }
        }
    } catch (e) {
        console.error('发送 LXC 恢复通知失败:', e.message);
    }
}

async function resumeRunningLxcBackups() {
    try {
        const runningBackups = (await db.backups.getRunningBackups()).filter(b => b.type === 'lxc' && b.pve_upid);
        for (const backup of runningBackups) {
            console.log('[LXC启动恢复] 恢复备份轮询:', backup.id);
            startLxcBackupPolling(backup.id, backup.pve_upid, backup.ct_id);
        }
    } catch (e) {
        console.error('恢复 LXC 备份轮询失败:', e.message);
    }

    try {
        const allRunningTasks = await db.restoreTasks.getRunning();
        const lxcRunningTasks = [];
        for (const t of allRunningTasks) {
            const backup = await db.backups.getById(t.backup_id);
            if (backup && backup.type === 'lxc') {
                lxcRunningTasks.push(t);
            }
        }
        for (const task of lxcRunningTasks) {
            console.log('[LXC启动恢复] 恢复恢复任务轮询:', task.id);
            startLxcRestorePolling(task.id, task.pve_upid, task.vm_id);
        }
    } catch (e) {
        console.error('恢复 LXC 恢复轮询失败:', e.message);
    }
}

const backupPollIntervals = new Map();

async function sendBackupNotification(userId, vmId, status, filename) {
    const user = await db.users.getById(userId);
    if (!user) return;

    pushToUser(userId, { type: 'backup-done', vm_id: vmId, status: status, pve_node_id: nodeId != null ? nodeId : null });

    const vm = (await db.vms.getByUserId(userId)).find(v => v.vm_id == vmId);
    const vmName = vm?.name || 'VM ' + vmId;
    const nodeId = vm ? (vm.pve_node_id != null ? vm.pve_node_id : null) : null;
    let title, content;
    if (status === 'completed') {
        title = '备份完成通知';
        content = `您虚拟机 **${vmName}** 的备份已完成。备份文件：${filename || '已生成'}`;
    } else {
        title = '备份失败通知';
        content = `您虚拟机 **${vmName}** 的备份失败。${filename ? '原因：' + filename : ''}`;
    }
    try {
        await db.messages.create({
            uid: userId,
            title,
            content,
            type: 2,
            send_type: 1,
            created_at: db.now()
        });
    } catch (e) {
        console.error('备份通知站内信发送失败:', e.message);
    }
    if (user.email && user.emailVerified) {
        try {
            if (await shouldSendEmail(user.id, 'notify_backup_result')) {
                // VM 备份结果通知（模板: vm_backup_result，{status} 区分完成/失败）
                var isSuccess = status === 'completed';
                await sendTemplateEmail(user.email, 'vm_backup_result', {
                    username: user.username,
                    vm_name: vmName,
                    status: isSuccess ? '完成' : '失败',
                    detail: isSuccess ? (filename ? '备份文件：' + filename : '') : (filename ? '原因：' + filename : '')
                }, { pveNodeId: nodeId });
            }
        } catch (e) {
            console.error('备份通知邮件发送失败:', e.message);
        }
    }
}

async function startBackupPolling(backupId, upid) {
    if (backupPollIntervals.has(backupId)) return;

    // 多节点：按备份行 pve_node_id 解析（无行/无节点回退默认并报告）
    const backupRow = await db.backups.getById(backupId);
    if (!backupRow || backupRow.pve_node_id == null) {
        console.warn(`[备份轮询] 备份 ${backupId} ${backupRow ? '无 pve_node_id' : '行不存在'}，回退默认节点`);
    }
    const nodeId = backupRow && backupRow.pve_node_id != null ? backupRow.pve_node_id : null;
    const pve = await getPveClient(nodeId != null ? nodeId : null);

    const interval = setInterval(async () => {
        try {
            const task = await pve.getTaskStatus(upid);
            if (!task) return;
            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                backupPollIntervals.delete(backupId);
                const backup = await db.backups.getById(backupId);
                let filename = '';
                let size = 0;
                if (backup) {
                    try {
                        const contents = await pve.getStorageContent(backup.storage);
                        const vmPrefix = `vzdump-qemu-${backup.vm_id}-`;
                        const backups = contents.filter(c => c.content === 'backup' && c.volid && c.volid.includes(vmPrefix));
                        if (backups.length > 0) {
                            backups.sort((a, b) => (b.ctime || 0) - (a.ctime || 0));
                            filename = backups[0].volid;
                            size = backups[0].size || 0;
                        }
                    } catch (e) {
                        console.error('获取备份文件信息失败:', e.message);
                        filename = task.filename || '';
                        size = task.size || 0;
                    }
                }
                await db.backups.complete(backupId, filename, size);
                if (backup) {
                    markBackupRestoreComplete(backup.vm_id);
                    sendBackupNotification(backup.user_id, backup.vm_id, 'completed', filename);
                }
            } else if (task.status === 'stopped') {
                clearInterval(interval);
                backupPollIntervals.delete(backupId);
                const backup = await db.backups.getById(backupId);
                const errorMsg = task.exitstatus || '未知错误';
                await db.backups.fail(backupId, errorMsg);
                if (backup) sendBackupNotification(backup.user_id, backup.vm_id, 'failed', errorMsg);
            } else {
                const pct = task.percentage || 0;
                await db.backups.updateProgress(backupId, Math.round(pct), upid);
            }
        } catch (e) {
            console.error('备份进度轮询失败:', backupId, e.message);
        }
    }, 3000);
    backupPollIntervals.set(backupId, interval);
}

async function resumeRunningBackups() {
    const running = await db.backups.getRunningBackups();
    for (const b of running) {
        if (b.pve_upid && (b.status === 'running')) {
            startBackupPolling(b.id, b.pve_upid);
        } else if (b.status === 'pending') {
            await db.backups.fail(b.id, '服务重启导致备份中断');
            sendBackupNotification(b.user_id, b.vm_id, 'failed', '服务重启导致备份中断');
        }
    }
    const runningRestores = await db.restoreTasks.getRunning();
    for (const r of runningRestores) {
        if (r.pve_upid && r.status === 'running') {
            startRestorePolling(r.id, r.pve_upid);
        } else if (r.status === 'pending') {
            await db.restoreTasks.fail(r.id, '服务重启导致恢复中断');
            sendRestoreNotification(r.user_id, r.vm_id, '服务重启导致恢复中断');
        }
    }
}

async function sendRestoreNotification(userId, vmId, statusMsg) {
    const user = await db.users.getById(userId);
    if (!user) return;

    pushToUser(userId, { type: 'restore-done', vm_id: vmId, status: statusMsg === 'completed' ? 'completed' : 'failed', pve_node_id: nodeId != null ? nodeId : null });

    const vm = (await db.vms.getByUserId(userId)).find(v => v.vm_id == vmId);
    const vmName = vm?.name || 'VM ' + vmId;
    const nodeId = vm ? (vm.pve_node_id != null ? vm.pve_node_id : null) : null;
    const isSuccess = statusMsg === 'completed';
    const title = isSuccess ? '备份恢复完成通知' : '备份恢复失败通知';
    const content = isSuccess
        ? `您虚拟机 **${vmName}** 已成功从备份恢复。请启动虚拟机查看数据。`
        : `您虚拟机 **${vmName}** 的备份恢复失败。${statusMsg ? '原因：' + statusMsg : ''}`;
    try {
        await db.messages.create({
            uid: userId, title, content, type: 2, send_type: 1,
            created_at: db.now()
        });
    } catch (e) { console.error('恢复通知站内信发送失败:', e.message); }
    if (user.email && user.emailVerified) {
        try {
            if (await shouldSendEmail(user.id, 'notify_backup_result')) {
                // VM 恢复结果通知（模板: vm_restore_result）
                await sendTemplateEmail(user.email, 'vm_restore_result', {
                    username: user.username,
                    vm_name: vmName,
                    status: isSuccess ? '完成' : '失败',
                    detail: isSuccess ? '' : (statusMsg ? '原因：' + statusMsg : '')
                }, { pveNodeId: nodeId });
            }
        } catch (e) { console.error('恢复通知邮件发送失败:', e.message); }
    }
}

async function startRestorePolling(taskId, upid) {
    const key = 'r-' + taskId;
    if (backupPollIntervals.has(key)) return;

    // 多节点：恢复任务无 pve_node_id，经其关联备份行解析（无行/无节点回退默认并报告）
    const taskRow = await db.restoreTasks.getById(taskId);
    let nodeId = null;
    if (taskRow && taskRow.backup_id) {
        const backupRow = await db.backups.getById(taskRow.backup_id);
        if (backupRow && backupRow.pve_node_id != null) nodeId = backupRow.pve_node_id;
    }
    if (nodeId == null) console.warn(`[恢复轮询] 恢复任务 ${taskId} 无法定位节点，回退默认节点`);
    const pve = await getPveClient(nodeId != null ? nodeId : null);

    const interval = setInterval(async () => {
        try {
            const task = await pve.getTaskStatus(upid);
            if (!task) return;
            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                backupPollIntervals.delete(key);
                const restore = await db.restoreTasks.getById(taskId);
                await db.restoreTasks.complete(taskId);
                if (restore) {
                    markBackupRestoreComplete(restore.vm_id);
                    sendRestoreNotification(restore.user_id, restore.vm_id, 'completed');
                    // 恢复完成后做磁盘对账（防止幽灵盘 + 修复丢失的数据盘）
                    try {
                        await auditAfterRestore(restore.vm_id, restore.user_id, restore.pre_snapshot);
                    } catch (auditErr) {
                        console.error('[恢复审计] VM ' + restore.vm_id + ' 对账失败:', auditErr.message);
                    }
                }
            } else if (task.status === 'stopped') {
                clearInterval(interval);
                backupPollIntervals.delete(key);
                const restore = await db.restoreTasks.getById(taskId);
                const errorMsg = task.exitstatus || '未知错误';
                await db.restoreTasks.fail(taskId, errorMsg);
                if (restore) sendRestoreNotification(restore.user_id, restore.vm_id, errorMsg);
            } else {
                const pct = task.percentage || 0;
                await db.restoreTasks.updateProgress(taskId, Math.round(pct), upid);
            }
        } catch (e) {
            console.error('恢复进度轮询失败:', taskId, e.message);
        }
    }, 3000);
    backupPollIntervals.set(key, interval);
}

module.exports = {
    lxcBackupPollingMap,
    startLxcBackupPolling,
    sendLxcBackupNotification,
    lxcRestorePollingMap,
    startLxcRestorePolling,
    sendLxcRestoreNotification,
    resumeRunningLxcBackups,
    backupPollIntervals,
    sendBackupNotification,
    startBackupPolling,
    resumeRunningBackups,
    sendRestoreNotification,
    startRestorePolling,
    // 供 push-proxy 标记备份/恢复完成，抑制瞬时 running 闪现
    markBackupRestoreComplete
};
