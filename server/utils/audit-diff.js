// server/utils/audit-diff.js - 更新类操作审计字段级 diff 通用工具（单一来源）
// 规范（第十一节）：审计详情从 DB 新旧状态 diff 生成，不从请求体拼接；
// 更新前取旧记录 → 更新 → 取新记录 → 字段级 diff（只记实际变更字段，无变化不写审计）。
// 所有更新/配置保存类接口的审计 diff 统一走本工具，禁止各自手写比较逻辑。
// utils 叶子层：仅依赖自身，无顶层 require。

'use strict';

// 字段定义：{ key, label, num?（数值归一比较，防 DECIMAL "100.00" vs 100 误报）, bool?（是/否，防 1/true/'1' 形态差异误报）, fmt?（自定义显示） }
function normalize(v) {
    if (v === null || v === undefined || v === '') return null;
    return v;
}

function normBool(v) {
    return (v === true || v === 1 || v === '1') ? '1' : '0';
}

function fieldChanged(def, oldV, newV) {
    if (def.bool) return normBool(oldV) !== normBool(newV);
    if (def.num) {
        var o = normalize(oldV), n = normalize(newV);
        if (o === null || n === null) return o !== n;
        return Number(o) !== Number(n);
    }
    var os = normalize(oldV), ns = normalize(newV);
    if (os === null || ns === null) return os !== ns;
    return String(os) !== String(ns);
}

function fmtValue(def, v) {
    if (v === null || v === undefined || v === '') return '无';
    if (def.bool) return normBool(v) === '1' ? '是' : '否';
    if (typeof def.fmt === 'function') return def.fmt(v);
    return String(v);
}

/**
 * 新旧记录字段级 diff
 * @param {Object|null} oldRecord - 更新前的 DB 记录
 * @param {Object|null} newRecord - 更新后的 DB 记录（null 时视为全字段变化为「无」，调用方应避免传入）
 * @param {Array} fieldDefs - 字段定义数组（key/label/num/bool/fmt）
 * @returns {string[]} 变更项数组，如 ['名称: A→B', '启用: 否→是']；无变化返回 []
 */
function buildFieldDiff(oldRecord, newRecord, fieldDefs) {
    var changes = [];
    if (!Array.isArray(fieldDefs)) return changes;
    fieldDefs.forEach(function (def) {
        if (!def || !def.key) return;
        var oldV = oldRecord ? oldRecord[def.key] : undefined;
        var newV = newRecord ? newRecord[def.key] : undefined;
        if (fieldChanged(def, oldV, newV)) {
            changes.push(def.label + ' ' + fmtValue(def, oldV) + '→' + fmtValue(def, newV));
        }
    });
    return changes;
}

module.exports = { buildFieldDiff };
