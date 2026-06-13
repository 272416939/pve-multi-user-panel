(function() {
    var $ = window.__dashboard;
    if (!$) { setTimeout(arguments.callee, 50); return; }

    var { ref, watch } = Vue;

    $.walletBalance = ref('0.00');

    $.loadWalletBalance = async function() {
        try {
            var res = await api('/wallet/balance');
            $.walletBalance.value = res.balance || '0.00';
        } catch (e) {
            console.error('钱包余额加载失败', e);
        }
    };

    $.payMethods = ref({ alipay: false, wxpay: false, min_amount: 0.01, max_amount: 999999.99 });

    $.loadPayMethods = async function() {
        try {
            var res = await api('/wallet/pay-config');
            $.payMethods.value = res;
        } catch (e) {
            console.error('支付配置加载失败', e);
        }
    };

    $.rechargeAmount = ref('');
    $.rechargeMethod = ref('');
    $.rechargeSubmitting = ref(false);
    $.rechargeError = ref('');

    $.submitRecharge = async function() {
        var amount = parseFloat($.rechargeAmount.value);
        if (isNaN(amount) || amount <= 0) {
            $.rechargeError.value = '请输入有效的充值金额';
            return;
        }
        var min = parseFloat($.payMethods.value.min_amount || 0.01);
        if (amount < min) {
            $.rechargeError.value = '最低充值金额为 ' + min.toFixed(2) + ' 元';
            return;
        }
        if (!$.rechargeMethod.value) {
            $.rechargeError.value = '请选择支付方式';
            return;
        }
        $.rechargeSubmitting.value = true;
        $.rechargeError.value = '';
        try {
            var res = await api('/wallet/recharge', {
                method: 'POST',
                body: { amount: amount.toFixed(2), pay_method: $.rechargeMethod.value }
            });
            if (res.success && res.pay_url) {
                var form = document.createElement('form');
                form.method = 'POST';
                form.action = res.pay_url;
                form.target = '_blank';
                for (var key in res.params) {
                    var input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = res.params[key];
                    form.appendChild(input);
                }
                document.body.appendChild(form);
                form.submit();
                document.body.removeChild(form);
                $.rechargeAmount.value = '';
                $.rechargeMethod.value = '';
            } else {
                $.rechargeError.value = res.error || '创建订单失败';
            }
        } catch (e) {
            $.rechargeError.value = '请求失败，请稍后重试';
        }
        $.rechargeSubmitting.value = false;
    };

    $.txList = ref([]);
    $.txTotal = ref(0);
    $.txPage = ref(1);
    $.txFilter = ref({ start_time: '', end_time: '', trade_type: '', order_no: '' });

    $.loadTransactions = async function(page) {
        $.txPage.value = page || 1;
        try {
            var params = { page: $.txPage.value, limit: 10 };
            var f = $.txFilter.value;
            if (f.start_time) params.start_time = f.start_time;
            if (f.end_time) params.end_time = f.end_time;
            if (f.trade_type) params.trade_type = f.trade_type;
            if (f.order_no) params.order_no = f.order_no;
            var res = await api('/wallet/transactions?' + new URLSearchParams(params));
            $.txList.value = res.data || [];
            $.txTotal.value = res.total || 0;
        } catch (e) {
            console.error('加载交易明细失败', e);
        }
    };

    $.copyOrderNo = function(orderNo) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(orderNo).then(function() {
                alert('订单号已复制');
            });
        } else {
            var el = document.createElement('textarea');
            el.value = orderNo;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            alert('订单号已复制');
        }
    };

    $.renewResource = ref(null);
    $.renewQuantity = ref(1);
    $.renewShow = ref(false);
    $.renewError = ref('');

    $.openRenewModal = function(resource) {
        $.renewResource.value = resource;
        $.renewQuantity.value = 1;
        $.renewError.value = '';
        $.renewShow.value = true;
    };

    $.submitRenew = async function() {
        var resource = $.renewResource.value;
        if (!resource) return;
        var qty = parseInt($.renewQuantity.value) || 1;
        if (qty < 1) {
            $.renewError.value = '续费数量至少为1';
            return;
        }
        var type = resource._isLxc ? 'lxc' : 'vm';
        var vmid = resource.vm_id || resource.ct_id;
        var ctid = resource.ct_id;
        try {
            var body = { type: type, quantity: qty };
            if (type === 'vm') body.vmid = vmid;
            else body.ctid = ctid;
            var res = await api('/wallet/renew', { method: 'POST', body: body });
            if (res.success) {
                alert('续费成功！到期时间已延长至 ' + res.expiration_date);
                $.renewShow.value = false;
                $.loadWalletBalance();
            } else {
                $.renewError.value = res.error || '续费失败';
            }
        } catch (e) {
            $.renewError.value = '请求失败，请稍后重试';
        }
    };

    $.loadWalletBalance();
    $.loadPayMethods();

})();
