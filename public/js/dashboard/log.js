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
    // 分页：每页条数（20/50/100 可选）与跳页输入
    $.logPageSize = ref(parseInt(localStorage.getItem('dashboard_logPageSize')) || 20);
    $.logGoPage = ref('');

    // 当前 tab 的分页/总数（模板共用）
    $.currentLogTotal = computed(function() {
        return $.logTab.value === 'operation' ? $.opLogTotal.value : $.loginLogTotal.value;
    });
    $.currentLogPage = computed(function() {
        return $.logTab.value === 'operation' ? $.opLogPage.value : $.loginLogPage.value;
    });
    $.currentLogTotalPages = computed(function() {
        return Math.ceil($.currentLogTotal.value / $.logPageSize.value) || 1;
    });
    // 页码数组（当前页前后 2 页窗口 + 省略号），如 [1, '...', 3, 4, 5, 6, 7, '...', 100]
    $.logPageNumbers = computed(function() {
        var totalPages = $.currentLogTotalPages.value;
        var cur = $.currentLogPage.value;
        if (totalPages <= 7) {
            var all = [];
            for (var i = 1; i <= totalPages; i++) all.push(i);
            return all;
        }
        var pages = {};
        pages[1] = true;
        pages[totalPages] = true;
        for (var p = cur - 2; p <= cur + 2; p++) {
            if (p >= 1 && p <= totalPages) pages[p] = true;
        }
        var sorted = Object.keys(pages).map(Number).sort(function(a, b) { return a - b; });
        var out = [];
        var prev = 0;
        for (var i = 0; i < sorted.length; i++) {
            if (prev && sorted[i] - prev > 1) out.push('...');
            out.push(sorted[i]);
            prev = sorted[i];
        }
        return out;
    });

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

    // 每页条数切换：记住选择并从第 1 页重新加载
    $.changeLogPageSize = function() {
        localStorage.setItem('dashboard_logPageSize', $.logPageSize.value);
        if ($.logTab.value === 'operation') {
            $.loadOperationLogs(1);
        } else {
            $.loadLoginLogs(1);
        }
    };

    // 前往指定页（输入页码回车跳转，越界自动收敛）
    $.goLogPage = function() {
        var p = parseInt($.logGoPage.value);
        if (!Number.isInteger(p) || p < 1) {
            $.logGoPage.value = '';
            return;
        }
        var max = $.currentLogTotalPages.value;
        if (p > max) p = max;
        $.logGoPage.value = '';
        $.loadCurrentLogs(p);
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
