// server/constants.js - 全局共享常量（单一来源）
// 规范第七节：常量/白名单/映射只定义一次并导出复用，禁止在业务文件里重复拷贝
// 消费方统一 require('../constants')，新增常量只改本文件

// ==================== 计费周期 ====================

// 有效周期列表（白名单校验）
var VALID_PERIODS = ['month', 'quarter', 'year'];

// 订购/续费周期数量上限（V4-11：开通与续费统一 1-99 白名单，防日期溢出）
var MAX_PERIOD_COUNT = 99;

// 周期 → 天数映射（开通/续费按 30/90/365 天计算）
var PERIOD_DAYS = { month: 30, quarter: 90, year: 365 };

// 周期 → 月数映射（计费换算）
var PERIOD_MONTHS = { month: 1, quarter: 3, year: 12 };

// 周期 → 中文单位（邮件/文案：1个月 / 2季 / 3年）
var PERIOD_UNITS = { month: '个月', quarter: '季', year: '年' };

// 周期 → 中文名称（表格/导出：月付 / 季付 / 年付）
var PERIOD_NAMES = { month: '月付', quarter: '季付', year: '年付' };

// ==================== 磁盘 ====================

// 硬盘类型白名单
var DISK_TYPES = ['NVME', 'SATA', 'HDD', 'U2'];

// 磁盘格式白名单
var DISK_FORMATS = ['raw', 'qcow2', 'vmdk', 'subvol'];

// ==================== 订单 ====================

// 订单状态枚举
var ORDER_STATUS = ['completed', 'pending', 'refunded', 'destroyed'];

// ==================== 模板 ====================

// OS 模板状态枚举
var TEMPLATE_STATUS = ['active', 'maintenance', 'deprecated'];

// ==================== 支付 ====================

// 支付方式白名单
var PAYMENT_METHODS = ['alipay', 'wxpay'];

// 界面模板（UI 模板体系）：'default' = 赛博霓虹（默认），'saas' = SAAS 企业风
// 用户级偏好额外允许 ''（跟随站点默认），见 db-users.js userSettings 校验
var UI_TEMPLATES = ['default', 'saas'];

// ==================== 限速规则（安全防护·限速设置单一来源） ====================

// 限速规则注册表：大类（category）→ 规则列表。
// 默认 max/windowSec 与各调用点改造前的硬编码参数一致（默认全部开启）；
// admin「安全防护 > 限速设置」页的展示、config 表 ratelimit:* 默认键、运行时校验白名单均由此生成。
var RATE_LIMIT_CATEGORIES = [
    {
        key: 'global',
        label: '全局限制',
        rules: [
            { key: 'global', label: '全局接口限速', hint: '所有 /api 请求，按 IP 统计', max: 300, windowSec: 60 }
        ]
    },
    {
        key: 'auth',
        label: '登录认证',
        rules: [
            { key: 'login', label: '登录尝试', hint: '按 IP+用户名', max: 5, windowSec: 60 },
            { key: 'login_2fa', label: '2FA 验证', hint: '按 IP+用户', max: 3, windowSec: 60 },
            { key: 'refresh', label: '令牌刷新', hint: '按 IP', max: 30, windowSec: 60 },
            { key: 'forgot', label: '找回密码邮件', hint: '按 IP，10 分钟 1 次', max: 1, windowSec: 600 },
            { key: 'email_verify', label: '邮箱验证邮件发送', hint: '按用户，1 分钟 1 次', max: 1, windowSec: 60 },
            { key: 'reset_pwd', label: '重置密码', hint: '按 IP', max: 5, windowSec: 60 },
            { key: 'logout', label: '登出', hint: '按 IP', max: 30, windowSec: 60 }
        ]
    },
    {
        key: 'register',
        label: '注册',
        rules: [
            { key: 'register_code', label: '注册验证码发送', hint: '按邮箱', max: 1, windowSec: 60 },
            { key: 'register_code_ip', label: '注册验证码发送', hint: '按 IP，1 小时', max: 5, windowSec: 3600 },
            { key: 'register', label: '注册提交', hint: '按 IP，1 小时', max: 3, windowSec: 3600 }
        ]
    },
    {
        key: 'cdk',
        label: 'CDK 兑换',
        rules: [
            { key: 'cdk', label: 'CDK 兑换', hint: '按用户+IP', max: 5, windowSec: 60 }
        ]
    },
    {
        key: 'vm',
        label: '虚拟机',
        rules: [
            { key: 'user_vms', label: '虚拟机列表查询', hint: '按用户', max: 10, windowSec: 60 },
            { key: 'vm_status', label: '虚拟机状态查询', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'os_switch', label: '换系统操作', hint: '按用户', max: 5, windowSec: 60 },
            { key: 'os_switch_status', label: '换系统状态查询', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'provision_status', label: '开通状态查询', hint: '按用户', max: 30, windowSec: 60 }
        ]
    },
    {
        key: 'lxc',
        label: 'LXC 容器',
        rules: [
            { key: 'user_lxc', label: '容器列表查询', hint: '按用户', max: 10, windowSec: 60 },
            { key: 'lxc_status', label: '容器状态查询', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'vm_backups', label: 'VM 备份列表查询', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'lxc_backups', label: 'LXC 备份列表查询', hint: '按用户', max: 30, windowSec: 60 }
        ]
    },
    {
        key: 'backup',
        label: '备份操作',
        rules: [
            { key: 'backup_op', label: '创建备份', hint: '按用户', max: 5, windowSec: 60 },
            { key: 'restore_op', label: '恢复备份', hint: '按用户', max: 5, windowSec: 60 }
        ]
    },
    {
        key: 'disk',
        label: '磁盘操作',
        rules: [
            { key: 'disk_purchase', label: '购买磁盘', hint: '按用户', max: 2, windowSec: 60 },
            { key: 'disk_bind', label: '绑定磁盘', hint: '按用户', max: 2, windowSec: 10 },
            { key: 'disk_unbind', label: '解绑磁盘', hint: '按用户', max: 2, windowSec: 10 },
            { key: 'disk_resize', label: '扩容磁盘', hint: '按用户', max: 20, windowSec: 60 },
            { key: 'disk_destroy', label: '销毁磁盘', hint: '按用户', max: 20, windowSec: 60 },
            { key: 'disk_renew', label: '续费磁盘', hint: '按用户', max: 2, windowSec: 30 }
        ]
    },
    {
        key: 'log',
        label: '日志清理',
        rules: [
            { key: 'log_clear_op', label: '清空操作日志', hint: '按用户', max: 5, windowSec: 60 },
            { key: 'log_clear_login', label: '清空登录日志', hint: '按用户', max: 5, windowSec: 60 }
        ]
    },
    {
        key: 'other',
        label: '其他',
        rules: [
            { key: 'notification_settings', label: '通知设置保存', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'uapipro_test', label: 'UApiPro 测试查询', hint: '按用户', max: 10, windowSec: 60 },
            { key: 'random_port', label: '随机端口申请', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'subnet_create', label: '创建子网', hint: '按用户', max: 5, windowSec: 60 },
            { key: 'subnet_refresh', label: '刷新子网可用IP', hint: '按用户', max: 10, windowSec: 60 },
            { key: 'port_check', label: '端口占用检查', hint: '按用户，外呼爱快全量端口表', max: 10, windowSec: 60 },
            { key: 'port_extract_ips', label: '提取设备可用IP', hint: '按用户，外呼爱快+PVE（N+1）', max: 5, windowSec: 60 },
            { key: 'ikuai_query', label: '爱快信息查询', hint: '按用户，外呼爱快接口', max: 20, windowSec: 60 },
            { key: 'pve_test', label: 'PVE测试连接', hint: '按用户，外呼PVE API+SSH', max: 10, windowSec: 60 },
            { key: 'random_ip', label: '随机IP申请', hint: '按用户', max: 30, windowSec: 60 },
            { key: 'cdk_redeemable', label: 'CDK可兑换资源查询', hint: '按用户，外呼PVE', max: 10, windowSec: 60 },
            { key: 'terminal_open', label: '打开终端/VNC会话', hint: '按用户，消耗SSH/VNC连接', max: 10, windowSec: 60 }
        ]
    },
    {
        key: 'pay',
        label: '支付',
        rules: [
            { key: 'wallet_recharge', label: '充值下单', hint: '按用户，外呼支付网关', max: 5, windowSec: 60 }
        ]
    }
];

// 拍平映射：ruleKey → 规则定义（运行时查表 / 保存校验白名单直接使用）
var RATE_LIMIT_RULES = {};
RATE_LIMIT_CATEGORIES.forEach(function(cat) {
    cat.rules.forEach(function(rule) {
        RATE_LIMIT_RULES[rule.key] = rule;
    });
});

// ==================== 便捷函数（保留各调用点原有回退语义） ====================

/**
 * 周期 → 天数，非法周期回退 30（与原内联三元表达式语义一致）
 * @param {string} period - month/quarter/year
 * @returns {number} 天数
 */
function getPeriodDays(period) {
    return PERIOD_DAYS[period] || 30;
}

/**
 * 周期 → 月数，非法周期回退 1（与原内联三元表达式语义一致）
 * @param {string} period - month/quarter/year
 * @returns {number} 月数
 */
function getPeriodMonths(period) {
    return PERIOD_MONTHS[period] || 1;
}

/**
 * 周期 → 中文单位，非法周期回退「个月」
 * @param {string} period - month/quarter/year
 * @returns {string} 中文单位
 */
function getPeriodUnit(period) {
    return PERIOD_UNITS[period] || '个月';
}

/**
 * 周期 → 中文名称，非法周期回退「年付」
 * @param {string} period - month/quarter/year
 * @returns {string} 中文名称
 */
function getPeriodName(period) {
    return PERIOD_NAMES[period] || '年付';
}

module.exports = {
    VALID_PERIODS,
    MAX_PERIOD_COUNT,
    PERIOD_DAYS,
    PERIOD_MONTHS,
    PERIOD_UNITS,
    PERIOD_NAMES,
    DISK_TYPES,
    DISK_FORMATS,
    ORDER_STATUS,
    TEMPLATE_STATUS,
    PAYMENT_METHODS,
    UI_TEMPLATES,
    RATE_LIMIT_CATEGORIES,
    RATE_LIMIT_RULES,
    getPeriodDays,
    getPeriodMonths,
    getPeriodUnit,
    getPeriodName,
};
