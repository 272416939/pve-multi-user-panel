const schedule = require('node-schedule');
const { checkExpiredVms, checkExpiredLxc, loadSentRemindersFromDb } = require('../services/expiry-check');
const { resumeRunningBackups, resumeRunningLxcBackups } = require('../services/backup-polling');
const { syncPortForwardsFromIkuai } = require('../services/ikuai-sync');
const ikuaiApi = require('../api/ikuai-api');

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

    loadSentRemindersFromDb();
    resumeRunningBackups();
    resumeRunningLxcBackups();
    checkExpiredVms();
    checkExpiredLxc();
}

module.exports = { initScheduledTasks };
