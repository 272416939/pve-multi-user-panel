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
    $.activeSection = ref(new URLSearchParams(window.location.search).get('section') || 'overview');
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
// ==================== 详情弹窗状态 ====================
$.showVmDetail = ref(false);
$.detailVm = ref({});
$.detailVmCharts = [];
$.detailVmTimer = null;
$.detailVmChartData = null;

    // ==================== 模板/套餐页面状态 ====================
    $.activeTabTemplates = ref('vm');
    $.activeTabPackages = ref('vm');

    // packagePage 对象：挂载到 $ 上，Vue 模板中可自动解包
    $.packagePage = {
        vmPackages: ref([]),
        lxcPackages: ref([]),
        vmProvisionForm: ref({ package_id: '' }),
        lxcProvisionForm: ref({ package_id: '' }),
        loadVmPackages: function() {
            if ($.packagePage.vmPackages.value.length === 0) {
                api('/admin/packages?type=vm').then(function(data) {
                    $.packagePage.vmPackages.value = data || [];
                }).catch(function(e) {
                    console.error('加载VM套餐失败', e);
                });
            }
        },
        loadLxcPackages: function() {
            if ($.packagePage.lxcPackages.value.length === 0) {
                api('/admin/packages?type=lxc').then(function(data) {
                    $.packagePage.lxcPackages.value = data || [];
                }).catch(function(e) {
                    console.error('加载LXC套餐失败', e);
                });
            }
        }
    };

    // templatePage 对象：挂载到 $ 上
    $.templatePage = {
        loadVmTemplates: function() {
            // 预留：加载 VM 模板列表
        },
        loadLxcTemplates: function() {
            // 预留：加载 LXC 模板列表
        }
    };

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

// ==================== 详情弹窗 computed ====================
$.detailVmConfigStr = computed(function() {
    var vm = $.detailVm.value;
    if (!vm || !vm.config) return '-';
    var str = (vm.config.sockets || 1) + '*' + (vm.config.cores || 1) + '核 ' + formatMemory(vm.config.memory);
    // 磁盘容量：优先取status.maxdisk，其次从config磁盘字段提取size
    var diskStr = '';
    if (vm.status && vm.status.maxdisk) {
        diskStr = $.formatBytes(vm.status.maxdisk);
    } else {
        var diskKeys = ['scsi0','virtio0','sata0','ide0','rootfs'];
        for (var i = 0; i < diskKeys.length; i++) {
            var dv = vm.config[diskKeys[i]];
            if (dv) {
                var m = dv.match(/size=(\d+[KMGT]?)/i);
                if (m) { diskStr = m[1]; break; }
                if (vm.status && vm.status.maxdisk) diskStr = $.formatBytes(vm.status.maxdisk);
            }
        }
    }
    if (diskStr) str += ' / ' + diskStr;
    return str;
});
$.detailVmOsStr = computed(function() {
    var vm = $.detailVm.value;
    if (!vm) return '-';
    return vm.os || (vm.config ? (vm.config.ostype || '-') : '-');
});
$.detailVmStatusStr = computed(function() {
    var vm = $.detailVm.value;
    if (!vm || !vm.status) return '未知';
    return vm.status.status === 'running' ? '运行中' : '已停止';
});
$.detailVmUptimeStr = computed(function() {
    var vm = $.detailVm.value;
    if (!vm || !vm.status || vm.status.status !== 'running') return '-';
    return typeof vm.status.uptime !== 'undefined' ? $.formatUptime(vm.status.uptime) : '-';
});

// ==================== 用户数据变化时同步 Header 头像 ====================
watch($.user, function(u) {
    if (!u) return;
    var avatarEl = document.querySelector('.header-user-avatar');
    var nameEl = document.querySelector('.header-username');
    if (avatarEl) {
        if (u.avatar) {
            avatarEl.src = u.avatar;
        } else {
            avatarEl.src = getGeekAvatar(u.username || 'Admin');
        }
    }
    if (nameEl) nameEl.textContent = u.username || 'Admin';
}, { immediate: true });

    // ==================== Overview 总览统计 ====================
    $.overviewVmRunning = computed(function() {
        var vms = $.userVms.value || [];
        return vms.filter(function(v) { return v.status && v.status.status === 'running'; }).length;
    });
    $.overviewVmStopped = computed(function() {
        var vms = $.userVms.value || [];
        return vms.filter(function(v) { return !v.status || v.status.status !== 'running'; }).length;
    });
    $.overviewCtRunning = computed(function() {
        var cts = $.userLxcContainers.value || [];
        return cts.filter(function(c) { return c.status && c.status.status === 'running'; }).length;
    });
    $.overviewCtStopped = computed(function() {
        var cts = $.userLxcContainers.value || [];
        return cts.filter(function(c) { return !c.status || c.status.status !== 'running'; }).length;
    });
    // 环形图进度偏移量（周长377，运行占比）
    $.circleVmOffset = computed(function() {
        var vms = $.userVms.value || [];
        if (vms.length === 0) return 377;
        var running = vms.filter(function(v) { return v.status && v.status.status === 'running'; }).length;
        return 377 - (377 * running / vms.length);
    });
    $.circleCtOffset = computed(function() {
        var cts = $.userLxcContainers.value || [];
        if (cts.length === 0) return 377;
        var running = cts.filter(function(c) { return c.status && c.status.status === 'running'; }).length;
        return 377 - (377 * running / cts.length);
    });

    // ==================== 函数 ====================
    $.switchSection = function(id, options) {
        if (id === 'user-center') {
            window.location.href = 'user-center.html';
            return;
        }
        $.activeSection.value = id;
        // Close sidebar on mobile after navigation
        if (window.innerWidth <= 768) {
            var sb = document.getElementById('sidebar');
            var ol = document.getElementById('sidebarOverlay');
            if (sb) sb.classList.remove('open');
            if (ol) ol.style.display = 'none';
        }
        // Clear all active states including parent menus
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(item) {
            item.classList.remove('active');
        });
        // If a target submenu item is specified, highlight it
        if (options && options.highlight) {
            var target = document.querySelector('[data-subsection="' + options.highlight + '"]');
            if (target) target.classList.add('active');
        }
    };

    $.switchPage = function(page) {
        var section;
        var subId;
        if (page === 'vm-templates') {
            section = 'templates';
            subId = 'templates-vm';
            $.activeTabTemplates.value = 'vm';
            $.templatePage.loadVmTemplates();
        } else if (page === 'lxc-templates') {
            section = 'templates';
            subId = 'templates-lxc';
            $.activeTabTemplates.value = 'lxc';
            $.templatePage.loadLxcTemplates();
        } else if (page === 'vm-packages') {
            section = 'packages';
            subId = 'packages-vm';
            $.activeTabPackages.value = 'vm';
            $.packagePage.loadVmPackages();
        } else if (page === 'lxc-packages') {
            section = 'packages';
            subId = 'packages-lxc';
            $.activeTabPackages.value = 'lxc';
            $.packagePage.loadLxcPackages();
        }
        if (!section) return;
        $.switchSection(section);
        $.expandedSections.value[section] = true;
        var el = document.getElementById('submenu-' + section);
        if (el) el.classList.add('open');
        var parent = el ? el.previousElementSibling : null;
        if (parent) parent.classList.add('expanded');
        document.querySelectorAll('.nav-submenu .nav-item').forEach(function(item) {
            item.classList.remove('active');
        });
        var target = document.querySelector('[data-subsection="' + subId + '"]');
        if (target) target.classList.add('active');
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
            var el = document.getElementById('adminMsgCount');
            if (el) {
                el.textContent = data.count;
                el.style.display = data.count > 0 ? '' : 'none';
            }
        } catch (e) {}
    };

    $.resubAll = function() {
        if (window._pushClient && window._pushClient.readyState === WebSocket.OPEN) {
            for (var i = 0; i < $.userVms.value.length; i++) {
                sendPush({ type: 'subscribe', vmid: $.userVms.value[i].vm_id, isLxc: false });
            }
            for (var i = 0; i < $.userLxcContainers.value.length; i++) {
                sendPush({ type: 'subscribe', vmid: $.userLxcContainers.value[i].ct_id, isLxc: true });
            }
        } else {
            var q = window._pushSubscribeQueue || [];
            for (var i = 0; i < $.userVms.value.length; i++) {
                q.push({ type: 'subscribe', vmid: $.userVms.value[i].vm_id, isLxc: false });
            }
            for (var i = 0; i < $.userLxcContainers.value.length; i++) {
                q.push({ type: 'subscribe', vmid: $.userLxcContainers.value[i].ct_id, isLxc: true });
            }
        }
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
            return DOMPurify.sanitize(marked.parse(text));
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

    // ===== 二级菜单 =====
    $.expandedSections = ref({});

    $.toggleSubmenu = function(section) {
        $.expandedSections.value[section] = !$.expandedSections.value[section];
        var el = document.getElementById('submenu-' + section);
        if (el) el.classList.toggle('open', $.expandedSections.value[section]);
        var parent = el ? el.previousElementSibling : null;
        if (parent) parent.classList.toggle('expanded', $.expandedSections.value[section]);
    };

    $.switchSubsection = function(section, tab) {
        $.switchSection(section);
        if (section === 'vms') {
            $.activeTabVm.value = tab;
        } else if (section === 'lxc') {
            $.activeTabLxc.value = tab;
        }
        $.expandedSections.value[section] = true;
        var el = document.getElementById('submenu-' + section);
        if (el) el.classList.add('open');
        var parent = el ? el.previousElementSibling : null;
        if (parent) parent.classList.add('expanded');
        document.querySelectorAll('.nav-submenu .nav-item').forEach(function(item) {
            item.classList.remove('active');
        });
        var target = document.querySelector('[data-subsection="' + section + '-' + tab + '"]');
        if (target) target.classList.add('active');
    };

    $.switchAdminTab = function(tab) {
        // Determine which group this tab belongs to
        var manageTabs = ['users', 'cdk', 'messages', 'vm-packages', 'lxc-packages'];
        var settingsTabs = ['smtp', 'snapshot-backup', 'network', 'pay'];
        var section;
        var submenuId;

        if (manageTabs.indexOf(tab) !== -1) {
            section = 'manage';
            submenuId = 'submenu-manage';
        } else if (settingsTabs.indexOf(tab) !== -1) {
            section = 'settings';
            submenuId = 'submenu-settings';
        } else {
            section = 'admin'; // fallback
            submenuId = 'submenu-admin';
        }

        $.switchSection(section);
        $.activeTab.value = tab;
        $.expandedSections.value[section] = true;
        var el = document.getElementById(submenuId);
        if (el) el.classList.add('open');
        var parent = el ? el.previousElementSibling : null;
        if (parent) parent.classList.add('expanded');
        // Clear active state in this submenu, then highlight target
        document.querySelectorAll('#' + submenuId + ' .nav-item').forEach(function(item) {
            item.classList.remove('active');
        });
        // Map tab to data-subsection attribute
        var subMap = {
            'users': 'manage-users',
            'cdk': 'manage-cdk',
            'messages': 'manage-messages',
            'vm-templates': 'manage-vm-templates',
            'lxc-templates': 'manage-lxc-templates',
            'vm-packages': 'manage-vm-packages',
            'lxc-packages': 'manage-lxc-packages',
            'smtp': 'settings-smtp',
            'snapshot-backup': 'settings-snapshot-backup',
            'network': 'settings-network',
            'pay': 'settings-pay'
        };
        var target = document.querySelector('[data-subsection="' + (subMap[tab] || 'admin-' + tab) + '"]');
        if (target) target.classList.add('active');
        if (tab === 'vm-packages' && $.packagePage) $.packagePage.loadVmPackages();
        if (tab === 'lxc-packages' && $.packagePage) $.packagePage.loadLxcPackages();
    };

    // ==================== 详情弹窗函数 ====================
    $.openVmDetail = function(vm) {
        var detailVm = Object.assign({}, vm);
        // IP优先取ip字段，其次dhcp_static_ip回写
        detailVm.ip = detailVm.ip || detailVm.dhcp_static_ip || '-';
        $.detailVm.value = detailVm;
        $.showVmDetail.value = true;
        document.body.style.overflow = 'hidden';
        // 延迟初始化图表（等 DOM 渲染完成）
        setTimeout(function() {
            try {
                $.initDetailCharts();
            } catch(e) {
                console.warn('Chart init error:', e);
            }
        }, 200);
    };

    // 打开 LXC 容器详情弹窗
    $.openLxcDetail = function(ct) {
        $.detailVm.value = {
        vm_id: ct.ct_id,
        name: ct.name || ('CT ' + ct.ct_id),
        ip: ct.ip || ct.dhcp_static_ip || '-',
        config: ct.config,
        os: ct.template_name || (ct.config ? ct.config.ostype : '-'),
        status: ct.status,
        renewal_price: ct.renewal_price || '',
        _isLxc: true
    };
        $.showVmDetail.value = true;
        document.body.style.overflow = 'hidden';
        setTimeout(function() {
            try { $.initDetailCharts(); } catch(e) { console.warn('Chart init error:', e); }
        }, 200);
    };

$.closeVmDetail = function() {
    var vm = $.detailVm.value;
    if (vm && vm.vm_id) {
        sendPush({ type: 'unsubscribe-detail', vmid: vm.vm_id });
    }
    $.showVmDetail.value = false;
    document.body.style.overflow = '';
    if ($.detailVmTimer) clearInterval($.detailVmTimer);
    $.detailVmTimer = null;
    $.detailVmChartData = null;
    $.detailVmCharts.forEach(function(c) { if(c) c.destroy(); });
    $.detailVmCharts = [];
};

$.initDetailCharts = function() {
    var vm = $.detailVm.value;
    if (!vm) return;

    $.detailVmCharts.forEach(function(c) { if(c) c.destroy(); });
    $.detailVmCharts = [];
    if ($.detailVmTimer) clearInterval($.detailVmTimer);
    $.detailVmTimer = null;

    var isRunning = vm.status && vm.status.status === 'running';
    var isLxc = !!vm._isLxc;
    var textColor = '#9CA3AF';
    var gridColor = 'rgba(148,163,184,0.15)';
    var maxPoints = 15;  // 显示30秒数据（每2秒一个点）

    var cpuEl = document.getElementById('detailCpuChart');
    var memEl = document.getElementById('detailMemChart');
    var netEl = document.getElementById('detailNetChart');
    var diskEl = document.getElementById('detailDiskChart');
    if(!cpuEl || !memEl || !netEl || !diskEl) return;

    // 初始化空数据数组
    var cpuData = [], memData = [], netInData = [], netOutData = [], diskReadData = [], diskWriteData = [];
    var labels = [];
    for(var i=0;i<maxPoints;i++){cpuData.push(null);memData.push(null);netInData.push(null);netOutData.push(null);diskReadData.push(null);diskWriteData.push(null);labels.push('');}

    $.detailVmChartData = { cpuData: cpuData, memData: memData, netInData: netInData, netOutData: netOutData, diskReadData: diskReadData, diskWriteData: diskWriteData, labels: labels, maxPoints: maxPoints };

    var commonOpts = {
        responsive:true,maintainAspectRatio:false,
        animation:{duration:200},
        scales:{
            x:{ticks:{color:textColor,font:{size:10},maxTicksLimit:8},grid:{color:gridColor}},
            y:{beginAtZero:true,max:100,ticks:{color:textColor,font:{size:10}},grid:{color:gridColor}}
        },
        plugins:{legend:{display:false}}
    };

    var dualYOpts = Object.assign({},commonOpts,{
        scales:Object.assign({},commonOpts.scales,{
            y:Object.assign({},commonOpts.scales.y,{max:null})
        }),
        plugins:{legend:{display:true,labels:{color:textColor,font:{size:10},boxWidth:12}}}
    });

    // 创建4个图表实例
    $.detailVmCharts.push(new Chart(cpuEl.getContext('2d'),{
        type:'line',data:{labels:labels,datasets:[{label:'CPU',data:cpuData,borderColor:'#36D399',backgroundColor:'rgba(54,211,153,0.1)',tension:0.4,fill:true,pointRadius:0,borderWidth:2}]},
        options:commonOpts}));
    $.detailVmCharts.push(new Chart(memEl.getContext('2d'),{
        type:'line',data:{labels:labels,datasets:[{label:'MEM',data:memData,borderColor:'#36A2EB',backgroundColor:'rgba(54,162,235,0.1)',tension:0.4,fill:true,pointRadius:0,borderWidth:2}]},
        options:commonOpts}));
    $.detailVmCharts.push(new Chart(netEl.getContext('2d'),{
        type:'line',data:{labels:labels,datasets:[
            {label:'上行',data:netOutData,borderColor:'#FBBF24',tension:0.4,fill:false,pointRadius:0,borderWidth:2},
            {label:'下行',data:netInData,borderColor:'#36D399',tension:0.4,fill:false,pointRadius:0,borderWidth:2}
        ]},options:dualYOpts}));
    $.detailVmCharts.push(new Chart(diskEl.getContext('2d'),{
        type:'line',data:{labels:labels,datasets:[
            {label:'读取',data:diskReadData,borderColor:'#36A2EB',tension:0.4,fill:false,pointRadius:0,borderWidth:2},
            {label:'写入',data:diskWriteData,borderColor:'#F53F3F',tension:0.4,fill:false,pointRadius:0,borderWidth:2}
        ]},options:dualYOpts}));

    $.fetchDetailStatus = function() {
        var vm = $.detailVm.value;
        if (!vm || !vm.vm_id) return;
        var endpoint = isLxc ? '/lxc/' + vm.vm_id + '/status' : '/vm/' + vm.vm_id + '/status';
        api(endpoint).then(function(res) {
            $.feedDetailCharts(res.status || {});
        }).catch(function(err) { console.warn('监控数据获取失败:', err.message || err); });
    };

    $.feedDetailCharts = function(s) {
        if (!$.detailVmChartData) return;
        var d = $.detailVmChartData;
        var vm = $.detailVm.value;
        if (!vm || !s) return;
        var cpuVal = typeof s.cpu === 'number' ? Math.round(s.cpu * 100) : 0;
        var memVal = (s.mem && s.maxmem) ? Math.round(s.mem / s.maxmem * 100) : 0;
        var netInVal = typeof s.netin === 'number' ? +(s.netin * 8 / 1000000).toFixed(2) : 0;
        var netOutVal = typeof s.netout === 'number' ? +(s.netout * 8 / 1000000).toFixed(2) : 0;
        var diskReadVal = typeof s.diskread === 'number' ? +(s.diskread / 1048576).toFixed(2) : 0;
        var diskWriteVal = typeof s.diskwrite === 'number' ? +(s.diskwrite / 1048576).toFixed(2) : 0;

        d.cpuData.push(cpuVal); d.memData.push(memVal);
        d.netInData.push(netInVal); d.netOutData.push(netOutVal);
        d.diskReadData.push(diskReadVal); d.diskWriteData.push(diskWriteVal);

        if(d.cpuData.length > d.maxPoints){d.cpuData.shift();d.memData.shift();d.netInData.shift();d.netOutData.shift();d.diskReadData.shift();d.diskWriteData.shift();}
        d.labels.splice(0,d.labels.length);
        for(var i=Math.max(0,d.cpuData.length-d.maxPoints);i<d.cpuData.length;i++){d.labels.push(i*2+'s');}

        $.detailVmCharts.forEach(function(c){if(c)c.update('none');});
    };

    $.fetchDetailStatus();
    if(isRunning){
        sendPush({ type: 'subscribe-detail', vmid: vm.vm_id, isLxc: isLxc });
    }
};

// ==================== initCore ====================
    $.initCore = function() {

        onMounted(async function() {
            var hasAccess = await $.loadUserData();
            if (hasAccess) {
                await $.loadNavItems();
                await $.loadAssignData();
                await $.loadData();
                await $.loadMacGroups();
                // Auto-expand submenu based on current section
                if ($.activeSection.value === 'vms' || $.activeSection.value === 'lxc') {
                    setTimeout(function() {
                        $.toggleSubmenu($.activeSection.value);
                    }, 100);
                } else if ($.activeSection.value === 'manage' || $.activeSection.value === 'settings') {
                    setTimeout(function() {
                        $.toggleSubmenu($.activeSection.value);
                    }, 100);
                }
                await $.loadUserLxcContainers();
                $.loadUnreadCount();
                initPushClient(function(msg) {
                    if (msg.type === 'unread') {
                        $.unreadCount.value = msg.count;
                        var el = document.getElementById('adminMsgCount');
                        if (el) {
                            el.textContent = msg.count;
                            el.style.display = msg.count > 0 ? '' : 'none';
                        }
                    }
                    if (msg.type === 'status' && msg.updates) {
                        for (var i = 0; i < msg.updates.length; i++) {
                            var u = msg.updates[i];
                            var list = u.type === 'lxc' ? $.userLxcContainers.value : $.userVms.value;
                            var idField = u.type === 'lxc' ? 'ct_id' : 'vm_id';
                            for (var j = 0; j < list.length; j++) {
                                if (list[j][idField] === u.vmid) {
                                    list[j].status = u.status;
                                    break;
                                }
                            }
                            if (u.isDetail && $.showVmDetail.value && $.detailVm.value) {
                                var dv = $.detailVm.value;
                                var dvIdField = 'vm_id';
                                if (u.vmid === dv[dvIdField]) {
                                    $.feedDetailCharts(u.status);
                                }
                            }
                        }
                    }
                    if (msg.type === 'backup-done' || msg.type === 'restore-done') {
                        if ($.activeSection.value === 'vms') {
                            $.refreshVms();
                        } else if ($.activeSection.value === 'lxc') {
                            $.loadUserLxcContainers();
                        }
                    }
                    if (msg.type === 'tick') {
                        if ($.user.value && $.activeSection.value === 'vms') {
                            $.refreshVms().then(function() { $.resubAll(); });
                        } else if ($.user.value && $.activeSection.value === 'lxc') {
                            $.loadUserLxcContainers().then(function() { $.resubAll(); });
                        }
                    }
                }, function() {
                    $.resubAll();
                });
                $.loadNetworkConfig();
                if ($.activeTab.value === 'network') {
                    $.loadForwardRules('all');
                }
                // 周期性 token 刷新：每10分钟检查一次，确保长时间挂机不会退出登录
                setInterval(function() {
                    var token = localStorage.getItem('token');
                    if (!token) return;
                    try {
                        var payload = JSON.parse(atob(token.split('.')[1]));
                        if (payload.exp * 1000 < Date.now() + 900000) {
                            ensureValidToken();
                        }
                    } catch(e) {}
                }, 600000);
            }
        });


        watch($.activeTab, function(newTab) {
            localStorage.setItem('admin_activeTab', newTab);
            if (newTab === 'messages') {
                $.loadUnreadCount();
            }
            if (newTab === 'network') {
                $.loadForwardRules('all');
            }
            if (newTab === 'pay') {
                $.loadPayConfig();
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
