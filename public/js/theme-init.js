(function(){try{var t=localStorage.getItem('theme');if(t){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t}else if(window.matchMedia('(prefers-color-scheme:light)').matches){document.documentElement.setAttribute('data-theme','light');document.documentElement.style.colorScheme='light'}else{document.documentElement.style.colorScheme='dark'};var m=document.querySelector('meta[name="color-scheme"]')||function(){var e=document.createElement('meta');e.name='color-scheme';document.head.appendChild(e);return e}();m.content=document.documentElement.style.colorScheme}catch(e){}})();
!function(){var d=document.documentElement;new MutationObserver(function(){document.body&&(document.body.setAttribute('data-theme',d.getAttribute('data-theme')||'dark'),this.disconnect())}).observe(d,{childList:!0,subtree:!0})}();

/**
 * 统一主题切换初始化 — 所有页面共用
 * 自动查找 #themeToggle 元素绑定点击 + 移动端失焦
 * 各页面只需在 DOMContentLoaded 后调用 window.initThemeToggle() 即可
 */
window.initThemeToggle = function() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var html = document.documentElement;
        var newTheme = (html.getAttribute('data-theme') === 'dark') ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        html.style.colorScheme = newTheme;
        var cm = document.querySelector('meta[name="color-scheme"]');
        if (cm) cm.content = newTheme;
        if (document.body) document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        // 移动端触摸后延迟 blur，避免 focus 残留导致遮罩不消失
        requestAnimationFrame(function() { try { btn.blur(); } catch(e) {} });
    });
};