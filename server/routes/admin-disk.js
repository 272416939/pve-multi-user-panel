// server/routes/admin-disk.js - 管理员硬盘设置路由
// 安全设计：authMiddleware + adminMiddleware + 参数校验 + Redis 缓存

var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var { safeError } = require('../utils/safe-error');
var cacheStore = require('../utils/cache-store');
var db = require('../api/db');
var pveApi = require('../api/pve-api');
var { importExistingDisks } = require('../services/disk-expiry-check');

// 规格列表缓存（5 分钟 TTL）
var specCache = cacheStore.create('disk_specs', 300);
var groupCache = cacheStore.create('storage_groups', 300);

// 清除缓存辅助函数
function clearDiskCache() {
  specCache.del('all');
  groupCache.del('all');
}

// ==================== PVE 存储列表（供规格弹窗存储位置下拉） ====================

// 获取 PVE 所有存储及剩余容量（文档 3.3：下拉展示 PVE 所有存储及剩余容量）
router.get('/pve-storages', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var storages = await pveApi.getAllStorages();
    // 格式化返回：{ storage, type, total, used, avail, total_gb, avail_gb }
    var result = (storages || []).map(function(s) {
      var total = parseInt(s.total) || 0;
      var used = parseInt(s.used) || 0;
      var avail = total - used;
      // PVE 返回字节，转 GiB
      var totalGb = Math.floor(total / (1024 * 1024 * 1024));
      var availGb = Math.floor(avail / (1024 * 1024 * 1024));
      var usedPct = total > 0 ? Math.round((used / total) * 100) : 0;
      return {
        storage: s.storage,
        type: s.type || '',
        total_gb: totalGb,
        avail_gb: availGb,
        used_pct: usedPct,
        content: s.content || ''
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ==================== 存储分组管理 ====================

// 获取所有存储分组
router.get('/storage-groups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var groups = await groupCache.get('all', function() { return db.storageGroups.getAll(); });
    res.json(groups);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 创建存储分组
router.post('/storage-groups', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var name = (req.body.name || '').toString().trim();
    var sortOrder = parseInt(req.body.sort_order) || 0;

    if (!name) return res.status(400).json({ error: '请输入分组名称' });
    if (name.length > 50) return res.status(400).json({ error: '分组名称不能超过 50 字符' });

    var group = await db.storageGroups.create({ name: name, sort_order: sortOrder });
    clearDiskCache();
    res.json(group);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '分组名称已存在' });
    }
    res.status(500).json({ error: safeError(e) });
  }
});

// 编辑存储分组
router.put('/storage-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    var name = (req.body.name || '').toString().trim();
    var sortOrder = parseInt(req.body.sort_order) || 0;

    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '无效的ID' });
    if (!name) return res.status(400).json({ error: '请输入分组名称' });
    if (name.length > 50) return res.status(400).json({ error: '分组名称不能超过 50 字符' });

    var group = await db.storageGroups.update(id, { name: name, sort_order: sortOrder });
    clearDiskCache();
    res.json(group);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: '分组名称已存在' });
    }
    res.status(500).json({ error: safeError(e) });
  }
});

// 删除存储分组
router.delete('/storage-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '无效的ID' });

    // 检查是否有在用磁盘
    var countResult = await db.storageGroups.countDisksByGroup(id);
    if (countResult && countResult.cnt > 0) {
      return res.status(400).json({ error: '该分组下仍有 ' + countResult.cnt + ' 个在用磁盘，请先迁移' });
    }

    await db.storageGroups.delete(id);
    clearDiskCache();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ==================== 硬盘规格管理 ====================

// 获取所有规格
router.get('/disk-specs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var specs = await specCache.get('all', function() { return db.diskSpecs.getAll(); });
    res.json(specs);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 创建规格
router.post('/disk-specs', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var data = req.body;
    // 参数校验
    if (!data.name || !data.name.trim()) return res.status(400).json({ error: '请输入规格名称' });
    if (data.name.length > 100) return res.status(400).json({ error: '规格名称不能超过 100 字符' });
    if (['NVME', 'SATA', 'HDD', 'U2'].indexOf(data.disk_type) === -1) return res.status(400).json({ error: '无效的硬盘类型' });
    if (!data.storage_group_id) return res.status(400).json({ error: '请选择存储分组' });
    if (!data.storage_pool || !data.storage_pool.trim()) return res.status(400).json({ error: '请选择存储位置' });
    if (!data.min_size_gb || data.min_size_gb < 1) return res.status(400).json({ error: '最低容量必须大于 0' });
    if (!data.max_size_gb || data.max_size_gb < data.min_size_gb) return res.status(400).json({ error: '最大容量必须大于等于最低容量' });
    if (data.price_per_gb === undefined || data.price_per_gb === null || data.price_per_gb < 0) return res.status(400).json({ error: '请输入有效的单价' });

    var spec = await db.diskSpecs.create({
      name: data.name.trim(),
      disk_type: data.disk_type,
      storage_group_id: parseInt(data.storage_group_id),
      enabled: data.enabled ? 1 : 0,
      min_size_gb: parseInt(data.min_size_gb),
      max_size_gb: parseInt(data.max_size_gb),
      price_per_gb: parseFloat(data.price_per_gb),
      quarterly_discount: parseInt(data.quarterly_discount) || 0,
      yearly_discount: parseInt(data.yearly_discount) || 0,
      mbps_rd: data.mbps_rd || null, mbps_rd_max: data.mbps_rd_max || null,
      mbps_wr: data.mbps_wr || null, mbps_wr_max: data.mbps_wr_max || null,
      iops_rd: data.iops_rd || null, iops_rd_max: data.iops_rd_max || null,
      iops_wr: data.iops_wr || null, iops_wr_max: data.iops_wr_max || null,
      storage_pool: data.storage_pool.trim(),
      description: data.description || null
    });
    clearDiskCache();
    res.json(spec);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 编辑规格
router.put('/disk-specs/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    var data = req.body;
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '无效的ID' });
    if (!data.name || !data.name.trim()) return res.status(400).json({ error: '请输入规格名称' });
    if (['NVME', 'SATA', 'HDD', 'U2'].indexOf(data.disk_type) === -1) return res.status(400).json({ error: '无效的硬盘类型' });
    if (!data.storage_group_id) return res.status(400).json({ error: '请选择存储分组' });
    if (!data.storage_pool || !data.storage_pool.trim()) return res.status(400).json({ error: '请选择存储位置' });

    var spec = await db.diskSpecs.update(id, {
      name: data.name.trim(),
      disk_type: data.disk_type,
      storage_group_id: parseInt(data.storage_group_id),
      enabled: data.enabled ? 1 : 0,
      min_size_gb: parseInt(data.min_size_gb),
      max_size_gb: parseInt(data.max_size_gb),
      price_per_gb: parseFloat(data.price_per_gb),
      quarterly_discount: parseInt(data.quarterly_discount) || 0,
      yearly_discount: parseInt(data.yearly_discount) || 0,
      mbps_rd: data.mbps_rd || null, mbps_rd_max: data.mbps_rd_max || null,
      mbps_wr: data.mbps_wr || null, mbps_wr_max: data.mbps_wr_max || null,
      iops_rd: data.iops_rd || null, iops_rd_max: data.iops_rd_max || null,
      iops_wr: data.iops_wr || null, iops_wr_max: data.iops_wr_max || null,
      storage_pool: data.storage_pool.trim(),
      description: data.description || null
    });
    clearDiskCache();
    res.json(spec);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 删除规格
router.delete('/disk-specs/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: '无效的ID' });

    // 检查是否有已购磁盘
    var countResult = await db.diskSpecs.countDisksBySpec(id);
    if (countResult && countResult.cnt > 0) {
      return res.status(400).json({ error: '该规格下有 ' + countResult.cnt + ' 个已购磁盘，无法删除' });
    }

    await db.diskSpecs.delete(id);
    clearDiskCache();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ==================== 生命周期配置 ====================

// 获取生命周期配置
router.get('/lifecycle-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var config = await db.diskLifecycleConfig.get();
    if (!config) {
      // 初始化默认配置
      config = await db.diskLifecycleConfig.upsert({});
    }
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 更新生命周期配置
router.put('/lifecycle-config', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var data = {
      warn_days: parseInt(req.body.warn_days) || 7,
      warn_frequency: ['daily', 'twice_daily'].indexOf(req.body.warn_frequency) !== -1 ? req.body.warn_frequency : 'daily',
      grace_days: parseInt(req.body.grace_days) || 3,
      grace_frequency: ['daily', 'twice_daily'].indexOf(req.body.grace_frequency) !== -1 ? req.body.grace_frequency : 'twice_daily',
      shutdown_timeout: parseInt(req.body.shutdown_timeout) || 300,
      retention_days: parseInt(req.body.retention_days) || 15,
      check_time: /^\d{2}:\d{2}$/.test(req.body.check_time) ? req.body.check_time : '02:00',
      auto_renew_days: parseInt(req.body.auto_renew_days) || 1
    };

    var config = await db.diskLifecycleConfig.upsert(data);
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// ==================== 存量虚拟机数据盘导入（文档 4.5） ====================

// 导入存量虚拟机数据盘（幂等，可重复执行）
router.post('/disk-import', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var report = await importExistingDisks();
    res.json(report);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

module.exports = router;
