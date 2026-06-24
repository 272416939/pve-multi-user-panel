(function() {
    window.__PKG_JS_VERSION = 'v2.22.2-touch-lock';
    console.log('[package.js] loaded version:', window.__PKG_JS_VERSION);
    var Vue = window.Vue;
    var admin = window.__admin;
    var $ = {};

    $.vmPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, disk_size: 0,
        monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active', stock: -1, sort_order: 0,
        cpu_model: '', bandwidth: 0, group_id: null, quarterly_discount: 0, yearly_discount: 0 });
    $.lxcPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, swap: 0, disk_size: 0,
        monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active', stock: -1, sort_order: 0,
        cpu_model: '', bandwidth: 0, group_id: null, quarterly_discount: 0, yearly_discount: 0 });
    $.vmPackages = Vue.ref([]);
    $.lxcPackages = Vue.ref([]);
    $.vmTemplateOptions = Vue.ref([]);
    $.lxcTemplateOptions = Vue.ref([]);
    $.vmPackageGroups = Vue.ref([]);
    $.lxcPackageGroups = Vue.ref([]);
    $.vmGroupForm = Vue.ref({ id: null, name: '', type: 'vm', sort_order: 0 });
    $.lxcGroupForm = Vue.ref({ id: null, name: '', type: 'lxc', sort_order: 0 });

    $.vmProvisionForm = Vue.ref({ package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' });
    $.lxcProvisionForm = Vue.ref({ package_id: '', user_id: '', name: '', expiration_date: '', renewal_period: 'month', mac_group_id: '' });

    $.dragState = Vue.reactive({ draggingId: null, dragOverId: null, dragType: null, draggingType: null, dragFromIndex: -1, avoidDownIds: [], avoidUpIds: [] });

    $.loadVmPackages = async function() {
        try { $.vmPackages.value = await api('/admin/vm-packages'); } catch (e) { console.error('loadVmPackages error:', e); }
    };
    $.loadLxcPackages = async function() {
        try { $.lxcPackages.value = await api('/admin/lxc-packages'); } catch (e) { console.error('loadLxcPackages error:', e); }
    };

    $.loadVmTemplateOptions = async function() {
        try { $.vmTemplateOptions.value = await api('/admin/vm-templates'); } catch (e) {}
    };
    $.loadLxcTemplateOptions = async function() {
        try { $.lxcTemplateOptions.value = await api('/admin/lxc-templates'); } catch (e) {}
    };

    $.loadVmPackageGroups = async function() {
        try { $.vmPackageGroups.value = await api('/admin/package-groups?type=vm'); } catch (e) {}
    };
    $.loadLxcPackageGroups = async function() {
        try { $.lxcPackageGroups.value = await api('/admin/package-groups?type=lxc'); } catch (e) {}
    };

    $.openVmPackageForm = function(p) {
        if (p) {
            $.vmPackageForm.value = Object.assign({}, p);
            var f = $.vmPackageForm.value;
            // 兼容旧数据：null/undefined 视为不限量(-1)
            f.stock = (p.stock !== undefined && p.stock !== null ? p.stock : -1);
        } else {
            $.vmPackageForm.value = { id: null, name: '', template_id: '', cores: 0, memory: 0, disk_size: 0,
                monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active', stock: -1,
                cpu_model: '', bandwidth: 0, group_id: null, quarterly_discount: 0, yearly_discount: 0 };
        }
        $.loadVmTemplateOptions().then(function() { admin.bsModalShow('vmPackageModal'); });
    };

    $.saveVmPackage = async function() {
        var f = $.vmPackageForm.value;
        // 空值或未定义视为不限量(-1)
        if (f.stock === '' || f.stock === undefined || f.stock === null) f.stock = -1;
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
        if (p) {
            $.lxcPackageForm.value = Object.assign({}, p);
            var f = $.lxcPackageForm.value;
            // 兼容旧数据：null/undefined 视为不限量(-1)
            f.stock = (p.stock !== undefined && p.stock !== null ? p.stock : -1);
        } else {
            $.lxcPackageForm.value = { id: null, name: '', template_id: '', cores: 0, memory: 0, swap: 0, disk_size: 0,
                monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active', stock: -1,
                cpu_model: '', bandwidth: 0, group_id: null, quarterly_discount: 0, yearly_discount: 0 };
        }
        $.loadLxcTemplateOptions().then(function() { admin.bsModalShow('lxcPackageModal'); });
    };

    $.saveLxcPackage = async function() {
        var f = $.lxcPackageForm.value;
        // 空值或未定义视为不限量(-1)
        if (f.stock === '' || f.stock === undefined || f.stock === null) f.stock = -1;
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

    $.openVmGroupForm = function(g) {
        if (g) {
            $.vmGroupForm.value = Object.assign({}, g);
        } else {
            $.vmGroupForm.value = { id: null, name: '', type: 'vm', sort_order: 0 };
        }
        admin.bsModalShow('vmGroupModal');
    };
    $.saveVmGroup = async function() {
        var f = $.vmGroupForm.value;
        try {
            if (f.id) {
                await api('/admin/package-groups/' + f.id, { method: 'PUT', body: JSON.stringify(f) });
            } else {
                await api('/admin/package-groups', { method: 'POST', body: JSON.stringify(f) });
            }
            admin.bsModalHide('vmGroupModal');
            await $.loadVmPackageGroups();
        } catch (e) { alert(e.message); }
    };
    $.deleteVmGroup = async function(id) {
        if (!await window.customConfirm('确定删除此分组？关联的套餐将变为未分组。')) return;
        try { await api('/admin/package-groups/' + id, { method: 'DELETE' }); await $.loadVmPackageGroups(); } catch (e) { alert(e.message); }
    };
    $.openLxcGroupForm = function(g) {
        if (g) {
            $.lxcGroupForm.value = Object.assign({}, g);
        } else {
            $.lxcGroupForm.value = { id: null, name: '', type: 'lxc', sort_order: 0 };
        }
        admin.bsModalShow('lxcGroupModal');
    };
    $.saveLxcGroup = async function() {
        var f = $.lxcGroupForm.value;
        try {
            if (f.id) {
                await api('/admin/package-groups/' + f.id, { method: 'PUT', body: JSON.stringify(f) });
            } else {
                await api('/admin/package-groups', { method: 'POST', body: JSON.stringify(f) });
            }
            admin.bsModalHide('lxcGroupModal');
            await $.loadLxcPackageGroups();
        } catch (e) { alert(e.message); }
    };
    $.deleteLxcGroup = async function(id) {
        if (!await window.customConfirm('确定删除此分组？关联的套餐将变为未分组。')) return;
        try { await api('/admin/package-groups/' + id, { method: 'DELETE' }); await $.loadLxcPackageGroups(); } catch (e) { alert(e.message); }
    };

    $.restockVmPackage = async function(pkg) {
        // 直接设置新的库存数量（不累加）
        var current = (pkg.stock === -1 || pkg.stock === null) ? '不限' : pkg.stock;
        var input = await customPrompt('请输入新的库存数量\n（-1 不限量，0 售罄，正整数剩余库存）\n当前库存：' + current, current === '不限' ? '-1' : String(current));
        if (input === null) return;
        var newStock = parseInt(input);
        if (isNaN(newStock) || newStock < -1) { alert('请输入 -1 或非负整数'); return; }
        try {
            await api('/admin/vm-packages/' + pkg.id, { method: 'PUT', body: JSON.stringify({ stock: newStock }) });
            await $.loadVmPackages();
        } catch (e) { alert('设置库存失败：' + e.message); }
    };

    $.restockLxcPackage = async function(pkg) {
        // 直接设置新的库存数量（不累加）
        var current = (pkg.stock === -1 || pkg.stock === null) ? '不限' : pkg.stock;
        var input = await customPrompt('请输入新的库存数量\n（-1 不限量，0 售罄，正整数剩余库存）\n当前库存：' + current, current === '不限' ? '-1' : String(current));
        if (input === null) return;
        var newStock = parseInt(input);
        if (isNaN(newStock) || newStock < -1) { alert('请输入 -1 或非负整数'); return; }
        try {
            await api('/admin/lxc-packages/' + pkg.id, { method: 'PUT', body: JSON.stringify({ stock: newStock }) });
            await $.loadLxcPackages();
        } catch (e) { alert('设置库存失败：' + e.message); }
    };

    $.provisionVm = async function() {
        var f = $.vmProvisionForm.value;
        if (!f.package_id || !f.user_id) return alert('请选择套餐和用户');
        var pkg = $.vmPackages.value.find(function(p) { return String(p.id) === String(f.package_id); });
        if (!pkg) return alert('套餐不存在');
        try {
            var expDate = toLocalDateTimeStr(f.expiration_date);
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
            var expDate = toLocalDateTimeStr(f.expiration_date);
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

    // ===== 拖拽排序 =====
    $.getDragList = function(type) {
        if (type === 'vm') return $.vmPackages.value;
        if (type === 'lxc') return $.lxcPackages.value;
        if (type === 'group-vm') return $.vmPackageGroups.value;
        if (type === 'group-lxc') return $.lxcPackageGroups.value;
        return [];
    };

    // ===== 触摸事件拖拽（移动端，通过拖拽手柄触发）=====
    $.handleTouchStart = function(e, id, type) {
        if (e.touches.length !== 1) return;
        var touch = e.touches[0];
        $.dragState.__touchStartX = touch.clientX;
        $.dragState.__touchStartY = touch.clientY;
        // 手柄触发，立即启动拖拽（无需长按）
        $.dragState.draggingId = id;
        $.dragState.dragType = type;
        $.dragState.draggingType = type;
        $.dragState.dragHandled = false;
        var list = $.getDragList(type);
        var fi = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { fi = i; break; }
        }
        $.dragState.dragFromIndex = fi;
        // 触觉反馈（静默失败，不报错到控制台）
        try { if (navigator.vibrate) navigator.vibrate(20); } catch (err) {}
        document.body.style.userSelect = 'none';
        // 锁定整个容器的 touch-action，防止手指移出手柄后浏览器接管滚动
        var handleEl = e.currentTarget;
        var container = handleEl.closest('tbody') || handleEl.closest('.mb-3') || handleEl.parentElement;
        if (container) {
            container.style.touchAction = 'none';
            $.__touchLockedContainer = container;
        }
    };

    $.handleTouchMove = function(e) {
        if ($.dragState.draggingId == null) return;
        if (e.touches.length !== 1) return;
        if (e.cancelable) e.preventDefault();
        var touch = e.touches[0];
        var type = $.dragState.dragType;
        var underEl = document.elementFromPoint(touch.clientX, touch.clientY);
        var targetRow = null;
        if (underEl) {
            targetRow = underEl.closest('[data-drag-id]');
            if (targetRow) {
                var rowType = targetRow.getAttribute('data-drag-type');
                if (rowType !== type) targetRow = null;
            }
        }
        if (targetRow) {
            var overId = Number(targetRow.getAttribute('data-drag-id'));
            $.dragState.dragOverId = overId;
            if (overId !== $.dragState.draggingId) {
                $.__applyAvoidTransform(type, overId);
            } else {
                $.__clearAllTransform(type);
            }
        }
    };

    $.handleTouchEnd = async function(e) {
        if ($.dragState.draggingId == null) {
            if ($.__touchLockedContainer) { $.__touchLockedContainer.style.touchAction = ''; $.__touchLockedContainer = null; }
            return;
        }
        var sourceId = $.dragState.draggingId;
        var targetId = $.dragState.dragOverId;
        var dragType = $.dragState.dragType;
        document.body.style.userSelect = '';
        if ($.__touchLockedContainer) { $.__touchLockedContainer.style.touchAction = ''; $.__touchLockedContainer = null; }
        if (sourceId != null && targetId != null && sourceId !== targetId && dragType != null && !$.dragState.dragHandled) {
            $.dragState.dragHandled = true;
            var list = $.getDragList(dragType);
            var newOrder = list.map(function(p) { return p.id; });
            var fromIdx = newOrder.indexOf(sourceId);
            var toIdx = newOrder.indexOf(targetId);
            if (fromIdx !== -1 && toIdx !== -1) {
                newOrder.splice(fromIdx, 1);
                newOrder.splice(toIdx, 0, sourceId);
                $.dragState.draggingId = null;
                $.dragState.dragOverId = null;
                $.dragState.dragType = null;
                $.dragState.draggingType = null;
                $.dragState.dragFromIndex = -1;
                $.__clearAllTransform(dragType);
                await $.saveReorder(dragType, newOrder);
                return;
            }
        }
        $.dragState.draggingId = null;
        $.dragState.dragOverId = null;
        $.dragState.dragType = null;
        $.dragState.draggingType = null;
        $.dragState.dragFromIndex = -1;
        if (dragType) $.__clearAllTransform(dragType);
    };

    $.__applyAvoidTransform = function(type, overId) {
        var list = $.getDragList(type);
        var fromIndex = $.dragState.dragFromIndex;
        var toIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === overId) { toIndex = i; break; }
        }
        if (fromIndex < 0 || toIndex < 0) return;
        var containerSelector = (type === 'vm' || type === 'lxc') ? 'tbody' : '.mb-3';
        var containers = document.querySelectorAll(containerSelector);
        var rows = null;
        for (var c = 0; c < containers.length; c++) {
            var testRows = containers[c].querySelectorAll('[data-drag-id][data-drag-type="' + type + '"]');
            if (testRows.length > 0) { rows = testRows; break; }
        }
        if (!rows || rows.length === 0) return;
        var offset = rows[0].offsetHeight;
        var axis = 'Y';
        for (var j = 0; j < rows.length; j++) rows[j].style.transform = '';
        if (fromIndex < toIndex) {
            for (var k = fromIndex + 1; k <= toIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translate' + axis + '(-' + offset + 'px)';
            }
        } else if (fromIndex > toIndex) {
            for (var k = toIndex; k < fromIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translate' + axis + '(' + offset + 'px)';
            }
        }
    };

    $.__clearAllTransform = function(type) {
        var selector = type ? '[data-drag-id][data-drag-type="' + type + '"]' : '[data-drag-id]';
        var rows = document.querySelectorAll(selector);
        for (var i = 0; i < rows.length; i++) rows[i].style.transform = '';
    };

    $.handleDragStart = function(e, id, type) {
        $.dragState.draggingId = id;
        $.dragState.dragType = type;
        $.dragState.draggingType = type;
        $.dragState.dragHandled = false;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-pve-drag', String(id));
        // 手柄是 draggable，浏览器默认镜像只有手柄图标；设置整行/整 badge 为拖拽镜像
        // dragstart 触发时 Vue 尚未添加 row-dragging class，此时 opacity 仍为 1，镜像完整
        try {
            var rowEl = e.currentTarget.closest('[data-drag-id]');
            if (rowEl) {
                var rect = rowEl.getBoundingClientRect();
                e.dataTransfer.setDragImage(rowEl, e.clientX - rect.left, e.clientY - rect.top);
            }
        } catch (err) {}
        var list = $.getDragList(type);
        var fromIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { fromIndex = i; break; }
        }
        $.dragState.dragFromIndex = fromIndex;
        // 兜底：30 秒后如果还在拖拽状态（异常情况），自动清理
        if ($.__dragFallbackTimer) clearTimeout($.__dragFallbackTimer);
        $.__dragFallbackTimer = setTimeout(function() {
            if ($.dragState.draggingId != null) {
                $.handleDragEnd();
            }
        }, 30000);
    };

    $.handleDragOver = function(e, id, type) {
        if ($.dragState.dragType !== type) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        $.dragState.dragOverId = id;
        if ($.dragState.dragFromIndex < 0 && $.dragState.draggingId != null) {
            var dragList0 = $.getDragList($.dragState.dragType);
            for (var fi0 = 0; fi0 < dragList0.length; fi0++) {
                if (dragList0[fi0].id === $.dragState.draggingId) {
                    $.dragState.dragFromIndex = fi0;
                    break;
                }
            }
        }
        if ($.dragState.dragFromIndex < 0) return;
        var list0 = $.getDragList($.dragState.dragType);
        var toIndex0 = -1;
        for (var i0 = 0; i0 < list0.length; i0++) {
            if (list0[i0].id === id) { toIndex0 = i0; break; }
        }
        if (toIndex0 < 0) return;
        var fromIndex0 = $.dragState.dragFromIndex;
        var containerSelector0 = (type === 'vm' || type === 'lxc') ? 'tbody' : '.mb-3';
        var container0 = e.currentTarget.closest(containerSelector0);
        if (!container0) {
            container0 = e.currentTarget.parentElement;
            if (!container0) return;
        }
        var rows0 = container0.querySelectorAll('[data-drag-id]');
        var offset0 = rows0[0].offsetHeight;
        var axis0 = 'Y';
        // 先清除所有 transform（避免上一轮方向的残留导致重叠）
        for (var j0 = 0; j0 < rows0.length; j0++) {
            rows0[j0].style.transform = '';
        }
        // hover 到被拖元素自身：fromIndex === toIndex，不施加任何避让
        if ($.dragState.draggingId === id) return;
        if (fromIndex0 < toIndex0) {
            for (var k0 = fromIndex0 + 1; k0 <= toIndex0 && k0 < rows0.length; k0++) {
                rows0[k0].style.transform = 'translate' + axis0 + '(-' + offset0 + 'px)';
            }
        } else if (fromIndex0 > toIndex0) {
            for (var k1 = toIndex0; k1 < fromIndex0 && k1 < rows0.length; k1++) {
                rows0[k1].style.transform = 'translate' + axis0 + '(' + offset0 + 'px)';
            }
        }
    };

    // 容器 dragover：仅当拖拽类型匹配时才 preventDefault 允许 drop
    $.handleContainerDragOver = function(e, type) {
        if ($.dragState.dragType === type) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        }
    };

    $.handleDragLeave = function(e, id) {
        // dragleave 在 dragover 之间频繁触发，不做处理
    };

    $.clearAvoidClasses = function() {
        $.dragState.avoidDownIds = [];
        $.dragState.avoidUpIds = [];
        // 清除所有直接设置的 DOM transform（全局）
        var allDraggables = document.querySelectorAll('[data-drag-id]');
        for (var i = 0; i < allDraggables.length; i++) {
            allDraggables[i].style.transform = '';
        }
    };

    $.handleDrop = async function(e, targetId, type) {
        e.preventDefault();
        var sourceId = $.dragState.draggingId;
        var dragType = $.dragState.dragType;
        if (sourceId == null || $.dragState.dragHandled) return;
        $.dragState.dragHandled = true;
        $.clearAvoidClasses();
        if (sourceId === targetId || dragType !== type) {
            $.handleDragEnd();
            return;
        }
        var list = $.getDragList(type);
        var newOrder = list.map(function(p) { return p.id; });
        var fromIdx = newOrder.indexOf(sourceId);
        var toIdx = newOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) {
            $.handleDragEnd();
            return;
        }
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, sourceId);
        // 异步操作前立即清空拖拽状态，防止容器冒泡 drop 重复处理，并避免 dragend 竞态
        $.dragState.draggingId = null;
        $.dragState.dragOverId = null;
        $.dragState.dragType = null;
        $.dragState.draggingType = null;
        $.dragState.dragFromIndex = -1;
        await $.saveReorder(type, newOrder);
        $.clearAvoidClasses();
    };

    // 容器兜底：当 drop 落在行间空隙（非 tr 元素）时，使用最后经过的目标 id
    $.handleDropOnContainer = async function(e, type) {
        if ($.dragState.dragType !== type) return;
        var targetId = $.dragState.dragOverId;
        if (targetId == null) {
            $.handleDragEnd();
            return;
        }
        await $.handleDrop(e, targetId, type);
    };

    $.handleDragEnd = async function() {
        if ($.__dragFallbackTimer) { clearTimeout($.__dragFallbackTimer); $.__dragFallbackTimer = null; }
        // 兜底：如果 draggingId 还在（说明 drop 没成功处理），且 dragOverId 有效，且未处理过，执行 reorder
        var sourceId = $.dragState.draggingId;
        var targetId = $.dragState.dragOverId;
        var dragType = $.dragState.dragType;
        if (sourceId != null && targetId != null && sourceId !== targetId && dragType != null && !$.dragState.dragHandled) {
            $.dragState.dragHandled = true;
            var list = $.getDragList(dragType);
            var newOrder = list.map(function(p) { return p.id; });
            var fromIdx = newOrder.indexOf(sourceId);
            var toIdx = newOrder.indexOf(targetId);
            if (fromIdx !== -1 && toIdx !== -1) {
                newOrder.splice(fromIdx, 1);
                newOrder.splice(toIdx, 0, sourceId);
                $.dragState.draggingId = null;
                $.dragState.dragOverId = null;
                $.dragState.dragType = null;
                $.dragState.draggingType = null;
                $.dragState.dragFromIndex = -1;
                $.clearAvoidClasses();
                await $.saveReorder(dragType, newOrder);
                return;
            }
        }
        $.dragState.draggingId = null;
        $.dragState.dragOverId = null;
        $.dragState.dragType = null;
        $.dragState.draggingType = null;
        $.dragState.dragFromIndex = -1;
        $.clearAvoidClasses();
    };

    $.saveReorder = async function(type, ids) {
        try {
            var endpoint = '';
            if (type === 'vm') endpoint = '/admin/vm-packages/reorder';
            else if (type === 'lxc') endpoint = '/admin/lxc-packages/reorder';
            else if (type === 'group-vm' || type === 'group-lxc') endpoint = '/admin/package-groups/reorder';
            await api(endpoint, { method: 'POST', body: JSON.stringify({ ids: ids }) });
            if (type === 'vm') await $.loadVmPackages();
            else if (type === 'lxc') await $.loadLxcPackages();
            else if (type === 'group-vm') await $.loadVmPackageGroups();
            else if (type === 'group-lxc') await $.loadLxcPackageGroups();
        } catch (e) {
            console.error('排序保存失败', e);
            alert('排序保存失败：' + (e.message || '未知错误'));
        }
    };

    $.getTemplateName = function(p) {
        return p.template_name || '<span class="text-secondary">模板已删除</span>';
    };

    admin.packagePage = $;
    window.packagePage = $;
})();
