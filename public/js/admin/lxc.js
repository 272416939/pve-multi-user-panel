(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var watch = Vue.watch;

    // ==================== 状态 ====================
    $.lxcContainers = ref([]);
    $.lxcTemplates = ref([]);
    $.lxcStorageList = ref([]);
    $.userLxcContainers = ref([]);
    $.lxcLoading = ref(false);
    $.lxcForm = ref({ ostemplate: '', hostname: '', password: '', confirmPassword: '', storage: '', cores: 1, memory: 512, swap: 512, disk: 8, features: 'nesting=1', net0Bridge: 'vmbr0', net0Ip: '', net0Mac: '', net0Ip6: '', unprivileged: true, start: true });
    $.lxcAssignForm = ref({ ct_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', monthly_price: '', quarterly_discount: '', yearly_discount: '', mac_group_id: '', pve_node_id: '' });
    $.lxcPasswordForm = ref({ password: '', confirmPassword: '' });
    $.adminLxcPwdShowPwd = ref(false);
    $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
    $.lxcIpError = Vue.ref('');
    $.lxcIpLoading = Vue.ref(false);
    $.selectedLxc = ref(null);
    $.lxcConfirmState = ref({ ctId: null, action: null });
    $.lxcOpTimestamps = ref(new Map());
    $.editLxcForm = ref({ id: null, ct_id: null, name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', user_id: null, mac_group_id: '', status: null });
    $.destroyLxcConfirmText = ref('');
    // LXC 特性多选下拉（直开容器表单）
    $.lxcFeatureOpen = ref(false);
    $.lxcFeaturesSet = ref(new Set());
    // 初始勾选同步：直开表单 features 默认 nesting=1，UI 勾选集合需一致（否则下拉无勾选显示）
    $.syncLxcFeatureSet($.lxcFeaturesSet, $.lxcForm, 'features');
    $.lxcFeatureText = computed(function() {
        return [...$.lxcFeaturesSet.value].map(function(k) { return k + '=1'; }).join(',');
    });
    $.toggleLxcFeatureDropdown = function() {
        $.lxcFeatureOpen.value = !$.lxcFeatureOpen.value;
    };
    // 直开表单专用（1 参）：复用 admin.js 共享 toggleLxcFeature（勿同名覆盖，否则自递归栈溢出）
    $.toggleDirectLxcFeature = function(opt) {
        $.toggleLxcFeature($.lxcFeaturesSet, $.lxcForm, 'features', opt);
    };
    // 点击外部关闭
    document.addEventListener('click', function(e) {
        if ($.lxcFeatureOpen.value && !(e.target && e.target.closest && e.target.closest('.lxc-feature-dropdown'))) {
            $.lxcFeatureOpen.value = false;
        }
    });
    $.availableLxc = ref([]);
    $.assignedLxc = ref([]);
    // 多节点：节点选择（严格分步选择）——直开表单与分配池各自联动
    $.lxcNodeOptions = ref([]);
    $.lxcCreateNodeId = ref('');
    $.lxcAssignNodeId = ref('');
    // 直开表单网桥下拉（按所选节点动态加载 PVE 实际网桥，替代硬编码 vmbr0/vmbr1）
    $.lxcBridges = ref([]);

    // LXC 快照
    $.lxcSnapshotVmId = ref(null);
    $.lxcSnapshotVmName = ref('');
    $.lxcSnapshotVmRunning = ref(false);
    $.lxcSnapshots = ref([]);
    $.lxcSnapshotLoading = ref(false);
    $.lxcSnapshotCreating = ref(false);
    $.lxcSnapshotDeleting = ref(false);
    $.lxcSnapshotSelected = ref(new Set());
    $.lxcSnapshotForm = ref({ name: '', description: '' });
    $.lxcSnapshotLimits = ref({ current: 0, max: 5, today_creates: 0, max_creates: 20, today_rollbacks: 0, max_rollbacks: 10 });

    // LXC 备份
    $.lxcBackupVmId = ref(null);
    $.lxcBackupVmName = ref('');
    $.lxcBackups = ref([]);
    $.lxcBackupCreating = ref(false);
    $.lxcBackupDeleting = ref(false);
    $.lxcBackupSelected = ref(new Set());
    $.lxcBackupForm = ref({ storage: 'local', notes: '' });

    // ==================== computed ====================
    // 当前所选节点名（直开/分配区标题旁展示）
    $.lxcCreateNodeName = computed(function() {
        var n = $.lxcNodeOptions.value.find(function(x) { return String(x.id) === String($.lxcCreateNodeId.value); });
        return n ? n.name : '';
    });
    $.lxcAssignNodeName = computed(function() {
        var n = $.lxcNodeOptions.value.find(function(x) { return String(x.id) === String($.lxcAssignNodeId.value); });
        return n ? n.name : '';
    });

    $.confirmLxcActionText = computed(function() {
        var msgs = {
            shutdown: window.__i18n.t('dash.lxc.shutdownHint'),
            reboot: window.__i18n.t('dash.lxc.ctRebootHint'),
            stop: window.__i18n.t('dash.lxc.stopHint')
        };
        return msgs[$.lxcConfirmState.value.action] || '';
    });

    $.isAllLxcSnapshotsSelected = computed(function() {
        return $.lxcSnapshots.value.length > 0 && $.lxcSnapshots.value.every(function(s) { return $.lxcSnapshotSelected.value.has(s.name); });
    });

    $.isAnyLxcSnapshotSelected = computed(function() {
        return $.lxcSnapshotSelected.value.size > 0;
    });

    $.isAllLxcBackupsSelected = computed(function() {
        return $.lxcBackups.value.length > 0 && $.lxcBackups.value.filter(function(b) { return b.status !== 'running' && b.status !== 'pending'; }).every(function(b) { return $.lxcBackupSelected.value.has(b.id); });
    });

    $.isAnyLxcBackupSelected = computed(function() {
        return $.lxcBackupSelected.value.size > 0;
    });

    // ==================== 函数 ====================
    // 多节点：节点选项加载（/admin/pve/nodes 同源）；严格分步：不预选，未选择时不加载任何候选
    $.loadLxcNodeOptions = async function() {
        try {
            var res = await api('/admin/pve/nodes');
            var nodes = (res && res.nodes) || [];
            $.lxcNodeOptions.value = nodes.filter(function(n) { return n.enabled !== 0; });
        } catch (e) {
            console.error('加载 PVE 节点列表失败', e);
        }
    };

    // 切节点（直开表单）：重载该节点模板/存储，清空已选模板与存储；清空选择则清空候选
    watch($.lxcCreateNodeId, function(nv, ov) {
        if (nv === ov) return;
        $.lxcForm.value.ostemplate = '';
        $.lxcForm.value.storage = '';
        if (!nv) {
            $.lxcTemplates.value = [];
            $.lxcStorageList.value = [];
            $.lxcBridges.value = [];
            return;
        }
        $.loadLxcTemplates();
        $.loadLxcBridges(nv);
    });

    // 切节点（分配池）：重置已选容器、重载该节点池 + 配对爱快 MAC 分组；清空选择则清空全部候选
    watch($.lxcAssignNodeId, function(nv, ov) {
        if (nv === ov) return;
        $.lxcAssignForm.value.pve_node_id = nv || '';
        $.lxcAssignForm.value.ct_id = '';
        if (!nv) {
            $.availableLxc.value = [];
            $.assignedLxc.value = [];
            $.lxcContainers.value = [];
            $.macGroups.value = [];
            return;
        }
        $.loadLxcContainers();
        $.loadMacGroups(nv);
    });

    // 加载所选 PVE 节点的网桥列表（type=bridge）；无 vmbr0 时回退列表首项
    $.loadLxcBridges = async function(nodeId) {
        try {
            if (!nodeId) { $.lxcBridges.value = []; return; }
            var list = await api('/admin/pve/bridges?node_id=' + encodeURIComponent(nodeId));
            $.lxcBridges.value = Array.isArray(list) ? list : [];
            if ($.lxcBridges.value.length && $.lxcBridges.value.indexOf($.lxcForm.value.net0Bridge) === -1) {
                $.lxcForm.value.net0Bridge = $.lxcBridges.value.indexOf('vmbr0') !== -1 ? 'vmbr0' : $.lxcBridges.value[0];
            }
        } catch (e) {
            console.error('加载 PVE 网桥失败', e);
            $.lxcBridges.value = [];
        }
    };

    $.loadLxcTemplates = async function() {
        try {
            // 多节点：按直开表单所选节点拉取模板/存储；未选节点不请求，直接清空
            var nodeId = ($.lxcCreateNodeId && $.lxcCreateNodeId.value) || '';
            if (!nodeId) {
                $.lxcTemplates.value = [];
                $.lxcStorageList.value = [];
                return;
            }
            var qs = '?node_id=' + encodeURIComponent(nodeId);
            $.lxcTemplates.value = await api('/lxc/templates' + qs);
            $.lxcStorageList.value = await api('/lxc/storages' + qs);
        } catch (e) {
            console.error('加载 LXC 模板/存储失败', e);
            $.lxcTemplates.value = [];
            $.lxcStorageList.value = [];
        }
    };

    $.loadLxcContainers = async function() {
        try {
            // 多节点：严格分步选择——按分配区所选节点拉取池；未选节点不请求，直接清空
            var nodeId = ($.lxcAssignNodeId && $.lxcAssignNodeId.value) || '';
            if (!nodeId) {
                $.availableLxc.value = [];
                $.assignedLxc.value = [];
                $.lxcContainers.value = [];
                return;
            }
            var data = await api('/pve/lxc?node_id=' + encodeURIComponent(nodeId));
            $.availableLxc.value = data.available || [];
            $.assignedLxc.value = data.assigned || [];
            $.lxcContainers.value = data.available || [];
        } catch (e) {
            console.error('加载 LXC 容器失败', e);
            $.availableLxc.value = [];
            $.assignedLxc.value = [];
            $.lxcContainers.value = [];
        }
    };

    $.loadUserLxcContainers = async function() {
        try {
            $.userLxcContainers.value = await api('/user/lxc');
        } catch (e) {
            console.error('加载用户 LXC 容器失败', e);
        }
    };

    $.createLxc = async function() {
        var f = $.lxcForm.value;
        if (!f.ostemplate) return alert(window.__i18n.t('admin.pkg.pickTpl'));
        if (!f.hostname) return alert(window.__i18n.t('admin.lxc.hostnameRequired'));
        if (!f.password) return alert(window.__i18n.t('login.passwordRequired'));
        if (f.password !== f.confirmPassword) return alert(window.__i18n.t('register.passwordMismatch'));
        var net0 = 'name=eth0,bridge=' + (f.net0Bridge || 'vmbr0');
        if (f.net0Ip) net0 += ',ip=' + f.net0Ip;
        if (f.net0Mac) net0 += ',hwaddr=' + f.net0Mac;
        if (f.net0Ip6) {
            net0 += ',ip6=' + f.net0Ip6;
        } else {
            net0 += ',ip6=dhcp';
        }
        try {
            if (!$.lxcCreateNodeId.value) {
                return alert(window.__i18n.t('err.NODE_SELECT_REQUIRED'));
            }
            await api('/lxc/create', {
                method: 'POST',
                body: JSON.stringify({
                    pve_node_id: $.lxcCreateNodeId.value,
                    ostemplate: f.ostemplate,
                    hostname: f.hostname,
                    password: f.password,
                    storage: f.storage,
                    cores: f.cores,
                    memory: f.memory,
                    swap: f.swap,
                    disk: f.disk,
                    net0: net0,
                    unprivileged: f.unprivileged,
                    start: f.start,
                    features: f.features
                })
            });
            $.lxcForm.value = { ostemplate: '', hostname: '', password: '', confirmPassword: '', storage: '', cores: 1, memory: 512, swap: 512, disk: 8, features: '', net0Bridge: 'vmbr0', net0Ip: '', net0Mac: '', net0Ip6: '', unprivileged: true, start: true };
            $.syncLxcFeatureSet($.lxcFeaturesSet, $.lxcForm, 'features');
            alert(window.__i18n.t('admin.lxc.createOkFull'));
            await $.loadLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.assignLxc = async function() {
        try {
            if (!$.lxcAssignNodeId.value) {
                return alert(window.__i18n.t('err.NODE_SELECT_REQUIRED'));
            }
            var expDate = toLocalDateTimeStr($.lxcAssignForm.value.expiration_date);
            await api('/user/lxc', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, $.lxcAssignForm.value, { expiration_date: expDate }))
            });
            $.lxcAssignForm.value = { ct_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', monthly_price: '', quarterly_discount: '', yearly_discount: '', mac_group_id: '', pve_node_id: $.lxcAssignNodeId.value };
            await $.loadLxcContainers();
            await $.loadUserLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.updateLxc = async function() {
        var f = $.editLxcForm.value;
        try {
            // 类型统一：下拉选项为字符串，提交前转回数字；空串表示"无主"
            var uid = f.user_id;
            if (uid !== '' && uid !== null && uid !== undefined) {
                var parsed = Number(uid);
                if (isNaN(parsed)) return alert(window.__i18n.t('admin.assign.pickUser'));
                uid = parsed;
            } else {
                uid = null;
            }
            var expDate = toLocalDateTimeStr(f.expiration_date);
            await api('/user/lxc/' + f.id, {
                method: 'PUT',
                body: JSON.stringify({
                    name: f.name,
                    expiration_date: expDate,
                    renewal_price: f.renewal_price,
                    renewal_period: f.renewal_period || 'month',
                    user_id: uid,
                    mac_group_id: f.mac_group_id || null
                })
            });
            $.bsModalHide('editLxcModal');
            await $.loadUserLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeLxc = async function() {
        var f = $.editLxcForm.value;
        if (!await window.customConfirm(window.__i18n.t('admin.lxc.unassignKeepConfirm'))) return;
        try {
            await api('/user/lxc/' + f.id, { method: 'DELETE' });
            $.bsModalHide('editLxcModal');
            await $.loadLxcContainers();
            await $.loadUserLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeLxcById = async function(id) {
        if (!await window.customConfirm(window.__i18n.t('admin.lxc.unassignConfirm'))) return;
        try {
            await api('/user/lxc/' + id, { method: 'DELETE' });
            await $.loadLxcContainers();
            await $.loadUserLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.destroyLxc = async function() {
        var ct = $.editLxcForm.value;
        $.bsModalHide('destroyLxcModal');
        if (!await window.customConfirm(window.__i18n.t('admin.lxc.destroyConfirmWarn'))) return;
        try {
            await api('/lxc/' + ct.ct_id + '/destroy', { method: 'POST' });
            $.bsModalHide('editLxcModal');
            await $.loadUserLxcContainers();
            await $.loadLxcContainers();
            alert(window.__i18n.t('dash.lxc.destroyedFull'));
        } catch (e) {
            alert(e.message);
        }
    };

    // 操作冷却期（ms），防止重复点击导致 PVE 卡死
    var LXC_OP_COOLDOWN = 8000;
    function lxcIsOperating(ctid) {
        var t = $.lxcOpTimestamps.value.get(ctid);
        if (!t) return false;
        if (Date.now() - t > LXC_OP_COOLDOWN) { var m = new Map($.lxcOpTimestamps.value); m.delete(ctid); $.lxcOpTimestamps.value = m; return false; }
        return true;
    }
    function lxcMarkOperating(ctid) { var m = new Map($.lxcOpTimestamps.value); m.set(ctid, Date.now()); $.lxcOpTimestamps.value = m; }

    $.startLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert(window.__i18n.t('dash.lxc.opBusy'));
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/start', { method: 'POST' }); await $.loadUserLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.shutdownLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert(window.__i18n.t('dash.lxc.opBusy'));
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/shutdown', { method: 'POST' }); $.lxcConfirmState.value = { ctId: null, action: null }; await $.loadUserLxcContainers(); setTimeout(function() { $.loadUserLxcContainers(); }, 4000); }
        catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.stopLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert(window.__i18n.t('dash.lxc.opBusy'));
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/stop', { method: 'POST' }); $.lxcConfirmState.value = { ctId: null, action: null }; await $.loadUserLxcContainers(); setTimeout(function() { $.loadUserLxcContainers(); }, 2000); }
        catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.rebootLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert(window.__i18n.t('dash.lxc.opBusy'));
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/reboot', { method: 'POST' }); await $.loadUserLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.openLxcTerminal = async function(ctid) {
        try {
            var data = await api('/lxc/' + ctid + '/terminal', { method: 'POST' });
            window.open(data.proxyUrl, '_blank');
        } catch (e) {
            alert(window.__i18n.t('dash.lxc.termOpenFailed') + e.message);
        }
    };

    $.resetLxcPassword = async function() {
        var f = $.lxcPasswordForm.value;
        if (!f.password) return alert(window.__i18n.t('user.secAuth.newPwdRequired'));
        if (f.password !== f.confirmPassword) return alert(window.__i18n.t('register.passwordMismatch'));
        var pwdRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,13}$/;
        if (!pwdRegex.test(f.password)) {
            return alert(window.__i18n.t('register.passwordRule'));
        }
        var ct = $.selectedLxc.value;
        if (!ct) return;
        try {
            await api('/lxc/' + ct.ct_id + '/reset-password', {
                method: 'POST',
                body: JSON.stringify({ password: f.password })
            });
            $.lxcPasswordForm.value = { password: '', confirmPassword: '' };
            $.bsModalHide('resetLxcPasswordModal');
            alert(window.__i18n.t('dash.resetPwd.ok'));
        } catch (e) {
            alert(e.message);
        }
    };

    $.openResetLxcPasswordModal = function(ct) {
        $.selectedLxc.value = ct;
        $.lxcPasswordForm.value = { password: '', confirmPassword: '' };
        $.adminLxcPwdShowPwd.value = false;
        $.bsModalShow('resetLxcPasswordModal');
    };

    $.openResetLxcIpModal = function(ct) {
        // 私有网络：重置 IP 必须先绑定子网
        if (!ct.subnet_id) {
            alert(window.__i18n.t('dash.resetIp.needSubnetCt'));
            return;
        }
        $.selectedLxc.value = ct;
        // 从容器配置中提取当前 IP
        let currentIp = ct.dhcp_static_ip || '';
        if (!currentIp && ct.config && ct.config.net0) {
            const ipMatch = ct.config.net0.match(/ip=([0-9.]+\/\d+)/);
            if (ipMatch) currentIp = ipMatch[1];
        }
        $.lxcIpForm.value = { ip_mode: currentIp ? 'static' : 'dhcp', ip: currentIp };
        $.lxcIpError.value = '';
        $.bsModalShow('resetLxcIpModal');
    };

    $.randomLxcIp = async function() {
        var ct = $.selectedLxc.value;
        if (!ct) return;
        // 私有网络：随机 IP 从当前容器绑定的子网 IP 池选取
        if (!ct.subnet_id) {
            alert(window.__i18n.t('dash.randomIp.needSubnetCt'));
            return;
        }
        try {
            var data = await api('/lxc/random-ip?subnet_id=' + ct.subnet_id);
            $.lxcIpForm.value.ip = data.ip + '/24';
            $.lxcIpForm.value.ip_mode = 'static';
        } catch (e) {
            alert(window.__i18n.t('dash.randomIp.failed') + e.message);
        }
    };

    // 新建 LXC 容器时随机生成 IP
    $.randomLxcCreateIp = async function() {
        try {
            var data = await api('/lxc/random-ip');
            $.lxcForm.value.net0Ip = data.ip + '/24';
        } catch (e) {
            alert(window.__i18n.t('dash.randomIp.failed') + e.message);
        }
    };

    $.confirmResetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = window.__i18n.t('dash.ipRequired');
            return;
        }
        var ct = $.selectedLxc.value;
        if (!ct) return;
        var confirmed = await window.customConfirm(window.__i18n.tFormat('dash.resetIp.confirmCtFmt', ct.ct_id));
        if (!confirmed) return;
        await $.resetLxcIp();
    };

    $.resetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = window.__i18n.t('dash.ipRequired');
            return;
        }
        var ct = $.selectedLxc.value;
        if (!ct) return;
        $.lxcIpLoading.value = true;
        try {
            var result = await api('/lxc/' + ct.ct_id + '/reset-ip', {
                method: 'POST',
                body: JSON.stringify({ ip_mode: f.ip_mode, ip: f.ip })
            });
            $.lxcIpLoading.value = false;
            $.bsModalHide('resetLxcIpModal');
            alert(window.__i18n.t('dash.resetIp.ipOk') + (result.ip || 'DHCP'));
            // 刷新容器列表
            if ($.loadLxcContainers) await $.loadLxcContainers();
            if ($.loadUserLxcContainers) await $.loadUserLxcContainers();
        } catch (e) {
            $.lxcIpLoading.value = false;
            $.lxcIpError.value = e.message;
        }
    };

    $.editLxc = function(ct) {
        $.editLxcForm.value = {
            id: ct.id,
            ct_id: ct.ct_id,
            name: ct.name || '',
            expiration_date: formatDateTimeLocal(ct.expiration_date),
            renewal_price: ct.renewal_price || '',
            renewal_period: ct.renewal_period || 'month',
            user_id: ct.user_id != null ? String(ct.user_id) : '',
            mac_group_id: ct.ikuai_mac_group_id || '',
            status: ct.status || null
        };
        $.bsModalShow('editLxcModal');
    };

    $.requestLxcConfirm = function(ctId, action) {
        $.lxcConfirmState.value = { ctId: ctId, action: action };
    };

    $.cancelLxcConfirm = function() {
        $.lxcConfirmState.value = { ctId: null, action: null };
    };

    $.confirmLxcAction = function(ct) {
        var action = $.lxcConfirmState.value.action;
        if (action === 'shutdown') $.shutdownLxc(ct.ct_id);
        else if (action === 'reboot') $.rebootLxc(ct.ct_id);
        else if (action === 'stop') $.stopLxc(ct.ct_id);
        $.lxcConfirmState.value = { ctId: null, action: null };
    };

    // ==================== LXC 快照管理 ====================
    $.loadLxcSnapshots = async function(vmid) {
        $.lxcSnapshotLoading.value = true;
        try {
            var data = await api('/lxc/' + vmid + '/snapshots');
            $.lxcSnapshots.value = data.snapshots || [];
            $.lxcSnapshotLimits.value = {
                current: data.snapshots ? data.snapshots.length : 0,
                max: data.max_per_vm || 5,
                today_creates: data.today_created || 0,
                max_creates: data.daily_create_limit || 20,
                today_rollbacks: data.today_restored || 0,
                max_rollbacks: data.daily_restore_limit || 10
            };
        } catch (e) {
            alert(window.__i18n.t('dash.snap.loadFailed') + e.message);
            $.lxcSnapshots.value = [];
        } finally {
            $.lxcSnapshotLoading.value = false;
        }
    };

    $.openLxcSnapshotPanel = async function(ct) {
        $.lxcSnapshotVmId.value = ct.ct_id;
        $.lxcSnapshotVmName.value = ct.name || 'CT ' + ct.ct_id;
        $.lxcSnapshotVmRunning.value = ct.status && ct.status.status === 'running';
        $.lxcSnapshotForm.value = { name: '', description: '' };
        $.lxcSnapshotSelected.value = new Set();
        $.bsModalShow('lxcSnapshotModal');
        await $.loadLxcSnapshots(ct.ct_id);
    };

    $.toggleLxcSnapshotSelect = function(name) {
        var s = new Set($.lxcSnapshotSelected.value);
        if (s.has(name)) s.delete(name); else s.add(name);
        $.lxcSnapshotSelected.value = s;
    };

    $.toggleSelectAllLxcSnapshots = function() {
        if ($.isAllLxcSnapshotsSelected.value) {
            $.lxcSnapshotSelected.value = new Set();
        } else {
            $.lxcSnapshotSelected.value = new Set($.lxcSnapshots.value.map(function(s) { return s.name; }));
        }
    };

    $.batchDeleteLxcSnapshots = async function(vmid) {
        var names = Array.from($.lxcSnapshotSelected.value);
        if (names.length === 0) return;
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('common.batchDeleteConfirm1') + names.length + window.__i18n.t('dash.snap.batchSuffix'))) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        $.lxcSnapshotDeleting.value = true;
        try {
            await Promise.all(names.map(function(name) {
                return api('/lxc/' + vmid + '/snapshots/' + encodeURIComponent(name), { method: 'DELETE' });
            }));
            $.lxcSnapshotSelected.value = new Set();
            await $.loadLxcSnapshots(vmid);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('common.deletedPrefix') + names.length + window.__i18n.t('dash.snap.countSuffix'));
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.batchDeleteFailed') + e.message);
            await $.loadLxcSnapshots(vmid);
        } finally {
            $.lxcSnapshotDeleting.value = false;
        }
    };

    $.createLxcSnapshot = async function(vmid) {
        $.lxcSnapshotCreating.value = true;
        try {
            await api('/lxc/' + vmid + '/snapshots', {
                method: 'POST',
                body: JSON.stringify({ description: $.lxcSnapshotForm.value.description || '' })
            });
            $.lxcSnapshotForm.value = { name: '', description: '' };
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.created'));
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.createFailed') + e.message);
        } finally {
            $.lxcSnapshotCreating.value = false;
        }
    };

    $.rollbackLxcSnapshot = async function(vmid, snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('dash.snap.rollbackConfirm1') + snapname + window.__i18n.t('dash.snap.rbCtNl'))) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/snapshots/' + encodeURIComponent(snapname) + '/rollback', { method: 'POST' });
            await $.loadLxcSnapshots(vmid);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.rollbackOk'));
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.rollbackFailed') + e.message);
        }
    };

    $.deleteLxcSnapshot = async function(vmid, snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('dash.snap.deleteConfirm1') + snapname + window.__i18n.t('dash.snap.deleteSuffix'))) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/snapshots/' + encodeURIComponent(snapname), { method: 'DELETE' });
            await $.loadLxcSnapshots(vmid);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.deleted'));
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.deleteFailed') + e.message);
        }
    };

    // ==================== LXC 备份管理 ====================
    $.loadLxcBackups = async function(vmid) {
        try {
            var res = await api('/lxc/' + vmid + '/backups');
            $.lxcBackups.value = res.backups || [];
        } catch (e) {
            $.lxcBackups.value = [];
        }
    };

    $.openLxcBackupPanel = async function(ct) {
        $.lxcBackupVmId.value = ct.ct_id;
        $.lxcBackupVmName.value = ct.name || 'CT ' + ct.ct_id;
        $.lxcBackupForm.value = { storage: $.storageList.value.length > 0 ? $.storageList.value[0].id : 'local', notes: '' };
        $.lxcBackupSelected.value = new Set();
        $.bsModalShow('lxcBackupModal');
        await $.loadStorageList();
        await $.loadLxcBackups(ct.ct_id);
    };

    $.toggleLxcBackupSelect = function(id) {
        var s = new Set($.lxcBackupSelected.value);
        if (s.has(id)) s.delete(id); else s.add(id);
        $.lxcBackupSelected.value = s;
    };

    $.toggleSelectAllLxcBackups = function() {
        if ($.isAllLxcBackupsSelected.value) {
            $.lxcBackupSelected.value = new Set();
        } else {
            $.lxcBackupSelected.value = new Set($.lxcBackups.value.filter(function(b) { return b.status !== 'running' && b.status !== 'pending'; }).map(function(b) { return b.id; }));
        }
    };

    $.createLxcBackup = async function(vmid) {
        if ($.lxcBackupCreating.value) return;
        $.lxcBackupCreating.value = true;
        try {
            await api('/lxc/' + vmid + '/backups', {
                method: 'POST',
                body: JSON.stringify({ notes: $.lxcBackupForm.value.notes, storage: $.lxcBackupForm.value.storage })
            });
            $.lxcBackupForm.value = { storage: $.storageList.value.length > 0 ? $.storageList.value[0].id : 'local', notes: '' };
            await $.loadLxcBackups(vmid);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            // 立即刷新容器列表，让「备份中」徽标即时展示并锁定操作按钮
            if (typeof $.loadUserLxcContainers === 'function') { $.loadUserLxcContainers(); } else if (typeof $.loadLxcContainers === 'function') { $.loadLxcContainers(); }
            alert(window.__i18n.t('dash.backup.taskCreated'));
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        } finally {
            $.lxcBackupCreating.value = false;
        }
    };

    $.deleteLxcBackup = async function(id, vmid) {
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('dash.backup.deleteConfirm'))) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/backups/' + id, { method: 'DELETE' });
            await $.loadLxcBackups($.lxcBackupVmId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.backup.deleted'));
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.backup.deleteFailed') + e.message);
        }
    };

    $.restoreLxcBackup = async function(backup) {
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('dash.restore.ctConfirm1') + $.lxcBackupVmName.value + window.__i18n.t('dash.restore.timeMid') + formatDate(backup.created_at) + window.__i18n.t('dash.restore.ctConfirm2'))) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + (backup.ct_id || $.lxcBackupVmId.value) + '/backups/' + backup.id + '/restore', { method: 'POST' });
            await $.loadLxcBackups($.lxcBackupVmId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            // 立即刷新容器列表，让「恢复中」徽标即时展示并锁定操作按钮
            if (typeof $.loadUserLxcContainers === 'function') { $.loadUserLxcContainers(); } else if (typeof $.loadLxcContainers === 'function') { $.loadLxcContainers(); }
            alert(window.__i18n.t('dash.restore.taskCreated'));
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        }
    };

    $.batchDeleteLxcBackups = async function(vmid) {
        var ids = Array.from($.lxcBackupSelected.value);
        if (ids.length === 0) return;
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('common.batchDeleteConfirm1') + ids.length + window.__i18n.t('dash.backup.batchSuffix'))) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        $.lxcBackupDeleting.value = true;
        try {
            await api('/backups/batch-delete', { method: 'POST', body: JSON.stringify({ ids: ids }) });
            $.lxcBackupSelected.value = new Set();
            await $.loadLxcBackups(vmid);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('common.deletedPrefix') + ids.length + window.__i18n.t('dash.backup.countSuffix'));
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.batchDeleteFailed') + e.message);
        } finally {
            $.lxcBackupDeleting.value = false;
        }
    };

    // LXC 辅助方法
    $.getLxcCpuUsage = function(ct) {
        if (!ct.status || ct.status.cpu === undefined) return '0%';
        return (ct.status.cpu * 100).toFixed(1) + '%';
    };

    $.getLxcMemUsage = function(ct) {
        if (!ct.status || ct.status.mem === undefined || !ct.config || !ct.config.memory) return '0%';
        return ((ct.status.mem / (ct.config.memory * 1024 * 1024)) * 100).toFixed(1) + '%';
    };

    $.lxcTemplateLabel = function(tpl) {
        var volid = tpl.volid || '';
        var parts = volid.split('/');
        var filename = parts[parts.length - 1] || volid;
        var name = filename.replace(/\.(tar\.(gz|xz|bz2|zst)|zst)$/i, '');
        var storage = tpl.storage || (volid.includes(':') ? volid.split(':')[0] : '');
        return name + ' (' + storage + ')';
    };

    $.getLxcStatusColor = function(status) {
        return status === 'running' ? 'status-running' : 'status-stopped';
    };

    $.openDestroyLxcConfirm = function(ct) {
        $.selectedLxc.value = ct;
        $.bsModalShow('destroyLxcModal');
    };

    $.openDestroyLxcModalFromList = function(ct) {
        $.editLxcForm.value = {
            ct_id: ct.ct_id,
            name: ct.name || '',
            id: ct.id
        };
        $.destroyLxcConfirmText.value = '';
        $.bsModalShow('destroyLxcModal');
    };

    $.confirmDestroyLxc = async function() {
        var ct = $.editLxcForm.value;
        if (!ct) return;
        $.bsModalHide('destroyLxcModal');
        try {
            await api('/lxc/' + ct.ct_id + '/destroy', { method: 'POST' });
            $.bsModalHide('editLxcModal');
            await $.loadUserLxcContainers();
            await $.loadLxcContainers();
            alert(window.__i18n.t('dash.lxc.destroyedFull'));
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeLcxById = async function(id) {
        if (await window.customConfirm(window.__i18n.t('dash.lxc.removeAssignConfirmShort'))) {
            try {
                await api('/user/lxc/' + id, { method: 'DELETE' });
                await $.loadUserLxcContainers();
                await $.loadLxcContainers();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    // ==================== initLxc ====================
    $.initLxc = function() {
        watch(function() { return $.activeTabLxc.value; }, function(val) {
            if (val === 'network') $.loadForwardRules('lxc');
        });
        watch(function() { return $.packagePage.lxcProvisionForm.value.package_id; }, function(newVal) {
            if (!newVal) return;
            var pkg = $.packagePage.lxcPackages.value.find(function(p) { return String(p.id) === String(newVal); });
            if (pkg) {
                $.lxcAssignForm.value.name = pkg.name + '-' + Math.random().toString(36).slice(2, 6);
                $.lxcAssignForm.value.renewal_price = pkg.monthly_price;
                var d = new Date(); d.setMonth(d.getMonth() + 1);
                // 使用本地时间格式填充 datetime-local，避免 toISOString() 转换为 UTC
                var y = d.getFullYear();
                var m = String(d.getMonth() + 1).padStart(2, '0');
                var dd = String(d.getDate()).padStart(2, '0');
                var h = String(d.getHours()).padStart(2, '0');
                var mi = String(d.getMinutes()).padStart(2, '0');
                $.lxcAssignForm.value.expiration_date = y + '-' + m + '-' + dd + 'T' + h + ':' + mi;
            }
        });
    };
})();
