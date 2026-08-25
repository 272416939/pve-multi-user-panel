// 管理端 区域/可用区 页面逻辑（区域管理 → 地域 / 可用区）
// 模板引用全部经 $.regionsPage 暴露（window.__admin 在 setup return 中整体展开，见 admin-page.js）
window.__admin = window.__admin || {};
window.__admin.regionsPage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;

    var regions = ref([]);          // 地域列表
    var zones = ref([]);            // 可用区列表
    var regionLoading = ref(false);
    var zoneLoading = ref(false);
    var saving = ref(false);
    var regionForm = reactive({ id: null, name: '', remark: '', sort_order: 0 });
    var zoneForm = reactive({ id: null, region_id: '', name: '', remark: '', sort_order: 0 });

    // 统一入口：core.js watch/onMounted 同源调用（按当前 section 决定加载哪个列表）
    async function load() {
        if ($.activeSection.value === 'zones') await loadZones();
        else await loadRegions();
    }

    async function loadRegions() {
        regionLoading.value = true;
        try {
            var data = await api('/admin/regions');
            regions.value = (data && data.regions) || [];
        } catch (e) {
            console.error('加载地域列表失败', e && e.message);
            regions.value = [];
        } finally {
            regionLoading.value = false;
        }
    }

    async function loadZones() {
        zoneLoading.value = true;
        try {
            var data = await api('/admin/zones');
            zones.value = (data && data.zones) || [];
        } catch (e) {
            console.error('加载可用区列表失败', e && e.message);
            zones.value = [];
        } finally {
            zoneLoading.value = false;
        }
    }

    // ===== 地域 =====
    function openRegionModal(region) {
        regionForm.id = region ? region.id : null;
        regionForm.name = region ? region.name : '';
        regionForm.remark = region ? (region.remark || '') : '';
        regionForm.sort_order = region ? (region.sort_order || 0) : 0;
        $.bsModalShow('regionModal');
    }

    async function saveRegion() {
        if (saving.value) return;
        var name = (regionForm.name || '').trim();
        if (!name) {
            alert(window.__i18n.t('nodes.regionNameRequired'));
            return;
        }
        saving.value = true;
        try {
            var payload = { name: name, remark: regionForm.remark || '', sort_order: regionForm.sort_order || 0 };
            if (regionForm.id) {
                await api('/admin/regions/' + regionForm.id, { method: 'PUT', body: payload });
            } else {
                await api('/admin/regions', { method: 'POST', body: payload });
            }
            $.bsModalHide('regionModal');
            alert(window.__i18n.t('nodes.saveOk'));
            await loadRegions();
        } catch (e) {
            console.error('保存地域失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        } finally {
            saving.value = false;
        }
    }

    async function deleteRegion(region) {
        var ok = await window.customConfirm(window.__i18n.tFormat('nodes.deleteConfirm', region.name));
        if (!ok) return;
        try {
            await api('/admin/regions/' + region.id, { method: 'DELETE' });
            alert(window.__i18n.t('nodes.deleteOk'));
            await loadRegions();
        } catch (e) {
            console.error('删除地域失败', e && e.message);
            await loadRegions();
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        }
    }

    // ===== 可用区 =====
    async function openZoneModal(zone) {
        // 地域下拉需 regions 分钟级就绪；为空则拉取一次（不阻塞打开弹窗）
        if (regions.value.length === 0) {
            try {
                await loadRegions();
            } catch (_) {}
        }
        zoneForm.id = zone ? zone.id : null;
        zoneForm.region_id = zone ? zone.region_id : '';
        zoneForm.name = zone ? zone.name : '';
        zoneForm.remark = zone ? (zone.remark || '') : '';
        zoneForm.sort_order = zone ? (zone.sort_order || 0) : 0;
        $.bsModalShow('zoneModal');
    }

    async function saveZone() {
        if (saving.value) return;
        var name = (zoneForm.name || '').trim();
        if (!name) {
            alert(window.__i18n.t('nodes.zoneNameRequired'));
            return;
        }
        if (!zoneForm.region_id) {
            alert(window.__i18n.t('nodes.regionRequired'));
            return;
        }
        saving.value = true;
        try {
            var payload = { region_id: zoneForm.region_id, name: name, remark: zoneForm.remark || '', sort_order: zoneForm.sort_order || 0 };
            if (zoneForm.id) {
                await api('/admin/zones/' + zoneForm.id, { method: 'PUT', body: payload });
            } else {
                await api('/admin/zones', { method: 'POST', body: payload });
            }
            $.bsModalHide('zoneModal');
            alert(window.__i18n.t('nodes.saveOk'));
            await loadZones();
        } catch (e) {
            console.error('保存可用区失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        } finally {
            saving.value = false;
        }
    }

    async function deleteZone(zone) {
        var ok = await window.customConfirm(window.__i18n.tFormat('nodes.deleteConfirm', zone.name));
        if (!ok) return;
        try {
            await api('/admin/zones/' + zone.id, { method: 'DELETE' });
            alert(window.__i18n.t('nodes.deleteOk'));
            await loadZones();
        } catch (e) {
            console.error('删除可用区失败', e && e.message);
            await loadZones();
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        }
    }

    // 关联爱快（去重）：收集该可用区下所有 PVE 节点配对的爱快节点名，去重
    function zoneIkuaiNames(z) {
        if (!z || !z.nodes || !z.nodes.length) return [];
        var seen = {};
        var out = [];
        z.nodes.forEach(function (n) {
            if (n.ikuai_name && !seen[n.ikuai_name]) {
                seen[n.ikuai_name] = true;
                out.push(n.ikuai_name);
            }
        });
        return out;
    }

    // ===== 拖拽排序（桌面 HTML5，复用 package.js 先例；可用区限定同地域拖拽）=====
    var dragState = reactive({ draggingId: null, draggingType: null, fromIndex: -1 });
    var _dragCleanupTimer = null;

    function __findRows() {
        return Array.prototype.slice.call(document.querySelectorAll('.drag-region-rows tr[data-drag-id]'));
    }
    function __findRowById(id) {
        return __findRows().find(function (r) { return String(r.dataset.dragId) === String(id); }) || null;
    }
    // 避让动画：越过目标行一半高度时让开位置（与 package.js 同款）
    function __applyAvoidTransform(dragEl) {
        __findRows().forEach(function (row) {
            if (row === dragEl) return;
            var over = row.getBoundingClientRect();
            var self = dragEl.getBoundingClientRect();
            var drift = self.top - over.top;
            if (Math.abs(drift) < over.height * 0.55) {
                var shift = drift > 0 ? -over.height : over.height;
                row.style.transition = 'transform .18s';
                row.style.transform = 'translateY(' + shift + 'px)';
            } else {
                row.style.transition = '';
                row.style.transform = '';
            }
        });
    }
    function __clearAvoidTransform() {
        __findRows().forEach(function (row) {
            row.style.transition = '';
            row.style.transform = '';
        });
    }
    function _resetDrag() {
        dragState.draggingId = null;
        dragState.draggingType = null;
        dragState.fromIndex = -1;
        __clearAvoidTransform();
        clearTimeout(_dragCleanupTimer);
    }

    function handleDragStart(e, id, type) {
        dragState.draggingId = id;
        dragState.draggingType = type;
        var el = e.currentTarget.closest('tr');
        if (el) {
            dragState.fromIndex = __findRows().indexOf(el);
            try { e.dataTransfer.setData('text/plain', String(id)); e.dataTransfer.effectAllowed = 'move'; } catch (_) {}
        }
        // 30s 兜底清理（拖拽中断防残留高亮）
        clearTimeout(_dragCleanupTimer);
        _dragCleanupTimer = setTimeout(_resetDrag, 30000);
    }

    function handleContainerDragOver(e, type) {
        if (dragState.draggingId !== null && dragState.draggingType === type) e.preventDefault();
    }

    function handleDragOver(e, id, type) {
        if (dragState.draggingId === null || dragState.draggingType !== type) return;
        e.preventDefault();
        // 可用区跨地域拖拽忽略（不避让、不落位）
        if (type === 'zone') {
            var dragRow = __findRowById(dragState.draggingId);
            var targetRow = e.currentTarget.closest('tr');
            if (dragRow && targetRow && dragRow.dataset.dragRegion !== targetRow.dataset.dragRegion) return;
        }
        var row = e.currentTarget.closest('tr');
        if (row) __applyAvoidTransform(row);
    }

    function handleDragLeave() { /* 避让在 drop/end 统一清理 */ }

    function handleDrop(e, id, type) {
        e.preventDefault();
        if (dragState.draggingId === null || dragState.draggingType !== type) return;
        __clearAvoidTransform();
        var list = type === 'region' ? regions : zones;
        var from = list.value.findIndex(function (x) { return String(x.id) === String(dragState.draggingId); });
        var to = list.value.findIndex(function (x) { return String(x.id) === String(id); });
        if (from < 0 || to < 0 || from === to) { _resetDrag(); return; }
        var regionId = null;
        if (type === 'zone') {
            var a = list.value[from], b = list.value[to];
            if (String(a.region_id) !== String(b.region_id)) { _resetDrag(); return; } // 跨地域忽略
            regionId = a.region_id;
        }
        var arr = list.value.slice();
        var item = arr.splice(from, 1)[0];
        arr.splice(to, 0, item);
        list.value = arr;
        var movingId = dragState.draggingId;
        _resetDrag();
        saveReorder(type, regionId, movingId);
    }

    // 落到表格空白区：地域表=排末尾；可用区表跨地域歧义，忽略
    function handleDropOnContainer(e, type) {
        e.preventDefault();
        if (dragState.draggingId === null || dragState.draggingType !== type) return;
        if (type !== 'region') { _resetDrag(); return; }
        __clearAvoidTransform();
        var from = regions.value.findIndex(function (x) { return String(x.id) === String(dragState.draggingId); });
        if (from < 0 || from === regions.value.length - 1) { _resetDrag(); return; }
        var arr = regions.value.slice();
        var item = arr.splice(from, 1)[0];
        arr.push(item);
        regions.value = arr;
        var movingId = dragState.draggingId;
        _resetDrag();
        saveReorder('region', null, movingId);
    }

    function handleDragEnd() { _resetDrag(); }

    // 保存排序：地域提交全部 ids；可用区按拖拽行所属地域分组提交（限定该地域内行）
    async function saveReorder(type, regionId, movingId) {
        try {
            var list = type === 'region' ? regions : zones;
            if (type === 'region') {
                await api('/admin/regions/reorder', { method: 'POST', body: JSON.stringify({ ids: list.value.map(function (x) { return x.id; }) }) });
            } else {
                var ids = list.value.filter(function (x) { return String(x.region_id) === String(regionId); }).map(function (x) { return x.id; });
                await api('/admin/zones/reorder', { method: 'POST', body: JSON.stringify({ region_id: regionId, ids: ids }) });
            }
            // 成功后按服务端权威顺序重载（用户侧 /user/zones 即时反映）
            if (type === 'region') await loadRegions(); else await loadZones();
        } catch (e) {
            console.error('排序保存失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
            if (type === 'region') await loadRegions(); else await loadZones(); // 失败回滚重载
        }
    }

    return {
        regions: regions,
        zones: zones,
        regionLoading: regionLoading,
        zoneLoading: zoneLoading,
        saving: saving,
        regionForm: regionForm,
        zoneForm: zoneForm,
        dragState: dragState,
        load: load,
        loadRegions: loadRegions,
        loadZones: loadZones,
        openRegionModal: openRegionModal,
        saveRegion: saveRegion,
        deleteRegion: deleteRegion,
        openZoneModal: openZoneModal,
        saveZone: saveZone,
        deleteZone: deleteZone,
        zoneIkuaiNames: zoneIkuaiNames,
        handleDragStart: handleDragStart,
        handleContainerDragOver: handleContainerDragOver,
        handleDragOver: handleDragOver,
        handleDragLeave: handleDragLeave,
        handleDrop: handleDrop,
        handleDropOnContainer: handleDropOnContainer,
        handleDragEnd: handleDragEnd,
        saveReorder: saveReorder
    };
})();
