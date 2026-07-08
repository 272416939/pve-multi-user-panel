var crypto = require('crypto');

function getPeriodMonths(period) {
  if (period === 'quarter') return 3;
  if (period === 'year') return 12;
  return 1;
}

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

async function deductBalance(userId, amount, dbInstance) {
  if (amount <= 0) throw new Error('扣款金额必须大于0');
  var user = await dbInstance.users.getById(userId);
  var balanceBefore = parseFloat(user.balance || '0');
  if (balanceBefore < amount) {
    throw new Error('余额不足');
  }
  var updatedUser = await dbInstance.users.incrementBalance(userId, -amount);
  var balanceAfter = parseFloat(updatedUser.balance || '0');
  return { balanceBefore: balanceBefore, balanceAfter: balanceAfter };
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
  var result = await execSSH(sshConfig.host, sshConfig.username, sshConfig.password, cmd);
  if (result.code !== 0) {
    throw new Error('SSH 设置 CPU 亲和性失败: ' + (result.stderr || result.stdout));
  }
  return result;
}

/**
 * 统一订单号生成：{前缀}{YYYYMMDDHHmm}{8位随机数字}
 * @param {string} category - vm(KTVM)/lxc(KTLXC)/refund(TK)/alipay(ZFB)/wxpay(WX)/syspay(SYSPAY)
 * @returns {string} 订单号
 */
function generateOrderNo(category) {
    var prefixes = { vm: 'KTVM', lxc: 'KTLXC', refund: 'TK', alipay: 'ZFB', wxpay: 'WX', syspay: 'SYSPAY' };
    var prefix = prefixes[category];
    if (!prefix) throw new Error('未知的订单类别: ' + category);
    var now = new Date();
    var ts = String(now.getFullYear()) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0');
    var rand = String(crypto.randomBytes(4).readUInt32BE(0) % 100000000).padStart(8, '0');
    return prefix + ts + rand;
}

module.exports = { getPeriodMonths, calculateAmount, deductBalance, setVmAffinity, generateOrderNo };
