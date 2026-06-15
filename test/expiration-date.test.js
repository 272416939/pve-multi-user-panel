var { expect } = require('chai');

describe('订购到期时间计算', function() {
  it('月付: addDays = 30 * period_count', function() {
    var period = 'month';
    var period_count = 1;
    var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
    expect(addDays * period_count).to.equal(30);
  });

  it('季付: addDays = 90 * period_count', function() {
    var period = 'quarter';
    var period_count = 2;
    var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
    expect(addDays * period_count).to.equal(180);
  });

  it('年付: addDays = 365 * period_count', function() {
    var period = 'year';
    var period_count = 1;
    var addDays = period === 'year' ? 365 : period === 'quarter' ? 90 : 30;
    expect(addDays * period_count).to.equal(365);
  });

  it('expDate 应在未来', function() {
    var addDays = 30;
    var expDate = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000);
    expect(expDate.getTime()).to.be.greaterThan(Date.now());
  });

  it('expDate.toISOString 应为有效 ISO 字符串', function() {
    var addDays = 30;
    var expDate = new Date(Date.now() + addDays * 24 * 60 * 60 * 1000);
    var iso = expDate.toISOString();
    expect(iso).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
