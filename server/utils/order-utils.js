var crypto = require('crypto');
// 单一来源：周期映射统一走 constants（规范第七节，禁止业务文件重复定义）
var { getPeriodMonths } = require('../constants');

function calculateAmount(monthlyPrice, period, periodCount, quarterlyDiscount, yearlyDiscount) {
  var months = getPeriodMonths(period);
  var baseAmount = (monthlyPrice || 0) * months * Math.max(0, parseInt(periodCount) || 0);
  var discount = 0;
  if (period === 'quarter' && quarterlyDiscount) {
    discount = Math.min(Math.max(parseInt(quarterlyDiscount) || 0, 0), 100);
  } else if (period === 'year' && yearlyDiscount) {
    discount = Math.min(Math.max(parseInt(yearlyDiscount) || 0, 0), 100);
  }
  return parseFloat((baseAmount * (1 - discount / 100)).toFixed(2));
}

/**
 * 兼容转发：deductBalance 已迁移至 services/billing.js（规范第七节：业务进 services）
 * 此处行内懒加载转发保持旧 API 形状，避免顶层 require 与 billing 形成循环依赖
 * @param {number} userId - 用户 ID
 * @param {number} amount - 扣款金额
 * @param {object} dbInstance - db 聚合入口
 * @returns {Promise<{balanceBefore: number, balanceAfter: number}>}
 */
async function deductBalance(userId, amount, dbInstance) {
  return require('../services/billing').deductBalance(userId, amount, dbInstance);
}

async function setVmAffinity(vmid, affinityValue) {
  // PVE API 对 affinity 参数有权限检查 bug（API Token 用户名带 realm 后缀 "@pam",
  // 但 PVE 比较的是裸 "root" 字符串），导致即使是 root 的 API Token 也无法设置 affinity。
  // 解决方法：通过 SSH 直接执行 qm set 命令绕过 API 层的权限检查。
  var { execSSH, getPveSshConfig } = require('../api/ssh-exec');
  var sshConfig = await getPveSshConfig();
  if (!sshConfig.host || !sshConfig.password) {
    throw new Error('SSH 配置不完整，无法设置 CPU 亲和性（请在面板管理后台 > 系统设置 > PVE节点设置 中配置）');
  }
  if (!affinityValue || !/^[0-9,\-]+$/.test(affinityValue)) {
    throw new Error('无效的 CPU 亲和性值');
  }
  var cmd = 'qm set ' + parseInt(vmid) + ' --affinity ' + affinityValue;
  var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd, 600000, sshConfig.port);
  if (result.code !== 0) {
    throw new Error('SSH 设置 CPU 亲和性失败: ' + (result.stderr || result.stdout));
  }
  return result;
}

/**
 * 统一订单号生成（所有类型统一含秒，保证格式一致）
 * - 前缀 + YYYYMMDDHHmmss + 8位随机数
 * @param {string} category - vm/lxc/disk(DD) / refund(TK) / alipay(ZFB) / wxpay(WX) / syspay(SYSPAY)
 * @returns {string} 订单号
 */
function generateOrderNo(category) {
    var specialPrefixes = { refund: 'TK', alipay: 'ZFB', wxpay: 'WX', syspay: 'SYSPAY' };
    var now = new Date();
    var rand = String(crypto.randomBytes(4).readUInt32BE(0) % 100000000).padStart(8, '0');
    var ts = String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    var prefix = specialPrefixes[category] || 'DD';
    return prefix + ts + rand;
}

module.exports = { getPeriodMonths, calculateAmount, deductBalance, setVmAffinity, generateOrderNo };
