// server/utils/logger.js - 统一日志工具
// 覆盖全局 console.log/warn/error，自动添加时间戳和前缀
// 格式：2026/07/19 11:13:23 [日志] xxx
//       2026/07/19 11:13:23 [DEBUG] xxx
//       2026/07/19 11:13:23 [警告] xxx
//       2026/07/19 11:13:23 [错误] xxx
//
// 用法：在 server.js 最顶部 require('./utils/logger') 即可全局生效
// 显式调用：require('./utils/logger').debug('xxx') / .info('xxx') / .warn('xxx') / .error('xxx')

var DEBUG = process.env.DEBUG === 'true';

// 时间格式化：2026/07/19 11:13:23
function timestamp() {
  var d = new Date();
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) +
    ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

// 多参数拼接（支持 console.log('a', 'b', {c:1}) 风格）
function joinArgs(args) {
  var parts = [];
  for (var i = 0; i < args.length; i++) {
    var a = args[i];
    if (a instanceof Error) {
      parts.push(a.stack || a.message);
    } else if (typeof a === 'object') {
      try { parts.push(JSON.stringify(a)); } catch (e) { parts.push(String(a)); }
    } else {
      parts.push(String(a));
    }
  }
  return parts.join(' ');
}

var logger = {
  debug: function() {
    if (!DEBUG) return;
    process.stdout.write(timestamp() + ' [DEBUG] ' + joinArgs(arguments) + '\n');
  },
  info: function() {
    process.stdout.write(timestamp() + ' [日志] ' + joinArgs(arguments) + '\n');
  },
  warn: function() {
    process.stderr.write(timestamp() + ' [警告] ' + joinArgs(arguments) + '\n');
  },
  error: function() {
    process.stderr.write(timestamp() + ' [错误] ' + joinArgs(arguments) + '\n');
  }
};

// 保存原始 console 方法
var origLog = console.log;
var origWarn = console.warn;
var origError = console.error;

// 覆盖全局 console，自动添加时间戳和前缀
// console.log -> [日志]（日常信息）
// console.warn -> [警告]
// console.error -> [错误]
// DEBUG 模式下，含 [disk-import]/[disk-expiry] 等调试日志通过 logger.debug 输出
console.log = function() {
  process.stdout.write(timestamp() + ' [日志] ' + joinArgs(arguments) + '\n');
};
console.warn = function() {
  process.stderr.write(timestamp() + ' [警告] ' + joinArgs(arguments) + '\n');
};
console.error = function() {
  process.stderr.write(timestamp() + ' [错误] ' + joinArgs(arguments) + '\n');
};

// 暴露原始方法（特殊场景需要裸输出时使用）
logger.raw = {
  log: origLog,
  warn: origWarn,
  error: origError
};

module.exports = logger;
module.exports.timestamp = timestamp;
module.exports.isDebug = function() { return DEBUG; };
