# Changelog

## [1.8.0-beta26] - 2026-06-13

### Fixed
- fix(ui): 弹窗统计卡片字体颜色过暗，深色背景下 text-muted 改为 text-light opacity-75（dashboard.html + admin.html 共 16 处）

---

## [1.7.5-UI-beta36] - 2026-06-12

### Bugfix: Express 5.x → 4.x 降级（启动崩溃修复）
- **H-14 修正**: express 从 5.2.1 降级至 **4.22.2**
  - Express 5.x 的 `path-to-regexp` 不再支持 `app.get('*', ...)` 通配符路由语法
  - 导致 `PathError: Missing parameter name at index 1: *` 启动崩溃
  - Express 5 破坏性变更过多（body-parser 拆分、router API 变更等），生产环境暂不升级
  - axios 保持 1.17.0 不变（SSRF CVE 已在 1.7.4+ 修复）

---

## [1.7.5-UI-beta35] - 2026-06-12

### Security (Deep Audit Round 2 — 21 漏洞全部修复)

#### P0 — 密码学安全
- **X-1**: `CryptoJS.lib.WordArray.random()` → `crypto.randomBytes()` 全局替换（10 处/5 文件）
  - token.js: access token + refresh token 生成
  - auth.js: lazy migration 盐 + 密码重置盐
  - user.js: 2FA 恢复码 + 改密盐值
  - admin-user.js: 创建用户 + 管理员改密盐值
  - db-sqlite.js: 默认管理员盐值

#### HIGH — XSS 防护 + 认证安全
- **H-5/H-6**: marked.parse 输出通过 DOMPurify.sanitize() 净化（admin/core.js + user-center.html）
- **H-7**: 确认弹窗 v-html → Vue 安全文本插值（dashboard.html + admin.html）
- **H-8**: 密码更改/重置后撤销所有 refresh token（user.js + auth.js）
- **H-10**: site-url.js 移除 Host 头回退，未设 SITE_URL 返回 null 并阻止发送邮件
- **H-11**: Refresh Token Rotation — POST /auth/refresh 删除旧令牌并签发新令牌对
- **H-13**: axios 升级至 1.17.0（修复 CVE-2024-39338 SSRF）
- **H-14**: express 升级至 5.2.1（修复开放重定向/路径遍历/body-parser DoS）

#### MEDIUM — 信息泄露防护
- **H-9**: 生产环境 error.message 信息泄露修复 — 7 个文件 53 处 catch 块改用 safeError()
- **H-12**: LXC reset-ip 日志脱敏（DEBUG=true 才输出 net0 详情）
- **H-15**: /login/2fa 速率限制（每 IP+用户 60s 内 3 次）
- **H-16**: /auth/forgot-password 速率限制（每 IP 10 分钟 1 次）

#### MEDIUM/LOW — 其他加固
- **M-5**: CDK 兑换 TOCTOU → 原子 CAS 操作（UPDATE WHERE is_used=0）
- **M-6**: CDK 兑换速率限制（每用户 60s 1 次）
- **M-7**: 默认管理员密码日志增加「仅显示一次」警告
- **M-8**: 头像上传魔数校验（PNG/JPEG/GIF/WebP 文件头匹配）
- **M-9**: 数据库 update() 列名白名单（5 表：users/vms/lxcContainers/memos/portForwards）
- **M-10**: JWT_SECRET 示例值检测启动警告
- **L-4**: CSP 策略强化（完整指令集：defaultSrc/scriptSrc/styleSrc/imgSrc/connectSrc 等）
- **L-5**: CORS 来源限制（ALLOWED_ORIGINS 白名单 + localhost 默认允许）

### Modified Files (17 files)
- server/utils/token.js (X-1 + M-10)
- server/routes/auth.js (X-1 + H-8/H-10/H-11 + H-15/H-16)
- server/routes/user.js (X-1 + H-8 + M-8)
- server/routes/admin-user.js (X-1)
- server/api/db-sqlite.js (X-1 + M-7 + M-9)
- server/utils/site-url.js (H-10)
- server/server.js (L-4/L-5 + H-14 express upgrade)
- public/js/lib/dompurify.min.js (H-5/H-6 新增)
- public/js/admin/core.js (H-5/H-6 DOMPurify)
- public/user-center.html (H-5/H-6 DOMPurify)
- public/dashboard.html (H-7 v-html→文本插值)
- public/admin.html (H-7 v-html→文本插值 + DOMPurify 引入)
- server/routes/cdk.js (H-9 safeError + M-5 CAS + M-6 rate limit)
- server/routes/vm.js (H-9 safeError)
- server/routes/lxc.js (H-9 safeError + H-12 log sanitize)
- server/routes/snapshot.js (H-9 safeError)
- server/routes/backup.js (H-9 safeError)
- server/routes/network.js (H-9 safeError)
- server/routes/admin-config.js (H-9 safeError)
- package.json (H-13 axios + H-14 express)

---

## [1.7.5-UI-beta34] - 2026-06-12

### Security (Final Closure — 19/19 漏洞 100% 闭环)
- **L-2🔶**: PUT /port-forwards/:id 同步 IP 校验 — 修改 IP 时增加 IPv4 格式正则校验（端口转发本身指向内网，不限制内网地址段）

### Modified Files
- server/routes/network.js (L-2🔶: PUT端点IP校验)

---

## [1.7.5-UI-beta33] - 2026-06-12

### Security (Final Audit — 6 项残留漏洞全部闭环)
- **P0-B-1: 备份恢复未绑定目标机器** — restore 端点只校验目标归属，不校验 backup 本身
  - backup.js LXC restore: 新增 `backup.ct_id !== vmid` → 400 拒绝
  - backup.js VM restore: 新增 `backup.vm_id != vmid` → 400 拒绝
- **P0-B-2: 批量删除备份用原始 ids** — 循环中 continue 跳过但 deleteBatch 用全量 ID
  - backup.js batch-delete: 改用 `deletableIds[]` 收集通过校验的 ID，仅删除有权限项
- **P1-C-2R: 默认密码硬编码根除** — admin 密码仍为 `'admin123'` 字面量
  - db-sqlite.js: 新增 `generateRandomPassword(16)` 函数（密码学安全随机）
  - createDefaultAdmin(): 优先读 `DEFAULT_ADMIN_PASSWORD` 环境变量，未设置则自动生成强随机密码
  - 控制台醒目输出完整密码（分隔线框格式），首次登录必须可见
- **P2-V-1: VNC 端点权限模式修正**
  - vm.js + lxc.js VNC: 未分配 VM/CT 时管理员允许继续（运维用途），普通用户返回 403（非 404）
- **P3-M-2: JWT_SECRET 持久化** — 重启后 token 失效问题
  - token.js: 读取优先级 环境变量 → `.jwt-secret` 文件 → 自动生成并持久化
  - 密钥强度从 256bit 提升到 512bit (`crypto.randomBytes(64)`)
  - .gitignore 新增 `.jwt-secret` 条目防止密钥泄露
- **P3-L-2: 端口转发 IP 校验**
  - network.js: IPv4 合法性正则校验，非法 IP 返回 400
  - 普通用户禁止内网保留地址段（10.x / 172.16-31.x / 192.168.x / 127.x）

### Modified Files
- server/routes/backup.js (B-1: restore绑定; B-2: deletableIds过滤)
- server/api/db-sqlite.js (C-2R: generateRandomPassword + 环境变量)
- server/routes/vm.js (V-1: VNC权限模式)
- server/routes/lxc.js (V-1: VNC权限模式)
- server/utils/token.js (M-2: JWT_SECRET持久化)
- server/routes/network.js (L-2: IP校验+内网限制)

---

## [1.7.5-UI-beta32] - 2026-06-12

### Security (Final — 3 项残留漏洞全部闭环)
- **P0-C-3: LXC 重置密码命令注入彻底消除** — 含单引号/反引号/$() 的密码仍可逃逸 shell 引号执行任意命令
  - ssh-exec.js: 新增 `execSSHWithStdin()` 函数，通过 SSH stream stdin 管道传入数据，完全不接触 shell 解释器
  - lxc.js: reset-password 端点从 `bash -c 'echo root:${pwd} | chpasswd'` 改为 `chpasswd` + stdin pipe `root:{password}\n`
  - 攻击向量 `test'$(reboot)'` 不再可执行命令，密码原样设置为字面值
- **P1-C-2: 强制改密机制完整闭环**
  - user.js: `PUT /user/profile` 改密后自动设置 `must_change_password = 0`
  - login.html: 新增强制改密模态框（Vue Teleport + glass-card 风格），覆盖普通登录和 2FA 登录两条路径
  - 改密成功后根据角色跳转 dashboard/admin，二次登录不再弹出
- **P3-M-4: SHA256 加盐哈希**
  - db-sqlite.js: users 表新增 `password_salt TEXT DEFAULT ''` 字段 + ALTER TABLE 兼容旧库
  - auth.js: 登录校验双模式（有盐 SHA256(salt+pwd) / 无盐 SHA256(pwd)）+ lazy migration 自动 re-hash
  - user.js / admin-user.js: 所有密码写入路径（创建/改密/重置/管理员操作）均生成随机 salt 并存储

### Modified Files
- server/api/ssh-exec.js (C-3: +execSSHWithStdin)
- server/routes/lxc.js (C-3: stdin管道替代shell拼接)
- server/routes/user.js (C-2: 清除must_change_password; M-4: 改密加盐)
- server/routes/admin-user.js (M-4: 创建/改密加盐)
- server/routes/auth.js (M-4: 双模式登录校验+lazy migration)
- server/api/db-sqlite.js (M-4: password_salt字段+ALTER TABLE+默认管理员加盐)
- public/login.html (C-2: 强制改密模态框)

---

## [1.7.5-UI-beta31] - 2026-06-12

### Security (Critical/High — 10 漏洞修复)
- **P0-C1: Terminal WebSocket 无认证 → JWT Ticket 认证** — 任意用户可直接连接 WebSocket 获取 LXC root shell
  - terminal-proxy.js: 新增 `validateTicket()` 函数，校验 JWT ticket 类型+过期时间+vmid 绑定
  - lxc.js: `/lxc/:vmid/terminal` 端点生成 5 分钟有效期签名 ticket（含 vmid+userId）
  - terminal.html: 从 URL 读取 token 并传入 WebSocket 连接
- **P0-C3: LXC 重置密码命令注入 → vmid 白名单校验** — vmid 未过滤直接拼入 shell 命令
  - lxc.js: `reset-password` 端点新增 `Number.isInteger(vmid) && vmid >= 100 && vmid <= 999999999` 强校验
- **P1-C2: 默认管理员硬编码密码 → 首次登录强制改密机制**
  - db-sqlite.js: users 表新增 `must_change_password` 字段，默认管理员创建时标记为 1；ALTER TABLE 兼容旧库
  - auth.js: 登录成功后检查该字段，响应中返回 `must_change_password: true` 标记
- **P1-C5: VNC ticket 跨用户复用 → userId 强校验**
  - vnc-proxy.js: `validateTicket()` 新增 userId 参数，ticket 与请求用户不匹配则拒绝
  - vm.js/lxc.js: VNC proxyUrl 新增 `userId` 参数
  - vnc.html: 前端将 userId 传入 WebSocket URL

### Security (Medium — 4 端点认证补全)
- **P2-H1: 4 个端点补充权限中间件**
  - vm.js: `GET /pve/vms` 新增 `adminMiddleware`（泄露全部 VM 分配信息）
  - lxc.js: `GET /pve/lxc` 新增 `adminMiddleware`（泄露全部容器分配信息）
  - network.js: `GET /ikuai/interfaces` 新增 `adminMiddleware`（泄露内网拓扑）
  - admin-config.js: `GET /version` 新增 `authMiddleware`（原完全无认证）

### Security (Improvement — 快照/限速/数据清理)
- **H-4: LXC/VM 快照操作统一权限模式** — snapshot.js 6 个写端点（创建/回滚/删除 x LXC+VM）从旧版 `if(!admin){check}` 改为统一 `if(resource){owner|admin}else if(!admin){403}` 模式
- **M-1: 登录速率限制** — auth.js 新增内存限速器，基于 IP+用户名，5 次/分钟，超限返回 429
- **M-3: 删除用户清理 LXC** — admin-user.js 删除用户时同步清理 `lxcContainers` 表记录（原只清理 VM）

### Modified Files
- server/websocket/terminal-proxy.js (C-1: +JWT 认证)
- server/websocket/vnc-proxy.js (C-5: +userId 校验)
- server/routes/lxc.js (C-1 ticket生成, C-3 vmid白名单, C-5 VNC userId, H-1② adminMiddleware)
- server/routes/vm.js (C-5 VNC userId, H-1① adminMiddleware)
- server/routes/auth.js (C-2 must_change_password标记, M-1 登录限速)
- server/routes/admin-config.js (H-1⑥ authMiddleware)
- server/routes/admin-user.js (M-3 LXC 清理)
- server/routes/network.js (H-1⑤ adminMiddleware)
- server/routes/snapshot.js (H-4: 6端点统一权限模式)
- server/api/db-sqlite.js (C-2: must_change_password 字段+ALTER TABLE)
- public/terminal.html (C-1: token 传递)
- public/vnc.html (C-5: userId 传递)

---

## [1.7.5-UI-beta30] - 2026-06-11

### Security
- **fix(security): 补全 beta29 子代理遗漏的 2 处 HIGH 漏洞** — beta29 审计修复时子代理报告已修复但实际未写入代码
  - backup.js `GET /lxc/:vmid/backups`：仍使用旧版 `if(ct){check}` 模式，容器不在 DB 时跳过权限 → 已补加 `else if (!isAdmin)` 分支
  - snapshot.js `GET /lxc/:vmid/snapshots`：完全无权限校验，任何用户可查看任意容器快照 → 已补加完整归属校验

---

## [1.7.5-UI-beta29] - 2026-06-11

### Security
- **fix(security): 全面权限审计修复 8 处安全漏洞** — 对全部 11 个路由文件进行完整安全审计，发现并修复 backup.js/snapshot.js/network.js/message.js 中残留的权限缺陷
- **HIGH（4处）**：
  - backup.js: `GET /lxc/:vmid/backups` 和 `POST /lxc/:vmid/backups/:id/restore` 使用旧版 `if(ct){check}` 模式，未分配资源时跳过权限检查 → 统一为 `else if(!isAdmin)` 模式
  - snapshot.js: `GET /lxc/:vmid/snapshots` 和 `GET /vm/:vmid/snapshots` 完全无权限校验 → 新增归属校验 + 管理员放行
- **MEDIUM（3处）**：
  - network.js: `GET /admin/network/config` 缺少 adminMiddleware → 已添加
  - network.js: `POST /port-forwards` 未校验 vm_id/ct_id 归属（IDOR）→ 新增所有权验证
  - network.js: `GET /port-forwards/extract-ips` 返回所有用户设备信息 → 过滤为仅当前用户资源
- **LOW（1处）**：message.js: `PUT /messages/:id/read` 未校验消息归属（IDOR）→ 新增 uid 校验

---

## [1.7.5-UI-beta28] - 2026-06-11

### Fixed
- **fix(lxc): 修复 lxc.js 语法错误导致服务崩溃** — beta27 权限修复时，lxc.js 中 reset-password 和 reset-ip 两个端点的 `const isAdmin = req.user.role === 'admin');` 遗留了多余的 `)` 括号，导致 Node.js SyntaxError 无法启动服务器（生产环境 /root/.pm2/logs/pve-owoser-cn-error.log 报错）
- 涉及文件：server/routes/lxc.js（2处多余括号已移除）

---

## [1.7.5-UI-beta27] - 2026-06-11

### Security
- **fix(security): 修复 VM/LXC 操作端点权限绕过漏洞（高危）** — 14 个端点的权限校验存在逻辑缺陷：当资源（VM/CT）不在数据库中时，`if (vm) / if (ct)` 条件为 false，整个权限检查块被跳过，任何已登录普通用户均可对未入库的 PVE 资源执行 start/stop/reboot/reset-ip/reset-password/status/terminal 等操作
- **修复方案**：统一改为 `if (resource) { check owner } else if (!isAdmin) { return 403 }` 模式，非管理员用户操作未分配资源时返回 403，管理员仍可管理任意 PVE 资源
- **受影响端点**：
  - vm.js (6个): POST start/shutdown/stop/reboot/reset-ip + GET status（status 原完全无权限检查）
  - lxc.js (8个): POST start/shutdown/stop/reboot/terminal/reset-password/reset-ip + GET status（status 原完全无权限检查）
- 涉及文件：server/routes/vm.js, server/routes/lxc.js

---

## [1.7.5-UI-beta26] - 2026-06-11

### Added
- feat(dashboard): **虚拟机/容器列表新增"详情"按钮** — VM 和 CT 操作列首位置新增蓝色"详情"按钮，点击弹出详情监控弹窗。弹窗包含：基本信息卡片（ID/内网IP/硬件配置/操作系统或镜像/运行状态/运行时长）+ 4 个 Chart.js 实时监控图表（CPU使用率、内存使用率、网络流量上行下行、磁盘IO读取写入），运行中实例每 3 秒自动刷新监控数据
- 涉及文件：public/dashboard.html（Chart.js依赖、CSS样式、详情按钮HTML、详情弹窗模板）、public/js/dashboard/core.js（状态/computed/openVmDetail/openLxcDetail/closeVmDetail/initDetailCharts）

---

## [1.7.5-UI-beta25] - 2026-06-11

### Fixed
- fix(api): **检查更新切换 Gitee 后 source 仍显示 github** — 根因：Gitee API 请求失败时后端静默回退到 GitHub 并将 `source` 字段改为 `'github'`。现修复为：`source` 始终保持用户选择的渠道不变，回退时通过新增的 `fallback_note` 字段提示（如"Gitee 不可达，已回退到 GitHub"）
- 涉及文件：server/routes/admin-config.js

---

## [1.7.5-UI-beta24] - 2026-06-11

### Fixed
- fix(ui): **dashboard 管理后台按钮仍不显示（根因：JS 缓存）** — dashboard.html 和 admin.html 的 JS 文件缓存破坏参数 `?v=` 仍是旧日期（20260609），浏览器加载了旧 core.js，新代码从未执行。现统一更新为 `?v=20260611b` 强制刷新。同时增加 console.log 调试输出方便排查
- 涉及文件：public/dashboard.html, public/admin.html, public/js/dashboard/core.js

---

## [1.7.5-UI-beta23] - 2026-06-11

### Fixed
- fix(ui): **dashboard 管理后台按钮不显示** — 根因：仅依赖 Vue watch 控制显示，可能因时序问题未触发。现改为**双重保险**：watch 回调 + onMounted 赋值后立即显式控制 `style.display`，确保管理员登录后按钮一定可见
- 涉及文件：public/js/dashboard/core.js

---

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
