<div align="center">

# ⚡ PVE 多用户控制面板

**Proxmox VE 多用户管理面板 · 现代化科技风格界面**

[![Version](https://img.shields.io/badge/version-v1.6.2-8b5cf6?style=flat-square&labelColor=1a1740)](https://github.com/272416939/pve-multi-user-panel)
[![Node](https://img.shields.io/badge/Node.js-18%2B-22c55e?style=flat-square&labelColor=1a1740&logo=node.js&logoColor=white)]()
[![Vue](https://img.shields.io/badge/Vue-3-4fc08d?style=flat-square&labelColor=1a1740&logo=vue.js&logoColor=white)]()
[![SQLite](https://img.shields.io/badge/SQLite-003b57?style=flat-square&labelColor=1a1740&logo=sqlite&logoColor=white)]()
[![License](https://img.shields.io/badge/license-MIT-f59e0b?style=flat-square&labelColor=1a1740)]()

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
| 12 | **内嵌操作确认** | 关机/重启/停止卡片内遮罩确认，防误操作 |

### 🛠️ 管理功能
| # | 功能 | 说明 |
|---|------|------|
| 13 | **虚拟机快照管理** | 创建/回滚/删除，配置全局限制（每 VM 上限、每日次数） |
| 14 | **虚拟机备份恢复** | PVE 停止模式 + zstd 压缩，异步轮询进度 |
| 15 | **CDK 兑换码系统** | 批量生成、CSV 导出、指定用户分配、自动通知 |
| 16 | **DHCP 静态绑定** | VM/LXC 分配时自动创建，解绑销毁自动删除 |
| 17 | **端口转发管理** | ikaui 自动同步，随机端口、冲突检查 |

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

---

## 🚀 快速开始

### 前置要求

- Node.js 18+
- Proxmox VE 服务器（需配置 API Token）
- （可选）ikuai 软路由 v3.7.21+（用于 DHCP 绑定 + 端口转发同步；4.0 版本暂未测试，不确定是否支持）

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
> **密码:** `admin123`  
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
| `PVE_SSH_HOST` | PVE 宿主机 SSH 地址 | `10.0.0.2` |
| `PVE_SSH_PASSWORD` | PVE root 密码 | — |
| `IKUAI_HOST` | ikuai 软路由地址 | `http://10.10.10.1` |
| `IKUAI_USER` | ikuai 用户名 | — |
| `IKUAI_PASSWORD` | ikuai 密码 | — |
| `DEBUG` | 调试日志开关 | `false` |

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
│   │   └── auth.js            # JWT 认证 + 权限中间件
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
│       ├── pve-api.js         # PVE REST API 封装
│       ├── ikuai-api.js       # ikuai API 封装
│       ├── ssh-exec.js        # SSH 执行工具
│       └── db-sqlite.js       # SQLite 数据库
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

所有 VNC 流量经由面板服务器中转，PVE 内网地址不暴露到公网。

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
- 提醒持久化到数据库，重启不重复发送

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

---

## 🔄 更新日志

<details>
<summary><b>v1.6.2</b> (2026-06-09) — LXC 重置 IP + 危险操作警告</summary>

**LXC 容器重置 IP 功能：**
- ✅ 新增重置 IP 按钮（位于重置密码按钮旁），支持手动输入/DHCP/随机三种模式
- ✅ 随机按钮：系统自动生成未被绑定的空闲 IP
- ✅ 后端 API：`GET /api/lxc/random-ip`、`POST /api/lxc/:vmid/reset-ip`
- ✅ 重置流程：解析 net0 → 运行中自动关机 → 修改 PVE 配置 → 自动开机 → 同步 DHCP/端口转发

**危险操作警告与二次确认：**
- ✅ 重置 IP 弹窗顶部红色透明毛玻璃警告（`backdrop-filter:blur(12px)`）
- ✅ 保存按钮红色（`btn-danger`），弹出二次确认弹窗

**Bug 修复：**
- ✅ PVE 修改 LXC 配置 API：`POST` → `PUT`
- ✅ DHCP 静态绑定 `preferredIp` 参数
- ✅ dashboard `confirmResetLxcIp` 使用不存在的 `$.selectedLxc`

**涉及文件：**
`package.json` · `server/api/pve-api.js` · `server/api/ikuai-api.js` · `server/services/dhcp.js` · `server/routes/lxc.js` · `server/routes/vm.js` · `public/admin.html` · `public/dashboard.html` · `public/js/admin/lxc.js` · `public/js/dashboard/lxc.js`

</details>

<details>
<summary><b>v1.6.1</b> (2026-06-07) — 后端架构重构 + 前端模块化拆分</summary>

**后端架构重构：**
- ✅ `server.js` 从 5766 行精简到 64 行：模块化拆分
- ✅ 拆分 `utils/`(6)、`middleware/`(1)、`config/`(1)、`routes/`(11)、`websocket/`(2)、`services/`(4)、`schedule/`(1)
- ✅ 100% 功能不变

**前端 CSS 模块化：**
- ✅ `styles.css` 从 1188 行 → 5 行 `@import` 聚合
- ✅ 拆分 4 个独立文件：`base.css` / `layout.css` / `components.css` / `features.css`
- ✅ 修复 Safari `backdrop-filter`、`user-select` 兼容性

**前端 JS 模块化：**
- ✅ `admin.html` 5056 行 → ~2570 行，内联 JS 拆 5 个模块
- ✅ `dashboard.html` 2751 行 → ~1190 行，内联 JS 拆 5 个模块
- ✅ `window.__namespace` + IIFE + `initXxx()` 模式

**Bug 修复：**
- ✅ `index.html` 已登录角色跳转（admin→admin.html, user→dashboard.html）
- ✅ HTML 文件 `Cache-Control: no-store`
- ✅ 安全响应头统一管理

</details>

<details>
<summary><b>v1.6.0</b> (2026-06-07) — 端口转发 + DHCP 静态绑定</summary>

- ✅ 网络管理标签页：端口转发范围/每用户上限/默认外网接口
- ✅ VM/LXC 端口转发：CRUD + ikuai 自动同步
- ✅ 随机端口 + 冲突检查
- ✅ DHCP 静态绑定：自动创建/删除，随机空闲 IP
- ✅ DHCP 全量同步：从爱快拉取按备注匹配
- ✅ 端口转发级联清理（解绑/销毁时）
- ✅ ikuai-api.js 独立模块
- ✅ 数据库迁移：port_forwards、dhcp_static_ip 字段

</details>

<details>
<summary><b>v1.5.0</b> (2026-06-06) — LXC 容器管理</summary>

- ✅ LXC 完整 CRUD：创建/分配/操作/销毁
- ✅ LXC XtermJS 终端：SSH + PTY 直连 `lxc-console`
- ✅ LXC 快照/备份/CDK 续费
- ✅ 终端安全加固：`conn.exec()` 消除 bash 中间层
- ✅ LXC 到期检查 + 自动关机
- ✅ 创建 LXC 弹窗：模板选择 + 网络配置 + 资源配置
- ✅ 导航动态化 API：三页面统一渲染

</details>

<details>
<summary><b>v1.4.1</b> (2026-06-05) — 备份恢复</summary>

- ✅ PVE 备份 API：创建/查询/删除
- ✅ 备份恢复：含关机校验、并发保护、轮询进度
- ✅ 存储位置选择：全局默认 + 单 VM 指定
- ✅ 恢复完成/失败自动通知
- ✅ 管理员清理接口

</details>

<details>
<summary><b>v1.4.0</b> (2026-06-05) — API Token + 快照 + 2FA</summary>

- ✅ PVE 认证：账号密码 → API Token
- ✅ VNC 适配 API Token 认证
- ✅ 快照 CRUD + 运行中创建 + 批量删除
- ✅ 2FA TOTP 双因素认证 + 恢复码
- ✅ `.env` 配置变更

</details>

<details>
<summary><b>v1.3.0</b> (2026-06-05) — JWT + 设备管理</summary>

- ✅ JWT 无状态认证 + Refresh Token
- ✅ 登录设备管理：上下线、当前设备标记
- ✅ 2FA 预留页面
- ✅ 可访问性优化（标签、aria、语义化）
- ✅ CDK 兑换体验优化

</details>

<details>
<summary><b>v1.2.0 ~ v1.2.2</b> (2026-05) — 消息系统 + 功能完善</summary>

- ✅ 站内消息系统（分类、角标、详情、推送）
- ✅ 全站统一自定义弹窗（alert/confirm）
- ✅ 导航优化：角色自动跳转、全局导航栏统一
- ✅ 权限加固：admin 页面拦截
- ✅ 标签页状态持久化
- ✅ CDK 分配用户 + 批量删除
- ✅ 表格深色主题适配
- ✅ 登录页面优化（前端校验、后端统一错误文案）

</details>

<details>
<summary><b>v1.1.0</b> (2026-05-20) — CDK + 续费</summary>

- ✅ CDK 兑换码系统：生成/批量/CSV/清理
- ✅ CDK 续费到期 + 邮件通知
- ✅ 极客头像（SVG 电路板）
- ✅ 虚拟机卡片等高、VM 销毁检测
- ✅ 运行时长显示、内嵌操作确认

</details>

<details>
<summary><b>v1.0.0</b> (2026-05-20) — 初始版本</summary>

- ✅ 多租户系统、虚拟机接入/到期/监控
- ✅ VNC 控制台、SMTP 邮件
- ✅ SQLite 数据库迁移
- ✅ 现代化 UI 设计

</details>

---

## 📄 许可证

本项目基于 **MIT License** 开源。

---

<div align="center">

**⭐ 如果这个项目对你有帮助，欢迎 Star！**

</div>