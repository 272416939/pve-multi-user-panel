const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { pushToUser } = require('../websocket/push-proxy');

const lxcBackupPollingMap = new Map();

function startLxcBackupPolling(backupId, upid, vmid) {
    if (lxcBackupPollingMap.has(backupId)) return;
    console.log(`[LXC备份轮询] 开始监控备份 ${backupId} (UPID: ${upid})`);

    const interval = setInterval(async () => {
        try {
            const task = await pveApi.getTaskStatus(upid);
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
                    const contents = await pveApi.getStorageContent(storage);
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

        pushToUser(backup.user_id, { type: 'backup-done', backupId: backupId, ct_id: vmid, status: status });

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
                await sendEmail(user.email, title, createEmailTemplate(title, `<p>您好，${user.username}！</p><p>${content.replace(/\*\*/g, '<strong>')}</p>`));
            } catch (e) {
                console.error('LXC 备份通知邮件发送失败:', e.message);
            }
        }
    } catch (e) {
        console.error('发送 LXC 备份通知失败:', e.message);
    }
}

const lxcRestorePollingMap = new Map();

function startLxcRestorePolling(taskId, upid, vmid) {
    if (lxcRestorePollingMap.has(taskId)) return;
    console.log(`[LXC恢复轮询] 开始监控恢复 ${taskId} (UPID: ${upid})`);

    const interval = setInterval(async () => {
        try {
            const task = await pveApi.getTaskStatus(upid);
            if (!task) return;

            const pct = task.percentage || 0;
            await db.restoreTasks.updateProgress(taskId, Math.round(pct), upid);

            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                lxcRestorePollingMap.delete(taskId);
                await db.restoreTasks.complete(taskId);
                console.log(`[LXC恢复轮询] 恢复 ${taskId} 完成`);
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

        pushToUser(task.user_id, { type: 'restore-done', taskId: taskId, ct_id: vmid, status: status });

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
                await sendEmail(user.email, title, createEmailTemplate(title, `<p>您好，${user.username}！</p><p>${content.replace(/\*\*/g, '<strong>')}</p>`));
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
        const runningTasks = (await db.restoreTasks.getRunning()).filter(async t => {
            const backup = await db.backups.getById(t.backup_id);
            return backup && backup.type === 'lxc';
        });
        for (const task of runningTasks) {
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

    pushToUser(userId, { type: 'backup-done', vm_id: vmId, status: status });

    const vm = (await db.vms.getByUserId(userId)).find(v => v.vm_id == vmId);
    const vmName = vm?.name || 'VM ' + vmId;
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
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.error('备份通知站内信发送失败:', e.message);
    }
    if (user.email && user.emailVerified) {
        try {
            await sendEmail(user.email, title, createEmailTemplate(title, `<p>您好，${user.username}！</p><p>${content.replace(/\*\*/g, '<strong>')}</p><p>如非本人操作，请忽略此邮件。</p>`));
        } catch (e) {
            console.error('备份通知邮件发送失败:', e.message);
        }
    }
}

function startBackupPolling(backupId, upid) {
    if (backupPollIntervals.has(backupId)) return;
    const interval = setInterval(async () => {
        try {
            const task = await pveApi.getTaskStatus(upid);
            if (!task) return;
            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                backupPollIntervals.delete(backupId);
                const backup = await db.backups.getById(backupId);
                let filename = '';
                let size = 0;
                if (backup) {
                    try {
                        const contents = await pveApi.getStorageContent(backup.storage);
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
                if (backup) sendBackupNotification(backup.user_id, backup.vm_id, 'completed', filename);
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

    pushToUser(userId, { type: 'restore-done', vm_id: vmId, status: statusMsg === 'completed' ? 'completed' : 'failed' });

    const vm = (await db.vms.getByUserId(userId)).find(v => v.vm_id == vmId);
    const vmName = vm?.name || 'VM ' + vmId;
    const isSuccess = statusMsg === 'completed';
    const title = isSuccess ? '备份恢复完成通知' : '备份恢复失败通知';
    const content = isSuccess
        ? `您虚拟机 **${vmName}** 已成功从备份恢复。请启动虚拟机查看数据。`
        : `您虚拟机 **${vmName}** 的备份恢复失败。${statusMsg ? '原因：' + statusMsg : ''}`;
    try {
        await db.messages.create({
            uid: userId, title, content, type: 2, send_type: 1,
            created_at: new Date().toISOString()
        });
    } catch (e) { console.error('恢复通知站内信发送失败:', e.message); }
    if (user.email && user.emailVerified) {
        try {
            await sendEmail(user.email, title, createEmailTemplate(title, `<p>您好，${user.username}！</p><p>${content.replace(/\*\*/g, '<strong>')}</p><p>如非本人操作，请忽略此邮件。</p>`));
        } catch (e) { console.error('恢复通知邮件发送失败:', e.message); }
    }
}

function startRestorePolling(taskId, upid) {
    const key = 'r-' + taskId;
    if (backupPollIntervals.has(key)) return;
    const interval = setInterval(async () => {
        try {
            const task = await pveApi.getTaskStatus(upid);
            if (!task) return;
            if (task.status === 'stopped' && task.exitstatus === 'OK') {
                clearInterval(interval);
                backupPollIntervals.delete(key);
                const restore = await db.restoreTasks.getById(taskId);
                await db.restoreTasks.complete(taskId);
                if (restore) sendRestoreNotification(restore.user_id, restore.vm_id, 'completed');
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
    startRestorePolling
};
