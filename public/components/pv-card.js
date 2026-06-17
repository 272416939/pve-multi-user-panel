/**
 * pv-card - 卡片组件
 * 
 * 属性:
 *   title: 卡片标题
 *   collapsible: 是否可折叠 (无值属性)
 * 
 * 使用方式:
 *   <pv-card title="标题">内容</pv-card>
 *   <pv-card title="可折叠" collapsible>内容</pv-card>
 */
class PvCard extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'collapsible'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this._setupCollapse();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this.shadowRoot.innerHTML) {
      this.render();
      this._setupCollapse();
    }
  }

  get title() {
    return this.getAttribute('title') || '';
  }

  get isCollapsible() {
    return this.hasAttribute('collapsible');
  }

  _setupCollapse() {
    if (!this.isCollapsible) return;
    const header = this.shadowRoot.querySelector('.card-header');
    const body = this.shadowRoot.querySelector('.card-body');
    if (header && body) {
      header.style.cursor = 'pointer';
      header.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? '' : 'none';
        const arrow = this.shadowRoot.querySelector('.collapse-arrow');
        if (arrow) {
          arrow.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
        }
      });
    }
  }

  render() {
    const title = this.title;
    const collapsible = this.isCollapsible;

    const headerHtml = title ? `
      <div class="card-header">
        <span class="card-title">${title}</span>
        ${collapsible ? '<span class="collapse-arrow" style="transition:transform 0.2s;display:inline-block;">▼</span>' : ''}
      </div>
    ` : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .card {
          background: var(--bg-card, #1a1a2e);
          border: 1px solid var(--border-color, rgba(255,255,255,0.08));
          border-radius: 12px;
          box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.15));
          overflow: hidden;
          transition: all 0.3s ease;
        }
        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.05));
          background: var(--bg-hover, rgba(255,255,255,0.02));
        }
        .card-title {
          font-size: 1rem;
          font-weight: 600;
          color: var(--text-primary, #e0e0e0);
          margin: 0;
        }
        .card-body {
          padding: 20px;
          color: var(--text-secondary, #a0a0a0);
        }
        .collapse-arrow {
          color: var(--text-muted, #888);
          font-size: 12px;
        }
      </style>
      <div class="card">
        ${headerHtml}
        <div class="card-body">
          <slot></slot>
        </div>
      </div>
    `;
  }
}

customElements.define('pv-card', PvCard);