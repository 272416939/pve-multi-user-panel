(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var watch = Vue.watch;
    var onMounted = Vue.onMounted;
    var onUnmounted = Vue.onUnmounted;

    // ==================== 状态 ====================
    $.user = ref(null);
    $.activeSection = ref(new URLSearchParams(window.location.search).get('section') || 'vms');
    $.navItems = ref([]);
    var savedTab = localStorage.getItem('admin_activeTab');
    $.activeTab = ref((savedTab === 'assign' ? 'users' : savedTab) || 'users');
    $.activeTabLxc = ref('create');
    $.activeTabVm = ref('manage');
    $.loading = ref(false);
    $.customAlertMessage = ref('');
    $.customConfirmMessage = ref('');
    $.customConfirmResolve = ref(null);
    $.unreadCount = ref(0);
    $.destroyLxcConfirmText = ref('');
    $.currentMsg = ref({ title: '', content: '', type: 1, created_at: '' });

    // ==================== 工具函数注册到$ ====================
    $.formatMemory = formatMemory;
    $.formatBytes = formatBytes;
    $.formatDate = formatDate;
    $.formatUptime = formatUptime;
    $.trimContent = trimContent;
    $.formatDateTimeLocal = formatDateTimeLocal;
    $.getGeekAvatar = getGeekAvatar;

    // ==================== computed ====================
    $.userRole = computed(function() {
        return $.user.value ? $.user.value.role : 'user';
    });

    // ==================== 函数 ====================
    $.switchSection = function(id) {
        if (id === 'user-center') {
            window.location.href = 'user-center.html';
        } else {
            $.activeSection.value = id;
        }
    };

    $.loadUserData = async function() {
        try {
            var userData = await authGuard();
            if (!userData) return false;
            if (userData.role !== 'admin') {
                window.location.href = 'dashboard.html';
                return false;
            }
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
            var items = (res && res.items && res.items.length > 0) ? res.items : [{id:'vms',label:'虚拟机管理'},{id:'lxc',label:'LXC 容器管理'},{id:'admin',label:'管理后台'}];
            $.navItems.value = items;
        } catch (e) {
            // 保留默认导航菜单，不做覆盖
        }
    };

    $.loadData = async function() {
        if ($.userVms.value.length === 0) {
            $.vmsLoading.value = true;
        }
        try {
            $.userVms.value = await api('/user/vms');
        } catch (e) {
            console.error('加载虚拟机失败', e);
        } finally {
            $.vmsLoading.value = false;
        }

        $.loading.value = true;
        try {
            $.users.value = await api('/users');
            $.cdkList.value = await api('/admin/cdk/list');
            var smtpData = await api('/admin/smtp');
            $.smtpConfig.value = smtpData;
            await $.loadSnapshotConfig();
            await $.loadStorageList();
            await $.loadBackupConfig();
            await Promise.all([
                $.loadLxcTemplates(),
                $.loadLxcContainers(),
                $.loadUserLxcContainers()
            ]);
        } catch (e) {
            console.error('加载管理员数据失败', e.message, e.stack);
        } finally {
            $.loading.value = false;
        }
    };

    $.loadAssignData = async function() {
        try {
            var vmData = await api('/pve/vms');
            $.availableVms.value = vmData.available || [];
            $.assignedVms.value = vmData.assigned || [];
        } catch (e) {
            console.error('加载分配数据失败', e);
        }
    };

    $.refreshVms = async function() {
        try {
            var vms = await api('/user/vms');
            $.userVms.value = vms;
        } catch (e) {
            console.error('刷新虚拟机列表失败', e);
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

    $.bsModalShow = function(id) {
        document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
        document.body.classList.remove('modal-open');
        var el = document.getElementById(id);
        if (!el) return;
        bootstrap.Modal.getOrCreateInstance(el, { focus: false }).show();
    };

    $.bsModalHide = function(id) {
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        var el = document.getElementById(id);
        if (el) {
            var modal = bootstrap.Modal.getInstance(el);
            if (modal) modal.hide();
        }
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

    $.parseMarkdown = function(text) {
        if (!text) return '';
        try {
            return marked.parse(text);
        } catch (e) {
            return text;
        }
    };

    $.getRedeemableResourceName = function(resourceId, type) {
        if (type === 'vm') {
            var vm = $.userVms.value.find(function(v) { return v.id == resourceId; });
            if (!vm) return '';
            var exp = vm.expiration_date ? formatDate(vm.expiration_date) : '未设置';
            return (vm.name || 'VM ' + vm.vm_id) + '（到期: ' + exp + '）';
        } else {
            var ct = $.userLxcContainers.value.find(function(c) { return c.id == resourceId; });
            if (!ct) return '';
            var exp = ct.expiration_date ? formatDate(ct.expiration_date) : '未设置';
            return (ct.name || 'CT ' + ct.ct_id) + '（到期: ' + exp + '）';
        }
    };

    // 覆盖 window.alert
    window.alert = function(message) {
        $.customAlertMessage.value = message;
        var el = document.getElementById('customAlertModal');
        if (el) {
            var modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
        }
    };

    // 覆盖 window.customConfirm
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

    // ==================== initCore ====================
    $.initCore = function() {
        var refreshInterval = null;
        var msgPolling = null;

        onMounted(async function() {
            var hasAccess = await $.loadUserData();
            if (hasAccess) {
                await $.loadNavItems();
                await $.loadAssignData();
                await $.loadData();
                await $.loadUnreadCount();
                $.loadNetworkConfig();
                // 若刷新后 activeTab 为 network，主动加载转发规则
                if ($.activeTab.value === 'network') {
                    $.loadForwardRules('all');
                }
                if (msgPolling) clearInterval(msgPolling);
                msgPolling = setInterval($.loadUnreadCount, 30000);

                refreshInterval = setInterval(function() {
                    if ($.user.value && $.activeSection.value === 'vms') {
                        $.refreshVms();
                    } else if ($.user.value && $.activeSection.value === 'lxc') {
                        $.loadUserLxcContainers();
                    }
                }, 10000);
            }
        });

        onUnmounted(function() {
            if (refreshInterval) clearInterval(refreshInterval);
            if (msgPolling) clearInterval(msgPolling);
        });

        watch($.activeTab, function(newTab) {
            localStorage.setItem('admin_activeTab', newTab);
            if (newTab === 'messages') {
                $.loadUnreadCount();
            }
            if (newTab === 'network') {
                $.loadForwardRules('all');
            }
        });

        watch($.activeSection, function(val) {
            var url = new URL(window.location);
            url.searchParams.set('section', val);
            history.replaceState({}, '', url);
        });

        watch(function() { return $.showCreateUser.value; }, function(val) {
            if (val) {
                $.bsModalShow('createUserModal');
                $.showCreateUser.value = false;
            }
        });
    };
})();
