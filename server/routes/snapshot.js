const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const db = require('../api/db');
// 多节点：按资产所在节点取 PVE 客户端（与旧单例同接口）
const { getPveClient } = require('../api/pve-clients');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { safeError } = require('../utils/safe-error');
// 统一审计埋点（utils/audit-log.js 导出，route 内不复刻包装函数）
const { auditAction } = require('../utils/audit-log');


// 快照名称格式：kz- 固定前缀 + 17 位随机 base62，总长 20 字符（符合 C-4 {2,20} 规则）
// 服务端生成，避免用户自定义名称重复导致 PVE 创建快照失败
function generateSnapshotName() {
    return 'kz-' + crypto.randomBytes(13).toString('base64').replace(/[+/=]/g, '').slice(0, 17);
}
router.get('/lxc/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userCts = await db.lxcContainers.getByUserId(req.user.id);
            const owned = userCts.some(c => c.ct_id === vmid);
            if (!owned) return res.status(403).json({ error: '无权操作此容器', code: 'LXC_NO_PERM_2' });
        }

        // 多节点：按资产所在节点取客户端（未分配给任何用户时回退默认节点）
        const pve = await getPveClient((await db.lxcContainers.getByCtId(vmid))[0]?.pve_node_id);
        const snapshots = await pve.getLxcSnapshots(vmid);
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
        res.status(500).json({ error: '获取快照列表失败', code: 'SNAPSHOT_LIST_FAILED' });
    }
});

router.post('/lxc/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const { description } = req.body;
        const vmid = parseInt(req.params.vmid);

        // H-4 修复：统一权限校验模式（资源存在性 + 归属 + 管理员豁免）
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器', code: 'LXC_NO_PERM_2' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限', code: 'LXC_UNASSIGNED' });
        }

        // M-2 修复：到期资源拦截（快照创建属于资源使用，到期后仅放行清理类操作）
        if (!isAdmin && ct && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
            return res.status(403).json({ error: '容器已到期，请先续费', code: 'LXC_EXPIRED_RENEW' });
        }

        const pve = await getPveClient(ct ? ct.pve_node_id : null); // 按资产所在节点取客户端

        // 非管理员配额限制
        if (!isAdmin) {
            const cfg = await db.snapshotConfig.get();
            const snapshots = await pve.getLxcSnapshots(vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台容器最多保留 ${cfg.max_per_vm} 个快照`, code: 'LXC_SNAPSHOT_LIMIT', params: [cfg.max_per_vm] });
            }
            const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
            if (dailyCreate >= cfg.daily_create_limit) {
                return res.status(400).json({ error: `今日快照创建次数已达上限（${cfg.daily_create_limit} 次）`, code: 'SNAPSHOT_CREATE_DAILY_LIMIT', params: [cfg.daily_create_limit] });
            }
        }

        const name = generateSnapshotName();
        await pve.createLxcSnapshot(vmid, name, description || '');
        db.snapshotLogs.add(req.user.id, vmid, 'create');
        await auditAction(req, 'lxc.snapshot.create', '创建 LXC ' + vmid + ' 快照');
        res.json({ message: '快照创建成功' });
    } catch (error) {
        if (error.response?.status === 500 && error.response?.data?.errors?.snapname) {
            return res.status(400).json({ error: '快照名称已存在', code: 'SNAPSHOT_NAME_TAKEN' });
        }
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.post('/lxc/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) return res.status(400).json({ error: '无效的容器 ID', code: 'INVALID_LXC_ID' });
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(req.params.snapname)) return res.status(400).json({ error: '无效的快照名称', code: 'INVALID_SNAPSHOT_NAME' });

        // H-4 修复：统一权限校验模式
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器', code: 'LXC_NO_PERM_2' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限', code: 'LXC_UNASSIGNED' });
        }

        // M-2 修复：到期资源拦截（快照回滚属于资源使用）
        if (!isAdmin && ct && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
            return res.status(403).json({ error: '容器已到期，请先续费', code: 'LXC_EXPIRED_RENEW' });
        }

        const pve = await getPveClient(ct ? ct.pve_node_id : null); // 按资产所在节点取客户端

        // 非管理员额外检查
        if (!isAdmin) {
            const status = await pve.getLxcStatus(vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭容器', code: 'SHUTDOWN_BEFORE_ROLLBACK_LXC' });
            }
            const cfg = await db.snapshotConfig.get();
            const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）`, code: 'SNAPSHOT_RESTORE_DAILY_LIMIT', params: [cfg.daily_restore_limit] });
            }
        }

        await pve.rollbackLxcSnapshot(vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, vmid, 'restore');
        await auditAction(req, 'lxc.snapshot.rollback', '恢复 LXC ' + vmid + ' 快照');
        res.json({ message: '快照恢复成功，请稍后启动容器' });
    } catch (error) {
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.delete('/lxc/:vmid/snapshots/:snapname', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        // V4-10 修复：vmid 范围白名单（与同文件其余 3 个快照端点一致，规范 C-2）
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的 LXC ID', code: 'INVALID_LXC_ID_2' });
        }
        const snapname = req.params.snapname;
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(snapname)) {
            return res.status(400).json({ error: '无效的快照名称', code: 'INVALID_SNAPSHOT_NAME' });
        }

        // H-4 修复：统一权限校验模式
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器', code: 'LXC_NO_PERM_2' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '容器未分配，无权限', code: 'LXC_UNASSIGNED' });
        }

        const pve = await getPveClient(ct ? ct.pve_node_id : null); // 按资产所在节点取客户端
        await pve.deleteLxcSnapshot(vmid, req.params.snapname);
        await auditAction(req, 'lxc.snapshot.delete', '删除 LXC ' + vmid + ' 快照');
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.get('/vm/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        // 权限校验
        const isAdmin = req.user.role === 'admin';
        if (!isAdmin) {
            const userVms = await db.vms.getByUserId(req.user.id);
            const owned = userVms.some(v => v.vm_id == vmid);
            if (!owned) {
                return res.status(403).json({ error: '无权操作此虚拟机', code: 'VM_NO_PERM' });
            }
        }

        // 多节点：按资产所在节点取客户端（未分配给任何用户时回退默认节点）
        const pve = await getPveClient((await db.vms.getByVmid(vmid))?.pve_node_id);
        const snapshots = await pve.getSnapshots(vmid);
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
        res.status(500).json({ error: '获取快照列表失败', code: 'SNAPSHOT_LIST_FAILED' });
    }
});

router.post('/vm/:vmid/snapshots', authMiddleware, async (req, res) => {
    try {
        const { description } = req.body;
        const vmid = parseInt(req.params.vmid);

        // H-4 修复：统一权限校验模式
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机', code: 'VM_NO_PERM' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限', code: 'VM_UNASSIGNED' });
        }

        // M-2 修复：到期资源拦截（快照创建属于资源使用）
        if (!isAdmin && vm && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
            return res.status(403).json({ error: '虚拟机已到期，请先续费', code: 'VM_EXPIRED_RENEW' });
        }

        const pve = await getPveClient(vm ? vm.pve_node_id : null); // 按资产所在节点取客户端

        // 非管理员配额限制
        if (!isAdmin) {
            const cfg = await db.snapshotConfig.get();
            const snapshots = await pve.getSnapshots(vmid);
            if (snapshots.length >= cfg.max_per_vm) {
                return res.status(400).json({ error: `每台虚拟机最多保留 ${cfg.max_per_vm} 个快照`, code: 'VM_SNAPSHOT_LIMIT', params: [cfg.max_per_vm] });
            }
            const dailyCreate = await db.snapshotLogs.getDailyCount(req.user.id, 'create');
            if (dailyCreate >= cfg.daily_create_limit) {
                return res.status(400).json({ error: `今日快照创建次数已达上限（${cfg.daily_create_limit} 次）` });
            }
        }

        const name = generateSnapshotName();
        await pve.createSnapshot(vmid, name, description || '');
        db.snapshotLogs.add(req.user.id, vmid, 'create');
        await auditAction(req, 'vm.snapshot.create', '创建 VM ' + vmid + ' 快照');
        res.json({ message: '快照创建成功' });
    } catch (error) {
        if (error.response?.status === 500 && error.response?.data?.errors?.snapname) {
            return res.status(400).json({ error: '快照名称已存在', code: 'SNAPSHOT_NAME_TAKEN' });
        }
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.post('/vm/:vmid/snapshots/:snapname/rollback', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的虚拟机 ID', code: 'INVALID_VM_ID' });
        }
        // SEC-001 修复：snapname 白名单校验（唯一缺失的端点）
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(req.params.snapname)) {
            return res.status(400).json({ error: '无效的快照名称', code: 'INVALID_SNAPSHOT_NAME' });
        }

        // H-4 修复：统一权限校验模式
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机', code: 'VM_NO_PERM' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限', code: 'VM_UNASSIGNED' });
        }

        // M-2 修复：到期资源拦截（快照回滚属于资源使用）
        if (!isAdmin && vm && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
            return res.status(403).json({ error: '虚拟机已到期，请先续费', code: 'VM_EXPIRED_RENEW' });
        }

        const pve = await getPveClient(vm ? vm.pve_node_id : null); // 按资产所在节点取客户端

        // 非管理员额外检查
        if (!isAdmin) {
            const status = await pve.getVmStatus(vmid);
            if (status.status !== 'stopped') {
                return res.status(400).json({ error: '回滚前请先关闭虚拟机', code: 'SHUTDOWN_BEFORE_ROLLBACK_VM' });
            }
            const cfg = await db.snapshotConfig.get();
            const dailyRestore = await db.snapshotLogs.getDailyCount(req.user.id, 'restore');
            if (dailyRestore >= cfg.daily_restore_limit) {
                return res.status(400).json({ error: `今日快照恢复次数已达上限（${cfg.daily_restore_limit} 次）` });
            }
        }

        await pve.rollbackSnapshot(vmid, req.params.snapname);
        db.snapshotLogs.add(req.user.id, vmid, 'restore');
        await auditAction(req, 'vm.snapshot.rollback', '恢复 VM ' + vmid + ' 快照');
        res.json({ message: '快照恢复成功，请稍后启动虚拟机' });
    } catch (error) {
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
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
                return res.status(403).json({ error: '无权操作此虚拟机', code: 'VM_NO_PERM' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '虚拟机未分配，无权限', code: 'VM_UNASSIGNED' });
        }

        // PVE-3 修复：snapname 白名单校验
        if (!/^[a-zA-Z0-9_-]{2,20}$/.test(req.params.snapname)) {
            return res.status(400).json({ error: '无效的快照名称', code: 'INVALID_SNAPSHOT_NAME' });
        }

        const pve = await getPveClient(vm ? vm.pve_node_id : null); // 按资产所在节点取客户端
        await pve.deleteSnapshot(vmid, req.params.snapname);
        await auditAction(req, 'vm.snapshot.delete', '删除 VM ' + vmid + ' 快照');
        res.json({ message: '快照已删除' });
    } catch (error) {
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.get('/admin/snapshot-config', authMiddleware, adminMiddleware, async (req, res) => {
    res.json(db.snapshotConfig.get());
});

router.put('/admin/snapshot-config', authMiddleware, adminMiddleware, async (req, res) => {
    const { max_per_vm, daily_create_limit, daily_restore_limit } = req.body;
    // 保存前取旧配置（审计 diff 用；原 set 未 await 属 fire-and-forget，一并修正）
    const oldCfg = await db.snapshotConfig.get();
    await db.snapshotConfig.set({
        max_per_vm: Math.max(1, parseInt(max_per_vm) || 5),
        daily_create_limit: Math.max(1, parseInt(daily_create_limit) || 20),
        daily_restore_limit: Math.max(1, parseInt(daily_restore_limit) || 10)
    });
    const newCfg = await db.snapshotConfig.get();
    // 操作审计：更新快照配置（字段级 diff）
    try {
        const { auditLog } = require('../utils/audit-log');
        const { buildFieldDiff } = require('../utils/audit-diff');
        const changes = buildFieldDiff(oldCfg, newCfg, [
            { key: 'max_per_vm', label: '每机上限', num: true },
            { key: 'daily_create_limit', label: '每日创建', num: true },
            { key: 'daily_restore_limit', label: '每日恢复', num: true }
        ]);
        if (changes.length) {
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.snapshot', resourceType: 'config', resourceId: 'snapshot', details: '更新快照配置；变更:' + changes.join(', '), req });
        }
    } catch (e) {}
    res.json({ message: '快照配置已保存' });
});


module.exports = router;
