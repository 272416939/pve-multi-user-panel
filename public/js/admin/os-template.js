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
    // 编辑/新增模式由 formData.id 判断（reactive 引用，模板可响应；
    // 曾用模块级 let editId 返回给模板，但对象字面量只拷贝原始值，永远为 null → 标题恒显"新增"）
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
                if (!formData.id) {
                    formData.name = d.name || '';
                }
                formData.os_type = d.os_type || '';
                formData.os_version = d.os_version || '';
                formData.arch = d.arch || 'x86_64';
                if (!formData.id) {
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
        } else {
            Object.keys(formData).forEach(k => {
                if (k === 'enabled') formData[k] = 1;
                else if (k === 'status') formData[k] = 'active';
                else if (k === 'target_storage') formData[k] = 'local-lvm';
                else if (k === 'arch') formData[k] = 'x86_64';
                else if (k === 'sort_order') formData[k] = 0;
                else formData[k] = '';
            });
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
            const url = formData.id ? '/admin/os-templates/' + formData.id : '/admin/os-templates';
            const method = formData.id ? 'PUT' : 'POST';
            const res = await api(url, { method, body: JSON.stringify(formData) });
            if (res.success) {
                closeForm();
                await load();
                alert(formData.id ? window.__i18n.t('common.updated') : window.__i18n.t('common.created'));
            } else {
                alert(res.error || window.__i18n.t('common.failed'));
            }
        } catch (e) {
            alert(window.__i18n.t('shared.requestFailed'));
        } finally {
            saving.value = false;
        }
    }

    async function deleteRow(row) {
        if (!(await window.customConfirm(window.__i18n.t('admin.ostemplate.delConfirm') + row.name + '」？'))) return;
        const res = await api('/admin/os-templates/' + row.id, { method: 'DELETE' });
        if (res.success) {
            await load();
            alert(window.__i18n.t('dash.disk.deleteFailed'));
        } else {
            alert(res.error || window.__i18n.t('admin.logs.deleteFailed'));
        }
    }

    // ==================== 拖拽排序（参照 package.js 表格行拖拽成熟实现，单列表简化版） ====================
    const dragState = Vue.reactive({ draggingId: null, dragOverId: null, dragFromIndex: -1, dragHandled: false });
    let dragFallbackTimer = null;
    let touchClone = null;

    // 行避让动画：被拖行经过时其余行平移让位
    function applyAvoidTransform(overId) {
        var list = osTemplates.value;
        var fromIndex = dragState.dragFromIndex;
        var toIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === overId) { toIndex = i; break; }
        }
        if (fromIndex < 0 || toIndex < 0) return;
        var rows = document.querySelectorAll('#osTemplateTable tbody tr');
        if (!rows || rows.length === 0) return;
        var offset = rows[0].offsetHeight;
        for (var j = 0; j < rows.length; j++) rows[j].style.transform = '';
        if (fromIndex < toIndex) {
            for (var k = fromIndex + 1; k <= toIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translateY(-' + offset + 'px)';
            }
            if (fromIndex < rows.length) {
                rows[fromIndex].style.transform = 'translateY(' + ((toIndex - fromIndex) * offset) + 'px)';
            }
        } else if (fromIndex > toIndex) {
            for (var k = toIndex; k < fromIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translateY(' + offset + 'px)';
            }
            if (fromIndex < rows.length) {
                rows[fromIndex].style.transform = 'translateY(-' + ((fromIndex - toIndex) * offset) + 'px)';
            }
        }
    }

    function clearAllTransform() {
        var rows = document.querySelectorAll('#osTemplateTable tbody tr');
        for (var i = 0; i < rows.length; i++) rows[i].style.transform = '';
    }

    function clearDragState() {
        dragState.draggingId = null;
        dragState.dragOverId = null;
        dragState.dragFromIndex = -1;
        dragState.dragHandled = false;
        clearAllTransform();
    }

    function handleDragStart(e, id) {
        dragState.draggingId = id;
        dragState.dragHandled = false;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-pve-drag', String(id));
        // 手柄是 draggable，浏览器默认镜像只有手柄图标；设置整行为拖拽镜像
        // dragstart 触发时 Vue 尚未添加 row-dragging class，此时 opacity 仍为 1，镜像完整
        try {
            var rowEl = e.currentTarget.closest('[data-drag-id]');
            if (rowEl) {
                var rect = rowEl.getBoundingClientRect();
                e.dataTransfer.setDragImage(rowEl, e.clientX - rect.left, e.clientY - rect.top);
            }
        } catch (err) {}
        for (var i = 0; i < osTemplates.value.length; i++) {
            if (osTemplates.value[i].id === id) { dragState.dragFromIndex = i; break; }
        }
        // 兜底：30 秒后如果还在拖拽状态（异常情况），自动清理
        if (dragFallbackTimer) clearTimeout(dragFallbackTimer);
        dragFallbackTimer = setTimeout(function () {
            if (dragState.draggingId != null) handleDragEnd();
        }, 30000);
    }

    function handleDragOver(e, id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragState.dragFromIndex < 0 && dragState.draggingId != null) {
            for (var fi = 0; fi < osTemplates.value.length; fi++) {
                if (osTemplates.value[fi].id === dragState.draggingId) {
                    dragState.dragFromIndex = fi;
                    break;
                }
            }
        }
        if (dragState.dragFromIndex < 0) return;
        // hover 到被拖元素自身：保持上一次有效目标，不更新 dragOverId，不做任何操作（避免抽动+避免 drop 落在自身）
        if (dragState.draggingId === id) return;
        dragState.dragOverId = id;
        applyAvoidTransform(id);
    }

    // 容器 dragover：只有拖拽进行中才 preventDefault 允许 drop
    function handleContainerDragOver(e) {
        if (dragState.draggingId != null) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    }

    function handleDragLeave() {
        // dragleave 在 dragover 之间频繁触发，不做处理
    }

    function handleDrop(e, targetId) {
        e.preventDefault();
        var sourceId = dragState.draggingId;
        if (sourceId == null || dragState.dragHandled) return;
        // drop 落在自身：不标记 dragHandled，交给 handleDragEnd 用 dragOverId 兜底
        if (sourceId === targetId) {
            handleDragEnd();
            return;
        }
        dragState.dragHandled = true;
        clearAllTransform();
        var newOrder = osTemplates.value.map(function (t) { return t.id; });
        var fromIdx = newOrder.indexOf(sourceId);
        var toIdx = newOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) {
            handleDragEnd();
            return;
        }
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, sourceId);
        // 异步操作前立即清空拖拽状态，防止容器冒泡 drop 重复处理，并避免 dragend 竞态
        clearDragState();
        saveReorder(newOrder);
    }

    // 容器兜底：当 drop 落在行间空隙（非 tr 元素）时，使用最后经过的目标 id
    function handleDropOnContainer(e) {
        if (dragState.draggingId == null) return;
        var targetId = dragState.dragOverId;
        if (targetId == null) {
            handleDragEnd();
            return;
        }
        handleDrop(e, targetId);
    }

    function handleDragEnd() {
        if (dragFallbackTimer) { clearTimeout(dragFallbackTimer); dragFallbackTimer = null; }
        // 兜底：如果 draggingId 还在（说明 drop 没成功处理），且 dragOverId 有效，且未处理过，执行 reorder
        var sourceId = dragState.draggingId;
        var targetId = dragState.dragOverId;
        if (sourceId != null && targetId != null && sourceId !== targetId && !dragState.dragHandled) {
            dragState.dragHandled = true;
            var newOrder = osTemplates.value.map(function (t) { return t.id; });
            var fromIdx = newOrder.indexOf(sourceId);
            var toIdx = newOrder.indexOf(targetId);
            if (fromIdx !== -1 && toIdx !== -1) {
                newOrder.splice(fromIdx, 1);
                newOrder.splice(toIdx, 0, sourceId);
                clearDragState();
                saveReorder(newOrder);
                return;
            }
        }
        clearDragState();
    }

    // ==================== 触屏拖拽（clone 镜像跟随） ====================
    function handleTouchStart(e, id) {
        if (e.touches.length !== 1) return;
        var touch = e.touches[0];
        dragState.draggingId = id;
        dragState.dragHandled = false;
        document.body.style.userSelect = 'none';
        var list = osTemplates.value;
        for (var fi = 0; fi < list.length; fi++) {
            if (list[fi].id === id) { dragState.dragFromIndex = fi; break; }
        }
        // 复制整行作为触屏拖拽镜像（行本身在触摸下无法拖动）
        var srcRow = e.currentTarget.closest('[data-drag-id]');
        if (srcRow) {
            var clone = srcRow.cloneNode(true);
            clone.style.position = 'fixed';
            clone.style.zIndex = '9999';
            clone.style.pointerEvents = 'none';
            clone.style.opacity = '0.8';
            clone.style.width = srcRow.offsetWidth + 'px';
            document.body.appendChild(clone);
            touchClone = clone;
            var srcRect = srcRow.getBoundingClientRect();
            var offsetX = touch.clientX - srcRect.left;
            var offsetY = touch.clientY - srcRect.top;
            clone.style.left = (touch.clientX - offsetX) + 'px';
            clone.style.top = (touch.clientY - offsetY) + 'px';
        }
    }

    function handleTouchMove(e) {
        if (dragState.draggingId == null) return;
        if (e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        var touch = e.touches[0];
        if (touchClone) {
            touchClone.style.left = touch.clientX + 'px';
            touchClone.style.top = touch.clientY + 'px';
        }
        var underEl = document.elementFromPoint(touch.clientX, touch.clientY);
        var targetRow = null;
        if (underEl) targetRow = underEl.closest('[data-drag-id]');
        if (targetRow) {
            var overId = Number(targetRow.getAttribute('data-drag-id'));
            if (overId !== dragState.draggingId) {
                dragState.dragOverId = overId;
                applyAvoidTransform(overId);
            }
        }
    }

    async function handleTouchEnd() {
        if (dragState.draggingId == null) {
            if (touchClone && touchClone.parentNode) touchClone.parentNode.removeChild(touchClone);
            touchClone = null;
            return;
        }
        var sourceId = dragState.draggingId;
        var targetId = dragState.dragOverId;
        document.body.style.userSelect = '';
        if (touchClone && touchClone.parentNode) touchClone.parentNode.removeChild(touchClone);
        touchClone = null;
        if (sourceId != null && targetId != null && sourceId !== targetId && !dragState.dragHandled) {
            dragState.dragHandled = true;
            var newOrder = osTemplates.value.map(function (t) { return t.id; });
            var fromIdx = newOrder.indexOf(sourceId);
            var toIdx = newOrder.indexOf(targetId);
            if (fromIdx !== -1 && toIdx !== -1) {
                newOrder.splice(fromIdx, 1);
                newOrder.splice(toIdx, 0, sourceId);
                clearDragState();
                await saveReorder(newOrder);
                return;
            }
        }
        clearDragState();
    }

    async function saveReorder(ids) {
        try {
            await api('/admin/os-templates/reorder', { method: 'POST', body: JSON.stringify({ ids: ids }) });
            await load();
        } catch (e) {
            console.error('排序保存失败', e);
            alert(window.__i18n.t('admin.sort.saveFailColon') + (e.message || window.__i18n.t('common.unknownError')));
            await load(); // 失败还原为服务端顺序
        }
    }

    return { osTemplates, formVisible, formData, saving, pveTemplateVms, pveConfigLoading, allStorages, dragState, load, openForm, closeForm, save, deleteRow, onTemplateVmidChange, loadPveTemplates, loadAllStorages, handleDragStart, handleDragOver, handleContainerDragOver, handleDragLeave, handleDrop, handleDropOnContainer, handleDragEnd, handleTouchStart, handleTouchMove, handleTouchEnd };
})();