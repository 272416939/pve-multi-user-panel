// public/js/shared/i18n.js - 全局 i18n 国际化模块
// 提供 t(key) 翻译函数，支持 7 种语言，缺失 key 自动回退 zh-CN
// 与 Vue 集成：translations 用 Vue.ref 持有，模板中 {{ t('key') }} 在语言切换时自动重渲染
// 使用方式：window.__i18n.t('common.save') → 当前语言的翻译文本

(function () {
  'use strict';

  var _locale = 'zh-CN';
  // 用 Vue.ref 持有翻译字典，使 t() 在模板中成为响应式依赖（语言切换时自动重渲染）
  var _translations = null; // Vue.ref 包装的当前语言字典
  var _fallbackTranslations = {}; // 普通对象（zh-CN 兜底）
  var _fallbackLocale = 'zh-CN';
  var _loaded = false;

  // 支持的语言列表（与 server/constants.js SUPPORTED_LOCALES 保持一致）
  var SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en', 'de', 'ja', 'ko', 'fr'];
  // localStorage 缓存已解析语言（刷新时 init 优先使用，避免先按站点默认中文渲染再切换的闪烁）
  var _localeCacheKey = '__i18nLocale';

  function _cachedLocale() {
    try {
      var v = localStorage.getItem(_localeCacheKey) || '';
      return SUPPORTED_LOCALES.indexOf(v) !== -1 ? v : '';
    } catch (e) { return ''; }
  }
  function _setLocaleCache(locale) {
    try { localStorage.setItem(_localeCacheKey, locale); } catch (e) { /* 隐私模式忽略 */ }
  }
  // 语言就绪前隐藏服务端预渲染内容，防「刷新闪中文」；3s 兜底强制显示（防 init 失败白屏）
  function _reveal() {
    if (document.documentElement) document.documentElement.classList.remove('i18n-pending');
  }
  setTimeout(function () { _reveal(); }, 3000);

  // 语言代码 → 本地化名称映射（与 server/constants.js LOCALE_NAMES 保持一致）
  var LOCALE_NAMES = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'en': 'English',
    'de': 'Deutsch',
    'ja': '日本語',
    'ko': '한국어',
    'fr': 'Français'
  };

  // 初始化响应式字典（依赖全局 Vue；无 Vue 时退化为普通对象）
  function _ensureReactive() {
    if (_translations) return;
    if (typeof Vue !== 'undefined' && Vue.ref) {
      _translations = Vue.ref({});
    } else {
      _translations = { value: {} };
    }
  }

  // 从服务端加载语言文件
  async function _fetchLocale(locale) {
    var cv = (typeof window !== 'undefined' && window.__cacheVersion) ? ('?cv=' + window.__cacheVersion) : '';
    var resp = await fetch('/locales/' + locale + '.json' + cv);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return await resp.json();
  }

  // 设置当前语言字典（触发 Vue 重渲染）
  function _applyTranslations(dict) {
    _ensureReactive();
    _translations.value = dict;
  }

  // 初始化：加载当前语言和兜底语言
  async function init(initialLocale) {
    // 刷新时优先用 localStorage 缓存的用户语言（与服务端偏好一致时零闪烁；不一致由 i18n-user-init 纠正）
    initialLocale = _cachedLocale() || initialLocale || 'zh-CN';
    _locale = initialLocale;
    if (!SUPPORTED_LOCALES.includes(_locale)) _locale = 'zh-CN';

    try {
      // 加载兜底语言（zh-CN），用于缺失 key 回退
      if (_locale !== _fallbackLocale) {
        _fallbackTranslations = await _fetchLocale(_fallbackLocale);
      }
      // 加载目标语言
      var dict = await _fetchLocale(_locale);
      _applyTranslations(dict);
      if (_locale === _fallbackLocale) {
        _fallbackTranslations = dict;
      }
      _loaded = true;
      document.documentElement.lang = _locale;
      applyStatic();
      _setLocaleCache(_locale);
      _reveal();
    } catch (e) {
      console.error('[i18n] 加载语言文件失败:', _locale, e.message);
      // 回退到 zh-CN
      if (_locale !== _fallbackLocale) {
        _locale = _fallbackLocale;
        try {
          var dict2 = await _fetchLocale(_fallbackLocale);
          _applyTranslations(dict2);
          _fallbackTranslations = dict2;
          _loaded = true;
          document.documentElement.lang = _locale;
          applyStatic();
          _setLocaleCache(_locale);
          _reveal();
        } catch (e2) {
          console.error('[i18n] 回退语言也加载失败:', e2.message);
          _reveal();
        }
      } else {
        _reveal();
      }
    }
  }

  // 切换语言（重新加载翻译文件，触发 Vue 重渲染）
  async function setLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) {
      console.warn('[i18n] 不支持的语言:', locale);
      return false;
    }
    if (locale === _locale) return true;

    try {
      if (locale !== _fallbackLocale) {
        _fallbackTranslations = await _fetchLocale(_fallbackLocale);
      }
      var dict = await _fetchLocale(locale);
      _applyTranslations(dict);
      if (locale === _fallbackLocale) {
        _fallbackTranslations = dict;
      }
      _locale = locale;
      document.documentElement.lang = _locale;
      applyStatic();
      _setLocaleCache(locale);
      _reveal();
      return true;
    } catch (e) {
      console.error('[i18n] 切换语言失败:', locale, e.message);
      return false;
    }
  }

  // 获取当前 locale
  function getLocale() {
    return _locale;
  }

  // 翻译函数：从当前语言取值，缺失则回退 zh-CN，再缺失则返回 key 本身
  // 模板中 {{ t('key') }} 会建立对 _translations 的响应式依赖，语言切换时自动重渲染
  function t(key) {
    _ensureReactive();
    var dict = _translations.value;
    var val = dict[key];
    if (val !== undefined) return String(val);

    // 回退到 zh-CN
    if (_locale !== _fallbackLocale && _fallbackTranslations[key] !== undefined) {
      return String(_fallbackTranslations[key]);
    }

    console.warn('[i18n] 缺少翻译 key:', key);
    return key;
  }

  // 带参数插值的翻译：tFormat('common.total', 10) → "共 10 条"
  function tFormat(key) {
    var text = t(key);
    for (var i = 1; i < arguments.length; i++) {
      text = text.replace('{' + (i - 1) + '}', arguments[i]);
    }
    return text;
  }

  // 检查是否已加载
  function isLoaded() {
    return _loaded;
  }

  // 将静态渲染的 [data-i18n] 元素文本替换为当前语言翻译
  // 用于 EJS 服务端渲染的页面片段（header/sidebar 等），语言切换时自动更新
  // 支持 data-i18n（textContent）与 data-i18n-title（title 属性）
  function applyStatic(root) {
    var scope = root || document;
    if (!scope.querySelectorAll) return;
    var txtNodes = scope.querySelectorAll('[data-i18n]');
    for (var i = 0; i < txtNodes.length; i++) {
      var el = txtNodes[i];
      var key = el.getAttribute('data-i18n');
      if (key) el.textContent = t(key);
    }
    var titleNodes = scope.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titleNodes.length; j++) {
      var tel = titleNodes[j];
      var tkey = tel.getAttribute('data-i18n-title');
      if (tkey) tel.setAttribute('title', t(tkey));
    }
  }

  // 暴露到全局
  window.__i18n = {
    init: init,
    t: t,
    tFormat: tFormat,
    setLocale: setLocale,
    getLocale: getLocale,
    isLoaded: isLoaded,
    applyStatic: applyStatic,
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    LOCALE_NAMES: LOCALE_NAMES
  };
})();