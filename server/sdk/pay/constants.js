const PAY_TYPES = {
  alipay: '支付宝',
  wxpay: '微信支付',
  qqpay: 'QQ钱包',
  bank: '银联支付',
  jdpay: '京东支付',
  paypal: 'PayPal',
  douyinpay: '抖音支付'
};

const DEVICE_TYPES = {
  pc: '电脑浏览器',
  mobile: '手机浏览器',
  qq: '手机QQ内浏览器',
  wechat: '微信内浏览器',
  alipay: '支付宝客户端',
  douyin: '抖音APP',
  jump: '仅返回支付跳转URL'
};

const ALIPAY = 'alipay';
const WXPAY = 'wxpay';
const QQPAY = 'qqpay';
const BANK = 'bank';
const JDPAY = 'jdpay';
const PAYPAL = 'paypal';
const DOUYINPAY = 'douyinpay';

const PC = 'pc';
const MOBILE = 'mobile';
const QQ = 'qq';
const WECHAT = 'wechat';
const DOUYIN = 'douyin';
const JUMP = 'jump';

const SUBMIT_URL = '/submit.php';
const MAPI_URL = '/mapi.php';
const API_URL = '/api.php';

const V2_SUBMIT_URL = '/api/pay/submit';
const V2_QUERY_URL = '/api/pay/query';
const V2_REFUND_URL = '/api/pay/refund';
const V2_MERCHANT_URL = '/api/merchant/info';

const TRADE_SUCCESS = 'TRADE_SUCCESS';

const SIGN_TYPE_MD5 = 'MD5';
const SIGN_TYPE_RSA = 'RSA';

const DEFAULT_BASE_URL = 'https://pay.microgg.cn';

module.exports = {
  PAY_TYPES,
  DEVICE_TYPES,
  ALIPAY,
  WXPAY,
  QQPAY,
  BANK,
  JDPAY,
  PAYPAL,
  DOUYINPAY,
  PC,
  MOBILE,
  QQ,
  WECHAT,
  DOUYIN,
  JUMP,
  SUBMIT_URL,
  MAPI_URL,
  API_URL,
  V2_SUBMIT_URL,
  V2_QUERY_URL,
  V2_REFUND_URL,
  V2_MERCHANT_URL,
  TRADE_SUCCESS,
  SIGN_TYPE_MD5,
  SIGN_TYPE_RSA,
  DEFAULT_BASE_URL
};
