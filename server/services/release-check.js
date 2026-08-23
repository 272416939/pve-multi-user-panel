// server/services/release-check.js - 版本检查服务（第三方 GitHub/Gitee 外呼）
// 规范第七节：第三方外部 API 必须走 services/ 封装；失败静默降级，不阻塞主流程
// 从 routes/admin-config.js 抽取：/admin/system/update/check 业务

const path = require('path');
const { execSync, execFileSync } = require('child_process');
const axios = require('axios');
const db = require('../api/db');
const pkg = require('../../package.json');
const { safeError } = require('../utils/safe-error');

// 获取当前 HEAD commit hash（用于同版本号不同 commit 的判断）
function getCurrentCommit(projectRoot) {
    try {
        return execSync('git rev-parse HEAD', { cwd: projectRoot, timeout: 5000, stdio: 'pipe' })
            .toString().trim();
    } catch (e) {
        return null;
    }
}

/**
 * 检查系统更新（Gitee/GitHub 双源 + 回退 + 版本比较 + 同版本不同 commit 检测）
 * 返回可直接 res.json 的 payload（全部为 200 响应，错误以 error 字段表达，与原有行为一致）
 * @param {string} source - 'gitee' | 'github'（默认 gitee）
 * @returns {Promise<object>}
 */
async function checkForUpdates(source) {
    const githubRepo = process.env.GITHUB_REPO || '272416939/pve-multi-user-panel';
    const giteeRepo = process.env.GITEE_REPO || 'Allen0528/pve-multi-user-panel';

    // 用户指定更新源（默认 gitee）
    const userSource = source || 'gitee';
    let response = null;
    let usedSource = userSource;
    let fallbackNote = '';

    try {
        // per_page=20 确保拉取足够多 Release 后按 published_at 降序取最新
        // GitHub API 默认按标签时间戳排序（不可靠），需拉取多条后手动按 published_at 排序
        if (usedSource === 'gitee') {
            response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=20&sort=created&direction=desc`, { timeout: 10000 });
            // Gitee 按创建时间返回，仍手动按 created_at/published_at 降序取最新，避免误取旧版本 release
            const giteeReleases = (Array.isArray(response.data) ? response.data : []).sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
            response.data = giteeReleases[0] || null;
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
            throw new Error(usedSource === 'gitee' ? 'Gitee 未找到任何 Release，请确认仓库已发布' : 'GitHub 未找到任何 Release');
        }
    } catch (e) {
        // 指定源失败时尝试回退到另一个源（但 source 保持用户选择）
        if (usedSource === 'gitee') {
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
                return {
                    current_version: pkg.version,
                    has_update: false,
                    error: '无法连接更新服务器（Gitee / GitHub 均不可达）', code: 'UPDATE_SERVER_UNREACHABLE'
                };
            }
        } else {
            fallbackNote = '（GitHub 不可达，已回退到 Gitee）';
            try {
                response = await axios.get(`https://gitee.com/api/v5/repos/${giteeRepo}/releases?per_page=20&sort=created&direction=desc`, { timeout: 10000 });
                const giteeReleases = (Array.isArray(response.data) ? response.data : []).sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));
                response.data = giteeReleases[0] || null;
            } catch (e2) {
                return {
                    current_version: pkg.version,
                    has_update: false,
                    error: '无法连接更新服务器（GitHub / Gitee 均不可达）', code: 'UPDATE_SERVER_UNREACHABLE_2'
                };
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

        // 同版本号检测：版本相同但 commit 不同时也提示可更新
        // 注意必须判断先后方向：只有远程 release commit 领先本地（不是本地 HEAD 祖先）才提示；
        // 若本地已包含该 release commit（本地比 release 更新），版本一致时不应再提示
        let sameVersionDifferentCommit = false;
        if (!hasUpdate && pkg.version === tag) {
            var projectRoot = path.join(__dirname, '..', '..');
            var currentCommit = getCurrentCommit(projectRoot);
            var remoteCommit = null;
            if (currentCommit && response.data.target_commitish) {
                remoteCommit = response.data.target_commitish;
            } else if (currentCommit && response.data.tag_name) {
                // 通过 tag 名称获取远程 commit（SEC-007: 改用 execFileSync 数组形式防注入）
                try {
                    remoteCommit = execFileSync('git', ['rev-parse', 'refs/tags/' + response.data.tag_name], {
                        cwd: projectRoot, timeout: 5000, stdio: 'pipe'
                    }).toString().trim();
                } catch (e) {
                    // 本地可能没有该 tag，尝试 fetch
                    try {
                        execFileSync('git', ['fetch', 'origin', 'tag', response.data.tag_name, '--no-tags'], {
                            cwd: projectRoot, timeout: 15000, stdio: 'pipe'
                        });
                        remoteCommit = execFileSync('git', ['rev-parse', 'refs/tags/' + response.data.tag_name], {
                            cwd: projectRoot, timeout: 5000, stdio: 'pipe'
                        }).toString().trim();
                    } catch (e2) {
                        // 无法获取远程 commit，忽略
                    }
                }
            }
            if (currentCommit && remoteCommit) {
                // commit 不同时，仅当远程 release commit 不是本地 HEAD 的祖先（远程确实领先本地）才提示
                if (currentCommit !== remoteCommit) {
                    try {
                        execFileSync('git', ['merge-base', '--is-ancestor', remoteCommit, 'HEAD'], {
                            cwd: projectRoot, timeout: 5000, stdio: 'pipe'
                        });
                        // 远程 commit 是本地祖先 → 本地已包含该 release，视为已是最新
                    } catch (e) {
                        // 不是祖先 → 远程存在本地没有的提交，提示可更新
                        sameVersionDifferentCommit = true;
                    }
                }
            }
        }

        return {
            current_version: pkg.version,
            latest_version: tag,
            has_update: hasUpdate || sameVersionDifferentCommit,
            same_version_diff_commit: sameVersionDifferentCommit,
            source: usedSource,
            fallback_note: fallbackNote || undefined,
            release: {
                tag_name: response.data.tag_name,
                name: response.data.name,
                body: response.data.body,
                // Gitee 不返回 html_url/published_at，用 fallback 兼容
                html_url: response.data.html_url || (usedSource === 'gitee'
                    ? `https://gitee.com/${giteeRepo}/releases/tag/${response.data.tag_name}`
                    : `https://github.com/${githubRepo}/releases/tag/${response.data.tag_name}`),
                published_at: response.data.published_at || response.data.created_at || db.now()
            }
        };
    } catch (error) {
        console.error('[更新检查] 解析版本信息失败:', error.message);
        return {
            current_version: pkg.version,
            has_update: false,
            error: '解析版本信息失败: ' + safeError(error), code: 'VERSION_PARSE_FAILED', params: [safeError(error)]
        };
    }
}

module.exports = { checkForUpdates, getCurrentCommit };
