// server/services/billing.js - 计费业务服务
// 规范第七节：业务编排进 services/，路由只做参数校验与响应组装
// 从 utils/order-utils.js（deductBalance）与 routes/wallet.js（余额续费）抽取

const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { createEmailTemplate, sendEmail, getSiteName, shouldSendEmail } = require('../utils/email');
const { generateOrderNo } = require('../utils/order-utils');
const { withTransaction } = require('../utils/with-transaction');
const { formatLocalDate } = require('../utils/date');
const { VALID_PERIODS, getPeriodDays, getPeriodUnit, MAX_PERIOD_COUNT } = require('../constants');

/**
 * 余额扣款（原子扣减，返回扣款前后余额）
 * @param {number} userId - 用户 ID
 * @param {number} amount - 扣款金额（必须大于 0）
 * @param {object} dbInstance - db 聚合入口（db.js）
 * @returns {Promise<{balanceBefore: number, balanceAfter: number}>}
 * @throws {Error} 金额非法或余额不足
 */
async function deductBalance(userId, amount, dbInstance) {
  if (amount <= 0) throw new Error('扣款金额必须大于0');
  var user = await dbInstance.users.getById(userId);
  var balanceBefore = parseFloat(user.balance || '0');
  // V4-02 修复：原子条件扣款（WHERE balance >= amount），余额不足时 affectedRows=0，消除并发双花
  var [result] = await dbInstance.users.decrementBalance(userId, amount);
  if (!result || result.affectedRows === 0) {
    throw new Error('余额不足');
  }
  return { balanceBefore: balanceBefore, balanceAfter: balanceBefore - amount };
}

/**
 * 余额抵扣续费（VM/LXC）
 * 原 routes/wallet.js /wallet/renew 业务：校验 -> 计价 -> 事务扣款+延长期限+流水 -> 自动开机 -> 通知
 * 返回 { ok: true, data: {...} } 或 { ok: false, status, error }（业务校验失败走返回对象，不抛异常）
 * @param {object} opts - { userId, isAdmin, type, vmid, ctid, quantity, periodCount, period }
 */
async function renewByBalance(opts) {
    var { userId, isAdmin, type, vmid, ctid, quantity, period_count, period } = opts;

    if (!type || !['vm', 'lxc'].includes(type)) {
        return { ok: false, status: 400, error: '无效的资源类型' };
    }
    var qty = parseInt(period_count || quantity);
    if (!Number.isInteger(parseFloat(quantity)) || qty < 1 || String(quantity).trim() !== String(qty)) {
        if (!period_count) {
            return { ok: false, status: 400, error: '续费数量必须为正整数' };
        }
    }
    if (!Number.isInteger(qty) || qty < 1) {
        return { ok: false, status: 400, error: '续费数量必须为正整数' };
    }
    // V4-11 修复：续费数量上限与开通侧一致（1-99，常量单一来源），防超大数量日期溢出
    if (qty > MAX_PERIOD_COUNT) {
        return { ok: false, status: 400, error: '续费数量不能超过 ' + MAX_PERIOD_COUNT };
    }

    var resource;
    if (type === 'vm') {
        var allVms = await db.vms.getAll();
        resource = allVms.find(v => v.vm_id === parseInt(vmid));
    } else {
        var allLxc = await db.lxcContainers.getAll();
        resource = allLxc.find(c => c.ct_id === parseInt(ctid));
    }

    if (!resource) return { ok: false, status: 404, error: '资源不存在' };

    if (resource.user_id !== userId && !isAdmin) {
        return { ok: false, status: 403, error: '无权限操作' };
    }

    var price = parseFloat(resource.renewal_price || '0');
    if (price <= 0) return { ok: false, status: 400, error: '该资源未设置续费价格' };

    var usePeriod = period || resource.renewal_period || 'month';
    // SEC-04: period 白名单校验
    if (!VALID_PERIODS.includes(usePeriod)) {
        return { ok: false, status: 400, error: '无效的计费周期' };
    }

    // 如果用户选择了不同的周期，重新计算单价
    var actualPrice = parseFloat(resource.renewal_price || '0');
    var storedPeriod = resource.renewal_period || 'month';
    if (usePeriod !== storedPeriod) {
        // 优先用资源存储的 monthly_price + 折扣按周期独立计价
        var monthlyPrice = parseFloat(resource.monthly_price || '0');
        if (monthlyPrice > 0) {
            var { calculateAmount } = require('../utils/order-utils');
            var qDiscount = parseInt(resource.quarterly_discount) || 0;
            var yDiscount = parseInt(resource.yearly_discount) || 0;
            actualPrice = calculateAmount(monthlyPrice, usePeriod, 1, qDiscount, yDiscount);
        } else {
            // 历史数据无 monthly_price，回退到原逻辑
            var { getPeriodMonths } = require('../constants');
            var originalMonths = getPeriodMonths(storedPeriod);
            var monthlyBase = actualPrice / originalMonths;
            var newMonths = getPeriodMonths(usePeriod);
            actualPrice = monthlyBase * newMonths;
        }
    }
    var totalPrice = actualPrice * qty;

    var user = await db.users.getById(userId);
    var balance = parseFloat(user.balance || '0');

    if (balance < totalPrice) {
        return { ok: false, status: 400, error: '当前账户余额不足，无法使用余额抵扣，请先充值后再续费' };
    }

    var addDays = qty * getPeriodDays(usePeriod);

    var oldExpiration = resource.expiration_date ? new Date(resource.expiration_date) : new Date();
    oldExpiration.setDate(oldExpiration.getDate() + addDays);
    var newExpiration = formatLocalDate(oldExpiration);

    var newBalance = (balance - totalPrice).toFixed(2);
    // 订单号统一：续费类与开通/扩容一致使用 DD 前缀 + 14位时间戳 + 8位随机数（24位）
    var orderNo = generateOrderNo('renewal');
    // ARCH-10: 扣款+更新到期时间+流水记录三步放入事务，保证原子性
    await withTransaction(async (conn) => {
        // 1. 扣款（V4-02 修复：原子条件扣款，并发余额不足时回滚事务）
        var [deductRes] = await conn.execute(
            'UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ? AND balance >= ?',
            [totalPrice, userId, totalPrice]
        );
        if (deductRes.affectedRows === 0) {
            throw new Error('余额不足');
        }
        // 2. 更新到期时间
        if (type === 'vm') {
            await conn.execute('UPDATE vms SET expiration_date = ? WHERE id = ?', [newExpiration, resource.id]);
            // 同步更新绑定 VM 的 legacy 磁盘到期时间（不独立计费，随 VM 走）
            await conn.execute('UPDATE disks SET expire_time = ? WHERE bind_vmid = ? AND is_legacy = 1', [newExpiration, resource.vm_id]);
        } else {
            await conn.execute('UPDATE lxc_containers SET expiration_date = ? WHERE id = ?', [newExpiration, resource.id]);
        }
        // 3. 创建流水
        await conn.execute(
            'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, orderNo, db.now(), 'balance', 'renewal', totalPrice.toFixed(2), usePeriod, qty, balance.toFixed(2), newBalance, type, resource.vm_id || resource.ct_id || resource.id, null, null, db.now()]
        );
    });

    // 续费后自动开机（PVE 操作不放入事务，避免长事务）
    // 仅当关机原因是"到期自动关机"才自动开机，用户手动关机的资源不自动开机
    try {
        var renewVmid = type === 'vm' ? resource.vm_id : resource.ct_id;
        var freshResource = type === 'vm'
            ? await db.vms.getByVmid(renewVmid)
            : (await db.lxcContainers.getByCtId(renewVmid))[0];
        var shouldAutoStart = freshResource && freshResource.shutdown_reason === 'expired';
        if (shouldAutoStart) {
            if (type === 'vm') {
                var renewStatus = await pveApi.getVmStatus(renewVmid);
                if (renewStatus && renewStatus.status === 'stopped') {
                    await pveApi.startVm(renewVmid);
                }
            } else {
                var renewLxcStatus = await pveApi.getLxcStatus(renewVmid);
                if (renewLxcStatus && renewLxcStatus.status === 'stopped') {
                    await pveApi.startLxc(renewVmid);
                }
            }
        }
    } catch (startErr) { console.error('[billing] 续费自动开机失败:', startErr.message); }

    // 站内信 + 邮件通知（失败不阻断主流程）
    var resourceName = resource.name || (type === 'vm' ? 'VM ' + resource.vm_id : 'CT ' + resource.ct_id);
    var periodStr = qty + getPeriodUnit(usePeriod);
    var expiryDisplay = newExpiration ? new Date(newExpiration).toLocaleString('zh-CN') : '永久有效';
    var msgContent = '资源名称：' + resourceName + '\n续费详情：' + periodStr + '\n到期时间：' + expiryDisplay + '\n实付金额：¥' + totalPrice.toFixed(2) + '\n余额变动：¥' + balance.toFixed(2) + ' → ¥' + newBalance + '\n订单号：' + orderNo;
    var resourceTypeLabel = type === 'vm' ? '虚拟机' : 'LXC 容器';

    try {
        await db.messages.create({
            uid: userId,
            title: '资源续费成功',
            content: msgContent,
            type: 2,
            send_type: 1
        });
    } catch (e) {
        console.error('[billing] 续费站内信发送失败:', e.message);
    }

    try {
        if (user.email && user.emailVerified && user.email.includes('@')) {
            if (await shouldSendEmail(userId, 'notify_renewal')) {
                var siteName = await getSiteName();
                var renewHtml = createEmailTemplate('资源续费成功',
                    `<p>您好，您的 <strong>${resourceTypeLabel}「${resourceName}」</strong> 已续费成功。</p>
                    <div class="info-box">
                        <p style="margin-bottom: 4px;">📌 资源名称：<strong>${resourceName}</strong></p>
                        <p style="margin-bottom: 4px;">📅 续费详情：<strong>${periodStr}</strong></p>
                        <p style="margin-bottom: 4px;">⏳ 到期时间：<strong>${expiryDisplay}</strong></p>
                        <p style="margin-bottom: 4px;">💸 实付金额：<strong>¥${totalPrice.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">💳 余额变动：<strong>¥${balance.toFixed(2)} → ¥${newBalance}</strong></p>
                        <p style="margin-bottom: 4px;">📋 订单编号：<strong>${orderNo}</strong></p>
                        <p>⏰ 续费时间：${new Date().toLocaleString('zh-CN')}</p>
                    </div>
                    <p>前往 <a href="${process.env.SITE_URL || ''}/">控制面板</a> 查看资源详情。</p>`, siteName);
                await sendEmail(user.email, '资源续费成功 - ' + siteName, renewHtml);
            }
        }
    } catch (e) {
        console.error('[billing] 续费邮件发送失败:', e.message);
    }

    return {
        ok: true,
        data: {
            success: true,
            message: '续费成功',
            order_no: orderNo,
            balance: newBalance,
            balance_before: balance.toFixed(2),
            balance_after: newBalance,
            new_expiration: newExpiration
        }
    };
}

module.exports = { deductBalance, renewByBalance };
