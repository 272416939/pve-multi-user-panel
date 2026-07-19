<div align="center">

# ⚡ PVE 多用户控制面板

**Proxmox VE 多用户管理面板 · 现代化科技风格界面**

[![Version](https://img.shields.io/badge/version-v2.32.3-8b5cf6?style=flat-square&labelColor=1a1740)](https://github.com/272416939/pve-multi-user-panel)
[![Node](https://img.shields.io/badge/Node.js-18%2B-22c55e?style=flat-square&labelColor=1a1740&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-4fc08d?style=flat-square&labelColor=1a1740&logo=vue.js&logoColor=white)](https://vuejs.org/)
[![MySQL](https://img.shields.io/badge/MySQL-5.7%2B-00758f?style=flat-square&labelColor=1a1740&logo=mysql&logoColor=white)](https://www.mysql.com/)
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
- [📄 许可证](#-许可证)

---

## ✨ 功能特性

### 🖥️ 虚拟机 & 容器管理
| # | 功能 | 说明 |
|---|------|------|
| 1 | **多租户系统** | 支持管理员和普通用户角色 |
| 2 | **接入已有虚拟机** | 将 PVE 上现有的虚拟机分配给用户 |
| 3 | **虚拟机到期管理** | 设置到期时间，到期自动关机并发送提醒 |
| 4 | **实时状态监控** | CPU、内存、网络流量、磁盘 IO 3秒 WebSocket 推送（零 HTTP 轮询） |
| 5 | **LXC 容器管理** | 模板创建、分配换绑、重置密码、销毁 |
| 6 | **LXC XtermJS 终端** | SSH + PTY 直连，无需 PVE termproxy 代理 |
| 7 | **LXC 重置 IP** | 手动输入/DHCP/随机三种模式，自动同步绑定 |
| 8 | **VM Cloud-init 密码** | 订购时自动生成随机密码（站内信+邮件），支持重置密码 |

### 🔐 安全 & 认证
| # | 功能 | 说明 |
|---|------|------|
| 9 | **JWT 认证** | 无状态 JWT + Refresh Token 自动续期 |
| 10 | **二次验证 (2FA)** | TOTP 双因素认证，支持 Google Authenticator |
| 11 | **权限控制** | 用户仅可见操作已分配的虚拟机/容器 |
| 12 | **全站统一弹窗** | 自定义深色科技风格 Modal 替代原生 alert/confirm |
| 13 | **速率限制** | 登录/2FA/忘记密码/CDK 兑换自动限速，支持 Redis |

### 🛠️ 管理功能
| # | 功能 | 说明 |
|---|------|------|
| 14 | **虚拟机快照管理** | 创建/回滚/删除，配置全局限制（每 VM 上限、每日次数） |
| 15 | **虚拟机备份恢复** | PVE 停止模式 + zstd 压缩，异步轮询进度 |
| 16 | **CDK 兑换码系统** | 批量生成、CSV 导出、指定用户分配、自动通知 |
| 17 | **DHCP 静态绑定** | VM/LXC 分配时自动创建，解绑销毁自动删除 |
| 18 | **端口转发管理** | ikuai 自动同步，随机端口、冲突检查 |
| 19 | **套餐库存管理** | 可选销售库存上限，售罄自动禁用，支持补货 |

### 📬 消息 & 通知
| # | 功能 | 说明 |
|---|------|------|
| 20 | **站内消息系统** | 系统公告、续费提醒、客服私聊，未读角标 WS 实时推送 |
| 21 | **SMTP 邮件** | 到期提醒、续费通知、CDK 兑换成功邮件 |
| 22 | **到期提醒** | 自定义多个提醒时间点，持久化不重复发送 |

### 🎨 界面 & 体验
| # | 功能 | 说明 |
|---|------|------|
| 23 | **现代化界面** | 深色科技风格 + 毛玻璃效果 + 霓虹光晕 |
| 24 | **响应式设计** | 适配各种屏幕尺寸 |
| 25 | **极客头像** | 基于用户名自动生成唯一的 SVG 电路板渐变头像 |
| 26 | **导航动态化** | 三页面导航统一通过 API 渲染，角色感知 |
| 27 | **套餐排序** | 自定义排序值，数字越小排越前 |
| 28 | **套餐自定义字段** | CPU 型号、带宽 (Mbps) 可配置 |
| 29 | **套餐备注 Markdown** | 备注支持 Markdown 语法渲染 |

### 💰 支付 & 交易（v2.0 新增）
| # | 功能 | 说明 |
|---|------|------|
| 30 | **在线充值** | 支付宝/微信支付，V1 MD5 + V2 RSA 签名双模式 |
| 31 | **余额续费** | 余额抵扣 VM/LXC 续费，支持月/年付 |
| 32 | **交易流水** | 完整支付记录，支付流水号（transaction_id）、类型、金额 |
| 33 | **支付配置** | 支付网关 PID/密钥/开关独立管理 |

### ⚡ 性能优化（v1.8.0-beta21~23）
| # | 功能 | 说明 |
|---|------|------|
| 34 | **WS 状态推送** | VM/LXC CPU/内存/网络 3s 实时推送，替代 HTTP 整表轮询 |
| 35 | **WS 监控图表** | 详情弹窗 4 组 Chart.js 图表通过 subscribe-detail 推送，消灭 3s HTTP 请求 |
| 36 | **进程内 TTL 缓存** | profile(60s) + unread-count(10s) + PVE 状态(5s) 缓存，减少 DB/PVE 调用 |
| 37 | **备份进度 WS 推送** | 备份/恢复完成后 pushToUser 实时通知，消灭 10s 前端轮询 |
| 38 | **PVE 状态复用** | GET /user/vms 和 /user/lxc 优先命中 pushStatus 缓存，PVE API 调用减半 |

### 💾 数据盘管理（v2.32.0 新增）
| # | 功能 | 说明 |
|---|------|------|
| 45 | **数据盘购买** | 用户自助购买 NVME/SATA/HDD/U2 数据盘，挂载到 VM |
| 46 | **数据盘续费** | 独立计费周期（月/季/年），自动续费开关 |
| 47 | **数据盘扩容** | 随时扩容，按新容量价差收费，扩容部分独立计费 |
| 48 | **数据盘挂载/卸载** | 统一使用 SCSI 总线（支持热插拔，VM 运行中即可挂载/卸载），自动注入 QoS 限速参数 |
| 49 | **存量磁盘导入** | 管理员手动扫描 PVE 中未管理的存量数据盘并导入台账 |
| 50 | **Legacy 磁盘标识** | 导入的存量磁盘标记为 `legacy`，随 VM 计费，不独立续费 |
| 51 | **数据盘管理（Admin）** | 管理后台查看/编辑/销毁所有用户数据盘，支持存储分组和规格管理 |

### 🗄️ 基础设施（v1.8.0 新增）
| # | 功能 | 说明 |
|---|------|------|
| 52 | **MySQL 数据库** | MySQL 5.7+ 唯一驱动，utf8mb4 编码，自动建表迁移 |
| 53 | **Redis 缓存** | 可选 Redis，速率限制/VNC ticket/提醒追踪持久化 |
| 54 | **异步连接池** | mysql2/promise 10 连接池，自动重连，utf8mb4 编码 |
| 55 | **系统自动更新** | 管理后台检查更新、更新日志、一键更新 |
| 56 | **EJS 模板缓存** | 编译后缓存在内存，`NODE_ENV=production` 自动启用 |
| 57 | **Gzip 压缩** | compression 中间件，所有响应压缩 60-80% |
| 58 | **资源预加载** | preconnect / dns-prefetch / script defer 优化首屏加载 |

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
> **密码:** 首次启动时随机生成 16 位强密码，**在控制台输出一次**（仅首次创建时显示）  
> 如需自定义初始密码，可在 `.env` 中设置 `DEFAULT_ADMIN_PASSWORD` 变量  
> ⚠️ **首次登录后请立即修改密码！**（首登已强制改密）

---

## ⚙️ 配置说明

### 环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `PORT` | 面板服务端口 | `3002` |
| `SITE_URL` | 外部访问域名（反向代理必填） | `https://your-domain.com` |
| `JWT_SECRET` | JWT 签名密钥（生产环境请修改） | — |
| `NODE_ENV` | 运行环境，留空自动设为 `production` | `production` |
| `DEBUG` | 调试日志开关 | `false` |
> **PVE 节点配置**（API 地址、Token、SSH 连接）已迁移到面板内管理，首次部署后在 **管理后台 > 系统设置 > PVE节点设置** 中配置。Token 和 SSH 密码使用 AES-256-GCM 加密存储。

### 数据库配置（必填）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `MYSQL_HOST` | MySQL 服务器地址 | — |
| `MYSQL_PORT` | MySQL 端口 | `3306` |
| `MYSQL_USER` | MySQL 用户名 | — |
| `MYSQL_PASSWORD` | MySQL 密码 | — |
| `MYSQL_DATABASE` | MySQL 数据库名 | — |
| `MYSQL_CONNECTION_LIMIT` | 连接池最大连接数 | `10` |

> **注意:** 系统仅支持 MySQL 5.7+，启动时自动建表和迁移字段。字符集统一为 utf8mb4，完美支持 emoji。

### Redis 缓存配置

Redis 配置已迁移到面板管理后台，在 **系统设置 > 站点设置 > Redis 缓存配置** 中配置。密码使用 AES-256-GCM 加密存储。

> **注意:** 留空 Redis 地址时禁用 Redis，所有缓存回退到进程内存，行为不变。配置后速率限制、VNC ticket、到期提醒追踪将持久化到 Redis。

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
│   ├── server.js              # 入口文件（Express + EJS + WS 升级）
│   ├── config/
│   │   └── multer.js          # 文件上传配置
│   ├── middleware/
│   │   ├── auth.js            # JWT 认证 + 权限中间件（算法固定 HS256）
│   │   └── rate-limiter.js    # 统一速率限制（Redis/内存双模式）
│   ├── utils/                 # 工具模块
│   │   ├── debug.js
│   │   ├── pve-rate.js
│   │   ├── cache.js           # TTL Map 进程内缓存
│   │   ├── cache-store.js     # Redis/内存双模式缓存存储
│   │   ├── console-session.js # VNC/终端一次性 session 管理
│   │   ├── email.js           # 邮件发送（createEmailTemplate 统一模板）
│   │   ├── token.js
│   │   ├── token-store.js     # refresh token 持久化
│   │   ├── site-url.js
│   │   ├── cdk-generator.js
│   │   ├── order-utils.js     # 订购工具（扣余额/计算金额/affinity）
│   │   ├── date.js            # 时区/格式化工具
│   │   ├── random-name.js     # VM/LXC 随机名称
│   │   ├── safe-error.js      # 统一错误脱敏（safeError）
│   │   ├── username-blacklist.js
│   │   ├── crypto-utils.js    # AES-256-GCM 加密工具（JWT_SECRET 派生等）
│   │   ├── disk-utils.js      # 💾 磁盘操作工具（创建/销毁/扩容/挂载/卸载/QoS）
│   │   ├── logger.js          # 统一日志工具
│   │   ├── password-hash.js   # bcryptjs 密码哈希
│   │   └── with-transaction.js # MySQL 事务封装
	│   ├── routes/                # 路由模块（18 个）
	│   │   ├── auth.js            # 认证 + 2FA + 忘记密码
	│   │   ├── user.js            # 用户中心 + 2FA + 设备 + Push ticket
	│   │   ├── admin-user.js      # 用户管理
	│   │   ├── vm.js              # VM 管理
	│   │   ├── lxc.js             # LXC 管理
	│   │   ├── snapshot.js        # 快照
	│   │   ├── backup.js          # 备份恢复
	│   │   ├── cdk.js             # CDK 兑换码
	│   │   ├── wallet.js          # 充值/续费/交易流水 + 支付回调
	│   │   ├── admin-wallet.js    # 管理后台交易流水/CSV 导出
	│   │   ├── message.js         # 站内消息
	│   │   ├── admin-config.js    # 系统配置（SMTP/到期/快照/支付等）
	│   │   ├── network.js         # 端口转发 + DHCP + ikuai 同步
	│   │   ├── package.js         # VM/LXC 套餐订购
	│   │   ├── template.js        # VM/LXC 模板管理
	│   │   ├── ikuai.js           # ikuai MAC 分组
	│   │   ├── disk.js            # 💾 用户侧数据盘 CRUD（购买/挂载/卸载/扩容/销毁/续费）
	│   │   └── admin-disk.js      # 💾 管理后台数据盘/存储分组/规格/生命周期管理
	│   ├── websocket/
	│   │   ├── vnc-proxy.js       # VNC WebSocket 代理（ticket + Redis 校验）
	│   │   ├── terminal-proxy.js  # xterm.js SSH PTY 代理（JWT HS256 固定）
	│   │   └── push-proxy.js      # 统一状态推送（未读角标/实时监控/备份进度）
	│   ├── services/
	│   │   ├── expiry-check.js    # 到期检查与提醒
	│   │   ├── backup-polling.js  # 备份/恢复进度轮询
	│   │   ├── ikuai-sync.js      # ikuai 定时同步
	│   │   ├── dhcp.js            # DHCP 静态绑定工具
	│   │   └── disk-expiry-check.js # 💾 磁盘到期巡检（预警/宽限期/停机分离/销毁回收）
	│   ├── schedule/
	│   │   └── tasks.js           # 定时任务
	│   ├── api/
	│   │   ├── db.js              # 数据库模块（MySQL 驱动加载）
	│   │   ├── db-mysql.js        # MySQL 驱动（mysql2/promise 连接池 + 列名白名单）
	│   │   ├── redis.js           # Redis 缓存客户端（可选）
	│   │   ├── pve-api.js         # PVE REST API 封装
	│   │   ├── ikuai-api.js       # ikuai API 封装
	│   │   └── ssh-exec.js        # SSH 执行工具（vmid 白名单 + stdin 传密码）
	│   └── sdk/
	│       ├── ikuai-sdk/         # ikuai SDK（ikuai-sdk.js + ikuai-sdk.mjs）
	│       └── pay/               # 支付网关 SDK（V1 MD5 + V2 RSA）
├── views/                     # EJS 模板（服务端渲染）
│   ├── partials/
│   │   ├── header.ejs         # 统一顶栏（品牌/刷新/主题/消息/用户菜单）
│   │   ├── sidebar-admin.ejs  # admin 侧边栏
│   │   ├── sidebar-dashboard.ejs  # dashboard 侧边栏
│   │   └── sidebar-user-center.ejs # user-center 侧边栏
│   └── pages/
│       ├── admin.ejs          # 管理后台
│       ├── dashboard.ejs      # 用户仪表盘
│       ├── user-center.ejs    # 用户中心
│       ├── login.ejs          # 登录页（独立结构，无侧边栏）
│       ├── vnc.ejs            # VNC 控制台（全屏独立样式）
│       └── terminal.ejs       # xterm.js 终端（全屏独立样式）
├── images/                    # 头像存储（自动创建）
├── public/
│   ├── css/                   # 页面业务 CSS
│   │   ├── admin.css
│   │   ├── dashboard.css
│   │   ├── login.css
│   │   └── user-center.css
│   ├── shared/css/            # 共享 CSS 层（按层叠顺序加载）
│   │   ├── tokens.css         # CSS 变量定义（:root + [data-theme]）
│   │   ├── layout.css         # 通用布局（sidebar/header/main-wrap/响应式）
│   │   ├── components.css     # 通用组件（btn-glass/table/modal/card/badge）
│   │   ├── pv-buttons.css     # Web Component 按钮样式补充
│   │   └── theme.css          # 主题适配（[data-theme="dark/light"] 覆盖）
│   ├── components/            # Web Components（8 个 pv-* 自定义元素）
│   │   ├── pv-button.js       # 按钮（variant/size/disabled）
│   │   ├── pv-button-v2.js    # 按钮 v2（增强变体）
│   │   ├── pv-badge.js        # 徽标
│   │   ├── pv-card.js         # 卡片
│   │   ├── pv-modal.js        # 模态框
│   │   ├── pv-table.js        # 表格
│   │   ├── pv-dropdown.js     # 下拉菜单
│   │   └── pv-toast.js        # 通知
│   ├── js/
│   │   ├── shared.js          # 公共函数 + PushClient WebSocket
│   │   ├── theme-init.js      # 主题初始化（所有页面共用）
│   │   ├── app-version.js     # 版本号获取
│   │   ├── index-redirect.js  # 首页重定向
│   │   ├── login-page.js      # 登录页 Vue 应用
│   │   ├── login-template.js  # 登录页模板
│   │   ├── user-center-page.js# 用户中心 Vue 应用
│   │   ├── user-center-template.js # 用户中心模板
│   │   ├── terminal-standalone.js # xterm.js 终端独立逻辑
│   │   ├── terminal-keyboard.js    # 终端快捷键捕获（复制/粘贴/透传）
│   │   ├── terminal-shortcuts-help.js # 终端快捷键说明 modal
│   │   ├── lib/               # 第三方库（DOMPurify）
│   │   ├── admin/             # 管理后台模块（core/admin/vm/lxc/network/update/package/template/disk + admin-template-* 拆分模块）
│   │   └── dashboard/         # 用户面板模块（core/vm/lxc/forward/message/disk + dashboard-template-*）
│   └── novnc/                 # noVNC 库
├── test/                      # Mocha + Chai 测试
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

### WebSocket 推送架构

```
用户浏览器 ──→ 面板服务器 (443) ──→ PVE / 数据库
                    │
            ┌───────┴──────────────┐
            │  统一推送通道          │ wss://host/ws/push
            │  JWT ticket (5min)    │
            │  ping/pong 心跳(30s)  │
            ├───────────────────────┤
            │  status(3s)           │ CPU/内存/网络/磁盘实时推送
            │  subscribe-detail     │ 详情弹窗 4 组图表 WS 渲染
            │  unread(30s)          │ 未读消息角标主动推送
            │  tick(60s)            │ 列表兜底刷新（名称/IP 变更）
            │  backup-done/restore  │ 备份/恢复完成即时通知
            └───────────────────────┘
```

六合一 WebSocket 通道替代 5 路 HTTP 轮询。前端 [shared.js](file:///e:/code/pve管理面板/public/js/shared.js) `initPushClient(onMessage, onOpen)` 自动断线重连，`subscribe` 队列确保重连后重新订阅。服务端 [push-proxy.js](file:///e:/code/pve管理面板/server/websocket/push-proxy.js) 通过 `pushToUser` 支持定向推送。

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
| **财务管理** | 交易流水查询/CSV 导出，支付网关配置（PID/密钥/开关） |
| **网络管理** | 端口转发配置，DHCP 配置，ikuai 接口同步 |
| **SMTP 配置** | 邮件服务器，到期提醒天数，备份快照配置 |
| **CDK 管理** | 生成/分发/导出 CDK 兑换码 |
| **消息管理** | 全体推送/指定用户发送站内消息 |
| **硬盘设置** | 💾 **存储分组/规格管理、生命周期配置、数据盘管理（查看/编辑/销毁/导入存量磁盘）** |
| **系统更新** | 检查更新、查看更新日志、一键更新 |

### 普通用户功能

| 标签页 | 功能 |
|--------|------|
| **我的虚拟机** | 查看/操作 VM，VNC，端口转发，CDK 兑换续费 |
| **我的 LXC 容器** | 查看/操作 LXC，终端，端口转发，重置密码 |
| **硬盘管理** | 💾 购买/挂载/卸载/扩容/续费数据盘，支持按规格选购 |
| **用户中心** | 头像/邮箱/密码，2FA 设置，备忘录，消息管理 |
| **账户余额** | 支付宝/微信在线充值，余额续费，交易明细查询 |

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

### 💾 数据盘管理（Admin 硬盘设置）

<details>
<summary><strong>⚠️ 必须操作：创建中转虚拟机（VMID 9999）</strong></summary>

**数据盘管理系统必须依赖 VMID 9999 的中转虚拟机才能正常工作，这是强制性要求，非可选。**

系统使用 PVE 的 `pvesm alloc` 命令创建游离磁盘，该命令要求传入一个真实存在的 VMID 作为参数（PVE 内部会创建 `vm-{vmid}-disk-{rand}` 格式的卷名）。PVE **不允许传 `0` 或任意值，必须是一个真实存在的 VM ID**。

**中转虚拟机要求：**
- **VMID：必须为 `9999`**（硬编码，不可修改）
- **状态：** 可以关机或开机（pvesm alloc 不需要 VM 运行）
- **资源：** 极低，最小配置即可（1 核、128MB 内存、无系统盘）
- **用途：** 仅作为创建磁盘卷时的 ID 占位符 + 扩容游离磁盘时的临时挂载点

**为什么需要中转 VM？**
1. **创建磁盘：** `pvesm alloc <storage> <vmid> <volname> <size>` → VMID 必须真实存在
2. **扩容游离磁盘：** 暂挂到中转 VM 的 `scsi30` 位置 → `qm resize` → 自动卸载
3. **PVE 硬性要求：** `pvesm alloc` 的 vmid 传 `0` 会报错，传不存在的 VMID 也会报错

**创建中转 VM（部署后第一步）：**
```bash
# SSH 到 PVE 节点
qm create 9999 --name "disk-transfer-vm" --memory 128 --cores 1
```

> **注意：** 中转 VM 无需安装操作系统，不会产生实际资源占用。**如果不创建 VMID 9999，数据盘购买和扩容功能将无法使用。**

</details>

#### 存储分组管理

管理员可在「硬盘设置 > 存储分组管理」中创建/编辑/删除存储分组（如 NVME-A、SATA-B），用于对磁盘类型进行分类。

#### 硬盘规格管理

管理员可在「硬盘设置 > 硬盘规格管理」中配置磁盘规格：
- 类型（NVME/SATA/HDD/U2）、存储分组绑定
- 容量范围、单价、季付/年付折扣
- QoS 限速参数（MBPS/IOPS 读写限速及突发峰值）
- 存储池关联（展示实时容量使用率）

#### 生命周期配置

管理员可在「硬盘设置 > 生命周期参数配置」中设置：
- 预警提前天数、宽限期时长
- 优雅关机超时、保留期时长
- 自动续费提前天数
- 预警/宽限期提醒频率

#### 数据盘管理（Admin）

管理员可在「硬盘设置 > 数据盘管理」中：
- **查看：** 所有用户的数据盘列表（ID/用户/名称/存储分组/规格/容量/状态/绑定VM/到期时间）
- **编辑：** 修改磁盘名称、存储分组、规格
- **销毁：** 3 天内全额退款，超过 3 天按剩余时间比例退款（不受 15 天限制，详见 [退款规则](#退款规则)）
- **导入存量磁盘：** 扫描 PVE 中未管理的存量数据盘，自动匹配规格并导入台账（标记为 `legacy`，随 VM 续费）

#### 用户硬盘管理

用户可在仪表盘「硬盘管理」中：
- **购买：** 选择规格/容量/周期，余额支付
- **挂载：** 将空闲磁盘挂载到自己的 VM（SCSI 总线热插拔，VM 运行中即可挂载），自动注入 QoS 限速
- **卸载：** 从 VM 卸载磁盘
- **扩容：** 随时扩容，按价差收费
- **续费：** 月/季/年续费，支持自动续费
- **销毁：** 按订单分单退款（3 天内全额、3-15 天按剩余比例、超过 15 天不退，详见 [退款规则](#退款规则)）

> **Legacy 磁盘说明：** 通过「导入存量磁盘」导入的磁盘标记为 `(随VM)`，不参与独立计费和续费，到期时间随绑定 VM 同步。VM 被移除时，legacy 磁盘台账自动删除（PVE 磁盘保留，可重新导入）。

#### 退款规则

磁盘退款并非独立功能，而是「销毁磁盘」动作的副产物。系统对每笔历史订单（购买 / 扩容 / 续费）**逐单计算退款金额**后求和，不按磁盘整体计算。

##### 触发场景

| # | 场景 | 触发入口 | 退款规则 |
|---|------|----------|----------|
| 1 | 用户销毁磁盘 | `POST /api/disks/:id/destroy` | ≤3 天全额；3-15 天按剩余时间比例；>15 天不退 |
| 2 | 管理员销毁磁盘 | `POST /api/admin/disks/:id/destroy` | ≤3 天全额；>3 天按剩余时间比例（**不受 15 天限制**） |
| 3 | 购买失败回滚 | `pvesm alloc` 创建卷失败 | 全额回滚该笔订单金额 |
| 4 | 扩容失败回滚 | `qm resize` 扩容失败 | 全额回滚扩容差价并恢复容量 |

##### 退款公式（按订单分单计算）

对每笔 `type='disk'` 且 `status='completed'` 的历史订单，计算如下：

```text
orderDays   = floor((now - order.created_at) / 86400000)        // 订单创建至今的天数
totalMs     = disk.expire_time - order.created_at                // 订单覆盖的总时长
remainingMs = disk.expire_time - now                            // 剩余未使用时长
factor      = remainingMs / totalMs                             // 剩余时间比例
orderRefund = round2(orderPaid * factor)                        // 单笔退款金额

refundAmount = Σ orderRefund                                     // 退款总额
```

**用户销毁**（受 15 天截止）：

| orderDays | 退款计算 |
|-----------|----------|
| ≤ 3 天 | `orderRefund = orderPaid`（全额退） |
| 3-15 天 | `orderRefund = round2(orderPaid * factor)`（仅当 `factor > 0`） |
| > 15 天 | `orderRefund = 0`（不退） |

**管理员销毁**（无 15 天截止）：

| orderDays | 退款计算 |
|-----------|----------|
| ≤ 3 天 | `orderRefund = orderPaid`（全额退） |
| > 3 天 | `orderRefund = round2(orderPaid * factor)`（仅当 `remainingMs > 0`，按剩余时间比例退） |

> **退款基数：** `orderPaid = order.amount`（订单实付金额，**已含季付/年付折扣**），退款时不重新计价、不重新调用定价函数。

##### 落库流程（事务 + 行锁）

销毁退款在 `withTransaction` + `SELECT ... FOR UPDATE` 行锁中执行，保证并发安全：

```text
1. SELECT * FROM disks WHERE id = ? FOR UPDATE        // 行锁防并发
2. diskUtils.destroyDisk(volume_id)                   // PVE 执行 pvesm free 释放卷
3. UPDATE users SET balance = balance + refundAmount   // 退款入账用户余额
4. INSERT INTO transaction_records                    // 逐笔写退款流水（见下表）
5. UPDATE orders SET status='refunded' / 'destroyed'  // 原订单状态更新
6. UPDATE disks SET status='destroyed'                // 磁盘台账标记销毁
```

##### 退款流水字段（`transaction_records` 表）

| 字段 | 值 | 说明 |
|------|-----|------|
| `trade_type` | `'refund'` | 交易类型：退款 |
| `pay_method` | `'balance_refund'` | 退款方式：余额退回 |
| `resource_type` | `'disk'` | 资源类型：数据盘 |
| `resource_id` | 磁盘 id | 关联磁盘 |
| `trade_no` | 原订单号（KTVM/KLXC/KP 前缀） | 关联原订单 |
| `order_no` | `TK` + 时间 + 8 位随机数字 | 新退款订单号 |
| `balance_before` / `balance_after` | 用户余额前后值 | 余额快照 |
| `amount` | 该笔订单退款额 | 退款金额 |

##### 订单状态机

```text
pending ──(支付完成)──> completed ──(销毁退款)──> refunded
                                   └─(销毁无退款)──> destroyed
```

- 购买/扩容/续费成功 → `completed`
- 销毁且产生退款 → `refunded`（每笔有退款的订单一条流水）
- 销毁但无退款（>15 天用户销毁） → `destroyed`

##### 退款条件限制

- **必须先卸载**：磁盘状态为 `bound`（已挂载）时禁止销毁，先执行卸载
- **不可重复销毁**：状态为 `destroyed` 的磁盘再次销毁会报错
- **过期/宽限期不退款**：状态为 `expired` / `grace` 的磁盘，`paidOrders` 不参与退款计算
- **Legacy 磁盘不独立退款**：通过「导入存量磁盘」导入的磁盘随 VM 管理，不参与独立销毁退款
- **系统盘受保护**：`scsi0` / `sata0` / `virtio0` 及 `disk-0` 卷禁止任何操作
- **磁盘类型不影响退款**：`NVME` / `SATA` / `HDD` / `U2` 退款逻辑一致，仅定价与 QoS 不同

##### 前端响应字段

销毁接口返回 `{ success, refund, refund_amount, refund_desc }`，前端据此弹窗提示退款金额：

| `refund_desc` | 触发条件 |
|---------------|----------|
| `全额退款（开通 X 天）` | 磁盘开通 ≤3 天 |
| `按剩余天数退款（开通 X 天）` | 磁盘开通 3-15 天（用户）或 >3 天（管理员） |
| `该磁盘开通时间大于15天无法进行退款操作` | 用户销毁且开通 >15 天 |

> **提示：** 扩容后磁盘台账的 `price_per_gb` 会更新为新规格单价（后续续费按新价），但**已购历史订单的退款基数不变**，仍以原订单实付金额为准。

```bash
# .env 中设置
MYSQL_HOST=10.0.0.16
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-password
MYSQL_DATABASE=pve_panel
```

系统仅支持 MySQL 5.7+，启动时自动建表和字段迁移。字符集统一为 utf8mb4，完美支持 emoji。

### Redis 缓存

```bash
# .env 中设置
# Redis 配置已迁移到面板管理后台，在 系统设置 > 站点设置 > Redis 缓存配置 中配置。
# 密码使用 AES-256-GCM 加密存储。以下为默认值参考：
# REDIS_HOST=
# REDIS_PORT=6379
# REDIS_PASSWORD=
# REDIS_DB=0
# REDIS_PREFIX=pve:
```

配置后生效的数据类别：
- **速率限制**: 登录/2FA/忘记密码/CDK 限制计数器持久化，重启不丢失
- **VNC Ticket**: 5 分钟 TTL 自动过期
- **到期提醒**: 24 小时去重，防止重复邮件
- **推送 WebSocket**: `pushToUser()` 定向推送到在线用户（进程内直通，Redis 无需额外配置）

---

## 💻 宝塔部署

### 部署步骤

1. 上传文件到项目目录（注意保留 `.env`、`data/`、`images/`）
2. 进入项目目录执行 `npm install`
3. 在宝塔 Node.js 版本管理器中重启项目

### 注意事项

- 不要删除或覆盖 `.env` 文件
- 更新前端 JS 模块后需清除 Nginx 反向代理缓存

---

## 🔄 手动更新

当「系统更新」功能无法使用时，SSH 进入项目目录执行：

```bash
git fetch origin && git reset --hard origin/main && npm install --production && pm2 restart pve-panel
```

> 如果更新后 `npm install` 报 `EALLOWREMOTE` 错误，说明本地 npm registry 与 lockfile 不一致，删除 lockfile 重新生成即可：
> ```bash
> rm -rf node_modules package-lock.json && npm install --production && pm2 restart pve-panel
> ```
> **注意：** `package-lock.json` 不由仓库管理，由用户本地 `npm install` 自动生成。

> 如需回滚：`git reflog` 查找旧 commit hash，`git reset --hard <hash>` 回滚。

---

## ⚡ 性能优化

### 高并发优化（v2.29.0 新增）

| 优化项 | 效果 | 说明 |
|--------|------|------|
| **EJS 模板缓存** | 消除模板编译开销 | 编译后的模板函数缓存在内存，避免每次请求读磁盘+编译 |
| **禁用 `with` 语句** | 渲染性能提升 2-3 倍 | V8 引擎可优化模板渲染，模板变量显式引用 `locals.xxx` |
| **Gzip 压缩** | 体积减少 60%+ | 所有 HTML/CSS/JS/JSON 响应自动压缩 |
| **静态资源长效缓存** | JS/CSS 缓存 1 天 | 启用 `immutable` 标记，浏览器不再重复请求 |
| **资源预加载提示** | 节省数百毫秒连接时间 | `preconnect` + `dns-prefetch` 提前建立 CDN 连接 |
| **非关键脚本 defer** | 不阻塞首屏渲染 | marked/DOMPurify/Chart.js 等延迟加载 |
| **登录页 Redis 缓存** | 高并发下直接返回缓存 HTML | 60s TTL，站点配置更新时自动失效 |
| **站点配置进程内存缓存** | 减少数据库查询 | 60s TTL，API 请求和静态资源跳过 |
| **CSP nonce 优化** | 减少 crypto 开销 | 静态资源文件跳过 nonce 生成 |

### 数据库连接池

在高并发场景下建议调大连接池：

```bash
# .env 中设置
MYSQL_CONNECTION_LIMIT=25
```

如果使用 PM2 cluster 多进程模式，总连接数 = 进程数 × 连接池大小，建议不超过 MySQL `max_connections`（默认 151）。

### 认证 & 安全

| 优化项 | 说明 |
|--------|------|
| **密码哈希** | bcryptjs (cost=12)，登录时自动升级旧 SHA256 密码 |
| **JWT 有效期** | 2h（访问令牌）+ 7天（刷新令牌），自动续期 |
| **TLS 证书验证** | PVE 节点设置中可开关，默认关闭（兼容自签证书） |
| **加密** | AES-256-GCM 加密存储敏感配置，密钥从 JWT_SECRET 派生 |
| **速率限制** | 登录 5次/分钟、2FA 3次/分钟、API 全局 300次/分钟/IP |
| **安全响应头** | HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy |

---

## 📄 许可证

本项目基于 **MIT License** 开源。详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star！**

</div>
