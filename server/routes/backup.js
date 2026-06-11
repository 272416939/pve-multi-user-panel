const express = require('express');
const router = express.Router();
const db = require('../api/db-sqlite');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const dbg = require('../utils/debug');
const { startLxcBackupPolling, sendLxcRestoreNotification, startBackupPolling, startRestorePolling } = require('../services/backup-polling');
router.get('/lxc/:vmid/backups', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
 
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            const isAdmin = req.user.role === 'admin';
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限查看此容器备份' });
            }
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: '资源未分配，无权限' });
        }
 
        const backups = db.backups.getByCtId(vmid);
        const cfg = db.lxcConfig.get();
        const current = backups.filter(b => b.status !== 'failed').length;
        const todayCount = db.backupLogs.getDailyCount(req.user.id);
        const limits = { current, max_per_vm: cfg.max_per_vm, today_creates: todayCount, daily_limit: cfg.daily_limit };
 
        res.json({ backups, limits });
    } catch (error) {
        res.status(500).json({ error: '获取备份列表失败: ' + error.message });
    }
});

router.post('/lxc/:vmid/backups', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const { notes, storage: reqStorage } = req.body;
 
        const allCts = db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
 
        if (!ct) {
            return res.status(404).json({ error: '容器未分配或不存在' });
        }
 
        const isOwner = req.user.id === ct.user_id;
        const isAdmin = req.user.role === 'admin';
        if (!isOwner && !isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器' });
        }
 
        // 检查容器是否正在运行
        const status = await pveApi.getLxcStatus(vmid);
        if (status.status === 'running') {
            return res.status(400).json({ error: '备份前请先关闭容器' });
        }
 
        // 检查是否有正在进行的备份或恢复
        const runningBackups = db.backups.getRunningBackups().filter(b => b.ct_id === vmid && b.type === 'lxc');
        if (runningBackups.length > 0) {
            return res.status(400).json({ error: '该容器已有备份或恢复任务在进行中' });
        }
 
        const cfg = db.backupConfig.get();
        const lxcCfg = db.lxcConfig.get();
 
        // 非管理员受最大备份数和每日次数限制
        if (!isAdmin) {
            const count = db.backups.getCountByCtId(vmid, req.user.id);
            if (count >= lxcCfg.max_per_vm) {
                return res.status(400).json({ error: `该容器备份数已达上限（${lxcCfg.max_per_vm} 个），请删除旧备份后再试` });
            }
 
            const dailyCount = db.backupLogs.getDailyCount(req.user.id);
            if (dailyCount >= cfg.daily_limit) {
                return res.status(400).json({ error: `今日备份次数已达上限（${cfg.daily_limit} 次）` });
            }
        }
 
        // 获取存储位置：优先使用前端传入的存储，否则使用全局默认
        const storage = reqStorage || lxcCfg.default_storage || cfg.default_storage || 'local';
 
        // 获取容器的 rootfs 存储位置，用于恢复时指定
        let rootfsStorage = '';
        try {
            const config = await pveApi.getLxcConfig(vmid);
            if (config.rootfs) {
                rootfsStorage = config.rootfs.split(':')[0] || '';
            }
        } catch (e) {
            console.error('获取容器 rootfs 存储信息失败:', e.message);
        }
 
        // 创建备份记录
        const backupRecord = db.backups.create({
            vm_id: 0,
            ct_id: vmid,
            user_id: req.user.id,
            storage: storage,
            notes: notes || '',
            type: 'lxc',
            rootfs_storage: rootfsStorage
        });
        const backupId = backupRecord.id;
 
        // 发送备份命令到 PVE
        const result = await pveApi.createBackup(vmid, storage, 'suspend');
        const upid = result.data;
 
        db.backups.updateProgress(backupId, 0, upid);
        db.backupLogs.add(req.user.id, vmid, 'create');
 
        // 启动轮询
        startLxcBackupPolling(backupId, upid, vmid);
 
        res.json({ id: backupId, message: '备份任务已提交' });
    } catch (error) {
        console.error('创建 LXC 备份失败:', error.response?.data || error.message);
        res.status(500).json({ error: '创建备份失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.delete('/lxc/:vmid/backups/:id', authMiddleware, async (req, res) => {
    try {
        const backupId = parseInt(req.params.id);
        const backup = db.backups.getById(backupId);
 
        if (!backup || backup.type !== 'lxc') {
            return res.status(404).json({ error: '备份不存在' });
        }
 
        if (req.user.role !== 'admin' && backup.user_id !== req.user.id) {
            return res.status(403).json({ error: '无权限删除此备份' });
        }
 
        // 删除 PVE 上的备份文件（失败仅记录，不影响 DB 删除）
        if (backup.filename) {
            const volid = `${backup.storage}:backup/${backup.filename}`;
            try {
                await pveApi.deleteBackupFile(volid);
            } catch (e) {
                console.error('删除 PVE 备份文件失败:', e.message);
            }
        }
 
        // 先删除关联的恢复任务记录（避免外键约束冲突）
        db.restoreTasks.deleteByBackupId(backupId);
 
        db.backups.delete(backupId);
        res.json({ message: '备份已删除' });
    } catch (error) {
        console.error('删除备份失败:', error);
        res.status(500).json({ error: '删除备份失败: ' + error.message });
    }
});

router.post('/lxc/:vmid/backups/:id/restore', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const backupId = parseInt(req.params.id);
 
        const allCts = db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            const isAdmin = req.user.role === 'admin';
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
        } else if (req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权限操作此容器' });
        }

        const backup = db.backups.getById(backupId);
        if (!backup || backup.type !== 'lxc') {
            return res.status(404).json({ error: '备份不存在' });
        }
        if (backup.status !== 'completed' || !backup.filename) {
            return res.status(400).json({ error: '备份文件不完整，无法恢复' });
        }
 
        // 检查容器是否已关机
        const status = await pveApi.getLxcStatus(vmid);
        if (status.status !== 'stopped') {
            return res.status(400).json({ error: '恢复前请先关闭容器' });
        }
 
        // 检查是否有正在进行的备份或恢复
        const runningBackups = db.backups.getRunningBackups().filter(b => b.ct_id === vmid && b.type === 'lxc');
        if (runningBackups.length > 0) {
            return res.status(400).json({ error: '该容器已有备份或恢复任务在进行中' });
        }
 
        // 通过 SSH 执行 pct restore --force 1 覆盖恢复（无需先删容器）
        const volid = `${backup.storage}:backup/${backup.filename}`;
 
        // 创建恢复任务记录
        const restoreRecord = db.restoreTasks.create({
            vm_id: vmid,
            user_id: req.user.id,
            backup_id: backupId,
            pve_upid: volid
        });
 
        // 异步执行 pct restore（不阻塞请求）
        (async () => {
            try {
                const result = await restoreLxcBySSH(vmid, volid, backup.rootfs_storage);
                if (result.code === 0) {
                    db.restoreTasks.complete(restoreRecord.id);
                    console.log(`[LXC恢复SSH] 容器 ${vmid} 恢复完成`);
                    try {
                        sendLxcRestoreNotification(vmid, restoreRecord.id, 'completed');
                    } catch (_) {}
                } else {
                    const errMsg = result.stderr || result.stdout || '未知错误';
                    db.restoreTasks.fail(restoreRecord.id, errMsg);
                    console.error(`[LXC恢复SSH] 容器 ${vmid} 恢复失败:`, errMsg);
                    try {
                        sendLxcRestoreNotification(vmid, restoreRecord.id, 'failed');
                    } catch (_) {}
                }
            } catch (e) {
                db.restoreTasks.fail(restoreRecord.id, e.message);
                console.error(`[LXC恢复SSH] 容器 ${vmid} 恢复异常:`, e.message);
                try {
                    sendLxcRestoreNotification(vmid, restoreRecord.id, 'failed');
                } catch (_) {}
            }
        })();
 
        res.json({ id: restoreRecord.id, message: '恢复任务已提交' });
    } catch (error) {
        console.error('恢复备份失败:', error.response?.data || error.message);
        res.status(500).json({ error: '恢复备份失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.get('/admin/backup-config', authMiddleware, adminMiddleware, async (req, res) => {
    res.json(db.backupConfig.get());
});

router.put('/admin/backup-config', authMiddleware, adminMiddleware, async (req, res) => {
    const { default_storage, max_per_vm, daily_limit } = req.body;
    db.backupConfig.set({
        default_storage: default_storage || 'local',
        max_per_vm: Math.max(1, parseInt(max_per_vm) || 3),
        daily_limit: Math.max(1, parseInt(daily_limit) || 3)
    });
    res.json({ message: '备份配置已保存' });
});

router.get('/vm/:vmid/backups', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == req.params.vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此虚拟机' });
        }
        const backups = db.backups.getByVmId(req.params.vmid);
        const cfg = db.backupConfig.get();
        const current = backups.filter(b => b.status !== 'failed').length;
        const todayStr = new Date().toISOString().split('T')[0];
        const todayCount = db.backupLogs.getDailyCount(req.user.id);
        res.json({ backups, limits: { current, max_per_vm: cfg.max_per_vm, today_creates: todayCount, daily_limit: cfg.daily_limit } });
    } catch (error) {
        res.status(500).json({ error: '获取备份列表失败' });
    }
});

router.post('/vm/:vmid/backups', authMiddleware, async (req, res) => {
    try {
        const vmid = req.params.vmid;
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此虚拟机' });
        }
        const status = await pveApi.getVmStatus(vmid);
        if (status.status !== 'stopped') {
            return res.status(400).json({ error: '请先关闭虚拟机后再进行备份' });
        }
        const existingRunning = db.backups.getByVmId(vmid).filter(b => b.status === 'running' || b.status === 'pending');
        if (existingRunning.length > 0) {
            return res.status(409).json({ error: '该虚拟机有正在进行的备份，请等待完成后再试' });
        }
        let storage = req.body.storage || '';
        if (req.user.role !== 'admin') {
            const vmRecord = db.vms.getByUserId(req.user.id).find(v => v.vm_id == vmid);
            storage = (vmRecord && vmRecord.backup_storage) || db.backupConfig.get().default_storage;
            const cfg = db.backupConfig.get();
            const backupCount = db.backups.getCountByVmId(vmid, req.user.id);
            if (backupCount >= cfg.max_per_vm) {
                return res.status(400).json({ error: `该虚拟机备份数已达上限（${cfg.max_per_vm} 个），请删除旧备份后再试` });
            }
            const todayStr = new Date().toISOString().split('T')[0];
            const dailyCount = db.backupLogs.getDailyCount(req.user.id);
            if (dailyCount >= cfg.daily_limit) {
                return res.status(400).json({ error: `今日备份次数已达上限（${cfg.daily_limit} 次）` });
            }
        }
        if (!storage) storage = db.backupConfig.get().default_storage;
        const backup = db.backups.create({ vm_id: vmid, user_id: req.user.id, storage, notes: req.body.notes || '' });
        db.backupLogs.add(req.user.id, vmid, 'create');
        try {
            const result = await pveApi.createBackup(vmid, storage, 'stop');
            const upid = result.data || result;
            db.backups.updateProgress(backup.id, 0, upid);
            startBackupPolling(backup.id, upid);
        } catch (e) {
            db.backups.fail(backup.id, e.response?.data?.message || e.message);
            return res.status(500).json({ error: '创建备份任务失败: ' + (e.response?.data?.message || e.message) });
        }
        res.json({ message: '备份任务已创建', backup_id: backup.id });
    } catch (error) {
        res.status(500).json({ error: '创建备份失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.delete('/backups/:id', authMiddleware, async (req, res) => {
    try {
        const backup = db.backups.getById(req.params.id);
        if (!backup) return res.status(404).json({ error: '备份不存在' });
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == backup.vm_id);
            if (!owned) return res.status(403).json({ error: '无权删除此备份' });
            if (backup.status === 'running' || backup.status === 'pending') {
                return res.status(400).json({ error: '不能删除正在执行的备份' });
            }
        }
        if (backup.filename && backup.status === 'completed') {
            const volid = backup.type === 'lxc' ? `${backup.storage}:backup/${backup.filename}` : backup.filename;
            try { await pveApi.deleteBackupFile(volid); } catch (e) { console.error('删除备份文件失败:', e.message); }
        }
        db.restoreTasks.deleteByBackupId(parseInt(req.params.id));
        db.backups.delete(req.params.id);
        res.json({ message: '备份已删除' });
    } catch (error) {
        res.status(500).json({ error: '删除备份失败' });
    }
});

router.post('/backups/batch-delete', authMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: '请选择要删除的备份' });
        for (const id of ids) {
            const backup = db.backups.getById(id);
            if (!backup) continue;
            if (req.user.role !== 'admin') {
                if (backup.type === 'lxc') {
                    // LXC 备份：检查用户是否是该容器的拥有者
                    const userCts = db.lxcContainers.getByUserId(req.user.id);
                    const owned = userCts.some(c => c.ct_id == backup.ct_id);
                    if (!owned) continue;
                } else {
                    const userVms = db.vms.getByUserId(req.user.id);
                    const owned = userVms.some(v => v.vm_id == backup.vm_id);
                    if (!owned) continue;
                }
                if (backup.status === 'running' || backup.status === 'pending') continue;
            }
            if (backup.filename && backup.status === 'completed') {
                try {
                    const volid = backup.type === 'lxc' ? `${backup.storage}:backup/${backup.filename}` : backup.filename;
                    await pveApi.deleteBackupFile(volid);
                } catch (e) { console.error('删除备份文件失败:', e.message); }
            }
        }
        for (const id of ids) {
            db.restoreTasks.deleteByBackupId(id);
        }
        db.backups.deleteBatch(ids);
        res.json({ message: `已删除 ${ids.length} 个备份` });
    } catch (error) {
        res.status(500).json({ error: '批量删除失败' });
    }
});

router.get('/admin/backups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = req.query.vm_id;
        let backups;
        if (vmid) {
            backups = db.backups.getByVmId(vmid);
        } else {
            backups = db.backups.getByStatus('completed').concat(
                db.backups.getByStatus('running'),
                db.backups.getByStatus('pending'),
                db.backups.getByStatus('failed')
            );
        }
        res.json(backups);
    } catch (error) {
        res.status(500).json({ error: '获取备份列表失败' });
    }
});

router.delete('/admin/backups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const backup = db.backups.getById(req.params.id);
        if (!backup) return res.status(404).json({ error: '备份不存在' });
        if (backup.filename && backup.status === 'completed') {
            const volid = backup.type === 'lxc' ? `${backup.storage}:backup/${backup.filename}` : backup.filename;
            try { await pveApi.deleteBackupFile(volid); } catch (e) { console.error('删除备份文件失败:', e.message); }
        }
        db.restoreTasks.deleteByBackupId(parseInt(req.params.id));
        db.backups.delete(req.params.id);
        res.json({ message: '备份已删除' });
    } catch (error) {
        res.status(500).json({ error: '删除备份失败' });
    }
});

router.post('/vm/:vmid/backups/:id/restore', authMiddleware, async (req, res) => {
    try {
        const vmid = req.params.vmid;
        const backupId = req.params.id;
        const backup = db.backups.getById(backupId);
        if (!backup) return res.status(404).json({ error: '备份不存在' });
        if (backup.status !== 'completed' || !backup.filename) {
            return res.status(400).json({ error: '备份文件不完整，无法恢复' });
        }
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此虚拟机' });
        }
        const status = await pveApi.getVmStatus(vmid);
        if (status.status !== 'stopped') {
            return res.status(400).json({ error: '请先关闭虚拟机后再进行恢复' });
        }
        const runningBackups = db.backups.getByVmId(vmid).filter(b => b.status === 'running' || b.status === 'pending');
        const runningRestores = db.restoreTasks.getRunningByVmId(vmid);
        if (runningBackups.length > 0 || runningRestores.length > 0) {
            return res.status(409).json({ error: '该虚拟机有正在进行的备份或恢复任务，请等待完成后再试' });
        }
        const restore = db.restoreTasks.create({ vm_id: vmid, user_id: req.user.id, backup_id: backupId });
        try {
            const result = await pveApi.restoreBackup(vmid, backup.filename);
            const upid = result.data || result;
            db.restoreTasks.updateProgress(restore.id, 0, upid);
            startRestorePolling(restore.id, upid);
        } catch (e) {
            db.restoreTasks.fail(restore.id, e.response?.data?.message || e.message);
            return res.status(500).json({ error: '创建恢复任务失败: ' + (e.response?.data?.message || e.message) });
        }
        res.json({ message: '恢复任务已创建，完成后将通过站内信和邮件通知您' });
    } catch (error) {
        res.status(500).json({ error: '恢复失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.get('/vm/:vmid/restore-status', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == req.params.vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此虚拟机' });
        }
        const tasks = db.restoreTasks.getByVmId(req.params.vmid).filter(t => t.status === 'running' || t.status === 'pending');
        res.json(tasks.length > 0 ? tasks[0] : null);
    } catch (error) {
        res.status(500).json({ error: '获取恢复任务状态失败' });
    }
});

router.post('/admin/backups/cleanup', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '请指定要清理的备份 ID' });
        }
        let deleted = 0;
        const delRestore = db.db.prepare('DELETE FROM restore_tasks WHERE backup_id = ?');
        for (const id of ids) {
            const backup = db.db.prepare('SELECT * FROM backups WHERE id = ?').get(id);
            if (backup) {
                delRestore.run(id);
                db.backups.delete(id);
                deleted++;
            }
        }
        res.json({ message: `已清理 ${deleted} 条备份记录` });
    } catch (error) {
        console.error('清理备份记录失败:', error);
        res.status(500).json({ error: '清理失败: ' + error.message });
    }
});


module.exports = router;
