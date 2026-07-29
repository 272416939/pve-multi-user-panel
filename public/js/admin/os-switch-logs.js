// 管理端 OS 切换日志页面逻辑
window.__admin = window.__admin || {};
window.__admin.osSwitchLogsPage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;

    var list = ref([]);
    var total = ref(0);
    var page = ref(1);
    var limit = 20;
    var filters = Vue.reactive({ status: '', vm_id: '', user_id: '' });
    var selectedIds = ref([]);
    var detail = ref(null);

    function getTotalPages() {
        return Math.max(1, Math.ceil(total.value / limit));
    }

    function formatTime(t) {
        if (!t) return '-';
        return formatDate(t);
    }

    // 加载列表
    async function load() {
        try {
            var params = '?page=' + page.value + '&limit=' + limit;
            if (filters.status) params += '&status=' + encodeURIComponent(filters.status);
            if (filters.vm_id) params += '&vm_id=' + encodeURIComponent(filters.vm_id);
            if (filters.user_id) params += '&user_id=' + encodeURIComponent(filters.user_id);
            var res = await api('/admin/os-switch-logs' + params);
            if (res && res.success) {
                list.value = res.data || [];
                total.value = res.total || 0;
                selectedIds.value = [];
            } else {
                list.value = [];
                total.value = 0;
            }
        } catch (e) {
            console.error('[os-switch-logs] 加载失败', e);
            list.value = [];
            total.value = 0;
        }
    }

    function resetFilters() {
        filters.status = '';
        filters.vm_id = '';
        filters.user_id = '';
        page.value = 1;
        load();
    }

    function goPage(p) {
        if (p < 1 || p > getTotalPages()) return;
        page.value = p;
        load();
    }

    // 全选/取消
    function toggleAll(e) {
        if (e.target.checked) {
            selectedIds.value = list.value.map(function(r) { return r.id; });
        } else {
            selectedIds.value = [];
        }
    }
    function toggleOne(id) {
        var idx = selectedIds.value.indexOf(id);
        if (idx > -1) {
            selectedIds.value.splice(idx, 1);
        } else {
            selectedIds.value.push(id);
        }
    }

    function isAllSelected() {
        return list.value.length > 0 && selectedIds.value.length === list.value.length;
    }

    // 详情弹窗
    function showDetail(row) {
        detail.value = row;
        var el = document.getElementById('osSwitchLogDetailModal');
        if (el) {
            var modal = new bootstrap.Modal(el);
            modal.show();
        }
    }

    // 单条删除
    async function deleteRow(id) {
        if (!confirm('确认删除日志 #' + id + '？')) return;
        try {
            var res = await api('/admin/os-switch-logs/' + id, { method: 'DELETE' });
            if (res && res.success) {
                await load();
            } else {
                alert(res.error || '删除失败');
            }
        } catch (e) {
            alert('删除请求失败');
        }
    }

    // 批量删除
    async function batchDelete() {
        var ids = selectedIds.value;
        if (ids.length === 0) {
            alert('请先选择要删除的日志');
            return;
        }
        if (!confirm('确认删除选中的 ' + ids.length + ' 条日志？')) return;
        try {
            var res = await api('/admin/os-switch-logs/batch-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: ids })
            });
            if (res && res.success) {
                alert(res.message || '已删除');
                selectedIds.value = [];
                await load();
            } else {
                alert(res.error || '批量删除失败');
            }
        } catch (e) {
            alert('请求失败');
        }
    }

    // 清空全部
    async function clearAll() {
        if (!confirm('⚠️ 高危操作！确认清空所有切换日志（运行中和需介入的日志将被保留）？')) return;
        var confirmStr = prompt('请输入 CLEAR_ALL_OS_SWITCH_LOGS 确认清空：');
        if (confirmStr !== 'CLEAR_ALL_OS_SWITCH_LOGS') {
            alert('确认串不正确');
            return;
        }
        try {
            var res = await api('/admin/os-switch-logs/clear', {
                method: 'POST',
                body: JSON.stringify({ confirm: confirmStr })
            });
            if (res && res.success) {
                alert(res.message || '已清空');
                await load();
            } else {
                alert(res.error || '清空失败');
            }
        } catch (e) {
            alert('请求失败');
        }
    }

    return {
        list: list, total: total, page: page, filters: filters,
        selectedIds: selectedIds, detail: detail,
        get totalPages() { return getTotalPages(); },
        allSelected: isAllSelected(),
        load: load, resetFilters: resetFilters, goPage: goPage,
        toggleAll: toggleAll, toggleOne: toggleOne,
        showDetail: showDetail,
        deleteRow: deleteRow, batchDelete: batchDelete, clearAll: clearAll
    };
})();
