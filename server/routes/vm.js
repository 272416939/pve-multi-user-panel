const express = require('express');
const router = express.Router();
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const ikuaiApi = require('../api/ikuai-api');
const { _applyRate } = require('../utils/pve-rate');
// 状态缓存读写抽离到 services/status-cache.js（规范第七节）
const { getStatusCache } = require('../services/status-cache');
const { createEmailTemplate, sendEmail, getSiteName, shouldSendEmail } = require('../utils/email');
const { createDhcpStaticBinding, removeDhcpStaticBinding, updateDhcpStaticBindingIp, pickUnusedStaticIp, rebindDhcpForDevice, isIpInAddrPool } = require('../services/dhcp');
const { rebuildPortForwardsForDevice } = require('../services/port-forward-sync');
const dbg = require('../utils/debug');
const consoleSession = require('../utils/console-session');
const { safeError, sanitizeErrorMsg } = require('../utils/safe-error');
const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');
const { withTransaction } = require('../utils/with-transaction');
const osSwitchUtils = require('../services/os-switch');
const { generateOrderNo } = require('../utils/order-utils');
const { takeDiskSnapshot } = require('../services/disk-audit');
const { importDisksForVm } = require('../services/disk-expiry-check');
// 统一审计埋点（utils/audit-log.js 导出，route 内不复刻包装函数）
const { auditAction } = require('../utils/audit-log');
// P2-H1① 修复：PVE VM 列表需管理员权限（包含所有节点 VM 分配信息）
router.get('/pve/vms', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vms = await pveApi.getVms(req.query.template_only ? { templateOnly: true } : {});
        
        // 获取已分配的VMID
        const assignedVms = await db.vms.getAll();
        const assignedVmIds = new Set(assignedVms.map(vm => vm.vm_id));

        // PERF-05: 循环外一次性获取所有用户，构建 userMap，避免 N+1 查询
        const allUsers = await db.users.getAll();
        const userMap = {};
        allUsers.forEach(u => { userMap[u.id] = u; });

        // 将虚拟机分为待分配和已分配，并按VMID降序排序
        const availableVms = vms
            .filter(vm => !assignedVmIds.has(vm.vmid))
            .sort((a, b) => b.vmid - a.vmid);
        
        const assignedVmsWithUsers = vms
            .filter(vm => assignedVmIds.has(vm.vmid))
            .sort((a, b) => b.vmid - a.vmid)
            .map(vm => {
                const assignment = assignedVms.find(a => a.vm_id === vm.vmid);
                const user = assignment ? userMap[assignment.user_id] : null;
                return {
                    ...vm,
                    assigned_user: user ? user.username : null,
                    assignment_id: assignment ? assignment.id : null
                };
            });
        
        res.json({
            available: availableVms,
            assigned: assignedVmsWithUsers
        });
    } catch (error) {
        console.error('获取虚拟机列表错误:', error);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/user/vms', authMiddleware, async (req, res) => {
    try {
        // V3-08 修复：列表/状态轮询类端点加速率限制，防止滥用打爆 PVE API
        var listRate = await checkConfiguredRateLimit('user_vms', 'ratelimit:user-vms:' + req.user.id);
        if (!listRate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试' });

        let userVms;
        if (req.user.role === 'admin') {
            // PERF-05: 循环外一次性获取所有用户，构建 userMap，避免 N+1 查询
            const allUsers = await db.users.getAll();
            const userMap = {};
            allUsers.forEach(u => { userMap[u.id] = u; });
            userVms = (await db.vms.getAll()).map(vm => {
                const user = userMap[vm.user_id];
                return { ...vm, username: user?.username };
            });
        } else {
            userVms = await db.vms.getByUserId(req.user.id);
        }
 
        // 先构建基础数据（不依赖 PVE 状态查询）；剔除 pve_upid 敏感字段，仅返回 _provisioning 布尔标记
        const vmsWithDetails = userVms.map(vm => {
            const { pve_upid, ...rest } = vm;
            return {
                ...rest,
                _provisioning: !!(pve_upid && pve_upid !== ''),
                // 备份中/恢复中/切换中统一标记（详见下方 computeBusyType）
                _busy: false,
                busyType: null,
                status: null,
                config: null,
                isExpired: vm.expiration_date ? new Date(vm.expiration_date) < new Date() : false,
                destroyed: false,
                error: null
            };
        });

        // 并行汇总三张表的"进行中"状态，映射到每台 VM 的 busyType（优先 切换中 > 备份中/恢复中）
        try {
            const switchRes = await Promise.all(vmsWithDetails.map(vm => db.vmOsSwitchLogs.getRunningByVmid(vm.vm_id)));
            const backupRes = await Promise.all(vmsWithDetails.map(vm => db.backups.getRunningByVmId(vm.vm_id)));
            const restoreRes = await Promise.all(vmsWithDetails.map(vm => db.restoreTasks.getRunningByVmId(vm.vm_id)));
            vmsWithDetails.forEach((vm, i) => {
                let busyType = null;
                if (switchRes[i]) busyType = 'switch';
                else if (backupRes[i] && backupRes[i].length > 0) busyType = 'backup';
                else if (restoreRes[i] && restoreRes[i].length > 0) busyType = 'restore';
                if (busyType) {
                    vm._busy = true;
                    vm.busyType = busyType;
                }
            });
        } catch (busyError) {
            // busy 状态挂载失败不阻塞列表返回，仅退化为无徽标
            console.error('获取虚拟机进行中状态失败:', busyError);
        }
 
        // PERF-05: 并行查询 PVE 状态（分批，每批 10 个），替代串行 for 循环
        const batchSize = 10;
        for (let i = 0; i < vmsWithDetails.length; i += batchSize) {
            const batch = vmsWithDetails.slice(i, i + batchSize);
            await Promise.all(batch.map(async (vmData) => {
                try {
                    var cachedStatus = getStatusCache('vm:' + vmData.vm_id, req.user.id);
                    var rawStatus = cachedStatus || await pveApi.getVmStatus(vmData.vm_id);
                    var config = await pveApi.getVmConfig(vmData.vm_id);
                    vmData.status = cachedStatus || _applyRate('vm:' + vmData.vm_id, rawStatus);
                    vmData.config = config;
                    vmData.error = null;
                } catch (innerError) {
                    var cachedFallback = getStatusCache('vm:' + vmData.vm_id, req.user.id);
                    if (cachedFallback) {
                        vmData.status = cachedFallback;
                        vmData.error = null;
                    } else {
                        const errMsg = innerError?.response?.data?.message || innerError?.message || '';
                        if (innerError.response?.status === 404 || errMsg.includes('does not exist')) {
                            vmData.destroyed = true;
                        } else {
                            vmData.error = '获取虚拟机信息失败';
                        }
                    }
                }
            }));
        }
 
        res.json(vmsWithDetails);
    } catch (error) {
        console.error('获取用户虚拟机列表失败:', error);
        // 兜底返回数据库数据
        try {
            let userVms;
            if (req.user.role === 'admin') {
                userVms = await db.vms.getAll();
            } else {
                userVms = await db.vms.getByUserId(req.user.id);
            }
            return res.json(userVms.map(vm => {
                const { pve_upid, ...rest } = vm;
                return {
                    ...rest,
                    _provisioning: !!(pve_upid && pve_upid !== ''),
                    status: null,
                    config: null,
                    isExpired: vm.expiration_date ? new Date(vm.expiration_date) < new Date() : false,
                    destroyed: false
                };
            }));
        } catch (e2) {
            console.error('兜底返回也失败:', e2);
            res.json([]);
        }
    }
});

router.post('/user/vms', authMiddleware, adminMiddleware, async (req, res) => {
    try {
    const { vm_id, user_id, name, expiration_date, renewal_price, renewal_period, mac_group_id, monthly_price, quarterly_discount, yearly_discount } = req.body;
 
    if (!vm_id || !user_id) {
        return res.status(400).json({ error: '请选择虚拟机和用户' });
    }
 
    const parsedVmId = parseInt(vm_id);
    const parsedUserId = parseInt(user_id);
 
    if (isNaN(parsedVmId) || isNaN(parsedUserId)) {
        return res.status(400).json({ error: '无效的虚拟机或用户ID' });
    }

    // SEC-03: 价格/折扣参数服务端校验
    var parsedMonthlyPrice = parseFloat(monthly_price);
    if (isNaN(parsedMonthlyPrice) || parsedMonthlyPrice < 0) parsedMonthlyPrice = 0;
    var parsedQDiscount = parseInt(quarterly_discount);
    if (isNaN(parsedQDiscount)) parsedQDiscount = 0;
    parsedQDiscount = Math.min(Math.max(parsedQDiscount, 0), 100);
    var parsedYDiscount = parseInt(yearly_discount);
    if (isNaN(parsedYDiscount)) parsedYDiscount = 0;
    parsedYDiscount = Math.min(Math.max(parsedYDiscount, 0), 100);

    // SEC-04: period 白名单校验
    var validPeriod = renewal_period || 'month';
    if (!['month', 'quarter', 'year'].includes(validPeriod)) {
        return res.status(400).json({ error: '无效的计费周期' });
    }
 
    const existingVms = await db.vms.getAll();
    if (existingVms.find(vm => vm.vm_id === parsedVmId && vm.user_id === parsedUserId)) {
        return res.status(400).json({ error: '该虚拟机已分配给此用户' });
    }

    // 如果该 VMID 之前已分配给其他用户，先清理旧记录并同步 legacy 磁盘 user_id
    var oldVms = existingVms.filter(function(v) { return v.vm_id === parsedVmId; });
    for (var oi = 0; oi < oldVms.length; oi++) {
        // 同步更新绑定在该 VM 上的 legacy 磁盘的 user_id
        await db.disks.updateUserId(parsedVmId, parsedUserId);
        // 删除旧分配记录
        await db.vms.delete(oldVms[oi].id);
    }
 
    const newVm = await db.vms.create({
        vm_id: parsedVmId,
        user_id: parsedUserId,
        name,
        expiration_date,
        renewal_price: renewal_price || '',
        renewal_period: validPeriod,
        monthly_price: String(parsedMonthlyPrice),
        quarterly_discount: String(parsedQDiscount),
        yearly_discount: String(parsedYDiscount)
    });
    
    // MAC 分组同步
    if (mac_group_id) {
        try {
            var macCfg = await pveApi.getVmConfig(parsedVmId);
            var vmac = macCfg?.net0?.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (vmac) {
                await ikuaiApi.addMacToGroup(mac_group_id, vmac[0], (name || 'VM ' + vm_id) + ' 虚拟机');
                await db.vms.update(newVm.id, { ikuai_mac_group_id: mac_group_id });
            }
        } catch (e) { console.error('VM ' + parsedVmId + ' MAC分组同步失败:', e.message); }
    }
    
    // DHCP 静态绑定：分配 IP
    try {
        const config = await pveApi.getVmConfig(parsedVmId);
        if (config && config.net0) {
            const macMatch = config.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (macMatch) {
                // 如果 VM 已有 dhcp_static_ip，优先使用
                const existingVm = (await db.vms.getAll()).find(v => v.vm_id === parsedVmId);
                const preferredIp = existingVm?.dhcp_static_ip || '';
                const ip = await createDhcpStaticBinding('vm', parsedVmId, macMatch[0], preferredIp);
                if (ip) await db.vms.update(newVm.id, { dhcp_static_ip: ip });
            }
        }
    } catch (e) { console.error(`VM ${parsedVmId} DHCP 静态绑定失败:`, e.message); }
    
    // 发送站内消息通知
    try {
        const user = await db.users.getById(parseInt(user_id));
        await db.messages.create({
            uid: parseInt(user_id),
            title: '虚拟机已开通',
            content: `您的虚拟机 ${name || 'VM ' + vm_id} 已分配完成。${expiration_date ? '\n到期时间：' + new Date(expiration_date).toLocaleString('zh-CN') : ''}${renewal_price ? '\n续费价格：' + renewal_price : ''}`,
            type: 2,
            send_type: 1,
            link_url: '',
            link_text: ''
        });
    } catch (e) { console.error('[vm] 站内信发送失败:', e.message); }

    const assignedUser = await db.users.getById(parseInt(user_id));
    if (assignedUser && assignedUser.email && assignedUser.emailVerified) {
        if (await shouldSendEmail(assignedUser.id, 'notify_vm_provisioned')) {
            try {
                const expiryStr = expiration_date ? new Date(expiration_date).toLocaleString('zh-CN') : '永久有效';
                const priceStr = renewal_price ? `<p style="margin-bottom: 4px;">续费价格：${renewal_price}</p>` : '';
                const emailContent = `
                    <p>您好 <strong>${assignedUser.username}</strong>，</p>
                    <div class="info-box" style="border-left-color: #48bb78;">
                        <p style="margin-bottom: 8px; font-size: 16px;">
                            🎉 您的虚拟机已开通！
                        </p>
                    </div>
                    <div class="info-box">
                        <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                        <p style="margin-bottom: 4px;">名称：${name || 'VM ' + vm_id}</p>
                        <p style="margin-bottom: 4px;">VMID：${vm_id}</p>
                        <p style="margin-bottom: 4px;">到期时间：${expiryStr}</p>
                        ${priceStr}
                    </div>
                    <div class="divider"></div>
                    <p>您可以前往「我的虚拟机」页面开始使用。如有问题请联系管理员。</p>
                `;
                const vmSiteName = await getSiteName();
                if (await shouldSendEmail(assignedUser.id, 'notify_vm_provisioned')) {
                    await sendEmail(
                        assignedUser.email,
                        '虚拟机已开通 - ' + vmSiteName,
                        createEmailTemplate('虚拟机开通通知', emailContent, vmSiteName)
                    );
                }
            } catch (emailError) {
                console.error(`发送 VM 开通邮件给 ${assignedUser.username} 失败:`, emailError.message);
            }
        }
    }
    
    // 私有网络要求：admin 手动分配不自动开机，以关机状态交付，用户开机时需先绑定子网

    // 操作审计：管理员创建/分配 VM
	    try {
	        const { auditLog } = require('../utils/audit-log');
	        await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.vm.create', resourceType: 'vm', resourceId: parsedVmId, details: '为 用户#' + parsedUserId + ' 创建 VM #' + parsedVmId + '(' + (name || 'VM ' + vm_id) + (expiration_date ? ',到期:' + expiration_date : '') + ')', req });
	    } catch (e) {}
	    
		    res.json(newVm);

		    // 异步更新磁盘快照（不阻塞响应）
		    takeDiskSnapshot(parsedVmId, parsedUserId).catch(function(err) {
		      console.error('[快照] VM ' + parsedVmId + ' 分配后快照创建失败:', err.message);
		    });

		    // 异步导入存量数据盘（不阻塞响应）
	    importDisksForVm(parsedVmId, parsedUserId).catch(function(err) {
	      console.error('[vm] VM 分配后导入存量数据盘失败:', err.message);
	    });

	    } catch (e) {
        console.error('[vm] 操作失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/user/vms/:id', authMiddleware, async (req, res) => {
    try {
    const vmId = parseInt(req.params.id);
    const { name, expiration_date, renewal_price, renewal_period, user_id, ikuai_mac_group_id } = req.body;
    
    const vm = await db.vms.getById(vmId);
    if (!vm) {
        return res.status(404).json({ error: '虚拟机不存在' });
    }
    
    // 检查权限：管理员或所有者
    const isAdmin = req.user.role === 'admin';
    const isOwner = req.user.id === vm.user_id;
    
    if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: '无权限操作此虚拟机' });
    }
    
    const updates = {};
    
    // 更新名称（所有用户都可以）
    if (name !== undefined) {
        updates.name = name;
    }
    
    // 只有管理员可以修改到期时间和价格
    if (isAdmin && expiration_date !== undefined) {
        updates.expiration_date = expiration_date;
        updates.reminderSent = false;
        await db.vms.reminders.clear(vmId);
    }
    
    if (isAdmin && renewal_price !== undefined) {
        updates.renewal_price = renewal_price;
    }

    if (isAdmin && renewal_period !== undefined) {
        updates.renewal_period = renewal_period;
    }
    
    // 只有管理员可以重新分配给其他用户
    if (isAdmin && user_id !== undefined && user_id !== vm.user_id) {
        updates.user_id = parseInt(user_id);
        updates.reminderSent = false;
        await db.vms.reminders.clear(vmId);
        // 同步更新绑定在该 VM 上的 legacy 磁盘的 user_id
        await db.disks.updateUserId(vm.vm_id, parseInt(user_id));
    }

    // MAC 分组变更
    const newMacGroupId = req.body.mac_group_id;
    if (isAdmin && newMacGroupId !== undefined && newMacGroupId !== vm.ikuai_mac_group_id) {
        try {
            const macConfig = await pveApi.getVmConfig(vm.vm_id);
            const vmac = macConfig?.net0?.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (vmac) {
                if (vm.ikuai_mac_group_id) {
                    try { await ikuaiApi.removeMacFromGroup(vm.ikuai_mac_group_id, vmac[0]); } catch (e) {}
                }
                if (newMacGroupId) {
                    await ikuaiApi.addMacToGroup(newMacGroupId, vmac[0], (vm.name || 'VM ' + vm.vm_id) + ' 虚拟机');
                }
                updates.ikuai_mac_group_id = newMacGroupId || '';
            }
        } catch (e) { console.error('VM MAC分组更新失败:', e.message); }
    }

    await db.vms.update(vmId, updates);

    // 操作审计：VM 名称编辑
    if (name !== undefined && name !== vm.name) {
        await auditAction(req, 'vm.rename', '编辑 VM ' + vm.vm_id + ' 名称: ' + (vm.name || '') + ' → ' + name, { resourceType: 'vm', resourceId: vm.vm_id });
    }
    
    // 管理员延长到期时间后，如果虚拟机之前因到期停机，尝试自动开机
    if (isAdmin && expiration_date !== undefined) {
        try {
            const newExp = new Date(expiration_date);
            if (newExp > new Date()) {
                const currentStatus = await pveApi.getVmStatus(vm.vm_id);
                if (currentStatus && currentStatus.status === 'stopped') {
                    await pveApi.startVm(vm.vm_id);
                    dbg(`虚拟机 ${vm.vm_id} 已自动开机（到期时间延长后）`);
                }
            }
        } catch (startError) {
            console.error(`虚拟机 ${vm.vm_id} 自动开机失败:`, startError.message);
        }
    }
    
    res.json({ message: '虚拟机信息更新成功' });
    } catch (e) {
        console.error('[vm] 操作失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.delete('/user/vms/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
    const vmId = parseInt(req.params.id);
    const vm = await db.vms.getById(vmId);
    let removedVmInfo = null;
    if (vm) {
        removedVmInfo = { name: vm.name, vm_id: vm.vm_id, user_id: vm.user_id };
    }
    // 检查虚拟机状态，必须关机才能移除
    if (vm && vm.vm_id) {
        try {
            const status = await pveApi.getVmStatus(vm.vm_id);
            if (status && status.status === 'running') {
                return res.status(400).json({ error: '虚拟机正在运行，请先关机后再移除' });
            }
        } catch (e) {
            console.warn(`[vm] 查询 ${vm.vm_id} 状态失败（继续执行移除）:`, e.message);
        }
    }
    await db.vms.reminders.clear(vmId);
    // 级联清理端口转发
    try {
        const vmForwards = await db.portForwards.getByVmId(removedVmInfo?.vm_id || vmId);
        for (const fw of vmForwards) {
            if (fw.ikuai_id) {
                try { ikuaiApi.deletePortForward(fw.ikuai_id); } catch (e) {}
            }
        }
        await db.portForwards.deleteByDevice('vm', removedVmInfo?.vm_id || vmId);
    } catch (e) { console.error('清理端口转发失败:', e.message); }
    // 清理 DHCP 静态绑定
    if (vm && vm.vm_id) {
        removeDhcpStaticBinding('vm', vm.vm_id);
    }
    // MAC 分组清理
    if (vm && vm.vm_id && vm.ikuai_mac_group_id) {
        try {
            const macConfig = await pveApi.getVmConfig(vm.vm_id);
            const vmac = macConfig?.net0?.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (vmac) {
                await ikuaiApi.removeMacFromGroup(vm.ikuai_mac_group_id, vmac[0]);
            }
        } catch (e) { console.error('VM MAC分组删除失败:', e.message); }
    }
    // 清理绑定在当前 VM 上的 legacy 磁盘台账记录（不操作 PVE 磁盘本身）
    try {
        if (vm && vm.vm_id) {
            await db.disks.deleteByBindVmid(vm.vm_id);
        }
    } catch (e) { console.error('清理 legacy 磁盘记录失败:', e.message); }
    // 清理磁盘快照
    try {
        if (vm && vm.vm_id) {
            await db.vmDiskSnapshots.delete(vm.vm_id);
            console.log('[快照] VM ' + vm.vm_id + ' 磁盘快照已清理（移除分配）');
        }
    } catch (e) { console.error('清理磁盘快照失败:', e.message); }
    await db.vms.delete(vmId);
    // 发送移除通知
    if (removedVmInfo) {
        try {
            await db.messages.create({
                uid: removedVmInfo.user_id,
                title: '虚拟机已移除',
                content: `您的虚拟机 ${removedVmInfo.name || 'VM ' + removedVmInfo.vm_id} 已被管理员移除。`,
                type: 2,
                send_type: 1
            });
        } catch (e) {}
    }

    if (removedVmInfo) {
        const removedUser = await db.users.getById(removedVmInfo.user_id);
        if (removedUser && removedUser.email && removedUser.emailVerified) {
            if (await shouldSendEmail(removedVmInfo.user_id, 'notify_vm_provisioned')) {
                try {
                    const emailContent = `
                        <p>您好 <strong>${removedUser.username}</strong>，</p>
                        <div class="warning-box">
                            <p style="margin-bottom: 8px; font-size: 16px;">
                                ⚠️ 您的虚拟机已被移除
                            </p>
                        </div>
                        <div class="info-box">
                            <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                            <p style="margin-bottom: 4px;">名称：${removedVmInfo.name || 'VM ' + removedVmInfo.vm_id}</p>
                            <p style="margin-bottom: 4px;">VMID：${removedVmInfo.vm_id}</p>
                        </div>
                        <div class="divider"></div>
                        <p>如果对此操作有疑问，请联系管理员。</p>
                    `;
                    const vmSiteName2 = await getSiteName();
                    if (await shouldSendEmail(removedUser.id, 'notify_vm_provisioned')) {
                        await sendEmail(
                            removedUser.email,
                            '虚拟机已被移除 - ' + vmSiteName2,
                            createEmailTemplate('虚拟机移除通知', emailContent, vmSiteName2)
                        );
                    }
                } catch (emailError) {
                    console.error(`发送 VM 移除邮件给 ${removedUser.username} 失败:`, emailError.message);
                }
            }
        }
    }

    // 操作审计：移除 VM（台账移除，不销毁 PVE 虚拟机）
    if (removedVmInfo) {
        await auditAction(req, 'admin.vm.remove', '移除VM #' + removedVmInfo.vm_id + ':' + (removedVmInfo.name || 'VM ' + removedVmInfo.vm_id) + '(用户#' + removedVmInfo.user_id + ')', { resourceType: 'vm', resourceId: removedVmInfo.vm_id });
    }

    res.json({ message: '虚拟机移除成功' });
    } catch (e) {
        console.error('[vm] 操作失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/vm/:vmid/start', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
            if (isOwner && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，无法开机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        // 私有网络：未绑定子网的存量设备关机后拒绝开机（全角色生效，含管理员）
        if (vm && !vm.subnet_id) {
            return res.status(400).json({ error: '该虚拟机尚未绑定子网，请先在「更多→绑定子网」中绑定后再开机' });
        }

        await pveApi.startVm(vmid);
        // 启动成功后清除关机原因标记
        try { if (vm) await db.vms.update(vm.id, { shutdown_reason: null }); } catch (_) {}

        // 私有网络：启动后兜底重绑 DHCP 静态绑定（绑定子网后首次开机时分配新 IP，绑定丢失时恢复）
        try {
            if (vm && vm.subnet_id) {
                const subnet = await db.subnets.getById(vm.subnet_id);
                if (subnet && (!vm.dhcp_static_ip || !isIpInAddrPool(vm.dhcp_static_ip, subnet.addr_pool))) {
                    const cfg = await pveApi.getVmConfig(vmid);
                    const mac = ((cfg && cfg.net0) || '').match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                    if (mac) {
                        const newIp = await rebindDhcpForDevice('vm', vmid, subnet, mac[0]);
                        if (newIp) {
                            await db.vms.update(vm.id, { dhcp_static_ip: newIp });
                            // 端口转发同步：IP 变化时重建规则（绑定后首次开机/绑定丢失恢复场景）
                            if (newIp !== vm.dhcp_static_ip) {
                                try {
                                    await rebuildPortForwardsForDevice('vm', vmid, newIp);
                                } catch (pfErr) { console.error('[vm.start] 同步端口转发失败:', pfErr.message); }
                            }
                        }
                    }
                }
            }
        } catch (e) { console.error('[vm.start] 重绑 DHCP 静态绑定失败:', e.message); }

        await auditAction(req, 'vm.start', '开机 VM ' + vmid);
        res.json({ message: '虚拟机启动成功' });
    } catch (error) {
        res.status(500).json({ error: '启动虚拟机失败' });
    }
});

router.post('/vm/:vmid/shutdown', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.shutdownVm(vmid);
        // 标记为用户手动关机（续费后不自动开机）
        try { if (vm) await db.vms.update(vm.id, { shutdown_reason: 'manual' }); } catch (_) {}
        await auditAction(req, 'vm.shutdown', '关机 VM ' + vmid);
        res.json({ message: '虚拟机关机成功' });
    } catch (error) {
        res.status(500).json({ error: '关闭虚拟机失败' });
    }
});

router.post('/vm/:vmid/stop', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.stopVm(vmid);
        // 标记为用户手动关机（续费后不自动开机）
        try { if (vm) await db.vms.update(vm.id, { shutdown_reason: 'manual' }); } catch (_) {}
        await auditAction(req, 'vm.stop', '强制停止 VM ' + vmid);
        res.json({ message: '虚拟机已强制停止' });
    } catch (error) {
        res.status(500).json({ error: '停止虚拟机失败' });
    }
});

router.post('/vm/:vmid/reboot', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.rebootVm(vmid);
        await auditAction(req, 'vm.reboot', '重启 VM ' + vmid);
        res.json({ message: '虚拟机重启成功' });
    } catch (error) {
        res.status(500).json({ error: '重启虚拟机失败' });
    }
});

router.post('/vm/:vmid/vnc', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        // V-1 修复：统一权限模式 — 管理员可连接未分配 VM 进行运维
        if (!vm) {
            if (!isAdmin) {
                return res.status(403).json({ error: '虚拟机未分配，无权限' });
            }
            // 管理员允许继续（用于运维未分配的 VM）
        } else {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此虚拟机' });
            }
        }
        
        // 先检查 VM 是否在运行
        let vmStatus;
        try {
            vmStatus = await pveApi.getVmStatus(vmid);
        } catch (e) {
            return res.status(500).json({ error: '无法获取虚拟机状态' });
        }
        
        if (!vmStatus || vmStatus.status !== 'running') {
            return res.status(400).json({ error: '虚拟机未运行，请先开机' });
        }
        
        // 获取 VNC proxy ticket
        const result = await pveApi.getVncConsole(vmid);

        // 安全修复：用不透明的 session ID 替代 URL 中的敏感参数
        // session 数据存服务端（Redis+内存回退），避免 ticket/node/port 在浏览器历史/日志/Referer 中泄露
        const sessionId = await consoleSession.createSession({
            type: 'vnc', subtype: 'qemu',
            vmid, userId: req.user.id,
            node: result.node, port: result.port, ticket: result.ticket
        });

        // 返回代理页面 URL（只暴露 session ID，不含敏感参数）
        const proxyUrl = `/vnc?session=${sessionId}`;
        await auditAction(req, 'vm.vnc', '打开 VNC 控制台 VM ' + vmid);
        res.json({ proxyUrl });
    } catch (error) {
        console.error('获取 VNC 控制台失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/vm/:vmid/status', authMiddleware, async (req, res) => {
    try {
        // V3-08 修复：状态查询端点限速（30次/分钟，前端正常轮询远低于该值）
        var statusRate = await checkConfiguredRateLimit('vm_status', 'ratelimit:vm-status:' + req.user.id);
        if (!statusRate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试' });

        const vmid = parseInt(req.params.vmid);
        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限查看此虚拟机状态' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限查看此虚拟机状态，资源未分配' });
        }

        const rawStatus = await pveApi.getVmStatus(vmid);
        const status = _applyRate('vm:' + req.params.vmid, rawStatus);
        const config = await pveApi.getVmConfig(req.params.vmid);
        res.json({ status, config });
    } catch (error) {
        res.status(500).json({ error: '获取虚拟机状态失败' });
    }
});

// VM IP 重置相关路由（通过修改爱快DHCP绑定实现，PVE虚拟机不支持直接设置IP）
// 可选 subnet_id：从指定子网 IP 池随机（私有网络）；未传则用旧 DHCP 全局范围（兼容创建流程）
router.get('/vm/random-ip', authMiddleware, async (req, res) => {
    try {
        const subnetId = parseInt(req.query.subnet_id);
        if (subnetId) {
            // 私有网络：随机 IP 从子网 IP 池选取，且非管理员仅限使用自己的子网
            const subnet = await db.subnets.getById(subnetId);
            if (!subnet) return res.status(400).json({ error: '子网不存在' });
            if (req.user.role !== 'admin' && subnet.user_id !== req.user.id) {
                return res.status(403).json({ error: '无权限使用该子网' });
            }
            const ip = await pickUnusedStaticIp(subnet);
            if (!ip) return res.status(400).json({ error: '子网 IP 池无可用 IP，请手动输入或刷新可用 IP' });
            return res.json({ ip });
        }
        const ip = await pickUnusedStaticIp();
        if (!ip) return res.status(400).json({ error: '无可用 IP' });
        res.json({ ip });
    } catch (error) {
        res.status(500).json({ error: '获取随机 IP 失败' });
    }
});

router.post('/vm/:vmid/reset-ip', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const { ip_mode, ip } = req.body;

        // 参数校验
        if (!ip_mode || !['dhcp', 'static', 'random'].includes(ip_mode)) {
            return res.status(400).json({ error: '无效的 IP 模式，请选择 DHCP、静态 IP 或随机' });
        }

        // 权限检查（用正确的查询方法）
        const allVms = await db.vms.getAll();
        const vmRecord = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (vmRecord) {
            const isOwner = req.user.id === vmRecord.user_id;
            if (!isOwner && !isAdmin) return res.status(403).json({ error: '无权限操作此虚拟机' });
            // 非管理员用户重置 IP 时检查到期时间
            if (isOwner && !isAdmin && vmRecord.expiration_date && new Date(vmRecord.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        // 私有网络：重置 IP 必须已绑定子网，随机/静态 IP 均取自绑定的子网 IP 池
        let subnet = null;
        if (vmRecord && vmRecord.subnet_id) {
            subnet = await db.subnets.getById(vmRecord.subnet_id);
        }
        if (!subnet) {
            return res.status(400).json({ error: '该虚拟机尚未绑定子网，请先绑定后再重置 IP' });
        }

        if (ip_mode === 'dhcp') {
            // DHCP模式：删除爱快静态绑定（如果有），VM将自动从爱快获取动态IP
            await removeDhcpStaticBinding('vm', vmid);
            if (vmRecord) await db.vms.update(vmRecord.id, { dhcp_static_ip: '' });
            await auditAction(req, 'vm.reset-ip', 'VM ' + vmid + ' 切换为 DHCP 模式');
            return res.json({ success: true, ip: null, message: '已切换为DHCP模式' });
        }

        // static 或 random 模式：更新/创建爱快DHCP静态绑定
        let targetIp = '';
        if (ip_mode === 'static') {
            if (!ip) return res.status(400).json({ error: '请输入 IP 地址' });
            const ipBase = ip.split('/')[0];
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipBase)) return res.status(400).json({ error: 'IP 格式不正确' });
            // 已绑定子网：手动输入 IP 必须在绑定的子网 IP 池内
            if (!isIpInAddrPool(ipBase, subnet.addr_pool)) {
                return res.status(400).json({ error: 'IP 不在当前绑定的子网 IP 池范围内，请选择池内地址或使用随机 IP' });
            }
            targetIp = ipBase;
        } else if (ip_mode === 'random') {
            targetIp = await pickUnusedStaticIp(subnet);
            if (!targetIp) return res.status(400).json({ error: '子网 IP 池无可用 IP，请手动输入或刷新可用 IP' });
        }

        // 获取VM的MAC地址用于创建/更新DHCP绑定
        const config = await pveApi.getVmConfig(vmid);
        if (!config || !config.net0) return res.status(400).json({ error: '无法获取虚拟机配置' });
        const macMatch = config.net0.match(/([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})/);
        if (!macMatch) return res.status(400).json({ error: '无法解析虚拟机 MAC 地址' });

        // 更新爱快DHCP绑定（先尝试更新已有绑定，不存在则创建）
        let finalIp = targetIp;
        const updated = await updateDhcpStaticBindingIp('vm', vmid, finalIp);
        if (!updated) {
            // 没有已有绑定，创建新的（绑定子网时使用子网的 VLAN 接口/网关/DNS）
            const boundIp = await createDhcpStaticBinding('vm', vmid, macMatch[1], finalIp, subnet);
            finalIp = boundIp || finalIp;
        }
        if (!finalIp) return res.status(500).json({ error: '设置DHCP绑定失败' });

        // 更新数据库记录
        if (vmRecord) await db.vms.update(vmRecord.id, { dhcp_static_ip: finalIp });

        // 更新端口转发规则中的 IP
        if (finalIp) {
            try {
                const rules = await db.portForwards.getByVmId(vmid);
                for (const rule of rules) {
                    await db.portForwards.update(rule.id, { ip: finalIp });
                    if (rule.ikuai_id) {
                        // 解析 ikuai_id（兼容旧格式纯字符串和新格式 JSON 数组）
                        // 新格式下数组只有一个元素，interface 字段为逗号分隔的多接口值
                        let ikuaiIds = [];
                        try {
                            const parsed = JSON.parse(rule.ikuai_id);
                            ikuaiIds = Array.isArray(parsed) ? parsed : [{ interface: '', id: rule.ikuai_id }];
                        } catch (_) {
                            ikuaiIds = [{ interface: '', id: rule.ikuai_id }];
                        }
                        for (const item of ikuaiIds) {
                            try {
                                if (!item.id) continue;
                                await ikuaiApi.editPortForward(item.id, {
                                    ip: finalIp,
                                    internal_port: rule.internal_port,
                                    external_port: rule.external_port,
                                    protocol: rule.protocol,
                                    comment: rule.name || '',
                                    interface: item.interface || ''
                                });
                            } catch (e) {
                                console.error(`端口转发 ${rule.id} ikuai 同步失败:`, e.message);
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`VM ${vmid} 更新端口转发 IP 失败:`, e.message);
            }
        }

        await auditAction(req, 'vm.reset-ip', '设置 VM ' + vmid + ' 静态IP ' + finalIp);
        res.json({ success: true, ip: finalIp, message: `已设置静态IP ${finalIp}（通过爱快DHCP绑定）` });
    } catch (error) {
        dbg('[vm/reset-ip]', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/vm/:vmid/reset-password', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const { password } = req.body;

        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的虚拟机 ID' });
        }

        var passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,13}$/;
        if (!password || !passwordRegex.test(password)) {
            return res.status(400).json({ error: '密码需8-13位，包含大小写英文、数字和特殊字符' });
        }

        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date) < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        const config = await pveApi.getVmConfig(vmid);
        if (!config || !config.ciuser) {
            return res.status(400).json({ error: '当前虚拟机未配置Cloud-init驱动，请联系管理员！' });
        }

        const status = await pveApi.getVmStatus(vmid);
        if (status && status.status !== 'stopped') {
            return res.status(400).json({ error: '请先关机后再重置密码' });
        }

        await pveApi.updateVmConfig(vmid, { cipassword: password });

        await auditAction(req, 'password.reset.vm', '重置 VM ' + vmid + ' 密码');
        res.json({ message: '密码重置成功' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/vm/:vmid/destroy', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const force = req.query.force === '1';

        const assignedVms = (await db.vms.getAll()).filter(v => v.vm_id === vmid);
        // V3-14 修复：销毁前记录审计（含 vmid、归属与 force；后台操作域）
        const destroyTargets = assignedVms.map(v => (v.name || 'VM ' + v.vm_id) + '(用户#' + v.user_id + ')').join('/');
        await auditAction(req, 'admin.vm.destroy', '销毁 VM ' + vmid + (destroyTargets ? ':' + destroyTargets : '') + (force ? '（强制）' : ''), { resourceType: 'vm' });

        if (!force) {
            try {
                const status = await pveApi.getVmStatus(vmid);
                if (status && status.status === 'running') {
                    return res.status(400).json({ error: '虚拟机正在运行，请先关机后再销毁' });
                }
            } catch (e) {
                console.warn(`[vm] 查询 ${vmid} 状态失败（继续执行销毁）:`, e.message);
            }
        }

        for (const vm of assignedVms) {
            await db.vms.reminders.clear(vm.id);
            try {
                const vmForwards = await db.portForwards.getByVmId(vm.vm_id);
                for (const fw of vmForwards) {
                    if (fw.ikuai_id) {
                        try { await ikuaiApi.deletePortForward(fw.ikuai_id); } catch (e) {}
                    }
                }
                await db.portForwards.deleteByDevice('vm', vm.vm_id);
            } catch (e) { console.error('清理端口转发失败:', e.message); }
            if (vm && vm.vm_id) {
                removeDhcpStaticBinding('vm', vm.vm_id);
            }
            if (vm && vm.vm_id && vm.ikuai_mac_group_id) {
                try {
                    const macConfig = await pveApi.getVmConfig(vm.vm_id);
                    const vmac = macConfig?.net0?.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
                    if (vmac) {
                        await ikuaiApi.removeMacFromGroup(vm.ikuai_mac_group_id, vmac[0]);
                    }
                } catch (e) { console.error('VM MAC分组删除失败:', e.message); }
            }
            // 检查该 VM 上是否有挂载的活跃数据盘（非 legacy）
            try {
                var boundDisks = await db.disks.getByBindVmid(vmid);
                var activeDisks = boundDisks.filter(function(d) {
                    return d.status === 'bound' && !d.is_legacy;
                });
                if (activeDisks.length > 0) {
                    return res.status(400).json({
                        error: '该虚拟机下挂载了 ' + activeDisks.length + ' 个数据盘，请先卸载再销毁虚拟机'
                    });
                }
            } catch (e) { console.error('[vm] 查询数据盘失败:', e.message); }
            // 清理绑定在该 VM 上的所有磁盘台账记录（PVE 销毁时磁盘已被一并清理）
            try {
                await db.getPool().execute('DELETE FROM disks WHERE bind_vmid = ?', [vmid]);
            } catch (e) { console.error('清理磁盘记录失败:', e.message); }
            // 清理磁盘快照
            try {
                await db.vmDiskSnapshots.delete(vmid);
                console.log('[快照] VM ' + vmid + ' 磁盘快照已清理（销毁）');
            } catch (e) { console.error('清理磁盘快照失败:', e.message); }
            await db.vms.delete(vm.id);
        }

try {
            await pveApi.destroyVm(vmid);
            console.log(`[vm] PVE 虚拟机 ${vmid} 已销毁`);
        } catch (e) {
            console.error(`[vm] PVE 销毁 ${vmid} 失败:`, e.message);
            return res.status(500).json({ error: safeError(e, 'PVE 操作失败') });
        }

	res.json({ message: '虚拟机已销毁' });
        } catch (error) {
            console.error('销毁虚拟机失败:', error);
            res.status(500).json({ error: safeError(error, '系统运行错误，请联系管理人员') });
        }
    });

    // ==================== 系统切换端点（v1.3） ====================

    // POST /vm/:vmid/switch-os — 用户切换系统
    router.post('/vm/:vmid/switch-os', authMiddleware, async (req, res) => {
        const vmid = parseInt(req.params.vmid);
        const rateLimit = await checkConfiguredRateLimit('os_switch', 'ratelimit:os-switch:' + req.user.id);
        if (!rateLimit.allowed) {
            return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
        }
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的 VMID' });
        }
        const vm = await db.vms.getByVmid(vmid);
        if (!vm) return res.status(404).json({ error: '虚拟机不存在' });
        const isAdmin = req.user.role === 'admin';
        if (vm.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: '无权限操作' });
        }
        if (vm.expiration_date && new Date(vm.expiration_date) < new Date() && !isAdmin) {
            return res.status(403).json({ error: '虚拟机已到期，请先续费' });
        }
        const runningSwitch = await db.vmOsSwitchLogs.getRunningByVmid(vmid);
        if (runningSwitch) {
            return res.status(409).json({ error: '该虚拟机正在切换系统中，请稍候' });
        }
        const osTemplateId = parseInt(req.body.os_template_id);
        if (!Number.isInteger(osTemplateId) || osTemplateId < 1) {
            return res.status(400).json({ error: '无效的 OS 模板 ID' });
        }
        const osTemplate = await db.osTemplates.getById(osTemplateId);
        if (!osTemplate || !osTemplate.enabled || osTemplate.status !== 'active') {
            return res.status(400).json({ error: 'OS 模板不存在或已下架' });
        }
        if (osTemplate.allowed_package_ids) {
            const allowedIds = osTemplate.allowed_package_ids.split(',').map(s => parseInt(s.trim())).filter(Number.isInteger);
            if (allowedIds.length > 0 && vm.package_id && !allowedIds.includes(vm.package_id)) {
                return res.status(403).json({ error: '当前套餐不允许切换到该系统' });
            }
        }
        const vmStatus = await pveApi.getVmStatus(vmid);
        if (vmStatus.status !== 'stopped') {
            return res.status(400).json({ error: '请先关机后再切换系统' });
        }
        let oldSysDiskSizeGb = 0;
        try {
            const oldConfig = await pveApi.getVmConfig(vmid);
            for (const bus of ['scsi', 'sata', 'virtio']) {
                const raw = String(oldConfig[bus + '0'] || '');
                const m = raw.match(/size=(\d+)([GM])/i);
                if (m) {
                    const v = parseInt(m[1]);
                    oldSysDiskSizeGb = m[2].toUpperCase() === 'M' ? Math.ceil(v / 1024) : v;
                    break;
                }
            }
        } catch (e) { /* ignore */ }
        // 容量按原 VM 系统盘大小校验
        await osSwitchUtils.checkTargetStorageCapacity(osTemplate.target_storage, oldSysDiskSizeGb || 20);

        let orderNo = '';

        const switchLog = await db.vmOsSwitchLogs.create({
            vm_id: vmid,
            user_id: req.user.id,
            from_os_template_id: vm.current_os_template_id || null,
            to_os_template_id: osTemplateId,
            status: 'running',
            order_no: orderNo
        });
        await db.vms.update(vm.id, { os_switch_pve_upid: 'os-switch-' + switchLog.id });

        (async () => {
            try {
                const result = await osSwitchUtils.performOsSwitch(vmid, osTemplate, switchLog.id);
                await db.vmOsSwitchLogs.update(switchLog.id, {
                    status: 'success',
                    new_system_volume_id: result.newVolumeId || '',
                    finished_at: new Date()
                });
                await db.vms.update(vm.id, {
                    current_os_template_id: osTemplateId,
                    last_os_switch_at: new Date(),
                    os_switch_pve_upid: ''
                });
                await db.messages.create({
                    uid: vm.user_id,
                    title: '系统切换成功',
                    content: '您的虚拟机 ' + (vm.name || 'VM ' + vmid) + ' 已成功切换到 ' + osTemplate.name + '。\n登录账号：' + (result.ciResult?.ciuser || '未配置') + '\n新密码：' + (result.ciResult?.password || '') + '\n请尽快登录并修改密码。',
                    type: 2, send_type: 1
                });
                // 系统切换后更新磁盘快照
                try {
                    await takeDiskSnapshot(vmid, vm.user_id);
                } catch (snapErr) {
                    console.error('[快照] os-switch 后快照更新失败:', snapErr.message);
                }
            } catch (error) {
                await db.vmOsSwitchLogs.update(switchLog.id, {
                    status: 'failed',
                    error_message: error.message || String(error),
                    finished_at: new Date()
                });
                await db.vms.update(vm.id, { os_switch_pve_upid: '' });
                try {
                    await db.messages.create({
                        uid: vm.user_id,
                        title: '系统切换失败',
                        content: '您的虚拟机 ' + (vm.name || 'VM ' + vmid) + ' 切换系统失败。\n数据盘未受影响。请稍后重试或联系管理员。',
                        type: 2, send_type: 1
                    });
                } catch (msgErr) {
                    console.error('[os-switch] 失败通知发送失败:', msgErr.message);
                }
            }
        })();

        await auditAction(req, 'vm.switch-os', 'VM ' + vmid + ' 切换系统为 ' + osTemplate.name);
        res.json({
            success: true,
            message: '系统切换已开始，请稍候',
            switch_log_id: switchLog.id,
            vmid: vmid
        });
    });

    // GET /vm/:vmid/switch-os/status — 查询切换进度
    router.get('/vm/:vmid/switch-os/status', authMiddleware, async (req, res) => {
        const vmid = parseInt(req.params.vmid);
        const rateLimit = await checkConfiguredRateLimit('os_switch_status', 'ratelimit:os-switch-status:' + req.user.id);
        if (!rateLimit.allowed) return res.status(429).json({ error: '查询过于频繁' });
        const vm = await db.vms.getByVmid(vmid);
        if (!vm) return res.status(404).json({ error: '虚拟机不存在' });
        if (vm.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权限' });
        }
        const log = await db.vmOsSwitchLogs.getRunningByVmid(vmid);
        if (!log) return res.json({ status: 'idle' });
        res.json({
            status: log.status,
            fail_stage: log.fail_stage || '',
            admin_intervention_required: !!log.admin_intervention_required
        });
    });

    // GET /vm/:vmid/switch-os/logs — 查询单 VM 切换日志（翻页，脱敏）
    router.get('/vm/:vmid/switch-os/logs', authMiddleware, async (req, res) => {
        const vmid = parseInt(req.params.vmid);
        const vm = await db.vms.getByVmid(vmid);
        if (!vm) return res.status(404).json({ error: '虚拟机不存在' });
        if (vm.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权限' });
        }
        const page = Math.min(parseInt(req.query.page) || 1, 1000);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const logs = await db.vmOsSwitchLogs.getByVmidWithPaging(vmid, page, limit);
        const total = await db.vmOsSwitchLogs.countByVmid(vmid);
        // V3-07 修复：error_message 对非管理员脱敏（剔除命令/路径/URL/IP），管理员保留原文便于排障
        const isAdmin = req.user.role === 'admin';
        const safeLogs = logs.map(l => {
            const { error_message, ...safe } = l;
            if (!error_message) return { ...safe, error_message: '' };
            const msg = isAdmin ? error_message : sanitizeErrorMsg(error_message);
            return { ...safe, error_message: msg };
        });
        res.json({ success: true, data: safeLogs, total, page, limit });
    });

    // GET /vm/switch-os/logs — 查询当前用户所有切换日志（翻页，脱敏）
    router.get('/vm/switch-os/logs', authMiddleware, async (req, res) => {
        const page = Math.min(parseInt(req.query.page) || 1, 1000);
        const limit = Math.min(parseInt(req.query.limit) || 10, 50);
        const logs = await db.vmOsSwitchLogs.getByUserId(req.user.id, page, limit);
        const total = await db.vmOsSwitchLogs.countByUserId(req.user.id);
        // V3-07 修复：error_message 对普通用户脱敏
        const safeLogs = logs.map(l => {
            const { error_message, ...safe } = l;
            if (!error_message) return { ...safe, error_message: '' };
            const msg = req.user.role === 'admin' ? error_message : sanitizeErrorMsg(error_message);
            return { ...safe, error_message: msg };
        });
        res.json({ success: true, data: safeLogs, total, page, limit });
    });

    // GET /vm/:vmid/switchable-os — 获取可切换 OS 列表
    router.get('/vm/:vmid/switchable-os', authMiddleware, async (req, res) => {
        const vmid = parseInt(req.params.vmid);
        const vm = await db.vms.getByVmid(vmid);
        if (!vm) return res.status(404).json({ error: '虚拟机不存在' });
        if (vm.user_id !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ error: '无权限' });
        }
        const allOsTemplates = await db.osTemplates.getEnabled();
        let filtered = allOsTemplates;
        if (vm.package_id) {
            filtered = allOsTemplates.filter(t => {
                if (!t.allowed_package_ids) return true;
                const allowed = t.allowed_package_ids.split(',').map(s => parseInt(s.trim())).filter(Number.isInteger);
                return allowed.length === 0 || allowed.includes(vm.package_id);
            });
        }
        res.json({
            success: true,
            current_os_template_id: vm.current_os_template_id,
            data: filtered
        });
    });

    module.exports = router;

