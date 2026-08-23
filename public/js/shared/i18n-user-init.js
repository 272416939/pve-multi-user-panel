// public/js/shared/i18n-user-init.js - 认证页用户语言偏好自动应用
// 在 dashboard/admin/user-center 等登录页加载：从服务端取用户语言偏好（个人偏好 > 站点默认），
// 应用 setLocale 触发全站响应式重渲染（含 data-i18n 静态元素）。
// 无 token（未登录）或请求失败时静默保持站点默认语言。
(function () {
  'use strict';

  var applied = false;

  async function applyUserLocale() {
    if (applied || !window.__i18n) return;
    // 未登录（无 token）时不处理，保持站点默认
    var token = localStorage.getItem('token');
    if (!token) return;
    try {
      var resp = await fetch('/api/user/lang', { headers: { 'Authorization': 'Bearer ' + token } });
      if (!resp.ok) return;
      var res = await resp.json();
      if (!res) return;
      var pref = res.lang || '';
      var sd = res.siteDefault || 'zh-CN';
      var resolved = pref || sd;
      if (window.__i18n.getLocale() !== resolved) {
        await window.__i18n.setLocale(resolved);
      }
      applied = true;
    } catch (e) {
      // 静默失败：保持当前语言（站点默认）
      console.warn('[i18n] 应用用户语言偏好失败:', e.message);
    }
  }

  // DOM 就绪后执行；若 Vue 挂载较慢（异步 init），延迟重试确保 setLocale 触发响应式重渲染
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', applyUserLocale);
    } else {
      applyUserLocale();
    }
    // Vue 异步挂载兜底：等 800ms 再补一次（若首次执行时 Vue 尚未挂载，重渲染会丢失）
    setTimeout(applyUserLocale, 800);
  }

  init();
})();