var { expect } = require('chai');
var fs = require('fs');
var path = require('path');

var pagePath = path.join(__dirname, '..', 'public', 'js', 'user-center-page.js');
var src = fs.readFileSync(pagePath, 'utf8');

/**
 * Bug 复现：切换到「交易流水」/「我的订单」tab 时数据丢失，需点重置才显示
 *
 * 根因：switchSubTab 仅设置 activeSubTab，数据加载完全依赖 watch(activeSubTab)。
 * 在某些场景下（如初次挂载、watch 触发时机竞态）watch 未触发 loadTx/loadMyOrders，
 * 导致表格无数据。
 *
 * 参考正确实现（admin/core.js）：watch($.activeTab) 内显式调用 loadTransactions(1)/loadOrders(1)
 *
 * 期望：switchSubTab 函数内部应显式 await loadTx(1) / loadMyOrders(1)
 */
describe('user-center 交易流水/我的订单切换 tab 数据加载（Bug: 切换 tab 数据丢失）', function() {
  // 提取 switchSubTab 函数体（支持 const arrow + function 两种声明形式）
  function getSwitchSubTabBody(s) {
    var m = s.match(/switchSubTab\s*=\s*(?:async\s*)?(?:function\s*\([^)]*\)|\([^)]*\)\s*=>)\s*\{([\s\S]*?)\n\s{8}\};/);
    return m ? m[1] : null;
  }

  it('switchSubTab 应显式调用 loadTx（wallet-transactions）', function() {
    var body = getSwitchSubTabBody(src);
    expect(body, 'switchSubTab 函数应存在').to.not.be.null;
    expect(body, 'switchSubTab 应在 wallet-transactions 分支调用 loadTx').to.match(/loadTx\s*\(/);
  });

  it('switchSubTab 应显式调用 loadMyOrders（orders）', function() {
    var body = getSwitchSubTabBody(src);
    expect(body, 'switchSubTab 函数应存在').to.not.be.null;
    expect(body, 'switchSubTab 应在 orders 分支调用 loadMyOrders').to.match(/loadMyOrders\s*\(/);
  });

  it('switchSubTab 中 wallet-transactions 分支应使用 await 确保数据加载完成', function() {
    var body = getSwitchSubTabBody(src);
    expect(body, 'switchSubTab 函数应存在').to.not.be.null;
    expect(body, 'switchSubTab 应在 wallet-transactions 分支 await loadTx').to.match(/wallet-transactions['"]?\s*[\)\}][\s\S]*?await\s+loadTx/);
  });

  it('switchSubTab 中 orders 分支应使用 await 确保数据加载完成', function() {
    var body = getSwitchSubTabBody(src);
    expect(body, 'switchSubTab 函数应存在').to.not.be.null;
    expect(body, 'switchSubTab 应在 orders 分支 await loadMyOrders').to.match(/orders['"]?\s*[\)\}][\s\S]*?await\s+loadMyOrders/);
  });
});

/**
 * Bug 复现：模板中 loadMyOrders() 在 switchSubTab('orders') 之后被重复调用，
 * 导致双重 fetch 竞态（模板侧同步触发 + watch 异步触发）
 * 期望：模板中只调用 switchSubTab，不在模板中重复调用 loadMyOrders
 */
describe('user-center 模板避免重复触发 loadMyOrders（Bug: 模板中重复调用导致竞态）', function() {
  var tmplPath = path.join(__dirname, '..', 'public', 'js', 'user-center-template.js');
  var tmpl = fs.readFileSync(tmplPath, 'utf8');

  it('orders nav 点击事件不应在 switchSubTab 后重复 loadMyOrders', function() {
    // 查找 switchSubTab('orders') 后是否还跟着 loadMyOrders
    var bad = /switchSubTab\(['"]orders['"]\)\s*;\s*loadMyOrders\(\)/;
    expect(bad.test(tmpl), '模板中不应在 switchSubTab("orders") 后重复调用 loadMyOrders()').to.be.false;
  });

  it('wallet-transactions nav 点击事件应在 switchSubTab 后由 switchSubTab 负责加载', function() {
    // 验证 wallet-transactions 点击只调用 switchSubTab
    var m = tmpl.match(/switchSubTab\(['"]wallet-transactions['"]\)/);
    expect(m, 'wallet-transactions 点击应调用 switchSubTab').to.not.be.null;
  });
});
