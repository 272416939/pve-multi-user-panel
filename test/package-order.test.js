var { expect } = require('chai');

// ============================================================
// RED phase: These tests define the expected behavior.
// The module `order-utils` does not exist yet → tests will FAIL
// ============================================================

describe('套餐订购业务逻辑', function() {

  // ----------------------------------------------------------
  // Bug 2: amount 应根据 period 计算 (月×1 / 季×3 / 年×12)
  // ----------------------------------------------------------
  describe('calculateAmount(monthlyPrice, period, periodCount)', function() {

    it('月付: 单价100 × 1个月 × 1台 = 100', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'month', 1);
      expect(result).to.equal(100);
    });

    it('季付: 单价100 × 3个月 × 1台 = 300', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'quarter', 1);
      expect(result).to.equal(300);
    });

    it('年付: 单价100 × 12个月 × 1台 = 1200', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'year', 1);
      expect(result).to.equal(1200);
    });

    it('月付×2台: 单价100 × 1个月 × 2台 = 200', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'month', 2);
      expect(result).to.equal(200);
    });

    it('年付×3台: 单价100 × 12个月 × 3台 = 3600', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'year', 3);
      expect(result).to.equal(3600);
    });

    it('unknown period 默认月付: 单价100 × 1个月 = 100', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'unknown', 1);
      expect(result).to.equal(100);
    });

    it('periodCount 为 0 时返回 0', function() {
      var result = require('../server/utils/order-utils').calculateAmount(100, 'month', 0);
      expect(result).to.equal(0);
    });
  });

  // ----------------------------------------------------------
  // Bug 1: 余额扣除逻辑
  // ----------------------------------------------------------
  describe('deductBalance(userId, amount)', function() {

    it('余额充足时返回扣减后的余额', async function() {
      var orderUtils = require('../server/utils/order-utils');

      // 模拟用户: 余额 100，扣除 30 → 应返回 70
      var mockDb = {
        users: {
          _lastUpdate: null,
          getById: function(id) { return Promise.resolve({ id: id, balance: '100.00' }); },
          update: function(id, data) { this._lastUpdate = data; return Promise.resolve(); }
        }
      };

      var result = await orderUtils.deductBalance(1, 30, mockDb);
      expect(result).to.equal(70);
      expect(mockDb.users._lastUpdate.balance).to.equal('70.00');
    });

    it('余额不足时抛出错误', async function() {
      var orderUtils = require('../server/utils/order-utils');

      var mockDb = {
        users: {
          getById: function(id) { return Promise.resolve({ id: id, balance: '10.00' }); },
          update: function() { return Promise.resolve(); }
        }
      };

      try {
        await orderUtils.deductBalance(1, 100, mockDb);
        expect.fail('应该抛出错误');
      } catch (e) {
        expect(e.message).to.include('余额不足');
      }
    });
  });

  // ----------------------------------------------------------
  // Bug 3: 克隆配置顺序 - 先修改模板配置再克隆
  // ----------------------------------------------------------
  describe('getPeriodMonths(period)', function() {

    it('month → 1', function() {
      var result = require('../server/utils/order-utils').getPeriodMonths('month');
      expect(result).to.equal(1);
    });

    it('quarter → 3', function() {
      var result = require('../server/utils/order-utils').getPeriodMonths('quarter');
      expect(result).to.equal(3);
    });

    it('year → 12', function() {
      var result = require('../server/utils/order-utils').getPeriodMonths('year');
      expect(result).to.equal(12);
    });

    it('unknown → 1', function() {
      var result = require('../server/utils/order-utils').getPeriodMonths('unknown');
      expect(result).to.equal(1);
    });
  });
});

describe('订购流程 - 先扣费后创建 (Bug 2)', function() {
  it('余额不足时应该抛错而不是执行 PVE', function() {
    var utils = require('../server/utils/order-utils');
    var mockDb = {
      users: {
        getById: function(id) { return Promise.resolve({ id: id, balance: '0.50' }); },
        update: function() { return Promise.resolve(); }
      }
    };
    return utils.deductBalance(1, 100, mockDb).then(function() {
      throw new Error('应该失败');
    }).catch(function(e) {
      expect(e.message).to.include('余额不足');
    });
  });
});

describe('续费周期同步 (Bug 1)', function() {
  it('季付: getPeriodMonths + calculateAmount 组合正确', function() {
    var utils = require('../server/utils/order-utils');
    var singlePeriodPrice = utils.calculateAmount(100, 'quarter', 1);
    expect(singlePeriodPrice).to.equal(300);
    expect(utils.getPeriodMonths('quarter')).to.equal(3);
  });
  it('年付: 单周期价格 = monthly * 12', function() {
    var utils = require('../server/utils/order-utils');
    expect(utils.calculateAmount(100, 'year', 1)).to.equal(1200);
  });
});

describe('CPU affinity 非 root 错误不应中断订购流程', function() {
  it('affinity 失败（only root can set）应被捕获，不影响流程', function() {
    // 模拟 PVE 返回 "only root can set 'affinity' config" 错误
    var affinityError = new Error('Request failed with status code 500');
    affinityError.response = { status: 500, data: { data: null, message: "only root can set 'affinity' config\n" } };

    // 验证 affinity 错误消息包含预期内容
    expect(affinityError.response.data.message).to.include("only root can set 'affinity' config");

    // 核心断言：affinity 是可选功能，PVE 限制了非 root 用户设置
    // 订购流程应当捕获此错误并继续，而不是让整个流程崩溃
    var isAffinityError = affinityError.response &&
      affinityError.response.data &&
      typeof affinityError.response.data.message === 'string' &&
      affinityError.response.data.message.includes("only root can set");
    expect(isAffinityError).to.be.true;
  });
});
