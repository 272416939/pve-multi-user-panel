// server/services/cdk.js - CDK 兑换码业务服务
// 规范第七节：业务编排进 services/，路由只做参数校验、限速与响应组装
// 从 routes/cdk.js 抽取：用户兑换（/user/cdk/redeem）、管理端批量生成（/admin/cdk/batch-generate）

const crypto = require('crypto');
const db = require('../api/db');
const { generateUniqueCdkCode } = require('../utils/cdk-generator');
const { shouldSendEmail } = require('../utils/email');
const { sendTemplateEmail } = require('./email-template');
const { formatLocalDate } = require('../utils/date');
const pveApi = require('../api/pve-api');
const dbg = require('../utils/debug');

/**
 * CDK 兑换（VM/LXC 续费）
 * 原 routes/cdk.js /user/cdk/redeem 业务：查码 -> 有效期/归属校验 -> CAS 防并发 -> 延长到期 -> 自动开机 -> 通知
 * 返回 { ok: true, data: { message, new_expiration_date } } 或 { ok: false, status, error }
 * @param {object} opts - { userId, code, vmId, containerId }
 */
async function redeemCdk(opts) {
    var { userId, code, vm_id, container_id, req } = opts;

    if (!code || (!vm_id && !container_id)) {
        return { ok: false, status: 400, error: '请提供 CDK 码和虚拟机/容器' };
    }

    // 查找 CDK
    var cdk = await db.cdk.getByCode(code.trim().toUpperCase());
    if (!cdk) {
        return { ok: false, status: 400, error: 'CDK 码不存在' };
    }

    // 检查有效期
    if (cdk.expires_at && new Date(cdk.expires_at) <= new Date()) {
        return { ok: false, status: 400, error: '该 CDK 已过期' };
    }

    // 检查分配限制：指定用户的 CDK 仅允许该用户使用
    if (cdk.target_user_id && cdk.target_user_id !== userId) {
        return { ok: false, status: 403, error: '该 CDK 已被指定给其他用户，无法使用' };
    }

    // L-2 修复：先校验目标资源存在与归属，再 CAS 标记（防止对他人资源兑换导致 CDK 被烧毁）
    // L-9 修复：续费总时长上限（防无限叠加，上限 10 年），超限在消耗 CDK 前拒绝
    const MAX_CDK_RENEWAL_DAYS = 3650;
    var targetName, targetId, targetType, renewalPrice, newExpirationDate;
    if (container_id) {
        var ct = await db.lxcContainers.getById(parseInt(container_id));
        if (!ct) {
            return { ok: false, status: 404, error: 'LXC 容器不存在' };
        }

        if (ct.user_id !== userId) {
            return { ok: false, status: 403, error: '无权操作此容器' };
        }

        targetType = 'lxc';
        targetId = ct.id;
        targetName = ct.name || 'CT ' + ct.ct_id;
        renewalPrice = ct.renewal_price;

        // 计算新的到期时间
        var currentExp = ct.expiration_date ? new Date(ct.expiration_date) : null;
        var now = new Date();
        var baseDate = currentExp && currentExp > now ? currentExp : now;
        newExpirationDate = new Date(baseDate.getTime() + cdk.duration_days * 24 * 60 * 60 * 1000);
        var hardCap = new Date(now.getTime() + MAX_CDK_RENEWAL_DAYS * 24 * 60 * 60 * 1000);
        if (newExpirationDate > hardCap) {
            return { ok: false, status: 400, error: `续费后到期时间超过上限（${Math.floor(MAX_CDK_RENEWAL_DAYS / 365)} 年），无法兑换` };
        }
    } else {
        var vm = await db.vms.getById(parseInt(vm_id));
        if (!vm) {
            return { ok: false, status: 404, error: '虚拟机不存在' };
        }

        if (vm.user_id !== userId) {
            return { ok: false, status: 403, error: '无权操作此虚拟机' };
        }

        targetType = 'vm';
        targetId = vm.id;
        targetName = vm.name || 'VM ' + vm.vm_id;
        renewalPrice = vm.renewal_price;

        // 计算新的到期时间 + 上限检查
        var currentExp2 = vm.expiration_date ? new Date(vm.expiration_date) : null;
        var now2 = new Date();
        var baseDate2 = currentExp2 && currentExp2 > now2 ? currentExp2 : now2;
        newExpirationDate = new Date(baseDate2.getTime() + cdk.duration_days * 24 * 60 * 60 * 1000);
        var hardCap2 = new Date(now2.getTime() + MAX_CDK_RENEWAL_DAYS * 24 * 60 * 60 * 1000);
        if (newExpirationDate > hardCap2) {
            return { ok: false, status: 400, error: `续费后到期时间超过上限（${Math.floor(MAX_CDK_RENEWAL_DAYS / 365)} 年），无法兑换` };
        }
    }

    // 原子 CAS 操作防并发重复兑换（归属校验通过后才消耗 CDK）
    var markResult = await db.cdk.markAsUsed(cdk.id, userId, vm_id ? parseInt(vm_id) : null, container_id ? parseInt(container_id) : null);
    if (markResult.affected === 0) {
        return { ok: false, status: 400, error: 'CDK 已被使用或无效' };
    }

    if (container_id) {
        // 更新容器到期时间
        await db.lxcContainers.update(targetId, {
            expiration_date: formatLocalDate(newExpirationDate),
            reminderSent: false,
            lastReminderDate: ''
        });
        await db.lxcContainers.reminders.clear(targetId);

        // 续费后尝试自动开机
        try {
            var currentStatus = await pveApi.getLxcStatus(ct.ct_id);
            if (currentStatus && currentStatus.status === 'stopped') {
                await pveApi.startLxc(ct.ct_id);
                dbg(`LXC 容器 ${ct.ct_id} 已自动开机（CDK 续费后）`);
            }
        } catch (startError) {
            console.error(`LXC 容器 ${ct.ct_id} 自动开机失败:`, startError.message);
        }

        // 发送通知
        var redeemer = await db.users.getById(userId);
        if (redeemer && redeemer.email && redeemer.emailVerified) {
            if (await shouldSendEmail(redeemer.id, 'notify_recharge')) {
                try {
                    var durationStr = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                    // CDK 续费成功（LXC，模板: cdk_renewal_lxc）
                    await sendTemplateEmail(redeemer.email, 'cdk_renewal_lxc', {
                        username: redeemer.username,
                        resource_name: targetName,
                        resource_id: ct.ct_id,
                        duration: durationStr,
                        renewal_price: renewalPrice,
                        new_expire_time: newExpirationDate.toLocaleString('zh-CN')
                    });
                } catch (emailError) {
                    console.error('发送 CDK 续费成功邮件失败:', emailError.message);
                }
            }
        }

        try {
            var durationStr2 = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
            await db.messages.create({
                uid: redeemer.id,
                title: 'CDK 续费成功',
                content: `您的 LXC 容器 ${targetName} 已成功续费 ${durationStr2}！\n新到期时间：${newExpirationDate.toLocaleString('zh-CN')}`,
                type: 2,
                send_type: 1
            });
        } catch (e) {}

        // 审计日志（action 复用 lxc.renew，归"新购/续费"分类；失败不阻断主流程）
        try {
            var { auditAction } = require('../utils/audit-log');
            await auditAction(req, 'lxc.renew', 'CDK兑换续费LXC容器[' + targetName + '] ' + cdk.duration_days + '天，新到期时间' + newExpirationDate.toLocaleString('zh-CN'), { resourceType: 'lxc', resourceId: targetId });
        } catch (auditErr) { console.error('[cdk] 兑换审计日志失败:', auditErr.message); }

        return {
            ok: true,
            data: {
                message: `兑换成功！LXC 容器到期时间已延长 ${cdk.duration_days} 天`,
                new_expiration_date: formatLocalDate(newExpirationDate)
            }
        };
    }

    // ===== 虚拟机续费 =====
    var vm = await db.vms.getById(parseInt(vm_id));
    if (!vm) {
        return { ok: false, status: 404, error: '虚拟机不存在' };
    }

    if (vm.user_id !== userId) {
        return { ok: false, status: 403, error: '无权操作此虚拟机' };
    }

    targetType = 'vm';
    targetId = vm.id;
    targetName = vm.name || 'VM ' + vm.vm_id;
    renewalPrice = vm.renewal_price;

    // 更新虚拟机到期时间（newExpirationDate 已在归属校验阶段计算并过上限检查）
    await db.vms.update(vm.id, {
        expiration_date: formatLocalDate(newExpirationDate),
        reminderSent: false,
        lastReminderDate: ''
    });
    await db.vms.reminders.clear(vm.id);

    // 发送续费成功邮件和站内信
    var redeemer2 = await db.users.getById(userId);
    if (redeemer2 && redeemer2.email && redeemer2.emailVerified) {
        if (await shouldSendEmail(redeemer2.id, 'notify_recharge')) {
            try {
                var durationStr3 = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                // CDK 续费成功（VM，模板: cdk_renewal_vm）
                await sendTemplateEmail(redeemer2.email, 'cdk_renewal_vm', {
                    username: redeemer2.username,
                    resource_name: targetName,
                    resource_id: vm.vm_id,
                    duration: durationStr3,
                    renewal_price: renewalPrice,
                    new_expire_time: newExpirationDate.toLocaleString('zh-CN')
                });
            } catch (emailError) {
                console.error('发送 CDK 续费成功邮件失败:', emailError.message);
            }
        }
    }

    try {
        var durationStr4 = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
        await db.messages.create({
            uid: redeemer2.id,
            title: 'CDK 续费成功',
            content: `您的虚拟机 ${targetName} 已成功续费 ${durationStr4}！\n新到期时间：${newExpirationDate.toLocaleString('zh-CN')}`,
            type: 2,
            send_type: 1
        });
    } catch (e) {}

    // 虚拟机之前可能因到期被关机，尝试自动开机
    try {
        var currentStatus2 = await pveApi.getVmStatus(vm.vm_id);
        if (currentStatus2 && currentStatus2.status === 'stopped') {
            await pveApi.startVm(vm.vm_id);
            dbg(`虚拟机 ${vm.vm_id} 已自动开机（CDK 续费后）`);
        }
    } catch (startError) {
        console.error(`虚拟机 ${vm.vm_id} 自动开机失败:`, startError.message);
    }

    // 审计日志（action 复用 vm.renew，归"新购/续费"分类；失败不阻断主流程）
    try {
        var { auditAction } = require('../utils/audit-log');
        await auditAction(req, 'vm.renew', 'CDK兑换续费虚拟机[' + targetName + '] ' + cdk.duration_days + '天，新到期时间' + newExpirationDate.toLocaleString('zh-CN'), { resourceType: 'vm', resourceId: targetId });
    } catch (auditErr) { console.error('[cdk] 兑换审计日志失败:', auditErr.message); }

    return {
        ok: true,
        data: {
            message: `兑换成功！虚拟机到期时间已延长 ${cdk.duration_days} 天`,
            new_expiration_date: formatLocalDate(newExpirationDate)
        }
    };
}

/**
 * 管理端批量生成 CDK（可选指定目标用户，生成后逐用户发送站内信+邮件通知）
 * 原 routes/cdk.js /admin/cdk/batch-generate 业务。
 * @param {object} opts - { durationDays, count, expiresAt, targetUserIds, createdBy }
 * @returns {Promise<{ok: boolean, status?: number, error?: string, data?: object}>}
 */
async function batchGenerateCdk(opts) {
    var { duration_days, count, expires_at, target_user_ids, created_by } = opts;

    if (!duration_days || duration_days < 1) {
        return { ok: false, status: 400, error: '请提供有效的续费天数' };
    }

    // 解析目标用户列表
    var targetUserIds = Array.isArray(target_user_ids) ? target_user_ids.filter(id => id).map(id => parseInt(id)) : [];
    var targetUsers = [];
    for (var uid of targetUserIds) {
        var user = await db.users.getById(uid);
        if (!user) {
            return { ok: false, status: 400, error: `用户 ID ${uid} 不存在` };
        }
        targetUsers.push(user);
    }

    var targetNum = Math.min(Math.max(parseInt(count) || 1, 1), 1000);
    // 选中用户时，每人自动生成一个 CDK
    var num = targetUsers.length > 0 ? targetUsers.length : targetNum;
    var batchId = `BATCH-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    var createdCdkCodes = [];

    // 生成 CDK，轮询分配给多用户
    for (var i = 0; i < num; i++) {
        var code = await generateUniqueCdkCode();
        var assignedUserId = targetUsers.length > 0 ? targetUsers[i % targetUsers.length].id : null;
        var newCdk = await db.cdk.create({
            code,
            duration_days: parseInt(duration_days),
            created_by: created_by,
            target_user_id: assignedUserId,
            expires_at: expires_at || null,
            batch_id: batchId
        });
        createdCdkCodes.push(newCdk);
    }

    // 为每个 CDK 附加 target_username
    var userMap = {};
    for (var u of targetUsers) {
        userMap[u.id] = u.username;
    }
    var enrichedCodes = createdCdkCodes.map(cdk => ({
        ...cdk,
        target_username: cdk.target_user_id ? (userMap[cdk.target_user_id] || null) : null
    }));

    // 按用户分组发送通知
    if (targetUsers.length > 0) {
        var durationStr = duration_days >= 365 ? `${Math.floor(duration_days / 365)}年` : `${duration_days}天`;
        var expiryStr = expires_at ? new Date(expires_at).toLocaleString('zh-CN') : '永久有效';

        // 按用户分组
        var userCdkMap = {};
        for (var cdk2 of createdCdkCodes) {
            if (!cdk2.target_user_id) continue;
            if (!userCdkMap[cdk2.target_user_id]) userCdkMap[cdk2.target_user_id] = [];
            userCdkMap[cdk2.target_user_id].push(cdk2);
        }

        for (var [uid2, cdkList] of Object.entries(userCdkMap)) {
            var parsedUid = parseInt(uid2);
            var targetUser = targetUsers.find(u => u.id === parsedUid);
            if (!targetUser) continue;

            var userCount = cdkList.length;
            var codeListStr = userCount <= 5 ? '\n\n兑换码：\n' + cdkList.map(c => c.code).join('\n') : '';

            // 发送站内消息
            try {
                await db.messages.create({
                    uid: parsedUid,
                    title: '您收到 CDK 兑换码',
                    content: `${userCount > 1 ? `为您生成了 ${userCount} 张 CDK 兑换码` : '为您生成了一张 CDK 兑换码'}${codeListStr}\n续费时长：${durationStr}\n有效期至：${expiryStr}\n\n请前往「我的虚拟机」页面点击「CDK 兑换」输入此码进行续费。`,
                    type: 2,
                    send_type: 2,
                    link_url: '',
                    link_text: '去兑换'
                });
            } catch (e) {}

            // 发送邮件通知（模板: cdk_gift；cdk_list 为空时模板行自动折叠）
            if (targetUser.email && targetUser.emailVerified) {
                if (await shouldSendEmail(parsedUid, 'notify_recharge')) {
                    try {
                        await sendTemplateEmail(targetUser.email, 'cdk_gift', {
                            username: targetUser.username,
                            cdk_count: userCount,
                            duration: durationStr,
                            expire_time: expiryStr,
                            cdk_list: userCount <= 5 ? '<p style="margin-bottom: 4px;">兑换码：<br>' + cdkList.map(function (c) { return c.code; }).join('<br>') + '</p>' : ''
                        });
                    } catch (emailError) {
                        console.error(`发送 CDK 分配邮件给 ${targetUser.username} 失败:`, emailError.message);
                    }
                }
            }
        }
    }

    return {
        ok: true,
        data: {
            batch_id: batchId,
            count: enrichedCodes.length,
            codes: enrichedCodes,
            target_users: targetUsers.map(u => ({ id: u.id, username: u.username }))
        }
    };
}

module.exports = { redeemCdk, batchGenerateCdk };
