// public/js/shared/i18n.js - 全局 i18n 国际化模块
// 提供 t(key) 翻译函数，支持 7 种系统语言 + 管理员新建的自定义语言（运行时拉注册表），
// 缺失 key 自动回退 zh-CN；与 Vue 集成：translations 用 Vue.ref 持有，模板中 {{ t('key') }} 语言切换自动重渲染。
//
// 加载路径两分支（public/locales/*.json 为只读基线，永不写入）：
// - 系统语言且无覆盖 → 静态文件 /locales/<code>.json?cv=（历史路径零改动）
// - 有覆盖的系统语言 / 自定义语言 → /api/i18n/locale/<code>（服务端合并基线+覆盖，
//   60s 服务端缓存 + 写操作失效；cache:reload 绕过浏览器缓存保证编辑后立即可见）
// 使用方式：window.__i18n.t('common.save') → 当前语言的翻译文本

(function () {
  'use strict';

  var _locale = 'zh-CN';
  // 用 Vue.ref 持有翻译字典，使 t() 在模板中成为响应式依赖（语言切换时自动重渲染）
  var _translations = null; // Vue.ref 包装的当前语言字典
  var _fallbackTranslations = {}; // 普通对象（zh-CN 兜底）
  var _fallbackLocale = 'zh-CN';
  var _loaded = false;

  // 系统语言白名单（与 server/constants.js SYSTEM_LOCALES 保持一致；注册表接口失败时的兜底）
  var SUPPORTED_LOCALES = ['zh-CN', 'zh-TW', 'en', 'de', 'ja', 'ko', 'fr'];
  // localStorage 缓存已解析语言（刷新时 init 优先使用，避免先按站点默认中文渲染再切换的闪烁）
  var _localeCacheKey = '__i18nLocale';

  // 语言注册表（GET /api/i18n/languages：7 系统语言 + 管理员新建自定义语言，含 overrides 标志）
  var _languages = null; // Vue.ref([])
  var _languagesLoaded = false;

  function _cachedLocale() {
    try {
      var v = localStorage.getItem(_localeCacheKey) || '';
      return _isSupportedLocale(v) ? v : '';
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
  // 语言名按设计保留原生写法，禁止替换为 t()——本模块是 __i18n 定义方，加载期自引用会 ReferenceError
  var LOCALE_NAMES = {
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    'en': 'English',
    'de': 'Deutsch',
    'ja': '日本語',
    'ko': '한국어',
    'fr': 'Français'
  };

  // 初始化响应式字典与语言注册表（依赖全局 Vue；无 Vue 时退化为普通对象）
  function _ensureReactive() {
    if (_translations) return;
    if (typeof Vue !== 'undefined' && Vue.ref) {
      _translations = Vue.ref({});
      _languages = Vue.ref([]);
    } else {
      _translations = { value: {} };
      _languages = { value: [] };
    }
  }

  // 拉取语言注册表（失败回退 7 种系统语言，行为与现状一致；init 时先于 locale 加载）
  async function _loadLanguages() {
    try {
      var resp = await fetch('/api/i18n/languages', { cache: 'reload' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      var list = await resp.json();
      if (!Array.isArray(list) || !list.length) throw new Error('语言列表为空');
      _ensureReactive();
      _languages.value = list;
      _languagesLoaded = true;
      return list;
    } catch (e) {
      console.error('[i18n] 获取语言列表失败（回退 7 种系统语言）:', e.message);
      _languagesLoaded = false;
      return null;
    }
  }

  // 注册表查询（未加载返回 null）
  function _languageInfo(code) {
    if (!_languagesLoaded || !_languages) return null;
    var list = _languages.value;
    for (var i = 0; i < list.length; i++) {
      if (list[i].code === code) return list[i];
    }
    return null;
  }

  // 动态白名单：系统语言 ∪ 已注册自定义语言
  function _isSupportedLocale(code) {
    if (SUPPORTED_LOCALES.indexOf(code) !== -1) return true;
    return !!_languageInfo(code);
  }

  // 从服务端加载语言文件（见模块头部注释的两分支说明）
  async function _fetchLocale(locale) {
    var info = _languageInfo(locale);
    // 有覆盖的系统语言 / 自定义语言：服务端合并接口（cache:reload 绕过浏览器缓存，服务端缓存承载）
    if (info && (!info.is_system || info.overrides)) {
      var resp = await fetch('/api/i18n/locale/' + encodeURIComponent(locale), { cache: 'reload' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      return await resp.json();
    }
    // 系统语言且无覆盖：静态文件路径（与历史行为一致，cv 控制缓存）
    var cv = (typeof window !== 'undefined' && window.__cacheVersion) ? ('?cv=' + window.__cacheVersion) : '';
    var resp2 = await fetch('/locales/' + locale + '.json' + cv);
    if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
    return await resp2.json();
  }

  // 设置当前语言字典（触发 Vue 重渲染）
  function _applyTranslations(dict) {
    _ensureReactive();
    _translations.value = dict;
  }

  // 初始化：加载语言注册表 → 当前语言和兜底语言
  async function init(initialLocale) {
    await _loadLanguages();
    // 刷新时优先用 localStorage 缓存的用户语言（与服务端偏好一致时零闪烁；不一致由 i18n-user-init 纠正）
    initialLocale = _cachedLocale() || initialLocale || 'zh-CN';
    _locale = _isSupportedLocale(initialLocale) ? initialLocale : 'zh-CN';

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
    if (!_isSupportedLocale(locale)) {
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
      _emitLocaleChanged();
      return true;
    } catch (e) {
      console.error('[i18n] 切换语言失败:', locale, e.message);
      return false;
    }
  }

  // 强制重新加载当前语言（后台修改翻译后调用；setLocale 同语言会短路，不重拉）
  async function refreshLocale() {
    if (!_locale) return false;
    try {
      var dict = await _fetchLocale(_locale);
      _applyTranslations(dict);
      if (_locale === _fallbackLocale) {
        _fallbackTranslations = dict;
      }
      document.documentElement.lang = _locale;
      applyStatic();
      _reveal();
      _emitLocaleChanged();
      return true;
    } catch (e) {
      console.error('[i18n] 刷新语言失败:', _locale, e.message);
      return false;
    }
  }

  // 获取当前 locale
  function getLocale() {
    return _locale;
  }

  // 语言列表（注册表未加载时回退 7 种系统语言，保证下拉可用）
  function getLanguages() {
    if (_languagesLoaded && _languages) return _languages.value;
    var list = [];
    for (var i = 0; i < SUPPORTED_LOCALES.length; i++) {
      var code = SUPPORTED_LOCALES[i];
      list.push({ code: code, name: LOCALE_NAMES[code] || code, base_code: '', is_system: true, overrides: false });
    }
    return list;
  }

  // 重新拉取语言注册表（管理端新建/重命名/删除语言后调用，保证下拉与白名单即时同步）
  async function refreshLanguages() {
    await _loadLanguages();
    return getLanguages();
  }

  // 语言显示名（系统语言用常量表；自定义语言用注册表 name）
  function getLanguageName(code) {
    var info = _languageInfo(code);
    if (info && info.name) return info.name;
    return LOCALE_NAMES[code] || code;
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

  // 词条存在返回译文，否则返回 null（不 warn）——供「有则翻译、无则回退原文」的场景
  // （后端错误 code 映射：tOrNull('err.' + code) 为 null 时前端回退后端中文原文）
  function tOrNull(key) {
    _ensureReactive();
    var val = _translations.value[key];
    if (val !== undefined) return String(val);
    if (_locale !== _fallbackLocale && _fallbackTranslations[key] !== undefined) {
      return String(_fallbackTranslations[key]);
    }
    return null;
  }

  // 语言切换/词条刷新完成后的广播：供非 Vue 响应式的组件（Quill 编辑器等）
  // 监听 window 'i18n:localeChanged' 事件自行刷新一次性渲染的文案
  function _emitLocaleChanged() {
    try {
      window.dispatchEvent(new CustomEvent('i18n:localeChanged', { detail: { locale: _locale } }));
    } catch (_) { }
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
    tOrNull: tOrNull,
    setLocale: setLocale,
    refreshLocale: refreshLocale,
    getLocale: getLocale,
    isLoaded: isLoaded,
    applyStatic: applyStatic,
    getLanguages: getLanguages,
    refreshLanguages: refreshLanguages,
    getLanguageName: getLanguageName,
    SUPPORTED_LOCALES: SUPPORTED_LOCALES,
    LOCALE_NAMES: LOCALE_NAMES
  };
})();
