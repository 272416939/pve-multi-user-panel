const crypto = require('crypto');
const axios = require('axios');
const qs = require('querystring');
const { md5Sign, buildSignStr } = require('./sign');
const { PayClientV2 } = require('./v2');
const { SUBMIT_URL, MAPI_URL, API_URL, V2_SUBMIT_URL, V2_QUERY_URL, V2_REFUND_URL, V2_MERCHANT_URL, DEFAULT_BASE_URL, PAY_TYPES, DEVICE_TYPES, ALIPAY, WXPAY, QQPAY, BANK, JDPAY, PAYPAL, DOUYINPAY, PC, MOBILE, QQ, WECHAT, DOUYIN, JUMP, TRADE_SUCCESS, SIGN_TYPE_MD5, SIGN_TYPE_RSA } = require('./constants');

function generateOrderId(prefix) {
    var ts = Date.now().toString(36);
    var rand = crypto.randomBytes(6).toString('hex');
    return (prefix || 'PAY') + '_' + ts + '_' + rand;
}

function createPayClient(config) {
    if (config.privateKey || config.publicKey) {
        return new PayClientV2(config);
    }
    return new PayClientV1(config);
}

class PayClientV1 {
    constructor(config) {
        this.pid = String(config.pid);
        this.key = config.key;
        this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.notifyUrl = config.notifyUrl || '';
        this.returnUrl = config.returnUrl || '';
    }

    _sign(params) {
        params.pid = params.pid || this.pid;
        var sign = md5Sign(params, this.key);
        return Object.assign({}, params, { sign: sign, sign_type: 'MD5' });
    }

    async _get(path, params) {
        params = Object.assign({ pid: this.pid }, params);
        var signed = this._sign(params);
        var url = this.baseUrl + path + '?' + qs.stringify(signed);
        try {
            var res = await axios.get(url, { timeout: 15000 });
            return res.data;
        } catch (err) {
            return { code: -1, msg: '支付网关请求失败' };
        }
    }

    async _post(path, params) {
        params = Object.assign({ pid: this.pid }, params);
        var signed = this._sign(params);
        var url = this.baseUrl + path;
        try {
            var res = await axios.post(url, qs.stringify(signed), {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 15000
            });
            return res.data;
        } catch (err) {
            return { code: -1, msg: '支付网关请求失败' };
        }
    }

    submitPay(params) {
        params = params || {};
        params.notify_url = params.notify_url || this.notifyUrl;
        params.return_url = params.return_url || this.returnUrl;
        params.pid = this.pid;
        var signedParams = this._sign(params);
        return {
            url: this.baseUrl + SUBMIT_URL,
            params: signedParams
        };
    }

    async apiPay(params) {
        params = params || {};
        params.notify_url = params.notify_url || this.notifyUrl;
        params.pid = this.pid;
        return await this._post(MAPI_URL, params);
    }

    verifyNotify(params) {
        params = params || {};
        var expected = md5Sign(params, this.key);
        return expected === (params.sign || '').toLowerCase();
    }

    async queryOrder(params) {
        params = params || {};
        return await this._get(API_URL, Object.assign({ act: 'order' }, params));
    }

    async queryOrders(params) {
        params = params || {};
        if (!params.limit) params.limit = 20;
        if (params.limit > 50) params.limit = 50;
        return await this._get(API_URL, Object.assign({ act: 'orders' }, params));
    }

    async queryMerchant() {
        return await this._get(API_URL, { act: 'query' });
    }

    async refund(params) {
        params = params || {};
        return await this._post(API_URL, Object.assign({ act: 'refund' }, params));
    }
}

module.exports = {
    createPayClient,
    generateOrderId,
    PayClientV1,
    PayClientV2,
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
    TRADE_SUCCESS,
    SIGN_TYPE_MD5,
    SIGN_TYPE_RSA
};
