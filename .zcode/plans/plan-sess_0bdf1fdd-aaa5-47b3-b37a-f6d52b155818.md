## 两个问题修复方案

### 问题 2：CDK 下拉仍被容器包含（先修，根因明确）

**根因**：`.modal-content { backdrop-filter: blur(8px) }` 导致后代 `position: fixed` 降级为 `position: absolute`（CSS 规范：祖先有 transform/filter/backdrop-filter/perspective 时，fixed 相对该祖先定位）。CDK 下拉在 modal-content 内部，fixed 失效，仍被 `overflow-y: auto` 裁剪。

**修复方案**：CDK 下拉菜单改为 **Teleport 到 body**，完全脱离 modal-content 的 DOM 树。这是最彻底的方案——无论祖先有什么 CSS 属性都不影响。

实现方式：
1. `dashboard-template-modals.js`：CDK VM 和 LXC 的 `.custom-select-dropdown` 从 `.custom-select` 内部移出，改为独立的 Teleport 块。用 `v-if="cdkVmDropdownOpen"` 控制显示，由 JS 定位。
2. `toggleCdkDropdown`（vm.js）：打开时用 `getBoundingClientRect()` 计算触发器位置，设置到 Teleport 出来的下拉元素（用 `data-cdk-dropdown="vm/lxc"` 属性查找）。
3. CSS：`.custom-select-dropdown` 保持 `position: fixed`（Teleport 到 body 后无 backdrop-filter 祖先，fixed 正常工作）。
4. 关闭时 `releaseFixedDropdown` 释放 z-index。

### 问题 1：移动端更多按钮适配

**三个子问题**：

**1a. 列表太长需移到最右边点击**
移动端表格 `min-width: 600px` 强制最小宽度，操作列被推到最右边需要水平滚动。

**修复**：移动端（`@media max-width: 768px`）隐藏 `btn-group-table`（开关机/重启/停止/销毁等直接按钮），把这些操作收进"更多"下拉菜单里。只保留"更多"一个按钮，大幅减少操作列宽度。用 CSS `display: none` 隐藏 `.btn-group-table`，同时在模板的 dropdown-menu 里补上这些操作项（移动端通过 CSS 控制显隐：桌面端 dropdown 里不显示开关机项，移动端显示）。

实际上更简洁的做法：移动端 CSS 隐藏 `.btn-group-table`，在 dropdown-menu-table 里新增 `<li class="d-md-none">` 的开关机/销毁菜单项（`d-md-none` = 仅移动端显示）。

**1b. 功能弹窗在中间显示适配有问题**
快照/备份等 modal 在移动端居中显示，但 `modal-lg` 宽度太大超出屏幕。

**修复**：移动端 CSS 给 `.modal-dialog.modal-lg` 加 `max-width: 95vw; margin: 0.5rem auto`，确保不超出屏幕。

**1c. 遮罩被缩短**
`dropdown-active` 让 `overflow: visible` 后，表格 `min-width: 600px` 不再被裁剪，表格宽度突变导致布局跳动。

**修复**：`dropdown-active` 时不改变 `overflow-x`（保持 `auto`），只改 `overflow-y: visible`。但 CSS 规范中设 `overflow-y: visible` 而 `overflow-x: auto` 时，`overflow-y` 会被隐式改为 `auto`。所以需要换方案：下拉菜单也用 Teleport 到 body（和 CDK 下拉一样），不需要改 table-container 的 overflow。

**统一方案**：表格"更多"下拉菜单也 Teleport 到 body，用 JS 定位。这样完全不需要 `dropdown-active` 的 overflow hack，彻底解决裁剪和布局跳动问题。

### 统一实施方案

把"更多"下拉和 CDK 下拉都改为 **Teleport 到 body + JS 定位 + 动态 z-index**：

#### CSS 改动
- `components.css`：删除 `.table-container.dropdown-active` 规则（不再需要）
- `admin.css`/`dashboard.css`：移动端 `.btn-group-table { display: none }` 隐藏直接按钮
- `admin.css`/`dashboard.css`：移动端 `.modal-dialog.modal-lg { max-width: 95vw; margin: 0.5rem auto }`
- `dropdown-menu-table` 和 `custom-select-dropdown` 保持 `position: fixed`（Teleport 到 body 后无 backdrop-filter 祖先）

#### 模板改动
- `admin-template-vm.js`/`admin-template-lxc.js`：dropdown-menu-table 里补移动端操作项（`class="d-md-none"` 开关机/销毁）
- `dashboard-template.js`：同上
- `dashboard-template-modals.js`：CDK 下拉改为 Teleport 到 body

#### JS 改动
- `toggleAdminDropdown`（admin-page.js + dashboard/core.js）：打开时把 `.dropdown-menu-table` 的内容渲染到一个 Teleport 容器，或直接把菜单元素 moveTo body。实际上更简单的做法：保持菜单在原 DOM 位置，但用 `position: fixed` + JS 定位——但表格祖先没有 backdrop-filter，所以 fixed 能正常工作。不需要 Teleport。
- 删除 `dropdown-active` 相关逻辑（不再需要改 overflow）
- CDK 下拉：Teleport 到 body + JS 定位

#### 最终简化方案

经过进一步思考，实际上：
- **表格"更多"下拉**：祖先链（table-container → table-scroll → table → tbody → tr → td → dropdown-table）没有 `backdrop-filter`/`transform`，所以 `position: fixed` 能正常工作。只需把 `.dropdown-menu-table` 改为 `position: fixed` + JS 定位，删除 `dropdown-active` overflow hack。
- **CDK 下拉**：祖先链有 `backdrop-filter`（modal-content），`position: fixed` 失效。必须 Teleport 到 body。

#### 文件改动清单

1. `public/shared/css/components.css`：`.dropdown-menu-table` 改 `position: fixed`；删除 `.table-container.dropdown-active` 规则
2. `public/css/admin.css`：移动端加 `.btn-group-table { display: none }`；`.modal-dialog.modal-lg` 移动端适配；`dropdown-menu-table` 同步改 fixed；删除移动端 `.table-container.dropdown-active`
3. `public/css/dashboard.css`：同上
4. `public/js/admin/admin-page.js`：`toggleAdminDropdown` 改为 JS 定位 fixed 下拉，删除 dropdown-active 逻辑
5. `public/js/dashboard/core.js`：同上
6. `public/js/dashboard/dashboard-page.js`：点击关闭时删除 dropdown-active 逻辑
7. `public/js/dashboard/dashboard-template-modals.js`：CDK 下拉改为 Teleport 到 body
8. `public/js/dashboard/vm.js`：`toggleCdkDropdown` 适配 Teleport 后的 DOM 查找
9. `public/js/admin/admin-template-vm.js`/`admin-template-lxc.js`：dropdown 补移动端操作项（d-md-none）
10. `public/js/dashboard/dashboard-template.js`：同上
11. EJS `_b` 更新