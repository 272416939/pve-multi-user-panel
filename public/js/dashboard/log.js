(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;

    // ===== 状态 =====
    $.opLogList = ref([]);
    $.loginLogList = ref([]);
    $.opLogTotal = ref(0);
    $.loginLogTotal = ref(0);
    $.opLogPage = ref(1);
    $.loginLogPage = ref(1);
    $.opLogFilter = ref({ category: '' });
    $.loginLogFilter = ref({ status: '' });
    $.logKeyword = ref('');
    $.logLoading = ref(false);
    // 日志保留上限（后端返回，Tips 提示用）
    $.logKeepCount = ref(0);
    // 分页：每页条数（20/50/100 可选；页码/省略号/跳页逻辑由 pv-pagination 组件内置）
    $.logPageSize = ref(parseInt(localStorage.getItem('dashboard_logPageSize')) || 20);

    // 当前 tab 的分页/总数（模板共用）
    $.currentLogTotal = computed(function() {
        return $.logTab.value === 'operation' ? $.opLogTotal.value : $.loginLogTotal.value;
    });
    $.currentLogPage = computed(function() {
        return $.logTab.value === 'operation' ? $.opLogPage.value : $.loginLogPage.value;
    });
    // 注：总页数/页码数组/跳页逻辑统一由 pv-pagination 组件内置（低耦合单一实现），页面只维护 total/page/pageSize

    // 请求序号保护：防止旧响应覆盖新数据
    var opLogLoadSeq = 0;
    var loginLogLoadSeq = 0;

    function buildOpParams(page) {
        var params = { page: page, limit: $.logPageSize.value };
        var f = $.opLogFilter.value;
        if (f.category) params.category = f.category;
        var kw = $.logKeyword.value.trim();
        if (kw) params.keyword = kw;
        return params;
    }

    function buildLoginParams(page) {
        var params = { page: page, limit: $.logPageSize.value };
        var f = $.loginLogFilter.value;
        if (f.status) params.status = f.status;
        var kw = $.logKeyword.value.trim();
        if (kw) params.keyword = kw;
        return params;
    }

    // ===== 加载 =====
    $.loadOperationLogs = async function(page) {
        var seq = ++opLogLoadSeq;
        $.logLoading.value = true;
        try {
            var res = await api('/logs/operation?' + new URLSearchParams(buildOpParams(page || 1)));
            if (seq !== opLogLoadSeq) return;
            $.opLogList.value = res.rows || [];
            $.opLogTotal.value = res.total || 0;
            $.opLogPage.value = res.page || 1;
            if (res.keep_count) $.logKeepCount.value = res.keep_count;
        } catch (e) {
            console.error('加载操作日志失败', e);
        } finally {
            if (seq === opLogLoadSeq) $.logLoading.value = false;
        }
    };

    $.loadLoginLogs = async function(page) {
        var seq = ++loginLogLoadSeq;
        $.logLoading.value = true;
        try {
            var res = await api('/logs/login?' + new URLSearchParams(buildLoginParams(page || 1)));
            if (seq !== loginLogLoadSeq) return;
            $.loginLogList.value = res.rows || [];
            $.loginLogTotal.value = res.total || 0;
            $.loginLogPage.value = res.page || 1;
            if (res.keep_count) $.logKeepCount.value = res.keep_count;
        } catch (e) {
            console.error('加载登录日志失败', e);
        } finally {
            if (seq === loginLogLoadSeq) $.logLoading.value = false;
        }
    };

    // 当前 tab 指定页加载（分页按钮）
    $.loadCurrentLogs = function(page) {
        if ($.logTab.value === 'operation') {
            $.loadOperationLogs(page);
        } else {
            $.loadLoginLogs(page);
        }
    };

    // 每页条数切换：记住选择并从第 1 页重新加载（pv-pagination 事件回调，接收新条数）
    $.changeLogPageSize = function(size) {
        $.logPageSize.value = size || 20;
        localStorage.setItem('dashboard_logPageSize', $.logPageSize.value);
        if ($.logTab.value === 'operation') {
            $.loadOperationLogs(1);
        } else {
            $.loadLoginLogs(1);
        }
    };

    // ===== tab 切换 =====
    $.switchLogTab = function(tab) {
        $.logTab.value = tab;
        // 数据加载由 core.js watch($.logTab) 统一处理（点击与刷新路径一致）
    };

    // ===== 刷新 =====
    $.refreshLogs = function() {
        if ($.logTab.value === 'operation') {
            $.loadOperationLogs($.opLogPage.value);
        } else {
            $.loadLoginLogs($.loginLogPage.value);
        }
    };

    // ===== 搜索 =====
    $.searchLogs = function() {
        if ($.logTab.value === 'operation') {
            $.loadOperationLogs(1);
        } else {
            $.loadLoginLogs(1);
        }
    };

    $.resetLogFilter = function() {
        $.logKeyword.value = '';
        if ($.logTab.value === 'operation') {
            $.opLogFilter.value = { category: '' };
            $.loadOperationLogs(1);
        } else {
            $.loginLogFilter.value = { status: '' };
            $.loadLoginLogs(1);
        }
    };

    // ===== 导出 CSV（带筛选条件，blob 下载） =====
    $.exportLogs = async function() {
        var isOp = $.logTab.value === 'operation';
        var params = isOp ? buildOpParams(1) : buildLoginParams(1);
        delete params.page;
        delete params.limit;
        var url = isOp ? '/api/logs/operation/export' : '/api/logs/login/export';
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
            a.download = isOp ? 'operation_logs.csv' : 'login_logs.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(objUrl);
        } catch (e) {
            alert('导出失败: ' + (e.message || ''));
        }
    };

    // ===== 清空（customConfirm 二次确认 + 后端确认串） =====
    $.clearLogs = async function() {
        var isOp = $.logTab.value === 'operation';
        var msg = isOp ? '确定清空全部操作日志？此操作不可恢复。' : '确定清空全部登录日志？此操作不可恢复。';
        if (!await window.customConfirm(msg)) return;
        try {
            await api(isOp ? '/logs/operation/clear' : '/logs/login/clear', {
                method: 'POST',
                body: JSON.stringify({ confirm: isOp ? 'CLEAR_OPERATION_LOGS' : 'CLEAR_LOGIN_LOGS' })
            });
            if (isOp) {
                $.opLogList.value = [];
                $.opLogTotal.value = 0;
            } else {
                $.loginLogList.value = [];
                $.loginLogTotal.value = 0;
            }
        } catch (e) {
            alert(e.message);
        }
    };

    // ===== initLogs =====
    $.initLogs = function() {
        // 数据加载由 core.js 的 switchSection/switchLogSub/watch($.logTab) 触发
    };
})();
