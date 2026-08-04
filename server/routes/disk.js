// server/routes/disk.js - 用户侧硬盘管理路由
// 安全设计：authMiddleware + checkDiskOwnership + checkVmOwnership + SQL 数据隔离
// 参照文档 7.3 节：数据隔离（WHERE user_id = ?）+ 操作校验（中间件归属校验）

var express = require('express');
var crypto = require('crypto');
var router = express.Router();
var { authMiddleware } = require('../middleware/auth');
var { checkRateLimit } = require('../middleware/rate-limiter');
var { withTransaction } = require('../utils/with-transaction');
var { createEmailTemplate, sendEmail, getSiteName, shouldSendEmail } = require('../utils/email');
var { generateOrderNo } = require('../utils/order-utils');
var { safeError } = require('../utils/safe-error');
var db = require('../api/db');
var diskUtils = require('../utils/disk-utils');
var { takeDiskSnapshot } = require('../services/disk-audit');
var cacheStore = require('../utils/cache-store');
// 单一来源：周期常量统一走 constants（规范第七节）
var { VALID_PERIODS, getPeriodMonths, getPeriodUnit } = require('../constants');

// PERF-07: 复用管理端磁盘规格/存储分组缓存（同一命名空间，管理端写操作 clearDiskCache 同时失效）
var specCache = cacheStore.create('disk_specs', 300);
var groupCache = cacheStore.create('storage_groups', 300);

// 统一审计埋点（utils/audit-log.js 导出，route 内不复刻包装函数）
var { auditAction } = require('../utils/audit-log');


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

    // 从数据库读取规格（价格不从客户端获取）
    var spec = await db.diskSpecs.getById(specId);
    if (!spec) return res.status(400).json({ error: '规格不存在' });
    if (!spec.enabled && req.user.role !== 'admin') return res.status(400).json({ error: '该规格已禁用' });

    // 容量范围校验
    if (capacityGb < spec.min_size_gb || capacityGb > spec.max_size_gb) {
      return res.status(400).json({ error: '容量超出规格范围（' + spec.min_size_gb + '-' + spec.max_size_gb + ' GiB）' });
    }

	// 计算单盘价格和总价
	  var singleAmount = diskUtils.calcDiskAmount(spec, capacityGb, period, periodCount);
	  var totalAmount = singleAmount * quantity;

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
	  var months = getPeriodMonths(period);
	  var expireTime = new Date(now.getTime() + months * periodCount * 30 * 24 * 60 * 60 * 1000);

	  var createdDiskIds = [];
	  var createdDiskVolumeIds = [];
	  var createdOrderNos = [];
	  var dbNow = db.now();

	  // 为每块磁盘生成名称（循环外先算好所有磁盘名称）
	  var diskNames = [];
	  for (var ni = 0; ni < quantity; ni++) {
	    diskNames.push(diskName || ('数据盘-' + crypto.randomBytes(2).toString('hex')));
	  }

	  // 事务一：扣款 + 创建订单 + 创建流水 + 写入台账（不调 PVE）
	  await withTransaction(async (conn) => {
	    // 原子扣款（一次总扣）
	    await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [totalAmount, req.user.id]);
	    var balanceAfter = balanceBefore - totalAmount;

	    // 逐块磁盘：创建独立订单 + 流水 + 台账
	    for (var i = 0; i < quantity; i++) {
	      var orderNo = generateOrderNo('disk');
	      createdOrderNos.push(orderNo);
	      var thisDiskName = diskNames[i];
	      var volId = spec.storage_pool + ':pending-' + orderNo;

	      // 写入磁盘台账
	      await conn.execute(
	        `INSERT INTO disks (volume_id, disk_name, spec_id, user_id, storage_group_id, storage_pool, disk_type, disk_format, capacity_gb, status, price_per_gb, quarterly_discount, yearly_discount, auto_renew, expire_time, mbps_rd, mbps_rd_max, mbps_wr, mbps_wr_max, iops_rd, iops_rd_max, iops_wr, iops_wr_max)
	         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
	        [volId, thisDiskName, specId, req.user.id, spec.storage_group_id, spec.storage_pool, spec.disk_type, spec.disk_format || null, capacityGb, 'free', spec.price_per_gb, spec.quarterly_discount || 0, spec.yearly_discount || 0, autoRenew, expireTime, spec.mbps_rd || null, spec.mbps_rd_max || null, spec.mbps_wr || null, spec.mbps_wr_max || null, spec.iops_rd || null, spec.iops_rd_max || null, spec.iops_wr || null, spec.iops_wr_max || null]
	      );
	      var [insertResult] = await conn.execute('SELECT LAST_INSERT_ID() as id');
	      var newDiskId = insertResult[0].id;
	      createdDiskIds.push(newDiskId);

	      // 创建独立订单（resource_name 含磁盘名称，便于对账）
	      await conn.execute(
	        'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
	        [orderNo, req.user.id, 'disk', specId, 0, period, periodCount, singleAmount, 0, 0, capacityGb, '新购 ' + capacityGb + 'GiB [' + thisDiskName + ']', String(newDiskId), 'pending']
	      );

	      // 创建独立流水
	      await conn.execute(
	        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
	        [req.user.id, orderNo, dbNow, 'balance', 'disk_purchase', singleAmount, period, periodCount, balanceBefore, balanceAfter, 'disk', String(newDiskId), '', '', dbNow]
	      );
	    }
	  });

  // 事务外：逐个调用 PVE 创建磁盘
  var pveSuccess = true;
  var failedDiskIds = [];
  try {
    // 读取临时 VMID 配置
    var tempVmid = '9999';
    try {
      var cfgVal = await db.config.get('disk:temp_vmid');
      if (cfgVal) tempVmid = cfgVal;
    } catch (e) {}

    for (var i = 0; i < quantity; i++) {
      var volumeId = await diskUtils.createDisk(spec.storage_pool, capacityGb, req.user.id, tempVmid, spec.disk_format);
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
	    // 全部成功 => 更新所有订单为 completed
	    for (var oi = 0; oi < createdOrderNos.length; oi++) {
	      await db.orders.updateStatus(createdOrderNos[oi], 'completed');
	    }
	    var firstOrderNo = createdOrderNos[0] || '';
	    // 邮件通知：硬盘购买成功
	    try {
	      var purchaseUser = await db.users.getById(req.user.id);
	      if (purchaseUser && purchaseUser.email && purchaseUser.emailVerified && purchaseUser.email.includes('@')) {
	        var siteName = await getSiteName();
	        var diskNamesStr = diskNames.join('、');
	        var periodLabel = periodCount + getPeriodUnit(period);
	        var newBalance = (balanceBefore - totalAmount).toFixed(2);
	        var emailHtml = createEmailTemplate('硬盘购买成功',
	          '<p>您的数据盘已购买成功！</p>' +
	          '<div class="info-box">' +
	          '<p style="margin-bottom: 4px;">💾 硬盘名称：<strong>' + diskNamesStr + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">📐 容量：<strong>' + capacityGb + ' GiB × ' + quantity + ' 块</strong></p>' +
	          '<p style="margin-bottom: 4px;">📅 计费周期：<strong>' + periodLabel + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">💸 实付金额：<strong>¥' + totalAmount.toFixed(2) + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + balanceBefore.toFixed(2) + ' → ¥' + newBalance + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">📋 订单编号：<strong>' + firstOrderNo + '</strong></p>' +
	          '<p>⏰ 购买时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
	          '</div>' +
	          '<p>前往 <a href="' + (process.env.SITE_URL || '') + '/">控制面板</a> 查看硬盘详情。</p>', siteName);
	        if (await shouldSendEmail(req.user.id, 'notify_disk_purchase')) {
	          await sendEmail(purchaseUser.email, '硬盘购买成功 - ' + siteName, emailHtml);
	        }
	      }
    } catch (emailErr) { console.error('[disk purchase] 邮件发送失败:', emailErr.message); }
    await auditAction(req, 'disk.purchase', '购买硬盘[' + diskNames.join('、') + '] ' + capacityGb + 'GiB×' + quantity + ' 金额' + totalAmount + '元');
    res.json({ success: true, order_no: firstOrderNo, orders: createdOrderNos.length, amount: singleAmount, total_amount: totalAmount, disks: quantity });
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
	      // 退款流水（统一记录一笔）
	      var refundOrderNo = generateOrderNo('refund');
	      await pool2.execute(
	        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
	        [req.user.id, refundOrderNo, dbNow, 'balance_refund', 'refund', totalAmount, period, periodCount, balanceBefore, refundBalanceAfter, 'disk', null, createdOrderNos[0] || '', '', dbNow]
	      );
	      // 所有订单标记 refunded
	      for (var ri = 0; ri < createdOrderNos.length; ri++) {
	        try { await db.orders.updateStatus(createdOrderNos[ri], 'refunded'); } catch (e) {}
	      }
	    } catch (rollbackError) {
	      console.error('[disk purchase] 退款处理失败:', rollbackError.message);
	    }
	    // 邮件通知：硬盘购买失败退款
	    try {
	      var failUser = await db.users.getById(req.user.id);
	      if (failUser && failUser.email && failUser.emailVerified && failUser.email.includes('@')) {
	        var siteName = await getSiteName();
	        var newBalance = (balanceBefore - totalAmount + totalAmount).toFixed(2);
	        var emailHtml = createEmailTemplate('硬盘购买失败 - 已退款',
	          '<p>非常抱歉，您购买的数据盘创建失败，款项已原路退回。</p>' +
	          '<div class="warning-box">' +
	          '<p style="margin-bottom: 4px;">💸 退款金额：<strong>¥' + totalAmount.toFixed(2) + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + balanceBefore.toFixed(2) + ' → ¥' + newBalance + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">📋 原订单号：<strong>' + (createdOrderNos[0] || '') + '</strong></p>' +
	          '<p style="margin-bottom: 4px;">🔖 退款单号：<strong>' + (typeof refundOrderNo !== 'undefined' ? refundOrderNo : '') + '</strong></p>' +
	          '<p>⏰ 退款时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
	          '</div>' +
	          '<p>如有疑问请联系客服。</p>', siteName);
	        if (await shouldSendEmail(req.user.id, 'notify_disk_refund')) {
	          await sendEmail(failUser.email, '硬盘购买失败已退款 - ' + siteName, emailHtml);
	        }
	      }
	    } catch (emailErr) { console.error('[disk purchase] 退款邮件发送失败:', emailErr.message); }
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

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

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

      // 统一使用 SCSI 总线（支持热插拔，无需关机即可挂载/卸载）
      var bus = 'scsi';
      // 自动分配空闲 scsi 设备号
      var dev = await diskUtils.getAvailableDevNumber(vm.vm_id, bus);

      // 读取规格的 QoS 参数（从数据库读取，非用户输入）
      var qosParams = {
        mbps_rd: lockedDisk.mbps_rd, mbps_rd_max: lockedDisk.mbps_rd_max,
        mbps_wr: lockedDisk.mbps_wr, mbps_wr_max: lockedDisk.mbps_wr_max,
        iops_rd: lockedDisk.iops_rd, iops_rd_max: lockedDisk.iops_rd_max,
        iops_wr: lockedDisk.iops_wr, iops_wr_max: lockedDisk.iops_wr_max
      };

      // 执行 PVE 挂载
      // 如果磁盘托管在中转 VM 上（holding_vmid/holding_slot 有值），走 moveDisk 转移；
      // 否则为游离卷，直接 qm set 挂载
      var result = await diskUtils.bindDisk(
        vm.vm_id, lockedDisk.volume_id, bus, dev, qosParams,
        lockedDisk.holding_vmid, lockedDisk.holding_slot
      );

      // 条件更新（WHERE status = 原状态，双重保障防并发）
      await conn.execute(
        'UPDATE disks SET status = ?, bind_vmid = ?, bind_bus = ?, bind_dev = ?, holding_vmid = NULL, holding_slot = NULL, volume_id = ?, updated_at = NOW() WHERE id = ? AND status = ?',
        ['bound', vm.vm_id, result.bus, result.dev, result.volume_id || lockedDisk.volume_id, disk.id, lockedDisk.status]
      );

	    return result;
	    });

    // 异步更新快照（不阻塞响应）
    takeDiskSnapshot(vm.vm_id, req.user.id).catch(function(err) {
      console.error('[快照] bind 后快照更新失败:', err.message);
    });

    await auditAction(req, 'disk.bind', '挂载硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + ']到VMID ' + vm.vm_id, { resourceType: 'disk', resourceId: disk.id });
    res.json({ success: true, bus: bindResult.bus, dev: bindResult.dev });
	  } catch (e) {
	    console.error('[disk bind] 挂载失败:', e.stack || e.message);
	    res.status(500).json({ error: safeError(e) });
	  }
	});

// 卸载磁盘
router.post('/disks/:id/unbind', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_unbind:' + req.user.id, 2, 10000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

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

      // 执行 PVE 卸载（qm unlink + moveDisk 到中转 VM 托管）
      var holdingResult = await diskUtils.unbindDisk(lockedDisk.bind_vmid, lockedDisk.bind_bus, lockedDisk.bind_dev, lockedDisk.holding_vmid);

      // 条件更新（WHERE status = 'bound'，防止并发）
      // volume_id 同步更新为 move_disk 重命名后的新值（若读取失败则沿用旧值，挂载时会自愈）
      await conn.execute(
        'UPDATE disks SET status = ?, bind_vmid = NULL, bind_bus = NULL, bind_dev = NULL, holding_vmid = ?, holding_slot = ?, volume_id = ?, updated_at = NOW() WHERE id = ? AND status = ?',
        ['free', holdingResult.holdingVmid, holdingResult.holdingSlot, holdingResult.volume_id || lockedDisk.volume_id, disk.id, 'bound']
      );
    });

    // 异步更新快照（不阻塞响应）
    if (disk.bind_vmid) {
      takeDiskSnapshot(disk.bind_vmid, req.user.id).catch(function(err) {
        console.error('[快照] unbind 后快照更新失败:', err.message);
      });
    }

    // 异步更新中转 VM 快照
    var holdingService = require('../services/holding-vm');
    holdingService.getHoldingVmid().then(function(hvmid) {
      takeDiskSnapshot(hvmid, 0).catch(function(err) {
        console.error('[快照] 中转 VM 快照更新失败:', err.message);
      });
    });

    await auditAction(req, 'disk.unbind', '卸载硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + ']从VMID ' + (disk.bind_vmid || '') + '卸载', { resourceType: 'disk', resourceId: disk.id });
    res.json({ success: true });
  } catch (e) {
    console.error('[disk unbind] 卸载失败:', e.stack || e.message);
    res.status(500).json({ error: safeError(e) });
  }
});

// 扩容磁盘
router.post('/disks/:id/resize', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_resize:' + req.user.id, 20, 60000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

    // 不支持扩容的磁盘格式（vmdk/subvol qemu 不支持 resize；DIR 上的 raw 文件扩容不可靠）
    // qcow2 和 NULL（块设备存储）支持扩容
    var UNSUPPORTED_RESIZE_FORMATS = ['vmdk', 'subvol', 'raw'];
    if (disk.disk_format && UNSUPPORTED_RESIZE_FORMATS.indexOf(disk.disk_format) !== -1) {
      return res.status(403).json({ error: '该磁盘格式（' + disk.disk_format + '）不支持扩容' });
    }

    var newSize = parseInt(req.body.capacity_gb);

    // 前置校验
    if (!Number.isInteger(newSize) || newSize <= 0) {
      return res.status(400).json({ error: '无效的容量' });
    }
    if (newSize <= disk.capacity_gb) {
      return res.status(400).json({ error: '新容量必须大于当前容量（' + disk.capacity_gb + ' GiB）' });
    }
    if (disk.status === 'destroyed' || disk.status === 'expired') {
      return res.status(400).json({ error: '磁盘已过期或已销毁，无法扩容' });
    }
    // 已过期时间校验
    if (disk.expire_time && new Date(disk.expire_time) <= new Date()) {
      return res.status(400).json({ error: '磁盘已过期，无法扩容' });
    }

    // 校验规格最大容量
    if (disk.spec_id) {
      var spec = await db.diskSpecs.getById(disk.spec_id);
      if (spec && newSize > spec.max_size_gb) {
        return res.status(400).json({ error: '新容量超出规格上限（' + spec.max_size_gb + ' GiB）' });
      }
    }

    // 获取当前 spec 价格（使用最新 spec 价格，而非磁盘快照价格）
    var currentSpec = disk.spec_id ? await db.diskSpecs.getById(disk.spec_id) : null;
    var currentPricePerGb = currentSpec ? parseFloat(currentSpec.price_per_gb) : parseFloat(disk.price_per_gb);

    // 计算扩容费用
    var resizeAmount = diskUtils.calcResizeAmount(disk.capacity_gb, newSize, currentPricePerGb, disk.expire_time);
    if (resizeAmount < 0) {
      return res.status(400).json({ error: '磁盘已过期，无法扩容' });
    }

    // 余额检查
    var user = await db.users.getById(req.user.id);
    var balanceBefore = parseFloat(user.balance || '0');
    if (balanceBefore < resizeAmount) {
      return res.status(400).json({ error: '余额不足，扩容费用 ' + resizeAmount + ' 元，当前余额 ' + balanceBefore.toFixed(2) + ' 元' });
    }

    var resizeOrderNo = generateOrderNo('disk');
    var resizeResourceName = '扩容 ' + disk.id + '|' + disk.capacity_gb + 'GiB->' + newSize + 'GiB';
    var dbNow = db.now();

    // 事务：扣款 + 创建订单 + 流水 + 更新容量 + 更新价格
    await withTransaction(async (conn) => {
      // 原子扣款
      await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [resizeAmount, req.user.id]);
      var balanceAfter = balanceBefore - resizeAmount;

      // 创建订单
      await conn.execute(
        'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [resizeOrderNo, req.user.id, 'disk', disk.spec_id || 0, 0, 'month', 0, resizeAmount, 0, 0, newSize, resizeResourceName, disk.id, 'pending']
      );

      // 创建流水
      await conn.execute(
        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [req.user.id, resizeOrderNo, dbNow, 'balance', 'disk_purchase', resizeAmount, 'month', 0, balanceBefore, balanceAfter, 'disk', disk.id, '', '', dbNow]
      );

      // 更新台账容量 + 更新 price_per_gb 为 spec 最新价格（续费按新价）
      await conn.execute(
        'UPDATE disks SET capacity_gb = ?, price_per_gb = ?, updated_at = NOW() WHERE id = ?',
        [newSize, currentPricePerGb, disk.id]
      );
    });

    // 执行 PVE 扩容（事务外）
    try {
      var tempVmid = '9999';
      try {
        var cfgVal = await db.config.get('disk:temp_vmid');
        if (cfgVal) tempVmid = cfgVal;
      } catch (e) {}
      await diskUtils.resizeDisk(disk.volume_id, newSize, tempVmid, disk.bind_vmid, disk.bind_bus, disk.bind_dev);
    } catch (pveErr) {
      // PVE 扩容失败：回滚退款 + 恢复容量 + 退款流水
      console.error('[disk resize] PVE 扩容失败，回滚:', pveErr.message);
      await withTransaction(async (conn) => {
        // 退款
        await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [resizeAmount, req.user.id]);
        // 恢复容量和价格
        await conn.execute('UPDATE disks SET capacity_gb = ?, price_per_gb = ?, updated_at = NOW() WHERE id = ?', [disk.capacity_gb, disk.price_per_gb, disk.id]);
        // 退款流水
        var refundOrderNo = generateOrderNo('refund');
        var refundBalanceAfter = balanceBefore - resizeAmount + resizeAmount;
        await conn.execute(
          'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [req.user.id, refundOrderNo, dbNow, 'balance_refund', 'refund', resizeAmount, 'month', 0, balanceBefore - resizeAmount, refundBalanceAfter, 'disk', disk.id, resizeOrderNo, '', dbNow]
        );
        // 订单标记 refunded
        await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['refunded', resizeOrderNo]);
      });
      // 邮件通知：硬盘扩容失败退款
      try {
        var resizeFailUser = await db.users.getById(req.user.id);
        if (resizeFailUser && resizeFailUser.email && resizeFailUser.emailVerified && resizeFailUser.email.includes('@')) {
          var siteName = await getSiteName();
          var newBalance = (balanceBefore - resizeAmount + resizeAmount).toFixed(2);
          var emailHtml = createEmailTemplate('硬盘扩容失败 - 已退款',
            '<p>非常抱歉，您硬盘扩容操作失败，款项已原路退回。</p>' +
            '<div class="warning-box">' +
            '<p style="margin-bottom: 4px;">💸 退款金额：<strong>¥' + resizeAmount.toFixed(2) + '</strong></p>' +
            '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + balanceBefore.toFixed(2) + ' → ¥' + newBalance + '</strong></p>' +
            '<p style="margin-bottom: 4px;">📋 原订单号：<strong>' + resizeOrderNo + '</strong></p>' +
            '<p style="margin-bottom: 4px;">🔖 退款单号：<strong>' + refundOrderNo + '</strong></p>' +
            '<p>⏰ 退款时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
            '</div>' +
            '<p>如有疑问请联系客服。</p>', siteName);
          if (await shouldSendEmail(req.user.id, 'notify_disk_refund')) {
            await sendEmail(resizeFailUser.email, '硬盘扩容失败已退款 - ' + siteName, emailHtml);
          }
        }
      } catch (emailErr) { console.error('[disk resize] 退款邮件发送失败:', emailErr.message); }
      return res.status(500).json({ error: 'PVE 扩容失败，已退款' });
    }

    // 订单标记完成
    await db.orders.updateStatus(resizeOrderNo, 'completed');

    // 邮件通知：硬盘扩容成功
    try {
      var resizeUser = await db.users.getById(req.user.id);
      if (resizeUser && resizeUser.email && resizeUser.emailVerified && resizeUser.email.includes('@')) {
        var siteName = await getSiteName();
        var newBalance = (balanceBefore - resizeAmount).toFixed(2);
        var emailHtml = createEmailTemplate('硬盘扩容成功',
          '<p>您的数据盘已扩容成功！</p>' +
          '<div class="info-box">' +
          '<p style="margin-bottom: 4px;">💾 磁盘名称：<strong>' + (disk.disk_name || '数据盘-' + disk.id) + '</strong></p>' +
          '<p style="margin-bottom: 4px;">📐 扩容：<strong>' + disk.capacity_gb + ' GiB → ' + newSize + ' GiB</strong></p>' +
          '<p style="margin-bottom: 4px;">💸 扩容费用：<strong>¥' + resizeAmount.toFixed(2) + '</strong></p>' +
          '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + balanceBefore.toFixed(2) + ' → ¥' + newBalance + '</strong></p>' +
          '<p style="margin-bottom: 4px;">📋 订单编号：<strong>' + resizeOrderNo + '</strong></p>' +
          '<p>⏰ 扩容时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
          '</div>' +
          '<p>前往 <a href="' + (process.env.SITE_URL || '') + '/">控制面板</a> 查看硬盘详情。</p>', siteName);
        if (await shouldSendEmail(req.user.id, 'notify_disk_resize')) {
          await sendEmail(resizeUser.email, '硬盘扩容成功 - ' + siteName, emailHtml);
        }
      }
    } catch (emailErr) { console.error('[disk resize] 邮件发送失败:', emailErr.message); }

    await auditAction(req, 'disk.resize', '扩容硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + '] ' + disk.capacity_gb + 'GiB→' + newSize + 'GiB', { resourceType: 'disk', resourceId: disk.id });
    res.json({ success: true, new_capacity: newSize, amount: resizeAmount });
  } catch (e) {
    console.error('[disk resize] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 销毁磁盘
router.post('/disks/:id/destroy', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_destroy:' + req.user.id, 20, 60000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;
    var user = await db.users.getById(req.user.id);

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

    // 已绑定的磁盘必须先卸载
    if (disk.status === 'bound') {
      return res.status(400).json({ error: '请先卸载磁盘再销毁' });
    }
    if (disk.status === 'destroyed') {
      // 已销毁的记录：硬删除清理（PVE 卷早已释放）
      await db.disks.hardDelete(disk.id);
      return res.json({ success: true });
    }

    var refundAmount = 0;
    var refundDesc = '';

    // 销毁退款优化：按订单分单退款
    // 查询该磁盘所有已完成的付费订单（购买+扩容+续费）
    var paidOrders = [];
    var totalPaid = 0;
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
        console.error('[disk destroy] 查询订单失败:', e.message);
      }
      totalPaid = paidOrders.reduce(function(sum, o) {
        return sum + parseFloat(o.amount || 0);
      }, 0);

      var now = new Date();
      var expireDate = new Date(disk.expire_time);
      var createDate = disk.create_time ? new Date(disk.create_time) : null;

      // 按订单分单计算退款
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
        } else if (orderDays <= 15) {
          // 3-15天按剩余天数比例退款
          if (createDate && expireDate > orderCreateTime) {
            var totalMs = expireDate - orderCreateTime;
            var remainingMs = expireDate - now;
            var factor = remainingMs / totalMs;
            if (factor > 0) {
              orderRefund = parseFloat((orderPaid * factor).toFixed(2));
            }
          }
        }
        // >15天不退款
        refundAmount += orderRefund;
      }
      refundAmount = parseFloat(refundAmount.toFixed(2));

      // 生成退款描述
      var diskCreateDate = createDate ? Math.floor((now - createDate) / (1000 * 60 * 60 * 24)) : 999;
      if (diskCreateDate <= 3) {
        refundDesc = '全额退款（开通 ' + diskCreateDate + ' 天）';
      } else if (diskCreateDate <= 15) {
        refundDesc = '按剩余天数退款（开通 ' + diskCreateDate + ' 天）';
      } else {
        refundDesc = '该磁盘开通时间大于15天无法进行退款操作';
      }
    }

    // 文档 7.8：竞争条件防护 - SELECT ... FOR UPDATE 行锁
    await withTransaction(async (conn) => {
      var [rows] = await conn.execute('SELECT * FROM disks WHERE id = ? FOR UPDATE', [disk.id]);
      var lockedDisk = rows[0];
      if (!lockedDisk) throw new Error('磁盘不存在');
      if (lockedDisk.status === 'bound') throw new Error('请先卸载磁盘再销毁');
      if (lockedDisk.status === 'destroyed') throw new Error('磁盘已销毁');

      // V3-14 修复：销毁前审计（含退款金额，无退款显示"无退款"）
      await auditAction(req, 'disk.destroy', '销毁硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + ']' + (refundAmount > 0 ? '退款' + refundAmount + '元' : '无退款'), { resourceType: 'disk', resourceId: disk.id });

      // 执行 PVE 销毁
      await diskUtils.destroyDisk(lockedDisk.volume_id);

      // 按订单分单退款
      if (refundAmount > 0 && paidOrders.length > 0) {
        await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [refundAmount, req.user.id]);
        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + refundAmount;
        var now2 = new Date();

        for (var ri = 0; ri < paidOrders.length; ri++) {
          var origOrder2 = paidOrders[ri];
          var orderPaid2 = parseFloat(origOrder2.amount || 0);
          if (orderPaid2 <= 0) continue;
          var orderCreateTime2 = new Date(origOrder2.created_at);
          var orderDays2 = Math.floor((now2 - orderCreateTime2) / (1000 * 60 * 60 * 24));

          var orderRefund2 = 0;
          if (orderDays2 <= 3) {
            orderRefund2 = orderPaid2;
          } else if (orderDays2 <= 15) {
            var expireDate2 = new Date(disk.expire_time);
            var createDate2 = disk.create_time ? new Date(disk.create_time) : null;
            if (createDate2 && expireDate2 > orderCreateTime2) {
              var totalMs2 = expireDate2 - orderCreateTime2;
              var remainingMs2 = expireDate2 - now2;
              var factor2 = remainingMs2 / totalMs2;
              if (factor2 > 0) {
                orderRefund2 = parseFloat((orderPaid2 * factor2).toFixed(2));
              }
            }
          }
          if (orderRefund2 > 0) {
            var refundOrderNo = generateOrderNo('refund');
            await conn.execute(
              'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [req.user.id, refundOrderNo, db.now(), 'balance_refund', 'refund', orderRefund2, null, null, balanceBefore, balanceAfter, 'disk', disk.id, origOrder2.order_no, '', db.now()]
            );
            // 原订单标记为已退款
            await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['refunded', origOrder2.order_no]);
          } else {
            // 无退款的订单（>15天）标记为已销毁无退款
            await conn.execute('UPDATE orders SET status = ? WHERE order_no = ?', ['destroyed', origOrder2.order_no]);
          }
        }
      } else {
        // 没有退款的场景（>15天），所有订单标记为已销毁无退款
        for (var ni = 0; ni < paidOrders.length; ni++) {
          await conn.execute('UPDATE orders SET status = ? WHERE order_no = ? AND status = ?', ['destroyed', paidOrders[ni].order_no, 'completed']);
        }
      }

      // 条件更新
      await conn.execute(
        'UPDATE disks SET status = ?, updated_at = NOW() WHERE id = ? AND status != ?',
        ['destroyed', disk.id, 'destroyed']
      );
    });

    // 邮件通知：硬盘销毁退款（仅退款金额>0时发送）
    if (refundAmount > 0) {
      try {
        var destroyUser = await db.users.getById(req.user.id);
        if (destroyUser && destroyUser.email && destroyUser.emailVerified && destroyUser.email.includes('@')) {
          var siteName = await getSiteName();
          var balanceBeforeDestroy = parseFloat(destroyUser.balance || '0');
          var emailHtml = createEmailTemplate('硬盘销毁退款',
            '<p>您的数据盘已销毁，退款已到账。</p>' +
            '<div class="info-box">' +
            '<p style="margin-bottom: 4px;">💾 磁盘名称：<strong>' + (disk.disk_name || '数据盘-' + disk.id) + '</strong></p>' +
            '<p style="margin-bottom: 4px;">💸 退款金额：<strong>¥' + refundAmount.toFixed(2) + '</strong></p>' +
            '<p style="margin-bottom: 4px;">📝 退款说明：<strong>' + refundDesc + '</strong></p>' +
            '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + (balanceBeforeDestroy - refundAmount).toFixed(2) + ' → ¥' + balanceBeforeDestroy.toFixed(2) + '</strong></p>' +
            '<p>⏰ 退款时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
            '</div>' +
            '<p>如有疑问请联系客服。</p>', siteName);
          if (await shouldSendEmail(req.user.id, 'notify_disk_destroy_refund')) {
            await sendEmail(destroyUser.email, '硬盘销毁退款 - ' + siteName, emailHtml);
          }
        }
      } catch (emailErr) { console.error('[disk destroy] 退款邮件发送失败:', emailErr.message); }
    }

    res.json({ success: true, refund: refundAmount > 0, refund_amount: refundAmount, refund_desc: refundDesc });
  } catch (e) {
    console.error('[disk destroy] 失败:', e);
    res.status(500).json({ error: safeError(e) });
  }
});

// 续费磁盘
router.post('/disks/:id/renew', authMiddleware, checkDiskOwnership, async (req, res) => {
  var limit = await checkRateLimit('disk_renew:' + req.user.id, 2, 30000);
  if (!limit.allowed) return res.status(429).json({ error: '操作过于频繁' });

  try {
    var disk = req.disk;

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

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
	    var months = getPeriodMonths(period);
	    var currentExpire = disk.expire_time ? new Date(disk.expire_time) : new Date();
    var baseTime = currentExpire > new Date() ? currentExpire : new Date();
    var newExpire = new Date(baseTime.getTime() + months * periodCount * 30 * 24 * 60 * 60 * 1000);

    var orderNo = generateOrderNo('disk');
    var dbNow = db.now();

    await withTransaction(async (conn) => {
      // 原子扣款
      await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [amount, req.user.id]);
      var balanceAfter = balanceBefore - amount;
      // 创建续费订单（resource_name 格式：续费 diskId|xxGiB）
      await conn.execute(
        'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [orderNo, req.user.id, 'disk', disk.spec_id || 0, 0, period, periodCount, amount, 0, 0, disk.capacity_gb, '续费 ' + disk.id + '|' + disk.capacity_gb + 'GiB', disk.id, 'completed']
      );
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

    // 邮件通知：硬盘续费成功
    try {
      var renewUser = await db.users.getById(req.user.id);
      if (renewUser && renewUser.email && renewUser.emailVerified && renewUser.email.includes('@')) {
        var siteName = await getSiteName();
        var periodLabel = periodCount + getPeriodUnit(period);
        var expiryDisplay = newExpire ? new Date(newExpire).toLocaleString('zh-CN') : '永久有效';
        var newBalance = (balanceBefore - amount).toFixed(2);
        var emailHtml = createEmailTemplate('硬盘续费成功',
          '<p>您的数据盘已续费成功！</p>' +
          '<div class="info-box">' +
          '<p style="margin-bottom: 4px;">💾 磁盘名称：<strong>' + (disk.disk_name || '数据盘-' + disk.id) + '</strong></p>' +
          '<p style="margin-bottom: 4px;">📅 续费详情：<strong>' + periodLabel + '</strong></p>' +
          '<p style="margin-bottom: 4px;">⏳ 到期时间：<strong>' + expiryDisplay + '</strong></p>' +
          '<p style="margin-bottom: 4px;">💸 实付金额：<strong>¥' + amount.toFixed(2) + '</strong></p>' +
          '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + balanceBefore.toFixed(2) + ' → ¥' + newBalance + '</strong></p>' +
          '<p style="margin-bottom: 4px;">📋 订单编号：<strong>' + orderNo + '</strong></p>' +
          '<p>⏰ 续费时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
          '</div>' +
          '<p>前往 <a href="' + (process.env.SITE_URL || '') + '/">控制面板</a> 查看硬盘详情。</p>', siteName);
        if (await shouldSendEmail(req.user.id, 'notify_disk_renewal')) {
          await sendEmail(renewUser.email, '硬盘续费成功 - ' + siteName, emailHtml);
        }
      }
    } catch (emailErr) { console.error('[disk renew] 邮件发送失败:', emailErr.message); }

    await auditAction(req, 'disk.renew', '续费硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + '] ' + periodCount + '个' + period + ' 金额' + amount + '元', { resourceType: 'disk', resourceId: disk.id });
    res.json({ success: true, amount: amount, new_expire: newExpire });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

// 切换自动续费开关
router.post('/disks/:id/auto-renew', authMiddleware, checkDiskOwnership, async (req, res) => {
  try {
    var disk = req.disk;

    // legacy 磁盘不允许独立操作（随 VM 管理）
    if (disk.is_legacy) {
      return res.status(403).json({ error: 'legacy 磁盘随 VM 管理，不支持独立操作' });
    }

    var enabled = req.body.enabled ? 1 : 0;
    await db.disks.updateAutoRenew(disk.id, enabled);
    await auditAction(req, 'disk.auto-renew', (enabled ? '打开' : '关闭') + '硬盘[' + (disk.disk_name || '数据盘-' + disk.id) + ']自动续费', { resourceType: 'disk', resourceId: disk.id });
    res.json({ success: true, auto_renew: enabled });
  } catch (e) {
    res.status(500).json({ error: safeError(e) });
  }
});

module.exports = router;
