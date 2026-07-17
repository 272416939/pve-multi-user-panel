(function() {
  var el = document.getElementById("appTemplate");
  if (el) el.innerHTML = `        <div v-if="!user" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">加载中...</span>
            </div>
            <p class="mt-2 text-muted">正在验证登录状态...</p>
        </div>

        <div v-else>
            <!-- 侧边栏子导航（通过Teleport渲染到#sidebarSubNav） -->
            <Teleport to="#sidebarSubNav">
                <a class="nav-item" :class="{ active: activeSubTab === 'settings' }"
                   @click.prevent="switchSubTab('settings')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="nav-text">个人设置</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'memos' }"
                   @click.prevent="switchSubTab('memos')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span><span class="nav-text">备忘录</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'messages' }"
                   @click.prevent="switchSubTab('messages')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span><span class="nav-text">消息</span>
                    <span v-if="unreadCount > 0" class="nav-badge">{{ unreadCount }}</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'security' }"
                   @click.prevent="switchSubTab('security')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span><span class="nav-text">安全</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'wallet-recharge' }"
                   @click.prevent="switchSubTab('wallet-recharge')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></span><span class="nav-text">余额充值</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'wallet-transactions' }"
                   @click.prevent="switchSubTab('wallet-transactions')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span><span class="nav-text">交易流水</span>
                </a>
                <a class="nav-item" :class="{ active: activeSubTab === 'orders' }"
                   @click.prevent="switchSubTab('orders'); loadMyOrders()">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></span><span class="nav-text">我的订单</span>
                </a>
            </Teleport>

            <div v-if="activeSubTab === 'settings'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <div class="d-flex align-items-center gap-3">
                                        <div class="avatar-circle">
                                            <img v-if="profileForm.avatar" :src="profileForm.avatar" class="avatar-img">
                                            <img v-else :src="getGeekAvatar(profileForm.username || user?.username)" class="avatar-img">
                                        </div>
                                        <div>
                                            <input type="file" class="form-control" accept=".jpg,.jpeg,.png" @change="handleAvatarUpload" style="max-width: 300px;">
                                            <small class="text-muted">支持 JPG、PNG，建议大小 200x200，最大 2MB</small>
                                        </div>
                                    </div>
                                </div>

                                <div class="mb-3">
                                    <label class="form-label">邮箱</label>
                                    <div class="d-flex gap-2">
                                        <input type="email" class="form-control" v-model="profileForm.email" placeholder="请输入邮箱">
                                        <pv-button v-if="!profileForm.email || profileForm.email !== user.email" type="button" variant="outline" @click="bindEmail">绑定</pv-button>
                                        <pv-button v-else-if="!profileForm.emailVerified" type="button" variant="secondary" @click="resendVerification">重发验证</pv-button>
                                    </div>
                                    <div class="mt-1">
                                        <small v-if="profileForm.emailVerified" class="text-success">✓ 已验证</small>
                                        <small v-else-if="profileForm.email && profileForm.email === user.email" class="text-warning">● 未验证 - 请查收验证邮件</small>
                                        <small v-else-if="profileForm.email" class="text-muted">点击「绑定」保存邮箱</small>
                                    </div>
                                </div>

                                <form @submit.prevent="updateProfile">
                                    <div class="mb-3">
                                        <label class="form-label">用户名</label>
                                        <input type="text" class="form-control" v-model="profileForm.username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">新密码（留空则不修改）</label>
                                        <input type="password" class="form-control" v-model="profileForm.password">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">个人简介</label>
                                        <textarea class="form-control" rows="3" v-model="profileForm.bio" placeholder="介绍一下自己..."></textarea>
                                    </div>
                                    <pv-button type="submit" variant="primary" >保存修改</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'memos'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">备忘录</h4>
                            <pv-button variant="primary" size="sm" @click="addMemo">+ 新建</pv-button>
                        </div>
                        <div v-if="memosLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">加载中...</span>
                            </div>
                        </div>
                        <div v-else-if="memos.length === 0" class="text-muted text-center py-4">
                            暂无备忘录，点击上方"新建"添加
                        </div>
                        <div v-else class="row g-3">
                            <div v-for="memo in memos" :key="memo.id" class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body d-flex flex-column">
                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                            <h6 class="mb-0">{{ memo.title || '无标题' }}</h6>
                                            <div class="btn-group btn-group-sm">
                                                <pv-button variant="secondary" @click="editMemo(memo)">编辑</pv-button>
                                                <pv-button variant="danger" @click="deleteMemo(memo.id)">删除</pv-button>
                                            </div>
                                        </div>
                                        <p class="card-text text-muted small flex-grow-1">{{ memo.content || '无内容' }}</p>
                                        <small class="text-muted">更新于: {{ formatDate(memo.updated_at) }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'messages'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">消息</h4>
                            <div class="d-flex gap-2">
                                <pv-button variant="outline" size="sm" @click="markAllRead">全部标已读</pv-button>
                                <pv-button variant="danger" size="sm" @click="clearAllMessages">清空已读</pv-button>
                            </div>
                        </div>
                        <ul class="nav nav-pills mb-3">
                            <li class="nav-item"><pv-button :class="{ active: msgType === 'all' }" @click="msgType = 'all'; loadMessages()">全部</pv-button></li>
                            <li class="nav-item"><pv-button :class="{ active: msgType === '1' }" @click="msgType = '1'; loadMessages()">系统公告</pv-button></li>
                            <li class="nav-item"><pv-button :class="{ active: msgType === '2' }" @click="msgType = '2'; loadMessages()">业务通知</pv-button></li>
                            <li class="nav-item"><pv-button :class="{ active: msgType === '3' }" @click="msgType = '3'; loadMessages()">续费提醒</pv-button></li>
                            <li class="nav-item"><pv-button :class="{ active: msgType === '5' }" @click="msgType = '5'; loadMessages()">客服私聊</pv-button></li>
                        </ul>
                        <div v-if="messagesLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">加载中...</span>
                            </div>
                        </div>
                        <div v-else-if="messages.length === 0" class="text-muted text-center py-4">暂无消息</div>
                        <div v-else class="message-list">
                            <div v-for="msg in messages" :key="msg.id" class="message-item" :class="{ 'message-unread': !msg.is_read }" @click="viewMessage(msg)">
                                <div class="message-header">
                                    <span class="message-type-badge" :class="'msg-type-' + msg.type">
                                        {{ {1:'系统公告',2:'业务通知',3:'续费提醒',4:'工单消息',5:'客服私聊'}[msg.type] || '消息' }}
                                    </span>
                                    <span class="d-flex align-items-center gap-2">
                                        <span class="message-status-badge" :class="msg.is_read ? 'status-read' : 'status-unread'">{{ msg.is_read ? '已读' : '未读' }}</span>
                                        <span class="message-time">{{ formatDate(msg.created_at) }}</span>
                                    </span>
                                </div>
                                <div class="message-title">{{ msg.title }}</div>
                                <div class="message-preview">{{ trimContent(msg.content) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 余额充值 -->
            <div v-if="activeSubTab === 'wallet-recharge'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <span class="text-muted">当前余额：</span>
                                    <span class="fw-bold fs-5">¥{{ walletBalance }}</span>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">请输入充值金额</label>
                                    <input type="number" step="0.01" min="0.01" class="form-control" v-model="rechargeAmount" placeholder="如: 10.00" style="max-width:300px;">
                                    <small class="text-muted">最低充值 {{ payMethods.min_amount }} 元，最高 {{ payMethods.max_amount }} 元</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">支付方式</label>
                                    <div v-if="payMethods.alipay" class="form-check">
                                        <input class="form-check-input" type="radio" v-model="rechargeMethod" value="alipay" id="ucPayAlipay">
                                        <label class="form-check-label" for="ucPayAlipay">支付宝</label>
                                    </div>
                                    <div v-if="payMethods.wxpay" class="form-check">
                                        <input class="form-check-input" type="radio" v-model="rechargeMethod" value="wxpay" id="ucPayWxpay">
                                        <label class="form-check-label" for="ucPayWxpay">微信支付</label>
                                    </div>
                                    <div v-if="!payMethods.alipay && !payMethods.wxpay" class="text-muted small">暂无可用的支付方式</div>
                                </div>
                                <div v-if="rechargeError" class="alert alert-danger py-2 mb-3">{{ rechargeError }}</div>
                                <pv-button variant="primary" @click="submitRecharge" :disabled="!rechargeMethod || !rechargeAmount || rechargeSubmitting">
                                    <span v-if="rechargeSubmitting">提交中...</span>
                                    <span v-else>提交充值</span>
                                </pv-button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 交易明细 -->
            <div v-if="activeSubTab === 'wallet-transactions'">
                <div class="row justify-content-center">
                    <div class="col-md-10">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">交易明细</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">开始时间</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="txFilter.start_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">结束时间</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="txFilter.end_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">交易类型</label>
                                        <select class="form-select form-select-sm" v-model="txFilter.trade_type">
                                            <option value="">全部</option>
                                            <option value="recharge">余额充值</option>
                                            <option value="admin_recharge">后台充值</option>
                                            <option value="new_order">新购服务器</option>
                                            <option value="renewal">服务器续费</option>
                                            <option value="refund">订单退款</option>
                                            <option value="disk_purchase">新购硬盘</option>
                                            <option value="disk_renewal">续费硬盘</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">订单号</label>
                                        <input type="text" class="form-control form-control-sm" v-model="txFilter.order_no" placeholder="精确搜索" @keyup.enter="loadTx(1)">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button variant="primary" size="sm" @click="loadTx(1)">查询</pv-button>
                                        <pv-button variant="outline" size="sm" class="ms-1" @click="txFilter = {start_time:'',end_time:'',trade_type:'',order_no:''};loadTx(1);">重置</pv-button>
                                    </div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-hover table-sm mb-0 table-align-center">
                                        <thead><tr><th>支付时间</th><th>支付方式</th><th>商户订单号</th><th>支付流水号</th><th>类型</th><th>金额</th></tr></thead>
                                        <tbody>
                                            <tr v-for="tx in txList" :key="tx.id">
                                                <td>{{ formatDate(tx.pay_time) }}</td>
                                                <td>{{ tx.pay_method === 'alipay' ? '支付宝' : tx.pay_method === 'wxpay' ? '微信支付' : tx.pay_method === 'balance' ? '余额抵扣' : tx.pay_method === 'manual' ? '系统' : tx.pay_method === 'balance_refund' ? '余额退款' : tx.pay_method === 'alipay_refund' ? '支付宝退款' : tx.pay_method === 'wxpay_refund' ? '微信退款' : tx.pay_method }}</td>
                                                <td><code style="font-size:11px;">{{ tx.order_no }}</code> <pv-button variant="link" size="sm" class="p-0 ms-1" @click="copyOrderNo(tx.order_no)" title="复制">📋</pv-button></td>
                                                <td><code style="font-size:11px;">{{ tx.trade_no || '-' }}</code></td>
                                                <td><span :class="tx.trade_type === 'recharge' ? 'badge bg-success' : tx.trade_type === 'admin_recharge' ? 'badge bg-warning' : tx.trade_type === 'refund' ? 'badge bg-warning' : tx.trade_type === 'new_order' ? 'badge bg-primary' : tx.trade_type === 'disk_purchase' ? 'badge bg-info' : tx.trade_type === 'disk_renewal' ? 'badge bg-primary' : 'badge badge-renewal'" :style="tx.trade_type !== 'recharge' && tx.trade_type !== 'admin_recharge' && tx.trade_type !== 'refund' && tx.trade_type !== 'new_order' && tx.trade_type !== 'disk_purchase' && tx.trade_type !== 'disk_renewal' ? 'background:#0d9488;color:#fff' : ''">{{ tx.trade_type === 'recharge' ? '余额充值' : tx.trade_type === 'admin_recharge' ? '后台充值' : tx.trade_type === 'refund' ? '订单退款' : tx.trade_type === 'new_order' ? '新购服务器' : tx.trade_type === 'disk_purchase' ? '新购硬盘' : tx.trade_type === 'disk_renewal' ? '续费硬盘' : '服务器续费' }}</span></td>
                                                <td>¥{{ tx.amount }}</td>
                                            </tr>
                                            <tr v-if="!txList || txList.length === 0"><td colspan="6" class="text-center text-muted py-4">暂无交易记录</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div class="d-flex justify-content-between align-items-center mt-3" v-if="txTotal > 0">
                                    <small class="text-muted">共 {{ txTotal }} 条</small>
                                    <div>
                                        <pv-button variant="outline" size="sm" :disabled="txPage <= 1" @click="loadTx(txPage - 1)">上一页</pv-button>
                                        <span class="mx-2 text-muted small">{{ txPage }} / {{ Math.ceil(txTotal / 20) || 1 }}</span>
                                        <pv-button variant="outline" size="sm" :disabled="txPage * 20 >= txTotal" @click="loadTx(txPage + 1)">下一页</pv-button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 我的订单 -->
            <div v-if="activeSubTab === 'orders'">
                <div class="row justify-content-center">
                    <div class="col-md-10">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">我的订单</h4>
                        </div>
                        <div class="card">
                            <div class="card-body pb-0">
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">订单号</label>
                                        <input type="text" class="form-control form-control-sm" v-model="orderFilter.order_no" placeholder="搜索订单号" @keyup.enter="loadMyOrders(1)">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">类型</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.type">
                                            <option value="">全部</option>
                                            <option value="vm">VM</option>
                                            <option value="lxc">LXC</option>
                                            <option value="disk">磁盘</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2 d-flex gap-2">
                                        <pv-button @click="loadMyOrders(1)" size="sm">查询</pv-button>
                                        <pv-button @click="orderFilter={order_no:'',type:''};loadMyOrders(1)" variant="outline" size="sm">重置</pv-button>
                                    </div>
                                </div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-hover table-sm mb-0 table-align-center">
                                    <thead><tr><th>订单号</th><th>套餐</th><th>类型</th><th>周期</th><th>数量</th><th>金额</th><th>时间</th></tr></thead>
                                    <tbody>
                                        <tr v-for="o in myOrders" :key="o.id">
                                            <td><code style="font-size:11px;">{{ o.order_no }}</code></td>
                                            <td>{{ o.package_name }}</td>
                                            <td><span :class="o.type === 'vm' ? 'badge bg-info' : o.type === 'lxc' ? 'badge bg-success' : 'badge bg-warning'">{{ o.type === 'vm' ? 'VM' : o.type === 'lxc' ? 'LXC' : '磁盘' }}</span></td>
                                            <td>{{ o.period === 'month' ? '月付' : o.period === 'quarter' ? '季付' : '年付' }}</td>
                                            <td>{{ o.period_count }}</td>
                                            <td>¥{{ o.amount }}</td>
                                            <td>{{ formatDate(o.created_at) }}</td>
                                        </tr>
                                        <tr v-if="!myOrders || myOrders.length === 0"><td colspan="7" class="text-center text-muted py-4">暂无订单记录</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="card-body">
                                <div class="d-flex justify-content-between align-items-center mt-3" v-if="orderTotal > 0">
                                    <small class="text-muted">共 {{ orderTotal }} 条</small>
                                    <div>
                                        <pv-button variant="outline" size="sm" :disabled="orderPage <= 1" @click="loadMyOrders(orderPage - 1)">上一页</pv-button>
                                        <span class="mx-2 text-muted small">{{ orderPage }} / {{ Math.ceil(orderTotal / 20) || 1 }}</span>
                                        <pv-button variant="outline" size="sm" :disabled="orderPage * 20 >= orderTotal" @click="loadMyOrders(orderPage + 1)">下一页</pv-button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'security'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="card mb-4">
                            <div class="card-body">
                                <h5 class="card-title mb-3">登录设备管理</h5>
                                <div v-if="devicesLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                                </div>
                                <div v-else-if="devices.length === 0" class="text-muted text-center py-3">
                                    暂无登录设备记录
                                </div>
                                <div v-else class="table-responsive">
                                    <table class="table table-sm mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>设备</th>
                                                <th>IP</th>
                                                <th>登录时间</th>
                                                <th>操作</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="d in devices" :key="d.id">
                                                <td>
                                                    <span>{{ d.device_name }}</span>
                                                    <span v-if="d.id === currentDeviceId" class="badge bg-info ms-1" style="font-size:10px;">当前</span>
                                                </td>
                                                <td class="text-muted small">{{ d.ip }}</td>
                                                <td class="text-muted small">{{ formatDate(d.created_at) }}</td>
                                                <td>
                                                    <pv-button v-if="d.id !== currentDeviceId" variant="danger" size="sm" @click="revokeDevice(d.id)">下线</pv-button>
                                                    <span v-else class="text-muted small">-</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div v-if="devices.length > 0" class="mt-2">
                                    <pv-button variant="secondary" size="sm" @click="revokeOtherDevices">下线其他设备</pv-button>
                                </div>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-body">
                                <template v-if="!twofaEnabled">
                                    <h5 class="card-title mb-1">二次验证（2FA）</h5>
                                    <p class="text-muted small mb-2">启用两步验证，登录时除密码外还需输入动态验证码，进一步提升账号安全性</p>
                                    <pv-button variant="primary" @click="openTwofaSetup">绑定两步验证</pv-button>
                                    <p class="text-muted small mt-2 mb-0">提示：需先在手机安装 Google Authenticator 或 Authy 等 TOTP 应用</p>
                                </template>
                                <template v-else>
                                    <h5 class="card-title mb-1">二次验证已启用</h5>
                                    <p class="text-muted small mb-2">您的账号已受两步验证保护</p>
                                    <div class="d-flex gap-2 flex-wrap">
                                        <pv-button variant="outline" size="sm" @click="showRecoveryCodes">查看恢复码</pv-button>
                                        <pv-button variant="danger" size="sm" @click="openDisableTwofa">禁用 2FA</pv-button>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Teleport: 弹窗 -->
            <Teleport to="body">
                <!-- 备忘录编辑弹窗 -->
                <div class="modal fade" id="memoModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ editMemoForm.id ? '编辑备忘录' : '新建备忘录' }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveMemo">
                                    <div class="mb-3">
                                        <label class="form-label">标题</label>
                                        <input type="text" class="form-control" v-model="editMemoForm.title" placeholder="输入标题...">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">内容</label>
                                        <textarea class="form-control" rows="5" v-model="editMemoForm.content" placeholder="输入内容..."></textarea>
                                    </div>
                                    <pv-button type="submit" variant="primary">保存</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 自定义提示弹窗 -->
                <div class="modal fade" id="customAlertModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4">
                                <div class="custom-alert-icon mb-3">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                </div>
                                <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customAlertMessage }}</p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                                <button type="button" class="btn btn-primary px-4" @mousedown="(e) => e.target.blur()" data-bs-dismiss="modal">确定</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 自定义确认弹窗 -->
                <div class="modal fade" id="customConfirmModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4">
                                <div class="custom-alert-icon mb-3">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                </div>
                                <p class="custom-confirm-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customConfirmMessage }}</p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                                <button type="button" class="btn btn-outline-light px-3" @click="confirmCancel">取消</button>
                                <button type="button" class="btn btn-primary px-3" @click="confirmOk">确定</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 扫码/跳转支付弹窗 -->
                <div class="modal fade" id="rechargePendingModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-dialog-centered recharge-pay-modal">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4 px-4">
                                <!-- PC 端：二维码扫码 -->
                                <template v-if="!rechargeIsMobile">
                                    <h6 class="mb-3" style="color:var(--text-primary);font-size:15px;font-weight:600;">请使用{{ rechargeMethod === 'alipay' ? '支付宝' : '微信' }}扫码支付</h6>
                                    <div class="recharge-qr-wrap mb-2">
                                        <div v-if="rechargeQrLoading" class="recharge-qr-loading">
                                            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div>
                                        </div>
                                        <div id="rechargeQrContainer" class="recharge-qr-container"></div>
                                    </div>
                                    <button type="button" class="btn btn-outline-primary btn-sm recharge-check-btn mb-1" @click="checkPayStatus">我已完成支付</button>
                                </template>
                                <!-- 手机端：跳转按钮 -->
                                <template v-else>
                                    <h6 class="mb-3" style="color:var(--text-primary);font-size:15px;font-weight:600;">点击下方按钮进行支付</h6>
                                    <button type="button" class="btn btn-primary recharge-pay-btn mb-3" @click="openMobilePay">
                                        打开{{ rechargeMethod === 'alipay' ? '支付宝' : '微信' }}支付
                                    </button>
                                    <p class="mb-0" style="color:var(--text-secondary);font-size:12px;">支付完成后请返回此页面</p>
                                </template>
                                <!-- 公共订单信息 -->
                                <p class="mb-1" style="color:var(--text-secondary);font-size:13px;">订单号：{{ rechargePendingOrderNo }}</p>
                                <p class="mb-0" style="color:var(--text-secondary);font-size:13px;">充值金额：<strong style="color:var(--color-primary);">¥{{ rechargePendingAmount }}</strong></p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                                <button type="button" class="btn btn-outline-light px-4" @click="cancelRecharge">取消支付</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 充值结果弹窗 -->
                <div class="modal fade" id="rechargeResultModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4">
                                <div class="custom-alert-icon mb-3">
                                    <!-- 成功图标 -->
                                    <svg v-if="rechargeResultType === 'success'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                    <!-- 失败图标 -->
                                    <svg v-else width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                </div>
                                <h6 class="mb-2" style="color:var(--text-primary);font-size:15px;font-weight:600;">{{ rechargeResultTitle }}</h6>
                                <p v-if="rechargeResultType === 'success'" class="mb-0" style="color:var(--text-secondary);font-size:13px;">
                                    恭喜您充值成功：<strong style="color:var(--color-primary);">¥{{ rechargeResultAmount }}</strong>
                                </p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                                <button type="button" class="btn btn-primary px-4" @click="closeRechargeResult">确定</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 消息详情弹窗 -->
                <div class="modal fade" id="messageDetailModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ currentMsg.title }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <span class="message-type-badge" :class="'msg-type-' + currentMsg.type">
                                        {{ {1:'系统公告',2:'业务通知',3:'续费提醒',4:'工单消息',5:'客服私聊'}[currentMsg.type] || '消息' }}
                                    </span>
                                    <span class="text-muted ms-2 small">{{ formatDate(currentMsg.created_at) }}</span>
                                </div>
                                <div class="message-detail-content markdown-body" style="line-height:1.7;white-space:pre-wrap;" v-html="parseMarkdown(currentMsg.content)"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">删除</pv-button>
                                <pv-button type="button" data-bs-dismiss="modal">关闭</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 设置弹窗 -->
                <div class="modal fade" id="twofaSetupModal" tabindex="-1">
                    <div class="modal-dialog modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">绑定两步验证</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">请使用 Authenticator 应用扫描下方二维码：</p>
                                <div class="text-center mb-3">
                                    <img v-if="twofaQrcode" :src="twofaQrcode" alt="2FA QR Code" style="width:200px;height:200px;">
                                </div>
                                <p class="mb-1 small">或手动输入密钥：</p>
                                <p class="mb-3"><code>{{ twofaSecret }}</code></p>
                                <p class="mb-2">输入应用显示的 6 位验证码：</p>
                                <div class="input-group mb-0">
                                    <input type="text" class="form-control" v-model="twofaSetupCode" maxlength="6" placeholder="6 位验证码">
                                    <pv-button type="button" @click="verifyTwofaSetup" :disabled="twofaSetupCode.length !== 6" variant="primary">验证并启用</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 恢复码弹窗 -->
                <div class="modal fade" id="twofaRecoveryModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">恢复码</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning d-flex align-items-center mb-3" role="alert">
                                    <svg class="me-2 flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    <span>请立即保存这些恢复码！每个恢复码只能使用一次。</span>
                                </div>
                                <table class="table table-sm table-hover table-align-center">
                                    <thead><tr><th>#</th><th>恢复码</th><th>状态</th><th>创建时间</th></tr></thead>
                                    <tbody>
                                        <tr v-for="(rc, idx) in twofaRecoveryCodes" :key="rc.id">
                                            <td class="text-muted small">{{ idx + 1 }}</td>
                                            <td><code style="cursor:pointer;font-size:13px;letter-spacing:1px;" @click="copySingleCode(rc.code)">{{ rc.code }}</code></td>
                                            <td>
                                                <span v-if="rc.used" class="badge bg-secondary">已使用</span>
                                                <span v-else class="badge bg-success">未使用</span>
                                            </td>
                                            <td class="text-muted small">{{ rc.created_at ? formatDate(rc.created_at) : '-' }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                <div class="d-flex gap-2 mt-3">
                                    <pv-button variant="secondary" size="sm" @click="copyRecoveryCodes">复制全部</pv-button>
                                    <pv-button variant="outline" size="sm" @click="downloadRecoveryCodes">下载</pv-button>
                                    <pv-button variant="outline-danger" size="sm" @click="regenerateRecoveryCodes">重新生成</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 禁用弹窗 -->
                <div class="modal fade" id="twofaDisableModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">禁用二次验证</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">请输入当前密码以确认禁用：</p>
                                <input type="password" class="form-control" v-model="twofaDisablePassword" placeholder="当前密码">
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button type="button" @click="disableTwofa" :disabled="!twofaDisablePassword" variant="danger">确认禁用</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
            </Teleport>

            <div class="text-center py-4 mt-4 text-muted small">
                <div>PVE 管理面板 <span id="appVersion"></span></div>
            </div>
        </div>
    </template>`;
})();
