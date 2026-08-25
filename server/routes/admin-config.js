const express = require('express');
const router = express.Router();
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const ikuaiApi = require('../api/ikuai-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { resetTransporterCache } = require('../utils/email');
const { sendTemplateEmail } = require('../services/email-template');
const { loadSentRemindersFromDb, checkExpiredVms, checkExpiredLxc } = require('../services/expiry-check');
const pkg = require('../../package.json');
const { safeError } = require('../utils/safe-error');
const { isValidEmail } = require('../utils/email-validate');
const { maskSecret, isMasked, encrypt, decrypt } = require('../utils/crypto-utils');
const { queryIpLocation } = require('../services/ip-location');
const { checkConfiguredRateLimit, invalidateRateLimitCache } = require('../middleware/rate-limiter');
// 审计字段级 diff 通用工具（规范第十一节：更新类审计从 DB 新旧状态 diff 生成，不从请求体拼接）
const { buildFieldDiff } = require('../utils/audit-diff');
// 运维业务下沉 services/（规范第七节）：版本检查/系统更新/Redis 管理
const { checkForUpdates } = require('../services/release-check');
const { executeUpdate } = require('../services/system-update');
const redisAdmin = require('../services/redis-admin');
// CNAME 域名配置校验纯函数（utils/cname-validate.js，格式与前端 parseCnameEntries 对齐；随节点网络配置迁移至此）
const { validateCnameDomain, splitCnameEntry } = require('../utils/cname-validate');
// 测试连接类端点的错误 → 可操作中文原因（爱快/PVE/Redis 测试按钮共用）
const { friendlyTestError } = require('../utils/friendly-test-error');

router.get('/admin/storage', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getStorageList();
        res.json(storages.map(s => ({ id: s.storage, type: s.type, path: s.path, content: s.content })));
    } catch (error) {
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.post('/check-expired', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        await checkExpiredVms();
        await checkExpiredLxc();
        // 操作审计：手动触发到期检查（D 类缺埋点补全）
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.system.check-expired', resourceType: 'system', resourceId: 'check-expired', details: '手动触发到期检查(VM+LXC)', req });
        } catch (e) {}
        res.json({ message: '检查完成' });
    } catch (error) {
        console.error('手动检查失败:', error);
        res.status(500).json({ error: '检查失败', code: 'CHECK_FAILED' });
    }
});

router.get('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = await db.config.getSmtp();
        const { password, ...configWithoutPassword } = config;
        res.json(configWithoutPassword);
    } catch (error) {
        console.error('获取 SMTP 配置失败:', error);
        res.status(500).json({ error: '获取配置失败', code: 'CONFIG_LOAD_FAILED' });
    }
});

router.put('/admin/smtp', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { host, port, secure, user, password, from, from_name, enabled } = req.body;

        // 保存前取旧配置（审计 diff 用；密码只记「已更新」标记，不记录原文）
        const oldSmtp = await db.config.getSmtp();
        const smtpPasswordChanged = password !== undefined && !isMasked(password);
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

        // SMTP 配置已变更：失效 transporter 与配置缓存（下次发送自动按新配置重建）
        resetTransporterCache();

        const { password: _, ...configWithoutPassword } = await db.config.getSmtp();
        // 操作审计：更新 SMTP 配置（DB 新旧值字段级 diff；不记录密码原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            const changes = buildFieldDiff(oldSmtp, await db.config.getSmtp(), [
                { key: 'host', label: '服务器' },
                { key: 'port', label: '端口', num: true },
                { key: 'secure', label: 'SSL', bool: true },
                { key: 'user', label: '账号' },
                { key: 'from', label: '发件人' },
                { key: 'from_name', label: '发件名称' },
                { key: 'enabled', label: '启用', bool: true }
            ]);
            if (smtpPasswordChanged) changes.push('密码 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.smtp', resourceType: 'config', resourceId: 'smtp', details: '更新SMTP配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: '配置更新成功', config: configWithoutPassword });
    } catch (error) {
        console.error('更新 SMTP 配置失败:', error);
        res.status(500).json({ error: '更新配置失败', code: 'CONFIG_SAVE_FAILED' });
    }
});

router.post('/admin/smtp/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // V6-M4 修复：真外呼 SMTP 发信端点必须专项限速（防会话被窃后当 SPAM 放大器；先例 pve_test）
        const smtpTestLimit = await checkConfiguredRateLimit('smtp_test', 'ratelimit:smtp-test:' + req.user.id);
        if (!smtpTestLimit.allowed) {
            return res.status(429).json({ error: '测试邮件发送过于频繁，请稍后再试', code: 'RATE_LIMITED_SMTP_TEST', retryAfter: smtpTestLimit.retryAfter });
        }
        const { testEmail } = req.body;
        if (!testEmail) {
            return res.status(400).json({ error: '请提供测试邮箱', code: 'TEST_EMAIL_REQUIRED' });
        }
        // 测试邮箱格式校验（单一来源 email-validate.js：防 SMTP RCPT 拒收浪费外呼配额）
        if (!isValidEmail(testEmail)) {
            return res.status(400).json({ error: '邮箱格式不正确', code: 'EMAIL_INVALID' });
        }
        
        // 测试前失效缓存：确保用最新保存的 SMTP 配置发送（而不是旧 transporter）
        resetTransporterCache();
        // SMTP 测试邮件（模板: smtp_test，同步发送保证反馈）
        await sendTemplateEmail(testEmail, 'smtp_test', {}, { sync: true });
        res.json({ message: '测试邮件发送成功' });
    } catch (error) {
        console.error('测试 SMTP 配置失败:', error);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.get('/admin/email-queue/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { getEmailQueueStats } = require('../queue/email-queue');
        const stats = await getEmailQueueStats();
        res.json(stats);
    } catch (error) {
        console.error('获取邮件队列状态失败:', error);
        res.status(500).json({ error: '获取队列状态失败', code: 'QUEUE_STATS_FAILED' });
    }
});

router.get('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const config = await db.config.getReminder();
        res.json(config);
    } catch (error) {
        console.error('获取提醒配置失败:', error);
        res.status(500).json({ error: '获取配置失败', code: 'CONFIG_LOAD_FAILED' });
    }
});

router.put('/admin/reminder', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { days1, days2, days3 } = req.body;

        // 保存前取旧配置（审计 diff 用）
        const oldReminder = await db.config.getReminder();
        await db.config.setReminder({
            days1: days1 !== undefined ? parseInt(days1) : 7,
            days2: days2 !== undefined ? parseInt(days2) : 3,
            days3: days3 !== undefined ? parseInt(days3) : 1
        });
        const newReminder = await db.config.getReminder();

        // 操作审计：更新到期提醒配置（字段级 diff，只记实际变化）
        try {
            const { auditLog } = require('../utils/audit-log');
            const changes = buildFieldDiff(oldReminder, newReminder, [
                { key: 'days1', label: '提前7天', num: true },
                { key: 'days2', label: '提前3天', num: true },
                { key: 'days3', label: '提前1天', num: true }
            ]);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.reminder', resourceType: 'config', resourceId: 'reminder', details: '更新提醒配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}

        res.json({ message: '提醒配置更新成功', config: newReminder });
    } catch (error) {
        console.error('更新提醒配置失败:', error);
        res.status(500).json({ error: '更新配置失败', code: 'CONFIG_SAVE_FAILED' });
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
        return res.status(result.status).json({ error: result.error , code: result.code });
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
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/pay/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { base_url, pid, md5_key, v2_public_key, v2_private_key, v1_enabled, v2_enabled, alipay_enabled, wxpay_enabled, min_amount, max_amount } = req.body;

        // 保存前取旧配置（审计 diff 用；密钥类只记「已更新」标记，不记录原文）
        var getPaySnapshot = async function () {
            return {
                base_url: (await db.config.get('pay:base_url')) || 'https://pay.microgg.cn/',
                pid: (await db.config.get('pay:pid')) || '',
                v1_enabled: (await db.config.get('pay:v1_enabled')) === '1',
                v2_enabled: (await db.config.get('pay:v2_enabled')) === '1',
                alipay_enabled: (await db.config.get('pay:alipay_enabled')) === '1',
                wxpay_enabled: (await db.config.get('pay:wxpay_enabled')) === '1',
                min_amount: parseFloat((await db.config.get('pay:min_amount')) || '0.01'),
                max_amount: parseFloat((await db.config.get('pay:max_amount')) || '999999.99')
            };
        };
        var oldPay = await getPaySnapshot();
        var keyUpdatedParts = [];
        if (md5_key !== undefined && !isMasked(md5_key)) keyUpdatedParts.push('MD5密钥 已更新');
        if (v2_public_key !== undefined && !isMasked(v2_public_key)) keyUpdatedParts.push('V2公钥 已更新');
        if (v2_private_key !== undefined && !isMasked(v2_private_key)) keyUpdatedParts.push('V2私钥 已更新');

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
            if (isNaN(minNum)) return res.status(400).json({ error: '最低充值金额必须为有效数字', code: 'MIN_RECHARGE_NUMERIC' });
            if (minNum <= 0) return res.status(400).json({ error: '最低充值金额不能为负数或零', code: 'MIN_RECHARGE_POSITIVE' });
        }
        if (maxHasVal) {
            if (isNaN(maxNum)) return res.status(400).json({ error: '最大充值金额必须为有效数字', code: 'MAX_RECHARGE_NUMERIC' });
            if (maxNum <= 0) return res.status(400).json({ error: '最大充值金额不能为负数或零', code: 'MAX_RECHARGE_POSITIVE' });
        }
        if (minHasVal && maxHasVal && maxNum < minNum) {
            return res.status(400).json({ error: '最大充值金额不能小于最低充值金额', code: 'MAX_RECHARGE_GE_MIN' });
        }

        if (minHasVal) await setConfig('pay:min_amount', String(minNum));
        if (maxHasVal) await setConfig('pay:max_amount', String(maxNum));

        // 操作审计：更新支付配置（DB 新旧值字段级 diff；资金配置不记录密钥原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff(oldPay, await getPaySnapshot(), [
                { key: 'base_url', label: '网关地址' },
                { key: 'pid', label: '商户号' },
                { key: 'v1_enabled', label: 'V1支付', bool: true },
                { key: 'v2_enabled', label: 'V2支付', bool: true },
                { key: 'alipay_enabled', label: '支付宝', bool: true },
                { key: 'wxpay_enabled', label: '微信', bool: true },
                { key: 'min_amount', label: '最低充值', num: true, fmt: function (v) { return '¥' + v; } },
                { key: 'max_amount', label: '最高充值', num: true, fmt: function (v) { return '¥' + v; } }
            ]);
            if (keyUpdatedParts.length) changes = changes.concat(keyUpdatedParts);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.pay', resourceType: 'config', resourceId: 'pay', details: '更新支付配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}

        res.json({ message: '支付配置保存成功' });
    } catch (e) {
        console.error('[支付配置]', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/uapipro/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { enabled, api_key } = req.body;
        // 保存前取旧配置（审计 diff 用；API Key 只记「已更新」标记，不记录原文）
        var oldUapiEnabled = (await db.config.get('uapipro:enabled')) === '1';
        var apiKeyChanged = api_key !== undefined && !isMasked(api_key);
        if (enabled !== undefined) {
            await db.config.set('uapipro:enabled', enabled ? '1' : '0');
        }
        if (apiKeyChanged) {
            await db.config.set('uapipro:api_key', encrypt(String(api_key).trim()));
        }
        // 失效 ip-location 的启用开关缓存（60s TTL），让新配置立即生效
        require('../services/ip-location').invalidateEnabledCache();
        // 操作审计：更新 UApiPro 配置（字段级 diff，不记录 API Key 原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff({ enabled: oldUapiEnabled }, { enabled: (await db.config.get('uapipro:enabled')) === '1' }, [
                { key: 'enabled', label: '启用', bool: true }
            ]);
            if (apiKeyChanged) changes.push('API Key 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.uapipro', resourceType: 'config', resourceId: 'uapipro', details: '更新UApiPro配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: 'UApiPro 配置保存成功' });
    } catch (e) {
        console.error('[UApiPro配置]', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 测试查询：直接外呼 uapis.cn（不走缓存），验证 API Key / 连通性
router.post('/admin/uapipro/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var rateLimitResult = await checkConfiguredRateLimit('uapipro_test', 'ratelimit:uapipro-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        var ip = String(req.body.ip || '').trim();
        if (!ip) return res.status(400).json({ error: '请输入要查询的 IP 地址', code: 'QUERY_IP_REQUIRED' });
        var result = await queryIpLocation(ip);
        res.json(result);
    } catch (e) {
        console.error('[UApiPro测试]', e.message);
        // L-8 修复：不向客户端透传第三方接口错误原文，统一走 safeError（详情见服务端日志）
        res.status(400).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
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
                    return res.status(400).json({ error: '存在未知限速规则: ' + (r && r.key), code: 'RL_UNKNOWN_RULE', params: [r && r.key] });
                }
                var max = parseInt(r.max);
                var windowSec = parseInt(r.windowSec);
                if (!Number.isInteger(max) || max < 1 || max > 10000) {
                    return res.status(400).json({ error: '限速次数须为 1-10000 的整数（规则: ' + r.key + '）', code: 'RL_MAX_INVALID', params: [r.key] });
                }
                if (!Number.isInteger(windowSec) || windowSec < 1 || windowSec > 86400) {
                    return res.status(400).json({ error: '时间窗须为 1-86400 秒的整数（规则: ' + r.key + '）', code: 'RL_WINDOW_INVALID', params: [r.key] });
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
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.get('/admin/storages/all', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 多节点：存储池挂在具体节点上，按 ?node_id= 取该节点存储（弃用旧全局 pve-api 单例）
        const { findEnabledNode } = require('../utils/locate-asset');
        const { getPveClient } = require('../api/pve-clients');
        const node = await findEnabledNode(req.query.node_id);
        if (!node) return res.status(400).json({ error: '请先选择有效的节点', code: 'NODE_SELECT_REQUIRED' });
        const storages = await (await getPveClient(node.id)).getAllStorages();
        res.json(storages);
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/register/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { enabled } = req.body;
        // 保存前取旧配置（审计 diff 用）
        var oldRegisterEnabled = (await db.config.get('register:enabled')) === '1';
        if (enabled !== undefined) {
            await setConfig('register:enabled', enabled ? '1' : '0');
        }
        // 操作审计：更新注册配置（字段级 diff）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff({ enabled: oldRegisterEnabled }, { enabled: (await db.config.get('register:enabled')) === '1' }, [
                { key: 'enabled', label: '开放注册', bool: true }
            ]);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.register', resourceType: 'config', resourceId: 'register', details: '更新注册配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: '注册配置保存成功' });
    } catch (e) {
        console.error('[注册配置]', e.message);
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
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
        var template = await getConfig('site:template') || 'default';
        var lang = await getConfig('site:lang') || 'zh-CN';
        res.json({
            name: name,
            logo_text: logoText,
            login_title: loginTitle,
            register_enabled: registerEnabled === '1',
            template: template,
            lang: lang
        });
    } catch (e) {
        console.error('[admin] site config get:', e.message);
        res.status(500).json({ error: '获取站点配置失败', code: 'SITE_CONFIG_LOAD_FAILED' });
    }
});

// PUT /admin/site/config - 保存站点配置
router.put('/admin/site/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var setConfig = db.config.set;
        var { name, logo_text, login_title, register_enabled, template, lang } = req.body;
        // 保存前取旧配置（审计 diff 用）
        var getSiteSnapshot = async function () {
            return {
                name: (await db.config.get('site:name')) || 'PVE 多用户控制面板',
                logo_text: (await db.config.get('site:logo_text')) || 'PVE 面板',
                login_title: (await db.config.get('site:login_title')) || 'PVE Panel',
                register_enabled: (await db.config.get('register:enabled')) === '1',
                template: (await db.config.get('site:template')) || 'default',
                lang: (await db.config.get('site:lang')) || 'zh-CN'
            };
        };
        var oldSite = await getSiteSnapshot();
        if (name !== undefined) {
            if (typeof name !== 'string' || name.length > 50 || /[<>]/.test(name)) {
                return res.status(400).json({ error: '站点名称不能超过50字符且不能包含<>符号', code: 'SITE_NAME_INVALID' });
            }
        }
        if (logo_text !== undefined) {
            if (typeof logo_text !== 'string' || logo_text.length > 30 || /[<>]/.test(logo_text)) {
                return res.status(400).json({ error: 'LOGO文字不能超过30字符且不能包含<>符号', code: 'LOGO_TEXT_INVALID' });
            }
        }
        if (login_title !== undefined) {
            if (typeof login_title !== 'string' || login_title.length > 100 || /[<>]/.test(login_title)) {
                return res.status(400).json({ error: '登录页标题不能超过100字符且不能包含<>符号', code: 'LOGIN_TITLE_INVALID' });
            }
        }
        if (template !== undefined) {
            // UI_TEMPLATES 白名单校验，禁止非法值入库
            var { UI_TEMPLATES } = require('../constants');
            if (typeof template !== 'string' || !UI_TEMPLATES.includes(template)) {
                return res.status(400).json({ error: '界面模板参数不合法', code: 'UI_TPL_PARAM_INVALID' });
            }
        }
        if (lang !== undefined) {
            // 动态白名单校验（系统语言 + 自定义语言），禁止非法值入库
            const { isSupportedLocale } = require('../services/i18n');
            if (typeof lang !== 'string' || !(await isSupportedLocale(lang))) {
                return res.status(400).json({ error: '语言参数不合法', code: 'LANG_PARAM_INVALID' });
            }
        }
        if (name !== undefined) await setConfig('site:name', name);
        if (logo_text !== undefined) await setConfig('site:logo_text', logo_text);
        if (login_title !== undefined) await setConfig('site:login_title', login_title);
        if (register_enabled !== undefined) await setConfig('register:enabled', register_enabled ? '1' : '0');
        if (template !== undefined) await setConfig('site:template', template);
        if (lang !== undefined) await setConfig('site:lang', lang);
        // 清除站点配置缓存（Redis + 进程内存），确保下次请求重新加载
        var redis = require('../api/redis').getRedisClient();
        if (redis) {
            try { await redis.del('site_config'); } catch (e) {}
            // 登录页整页渲染缓存同样由站点配置渲染，TTL 已延长到 1h，必须同步失效
            try { await redis.del('page:login'); } catch (e) {}
        }
        if (req.app.locals.siteConfigCache) {
            req.app.locals.siteConfigCache.data = null;
            req.app.locals.siteConfigCache.expires = 0;
        }
        // 操作审计：更新站点设置（DB 新旧值字段级 diff）
        try {
            const { auditLog } = require('../utils/audit-log');
            const { getLocaleName } = require('../services/i18n');
            var newSite = await getSiteSnapshot();
            // 语言显示名动态解析（系统+自定义）；fmt 由 audit-diff 同步调用，先解析成映射
            var langNames = {};
            if (oldSite && oldSite.lang) langNames[oldSite.lang] = (await getLocaleName(oldSite.lang)) || oldSite.lang;
            if (newSite && newSite.lang) langNames[newSite.lang] = (await getLocaleName(newSite.lang)) || newSite.lang;
            var changes = buildFieldDiff(oldSite, newSite, [
                { key: 'name', label: '站点名称' },
                { key: 'logo_text', label: 'LOGO文字' },
                { key: 'login_title', label: '登录页标题' },
                { key: 'register_enabled', label: '开放注册', bool: true },
                { key: 'template', label: '界面模板', fmt: function (v) { return v === 'saas' ? 'SAAS企业风' : (v === 'default' ? '赛博霓虹' : v); } },
                { key: 'lang', label: '系统默认语言', fmt: function (v) { return langNames[v] || v; } }
            ]);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.site', resourceType: 'config', resourceId: 'site', details: '更新站点设置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: '站点配置保存成功' });
    } catch (e) {
        console.error('[admin] site config set:', e.message);
        res.status(500).json({ error: '保存站点配置失败', code: 'SITE_CONFIG_SAVE_FAILED' });
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
        res.status(500).json({ error: '清除缓存失败', code: 'CACHE_CLEAR_FAILED' });
    }
});

// ==================== 爱快节点配置（面板在线管理，支持热加载） ====================

router.get('/admin/ikuai/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var config = await db.config.getIkuai();
        // 节点网络设置（端口转发/DHCP/VLAN/CNAME，ikuai: 作用域；未配置回退旧全局键兼容存量）
        var ifaceList = [];
        try { ifaceList = JSON.parse(await db.config.getIkuaiSetting('forward:iface_list') || '[]'); } catch (_) {}
        // wan_interface 返回逗号分隔字符串（前端文本框使用），兼容旧格式（单值字符串）和新格式（JSON 数组）
        var wanInterface = '';
        var rawWan = await db.config.getIkuaiSetting('forward:wan_interface');
        if (rawWan) {
            try {
                var parsed = JSON.parse(rawWan);
                if (Array.isArray(parsed)) wanInterface = parsed.filter(Boolean).join(',');
                else if (typeof parsed === 'string') wanInterface = parsed;
            } catch (_) { wanInterface = rawWan; }
        }
        res.json({
            host: config.host || '',
            username: config.username || '',
            password: maskSecret(config.password),
            api_key: maskSecret(config.api_key),
            version: config.version || 'v3',
            strict_tls: config.strict_tls || false,
            // ---- 节点网络设置（随爱快节点独立配置）----
            port_range_start: parseInt(await db.config.getIkuaiSetting('forward:port_range_start')) || 50000,
            port_range_end: parseInt(await db.config.getIkuaiSetting('forward:port_range_end')) || 60000,
            default_protocol: await db.config.getIkuaiSetting('forward:default_protocol') || 'tcp',
            wan_interface: wanInterface,
            max_per_user: parseInt(await db.config.getIkuaiSetting('forward:max_per_user')) || 10,
            iface_list: ifaceList,
            dhcp_ip_range_start: await db.config.getIkuaiSetting('dhcp:ip_range_start') || '10.0.0.110',
            dhcp_ip_range_end: await db.config.getIkuaiSetting('dhcp:ip_range_end') || '10.0.0.199',
            dhcp_interface: await db.config.getIkuaiSetting('dhcp:interface') || 'lan2',
            dhcp_gateway: await db.config.getIkuaiSetting('dhcp:gateway') || '10.0.0.1',
            dhcp_dns1: await db.config.getIkuaiSetting('dhcp:dns1') || '180.76.76.76',
            dhcp_dns2: await db.config.getIkuaiSetting('dhcp:dns2') || '223.5.5.5',
            vlan_ip_segment_start: await db.config.getIkuaiSetting('vlan:ip_segment_start') || '172.16.0.1',
            vlan_id_start: parseInt(await db.config.getIkuaiSetting('vlan:id_start')) || 1000,
            vlan_interface: await db.config.getIkuaiSetting('vlan:interface') || 'lan1',
            vlan_max_per_user: parseInt(await db.config.getIkuaiSetting('vlan:max_per_user')) || 5,
            cname_domain: await db.config.getIkuaiSetting('cname:domain') || ''
        });
    } catch (error) {
        console.error('获取爱快配置失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/ikuai/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { host, username, password, api_key, version, strict_tls } = req.body;
        // 版本白名单（默认 v3，兼容存量生产环境；非法值显式 400）
        var finalVersion = version === undefined ? 'v3' : version;
        if (finalVersion !== 'v3' && finalVersion !== 'v4') {
            return res.status(400).json({ error: '接口版本无效，必须为 v3 或 v4', code: 'IKUAI_VERSION_INVALID' });
        }
        host = String(host || '').trim();
        // 协议白名单 + 长度校验（SSRF 防护：仅 http/https；留空表示停用爱快）
        if (host && !/^https?:\/\/\S+$/i.test(host)) {
            return res.status(400).json({ error: '爱快地址必须以 http:// 或 https:// 开头', code: 'IKUAI_URL_SCHEME' });
        }
        if (host.length > 200) return res.status(400).json({ error: '爱快地址过长', code: 'IKUAI_URL_TOO_LONG' });
        // V4：REST API 仅 HTTPS（http 入口对 /api/v4.0/* 直接 403），强制 https 前缀 + 端口合法性（内嵌地址，未填默认 443）
        if (finalVersion === 'v4' && host) {
            if (!/^https:\/\/\S+$/i.test(host)) {
                return res.status(400).json({ error: 'V4 接口仅支持 HTTPS，地址必须以 https:// 开头（可带端口，未填默认 443）', code: 'IKUAI_V4_HTTPS_REQUIRED' });
            }
            // 端口：显式声明的端口必须是 1-65535（未填默认 443；URL 解析对越界端口直接抛错，需先提取）
            var portMatch = host.match(/^https:\/\/[^/]+:(\d{1,5})\b/);
            if (portMatch) {
                var p = parseInt(portMatch[1], 10);
                if (p < 1 || p > 65535) {
                    return res.status(400).json({ error: '端口号必须在 1-65535 之间', code: 'IKUAI_PORT_INVALID' });
                }
            }
            try {
                new URL(host);
            } catch (_) {
                return res.status(400).json({ error: '爱快地址格式无效', code: 'IKUAI_URL_INVALID' });
            }
        }
        username = String(username || '').trim();
        if (username.length > 64) return res.status(400).json({ error: '用户名过长', code: 'USERNAME_TOO_LONG' });
        // 保存前取旧配置（审计 diff 用；敏感字段只记「已更新」标记，不记录原文）
        var oldIkuai = await db.config.getIkuai();
        // V6-I4 修复：空字符串视为未修改（保留旧值），与 PVE 配置对称；API Token 同模式
        var pwdChanged = password !== undefined && password !== '' && !isMasked(password);
        var apiKeyChanged = api_key !== undefined && api_key !== '' && !isMasked(api_key);
        // V4 且填写了地址时 API Token 必填（掩码/空值视为保留旧值，需已有旧 key）
        if (finalVersion === 'v4' && host && !apiKeyChanged && !oldIkuai.api_key) {
            return res.status(400).json({ error: 'V4 模式需要填写 API Token', code: 'IKUAI_V4_KEY_REQUIRED' });
        }
        // 脱敏值跳过，不覆盖原值
        var configToSave = {
            host: host,
            username: username,
            password: pwdChanged ? password : undefined,
            api_key: apiKeyChanged ? api_key : undefined,
            version: finalVersion,
            strict_tls: !!strict_tls
        };
        await db.config.setIkuai(configToSave);
        // 热加载：清空配置缓存并重置登录态，下次调用立即使用新配置（无需重启）
        await ikuaiApi.reloadConfig();
        // 操作审计：更新爱快节点配置（DB 新旧值字段级 diff，不记录密码/API Token 原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff(oldIkuai, await db.config.getIkuai(), [
                { key: 'host', label: '爱快地址' },
                { key: 'username', label: '用户名' },
                { key: 'version', label: '接口版本' },
                { key: 'strict_tls', label: '严格TLS', bool: true }
            ]);
            if (pwdChanged) changes.push('密码 已更新');
            if (apiKeyChanged) changes.push('API Token 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.ikuai', resourceType: 'config', resourceId: 'ikuai', details: '更新爱快节点配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: '爱快配置保存成功' });
    } catch (error) {
        console.error('更新爱快配置失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

// ============ 爱快节点网络配置（端口转发/DHCP/VLAN/CNAME，ikuai: 作用域，随节点独立配置） ============

// 节点网络配置字段审计标签：请求字段 → 中文标签 → 默认值（与 GET /admin/ikuai/config 返回一致）
const IKUAI_NETWORK_CHANGE_FIELDS = {
    port_range_start: { label: '端口段起始', fallback: '50000' },
    port_range_end: { label: '端口段结束', fallback: '60000' },
    default_protocol: { label: '默认协议', fallback: 'tcp' },
    max_per_user: { label: '每用户端口上限', fallback: '10' },
    dhcp_ip_range_start: { label: 'DHCP起始IP', fallback: '10.0.0.110' },
    dhcp_ip_range_end: { label: 'DHCP结束IP', fallback: '10.0.0.199' },
    dhcp_interface: { label: 'DHCP接口', fallback: 'lan2' },
    dhcp_gateway: { label: 'DHCP网关', fallback: '10.0.0.1' },
    dhcp_dns1: { label: 'DHCP DNS1', fallback: '180.76.76.76' },
    dhcp_dns2: { label: 'DHCP DNS2', fallback: '223.5.5.5' },
    vlan_ip_segment_start: { label: 'VLAN IP段', fallback: '172.16.0.1' },
    vlan_id_start: { label: 'VLAN起始ID', fallback: '1000' },
    vlan_interface: { label: 'VLAN接口', fallback: 'lan1' },
    vlan_max_per_user: { label: '每用户子网上限', fallback: '5' }
};

// 按实际变化的字段生成审计详情（返回 ['中文标签:新值', ...]，无变化返回空数组）
// 外网接口特殊处理：入库为 JSON 数组，排序后比较（顺序变化不算变更）
function buildIkuaiNetworkChanges(before, after) {
    var changes = [];
    Object.keys(IKUAI_NETWORK_CHANGE_FIELDS).forEach(function(k) {
        var raw = before[k];
        if (raw === null || raw === undefined || raw === '') raw = IKUAI_NETWORK_CHANGE_FIELDS[k].fallback;
        var oldV = String(raw).trim();
        var newV = String(after[k] == null ? IKUAI_NETWORK_CHANGE_FIELDS[k].fallback : after[k]).trim();
        if (oldV !== newV) changes.push(IKUAI_NETWORK_CHANGE_FIELDS[k].label + ':' + newV);
    });
    var oldWan = before.wan_interface || '';
    var oldWanArr = [];
    try { oldWanArr = JSON.parse(oldWan); if (!Array.isArray(oldWanArr)) oldWanArr = []; } catch (_) { oldWanArr = oldWan ? oldWan.split(',') : []; }
    var oldWanKey = oldWanArr.filter(Boolean).map(function(s) { return String(s).trim(); }).sort().join(',');
    var newWanKey = (after.wan_interface || []).filter(Boolean).map(function(s) { return String(s).trim(); }).sort().join(',');
    if (oldWanKey !== newWanKey) changes.push('外网接口:' + (newWanKey || '空'));
    return changes;
}

// CNAME 域名变更审计详情：条目级 diff（新增/删除/修改），无变化返回空串
function buildIkuaiCnameDetail(oldStr, newStr) {
    function parseCname(str) {
        return (str || '').split(',').map(function(s) { return s.trim(); }).filter(Boolean).map(function(entry) {
            return splitCnameEntry(entry);
        });
    }
    var oldItems = parseCname(oldStr);
    var newItems = parseCname(newStr);
    var oldKeys = {}, newKeys = {};
    oldItems.forEach(function(it) { oldKeys[it.label + '||' + it.domain] = true; });
    newItems.forEach(function(it) { newKeys[it.label + '||' + it.domain] = true; });
    var added = [], removed = [], modified = [];
    newItems.forEach(function(ni) {
        var key = ni.label + '||' + ni.domain;
        if (oldKeys[key]) return;
        var oldSameLabel = null;
        for (var i = 0; i < oldItems.length; i++) {
            if (oldItems[i].label === ni.label) { oldSameLabel = oldItems[i]; break; }
        }
        if (oldSameLabel) modified.push(ni.label + '||' + oldSameLabel.domain + '→' + ni.domain);
        else added.push(key);
    });
    oldItems.forEach(function(oi) {
        var key = oi.label + '||' + oi.domain;
        if (newKeys[key]) return;
        var newSameLabel = newItems.some(function(ni) { return ni.label === oi.label; });
        if (!newSameLabel) removed.push(key);
    });
    var parts = [];
    if (added.length) parts.push('新增:' + added.join(','));
    if (removed.length) parts.push('删除:' + removed.join(','));
    if (modified.length) parts.push('修改:' + modified.join(','));
    if (!parts.length) return '';
    return '更新CNAME域名(' + parts.join(',') + ')';
}

// 保存爱快节点网络配置（端口转发/DHCP/VLAN/CNAME；写入 ikuai: 作用域键，不影响连接配置与 client 会话）
router.put('/admin/ikuai/network-config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { port_range_start, port_range_end, default_protocol, wan_interface, max_per_user,
                dhcp_ip_range_start, dhcp_ip_range_end, dhcp_interface, dhcp_gateway, dhcp_dns1, dhcp_dns2,
                vlan_ip_segment_start, vlan_id_start, vlan_interface, vlan_max_per_user,
                cname_domain } = req.body;
        // 私有网络 VLAN 设置校验：IP 段必须为合法 IPv4，VLAN ID 起始值必须在 2~4090
        const ipv4Re = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (vlan_ip_segment_start !== undefined && !ipv4Re.test(String(vlan_ip_segment_start).trim())) {
            return res.status(400).json({ error: 'IP 段开始范围必须是合法 IPv4 地址', code: 'IP_START_IPV4' });
        }
        if (vlan_id_start !== undefined) {
            const vlanIdNum = parseInt(vlan_id_start);
            if (!Number.isInteger(vlanIdNum) || vlanIdNum < 2 || vlanIdNum > 4090) {
                return res.status(400).json({ error: 'VLANID 开始范围必须是 2~4090 的整数', code: 'VLAN_START_INT' });
            }
        }
        if (vlan_max_per_user !== undefined) {
            const vlanMaxNum = parseInt(vlan_max_per_user);
            if (!Number.isInteger(vlanMaxNum) || vlanMaxNum < 0 || vlanMaxNum > 1000) {
                return res.status(400).json({ error: '每用户子网数量上限必须是 0~1000 的整数', code: 'SUBNET_LIMIT_INT' });
            }
        }
        // L-1 修复：端口段/max_per_user/DHCP IP 段/接口/cname 域名校验（防负值/非法 IP/超长串入库）
        if (port_range_start !== undefined) {
            const startNum = parseInt(port_range_start);
            if (!Number.isInteger(startNum) || startNum < 1 || startNum > 65535) {
                return res.status(400).json({ error: '端口段起始值必须是 1~65535 的整数', code: 'PORT_START_INT' });
            }
        }
        if (port_range_end !== undefined) {
            const endNum = parseInt(port_range_end);
            if (!Number.isInteger(endNum) || endNum < 1 || endNum > 65535) {
                return res.status(400).json({ error: '端口段结束值必须是 1~65535 的整数', code: 'PORT_END_INT' });
            }
        }
        if (port_range_start !== undefined && port_range_end !== undefined) {
            if (parseInt(port_range_start) >= parseInt(port_range_end)) {
                return res.status(400).json({ error: '端口段起始值必须小于结束值', code: 'PORT_START_LT_END' });
            }
        }
        if (max_per_user !== undefined) {
            const maxNum = parseInt(max_per_user);
            if (!Number.isInteger(maxNum) || maxNum < 0 || maxNum > 1000) {
                return res.status(400).json({ error: '每用户端口转发上限必须是 0~1000 的整数', code: 'FORWARD_LIMIT_INT' });
            }
        }
        if (dhcp_ip_range_start !== undefined && !ipv4Re.test(String(dhcp_ip_range_start).trim())) {
            return res.status(400).json({ error: 'DHCP IP 段起始值必须是合法 IPv4 地址', code: 'DHCP_START_IPV4' });
        }
        if (dhcp_ip_range_end !== undefined && !ipv4Re.test(String(dhcp_ip_range_end).trim())) {
            return res.status(400).json({ error: 'DHCP IP 段结束值必须是合法 IPv4 地址', code: 'DHCP_END_IPV4' });
        }
        if (dhcp_gateway !== undefined && !ipv4Re.test(String(dhcp_gateway).trim())) {
            return res.status(400).json({ error: 'DHCP 网关必须是合法 IPv4 地址', code: 'DHCP_GW_IPV4' });
        }
        if (dhcp_dns1 !== undefined && !ipv4Re.test(String(dhcp_dns1).trim())) {
            return res.status(400).json({ error: 'DHCP DNS1 必须是合法 IPv4 地址', code: 'DHCP_DNS1_IPV4' });
        }
        if (dhcp_dns2 !== undefined && !ipv4Re.test(String(dhcp_dns2).trim())) {
            return res.status(400).json({ error: 'DHCP DNS2 必须是合法 IPv4 地址', code: 'DHCP_DNS2_IPV4' });
        }
        // 接口名与域名：白名单字符 + 长度限制
        const ifaceRe = /^[a-zA-Z0-9_.:-]{1,32}$/;
        if (dhcp_interface !== undefined && !ifaceRe.test(String(dhcp_interface).trim())) {
            return res.status(400).json({ error: 'DHCP 接口名格式无效（仅字母数字_.:-，≤32字符）', code: 'DHCP_IFNAME_INVALID' });
        }
        if (vlan_interface !== undefined && !ifaceRe.test(String(vlan_interface).trim())) {
            return res.status(400).json({ error: 'VLAN 接口名格式无效（仅字母数字_.:-，≤32字符）', code: 'VLAN_IFNAME_INVALID' });
        }
        // CNAME 校验：支持前端 label||.domain 逗号分隔多条目格式（含旧格式兼容），逐条校验域名与长度
        if (cname_domain !== undefined) {
            const cnameResult = validateCnameDomain(cname_domain);
            if (!cnameResult.ok) {
                return res.status(400).json({ error: cnameResult.error || 'CNAME 域名格式无效或过长' , code: cnameResult.code });
            }
        }
        // 操作审计前置：读取变更前的配置值（用于按实际变化字段生成审计）
        const before = {
            port_range_start: await db.config.getIkuaiSetting('forward:port_range_start'),
            port_range_end: await db.config.getIkuaiSetting('forward:port_range_end'),
            default_protocol: await db.config.getIkuaiSetting('forward:default_protocol'),
            wan_interface: await db.config.getIkuaiSetting('forward:wan_interface'),
            max_per_user: await db.config.getIkuaiSetting('forward:max_per_user'),
            dhcp_ip_range_start: await db.config.getIkuaiSetting('dhcp:ip_range_start'),
            dhcp_ip_range_end: await db.config.getIkuaiSetting('dhcp:ip_range_end'),
            dhcp_interface: await db.config.getIkuaiSetting('dhcp:interface'),
            dhcp_gateway: await db.config.getIkuaiSetting('dhcp:gateway'),
            dhcp_dns1: await db.config.getIkuaiSetting('dhcp:dns1'),
            dhcp_dns2: await db.config.getIkuaiSetting('dhcp:dns2'),
            vlan_ip_segment_start: await db.config.getIkuaiSetting('vlan:ip_segment_start'),
            vlan_id_start: await db.config.getIkuaiSetting('vlan:id_start'),
            vlan_interface: await db.config.getIkuaiSetting('vlan:interface'),
            vlan_max_per_user: await db.config.getIkuaiSetting('vlan:max_per_user'),
            cname_domain: await db.config.getIkuaiSetting('cname:domain')
        };
        // wan_interface 存储为 JSON 数组，兼容前端传入逗号分隔字符串、数组或单值
        let wanIfaceToStore = [];
        if (Array.isArray(wan_interface)) {
            wanIfaceToStore = wan_interface.filter(Boolean);
        } else if (typeof wan_interface === 'string') {
            wanIfaceToStore = wan_interface.split(',').map(s => s.trim()).filter(Boolean);
        }
        // 归一化后的新值（入库值与审计 diff 共用，避免两处口径不一致）
        const after = {
            port_range_start: String(port_range_start ?? 50000),
            port_range_end: String(port_range_end ?? 60000),
            default_protocol: default_protocol || 'tcp',
            wan_interface: wanIfaceToStore,
            max_per_user: String(max_per_user ?? 10),
            dhcp_ip_range_start: dhcp_ip_range_start || '10.0.0.110',
            dhcp_ip_range_end: dhcp_ip_range_end || '10.0.0.199',
            dhcp_interface: dhcp_interface || 'lan2',
            dhcp_gateway: dhcp_gateway || '10.0.0.1',
            dhcp_dns1: dhcp_dns1 || '180.76.76.76',
            dhcp_dns2: dhcp_dns2 || '223.5.5.5',
            vlan_ip_segment_start: String(vlan_ip_segment_start || '172.16.0.1').trim(),
            vlan_id_start: String(vlan_id_start ?? 1000),
            vlan_interface: (vlan_interface || 'lan1').trim(),
            vlan_max_per_user: String(vlan_max_per_user ?? 5),
            cname_domain: (cname_domain || '').trim()
        };
        const setConfig = db.config.setIkuaiSetting;
        await setConfig('forward:port_range_start', after.port_range_start);
        await setConfig('forward:port_range_end', after.port_range_end);
        await setConfig('forward:default_protocol', after.default_protocol);
        await setConfig('forward:wan_interface', JSON.stringify(after.wan_interface));
        await setConfig('forward:max_per_user', after.max_per_user);
        await setConfig('dhcp:ip_range_start', after.dhcp_ip_range_start);
        await setConfig('dhcp:ip_range_end', after.dhcp_ip_range_end);
        await setConfig('dhcp:interface', after.dhcp_interface);
        await setConfig('dhcp:gateway', after.dhcp_gateway);
        await setConfig('dhcp:dns1', after.dhcp_dns1);
        await setConfig('dhcp:dns2', after.dhcp_dns2);
        await setConfig('vlan:ip_segment_start', after.vlan_ip_segment_start);
        await setConfig('vlan:id_start', after.vlan_id_start);
        await setConfig('vlan:interface', after.vlan_interface);
        await setConfig('vlan:max_per_user', after.vlan_max_per_user);
        await setConfig('cname:domain', after.cname_domain);
        // 操作审计：按实际变化的字段记录（改了什么记什么；CNAME 单独成条）
        try {
            const { auditLog } = require('../utils/audit-log');
            const changes = buildIkuaiNetworkChanges(before, after);
            const cnameDetail = buildIkuaiCnameDetail(before.cname_domain, after.cname_domain);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.network', resourceType: 'config', resourceId: 'network', details: '更新爱快节点网络配置(' + changes.join(',') + ')', req });
            }
            if (cnameDetail) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.cname', resourceType: 'config', resourceId: 'cname', details: cnameDetail, req });
            }
        } catch (e) {}
        res.json({ message: '网络配置已更新' });
    } catch (e) {
        res.status(500).json({ error: safeError(e), code: 'INTERNAL_ERROR' });
    }
});

// 测试连接：按表单当前值真实登录爱快并执行只读查询验证连通性（未保存即可测；不产生任何写操作、不落库）
router.post('/admin/ikuai/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 外呼真实设备：走可配置限速（与 ikuai_query 同规则，独立 key）
        var rateLimitResult = await checkConfiguredRateLimit('ikuai_query', 'ratelimit:ikuai-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        // 表单当前值测试（未保存即可测）：敏感字段打码/空值回退读库解密（与 PVE 测试连接同款模式）
        var body = req.body || {};
        var saved = await db.config.getIkuai();
        var host = String(body.host !== undefined ? body.host : (saved.host || '')).trim();
        var version = body.version === 'v4' ? 'v4' : (saved.version === 'v4' ? 'v4' : 'v3');
        var username = String(body.username !== undefined ? body.username : (saved.username || '')).trim();
        // 表单当前值测试（未保存即可测）：敏感字段占位判定 = 与 maskSecret(已保存值) 精确相等才回退——
        // 宽松 isMasked(includes '****') 会把「占位值末尾追加/修改」（如 test****528@x）也当未修改回退，
        // 掩盖被测凭据（V4 占位 Token 末尾追加仍提示成功）；精确匹配后追加/修改一律按真实输入测试
        var savedPwdMask = maskSecret(saved.password);
        var savedApiKeyMask = maskSecret(saved.api_key);
        var apiKeyEmpty = body.api_key === undefined || body.api_key === '';
        var pwdChanged = body.password !== undefined && body.password !== '' && body.password !== savedPwdMask;
        var apiKeyChanged = !apiKeyEmpty && body.api_key !== savedApiKeyMask;
        var password = pwdChanged ? body.password : saved.password;
        var apiKey = apiKeyChanged ? body.api_key : saved.api_key;
        var strictTls = body.strict_tls !== undefined ? !!body.strict_tls : !!saved.strict_tls;
        // host 校验（协议白名单防 SSRF + V4 强制 https，与保存端点一致）
        if (!host) return res.status(400).json({ error: '请先填写爱快地址', code: 'IKUAI_URL_REQUIRED' });
        if (!/^https?:\/\/\S+$/i.test(host)) {
            return res.status(400).json({ error: '爱快地址必须以 http:// 或 https:// 开头', code: 'IKUAI_URL_SCHEME' });
        }
        if (version === 'v4' && !/^https:\/\/\S+$/i.test(host)) {
            return res.status(400).json({ error: 'V4 接口仅支持 HTTPS，地址必须以 https:// 开头（可带端口，未填默认 443）', code: 'IKUAI_V4_HTTPS_REQUIRED' });
        }
        // V4 测试必须用真实 Token：空值拒绝（测试的目的就是验证你填的 Token）
        if (version === 'v4' && apiKeyEmpty) {
            return res.status(400).json({ error: 'V4 模式需要填写 API Token', code: 'IKUAI_V4_KEY_REQUIRED' });
        }
        var info = await ikuaiApi.testConnectionWith({ host, username, password, api_key: apiKey, version, strict_tls: strictTls });
        res.json({ message: '连接成功', info: info || null });
    } catch (e) {
        console.error('[ikuai] 测试连接失败:', e.message);
        // 测试端点是管理员调试自家设备：返回可操作的具体原因（err.IKUAI_TEST_FAILED 词条="{0}" 透传该原因），
        // 不透传面板内部路径/堆栈；连接失败原因非敏感信息（超时/拒绝/认证）
        var reason = friendlyTestError(e);
        res.status(400).json({ error: reason, code: 'IKUAI_TEST_FAILED', params: [reason] });
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
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/pve/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { host, api_token, ssh_host, ssh_port, ssh_user, ssh_password, strict_tls } = req.body;
        // V6-I3 修复：SSH 端口范围校验（1-65535，非法/缺省回退 22）
        var parsedPort = parseInt(ssh_port);
        if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) parsedPort = 22;
        // 保存前取旧配置（审计 diff 用；token/SSH 密码只记「已更新」标记，不记录原文）
        var oldPve = await db.config.getPve();
        // V6-I4 修复：空字符串视为未修改（保留旧凭据）——isMasked('') 为 false，此前空串会
        // 加密空值入库覆盖原密码导致连接失败；显式清空应走其他途径而非空串覆盖
        var tokenChanged = api_token !== undefined && api_token !== '' && !isMasked(api_token);
        var sshPwdChanged = ssh_password !== undefined && ssh_password !== '' && !isMasked(ssh_password);
        // 脱敏值跳过，不覆盖原值
        var configToSave = {
            host: host || '',
            api_token: (api_token !== undefined && api_token !== '' && !isMasked(api_token)) ? api_token : undefined,
            ssh_host: ssh_host || '',
            ssh_port: parsedPort,
            ssh_user: ssh_user || 'root',
            ssh_password: (ssh_password !== undefined && ssh_password !== '' && !isMasked(ssh_password)) ? ssh_password : undefined,
            strict_tls: !!strict_tls
        };
        await db.config.setPve(configToSave);
        // 刷新 PVE API 实例的配置缓存
        await pveApi.reloadConfig();
        // 操作审计：更新 PVE 节点配置（DB 新旧值字段级 diff，不记录 token/SSH 密码原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff(oldPve, await db.config.getPve(), [
                { key: 'host', label: 'PVE地址' },
                { key: 'ssh_host', label: 'SSH地址' },
                { key: 'ssh_port', label: 'SSH端口', num: true },
                { key: 'ssh_user', label: 'SSH用户' },
                { key: 'strict_tls', label: '严格TLS', bool: true }
            ]);
            if (tokenChanged) changes.push('API Token 已更新');
            if (sshPwdChanged) changes.push('SSH密码 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.pve', resourceType: 'config', resourceId: 'pve', details: '更新PVE节点配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: 'PVE 配置保存成功' });
    } catch (error) {
        console.error('更新 PVE 配置失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

// 测试连接：校验 PVE API + SSH 连通性（对表单当前值测试；Token/SSH 密码打码值回退读库，不修改已保存配置）
router.post('/admin/pve/test', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        // 外呼真实 PVE/SSH：走可配置限速（独立 key）
        var rateLimitResult = await checkConfiguredRateLimit('pve_test', 'ratelimit:pve-test:' + req.user.id);
        if (!rateLimitResult.allowed) {
            return res.status(429).json({ error: '测试过于频繁，请稍后再试', code: 'RATE_LIMITED_TEST', retryAfter: rateLimitResult.retryAfter });
        }
        var { host, api_token, ssh_host, ssh_port, ssh_user, ssh_password, strict_tls } = req.body || {};
        // 占位判定 = 与 maskSecret(已保存值) 精确相等才回退（与爱快测试同款：宽松 isMasked 会把占位值末尾追加/修改当未修改）
        var saved = await db.config.getPve();
        if (!(api_token !== undefined && api_token !== '' && api_token !== maskSecret(saved.api_token))) {
            api_token = saved.api_token || '';
        }
        if (!(ssh_password !== undefined && ssh_password !== '' && ssh_password !== maskSecret(saved.ssh_password))) {
            ssh_password = saved.ssh_password || '';
        }
        var result = await pveApi.testConnection({ host, api_token, strict_tls: !!strict_tls, ssh_host, ssh_port, ssh_user, ssh_password });
        if (!result.success) {
            return res.status(400).json({ error: result.message, info: result.info || null });
        }
        res.json({ message: result.message, info: result.info || null });
    } catch (error) {
        console.error('[pve] 测试连接失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/redis/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var { host, port, password, db: redisDb, prefix } = req.body;
        // 保存前取旧配置（审计 diff 用；密码只记「已更新」标记，不记录原文）
        var oldRedis = await db.config.getRedis();
        var redisPwdChanged = password !== undefined && !isMasked(password);
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

        // 操作审计：更新 Redis 配置（DB 新旧值字段级 diff，不记录密码原文）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff(oldRedis, await db.config.getRedis(), [
                { key: 'host', label: '地址' },
                { key: 'port', label: '端口', num: true },
                { key: 'db', label: '库号', num: true },
                { key: 'prefix', label: '前缀' }
            ]);
            if (redisPwdChanged) changes.push('密码 已更新');
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.redis', resourceType: 'config', resourceId: 'redis', details: '更新Redis配置；变更:' + changes.join(', '), req });
            }
        } catch (e) {}

        res.json({ message: 'Redis 配置保存成功' });
    } catch (error) {
        console.error('更新 Redis 配置失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.put('/admin/log/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var keepCount = parseInt(req.body.keep_count);
        var keepAdminCount = req.body.keep_admin_count !== undefined ? parseInt(req.body.keep_admin_count) : null;
        // 上限校验：100-100000，防止误填 0 或超大值导致日志被清空/爆库
        if (!Number.isInteger(keepCount) || keepCount < 100 || keepCount > 100000) {
            return res.status(400).json({ error: '用户日志上限须为 100-100000 的整数', code: 'USER_LOG_LIMIT_INT' });
        }
        if (keepAdminCount !== null && (!Number.isInteger(keepAdminCount) || keepAdminCount < 100 || keepAdminCount > 100000)) {
            return res.status(400).json({ error: '后台操作日志上限须为 100-100000 的整数', code: 'ADMIN_LOG_LIMIT_INT' });
        }
        // 保存前取旧配置（审计 diff 用）
        var oldLogConfig = {
            keep_count: parseInt(await db.config.get('log:keep_count')) || 5000,
            keep_admin_count: parseInt(await db.config.get('log:keep_admin_count')) || 5000
        };
        await db.config.set('log:keep_count', String(keepCount));
        if (keepAdminCount !== null) {
            await db.config.set('log:keep_admin_count', String(keepAdminCount));
        }
        // 操作审计：更新日志保留上限（字段级 diff）
        try {
            const { auditLog } = require('../utils/audit-log');
            var changes = buildFieldDiff(oldLogConfig, {
                keep_count: parseInt(await db.config.get('log:keep_count')) || 5000,
                keep_admin_count: parseInt(await db.config.get('log:keep_admin_count')) || 5000
            }, [
                { key: 'keep_count', label: '每用户上限', num: true },
                { key: 'keep_admin_count', label: '后台全站上限', num: true }
            ]);
            if (changes.length) {
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.config.log', resourceType: 'config', resourceId: 'log', details: '更新日志上限；变更:' + changes.join(', '), req });
            }
        } catch (e) {}
        res.json({ message: '日志配置保存成功' });
    } catch (error) {
        console.error('更新日志配置失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
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
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
