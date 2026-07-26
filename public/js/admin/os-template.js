// 管理端 OS 模板页面逻辑
// 使用全局 api() 函数发起请求（定义在 shared.js 中）
window.__admin = window.__admin || {};
window.__admin.osTemplatePage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var watch = Vue.watch;

    const osTemplates = ref([]);
    const formVisible = ref(false);
    const pveTemplateVms = ref([]);       // PVE 模板 VM 列表（下拉选择用）
    const pveConfigLoading = ref(false);  // 加载 PVE 模板配置中
    const formData = Vue.reactive({
        name: '', template_vmid: '', os_type: '', os_version: '', arch: 'x86_64',
        system_disk_size: 20, target_storage: 'local-lvm', ciuser: '',
        description: '', switch_price: 0, icon: '', sort_order: 0,
        allowed_package_ids: '', enabled: 1, status: 'active'
    });
    const saving = ref(false);
    let editId = null;

    // 加载 PVE 模板 VM 列表（仅 template=1）
    async function loadPveTemplates() {
        try {
            var data = await api('/pve/vms?template_only=1');
            // api() 返回的可能是 {available, assigned} 格式，也可能是数组
            if (data && data.available) {
                pveTemplateVms.value = (data.available || []).concat(data.assigned || []);
            } else if (Array.isArray(data)) {
                pveTemplateVms.value = data;
            } else if (data && data.data) {
                pveTemplateVms.value = data.data;
            } else {
                pveTemplateVms.value = [];
            }
        } catch (e) {
            console.error('加载 PVE 模板列表失败', e);
            pveTemplateVms.value = [];
        }
    }

    // 选择 PVE 模板后自动填充字段
    async function onTemplateVmidChange(newVmid) {
        if (!newVmid) return;
        pveConfigLoading.value = true;
        try {
            var res = await api('/admin/pve-template-config/' + newVmid);
            if (res && res.success && res.data) {
                var d = res.data;
                // 自动填充字段（保留用户已手动修改的 name，仅首次填充）
                if (!editId) {
                    formData.name = d.name || '';
                }
                formData.os_type = d.os_type || '';
                formData.os_version = d.os_version || '';
                formData.arch = d.arch || 'x86_64';
                formData.system_disk_size = d.system_disk_size || 20;
                formData.target_storage = d.target_storage || 'local-lvm';
                formData.ciuser = d.ciuser || '';
            }
        } catch (e) {
            console.error('加载 PVE 模板配置失败', e);
        } finally {
            pveConfigLoading.value = false;
        }
    }

    async function load() {
        try {
            const res = await api('/admin/os-templates');
            if (res.success) osTemplates.value = res.data;
        } catch (e) {
            console.error('加载 OS 模板失败', e);
        }
    }

    function openForm(row) {
        loadPveTemplates();
        if (row) {
            Object.assign(formData, row);
            editId = row.id;
        } else {
            Object.keys(formData).forEach(k => {
                if (k === 'enabled') formData[k] = 1;
                else if (k === 'status') formData[k] = 'active';
                else if (k === 'system_disk_size') formData[k] = 20;
                else if (k === 'switch_price') formData[k] = 0;
                else if (k === 'target_storage') formData[k] = 'local-lvm';
                else if (k === 'arch') formData[k] = 'x86_64';
                else if (k === 'sort_order') formData[k] = 0;
                else formData[k] = '';
            });
            editId = null;
        }
        formVisible.value = true;
        const el = document.getElementById('osTemplateFormModal');
        if (el) {
            const modal = new bootstrap.Modal(el);
            modal.show();
        }
    }

    function closeForm() {
        formVisible.value = false;
        const el = document.getElementById('osTemplateFormModal');
        if (el) {
            const modal = bootstrap.Modal.getInstance(el);
            if (modal) modal.hide();
        }
    }

    async function save() {
        saving.value = true;
        try {
            const url = editId ? '/admin/os-templates/' + editId : '/admin/os-templates';
            const method = editId ? 'PUT' : 'POST';
            const res = await api(url, { method, body: JSON.stringify(formData) });
            if (res.success) {
                closeForm();
                await load();
                pvToast.success(editId ? '已更新' : '已创建');
            } else {
                pvToast.error(res.error || '操作失败');
            }
        } catch (e) {
            pvToast.error('请求失败');
        } finally {
            saving.value = false;
        }
    }

    async function deleteRow(row) {
        if (!confirm('确认删除系统模板「' + row.name + '」？')) return;
        const res = await api('/admin/os-templates/' + row.id, { method: 'DELETE' });
        if (res.success) {
            await load();
            pvToast.success('已删除');
        } else {
            pvToast.error(res.error || '删除失败');
        }
    }

    return { osTemplates, formVisible, formData, saving, editId, pveTemplateVms, pveConfigLoading, load, openForm, closeForm, save, deleteRow, onTemplateVmidChange, loadPveTemplates };
})();