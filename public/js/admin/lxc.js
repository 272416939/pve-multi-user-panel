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
    $.lxcForm = ref({ ostemplate: '', hostname: '', password: '', confirmPassword: '', storage: '', cores: 1, memory: 512, swap: 512, disk: 8, features: '', net0Bridge: 'vmbr0', net0Ip: '', net0Mac: '', net0Ip6: '', unprivileged: true, start: true });
    $.lxcAssignForm = ref({ ct_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', monthly_price: '', quarterly_discount: '', yearly_discount: '', mac_group_id: '' });
    $.lxcPasswordForm = ref({ password: '', confirmPassword: '' });
    $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
    $.lxcIpError = Vue.ref('');
    $.lxcIpLoading = Vue.ref(false);
    $.selectedLxc = ref(null);
    $.lxcConfirmState = ref({ ctId: null, action: null });
    $.lxcOpTimestamps = ref(new Map());
    $.editLxcForm = ref({ id: null, ct_id: null, name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', user_id: null, mac_group_id: '', status: null });
    $.destroyLxcConfirmText = ref('');
    $.availableLxc = ref([]);
    $.assignedLxc = ref([]);

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
    $.confirmLxcActionText = computed(function() {
        var msgs = {
            shutdown: '这将发送安全关机信号，关闭 LXC 容器。',
            reboot: 'LXC 容器将重新启动。',
            stop: '将立即强制停止 LXC 容器，未保存的数据将会丢失。'
        };
        return msgs[$.lxcConfirmState.value.action] || '';
    });

    $.isLxcSnapshotNameValid = computed(function() {
        var n = $.lxcSnapshotForm.value.name;
        return n.length >= 2 && n.length <= 20 && /^[a-zA-Z0-9\-_]+$/.test(n);
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
    $.loadLxcTemplates = async function() {
        try {
            $.lxcTemplates.value = await api('/lxc/templates');
            $.lxcStorageList.value = await api('/lxc/storages');
        } catch (e) {
            console.error('加载 LXC 模板/存储失败', e);
        }
    };

    $.loadLxcContainers = async function() {
        try {
            var data = await api('/pve/lxc');
            $.availableLxc.value = data.available || [];
            $.assignedLxc.value = data.assigned || [];
            $.lxcContainers.value = data.available || [];
        } catch (e) {
            console.error('加载 LXC 容器失败', e);
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
        if (!f.ostemplate) return alert('请选择模板');
        if (!f.hostname) return alert('请输入主机名');
        if (!f.password) return alert('请输入密码');
        if (f.password !== f.confirmPassword) return alert('两次输入的密码不一致');
        var net0 = 'name=eth0,bridge=' + (f.net0Bridge || 'vmbr0');
        if (f.net0Ip) net0 += ',ip=' + f.net0Ip;
        if (f.net0Mac) net0 += ',hwaddr=' + f.net0Mac;
        if (f.net0Ip6) {
            net0 += ',ip6=' + f.net0Ip6;
        } else {
            net0 += ',ip6=dhcp';
        }
        try {
            await api('/lxc/create', {
                method: 'POST',
                body: JSON.stringify({
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
            alert('LXC 容器创建成功');
            await $.loadLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.assignLxc = async function() {
        try {
            var expDate = toLocalDateTimeStr($.lxcAssignForm.value.expiration_date);
            await api('/user/lxc', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, $.lxcAssignForm.value, { expiration_date: expDate }))
            });
            $.lxcAssignForm.value = { ct_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', monthly_price: '', quarterly_discount: '', yearly_discount: '', mac_group_id: '' };
            await $.loadLxcContainers();
            await $.loadUserLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.updateLxc = async function() {
        var f = $.editLxcForm.value;
        try {
            var expDate = toLocalDateTimeStr(f.expiration_date);
            await api('/user/lxc/' + f.id, {
                method: 'PUT',
                body: JSON.stringify({
                    name: f.name,
                    expiration_date: expDate,
                    renewal_price: f.renewal_price,
                    renewal_period: f.renewal_period || 'month',
                    user_id: f.user_id,
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
        if (!await window.customConfirm('确定移除此 LXC 容器分配（仅解绑，不删除 PVE 数据）？')) return;
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
        if (!await window.customConfirm('确定移除此 LXC 容器分配（仅解绑）？')) return;
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
        if (!await window.customConfirm('⚠️ 确定要销毁此 LXC 容器并清除所有数据？此操作不可恢复！')) return;
        try {
            await api('/lxc/' + ct.ct_id + '/destroy', { method: 'POST' });
            $.bsModalHide('editLxcModal');
            await $.loadUserLxcContainers();
            await $.loadLxcContainers();
            alert('LXC 容器已销毁');
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
        if (lxcIsOperating(ctid)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/start', { method: 'POST' }); await $.loadUserLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.shutdownLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/shutdown', { method: 'POST' }); $.lxcConfirmState.value = { ctId: null, action: null }; await $.loadUserLxcContainers(); setTimeout(function() { $.loadUserLxcContainers(); }, 4000); }
        catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.stopLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/stop', { method: 'POST' }); $.lxcConfirmState.value = { ctId: null, action: null }; await $.loadUserLxcContainers(); setTimeout(function() { $.loadUserLxcContainers(); }, 2000); }
        catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.rebootLxc = async function(ctid) {
        if (lxcIsOperating(ctid)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctid);
        try { await api('/lxc/' + ctid + '/reboot', { method: 'POST' }); await $.loadUserLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.openLxcTerminal = async function(ctid) {
        try {
            var data = await api('/lxc/' + ctid + '/terminal', { method: 'POST' });
            window.open(data.proxyUrl, '_blank');
        } catch (e) {
            alert('打开终端失败：' + e.message);
        }
    };

    $.resetLxcPassword = async function() {
        var f = $.lxcPasswordForm.value;
        if (!f.password) return alert('请输入新密码');
        if (f.password !== f.confirmPassword) return alert('两次输入的密码不一致');
        var ct = $.selectedLxc.value;
        if (!ct) return;
        try {
            await api('/lxc/' + ct.ct_id + '/reset-password', {
                method: 'POST',
                body: JSON.stringify({ password: f.password })
            });
            $.lxcPasswordForm.value = { password: '', confirmPassword: '' };
            $.bsModalHide('resetLxcPasswordModal');
            alert('密码重置成功');
        } catch (e) {
            alert(e.message);
        }
    };

    $.openResetLxcPasswordModal = function(ct) {
        $.selectedLxc.value = ct;
        $.lxcPasswordForm.value = { password: '', confirmPassword: '' };
        $.bsModalShow('resetLxcPasswordModal');
    };

    $.openResetLxcIpModal = function(ct) {
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
        try {
            var data = await api('/lxc/random-ip');
            $.lxcIpForm.value.ip = data.ip + '/24';
            $.lxcIpForm.value.ip_mode = 'static';
        } catch (e) {
            alert('获取随机 IP 失败：' + e.message);
        }
    };

    // 新建 LXC 容器时随机生成 IP
    $.randomLxcCreateIp = async function() {
        try {
            var data = await api('/lxc/random-ip');
            $.lxcForm.value.net0Ip = data.ip + '/24';
        } catch (e) {
            alert('获取随机 IP 失败：' + e.message);
        }
    };

    $.confirmResetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = '请输入 IP 地址';
            return;
        }
        var ct = $.selectedLxc.value;
        if (!ct) return;
        var confirmed = await window.customConfirm('确认修改 CT ' + ct.ct_id + ' 的 IP？容器将短暂关机后自动重启，正在运行的服务会中断。');
        if (!confirmed) return;
        await $.resetLxcIp();
    };

    $.resetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = '请输入 IP 地址';
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
            alert('IP 重置成功：' + (result.ip || 'DHCP'));
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
            user_id: ct.user_id || null,
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
    $.filterLxcSnapshotName = function() {
        var name = $.lxcSnapshotForm.value.name.replace(/[^a-zA-Z0-9\-_]/g, '');
        if (name.length > 20) name = name.slice(0, 20);
        $.lxcSnapshotForm.value.name = name;
    };

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
            alert('获取快照列表失败：' + e.message);
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
        if (!await window.customConfirm('确定要批量删除 ' + names.length + ' 个快照吗？此操作不可恢复。')) {
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
            alert('成功删除 ' + names.length + ' 个快照');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('批量删除失败：' + e.message);
            await $.loadLxcSnapshots(vmid);
        } finally {
            $.lxcSnapshotDeleting.value = false;
        }
    };

    $.createLxcSnapshot = async function(vmid) {
        if (!$.isLxcSnapshotNameValid.value) return;
        $.lxcSnapshotCreating.value = true;
        try {
            await api('/lxc/' + vmid + '/snapshots', {
                method: 'POST',
                body: JSON.stringify({ name: $.lxcSnapshotForm.value.name, description: $.lxcSnapshotForm.value.description || '' })
            });
            $.lxcSnapshotForm.value = { name: '', description: '' };
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照创建成功');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('创建快照失败：' + e.message);
        } finally {
            $.lxcSnapshotCreating.value = false;
        }
    };

    $.rollbackLxcSnapshot = async function(vmid, snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要回滚到快照「' + snapname + '」吗？\n此操作将恢复容器磁盘到该快照的状态，运行中的数据可能丢失。')) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/snapshots/' + encodeURIComponent(snapname) + '/rollback', { method: 'POST' });
            await $.loadLxcSnapshots(vmid);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照回滚成功');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('回滚快照失败：' + e.message);
        }
    };

    $.deleteLxcSnapshot = async function(vmid, snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要删除快照「' + snapname + '」吗？此操作不可恢复。')) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/snapshots/' + encodeURIComponent(snapname), { method: 'DELETE' });
            await $.loadLxcSnapshots(vmid);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照删除成功');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除快照失败：' + e.message);
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
            alert('备份任务已创建，完成后将通过站内信和邮件通知您');
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
        if (!await window.customConfirm('确定要删除此备份吗？此操作不可恢复。')) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + vmid + '/backups/' + id, { method: 'DELETE' });
            await $.loadLxcBackups($.lxcBackupVmId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('备份已删除');
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除备份失败：' + e.message);
        }
    };

    $.restoreLxcBackup = async function(backup) {
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('即将使用此备份恢复容器【' + $.lxcBackupVmName.value + '】（备份时间：' + formatDate(backup.created_at) + '）。\n\n恢复将【完全覆盖】当前容器的数据！\n⚠️ 已有的快照将会被清除\n\n确认要恢复吗？')) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + (backup.ct_id || $.lxcBackupVmId.value) + '/backups/' + backup.id + '/restore', { method: 'POST' });
            await $.loadLxcBackups($.lxcBackupVmId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('恢复任务已创建，完成后将通过站内信和邮件通知您');
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
        if (!await window.customConfirm('确定要批量删除 ' + ids.length + ' 个备份吗？此操作不可恢复。')) {
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
            alert('成功删除 ' + ids.length + ' 个备份');
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('批量删除失败：' + e.message);
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
            alert('LXC 容器已销毁');
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeLcxById = async function(id) {
        if (await window.customConfirm('确定移除此容器分配？')) {
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
