/**
 * 数据库模块（MySQL 唯一驱动）
 *
 * 所有路由/中间件/服务文件统一 require('./api/db') 即可。
 * initDb() 由 server.js 在启动时调用 await db.initDb() 完成建表和迁移。
 *
 * 说明：原 db-mysql.js 已按业务域拆分为 db-core / db-schema / db-* 系列模块，
 * 本文件仅负责聚合组装，导出形状与拆分前保持一致。
 */

console.log('[数据库] 当前使用: mysql');

const dbCore = require('./db-core');
const dbSchema = require('./db-schema');
const dbUsers = require('./db-users');
const dbVms = require('./db-vms');
const dbOrders = require('./db-orders');
const dbDisks = require('./db-disks');
const dbBackup = require('./db-backup');
const dbNetwork = require('./db-network');
const dbSubnets = require('./db-subnets');
const dbMessaging = require('./db-messaging');
const dbConfig = require('./db-config');
const dbBilling = require('./db-billing');
const dbIp = require('./db-ip');

module.exports = {
    // 数据库连接
    db: { connection: dbCore.getPool },

    // 暴露连接池获取函数（供 with-transaction.js 等工具使用）
    getPool: dbCore.getPool,

    // 时间工具函数（统一本地时间 YYYY-MM-DD HH:MM:SS）
    now: dbCore.mysqlNow,
    today: dbCore.mysqlToday,

    // V3-14 修复：敏感操作审计日志
    auditLogs: dbMessaging.auditLogs,

    // 登录日志（登录成功/失败）
    loginLogs: dbMessaging.loginLogs,

    // 用户操作
    users: dbUsers.users,

    // 虚拟机操作
    vms: dbVms.vms,

    // CDK 兑换码操作
    cdk: dbOrders.cdk,

    // 备忘录操作
    memos: dbMessaging.memos,

    // 密码重置令牌操作
    passwordResetTokens: dbUsers.passwordResetTokens,

    // 站内消息操作
    messages: dbMessaging.messages,

    // 配置操作
    config: dbConfig.config,

    // 刷新令牌操作
    refreshTokens: dbConfig.refreshTokens,

    // 快照配置操作
    snapshotConfig: dbBackup.snapshotConfig,

    // 快照日志操作
    snapshotLogs: dbBackup.snapshotLogs,

    // 2FA 操作
    twofa: dbUsers.twofa,

    // 备份配置操作
    backupConfig: dbBackup.backupConfig,

    // 备份操作
    backups: dbBackup.backups,

    // 备份日志操作
    backupLogs: dbBackup.backupLogs,

    // 恢复任务操作
    restoreTasks: dbBackup.restoreTasks,

    // LXC 配置操作
    lxcConfig: dbConfig.lxcConfig,

    // LXC 容器操作
    lxcContainers: dbVms.lxcContainers,

    // 端口转发操作
    portForwards: dbNetwork.portForwards,

    // 私有网络子网操作
    subnets: dbSubnets.subnets,

    // 初始化入口（供外部调用，已改为 async）
    initDb: dbSchema.initDb,

    // 交易记录操作
    transactionRecords: dbOrders.transactionRecords,

    // PAY-1/2/3 修复：充值待处理订单操作
    pendingOrders: dbOrders.pendingOrders,

    // 订单操作
    orders: dbOrders.orders,

    // VM 模板操作
    vmTemplates: dbVms.vmTemplates,

    // LXC 模板操作
    lxcTemplates: dbVms.lxcTemplates,

    // VM 套餐操作
    vmPackages: dbBilling.vmPackages,

    // LXC 套餐操作
    lxcPackages: dbBilling.lxcPackages,

    // 套餐分组操作
    packageGroups: dbBilling.packageGroups,

    // 存储分组
    storageGroups: dbDisks.storageGroups,

    // 硬盘规格
    diskSpecs: dbDisks.diskSpecs,

    // 磁盘资产台账
    disks: dbDisks.disks,

    // 磁盘生命周期配置
    diskLifecycleConfig: dbDisks.diskLifecycleConfig,

    // 可切换系统模板（os_templates）
    osTemplates: dbVms.osTemplates,

    // 系统切换日志（vm_os_switch_logs）
    vmOsSwitchLogs: dbVms.vmOsSwitchLogs,

    // VM 磁盘快照（恢复前后对账，防止幽灵盘）
    vmDiskSnapshots: dbVms.vmDiskSnapshots,

    // 用户通知设置
    userSettings: dbUsers.userSettings,

    // IP 归属地持久化缓存（ip_locations）
    ipLocations: dbIp.ipLocations,
};
