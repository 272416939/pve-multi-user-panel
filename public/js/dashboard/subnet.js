(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;

    // ==================== 状态 ====================
    $.subnets = ref([]);
    $.subnetLoading = ref(false);
    $.subnetCreating = ref(false);
    $.subnetRefreshing = ref(false);
    // 子网配额（创建弹窗展示已用/上限，admin max=0 不限）
    $.subnetQuota = ref({ used: 0, max: 0 });
    // 绑定子网弹窗状态
    $.bindSubnetDevice = reactive({ type: 'vm', vm_id: null, ct_id: null, name: '', status: null, dhcp_static_ip: '' });
    $.bindSubnetCurrentSubnet = ref(null);
    $.bindSubnetForm = reactive({ subnet_id: 0 });
    $.bindSubnetSubmitting = ref(false);

    $.loadSubnetQuota = async function() {
        try {
            $.subnetQuota.value = await api('/subnets/quota');
        } catch (e) {
            console.error('加载子网配额失败', e);
        }
    };

    // ==================== 子网列表 ====================
    $.loadSubnets = async function() {
        $.subnetLoading.value = true;
        try {
            var list = await api('/subnets');
            $.subnets.value = list || [];
            // 配额与列表同步（创建/删除后即时更新）
            await $.loadSubnetQuota();
        } catch (e) {
            console.error('加载子网列表失败', e);
        } finally {
            $.subnetLoading.value = false;
        }
    };

    // ==================== 刷新全部子网可用 IP ====================
    // 后端批量接口：爱快 dhcp_server show 一次返回全部，避免逐个子网轮询
    $.refreshSubnets = async function() {
        if ($.subnetRefreshing.value) return;
        if ($.subnets.value.length === 0) return alert(window.__i18n.t('dash.subnet.empty'));
        $.subnetRefreshing.value = true;
        try {
            var res = await api('/subnets/refresh', { method: 'POST' });
            await $.loadSubnets();
            alert(window.__i18n.tFormat('dash.subnet.refreshDone', (res.updated || 0)));
        } catch (e) {
            alert(window.__i18n.tFormat('dash.subnet.refreshFailed', e.message));
        } finally {
            $.subnetRefreshing.value = false;
        }
    };

    // ==================== 新建子网 ====================
    $.openCreateSubnet = function() {
        // 打开弹窗时刷新配额（已用/上限），保证提示最新
        $.loadSubnetQuota();
        $.bsModalShow('createSubnetModal');
    };

    $.createSubnet = async function() {
        if ($.subnetCreating.value) return;
        $.subnetCreating.value = true;
        try {
            await api('/subnets', { method: 'POST' });
            $.bsModalHide('createSubnetModal');
            await $.loadSubnets();
            alert(window.__i18n.t('dash.subnet.created'));
        } catch (e) {
            alert(window.__i18n.tFormat('dash.subnet.createFailed', e.message));
        } finally {
            $.subnetCreating.value = false;
        }
    };

    // ==================== 删除子网 ====================
    $.deleteSubnet = async function(s) {
        var ok = await window.customConfirm(window.__i18n.tFormat('dash.subnet.deleteConfirm', s.vlan_name, (s.cidr || '')));
        if (!ok) return;
        try {
            await api('/subnets/' + s.id, { method: 'DELETE' });
            await $.loadSubnets();
        } catch (e) {
            alert(window.__i18n.tFormat('dash.subnet.deleteFailed', e.message));
        }
    };

    // ==================== 绑定/解绑子网弹窗 ====================
    $.openBindSubnet = async function(device, type) {
        $.bindSubnetDevice.type = type;
        $.bindSubnetDevice.vm_id = type === 'vm' ? device.vm_id : null;
        $.bindSubnetDevice.ct_id = type === 'lxc' ? device.ct_id : null;
        $.bindSubnetDevice.name = device.name || '';
        $.bindSubnetDevice.status = device.status || null;
        $.bindSubnetDevice.dhcp_static_ip = device.dhcp_static_ip || '';
        $.bindSubnetForm.subnet_id = 0;
        // 已绑定的子网信息
        $.bindSubnetCurrentSubnet.value = null;
        if (device.subnet_id) {
            var cur = $.subnets.value.find(function(s) { return s.id === device.subnet_id; });
            $.bindSubnetCurrentSubnet.value = cur || null;
        }
        if ($.subnets.value.length === 0) await $.loadSubnets();
        $.bsModalShow('bindSubnetModal');
    };

    $.bindSubnet = async function() {
        var subnetId = parseInt($.bindSubnetForm.subnet_id);
        if (!subnetId) return alert(window.__i18n.t('dash.subnet.selectBindTarget'));
        if ($.bindSubnetSubmitting.value) return;
        // 管理员运行中绑定二次确认：热更新网卡后需重启服务器才能正确应用新网段
        var running = $.bindSubnetDevice.status && $.bindSubnetDevice.status.status === 'running';
        if (running && $.user && $.user.value && $.user.value.role === 'admin') {
            var ok = await window.customConfirm(window.__i18n.t('dash.subnet.bindRunningAdminConfirm'));
            if (!ok) return;
        }
        $.bindSubnetSubmitting.value = true;
        try {
            var type = $.bindSubnetDevice.type;
            var id = type === 'vm' ? $.bindSubnetDevice.vm_id : $.bindSubnetDevice.ct_id;
            var res = await api('/' + type + '/' + id + '/bind-subnet', { method: 'POST', body: { subnet_id: subnetId } });
            $.bsModalHide('bindSubnetModal');
            var bindMsg = window.__i18n.t('dash.subnet.bindSuccess');
            if (res.dhcp_static_ip) bindMsg += window.__i18n.tFormat('dash.subnet.bindIp', res.dhcp_static_ip);
            if (res.port_forwards_rebuilt) bindMsg += window.__i18n.tFormat('dash.subnet.bindPfUpdated', res.port_forwards_rebuilt);
            alert(bindMsg);
            // 刷新设备列表与子网可用 IP
            if (type === 'vm') { await $.loadData(); } else { await $.loadLxcContainers(); }
            await $.loadSubnets();
        } catch (e) {
            alert(window.__i18n.tFormat('dash.subnet.bindFailed', e.message));
        } finally {
            $.bindSubnetSubmitting.value = false;
        }
    };

    $.unbindSubnet = async function() {
        var ok = await window.customConfirm(window.__i18n.t('dash.subnet.unbindConfirm'));
        if (!ok) return;
        if ($.bindSubnetSubmitting.value) return;
        $.bindSubnetSubmitting.value = true;
        try {
            var type = $.bindSubnetDevice.type;
            var id = type === 'vm' ? $.bindSubnetDevice.vm_id : $.bindSubnetDevice.ct_id;
            await api('/' + type + '/' + id + '/unbind-subnet', { method: 'POST' });
            $.bsModalHide('bindSubnetModal');
            alert(window.__i18n.t('dash.subnet.unbound'));
            if (type === 'vm') { await $.loadData(); } else { await $.loadLxcContainers(); }
            await $.loadSubnets();
        } catch (e) {
            alert(window.__i18n.tFormat('dash.subnet.unbindFailed', e.message));
        } finally {
            $.bindSubnetSubmitting.value = false;
        }
    };

    // 私有网络 section 懒加载（core 查表派发，无需改 core）
    $.registerSectionLoader('subnet', function() {
        $.loadSubnets();
    });
})();
