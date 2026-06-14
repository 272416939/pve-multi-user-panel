var crypto = require('crypto');

function randomHex(length) {
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function generateVmName() {
    return 'VM-' + randomHex(9);
}

function generateLxcName() {
    return 'CT-' + randomHex(9);
}

module.exports = { generateVmName, generateLxcName };
