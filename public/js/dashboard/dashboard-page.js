// 合并所有模板片段（与 admin-template.js 架构一致）
(function() {
  var parts = window.__dashboardTemplateParts;
  if (parts && parts.length > 0) {
    var el = document.getElementById("appTemplate");
    if (el) el.innerHTML = parts.join("\n\n");
  }
})();

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
    var app = Vue.createApp(App);
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