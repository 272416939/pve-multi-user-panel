const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const dbg = require('../utils/debug');

let isCheckingExpired = false;
const reminderSentTracker = new Map();

async function loadSentRemindersFromDb() {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayReminders = await db.vms.reminders.getTodayAll();
        let preExpiryCount = 0;
        let expiredCount = 0;

        for (const record of todayReminders) {
            if (record.days === 0) {
                const memKey = `expired-${record.vm_id}-${today}`;
                reminderSentTracker.set(memKey, true);
                expiredCount++;
            } else {
                const memKey = `${record.vm_id}-${record.days}-${today}`;
                reminderSentTracker.set(memKey, true);
                preExpiryCount++;
            }
        }

        if (preExpiryCount > 0 || expiredCount > 0) {
            console.log(`已从数据库恢复今日提醒记录（到期前 ${preExpiryCount} 条，续费 ${expiredCount} 条）`);
        }
    } catch (e) {
        console.error('恢复今日提醒记录失败:', e.message);
    }
}

const checkExpiredVms = async () => {
    if (isCheckingExpired) {
        return;
    }
    isCheckingExpired = true;
    
    try {
        if (!pveApi.node) {
            try {
                await pveApi.detectNode();
            } catch (error) {
                console.error('检测节点失败:', error);
                return;
            }
        }
        
        const reminderConfig = await db.config.getReminder();
        const reminderDays = [reminderConfig.days1, reminderConfig.days2, reminderConfig.days3].filter(d => d > 0);
        const oneDayMs = 24 * 60 * 60 * 1000;
        const allVms = await db.vms.getAll();
        const allUsers = await db.users.getAll();
        
        for (const vm of allVms) {
            if (!vm.expiration_date) {
                continue;
            }
            
            const expDate = new Date(vm.expiration_date);
            const now = new Date();
            const timeUntilExpiry = expDate - now;
            const currentDay = Math.round(timeUntilExpiry / oneDayMs);
            const today = now.toISOString().split('T')[0];
            
            for (const days of reminderDays) {
                if (timeUntilExpiry <= 0 || currentDay !== days) {
                    continue;
                }
                
                const memKey = `${vm.vm_id}-${days}-${today}`;
                if (reminderSentTracker.has(memKey)) {
                    continue;
                }
                
                const existingReminders = await db.vms.reminders.getByVmId(vm.id);
                if (existingReminders.find(r => r.days === days && r.sent_at?.startsWith(today))) {
                    continue;
                }
                
                const user = allUsers.find(u => u.id === vm.user_id);
                if (!user || !user.email || !user.emailVerified) {
                    continue;
                }
                
                try {
                    const emailContent = `
                        <p>您好 <strong>${user.username}</strong>，</p>
                        <div class="warning-box">
                            <p style="margin-bottom: 0;">
                                您的虚拟机将在 <strong style="font-size: 18px;">${days} 天</strong> 后到期！
                            </p>
                        </div>
                        <div class="info-box">
                            <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                            <p style="margin-bottom: 4px;">名称：${vm.name || 'VM ' + vm.vm_id}</p>
                            <p style="margin-bottom: 4px;">VMID：${vm.vm_id}</p>
                            <p style="margin-bottom: 4px;">到期时间：${expDate.toLocaleString('zh-CN')}</p>
                            ${vm.renewal_price ? `<p style="margin-bottom: 0;">续费价格：${vm.renewal_price}</p>` : ''}
                        </div>
                        <div class="divider"></div>
                        <p>请及时续费或联系管理员，以免影响您的使用！</p>
                    `;
                    await sendEmail(user.email, '虚拟机到期提醒', createEmailTemplate(`虚拟机将在${days}天后到期`, emailContent));
                    
                    reminderSentTracker.set(memKey, true);
                    await db.vms.reminders.add(vm.id, days);
                    await db.vms.update(vm.id, { lastReminderDate: today });
                    
                    dbg(`已向 ${user.username} 发送虚拟机到期提醒（VM ${vm.vm_id}，${days}天前）`);
                    
                    try {
                        await db.messages.create({
                            uid: user.id,
                            title: `虚拟机即将到期提醒`,
                            content: `您的虚拟机 ${vm.name || 'VM ' + vm.vm_id} 将在 ${days} 天后到期！\n到期时间：${expDate.toLocaleString('zh-CN')}${vm.renewal_price ? '\n续费价格：' + vm.renewal_price : ''}\n请及时续费，以免影响使用。`,
                            type: 3,
                            send_type: 1,
                            link_url: '',
                            link_text: '立即续费'
                        });
                    } catch (e) {}
                } catch (error) {
                    console.error('发送到期提醒失败:', error.message);
                }
            }
            
            if (currentDay > Math.max(...reminderDays, 0) + 1) {
                for (const key of reminderSentTracker.keys()) {
                    if (key.startsWith(`${vm.vm_id}-`) && !key.startsWith(`expired-${vm.vm_id}-`)) {
                        reminderSentTracker.delete(key);
                    }
                }
                await db.vms.reminders.clear(vm.id);
                await db.vms.update(vm.id, { lastReminderDate: '' });
            }
            
            if (expDate < now) {
                const expiredMemKey = `expired-${vm.vm_id}-${today}`;
                const todayExpiredInDb = (await db.vms.reminders.getByVmId(vm.id))
                    .filter(r => r.days === 0 && r.sent_at?.startsWith(today));
                const expiredDaysCount = await db.vms.reminders.countExpiredDays(vm.id);
                const alreadySentToday = reminderSentTracker.has(expiredMemKey) || todayExpiredInDb.length > 0;
                
                if (!alreadySentToday && expiredDaysCount < 3) {
                    const user = allUsers.find(u => u.id === vm.user_id);
                    if (user && user.email && user.emailVerified) {
                        try {
                            const dayNum = expiredDaysCount + 1;
                            const remainingDays = 3 - dayNum;
                            const emailContent = `
                                <p>您好 <strong>${user.username}</strong>，</p>
                                <div class="warning-box">
                                    <p style="margin-bottom: 0; font-size: 16px;">
                                        ⚠️ 您的虚拟机 <strong>已到期</strong>！
                                    </p>
                                </div>
                                <div class="info-box">
                                    <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                                    <p style="margin-bottom: 4px;">名称：${vm.name || 'VM ' + vm.vm_id}</p>
                                    <p style="margin-bottom: 4px;">VMID：${vm.vm_id}</p>
                                    <p style="margin-bottom: 4px;">到期时间：${expDate.toLocaleString('zh-CN')}</p>
                                    ${vm.renewal_price ? `<p style="margin-bottom: 0;">续费价格：${vm.renewal_price}</p>` : ''}
                                </div>
                                <div class="divider"></div>
                                <div class="warning-box">
                                    <p style="margin-bottom: 0;">
                                        续费提醒（${dayNum}/3）— 数据保留还剩 <strong style="color: #ed6463; font-size: 18px;">${remainingDays} 天</strong>，请尽快续费，以免数据丢失！
                                    </p>
                                </div>
                                <p style="margin-top: 16px;">如有问题，请联系管理员。</p>
                            `;
                            await sendEmail(user.email, '虚拟机已到期 - 请及时续费', createEmailTemplate('虚拟机已到期', emailContent));
                            reminderSentTracker.set(expiredMemKey, true);
                            await db.vms.reminders.add(vm.id, 0);
                            dbg(`已向 ${user.username} 发送虚拟机到期续费提醒（VM ${vm.vm_id}，第${dayNum}/3天）`);
                            
                            try {
                                const remainingDays = 3 - expiredDaysCount > 0 ? 3 - expiredDaysCount : 0;
                                await db.messages.create({
                                    uid: user.id,
                                    title: `虚拟机已到期 - 请及时续费`,
                                    content: `您的虚拟机 ${vm.name || 'VM ' + vm.vm_id} 已到期！\n续费提醒（${dayNum}/3）— 数据保留还剩 ${remainingDays} 天，请尽快续费，以免数据丢失！`,
                                    type: 3,
                                    send_type: 1
                                });
                            } catch (e) {}
                        } catch (error) {
                            console.error('发送到期续费提醒失败:', error.message);
                        }
                    }
                }
                
                try {
                    const status = await pveApi.getVmStatus(vm.vm_id);
                    if (status.status === 'running') {
                        await pveApi.shutdownVm(vm.vm_id);
                    }
                } catch (error) {
                    console.error(`处理虚拟机 ${vm.vm_id} 失败:`, error.message);
                    if (error.response) {
                        console.error('错误详情:', error.response.data);
                    }
                }
            }
        }
    } finally {
        isCheckingExpired = false;
    }
};

async function checkExpiredLxc() {
    try {
        const allCts = await db.lxcContainers.getAll();
        const reminderCfg = await db.config.getReminder();
        const today = new Date();

        for (const ct of allCts) {
            if (!ct.expiration_date) continue;
            const expDate = new Date(ct.expiration_date);
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));
            const diffMs = expDate - today;

            if (diffMs > 0) {
                const reminderDays = [reminderCfg.days1, reminderCfg.days2, reminderCfg.days3].filter(d => d > 0);
                for (const days of reminderDays) {
                    if (diffDays === days) {
                        const existing = (await db.lxcContainers.reminders.getTodayAll()).filter(r => r.ct_id === ct.id && r.days === days);
                        if (existing.length === 0) {
                            await db.lxcContainers.reminders.add(ct.id, days);
                            try {
                                const user = await db.users.getById(ct.user_id);
                                if (user && user.email && user.emailVerified) {
                                    try {
                                        const emailContent = `
                                            <p>您好 <strong>${user.username}</strong>，</p>
                                            <div class="warning-box">
                                                <p style="margin-bottom: 0;">
                                                    您的 LXC 容器将在 <strong style="font-size: 18px;">${days} 天</strong> 后到期！
                                                </p>
                                            </div>
                                            <div class="info-box">
                                                <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                                                <p style="margin-bottom: 4px;">名称：${ct.name || 'CT ' + ct.ct_id}</p>
                                                <p style="margin-bottom: 4px;">CT ID：${ct.ct_id}</p>
                                                <p style="margin-bottom: 4px;">到期时间：${expDate.toLocaleString('zh-CN')}</p>
                                                ${ct.renewal_price ? `<p style="margin-bottom: 0;">续费价格：${ct.renewal_price}</p>` : ''}
                                            </div>
                                            <div class="divider"></div>
                                            <p>请及时续费或联系管理员，以免影响您的使用！</p>
                                        `;
                                        await sendEmail(user.email, 'LXC 容器到期提醒', createEmailTemplate(`LXC 容器将在${days}天后到期`, emailContent));
                                    } catch (e) {
                                        console.error('发送 LXC 到期提醒邮件失败:', e.message);
                                    }
                                }
                                await db.messages.create({
                                    uid: ct.user_id,
                                    title: 'LXC 容器到期提醒',
                                    content: `您的 LXC 容器 ${ct.name || 'CT ' + ct.ct_id} 将在 ${days} 天后到期（${expDate.toLocaleString('zh-CN')}），请及时续费。`,
                                    type: 1,
                                    send_type: 1
                                });
                            } catch (e) {}
                        }
                    }
                }
            } else {
                const expiredDays = await db.lxcContainers.reminders.countExpiredDays(ct.id);
                if (expiredDays < 3) {
                    const todaySent = (await db.lxcContainers.reminders.getTodayExpired()).some(r => r.ct_id === ct.id);
                    if (!todaySent) {
                        await db.lxcContainers.reminders.add(ct.id, 0);
                        try {
                            const user = await db.users.getById(ct.user_id);
                            if (user && user.email && user.emailVerified) {
                                try {
                                    const dayNum = expiredDays + 1;
                                    const remainingDays = 3 - dayNum;
                                    const emailContent = `
                                        <p>您好 <strong>${user.username}</strong>，</p>
                                        <div class="warning-box">
                                            <p style="margin-bottom: 0; font-size: 16px;">
                                                ⚠️ 您的 LXC 容器 <strong>已到期</strong>！
                                            </p>
                                        </div>
                                        <div class="info-box">
                                            <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                                            <p style="margin-bottom: 4px;">名称：${ct.name || 'CT ' + ct.ct_id}</p>
                                            <p style="margin-bottom: 4px;">CT ID：${ct.ct_id}</p>
                                            <p style="margin-bottom: 4px;">到期时间：${expDate.toLocaleString('zh-CN')}</p>
                                            ${ct.renewal_price ? `<p style="margin-bottom: 0;">续费价格：${ct.renewal_price}</p>` : ''}
                                        </div>
                                        <div class="divider"></div>
                                        <div class="warning-box">
                                            <p style="margin-bottom: 0;">
                                                续费提醒（${dayNum}/3）— 数据保留还剩 <strong style="color: #ed6463; font-size: 18px;">${remainingDays} 天</strong>，请尽快续费，以免数据丢失！
                                            </p>
                                        </div>
                                        <p style="margin-top: 16px;">如有问题，请联系管理员。</p>
                                    `;
                                    await sendEmail(user.email, 'LXC 容器已到期 - 请及时续费', createEmailTemplate('LXC 容器已到期', emailContent));
                                } catch (e) {
                                    console.error('发送 LXC 到期续费邮件失败:', e.message);
                                }
                            }
                            await db.messages.create({
                                uid: ct.user_id,
                                title: 'LXC 容器已到期',
                                content: `您的 LXC 容器 ${ct.name || 'CT ' + ct.ct_id} 已到期，请尽快续费（${ct.renewal_price ? '续费价格：' + ct.renewal_price : ''}）。数据保留 ${3 - expiredDays - 1} 天。`,
                                type: 1,
                                send_type: 1
                            });
                        } catch (e) {}
                    }
                }

                try {
                    const status = await pveApi.getLxcStatus(ct.ct_id);
                    if (status.status === 'running') {
                        await pveApi.stopLxc(ct.ct_id);
                        console.log(`[LXC到期] 已自动关机 CT ${ct.ct_id} (${ct.name || ''})`);
                    }
                } catch (e) {
                    console.error(`自动关机 LXC ${ct.ct_id} 失败:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('检查 LXC 容器到期错误:', e.message);
    }
}

module.exports = { loadSentRemindersFromDb, checkExpiredVms, checkExpiredLxc };
