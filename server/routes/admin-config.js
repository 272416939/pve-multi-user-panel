const express = require('express');
const router = express.Router();
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { loadSentRemindersFromDb, checkExpiredVms, checkExpiredLxc } = require('../services/expiry-check');
const pkg = require('../../package.json');
const { safeError } = require('../utils/safe-error');
const { maskSecret, isMasked, encrypt, decrypt } = require('../utils/crypto-utils');
const { queryIpLocation } = require('../services/ip-location');
const { checkRateLimit, invalidateRateLimitCache } = require('../middleware/rate-limiter');
// 运维业务下沉 services/（规范第七节）：版本检查/系统更新/Redis 管理
const { checkForUpdates } = require('../services/release-check');
const { executeUpdate } = require('../services/system-update');
const redisAdmin = require('../services/redis-admin');

router.get('/admin/storage', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getStorageList();
        res.json(storages.map(s => ({ id: s.storage, type: s.type, path: s.path, content: s.content })));
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/check-expired', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await checkExpiredVms();
        await checkExpiredLxc();
        res.json({ message: '检查完成' });
    } catch (error) {
        console.error('手动检查失败:', error);
        res.status(500).json({ error: '检查失败' });
    }
});

router.get('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = await db.config.getSmtp();
        const { password, ...configWithoutPassword } = config;
        res.json(configWithoutPassword);
    } catch (error) {
        console.error('获取 SMTP 配置失败:', error);
        res.status(500).json({ error: '获取配置失败' });
    }
});

router.put('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { host, port, secure, user, password, from, from_name, enabled } = req.body;

        const existingSmtp = await db.config.getSmtp();
        await db.config.setSmtp({
            host: host || '',
            port: port || 587,
            secure: !!secure,
            user: user || '',
            // V4-03 适配：未传密码时不回传解密明文（undefined → setSmtp 保留库内旧密文），避免每次保存重新加密
            password: password !== undefined ? password : undefined,
            from: from || '',
            from_name: from_name || '',
            enabled: !!enabled
        });

        const { password: _, ...configWithoutPassword } = await db.config.getSmtp();
        // 操作审计：更新 SMTP 配置（不记录密码/凭据原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.smtp', resourceType: 'config', resourceId: 'smtp', details: '更新SMTP配置(服务器:' + (host || '') + ',启用:' + (enabled ? '是' : '否') + ')', req });
        } catch (e) {}
        res.json({ message: '配置更新成功', config: configWithoutPassword });
    } catch (error) {
        console.error('更新 SMTP 配置失败:', error);
        res.status(500).json({ error: '更新配置失败' });
    }
});

router.post('/admin/smtp/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { testEmail } = req.body;
        if (!testEmail) {
            return res.status(400).json({ error: '请提供测试邮箱' });
        }
        
        const emailContent = `
            <p>您好，</p>
            <p>恭喜！您的 SMTP 配置测试成功！</p>
            <div class="divider"></div>
            <p>现在您可以正常使用邮件功能了，包括：</p>
            <ul style="margin-left: 20px; color: #4a5568;">
                <li>邮箱验证</li>
                <li>密码重置</li>
                <li>虚拟机到期提醒</li>
                <li>续费提醒</li>
            </ul>
        `;
        await sendEmail(testEmail, 'SMTP 配置测试', createEmailTemplate('测试邮件', emailContent));
        res.json({ message: '测试邮件发送成功' });
    } catch (error) {
        console.error('测试 SMTP 配置失败:', error);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = await db.config.getReminder();
        res.json(config);
    } catch (error) {
        console.error('获取提醒配置失败:', error);
        res.status(500).json({ error: '获取配置失败' });
    }
});

router.put('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { days1, days2, days3 } = req.body;
        
        db.config.setReminder({
            days1: days1 !== undefined ? parseInt(days1) : 7,
            days2: days2 !== undefined ? parseInt(days2) : 3,
            days3: days3 !== undefined ? parseInt(days3) : 1
        });
        
        // 操作审计：更新到期提醒配置
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.reminder', resourceType: 'config', resourceId: 'reminder', details: '更新提醒配置:' + (days1 !== undefined ? parseInt(days1) : 7) + '/' + (days2 !== undefined ? parseInt(days2) : 3) + '/' + (days3 !== undefined ? parseInt(days3) : 1) + '天', req });
        } catch (e) {}
        
        res.json({ message: '提醒配置更新成功', config: db.config.getReminder() });
    } catch (error) {
        console.error('更新提醒配置失败:', error);
        res.status(500).json({ error: '更新配置失败' });
    }
});

// P2-H1⑥ 修复：版本号接口需认证（防止未登录泄露版本信息）
router.get('/version', authMiddleware, (req, res) => {
    res.json({ version: pkg.version });
});

// 检查系统更新（业务在 services/release-check.js）
router.get('/admin/system/update/check', authMiddleware, adminMiddleware, async (req, res) => {
    const payload = await checkForUpdates(req.query.source || 'gitee');
    res.json(payload);
});

// 执行系统更新（业务在 services/system-update.js）
router.post('/admin/system/update/execute', authMiddleware, adminMiddleware, async (req, res) => {
    const result = await executeUpdate((req.body && req.body.source) || 'gitee');
    if (!result.ok) {
        return res.status(result.status).json({ error: result.error });
    }
    // 操作审计：执行系统更新
    try {
        const { auditLog } = require('../utils/audit-log');
        await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.system.update', resourceType: 'system', resourceId: 'update', details: '执行系统更新(来源:' + ((req.body && req.body.source) || 'gitee') + (result.data && result.data.version ? ',目标版本:' + result.data.version : '') + ')', req });
    } catch (e) {}
    res.json(result.data);
});

// ========== 支付配置 ==========

router.get('/admin/pay/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var getConfig = db.config.get;
        var baseUrl = await getConfig('pay:base_url') || 'https://pay.microgg.cn/';
        var pid = await getConfig('pay:pid') || '';
        // V4-01 修复：支付密钥 AES 加密存储，回显前解密（decrypt 对存量明文自动透传）
        var md5Key = decrypt(await getConfig('pay:md5_key') || '');
        var v2PublicKey = decrypt(await getConfig('pay:v2_public_key') || '');
        var v2PrivateKey = decrypt(await getConfig('pay:v2_private_key') || '');
        var v1Enabled = await getConfig('pay:v1_enabled') || '1';
        var v2Enabled = await getConfig('pay:v2_enabled') || '0';
        var alipayEnabled = await getConfig('pay:alipay_enabled') || '1';
        var wxpayEnabled = await getConfig('pay:wxpay_enabled') || '1';
        var minAmount = await getConfig('pay:min_amount') || '0.01';
        var maxAmount = await getConfig('pay:max_amount') || '999999.99';

        res.json({
            base_url: baseUrl,
            pid: pid,
            md5_key: maskSecret(md5Key),
            v2_public_key: maskSecret(v2PublicKey),
            v2_private_key: maskSecret(v2PrivateKey),
            v1_enabled: v1Enabled === '1',
            v2_enabled: v2Enabled === '1',
            alipay_enabled: alipayEnabled === '1',
            wxpay_enabled: wxpayEnabled === '1',
            min_amount: parseFloat(minAmount) || 0.01,
            max_amount: parseFloat(maxAmount) || 999999.99
        });
    } catch (e) {
        console.error('[支付配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/admin/pay/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { base_url, pid, md5_key, v2_public_key, v2_private_key, v1_enabled, v2_enabled, alipay_enabled, wxpay_enabled, min_amount, max_amount } = req.body;

        if (base_url !== undefined) {
            await setConfig('pay:base_url', base_url.trim() || 'https://pay.microgg.cn/');
        }
        if (pid !== undefined) {
            await setConfig('pay:pid', String(pid).trim());
        }
        // V4-01 修复：支付密钥加密存储，掩码值跳过（保留旧密文）
        if (md5_key !== undefined && !isMasked(md5_key)) {
            await setConfig('pay:md5_key', encrypt(String(md5_key).trim()));
        }
        if (v2_public_key !== undefined && !isMasked(v2_public_key)) {
            await setConfig('pay:v2_public_key', encrypt(String(v2_public_key).trim()));
        }
        if (v2_private_key !== undefined && !isMasked(v2_private_key)) {
            await setConfig('pay:v2_private_key', encrypt(String(v2_private_key).trim()));
        }
        if (v1_enabled !== undefined) {
            await setConfig('pay:v1_enabled', v1_enabled ? '1' : '0');
        }
        if (v2_enabled !== undefined) {
            await setConfig('pay:v2_enabled', v2_enabled ? '1' : '0');
        }
        if (alipay_enabled !== undefined) {
            await setConfig('pay:alipay_enabled', alipay_enabled ? '1' : '0');
        }
        if (wxpay_enabled !== undefined) {
            await setConfig('pay:wxpay_enabled', wxpay_enabled ? '1' : '0');
        }
        var minHasVal = min_amount !== undefined && min_amount !== null && min_amount !== '';
        var maxHasVal = max_amount !== undefined && max_amount !== null && max_amount !== '';
        var minNum = minHasVal ? parseFloat(min_amount) : NaN;
        var maxNum = maxHasVal ? parseFloat(max_amount) : NaN;

        if (minHasVal) {
            if (isNaN(minNum)) return res.status(400).json({ error: '最低充值金额必须为有效数字' });
            if (minNum <= 0) return res.status(400).json({ error: '最低充值金额不能为负数或零' });
        }
        if (maxHasVal) {
            if (isNaN(maxNum)) return res.status(400).json({ error: '最大充值金额必须为有效数字' });
            if (maxNum <= 0) return res.status(400).json({ error: '最大充值金额不能为负数或零' });
        }
        if (minHasVal && maxHasVal && maxNum < minNum) {
            return res.status(400).json({ error: '最大充值金额不能小于最低充值金额' });
        }

        if (minHasVal) await setConfig('pay:min_amount', String(minNum));
        if (maxHasVal) await setConfig('pay:max_amount', String(maxNum));

        // 操作审计：更新支付配置（资金配置，不记录密钥/商户私钥原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var switchParts = [];
            if (v1_enabled !== undefined) switchParts.push('V1:' + (v1_enabled ? '开' : '关'));
            if (v2_enabled !== undefined) switchParts.push('V2:' + (v2_enabled ? '开' : '关'));
            if (alipay_enabled !== undefined) switchParts.push('支付宝:' + (alipay_enabled ? '开' : '关'));
            if (wxpay_enabled !== undefined) switchParts.push('微信:' + (wxpay_enabled ? '开' : '关'));
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.pay', resourceType: 'config', resourceId: 'pay', details: '更新支付配置(商户号:' + (pid !== undefined ? pid : '-') + (switchParts.length ? ',' + switchParts.join(',') : '') + (minHasVal ? ',最低¥' + minNum : '') + (maxHasVal ? ',最高¥' + maxNum : '') + ')', req });
        } catch (e) {}

        res.json({ message: '支付配置保存成功' });
    } catch (e) {
        console.error('[支付配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== UApiPro IP 归属地配置 ==========

router.get('/admin/uapipro/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var enabled = await db.config.get('uapipro:enabled') === '1';
        var apiKey = decrypt(await db.config.get('uapipro:api_key') || '');
        res.json({ enabled, api_key: maskSecret(apiKey) });
    } catch (e) {
        console.error('[UApiPro配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/admin/uapipro/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { enabled, api_key } = req.body;
        if (enabled !== undefined) {
            await db.config.set('uapipro:enabled', enabled ? '1' : '0');
        }
        if (api_key !== undefined && !isMasked(api_key)) {
            await db.config.set('uapipro:api_key', encrypt(String(api_key).trim()));
        }
        // 失效 ip-location 的启用开关缓存（60s TTL），让新配置立即生效
        require('../services/ip-location').invalidateEnabledCache();
        // 操作审计：更新 UApiPro 配置（不记录 API Key 原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.uapipro', resourceType: 'config', resourceId: 'uapipro', details: '更新UApiPro配置(启用:' + (enabled !== undefined ? (enabled ? '是' : '否') : '-') + (api_key !== undefined && !isMasked(api_key) ? ',已更新API Key' : '') + ')', req });
        } catch (e) {}
        res.json({ message: 'UApiPro 配置保存成功' });
    } catch (e) {
        console.error('[UApiPro配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// 测试查询：直接外呼 uapis.cn（不走缓存），验证 API Key / 连通性
router.post('/admin/uapipro/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('uapipro_test', 'ratelimit:uapipro-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试' });
        }
        var ip = String(req.body.ip || '').trim();
        if (!ip) return res.status(400).json({ error: '请输入要查询的 IP 地址' });
        var result = await queryIpLocation(ip);
        res.json(result);
    } catch (e) {
        console.error('[UApiPro测试]', e.message);
        // 透出第三方接口的错误描述（不含本地凭据），便于管理员排查
        var errMsg = e.response && e.response.data && e.response.data.message
            ? e.response.data.message : (e.message || '未知错误');
        res.status(400).json({ error: '查询失败: ' + errMsg });
    }
});

// ========== 限速配置（安全防护·限速设置） ==========

// GET /admin/rate-limit/config - 获取限速配置（含规则元数据与默认值，前端展示/恢复默认使用）
router.get('/admin/rate-limit/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var config = await db.config.getRateLimits();
        var { RATE_LIMIT_CATEGORIES } = require('../constants');
        var categories = RATE_LIMIT_CATEGORIES.map(function(cat) {
            return {
                key: cat.key,
                label: cat.label,
                rules: cat.rules.map(function(rule) {
                    var cur = config.rules[rule.key] || {};
                    return {
                        key: rule.key,
                        label: rule.label,
                        hint: rule.hint || '',
                        enabled: cur.enabled !== false,
                        max: cur.max || rule.max,
                        windowSec: cur.windowSec || rule.windowSec,
                        defaults: { enabled: true, max: rule.max, windowSec: rule.windowSec }
                    };
                })
            };
        });
        res.json({ master_enabled: config.master_enabled, categories: categories });
    } catch (e) {
        console.error('[限速配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// 时间窗秒 → 易读单位（与前端 secToWindowUI 一致：整小时→小时、整分钟→分钟、否则秒）
function formatRateLimitWindow(sec) {
    if (sec % 3600 === 0) return sec / 3600 + '小时';
    if (sec % 60 === 0) return sec / 60 + '分钟';
    return sec + '秒';
}

// 审计详情组装：恢复默认 → 简略文案；修改 → 逐条列出新旧参数变化（label 单一来源 RATE_LIMIT_RULES）
function buildRateLimitLogDetails(oldConfig, masterEnabled, rules, isRestoreDefault) {
    if (isRestoreDefault) return '更新限速配置：恢复默认参数';
    var parts = [];
    if (oldConfig) {
        if (oldConfig.master_enabled !== masterEnabled) {
            parts.push('总开关 ' + (oldConfig.master_enabled ? '开启' : '关闭') + '→' + (masterEnabled ? '开启' : '关闭'));
        }
        var { RATE_LIMIT_RULES } = require('../constants');
        Object.keys(RATE_LIMIT_RULES).forEach(function(k) {
            var old = oldConfig.rules[k];
            var cur = rules[k];
            if (!old || !cur) return;
            var ruleParts = [];
            if (old.enabled !== cur.enabled) {
                ruleParts.push((old.enabled ? '启用' : '停用') + '→' + (cur.enabled ? '启用' : '停用'));
            }
            if (old.max !== cur.max || old.windowSec !== cur.windowSec) {
                ruleParts.push(old.max + '次/' + formatRateLimitWindow(old.windowSec) + '→' + cur.max + '次/' + formatRateLimitWindow(cur.windowSec));
            }
            if (ruleParts.length) {
                parts.push(RATE_LIMIT_RULES[k].label + ' ' + ruleParts.join('，'));
            }
        });
    }
    if (!parts.length) return '更新限速配置（无参数变化）';
    return '更新限速配置：' + parts.join('；');
}

// PUT /admin/rate-limit/config - 保存限速配置（ruleKey 白名单 + 次数/时间窗范围校验）
router.put('/admin/rate-limit/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { RATE_LIMIT_RULES } = require('../constants');
        var body = req.body || {};
        var masterEnabled = body.master_enabled !== false;
        var rules = {};
        var cats = body.categories || [];
        for (var i = 0; i < cats.length; i++) {
            var catRules = (cats[i] && cats[i].rules) || [];
            for (var j = 0; j < catRules.length; j++) {
                var r = catRules[j];
                if (!r || !RATE_LIMIT_RULES[r.key]) {
                    return res.status(400).json({ error: '存在未知限速规则: ' + (r && r.key) });
                }
                var max = parseInt(r.max);
                var windowSec = parseInt(r.windowSec);
                if (!Number.isInteger(max) || max < 1 || max > 10000) {
                    return res.status(400).json({ error: '限速次数须为 1-10000 的整数（规则: ' + r.key + '）' });
                }
                if (!Number.isInteger(windowSec) || windowSec < 1 || windowSec > 86400) {
                    return res.status(400).json({ error: '时间窗须为 1-86400 秒的整数（规则: ' + r.key + '）' });
                }
                rules[r.key] = { enabled: r.enabled !== false, max: max, windowSec: windowSec };
            }
        }
        // 前端全量提交，未覆盖的规则回退注册表默认（防御漏传）
        Object.keys(RATE_LIMIT_RULES).forEach(function(k) {
            if (!rules[k]) {
                rules[k] = { enabled: true, max: RATE_LIMIT_RULES[k].max, windowSec: RATE_LIMIT_RULES[k].windowSec };
            }
        });
        // 保存前取旧配置，供审计详情对比参数变化（失败回退简略文案，不影响主流程）
        var oldConfig = null;
        try { oldConfig = await db.config.getRateLimits(); } catch (_) {}
        await db.config.setRateLimits({ master_enabled: masterEnabled, rules: rules });
        // 失效 60s 缓存，让新配置立即生效
        invalidateRateLimitCache();
        // 审计埋点（admin.security.rate-limit → 后台操作·安全设置，审计失败不影响主流程）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({
                userId: req.user.id,
                username: req.user.username,
                action: 'admin.security.rate-limit',
                resourceType: 'config',
                resourceId: 'rate-limit',
                details: buildRateLimitLogDetails(oldConfig, masterEnabled, rules, body.restore_default === true),
                req
            });
        } catch (e) {}
        res.json({ message: '限速配置保存成功' });
    } catch (e) {
        console.error('[限速配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.get('/admin/storages/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getAllStorages();
        res.json(storages);
    } catch (e) {
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 注册配置 ==========

router.get('/admin/register/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var getConfig = db.config.get;
        var enabled = await getConfig('register:enabled') || '0';
        res.json({
            enabled: enabled === '1'
        });
    } catch (e) {
        console.error('[注册配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

router.put('/admin/register/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { enabled } = req.body;
        if (enabled !== undefined) {
            await setConfig('register:enabled', enabled ? '1' : '0');
        }
        // 操作审计：更新注册配置
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.register', resourceType: 'config', resourceId: 'register', details: '更新注册配置(开放注册:' + (enabled !== undefined ? (enabled ? '是' : '否') : '-') + ')', req });
        } catch (e) {}
        res.json({ message: '注册配置保存成功' });
    } catch (e) {
        console.error('[注册配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

// ========== 站点配置 ==========

// GET /admin/site/config - 获取站点配置
router.get('/admin/site/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var getConfig = db.config.get;
        var name = await getConfig('site:name') || 'PVE 多用户控制面板';
        var logoText = await getConfig('site:logo_text') || 'PVE 面板';
        var loginTitle = await getConfig('site:login_title') || 'PVE Panel';
        var registerEnabled = await getConfig('register:enabled') || '0';
        res.json({
            name: name,
            logo_text: logoText,
            login_title: loginTitle,
            register_enabled: registerEnabled === '1'
        });
    } catch (e) {
        console.error('[admin] site config get:', e.message);
        res.status(500).json({ error: '获取站点配置失败' });
    }
});

// PUT /admin/site/config - 保存站点配置
router.put('/admin/site/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { name, logo_text, login_title, register_enabled } = req.body;
        if (name !== undefined) {
            if (typeof name !== 'string' || name.length > 50 || /[<>]/.test(name)) {
                return res.status(400).json({ error: '站点名称不能超过50字符且不能包含<>符号' });
            }
        }
        if (logo_text !== undefined) {
            if (typeof logo_text !== 'string' || logo_text.length > 30 || /[<>]/.test(logo_text)) {
                return res.status(400).json({ error: 'LOGO文字不能超过30字符且不能包含<>符号' });
            }
        }
        if (login_title !== undefined) {
            if (typeof login_title !== 'string' || login_title.length > 100 || /[<>]/.test(login_title)) {
                return res.status(400).json({ error: '登录页标题不能超过100字符且不能包含<>符号' });
            }
        }
        if (name !== undefined) await setConfig('site:name', name);
        if (logo_text !== undefined) await setConfig('site:logo_text', logo_text);
        if (login_title !== undefined) await setConfig('site:login_title', login_title);
        if (register_enabled !== undefined) await setConfig('register:enabled', register_enabled ? '1' : '0');
        // 清除站点配置缓存（Redis + 进程内存），确保下次请求重新加载
        var redis = require('../api/redis').getRedisClient();
        if (redis) { try { await redis.del('site_config'); } catch (e) {} }
        if (req.app.locals.siteConfigCache) {
            req.app.locals.siteConfigCache.data = null;
            req.app.locals.siteConfigCache.expires = 0;
        }
        // 操作审计：更新站点设置（仅摘要，不含敏感内容）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.site', resourceType: 'config', resourceId: 'site', details: '更新站点设置(站点名:' + (name !== undefined ? name : '-') + (register_enabled !== undefined ? ',开放注册:' + (register_enabled ? '是' : '否') : '') + ')', req });
        } catch (e) {}
        res.json({ message: '站点配置保存成功' });
    } catch (e) {
        console.error('[admin] site config set:', e.message);
        res.status(500).json({ error: '保存站点配置失败' });
    }
});

// POST /admin/cache/clear - 一键清除所有缓存（Redis + 内存）（业务在 services/redis-admin.js）
router.post('/admin/cache/clear', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await redisAdmin.clearAllCaches(req.app);
        // 操作审计：清空缓存
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cache.clear', resourceType: 'system', resourceId: 'cache', details: '清空全部缓存(Redis+内存)', req });
        } catch (e) {}
        res.json({ message: '所有缓存已清除' });
    } catch (e) {
        console.error('[admin] cache clear:', e.message);
        res.status(500).json({ error: '清除缓存失败' });
    }
});

// ==================== PVE 节点配置 ====================

router.get('/admin/pve/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var config = await db.config.getPve();
        res.json({
            host: config.host || '',
            api_token: maskSecret(config.api_token),
            ssh_host: config.ssh_host || '',
            ssh_port: config.ssh_port || 22,
            ssh_user: config.ssh_user || 'root',
            ssh_password: maskSecret(config.ssh_password),
            strict_tls: config.strict_tls || false
        });
    } catch (error) {
        console.error('获取 PVE 配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.put('/admin/pve/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { host, api_token, ssh_host, ssh_port, ssh_user, ssh_password, strict_tls } = req.body;
        // 脱敏值跳过，不覆盖原值
        var configToSave = {
            host: host || '',
            api_token: (api_token !== undefined && !isMasked(api_token)) ? api_token : undefined,
            ssh_host: ssh_host || '',
            ssh_port: parseInt(ssh_port) || 22,
            ssh_user: ssh_user || 'root',
            ssh_password: (ssh_password !== undefined && !isMasked(ssh_password)) ? ssh_password : undefined,
            strict_tls: !!strict_tls
        };
        await db.config.setPve(configToSave);
        // 刷新 PVE API 实例的配置缓存
        await pveApi.reloadConfig();
        // 操作审计：更新 PVE 节点配置（不记录 token/SSH 密码原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.pve', resourceType: 'config', resourceId: 'pve', details: '更新PVE节点配置(节点:' + (host || '') + ',SSH:' + (ssh_user || 'root') + '@' + (ssh_host || '') + ':' + (parseInt(ssh_port) || 22) + ')', req });
        } catch (e) {}
        res.json({ message: 'PVE 配置保存成功' });
    } catch (error) {
        console.error('更新 PVE 配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// ==================== Redis 缓存配置 ====================

router.get('/admin/redis/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var config = await db.config.getRedis();
        res.json({
            host: config.host || '',
            port: config.port || 6379,
            password: maskSecret(config.password),
            db: config.db || 0,
            prefix: config.prefix || 'pve:'
        });
    } catch (error) {
        console.error('获取 Redis 配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.put('/admin/redis/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { host, port, password, db: redisDb, prefix } = req.body;
        // 脱敏值跳过，不覆盖原值
        var configToSave = {
            host: host || '',
            port: parseInt(port) || 6379,
            password: (password !== undefined && !isMasked(password)) ? password : undefined,
            db: parseInt(redisDb) || 0,
            prefix: prefix || 'pve:'
        };
        await db.config.setRedis(configToSave);

        // 热更新 Redis 连接（业务在 services/redis-admin.js）
        await redisAdmin.applyRedisConfig(configToSave);

        // 操作审计：更新 Redis 配置（不记录密码原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.redis', resourceType: 'config', resourceId: 'redis', details: '更新Redis配置(' + (host || '') + ':' + (parseInt(port) || 6379) + '/db' + (parseInt(redisDb) || 0) + ')', req });
        } catch (e) {}

        res.json({ message: 'Redis 配置保存成功' });
    } catch (error) {
        console.error('更新 Redis 配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// ==================== 用户日志上限配置（用户操作按用户维度 / 后台操作按全站维度） ====================

router.get('/admin/log/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var keepCount = parseInt(await db.config.get('log:keep_count')) || 5000;
        var keepAdminCount = parseInt(await db.config.get('log:keep_admin_count')) || 5000;
        res.json({ keep_count: keepCount, keep_admin_count: keepAdminCount });
    } catch (error) {
        console.error('获取日志配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.put('/admin/log/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var keepCount = parseInt(req.body.keep_count);
        var keepAdminCount = req.body.keep_admin_count !== undefined ? parseInt(req.body.keep_admin_count) : null;
        // 上限校验：100-100000，防止误填 0 或超大值导致日志被清空/爆库
        if (!Number.isInteger(keepCount) || keepCount < 100 || keepCount > 100000) {
            return res.status(400).json({ error: '用户日志上限须为 100-100000 的整数' });
        }
        if (keepAdminCount !== null && (!Number.isInteger(keepAdminCount) || keepAdminCount < 100 || keepAdminCount > 100000)) {
            return res.status(400).json({ error: '后台操作日志上限须为 100-100000 的整数' });
        }
        await db.config.set('log:keep_count', String(keepCount));
        if (keepAdminCount !== null) {
            await db.config.set('log:keep_admin_count', String(keepAdminCount));
        }
        // 操作审计：更新日志保留上限
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.log', resourceType: 'config', resourceId: 'log', details: '更新日志上限(每用户:' + keepCount + ',后台操作全站:' + (keepAdminCount !== null ? keepAdminCount : '不变') + ')', req });
        } catch (e) {}
        res.json({ message: '日志配置保存成功' });
    } catch (error) {
        console.error('更新日志配置失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

// ==================== Redis 测试连接（业务在 services/redis-admin.js） ====================

router.post('/admin/redis/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var result = await redisAdmin.testRedisConnection({
            host: req.body.host,
            port: req.body.port,
            password: req.body.password,
            db: req.body.db
        });
        res.json(result);
    } catch (error) {
        console.error('测试 Redis 连接失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

module.exports = router;
