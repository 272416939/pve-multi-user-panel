# Changelog

## [1.7.5-UI-beta1] - 2026-06-10

### Added
- feat(ui): 用户中心Tab从nav-tabs迁移到左侧边栏(Teleport方案),新增switchSubTab统一切换方法
- feat(ui): UC侧边栏子导航项样式(分组标签/缩进/active高亮/未读badge)
- feat(ui): UC补全缺失的sidebar-toggle按钮和768px响应式CSS断点
- feat(ui): 下拉菜单改用Teleport到body浮动方案(解决表格overflow裁剪问题)
- feat(ui): 全页面头像从div+background-image改为img+src(修复浏览器SVG data URI兼容性)

### Fixed
- fix(vm): VM reset-ip报错getByVmId is not a function(改用getAll().find)
- fix(lxc): LXC reset-ip缺少网关参数(添加gw=)
- fix(vm): VM已绑定IP修改时跳过创建(新增updateDhcpStaticBindingIp回退逻辑)
- fix(ui): UC header与dashboard样式不统一(移除多余BS class和inline style)
- fix(ui): 侧边栏toggle双重事件绑定导致点击无反应(移除重复addEventListener)
- fix(ui): 导航后页面overlay残留模糊(sidebar关闭统一style.display='none')
- fix(ui): Admin移动端overlay遮挡sidebar(左侧偏移方案解决层叠上下文限制)

### Changed
- refactor(ui): Glassmorphism视觉体系全面增强(CSS变量双主题/毛玻璃卡片/细边框)
- refactor(ui): 移动端响应式全面优化(table缩放/stat卡片适配/nav-tabs紧凑模式)
- chore: .gitignore添加tests/忽略E2E测试脚本(含测试mock数据)
