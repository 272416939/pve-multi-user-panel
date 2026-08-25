(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;

    $.templatePage = {};
    var tp = $.templatePage;

    tp.vmTemplateForm = ref({ id: null, name: '', template_vmid: '', cores: 1, memory: 1024, disk_size: 20,
        network_bridge: 'vmbr0', network_model: 'virtio', os_type: '', target_storage: 'local-lvm', clone_mode: 'full',
        cpu_affinity: '', mac_group_id: '', description: '', status: 'active', pve_node_id: null });
    tp.lxcTemplateForm = ref({ id: null, name: '', ostemplate: '', storage: 'local', cores: 1, memory: 512,
        swap: 512, disk_size: 8, network_bridge: 'vmbr0', network_mode: 'dhcp', unprivileged: 1,
        features: '', mac_group_id: '', description: '', status: 'active', pve_node_id: null });
    tp.vmTemplates = ref([]);
    tp.lxcTemplates = ref([]);
    tp.templateVmIdList = ref([]);
    tp.lxctemplateOstemplateList = ref([]);
    tp.lxctemplateStorageList = ref([]);
    tp.lxcStorages = ref([]);
    tp.lxcTplStorages = ref([]);
    // LXC 特性多选下拉（模板弹窗；技术枚举值存储为逗号串 'nesting=1,...'）
    tp.lxcFeatureOpen = ref(false);
    tp.lxcFeaturesSet = ref(new Set());
    tp.lxcFeatureText = computed(function() {
        return [...tp.lxcFeaturesSet.value].map(function(k) { return k + '=1'; }).join(',');
    });
    tp.toggleLxcFeatureDropdown = function() {
        tp.lxcFeatureOpen.value = !tp.lxcFeatureOpen.value;
    };
    tp.toggleLxcFeature = function(opt) {
        $.toggleLxcFeature(tp.lxcFeaturesSet, tp.lxcTemplateForm, 'features', opt);
    };
    tp.lxcOstemplates = ref([]);
    tp.pveNodeOptions = ref([]);

    tp.loadNodeOptions = async function() {
        try {
            var res = await api('/admin/pve/nodes');
            tp.pveNodeOptions.value = (res && res.nodes) || [];
        } catch (e) { console.error('加载 PVE 节点列表失败', e); }
    };

    tp.loadLxcStorages = async function() {
        // 多节点：存储列表按表单所选节点拉取（后端必填校验），未选节点清空
        // 本列表=rootdir 存储（容器 rootfs 用，「容器存储」下拉）；模板来源存储另走 loadLxcTplStorages
        try {
            var nid = tp.lxcTemplateForm.value.pve_node_id;
            if (!nid) { tp.lxcStorages.value = []; return; }
            tp.lxcStorages.value = await api('/lxc/storages?node_id=' + encodeURIComponent(nid));
        } catch (e) { tp.lxcStorages.value = []; }
    };

    // 多节点：CT 模板来源存储（content 含 vztmpl，如 local）——「模板存储」下拉专用；
    // 与 rootdir 列表分离：local 是 iso,vztmpl,backup 不在 rootdir 过滤内，旧共用列表导致看不到已下载模板
    tp.loadLxcTplStorages = async function() {
        try {
            var nid = tp.lxcTemplateForm.value.pve_node_id;
            if (!nid) { tp.lxcTplStorages.value = []; return; }
            tp.lxcTplStorages.value = await api('/lxc/storages?node_id=' + encodeURIComponent(nid) + '&content=vztmpl');
        } catch (e) { tp.lxcTplStorages.value = []; }
    };

    tp.loadLxcOstemplates = async function(storage) {
        if (!storage) return;
        // 多节点：模板文件列表同样限定在所选节点
        try {
            var nid = tp.lxcTemplateForm.value.pve_node_id;
            var qs = 'storage=' + encodeURIComponent(storage) + (nid ? '&node_id=' + encodeURIComponent(nid) : '');
            tp.lxcOstemplates.value = await api('/lxc/templates?' + qs);
        } catch (e) { tp.lxcOstemplates.value = []; }
    };

    tp.pveTemplateVms = ref([]);
    tp.allStorages = ref([]);

    tp.loadPveTemplateVms = async function() {
        // 多节点：按 VM 模板表单所选节点拉取，未选节点清空
        try {
            var nid = tp.vmTemplateForm.value.pve_node_id;
            if (!nid) { tp.pveTemplateVms.value = []; return; }
            var data = await api('/pve/vms?template_only=1&node_id=' + encodeURIComponent(nid));
            tp.pveTemplateVms.value = (data.available || []).concat(data.assigned || []);
        } catch (e) { tp.pveTemplateVms.value = []; }
    };

    tp.loadAllStorages = async function() {
        try {
            var nid = tp.vmTemplateForm.value.pve_node_id;
            if (!nid) { tp.allStorages.value = []; return; }
            tp.allStorages.value = await api('/admin/storages/all?node_id=' + encodeURIComponent(nid));
        } catch (e) { tp.allStorages.value = []; }
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
            tp.vmTemplateForm.value.mac_group_id = t.mac_group_id || '';
        } else {
            tp.vmTemplateForm.value = { id: null, name: '', template_vmid: '', cores: 1, memory: 1024, disk_size: 20,
                network_bridge: 'vmbr0', network_model: 'virtio', os_type: '', ciuser: '',
                target_storage: 'local-lvm', clone_mode: 'full',
                cpu_affinity: '', mac_group_id: '', description: '', status: 'active', pve_node_id: null };
        }
        // 多节点：候选按（已回填的）所选节点加载，须在表单赋值之后执行
        tp.loadNodeOptions();
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
        if (!await window.customConfirm(window.__i18n.t('admin.tplpage.delVmConfirm'))) return;
        try {
            await api('/admin/vm-templates/' + id, { method: 'DELETE' });
            await tp.loadVmTemplates();
        } catch (e) { alert(e.message); }
    };

    tp.openLxcTemplateForm = function(t) {
        if (t) {
            tp.lxcTemplateForm.value = Object.assign({}, t);
            tp.lxcTemplateForm.value.rootfs_storage = t.rootfs_storage || 'local-lvm';
            tp.lxcTemplateForm.value.mac_group_id = t.mac_group_id || '';
        } else {
            tp.lxcTemplateForm.value = { id: null, name: '', ostemplate: '', storage: '', rootfs_storage: 'local-lvm', cores: 1, memory: 512,
                swap: 512, disk_size: 8, network_bridge: 'vmbr0', network_mode: 'dhcp',
                ipv6_enabled: 1, ip6_mode: 'dhcp', ip6_addr: '', ip4_addr: '',
                unprivileged: 1, features: '', mac_group_id: '', description: '', status: 'active', pve_node_id: null };
        }
        // 多节点：候选按（已回填的）所选节点加载，须在表单赋值之后执行
        tp.loadNodeOptions();
        tp.loadLxcStorages();
        tp.loadLxcTplStorages();
        if (tp.lxcTemplateForm.value.storage) {
            tp.loadLxcOstemplates(tp.lxcTemplateForm.value.storage);
        }
        // 特性多选：编辑回显存量值（新建为空）
        $.syncLxcFeatureSet(tp.lxcFeaturesSet, tp.lxcTemplateForm, 'features');
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
        if (!await window.customConfirm(window.__i18n.t('admin.tplpage.delLxcConfirm'))) return;
        try {
            await api('/admin/lxc-templates/' + id, { method: 'DELETE' });
            await tp.loadLxcTemplates();
        } catch (e) { alert(e.message); }
    };

    $.initTemplate = function() {
        // LXC 特性多选下拉：点击外部关闭
        document.addEventListener('click', function(e) {
            if (tp.lxcFeatureOpen.value && !(e.target && e.target.closest && e.target.closest('.lxc-feature-dropdown'))) {
                tp.lxcFeatureOpen.value = false;
            }
        });
        Vue.watch(function() { return tp.lxcTemplateForm.value.storage; }, function(newVal) {
            tp.lxcOstemplates.value = [];
            if (newVal) {
                tp.loadLxcOstemplates(newVal);
            }
        });
        // 多节点：切节点联动——VM 模板表单重载模板候选/存储；LXC 模板表单重载存储并清空已选
        Vue.watch(function() { return tp.vmTemplateForm.value.pve_node_id; }, function(nv, ov) {
            if (nv === ov) return;
            tp.vmTemplateForm.value.template_vmid = '';
            tp.loadPveTemplateVms();
            tp.loadAllStorages();
        });
        Vue.watch(function() { return tp.lxcTemplateForm.value.pve_node_id; }, function(nv, ov) {
            if (nv === ov) return;
            tp.lxcTemplateForm.value.storage = '';
            tp.lxcTemplateForm.value.ostemplate = '';
            tp.lxcOstemplates.value = [];
            tp.loadLxcStorages();
            tp.loadLxcTplStorages();
        });
    };
    window.__admin.templatePage = tp;
})();
