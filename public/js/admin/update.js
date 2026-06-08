(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;

    // State
    $.updateInfo = ref(null);
    $.updateChecking = ref(false);
    $.updateExecuting = ref(false);
    $.currentVersion = ref('');

    // Functions
    $.checkUpdate = async function() {
        $.updateChecking.value = true;
        try {
            var data = await api('/admin/system/update/check');
            $.updateInfo.value = data;
            if (data.current_version) {
                $.currentVersion.value = data.current_version;
            }
        } catch (e) {
            console.error('检查更新失败', e);
            $.updateInfo.value = { has_update: false, error: e.message || '检查更新失败' };
        } finally {
            $.updateChecking.value = false;
        }
    };

    $.executeUpdate = async function() {
        if (!(await window.customConfirm('确定要执行更新吗？更新过程中服务会短暂重启，请确保已保存所有操作。'))) return;

        $.updateExecuting.value = true;
        try {
            await api('/admin/system/update/execute', { method: 'POST' });
            // If we get here, the server is about to restart
            alert('更新成功，服务正在重启，请稍后刷新页面...');
            // Wait and try to reload
            setTimeout(function() {
                window.location.reload();
            }, 5000);
        } catch (e) {
            alert('更新失败: ' + (e.message || '未知错误'));
            $.updateExecuting.value = false;
        }
    };

    // initUpdate lifecycle
    $.initUpdate = function() {
        // 从后端 API 获取版本号（与页脚方式一致）
        fetch('/api/version').then(function(r) { return r.json(); }).then(function(d) {
            if (d.version) $.currentVersion.value = d.version;
        });
    };
})();
