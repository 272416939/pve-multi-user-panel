const db = require('../api/db');

const CDK_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateCdkCode() {
    const sections = [];
    for (let s = 0; s < 3; s++) {
        let section = '';
        for (let i = 0; i < 4; i++) {
            section += CDK_CHARS[Math.floor(Math.random() * CDK_CHARS.length)];
        }
        sections.push(section);
    }
    return `PVE-${sections.join('-')}`;
}

function generateUniqueCdkCode() {
    let code;
    let attempts = 0;
    do {
        code = generateCdkCode();
        attempts++;
        if (attempts > 100) {
            throw new Error('无法生成唯一的 CDK 码，请重试');
        }
    } while (db.cdk.getByCode(code));
    return code;
}

module.exports = { generateCdkCode, generateUniqueCdkCode };
