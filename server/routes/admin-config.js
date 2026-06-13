const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const axios = require('axios');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { loadSentRemindersFromDb, checkExpiredVms, checkExpiredLxc } = require('../services/expiry-check');
const pkg = require('../../package.json');
// H-9 修复：生产环境隐藏详细错误信息
function safeError(e) {
    const isDebug = process.env.DEBUG === 'true';
    if (isDebug) return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}

function maskSecret(value) {
    if (!value || value.length < 5) return value || '';
    if (value.includes('****')) return value;
    if (value.length <= 6) return value[0] + '****' + value[value.length - 1];
    var prefix = value.substring(0, 4);
    var suffix = value.substring(value.length - 4);
    return prefix + '****' + suffix;
}

function isMasked(value) {
    return value && value.includes('****');
}

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
        const { host, port, secure, user, password, from, enabled } = req.body;

        const existingSmtp = await db.config.getSmtp();
        await db.config.setSmtp({
            host: host || '',
            port: port || 587,
            secure: !!secure,
            user: user || '',
            password: password !== undefined ? password : existingSmtp.password,
            from: from || '',
            enabled: !!enabled
        });

        const { password: _, ...configWithoutPassword } = await db.config.getSmtp();
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

// 检查系统更新
router.get('/admin/system/update/check', authMiddleware, adminMiddleware, async (req, res) => {
    const githubRepo = process.env.GITHUB_REPO || '272416939/pve-multi-user-panel';
    const giteeRepo = process.env.GITEE_REPO || 'Allen0528/pve-multi-user-panel';

    // 用户指定更新源（默认 gitee）
    const userSource = req.query.source || 'gitee';
    let response = null;
    let source = userSource;
    let fallbackNote = '';

    try {
        // per_page=20 确保拉取足够多 Release 后按 published_at 降序取最新
        // GitHub API 默认按标签时间戳排序（不可靠），需拉取多条后手动按 published_at 排序
        if (source === 'gitee') {
            response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=20&sort=created&direction=desc`, { timeout: 10000 });
            response.data = Array.isArray(response.data) ? response.data[0] : response.data;
        } else {
            const [releasesRes, preReleasesRes] = await Promise.allSettled([
                axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=20`, { timeout: 10000 }),
                axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=20&prerelease=true`, { timeout: 10000 })
            ]);
            const releases = releasesRes.status === 'fulfilled' && Array.isArray(releasesRes.value.data) ? releasesRes.value.data : [];
            const preReleases = preReleasesRes.status === 'fulfilled' && Array.isArray(preReleasesRes.value.data) ? preReleasesRes.value.data : [];
            const all = [...releases, ...preReleases].sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
            response = { data: all[0] || null };
        }
        // 防御：API 返回空数据时提前报错
        if (!response.data || !response.data.tag_name) {
            throw new Error(source === 'gitee' ? 'Gitee 未找到任何 Release，请确认仓库已发布' : 'GitHub 未找到任何 Release');
        }
    } catch (e) {
        // 指定源失败时尝试回退到另一个源（但 source 保持用户选择）
        if (source === 'gitee') {
            fallbackNote = '（Gitee 不可达，已回退到 GitHub）';
            try {
                const [rr, prr] = await Promise.allSettled([
                    axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=20`, { timeout: 10000 }),
                    axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=20&prerelease=true`, { timeout: 10000 })
                ]);
                const rels = rr.status === 'fulfilled' && Array.isArray(rr.value.data) ? rr.value.data : [];
                const prels = prr.status === 'fulfilled' && Array.isArray(prr.value.data) ? prr.value.data : [];
                const all = [...rels, ...prels].sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
                response = { data: all[0] || null };
            } catch (e2) {
                return res.json({
                    current_version: pkg.version,
                    has_update: false,
                    error: '无法连接更新服务器（Gitee / GitHub 均不可达）'
                });
            }
        } else {
            fallbackNote = '（GitHub 不可达，已回退到 Gitee）';
            try {
                response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=20&sort=created&direction=desc`, { timeout: 10000 });
                response.data = Array.isArray(response.data) ? response.data[0] : response.data;
            } catch (e2) {
                return res.json({
                    current_version: pkg.version,
                    has_update: false,
                    error: '无法连接更新服务器（GitHub / Gitee 均不可达）'
                });
            }
        }
    }

    try {
        const tag = response.data.tag_name.replace(/^v/, '');
        // 版本号比较：支持任意后缀格式（1.7.5 / 1.7.5-beta1 / 1.7.5-UI-beta4 / 1.7.8-MD-sy-01 等）
        const parseVer = (v) => {
            v = String(v).replace(/^v/, '');
            const dashIdx = v.indexOf('-');
            const mainStr = dashIdx === -1 ? v : v.substring(0, dashIdx);
            const main = mainStr.split('.').map(n => isNaN(parseInt(n)) ? 0 : parseInt(n));
            const rawSuffix = dashIdx === -1 ? '' : v.substring(dashIdx + 1);

            if (!rawSuffix) return { main, suffix: { type: 'release', num: Infinity, raw: '' } };

            // 尝试匹配已知类型后缀（beta/alpha/rc/preview）
            const m = rawSuffix.match(/^(.*)-(beta|alpha|rc|preview)(\d*)$/i);
            if (m) {
                return { main, suffix: { type: m[2].toLowerCase(), num: parseInt(m[3]) || 0, prefix: m[1], raw: rawSuffix } };
            }

            // 未知后缀格式（如 MD-sy-01）：整体作为字符串比较
            return { main, suffix: { type: 'custom', num: 0, raw: rawSuffix } };
        };

        const compareVer = (a, b) => {
            // 1. 比较主版本号
            const maxLen = Math.max(a.main.length, b.main.length);
            for (let i = 0; i < maxLen; i++) {
                const av = a.main[i] || 0, bv = b.main[i] || 0;
                if (av !== bv) return av < bv ? 1 : -1;
            }
            // 2. 都是无后缀的正式版 → 相等
            if (a.suffix.type === 'release' && b.suffix.type === 'release') return 0;
            // 3. 有后缀 vs 无后缀：无后缀(正式版) 更高
            if (a.suffix.type === 'release') return -1;
            if (b.suffix.type === 'release') return 1;

            // 4. 已知类型排序：rc > preview > beta > alpha > custom
            const typeOrder = { rc: 5, preview: 4, beta: 3, alpha: 2, custom: 1 };
            const at = typeOrder[a.suffix.type] ?? 1;
            const bt = typeOrder[b.suffix.type] ?? 1;
            if (at !== bt) return at < bt ? 1 : -1;

            // 5. 同类型比较：
            //    - custom 类型：字符串比较整个后缀
            //    - 已知类型(beta/alpha等)：先比前缀(如 UI)，再比数字
            if (a.suffix.type === 'custom') {
                if (a.suffix.raw < b.suffix.raw) return 1;
                if (a.suffix.raw > b.suffix.raw) return -1;
                return 0;
            }
            // 已知类型：先比前缀部分（如 "UI"）
            if ((a.suffix.prefix || '') !== (b.suffix.prefix || '')) {
                return (a.suffix.prefix || '') < (b.suffix.prefix || '') ? 1 : -1;
            }
            // 最后比数字
            if (a.suffix.num !== b.suffix.num) return a.suffix.num < b.suffix.num ? 1 : -1;
            return 0;
        };

        const current = parseVer(pkg.version);
        const latest = parseVer(tag);
        const hasUpdate = compareVer(current, latest) === 1;
        res.json({
            current_version: pkg.version,
            latest_version: tag,
            has_update: hasUpdate,
            source: source,
            fallback_note: fallbackNote || undefined,
            release: {
                tag_name: response.data.tag_name,
                name: response.data.name,
                body: response.data.body,
                // Gitee 不返回 html_url/published_at，用 fallback 兼容
                html_url: response.data.html_url || (source === 'gitee'
                    ? `https://gitee.com/${giteeRepo}/releases/tag/${response.data.tag_name}`
                    : `https://github.com/${githubRepo}/releases/tag/${response.data.tag_name}`),
                published_at: response.data.published_at || response.data.created_at || new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[更新检查] 解析版本信息失败:', error.message);
        res.json({
            current_version: pkg.version,
            has_update: false,
            error: '解析版本信息失败: ' + safeError(error)
        });
    }
});

// 执行系统更新
router.post('/admin/system/update/execute', authMiddleware, adminMiddleware, async (req, res) => {
    const projectRoot = path.join(__dirname, '..', '..');
    const userSource = (req.body && req.body.source) || 'gitee';

    try {
        // 检查是否为 git 仓库
        if (!fs.existsSync(path.join(projectRoot, '.git'))) {
            return res.status(400).json({ error: '更新失败: 当前项目不是 git 仓库，无法使用在线更新。请手动下载最新版本覆盖更新。' });
        }

        // 添加 safe.directory 避免权限检测报错
        try {
            execSync(`git config --global --add safe.directory ${projectRoot}`, { timeout: 5000, stdio: 'pipe' });
        } catch (e) {
            // 忽略失败，继续执行
        }

        // 确定更新源：根据用户选择，不可达则回退
        let remote = 'origin';
        if (userSource === 'gitee') {
            try {
                execSync('git remote get-url gitee', { cwd: projectRoot, timeout: 5000, stdio: 'pipe' });
                remote = 'gitee';
            } catch (e) {
                // gitee 远程源不存在，使用 origin
            }
        }

        try {
            execSync(`git fetch ${remote}`, { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
        } catch (error) {
            const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
            // 如果 gitee 失败，尝试回退 origin
            if (remote === 'gitee') {
                try {
                    execSync('git fetch origin', { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
                    remote = 'origin';
                } catch (e2) {
                    const stderr2 = e2.stderr ? e2.stderr.toString().trim() : e2.message;
                    return res.status(500).json({ error: '更新失败: git fetch 失败（gitee 和 origin 均不可达），请检查网络连接或远程仓库配置' });
                }
            } else {
                return res.status(500).json({ error: '更新失败: git fetch 失败，请检查网络连接或远程仓库配置' });
            }
        }
        try {
            execSync(`git reset --hard ${remote}/main`, { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
        } catch (error) {
            const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
            return res.status(500).json({ error: '更新失败: git reset 失败，请检查仓库状态' });
        }
        try {
            execSync('npm install --production', { cwd: projectRoot, timeout: 120000, stdio: 'pipe' });
        } catch (error) {
            const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
            return res.status(500).json({ error: '更新失败: npm install 失败，请检查网络或依赖配置' });
        }
        res.json({ message: '更新成功，服务正在重启...' });
        console.log('\n[系统更新] 自动更新完成，服务即将重启（此为正常行为，非异常崩溃）\n');
        setTimeout(() => process.exit(0), 1000);
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

// ========== 支付配置 ==========

router.get('/admin/pay/config', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        var getConfig = db.config.get;
        var baseUrl = await getConfig('pay:base_url') || 'https://pay.microgg.cn/';
        var pid = await getConfig('pay:pid') || '';
        var md5Key = await getConfig('pay:md5_key') || '';
        var v2PublicKey = await getConfig('pay:v2_public_key') || '';
        var v2PrivateKey = await getConfig('pay:v2_private_key') || '';
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
        if (md5_key !== undefined && !isMasked(md5_key)) {
            await setConfig('pay:md5_key', md5_key.trim());
        }
        if (v2_public_key !== undefined && !isMasked(v2_public_key)) {
            await setConfig('pay:v2_public_key', v2_public_key.trim());
        }
        if (v2_private_key !== undefined && !isMasked(v2_private_key)) {
            await setConfig('pay:v2_private_key', v2_private_key.trim());
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

        res.json({ message: '支付配置保存成功' });
    } catch (e) {
        console.error('[支付配置]', e.message);
        res.status(500).json({ error: safeError(e) });
    }
});

module.exports = router;
