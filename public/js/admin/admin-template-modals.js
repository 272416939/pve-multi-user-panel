(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<Teleport to="body">
                <div class="modal fade" id="messageDetailModal" tabindex="-1">
                    <div class="modal-dialog">
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
                                <div class="message-detail-content markdown-body" style="line-height:1.7;" v-html="parseMarkdown(currentMsg.content)"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">删除</pv-button>
                                <pv-button type="button" data-bs-dismiss="modal">关闭</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 创建用户模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="createUserModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">创建用户</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="createUser">
                                    <div class="mb-3">
                                        <label class="form-label">用户名</label>
                                        <input type="text" class="form-control" v-model="createUserForm.username" required autocomplete="username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">密码</label>
                                        <input type="password" class="form-control" v-model="createUserForm.password" required autocomplete="new-password">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">角色</label>
                                        <select class="form-select" v-model="createUserForm.role">
                                            <option value="user">用户</option>
                                            <option value="admin">管理员</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">邮箱</label>
                                        <input type="email" class="form-control" v-model="createUserForm.email" placeholder="可选">
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="createUserEmailVerified" v-model="createUserForm.emailVerified">
                                        <label class="form-check-label" for="createUserEmailVerified">激活邮箱（无需验证）</label>
                                    </div>
                                    <pv-button type="submit" variant="glass" >创建</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 编辑用户模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="editUserModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">编辑用户</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateUser">
                                    <div class="mb-3">
                                        <label class="form-label">用户名</label>
                                        <input type="text" class="form-control" v-model="editUserForm.username" autocomplete="username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">新密码（留空则不修改）</label>
                                        <input type="password" class="form-control" v-model="editUserForm.password" autocomplete="new-password">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">角色</label>
                                        <select class="form-select" v-model="editUserForm.role">
                                            <option value="user">用户</option>
                                            <option value="admin">管理员</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">邮箱</label>
                                        <input type="email" class="form-control" v-model="editUserForm.email" placeholder="留空则清空">
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="editUserEmailVerified" v-model="editUserForm.emailVerified">
                                        <label class="form-check-label" for="editUserEmailVerified">激活邮箱（无需验证）</label>
                                    </div>
                                    <div v-if="editUserForm.totp_enabled" class="mb-3 d-flex align-items-center">
                                        <span class="me-2">二次验证: ✅ 已启用</span>
                                        <pv-button type="button" @click="disableUser2fa(editUserForm.id)" variant="outline" size="sm">禁用 2FA</pv-button>
                                    </div>
                                    <pv-button type="submit" variant="primary" >保存</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 充值弹窗 -->
                <div v-if="rechargeShow" id="rechargeModalWrap" class="modal" style="display:block;background:rgba(0,0,0,0.5);" @click.self="rechargeShow = false">
                    <div class="modal-dialog modal-dialog-centered" style="max-width:400px;">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">为用户充值</h5>
                                <pv-button variant="close" @click="rechargeShow = false"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p>用户名：<strong>{{ rechargeUser?.username }}</strong></p>
                                <p>当前余额：¥{{ parseFloat(rechargeUser?.balance||0).toFixed(2) }}</p>
                                <div class="mb-3">
                                    <label class="form-label">充值金额（元）</label>
                                    <input type="number" class="form-control" v-model.number="rechargeAmount" min="0.01" step="0.01" placeholder="输入充值金额">
                                </div>
                                <div v-if="rechargeError" class="alert alert-danger py-2">{{ rechargeError }}</div>
                            </div>
                            <div class="modal-footer">
                                <pv-button @click="rechargeShow = false" variant="secondary">取消</pv-button>
                                <pv-button @click="submitRecharge">确认充值</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 测试邮件模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="testEmailModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">发送测试邮件</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="sendTestEmail">
                                    <div class="mb-3">
                                        <label class="form-label">测试邮箱</label>
                                        <input type="email" class="form-control" v-model="testEmail" required>
                                    </div>
                                    <pv-button type="submit" variant="primary" >发送</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- CDK 生成结果模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="cdkResultModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">CDK 生成结果</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <p>成功生成 <strong>{{ cdkResult.length }}</strong> 个 CDK 兑换码</p>
                                    <p v-if="cdkResultBatchId" class="text-muted small">批次号: {{ cdkResultBatchId }}</p>
                                </div>
                                <div class="mb-3">
                                    <pv-button @click="exportCdkCsv(cdkResultBatchId)" size="sm">

                                        导出此批次 CSV
                                    
</pv-button>
                                    <pv-button @click="copyBatchCodes" variant="outline" size="sm">

                                        复制全部兑换码
                                    
</pv-button>
                                </div>
                                <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                    <table class="table table-sm mb-0">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>兑换码</th>
                                                <th>续费天数</th>
                                                <th>分配用户</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(cdk, index) in cdkResult" :key="cdk.id">
                                                <td>{{ index + 1 }}</td>
                                                <td><code class="user-select-all">{{ cdk.code }}</code></td>
                                                <td>{{ cdk.duration_days }} 天</td>
                                                <td>{{ cdk.target_username || '-' }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal">关闭</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 编辑虚拟机模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="editVmModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">编辑虚拟机</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateVm" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label">名称</label>
                                        <input type="text" class="form-control" v-model="editVmForm.name">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">分配给</label>
                                        <select class="form-select" v-model="editVmForm.user_id">
                                            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">到期时间</label>
                                        <input type="datetime-local" class="form-control" v-model="editVmForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">续费价格</label>
                                        <input type="number" step="0.01" min="0" class="form-control" v-model="editVmForm.renewal_price" placeholder="如: 50.00">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">计费周期</label>
                                        <select class="form-select" v-model="editVmForm.renewal_period">
                                            <option value="month">月（30天计）</option>
                                            <option value="quarter">季（90天计）</option>
                                            <option value="year">年（365天计）</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">备份存储位置</label>
                                        <select class="form-select" v-model="editVmForm.backup_storage">
                                            <option value="">全局默认</option>
                                            <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                        </select>
                                        <small class="text-muted">为该虚拟机指定专用备份存储位置，留空则使用全局默认</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">MAC分组</label>
                                        <select class="form-select" v-model="editVmForm.mac_group_id">
                                            <option value="">不加入分组</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" formnovalidate>保存</pv-button>
                                        <pv-button type="button" @click="removeVm" :disabled="editVmForm.status && editVmForm.status.status === 'running'" :title="editVmForm.status && editVmForm.status.status === 'running' ? '请先关机后操作' : '移除分配（仅解绑）'" variant="outline-warning">移除（仅解绑）</pv-button>
                                        <pv-button type="button" @click="openDestroyVmConfirm" :disabled="editVmForm.status && editVmForm.status.status === 'running'" :title="editVmForm.status && editVmForm.status.status === 'running' ? '请先关机后操作' : '销毁虚拟机（删除 PVE 数据）'" variant="danger">销毁（删除 PVE）</pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- CDK 兑换模态框 -->
                <Teleport to="body">
                <div class="modal fade" id="cdkRedeemModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">CDK 兑换</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body" @click="cdkVmDropdownOpen = false">
                                <div v-if="cdkRedeemStep === 'input'">
                                    <div class="mb-3">
                                        <label class="form-label">CDK 兑换码</label>
                                        <input type="text" class="form-control" v-model="cdkRedeemForm.code" placeholder="输入 CDK 码，如 PVE-XXXX-XXXX-XXXX" style="text-transform: uppercase;" @input="cdkRedeemForm.code = cdkRedeemForm.code.toUpperCase()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">资源类型</label>
                                        <div class="d-flex gap-3">
                                            <div class="form-check">
                                                <input type="radio" class="form-check-input" id="cdkTypeVm" value="vm" v-model="cdkRedeemForm.type">
                                                <label class="form-check-label" for="cdkTypeVm">虚拟机</label>
                                            </div>
                                            <div class="form-check">
                                                <input type="radio" class="form-check-input" id="cdkTypeLxc" value="lxc" v-model="cdkRedeemForm.type">
                                                <label class="form-check-label" for="cdkTypeLxc">LXC 容器</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" id="cdk-vm-label">选择要续费的{{ cdkRedeemForm.type === 'vm' ? '虚拟机' : 'LXC 容器' }}</label>
                                        <div class="custom-select" :class="{ open: cdkVmDropdownOpen }" @click.stop>
                                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-vm-label"
                                                 @click="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.enter.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.space.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.esc="cdkVmDropdownOpen = false">
                                                <span v-if="cdkRedeemForm.resource_id">
                                                    {{ getRedeemableResourceName(cdkRedeemForm.resource_id, cdkRedeemForm.type) }}
                                                </span>
                                                <span v-else class="custom-select-placeholder">请选择要续费的{{ cdkRedeemForm.type === 'vm' ? '虚拟机' : 'LXC 容器' }}</span>
                                            </div>
                                            <div class="custom-select-dropdown" role="listbox">
                                                <div v-if="cdkRedeemForm.type === 'vm'">
                                                    <div v-for="vm in userVms" :key="vm.id" class="option" role="option"
                                                         :class="{ selected: cdkRedeemForm.resource_id == vm.id }"
                                                         @click="cdkRedeemForm.resource_id = vm.id; cdkVmDropdownOpen = false;">
                                                        {{ vm.name || 'VM ' + vm.vm_id }}（到期: {{ vm.expiration_date ? formatDate(vm.expiration_date) : '未设置' }} <span v-if="vm.expiration_date" :class="getExpiryColor(vm.expiration_date)">{{ daysUntilExpire(vm.expiration_date) }}</span>）
                                                    </div>
                                                </div>
                                                <div v-else>
                                                    <div v-for="ct in userLxcContainers" :key="ct.id" class="option" role="option"
                                                         :class="{ selected: cdkRedeemForm.resource_id == ct.id }"
                                                         @click="cdkRedeemForm.resource_id = ct.id; cdkVmDropdownOpen = false;">
                                                        {{ ct.name || 'CT ' + ct.ct_id }}（到期: {{ ct.expiration_date ? formatDate(ct.expiration_date) : '未设置' }} <span v-if="ct.expiration_date" :class="getExpiryColor(ct.expiration_date)">{{ daysUntilExpire(ct.expiration_date) }}</span>）
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-if="cdkRedeemError" class="alert alert-danger">{{ cdkRedeemError }}</div>
                                </div>
                                <div v-if="cdkRedeemStep === 'result'">
                                    <div class="alert alert-success">
                                        <strong>兑换成功！</strong>
                                        <p class="mb-0 mt-2">{{ cdkRedeemMessage }}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer" v-if="cdkRedeemStep === 'input'">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button type="button" @click="redeemCdk" :disabled="!cdkRedeemForm.code || !cdkRedeemForm.resource_id" variant="primary">确认兑换</pv-button>
                            </div>
                            <div class="modal-footer" v-if="cdkRedeemStep === 'result'">
                                <pv-button type="button" data-bs-dismiss="modal" @click="cdkRedeemStep = 'input'">完成</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 快照管理弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="snapshotModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">快照管理 - {{ snapshotVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="snapshotLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                                        <span class="visually-hidden">加载中...</span>
                                    </div>
                                    <p class="mt-2 text-muted small">加载快照列表...</p>
                                </div>
                                <div v-else>
                                    <div class="card mb-3">
                                        <div class="card-header">
                                            <h6 class="mb-0">创建快照</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-2">
                                                <textarea class="form-control form-control-sm" v-model="snapshotForm.description" rows="2" placeholder="备注（可选）"></textarea>
                                            </div>
                                            <div class="d-flex justify-content-end align-items-center">
                                                <pv-button @click="createSnapshot(snapshotVmId)" :disabled="snapshotCreating" size="sm">

                                                    <span v-if="snapshotCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                    创建快照

</pv-button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="card mb-3">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="checkbox" class="form-check-input m-0" :checked="isAllSnapshotsSelected" @change="toggleSelectAllSnapshots" :disabled="snapshots.length === 0" style="cursor:pointer">
                                                <h6 class="mb-0">现有快照</h6>
                                            </div>
                                            <div class="d-flex align-items-center gap-2">
                                                <pv-button v-if="isAnySnapshotSelected" @click="batchDeleteSnapshots(snapshotVmId)" :disabled="snapshotDeleting" variant="outline-danger" size="sm">

                                                    <span v-if="snapshotDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                    批量删除 ({{ snapshotSelected.size }})
                                                
</pv-button>
                                                <span class="badge bg-secondary">{{ snapshots.length }} 个</span>
                                            </div>
                                        </div>
                                        <div class="card-body p-0">
                                            <div v-if="snapshots.length === 0" class="text-center text-muted py-4 small">
                                                暂无快照
                                            </div>
                                            <div v-else class="list-group list-group-flush">
                                                <div v-for="snap in snapshots" :key="snap.name" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" :class="snapshotSelected.has(snap.name) ? 'list-group-item-primary' : ''">
                                                    <div class="d-flex align-items-center gap-2 me-3" style="min-width:0">
                                                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" :checked="snapshotSelected.has(snap.name)" @change="toggleSnapshotSelect(snap.name)" style="cursor:pointer">
                                                        <div style="min-width:0">
                                                            <div class="fw-bold small text-truncate">{{ snap.name }}</div>
                                                            <div class="text-muted small">
                                                                <span v-if="snap.description" class="me-2">{{ snap.description }}</span>
                                                                <span>{{ formatSnapshotDate(snap.snaptime) }}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div class="d-flex gap-1 flex-shrink-0">
                                                        <pv-button @click="rollbackSnapshot(snapshotVmId, snap.name)" title="回滚到此快照" variant="outline" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                                                            </svg>
                                                        
</pv-button>
                                                        <pv-button @click="deleteSnapshot(snapshotVmId, snap.name)" title="删除快照" variant="outline-danger" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                                                            </svg>
                                                        
</pv-button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="card">
                                        <div class="card-header">
                                            <h6 class="mb-0">快照限制信息</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="row text-center g-2">
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">当前快照数</div>
                                                        <div class="fw-bold" :class="snapshotLimits.current >= snapshotLimits.max ? 'text-danger' : ''" style="color: var(--text-primary);">
                                                            {{ snapshotLimits.current }} / {{ snapshotLimits.max }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">今日创建</div>
                                                        <div class="fw-bold" :class="snapshotLimits.today_creates >= snapshotLimits.max_creates ? 'text-danger' : ''" style="color: var(--text-primary);">
                                                            {{ snapshotLimits.today_creates }} / {{ snapshotLimits.max_creates }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">今日恢复</div>
                                                        <div class="fw-bold" :class="snapshotLimits.today_rollbacks >= snapshotLimits.max_rollbacks ? 'text-danger' : ''" style="color: var(--text-primary);">
                                                            {{ snapshotLimits.today_rollbacks }} / {{ snapshotLimits.max_rollbacks }}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 备份管理弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="backupModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">备份管理 - {{ backupVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="card mb-3">
                                    <div class="card-header"><h6 class="mb-0">创建备份</h6></div>
                                    <div class="card-body">
                                        <div class="mb-2">
                                            <label class="form-label small">存储位置</label>
                                            <select class="form-select form-select-sm" v-model="backupForm.storage">
                                                <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                        <div class="mb-2">
                                            <textarea class="form-control form-control-sm" v-model="backupForm.notes" rows="2" maxlength="50" placeholder="备注（可选）" style="resize:none"></textarea>
                                             <small :style="'display:block;text-align:right;margin-top:2px;color:' + (backupForm.notes.length >= 50 ? '#ff4444' : 'var(--text-muted)')">{{ backupForm.notes.length || 0 }}/50</small>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <small class="text-muted">停止模式备份 · zstd 压缩</small>
                                            <pv-button @click="createBackup(backupVmId)" :disabled="backupCreating" size="sm">

                                                <span v-if="backupCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                立即备份
                                            
</pv-button>
                                        </div>
                                    </div>
                                </div>

                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center gap-2">
                                            <input type="checkbox" class="form-check-input m-0" :checked="isAllBackupsSelected" @change="toggleSelectAllBackups" :disabled="backups.length === 0" style="cursor:pointer">
                                            <h6 class="mb-0">备份历史</h6>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <pv-button v-if="isAnyBackupSelected" @click="batchDeleteBackups(backupVmId)" :disabled="backupDeleting" variant="outline-danger" size="sm">

                                                <span v-if="backupDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                批量删除 ({{ backupSelected.size }})
                                            
</pv-button>
                                            <span class="badge bg-secondary">{{ backups.length }} 个</span>
                                        </div>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-if="backups.length === 0" class="text-center text-muted py-4 small">暂无备份</div>
                                        <div v-else class="table-responsive" style="max-height:360px;overflow-y:auto;">
                                            <table class="table table-striped mb-0 table-sm">
                                                <thead style="position:sticky;top:0;">
                                                    <tr>
                                                        <th class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="isAllBackupsSelected" @change="toggleSelectAllBackups" :disabled="backups.length === 0" style="cursor:pointer"></th>
                                                        <th style="width:40px;">#</th>
                                                        <th>备份时间</th>
                                                        <th>大小</th>
                                                        <th>备注</th>
                                                        <th style="width:100px;">状态</th>
                                                        <th>存储</th>
                                                        <th style="width:60px;">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="(b, idx) in backups" :key="b.id" :style="backupSelected.has(b.id) ? 'background:rgba(99,102,241,0.08)' : ''">
                                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="backupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleBackupSelect(b.id)" style="cursor:pointer"></td>
                                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                                        <td class="small text-muted" :title="b.notes">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                                        <td>
                                                            <span v-if="b.status === 'completed'" class="badge bg-success">完成</span>
                                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">等待中</span>
                                                            <span v-else class="badge bg-danger" :title="b.error_msg">失败</span>
                                                        </td>
                                                        <td class="small">{{ b.storage }}</td>
                                                        <td>
                                                            <div class="d-flex gap-1">
                                                                <pv-button v-if="b.status === 'completed'" @click="restoreBackup(b)" title="恢复此备份" variant="outline" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                                
</pv-button>
                                                                <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteBackup(b.id)" title="删除备份" variant="outline-danger" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                                
</pv-button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                    <div v-if="backups.some(b => b.status === 'running')" class="card-footer">
                                        <div v-for="b in backups.filter(b => b.status === 'running')" :key="'prog-'+b.id" class="mb-1">
                                            <small class="text-muted d-flex justify-content-between"><span>备份中...</span><span>{{ b.progress }}%</span></small>
                                            <div class="progress" style="height:8px;">
                                                <div class="progress-bar progress-bar-striped progress-bar-animated" :style="{width: b.progress + '%'}"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 重置密码弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="resetLxcPasswordModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">重置容器密码</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="selectedLxc && selectedLxc.status && selectedLxc.status.status !== 'running'" class="alert alert-warning">
                                    容器当前处于停止状态，重置密码操作可能无法立即生效。启动容器后请再次尝试。
                                </div>
                                <div v-if="!selectedLxc || !selectedLxc.status || selectedLxc.status.status !== 'running'" class="alert alert-danger mb-3">
                                    容器未运行，无法重置密码。请先启动容器。
                                </div>
                                <form @submit.prevent="resetLxcPassword">
                                    <div class="mb-3">
                                        <label class="form-label">新密码</label>
                                        <div class="input-group">
                                            <input :type="adminLxcPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="lxcPasswordForm.password" required autocomplete="new-password" placeholder="至少8位，需包含英文+数字+符号">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminLxcPwdShowPwd = !adminLxcPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <span v-if="adminLxcPwdShowPwd">🙈</span><span v-else>👁️</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">确认密码</label>
                                        <input type="password" class="form-control" v-model="lxcPasswordForm.confirmPassword" required autocomplete="new-password" placeholder="请再次输入密码">
                                    </div>
                                    <pv-button type="submit" variant="primary" :disabled="!selectedLxc || !selectedLxc.status || selectedLxc.status.status !== 'running'">重置密码</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 重置 LXC IP 弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="resetLxcIpModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">重置 IP - CT {{ selectedLxc?.ct_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-danger d-flex align-items-start gap-2 mb-3" style="background:rgba(220,53,69,0.15);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(220,53,69,0.3);">
                                    <span style="font-size:1.2rem;line-height:1.4;">⚠️</span>
                                    <div>
                                        <strong>危险操作</strong><br>
                                        <span style="opacity:0.9">修改 IP 需要重启容器，容器将短暂关机后自动重启。正在运行的服务会中断，请确保已保存重要数据。</span>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">IP 模式</label>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="lxcIpForm.ip_mode" value="static" id="lxcIpStatic">
                                            <label class="form-check-label" for="lxcIpStatic">手动输入</label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="lxcIpForm.ip_mode" value="dhcp" id="lxcIpDhcp">
                                            <label class="form-check-label" for="lxcIpDhcp">DHCP 自动获取</label>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="lxcIpForm?.ip_mode === 'static'" class="mb-3">
                                    <label class="form-label">IP 地址（CIDR 格式，如 10.0.0.150/24）</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" v-model="lxcIpForm.ip" placeholder="10.0.0.150/24">
                                        <pv-button type="button" @click="randomLxcIp" title="随机生成未绑定的 IP" variant="outline">🎲 随机</pv-button>
                                    </div>
                                </div>
                                <div v-if="lxcIpError" class="alert alert-danger py-2">{{ lxcIpError }}</div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal">取消</pv-button>
                                <pv-button type="button" @click="confirmResetLxcIp" :disabled="lxcIpLoading">

                                    <span v-if="lxcIpLoading" class="spinner-border spinner-border-sm me-1"></span>
                                    保存
                                
</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- VM 重置密码弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="resetAdminVmPasswordModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">重置密码 - VM {{ adminVmPwdVm?.vm_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="adminVmPwdCiuser === false" class="alert alert-danger py-2 mb-0">当前虚拟机未配置Cloud-init驱动，请联系管理员！</div>
                                <div v-else>
                                    <p v-if="adminVmPwdVm">资源：{{ adminVmPwdVm.name || ('VM ' + adminVmPwdVm.vm_id) }}</p>
                                    <p v-if="adminVmPwdVm">账号：{{ adminVmPwdCiuser }}</p>
                                    <div class="mb-3">
                                        <label class="form-label">新密码</label>
                                        <div class="input-group">
                                            <input :type="adminVmPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="adminVmPwdNewPassword" placeholder="至少8位，需包含英文+数字+符号">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminVmPwdShowPwd = !adminVmPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <span v-if="adminVmPwdShowPwd">🙈</span><span v-else>👁️</span>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">确认密码</label>
                                        <input type="password" class="form-control" v-model="adminVmPwdConfirm" placeholder="请再次输入密码" autocomplete="new-password">
                                    </div>
                                    <div v-if="adminVmPwdError" class="alert alert-danger py-2">{{ adminVmPwdError }}</div>
                                </div>
                            </div>
                            <div class="modal-footer" v-if="adminVmPwdCiuser !== false">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button type="button" @click="submitAdminVmPasswordReset" :disabled="!adminVmPwdNewPassword || adminVmPwdNewPassword.length < 8" variant="primary">确认重置</pv-button>
                            </div>
                            <div class="modal-footer" v-if="adminVmPwdCiuser === false">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">关闭</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 重置 VM IP 弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="resetVmIpModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">重置 IP - VM {{ selectedVm?.vm_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning d-flex align-items-start gap-2 mb-3" style="background:rgba(255,193,7,0.15);backdrop-filter:blur(12px);border:1px solid rgba(255,193,7,0.3);">
                                    <span style="font-size:1.2rem;line-height:1.4;">⚠️</span>
                                    <div>
                                        <strong>注意</strong><br>
                                        <span style="opacity:0.9">修改虚拟机 IP 后，需要重启虚拟机或重新获取 DHCP 才能生效。</span>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">IP 模式</label>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="vmIpForm.ip_mode" value="static" id="vmIpStatic">
                                            <label class="form-check-label" for="vmIpStatic">手动输入</label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="vmIpForm.ip_mode" value="dhcp" id="vmIpDhcp">
                                            <label class="form-check-label" for="vmIpDhcp">DHCP 自动获取</label>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="vmIpForm?.ip_mode === 'static'" class="mb-3">
                                    <label class="form-label">IP 地址（CIDR 格式，如 10.0.0.150/24）</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" v-model="vmIpForm.ip" placeholder="10.0.0.150/24">
                                        <pv-button type="button" @click="randomVmIp" title="随机生成未绑定的 IP" variant="outline">随机</pv-button>
                                    </div>
                                </div>
                                <div v-if="vmIpError" class="alert alert-danger py-2">{{ vmIpError }}</div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button type="button" @click="confirmResetVmIp" :disabled="vmIpLoading" variant="warning">
                                    <span v-if="vmIpLoading" class="spinner-border spinner-border-sm me-1"></span>
                                    确认修改
                                </pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 编辑容器弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="editLxcModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">编辑 LXC 容器</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateLxc" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label">名称</label>
                                        <input type="text" class="form-control" v-model="editLxcForm.name">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">分配给</label>
                                        <select class="form-select" v-model="editLxcForm.user_id">
                                            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">到期时间</label>
                                        <input type="datetime-local" class="form-control" v-model="editLxcForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">续费价格</label>
                                        <input type="number" step="0.01" min="0" class="form-control" v-model="editLxcForm.renewal_price" placeholder="如: 50.00">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">计费周期</label>
                                        <select class="form-select" v-model="editLxcForm.renewal_period">
                                            <option value="month">月（30天计）</option>
                                            <option value="quarter">季（90天计）</option>
                                            <option value="year">年（365天计）</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">MAC分组</label>
                                        <select class="form-select" v-model="editLxcForm.mac_group_id">
                                            <option value="">不加入分组</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" formnovalidate>保存</pv-button>
                                        <pv-button type="button" @click="removeLxc" :disabled="editLxcForm.status && editLxcForm.status.status === 'running'" :title="editLxcForm.status && editLxcForm.status.status === 'running' ? '请先关机后操作' : '移除分配（仅解绑）'" variant="outline-warning">移除（仅解绑）</pv-button>
                                        <pv-button type="button" @click="bsModalShow('destroyLxcModal')" :disabled="editLxcForm.status && editLxcForm.status.status === 'running'" :title="editLxcForm.status && editLxcForm.status.status === 'running' ? '请先关机后操作' : '销毁容器（删除 PVE 数据）'" variant="outline-danger">销毁（删除 PVE）</pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 快照管理弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="lxcSnapshotModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">快照管理 - {{ lxcSnapshotVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="lxcSnapshotLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                                        <span class="visually-hidden">加载中...</span>
                                    </div>
                                    <p class="mt-2 text-muted small">加载快照列表...</p>
                                </div>
                                <div v-else>
                                    <div class="card mb-3">
                                        <div class="card-header"><h6 class="mb-0">创建快照</h6></div>
                                        <div class="card-body">
                                            <div class="mb-2">
                                                <textarea class="form-control form-control-sm" v-model="lxcSnapshotForm.description" rows="2" placeholder="备注（可选）"></textarea>
                                            </div>
                                            <div class="d-flex justify-content-end align-items-center">
                                                <pv-button @click="createLxcSnapshot(lxcSnapshotVmId)" :disabled="lxcSnapshotCreating" size="sm">

                                                    <span v-if="lxcSnapshotCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                    创建快照

</pv-button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="card mb-3">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="checkbox" class="form-check-input m-0" :checked="isAllLxcSnapshotsSelected" @change="toggleSelectAllLxcSnapshots" :disabled="lxcSnapshots.length === 0" style="cursor:pointer">
                                                <h6 class="mb-0">现有快照</h6>
                                            </div>
                                            <div class="d-flex align-items-center gap-2">
                                                <pv-button v-if="isAnyLxcSnapshotSelected" @click="batchDeleteLxcSnapshots(lxcSnapshotVmId)" :disabled="lxcSnapshotDeleting" variant="outline-danger" size="sm">

                                                    <span v-if="lxcSnapshotDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                    批量删除 ({{ lxcSnapshotSelected.size }})
                                                
</pv-button>
                                                <span class="badge bg-secondary">{{ lxcSnapshots.length }} 个</span>
                                            </div>
                                        </div>
                                        <div class="card-body p-0">
                                            <div v-if="lxcSnapshots.length === 0" class="text-center text-muted py-4 small">暂无快照</div>
                                            <div v-else class="list-group list-group-flush">
                                                <div v-for="snap in lxcSnapshots" :key="snap.name" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center" :class="lxcSnapshotSelected.has(snap.name) ? 'list-group-item-primary' : ''">
                                                    <div class="d-flex align-items-center gap-2 me-3" style="min-width:0">
                                                        <input type="checkbox" class="form-check-input m-0 flex-shrink-0" :checked="lxcSnapshotSelected.has(snap.name)" @change="toggleLxcSnapshotSelect(snap.name)" style="cursor:pointer">
                                                        <div style="min-width:0">
                                                            <div class="fw-bold small text-truncate">{{ snap.name }}</div>
                                                            <div class="text-muted small">
                                                                <span v-if="snap.description" class="me-2">{{ snap.description }}</span>
                                                                <span>{{ formatSnapshotDate(snap.snaptime) }}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div class="d-flex gap-1 flex-shrink-0">
                                                        <pv-button @click="rollbackLxcSnapshot(lxcSnapshotVmId, snap.name)" title="回滚到此快照" variant="outline" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                        
</pv-button>
                                                        <pv-button @click="deleteLxcSnapshot(lxcSnapshotVmId, snap.name)" title="删除快照" variant="outline-danger" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                        
</pv-button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="card">
                                        <div class="card-header"><h6 class="mb-0">快照限制信息</h6></div>
                                        <div class="card-body">
                                            <div class="row text-center g-2">
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">当前快照数</div>
                                                        <div class="fw-bold" :class="lxcSnapshotLimits.current >= lxcSnapshotLimits.max ? 'text-danger' : ''" style="color: var(--text-primary);">{{ lxcSnapshotLimits.current }} / {{ lxcSnapshotLimits.max }}</div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">今日创建</div>
                                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_creates >= lxcSnapshotLimits.max_creates ? 'text-danger' : ''" style="color: var(--text-primary);">{{ lxcSnapshotLimits.today_creates }} / {{ lxcSnapshotLimits.max_creates }}</div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">今日恢复</div>
                                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_rollbacks >= lxcSnapshotLimits.max_rollbacks ? 'text-danger' : ''" style="color: var(--text-primary);">{{ lxcSnapshotLimits.today_rollbacks }} / {{ lxcSnapshotLimits.max_rollbacks }}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 备份管理弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="lxcBackupModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">备份管理 - {{ lxcBackupVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="card mb-3">
                                    <div class="card-header"><h6 class="mb-0">创建备份</h6></div>
                                    <div class="card-body">
                                        <div class="mb-2">
                                            <label class="form-label small">存储位置</label>
                                            <select class="form-select form-select-sm" v-model="lxcBackupForm.storage">
                                                <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                        <div class="mb-2">
                                            <textarea class="form-control form-control-sm" v-model="lxcBackupForm.notes" rows="2" maxlength="50" placeholder="备注（可选）" style="resize:none"></textarea>
                                            <small :style="'display:block;text-align:right;margin-top:2px;color:' + (lxcBackupForm.notes.length >= 50 ? '#ff4444' : 'var(--text-muted)')">{{ lxcBackupForm.notes.length || 0 }}/50</small>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <small class="text-muted">停止模式备份 · zstd 压缩</small>
                                            <pv-button @click="createLxcBackup(lxcBackupVmId)" :disabled="lxcBackupCreating" size="sm">

                                                <span v-if="lxcBackupCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                立即备份
                                            
</pv-button>
                                        </div>
                                    </div>
                                </div>
                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center gap-2">
                                            <input type="checkbox" class="form-check-input m-0" :checked="isAllLxcBackupsSelected" @change="toggleSelectAllLxcBackups" :disabled="lxcBackups.length === 0" style="cursor:pointer">
                                            <h6 class="mb-0">备份历史</h6>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <pv-button v-if="isAnyLxcBackupSelected" @click="batchDeleteLxcBackups(lxcBackupVmId)" :disabled="lxcBackupDeleting" variant="outline-danger" size="sm">

                                                <span v-if="lxcBackupDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                批量删除 ({{ lxcBackupSelected.size }})
                                            
</pv-button>
                                            <span class="badge bg-secondary">{{ lxcBackups.length }} 个</span>
                                        </div>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-if="lxcBackups.length === 0" class="text-center text-muted py-4 small">暂无备份</div>
                                        <div v-else class="table-responsive" style="max-height:360px;overflow-y:auto;">
                                            <table class="table table-striped mb-0 table-sm">
                                                <thead style="position:sticky;top:0;">
                                                    <tr>
                                                        <th class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="isAllLxcBackupsSelected" @change="toggleSelectAllLxcBackups" :disabled="lxcBackups.length === 0" style="cursor:pointer"></th>
                                                        <th style="width:40px;">#</th>
                                                        <th>备份时间</th>
                                                        <th>大小</th>
                                                        <th>备注</th>
                                                        <th style="width:100px;">状态</th>
                                                        <th>存储</th>
                                                        <th style="width:60px;">操作</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="(b, idx) in lxcBackups" :key="b.id" :style="lxcBackupSelected.has(b.id) ? 'background:rgba(99,102,241,0.08)' : ''">
                                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="lxcBackupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleLxcBackupSelect(b.id)" style="cursor:pointer"></td>
                                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                                        <td class="small text-muted" :title="b.notes">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                                        <td>
                                                            <span v-if="b.status === 'completed'" class="badge bg-success">完成</span>
                                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">等待中</span>
                                                            <span v-else class="badge bg-danger" :title="b.error_msg">失败</span>
                                                        </td>
                                                        <td class="small">{{ b.storage }}</td>
                                                        <td>
                                                            <div class="d-flex gap-1">
                                                                <pv-button v-if="b.status === 'completed'" @click="restoreLxcBackup(b)" title="恢复此备份" variant="outline" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                                
</pv-button>
                                                                <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteLxcBackup(b.id, lxcBackupVmId)" title="删除备份" variant="outline-danger" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                                
</pv-button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 销毁确认弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="destroyLxcModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content border-danger">
                            <div class="modal-body text-center py-4">
                                <div class="mb-3">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                </div>
                                <h5 class="text-danger mb-3">⚠️ 销毁容器确认</h5>
                                <p class="text-muted small mb-3">
                                    此操作将<strong class="text-danger">永久销毁</strong>容器 <strong>{{ editLxcForm.name || 'CT ' + editLxcForm.ct_id }}</strong> 及其所有数据，<br>
                                    包括磁盘、快照、备份等。<br>
                                    <span class="text-danger">此操作不可恢复！</span>
                                </p>
                                <div class="mb-3">
                                    <label class="form-label small text-muted">请输入 <code>yes</code> 确认销毁</label>
                                    <input type="text" class="form-control form-control-sm text-center" v-model="destroyLxcConfirmText" placeholder="输入 yes">
                                </div>
                                <div class="d-flex gap-2 justify-content-center">
                                    <pv-button type="button" :disabled="destroyLxcConfirmText !== 'yes'" @click="confirmDestroyLxc" variant="danger">确认销毁</pv-button>
                                    <pv-button type="button" @click="bsModalHide('destroyLxcModal'); destroyLxcConfirmText = ''" variant="outline">取消</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- VM 销毁确认弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="destroyVmModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content border-danger">
                            <div class="modal-body text-center py-4">
                                <div class="mb-3">
                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#dc3545" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                    </svg>
                                </div>
                                <h5 class="text-danger mb-3">⚠️ 销毁虚拟机确认</h5>
                                <p class="text-muted small mb-3">
                                    此操作将<strong class="text-danger">永久销毁</strong>虚拟机 <strong>{{ destroyVmTarget ? (destroyVmTarget.name || 'VM ' + destroyVmTarget.vm_id) : '' }}</strong> 及其所有数据，<br>
                                    包括磁盘、快照、备份等。<br>
                                    <span class="text-danger">此操作不可恢复！</span>
                                </p>
                                <div class="mb-3">
                                    <label class="form-label small text-muted">请输入 <code>yes</code> 确认销毁</label>
                                    <input type="text" class="form-control form-control-sm text-center" v-model="destroyVmConfirmText" placeholder="输入 yes">
                                </div>
                                <div class="d-flex gap-2 justify-content-center">
                                    <pv-button type="button" :disabled="destroyVmConfirmText !== 'yes'" @click="confirmDestroyVm" variant="danger">确认销毁</pv-button>
                                    <pv-button type="button" @click="bsModalHide('destroyVmModal'); destroyVmConfirmText = ''" variant="outline">取消</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- VM 模板编辑弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="vmTemplateModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ templatePage.vmTemplateForm.value.id ? '编辑 VM 模板' : '新建 VM 模板' }}</h5>
                                <pv-button type="button" variant="close" @click="bsModalHide('vmTemplateModal')"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6"><label class="form-label">模板名称</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">模板 VM</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.template_vmid">
                                            <option value="">请选择 PVE 模板 VM</option>
                                            <option v-for="v in templatePage.pveTemplateVms.value" :key="v.vmid" :value="v.vmid">{{ v.name || 'VM ' + v.vmid }} ({{ v.vmid }})</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">CPU (核)</label><input class="form-control" type="number" v-model="templatePage.vmTemplateForm.value.cores"></div>
                                    <div class="col-md-6"><label class="form-label">内存 (MB)</label><input class="form-control" type="number" v-model="templatePage.vmTemplateForm.value.memory"></div>
                                    <div class="col-md-6"><label class="form-label">目标存储</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.target_storage">
                                            <option value="">请选择存储池</option>
                                            <option v-for="s in templatePage.allStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }}{{ s.maxdisk ? ' (' + (s.maxdisk/1073741824).toFixed(0) + 'GB)' : '' }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">网络桥接</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.network_bridge"></div>
                                    <div class="col-md-6"><label class="form-label">克隆模式</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.clone_mode">
                                            <option value="full">完整克隆（独立磁盘）</option>
                                            <option value="linked">链接克隆（共享基础磁盘）</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">CPU 亲和性（可选）</label>
                                        <input class="form-control" v-model="templatePage.vmTemplateForm.value.cpu_affinity" placeholder="如 0-11, 留空不绑定">
                                    </div>
                                    <div class="col-md-6"><label class="form-label">网卡型号</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.network_model"></div>
                                    <div class="col-md-6"><label class="form-label">操作系统类型</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.os_type"></div>
                                    <div class="col-md-6"><label class="form-label">Cloud-init 用户</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.ciuser" placeholder="如 root"></div>
                                    <div class="col-md-6"><label class="form-label">状态</label><select class="form-select" v-model="templatePage.vmTemplateForm.value.status"><option value="active">启用</option><option value="inactive">停用</option></select></div>
                                    <div class="col-md-6"><label class="form-label">MAC分组</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.mac_group_id">
                                            <option value="">不加入分组</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">描述</label><textarea class="form-control" rows="2" v-model="templatePage.vmTemplateForm.value.description"></textarea></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button @click="bsModalHide('vmTemplateModal')">取消</pv-button>
                                <pv-button @click="templatePage.saveVmTemplate()">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- LXC 模板编辑弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="lxcTemplateModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ templatePage.lxcTemplateForm.value.id ? '编辑 LXC 模板' : '新建 LXC 模板' }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="bsModalHide('lxcTemplateModal')"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6"><label class="form-label">模板名称</label><input class="form-control" v-model="templatePage.lxcTemplateForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">模板存储</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.storage">
                                            <option value="">请选择存储池</option>
                                            <option v-for="s in templatePage.lxcStorages.value" :key="s.id" :value="s.id">{{ s.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">容器存储</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.rootfs_storage">
                                            <option value="">请选择容器存储位置</option>
                                            <option v-for="s in templatePage.lxcStorages.value" :key="s.id" :value="s.id">{{ s.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">模板路径 (ostemplate)</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.ostemplate">
                                            <option value="">请先选择存储池</option>
                                            <option v-for="t in templatePage.lxcOstemplates.value" :key="t.volid" :value="t.volid">{{ t.volid }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3"><label class="form-label">CPU (核)</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">内存 (MB)</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.memory"></div>
                                    <div class="col-md-3"><label class="form-label">Swap (MB)</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.swap"></div>
                                    <div class="col-md-3"><label class="form-label">磁盘 (GB)</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.disk_size"></div>
                                    <div class="col-md-6"><label class="form-label">网桥</label><input class="form-control" v-model="templatePage.lxcTemplateForm.value.network_bridge"></div>
                                    <div class="col-md-6"><label class="form-label">网络模式</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.network_mode"><option value="dhcp">DHCP</option><option value="static">静态</option></select></div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.network_mode === 'static'">
                                        <label class="form-label">IPv4 地址</label>
                                        <input class="form-control" v-model="templatePage.lxcTemplateForm.value.ip4_addr" placeholder="如: 192.168.1.100/24">
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check mt-3">
                                            <input class="form-check-input" type="checkbox" v-model="templatePage.lxcTemplateForm.value.ipv6_enabled" :true-value="1" :false-value="0" id="lxcTemplateIpv6">
                                            <label class="form-check-label" for="lxcTemplateIpv6">启用 IPv6</label>
                                        </div>
                                    </div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.ipv6_enabled">
                                        <label class="form-label">IPv6 模式</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.ip6_mode">
                                            <option value="dhcp">DHCP</option>
                                            <option value="static">静态</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.ipv6_enabled && templatePage.lxcTemplateForm.value.ip6_mode === 'static'">
                                        <label class="form-label">IPv6 地址</label>
                                        <input class="form-control" v-model="templatePage.lxcTemplateForm.value.ip6_addr" placeholder="如: 2001:db8::1/64">
                                    </div>
                                    <div class="col-md-6"><label class="form-label">非特权容器</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.unprivileged"><option :value="1">是</option><option :value="0">否</option></select></div>
                                    <div class="col-md-6"><label class="form-label">特性</label><input class="form-control" v-model="templatePage.lxcTemplateForm.value.features" placeholder="nesting=1,fuse=1"></div>
                                    <div class="col-md-6"><label class="form-label">状态</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.status"><option value="active">启用</option><option value="inactive">停用</option></select></div>
                                    <div class="col-md-6"><label class="form-label">MAC分组</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.mac_group_id">
                                            <option value="">不加入分组</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">描述</label><textarea class="form-control" rows="2" v-model="templatePage.lxcTemplateForm.value.description"></textarea></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button @click="bsModalHide('lxcTemplateModal')" variant="secondary">取消</pv-button>
                                <pv-button @click="templatePage.saveLxcTemplate()" variant="primary">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 自定义 Alert 弹窗 -->
                <Teleport to="body">
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
                                <pv-button type="button" @mousedown="(e) => e.target.blur()" data-bs-dismiss="modal">确定</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 自定义 Confirm 弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="customConfirmModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4">
                                <div class="custom-alert-icon mb-3">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                    </svg>
                                </div>
                                <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;white-space:pre-line;">{{ customConfirmMessage }}</p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                                <pv-button type="button" @click="confirmCancel" variant="outline">取消</pv-button>
                                <pv-button type="button" @click="confirmOk">确定</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 自定义 Prompt 弹窗（带输入框） -->
                <Teleport to="body">
                <div class="modal fade" id="customPromptModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body py-4 px-4">
                                <div class="custom-alert-icon mb-3 text-center">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                                    </svg>
                                </div>
                                <p class="custom-alert-msg mb-3 text-center" style="color:var(--text-primary);font-size:14px;line-height:1.6;white-space:pre-line;">{{ customPromptMessage }}</p>
                                <input type="text" class="form-control text-center" id="customPromptInput" v-model="customPromptValue" @keydown.enter="promptOk" autocomplete="off">
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                                <pv-button type="button" @click="promptCancel" variant="outline">取消</pv-button>
                                <pv-button type="button" @click="promptOk">确定</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 端口转发弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="forwardModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ isEditingForward ? '编辑' : '添加' }}端口转发</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="text-muted small mb-3" v-if="userRole !== 'admin'">
                                    📊 已使用 {{ userForwardCount }} / {{ maxForwardPerUser }} 条
                                </div>
                                <div class="mb-3" v-if="userRole === 'admin'">
                                    <label class="form-label">类型</label>
                                    <div>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="vm"> VM</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="lxc"> LXC</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="general"> 通用</label>
                                    </div>
                                </div>
                                <div class="mb-3" v-if="forwardForm.type !== 'general'">
                                    <label class="form-label">选择设备</label>
                                    <select class="form-select" v-model="forwardForm.vm_id" v-if="forwardForm.type === 'vm'" @change="selectDevice">
                                        <option :value="null">-- 请选择虚拟机 --</option>
                                        <option v-for="d in availableDevices" :key="d.device_id" :value="d.device_id">
                                            {{ d.name }} - {{ d.ip || 'IP 未知' }}
                                        </option>
                                    </select>
                                    <select class="form-select" v-model="forwardForm.ct_id" v-else @change="selectDevice">
                                        <option :value="null">-- 请选择容器 --</option>
                                        <option v-for="d in availableDevices" :key="d.device_id" :value="d.device_id">
                                            {{ d.name }} - {{ d.ip || 'IP 未知' }}
                                        </option>
                                    </select>
                                </div>
                                <div class="mb-3" v-if="forwardForm.type === 'general'">
                                    <div class="alert alert-info small">通用类型无需绑定 VM/LXC，请直接填写目标 IP</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">目标 IP</label>
                                    <input type="text" class="form-control" v-model="forwardForm.ip" placeholder="选中设备自动填入或手动输入">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">规则名称</label>
                                    <input type="text" class="form-control" v-model="forwardForm.name" placeholder="自定义备注，如 SSH 转发">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">协议</label>
                                    <div>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="tcp"> TCP</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="udp"> UDP</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="tcp+udp"> TCP+UDP</label>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">内网端口</label>
                                        <input type="number" class="form-control" v-model.number="forwardForm.internal_port" min="1" max="65535">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">外网端口</label>
                                        <div class="input-group">
                                            <input type="number" class="form-control" :class="{ 'is-invalid': checkResult === false }" v-model.number="forwardForm.external_port" min="1" max="65535">
                                            <pv-button type="button" @click="randomPort" variant="outline">🎲</pv-button>
                                            <pv-button type="button" @click="checkPortConflict" variant="outline">🔍</pv-button>
                                        </div>
                                        <small class="text-muted">可用范围: <span v-if="userRole === 'admin'">1-65535（管理员不限）</span><span v-else>{{ networkConfig.port_range_start }}-{{ networkConfig.port_range_end }}</span></small>
                                        <div v-if="checkResult === true" class="text-success small">✅ 端口可用</div>
                                        <div v-else-if="checkResult === false" class="text-danger small">❌ 端口已被占用，请更换</div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button type="button" @click="submitForward" :disabled="checkResult === false" variant="primary">提交</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                <!-- 设备端口转发弹窗 -->
                <Teleport to="body">
                <div class="modal fade" id="deviceForwardModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ deviceModal.device.name || (deviceModal.device.type === 'vm' ? 'VM ' + deviceModal.device.deviceId : 'CT ' + deviceModal.device.deviceId) }} - 端口转发管理</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body" style="min-height:150px;">

                                <!-- 规则列表 -->
                                <template v-if="!showDeviceForm">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <div><span class="text-muted small">共 {{ deviceRules.length }} 条规则</span><span class="text-muted small ms-3">剩余可用 {{ forwardConfig.remaining }} 条</span></div>
                                        <pv-button @click="openDeviceFormModal" size="sm">添加端口转发</pv-button>
                                    </div>
                                    <div v-if="deviceRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>
                                    <div v-else class="table-responsive mb-0">
                                        <table class="table table-striped table-hover mb-0">
                                            <thead><tr>
                                                <th>名称</th><th>目标 IP</th><th>内网端口</th><th>外网端口</th><th>协议</th><th>状态</th><th>操作</th>
                                            </tr></thead>
                                            <tbody>
                                                <tr v-for="rule in deviceRules" :key="rule.id" :class="{ 'text-muted': rule.sync_status === 'orphan' }">
                                                    <td>{{ rule.name || '-' }}</td>
                                                    <td>{{ rule.ip }}</td>
                                                    <td>{{ rule.internal_port }}</td>
                                                    <td>{{ rule.external_port }}</td>
                                                    <td>{{ (rule.protocol || '').toUpperCase() }}</td>
                                                    <td><span :class="rule.enabled ? 'text-success' : 'text-muted'">{{ rule.enabled ? '启用' : '禁用' }}</span></td>
                                                    <td>
                                                        <pv-button @click="openDeviceEditModal(rule)" variant="outline" size="sm">编辑</pv-button>
                                                        <pv-button @click="deleteDeviceRule(rule)" variant="outline-danger" size="sm">删除</pv-button>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </template>

                                <!-- 添加/编辑表单 -->
                                <template v-else>
                                    <div class="mb-3">
                                        <label class="form-label">规则名称</label>
                                        <input type="text" class="form-control" v-model="deviceForm.name" placeholder="自定义备注，如 SSH 转发">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">目标 IP</label>
                                        <input type="text" class="form-control" v-model="deviceForm.ip" placeholder="自动获取设备 IP" readonly>
                                        <small class="text-muted">目标 IP 自动从当前设备获取，不可手动修改</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">协议</label>
                                        <div>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp"> TCP</label>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="udp"> UDP</label>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp+udp"> TCP+UDP</label>
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">内网端口</label>
                                            <input type="number" class="form-control" v-model.number="deviceForm.internal_port" min="1" max="65535">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">外网端口</label>
                                            <div class="input-group">
                                                <input type="number" class="form-control" :class="{ 'is-invalid': deviceCheckResult === false }" v-model.number="deviceForm.external_port" min="1" max="65535">
                                                <pv-button type="button" @click="randomDevicePort" variant="outline">🎲</pv-button>
                                            </div>
                                            <small class="text-muted">可用范围: {{ networkConfig.port_range_start }}-{{ networkConfig.port_range_end }}</small>
                                        </div>
                                    </div>
                                    <div class="d-flex justify-content-end gap-2">
                                        <pv-button type="button" @click="cancelDeviceForm" variant="outline">取消</pv-button>
                                        <pv-button type="button" @click="submitDeviceRule" variant="primary">{{ editingDeviceRuleId ? '保存' : '添加' }}</pv-button>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
                </Teleport>

                                <!-- VM/LXC 操作确认弹窗 -->
                                <Teleport to="body">
                                <div class="vm-detail-modal" :class="{ show: confirmState?.vmId !== null || lxcConfirmState?.ctId !== null }" @click.self="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">
                                    <div class="modal-content" style="max-width:440px">
                                        <div class="modal-header">
                                            <h2 class="modal-title">操作确认</h2>
                                            <button class="modal-close" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">✕</button>
                                        </div>
                                        <div class="modal-body" style="padding:24px 28px;text-align:center">
                                            <p style="font-size:15px;color:var(--text-primary);line-height:1.6;margin:0 0 20px">{{ confirmState?.vmId !== null ? confirmActionText : confirmLxcActionText }}</p>
                                            <div style="display:flex;gap:10px;justify-content:center">
                                                <button class="table-btn btn-danger" style="padding:8px 28px;font-size:14px" @click="confirmState?.vmId !== null ? confirmAction(userVms.find(function(v){return v.id===confirmState.vmId})||userVms[0]) : confirmLxcAction(userLxcContainers.find(function(c){return c.ct_id===lxcConfirmState.ctId})||userLxcContainers[0])">确认执行</button>
                                                <button class="table-btn" style="padding:8px 28px;font-size:14px" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">取消</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </Teleport>

                                <!-- VM/CT 详情监控弹窗（Teleport到body，避免被main-wrap层叠上下文遮挡） -->
                                <Teleport to="body">
                                <div class="vm-detail-modal" :class="{ show: showVmDetail }" @click.self="closeVmDetail()">
                                    <div class="modal-content">
                                        <div class="modal-header">
                                            <h2 class="modal-title">{{ detailVm._isLxc ? (detailVm.name || ('CT ' + detailVm.vm_id)) : (detailVm.name || ('VM ' + detailVm.vm_id)) }} 详情</h2>
                                            <button class="modal-close" @click="closeVmDetail()">✕</button>
                                        </div>
                                        <div class="modal-body">
                                            <!-- 基本信息区域 -->
                                            <div class="info-card">
                                                <div class="info-grid">
                                                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? '容器ID' : '虚拟机ID' }}</span><span class="info-value">{{ detailVm.vm_id || '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">内网IP</span><span class="info-value">{{ detailVm.ip || '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">硬件配置</span><span class="info-value">{{ detailVmConfigStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">续费价格</span><span class="info-value">{{ detailVm.renewal_price ? detailVm.renewal_price + '元/' + (detailVm.renewal_period === 'year' ? '年' : detailVm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? '镜像' : '操作系统' }}</span><span class="info-value">{{ detailVmOsStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">运行状态</span><span class="info-value">{{ detailVmStatusStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">运行时长</span><span class="info-value">{{ detailVmUptimeStr }}</span></div>
                                                </div>
                                            </div>
                                            <!-- 监控图表区域 -->
                                            <h4 style="font-size:16px;color:var(--text-secondary);margin-bottom:16px;">实时性能监控</h4>
                                            <div class="chart-grid">
                                                <div class="chart-card"><div class="chart-title">CPU 使用率 (%)</div><canvas id="detailCpuChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">内存使用率 (%)</div><canvas id="detailMemChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">网络流量 (Mbps)</div><canvas id="detailNetChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">磁盘IO (MB/s)</div><canvas id="detailDiskChart"></canvas></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </Teleport>
                            
`);
})();
