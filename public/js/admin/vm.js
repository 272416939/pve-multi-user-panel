(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var watch = Vue.watch;

    // ==================== 状态 ====================
    $.userVms = ref([]);
    $.vmsLoading = ref(false);
    $.confirmState = ref({ vmId: null, action: null });
    $.vmOpTimestamps = ref(new Map());
    $.editVmForm = ref({ id: null, name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', user_id: null, backup_storage: '', mac_group_id: '', status: null });
    $.availableVms = ref([]);
    $.assignedVms = ref([]);

    // 快照管理
    $.snapshotVmId = ref(null);
    $.snapshotVmName = ref('');
    $.snapshotVmRunning = ref(false);
    $.snapshots = ref([]);
    $.snapshotLoading = ref(false);
    $.snapshotCreating = ref(false);
    $.snapshotDeleting = ref(false);
    $.snapshotSelected = ref(new Set());
    $.snapshotForm = ref({ name: '', description: '' });
    $.snapshotLimits = ref({ current: 0, max: 5, today_creates: 0, max_creates: 20, today_rollbacks: 0, max_rollbacks: 10 });

    // 备份管理
    $.backupVmId = ref(null);
    $.backupVmName = ref('');
    $.backups = ref([]);
    $.backupCreating = ref(false);
    $.backupDeleting = ref(false);
    $.backupSelected = ref(new Set());
    $.backupForm = ref({ storage: 'local', notes: '' });
    $.backupLimits = ref({ current: 0, max_per_vm: 3, today_creates: 0, daily_limit: 3 });

    // ==================== computed ====================
    $.confirmActionText = computed(function() {
        var msgs = {
            shutdown: '这将发送 ACPI 关机信号，安全关闭虚拟机操作系统。',
            reboot: '虚拟机将重新启动，未保存的数据可能会丢失。',
            stop: '将立即强制停止虚拟机，等同于直接断电，未保存的数据将会丢失。'
        };
        return msgs[$.confirmState.value.action] || '';
    });

    $.isSnapshotNameValid = computed(function() {
        var name = $.snapshotForm.value.name;
        return name.length >= 2 && name.length <= 20 && /^[a-zA-Z0-9\-_]+$/.test(name);
    });

    $.isAllSnapshotsSelected = computed(function() {
        return $.snapshots.value.length > 0 && $.snapshots.value.every(function(s) { return $.snapshotSelected.value.has(s.name); });
    });

    $.isAnySnapshotSelected = computed(function() {
        return $.snapshotSelected.value.size > 0;
    });

    $.isAllBackupsSelected = computed(function() {
        return $.backups.value.length > 0 && $.backups.value.filter(function(b) { return b.status !== 'running' && b.status !== 'pending'; }).every(function(b) { return $.backupSelected.value.has(b.id); });
    });

    $.isAnyBackupSelected = computed(function() {
        return $.backupSelected.value.size > 0;
    });

    // ==================== 函数 ====================
    $.requestConfirm = function(vmId, action) {
        $.confirmState.value = { vmId: vmId, action: action };
    };

    $.cancelConfirm = function() {
        $.confirmState.value = { vmId: null, action: null };
    };

    $.confirmAction = function(vm) {
        var action = $.confirmState.value.action;
        if (action === 'shutdown') $.shutdownVm(vm.vm_id);
        else if (action === 'reboot') $.rebootVm(vm.vm_id);
        else if (action === 'stop') $.stopVm(vm.vm_id);
    };

    // 操作冷却期（ms），防止重复点击导致 PVE 卡死
    var VM_OP_COOLDOWN = 8000;
    function vmIsOperating(vmid) {
        var t = $.vmOpTimestamps.value.get(vmid);
        if (!t) return false;
        if (Date.now() - t > VM_OP_COOLDOWN) { var m = new Map($.vmOpTimestamps.value); m.delete(vmid); $.vmOpTimestamps.value = m; return false; }
        return true;
    }
    function vmMarkOperating(vmid) { var m = new Map($.vmOpTimestamps.value); m.set(vmid, Date.now()); $.vmOpTimestamps.value = m; }

    $.startVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert('虚拟机正在操作中，请勿重复点击！');
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/start', { method: 'POST' });
            await $.loadData();
        } catch (e) { alert(e.message); }
    };

    $.shutdownVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert('虚拟机正在操作中，请勿重复点击！');
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/shutdown', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
            setTimeout(function() { $.loadData(); }, 4000);
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

    $.stopVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert('虚拟机正在操作中，请勿重复点击！');
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/stop', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
            setTimeout(function() { $.loadData(); }, 2000);
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

    $.rebootVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert('虚拟机正在操作中，请勿重复点击！');
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/reboot', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

    $.openVncConsole = async function(vmid) {
        try {
            var data = await api('/vm/' + vmid + '/vnc', { method: 'POST' });
            window.open(data.proxyUrl, '_blank');
        } catch (e) {
            alert('打开 VNC 控制台失败：' + e.message);
        }
    };

    $.editVm = function(vm) {
        $.editVmForm.value = {
            id: vm.id,
            name: vm.name || '',
            expiration_date: formatDateTimeLocal(vm.expiration_date),
            renewal_price: vm.renewal_price || '',
            renewal_period: vm.renewal_period || 'month',
            user_id: vm.user_id || null,
            backup_storage: vm.backup_storage || '',
            mac_group_id: vm.ikuai_mac_group_id || '',
            status: vm.status || null
        };
        $.bsModalShow('editVmModal');
    };

    $.updateVm = async function() {
        try {
            var expDate = toLocalDateTimeStr($.editVmForm.value.expiration_date);
            await api('/user/vms/' + $.editVmForm.value.id, {
                method: 'PUT',
                body: JSON.stringify({
                    name: $.editVmForm.value.name,
                    expiration_date: expDate,
                    renewal_price: $.editVmForm.value.renewal_price,
                    renewal_period: $.editVmForm.value.renewal_period || 'month',
                    user_id: $.editVmForm.value.user_id,
                    backup_storage: $.editVmForm.value.backup_storage || null,
                    mac_group_id: $.editVmForm.value.mac_group_id || null
                })
            });
            $.bsModalHide('editVmModal');
            await $.loadData();
            await $.loadAssignData();
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeVm = async function() {
        if (await window.customConfirm('确定移除此虚拟机分配？')) {
            try {
                await api('/user/vms/' + $.editVmForm.value.id, { method: 'DELETE' });
                $.bsModalHide('editVmModal');
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.removeVmById = async function(id) {
        if (await window.customConfirm('确定移除此虚拟机分配？')) {
            try {
                await api('/user/vms/' + id, { method: 'DELETE' });
                await $.loadData();
                await $.loadAssignData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.openDestroyVmModal = function(vm) {
        $.destroyVmConfirmText.value = '';
        $.destroyVmTarget.value = { vm_id: vm.vm_id, name: vm.name || '' };
        $.bsModalShow('destroyVmModal');
    };

    $.destroyVmConfirmText = ref('');
    $.destroyVmTarget = ref(null);

    $.openDestroyVmConfirm = function() {
        $.destroyVmConfirmText.value = '';
        $.destroyVmTarget.value = $.editVmForm.value;
        $.bsModalShow('destroyVmModal');
    };

    $.confirmDestroyVm = async function() {
        var vm = $.destroyVmTarget.value;
        if (!vm) return;
        $.bsModalHide('destroyVmModal');
        try {
            await api('/vm/' + vm.vm_id + '/destroy', { method: 'POST' });
            $.bsModalHide('editVmModal');
            await $.loadData();
            await $.loadAssignData();
            alert('虚拟机已销毁');
        } catch (e) {
            alert(e.message);
        }
    };

    $.assignVm = async function() {
        try {
            var expDate = toLocalDateTimeStr($.assignForm.value.expiration_date);
            await api('/user/vms', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, $.assignForm.value, { expiration_date: expDate }))
            });
            $.assignForm.value = { vm_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', mac_group_id: '' };
            $.loadData();
            $.loadAssignData();
        } catch (e) {
            alert(e.message);
        }
    };

    $.checkExpired = async function() {
        try {
            await api('/check-expired', { method: 'POST' });
            alert('检查完成');
            $.loadData();
        } catch (e) {
            alert(e.message);
        }
    };

    // ==================== 快照管理 ====================
    $.filterSnapshotName = function() {
        var name = $.snapshotForm.value.name.replace(/[^a-zA-Z0-9\-_]/g, '');
        if (name.length > 20) name = name.slice(0, 20);
        $.snapshotForm.value.name = name;
    };

    $.formatSnapshotDate = function(dateStr) {
        if (!dateStr) return '-';
        if (typeof dateStr === 'number' || /^\d{10}$/.test(dateStr)) {
            var d = new Date(Number(dateStr) * 1000);
            if (isNaN(d.getTime())) return dateStr;
            var year = d.getFullYear();
            var month = String(d.getMonth() + 1).padStart(2, '0');
            var day = String(d.getDate()).padStart(2, '0');
            var hours = String(d.getHours()).padStart(2, '0');
            var minutes = String(d.getMinutes()).padStart(2, '0');
            var seconds = String(d.getSeconds()).padStart(2, '0');
            return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
        }
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        var year = d.getFullYear();
        var month = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        var hours = String(d.getHours()).padStart(2, '0');
        var minutes = String(d.getMinutes()).padStart(2, '0');
        var seconds = String(d.getSeconds()).padStart(2, '0');
        return year + '-' + month + '-' + day + ' ' + hours + ':' + minutes + ':' + seconds;
    };

    $.loadSnapshots = async function(vmid) {
        $.snapshotLoading.value = true;
        try {
            var data = await api('/vm/' + vmid + '/snapshots');
            $.snapshots.value = data.snapshots || [];
            $.snapshotLimits.value = {
                current: data.snapshots ? data.snapshots.length : 0,
                max: data.max_per_vm || 5,
                today_creates: data.today_created || 0,
                max_creates: data.daily_create_limit || 20,
                today_rollbacks: data.today_restored || 0,
                max_rollbacks: data.daily_restore_limit || 10
            };
        } catch (e) {
            alert('获取快照列表失败：' + e.message);
            $.snapshots.value = [];
        } finally {
            $.snapshotLoading.value = false;
        }
    };

    $.openSnapshotPanel = async function(vm) {
        $.snapshotVmId.value = vm.vm_id;
        $.snapshotVmName.value = vm.name || 'VM ' + vm.vm_id;
        $.snapshotVmRunning.value = vm.status && vm.status.status === 'running';
        $.snapshotForm.value = { name: '', description: '' };
        $.snapshotSelected.value = new Set();
        $.bsModalShow('snapshotModal');
        await $.loadSnapshots(vm.vm_id);
    };

    $.toggleSnapshotSelect = function(name) {
        var s = new Set($.snapshotSelected.value);
        if (s.has(name)) { s.delete(name); } else { s.add(name); }
        $.snapshotSelected.value = s;
    };

    $.toggleSelectAllSnapshots = function() {
        if ($.isAllSnapshotsSelected.value) {
            $.snapshotSelected.value = new Set();
        } else {
            $.snapshotSelected.value = new Set($.snapshots.value.map(function(s) { return s.name; }));
        }
    };

    $.batchDeleteSnapshots = async function(vmid) {
        var names = Array.from($.snapshotSelected.value);
        if (names.length === 0) return;
        $.bsModalHide('snapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要批量删除 ' + names.length + ' 个快照吗？此操作不可恢复。')) {
            $.bsModalShow('snapshotModal');
            return;
        }
        $.snapshotDeleting.value = true;
        try {
            await Promise.all(names.map(function(name) {
                return api('/vm/' + vmid + '/snapshots/' + encodeURIComponent(name), { method: 'DELETE' });
            }));
            $.snapshotSelected.value = new Set();
            await $.loadSnapshots(vmid);
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('成功删除 ' + names.length + ' 个快照');
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('批量删除失败：' + e.message);
            await $.loadSnapshots(vmid);
        } finally {
            $.snapshotDeleting.value = false;
        }
    };

    $.createSnapshot = async function(vmid) {
        if (!$.isSnapshotNameValid.value) return;
        $.snapshotCreating.value = true;
        try {
            await api('/vm/' + vmid + '/snapshots', {
                method: 'POST',
                body: JSON.stringify({
                    name: $.snapshotForm.value.name,
                    description: $.snapshotForm.value.description || ''
                })
            });
            $.snapshotForm.value = { name: '', description: '' };
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照创建成功');
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('创建快照失败：' + e.message);
        } finally {
            $.snapshotCreating.value = false;
        }
    };

    $.rollbackSnapshot = async function(vmid, snapname) {
        $.bsModalHide('snapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要回滚到快照「' + snapname + '」吗？\n此操作将恢复虚拟机磁盘到该快照的状态，运行中的数据可能丢失。')) {
            $.bsModalShow('snapshotModal');
            return;
        }
        try {
            await api('/vm/' + vmid + '/snapshots/' + encodeURIComponent(snapname) + '/rollback', { method: 'POST' });
            await $.loadSnapshots(vmid);
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照回滚成功');
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('回滚快照失败：' + e.message);
        }
    };

    $.deleteSnapshot = async function(vmid, snapname) {
        $.bsModalHide('snapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要删除快照「' + snapname + '」吗？此操作不可恢复。')) {
            $.bsModalShow('snapshotModal');
            return;
        }
        try {
            await api('/vm/' + vmid + '/snapshots/' + encodeURIComponent(snapname), { method: 'DELETE' });
            await $.loadSnapshots(vmid);
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('快照删除成功');
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除快照失败：' + e.message);
        }
    };

    // ==================== 备份管理 ====================
    $.loadBackups = async function(vmid) {
        try {
            var res = await api('/vm/' + vmid + '/backups');
            $.backups.value = res.backups || [];
            if (res.limits) {
                $.backupLimits.value = res.limits;
            } else {
                $.backupLimits.value = {
                    current: $.backups.value.filter(function(b) { return b.status !== 'failed'; }).length,
                    max_per_vm: $.backupConfigForm.value.max_per_vm || 3,
                    today_creates: 0,
                    daily_limit: $.backupConfigForm.value.daily_limit || 3
                };
            }
        } catch (e) {
            $.backups.value = [];
        }
    };

    $.openBackupPanel = async function(vm) {
        $.backupVmId.value = vm.vm_id;
        $.backupVmName.value = vm.name || 'VM ' + vm.vm_id;
        $.backupForm.value = { storage: $.storageList.value.length > 0 ? $.storageList.value[0].id : 'local', notes: '' };
        $.backupSelected.value = new Set();
        $.bsModalShow('backupModal');
        await $.loadStorageList();
        await $.loadBackups(vm.vm_id);
    };

    $.toggleBackupSelect = function(id) {
        var s = new Set($.backupSelected.value);
        if (s.has(id)) s.delete(id); else s.add(id);
        $.backupSelected.value = s;
    };

    $.toggleSelectAllBackups = function() {
        if ($.isAllBackupsSelected.value) {
            $.backupSelected.value = new Set();
        } else {
            $.backupSelected.value = new Set($.backups.value.filter(function(b) { return b.status !== 'running' && b.status !== 'pending'; }).map(function(b) { return b.id; }));
        }
    };

    $.createBackup = async function(vmid) {
        if ($.backupCreating.value) return;
        $.backupCreating.value = true;
        try {
            await api('/vm/' + vmid + '/backups', {
                method: 'POST',
                body: JSON.stringify({ notes: $.backupForm.value.notes, storage: $.backupForm.value.storage })
            });
            $.backupForm.value = { storage: $.storageList.value.length > 0 ? $.storageList.value[0].id : 'local', notes: '' };
            await $.loadBackups(vmid);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('备份任务已创建，完成后将通过站内信和邮件通知您');
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        } finally {
            $.backupCreating.value = false;
        }
    };

    $.deleteBackup = async function(id) {
        $.bsModalHide('backupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要删除此备份吗？此操作不可恢复。')) {
            $.bsModalShow('backupModal');
            return;
        }
        try {
            await api('/backups/' + id, { method: 'DELETE' });
            await $.loadBackups($.backupVmId.value);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('备份已删除');
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('删除备份失败：' + e.message);
        }
    };

    $.restoreBackup = async function(backup) {
        $.bsModalHide('backupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('即将使用此备份恢复虚拟机 <strong>' + $.backupVmName.value + '</strong>（备份时间：' + formatDate(backup.created_at) + '）。<br><br>恢复将<strong>完全覆盖</strong>当前虚拟机的磁盘数据！<br><span style="color:#ff4444;font-weight:bold">⚠️ 已有的快照将会被清除</span><br><br>请确保虚拟机已关机，否则恢复将失败。<br><br>确认要恢复吗？')) {
            $.bsModalShow('backupModal');
            return;
        }
        try {
            await api('/vm/' + backup.vm_id + '/backups/' + backup.id + '/restore', { method: 'POST' });
            await $.loadBackups($.backupVmId.value);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('恢复任务已创建，完成后将通过站内信和邮件通知您');
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        }
    };

    $.batchDeleteBackups = async function(vmid) {
        var ids = Array.from($.backupSelected.value);
        if (ids.length === 0) return;
        $.bsModalHide('backupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm('确定要批量删除 ' + ids.length + ' 个备份吗？此操作不可恢复。')) {
            $.bsModalShow('backupModal');
            return;
        }
        $.backupDeleting.value = true;
        try {
            await api('/backups/batch-delete', { method: 'POST', body: JSON.stringify({ ids: ids }) });
            $.backupSelected.value = new Set();
            await $.loadBackups(vmid);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('成功删除 ' + ids.length + ' 个备份');
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert('批量删除失败：' + e.message);
        } finally {
            $.backupDeleting.value = false;
        }
    };

    // CDK 兑换
    $.openCdkRedeem = async function() {
        $.cdkRedeemForm.value = { code: '', type: 'vm', resource_id: '' };
        $.cdkRedeemStep.value = 'input';
        $.cdkRedeemError.value = '';
        $.cdkRedeemMessage.value = '';
        $.bsModalShow('cdkRedeemModal');
    };

    $.redeemCdk = async function() {
        try {
            $.cdkRedeemError.value = '';
            var body = { code: $.cdkRedeemForm.value.code };
            if ($.cdkRedeemForm.value.type === 'vm') {
                body.vm_id = $.cdkRedeemForm.value.resource_id;
            } else {
                body.container_id = $.cdkRedeemForm.value.resource_id;
            }
            var data = await api('/user/cdk/redeem', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            $.cdkRedeemStep.value = 'result';
            $.cdkRedeemMessage.value = data.message;
            await $.loadData();
        } catch (e) {
            $.cdkRedeemError.value = e.message;
        }
    };

    // ==================== initVm ====================
    $.selectedVm = ref(null);
    $.vmIpForm = ref({ ip_mode: 'dhcp', ip: '' });
    $.vmIpError = ref('');
    $.vmIpLoading = ref(false);

    $.openResetVmIpModal = function(vm) {
        $.selectedVm.value = vm;
        let currentIp = vm.dhcp_static_ip || '';
        if (!currentIp && vm.config && vm.config.net0) {
            const m = vm.config.net0.match(/ip=([0-9.]+)/);
            if (m) currentIp = m[1];
        }
        $.vmIpForm.value = { ip_mode: currentIp ? 'static' : 'dhcp', ip: currentIp };
        $.vmIpError.value = '';
        $.bsModalShow('resetVmIpModal');
    };

    $.randomVmIp = async function() {
        try {
            var data = await api('/vm/random-ip');
            $.vmIpForm.value.ip = data.ip + '/24';
            $.vmIpForm.value.ip_mode = 'static';
        } catch (e) {
            alert('获取随机 IP 失败：' + e.message);
        }
    };

    $.confirmResetVmIp = async function() {
        var f = $.vmIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) { $.vmIpError.value = '请输入 IP 地址'; return; }
        var vm = $.selectedVm.value;
        if (!vm) return;
        var confirmed = await window.customConfirm('确认修改 VM ' + vm.vm_id + ' 的 IP？');
        if (!confirmed) return;
        await $.resetVmIp();
    };

    $.resetVmIp = async function() {
        var f = $.vmIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) { $.vmIpError.value = '请输入 IP 地址'; return; }
        var vm = $.selectedVm.value;
        if (!vm) return;
        $.vmIpLoading.value = true;
        try {
            var result = await api('/vm/' + vm.vm_id + '/reset-ip', {
                method: 'POST',
                body: JSON.stringify({ ip_mode: f.ip_mode, ip: f.ip })
            });
            $.vmIpLoading.value = false;
            $.bsModalHide('resetVmIpModal');
            alert('IP 重置成功：' + (result.ip || 'DHCP'));
            await $.loadData();
            await $.loadAssignData();
        } catch (e) {
            $.vmIpLoading.value = false;
            $.vmIpError.value = e.message;
        }
    };

    $.initVm = function() {
        watch(function() { return $.activeTabVm.value; }, function(val) {
            if (val === 'network') $.loadForwardRules('vm');
        });
        watch(function() { return $.packagePage.vmProvisionForm.value.package_id; }, function(newVal) {
            if (!newVal) return;
            var pkg = $.packagePage.vmPackages.value.find(function(p) { return String(p.id) === String(newVal); });
            if (pkg) {
                $.assignForm.value.name = pkg.name + '-' + Math.random().toString(36).slice(2, 6);
                $.assignForm.value.renewal_price = pkg.monthly_price;
                var d = new Date(); d.setMonth(d.getMonth() + 1);
                // 使用本地时间格式填充 datetime-local，避免 toISOString() 转换为 UTC
                var y = d.getFullYear();
                var m = String(d.getMonth() + 1).padStart(2, '0');
                var dd = String(d.getDate()).padStart(2, '0');
                var h = String(d.getHours()).padStart(2, '0');
                var mi = String(d.getMinutes()).padStart(2, '0');
                $.assignForm.value.expiration_date = y + '-' + m + '-' + dd + 'T' + h + ':' + mi;
            }
        });
    };
})();
