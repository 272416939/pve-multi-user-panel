/**
 * pv-dropdown - 下拉菜单组件
 * 
 * 使用方式:
 *   <pv-dropdown>
 *     <button slot="trigger">菜单</button>
 *     <div slot="menu">
 *       <a href="#">选项1</a>
 *       <a href="#">选项2</a>
 *     </div>
 *   </pv-dropdown>
 * 
 * 特性:
 *   - 点击触发按钮显示/隐藏菜单
 *   - 点击外部自动关闭
 *   - 同一时间只有一个下拉菜单打开
 */
class PvDropdown extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._isOpen = false;
    this._boundDocClick = this._handleDocClick.bind(this);
  }

  connectedCallback() {
    this.render();
    this._setupEvents();
  }

  disconnectedCallback() {
    document.removeEventListener('click', this._boundDocClick);
  }

  toggle() {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    // 关闭其他所有下拉菜单
    document.querySelectorAll('pv-dropdown').forEach(d => {
      if (d !== this) d.close();
    });
    this._isOpen = true;
    const menu = this.shadowRoot.querySelector('.dropdown-menu');
    if (menu) menu.classList.add('show');
    document.addEventListener('click', this._boundDocClick);
  }

  close() {
    this._isOpen = false;
    const menu = this.shadowRoot.querySelector('.dropdown-menu');
    if (menu) menu.classList.remove('show');
    document.removeEventListener('click', this._boundDocClick);
  }

  _handleDocClick(e) {
    if (!this.contains(e.target)) {
      this.close();
    }
  }

  _setupEvents() {
    const trigger = this.shadowRoot.querySelector('.dropdown-trigger');
    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggle();
      });
    }
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
          position: relative;
        }
        .dropdown-trigger {
          cursor: pointer;
          display: inline-block;
        }
        .dropdown-menu {
          position: absolute;
          top: 100%;
          right: 0;
          margin-top: 4px;
          background: var(--bg-card, #1a1a2e);
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 8px;
          box-shadow: var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.3));
          min-width: 160px;
          z-index: 1000;
          opacity: 0;
          visibility: hidden;
          transform: translateY(-4px);
          transition: all 0.15s ease;
          padding: 4px;
        }
        .dropdown-menu.show {
          opacity: 1;
          visibility: visible;
          transform: translateY(0);
        }
        ::slotted(a),
        ::slotted(button) {
          display: block;
          width: 100%;
          padding: 8px 12px;
          color: var(--text-primary, #e0e0e0);
          text-decoration: none;
          border: none;
          background: none;
          text-align: left;
          font-size: 0.875rem;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.15s;
          box-sizing: border-box;
        }
        ::slotted(a:hover),
        ::slotted(button:hover) {
          background: var(--bg-hover, rgba(255,255,255,0.05));
        }
      </style>
      <div class="dropdown-trigger">
        <slot name="trigger"></slot>
      </div>
      <div class="dropdown-menu">
        <slot name="menu"></slot>
      </div>
    `;
  }
}

customElements.define('pv-dropdown', PvDropdown);