// scripts/check-coupling.js - 低耦合高内聚自动化断言（每批验收门禁 C）
// 规范第七节：常量单一来源 / 无自引用 / DDL 集中 / 时间合规 / utils 叶子层 / 无循环依赖 / 事务统一
// 用法：node scripts/check-coupling.js   （退出码 0=通过，1=有违规）
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SERVER = path.join(ROOT, 'server');

function walk(dir, out = []) {
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name);
        if (fs.statSync(p).isDirectory()) {
            if (name === 'node_modules') continue;
            walk(p, out);
        } else if (name.endsWith('.js')) {
            out.push(p);
        }
    }
    return out;
}

const files = walk(SERVER);
let errors = [];

function rel(p) { return path.relative(ROOT, p).replace(/\\/g, '/'); }

// ==================== 1. 常量单一来源 ====================
const SINGLE_SOURCE_CONSTANTS = ['VALID_PERIODS', 'DISK_TYPES', 'DISK_FORMATS', 'ORDER_STATUS', 'TEMPLATE_STATUS', 'PAYMENT_METHODS'];
const constantsFile = path.join(SERVER, 'constants.js');
const constantsSrc = fs.readFileSync(constantsFile, 'utf8');
for (const c of SINGLE_SOURCE_CONSTANTS) {
    for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        // 定义（= 赋值），排除 require 解构、注释、strings 里的引用
        const re = new RegExp('(?:var|const|let)\\s+' + c + '\\s*=\\s*\\[', 'g');
        const m = src.match(re);
        if (m && rel(f) !== 'server/constants.js') {
            errors.push(`常量 ${c} 在 ${rel(f)} 重复定义（单一来源应只在 server/constants.js）`);
        }
    }
}

// ==================== 2. 无 module.exports 内部自引用 ====================
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i].trim();
        // 违规形式：模块内部【调用】自己导出的函数 module.exports.xxx(
        // 追加导出（module.exports.xxx = ...）本身合法，不在禁止之列
        if (/module\.exports\.[A-Za-z_$][\w$]*\s*\(/.test(ln)) {
            errors.push(`module.exports 内部自引用（规范禁止）: ${rel(f)}:${i + 1}`);
        }
    }
}

// ==================== 3. DDL 集中（仅 db-schema.js） ====================
const DDL_RE = /CREATE\s+TABLE|ALTER\s+TABLE|CREATE\s+INDEX|DROP\s+TABLE|DROP\s+INDEX/;
for (const f of files) {
    if (rel(f) === 'server/api/db-schema.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    // 跳过注释行
    const codeLines = src.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'));
    if (codeLines.some(l => DDL_RE.test(l))) {
        errors.push(`散落 DDL（应集中在 db-schema.js）: ${rel(f)}`);
    }
}

// ==================== 4. 时间合规（toISOString 仅 2 处合法） ====================
const ALLOWED_ISO = [
    'server/api/db-core.js',   // mysqlNow 自身实现
    'server/server.js'         // 健康检查返回 UTC ISO
];
for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const trimmed = ln.trim();
        // 忽略注释行与注释说明
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
        if (/\.toISOString\(\)/.test(ln) || /toISOString\(\)\.slice/.test(ln)) {
            const r = rel(f);
            if (!ALLOWED_ISO.includes(r)) {
                errors.push(`toISOString 直写（应走 mysqlNow/formatLocalDate）: ${r}:${i + 1}`);
            }
        }
    }
}

// ==================== 5. utils 层叶子（无顶层 require ../api、../services） ====================
const utilsDir = path.join(SERVER, 'utils');
for (const f of fs.readdirSync(utilsDir).filter(n => n.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(utilsDir, f), 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) continue;
        // 列 0 的顶层 require 才算（函数体内缩进的懒加载不违规）
        if (/^\s{0}/.test(lines[i]) && !lines[i].startsWith(' ') && !lines[i].startsWith('\t') &&
            /require\(['"]\.\.\/(api|services)\//.test(trimmed)) {
            errors.push(`utils 顶层依赖 api/services（应行内懒加载）: server/utils/${f}:${i + 1}`);
        }
    }
}

// ==================== 6. 事务统一（pool.getConnection 仅 with-transaction.js） ====================
for (const f of files) {
    if (rel(f) === 'server/utils/with-transaction.js') continue;
    const src = fs.readFileSync(f, 'utf8');
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('//')) continue;
        if (/pool\.getConnection\(\)|getPool\(\)\.getConnection\(\)/.test(lines[i])) {
            errors.push(`手动 getConnection（应走 withTransaction）: ${rel(f)}:${i + 1}`);
        }
    }
}

// ==================== 7. 无顶层循环依赖（模块图 DFS） ====================
const REQ_RE = /require\(['"](\.[^'"]+)['"]\)/g;
function resolve(from, spec) {
    const base = path.resolve(path.dirname(from), spec);
    try {
        if (fs.statSync(base).isFile()) return base;
        if (fs.statSync(base + '.js').isFile()) return base + '.js';
    } catch (e) {}
    return null;
}
// 只跟踪顶层 require（缩进 < 4）
function topRequires(file) {
    const src = fs.readFileSync(file, 'utf8');
    const out = [];
    for (const line of src.split('\n')) {
        if (line.trim().startsWith('//')) continue;
        if (line.startsWith('    ') || line.startsWith('\t')) continue;
        REQ_RE.lastIndex = 0;
        const m = REQ_RE.exec(line);
        if (m) {
            const r = resolve(file, m[1]);
            if (r && r.startsWith(SERVER)) out.push(r);
        }
    }
    return out;
}
// DFS 找环（只报环上文件）
const visiting = new Set();
const visited = new Set();
const stack = [];
function hasCycle(file) {
    if (visiting.has(file)) {
        // 输出环路径
        const start = stack.indexOf(file);
        const cycle = stack.slice(start).concat(file).map(rel);
        errors.push(`顶层 require 循环依赖: ${cycle.join(' → ')}`);
        return true;
    }
    if (visited.has(file)) return false;
    visiting.add(file);
    stack.push(file);
    for (const dep of topRequires(file)) {
        if (hasCycle(dep)) { /* 已报 */ }
    }
    stack.pop();
    visiting.delete(file);
    visited.add(file);
    return false;
}
for (const f of files) hasCycle(f);

// ==================== 输出 ====================
if (errors.length > 0) {
    console.error('❌ 低耦合断言失败（' + errors.length + ' 项）：');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
}
console.log('✅ check-coupling 全部通过：常量单一来源 / 无自引用 / DDL 集中 / 时间合规 / utils 叶子层 / 事务统一 / 无循环依赖');
