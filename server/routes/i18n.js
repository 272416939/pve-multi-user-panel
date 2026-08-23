/**
 * i18n 公开端点（语言列表 + 合并翻译内容）
 *
 * 无需鉴权：翻译内容与现有公开静态语言文件（/locales/*.json）同级、非敏感；
 * 自定义语言内容由管理员在后台编写，本身即面向全部终端用户展示。
 * code 一律走注册表白名单解析（services/i18n.js resolveLocale），不直接拼接文件路径（防路径穿越）。
 */

const express = require('express');
const router = express.Router();
const { safeError } = require('../utils/safe-error');
const { getLanguages, resolveLocale } = require('../services/i18n');

// PUBLIC: no auth required —— 语言列表（注册表 + overrides 标志）
// Cache-Control 必须 no-store：本接口的新鲜度由服务端无 TTL 缓存 + 写时失效保证
// （开关/新建/删除语言即时生效）。此前 public, max-age=30 会被 nginx proxy_cache
// 缓存——前端 cache:'reload' 只绕过浏览器缓存绕不过代理缓存，写后 30s 内拿旧列表，
// 曾致语言开关 UI 回弹且无法重新打开。
router.get('/i18n/languages', async (req, res) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await getLanguages());
    } catch (error) {
        console.error('获取语言列表失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

// PUBLIC: no auth required —— 合并翻译内容（覆盖/自定义语言解析；未知语言 404）
// 同上 no-store：词条保存/开关后即时可见，HTTP 层缓存与服务端写时失效语义冲突
router.get('/i18n/locale/:code', async (req, res) => {
    try {
        const code = String(req.params.code || '');
        const dict = await resolveLocale(code);
        if (!dict) {
            return res.status(404).json({ error: '未知语言', code: 'UNKNOWN_LANG' });
        }
        res.set('Cache-Control', 'no-store');
        res.json(dict);
    } catch (error) {
        console.error('解析语言内容失败:', error.message);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

module.exports = router;
