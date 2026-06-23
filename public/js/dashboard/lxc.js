(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;

    // ===== 状态 =====
    $.lxcLoading = ref(false);
    $.userLxcContainers = ref([]);
    $.lxcConfirmState = ref({ ctId: null, action: null });
    $.lxcOpTimestamps = ref(new Map());
    $.editLxcForm = ref({ id: null, name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', user_id: null });
    $.lxcPasswordForm = ref({ password: '', confirm: '' });
    $.lxcPasswordError = ref('');
    $.lxcPasswordResetCtId = ref(null);
    $.lxcPasswordResetCtName = ref('');
    $.cdkLxcDropdownOpen = ref(false);
    $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
    $.lxcIpError = Vue.ref('');
    $.lxcIpLoading = Vue.ref(false);

    // LXC Snapshot 状态
    $.lxcSnapshots = ref([]);
    $.lxcSnapshotLoading = ref(false);
    $.lxcSnapshotCreating = ref(false);
    $.lxcSnapshotDeleting = ref(false);
    $.lxcSnapshotSelected = ref(new Set());
    $.lxcSnapshotForm = ref({ name: '', description: '' });
    $.lxcSnapshotLimits = ref({ current: 0, max: 5, today_creates: 0, max_creates: 20, today_rollbacks: 0, max_rollbacks: 10 });
    $.lxcSnapshotCtId = ref(null);
    $.lxcSnapshotCtName = ref('');
    $.lxcSnapshotCtRunning = ref(false);

    // LXC Backup 状态
    $.lxcBackups = ref([]);
    $.lxcBackupCreating = ref(false);
    $.lxcBackupDeleting = ref(false);
    $.lxcBackupSelected = ref(new Set());
    $.lxcBackupForm = ref({ notes: '' });
    $.lxcBackupLimits = ref({ current: 0, max_per_vm: 3, today_creates: 0, daily_limit: 3 });
    $.lxcBackupCtId = ref(null);
    $.lxcBackupCtName = ref('');

    // ===== Computed =====
    $.isLxcSnapshotNameValid = computed(function() {
        var name = $.lxcSnapshotForm.value.name;
        return name.length >= 2 && name.length <= 20 && /^[a-zA-Z0-9\-_]+$/.test(name);
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

    // LXC 确认弹窗
    $.confirmLxcActionText = computed(function() {
        var msgs = {
            shutdown: '这将发送安全关机信号，关闭 LXC 容器。',
            reboot: 'LXC 容器将重新启动。',
            stop: '将立即强制停止 LXC 容器，未保存的数据将会丢失。'
        };
        return msgs[$.lxcConfirmState.value.action] || '';
    });

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

    // ===== LXC 操作函数 =====
    $.loadLxcContainers = async function() {
        if ($.userLxcContainers.value.length === 0) {
            $.lxcLoading.value = true;
        }
        try {
            var fresh = await api('/user/lxc');
            // 保留正在开通中的占位记录（_provisioning 标记），避免 WebSocket tick 推送刷新时丢失
            var provisioning = $.userLxcContainers.value.filter(function(c) { return c._provisioning; });
            $.userLxcContainers.value = provisioning.concat(fresh);
        } catch (e) {
            console.error('加载LXC容器失败', e);
        } finally {
            $.lxcLoading.value = false;
        }
    };

    // ===== LXC 操作函数 =====
    // 操作冷却期（ms），防止重复点击导致 PVE 卡死
    var LXC_OP_COOLDOWN = 8000;
    function lxcIsOperating(ctId) {
        var t = $.lxcOpTimestamps.value.get(ctId);
        if (!t) return false;
        if (Date.now() - t > LXC_OP_COOLDOWN) { var m = new Map($.lxcOpTimestamps.value); m.delete(ctId); $.lxcOpTimestamps.value = m; return false; }
        return true;
    }
    function lxcMarkOperating(ctId) { var m = new Map($.lxcOpTimestamps.value); m.set(ctId, Date.now()); $.lxcOpTimestamps.value = m; }

    $.startLxc = async function(ctId) {
        if (lxcIsOperating(ctId)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctId);
        try { await api('/lxc/' + ctId + '/start', { method: 'POST' }); await $.loadLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.shutdownLxc = async function(ctId) {
        if (lxcIsOperating(ctId)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctId);
        try {
            await api('/lxc/' + ctId + '/shutdown', { method: 'POST' });
            $.lxcConfirmState.value = { ctId: null, action: null };
            await $.loadLxcContainers();
            setTimeout(function() { $.loadLxcContainers(); }, 4000);
        } catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.stopLxc = async function(ctId) {
        if (lxcIsOperating(ctId)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctId);
        try {
            await api('/lxc/' + ctId + '/stop', { method: 'POST' });
            $.lxcConfirmState.value = { ctId: null, action: null };
            await $.loadLxcContainers();
            setTimeout(function() { $.loadLxcContainers(); }, 2000);
        } catch (e) { $.lxcConfirmState.value = { ctId: null, action: null }; alert(e.message); }
    };

    $.rebootLxc = async function(ctId) {
        if (lxcIsOperating(ctId)) return alert('容器正在操作中，请勿重复点击！');
        lxcMarkOperating(ctId);
        try { await api('/lxc/' + ctId + '/reboot', { method: 'POST' }); await $.loadLxcContainers(); }
        catch (e) { alert(e.message); }
    };

    $.openLxcTerminal = async function(ctId) {
        try {
            var data = await api('/lxc/' + ctId + '/terminal', { method: 'POST' });
            window.open(data.proxyUrl, '_blank');
        } catch (e) {
            alert('打开终端失败：' + e.message);
        }
    };

    $.getLxcCpuUsage = function(ct) {
        if (ct.status && ct.status.cpu !== undefined) {
            return (ct.status.cpu * 100).toFixed(1);
        }
        return '0.0';
    };

    $.getLxcMemUsage = function(ct) {
        if (ct.status && ct.status.mem !== undefined && ct.config && ct.config.memory) {
            return ((ct.status.mem / (ct.config.memory * 1024 * 1024)) * 100).toFixed(1);
        }
        return '0.0';
    };

    // LXC Edit
    $.editLxc = function(ct) {
        $.editLxcForm.value = {
            id: ct.id,
            name: ct.name || '',
            expiration_date: formatDateTimeLocal(ct.expiration_date),
            renewal_price: ct.renewal_price || '',
            renewal_period: ct.renewal_period || 'month',
            user_id: ct.user_id || null
        };
        $.bsModalShow('editLxcModal');
    };

    $.updateLxc = async function() {
        try {
            var expDate = toLocalDateTimeStr($.editLxcForm.value.expiration_date);
            await api('/user/lxc/' + $.editLxcForm.value.id, {
                method: 'PUT',
                body: JSON.stringify({
                    name: $.editLxcForm.value.name,
                    expiration_date: expDate,
                    renewal_price: $.editLxcForm.value.renewal_price,
                    renewal_period: $.editLxcForm.value.renewal_period,
                    user_id: $.editLxcForm.value.user_id
                })
            });
            $.bsModalHide('editLxcModal');
            await $.loadLxcContainers();
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeLxc = async function() {
        if (await window.customConfirm('确定移除此LXC容器分配？')) {
            try {
                await api('/user/lxc/' + $.editLxcForm.value.id, { method: 'DELETE' });
                $.bsModalHide('editLxcModal');
                await $.loadLxcContainers();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.removeLxcById = async function(id) {
        if (await window.customConfirm('确定移除此LXC容器分配？')) {
            try {
                await api('/user/lxc/' + id, { method: 'DELETE' });
                await $.loadLxcContainers();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    // LXC Password Reset
    $.openLxcPasswordReset = function(ct) {
        $.lxcPasswordResetCtId.value = ct.ct_id;
        $.lxcPasswordResetCtName.value = ct.name || 'CT ' + ct.ct_id;
        $.lxcPasswordForm.value = { password: '', confirm: '' };
        $.lxcPasswordError.value = '';
        $.bsModalShow('lxcPasswordResetModal');
    };

    $.submitLxcPasswordReset = async function() {
        if ($.lxcPasswordForm.value.password !== $.lxcPasswordForm.value.confirm) {
            $.lxcPasswordError.value = '两次输入的密码不一致';
            return;
        }
        if ($.lxcPasswordForm.value.password.length < 6) {
            $.lxcPasswordError.value = '密码长度不能少于6位';
            return;
        }
        $.lxcPasswordError.value = '';
        try {
            await api('/lxc/' + $.lxcPasswordResetCtId.value + '/reset-password', {
                method: 'POST',
                body: JSON.stringify({ password: $.lxcPasswordForm.value.password })
            });
            $.bsModalHide('lxcPasswordResetModal');
            alert('密码重置成功');
        } catch (e) {
            $.lxcPasswordError.value = e.message;
        }
    };

    $.openResetLxcIpModal = function(ct) {
        $.lxcPasswordResetCtId.value = ct.ct_id;
        $.lxcPasswordResetCtName.value = ct.name || 'CT ' + ct.ct_id;
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

    $.confirmResetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = '请输入 IP 地址';
            return;
        }
        var ctId = $.lxcPasswordResetCtId.value;
        if (!ctId) return;
        var confirmed = await window.customConfirm('确认修改 CT ' + ctId + ' 的 IP？容器将短暂关机后自动重启，正在运行的服务会中断。');
        if (!confirmed) return;
        await $.resetLxcIp();
    };

    $.resetLxcIp = async function() {
        var f = $.lxcIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) {
            $.lxcIpError.value = '请输入 IP 地址';
            return;
        }
        $.lxcIpLoading.value = true;
        try {
            var result = await api('/lxc/' + $.lxcPasswordResetCtId.value + '/reset-ip', {
                method: 'POST',
                body: JSON.stringify({ ip_mode: f.ip_mode, ip: f.ip })
            });
            $.lxcIpLoading.value = false;
            $.bsModalHide('resetLxcIpModal');
            alert('IP 重置成功：' + (result.ip || 'DHCP'));
            if ($.loadLxcContainers) await $.loadLxcContainers();
        } catch (e) {
            $.lxcIpLoading.value = false;
            $.lxcIpError.value = e.message;
        }
    };

    // LXC Snapshots
    $.loadLxcSnapshots = async function(ctId) {
        $.lxcSnapshotLoading.value = true;
        try {
            var data = await api('/lxc/' + ctId + '/snapshots');
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
        $.lxcSnapshotCtId.value = ct.ct_id;
        $.lxcSnapshotCtName.value = ct.name || 'CT ' + ct.ct_id;
        $.lxcSnapshotCtRunning.value = ct.status && ct.status.status === 'running';
        $.lxcSnapshotForm.value = { name: '', description: '' };
        $.lxcSnapshotSelected.value = new Set();
        $.bsModalShow('lxcSnapshotModal');
        await $.loadLxcSnapshots(ct.ct_id);
    };

    $.filterLxcSnapshotName = function() {
        var name = $.lxcSnapshotForm.value.name.replace(/[^a-zA-Z0-9\-_]/g, '');
        if (name.length > 20) name = name.slice(0, 20);
        $.lxcSnapshotForm.value.name = name;
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

    $.batchDeleteLxcSnapshots = async function() {
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
                return api('/lxc/' + $.lxcSnapshotCtId.value + '/snapshots/' + encodeURIComponent(name), { method: 'DELETE' });
            }));
            $.lxcSnapshotSelected.value = new Set();
            await $.loadLxcSnapshots($.lxcSnapshotCtId.value);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('成功删除 ' + names.length + ' 个快照');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('批量删除失败：' + e.message);
            await $.loadLxcSnapshots($.lxcSnapshotCtId.value);
        } finally {
            $.lxcSnapshotDeleting.value = false;
        }
    };

    $.createLxcSnapshot = async function() {
        if (!$.isLxcSnapshotNameValid.value) return;
        $.lxcSnapshotCreating.value = true;
        try {
            await api('/lxc/' + $.lxcSnapshotCtId.value + '/snapshots', {
                method: 'POST',
                body: JSON.stringify({
                    name: $.lxcSnapshotForm.value.name,
                    description: $.lxcSnapshotForm.value.description || ''
                })
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

    $.rollbackLxcSnapshot = async function(snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要回滚到快照「' + snapname + '」吗？\n此操作将恢复容器磁盘到该快照的状态，运行中的数据可能丢失。')) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + $.lxcSnapshotCtId.value + '/snapshots/' + encodeURIComponent(snapname) + '/rollback', { method: 'POST' });
            await $.loadLxcSnapshots($.lxcSnapshotCtId.value);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照回滚成功');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('回滚快照失败：' + e.message);
        }
    };

    $.deleteLxcSnapshot = async function(snapname) {
        $.bsModalHide('lxcSnapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要删除快照「' + snapname + '」吗？此操作不可恢复。')) {
            $.bsModalShow('lxcSnapshotModal');
            return;
        }
        try {
            await api('/lxc/' + $.lxcSnapshotCtId.value + '/snapshots/' + encodeURIComponent(snapname), { method: 'DELETE' });
            await $.loadLxcSnapshots($.lxcSnapshotCtId.value);
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照删除成功');
        } catch (e) {
            $.bsModalHide('lxcSnapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除快照失败：' + e.message);
        }
    };

    // LXC Backups
    $.loadLxcBackups = async function(ctId) {
        try {
            var res = await api('/lxc/' + ctId + '/backups');
            $.lxcBackups.value = res.backups || [];
            if (res.limits) {
                $.lxcBackupLimits.value = res.limits;
            } else {
                $.lxcBackupLimits.value = { current: $.lxcBackups.value.filter(function(b) { return b.status !== 'failed'; }).length, max_per_vm: 3, today_creates: 0, daily_limit: 3 };
            }
        } catch (e) {
            $.lxcBackups.value = [];
        }
    };

    $.openLxcBackupPanel = async function(ct) {
        $.lxcBackupCtId.value = ct.ct_id;
        $.lxcBackupCtName.value = ct.name || 'CT ' + ct.ct_id;
        $.lxcBackupForm.value = { notes: '' };
        $.lxcBackupSelected.value = new Set();
        $.bsModalShow('lxcBackupModal');
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

    $.createLxcBackup = async function() {
        if ($.lxcBackupCreating.value) return;
        $.lxcBackupCreating.value = true;
        try {
            await api('/lxc/' + $.lxcBackupCtId.value + '/backups', { method: 'POST', body: JSON.stringify({ notes: $.lxcBackupForm.value.notes }) });
            $.lxcBackupForm.value = { notes: '' };
            await $.loadLxcBackups($.lxcBackupCtId.value);
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

    $.deleteLxcBackup = async function(id, ctId) {
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要删除此备份吗？此操作不可恢复。')) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + ctId + '/backups/' + id, { method: 'DELETE' });
            await $.loadLxcBackups($.lxcBackupCtId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('备份已删除');
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除备份失败：' + e.message);
        }
    };

    $.batchDeleteLxcBackups = async function() {
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
            await $.loadLxcBackups($.lxcBackupCtId.value);
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

    $.restoreLxcBackup = async function(backup) {
        $.bsModalHide('lxcBackupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('即将使用此备份恢复LXC容器【' + $.lxcBackupCtName.value + '】（备份时间：' + formatDate(backup.created_at) + '）。\n\n恢复将【完全覆盖】当前容器的磁盘数据！\n⚠️ 已有的快照将会被清除\n\n请确保容器已关机，否则恢复将失败。\n\n确认要恢复吗？')) {
            $.bsModalShow('lxcBackupModal');
            return;
        }
        try {
            await api('/lxc/' + (backup.ct_id || $.lxcBackupCtId.value) + '/backups/' + backup.id + '/restore', { method: 'POST' });
            await $.loadLxcBackups($.lxcBackupCtId.value);
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('恢复任务已创建，完成后将通过站内信和邮件通知您');
        } catch (e) {
            $.bsModalHide('lxcBackupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        }
    };

    $.getRedeemableLxcName = function(id) {
        var ct = $.userLxcContainers.value.find(function(c) { return c.id == id; });
        if (!ct) return '';
        var exp = ct.expiration_date ? formatDate(ct.expiration_date) : '未设置';
        return (ct.name || 'CT ' + ct.ct_id) + '（到期: ' + exp + '）';
    };

    // ===== initLxc =====
    $.initLxc = function() {
        // 无额外 watch 或生命周期逻辑
    };
})();
