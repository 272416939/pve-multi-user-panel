const express = require('express');
const router = express.Router();
const db = require('../api/db-sqlite');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
router.get('/lxc/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userCts = db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id === vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此容器' });
        }

        const snapshots = await pveApi.getLxcSnapshots(req.params.vmid);
        const cfg = db.snapshotConfig.get();
        const dailyCreate = db.snapshotLogs.getDailyCount(req.user.id, 'create');
        const dailyRestore = db.snapshotLogs.getDailyCount(req.user.id, 'restore');
        res.json({
            snapshots,
            max_per_vm: cfg.max_per_vm,
            daily_create_limit: cfg.daily_create_limit,
            daily_restore_limit: cfg.daily_restore_limit,
            today_created: dailyCreate,
            today_restored: dailyRestore
        });
    } catch (error) {
        res.status(500).json({ error: '获取快照列表失败' });
    }
});

router.post('/lxc/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !/^[a-zA-Z0-9_-]{2,20}$/.test(name)) {
            return res.status(400).json({ error: '快照名称必须为2~20位英文、数字或 - _ 组合' });
        }
 
        if (req.user.role !== 'admin') {
            const userCts = db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
 
            const cfg = db.snapshotConfig.get();
            const snapshots = await pveApi.getLxcSnapshots(req.params.vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台容器最多保留 ${cfg.max_per_vm} 个快照` });
            }
 
            const dailyCreate = db.snapshotLogs.getDailyCount(req.user.id, 'create');
            if (dailyCreate >= cfg.daily_create_limit) {
                return res.status(400).json({ error: `今日快照创建次数已达上限（${cfg.daily_create_limit} 次）` });
            }
        }
 
        await pveApi.createLxcSnapshot(req.params.vmid, name, description || '');
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'create');
        res.json({ message: '快照创建成功' });
    } catch (error) {
        if (error.response?.status === 500 && error.response?.data?.errors?.snapname) {
            return res.status(400).json({ error: '快照名称已存在' });
        }
        res.status(500).json({ error: '创建快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.post('/lxc/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userCts = db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
 
            const status = await pveApi.getLxcStatus(req.params.vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭容器' });
            }
 
            const cfg = db.snapshotConfig.get();
            const dailyRestore = db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）` });
            }
        }
 
        await pveApi.rollbackLxcSnapshot(req.params.vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'restore');
        res.json({ message: '快照恢复成功，请稍后启动容器' });
    } catch (error) {
        res.status(500).json({ error: '恢复快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.delete('/lxc/:vmid/snapshots/:snapname', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userCts = db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
        }
        await pveApi.deleteLxcSnapshot(req.params.vmid, req.params.snapname);
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: '删除快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.get('/vm/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = req.params.vmid;
        // 权限校验
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        }

        const snapshots = await pveApi.getSnapshots(req.params.vmid);
        const cfg = db.snapshotConfig.get();
        const dailyCreate = db.snapshotLogs.getDailyCount(req.user.id, 'create');
        const dailyRestore = db.snapshotLogs.getDailyCount(req.user.id, 'restore');
        res.json({
            snapshots,
            max_per_vm: cfg.max_per_vm,
            daily_create_limit: cfg.daily_create_limit,
            daily_restore_limit: cfg.daily_restore_limit,
            today_created: dailyCreate,
            today_restored: dailyRestore
        });
    } catch (error) {
        res.status(500).json({ error: '获取快照列表失败' });
    }
});

router.post('/vm/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const { name, description } = req.body;
        if (!name || !/^[a-zA-Z0-9_-]{2,20}$/.test(name)) {
            return res.status(400).json({ error: '快照名称必须为2~20位英文、数字或 - _ 组合' });
        }
 
        // 校验 VM 归属（非 admin 用户只能操作自己的 VM）
        const vm = db.vms.getByVmIdAndUserId ? db.vms.getByVmIdAndUserId(req.params.vmid, req.user.id) : null;
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
 
            const cfg = db.snapshotConfig.get();
 
            // 检查单台 VM 快照数量上限
            const snapshots = await pveApi.getSnapshots(req.params.vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台虚拟机最多保留 ${cfg.max_per_vm} 个快照` });
            }
 
            // 检查每日创建上限
            const dailyCreate = db.snapshotLogs.getDailyCount(req.user.id, 'create');
            if (dailyCreate >= cfg.daily_create_limit) {
                return res.status(400).json({ error: `今日快照创建次数已达上限（${cfg.daily_create_limit} 次）` });
            }
        }
 
        await pveApi.createSnapshot(req.params.vmid, name, description || '');
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'create');
        res.json({ message: '快照创建成功' });
    } catch (error) {
        if (error.response?.status === 500 && error.response?.data?.errors?.snapname) {
            return res.status(400).json({ error: '快照名称已存在' });
        }
        res.status(500).json({ error: '创建快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.post('/vm/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
 
            // 检查 VM 是否已关机
            const status = await pveApi.getVmStatus(req.params.vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭虚拟机' });
            }
 
            const cfg = db.snapshotConfig.get();
            const dailyRestore = db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）` });
            }
        }
 
        await pveApi.rollbackSnapshot(req.params.vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'restore');
        res.json({ message: '快照恢复成功，请稍后启动虚拟机' });
    } catch (error) {
        res.status(500).json({ error: '恢复快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.delete('/vm/:vmid/snapshots/:snapname', authMiddleware, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            const userVms = db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == req.params.vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        }
        await pveApi.deleteSnapshot(req.params.vmid, req.params.snapname);
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: '删除快照失败: ' + (error.response?.data?.message || error.message) });
    }
});

router.get('/admin/snapshot-config', authMiddleware, adminMiddleware, async (req, res) => {
    res.json(db.snapshotConfig.get());
});

router.put('/admin/snapshot-config', authMiddleware, adminMiddleware, async (req, res) => {
    const { max_per_vm, daily_create_limit, daily_restore_limit } = req.body;
    db.snapshotConfig.set({
        max_per_vm: Math.max(1, parseInt(max_per_vm) || 5),
        daily_create_limit: Math.max(1, parseInt(daily_create_limit) || 20),
        daily_restore_limit: Math.max(1, parseInt(daily_restore_limit) || 10)
    });
    res.json({ message: '快照配置已保存' });
});


module.exports = router;
