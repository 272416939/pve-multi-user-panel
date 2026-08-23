(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;

    // ===== 状态 =====
    $.userVms = ref([]);
    $.confirmState = ref({ vmId: null, action: null });
    $.vmOpTimestamps = ref(new Map());
    $.editVmForm = ref({ id: null, name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', user_id: null });
    $.cdkRedeemForm = ref({ code: '', vm_id: '', container_id: '' });
    $.cdkRedeemStep = ref('input');
    $.cdkRedeemError = ref('');
    $.cdkRedeemMessage = ref('');
    $.cdkRedeemType = ref('vm');
    $.cdkVmDropdownOpen = ref(false);

    // Snapshot 状态
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

    // Backup 状态
    $.backupVmId = ref(null);
    $.backupVmName = ref('');
    $.backups = ref([]);
    $.backupCreating = ref(false);
    $.backupDeleting = ref(false);
    $.backupSelected = ref(new Set());
    $.backupForm = ref({ notes: '' });
    $.backupLimits = ref({ current: 0, max_per_vm: 3, today_creates: 0, daily_limit: 3 });

    // 重置 IP 状态（私有网络：随机 IP 取自绑定的子网 IP 池）
    $.vmIpForm = ref({ ip_mode: 'dhcp', ip: '' });
    $.vmIpError = ref('');
    $.vmIpLoading = ref(false);
    $.resetVmIpVm = ref(null); // 重置 IP 当前操作的虚拟机对象（含 subnet_id）

    // ===== Computed =====
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

    $.confirmActionText = computed(function() {
        var msgs = {
            shutdown: window.__i18n.t('dash.vm.shutdownHint'),
            reboot: window.__i18n.t('dash.vm.rebootHint'),
            stop: window.__i18n.t('dash.vm.stopHint')
        };
        return msgs[$.confirmState.value.action] || '';
    });

    // ===== VM 操作函数 =====
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
        if (vmIsOperating(vmid)) return alert(window.__i18n.t('dash.vm.opBusy'));
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/start', { method: 'POST' });
            await $.loadData();
        } catch (e) { alert(e.message); }
    };

    $.shutdownVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert(window.__i18n.t('dash.vm.opBusy'));
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/shutdown', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
            setTimeout(function() { $.loadData(); }, 4000);
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

    $.stopVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert(window.__i18n.t('dash.vm.opBusy'));
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/stop', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
            setTimeout(function() { $.loadData(); }, 2000);
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

    $.rebootVm = async function(vmid) {
        if (vmIsOperating(vmid)) return alert(window.__i18n.t('dash.vm.opBusy'));
        vmMarkOperating(vmid);
        try {
            await api('/vm/' + vmid + '/reboot', { method: 'POST' });
            $.confirmState.value = { vmId: null, action: null };
            await $.loadData();
        } catch (e) { $.confirmState.value = { vmId: null, action: null }; alert(e.message); }
    };

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

    $.openVncConsole = async function(vmid) {
        try {
            var data = await api('/vm/' + vmid + '/vnc', { method: 'POST' });
            window.open(data.proxyUrl, '_blank');
        } catch (e) {
            alert(window.__i18n.tFormat('dash.vm.vncOpenFailed', e.message));
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
            mac_group_id: vm.ikuai_mac_group_id != null ? String(vm.ikuai_mac_group_id) : ''
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
                    renewal_period: $.editVmForm.value.renewal_period,
                    user_id: $.editVmForm.value.user_id,
                    mac_group_id: $.editVmForm.value.mac_group_id || null
                })
            });
            $.bsModalHide('editVmModal');
            await $.loadData();
        } catch (e) {
            alert(e.message);
        }
    };

    $.removeVm = async function() {
        if (await window.customConfirm(window.__i18n.t('dash.vm.removeConfirm'))) {
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
        if (await window.customConfirm(window.__i18n.t('dash.vm.removeConfirm'))) {
            try {
                await api('/user/vms/' + id, { method: 'DELETE' });
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    // ===== CDK 兑换 =====
    $.openCdkRedeem = async function() {
        $.cdkRedeemForm.value = { code: '', vm_id: '', container_id: '' };
        $.cdkRedeemType.value = 'vm';
        $.cdkRedeemStep.value = 'input';
        $.cdkRedeemError.value = '';
        $.cdkRedeemMessage.value = '';
        $.bsModalShow('cdkRedeemModal');
        // modal 关闭时清理 CDK 下拉状态（Teleport 到 body 的下拉不会随 modal 一起隐藏）
        var modalEl = document.getElementById('cdkRedeemModal');
        if (modalEl && !modalEl._cdkCleanupBound) {
            modalEl._cdkCleanupBound = true;
            modalEl.addEventListener('hidden.bs.modal', function() {
                if ($.cdkVmDropdownOpen.value) $.toggleCdkDropdown('vm', false);
                if ($.cdkLxcDropdownOpen.value) $.toggleCdkDropdown('lxc', false);
            });
        }
    };

    $.redeemCdk = async function() {
        try {
            $.cdkRedeemError.value = '';
            var body = {
                code: $.cdkRedeemForm.value.code
            };
            if ($.cdkRedeemType.value === 'vm') {
                body.vm_id = $.cdkRedeemForm.value.vm_id;
            } else {
                body.container_id = $.cdkRedeemForm.value.container_id;
            }
            var data = await api('/user/cdk/redeem', {
                method: 'POST',
                body: JSON.stringify(body)
            });
            $.cdkRedeemStep.value = 'result';
            $.cdkRedeemMessage.value = data.message;
            await $.loadData();
            await $.loadLxcContainers();
        } catch (e) {
            $.cdkRedeemError.value = e.message;
        }
    };

    $.getRedeemableVmName = function(vmId) {
        var vm = $.userVms.value.find(function(v) { return v.id == vmId; });
        if (!vm) return '';
        var exp = vm.expiration_date ? formatDate(vm.expiration_date) : window.__i18n.t('dash.unset');
        var remain = vm.expiration_date ? $.daysUntilExpire(vm.expiration_date) : '';
        return (vm.name || 'VM ' + vm.vm_id) + window.__i18n.tFormat('dash.expiryLabel', exp, remain);
    };

    // ===== Snapshot 函数 =====
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
        var d2 = new Date(dateStr);
        if (isNaN(d2.getTime())) return dateStr;
        var year2 = d2.getFullYear();
        var month2 = String(d2.getMonth() + 1).padStart(2, '0');
        var day2 = String(d2.getDate()).padStart(2, '0');
        var hours2 = String(d2.getHours()).padStart(2, '0');
        var minutes2 = String(d2.getMinutes()).padStart(2, '0');
        var seconds2 = String(d2.getSeconds()).padStart(2, '0');
        return year2 + '-' + month2 + '-' + day2 + ' ' + hours2 + ':' + minutes2 + ':' + seconds2;
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
            alert(window.__i18n.tFormat('dash.snap.loadFailed', e.message));
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
        if (s.has(name)) {
            s.delete(name);
        } else {
            s.add(name);
        }
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
        if (!await window.customConfirm(window.__i18n.tFormat('dash.snap.batchDeleteConfirm', names.length))) {
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
            alert(window.__i18n.tFormat('dash.snap.batchDeleted', names.length));
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.tFormat('dash.snap.batchDeleteFailed', e.message));
            await $.loadSnapshots(vmid);
        } finally {
            $.snapshotDeleting.value = false;
        }
    };

    $.createSnapshot = async function(vmid) {
        $.snapshotCreating.value = true;
        try {
            await api('/vm/' + vmid + '/snapshots', {
                method: 'POST',
                body: JSON.stringify({
                    description: $.snapshotForm.value.description || ''
                })
            });
            $.snapshotForm.value = { name: '', description: '' };
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.created'));
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.tFormat('dash.snap.createFailed', e.message));
        } finally {
            $.snapshotCreating.value = false;
        }
    };

    $.rollbackSnapshot = async function(vmid, snapname) {
        $.bsModalHide('snapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.tFormat('dash.snap.rollbackVmConfirm', snapname))) {
            $.bsModalShow('snapshotModal');
            return;
        }
        try {
            await api('/vm/' + vmid + '/snapshots/' + encodeURIComponent(snapname) + '/rollback', { method: 'POST' });
            await $.loadSnapshots(vmid);
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.rollbackOk'));
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.tFormat('dash.snap.rollbackFailed', e.message));
        }
    };

    $.deleteSnapshot = async function(vmid, snapname) {
        $.bsModalHide('snapshotModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.tFormat('dash.snap.deleteConfirm', snapname))) {
            $.bsModalShow('snapshotModal');
            return;
        }
        try {
            await api('/vm/' + vmid + '/snapshots/' + encodeURIComponent(snapname), { method: 'DELETE' });
            await $.loadSnapshots(vmid);
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.deleted'));
        } catch (e) {
            $.bsModalHide('snapshotModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.tFormat('dash.snap.deleteFailed', e.message));
        }
    };

    // ===== Backup 函数 =====
    $.loadBackups = async function(vmid) {
        try {
            var res = await api('/vm/' + vmid + '/backups');
            $.backups.value = res.backups || [];
            if (res.limits) {
                $.backupLimits.value = res.limits;
            } else {
                $.backupLimits.value = { current: $.backups.value.filter(function(b) { return b.status !== 'failed'; }).length, max_per_vm: 3, today_creates: 0, daily_limit: 3 };
            }
        } catch (e) {
            $.backups.value = [];
        }
    };

    $.openBackupPanel = async function(vm) {
        $.backupVmId.value = vm.vm_id;
        $.backupVmName.value = vm.name || 'VM ' + vm.vm_id;
        $.backupForm.value = { notes: '' };
        $.backupSelected.value = new Set();
        $.bsModalShow('backupModal');
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
            await api('/vm/' + vmid + '/backups', { method: 'POST', body: JSON.stringify({ notes: $.backupForm.value.notes }) });
            $.backupForm.value = { notes: '' };
            await $.loadBackups(vmid);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            // 立即刷新 VM 列表，让「备份中」徽标即时展示并锁定操作按钮
            if (typeof $.loadData === 'function') { $.loadData(); }
            alert(window.__i18n.t('dash.backup.taskCreated'));
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
        if (!await window.customConfirm(window.__i18n.t('dash.backup.deleteConfirm'))) {
            $.bsModalShow('backupModal');
            return;
        }
        try {
            await api('/backups/' + id, { method: 'DELETE' });
            await $.loadBackups($.backupVmId.value);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.backup.deleted'));
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.backup.deleteFailed') + e.message);
        }
    };

    $.batchDeleteBackups = async function(vmid) {
        var ids = Array.from($.backupSelected.value);
        if (ids.length === 0) return;
        $.bsModalHide('backupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('common.batchDeleteConfirm1') + ids.length + window.__i18n.t('dash.backup.batchSuffix'))) {
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
            alert(window.__i18n.t('common.deletedPrefix') + ids.length + window.__i18n.t('dash.backup.countSuffix'));
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            alert(window.__i18n.t('dash.snap.batchDeleteFailed') + e.message);
        } finally {
            $.backupDeleting.value = false;
        }
    };

    $.restoreBackup = async function(backup) {
        $.bsModalHide('backupModal');
        await new Promise(function(r) { setTimeout(r, 300); });
        if (!await window.customConfirm(window.__i18n.t('dash.restore.vmConfirm1') + $.backupVmName.value + window.__i18n.t('dash.restore.timeMid') + formatDate(backup.created_at) + window.__i18n.t('dash.restore.vmConfirmOff'))) {
            $.bsModalShow('backupModal');
            return;
        }
        try {
            await api('/vm/' + backup.vm_id + '/backups/' + backup.id + '/restore', { method: 'POST' });
            await $.loadBackups($.backupVmId.value);
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            // 立即刷新 VM 列表，让「恢复中」徽标即时展示并锁定操作按钮
            if (typeof $.loadData === 'function') { $.loadData(); }
            alert(window.__i18n.t('dash.restore.taskCreated'));
        } catch (e) {
            $.bsModalHide('backupModal');
            await new Promise(function(r) { setTimeout(r, 300); });
            await $.showAlertAndWait(e.message);
        }
    };

    // ===== CDK 下拉定位（Teleport 到 body + position:fixed + 动态 z-index）=====
    $.toggleCdkDropdown = function(type, open) {
        // 关闭另一个下拉（如果开着）
        var otherOpen = type === 'vm' ? $.cdkLxcDropdownOpen : $.cdkVmDropdownOpen;
        if (otherOpen.value) {
            var otherDropdown = document.querySelector('[data-cdk-dropdown="' + (type === 'vm' ? 'lxc' : 'vm') + '"]');
            if (otherDropdown) window.closeFixedDropdownAnimated(otherDropdown, function() { otherOpen.value = false; });
            else otherOpen.value = false;
        }

        var openRef = type === 'vm' ? $.cdkVmDropdownOpen : $.cdkLxcDropdownOpen;
        if (!open) {
            var dropdown = document.querySelector('[data-cdk-dropdown="' + type + '"]');
            if (dropdown) window.closeFixedDropdownAnimated(dropdown, function() { openRef.value = false; });
            else openRef.value = false;
        } else {
            openRef.value = true;
            Vue.nextTick(function() {
                var trigger = document.querySelector('[data-cdk-select="' + type + '"]');
                var dropdown = document.querySelector('[data-cdk-dropdown="' + type + '"]');
                if (dropdown && window.ModalZIndexManager) {
                    var z = window.ModalZIndexManager.acquire();
                    dropdown._dropdownZIndex = z;
                    dropdown.style.zIndex = z;
                }
                requestAnimationFrame(function() {
                    if (trigger && dropdown && window.positionFixedDropdown) {
                        window.positionFixedDropdown(trigger, dropdown);
                    }
                });
            });
        }
    };

    // ===== VM 重置 IP（私有网络：必须绑定子网，随机 IP 取自子网 IP 池）=====
    $.openResetVmIpModal = function(vm) {
        // 私有网络：重置 IP 必须先绑定子网
        if (!vm.subnet_id) {
            alert(window.__i18n.t('dash.resetIp.needSubnetVm'));
            return;
        }
        $.resetVmIpVm.value = vm;
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
        var vm = $.resetVmIpVm.value;
        if (!vm) return;
        // 私有网络：随机 IP 从当前虚拟机绑定的子网 IP 池选取
        if (!vm.subnet_id) {
            alert(window.__i18n.t('dash.randomIp.needSubnetVm'));
            return;
        }
        try {
            var data = await api('/vm/random-ip?subnet_id=' + vm.subnet_id);
            $.vmIpForm.value.ip = data.ip + '/24';
            $.vmIpForm.value.ip_mode = 'static';
        } catch (e) {
            alert(window.__i18n.t('dash.randomIp.failed') + e.message);
        }
    };

    $.confirmResetVmIp = async function() {
        var f = $.vmIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) { $.vmIpError.value = window.__i18n.t('dash.ipRequired'); return; }
        var vm = $.resetVmIpVm.value;
        if (!vm) return;
        var confirmed = await window.customConfirm(window.__i18n.t('dash.resetIp.confirmVm1') + vm.vm_id + window.__i18n.t('dash.resetIp.ipTailHint'));
        if (!confirmed) return;
        await $.resetVmIp();
    };

    $.resetVmIp = async function() {
        var f = $.vmIpForm.value;
        if (f.ip_mode === 'static' && !f.ip) { $.vmIpError.value = window.__i18n.t('dash.ipRequired'); return; }
        var vm = $.resetVmIpVm.value;
        if (!vm) return;
        $.vmIpLoading.value = true;
        try {
            var result = await api('/vm/' + vm.vm_id + '/reset-ip', {
                method: 'POST',
                body: JSON.stringify({ ip_mode: f.ip_mode, ip: f.ip })
            });
            $.vmIpLoading.value = false;
            $.bsModalHide('resetVmIpModal');
            alert(window.__i18n.t('dash.resetIp.ipOk') + (result.ip || 'DHCP'));
            if (typeof $.loadData === 'function') { $.loadData(); }
        } catch (e) {
            $.vmIpLoading.value = false;
            $.vmIpError.value = e.message;
        }
    };

    // ===== initVm =====
    $.initVm = function() {
        // 无额外 watch 或生命周期逻辑
    };
})();
