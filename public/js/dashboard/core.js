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
    $.macGroups = ref([]);
    $.openDropdownId = ref(null); // 当前打开的下拉菜单ID，格式 'vm-123' 或 'lxc-456'
    $.dropdownItems = ref([]); // 当前下拉菜单的 [{label, action, cls}]
    $.dropdownPos = ref({ top: 0, left: 0 });
    $.cnameDomain = ref('');

    $.walletBalance = ref('0.00');
    $.renewShow = ref(false);
    $.renewResource = ref(null);
    $.renewQuantity = ref(1);
    $.renewFormPeriod = ref('month');
    $.renewError = ref('');

    $.vmPwdShow = ref(false);
    $.vmPwdResource = ref(null);
    $.vmPwdCiuser = ref('');
    $.vmPwdNewPassword = ref('');
    $.vmPwdError = ref('');

    // ===== 套餐订购状态 =====
    $.vmPackages = ref([]);
    $.lxcPackages = ref([]);
    $.activeTabOrder = ref('vm');
    $.orderForm = ref({ period: 'month', quantity: 1, mac_group_id: '' });
    $.orderPackage = ref({});
    $.orderType = ref('vm');
    $.orderLoading = ref(false);
    $.pkgSelectedPeriod = ref({});  // { packageId: 'month'/'quarter'/'year' }
    $.vmGroupedPackages = ref([]);  // [{ group_name, group_id, packages: [] }]
    $.lxcGroupedPackages = ref([]);

    $.orderTotal = computed(function() {
        var p = $.orderPackage.value;
        if (!p || !p.id) return '0.00';
        var monthly = parseFloat(p.monthly_price) || 0;
        var period = $.orderForm.value.period;
        var months = 1;
        var discount = 0;
        if (period === 'quarter') { months = 3; discount = Math.min(Math.max(parseInt(p.quarterly_discount) || 0, 0), 100); }
        else if (period === 'year') { months = 12; discount = Math.min(Math.max(parseInt(p.yearly_discount) || 0, 0), 100); }
        var baseAmount = monthly * months * (parseInt($.orderForm.value.quantity) || 1);
        return (baseAmount * (1 - discount / 100)).toFixed(2);
    });

    $.getPackageFinalPrice = function(pkg, period) {
        if (!pkg || !pkg.monthly_price) return '0.00';
        var monthly = parseFloat(pkg.monthly_price) || 0;
        var months = 1;
        var discount = 0;
        if (period === 'quarter') { months = 3; discount = Math.min(Math.max(parseInt(pkg.quarterly_discount) || 0, 0), 100); }
        else if (period === 'year') { months = 12; discount = Math.min(Math.max(parseInt(pkg.yearly_discount) || 0, 0), 100); }
        return (monthly * months * (1 - discount / 100)).toFixed(2);
    };

    $.selectPackagePeriod = function(pkgId, period) {
        $.pkgSelectedPeriod.value[pkgId] = period;
    };

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
        // 优先从 config 提取配置的磁盘大小（如 size=40G），避免 maxdisk 字节换算偏差
        var diskKeys = ['scsi0','virtio0','sata0','ide0','rootfs'];
        for (var i = 0; i < diskKeys.length; i++) {
            var dv = vm.config[diskKeys[i]];
            if (dv) {
                var m = dv.match(/size=(\d+)([KMGT]?)/i);
                if (m) {
                    var num = parseInt(m[1]);
                    var unit = (m[2] || 'G').toUpperCase();
                    if (unit === 'T') diskStr = (num * 1024) + ' GB';
                    else if (unit === 'M') diskStr = (num / 1024).toFixed(1) + ' GB';
                    else if (unit === 'K') diskStr = (num / 1024 / 1024).toFixed(2) + ' GB';
                    else diskStr = num + ' GB';
                    break;
                }
            }
        }
        // 兜底：用 status.maxdisk 换算
        if (!diskStr && vm.status && vm.status.maxdisk) {
            diskStr = $.formatBytes(vm.status.maxdisk, true);
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

    // ===== 工具函数注册到 $（从 shared.js 或 window 全局函数引用） =====
    $.formatMemory = formatMemory;
    $.formatBytes = formatBytes;
    $.formatDiskSize = formatDiskSize;
    $.formatDate = formatDate;
    $.formatUptime = formatUptime;
    $.trimContent = trimContent;
    $.getGeekAvatar = getGeekAvatar;
    $.formatDateTimeLocal = formatDateTimeLocal;
    $.copyText = function(text) { if (window.copyText) window.copyText(text); };
    $.parseMarkdown = function(text) {
        if (!text) return '';
        try {
            return DOMPurify.sanitize(marked.parse(text));
        } catch (e) {
            return text;
        }
    };

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
            var old = bootstrap.Modal.getInstance(el);
            if (old) old.dispose();
            // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
            window.applyModalZIndex(el);
            new bootstrap.Modal(el).show();
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
            // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
            window.applyModalZIndex(el);
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
            // 获取动态 z-index（customConfirmModal 不走 bsModalShow，需单独管理）
            var zIndex = window.ModalZIndexManager.acquire();
            el._modalZIndex = zIndex;
            el.style.zIndex = zIndex;
            // hidden 时释放 z-index（confirmOk/confirmCancel 均通过 modal.hide() 关闭）
            el.addEventListener('hidden.bs.modal', function onHidden() {
                el.removeEventListener('hidden.bs.modal', onHidden);
                if (el._modalZIndex != null) {
                    window.ModalZIndexManager.release(el._modalZIndex);
                    el._modalZIndex = null;
                    el.style.zIndex = '';
                }
            }, { once: true });
            var modal = bootstrap.Modal.getOrCreateInstance(el);
            modal.show();
            // shown 后设置 backdrop z-index
            el.addEventListener('shown.bs.modal', function onShown() {
                el.removeEventListener('shown.bs.modal', onShown);
                var backdrop = document.querySelector('.modal-backdrop');
                if (backdrop) {
                    backdrop.style.zIndex = window.ModalZIndexManager.acquireBackdrop(zIndex);
                }
            }, { once: true });
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

    // 内联下拉菜单（与 admin 端一致，避免 Teleport 模板缺失问题）
    $.toggleAdminDropdown = function(target) {
        var dd = target.parentElement;
        var isOpen = dd.classList.contains('open');
        // 关闭所有已打开的下拉，淡出后移回原位
        document.querySelectorAll('.dropdown-table.open').forEach(function(el) {
            el.classList.remove('open');
            var menu = el._movedMenu;
            if (menu) {
                window.closeFixedDropdownAnimated(menu, function() {
                    menu.style.display = 'none';
                    if (menu._originalParent) {
                        menu._originalParent.appendChild(menu);
                        menu._originalParent = null;
                    }
                    el._movedMenu = null;
                });
            }
        });
        if (!isOpen) {
            dd.classList.add('open');
            var menu = dd.querySelector('.dropdown-menu-table');
            if (menu) {
                menu._originalParent = dd;
                dd._movedMenu = menu;
                document.body.appendChild(menu);
                menu.style.display = 'block';
                if (window.ModalZIndexManager) {
                    var z0 = window.ModalZIndexManager.acquire();
                    menu._dropdownZIndex = z0;
                    menu.style.zIndex = z0;
                }
                if (window.positionFixedDropdown) {
                    void menu.offsetWidth;
                    window.positionFixedDropdown(target, menu);
                }
            }
        }
    };

    $.loadWalletBalance = async function() {
        try {
            var res = await api('/wallet/balance');
            $.walletBalance.value = res.balance || '0.00';
        } catch (e) {
            $.walletBalance.value = '0.00';
        }
    };

    $.renewPeriodLabel = function(period) {
        if (period === 'year') return '年';
        if (period === 'quarter') return '季';
        return '月';
    };

    $.calcRenewTotal = function() {
        var resource = $.renewResource.value;
        if (!resource) return 0;
        var storedPeriod = resource.renewal_period || 'month';
        var storedPrice = parseFloat(resource.renewal_price || '0');
        var period = $.renewFormPeriod.value;
        var qty = $.renewQuantity.value || 1;

        if (period === storedPeriod) {
            return storedPrice * qty;
        }
        var monthlyPrice = parseFloat(resource.monthly_price || '0');
        if (monthlyPrice > 0) {
            var monthsMap = { month: 1, quarter: 3, year: 12 };
            var newMonths = monthsMap[period] || 1;
            var discount = 0;
            if (period === 'quarter') {
                discount = Math.min(Math.max(parseInt(resource.quarterly_discount) || 0, 0), 100);
            } else if (period === 'year') {
                discount = Math.min(Math.max(parseInt(resource.yearly_discount) || 0, 0), 100);
            }
            var baseAmount = monthlyPrice * newMonths * qty;
            return parseFloat((baseAmount * (1 - discount / 100)).toFixed(2));
        }
        var monthsMap2 = { month: 1, quarter: 3, year: 12 };
        var storedMonths = monthsMap2[storedPeriod] || 1;
        var monthlyBase = storedPrice / storedMonths;
        var newMonths2 = monthsMap2[period] || 1;
        return monthlyBase * newMonths2 * qty;
    };

    $.openRenewModal = function(resource) {
        $.renewResource.value = resource;
        $.renewFormPeriod.value = resource.renewal_period || 'month';
        $.renewQuantity.value = 1;
        $.renewError.value = '';
        $.renewShow.value = true;
    };

    $.openVmPasswordReset = async function(vm) {
        $.vmPwdResource.value = vm;
        $.vmPwdNewPassword.value = '';
        $.vmPwdError.value = '';
        $.vmPwdCiuser.value = vm.config?.ciuser || false;
        if ($.vmPwdCiuser.value === false) {
            $.vmPwdShow.value = true;
            return;
        }
        if (vm.status && vm.status.status !== 'stopped') {
            $.vmPwdError.value = '请先关机后再重置密码';
        }
        $.vmPwdShow.value = true;
    };

    $.submitRenew = async function() {
        $.renewError.value = '';
        var resource = $.renewResource.value;
        if (!resource) { $.renewError.value = '请选择续费资源'; return; }
        var qty = $.renewQuantity.value;
        if (!Number.isInteger(qty) || qty < 1) { $.renewError.value = '续费数量必须为正整数'; return; }
        var totalPrice = $.calcRenewTotal().toFixed(2);
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
                    quantity: qty,
                    period: $.renewFormPeriod.value
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

    $.submitVmPasswordReset = async function() {
        $.vmPwdError.value = '';
        var vm = $.vmPwdResource.value;
        if (!vm) { $.vmPwdError.value = '请选择虚拟机'; return; }
        var pwd = $.vmPwdNewPassword.value;
        if (!pwd || pwd.length < 6) { alert('密码长度至少 6 位'); return; }
        try {
            await api('/vm/' + vm.vm_id + '/reset-password', { method: 'POST', body: JSON.stringify({ password: pwd }) });
            $.vmPwdShow.value = false;
            alert('密码重置成功');
        } catch (e) {
            $.vmPwdError.value = e.message;
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
            var fresh = await api('/user/vms');
            // _provisioning 为 true 表示该 VM 仍在 PVE 开通任务中（后端已剔除 pve_upid 敏感字段）
            var freshIds = {};
            fresh.forEach(function(v) {
                freshIds[v.id] = true;
                if (v._provisioning) {
                    if (!v.status) v.status = {};
                    v.status.status = 'provisioning';
                }
            });
            // 保留开通中占位记录，但去除 fresh 中已存在的（避免 DB 记录与占位记录重复）
            var provisioning = $.userVms.value.filter(function(v) { return v._provisioning && !freshIds[v.id]; });
            $.userVms.value = provisioning.concat(fresh);
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

    // CNAME 多域名格式化：将逗号分隔的域名列表格式化为设备级 CNAME 数组
    // 输入: "电信pve.example.com,联通pve.example.com", deviceId=100
    // 输出: ["电信100.pve.example.com", "联通100.pve.example.com"]
    $.formatCnameList = function(cnameDomain, deviceId) {
        if (!cnameDomain) return [];
        var domains = cnameDomain.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        return domains.map(function(domain) {
            // 以第一个 . 分隔标签和域名（标签可以是中英文、数字等任何字符）
            var dotIdx = domain.indexOf('.');
            if (dotIdx > 0) {
                return { label: domain.substring(0, dotIdx), domain: deviceId + domain.substring(dotIdx) };
            }
            return { label: '', domain: deviceId + '.' + domain };
        });
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
        // 注意：不得删除所有 .modal-backdrop，否则会破坏其他仍开着弹窗的遮罩层
        if (document.activeElement && document.activeElement !== document.body) {
            document.activeElement.blur();
        }
        var el = document.getElementById(id);
        if (!el) return;
        var old = bootstrap.Modal.getInstance(el);
        if (old) old.dispose();
        // 获取动态 z-index
        var zIndex = window.ModalZIndexManager.acquire();
        el._modalZIndex = zIndex;
        el.style.zIndex = zIndex;
        // nextTick 确保 Vue 重新渲染稳定后再初始化 Bootstrap Modal
        Vue.nextTick(function() {
            var modal = new bootstrap.Modal(el, { focus: false });
            modal.show();
            // shown 后设置 backdrop z-index
            // 多弹窗叠加时，querySelectorAll 取最后一个（当前弹窗的 backdrop）
            el.addEventListener('shown.bs.modal', function onShown() {
                el.removeEventListener('shown.bs.modal', onShown);
                var backdrops = document.querySelectorAll('.modal-backdrop');
                var backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
                if (backdrop) {
                    backdrop.style.zIndex = window.ModalZIndexManager.acquireBackdrop(zIndex);
                }
            });
        });
    };

    $.bsModalHide = function(id) {
        var el = document.getElementById(id);
        if (!el) return;
        var modal = bootstrap.Modal.getInstance(el);
        var zIndex = el._modalZIndex;
        if (modal) {
            el.addEventListener('hidden.bs.modal', function cleanup() {
                el.removeEventListener('hidden.bs.modal', cleanup);
                if (zIndex != null) {
                    window.ModalZIndexManager.release(zIndex);
                    el._modalZIndex = null;
                    el.style.zIndex = '';
                }
                // 不删除所有 backdrop；Bootstrap 会自动清理当前弹窗的 backdrop
                if (window.ModalZIndexManager.getActiveCount() === 0) {
                    document.body.classList.remove('modal-open');
                    document.body.style.removeProperty('padding-right');
                    document.body.style.removeProperty('overflow');
                }
            }, { once: true });
            modal.hide();
        } else {
            if (zIndex != null) {
                window.ModalZIndexManager.release(zIndex);
                el._modalZIndex = null;
                el.style.zIndex = '';
            }
            if (window.ModalZIndexManager.getActiveCount() === 0) {
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
            }
        }
    };

    // ===== 非 Bootstrap 弹窗 z-index 管理工具 =====
    // 供 v-if 控制的自定义弹窗使用（如 renewShow/vmPwdShow）
    $.applyModalZIndex = function(el) {
        if (!el) return null;
        var zIndex = window.ModalZIndexManager.acquire();
        el._modalZIndex = zIndex;
        el.style.zIndex = zIndex;
        return zIndex;
    };
    $.releaseModalZIndex = function(el) {
        if (!el) return;
        var z = el._modalZIndex;
        if (z != null) {
            window.ModalZIndexManager.release(z);
            el._modalZIndex = null;
            el.style.zIndex = '';
        }
    };

    // ===== 非 Bootstrap 弹窗 z-index 监听（v-if 控制的弹窗）=====
    var renewModalZIndex = null;
    watch($.renewShow, function(val) {
        if (val) {
            Vue.nextTick(function() {
                var el = document.getElementById('renewModalWrap');
                if (el) renewModalZIndex = $.applyModalZIndex(el);
            });
        } else if (renewModalZIndex != null) {
            window.ModalZIndexManager.release(renewModalZIndex);
            renewModalZIndex = null;
        }
    });
    var vmPwdModalZIndex = null;
    watch($.vmPwdShow, function(val) {
        if (val) {
            Vue.nextTick(function() {
                var el = document.getElementById('vmPwdModalWrap');
                if (el) vmPwdModalZIndex = $.applyModalZIndex(el);
            });
        } else if (vmPwdModalZIndex != null) {
            window.ModalZIndexManager.release(vmPwdModalZIndex);
            vmPwdModalZIndex = null;
        }
    });

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

    // ===== 套餐订购函数 =====
    $.loadPackages = async function() {
        try {
            var vmRes = await api('/package-groups?type=vm');
            var lxcRes = await api('/package-groups?type=lxc');
            $.vmGroupedPackages.value = $.buildGroupedPackages(vmRes.groups, vmRes.packages);
            $.lxcGroupedPackages.value = $.buildGroupedPackages(lxcRes.groups, lxcRes.packages);
            // 兼容旧代码：保留 vmPackages/lxcPackages 扁平数组
            $.vmPackages.value = vmRes.packages || [];
            $.lxcPackages.value = lxcRes.packages || [];
        } catch(e) { console.error('加载套餐失败', e); }
    };

    // 构建分组套餐数据：无分组的归入"默认"分组，分组按 sort_order DESC 排序，组内套餐按 sort_order DESC 排序
    $.buildGroupedPackages = function(groups, packages) {
        var grouped = [];
        var defaultGroup = { group_id: null, group_name: '默认', packages: [] };
        var groupMap = {};
        // groups 已由后端按 sort_order DESC 返回
        for (var i = 0; i < groups.length; i++) {
            var g = { group_id: groups[i].id, group_name: groups[i].name, packages: [] };
            groupMap[groups[i].id] = g;
            grouped.push(g);
        }
        // packages 已由后端按 sort_order DESC 返回
        for (var j = 0; j < packages.length; j++) {
            var p = packages[j];
            if (p.group_id && groupMap[p.group_id]) {
                groupMap[p.group_id].packages.push(p);
            } else {
                defaultGroup.packages.push(p);
            }
        }
        if (defaultGroup.packages.length > 0) {
            grouped.push(defaultGroup);
        }
        return grouped;
    };

    $.openOrderModal = function(pkg, type, selectedPeriod) {
        $.orderPackage.value = pkg;
        $.orderType.value = type;
        $.orderForm.value = { period: selectedPeriod || 'month', quantity: 1 };
        // 刷新余额显示
        $.loadWalletBalance();
        // 用 nextTick 确保 Vue 完成 DOM 更新后再显示 Modal
        Vue.nextTick(function() { $.bsModalShow('orderModal'); });
    };
    
    $.confirmOrder = async function() {
        var type = $.orderType.value;
        var pkg = $.orderPackage.value;
        var orderForm = { period: $.orderForm.value.period, period_count: parseInt($.orderForm.value.quantity) || 1 };

        // 立即创建占位记录，显示"开通中"状态
        var placeholderId = 'provisioning_' + Date.now();
        var placeholder = {
            id: placeholderId,
            name: '开通中...',
            status: { status: 'provisioning' },
            config: null,
            _provisioning: true
        };
        if (type === 'vm') {
            placeholder.vm_id = '-';
            $.userVms.value.unshift(placeholder);
        } else {
            placeholder.ct_id = '-';
            $.userLxcContainers.value.unshift(placeholder);
        }
        // 持久化开通中状态到 localStorage，支持页面刷新恢复
        try {
            var taskKey = 'provisioning_' + type;
            var taskData = { id: placeholderId, type: type, startTime: Date.now(), pkgName: pkg.name || '' };
            localStorage.setItem(taskKey, JSON.stringify(taskData));
        } catch (e2) {}

        // 关闭弹窗，用户无需等待
        $.bsModalHide('orderModal');
        $.orderLoading.value = false;

        // 切换到对应列表页，让用户看到开通中状态
        $.switchSection(type === 'vm' ? 'vm' : 'lxc');

        // 异步调用订购 API
        var endpoint = type === 'vm' ? '/vm-packages/' + pkg.id + '/order' : '/lxc-packages/' + pkg.id + '/order';
        try {
            var result = await api(endpoint, { method: 'POST', body: JSON.stringify(orderForm) });
            // 后端同步开通完成时 _provisioning 为 false；若为 true（异步场景），改用 resourceId 轮询 PVE 任务状态
            if (result && result._provisioning && result.id) {
                try {
                    localStorage.setItem('provisioning_' + type, JSON.stringify({ id: placeholderId, type: type, startTime: Date.now(), resourceId: result.id }));
                } catch (e2) {}
                // 移除占位记录，加载 DB 预创建记录（_provisioning 为 true 会被 loadData 标记为开通中），再启动 PVE 状态轮询
                if (type === 'vm') {
                    $.userVms.value = $.userVms.value.filter(function(v) { return v.id !== placeholderId; });
                    await $.loadData();
                } else {
                    $.userLxcContainers.value = $.userLxcContainers.value.filter(function(c) { return c.id !== placeholderId; });
                    await $.loadLxcContainers();
                }
                $.__startProvisioningPoll(type, result.id);
            } else {
                // API 成功，移除占位记录并重新加载列表
                if (type === 'vm') {
                    $.userVms.value = $.userVms.value.filter(function(v) { return v.id !== placeholderId; });
                    await $.loadData();
                } else {
                    $.userLxcContainers.value = $.userLxcContainers.value.filter(function(c) { return c.id !== placeholderId; });
                    await $.loadLxcContainers();
                }
                // 清除开通中状态
                try { localStorage.removeItem('provisioning_' + type); } catch (e2) {}
                // 刷新余额
                $.loadWalletBalance();
            }
        } catch(e) {
            // API 失败，移除占位记录并提示
            if (type === 'vm') {
                $.userVms.value = $.userVms.value.filter(function(v) { return v.id !== placeholderId; });
            } else {
                $.userLxcContainers.value = $.userLxcContainers.value.filter(function(c) { return c.id !== placeholderId; });
            }
            // 清除开通中状态
            try { localStorage.removeItem('provisioning_' + type); } catch (e2) {}
            alert('开通失败：' + (e.message || '未知错误'));
        }
    };
    
    $.restoreProvisioningState = function() {
        // 检测 DB 中 _provisioning 为 true 的记录（PVE 开通任务进行中），通过 resourceId 轮询 PVE 真实任务状态
        var provisioningVm = $.userVms.value.find(function(v) { return v._provisioning; });
        if (provisioningVm) {
            $.__startProvisioningPoll('vm', provisioningVm.id);
        }
        var provisioningLxc = $.userLxcContainers.value.find(function(c) { return c._provisioning; });
        if (provisioningLxc) {
            $.__startProvisioningPoll('lxc', provisioningLxc.id);
        }

        // 兼容旧的 localStorage 占位记录方案（无 resourceId 时作为 fallback）
        var types = ['vm', 'lxc'];
        for (var i = 0; i < types.length; i++) {
            var t = types[i];
            try {
                var raw = localStorage.getItem('provisioning_' + t);
                if (!raw) continue;
                var data = JSON.parse(raw);
                // SEC-07: 字段类型断言，防止 localStorage 被污染后注入异常值
                if (!data || typeof data.id !== 'string' || typeof data.startTime !== 'number') {
                    localStorage.removeItem('provisioning_' + t);
                    continue;
                }
                // 若已有 _provisioning 轮询在跑，说明新方案已接管，清除旧 localStorage
                var hasProvisioningPoll = (t === 'vm' && provisioningVm) || (t === 'lxc' && provisioningLxc);
                if (hasProvisioningPoll) {
                    localStorage.removeItem('provisioning_' + t);
                    continue;
                }
                // 超过 10 分钟视为超时，清除不恢复
                if (Date.now() - (data.startTime || 0) > 10 * 60 * 1000) {
                    localStorage.removeItem('provisioning_' + t);
                    continue;
                }
                var placeholder = {
                    id: data.id,
                    name: '开通中...',
                    status: { status: 'provisioning' },
                    config: null,
                    _provisioning: true
                };
                if (t === 'vm') {
                    placeholder.vm_id = '-';
                    var existVm = $.userVms.value.find(function(v) { return v.id === data.id; });
                    if (!existVm) $.userVms.value.unshift(placeholder);
                } else {
                    placeholder.ct_id = '-';
                    var existCt = $.userLxcContainers.value.find(function(c) { return c.id === data.id; });
                    if (!existCt) $.userLxcContainers.value.unshift(placeholder);
                }
                // 启动旧轮询：定期检查 localStorage 是否还在，并刷新数据
                $.__startProvisioningPollLegacy(t, data.id);
            } catch (e) {}
        }
    };

    // 轮询：用 resourceId 调用后端 /provision-status 查询 PVE 真实任务状态（不暴露 pve_upid 给前端）
    $.__startProvisioningPoll = function(type, resourceId) {
        var pollKey = '__provPoll_' + type;
        if ($[pollKey]) clearInterval($[pollKey]);
        $[pollKey] = setInterval(async function() {
            try {
                var result = await api('/provision-status?type=' + type + '&resourceId=' + resourceId);
                if (result && result.isCompleted) {
                    clearInterval($[pollKey]);
                    $[pollKey] = null;
                    // 重新加载列表（后端已清空 pve_upid，_provisioning 变为 false）
                    if (type === 'vm') {
                        await $.loadData();
                    } else {
                        await $.loadLxcContainers();
                    }
                    try { localStorage.removeItem('provisioning_' + type); } catch (e2) {}
                    $.loadWalletBalance();
                }
            } catch (e) {}
        }, 3000);
    };

    // 旧轮询（兼容）：基于 localStorage 与资源数量猜测开通是否完成
    $.__startProvisioningPollLegacy = function(type, placeholderId) {
        var pollKey = '__provPollLegacy_' + type;
        if ($[pollKey]) clearInterval($[pollKey]);
        // 记录初始真实资源数量（排除占位记录），用于检测新资源出现
        var getRealCount = function() {
            if (type === 'vm') {
                return $.userVms.value.filter(function(v) { return !v._provisioning; }).length;
            }
            return $.userLxcContainers.value.filter(function(c) { return !c._provisioning; }).length;
        };
        var initialCount = getRealCount();
        $[pollKey] = setInterval(async function() {
            try {
                // 情况1：localStorage 已被清除（其他标签页或原 await 完成）→ 移除占位记录
                var raw = localStorage.getItem('provisioning_' + type);
                if (!raw) {
                    clearInterval($[pollKey]);
                    $[pollKey] = null;
                    if (type === 'vm') {
                        $.userVms.value = $.userVms.value.filter(function(v) { return v.id !== placeholderId; });
                        await $.loadData();
                    } else {
                        $.userLxcContainers.value = $.userLxcContainers.value.filter(function(c) { return c.id !== placeholderId; });
                        await $.loadLxcContainers();
                    }
                    $.loadWalletBalance();
                    return;
                }
                // 情况2：刷新数据检测新资源是否已出现
                if (type === 'vm') {
                    await $.loadData();
                } else {
                    await $.loadLxcContainers();
                }
                var currentCount = getRealCount();
                if (currentCount > initialCount) {
                    // 新资源已出现，开通完成，清除占位记录和 localStorage
                    clearInterval($[pollKey]);
                    $[pollKey] = null;
                    if (type === 'vm') {
                        $.userVms.value = $.userVms.value.filter(function(v) { return v.id !== placeholderId; });
                    } else {
                        $.userLxcContainers.value = $.userLxcContainers.value.filter(function(c) { return c.id !== placeholderId; });
                    }
                    try { localStorage.removeItem('provisioning_' + type); } catch (e2) {}
                    $.loadWalletBalance();
                }
            } catch (e) {}
        }, 3000);
    };

    $.switchSubOrder = function(tab) {
        $.switchSection('order');
        $.activeTabOrder.value = tab;
        document.querySelectorAll('#submenu-order .nav-item').forEach(function(item) { item.classList.remove('active'); });
        var target = document.querySelector('[data-subsection="order-' + tab + '"]');
        if (target) target.classList.add('active');
        var el = document.getElementById('submenu-order');
        if (el) el.classList.add('open');
        var parent = el ? el.previousElementSibling : null;
        if (parent) parent.classList.add('expanded');
    };
    
    $.toggleSubmenu = function(id) {
        var el = document.getElementById('submenu-' + id);
        if (el) el.classList.toggle('open');
        var trigger = el ? el.previousElementSibling : null;
        if (trigger) trigger.classList.toggle('expanded');
    };

    // 扩展 switchSection 以支持 order
    var _origSwitchSection = $.switchSection;
    $.switchSection = function(section) {
        _origSwitchSection(section);
        // 切换 section 时清理打开 modal 的残留 backdrop（Vue 移除 DOM 后 backdrop 会孤悬）
        document.querySelectorAll('.modal-backdrop').forEach(function(b) { b.remove(); });
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('padding-right');
        document.querySelectorAll('.modal.show').forEach(function(m) {
            var inst = bootstrap.Modal.getInstance(m);
            if (inst) inst.hide();
        });
        if (section === 'order') {
            $.loadPackages();
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
                await $.loadNavItems();
                await $.loadData();
                await $.loadLxcContainers();
                // 恢复开通中状态（页面刷新后从 localStorage 恢复占位记录）
                $.restoreProvisioningState();
                await $.loadCnameDomain();
                if ($.activeSection.value === 'order') {
                    await $.loadPackages();
                }
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
                                var dvIdField = 'vm_id';
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
