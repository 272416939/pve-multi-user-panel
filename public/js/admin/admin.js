(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;

    // ==================== 状态 ====================
    $.users = ref([]);
    $.showCreateUser = ref(false);
    $.createUserForm = ref({ username: '', password: '', role: 'user', email: '', emailVerified: false });
    $.editUserForm = ref({ id: null, username: '', password: '', role: 'user', email: '', emailVerified: false, totp_enabled: false });
    $.assignForm = ref({ vm_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', mac_group_id: '' });
    $.smtpConfig = ref({ host: '', port: 587, secure: false, user: '', password: '', from: '', enabled: false });
    $.reminderConfig = ref({ days1: 7, days2: 3, days3: 1 });
    $.snapshotConfig = ref({ max_per_vm: 5, daily_create_limit: 20, daily_restore_limit: 10 });
    $.storageList = ref([]);
    $.backupConfigForm = ref({ default_storage: 'local', max_per_vm: 3, daily_limit: 3 });
    $.testEmail = ref('');
    $.cdkList = ref([]);
    $.cdkForm = ref({ duration_days: 30, count: 1, expires_at: '' });
    $.cdkResult = ref([]);
    $.cdkResultBatchId = ref('');
    $.cdkSelectedUsers = ref([]);
    $.cdkUserSearch = ref('');
    $.cdkUserSearchOpen = ref(false);
    $.selectedCdkIds = ref([]);
    $.rechargeShow = ref(false);
    $.rechargeUser = ref(null);
    $.rechargeAmount = ref(0);
    $.rechargeError = ref('');

    $.filteredUsers = computed(function() {
        var q = $.cdkUserSearch.value.toLowerCase().trim();
        if (!q) return [];
        return $.users.value.filter(function(u) { return u.username.toLowerCase().includes(q); });
    });

    $.addCdkUser = function(user) {
        if (!$.cdkSelectedUsers.value.find(function(u) { return u.id === user.id; })) {
            $.cdkSelectedUsers.value.push({ id: user.id, username: user.username });
        }
        $.cdkUserSearch.value = '';
    };

    $.handleCdkSearchBackspace = function(e) {
        if (!$.cdkUserSearch.value && $.cdkSelectedUsers.value.length) {
            e.preventDefault();
            $.cdkSelectedUsers.value.pop();
        }
    };

    $.handleCdkSearchBlur = function() {
        setTimeout(function() { $.cdkUserSearchOpen.value = false; }, 200);
    };

    $.adminMsgForm = ref({ scope: 'all', uids: [], type: '1', title: '', content: '', link_url: '' });
    $.adminSending = ref(false);

    // 消息管理 - 标签输入框
    $.msgSelectedUsers = ref([]);
    $.msgUserSearch = ref('');
    $.msgUserSearchOpen = ref(false);

    $.filteredMsgUsers = computed(function() {
        var q = $.msgUserSearch.value.toLowerCase().trim();
        if (!q) return [];
        return $.users.value.filter(function(u) { return u.username.toLowerCase().includes(q) && !$.msgSelectedUsers.value.find(function(s) { return s.id === u.id; }); });
    });

    $.addMsgUser = function(user) {
        if (!$.msgSelectedUsers.value.find(function(u) { return u.id === user.id; })) {
            $.msgSelectedUsers.value.push({ id: user.id, username: user.username });
        }
        $.msgUserSearch.value = '';
    };

    $.handleMsgSearchBackspace = function(e) {
        if (!$.msgUserSearch.value && $.msgSelectedUsers.value.length) {
            e.preventDefault();
            $.msgSelectedUsers.value.pop();
        }
    };

    $.handleMsgSearchBlur = function() {
        setTimeout(function() { $.msgUserSearchOpen.value = false; }, 200);
    };

    // CDK 兑换相关
    $.cdkRedeemForm = ref({ code: '', type: 'vm', resource_id: '' });
    $.cdkRedeemStep = ref('input');
    $.cdkRedeemError = ref('');
    $.cdkRedeemMessage = ref('');
    $.cdkVmDropdownOpen = ref(false);

    // 爱快 MAC 分组列表
    $.macGroups = ref([]);
    $.loadMacGroups = async function() {
        try {
            $.macGroups.value = await api('/ikuai/mac-groups');
        } catch (e) {
            $.macGroups.value = [];
        }
    };

    // ==================== 函数 ====================
    // 用户管理
    $.createUser = async function() {
        try {
            await api('/users', {
                method: 'POST',
                body: JSON.stringify($.createUserForm.value)
            });
            $.createUserForm.value = { username: '', password: '', role: 'user', email: '', emailVerified: false };
            await $.loadData();
            $.bsModalHide('createUserModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.deleteUser = async function(id) {
        if (await window.customConfirm('确定删除此用户？')) {
            try {
                await api('/users/' + id, { method: 'DELETE' });
                $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.editUser = function(u) {
        $.editUserForm.value = {
            id: u.id,
            username: u.username,
            password: '',
            role: u.role,
            email: u.email || '',
            emailVerified: u.emailVerified || false,
            totp_enabled: u.totp_enabled || false
        };
        $.bsModalShow('editUserModal');
    };

    $.updateUser = async function() {
        try {
            var updateData = {
                username: $.editUserForm.value.username,
                role: $.editUserForm.value.role,
                email: $.editUserForm.value.email,
                emailVerified: $.editUserForm.value.emailVerified
            };
            if ($.editUserForm.value.password) {
                updateData.password = $.editUserForm.value.password;
            }
            await api('/users/' + $.editUserForm.value.id, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            $.editUserForm.value = { id: null, username: '', password: '', role: 'user', email: '', emailVerified: false, totp_enabled: false };
            await $.loadData();
            $.bsModalHide('editUserModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.disableUser2fa = async function(userId) {
        if (!(await window.customConfirm('确定禁用此用户的 2FA 二次验证？'))) return;
        try {
            await api('/admin/user/' + userId + '/disable-2fa', { method: 'POST' });
            $.editUserForm.value.totp_enabled = false;
            await $.loadData();
            alert('2FA 已禁用');
        } catch (e) {
            alert(e.message);
        }
    };

    // SMTP 管理
    $.saveSmtpConfig = async function() {
        try {
            await api('/admin/smtp', {
                method: 'PUT',
                body: JSON.stringify($.smtpConfig.value)
            });
            alert('配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    $.testSmtpConfig = async function() {
        $.bsModalShow('testEmailModal');
    };

    $.sendTestEmail = async function() {
        try {
            await api('/admin/smtp/test', {
                method: 'POST',
                body: JSON.stringify({ testEmail: $.testEmail.value })
            });
            alert('测试邮件已发送');
            $.bsModalHide('testEmailModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.saveReminderConfig = async function() {
        try {
            await api('/admin/reminder', {
                method: 'PUT',
                body: JSON.stringify($.reminderConfig.value)
            });
            alert('配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // 快照配置
    $.loadSnapshotConfig = async function() {
        try {
            var data = await api('/admin/snapshot-config');
            if (data) {
                $.snapshotConfig.value = Object.assign({ max_per_vm: 5, daily_create_limit: 20, daily_restore_limit: 10 }, data);
            }
        } catch (e) {
            console.error('加载快照配置失败', e);
        }
    };

    $.saveSnapshotConfig = async function() {
        try {
            await api('/admin/snapshot-config', {
                method: 'PUT',
                body: JSON.stringify($.snapshotConfig.value)
            });
            alert('快照配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // 存储列表
    $.loadStorageList = async function() {
        try {
            var data = await api('/admin/storage');
            $.storageList.value = data || [];
            if ($.storageList.value.length > 0 && !$.backupForm.value.storage) {
                $.backupForm.value.storage = $.storageList.value[0].id;
            }
        } catch (e) {
            console.error('加载存储列表失败', e);
        }
    };

    // 备份配置
    $.loadBackupConfig = async function() {
        try {
            var data = await api('/admin/backup-config');
            if (data) {
                $.backupConfigForm.value = Object.assign({ default_storage: 'local', max_per_vm: 3, daily_limit: 3 }, data);
            }
        } catch (e) {
            console.error('加载备份配置失败', e);
        }
    };

    $.saveBackupConfig = async function() {
        try {
            await api('/admin/backup-config', {
                method: 'PUT',
                body: JSON.stringify($.backupConfigForm.value)
            });
            alert('备份配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // CDK 管理
    $.generateCdkBatch = async function() {
        try {
            var expires = null;
            if ($.cdkForm.value.expires_at) {
                expires = new Date($.cdkForm.value.expires_at.replace('T', ' ')).toISOString();
            }
            var result = await api('/admin/cdk/batch-generate', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, $.cdkForm.value, {
                    target_user_ids: $.cdkSelectedUsers.value.length > 0 ? $.cdkSelectedUsers.value.map(function(u) { return u.id; }) : null,
                    expires_at: expires
                }))
            });
            $.cdkResult.value = result.codes;
            $.cdkResultBatchId.value = result.batch_id;
            $.cdkSelectedUsers.value = [];
            $.cdkUserSearch.value = '';
            $.bsModalShow('cdkResultModal');
            $.loadData();
        } catch (e) {
            alert(e.message);
        }
    };

    $.copyCdkCode = function(code) {
        navigator.clipboard.writeText(code);
        alert('已复制');
    };

    $.copyBatchCodes = async function() {
        var codes = $.cdkResult.value.map(function(c) { return c.code; }).join('\n');
        await navigator.clipboard.writeText(codes);
        alert('已复制全部兑换码');
    };

    $.exportCdkCsv = async function(batchId) {
        try {
            var token = localStorage.getItem('token');
            var url = '/api/admin/cdk/export';
            if (batchId) url += '?batch_id=' + batchId;
            var response = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!response.ok) {
                var data = await response.json();
                throw new Error(data.error || '导出失败');
            }
            var blob = await response.blob();
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'cdk-codes-' + Date.now() + '.csv';
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (e) {
            alert(e.message);
        }
    };

    $.cleanupCdk = async function() {
        if (await window.customConfirm('确定要清理所有已使用和已过期的 CDK 吗？')) {
            try {
                await api('/admin/cdk/cleanup', { method: 'POST' });
                alert('清理完成');
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.deleteCdk = async function(id) {
        if (await window.customConfirm('确定要删除这个 CDK 吗？')) {
            try {
                await api('/admin/cdk/' + id, { method: 'DELETE' });
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.batchDeleteCdk = async function() {
        var ids = $.selectedCdkIds.value;
        if (ids.length === 0) return;
        if (await window.customConfirm('确定要删除选中的 ' + ids.length + ' 个 CDK 吗？')) {
            try {
                await api('/admin/cdk/batch-delete', {
                    method: 'POST',
                    body: JSON.stringify({ ids: ids })
                });
                $.selectedCdkIds.value = [];
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.toggleSelectAllCdk = function() {
        if ($.selectedCdkIds.value.length === $.cdkList.value.length) {
            $.selectedCdkIds.value = [];
        } else {
            $.selectedCdkIds.value = $.cdkList.value.map(function(c) { return c.id; });
        }
    };

    // 消息管理
    $.sendAdminMessage = async function() {
        var content = $.adminMsgForm.value.content ? $.adminMsgForm.value.content.trim() : '';
        if (!content) {
            return alert('消息内容不能为空，请填写通知正文');
        }
        if (content.length > 5000) {
            return alert('内容超出字数上限，请精简文案或拆分发送');
        }
        $.adminSending.value = true;
        try {
            $.adminMsgForm.value.uids = $.msgSelectedUsers.value.map(function(u) { return u.id; });
            await api('/admin/messages/send', {
                method: 'POST',
                body: JSON.stringify($.adminMsgForm.value)
            });
            $.adminMsgForm.value = { scope: 'all', uids: [], type: '1', title: '', content: '', link_url: '' };
            $.msgSelectedUsers.value = [];
            $.msgUserSearch.value = '';
            alert('消息发送成功');
        } catch (e) {
            alert(e.message);
        } finally {
            $.adminSending.value = false;
        }
    };

    $.deleteMessage = async function(id) {
        if (await window.customConfirm('确定要删除这条消息吗？')) {
            try {
                await api('/messages/' + id, { method: 'DELETE' });
                $.bsModalHide('messageDetailModal');
                $.loadUnreadCount();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    // ==================== initAdmin ====================
    $.initAdmin = function() {
        // 无特殊生命周期逻辑
    };

    // 支付配置
    $.payConfig = ref({ base_url: '', pid: '', md5_key: '', v2_public_key: '', v2_private_key: '', v1_enabled: true, v2_enabled: false, alipay_enabled: true, wxpay_enabled: true, min_amount: 0.01, max_amount: 999999.99 });

    $.loadPayConfig = async function() {
        try {
            var config = await api('/admin/pay/config');
            $.payConfig.value = config;
        } catch (e) {
            console.error('加载支付配置失败', e);
        }
    };

    $.savePayConfig = async function() {
        try {
            await api('/admin/pay/config', { method: 'PUT', body: $.payConfig.value });
            alert('支付配置保存成功！');
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
    };

    // 财务管理 - 交易流水
    $.financeFilter = ref({ start_time: '', end_time: '', pay_method: '', trade_type: '', order_no: '' });
    $.transactionList = ref([]);
    $.transactionTotal = ref(0);
    $.financePage = ref(1);

    $.loadTransactions = async function(page) {
        $.financePage.value = page || 1;
        try {
            var params = { page: $.financePage.value, limit: 10 };
            var f = $.financeFilter.value;
            if (f.start_time) params.start_time = f.start_time;
            if (f.end_time) params.end_time = f.end_time;
            if (f.pay_method) params.pay_method = f.pay_method;
            if (f.trade_type) params.trade_type = f.trade_type;
            if (f.order_no) params.order_no = f.order_no;
            var res = await api('/admin/transactions?' + new URLSearchParams(params));
            $.transactionList.value = res.data || [];
            $.transactionTotal.value = res.total || 0;
        } catch (e) {
            console.error('加载流水失败', e);
        }
    };

    $.exportTransactions = async function() {
        try {
            var f = $.financeFilter.value;
            var params = {};
            if (f.start_time) params.start_time = f.start_time;
            if (f.end_time) params.end_time = f.end_time;
            if (f.pay_method) params.pay_method = f.pay_method;
            if (f.trade_type) params.trade_type = f.trade_type;
            if (f.order_no) params.order_no = f.order_no;
            var token = localStorage.getItem('token');
            var resp = await fetch('/api/admin/transactions/export?' + new URLSearchParams(params), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) {
                var err = await resp.json().catch(function() { return { error: '导出失败' }; });
                throw new Error(err.error || '导出失败');
            }
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'transaction_history.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('导出失败: ' + (e.message || ''));
        }
    };

    // 订单管理
    $.orders = Vue.ref([]);
    $.orderPage = Vue.ref(1);
    $.orderTotal = Vue.ref(0);
    $.orderFilter = Vue.reactive({ order_no: '', type: '', status: '', start_time: '', end_time: '' });

    $.loadOrders = async function(page) {
        page = page || 1;
        $.orderPage.value = page;
        try {
            var params = new URLSearchParams();
            params.set('page', page);
            params.set('limit', '20');
            if ($.orderFilter.order_no) params.set('order_no', $.orderFilter.order_no);
            if ($.orderFilter.type) params.set('type', $.orderFilter.type);
            if ($.orderFilter.status) params.set('status', $.orderFilter.status);
            if ($.orderFilter.start_time) params.set('start_time', $.orderFilter.start_time);
            if ($.orderFilter.end_time) params.set('end_time', $.orderFilter.end_time);
            var data = await api('/admin/orders?' + params.toString());
            $.orders.value = data.rows || [];
            $.orderTotal.value = data.total || 0;
        } catch(e) { console.error('加载订单失败', e); }
    };

    $.exportOrders = async function() {
        try {
            var params = new URLSearchParams();
            if ($.orderFilter.order_no) params.set('order_no', $.orderFilter.order_no);
            if ($.orderFilter.type) params.set('type', $.orderFilter.type);
            if ($.orderFilter.status) params.set('status', $.orderFilter.status);
            if ($.orderFilter.start_time) params.set('start_time', $.orderFilter.start_time);
            if ($.orderFilter.end_time) params.set('end_time', $.orderFilter.end_time);
            var token = localStorage.getItem('token');
            var resp = await fetch('/api/admin/orders/export?' + params.toString(), {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!resp.ok) { alert('导出失败'); return; }
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'orders.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch(e) { console.error('导出订单失败', e); }
    };

    $.searchOrders = function() { $.loadOrders(1); };
})();
