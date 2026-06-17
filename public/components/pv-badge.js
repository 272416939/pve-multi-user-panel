/**
 * pv-badge - 徽标组件
 * 
 * 属性:
 *   variant: success | warning | danger | info (默认 info)
 */
class PvBadge extends HTMLElement {
  static get observedAttributes() {
    return ['variant'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal !== newVal && this.shadowRoot.innerHTML) {
      this.render();
    }
  }

  get variant() {
    return this.getAttribute('variant') || 'info';
  }

  render() {
    const variant = this.variant;

    const variantStyles = {
      success: `
        background: color-mix(in srgb, var(--color-success, #28a745) 15%, transparent);
        color: var(--color-success, #28a745);
        border: 1px solid color-mix(in srgb, var(--color-success, #28a745) 30%, transparent);
      `,
      warning: `
        background: color-mix(in srgb, var(--color-warning, #ffc107) 15%, transparent);
        color: var(--color-warning, #ffc107);
        border: 1px solid color-mix(in srgb, var(--color-warning, #ffc107) 30%, transparent);
      `,
      danger: `
        background: color-mix(in srgb, var(--color-danger, #dc3545) 15%, transparent);
        color: var(--color-danger, #dc3545);
        border: 1px solid color-mix(in srgb, var(--color-danger, #dc3545) 30%, transparent);
      `,
      info: `
        background: color-mix(in srgb, var(--color-info, #17a2b8) 15%, transparent);
        color: var(--color-info, #17a2b8);
        border: 1px solid color-mix(in srgb, var(--color-info, #17a2b8) 30%, transparent);
      `
    };

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: inline-block;
        }
        span {
          display: inline-block;
          padding: 0.2em 0.6em;
          font-size: 0.75em;
          font-weight: 600;
          border-radius: 0.25rem;
          line-height: 1.4;
          white-space: nowrap;
          ${variantStyles[variant] || variantStyles.info}
        }
      </style>
      <span><slot></slot></span>
    `;
  }
}

customElements.define('pv-badge', PvBadge);