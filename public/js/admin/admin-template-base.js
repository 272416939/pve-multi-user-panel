(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<!-- Fixed Header -->
        <header class="page-header">
            <div class="header-left">
                <pv-button class="sidebar-toggle" variant="ghost" @click.prevent="toggleSidebar()" aria-label="菜单"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg></pv-button>
                <span class="brand-logo">{{ siteLogoText }}</span>
            </div>
            <div class="header-right">
                <pv-button id="themeToggle" variant="ghost" title="切换主题" aria-label="切换主题">

                    <svg class="theme-icon theme-icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                    <svg class="theme-icon theme-icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>

</pv-button>
                <a href="user-center#messages" class="header-btn" title="消息">
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  <span class="notification-badge" id="adminMsgCount" style="display:none;">0</span>
</a>
                <div class="dropdown">
                    <div class="user-info-dropdown" data-bs-toggle="dropdown">
                        <img class="header-user-avatar" id="headerAvatar" alt="" />
                        <span id="headerUsername">Admin</span>
                    </div>
                    <ul class="dropdown-menu dropdown-menu-end">
                        <li><a class="dropdown-item" href="/dashboard" target="_blank"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;margin-right:4px"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> 仪表盘</a></li>
                        <li><a class="dropdown-item" href="user-center#wallet-recharge"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;margin-right:4px"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg> <span id="headerWalletBalance">余额：--</span></a></li>
                        <li><a class="dropdown-item" href="user-center"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;margin-right:4px"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 用户中心</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="#" id="headerLogoutBtn"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:text-bottom;margin-right:4px"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> 退出登录</a></li>
                    </ul>
                </div>
            </div>
        </header>

        <!-- Fixed Sidebar (Vue 指令生效) -->
        <aside class="sidebar" id="sidebar">
            <nav class="sidebar-nav">
                <a class="nav-item" :class="{ active: activeSection === 'overview' }" href="#" @click.prevent="switchSection('overview')"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span><span class="nav-text">总览</span></a>
                <a class="nav-item" href="/dashboard" target="_blank"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span><span class="nav-text">仪表盘</span></a>
                <a class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('vms')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                    <span class="nav-text">虚拟机管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div class="nav-submenu" id="submenu-vms">
                    <a class="nav-item" data-subsection="vms-manage" href="#" @click.prevent="switchSubsection('vms','manage')"><span class="nav-text">虚拟机列表</span></a>
                    <a class="nav-item" data-subsection="vms-assign" href="#" @click.prevent="switchSubsection('vms','assign')"><span class="nav-text">分配虚拟机</span></a>
                </div>
                <a class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('lxc')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                    <span class="nav-text">LXC 容器管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div class="nav-submenu" id="submenu-lxc">
                    <a class="nav-item" data-subsection="lxc-create" href="#" @click.prevent="switchSubsection('lxc','create')"><span class="nav-text">新建 LXC 容器</span></a>
                    <a class="nav-item" data-subsection="lxc-assign" href="#" @click.prevent="switchSubsection('lxc','assign')"><span class="nav-text">分配 LXC 容器</span></a>
                    <a class="nav-item" data-subsection="lxc-manage" href="#" @click.prevent="switchSubsection('lxc','manage')"><span class="nav-text">容器管理</span></a>
                </div>
                <a class="nav-item" :class="{ active: activeSection === 'port-forward' }" href="#" @click.prevent="switchSection('port-forward')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></span>
                    <span class="nav-text">端口转发管理</span>
                </a>
                <!-- 后台管理 -->
                <a class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('manage')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>
                    <span class="nav-text">后台管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div class="nav-submenu" id="submenu-manage">
                    <a class="nav-item" data-subsection="manage-users" href="#" @click.prevent="switchAdminTab('users')"><span class="nav-text">用户管理</span></a>
                    <a class="nav-item" data-subsection="manage-cdk" href="#" @click.prevent="switchAdminTab('cdk')"><span class="nav-text">CDK 管理</span></a>
                    <a class="nav-item" data-subsection="manage-messages" href="#" @click.prevent="switchAdminTab('messages')"><span class="nav-text">消息管理</span></a>
                </div>

                <!-- 模板管理（父菜单，仅admin） -->
                <a v-if="user && user.role === 'admin'" class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('templates')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg></span>
                    <span class="nav-text">模板管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div v-if="user && user.role === 'admin'" class="nav-submenu" id="submenu-templates">
                    <a class="nav-item" data-subsection="templates-vm" href="#" @click.prevent="switchPage('vm-templates')"><span class="nav-text">VM 模板</span></a>
                    <a class="nav-item" data-subsection="templates-lxc" href="#" @click.prevent="switchPage('lxc-templates')"><span class="nav-text">LXC 模板</span></a>
                </div>

 <!-- 套餐管理（父菜单，仅admin） -->
                <a v-if="user && user.role === 'admin'" class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('packages')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span>
                    <span class="nav-text">套餐管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div v-if="user && user.role === 'admin'" class="nav-submenu" id="submenu-packages">
                    <a class="nav-item" data-subsection="packages-vm" href="#" @click.prevent="switchPage('vm-packages')"><span class="nav-text">VM 套餐</span></a>
                    <a class="nav-item" data-subsection="packages-vm-groups" href="#" @click.prevent="switchPage('vm-package-groups')"><span class="nav-text">VM 套餐分组</span></a>
                    <a class="nav-item" data-subsection="packages-lxc" href="#" @click.prevent="switchPage('lxc-packages')"><span class="nav-text">LXC 套餐</span></a>
                    <a class="nav-item" data-subsection="packages-lxc-groups" href="#" @click.prevent="switchPage('lxc-package-groups')"><span class="nav-text">LXC 套餐分组</span></a>
                </div>

               
                <!-- 硬盘套餐管理（父菜单，仅admin） -->
                <a v-if="user && user.role === 'admin'" class="nav-item has-children" :class="{ active: activeSection === 'disk-settings' }" href="#" @click.prevent="toggleSubmenu('disk-settings')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg></span>
                    <span class="nav-text">硬盘套餐管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div v-if="user && user.role === 'admin'" class="nav-submenu" id="submenu-disk-settings">
                    <a class="nav-item" :class="{ active: activeSection === 'disk-settings' && activeTabDisk === 'storage-groups' }" href="#" @click.prevent="switchSection('disk-settings'); activeTabDisk = 'storage-groups'"><span class="nav-text">存储分组管理</span></a>
                    <a class="nav-item" :class="{ active: activeSection === 'disk-settings' && activeTabDisk === 'specs' }" href="#" @click.prevent="switchSection('disk-settings'); activeTabDisk = 'specs'"><span class="nav-text">数据盘管理</span></a>
                    <a class="nav-item" :class="{ active: activeSection === 'disk-settings' && activeTabDisk === 'lifecycle' }" href="#" @click.prevent="switchSection('disk-settings'); activeTabDisk = 'lifecycle'"><span class="nav-text">生命周期管理</span></a>
                </div>

                <!-- 财务管理（父菜单，仅admin） -->
                <a v-if="user && user.role === 'admin'" class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('finance')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z"/></svg></span>
                    <span class="nav-text">财务管理</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div v-if="user && user.role === 'admin'" class="nav-submenu" id="submenu-finance">
                    <a class="nav-item" data-subsection="finance-transactions" href="#" @click.prevent="switchSection('finance',{highlight:'finance-transactions'}); activeTab='transactions'"><span class="nav-text">交易流水</span></a>
                    <a class="nav-item" data-subsection="finance-orders" href="#" @click.prevent="switchSection('finance',{highlight:'finance-orders'}); activeTab='orders'"><span class="nav-text">订单管理</span></a>
                </div>

                <!-- 系统设置 -->
                <a class="nav-item has-children" href="#" @click.prevent="toggleSubmenu('settings')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg></span>
                    <span class="nav-text">系统设置</span>
                    <span class="nav-arrow"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg></span>
                </a>
                <div class="nav-submenu" id="submenu-settings">
                    <a class="nav-item" data-subsection="settings-smtp" href="#" @click.prevent="switchAdminTab('smtp')"><span class="nav-text">SMTP 配置</span></a>
                    <a class="nav-item" data-subsection="settings-pve" href="#" @click.prevent="switchAdminTab('pve')"><span class="nav-text">PVE节点设置</span></a>
                    <a class="nav-item" data-subsection="settings-snapshot-backup" href="#" @click.prevent="switchAdminTab('snapshot-backup')"><span class="nav-text">快照&备份配置</span></a>
                    <a class="nav-item" data-subsection="settings-network" href="#" @click.prevent="switchAdminTab('network')"><span class="nav-text">网络管理</span></a>
                    <a class="nav-item" data-subsection="settings-pay" href="#" @click.prevent="switchAdminTab('pay')"><span class="nav-text">支付配置</span></a>
                    <a class="nav-item" data-subsection="settings-site" href="#" @click.prevent="switchAdminTab('site')"><span class="nav-text">站点设置</span></a>
                </div>

                <!-- 系统更新（独立一级菜单） -->
                <a class="nav-item" :class="{ active: activeSection === 'system-update' }" href="#" @click.prevent="switchSection('system-update')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg></span>
                    <span class="nav-text">系统更新</span>
                </a>
            </nav>
        </aside>

        <div>
            <div v-if="!user" class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2 text-muted">正在验证登录状态...</p>
            </div>

            <div v-else>
                <!-- 总览区域 -->



`);
})();
