(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'finance'">
                    <div v-if="activeTab === 'transactions'">
                        <div class="module-header">
                        <h4 class="module-title">交易流水</h4>
                    </div>
                    <div class="table-container" style="padding:12px;">
                        <!-- 筛选栏 -->
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-md-2">
                                <label class="form-label small mb-1">开始时间</label>
                                <input type="datetime-local" class="form-control form-control-sm" v-model="financeFilter.start_time">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">结束时间</label>
                                <input type="datetime-local" class="form-control form-control-sm" v-model="financeFilter.end_time">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">支付方式</label>
                                <select class="form-select form-select-sm" v-model="financeFilter.pay_method">
                                    <option value="">全部</option>
                                    <option value="alipay">支付宝</option>
                                    <option value="wxpay">微信支付</option>
                                    <option value="balance">余额抵扣</option>
                                    <option value="balance_refund">余额退款</option>
                                    <option value="alipay_refund">支付宝退款</option>
                                    <option value="wxpay_refund">微信退款</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">交易类型</label>
                                <select class="form-select form-select-sm" v-model="financeFilter.trade_type">
                                    <option value="">全部</option>
                                    <option value="recharge">余额充值</option>
                                    <option value="renewal">服务器续费</option>
                                    <option value="admin_recharge">后台充值</option>
                                    <option value="new_order">新购服务器</option>
                                </select>
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">订单号搜索</label>
                                <input type="text" class="form-control form-control-sm" v-model="financeFilter.order_no" placeholder="精确搜索" @keyup.enter="loadTransactions(1)">
                            </div>
                            <div class="col-md-2">
                                <pv-button @click="loadTransactions(1)" size="sm">查询</pv-button>
                                <pv-button @click="exportTransactions" variant="outline" size="sm">导出Excel</pv-button>
                            </div>
                        </div>

                        <!-- 表格 -->
                        <table class="table table-hover table-sm">
                            <thead>
                                <tr>
                                    <th>支付时间</th>
                                    <th>用户名</th>
                                    <th>支付方式</th>
                                    <th>商户订单号</th>
                                    <th>支付流水号</th>
                                    <th>交易类型</th>
                                    <th>交易金额</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="tx in transactionList" :key="tx.id">
                                    <td>{{ formatDate(tx.pay_time) }}</td>
                                    <td>{{ tx.username }}</td>
                                    <td>{{ tx.pay_method === 'alipay' ? '支付宝' : tx.pay_method === 'wxpay' ? '微信支付' : tx.pay_method === 'balance' ? '余额抵扣' : tx.pay_method === 'manual' ? '系统' : tx.pay_method }}</td>
                                    <td><code style="font-size:11px;">{{ tx.order_no }}</code></td>
                                    <td><code style="font-size:11px;">{{ tx.trade_no || '-' }}</code></td>
                                    <td><span :class="tx.trade_type === 'recharge' ? 'badge bg-success' : tx.trade_type === 'admin_recharge' ? 'badge bg-warning' : tx.trade_type === 'refund' ? 'badge bg-warning' : tx.trade_type === 'new_order' ? 'badge bg-primary' : 'badge badge-renewal'" :style="tx.trade_type !== 'recharge' && tx.trade_type !== 'admin_recharge' && tx.trade_type !== 'refund' && tx.trade_type !== 'new_order' ? 'background:#0d9488;color:#fff' : ''">{{ tx.trade_type === 'recharge' ? '余额充值' : tx.trade_type === 'admin_recharge' ? '后台充值' : tx.trade_type === 'refund' ? '订单退款' : tx.trade_type === 'new_order' ? '新购服务器' : '服务器续费' }}</span></td>
                                    <td>¥{{ tx.amount }}</td>
                                </tr>
                                <tr v-if="!transactionList || transactionList.length === 0">
                                    <td colspan="7" class="text-center text-muted py-4">暂无交易记录</td>
                                </tr>
                            </tbody>
                        </table>

                        <!-- 分页 -->
                        <div class="d-flex justify-content-between align-items-center mt-3" v-if="transactionTotal > 0">
                            <small class="text-muted">共 {{ transactionTotal }} 条</small>
                            <div>
                                <pv-button :disabled="financePage <= 1" @click="loadTransactions(financePage - 1)" variant="outline" size="sm">上一页</pv-button>
                                <span class="mx-2 text-muted small">{{ financePage }} / {{ Math.ceil(transactionTotal / 20) || 1 }}</span>
                                <pv-button :disabled="financePage * 20 >= transactionTotal" @click="loadTransactions(financePage + 1)" variant="outline" size="sm">下一页</pv-button>
                            </div>
                        </div>
                    </div>
                    </div>

                    <!-- 订单管理 -->
                    <div v-if="activeTab === 'orders'">
                        <div class="module-header">
                            <h4 class="module-title">订单管理</h4>
                        </div>
                        <div class="card">
                            <!-- 筛选栏 -->
                            <div class="card-body pb-0">
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">订单号</label>
                                        <input type="text" class="form-control form-control-sm" v-model="orderFilter.order_no" placeholder="搜索订单号">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">类型</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.type">
                                            <option value="">全部</option>
                                            <option value="vm">VM</option>
                                            <option value="lxc">LXC</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">状态</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.status">
                                            <option value="">全部</option>
                                            <option value="completed">已开通</option>
                                            <option value="pending">处理中</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">开始时间</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="orderFilter.start_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">结束时间</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="orderFilter.end_time">
                                    </div>
                                    <div class="col-md-2 d-flex gap-2">
                                        <pv-button @click="searchOrders" size="sm">查询</pv-button>
                                        <pv-button @click="exportOrders" size="sm">导出</pv-button>
                                    </div>
                                </div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-striped mb-0">
                                    <thead>
                                        <tr><th>订单号</th><th>用户名</th><th>套餐</th><th>类型</th><th>周期</th><th>数量</th><th>金额</th><th>状态</th><th>开通时间</th></tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="o in orders" :key="o.id">
                                            <td><code>{{ o.order_no }}</code></td>
                                            <td>{{ o.username }}</td>
                                            <td>{{ o.package_name }}</td>
                                            <td><span :class="o.type === 'vm' ? 'badge bg-info' : 'badge bg-success'">{{ o.type === 'vm' ? 'VM' : 'LXC' }}</span></td>
                                            <td>{{ o.period === 'month' ? '月付' : o.period === 'quarter' ? '季付' : '年付' }}</td>
                                            <td>{{ o.period_count }}</td>
                                            <td>{{ o.amount }} 元</td>
                                            <td><span class="badge" :class="o.status === 'completed' ? 'bg-success' : 'bg-warning'">{{ o.status === 'completed' ? '已开通' : o.status }}</span></td>
                                            <td>{{ formatDate(o.created_at) }}</td>
                                        </tr>
                                        <tr v-if="!orders || orders.length === 0"><td colspan="9" class="text-center text-muted">暂无订单</td></tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <!-- 分页 -->
                        <div class="d-flex justify-content-between align-items-center mt-3" v-if="orderTotal > 0">
                            <small class="text-muted">共 {{ orderTotal }} 条</small>
                            <div>
                                <pv-button :disabled="orderPage <= 1" @click="loadOrders(orderPage-1)" variant="outline" size="sm">上一页</pv-button>
                                <span class="mx-2 text-muted small">{{ orderPage }} / {{ Math.ceil(orderTotal / 20) || 1 }}</span>
                                <pv-button :disabled="orderPage*20 >= orderTotal" @click="loadOrders(orderPage+1)" variant="outline" size="sm">下一页</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 系统更新（独立区域） -->
                

`);
})();
