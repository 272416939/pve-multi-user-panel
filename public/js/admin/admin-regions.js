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

    return {
        regions: regions,
        zones: zones,
        regionLoading: regionLoading,
        zoneLoading: zoneLoading,
        saving: saving,
        regionForm: regionForm,
        zoneForm: zoneForm,
        load: load,
        loadRegions: loadRegions,
        loadZones: loadZones,
        openRegionModal: openRegionModal,
        saveRegion: saveRegion,
        deleteRegion: deleteRegion,
        openZoneModal: openZoneModal,
        saveZone: saveZone,
        deleteZone: deleteZone,
        zoneIkuaiNames: zoneIkuaiNames
    };
})();
