(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;
    var computed = Vue.computed;

    // ==================== 状态 ====================
    $.networkConfig = reactive({
        port_range_start: 50000,
        port_range_end: 60000,
        default_protocol: 'tcp',
        wan_interface: '',
        max_per_user: 10,
        cname_domain: ''
    });
    $.ifaceList = ref([]);
    $.ifaceUpdateTime = ref('');
    $.forwardRules = ref([]);
    $.forwardRulesLoading = ref(false);
    $.showForwardModal = ref(false);
    $.forwardForm = reactive({
        id: null, type: 'vm', vm_id: null, ct_id: null,
        name: '', ip: '', internal_port: null, external_port: null,
        protocol: 'tcp'
    });
    $.isEditingForward = ref(false);
    $.selectedForwardIds = ref([]);
    $.availableDevices = ref([]);
    $.userForwardCount = ref(0);
    $.maxForwardPerUser = ref(10);
    $.checkResult = ref(null);

    // 设备端口转发弹窗
    $.deviceModal = reactive({ device: { deviceId: null, type: 'vm', name: '', ip: '' } });
    $.deviceRules = ref([]);
    $.showDeviceForm = ref(false);
    $.forwardConfig = ref({ max_per_user: 10, port_range_start: 50000, port_range_end: 60000, used: 0, remaining: 10 });
    $.editingDeviceRuleId = ref(null);
    $.deviceForm = reactive({ name: '', ip: '', protocol: 'tcp', internal_port: null, external_port: null });
    $.deviceCheckResult = ref(null);

    // 分页
    $.forwardPage = ref(1);
    $.forwardVmPage = ref(1);
    $.forwardLxcPage = ref(1);
    $.forwardPageSize = 20;

    // ==================== computed ====================
    $.paginatedForwardRules = computed(function() {
        var start = ($.forwardPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    $.vmForwardTotal = computed(function() {
        return $.forwardRules.value.length;
    });

    $.lxcForwardTotal = computed(function() {
        return $.forwardRules.value.length;
    });

    $.paginatedVmForwardRules = computed(function() {
        var start = ($.forwardVmPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    $.paginatedLxcForwardRules = computed(function() {
        var start = ($.forwardLxcPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    // 仅显示 LAN 类型接口供 DHCP 选择（若没有 LAN 类型，降级显示全部接口兜底）
    $.lanInterfaceList = computed(function() {
        var lan = $.ifaceList.value.filter(function(i) { return i.type === 'lan'; });
        return lan.length > 0 ? lan : $.ifaceList.value;
    });

    // 仅显示 WAN 类型接口供端口转发选择
    $.wanInterfaceList = computed(function() {
        var wan = $.ifaceList.value.filter(function(i) { return i.type === 'wan'; });
        return wan.length > 0 ? wan : $.ifaceList.value;
    });

    // ==================== 函数 ====================
    $.loadNetworkConfig = async function() {
        try {
            var res = await api('/admin/network/config');
            Object.assign($.networkConfig, res);
            // 确保 wan_interface 是字符串（后端已返回逗号分隔字符串，兼容旧数组格式）
            if (Array.isArray(res.wan_interface)) {
                $.networkConfig.wan_interface = res.wan_interface.filter(Boolean).join(',');
            } else if (res.wan_interface == null) {
                $.networkConfig.wan_interface = '';
            }
            $.maxForwardPerUser.value = res.max_per_user || 10;
            // 从数据库加载缓存的接口列表（无需立即请求 ikuai）
            if (res.iface_list && res.iface_list.length > 0) {
                $.ifaceList.value = res.iface_list;
                $.ifaceUpdateTime.value = '已缓存';
            }
        } catch (e) { console.error('加载网络配置失败:', e); }
    };

    $.saveNetworkConfig = async function() {
        try {
            await api('/admin/network/config', { method: 'PUT', body: $.networkConfig });
            alert('配置已保存');
        } catch (e) { alert('保存失败: ' + e.message); }
    };

    // 外网接口下拉框选择：追加到文本框（逗号分隔，去重）
    $.addWanInterface = function(ifaceName) {
        if (!ifaceName) return;
        var current = ($.networkConfig.wan_interface || '').trim();
        var ifaces = current ? current.split(',').map(function(s) { return s.trim(); }).filter(Boolean) : [];
        if (ifaces.indexOf(ifaceName) >= 0) return; // 已存在则跳过
        ifaces.push(ifaceName);
        $.networkConfig.wan_interface = ifaces.join(',');
    };

    $.syncDhcpBindings = async function() {
        if (!await window.customConfirm('将从爱快读取所有 DHCP 静态绑定，匹配 VM/CT 并回写到数据库，继续吗？')) return;
        try {
            var res = await api('/ikuai/sync-dhcp-bindings', { method: 'POST' });
            alert('同步完成\n更新: ' + res.updated + ' 条\n跳过: ' + res.skipped + ' 条\n错误: ' + res.errors + ' 条');
        } catch (e) { alert('同步失败: ' + e.message); }
    };

    $.refreshIfaceList = async function() {
        try {
            var list = await api('/ikuai/interfaces');
            $.ifaceList.value = list || [];
            $.ifaceUpdateTime.value = new Date().toLocaleString();
            // 刷新后重新加载配置（接口可能被自动修正）
            var config = await api('/admin/network/config');
            Object.assign($.networkConfig, config);
        } catch (e) { alert('获取接口列表失败: ' + e.message); }
    };

    // 端口转发
    $.loadForwardRules = async function(type) {
        $.forwardRulesLoading.value = true;
        $.forwardPage.value = 1;
        $.forwardVmPage.value = 1;
        $.forwardLxcPage.value = 1;
        try {
            if (type === 'all') {
                var rules = await api('/port-forwards');
                $.forwardRules.value = rules || [];
            } else {
                var rules = await api('/port-forwards?type=' + type);
                $.forwardRules.value = rules || [];
            }
            // 获取当前用户数量
            var userRules = await api('/port-forwards');
            $.userForwardCount.value = (userRules || []).length;
        } catch (e) { console.error('加载转发规则失败:', e); }
        finally { $.forwardRulesLoading.value = false; }
    };

    $.openAddForward = async function(type) {
        $.isEditingForward.value = false;
        $.forwardForm.id = null;
        $.forwardForm.type = type;
        $.forwardForm.vm_id = null;
        $.forwardForm.ct_id = null;
        $.forwardForm.name = '';
        $.forwardForm.ip = '';
        $.forwardForm.internal_port = null;
        $.forwardForm.external_port = null;
        $.forwardForm.protocol = 'tcp';
        $.checkResult.value = null;
        $.selectedForwardIds.value = [];
        // 加载设备列表
        try {
            var devices = await api('/port-forwards/extract-ips');
            $.availableDevices.value = (devices || []).filter(function(d) { return d.type === type; });
        } catch (e) { console.error('加载设备列表失败:', e); }
        $.showForwardModal.value = true;
        $.bsModalShow('forwardModal');
    };

    $.selectDevice = function() {
        var device = $.availableDevices.value.find(function(d) {
            if ($.forwardForm.type === 'vm') return d.device_id === $.forwardForm.vm_id;
            return d.device_id === $.forwardForm.ct_id;
        });
        if (device) {
            $.forwardForm.ip = device.ip;
            $.forwardForm.name = device.name;
        }
    };

    $.randomPort = async function() {
        try {
            var res = await api('/port-forwards/random-port');
            $.forwardForm.external_port = res.port;
            $.checkResult.value = null;
        } catch (e) { alert(e.message); }
    };

    $.checkPortConflict = async function() {
        if (!$.forwardForm.external_port) return;
        try {
            var res = await api('/port-forwards/check-port?port=' + $.forwardForm.external_port);
            $.checkResult.value = res.available;
        } catch (e) { $.checkResult.value = null; }
    };

    $.submitForward = async function() {
        // 校验
        if ($.forwardForm.type === 'vm' && !$.forwardForm.vm_id) return alert('请选择虚拟机');
        if ($.forwardForm.type === 'lxc' && !$.forwardForm.ct_id) return alert('请选择容器');
        if (!$.forwardForm.ip) return alert('请填入目标 IP');
        if (!$.forwardForm.internal_port) return alert('请填入内网端口');
        if (!$.forwardForm.external_port) return alert('请填入外网端口');
        if ($.forwardForm.external_port < $.networkConfig.port_range_start || $.forwardForm.external_port > $.networkConfig.port_range_end) {
            return alert('外网端口必须在 ' + $.networkConfig.port_range_start + '-' + $.networkConfig.port_range_end + ' 范围内');
        }
        try {
            var body = {
                type: $.forwardForm.type,
                vm_id: $.forwardForm.type === 'vm' ? $.forwardForm.vm_id : null,
                ct_id: $.forwardForm.type === 'lxc' ? $.forwardForm.ct_id : null,
                name: $.forwardForm.name,
                ip: $.forwardForm.ip,
                internal_port: $.forwardForm.internal_port,
                external_port: $.forwardForm.external_port,
                protocol: $.forwardForm.protocol
            };
            if ($.isEditingForward.value && $.forwardForm.id) {
                await api('/port-forwards/' + $.forwardForm.id, { method: 'PUT', body: body });
            } else {
                await api('/port-forwards', { method: 'POST', body: body });
            }
            $.showForwardModal.value = false;
            $.bsModalHide('forwardModal');
            $.loadForwardRules($.forwardForm.type);
        } catch (e) { alert(e.error || e.message); }
    };

    $.deleteForward = async function(id) {
        if (!await window.customConfirm('确定删除此转发规则？')) return;
        try {
            await api('/port-forwards/' + id, { method: 'DELETE' });
            $.loadForwardRules($.activeTabVm.value === 'network' ? 'vm' : 'lxc');
        } catch (e) { alert('删除失败: ' + e.message); }
    };

    $.batchDeleteForwards = async function() {
        if ($.selectedForwardIds.value.length === 0) return alert('请选择要删除的规则');
        if (!await window.customConfirm('确定批量删除 ' + $.selectedForwardIds.value.length + ' 条转发规则？')) return;
        try {
            await api('/port-forwards/batch-delete', { method: 'POST', body: { ids: $.selectedForwardIds.value } });
            $.selectedForwardIds.value = [];
            $.loadForwardRules($.activeTabVm.value === 'network' ? 'vm' : 'lxc');
        } catch (e) { alert('批量删除失败: ' + e.message); }
    };

    $.toggleSelectAllForwards = function(event) {
        if (event.target.checked) {
            $.selectedForwardIds.value = $.forwardRules.value.map(function(r) { return r.id; });
        } else {
            $.selectedForwardIds.value = [];
        }
    };

    // 设备端口转发
    $.openDeviceForward = async function(device, type) {
        $.deviceModal.device = {
            deviceId: type === 'vm' ? device.vm_id : device.ct_id,
            type: type,
            name: device.name || '',
            ip: device.ip || ''
        };
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
            // 获取设备 IP
            var deviceIp = (ips || []).find(function(d) { return d.type === type && d.device_id === (type === 'vm' ? device.vm_id : device.ct_id); });
            if (deviceIp && deviceIp.ip) {
                $.deviceModal.device.ip = deviceIp.ip;
            }
            $.forwardConfig.value = cfg || { max_per_user: 10, used: 0, remaining: 10 };
        } catch (e) { console.error(e); }
        $.bsModalShow('deviceForwardModal');
    };

    $.openDeviceFormModal = function() {
        $.editingDeviceRuleId.value = null;
        $.deviceForm.name = '';
        $.deviceForm.ip = $.deviceModal.device.ip || '';
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
        var ip = $.deviceForm.ip || $.deviceModal.device.ip;
        if (!ip) return alert('当前设备无可用 IP，无法创建端口转发');
        if (!$.deviceForm.internal_port) return alert('请填入内网端口');
        if (!$.deviceForm.external_port) return alert('请填入外网端口');
        try {
            var body = {
                type: $.deviceModal.device.type,
                vm_id: $.deviceModal.device.type === 'vm' ? $.deviceModal.device.deviceId : null,
                ct_id: $.deviceModal.device.type === 'lxc' ? $.deviceModal.device.deviceId : null,
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
            var rules = await api('/port-forwards');
            $.deviceRules.value = (rules || []).filter(function(r) {
                return ($.deviceModal.device.type === 'vm' && r.vm_id === $.deviceModal.device.deviceId) ||
                       ($.deviceModal.device.type === 'lxc' && r.ct_id === $.deviceModal.device.deviceId);
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
        var ok = await window.customConfirm('确定要删除端口转发 "' + (rule.name || rule.external_port) + '" 吗？');
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

    // ==================== initNetwork ====================
    $.initNetwork = function() {
        // 无特殊生命周期逻辑
    };
})();
