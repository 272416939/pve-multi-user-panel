const express = require('express');
const router = express.Router();
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { safeError } = require('../utils/safe-error');
router.get('/lxc/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userCts = await db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id === vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此容器' });
        }

        const snapshots = await pveApi.getLxcSnapshots(req.params.vmid);
        const cfg = await db.snapshotConfig.get();
        const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
        const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
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
        const vmid = parseInt(req.params.vmid);
        if (!name || !/^[a-zA-Z0-9_-]{2,20}$/.test(name)) {
            return res.status(400).json({ error: '快照名称必须为2~20位英文、数字或 - _ 组合' });
        }

        // H-4 修复：统一权限校验模式（资源存在性 + 归属 + 管理员豁免）
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限' });
        }

        // 非管理员配额限制
        if (!isAdmin) {
            const cfg = await db.snapshotConfig.get();
            const snapshots = await pveApi.getLxcSnapshots(req.params.vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台容器最多保留 ${cfg.max_per_vm} 个快照` });
            }
            const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
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
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的容器 ID' });
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(req.params.snapname)) return res.status(400).json({ error: '无效的快照名称' });

        // H-4 修复：统一权限校验模式
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限' });
        }

        // 非管理员额外检查
        if (!isAdmin) {
            const status = await pveApi.getLxcStatus(vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭容器' });
            }
            const cfg = await db.snapshotConfig.get();
            const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）` });
            }
        }

        await pveApi.rollbackLxcSnapshot(req.params.vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'restore');
        res.json({ message: '快照恢复成功，请稍后启动容器' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.delete('/lxc/:vmid/snapshots/:snapname', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const snapname = req.params.snapname;
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(snapname)) {
            return res.status(400).json({ error: '无效的快照名称' });
        }

        // H-4 修复：统一权限校验模式
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限' });
        }

        await pveApi.deleteLxcSnapshot(req.params.vmid, req.params.snapname);
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/vm/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = req.params.vmid;
        // 权限校验
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userVms = await db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        }

        const snapshots = await pveApi.getSnapshots(req.params.vmid);
        const cfg = await db.snapshotConfig.get();
        const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
        const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
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
        const vmid = parseInt(req.params.vmid);
        if (!name || !/^[a-zA-Z0-9_-]{2,20}$/.test(name)) {
            return res.status(400).json({ error: '快照名称必须为2~20位英文、数字或 - _ 组合' });
        }

        // H-4 修复：统一权限校验模式
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限' });
        }

        // 非管理员配额限制
        if (!isAdmin) {
            const cfg = await db.snapshotConfig.get();
            const snapshots = await pveApi.getSnapshots(req.params.vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台虚拟机最多保留 ${cfg.max_per_vm} 个快照` });
            }
            const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
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
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/vm/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);

        // H-4 修复：统一权限校验模式
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限' });
        }

        // 非管理员额外检查
        if (!isAdmin) {
            const status = await pveApi.getVmStatus(req.params.vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭虚拟机' });
            }
            const cfg = await db.snapshotConfig.get();
            const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）` });
            }
        }

        await pveApi.rollbackSnapshot(req.params.vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, req.params.vmid, 'restore');
        res.json({ message: '快照恢复成功，请稍后启动虚拟机' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.delete('/vm/:vmid/snapshots/:snapname', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);

        // H-4 修复：统一权限校验模式
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限' });
        }

        // PVE-3 修复：snapname 白名单校验
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(req.params.snapname)) {
            return res.status(400).json({ error: '无效的快照名称' });
        }

        await pveApi.deleteSnapshot(req.params.vmid, req.params.snapname);
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
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
