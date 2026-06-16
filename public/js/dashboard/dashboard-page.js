var $ = window.__dashboard;
    var App = {
        template: '#appTemplate',
        setup: function() {
            // 兜底初始化：确保关键 ref 在模板渲染前一定存在
            if (!$.lxcIpForm) $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
            if (!$.confirmState) $.confirmState = Vue.ref({ vmId: null, action: null });
            if (!$.lxcConfirmState) $.lxcConfirmState = Vue.ref({ ctId: null, action: null });
            if (!$.userVms) $.userVms = Vue.ref([]);
            if (!$.userLxcContainers) $.userLxcContainers = Vue.ref([]);
            $.initCore();
            $.initVm();
            $.initLxc();
            $.initForward();
            $.initMessage();
            $.daysUntilExpire = function(expireTime) {
                if (!expireTime) return '';
                var diff = new Date(expireTime) - new Date();
                var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
                if (days <= 0) return '(已到期)';
                if (days <= 7) return '(剩余' + days + '天)';
                return '';
            };
            return $;
        }
    };
    Vue.createApp(App).mount('#app');

function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    var ol = document.getElementById('sidebarOverlay');
    if (sb && ol) {
        sb.classList.toggle('open');
        ol.style.display = sb.classList.contains('open') ? 'block' : 'none';
    }
}

// 主题切换
(function() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next;
        var cm = document.querySelector('meta[name="color-scheme"]');
        if (cm) cm.content = next;
        if (document.body) document.body.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
})();

// 注意：侧边栏导航点击已由 Vue switchSection() 统一处理（含移动端自动收起），无需重复绑定原生事件

// 点击页面空白处关闭下拉菜单
document.addEventListener('click', function() {
    if (window.__dashboard && window.__dashboard.closeDropdown) {
        window.__dashboard.closeDropdown();
    }
});