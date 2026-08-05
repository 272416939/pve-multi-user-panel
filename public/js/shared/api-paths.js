// public/js/shared/api-paths.js - API 路径常量（单一来源）
// 规范第七节：接口路径只定义一次，禁止散落硬编码
// 引用方式：window.__apiPaths.xxx（在 shared.js 之后加载）
// 注意：shared.js 的 api() 封装会自动加 /api 前缀，此处常量不含前缀（除特殊说明）
// 特别说明：REFRESH_TOKEN 被 shared.js 直接 fetch 使用（不经 api() 封装），调用处必须手动拼接 '/api' 前缀

window.__apiPaths = {
    // 认证
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH_TOKEN: '/auth/refresh',
    PROFILE: '/user/profile',

    // 资源
    VM: '/vm',
    LXC: '/lxc',
    DISKS: '/disks',
    DISK_OPTIONS: '/disk-options',

    // 钱包/订单
    WALLET_BALANCE: '/wallet/balance',
    WALLET_PAY_CONFIG: '/wallet/pay-config',
    WALLET_RECHARGE: '/wallet/recharge',
    WALLET_RENEW: '/wallet/renew',
    WALLET_TRANSACTIONS: '/wallet/transactions',
    ORDERS: '/orders',

    // 套餐
    VM_PACKAGES: '/vm-packages',
    LXC_PACKAGES: '/lxc-packages',
    PACKAGE_GROUPS: '/package-groups',

    // 管理端
    ADMIN_USERS: '/admin/users',
    ADMIN_TRANSACTIONS: '/admin/transactions',
    ADMIN_ORDERS: '/admin/orders',
    ADMIN_CDK_LIST: '/admin/cdk/list'
};
