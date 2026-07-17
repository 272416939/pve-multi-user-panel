// 合并所有模板片段（与 admin-template.js 架构一致）
(function() {
  var parts = window.__dashboardTemplateParts;
  if (parts && parts.length > 0) {
    var el = document.getElementById("appTemplate");
    if (el) el.innerHTML = parts.join("\n\n");
  }
})();

var $ = window.__dashboard;

// 全局工具函数：到期时间显示（在 setup 之前定义，确保模板编译时可用）
$.daysUntilExpire = function(expireTime) {
    if (!expireTime) return '';
    var diff = new Date(expireTime) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return '已到期';
    return '剩余' + days + '天';
};
$.getExpiryColor = function(expireTime) {
    if (!expireTime) return '';
    var diff = new Date(expireTime) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'text-danger';
    if (days <= 3) return 'text-danger';
    if (days <= 7) return 'text-warning';
    return 'text-success';
};

var App = {
    template: '#appTemplate',
    setup: function() {
            // 兜底初始化：确保关键 ref 在模板渲染前一定存在
            if (!$.lxcIpForm) $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
            if (!$.confirmState) $.confirmState = Vue.ref({ vmId: null, action: null });
            if (!$.lxcConfirmState) $.lxcConfirmState = Vue.ref({ ctId: null, action: null });
            if (!$.userVms) $.userVms = Vue.ref([]);
            if (!$.userLxcContainers) $.userLxcContainers = Vue.ref([]);
            // 硬盘管理兜底初始化
            if (!$.disks) $.disks = Vue.ref([]);
            if (!$.selectedDisks) $.selectedDisks = Vue.ref([]);
            if (!$.diskLoading) $.diskLoading = Vue.ref(false);
            if (!$.diskOptions) $.diskOptions = Vue.ref({ groups: [], specs: [] });
            if (!$.showCreateDiskModal) $.showCreateDiskModal = Vue.ref(false);
            if (!$.showBindModal) $.showBindModal = Vue.ref(false);
            if (!$.showRenewModal) $.showRenewModal = Vue.ref(false);
            if (!$.bindTargetDisk) $.bindTargetDisk = Vue.ref(null);
            if (!$.bindTargetVmid) $.bindTargetVmid = Vue.ref('');
            if (!$.userVmsForBind) $.userVmsForBind = Vue.ref([]);
            if (!$.renewDisk) $.renewDisk = Vue.ref(null);
            if (!$.renewPeriod) $.renewPeriod = Vue.ref('month');
            if (!$.renewPeriodCount) $.renewPeriodCount = Vue.ref(1);
            if (!$.renewAmount) $.renewAmount = Vue.ref(0);
            if (!$.purchasePrice) $.purchasePrice = Vue.ref(0);
            if (!$.diskPurchaseForm) $.diskPurchaseForm = Vue.ref({ spec_id: '', storage_group_id: '', capacity_gb: 100, disk_name: '', period: 'month', period_count: 1, quantity: 1, auto_renew: false });
            if (!$.resizeTargetDisk) $.resizeTargetDisk = Vue.ref(null);
            if (!$.resizeNewCapacity) $.resizeNewCapacity = Vue.ref(0);
            if (!$.showResizeModal) $.showResizeModal = Vue.ref(false);
            if (!$.resizePrice) $.resizePrice = Vue.ref(0);
            if (!$.diskOptionsGroups) $.diskOptionsGroups = Vue.computed(function() { var o = $.diskOptions && $.diskOptions.value; return (o && o.groups) ? o.groups : []; });
            $.initCore();
            $.initVm();
            $.initLxc();
            $.initForward();
            $.initMessage();
            $.initDisk && $.initDisk();
            return $;
        }
    };
    var app = Vue.createApp(App);
    // 注册全局属性，确保模板任意作用域都能找到
    app.config.globalProperties.daysUntilExpire = $.daysUntilExpire;
    app.config.globalProperties.getExpiryColor = $.getExpiryColor;
    app.mount('#app');

function toggleSidebar() {
    var sb = document.getElementById('sidebar');
    var ol = document.getElementById('sidebarOverlay');
    if (sb && ol) {
        sb.classList.toggle('open');
        ol.style.display = sb.classList.contains('open') ? 'block' : 'none';
    }
}

// 主题切换 — 统一使用 theme-init.js
if (window.initThemeToggle) window.initThemeToggle();

// XSS-4 修复：侧边栏导航事件绑定（替换内联 onclick，CSP nonce 合规）
document.querySelectorAll('[data-section]').forEach(function(el) {
    el.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.__dashboard && window.__dashboard.switchSection) {
            window.__dashboard.switchSection(el.getAttribute('data-section'));
        }
    });
});
document.querySelectorAll('[data-submenu]').forEach(function(el) {
    el.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.__dashboard && window.__dashboard.toggleSubmenu) {
            window.__dashboard.toggleSubmenu(el.getAttribute('data-submenu'));
        }
    });
});
document.querySelectorAll('[data-suborder]').forEach(function(el) {
    el.addEventListener('click', function(e) {
        e.preventDefault();
        if (window.__dashboard && window.__dashboard.switchSubOrder) {
            window.__dashboard.switchSubOrder(el.getAttribute('data-suborder'));
        }
    });
});

// 点击页面空白处关闭下拉菜单
document.addEventListener('click', function(e) {
    var allOpen = document.querySelectorAll('.dropdown-table.open');
    allOpen.forEach(function(dd) {
        if (!dd.contains(e.target)) {
            dd.classList.remove('open');
            var menu = dd._movedMenu;
            if (menu) {
                window.closeFixedDropdownAnimated(menu, function() {
                    menu.style.display = 'none';
                    if (menu._originalParent) {
                        menu._originalParent.appendChild(menu);
                        menu._originalParent = null;
                    }
                    dd._movedMenu = null;
                });
            }
        }
    });
    // 关闭 Teleport 浮动下拉菜单
    if (window.__dashboard && window.__dashboard.closeDropdown) {
        window.__dashboard.closeDropdown();
    }
});