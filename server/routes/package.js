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
var cacheStore = require('../utils/cache-store');
var { checkRateLimit } = require('../middleware/rate-limiter');

var UPID_REGEX = /^UPID:[a-zA-Z0-9_-]+:[0-9a-fA-F]+:[0-9a-fA-F]+:[0-9a-fA-F]+:[a-zA-Z]+:[^:]*:[^:]*(?::.*)?$/;
var VALID_PERIODS = ['month', 'quarter', 'year'];

// 套餐列表缓存（5 分钟 TTL，低频变更场景）
var vmPackageCache = cacheStore.create('vm_packages', 300);
var lxcPackageCache = cacheStore.create('lxc_packages', 300);

function safeError(e) { return process.env.DEBUG === 'true' ? e.message : '服务器错误'; }

// 将 Date 对象格式化为本地时间字符串 YYYY-MM-DD HH:MM:SS（避免 toISOString() 转换为 UTC）
function formatLocalDate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    var h = String(d.getHours()).padStart(2, '0');
    var mi = String(d.getMinutes()).padStart(2, '0');
    var s = String(d.getSeconds()).padStart(2, '0');
    return y + '-' + m + '-' + dd + ' ' + h + ':' + mi + ':' + s;
}

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
    try {
        var cached = await vmPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.vmPackages.getAll();
        await vmPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.get('/lxc-packages', authMiddleware, async (req, res) => {
    try {
        var cached = await lxcPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.lxcPackages.getAll();
        await lxcPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// 用户端：获取按分组归类的套餐列表
router.get('/package-groups', authMiddleware, async (req, res) => {
    try {
        var type = req.query.type || 'vm';
        var groups = await db.packageGroups.getByType(type);
        var packages = type === 'vm' ? await db.vmPackages.getAll() : await db.lxcPackages.getAll();
        // 只返回 active 套餐
        packages = packages.filter(function(p) { return p.status === 'active'; });
        res.json({ groups: groups, packages: packages });
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

// ===== 用户侧：套餐订购（自动取当前用户） =====
router.post('/vm-packages/:id/order', authMiddleware, async (req, res) => {
    try {
        var userId = req.user.id;
        var packageId = parseInt(req.params.id);
        var period = req.body.period || 'month';
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);
        if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
            return res.status(400).json({ error: '订购数量必须为1-99的正整数' });
        }
        var macGroupId = req.body.mac_group_id || '';

        var pkg = await db.vmPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });
        // 库存校验：-1 表示不限量，0 表示售罄，null 兼容旧数据视为不限量
        if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock <= 0) {
            return res.status(400).json({ error: '该套餐已售罄' });
        }

        var template = await db.vmTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });
        if (template.status !== 'active') return res.status(400).json({ error: '关联模板已停用' });

        var finalMacGroupId = macGroupId || template.mac_group_id || null;

        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);
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

        // 预创建 DB 记录，pve_upid 有值表示开通中，便于前端通过 PVE 真实任务状态跟踪
        var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);
        var newVm = await db.vms.create({
            vm_id: newVmid, user_id: userId, name: randomName, expiration_date: formatLocalDate(expDate),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1, pkg.quarterly_discount, pkg.yearly_discount)), renewal_period: period,
            monthly_price: String(pkg.monthly_price || ''),
            quarterly_discount: String(pkg.quarterly_discount || ''),
            yearly_discount: String(pkg.yearly_discount || ''),
            pve_upid: upid
        });

        // 等待 clone 任务完成；失败则清理预创建记录并退款（订单/库存尚未创建，无需回滚）
        try {
            await pveApi.waitForTask(upid);
        } catch (taskErr) {
            try { await db.vms.delete(newVm.id); } catch (e) {}
            try { await db.users.incrementBalance(userId, totalAmount); } catch (e) {}
            throw taskErr;
        }

        // 开通完成，清空 pve_upid（表示开通完成）
        newVm = await db.vms.update(newVm.id, { pve_upid: '' });

        var vmUpdateCfg = { cores: template.cores, memory: template.memory };
        if (template.ciuser) {
            vmUpdateCfg.ciuser = template.ciuser;
            vmUpdateCfg.cipassword = generateRandomPassword();
        }
        await pveApi.updateVmConfig(newVmid, vmUpdateCfg);

        if (template.cpu_affinity) {
            await setVmAffinity(newVmid, template.cpu_affinity);
        }

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
            user_id: userId, order_no: orderNo, pay_time: db.now(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });

        // 增加已售数量，并扣减剩余库存（-1 不限量不扣减）
        try {
            var vmUpdates = { sold_count: (pkg.sold_count || 0) + 1 };
            if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock > 0) {
                vmUpdates.stock = pkg.stock - 1;
            }
            await db.vmPackages.update(pkg.id, vmUpdates);
            await vmPackageCache.del('all');
        } catch (soldErr) { console.error('[package] 更新库存失败:', soldErr.message); }

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

        // Cloud-init 密码通知
        if (template.ciuser && vmUpdateCfg.cipassword) {
            try {
                await db.messages.create({
                    uid: userId, title: '服务器账号信息',
                    content: '您的虚拟机 ' + randomName + ' 已开通。\n账号：' + template.ciuser + '\n密码：' + vmUpdateCfg.cipassword + '\n请尽快修改密码。',
                    type: 2, send_type: 1
                });
            } catch (e) { console.error('[package] VM 密码通知发送失败', e); }
            try {
                var ciUser = await db.users.getById(userId);
                if (ciUser && ciUser.email && ciUser.emailVerified) {
                    var ciEmailHtml = createEmailTemplate('服务器账号信息',
                        '<div class="info-box" style="border-left-color: #667eea;">' +
                        '<p style="margin-bottom: 8px;"><strong>您的服务器 ' + randomName + ' 已开通</strong></p>' +
                        '<p style="margin-bottom: 4px;">账号：' + template.ciuser + '</p>' +
                        '<p style="margin-bottom: 4px;">密码：' + vmUpdateCfg.cipassword + '</p>' +
                        '</div><div class="divider"></div>' +
                        '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>'
                    );
                    await sendEmail(ciUser.email, '服务器账号信息 - PVE 管理面板', ciEmailHtml);
                }
            } catch (e) { console.error('[package] VM 密码邮件发送失败', e); }
        }

        // 自动开机
        try {
            await pveApi.startVm(newVmid);
        } catch (startErr) { console.error('[package] VM 自动开机失败:', startErr.message); }

        res.json({ message: 'VM 开通成功', vm: newVm, id: newVm.id, pve_upid: newVm.pve_upid || '', name: randomName, vmid: newVmid, order_no: orderNo });
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
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);
        if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
            return res.status(400).json({ error: '订购数量必须为1-99的正整数' });
        }
        var macGroupId = req.body.mac_group_id || '';

        var pkg = await db.lxcPackages.getById(packageId);
        if (!pkg) return res.status(404).json({ error: '套餐不存在' });
        // 库存校验：-1 表示不限量，0 表示售罄，null 兼容旧数据视为不限量
        if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock <= 0) {
            return res.status(400).json({ error: '该套餐已售罄' });
        }

        var template = await db.lxcTemplates.getById(pkg.template_id);
        if (!template) return res.status(404).json({ error: '关联模板不存在' });
        if (template.status !== 'active') return res.status(400).json({ error: '关联模板已停用' });

        var finalMacGroupId = macGroupId || template.mac_group_id || null;

        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);
        await deductBalance(userId, totalAmount, db);

        var randomName = generateLxcName();
        var newVmid = await pveApi.getNextAvailableVmid();

        var lxcResp = await pveApi.createLxc({
            vmid: String(newVmid), ostemplate: template.ostemplate,
            storage: template.storage || 'local', hostname: randomName,
            cores: template.cores, memory: template.memory, swap: template.swap,
            rootfs: (template.rootfs_storage || template.storage || 'local-lvm') + ':' + (template.disk_size),
            net0: (function(){
                var n = 'name=eth0,bridge=' + (template.network_bridge || 'vmbr0');
                if (template.network_mode === 'dhcp') {
                    n += ',ip=dhcp';
                } else if (template.ip4_addr) {
                    n += ',ip=' + template.ip4_addr;
                }
                if (template.ipv6_enabled != 0) {
                    if (template.ip6_mode === 'dhcp') {
                        n += ',ip6=dhcp';
                    } else if (template.ip6_mode === 'static' && template.ip6_addr) {
                        n += ',ip6=' + template.ip6_addr;
                    }
                }
                return n;
            })(),
            unprivileged: template.unprivileged !== undefined ? template.unprivileged : 1,
            features: template.features || '', start: 0
        });
        // createLxc 返回 response.data，PVE 创建接口返回 { data: upid }
        var lxcUpid = (lxcResp && lxcResp.data) ? lxcResp.data : lxcResp;

        var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);

        // 预创建 DB 记录，pve_upid 有值表示开通中，便于前端通过 PVE 真实任务状态跟踪
        var newCt = await db.lxcContainers.create({
            ct_id: newVmid, user_id: userId, name: randomName, expiration_date: formatLocalDate(expDate),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1, pkg.quarterly_discount, pkg.yearly_discount)), renewal_period: period,
            pve_upid: lxcUpid
        });

        // 等待 LXC 创建任务完成；失败则清理预创建记录并退款（订单/库存尚未创建，无需回滚）
        try {
            await pveApi.waitForTask(lxcUpid);
        } catch (taskErr) {
            try { await db.lxcContainers.delete(newCt.id); } catch (e) {}
            try { await db.users.incrementBalance(userId, totalAmount); } catch (e) {}
            throw taskErr;
        }

        // 开通完成，清空 pve_upid（表示开通完成）
        newCt = await db.lxcContainers.update(newCt.id, { pve_upid: '' });

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
            user_id: userId, order_no: orderNo, pay_time: db.now(),
            pay_method: 'balance', trade_type: 'new_order', amount: totalAmount,
            period: period, period_count: period_count,
            trade_no: '', api_trade_no: ''
        });

        // 增加已售数量，并扣减剩余库存（-1 不限量不扣减）
        try {
            var lxcUpdates = { sold_count: (pkg.sold_count || 0) + 1 };
            if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock > 0) {
                lxcUpdates.stock = pkg.stock - 1;
            }
            await db.lxcPackages.update(pkg.id, lxcUpdates);
            await lxcPackageCache.del('all');
        } catch (soldErr) { console.error('[package] 更新库存失败:', soldErr.message); }

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
            var autoLxcStatus = await pveApi.getLxcStatus(newVmid);
            if (autoLxcStatus && autoLxcStatus.status === 'stopped') {
                await pveApi.startLxc(newVmid);
            }
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

        res.json({ message: 'LXC 开通成功', ct: newCt, id: newCt.id, pve_upid: newCt.pve_upid || '', name: randomName, vmid: newVmid, order_no: orderNo });
    } catch (e) {
        console.error('[package] 用户订购 LXC 失败:', e.message);
        logPveError(e);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== VM 套餐（管理员） =====
router.get('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var cached = await vmPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.vmPackages.getAll();
        await vmPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/vm-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { var r = await db.vmPackages.create(req.body); await vmPackageCache.del('all'); res.json(r); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { var r = await db.vmPackages.update(parseInt(req.params.id), req.body); await vmPackageCache.del('all'); res.json(r); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/vm-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { await db.vmPackages.delete(parseInt(req.params.id)); await vmPackageCache.del('all'); res.json({ message: '已删除' }); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/vm-packages/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.vmPackages.batchUpdateSortOrder(ids);
        await vmPackageCache.del('all');
        res.json({ success: true });
    } catch (e) {
        console.error('[package] vm-packages reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
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
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);
        if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
            return res.status(400).json({ error: '订购数量必须为1-99的正整数' });
        }

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
        var adminVmCfg = { cores: template.cores, memory: template.memory };
        if (template.ciuser) {
            adminVmCfg.ciuser = template.ciuser;
            adminVmCfg.cipassword = generateRandomPassword();
        }
        await pveApi.updateVmConfig(newVmid, adminVmCfg);

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
            renewal_period: renewalPeriod,
            monthly_price: String(pkg.monthly_price || ''),
            quarterly_discount: String(pkg.quarterly_discount || ''),
            yearly_discount: String(pkg.yearly_discount || '')
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
        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'vm', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: db.now(),
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

        // Cloud-init 密码通知
        if (template.ciuser && adminVmCfg.cipassword) {
            try {
                await db.messages.create({
                    uid: userId, title: '服务器账号信息',
                    content: '您的虚拟机 ' + randomName + ' 已开通。\n账号：' + template.ciuser + '\n密码：' + adminVmCfg.cipassword + '\n请尽快修改密码。',
                    type: 2, send_type: 1
                });
            } catch (e) { console.error('[package] VM 密码通知发送失败', e); }
            try {
                var adminCiUser = await db.users.getById(userId);
                if (adminCiUser && adminCiUser.email && adminCiUser.emailVerified) {
                    var adminCiHtml = createEmailTemplate('服务器账号信息',
                        '<div class="info-box" style="border-left-color: #667eea;">' +
                        '<p style="margin-bottom: 8px;"><strong>您的服务器 ' + randomName + ' 已开通</strong></p>' +
                        '<p style="margin-bottom: 4px;">账号：' + template.ciuser + '</p>' +
                        '<p style="margin-bottom: 4px;">密码：' + adminVmCfg.cipassword + '</p>' +
                        '</div><div class="divider"></div>' +
                        '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>'
                    );
                    await sendEmail(adminCiUser.email, '服务器账号信息 - PVE 管理面板', adminCiHtml);
                }
            } catch (e) { console.error('[package] VM 密码邮件发送失败', e); }
        }

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
    try {
        var cached = await lxcPackageCache.get('all');
        if (cached) return res.json(cached);
        var list = await db.lxcPackages.getAll();
        await lxcPackageCache.set('all', list);
        res.json(list);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/lxc-packages', authMiddleware, adminMiddleware, async (req, res) => {
    try { var r = await db.lxcPackages.create(req.body); await lxcPackageCache.del('all'); res.json(r); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { var r = await db.lxcPackages.update(parseInt(req.params.id), req.body); await lxcPackageCache.del('all'); res.json(r); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/lxc-packages/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try { await db.lxcPackages.delete(parseInt(req.params.id)); await lxcPackageCache.del('all'); res.json({ message: '已删除' }); } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/lxc-packages/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.lxcPackages.batchUpdateSortOrder(ids);
        await lxcPackageCache.del('all');
        res.json({ success: true });
    } catch (e) {
        console.error('[package] lxc-packages reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
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
        // SEC-04: period 白名单校验
        if (!VALID_PERIODS.includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }
        var period_count = req.body.period_count || 1;
        period_count = parseInt(period_count);
        if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
            return res.status(400).json({ error: '订购数量必须为1-99的正整数' });
        }

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
            net0: (function(){
                var n = 'name=eth0,bridge=' + (template.network_bridge || 'vmbr0');
                if (template.network_mode === 'dhcp') {
                    n += ',ip=dhcp';
                } else if (template.ip4_addr) {
                    n += ',ip=' + template.ip4_addr;
                }
                if (template.ipv6_enabled != 0) {
                    if (template.ip6_mode === 'dhcp') {
                        n += ',ip6=dhcp';
                    } else if (template.ip6_mode === 'static' && template.ip6_addr) {
                        n += ',ip6=' + template.ip6_addr;
                    }
                }
                return n;
            })(),
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
            renewal_period: renewalPeriod,
            monthly_price: String(pkg.monthly_price || ''),
            quarterly_discount: String(pkg.quarterly_discount || ''),
            yearly_discount: String(pkg.yearly_discount || '')
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
        var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);
        // 写入 orders 表
        await db.orders.create({
            order_no: orderNo, user_id: userId, type: 'lxc', package_id: pkg.id,
            template_id: template.id, period: period, period_count: period_count,
            amount: totalAmount, cores: template.cores, memory: template.memory,
            disk_size: template.disk_size, resource_name: randomName, resource_id: String(newVmid)
        });
        // 写入 transaction_records
        await db.transactionRecords.create({
            user_id: userId, order_no: orderNo, pay_time: db.now(),
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
            var adminAutoLxc = await pveApi.getLxcStatus(newVmid);
            if (adminAutoLxc && adminAutoLxc.status === 'stopped') {
                await pveApi.startLxc(newVmid);
            }
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

// ===== 套餐分组管理（管理员） =====
router.get('/admin/package-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var type = req.query.type;
        var groups = type ? await db.packageGroups.getByType(type) : await db.packageGroups.getAll();
        res.json(groups);
    } catch (e) { res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/package-groups', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.packageGroups.create(req.body);
        res.json(r);
    } catch (e) { console.error('[package] create group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.put('/admin/package-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var r = await db.packageGroups.update(parseInt(req.params.id), req.body);
        res.json(r);
    } catch (e) { console.error('[package] update group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.delete('/admin/package-groups/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await db.packageGroups.delete(parseInt(req.params.id));
        res.json({ message: '已删除' });
    } catch (e) { console.error('[package] delete group error:', e.message); res.status(500).json({ error: safeError(e) }); }
});

router.post('/admin/package-groups/reorder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var ids = req.body.ids;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'ids 参数无效' });
        }
        for (var i = 0; i < ids.length; i++) {
            ids[i] = parseInt(ids[i]);
            if (!Number.isInteger(ids[i]) || ids[i] <= 0) {
                return res.status(400).json({ error: 'id 必须为正整数' });
            }
        }
        await db.packageGroups.batchUpdateSortOrder(ids);
        res.json({ success: true });
    } catch (e) {
        console.error('[package] package-groups reorder error:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ===== 开通状态查询：通过 PVE upid 查询真实任务状态 =====
router.get('/provision-status', authMiddleware, async (req, res) => {
    try {
        var upid = req.query.pve_upid;
        if (!upid) return res.status(400).json({ error: '缺少 pve_upid' });

        // SEC-06: UPID 格式校验，防止畸形值触发 PVE API 错误信息泄露
        if (!UPID_REGEX.test(upid)) {
            return res.status(400).json({ error: '无效的任务ID格式' });
        }

        // SEC-02: 速率限制（每用户每分钟 30 次，略高于前端 3 秒轮询频率）
        var rateLimitKey = 'ratelimit:provision-status:' + req.user.id;
        var rateLimitResult = await checkRateLimit(rateLimitKey, 30, 60 * 1000);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '查询过于频繁，请稍后再试' });
        }

        // SEC-01: 归属校验 — 确认该 upid 属于当前用户名下的开通中资源，防止 IDOR 越权查询
        var vmRecord = await db.vms.findByUpid(upid);
        var ctRecord = vmRecord ? null : await db.lxcContainers.findByUpid(upid);
        var ownerRecord = vmRecord || ctRecord;
        if (!ownerRecord) {
            return res.status(404).json({ error: '任务不存在' });
        }
        var isAdmin = req.user.role === 'admin';
        if (ownerRecord.user_id !== req.user.id && !isAdmin) {
            return res.status(403).json({ error: '无权限查询此任务' });
        }

        var taskStatus = await pveApi.getTaskStatus(upid);
        res.json({
            status: taskStatus.status,
            exitstatus: taskStatus.exitstatus,
            isCompleted: taskStatus.status === 'stopped',
            isSuccess: taskStatus.status === 'stopped' && taskStatus.exitstatus === 'OK'
        });
    } catch (e) {
        console.error('[package] 查询开通状态失败:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
