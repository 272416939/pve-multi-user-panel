/**
 * pv-button - 通用按钮组件
 *
 * 属性:
 *   variant: primary | danger | glass | glass-active | glass-inactive |
 *            table | table-primary | table-danger | warning | outline | secondary | link (默认 primary)
 *   size: sm | md | lg (默认 md)
 *   disabled: 无值属性
 *   type: button | submit | reset (默认 button)
 *
 * 样式来源: admin.css / components.css 原始定义的 .btn-glass, .table-btn,
 *           .btn-glass-active, .btn-glass-inactive 等类的精确复刻
 */

/* ====== 注册保护：如果旧版已注册，强制升级 ====== */
(function() {
  const TAG_NAME = 'pv-button';
  if (!customElements.get(TAG_NAME)) return; // 首次加载，无需处理

  // 旧版已存在：克隆所有现有元素（克隆节点是普通HTMLElement，不是自定义元素）
  // 然后删除旧注册... 实际上无法删除，所以改用延迟定义策略
  // 将 define 调用推迟到 DOM 解析完成后，此时重新创建所有 pv-button 元素
  const _origDefine = customElements.define.bind(customElements);
  let pendingDefine = null;

  customElements.define = function(name, constructor, options) {
    if (name === TAG_NAME) {
      pendingDefine = { constructor, options };
      // 不立即调用，等所有脚本加载完
      queueMicrotask(function() {
        if (pendingDefine) {
          // 先替换 DOM 中所有旧元素为普通 div（脱离自定义元素）
          document.querySelectorAll(TAG_NAME).forEach(el => {
            const replacement = document.createElement('span');
            replacement.setAttribute('data-pv-upgrade', '');
            replacement.setAttribute('variant', el.getAttribute('variant') || '');
            replacement.setAttribute('type', el.getAttribute('type') || 'button');
            if (el.hasAttribute('disabled')) replacement.setAttribute('disabled', '');
            replacement.innerHTML = el.innerHTML;
            el.parentNode.replaceChild(replacement, el);
          });
          // 恢复原始 define 并注册新组件
          customElements.define = _origDefine;
          try { _origDefine(name, pendingDefine.constructor, pendingDefine.options); } catch(e) {}
          pendingDefine = null;
          // 将 span 替换回真正的 pv-button 元素
          document.querySelectorAll('span[data-pv-upgrade]').forEach(el => {
            const btn = document.createElement(TAG_NAME);
            if (el.getAttribute('variant')) btn.setAttribute('variant', el.getAttribute('variant'));
            if (el.getAttribute('type')) btn.setAttribute('type', el.getAttribute('type'));
            if (el.hasAttribute('disabled')) btn.setAttribute('disabled', '');
            btn.innerHTML = el.innerHTML;
            el.parentNode.replaceChild(btn, el);
          });
        }
      });
      return;
    }
    return _origDefine(name, constructor, options);
  };
})();
class PvButton extends HTMLElement {
  static get observedAttributes() {
    return ['variant', 'size', 'disabled', 'type'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this._setupEvents();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this.shadowRoot.firstChild) {
      this.render();
      this._setupEvents();
    }
  }

  get variant() {
    return this.getAttribute('variant') || 'primary';
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  get isDisabled() {
    return this.hasAttribute('disabled');
  }

  get btnType() {
    return this.getAttribute('type') || 'button';
  }

  _setupEvents() {
    const btn = this.shadowRoot.querySelector('button');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      if (this.isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (this.btnType === 'submit') {
        const form = this.closest('form');
        if (form) {
          e.preventDefault();
          form.requestSubmit();
          return;
        }
      }
      this.dispatchEvent(new CustomEvent('pv-click', { bubbles: true, composed: true }));
    });
  }

  render() {
    const variant = this.variant;
    const size = this.size;
    const disabled = this.isDisabled;

    /* ================================================================
     * 每个变体精确对应原始 admin.css / components.css 中的类定义
     * ================================================================ */
    const variantStyles = {
      /* ---- .btn-glass 精确复刻 (admin.css:144-150) ---- */
      /* 用于: CDK兑换、保存配置、创建容器/VM、分配、发送测试邮件 等 */
      glass: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid rgba(99,102,241,0.3);
        cursor: pointer;
        transition: all 0.2s ease, color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease;
        background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15));
        color: var(--text-primary, #e2e8f0);
        box-shadow: 0 2px 10px rgba(99,102,241,0.15);
      `,

      /* ---- .btn-glass-active 精确复刻 (admin.css:152-155) ---- */
      /* 用于: CDK时长选择（选中状态） */
      'glass-active': `
        padding: 4px 14px;
        font-size: 12px;
        font-weight: 600;
        border-radius: 6px;
        border: 1px solid rgba(99,102,241,0.4);
        cursor: pointer;
        transition: all 0.2s ease;
        background: linear-gradient(135deg, rgba(99,102,241,0.28), rgba(139,92,246,0.18));
        color: var(--text-primary, #e2e8f0);
        box-shadow: 0 2px 8px rgba(99,102,241,0.2);
      `,

      /* ---- .btn-glass-inactive 精确复刻 (admin.css:156-159) ---- */
      /* 用于: CDK时长选择（未选中状态） */
      'glass-inactive': `
        padding: 4px 14px;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        border: 1px solid var(--border-color, rgba(129,140,248,0.15));
        cursor: pointer;
        transition: all 0.2s ease, color 0.3s ease, background-color 0.3s ease, border-color 0.3s ease;
        background: var(--bg-input, rgba(15,23,42,0.6));
        color: var(--text-secondary, #94a3b8);
      `,

      /* ---- 表格操作按钮 — 玻璃态渐变+光晕（匹配图二原始效果） ---- */
      /* 用于: 详情、开机、启动、重启、关机、移除、更多 等表格主操作 */
      'table-primary': `
        padding: 5px 14px;
        font-size: 12px;
        border-radius: 8px;
        border: 1px solid rgba(99,102,241,0.35);
        cursor: pointer !important;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25));
        color: #e0e7ff;
        box-shadow: 0 2px 12px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.08);
        white-space: nowrap;
        line-height: 1.6;
        position: relative;
        z-index: 10;
        display: inline-flex;
        align-items: center;
        font-weight: 500;
      `,

      /* ---- 表格危险操作按钮 — 红色玻璃态（停止、销毁） ---- */
      'table-danger': `
        padding: 5px 14px;
        font-size: 12px;
        border-radius: 8px;
        border: 1px solid rgba(239,68,68,0.3);
        cursor: pointer !important;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, rgba(239,68,68,0.3), rgba(220,38,38,0.2));
        color: #fecaca;
        box-shadow: 0 2px 12px rgba(239,68,68,0.2), inset 0 1px 0 rgba(255,255,255,0.06);
        white-space: nowrap;
        line-height: 1.6;
        position: relative;
        z-index: 10;
        display: inline-flex;
        align-items: center;
        font-weight: 500;
      `,

      /* ---- 表格基础按钮（更多下拉触发、移除等次要操作） ---- */
      table: `
        padding: 5px 14px;
        font-size: 12px;
        border-radius: 8px;
        border: 1px solid rgba(129,140,248,0.25);
        cursor: pointer !important;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.12));
        color: #c7d2fe;
        box-shadow: 0 2px 8px rgba(99,102,241,0.15), inset 0 1px 0 rgba(255,255,255,0.05);
        white-space: nowrap;
        line-height: 1.6;
        position: relative;
        z-index: 10;
        display: inline-flex;
        align-items: center;
        font-weight: 500;
      `,

      /* ---- 主操作按钮（表单提交：保存、确认兑换、发送等） ---- */
      primary: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid transparent;
        cursor: pointer;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: #fff;
        box-shadow: 0 2px 8px rgba(102,126,234,0.35);
      `,

      /* ---- 危险操作按钮（弹窗内删除等） ---- */
      danger: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid rgba(239,68,68,0.3);
        cursor: pointer;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, rgba(239,68,68,0.85), rgba(245,87,108,0.85));
        color: #fff;
        box-shadow: 0 2px 8px rgba(239,68,68,0.2);
      `,

      /* ---- 警告按钮（重置IP确认等） ---- */
      warning: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 600;
        border-radius: 8px;
        border: 1px solid rgba(251,191,36,0.3);
        cursor: pointer;
        transition: all 0.25s ease;
        background: linear-gradient(135deg, rgba(251,191,36,0.85), rgba(245,158,11,0.85));
        color: #212529;
        box-shadow: 0 2px 8px rgba(251,191,36,0.2);
      `,

      /* ---- 次要操作按钮（取消、编辑等） ---- */
      outline: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        border: 1px solid var(--color-primary, #818cf8);
        cursor: pointer;
        transition: all 0.25s ease;
        background: transparent;
        color: var(--color-primary, #818cf8);
        box-shadow: none;
      `,

      /* ---- 中性按钮（取消关闭弹窗等） ---- */
      secondary: `
        padding: 7px 20px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        border: 1px solid var(--border-color, rgba(129,140,248,0.15));
        cursor: pointer;
        transition: all 0.25s ease;
        background: var(--bg-hover, rgba(99,102,241,0.08));
        color: var(--text-primary, #e2e8f0);
        box-shadow: none;
      `,

      /* ---- 链接按钮 ---- */
      link: `
        padding: 0;
        font-size: inherit;
        font-weight: inherit;
        border-radius: 0;
        border: none;
        cursor: pointer;
        transition: all 0.2s ease;
        background: transparent;
        color: var(--color-primary, #818cf8);
        box-shadow: none;
        text-decoration: none;
      `
    };

    /* 尺寸规格 — 当变体已包含完整尺寸时，size 被忽略 */
    const sizeStyles = {
      sm: 'padding: 0.25rem 0.5rem; font-size: 0.75rem; border-radius: 0.25rem;',
      md: 'padding: 0.375rem 0.75rem; font-size: 0.875rem; border-radius: 0.375rem;',
      lg: 'padding: 0.5rem 1rem; font-size: 1rem; border-radius: 0.5rem;'
    };

    /* 判断当前变体是否自带完整尺寸（不需要 size 覆盖） */
    const selfSizedVariants = ['glass', 'glass-active', 'glass-inactive', 'table', 'table-primary', 'table-danger', 'primary', 'danger', 'warning', 'outline', 'secondary'];
    const needsSizeOverride = !selfSizedVariants.includes(variant);

    const disabledAttr = disabled ? 'disabled' : '';
    const disabledStyle = disabled ? `
      opacity: 0.5;
      cursor: not-allowed;
      pointer-events: none;
    ` : '';

    /* 构建最终样式：变体样式 + (可选)尺寸覆盖 + 禁用状态 */
    const baseStyle = variantStyles[variant] || variantStyles.primary;
    const sizeOverride = (needsSizeOverride && sizeStyles[size]) ? sizeStyles[size] : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        button {
          ${baseStyle}
          ${sizeOverride}
          ${disabledStyle}
          font-family: inherit;
          line-height: 1.5;
          white-space: nowrap;
          user-select: none;
          outline: none;
          position: relative;
          overflow: hidden;
          vertical-align: middle;
        }
        /* 高光叠加层 */
        button::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.08), transparent);
          pointer-events: none;
          border-radius: inherit;
        }
        /* 全局 hover 上浮效果 */
        button:not(:disabled):hover {
          transform: translateY(-1px);
        }
        button:not(:disabled):active {
          transform: translateY(0);
        }

        /* ===== 各变体专属 hover 效果（精确匹配原始CSS hover规则） ===== */

        /* .btn-glass hover (admin.css:149-150) */
        :host([variant="glass"]) button:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.22)) !important;
          color: var(--text-primary, #e2e8f0) !important;
          box-shadow: 0 4px 16px rgba(99,102,241,0.25) !important;
        }

        /* .btn-glass-inactive hover (admin.css:159) */
        :host([variant="glass-inactive"]) button:not(:disabled):hover {
          border-color: rgba(99,102,241,0.25) !important;
          color: var(--text-primary, #e2e8f0) !important;
          background: rgba(99,102,241,0.08) !important;
        }

        /* .table-btn hover — 玻璃态光晕增强 */
        :host([variant="table"]) button:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(99,102,241,0.35), rgba(139,92,246,0.25)) !important;
          border-color: rgba(99,102,241,0.5) !important;
          color: #e0e7ff !important;
          box-shadow: 0 4px 20px rgba(99,102,241,0.35), inset 0 1px 0 rgba(255,255,255,0.1) !important;
        }

        /* .table-btn.btn-primary hover — 紫色光晕爆发 */
        :host([variant="table-primary"]) button:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.38)) !important;
          color: #fff !important;
          box-shadow: 0 4px 20px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.12) !important;
        }

        /* .table-btn.btn-danger hover — 红色光晕 */
        :host([variant="table-danger"]) button:not(:disabled):hover {
          background: linear-gradient(135deg, rgba(239,68,68,0.45), rgba(220,38,38,0.32)) !important;
          color: #fef2f2 !important;
          box-shadow: 0 4px 20px rgba(239,68,68,0.35), inset 0 1px 0 rgba(255,255,255,0.08) !important;
        }

        /* primary hover — 增强发光 */
        :host([variant="primary"]) button:not(:disabled):hover {
          box-shadow: 0 4px 16px rgba(102,126,234,0.5) !important;
          filter: brightness(1.08);
        }

        /* danger hover */
        :host([variant="danger"]) button:not(:disabled):hover {
          box-shadow: 0 4px 16px rgba(239,68,68,0.35) !important;
          filter: brightness(1.08);
        }

        /* warning hover */
        :host([variant="warning"]) button:not(:disabled):hover {
          box-shadow: 0 4px 16px rgba(251,191,36,0.35) !important;
          filter: brightness(1.08);
        }

        /* outline hover */
        :host([variant="outline"]) button:not(:disabled):hover {
          background: rgba(99,102,241,0.1) !important;
          box-shadow: 0 2px 8px rgba(102,126,234,0.2) !important;
        }

        /* secondary hover */
        :host([variant="secondary"]) button:not(:disabled):hover {
          background: rgba(99,102,241,0.15) !important;
          border-color: rgba(129,140,248,0.4) !important;
          box-shadow: 0 2px 8px rgba(99,102,241,0.1) !important;
        }

        /* link hover */
        :host([variant="link"]) button:not(:disabled):hover {
          text-decoration: underline;
          opacity: 0.85;
        }

        /* 键盘焦点 */
        button:focus-visible {
          box-shadow: 0 0 0 3px rgba(102,126,234,0.3) !important;
        }
      </style>
      <button type="${this.btnType}" ${disabledAttr}>
        <slot></slot>
      </button>
    `;
  }
}

customElements.define('pv-button', PvButton);
