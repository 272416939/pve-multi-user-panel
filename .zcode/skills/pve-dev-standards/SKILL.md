---
name: pve-dev-standards
description: >
  PVE 管理面板（pve-multi-user-panel）的开发规范，覆盖新增功能、按钮、弹窗、页面、接口、数据库、缓存、模块架构（低耦合高内聚）、侧边栏状态保持、SSH/PVE 操作及 Git 提交流程的强制清单。
  当用户要求为该项目"新增功能/按钮/弹窗/页面/接口/字段/路由"，或提到"添加 X 模块""加个弹窗""新建页面""新开一个设置项""重构""拆分模块""模块化""按项目规范开发"等表述时触发——避免新增功能和后续开发重复踩坑。
  安全相关的认证授权/XSS/注入等细节请同时参考 security-checklist 和 pve-security-guard 两份安全技能。
---

# PVE 管理面板开发规范

本技能沉淀自本项目多个历史开发会话的真实踩坑记录（Dashboard 状态栏残留、备份恢复数据盘孤立漏洞、Admin 磁盘管理、订单号统一与邮件通知、自选系统优化、后台多项 Bug、db-mysql.js 高耦合拆分、仪表板日志功能、登录时间时区错误、MySQL 初始化失败、UApiPro 集成、侧边栏刷新状态保持）。新增任何功能、按钮、弹窗、页面、接口、字段时，在动手前与收尾时各过检一遍，防止已知问题重复发生。

## 一、动手前：先理清涉及面，再写代码

新增功能几乎从不只改一个文件。开工前用 `grep -rn` 全局搜索相关关键字（如新字段名、新 section 名、新路由路径），把以下六层涉及的改动点一次性列全，避免遗漏联动修改：

1. **后端路由** — `server/routes/*.js`（新端点）
2. **服务层/工具层** — `server/services/*.js`、`server/utils/*.js`（业务逻辑、SSH/PVE 操作、第三方外部调用）
3. **数据库** — 已按业务域拆分（原 `db-mysql.js` 已删除）：建表/迁移/默认配置在 `server/api/db-schema.js` 的 `initDb()`；连接池与时间工具在 `server/api/db-core.js`；业务数据函数在对应域文件 `server/api/db-<domain>.js`（users/vms/orders/disks/backup/network/messaging/config/billing）；聚合入口 `server/api/db.js` 只做组装
4. **前端页面 JS** — `public/js/admin/*.js`、`public/js/dashboard/*.js`、`public/js/user-center-*.js`
5. **前端模板/EJS** — `views/pages/*.ejs`（script 引入）、`views/partials/*.ejs`（侧边栏菜单）
6. **缓存版本号** — `public/cache-version.json`

## 二、前端缓存版本（最高频踩坑）

**凡修改了 `public/js/`、`public/css/`、`views/` 下的任何 JS/CSS/EJS 文件，必须更新 `public/cache-version.json` 的 `v` 值（+1）**，并确保相关 `.ejs` 中引用处带 `?cv=<%= locals.cacheVersion %>`。

- 否则出现"模版改了但页面没变"的假性 bug（曾致 table 表头错位、新增弹窗不显示）。
- 用 `update-cache-version` 技能执行，仅改 v 值，不动 JS/CSS/EJS 逻辑本身。
- 若某个脚本是静态引用（不带 `?cv=`），也要同步检查是否为遗留遗漏。

## 三、新增「页面」的完整清单

以「后台新增一个子页面」为例（新增到用户中心/Dashboard 同理按对应侧边栏处理）：

1. **新建页面 JS** — 在 `public/js/admin/` 下新建 `admin-template-<name>.js`，遵循现有约定：
   - IIFE 包裹，`(function () { ... })()`
   - 模板用 `if (!window.__adminTemplateParts) window.__adminTemplateParts = []; window.__adminTemplateParts.push(\`...\`)`
   - 页面区块用 `v-if="activeSection === '<section-name>'"` 条件渲染
2. **路由映射** — 在 `public/js/admin/core.js` 的 section 分支里按现有 `switchSection` / 路由分支样式增加 `<section-name>` 映射与数据加载
3. **引入 JS** — 在 `views/pages/admin.ejs` 的 `<script>` 列表追加该文件（带 `?cv=`）
4. **侧边栏菜单** — 在 `views/partials/sidebar-admin.ejs` 添加菜单项（含 `has-children` + `data-submenu` + `#submenu-<id>` 结构）；保存后**记住核心关联**：
   - **section 名必须与菜单 DOM id / subsection 映射一致**（如 `templates-os`→`#submenu-templates`）。若不一致，点击路径 OK 但**刷新后父菜单不展开**、`toggleSubmenu` 找不到元素报错。
   - 若新增的是需要刷新后保持展开的子菜单，在 `core.js` 的 `expandSections` 白名单里补上 `<section-name>`，并确保点击路径与刷新路径复用同一加载函数。
   - **刷新后的选中/展开/子标签状态保持，统一按第四节模式实现，禁止自创方案。**
5. **后端 API** — `server/routes/*.js` 新增端点（见第六节）
6. **缓存版本号** +1

## 四、侧边栏与标签状态保持（刷新后状态不丢）

教训来源：「Dashboard 侧边栏刷新状态保持」+「仪表板日志功能」两个会话。刷新后 URL/高亮/内容不一致、直达链接高亮错、子菜单不展开都是历史踩坑。**新增页面、子菜单、子标签时统一按以下模式做状态保持，禁止自创键名/方案**：

1. **顶层 section（当前标签页）用 URL query 维护** — `?section=xxx`（admin 端与 dashboard 端约定一致）；`activeSection` 初始化从 URL 读取，新增 watch 在切换时 `history.replaceState` 写回 URL。直达链接（如 `?section=lxc`）的内容与高亮必须一致，否则刷新/直达时"内容对、高亮错"。
2. **子菜单选中项用 localStorage + 白名单校验** — 键名 `dashboard_<名称>`（如 `dashboard_activeTabOrder`，取值仅 `'vm'/'lxc'`、默认 `'vm'`）；读取时非法值回退默认，watch 在值变化时写入。
3. **子菜单展开/收起态用 localStorage** — `dashboard_sidebarExpanded` 存逗号分隔的子菜单 id（如 `"order"`）；`toggleSubmenu` 展开/收起时同步写入。
4. **初始化统一走 `syncSidebarState()`** — 在 init 的 onMounted 开头调用：按 `activeSection` 同步侧边栏高亮，section 场景恢复子项选中并展开子菜单；**只做 DOM 高亮，不触发数据加载**（数据由各加载函数另行触发），顺带修复"内容对、高亮错"的既有 bug。
5. **section 内的子标签（tab）用 localStorage 持久化** — 键名如 `dashboard_logTab`（默认 `'operation'`）；进入该 section 或刷新时按保存值自动展开子菜单并高亮 `data-subsection="logs-<tab>"`。
6. **容错调用约定** — 对可选加载函数一律 `if ($.loadXxx) $.loadXxx(1)` 判空调用；init 链用 `$.initXxx && $.initXxx()`，防止某端页面没挂该函数时报错。
7. **踩坑提示** — watch 只在值变化时触发：点击项的当前值恰为默认值时 localStorage 不写入属**正常现象**，刷新后默认值行为一致即可，不要误判为 bug 加多余代码；验证状态保持必须覆盖「点击 → 刷新」与「直达链接 → 刷新」两条路径。

## 五、新增「按钮/弹窗/下拉/表单」的清单

1. **按钮间距统一** — 多个按钮并排用 `d-flex gap-2`/`gap-1` 或 `btn-group` 加 `gap:4px`，**不要用 `ms-1` 间距类**（会导致全页面间距不统一）。
2. **弹窗用项目统一组件** — 确认弹窗用既有 `customConfirm` 体系；`pv-button` 组件；表单弹窗复用 `admin-template-modals.js` / `dashboard-template-modals.js` 现有 modal 结构。
3. **下拉占位选项** — 必选场景占位项用 `<option :value="0">请选择系统</option>`；**不要用 `value="" disabled selected`**（会显示空白）。`value=0` 既能显示文本又与后端校验兼容。
4. **前后端联动校验同步** — 后端已强制的必选项，前端不能仍保留"默认/空选"选项（会矛盾）；反之亦然。改成必选后记得删掉"默认（系统推荐）"等占位。
5. **`v-html` 只用于**可控的 markdown 渲染并过 `DOMPurify.sanitize`；普通文本一律 `{{ }}`，禁止 `v-html` 直插用户输入。
6. **表单值注意类型一致性** — 下拉 `:value` 用 `String(u.id)` 与后端返回的类型对齐，否则刷新时选中项静默变空白；编辑表单保留数据快照（`Object.assign` 快照锁定 / 请求序号保护），防止异步刷新覆盖用户输入。

## 六、新增/修改后端接口的清单

1. **路由文件** — 在 `server/routes/*.js` 增删改端点。
2. **参数校验** — 所有用户可控参数在拼接/使用前经 `validateParam` + 白名单校验；vmid 用 `Number.isInteger && 100-999999999`；含 PVE 路径参数用 `encodeURIComponent`。
3. **资源归属** — 操作端点必须校验归属（`user_id` 匹配 + admin 放行）；涉及资金/计费/支付**必须**调 `security-checklist` 的 B/SEC 类规则，**不要**在接口提交后再补。
4. **新表/新列** — 建表/迁移在 `server/api/db-schema.js` 的 `initDb()` 中新增；业务 DB 函数写进对应业务域文件 `db-<domain>.js` 并在 `db.js` 聚合入口挂导出（见第七节）；**ALTER TABLE / 建表用幂等迁移**（`try { ... } catch (_) {}` 捕获 duplicate/column exists 错误），列、CRUD 字段列表、SQL 白名单三处同步加。**不要用 SQLite 或 sync-mysql**（已移除，仅 MySQL + mysql2/promise）。
5. **日期格式** — 写入 MySQL 一律 `mysqlNow()` / `formatLocalDate()`，禁止直接 `toISOString()`（详见第八节）。
6. **正确性验证** — 改完 `node --check 文件名`（JS 语法）能抓出缩进/嵌套错误；逻辑改动后跑项目测试（`--exit`，见第十一节；区分历史遗留失败）。
7. **用户可控 / 待落地细节** — 本次开发规范覆盖功能与流程；安全红线细项（IDOR、命令注入、支付、XSS、CSP、限速、信息泄露）请**必须**再调 `security-checklist` 或 `pve-security-guard` 过检，本技能不重复列举。

## 七、模块架构：低耦合高内聚（强制）

本规范直接来自「db-mysql.js 拆分」教训：原模块 2900 行，连接池 + 建表 + 约 200 个业务函数耦合在一个文件，含 4 处 `module.exports` 内部自引用、无独立事务封装，任何小改动都要动巨无霸文件、牵一发动全身。已按业务域拆分为 `db-core` / `db-schema` / `db-<domain>` 系列 + 纯组装入口 `db.js`。后续开发**必须**遵守：

1. **分层职责** — 路由 `routes/` 只做参数校验、归属校验、响应组装；业务逻辑与第三方外部调用进 `services/`；通用工具进 `utils/`；`api/db-*.js` 只做数据访问（SQL 封装），不掺业务决策。
2. **数据库函数按业务域落文件** — 新增 DB 函数写进 9 个既有域文件（`db-users.js` / `db-vms.js` / `db-orders.js` / `db-disks.js` / `db-backup.js` / `db-network.js` / `db-messaging.js` / `db-config.js` / `db-billing.js`）；**严禁**再往 `db.js` 聚合文件里堆业务函数。新业务域：新建 `db-<domain>.js`，在 `db.js` 挂一行导出即可——消费者统一 `require('../api/db')`，导出形状稳定、零改动。
3. **禁止 `module.exports` 内部自引用** — 模块内函数互调直接引用内部函数/变量，不要写 `module.exports.a()` 去调 `module.exports.b()`（历史上 4 处，拆分困难且易死循环）。
4. **事务统一走 `utils/with-transaction.js`** — 需要原子性时 `await withTransaction(async (conn) => { ... })`；**禁止**调用方自己 `pool.getConnection()` 手动 begin/commit/rollback（曾散落多处，回滚遗漏产生脏数据）。
5. **单一来源原则** — 常量/白名单/映射只定义一次并导出复用，**禁止双份拷贝手动同步**。教训：`AUDIT_CATEGORIES` 已在 `db-messaging.js` 定义并导出，但 `routes/log.js` 又拷贝了一份，新增分类要改两处、漏改即 bug。正确姿势：`const { AUDIT_CATEGORIES } = require('../api/db-messaging')`。
6. **循环依赖用行内懒加载** — 工具/路由互相 require 成环时，在函数体内 `require(...)`（参考 `utils/audit-log.js` 模式），不要顶层 require。
7. **建表/迁移集中在 `db-schema.js` 的 `initDb()`** — 业务域文件不散落 DDL；ALTER/建表幂等容错（见第九节），`createDefaultAdmin` 外不再散落 ALTER。
8. **第三方外部 API 必须走 `services/` 封装** — 参考 `services/ip-location.js`（UApiPro 集成）标准姿势：
   - 入参校验（IP 合法性等），拒绝域名/URL 防 SSRF；
   - 响应走 `utils/cache-store.js` 缓存（Redis 优先、内存回退），测试接口强制外呼不走缓存；
   - 失败静默降级：返回 null/空串，绝不阻塞主流程（业务侧对 null 兜底）；
   - 对外暴露的测试/触发接口限流（`middleware/rate-limiter.js`，如 10 次/分钟/用户）；
   - 密钥/凭据 AES-256-GCM 加密存储 + `maskSecret` 掩码回显 + `isMasked` 判断防掩码值回写覆盖真实 Key；
   - 错误只透传第三方响应体，不泄漏本地凭据/堆栈。

## 八、时间与时区（写入 MySQL 的日期一律本地时间）

项目约定：MySQL 连接池 `timezone: '+08:00'` + `dateStrings: true`，DATETIME 字段存本地时间字符串 `YYYY-MM-DD HH:MM:SS`；前端 `formatDate()` 按本地时间原样解析。历史教训：`auth.js` 4 处用 `new Date().toISOString()`（UTC）写入 `refresh_tokens`，导致设备管理页登录时间显示慢 8 小时、`expires_at > NOW()` 判 token 提前 8 小时过期。

1. **写入 MySQL 一律用 `mysqlNow()`**（`db-core.js`，聚合入口 `db.now`）或 `server/utils/date.js` 的 `formatLocalDate()`，**禁止 `toISOString()` 直写**（MySQL 5.7 也不认其格式）。
2. **改动含时间字段的代码后 `grep -rn "toISOString" server/` 自查**，确认无新引入；工具函数已存在却没用（auth.js 教训）比没有工具更隐蔽。
3. **前端展示不需要改时区逻辑**——后端存对，前端自然显示对；若显示不对先查后端写入，不要在前端加偏移。
4. 历史脏数据修正：写一次性脚本 `scripts/fix-*.js`（参照 `fix-refresh-token-timezone.js` 先例：修正数据→验证→清理），不进业务代码。

## 九、数据库初始化与迁移

1. **`initDb()` 建表/迁移每步都要幂等 + try/catch 容错**——原 `CREATE TABLE IF NOT EXISTS` 块无容错，远程 MySQL 网络抖动一次即抛错，`server.js` 直接 `process.exit(1)`（「本地启动 MySQL 初始化失败」根因）。
2. 首次初始化需建 30+ 张表 + 索引 + 迁移，耗时 13–15s 属正常，别误判卡死。
3. 初始化失败多为**瞬态网络错误**：直接重试启动即可；频繁失败才查网络稳定性或换库。
4. 新增默认配置项：在 `initDb()` 的 `initDefaultConfig()` 里加（幂等，如 `uapipro:enabled` / `uapipro:api_key`），不要另起炉灶。
5. MCP MySQL 工具**只读**（DDL 被拒）——验证建表/初始化用 `node -e` 调应用层 `db-schema.js` 的 `initDb()` 或 `DESCRIBE`。

## 十、审计埋点（操作日志/登录日志）

Dashboard 日志功能依赖统一埋点，敏感写操作（登录、改密、订单、磁盘销毁、删除、设置变更）必须埋点：

1. 统一调用 `utils/audit-log.js` 的 `auditLog({ userId, username, action, resourceType, resourceId, details, req })`；`details` 用中文可读字符串（含套餐名/容量/金额/IP 归属地），不用对象。
2. **整个埋点包在 `try { ... } catch (_) {}` 中**，审计失败绝不影响主业务（audit-log 内部已兜底，调用侧也勿依赖其返回值）。
3. action 命名约定 `域.动作` 点分命名：`user.login` / `vm.start` / `disk.destroy` / `order.create` / `setting.profile` / `password.reset.admin` / `security.2fa`。
4. **新增审计分类只改 `db-messaging.js` 的 `AUDIT_CATEGORIES` 一处**（category → SQL 条件映射 + 导出），路由 `require` 复用，禁止拷贝（见第七节单一来源）。
5. 埋点用行内 `require('../utils/audit-log')` 懒加载，避免路由与工具模块循环依赖。

## 十一、测试与验证

1. **`test/` 目录被 `.gitignore` 忽略**——新测试文件不入库、`git status` 不显示，属预期，勿误判未创建。
2. **`npm test` 用 `--exit`**（package.json 已配），否则 redis/rate-limiter 等残留事件循环句柄会让 mocha 全绿后进程挂起。
3. `node --check` 只能抓语法错误，**抓不到未定义变量**（教训：backup.js 埋点引用未定义 `vmid`，运行时 ReferenceError）——逻辑改动必须跑测试或实际调用。
4. 全量跑 `npx mocha --recursive "test/**/*.test.js" --exit --timeout 10000`；历史遗留失败与本次改动分开判断。
5. 排查"挂起/无输出"时把输出落盘文件再看，管道 `| tail` 缓冲会制造无输出假象。

## 十二、PVE / SSH / 计费涉及金钱与资源的红线（数据盘备份恢复专项）

这些坑直接源自「备份恢复数据盘孤立白嫖漏洞」会话，涉及金钱和底层资源，改动相关代码时必须遵守：

1. **销毁卷必须先 detach** — `pvesm free` 对**已挂载到 VM 的卷会静默失败**。先 `qm set <vmid> --delete <slotKey>` 摘除，再 `pvesm free` 销毁；销毁后再清理 `unusedN` 残留（`qm set --delete unusedN` 语义其实是**销毁卷文件**，只在真删卷时用）。
2. **`qm unlink` 是安全卸载**，保留卷文件、保留 unused 引用；**禁止**顺手清理 unused 导致卷文件被销毁。
3. **异步任务返回 OK ≠ 配置已生效** — `qmrestore`/恢复类任务完成后 VM config 可能延迟刷新，**轮询回调里加延时（如 1000ms）再取配置**，或校验最终一致性。
4. **恢复/重装会重建磁盘、不再自动释放旧卷** — 恢复后要「对账」：比对 PVE 当前卷 vs DB 台账，回收不再使用的旧卷、更新变动的 volume_id、销毁无台账的幽灵盘。快照基线 + 恢复后审计是标准做法。
5. **对账/清理逻辑必须有显式失败告警**，禁止静默失败（涉及资金/资源释放的自动化操作尤其如此）。
6. **系统盘保护由槽位决定，不由卷名假设** — `dev=0` 是系统盘槽位；PVE 恢复后数据盘卷名可能是 `vm-<id>-disk-0`（从 0 编号），卷名含 `disk-0` 不代表系统盘。校验系统盘用 `validateBusDev` 的 `dev=0` 检查，不要用卷名正则一刀切。
7. **并发保护** — 恢复/对账等长流程用事务或行锁，防止「恢复的同时买新盘」等并发场景打架。
8. **涉及资金/资源的删除操作，前端与后端都要确认再执行**，且删除前先看目标，确认无其他引用。

## 十三、Git 提交流程

- **开发完成（含本技能等 `.zcode/skills/` 文件更新）必须「提交 + 双端推送」到 `beta`**，禁止只提交不推送、更禁止只改本地不提交；只有用户明确说「暂不推送」时才停在本地。
- 日常开发在 **`beta` 分支**，**禁止直接提交 `main`**；`main` 由你显式验证后合并。
- 双远程：GitHub `origin` + Gitee `gitee`，**两处都要推**（通常先后推，推完一处换另一处）。
- 提交信息用 Conventional Commits（`feat:` / `fix:` / `refactor:` 等，必要时带 scope，如 `feat(notification): ...`）。
- 提交前 `git status` + `git diff --staged --stat` 核对改动范围。
- 删除函数时**同步清理 `module.exports`**，否则残留导出导致上线后才二次修复。
- 用 `universal-git-workflow` 技能执行完整提交流程。

## 十四、提交/收尾前的自查清单

每完成一次新增/修改，逐项确认：

- [ ] 所有涉及的 JS/CSS/EJS 改动后 `public/cache-version.json` 已 +1，引用带 `?cv=`
- [ ] 新页面：section 名 = 菜单 DOM id 映射，`expandSections` 白名单已补，点击/刷新路径复用同一加载函数
- [ ] 侧边栏/标签状态保持：顶层 section 用 URL `?section=`、子菜单选中/展开态用 localStorage（白名单校验 + 默认值回退）、初始化走 `syncSidebarState()`，未自创键名/方案
- [ ] 按钮间距已用 `d-flex gap-*`，未新增 `ms-1`
- [ ] 必选下拉占位用 `value=0`，前后端必选逻辑一致
- [ ] 后端接口：`node --check` 通过，资源归属 + validateParam 校验到位
- [ ] 数据库：DDL 在 `db-schema.js` 的 `initDb()` 且幂等容错；业务 DB 函数落在对应 `db-<domain>.js`，未往 `db.js` 堆函数；列/CRUD/白名单三处同步
- [ ] 模块架构：无 `module.exports` 内部自引用；事务走 `with-transaction`；白名单/常量单一来源无拷贝
- [ ] 时间字段写入用 `mysqlNow()`/`formatLocalDate()`，`grep toISOString server/` 无新引入
- [ ] 敏感写操作已走 `auditLog()` 埋点且 try/catch 降级；新增分类只改 `db-messaging.js` 一处
- [ ] 第三方外部 API 走 `services/` 封装：入参校验（防 SSRF）、缓存、静默降级、限流、密钥加密 + maskSecret
- [ ] 计费/磁盘/恢复类：detach→free→清 unused 顺序、延时取配置、对账与失败告警、槽位保护就位
- [ ] 调用了 `security-checklist` / `pve-security-guard` 完成安全过检（新增按钮/弹窗/页面若只改前端渲染，至少确认无 XSS/CSP/缓存遗漏）
- [ ] 测试：改动逻辑后跑 `npx mocha --recursive "test/**/*.test.js" --exit --timeout 10000`（`test/` 不入库属预期）
- [ ] git 在 beta 分支，提交信息规范，开发完成已「提交 + 双端推送」，未擅自 merge 到 main
