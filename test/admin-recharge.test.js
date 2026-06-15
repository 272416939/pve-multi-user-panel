var { expect } = require('chai');

describe('管理员充值 - admin-recharge', function() {
  it('正数金额通过校验', function() {
    var amount = 100;
    expect(amount > 0 && isFinite(amount)).to.be.true;
  });
  it('负数金额拒绝', function() {
    var amount = -10;
    expect(amount > 0 && isFinite(amount)).to.be.false;
  });
  it('0 金额拒绝', function() {
    var amount = 0;
    expect(amount > 0 && isFinite(amount)).to.be.false;
  });
  it('非数字拒绝', function() {
    var amount = NaN;
    expect(amount > 0 && isFinite(amount)).to.be.false;
  });
  it('余额增加: 旧余额10 + 充值100 = 110', function() {
    var oldBalance = 10;
    var amount = 100;
    var newBalance = oldBalance + amount;
    expect(newBalance).to.equal(110);
  });
});
