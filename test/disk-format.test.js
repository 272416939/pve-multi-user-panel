var { expect } = require('chai');

describe('formatBytes 进制一致性', function() {
  function formatBytes(bytes, binary) {
    if (!bytes) return '0 B';
    var units, divisor;
    if (binary) {
      units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
      divisor = 1024;
    } else {
      units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
      divisor = 1000;
    }
    let unitIndex = 0;
    let value = bytes;
    while (value >= divisor && unitIndex < units.length - 1) {
      value /= divisor;
      unitIndex++;
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + ' ' + units[unitIndex];
  }

  it('1024进制: 42.9 GiB 应显示 42.9 GiB', function() {
    var bytes = 42.9 * 1024 * 1024 * 1024;
    var result = formatBytes(bytes, true);
    expect(result).to.match(/^42\.\d+ GiB$/);
  });

  it('1000进制: 42.95 GB 应显示 43.0 GB（1位小数，四舍五入）', function() {
    var bytes = 42.95 * 1000 * 1000 * 1000;
    var result = formatBytes(bytes, false);
    expect(result).to.equal('43.0 GB');
  });

  it('不传binary参数兼容旧行为（1000进制）', function() {
    var bytes = 10500;
    var result = formatBytes(bytes);
    expect(result).to.equal('10.5 KB');
  });

  it('列表内联计算: 46071880448字节 / 1073741824 = 42.9 GB（向下取整）', function() {
    var maxdisk = 46071880448;
    var gb = Math.round(maxdisk / 1073741824 * 10) / 10;
    expect(gb).to.equal(42.9);
  });

  it('列表和详情结果应匹配: 同一 maxdisk 在两种进制下显示的整数部分一致', function() {
    var maxdisk = 46071880448;
    var listValue = Math.round(maxdisk / 1073741824 * 10) / 10;
    var detailValue = parseFloat(formatBytes(maxdisk, true).split(' ')[0]);
    expect(Math.floor(detailValue)).to.equal(Math.floor(listValue));
  });

  it('0 bytes 应显示 0 B 无论进制', function() {
    expect(formatBytes(0, true)).to.equal('0 B');
    expect(formatBytes(0, false)).to.equal('0 B');
    expect(formatBytes(null, true)).to.equal('0 B');
    expect(formatBytes(undefined, false)).to.equal('0 B');
  });

  it('小数值 500 bytes 应正确显示', function() {
    expect(formatBytes(500, true)).to.equal('500 B');
    expect(formatBytes(500, false)).to.equal('500 B');
  });

  it('1023 bytes (二进制) 应显示 1023 B', function() {
    expect(formatBytes(1023, true)).to.equal('1023 B');
  });

  it('1024 bytes (二进制) 应显示 1.00 KiB（2位小数）', function() {
    expect(formatBytes(1024, true)).to.equal('1.00 KiB');
  });

  it('999 bytes (十进制) 应显示 999 B', function() {
    expect(formatBytes(999, false)).to.equal('999 B');
  });

  it('1000 bytes (十进制) 应显示 1.00 KB（2位小数）', function() {
    expect(formatBytes(1000, false)).to.equal('1.00 KB');
  });

  it('GiB显示应与列表GB整数一致: 46071880448 → 列表42.9 GB, 详情42.9 GiB', function() {
    var maxdisk = 46071880448;
    var listGb = Math.round(maxdisk / 1073741824 * 10) / 10;
    var detailGiB = parseFloat(formatBytes(maxdisk, true).split(' ')[0]);
    expect(listGb).to.equal(42.9);
    expect(detailGiB).to.equal(42.9);
  });
});
