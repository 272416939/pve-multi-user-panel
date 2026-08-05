// server/routes/package.js - 套餐与订购路由
// 规范第七节：路由只做参数校验、归属校验、响应组装；开通编排在 services/provisioning.js

var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
var pveApi = require('../api/pve-api');
var cacheStore = require('../utils/cache-store');
var { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { safeError } = require('../utils/safe-error');
// 单一来源：周期常量统一走 constants（规范第七节）
var { VALID_PERIODS } = require('../constants');
// 开通业务下沉 services/（规范第七节）
var provisioning = require('../services/provisioning');

// 套餐列表缓存（5 分钟 TTL，低频变更场景；cache-store 按 namespace 单例，与 service 共享）
var vmPackageCache = cacheStore.create('vm_packages', 300);
var lxcPackageCache = cacheStore.create('lxc_packages', 300);

// 操作审计统一封装（敏感写操作埋点，失败不影响主流程；规范十一）
async function adminAudit(req, action, details) {
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: req.user.id, username: req.user.username, action: action, details: details, req });
    } catch (e) {}
}

// 套餐规格摘要（埋点详情适配：名称 + 核心/内存/磁盘/月付价格）
function packageSpec(p) {
    var memG = Math.round((parseInt(p && p.memory) || 0) / 1024);
    return (p && p.name || '') + '(' + (parseInt(p && p.cores) || 0) + '核/' + memG + 'G/' + (parseInt(p && p.disk_size) || 0) + 'G' + (p && p.monthly_price !== undefined && p.monthly_price !== null ? '/月付¥' + p.monthly_price : '') + ')';
}

// ===== 用户侧：套餐列表（无需 admin） =====
router.get('/vm-packages', authMiddleware, async (req, res) => {
    try {
        var cached = await vmPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.vmPackages.getAll();
        await vmPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.get('/lxc-packages', authMiddleware, async (req, res) => {
    try {
        var cached = await lxcPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.lxcPackages.getAll();
        await lxcPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// 用户端：获取按分组归类的套餐列表
router.get('/package-groups', authMiddleware, async (req, res) => {
    try {
        var type = req.query.type || 'vm';
        var groups = await db.packageGroups.getByType(type);
        var packages = type === 'vm' ? await db.vmPackages.getAll() : await db.lxcPackages.getAll();
        // 只返回 active 套餐
        packages = packages.filter(function(p) { return p.status === 'active'; });
        res.json({ groups: groups, packages: packages });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// ===== 用户侧：套餐订购（自动取当前用户；业务在 services/provisioning.js） =====
router.post('/vm-packages/:id/order', authMiddleware, async (req, res) => {
    try {
        var period = req.body.period || 'month';
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);

        var result = await provisioning.provisionVm({
            userId: req.user.id,
            username: req.user.username,
            req: req,
            packageId: parseInt(req.params.id),
            period: period,
            period_count: period_count,
            macGroupId: req.body.mac_group_id || '',
            osTemplateId: parseInt(req.body.os_template_id) || 0,
            subnetId: parseInt(req.body.subnet_id) || 0
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        res.json(result.data);
    } catch (e) {
        console.error('[package] 用户订购 VM 失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/lxc-packages/:id/order', authMiddleware, async (req, res) => {
    try {
        var period = req.body.period || 'month';
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);

        var result = await provisioning.provisionLxc({
            userId: req.user.id,
            username: req.user.username,
            req: req,
            packageId: parseInt(req.params.id),
            period: period,
            period_count: period_count,
            macGroupId: req.body.mac_group_id || '',
            subnetId: parseInt(req.body.subnet_id) || 0
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        res.json(result.data);
    } catch (e) {
        console.error('[package] 用户订购 LXC 失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== v1.3 新增：获取套餐可选的 OS 模板列表 =====
router.get('/vm-packages/:id/available-os-templates', authMiddleware, async (req, res) => {
    try {
        var pkg = await db.vmPackages.getById(req.params.id);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var allTemplates = await db.osTemplates.getEnabled();
        var available = allTemplates.filter(function(t) {
            if (!t.allowed_package_ids || t.allowed_package_ids.length === 0) return true;
            return t.allowed_package_ids.indexOf(pkg.id) !== -1;
        });

        res.json({
            success: true,
            data: available.map(function(t) {
                return {
                    id: t.id,
                    name: t.name,
                    os_type: t.os_type,
                    os_version: t.os_version,
                    ostype: t.ostype,
                    description: t.description
                };
            }),
            default_id: pkg.default_os_template_id || null
        });
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== VM 套餐（管理员） =====
router.get('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var cached = await vmPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.vmPackages.getAll();
        await vmPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.vmPackages.create(req.body);
        await vmPackageCache.del('all');
        // 操作审计：创建 VM 套餐
        await adminAudit(req, 'admin.package.create', '创建VM套餐:' + packageSpec(req.body));
        res.json(r);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.vmPackages.update(parseInt(req.params.id), req.body);
        await vmPackageCache.del('all');
        // 操作审计：更新 VM 套餐
        await adminAudit(req, 'admin.package.update', '更新VM套餐 #' + parseInt(req.params.id) + ':' + packageSpec(req.body));
        res.json(r);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.vmPackages.delete(parseInt(req.params.id));
        await vmPackageCache.del('all');
        // 操作审计：删除 VM 套餐
        await adminAudit(req, 'admin.package.delete', '删除VM套餐 #' + parseInt(req.params.id));
        res.json({ message: '已删除' });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/vm-packages/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.vmPackages.batchUpdateSortOrder(ids);
        await vmPackageCache.del('all');
        // 操作审计：调整 VM 套餐排序
        await adminAudit(req, 'admin.package.reorder', '调整VM套餐排序 ' + ids.length + ' 个');
        res.json({ success: true });
    } catch (e) {
        console.error('[package] vm-packages reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// VM 套餐开通（业务在 services/provisioning.js）
router.post('/admin/vm-packages/:id/provision', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var period = req.body.period || 'month';
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);

        var result = await provisioning.adminProvisionVm({
            userId: parseInt(req.body.user_id),
            packageId: parseInt(req.params.id),
            name: req.body.name || '',
            expDate: req.body.expiration_date || null,
            renewalPrice: req.body.renewal_price || '',
            renewalPeriod: req.body.renewal_period || 'month',
            period: period,
            period_count: period_count,
            subnetId: parseInt(req.body.subnet_id) || 0
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        // 操作审计：管理员代开 VM（资源创建，含套餐/用户）
        await adminAudit(req, 'admin.order.provision', '为 用户#' + (parseInt(req.body.user_id) || '-') + ' 代开 VM(套餐#' + parseInt(req.params.id) + ')' + (result.data && result.data.vmid ? ',VMID:' + result.data.vmid : ''));
        res.json(result.data);
    } catch (e) {
        console.error('[package] VM 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== LXC 套餐（管理员） =====
router.get('/admin/lxc-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var cached = await lxcPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.lxcPackages.getAll();
        await lxcPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/lxc-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.lxcPackages.create(req.body);
        await lxcPackageCache.del('all');
        // 操作审计：创建 LXC 套餐
        await adminAudit(req, 'admin.package.create', '创建LXC套餐:' + packageSpec(req.body));
        res.json(r);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.lxcPackages.update(parseInt(req.params.id), req.body);
        await lxcPackageCache.del('all');
        // 操作审计：更新 LXC 套餐
        await adminAudit(req, 'admin.package.update', '更新LXC套餐 #' + parseInt(req.params.id) + ':' + packageSpec(req.body));
        res.json(r);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.lxcPackages.delete(parseInt(req.params.id));
        await lxcPackageCache.del('all');
        // 操作审计：删除 LXC 套餐
        await adminAudit(req, 'admin.package.delete', '删除LXC套餐 #' + parseInt(req.params.id));
        res.json({ message: '已删除' });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/lxc-packages/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.lxcPackages.batchUpdateSortOrder(ids);
        await lxcPackageCache.del('all');
        // 操作审计：调整 LXC 套餐排序
        await adminAudit(req, 'admin.package.reorder', '调整LXC套餐排序 ' + ids.length + ' 个');
        res.json({ success: true });
    } catch (e) {
        console.error('[package] lxc-packages reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// LXC 套餐开通（业务在 services/provisioning.js）
router.post('/admin/lxc-packages/:id/provision', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var period = req.body.period || 'month';
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);

        var result = await provisioning.adminProvisionLxc({
            userId: parseInt(req.body.user_id),
            packageId: parseInt(req.params.id),
            name: req.body.name || '',
            expDate: req.body.expiration_date || null,
            renewalPrice: req.body.renewal_price || '',
            renewalPeriod: req.body.renewal_period || 'month',
            period: period,
            period_count: period_count,
            subnetId: parseInt(req.body.subnet_id) || 0
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        // 操作审计：管理员代开 LXC（资源创建，含套餐/用户）
        await adminAudit(req, 'admin.order.provision', '为 用户#' + (parseInt(req.body.user_id) || '-') + ' 代开 LXC(套餐#' + parseInt(req.params.id) + ')' + (result.data && result.data.ctid ? ',CTID:' + result.data.ctid : ''));
        res.json(result.data);
    } catch (e) {
        console.error('[package] LXC 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 套餐分组管理（管理员） =====
router.get('/admin/package-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var type = req.query.type;
        var groups = type ? await db.packageGroups.getByType(type) : await db.packageGroups.getAll();
        res.json(groups);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/package-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.packageGroups.create(req.body);
        // 操作审计：创建套餐分组
        await adminAudit(req, 'admin.package-group.create', '创建套餐分组:' + (req.body.name || r.id) + '(类型:' + (req.body.type || '-') + ')');
        res.json(r);
    } catch (e) { console.error('[package] create group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/package-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.packageGroups.update(parseInt(req.params.id), req.body);
        // 操作审计：更新套餐分组
        await adminAudit(req, 'admin.package-group.update', '更新套餐分组 #' + parseInt(req.params.id) + ':' + (req.body.name || ''));
        res.json(r);
    } catch (e) { console.error('[package] update group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/package-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.packageGroups.delete(parseInt(req.params.id));
        // 操作审计：删除套餐分组
        await adminAudit(req, 'admin.package-group.delete', '删除套餐分组 #' + parseInt(req.params.id));
        res.json({ message: '已删除' });
    } catch (e) { console.error('[package] delete group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/package-groups/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.packageGroups.batchUpdateSortOrder(ids);
        // 操作审计：调整套餐分组排序
        await adminAudit(req, 'admin.package-group.reorder', '调整套餐分组排序 ' + ids.length + ' 个');
        res.json({ success: true });
    } catch (e) {
        console.error('[package] package-groups reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 开通状态查询：前端只传 resourceId（DB 主键，无敏感信息），后端内部用 pve_upid 查 PVE =====
router.get('/provision-status', authMiddleware, async (req, res) => {
    try {
        var resourceId = parseInt(req.query.resourceId);
        var type = req.query.type;
        if (!resourceId || resourceId <= 0) return res.status(400).json({ error: '缺少 resourceId' });
        if (type !== 'vm' && type !== 'lxc') return res.status(400).json({ error: '无效的资源类型' });

        // SEC-02: 速率限制（每用户每分钟 30 次，略高于前端 3 秒轮询频率）
        var rateLimitKey = 'ratelimit:provision-status:' + req.user.id;
        var rateLimitResult = await checkConfiguredRateLimit('provision_status', rateLimitKey);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试' });
        }

        // SEC-01: 归属校验 — 按 resourceId 查 DB 记录，确认属于当前用户，防止 IDOR 越权查询
        var ownerRecord = type === 'vm'
            ? await db.vms.getById(resourceId)
            : await db.lxcContainers.getById(resourceId);
        if (!ownerRecord) {
            return res.status(404).json({ error: '任务不存在' });
        }
        var isAdmin = req.user.role === 'admin';
        if (ownerRecord.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: '无权限查询此任务' });
        }

        // pve_upid 为空表示开通已完成，无需再查 PVE
        var upid = ownerRecord.pve_upid;
        if (!upid || upid === '') {
            return res.json({ status: 'stopped', exitstatus: 'OK', isCompleted: true, isSuccess: true });
        }

        var taskStatus = await pveApi.getTaskStatus(upid);
        res.json({
            status: taskStatus.status,
            exitstatus: taskStatus.exitstatus,
            isCompleted: taskStatus.status === 'stopped',
            isSuccess: taskStatus.status === 'stopped' && taskStatus.exitstatus === 'OK'
        });
    } catch (e) {
        console.error('[package] 查询开通状态失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
