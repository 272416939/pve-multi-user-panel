// server/utils/disk-billing.js - 磁盘计费计算（纯函数）
// 规范第七节：纯工具进 utils/，不依赖 api/services 层
// 自 utils/disk-utils.js 拆分：计费计算（依赖 utils/order-utils.calculateAmount）

var { calculateAmount } = require('./order-utils');

// ==================== 计费计算 ====================
// 参照文档 8.4 节：复用 calculateAmount，price_per_gb * capacity 作为 monthlyPrice
function calcDiskAmount(spec, capacityGb, period, periodCount) {
  var monthlyPrice = parseFloat(spec.price_per_gb) * parseInt(capacityGb);
  return calculateAmount(
    monthlyPrice,
    period,
    periodCount,
    parseInt(spec.quarterly_discount) || 0,
    parseInt(spec.yearly_discount) || 0
  );
}

// 续费金额（使用磁盘购买时的价格快照）
function calcRenewAmount(disk, period, periodCount) {
  var monthlyPrice = parseFloat(disk.price_per_gb) * parseInt(disk.capacity_gb);
  return calculateAmount(
    monthlyPrice,
    period,
    periodCount,
    parseInt(disk.quarterly_discount) || 0,
    parseInt(disk.yearly_discount) || 0
  );
}

/**
 * 计算扩容费用
 * 新增容量 × 每GiB月单价 ÷ 30 × 剩余天数（按天折算）
 * @param {number} oldSizeGb - 当前容量 GiB
 * @param {number} newSizeGb - 新容量 GiB
 * @param {number} pricePerGb - 月每GiB单价
 * @param {string|Date} expireTime - 当前到期时间
 * @returns {number} 扩容费用，-1 表示已过期
 */
function calcResizeAmount(oldSizeGb, newSizeGb, pricePerGb, expireTime) {
  var diffGb = newSizeGb - oldSizeGb;
  if (diffGb <= 0 || pricePerGb <= 0) return 0;
  var now = new Date();
  var expire = new Date(expireTime);
  if (expire <= now) return -1;
  var diffMs = expire - now;
  var diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  var amount = (diffGb * pricePerGb / 30) * diffDays;
  return parseFloat(amount.toFixed(2));
}

module.exports = {
  calcDiskAmount,
  calcRenewAmount,
  calcResizeAmount,
};
