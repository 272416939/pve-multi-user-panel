const crypto = require('crypto');
const axios = require('axios');
const qs = require('querystring');
const { buildSignStr, rsaSign, rsaVerify } = require('./sign');
const {
    V2_SUBMIT_URL, V2_QUERY_URL, V2_REFUND_URL, V2_MERCHANT_URL,
    DEFAULT_BASE_URL, TRADE_SUCCESS, SIGN_TYPE_RSA
} = require('./constants');

class PayClientV2 {
    constructor(config) {
        if (!config.privateKey) throw new Error('V2 需要配置商户私钥 privateKey');
        if (!config.publicKey) throw new Error('V2 需要配置平台公钥 publicKey');

        this.pid = String(config.pid);
        this.baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
        this.notifyUrl = config.notifyUrl || '';
        this.returnUrl = config.returnUrl || '';
        this.privateKey = config.privateKey;
        this.publicKey = config.publicKey;
    }

    getConfig() {
        return { pid: this.pid, baseUrl: this.baseUrl, v2Enabled: true };
    }

    _sign(params) {
        var toSign = Object.assign({}, params, { pid: this.pid });
        if (!toSign.timestamp) {
            toSign.timestamp = String(Math.floor(Date.now() / 1000));
        }
        var signStr = buildSignStr(toSign);
        var sign = rsaSign(signStr, this.privateKey);
        return Object.assign({}, toSign, { sign: sign, sign_type: SIGN_TYPE_RSA });
    }

    async _post(path, params) {
        var signed = this._sign(params || {});
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

    _verifySign(params) {
        var sign = params.sign;
        var signStr = buildSignStr(params);
        return rsaVerify(signStr, sign, this.publicKey);
    }

    submitPay(params) {
        params = params || {};
        params.notify_url = params.notify_url || this.notifyUrl;
        params.return_url = params.return_url || this.returnUrl;
        var signedParams = this._sign(params);
        return {
            url: this.baseUrl + V2_SUBMIT_URL,
            params: signedParams
        };
    }

    async queryOrder(params) {
        params = params || {};
        return await this._post(V2_QUERY_URL, params);
    }

    async refund(params) {
        params = params || {};
        return await this._post(V2_REFUND_URL, params);
    }

    async queryMerchant() {
        return await this._post(V2_MERCHANT_URL, {});
    }

    verifyNotify(params) {
        params = params || {};
        if (!params.sign) return false;
        if (params.trade_status && params.trade_status !== TRADE_SUCCESS) return false;
        return this._verifySign(params);
    }
}

module.exports = { PayClientV2 };
