const crypto = require('crypto');

function buildSignStr(params) {
  const filtered = {};
  for (const key of Object.keys(params)) {
    if (key === 'sign' || key === 'sign_type') continue;
    const val = params[key];
    if (val === null || val === undefined || val === '') continue;
    filtered[key] = val;
  }
  const sortedKeys = Object.keys(filtered).sort((a, b) => a.localeCompare(b));
  return sortedKeys.map(key => key + '=' + filtered[key]).join('&');
}

function md5Sign(params, key) {
  const signStr = buildSignStr(params);
  return crypto.createHash('md5').update(signStr + key).digest('hex');
}

function wrapPem(key) {
  if (typeof key !== 'string') return key;
  if (key.includes('-----BEGIN')) return key;
  var clean = key.replace(/[\r\n\s]/g, '');
  if (!/^[A-Za-z0-9+/=]+$/.test(clean)) return key;
  var lines = clean.match(/.{1,64}/g).join('\n');
  return '-----BEGIN PRIVATE KEY-----\n' + lines + '\n-----END PRIVATE KEY-----\n';
}

function rsaSign(data, privateKey) {
  privateKey = wrapPem(privateKey);
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  return sign.sign(privateKey, 'base64');
}

function rsaVerify(data, signature, publicKey) {
  publicKey = wrapPem(publicKey);
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(data);
  return verify.verify(publicKey, signature, 'base64');
}

module.exports = { md5Sign, rsaSign, rsaVerify, buildSignStr };
