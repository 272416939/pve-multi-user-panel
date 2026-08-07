// server/services/payment.js - 支付业务服务
// 规范第七节：第三方外部调用与业务编排进 services/，路由只做校验与响应
// 从 routes/wallet.js 抽取：充值下单（/wallet/recharge）、支付回调入账（/wallet/notify + /wallet/return 共用核心）

const db = require('../api/db');
const { createPayClient } = require('../sdk/pay');
const { createEmailTemplate, sendEmail, shouldSendEmail } = require('../utils/email');
const dbg = require('../utils/debug');
const { generateOrderNo } = require('../utils/order-utils');
const { PAYMENT_METHODS } = require('../constants');
// V4-01 修复：支付密钥 AES 加密存储，消费前解密（decrypt 对存量明文自动透传）
const { decrypt } = require('../utils/crypto-utils');

/**
 * 向支付网关查询接口订单号（失败静默降级，返回 null）
 * @param {string} outTradeNo - 商户订单号
 * @returns {Promise<string|null>}
 */
async function queryApiTradeNo(outTradeNo) {
    try {
        var pid = await db.config.get('pay:pid');
        var md5Key = decrypt(await db.config.get('pay:md5_key') || '');
        var v2PrivateKey = decrypt(await db.config.get('pay:v2_private_key') || '');
        var v2PublicKey = decrypt(await db.config.get('pay:v2_public_key') || '');
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
            dbg('[payment] 查询到接口订单号:', queryRes.api_trade_no);
            return queryRes.api_trade_no;
        }
    } catch (e) {
        console.error('[payment] 查询api_trade_no失败:', e.message);
    }
    return null;
}

function format2(num) {
    var n = parseFloat(num);
    if (isNaN(n)) return '0.00';
    return n.toFixed(2);
}

/**
 * 创建充值订单并请求支付网关
 * 原 routes/wallet.js /wallet/recharge 业务。返回对象模式：
 * - { ok: true, data: { orderNo, payUrl } } 成功
 * - { ok: false, status, error } 业务校验失败（网关未返回支付链接也按原逻辑返回 400）
 * @param {object} opts - { userId, amount, payMethod, userAgent, ip }
 */
async function createRechargeOrder(opts) {
    var { userId, amount, payMethod, userAgent, ip } = opts;

    var numAmount = parseFloat(amount);
    if (isNaN(numAmount) || typeof numAmount !== 'number') {
        return { ok: false, status: 400, error: '充值金额必须为有效数字' };
    }
    if (numAmount <= 0) {
        return { ok: false, status: 400, error: '充值金额必须大于0' };
    }

    var minAmount = parseFloat(await db.config.get('pay:min_amount') || '0.01');
    var maxAmount = parseFloat(await db.config.get('pay:max_amount') || '999999.99');
    if (numAmount < minAmount || numAmount > maxAmount) {
        return { ok: false, status: 400, error: '充值金额必须在 ' + minAmount + ' ~ ' + maxAmount + ' 之间' };
    }

    if (!payMethod || !PAYMENT_METHODS.includes(payMethod)) {
        return { ok: false, status: 400, error: '请选择支付方式' };
    }

    var enabled = await db.config.get('pay:' + payMethod + '_enabled') || '1';
    if (enabled !== '1') {
        return { ok: false, status: 400, error: '该支付方式暂未开放' };
    }

    var pid = await db.config.get('pay:pid');
    var md5Key = decrypt(await db.config.get('pay:md5_key') || '');
    var v2PrivateKey = decrypt(await db.config.get('pay:v2_private_key') || '');
    var v2PublicKey = decrypt(await db.config.get('pay:v2_public_key') || '');
    var baseUrl = await db.config.get('pay:base_url') || 'https://pay.microgg.cn/';
    var v2Enabled = (await db.config.get('pay:v2_enabled') || '0') === '1';
    // V4-04 修复：v1_enabled 开关生效（默认 '1' 保持存量行为），V1 通道可被管理员显式关闭
    var v1Enabled = (await db.config.get('pay:v1_enabled') || '1') === '1';

    if (!pid) return { ok: false, status: 400, error: '支付接口未配置，请联系管理员' };

    var orderNo = generateOrderNo(payMethod);
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
        type: payMethod,
        out_trade_no: orderNo,
        name: '账户余额充值',
        money: format2(numAmount),
        param: String(userId),
        notify_url: notifyUrl,
        return_url: returnUrl
    };

    // PAY-1/2/3 修复：创建本地待处理订单记录，回调时从本地记录获取 userId/amount，不信任回调参数
    await db.pendingOrders.create({
        order_no: orderNo,
        user_id: userId,
        amount: numAmount.toFixed(2),
        pay_method: payMethod
    });

    // 设备类型检测（用于统一下单接口）
    var isMobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(userAgent || '');
    var clientIp = ip || '127.0.0.1';

    var gatewayRes;
    if (v2Enabled && v2PrivateKey) {
        // V2: 使用统一下单接口 /api/pay/create，返回二维码链接（微信直接 weixin:// 唤起app）
        payParams.method = 'web';
        payParams.device = isMobile ? 'mobile' : 'pc';
        payParams.clientip = clientIp;
        gatewayRes = await payClient._post('/api/pay/create', payParams);
        dbg('[payment] 网关响应(create):', JSON.stringify(gatewayRes));
    } else {
        // V4-04 修复：V1 mapi 通道受 v1_enabled 开关控制，关闭后拒绝下单
        if (!v1Enabled) {
            return { ok: false, status: 400, error: 'V1 支付通道已关闭，请联系管理员' };
        }
        // V1: /mapi.php 接口，clientip 为必填，device 可选
        payParams.clientip = clientIp;
        payParams.device = isMobile ? 'mobile' : 'pc';
        gatewayRes = await payClient.apiPay(payParams);
        dbg('[payment] 网关响应(V1):', typeof gatewayRes, JSON.stringify(gatewayRes));
    }

    // 部分网关响应 Content-Type 不规范（text/html），axios 会返回字符串而非对象，这里兜底解析
    if (typeof gatewayRes === 'string') {
        var trimmed = gatewayRes.trim();
        try {
            gatewayRes = JSON.parse(trimmed);
        } catch (e) {
            dbg('[payment] 网关响应非JSON，原样保留:', trimmed.slice(0, 200));
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
            dbg('[payment] 从HTML中提取到支付URL:', payUrl);
        }
    }

    if (payUrl) {
        return { ok: true, data: { orderNo: orderNo, payUrl: payUrl } };
    }
    // 网关业务错误（签名错误/商户未开通/金额超限等），返回 400 而非 502，避免被反向代理/CDN 替换响应体
    var errMsg = (gatewayRes && gatewayRes.msg) ? gatewayRes.msg : '支付网关响应异常，请稍后重试';
    console.error('[payment] 网关未返回支付链接:', JSON.stringify(gatewayRes));
    var errResp = { error: errMsg };
    if (process.env.DEBUG === 'true') {
        errResp.raw = gatewayRes;
    }
    return { ok: false, status: 400, error: errMsg, raw: process.env.DEBUG === 'true' ? gatewayRes : undefined };
}

/**
 * 支付回调核心入账（notify 与 return 共用）
 * PAY-1/2/3：从本地 pending_orders 记录获取 userId/amount，不信任回调参数；
 * PAY-6：原子余额增量更新；UNIQUE 约束幂等防双回调。
 * 验签差异：notify 模式在 v2 已配置时直接走 RSA；return 模式需 sign_type==='RSA' 才走 RSA（与原路由行为一致）。
 * 验签失败/参数异常返回 { ok: false, reason }，由调用方决定响应体（notify 返回 'fail' 文本，return 返回 JSON）。
 * @param {object} params - 回调参数（query 或 body，单一来源）
 * @param {object} [opts] - { mode: 'notify'|'return' }
 * @returns {Promise<{ok: boolean, reason?: string, duplicate?: boolean, amount?: string, balanceAfter?: string, orderNo?: string}>}
 */
async function processPayCallback(params, opts) {
    var mode = (opts && opts.mode) || 'notify';
    dbg('[payment] 支付回调:', params.out_trade_no, params.trade_status);

    if (params.trade_status !== 'TRADE_SUCCESS') {
        return { ok: false, reason: 'trade_status' };
    }

    var md5Key = decrypt(await db.config.get('pay:md5_key') || '');
    var v2PublicKey = decrypt(await db.config.get('pay:v2_public_key') || '');
    var v2Enabled = (await db.config.get('pay:v2_enabled') || '0') === '1';
    // V4-04 修复：v1_enabled 开关生效（默认 '1' 保持存量行为），关闭后 MD5 验签回退被禁用
    var v1Enabled = (await db.config.get('pay:v1_enabled') || '1') === '1';

    // 兼容 MD5：优先 V2 RSA 验签，未配置 V2 时回退 MD5（生产建议配置 V2）
    // return 模式原行为：sign_type === 'RSA' 且 v2 配置才走 RSA，否则走 MD5
    var valid = false;
    var useRsa = (mode === 'return') ? (params.sign_type === 'RSA' && v2Enabled && v2PublicKey) : (v2Enabled && v2PublicKey);
    if (useRsa) {
        var { rsaVerify, buildSignStr } = require('../sdk/pay/sign');
        var signStr = buildSignStr(params);
        valid = rsaVerify(signStr, params.sign, v2PublicKey);
    } else if (md5Key && v1Enabled) {
        var { md5Sign } = require('../sdk/pay/sign');
        var expected = md5Sign(params, md5Key);
        valid = expected === (params.sign || '').toLowerCase();
    }

    if (!valid) {
        console.error('[payment] 回调验签失败:', params.out_trade_no);
        return { ok: false, reason: 'sign' };
    }

    // PAY-1/2/3 修复：从本地 pending_orders 记录获取 userId 和 amount，不信任回调参数
    var pendingOrder = await db.pendingOrders.getByOrderNo(params.out_trade_no);
    if (!pendingOrder) {
        console.error('[payment] 回调找不到本地订单记录:', params.out_trade_no);
        return { ok: false, reason: 'no_order' };
    }

    var userId = pendingOrder.user_id;
    var amount = parseFloat(pendingOrder.amount);
    if (!userId || isNaN(amount) || amount <= 0) {
        console.error('[payment] 回调本地订单记录异常:', params.out_trade_no);
        return { ok: false, reason: 'bad_order' };
    }

    var user = await db.users.getById(userId);
    if (!user) return { ok: false, reason: 'no_user' };

    var balanceBefore = parseFloat(user.balance || '0');
    var balanceAfter = balanceBefore + amount;

    var tradeNo = params.trade_no || null;
    var apiTradeNo = await queryApiTradeNo(params.out_trade_no);

    // PAY-1/2/3 修复：利用 UNIQUE 约束作为幂等 guard，防止 notify/return 双回调双倍入账
    // M-5 修复：流水插入 + 余额增加 + 订单标记放入同一事务，避免中途失败导致「已付未到账且无法重试」
    const { withTransaction } = require('../utils/with-transaction');
    try {
        await withTransaction(async (conn) => {
            // 事务内读取最新余额，保证 balance_before/after 与扣款一致（防并发竞态）
            const [balanceRows] = await conn.execute('SELECT balance FROM users WHERE id = ?', [userId]);
            const latestBalance = balanceRows[0] ? parseFloat(balanceRows[0].balance || '0') : balanceBefore;
            const newBalance = latestBalance + amount;
            balanceAfter = newBalance;
            await conn.execute(
                `INSERT INTO transaction_records (user_id, order_no, pay_time, pay_method, trade_type, amount, period, period_count, balance_before, balance_after, resource_type, resource_id, trade_no, api_trade_no, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    userId, params.out_trade_no, db.now(), pendingOrder.pay_method || params.type || '',
                    'recharge', amount.toFixed(2),
                    null, null,
                    latestBalance.toFixed(2), newBalance.toFixed(2),
                    null, null,
                    tradeNo, apiTradeNo, db.now()
                ]
            );
            // PAY-6 修复：原子余额增量更新（同一事务内，与流水插入同生共死）
            await conn.execute('UPDATE users SET balance = CAST(balance AS DECIMAL(10,2)) + ? WHERE id = ?', [amount, userId]);
            await conn.execute("UPDATE pending_orders SET status = 'processed', processed_at = NOW() WHERE order_no = ?", [params.out_trade_no]);
        });
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            dbg('[payment] 订单已处理，跳过:', params.out_trade_no);
            return { ok: true, duplicate: true, orderNo: params.out_trade_no, amount: amount.toFixed(2) };
        }
        throw e;
    }

    try {
        await db.messages.create({
            uid: userId,
            title: '充值到账通知',
            content: '您已成功充值 ¥' + amount.toFixed(2) + '，当前余额 ¥' + balanceAfter.toFixed(2) + '。订单号：' + params.out_trade_no,
            type: 1,
            send_type: 1
        });
    } catch (e) {
        console.error('[payment] 站内信发送失败:', e.message);
    }

    try {
        if (user.email && user.emailVerified && user.email.includes('@')) {
            if (await shouldSendEmail(userId, 'notify_recharge')) {
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
        }
    } catch (e) {
        console.error('[payment] 邮件发送失败:', e.message);
    }

    return { ok: true, orderNo: params.out_trade_no, amount: amount.toFixed(2), balanceAfter: balanceAfter.toFixed(2) };
}

module.exports = { queryApiTradeNo, createRechargeOrder, processPayCallback };
