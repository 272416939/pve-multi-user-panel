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
  return sortedKeys.map(key => `${key}=${filtered[key]}`).join('&');
}

function md5Sign(params, key) {
  const signStr = buildSignStr(params);
  return crypto.createHash('md5').update(signStr + key).digest('hex');
}

function encodeDerLength(len) {
  if (len < 128) return Buffer.from([len]);
  var temp = Buffer.alloc(4);
  temp.writeUInt32BE(len, 0);
  var i = 0;
  while (i < 4 && temp[i] === 0) i++;
  var bytes = 4 - i;
  return Buffer.concat([Buffer.from([0x80 | bytes]), temp.slice(i)]);
}

function convertPkcs1ToPkcs8(pem) {
  var body = pem.replace(/-----[A-Z ]+-----/g, '').replace(/[\r\n\s]/g, '');
  var pkcs1Der = Buffer.from(body, 'base64');

  var rsaOid = Buffer.from('2a864886f70d010101', 'hex');
  var rsaOidBlock = Buffer.concat([
    Buffer.from('06', 'hex'), Buffer.from([rsaOid.length]), rsaOid,
    Buffer.from('0500', 'hex')
  ]);
  var algId = Buffer.concat([Buffer.from('30', 'hex'), Buffer.from([rsaOidBlock.length]), rsaOidBlock]);

  var octetContent = Buffer.concat([
    Buffer.from('04', 'hex'),
    encodeDerLength(pkcs1Der.length),
    pkcs1Der
  ]);
  var inner = Buffer.concat([
    Buffer.from('020100', 'hex'),
    algId,
    octetContent
  ]);

  var seqHdr = Buffer.concat([Buffer.from('30', 'hex'), encodeDerLength(inner.length)]);
  var pkcs8Der = Buffer.concat([seqHdr, inner]);

  return '-----BEGIN PRIVATE KEY-----\n' +
    pkcs8Der.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END PRIVATE KEY-----';
}

function rsaSign(data, privateKey) {
  if (typeof privateKey === 'string' && privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    privateKey = convertPkcs1ToPkcs8(privateKey);
  }
  var keyObj;
  if (typeof privateKey === 'string') {
    keyObj = crypto.createPrivateKey({ key: privateKey, format: 'pem', type: 'pkcs8' });
  } else {
    keyObj = privateKey;
  }
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(data);
  return sign.sign(keyObj, 'base64');
}

function rsaVerify(data, signature, publicKey) {
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(data);
  return verify.verify(publicKey, signature, 'base64');
}

module.exports = { md5Sign, rsaSign, rsaVerify, buildSignStr };
