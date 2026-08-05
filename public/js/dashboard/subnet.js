(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;

    // ==================== 状态 ====================
    $.subnets = ref([]);
    $.subnetLoading = ref(false);
    $.subnetCreating = ref(false);
    // 绑定子网弹窗状态
    $.bindSubnetDevice = reactive({ type: 'vm', vm_id: null, ct_id: null, name: '', status: null, dhcp_static_ip: '' });
    $.bindSubnetCurrentSubnet = ref(null);
    $.bindSubnetForm = reactive({ subnet_id: 0 });
    $.bindSubnetSubmitting = ref(false);

    // ==================== 子网列表 ====================
    $.loadSubnets = async function() {
        $.subnetLoading.value = true;
        try {
            var list = await api('/subnets');
            $.subnets.value = list || [];
        } catch (e) {
            console.error('加载子网列表失败', e);
        } finally {
            $.subnetLoading.value = false;
        }
    };

    // ==================== 新建子网 ====================
    $.openCreateSubnet = function() {
        $.bsModalShow('createSubnetModal');
    };

    $.createSubnet = async function() {
        if ($.subnetCreating.value) return;
        $.subnetCreating.value = true;
        try {
            await api('/subnets', { method: 'POST' });
            $.bsModalHide('createSubnetModal');
            await $.loadSubnets();
            alert('私有网络子网已创建');
        } catch (e) {
            alert('创建失败：' + e.message);
        } finally {
            $.subnetCreating.value = false;
        }
    };

    // ==================== 删除子网 ====================
    $.deleteSubnet = async function(s) {
        var ok = await window.customConfirm('确定删除子网 ' + s.vlan_name + '（' + (s.cidr || '') + '）？\n删除前请先解绑其下所有服务器。');
        if (!ok) return;
        try {
            await api('/subnets/' + s.id, { method: 'DELETE' });
            await $.loadSubnets();
        } catch (e) {
            alert('删除失败：' + e.message);
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
        if (!subnetId) return alert('请选择要绑定的子网');
        if ($.bindSubnetSubmitting.value) return;
        $.bindSubnetSubmitting.value = true;
        try {
            var type = $.bindSubnetDevice.type;
            var id = type === 'vm' ? $.bindSubnetDevice.vm_id : $.bindSubnetDevice.ct_id;
            var res = await api('/' + type + '/' + id + '/bind-subnet', { method: 'POST', body: { subnet_id: subnetId } });
            $.bsModalHide('bindSubnetModal');
            alert('绑定成功' + (res.dhcp_static_ip ? '，分配 IP：' + res.dhcp_static_ip : ''));
            // 刷新设备列表与子网可用 IP
            if (type === 'vm') { await $.loadData(); } else { await $.loadLxcContainers(); }
            await $.loadSubnets();
        } catch (e) {
            alert('绑定失败：' + e.message);
        } finally {
            $.bindSubnetSubmitting.value = false;
        }
    };

    $.unbindSubnet = async function() {
        var ok = await window.customConfirm('确定解绑当前子网？\n解绑后该服务器关机后将无法开机，需重新绑定子网后才能启动。');
        if (!ok) return;
        if ($.bindSubnetSubmitting.value) return;
        $.bindSubnetSubmitting.value = true;
        try {
            var type = $.bindSubnetDevice.type;
            var id = type === 'vm' ? $.bindSubnetDevice.vm_id : $.bindSubnetDevice.ct_id;
            await api('/' + type + '/' + id + '/unbind-subnet', { method: 'POST' });
            $.bsModalHide('bindSubnetModal');
            alert('已解绑子网');
            if (type === 'vm') { await $.loadData(); } else { await $.loadLxcContainers(); }
            await $.loadSubnets();
        } catch (e) {
            alert('解绑失败：' + e.message);
        } finally {
            $.bindSubnetSubmitting.value = false;
        }
    };

    // 私有网络 section 懒加载（core 查表派发，无需改 core）
    $.registerSectionLoader('subnet', function() {
        $.loadSubnets();
    });
})();
