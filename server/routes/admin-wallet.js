const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

function safeError(e) {
    if (process.env.DEBUG === 'true') return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}

// ========== 全平台交易流水 (admin) ==========
router.get('/admin/transactions', authMiddleware, adminMiddleware, async (req, res) => {
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

        var list = await db.transactionRecords.getAll(params);
        var total = await db.transactionRecords.countAll(params);

        // 关联用户名
        var users = await db.users.getAll();
        var userMap = {};
        for (var u of users) { userMap[u.id] = u.username; }

        list = list.map(function(r) {
            return {
                id: r.id,
                user_id: r.user_id,
                username: userMap[r.user_id] || '-',
                order_no: r.order_no,
                trade_no: r.api_trade_no || r.trade_no || null,
                pay_time: r.pay_time,
                pay_method: r.pay_method,
                trade_type: r.trade_type,
                amount: parseFloat(r.amount).toFixed(2),
                balance_before: parseFloat(r.balance_before).toFixed(2),
                balance_after: parseFloat(r.balance_after).toFixed(2),
                period: r.period,
                period_count: r.period_count,
                resource_type: r.resource_type,
                resource_id: r.resource_id,
                created_at: r.created_at
            };
        });

        res.json({ data: list, total: total, page: page, limit: limit });
    } catch (e) {
        console.error('[管理员流水]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 导出Excel (admin) ==========
router.get('/admin/transactions/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var trade_type = req.query.trade_type || '';
        var order_no = req.query.order_no || '';
        var start_time = req.query.start_time || '';
        var end_time = req.query.end_time || '';
        var pay_method = req.query.pay_method || '';

        var params = {};
        if (trade_type) params.trade_type = trade_type;
        if (order_no) params.order_no = order_no;
        if (start_time) params.start_time = start_time;
        if (end_time) params.end_time = end_time;
        if (pay_method) params.pay_method = pay_method;

        var list = await db.transactionRecords.getAll(params);
        var users = await db.users.getAll();
        var userMap = {};
        for (var u of users) { userMap[u.id] = u.username; }

        // 构建CSV
        var rows = [['支付时间', '用户名', '支付方式', '商户订单号', '接口订单号', '交易类型', '交易金额', '操作前余额', '操作后余额'].join(',')];
        for (var r of list) {
            rows.push([
                r.pay_time || '',
                '"' + (userMap[r.user_id] || '-').replace(/"/g, '""') + '"',
                r.pay_method === 'alipay' ? '支付宝' : r.pay_method === 'wxpay' ? '微信支付' : r.pay_method,
                r.order_no,
                r.api_trade_no || r.trade_no || '',
                r.trade_type === 'recharge' ? '余额充值' : r.trade_type === 'admin_recharge' ? '后台充值' : r.trade_type === 'new_order' ? '新购服务器' : '服务器续费',
                parseFloat(r.amount).toFixed(2),
                parseFloat(r.balance_before).toFixed(2),
                parseFloat(r.balance_after).toFixed(2)
            ].join(','));
        }

        // 添加BOM使Excel正确识别UTF-8
        var csv = '\uFEFF' + rows.join('\n');
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename=transaction_history.csv');
        res.send(csv);
    } catch (e) {
        console.error('[导出流水]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 管理员订单查询（含筛选） ==========
router.get('/admin/orders', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var params = {};
        params.page = parseInt(req.query.page) || 1;
        params.limit = parseInt(req.query.limit) || 20;
        if (req.query.order_no) params.order_no = req.query.order_no;
        if (req.query.type) params.type = req.query.type;
        if (req.query.status) params.status = req.query.status;
        if (req.query.start_time) params.start_time = req.query.start_time;
        if (req.query.end_time) params.end_time = req.query.end_time;
        var result = await db.orders.getAll(params);
        res.json({ rows: result.rows, total: result.total, page: result.page, limit: result.limit });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== 管理员订单导出 CSV ==========
router.get('/admin/orders/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var params = {};
        if (req.query.order_no) params.order_no = req.query.order_no;
        if (req.query.type) params.type = req.query.type;
        if (req.query.status) params.status = req.query.status;
        if (req.query.start_time) params.start_time = req.query.start_time;
        if (req.query.end_time) params.end_time = req.query.end_time;
        // 导出全部，不分页
        params.limit = 999999;
        params.page = 1;
        var result = await db.orders.getAll(params);
        // 生成 CSV 行列：订单号,用户名,套餐名,类型,周期,数量,金额,状态,创建时间
        var csvRows = ['订单号,用户名,套餐名,类型,周期,数量,金额,状态,创建时间'];
        result.rows.forEach(function(o) {
            var typeName = o.type === 'vm' ? 'VM' : 'LXC';
            var periodName = o.period === 'month' ? '月付' : o.period === 'quarter' ? '季付' : '年付';
            var statusName = o.status === 'completed' ? '已开通' : o.status;
            csvRows.push([
                o.order_no, o.username || '', o.package_name || '', typeName,
                periodName, o.period_count, o.amount, statusName, o.created_at
            ].join(','));
        });
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
        // 添加 BOM 确保 Excel 正确识别 UTF-8
        res.send('\ufeff' + csvRows.join('\n'));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
