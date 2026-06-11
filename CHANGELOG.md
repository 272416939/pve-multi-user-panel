# Changelog

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

# 手动更新操作说明

当「系统更新」功能无法使用或需要手动升级时，请按以下步骤操作：

## 方式一：在线更新（推荐）

1. 登录管理后台 → 系统更新 → 选择更新源（Gitee 推荐）→ 点击 **执行更新**
2. 更新完成后服务自动重启，等待约 10 秒后刷新页面即可

## 方式二：手动覆盖更新

适用于 git 仓库异常、网络不通或需要回滚版本的情况：

### 步骤

1. **备份当前版本**（重要！）
   ```bash
   cd /path/to/pve-multi-user-panel
   cp -r public public.bak.$(date +%Y%m%d)
   ```

2. **下载最新版本**
   ```bash
   # 方式 A：从 Gitee 下载（国内推荐）
   wget https://gitee.com/Allen0528/pve-multi-user-panel/archive/refs/tags/v1.7.5-UI-beta4.zip -O update.zip
   
   # 或方式 B：从 GitHub 下载
   wget https://github.com/272416939/pve-multi-user-panel/archive/refs/tags/v1.7.5-UI-beta4.zip -O update.zip
   ```

3. **解压并覆盖文件**
   ```bash
   # 备份 package.json（保留本地配置）
   cp package.json package.json.bak
   
   # 解压到临时目录
   unzip update.zip -d /tmp/update
   
   # 覆盖前端和后端文件（保留 config.env 等配置文件）
   cp -r /tmp/update/pve-multi-user-panel-v*/public/* public/
   cp -r /tmp/update/pve-multi-user-panel-v*/server/* server/
   cp /tmp/update/pve-multi-user-panel-v*/package.json .
   
   # 安装依赖（如有版本变化）
   npm install --production
   ```

4. **重启服务**
   ```bash
   # 如果使用 PM2
   pm2 restart all
   
   # 或如果使用 systemd
   systemctl restart pve-panel
   
   # 或直接杀进程（PM2/systemd 未托管时）
   kill $(pgrep -f "server/server.js") && node server/server.js &
   ```

5. **验证更新**
   - 刷新浏览器页面（建议 Ctrl+Shift+R 强制刷新）
   - 登录管理后台 → 系统更新 → 点击 **检查更新**，确认显示当前版本为 `v1.7.5-UI-beta4`

## 版本回滚

如需回滚到旧版本：
```bash
# 1. 停止服务
pm2 stop all  # 或 kill 对应进程

# 2. 恢复备份
cp -r public.bak.YYYYMMDD/* public/

# 3. 重启服务
pm2 restart all
```
