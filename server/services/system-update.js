// server/services/system-update.js - 系统在线更新服务（git fetch/reset + npm install + 重启）
// 规范第七节：基础设施/运维编排进 services/，路由只做响应组装
// 从 routes/admin-config.js 抽取：/admin/system/update/execute 业务

const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * 执行系统更新（git fetch 双源回退 + 可回滚备份 + reset + npm install + 自动重启）
 * 返回 { ok: true, data: { message } } 或 { ok: false, status, error }
 * 成功后内部安排 process.exit（PM2 滚动重启/进程管理器拉起），与原有行为一致
 * @param {string} source - 'gitee' | 'github'（默认 gitee）
 */
async function executeUpdate(source) {
    const projectRoot = path.join(__dirname, '..', '..');
    const userSource = source || 'gitee';

    try {
        // 检查是否为 git 仓库
        if (!fs.existsSync(path.join(projectRoot, '.git'))) {
            return { ok: false, status: 400, error: '更新失败: 当前项目不是 git 仓库，无法使用在线更新。请手动下载最新版本覆盖更新。', code: 'UPDATE_NOT_GIT' };
        }

        // 添加 safe.directory 避免 dubious ownership 检测报错
        // 方式 1: --system 级别（所有用户生效），方式 2: --global（当前用户）
        try {
            execSync(`git config --system --add safe.directory ${projectRoot}`, { timeout: 5000, stdio: 'pipe' });
        } catch (e1) {
            try {
                execSync(`git config --global --add safe.directory ${projectRoot}`, { timeout: 5000, stdio: 'pipe' });
            } catch (e2) {
                // 忽略失败，下面用 -c 内联配置兜底
            }
        }

        // 确定更新源 URL：公共仓库支持免认证 fetch
        // 使用完整 URL 拉取，避免 remote 配置问题（如 URL 被污染、缺少 remote、认证提示等）
        const githubRepo = process.env.GITHUB_REPO || '272416939/pve-multi-user-panel';
        const giteeRepo = process.env.GITEE_REPO || 'Allen0528/pve-multi-user-panel';
        const sourceUrls = {
            gitee: `https://gitee.com/${giteeRepo}.git`,
            github: `https://github.com/${githubRepo}.git`
        };
        const primaryUrl = sourceUrls[userSource] || sourceUrls.gitee;
        const fallbackUrl = userSource === 'gitee' ? sourceUrls.github : sourceUrls.gitee;

        // fetch 阶段：使用完整 URL 免认证拉取公共仓库
        // GIT_TERMINAL_PROMPT=0 禁止交互式认证提示（避免卡住等待输入）
        // -c safe.directory 兜底避免 dubious ownership 报错（即使 config 未生效）
        const safeGitDir = projectRoot.replace(/"/g, '\\"');
        const tryFetchUrl = (url) => {
            try {
                const out = execSync(`git -c safe.directory=${safeGitDir} fetch ${url} main 2>&1`, {
                    cwd: projectRoot,
                    timeout: 90000,
                    encoding: 'utf-8',
                    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
                });
                console.log('[系统更新] git fetch 成功:', url, out ? out.substring(0, 200) : '(无输出)');
                return true;
            } catch (e) {
                const stderr = e.stderr ? e.stderr.toString().trim() : '';
                const stdout = e.stdout ? e.stdout.toString().trim() : '';
                console.error('[系统更新] git fetch 失败:', url, 'code=' + (e.status || e.code),
                    'stderr=' + stderr.substring(0, 500), 'stdout=' + stdout.substring(0, 500));
                return false;
            }
        };

        let usedFallback = false;
        if (!tryFetchUrl(primaryUrl)) {
            // 主源失败，尝试回退到另一个平台
            if (!tryFetchUrl(fallbackUrl)) {
                return {
                    ok: false, status: 500,
                    error: `更新失败: git fetch 失败（${userSource} 源和 ${userSource === 'gitee' ? 'github' : 'gitee'} 源均不可达），请检查网络连接`, code: 'UPDATE_GIT_FETCH_FAILED', params: [userSource, userSource === 'gitee' ? 'github' : 'gitee']
                };
            }
            usedFallback = true;
        }

        // V3-15 修复：reset 前创建可回滚备份（git 分支引用 + 工作区快照）
        // 更新失败或异常时可通过 .update-backup 目录 + .update-backup/HEAD 恢复到原状态
        let backupCreated = false;
        try {
            const backupDir = path.join(projectRoot, '.update-backup');
            if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
            // 记录当前 HEAD 分支引用（含 stash 状态），供回滚脚本使用
            const currentHead = execSync('git rev-parse HEAD', { cwd: projectRoot, timeout: 5000, stdio: 'pipe' }).toString().trim();
            const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: projectRoot, timeout: 5000, stdio: 'pipe' }).toString().trim();
            fs.writeFileSync(path.join(backupDir, 'HEAD'), currentHead + '\n', 'utf8');
            fs.writeFileSync(path.join(backupDir, 'BRANCH'), currentBranch + '\n', 'utf8');
            // 未提交改动备份为 patch（git diff HEAD 输出）
            try {
                const diff = execSync('git diff HEAD', { cwd: projectRoot, timeout: 15000, stdio: 'pipe', encoding: 'utf-8' });
                fs.writeFileSync(path.join(backupDir, 'working.patch'), diff, 'utf8');
            } catch (diffErr) {
                // 无未提交改动时 diff 输出为空，忽略
                fs.writeFileSync(path.join(backupDir, 'working.patch'), '', 'utf8');
            }
            backupCreated = true;
            console.log('[系统更新] 已创建回滚备份:', backupDir, 'HEAD=' + currentHead);
        } catch (backupErr) {
            console.error('[系统更新] 创建回滚备份失败（继续更新）:', backupErr.message);
        }

        // reset 到 FETCH_HEAD（git fetch <url> <branch> 后最新提交在 FETCH_HEAD）
        try {
            execSync(`git -c safe.directory=${safeGitDir} reset --hard FETCH_HEAD`, { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
        } catch (error) {
            const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
            console.error('[系统更新] git reset 失败:', stderr);
            // V3-15：reset 失败时尝试回滚到备份 HEAD
            if (backupCreated) {
                try {
                    const head = fs.readFileSync(path.join(projectRoot, '.update-backup', 'HEAD'), 'utf8').trim();
                    execSync(`git -c safe.directory=${safeGitDir} reset --hard ${head}`, { cwd: projectRoot, timeout: 60000, stdio: 'pipe' });
                    console.log('[系统更新] 已回滚到备份 HEAD:', head);
                } catch (rollbackErr) {
                    console.error('[系统更新] 回滚失败，请手动恢复:', rollbackErr.message);
                }
            }
            return { ok: false, status: 500, error: '更新失败: git reset 失败，已尝试回滚，请检查仓库状态', code: 'UPDATE_GIT_RESET_FAILED' };
        }
        try {
            execSync('npm install --production', { cwd: projectRoot, timeout: 120000, stdio: 'pipe' });
        } catch (error) {
            const stderr = error.stderr ? error.stderr.toString().trim() : error.message;
            return { ok: false, status: 500, error: '更新失败: npm install 失败，请检查网络或依赖配置', code: 'UPDATE_NPM_FAILED' };
        }
        console.log('\n[系统更新] 自动更新完成，服务即将重启（此为正常行为，非异常崩溃）\n');

        // PM2 集群模式检测：pm_id 或 NODE_APP_INSTANCE 由 PM2 自动注入
        const isPM2 = process.env.pm_id !== undefined || process.env.NODE_APP_INSTANCE !== undefined;
        if (isPM2) {
            // PM2 滚动重启（graceful reload）：逐个替换实例，零停机，所有 worker 加载新代码
            // 使用 spawn 分离子进程，避免当前 worker 退出后中断执行
            try {
                const { spawn } = require('child_process');
                const child = spawn('pm2', ['reload', 'all'], {
                    detached: true,
                    stdio: 'ignore',
                    cwd: projectRoot,
                    env: { ...process.env }
                });
                child.unref();
                // 给 reload 命令 2s 窗口启动，当前 worker 再自行退出
                setTimeout(() => process.exit(0), 2000);
            } catch (e) {
                console.error('[系统更新] PM2 reload 失败，回退到 process.exit:', e.message);
                setTimeout(() => process.exit(0), 1000);
            }
        } else {
            // 非 PM2 模式：直接退出，由 systemd/supervisor/Docker 等进程管理器自动拉起
            setTimeout(() => process.exit(0), 1000);
        }
        return { ok: true, data: { message: '更新成功，服务正在重启...' + (usedFallback ? `（${userSource} 源不可达，已回退到 ${userSource === 'gitee' ? 'github' : 'gitee'} 源）` : '') } };
    } catch (error) {
        console.error('[系统更新] 未预期错误:', error.message, error.stack);
        // 更新失败时返回具体错误信息（而非通用 safeError），便于用户排查
        const errMsg = error.message || String(error);
        // 避免泄露敏感路径/凭据，仅返回关键错误描述
        const safeMsg = errMsg.replace(/\/[^\s]+\/\.git/g, '<repo>').replace(/https:\/\/[^\s]+/g, '<url>');
        return { ok: false, status: 500, error: '更新失败: ' + safeMsg, code: 'UPDATE_FAILED', params: [safeMsg] };
    }
}

module.exports = { executeUpdate };
