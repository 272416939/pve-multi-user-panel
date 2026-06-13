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
    $.activeSection = ref(new URLSearchParams(window.location.search).get('section') || 'overview');
    $.navItems = ref([]);
    $.users = ref([]);
    $.openDropdownId = ref(null); // 当前打开的下拉菜单ID，格式 'vm-123' 或 'lxc-456'
    $.dropdownItems = ref([]); // 当前下拉菜单的 [{label, action, cls}]
    $.dropdownPos = ref({ top: 0, left: 0 });
    $.cnameDomain = ref('');

    $.walletBalance = ref('0.00');
    $.renewShow = ref(false);
    $.renewResource = ref(null);
    $.renewQuantity = ref(1);
    $.renewError = ref('');

    // ===== 详情弹窗状态 =====
    $.showVmDetail = ref(false);
    $.detailVm = ref({});
    $.detailVmCharts = [];
    $.detailVmTimer = null;
    $.detailVmChartData = null;

    // computed
    $.currentNavId = computed(function() { return $.activeSection.value === 'vm' ? 'vms' : 'lxc'; });

    // ===== 详情弹窗 computed =====
    $.detailVmConfigStr = computed(function() {
        var vm = $.detailVm.value;
        if (!vm || !vm.config) return '-';
        var str = (vm.config.sockets || 1) + '*' + (vm.config.cores || 1) + '核 ' + formatMemory(vm.config.memory);
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

    // ===== 工具函数注册到 $（从 shared.js 全局函数引用） =====
    $.formatMemory = formatMemory;
    $.formatBytes = formatBytes;
    $.formatDate = formatDate;
    $.formatUptime = formatUptime;
    $.trimContent = trimContent;
    $.getGeekAvatar = getGeekAvatar;
    $.formatDateTimeLocal = formatDateTimeLocal;

    // ===== 用户数据变化时同步 Header 头像/用户名 + 管理员链接 =====
    watch($.user, function(u) {
        if (!u) return;
        var avatarEl = document.getElementById('headerAvatar');
        var nameEl = document.getElementById('headerUsername');
        var adminLink = document.getElementById('dashboardAdminLink');
        if (avatarEl) {
            if (u.avatar) {
                avatarEl.src = u.avatar;
            } else {
                avatarEl.src = getGeekAvatar(u.username || '用户');
            }
        }
        if (nameEl) nameEl.textContent = u.username || '用户';
        // 管理员显示侧边栏"管理后台"链接
        if (adminLink) {
            adminLink.style.display = u.role === 'admin' ? '' : 'none';
        }
    }, { immediate: true });

    // 环形图偏移计算（周长 377 = 2 * PI * 60）
    var CIRCLE_CIRCUMFERENCE = 377;
    $.circleVmOffset = Vue.computed(function() {
        if (!$.userVms.value || $.userVms.value.length === 0) return CIRCLE_CIRCUMFERENCE;
        var running = $.userVms.value.filter(function(v) { return v.status && v.status.status === 'running'; }).length;
        return CIRCLE_CIRCUMFERENCE - (running / $.userVms.value.length) * CIRCLE_CIRCUMFERENCE;
    });
    $.circleCtOffset = Vue.computed(function() {
        if (!$.userLxcContainers.value || $.userLxcContainers.value.length === 0) return CIRCLE_CIRCUMFERENCE;
        var running = $.userLxcContainers.value.filter(function(c) { return c.status && c.status.status === 'running'; }).length;
        return CIRCLE_CIRCUMFERENCE - (running / $.userLxcContainers.value.length) * CIRCLE_CIRCUMFERENCE;
    });

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
        // Update sidebar active state
        document.querySelectorAll('.nav-item').forEach(function(el) {
            el.classList.toggle('active', el.getAttribute('data-section') === section);
        });
        // Close sidebar on mobile
        if (window.innerWidth <= 768) {
            document.getElementById('sidebar')?.classList.remove('open');
            var overlay = document.getElementById('sidebarOverlay');
            if (overlay) { overlay.style.display = 'none'; }
        }
    };

    // ===== 下拉菜单（Teleport到body，避免表格overflow裁剪） =====
    $.toggleDropdown = function(id, target, items) {
        if ($.openDropdownId.value === id) {
            $.openDropdownId.value = null;
            $.dropdownItems.value = [];
            return;
        }
        // 计算按钮位置，用于定位浮动菜单
        var rect = target.getBoundingClientRect();
        $.dropdownPos.value = {
            top: rect.bottom + window.scrollY + 4,
            left: rect.left + window.scrollX
        };
        $.openDropdownId.value = id;
        $.dropdownItems.value = items || [];
    };
    $.closeDropdown = function() {
        $.openDropdownId.value = null;
        $.dropdownItems.value = [];
    };
    $.execDropdownAction = function(fn) {
        fn();
        $.closeDropdown();
    };

    $.loadWalletBalance = async function() {
        try {
            var res = await api('/wallet/balance');
            $.walletBalance.value = res.balance || '0.00';
        } catch (e) {
            $.walletBalance.value = '0.00';
        }
    };

    $.submitRenew = async function() {
        $.renewError.value = '';
        var resource = $.renewResource.value;
        if (!resource) { $.renewError.value = '请选择续费资源'; return; }
        var qty = $.renewQuantity.value;
        if (!Number.isInteger(qty) || qty < 1) { $.renewError.value = '续费数量必须为正整数'; return; }
        var price = parseFloat(resource.renewal_price || '0');
        var totalPrice = (price * qty).toFixed(2);
        var bal = parseFloat($.walletBalance.value);
        if (bal < parseFloat(totalPrice)) {
            $.renewError.value = '余额不足，应付 ¥' + totalPrice + '，当前余额 ¥' + bal.toFixed(2) + '，请先充值';
            return;
        }
        try {
            var res = await api('/wallet/renew', {
                method: 'POST',
                body: {
                    type: resource.vm_id !== undefined ? 'vm' : 'lxc',
                    vmid: resource.vm_id,
                    ctid: resource.ct_id,
                    quantity: qty
                }
            });
            if (res.success) {
                $.renewShow.value = false;
                $.walletBalance.value = parseFloat(res.balance).toFixed(2);
                alert('续费成功！已从余额中扣除 ¥' + totalPrice + '，新到期时间：' + (res.new_expiration || '已更新'));
                $.loadData();
                $.loadLxcContainers();
            } else {
                $.renewError.value = res.error || '续费失败';
            }
        } catch (e) {
            $.renewError.value = '请求失败，请稍后重试';
        }
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
            var el = document.getElementById('msgCount');
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

    $.loadCnameDomain = async function() {
        try {
            var data = await api('/api/cname');
            $.cnameDomain.value = data.cname_domain || '';
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

    // ===== 详情弹窗函数 =====
    $.openVmDetail = function(vm) {
        var detailVm = Object.assign({}, vm);
        detailVm.ip = detailVm.ip || detailVm.dhcp_static_ip || '-';
        $.detailVm.value = detailVm;
        $.showVmDetail.value = true;
        document.body.style.overflow = 'hidden';
        setTimeout(function() {
            try { $.initDetailCharts(); } catch(e) { console.warn('Chart init error:', e); }
        }, 200);
    };

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
        var maxPoints = 15;

        var cpuEl = document.getElementById('detailCpuChart');
        var memEl = document.getElementById('detailMemChart');
        var netEl = document.getElementById('detailNetChart');
        var diskEl = document.getElementById('detailDiskChart');
        if(!cpuEl || !memEl || !netEl || !diskEl) return;

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
            var netInVal = typeof s.netin === 'number' ? +(s.netin / 1048576).toFixed(2) : 0;
            var netOutVal = typeof s.netout === 'number' ? +(s.netout / 1048576).toFixed(2) : 0;
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

    // ===== 生命周期 =====
    $.refreshInterval = null;

    $.initCore = function() {
        onMounted(async function() {
            var userData = await authGuard();
            if (userData) {
                $.user.value = userData;
                var adminLink = document.getElementById('dashboardAdminLink');
                if (adminLink) adminLink.style.display = userData.role === 'admin' ? '' : 'none';
                console.log('[dashboard] 用户角色:', userData.role, '管理员链接显示:', adminLink ? adminLink.style.display : '未找到元素');
                await $.loadNavItems();
                await $.loadData();
                await $.loadLxcContainers();
                await $.loadCnameDomain();
                $.loadUnreadCount();
                $.loadWalletBalance();
                initPushClient(function(msg) {
                    if (msg.type === 'unread') {
                        $.unreadCount.value = msg.count;
                        var el = document.getElementById('msgCount');
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
                                var dvIdField = dv._isLxc ? 'ct_id' : 'vm_id';
                                if (u.vmid === dv[dvIdField]) {
                                    $.feedDetailCharts(u.status);
                                }
                            }
                        }
                    }
                    if (msg.type === 'backup-done' || msg.type === 'restore-done') {
                        if ($.activeSection.value === 'vm') {
                            $.loadData();
                        } else if ($.activeSection.value === 'lxc') {
                            $.loadLxcContainers();
                        }
                    }
                    if (msg.type === 'tick') {
                        if ($.user.value && $.activeSection.value === 'vm') {
                            $.loadData().then(function() { $.resubAll(); });
                        }
                        if ($.user.value && $.activeSection.value === 'lxc') {
                            $.loadLxcContainers().then(function() { $.resubAll(); });
                        }
                    }
                }, function() {
                    $.resubAll();
                });

                // ===== 备份/恢复 WS 实时推送 =====
                // backup-done / restore-done 消息已在上方 WS handler 中处理

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
            localStorage.setItem('dashboard_activeTab', newTab);
            if (newTab === 'messages') {
                $.loadMessages();
                $.loadUnreadCount();
            }
        });
    };
})();
