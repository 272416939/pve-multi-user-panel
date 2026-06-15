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
  var user = await dbInstance.users.getById(userId);
  var balance = parseFloat(user.balance || '0');
  if (balance < amount) {
    throw new Error('余额不足');
  }
  var newBalance = balance - amount;
  await dbInstance.users.update(userId, { balance: newBalance.toFixed(2) });
  return newBalance;
}

module.exports = { getPeriodMonths, calculateAmount, deductBalance };
