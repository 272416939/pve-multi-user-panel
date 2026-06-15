var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
var pveApi = require('../api/pve-api');
var ikuaiApi = require('../api/ikuai-api');
var { generateVmName, generateLxcName } = require('../utils/random-name');
var { createDhcpStaticBinding, removeDhcpStaticBinding } = require('../services/dhcp');
var { createEmailTemplate, sendEmail } = require('../utils/email');
var { calculateAmount, deductBalance, setVmAffinity } = require('../utils/order-utils');
var { execSSHWithStdin } = require('../api/ssh-exec');
var crypto = require('crypto');

function safeError(e) { return process.env.DEBUG === 'true' ? e.message : '服务器错误'; }

function generateRandomPassword() {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var pwd = '';
    for (var i = 0; i < 12; i++) {
        pwd += chars[crypto.randomInt(0, chars.length)];
    }
    return pwd;
}

function logPveError(e) {
    console.error('[package] PVE API 错误详情:', e.message);
    if (e.response) {
        console.error('[package] PVE 响应状态:', e.response.status);
        console.error('[package] PVE 响应数据:', JSON.stringify(e.response.data || ''));
    }
}

// ===== 用户侧：套餐列表（无需 admin） =====
router.get('/vm-packages', authMiddleware, async (req, res) => {
    try { res.json(await db.vmPackages.getAll()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/lxc-packages', authMiddleware, async (req, res) => {
    try { res.json(await db.lxcPackages.getAll()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ===== 用户侧：套餐订购（自动取当前用户） =====
router.post('/vm-packages/:id/order', authMiddleware, async (req, res) => {
    try {
        var userId = req.user.id;
        var packageId = parseInt(req.params.id);
        var period = req.body.period || 'month';
        var period_count = req.body.period_count || 1;
        var macGroupId = req.body.mac_group_id || '';

        var pkg = await db.vmPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.vmTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });
        if (template.status !== 'active') return res.status(400).json({ error: '关联模板已停用' });

        var finalMacGroupId = macGroupId || template.mac_group_id || null;

        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count);
        await deductBalance(userId, totalAmount, db);

        var randomName = generateVmName();
        var newVmid = await pveApi.getNextAvailableVmid();

        // 检查模板 VM 状态，full clone 需要模板处于停止状态
        try {
            var tmplStatus = await pveApi.getVmStatus(template.template_vmid);
            if (tmplStatus && tmplStatus.status === 'running') {
                console.error('[package] 模板 VM ' + template.template_vmid + ' 正在运行，无法进行 full clone');
                return res.status(400).json({ error: '模板虚拟机正在运行，请先停止后再订购' });
            }
        } catch (statusErr) {
            console.error('[package] 检查模板 VM 状态失败:', statusErr.message);
        }

        var upid = await pveApi.cloneVm(template.template_vmid, newVmid, {
            name: randomName,
            storage: template.target_storage || undefined,
            clone_mode: template.clone_mode || 'full'
        });
        await pveApi.waitForTask(upid);

        await pveApi.updateVmConfig(newVmid, { cores: template.cores, memory: template.memory });

        if (template.cpu_affinity) {
            await setVmAffinity(newVmid, template.cpu_affinity);
        }

        var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);

        var newVm = await db.vms.create({
            vm_id: newVmid, user_id: userId, name: randomName, expiration_date: expDate.toISOString(),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1)), renewal_period: period
        });

        if (finalMacGroupId) {
            try {
                var macCfg = await pveApi.getVmConfig(newVmid);
                var vmac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
                if (vmac) {
                    await ikuaiApi.addMacToGroup(finalMacGroupId, vmac[0], randomName);
                    await db.vms.update(newVm.id, { ikuai_mac_group_id: finalMacGroupId });
                }
            } catch (macErr) { console.error('[package] VM MAC sync failed:', macErr.message); }
        }

        // DHCP 静态绑定
        try {
            var dhcpMac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
            if (dhcpMac) {
                var dhcpIp = await createDhcpStaticBinding('vm', newVmid, dhcpMac[0], '');
                if (dhcpIp) {
                    await db.vms.update(newVm.id, { dhcp_static_ip: dhcpIp });
                }
            }
        } catch (dhcpErr) { console.error('[package] VM DHCP绑定失败:', dhcpErr.message); }

        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ORDER_' + dateStr + '_' + String(Math.floor(Math.random() * 900000 + 100000));
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'vm', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid),
            mac_group_id: finalMacGroupId || ''
        });
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });

        try {
            await db.messages.create({
                uid: userId, title: '服务器开通成功',
                content: '您的虚拟机 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。',
                type: 1, is_read: 0, send_type: 1
            });
        } catch (e) { console.error('[package] VM 消息发送失败', e); }
        try {
            var user = await db.users.getById(userId);
            if (user && user.email && user.emailVerified) {
                var emailHtml = createEmailTemplate('服务器开通成功',
                    '<p>您的新服务器已开通成功！</p><p>类型：虚拟机</p><p>名称：' + randomName + '</p><p>订单号：' + orderNo + '</p>'
                );
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        } catch (e) { console.error('[package] VM 邮件发送失败', e); }

        // 自动开机
        try {
            await pveApi.startVm(newVmid);
        } catch (startErr) { console.error('[package] VM 自动开机失败:', startErr.message); }

        res.json({ message: 'VM 开通成功', vm: newVm, name: randomName, vmid: newVmid, order_no: orderNo });
    } catch (e) {
        console.error('[package] 用户订购 VM 失败:', e.message);
        logPveError(e);
        res.status(500).json({ error: safeError(e) });
    }
});

router.post('/lxc-packages/:id/order', authMiddleware, async (req, res) => {
    try {
        var userId = req.user.id;
        var packageId = parseInt(req.params.id);
        var period = req.body.period || 'month';
        var period_count = req.body.period_count || 1;
        var macGroupId = req.body.mac_group_id || '';

        var pkg = await db.lxcPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.lxcTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });
        if (template.status !== 'active') return res.status(400).json({ error: '关联模板已停用' });

        var finalMacGroupId = macGroupId || template.mac_group_id || null;

        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count);
        await deductBalance(userId, totalAmount, db);

        var randomName = generateLxcName();
        var newVmid = await pveApi.getNextAvailableVmid();

        await pveApi.createLxc({
            vmid: String(newVmid), ostemplate: template.ostemplate,
            storage: template.storage || 'local', hostname: randomName,
            cores: template.cores, memory: template.memory, swap: template.swap,
            rootfs: (template.rootfs_storage || template.storage || 'local-lvm') + ':' + (template.disk_size),
            net0: 'name=eth0,bridge=' + (template.network_bridge || 'vmbr0') + ',ip=' + (template.network_mode === 'dhcp' ? 'dhcp' : ''),
            unprivileged: template.unprivileged !== undefined ? template.unprivileged : 1,
            features: template.features || '', start: 0
        });

        var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);

        var newCt = await db.lxcContainers.create({
            ct_id: newVmid, user_id: userId, name: randomName, expiration_date: expDate.toISOString(),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1)), renewal_period: period
        });

        if (finalMacGroupId) {
            try {
                // LXC 刚创建时 config.net0 可能不含 MAC，先启动再获取
                var lxcStatus = await pveApi.getLxcStatus(newVmid);
                var needStart = lxcStatus && lxcStatus.status === 'stopped';
                if (needStart) {
                    await pveApi.startLxc(newVmid);
                    // 等待 PVE 分配 MAC
                    await new Promise(function(r) { setTimeout(r, 3000); });
                }
                var lxcCfg = await pveApi.getLxcConfig(newVmid);
                var lmac = lxcCfg && lxcCfg.net0 ? lxcCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
                if (lmac) {
                    await ikuaiApi.addMacToGroup(finalMacGroupId, lmac[0], randomName);
                    await db.lxcContainers.update(newCt.id, { ikuai_mac_group_id: finalMacGroupId });
                }
            } catch (macErr) { console.error('[package] LXC MAC sync failed:', macErr.message); }
        }

        // DHCP 静态绑定
        try {
            var lxcDhcpCfg = await pveApi.getLxcConfig(newVmid);
            var dhcpLxcMac = lxcDhcpCfg && lxcDhcpCfg.net0 ? lxcDhcpCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
            if (dhcpLxcMac) {
                var dhcpLxcIp = await createDhcpStaticBinding('lxc', newVmid, dhcpLxcMac[0], '');
                if (dhcpLxcIp) {
                    await db.lxcContainers.update(newCt.id, { dhcp_static_ip: dhcpLxcIp });
                }
            }
        } catch (dhcpErr) { console.error('[package] LXC DHCP绑定失败:', dhcpErr.message); }

        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ORDER_' + dateStr + '_' + String(Math.floor(Math.random() * 900000 + 100000));
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'lxc', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid),
            mac_group_id: finalMacGroupId || ''
        });
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });

        try {
            await db.messages.create({
                uid: userId, title: '容器开通成功',
                content: '您的容器 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。',
                type: 1, is_read: 0, send_type: 1
            });
        } catch (e) { console.error('[package] LXC 消息发送失败', e); }
        try {
            var user = await db.users.getById(userId);
            if (user && user.email && user.emailVerified) {
                var emailHtml = createEmailTemplate('容器开通成功',
                    '<p>您的新容器已开通成功！</p><p>类型：LXC 容器</p><p>名称：' + randomName + '</p><p>订单号：' + orderNo + '</p>'
                );
                await sendEmail(user.email, '容器开通成功', emailHtml);
            }
        } catch (e) { console.error('[package] LXC 邮件发送失败', e); }

        // 自动开机
        try {
            await pveApi.startLxc(newVmid);
        } catch (startErr) { console.error('[package] LXC 自动开机失败:', startErr.message); }

        // 生成随机 root 密码并设置
        var lxcPassword = '';
        try {
            lxcPassword = generateRandomPassword();
            var sshHost = process.env.PVE_SSH_HOST;
            var sshPass = process.env.PVE_SSH_PASSWORD;
            if (sshHost && sshPass) {
                await execSSHWithStdin(sshHost, 'root', sshPass,
                    'lxc-attach -n ' + newVmid + ' -- chpasswd',
                    'root:' + lxcPassword + '\n', 30000
                );
            }
        } catch (pwdErr) { console.error('[package] LXC 设置密码失败:', pwdErr.message); }

        // 发送密码通知（站内信）
        if (lxcPassword) {
            try {
                await db.messages.create({
                    uid: userId, title: '容器 root 密码',
                    content: '您的容器 ' + randomName + ' 的 root 密码已设置。\nRoot 账号：root\n密码：' + lxcPassword + '\n请尽快修改密码。',
                    type: 2, send_type: 1
                });
            } catch (e) { console.error('[package] LXC 密码通知发送失败', e); }
            try {
                var pwdUser = await db.users.getById(userId);
                if (pwdUser && pwdUser.email && pwdUser.emailVerified) {
                    var pwdEmailHtml = createEmailTemplate('容器 root 密码',
                        '<div class="info-box" style="border-left-color: #667eea;">' +
                        '<p style="margin-bottom: 8px;"><strong>您的容器 ' + randomName + ' 已开通</strong></p>' +
                        '<p style="margin-bottom: 4px;">Root 账号：root</p>' +
                        '<p style="margin-bottom: 4px;">密码：' + lxcPassword + '</p>' +
                        '</div><div class="divider"></div>' +
                        '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>'
                    );
                    await sendEmail(pwdUser.email, '容器 root 密码 - PVE 管理面板', pwdEmailHtml);
                }
            } catch (e) { console.error('[package] LXC 密码邮件发送失败', e); }
        }

        res.json({ message: 'LXC 开通成功', ct: newCt, name: randomName, vmid: newVmid, order_no: orderNo });
    } catch (e) {
        console.error('[package] 用户订购 LXC 失败:', e.message);
        logPveError(e);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== VM 套餐（管理员） =====
router.get('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.vmPackages.getAll()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.vmPackages.create(req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.vmPackages.update(parseInt(req.params.id), req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { await db.vmPackages.delete(parseInt(req.params.id)); res.json({ message: '已删除' }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// VM 套餐开通（核心）
router.post('/admin/vm-packages/:id/provision', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var packageId = parseInt(req.params.id);
        var userId = parseInt(req.body.user_id);
        var name = req.body.name || '';
        var expDate = req.body.expiration_date || null;
        var renewalPrice = req.body.renewal_price || '';
        var renewalPeriod = req.body.renewal_period || 'month';
        var period = req.body.period || 'month';
        var period_count = req.body.period_count || 1;

        if (!userId) return res.status(400).json({ error: '请选择用户' });

        var pkg = await db.vmPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.vmTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });

        var macGroupId = template.mac_group_id || null;

        // 生成随机名
        var randomName = name || generateVmName();
        var newVmid = await pveApi.getNextAvailableVmid();

        // Clone VM
        var upid = await pveApi.cloneVm(template.template_vmid, newVmid, {
            name: randomName,
            storage: template.target_storage || undefined,
            clone_mode: template.clone_mode || 'full'
        });
        await pveApi.waitForTask(upid);

        // 应用模板配置（CPU/内存）
        await pveApi.updateVmConfig(newVmid, { cores: template.cores, memory: template.memory });

        // CPU 亲和性
        if (template.cpu_affinity) {
            await setVmAffinity(newVmid, template.cpu_affinity);
        }

        // 创建分配记录
        var newVm = await db.vms.create({
            vm_id: newVmid,
            user_id: userId,
            name: randomName,
            expiration_date: expDate,
            renewal_price: renewalPrice || String(pkg.monthly_price),
            renewal_period: renewalPeriod
        });

        // MAC 分组同步
        if (macGroupId) {
            try {
                var macCfg = await pveApi.getVmConfig(newVmid);
                var vmac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
                if (vmac) {
                    await ikuaiApi.addMacToGroup(macGroupId, vmac[0], randomName);
                    await db.vms.update(newVm.id, { ikuai_mac_group_id: macGroupId });
                }
            } catch (macErr) { console.error('[package] VM MAC sync failed:', macErr.message); }
        }

        // 生成订单号
        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ORDER_' + dateStr + '_' + String(Math.floor(Math.random() * 900000 + 100000));
        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count);
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'vm', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });
        // 发送站内信
        try {
            await db.messages.create({
                uid: userId, title: '服务器开通成功',
                content: '您的虚拟机 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。到期时间：' + (expDate || '无'),
                type: 1, is_read: 0, send_type: 1
            });
        } catch (e) { console.error('[package] VM 消息发送失败', e); }
        // 发送邮件
        try {
            var user = await db.users.getById(userId);
            if (user && user.email && user.emailVerified) {
                var emailHtml = createEmailTemplate('服务器开通成功',
                    '<p>您的新服务器已开通成功！</p>' +
                    '<p>类型：虚拟机</p>' +
                    '<p>名称：' + randomName + '</p>' +
                    '<p>订单号：' + orderNo + '</p>' +
                    '<p>到期时间：' + (expDate || '无') + '</p>'
                );
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        } catch (e) { console.error('[package] VM 邮件发送失败', e); }

        // 自动开机
        try {
            await pveApi.startVm(newVmid);
        } catch (startErr) { console.error('[package] VM 自动开机失败:', startErr.message); }

        res.json({ message: 'VM 开通成功', vm: newVm, name: randomName, vmid: newVmid });
    } catch (e) {
        console.error('[package] VM 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== LXC 套餐 =====
router.get('/admin/lxc-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.lxcPackages.getAll()); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/admin/lxc-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.lxcPackages.create(req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.put('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { res.json(await db.lxcPackages.update(parseInt(req.params.id), req.body)); } catch (e) { res.status(500).json({ error: e.message }); }
});

router.delete('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { await db.lxcPackages.delete(parseInt(req.params.id)); res.json({ message: '已删除' }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// LXC 套餐开通（核心）
router.post('/admin/lxc-packages/:id/provision', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var packageId = parseInt(req.params.id);
        var userId = parseInt(req.body.user_id);
        var name = req.body.name || '';
        var expDate = req.body.expiration_date || null;
        var renewalPrice = req.body.renewal_price || '';
        var renewalPeriod = req.body.renewal_period || 'month';
        var period = req.body.period || 'month';
        var period_count = req.body.period_count || 1;

        if (!userId) return res.status(400).json({ error: '请选择用户' });

        var pkg = await db.lxcPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.lxcTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });

        var macGroupId = template.mac_group_id || null;

        var randomName = name || generateLxcName();
        var newVmid = await pveApi.getNextAvailableVmid();

        // 创建 LXC
        await pveApi.createLxc({
            vmid: String(newVmid),
            ostemplate: template.ostemplate,
            storage: template.storage || 'local',
            hostname: randomName,
            cores: template.cores,
            memory: template.memory,
            swap: template.swap,
            rootfs: (template.rootfs_storage || template.storage || 'local-lvm') + ':' + (template.disk_size),
            net0: 'name=eth0,bridge=' + (template.network_bridge || 'vmbr0') + ',ip=' + (template.network_mode === 'dhcp' ? 'dhcp' : ''),
            unprivileged: template.unprivileged !== undefined ? template.unprivileged : 1,
            features: template.features || '',
            start: 0
        });

        // 创建分配记录
        var newCt = await db.lxcContainers.create({
            ct_id: newVmid,
            user_id: userId,
            name: randomName,
            expiration_date: expDate,
            renewal_price: renewalPrice || String(pkg.monthly_price),
            renewal_period: renewalPeriod
        });

        // MAC 分组同步
        if (macGroupId) {
            try {
                var macCfg = await pveApi.getLxcConfig(newVmid);
                var cmac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
                if (cmac) {
                    await ikuaiApi.addMacToGroup(macGroupId, cmac[0], randomName);
                    await db.lxcContainers.update(newCt.id, { ikuai_mac_group_id: macGroupId });
                }
            } catch (macErr) { console.error('[package] LXC MAC sync failed:', macErr.message); }
        }

        // 生成订单号
        var now = new Date();
        var dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        var orderNo = 'ORDER_' + dateStr + '_' + String(Math.floor(Math.random() * 900000 + 100000));
        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count);
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'lxc', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });
        // 发送站内信
        try {
            await db.messages.create({
                uid: userId, title: '服务器开通成功',
                content: '您的容器 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。到期时间：' + (expDate || '无'),
                type: 1, is_read: 0, send_type: 1
            });
        } catch (e) { console.error('[package] LXC 消息发送失败', e); }
        // 发送邮件
        try {
            var user = await db.users.getById(userId);
            if (user && user.email && user.emailVerified) {
                var emailHtml = createEmailTemplate('服务器开通成功',
                    '<p>您的新服务器已开通成功！</p>' +
                    '<p>类型：容器</p>' +
                    '<p>名称：' + randomName + '</p>' +
                    '<p>订单号：' + orderNo + '</p>' +
                    '<p>到期时间：' + (expDate || '无') + '</p>'
                );
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        } catch (e) { console.error('[package] LXC 邮件发送失败', e); }

        // 自动开机
        try {
            await pveApi.startLxc(newVmid);
        } catch (startErr) { console.error('[package] LXC 自动开机失败:', startErr.message); }

        // 生成随机 root 密码并设置
        var adminLxcPwd = '';
        try {
            adminLxcPwd = generateRandomPassword();
            var sshHost = process.env.PVE_SSH_HOST;
            var sshPass = process.env.PVE_SSH_PASSWORD;
            if (sshHost && sshPass) {
                await execSSHWithStdin(sshHost, 'root', sshPass,
                    'lxc-attach -n ' + newVmid + ' -- chpasswd',
                    'root:' + adminLxcPwd + '\n', 30000
                );
            }
        } catch (pwdErr) { console.error('[package] LXC 设置密码失败:', pwdErr.message); }

        // 发送密码通知（站内信）
        if (adminLxcPwd) {
            try {
                await db.messages.create({
                    uid: userId, title: '容器 root 密码',
                    content: '您的容器 ' + randomName + ' 的 root 密码已设置。\nRoot 账号：root\n密码：' + adminLxcPwd + '\n请尽快修改密码。',
                    type: 2, send_type: 1
                });
            } catch (e) { console.error('[package] LXC 密码通知发送失败', e); }
            try {
                var adminPwdUser = await db.users.getById(userId);
                if (adminPwdUser && adminPwdUser.email && adminPwdUser.emailVerified) {
                    var adminPwdEmailHtml = createEmailTemplate('容器 root 密码',
                        '<div class="info-box" style="border-left-color: #667eea;">' +
                        '<p style="margin-bottom: 8px;"><strong>您的容器 ' + randomName + ' 已开通</strong></p>' +
                        '<p style="margin-bottom: 4px;">Root 账号：root</p>' +
                        '<p style="margin-bottom: 4px;">密码：' + adminLxcPwd + '</p>' +
                        '</div><div class="divider"></div>' +
                        '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>'
                    );
                    await sendEmail(adminPwdUser.email, '容器 root 密码 - PVE 管理面板', adminPwdEmailHtml);
                }
            } catch (e) { console.error('[package] LXC 密码邮件发送失败', e); }
        }

        res.json({ message: 'LXC 开通成功', ct: newCt, name: randomName, vmid: newVmid });
    } catch (e) {
        console.error('[package] LXC 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
