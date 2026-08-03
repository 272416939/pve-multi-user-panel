---
name: pve-release-management
description: >
  PVE 管理面板（pve-multi-user-panel）的版本发布管理流程，覆盖 beta 合并 main、版本号递增、CHANGELOG/README/package.json 更新、GitHub+Gitee 双端 Release 发布与 beta 回同步。
  当用户说「发布小版本更新」「发布中型更新」「发布大版本更新」「合并 main 发布」「更新 pack 版本」「发布发行版」等表述时触发。版本号规则：小版本 = PATCH+1（如 2.1.0→2.1.1）、中型 = MINOR+1（如 2.1.1→2.2.0）、大版本 = MAJOR+1（如 2.1.1→3.0.0）。发布时务必按本流程执行，避免遗漏双端发布、临时文件清理、beta 回同步等步骤。
---

# PVE 管理面板版本发布管理

本技能沉淀自本项目多次实际发布（v2.32.x ~ v2.33.x）的完整流程。核心原则：**发布前询问用户确认版本号与推送平台**，发布后 **双端（GitHub + Gitee）同步**，**含 token 的临时文件立即删除**，**beta 分支回同步**。

## 一、版本号规则（用户指定）

| 用户说法 | SemVer | 示例 |
|----------|--------|------|
| 小版本更新 | PATCH+1 | 2.1.0 → 2.1.1 |
| 中型更新 | MINOR+1 | 2.1.1 → 2.2.0 |
| 大版本更新 | MAJOR+1 | 2.1.1 → 3.0.0 |

## 二、发布前状态检查

```bash
git branch -vv                          # 当前分支（通常在 beta）
grep '"version"' package.json           # 当前版本
git tag --sort=-v:refname | head -3     # 最近 tag
git status --porcelain                  # 工作区必须干净
git log <lastTag>..HEAD --oneline --no-merges   # 待发布提交
```

将提交按 `git log <lastTag>..HEAD --pretty=format:"%s"` 分类（`awk -F'[:(]' '{print $1}' | sort | uniq -c`）：
- `fix` / `chore` / `docs` / `style` / `refactor` → **小版本**（PATCH+1）
- `feat` → **中型**（MINOR+1）
- breaking change（`!` 或 `BREAKING CHANGE:`）→ **大版本**（MAJOR+1）
- 混合时取最高档，但仍需询问用户

## 三、发布决策（必须询问，不自动执行）

使用 `AskUserQuestion` 同时询问两个问题：

**问题 1：版本号** —— 给出按提交类型计算的推荐档 + 用户指定档两个选项，附提交统计摘要：
- 选项 A（推荐）：按 SemVer 规则计算的版本号
- 选项 B：按用户说法（小/中/大）对应的版本号

**问题 2：推送平台** —— 默认推荐「双端发布」：
- 双端发布（推荐）：GitHub + Gitee
- 仅 GitHub / 仅 Gitee

## 四、合并 beta -> main

1. `git checkout main`
2. `git merge beta --no-ff -m "Merge branch 'beta' into main\n\nvX.Y.Z: <一句话摘要>"`
   - **必须 `--no-ff`**，保留分支拓扑（项目惯例）
   - 若 main 上有 beta 没有的提交（如直接在 main 上的 hotfix），三方合并自动处理，无需手工
3. 合并后若文件被改动，检查是否有冲突需解决

## 五、更新版本号（3 处）

| 文件 | 位置 | 操作 |
|------|------|------|
| `package.json` | `"version"` 字段 | 旧值 → 新值 |
| `README.md` | 第 7 行版本徽章 `img.shields.io/badge/version-vX.Y.Z-...` | 替换版本号 |
| `CHANGELOG.md` | `# Changelog` 之后插入新条目 | 见下 |

### CHANGELOG 条目格式（Keep a Changelog 风格）

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added（N 个 feat）
- **feat(scope): 标题** + 要点列表

### Changed
- refactor/chore 归类

### Fixed（按主题分组）
- fix(scope): ...（相关修复合并成组）

### Security
- 🔒 安全修复列表

### Notes
- 部署注意事项（数据库迁移、新表、新配置等）
```

**特殊场景：自动更新修复版本**（修复本身在该版本内，旧版本无法自动更新上来）：
在 CHANGELOG 条目顶部加：

```markdown
### ⚠️ 重要：本次升级必须使用手动更新
> 修复代码包含在此版本中，旧版本面板无法通过自动更新升级，必须手动执行 git pull。
```

## 六、提交 + Tag

```bash
git add package.json README.md CHANGELOG.md
git status --porcelain   # 确认仅 3 个文件，无敏感文件
git commit -m "chore(release): vX.Y.Z

- 合并 beta 分支至 main
- 升级版本号 <old> -> <new>
- 主要内容：<要点>"
git tag -a vX.Y.Z -m "Release vX.Y.Z - <标题>"
```

## 七、双端推送

```bash
git fetch origin && git fetch gitee    # 确认远程无新变更
git log --oneline origin/main..HEAD    # 确认领先内容
git push origin main && git push origin vX.Y.Z
git push gitee main && git push gitee vX.Y.Z
```

任一端失败立即停止报告。

## 八、创建 GitHub Release

1. 写 `release-notes-vX.Y.Z.md`（从 CHANGELOG 提取，加功能亮点 + Full Changelog 对比链接）
2. `gh release create vX.Y.Z --title "vX.Y.Z - <标题>" --notes-file release-notes-vX.Y.Z.md`

## 九、创建 Gitee Release（API，token 来自记忆图谱）

Gitee PAT 信息在记忆图谱 `Gitee PAT` 实体：token 文件 `E:/code/KEY/giteekey.txt`（纯文本单行需 trim），Gitee 用户 `Allen0528`，仓库 `Allen0528/pve-multi-user-panel`。

1. **Node.js 生成 JSON payload**（避免 PowerShell 编码问题）：

```bash
node -e "
const fs = require('fs');
const token = fs.readFileSync('E:/code/KEY/giteekey.txt', 'utf8').trim();
const body = fs.readFileSync('release-notes-vX.Y.Z.md', 'utf8');
const payload = {
  access_token: token,
  tag_name: 'vX.Y.Z',
  name: 'vX.Y.Z - <标题>',
  body: body,
  prerelease: false,
  target_commitish: 'main'
};
fs.writeFileSync('gitee_rel.json', JSON.stringify(payload), {encoding: 'utf8'});
"
```

2. **curl.exe 发送**（必须用 `curl.exe` 全名，PowerShell 的 `curl` 是 Invoke-WebRequest）：

```bash
curl.exe -s -X POST "https://gitee.com/api/v5/repos/Allen0528/pve-multi-user-panel/releases" \
  -H "Content-Type: application/json; charset=utf-8" -d "@gitee_rel.json"
```

3. 验证返回 JSON 含 `id` 且中文无乱码（若有乱码检查文件编码是否为 UTF-8 无 BOM）

## 十、清理临时文件（必须）

```bash
rm -f gitee_rel.json release-notes-vX.Y.Z.md   # 含 token，绝不提交
git status --porcelain                          # 确认工作区干净
```

## 十一、同步 beta 分支

```bash
git checkout beta
git merge main --no-ff -m "Sync main into beta: vX.Y.Z release"
git push origin beta && git push gitee beta
```

## 十二、收尾验证

```bash
git log beta..main --oneline --no-merges   # 应为空
git log main..beta --oneline --no-merges   # 应为空（仅 sync merge）
gh release view vX.Y.Z --json url,tagName,publishedAt
```

更新记忆图谱 `pve-multi-user-panel` 实体的版本号 observation（`add_observations` 追加一条）。

## 安全检查（贯穿全程）

- **暂存区扫描**：`git add` 后必须 `git status --porcelain`，确认只有 `package.json` / `README.md` / `CHANGELOG.md`，出现 `.env`、token、密钥类文件立即中止
- **提交消息/Release Notes 脱敏**：不含 token、密码、手机号、长随机串（32+ 位）
- **临时文件**：`gitee_rel.json` 含 token，使用后立即删除，绝不提交
- **Gitee token 只读不写**：仅从 `E:/code/KEY/giteekey.txt` 读取，不写入任何文档或记忆图谱

## 常见故障

| 故障 | 处理 |
|------|------|
| `push rejected` | `git fetch` → `git rebase` / `git merge` → 重推 |
| `gh auth` 过期 | `gh auth refresh` |
| Gitee API 401 | 检查 token 权限（需 projects），确认用 `access_token` 参数名 |
| Gitee「该标签已存在发行版」 | 获取已有 Release ID，用 `PATCH` 更新而非 POST |
| `gh release create` tag 已存在 | `gh release edit <tag> --notes-file ...` |
| main 上 tag 落后 | 确保 tag 打在 release commit 上，先 push main 再 push tag |
