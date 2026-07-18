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
    // 不设置 inheritAttrs: false，让 Vue 3 自动把 $attrs（title/data-*/aria-* 等）
    // 透传到根元素 <button>，这样 :title 悬停提示就能生效
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
        ? [h('span', { 'aria-hidden': 'true' }, '\u00d7')]
        : (this.$slots.default ? this.$slots.default() : []);

      return h('button', {
        type: this.type,
        disabled: this.disabled || undefined,
        class: cls,
        onClick: this.handleClick
      }, children);
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
