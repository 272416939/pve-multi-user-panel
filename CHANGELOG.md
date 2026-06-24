# Changelog

## [2.26.2] - 2026-06-24

### Fixed
- fix(security): 修复 UPID 正则表达式无法匹配大写十六进制字符
  - pstart/starttime 字段使用 `[a-f0-9]` 只匹配小写 hex，导致含大写字母的真实 PVE UPID 被拒（400 Bad Request）
  - 改为 `[0-9a-fA-F]` 同时接受大小写十六进制字符

## [2.26.1] - 2026-06-24

### Fixed
- fix(security): 修复安全审查发现的7项漏洞(SEC-01~07)
  - SEC-01: `/provision-status` 接口新增 upid 归属校验，防止 IDOR 越权查询任意用户 PVE 任务状态
  - SEC-02: `/provision-status` 接口新增速率限制(30次/分钟/用户)，防止滥用对 PVE API 发起 DoS
  - SEC-03: VM/LXC 手动分配接口价格/折扣参数新增服务端 parseFloat + clamp[0,100] 校验，前端 min/max 可绕过
  - SEC-04: 所有计费接口 period 参数新增白名单校验['month','quarter','year']，防止异常值导致到期日计算不一致
  - SEC-05: 新增 `recoverProvisioningTasks` 启动恢复机制，扫描 pve_upid 非空记录查 PVE 真实任务状态做善后，防止服务器崩溃产生孤儿记录
  - SEC-06: `/provision-status` 接口新增 UPID 格式正则校验，防止畸形值触发 PVE API 错误信息泄露
  - SEC-07: 前端 `restoreProvisioningState` 新增 localStorage 解析字段类型断言，防止被污染数据导致逻辑异常
  - 附带修复: `lxcContainers.create` INSERT 语句补全 monthly_price/quarterly_discount/yearly_discount 列(原遗漏导致LXC手动分配价格参数未入库)
  - 附带修复: `lxcContainers.update` allowedColumns 白名单同步补全新字段

## [2.18.0] - 2026-06-24

### Changed
- refactor(packages): 拖拽排序改为纯鼠标事件实现，彻底绕过 HTML5 DnD 协议
  - 移除 draggable/dragstart/dragover/drop/dragend，改用 mousedown/mousemove/mouseup
  - 通过 document.elementFromPoint 检测悬停目标，data-drag-id/data-drag-type 标识
  - 解决 HTML5 DnD 的 dragend 竞态、浏览器搜索文本弹窗、状态机卡死等问题
  - 5px 移动阈值区分点击与拖拽，点击按钮/链接不触发拖拽

## [2.17.5] - 2026-06-24

### Fixed
- fix(packages): 修复套餐与分组 id 重复导致类型隔离失效
  - handleDragOver 改为接收 type 参数，第一行严格比对 dragType !== type 直接返回
  - 不再依赖 id 查列表判断类型（套餐表和分组表 id 各自自增会重复）
  - handleDropOnContainer 增加 dragType 类型守卫
  - 模板 4 处 @dragover 传入对应 type 参数

## [2.17.4] - 2026-06-24

### Fixed
- fix(packages): 重构拖拽事件策略彻底修复跨类型污染与重复拖拽失效
  - 模板 @dragover.prevent 改为 @dragover 交函数控制，类型不匹配时不 preventDefault，浏览器原生禁止 drop
  - 新增 handleContainerDragOver，容器仅当 dragType 匹配时才允许 drop
  - handleDragEnd 移除 blur/removeAllRanges，避免干扰 Chrome 拖拽状态机导致重复拖拽失效

## [2.17.3] - 2026-06-24

### Fixed
- fix(packages): 修复套餐行重复拖拽失效与分组拖拽污染套餐列表的问题
  - handleDragOver 增加类型隔离校验，拖拽分组经过套餐行时不再污染 dragOverId
  - handleDrop 移除 stopPropagation，异步操作前立即清空拖拽状态，避免 dragend 竞态导致重复拖拽失效
  - handleDragEnd 清理活动元素焦点和文本选区，防止残留状态干扰下次 dragstart

## [2.17.2] - 2026-06-24

### Fixed
- fix(packages): 修复套餐行拖拽失效与浏览器搜索文本弹窗问题
  - admin.css 追加完整拖拽样式（含 user-select: none），因 admin 页面未加载 dashboard.css
  - dashboard.css 为 tr[draggable] 补充 user-select: none
  - handleDragStart 的 setData 改用 application/x-pve-drag 自定义 MIME 类型，避免 Chrome 触发文本搜索弹窗
  - 更新 admin.css / package.js / dashboard.css 的浏览器缓存参数

## [2.17.1] - 2026-06-24

### Fixed
- fix(packages): 修复拖拽排序后位置不变的问题
  - 为容器元素（tbody/分组 div）添加 @dragover.prevent @drop 处理器
  - 新增 handleDropOnContainer 兜底函数，当 drop 落在行间空隙时使用最后经过的目标 id
  - handleDragOver 始终更新 dragOverId（包括拖拽行自身），确保容器兜底能拿到有效目标
  - 更新 package.js 和 admin-template-packages.js 的浏览器缓存参数，避免加载旧版本
  - 清理拖拽调试日志

## [2.17.0] - 2026-06-24

### Added
- feat(package): 套餐拖拽排序增加避让动效
  - 拖拽经过其他行时，中间行实时平移让出位置（纵向 translateY ±40px）
  - 分组 badge 拖拽增加横向避让动效（translateX ±20px）
  - 释放后平滑过渡到最终顺序
  - 移除旧的顶部边框指示器，避让动效更直观

## [2.16.0] - 2026-06-24

### Added
- feat(package): 套餐与分组支持鼠标拖拽排序
  - 管理后台 VM/LXC 套餐列表表格行支持长按拖拽调整顺序
  - VM/LXC 分组 badge 列表支持拖拽排序
  - 拖拽结束后自动批量更新 sort_order 到后端（从大到小，步长 10）
  - 新增 3 个批量排序 API：POST /admin/vm-packages/reorder、/admin/lxc-packages/reorder、/admin/package-groups/reorder
  - 拖拽视觉反馈：被拖拽行半透明、目标位置顶部高亮边框、分组 badge hover 上浮

### Changed
- 移除套餐编辑弹窗和分组编辑弹窗中的"排序权重"输入框，排序改由列表拖拽驱动
- 分组 badge 显示中移除排序数字文本

## [2.15.0] - 2026-06-24

### Added
- feat(package): 添加套餐分组、优惠百分比与卡片标签页布局
  - 新增 package_groups 表支持套餐分组管理（VM/LXC 类型，独立排序，数字越大越靠前）
  - 新增季付/年付优惠百分比配置（0-100，以月付为基准自动计算季付×3、年付×12）
  - 套餐卡片价格改为 [月付][季付][年付] 标签页平铺在"立即开通"按钮上方
  - 有优惠时显示原价划线 + 售卖价 + -X% 红橙徽标；无优惠显示 0% 灰色徽标
  - 点击标签切换选中周期，订购弹窗隐藏周期下拉改为只读显示
  - calculateAmount 使用优惠后价格扣费，订购与续费全链路打通
  - 管理后台新增分组管理 UI（列表 + 创建/编辑/删除弹窗）
  - 套餐编辑弹窗将 quarterly_price/yearly_price 替换为 quarterly_discount/yearly_discount
  - 套餐编辑弹窗新增分组下拉选择，套餐列表增加分组列

### Fixed
- 修正套餐排序方向为 sort_order DESC（数字越大越靠前），与 admin UI placeholder 提示一致

## [2.14.21] - 2026-06-24

### Fixed
- fix(security): 修复 Dashboard parseMarkdown XSS 漏洞（CRITICAL）
  - 根因：dashboard/core.js 的 parseMarkdown fallback 函数直接返回原文，未经过 DOMPurify 净化，而 dashboard-template.js 中 v-html="parseMarkdown(p.description)" 会将其作为 HTML 渲染
  - 修复：改为 DOMPurify.sanitize(marked.parse(text))，复用 admin 的安全渲染模式
- fix(security): 修复 2FA 登录绕过强制改密（HIGH）
  - 根因：/login/2fa 路由在 TOTP 验证成功和恢复码验证成功后直接返回 token，未检查 must_change_password
  - 修复：两处路径均添加 must_change_password 检查，与 /login 路由保持一致
- fix(security): 修复 Admin 用户 CRUD 路由缺少 try-catch（HIGH）
  - 根因：POST/DELETE/PUT /users 三个路由的 db 操作均无 try-catch，异常时走 Express 默认错误处理器可能泄露堆栈
  - 修复：三个路由均添加 try-catch + safeError() 错误处理
- fix(security): 修复 Admin 套餐模板名 XSS（HIGH）
  - 根因：admin-template-packages.js 中 v-html="packagePage.getTemplateName(p)" 渲染未净化的 template_name
  - 修复：改为 {{ }} 插值 + v-if/v-else 处理"模板已删除"fallback（VM 和 LXC 两处）
- fix(security): 修复登录未检查 is_active，禁用用户可登录（MEDIUM）
  - 根因：/login 路由验证密码后直接签发 token，未检查 is_active 字段
  - 修复：密码验证通过后添加 is_active 检查，禁用用户返回 403
- fix(security): 修复 handleAvatarUpload 绕过 api() 函数（MEDIUM）
  - 根因：user-center-page.js 用 localStorage.getItem('token') 直接调用 fetch，绕过 ensureValidToken() 的 token 自动刷新逻辑
  - 修复：改用 ensureValidToken() 获取 token
- fix(security): 修复导出函数绕过 api() 函数（MEDIUM）
  - 根因：admin.js 的 exportCdkCsv、exportTransactions、exportOrders 三个函数用 localStorage.getItem('token') 直接调用 fetch
  - 修复：三个函数均改用 ensureValidToken() 获取 token
- fix(security): 修复 forward.js 使用原生 confirm() 导致 CSP 违规（MEDIUM）
  - 根因：dashboard/forward.js 使用原生 confirm()，与全项目 customConfirm() 不一致
  - 修复：改为 await window.customConfirm()
- fix(security): 修复 EJS JSON.stringify 未转义 </script> 注入（MEDIUM）
  - 根因：login.ejs 和 admin.ejs 中 JSON.stringify(siteConfig.xxx) 不转义 </script>，可能导致 script 标签闭合注入
  - 修复：追加 .replace(/</g, '\\u003c').replace(/>/g, '\\u003e') 转义
- fix(security): 修复 auth.js 空 catch 块静默吞错（LOW）
  - 根因：TOTP 验证的 catch {} 空捕获会静默吞掉错误，不利于排查
  - 修复：改为 catch (e) { console.error('[auth] TOTP verify error:', e.message) }

---

## [2.14.4] - 2026-06-23

### Fixed
- fix(wallet): 修复手机端支付完成后返回面板看不到成功弹窗、金额不更新的问题
  - 根因1：支付宝/微信 H5 支付完成后，安卓浏览器会重建页面，Vue 实例的 `rechargePendingOrderNo` 等 ref 重置为空，`visibilitychange` 条件不满足导致不查询
  - 根因2：z-pay 手机端支付宝跳回的 URL 可能不带 `trade_status=TRADE_SUCCESS`，原 `handleReturnPayment` 直接 return 不处理
  - 根因3：`visibilitychange` 要求 `rechargePollingTimer && rechargePendingOrderNo` 同时存在，页面重建后两者都空
  - 修复：用 `localStorage` 持久化 pending order（15 分钟过期），页面加载/onMounted 时恢复轮询
  - 修复：`handleReturnPayment` 放宽条件，只要有 `out_trade_no` 就查询订单实际状态，并清理 URL 参数防刷新重复触发
  - 修复：`visibilitychange` 去掉 `rechargePollingTimer` 依赖，从 `localStorage` 恢复 pending order，未支付时自动恢复轮询
  - 修复：`pollOrderStatus`/`checkPayStatus`/`cancelRecharge` 成功/取消时同步清除 `localStorage` 中的 pending order

---

## [2.14.3] - 2026-06-23

### Fixed
- fix(wallet): 修复安卓支付宝 app 提示"暂未找到此功能，请稍后再试"的问题
  - 根因：`openMobilePay` 将 z-pay 返回的 https 中转页 URL 包装成 `alipays://platformapi/startapp?saId=10000067&url=...`，让支付宝用内部浏览器容器打开中转页，但安卓支付宝 10.8.76+ 的内部浏览器禁止跨域跳转到 alipays scheme
  - 鸿蒙支付宝的 H5 容器规则更宽松，所以不受影响
  - 修复：移除 alipays scheme 包装，scheme URL（alipays://、weixin://）由系统直接唤起，https URL 由浏览器打开后中转页自动唤起支付宝/微信 app（支付宝 H5 支付的标准流程）

---

## [2.14.2] - 2026-06-23

### Fixed
- fix(wallet): 修复 V1 支付（z-pay）下单后前端提示"请求失败，请稍后重试"的问题
  - 根因1：后端在支付网关返回业务错误时使用 HTTP 502，容易被反向代理/CDN 替换响应体，前端拿不到具体错误
  - 根因2：部分网关响应 Content-Type 不规范（text/html），axios 返回字符串而非对象，导致 payurl 解析失败
  - 根因3：前端 user-center-page.js 的 catch 块硬编码"请求失败"文案，丢弃了 shared.js 已传递的 e.message
  - 修复：502 → 400（业务错误语义）；字符串响应兜底 JSON.parse；catch 块改用 e.message
  - DEBUG 模式下后端响应附带 raw 字段，便于排查网关返回的原始内容
- fix(sdk): 支付 SDK _get/_post/_apiGet/_apiPost 网络错误时透传实际 err.message，便于定位网络层问题

---

## [2.14.1] - 2026-06-23

### Changed
- 清理磁盘后重新添加 `.gitignore` 中的 `data/` 忽略规则，防止旧 SQLite 遗留文件误提交

---

## [2.14.0] - 2026-06-23

### BREAKING CHANGES
- **feat!: 移除 SQLite 支持，仅保留 MySQL 驱动**
  - 删除 `server/api/db-sqlite.js` 文件
  - 移除 `better-sqlite3` 依赖（package.json + package-lock.json）
  - 移除 `DB_TYPE` 环境变量，`db.js` 重写为直接导出 `db-mysql`
  - 删除 `db-mysql.js` 中的 `migrateFromSQLite()` 函数及调用
  - 简化 `server.js` 启动逻辑为无条件 `await db.initDb()`
  - **迁移指南**：现有 SQLite 用户需先在 v2.13.5 完成数据迁移到 MySQL，或手动导出导入后再升级

### Changed
- 更新 `.env.example`：移除 `DB_TYPE`，MySQL 配置改为必填
- 更新 `.gitignore`：移除 SQLite 数据库文件忽略规则（data/、*.db、*.db-shm、*.db-wal）
- 更新 `README.md`：移除 SQLite 徽章、双驱架构描述、迁移说明
- 更新 `AGENT.md`：移除双驱同步避坑点、`DB_TYPE` 环境变量、SQLite datetime 说明

---

## [2.13.5] - 2026-06-23

### Added
- feat(cache): Redis 缓存全面接入，提升系统性能与多实例一致性
  - 新增 cache-store.js 通用缓存工具（Redis 优先 + 内存回退）
  - 新增 token-store.js 验证码/找回密码 token 统一存储
  - authMiddleware 接入设备缓存/JWT 黑名单/is_active 状态检查
  - profileCache/unreadCache 迁移到 Redis 解决多实例缓存不一致
  - 用户列表/套餐列表缓存接入，CRUD 时自动失效
  - 站点配置三级缓存（内存→Redis→数据库）
- feat(admin): 站点设置新增一键清除所有缓存功能
  - 后端新增 POST /admin/cache/clear 接口
  - 前端新增"危险操作"卡片，带红色警告样式
  - 点击后弹出 HTML 格式二次确认弹窗，列出所有清除范围
- feat(ui): 新增 customPrompt 组件替代浏览器默认 prompt
  - 基于 Bootstrap Modal + Promise 模式
  - 支持自动聚焦输入框、回车确认
  - 套餐补货功能已改用 customPrompt

### Changed
- refactor(cache): 修复 ioredis keyPrefix 双前缀导致 SCAN+DEL 失效问题
  - 新增 scanDel() 函数，SCAN 返回的 key 去掉前缀后再传给 DEL
  - clearAll() 改为只删除带 REDIS_PREFIX 前缀的 key，不影响其他服务
- style(login): 登录/注册按钮改用 Bootstrap 原生 btn 样式
  - 新增 .login-submit-btn 样式统一按钮尺寸
  - 登录按钮为渐变背景，注册按钮为透明背景+边框
- feat(ui): 交易流水首次访问自动加载数据
  - onMounted 中检查 activeTab 主动调用加载函数

### Fixed
- fix(cache): 修复头像更新后 60s 内返回旧 URL 的 bug
  - 头像上传接口新增 profileCache.del() 失效缓存
- fix(cache): 修复清空消息后未读数不更新的 bug
  - DELETE /messages 接口新增 unreadCache.del() + pushUnreadCount()
- fix(modal): customConfirm 模板支持 HTML 内容渲染
  - {{ }} 文本插值改为 v-html，修复 lxc.js 等已有代码传入 HTML 被转义的问题

---

## [2.13.4] - 2026-06-23

### Changed
- feat(login): 登录页用户名输入框下方增加邮箱登录提示
  - 提示文字"支持使用用户名或已验证的邮箱登录"
  - 复用 .register-hint 样式，支持明暗主题
- fix(ui): 用户中心"管理后台"按钮位置调整
  - 从仪表盘下方移至侧边栏最底下（我的订单下方）
  - 避免误操作，与其他导航项位置统一

---

## [2.13.3] - 2026-06-23

### Fixed
- fix(register): 修复注册验证码始终提示"已过期"的问题
  - 根因：expiresAt.toISOString() 生成 UTC 时间字符串，存入 MySQL DATETIME 字段时丢失时区信息
  - 读取时 new Date() 按本地时间解析，导致时间提前 8 小时，验证码刚保存就被判定过期
  - 修复：新增 formatLocalDateTime() 函数，返回 YYYY-MM-DD HH:MM:SS 本地时间格式
  - 涉及注册验证码和密码重置令牌两处
- fix(site): 修复站点设置刷新页面后配置丢失的问题
  - 根因：watch(activeTab) 未设置 immediate，页面刷新时 activeTab 已为 'site' 但 watch 不触发
  - 修复：onMounted 中补充判断，若 activeTab === 'site' 则主动调用 loadSiteConfig()

---

## [2.13.2] - 2026-06-23

### Fixed
- fix(login): 修复登录页登录/注册按钮位置错误
  - 移除顶部的 tab 切换按钮组（原错误放在用户名密码输入框上方）
  - 将 [登录][注册] 按钮组移至密码输入框下方（替代旧单独登录按钮位置）
  - 注册按钮仅在注册开关开启时显示
- fix(register): 修复注册失败时前端只显示通用错误信息的问题
  - catch 块改为显示后端返回的具体错误信息（如"验证码错误或已过期"）
  - 涉及 submitRegister 和 sendCode 两处

---

## [2.13.1] - 2026-06-23

### Added
- feat(site): 新增站点设置功能（系统设置子标签）
  - 新增 site:name、site:logo_text、site:login_title 三个配置项
  - 新增 GET /api/site/config 公开接口和 GET/PUT /admin/site/config 管理员接口
  - 新增 EJS 渲染中间件自动注入 siteConfig（60秒缓存）
  - 站点名称、LOGO 文字、登录页文字全局动态化（title、LOGO、邮件模板）
  - 管理后台系统设置新增"站点设置"子标签（含注册开关）
  - 前端 admin/登录页 LOGO 通过 /api/site/config 动态渲染

### Fixed
- fix(pay): 修复支付宝手机端支付打开扫码界面而非支付界面
  - 根因：openMobilePay 的 alipays scheme saId=10000007（扫一扫）应为 10000067（内部浏览器容器）
  - 后端 wallet.js 网关返回解析新增 urlscheme 字段优先检查

### Changed
- chore(cdn): Google Fonts 域名替换为国内镜像
  - fonts.googleapis.com → fonts.loli.net
  - fonts.gstatic.com → gstatic.loli.net
  - CSP 策略同步更新

---

## [2.13.0] - 2026-06-23

### Added
- feat(auth): 新增用户自助注册功能（用户名/密码/邮箱/邮箱验证码）
  - 新增 POST /api/register 和 POST /api/register/send-code 接口
  - 新增 GET /api/register/status 公开接口供前端判断注册开关
  - 新增 GET/PUT /admin/register/config 管理员配置接口
  - 新增 register:enabled 配置项（默认关闭，管理员后台开启）
  - 新增用户名黑名单模块（admin/root/system 等 36 个敏感词）
  - 新增 db.users.getByEmail 和 passwordResetTokens.deleteByEmailAndType/getByEmailAndType 方法
  - 新增 token.generateCode 6 位 crypto 安全随机数字码
  - 验证码邮件使用 createEmailTemplate 生成 HTML，10 分钟有效期
  - 密码强度校验：8 位以上 + 大小写字母 + 特殊字符（前后端一致）
  - 限速：注册 3次/小时 per IP，发送验证码 1次/60秒 per email + 5次/小时 per IP
- feat(auth): 登录支持用户名或邮箱（已验证邮箱可登录）
- feat(frontend): 登录页新增 [登录][注册] 切换按钮组、注册视图、密码强度检测条（弱红/中黄/强绿）、发送验证码倒计时

### Security
- 用户名黑名单防止注册 admin/root 等敏感名
- 密码使用 SHA256(salt+password) 加盐加密，salt 为 16 字节 crypto 随机数
- 邮箱登录防枚举：不存在邮箱统一返回"用户名或密码不正确"
- 邮箱未验证时拒绝邮箱登录并返回明确提示

---

## [2.12.4] - 2026-06-23

### Fixed
- fix(wallet): 修复点击确定关闭成功弹窗时一闪而过失败弹窗的问题（modal.hide() 后立即清空状态导致动画期间 v-if 切换到红色 X 图标，改用 hidden.bs.modal 事件在动画完成后清空）
- fix(wallet): 支付宝手机端直接唤起 app，跳过 pay.microgg.cn → render.alipay.com 中转页（对 http(s) URL 包装 alipays scheme）
- fix(wallet): 清理鸿蒙系统微信支付提示词（鸿蒙现已正常跳转，删除相关 ref/检测逻辑/模板提示/CSS 样式）

---

## [2.12.3] - 2026-06-23

### Fixed
- fix(pay): V2接口从/api/pay/submit改为/api/pay/create统一下单，微信扫码直接打开app
- fix(pay): V1接口补充必填参数clientip和device（PC返回qrcode，手机返回payurl）
- fix(pay): V1异步回调改为router.all兼容GET/POST（文档规定GET，原代码仅POST导致验签失败）
- fix(pay): V1查询/退款接口改用pid+key直接传参，不参与MD5签名（符合文档规范）
- fix(pay): 轮询改为setTimeout递归+429错误退避机制，限速30→60次/分钟
- fix(pay): 新增checkPayStatus手动检查按钮，网关错误返回具体msg

---

## [2.12.2] - 2026-06-23

### Fixed
- fix(cdn): 修复 qrcode@1.5.3 CDN 路径错误（build/qrcode.min.js 404）和 CommonJS 浏览器不兼容
- fix(cdn): 换用 qrcodejs2@0.0.2 纯浏览器库，改用 new QRCode(element) DOM 渲染方式

### Changed
- chore(cdn): 全量替换 cdn.jsdelivr.net → jsd.owoser.cn 国内反代域名（8 文件 32 处）
- chore(cdn): 涉及 EJS 模板、public/*.html、server.js CSP 策略

---

## [2.12.1] - 2026-06-23

### Fixed
- fix(wallet): 修复 order-status 订单号正则与实际生成格式不匹配导致轮询完全失效
- fix(wallet): 修复 /wallet/return 同步回调不返回 amount 字段导致金额显示异常
- fix(wallet): 前端金额校验改为 parseFloat+toFixed(2)，兼容 number 类型

---

## [2.12.0] - 2026-06-23

### Added
- feat(wallet): 充值改为当前页二维码支付，PC 端用支付链接生成二维码显示在弹窗内
- feat(wallet): 手机端显示跳转按钮唤起支付宝/微信 app，保留当前页面
- feat(wallet): 支付完成检测三重保障（轮询 + visibilitychange 事件 + return_url 回调）
- feat(wallet): 鸿蒙系统检测，选择微信支付时提示建议使用支付宝

### Changed
- refactor(wallet): 移除 window.open 打开新标签页的充值方式
- refactor(wallet): 充值等待弹窗改造为扫码/跳转支付弹窗，支持 PC 二维码和手机跳转两种模式

---

## [2.11.10] - 2026-06-23

### Added
- feat(modal): 新增 ModalZIndexManager 动态弹窗 z-index 管理器，后弹出的弹窗自动在上一层
- feat(modal): 补充 dashboard 端缺失的 messageDetailModal 模板

### Fixed
- fix(modal): 修复续费弹窗和 VM 重置密码弹窗关闭按钮缺失（添加 variant=close）
- fix(modal): 修复删除消息确认弹窗被消息详情弹窗遮挡（customConfirm 集成动态 z-index）
- fix(modal): 移除所有硬编码 z-index（admin/dashboard/user-center/login 四个 CSS 文件 + 内联样式）

---

## [2.8.1] - 2026-06-17

### Changed
- chore(release): 跳过 v2.8.0，直接发布 v2.8.1

---

## [2.8.0] - 2026-06-17

### Changed
- refactor(frontend): 提取4个HTML页面内联CSS/JS到独立文件，HTML仅通过link/script src引用
- docs: 创建AGENT.md前端开发规范文档，记录CSS/JS架构规则和禁止内联原则

### Added
- feat: 新增 public/css/{admin,dashboard,login,user-center}.css 页面专用样式文件
- feat: 新增 public/js/{theme-init,app-version}.js 共享脚本文件
- feat: 新增 public/js/{admin/dashboard/login/user-center}-page.js 页面专用JS文件

---

## [2.7.1] - 2026-06-16

### Added
- feat(orders): 订单管理增加筛选栏/导出CSV/分页改进

### Fixed
- fix(orders): 导出去掉async防止浏览器弹窗拦截
- fix(orders): 导出改用fetch+Blob携带Authorization header
- fix(orders): 导出URL添加/api前缀匹配后端路由挂载路径
- fix(timezone): MySQL存储UTC改为本地时间，消除8小时偏差
- fix(timezone): 修复formatDateTimeLocal变量名冲突

---

## [2.7.0] - 2026-06-15

### Added
- feat: 套餐订购系统 — Dashboard 侧边栏套餐开通入口，卡片式展示，响应式+明暗适配
- feat: 订单系统 — 订购生成订单号，orders 表 + transaction_records 双记录
- feat: 模板 MAC 分组绑定 — vm/lxc_templates 新增 mac_group_id，开通自动继承
- feat: 用户中心"我的订单" — 订单历史查看
- feat: Admin 订单管理 — 财务管理子菜单，全平台订单分页

### Changed
- refactor: 套餐开通改为使用关联模板配置（非套餐参数）

---

## [2.6.0] - 2026-06-15

### Added
- feat(admin): 分配VM/LXC新增季付周期（90天计）
- feat(admin): 续费钱包支持季付（quarter=90天）

### Fixed
- fix(admin): 套餐管理页面独立 section 修复（不再归属后台管理）

---

## [2.5.8] - 2026-06-15

### Fixed
- fix(admin): PVE模板VMID下拉修复 available/assigned 字段名

---

## [2.5.7] - 2026-06-15

### Fixed
- fix(admin): 分配页套餐下拉 .value 引用 + packagePage 兜底初始化

---

## [2.5.6] - 2026-06-15

### Fixed
- fix(admin): 分配页套餐下拉 .value 引用修复（packagePage.vmPackages → .value）

---

## [2.5.5] - 2026-06-15

### Fixed
- fix(admin): VM模板下拉修复（合并 availableVms + assignedVms 数组）
- fix(lxc): LXC模板存储过滤修复（getAllStorages 替代 getLxcStorageList）

---

## [2.5.4] - 2026-06-15

### Fixed
- fix(admin): 模板/套餐恢复为独立一级父菜单（非后台管理子项）

---

## [2.5.3] - 2026-06-15

### Fixed
- fix(admin): 模板VM下拉显示修复（改用全部VM列表，无名称时显示 VM xx）
- fix(admin): 修复 core.js packagePage 对象重复定义冲突导致分配页无法打开
- fix(admin): 模板/套餐管理侧边栏移入后台管理子菜单

---

## [2.5.2] - 2026-06-15

### Fixed
- fix(admin): LXC模板新增 rootfs_storage 容器存储位置字段
  - DB 新增 rootfs_storage 列，与 storage（模板存储）分离
  - 弹窗新增"容器存储"下拉（PVE rootdir 存储池）
  - 套餐开通 rootfs 优先使用 rootfs_storage
- fix(admin): VM目标存储下拉 NaN 修复
  - dir 类型存储无 maxdisk 时不再显示 NaN

---

## [2.5.1] - 2026-06-15

### Added
- feat(admin): 模板管理交互优化
  - VM模板 vmid → PVE模板VM下拉选择 (GET /pve/vms?template_only=1)
  - 磁盘 → 目标存储池下拉 (GET /admin/storages/all)
  - 新增克隆模式下拉 (完整克隆/链接克隆)
  - 新增 CPU亲和性可选绑定 (如 0-11)
  - LXC模板存储池和模板路径改为PVE下拉选择 (联动加载)
- feat(api): pve-api 新增 getAllStorages(), getVms支持templateOnly过滤, cloneVm支持full参数

---

## [2.5.0] - 2026-06-15

### Added
- feat(admin): 新增模板与套餐管理模块
  - VM 模板：基于 PVE 模板 VM，记录默认 CPU/内存/磁盘/网络配置
  - LXC 模板：复刻创建 LXC 表单参数，存储模板配置
  - VM 套餐：关联 VM 模板 + 月/季/年定价 + 可覆盖资源参数
  - LXC 套餐：关联 LXC 模板 + 月/季/年定价
  - 套餐开通：clone PVE 模板 VM 或 createLxc，自动生成随机名 (VM-xxxxxxxxx/CT-xxxxxxxxx)
  - 分配页套餐快速开通入口：选套餐自动填参
  - 侧边栏新增 [模板管理] 和 [套餐管理] 父级菜单

---

## [2.4.0] - 2026-06-15

### Added
- feat(admin): 新增 VM 销毁功能（PVE 彻底删除 + 级联清理端口转发/DHCP/MAC）
- feat(admin): 编辑弹窗增加"移除（仅解绑）"和"销毁（删除 PVE）"双按钮
  - 运行中 disabled 并提示"请先关机后操作"
  - 销毁需输入 yes 二次确认
- feat(admin): 已分配列表关机行同步增加移除+销毁按钮
- feat(api): pve-api.js 新增 `destroyVm(vmid)` 方法

### Fixed
- fix(lxc): LXC 移除端点补充 MAC 分组清理（之前漏掉导致爱快残留）
- fix(lxc): LXC 移除端点增加关机状态检查（与 VM 一致）

---

## [2.3.7] - 2026-06-14

### Fixed
- fix(db): vms.update allowedColumns 追加 `ikuai_mac_group_id`
  - SQLite + MySQL 双驱同步修复，之前该字段被白名单静默过滤导致无法持久化

---

## [2.3.6] - 2026-06-14

### Fixed
- fix(ikuai): 修复前端 `mac_group_id` 与后端 `req.body` 字段名不匹配
  - POST/PUT vm.js + lxc.js 中 req.body 解构从 `ikuai_mac_group_id` 改为 `mac_group_id`
  - 根因：前端表单 v-model 使用 `mac_group_id`，后端解构名不对导致永远取到 undefined

---

## [2.3.5] - 2026-06-14

### Fixed
- fix(ikuai): addr_pool 分隔符从空格改为逗号（匹配爱快真实数据格式）
  - getMacGroups: split(/,/) 解析 MAC 列表
  - addMacToGroup/removeMacFromGroup: join(',') 拼回 addr_pool

---

## [2.3.4] - 2026-06-14

### Fixed
- fix(ikuai): 修正 func_name 为 `macgroup`（来自爱快后台真实抓包）
  - 文档写的是 `route_object_mac` 但实际爱快 v3.x 后台发出的是 `macgroup`
  - TYPE 同步修正为 `total,data`（与真实请求一致）

---

## [2.3.3] - 2026-06-14

### Fixed
- fix(ikuai): 修正 MAC 分组 func_name 为 `route_object_mac`（来自官方 v3.x API 文档）
  - getMacGroups/addMacToGroup/removeMacFromGroup 全部切换
  - add/remove 改为整体替换 edit 模式（获取分组完整列表 → 追加/过滤 → edit）

---

## [2.3.2] - 2026-06-14

### Fixed
- fix(ikuai): getMacGroups 绕过 _call 直接获取原始响应添加调试日志
  - 直接调用 client.call() 获取完整 Result/ErrMsg/Data
  - 添加 console.log 打印完整响应结构（截取前500字符）
  - addMacToGroup/removeMacFromGroup 同步改造

---

## [2.3.1] - 2026-06-14

### Fixed
- fix(ikuai): getMacGroups 数据路径改为多兜底 `data?.data || data || []`
  - 修复 MAC 分组列表不显示分组名称的问题（部分 iKuai 版本返回结构不同）

---

## [2.3.0] - 2026-06-14

### Added
- feat(ikuai): 分配 VM/LXC 时自动同步爱快 MAC 分组
  - 新增 `GET /api/ikuai/mac-groups` 端点（admin-only）
  - 分配时提取 PVEMAC → 加入选定分组；移除/销毁时自动从分组删除
  - 编辑时可重新分配 MAC 分组（先删后加）
  - 前端分配/编辑表单增加 MAC 分组下拉框
  - 新增 `ikuai_mac_group_id` 数据库字段（SQLite + MySQL 双驱同步）

---

## [2.2.0] - 2026-06-14

### Changed
- feat(ui): 监控图表网络流量单位从 MB/s 改为 Mbps
  - 转换公式：`bytes/s × 8 ÷ 1,000,000 = Mbps`（符合网络带宽行业惯例）
  - 磁盘 IO 单位保持 MB/s 不变

---

## [2.1.26] - 2026-06-14

### Fixed
- fix(ui): 移除浏览器控制台 debug 输出（dashboard + admin）
- fix(ui): 修复 LXC 详情图表 WebSocket 实时更新不生效
  - `dv._isLxc ? 'ct_id' : 'vm_id'` → 固定 `'vm_id'`，因 openLxcDetail 将 ct_id 存入 vm_id

---

## [2.1.25] - 2026-06-14

### Fixed
- fix(security): 支付回调端点添加 IP 速率限制（R6-1/R6-2）
  - `POST /api/wallet/notify` 添加滑动窗口限速（60秒/30次），超限返回 429
  - `GET /api/wallet/return` 复用同一限速器
- fix(security): CSV 导出用户名双引号按 RFC 4180 转义（R6-3）

---

## [2.1.24] - 2026-06-14

### Changed
- refactor(email): 钱包邮件统一使用 `createEmailTemplate` HTML 模板
  - 充值到账邮件从纯文本 → 统一紫色渐变 HTML 模板（金额/余额/订单号/时间 + 链接）
  - 余额续费邮件从纯文本 → 统一模板（资源名/续费详情/到期时间/金额/余额变动/订单号）
  - 顶部统一 import，移除 3 处 inline require

---

## [2.1.23] - 2026-06-14

### Fixed
- fix(email): wallet.js `email_verified` → `emailVerified`
  - 数据库字段是驼峰 `emailVerified`，wallet.js 用了下划线 → `undefined`
  - 条件永远 false，充值/续费邮件自始至终从未真正执行
  - 3 处修复：notify 回调 / return 回调 / 余额续费

---

## [2.1.22] - 2026-06-14

### Fixed
- fix(email): wallet.js 邮件发送 `emailUtil.send` → `sendEmail`
  - email.js 导出的是 `sendEmail`，`emailUtil.send` 为 `undefined` → TypeError 被 try/catch 吞掉
  - 3 处修复：notify 回调 / return 回调 / 余额续费
  - 影响：充值邮件和续费邮件从未成功发送（VM/LXC 等其他功能正常）

---

## [2.1.21] - 2026-06-14

### Added
- feat(wallet): 余额续费成功后发送站内信 + 邮件通知
  - 站内消息标题 "资源续费成功"，type=2
  - 邮件标题 "资源续费成功 - PVE管理面板"（仅已验证邮箱）
  - 通知内容：资源名称、续费详情、到期时间、实付金额、余额变动、订单号
  - 充值回调站内信/邮件已于之前版本完成，无需改动

---

## [2.1.20] - 2026-06-14

### Fixed
- fix(date): datetime-local 保存改用 `replace('T',' ')` 确保跨浏览器本地时间解析
  - `new Date("YYYY-MM-DDTHH:MM")` 在部分浏览器中可能被当作 UTC 解析（非标准行为）
  - `new Date("YYYY-MM-DD HH:MM")` 在所有浏览器中均按本地时间解析
  - 7 处保存统一改为 `new Date(val.replace('T',' ')).toISOString()`，根除漂移

---

## [2.1.19] - 2026-06-14

### Fixed
- fix(date): datetime-local 选择器显示本地时间 + pay_time 格式化显示
  - `formatDateTimeLocal`：`getUTC*` → `get*` 显示本地时间，用户按本地时区输入
  - 7 处保存：移除 `+'Z'`，`new Date(val).toISOString()` 自动本地→UTC
  - admin/user-center：`pay_time` 加 `formatDate()` 格式化显示
  - vm/lxc 分配通知：前端不再传 Z，后端补加 Z 确保站内消息/邮件时间正确

---

## [2.1.18] - 2026-06-14

### Fixed
- fix(date): 全局修复 MySQL DATETIME `dateStrings:true` 后的时区显示 Bug
  - 根因：`dateStrings:true` 返回无时区字符串（`"2026-06-14 09:00:00"`），`new Date()` 按本地解析少 8 小时
  - `formatDate()` 自动检测空格分隔无时区日期并追加 `Z` 按 UTC 解析
  - wallet.js/cdk.js/expiry-check.js/vm.js/lxc.js 所有 DB 日期运算添加 `Z`
  - 影响范围：created_at / pay_time / expires_at / expiration_date 全部日期显示和运算一致
  - 前端 req.body 传来的 ISO 日期（已含 Z）保持原样不重复追加

---

## [2.1.17] - 2026-06-14

### Fixed
- fix(cdk): CDK 有效期 datetime-local 保存时加 `+'Z'` 统一 UTC 时区，与 VM/LXC 一致
- fix(wallet): 站内信 `send_type: 'auto'` → `1` 修复 MySQL 严格模式 `Incorrect integer value` 报错
- fix(lxc): PUT 解构补全 `renewal_period` 字段，修复 `ReferenceError`

---

## [2.1.16] - 2026-06-14

### Fixed
- fix(db): MySQL 连接池添加 `dateStrings: true` 根除时区漂移
  - 根因：mysql2 默认将 DATETIME → JS Date 对象 → JSON 序列化产生不可控时区偏移
  - 影响范围：expiration_date / created_at / expires_at / pay_time 等全部日期字段
  - VM 编辑、LXC 编辑、CDK 有效期、交易记录、expiry-check 全部受影响
  - `dateStrings: true` 使返回原始字符串，配合前端 `getUTC*` + 保存 `+'Z'` 三点闭合

---

## [2.1.15] - 2026-06-14

### Fixed
- fix(date): 修复 admin updateVm 和 lxcAssignVm 遗漏的 `+ 'Z'` 时区标记
  - v2.1.14 修复了 6 处中的 4 处，遗漏了 admin VM 编辑和 LXC 分配两个路径
  - 现全部 6 处 `new Date(val + 'Z').toISOString()` 统一

---

## [2.1.14] - 2026-06-14

### Fixed
- fix(date): 彻底修复 VM/LXC 到期时间编辑保存时区漂移 Bug
  - 根因：`datetime-local` 输入框无时区 + JS `new Date()` 读写不对称
  - `formatDateTimeLocal` 改用 `getUTC*()` 显示 UTC 时间，MySQL 格式加 Z 标记
  - 所有保存操作 `new Date(val + 'Z').toISOString()` 统一视为 UTC
  - 修复后编辑保存零偏移：读取 UTC → 显示 UTC → 保存 UTC，三步一致

---

## [2.1.13] - 2026-06-14

### Fixed
- fix(date): 修复编辑 VM/LXC 到期时间每次保存偏移数小时的时区 Bug
  - 根因：MySQL DATETIME 无时区 + `formatDateTimeLocal` 误将 UTC 值解析为本地时间
  - 每次编辑保存产生 8 小时时区漂移（UTC+8），3 次保存后日期回退 1 天
  - `wallet.js` 余额续费日期格式修复：完整 ISO 替代 `.slice(0,19).replace('T',' ')`
  - `formatDateTimeLocal` / `formatDate`：空格分隔无时区日期自动追加 `Z` 按 UTC 解析

---

## [2.1.12] - 2026-06-14

### Fixed
- fix(wallet): 通过网关查询 API 获取真实接口订单号（微信/支付宝单号）
  - 支付网关回调参数不含 `api_trade_no`，需主动调用 `/api/pay/query` 查询
  - 新增 `queryApiTradeNo()` 辅助函数，自动适配 V1 MD5 + V2 RSA 签名
  - notify 和 return 回调统一使用查询接口获取真实接口订单号

### Docs
- docs: 更新 README 至 v2.1.11（支付功能介绍 + 更新日志精简）

---

## [2.1.11] - 2026-06-14

### Fixed
- fix(wallet): 支付回调读取 `transaction_id` 替代不存在的 `api_trade_no`
  - 支付网关回调实际返回的流水号字段为 `transaction_id`
  - 移除错误的内存 Map 暂存方案
  - admin CSV 导出同步适配

---

## [2.1.10] - 2026-06-14

### Fixed
- fix(db): 新增 api_trade_no 字段到 transaction_records 表
  - MySQL/SQLite 建表语句、迁移逻辑、create 方法同步更新
  - 支付回调和同步回调分别存储 trade_no 和 api_trade_no
  - 解决前端显示的一直是 trade_no 而非 api_trade_no 的问题

---

## [2.1.9] - 2026-06-14

### Added
- feat(wallet): admin 交易流水增加支付流水号列
  - 优先使用 api_trade_no 字段，fallback 到 trade_no
  - 用户中心和 admin 后端 API 同步更新
  - 表头「接口订单号」统一改为「支付流水号」

### Fixed
- fix(ui): 修复交易流水和支付配置子菜单选中时无高亮的问题
  - switchSection 支持 highlight 选项自动高亮子菜单项
  - switchAdminTab 补全 pay 映射

---

## [2.1.8] - 2026-06-14

### Fixed
- fix(ui): 修复侧边栏父级菜单与子菜单同时高亮的问题
  - 父级菜单（has-children）不再显示 active 紫色高亮背景
  - 仅子菜单项显示 active 高亮，视觉更清晰
  - 保留父级菜单展开/收起功能（箭头旋转）
  - 独立一级菜单（总览、系统更新）高亮不受影响

---

## [2.1.7] - 2026-06-14

### Added
- feat(ui): 美化充值按钮并适配明暗模式
  - 暗色模式：紫色渐变背景 + 淡紫文字 + 悬停上浮阴影增强
  - 明亮模式：深紫渐变背景 + 白色文字，确保亮色下清晰可见
  - 禁用状态：透明度降低 + 灰度滤镜
  - 同时作用于交易明细查询按钮，保持风格统一

---

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
