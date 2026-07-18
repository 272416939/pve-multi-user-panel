/**
 * pv-button — 纯 Vue 全局组件
 * 使用 render 函数输出 <button class="pv-btn pv-btn-{variant}">
 * 所有视觉效果由 public/shared/css/pv-buttons.css 的 CSS 类驱动
 */
(function() {
  'use strict';

  var PvButton = {
    props: {
      variant: { type: String, default: 'primary' },
      size: { type: String, default: 'md' },
      disabled: Boolean,
      type: { type: String, default: 'button' }
    },
    emits: ['click', 'pv-click'],
    inheritAttrs: false,
    methods: {
      handleClick: function(e) {
        if (this.disabled) { e.preventDefault(); e.stopPropagation(); return; }
        if (this.type === 'submit') {
          var form = this.$el && this.$el.closest ? this.$el.closest('form') : null;
          if (form) { e.preventDefault(); form.requestSubmit(); return; }
        }
        this.$emit('pv-click', e);
        this.$emit('click', e);
      }
    },
    render: function() {
      var h = (typeof Vue !== 'undefined' && Vue.h) ? Vue.h.bind(Vue) : null;
      if (!h) return null;

      var v = this.variant || 'primary';
      if (this.$attrs['data-bs-dismiss'] === 'modal') {
        var slots = this.$slots.default;
        if (!slots || !slots() || !slots().length) v = 'close';
      }

      var cls = 'pv-btn pv-btn-' + v;
      var children = v === 'close'
        ? [h('span', { attrs: { 'aria-hidden': 'true' } }, '\u00d7')]
        : (this.$slots.default ? this.$slots.default() : []);

      // 透传 fallthrough 属性（title、data-*、aria-* 等），让 :title 悬停提示生效
      var btnAttrs = {
        type: this.type,
        disabled: this.disabled || undefined,
        class: cls
      };
      // Vue 3 中 $attrs 包含未声明为 props 的属性（title、data-*、aria-* 等）
      // 注意：class/style 已单独处理；on* 开头的会被 Vue 当作事件监听器，不应作为 attr
      if (this.$attrs && typeof this.$attrs === 'object') {
        for (var key in this.$attrs) {
          if (key === 'class' || key === 'style') continue; // 已有 class 处理
          if (/^on[A-Z]/.test(key)) continue; // 事件监听器由 Vue 单独处理，避免重复
          if (Object.prototype.hasOwnProperty.call(this.$attrs, key)) {
            btnAttrs[key] = this.$attrs[key];
          }
        }
      }
      btnAttrs.onClick = this.handleClick;

      return h('button', btnAttrs, children);
    }
  };

  if (typeof Vue !== 'undefined' && Vue.createApp) {
    var _createApp = Vue.createApp;
    Vue.createApp = function(rootComponent) {
      var app = _createApp.apply(this, arguments);
      app.component('pv-button', PvButton);
      return app;
    };
  }

  window.PvButtonComponent = PvButton;
})();
