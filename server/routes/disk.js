// server/routes/disk.js - 用户侧硬盘管理路由
// 安全设计：authMiddleware + checkDiskOwnership + checkVmOwnership + SQL 数据隔离
// 参照文档 7.3 节：数据隔离（WHERE user_id = ?）+ 操作校验（中间件归属校验）
// 规范第七节：业务编排在 services/disk.js，路由只做参数校验、归属校验、响应组装

var express = require('express');
var router = express.Router();
var { authMiddleware } = require('../middleware/auth');
var { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
var { safeError } = require('../utils/safe-error');
var db = require('../api/db');
var cacheStore = require('../utils/cache-store');
// 单一来源：周期常量统一走 constants（规范第七节）
var { VALID_PERIODS } = require('../constants');
// 磁盘生命周期业务下沉 services/disk.js（规范第七节）
var diskService = require('../services/disk');

// PERF-07: 复用管理端磁盘规格/存储分组缓存（同一命名空间，管理端写操作 clearDiskCache 同时失效）
var specCache = cacheStore.create('disk_specs', 300);
var groupCache = cacheStore.create('storage_groups', 300);


// ==================== 中间件：权限校验 ====================

// 校验磁盘归属（核心越权防护）
async function checkDiskOwnership(req, res, next) {
  var diskId = parseInt(req.params.id);
  if (!Number.isInteger(diskId) || diskId < 1) {
    return res.status(400).json({ error: '无效的磁盘ID' });
  }
  try {
    var disk = await db.disks.getById(diskId);
    if (!disk) return res.status(404).json({ error: '磁盘不存在' });
    // 管理员可操作所有，用户只能操作自己的
    if (req.user.role !== 'admin' && disk.user_id !== req.user.id) {
      console.warn('[SECURITY] 用户 ' + req.user.id + ' 尝试越权操作磁盘 ' + diskId + '（归属 ' + disk.user_id + '）');
      return res.status(403).json({ error: '无权操作此磁盘' });
    }
    req.disk = disk;
    next();
  } catch (e) {
    return res.status(500).json({ error: safeError(e) });
  }
}

// 校验 VM 归属（挂载时防止挂载到他人 VM）
async function checkVmOwnership(req, res, next) {
  var vmid = parseInt(req.body.vmid);
  if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
    return res.status(400).json({ error: '无效的虚拟机ID' });
  }
  try {
    var vm = await db.vms.getByVmid(vmid);
    if (!vm) return res.status(404).json({ error: '虚拟机不存在' });
    if (req.user.role !== 'admin' && vm.user_id !== req.user.id) {
      console.warn('[SECURITY] 用户 ' + req.user.id + ' 尝试越权操作 VM ' + vmid + '（归属 ' + vm.user_id + '）');
      return res.status(403).json({ error: '无权操作此虚拟机' });
    }
    req.vm = vm;
    next();
  } catch (e) {
    return res.status(500).json({ error: safeError(e) });
  }
}

// ==================== 路由 ====================

// 获取磁盘列表（数据隔离：用户只看自己的，管理员看全部）
router.get('/disks', authMiddleware, async (req, res) => {
  try {
    var disks;
    if (req.user.role === 'admin') {
      // 管理员只看到分配给自己的磁盘（admin 用户有独立的 user_id）
      disks = await db.disks.getByUserId(req.user.id);
    } else {
      disks = await db.disks.getByUserId(req.user.id);
    }
    res.json(disks);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 获取购买选项（存储分组 + 启用的规格）
router.get('/disk-options', authMiddleware, async (req, res) => {
  try {
    var groups = await groupCache.get('all', function() { return db.storageGroups.getAll(); });
    var specs = await specCache.get('all', function() { return db.diskSpecs.getAll(); });
    // 普通用户只看启用的规格
    if (req.user.role !== 'admin') {
      specs = specs.filter(function(s) { return s.enabled; });
    }
    // 服务端严格按 sort_order 升序排序
    groups.sort(function(a, b) {
      var sa = parseInt(a.sort_order) || 0;
      var sb = parseInt(b.sort_order) || 0;
      if (sa !== sb) return sa - sb;
      return (parseInt(a.id) || 0) - (parseInt(b.id) || 0);
    });
    res.json({ groups: groups, specs: specs });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 购买数据盘（业务在 services/disk.js）
router.post('/disks/purchase', authMiddleware, async (req, res) => {
  // 限速：每用户 60 秒 2 次
  var limit = await checkConfiguredRateLimit('disk_purchase', 'disk_purchase:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试' });

  try {
    var specId = parseInt(req.body.spec_id);
    var capacityGb = parseInt(req.body.capacity_gb);
    var period = req.body.period;
    var periodCount = parseInt(req.body.period_count) || 1;
    var quantity = parseInt(req.body.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
      return res.status(400).json({ error: '购买数量必须为 1-10' });
    }
    var autoRenew = req.body.auto_renew ? 1 : 0;
    var diskName = (req.body.disk_name || '').toString().trim();
    // 长度限制：最多 30 字符（适配导入磁盘名称如 imported-108-scsi1）
    if (diskName.length > 30) {
      return res.status(400).json({ error: '硬盘名称不能超过30字符' });
    }
    // XSS 防护：剥离 HTML 标签（Vue 模板已自动转义，后端也做防御）
    diskName = diskName.replace(/<[^>]*>/g, '').substring(0, 30);

    // 参数校验
    if (!Number.isInteger(specId) || specId < 1) return res.status(400).json({ error: '无效的规格ID' });
    if (VALID_PERIODS.indexOf(period) === -1) return res.status(400).json({ error: '无效的计费周期' });
    if (!Number.isInteger(capacityGb) || capacityGb < 1) return res.status(400).json({ error: '无效的容量' });

    var result = await diskService.purchaseDisk({
      userId: req.user.id,
      specId: specId,
      capacityGb: capacityGb,
      period: period,
      periodCount: periodCount,
      quantity: quantity,
      autoRenew: autoRenew,
      diskName: diskName,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('[disk purchase] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 挂载磁盘到虚拟机（业务在 services/disk.js）
router.post('/disks/:id/bind', authMiddleware, checkDiskOwnership, checkVmOwnership, async (req, res) => {
  var limit = await checkConfiguredRateLimit('disk_bind', 'disk_bind:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var result = await diskService.bindDiskToVm({
      userId: req.user.id,
      disk: req.disk,
      vm: req.vm,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('[disk bind] 挂载失败:', e.stack || e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

// 卸载磁盘（业务在 services/disk.js）
router.post('/disks/:id/unbind', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkConfiguredRateLimit('disk_unbind', 'disk_unbind:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var result = await diskService.unbindDiskFromVm({
      userId: req.user.id,
      disk: req.disk,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('[disk unbind] 卸载失败:', e.stack || e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

// 扩容磁盘（业务在 services/disk.js）
router.post('/disks/:id/resize', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkConfiguredRateLimit('disk_resize', 'disk_resize:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var newSize = parseInt(req.body.capacity_gb);
    if (!Number.isInteger(newSize) || newSize <= 0) {
      return res.status(400).json({ error: '无效的容量' });
    }

    var result = await diskService.resizeDisk({
      userId: req.user.id,
      disk: req.disk,
      newSize: newSize,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('[disk resize] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 销毁磁盘（业务在 services/disk.js）
router.post('/disks/:id/destroy', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkConfiguredRateLimit('disk_destroy', 'disk_destroy:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var result = await diskService.destroyDisk({
      userId: req.user.id,
      disk: req.disk,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    console.error('[disk destroy] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 续费磁盘（业务在 services/disk.js）
router.post('/disks/:id/renew', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkConfiguredRateLimit('disk_renew', 'disk_renew:' + req.user.id);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var period = req.body.period;
    var periodCount = parseInt(req.body.period_count) || 1;

    if (VALID_PERIODS.indexOf(period) === -1) return res.status(400).json({ error: '无效的计费周期' });

    var result = await diskService.renewDisk({
      userId: req.user.id,
      disk: req.disk,
      period: period,
      periodCount: periodCount,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 切换自动续费开关（业务在 services/disk.js）
router.post('/disks/:id/auto-renew', authMiddleware, checkDiskOwnership, async (req, res) => {
  try {
    var result = await diskService.toggleAutoRenew({
      disk: req.disk,
      enabled: req.body.enabled ? 1 : 0,
      req: req
    });
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }
    res.json(result.data);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

module.exports = router;
