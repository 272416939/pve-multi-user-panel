(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var watch = Vue.watch;

    // ===== 状态 =====
    // tab 白名单校验 + 非法值回退默认（规范第四节：localStorage + 白名单）。
    // 系统切换 tab 不参与持久化：进入日志中心默认打开操作日志；旧链接 ?section=os-switch-logs
    // 由 core.js 置 __legacyOsSwitchTab 标记（仅本次会话定位到系统切换，不污染持久化状态）
    var LOG_TAB_WHITELIST = ['operation', 'admin', 'login', 'os-switch'];
    var legacyOsSwitchTab = !!(window.__admin && window.__admin.__legacyOsSwitchTab);
    var savedLogTab = legacyOsSwitchTab ? 'os-switch' : localStorage.getItem(window.__storageKeys.ADMIN_LOGTAB);
    if (savedLogTab === 'os-switch' && !legacyOsSwitchTab) savedLogTab = null;
    $.logTab = ref(savedLogTab && LOG_TAB_WHITELIST.indexOf(savedLogTab) !== -1 ? savedLogTab : 'operation');
    $.opLogList = ref([]);
    $.adminLogList = ref([]);
    $.loginLogList = ref([]);
    $.opLogTotal = ref(0);
    $.adminLogTotal = ref(0);
    $.loginLogTotal = ref(0);
    $.opLogPage = ref(1);
    $.adminLogPage = ref(1);
    $.loginLogPage = ref(1);
    // 三个 tab 独立筛选状态（reactive 对象，重置用 Object.assign）
    $.opLogFilter = Vue.reactive({ category: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
    $.adminLogFilter = Vue.reactive({ action_prefix: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
    $.loginLogFilter = Vue.reactive({ status: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
    // 日志保留上限（后端返回，Tips 提示用）：用户操作按用户维度 / 后台操作按全站维度
    $.logKeepCount = ref(0);
    $.logKeepAdminCount = ref(0);
    // 分页：每页条数（20/50/100 可选，localStorage 持久化；页码/省略号/跳页逻辑由 pv-pagination 组件内置）
    $.logPageSize = ref(parseInt(localStorage.getItem(window.__storageKeys.ADMIN_LOG_PAGE_SIZE)) || 20);
    $.selectedLogIds = Vue.reactive([]);
    $.logLoading = ref(false);

    // 当前 tab 的列表/分页/总数（模板共用；系统切换 tab 复用 admin.js 的 osSwitchLog 状态）
    $.currentLogList = computed(function() {
        if ($.logTab.value === 'admin') return $.adminLogList.value;
        if ($.logTab.value === 'login') return $.loginLogList.value;
        if ($.logTab.value === 'os-switch') return $.osSwitchLogList.value;
        return $.opLogList.value;
    });
    $.currentLogTotal = computed(function() {
        if ($.logTab.value === 'admin') return $.adminLogTotal.value;
        if ($.logTab.value === 'login') return $.loginLogTotal.value;
        if ($.logTab.value === 'os-switch') return $.osSwitchLogTotal.value;
        return $.opLogTotal.value;
    });
    $.currentLogPage = computed(function() {
        if ($.logTab.value === 'admin') return $.adminLogPage.value;
        if ($.logTab.value === 'login') return $.loginLogPage.value;
        if ($.logTab.value === 'os-switch') return $.osSwitchLogPage.value;
        return $.opLogPage.value;
    });
    // 注：总页数/页码数组/跳页逻辑统一由 pv-pagination 组件内置（低耦合单一实现），页面只维护 total/page/pageSize

    // 请求序号保护：防止旧响应覆盖新数据
    var opLogLoadSeq = 0;
    var adminLogLoadSeq = 0;
    var loginLogLoadSeq = 0;

    // scope=user 操作日志 / scope=admin 后台操作 共用同一端点，按 scope 区分
    function buildOpParams(page, scope) {
        var params = { page: page, limit: $.logPageSize.value, scope: scope };
        var f = $.opLogFilter;
        if (f.category) params.category = f.category;
        if (f.user_id) params.user_id = f.user_id;
        if (f.username) params.username = f.username;
        var kw = (f.keyword || '').trim();
        if (kw) params.keyword = kw;
        if (f.start_date) params.start_date = f.start_date;
        if (f.end_date) params.end_date = f.end_date;
        return params;
    }

    function buildAdminParams(page) {
        var params = { page: page, limit: $.logPageSize.value, scope: 'admin' };
        var f = $.adminLogFilter;
        if (f.action_prefix) params.action_prefix = f.action_prefix;
        if (f.user_id) params.user_id = f.user_id;
        if (f.username) params.username = f.username;
        var kw = (f.keyword || '').trim();
        if (kw) params.keyword = kw;
        if (f.start_date) params.start_date = f.start_date;
        if (f.end_date) params.end_date = f.end_date;
        return params;
    }

    function buildLoginParams(page) {
        var params = { page: page, limit: $.logPageSize.value };
        var f = $.loginLogFilter;
        if (f.status) params.status = f.status;
        if (f.user_id) params.user_id = f.user_id;
        if (f.username) params.username = f.username;
        var kw = (f.keyword || '').trim();
        if (kw) params.keyword = kw;
        if (f.start_date) params.start_date = f.start_date;
        if (f.end_date) params.end_date = f.end_date;
        return params;
    }

    // ===== 加载 =====
    $.loadOperationLogs = async function(page) {
        var seq = ++opLogLoadSeq;
        $.logLoading.value = true;
        try {
            var res = await api('/admin/logs/operation?' + new URLSearchParams(buildOpParams(page || 1, 'user')));
            if (seq !== opLogLoadSeq) return;
            $.opLogList.value = res.rows || [];
            $.opLogTotal.value = res.total || 0;
            $.opLogPage.value = res.page || 1;
            if (res.keep_count) $.logKeepCount.value = res.keep_count;
            if (res.keep_admin_count) $.logKeepAdminCount.value = res.keep_admin_count;
        } catch (e) {
            console.error('加载操作日志失败', e);
        } finally {
            if (seq === opLogLoadSeq) $.logLoading.value = false;
        }
    };

    $.loadAdminLogs = async function(page) {
        var seq = ++adminLogLoadSeq;
        $.logLoading.value = true;
        try {
            var res = await api('/admin/logs/operation?' + new URLSearchParams(buildAdminParams(page || 1)));
            if (seq !== adminLogLoadSeq) return;
            $.adminLogList.value = res.rows || [];
            $.adminLogTotal.value = res.total || 0;
            $.adminLogPage.value = res.page || 1;
            if (res.keep_count) $.logKeepCount.value = res.keep_count;
            if (res.keep_admin_count) $.logKeepAdminCount.value = res.keep_admin_count;
        } catch (e) {
            console.error('加载后台操作日志失败', e);
        } finally {
            if (seq === adminLogLoadSeq) $.logLoading.value = false;
        }
    };

    $.loadLoginLogs = async function(page) {
        var seq = ++loginLogLoadSeq;
        $.logLoading.value = true;
        try {
            var res = await api('/admin/logs/login?' + new URLSearchParams(buildLoginParams(page || 1)));
            if (seq !== loginLogLoadSeq) return;
            $.loginLogList.value = res.rows || [];
            $.loginLogTotal.value = res.total || 0;
            $.loginLogPage.value = res.page || 1;
            if (res.keep_count) $.logKeepCount.value = res.keep_count;
            // 登录日志接口与操作日志对称返回 keep_admin_count：
            // 浏览器原地刷新落在登录 tab 时 Tips 的后台操作上限同样正确（曾显示 0）
            if (res.keep_admin_count) $.logKeepAdminCount.value = res.keep_admin_count;
        } catch (e) {
            console.error('加载登录日志失败', e);
        } finally {
            if (seq === loginLogLoadSeq) $.logLoading.value = false;
        }
    };

    // 统一入口：按当前 tab 分派（侧边栏/刷新/直达路径共用同一加载函数，规范第四节）
    $.loadLogs = function(page) {
        if ($.logTab.value === 'admin') {
            $.loadAdminLogs(page || 1);
        } else if ($.logTab.value === 'login') {
            $.loadLoginLogs(page || 1);
        } else if ($.logTab.value === 'os-switch') {
            if ($.loadOsSwitchLogs) $.loadOsSwitchLogs(page || 1);
        } else {
            $.loadOperationLogs(page || 1);
        }
    };

    // 当前 tab 指定页加载（分页按钮）
    $.loadCurrentLogs = function(page) {
        $.loadLogs(page);
    };

    // 每页条数切换：记住选择并从第 1 页重新加载（pv-pagination 事件回调，接收新条数）
    $.changeLogPageSize = function(size) {
        $.logPageSize.value = size || 20;
        localStorage.setItem(window.__storageKeys.ADMIN_LOG_PAGE_SIZE, $.logPageSize.value);
        $.loadLogs(1);
    };

    // ===== tab 切换 =====
    $.switchLogTab = function(tab) {
        $.logTab.value = tab;
        $.selectedLogIds.splice(0, $.selectedLogIds.length);
        // 点击路径显式加载（数据加载不依赖 watch，规范第四节）
        $.loadLogs(1);
    };

    // watch 仅持久化 tab 选择（白名单已在 ref 初始化校验）；
    // 系统切换 tab 不持久化：切走/刷新后回到默认操作日志，避免污染默认 tab 状态
    watch($.logTab, function(tab) {
        if (tab === 'os-switch') {
            localStorage.removeItem(window.__storageKeys.ADMIN_LOGTAB);
        } else {
            localStorage.setItem(window.__storageKeys.ADMIN_LOGTAB, tab);
        }
    });

    // ===== 刷新 =====
    $.refreshLogs = function() {
        $.loadLogs($.currentLogPage.value);
    };

    // ===== 搜索 =====
    $.searchLogs = function() {
        $.loadLogs(1);
    };

    $.resetLogFilter = function() {
        if ($.logTab.value === 'admin') {
            Object.assign($.adminLogFilter, { action_prefix: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
        } else if ($.logTab.value === 'login') {
            Object.assign($.loginLogFilter, { status: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
        } else if ($.logTab.value !== 'os-switch') {
            Object.assign($.opLogFilter, { category: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
        }
        $.loadLogs(1);
    };

    // ===== 导出 CSV（带筛选条件，blob 下载；系统切换 tab 无导出入口） =====
    $.exportLogs = async function() {
        var isLogin = $.logTab.value === 'login';
        var url;
        var params;
        var filename;
        if (isLogin) {
            url = '/api/admin/logs/login/export';
            params = buildLoginParams(1);
            filename = 'admin_login_logs.csv';
        } else {
            var scope = $.logTab.value === 'admin' ? 'admin' : 'user';
            url = '/api/admin/logs/operation/export';
            params = scope === 'admin' ? buildAdminParams(1) : buildOpParams(1, 'user');
            filename = 'admin_' + (scope === 'admin' ? 'admin' : 'operation') + '_logs.csv';
        }
        delete params.page;
        delete params.limit;
        try {
            var token = await ensureValidToken();
            var resp = await fetch(url + '?' + new URLSearchParams(params), {
                headers: { 'Authorization': 'Bearer ' + (token || '') }
            });
            if (!resp.ok) {
                var err = await resp.json().catch(function() { return {}; });
                throw new Error(err.error || '导出失败');
            }
            var blob = await resp.blob();
            var objUrl = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = objUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
        } catch (e) {
            alert(window.__i18n.tFormat('dash.log.exportFailedMsg', e.message || ''));
        }
    };

    // ===== 详情弹窗（logDetailModal 共享弹窗，展示完整 detail_text 含字段级变更明细） =====
    $.logDetailTitle = ref('');
    $.logDetailMeta = ref('');
    $.logDetailText = ref('');
    $.showLogDetail = function(row) {
        if (!row) return;
        var typeName = row.sub_category_name || row.category_name || row.action || '';
        if (row.sub_category_name && row.sub_category_key) {
            typeName = window.__i18n.t(window.__logI18n.sub(row.sub_category_key)) || row.sub_category_name;
        } else if (row.category_name && row.category_key) {
            typeName = window.__i18n.t(window.__logI18n.cat(row.category_key)) || row.category_name;
        }
        $.logDetailTitle.value = window.__i18n.tFormat('admin.logs.detailTitle', row.id, typeName);
        $.logDetailMeta.value = (row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-')) + ' | ' + (row.created_at || '');
        $.logDetailText.value = row.detail_text || window.__i18n.t('dash.log.noDetail');
        var el = document.getElementById('logDetailModal');
        if (el) {
            var modal = new bootstrap.Modal(el);
            modal.show();
        }
    };

    // ===== 单条删除（系统切换 tab 走现有 $.deleteOsSwitchLog） =====
    $.deleteLogRow = async function(row) {
        if ($.logTab.value === 'os-switch') {
            if ($.deleteOsSwitchLog) $.deleteOsSwitchLog(row.id);
            return;
        }
        if (!(await window.customConfirm(window.__i18n.tFormat('common.confirmDelete', '#' + row.id)))) return;
        try {
            var isLogin = $.logTab.value === 'login';
            var res = await api((isLogin ? '/admin/logs/login/' : '/admin/logs/operation/') + row.id, { method: 'DELETE' });
            if (res && res.success) {
                $.loadLogs($.currentLogPage.value);
            } else {
                alert(res.error || window.__i18n.t('admin.logs.deleteFailed'));
            }
        } catch (e) {
            alert(window.__i18n.t('admin.logs.deleteReqFailed'));
        }
    };

    // ===== 批量删除（系统切换 tab 复用现有批量删除） =====
    $.batchDeleteLogs = async function() {
        if ($.logTab.value === 'os-switch') {
            if ($.batchDeleteOsSwitchLog) $.batchDeleteOsSwitchLog();
            return;
        }
        if ($.selectedLogIds.length === 0) { alert(window.__i18n.t('admin.logs.selectFirst')); return; }
        if (!(await window.customConfirm(window.__i18n.tFormat('admin.logs.confirmBatch', $.selectedLogIds.length)))) return;
        try {
            var isLogin = $.logTab.value === 'login';
            var res = await api(isLogin ? '/admin/logs/login/batch-delete' : '/admin/logs/operation/batch-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: $.selectedLogIds.slice() })
            });
            if (res && res.success) {
                alert(res.message || window.__i18n.t('admin.logs.deleted'));
                $.selectedLogIds.splice(0, $.selectedLogIds.length);
                $.loadLogs($.currentLogPage.value);
            } else {
                alert(res.error || window.__i18n.t('admin.logs.batchFailed'));
            }
        } catch (e) {
            alert(window.__i18n.t('admin.logs.requestFailed'));
        }
    };

    // ===== 全选/单选 =====
    $.toggleAllLog = function(e) {
        $.selectedLogIds.splice(0, $.selectedLogIds.length);
        if (e.target.checked) {
            $.currentLogList.value.forEach(function(r) { $.selectedLogIds.push(r.id); });
        }
    };
    $.toggleOneLog = function(id) {
        var idx = $.selectedLogIds.indexOf(id);
        if (idx > -1) {
            $.selectedLogIds.splice(idx, 1);
        } else {
            $.selectedLogIds.push(id);
        }
    };
    $.isAllLogSelected = function() {
        return $.currentLogList.value.length > 0 && $.selectedLogIds.length === $.currentLogList.value.length;
    };

    // ===== 清空（customConfirm 二次确认 + 后端确认串；系统切换 tab 复用现有清空） =====
    $.clearLogs = async function() {
        if ($.logTab.value === 'os-switch') {
            if ($.clearAllOsSwitchLog) $.clearAllOsSwitchLog();
            return;
        }
        var isLogin = $.logTab.value === 'login';
        var scope = $.logTab.value === 'admin' ? 'admin' : 'user';
        var msg = isLogin ? window.__i18n.t('dash.log.clearLoginConfirm')
            : (scope === 'admin' ? window.__i18n.t('admin.logs.clearAdminConfirm') : window.__i18n.t('admin.logs.clearUserConfirm'));
        if (!(await window.customConfirm(msg))) return;
        var confirmStr = isLogin ? 'CLEAR_ALL_LOGIN_LOGS' : (scope === 'admin' ? 'CLEAR_ALL_ADMIN_LOGS' : 'CLEAR_ALL_OPERATION_LOGS');
        try {
            var res = await api(isLogin ? '/admin/logs/login/clear' : '/admin/logs/operation/clear', {
                method: 'POST',
                body: JSON.stringify({ confirm: confirmStr, scope: scope })
            });
            if (res && res.deleted !== undefined) {
                alert(res.message || window.__i18n.t('admin.logs.cleared'));
            }
            $.loadLogs(1);
        } catch (e) {
            alert(e.message);
        }
    };

    // ===== initLogs（核心 init 链判空调用，防止页面未挂载时报错） =====
    $.initLogs = function() {
        // 数据加载由 switchLogTab / initCore 的 section=logs 分支显式触发，无需在此加载
    };
})();
