const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createPayClient, generateOrderId } = require('../sdk/pay');
const dbg = require('../utils/debug');

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
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
        
        var orderNo = generateOrderId('RECHARGE');
        var siteUrl = process.env.SITE_URL || baseUrl;
        var notifyUrl = siteUrl.replace(/\/+$/, '') + '/api/wallet/notify';
        var returnUrl = siteUrl.replace(/\/+$/, '') + '/user-center.html';
        
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

        var gatewayRes;
        if (v2Enabled && v2PrivateKey) {
            gatewayRes = await payClient._post('/api/pay/submit', payParams);
            dbg('[钱包] 网关响应:', JSON.stringify(gatewayRes));
        } else {
            gatewayRes = await payClient.apiPay(payParams);
            dbg('[钱包] 网关响应(V1):', JSON.stringify(gatewayRes));
        }

        var payUrl = null;
        if (gatewayRes && gatewayRes.code === 1) {
            payUrl = gatewayRes.payurl || gatewayRes.qrcode || gatewayRes.qr || gatewayRes.url;
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
            console.error('[钱包] 网关未返回支付链接:', JSON.stringify(gatewayRes));
            res.status(502).json({ error: '支付网关响应异常，请稍后重试' });
        }
    } catch (e) {
        console.error('[钱包] recharge:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 支付异步回调 (公开端点) ==========
router.post('/wallet/notify', async (req, res) => {
    try {
        var params = req.body;
        dbg('[钱包] 支付回调:', params.out_trade_no, params.trade_status);
        
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
        
        var existing = await db.transactionRecords.getByOrderNo(params.out_trade_no);
        if (existing) {
            return res.send('success');
        }
        
        var userId = params.param ? parseInt(params.param) : null;
        if (!userId) {
            console.error('[钱包] 回调无法识别用户:', params.out_trade_no);
            return res.send('fail');
        }
        
        var user = await db.users.getById(userId);
        if (!user) return res.send('fail');
        
        var amount = parseFloat(params.money || '0');
        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + amount;
        
        await db.users.update(userId, { balance: balanceAfter.toFixed(2) });
        
        await db.transactionRecords.create({
            user_id: userId,
            order_no: params.out_trade_no,
            pay_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            pay_method: params.type || '',
            trade_type: 'recharge',
            amount: amount.toFixed(2),
            balance_before: balanceBefore.toFixed(2),
            balance_after: balanceAfter.toFixed(2)
        });
        
        res.send('success');
    } catch (e) {
        console.error('[钱包] 回调处理失败:', e.message);
        res.send('fail');
    }
});

// ========== 支付同步跳转处理 (GET, 处理return_url, 备用: 网关notify_url不通时) ==========
router.get('/wallet/return', async (req, res) => {
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

        var existing = await db.transactionRecords.getByOrderNo(params.out_trade_no);
        if (existing) {
            return res.json({ success: true, msg: '已处理', order_no: params.out_trade_no });
        }

        var userId = params.param ? parseInt(params.param) : null;
        if (!userId) {
            return res.json({ success: false, error: '无法识别用户' });
        }

        var user = await db.users.getById(userId);
        if (!user) return res.json({ success: false, error: '用户不存在' });

        var amount = parseFloat(params.money || '0');
        var balanceBefore = parseFloat(user.balance || '0');
        var balanceAfter = balanceBefore + amount;

        await db.users.update(userId, { balance: balanceAfter.toFixed(2) });

        await db.transactionRecords.create({
            user_id: userId,
            order_no: params.out_trade_no,
            pay_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            pay_method: params.type || '',
            trade_type: 'recharge',
            amount: amount.toFixed(2),
            balance_before: balanceBefore.toFixed(2),
            balance_after: balanceAfter.toFixed(2)
        });

        dbg('[钱包] 同步回调入账成功:', params.out_trade_no, amount.toFixed(2));

        res.json({ success: true, order_no: params.out_trade_no, balance: balanceAfter.toFixed(2) });
    } catch (e) {
        console.error('[钱包] 同步回调失败:', e.message);
        res.json({ success: false, error: '处理异常' });
    }
});

// ========== 余额抵扣续费 ==========
router.post('/wallet/renew', authMiddleware, async (req, res) => {
    try {
        var { type, vmid, ctid, quantity } = req.body;
        var userId = req.user.id;
        var isAdmin = req.user.role === 'admin';
        
        if (!type || !['vm', 'lxc'].includes(type)) {
            return res.status(400).json({ error: '无效的资源类型' });
        }
        var qty = parseInt(quantity) || 1;
        if (qty < 1) return res.status(400).json({ error: '续费数量至少为1' });
        
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
        
        var totalPrice = price * qty;
        var user = await db.users.getById(userId);
        var balance = parseFloat(user.balance || '0');
        
        if (balance < totalPrice) {
            return res.status(400).json({ error: '当前账户余额不足，无法使用余额抵扣，请先充值后再续费' });
        }
        
        var period = resource.renewal_period || 'month';
        var addDays = period === 'year' ? qty * 365 : qty * 30;
        
        var oldExpiration = resource.expiration_date ? new Date(resource.expiration_date) : new Date();
        oldExpiration.setDate(oldExpiration.getDate() + addDays);
        var newExpiration = oldExpiration.toISOString().slice(0, 19).replace('T', ' ');
        
        var newBalance = (balance - totalPrice).toFixed(2);
        await db.users.update(userId, { balance: newBalance });
        
        if (type === 'vm') {
            await db.vms.update(resource.id, { expiration_date: newExpiration });
        } else {
            await db.lxcContainers.update(resource.id, { expiration_date: newExpiration });
        }
        
        var orderNo = generateOrderId('RENEWAL');
        await db.transactionRecords.create({
            user_id: userId,
            order_no: orderNo,
            pay_time: new Date().toISOString().slice(0, 19).replace('T', ' '),
            pay_method: 'balance',
            trade_type: 'renewal',
            amount: totalPrice.toFixed(2),
            period: period,
            period_count: qty,
            balance_before: balance.toFixed(2),
            balance_after: newBalance,
            resource_type: type,
            resource_id: resource.vm_id || resource.ct_id || resource.id
        });
        
        res.json({
            success: true,
            message: '续费成功',
            order_no: orderNo,
            balance_before: balance.toFixed(2),
            balance_after: newBalance,
            expiration_date: newExpiration
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
        var limit = parseInt(req.query.limit) || 10;
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
        
        list = list.map(function(r) { return { id: r.id, order_no: r.order_no, pay_time: r.pay_time, pay_method: r.pay_method, trade_type: r.trade_type, amount: parseFloat(r.amount).toFixed(2), period: r.period, period_count: r.period_count, resource_type: r.resource_type, created_at: r.created_at }; });
        
        res.json({ data: list, total: total, page: page, limit: limit });
    } catch (e) {
        console.error('[钱包] transactions:', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
