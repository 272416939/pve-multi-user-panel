// server/services/provisioning.js - VM/LXC 开通业务服务
// 规范第七节：业务编排进 services/，路由只做参数校验与响应组装
// 从 routes/package.js 抽取：用户侧 VM/LXC 开通（含扣款/退款/通知）、管理端套餐开通

const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const crypto = require('crypto');
const cacheStore = require('../utils/cache-store');
const { generateVmName, generateLxcName } = require('../utils/random-name');
const { createDhcpStaticBinding } = require('../services/dhcp');
const { createEmailTemplate, sendEmail, getSiteName, shouldSendEmail } = require('../utils/email');
const { calculateAmount, setVmAffinity, generateOrderNo } = require('../utils/order-utils');
const { withTransaction } = require('../utils/with-transaction');
const { takeDiskSnapshot } = require('../services/disk-audit');
const { formatLocalDate } = require('../utils/date');
const { VALID_PERIODS, getPeriodDays } = require('../constants');

// 套餐列表缓存（5 分钟 TTL，低频变更场景；cache-store 按 namespace 单例，与路由共享同一份）
var vmPackageCache = cacheStore.create('vm_packages', 300);
var lxcPackageCache = cacheStore.create('lxc_packages', 300);

function generateRandomPassword() {
    var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    var pwd = '';
    for (var i = 0; i < 12; i++) {
        pwd += chars[crypto.randomInt(0, chars.length)];
    }
    return pwd;
}

function logPveError(e) {
    console.error('[provisioning] PVE API 错误详情:', e.message);
    if (e.response) {
        console.error('[provisioning] PVE 响应状态:', e.response.status);
        console.error('[provisioning] PVE 响应数据:', JSON.stringify(e.response.data || ''));
    }
}

// 退款通知（开通失败共用）：站内信 + 邮件
async function notifyProvisionFailed(opts) {
    var { userId, resourceLabel, resourceName, orderNo, totalAmount, balanceAfterRefund, refundOrderNo, resourceType, notifyKey, title, failTitle } = opts;
    try {
        await db.messages.create({
            uid: userId, title: title,
            content: '非常抱歉，您订购的' + resourceLabel + ' ' + resourceName + ' 开通失败，钱款已原路返回。\n订单号：' + orderNo + '\n退款金额：¥' + totalAmount + '\n如有疑问请联系客服。',
            type: 1, is_read: 0, send_type: 1
        });
    } catch (e) { console.error('[provisioning] ' + resourceType + ' 开通失败通知发送失败', e); }
    try {
        var failUser = await db.users.getById(userId);
        if (failUser && failUser.email && failUser.emailVerified && failUser.email.includes('@')) {
            var siteName = await getSiteName();
            var emailHtml = createEmailTemplate(failTitle,
                '<p>非常抱歉，您订购的' + resourceLabel + ' <strong>' + resourceName + '</strong> 开通失败，款项已原路退回。</p>' +
                '<div class="warning-box">' +
                '<p style="margin-bottom: 4px;">💸 退款金额：<strong>¥' + totalAmount.toFixed(2) + '</strong></p>' +
                '<p style="margin-bottom: 4px;">💳 余额变动：<strong>¥' + (balanceAfterRefund - totalAmount).toFixed(2) + ' → ¥' + balanceAfterRefund.toFixed(2) + '</strong></p>' +
                '<p style="margin-bottom: 4px;">📋 原订单号：<strong>' + orderNo + '</strong></p>' +
                '<p style="margin-bottom: 4px;">🔖 退款单号：<strong>' + refundOrderNo + '</strong></p>' +
                '<p>⏰ 退款时间：' + new Date().toLocaleString('zh-CN') + '</p>' +
                '</div>' +
                '<p>如有疑问请联系客服。</p>', siteName);
            if (await shouldSendEmail(userId, notifyKey)) {
                await sendEmail(failUser.email, failTitle + ' - ' + siteName, emailHtml);
            }
        }
    } catch (emailErr) { console.error('[provisioning] ' + resourceType + ' 退款邮件发送失败:', emailErr.message); }
}

// ==================== 用户侧：VM 开通 ====================

/**
 * 用户侧 VM 套餐开通（扣款 -> 建单 -> clone -> DHCP -> 通知）
 * 返回 { ok: true, data: {...} } 或 { ok: false, status, error }
 * @param {object} opts - { userId, username, req, packageId, period, periodCount, macGroupId, osTemplateId }
 */
async function provisionVm(opts) {
    var { userId, username, req, packageId, period, period_count, macGroupId, osTemplateId } = opts;

    if (!VALID_PERIODS.includes(period)) {
        return { ok: false, status: 400, error: '无效的计费周期' };
    }
    if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
        return { ok: false, status: 400, error: '订购数量必须为1-99的正整数' };
    }

    var pkg = await db.vmPackages.getById(packageId);
    if (!pkg) return { ok: false, status: 404, error: '套餐不存在' };
    // 库存校验：-1 表示不限量，0 表示售罄，null 兼容旧数据视为不限量
    if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock <= 0) {
        return { ok: false, status: 400, error: '该套餐已售罄' };
    }

    var template = await db.vmTemplates.getById(pkg.template_id);
    if (!template) return { ok: false, status: 404, error: '关联模板不存在' };
    if (template.status !== 'active') return { ok: false, status: 400, error: '关联模板已停用' };

    // 新购必须选择 OS 模板
    var osTemplate = null;
    if (osTemplateId && osTemplateId > 0) {
        osTemplate = await db.osTemplates.getById(osTemplateId);
        if (!osTemplate || osTemplate.status !== 'active') {
            return { ok: false, status: 400, error: 'OS 模板不存在或已下架' };
        }
        // 校验 allowed_package_ids 约束
        if (osTemplate.allowed_package_ids && osTemplate.allowed_package_ids.length > 0) {
            var allowedIds = osTemplate.allowed_package_ids.split(',').map(function(s) { return parseInt(s.trim()); }).filter(Number.isInteger);
            if (allowedIds.length > 0 && allowedIds.indexOf(pkg.id) === -1) {
                return { ok: false, status: 400, error: '该系统模板不适用于当前套餐' };
            }
        }
    } else {
        return { ok: false, status: 400, error: '请选择系统模板' };
    }

    // 克隆源：使用 OS 模板
    var cloneSourceVmid = osTemplate.template_vmid;
    var finalTargetStorage = osTemplate.target_storage || null;

    var finalMacGroupId = macGroupId || template.mac_group_id || null;

    var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);

    var randomName = generateVmName();
    var newVmid = await pveApi.getNextAvailableVmid();

    // 下单即生成订单与扣款流水（先扣款后开通，失败退款）
    // ARCH-09: 扣款+订单创建+流水记录三步放入事务，保证原子性
    var orderNo = generateOrderNo('vm');
    var balanceBefore = 0;
    var balanceAfter = 0;
    await withTransaction(async (conn) => {
        // 1. 查询余额并校验
        var [userRows] = await conn.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        balanceBefore = parseFloat((userRows[0] && userRows[0].balance) || '0');
        if (balanceBefore < totalAmount) throw new Error('余额不足');
        // 2. 扣款
        await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [totalAmount, userId]);
        balanceAfter = balanceBefore - totalAmount;
        // 3. 创建订单
        await conn.execute(
            'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [orderNo, userId, 'vm', pkg.id, template.id, period, period_count, totalAmount, template.cores, template.memory, template.disk_size, randomName, String(newVmid), 'pending']
        );
        // 4. 创建流水
        await conn.execute(
            'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, orderNo, db.now(), 'balance', 'new_order', totalAmount, period, period_count, balanceBefore, balanceAfter, null, null, '', '', db.now()]
        );
    });

    // 检查模板 VM 状态，full clone 需要模板处于停止状态
    try {
        var tmplStatus = await pveApi.getVmStatus(cloneSourceVmid);
        if (tmplStatus && tmplStatus.status === 'running') {
            console.error('[provisioning] 模板 VM ' + cloneSourceVmid + ' 正在运行，无法进行 full clone');
            return { ok: false, status: 400, error: '模板虚拟机正在运行，请先停止后再订购' };
        }
    } catch (statusErr) {
        console.error('[provisioning] 检查模板 VM 状态失败:', statusErr.message);
    }

    var newVm = null;
    try {
        var upid = await pveApi.cloneVm(cloneSourceVmid, newVmid, {
            name: randomName,
            storage: finalTargetStorage || undefined,
            clone_mode: 'full'
        });

        // 预创建 DB 记录，pve_upid 有值表示开通中，便于前端通过 PVE 真实任务状态跟踪
        var addDays = getPeriodDays(period);
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);
        newVm = await db.vms.create({
            vm_id: newVmid, user_id: userId, name: randomName, expiration_date: formatLocalDate(expDate),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1, pkg.quarterly_discount, pkg.yearly_discount)), renewal_period: period,
            monthly_price: String(pkg.monthly_price || ''),
            quarterly_discount: String(pkg.quarterly_discount || ''),
            yearly_discount: String(pkg.yearly_discount || ''),
            pve_upid: upid,
            current_os_template_id: osTemplate ? osTemplate.id : null
        });

        // 等待 clone 任务完成
        await pveApi.waitForTask(upid);

        // 开通完成，清空 pve_upid（表示开通完成）
        newVm = await db.vms.update(newVm.id, { pve_upid: '' });

        var vmUpdateCfg = { cores: template.cores, memory: template.memory };

        // 扩容系统盘到套餐模板设定的目标容量
        if (template.disk_size && template.disk_size > 0) {
            try {
                var diskUtils = require('../utils/disk-utils');
                var systemBus = await diskUtils.getSystemDiskBus(newVmid);
                var resizeCmd = systemBus + '0';
                // 先获取当前系统盘实际容量，只大不小
                var oldConfig = await pveApi.getVmConfig(newVmid);
                var oldSizeGb = 0;
                var _buses = ['scsi', 'sata', 'virtio'];
                for (var _i = 0; _i < _buses.length; _i++) {
                    var _raw = String(oldConfig[_buses[_i] + '0'] || '');
                    var _m = _raw.match(/size=(\d+)([GM])/i);
                    if (_m) {
                        oldSizeGb = _m[2].toUpperCase() === 'M' ? Math.ceil(parseInt(_m[1]) / 1024) : parseInt(_m[1]);
                        break;
                    }
                }
                var targetSizeGb = Math.max(oldSizeGb, parseInt(template.disk_size));
                if (targetSizeGb > oldSizeGb) {
                    var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
                    var sshConfig = await getPveSshConfig();
                    await execSSH(sshConfig.host, sshConfig.username, sshConfig.password,
                        'qm resize ' + newVmid + ' ' + resizeCmd + ' ' + targetSizeGb + 'G', 60000);
                    console.log('[provisioning] VM ' + newVmid + ' 系统盘已扩容到 ' + targetSizeGb + 'G');
                }
            } catch (resizeErr) {
                console.error('[provisioning] 系统盘扩容失败:', resizeErr.message);
            }
        }

        // 使用 OS 模板的 ciuser 和 ostype
        if (osTemplate.ciuser) {
            vmUpdateCfg.ciuser = osTemplate.ciuser;
            vmUpdateCfg.cipassword = generateRandomPassword();
        }
        if (osTemplate.ostype) {
            vmUpdateCfg.ostype = osTemplate.ostype;
        }
        await pveApi.updateVmConfig(newVmid, vmUpdateCfg);

        if (template.cpu_affinity) {
            await setVmAffinity(newVmid, template.cpu_affinity);
        }

        var macCfg = null;
        if (finalMacGroupId) {
            try {
                macCfg = await pveApi.getVmConfig(newVmid);
                var vmac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
                if (vmac) {
                    await ikuaiApi.addMacToGroup(finalMacGroupId, vmac[0], randomName);
                    await db.vms.update(newVm.id, { ikuai_mac_group_id: finalMacGroupId });
                }
            } catch (macErr) { console.error('[provisioning] VM MAC sync failed:', macErr.message); }
        }

        // DHCP 静态绑定
        try {
            if (!macCfg) macCfg = await pveApi.getVmConfig(newVmid);
            var dhcpMac = macCfg && macCfg.net0 ? macCfg.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/) : null;
            if (dhcpMac) {
                var dhcpIp = await createDhcpStaticBinding('vm', newVmid, dhcpMac[0], '');
                if (dhcpIp) {
                    await db.vms.update(newVm.id, { dhcp_static_ip: dhcpIp });
                }
            }
        } catch (dhcpErr) { console.error('[provisioning] VM DHCP绑定失败:', dhcpErr.message); }
    } catch (provErr) {
        // 开通失败：清理预创建记录、退款、创建退款流水、订单标记 refunded、发送通知
        if (newVm) { try { await db.vms.delete(newVm.id); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); } }
        var refundUser = await db.users.incrementBalance(userId, totalAmount);
        var balanceAfterRefund = parseFloat(refundUser.balance || '0');
        var refundOrderNo = generateOrderNo('refund');
        await db.transactionRecords.create({
            user_id: userId, order_no: refundOrderNo, pay_time: db.now(),
            pay_method: 'balance_refund', trade_type: 'refund', amount: totalAmount,
            balance_before: balanceAfterRefund - totalAmount, balance_after: balanceAfterRefund,
            period: period, period_count: period_count,
            trade_no: orderNo, api_trade_no: ''
        });
        try { await db.orders.updateStatus(orderNo, 'refunded'); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); }
        await notifyProvisionFailed({
            userId: userId, resourceLabel: '虚拟机', resourceName: randomName, orderNo: orderNo,
            totalAmount: totalAmount, balanceAfterRefund: balanceAfterRefund, refundOrderNo: refundOrderNo,
            resourceType: 'VM', notifyKey: 'notify_vm_refund', title: '虚拟机开通失败', failTitle: '虚拟机开通失败 - 已退款'
        });
        throw provErr;
    }

    // 开通成功，订单标记完成
    try { await db.orders.updateStatus(orderNo, 'completed'); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); }

    // 增加已售数量，并扣减剩余库存（-1 不限量不扣减）
    try {
        var vmUpdates = { sold_count: (pkg.sold_count || 0) + 1 };
        if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock > 0) {
            vmUpdates.stock = pkg.stock - 1;
        }
        await db.vmPackages.update(pkg.id, vmUpdates);
        await vmPackageCache.del('all');
    } catch (soldErr) { console.error('[provisioning] 更新库存失败:', soldErr.message); }

    try {
        await db.messages.create({
            uid: userId, title: '服务器开通成功',
            content: '您的虚拟机 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。',
            type: 1, is_read: 0, send_type: 1
        });
    } catch (e) { console.error('[provisioning] VM 消息发送失败', e); }
    try {
        var user = await db.users.getById(userId);
        if (user && user.email && user.emailVerified) {
            var emailHtml = createEmailTemplate('服务器开通成功',
                '<p>您的新服务器已开通成功！</p><p>类型：虚拟机</p><p>名称：' + randomName + '</p><p>订单号：' + orderNo + '</p>'
            );
            if (await shouldSendEmail(userId, 'notify_vm_provisioned')) {
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        }
    } catch (e) { console.error('[provisioning] VM 邮件发送失败', e); }

    // Cloud-init 密码通知
    if (osTemplate.ciuser && vmUpdateCfg.cipassword) {
        try {
            await db.messages.create({
                uid: userId, title: '服务器账号信息',
                content: '您的虚拟机 ' + randomName + ' 已开通。\n账号：' + osTemplate.ciuser + '\n密码：' + vmUpdateCfg.cipassword + '\n请尽快修改密码。',
                type: 2, send_type: 1
            });
        } catch (e) { console.error('[provisioning] VM 密码通知发送失败', e); }
        try {
            var ciUser = await db.users.getById(userId);
            if (ciUser && ciUser.email && ciUser.emailVerified) {
                var pkgSiteName = await getSiteName();
                var ciEmailHtml = createEmailTemplate('服务器账号信息',
                    '<div class="info-box" style="border-left-color: #667eea;">' +
                    '<p style="margin-bottom: 8px;"><strong>您的服务器 ' + randomName + ' 已开通</strong></p>' +
                    '<p style="margin-bottom: 4px;">账号：' + osTemplate.ciuser + '</p>' +
                    '<p style="margin-bottom: 4px;">密码：' + vmUpdateCfg.cipassword + '</p>' +
                    '</div><div class="divider"></div>' +
                    '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>',
                    pkgSiteName
                );
                if (await shouldSendEmail(userId, 'notify_account_password')) {
                    await sendEmail(ciUser.email, '服务器账号信息 - ' + pkgSiteName, ciEmailHtml);
                }
            }
        } catch (e) { console.error('[provisioning] VM 密码邮件发送失败', e); }
    }

    // 自动开机
    try {
        await pveApi.startVm(newVmid);
    } catch (startErr) { console.error('[provisioning] VM 自动开机失败:', startErr.message); }

    // 操作审计：服务开通（含套餐名称）
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: userId, username: username, action: 'order.vm', resourceType: 'vm', resourceId: newVmid, details: '开通VM套餐[' + (pkg.name || ('套餐' + pkg.id)) + '] 名称' + randomName, req });
    } catch (_) {}

    // 异步更新磁盘快照（不阻塞响应）
    takeDiskSnapshot(newVmid, userId).catch(function(err) {
        console.error('[快照] 用户订购后快照创建失败:', err.message);
    });

    return {
        ok: true,
        data: { message: 'VM 开通成功', id: newVm.id, _provisioning: !!(newVm.pve_upid && newVm.pve_upid !== ''), name: randomName, vmid: newVmid, order_no: orderNo }
    };
}

// ==================== 用户侧：LXC 开通 ====================

/**
 * 用户侧 LXC 套餐开通（扣款 -> 建单 -> createLxc -> DHCP -> 密码设置 -> 通知）
 * 返回 { ok: true, data: {...} } 或 { ok: false, status, error }
 * @param {object} opts - { userId, username, req, packageId, period, periodCount, macGroupId }
 */
async function provisionLxc(opts) {
    var { userId, username, req, packageId, period, period_count, macGroupId } = opts;

    if (!VALID_PERIODS.includes(period)) {
        return { ok: false, status: 400, error: '无效的计费周期' };
    }
    if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
        return { ok: false, status: 400, error: '订购数量必须为1-99的正整数' };
    }

    var pkg = await db.lxcPackages.getById(packageId);
    if (!pkg) return { ok: false, status: 404, error: '套餐不存在' };
    // 库存校验：-1 表示不限量，0 表示售罄，null 兼容旧数据视为不限量
    if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock <= 0) {
        return { ok: false, status: 400, error: '该套餐已售罄' };
    }

    var template = await db.lxcTemplates.getById(pkg.template_id);
    if (!template) return { ok: false, status: 404, error: '关联模板不存在' };
    if (template.status !== 'active') return { ok: false, status: 400, error: '关联模板已停用' };

    var finalMacGroupId = macGroupId || template.mac_group_id || null;

    var totalAmount = calculateAmount(pkg.monthly_price, period, period_count, pkg.quarterly_discount, pkg.yearly_discount);

    var randomName = generateLxcName();
    var newVmid = await pveApi.getNextAvailableVmid();

    // 下单即生成订单与扣款流水（先扣款后开通，失败退款）
    // ARCH-09: 扣款+订单创建+流水记录三步放入事务，保证原子性
    var orderNo = generateOrderNo('lxc');
    var balanceBefore = 0;
    var balanceAfter = 0;
    await withTransaction(async (conn) => {
        // 1. 查询余额并校验
        var [userRows] = await conn.execute('SELECT balance FROM users WHERE id = ?', [userId]);
        balanceBefore = parseFloat((userRows[0] && userRows[0].balance) || '0');
        if (balanceBefore < totalAmount) throw new Error('余额不足');
        // 2. 扣款
        await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [totalAmount, userId]);
        balanceAfter = balanceBefore - totalAmount;
        // 3. 创建订单
        await conn.execute(
            'INSERT INTO orders (order_no, user_id, type, package_id, template_id, period, period_count, amount, cores, memory, disk_size, resource_name, resource_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [orderNo, userId, 'lxc', pkg.id, template.id, period, period_count, totalAmount, template.cores, template.memory, template.disk_size, randomName, String(newVmid), 'pending']
        );
        // 4. 创建流水
        await conn.execute(
            'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, orderNo, db.now(), 'balance', 'new_order', totalAmount, period, period_count, balanceBefore, balanceAfter, null, null, '', '', db.now()]
        );
    });

    var newCt = null;
    try {
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

        var addDays = getPeriodDays(period);
        var expDate = new Date(Date.now() + addDays * period_count * 24 * 60 * 60 * 1000);

        // 预创建 DB 记录，pve_upid 有值表示开通中，便于前端通过 PVE 真实任务状态跟踪
        newCt = await db.lxcContainers.create({
            ct_id: newVmid, user_id: userId, name: randomName, expiration_date: formatLocalDate(expDate),
            renewal_price: String(calculateAmount(pkg.monthly_price, period, 1, pkg.quarterly_discount, pkg.yearly_discount)), renewal_period: period,
            pve_upid: lxcUpid
        });

        // 等待 LXC 创建任务完成
        await pveApi.waitForTask(lxcUpid);

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
            } catch (macErr) { console.error('[provisioning] LXC MAC sync failed:', macErr.message); }
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
        } catch (dhcpErr) { console.error('[provisioning] LXC DHCP绑定失败:', dhcpErr.message); }
    } catch (provErr) {
        // 开通失败：清理预创建记录、退款、创建退款流水、订单标记 refunded、发送通知
        if (newCt) { try { await db.lxcContainers.delete(newCt.id); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); } }
        var refundUser = await db.users.incrementBalance(userId, totalAmount);
        var balanceAfterRefund = parseFloat(refundUser.balance || '0');
        var refundOrderNo = generateOrderNo('refund');
        await db.transactionRecords.create({
            user_id: userId, order_no: refundOrderNo, pay_time: db.now(),
            pay_method: 'balance_refund', trade_type: 'refund', amount: totalAmount,
            balance_before: balanceAfterRefund - totalAmount, balance_after: balanceAfterRefund,
            period: period, period_count: period_count,
            trade_no: orderNo, api_trade_no: ''
        });
        try { await db.orders.updateStatus(orderNo, 'refunded'); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); }
        await notifyProvisionFailed({
            userId: userId, resourceLabel: '容器', resourceName: randomName, orderNo: orderNo,
            totalAmount: totalAmount, balanceAfterRefund: balanceAfterRefund, refundOrderNo: refundOrderNo,
            resourceType: 'LXC', notifyKey: 'notify_lxc_refund', title: '容器开通失败', failTitle: '容器开通失败 - 已退款'
        });
        throw provErr;
    }

    // 开通成功，订单标记完成
    try { await db.orders.updateStatus(orderNo, 'completed'); } catch (e) { console.error('[provisioning] 订单状态更新失败:', e.message); }

    // 增加已售数量，并扣减剩余库存（-1 不限量不扣减）
    try {
        var lxcUpdates = { sold_count: (pkg.sold_count || 0) + 1 };
        if (pkg.stock !== null && pkg.stock !== -1 && pkg.stock > 0) {
            lxcUpdates.stock = pkg.stock - 1;
        }
        await db.lxcPackages.update(pkg.id, lxcUpdates);
        await lxcPackageCache.del('all');
    } catch (soldErr) { console.error('[provisioning] 更新库存失败:', soldErr.message); }

    try {
        await db.messages.create({
            uid: userId, title: '容器开通成功',
            content: '您的容器 ' + randomName + ' 已开通成功。订单号：' + orderNo + '。',
            type: 1, is_read: 0, send_type: 1
        });
    } catch (e) { console.error('[provisioning] LXC 消息发送失败', e); }
    try {
        var user = await db.users.getById(userId);
        if (user && user.email && user.emailVerified) {
            var emailHtml = createEmailTemplate('容器开通成功',
                '<p>您的新容器已开通成功！</p><p>类型：LXC 容器</p><p>名称：' + randomName + '</p><p>订单号：' + orderNo + '</p>'
            );
            if (await shouldSendEmail(userId, 'notify_lxc_provisioned')) {
                await sendEmail(user.email, '容器开通成功', emailHtml);
            }
        }
    } catch (e) { console.error('[provisioning] LXC 邮件发送失败', e); }

    // 自动开机
    try {
        var autoLxcStatus = await pveApi.getLxcStatus(newVmid);
        if (autoLxcStatus && autoLxcStatus.status === 'stopped') {
            await pveApi.startLxc(newVmid);
        }
    } catch (startErr) { console.error('[provisioning] LXC 自动开机失败:', startErr.message); }

    // 生成随机 root 密码并设置
    var lxcPassword = '';
    try {
        lxcPassword = generateRandomPassword();
        var { getPveSshConfig } = require('../api/ssh-exec');
        var sshConfig = await getPveSshConfig();
        if (sshConfig.host && sshConfig.password) {
            var { execSSHWithStdin } = require('../api/ssh-exec');
            await execSSHWithStdin(sshConfig.host, sshConfig.username, sshConfig.password,
                'lxc-attach -n ' + newVmid + ' -- chpasswd',
                'root:' + lxcPassword + '\n', 30000
            );
        }
    } catch (pwdErr) { console.error('[provisioning] LXC 设置密码失败:', pwdErr.message); }

    // 发送密码通知（站内信）
    if (lxcPassword) {
        try {
            await db.messages.create({
                uid: userId, title: '容器 root 密码',
                content: '您的容器 ' + randomName + ' 的 root 密码已设置。\nRoot 账号：root\n密码：' + lxcPassword + '\n请尽快修改密码。',
                type: 2, send_type: 1
            });
        } catch (e) { console.error('[provisioning] LXC 密码通知发送失败', e); }
        try {
            var pwdUser = await db.users.getById(userId);
            if (pwdUser && pwdUser.email && pwdUser.emailVerified) {
                var pkgSiteName2 = await getSiteName();
                var pwdEmailHtml = createEmailTemplate('容器 root 密码',
                    '<div class="info-box" style="border-left-color: #667eea;">' +
                    '<p style="margin-bottom: 8px;"><strong>您的容器 ' + randomName + ' 已开通</strong></p>' +
                    '<p style="margin-bottom: 4px;">Root 账号：root</p>' +
                    '<p style="margin-bottom: 4px;">密码：' + lxcPassword + '</p>' +
                    '</div><div class="divider"></div>' +
                    '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>',
                    pkgSiteName2
                );
                if (await shouldSendEmail(userId, 'notify_account_password')) {
                    await sendEmail(pwdUser.email, '容器 root 密码 - ' + pkgSiteName2, pwdEmailHtml);
                }
            }
        } catch (e) { console.error('[provisioning] LXC 密码邮件发送失败', e); }
    }

    // 操作审计：服务开通（含套餐名称）
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: userId, username: username, action: 'order.lxc', resourceType: 'lxc', resourceId: newVmid, details: '开通LXC套餐[' + (pkg.name || ('套餐' + pkg.id)) + '] 名称' + randomName, req });
    } catch (_) {}

    return {
        ok: true,
        data: { message: 'LXC 开通成功', id: newCt.id, _provisioning: !!(newCt.pve_upid && newCt.pve_upid !== ''), name: randomName, vmid: newVmid, order_no: orderNo }
    };
}

// ==================== 管理端：VM 套餐开通 ====================

/**
 * 管理端 VM 套餐开通（管理员代开：clone -> 配置 -> 建记录 -> 订单 -> 通知）
 * 返回 { ok: true, data: {...} } 或 { ok: false, status, error }
 * @param {object} opts - { userId, packageId, name, expDate, renewalPrice, renewalPeriod, period, periodCount }
 */
async function adminProvisionVm(opts) {
    var { userId, packageId, name, expDate, renewalPrice, renewalPeriod, period, period_count } = opts;

    if (!VALID_PERIODS.includes(period)) {
        return { ok: false, status: 400, error: '无效的计费周期' };
    }
    if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
        return { ok: false, status: 400, error: '订购数量必须为1-99的正整数' };
    }
    if (!userId) return { ok: false, status: 400, error: '请选择用户' };

    var pkg = await db.vmPackages.getById(packageId);
    if (!pkg) return { ok: false, status: 404, error: '套餐不存在' };

    var template = await db.vmTemplates.getById(pkg.template_id);
    if (!template) return { ok: false, status: 404, error: '关联模板不存在' };

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
        } catch (macErr) { console.error('[provisioning] VM MAC sync failed:', macErr.message); }
    }

    // 生成订单号
    var orderNo = generateOrderNo('vm');
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
    } catch (e) { console.error('[provisioning] VM 消息发送失败', e); }
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
            if (await shouldSendEmail(userId, 'notify_vm_provisioned')) {
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        }
    } catch (e) { console.error('[provisioning] VM 邮件发送失败', e); }

    // Cloud-init 密码通知
    if (template.ciuser && adminVmCfg.cipassword) {
        try {
            await db.messages.create({
                uid: userId, title: '服务器账号信息',
                content: '您的虚拟机 ' + randomName + ' 已开通。\n账号：' + template.ciuser + '\n密码：' + adminVmCfg.cipassword + '\n请尽快修改密码。',
                type: 2, send_type: 1
            });
        } catch (e) { console.error('[provisioning] VM 密码通知发送失败', e); }
        try {
            var adminCiUser = await db.users.getById(userId);
            if (adminCiUser && adminCiUser.email && adminCiUser.emailVerified) {
                var pkgSiteName3 = await getSiteName();
                var adminCiHtml = createEmailTemplate('服务器账号信息',
                    '<div class="info-box" style="border-left-color: #667eea;">' +
                    '<p style="margin-bottom: 8px;"><strong>您的服务器 ' + randomName + ' 已开通</strong></p>' +
                    '<p style="margin-bottom: 4px;">账号：' + template.ciuser + '</p>' +
                    '<p style="margin-bottom: 4px;">密码：' + adminVmCfg.cipassword + '</p>' +
                    '</div><div class="divider"></div>' +
                    '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>',
                    pkgSiteName3
                );
                if (await shouldSendEmail(userId, 'notify_account_password')) {
                    await sendEmail(adminCiUser.email, '服务器账号信息 - ' + pkgSiteName3, adminCiHtml);
                }
            }
        } catch (e) { console.error('[provisioning] VM 密码邮件发送失败', e); }
    }

    // 自动开机
    try {
        await pveApi.startVm(newVmid);
    } catch (startErr) { console.error('[provisioning] VM 自动开机失败:', startErr.message); }

    // 异步更新磁盘快照（不阻塞响应）
    takeDiskSnapshot(newVmid, userId).catch(function(err) {
        console.error('[快照] 套餐开通后快照创建失败:', err.message);
    });

    return { ok: true, data: { message: 'VM 开通成功', vm: newVm, name: randomName, vmid: newVmid } };
}

// ==================== 管理端：LXC 套餐开通 ====================

/**
 * 管理端 LXC 套餐开通（管理员代开：createLxc -> 建记录 -> 订单 -> 密码设置 -> 通知）
 * 返回 { ok: true, data: {...} } 或 { ok: false, status, error }
 * @param {object} opts - { userId, packageId, name, expDate, renewalPrice, renewalPeriod, period, periodCount }
 */
async function adminProvisionLxc(opts) {
    var { userId, packageId, name, expDate, renewalPrice, renewalPeriod, period, period_count } = opts;

    if (!VALID_PERIODS.includes(period)) {
        return { ok: false, status: 400, error: '无效的计费周期' };
    }
    if (!Number.isInteger(period_count) || period_count < 1 || period_count > 99) {
        return { ok: false, status: 400, error: '订购数量必须为1-99的正整数' };
    }
    if (!userId) return { ok: false, status: 400, error: '请选择用户' };

    var pkg = await db.lxcPackages.getById(packageId);
    if (!pkg) return { ok: false, status: 404, error: '套餐不存在' };

    var template = await db.lxcTemplates.getById(pkg.template_id);
    if (!template) return { ok: false, status: 404, error: '关联模板不存在' };

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
        } catch (macErr) { console.error('[provisioning] LXC MAC sync failed:', macErr.message); }
    }

    // 生成订单号
    var orderNo = generateOrderNo('lxc');
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
    } catch (e) { console.error('[provisioning] LXC 消息发送失败', e); }
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
            if (await shouldSendEmail(userId, 'notify_lxc_provisioned')) {
                await sendEmail(user.email, '服务器开通成功', emailHtml);
            }
        }
    } catch (e) { console.error('[provisioning] LXC 邮件发送失败', e); }

    // 自动开机
    try {
        var adminAutoLxc = await pveApi.getLxcStatus(newVmid);
        if (adminAutoLxc && adminAutoLxc.status === 'stopped') {
            await pveApi.startLxc(newVmid);
        }
    } catch (startErr) { console.error('[provisioning] LXC 自动开机失败:', startErr.message); }

    // 生成随机 root 密码并设置
    var adminLxcPwd = '';
    try {
        adminLxcPwd = generateRandomPassword();
        var { getPveSshConfig, execSSHWithStdin } = require('../api/ssh-exec');
        var sshConfig = await getPveSshConfig();
        if (sshConfig.host && sshConfig.password) {
            await execSSHWithStdin(sshConfig.host, sshConfig.username, sshConfig.password,
                'lxc-attach -n ' + newVmid + ' -- chpasswd',
                'root:' + adminLxcPwd + '\n', 30000
            );
        }
    } catch (pwdErr) { console.error('[provisioning] LXC 设置密码失败:', pwdErr.message); }

    // 发送密码通知（站内信）
    if (adminLxcPwd) {
        try {
            await db.messages.create({
                uid: userId, title: '容器 root 密码',
                content: '您的容器 ' + randomName + ' 的 root 密码已设置。\nRoot 账号：root\n密码：' + adminLxcPwd + '\n请尽快修改密码。',
                type: 2, send_type: 1
            });
        } catch (e) { console.error('[provisioning] LXC 密码通知发送失败', e); }
        try {
            var adminPwdUser = await db.users.getById(userId);
            if (adminPwdUser && adminPwdUser.email && adminPwdUser.emailVerified) {
                var pkgSiteName4 = await getSiteName();
                var adminPwdEmailHtml = createEmailTemplate('容器 root 密码',
                    '<div class="info-box" style="border-left-color: #667eea;">' +
                    '<p style="margin-bottom: 8px;"><strong>您的容器 ' + randomName + ' 已开通</strong></p>' +
                    '<p style="margin-bottom: 4px;">Root 账号：root</p>' +
                    '<p style="margin-bottom: 4px;">密码：' + adminLxcPwd + '</p>' +
                    '</div><div class="divider"></div>' +
                    '<p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>',
                    pkgSiteName4
                );
                if (await shouldSendEmail(userId, 'notify_account_password')) {
                    await sendEmail(adminPwdUser.email, '容器 root 密码 - ' + pkgSiteName4, adminPwdEmailHtml);
                }
            }
        } catch (e) { console.error('[provisioning] LXC 密码邮件发送失败', e); }
    }

    return { ok: true, data: { message: 'LXC 开通成功', ct: newCt, name: randomName, vmid: newVmid } };
}

module.exports = { provisionVm, provisionLxc, adminProvisionVm, adminProvisionLxc };
