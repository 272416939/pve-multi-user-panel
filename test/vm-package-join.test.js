var { expect } = require('chai');

describe('VM 套餐 LEFT JOIN 查询', function() {

  it('db-sqlite vmPackages.getAll 应使用 LEFT JOIN 返回 template_name', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-sqlite.js', 'utf8');

    var match = source.match(/vmPackages:\s*\{[\s\S]*?getAll:\s*\(\)\s*=>\s*db\.prepare\('([^']+)'\)\.all\(\)/);
    expect(match, '应找到 vmPackages.getAll SQL').to.exist;

    var sql = match[1];
    expect(sql, 'vmPackages.getAll 应使用 LEFT JOIN').to.include('LEFT JOIN vm_templates');
    expect(sql, 'vmPackages.getAll 应包含 template_name').to.include('template_name');
  });

  it('db-sqlite vmPackages.getById 应使用 LEFT JOIN 返回 template_name', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-sqlite.js', 'utf8');

    var blockMatch = source.match(/vmPackages:\s*\{[\s\S]*?\}[\s\S]*?,\s*\/\/\s*(?:LXC|VM)/);
    expect(blockMatch, '应找到 vmPackages 代码块').to.exist;

    var block = blockMatch[0];
    var getByIdMatch = block.match(/getById:\s*\(id\)\s*=>\s*db\.prepare\('([^']+)'\)\.get\(id\)/);
    expect(getByIdMatch, 'vmPackages 代码块中应找到 getById SQL').to.exist;

    var sql = getByIdMatch[1];
    expect(sql, 'vmPackages.getById 应使用 LEFT JOIN').to.include('LEFT JOIN vm_templates');
  });

  it('db-mysql vmPackages.getAll 应使用 LEFT JOIN 返回 template_name', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    var match = source.match(/vmPackages:\s*\{[\s\S]*?getAll:\s*\(\s*\)\s*=>\s*queryAll\('([^']+)'\)/);
    expect(match, '应找到 vmPackages.getAll SQL').to.exist;

    var sql = match[1];
    expect(sql, 'vmPackages.getAll 应使用 LEFT JOIN').to.include('LEFT JOIN vm_templates');
  });

  it('db-mysql vmPackages.getById 应使用 LEFT JOIN 返回 template_name', function() {
    var fs = require('fs');
    var source = fs.readFileSync('e:\\code\\pve管理面板\\server\\api\\db-mysql.js', 'utf8');

    var blockMatch = source.match(/vmPackages:\s*\{[\s\S]*?lxcPackages:\s*\{/);
    expect(blockMatch, '应找到 vmPackages 代码块').to.exist;

    var block = blockMatch[0];
    var getByIdMatch = block.match(/getById:\s*\(id\)\s*=>\s*queryOne\('([^']+)',\s*\[id\]\)/);
    expect(getByIdMatch, 'vmPackages 代码块中应找到 getById SQL').to.exist;

    var sql = getByIdMatch[1];
    expect(sql, 'vmPackages.getById 应使用 LEFT JOIN').to.include('LEFT JOIN vm_templates');
  });
});
