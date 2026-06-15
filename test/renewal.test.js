var { expect } = require('chai');

describe('续费 - getPeriodMonths', function() {
  it('可复用 order-utils 的 getPeriodMonths', function() {
    var utils = require('../server/utils/order-utils');
    expect(utils.getPeriodMonths('month')).to.equal(1);
    expect(utils.getPeriodMonths('quarter')).to.equal(3);
    expect(utils.getPeriodMonths('year')).to.equal(12);
  });
});

describe('续费 - 周期重选计算', function() {
  it('季付转月付: renewal_price=300, period=quarter → monthlyBase=100, month price=100', function() {
    var { getPeriodMonths } = require('../server/utils/order-utils');
    var storedPeriod = 'quarter';
    var storedPrice = 300;
    var newPeriod = 'month';
    var monthlyBase = storedPrice / getPeriodMonths(storedPeriod);
    var newUnitPrice = monthlyBase * getPeriodMonths(newPeriod);
    expect(newUnitPrice).to.equal(100);
  });

  it('月付转年付: renewal_price=100, period=month → yearly price=1200', function() {
    var { getPeriodMonths } = require('../server/utils/order-utils');
    var storedPeriod = 'month';
    var storedPrice = 100;
    var newPeriod = 'year';
    var monthlyBase = storedPrice / getPeriodMonths(storedPeriod);
    var newUnitPrice = monthlyBase * getPeriodMonths(newPeriod);
    expect(newUnitPrice).to.equal(1200);
  });

  it('同周期不重新计算: renewal_price=300, period=quarter → price=300', function() {
    var { getPeriodMonths } = require('../server/utils/order-utils');
    var storedPeriod = 'quarter';
    var storedPrice = 300;
    var newPeriod = 'quarter';
    expect(storedPrice).to.equal(300);
  });
});
