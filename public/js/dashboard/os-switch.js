(function() {
  var $ = window.__dashboard;
  var Vue = window.Vue;
  var ref = Vue.ref;
  var watch = Vue.watch;

  // ===== OS 切换状态 =====
  $.osSwitchModalVisible = ref(false);
  $.osSwitchList = ref([]);
  $.osSwitchSelectedId = ref(null);
  $.osSwitchConfirm = ref(false);
  $.osSwitchSubmitting = ref(false);
  $.osSwitchCurrentName = ref('');
  $.osSwitchTargetVm = ref(null);

  // ===== OS 切换函数 =====
  $.openOsSwitchModal = async function(vm) {
    $.osSwitchTargetVm.value = vm;
    $.osSwitchSelectedId.value = null;
    $.osSwitchConfirm.value = false;
    try {
      var res = await api('/vm/' + vm.vm_id + '/switchable-os');
      if (res && res.success) {
        $.osSwitchList.value = res.data || [];
        var current = (res.data || []).find(function(t) { return t.id === res.current_os_template_id; });
        $.osSwitchCurrentName.value = current ? current.name : window.__i18n.t('dash.osSwitch.notRecorded');
      } else {
        $.osSwitchList.value = [];
      }
    } catch (e) {
      console.error('[os-switch] 加载可切换列表失败', e);
      $.osSwitchList.value = [];
    }
    // 使用 Bootstrap Modal API 显示弹窗
    var el = document.getElementById('osSwitchModal');
    if (el) {
      var modal = new bootstrap.Modal(el);
      modal.show();
    }
  };

  $.closeOsSwitchModal = function() {
    $.osSwitchModalVisible.value = false;
  };

  $.submitOsSwitch = async function() {
    var vm = $.osSwitchTargetVm.value;
    if (!vm) return;
    $.osSwitchSubmitting.value = true;
    try {
      var res = await api('/vm/' + vm.vm_id + '/switch-os', {
        method: 'POST',
        body: JSON.stringify({ os_template_id: $.osSwitchSelectedId.value })
      });
      if (res && res.success) {
        alert(window.__i18n.t('dash.osSwitch.started'));
        $.closeOsSwitchModal();
        // 立即刷新列表，让「切换中」徽标即刻展示并锁定操作按钮
        if (typeof $.loadData === 'function') {
          $.loadData();
        } else if (typeof $.loadUserVms === 'function') {
          $.loadUserVms();
        }
        // 开始轮询状态
        startOsSwitchPoll(vm, res.switch_log_id);
      } else if (res && res.error) {
        alert(res.error);
      } else {
        alert(window.__i18n.t('dash.osSwitch.switchFailed'));
      }
    } catch (e) {
      alert(e.message || window.__i18n.t('dash.osSwitch.requestFailed'));
    } finally {
      $.osSwitchSubmitting.value = false;
    }
  };

  // 进度轮询
  function startOsSwitchPoll(vm, logId) {
    var pollInterval = setInterval(async function() {
      try {
        var res = await api('/vm/' + vm.vm_id + '/switch-os/status');
        if (res && res.status) {
          if (res.status === 'success') {
            clearInterval(pollInterval);
            alert(window.__i18n.t('dash.osSwitch.success'));
            // 刷新 VM 列表
            if (typeof $.loadUserVms === 'function') {
              $.loadUserVms();
            } else if (typeof $.loadData === 'function') {
              $.loadData();
            }
          } else if (res.status === 'failed') {
            clearInterval(pollInterval);
            alert(window.__i18n.t('dash.osSwitch.failedNotify'));
          } else if (res.status === 'rolled_back') {
            clearInterval(pollInterval);
            alert(window.__i18n.t('dash.osSwitch.rolledBackNotify'));
          }
        }
      } catch (e) {
        // 轮询失败不处理
      }
    }, 3000);
    // 5 分钟后自动停止轮询
    setTimeout(function() { clearInterval(pollInterval); }, 300000);
  }

  // 注册到全局 dashboard 对象，供模板通过 osSwitch.xxx 访问
  $.osSwitch = {
    openOsSwitchModal: $.openOsSwitchModal,
    closeOsSwitchModal: $.closeOsSwitchModal,
    submitOsSwitch: $.submitOsSwitch
  };

  // 关闭弹窗时清理选择状态
  document.addEventListener('DOMContentLoaded', function() {
    var el = document.getElementById('osSwitchModal');
    if (el) {
      el.addEventListener('hidden.bs.modal', function() {
        $.osSwitchConfirm.value = false;
        $.osSwitchSubmitting.value = false;
      });
    }
  });
})();