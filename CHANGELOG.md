# Changelog

## [3.3.3] - 2026-08-13

### Added
- **feat(ikuai): 爱快配置迁移面板在线管理，支持 http/https 与热加载**
  - 爱快软路由配置从 `.env` 环境变量迁移至面板 MySQL DB（`ikuai:host` / `ikuai:username` / `ikuai:password` / `ikuai:strict_tls`）
  - 密码 AES-256-GCM 加密存储（掩码回显 + `isMasked` 防回写）；`.env.example` 删除爱快配置块
  - `ikuai-api.js` 重构：构造函数不再读 process.env，改为**惰性 DB 加载 + 60s 内存 TTL 缓存**；面板 DB 优先，`.env` 仅在 DB 从未配置时一次性迁移
  - **保存后热加载**（`reloadConfig()` 清缓存 + 重置 client 登录态，立即生效无需重启）；面板显式清空 host = 停用，绝不回退 .env
  - 新增「爱快节点设置」表单（PVE 节点设置上方）：地址/用户名/密码/TLS 开关/测试连接按钮，说明「保存后立即生效，无需重启」
  - 新增 `GET/PUT /admin/ikuai/config` + `POST /admin/ikuai/test`（限速 + 审计 diff + safeError 不泄露第三方错误）
  - SDK 支持 **http/https**（按 url.protocol 选 node:http/https）+ 自签证书容忍（严格校验开关默认关）+ keepAlive + 8s 超时
  - 删除 `ikuai-sdk.js` 死副本（-222 行，零引用）

### Notes
- **重要：勿再往 .env 添加爱快配置**（面板 DB 为唯一来源，env 仅首次迁移）
- 部署注意：存量环境重启后自动从 .env 一次性迁移入 DB（仅当 DB 无 `ikuai:host` 行）；之后以面板配置为准
- 真实设备不支持 https / system/sysstat；测试连接走 dhcp_lease 只读
- 测试：**520 passing**；`check-coupling` 通过；真实设备冒烟（迁移/加密/热加载/端口转发写入回滚）全 PASS

## [3.3.2] - 2026-08-13

### Fixed
- **fix(logs): 页面刷新落在登录/系统切换 tab 时 Tips 后台操作上限显示 0**
  - **问题**：日志中心 Tips 两个保留上限（用户操作 5000 / 后台操作 5000）由「当前激活 tab 的接口」回填、前端初始 `ref(0)`。浏览器原地刷新后 tab 从 localStorage 恢复、只加载该 tab 接口，导致：
    - 「登录日志」tab 刷新 -> 后台操作上限显示 0（接口缺 `keep_admin_count`）
    - 「系统切换」tab 刷新 -> 两个上限都显示 0（接口两个值都不返）
  - **修复（前后端对称）**：
    - 后端 `/admin/logs/login` 补返 `keep_admin_count`；`/admin/os-switch-logs` 补返 `keep_count` + `keep_admin_count`
    - 前端 `loadLoginLogs` / `loadOsSwitchLogs` 同步更新两个上限（truthy 判空容错）
  - 缓存版本 v145 -> v146
- 新增三接口（operation/login/os-switch）keep 字段对称断言

### Notes
- 验证：全量测试 **520 passing**；浏览器冒烟三场景（操作日志初始 / 登录日志刷新 / 系统切换刷新）Tips 均显示 `5000/5000`
- 经验沉淀：多 tab 页面共享展示区字段，所有 tab 接口必须对称返回；验证需覆盖「每个 tab 点击 -> 浏览器刷新」路径

## [3.3.1] - 2026-08-12

### Changed
- **perf(logs): 日志首次加载提速（连接池预热 + IP 归属地时间预算）**
  - **根因（两层叠加）**：
    1. MySQL 连接池按需建连：服务器启动后首个请求承担远程库 TCP 握手+认证（本地实测 2.4~3.7s，热查询仅 81ms）
    2. 清 Redis 后 IP 归属地外呼阻塞：`getIpLocations` 对未命中缓存的 IP 并发外呼 UApiPro（单次最多 5s 超时），同步阻塞列表/导出响应
  - **修复**：
    - **连接池启动预热**：`db-core.js` 新增 `ping()`，`server.js` 在 `initDb()` 后调用（启动日志 `[mysql] 连接池预热完成`）——首请求延迟 **1.636s -> 0.291s**
    - **IP 归属地时间预算**：`getIpLocations(ipList, { timeBudgetMs })` 用 `Promise.race([Promise.allSettled(外呼任务), delay(预算)])`；列表 500ms / 导出 2000ms；超预算外呼**不取消**、后台继续执行并写回 Redis/DB 缓存（本次留空、下次命中），0/缺省 = 原行为
    - **uapipro api_key 60s 内存缓存**：避免并发外呼时每个外呼各查一次 DB
    - 9 处调用点传预算（admin-logs.js / log.js 列表 x4 500ms、导出 x4 2000ms、user.js 设备列表）

### Notes
- **需服务器重启生效**（连接池预热在启动时执行）：`pm2 restart` 一次，后续新部署自动受益
- 测试：**519 passing**（新增列表/导出预算值 + `Promise.race` 模式断言）；`check-coupling` 通过

## [3.3.0] - 2026-08-11

### 概览

本次发布核心为**邮件模板在线编辑系统**（43 个模板在线编辑 + 外壳样式编辑）、**登录免登录选项**（7 天勾选 / 2 小时无操作）、**系统模板拖拽排序**，并完成大量审计/UI/稳定性修复。自 v3.2.2 以来共 30 个提交（7 feat + 18 fix + 3 style + 1 refactor + 1 chore），69 文件 +4315/-964。

### Added（7 个 feat）
- **feat(email-template): 邮件模板在线编辑系统**
  - SMTP 配置内新增「邮件模板」卡片：43 个默认模板按 5 类分组（认证类/资源通知/账单类/到期提醒/系统通知），默认收起点击展开
  - Quill 2.0.3 富文本编辑（+ 源码双模式），「可用变量」面板点击插入（snake_case 白名单按模板校验）
  - 「恢复默认」从代码常量覆盖；存储只持久化 subject/title/content 三字段（邮件外壳固定不入库）
  - 邮件外壳样式编辑（渐变头部/按钮/footer 参数化），预览与实际发送一致
  - 17 文件 41 处调用点迁移为 `sendTemplateEmail`（认证类 4 处同步发送，其余异步队列）
  - 新文件：`server/constants/email-templates.js`（1059 行注册表）、`db-email-templates.js`、`admin-email-template.js`、`services/email-template.js`
  - 数据库：`email_templates` 表，启动 `INSERT IGNORE` 幂等初始化（不覆盖管理员内容）
- **feat(auth): 登录页新增「7天内无需登录」勾选，未勾选 2 小时无操作退出**
  - 勾选：7 天固定倒计时（刷新/操作不顺延），7 天内绝不因闲置踢出，超期转 2 小时规则
  - 未勾选：2 小时无操作退出（真实业务 API 计活跃，前端 10 分钟保活刷新不计）
  - `session-policy.js` 纯函数（isRefreshAllowed/computeNextExpiryMs）+ `refresh_tokens` 3 列（remember/session_deadline/last_active_at）
  - 被踢跳 `login?expired=1` 提示；审计保留 deleteByToken 防重放
- **feat(os-template): 可切换系统模板支持拖拽排序**
  - 管理后台系统模板表格拖拽手柄排序（整行镜像/避让动画/触屏支持），保存后用户端切换系统弹窗/购机选系统自动同步
  - `POST /admin/os-templates/reorder` + `batchUpdateSortOrder`（sort_order 大在前）+ 审计
- **feat(logs): 日志中心详情弹窗展示完整变更明细**
  - 操作日志详情列单行截断 + 悬浮 title + 「详情」按钮弹窗展示字段级变更明细（标题/分类/action/用户 meta）

### Changed
- refactor(email-shell): 正文文字颜色移除外壳控制，由模板正文内容决定
- style(email-template): 模板分类折叠改为卡片分组样式（对齐通知设置）+ 间距优化 + Quill 中文提示
- chore(cache): cache-version 145 绕过 nginx/浏览器双缓存

### Fixed（18 个 fix）
- **fix(logs): 更新类操作审计改字段级 diff，补缺失敏感操作埋点**
  - 16 处更新/配置保存接口字段级 diff（`audit-diff.js` 通用工具，数值/布尔归一，敏感凭据只记「已更新」）
  - 补齐 6 处缺失埋点：vm/lxc 编辑、支付到账、充值下单、注册、重置密码、手动到期检查
  - 修复 audit-log 空串落库 `'{}'` + 网络配置 diff 漏读字段
- **fix(port-forward): 删除加 deleting 中间状态 + 启动收敛，爱快失败不再删 DB，孤儿自动清理**
  - 删除链路先置 `deleting` 意图 -> 爱快删除成功才删 DB（失败不删并提示重试）
  - 启动对账收敛 deleting 残留（爱快无规则->清理+系统审计，仍有->重试/回滚）
  - 孤儿自动清理 + `deleteIkuaiRuleStrict` 幂等核对（修复 allGone 判断写反 bug）
  - 真实环境启动清理 46 条历史孤儿数据
- **fix(uapipro): 补上 checkConfiguredRateLimit 导入**，修复 IP 测试 400（+ backup.js restoreLxcBySSH 同类遗漏）
- **fix(ws): bfcache 恢复后推送通道延迟重连**（ensurePushConnected + pageshow/visibilitychange，退避重置）
- **fix(os-template): 编辑弹窗标题恒显新增及编辑保护失效**（editId 原始值拷贝 -> formData.id reactive）
- **fix(os-template): PVE 模板配置异步响应竞态覆盖新表单**（vmidConfigSeq 请求序号）
- **fix(ui): select-glass 下拉文本同步改事件驱动**（selectedIndex setter 拦截 + glass-change 事件，移除轮询兜底）
- **fix(login): 登录后保留 section 参数直达目标页面** + 右上角用户名按登录用户显示
- **fix(email-template): Quill 色板无纯黑/无序列表显示成有序**（渲染时转换标准 ul/ol + normalizeQuillLists）
- **fix(mac-group): MAC 分组 id 类型归一化及用户中心加载回填**
- style(ui): 表单标签 block 显示及 CDK 弹窗下拉宽度修复

### Notes
- 新增表 `email_templates` 启动自动建表 + 幂等初始化；`refresh_tokens` 3 列自动 ALTER
- 存量已登录会话部署后获得 2 小时宽限，之后按新会话策略执行（预期收紧）
- 测试：**517 passing**（+session-policy 17 用例 + audit-diff 5 用例 + port-forward-delete 10 用例）
- 新增文件：`server/constants/email-templates.js`、`server/utils/session-policy.js`、`server/utils/audit-diff.js`、`server/services/email-template.js`、`server/routes/admin-email-template.js`、`server/api/db-email-templates.js`

## [3.2.2] - 2026-08-10

### Fixed
- **fix(ui): 修复所有编辑弹窗底部横向滚动条**
  - **根因**：公共 `.modal-content` 规则含 `overflow-y: auto`，按 CSS 规范 overflow-y 非 visible 时 overflow-x 被强制计算为 `auto`，内容比弹窗宽 1px 即出现底部横向滚动条；该规则三端（admin/dashboard/user-center）共用，故所有编辑弹窗都受影响
  - **修复**：`.modal-content` 追加 `overflow-x: hidden`（一处生效全局三端）+ 追加 `.modal-dialog-scrollable .modal-body { overflow-x: hidden; }` 覆盖 Bootstrap 同类根因弹窗
  - 纵向滚动保留（长表单仍可上下滚动）
- 缓存版本 v115 -> v116

### Notes
- 验证：Playwright 真实 CSS 计算值确认 overflow-x=hidden、overflow-y=auto 保留、页面无横向滚动条
- `overflow-x: hidden` 会裁剪真正超宽内容而非滚动（预期行为）；如个别弹窗存在真实超宽布局需按弹窗补 `flex-wrap` 调整

## [3.2.1] - 2026-08-10

### Fixed
- **fix(billing): 修复 VM/LXC 续费审计日志写入失败——renewResourceId 作用域错误**
  - v3.2.0 的 `vm.renew`/`lxc.renew` 审计埋点引用的 `renewResourceId` 声明在 `withTransaction` 事务回调内部 -> 生产环境 `ReferenceError: renewResourceId is not defined` -> 审计从未写入（错误被 catch 吞掉）
  - 修复：声明上移至事务外（`var renewResourceId = resource.vm_id || resource.ct_id || resource.id`）
  - **CDK 兑换续费补审计**：`redeemCdk` 传入 `req`，VM/LXC 分支各加 `vm.renew`/`lxc.renew` 埋点（`CDK兑换续费虚拟机[名称] N天...`），失败不阻断兑换
- **fix(ui): CNAME 域名列左对齐——修复多行域名居中错位**
  - 根因：`.table-align-center` 列居中 + 各线路段宽度不同 -> 整组总宽度不同 -> label/域名起点错位
  - 修复：`.cname-cell` 加 `text-align: left`（一处 CSS 覆盖用户端/管理端、VM/LXC 全部 4 个表格）+ 4 个表头加 `text-start`
- **fix(network): 审计日志按实际变化字段记录——CNAME 修改不再误记为网络配置**
  - 写前读旧值 + 写后逐字段 diff（`NETWORK_CHANGE_FIELDS` / `buildNetworkChanges` / `buildCnameDetail`）
  - CNAME 变化 -> 独立 `admin.config.cname` 条目级 diff（新增/删除/修改）；网络字段变化 -> `admin.config.network` 仅含实际变化字段；无变化不写审计
- **fix(ui): admin 网络配置页标题文案调整**
  - 页面标题「端口转发配置」->「网络配置」；卡片标题「全局设置」->「端口转发配置」

### Notes
- 仅改 server 端 + 前端模板/CSS，无数据库变更
- 缓存版本 v115
- 验证：`node --check` 通过、10 个 diff 场景测试、30 个 mocha 测试全部通过

## [3.2.0] - 2026-08-09

### 概览

**重点功能：模板切换（双主题体系）**。默认模板重做为**赛博霓虹风**，新增 **SAAS 企业风**（腾讯云控制台风格）模板，支持站点级默认 + 个人级偏好双级选择。同时完成大量 UI 优化与 Bug 修复（按钮体系统一、下拉/滚动条主题适配、硬编码颜色清理、续费订单记录等）。自 v3.1.0 以来共 35 个提交（13 feat + 19 fix + 2 refactor + 1 docs），73 文件 +2626/-1547。

### Added（13 个 feat）

**🎨 模板切换功能（重点）**
- **feat(theme): 双模板体系（赛博霓虹 + SAAS 企业风）**
  - 默认模板重做为**赛博霓虹风**（01-neon-dark 参考：霓虹紫渐变/玻璃拟态/光晕效果），命名「赛博霓虹」
  - 新增 **SAAS 企业风**模板（`template-saas.css` 911 行）：腾讯云控制台风格——企业蓝主色 `#2563eb`、扁平克制去玻璃化、细边框、8px 圆角、system-ui 字体、顶栏 52px/侧边栏 200px、完整明暗两套配色，覆盖 admin/仪表盘/用户中心/登录页全站
  - SAAS 登录页企业风背景（纯 CSS 多层渐变，替代光秃渐变）
- **feat(theme): 全站/个人双级模板选择**
  - 管理员「系统设置 → 站点设置」可视化预览卡选择全站默认模板（点击实时预览，`site:template` 持久化 + 审计）
  - 用户「用户中心 → 个人设置」3 张预览卡自选个人偏好（跟随站点默认 / 赛博霓虹 / SAAS），跨设备同步（`user_settings.template` 列），**优先级：个人偏好 > 站点默认**
  - 服务端注入 `<html data-template>` + theme-init.js 首帧应用防闪烁；`template-saas.css` 独立文件后置加载（作用域隔离）
  - `UI_TEMPLATES` 白名单（default/saas）+ `GET/PUT /api/user/template` + `window.applyTemplate` 三端共用
- **feat(order): VM/LXC 续费写入订单记录，列表显示资源名称与 ID**
  - `orders` 表新增 `order_kind` 列（new/renewal）+ 兼容 ALTER；续费事务内写订单（与扣款/流水同事务原子回滚）
  - admin「订单管理」/ user「我的订单」显示续费记录：VM 续费/LXC 续费/磁盘续费
- **feat(billing): 磁盘续费名称新购格式与站内信，VM/LXC 续费审计，新购/续费日志分类**
  - 续费成功追加审计：`vm.renew` / `lxc.renew`（`续费虚拟机[名称] 3个月 金额300元`）
  - 日志分类「服务开通」改「新购/续费」（`order` -> `purchase` 分类）
- **feat(system): 服务端启动收尾日志** — 成功打印 `服务端启动完成 本次耗时xxms`，失败统一提示「服务端启动失败，请检查！」
- **feat(ui): 原生 select 全站玻璃化** — select-glass 包裹器替换展开弹层为 blur(15px) 玻璃组件（v-model/表单/required 零改动兼容）

### Changed
- refactor(ui): 按钮体系统一为 pv-button 语义体系（73 处旧 `table-btn`/`btn-glass` 迁移 + 死代码清理 + size prop 修复 + pv-buttons.css 三副本合并）
- refactor(ui): 清理前端与邮件模板 emoji 图标——按钮只留文字，图标位改 SVG
- docs(theme): README/CHANGELOG 记录界面模板功能

### Fixed（19 个 fix）
- **fix(ui): 下拉框与滚动条主题适配** — form-select 去原生外观换主题色箭头+玻璃态，滚动条全站主题感知（`--scrollbar-thumb` 变量）
- **fix(ui): 下拉弹层滚动误关与移动端边界** — 滚动监听全局化、视口 clamp + overscroll 防穿透
- **fix(ui): 硬编码颜色残留主题化**（6 提交）— 紫色残留改 `color-mix` 跟随主题变量，pv-buttons 全量变量化，SaaS 下无紫色残留（Playwright 4 组合冒烟 + 像素级确认）
- **fix(ui): CNAME 域名列标签定宽对齐**（+ 单行省略悬停全名）— `.cname-label` 定宽 3em + 空标签占位
- **fix(ip): 未绑定子网时禁用「重置IP」菜单入口**（用户端+管理端 8 处，防 DHCP 绑定接口出错）
- **fix(ui): dashboard 默认账号列无 cloud-init 与 admin 一致显示「未安装Cloud-init驱动」**
- **fix(vnc): /vnc 错误分支补传占位变量，模板插值加守卫防渲染崩溃**（EJS undefined replace error）
- **fix(auth): admin-os-template/admin-logs 的 router.use 无路径前缀误拦所有 /api 请求**（普通用户 403）
- **fix(message): 站内信分类修正**——业务通知不再误入系统公告
- **fix(ui): dashboard?section=disk 刷新数据不显示 + HDD 徽章紫底金字不可读**
- **fix(theme): SAAS 模板按钮覆盖被 pv-buttons.css !important 压制，补齐 !important**
- **fix(ui): 侧边栏遮罩三端统一 + 明暗切换按钮恢复细边框**
- **fix(ui): 套餐周期优化**——无折扣隐藏角标、选中态色条、卡片加宽；确认订购弹窗固定无滚动条

### Notes
- `user_settings` 表自动 ALTER 增加 `template` 列；`orders` 表自动增加 `order_kind` 列（重启自动迁移）
- 历史存量续费无法回填（transaction_records 无资源名称字段），新记录自部署生效
- 测试：**465 passing**；`check-coupling` 8 项断言全绿；Playwright 四象限（default/saas × 明/暗）回归通过
- 删除 `pv-button-v2.js` 死代码；新增 `public/js/shared/select-glass.js`、`public/shared/css/template-saas.css`

## [3.1.0] - 2026-08-08

### Added（3 个 feat）
- **feat(admin): 删除用户前资产盘点，存在资产时拦截并提示具体清单**
  - 删除用户前并行盘点 7 类资产：虚拟机/容器/硬盘（非 destroyed）/私有网络/余额>0/备份记录/待处理订单
  - 命中任一资产即**完全拦截删除**（无强删选项），返回 409 + 多行清单（如 `该用户名下仍有资产，无法删除：\n· 虚拟机 4 台\n· 硬盘 3 块\n· 余额 ¥12.50`）+ 结构化 `assets` 字段
  - 用户不存在返回 404（修复原删不存在的 id 也返回成功）；拦截时不写删除审计
  - 前端确认文案同步更新，拦截清单走 alert 多行展示
- **feat(user-center): 拆分邮箱/密码独立卡片，重置密码与换绑邮箱补审计日志**
  - 个人设置拆成 3 张卡片：基本资料 / 邮箱（只读当前邮箱 + 验证状态 + 换绑联动）/ 修改密码（新密码 + 确认密码 + 强度提示 + 当前密码）
  - 新增独立 `PUT /user/password` 接口：密码强度校验 + `verifySensitiveAction` 二次验证 + 改密后全部设备强制下线
  - 审计补齐：`password.reset.self`（日志页「重置密码」分类）、`setting.email.change` / `setting.email.bind`
  - 抽出 `changeUserPassword(userId, newPassword)` 辅助函数复用
- **feat(register): 注册页新增确认密码校验，验证码按钮需字段齐全且密码一致才可发送**
  - 新增「确认密码」输入框 + 实时红字提示「两次输入的密码不一致」
  - 「发送验证码」按钮仅在用户名/密码/确认密码/邮箱全部非空且两次密码一致时可用（`canSendCode` computed）
  - 提交兜底校验（密码不一致直接拦截）；注册成功后清空确认密码字段

### Fixed
- **fix(logs): 修复删除用户审计日志显示原始 JSON，details 改为可读文本并兼容旧记录**
  - 根因：删除用户审计 `details` 传对象 `{target_username:...}` 被 JSON.stringify 入库，展示层原样输出
  - 修复：写入端改 `删除用户[username]` 可读字符串；展示端 `buildDetailText` 兼容旧记录（`target_username` 键 -> `删除用户:xxx`）

### Notes
- 被拦截用户需管理员手动清理资产后才能删除（本次只拦截不级联清理；disks/subnets 等表孤儿数据后续可另开任务）
- 重置密码后所有登录设备强制下线（沿用既有安全机制）
- 测试：**465 passing**；`check-coupling` 通过；Playwright 全链路验证通过

## [3.0.2] - 2026-08-08

### Added（2 个 feat）
- **feat(notification): 邮件发送异步化，引入 BullMQ Redis 队列**
  - 40+ 处调用点从同步 `await sendEmail()` 改为 `enqueueEmail()` 异步入队，消除购买/开通/充值链路 1~3 秒阻塞（支付回调避免网关超时）
  - `server/utils/email.js` 发送优化：单例 transporter + `pool: true` 连接池复用（不再每次新建 TCP+TLS）、删除每次发送前的 `verify()` 握手、SMTP 配置内存缓存
  - 新增 `server/queue/email-queue.js`：`attempts: 3` + 指数退避（5s）；**Redis 未配置/入队失败 -> 降级同步发送（邮件不丢）**
  - 三类调用点：A 类保持同步（注册验证码/忘记密码/换绑邮箱/SMTP 测试，需立即反馈）、B 类通知邮件异步入队（30+ 处）、C 类缓存失效（配置变更 resetTransporterCache / restartEmailWorker）
  - 管理端 SMTP 卡片新增「邮件队列状态」行（`GET /api/admin/email-queue/stats` 只读展示）
  - `removeOnComplete: true` 完成即删 + `removeOnFail: {count:100}`，Redis 零残留（避免已完成 job 残留明文邮箱+HTML）
- **feat(subnet): 子网开通增加站内信与邮件通知**，支持通知设置开关（`notify_subnet_provisioned`），经 `shouldSendEmail` + `enqueueEmail` 走同一队列

### Changed
- perf(email-queue): 已完成邮件任务发送后立即删除，Redis 零残留

### Fixed
- **fix(email-queue): BullMQ 不支持 ioredis keyPrefix 导致 Worker 启动失败**
  - 根因：Worker 复用了带 `keyPrefix: 'pve:'` 的主 Redis 连接，BullMQ 同步构造校验报 `ioredis does not support ioredis prefixes` -> Worker 起不来 -> 全部降级同步发送
  - 修复：BullMQ 改用无 keyPrefix 的独立 ioredis 连接；key 前缀交给 BullMQ 自身 `prefix: 'pve:bull'`；`maxRetriesPerRequest: null`；Redis 可用性按 `process.env.REDIS_HOST` 判断；`restartEmailWorker()` 完整关闭/重建
- **fix(subnet): 子网创建增加接口预校验与错误上下文**
  - 爱快写路径故障（统一 30001 写入失败）排查加固：`getVlanInterfaces()` 枚举可用父接口，创建前预校验（无效接口 400，管理员可见详情、用户仅提示联系管理员）
  - `addVlan` 失败错误携带上下文：`VLAN 创建失败(接口=lan2, VLAN=1004, IP=172.16.4.1): ...`
- fix(subnet): 子网开通通知去掉 VLAN ID 与所属接口（仅管理员审计可见）
- fix(user-center): notifications 页 `DOMPurify 未在 setup 暴露` + 通知分组 SVG 图标不渲染（svg 元素内 v-html 无命名空间）

### Notes
- **部署注意**：需 `npm install` 拉取 `bullmq` 依赖并重启服务；重启日志应出现 `[email-queue] 邮件队列 Worker 已启动`
- 新配置 `notify_subnet_provisioned`（子网开通通知开关，默认开启）
- 测试：**465 passing**；`check-coupling` 通过
- 爱快故障根因：设备内部写路径故障（设备 bug），重启后自愈，非面板问题

## [3.0.1] - 2026-08-07

### Fixed
- **fix(network): CNAME 保存校验兼容多条目格式，修复用户面板域名不显示（双 Bug）**
  - **Bug 1 - 保存失败**：V5 安全审计（`b08ba2d`）在 `network.js` 新增的后端校验正则只接受纯 ASCII 单个域名，但前端保存的是 `label||.domain` 逗号分隔多条目格式（如 `电信||.auto.mcsr.cc,联通||.cn2.mcsr.cc`）——含中文 label、`||`、前导 `.` 必然被拒 -> 400「CNAME 域名格式无效或过长」
  - **Bug 2 - 不显示**：`router.get('/api/cname')` 挂在 `/api` 下真实 URL 为 `/api/api/cname`（双重前缀）；`72e64ef` 修复 token 续期时把前端改为 `api('/cname')` -> 请求 `/api/cname` -> 404 -> `loadCnameDomain` 静默吞错 -> CNAME 全部消失
  - **修复**：新增 `server/utils/cname-validate.js` 纯函数校验模块（整串 ≤4096、按逗号拆分新格式 `label||.domain` + 旧格式兼容、label ≤50 禁控制字符、domain 标准 DNS 正则逐条校验）；`network.js` 校验块改调用 `validateCnameDomain`；路由 `/api/cname` -> `/cname` 与前端对齐
  - 仅改后端（2 文件 +84/-4），前端零改动，缓存版本不变

### Notes
- 测试：**426 passing / 0 failing**（新增 `test/network-cname.test.js` 30 用例；顺手修正 rate-limit-config 断言 42->43）
- 实测 `电信||.auto.mcsr.cc,联通||.cn2.mcsr.cc` 通过、`bad domain!`/`电信||` 拒绝
- 部署后端后后台保存 CNAME 与用户面板显示即恢复

## [3.0.0] - 2026-08-07

### 概览

**主版本发布**：核心新增**私有网络 VLAN 子网模块**（用户可自建 VLAN 子网，绑定 VM/LXC 并自动配置 DHCP 静态绑定），同时完成**安全审计报告 V5 全量修复**（5 中危 + 12 低危 + 8 信息）、补货按钮回归修复、换绑邮箱独立邮件模板。自 v2.35.2 以来共 36 个提交（13 feat + 19 fix + 3 refactor + 1 perf），62 文件 +3014/-331。

### Added（13 个 feat）
- **feat(network): 私有网络 VLAN 子网模块**（主功能）
  - 用户可自建 VLAN 子网（vlan_name/vlan_id/gateway/netmask/addr_pool/物理接口），绑定到自己的 VM/LXC
  - VM/LXC 开通时写入 `subnet_id` + net0 尾部追加 `tag=<vlan_id>` VLAN tag + 自动创建 DHCP 静态绑定并回写 `dhcp_static_ip`
  - admin 代开可选子网；不传子网则**关机状态交付**（移除自动开机）
  - 每用户最多创建子网数量配置（`vlan_max_per_user` 默认 5）+ 创建弹窗配额展示（已创建/上限/剩余）
  - 子网列表归属隔离（`GET /subnets` 按 `req.user.id` 过滤，不泄露他人网段）
  - 可用 IP 刷新（单次爱快调用批量更新 + 轮询优化 + 基准值提前退出 + 处理中动效）
  - 运行中绑定子网（管理员二次确认），绑定后同步重建端口转发规则为新 IP
- **feat(network): 管理后台网络菜单重构**
  - 「系统设置 -> 网络管理」改名「网络配置」；新增一级菜单「网络管理」（端口转发管理 + 私有网络管理页）
  - 私有网络管理页：只读表格（所有者/VLAN/网关掩码/地址池/可用 IP/绑定设备统计），搜索分页，`getBoundCounts()` 一次 GROUP BY 避免 N+1
- **feat(ip): 重置 IP 兼容私有网络并开放到用户侧**
  - `random-ip` 支持 `subnet_id`：从子网 IP 池 `pickUnusedStaticIp` 选取，归属校验防越权
  - reset-ip 读取 `subnet_id`：未绑定拦截、static 池内校验、LXC 网关用子网 gateway
  - dashboard 4 处「更多」菜单新增「重置 IP」+ 弹窗（static/dhcp/随机/loading）
- **feat(security): V5 审计全量修复（5 中危 + 12 低危 + 8 信息）**
  - M-1 账户接管链：`verifySensitiveAction` 统一二次验证（当前密码/2FA 动态码/恢复码），接入改密/换邮箱/重生成恢复码
  - M-2 到期资源拦截补全：VNC 控制台/快照/备份/端口转发/子网 bind
  - M-3/M-4 外呼与充值限速接入 admin 可配置（check-port/extract-ips/recharge/random-ip）
  - M-5 支付入账三步事务化（流水/余额/标记，崩溃后网关重试不再丢账）
  - 低危：参数校验、端口转发 name/protocol 白名单、CDK 先验归属后标记 + 时长上限、admin 充值上限、vmid 白名单、uapipro 错误透传、WS 连接数上限（vnc/terminal proxy）
- **feat(email): 换绑邮箱独立验证邮件模板**
  - 换绑场景独立模板（紫色高亮新邮箱 + 安全提醒）；重发验证中性文案（不再复用注册文案）；问候语带用户名
  - 验证成功后清除 `profileCache`，用户中心状态即时同步
- **feat(ui): 全站限速 429 统一返回 retryAfter**，前端弹窗全局展示倒计时（邮箱验证限速弹窗展示剩余秒数）

### Changed
- refactor(network): 子网列表隐藏 VLAN ID 仅显示网络名称；VLAN 备注仅保留所属用户（去 NT 随机后缀）；清理用户端文案后台细节
- perf(network): 可用 IP 轮询优化（基准值提前退出）+ 处理中动效
- fix(ui): 弹窗说明文字明暗模式可读性修复

### Fixed
- **fix(frontend): 补货按钮失效回归修复**（VM/LXC 补货、系统操作日志清空）
  - `4307ee4` 弹窗重构漏掉 `customPromptModal` -> `customPrompt()` 静默 resolve(null) -> 点击无反应
  - 补回共享模板引入 `_withKeys` 渲染崩溃（dashboard/user-center）-> **最终方案**：prompt 弹窗移至 admin 专属模板
- **fix(package): 套餐更新日志记录字段级变更明细**
  - 补货/编辑保存基于 DB 新旧记录 diff，不再依赖请求 body：`更新VM套餐 #6:测试(1核/1G/40G/月付¥100)；变更:库存 0→1`
- **fix(audit): 补齐 VM/LXC 移除、销毁、重置 IP 的后台操作日志**（`admin.vm.*` / `admin.lxc.*` 前缀归位）
- **fix(frontend): user-center `_withKeys` 崩溃**（V5 M-1 二次验证弹窗 Teleport 内 `@keyup.enter` 触发 Vue 3.3.11 编译产物解构失败）
- **fix(security): 邮箱验证邮件统一限速**，修复重发验证可无限点击轰炸
- fix(user): 验证邮箱后清除 profileCache，用户中心状态即时同步
- fix(ui): cache-version 70->71 修复线上 JS 缓存不失效（并行会话版本号复用教训）

### Security
- 🔒 安全审计报告 V5 全量修复（5 中危 + 12 低危 + 8 信息，报告 `.zcode/安全审计报告V5.md`）
- 🔒 私有网络子网配额服务端校验、创建限速、列表归属隔离（`f4e3ded`）均达标
- 🔒 命令注入/SQL 注入/WebSocket 认证/XSS 双路径净化/支付回调链确认无回归

### Notes
- 新增文件：`server/routes/subnet.js`（631 行）、`server/api/db-subnets.js`、`server/services/dhcp.js`、`server/services/port-forward-sync.js`、`server/api/ikuai-api.js` 扩展、`public/js/dashboard/subnet.js`、`public/js/admin/admin-template-private-network.js`
- 新表/字段：`subnets` 表（启动自动建表）+ `vms/lxc_containers.subnet_id` + `vlan_max_per_user` 配置（默认 5）
- 限速规则新增「支付」大类（规则数 34 -> 42，大类 10 -> 11）
- 测试：**396 passing**；`check-coupling` 8 项断言全绿
- 私有网络功能依赖 ikuai DHCP 静态绑定，需配置 ikuai 软路由

## [2.35.2] - 2026-08-05

### Fixed
- **fix(logs): 补全后台操作子域映射（cache/package-group 漏映射）**
  - 盘点全部 `admin.*` 埋点与 `ADMIN_SUB_CATEGORIES` 白名单差异，补上 2 个遗漏子域：
    - `cache` -> 「缓存管理」
    - `package-group` -> 「套餐分组」
  - 前端后台操作筛选下拉同步新增这两项（共 16 项），子域中文名映射正确
  - 涉及文件：`server/api/db-messaging.js`（白名单单一来源）、`public/js/admin/admin-template-logs.js`（下拉）、`public/cache-version.json`（v51）

### Notes
- 验证：全量测试 396 passing（含 17 子域白名单断言）、浏览器冒烟 `cache` 筛选命中 `admin.cache.clear` 且中文名正确
- 缓存版本 v51

## [2.35.1] - 2026-08-04

### Added
- **feat(logs): 日志中心筛选功能统一与用户名模糊搜索**
  - 四个 tab（操作/后台/登录/系统切换）筛选功能统一，以「操作日志」为基准
  - 后台操作 tab 补齐用户名输入框；系统切换 tab 补齐关键字 + 起止日期输入框，按钮统一「查询」
  - 用户名模糊搜索：`username = ?` -> `username LIKE ?`（操作/登录/系统切换日志）
  - 系统切换 keyword 同时匹配用户名/VMID/来源系统名/目标系统名，日期范围过滤
  - 请求参数均 `encodeURIComponent`；服务端状态白名单/长度/日期格式/数字校验补强
  - `normalizeDateParam` 日期工具收敛到 `utils/date.js` 单一来源
- **feat(ip-location): IP 归属地持久化入库，消除重复外呼费用**
  - 新增 `ip_locations` 表（ip 主键 + 归属地 + 更新时间，启动幂等建表）+ `db-ip.js`（批量读库 + 幂等 upsert）
  - 三层缓存：Redis（7 天）-> 数据库表（30 天）-> 外呼 UApiPro；首次查询成功即写回 DB+Redis，外呼失败不写负缓存
  - 9 处调用点自动受益；keyword 搜索 JOIN `ip_locations` 表匹配归属地

### Fixed
- **fix(auth): 修复 token 自动续期 /api 前缀回归，恢复登录自动续期**
  - 低耦合优化 `6198781` 将 `shared.js` 两处 refresh 改为 `fetch(window.__apiPaths.REFRESH_TOKEN)`，但常量值不含 `/api` 前缀（仅 `api()` 封装约定）-> 请求变 `POST /auth/refresh` -> 404 -> token 被清空 -> 登录 2 小时强制退出
  - 修复：改为 `fetch('/api' + window.__apiPaths.REFRESH_TOKEN, ...)`；`check-coupling.js` 新增防复发断言（裸 `fetch(window.__apiPaths.` 即报错）
  - 顺带修复 `dashboard/core.js` 双前缀 `api('/api/cname')` 历史遗留
- **fix(rate-limit): 限速设置日志改归后台操作·安全设置，详情记录参数变化明细**
  - 审计 action `security.rate-limit` -> `admin.security.rate-limit`，自动从「操作日志」移入「后台操作 > 安全设置」（新增 `security: '安全设置'` 子域白名单）
  - 保存前读旧配置对比构造 details：`登录尝试 5次/1分钟→6次/2分钟`，恢复默认显示 `恢复默认参数`，无变化显示 `无参数变化`
  - `formatRateLimitWindow` 按前端规则换算易读单位
- **fix(rate-limit): 修复保存按钮被误判为恢复默认**
  - 模板 `@click="saveRateLimitConfig"`（函数引用）传参时 Vue 把 MouseEvent 当第一个参数 -> `!!restoreDefault` 恒为 true
  - 双保险：`restoreDefault === true` 严格比较 + 模板改 `@click="saveRateLimitConfig()"`
- **fix(refactor): 低耦合优化残留低危项修复与前端常量收敛补全**
  - 修正 `api-paths.js` `ADMIN_USERS` 错误值（`/admin/users` -> `/users`）；`push-proxy.js` hbTimer 声明上移（TDZ 脆弱写法）
  - check-coupling 断言扩展：全前端裸 `fetch(window.__apiPaths.)` 检查 + api-paths 不得以 `/api` 开头 + storage-keys 格式校验
  - 常量收敛补全：logout 路径 3 处、token 键名 16 处、tab/分页键 6 处、`PROVISIONING_PREFIX` 12 处 -> 单一来源

### Notes
- 新表 `ip_locations` 启动自动创建，无需手动 SQL；历史日志不批量回填（浏览到的 IP 才入库）
- 测试：**396 passing**；`check-coupling` 8 项断言全绿
- 线上部署需 `pm2 restart pve-panel` 生效

## [2.35.0] - 2026-08-04

### Added（5 个 feat）
- **feat(security): 新增安全防护·限速设置（全站限速可配置化）**
  - admin 侧边栏「系统设置」下方新增「安全防护 -> 限速设置」菜单（盾牌图标，仅 admin 可见，`?section=security`）
  - **限速总开关**（关闭后全站所有限速失效）+ **10 大类 32 条规则**，每条可单独开关并配置「N 次 / 时间窗」
  - `server/constants.js` 新增 `RATE_LIMIT_CATEGORIES` / `RATE_LIMIT_RULES` 为唯一默认值来源（替代原 31 处硬编码）
  - 27 处 `checkRateLimit` -> `checkConfiguredRateLimit`（DB 读取失败降级回默认规则，不裸奔）
  - 保存后立即生效（缓存放行）+ 写审计日志（`security.rate-limit`）+ 恢复默认按钮
  - 规则覆盖：登录认证/注册/CDK 兑换/虚拟机/LXC/备份/磁盘操作/日志清理等
- **feat(logs): 新增 admin 日志中心（操作/后台/登录/系统切换四 tab）**
  - 侧边栏一级菜单「日志中心」（`?section=logs`），页内 4 tabs：
    - 操作日志：全站用户操作（强制排除 `admin.*`）
    - 后台操作：仅 `admin.*`，按二级子域下拉筛选（`ADMIN_SUB_CATEGORIES` 单一来源中文映射）
    - 登录日志：全站登录日志
    - 系统切换：原 os-switch-logs 页面迁入，能力保留
  - 新增约 10 个 admin 端点（`server/routes/admin-logs.js`），支持 scope/action_prefix 筛选、访问/导出/删除/清空
  - tab 白名单 localStorage 持久化；旧链接 `?section=os-switch-logs` 兼容映射
- **feat(audit): 补齐 admin 后台操作审计埋点并升级日志清理策略**
  - 从原 4 处补齐至约 50 处（82 处 `admin.*` 引用），覆盖人工充值/配置保存/CDK/套餐模板/消息群发/admin 代开/端口转发编辑/2FA 禁用等
  - `admin.*` 日志从用户维度收敛中隔离，按全站独立上限 `log:keep_admin_count`（默认 5000）保留
  - 后台操作「操作类型」列映射子域中文名，CSV 导出同步
- **feat(logs): 日志中心检索增强**
  - 编码列/用户名 ID/系统切换用户名搜索/回车查询
- **feat(style): 统一面板表格样式（玻璃态 table-container + 通用 pv-pagination 组件）**
  - `public/shared/css/components.css` 作为唯一 `.table-container` 定义（玻璃态单一来源，删除 admin/dashboard 重复定义）
  - 新建通用分页组件 `public/components/pv-pagination.js`（仿 pv-button.js 模式），三端 EJS 引入
  - 弹窗内表格统一玻璃态容器；`--glass-bg` 透明度 0.9 -> 暗色 0.7 / 亮色 0.8 提升玻璃可见性
  - 16 处 `table-striped`（斑马纹）-> `table-hover`（透明行 + 悬停高亮），全量零残留

### Changed
- style(admin): 全站页面标题统一 `module-header` 徽章模板（26 处：缺徽章 10 处 + 容器不标准 11 处 + 特例 3 处 + dashboard 2 处），复用共享层单一来源
- style(logs): 日志表格容器玻璃态 `table-container`，dashboard/用户中心消息 tabs 统一 admin 日志中心玻璃渐变药丸样式
- fix(style): 亮色模式下 tabs active 白字看不清，改用深色主题字（三端共用）
- refactor(style): 统一面板表格样式（玻璃态 table-container + 通用 pv-pagination 组件）

### Fixed
- fix(logs): 修复全站日志查询无筛选条件时生成空 `WHERE` 子句的 SQL 语法错误
- fix(logs): 修复 `execute()` 返回数组未解构导致删除/清空计数恒为 0、删除误报 404（db-vms 同类问题一并修复）
- fix(logs): 修复首次访问日志中心不加载（初始化接口异常中断 Promise.all）
- fix(logs): 系统切换底部分页条与条数统计补齐（四 tab 统一）
- fix(security): 修复限速设置点击进入不加载规则列表（watch 值不变不触发问题）

### Notes
- 新增配置：`ratelimit:master_enabled` + 32 条规则（共 97 键），存量库重启自动补齐（`INSERT IGNORE` 幂等）
- 新增配置：`log:keep_admin_count`（默认 5000），后台操作日志独立保留上限
- 新增文件：`server/routes/admin-logs.js`、`server/utils/log-format.js`、`public/components/pv-pagination.js`、`public/js/admin/admin-logs.js`、`admin-template-logs.js`、`admin-template-security.js`
- 测试：**389 passing**；`check-coupling` 通过
- 迁移说明：限速配置与 admin 日志上限配置升级后首次启动自动初始化，无需手动 SQL

## [2.34.2] - 2026-08-04

### Fixed
- **fix(email): 恢复 sendEmail/shouldSendEmail 的 db 懒加载引用（bd1017f 回归）**
  - **问题**：pm2 日志持续报错 `[email] shouldSendEmail 查询失败: db is not defined` + `[payment] 邮件发送失败: db is not defined`，**所有邮件通知（支付/开通/到期/备份，约 13 个文件引用）均受影响**
  - **根因**：低耦合优化批次 3 commit `bd1017f`（utils 层倒挂清零）删除了 `server/utils/email.js` 顶部的 `const db = require('../api/db')`，但只给 `getSiteName()` 补了行内懒加载，**漏掉 `sendEmail()` 和 `shouldSendEmail()` 两处** -> 运行时 `ReferenceError: db is not defined`
  - **修复**：按 utils 叶子层规范（不能顶层 require api），在两函数体内加行内懒加载（与 `getSiteName()` 同款写法），共 4 行
  - 错误链说明：`shouldSendEmail` 抛错被自身 catch 吞掉（返回 true）-> 继续调 `sendEmail` 再次抛错 -> 被 `payment.js` 的 catch 捕获。日志两条错误实为**同一封邮件连报两次**

### Notes
- 验证：`node --check` 通过 / `npm test` 341 passing / `check-coupling` 7 项全绿
- 线上部署后需 `pm2 restart pve-panel` 生效
- 与安全审计 V4 无关（V4-03 只改配置存储层，email.js 未动）

## [2.34.1] - 2026-08-04

### Security

**安全审计报告 V4 全量修复（12 项漏洞，审计继承链 DEBUG->V1->V2->SEC-001~011->V3->V4）**

- 🔴 **V4-01 [高] 支付商户密钥（含 RSA 私钥）明文落库**
  - AES-256-GCM 加密存储 + 解密消费（payment.js 5 处消费点）+ 掩码回显
  - `decrypt` 内置明文兼容，存量数据无损迁移
- 🟠 **V4-02 [中] 余额扣款 TOCTOU 竞态（并发负余额双花）**
  - 6 处扣款点加 `AND balance >= ?` + affectedRows 判断回滚
  - `db-users.js` 新增原子 `decrementBalance`；充值沿用 `CAST(balance AS DECIMAL(10,2)) + ?`
- 🟠 **V4-03 [中] SMTP 密码明文入库** -> 同加密模式；未传密码时保留库内旧密文（修复重复加密 bug）
- 🟠 **V4-04 [中] `pay:v1_enabled` 死开关**（MD5 无法禁用）-> 下单/验签路径均消费该开关，默认 '1' 保持存量行为
- 🟡 **V4-05 [中低] 非群发站内信无服务端净化** -> 新建 `server/utils/message-sanitize.js`，messages.create 链路统一净化
- 🟡 **V4-06 [低] CSV 导出公式注入/字段未转义** -> 新建 `server/utils/csv.js`，log/流水/订单/CDK 四处统一转义（`=+-@` 前缀处理与引号包裹）
- 🟡 **V4-07 [低] os-switch 死代码含未校验命令插值**（LVM path 拼接）-> 全仓确认无引用后整段删除
- 🟡 **V4-08 [低] SSH 错误串泄露完整命令** -> 错误信息去掉 `${cmd}`
- 🟡 **V4-09 [低] VM 备份 admin storage 无白名单** -> 补白名单校验（空值仍走默认）
- 🟡 **V4-10 [低] snapshot LXC delete 缺 vmid 范围校验** -> 补 100~999999999 校验
- 🟡 **V4-11 [低] 续费数量无上限（可日期溢出）** -> `MAX_PERIOD_COUNT=99` 常量单一来源，续费/加购统一限量
- 🟡 **V4-12 [低] 会话消费非原子（重放竞态）** -> `consumeSession` 改 Lua 原子 GET+DEL

### Notes

- 验证：`node --check` 0 错误 / `npm test` **341 passing**（基线 309 + 32 项安全回归测试）/ `check-coupling.js` 7 项全绿
- 存量兼容：支付 MD5 兼容保留（`v1_enabled` 开关控制）；支付密钥/SMTP 密码加密后历史明文可无损迁移
- 审计报告：`.zcode/安全审计报告V4.md`（本地留存，不入库）
- 已知降级面（不强制改）：rate-limiter Redis 内存回退、旧 SHA256 无盐兼容

## [2.34.0] - 2026-08-03

### 概览

本次为**重大架构重构版本**：按「低耦合高内聚」规范对全项目前后端高耦合点做了行为保持型重构（只移动/归位/合并，不改业务逻辑与接口）。后端路由层大幅瘦身（**11,664 行 -> 约 7,400 行，-43%**），新增 11 个业务服务模块，前端弹窗体系 4 套收敛为 1 套。测试从 293 增至 **309 passing / 0 failing**，三端 UI 冒烟全部通过。

### Changed（11 个 refactor，按业务域分批）

- **常量与时间统一（`48fc203`）**
  - 新建 `server/constants.js` 单一来源：周期/磁盘类型/订单状态/模板状态/支付方式等，替换 6 个大路由中 3-4 份重复拷贝
  - 时间工具统一到 `utils/date.js`：**12 处 `toISOString` 清理至仅剩 2 处合法用法**
- **支付/CDK/计费域（`2353385`）**：抽取 `services/payment.js` / `cdk.js` / `billing.js`，`wallet.js` 大幅瘦身（顶层仅保留 express/db/auth/safeError/services/constants）
- **开通域（`f16387f`）**：抽取 `services/provisioning.js`（VM/LXC 开通/管理端代开），`package.js` 1237 -> 约 570 行，移除 SSH/ikuai/email 依赖
- **磁盘域（`61bf340`）**：`disk-utils.js` 一拆三（`disk-validation.js` 校验纯函数、`disk-billing.js` 计费纯函数、`services/disk-ops.js` PVE/SSH 命令封装），新增 `services/disk.js`（购买/挂载/卸载/扩容/续费/销毁/自动续费 7 个编排，含事务与退款回滚），`routes/disk.js` 954 -> 约 300 行
- **配置运维域（`1fb93c8`）**：抽取 `services/release-check.js`（GitHub/Gitee 双源+回退+静默降级）/ `system-update.js` / `redis-admin.js`，`admin-config.js` 移除顶层 axios/child_process 依赖
- **系统切换域（`a822699`）**：系统切换业务上移 `utils/os-switch-utils.js` -> `services/os-switch.js`，utils 不再依赖 api/services
- **WebSocket 解耦（`045b89e`）**：`push-proxy` 只留连接管理，状态缓存抽到 `services/status-cache.js`
- **软环修复（`bd1017f`）**：utils 层顶层 require 倒挂清零（7 文件改行内懒加载），删除软环死导入（如 token.js 死导入）
- **前端弹窗统一（`4307ee4`）**：customAlert/customConfirm 4 套平行实现 -> 1 套（shared 模板 + `shared.js` 统一逻辑）
- **前端常量与注册表（`6198781`）**：常量单一来源（`storage-keys.js` / `api-paths.js`）+ section 注册表，去掉 dashboard `switchSection` monkey-patch（改 `registerSectionLoader`）
- **模板 div hack 修复（`11348ab`）**：去掉模板装配器 div 配平 hack，14 个模板片段自包含根节点（delta=0 验证）

### Added

- **test(quality): 新增低耦合自动化断言 `scripts/check-coupling.js`**（7 项架构断言门禁：常量单一来源/无 Module 自引用/DDL 集中/toISOString 合规/utils 叶子层无顶层 api-services 依赖/事务统一/无循环依赖）+ 16 个 services 行为测试

### 📝 性能与代码量说明

| 维度 | 优化前 | 优化后 | 收益 |
|------|--------|--------|------|
| 后端 routes 总行数 | 11,664 行 | 约 7,400 行 | **-43%**，路由层仅保留校验/限速/响应 |
| `package.js` | 1237 行 | 约 570 行 | -54% |
| `disk.js` 路由 | 954 行 | 约 300 行 | -69% |
| `wallet.js` | 约 950 行 | 约 350 行 | -63% |
| 前端弹窗体系 | 4 套平行实现 | 1 套 | 4:1 收敛 |
| 常量定义 | 6 路由内 3-4 份重复拷贝 | `constants.js` 单一来源 | 消除重复 |
| `toISOString` 用法 | 12 处 | 2 处（合法） | 统一时间处理 |
| utils 层顶层倒挂 | 7 文件 | 0 | 软环清零 |
| 测试 | 293 passing | **309 passing / 0 failing** | +16 services 行为测试 |

- 架构收益：路由层从「业务大杂烩」变为「校验 + 响应」薄层；services 按业务域垂直拆分（支付/开通/磁盘/运维/系统切换）；纯函数模块（disk-validation/billing）无外部 I/O 便于单测；前端结构收益为弹窗资源 4:1 收敛、模板装配器不再因结构变更破坏整页布局
- 行为保持型重构：业务逻辑与接口零改动，30+ 消费者无感

### Notes

- 新增 `server/constants.js`、`server/services/` 目录（11 个模块）、`server/utils/disk-validation.js` / `disk-billing.js`
- 新增 `scripts/check-coupling.js` 架构门禁（CI 可接入）
- 冒烟验证：16/16 只读接口返回 JSON + 三端 Playwright UI 冒烟全部通过
- 无数据库 schema 变更，升级无需额外操作
- 顺带修复 3 个既有缺陷：token-store 引用未定义变量、VM 开通 DHCP 绑定依赖 MAC 分组变量、订单导出接口路径 `-users` 假阳性

## [2.33.10] - 2026-08-03

### Changed
- **perf: 数据库补索引、Redis 缓存链路修复与表单加载提速**
  - **数据库补索引（27 个）**：`migrateSchema()` 新增 PERF-02 索引块（`safeAddIndex` 幂等迁移，服务启动自动执行），覆盖 `memos.user_id`、`users.role`、`backups.ct_id`、`cdk_codes.is_used`、`transaction_records.pay_time`、`disks(status, expire_time)`、`vm_packages.template_id`、`messages.type`、`vm_os_switch_logs(user_id, started_at)` 等高频查询路径
  - **Redis 缓存链路修复（核心 Bug）**：`cache-store.js` / `token-store.js` 原在模块加载时获取 Redis 客户端，而 Redis 配置在 listen 回调才从 DB 加载，导致 Redis 实际从未启用（缓存全走进程内存）。改为**惰性获取**（调用时才 `getRedisClient()`）；`scanDel` 适配 keyPrefix；Redis 读取失败静默回退内存
  - **Redis 重连优化**：`retryStrategy` 持续重连（退避 `min(times*1000, 30000)`），删除无效参数 `offlineQueueMaxItems`
  - **分布式锁修复**：`tasks.js` 锁 token 化，Lua 原子比对释放，防止误删他人锁
  - **PVE 只读缓存**：`pve-api.js` 11 个只读方法加 30s 短 TTL 缓存（存储列表/模板/VM config/快照等），24 个写操作统一清缓存，异常不缓存
  - **前端并行化**：admin/dashboard 初始化加载链改 `Promise.all`，消除串行等待
  - **/disk-options 缓存**：复用管理端规格/存储分组缓存（300s），写操作统一失效
  - **日志页 IP 归属地优化**：开关 60s 缓存、外呼失败不写缓存、single-flight 同 IP 并发去重
- **docs(readme): 全量维护文档**，同步 v2.32.1~v2.33.9 新功能与项目结构

### Notes
- 索引迁移为幂等操作，升级后首次启动自动执行，无需手动 SQL
- 修复后 Redis 缓存将真正生效（此前实际未启用），配置了 Redis 的环境重启后即生效
- PVE 只读缓存 30s TTL，异常不缓存每次回源，不影响数据一致性

## [2.33.9] - 2026-08-03

### Added
- **feat(admin): 站点设置新增「用户日志上限」配置**
  - 新增 `GET/PUT /api/admin/log/config`，读写 `log:keep_count` 配置
  - 校验范围 100–100000，默认 5000，保存即实时生效
  - 前端站点设置「Redis 缓存配置」下方新增配置卡片
- **feat(logs): 日志页新增保留上限 Tips 提示**
  - Tips 展示后端返回的 `logKeepCount` 动态值，提示用户日志保留策略

### Changed
- style(logs): Tips 提示改用主题红色变量（`--color-danger`），深色模式自动加深
- docs(skills): 新增侧边栏与标签状态保持规范（刷新后状态不丢）
- chore: 从 git 移除误提交的 `.zcode` 技能文件，严格遵循 `.gitignore`（`.zcode/` 不入库）

## [2.33.8] - 2026-08-03

### Added
- **feat(logs): dashboard 新增日志功能（操作日志/登录日志查看、导出、清空）**
  - 侧边栏「日志」单菜单 + 页面内 tab 切换（操作日志 | 登陆日志），刷新保持当前 tab
  - 操作日志列：用户 | 操作类型 | 详情（含操作者 IP 归属地前缀）| 操作时间
  - 登录日志列：IP 地址(归属地) | 用户代理 | 登录状态 | 时间
  - 筛选：操作类型下拉 / 登录状态下拉（选择即自动刷新）、关键字搜索框（回车触发）
  - 分页组件升级：页码跳转、每页条数选择（localStorage 持久化）、总数显示
  - 批量删除 + 清空全部
- **feat(logs): 每用户日志保留上限 5000 条，超限自动循环清理防写爆数据库**
  - 默认配置 `log:keep_count: '5000'`（audit_logs 与 login_logs 共用）
  - 定时任务每小时整点清理（Redis 锁防并发）+ 启动立即执行一次
  - 批量删除后即时收敛到保留上限（防短暂超限堆积）
  - 软上限设计：写入路径零开销（纯 INSERT 永不失败），定时回收兜底
- **feat(dashboard): 侧边栏刷新后保持当前标签页与展开状态**
  - `activeSection` 写回 URL（`?section=`），刷新后高亮与内容保持一致
  - 折叠组展开态持久化到 localStorage，恢复子菜单选中项
  - 修复直达 `?section=lxc` 链接时高亮与内容不一致的既有 bug

### Changed
- refactor: 审计埋点低耦合重构，操作日志补网络功能埋点与批量逐条明细
- chore: 开发规范技能（pve-dev-standards 等）纳入 git 版本管理
- fix(test): mocha 测试加 `--exit` 防止残留句柄导致进程挂起

### Fixed
- fix(logs): CSV 导出时间字段防 Excel 吞秒（零宽空格强制文本显示）
- fix(logs): user.login 操作日志详情不再叠加 IP 归属地前缀（避免重复）
- fix(logs): 登陆状态徽标列加 nowrap 防截断，用户代理列允许换行防撑宽表格
- style(logs): 详情/用户代理/操作时间列对齐与颜色统一优化

### Notes
- 日志功能依赖 `audit_logs` / `login_logs` 表，启动时自动建表，无需手动迁移
- 保留上限可通过系统设置调整，默认 5000 条/用户

## [2.33.7] - 2026-08-03

### Fixed
- **fix(auth): 修复登录设备管理登录时间显示偏差（UTC 时区）**
  - **问题**：「登录设备管理」页显示登录时间慢 8 小时，且 token 提前 8 小时过期、设备列表项提前消失
  - **根因**：`server/routes/auth.js` 中 4 处写 `refresh_tokens` 表时用 `new Date().toISOString()`（UTC 墙钟时间）存入 MySQL DATETIME，前端 `formatDate` 按浏览器本地时间原样解析，不做时区偏移
  - **修复**：4 个写入点共 8 处字段改用已有 `formatLocalDateTime()`（取本地墙钟，`YYYY-MM-DD HH:MM:SS`）：
    - `POST /login`、`POST /login/2fa`、恢复码登录、`POST /auth/refresh`
  - 新增 `scripts/fix-refresh-token-timezone.js` 旧数据修正脚本（支持 dry-run / `--apply`），历史记录 `created_at`/`expires_at` +8 小时修正

### Notes
- 已部署的历史错误数据需执行 `node scripts/fix-refresh-token-timezone.js --apply` 修正（新部署无需执行）
- 端到端验证：真实登录写入时间与本地时间相差 1 秒以内

## [2.33.6] - 2026-08-02

### Added
- **feat(uapipro): 集成 UApiPro IP 归属地查询**
  - 登录设备列表（用户中心）IP 单元格显示归属地：`111.29.236.38（中国移动 中国 海南 五指山）`
  - 新增 `server/services/ip-location.js`：`normalizeIp`（剥 `::ffff:` 前缀，拒绝内网/回环/CGNAT/域名防 SSRF）、`formatLocation`（region 去连续重复段）、`getIpLocation`（7 天缓存，Redis 优先内存回退，axios 5s 超时，任何异常静默降级）
  - Admin 系统设置新增「UApiPro」配置页：启用开关 + API Key 输入（AES-256-GCM 加密存储，返回打码）+ 连通性测试（独立限速 10 次/分钟）
  - `GET /user/devices` 用 `Promise.allSettled` 批量去重查询，失败返回空串不影响主流程
  - **功能默认关闭**（防误耗第三方额度），需在「系统设置 -> UApiPro」手动开启
  - 缓存版本 v12 -> v13

### Fixed
- **fix(uapipro): IP 归属地示例改用虚构数据**，避免真实地址泄露

### Notes
- UApiPro 接口：`GET https://uapis.cn/api/v1/network/ipinfo`，认证用 `X-API-Key` 请求头（勿放 URL query）
- 无 Key 可调用（游客免费额度约 1500 积分/月），Key 在 uapis.cn/console 签发
- 生产环境首次使用需手动开启 UApiPro 开关并验证连通性

## [2.33.5] - 2026-08-02

### Changed
- **refactor(db): 拆分 db-mysql.js 为 db-core/schema 与业务域模块**
  - 原 `server/api/db-mysql.js`（2900 行、40 个顶层导出键）按业务域拆分为 **1 个聚合入口 + 11 个模块**
  - 新文件布局（`server/api/`）：
    - `db.js` — 聚合入口，按拆分前导出形状导出，约 30 个消费者零改动
    - `db-core.js` — 连接池单例、`execute`/`queryOne`/`queryAll`、时间工具
    - `db-schema.js` — 建表、迁移、默认配置、默认管理员
    - `db-users.js` / `db-vms.js` / `db-orders.js` / `db-disks.js` / `db-backup.js` / `db-network.js` / `db-messaging.js` / `db-config.js` / `db-billing.js` — 9 个业务域模块
  - 修复 4 处 `module.exports.xxx` 内部自引用为模块内直调
  - 删除从未使用的死导入 `CryptoJS`
  - 导出形状对比：新版 `db.js` vs 旧版 `db-mysql.js`，40 个顶层键及函数集合**零差异**
  - 验证：`node --check` 全部通过、3 个受影响静态测试 6 passing、全量 mocha 255 passing
  - 规模：13 文件，+3056/-2901

### Notes
- 纯重构，无功能变更、无数据库 schema 变更，升级无需额外操作

## [2.33.4] - 2026-08-02

### Fixed
- **fix(admin): 修复虚拟机列表状态徽标模板标签嵌套导致的偏移**
  - **问题**：改写 Admin VM 表格状态徽标时把 `<template v-if>` 直接放进 `<td>` 内部，缺外层 `<td>`，导致徽标向上偏移
  - **修复**：`public/js/admin/admin-template-vm.js` 补回外层 `<td>` 包裹整个 `<template>` 块（`_provisioning` / `vmBusyClass` / 普通状态三分支）
  - 缓存版本 v11 -> v12

## [2.33.3] - 2026-08-01

### Added
- **feat(dashboard): 虚拟机/容器新增「备份中/恢复中/切换中」状态徽标并锁定操作按钮**
  - VM/LXC 列表新增状态徽标：备份中（蓝）、恢复中（紫）、切换中（橙，仅 VM）
  - 后端 `/user/vms`、`/user/lxc` 返回数据合并注入统一 `_busy` / `busyType` 字段
  - 判定来源：`backups.status`、`restore_tasks.status`、`vm_os_switch_logs.status`（均取 `pending/running`）
  - 优先级：切换中 > 备份中/恢复中
  - 操作按钮锁定：`_busy` 时禁用并提示重启/关机/停止/开机/快照/备份/网络/编辑/续费/重置密码/切换系统/销毁等，保留详情/控制台只读入口
  - 切换系统确认后自动关闭弹窗并立即刷新列表

### Fixed
- **fix(dashboard): 备份/恢复创建成功后立即刷新列表**，即时展示「备份中/恢复中」状态
- **fix(dashboard): 消除备份/恢复/切换完成瞬间的状态闪现**
  - 服务端按 DB 台账合并进行中状态，避免台账已结束但 PVE 瞬时报 running 的闪现
- **fix(dashboard): 备份/恢复完成后加宽限窗口，彻底消除关机后首次备份的运行中闪现**
  - `push-proxy.js` 新增 `markBackupRestoreComplete`，完成时间 5s 宽限期内前端保持「备份中/恢复中」，超窗后才放行真实 PVE 状态

## [2.33.2] - 2026-08-01

### Fixed
- **fix(dashboard): 移除无样式无驱动的半成品状态栏，消除左上角裸露的「就绪」文字**
  - **问题**：Dashboard 每个页面左上角显示裸露的 `<span id="statusText">就绪</span>` 文字
  - **根因**：提交 `dd6d62b`（引入 cache-version.json）在 `dashboard.ejs` 中残留了一个 `.status-bar` 区块（含 `wsStatus`、`statusText`、`lastUpdate`、`cpuLoad` 等元素），但全项目无对应 CSS 定义和 JS 驱动逻辑，属于半成品残留
  - **修复**：删除 `views/pages/dashboard.ejs` 中 `<main>` 内的整个 `<div class="status-bar">...</div>` 区块（13 行）
  - 确认 JS 中无悬空引用，删除对功能零影响

## [2.33.1] - 2026-08-01

### Added（2 个 feat）
- **feat(disk): 卸载数据盘转移到中转 VM 托管，防止用户 VM 销毁连带删除**
  - 新增 `server/services/holding-vm.js` 中转 VM 托管服务
  - 卸载的数据盘不再以 unused 状态留在用户 VM，而是转移到中转 VM（VMID 9999）托管
  - 防止用户销毁 VM 时 PVE 连带删除 unused 卷文件
- **feat(admin-disk): 存储分组徽标显示规格名 + 数据盘管理显示 PVE 路径**
  - 存储分组卡片显示关联的规格名称徽标
  - 数据盘管理列表增加 PVE 路径列

### Fixed（8 个 fix）
- **fix: 幽灵盘检测增加跨 VM 归属校验，防止误杀已迁移数据盘**
  - 审计时校验磁盘卷是否归属于当前 VM，避免已迁移到其他 VM 的数据盘被误判为幽灵盘销毁
- **fix: 卸载磁盘保留 unused 引用，禁止清理导致卷文件被销毁**
  - 修复卸载后清理 unused 配置导致 PVE 销毁卷文件的问题
- **fix: 卸载磁盘后清理 PVE unused 残留配置**
  - 卸载转移到中转 VM 后清理原 VM 的 unused 残留配置项
- **fix(disk): move_disk 任务等待容错 + 挂载失败日志**
  - `move_disk` 任务等待增加容错处理，挂载失败时输出详细日志
- **fix(disk): 挂载自愈，卷已被 move_disk 重命名时从中转 VM 找回**
  - 挂载时检测卷是否已被 `move_disk` 重命名，从中转 VM 配置中找回正确 volume_id
- **fix(disk): unbindDisk volumeId 未定义 + 卸载后同步更新 volume_id**
  - 修复 `unbindDisk` 中 volumeId 未定义导致卸载失败
  - 卸载后同步更新台账中的 volume_id
- **fix(admin): 原生 confirm/prompt 全部改为系统主题弹窗**
  - Admin 后台所有原生 `confirm()` / `prompt()` 替换为与系统主题一致的弹窗组件

### Security
- 🔒 幽灵盘检测跨 VM 归属校验，防止误杀已迁移数据盘（严重）
- 🔒 卸载数据盘转移到中转 VM 托管，防止用户 VM 销毁连带删除数据盘卷

## [2.33.0] - 2026-08-01

### ⚠️ 重要升级提示

本次为大版本功能更新，包含数据库 schema 变更（新增 `os_templates`、`vm_os_switch_logs`、`vm_disk_snapshots` 等表）。升级后首次启动会自动执行迁移，请确保数据库用户有 `ALTER`/`CREATE` 权限。

### Added（9 个 feat）
- **feat(os-switch): 系统切换功能完整实现**
  - 用户可自助切换 VM 操作系统（Windows/Linux 全系列）
  - 基于 PVE `move_disk` API 统一 LVM/DIR 路径，无需关机
  - 数据盘不受影响，切换过程自动处理 QOS 参数恢复和容量扩容
  - 速率限制每分钟 5 次
- **feat(admin): 系统切换日志页面**
  - Admin 后台查看所有用户系统切换记录
  - 支持状态/VMID/用户 ID 筛选、分页（20 条/页）、批量删除、清空全部、详情弹窗
- **feat(os-template): OS 模板管理**
  - PVE 模板 VMID 下拉选择 + 自动填充配置字段
  - 新增 `disk_format` 目标磁盘格式配置
  - OS 类型/版本/架构自动从 PVE 读取，禁止手动编辑
- **feat(notification): 用户邮件通知设置功能**
  - 用户可自定义接收哪些类型的邮件通知
- **feat(notification): 统一订单号格式 + 扣款/退款邮件通知补齐**
  - 所有订单号统一为 24 位格式（前缀 2 位 + 时间戳 14 位含秒 + 随机数 8 位）
  - 购买/扩容/续费/销毁/开通失败退款等 10 处场景补齐邮件通知
  - 邮件内容含余额变动前/后、订单号、退款单号
- **feat(admin): 分配 VM 时自动导入存量数据盘**
  - 管理员分配 VM 时自动扫描并导入 PVE 中已存在的数据盘
- **feat(backup): 恢复后磁盘对账审计，防止销毁退款后从备份恢复白嫖数据盘**
  - 新增 `vm_disk_snapshots` 表记录恢复前快照
  - 恢复后按设备槽位（`bind_bus + bind_dev`）对账
  - 已知槽位 volume_id 变更则更新台账 + 回收旧卷
  - 未知槽位（DB 无记录）视为幽灵盘，先 detach 再 destroy
- **feat(security): 销毁 VM 增加数据盘检查 + 错误信息脱敏**
  - 销毁 VM 前检查是否有挂载的数据盘，防止误删
- **feat: 引入 cache-version.json 统一管理前端静态资源缓存**
  - 前端 JS/CSS 缓存版本号从硬编码改为读取 `cache-version.json`

### Changed（8 refactor + 2 cleanup + 7 chore）
- refactor(os-switch): 跳过数据盘卸载/重挂载，DIR/LVM 统一 `move_disk` API
- refactor(os-switch): 删除切换价格功能
- refactor: 删除废弃的优雅关机相关代码
- refactor(admin): 彻底重构系统切换日志，按 admin.js 标准模式重写
- refactor(vm-template): VM 套餐模板表单去掉模板 VM/OS 类型/ciuser，新增系统盘容量
- chore: 统一日志工具，所有控制台输出带时间戳和前缀
- chore: 统一磁盘快照相关日志前缀为 `[快照]`
- chore(disk-import): 调试日志改为 DEBUG 模式才输出
- chore(log): disk-expiry-check 日志精简，日常只输出必要信息

### Fixed（104 个 fix，按主题归类）

**系统切换修复（20+ 个）**：
- fix(os-switch): QOS 参数总线兼容（`filterQosParams` 剔除 `iothread` 等）
- fix(os-switch): boot order 参数中的分号被 shell 解析为命令分隔符
- fix(os-switch): 旧系统盘 unlink 使用原总线而非模板总线
- fix(os-switch): LVM 多轮修复（lvrename / pvesm alloc+dd / move_disk API 演进）
- fix(os-switch): 先更新 ostype 再设置 cloud-init，修复首次切换 Windows 密码无效
- fix(os-switch): 仅 DIR 类存储传 format 参数，LVM/ZFS 不传
- fix(os-switch): 速率限制改为每分钟 5 次

**备份恢复磁盘审计修复（10+ 个）**：
- fix(backup): 恢复后磁盘对账审计，防止白嫖数据盘
- fix: 幽灵盘先 detach 再销毁，补充对账全链路日志
- fix: 幽灵盘不通过卷名判断系统盘，仅依赖槽位（`dev>=1`）
- fix: 精确区分 CD-ROM 和磁盘，IDE0 光驱不再计入系统盘
- fix: 移除 `validateVolumeId` 的 disk-0 拦截 + 恢复后释放旧卷
- fix: 幽灵盘销毁绕过 `validateVolumeId` 的 disk-0 拦截

**后台管理 Bug 修复（10+ 个）**：
- fix(admin): 用户列表排序不稳定 + 用户选择抽风（全量接口与分页竞态）
- fix(admin): 自动更新同版本误报（改用 `git merge-base --is-ancestor` 判断方向）
- fix(admin): 模板管理/功能日志刷新后父菜单不展开
- fix(admin): os-switch-logs 页面多项修复（分页/全选/详情/时间格式）
- fix: 邮件主题/模板去除 "PVE 面板" 硬编码，改用 `getSiteName()`
- fix: dashboard CSP 字体/DOMPurify 未定义 + 加载 marked 和 dompurify
- fix(csp): connect-src 放行 jsDelivr CDN 资源 map 拉取

**订单/钱包修复**：
- fix(wallet): 订单状态查询兼容 22 位时间戳订单号
- fix(wallet): 服务器续费订单号统一为 DD 格式
- fix(order): 新购 VM 根据套餐模板 disk_size 扩容系统盘到目标容量

**通知设置修复**：
- fix(notification): 修复 cdk.js/lxc.js 邮件块嵌套结构错误
- fix(notification): 子项分隔线适配明暗模式，资源开通默认折叠
- fix(vm): 修复移除通知邮件代码块缩进层级错误

**数据库修复**：
- fix(db): `vm_os_switch_logs` CREATE 缺少 TEXT NOT NULL 字段默认值
- fix(db): `allowed_package_ids` TEXT->VARCHAR(500) 兼容 MySQL 5.7
- fix(db): 新购 VM 时写入 `current_os_template_id`
- fix(db): 添加 `os_templates.ostype` 列迁移

**安全修复**：
- fix(security): 全量修复安全审计报告 V3 的 19 项安全问题
- fix(pve-template-config): 扩展 Windows ostype 映射覆盖所有版本

**其他修复**：
- fix(disk): 批量购买数量上限 10 + 每盘独立订单含磁盘名称
- fix(disk): DIR 存储卷名/格式冲突全面修复（4 个提交）
- fix(disk-import): 孤立磁盘清理逻辑 4 次迭代修复（含严重误删正常磁盘台账）
- fix(unbind): `qm unlink` busy 错误后自动重试一次
- fix(disk-ui): legacy 磁盘到期时间/剩余天数统一显示「随VM」
- fix(ui): 新购弹窗下拉框默认显示「请选择系统」
- fix(ui): 切换系统卡片增加选中高亮 + 暗模式适配

### Security
- 🔒 备份恢复数据盘白嫖漏洞修复（攻击路径：购买->挂载->备份->销毁退款->恢复白嫖）
- 🔒 销毁 VM 增加数据盘检查 + 错误信息脱敏
- 🔒 安全审计报告 V3 全量修复（19 项安全问题）

### Notes
- 数据库自动迁移：升级后首次启动自动创建新表和字段，无需手动执行 SQL
- OS 模板配置：需在 Admin 后台「系统模板」页面配置可切换的 OS 模板（关联 PVE 模板 VMID）
- 系统切换功能依赖 PVE `move_disk` API，确保 PVE 用户有对应存储的权限

## [2.32.3] - 2026-07-19

### ⚠️ 重要：本次升级必须使用手动更新

> 本次版本修复了面板「系统自动更新」功能的致命问题（git dubious ownership 导致自动更新返回 500）。由于修复代码本身包含在此版本中，旧版本的面板无法通过自动更新升级到 v2.32.3，**必须手动执行一次 git pull 完成本次升级**。升级后自动更新功能即可恢复正常工作。

**手动更新步骤**（SSH 进入项目目录执行）：

```bash
git fetch origin && git reset --hard origin/main && npm install --production && pm2 restart pve-panel
```

> 详细说明见 README.md「🔄 手动更新」章节。

### Fixed
- fix(update): **git dubious ownership 导致 fetch 失败**（自动更新 500 根因）
  - 三重保障：`git config --system --add safe.directory` + `git -c safe.directory=<path> fetch` + `git -c safe.directory=<path> reset --hard`
  - `--system` 失败时回退 `--global`，覆盖 PM2 运行用户与项目目录所有者不同的情况
- fix(update): 输出 git fetch 失败的详细错误日志（退出码 + stderr + stdout）
- fix(update): 自动更新失败返回具体错误信息而非通用「操作失败，请稍后重试」

## [2.32.2] - 2026-07-19

### Added
- feat(disk): 新增磁盘格式选择 + DIR 存储支持 + 不支持扩容格式警告
- feat(disk-ui): 磁盘操作 loading 动画，防止用户频繁点击
- feat(logger): 统一日志工具，所有控制台输出带时间戳和前缀

### Changed
- refactor(log): disk-utils.js 调试日志改用 `logger.debug`
- chore(log): disk-expiry-check 日志精简，日常只输出必要信息
- chore(disk-import): 调试日志改为 DEBUG 模式才输出

### Fixed
- fix(disk): DIR 存储卷名/格式冲突全面修复
  - DIR 存储卷名带扩展名 + 挂载不附加 `format=` 避免冲突
  - `createDisk` 从 `'successfully created'` 提取 DIR 存储 volume_id
  - `createDisk` DIR 存储 `pvesm alloc` 返回裸卷名时拼接子路径
  - `validateVolumeId` 兼容 DIR 存储子路径格式（`9999/vm-...`）
- fix(disk-import): 孤立磁盘清理逻辑修复（4 次迭代）
  - 改用 `pvesm list` 检查卷存在性 + 详细调试日志
  - 修复误删正常磁盘台账问题（严重）
  - 解析 `pvesm list` 表格格式提取 volume_id
- fix(disk-import): 修复孤立磁盘清理失效问题
- fix(disk-specs): INSERT 占位符多 1 个导致 Column count 不匹配
- fix(unbind): `qm unlink` 卸载逻辑修复
  - busy 错误时 guest 内磁盘已卸载，不阻塞到期分离
  - 改回 `qm unlink` + busy 错误不阻塞到期分离
  - busy 错误后自动重试一次 `qm unlink`
- fix(db): 价格精度迁移幂等化，避免每次启动重复打印迁移日志
- fix(pv-button): 透传 fallthrough 属性（`title`/`data-*`/`aria-*`）+ 简化 title 透传实现

### Notes
- 新增脏数据修复脚本 `scripts/fix-dir-volume-id.js`，修复之前 bug 留下的 DIR 存储 volume_id 缺子路径脏数据
  - 用法：`node scripts/fix-dir-volume-id.js` (dry-run) / `--apply` (实际修复)

## [2.32.1] - 2026-07-19

### Added
- feat(disk): 统一使用 SCSI 总线，支持热插拔挂载/卸载
- feat(admin): 存储分组支持拖拽排序 + 动效
- feat(admin): 数据盘表格增加多选 + 批量修改存储分组
- feat(disk-ui): 规格卡片统一字段占位 + 购买磁盘展示限速信息

### Changed
- refactor(disk): 价格精度统一为 2 位小数（`DECIMAL(10,4)` -> `DECIMAL(10,2)`，前端输入步长同步）

### Fixed
- fix(disk): 卸载改用 `qm unlink` 兼容 Windows VM，消除划线状态
- fix(ui): 移除挂载/卸载/扩容的关机提示，改为热插拔提示
- fix(vm): VM 换绑时同步更新 legacy 磁盘 `user_id`
- fix(disk): 存储分组排序全面修复
  - 购买弹窗按 `sort_order` 排序，新建分组自动分配 `sort_order`
  - `disk-options` 接口服务端排序 + 清除缓存
  - 数据库 SQL 明确 `ASC` + 服务端 `parseInt` 强转
  - 修复排序端点 ID 校验逻辑
- fix(storage-groups): 排序端点实现修复
  - 改用套餐分组一致的 `batchUpdateSortOrder` 模式
  - 修复 `db.execute` 调用方式
  - 改用 `db.storageGroups.update` 避免直接 SQL 权限问题
- fix(admin-disk): 路由顺序修复
  - 恢复丢失的 `PUT /storage-groups/:id` 路由
  - 彻底移除重复的 `/storage-groups/sort` 路由
- chore(ui): 同步更新 admin/dashboard 缓存版本号

## [2.32.0] - 2026-07-18

### Added
- feat(disk): 完整的数据盘管理系统
  - 用户端：购买/挂载/卸载/扩容/续费数据盘，支持 NVME/SATA/HDD/U2 规格
  - Admin 端：存储分组管理、硬盘规格管理（含 QoS 限速参数）
  - Admin 端：生命周期参数配置（预警/宽限期/保留期/自动续费）
  - Admin 端：数据盘列表查看/编辑/销毁，导入存量磁盘
  - Admin 端：数据盘编辑功能（修改名称、存储分组、规格）
- feat(legacy-disk): 存量磁盘导入与计费隔离
  - 导入磁盘标记为 `is_legacy`，随 VM 计费，不独立续费
  - VM 续费时自动同步 legacy 磁盘到期时间
  - VM 移除/销毁时自动删除 legacy 磁盘台账记录（PVE 磁盘保留）
  - 磁盘到期巡检跳过 legacy 磁盘
  - 导入前自动清理 PVE 中已不存在的孤立记录
  - 用户端 legacy 磁盘禁用独立操作（挂载/卸载/销毁/扩容/续费）
  - 后端所有操作端点增加 is_legacy 安全检查
- feat(disk-import): 导入时增加 loading 动画弹窗，完成后弹出结果详情

### Changed
- 新购磁盘名称限制从 8 字符放宽至 30 字符（适配 `imported-108-scsi1` 格式）
- 生命周期表单从表格布局改为网格布局，更清晰易用

### Fixed
- fix(disk-import): 修复 INSERT 列数与占位符不匹配导致的导入失败
- fix(admin-disk): 修复表格表头错位
- fix(disk-import): 孤立删除使用硬删除绕过 destroyed 状态检查
- fix(disk-import): 仅清理 legacy 磁盘，不清理用户购买的独立磁盘
- fix(disk-import): 清理仅限 bound/free 状态的 legacy 孤立记录
- fix(disk-import): 修复孤立磁盘检查命令语法错误
- fix(disk-import): 强化清理条件，需明确返回 "does not exist" 才清理
- fix(ui): 表格容器 overflow:hidden 裁剪 R 角溢出（admin.css / dashboard.css）
- fix(ui): 全面修复按钮间距 - 所有 modal-footer 加 gap-2 + 磁盘操作列加 .table-actions
- fix(ui): 登录页 2FA 验证/返回按钮加 gap-2 间距
- fix(ui): admin 硬盘设置卡片按钮加 gap-2（存储分组/规格/生命周期）
- fix(ui): 选中行高亮使用 box-shadow 适配表格 R 角
- fix(ui): 亮色/暗色模式选中行高亮分别适配

### Notes
- ⚠️ 重要：需在 PVE 上创建 VMID 9999 的中转虚拟机（详见 README.md 数据盘管理章节）
- 已导入的存量磁盘会自动迁移标记为 `is_legacy`，无需重新导入
- fix(vnc): 添加 Win 键按钮事件处理（此前按钮无响应）

## [2.30.1] - 2026-07-12

### Fixed
- fix(auth): 修复 token 自动刷新后立即被强制下线
  - `/auth/refresh` 端点先创建新 refresh token 记录再生成 access token，解决新旧 ID 错位问题
- fix(ui): 修复 `getExpiryColor is not a function` 模板渲染错误
  - 将函数定义移到 Vue `setup()` 之外，注册为 `app.config.globalProperties` 全局属性
- fix(dashboard): 主列表视图（VM/LXC 表格 + 移动端卡片）添加到期时间列
  - 显示日期 + 剩余天数 + 颜色标识（>7天绿、3-7天黄、<3天红）
  - 同时补充 Admin 端 VM/LXC 表格到期时间列

## [2.30.0] - 2026-07-11

### Added
- feat(ui): 到期时间始终显示剩余天数并按阈值着色
  - 新增 `getExpiryColor()` 函数：>7 天绿色、3~7 天黄色、<3 天红色
  - 所有到期时间展示点（续费弹窗、详情弹窗、CDK 下拉列表、资源列表）统一显示"剩余 X 天"
  - 覆盖 Dashboard 和 Admin 两端

### Fixed
- fix(dashboard): 总览 SVG 环形进度条从 3 点改为 12 点起始位置
- fix(dashboard): VM/LXC 编辑弹窗权限控制，普通用户仅可见名称和保存按钮
  - 隐藏"分配给、到期时间、续费价格、计费周期、MAC 分组、移除"等管理字段
  - 后端已有限制，前端同步增加 `v-if="user.role === 'admin'"` 双重防护
- fix(update): PM2 集群模式下自动更新使用 `pm2 reload` 滚动重启所有实例
  - 检测到 PM2 环境时，使用 `spawn` 分离子进程执行 `pm2 reload all`
  - 逐个替换 worker 实例，零停机，所有实例加载新代码
  - 非 PM2 环境保持原有 `process.exit(0)` 逻辑

## [2.29.1] - 2026-07-11

### Fixed
- fix(renew): 修复续费报错 `withTransaction is not defined`（500 错误）
  - `server/routes/wallet.js` 补全 `withTransaction` 导入，续费事务恢复正常
- fix(renew): 修复续费资源显示异常
  - 续费弹窗显示 VMID/CTID（如 `VM 108 (ID: 108)`），无名称资源也能正确辨识
  - 修复到期时间字段错误：`expire_time` → `expiration_date`
  - 所有续费入口统一调用 `openRenewModal()`，确保计费周期、数量等状态正确初始化

## [2.29.0] - 2026-07-09

### Security
- fix(security): 安全审计修复 - 密码哈希升级 + 密钥派生一致性 + TLS 开关 + 安全响应头
  - **密码哈希升级**：SHA256 -> bcryptjs（cost=12），兼容旧格式，登录时自动 lazy re-hash 升级，用户无感知
  - **密钥派生一致性修复**：`crypto-utils.js` 统一从 `token.js` 获取 JWT_SECRET，删除危险默认回退值，修复 JWT 签名与配置加密密钥不同步的 bug
  - **TLS 验证开关**：PVE 节点设置新增"TLS 严格证书验证"开关，控制 PVE API / VNC 代理 / SMTP 邮件三处 TLS 证书验证，默认关闭兼容自签证书
  - **支付回调参数污染修复**：`wallet.js` 回调参数从 query+body 合并改为按请求方法取单一来源
  - **安全响应头**：添加 HSTS / X-Content-Type-Options / Referrer-Policy / Permissions-Policy
  - **JWT 有效期缩短**：24h -> 2h，配合 Refresh Token（7天）自动续期，用户体验不受影响
  - **卫生清理**：删除 `server.js.bak` 备份文件，`.env.example` 占位符化

### Changed
- 新增依赖：`bcryptjs`（密码哈希）
- 新增配置键：`pve:strict_tls`、`smtp:strict_tls`

## [2.28.22] - 2026-07-09

### Added
- feat(settings): Redis 配置从 .env 迁移至面板站点设置
  - Redis 缓存配置现在在管理后台 > 系统设置 > 站点设置 中直接管理
  - 密码使用 AES-256-GCM 加密存储（复用 PVE 配置的加密体系，密钥从 JWT_SECRET 派生）
  - 保存后自动热重载 Redis 连接，无需重启服务
  - 支持"测试连接"功能：填完表单即可验证连通性，PING 通过后保存
  - 移除 .env.example 中的 REDIS_HOST/REDIS_PORT/REDIS_PASSWORD/REDIS_DB/REDIS_PREFIX 参数

### Changed
- server.js: 调整启动时序，Redis 初始化移至数据库就绪之后
- redis.js: 导出 resetClient() 支持配置热更新

## [2.28.21] - 2026-07-07

### Changed
- perf(redis): Redis 缓存层性能优化 + 修复 F-1 安全规则违规
  - **修复 F-1 违规**：`cache-store.js` TTL jitter 从 `Math.random()` 改为 `crypto.randomBytes(2)`（项目规范要求所有随机值使用 crypto.randomBytes）
  - **限速器原子化**：`rate-limiter.js` 将 INCR + EXPIRE 两个命令合并为 Lua 脚本原子执行，修复竞态条件下 TTL 可能丢失导致限速失效的问题
  - **SCAN+DEL 优化**：`cache-store.js` 的 `scanDel` 从单次 DEL 改为 pipeline 批量 DEL，减少 N 次 RTT 到 1 次
  - **JSON 序列化优化**：提取 `shouldSerialize`/`serialize`/`deserialize` 纯函数，字符串值跳过 JSON.parse/stringify，数字/对象才走 JSON 路径
  - **连接保活**：`redis.js` 新增 `keepAlive: 30000`（30s PING）、`noDelay: true`（禁用 Nagle 算法降低延迟）、`offlineQueueMaxItems: 1000`（离线队列上限）
  - **纯函数提取**：将 `computeJitteredTtl`/`shouldSerialize`/`serialize`/`deserialize`/`stripPrefix` 导出为可测试纯函数
  - **SCAN COUNT 提升**：从 100 提升到 200，减少大key 清理时的迭代次数
  - TDD：17/17 redis-optimization 测试通过，无回归

## [2.28.20] - 2026-07-06

### Reverted
- revert(vnc): 回滚 VNC 剪贴板功能（v2.28.18 + v2.28.19）
  - 撤销 v2.28.18 引入的 noVNC `clipboard` 事件监听方案（QEMU VNC 默认不推送 ServerCutText，VM→浏览器方向不生效）
  - 撤销 v2.28.19 引入的后端中转 API 方案（QEMU Guest Agent guest-exec + PowerShell 读写剪贴板）
  - 删除新增文件：`public/js/vnc-clipboard.js`、`server/utils/vm-clipboard.js`、对应测试文件
  - 恢复 `views/pages/vnc.ejs`、`server/api/pve-api.js`、`server/routes/vm.js` 到 v2.28.17 状态
  - VNC 控制台回到无剪贴板快捷键的原始状态（终端模块的复制粘贴功能不受影响）

## [2.28.19] - 2026-07-06

### Changed
- refactor(vnc): 重写 VNC 剪贴板功能改用后端中转 API
  - 问题：v2.28.18 监听 noVNC `clipboard` 事件被动接收 VM 剪贴板文本，但 QEMU VNC 默认不监听 guest 剪贴板变化，也不主动推送 ServerCutText 事件，导致 VM → 浏览器方向不生效
  - 方案：通过 PVE QEMU Guest Agent (QMP `guest-exec`) 在 Windows guest 内执行 PowerShell `Get-Clipboard` / `Set-Clipboard` 读写剪贴板，绕过 QEMU VNC 限制
  - 新增 `server/utils/vm-clipboard.js` 纯函数模块（命令注入防护：文本经 stdin 传递，base64 编码，不拼入命令行参数）
  - 在 `server/api/pve-api.js` 新增 `guestExec` / `guestExecStatus` / `guestExecAndWait` 三个 QMP 方法
  - 在 `server/routes/vm.js` 新增 `GET /api/vm/:vmid/clipboard`（VM→浏览器）和 `POST /api/vm/:vmid/clipboard`（浏览器→VM）端点
  - 端点包含：vmid 范围校验、资源归属校验（参考 VNC 路由权限模式）、运行状态检查、限速（10 次/分钟/用户）、文本 64KB 上限
  - 前端 `public/js/vnc-clipboard.js` 改为通过 `fetch` 调用后端 API，移除 `createClipboardState` 和 `handleVncClipboardEvent`
  - `views/pages/vnc.ejs` 移除 noVNC `clipboard` 事件监听和 `clipboardState`，全局 keydown 改传 `vmid`
  - 仅支持 Windows VM，需 guest 已安装 QEMU Guest Agent 并启用剪贴板支持
  - TDD：16/16 vnc-clipboard 测试通过 + 18/18 vm-clipboard-api 测试通过

## [2.28.18] - 2026-07-06

### Added
- feat(vnc): 为 VNC 控制台启用双向剪贴板复制粘贴功能
  - 新增 `public/js/vnc-clipboard.js` UMD 模块（TDD：15/15 测试通过）
  - VM → 浏览器：监听 noVNC `clipboard` 事件被动缓存 VM 剪贴板文本，用户按 `Ctrl+Shift+C` / `Ctrl+Insert` 时写入 `navigator.clipboard`
  - 浏览器 → VM：用户按 `Ctrl+Shift+V` / `Shift+Insert` 时从 `navigator.clipboard` 读取并调用 `rfb.clipboardPasteFrom(text)`
  - 快捷键与终端模块保持一致（Ctrl+Shift+C/Ctrl+Insert 复制，Ctrl+Shift+V/Shift+Insert 粘贴）
  - 添加"剪贴板 ?"提示按钮，点击显示快捷键说明 modal（支持 ESC/遮罩点击关闭）
  - 仅支持 HTTPS 环境（与终端模块一致），HTTP 环境下按键无操作不报错
  - 不支持文件复制粘贴，仅支持纯文本

## [2.28.17] - 2026-07-06

### Fixed
- fix(terminal): 修复 Ctrl+Shift+C 无选中时意外发送 SIGINT 的问题
  - 问题：Ctrl+Shift+C 是复制快捷键，不应等于 Ctrl+C。原实现无选中时返回 `true` 透传给 xterm 默认处理，xterm 会将 Ctrl+Shift+C 当作 Ctrl+C 发送 `\x03` SIGINT，导致意外中断当前命令
  - 修复：无选中时返回 `false` 并调用 `e.preventDefault()`，阻止 xterm 默认行为。用户如需中断命令应使用 Ctrl+C
  - 同步更新快捷键说明文案："复制选中文本（无选中时无操作）"

### Tests
- test: 更新 3 个测试用例（2 个 keyboard + 1 个 help）匹配新行为

## [2.28.16] - 2026-07-06

### Security
- security(console): 修复 VNC/终端连接 URL 信息泄露问题
  - 问题：VNC URL 暴露 `node`、`port`、`ticket`、`vmid`、`userId`，终端 URL 暴露 `vmid`、JWT `token`，敏感凭证会出现在浏览器历史、服务器日志、Referer 头中
  - 修复：用不透明的 64 字符 hex session ID 替代所有 URL 中的敏感参数，session 数据存服务端（Redis + 内存回退，5分钟 TTL，单次性消费）
  - 新增 `server/utils/console-session.js` 模块（createSession/getSession/consumeSession/deleteSession）
  - QEMU VNC ticket 通过 EJS locals 注入（noVNC RFB 认证需要），不再出现在 URL 中
  - WebSocket 代理（vnc-proxy/terminal-proxy）改用 `consumeSession` 获取连接参数，移除旧 `registerTicket`/`validateTicket` 和 `jwt.verify` 逻辑
  - Session 单次性：WebSocket 连接后立即删除 session，防止重放攻击

### Removed
- 删除 legacy 静态文件 `public/vnc.html` 和 `public/terminal.html`（已被 EJS 模板替代，无法接收服务端注入的 session 数据）

### Tests
- test: `test/console-session.test.js` 7 个测试用例覆盖 session 创建、获取、消费、删除、单次性

## [2.28.15] - 2026-07-06

### Added
- feat(terminal): 网页终端新增快捷键提示和使用说明
  - 状态栏右侧新增"快捷键 ?"按钮，点击弹出说明 modal
  - 说明 modal 列出所有快捷键：复制（Ctrl+Insert / Ctrl+Shift+C）、粘贴（Shift+Insert / Ctrl+Shift+V）、透传（Ctrl+A / Ctrl+C / Ctrl+E）
  - 说明 Ctrl+Shift+C 无选中时透传 SIGINT 中断当前命令
  - 提示复制需先选中文本、粘贴需 HTTPS 环境支持剪贴板 API
  - 新增 `public/js/terminal-shortcuts-help.js` UMD 模块（导出 `getShortcutsHelpHTML()` 便于测试）

### UX
- modal 支持点击关闭按钮、点击遮罩区域、按 ESC 三种方式关闭
- 关闭后自动聚焦回终端，不影响后续输入

### Tests
- test: 新增 `test/terminal-shortcuts-help.test.js`，8 个测试用例覆盖说明内容完整性、HTML 结构、安全性（无 script 标签）

## [2.28.14] - 2026-07-06

### Fixed
- fix(terminal): 修复 Ctrl+Shift+V / Shift+Insert 粘贴时双重粘贴的问题
  - 问题：`attachCustomKeyEventHandler` 返回 `false` 只阻止 xterm 默认处理，不阻止浏览器原生粘贴。浏览器原生粘贴会写入 xterm 隐藏 textarea（触发 onData → ws.send），同时我们又调用 `term.paste(text)`，导致 "test" 变成 "testtest"
  - 修复：在所有自定义处理的分支（复制和粘贴）中调用 `e.preventDefault()` 阻止浏览器默认行为，确保只执行我们的 `clipboard.readText/writeText` 逻辑

### Tests
- test: 新增 8 个测试用例覆盖 preventDefault 调用（5 个应调用 + 3 个不应调用）

## [2.28.13] - 2026-07-06

### Added
- feat(terminal): 网页终端快捷键捕获（复制/粘贴/透传）
  - `Ctrl+Insert` / `Ctrl+Shift+C` 复制选中文本到剪贴板（`Ctrl+Shift+C` 无选中时透传 `\x03` SIGINT，保留中断命令能力）
  - `Shift+Insert` / `Ctrl+Shift+V` 从剪贴板粘贴到终端
  - `Ctrl+A` / `Ctrl+C` / `Ctrl+E` 等其他快捷键透传给 shell（xterm 默认行为）
  - 新增 `public/js/terminal-keyboard.js` UMD 纯函数模块（导出 `handleTerminalKeydown(e, term, clipboard)`，便于 Node 环境 require 测试）
  - 非 HTTPS 环境下 `navigator.clipboard` 为 undefined 时静默降级，终端仍可正常使用

### Changed
- refactor(terminal): 移除 `views/pages/terminal.ejs` 内联脚本，统一引用外部 JS
  - 消除 `terminal.ejs` 与 `terminal-standalone.js` 的冗余内联脚本（符合"CSS/JS 必须拆分到外部文件"原则）
  - 移除未使用的 `xterm-addon-web-links` 依赖
  - 添加缓存参数 `?_b=202607061700` 确保浏览器加载最新版本

### Tests
- test: 新增 `test/terminal-shortcuts.test.js`，10 个测试用例（12 个断言）覆盖所有快捷键场景

## [2.28.12] - 2026-07-02

### Fixed
- fix(dashboard): 修复重置密码长度错误提示没有弹窗的问题
  - VM 重置密码：密码长度不足 6 位时改用 `alert()` 弹窗提示（支持动态层级），而非只设置内联错误（按钮 disabled 导致用户无法触发提交）
  - LXC 重置密码：密码长度不足 6 位和两次密码不一致时改用 `alert()` 弹窗提示（模板中缺少 `lxcPasswordError` 显示位置导致错误不可见）

- fix(dashboard): 修复多处按钮、表单未适配明暗模式的问题
  - deviceForwardModal 移除硬编码深色背景 `#1a1a2e` 和文字颜色 `#e0e0e0`，改用 CSS 变量 `var(--bg-modal)` 和 `var(--text-primary)`
  - deviceForwardModal header 边框移除硬编码 `rgba(255,255,255,0.1)`，改用 `var(--border-color)`
  - deviceForwardModal 表格移除 `table-dark` 类（亮色模式下不适配）
  - customAlertModal 确定按钮从原生 `<button class="btn btn-primary">` 改为 `<pv-button variant="primary">`
  - customConfirmModal 取消/确定按钮从原生 `<button class="btn btn-outline-light/btn-primary">` 改为 `<pv-button variant="outline/primary">`
  - VM/LXC 操作确认弹窗按钮从原生 `<button class="table-btn/modal-close">` 改为 `<pv-button variant="danger/outline/close">`
  - VM/CT 详情监控弹窗关闭按钮从原生 `<button class="modal-close">` 改为 `<pv-button variant="close">`

### Tests
- test: 新增 `test/dashboard-password-alert-theme.test.js`，10 个测试覆盖 3 个 bug 的修复

## [2.28.11] - 2026-07-02

### Fixed
- fix(db): 移除端口转发 general 自动迁移代码，修复启动报错 "query is not defined"
  - 该迁移代码引用了未定义的 `query` 函数（应为 `execute` 或 `pool.query`），导致每次启动都报错
  - 不再自动迁移孤立端口转发规则（vm_id 和 ct_id 均为 NULL 的 vm/lxc 类型规则）
  - 管理员可在端口转发管理界面手动修改类型（v2.28.9 已支持编辑 type 字段）

## [2.28.10] - 2026-07-02

### Fixed
- fix(port-forward): 修复编辑/删除端口后列表页码跳转第一页的问题
  - 问题：`loadForwardRules` 函数中 `$.forwardPage.value = 1` 强制重置页码，导致编辑/删除后无论当前在第几页都跳回第一页
  - 修复：移除强制重置页码逻辑，改为在数据加载后修正页码（当前页超过新的总页数时回到最后一页，避免删除后停留在空页）

- fix(ui): 修复多选框与表头未对齐的问题（影响所有含多选的列表）
  - 根因：`components.css` 中 `thead th` 的 padding 为 `14px 18px !important`，而 `td` 的 padding 为 `11px 16px`，左右各差 2px，导致表头的 checkbox 比单元格的 checkbox 偏右 2px
  - 修复：新增 `.checkbox-col` CSS 类，统一 th/td 的 padding 为 `12px`，设置 `text-align: center` 让 checkbox 居中对齐
  - 应用到端口转发列表（port-forward-list）的 th/td 和 CDK 列表的 th/td

### Tests
- test: 新增 `test/port-forward-page-checkbox-align.test.js`，7 个测试覆盖 2 个 bug 的修复

## [2.28.9] - 2026-07-02

### Fixed
- fix(port-forward): 修复编辑/删除端口后列表消失 + 编辑未保存的 bug
  - **Bug 1**：`submitForward` 使用 `$.forwardForm.type`（表单类型）作为 `loadForwardRules` 的刷新参数，导致筛选为"全部"或"LXC"时编辑 VM 规则后列表只显示 VM 规则，其他规则"消失"
    - 修复：改用 `$.forwardFilterType.value`（当前筛选器类型）刷新列表
  - **Bug 2**：`deleteForward` 使用 `$.activeTabVm.value === 'network' ? 'vm' : 'lxc'`（与端口转发无关的 VM 标签页变量）推断刷新类型，导致删除后列表显示错误类型
    - 修复：改用 `$.forwardFilterType.value` 刷新列表
  - **Bug 3**：`batchDeleteForwards` 同样使用 `activeTabVm` 推断类型，批量删除后列表消失
    - 修复：改用 `$.forwardFilterType.value` 刷新列表
  - **Bug 4**：PUT `/port-forwards/:id` 端点解构只提取 `name/ip/internal_port/external_port/protocol` 5 个字段，完全忽略 `type/vm_id/ct_id`，导致管理员在编辑弹窗切换类型（如 VM→LXC）后保存，数据库 type 字段保持原值，编辑"未保存"
    - 修复：解构增加 `type/vm_id/ct_id`，新增类型变更校验（type 必须为 vm/lxc/general 之一，VM 类型必须有 vm_id，LXC 类型必须有 ct_id）
    - 类型切换时互斥清空设备 ID（vm→lxc 时 vm_id 置 null，ct_id 设为新值；反之亦然）
    - ikuai 同步 comment 改用 `effectiveType`（新类型）而非 `existing.type`（旧类型），确保类型切换后 comment 正确
    - 类型/设备 ID 变更也触发 ikuai 重新同步（comment 变化需重建规则）

### Tests
- test(port-forward): 新增 `test/port-forward-edit-delete-list.test.js`，8 个测试覆盖 4 个 bug 的修复
- test(port-forward): 更新 `test/port-forward-general-type.test.js`，PUT 端点 comment 测试改用 `effectiveType` 匹配

## [2.28.8] - 2026-07-02

### Fixed
- fix(modal): 修复弹窗叠加时后弹出的仍被遮挡的真正根因
  - 问题：`admin/core.js` 的 `window.alert` 覆盖了 `shared.js` 的 `setupCustomAlert`，但未调用 `window.applyModalZIndex(el)`，直接 `bootstrap.Modal.getOrCreateInstance(el).show()` 导致 alert 弹窗 z-index 为空，叠加时被前一个弹窗遮挡
  - 同步修复 `window.customConfirm`（缺少 backdrop z-index 设置）和 `window.customPrompt`（backdrop 用 `querySelector` 取第一个，多弹窗时会错）
  - 统一改用 `window.applyModalZIndex(el)` 封装 acquire + backdrop + release 完整生命周期
  - 移除 `bsModalShow`/`bsModalHide`/`setupCustomAlert`/`setupCustomConfirm` 中"删除所有 .modal-backdrop"的逻辑（会误删其他仍开着弹窗的遮罩层）
  - `shown.bs.modal` 事件改用 `querySelectorAll('.modal-backdrop')` 取最后一个（当前弹窗的 backdrop），而非 `querySelector` 取第一个
  - `bsModalHide` 仅当 `ModalZIndexManager.getActiveCount() === 0` 时才清理 body 状态
  - 影响：shared.js、admin/core.js、dashboard/core.js、user-center-page.js 共 12 处修改
  - 实测验证：forwardModal(1060) + alert(1070) + customConfirm(1080) 叠加正确，backdrop 各自保留

### Changed
- refactor(port-forward): 管理员不再受系统配置的端口范围限制
  - POST `/port-forwards`：端口范围校验和数量限制包裹在 `if (req.user.role !== 'admin')` 内
  - PUT `/port-forwards/:id`：端口范围校验包裹在 `if (req.user.role !== 'admin')` 内
  - GET `/port-forwards/random-port`：管理员使用 1-65535 全范围随机，普通用户使用配置范围
  - 前端 `submitForward`：管理员跳过端口范围校验
  - forwardModal 提示文案：管理员显示"1-65535（管理员不限）"，普通用户显示配置范围
  - 注释明确区分两层校验：1-65535 为端口物理范围（全员生效），port_range_start-end 为业务范围（仅普通用户）

### Security
- security(port-forward): GET `/port-forwards/random-port` 补速率限制（SEC-02）
  - 该端点调用 ikuaiApi.getPortForwards() 获取已用端口，属代理外部 API 端点
  - 新增 `checkRateLimit('ratelimit:random-port:' + req.user.id, 30, 60*1000)`，每用户 30 次/分钟
  - 超限返回 429 "查询过于频繁，请稍后再试"

## [2.28.7] - 2026-07-02

### Added
- feat(port-forward): 端口转发新增「通用」类型，管理员无需绑定 VM/LXC 即可创建转发规则
  - 新增 `type='general'` 类型白名单，vm_id/ct_id 强制为 null
  - 前端筛选下拉新增「通用」选项，类型徽章新增「通用」灰色徽标（bg-secondary）
  - forwardModal 新增「类型」单选按钮组（VM/LXC/通用，仅管理员可见）
  - 通用类型隐藏设备下拉，显示提示「通用类型无需绑定 VM/LXC」

### Fixed
- fix(port-forward): 修复 LXC 规则 ikuai comment 错写 `_VM${vm_id}` 的旧 bug（vm_id 为 null 时 comment 变成 `_VMnull` 导致同步反查失败）
  - 改为根据 type 区分：`_GENERAL` / `_CT${ct_id}` / `_VM${vm_id}`

### Changed
- refactor(port-forward): 历史孤立规则自动迁移为 general 类型
  - 启动时执行 `UPDATE port_forwards SET type='general' WHERE type IN ('vm','lxc') AND vm_id IS NULL AND ct_id IS NULL`（幂等）
  - ikuai 同步导入孤立规则时 `type` 从 `'vm'` 改为 `'general'`
  - openAddForward 管理员默认类型改为 general，普通用户仍为 vm

## [2.28.6] - 2026-07-02

### Fixed
- fix(modal): 统一所有弹窗走动态 z-index 管理，确保后弹出的弹窗始终在之前弹窗之上
  - 问题：8 处弹窗未走 `ModalZIndexManager`，直接 `bootstrap.Modal.show()` 使用浏览器默认 z-index，叠加时后弹出的弹窗可能被先弹出的弹窗遮挡
  - 影响范围：
    - `shared.js` setupCustomAlert（window.alert）/ setupCustomConfirm（window.customConfirm）
    - `dashboard/core.js` window.alert / $.showAlertAndWait
    - `admin/core.js` $.showAlertAndWait
    - `user-center-page.js` window.alert / rechargeResultModal / rechargePendingModal
  - 修复：新增 `window.applyModalZIndex(el)` 公共 helper 封装 acquire + backdrop + release 完整逻辑，8 处弹窗统一复用
  - 新增 TDD 测试：`test/modal-z-index-dynamic.test.js`（17 个用例，覆盖存在性、8 处弹窗调用点、3 处 bsModalShow 一致性、硬编码 z-index 禁止规则）

## [2.28.5] - 2026-07-02

### Fixed
- fix(admin): 修复端口转发筛选下拉切换报错 `Cannot read properties of undefined (reading 'value')`
  - 根因：`admin.ejs` 中 `network.js` 引用未带缓存参数 `?_b=`，浏览器使用旧版缓存，旧版 `network.js` 中未定义 `$.forwardFilterType = ref('all')`，导致 `filterForward` 方法访问 `$.forwardFilterType.value` 时 `undefined`
  - 修复：给 `network.js` 引用添加 `?_b=202607020700`，并更新 `admin-page.js` 缓存参数到 `?_b=202607020800`
  - 增强：`port-forward-list` 组件的 `filterForward` 方法增加防御性兜底（`$.forwardFilterType` 不存在时回退为 `'all'`），避免类似缓存问题再次发生时直接崩溃

## [2.28.4] - 2026-07-02

### Changed
- refactor(admin): 统一端口转发入口到侧边栏一级标签
  - 移除 VM 管理 → 端口转发子标签（`vms-network` 菜单项）
  - 移除 LXC 容器管理 → 端口转发子标签（`lxc-network` 菜单项）
  - 移除系统设置 → 网络管理内的「所有端口转发」列表卡片
  - 新增侧边栏一级标签「端口转发管理」（位于 LXC 容器管理 与 后台管理 之间）
  - 新增 `public/js/admin/admin-template-port-forward.js` 模板片段（IIFE push 模式）
  - 合并 `vm-port-forward-list` / `lxc-port-forward-list` 为单一 `port-forward-list` 组件，新增类型筛选下拉（全部/VM/LXC）、类型列（VM/LXC 徽章）、统一分页和用户配额提示
  - `core.js` 调整：onMounted/watch(activeSection) 切换到 port-forward 时加载规则；移除 watch(activeTabVm/activeTabLxc) 的 network 分支；switchSubsection 移除 network 分支
  - `network.js` 新增 `$.forwardFilterType = ref('all')` 状态
  - 所有按钮（添加/批量删除/编辑/删除）统一使用 `pv-button` 组件
  - 新增 TDD 测试：`test/unify-port-forward-and-backup-modal.test.js`（30 个用例）

### Fixed
- fix(dashboard): 备份弹窗显示备份限制信息
  - `backupModal` / `lxcBackupModal` 顶部新增「备份限制信息」卡片，展示当前备份数 / 上限、今日创建数 / 日上限
  - 达到上限时显示 `alert-warning` 警告条，数值标红（`text-danger`）
  - 数据源：`$.backupLimits` / `$.lxcBackupLimits`（API 已返回，原未展示）
- fix(dashboard): 移除备份弹窗中暴露给用户的存储位置选项
  - 移除 `backupModal` 的存储位置下拉（`v-model="backupForm.storage"`）
  - 移除 `lxcBackupModal` 的存储位置下拉（`v-model="lxcBackupForm.storage"`）
  - 移除 `editVmModal` 中无效的 `backup_storage` 下拉
  - 移除 `dashboard/core.js` 中未使用的 `$.storageList = ref([])` 定义（原定义后从未赋值，导致下拉永远为空）

## [2.28.3] - 2026-07-02

### Fixed
- fix(admin): 修复子标签切换不加载内容和刷新丢失子标签的问题
  - CT 端口转发切换到 VM 端口转发时内容不加载：`switchSubsection` 切换到 network tab 时显式调用 `loadForwardRules`，补充 `watch(activeTabVm/activeTabLxc)` 的 network 触发逻辑，`onMounted` 中补充刷新后停留在 VM/LXC 端口转发页面的数据加载
  - 刷新丢失子标签：`activeTabVm`/`activeTabLxc`/`activeTabTemplates` 添加 localStorage 持久化（读取恢复 + watch 写入），与 `activeTab`/`activeTabPackages` 保持一致
  - 检查其他子标签：dashboard 的 `activeTabVm`/`activeTabLxc` 未被模板使用（遗留代码），无需修复；user-center 使用 hash 路由已正确恢复
  - 新增 TDD 测试：`test/admin-tab-persistence.test.js`（7 个用例）
- fix(admin): 修复端口转发编辑按钮无效并统一按钮样式为 pv-button
  - `editForward` 缺少 `bsModalShow('forwardModal')` 调用导致编辑弹窗不显示
  - `editForward` 缺少设备列表加载导致下拉框为空，补充 `extract-ips` 加载并按 `rule.type` 过滤
  - 所有按钮（添加/批量删除/编辑/删除）统一使用 `pv-button` 组件替代原生 `button`，与全站样式保持一致
  - 新增 TDD 测试：`test/admin-port-forward-edit.test.js`（14 个用例）

## [2.28.2] - 2026-07-02

### Fixed
- fix(ikuai): 修复会话长时间未使用过期后 API 调用失败不自动恢复的问题
  - SDK `login()` 开头清空旧 cookie 和 loggedIn 状态，防止过期会话干扰新登录
  - `#fetch` 同名 cookie 替换为新值（原逻辑跳过导致新 session 无法覆盖旧 session）
  - 新增 `logout()` 方法清空会话状态
  - `_call` 重试前先 `logout()` 再 `login()`，确保干净重连
  - `_call` 检测 `Result=10014` 主动触发重登重试
  - `getMacGroups/addMacToGroup/removeMacFromGroup` 改走 `_call` 统一重试逻辑
- fix(auth): 修复 otplib.verifySync 调用方式错误导致 2FA 启用/验证崩溃
  - 新版 otplib 无 `authenticator` 子对象，`verifySync` 直接在顶层导出
  - 审计时误改为 `otplib.authenticator.verifySync` 导致 `undefined` 报错
  - 改回 `otplib.verifySync({ token, secret }).valid` 正确调用

## [2.28.1] - 2026-06-25

### Fixed
- fix(security): Math.random 替换为 crypto.randomInt/randomBytes（CDK 生成、随机端口、批次ID、DHCP 分配）
- fix(security): 抽取 sanitizeUser 公共函数统一剔除 password/totp_secret/recovery_codes/api_key 等敏感字段，消除 14+ 文件重复解构
- fix(security): 修复 otplib.verifySync → otplib.authenticator.verifySync（auth.js / user.js）
- fix(security): /auth/refresh 添加 30次/分钟 速率限制
- fix(security): 前端 pv-table/pv-modal/pv-card 添加 escapeHtml 防 XSS
- fix(security): VNC 页面 innerHTML 改为 createElement + textContent
- fix(arch): async 路由添加 try-catch 防止 unhandledRejection（vm.js / lxc.js）
- fix(arch): 空 catch 块补充 console.error 避免静默吞错
- fix(perf): 修复 backup-polling 中 async filter 永远返回 truthy 的 bug
- fix(perf): 修复 WebSocket statusCache key 不一致（存储无 userId，读取有 userId）导致缓存永远 miss
- fix(perf): 修复 N+1 查询（vm/lxc/network/expiry-check 预加载 userMap）

### Changed
- refactor(arch): 新增 withTransaction 事务封装用于订购/续费/退款/删除用户级联操作
- refactor(arch): 新增 safeError/formatLocalDate 公共函数消除重复定义
- refactor(arch): 添加 process 级 unhandledRejection/uncaughtException 处理
- refactor(perf): 新增 16 个数据库索引（safeAddIndex 幂等创建）
- refactor(perf): PVE API 添加 withRetry 重试（ECONNRESET/502/503/504 指数退避）+ axios 连接池
- refactor(perf): cache-store 添加 null 缓存防穿透 + TTL ±10% 随机偏移防雪崩
- refactor(perf): WebSocket 连接数上限（MAX_CONNECTIONS=1000, MAX_PER_IP=20）+ statusCacheGlobal 上限 10000
- refactor(perf): 终端代理添加 30 分钟空闲超时检测
- refactor(perf): 定时任务添加 Redis 分布式锁（SETNX）确保多实例单实例执行
- refactor(db): MySQL 连接池配置读取环境变量（MYSQL_CONNECTION_LIMIT/MYSQL_QUEUE_LIMIT 等）
- refactor(deploy): 静态资源缓存策略优化（HTML no-cache，JS/CSS max-age=3600）
- refactor(deploy): .env.example 补全 DEFAULT_ADMIN_PASSWORD/ALLOWED_ORIGINS/TZ

### Added
- feat(ops): 添加 /health 健康检查端点（返回 status/version/timestamp）

## [2.28.0] - 2026-06-25

### Added
- feat(package): 开通失败退款通知与订单号统一
  - 下单即生成订单(pending)与扣款流水（含 balance_before/after），开通成功标记 completed，失败退款+退款流水+站内信
  - 新增 `generateOrderNo` 统一订单号生成：VM(KTVM)/LXC(KTLXC)/退款(TK)/支付宝(ZFB)/微信(WX)/系统充值(SYSPAY) 前缀+时间+8位随机数字（使用 crypto.randomBytes）
  - 开通失败站内信通知（标题"虚拟机/容器开通失败"，告知退款金额与订单号）
  - 崩溃恢复任务补充退款流水与开通失败站内信
- feat(finance): 前端交易记录新增"订单退款"徽标(bg-warning)与退款支付方式展示（余额退款/支付宝退款/微信退款）

### Changed
- refactor(order): 充值订单号统一改用 ZFB/WX/SYSPAY 前缀，订单状态查询正则同步适配
- refactor(order): 管理员订购订单号改用 generateOrderNo('vm'/'lxc')
- refactor(utils): deductBalance 返回 balanceBefore/balanceAfter 供流水记录

## [2.27.0] - 2026-06-24

### Fixed
- fix(security): 移除前端 pve_upid 暴露，改用 resourceId 查询开通状态
  - PVE UPID 含宿主机节点名、PVE 认证用户等敏感信息，此前通过 API 响应和 URL 查询参数暴露给前端
  - `/provision-status` 改为接受 resourceId+type 参数，后端内部用 pve_upid 查 PVE
  - `/user/vms` 和 `/user/lxc` 剔除 pve_upid 字段，返回 _provisioning 布尔标记
  - 前端轮询改用 resourceId，移除 UPID_REGEX

## [2.26.3] - 2026-06-24

### Fixed
- fix(security): 修复UPID正则表达式pid字段匹配问题，PVE的pid字段为十六进制格式(含大写A-F)，原\d+仅匹配纯数字导致含字母的pid(如0035A3D4)被拒绝(400)；同时修正user字段后可跟空comment段(以:结尾)的匹配

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
