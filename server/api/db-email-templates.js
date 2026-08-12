const { execute, queryOne, queryAll } = require('./db-core');

/**
 * 邮件模板数据访问（email_templates 表）
 * 默认模板由 constants/email-templates.js 注册表在 initDb() 时 INSERT IGNORE 初始化；
 * 运行时 DB 记录可编辑，缺失时由 services/email-template.js 回退常量默认（兜底）。
 */
const emailTemplates = {
    getAll: () => queryAll('SELECT * FROM email_templates ORDER BY category, code'),

    getByCode: (code) => queryOne('SELECT * FROM email_templates WHERE code = ?', [code]),

    /**
     * 保存模板（version 自增；updated_by 记录操作管理员）
     */
    update: async (code, fields, updatedBy) => {
        await execute(
            'UPDATE email_templates SET subject = ?, title = ?, content = ?, updated_by = ?, version = version + 1 WHERE code = ?',
            [fields.subject, fields.title, fields.content, updatedBy || 0, code]
        );
    },

    /**
     * 恢复默认（用注册表默认值覆盖；variables 一并还原）
     */
    resetToDefault: async (tpl, updatedBy) => {
        await execute(
            'UPDATE email_templates SET subject = ?, title = ?, content = ?, variables = ?, updated_by = ?, version = version + 1 WHERE code = ?',
            [tpl.subject, tpl.title, tpl.content, JSON.stringify(tpl.variables || []), updatedBy || 0, tpl.code]
        );
    }
};

module.exports = { emailTemplates };
