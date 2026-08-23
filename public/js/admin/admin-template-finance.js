(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'finance'">
                    <div v-if="activeTab === 'transactions'">
                        <div class="module-header">
                        <h4 class="module-title">{{ t('admin.finance.title') }}</h4>
                    </div>
                    <div class="table-container" style="padding:12px;">
                        <!-- 筛选栏 -->
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.finance.startTime') }}</label>
                                <input type="datetime-local" class="form-control form-control-sm" v-model="financeFilter.start_time">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.finance.endTime') }}</label>
                                <input type="datetime-local" class="form-control form-control-sm" v-model="financeFilter.end_time">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.finance.payMethod') }}</label>
                                <select class="form-select form-select-sm" v-model="financeFilter.pay_method">
                                    <option value="">{{ t('common.all') }}</option>
                                    <option value="alipay">{{ t('admin.finance.alipay') }}</option>
                                    <option value="wxpay">{{ t('admin.finance.wxpay') }}</option>
                                    <option value="balance">{{ t('admin.finance.balanceDeduct') }}</option>
                                    <option value="balance_refund">{{ t('admin.finance.balanceRefund') }}</option>
                                    <option value="alipay_refund">{{ t('admin.finance.alipayRefund') }}</option>
                                    <option value="wxpay_refund">{{ t('admin.finance.wxpayRefund') }}</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.finance.tradeType') }}</label>
                                <select class="form-select form-select-sm" v-model="financeFilter.trade_type">
                                    <option value="">{{ t('common.all') }}</option>
                                    <option value="recharge">{{ t('admin.finance.tRecharge') }}</option>
                                    <option value="renewal">{{ t('admin.finance.tRenewal') }}</option>
                                    <option value="admin_recharge">{{ t('admin.finance.tAdminRecharge') }}</option>
                                    <option value="new_order">{{ t('admin.finance.tNewOrder') }}</option>
                                    <option value="disk_purchase">{{ t('admin.finance.tDiskPurchase') }}</option>
                                    <option value="disk_renewal">{{ t('admin.finance.tDiskRenewal') }}</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.finance.orderNoSearch') }}</label>
                                <input type="text" class="form-control form-control-sm" v-model="financeFilter.order_no" :placeholder="t('admin.finance.exactSearch')" autocomplete="off" @keyup.enter="loadTransactions(1)">
                            </div>
                            <div class="col-md-2 d-flex gap-2 align-items-center">
                                <pv-button @click="loadTransactions(1)" size="sm">{{ t('admin.finance.search') }}</pv-button>
                                <pv-button @click="exportTransactions" variant="outline" size="sm">{{ t('admin.finance.exportExcel') }}</pv-button>
                            </div>
                        </div>

                        <!-- 表格 -->
                        <table class="table table-hover table-sm table-align-center">
                            <thead>
                                <tr>
                                    <th>{{ t('admin.finance.payTime') }}</th>
                                    <th>{{ t('admin.logs.username') }}</th>
                                    <th>{{ t('admin.finance.payMethod') }}</th>
                                    <th>{{ t('admin.finance.orderNo') }}</th>
                                    <th>{{ t('admin.finance.relatedOrder') }}</th>
                                    <th>{{ t('admin.finance.tradeType') }}</th>
                                    <th>{{ t('admin.finance.tradeAmount') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="tx in transactionList" :key="tx.id">
                                    <td>{{ formatDate(tx.pay_time) }}</td>
                                    <td>{{ tx.username }}</td>
                                    <td>{{ tx.pay_method === 'alipay' ? t('admin.finance.alipay') : tx.pay_method === 'wxpay' ? t('admin.finance.wxpay') : tx.pay_method === 'balance' ? t('admin.finance.balanceDeduct') : tx.pay_method === 'manual' ? t('admin.finance.system') : tx.pay_method === 'balance_refund' ? t('admin.finance.balanceRefund') : tx.pay_method === 'alipay_refund' ? t('admin.finance.alipayRefund') : tx.pay_method === 'wxpay_refund' ? t('admin.finance.wxpayRefund') : tx.pay_method }}</td>
                                    <td><code style="font-size:11px;">{{ tx.order_no }}</code></td>
                                    <td><code style="font-size:11px;">{{ tx.trade_no || '-' }}</code></td>
                                    <td><span :class="tx.trade_type === 'recharge' ? 'badge bg-success' : tx.trade_type === 'admin_recharge' ? 'badge bg-warning' : tx.trade_type === 'refund' ? 'badge bg-warning' : tx.trade_type === 'new_order' ? 'badge bg-primary' : tx.trade_type === 'disk_purchase' ? 'badge bg-info' : tx.trade_type === 'disk_renewal' ? 'badge bg-primary' : 'badge badge-renewal'" :style="tx.trade_type !== 'recharge' && tx.trade_type !== 'admin_recharge' && tx.trade_type !== 'refund' && tx.trade_type !== 'new_order' && tx.trade_type !== 'disk_purchase' && tx.trade_type !== 'disk_renewal' ? 'background:#0d9488;color:#fff' : ''">{{ tx.trade_type === 'recharge' ? t('admin.finance.tRecharge') : tx.trade_type === 'admin_recharge' ? t('admin.finance.tAdminRecharge') : tx.trade_type === 'refund' ? t('admin.finance.tRefund') : tx.trade_type === 'new_order' ? t('admin.finance.tNewOrder') : tx.trade_type === 'disk_purchase' ? t('admin.finance.tDiskPurchase') : tx.trade_type === 'disk_renewal' ? t('admin.finance.tDiskRenewal') : t('admin.finance.tRenewal') }}</span></td>
                                    <td>¥{{ tx.amount }}</td>
                                </tr>
                                <tr v-if="!transactionList || transactionList.length === 0">
                                    <td colspan="7" class="text-center text-muted py-4">{{ t('admin.finance.empty') }}</td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                        <pv-pagination :total="transactionTotal" :page="financePage" :page-size="financePageSize" @change="loadTransactions" @page-size-change="changeFinancePageSize"></pv-pagination>
                    </div>
                    </div>

                    <!-- 订单管理 -->
                    <div v-if="activeTab === 'orders'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.finance.ordersTitle') }}</h4>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                            <!-- 筛选栏 -->
                            <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('admin.finance.orderNo') }}</label>
                                        <input type="text" class="form-control form-control-sm" v-model="orderFilter.order_no" :placeholder="t('admin.finance.orderNoPlaceholder')" autocomplete="off">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('admin.finance.type') }}</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.type">
                                            <option value="">{{ t('common.all') }}</option>
                                            <option value="vm">VM</option>
                                            <option value="lxc">LXC</option>
                                            <option value="disk">{{ t('admin.finance.disk') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('common.status') }}</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.status">
                                            <option value="">{{ t('common.all') }}</option>
                                            <option value="completed">{{ t('admin.finance.oCompleted') }}</option>
                                            <option value="pending">{{ t('admin.finance.oPending') }}</option>
                                            <option value="refunded">{{ t('admin.finance.oRefunded') }}</option>
                                            <option value="destroyed">{{ t('admin.finance.oDestroyed') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('admin.finance.startTime') }}</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="orderFilter.start_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('admin.finance.endTime') }}</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="orderFilter.end_time">
                                    </div>
                                    <div class="col-md-2 d-flex gap-2">
                                        <pv-button @click="searchOrders" size="sm">{{ t('admin.finance.search') }}</pv-button>
                                        <pv-button @click="exportOrders" size="sm">{{ t('common.export') }}</pv-button>
                                    </div>
                                </div>
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 table-align-center">
                                    <thead>
                                        <tr><th>{{ t('admin.finance.orderNo') }}</th><th>{{ t('admin.logs.username') }}</th><th>{{ t('admin.finance.product') }}</th><th>{{ t('admin.finance.type') }}</th><th>{{ t('admin.finance.period') }}</th><th>{{ t('common.quantity') }}</th><th>{{ t('admin.finance.amount') }}</th><th>{{ t('common.status') }}</th><th>{{ t('admin.finance.createdAt') }}</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="o in orders" :key="o.id">
                                            <td><code>{{ o.order_no }}</code></td>
                                            <td>{{ o.username }}</td>
                                            <td>{{ o.order_kind === 'renewal' ? (o.type === 'disk' ? (o.resource_name || '') : (o.resource_name || '') + '（' + (o.type === 'vm' ? 'vm' : 'lxc') + '：' + o.resource_id + '）') : (o.type === 'disk' ? o.package_name : o.package_name + '[' + (o.type === 'vm' ? 'vm' : 'lxc') + '：' + o.resource_id + ']') }}</td>
                                            <td><span :class="o.type === 'vm' ? 'badge bg-info' : o.type === 'lxc' ? 'badge bg-success' : 'badge bg-warning'">{{ o.order_kind === 'renewal' ? (o.type === 'vm' ? t('admin.finance.vmRenewal') : o.type === 'lxc' ? t('admin.finance.lxcRenewal') : t('admin.finance.diskRenewal')) : (o.type === 'vm' ? 'VM' : o.type === 'lxc' ? 'LXC' : t('admin.finance.disk')) }}</span></td>
                                            <td>{{ o.period === 'month' ? t('admin.finance.monthly') : o.period === 'quarter' ? t('admin.finance.quarterly') : t('admin.finance.yearly') }}</td>
                                            <td>{{ o.period_count }}</td>
                                            <td>{{ tFormat('admin.finance.amountYuan', o.amount) }}</td>
                                            <td><span class="badge" :class="o.status === 'completed' ? 'bg-success' : o.status === 'refunded' ? 'bg-danger' : o.status === 'destroyed' ? 'bg-secondary' : 'bg-warning'">{{ o.status === 'completed' ? t('admin.finance.oCompleted') : o.status === 'refunded' ? t('admin.finance.oRefunded') : o.status === 'destroyed' ? t('admin.finance.oDestroyed') : o.status === 'pending' ? t('admin.finance.oPending') : o.status }}</span></td>
                                            <td>{{ formatDate(o.created_at) }}</td>
                                        </tr>
                                        <tr v-if="!orders || orders.length === 0"><td colspan="9" class="text-center text-muted">{{ t('admin.finance.noOrders') }}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                            <pv-pagination :total="orderTotal" :page="orderPage" :page-size="orderPageSize" @change="loadOrders" @page-size-change="changeOrderPageSize"></pv-pagination>
                        </div>
                    </div>
                </div>

                <!-- 系统更新（独立区域） -->
                

`);
})();
