const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { safeError } = require('../utils/safe-error');
// 业务下沉 services/（规范第七节）：支付编排走 services/payment.js，续费计费走 services/billing.js
const paymentService = require('../services/payment');
const billingService = require('../services/billing');
// 单一来源：周期/订单常量统一走 constants（规范第七节）
const { VALID_PERIODS, ORDER_STATUS } = require('../constants');
const dbg = require('../utils/debug');

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

// ========== 创建充值订单（业务在 services/payment.js） ==========
router.post('/wallet/recharge', authMiddleware, async (req, res) => {
    try {
        var result = await paymentService.createRechargeOrder({
            userId: req.user.id,
            amount: req.body.amount,
            payMethod: req.body.pay_method,
            userAgent: req.headers['user-agent'] || '',
            ip: req.ip || '127.0.0.1'
        });
        if (!result.ok) {
            if (result.raw !== undefined) {
                return res.status(400).json({ error: result.error, raw: result.raw });
            }
            return res.status(result.status).json({ error: result.error });
        }
        res.json({ success: true, order_no: result.data.orderNo, redirect_url: result.data.payUrl });
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
        var result = await paymentService.processPayCallback(params, { mode: 'notify' });
        if (!result.ok) {
            return res.send('fail');
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
        var result = await paymentService.processPayCallback(params, { mode: 'return' });
        if (!result.ok) {
            if (result.reason === 'trade_status') return res.json({ success: false, error: '支付未完成' });
            if (result.reason === 'sign') return res.json({ success: false, error: '签名验证失败' });
            if (result.reason === 'no_order') return res.json({ success: false, error: '订单记录不存在' });
            if (result.reason === 'bad_order') return res.json({ success: false, error: '订单记录异常' });
            if (result.reason === 'no_user') return res.json({ success: false, error: '用户不存在' });
            return res.json({ success: false, error: '处理异常' });
        }
        if (result.duplicate) {
            var existingRec = await db.transactionRecords.getByOrderNo(params.out_trade_no);
            return res.json({ success: true, msg: '已处理', order_no: params.out_trade_no, amount: existingRec ? existingRec.amount : result.amount });
        }
        dbg('[钱包] 同步回调入账成功:', params.out_trade_no, result.amount);
        res.json({ success: true, order_no: result.orderNo, amount: result.amount, balance: result.balanceAfter });
    } catch (e) {
        console.error('[钱包] 同步回调失败:', e.message);
        res.json({ success: false, error: '处理异常' });
    }
});

// ========== 充值订单状态查询 ==========
router.get('/wallet/order-status/:order_no', authMiddleware, async (req, res) => {
    try {
        var orderNo = req.params.order_no;

        // 订单号格式校验：ZFB/WX 前缀 + 14位时间戳 + 8位随机数字（兼容旧 12 位时间戳的 20 位数字）
        if (!/^(ZFB|WX)[0-9]{20,22}$/.test(orderNo)) {
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
            // V3-11 修复：非本人订单统一返回 pending，与「订单不存在」无差异，杜绝状态枚举
            if (txRecord.user_id !== req.user.id) {
                return res.json({ status: 'pending' });
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

// ========== 余额抵扣续费（业务在 services/billing.js） ==========
router.post('/wallet/renew', authMiddleware, async (req, res) => {
    try {
        var result = await billingService.renewByBalance({
            userId: req.user.id,
            isAdmin: req.user.role === 'admin',
            type: req.body.type,
            vmid: req.body.vmid,
            ctid: req.body.ctid,
            quantity: req.body.quantity,
            period_count: req.body.period_count,
            period: req.body.period
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error });
        }
        res.json(result.data);
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
            if (req.query.status && ORDER_STATUS.includes(req.query.status)) params.status = req.query.status;
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
