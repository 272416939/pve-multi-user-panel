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

// 文件系统类存储类型（需选择磁盘格式扩展名）
var FILE_SYSTEM_STORAGE_TYPES = ['dir', 'btrfs', 'nfs', 'cephfs'];
// 各存储类型支持的磁盘格式
var DISK_FORMATS_BY_STORAGE_TYPE = {
  dir: ['raw', 'qcow2', 'vmdk'],
  btrfs: ['raw', 'qcow2', 'subvol'],
  nfs: ['raw', 'qcow2', 'vmdk'],
  cephfs: ['raw', 'qcow2']
};

// 校验并规范化 disk_format：根据所选 storage_pool 对应的 PVE 存储类型联动校验
// 返回 { ok: true, diskFormat: 'qcow2'|null } 或 { ok: false, error: '...' }
async function validateDiskFormat(storagePool, diskFormat) {
  var pveStorageType = '';
  try {
    var storages = await pveApi.getAllStorages();
    var matched = (storages || []).find(function(s) { return s.storage === storagePool; });
    pveStorageType = matched ? (matched.type || '') : '';
  } catch (e) {
    // PVE 查询失败时保守放行（不阻断主流程，由 pvesm alloc 自身兜底）
    return { ok: true, diskFormat: diskFormat || null };
  }
  if (FILE_SYSTEM_STORAGE_TYPES.indexOf(pveStorageType) !== -1) {
    var allowed = DISK_FORMATS_BY_STORAGE_TYPE[pveStorageType] || [];
    if (!diskFormat || allowed.indexOf(diskFormat) === -1) {
      return { ok: false, error: '该存储类型（' + pveStorageType + '）必须选择磁盘格式，支持：' + allowed.join('/') };
    }
    return { ok: true, diskFormat: diskFormat };
  }
  // 块设备存储类型不存储扩展名
  return { ok: true, diskFormat: null };
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

// 批量更新存储分组排序（必须在 :id 路由之前注册，避免 sort 被 :id 匹配）
router.put('/storage-groups/sort', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var order = req.body.order;
    if (!Array.isArray(order)) return res.status(400).json({ error: '无效的排序数据' });
    
    var ids = [];
    for (var i = 0; i < order.length; i++) {
      var item = order[i];
      var val = (item && item.id) ? item.id : item;
      var n = parseInt(val);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ error: '无效的ID', value: val });
      }
      ids.push(n);
    }
    
    for (var i = 0; i < ids.length; i++) {
      await db.storageGroups.update(ids[i], { sort_order: i });
    }
    clearDiskCache();
    res.json({ success: true });
  } catch (e) {
    console.error('[storage-groups] sort error:', e.message);
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

// 批量更新存储分组排序
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
    // 价格精度统一 2 位小数，超过 2 位时按 2 位舍入（避免 DECIMAL(10,2) 静默截断）
    var pricePerGbVal = Math.round(parseFloat(data.price_per_gb) * 100) / 100;

    // 校验磁盘格式与存储类型联动
    var fmtResult = await validateDiskFormat(data.storage_pool.trim(), data.disk_format);
    if (!fmtResult.ok) return res.status(400).json({ error: fmtResult.error });

    var spec = await db.diskSpecs.create({
      name: data.name.trim(),
      disk_type: data.disk_type,
      storage_group_id: parseInt(data.storage_group_id),
      enabled: data.enabled ? 1 : 0,
      min_size_gb: parseInt(data.min_size_gb),
      max_size_gb: parseInt(data.max_size_gb),
      price_per_gb: pricePerGbVal,
      quarterly_discount: parseInt(data.quarterly_discount) || 0,
      yearly_discount: parseInt(data.yearly_discount) || 0,
      mbps_rd: data.mbps_rd || null, mbps_rd_max: data.mbps_rd_max || null,
      mbps_wr: data.mbps_wr || null, mbps_wr_max: data.mbps_wr_max || null,
      iops_rd: data.iops_rd || null, iops_rd_max: data.iops_rd_max || null,
      iops_wr: data.iops_wr || null, iops_wr_max: data.iops_wr_max || null,
      storage_pool: data.storage_pool.trim(),
      disk_format: fmtResult.diskFormat,
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
    var pricePerGbVal2 = Math.round(parseFloat(data.price_per_gb) * 100) / 100;

    // 校验磁盘格式与存储类型联动
    var fmtResult2 = await validateDiskFormat(data.storage_pool.trim(), data.disk_format);
    if (!fmtResult2.ok) return res.status(400).json({ error: fmtResult2.error });

    var spec = await db.diskSpecs.update(id, {
      name: data.name.trim(),
      disk_type: data.disk_type,
      storage_group_id: parseInt(data.storage_group_id),
      enabled: data.enabled ? 1 : 0,
      min_size_gb: parseInt(data.min_size_gb),
      max_size_gb: parseInt(data.max_size_gb),
      price_per_gb: pricePerGbVal2,
      quarterly_discount: parseInt(data.quarterly_discount) || 0,
      yearly_discount: parseInt(data.yearly_discount) || 0,
      mbps_rd: data.mbps_rd || null, mbps_rd_max: data.mbps_rd_max || null,
      mbps_wr: data.mbps_wr || null, mbps_wr_max: data.mbps_wr_max || null,
      iops_rd: data.iops_rd || null, iops_rd_max: data.iops_rd_max || null,
      iops_wr: data.iops_wr || null, iops_wr_max: data.iops_wr_max || null,
      storage_pool: data.storage_pool.trim(),
      disk_format: fmtResult2.diskFormat,
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

// ==================== 数据盘管理（管理员） ====================

// 获取所有用户的数据盘
router.get('/admin/disks', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var disks = await db.disks.getAll();
    res.json({ rows: disks });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 编辑磁盘（名称、存储分组、规格）
router.put('/admin/disks/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var id = parseInt(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ error: '无效的磁盘ID' });
    }

    var diskName = (req.body.disk_name || '').toString().trim();
    var storageGroupId = parseInt(req.body.storage_group_id);
    var specId = req.body.spec_id !== undefined && req.body.spec_id !== null ? parseInt(req.body.spec_id) : null;

    // 名称长度限制：30 字符
    if (diskName.length > 30) {
      return res.status(400).json({ error: '硬盘名称不能超过30字符' });
    }
    // XSS 防护
    diskName = diskName.replace(/<[^>]*>/g, '').substring(0, 30);

    // 验证磁盘存在
    var disk = await db.disks.getById(id);
    if (!disk) return res.status(404).json({ error: '磁盘不存在' });

    // 验证存储分组存在
    var group = await db.storageGroups.getById(storageGroupId);
    if (!group) return res.status(400).json({ error: '存储分组不存在' });

    // 验证规格存在（如果指定）
    if (specId !== null) {
      var spec = await db.diskSpecs.getById(specId);
      if (!spec) return res.status(400).json({ error: '规格不存在' });
    }

    // 更新磁盘
    await db.disks.update(id, {
      disk_name: diskName,
      storage_group_id: storageGroupId,
      spec_id: specId
    });

    // 重新获取完整信息
    var updated = await db.disks.getById(id);
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 批量修改磁盘存储分组
router.put('/admin/disks/batch/storage-group', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    var diskIds = req.body.disk_ids;
    var storageGroupId = parseInt(req.body.storage_group_id);

    if (!Array.isArray(diskIds) || diskIds.length === 0) {
      return res.status(400).json({ error: '请选择要修改的磁盘' });
    }
    if (!Number.isInteger(storageGroupId) || storageGroupId < 1) {
      return res.status(400).json({ error: '请选择有效的存储分组' });
    }

    // 验证存储分组存在
    var group = await db.storageGroups.getById(storageGroupId);
    if (!group) return res.status(400).json({ error: '存储分组不存在' });

    // 批量更新
    var updated = 0;
    for (var i = 0; i < diskIds.length; i++) {
      var id = parseInt(diskIds[i]);
      if (!Number.isInteger(id) || id < 1) continue;
      try {
        await db.disks.update(id, { storage_group_id: storageGroupId });
        updated++;
      } catch (e) {
        console.error('[batch] 更新磁盘 ' + id + ' 失败:', e.message);
      }
    }

    res.json({ success: true, updated: updated, total: diskIds.length });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 管理员销毁磁盘（不受15天限制，3天内全额，超过3天按剩余比例退款）
router.post('/admin/disks/:id/destroy', authMiddleware, adminMiddleware, async (req, res) => {
  var diskId = parseInt(req.params.id);
  if (!Number.isInteger(diskId) || diskId < 1) {
    return res.status(400).json({ error: '无效的磁盘ID' });
  }

  try {
    var disk = await db.disks.getById(diskId);
    if (!disk) return res.status(404).json({ error: '磁盘不存在' });

    // 已销毁的记录：硬删除
    if (disk.status === 'destroyed') {
      await db.disks.hardDelete(disk.id);
      return res.json({ success: true });
    }

    // 已挂载的磁盘必须先卸载
    if (disk.status === 'bound') {
      return res.status(400).json({ error: '请先卸载磁盘再销毁' });
    }

    var refundAmount = 0;
    var refundDesc = '';

    // 查询该磁盘所有已完成的付费订单
    var paidOrders = [];
    if (disk.expire_time && disk.status !== 'expired' && disk.status !== 'grace') {
      try {
        var orderResult = await db.orders.getAll({
          type: 'disk',
          resource_id: String(disk.id),
          status: 'completed',
          limit: 200
        });
        paidOrders = orderResult.rows || orderResult.data || [];
      } catch (e) {
        console.error('[admin disk destroy] 查询订单失败:', e.message);
      }

      var now = new Date();
      var expireDate = new Date(disk.expire_time);
      var { withTransaction } = require('../utils/with-transaction');
      var { generateOrderNo } = require('../utils/order-utils');

      // 按订单分单计算退款（管理员不受15天限制）
      for (var oi = 0; oi < paidOrders.length; oi++) {
        var origOrder = paidOrders[oi];
        var orderPaid = parseFloat(origOrder.amount || 0);
        if (orderPaid <= 0) continue;
        var orderCreateTime = new Date(origOrder.created_at);
        var orderDays = Math.floor((now - orderCreateTime) / (1000 * 60 * 60 * 24));

        var orderRefund = 0;
        if (orderDays <= 3) {
          // 3天内全额退款
          orderRefund = orderPaid;
        } else {
          // 超过3天：按剩余时间比例退款（不受15天限制）
          if (expireDate > orderCreateTime) {
            var totalMs = expireDate - orderCreateTime;
            var remainingMs = expireDate - now;
            if (remainingMs > 0) {
              var factor = remainingMs / totalMs;
              orderRefund = parseFloat((orderPaid * factor).toFixed(2));
            }
          }
        }
        refundAmount += orderRefund;
      }
      refundAmount = parseFloat(refundAmount.toFixed(2));

      var diskCreateDate = disk.create_time ? Math.floor((now - new Date(disk.create_time)) / (1000 * 60 * 60 * 24)) : 0;
      if (diskCreateDate <= 3) {
        refundDesc = '管理员操作：全额退款（开通 ' + diskCreateDate + ' 天）';
      } else {
        refundDesc = '管理员操作：按剩余时间比例退款（开通 ' + diskCreateDate + ' 天）';
      }
    }

    var user = await db.users.getById(disk.user_id);
    var diskUtils = require('../utils/disk-utils');

    // 事务：PVE销毁 + 退款 + 订单状态更新
    var { withTransaction } = require('../utils/with-transaction');
    var { generateOrderNo } = require('../utils/order-utils');

    await withTransaction(async (conn) => {
      var [rows] = await conn.execute('SELECT * FROM disks WHERE id = ? FOR UPDATE', [disk.id]);
      var lockedDisk = rows[0];
      if (!lockedDisk) throw new Error('磁盘不存在');
      if (lockedDisk.status === 'bound') throw new Error('请先卸载磁盘再销毁');
      if (lockedDisk.status === 'destroyed') throw new Error('磁盘已销毁');

      // 执行 PVE 销毁
      try {
        await diskUtils.destroyDisk(lockedDisk.volume_id);
      } catch (pveErr) {
        // PVE 卷可能已不存在，继续执行
        console.error('[admin disk destroy] PVE 销毁失败:', pveErr.message);
      }

      // 按订单分单退款
      if (refundAmount > 0 && paidOrders.length > 0) {
        await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [refundAmount, disk.user_id]);
        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + refundAmount;
        var now2 = new Date();
        var dbNow = db.now();

        for (var ri = 0; ri < paidOrders.length; ri++) {
          var origOrder2 = paidOrders[ri];
          var orderPaid2 = parseFloat(origOrder2.amount || 0);
          if (orderPaid2 <= 0) continue;
          var orderCreateTime2 = new Date(origOrder2.created_at);
          var orderDays2 = Math.floor((now2 - orderCreateTime2) / (1000 * 60 * 60 * 24));

          var orderRefund2 = 0;
          if (orderDays2 <= 3) {
            orderRefund2 = orderPaid2;
          } else {
            var expireDate2 = new Date(disk.expire_time);
            if (expireDate2 > orderCreateTime2) {
              var totalMs2 = expireDate2 - orderCreateTime2;
              var remainingMs2 = expireDate2 - now2;
              if (remainingMs2 > 0) {
                var factor2 = remainingMs2 / totalMs2;
                orderRefund2 = parseFloat((orderPaid2 * factor2).toFixed(2));
              }
            }
          }
          if (orderRefund2 > 0) {
            var refundOrderNo = generateOrderNo('refund');
            await conn.execute(
              'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [disk.user_id, refundOrderNo, dbNow, 'balance_refund', 'refund', orderRefund2, null, null, balanceBefore, balanceAfter, 'disk', disk.id, origOrder2.order_no, '', dbNow]
            );
            await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['refunded', origOrder2.order_no]);
          } else {
            await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['destroyed', origOrder2.order_no]);
          }
        }
      } else {
        // 无退款，订单标记已销毁
        for (var ni = 0; ni < paidOrders.length; ni++) {
          await conn.execute('UPDATE orders SET status = ? WHERE order_no = ? AND status = ?', ['destroyed', paidOrders[ni].order_no, 'completed']);
        }
      }

      // 更新磁盘状态
      await conn.execute(
        'UPDATE disks SET status = ?, updated_at = NOW() WHERE id = ? AND status != ?',
        ['destroyed', disk.id, 'destroyed']
      );
    });

    res.json({ success: true, refund: refundAmount > 0, refund_amount: refundAmount, refund_desc: refundDesc });
  } catch (e) {
    console.error('[admin disk destroy] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

module.exports = router;
