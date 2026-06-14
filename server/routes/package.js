var express = require('express');
var router = express.Router();
var { authMiddleware, adminMiddleware } = require('../middleware/auth');
var db = require('../api/db');
var pveApi = require('../api/pve-api');
var ikuaiApi = require('../api/ikuai-api');
var { generateVmName, generateLxcName } = require('../utils/random-name');
var { removeDhcpStaticBinding } = require('../services/dhcp');

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
        var macGroupId = req.body.mac_group_id || null;

        if (!userId) return res.status(400).json({ error: '请选择用户' });

        var pkg = await db.vmPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.vmTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });

        // 生成随机名
        var randomName = name || generateVmName();
        var newVmid = await pveApi.getNextAvailableVmid();

        // Clone VM
        await pveApi.cloneVm(template.template_vmid, newVmid, { name: randomName });

        // 应用套餐配置（CPU/内存）
        try {
            await pveApi.updateVmConfig(newVmid, { cores: pkg.cores, memory: pkg.memory });
        } catch (configErr) { console.error('[package] VM config update failed:', configErr.message); }

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
        var macGroupId = req.body.mac_group_id || null;

        if (!userId) return res.status(400).json({ error: '请选择用户' });

        var pkg = await db.lxcPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });

        var template = await db.lxcTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });

        var randomName = name || generateLxcName();
        var newVmid = await pveApi.getNextAvailableVmid();

        // 创建 LXC
        await pveApi.createLxc({
            vmid: String(newVmid),
            ostemplate: template.ostemplate,
            storage: template.storage || 'local',
            hostname: randomName,
            cores: pkg.cores || template.cores,
            memory: pkg.memory || template.memory,
            swap: pkg.swap || template.swap,
            rootfs: (template.storage || 'local') + ':' + (pkg.disk_size || template.disk_size),
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

        res.json({ message: 'LXC 开通成功', ct: newCt, name: randomName, vmid: newVmid });
    } catch (e) {
        console.error('[package] LXC 套餐开通失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
