(function() {
    var Vue = window.Vue;
    var admin = window.__admin;
    var $ = {};

    $.vmPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, disk_size: 0,
        monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' });
    $.lxcPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, swap: 0, disk_size: 0,
        monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' });
    $.vmPackages = Vue.ref([]);
    $.lxcPackages = Vue.ref([]);
    $.vmTemplateOptions = Vue.ref([]);
    $.lxcTemplateOptions = Vue.ref([]);

    $.vmProvisionForm = Vue.ref({ package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' });
    $.lxcProvisionForm = Vue.ref({ package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' });

    $.loadVmPackages = async function() {
        try { $.vmPackages.value = await api('/admin/vm-packages'); } catch (e) {}
    };
    $.loadLxcPackages = async function() {
        try { $.lxcPackages.value = await api('/admin/lxc-packages'); } catch (e) {}
    };

    $.loadVmTemplateOptions = async function() {
        try { $.vmTemplateOptions.value = await api('/admin/vm-templates'); } catch (e) {}
    };
    $.loadLxcTemplateOptions = async function() {
        try { $.lxcTemplateOptions.value = await api('/admin/lxc-templates'); } catch (e) {}
    };

    $.openVmPackageForm = function(p) {
        if (p) { $.vmPackageForm.value = Object.assign({}, p); }
        else { $.vmPackageForm.value = { id: null, name: '', template_id: '', cores: 0, memory: 0, disk_size: 0,
            monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' }; }
        $.loadVmTemplateOptions().then(function() { admin.bsModalShow('vmPackageModal'); });
    };

    $.saveVmPackage = async function() {
        var f = $.vmPackageForm.value;
        try {
            if (f.id) {
                await api('/admin/vm-packages/' + f.id, { method: 'PUT', body: JSON.stringify(f) });
            } else {
                await api('/admin/vm-packages', { method: 'POST', body: JSON.stringify(f) });
            }
            admin.bsModalHide('vmPackageModal');
            await $.loadVmPackages();
        } catch (e) { alert(e.message); }
    };

    $.deleteVmPackage = async function(id) {
        if (!await window.customConfirm('确定删除此套餐？')) return;
        try { await api('/admin/vm-packages/' + id, { method: 'DELETE' }); await $.loadVmPackages(); } catch (e) { alert(e.message); }
    };

    $.openLxcPackageForm = function(p) {
        if (p) { $.lxcPackageForm.value = Object.assign({}, p); }
        else { $.lxcPackageForm.value = { id: null, name: '', template_id: '', cores: 0, memory: 0, swap: 0, disk_size: 0,
            monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' }; }
        $.loadLxcTemplateOptions().then(function() { admin.bsModalShow('lxcPackageModal'); });
    };

    $.saveLxcPackage = async function() {
        var f = $.lxcPackageForm.value;
        try {
            if (f.id) {
                await api('/admin/lxc-packages/' + f.id, { method: 'PUT', body: JSON.stringify(f) });
            } else {
                await api('/admin/lxc-packages', { method: 'POST', body: JSON.stringify(f) });
            }
            admin.bsModalHide('lxcPackageModal');
            await $.loadLxcPackages();
        } catch (e) { alert(e.message); }
    };

    $.deleteLxcPackage = async function(id) {
        if (!await window.customConfirm('确定删除此套餐？')) return;
        try { await api('/admin/lxc-packages/' + id, { method: 'DELETE' }); await $.loadLxcPackages(); } catch (e) { alert(e.message); }
    };

    $.provisionVm = async function() {
        var f = $.vmProvisionForm.value;
        if (!f.package_id || !f.user_id) return alert('请选择套餐和用户');
        var pkg = $.vmPackages.value.find(function(p) { return String(p.id) === String(f.package_id); });
        if (!pkg) return alert('套餐不存在');
        try {
            var expDate = f.expiration_date ? new Date(f.expiration_date.replace('T', ' ')).toISOString() : null;
            await api('/admin/vm-packages/' + f.package_id + '/provision', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: f.user_id, name: f.name || '', expiration_date: expDate,
                    renewal_price: String(pkg.monthly_price), renewal_period: f.renewal_period || 'month',
                    mac_group_id: f.mac_group_id || null
                })
            });
            $.vmProvisionForm.value = { package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' };
            alert('VM 开通成功');
            if (window.vmPage && window.vmPage.loadData) await window.vmPage.loadData();
            if (window.vmPage && window.vmPage.loadAssignData) await window.vmPage.loadAssignData();
        } catch (e) { alert(e.message); }
    };

    $.provisionLxc = async function() {
        var f = $.lxcProvisionForm.value;
        if (!f.package_id || !f.user_id) return alert('请选择套餐和用户');
        var pkg = $.lxcPackages.value.find(function(p) { return String(p.id) === String(f.package_id); });
        if (!pkg) return alert('套餐不存在');
        try {
            var expDate = f.expiration_date ? new Date(f.expiration_date.replace('T', ' ')).toISOString() : null;
            await api('/admin/lxc-packages/' + f.package_id + '/provision', {
                method: 'POST',
                body: JSON.stringify({
                    user_id: f.user_id, name: f.name || '', expiration_date: expDate,
                    renewal_price: String(pkg.monthly_price), renewal_period: f.renewal_period || 'month',
                    mac_group_id: f.mac_group_id || null
                })
            });
            $.lxcProvisionForm.value = { package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' };
            alert('LXC 开通成功');
            if (window.lxcPage && window.lxcPage.loadUserLxcContainers) await window.lxcPage.loadUserLxcContainers();
            if (window.lxcPage && window.lxcPage.loadLxcContainers) await window.lxcPage.loadLxcContainers();
        } catch (e) { alert(e.message); }
    };

    $.getTemplateName = function(p) {
        var opts = p.template_id ? $.vmTemplateOptions.value : $.lxcTemplateOptions.value;
        var t = opts.find(function(o) { return String(o.id) === String(p.template_id); });
        return t ? t.name : '未知模板';
    };

    admin.packagePage = $;
})();
