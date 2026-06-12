<div align="center">

# ⚡ PVE 多用户控制面板

**Proxmox VE 多用户管理面板 · 现代化科技风格界面**

[![Version](https://img.shields.io/badge/version-v1.8.0_beta9-8b5cf6?style=flat-square&labelColor=1a1740)](https://github.com/272416939/pve-multi-user-panel)
[![Node](https://img.shields.io/badge/Node.js-18%2B-22c55e?style=flat-square&labelColor=1a1740&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-4fc08d?style=flat-square&labelColor=1a1740&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![SQLite](https://img.shields.io/badge/SQLite-003b57?style=flat-square&labelColor=1a1740&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![MySQL](https://img.shields.io/badge/MySQL-可选-00758f?style=flat-square&labelColor=1a1740&logo=mysql&logoColor=white)](https://www.mysql.com/)
[![Redis](https://img.shields.io/badge/Redis-可选-dc382d?style=flat-square&labelColor=1a1740&logo=redis&logoColor=white)](https://redis.io/)
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square&labelColor=1a1740)](LICENSE)

</div>

---

## 📋 目录

- [✨ 功能特性](#-功能特性)
- [🚀 快速开始](#-快速开始)
- [⚙️ 配置说明](#️-配置说明)
- [🏗️ 项目结构](#️-项目结构)
- [📡 VNC / 终端架构](#-vnc--终端架构)
- [📖 使用说明](#-使用说明)
- [🔄 更新日志](#-更新日志)
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

### 🖥️ 虚拟机 & 容器管理
| # | 功能 | 说明 |
|---|------|------|
| 1 | **多租户系统** | 支持管理员和普通用户角色 |
| 2 | **接入已有虚拟机** | 将 PVE 上现有的虚拟机分配给用户 |
| 3 | **虚拟机到期管理** | 设置到期时间，到期自动关机并发送提醒 |
| 4 | **虚拟机监控** | CPU、内存、网络流量、磁盘 IO 实时监控 |
| 5 | **LXC 容器管理** | 模板创建、分配换绑、重置密码、销毁 |
| 6 | **LXC XtermJS 终端** | SSH + PTY 直连，无需 PVE termproxy 代理 |
| 7 | **LXC 重置 IP** | 手动输入/DHCP/随机三种模式，自动同步绑定 |

### 🔐 安全 & 认证
| # | 功能 | 说明 |
|---|------|------|
| 8 | **JWT 认证** | 无状态 JWT + Refresh Token 自动续期 |
| 9 | **二次验证 (2FA)** | TOTP 双因素认证，支持 Google Authenticator |
| 10 | **权限控制** | 用户仅可见操作已分配的虚拟机/容器 |
| 11 | **全站统一弹窗** | 自定义深色科技风格 Modal 替代原生 alert/confirm |
| 12 | **速率限制** | 登录/2FA/忘记密码/CDK 兑换自动限速，支持 Redis |

### 🛠️ 管理功能
| # | 功能 | 说明 |
|---|------|------|
| 13 | **虚拟机快照管理** | 创建/回滚/删除，配置全局限制（每 VM 上限、每日次数） |
| 14 | **虚拟机备份恢复** | PVE 停止模式 + zstd 压缩，异步轮询进度 |
| 15 | **CDK 兑换码系统** | 批量生成、CSV 导出、指定用户分配、自动通知 |
| 16 | **DHCP 静态绑定** | VM/LXC 分配时自动创建，解绑销毁自动删除 |
| 17 | **端口转发管理** | ikuai 自动同步，随机端口、冲突检查 |

### 📬 消息 & 通知
| # | 功能 | 说明 |
|---|------|------|
| 18 | **站内消息系统** | 系统公告、续费提醒、客服私聊，未读角标 |
| 19 | **SMTP 邮件** | 到期提醒、续费通知、CDK 兑换成功邮件 |
| 20 | **到期提醒** | 自定义多个提醒时间点，持久化不重复发送 |

### 🎨 界面 & 体验
| # | 功能 | 说明 |
|---|------|------|
| 21 | **现代化界面** | 深色科技风格 + 毛玻璃效果 + 霓虹光晕 |
| 22 | **响应式设计** | 适配各种屏幕尺寸 |
| 23 | **极客头像** | 基于用户名自动生成唯一的 SVG 电路板渐变头像 |
| 24 | **导航动态化** | 三页面导航统一通过 API 渲染，角色感知 |

### 🗄️ 基础设施（v1.8.0 新增）
| # | 功能 | 说明 |
|---|------|------|
| 25 | **MySQL 支持** | 可选远程 MySQL 5.7+，自动迁移 SQLite 数据 |
| 26 | **Redis 缓存** | 可选 Redis，速率限制/VNC ticket/提醒追踪持久化 |
| 27 | **异步连接池** | mysql2/promise 10 连接池，自动重连，utf8mb4 编码 |
| 28 | **系统自动更新** | 管理后台检查更新、更新日志、一键更新 |

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- Proxmox VE 服务器（需配置 API Token）
- （可选）MySQL 5.7+ 远程数据库
- （可选）Redis 缓存服务
- （可选）ikuai 软路由 v3.7.21+（用于 DHCP 绑定 + 端口转发同步；4.0 版本暂未测试）

### 安装

```bash
# 克隆仓库
git clone https://github.com/272416939/pve-multi-user-panel.git
cd pve-multi-user-panel

# 安装依赖
npm install

# 创建配置文件
cp .env.example .env
```

### 配置

编辑 `.env` 文件，填写必要的配置项（详见 [配置说明](#️-配置说明)）。

### 运行

```bash
# 生产模式
npm start

# 开发模式（nodemon 自动重启）
npm run dev
```

### 默认账号

> **用户名:** `admin`  
> **密码:** 首次启动时随机生成，控制台输出 ⚠️  
> ⚠️ **首次登录后请立即修改密码！**

---

## ⚙️ 配置说明

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `PVE_HOST` | PVE 服务器地址 | `https://192.168.1.100:8006` |
| `PVE_API_TOKEN` | PVE API 令牌，请使用`root@pam`用户创建，格式`用户@认证域!令牌ID=UUID` | `root@pam!panel=xxxxxxxx-...` |
| `PORT` | 面板服务端口 | `3002` |
| `SITE_URL` | 外部访问域名（反向代理必填） | `https://your-domain.com` |
| `JWT_SECRET` | JWT 签名密钥（生产环境请修改） | — |
| `DEBUG` | 调试日志开关 | `false` |
| `PVE_SSH_HOST` | PVE 宿主机 SSH 地址 | `10.0.0.2` |
| `PVE_SSH_PASSWORD` | PVE root 密码 | — |

### 数据库配置（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_TYPE` | 数据库类型：`sqlite` / `mysql` | `sqlite` |
| `MYSQL_HOST` | MySQL 服务器地址 | — |
| `MYSQL_PORT` | MySQL 端口 | `3306` |
| `MYSQL_USER` | MySQL 用户名 | — |
| `MYSQL_PASSWORD` | MySQL 密码 | — |
| `MYSQL_DATABASE` | MySQL 数据库名 | — |
| `MYSQL_CONNECTION_LIMIT` | 连接池最大连接数 | `10` |

> **注意:** 切换 `DB_TYPE=mysql` 后，系统会自动将 SQLite 数据迁移到 MySQL。已迁移的数据不会重复导入。

### Redis 缓存配置（可选）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `REDIS_HOST` | Redis 服务器地址（留空=禁用） | — |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `REDIS_PASSWORD` | Redis 密码（无密码留空） | — |
| `REDIS_DB` | Redis 数据库编号 | `0` |
| `REDIS_PREFIX` | key 前缀（防与其他应用冲突） | `pve:` |

> **注意:** 不配置 `REDIS_HOST` 时，所有缓存回退到进程内存方案，行为不变。配置后速率限制、VNC ticket、到期提醒追踪将持久化到 Redis。

### ikuai 软路由配置

| 变量 | 说明 | 示例 |
|------|------|------|
| `IKUAI_HOST` | ikuai 软路由地址 | `http://10.10.10.1` |
| `IKUAI_USER` | ikuai 用户名 | — |
| `IKUAI_PASSWORD` | ikuai 密码 | — |

> **注意:** `SITE_URL` 部署在反向代理环境中必填，否则邮件链接会使用内网 IP。ikuai 配置仅后端使用，不会在前端展示。

### PVE API Token 权限要求

| 功能 | 所需权限 |
|------|----------|
| 虚拟机管理 | `VM.Audit`, `VM.Config`, `VM.PowerMgmt` |
| 备份 | `VM.Backup`, `VM.Audit`, `Datastore.Allocate` |
| 快照 | `VM.Snapshot`, `VM.Audit` |
| LXC 管理 | `VM.Audit`, `VM.Config`, `VM.PowerMgmt` |
| VNC/终端 | `VM.Console` |

> **提示：** 请使用 `root@pam` 用户创建 API Token。如果创建时未勾选"特权分离"，则无需单独设置以上权限，Token 自动继承 root 全部权限。

---

## 🏗️ 项目结构

```
.
├── server/
│   ├── server.js              # 入口文件
│   ├── config/
│   │   └── multer.js          # 文件上传配置
│   ├── middleware/
│   │   ├── auth.js            # JWT 认证 + 权限中间件
│   │   └── rate-limiter.js    # 统一速率限制（Redis/内存双模式）
│   ├── utils/                 # 工具模块
│   │   ├── debug.js
│   │   ├── pve-rate.js
│   │   ├── email.js
│   │   ├── token.js
│   │   ├── site-url.js
│   │   └── cdk-generator.js
│   ├── routes/                # 路由模块（11 个）
│   │   ├── auth.js
│   │   ├── user.js
│   │   ├── admin-user.js
│   │   ├── vm.js
│   │   ├── lxc.js
│   │   ├── snapshot.js
│   │   ├── backup.js
│   │   ├── cdk.js
│   │   ├── message.js
│   │   ├── admin-config.js
│   │   └── network.js
│   ├── websocket/
│   │   ├── vnc-proxy.js       # VNC WebSocket 代理
│   │   └── terminal-proxy.js  # xterm.js SSH PTY 代理
│   ├── services/
│   │   ├── expiry-check.js
│   │   ├── backup-polling.js
│   │   ├── ikuai-sync.js
│   │   └── dhcp.js
│   ├── schedule/
│   │   └── tasks.js           # 定时任务
│   └── api/
│       ├── db.js              # 数据库工厂（SQLite/MySQL 自动选择）
│       ├── db-sqlite.js       # SQLite 驱��
│       ├── db-mysql.js        # MySQL 驱动（mysql2/promise 连接池）
│       ├── redis.js           # Redis 缓存客户端（可选）
│       ├── pve-api.js         # PVE REST API 封装
│       ├── ikuai-api.js       # ikuai API 封装
│       └── ssh-exec.js        # SSH 执行工具
├── data/
│   └── pve-panel.db           # SQLite 数据库（自动生成）
├── images/                    # 头像存储（自动创建）
├── public/
│   ├── login.html             # 登录页
│   ├── dashboard.html         # 用户仪表盘
│   ├── admin.html             # 管理后台
│   ├── user-center.html       # 用户中心
│   ├── vnc.html               # VNC 控制台
│   ├── terminal.html          # xterm.js 终端
│   ├── css/                   # 样式文件（5 个）
│   ├── js/
│   │   ├── shared.js          # 公共函数
│   │   ├── admin/             # 5 个管理后台模块
│   │   └── dashboard/         # 5 个用户面板模块
│   └── novnc/                 # noVNC 库
├── .env.example               # 配置模板
└── package.json
```

---

## 📡 VNC / 终端架构

### VNC 架构

```
用户浏览器 ──→ 面板服务器 (443) ──→ PVE (内网 8006)
                    │
            ┌───────┴───────┐
            │  noVNC 库     │ WebSocket (wss://)
            │  WebSocket 代理│──→ PVE vncwebsocket
            └───────────────┘
```

所有 VNC 流量经由面板服务器中转，PVE 内网地址不暴露到公网。VNC ticket 校验支持 Redis 持久化（配置后 5 分钟 TTL），解决进程重启后 ticket 失效问题。

### LXC XtermJS 终端架构

```
用户浏览器 ──→ 面板服务器 (443) ──→ PVE 宿主机 (22 SSH)
                    │
            ┌───────┴───────┐
            │  xterm.js     │ WebSocket (wss://)
            │  SSH + PTY    │──→ lxc-console
            │  conn.exec()  │
            └───────────────┘
```

完全绕过 PVE termproxy 代理层，SSH `conn.exec()` 直接启动 `lxc-console`，宿主机提示符对用户不可见。

---

## 📖 使用说明

### 管理员功能

登录后可看到以下标签页：

| 标签页 | 功能 |
|--------|------|
| **虚拟机管理** | 查看/分配 VM，电源控制，VNC，快照，备份，编辑 |
| **LXC 容器管理** | 模板创建，分配/换绑，电源控制，终端，重置密码，销毁 |
| **用户管理** | 创建/编辑/删除用户，邮箱管理，2FA 管理 |
| **分配管理** | 将 VM/LXC 分配给用户，设置到期时间、续费价格 |
| **网络管理** | 端口转发配置，DHCP 配置，ikuai 接口同步 |
| **SMTP 配置** | 邮件服务器，到期提醒天数，备份快照配置 |
| **CDK 管理** | 生成/分发/导出 CDK 兑换码 |
| **消息管理** | 全体推送/指定用户发送站内消息 |
| **系统更新** | 检查更新、查看更新日志、一键更新 |

### 普通用户功能

| 标签页 | 功能 |
|--------|------|
| **我的虚拟机** | 查看/操作 VM，VNC，端口转发，CDK 兑换续费 |
| **我的 LXC 容器** | 查看/操作 LXC，终端，端口转发，重置密码 |
| **用户中心** | 头像/邮箱/密码，2FA 设置，备忘录，消息管理 |

### 端口转发

VM 和 LXC 管理区域各有一个「网络」子标签页，用于管理端口转发规则：
- 分页列表展示，每页 20 条
- 添加/编辑/删除（管理员可批量删除）
- 随机端口、端口冲突检查
- 同步状态标记（已同步/孤立马/待同步/失败）

### 到期管理

- 系统每 5 分钟检查到期 VM/LXC
- 到期前按配置天数发送提醒邮件（默认 7/3/1 天前）
- 到期后自动关机，续费提醒每日 1 次，最多 3 天
- 提醒持久化到数据库/Redis，重启不重复发送

### MySQL 模式

```bash
# .env 中设置
DB_TYPE=mysql
MYSQL_HOST=10.0.0.16
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=pve_panel
```

首次启动时自动从 SQLite 迁移所有数据到 MySQL（使用 ON DUPLICATE KEY UPDATE 安全插入）。字符集统一为 utf8mb4，完美支持 emoji。

### Redis 缓存

```bash
# .env 中设置
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# REDIS_PASSWORD=  # 无密码则留空
REDIS_DB=0
REDIS_PREFIX=pve:
```

配置后生效的数据类别：
- **速率限制**: 登录/2FA/忘记密码/CDK 限制计数器持久化，重启不丢失
- **VNC Ticket**: 5 分钟 TTL 自动过期
- **到期提醒**: 24 小时去重，防止重复邮件

---

## 💻 宝塔部署

### 部署步骤

1. 上传文件到项目目录（注意保留 `.env`、`data/`、`images/`）
2. 进入项目目录执行 `npm install`
3. 在宝塔 Node.js 版本管理器中重启项目

### 注意事项

- 不要删除或覆盖 `.env` 文件
- 不要删除 `data/` 目录和数据库文件
- 更新前端 JS 模块后需清除 Nginx 反向代理缓存
- 切换 MySQL 模式前建议备份 `data/pve-panel.db`

---

## 🔄 手动更新

当「系统更新」功能无法使用时，SSH 进入项目目录执行：

```bash
git fetch origin && git reset --hard origin/main && npm install --production
```

然后重启服务（PM2 / systemd / 手动重启均可）。

> 如需回滚：`git reflog` 查找旧 commit hash，`git reset --hard <hash>` 回滚。

---

## 🔄 更新日志

<details>
<summary><b>v1.8.0-beta9</b> (2026-06-12) — Redis 缓存层</summary>

**新特性：**
- ✅ 可选 Redis 缓存：5 个独立环境变量配置（HOST/PORT/PASSWORD/DB/PREFIX）
- ✅ 未配置时自动回退进程内存，零破坏性兼容
- ✅ 速率限制/VNC ticket/到期提醒追踪迁移到 Redis
- ✅ 新增 `server/api/redis.js` + `server/middleware/rate-limiter.js`
- ✅ ioredis 连接池，失败自动降级到内存模式

**涉及文件：**
`package.json` · `server/api/redis.js`（新增）· `server/middleware/rate-limiter.js`（新增）· `.env.example` · `server/server.js` · `server/routes/auth.js` · `server/routes/cdk.js` · `server/routes/vm.js` · `server/routes/lxc.js` · `server/websocket/vnc-proxy.js` · `server/services/expiry-check.js`

</details>

<details>
<summary><b>v1.8.0-beta8</b> (2026-06-12) — SQLite bio 白名单修复</summary>

**修复：**
- ✅ db-sqlite.js `users.update` 白名单补入 `bio` 列，与 MySQL 版本对齐

**涉及文件：**
`package.json` · `server/api/db-sqlite.js`

</details>

<details>
<summary><b>v1.8.0-beta7</b> (2026-06-12) — await 补全修复</summary>

**修复：**
- ✅ 7 个路由/服务文件 57 处 db 调用补全 await（修复 `forwardRules.slice` 报错）

**涉及文件：**
`server/routes/network.js` · `server/routes/message.js` · `server/routes/backup.js` · `server/routes/admin-config.js` · `server/routes/snapshot.js` · `server/api/ikuai-api.js` · `package.json`

</details>

<details>
<summary><b>v1.8.0-beta6</b> (2026-06-12) — MySQL 异步连接池 + 审计修复</summary>

**核心变更：**
- ✅ sync-mysql 单连接 → mysql2/promise 异步连接池（10 连接，utf8mb4）
- ✅ 23 个路由/中间件/服务文件同步改 async/await
- ✅ 修复 7 个安全审计漏洞：is_active 列缺失、白名单错误、crypto 兼容性等

**涉及文件：**
`package.json` · `server/api/db-mysql.js` · `server/api/db-sqlite.js` · `server/api/db.js` · `server/routes/*` · `server/middleware/auth.js` · `server/services/*` · `server/utils/*`

</details>

<details>
<summary><b>v1.8.0-beta5</b> (2026-06-12) — 迁移性能优化</summary>

**优化：**
- ✅ 迁移专用裸查询（无重试避免雪崩）+ 批量多行 INSERT（每批 50 行）
- ✅ 迁移后延迟 2 秒重建连接，连接数降低 95%+

**涉及文件：**
`package.json` · `server/api/db-mysql.js`

</details>

<details>
<summary><b>v1.8.0-beta1~4</b> (2026-06-11) — MySQL 数据库支持</summary>

**新特性：**
- ✅ 新增 `DB_TYPE=mysql` 支持，SQLite 自动迁移
- ✅ 数据库工厂层 `db.js`，路由透明切换
- ✅ 修复 charset/连接恢复/重复键冲突等迁移问题

**涉及文件：**
`server/api/db.js`（新增）· `server/api/db-mysql.js`（新增，1561 行）· `server/schedule/tasks.js`（新增）· 18 个路由/服务文件统一 `require('../api/db')`

</details>

<details>
<summary><b>v1.7.4</b> (2026-06-09) — CDK 表单输入框高度统一</summary>

**优化：**
- ✅ 所有输入框统一使用 form-control-sm，高度一致（31px）
- ✅ 标签输入框新增 sm 紧凑变体，与其他输入框对齐

**涉及文件：**
`package.json` · `public/admin.html` · `public/css/components.css`

</details>

<details>
<summary><b>v1.7.0 ~ v1.7.3</b> (2026-06-09) — 系统更新优化</summary>

- ✅ CDK 表单布局优化、更新源选择器、版本号显示修复

</details>

<details>
<summary><b>v1.6.0 ~ v1.6.9</b> (2026-06-07~09) — 自动更新 + 模块化重构</summary>

- ✅ 后端架构重构：5766 行 → 11 个模块
- ✅ 前端 CSS/JS 模块化拆分
- ✅ 自动更新系统：检查/日志/一键更新
- ✅ Gitee 国内源支持

</details>

<details>
<summary><b>v1.5.0</b> (2026-06-06) — LXC 容器管理</summary>

- ✅ LXC 完整 CRUD：创建/分配/操作/销毁
- ✅ LXC XtermJS 终端：SSH + PTY 直连 `lxc-console`
- ✅ LXC 快照/备份/CDK 续费 + 到期检查

</details>

<details>
<summary><b>v1.0.0 ~ v1.4.1</b> (2026-05~06) — 核心功能</summary>

- ✅ 多租户系统、虚拟机管理、VNC 控制台
- ✅ JWT 认证 + Refresh Token + 2FA
- ✅ CDK 兑换码、站内消息、SMTP 邮件
- ✅ 快照管理、备份恢复、DHCP 静态绑定、端口转发

</details>

---

## 📄 许可证

本项目基于 **MIT License** 开源。详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star！**

</div>
