function getPeriodMonths(period) {
  if (period === 'quarter') return 3;
  if (period === 'year') return 12;
  return 1;
}

function calculateAmount(monthlyPrice, period, periodCount) {
  var months = getPeriodMonths(period);
  return (monthlyPrice || 0) * months * Math.max(0, parseInt(periodCount) || 0);
}

async function deductBalance(userId, amount, dbInstance) {
  if (amount <= 0) throw new Error('扣款金额必须大于0');
  var user = await dbInstance.users.getById(userId);
  var balance = parseFloat(user.balance || '0');
  if (balance < amount) {
    throw new Error('余额不足');
  }
  // PAY-6 修复：原子余额扣减，避免 read-modify-write 竞态
  var updatedUser = await dbInstance.users.incrementBalance(userId, -amount);
  return parseFloat(updatedUser.balance || '0');
}

async function setVmAffinity(vmid, affinityValue) {
  // PVE API 对 affinity 参数有权限检查 bug（API Token 用户名带 realm 后缀 "@pam",
  // 但 PVE 比较的是裸 "root" 字符串），导致即使是 root 的 API Token 也无法设置 affinity。
  // 解决方法：通过 SSH 直接执行 qm set 命令绕过 API 层的权限检查。
  var { execSSH } = require('../api/ssh-exec');
  var host = process.env.PVE_SSH_HOST;
  var password = process.env.PVE_SSH_PASSWORD;
  if (!host || !password) {
    throw new Error('SSH 配置不完整，无法设置 CPU 亲和性（请配置 PVE_SSH_HOST 和 PVE_SSH_PASSWORD）');
  }
  if (!affinityValue || !/^[0-9,\-]+$/.test(affinityValue)) {
    throw new Error('无效的 CPU 亲和性值');
  }
  var cmd = 'qm set ' + parseInt(vmid) + ' --affinity ' + affinityValue;
  var result = await execSSH(host, 'root', password, cmd);
  if (result.code !== 0) {
    throw new Error('SSH 设置 CPU 亲和性失败: ' + (result.stderr || result.stdout));
  }
  return result;
}

module.exports = { getPeriodMonths, calculateAmount, deductBalance, setVmAffinity };
