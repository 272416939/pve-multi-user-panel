(function() {
    var $ = window.__dashboard;
    var Vue = window.Vue;
    var ref = Vue.ref;

    // ===== 状态 =====
    $.messages = ref([]);
    $.messagesLoading = ref(false);
    $.msgType = ref('all');
    $.currentMsg = ref({ title: '', content: '', type: 1, created_at: '' });

    // ===== 函数 =====
    $.loadMessages = async function() {
        $.messagesLoading.value = true;
        try {
            var data = await api('/messages?type=' + $.msgType.value);
            $.messages.value = data.list || [];
        } catch (e) {
            console.error('加载消息失败', e);
        } finally {
            $.messagesLoading.value = false;
        }
    };

    $.viewMessage = async function(msg) {
        try {
            var detail = await api('/messages/' + msg.id);
            $.currentMsg.value = detail;
            if (!msg.is_read) {
                msg.is_read = 1;
                $.loadUnreadCount();
            }
            $.bsModalShow('messageDetailModal');
        } catch (e) {
            alert('获取消息详情失败');
        }
    };

    $.markAllRead = async function() {
        try {
            await api('/messages/read-all', { method: 'PUT' });
            $.messages.value.forEach(function(m) { m.is_read = 1; });
            $.unreadCount.value = 0;
        } catch (e) {
            alert(e.message);
        }
    };

    $.deleteMessage = async function(id) {
        try {
            await api('/messages/' + id, { method: 'DELETE' });
            $.messages.value = $.messages.value.filter(function(m) { return m.id !== id; });
            $.bsModalHide('messageDetailModal');
            $.loadUnreadCount();
        } catch (e) {
            alert(e.message);
        }
    };

    $.clearAllMessages = async function() {
        if (!await window.customConfirm('确定清空所有已读消息？未读消息将保留。')) return;
        try {
            await api('/messages', { method: 'DELETE' });
            $.messages.value = $.messages.value.filter(function(m) { return !m.is_read; });
            $.loadUnreadCount();
        } catch (e) {
            alert(e.message);
        }
    };

    // ===== initMessage =====
    $.initMessage = function() {
        // 无特殊生命周期逻辑
    };
})();
