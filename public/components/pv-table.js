/**
 * pv-table - 数据表格组件
 * 
 * 属性:
 *   striped: 斑马纹 (无值属性)
 *   hover: 悬停高亮 (无值属性)
 *   sm: 紧凑模式 (无值属性)
 * 
 * 方法:
 *   setData(data) - 设置表格数据
 *   setColumns(columns) - 设置列定义 [{label, field, width, align, render}]
 * 
 * 使用方式:
 *   <pv-table id="myTable" striped hover></pv-table>
 *   const table = document.getElementById('myTable');
 *   table.setColumns([{label:'名称', field:'name'}, {label:'状态', field:'status'}]);
 *   table.setData([{name:'VM1', status:'running'}]);
 */
class PvTable extends HTMLElement {
  static get observedAttributes() {
    return ['striped', 'hover', 'sm'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._data = [];
    this._columns = [];
  }

  connectedCallback() {
    this.render();
  }

  get isStriped() {
    return this.hasAttribute('striped');
  }
  get isHover() {
    return this.hasAttribute('hover');
  }
  get isSm() {
    return this.hasAttribute('sm');
  }

  setData(data) {
    this._data = data || [];
    this._renderTable();
  }

  setColumns(columns) {
    this._columns = columns || [];
    this._renderTable();
  }

  _renderTable() {
    const tbody = this.shadowRoot.querySelector('tbody');
    const thead = this.shadowRoot.querySelector('thead');
    if (!tbody || !thead) return;

    // 渲染表头
    thead.innerHTML = '<tr>' + this._columns.map(col => {
      const width = col.width ? `style="width:${col.width}"` : '';
      const align = col.align ? `style="text-align:${col.align}"` : '';
      return `<th ${width} ${align}>${col.label || ''}</th>`;
    }).join('') + '</tr>';

    // 渲染表体
    if (this._data.length === 0) {
      const colspan = this._columns.length || 1;
      tbody.innerHTML = `<tr><td colspan="${colspan}" class="empty-cell">暂无数据</td></tr>`;
    } else {
      tbody.innerHTML = this._data.map((row, idx) => {
        const rowClass = this.isStriped && idx % 2 === 1 ? ' class="striped"' : '';
        return `<tr${rowClass}>` + this._columns.map(col => {
          let value = col.field ? (row[col.field] !== undefined ? row[col.field] : '') : '';
          if (col.render && typeof col.render === 'function') {
            value = col.render(value, row);
          }
          const align = col.align ? `style="text-align:${col.align}"` : '';
          return `<td ${align}>${value}</td>`;
        }).join('') + '</tr>';
      }).join('');
    }
  }

  render() {
    const smClass = this.isSm ? ' sm' : '';
    const hoverClass = this.isHover ? ' hover' : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
        }
        .table-wrap {
          overflow-x: auto;
          width: 100%;
        }
        table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.875rem;
          color: var(--text-primary, #e0e0e0);
        }
        table.sm th,
        table.sm td {
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
        }
        thead th {
          padding: 0.75rem 0.875rem;
          font-weight: 600;
          text-align: left;
          background: var(--bg-hover, rgba(255,255,255,0.02));
          border-bottom: 2px solid var(--border-color, rgba(255,255,255,0.08));
          color: var(--text-secondary, #a0a0a0);
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          white-space: nowrap;
          position: sticky;
          top: 0;
          z-index: 1;
        }
        thead th:first-child {
          border-top-left-radius: 8px;
          border-bottom-left-radius: 8px;
        }
        thead th:last-child {
          border-top-right-radius: 8px;
          border-bottom-right-radius: 8px;
        }
        tbody td {
          padding: 0.75rem 0.875rem;
          border-bottom: 1px solid var(--border-light, rgba(255,255,255,0.04));
          color: var(--text-primary, #e0e0e0);
          vertical-align: middle;
        }
        tbody tr:last-child td {
          border-bottom: none;
        }
        ${this.isStriped ? `
        tbody tr.striped {
          background: var(--bg-hover, rgba(255,255,255,0.02));
        }
        ` : ''}
        ${this.isHover ? `
        tbody tr:hover {
          background: var(--bg-hover, rgba(255,255,255,0.04));
        }
        ` : ''}
        .empty-cell {
          text-align: center;
          padding: 3rem 1rem;
          color: var(--text-muted, #888);
          font-size: 0.9rem;
        }
      </style>
      <div class="table-wrap">
        <table class="${smClass}${hoverClass}">
          <thead></thead>
          <tbody></tbody>
        </table>
      </div>
    `;
  }
}

customElements.define('pv-table', PvTable);