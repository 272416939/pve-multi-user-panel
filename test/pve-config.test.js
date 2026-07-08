/**
 * test/pve-config.test.js - PVE 配置加密/解密 + 打码测试
 */
const { expect } = require('chai');
const { encrypt, decrypt, maskSecret, isMasked } = require('../server/utils/crypto-utils');

describe('PVE Config Crypto Utils', function() {

    describe('encrypt/decrypt 往返', function() {
        it('应正确加密和解密字符串', function() {
            var plain = 'root@pam!panel=72e26e75-9b90-4a04-8138-d1ed095e0f59';
            var encrypted = encrypt(plain);
            expect(encrypted).to.not.equal(plain);
            expect(encrypted).to.include(':');
            var decrypted = decrypt(encrypted);
            expect(decrypted).to.equal(plain);
        });

        it('应正确加密和解密密码', function() {
            var plain = 'Wlk990528@@@@';
            var encrypted = encrypt(plain);
            var decrypted = decrypt(encrypted);
            expect(decrypted).to.equal(plain);
        });

        it('空值加密返回空字符串', function() {
            expect(encrypt('')).to.equal('');
            expect(encrypt(null)).to.equal('');
        });

        it('空值解密返回空字符串', function() {
            expect(decrypt('')).to.equal('');
            expect(decrypt(null)).to.equal('');
        });

        it('非加密格式（明文）解密返回原值', function() {
            var plain = 'plaintext-value';
            expect(decrypt(plain)).to.equal(plain);
        });

        it('每次加密产生不同密文（随机 IV）', function() {
            var plain = 'test-secret';
            var enc1 = encrypt(plain);
            var enc2 = encrypt(plain);
            expect(enc1).to.not.equal(enc2);
            expect(decrypt(enc1)).to.equal(plain);
            expect(decrypt(enc2)).to.equal(plain);
        });
    });

    describe('maskSecret', function() {
        it('应打码长字符串', function() {
            var result = maskSecret('root@pam!panel=72e26e75');
            expect(result).to.include('****');
            expect(result).to.not.equal('root@pam!panel=72e26e75');
        });

        it('短字符串返回 ****', function() {
            expect(maskSecret('abc')).to.equal('****');
        });

        it('空值返回空字符串', function() {
            expect(maskSecret('')).to.equal('');
            expect(maskSecret(null)).to.equal('');
        });

        it('已打码的值不重复打码', function() {
            var masked = 'root****0f59';
            expect(maskSecret(masked)).to.equal(masked);
        });
    });

    describe('isMasked', function() {
        it('包含 **** 的值为 true', function() {
            expect(isMasked('root****0f59')).to.be.true;
        });

        it('不含 **** 的值为 false', function() {
            expect(isMasked('root@pam!panel=72e26e75')).to.be.false;
        });

        it('空值为 false', function() {
            expect(isMasked('')).to.be.false;
            expect(isMasked(null)).to.be.false;
        });
    });

});
