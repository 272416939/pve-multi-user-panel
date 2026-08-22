/**
 * i18n 语言服务（动态语言注册 + 翻译解析 + 缓存分发）
 *
 * 解析公式（自定义语言）：显示值 = 自己的覆盖 ??（key ∈ 创建快照 ? 快照值 : 复制源系统语言文件当前值）
 * - 创建时已有词条：快照固定（复制源的在线编辑不联动，翻译起点可预测）
 * - 创建后系统新增的词条（未来功能新增 key）：自动以复制源语言文件为原始文本，
 *   不落覆盖表、不掉回 zh-CN；管理页打「新增」徽标，写入覆盖后即固定
 * 系统语言：显示值 = 内置文件值 ?? 覆盖（覆盖见 i18n_entries 表；语言文件永不写入）
 *
 * 性能：合并结果 60s 缓存（cache-store：Redis 优先 / 进程内存回退），写操作立即失效；
 * 系统语言无覆盖时前端仍走静态文件路径，本服务不参与（零新增请求）
 */
const fs = require('fs');
const path = require('path');
const cacheStore = require('../utils/cache-store');
const db = require('../api/db');
const { SYSTEM_LOCALES, LOCALE_NAMES } = require('../constants');

const localeCache = cacheStore.create('i18n:locale', 60);
const languagesCache = cacheStore.create('i18n:languages', 60);

// 内置语言文件名白名单（防路径穿越：只允许 7 个固定文件名映射，绝不使用用户输入拼接路径）
const LOCALE_FILES = {};
SYSTEM_LOCALES.forEach(function (code) {
    LOCALE_FILES[code] = path.join(__dirname, '../../public/locales', code + '.json');
});

// 逻辑 key 判定：排除含非 ASCII 的 22 条历史倒挂条目（中文原文作 key 的遗留脏数据）
function isLogicalKey(key) {
    return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(key);
}

function readLocaleFile(code) {
    const file = LOCALE_FILES[code];
    if (!file) throw new Error('未知语言: ' + code);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// snapshot JSON 列安全解析（mysql2 JSON 列可能已解析为对象或仍为字符串）
function parseSnapshot(row) {
    if (!row || !row.snapshot) return {};
    if (typeof row.snapshot === 'string') {
        try { return JSON.parse(row.snapshot) || {}; } catch (e) { return {}; }
    }
    return row.snapshot || {};
}

/**
 * 解析基线与 key 集合：
 * - 系统语言：基线 = 内置文件（过滤逻辑 key）
 * - 自定义语言：基线 = 快照 ∪ 复制源系统语言文件（快照优先；文件新增的 key 自动补底）
 */
async function resolveBaseValues(row) {
    if (row.is_system) {
        const file = readLocaleFile(row.code);
        const keys = [];
        const baseline = {};
        Object.keys(file).forEach(function (k) {
            if (!isLogicalKey(k)) return;
            keys.push(k);
            baseline[k] = file[k];
        });
        return { keys, baseline };
    }
    const snapshot = parseSnapshot(row); // 快照只含逻辑 key（创建时已过滤）
    const baseFile = readLocaleFile(row.base_code);
    const keys = [];
    const baseline = {};
    Object.keys(snapshot).forEach(function (k) {
        if (!isLogicalKey(k)) return;
        keys.push(k);
        baseline[k] = snapshot[k];
    });
    Object.keys(baseFile).forEach(function (k) {
        if (!isLogicalKey(k) || snapshot[k] !== undefined) return;
        keys.push(k);
        baseline[k] = baseFile[k]; // 创建后系统新增词条：以复制源文件为原始文本
    });
    return { keys, baseline };
}

/**
 * 语言列表（含 overrides 标志；60s 缓存）
 * @returns {Promise<Array<{code,name,base_code,is_system,overrides}>>}
 */
async function getLanguages() {
    const cached = await languagesCache.get('list', async function () {
        const rows = await db.i18n.listLanguages();
        const cntRows = await db.i18n.countOverridesByLang();
        const cntMap = {};
        cntRows.forEach(function (r) { cntMap[r.lang_code] = r.n; });
        return rows.map(function (r) {
            return {
                code: r.code,
                name: r.name,
                base_code: r.base_code,
                is_system: !!r.is_system,
                overrides: (cntMap[r.code] || 0) > 0
            };
        });
    });
    return cached || [];
}

/**
 * 动态白名单：系统语言（常量）∪ 已注册自定义语言（表）
 */
async function isSupportedLocale(code) {
    if (SYSTEM_LOCALES.indexOf(code) !== -1) return true;
    const row = await db.i18n.getLanguage(code);
    return !!(row && row.status === 'active' && !row.is_system);
}

/**
 * 语言显示名（系统语言用常量表；自定义语言用注册表 name）
 */
async function getLocaleName(code) {
    if (LOCALE_NAMES[code]) return LOCALE_NAMES[code];
    const row = await db.i18n.getLanguage(code);
    return (row && row.name) || code;
}

/**
 * 解析语言合并内容（覆盖 + 基线全量 dict；60s 缓存，写操作失效）
 * @returns {Promise<object|null>} 未知语言返回 null
 */
async function resolveLocale(code) {
    const cached = await localeCache.get(code, async function () {
        const row = await db.i18n.getLanguage(code);
        if (!row) return null;
        const { baseline } = await resolveBaseValues(row);
        const values = Object.assign({}, baseline);
        const overrides = await db.i18n.getOverrides(code);
        overrides.forEach(function (r) { values[r.entry_key] = r.value; });
        return values;
    });
    return cached;
}

/**
 * 语言基线 key 集合（管理页条目列表与保存校验共用）
 * @returns {Promise<Array<string>|null>} 未知语言返回 null
 */
async function getBaselineKeys(code) {
    const row = await db.i18n.getLanguage(code);
    if (!row) return null;
    const { keys } = await resolveBaseValues(row);
    return keys;
}

/**
 * 管理页条目列表（全部逻辑 key；original=基线值只读，value=当前生效值）
 * @returns {Promise<Array<{key,original,value,override,is_new}>|null>}
 */
async function getLocaleEntries(code) {
    const row = await db.i18n.getLanguage(code);
    if (!row) return null;
    const { keys, baseline } = await resolveBaseValues(row);
    const overrides = {};
    (await db.i18n.getOverrides(code)).forEach(function (r) { overrides[r.entry_key] = r.value; });
    const snapshot = row.is_system ? null : parseSnapshot(row);
    return keys.map(function (k) {
        const isOverride = overrides[k] !== undefined;
        return {
            key: k,
            original: baseline[k],
            value: isOverride ? overrides[k] : baseline[k],
            override: isOverride,
            is_new: !row.is_system && snapshot[k] === undefined
        };
    });
}

/**
 * 新建自定义语言（复制源限定系统语言；快照 = 源语言文件基线）
 * @returns {Promise<{code:string}>} code 生成失败（连续冲突）时抛出
 */
async function createCustomLanguage(fields) {
    const { name, base_code, createdBy } = fields;
    const base = await db.i18n.getLanguage(base_code);
    if (!base || !base.is_system) {
        throw Object.assign(new Error('复制源语言不存在或不可用'), { status: 400 });
    }
    const { baseline } = await resolveBaseValues(base);
    const snapshot = JSON.stringify(baseline);
    const customCodes = await db.i18n.listCustomCodes();
    let maxSeq = 0;
    customCodes.forEach(function (r) {
        const m = /^cst(\d+)$/.exec(r.code);
        if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
    });
    // 并发新建冲突（ER_DUP_ENTRY）时重试，最多 3 次
    for (let attempt = 0; attempt < 3; attempt++) {
        const code = 'cst' + (maxSeq + 1 + attempt);
        try {
            await db.i18n.createLanguage({
                code: code,
                name: name,
                baseCode: base_code,
                snapshot: snapshot,
                createdBy: createdBy || 0
            });
            await invalidateI18nCache();
            return { code: code };
        } catch (e) {
            if (e && e.code === 'ER_DUP_ENTRY') {
                // 序号已被并发请求占用，回读最新最大序号再重试
                const latest = await db.i18n.listCustomCodes();
                latest.forEach(function (r) {
                    const m = /^cst(\d+)$/.exec(r.code);
                    if (m) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
                });
                continue;
            }
            throw e;
        }
    }
    throw new Error('新建语言失败，请重试');
}

/**
 * 失效 i18n 缓存（语言列表 + 受影响语言的合并内容）
 * @param {string[]} [codes] - 受影响语言；省略则清空全部 locale 缓存
 */
async function invalidateI18nCache(codes) {
    await languagesCache.del('list');
    if (codes && codes.length) {
        for (const c of codes) {
            await localeCache.del(c);
        }
    } else {
        await localeCache.clear();
    }
}

module.exports = {
    getLanguages,
    isSupportedLocale,
    getLocaleName,
    resolveLocale,
    getBaselineKeys,
    getLocaleEntries,
    createCustomLanguage,
    invalidateI18nCache,
    // 导出纯函数供测试
    isLogicalKey,
    readLocaleFile
};
