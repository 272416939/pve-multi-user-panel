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

function toBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fixKey(key) {
  if (typeof key !== 'string') return key;
  if (key.includes('\\n')) key = key.replace(/\\n/g, '\n');
  if (!key.endsWith('\n')) key += '\n';
  return key;
}

function parsePkcs1Der(der) {
  var pos = 0;

  function readLength() {
    var b = der[pos++];
    if ((b & 0x80) === 0) return b;
    var numBytes = b & 0x7f;
    var len = 0;
    while (numBytes-- > 0) len = (len << 8) | der[pos++];
    return len;
  }

  var tag = der[pos++];
  if (tag !== 0x30) throw new Error('Expected SEQUENCE (0x30)');
  var seqLen = readLength();
  var end = pos + seqLen;

  var ints = [];
  while (pos < end) {
    tag = der[pos++];
    if (tag !== 0x02) throw new Error('Expected INTEGER (0x02)');
    var intLen = readLength();
    if (intLen > 0 && der[pos] === 0) { pos++; intLen--; }
    ints.push(der.slice(pos, pos + intLen));
    pos += intLen;
  }

  return {
    n: toBase64Url(ints[1]),
    e: toBase64Url(ints[2]),
    d: toBase64Url(ints[3]),
    p: toBase64Url(ints[4]),
    q: toBase64Url(ints[5]),
    dp: toBase64Url(ints[6]),
    dq: toBase64Url(ints[7]),
    qi: toBase64Url(ints[8])
  };
}

function rsaSign(data, privateKey) {
  privateKey = fixKey(privateKey);

  if (typeof privateKey !== 'string') {
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  }

  // 诊断: 私钥前60字符
  var preview = privateKey.substring(0, 80);
  console.log('[sign] key preview:', JSON.stringify(preview));

  // 尝试1: PKCS#1 → JWK → KeyObject
  if (privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
    try {
      var body = privateKey.replace(/-----[A-Z ]+-----/g, '').replace(/[\r\n\s]/g, '');
      var der = Buffer.from(body, 'base64');
      console.log('[sign] PKCS#1 body base64 len:', body.length, 'DER len:', der.length);
      if (der.length === 0) throw new Error('base64解码后为空');
      var jwk = parsePkcs1Der(der);
      jwk.kty = 'RSA';
      console.log('[sign] JWK n prefix:', jwk.n ? jwk.n.substring(0, 20) + '...' : 'EMPTY');
      var keyObj = crypto.createPrivateKey({ key: jwk, format: 'jwk' });
      console.log('[sign] JWK→KeyObject OK');
      const sign = crypto.createSign('RSA-SHA256');
      sign.update(data);
      return sign.sign(keyObj, 'base64');
    } catch (e) {
      console.log('[sign] JWK fallback failed:', e.message.substring(0, 100));
    }
  }

  // 尝试2: 直接用PEM(可能是PKCS#8)
  try {
    var keyObj = crypto.createPrivateKey({ key: privateKey, format: 'pem' });
    console.log('[sign] PEM→KeyObject OK (no type hint)');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    return sign.sign(keyObj, 'base64');
  } catch (e) {
    console.log('[sign] PEM fallback failed:', e.message.substring(0, 100));
  }

  // 尝试3: 给sign.sign原始PEM字符串
  try {
    console.log('[sign] last resort: sign.sign(string)');
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(data);
    return sign.sign(privateKey, 'base64');
  } catch (e) {
    console.error('[sign] ALL approaches failed. Last error:', e.message);
    throw e;
  }
}

function rsaVerify(data, signature, publicKey) {
  publicKey = fixKey(publicKey);
  const verify = crypto.createVerify('RSA-SHA256');
  verify.update(data);
  return verify.verify(publicKey, signature, 'base64');
}

module.exports = { md5Sign, rsaSign, rsaVerify, buildSignStr };
