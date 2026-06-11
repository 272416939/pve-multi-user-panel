# Changelog

## [1.7.5-UI-beta22] - 2026-06-11

### Fixed
- fix(ui): **dashboard 侧边栏增加"管理后台"入口** — 容器导航项下方新增管理员返回链接（SVG 左箭头 + "管理后台"文字），仅 `role === 'admin'` 时显示，普通用户不可见。与 user-center 保持一致的交互体验
- 涉及文件：public/dashboard.html, public/js/dashboard/core.js

---

## [1.7.5-UI-beta21] - 2026-06-11

### Fixed
- fix(ui): **管理员返回按钮移至侧边栏** — 从 header 右上角移到侧边栏"仪表盘"下方，使用 SVG 左箭头图标 + "管理后台"文字，仅 admin 角色可见，更醒目易操作
- fix(ui): **全页面 emoji 图标替换为 SVG** — admin.html(12处)、dashboard.html(12处)、user-center.html(11处) 共 35 处 UI emoji 全部替换为 Lucide 风格 SVG 图标（menu/refresh/home/monitor/box/settings/user/logout/bell/file-text/lock 等），统一视觉风格
- 涉及文件：public/admin.html, public/dashboard.html, public/user-center.html

---

## [1.7.5-UI-beta20] - 2026-06-11

### Fixed
- fix(ui): **管理员访问用户中心后无法返回管理页面** — user-center header 新增"返回管理后台"按钮（SVG 左箭头图标），仅当 `user.role === 'admin'` 时显示，普通用户不可见
- 涉及文件：public/user-center.html

---

## [1.7.5-UI-beta19] - 2026-06-11

### Fixed
- fix(ui): **dashboard 消息按钮改为 SVG 铃铛图标 + 添加点击跳转** — 原来使用 🔔 emoji 且无点击事件，现替换为 SVG bell 图标并链接到 user-center.html#messages
- fix(ui): **user-center 移除 header 消息按钮** — 用户中心已有完整消息列表页，header 重复的 🔔 按钮已删除
- 涉及文件：public/dashboard.html, public/user-center.html

---

## [1.7.5-UI-beta18] - 2026-06-11

### Fixed
- fix(api): **LXC 重置 IP 仍失败 "duplicate key: gw"** — 根因：静态/随机 IP 模式下，原始 net0 已包含 `gw=xxx`，代码又 push 了新的 `gw=`，导致 PVE 报重复键错误。现改为**统一在解析阶段移除 ip/ip6/gw/firewall 四类参数**，再根据模式按需添加，彻底避免重复
- 涉及文件：server/routes/lxc.js

---

## [1.7.5-UI-beta17] - 2026-06-11

### Fixed
- fix(api): **LXC 重置 IP 仍然失败（PVE 400）** — 根因：容器 net0 包含 `firewall=1` 时，PVE 不允许设置 `ip=dhcp`（防火墙模式要求静态 IP）。DHCP 模式下现同时移除 `firewall` 和 `gw` 参数
- 改进 PVE 错误信息透传：提取 response.data 中的具体错误详情（之前只显示 "status code 400"）
- 增加 net0 构建调试日志（原始值 + 新值），方便排查问题
- 涉及文件：server/routes/lxc.js

---

## [1.7.5-UI-beta16] - 2026-06-11

### Fixed
- fix(api): **LXC/VM 重置 IP 失败 "Parameter verification failed"** — reset-ip 路由缺少 `ip_mode` 参数校验，当值为空或非法时构建的 net0 配置不完整导致 PVE API 拒绝。现增加参数校验 + fallback 分支（默认 DHCP）+ PVE 错误透传（失败时自动恢复开机）
- 涉及文件：server/routes/lxc.js, server/routes/vm.js

---

## [1.7.5-UI-beta15] - 2026-06-11

### Fixed
- fix(ui): **检查更新当前版本号首次不显示** — 点击"检查更新"后 `#currentVersion` 仍为"加载中..."，需手动刷新才出现。原因：`checkUpdate()` 获取数据后未同步更新 DOM 元素，现已修复
- fix(ui): **虚拟机/容器关机/停止后状态不自动刷新** — 操作完成后立即调用 `loadData()` 获取状态，但 PVE 尚未完成状态变更（ACPI 关机需要数秒）。现增加延迟轮询机制：关机后 4 秒、停止后 2 秒自动再次刷新列表
- 涉及文件：admin.html (update.js/vm.js/lxc.js) + dashboard.html (vm.js/lxc.js)

---

## [1.7.5-UI-beta14] - 2026-06-11

### Fixed
- fix(ui): **主题切换按钮不可见** — moon SVG 内联 `style="display:none"` 覆盖 CSS 优先级，导致明亮模式下太阳/月亮图标同时隐藏。移除内联 style，完全由 CSS 类控制显示/隐藏（admin.html / dashboard.html / login.html）

---

## [1.7.5-UI-beta13] - 2026-06-11

### Features
- feat(ui): **双主题系统全面重构** — 行业标准 CSS 变量 + data-theme 切换方案
  - 全新 CSS 变量体系：40+ 变量覆盖背景/文字/边框/颜色/阴影/毛玻璃全套
  - 明亮模式：柔和浅紫渐变 `#f0f4ff→#e6e9ff` + 白色毛玻璃卡片 + #334155 正文色
  - 暗黑模式：深紫渐变 `#1e1b4b→#0f172a` + 暗色毛玻璃卡片 + #e2e8f0 正文色
  - SVG 太阳/月亮图标切换按钮（带过渡动画），替代原有文本符号 ☀/☾
  - 防闪烁：`<head>` 内联脚本在 DOM 渲染前读取 localStorage 或系统偏好
  - 系统偏好检测：首次访问自动匹配 `prefers-color-scheme`
  - 全局过渡动画：所有元素 `transition: background/color/border/box-shadow 0.3s ease`
  - **删除旧方案**：移除全部 ~270 条 `[data-theme="light"] !important` 硬编码覆盖规则
  - 覆盖页面：admin.html / dashboard.html / user-center.html / login.html（新增支持）

### Fixed
- fix(ui): 解决明亮模式刺眼问题 — 纯白背景替换为柔和浅紫色调
- fix(ui): 统一四页面的主题切换体验（之前 login.html 无主题切换功能）
- fix(ui): 主题状态跨页面同步（localStorage 持久化 + 防闪烁脚本统一初始化）
- fix(ui): **主题切换按钮不可见** — moon SVG 内联 `style="display:none"` 覆盖 CSS 规则优先级，导致明亮模式下太阳/月亮图标同时隐藏。移除内联 style，完全由 CSS 类控制显示/隐藏

---

### Fixed
- fix(ui): **明亮模式最终修复** — 采用「全局颜色重置 + 特殊元素恢复」策略彻底解决
  - 根因：原始暗色样式使用 `!important` 但无 `[data-theme="dark"]` 条件，在 light mode 下仍强制生效
  - 方案：每个页面 inline style 末尾添加 `[data-theme="light"] .main-wrap { color: #1a1a2e !important; }` 全局重置
    + 对 td/th/span/div/p/li/label/small/form-control 等所有文本元素 `color: inherit`
    + 用 `:not()` 排除按钮/badge/modal/card 等组件后逐一恢复正确颜色
  - admin.html：~100 条覆盖规则（全局重置 + 按钮恢复 + badge恢复 + 弱化/强调文字分层）
  - dashboard.html：~130 条覆盖规则（含 vm-card/floating-dropdown/custom-select 特有元素）
  - user-center.html：~40 条覆盖规则（含 sidebar/page-header 背景覆盖、sub-nav-item/form-control）
  - Playwright 自动化截图验证全部三页面明亮模式效果通过

---

## [1.7.5-UI-beta11] - 2026-06-11

### Fixed
- fix(ui): **明亮模式彻底重构** — CSS 变量方案在 light mode 下不可靠，改用显式 `[data-theme="light"]` 选择器 + 硬编码深色值
  - admin.html：90 条 light mode 覆盖规则（stat-num/table/sidebar/modal/dropdown/alert 等）
  - dashboard.html：120 条 light mode 覆盖规则（含 vm-card/floating-dropdown/custom-select 等特有元素）
  - user-center.html：38 条 light mode 覆盖规则（首次修复，含 sub-nav-item/form-control/badge 等）
  - 所有页面统计数字、表格文字、导航、卡片、弹窗、下拉菜单等元素全部显式指定深色值，不再依赖 CSS 变量解析

---

## [1.7.5-UI-beta10] - 2026-06-11

### Fixed
- fix(ui): **明亮模式全面重构** — 修复所有页面在 light theme 下文字不可读的问题
  - **根因**：admin.html / dashboard.html 内联样式中大量使用浅色 fallback 值（`#E5E7EB`/`#9CA3AF`/`#e0e0e0`），light 模式下 CSS 变量未生效时直接显示浅色文字
  - **修复**：30 处硬编码浅色值统一替换为 `var(--text-primary)` / `var(--text-secondary)`，由 CSS 变量自动适配主题
  - **新增 light mode 覆盖规则**：table striped 行背景、alert 颜色对比度、status 文字移除 neon glow、sidebar/nav hover 背景、card vm-label 颜色等 16+ 条专用规则
- fix(ui): 更新日志容器缺少 `markdown-body` 类（beta9 继承）

---

## [1.7.5-UI-beta9] - 2026-06-11

### Fixed
- fix(ui): 更新日志容器缺少 `markdown-body` 类，导致 code/p/li 等元素样式不生效、字体颜色过暗看不清
- fix(docs): 手动更新说明简化为一条命令，合并至 README.md 统一维护

---

## [1.7.5-UI-beta8] - 2026-06-11

### Added
- feat(server): 服务启动时控制台输出 `[system] 当前系统版本：v{版本号}`，方便确认运行版本
- feat(update): 自动更新退出时输出 `[系统更新]` 明确提示，区分正常更新重启与异常崩溃

### Fixed
- fix(update): **重写版本比较逻辑** — 支持任意后缀格式（如 `1.7.8-MD-sy-01`）
  - 已知类型后缀(beta/alpha/rc/preview)：按类型优先级排序 + 前缀比较 + 数字比较
  - 未知格式后缀(如 MD-sy-01)：降级为整体字符串比较，确保同主版本不同自定义后缀可正确区分
  - 正式版(无后缀) > rc > preview > beta > alpha > custom

---

## [1.7.5-UI-beta7] - 2026-06-11

### Notes
- 测试版本：验证版本比较逻辑修复后检查更新功能是否正常

---

## [1.7.5-UI-beta6] - 2026-06-11

### Fixed
- fix(update): **版本比较逻辑严重缺陷** — parseVer 只取主版本号(1.7.5)丢弃后缀(-UI-betaN)，导致 beta4==beta5 无法检测到新版本
  - 重写 compareVer 完整解析器：先比主版本 → 再比后缀类型(release>rc>beta>alpha) → 最后比后缀数字
- fix(update): GitHub 检查更新无法检测 prerelease 版本（并行查询 releases+prereleases 取最新）
- fix(update): Gitee Release API 缺少 published_at/html_url 字段导致解析失败（fallback 兼容）
- fix(update): API 返回空数据时增加防御，错误信息详细化

---

## [1.7.5-UI-beta5] - 2026-06-11

### Notes
- 测试版本：用于验证检查更新功能（发现版本比较逻辑缺陷）

---

## [1.7.5-UI-beta4] - 2026-06-11

### Fixed
- fix(update): GitHub 检查更新无法检测 prerelease 版本（并行查询 releases+prereleases 取最新）
- fix(update): Gitee Release API 缺少 published_at/html_url 字段导致解析失败（fallback 兼容）
- fix(update): API 返回空数据时增加防御，错误信息详细化

---

## [1.7.5-UI-beta3] - 2026-06-11

### Security (CRITICAL)
- **VNC 权限绕过漏洞**：VM/CT 不在数据库时权限检查被跳过，任意用户可连接他人控制台
  - 根因：`if (vm) { 权限检查 }` 当 vm 为 null 时整个块被跳过
  - 修复：改为先检查存在性（不存在返回 404），再校验权限
- **VNC ticket 未校验**：WebSocket 代理不验证 ticket 合法性，可伪造票据连接任意机器
  - 新增内存 ticket 注册/校验机制（5分钟 TTL + vmid 绑定 + 懒清理）
  - API 获取 PVE ticket 后注册到存储，WebSocket 连接时校验

### Fixed
- fix(ui): 版本号硬编码 v1.7.4 改为从 `/api/version` 动态加载
- fix(ui): ctId/vmId undefined 崩溃（confirmState/lxcConfirmState 可选链 + setup 兜底）
- fix(ui): snapshotForm/lxcSnapshotForm undefined 崩溃（可选链 + setup 兜底）
- fix(ui): v-model 可选链语法错误（Vue 3 v-model 编译为赋值语句，?. 不能在赋值左边）
- fix(ui): ip_mode undefined 崩溃（setup 兜底初始化 + 只读访问可选链双重防御）
- fix(update): Gitee Release API 字段兼容（html_url/published_at fallback）

---

## [1.7.5-UI-beta2] - 2026-06-10

> 已合并至 beta3，此版本跳过。

---

## [1.7.5-UI-beta1] - 2026-06-10

### Added
- feat(ui): 用户中心 Tab 从 nav-tabs 迁移到左侧边栏（Teleport 方案），新增 switchSubTab 统一切换方法
- feat(ui): UC 侧边栏子导航项样式（分组标签 / 缩进 / active 高亮 / 未读 badge）
- feat(ui): UC 补全缺失的 sidebar-toggle 按钮和 768px 响应式 CSS 断点
- feat(ui): 下拉菜单改用 Teleport 到 body 浮动方案（解决表格 overflow 裁剪问题）
- feat(ui): 全页面头像从 div+background-image 改为 img+src（修复浏览器 SVG data URI 兼容性）

### Fixed
- fix(vm): VM reset-ip 报错 getByVmId is not a function（改用 getAll().find）
- fix(lxc): LXC reset-ip 缺少网关参数（添加 gw=）
- fix(vm): VM 已绑定 IP 修改时跳过创建（新增 updateDhcpStaticBindingIp 回退逻辑）
- fix(ui): UC header 与 dashboard 样式不统一
- fix(ui): 侧边栏 toggle 双重事件绑定导致点击无反应
- fix(ui): 导航后页面 overlay 残留模糊
- fix(ui): Admin 移动端 overlay 遮挡 sidebar
- fix(update): 检查更新无法检测 prerelease 版本（API 从 /latest 改为 releases?per_page=1）
- fix(update): 版本号带后缀时比较 NaN（先按 `/[-+]/` 分离后缀再 .map(Number)）

### Changed
- refactor(ui): Glassmorphism 视觉体系全面增强（CSS 变量双主题 / 毛玻璃卡片 / 细边框）
- refactor(ui): 移动端响应式全面优化（table 缩放 / stat 卡片适配 / nav-tabs 紧凑模式）

---

# 手动更新

当「系统更新」功能无法使用时，SSH 进入项目目录执行：

```bash
git fetch origin && git reset --hard origin/main && npm install --production
```

然后重启服务（PM2 / systemd / 手动重启均可）。

> 如需回滚：`git reflog` 查找旧 commit hash，`git reset --hard <hash>` 回滚。
