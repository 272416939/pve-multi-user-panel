(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;

    // ===== 状态 =====
    $.currentDevice = reactive({ deviceId: null, type: 'vm', name: '', ip: '' });
    $.deviceRules = ref([]);
    $.showDeviceForm = ref(false);
    $.forwardConfig = ref({ max_per_user: 10, port_range_start: 50000, port_range_end: 60000, used: 0, remaining: 10 });
    $.editingDeviceRuleId = ref(null);
    $.deviceForm = reactive({ name: '', ip: '', protocol: 'tcp', internal_port: null, external_port: null });
    $.availableIps = ref([]);
    $.deviceCheckResult = ref(null);

    // ===== 函数 =====
    $.openDeviceForward = async function(device, type) {
        $.currentDevice.type = type;
        $.currentDevice.deviceId = type === 'vm' ? device.vm_id : device.ct_id;
        $.currentDevice.name = device.name || '';
        $.currentDevice.ip = '';
        $.deviceRules.value = [];
        try {
            var results = await Promise.all([
                api('/port-forwards'),
                api('/port-forwards/extract-ips'),
                api('/port-forwards/config')
            ]);
            var rules = results[0];
            var ips = results[1];
            var cfg = results[2];
            $.deviceRules.value = (rules || []).filter(function(r) {
                return (type === 'vm' && r.vm_id === device.vm_id) ||
                       (type === 'lxc' && r.ct_id === device.ct_id);
            });
            $.availableIps.value = (ips || []).filter(function(d) { return d.type === type && d.device_id === $.currentDevice.deviceId; }).map(function(d) { return { ip: d.ip, name: d.name }; });
            var firstIp = $.availableIps.value[0];
            if (firstIp && firstIp.ip) {
                $.currentDevice.ip = firstIp.ip;
            }
            $.forwardConfig.value = cfg || { max_per_user: 10, used: 0, remaining: 10 };
        } catch (e) { console.error(e); }
        $.bsModalShow('deviceForwardModal');
    };

    $.openDeviceFormModal = function() {
        $.editingDeviceRuleId.value = null;
        $.deviceForm.name = '';
        $.deviceForm.ip = $.currentDevice.ip || '';
        $.deviceForm.protocol = 'tcp';
        $.deviceForm.internal_port = null;
        $.deviceForm.external_port = null;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = true;
    };

    $.openDeviceEditModal = function(rule) {
        $.editingDeviceRuleId.value = rule.id;
        $.deviceForm.name = rule.name || '';
        $.deviceForm.ip = rule.ip || '';
        $.deviceForm.protocol = rule.protocol || 'tcp';
        $.deviceForm.internal_port = rule.internal_port;
        $.deviceForm.external_port = rule.external_port;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = true;
    };

    $.cancelDeviceForm = function() {
        $.editingDeviceRuleId.value = null;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = false;
    };

    $.submitDeviceRule = async function() {
        var ip = $.deviceForm.ip;
        if (!ip) return alert('请选择或输入目标 IP');
        if (!$.deviceForm.internal_port) return alert('请填入内网端口');
        if (!$.deviceForm.external_port) return alert('请填入外网端口');
        try {
            var body = {
                type: $.currentDevice.type,
                vm_id: $.currentDevice.type === 'vm' ? $.currentDevice.deviceId : null,
                ct_id: $.currentDevice.type === 'lxc' ? $.currentDevice.deviceId : null,
                name: $.deviceForm.name,
                ip: ip,
                internal_port: $.deviceForm.internal_port,
                external_port: $.deviceForm.external_port,
                protocol: $.deviceForm.protocol
            };
            if ($.editingDeviceRuleId.value) {
                await api('/port-forwards/' + $.editingDeviceRuleId.value, { method: 'PUT', body: body });
            } else {
                await api('/port-forwards', { method: 'POST', body: body });
            }
            $.editingDeviceRuleId.value = null;
            // 重新加载
            var rules = await api('/port-forwards');
            $.deviceRules.value = (rules || []).filter(function(r) {
                return ($.currentDevice.type === 'vm' && r.vm_id === $.currentDevice.deviceId) ||
                       ($.currentDevice.type === 'lxc' && r.ct_id === $.currentDevice.deviceId);
            });
            var cfg = await api('/port-forwards/config');
            $.forwardConfig.value = cfg || $.forwardConfig.value;
            $.showDeviceForm.value = false;
        } catch (e) { alert(e.error || e.message); }
    };

    $.deleteDeviceRule = async function(rule) {
        var dmEl = document.getElementById('deviceForwardModal');
        if (dmEl) {
            var dmInst = bootstrap.Modal.getInstance(dmEl);
            if (dmInst) {
                await new Promise(function(resolve) {
                    dmEl.addEventListener('hidden.bs.modal', resolve, { once: true });
                    dmInst.hide();
                });
            }
        }
        var ok = confirm('确定要删除端口转发 "' + (rule.name || rule.external_port) + '" 吗？');
        if (!ok) { $.bsModalShow('deviceForwardModal'); return; }
        try {
            await api('/port-forwards/' + rule.id, { method: 'DELETE' });
            $.deviceRules.value = $.deviceRules.value.filter(function(r) { return r.id !== rule.id; });
            var cfg = await api('/port-forwards/config');
            $.forwardConfig.value = cfg || $.forwardConfig.value;
        } catch (e) {
            alert('删除失败: ' + e.message);
            $.bsModalShow('deviceForwardModal');
            return;
        }
        $.bsModalShow('deviceForwardModal');
    };

    $.randomDevicePort = async function() {
        try {
            var res = await api('/port-forwards/random-port');
            $.deviceForm.external_port = res.port;
            $.deviceCheckResult.value = null;
        } catch (e) { alert(e.message); }
    };

    // ===== initForward =====
    $.initForward = function() {
        // 无特殊生命周期逻辑
    };
})();
