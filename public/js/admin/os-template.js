// 管理端 OS 模板页面逻辑
window.__admin = window.__admin || {};
window.__admin.osTemplatePage = (function () {
    const osTemplates = Vue.ref([]);
    const formVisible = Vue.ref(false);
    const formData = Vue.reactive({
        name: '', template_vmid: '', os_type: '', os_version: '', arch: 'x86_64',
        system_disk_size: 20, target_storage: 'local-lvm', ciuser: '',
        description: '', switch_price: 0, icon: '', sort_order: 0,
        allowed_package_ids: '', enabled: 1, status: 'active'
    });
    const saving = Vue.ref(false);
    let editId = null;

    async function load() {
        try {
            const res = await authFetch('/api/admin/os-templates');
            if (res.success) osTemplates.value = res.data;
        } catch (e) {
            console.error('加载 OS 模板失败', e);
        }
    }

    function openForm(row) {
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
            const url = editId ? `/api/admin/os-templates/${editId}` : '/api/admin/os-templates';
            const method = editId ? 'PUT' : 'POST';
            const res = await authFetch(url, { method, body: JSON.stringify(formData) });
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
        if (!confirm(`确认删除系统模板「${row.name}」？`)) return;
        const res = await authFetch(`/api/admin/os-templates/${row.id}`, { method: 'DELETE' });
        if (res.success) {
            await load();
            pvToast.success('已删除');
        } else {
            pvToast.error(res.error || '删除失败');
        }
    }

    return { osTemplates, formVisible, formData, saving, editId, load, openForm, closeForm, save, deleteRow };
})();