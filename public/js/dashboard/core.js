(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var onMounted = Vue.onMounted;
    var onUnmounted = Vue.onUnmounted;
    var watch = Vue.watch;

    // ===== 状态 =====
    $.user = ref(null);
    $.loading = ref(false);
    $.activeTab = ref(localStorage.getItem('dashboard_activeTab') || 'vms');
    $.activeTabVm = ref('info');
    $.activeTabLxc = ref('info');
    $.customAlertMessage = ref('');
    $.customConfirmMessage = ref('');
    $.customConfirmResolve = ref(null);
    $.unreadCount = ref(0);
    $.activeSection = ref(new URLSearchParams(window.location.search).get('section') || 'vm');
    $.navItems = ref([]);
    $.users = ref([]);

    // computed
    $.currentNavId = computed(function() { return $.activeSection.value === 'vm' ? 'vms' : 'lxc'; });

    // ===== 工具函数注册到 $（从 shared.js 全局函数引用） =====
    $.formatMemory = formatMemory;
    $.formatBytes = formatBytes;
    $.formatDate = formatDate;
    $.formatUptime = formatUptime;
    $.trimContent = trimContent;
    $.getGeekAvatar = getGeekAvatar;
    $.formatDateTimeLocal = formatDateTimeLocal;

    $.formatLxcUptime = function(uptime) {
        if (uptime === undefined || uptime === null) return '-';
        return formatUptime(uptime);
    };

    // ===== alert/confirm =====
    window.alert = function(message) {
        $.customAlertMessage.value = message;
        var el = document.getElementById('customAlertModal');
        if (el) {
            var modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        }
    };

    $.showAlertAndWait = function(message) {
        return new Promise(function(resolve) {
            $.customAlertMessage.value = message;
            var el = document.getElementById('customAlertModal');
            if (!el) { resolve(); return; }
            el.addEventListener('hidden.bs.modal', function onHidden() {
                el.removeEventListener('hidden.bs.modal', onHidden);
                resolve();
            }, { once: true });
            var modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        });
    };

    window.customConfirm = function(message) {
        return new Promise(function(resolve) {
            $.customConfirmMessage.value = message;
            $.customConfirmResolve.value = resolve;
            var el = document.getElementById('customConfirmModal');
            if (!el) { resolve(false); return; }
            var modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        });
    };

    $.confirmOk = function() {
        var resolve = $.customConfirmResolve.value;
        if (resolve) {
            $.customConfirmResolve.value = null;
            resolve(true);
        }
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        var el = document.getElementById('customConfirmModal');
        if (el) {
            var modal = bootstrap.Modal.getInstance(el);
            if (modal) modal.hide();
        }
    };

    $.confirmCancel = function() {
        var resolve = $.customConfirmResolve.value;
        if (resolve) {
            $.customConfirmResolve.value = null;
            resolve(false);
        }
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        var el = document.getElementById('customConfirmModal');
        if (el) {
            var modal = bootstrap.Modal.getInstance(el);
            if (modal) modal.hide();
        }
    };

    // ===== 导航/用户函数 =====
    $.switchSection = function(section) {
        $.activeSection.value = section;
    };

    $.loadUserData = async function() {
        try {
            var userData = await authGuard();
            if (!userData) return false;
            $.user.value = userData;
            return true;
        } catch (e) {
            console.error('加载用户数据失败', e);
            window.location.href = 'login.html';
            return false;
        }
    };

    $.loadNavItems = async function() {
        try {
            var res = await api('/user/nav');
            var items = (res && res.items && res.items.length > 0) ? res.items : [{id:'vms',label:'我的虚拟机'},{id:'lxc',label:'我的LXC容器'}];
            $.navItems.value = items;
        } catch (e) {
            // 保留默认导航菜单
        }
    };

    $.loadData = async function() {
        if ($.userVms.value.length === 0) {
            $.loading.value = true;
        }
        try {
            $.userVms.value = await api('/user/vms');
            if ($.user.value && $.user.value.role === 'admin') {
                try {
                    $.users.value = await api('/users');
                } catch (e) {
                    console.error('获取用户列表失败', e);
                }
            }
        } catch (e) {
            console.error('加载数据失败', e);
        } finally {
            $.loading.value = false;
        }
    };

    $.loadUnreadCount = async function() {
        try {
            var data = await api('/messages/unread-count');
            $.unreadCount.value = data.count;
        } catch (e) {}
    };

    $.logout = function() {
        var refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            fetch('/api/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: refreshToken })
            }).catch(function() {});
        }
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        window.location.href = 'login.html';
    };

    $.switchToMessages = function() {
        $.activeTab.value = 'messages';
        $.loadMessages();
        $.loadUnreadCount();
    };

    // ===== 辅助函数 =====
    $.bsModalShow = function(id) {
        document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
        document.body.classList.remove('modal-open');
        var el = document.getElementById(id);
        if (!el) return;
        bootstrap.Modal.getOrCreateInstance(el, { focus: false }).show();
    };

    $.bsModalHide = function(id) {
        var el = document.getElementById(id);
        if (el) {
            var modal = bootstrap.Modal.getInstance(el);
            if (modal) modal.hide();
        }
    };

    // ===== 生命周期 =====
    $.refreshInterval = null;
    $.msgPolling = null;

    $.initCore = function() {
        onMounted(async function() {
            var userData = await authGuard();
            if (userData) {
                $.user.value = userData;
                await $.loadNavItems();
                await $.loadData();
                await $.loadLxcContainers();
                await $.loadUnreadCount();
                if ($.msgPolling) clearInterval($.msgPolling);
                $.msgPolling = setInterval($.loadUnreadCount, 30000);

                $.refreshInterval = setInterval(function() {
                    if ($.user.value && $.activeSection.value === 'vm') {
                        $.loadData();
                    }
                    if ($.user.value && $.activeSection.value === 'lxc') {
                        $.loadLxcContainers();
                    }
                    var backupEl = document.getElementById('backupModal');
                    if (backupEl && backupEl.classList.contains('show') && $.backups.value.some(function(b) { return b.status === 'running' || b.status === 'pending'; })) {
                        $.loadBackups($.backupVmId.value);
                    }
                    var lxcBackupEl = document.getElementById('lxcBackupModal');
                    if (lxcBackupEl && lxcBackupEl.classList.contains('show') && $.lxcBackups.value.some(function(b) { return b.status === 'running' || b.status === 'pending'; })) {
                        $.loadLxcBackups($.lxcBackupCtId.value);
                    }
                }, 10000);
            }
        });

        onUnmounted(function() {
            if ($.refreshInterval) clearInterval($.refreshInterval);
            if ($.msgPolling) clearInterval($.msgPolling);
        });

        watch($.activeTab, function(newTab) {
            localStorage.setItem('dashboard_activeTab', newTab);
            if (newTab === 'messages') {
                $.loadMessages();
                $.loadUnreadCount();
            }
        });
    };
})();
