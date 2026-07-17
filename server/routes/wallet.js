const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createPayClient, generateOrderId } = require('../sdk/pay');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const dbg = require('../utils/debug');
const { getPeriodMonths, calculateAmount, generateOrderNo } = require('../utils/order-utils');
const pveApi = require('../api/pve-api');
const { withTransaction } = require('../utils/with-transaction');
const { safeError } = require('../utils/safe-error');
const { formatLocalDate } = require('../utils/date');

var callbackRateLimiter = new Map();
function checkCallbackRate(ip) {
    var now = Date.now();
    var windowMs = 60000;
    var maxRequests = 30;
    var record = callbackRateLimiter.get(ip);
    if (!record || now - record.windowStart > windowMs) {
        callbackRateLimiter.set(ip, { windowStart: now, count: 1 });
        return true;
    }
    if (record.count >= maxRequests) return false;
    record.count++;
    return true;
}

var orderStatusRateLimiter = new Map();

async function queryApiTradeNo(outTradeNo) {
    try {
        var pid = await db.config.get('pay:pid');
        var md5Key = await db.config.get('pay:md5_key');
        var v2PrivateKey = await db.config.get('pay:v2_private_key');
        var v2PublicKey = await db.config.get('pay:v2_public_key');
        var baseUrl = await db.config.get('pay:base_url') || 'https://pay.microgg.cn/';
        var v2Enabled = (await db.config.get('pay:v2_enabled') || '0') === '1';
        if (!pid) return null;

        var payClient = createPayClient({ pid: pid, key: md5Key, baseUrl: baseUrl, privateKey: v2PrivateKey, publicKey: v2PublicKey });
        var queryRes;
        if (v2Enabled && v2PrivateKey && v2PublicKey) {
            queryRes = await payClient.queryOrder({ out_trade_no: outTradeNo });
        } else {
            queryRes = await payClient.queryOrder({ out_trade_no: outTradeNo });
        }
        if (queryRes && queryRes.code === 0 && queryRes.api_trade_no) {
            dbg('[钱包] 查询到接口订单号:', queryRes.api_trade_no);
            return queryRes.api_trade_no;
        }
    } catch (e) {
        console.error('[钱包] 查询api_trade_no失败:', e.message);
    }
    return null;
}

function format2(num) {
    var n = parseFloat(num);
    if (isNaN(n)) return '0.00';
    return n.toFixed(2);
}

// ========== 查询余额 ==========
router.get('/wallet/balance', authMiddleware, async (req, res) => {
    try {
        var user = await db.users.getById(req.user.id);
        res.json({ balance: parseFloat(user.balance || 0).toFixed(2) });
    } catch (e) {
        console.error('[钱包] balance:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 获取支付配置开关 ==========
router.get('/wallet/pay-config', authMiddleware, async (req, res) => {
    try {
        var getConfig = db.config.get;
        res.json({
            alipay: (await getConfig('pay:alipay_enabled') || '1') === '1',
            wxpay: (await getConfig('pay:wxpay_enabled') || '1') === '1',
            min_amount: parseFloat(await getConfig('pay:min_amount') || '0.01'),
            max_amount: parseFloat(await getConfig('pay:max_amount') || '999999.99')
        });
    } catch (e) {
        console.error('[钱包] pay-config:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 创建充值订单 ==========
router.post('/wallet/recharge', authMiddleware, async (req, res) => {
    try {
        var { amount, pay_method } = req.body;
        
        var numAmount = parseFloat(amount);
        if (isNaN(numAmount) || typeof numAmount !== 'number') {
            return res.status(400).json({ error: '充值金额必须为有效数字' });
        }
        if (numAmount <= 0) {
            return res.status(400).json({ error: '充值金额必须大于0' });
        }

        var minAmount = parseFloat(await db.config.get('pay:min_amount') || '0.01');
        var maxAmount = parseFloat(await db.config.get('pay:max_amount') || '999999.99');
        if (numAmount < minAmount || numAmount > maxAmount) {
            return res.status(400).json({ error: '充值金额必须在 ' + minAmount + ' ~ ' + maxAmount + ' 之间' });
        }
        
        if (!pay_method || !['alipay', 'wxpay'].includes(pay_method)) {
            return res.status(400).json({ error: '请选择支付方式' });
        }
        
        var enabled = await db.config.get('pay:' + pay_method + '_enabled') || '1';
        if (enabled !== '1') {
            return res.status(400).json({ error: '该支付方式暂未开放' });
        }
        
        var pid = await db.config.get('pay:pid');
        var md5Key = await db.config.get('pay:md5_key');
        var v2PrivateKey = await db.config.get('pay:v2_private_key');
        var v2PublicKey = await db.config.get('pay:v2_public_key');
        var baseUrl = await db.config.get('pay:base_url') || 'https://pay.microgg.cn/';
        var v2Enabled = (await db.config.get('pay:v2_enabled') || '0') === '1';
        
        if (!pid) return res.status(400).json({ error: '支付接口未配置，请联系管理员' });
        
        var orderNo = generateOrderNo(pay_method);
        var siteUrl = process.env.SITE_URL || baseUrl;
        var notifyUrl = siteUrl.replace(/\/+$/, '') + '/api/wallet/notify';
        var returnUrl = siteUrl.replace(/\/+$/, '') + '/user-center';
        
        var payClient;
        if (v2Enabled && v2PrivateKey && v2PublicKey) {
            payClient = createPayClient({ pid: pid, baseUrl: baseUrl, privateKey: v2PrivateKey, publicKey: v2PublicKey, notifyUrl: notifyUrl, returnUrl: returnUrl });
        } else {
            payClient = createPayClient({ pid: pid, key: md5Key, baseUrl: baseUrl, notifyUrl: notifyUrl, returnUrl: returnUrl });
        }

        var payParams = {
            type: pay_method,
            out_trade_no: orderNo,
            name: '账户余额充值',
            money: format2(numAmount),
            param: String(req.user.id),
            notify_url: notifyUrl,
            return_url: returnUrl
        };

        // PAY-1/2/3 修复：创建本地待处理订单记录，回调时从本地记录获取 userId/amount，不信任回调参数
        await db.pendingOrders.create({
            order_no: orderNo,
            user_id: req.user.id,
            amount: numAmount.toFixed(2),
            pay_method: pay_method
        });

        // 设备类型检测（用于统一下单接口）
        var userAgent = req.headers['user-agent'] || '';
        var isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent);
        var clientIp = req.ip || '127.0.0.1';

        var gatewayRes;
        if (v2Enabled && v2PrivateKey) {
            // V2: 使用统一下单接口 /api/pay/create，返回二维码链接（微信直接 weixin:// 唤起app）
            payParams.method = 'web';
            payParams.device = isMobile ? 'mobile' : 'pc';
            payParams.clientip = clientIp;
            gatewayRes = await payClient._post('/api/pay/create', payParams);
            dbg('[钱包] 网关响应(create):', JSON.stringify(gatewayRes));
        } else {
            // V1: /mapi.php 接口，clientip 为必填，device 可选
            payParams.clientip = clientIp;
            payParams.device = isMobile ? 'mobile' : 'pc';
            gatewayRes = await payClient.apiPay(payParams);
            dbg('[钱包] 网关响应(V1):', typeof gatewayRes, JSON.stringify(gatewayRes));
        }

        // 部分网关响应 Content-Type 不规范（text/html），axios 会返回字符串而非对象，这里兜底解析
        if (typeof gatewayRes === 'string') {
            var trimmed = gatewayRes.trim();
            try {
                gatewayRes = JSON.parse(trimmed);
            } catch (e) {
                dbg('[钱包] 网关响应非JSON，原样保留:', trimmed.slice(0, 200));
            }
        }

        var payUrl = null;
        // V2 create 接口: code=0 成功，pay_info 为支付链接
        if (gatewayRes && gatewayRes.code === 0 && gatewayRes.pay_info) {
            payUrl = gatewayRes.pay_info;
        }
        // V1/mapi.php 接口: code=1 成功（z-pay 文档规定为 Int 1），优先使用 urlscheme（可能是 alipays:// deep link）
        if (!payUrl && gatewayRes && gatewayRes.code === 1) {
            payUrl = gatewayRes.urlscheme || gatewayRes.payurl || gatewayRes.qrcode || gatewayRes.qr || gatewayRes.url;
        }
        if (!payUrl && gatewayRes && typeof gatewayRes === 'string') {
            var match = gatewayRes.match(/location\.replace\(['"](.+?)['"]\)/);
            if (match) {
                payUrl = baseUrl.replace(/\/+$/, '') + match[1];
                dbg('[钱包] 从HTML中提取到支付URL:', payUrl);
            }
        }

        if (payUrl) {
            res.json({ success: true, order_no: orderNo, redirect_url: payUrl });
        } else {
            // 网关业务错误（签名错误/商户未开通/金额超限等），返回 400 而非 502，避免被反向代理/CDN 替换响应体
            var errMsg = (gatewayRes && gatewayRes.msg) ? gatewayRes.msg : '支付网关响应异常，请稍后重试';
            console.error('[钱包] 网关未返回支付链接:', JSON.stringify(gatewayRes));
            var errResp = { error: errMsg };
            if (process.env.DEBUG === 'true') {
                errResp.raw = gatewayRes;
            }
            res.status(400).json(errResp);
        }
    } catch (e) {
        console.error('[钱包] recharge:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 支付异步回调 (公开端点，V1 文档为 GET 请求，兼容 POST) ==========
router.all('/wallet/notify', async (req, res) => {
    if (!checkCallbackRate(req.ip)) {
        return res.status(429).send('Too Many Requests');
    }
    try {
        // 按请求方法取单一来源，避免 query/body 参数覆盖污染
        var params = req.method === 'POST' ? req.body : req.query;
        dbg('[钱包] 支付回调:', params.out_trade_no, params.trade_status, req.method);
        
        if (params.trade_status !== 'TRADE_SUCCESS') {
            return res.send('fail');
        }
        
        var md5Key = await db.config.get('pay:md5_key');
        var v2PublicKey = await db.config.get('pay:v2_public_key');
        var v2Enabled = (await db.config.get('pay:v2_enabled') || '0') === '1';
        
        var valid = false;
        if (v2Enabled && v2PublicKey) {
            var { rsaVerify, buildSignStr } = require('../sdk/pay/sign');
            var signStr = buildSignStr(params);
            valid = rsaVerify(signStr, params.sign, v2PublicKey);
        } else if (md5Key) {
            var { md5Sign } = require('../sdk/pay/sign');
            var expected = md5Sign(params, md5Key);
            valid = expected === (params.sign || '').toLowerCase();
        }
        
        if (!valid) {
            console.error('[钱包] 回调验签失败:', params.out_trade_no);
            return res.send('fail');
        }
        
        // PAY-1/2/3 修复：从本地 pending_orders 记录获取 userId 和 amount，不信任回调参数
        var pendingOrder = await db.pendingOrders.getByOrderNo(params.out_trade_no);
        if (!pendingOrder) {
            console.error('[钱包] 回调找不到本地订单记录:', params.out_trade_no);
            return res.send('fail');
        }
        
        var userId = pendingOrder.user_id;
        var amount = parseFloat(pendingOrder.amount);
        if (!userId || isNaN(amount) || amount <= 0) {
            console.error('[钱包] 回调本地订单记录异常:', params.out_trade_no);
            return res.send('fail');
        }
        
        var user = await db.users.getById(userId);
        if (!user) return res.send('fail');
        
        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + amount;
        
        var tradeNo = params.trade_no || null;
        var apiTradeNo = await queryApiTradeNo(params.out_trade_no);

        // PAY-1/2/3 修复：利用 UNIQUE 约束作为幂等 guard，防止 notify/return 双回调双倍入账
        try {
            await db.transactionRecords.create({
                user_id: userId,
                order_no: params.out_trade_no,
                pay_time: db.now(),
                pay_method: pendingOrder.pay_method || params.type || '',
                trade_type: 'recharge',
                amount: amount.toFixed(2),
                balance_before: balanceBefore.toFixed(2),
                balance_after: balanceAfter.toFixed(2),
                trade_no: tradeNo,
                api_trade_no: apiTradeNo
            });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                dbg('[钱包] 订单已处理，跳过:', params.out_trade_no);
                return res.send('success');
            }
            throw e;
        }

        // PAY-6 修复：原子余额增量更新，避免 read-modify-write 竞态
        await db.users.incrementBalance(userId, amount);
        await db.pendingOrders.markProcessed(params.out_trade_no);
        
        try {
            await db.messages.create({
                uid: userId,
                title: '充值到账通知',
                content: '您已成功充值 ¥' + amount.toFixed(2) + '，当前余额 ¥' + balanceAfter.toFixed(2) + '。订单号：' + params.out_trade_no,
                type: 1,
                send_type: 1
            });
        } catch (e) {
            console.error('[钱包] 站内信发送失败:', e.message);
        }

        try {
            if (user.email && user.emailVerified && user.email.includes('@')) {
                var siteName = await db.config.get('site:name') || 'PVE 多用户控制面板';
                var rechargeHtml = createEmailTemplate('充值到账通知',
                    `<p>您好，您已成功 <strong>充值 ¥${amount.toFixed(2)}</strong>。</p>
                    <div class="info-box">
                        <p style="margin-bottom: 4px;">💰 充值金额：<strong>¥${amount.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">💳 当前余额：<strong>¥${balanceAfter.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">📋 订单编号：<strong>${params.out_trade_no}</strong></p>
                        <p>⏰ 充值时间：${new Date().toLocaleString('zh-CN')}</p>
                    </div>
                    <p>前往 <a href="${process.env.SITE_URL || ''}/user-center">用户中心</a> 查看余额详情。</p>`, siteName);
                await sendEmail(user.email, '充值到账通知 - ' + siteName, rechargeHtml);
            }
        } catch (e) {
            console.error('[钱包] 邮件发送失败:', e.message);
        }
        
        res.send('success');
    } catch (e) {
        console.error('[钱包] 回调处理失败:', e.message);
        res.send('fail');
    }
});

// ========== 支付同步跳转处理 (GET, 处理return_url, 备用: 网关notify_url不通时) ==========
router.get('/wallet/return', async (req, res) => {
    if (!checkCallbackRate(req.ip)) {
        return res.status(429).json({ error: '操作过于频繁，请稍后再试' });
    }
    try {
        var params = req.query;
        dbg('[钱包] 同步回调(GET):', params.out_trade_no, params.trade_status);

        if (params.trade_status !== 'TRADE_SUCCESS') {
            return res.json({ success: false, error: '支付未完成' });
        }

        var md5Key = await db.config.get('pay:md5_key');
        var v2PublicKey = await db.config.get('pay:v2_public_key');

        var valid = false;
        if (params.sign_type === 'RSA' && v2PublicKey) {
            var { rsaVerify, buildSignStr } = require('../sdk/pay/sign');
            var signStr = buildSignStr(params);
            valid = rsaVerify(signStr, params.sign, v2PublicKey);
        } else if (md5Key) {
            var { md5Sign } = require('../sdk/pay/sign');
            var expected = md5Sign(params, md5Key);
            valid = expected === (params.sign || '').toLowerCase();
        }

        if (!valid) {
            console.error('[钱包] 同步回调验签失败:', params.out_trade_no);
            return res.json({ success: false, error: '签名验证失败' });
        }

        // PAY-1/2/3 修复：从本地 pending_orders 记录获取 userId 和 amount，不信任回调参数
        var pendingOrder = await db.pendingOrders.getByOrderNo(params.out_trade_no);
        if (!pendingOrder) {
            return res.json({ success: false, error: '订单记录不存在' });
        }

        var userId = pendingOrder.user_id;
        var amount = parseFloat(pendingOrder.amount);
        if (!userId || isNaN(amount) || amount <= 0) {
            return res.json({ success: false, error: '订单记录异常' });
        }

        var user = await db.users.getById(userId);
        if (!user) return res.json({ success: false, error: '用户不存在' });

        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + amount;

        var tradeNo = params.trade_no || null;
        var apiTradeNo = await queryApiTradeNo(params.out_trade_no);

        // PAY-1/2/3 修复：利用 UNIQUE 约束作为幂等 guard，防止 notify/return 双回调双倍入账
        try {
            await db.transactionRecords.create({
                user_id: userId,
                order_no: params.out_trade_no,
                pay_time: db.now(),
                pay_method: pendingOrder.pay_method || params.type || '',
                trade_type: 'recharge',
                amount: amount.toFixed(2),
                balance_before: balanceBefore.toFixed(2),
                balance_after: balanceAfter.toFixed(2),
                trade_no: tradeNo,
                api_trade_no: apiTradeNo
            });
        } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
                var existingRec = await db.transactionRecords.getByOrderNo(params.out_trade_no);
                return res.json({ success: true, msg: '已处理', order_no: params.out_trade_no, amount: existingRec ? existingRec.amount : amount.toFixed(2) });
            }
            throw e;
        }

        // PAY-6 修复：原子余额增量更新，避免 read-modify-write 竞态
        await db.users.incrementBalance(userId, amount);
        await db.pendingOrders.markProcessed(params.out_trade_no);

        try {
            await db.messages.create({
                uid: userId,
                title: '充值到账通知',
                content: '您已成功充值 ¥' + amount.toFixed(2) + '，当前余额 ¥' + balanceAfter.toFixed(2) + '。订单号：' + params.out_trade_no,
                type: 1,
                send_type: 1
            });
        } catch (e) {
            console.error('[钱包] 站内信发送失败:', e.message);
        }

        try {
            if (user.email && user.emailVerified && user.email.includes('@')) {
                var siteName = await db.config.get('site:name') || 'PVE 多用户控制面板';
                var rechargeHtml = createEmailTemplate('充值到账通知',
                    `<p>您好，您已成功 <strong>充值 ¥${amount.toFixed(2)}</strong>。</p>
                    <div class="info-box">
                        <p style="margin-bottom: 4px;">💰 充值金额：<strong>¥${amount.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">💳 当前余额：<strong>¥${balanceAfter.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">📋 订单编号：<strong>${params.out_trade_no}</strong></p>
                        <p>⏰ 充值时间：${new Date().toLocaleString('zh-CN')}</p>
                    </div>
                    <p>前往 <a href="${process.env.SITE_URL || ''}/user-center">用户中心</a> 查看余额详情。</p>`, siteName);
                await sendEmail(user.email, '充值到账通知 - ' + siteName, rechargeHtml);
            }
        } catch (e) {
            console.error('[钱包] 邮件发送失败:', e.message);
        }

        dbg('[钱包] 同步回调入账成功:', params.out_trade_no, amount.toFixed(2));

        res.json({ success: true, order_no: params.out_trade_no, amount: amount.toFixed(2), balance: balanceAfter.toFixed(2) });
    } catch (e) {
        console.error('[钱包] 同步回调失败:', e.message);
        res.json({ success: false, error: '处理异常' });
    }
});

// ========== 充值订单状态查询 ==========
router.get('/wallet/order-status/:order_no', authMiddleware, async (req, res) => {
    try {
        var orderNo = req.params.order_no;

        // 订单号格式校验：ZFB/WX 前缀 + 12位时间 + 8位随机数字
        if (!/^(ZFB|WX)[0-9]{20}$/.test(orderNo)) {
            return res.status(400).json({ error: '无效的订单号格式' });
        }

        // 用户级限速：60 次/分钟（轮询间隔 2 秒，每分钟最多 30 次查询，留余量避免卡在阈值）
        var rateKey = 'order-status:' + req.user.id;
        var now = Date.now();
        var windowMs = 60000;
        var maxRequests = 60;
        var record = orderStatusRateLimiter.get(rateKey);
        if (!record || now - record.windowStart > windowMs) {
            orderStatusRateLimiter.set(rateKey, { windowStart: now, count: 1 });
        } else {
            if (record.count >= maxRequests) {
                return res.status(429).json({ error: '查询过于频繁，请稍后再试' });
            }
            record.count++;
        }

        // 查询订单记录
        var txRecord = await db.transactionRecords.getByOrderNo(orderNo);

        if (txRecord) {
            // 已支付 — 校验订单归属
            if (txRecord.user_id !== req.user.id) {
                return res.status(403).json({ error: '无权查询此订单' });
            }
            // 查询用户最新余额
            var user = await db.users.getById(req.user.id);
            res.json({
                status: 'paid',
                amount: txRecord.amount,
                balance: user ? user.balance : txRecord.balance_after
            });
        } else {
            // 未支付或不存在 — 不泄露订单是否存在
            res.json({ status: 'pending' });
        }
    } catch (e) {
        console.error('[钱包] order-status:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 余额抵扣续费 ==========
router.post('/wallet/renew', authMiddleware, async (req, res) => {
    try {
        var { type, vmid, ctid, quantity, period_count } = req.body;
        var userId = req.user.id;
        var isAdmin = req.user.role === 'admin';
        
        if (!type || !['vm', 'lxc'].includes(type)) {
            return res.status(400).json({ error: '无效的资源类型' });
        }
        var qty = parseInt(period_count || quantity);
        if (!Number.isInteger(parseFloat(quantity)) || qty < 1 || String(quantity).trim() !== String(qty)) {
            if (!period_count) {
                return res.status(400).json({ error: '续费数量必须为正整数' });
            }
        }
        if (!Number.isInteger(qty) || qty < 1) {
            return res.status(400).json({ error: '续费数量必须为正整数' });
        }
        
        var resource;
        if (type === 'vm') {
            var allVms = await db.vms.getAll();
            resource = allVms.find(v => v.vm_id === parseInt(vmid));
        } else {
            var allLxc = await db.lxcContainers.getAll();
            resource = allLxc.find(c => c.ct_id === parseInt(ctid));
        }
        
        if (!resource) return res.status(404).json({ error: '资源不存在' });
        
        if (resource.user_id !== userId && !isAdmin) {
            return res.status(403).json({ error: '无权限操作' });
        }
        
        var price = parseFloat(resource.renewal_price || '0');
        if (price <= 0) return res.status(400).json({ error: '该资源未设置续费价格' });

        var period = req.body.period || resource.renewal_period || 'month';
        // SEC-04: period 白名单校验
        if (!['month', 'quarter', 'year'].includes(period)) {
            return res.status(400).json({ error: '无效的计费周期' });
        }

        // 如果用户选择了不同的周期，重新计算单价
        var actualPrice = parseFloat(resource.renewal_price || '0');
        var storedPeriod = resource.renewal_period || 'month';
        if (period !== storedPeriod) {
            // 优先用资源存储的 monthly_price + 折扣按周期独立计价
            var monthlyPrice = parseFloat(resource.monthly_price || '0');
            if (monthlyPrice > 0) {
                var qDiscount = parseInt(resource.quarterly_discount) || 0;
                var yDiscount = parseInt(resource.yearly_discount) || 0;
                actualPrice = calculateAmount(monthlyPrice, period, 1, qDiscount, yDiscount);
            } else {
                // 历史数据无 monthly_price，回退到原逻辑
                var originalMonths = getPeriodMonths(storedPeriod);
                var monthlyBase = actualPrice / originalMonths;
                var newMonths = getPeriodMonths(period);
                actualPrice = monthlyBase * newMonths;
            }
        }
        var totalPrice = actualPrice * qty;

        var user = await db.users.getById(userId);
        var balance = parseFloat(user.balance || '0');
        
        if (balance < totalPrice) {
            return res.status(400).json({ error: '当前账户余额不足，无法使用余额抵扣，请先充值后再续费' });
        }
        
        var addDays = period === 'year' ? qty * 365 : period === 'quarter' ? qty * 90 : qty * 30;
        
        var oldExpiration = resource.expiration_date ? new Date(resource.expiration_date) : new Date();
        oldExpiration.setDate(oldExpiration.getDate() + addDays);
        var newExpiration = formatLocalDate(oldExpiration);
        
        var newBalance = (balance - totalPrice).toFixed(2);
        var orderNo = generateOrderId('RENEWAL');
        // ARCH-10: 扣款+更新到期时间+流水记录三步放入事务，保证原子性
        await withTransaction(async (conn) => {
            // 1. 扣款（原子扣减）
            await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) - ? WHERE id = ?', [totalPrice, userId]);
            // 2. 更新到期时间
            if (type === 'vm') {
                await conn.execute('UPDATE vms SET expiration_date = ? WHERE id = ?', [newExpiration, resource.id]);
            } else {
                await conn.execute('UPDATE lxc_containers SET expiration_date = ? WHERE id = ?', [newExpiration, resource.id]);
            }
            // 3. 创建流水
            await conn.execute(
                'INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [userId, orderNo, db.now(), 'balance', 'renewal', totalPrice.toFixed(2), period, qty, balance.toFixed(2), newBalance, type, resource.vm_id || resource.ct_id || resource.id, null, null, db.now()]
            );
        });

        // 续费后自动开机（PVE 操作不放入事务，避免长事务）
        // 仅当关机原因是"到期自动关机"才自动开机，用户手动关机的资源不自动开机
        try {
            var renewVmid = type === 'vm' ? resource.vm_id : resource.ct_id;
            var freshResource = type === 'vm'
                ? await db.vms.getByVmid(renewVmid)
                : (await db.lxcContainers.getByCtId(renewVmid))[0];
            var shouldAutoStart = freshResource && freshResource.shutdown_reason === 'expired';
            if (shouldAutoStart) {
                if (type === 'vm') {
                    var renewStatus = await pveApi.getVmStatus(renewVmid);
                    if (renewStatus && renewStatus.status === 'stopped') {
                        await pveApi.startVm(renewVmid);
                    }
                } else {
                    var renewLxcStatus = await pveApi.getLxcStatus(renewVmid);
                    if (renewLxcStatus && renewLxcStatus.status === 'stopped') {
                        await pveApi.startLxc(renewVmid);
                    }
                }
            }
        } catch (startErr) { console.error('[wallet] 续费自动开机失败:', startErr.message); }

        var resourceName = resource.name || (type === 'vm' ? 'VM ' + resource.vm_id : 'CT ' + resource.ct_id);
        var periodStr = period === 'year' ? qty + '年' : period === 'quarter' ? qty + '季' : qty + '个月';
        var expiryDisplay = newExpiration ? new Date(newExpiration).toLocaleString('zh-CN') : '永久有效';
        var msgContent = '资源名称：' + resourceName + '\n续费详情：' + periodStr + '\n到期时间：' + expiryDisplay + '\n实付金额：¥' + totalPrice.toFixed(2) + '\n余额变动：¥' + balance.toFixed(2) + ' → ¥' + newBalance + '\n订单号：' + orderNo;
        var resourceTypeLabel = type === 'vm' ? '虚拟机' : 'LXC 容器';
        
        try {
            await db.messages.create({
                uid: userId,
                title: '资源续费成功',
                content: msgContent,
                type: 2,
                send_type: 1
            });
        } catch (e) {
            console.error('[钱包] 续费站内信发送失败:', e.message);
        }
        
        try {
            if (user.email && user.emailVerified && user.email.includes('@')) {
                var siteName = await db.config.get('site:name') || 'PVE 多用户控制面板';
                var renewHtml = createEmailTemplate('资源续费成功',
                    `<p>您好，您的 <strong>${resourceTypeLabel}「${resourceName}」</strong> 已续费成功。</p>
                    <div class="info-box">
                        <p style="margin-bottom: 4px;">📌 资源名称：<strong>${resourceName}</strong></p>
                        <p style="margin-bottom: 4px;">📅 续费详情：<strong>${periodStr}</strong></p>
                        <p style="margin-bottom: 4px;">⏳ 到期时间：<strong>${expiryDisplay}</strong></p>
                        <p style="margin-bottom: 4px;">💸 实付金额：<strong>¥${totalPrice.toFixed(2)}</strong></p>
                        <p style="margin-bottom: 4px;">💳 余额变动：<strong>¥${balance.toFixed(2)} → ¥${newBalance}</strong></p>
                        <p style="margin-bottom: 4px;">📋 订单编号：<strong>${orderNo}</strong></p>
                        <p>⏰ 续费时间：${new Date().toLocaleString('zh-CN')}</p>
                    </div>
                    <p>前往 <a href="${process.env.SITE_URL || ''}/">控制面板</a> 查看资源详情。</p>`, siteName);
                await sendEmail(user.email, '资源续费成功 - ' + siteName, renewHtml);
            }
        } catch (e) {
            console.error('[钱包] 续费邮件发送失败:', e.message);
        }
        
        res.json({
            success: true,
            message: '续费成功',
            order_no: orderNo,
            balance: newBalance,
            balance_before: balance.toFixed(2),
            balance_after: newBalance,
            new_expiration: newExpiration
        });
    } catch (e) {
        console.error('[钱包] renew:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 用户交易流水 ==========
router.get('/wallet/transactions', authMiddleware, async (req, res) => {
    try {
        var page = parseInt(req.query.page) || 1;
        var limit = parseInt(req.query.limit) || 20;
        var offset = (page - 1) * limit;
        var trade_type = req.query.trade_type || '';
        var order_no = req.query.order_no || '';
        var start_time = req.query.start_time || '';
        var end_time = req.query.end_time || '';
        var pay_method = req.query.pay_method || '';
        
        var params = { limit: limit, offset: offset };
        if (trade_type) params.trade_type = trade_type;
        if (order_no) params.order_no = order_no;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;
        if (pay_method) params.pay_method = pay_method;
        
        var list = await db.transactionRecords.getByUserId(req.user.id, params);
        var total = await db.transactionRecords.countAll(Object.assign({}, params, { user_id: req.user.id }));
        
        list = list.map(function(r) { return { id: r.id, order_no: r.order_no, pay_time: r.pay_time, pay_method: r.pay_method, trade_type: r.trade_type, amount: parseFloat(r.amount).toFixed(2), period: r.period, period_count: r.period_count, resource_type: r.resource_type, trade_no: r.api_trade_no || r.trade_no || null, created_at: r.created_at }; });
        
        res.json({ data: list, total: total, page: page, limit: limit });
    } catch (e) {
        console.error('[钱包] transactions:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 用户订单查询 ==========
router.get('/orders', authMiddleware, async (req, res) => {
    try {
        var hasQuery = req.query.page || req.query.order_no || req.query.type || req.query.status;
        if (hasQuery) {
            var page = parseInt(req.query.page) || 1;
            var limit = parseInt(req.query.limit) || 20;
            var params = { page: page, limit: limit, user_id: req.user.id };
            var order_no = (req.query.order_no || '').trim();
            if (order_no.length > 50) return res.status(400).json({ error: '订单号过长' });
            if (order_no) params.order_no = order_no;
            if (req.query.type && ['vm', 'lxc', 'disk'].includes(req.query.type)) params.type = req.query.type;
            if (req.query.status && ['completed', 'pending', 'refunded', 'destroyed'].includes(req.query.status)) params.status = req.query.status;
            var result = await db.orders.getByUser(req.user.id, params);
            result.rows = await Promise.all((result.rows || result.data || []).map(async function(order) {
                var packageName = '';
                if (order.type === 'vm') {
                    var pkg = await db.vmPackages.getById(order.package_id);
                    packageName = pkg ? pkg.name : '';
                } else if (order.type === 'lxc') {
                    var pkg = await db.lxcPackages.getById(order.package_id);
                    packageName = pkg ? pkg.name : '';
                } else if (order.type === 'disk') {
                    packageName = order.resource_name || '数据盘';
                }
                return Object.assign({}, order, { package_name: packageName });
            }));
            return res.json({ data: result.rows, total: result.total, page: result.page, limit: result.limit });
        }
        var result = await db.orders.getByUser(req.user.id, { page: 1, limit: 200 });
        var rows = result.rows || result.data || [];
        rows = await Promise.all(rows.map(async function(order) {
            var packageName = '';
            if (order.type === 'vm') {
                var pkg = await db.vmPackages.getById(order.package_id);
                packageName = pkg ? pkg.name : '';
            } else if (order.type === 'lxc') {
                var pkg = await db.lxcPackages.getById(order.package_id);
                packageName = pkg ? pkg.name : '';
            } else if (order.type === 'disk') {
                packageName = order.resource_name || '数据盘';
            }
            return Object.assign({}, order, { package_name: packageName });
        }));
        res.json(rows);
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

module.exports = router;
