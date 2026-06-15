var { expect } = require('chai');
var fs = require('fs');

describe('dashboard.html Vue 模板中 $ 使用规范', function() {
  it('LXC续费按钮不应使用 $.openRenewModal（Vue模板中 $ 是组件实例）', function() {
    var html = fs.readFileSync('e:\\code\\pve管理面板\\public\\dashboard.html', 'utf8');
    expect(html).to.not.match(/\$\.openRenewModal/);
  });
});
