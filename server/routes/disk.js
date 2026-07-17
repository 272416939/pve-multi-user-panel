// server/routes/disk.js - 用户侧硬盘管理路由
// 安全设计：authMiddleware + checkDiskOwnership + checkVmOwnership + SQL 数据隔离
// 参照文档 7.3 节：数据隔离（WHERE user_id = ?）+ 操作校验（中间件归属校验）

var express = require('express');
var router = express.Router();
var { authMiddleware } = require('../middleware/auth');
var { checkRateLimit } = require('../middleware/rate-limiter');
var { withTransaction } = require('../utils/with-transaction');
var { deductBalance, generateOrderNo } = require('../utils/order-utils');
var { safeError } = require('../utils/safe-error');
var db = require('../api/db');
var diskUtils = require('../utils/disk-utils');

var VALID_PERIODS = ['month', 'quarter', 'year'];

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
      disks = await db.disks.getAll();
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
    var groups = await db.storageGroups.getAll();
    var specs = await db.diskSpecs.getAll();
    // 普通用户只看启用的规格
    if (req.user.role !== 'admin') {
      specs = specs.filter(function(s) { return s.enabled; });
    }
    res.json({ groups: groups, specs: specs });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 购买数据盘
router.post('/disks/purchase', authMiddleware, async (req, res) => {
  // 限速：每用户 60 秒 2 次
  var limit = await checkRateLimit('disk_purchase:' + req.user.id, 2, 60000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁，请稍后再试' });

  try {
    var specId = parseInt(req.body.spec_id);
    var capacityGb = parseInt(req.body.capacity_gb);
    var period = req.body.period;
    var periodCount = parseInt(req.body.period_count) || 1;
    var quantity = Math.min(parseInt(req.body.quantity) || 1, 10); // 最多 10 块
    var autoRenew = req.body.auto_renew ? 1 : 0;
    var diskName = (req.body.disk_name || '').toString().trim().substring(0, 100);

    // 参数校验
    if (!Number.isInteger(specId) || specId < 1) return res.status(400).json({ error: '无效的规格ID' });
    if (VALID_PERIODS.indexOf(period) === -1) return res.status(400).json({ error: '无效的计费周期' });
    if (!Number.isInteger(capacityGb) || capacityGb < 1) return res.status(400).json({ error: '无效的容量' });

    // 从数据库读取规格（价格不从客户端获取）
    var spec = await db.diskSpecs.getById(specId);
    if (!spec) return res.status(400).json({ error: '规格不存在' });
    if (!spec.enabled && req.user.role !== 'admin') return res.status(400).json({ error: '该规格已禁用' });

    // 容量范围校验
    if (capacityGb < spec.min_size_gb || capacityGb > spec.max_size_gb) {
      return res.status(400).json({ error: '容量超出规格范围（' + spec.min_size_gb + '-' + spec.max_size_gb + ' GiB）' });
    }

    // 计算总价（服务端计算，防篡改）
    var totalAmount = diskUtils.calcDiskAmount(spec, capacityGb, period, periodCount) * quantity;

    // 扣款金额校验
    if (totalAmount <= 0) return res.status(400).json({ error: '金额必须大于0' });

    // 余额检查
    var user = await db.users.getById(req.user.id);
    var balanceBefore = parseFloat(user.balance || '0');
    if (balanceBefore < totalAmount) {
      return res.status(400).json({ error: '余额不足，需要 ' + totalAmount + ' 元' });
    }

    // 存储池容量检查
    await diskUtils.checkStorageCapacity(spec.storage_pool, capacityGb * quantity);

// 计算到期时间
  var now = new Date();
  var months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
  var expireTime = new Date(now.getTime() + months * periodCount * 30 * 24 * 60 * 60 * 1000);

  // 生成订单号
  var orderNo = generateOrderNo('disk');
  var createdDiskIds = [];
  var createdDiskVolumeIds = [];
  var dbNow = db.now();

  // 事务一：扣款 + 创建订单 + 创建流水 + 写入台账（不调 PVE）
  await withTransaction(async (conn) => {
    // 原子扣款
    await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [totalAmount, req.user.id]);
    var balanceAfter = balanceBefore - totalAmount;

    // 创建订单（type='disk'）
    await conn.execute(
      'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [orderNo, req.user.id, 'disk', specId, 0, period, periodCount, totalAmount, 0, 0, capacityGb * quantity, '数据盘 x' + quantity, '', 'pending']
    );

    // 创建流水记录
    await conn.execute(
      'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [req.user.id, orderNo, dbNow, 'balance', 'disk_purchase', totalAmount, period, periodCount, balanceBefore, balanceAfter, 'disk', null, '', '', dbNow]
    );

    // 逐个写入磁盘台账（先不调 PVE）
    for (var i = 0; i < quantity; i++) {
      var volId = spec.storage_pool + ':pending-' + orderNo + '-' + i;
      await conn.execute(
        `INSERT INTO disks (volume_id, disk_name, spec_id, user_id, storage_group_id, storage_pool, disk_type, capacity_gb, status, price_per_gb, quarterly_discount, yearly_discount, auto_renew, expire_time, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [volId, diskName || ('数据盘-' + (i + 1)), specId, req.user.id, spec.storage_group_id, spec.storage_pool, spec.disk_type, capacityGb, 'free', spec.price_per_gb, spec.quarterly_discount || 0, spec.yearly_discount || 0, autoRenew, expireTime, spec.mbps_rd || null, spec.mbps_rd_max || null, spec.mbps_wr || null, spec.mbps_wr_max || null, spec.iops_rd || null, spec.iops_rd_max || null, spec.iops_wr || null, spec.iops_wr_max || null]
      );
      // 获取 insertId
      var [insertResult] = await conn.execute('SELECT LAST_INSERT_ID() as id');
      createdDiskIds.push(insertResult[0].id);
    }
  });

  // 事务外：逐个调用 PVE 创建磁盘
  var pveSuccess = true;
  var failedDiskIds = [];
  try {
    for (var i = 0; i < quantity; i++) {
      var volumeId = await diskUtils.createDisk(spec.storage_pool, capacityGb, req.user.id);
      createdDiskVolumeIds.push(volumeId);
      // 更新台账 volume_id 为真实值
      // db 是 db-mysql 的 module.exports，直接使用 execute
      var pool = require('../api/db').getPool();
      await pool.execute('UPDATE disks SET volume_id = ? WHERE id = ?', [volumeId, createdDiskIds[i]]);
    }
  } catch (pveError) {
    console.error('[disk purchase] PVE 创建失败:', pveError.message);
    pveSuccess = false;
    // 清理已创建的 PVE 磁盘
    for (var j = 0; j < createdDiskVolumeIds.length; j++) {
      try { await diskUtils.destroyDisk(createdDiskVolumeIds[j]); } catch (e) {}
    }
  }

  if (pveSuccess) {
    // 全部成功 => 更新订单状态
    await db.orders.updateStatus(orderNo, 'completed');
    res.json({ success: true, order_no: orderNo, amount: totalAmount, disks: quantity });
  } else {
    // 失败 => 退款 + 清理台账 + 订单标记 refunded
    try {
      // 退款
      var refundUser = await db.users.incrementBalance(req.user.id, totalAmount);
      var refundBalanceAfter = parseFloat(refundUser.balance || '0');
      // 删除失败磁盘的台账记录
      var pool2 = require('../api/db').getPool();
      for (var k = 0; k < createdDiskIds.length; k++) {
        try { await pool2.execute('DELETE FROM disks WHERE id = ?', [createdDiskIds[k]]); } catch (e) {}
      }
      // 退款流水
      var refundOrderNo = generateOrderNo('refund');
      await pool2.execute(
        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, refundOrderNo, dbNow, 'balance_refund', 'refund', totalAmount, period, periodCount, balanceBefore, refundBalanceAfter, 'disk', null, orderNo, '', dbNow]
      );
      // 更新订单状态
      await db.orders.updateStatus(orderNo, 'refunded');
    } catch (rollbackError) {
      console.error('[disk purchase] 退款处理失败:', rollbackError.message);
    }
    res.status(500).json({ error: '创建磁盘失败，已退款，请稍后重试' });
  }
  } catch (e) {
    console.error('[disk purchase] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 挂载磁盘到虚拟机
router.post('/disks/:id/bind', authMiddleware, checkDiskOwnership, checkVmOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_bind:' + req.user.id, 2, 10000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;
    var vm = req.vm;

    // 二次校验
    if (disk.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: '无权操作' });
    }

    // 文档 7.8：竞争条件防护 - SELECT ... FOR UPDATE 行锁 + 条件更新
    var bindResult = await withTransaction(async (conn) => {
      // 读取当前状态（带行锁）
      var [rows] = await conn.execute('SELECT * FROM disks WHERE id = ? FOR UPDATE', [disk.id]);
      var lockedDisk = rows[0];
      if (!lockedDisk) throw new Error('磁盘不存在');

      // 状态前置校验（持锁状态下校验，防止并发冲突）
      if (lockedDisk.status !== 'free' && lockedDisk.status !== 'expired') {
        throw new Error('磁盘当前状态不允许挂载（状态：' + lockedDisk.status + '），可能被其他操作占用');
      }

      // 读取系统盘总线类型，数据盘沿用同一总线
      var bus = await diskUtils.getSystemDiskBus(vm.vm_id);
      // 自动分配空闲设备号
      var dev = await diskUtils.getAvailableDevNumber(vm.vm_id, bus);

      // 读取规格的 QoS 参数（从数据库读取，非用户输入）
      var qosParams = {
        mbps_rd: lockedDisk.mbps_rd, mbps_rd_max: lockedDisk.mbps_rd_max,
        mbps_wr: lockedDisk.mbps_wr, mbps_wr_max: lockedDisk.mbps_wr_max,
        iops_rd: lockedDisk.iops_rd, iops_rd_max: lockedDisk.iops_rd_max,
        iops_wr: lockedDisk.iops_wr, iops_wr_max: lockedDisk.iops_wr_max
      };

      // 执行 PVE 挂载
      var result = await diskUtils.bindDisk(vm.vm_id, lockedDisk.volume_id, bus, dev, qosParams);

      // 条件更新（WHERE status = 原状态，双重保障防并发）
      await conn.execute(
        'UPDATE disks SET status = ?, bind_vmid = ?, bind_bus = ?, bind_dev = ?, updated_at = NOW() WHERE id = ? AND status = ?',
        ['bound', vm.vm_id, result.bus, result.dev, disk.id, lockedDisk.status]
      );

      return result;
    });

    res.json({ success: true, bus: bindResult.bus, dev: bindResult.dev });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 卸载磁盘
router.post('/disks/:id/unbind', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_unbind:' + req.user.id, 2, 10000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;

    if (disk.status !== 'bound') {
      return res.status(400).json({ error: '磁盘当前未绑定任何虚拟机' });
    }
    if (!disk.bind_vmid || !disk.bind_bus || !disk.bind_dev) {
      return res.status(400).json({ error: '磁盘绑定信息不完整' });
    }

    // 文档 7.8：竞争条件防护 - SELECT ... FOR UPDATE 行锁
    await withTransaction(async (conn) => {
      var [rows] = await conn.execute('SELECT * FROM disks WHERE id = ? FOR UPDATE', [disk.id]);
      var lockedDisk = rows[0];
      if (!lockedDisk) throw new Error('磁盘不存在');
      if (lockedDisk.status !== 'bound') {
        throw new Error('磁盘状态已变更，可能被其他操作处理中');
      }

      // 执行 PVE 卸载
      await diskUtils.unbindDisk(lockedDisk.bind_vmid, lockedDisk.bind_bus, lockedDisk.bind_dev);

      // 条件更新（WHERE status = 'bound'，防止并发）
      await conn.execute(
        'UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, updated_at = NOW() WHERE id = ? AND status = ?',
        ['free', disk.id, 'bound']
      );
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 扩容磁盘
router.post('/disks/:id/resize', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_resize:' + req.user.id, 1, 60000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;
    var newSize = parseInt(req.body.capacity_gb);

    if (!Number.isInteger(newSize) || newSize <= 0) {
      return res.status(400).json({ error: '无效的容量' });
    }
    if (newSize <= disk.capacity_gb) {
      return res.status(400).json({ error: '新容量必须大于当前容量（' + disk.capacity_gb + ' GiB）' });
    }

    // 校验规格最大容量
    if (disk.spec_id) {
      var spec = await db.diskSpecs.getById(disk.spec_id);
      if (spec && newSize > spec.max_size_gb) {
        return res.status(400).json({ error: '新容量超出规格上限（' + spec.max_size_gb + ' GiB）' });
      }
    }

    // 执行 PVE 扩容
    await diskUtils.resizeDisk(disk.volume_id, newSize);

    // 更新台账容量
    await db.disks.updateCapacity(disk.id, newSize);

    res.json({ success: true, new_capacity: newSize });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 销毁磁盘
router.post('/disks/:id/destroy', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_destroy:' + req.user.id, 2, 10000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;

    // 已绑定的磁盘必须先卸载
    if (disk.status === 'bound') {
      return res.status(400).json({ error: '请先卸载磁盘再销毁' });
    }
    if (disk.status === 'destroyed') {
      return res.status(400).json({ error: '磁盘已销毁' });
    }

    // 文档 7.8：竞争条件防护 - SELECT ... FOR UPDATE 行锁
    await withTransaction(async (conn) => {
      var [rows] = await conn.execute('SELECT * FROM disks WHERE id = ? FOR UPDATE', [disk.id]);
      var lockedDisk = rows[0];
      if (!lockedDisk) throw new Error('磁盘不存在');
      if (lockedDisk.status === 'bound') throw new Error('请先卸载磁盘再销毁');
      if (lockedDisk.status === 'destroyed') throw new Error('磁盘已销毁');

      // 执行 PVE 销毁
      await diskUtils.destroyDisk(lockedDisk.volume_id);

      // 条件更新（防止并发）
      await conn.execute(
        'UPDATE disks SET status = ?, updated_at = NOW() WHERE id = ? AND status != ?',
        ['destroyed', disk.id, 'destroyed']
      );
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 续费磁盘
router.post('/disks/:id/renew', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_renew:' + req.user.id, 2, 30000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;
    var period = req.body.period;
    var periodCount = parseInt(req.body.period_count) || 1;

    if (VALID_PERIODS.indexOf(period) === -1) return res.status(400).json({ error: '无效的计费周期' });
    if (disk.status === 'destroyed') return res.status(400).json({ error: '磁盘已销毁，无法续费' });

    // 使用磁盘购买时的价格快照计算续费金额
    var amount = diskUtils.calcRenewAmount(disk, period, periodCount);

    // 扣款金额校验
    if (amount <= 0) return res.status(400).json({ error: '金额必须大于0' });

    // 余额检查
    var user = await db.users.getById(req.user.id);
    var balanceBefore = parseFloat(user.balance || '0');
    if (balanceBefore < amount) {
      return res.status(400).json({ error: '余额不足，需要 ' + amount + ' 元' });
    }

    // 计算续费后到期时间
    var months = period === 'year' ? 12 : period === 'quarter' ? 3 : 1;
    var currentExpire = disk.expire_time ? new Date(disk.expire_time) : new Date();
    var baseTime = currentExpire > new Date() ? currentExpire : new Date();
    var newExpire = new Date(baseTime.getTime() + months * periodCount * 30 * 24 * 60 * 60 * 1000);

    var orderNo = generateOrderNo('disk');
    var dbNow = db.now();

    await withTransaction(async (conn) => {
      // 原子扣款
      await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [amount, req.user.id]);
      var balanceAfter = balanceBefore - amount;
      // 流水
      await conn.execute(
        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, orderNo, dbNow, 'balance', 'disk_renewal', amount, period, periodCount, balanceBefore, balanceAfter, 'disk', disk.id, '', '', dbNow]
      );
      // 更新到期时间 + 恢复状态
      var newStatus = (disk.status === 'grace' || disk.status === 'expired') ? 'free' : disk.status;
      if (disk.status === 'bound') newStatus = 'bound';
      await conn.execute('UPDATE disks SET expire_time = ?, status = ?, updated_at = NOW() WHERE id = ?', [newExpire, newStatus, disk.id]);
    });

    res.json({ success: true, amount: amount, new_expire: newExpire });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

module.exports = router;
