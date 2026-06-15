var { expect } = require('chai');

describe('LXC 模板 MySQL INSERT 参数数量', function() {
  it('INSERT 的列数和 VALUES 占位符数量应一致', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    // 提取 lxcTemplates create 的 INSERT SQL
    var match = source.match(/INSERT INTO lxc_templates \(([^)]+)\)\s+VALUES \(([^)]+)\)/);
    expect(match, '应找到 lxc_templates INSERT 语句').to.exist;

    var columns = match[1].split(',').map(function(c) { return c.trim(); });
    var placeholders = match[2].split(',').map(function(p) { return p.trim(); });

    expect(columns.length, '列数量与占位符数量应一致').to.equal(placeholders.length);
    expect(columns.length, '应包含 mac_group_id 列').to.be.at.least(15);
  });
});
