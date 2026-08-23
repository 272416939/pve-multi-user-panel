/**
 * pv-pagination — 纯 Vue 全局组件（通用分页条，全项目表格分页的单一实现）
 * 结构/样式以日志中心分页条为标准：共 X 条 + 上下页 + 数字页码(±2窗口+省略号) + 每页条数 + 跳页
 * 所有视觉由 Bootstrap 工具类 + pv-buttons.css 驱动（无自有 CSS）
 * 用法：
 *   <pv-pagination :total="total" :page="page" :page-size="pageSize"
 *                  @change="loadPage" @page-size-change="changePageSize"></pv-pagination>
 * 说明：页码/省略号/跳页收敛逻辑内置，页面只维护 total/page/pageSize 三个状态并处理两个事件
 */
(function() {
  'use strict';

  var DEFAULT_SIZES = [20, 50, 100];

  var PvPagination = {
    props: {
      total: { type: Number, default: 0 },
      page: { type: Number, default: 1 },
      pageSize: { type: Number, default: 20 },
      sizeOptions: { type: Array, default: function() { return DEFAULT_SIZES.slice(); } },
      showSize: { type: Boolean, default: true },
      showJump: { type: Boolean, default: true }
    },
    emits: ['change', 'page-size-change'],
    data: function() {
      return { goPage: '' };
    },
    computed: {
      totalPages: function() {
        return Math.ceil(this.total / this.pageSize) || 1;
      },
      // 当前页前后 2 页窗口 + 首尾页 + 省略号（与日志中心分页逻辑一致）
      pageNumbers: function() {
        var totalPages = this.totalPages;
        var current = this.page;
        var pages = [];
        if (totalPages <= 7) {
          for (var i = 1; i <= totalPages; i++) pages.push(i);
          return pages;
        }
        var windowStart = Math.max(2, current - 2);
        var windowEnd = Math.min(totalPages - 1, current + 2);
        pages.push(1);
        if (windowStart > 2) pages.push('...');
        for (var j = windowStart; j <= windowEnd; j++) pages.push(j);
        if (windowEnd < totalPages - 1) pages.push('...');
        pages.push(totalPages);
        return pages;
      }
    },
    methods: {
      goTo: function(p) {
        var n = parseInt(p, 10);
        if (!n || isNaN(n)) return;
        if (n < 1) n = 1;
        if (n > this.totalPages) n = this.totalPages;
        this.$emit('change', n);
      },
      onPageSizeChange: function(e) {
        this.$emit('page-size-change', parseInt(e.target.value, 10) || 20);
      },
      onGoPage: function() {
        this.goTo(this.goPage);
      }
    },
    template: `
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3">
            <small class="text-muted">{{ tFormat('common.paginationTotal', total) }}</small>
            <div class="d-flex align-items-center gap-1">
                <pv-button variant="outline" size="sm" :disabled="page <= 1" @click="goTo(page - 1)">&lt;</pv-button>
                <template v-for="(p, idx) in pageNumbers" :key="idx">
                    <span v-if="p === '...'" class="text-muted small px-1">…</span>
                    <pv-button v-else size="sm" :variant="p === page ? 'primary' : 'outline'" @click="goTo(p)">{{ p }}</pv-button>
                </template>
                <pv-button variant="outline" size="sm" :disabled="page >= totalPages" @click="goTo(page + 1)">&gt;</pv-button>
                <select v-if="showSize" class="form-select form-select-sm ms-2" style="width:auto" :value="pageSize" @change="onPageSizeChange">
                    <option v-for="s in sizeOptions" :key="s" :value="s">{{ tFormat('common.paginationPerPage', s) }}</option>
                </select>
                <template v-if="showJump">
                    <span class="text-muted small ms-2">{{ t('common.paginationGo') }}</span>
                    <input type="number" class="form-control form-control-sm" style="width:70px" v-model="goPage" min="1" :max="totalPages" :placeholder="t('common.paginationPage')" autocomplete="off" @keyup.enter="onGoPage">
                    <span class="text-muted small">{{ t('common.paginationPage') }}</span>
                </template>
            </div>
        </div>
    `
  };

  if (typeof Vue !== 'undefined' && Vue.createApp) {
    var _createApp = Vue.createApp;
    Vue.createApp = function(rootComponent) {
      var app = _createApp.apply(this, arguments);
      app.component('pv-pagination', PvPagination);
      return app;
    };
  }

  window.PvPaginationComponent = PvPagination;
})();
