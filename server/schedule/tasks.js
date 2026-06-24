const schedule = require('node-schedule');
const { checkExpiredVms, checkExpiredLxc, loadSentRemindersFromDb } = require('../services/expiry-check');
const { resumeRunningBackups, resumeRunningLxcBackups } = require('../services/backup-polling');
const { syncPortForwardsFromIkuai } = require('../services/ikuai-sync');
const ikuaiApi = require('../api/ikuai-api');

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
                    if (type === 'vm') {
                        await db.vms.delete(record.id);
                    } else {
                        await db.lxcContainers.delete(record.id);
                    }
                    // 退款（从 renewal_price 推算月价再按周期还原，仅作为兜底）
                    console.warn('[recovery] ' + type + ' ' + record.id + ' 用户 ' + record.user_id + ' 需手动核实退款');
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
    schedule.scheduleJob('*/5 * * * *', () => {
        checkExpiredVms();
        checkExpiredLxc();
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
}

module.exports = { initScheduledTasks, recoverProvisioningTasks };
