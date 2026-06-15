var { expect } = require('chai');

describe('MySQL INSERT 参数数量一致性', function() {

  var insertCases = [
    // [label, tableName]
    ['lxcPackages create', 'lxc_packages'],
  ];

  it('lxcPackages.create INSERT 的列数和 VALUES 占位符数量应一致', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    // 找到 lxcPackages.create 的 INSERT SQL
    var match = source.match(/lxcPackages:\s*\{[\s\S]*?INSERT INTO lxc_packages \(([^)]+)\)\s+VALUES \(([^)]+)\)/);
    expect(match, '应找到 lxcPackages.create 的 INSERT 语句').to.exist;

    var columns = match[1].split(',').map(function(c) { return c.trim(); });
    var placeholders = match[2].split(',').map(function(p) { return p.trim(); });

    expect(columns.length, 'lxcPackages.create: 列数量与占位符数量应一致').to.equal(placeholders.length);
  });

  it('vmPackages.create INSERT 的列数和 VALUES 占位符数量应一致', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    var match = source.match(/vmPackages:\s*\{[\s\S]*?INSERT INTO vm_packages \(([^)]+)\)\s+VALUES \(([^)]+)\)/);
    expect(match, '应找到 vmPackages.create 的 INSERT 语句').to.exist;

    var columns = match[1].split(',').map(function(c) { return c.trim(); });
    var placeholders = match[2].split(',').map(function(p) { return p.trim(); });

    expect(columns.length, 'vmPackages.create: 列数量与占位符数量应一致').to.equal(placeholders.length);
  });
});
