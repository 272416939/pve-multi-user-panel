(function() {
    window.__PKG_JS_VERSION = '20260624-v6-typed-guard';
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

    // ===== 拖拽排序（纯鼠标事件实现，绕过 HTML5 DnD 协议坑）=====
    $.getDragList = function(type) {
        if (type === 'vm') return $.vmPackages.value;
        if (type === 'lxc') return $.lxcPackages.value;
        if (type === 'group-vm') return $.vmPackageGroups.value;
        if (type === 'group-lxc') return $.lxcPackageGroups.value;
        return [];
    };

    $.dragState = Vue.reactive({
        draggingId: null, dragType: null, dragFromIndex: -1, dragOverId: null,
        isMouseDown: false, mouseDownId: null, mouseDownType: null,
        started: false, ghostEl: null
    });

    // 鼠标按下：记录候选拖拽，不立即启动（需移动一定距离才认为是拖拽）
    $.handleMouseDown = function(e, id, type) {
        if (e.button !== 0) return; // 仅左键
        // 点击按钮/链接不触发拖拽
        var tgt = e.target;
        if (tgt && tgt.closest && tgt.closest('button, a, input, select, .btn-group')) return;
        $.dragState.isMouseDown = true;
        $.dragState.mouseDownId = id;
        $.dragState.mouseDownType = type;
        $.dragState.mouseDownX = e.clientX;
        $.dragState.mouseDownY = e.clientY;
        document.addEventListener('mousemove', $.__onMouseMove);
        document.addEventListener('mouseup', $.__onMouseUp);
    };

    $.__onMouseMove = function(e) {
        if (!$.dragState.isMouseDown) return;
        // 首次移动：判断是否超过阈值才启动拖拽
        if (!$.dragState.started) {
            var dx = e.clientX - $.dragState.mouseDownX;
            var dy = e.clientY - $.dragState.mouseDownY;
            if (dx * dx + dy * dy < 25) return; // 5px 阈值
            // 启动拖拽
            $.dragState.started = true;
            $.dragState.draggingId = $.dragState.mouseDownId;
            $.dragState.dragType = $.dragState.mouseDownType;
            var list = $.getDragList($.dragState.dragType);
            var fi = -1;
            for (var i = 0; i < list.length; i++) {
                if (list[i].id === $.dragState.draggingId) { fi = i; break; }
            }
            $.dragState.dragFromIndex = fi;
            document.body.style.userSelect = 'none';
            document.body.style.cursor = 'grabbing';
        }
        // 检测当前鼠标下方的可拖拽行
        var type = $.dragState.dragType;
        var containerSelector = (type === 'vm' || type === 'lxc') ? 'tbody' : '.mb-3';
        var underEl = document.elementFromPoint(e.clientX, e.clientY);
        var targetRow = null;
        if (underEl) {
            targetRow = underEl.closest('[data-drag-id]');
            // 类型隔离：必须属于当前拖拽类型的容器
            if (targetRow) {
                var rowType = targetRow.getAttribute('data-drag-type');
                if (rowType !== type) targetRow = null;
            }
        }
        var overId = targetRow ? Number(targetRow.getAttribute('data-drag-id')) : null;
        $.dragState.dragOverId = overId;
        // 更新避让 transform
        if (overId != null && overId !== $.dragState.draggingId) {
            $.__applyAvoid(type, overId);
        }
    };

    $.__applyAvoid = function(type, overId) {
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
        var isHorizontal = type === 'group-vm' || type === 'group-lxc';
        var offset = isHorizontal
            ? (rows[0].offsetWidth + 8)
            : (rows[0].offsetHeight);
        var axis = isHorizontal ? 'X' : 'Y';
        for (var j = 0; j < rows.length; j++) {
            rows[j].style.transform = '';
        }
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

    $.__onMouseUp = async function(e) {
        document.removeEventListener('mousemove', $.__onMouseMove);
        document.removeEventListener('mouseup', $.__onMouseUp);
        var wasStarted = $.dragState.started;
        var type = $.dragState.dragType;
        var sourceId = $.dragState.draggingId;
        var targetId = $.dragState.dragOverId;
        // 重置状态
        $.dragState.isMouseDown = false;
        $.dragState.started = false;
        $.dragState.mouseDownId = null;
        $.dragState.mouseDownType = null;
        $.dragState.draggingId = null;
        $.dragState.dragOverId = null;
        $.dragState.dragType = null;
        $.dragState.dragFromIndex = -1;
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        $.clearAvoidClasses();
        if (!wasStarted || sourceId == null) return;
        if (targetId == null || targetId === sourceId) return;
        var list = $.getDragList(type);
        var newOrder = list.map(function(p) { return p.id; });
        var fromIdx = newOrder.indexOf(sourceId);
        var toIdx = newOrder.indexOf(targetId);
        if (fromIdx === -1 || toIdx === -1) return;
        newOrder.splice(fromIdx, 1);
        newOrder.splice(toIdx, 0, sourceId);
        await $.saveReorder(type, newOrder);
    };

    $.clearAvoidClasses = function() {
        var allDraggables = document.querySelectorAll('[data-drag-id]');
        for (var i = 0; i < allDraggables.length; i++) {
            allDraggables[i].style.transform = '';
        }
    };

    // 兼容旧调用（模板可能仍引用，做无操作）
    $.handleDragStart = function() {};
    $.handleDragOver = function() {};
    $.handleDragLeave = function() {};
    $.handleDrop = function() {};
    $.handleDropOnContainer = function() {};
    $.handleDragEnd = function() {};
    $.handleContainerDragOver = function() {};

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
