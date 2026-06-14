(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;

    $.templatePage = {};
    var tp = $.templatePage;

    tp.vmTemplateForm = ref({ id: null, name: '', template_vmid: '', cores: 1, memory: 1024, disk_size: 20,
        network_bridge: 'vmbr0', network_model: 'virtio', os_type: '', target_storage: 'local-lvm', clone_mode: 'full',
        cpu_affinity: '', description: '', status: 'active' });
    tp.lxcTemplateForm = ref({ id: null, name: '', ostemplate: '', storage: 'local', cores: 1, memory: 512,
        swap: 512, disk_size: 8, network_bridge: 'vmbr0', network_mode: 'dhcp', unprivileged: 1,
        features: '', description: '', status: 'active' });
    tp.vmTemplates = ref([]);
    tp.lxcTemplates = ref([]);
    tp.templateVmIdList = ref([]);
    tp.lxctemplateOstemplateList = ref([]);
    tp.lxctemplateStorageList = ref([]);
    tp.lxcStorages = ref([]);
    tp.lxcOstemplates = ref([]);

    tp.loadLxcStorages = async function() {
        try { tp.lxcStorages.value = await api('/lxc/storages'); } catch (e) {}
    };

    tp.loadLxcOstemplates = async function(storage) {
        if (!storage) return;
        try { tp.lxcOstemplates.value = await api('/lxc/templates?storage=' + encodeURIComponent(storage)); } catch (e) {}
    };

    tp.pveTemplateVms = ref([]);
    tp.allStorages = ref([]);

    tp.loadPveTemplateVms = async function() {
        try { tp.pveTemplateVms.value = await api('/pve/vms'); } catch (e) {}
    };

    tp.loadAllStorages = async function() {
        try { tp.allStorages.value = await api('/admin/storages/all'); } catch (e) {}
    };

    tp.loadVmTemplates = async function() {
        try { tp.vmTemplates.value = await api('/admin/vm-templates'); } catch (e) {}
    };

    tp.loadLxcTemplates = async function() {
        try { tp.lxcTemplates.value = await api('/admin/lxc-templates'); } catch (e) {}
    };

    tp.openVmTemplateForm = function(t) {
        if (t) {
            tp.vmTemplateForm.value = Object.assign({}, t);
        } else {
            tp.vmTemplateForm.value = { id: null, name: '', template_vmid: '', cores: 1, memory: 1024, disk_size: 20,
                network_bridge: 'vmbr0', network_model: 'virtio', os_type: '', target_storage: 'local-lvm', clone_mode: 'full',
                cpu_affinity: '', description: '', status: 'active' };
        }
        tp.loadPveTemplateVms();
        tp.loadAllStorages();
        $.bsModalShow('vmTemplateModal');
    };

    tp.saveVmTemplate = async function() {
        var f = tp.vmTemplateForm.value;
        var body = JSON.stringify(f);
        try {
            if (f.id) {
                await api('/admin/vm-templates/' + f.id, { method: 'PUT', body: body });
            } else {
                await api('/admin/vm-templates', { method: 'POST', body: body });
            }
            $.bsModalHide('vmTemplateModal');
            await tp.loadVmTemplates();
        } catch (e) { alert(e.message); }
    };

    tp.deleteVmTemplate = async function(id) {
        if (!await window.customConfirm('确定删除此 VM 模板？')) return;
        try {
            await api('/admin/vm-templates/' + id, { method: 'DELETE' });
            await tp.loadVmTemplates();
        } catch (e) { alert(e.message); }
    };

    tp.openLxcTemplateForm = function(t) {
        if (t) {
            tp.lxcTemplateForm.value = Object.assign({}, t);
            tp.lxcTemplateForm.value.rootfs_storage = t.rootfs_storage || 'local-lvm';
        } else {
            tp.lxcTemplateForm.value = { id: null, name: '', ostemplate: '', storage: '', rootfs_storage: 'local-lvm', cores: 1, memory: 512,
                swap: 512, disk_size: 8, network_bridge: 'vmbr0', network_mode: 'dhcp', unprivileged: 1,
                features: '', description: '', status: 'active' };
        }
        tp.loadLxcStorages();
        if (tp.lxcTemplateForm.value.storage) {
            tp.loadLxcOstemplates(tp.lxcTemplateForm.value.storage);
        }
        $.bsModalShow('lxcTemplateModal');
    };

    tp.saveLxcTemplate = async function() {
        var f = tp.lxcTemplateForm.value;
        var body = JSON.stringify(f);
        try {
            if (f.id) {
                await api('/admin/lxc-templates/' + f.id, { method: 'PUT', body: body });
            } else {
                await api('/admin/lxc-templates', { method: 'POST', body: body });
            }
            $.bsModalHide('lxcTemplateModal');
            await tp.loadLxcTemplates();
        } catch (e) { alert(e.message); }
    };

    tp.deleteLxcTemplate = async function(id) {
        if (!await window.customConfirm('确定删除此 LXC 模板？')) return;
        try {
            await api('/admin/lxc-templates/' + id, { method: 'DELETE' });
            await tp.loadLxcTemplates();
        } catch (e) { alert(e.message); }
    };

    $.initTemplate = function() {
        Vue.watch(function() { return tp.lxcTemplateForm.value.storage; }, function(newVal) {
            tp.lxcOstemplates.value = [];
            if (newVal) {
                tp.loadLxcOstemplates(newVal);
            }
        });
    };
    window.templatePage = tp;
})();
