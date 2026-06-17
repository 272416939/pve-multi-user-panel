const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { generateUniqueCdkCode } = require('../utils/cdk-generator');
const getSiteUrl = require('../utils/site-url');
const { createEmailTemplate, sendEmail } = require('../utils/email');
// H-9 修复：生产环境隐藏详细错误信息
function safeError(e) {
    const isDebug = process.env.DEBUG === 'true';
    if (isDebug) return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}

const { checkRateLimit } = require('../middleware/rate-limiter');
const pveApi = require('../api/pve-api');
const dbg = require('../utils/debug');

async function checkCdkRateLimit(userId, ip) {
    return checkRateLimit(`ratelimit:cdk:${userId}:${ip}`, 5, 60000);
}

router.post('/admin/cdk/generate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { duration_days, expires_at } = req.body;
 
        if (!duration_days || duration_days < 1) {
            return res.status(400).json({ error: '请提供有效的续费天数' });
        }
 
        const code = await generateUniqueCdkCode();
        const newCdk = await db.cdk.create({
            code,
            duration_days: parseInt(duration_days),
            created_by: req.user.id,
            expires_at: expires_at || null
        });
 
        res.json(newCdk);
    } catch (error) {
        console.error('生成 CDK 失败:', error);
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/admin/cdk/batch-generate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { duration_days, count, expires_at, target_user_ids } = req.body;
 
        if (!duration_days || duration_days < 1) {
            return res.status(400).json({ error: '请提供有效的续费天数' });
        }
 
        // 解析目标用户列表
        const targetUserIds = Array.isArray(target_user_ids) ? target_user_ids.filter(id => id).map(id => parseInt(id)) : [];
        const targetUsers = [];
        for (const uid of targetUserIds) {
            const user = await db.users.getById(uid);
            if (!user) {
                return res.status(400).json({ error: `用户 ID ${uid} 不存在` });
            }
            targetUsers.push(user);
        }
 
        const targetNum = Math.min(Math.max(parseInt(count) || 1, 1), 1000);
        // 选中用户时，每人自动生成一个 CDK
        const num = targetUsers.length > 0 ? targetUsers.length : targetNum;
        const batchId = `BATCH-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const createdCdkCodes = [];
 
        // 生成 CDK，轮询分配给多用户
        for (let i = 0; i < num; i++) {
            const code = await generateUniqueCdkCode();
            const assignedUserId = targetUsers.length > 0 ? targetUsers[i % targetUsers.length].id : null;
            const newCdk = await db.cdk.create({
                code,
                duration_days: parseInt(duration_days),
                created_by: req.user.id,
                target_user_id: assignedUserId,
                expires_at: expires_at || null,
                batch_id: batchId
            });
            createdCdkCodes.push(newCdk);
        }
 
        // 为每个 CDK 附加 target_username
        const userMap = {};
        for (const u of targetUsers) {
            userMap[u.id] = u.username;
        }
        const enrichedCodes = createdCdkCodes.map(cdk => ({
            ...cdk,
            target_username: cdk.target_user_id ? (userMap[cdk.target_user_id] || null) : null
        }));
 
        // 按用户分组发送通知
        if (targetUsers.length > 0) {
            const durationStr = duration_days >= 365 ? `${Math.floor(duration_days / 365)}年` : `${duration_days}天`;
            const expiryStr = expires_at ? new Date(expires_at).toLocaleString('zh-CN') : '永久有效';
 
            // 按用户分组
            const userCdkMap = {};
            for (const cdk of createdCdkCodes) {
                if (!cdk.target_user_id) continue;
                if (!userCdkMap[cdk.target_user_id]) userCdkMap[cdk.target_user_id] = [];
                userCdkMap[cdk.target_user_id].push(cdk);
            }
 
            for (const [uid, cdkList] of Object.entries(userCdkMap)) {
                const parsedUid = parseInt(uid);
                const user = targetUsers.find(u => u.id === parsedUid);
                if (!user) continue;
 
                const userCount = cdkList.length;
                const codeListStr = userCount <= 5 ? '\n\n兑换码：\n' + cdkList.map(c => c.code).join('\n') : '';
 
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
 
                // 发送邮件通知
                if (user.email && user.emailVerified) {
                    try {
                        const emailContent = `
                            <p>您好 <strong>${user.username}</strong>，</p>
                            <div class="info-box" style="border-left-color: #48bb78;">
                                <p style="margin-bottom: 8px; font-size: 16px;">
                                    ${userCount > 1 ? `为您生成了 ${userCount} 张 CDK 兑换码` : '为您生成了一张 CDK 兑换码'}
                                </p>
                            </div>
                            <div class="info-box">
                                <p style="margin-bottom: 8px;"><strong>CDK 详情：</strong></p>
                                <p style="margin-bottom: 4px;">续费时长：${durationStr}</p>
                                <p style="margin-bottom: 4px;">有效期至：${expiryStr}</p>
                                ${userCount <= 5 ? `<p style="margin-bottom: 4px;">兑换码：<br>${cdkList.map(c => c.code).join('<br>')}</p>` : ''}
                            </div>
                            <div class="divider"></div>
                            <p>请前往「我的虚拟机」页面点击「CDK 兑换」输入兑换码进行续费。</p>
                        `;
                        await sendEmail(
                            user.email,
                            '您收到 CDK 兑换码 - PVE 管理面板',
                            createEmailTemplate('CDK 兑换码通知', emailContent)
                        );
                    } catch (emailError) {
                        console.error(`发送 CDK 分配邮件给 ${user.username} 失败:`, emailError.message);
                    }
                }
            }
        }
 
        res.json({
            batch_id: batchId,
            count: enrichedCodes.length,
            codes: enrichedCodes,
            target_users: targetUsers.map(u => ({ id: u.id, username: u.username }))
        });
    } catch (error) {
        console.error('批量生成 CDK 失败:', error);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/admin/cdk/list', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const cdkList = await db.cdk.getAll();
        res.json(cdkList);
    } catch (error) {
        console.error('获取 CDK 列表失败:', error);
        res.status(500).json({ error: '获取 CDK 列表失败' });
    }
});

router.get('/admin/cdk/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { batch_id } = req.query;
        let cdkList;
        
        if (batch_id) {
            cdkList = await db.cdk.getByBatchId(batch_id);
        } else {
            cdkList = await db.cdk.getAll();
        }
 
        // 构建 CSV
        const headers = '兑换码,续费天数,批次号,分配用户,创建时间,有效期,状态,使用用户,使用VM,使用时间';
        const rows = cdkList.map(c => {
            const status = c.is_used ? '已使用' : (c.expires_at && new Date(c.expires_at) <= new Date() ? '已过期' : '未使用');
            const usedUser = c.used_username || '';
            const usedVm = c.used_vm_name || (c.used_vm_vmid ? 'VM ' + c.used_vm_vmid : '');
            return [
                c.code,
                c.duration_days,
                c.batch_id || '',
                c.target_username || '',
                c.created_at,
                c.expires_at || '',
                status,
                usedUser,
                usedVm,
                c.used_at || ''
            ].join(',');
        });
 
        const csv = '\uFEFF' + headers + '\n' + rows.join('\n');
 
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=cdk-codes-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('导出 CDK 失败:', error);
        res.status(500).json({ error: '导出 CDK 失败' });
    }
});

router.delete('/admin/cdk/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const cdk = await db.cdk.getById(id);
        
        if (!cdk) {
            return res.status(404).json({ error: 'CDK 不存在' });
        }
 
        await db.cdk.delete(id);
        res.json({ message: 'CDK 删除成功' });
    } catch (error) {
        console.error('删除 CDK 失败:', error);
        res.status(500).json({ error: '删除 CDK 失败' });
    }
});

router.post('/admin/cdk/cleanup', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.cdk.deleteExpiredOrUsed();
        res.json({ message: '清理完成', deleted: result.changes });
    } catch (error) {
        console.error('清理 CDK 失败:', error);
        res.status(500).json({ error: '清理 CDK 失败' });
    }
});

router.post('/admin/cdk/batch-delete', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '请提供要删除的 CDK ID 列表' });
        }
        await db.cdk.deleteBatch(ids.map(id => parseInt(id)));
        res.json({ message: `成功删除 ${ids.length} 个 CDK` });
    } catch (error) {
        console.error('批量删除 CDK 失败:', error);
        res.status(500).json({ error: '批量删除 CDK 失败' });
    }
});

router.get('/user/cdk/redeemable-vms', authMiddleware, async (req, res) => {
    try {
        let userVms;
        userVms = await db.vms.getByUserId(req.user.id);
        
        const vmsWithDetails = [];
        for (const vm of userVms) {
            try {
                const status = await pveApi.getVmStatus(vm.vm_id);
                vmsWithDetails.push({
                    id: vm.id,
                    vm_id: vm.vm_id,
                    name: vm.name || 'VM ' + vm.vm_id,
                    expiration_date: vm.expiration_date,
                    status: status?.status
                });
            } catch (error) {
                vmsWithDetails.push({
                    id: vm.id,
                    vm_id: vm.vm_id,
                    name: vm.name || 'VM ' + vm.vm_id,
                    expiration_date: vm.expiration_date,
                    status: null
                });
            }
        }
        
        res.json(vmsWithDetails);
    } catch (error) {
        res.status(500).json({ error: '获取虚拟机列表失败' });
    }
});

router.post('/user/cdk/redeem', authMiddleware, async (req, res) => {
    try {
        if (!(await checkCdkRateLimit(req.user.id, req.ip)).allowed) {
            return res.status(429).json({ error: 'CDK 兑换操作过于频繁，请稍后再试' });
        }

        const { code, vm_id, container_id } = req.body;
 
        if (!code || (!vm_id && !container_id)) {
            return res.status(400).json({ error: '请提供 CDK 码和虚拟机/容器' });
        }
 
        // 查找 CDK
        const cdk = await db.cdk.getByCode(code.trim().toUpperCase());
        if (!cdk) {
            return res.status(400).json({ error: 'CDK 码不存在' });
        }

        // 检查有效期
        if (cdk.expires_at && new Date(cdk.expires_at) <= new Date()) {
            return res.status(400).json({ error: '该 CDK 已过期' });
        }

        // 检查分配限制：指定用户的 CDK 仅允许该用户使用
        if (cdk.target_user_id && cdk.target_user_id !== req.user.id) {
            return res.status(403).json({ error: '该 CDK 已被指定给其他用户，无法使用' });
        }

        // 原子 CAS 操作防并发重复兑换
        const markResult = await db.cdk.markAsUsed(cdk.id, req.user.id, vm_id ? parseInt(vm_id) : null, container_id ? parseInt(container_id) : null);
        if (markResult.affected === 0) {
            return res.status(400).json({ error: 'CDK 已被使用或无效' });
        }

        let targetName, targetId, targetType, renewalPrice;

        if (container_id) {
            const ct = await db.lxcContainers.getById(parseInt(container_id));
            if (!ct) {
                return res.status(404).json({ error: 'LXC 容器不存在' });
            }
 
            if (ct.user_id !== req.user.id) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
 
            targetType = 'lxc';
            targetId = ct.id;
            targetName = ct.name || 'CT ' + ct.ct_id;
            renewalPrice = ct.renewal_price;
 
            // 计算新的到期时间
            let newExpirationDate;
            if (ct.expiration_date) {
                const currentExp = new Date(ct.expiration_date);
                const now = new Date();
                const baseDate = currentExp > now ? currentExp : now;
                newExpirationDate = new Date(baseDate.getTime() + cdk.duration_days * 24 * 60 * 60 * 1000);
            } else {
                newExpirationDate = new Date(Date.now() + cdk.duration_days * 24 * 60 * 60 * 1000);
            }
 
            // 更新容器到期时间
            await db.lxcContainers.update(targetId, {
                expiration_date: newExpirationDate.toISOString(),
                reminderSent: false,
                lastReminderDate: ''
            });
            await db.lxcContainers.reminders.clear(targetId);
 
            // 续费后尝试自动开机
            try {
                const currentStatus = await pveApi.getLxcStatus(ct.ct_id);
                if (currentStatus && currentStatus.status === 'stopped') {
                    await pveApi.startLxc(ct.ct_id);
                    dbg(`LXC 容器 ${ct.ct_id} 已自动开机（CDK 续费后）`);
                }
            } catch (startError) {
                console.error(`LXC 容器 ${ct.ct_id} 自动开机失败:`, startError.message);
            }
 
            // 发送通知
            const redeemer = await db.users.getById(req.user.id);
            if (redeemer && redeemer.email && redeemer.emailVerified) {
                try {
                    const durationStr = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                    const emailContent = `
                        <p>您好 <strong>${redeemer.username}</strong>，</p>
                        <div class="info-box" style="border-left-color: #48bb78;">
                            <p style="margin-bottom: 8px; font-size: 16px;">
                                ✅ CDK 续费成功！
                            </p>
                        </div>
                        <div class="info-box">
                            <p style="margin-bottom: 8px;"><strong>续费详情：</strong></p>
                            <p style="margin-bottom: 4px;">LXC 容器：${targetName}（CT ${ct.ct_id}）</p>
                            <p style="margin-bottom: 4px;">续费时长：${durationStr}</p>
                            ${renewalPrice ? `<p style="margin-bottom: 4px;">续费价格：${renewalPrice}</p>` : ''}
                            <p style="margin-bottom: 0;">新到期时间：${newExpirationDate.toLocaleString('zh-CN')}</p>
                        </div>
                        <p>祝您使用愉快！如有问题请联系管理员。</p>
                    `;
                    await sendEmail(redeemer.email, 'CDK 续费成功 - PVE 管理面板', createEmailTemplate('续费成功通知', emailContent));
                } catch (emailError) {
                    console.error('发送 CDK 续费成功邮件失败:', emailError.message);
                }
            }
 
            try {
                const durationStr = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                await db.messages.create({
                    uid: redeemer.id,
                    title: 'CDK 续费成功',
                    content: `您的 LXC 容器 ${targetName} 已成功续费 ${durationStr}！\n新到期时间：${newExpirationDate.toLocaleString('zh-CN')}`,
                    type: 2,
                    send_type: 1
                });
            } catch (e) {}
 
            return res.json({
                message: `兑换成功！LXC 容器到期时间已延长 ${cdk.duration_days} 天`,
                new_expiration_date: newExpirationDate.toISOString()
            });
        } else {
            // ===== 虚拟机续费 =====
            const vm = await db.vms.getById(parseInt(vm_id));
            if (!vm) {
                return res.status(404).json({ error: '虚拟机不存在' });
            }
 
            if (vm.user_id !== req.user.id) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
 
            targetType = 'vm';
            targetId = vm.id;
            targetName = vm.name || 'VM ' + vm.vm_id;
            renewalPrice = vm.renewal_price;
 
            // 计算新的到期时间
            let newExpirationDate;
            if (vm.expiration_date) {
                const currentExp = new Date(vm.expiration_date + 'Z');
                const now = new Date();
                const baseDate = currentExp > now ? currentExp : now;
                newExpirationDate = new Date(baseDate.getTime() + cdk.duration_days * 24 * 60 * 60 * 1000);
            } else {
                newExpirationDate = new Date(Date.now() + cdk.duration_days * 24 * 60 * 60 * 1000);
            }
 
            // 更新虚拟机到期时间
            await db.vms.update(vm.id, {
                expiration_date: newExpirationDate.toISOString(),
                reminderSent: false,
                lastReminderDate: ''
            });
            await db.vms.reminders.clear(vm.id);
 
            // 发送续费成功邮件和站内信
            const redeemer = await db.users.getById(req.user.id);
            if (redeemer && redeemer.email && redeemer.emailVerified) {
                try {
                    const durationStr = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                    const emailContent = `
                        <p>您好 <strong>${redeemer.username}</strong>，</p>
                        <div class="info-box" style="border-left-color: #48bb78;">
                            <p style="margin-bottom: 8px; font-size: 16px;">
                                ✅ CDK 续费成功！
                            </p>
                        </div>
                        <div class="info-box">
                            <p style="margin-bottom: 8px;"><strong>续费详情：</strong></p>
                            <p style="margin-bottom: 4px;">虚拟机：${targetName}（VMID: ${vm.vm_id}）</p>
                            <p style="margin-bottom: 4px;">续费时长：${durationStr}</p>
                            ${renewalPrice ? `<p style="margin-bottom: 4px;">续费价格：${renewalPrice}</p>` : ''}
                            <p style="margin-bottom: 0;">新到期时间：${newExpirationDate.toLocaleString('zh-CN')}</p>
                        </div>
                        <p>祝您使用愉快！如有问题请联系管理员。</p>
                    `;
                    await sendEmail(
                        redeemer.email,
                        'CDK 续费成功 - PVE 管理面板',
                        createEmailTemplate('续费成功通知', emailContent)
                    );
                    dbg(`已向 ${redeemer.username} 发送 CDK 续费成功邮件（VM ${vm.vm_id}）`);
                } catch (emailError) {
                    console.error('发送 CDK 续费成功邮件失败:', emailError.message);
                }
            }
 
            try {
                const durationStr = cdk.duration_days >= 365 ? `${Math.floor(cdk.duration_days / 365)}年` : `${cdk.duration_days}天`;
                await db.messages.create({
                    uid: redeemer.id,
                    title: 'CDK 续费成功',
                    content: `您的虚拟机 ${targetName} 已成功续费 ${durationStr}！\n新到期时间：${newExpirationDate.toLocaleString('zh-CN')}`,
                    type: 2,
                    send_type: 1
                });
            } catch (e) {}
 
            // 虚拟机之前可能因到期被关机，尝试自动开机
            try {
                const currentStatus = await pveApi.getVmStatus(vm.vm_id);
                if (currentStatus && currentStatus.status === 'stopped') {
                    await pveApi.startVm(vm.vm_id);
                    dbg(`虚拟机 ${vm.vm_id} 已自动开机（CDK 续费后）`);
                }
            } catch (startError) {
                console.error(`虚拟机 ${vm.vm_id} 自动开机失败:`, startError.message);
            }
 
            res.json({
                message: `兑换成功！虚拟机到期时间已延长 ${cdk.duration_days} 天`,
                new_expiration_date: newExpirationDate.toISOString()
            });
        }
    } catch (error) {
        console.error('兑换 CDK 失败:', error);
        res.status(500).json({ error: safeError(error) });
    }
});


module.exports = router;
