const { execute, queryOne, queryAll } = require('./db-core');
const { withTransaction } = require('../utils/with-transaction');

/**
 * i18n 语言数据访问（i18n_languages + i18n_entries）
 *
 * - i18n_languages：语言注册表（7 系统语言种子 + 管理员新建自定义语言；
 *   自定义语言 snapshot = 创建时复制源内容的快照，用于旧词条原始文本与「新增词条」判定）
 * - i18n_entries：词条覆盖（value；清空 '' 即删行恢复基线）
 * 解析公式见 services/i18n.js：显示值 = 覆盖 ??（key ∈ 快照 ? 快照值 : 复制源系统语言文件当前值）
 */
const i18n = {
    listLanguages: () => queryAll(
        'SELECT id, code, name, base_code, snapshot, is_system, status, enabled FROM i18n_languages ORDER BY is_system DESC, id'
    ),

    getLanguage: (code) => queryOne(
        'SELECT id, code, name, base_code, snapshot, is_system, status, enabled, created_by FROM i18n_languages WHERE code = ?',
        [code]
    ),

    // 语言启用开关（调用方须先过守卫：zh-CN 与当前站点默认语言不可禁用）
    setEnabled: (code, enabled) => (
        execute('UPDATE i18n_languages SET enabled = ? WHERE code = ?', [enabled ? 1 : 0, code])
    ),

    createLanguage: async (fields) => {
        await execute(
            'INSERT INTO i18n_languages (code, name, base_code, snapshot, is_system, created_by) VALUES (?, ?, ?, ?, 0, ?)',
            [fields.code, fields.name, fields.baseCode, fields.snapshot || null, fields.createdBy || 0]
        );
    },

    updateName: (code, name) => (
        execute('UPDATE i18n_languages SET name = ? WHERE code = ?', [name, code])
    ),

    // 删除自定义语言（级联删除其覆盖；调用方须先过删除守卫：用户引用/站点默认语言）
    deleteLanguage: async (code) => {
        await execute('DELETE FROM i18n_entries WHERE lang_code = ?', [code]);
        await execute('DELETE FROM i18n_languages WHERE code = ?', [code]);
    },

    getOverrides: (langCode) => queryAll(
        'SELECT entry_key, value FROM i18n_entries WHERE lang_code = ?',
        [langCode]
    ),

    // 批量保存覆盖（事务原子；value === '' 删行恢复基线）
    saveOverrides: async (langCode, entries, updatedBy) => {
        if (!entries || !entries.length) return;
        await withTransaction(async (conn) => {
            for (const e of entries) {
                if (e.value === '') {
                    await conn.execute(
                        'DELETE FROM i18n_entries WHERE lang_code = ? AND entry_key = ?',
                        [langCode, e.key]
                    );
                } else {
                    await conn.execute(
                        'INSERT INTO i18n_entries (lang_code, entry_key, value, updated_by) VALUES (?, ?, ?, ?) ' +
                        'ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)',
                        [langCode, e.key, e.value, updatedBy || 0]
                    );
                }
            }
        });
    },

    // 清空某语言全部覆盖（恢复基线）
    deleteOverrides: (langCode) => (
        execute('DELETE FROM i18n_entries WHERE lang_code = ?', [langCode])
    ),

    // 各语言覆盖行数（语言列表 overrides 标志用；单条 GROUP BY 全量取出）
    countOverridesByLang: () => queryAll(
        'SELECT lang_code, COUNT(*) AS n FROM i18n_entries GROUP BY lang_code'
    ),

    // 自定义语言代码生成（cst<最大序号+1>；并发冲突由调用方重试）
    listCustomCodes: () => queryAll(
        "SELECT code FROM i18n_languages WHERE code LIKE 'cst%'"
    ),

    // 删除守卫：仍有用户偏好引用该语言
    countUsersUsing: (langCode) => queryOne(
        'SELECT COUNT(*) AS n FROM user_settings WHERE lang = ?',
        [langCode]
    )
};

module.exports = { i18n };
