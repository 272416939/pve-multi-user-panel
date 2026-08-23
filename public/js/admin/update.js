(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;

    // State
    $.updateInfo = ref(null);
    $.updateChecking = ref(false);
    $.updateExecuting = ref(false);
    $.updateSource = ref('gitee');

    // Functions
    $.checkUpdate = async function() {
        $.updateChecking.value = true;
        try {
            var data = await api('/admin/system/update/check?source=' + $.updateSource.value);
            $.updateInfo.value = data;
            // 同步更新当前版本号显示（解决首次点击不显示的问题）
            if (data && data.current_version) {
                var verEl = document.getElementById('currentVersion');
                if (verEl) verEl.textContent = 'v' + data.current_version;
            }
        } catch (e) {
            console.error('检查更新失败', e);
            $.updateInfo.value = { has_update: false, error: e.message || window.__i18n.t('admin.update.checkFail') };
        } finally {
            $.updateChecking.value = false;
        }
    };

    $.executeUpdate = async function() {
        if (!(await window.customConfirm(window.__i18n.t('admin.update.confirm')))) return;

        $.updateExecuting.value = true;
        try {
            await api('/admin/system/update/execute', {
                method: 'POST',
                body: JSON.stringify({ source: $.updateSource.value }),
                headers: { 'Content-Type': 'application/json' }
            });
            alert(window.__i18n.t('admin.update.success'));
            setTimeout(function() {
                window.location.reload();
            }, 5000);
        } catch (e) {
            alert(window.__i18n.t('admin.update.failed') + (e.message || window.__i18n.t('common.unknownError')));
            $.updateExecuting.value = false;
        }
    };

    $.initUpdate = function() {};
})();
