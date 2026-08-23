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
    var watch = Vue.watch;

    var PAGE_CHUNK = 200;        // 每组展开的分页条数（增量「加载更多」）
    var SAVE_BATCH = 500;        // 与后端单次保存上限对齐

    // 分类生效位置描述（i18n key，随界面语言切换；前缀→key 映射，值在各语言文件的 admin.i18n.cat.*）
    var CATEGORY_DESC = {
        admin: 'admin.i18n.cat.admin',
        dash: 'admin.i18n.cat.dash',
        user: 'admin.i18n.cat.user',
        settings: 'admin.i18n.cat.settings',
        login: 'admin.i18n.cat.login',
        register: 'admin.i18n.cat.register',
        nav: 'admin.i18n.cat.nav',
        common: 'admin.i18n.cat.common',
        lang: 'admin.i18n.cat.lang',
        shared: 'admin.i18n.cat.shared',
        terminal: 'admin.i18n.cat.terminal',
        vnc: 'admin.i18n.cat.vnc',
        password: 'admin.i18n.cat.password',
        err: 'admin.i18n.cat.err'
    };

    // ==================== 状态 ====================
    var languages = ref([]);         // 注册表（系统 + 自定义）
    var systemLanguages = ref([]);   // 复制源下拉（仅系统语言）
    var selectedCode = ref('zh-CN'); // 当前查看/编辑语言（默认简体中文）
    var currentLanguage = ref(null); // {code,name,base_code,is_system}
    // 分组元数据（管理界面打开只拉这份轻量数据：分类/计数/待翻译；展开分组才分页拉条目）
    var groupsMeta = ref([]);        // [{cat,count,pending,percent,hasPending}]
    // 分组条目分页缓存：key = `${lang}|${cat}|${mode}` → {rows,page,total,loading}
    var loaded = reactive({});
    // 搜索平铺结果（搜索跨组分页）
    var searchRows = ref([]);
    var searchMeta = reactive({ total: 0, page: 0, loading: false });
    // 已加载条目聚合（驱动 languageMeta 覆盖数/dirtyCount/resetDisabled 等既有消费点）
    var entries = computed(function () {
        var out = [];
        Object.keys(loaded).forEach(function (k) {
            out = out.concat(loaded[k].rows);
        });
        return out;
    });
    // 元信息（响应式 computed：语言切换/覆盖数变化时自动重建，避免 load 时一次性快照残留中文）
    var languageMeta = computed(function () {
        var lang = currentLanguage.value;
        if (!lang) return '';
        var list = entries.value;
        var totalCount = 0;
        groupsMeta.value.forEach(function (g) { totalCount += g.count; });
        var parts = [
            window.__i18n.t('admin.i18n.code') + ': ' + lang.code,
            window.__i18n.t('admin.i18n.entries') + ': ' + totalCount
        ];
        if (lang.base_code && !lang.is_system) {
            parts.push(window.__i18n.t('admin.i18n.copyFrom') + ': ' + lang.base_code);
        }
        var overrideCount = 0, newCount = 0;
        list.forEach(function (r) { if (r.override) overrideCount++; if (r.is_new) newCount++; });
        if (overrideCount > 0) parts.push(window.__i18n.t('admin.i18n.overridesCount') + ': ' + overrideCount);
        if (newCount > 0) parts.push(window.__i18n.t('admin.i18n.isNewCount') + ': ' + newCount);
        return parts.join(' · ');
    });
    var isCustom = ref(false);
    var loading = ref(false);
    var saving = ref(false);
    var creating = ref(false);
    var search = ref('');
    var collapsed = reactive({});    // {category: false=展开}；缺省=折叠

    // 语言启用开关受控状态（v-model 本地 ref，load/toggle 同步——失败回滚时值翻转触发重渲染；
    // 非 :checked 单向绑定：服务端拒绝（zh-CN 守卫）后 computed 值未变，浏览器翻转的 checkbox 状态会残留）
    var langSwitchChecked = ref(true);
    var dirty = reactive({});        // 草稿 {key: ''}；'' 表示删除覆盖恢复基线
    var createForm = reactive({ name: '', baseCode: 'en' });
    var summary = ref(null);         // 待翻译汇总（跨语言，侧边栏红点 + 页内横幅）
    var showOnlyPending = ref(false); // 只看待翻译（顶部横幅「查看待翻译」）

    // 搜索模式（非空关键词 → 跨组平铺分页结果，不走分组结构）
    var searchMode = computed(function () {
        return !!(search.value || '').trim();
    });

    // 清理草稿（切语言/重载时丢弃旧草稿；分组折叠/已展示条数保留，
    // 避免保存或切语言后所有分类收起——展开状态属通用视图状态，跨语言复用）
    function clearDirty() {
        Object.keys(dirty).forEach(function (k) { delete dirty[k]; });
    }

    // 待翻译统计（当前语言）：待翻译 = is_new && !override；快照词条视为已完成
    // 用分组元数据聚合（全量口径，非已加载分页条目）
    var pendingInfo = computed(function () {
        var total = 0, pending = 0;
        groupsMeta.value.forEach(function (g) {
            total += g.count;
            pending += g.pending;
        });
        return { total: total, pending: pending, percent: total > 0 ? Math.round((total - pending) / total * 100) : 100 };
    });

    // 有待翻译的语言清单（跨语言汇总，从 summary 过滤 pending>0，按待翻译数降序）
    var pendingLanguages = computed(function () {
        var langs = (summary.value && summary.value.languages) || [];
        var out = [];
        for (var i = 0; i < langs.length; i++) {
            if (langs[i].pending > 0) out.push(langs[i]);
        }
        out.sort(function (a, b) { return b.pending - a.pending; });
        return out;
    });

    // 切换到指定语言（顶部待翻译语言清单点击直达）
    function selectLanguage(code) {
        if (selectedCode.value === code) return;
        selectedCode.value = code;
        load();
    }

    // 分组视图（元数据骨架 + 展开分组的已加载条目；搜索模式走 searchRows 平铺，不走这里）
    var groups = computed(function () {
        if (searchMode.value) return [];
        var mode = showOnlyPending.value ? 'p' : 'n';
        return groupsMeta.value.map(function (g) {
            var cat = g.cat;
            var load = loaded[selectedCode.value + '|' + cat + '|' + mode];
            var rows = load ? load.rows : [];
            var collapsedFlag = collapsed[cat] !== false; // 缺省折叠；展开才加载
            // 每行 dirty 判定：逐 key 直接读 dirty[r.key] 建立响应式依赖
            // （hasOwnProperty.call 不经过 Vue 的 get trap（无 getOwnPropertyDescriptor），
            //  且短路写法在 key 首次写入前从未触发 get → computed 不重算，badge/脏色不出现）
            var visible = collapsedFlag ? [] : rows.map(function (r) {
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
                // 描述走 t()（读 _translations → 响应式依赖），语言切换时 groups 自动重算更新
                desc: CATEGORY_DESC[cat] ? window.__i18n.t(CATEGORY_DESC[cat]) : '',
                count: g.count,
                pending: g.pending,
                percent: g.percent,
                hasPending: g.hasPending,
                visible: visible,
                hasMore: !collapsedFlag && !!load && rows.length < load.total,
                loading: !!load && load.loading
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
            // 拉分组元数据（无 cat/kw → groups；轻量，不返回条目）
            var metaPromise = api('/admin/i18n/languages/' + encodeURIComponent(code) + '/entries' + (showOnlyPending.value ? '?pending=1' : '')).then(function (d) {
                groupsMeta.value = (d && d.groups) || [];
                currentLanguage.value = (d && d.language) || null;
                isCustom.value = !!(d && d.language && !d.language.is_system);
                return d;
            });
            // 并行拉待翻译汇总（页内横幅 + 侧边栏红点）；失败不阻塞条目展示
            var summaryPromise = api('/admin/i18n/summary').then(function (s) {
                summary.value = s;
                if ($.i18nPendingCount) $.i18nPendingCount.value = (s && s.totalPending) || 0;
                return s;
            }).catch(function (e) {
                console.error('加载 i18n 待翻译汇总失败', e && e.message);
                return null;
            });
            await metaPromise;
            langSwitchChecked.value = selectedEnabled.value; // 切语言后开关跟随新语言的启用状态
            clearDirty();
            resetLoaded(); // 清分页/搜索缓存（语言/模式变了）
            // 已展开的分组（跨语言复用展开状态）重拉当前语言第 1 页；搜索态恢复搜索结果
            var cats = [];
            Object.keys(collapsed).forEach(function (k) { if (collapsed[k] === false) cats.push(k); });
            cats.forEach(function (cat) { ensureLoaded(cat); });
            if (searchMode.value) doSearch(1);
            await summaryPromise;
        } catch (e) {
            console.error('加载 i18n 条目失败', e && e.message);
            alert(window.__i18n.t('admin.i18n.loadFail'));
            groupsMeta.value = [];
        } finally {
            loading.value = false;
        }
    }

    // 分组分页缓存 key（语言 + 分组 + 视图模式隔离：切换语言/待翻译模式互不串扰）
    function keyFor(cat) {
        return selectedCode.value + '|' + cat + '|' + (showOnlyPending.value ? 'p' : 'n');
    }

    // 清空分组分页与搜索缓存（切语言/切换待翻译模式/保存后重建）
    function resetLoaded() {
        Object.keys(loaded).forEach(function (k) { delete loaded[k]; });
        searchRows.value = [];
        searchMeta.total = 0;
        searchMeta.page = 0;
        searchMeta.loading = false;
    }

    // 展开分组时按需加载第 1 页（已加载/加载中则跳过）
    async function ensureLoaded(cat) {
        var k = keyFor(cat);
        var cur = loaded[k];
        if (cur && (cur.rows.length > 0 || cur.loading)) return;
        await loadCat(cat, 1);
    }

    // 分页拉取分组条目（page=1 重置，>1 追加）
    async function loadCat(cat, page) {
        var k = keyFor(cat);
        var cur = loaded[k] || { rows: [], page: 0, total: 0, loading: false };
        if (cur.loading) return;
        cur.loading = true;
        try {
            var q = new URLSearchParams({ cat: cat, page: page, limit: PAGE_CHUNK });
            if (showOnlyPending.value) q.set('pending', '1');
            var res = await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value) + '/entries?' + q.toString());
            cur.rows = page === 1 ? (res.entries || []) : cur.rows.concat(res.entries || []);
            cur.page = page;
            cur.total = res.total || cur.rows.length;
        } catch (e) {
            console.error('加载 i18n 分组条目失败', e && e.message);
        } finally {
            cur.loading = false;
            loaded[k] = cur;
        }
    }

    // 搜索分页（跨组分页平铺；kw 变化经 watch 防抖触发）
    async function doSearch(page) {
        var kw = (search.value || '').trim();
        if (!kw) { searchRows.value = []; searchMeta.total = 0; return; }
        if (searchMeta.loading) return;
        searchMeta.loading = true;
        try {
            var q = new URLSearchParams({ kw: kw, page: page || 1, limit: PAGE_CHUNK });
            if (showOnlyPending.value) q.set('pending', '1');
            var res = await api('/admin/i18n/languages/' + encodeURIComponent(selectedCode.value) + '/entries?' + q.toString());
            var p = page || 1;
            searchRows.value = p === 1 ? (res.entries || []) : searchRows.value.concat(res.entries || []);
            searchMeta.total = res.total || searchRows.value.length;
            searchMeta.page = p;
        } catch (e) {
            console.error('搜索 i18n 词条失败', e && e.message);
        } finally {
            searchMeta.loading = false;
        }
    }

    // 搜索输入防抖（250ms）触发跨组分页搜索
    var searchTimer = null;
    watch(search, function () {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
            if (searchMode.value) doSearch(1);
            else { searchRows.value = []; searchMeta.total = 0; }
        }, 250);
    });

    // 分组折叠/展开（缺省折叠；展开时按需加载第 1 页，收起保留已加载缓存）
    function toggleGroup(cat) {
        var willExpand = collapsed[cat] !== false;
        collapsed[cat] = willExpand ? false : true;
        if (willExpand) ensureLoaded(cat);
    }

    // 分组增量加载（下一页追加）
    function loadMore(cat) {
        var cur = loaded[keyFor(cat)];
        if (!cur || cur.loading) return;
        loadCat(cat, cur.page + 1);
    }

    // 搜索平铺结果加载更多
    function searchLoadMore() {
        if (searchMeta.loading) return;
        doSearch(searchMeta.page + 1);
    }

    // 展开状态整体重置为缺省（全收起）：逐 key 删除恢复「缺省折叠」语义
    function resetCollapsed() {
        Object.keys(collapsed).forEach(function (k) { delete collapsed[k]; });
    }

    // 只看待翻译（顶部横幅「查看待翻译」；打开时清空搜索避免过滤叠加；
    // 分类默认收起——词条多时按需点开关注的分组，分组头可随时收起/再展开）
    function openPending() {
        search.value = '';
        showOnlyPending.value = true;
        resetCollapsed();
        load(); // 重新拉元数据（pending 过滤）+ 清分页缓存
    }

    // 退出待翻译视图（展开状态一并重置为缺省收起，不残留待翻译视图中的展开操作）
    function closePending() {
        showOnlyPending.value = false;
        resetCollapsed();
        load();
    }

    // ==================== 词条输入/回显（3. 保存后回显改动值） ====================

    // 输入框显示值：草稿优先（含 ''=清空恢复），否则：
    // - 待翻译词条（is_new && !override）显示空框（等待用户填写，placeholder=原文参考）——避免预填源语言值造成「已翻译」误导
    // - 其余显示当前生效值（覆盖值或基线）；保存后 load 清草稿 → 回退 row.value（覆盖后的新值）实现回显
    function fieldValue(row) {
        if (dirty[row.key] !== undefined) return dirty[row.key];
        if (row.is_new && !row.override) return '';
        return row.value;
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

    // 当前选中语言的启用状态（缺省视为启用，兼容注册表未带 enabled 的过渡态）
    var selectedEnabled = computed(function () {
        var l = null;
        for (var i = 0; i < languages.value.length; i++) {
            if (languages.value[i].code === selectedCode.value) { l = languages.value[i]; break; }
        }
        return !l || l.enabled !== false;
    });

    // 语言启用开关（关闭后用户端不可选择/不展示，admin 后台不受影响；
    // zh-CN 兜底语言与站点默认语言由后端守卫拒绝，错误经 code 词条翻译弹出后开关回滚）
    // 成功后本地直写开关与列表（不依赖列表接口重拉——HTTP 缓存层在写后可能短暂返回
    // 旧列表，曾致开关回弹且无法重新打开）；shared 层（用户端白名单）尽力刷新，失败不影响 UI
    async function toggleEnabled(ev) {
        var target = ev && ev.target ? ev.target.checked : !langSwitchChecked.value;
        var code = selectedCode.value;
        try {
            await api('/admin/i18n/languages/' + encodeURIComponent(code) + '/enabled', {
                method: 'PUT',
                body: JSON.stringify({ enabled: target })
            });
            // 本地同步列表（开关不改变语言集合，无需整体重拉）
            var list = languages.value.slice();
            for (var i = 0; i < list.length; i++) {
                if (list[i].code === code) { list[i] = Object.assign({}, list[i], { enabled: target }); break; }
            }
            languages.value = list;
            langSwitchChecked.value = target;
            alert(window.__i18n.t(target ? 'admin.i18n.enableOk' : 'admin.i18n.disableOk'));
        } catch (e) {
            console.error('设置 i18n 语言开关失败', e && e.message);
            langSwitchChecked.value = selectedEnabled.value; // 服务端拒绝：回滚开关显示
            alert(window.__i18n.t('admin.i18n.createFail') + (e && e.message ? ' ' + e.message : ''));
            return;
        }
        // 后台刷新 shared 层注册表（用户端下拉/白名单即时同步；失败静默，下次页面加载自愈）
        try {
            await window.__i18n.refreshLanguages();
        } catch (_) {}
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
        summary: summary,
        showOnlyPending: showOnlyPending,
        groups: groups,
        groupsMeta: groupsMeta,
        loaded: loaded,
        searchMode: searchMode,
        searchRows: searchRows,
        searchMeta: searchMeta,
        pendingInfo: pendingInfo,
        pendingLanguages: pendingLanguages,
        dirtyCount: dirtyCount,
        resetDisabled: resetDisabled,
        // 方法
        load: load,
        save: save,
        resetAll: resetAll,
        selectLanguage: selectLanguage,
        toggleGroup: toggleGroup,
        toggleEnabled: toggleEnabled,
        selectedEnabled: selectedEnabled,
        langSwitchChecked: langSwitchChecked,
        loadMore: loadMore,
        searchLoadMore: searchLoadMore,
        openPending: openPending,
        closePending: closePending,
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
