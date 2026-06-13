const crypto = require('crypto');
const axios = require('axios');

class PayClientV2 {
  constructor(config) {
    this.pid = config.pid;
    this.baseUrl = config.baseUrl || 'https://pay.microgg.cn';
    this.privateKey = config.privateKey;
    this.publicKey = config.publicKey;
  }

  getConfig() {
    return {
      pid: this.pid,
      baseUrl: this.baseUrl,
      v2Enabled: !!(this.privateKey && this.publicKey)
    };
  }

  createOrder(params) {
    throw new Error('V2 createOrder 尚未实现');
  }

  queryOrder(params) {
    throw new Error('V2 queryOrder 尚未实现');
  }

  refund(params) {
    throw new Error('V2 refund 尚未实现');
  }
}

module.exports = { PayClientV2 };
