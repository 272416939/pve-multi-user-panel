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
        // 使用 per_page=1 获取最新 release
        // 注意：GitHub /releases 默认不返回 prerelease，需额外查询后合并取最新
        if (source === 'gitee') {
            response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=1&sort=created&direction=desc`, { timeout: 10000 });
            response.data = Array.isArray(response.data) ? response.data[0] : response.data;
        } else {
            // GitHub 需要同时查询 releases 和 prereleases，取按时间最新的
            const [releasesRes, preReleasesRes] = await Promise.allSettled([
                axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=1`, { timeout: 10000 }),
                axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=1&prerelease=true`, { timeout: 10000 })
            ]);
            const releases = releasesRes.status === 'fulfilled' && Array.isArray(releasesRes.value.data) ? releasesRes.value.data : [];
            const preReleases = preReleasesRes.status === 'fulfilled' && Array.isArray(preReleasesRes.value.data) ? preReleasesRes.value.data : [];
            // 合并后按 published_at 降序取第一条
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
                    axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=1`, { timeout: 10000 }),
                    axios.get(`https://api.github.com/repos/${githubRepo}/releases?per_page=1&prerelease=true`, { timeout: 10000 })
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
                response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=1&sort=created&direction=desc`, { timeout: 10000 });
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

module.exports = router;
