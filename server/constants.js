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
    getPeriodDays,
    getPeriodMonths,
    getPeriodUnit,
    getPeriodName,
};
