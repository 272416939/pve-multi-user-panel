// public/js/shared/storage-keys.js - localStorage 键名常量（单一来源）
// 规范第七节：键名只定义一次并导出复用，禁止散落硬编码
// 引用方式：window.__storageKeys.xxx（在 shared.js 之后加载）

window.__storageKeys = {
    // 认证
    TOKEN: 'token',
    REFRESH_TOKEN: 'refreshToken',

    // 管理端 tab 状态
    ADMIN_ACTIVE_TAB: 'admin_activeTab',
    ADMIN_ACTIVE_TAB_VM: 'admin_activeTabVm',
    ADMIN_ACTIVE_TAB_LXC: 'admin_activeTabLxc',
    ADMIN_ACTIVE_TAB_DISK: 'admin_activeTabDisk',
    ADMIN_ACTIVE_TAB_SECURITY: 'admin_activeTabSecurity',
    ADMIN_ACTIVE_TAB_TEMPLATES: 'admin_activeTabTemplates',
    ADMIN_ACTIVE_TAB_PACKAGES: 'admin_activeTabPackages',
    // 日志中心 tab 与每页条数
    ADMIN_LOGTAB: 'admin_logTab',
    ADMIN_LOG_PAGE_SIZE: 'admin_logPageSize',

    // 仪表盘状态
    DASHBOARD_ACTIVE_TAB: 'dashboard_activeTab',
    DASHBOARD_ACTIVE_TAB_ORDER: 'dashboard_activeTabOrder',
    DASHBOARD_LOGTAB: 'dashboard_logTab',
    DASHBOARD_LOG_PAGE_SIZE: 'dashboard_logPageSize',
    DASHBOARD_SIDEBAR_EXPANDED: 'dashboard_sidebarExpanded',

    // 主题
    THEME: 'theme',

    // 开通轮询前缀（key = 前缀 + resourceId）
    PROVISIONING_PREFIX: 'provisioning_'
};
