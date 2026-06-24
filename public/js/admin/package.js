(function() {
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

    $.dragState = Vue.reactive({ draggingId: null, dragOverId: null, dragType: null, dragFromIndex: -1, avoidDownIds: [], avoidUpIds: [] });

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

    $.handleDragStart = function(e, id, type) {
        $.dragState.draggingId = id;
        $.dragState.dragType = type;
        e.dataTransfer.effectAllowed = 'move';
        // 必须调用 setData 才能触发拖拽，用 text/plain 即可
        e.dataTransfer.setData('text/plain', String(id));
        // 记录起始索引
        var list = $.getDragList(type);
        var fromIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { fromIndex = i; break; }
        }
        $.dragState.dragFromIndex = fromIndex;
    };

    $.handleDragOver = function(e, id) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        // 始终记录最后经过的目标 id（包括拖拽行自身），供容器兜底使用
        $.dragState.dragOverId = id;
        if ($.dragState.draggingId === id) return;
        // 如果 fromIndex 丢失（可能被意外重置），重新计算
        if ($.dragState.dragFromIndex < 0 && $.dragState.draggingId != null) {
            var dragList = $.getDragList($.dragState.dragType);
            for (var fi = 0; fi < dragList.length; fi++) {
                if (dragList[fi].id === $.dragState.draggingId) {
                    $.dragState.dragFromIndex = fi;
                    break;
                }
            }
        }
        if ($.dragState.dragFromIndex < 0) return;
        // 计算目标索引（基于数据列表，不依赖 DOM 顺序）
        var list = $.getDragList($.dragState.dragType);
        var toIndex = -1;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) { toIndex = i; break; }
        }
        if (toIndex < 0) return;
        var fromIndex = $.dragState.dragFromIndex;
        // 直接操作 DOM 设置 transform（绕过 Vue 响应式，避免拖拽期间渲染节流）
        // 找到当前拖拽元素和目标元素的 DOM 节点
        var dragType = $.dragState.dragType;
        var containerSelector = (dragType === 'vm' || dragType === 'lxc') ? 'tbody' : '.mb-3';
        var container = e.currentTarget.closest(containerSelector);
        if (!container) {
            container = e.currentTarget.parentElement;
            if (!container) return;
        }
        // 只选择当前容器内的可拖拽元素（避免跨容器污染）
        var rows = container.querySelectorAll('[draggable="true"]');
        // 判断是表格行（纵向）还是 badge（横向）
        var isHorizontal = dragType === 'group-vm' || dragType === 'group-lxc';
        var offset = isHorizontal
            ? (rows.length > 0 ? rows[0].offsetWidth + 8 : 80)
            : (rows.length > 0 ? rows[0].offsetHeight : 40);
        var axis = isHorizontal ? 'X' : 'Y';
        // 清除所有避让 transform
        for (var j = 0; j < rows.length; j++) {
            rows[j].style.transform = '';
        }
        // 根据拖拽方向应用避让（严格限制范围，避免连带）
        if (fromIndex < toIndex) {
            // 向后拖拽：仅 fromIndex+1 到 toIndex 的元素向前避让（负方向）
            for (var k = fromIndex + 1; k <= toIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translate' + axis + '(-' + offset + 'px)';
            }
        } else if (fromIndex > toIndex) {
            // 向前拖拽：仅 toIndex 到 fromIndex-1 的元素向后避让（正方向）
            for (var k = toIndex; k < fromIndex && k < rows.length; k++) {
                rows[k].style.transform = 'translate' + axis + '(' + offset + 'px)';
            }
        }
    };

    $.handleDragLeave = function(e, id) {
        // dragleave 在 dragover 之间频繁触发，不做处理
    };

    $.clearAvoidClasses = function() {
        $.dragState.avoidDownIds = [];
        $.dragState.avoidUpIds = [];
        // 清除所有直接设置的 DOM transform（全局）
        var allDraggables = document.querySelectorAll('[draggable="true"]');
        for (var i = 0; i < allDraggables.length; i++) {
            allDraggables[i].style.transform = '';
        }
    };

    $.handleDrop = async function(e, targetId, type) {
        e.preventDefault();
        e.stopPropagation();
        var sourceId = $.dragState.draggingId;
        var dragType = $.dragState.dragType;
        $.clearAvoidClasses();
        if (sourceId == null || sourceId === targetId || dragType !== type) {
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
        await $.saveReorder(type, newOrder);
        $.handleDragEnd();
    };

    // 容器兜底：当 drop 落在行间空隙（非 tr 元素）时，使用最后经过的目标 id
    $.handleDropOnContainer = async function(e, type) {
        var targetId = $.dragState.dragOverId;
        if (targetId == null) {
            $.handleDragEnd();
            return;
        }
        await $.handleDrop(e, targetId, type);
    };

    $.handleDragEnd = function() {
        $.dragState.draggingId = null;
        $.dragState.dragOverId = null;
        $.dragState.dragType = null;
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
