# PVE 多用户控制面板

一个 Proxmox Virtual Environment 的多用户管理控制面板，采用现代化科技风格界面。

## 版本信息

**当前版本**: v1.6.2

## 功能特性

1. **多租户系统** - 支持管理员和普通用户角色
2. **接入已有虚拟机** - 可将 PVE 上现有的虚拟机分配给用户
3. **虚拟机到期管理** - 可为虚拟机设置到期时间，到期自动关机，用户无法开机
4. **虚拟机监控** - 可查看 CPU 使用率、内存使用率、网络流量、磁盘 IO 等实时信息
5. **权限控制** - 用户只能看到和操作分配给自己的虚拟机
6. **用户中心** - 支持修改用户名密码、上传头像、个人简介、备忘录功能
7. **头像上传** - 支持 JPG、PNG、GIF、WEBP 格式，最大 2MB
8. **SMTP 邮件功能** - 管理员可配置 SMTP 服务器
9. **邮箱绑定** - 用户可绑定并验证邮箱
10. **忘记密码** - 通过绑定的邮箱重置密码
11. **到期提醒** - 虚拟机到期前发送邮件提醒，支持配置多个提醒时间点
12. **到期续费提醒** - 虚拟机过期后每日发送续费邮件，告知数据保留 3 天
13. **提醒配置** - 管理员可在后台配置 3 个到期前提醒天数，设置为 0 则不发送该提醒
14. **提醒持久化** - 已发送的提醒记录持久化到 SQLite 数据库，服务器重启后不会重复发送
15. **VNC 控制台** - 一键打开虚拟机网页控制台，通过 WebSocket 代理转发，不暴露 PVE 地址
16. **虚拟机操作** - 一键开机、安全关机、重启、强制停止
17. **现代化界面** - 深色科技风格主题，毛玻璃效果，流畅动画
18. **渐变配色** - 紫色渐变主题，霓虹光晕效果
19. **响应式设计** - 适配各种屏幕尺寸
20. **普通用户编辑功能** - 普通用户可修改自己虚拟机的名称
21. **已分配虚拟机管理** - 分配页面显示已分配和未分配的虚拟机列表，未分配的虚拟机不会在下拉框中重复出现
22. **用户邮箱管理** - 管理员可修改用户邮箱、直接设置邮箱验证状态，无需用户通过邮件验证
23. **日期选择器优化** - 点击整个日期/时间输入框即可打开选择器，无需精确点击日历图标
24. **SQLite 数据库** - 使用 SQLite 替代 JSON 文件存储，提升数据安全和性能
25. **自动数据迁移** - 首次升级会自动将 db.json 数据迁移到 SQLite 数据库
26. **VMID 显示** - 虚拟机卡片清晰显示 VMID，便于用户识别
27. **虚拟机快照管理** - 支持创建/查看/恢复/删除快照，管理员可配置全局限制：每台 VM 最多快照数、单用户每日创建/恢复次数上限，防止磁盘被快照撑爆
28. **CDK 兑换码系统** - 管理员可生成 CDK 兑换码分发给用户
29. **CDK 批量生成** - 支持快速选择 N天/N月/N年时长，批量生成 CDK
30. **CSV 导出** - 批量生成的 CDK 可导出为 CSV 表格，方便分发
31. **CDK 有效期管理** - 可设置 CDK 有效期，过期未使用的将无法兑换
32. **CDK 使用追踪** - 在后台可查看 CDK 使用状态、使用用户和虚拟机
33. **CDK 清理** - 支持一键清理过期/已使用的 CDK
34. **用户 CDK 兑换** - 用户可输入 CDK 码为虚拟机续费
35. **续费提醒重置** - CDK 兑换后到期时间自动延长，续费提醒重新计算
36. **CDK 续费邮件通知** - CDK 兑换成功后自动发送续费成功邮件通知用户
37. **到期虚拟机可见** - 到期的虚拟机对普通用户仍然正常显示，仅标记为过期状态
38. **续费提醒优化** - 到期后续费提醒每天仅发送 1 次，连续 3 天后自动停止
39. **提醒持久化恢复** - 所有提醒记录持久化存储，服务器重启后从数据库恢复到内存，杜绝重复发送
40. **续费价格标记** - 分配虚拟机时可设置续费价格（非必填），在虚拟机卡片和提醒邮件中显示
41. **虚拟机标签统一** - 到期时间和续费价格始终显示，无内容时占位"无限期"/"暂无"，保持卡片高度统一
42. **极客风格头像** - 无头像用户自动生成唯一的 SVG 渐变电路板风格头像（基于用户名），用户管理表格中显示
43. **用户中心合并** - 备忘录合并到用户设置页面，无需切换子选项卡
44. **虚拟机卡片等高** - 所有虚拟机卡片高度统一，按钮吸附底部，布局整洁
45. **虚拟机销毁检测** - 后端 PVE 的 VM 被删除后卡片自动红色毛玻璃遮罩，提示"已被销毁"，管理员可直接移除分配
46. **运行时长显示** - 运行中的 VM 卡片显示本次启动以来的运行时长
47. **内嵌操作确认** - 关机/重启/停止操作在卡片内弹出确认遮罩，避免误操作
48. **虚拟机重新分配** - 管理员可在编辑弹窗中选择其他用户，将虚拟机直接转给他人
49. **站内消息系统** - 集成消息中心，支持系统公告、业务通知、续费提醒、客服私聊等多种消息类型
50. **未读角标** - 导航栏铃铛图标显示未读消息数量，每 30 秒自动轮询刷新
51. **消息分类筛选** - 支持按全部/系统公告/业务通知/续费提醒/客服私聊分类查看消息
52. **未读已读状态** - 列表项显示红色【未读】或灰色【已读】标签，未读消息自动置顶
53. **全部标已读** - 一键将全部未读消息标记为已读
54. **管理员消息推送** - 管理员可在"消息管理"标签页向全体或指定用户发送消息
55. **自动业务触发** - VM 分配、VM 移除、到期提醒、续费提醒、CDK 兑换成功时自动生成站内消息
56. **全站统一弹窗** - 全面替换浏览器原生 alert/confirm，统一的深色科技风格 Modal 弹窗
57. **异步确认弹窗** - 确认/取消操作使用自定义异步 Modal 弹窗，与全站主题风格一致
58. **CDK 分配用户** - 生成 CDK 时可通过搜索标签输入框多选分配给指定用户，每人自动分配一个 CDK，系统自动发送站内消息和邮件通知；已分配用户的 CDK 仅限该用户使用，未分配用户的 CDK 任意用户可用
59. **二次验证（2FA）** - 支持 TOTP 双因素认证，绑定 Google Authenticator 等应用，登录时需输入动态验证码；提供 8 个一次性恢复码兜底；管理员可代为用户禁用 2FA
60. **虚拟机备份与恢复管理** - 支持创建/查看/删除/恢复备份，使用 PVE 停止模式 + zstd 压缩；后端异步轮询进度，百分比+进度条实时显示；备份/恢复完成或失败自动发送站内信+邮件通知；支持全选/多选批量删除备份；管理员可配置全局默认备份存储位置及每 VM 最大备份数和每日备份上限；可为单个 VM 指定专用存储位置；恢复时覆盖磁盘数据，完成后自动通知
61. **LXC 容器管理** - 支持从模板创建 LXC 容器、分配/换绑给用户、一键重置 SSH 密码、开机/关机/重启/强制停止、VNC 控制台、到期管理、快照/备份管理、CDK 续费、管理员可销毁容器
62. **LXC 模板创建** - 管理员从 PVE 模板库中选择模板，配置 CPU/内存/磁盘/Swap/网络(MAC+IPv4+IPv6 DHCP)/root 密码后创建，PVE 自动分配 CT ID
63. **LXC 分配与换绑** - 管理员将 LXC 容器分配给用户，支持随时换绑，与虚拟机分配逻辑完全一致
64. **LXC 一键重置密码** - 用户/管理员可在面板一键重置 LXC 容器的 root 密码
65. **LXC 基础操作** - 开机、关机、强制停止、重启、VNC 控制台
66. **LXC 到期管理** - 设置到期时间、续费价格、过期提醒，与虚拟机到期管理逻辑一致
67. **LXC 快照管理** - 创建/回滚/删除快照，**与 VM 共用快照配置限制**（`snapshot:max_per_vm`）
68. **LXC 备份管理** - 创建/恢复/删除备份，**与 VM 共用 backups 表**（新增 `type` 字段区分 vm/lxc）
69. **LXC CDK 续费** - LXC 容器支持 CDK 兑换码续费延长到期时间
70. **LXC 容器销毁（管理员）** - 管理员可在面板直接销毁 LXC 容器，输入 `yes` 二次确认
71. **LXC XtermJS 终端** - LXC 容器支持 xterm.js 网页终端，通过 SSH + PTY 直连 PVE 宿主机执行 `lxc-console`，完全绕过 PVE termproxy 代理层，无需 VNC/TLS/凭证传递；SSH 端使用 `conn.exec()` 直接启动 `lxc-console`，不经 bash shell 中转，宿主机提示符对用户不可见
72. **终端窗口自适应** - LXC 终端采用 xterm.js FitAddon，连接时和窗口缩放时自动发送 resize 指令，SSH PTY 窗口尺寸实时同步
73. **端口转发管理（网络管理）** - 管理员可在「网络管理」标签页配置端口转发范围（起始端口~结束端口）、每用户最大规则数、默认外网接口
74. **VM/LXC 端口转发** - 每个 VM 和 LXC 管理区域新增「网络」子标签页，支持端口转发列表展示、添加、编辑、删除、批量删除（管理员）
75. **端口转发 ikuai 自动同步** - 新增/编辑/删除端口转发时自动同步到 ikuai 软路由，通过原生 Action API（`Action/call dnat`）实时生效
76. **启动同步** - 服务启动时自动从 ikuai 全量拉取端口映射列表，与本地数据库做差异匹配，自动导入新规则、标记孤立马
77. **IP 自动提取** - 打开端口转发弹窗时自动检测所有已分配 VM/LXC 的 IP 地址：LXC 解析 `ct.config.net0` 的 `ip=` 字段，VM 通过 MAC 地址匹配 ikuai DHCP 租约
78. **随机端口分配** - 一键随机生成可用端口（在系统配置范围内），点击「🎲 随机」按钮自动填入
79. **端口冲突检查** - 提交前实时检查外网端口是否已被占用，冲突时阻断提交并红色提示
80. **级联清理** - VM/LXC 解除分配或销毁时自动清理关联的端口转发规则（本地 + ikuai）
81. **调试模式开关** - `.env` 配置 `DEBUG=true` 控制台输出 extract-ips 等详细调试日志，非调试模式自动静默
82. **DHCP 静态绑定** - VM/LXC 分配时自动创建 DHCP 静态绑定（爱快），解绑或销毁时自动删除，IP 从指定范围（默认 10.0.0.110-199）随机选取空闲地址
83. **DHCP 静态绑定配置** - 管理员可在网络管理页配置 IP 分配范围、所属 LAN 接口、网关、DNS，无需硬编码
84. **DHCP 静态绑定同步** - 从爱快全量拉取已有 DHCP 静态绑定，按备注 `VM-{id}` / `CT-{id}` 匹配并回写数据库，添加端口转发时直接读取数据库 IP，不依赖爱快接口
85. **接口列表支持 LAN** - 刷新接口时同时从爱快获取 WAN（端口转发用）和 LAN（DHCP 用）接口，自动去重缓存到数据库
86. **LXC 容器重置 IP** - 支持手动输入/DHCP/随机三种模式修改容器 IP，自动同步 PVE 配置、DHCP 静态绑定和端口转发
87. **重置 IP 危险操作警告** - 修改 IP 弹窗红色毛玻璃警告提示 + 保存时二次确认弹窗，防止误操作

## 安装

```bash
npm install
```

## 配置

编辑 `.env` 文件，配置你的 PVE 信息和服务器端口：

| 变量 | 说明 | 示例 |
|------|------|------|
| `PVE_HOST` | PVE 服务器地址，格式为 `https://IP:端口` | `https://192.168.1.100:8006` |
| `PVE_API_TOKEN` | PVE API 令牌，格式为 `用户名@认证域!令牌ID=UUID`。需先在 PVE 数据中心→权限→API 令牌中创建 | `root@pam!panel=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `PORT` | 面板服务监听端口 | `3002` |
| `SITE_URL` | 面板外部访问地址，用于邮件中的链接（验证邮箱、重置密码等）。部署在反向代理后必须设为域名，否则邮件链接会使用内网 IP | `https://your-domain.com` |
| `JWT_SECRET` | JWT 令牌签名密钥，生产环境请修改为随机字符串 | `your-secret-key-change-this-in-production` |
| `PVE_SSH_HOST` | PVE 宿主机 SSH 地址，用于远程恢复备份和 LXC 终端 | `10.0.0.2` |
| `PVE_SSH_PASSWORD` | PVE 宿主机 root 密码，用于 SSH 认证 | `your-root-password` |
| `IKUAI_HOST` | ikuai 软路由地址，用于端口转发同步、DHCP 租约查询、接口列表查询 | `http://10.10.10.1` |
| `IKUAI_USER` | ikuai 管理后台用户名 | `pve-panel` |
| `IKUAI_PASSWORD` | ikuai 管理后台密码 | `your-ikuai-password` |
| `DEBUG` | 调试模式开关，设为 `true` 输出 extract-ips 等详细日志，留空或 `false` 则关闭 | `false` |

> **注意**: `SITE_URL` 用于邮件中的链接地址（验证邮箱、重置密码等）。如果部署在宝塔面板等反向代理环境中，必须将此值设置为你的域名，否则邮件中的链接将使用内网 IP 地址。

## 运行

```bash
npm start
```

开发模式（自动重启）：

```bash
npm run dev
```

## 默认账号

- 用户名: `admin`
- 密码: `admin123`

**请首次登录后立即修改密码！**

## ikuai 软路由配置

面板通过 ikuai 原生 Action/call 接口实现端口转发同步、VM IP 自动提取（DHCP 租约查询）和接口列表查询。**无需在 ikuai 后台开启 API 接口或生成密钥**，只需在 `.env` 中配置 ikuai 管理后台的登录信息即可：

| 配置项 | 说明 |
|--------|------|
| `IKUAI_HOST` | ikuai 管理后台地址，如 `http://10.10.10.1` |
| `IKUAI_USER` | ikuai 管理后台用户名 |
| `IKUAI_PASSWORD` | ikuai 管理后台密码 |

> **注意**：ikuai 配置仅后端使用，不会在前端页面展示。未配置时端口转发相关功能不可用（面板内仍可管理本地规则），其他功能不受影响。

## 使用说明

1. 登录后，管理员可以看到以下标签页：
   - **QEMU 虚拟机管理**：查看和管理分配给自己的虚拟机，支持开机、安全关机、重启、强制停止和 VNC 控制台；操作按钮分组收纳（电源控制 btn-group：[启动/关机/重启/停止]、VNC 独立展示、管理下拉菜单：[快照/备份/编辑]）；操作需通过卡片内确认遮罩确认；卡片高度统一，显示运行时长、网络流量、磁盘 IO、到期时间、续费价格等；后端 VM 被销毁时自动红色遮罩提示
   - **LXC 容器管理**：管理 LXC 容器——新建容器（选择模板+配置资源/网络）、分配/换绑给用户、已分配容器操作（开机/关机/重启/控制台/终端/重置密码/快照/备份/编辑/销毁）
   - **用户管理**：创建、编辑和删除用户，管理用户邮箱和验证状态，列表中显示用户头像
   - **分配虚拟机/容器**：将 PVE 上的虚拟机或 LXC 容器分配给用户，可设置到期时间和续费价格（非必填），已分配的不会重复显示；已分配的可在编辑弹窗中重新分配给其他用户
   - **网络管理**：配置端口转发范围（起始端口~结束端口）、每用户最大规则数、默认外网接口；可刷新 ikuai 接口列表
   - **SMTP 配置**：配置邮件服务器、测试邮件发送、到期提醒天数设置
   - **CDK 管理**：生成 CDK 兑换码、管理 CDK 使用状态、导出 CSV、清理过期 CDK
   - **消息管理**（管理员专属）：发送站内消息，支持全体推送或指定用户，可选择系统公告/业务通知/客服私聊类型，支持附加链接
   - **用户中心**：个人设置（头像自动生成极客风格占位图、邮箱、用户名、密码、个人简介）、备忘录管理、消息管理（合并在同一页面）
   - **导航动态化**：三个页面（admin/dashboard/user-center）的顶部导航栏均通过 `GET /api/user/nav` API 动态渲染，根据角色自动显示标签（管理员：虚拟机管理/LXC 容器管理/管理后台/用户中心；普通用户：我的虚拟机/我的 LXC 容器/用户中心），只需修改后端 API 即可同步所有页面

   VM 和 LXC 管理区域各有一个「网络」子标签页，用于管理端口转发规则：
   - 端口转发列表表格（分页展示，每页 20 条）
   - 添加/编辑/删除端口转发（管理员可批量删除）
   - 选择设备后自动填入目标 IP，随机端口/端口冲突检查辅助功能
   - 显示同步状态（已同步/孤立马/待同步/失败），支持重试同步

2. 普通用户可以看到：
   - **我的虚拟机**：查看和管理自己的虚拟机，可修改虚拟机名称，点击"CDK 兑换"使用兑换码续费；虚拟机卡片显示到期时间、续费价格等信息；「网络」子标签页可管理该 VM 的端口转发
   - **我的 LXC 容器**：查看和管理自己的 LXC 容器，支持开机/关机/重启/控制台/终端/重置密码/快照/备份/编辑；「网络」子标签页可管理该 LXC 的端口转发
   - **用户中心**：个人设置（头像自动生成极客风格占位图、邮箱、用户名、密码、个人简介）、备忘录管理、消息管理（合并在同一页面）

3. 系统每 5 分钟自动检查一次到期的虚拟机：
   - 到期前按配置天数发送提醒邮件（默认 7 天、3 天、1 天前）
   - 到期后自动关机，并每日发送续费提醒（数据保留 3 天）
   - 提醒记录持久化存储，重启服务器不会重复发送

4. SMTP 配置说明（管理员）：
   - 在 SMTP 配置页面填写邮件服务器信息
   - 支持测试邮件发送功能
   - 配置完成后用户可使用邮箱相关功能

5. 邮箱功能说明（用户）：
   - 在用户中心绑定邮箱
   - 收到验证邮件后点击链接完成验证
   - 验证后可使用忘记密码功能
   - 虚拟机到期前会收到邮件提醒

6. 到期提醒配置说明（管理员）：
   - 在 SMTP 配置页面的"到期提醒配置"部分设置提醒天数
   - 支持配置 3 个不同的提醒时间点（例如：7 天、3 天、1 天前）
   - 将某个提醒时间设置为 0，则不发送该提醒
   - 保存配置后，系统会在到期前的配置时间点自动发送提醒邮件

7. VNC 控制台及虚拟机编辑说明：
   - 虚拟机**运行中**状态时，点击 VNC 按钮
   - 在新标签页打开虚拟机 VNC 网页控制台
   - 支持 Ctrl+Alt+Del、全屏等操作
   - 所有流量通过面板服务器 WebSocket 代理转发，PVE 内网地址不暴露
   - 点击「编辑」按钮可修改虚拟机名称（所有用户），管理员还可修改到期时间和续费价格

8. LXC XtermJS 终端说明：
   - LXC 容器**运行中**状态时，点击「终端」按钮
   - 在新标签页打开 xterm.js 网页终端，直接进入容器控制台
   - 终端通过 SSH 直连 PVE 宿主机，使用 `conn.exec()` + PTY 直接启动 `lxc-console -n {vmid}`，不经过 bash shell 中转，宿主机 shell 提示符和系统信息对用户完全不可见
   - 支持终端窗口自适应：连接时和窗口缩放时自动发送 resize 指令，SSH PTY 窗口尺寸实时同步
   - 退出终端：在容器内按 `Ctrl+A` 再按 `Q`（lxc-console dtach 分离快捷键），或直接关闭浏览器标签页
   - 请在 `.env` 中正确配置 `PVE_SSH_HOST` 和 `PVE_SSH_PASSWORD`（root 密码），终端功能依赖 SSH 连接

9. 用户管理说明（管理员）：
   - 创建用户时可选择是否立即验证邮箱
   - 编辑用户时可修改用户邮箱
   - 可直接勾选/取消勾选"验证邮箱"来设置用户邮箱验证状态
   - 用户邮箱变更时会自动重新生成验证令牌（如果需要）

9. CDK 兑换码说明（管理员）：
   - 在"CDK 管理"标签页生成 CDK 兑换码
   - 可快速选择续费时长（7天、30天、90天、半年、1年）或自定义天数
   - 支持设置 CDK 有效期，超过有效期未使用的 CDK 将自动作废
   - 可批量生成（最多 1000 个）并导出为 CSV 表格分发给用户
   - 生成的 CDK 码格式：`PVE-XXXX-XXXX-XXXX`（排除易混淆字符）
   - 生成时可搜索并多选分配给指定用户（标签输入框），每人自动分配一个 CDK，系统自动发送站内消息和邮件通知（无需手动分发）
   - CDK 列表中可查看每个 CDK 的使用状态、使用用户、使用虚拟机以及分配用户
   - 可删除单个 CDK 或一键清理所有过期/已使用的 CDK

10. CDK 兑换说明（用户）：
    - 在"我的虚拟机"页面点击「CDK 兑换」按钮
    - 输入管理员分发的 CDK 码（自动转为大写，不区分大小写）
    - 选择要续费的虚拟机
    - 确认兑换后，虚拟机的到期时间自动延长对应天数
    - 续费提醒和到期提醒的计时也同步重新计算
    - 已过期的虚拟机兑换后同样从当前时间开始重新计算到期时间
    - 兑换成功后，**系统会自动发送续费成功邮件**至绑定邮箱（需已绑定并验证邮箱）

11. 到期提醒优化说明：
    - 到期前提醒（如 7 天、3 天、1 天前）每个时间点每天仅发送 1 次
    - 到期后续费提醒每天仅发送 1 次，**最多连续发送 3 天**后自动停止
    - 所有提醒记录持久化到 SQLite 数据库
    - 服务器重启后自动从数据库恢复当日提醒记录，**不会重复发送**

## VNC / 终端架构

### VNC 架构

```
用户浏览器 ──→ 面板服务器 (443 端口) ──→ PVE (内网 8006)
                    │
            ┌───────┴───────┐
            │  vnc.html     │
            │  (noVNC 库)   │
            └───────┬───────┘
                    │ WebSocket (wss://)
            ┌───────┴───────┐
            │  WebSocket    │
            │  代理转发     │
            └───────┬───────┘
                    │ WebSocket (wss:// + PVE API Token)
            ┌───────┴───────┐
            │  PVE 节点     │
            │  vncwebsocket │
            └───────────────┘
```

- VNC 流量全部经过面板服务器中转
- PVE 的 `your-pve-host:8006` 地址不暴露到公网
- 每个连接使用独立的 VNC ticket，用完即废

### LXC XtermJS 终端架构

```
用户浏览器 ──→ 面板服务器 (443 端口) ──→ PVE 宿主机 (22 SSH)
                    │
            ┌───────┴───────┐
            │ terminal.html │
            │  (xterm.js)   │
            └───────┬───────┘
                    │ WebSocket (wss:// /term-proxy)
            ┌───────┴───────┐
            │  SSH + PTY    │
            │  lxc-console  │
            └───────┬───────┘
                    │ 容器控制台
            ┌───────┴───────┐
            │  LXC 容器     │
            └───────────────┘
```

- 完全绕过 PVE termproxy/vncwebsocket 代理层，消除 VeNCrypt/TLS 兼容性问题
- 使用 `ssh2` 库通过 SSH 直连 PVE 宿主机，`conn.exec()` 直接启动 `lxc-console` 并分配 PTY，不经 bash shell 中转，宿主机提示符对用户不可见
- 所有流量通过面板服务器 WebSocket 中转，PVE 内网地址不暴露
- 需在 `.env` 中配置 `PVE_SSH_HOST` 和 `PVE_SSH_PASSWORD`（root 密码）

## 项目结构

```
.
├── server/
│   ├── server.js              # 入口文件（Express 初始化 + 路由挂载 + WebSocket 升级）
│   ├── config/
│   │   └── multer.js          # 文件上传配置
│   ├── middleware/
│   │   └── auth.js            # JWT 认证 + 管理员权限中间件
│   ├── utils/
│   │   ├── debug.js           # 调试日志
│   │   ├── pve-rate.js        # PVE 流量速率计算
│   │   ├── email.js           # 邮件模板 + 发送
│   │   ├── token.js           # JWT Token 生成/验证
│   │   ├── site-url.js        # 站点 URL 获取
│   │   └── cdk-generator.js   # CDK 码生成
│   ├── routes/
│   │   ├── auth.js            # 认证路由（登录/登出/刷新/密码重置）
│   │   ├── user.js            # 用户中心（2FA/设备/资料/邮箱/备忘录/头像）
│   │   ├── admin-user.js      # 管理员用户管理
│   │   ├── vm.js              # VM 管理（分配/操作/状态）
│   │   ├── lxc.js             # LXC 管理（分配/操作/模板/终端/销毁）
│   │   ├── snapshot.js        # VM + LXC 快照管理
│   │   ├── backup.js          # VM + LXC 备份/恢复管理
│   │   ├── cdk.js             # CDK 兑换码管理
│   │   ├── message.js         # 站内消息管理
│   │   ├── admin-config.js    # 管理配置（SMTP/提醒/备份/版本）
│   │   └── network.js         # 网络/ikuai/端口转发
│   ├── websocket/
│   │   ├── vnc-proxy.js       # VNC WebSocket 代理（QEMU + LXC）
│   │   └── terminal-proxy.js  # xterm.js 终端代理（SSH + PTY）
│   ├── services/
│   │   ├── expiry-check.js    # 到期检查 + 提醒（VM + LXC）
│   │   ├── backup-polling.js  # 备份/恢复进度轮询
│   │   ├── ikuai-sync.js      # ikuai 端口转发启动同步
│   │   └── dhcp.js            # DHCP 静态绑定
│   ├── schedule/
│   │   └── tasks.js           # 定时任务 + 启动初始化
│   └── api/
│       ├── pve-api.js         # PVE API 封装（QEMU + LXC）
│       ├── ikuai-api.js       # ikuai 软路由 API 封装
│       ├── ssh-exec.js        # SSH 执行工具（pct restore + LXC PTY 终端）
│       └── db-sqlite.js       # SQLite 数据库操作
├── data/
│   └── pve-panel.db           # SQLite 数据库文件（自动生成）
├── package.json               # 依赖配置
├── package-lock.json          # 依赖锁定文件
├── .env                       # 环境变量
├── images/                    # 头像存储目录
└── public/
    ├── login.html             # 登录页面（角色自动跳转）
    ├── dashboard.html         # 用户仪表盘
    ├── admin.html             # 管理后台
    ├── user-center.html       # 用户中心
    ├── index.html             # 根路径兜底（自动跳转登录/仪表盘）
    ├── vnc.html               # VNC 控制台页面（noVNC 客户端）
    ├── terminal.html          # LXC xterm.js 终端页面
    ├── js/
    │   ├── shared.js          # 公共函数（api、alert、confirm、头像生成等）
    │   ├── admin/             # 管理后台 JS 模块
    │   │   ├── core.js        # 核心状态、导航、认证、工具函数注册、alert/confirm
    │   │   ├── vm.js          # VM 操作、分配、快照、备份
    │   │   ├── lxc.js         # LXC 操作、创建/销毁、快照、备份
    │   │   ├── admin.js       # 用户管理、CDK、SMTP/提醒/快照/备份配置、消息
    │   │   └── network.js     # 网络配置、端口转发、设备转发、分页
    │   └── dashboard/         # 用户面板 JS 模块
    │       ├── core.js        # 核心状态、导航、认证、工具函数注册
    │       ├── vm.js          # VM 操作、快照、备份、CDK 兑换
    │       ├── lxc.js         # LXC 操作、密码重置、快照、备份
    │       ├── forward.js     # 端口转发、设备转发
    │       └── message.js     # 消息管理
    ├── css/
    │   ├── styles.css           # 样式入口（@import 聚合）
    │   ├── base.css             # CSS 变量/背景/滚动条/动画/排版
    │   ├── layout.css           # 导航栏/卡片/选项卡/模态框
    │   ├── components.css       # 按钮/表单/表格/徽章/头像/标签输入框
    │   └── features.css         # 消息系统/VM 遮罩/端口转发
    └── novnc/                 # noVNC 库
```

## 界面设计

### 主题特点
- **深色背景**：深蓝色到紫色渐变背景
- **霓虹光晕**：渐变色按钮带有发光效果
- **玻璃质感**：卡片和弹窗采用半透明毛玻璃效果
- **流畅动画**：悬停、点击等交互动画
- **统一配色**：紫色系渐变为主，蓝色和红色渐变点缀

### 核心样式文件
- `public/css/styles.css`：包含完整的 UI 样式系统
  - 导航栏、按钮、表单、表格、卡片等组件样式
  - 响应式布局适配
  - 动画和过渡效果定义

## 技术栈

- **后端**: Node.js + Express
- **数据库**: SQLite (better-sqlite3) [v2.x+] / LowDB (JSON) [v1.x]
- **前端**: Vue 3 (CDN, Composition API + Options API 混合) + Bootstrap 5 — 多页面架构（login/dashboard/admin/user-center），Vue 3 Teleport 处理模态框层级；admin/dashboard 大文件按功能域拆分为独立 JS 模块（`window.__namespace` + IIFE + `initXxx()` 模式）
- **PVE 通信**: Axios（REST API）+ ws（WebSocket 代理）
- **认证**: JWT
- **邮件**: Nodemailer
- **定时任务**: node-schedule

## 宝塔部署

### 需要上传/更新的文件

**首次部署完整文件：**
- 所有项目文件

**功能更新时仅需上传修改的文件：**

示例（v1.6.1 更新）：
- `package.json` - 修改（版本号更新）
- `server/server.js` - 重写（5766 行 → 64 行，仅保留 Express 初始化 + 路由挂载）
- `server/config/multer.js` - 新增（文件上传配置，从 server.js 抽离）
- `server/middleware/auth.js` - 新增（JWT 认证 + 管理员中间件，从 server.js 抽离）
- `server/utils/` - 新增（6 个工具模块：debug / pve-rate / email / token / site-url / cdk-generator）
- `server/routes/` - 新增（11 个路由模块：auth / user / admin-user / vm / lxc / snapshot / backup / cdk / message / admin-config / network）
- `server/websocket/` - 新增（vnc-proxy / terminal-proxy，从 server.js 抽离）
- `server/services/` - 新增（expiry-check / backup-polling / ikuai-sync / dhcp，从 server.js 抽离）
- `server/schedule/tasks.js` - 新增（定时任务 + 启动初始化，从 server.js 抽离）
- `public/css/styles.css` - 重写（1188 行 → 5 行 @import 聚合入口，保留 Google Fonts）
- `public/css/base.css` - 新增（CSS 变量/背景/滚动条/动画/排版）
- `public/css/layout.css` - 新增（导航栏/卡片/选项卡/模态框）
- `public/css/components.css` - 新增（按钮/表单/表格/徽章/头像/标签输入框）
- `public/css/features.css` - 新增（消息系统/VM 遮罩/端口转发）
- `public/js/admin/` - 新增（5 个管理后台 JS 模块：core / vm / lxc / admin / network）
- `public/js/dashboard/` - 新增（5 个用户面板 JS 模块：core / vm / lxc / forward / message）
- `public/admin.html` - 修改（内联 JS 拆分为模块引用 + 组合层 setup()）
- `public/dashboard.html` - 修改（内联 JS 拆分为模块引用 + 组合层 setup()）
- `public/index.html` - 修改（已登录用户根据 JWT role 字段跳转）
- `server/server.js` - 修改（HTML 文件设置 no-store 缓存策略）

示例（v1.6.0 更新）：
- `package.json` - 修改（版本号更新）
- `server/api/ikuai-api.js` - 新增（ikuai 端口转发/DHCP 租约/接口列表 API 封装）
- `server/api/db-sqlite.js` - 修改（新增 port_forwards 表、forward 配置项）
- `server/api/ssh-exec.js` - 移动（从 server/ssh-exec.js 移到 api/ 目录，引用路径同步更新）
- `server/server.js` - 修改（新增网络配置 + 端口转发 CRUD + ikuai 同步 + IP 提取等约 20 个路由）
- `public/admin.html` - 修改（新增网络管理标签页 + VM/LXC 网络子标签页 + 端口转发管理弹窗 + 分页）
- `public/dashboard.html` - 修改（新增 VM/LXC 网络子标签页 + 端口转发管理弹窗 + 端口范围动态提示）
- `public/css/styles.css` - 修改（端口转发相关样式）
- `.env` - 修改（新增 IKUAI_HOST/IKUAI_USER/IKUAI_PASSWORD/DEBUG）
- `public/js/shared.js` - 修改（修复 api() 函数 body 序列化问题）

示例（v1.4.1 更新）：
- `package.json` - 修改（版本号更新）
- `server/api/pve-api.js` - 修改（新增 getStorageList/createBackup/getTaskStatus/deleteBackupFile/restoreBackup，修复 deleteBackupFile URL 编码）
- `server/db-sqlite.js` - 修改（新增 backups/backup_logs/restore_tasks 表、备份配置操作、backup_storage 字段迁移）
- `server/server.js` - 修改（新增 11 个备份路由 + 备份轮询/通知 + 2 个恢复路由 + 恢复轮询/通知 + 启动恢复 + 清理接口）
- `public/admin.html` - 修改（新增备份按钮+弹窗+配置标签页+VM 编辑存储位置+恢复按钮+选中行样式优化+按钮布局+确认弹窗 v-html）
- `public/dashboard.html` - 修改（新增备份按钮+弹窗+进度轮询+恢复按钮+选中行样式优化+按钮布局+确认弹窗 v-html）
- `public/js/shared.js` - 修改（formatBytes 改为 1000 进制，与 PVE 显示一致）

示例（v1.4.0 更新）：
- `package.json` - 修改（版本号更新）
- `server/api/pve-api.js` - 重写（移除 ticket 认证，改为 API Token）+ 新增快照 4 个方法
- `server/db-sqlite.js` - 修改（新增 snapshot_logs 表、快照配置操作）
- `server/server.js` - 修改（删除 pveApi.authenticate() 调用，VNC 适配 API Token，新增 6 个快照路由）
- `.env` - 修改（PVE_USER/PVE_PASSWORD → PVE_API_TOKEN）
- `public/admin.html` - 修改（新增快照配置标签页）
- `public/dashboard.html` - 修改（新增快照按钮 + 快照管理模态框）

**注意：**
- 不要删除或覆盖 `.env` 文件（包含敏感配置）
- 不要删除 `images/` 目录（用户头像）
- 不要删除 `data/` 目录和数据库文件
- 不要删除 `data/pve-panel.db-shm` 和 `data/pve-panel.db-wal`（SQLite 临时文件）
- 部署前端 JS 模块更新后，需清除 Nginx 反向代理缓存（宝塔面板：网站设置 → 反向代理 → 缓存开关关闭再打开），否则浏览器可能加载旧版 HTML

### 部署步骤

1. 上传所有必要文件到项目目录
2. 在宝塔终端进入项目目录
3. 如果 package.json 有变更，运行 `npm install`
4. 在软件商店→Node.js 版本管理器中重启项目

## 更新日志

### v1.6.2 (2026-06-09)

**LXC 容器重置 IP 功能：**
- ✅ 新增 LXC 容器重置 IP 按钮（位于重置密码按钮旁），支持手动输入/DHCP/随机三种模式
- ✅ 手动输入模式：显示当前 IP 的文本框，用户修改后保存
- ✅ DHCP 模式：移除静态 IP，容器通过 DHCP 自动获取地址
- ✅ 随机按钮：系统自动生成未被绑定的空闲 IP 并填入
- ✅ 后端 API：`GET /api/lxc/random-ip`（随机 IP）、`POST /api/lxc/:vmid/reset-ip`（重置 IP，支持 dhcp/static/random 三种模式）
- ✅ 重置 IP 流程：解析并重建 net0 配置 → 运行中容器自动关机 → 修改 PVE 配置 → 自动开机 → 更新/创建/删除 DHCP 静态绑定 → 更新数据库 → 同步端口转发 IP

**危险操作警告与二次确认：**
- ✅ 重置 IP 弹窗顶部新增红色透明毛玻璃背景警告框（`backdrop-filter:blur(12px)` + `rgba(220,53,69,0.15)`），提示"修改 IP 需要重启容器，正在运行的服务会中断"
- ✅ 保存按钮改为红色（`btn-danger`），点击后弹出二次确认弹窗（`customConfirm`），用户确认后才执行

**Bug 修复：**
- ✅ 修复 PVE 修改 LXC 配置 API 方法错误：`POST` → `PUT`（PVE API 要求）
- ✅ 修复 DHCP 静态绑定不使用用户手动输入 IP：`createDhcpStaticBinding` 新增 `preferredIp` 参数优先使用指定 IP
- ✅ 修复 dashboard `confirmResetLxcIp` 使用不存在的 `$.selectedLxc` 导致点击保存无反应：改为 `$.lxcPasswordResetCtId`
- ✅ 修复 `customConfirm` 调用缺少 `window.` 前缀导致 ReferenceError

**部署文件（v1.6.2 更新）：**
- `package.json` - 修改（版本号 1.6.1 → 1.6.2）
- `server/api/pve-api.js` - 修改（`updateLxcConfig` 从 POST 改为 PUT）
- `server/api/ikuai-api.js` - 修改（新增 `editDhcpStaticBinding` 方法）
- `server/services/dhcp.js` - 修改（`createDhcpStaticBinding` 新增 `preferredIp` 参数，新增 `updateDhcpStaticBindingIp` 函数）
- `server/routes/lxc.js` - 修改（新增 `GET /lxc/random-ip`、`POST /lxc/:vmid/reset-ip` 端点）
- `server/routes/vm.js` - 修改（VM 分配时 DHCP 绑定传入已有 `dhcp_static_ip`）
- `public/admin.html` - 修改（新增重置 IP 按钮+弹窗+警告+二次确认，JS 版本号更新）
- `public/dashboard.html` - 修改（同 admin.html 重置 IP 功能，JS 版本号更新）
- `public/js/admin/lxc.js` - 修改（新增 `openResetLxcIpModal`/`randomLxcIp`/`confirmResetLxcIp`/`resetLxcIp`）
- `public/js/dashboard/lxc.js` - 修改（同 admin 版本重置 IP 功能）

### v1.6.1 (2026-06-07)

**后端架构重构 — server.js 模块化拆分：**
- ✅ `server.js` 从 5766 行精简到 64 行：仅保留 Express 初始化、路由挂载、WebSocket 升级处理、服务器启动
- ✅ 拆分 6 个独立工具模块：`utils/debug.js`、`utils/pve-rate.js`（PVE 流量速率计算，含 `clearExpiredCache` 定时清理）、`utils/email.js`、`utils/token.js`（JWT Token 生成/验证）、`utils/site-url.js`、`utils/cdk-generator.js`
- ✅ 拆分 2 个中间件/配置模块：`middleware/auth.js`（JWT 认证 + 管理员权限）、`config/multer.js`（文件上传配置）
- ✅ 拆分 11 个路由模块（按业务归类，Express Router）：`routes/auth.js`（登录/登出/刷新/密码重置）、`routes/user.js`（用户中心/2FA/设备/备忘录）、`routes/admin-user.js`（管理员用户管理）、`routes/vm.js`（VM 分配/操作/状态）、`routes/lxc.js`（LXC 分配/操作/模板/终端/销毁）、`routes/snapshot.js`（VM + LXC 快照）、`routes/backup.js`（VM + LXC 备份/恢复）、`routes/cdk.js`（CDK 兑换码）、`routes/message.js`（站内消息）、`routes/admin-config.js`（SMTP/提醒/备份配置/版本）、`routes/network.js`（网络/端口转发/ikuai/DHCP）
- ✅ 拆分 2 个 WebSocket 代理模块：`websocket/vnc-proxy.js`（QEMU VNC 管道 + LXC VNC TCP/TLS 直连）、`websocket/terminal-proxy.js`（xterm.js SSH PTY）
- ✅ 拆分 4 个服务层模块：`services/expiry-check.js`（到期检查 + 提醒）、`services/backup-polling.js`（备份/恢复进度轮询）、`services/ikuai-sync.js`（ikuai 端口转发启动同步）、`services/dhcp.js`（DHCP 静态绑定）
- ✅ 拆分定时任务模块：`schedule/tasks.js`（定时检查 + 启动初始化）
- ✅ **100% 功能不变**：所有 100+ API 端点、认证逻辑、错误响应与拆分前完全一致，仅代码位置搬移

**Bug 修复：**
- ✅ 修复 `routes/admin-config.js` 缺失 `pkg` 和 `checkExpiredVms/checkExpiredLxc` 导入，导致 `/api/version` 返回 500 和 `/api/check-expired` 报 ReferenceError
- ✅ 清除 `routes/snapshot.js` 中未使用的 `node-schedule` 导入

**部署注意：**
- ✅ 上传全部 `server/` 目录下的新增文件（`config/`、`middleware/`、`utils/`、`routes/`、`websocket/`、`services/`、`schedule/` 下的所有 `.js` 文件）
- ✅ 不需要修改 `.env` 或数据库文件

**前端样式模块化拆分：**
- ✅ `styles.css` 从 1188 行精简到 5 行（`@import` 聚合）：按功能拆分为 4 个独立文件 —— `css/base.css`（CSS 变量/背景/滚动条/动画/排版）、`css/layout.css`（导航栏/卡片/选项卡/模态框）、`css/components.css`（按钮/表单/表格/徽章/头像/标签输入框）、`css/features.css`（消息系统/VM 遮罩/端口转发）
- ✅ 5 个 HTML 页面零改动（`<link href="css/styles.css">` 不变），`@import` 层叠顺序与原文件 100% 一致
- ✅ 修复 Safari 兼容性：7 处 `backdrop-filter` 补充 `-webkit-backdrop-filter` 前缀、2 处 `user-select` 补充 `-webkit-user-select` 前缀

**前端 JS 模块化拆分：**
- ✅ `admin.html` 从 5056 行精简到约 2570 行：内联 JS（约 2700 行）拆分为 5 个独立模块 —— `js/admin/core.js`（核心状态/导航/认证/工具函数注册/alert/confirm）、`js/admin/vm.js`（VM 操作/分配/快照/备份）、`js/admin/lxc.js`（LXC 操作/创建销毁/快照/备份）、`js/admin/admin.js`（用户管理/CDK/SMTP/提醒/快照/备份配置/消息）、`js/admin/network.js`（网络配置/端口转发/设备转发/分页）
- ✅ `dashboard.html` 从 2751 行精简到约 1190 行：内联 JS（约 1600 行）拆分为 5 个独立模块 —— `js/dashboard/core.js`（核心状态/导航/认证/工具函数注册）、`js/dashboard/vm.js`（VM 操作/快照/备份/CDK 兑换）、`js/dashboard/lxc.js`（LXC 操作/密码重置/快照/备份）、`js/dashboard/forward.js`（端口转发/设备转发）、`js/dashboard/message.js`（消息管理）
- ✅ 采用 `window.__namespace` + IIFE + `initXxx()` 模式：每个页面使用独立全局命名空间（`window.__admin` / `window.__dashboard`），模块通过 IIFE 注册状态和函数，`initXxx()` 在 `setup()` 中调用以绑定 Vue 生命周期
- ✅ 所有模板使用的全局工具函数（formatDate/formatUptime/formatMemory/formatBytes/trimContent/formatDateTimeLocal/getGeekAvatar）注册到 `$` 命名空间，Vue 模板可正常访问
- ✅ `app.component()` 定义保留在 HTML 内联 script 中（需要 `app` 实例）
- ✅ **100% 功能不变**：所有页面交互与拆分前完全一致

**Bug 修复：**
- ✅ 修复 `index.html` 已登录用户不区分角色跳转：解析 JWT token 的 `role` 字段，管理员跳转 `admin.html`，普通用户跳转 `dashboard.html`
- ✅ 修复 `server.js` HTML 文件缓存策略：HTML 文件设置 `Cache-Control: no-store`，JS/CSS 资源保留缓存但通过版本号参数破坏缓存
- ✅ 修复 `appVersion` 元素 null 报错：4 个 HTML 页面的版本号脚本加 null 检查

**安全响应头优化：**
- ✅ 新增安全中间件（`server.js` 第 15-25 行）：拦截并丢弃 `Expires` 响应头，统一使用 `Cache-Control`；移除 `X-Frame-Options`，改用 `Content-Security-Policy: frame-ancestors 'self'`
- ✅ `express.static` 的 `setHeaders` 回调兜底清除静态文件的 `Expires` 头，对 CSS/JS/图片等资源应用 `Cache-Control: public, max-age=3600`（1 小时缓存）

### v1.6.0 (2026-06-07)

**端口转发与网络管理：**
- ✅ 新增「网络管理」标签页（管理员）：配置端口转发范围（起始端口~结束端口）、每用户最大规则数、默认外网接口；支持刷新 ikuai 接口列表
- ✅ VM/LXC 管理区新增「网络」子标签页：端口转发列表表格（分页展示，每页 20 条）、添加/编辑/删除/批量删除（管理员）
- ✅ dashboard 用户面板 VM/LXC 区同样新增「网络」子标签页，仅显示当前用户所属设备的转发规则
- ✅ 添加/编辑端口转发弹窗：选择设备自动填入目标 IP、规则名称、协议选择、内外网端口输入、🎲 随机端口、🔍 端口冲突检查
- ✅ 端口范围动态提示：从后端 `GET /api/port-forwards/config` 获取 `port_range_start/end`，前端无硬编码

**ikuai 端口转发同步：**
- ✅ 新增 `ikuai-api.js`：通过 ikuai 原生 `Action/call` 接口实现端口映射 CRUD（`dnat show/add/edit/del`）、DHCP 租约查询（`monitor_lanip/dhcp_lease`）、接口列表查询
- ✅ 新增端口转发自动同步到 ikuai 路由器实时生效
- ✅ 新增启动同步（`syncFromIkuai()`）：服务启动时全量拉取 ikuai 端口映射，按 IP+端口+Comment 三要素匹配，自动导入新规则、标记孤立马
- ✅ 编辑端口转发自动检测端口/IP 变更，触发 ikuai 同步（先删旧规则再加新规则）
- ✅ 端口删除 ikuai 兜底匹配：无 `ikuai_id` 时按外网端口+内网端口+IP 三要素模糊匹配爱快规则
- ✅ 解绑/销毁 VM/LXC 时级联清理端口转发规则（本地 + ikuai）
- ✅ VM IP 自动提取：从 VM 配置解析 MAC → 匹配 ikuai DHCP 租约获取 IP；LXC 直接解析 `ct.config.net0` 的 `ip=` 字段

**DHCP 静态绑定：**
- ✅ VM/LXC 分配时自动创建 DHCP 静态绑定（爱快 `dhcp_static/add`），解绑或销毁时自动删除（`dhcp_static/del`）
- ✅ IP 从指定范围（默认 10.0.0.110-199）中随机选取未被占用的空闲地址
- ✅ 已过 MAC 地址的静态绑定自动跳过，返回已有 IP
- ✅ 网络管理页新增 DHCP 配置：IP 分配范围、所属 LAN 接口、网关、DNS

**DHCP 静态绑定同步：**
- ✅ 新增 `POST /api/ikuai/sync-dhcp-bindings`：从爱快全量拉取 DHCP 静态绑定，按备注 `VM-{id}` / `CT-{id}` 匹配并回写数据库 `dhcp_static_ip` 字段
- ✅ 管理后台 DHCP 卡片新增「🔄 从爱快同步」按钮，显示同步统计（更新/跳过/错误）

**接口列表优化：**
- ✅ `getInterfaces()` 从 `dnat`（WAN）、`dhcp_lease`、`dhcp_static` 三个来源获取全部接口，区分 WAN/LAN 类型
- ✅ 数据库缓存完整接口列表（含 WAN + LAN），前端按类型分别展示（外网接口选 WAN，DHCP 接口选 LAN）

**数据库（db-sqlite.js）：**
- ✅ 新增 `port_forwards` 表（id/type/vm_id/ct_id/name/ip/mac/internal_port/external_port/protocol/enabled/source/sync_status/ikuai_id/created_at/updated_at）
- ✅ config 表新增 `forward:port_range_start/end`、`forward:default_protocol`、`forward:wan_interface`、`forward:max_per_user` 配置项
- ✅ vms / lxc_containers 表新增 `dhcp_static_ip TEXT` 字段，存储 DHCP 静态绑定分配的 IP
- ✅ config 表新增 `dhcp:ip_range_start/end`、`dhcp:interface`、`dhcp:gateway`、`dhcp:dns1/dns2` 配置项

**服务端路由（server.js）：**
- ✅ 网络配置 API：`GET|PUT /api/admin/network/config`
- ✅ 端口转发 CRUD：`GET|POST /api/port-forwards`、`PUT /api/port-forwards/:id`、`DELETE /api/port-forwards/:id`
- ✅ 批量删除 API：`POST /api/port-forwards/batch-delete`
- ✅ 辅助 API：`GET /api/port-forwards/random-port`、`GET /api/port-forwards/check-port`、`GET /api/port-forwards/config`
- ✅ IP 提取 API：`GET /api/port-forwards/extract-ips`（带 DEBUG 开关控制日志输出）
- ✅ ikuai 接口查询：`GET /api/ikuai/interfaces`
- ✅ DHCP 静态绑定同步：`POST /api/ikuai/sync-dhcp-bindings`
- ✅ 强制端口转发启动同步：`POST /api/port-forwards/sync`

**文件结构整理：**
- ✅ `server/ikuai-api.js` → `server/api/ikuai-api.js`，引用路径同步更新
- ✅ `server/ssh-exec.js` → `server/api/ssh-exec.js`，引用路径同步更新
- ✅ `server/db-sqlite.js` → `server/api/db-sqlite.js`，内部 `__dirname` 路径适配（两层目录）
- ✅ `server/api/` 文件夹统一存放所有后端模块

**环境配置：**
- ✅ `.env` 新增 `IKUAI_HOST`、`IKUAI_USER`、`IKUAI_PASSWORD` 配置项
- ✅ `.env` 新增 `DEBUG=false` 调试模式开关，控制 extract-ips 等日志输出
- ✅ 删除废弃的 `IKUAI_API_PORT` 注释

**Bug 修复：**
- ✅ 修复新建端口转发 `ikuai_id` 为空导致删除不同步：`addPortForward` 返回 `undefined`，改为新增后从 ikuai 规则列表反查 ID
- ✅ 修复编辑端口只改端口不改 IP 时不同步 ikuai：增加 `portChanged`/`internalChanged` 检测
- ✅ 修复编辑端口时无 `ikuai_id` 无法删除旧规则：按端口三要素兜底匹配
- ✅ 修复删除弹窗被端口转发弹窗遮挡：先关闭设备弹窗再显示确认弹窗
- ✅ 修复 `db-sqlite.js` 移到 `api/` 后启动报错：`__dirname` 路径从 `../` 调整为 `../../`
- ✅ 修复默认外网接口每次重启后空白：`loadNetworkConfig()` 后自动调用 `refreshIfaceList()`
- ✅ 修复 `getInterfaces()` 只返回 WAN 接口：从 `dnat`、`dhcp_lease`、`dhcp_static` 三个来源获取接口，区分 WAN/LAN 类型
- ✅ 修复 DHCP 所属接口需手动填写：改为下拉框从数据库缓存的接口列表中选取，按类型过滤 LAN 接口
- ✅ 修复 `addDhcpStaticBinding` 参数错误：字段名 `ipaddr` → `ip_addr`，补充 `enabled`/`id`/`newRow` 等必填字段
- ✅ 修复 `extract-ips` 优先使用数据库 `dhcp_static_ip`：已有 DHCP 静态绑定的 VM/LXC 不再查询爱快获取 IP

### v1.5.0 (2026-06-06)

**LXC 容器管理：**
- ✅ 面板基础操作：开机、关机、强制停止、重启、重置密码、销毁（输入 `yes` 确认）
- ✅ LXC XtermJS 网页终端：通过 SSH + PTY 直连 PVE 宿主机执行 `lxc-console`，完全绕过 PVE termproxy 代理层，无需 VNC/TLS/凭证传递；支持窗口自适应 resize（FitAddon），连接时和窗口缩放时实时同步 PTY 尺寸
- ✅ 终端架构独立：新增 [ssh-exec.js](file:///e:/code/pve管理面板/server/api/ssh-exec.js) 的 `createTerminalPty()` 函数；新增 [terminal.html](file:///e:/code/pve管理面板/public/terminal.html)（xterm.js v5.3.0 + FitAddon）；新增 `/term-proxy` WebSocket 端点（`WebSocketServer noServer` 独立处理）；升级 handler 注册 term-proxy 路径
- ✅ 终端安全加固：`createTerminalPty()` 改用 `conn.exec()` 直接启动 `lxc-console` 并分配 PTY，替代早期的 `conn.shell()` + `stream.write()` 方案，消除 bash shell 中间层，宿主机 shell 提示符和系统信息对用户完全不可见
- ✅ 快照创建/回滚解除关机限制：VM 和 LXC 的快照创建移除运行状态拦截，运行中可直接创建/回滚快照；回滚确认提示改为"运行中的数据可能丢失"；VM 快照 `vmstate` 改为 `1`，运行中自动保存内存状态

**后端 API（pve-api.js）：**
- ✅ 新增 LXC 容器操作 API：`getLxcContainers()`、`getLxcStatus()`、`getLxcConfig()`、`startLxc()`、`shutdownLxc()`、`stopLxc()`、`rebootLxc()`、`createLxc()`、`deleteLxc()`、`updateLxcConfig()`、`getLxcVncConsole()`
- ✅ 新增快照 API（`getLxcSnapshots` / `createLxcSnapshot` / `rollbackLxcSnapshot` / `deleteLxcSnapshot`），模式与 QEMU 快照一致，仅路径中的 `qemu` 替换为 `lxc`
- ✅ 新增模板相关 API：`getTemplates(storage)`（获取模板列表）
- ✅ 新增密码重置 API：`resetLxcPassword(vmid, password)` — 通过 SSH `lxc-attach` 在容器内执行 `chpasswd` 修改 root 密码（需容器运行中、宿主机 SSH 配置）

**数据库（db-sqlite.js）：**
- ✅ 新增 `lxc_containers` 表（ct_id/user_id/name/expiration_date/renewal_price/reminderSent/lastReminderDate/created_at）
- ✅ 新增 `lxc_reminders` 表（ct_id/days/sent_at），记录 LXC 到期提醒发送记录
- ✅ 新增 `lxcContainers` 操作模块（CRUD + reminders 子模块）
- ✅ 新增 `lxcConfig` 配置模块（`lxc:max_per_vm`=3、`lxc:default_storage`=local、`lxc:default_memory`=512、`lxc:default_cores`=1、`lxc:default_disk`=8、`lxc:default_swap`=512）
- ✅ `backups` 表新增 `type` 字段（`'vm'`/`'lxc'`）+ `ct_id` 字段，VM 和 LXC 共用备份表
- ✅ `cdk_codes` 表新增 `used_ct_id` 字段，支持 LXC 容器 CDK 续费

**服务端路由（server.js）：**
- ✅ 基础路由：`GET /api/pve/lxc`（admin 列表）、`GET /api/user/lxc`（用户列表）、`POST /api/user/lxc`（分配）、`PUT /api/user/lxc/:id`（换绑/编辑）、`DELETE /api/user/lxc/:id`（解除分配）
- ✅ 模板创建路由：`GET /api/lxc/templates`（模板列表）、`POST /api/lxc/create`（创建容器，含创建任务轮询）
- ✅ 容器操作路由：`POST /api/lxc/:vmid/start`、`/shutdown`、`/stop`、`/reboot`、`/reset-password`、`/destroy`
- ✅ 终端路由：`POST /api/lxc/:vmid/terminal`（返回 terminal.html 页面 URL，不再调用 PVE termproxy API）
- ✅ `/term-proxy` WebSocket 端点：SSH + PTY 直连 PVE 宿主机 `lxc-console`，双向透传 WebSocket↔SSH 流
- ✅ 快照路由：`GET|POST /api/lxc/:vmid/snapshots`、`POST .../rollback`、`DELETE .../:snapname`
- ✅ 备份路由：`GET|POST /api/lxc/:vmid/backups`、`POST .../restore`、`DELETE .../:id`
- ✅ CDK 兑换适配 LXC 续费逻辑
- ✅ LXC 到期检查 + 邮件提醒 + 到期自动关机：`checkExpiredLxc()` 每 5 分钟自动执行（与 VM 共用定时任务），到期前按配置天数发送邮件+站内信提醒，到期后每日发送续费提醒（最多 3 天）并自动关机
- ✅ 导航动态化 API：`GET /api/user/nav`（返回角色感知导航项列表），admin/dashboard/user-center 三页面导航栏统一通过 API 渲染，消除硬编码维护问题

**问题修复：**
- ✅ 修复 admin.html LXC 重置密码请求路径错误（`/password` → `/reset-password`）
- ✅ 修复 LXC 重置密码 500 错误：PVE 对已存在的 LXC 容器无原生改密 API，改用 SSH `lxc-attach` 进入容器执行 `chpasswd` 实现密码重置；依赖宿主机 SSH 配置（`PVE_SSH_HOST` / `PVE_SSH_PASSWORD`），与终端和备份恢复共用同一 SSH 通道
- ✅ 移除 LXC 卡片 VNC 按钮（LXC 不支持 VNC 控制台，终端体验更优），VM 的 VNC 保持不变
- ✅ 修复 LXC 到期检查未发送邮件、未自动关机：`checkExpiredLxc()` 中原先邮件代码为空且无自动关机逻辑，现补全邮件提醒（到期前+到期续费）和到期自动关机
- ✅ 修复 LXC 备份/恢复通知缺失邮件发送：`sendLxcBackupNotification`/`sendLxcRestoreNotification` 原先仅发送站内信，现补全邮件通知
- ✅ 修复分配 LXC 容器后自定义名称未正确显示：`GET /api/pve/lxc` 已分配列表优先使用数据库中的自定义名称而非 PVE hostname

**前端管理后台（admin.html）：**
- ✅ 导航栏新增「LXC 容器管理」入口（位于 QEMU 虚拟机管理 和 管理后台 之间）
- ✅ Tab 1：新建 LXC 容器表单——模板选择、资源配置（CPU/内存/磁盘/Swap）、网络配置（Bridge + MAC + IPv4 + IPv6 DHCP）、存储位置、无特权/自动开机选项
- ✅ Tab 2：分配 LXC 容器——容器选择/用户选择/名称/到期时间/续费价格，待分配列表、已分配列表、换绑功能；标题旁新增「立即检查过期容器」按钮，方便手动触发到期检查
- ✅ Tab 3：容器管理——已分配容器卡片列表，显示名称/CT ID/用户/状态/配置/到期信息；操作按钮分组收纳（电源控制 btn-group：[启动/关机/重启/停止]、终端独立展示、管理下拉菜单：[快照/备份/重置密码/编辑/销毁]）
- ✅ 终端按钮（绿色 btn-success）：调用 `/api/lxc/{vmid}/terminal` 打开 xterm.js 网页终端，LXC 不适用 VNC，以网页终端替代
- ✅ VM 和 LXC 卡片操作按钮统一按功能分组——电源控制用 `btn-group` 合并为连续按钮组（启动/关机/重启/停止），VM 的 VNC 和 LXC 的终端独立展示，管理类操作（快照/备份/重置密码/编辑/销毁）统一收纳进「管理」下拉菜单，减少视觉杂乱
- ✅ 重置密码弹窗：运行状态检测、密码长度校验、容器已关机时禁用+提示
- ✅ 销毁确认弹窗：红色警告、输入 `yes` 确认、不可逆提示
- ✅ 快照/备份弹窗：复用现有 VM 快照/备份弹窗逻辑

**前端用户面板（dashboard.html）：**
- ✅ 导航栏新增「我的 LXC 容器」入口
- ✅ LXC 容器卡片列表（与"我的虚拟机"卡片布局一致）：显示名称/CT ID/状态/配置/到期时间
- ✅ 操作按钮分组收纳：电源控制（启动/关机/重启/停止）用 `btn-group` 合并为连续按钮组，终端独立展示，管理类操作（快照/备份/重置密码/编辑）收纳进「管理」下拉菜单
- ✅ CDK 兑换弹窗新增 LXC 容器类型选择

**UI/UX 交互优化：**
- ✅ 网络配置支持手动填写 MAC + IPv4（CIDR 格式），留空则 DHCP 自动获取；IPv6 默认 DHCP
- ✅ 创建容器时不传 `vmid`，由 PVE 自动分配 CT ID，避免 VMID 冲突
- ✅ 容器信息展示格式与 VM 统一（CPU 核心 / 内存 MB / 磁盘 GB / 运行时长）
- ✅ 过期容器红色边框标记 + 过期标签
- ✅ PVE 端已销毁的容器自动检测并标记

**LXC 容器管理公共功能：**
- ✅ 分配的容器支持 CDK 续费
- ✅ 到期前自动发送站内消息提醒 + 邮件提醒（复用现有提醒机制）
- ✅ 到期后自动禁止开机（与 VM 到期逻辑一致）
- ✅ 管理员可随时换绑容器给其他用户
- ✅ 管理员可销毁容器（面板操作 + PVE API 删除，需输入 `yes` 确认）

### v1.4.1 (2026-06-05)

**虚拟机备份管理：**
- ✅ 新增 PVE API 方法：`getStorageList()`（获取备份可用存储）、`createBackup()`（创建备份任务）、`getTaskStatus()`（查询任务进度）、`deleteBackupFile()`（删除备份文件）
- ✅ 新增 `backups` 表（含 vm_id/user_id/storage/filename/size/status/pve_upid/progress 等字段）；新增 `backup_logs` 表记录每日备份操作次数
- ✅ vms 表新增 `backup_storage` 字段，支持为单个 VM 指定专用备份存储位置
- ✅ config 表新增 3 个备份配置项：`backup:default_storage`（全局默认存储）、`backup:max_per_vm`（每 VM 最大备份数）、`backup:daily_limit`（单用户每日备份上限）
- ✅ 新增 11 个 API 路由：存储列表/备份配置 CRUD/备份 CRUD/批量删除/管理员路由
- ✅ 后台 3 秒轮询备份进度，备份完成/失败自动发送站内信 + 邮件通知用户
- ✅ 服务重启后自动恢复运行中的备份轮询，中断的 pending 备份标记为失败并通知
- ✅ 备份前置检查：VM 必须关机、同一 VM 不可并发备份、普通用户受最大备份数和每日次数限制
- ✅ dashboard.html：VM 卡片新增「备份」按钮，弹窗含创建备份（备注）+ 备份历史表格（全选/批量删除/进度条）+ 限制信息展示
- ✅ admin.html：VM 卡片新增「备份」按钮，弹窗含存储位置选择器 + 备份历史表格（含存储列）；新增「备份配置」标签页；编辑 VM 弹窗新增备份存储位置选择
- ✅ 普通用户不可见存储位置，自动使用管理员预设的存储位置

**备份恢复功能：**
- ✅ 新增 PVE API 方法：`restoreBackup(vmid, volid)`（`POST /nodes/{node}/qemu`，参数 archive+force+unique）
- ✅ 新增 `restore_tasks` 表（id/vm_id/user_id/backup_id/pve_upid/progress/status/created_at/completed_at/error_msg）及完整操作函数
- ✅ 新增 2 个 API 路由：`POST /api/vm/:vmid/backups/:id/restore`（恢复备份，含关机校验+并发保护）、`GET /api/vm/:vmid/restore-status`（查询恢复任务状态）
- ✅ 新增 `startRestorePolling()` 后台 3 秒轮询恢复进度，恢复完成/失败自动发送站内信+邮件通知
- ✅ 服务重启后自动恢复运行中的恢复任务轮询
- ✅ dashboard.html + admin.html 备份表格操作列新增绿色「恢复」按钮（仅 completed 状态显示），确认弹窗提示数据覆盖风险
- ✅ 恢复前置检查：VM 必须关机、备份文件必须完整（status=completed 且有 filename）、同一 VM 不可并发备份/恢复任务

**Bug 修复与 UI 优化：**
- ✅ 修复创建备份时传入了 PVE 不支持的 `notes` 参数导致 `Parameter verification failed`，去掉后恢复正常
- ✅ 修复删除备份时 `deleteBackupFile` URL 编码问题（`encodeURIComponent` 导致 PVE 500，改用 `%3A` 仅编码冒号），文件删除成功不影响后端数据库删除；404（文件已不存在）自动跳过，不再引起报错
- ✅ 修复 `formatBytes` 显示不一致（1024 进制 → 1000 进制，与 PVE 的 GB 显示对齐）
- ✅ 新增 `POST /api/admin/backups/cleanup` 管理员强制清理接口（先删关联 restore_tasks 再删 backups，避免外键约束冲突）
- ✅ 优化确认弹窗支持富文本（`{{text}}` → `v-html`），恢复确认提示红色加粗「已有的快照将会被清除」
- ✅ 备份历史表格新增「备注」列（大小与状态之间），显示创建备份时填写的备注，支持 hover 查看完整内容
- ✅ 备份备注输入框增加实时字符计数（`0/50`），满 50 变红色警告，`maxlength=50` 禁止超限
- ✅ 优化备份表格操作列按钮间距（`me-1` → `d-flex gap-1` flex 标准布局）
- ✅ 优化选中行高亮样式（`table-primary` 实色遮罩 → `rgba(99,102,241,0.08)` 淡紫色半透明）
- ✅ 优化错误提示弹窗层级（`showAlertAndWait` 确保 alert 关闭前不自动弹出备份弹窗）

**PVE API Token 权限要求：**
- ✅ 备份功能需要 API Token 拥有 `VM.Backup`、`VM.Audit`、`Datastore.Allocate` 权限

### v1.4.0 (2026-06-05)

**PVE 认证方式重构（账号密码 → API Token）：**
- ✅ 移除旧的 ticket/CSRF 认证体系，改用 PVE API Token（`Authorization: PVEAPIToken=...`）
- ✅ 删除 `authenticate()`、`ensureAuthenticated()`、`_setupInterceptors()` 方法，代码大幅精简
- ✅ 删除 `PVE_USER`、`PVE_PASSWORD` 环境变量，新增 `PVE_API_TOKEN`
- ✅ 不再需要定时刷新 ticket（API Token 永不过期），服务端无额外网络开销
- ✅ 移除启动时、VNC 连接、定时任务中所有的 `pveApi.authenticate()` 调用

**VNC WebSocket 代理适配：**
- ✅ VNC 代理认证方式从 `Cookie: PVEAuthCookie=...` 改为 `Authorization: PVEAPIToken=...`

**.env 配置变更：**
- ✅ 删除 `PVE_USER`、`PVE_PASSWORD`
- ✅ 新增 `PVE_API_TOKEN`，配置文档同步更新

**虚拟机快照管理：**
- ✅ 新增 4 个 PVE API 方法（getSnapshots / createSnapshot / rollbackSnapshot / deleteSnapshot）
- ✅ 新增 `snapshot_logs` 表，记录用户每日快照创建/恢复次数
- ✅ 新增 `snapshot:max_per_vm`、`snapshot:daily_create_limit`、`snapshot:daily_restore_limit` 三项配置，默认值：5 个/VM、20 次/日、10 次/日
- ✅ 管理员后台新增「快照配置」标签页，可实时调整限制参数
- ✅ 管理员和用户 VM 卡片均新增「快照」按钮，弹出快照管理模态框
- ✅ 创建快照名称严格校验：2~20 位英文、数字、`-`、`_`，实时过滤非法字符，输入框实时显示字符计数（0/20）
- ✅ 创建快照支持运行中创建：移除运行状态拦截，运行中的 VM 和 LXC 均可直接创建快照，VM 快照自动保存内存状态（`vmstate=1`）
- ✅ 回滚快照不再校验关机状态：前端的确认弹窗提示修改为"运行中的数据可能丢失"，取代"需先关机"和"将被锁定"等限制性描述
- ✅ 删除/回滚快照操作先关闭模态框再弹出确认或提示，避免弹窗被遮挡
- ✅ 支持快照多选、全选、批量删除，勾选后标题栏显示「批量删除 (N)」按钮
- ✅ 所有限制仅对普通用户生效，管理员不受限
- ✅ 创建时自动传递 `vmstate=1`，运行中快照自动保存内存状态（PVE 默认行为）
- ✅ 过滤 PVE 内部快照（`__` 开头和 `current`），仅显示用户创建的快照

**二次验证（2FA）：**
- ✅ 引入 `otplib` + `qrcode` 实现 TOTP 标准双因素认证
- ✅ users 表新增 `totp_secret`、`totp_enabled` 字段；新增 `recovery_codes` 回收码表（schema 自动迁移）
- ✅ 修改登录流程：启用 2FA 的用户密码验证通过后返回 `partial_token`（5分钟有效），前端进入第二步验证码输入
- ✅ 新增 `POST /api/login/2fa` 接口，支持 TOTP 验证码和恢复码两种验证方式；严格校验 TOTP 仅限 6 位数字输入，防止恢复码导致 TOTP 库异常崩溃
- ✅ 新增 2FA 设置 API：`setup`（生成密钥+二维码）、`verify`（验证并启用，自动生成恢复码）、`disable`（需验证密码）、`status`、`recovery-codes`（查看）、`recovery-codes/regenerate`（重新生成）
- ✅ 新增管理员 API `POST /api/admin/user/:id/disable-2fa`，可为用户强制关闭 2FA
- ✅ user-center.html 安全标签页：完整的 2FA 设置面板（绑定二维码/密钥验证/恢复码表格展示状态及创建时间/恢复码复制下载与重新生成/禁用密码确认）
- ✅ login.html 新增第二步验证页面，支持输入 6 位 TOTP 验证码或 10 位恢复码，Enter 键提交
- ✅ admin.html 用户表格新增「2FA」列，编辑弹窗显示 2FA 状态 + 禁用按钮
- ✅ 修复 `customConfirmModal` HTML 结构错误（缺失关闭标签导致后续模态框嵌套、backdrop 遮罩层错乱）
- ✅ 恢复码相关操作（复制/重新生成）先关闭模态框再弹出提示，alert 关闭后自动恢复恢复码模态框，避免弹窗被遮挡

### v1.3.0 (2026-06-05)

**认证体系重构（JWT + Refresh Token）：**
- ✅ 引入 `jsonwebtoken` 库，JWT 无状态认证替代内存 `Map` 会话
- ✅ JWT 有效期 15 分钟，Refresh Token 有效期 7 天（持久化到 SQLite）
- ✅ `.env` 支持 `JWT_SECRET` 配置项，重启后 token 仍然有效
- ✅ 新增 `POST /api/auth/refresh` 接口自动续期，用户无感
- ✅ 登出时吊销 Refresh Token，支持主动踢人下线
- ✅ 新增 `refresh_tokens` 表记录所有登录设备
- ✅ JWT 嵌入 `deviceId`，每次请求实时校验设备状态，下线后立即拒绝后续请求

**登录设备管理：**
- ✅ 用户中心新增「安全」选项卡
- ✅ 设备列表展示设备名称、IP、登录时间
- ✅ 支持下线指定设备或一键下线其他所有设备
- ✅ 标记当前设备，当前设备不可下线
- ✅ 设备名称智能提取：根据 User-Agent 解析为 `Chrome / Win10`、`Edge / macOS`、`Safari / iPhone` 等简短标识；支持鸿蒙（HarmonyOS / OpenHarmony）识别

**二次验证预留：**
- ✅ 安全页面预留 2FA 区块（开关样式 + 说明文案 + 「开发中」标记）

**配置文档完善：**
- ✅ `.env` 配置项改为表格展示，每个变量附带详细说明和示例值

**问题修复：**
- ✅ 修复登录错误自动刷新：`api()` 函数中无 token 时 401 不触发跳转，登录页错误正常显示
- ✅ 修复安全页面首次加载设备列表为空：`onMounted` 中遗漏 `activeSubTab === 'security'` 分支，导致只加载了备忘录
- ✅ 移除 login.html 中残留的 `console.log` 调试输出，避免控制台信息泄露
- ✅ 修复 DOM 可访问性警告：补全密码/用户名输入框 `autocomplete` 属性；Modal 启用 `{ focus: false }` 选项并监听 `hide.bs.modal` 事件 blur 焦点，消除 `aria-hidden` 焦点冲突警告
- ✅ 修复跨页面导航后消息列表未加载：`onMounted` 中同时检查 URL hash 和 `activeSubTab`，两种进入消息页面的方式都能正确加载数据
- ✅ 优化 JWT 过期请求：新增 `ensureValidToken()` 本地解码检查 token 剩余有效期，过期前 1 分钟自动静默续期，消除轮询 401 警告

### v1.2.2 (2026-06-05)

**导航优化：**
- ✅ 登录自动角色跳转：管理员→admin.html，普通用户→dashboard.html
- ✅ 消息中心整合到用户中心：改名为"消息"，统一在用户中心内管理
- ✅ 简化导航结构：dashboard.html移除额外标签页，仅显示虚拟机内容
- ✅ admin.html整合虚拟机管理功能：默认显示"虚拟机管理"，无需跳转dashboard
- ✅ 全局统一导航栏：所有页面共享导航，根据角色动态显示"管理后台"入口
- ✅ 角色识别导航：管理员点击"我的虚拟机"自动跳转到admin.html，避免操作割裂
- ✅ admin.html菜单命名优化："我的虚拟机"→"虚拟机管理"，更符合管理员场景

**权限加固：**
- ✅ admin.html权限拦截：普通用户强制跳转dashboard.html
- ✅ 所有页面链接角色感知：品牌链接、导航链接根据user.role动态跳转

**问题修复：**
- ✅ 修复忘记密码链接点击跳转到登录界面：调整onMounted逻辑顺序，优先处理resetPassword参数
- ✅ 修复邮件重置密码链接不生效：index.html添加对resetPassword参数的识别与传递
- ✅ 修复服务器通配符路由路径错误：server.js中返回index.html时使用正确的相对路径
- ✅ 修复 admin.html 中 7 处 API 路径不匹配（`/admin/cdks` → `/admin/cdk/list` 等），导致 API 返回 HTML 页面而非 JSON
- ✅ 修复用户中心头像上传请求头缺失 Content-Type（FormData 不应手动设置 Content-Type）
- ✅ 修复测试邮件发送失败：前端字段名 `email` → `testEmail`，与服务端参数不匹配
- ✅ 修复 CDK 导出 CSV 认证失效：`window.open` 不携带 `Authorization` header，改用 `fetch` + Blob 下载
- ✅ 修复 Modal `aria-hidden` 焦点警告：`bsModalShow` 打开前先 `blur` 当前焦点元素，避免浏览器阻止弹窗

**优化改进：**
- ✅ 版本号集中管理：新增 `GET /api/version` 接口读取 `package.json`，所有页面动态渲染版本号，无需逐个修改 HTML
- ✅ 优化登录页界面：添加自定义背景图片、标题文字居中
- ✅ 标签页状态持久化：admin/dashboard/user-center 切换标签页时自动保存到 `localStorage`，刷新后恢复当前界面
- ✅ 消息角标跳转识别：`user-center.html` 支持 `#messages` hash，从其他页面角标跳转直接显示消息列表
- ✅ 消息管理多选推送：指定用户从单选下拉框改为标签输入框+搜索下拉，支持搜索添加、标签移除，一次向多个用户推送消息
- ✅ 虚拟机卡片显示所属用户：管理员 VM 卡片在 VM ID 旁新增"用户"字段，方便快速查看归属
- ✅ CDK 分配用户：生成 CDK 时可通过搜索标签输入框多选分配给指定用户，每人自动分配一个 CDK，自动发送站内消息和邮件通知；已分配用户的 CDK 仅限该用户使用
- ✅ CDK 分配优化：选中用户后生成数量自动匹配用户数；标签输入框支持退格键删除文字和移除标签；下拉搜索全部使用 Vue 方法处理，避免模板作用域报错
- ✅ CDK 列表多选批量删除：新增 checkbox 全选/取消全选，选中后显示批量删除按钮，支持一次删除多个 CDK
- ✅ 消息编辑框体验优化：Markdown 语法提示（placeholder + 小字说明）；发送空内容/超长校验；指定用户推送显示已选人数；全体推送显示谨慎发布提示
- ✅ 消息内容 Markdown 渲染：引入 marked 库，消息详情弹窗支持图片、加粗、链接、标题、列表等 Markdown 语法解析显示

**可访问性优化（Web Interface Guidelines）：**
- ✅ 修复表单可访问性：所有 `<input>` 添加关联 `<label>`（`for`/`id`）、`name` 和 `autocomplete` 属性
- ✅ 修复装饰性图标：`login.html` 弹窗 SVG 添加 `aria-hidden="true"`，避免屏幕阅读器朗读无意义图形
- ✅ 修复图标按钮：`dashboard.html`/`admin.html`/`user-center.html` 消息铃铛添加 `aria-label="消息"`
- ✅ 修复头像图片：导航栏头像添加 `alt=""`（装饰性图片无需描述）
- ✅ 修复语义化元素：`login.html` "忘记密码"从 `<a href="#">` 改为 `<button type="button">`，避免伪链接误导
- ✅ 修复 VNC 按钮可访问性：所有快捷键按钮添加 `aria-label` 描述实际功能
- ✅ 修复触摸交互：`vnc.html` 按钮添加 `touch-action: manipulation`，消除双击缩放延迟
- ✅ 修复动画性能：`styles.css` 3 处 `transition: all` 改为具体属性列表（`transform`/`box-shadow`/`border-color` 等），减少重绘

**清理优化：**
- ✅ 删除废弃的 `public/app.js`：完全移除死代码
- ✅ 删除废弃的 `db.js`：LowDB 旧版已完全迁移到 SQLite

**CDK 兑换体验优化：**
- ✅ 修复虚拟机选择列表滚轮无效：原生 `<select>` 在模态框中滚轮事件失效，替换为自定义下拉框组件，CSS 设置 `max-height: 240px; overflow-y: auto`
- ✅ 修复下拉框点击无响应/鼠标光标加载状态：移除全局 `document.addEventListener('click')` 监听器，改用 Vue 事件冒泡（`@click.stop`/`@click`）机制，避免与 Bootstrap Modal 焦点管理冲突
- ✅ 虚拟机列表加载优化：移除 CDK 兑换弹窗中单独的 `/user/cdk/redeemable-vms` API 调用，复用页面已加载的 `userVms` 数据，打开弹窗即显示列表
- ✅ 移除"不选择（直接充值积分）"选项：当前系统无积分功能，用户必须选择虚拟机
- ✅ 修复 placeholder 文字颜色/光标异常：Bootstrap `.placeholder` 类名自带加载动画效果，改为自定义 `.custom-select-placeholder` 类
- ✅ 无名称虚拟机默认显示 VMID：`vm.name || 'VM ' + vm.vm_id` 兜底显示

**表格样式优化：**
- ✅ 修复 CDK 表格表头样式：去除 Bootstrap `table-dark` 类覆盖，恢复紫色渐变表头，与主题统一
- ✅ 全局表格深色主题适配：背景改为深紫色 `#1a1740`，文字使用 `#e2e8f0`，无透明叠加确保文字清晰可见
- ✅ 重置 Bootstrap 表格 CSS 变量：覆盖 `--bs-table-bg/color/striped-bg` 等变量，消除 Bootstrap 默认样式干扰

**问题修复：**
- ✅ 修复消息角标进入用户中心后头像丢失：`loadProfile()` 未在 `#messages` 分支中被调用，导致 `profileForm.avatar` 保持空值
- ✅ 修复登录失败自动刷新导致错误提示不可见：`api()` 函数中 401 跳转仅在有 token 时触发，未登录场景的 401 正常返回给调用方
- ✅ 修复 admin 页面跨页面导航区块错乱：跨页面链接添加 `?section=vms/admin` 参数，admin.html 读取 URL 参数设置默认区块
- ✅ 修复 admin 页面切换区块后刷新回退：`activeSection` 切换时通过 `history.replaceState` 同步更新 URL 参数，刷新后保持当前区块
- ✅ 修复 CDK 批量删除报错：`selectedCdkIds`、`batchDeleteCdk`、`toggleSelectAllCdk` 未在 `setup()` 的 `return` 中导出导致模板渲染报错 `Cannot read properties of undefined (reading 'length')`

**登录页面优化：**
- ✅ 前端即时空校验：用户名/密码为空时即时提示「用户名不能为空」「登录密码不能为空」，无需等待提交
- ✅ 后端认证失败统一文案：服务端返回「用户名或密码不正确，请核对信息后重试」，不区分账号不存在/密码错误，防爆破
- ✅ 网络异常处理：检测 fetch/NetworkError，显示「服务器连接异常，请稍后再试」
- ✅ 错误提示红色风格：颜色 `#ff6b72`，轻微霓虹光晕，键入内容自动清空错误提示

### v1.2.1 (2026-05-21)

**问题修复：**
- ✅ 修复模态框（Modal）遮罩层卡死问题：所有 modal 用 `<Teleport to="body">` 移到 body 层级，避免 Vue 容器 z-index 冲突
- ✅ 修复全站动画变慢问题：`bsModalShow` 改用 `getOrCreateInstance`，去掉每次重建实例的性能开销
- ✅ 修复 admin 页面确认弹窗（customConfirm）Promise 永不 resolve：共享函数 `confirmOk(customConfirmResolve)` 参数传入方式错误，改为页面本地闭包函数
- ✅ 修复已过期 CDK 无法清理：SQLite 中 ISO 格式日期包含 `T` 分隔符与 `datetime('now')` 的空格格式不兼容导致比较失效
- ✅ 修复 VM 分配时 `assignForm.vm_id` 为空导致服务器 500 崩溃（`NOT NULL constraint failed`）
- ✅ 废弃 `public/app.js`：前端已拆分为独立页面，移除死代码

**优化改进：**
- ✅ 版本号集中管理：新增 `GET /api/version` 接口读取 `package.json`，所有页面动态渲染版本号，以后改版本只需修改 `package.json` 的 `version` 字段 + 重启服务器

**前端架构重构：**
- ✅ 单体 `app.js` 拆分为独立 HTML 页面：`login.html` / `dashboard.html` / `admin.html` / `user-center.html`
- ✅ 公共逻辑抽取到 `shared.js`（api、customAlert、customConfirm、authGuard、getGeekAvatar 等）
- ✅ 所有 modal 使用 Vue 3 `<Teleport to="body">` 渲染到 `<body>` 层级，彻底修复各类遮罩层级问题

### v1.2.0 (2026-05-21)

**新功能：**
- ✅ 站内消息系统（消息中心、未读角标、分类筛选、详情弹窗）
- ✅ 管理员消息推送（全体推送/指定用户，系统公告/业务通知/客服私聊）
- ✅ 自动业务消息触发（VM分配、VM移除、到期提醒、续费提醒、CDK兑换）
- ✅ 未读消息自动置顶（ORDER BY is_read ASC, created_at DESC）
- ✅ 红色【未读】/灰色【已读】状态标签，醒目区分消息状态
- ✅ 一键全部设为已读（独立按钮，常驻显示）
- ✅ 清空已读消息（未读消息禁止批量删除，仅可删除已读）
- ✅ 全站统一自定义弹窗（全局覆盖 alert/confirm，深色科技风格 Modal）
- ✅ 异步确认弹窗（Promise 驱动，支持 await 调用）

**优化改进：**
- ✅ 消息列表分类筛选修复（SQL 括号优先级导致类型过滤失效）
- ✅ 自定义 confirm 弹窗 Promise 正确性修复（不依赖 Bootstrap 事件）
- ✅ 消息管理和消息中心页面居中布局（col-md-8 + justify-content-center）
- ✅ 导航 pills 美化（hover 反馈、激活光晕 box-shadow）
- ✅ 文档同步更新

### v1.1.0 (2026-05-20)

**新功能：**
- ✅ CDK 兑换码系统（管理员生成/批量生成/CSV导出）
- ✅ CDK 有效期管理（过期自动作废）
- ✅ CDK 使用追踪（查看使用用户和虚拟机）
- ✅ CDK 清理（一键清理过期和已使用的 CDK）
- ✅ 用户 CDK 兑换续费
- ✅ CDK 续费成功邮件通知
- ✅ 续费提醒重置（CDK 兑换后重新计算提醒时间）

**优化改进：**
- ✅ 到期的虚拟机对普通用户仍然正常显示，不再隐藏
- ✅ 虚拟机列表接口增加兜底降级策略，PVE 异常时不阻塞 UI
- ✅ 修复普通用户虚拟机列表接口参数缺失导致 500 错误
- ✅ 续费提醒每天仅发送 1 次，连续 3 天后自动停止
- ✅ 到期前提醒也支持每日去重，避免重启后重复发送
- ✅ 移除无用的空壳代码 `syncSentRemindersToDb`
- ✅ 所有提醒记录持久化到数据库，重启后自动恢复当日记录
- ✅ 续费价格字段（分配 VM 时可设置，卡片和邮件中显示）
- ✅ 修复分配 VM 时续费价格未写入数据库导致卡片不显示的问题
- ✅ 修复删除 VM 时 CDK 外键约束冲突问题
- ✅ 修复虚拟机卡片文字颜色在深色主题下显示不清的问题
- ✅ 用户中心合并：备忘录合并到用户设置页面，移除独立子选项卡
- ✅ 用户中心居中布局，与虚拟机页面保持一致
- ✅ 极客风格头像：无头像用户基于用户名自动生成唯一 SVG 电路板渐变头像
- ✅ 用户管理表格显示用户头像
- ✅ 虚拟机标签统一：到期时间/续费价格始终显示，无内容时占位"无限期"/"暂无"
- ✅ 虚拟机卡片等高：flex 弹性布局，卡片高度一致，按钮吸附底部
- ✅ PVE 后端 VM 销毁检测：自动 404/配置文件不存在检测，卡片红色毛玻璃遮罩，管理员可直接移除分配
- ✅ "网络" 更名为 "网络流量"，formatBytes 支持自动换算到 TB/PB 并智能小数位
- ✅ "磁盘" 更名为 "磁盘IO"，箭头与中文标注（读/写、下载/上传）统一
- ✅ 运行时长显示：读取 PVE uptime 字段，卡片显示 "X天X小时"
- ✅ 新增重启和强制停止按钮，支持 PVE reset/stop 接口
- ✅ 内嵌确认遮罩：关机/重启/停止改为卡片内遮罩确认，不再使用浏览器弹窗
- ✅ 编辑 VM 支持重新分配用户：管理员编辑弹窗新增"分配给"下拉框，可直接转给其他用户

### v1.0.0 (2026-05-20)

**新功能：**
- ✅ 多租户系统（管理员/普通用户）
- ✅ 接入已有虚拟机
- ✅ 虚拟机到期管理
- ✅ 虚拟机监控（CPU、内存、网络、磁盘）
- ✅ 权限控制
- ✅ 用户中心（头像、个人简介、备忘录）
- ✅ SMTP 邮件功能
- ✅ 邮箱绑定与验证
- ✅ 忘记密码功能
- ✅ 到期提醒（支持配置多个时间点）
- ✅ 到期续费提醒
- ✅ VNC 控制台（WebSocket 代理）
- ✅ 虚拟机操作（开机、关机）
- ✅ 现代化界面设计
- ✅ 普通用户编辑功能
- ✅ 已分配虚拟机管理
- ✅ 用户邮箱管理（管理员可直接激活）
- ✅ 日期选择器优化
- ✅ SQLite 数据库
- ✅ 自动数据迁移
- ✅ VMID 显示
- ✅ PVE Token 自动刷新

**技术升级：**
- 迁移到 SQLite 数据库（更安全、更高效）
- 添加自动认证重试机制（解决 PVE token 过期问题）

## 许可证

MIT License
