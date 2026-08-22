// 管理端 i18n 页面逻辑（「其他」→「i18n 管理」）
// 状态约定与 os-template.js 一致：ref 在模板中以 .value 显式访问；drafts/collapsed 用 reactive
// （key 需动态增删且写入时驱动响应式重算，纯对象不会被 Vue 追踪）。
// 模板引用全部经 $.i18nPage 暴露（window.__admin 在 setup return 中整体展开，见 admin-page.js）。
window.__admin = window.__admin || {};
window.__admin.i18nPage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var reactive = Vue.reactive;

    var PAGE_CHUNK = 200;        // 每组展开的分页条数（增量「加载更多」）
    var SAVE_BATCH = 500;        // 与后端单次保存上限对齐

    // 分类描述（生效位置，供管理员了解词条在哪些页面显示；管理工具用中文母本说明）
    var CATEGORY_DESC = {
        admin: '后台管理（用户/虚拟机/套餐/模板/系统设置等管理页）',
        dash: '用户仪表盘（控制台/资产卡片/日志中心/消息）',
        user: '用户中心（个人资料/钱包/订单/通知设置）',
        settings: '系统设置（站点/支付/安全/网络/快照备份配置）',
        login: '登录页',
        register: '注册页',
        nav: '全站侧边栏菜单（后台/仪表盘/用户中心）',
        common: '全站通用（保存/取消/确认/加载/删除）',
        lang: '语言选择器（语言原生名）',
        shared: '跨端共享（弹窗/组件/工具提示）',
        terminal: 'Web 终端',
        vnc: 'VNC 控制台',
        password: '密码相关提示'
    };

    // ==================== 状态 ====================
    var languages = ref([]);         // 注册表（系统 + 自定义）
    var systemLanguages = ref([]);   // 复制源下拉（仅系统语言）
    var selectedCode = ref('zh-CN'); // 当前查看/编辑语言（默认简体中文）
    var entries = ref([]);           // [{key, original, value, override, is_new}]
    var languageMeta = ref('');
    var isCustom = ref(false);
    var loading = ref(false);
    var saving = ref(false);
    var creating = ref(false);
    var search = ref('');
    var collapsed = reactive({});    // {category: false=展开}；缺省=折叠
    var dirty = reactive({});        // 草稿 {key: ''}；'' 表示删除覆盖恢复基线
    var shown = reactive({});        // 每组已渲染条数（分组缓存）
    var createForm = reactive({ name: '', baseCode: 'en' });

    // 清理草稿（切语言/重载时丢弃旧草稿；分组折叠/已展示条数保留，
    // 避免保存或切语言后所有分类收起——展开状态属通用视图状态，跨语言复用）
    function clearDirty() {
        Object.keys(dirty).forEach(function (k) { delete dirty[k]; });
    }

    // 分类折叠组（分组 = key 首个点分前缀；搜索时强制展开并按 500 条上限显示）
    var groups = computed(function () {
        var kw = (search.value || '').trim().toLowerCase();
        var map = {};
        var order = [];
        entries.value.forEach(function (r) {
            if (kw) {
                var hit = r.key.toLowerCase().indexOf(kw) !== -1 ||
                    String(r.value).toLowerCase().indexOf(kw) !== -1 ||
                    String(r.original).toLowerCase().indexOf(kw) !== -1;
                if (!hit) return;
            }
            var cat = r.key.split('.')[0] || '_';
            if (!map[cat]) { map[cat] = []; order.push(cat); }
            map[cat].push(r);
        });
        return order.map(function (cat) {
            var rows = map[cat];
            var collapsedFlag = kw ? false : collapsed[cat] !== false; // 缺省折叠；搜索强制展开
            var limit = collapsedFlag ? 0 : (shown[cat] || PAGE_CHUNK);
        // 每行 dirty 判定：逐 key 直接读 dirty[r.key] 建立响应式依赖
        // （hasOwnProperty.call 不经过 Vue 的 get trap（无 getOwnPropertyDescriptor），
        //  且短路写法在 key 首次写入前从未触发 get → computed 不重算，badge/脏色不出现）
        var visible = collapsedFlag ? [] : rows.slice(0, limit).map(function (r) {
            var d = dirty[r.key];
            return {
                key: r.key,
                original: r.original,
                value: r.value,
                override: r.override,
                is_new: r.is_new,
                zh: r.zh,
                dirty: d !== undefined && d !== r.value
            };
        });
            return {
                key: cat,
                label: cat,
                desc: CATEGORY_DESC[cat] || '',
                count: rows.length,
                visible: visible,
                hasMore: !collapsedFlag && rows.length > visible.length
            };
        });
    });

    // 未保存修改数（草稿存在且与当前生效值不同；空串=恢复基线）
    var dirtyCount = computed(function () {
        var n = 0;
        Object.keys(dirty).forEach(function (k) {
            var cur = null;
            var found = false;
            for (var i = 0; i < entries.value.length; i++) {
                if (entries.value[i].key === k) { cur = entries.value[i].value; found = true; break; }
            }
            if (!found || dirty[k] !== cur) n++;
        });
        return n;
    });

    var resetDisabled = computed(function () {
        return loading.value || entries.value.length === 0;
    });

    // ==================== 数据加载 ====================

    function buildMeta(data) {
        var lang = (data && data.language) || {};
        var list = (data && data.entries) || [];
        var parts = [
            window.__i18n.t('admin.i18n.code') + ': ' + lang.code,
            window.__i18n.t('admin.i18n.entries') + ': ' + list.length
        ];
        if (lang.base_code && !lang.is_system) {
            parts.push(window.__i18n.t('admin.i18n.copyFrom') + ': ' + lang.base_code);
        }
        var overrideCount = 0, newCount = 0;
        list.forEach(function (r) { if (r.override) overrideCount++; if (r.is_new) newCount++; });
        if (overrideCount > 0) parts.push(window.__i18n.t('admin.i18n.overridesCount') + ': ' + overrideCount);
        if (newCount > 0) parts.push(window.__i18n.t('admin.i18n.isNewCount') + ': ' + newCount);
        return parts.join(' · ');
    }

    // 进入/切换语言/刷新路径统一入口（core.js watch + onMounted 同源调用，规范第四节）
    async function load() {
        loading.value = true;
        try {
            // 先刷新注册表（管理端新建/重命名/删除语言后可即时反映到下拉）
            languages.value = await window.__i18n.refreshLanguages();
            systemLanguages.value = languages.value.filter(function (l) { return l.is_system; });
            // 选中语言已被删除：回退 zh-CN
            if (!languages.value.some(function (l) { return l.code === selectedCode.value; })) {
                selectedCode.value = 'zh-CN';
            }
            var code = selectedCode.value;
            var data = await api('/admin/i18n/languages/' + encodeURIComponent(code) + '/entries');
            entries.value = (data && data.entries) || [];
            isCustom.value = !!(data && data.language && !data.language.is_system);
            languageMeta.value = buildMeta(data);
            clearDirty();
        } catch (e) {
            console.error('加载 i18n 条目失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.loadFail'));
            entries.value = [];
        } finally {
            loading.value = false;
        }
    }

    // 分组折叠/展开（缺省折叠；记录已展开集合）
    function toggleGroup(cat) {
        collapsed[cat] = collapsed[cat] === false ? true : false;
    }

    // 分组增量加载（展开超过 200 条时）
    function loadMore(cat) {
        shown[cat] = (shown[cat] || PAGE_CHUNK) + PAGE_CHUNK;
    }

    // ==================== 词条输入/回显（3. 保存后回显改动值） ====================

    // 输入框显示值：草稿优先（含 ''=清空恢复），否则显示当前生效值（覆盖值或基线）
    // ——保存后 load() 清空草稿，输入框回退显示 row.value（覆盖后的新值），实现回显
    function fieldValue(row) {
        return dirty[row.key] !== undefined ? dirty[row.key] : row.value;
    }

    // v-model 替代：写草稿（触发响应式脏态/保存计数）
    function onFieldInput(row, e) {
        dirty[row.key] = e.target.value;
    }

    // 单条是否可恢复（有覆盖或未保存草稿）
    function rowOverridable(row) {
        return row.override || row.dirty;
    }

    // ==================== 写操作 ====================

    // 保存全部未保存草稿（空串=删除覆盖恢复基线；按 500 批发送）
    async function save() {
        if (saving.value || dirtyCount.value < 1) return;
        saving.value = true;
        try {
            var payload = Object.keys(dirty).map(function (k) {
                return { key: k, value: dirty[k] };
            });
            for (var i = 0; i < payload.length; i += SAVE_BATCH) {
                await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value) + '/entries', {
                    method: 'PUT',
                    body: JSON.stringify({ entries: payload.slice(i, i + SAVE_BATCH) })
                });
            }
            await load();
            // 当前界面语言正被编辑时强制重拉本地字典（setLocale 同语言短路，必须 refreshLocale）
            if (window.__i18n.getLocale() === selectedCode.value) {
                window.__i18n.refreshLocale();
            }
            alert(window.__i18n.t('admin.i18n.saveOk'));
        } catch (e) {
            console.error('保存 i18n 词条失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.saveFail') + (e && e.message ? ' ' + e.message : ''));
        } finally {
            saving.value = false;
        }
    }

    // 清空该语言全部覆盖（恢复基线：系统=内置文件 / 自定义=快照+源文件）
    async function resetAll() {
        if (resetDisabled.value) return;
        var ok = await window.customConfirm(
            window.__i18n.t('admin.i18n.resetAllConfirm') + ' [' + selectedCode.value + ']'
        );
        if (!ok) return;
        try {
            await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value) + '/reset', { method: 'POST' });
            await load();
            if (window.__i18n.getLocale() === selectedCode.value) {
                window.__i18n.refreshLocale();
            }
            alert(window.__i18n.t('admin.i18n.resetOk'));
        } catch (e) {
            console.error('恢复 i18n 默认失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.saveFail') + (e && e.message ? ' ' + e.message : ''));
        }
    }

    // 单条恢复默认（有覆盖或未保存改动时出现）：清空该 key 覆盖 → 恢复基线
    async function restoreKey(row) {
        try {
            await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value) + '/entries', {
                method: 'PUT',
                body: JSON.stringify({ entries: [{ key: row.key, value: '' }] })
            });
            await load();
            if (window.__i18n.getLocale() === selectedCode.value) {
                window.__i18n.refreshLocale();
            }
            alert(window.__i18n.t('admin.i18n.resetOk'));
        } catch (e) {
            console.error('恢复词条默认失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.saveFail') + (e && e.message ? ' ' + e.message : ''));
        }
    }

    // 新建语言弹窗（名称 + 复制来源）
    function openCreateModal() {
        createForm.name = '';
        createForm.baseCode = systemLanguages.value.length ? systemLanguages.value[0].code : 'en';
        $.bsModalShow('i18nCreateModal');
    }

    async function createLang() {
        if (creating.value) return;
        var name = (createForm.name || '').trim();
        if (!name) {
            alert(window.__i18n.t('admin.i18n.nameRequired'));
            return;
        }
        creating.value = true;
        try {
            var res = await api('/admin/i18n/languages', {
                method: 'POST',
                body: JSON.stringify({ name: name, base_code: createForm.baseCode })
            });
            $.bsModalHide('i18nCreateModal');
            selectedCode.value = res.code;
            await load();
            alert(window.__i18n.t('admin.i18n.createOk') + ' ' + name);
        } catch (e) {
            console.error('新建 i18n 语言失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.createFail') + (e && e.message ? ' ' + e.message : ''));
        } finally {
            creating.value = false;
        }
    }

    // 重命名（仅自定义语言；customPrompt 单输入框）
    async function rename() {
        var lang = null;
        for (var i = 0; i < languages.value.length; i++) {
            if (languages.value[i].code === selectedCode.value) { lang = languages.value[i]; break; }
        }
        var val = await window.customPrompt(window.__i18n.t('admin.i18n.newLangName') + ' [' + selectedCode.value + ']', lang ? lang.name : '');
        if (val === null || val === undefined) return;
        val = val.trim();
        if (!val || (lang && val === lang.name)) return;
        try {
            await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value), {
                method: 'PUT',
                body: JSON.stringify({ name: val })
            });
            await load();
            alert(window.__i18n.t('admin.i18n.renameOk'));
        } catch (e) {
            console.error('重命名 i18n 语言失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.createFail') + (e && e.message ? ' ' + e.message : ''));
        }
    }

    // 删除（仅自定义语言；沿用/站点默认/用户引用时后端 409 拦截）
    async function remove() {
        var ok = await window.customConfirm(
            window.__i18n.t('admin.i18n.deleteConfirm') + ' [' + selectedCode.value + ']'
        );
        if (!ok) return;
        try {
            await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value), { method: 'DELETE' });
            selectedCode.value = 'zh-CN';
            await load();
            alert(window.__i18n.t('admin.i18n.deleteOk'));
        } catch (e) {
            console.error('删除 i18n 语言失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.createFail') + (e && e.message ? ' ' + e.message : ''));
        }
    }

    return {
        // 状态（模板 .value 显式访问）
        languages: languages,
        systemLanguages: systemLanguages,
        selectedCode: selectedCode,
        entries: entries,
        languageMeta: languageMeta,
        isCustom: isCustom,
        loading: loading,
        saving: saving,
        creating: creating,
        search: search,
        collapsed: collapsed,
        dirty: dirty,
        createForm: createForm,
        groups: groups,
        dirtyCount: dirtyCount,
        resetDisabled: resetDisabled,
        // 方法
        load: load,
        save: save,
        resetAll: resetAll,
        toggleGroup: toggleGroup,
        loadMore: loadMore,
        fieldValue: fieldValue,
        onFieldInput: onFieldInput,
        rowOverridable: rowOverridable,
        restoreKey: restoreKey,
        openCreateModal: openCreateModal,
        createLang: createLang,
        rename: rename,
        remove: remove
    };
})();
