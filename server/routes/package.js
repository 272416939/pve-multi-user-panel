var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
var pveApi = require('../api/pve-api');
var ikuaiApi = require('../api/ikuai-api');
var { generateVmName, generateLxcName } = require('../utils/random-name');
var { removeDhcpStaticBinding } = require('../services/dhcp');
var { createEmailTemplate, sendEmail } = require('../utils/email');

function safeError(e) { return process.env.DEBUG === 'true' ? e.message : '服务器错误'; }

// ===== VM 套餐 =====
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
        await pveApi.cloneVm(template.template_vmid, newVmid, {
            name: randomName,
            target: template.target_storage || undefined,
            clone_mode: template.clone_mode || 'full'
        });

        // 应用模板配置（CPU/内存）
        try {
            await pveApi.updateVmConfig(newVmid, { cores: template.cores, memory: template.memory });
        } catch (configErr) { console.error('[package] VM config update failed:', configErr.message); }

        // CPU 亲和性
        if (template.cpu_affinity) {
            try {
                await pveApi.updateVmConfig(newVmid, { affinity: template.cpu_affinity });
            } catch (affErr) { console.error('[package] VM affinity config failed:', affErr.message); }
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
        var amount = pkg.monthly_price || 0;
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'vm', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: amount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: amount,
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
        var amount = pkg.monthly_price || 0;
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'lxc', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: amount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: now.toISOString(),
            pay_method: 'balance', trade_type: 'new_order', amount: amount,
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

        res.json({ message: 'LXC 开通成功', ct: newCt, name: randomName, vmid: newVmid });
    } catch (e) {
        console.error('[package] LXC 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
