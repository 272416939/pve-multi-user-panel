/**
 * pv-toast - 通知提示组件
 * 
 * 方法:
 *   show(message, type, duration) - 显示通知
 *     type: success | error | warning | info (默认 info)
 *     duration: 毫秒 (默认 3000)
 * 
 * 使用方式:
 *   <pv-toast id="myToast"></pv-toast>
 *   document.getElementById('myToast').show('操作成功', 'success');
 */
class PvToast extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._timer = null;
  }

  connectedCallback() {
    this.render();
  }

  show(message, type = 'info', duration = 3000) {
    // 清除之前的定时器
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }

    const container = this.shadowRoot.querySelector('.toast-container');
    const toast = this.shadowRoot.querySelector('.toast');
    const msgEl = this.shadowRoot.querySelector('.toast-message');

    if (!container || !toast || !msgEl) return;

    // 设置类型样式
    const typeColors = {
      success: { bg: 'color-mix(in srgb, var(--color-success, #28a745) 15%, transparent)', border: 'var(--color-success, #28a745)', icon: '✓' },
      error: { bg: 'color-mix(in srgb, var(--color-danger, #dc3545) 15%, transparent)', border: 'var(--color-danger, #dc3545)', icon: '✕' },
      warning: { bg: 'color-mix(in srgb, var(--color-warning, #ffc107) 15%, transparent)', border: 'var(--color-warning, #ffc107)', icon: '⚠' },
      info: { bg: 'color-mix(in srgb, var(--color-info, #17a2b8) 15%, transparent)', border: 'var(--color-info, #17a2b8)', icon: 'ℹ' }
    };

    const colors = typeColors[type] || typeColors.info;
    toast.style.background = colors.bg;
    toast.style.borderColor = colors.border;

    const iconEl = this.shadowRoot.querySelector('.toast-icon');
    if (iconEl) iconEl.textContent = colors.icon;

    msgEl.textContent = message;

    // 显示
    container.classList.add('show');

    // 自动隐藏
    this._timer = setTimeout(() => {
      container.classList.remove('show');
    }, duration);
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          position: fixed;
          top: 20px;
          right: 20px;
          z-index: 9999;
          pointer-events: none;
        }
        .toast-container {
          opacity: 0;
          transform: translateX(100%);
          transition: all 0.3s ease;
          pointer-events: auto;
        }
        .toast-container.show {
          opacity: 1;
          transform: translateX(0);
        }
        .toast {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 20px;
          border-radius: 8px;
          border: 1px solid;
          background: var(--bg-card, #1a1a2e);
          color: var(--text-primary, #e0e0e0);
          font-size: 14px;
          box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3));
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          min-width: 200px;
          max-width: 400px;
        }
        .toast-icon {
          font-size: 18px;
          font-weight: bold;
          flex-shrink: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: rgba(255,255,255,0.1);
        }
        .toast-message {
          flex: 1;
          line-height: 1.4;
        }
      </style>
      <div class="toast-container">
        <div class="toast">
          <span class="toast-icon"></span>
          <span class="toast-message"></span>
        </div>
      </div>
    `;
  }
}

customElements.define('pv-toast', PvToast);