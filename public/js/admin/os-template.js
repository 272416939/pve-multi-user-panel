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
        name: '', template_vmid: '', os_type: '', os_version: '', ostype: '', arch: 'x86_64',
        target_storage: 'local-lvm', disk_format: '', ciuser: '',
        description: '', icon: '', sort_order: 0,
        allowed_package_ids: '', enabled: 1, status: 'active'
    });
    const saving = ref(false);
    let editId = null;
    // 请求序号保护：PVE 模板配置异步加载只采纳最后一次请求，防止旧响应覆盖新打开的表单
    // （用户关闭弹窗后旧请求才返回，会把上次模板的数据写进新表单——同 admin.js userLoadSeq 模式）
    let vmidConfigSeq = 0;
    const allStorages = ref([]);  // PVE 存储列表（目标存储下拉用）

    // 加载 PVE 模板 VM 列表（仅 template=1）
    async function loadPveTemplates() {
        try {
            var data = await api('/pve/vms?template_only=1');
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

    // 加载 PVE 存储列表
    async function loadAllStorages() {
        try {
            var data = await api('/admin/storages/all');
            allStorages.value = Array.isArray(data) ? data : (data && data.data ? data.data : []);
        } catch (e) {
            console.error('加载存储列表失败', e);
            allStorages.value = [];
        }
    }

    // 选择 PVE 模板后自动填充字段
    async function onTemplateVmidChange(newVmid) {
        if (!newVmid) return;
        var seq = ++vmidConfigSeq;
        pveConfigLoading.value = true;
        try {
            var res = await api('/admin/pve-template-config/' + newVmid);
            if (seq !== vmidConfigSeq) return; // 已有更新的请求/已打开新表单，丢弃过期响应
            if (res && res.success && res.data) {
                var d = res.data;
                if (!editId) {
                    formData.name = d.name || '';
                }
                formData.os_type = d.os_type || '';
                formData.os_version = d.os_version || '';
                formData.arch = d.arch || 'x86_64';
                if (!editId) {
                    formData.target_storage = d.target_storage || 'local-lvm';
                }
                formData.ciuser = d.ciuser || '';
            }
        } catch (e) {
            if (seq !== vmidConfigSeq) return;
            console.error('加载 PVE 模板配置失败', e);
        } finally {
            if (seq === vmidConfigSeq) pveConfigLoading.value = false;
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
        // 使所有挂起的 PVE 配置请求失效，防止旧响应污染新打开的表单
        vmidConfigSeq++;
        loadPveTemplates();
        loadAllStorages();
        if (row) {
            Object.assign(formData, row);
            editId = row.id;
        } else {
            Object.keys(formData).forEach(k => {
                if (k === 'enabled') formData[k] = 1;
                else if (k === 'status') formData[k] = 'active';
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
                alert(editId ? '已更新' : '已创建');
            } else {
                alert(res.error || '操作失败');
            }
        } catch (e) {
            alert('请求失败');
        } finally {
            saving.value = false;
        }
    }

    async function deleteRow(row) {
        if (!(await window.customConfirm('确认删除系统模板「' + row.name + '」？'))) return;
        const res = await api('/admin/os-templates/' + row.id, { method: 'DELETE' });
        if (res.success) {
            await load();
            alert('已删除');
        } else {
            alert(res.error || '删除失败');
        }
    }

    return { osTemplates, formVisible, formData, saving, editId, pveTemplateVms, pveConfigLoading, allStorages, load, openForm, closeForm, save, deleteRow, onTemplateVmidChange, loadPveTemplates, loadAllStorages };
})();