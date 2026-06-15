var { expect } = require('chai');

describe('vms.create renewal_period 字段', function() {
  it('db-sqlite vms.create INSERT 应包含 renewal_period', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-sqlite.js', 'utf8');

    var match = source.match(/vms:\s*\{[\s\S]*?INSERT INTO vms \(([^)]+)\)/);
    expect(match, '应找到 vms.create INSERT').to.exist;

    var columns = match[1].split(',').map(function(c) { return c.trim(); });
    expect(columns, 'vms.create INSERT 应包含 renewal_period').to.include('renewal_period');
  });

  it('db-mysql vms.create INSERT 应包含 renewal_period', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    var match = source.match(/vms:\s*\{[\s\S]*?INSERT INTO vms \(([^)]+)\)/);
    expect(match, '应找到 vms.create INSERT').to.exist;

    var columns = match[1].split(',').map(function(c) { return c.trim(); });
    expect(columns, 'vms.create INSERT 应包含 renewal_period').to.include('renewal_period');
  });
});
