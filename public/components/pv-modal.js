/**
 * pv-modal - 模态框组件
 * 
 * 属性:
 *   title: 模态框标题
 *   size: sm | md | lg (默认 md)
 * 
 * 方法:
 *   open() - 打开模态框
 *   close() - 关闭模态框
 * 
 * 事件:
 *   pv-modal-close - 模态框关闭时触发
 * 
 * 使用方式:
 *   <pv-modal id="myModal" title="编辑" size="lg">
 *     <div>内容</div>
 *   </pv-modal>
 *   document.getElementById('myModal').open();
 */
class PvModal extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'size'];
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
    if (oldVal !== newVal && this.shadowRoot.innerHTML) {
      this.render();
      this._setupEvents();
    }
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  get size() {
    return this.getAttribute('size') || 'md';
  }

  open() {
    const overlay = this.shadowRoot.querySelector('.modal-overlay');
    if (overlay) {
      overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    }
  }

  close() {
    const overlay = this.shadowRoot.querySelector('.modal-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
    }
    this.dispatchEvent(new CustomEvent('pv-modal-close', { bubbles: true, composed: true }));
  }

  _setupEvents() {
    const overlay = this.shadowRoot.querySelector('.modal-overlay');
    const closeBtn = this.shadowRoot.querySelector('.modal-close');
    const content = this.shadowRoot.querySelector('.modal-content');

    if (overlay) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          this.close();
        }
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    // 阻止内容区点击冒泡到遮罩层
    if (content) {
      content.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  render() {
    const title = this.title;
    const size = this.size;

    const sizeStyles = {
      sm: 'max-width: 400px;',
      md: 'max-width: 600px;',
      lg: 'max-width: 900px;'
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: contents;
        }
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          backdrop-filter: blur(4px);
          -webkit-backdrop-filter: blur(4px);
        }
        .modal-overlay.show {
          opacity: 1;
          visibility: visible;
        }
        .modal-content {
          background: var(--bg-modal, var(--bg-card, #1a1a2e));
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 16px;
          box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3));
          width: 90%;
          ${sizeStyles[size] || sizeStyles.md}
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          transform: translateY(20px);
          transition: transform 0.3s ease;
        }
        .modal-overlay.show .modal-content {
          transform: translateY(0);
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.05));
          flex-shrink: 0;
        }
        .modal-title {
          font-size: 1.1rem;
          font-weight: 600;
          color: var(--text-primary, #e0e0e0);
          margin: 0;
        }
        .modal-close {
          background: none;
          border: none;
          color: var(--text-muted, #888);
          font-size: 1.5rem;
          cursor: pointer;
          padding: 0;
          line-height: 1;
          transition: color 0.2s;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 6px;
        }
        .modal-close:hover {
          color: var(--text-primary, #e0e0e0);
          background: var(--bg-hover, rgba(255,255,255,0.05));
        }
        .modal-body {
          padding: 20px;
          overflow-y: auto;
          flex: 1;
          color: var(--text-secondary, #a0a0a0);
        }
        .modal-footer {
          padding: 12px 20px;
          border-top: 1px solid var(--border-light, rgba(255,255,255,0.05));
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          flex-shrink: 0;
        }
      </style>
      <div class="modal-overlay">
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">${title}</h3>
            <button class="modal-close" aria-label="关闭">&times;</button>
          </div>
          <div class="modal-body">
            <slot></slot>
          </div>
          <div class="modal-footer">
            <slot name="footer"></slot>
          </div>
        </div>
      </div>
    `;
  }
}

customElements.define('pv-modal', PvModal);