const schedule = require('node-schedule');
const { checkExpiredVms, checkExpiredLxc, loadSentRemindersFromDb } = require('../services/expiry-check');
const { checkExpiredDisks, checkStorageCapacityAlert } = require('../services/disk-expiry-check');
const { resumeRunningBackups, resumeRunningLxcBackups } = require('../services/backup-polling');
const { syncPortForwardsFromIkuai } = require('../services/ikuai-sync');
const ikuaiApi = require('../api/ikuai-api');
const { generateOrderNo } = require('../utils/order-utils');
const { withTransaction } = require('../utils/with-transaction');
const redis = require('../api/redis').getRedisClient();

// PERF-25: 分布式锁，防止多实例重复执行到期检查
async function tryAcquireLock(lockKey, ttl = 300) {
    if (!redis) return true; // 无 Redis 时跳过锁
    try {
        const result = await redis.set(lockKey, '1', 'EX', ttl, 'NX');
        return result === 'OK';
    } catch (e) {
        return true; // Redis 异常时不阻止执行
    }
}

async function releaseLock(lockKey) {
    if (!redis) return;
    try { await redis.del(lockKey); } catch (e) {}
}

// SEC-05: 启动时恢复因服务器崩溃导致的开通中孤儿记录
// 扫描 pve_upid 非空的记录，查询 PVE 真实任务状态并做善后处理
async function recoverProvisioningTasks() {
    var db = require('../api/db');
    var pveApi = require('../api/pve-api');

    var pendingVms = [];
    var pendingCts = [];
    try {
        pendingVms = (await db.vms.getAll()).filter(function(v) { return v.pve_upid && v.pve_upid !== ''; });
    } catch (e) { console.error('[recovery] 查询开通中 VM 失败:', e.message); }
    try {
        pendingCts = (await db.lxcContainers.getAll()).filter(function(c) { return c.pve_upid && c.pve_upid !== ''; });
    } catch (e) { console.error('[recovery] 查询开通中 LXC 失败:', e.message); }

    if (pendingVms.length === 0 && pendingCts.length === 0) return;

    console.log('[recovery] 发现 ' + pendingVms.length + ' 个 VM、' + pendingCts.length + ' 个 LXC 开通中记录，开始恢复...');

    var recoverOne = async function(record, type) {
        try {
            var status = await pveApi.getTaskStatus(record.pve_upid);
            if (status.status === 'stopped') {
                if (status.exitstatus === 'OK') {
                    // 任务成功但服务器在后续配置步骤崩溃：清除 pve_upid 让前端恢复正常显示
                    // 注意：VM 可能缺少 CPU/内存/MAC 配置，需管理员手动检查
                    console.warn('[recovery] ' + type + ' ' + record.id + ' (upid=' + record.pve_upid + ') 开通任务已完成但可能未完成配置，已清除开通中标记，请管理员检查资源配置');
                    if (type === 'vm') {
                        await db.vms.update(record.id, { pve_upid: '' });
                    } else {
                        await db.lxcContainers.update(record.id, { pve_upid: '' });
                    }
                } else {
                    // 任务失败：PVE 中资源未创建成功，删除 DB 预创建记录
                    console.warn('[recovery] ' + type + ' ' + record.id + ' (upid=' + record.pve_upid + ') 开通任务失败(exitstatus=' + status.exitstatus + ')，删除预创建记录');
                    var resourceId = type === 'vm' ? record.vm_id : record.ct_id;
                    if (type === 'vm') {
                        await db.vms.delete(record.id);
                    } else {
                        await db.lxcContainers.delete(record.id);
                    }
                    // 退款：查找关联的 pending 订单获取退款金额，创建退款流水并退还余额
                    try {
                        var pendingOrders = await db.orders.getByUser(record.user_id, { type: type, status: 'pending', limit: 50 });
                        var matchedOrder = null;
                        if (pendingOrders && pendingOrders.rows) {
                            matchedOrder = pendingOrders.rows.find(function(o) { return o.resource_id === String(resourceId); });
                        }
                        if (matchedOrder) {
                            var refundAmount = parseFloat(matchedOrder.amount);
                            if (refundAmount > 0) {
                                var refundOrderNo = generateOrderNo('refund');
                                // ARCH-12: 退款+流水+订单状态三步放入事务，保证原子性
                                await withTransaction(async (conn) => {
                                    // 1. 退款（原子增量）
                                    await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [refundAmount, record.user_id]);
                                    // 2. 查询退款后余额
                                    var [userRows] = await conn.execute('SELECT balance FROM users WHERE id = ?', [record.user_id]);
                                    var balanceAfterRefund = parseFloat((userRows[0] && userRows[0].balance) || '0');
                                    // 3. 创建退款流水
                                    await conn.execute(
                                        'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                                        [record.user_id, refundOrderNo, db.now(), 'balance_refund', 'refund', refundAmount, null, null, balanceAfterRefund - refundAmount, balanceAfterRefund, null, null, matchedOrder.order_no, '', db.now()]
                                    );
                                    // 4. 订单标记 refunded（ARCH-03: 不再吞错，失败则事务回滚）
                                    await conn.execute('UPDATE orders SET `status` = ? WHERE order_no = ?', ['refunded', matchedOrder.order_no]);
                                });
                                console.warn('[recovery] ' + type + ' ' + record.id + ' 已退款 ¥' + refundAmount + '，订单 ' + matchedOrder.order_no + ' 标记 refunded');
                            }
                        } else {
                            console.warn('[recovery] ' + type + ' ' + record.id + ' 未找到关联 pending 订单，需手动核实退款');
                        }
                        // 发送开通失败站内信
                        try {
                            await db.messages.create({
                                uid: record.user_id,
                                title: type === 'vm' ? '虚拟机开通失败' : '容器开通失败',
                                content: '非常抱歉，您订购的' + (type === 'vm' ? '虚拟机' : '容器') + ' ' + (record.name || '') + ' 开通失败，钱款已原路返回。如有疑问请联系客服。',
                                type: 1, is_read: 0, send_type: 1
                            });
                        } catch (e) { console.error('[recovery] 失败通知发送失败', e); }
                    } catch (e) { console.error('[recovery] ' + type + ' ' + record.id + ' 退款处理失败:', e.message); }
                }
            } else {
                console.log('[recovery] ' + type + ' ' + record.id + ' (upid=' + record.pve_upid + ') 任务仍在运行，前端将继续轮询');
            }
        } catch (e) {
            console.error('[recovery] ' + type + ' ' + record.id + ' 恢复失败:', e.message);
        }
    };

    for (var i = 0; i < pendingVms.length; i++) {
        await recoverOne(pendingVms[i], 'vm');
    }
    for (var j = 0; j < pendingCts.length; j++) {
        await recoverOne(pendingCts[j], 'lxc');
    }

    console.log('[recovery] 开通中记录恢复完成');
}

function initScheduledTasks() {
    schedule.scheduleJob('*/5 * * * *', async () => {
        if (await tryAcquireLock('lock:expiry-check')) {
            try {
                await checkExpiredVms();
                await checkExpiredLxc();
            } finally {
                await releaseLock('lock:expiry-check');
            }
        }
    });

    // 磁盘到期巡检（每 5 分钟检查，文档 4.1/5.4.5）
    schedule.scheduleJob('*/5 * * * *', async () => {
        if (await tryAcquireLock('lock:disk-expiry-check')) {
            try {
                await checkExpiredDisks();
            } finally {
                await releaseLock('lock:disk-expiry-check');
            }
        }
    });

    // 存储容量告警检查（每小时，文档 3.3.3：90% 触发邮件）
    schedule.scheduleJob('0 * * * *', async () => {
        if (await tryAcquireLock('lock:disk-storage-alert')) {
            try {
                await checkStorageCapacityAlert();
            } finally {
                await releaseLock('lock:disk-storage-alert');
            }
        }
    });

    setTimeout(async () => {
        if (ikuaiApi.isConfigured()) {
            try {
                await syncPortForwardsFromIkuai();
            } catch (e) {
                console.error('[端口转发] 启动同步失败:', e.message);
            }
        } else {
            console.log('[端口转发] ikuai 未配置，跳过启动同步');
        }
    }, 5000);

    // SEC-05: 延迟 10 秒执行恢复（等待 PVE 节点检测完成）
    setTimeout(async () => {
        try {
            await recoverProvisioningTasks();
        } catch (e) {
            console.error('[recovery] 开通中记录恢复异常:', e.message);
        }
    }, 10000);

    loadSentRemindersFromDb();
    resumeRunningBackups();
    resumeRunningLxcBackups();
    checkExpiredVms();
    checkExpiredLxc();
    // 磁盘到期巡检 + 存储容量告警（启动时执行一次）
    checkExpiredDisks();
    checkStorageCapacityAlert();
}

module.exports = { initScheduledTasks, recoverProvisioningTasks };
