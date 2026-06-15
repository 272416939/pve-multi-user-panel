const express = require('express');
const router = express.Router();
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const ikuaiApi = require('../api/ikuai-api');
const { _applyRate } = require('../utils/pve-rate');
const { getStatusCache } = require('../websocket/push-proxy');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { createDhcpStaticBinding, removeDhcpStaticBinding, updateDhcpStaticBindingIp, pickUnusedStaticIp } = require('../services/dhcp');
const dbg = require('../utils/debug');
const vncProxy = require('../websocket/vnc-proxy');
// H-9 修复：生产环境隐藏详细错误信息
function safeError(e) {
    const isDebug = process.env.DEBUG === 'true';
    if (isDebug) return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}
// P2-H1① 修复：PVE VM 列表需管理员权限（包含所有节点 VM 分配信息）
router.get('/pve/vms', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vms = await pveApi.getVms(req.query.template_only ? { templateOnly: true } : {});
        
        // 获取已分配的VMID
        const assignedVms = await db.vms.getAll();
        const assignedVmIds = new Set(assignedVms.map(vm => vm.vm_id));
        
        // 将虚拟机分为待分配和已分配，并按VMID降序排序
        const availableVms = vms
            .filter(vm => !assignedVmIds.has(vm.vmid))
            .sort((a, b) => b.vmid - a.vmid);
        
        const assignedVmsWithUsers = await Promise.all(
            vms
            .filter(vm => assignedVmIds.has(vm.vmid))
            .sort((a, b) => b.vmid - a.vmid)
            .map(async vm => {
                const assignment = assignedVms.find(a => a.vm_id === vm.vmid);
                const user = assignment ? await db.users.getById(assignment.user_id) : null;
                return {
                    ...vm,
                    assigned_user: user ? user.username : null,
                    assignment_id: assignment ? assignment.id : null
                };
            })
        );
        
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
        let userVms;
        if (req.user.role === 'admin') {
            userVms = await Promise.all((await db.vms.getAll()).map(async vm => {
                const user = await db.users.getById(vm.user_id);
                return { ...vm, username: user?.username };
            }));
        } else {
            userVms = await db.vms.getByUserId(req.user.id);
        }
 
        // 先构建基础数据（不依赖 PVE 状态查询）
        const vmsWithDetails = userVms.map(vm => ({
            ...vm,
            status: null,
            config: null,
            isExpired: vm.expiration_date ? new Date(vm.expiration_date + 'Z') < new Date() : false,
            destroyed: false,
            error: null
        }));
 
        // 再尝试获取 PVE 状态，每个 VM 独立处理
        for (const vmData of vmsWithDetails) {
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
            return res.json(userVms.map(vm => ({
                ...vm,
                status: null,
                config: null,
                isExpired: vm.expiration_date ? new Date(vm.expiration_date + 'Z') < new Date() : false,
                destroyed: false
            })));
        } catch (e2) {
            console.error('兜底返回也失败:', e2);
            res.json([]);
        }
    }
});

router.post('/user/vms', authMiddleware, adminMiddleware, async (req, res) => {
    const { vm_id, user_id, name, expiration_date, renewal_price, renewal_period, mac_group_id } = req.body;
 
    if (!vm_id || !user_id) {
        return res.status(400).json({ error: '请选择虚拟机和用户' });
    }
 
    const parsedVmId = parseInt(vm_id);
    const parsedUserId = parseInt(user_id);
 
    if (isNaN(parsedVmId) || isNaN(parsedUserId)) {
        return res.status(400).json({ error: '无效的虚拟机或用户ID' });
    }
 
    const existingVms = await db.vms.getAll();
    if (existingVms.find(vm => vm.vm_id === parsedVmId && vm.user_id === parsedUserId)) {
        return res.status(400).json({ error: '该虚拟机已分配给此用户' });
    }
 
    const newVm = await db.vms.create({
        vm_id: parsedVmId,
        user_id: parsedUserId,
        name,
        expiration_date,
        renewal_price: renewal_price || '',
        renewal_period: renewal_period || 'month'
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
    } catch (e) {}

    const assignedUser = await db.users.getById(parseInt(user_id));
    if (assignedUser && assignedUser.email && assignedUser.emailVerified) {
        try {
            const expiryStr = expiration_date ? new Date(expiration_date + 'Z').toLocaleString('zh-CN') : '永久有效';
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
            await sendEmail(
                assignedUser.email,
                '虚拟机已开通 - PVE 管理面板',
                createEmailTemplate('虚拟机开通通知', emailContent)
            );
        } catch (emailError) {
            console.error(`发送 VM 开通邮件给 ${assignedUser.username} 失败:`, emailError.message);
        }
    }
    
    // 分配后尝试自动开机（如果虚拟机是停机状态）
    try {
        const currentStatus = await pveApi.getVmStatus(parseInt(vm_id));
        if (currentStatus && currentStatus.status === 'stopped') {
            await pveApi.startVm(parseInt(vm_id));
            dbg(`虚拟机 ${vm_id} 已自动开机（分配后）`);
        }
    } catch (startError) {
        console.error(`虚拟机 ${vm_id} 自动开机失败:`, startError.message);
    }
    
    res.json(newVm);
});

router.put('/user/vms/:id', authMiddleware, async (req, res) => {
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
    
    // 管理员延长到期时间后，如果虚拟机之前因到期停机，尝试自动开机
    if (isAdmin && expiration_date !== undefined) {
        try {
            const newExp = new Date(expiration_date + 'Z');
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
});

router.delete('/user/vms/:id', authMiddleware, adminMiddleware, async (req, res) => {
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
                await sendEmail(
                    removedUser.email,
                    '虚拟机已被移除 - PVE 管理面板',
                    createEmailTemplate('虚拟机移除通知', emailContent)
                );
            } catch (emailError) {
                console.error(`发送 VM 移除邮件给 ${removedUser.username} 失败:`, emailError.message);
            }
        }
    }

    res.json({ message: '虚拟机移除成功' });
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
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
            if (isOwner && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，无法开机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.startVm(vmid);
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
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.shutdownVm(vmid);
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
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.stopVm(vmid);
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
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
                return res.status(403).json({ error: '虚拟机已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        await pveApi.rebootVm(vmid);
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

        // 安全修复：注册 ticket 到校验存储，WebSocket 代理连接时会校验
        await vncProxy.registerTicket(result.ticket, vmid, req.user.id);

        // 返回代理页面，通过我们的服务器转发 VNC 流量
        const proxyUrl = `/vnc.html?node=${result.node}&vmid=${vmid}&port=${result.port}&ticket=${encodeURIComponent(result.ticket)}&userId=${req.user.id}`;
        res.json({ proxyUrl });
    } catch (error) {
        console.error('获取 VNC 控制台失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/vm/:vmid/status', authMiddleware, async (req, res) => {
    try {
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
router.get('/vm/random-ip', authMiddleware, async (req, res) => {
    try {
        const ip = await pickUnusedStaticIp();
        if (!ip) return res.status(400).json({ error: '无可用 IP' });
        res.json({ ip });
    } catch (error) {
        res.status(500).json({ error: '获取随机 IP 失败' });
    }
});

router.post('/vm/:vmid/reset-ip', authMiddleware, adminMiddleware, async (req, res) => {
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
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此虚拟机，资源未分配' });
        }

        if (ip_mode === 'dhcp') {
            // DHCP模式：删除爱快静态绑定（如果有），VM将自动从爱快获取动态IP
            await removeDhcpStaticBinding('vm', vmid);
            if (vmRecord) await db.vms.update(vmRecord.id, { dhcp_static_ip: '' });
            return res.json({ success: true, ip: null, message: '已切换为DHCP模式' });
        }

        // static 或 random 模式：更新/创建爱快DHCP静态绑定
        let targetIp = '';
        if (ip_mode === 'static') {
            if (!ip) return res.status(400).json({ error: '请输入 IP 地址' });
            const ipBase = ip.split('/')[0];
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipBase)) return res.status(400).json({ error: 'IP 格式不正确' });
            targetIp = ipBase;
        } else if (ip_mode === 'random') {
            targetIp = await pickUnusedStaticIp();
            if (!targetIp) return res.status(400).json({ error: '无可用 IP，请手动输入' });
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
            // 没有已有绑定，创建新的
            const boundIp = await createDhcpStaticBinding('vm', vmid, macMatch[1], finalIp);
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
                        try {
                            await ikuaiApi.editPortForward(rule.ikuai_id, {
                                ip: finalIp,
                                internal_port: rule.internal_port,
                                external_port: rule.external_port,
                                protocol: rule.protocol,
                                comment: rule.name || '',
                                interface: await db.config.get('forward:wan_interface') || ''
                            });
                        } catch (e) {
                            console.error(`端口转发 ${rule.id} ikuai 同步失败:`, e.message);
                        }
                    }
                }
            } catch (e) {
                console.error(`VM ${vmid} 更新端口转发 IP 失败:`, e.message);
            }
        }

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

        if (!password || password.length < 6) {
            return res.status(400).json({ error: '密码长度至少 6 位' });
        }

        const allVms = await db.vms.getAll();
        const vm = allVms.find(v => v.vm_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (vm) {
            const isOwner = req.user.id === vm.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此虚拟机' });
            }
            if (isOwner && !isAdmin && vm.expiration_date && new Date(vm.expiration_date + 'Z') < new Date()) {
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

        res.json({ message: '密码重置成功' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/vm/:vmid/destroy', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const force = req.query.force === '1';

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

        const assignedVms = (await db.vms.getAll()).filter(v => v.vm_id === vmid);
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
            await db.vms.delete(vm.id);
        }

        try {
            await pveApi.destroyVm(vmid);
            console.log(`[vm] PVE 虚拟机 ${vmid} 已销毁`);
        } catch (e) {
            console.error(`[vm] PVE 销毁 ${vmid} 失败:`, e.message);
            return res.status(500).json({ error: 'PVE 销毁虚拟机失败：' + e.message });
        }

        res.json({ message: '虚拟机已销毁' });
    } catch (error) {
        console.error('销毁虚拟机失败:', error);
        res.status(500).json({ error: safeError(error) });
    }
});


module.exports = router;

