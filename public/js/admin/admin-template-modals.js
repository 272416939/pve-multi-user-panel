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
                                        {{ {1:t('user.message.system'),2:t('user.message.business'),3:t('user.message.renewal'),4:t('user.message.ticket'),5:t('user.message.cs')}[currentMsg.type] || t('nav.messages') }}
                                    </span>
                                    <span class="text-muted ms-2 small">{{ formatDate(currentMsg.created_at) }}</span>
                                </div>
                                <div class="message-detail-content markdown-body" style="line-height:1.7;" v-html="parseMarkdown(currentMsg.content)"></div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">{{ t('common.delete') }}</pv-button>
                                <pv-button type="button" data-bs-dismiss="modal">{{ t('common.close') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('admin.users.create') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="createUser">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('login.username') }}</label>
                                        <input type="text" class="form-control" v-model="createUserForm.username" required autocomplete="username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('login.password') }}</label>
                                        <input type="password" class="form-control" v-model="createUserForm.password" required autocomplete="new-password">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('admin.users.role') }}</label>
                                        <select class="form-select" v-model="createUserForm.role">
                                            <option value="user">{{ t('admin.osswitchlog.user') }}</option>
                                            <option value="admin">{{ t('admin.logs.admin') }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('register.email') }}</label>
                                        <input type="email" class="form-control" v-model="createUserForm.email" :placeholder="t('common.optional')">
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="createUserEmailVerified" v-model="createUserForm.emailVerified">
                                        <label class="form-check-label" for="createUserEmailVerified">{{ t('admin.modal.activateEmail') }}</label>
                                    </div>
                                    <pv-button type="submit" variant="glass" >{{ t('common.create') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('admin.users.edit') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateUser">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('login.username') }}</label>
                                        <input type="text" class="form-control" v-model="editUserForm.username" autocomplete="username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('admin.modal.newPwdKeep') }}</label>
                                        <input type="password" class="form-control" v-model="editUserForm.password" autocomplete="new-password">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('admin.users.role') }}</label>
                                        <select class="form-select" v-model="editUserForm.role">
                                            <option value="user">{{ t('admin.osswitchlog.user') }}</option>
                                            <option value="admin">{{ t('admin.logs.admin') }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('register.email') }}</label>
                                        <input type="email" class="form-control" v-model="editUserForm.email" :placeholder="t('admin.modal.emailClearPh')">
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="editUserEmailVerified" v-model="editUserForm.emailVerified">
                                        <label class="form-check-label" for="editUserEmailVerified">{{ t('admin.modal.activateEmail') }}</label>
                                    </div>
                                    <div v-if="editUserForm.totp_enabled" class="mb-3 d-flex align-items-center">
                                        <span class="me-2">{{ t('admin.modal.twofaEnabled') }}</span>
                                        <pv-button type="button" @click="disableUser2fa(editUserForm.id)" variant="outline" size="sm">{{ t('user.twofa.disableBtn') }}</pv-button>
                                    </div>
                                    <pv-button type="submit" variant="primary" >{{ t('common.save') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('admin.modal.rechargeTitle') }}</h5>
                                <pv-button variant="close" @click="rechargeShow = false"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p>{{ t('admin.modal.usernameLabel') }}<strong>{{ rechargeUser?.username }}</strong></p>
                                <p>{{ t('admin.modal.balancePfx') }}{{ parseFloat(rechargeUser?.balance||0).toFixed(2) }}</p>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('admin.modal.rechargeAmount') }}</label>
                                    <input type="number" class="form-control" v-model.number="rechargeAmount" min="0.01" step="0.01" :placeholder="t('admin.modal.rechargeAmountPh')">
                                </div>
                                <div v-if="rechargeError" class="alert alert-danger py-2">{{ rechargeError }}</div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button @click="rechargeShow = false" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="submitRecharge">{{ t('admin.modal.rechargeSubmit') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('settings.smtp.testSend') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="sendTestEmail">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('admin.modal.testEmailTo') }}</label>
                                        <input type="email" class="form-control" v-model="testEmail" required>
                                    </div>
                                    <pv-button type="submit" variant="primary" >{{ t('common.send') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('admin.modal.cdkResultTitle') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <p>{{ t('admin.modal.cdkGeneratedPrefix') }} <strong>{{ cdkResult.length }}</strong> {{ t('admin.modal.cdkGeneratedSuffix') }}</p>
                                    <p v-if="cdkResultBatchId" class="text-muted small">{{ t('admin.modal.batchNoPfx') }} {{ cdkResultBatchId }}</p>
                                </div>
                                <div class="mb-3 d-flex gap-2">
                                    <pv-button @click="exportCdkCsv(cdkResultBatchId)" size="sm">

                                        {{ t('admin.modal.exportBatchCsv') }}
                                    
</pv-button>
                                    <pv-button @click="copyBatchCodes" variant="outline" size="sm">

                                        {{ t('admin.modal.copyAllCodes') }}
                                    
</pv-button>
                                </div>
                                <div class="table-container" style="padding:12px;">
                                    <div class="table-responsive" style="max-height: 400px; overflow-y: auto;">
                                    <table class="table table-sm table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>{{ t('admin.cdk.codeShort') }}</th>
                                                <th>{{ t('admin.cdk.renewDays') }}</th>
                                                <th>{{ t('admin.cdk.assignUsers') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(cdk, index) in cdkResult" :key="cdk.id">
                                                <td>{{ index + 1 }}</td>
                                                <td><code class="user-select-all">{{ cdk.code }}</code></td>
                                                <td>{{ cdk.duration_days }} {{ t('common.days') }}</td>
                                                <td>{{ cdk.target_username || '-' }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal">{{ t('common.close') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.vm.editVm') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateVm" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('common.name') }}</label>
                                        <input type="text" class="form-control" v-model="editVmForm.name">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.assignTo') }}</label>
                                        <select class="form-select" v-model="editVmForm.user_id">
                                            <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ u.username }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.expiryTime') }}</label>
                                        <input type="datetime-local" class="form-control" v-model="editVmForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.vm.renewPrice') }}</label>
                                        <input type="number" step="0.01" min="0" class="form-control" v-model="editVmForm.renewal_price" :placeholder="t('common.ph.price')">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                                        <select class="form-select" v-model="editVmForm.renewal_period">
                                            <option value="month">{{ t('dash.month30') }}</option>
                                            <option value="quarter">{{ t('dash.quarter90') }}</option>
                                            <option value="year">{{ t('dash.year365') }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('admin.modal.backupStorage') }}</label>
                                        <select class="form-select" v-model="editVmForm.backup_storage">
                                            <option value="">{{ t('admin.modal.globalDefault') }}</option>
                                            <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                        </select>
                                        <small class="text-muted">{{ t('admin.modal.backupStorageHint') }}</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.macGroup') }}</label>
                                        <select class="form-select" v-model="editVmForm.mac_group_id">
                                            <option value="">{{ t('dash.noGroup') }}</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" formnovalidate>{{ t('common.save') }}</pv-button>
                                        <pv-button type="button" @click="removeVm" :disabled="editVmForm.status && editVmForm.status.status === 'running'"    :title="editVmForm.status && editVmForm.status.status === 'running' ? t('dash.busy.powerOffFirst') : t('dash.vm.removeUnassignOnly')" variant="outline-warning">{{ t('dash.detachOnly') }}</pv-button>
                                        <pv-button type="button" @click="openDestroyVmConfirm" :disabled="editVmForm.status && editVmForm.status.status === 'running'"    :title="editVmForm.status && editVmForm.status.status === 'running' ? t('dash.busy.powerOffFirst') : t('dash.vm.destroyDelPve')" variant="danger">{{ t('admin.modal.destroyPve') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.overview.cdk') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body" @click="cdkVmDropdownOpen = false">
                                <div v-if="cdkRedeemStep === 'input'">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.cdk.code') }}</label>
                                        <input type="text" class="form-control" v-model="cdkRedeemForm.code" :placeholder="t('dash.cdk.codePh')" style="text-transform: uppercase;" @input="cdkRedeemForm.code = cdkRedeemForm.code.toUpperCase()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.cdk.resType') }}</label>
                                        <div class="d-flex gap-3">
                                            <div class="form-check">
                                                <input type="radio" class="form-check-input" id="cdkTypeVm" value="vm" v-model="cdkRedeemForm.type">
                                                <label class="form-check-label" for="cdkTypeVm">{{ t('nav.vms') }}</label>
                                            </div>
                                            <div class="form-check">
                                                <input type="radio" class="form-check-input" id="cdkTypeLxc" value="lxc" v-model="cdkRedeemForm.type">
                                                <label class="form-check-label" for="cdkTypeLxc">{{ t('nav.lxcSub') }}</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" id="cdk-vm-label">{{ t('dash.cdk.pickRenew1') }}{{ cdkRedeemForm.type === 'vm' ? t('nav.vms') : t('nav.lxcSub') }}</label>
                                        <div class="custom-select" style="width:100%;" :class="{ open: cdkVmDropdownOpen }" @click.stop>
                                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-vm-label"
                                                 @click="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.enter.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.space.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                                 @keydown.esc="cdkVmDropdownOpen = false">
                                                <span v-if="cdkRedeemForm.resource_id">
                                                    {{ getRedeemableResourceName(cdkRedeemForm.resource_id, cdkRedeemForm.type) }}
                                                </span>
                                                <span v-else class="custom-select-placeholder">{{ t('dash.cdk.pickRenewPh1') }}{{ cdkRedeemForm.type === 'vm' ? t('nav.vms') : t('nav.lxcSub') }}</span>
                                            </div>
                                            <div class="custom-select-dropdown" role="listbox">
                                                <div v-if="cdkRedeemForm.type === 'vm'">
                                                    <div v-for="vm in userVms" :key="vm.id" class="option" role="option"
                                                         :class="{ selected: cdkRedeemForm.resource_id == vm.id }"
                                                         @click="cdkRedeemForm.resource_id = vm.id; cdkVmDropdownOpen = false;">
                                                        {{ vm.name || 'VM ' + vm.vm_id }}{{ t('dash.expireParen') }} {{ vm.expiration_date ? formatDate(vm.expiration_date) : t('dash.unset') }} <span v-if="vm.expiration_date" :class="getExpiryColor(vm.expiration_date)">{{ daysUntilExpire(vm.expiration_date) }}</span>）
                                                    </div>
                                                </div>
                                                <div v-else>
                                                    <div v-for="ct in userLxcContainers" :key="ct.id" class="option" role="option"
                                                         :class="{ selected: cdkRedeemForm.resource_id == ct.id }"
                                                         @click="cdkRedeemForm.resource_id = ct.id; cdkVmDropdownOpen = false;">
                                                        {{ ct.name || 'CT ' + ct.ct_id }}{{ t('dash.expireParen') }} {{ ct.expiration_date ? formatDate(ct.expiration_date) : t('dash.unset') }} <span v-if="ct.expiration_date" :class="getExpiryColor(ct.expiration_date)">{{ daysUntilExpire(ct.expiration_date) }}</span>）
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div v-if="cdkRedeemError" class="alert alert-danger">{{ cdkRedeemError }}</div>
                                </div>
                                <div v-if="cdkRedeemStep === 'result'">
                                    <div class="alert alert-success">
                                        <strong>{{ t('dash.cdk.success') }}</strong>
                                        <p class="mb-0 mt-2">{{ cdkRedeemMessage }}</p>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer d-flex gap-2" v-if="cdkRedeemStep === 'input'">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="redeemCdk" :disabled="!cdkRedeemForm.code || !cdkRedeemForm.resource_id" variant="primary">{{ t('dash.cdk.confirm') }}</pv-button>
                            </div>
                            <div class="modal-footer" v-if="cdkRedeemStep === 'result'">
                                <pv-button type="button" data-bs-dismiss="modal" @click="cdkRedeemStep = 'input'">{{ t('dash.statusDone') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.snap.managePfx') }} {{ snapshotVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="snapshotLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                                        <span class="visually-hidden">{{ t('common.loading') }}</span>
                                    </div>
                                    <p class="mt-2 text-muted small">{{ t('dash.snap.loadingList') }}</p>
                                </div>
                                <div v-else>
                                    <div class="card mb-3">
                                        <div class="card-header">
                                            <h6 class="mb-0">{{ t('dash.snap.create') }}</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="mb-2">
                                                <textarea class="form-control form-control-sm" v-model="snapshotForm.description" rows="2" :placeholder="t('common.ph.notesOptional')"></textarea>
                                            </div>
                                            <div class="d-flex justify-content-end align-items-center">
                                                <pv-button @click="createSnapshot(snapshotVmId)" :disabled="snapshotCreating" size="sm">

                                                    <span v-if="snapshotCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                    {{ t('dash.snap.create') }}

</pv-button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="card mb-3">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="checkbox" class="form-check-input m-0" :checked="isAllSnapshotsSelected" @change="toggleSelectAllSnapshots" :disabled="snapshots.length === 0" style="cursor:pointer">
                                                <h6 class="mb-0">{{ t('dash.snap.existing') }}</h6>
                                            </div>
                                            <div class="d-flex align-items-center gap-2">
                                                <pv-button v-if="isAnySnapshotSelected" @click="batchDeleteSnapshots(snapshotVmId)" :disabled="snapshotDeleting" variant="outline-danger" size="sm">

                                                    <span v-if="snapshotDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                    {{ t('dash.batchDeletePrefix') }}{{ snapshotSelected.size }})
                                                
</pv-button>
                                                <span class="badge bg-secondary">{{ snapshots.length }} {{ t('admin.geSuffix') }}</span>
                                            </div>
                                        </div>
                                        <div class="card-body p-0">
                                            <div v-if="snapshots.length === 0" class="text-center text-muted py-4 small">
                                                {{ t('dash.snap.empty') }}
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
                                                        <pv-button @click="rollbackSnapshot(snapshotVmId, snap.name)" :title="t('dash.snap.rollbackTitle')" variant="outline" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                                                <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
                                                            </svg>
                                                        
</pv-button>
                                                        <pv-button @click="deleteSnapshot(snapshotVmId, snap.name)" :title="t('dash.snap.deleteTitle')" variant="outline-danger" size="sm">

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
                                            <h6 class="mb-0">{{ t('dash.snap.limitInfo') }}</h6>
                                        </div>
                                        <div class="card-body">
                                            <div class="row text-center g-2">
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.currentCount') }}</div>
                                                        <div class="fw-bold" :class="snapshotLimits.current >= snapshotLimits.max ? 'text-danger' : ''" style="color: var(--text-primary);">
                                                            {{ snapshotLimits.current }} / {{ snapshotLimits.max }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.todayCreate') }}</div>
                                                        <div class="fw-bold" :class="snapshotLimits.today_creates >= snapshotLimits.max_creates ? 'text-danger' : ''" style="color: var(--text-primary);">
                                                            {{ snapshotLimits.today_creates }} / {{ snapshotLimits.max_creates }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.todayRestore') }}</div>
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
                                <h5 class="modal-title">{{ t('dash.backup.managePfx') }} {{ backupVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="card mb-3">
                                    <div class="card-header"><h6 class="mb-0">{{ t('dash.backup.create') }}</h6></div>
                                    <div class="card-body">
                                        <div class="mb-2">
                                            <label class="form-label small">{{ t('admin.disk.storageLocation') }}</label>
                                            <select class="form-select form-select-sm" v-model="backupForm.storage">
                                                <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                        <div class="mb-2">
                                            <textarea class="form-control form-control-sm" v-model="backupForm.notes" rows="2" maxlength="50" :placeholder="t('common.ph.notesOptional')" style="resize:none"></textarea>
                                             <small :style="'display:block;text-align:right;margin-top:2px;color:' + (backupForm.notes.length >= 50 ? '#ff4444' : 'var(--text-muted)')">{{ backupForm.notes.length || 0 }}/50</small>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <small class="text-muted">{{ t('dash.backup.stopMode') }}</small>
                                            <pv-button @click="createBackup(backupVmId)" :disabled="backupCreating" size="sm">

                                                <span v-if="backupCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                {{ t('dash.backup.now') }}
                                            
</pv-button>
                                        </div>
                                    </div>
                                </div>

                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center gap-2">
                                            <input type="checkbox" class="form-check-input m-0" :checked="isAllBackupsSelected" @change="toggleSelectAllBackups" :disabled="backups.length === 0" style="cursor:pointer">
                                            <h6 class="mb-0">{{ t('dash.backup.history') }}</h6>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <pv-button v-if="isAnyBackupSelected" @click="batchDeleteBackups(backupVmId)" :disabled="backupDeleting" variant="outline-danger" size="sm">

                                                <span v-if="backupDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                {{ t('dash.batchDeletePrefix') }}{{ backupSelected.size }})
                                            
</pv-button>
                                            <span class="badge bg-secondary">{{ backups.length }} {{ t('admin.geSuffix') }}</span>
                                        </div>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-if="backups.length === 0" class="text-center text-muted py-4 small">{{ t('dash.backup.empty') }}</div>
                                        <div v-else class="table-container" style="padding:12px;"><div class="table-responsive" style="max-height:360px;overflow-y:auto;">
                                            <table class="table table-hover mb-0 table-sm table-align-center">
                                                <thead style="position:sticky;top:0;">
                                                    <tr>
                                                        <th class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="isAllBackupsSelected" @change="toggleSelectAllBackups" :disabled="backups.length === 0" style="cursor:pointer"></th>
                                                        <th style="width:40px;">#</th>
                                                        <th>{{ t('dash.backup.time') }}</th>
                                                        <th>{{ t('common.size') }}</th>
                                                        <th>{{ t('dash.order.note') }}</th>
                                                        <th style="width:100px;">{{ t('common.status') }}</th>
                                                        <th>{{ t('admin.templates.storage') }}</th>
                                                        <th style="width:60px;">{{ t('common.actions') }}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="(b, idx) in backups" :key="b.id" :style="backupSelected.has(b.id) ? 'background:color-mix(in srgb, var(--color-primary) 8%, transparent)' : ''">
                                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="backupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleBackupSelect(b.id)" style="cursor:pointer"></td>
                                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                                        <td class="small text-muted" :title="b.notes">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                                        <td>
                                                            <span v-if="b.status === 'completed'" class="badge bg-success">{{ t('dash.statusDone') }}</span>
                                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">{{ t('admin.osswitchlog.status.pending') }}</span>
                                                            <span v-else class="badge bg-danger" :title="b.error_msg">{{ t('admin.osswitchlog.status.failed') }}</span>
                                                        </td>
                                                        <td class="small">{{ b.storage }}</td>
                                                        <td>
                                                            <div class="d-flex gap-1">
                                                                <pv-button v-if="b.status === 'completed'" @click="restoreBackup(b)" :title="t('dash.backup.restoreTitle')" variant="outline" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                                
</pv-button>
                                                                <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteBackup(b.id)" :title="t('dash.backup.deleteTitle')" variant="outline-danger" size="sm">

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
                                    <div v-if="backups.some(b => b.status === 'running')" class="card-footer">
                                        <div v-for="b in backups.filter(b => b.status === 'running')" :key="'prog-'+b.id" class="mb-1">
                                            <small class="text-muted d-flex justify-content-between"><span>{{ t('dash.busy.backupDots') }}</span><span>{{ b.progress }}%</span></small>
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
                                <h5 class="modal-title">{{ t('dash.resetPwd.ctTitle') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="selectedLxc && selectedLxc.status && selectedLxc.status.status !== 'running'" class="alert alert-warning">
                                    {{ t('admin.modal.ctStoppedHint') }}
                                </div>
                                <div v-if="!selectedLxc || !selectedLxc.status || selectedLxc.status.status !== 'running'" class="alert alert-danger mb-3">
                                    {{ t('admin.modal.ctNotRunning') }}
                                </div>
                                <form @submit.prevent="resetLxcPassword">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.password.new') }} <span class="small text-muted">{{ (lxcPasswordForm.password || '').length }}/13</span></label>
                                        <div class="input-group">
                                            <input :type="adminLxcPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="lxcPasswordForm.password" maxlength="13" required autocomplete="new-password" :placeholder="t('register.pwdPh')" @input="lxcPasswordForm.password = lxcPasswordForm.password.slice(0,13)">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminLxcPwdShowPwd = !adminLxcPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <svg v-if="adminLxcPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('register.confirmPassword') }}</label>
                                        <div class="input-group">
                                            <input :type="adminLxcPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="lxcPasswordForm.confirmPassword" required autocomplete="new-password" :placeholder="t('register.confirmPlaceholder')">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminLxcPwdShowPwd = !adminLxcPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <svg v-if="adminLxcPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="primary" :disabled="!selectedLxc || !selectedLxc.status || selectedLxc.status.status !== 'running'">{{ t('login.resetTitle') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.resetIp.ctPfx') }} {{ selectedLxc?.ct_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-danger d-flex align-items-start gap-2 mb-3" style="background:rgba(220,53,69,0.15);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(220,53,69,0.3);">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    <div>
                                        <strong>{{ t('dash.danger') }}</strong><br>
                                        <span style="opacity:0.9">{{ t('dash.resetIp.ctHint') }}</span>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('dash.resetIp.mode') }}</label>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="lxcIpForm.ip_mode" value="static" id="lxcIpStatic">
                                            <label class="form-check-label" for="lxcIpStatic">{{ t('dash.resetIp.manual') }}</label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="lxcIpForm.ip_mode" value="dhcp" id="lxcIpDhcp">
                                            <label class="form-check-label" for="lxcIpDhcp">{{ t('dash.resetIp.dhcp') }}</label>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="lxcIpForm?.ip_mode === 'static'" class="mb-3">
                                    <label class="form-label">{{ t('dash.resetIp.cidr') }}</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" v-model="lxcIpForm.ip" placeholder="10.0.0.150/24">
                                        <pv-button type="button" @click="randomLxcIp" :title="t('dash.randomIp.title')" variant="outline">{{ t('dash.port.random') }}</pv-button>
                                    </div>
                                </div>
                                <div v-if="lxcIpError" class="alert alert-danger py-2">{{ lxcIpError }}</div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" data-bs-dismiss="modal">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="confirmResetLxcIp" :disabled="lxcIpLoading">

                                    <span v-if="lxcIpLoading" class="spinner-border spinner-border-sm me-1"></span>
                                    {{ t('common.save') }}
                                
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
                                <h5 class="modal-title">{{ t('dash.resetPwd.vmPfx') }} {{ adminVmPwdVm?.vm_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="adminVmPwdCiuser === false" class="alert alert-danger py-2 mb-0">{{ t('dash.resetPwd.noCloudInit') }}</div>
                                <div v-else>
                                    <p v-if="adminVmPwdVm">{{ t('dash.resetPwd.resource') }}{{ adminVmPwdVm.name || ('VM ' + adminVmPwdVm.vm_id) }}</p>
                                    <p v-if="adminVmPwdVm">{{ t('admin.modal.accountLabel') }}{{ adminVmPwdCiuser }}</p>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.password.new') }} <span class="small text-muted">{{ (adminVmPwdNewPassword || '').length }}/13</span></label>
                                        <div class="input-group">
                                            <input :type="adminVmPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="adminVmPwdNewPassword" maxlength="13" :placeholder="t('register.pwdPh')" @input="adminVmPwdNewPassword = adminVmPwdNewPassword.slice(0,13)">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminVmPwdShowPwd = !adminVmPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <svg v-if="adminVmPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('register.confirmPassword') }}</label>
                                        <div class="input-group">
                                            <input :type="adminVmPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="adminVmPwdConfirm" :placeholder="t('register.confirmPlaceholder')" autocomplete="new-password">
                                            <button class="btn btn-outline-secondary" type="button" @click="adminVmPwdShowPwd = !adminVmPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                                <svg v-if="adminVmPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div v-if="adminVmPwdError" class="alert alert-danger py-2">{{ adminVmPwdError }}</div>
                                </div>
                            </div>
                            <div class="modal-footer d-flex gap-2" v-if="adminVmPwdCiuser !== false">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="submitAdminVmPasswordReset" :disabled="!adminVmPwdNewPassword || adminVmPwdNewPassword.length < 8" variant="primary">{{ t('dash.resetPwd.confirm') }}</pv-button>
                            </div>
                            <div class="modal-footer" v-if="adminVmPwdCiuser === false">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.close') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.resetIp.vmPfx') }} {{ selectedVm?.vm_id }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning d-flex align-items-start gap-2 mb-3" style="background:rgba(255,193,7,0.15);backdrop-filter:blur(12px);border:1px solid rgba(255,193,7,0.3);">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    <div>
                                        <strong>{{ t('dash.note') }}</strong><br>
                                        <span style="opacity:0.9">{{ t('dash.resetIp.vmHint') }}</span>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('dash.resetIp.mode') }}</label>
                                    <div class="d-flex gap-3">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="vmIpForm.ip_mode" value="static" id="vmIpStatic">
                                            <label class="form-check-label" for="vmIpStatic">{{ t('dash.resetIp.manual') }}</label>
                                        </div>
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" v-model="vmIpForm.ip_mode" value="dhcp" id="vmIpDhcp">
                                            <label class="form-check-label" for="vmIpDhcp">{{ t('dash.resetIp.dhcp') }}</label>
                                        </div>
                                    </div>
                                </div>
                                <div v-if="vmIpForm?.ip_mode === 'static'" class="mb-3">
                                    <label class="form-label">{{ t('dash.resetIp.cidr') }}</label>
                                    <div class="input-group">
                                        <input type="text" class="form-control" v-model="vmIpForm.ip" placeholder="10.0.0.150/24">
                                        <pv-button type="button" @click="randomVmIp" :title="t('dash.randomIp.title')" variant="outline">{{ t('dash.port.random') }}</pv-button>
                                    </div>
                                </div>
                                <div v-if="vmIpError" class="alert alert-danger py-2">{{ vmIpError }}</div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="confirmResetVmIp" :disabled="vmIpLoading" variant="warning">
                                    <span v-if="vmIpLoading" class="spinner-border spinner-border-sm me-1"></span>
                                    {{ t('login.forceChange.submit') }}
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
                                <h5 class="modal-title">{{ t('admin.modal.editCtTitle') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="updateLxc" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('common.name') }}</label>
                                        <input type="text" class="form-control" v-model="editLxcForm.name">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.assignTo') }}</label>
                                        <select class="form-select" v-model="editLxcForm.user_id">
                                            <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ u.username }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.expiryTime') }}</label>
                                        <input type="datetime-local" class="form-control" v-model="editLxcForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.vm.renewPrice') }}</label>
                                        <input type="number" step="0.01" min="0" class="form-control" v-model="editLxcForm.renewal_price" :placeholder="t('common.ph.price')">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                                        <select class="form-select" v-model="editLxcForm.renewal_period">
                                            <option value="month">{{ t('dash.month30') }}</option>
                                            <option value="quarter">{{ t('dash.quarter90') }}</option>
                                            <option value="year">{{ t('dash.year365') }}</option>
                                        </select>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.macGroup') }}</label>
                                        <select class="form-select" v-model="editLxcForm.mac_group_id">
                                            <option value="">{{ t('dash.noGroup') }}</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" formnovalidate>{{ t('common.save') }}</pv-button>
                                        <pv-button type="button" @click="removeLxc" :disabled="editLxcForm.status && editLxcForm.status.status === 'running'"    :title="editLxcForm.status && editLxcForm.status.status === 'running' ? t('dash.busy.powerOffFirst') : t('dash.vm.removeUnassignOnly')" variant="outline-warning">{{ t('dash.detachOnly') }}</pv-button>
                                        <pv-button type="button" @click="bsModalShow('destroyLxcModal')" :disabled="editLxcForm.status && editLxcForm.status.status === 'running'"    :title="editLxcForm.status && editLxcForm.status.status === 'running' ? t('dash.busy.powerOffFirst') : t('dash.lxc.destroyDelPve')" variant="outline-danger">{{ t('admin.modal.destroyPve') }}</pv-button>
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
                                <h5 class="modal-title">{{ t('dash.snap.managePfx') }} {{ lxcSnapshotVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div v-if="lxcSnapshotLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status">
                                        <span class="visually-hidden">{{ t('common.loading') }}</span>
                                    </div>
                                    <p class="mt-2 text-muted small">{{ t('dash.snap.loadingList') }}</p>
                                </div>
                                <div v-else>
                                    <div class="card mb-3">
                                        <div class="card-header"><h6 class="mb-0">{{ t('dash.snap.create') }}</h6></div>
                                        <div class="card-body">
                                            <div class="mb-2">
                                                <textarea class="form-control form-control-sm" v-model="lxcSnapshotForm.description" rows="2" :placeholder="t('common.ph.notesOptional')"></textarea>
                                            </div>
                                            <div class="d-flex justify-content-end align-items-center">
                                                <pv-button @click="createLxcSnapshot(lxcSnapshotVmId)" :disabled="lxcSnapshotCreating" size="sm">

                                                    <span v-if="lxcSnapshotCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                    {{ t('dash.snap.create') }}

</pv-button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="card mb-3">
                                        <div class="card-header d-flex justify-content-between align-items-center">
                                            <div class="d-flex align-items-center gap-2">
                                                <input type="checkbox" class="form-check-input m-0" :checked="isAllLxcSnapshotsSelected" @change="toggleSelectAllLxcSnapshots" :disabled="lxcSnapshots.length === 0" style="cursor:pointer">
                                                <h6 class="mb-0">{{ t('dash.snap.existing') }}</h6>
                                            </div>
                                            <div class="d-flex align-items-center gap-2">
                                                <pv-button v-if="isAnyLxcSnapshotSelected" @click="batchDeleteLxcSnapshots(lxcSnapshotVmId)" :disabled="lxcSnapshotDeleting" variant="outline-danger" size="sm">

                                                    <span v-if="lxcSnapshotDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                    {{ t('dash.batchDeletePrefix') }}{{ lxcSnapshotSelected.size }})
                                                
</pv-button>
                                                <span class="badge bg-secondary">{{ lxcSnapshots.length }} {{ t('admin.geSuffix') }}</span>
                                            </div>
                                        </div>
                                        <div class="card-body p-0">
                                            <div v-if="lxcSnapshots.length === 0" class="text-center text-muted py-4 small">{{ t('dash.snap.empty') }}</div>
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
                                                        <pv-button @click="rollbackLxcSnapshot(lxcSnapshotVmId, snap.name)" :title="t('dash.snap.rollbackTitle')" variant="outline" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                        
</pv-button>
                                                        <pv-button @click="deleteLxcSnapshot(lxcSnapshotVmId, snap.name)" :title="t('dash.snap.deleteTitle')" variant="outline-danger" size="sm">

                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                        
</pv-button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="card">
                                        <div class="card-header"><h6 class="mb-0">{{ t('dash.snap.limitInfo') }}</h6></div>
                                        <div class="card-body">
                                            <div class="row text-center g-2">
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.currentCount') }}</div>
                                                        <div class="fw-bold" :class="lxcSnapshotLimits.current >= lxcSnapshotLimits.max ? 'text-danger' : ''" style="color: var(--text-primary);">{{ lxcSnapshotLimits.current }} / {{ lxcSnapshotLimits.max }}</div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.todayCreate') }}</div>
                                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_creates >= lxcSnapshotLimits.max_creates ? 'text-danger' : ''" style="color: var(--text-primary);">{{ lxcSnapshotLimits.today_creates }} / {{ lxcSnapshotLimits.max_creates }}</div>
                                                    </div>
                                                </div>
                                                <div class="col-4">
                                                    <div class="border rounded p-2">
                                                        <div class="small" style="color: var(--text-secondary); opacity: 0.75;">{{ t('dash.snap.todayRestore') }}</div>
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
                                <h5 class="modal-title">{{ t('dash.backup.managePfx') }} {{ lxcBackupVmName }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="card mb-3">
                                    <div class="card-header"><h6 class="mb-0">{{ t('dash.backup.create') }}</h6></div>
                                    <div class="card-body">
                                        <div class="mb-2">
                                            <label class="form-label small">{{ t('admin.disk.storageLocation') }}</label>
                                            <select class="form-select form-select-sm" v-model="lxcBackupForm.storage">
                                                <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                        <div class="mb-2">
                                            <textarea class="form-control form-control-sm" v-model="lxcBackupForm.notes" rows="2" maxlength="50" :placeholder="t('common.ph.notesOptional')" style="resize:none"></textarea>
                                            <small :style="'display:block;text-align:right;margin-top:2px;color:' + (lxcBackupForm.notes.length >= 50 ? '#ff4444' : 'var(--text-muted)')">{{ lxcBackupForm.notes.length || 0 }}/50</small>
                                        </div>
                                        <div class="d-flex justify-content-between align-items-center">
                                            <small class="text-muted">{{ t('dash.backup.stopMode') }}</small>
                                            <pv-button @click="createLxcBackup(lxcBackupVmId)" :disabled="lxcBackupCreating" size="sm">

                                                <span v-if="lxcBackupCreating" class="spinner-border spinner-border-sm me-1"></span>
                                                {{ t('dash.backup.now') }}
                                            
</pv-button>
                                        </div>
                                    </div>
                                </div>
                                <div class="card">
                                    <div class="card-header d-flex justify-content-between align-items-center">
                                        <div class="d-flex align-items-center gap-2">
                                            <input type="checkbox" class="form-check-input m-0" :checked="isAllLxcBackupsSelected" @change="toggleSelectAllLxcBackups" :disabled="lxcBackups.length === 0" style="cursor:pointer">
                                            <h6 class="mb-0">{{ t('dash.backup.history') }}</h6>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            <pv-button v-if="isAnyLxcBackupSelected" @click="batchDeleteLxcBackups(lxcBackupVmId)" :disabled="lxcBackupDeleting" variant="outline-danger" size="sm">

                                                <span v-if="lxcBackupDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                                {{ t('dash.batchDeletePrefix') }}{{ lxcBackupSelected.size }})
                                            
</pv-button>
                                            <span class="badge bg-secondary">{{ lxcBackups.length }} {{ t('admin.geSuffix') }}</span>
                                        </div>
                                    </div>
                                    <div class="card-body p-0">
                                        <div v-if="lxcBackups.length === 0" class="text-center text-muted py-4 small">{{ t('dash.backup.empty') }}</div>
                                        <div v-else class="table-container" style="padding:12px;"><div class="table-responsive" style="max-height:360px;overflow-y:auto;">
                                            <table class="table table-hover mb-0 table-sm table-align-center">
                                                <thead style="position:sticky;top:0;">
                                                    <tr>
                                                        <th class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="isAllLxcBackupsSelected" @change="toggleSelectAllLxcBackups" :disabled="lxcBackups.length === 0" style="cursor:pointer"></th>
                                                        <th style="width:40px;">#</th>
                                                        <th>{{ t('dash.backup.time') }}</th>
                                                        <th>{{ t('common.size') }}</th>
                                                        <th>{{ t('dash.order.note') }}</th>
                                                        <th style="width:100px;">{{ t('common.status') }}</th>
                                                        <th>{{ t('admin.templates.storage') }}</th>
                                                        <th style="width:60px;">{{ t('common.actions') }}</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr v-for="(b, idx) in lxcBackups" :key="b.id" :style="lxcBackupSelected.has(b.id) ? 'background:color-mix(in srgb, var(--color-primary) 8%, transparent)' : ''">
                                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="lxcBackupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleLxcBackupSelect(b.id)" style="cursor:pointer"></td>
                                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                                        <td class="small text-muted" :title="b.notes">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                                        <td>
                                                            <span v-if="b.status === 'completed'" class="badge bg-success">{{ t('dash.statusDone') }}</span>
                                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">{{ t('admin.osswitchlog.status.pending') }}</span>
                                                            <span v-else class="badge bg-danger" :title="b.error_msg">{{ t('admin.osswitchlog.status.failed') }}</span>
                                                        </td>
                                                        <td class="small">{{ b.storage }}</td>
                                                        <td>
                                                            <div class="d-flex gap-1">
                                                                <pv-button v-if="b.status === 'completed'" @click="restoreLxcBackup(b)" :title="t('dash.backup.restoreTitle')" variant="outline" size="sm">

                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                                                                
</pv-button>
                                                                <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteLxcBackup(b.id, lxcBackupVmId)" :title="t('dash.backup.deleteTitle')" variant="outline-danger" size="sm">

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
                                <h5 class="text-danger mb-3">{{ t('admin.modal.destroyCtTitle') }}</h5>
                                <p class="text-muted small mb-3">
                                    {{ t('admin.modal.thisWill') }}<strong class="text-danger">{{ t('admin.modal.permanentlyDestroy') }}</strong>{{ t('nav.containers') }} <strong>{{ editLxcForm.name || 'CT ' + editLxcForm.ct_id }}</strong> {{ t('admin.modal.andAllData') }}<br>
                                    {{ t('admin.modal.inclDisksSnaps') }}<br>
                                    <span class="text-danger">{{ t('admin.modal.irreversible') }}</span>
                                </p>
                                <div class="mb-3">
                                    <label class="form-label small text-muted">{{ t('admin.modal.typeYesPrefix') }} <code>yes</code> {{ t('admin.modal.destroyConfirmBtn') }}</label>
                                    <input type="text" class="form-control form-control-sm text-center" v-model="destroyLxcConfirmText" :placeholder="t('admin.modal.typeYes')">
                                </div>
                                <div class="d-flex gap-2 justify-content-center">
                                    <pv-button type="button" :disabled="destroyLxcConfirmText !== 'yes'" @click="confirmDestroyLxc" variant="danger">{{ t('admin.modal.destroyConfirmBtn') }}</pv-button>
                                    <pv-button type="button" @click="bsModalHide('destroyLxcModal'); destroyLxcConfirmText = ''" variant="outline">{{ t('common.cancel') }}</pv-button>
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
                                <h5 class="text-danger mb-3">{{ t('admin.modal.destroyVmTitle') }}</h5>
                                <p class="text-muted small mb-3">
                                    {{ t('admin.modal.thisWill') }}<strong class="text-danger">{{ t('admin.modal.permanentlyDestroy') }}</strong>{{ t('nav.vms') }} <strong>{{ destroyVmTarget ? (destroyVmTarget.name || 'VM ' + destroyVmTarget.vm_id) : '' }}</strong> {{ t('admin.modal.andAllData') }}<br>
                                    {{ t('admin.modal.inclDisksSnaps') }}<br>
                                    <span class="text-danger">{{ t('admin.modal.irreversible') }}</span>
                                </p>
                                <div class="mb-3">
                                    <label class="form-label small text-muted">{{ t('admin.modal.typeYesPrefix') }} <code>yes</code> {{ t('admin.modal.destroyConfirmBtn') }}</label>
                                    <input type="text" class="form-control form-control-sm text-center" v-model="destroyVmConfirmText" :placeholder="t('admin.modal.typeYes')">
                                </div>
                                <div class="d-flex gap-2 justify-content-center">
                                    <pv-button type="button" :disabled="destroyVmConfirmText !== 'yes'" @click="confirmDestroyVm" variant="danger">{{ t('admin.modal.destroyConfirmBtn') }}</pv-button>
                                    <pv-button type="button" @click="bsModalHide('destroyVmModal'); destroyVmConfirmText = ''" variant="outline">{{ t('common.cancel') }}</pv-button>
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
                                <h5 class="modal-title">{{ templatePage.vmTemplateForm.value.id ? t('admin.tplpage.editVmTpl') : (templatePage.vmTplDup.value ? t('admin.tplpage.copyVmTpl') : t('admin.tplpage.newVmTpl')) }}</h5>
                                <pv-button type="button" variant="close" @click="bsModalHide('vmTemplateModal')"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.tplName') }}</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.ostemplate.pveTemplateVm') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.template_vmid"
                                                :disabled="!templatePage.vmTemplateForm.value.pve_node_id">
                                            <option value="">{{ templatePage.vmTemplateForm.value.pve_node_id ? t('admin.ostemplate.selectVmPlaceholder') : t('admin.ostemplate.vmNodeFirst') }}</option>
                                            <option v-for="v in templatePage.pveTemplateVms.value" :key="v.vmid" :value="v.vmid">{{ v.name || ('VM ' + v.vmid) }} ({{ v.vmid }})</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.sysDiskGb') }}</label><input class="form-control" type="number" v-model.number="templatePage.vmTemplateForm.value.disk_size" min="5" max="500"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.hw.cpuCores') }}</label><input class="form-control" type="number" v-model="templatePage.vmTemplateForm.value.cores"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.hw.memMb') }}</label><input class="form-control" type="number" v-model="templatePage.vmTemplateForm.value.memory"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.ostemplate.targetStorage') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.target_storage">
                                            <option value="">{{ t('admin.modal.selectStoragePool') }}</option>
                                            <option v-for="s in templatePage.allStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }}{{ s.maxdisk ? ' (' + (s.maxdisk/1073741824).toFixed(0) + 'GB)' : '' }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('admin.lxc.bridge') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.network_bridge"
                                                :disabled="!templatePage.vmTemplateForm.value.pve_node_id || !templatePage.vmTemplateBridges.value.length">
                                            <option value="">{{ t('admin.lxc.bridgePh') }}</option>
                                            <option v-for="b in templatePage.vmTemplateBridges.value" :key="b" :value="b">{{ b }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.cloneMode') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.clone_mode">
                                            <option value="full">{{ t('admin.modal.fullClone') }}</option>
                                            <option value="linked">{{ t('admin.modal.linkClone') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.cpuAffinity') }}</label>
                                        <input class="form-control" v-model="templatePage.vmTemplateForm.value.cpu_affinity" :placeholder="t('admin.modal.cpuAffinityPh')">
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.nicModel') }}</label><input class="form-control" v-model="templatePage.vmTemplateForm.value.network_model"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('common.status') }}</label><select class="form-select" v-model="templatePage.vmTemplateForm.value.status"><option value="active">{{ t('admin.common.enabled') }}</option><option value="inactive">{{ t('admin.common.disabled') }}</option></select></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('pkg.node') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.pve_node_id">
                                            <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                            <option v-for="n in templatePage.pveNodeOptions.value" :key="n.id" :value="n.id">{{ n.name }}{{ n.zone_name ? ' (' + n.zone_name + ')' : '' }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('dash.macGroup') }}</label>
                                        <select class="form-select" v-model="templatePage.vmTemplateForm.value.mac_group_id">
                                            <option value="">{{ t('dash.noGroup') }}</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">{{ t('common.description') }}</label><textarea class="form-control" rows="2" v-model="templatePage.vmTemplateForm.value.description"></textarea></div>
                                </div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button @click="bsModalHide('vmTemplateModal')">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="templatePage.saveVmTemplate()">{{ t('common.save') }}</pv-button>
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
                                <h5 class="modal-title">{{ templatePage.lxcTemplateForm.value.id ? t('admin.tplpage.editLxcTpl') : (templatePage.lxcTplDup.value ? t('admin.tplpage.copyLxcTpl') : t('admin.tplpage.newLxcTpl')) }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="bsModalHide('lxcTemplateModal')"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.tplName') }}</label><input class="form-control" v-model="templatePage.lxcTemplateForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.tplStorage') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.storage">
                                            <option value="">{{ t('admin.modal.selectStoragePool') }}</option>
                                            <option v-for="s in templatePage.lxcTplStorages.value" :key="s.id" :value="s.id">{{ s.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.ctStorage') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.rootfs_storage">
                                            <option value="">{{ t('admin.modal.selectCtStorage') }}</option>
                                            <option v-for="s in templatePage.lxcStorages.value" :key="s.id" :value="s.id">{{ s.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">{{ t('admin.modal.tplPath') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.ostemplate">
                                            <option value="">{{ t('admin.modal.selectPoolFirst') }}</option>
                                            <option v-for="t in templatePage.lxcOstemplates.value" :key="t.volid" :value="t.volid">{{ t.volid }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.cpuCores') }}</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.memMb') }}</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.memory"></div>
                                    <div class="col-md-3"><label class="form-label">Swap (MB)</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.swap"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.diskGb') }}</label><input class="form-control" type="number" v-model="templatePage.lxcTemplateForm.value.disk_size"></div>
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('admin.templates.networkBridge') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.network_bridge"
                                                :disabled="!templatePage.lxcTemplateForm.value.pve_node_id || !templatePage.lxcTemplateBridges.value.length">
                                            <option value="">{{ t('admin.lxc.bridgePh') }}</option>
                                            <option v-for="b in templatePage.lxcTemplateBridges.value" :key="b" :value="b">{{ b }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.netMode') }}</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.network_mode"><option value="dhcp">DHCP</option><option value="static">{{ t('admin.port.static') }}</option></select></div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.network_mode === 'static'">
                                        <label class="form-label">{{ t('admin.modal.ipv4Addr') }}</label>
                                        <input class="form-control" v-model="templatePage.lxcTemplateForm.value.ip4_addr" :placeholder="t('admin.lxc.ipv4Ph')">
                                    </div>
                                    <div class="col-md-6">
                                        <div class="form-check mt-3">
                                            <input class="form-check-input" type="checkbox" v-model="templatePage.lxcTemplateForm.value.ipv6_enabled" :true-value="1" :false-value="0" id="lxcTemplateIpv6">
                                            <label class="form-check-label" for="lxcTemplateIpv6">{{ t('admin.modal.enableIpv6') }}</label>
                                        </div>
                                    </div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.ipv6_enabled">
                                        <label class="form-label">{{ t('admin.modal.ipv6Mode') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.ip6_mode">
                                            <option value="dhcp">DHCP</option>
                                            <option value="static">{{ t('admin.port.static') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6" v-if="templatePage.lxcTemplateForm.value.ipv6_enabled && templatePage.lxcTemplateForm.value.ip6_mode === 'static'">
                                        <label class="form-label">{{ t('admin.modal.ipv6Addr') }}</label>
                                        <input class="form-control" v-model="templatePage.lxcTemplateForm.value.ip6_addr" :placeholder="t('admin.lxc.ipv6Ph')">
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.modal.unprivileged') }}</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.unprivileged"><option :value="1">{{ t('common.yes') }}</option><option :value="0">{{ t('common.no') }}</option></select></div>
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('admin.lxc.features') }}</label>
                                        <div class="lxc-feature-dropdown" :class="{ open: templatePage.lxcFeatureOpen.value }">
                                            <div class="custom-select-trigger" @click="templatePage.toggleLxcFeatureDropdown()">
                                                <span v-if="templatePage.lxcFeatureText && templatePage.lxcFeatureText.value">{{ templatePage.lxcFeatureText.value }}</span>
                                                <span v-else class="custom-select-placeholder">{{ t('admin.lxc.featuresPh') }}</span>
                                            </div>
                                            <div class="custom-select-dropdown lxc-feature-menu">
                                                <div v-for="opt in (templatePage.lxcFeatureOptions && templatePage.lxcFeatureOptions.value) || []" :key="opt.name"
                                                     class="option" :class="{ selected: templatePage.lxcFeaturesSet && templatePage.lxcFeaturesSet.value.has(opt.name) }"
                                                     :title="t(opt.descKey)" @click="templatePage.toggleLxcFeature(opt.name)">
                                                    <span>{{ opt.name }}</span>
                                                    <span class="lxc-feature-desc">{{ t(opt.descKey) }}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('common.status') }}</label><select class="form-select" v-model="templatePage.lxcTemplateForm.value.status"><option value="active">{{ t('admin.common.enabled') }}</option><option value="inactive">{{ t('admin.common.disabled') }}</option></select></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('pkg.node') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.pve_node_id">
                                            <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                            <option v-for="n in templatePage.pveNodeOptions.value" :key="n.id" :value="n.id">{{ n.name }}{{ n.zone_name ? ' (' + n.zone_name + ')' : '' }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('dash.macGroup') }}</label>
                                        <select class="form-select" v-model="templatePage.lxcTemplateForm.value.mac_group_id">
                                            <option value="">{{ t('dash.noGroup') }}</option>
                                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                        </select>
                                    </div>
                                    <div class="col-12"><label class="form-label">{{ t('common.description') }}</label><textarea class="form-control" rows="2" v-model="templatePage.lxcTemplateForm.value.description"></textarea></div>
                                </div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button @click="bsModalHide('lxcTemplateModal')" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="templatePage.saveLxcTemplate()" variant="primary">{{ t('common.save') }}</pv-button>
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
                                <h5 class="modal-title">{{ isEditingForward ? t('dash.port.editTitle') : t('dash.port.addTitle') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="text-muted small mb-3" v-if="userRole !== 'admin'">
                                    {{ t('admin.cdk.used') }} {{ userForwardCount }} / {{ maxForwardPerUser }} {{ t('common.countUnit') }}
                                </div>
                                <div class="mb-3" v-if="userRole === 'admin'">
                                    <label class="form-label">{{ t('common.type') }}</label>
                                    <div>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="vm" @change="onForwardTypeChange"> VM</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="lxc" @change="onForwardTypeChange"> LXC</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.type" value="general" @change="onForwardTypeChange"> {{ t('admin.port.generic') }}</label>
                                    </div>
                                </div>
                                <div class="mb-3" v-if="forwardForm.type !== 'general'">
                                    <label class="form-label">{{ t('admin.port.selectDevice') }}</label>
                                    <select class="form-select" v-model="forwardForm.vm_id" v-if="forwardForm.type === 'vm'" @change="selectDevice">
                                        <option :value="null">{{ t('admin.port.selectVmOpt') }}</option>
                                        <option v-for="d in availableDevices" :key="d.device_id" :value="d.device_id">
                                            {{ d.name }} - {{ d.ip || t('admin.port.ipUnknown') }}
                                        </option>
                                    </select>
                                    <select class="form-select" v-model="forwardForm.ct_id" v-else @change="selectDevice">
                                        <option :value="null">{{ t('admin.port.selectCtOpt') }}</option>
                                        <option v-for="d in availableDevices" :key="d.device_id" :value="d.device_id">
                                            {{ d.name }} - {{ d.ip || t('admin.port.ipUnknown') }}
                                        </option>
                                    </select>
                                </div>
                                <div class="mb-3" v-if="forwardForm.type === 'general'">
                                    <div class="alert alert-info small">{{ t('admin.port.genericHint') }}</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('dash.port.targetIp') }}</label>
                                    <input type="text" class="form-control" v-model="forwardForm.ip" :disabled="forwardForm.type !== 'general'"   :placeholder="forwardForm.type === 'general' ? t('dash.port.inputTargetIp') : t('dash.port.autoFillAfterPick')">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('dash.port.ruleName') }}</label>
                                    <input type="text" class="form-control" v-model="forwardForm.name" :placeholder="t('dash.port.ruleNamePh')">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('dash.port.protocol') }}</label>
                                    <div>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="tcp"> TCP</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="udp"> UDP</label>
                                        <label class="me-3"><input type="radio" v-model="forwardForm.protocol" value="tcp+udp"> TCP+UDP</label>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('dash.port.internalPort') }}</label>
                                        <input type="number" class="form-control" v-model.number="forwardForm.internal_port" min="1" max="65535">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('dash.port.externalPort') }}</label>
                                        <div class="input-group">
                                            <input type="number" class="form-control" :class="{ 'is-invalid': checkResult === false }" v-model.number="forwardForm.external_port" min="1" max="65535">
                                            <pv-button type="button" @click="randomPort" variant="outline">{{ t('dash.port.random') }}</pv-button>
                                            <pv-button type="button" @click="checkPortConflict" variant="outline">{{ t('admin.port.check') }}</pv-button>
                                        </div>
                                        <small class="text-muted">{{ t('admin.port.availableRange') }} <span v-if="userRole === 'admin'">{{ t('admin.port.fullRange') }}</span><span v-else>{{ networkConfig.port_range_start }}-{{ networkConfig.port_range_end }}</span></small>
                                        <div v-if="checkResult === true" class="text-success small">{{ t('admin.port.free') }}</div>
                                        <div v-else-if="checkResult === false" class="text-danger small">{{ t('admin.port.taken') }}</div>
                                    </div>
                                </div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="submitForward" :disabled="checkResult === false" variant="primary">{{ t('common.submit') }}</pv-button>
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
                                <h5 class="modal-title">{{ deviceModal.device.name || (deviceModal.device.type === 'vm' ? 'VM ' + deviceModal.device.deviceId : 'CT ' + deviceModal.device.deviceId) }} {{ t('dash.port.mgmtSuffix') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body" style="min-height:150px;">

                                <!-- 规则列表 -->
                                <template v-if="!showDeviceForm">
                                    <div class="d-flex justify-content-between align-items-center mb-3">
                                        <div><span class="text-muted small">{{ t('admin.port.totalPrefix') }} {{ deviceRules.length }} {{ t('admin.port.ruleCountSuffix') }}</span><span class="text-muted small ms-3">{{ t('admin.port.remainingPrefix') }} {{ forwardConfig.remaining }} {{ t('common.countUnit') }}</span></div>
                                        <pv-button @click="openDeviceFormModal" size="sm">{{ t('dash.port.add') }}</pv-button>
                                    </div>
                                    <div v-if="deviceRules.length === 0" class="text-center py-4 text-muted">{{ t('dash.port.empty') }}</div>
                                    <div v-else class="table-container" style="padding:12px;"><div class="table-responsive mb-0">
                                        <table class="table table-hover mb-0 table-align-center">
                                            <thead><tr>
                                                <th>{{ t('common.name') }}</th><th>{{ t('dash.port.targetIp') }}</th><th>{{ t('dash.port.internalPort') }}</th><th>{{ t('dash.port.externalPort') }}</th><th>{{ t('dash.port.protocol') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th>
                                            </tr></thead>
                                            <tbody>
                                                <tr v-for="rule in deviceRules" :key="rule.id" :class="{ 'text-muted': rule.sync_status === 'orphan' }">
                                                    <td>{{ rule.name || '-' }}</td>
                                                    <td>{{ rule.ip }}</td>
                                                    <td>{{ rule.internal_port }}</td>
                                                    <td>{{ rule.external_port }}</td>
                                                    <td>{{ (rule.protocol || '').toUpperCase() }}</td>
                                                    <td><span :class="rule.enabled ? 'text-success' : 'text-muted'">{{ rule.enabled ? t('admin.common.enabled') : t('admin.disk.disabled') }}</span></td>
                                                    <td>
                                                        <div class="d-flex gap-1">
                                                            <pv-button @click="openDeviceEditModal(rule)" variant="outline" size="sm">{{ t('common.edit') }}</pv-button>
                                                            <pv-button @click="deleteDeviceRule(rule)" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>
                                </template>

                                <!-- 添加/编辑表单 -->
                                <template v-else>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.port.ruleName') }}</label>
                                        <input type="text" class="form-control" v-model="deviceForm.name" :placeholder="t('dash.port.ruleNamePh')">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.port.targetIp') }}</label>
                                        <input type="text" class="form-control" v-model="deviceForm.ip" :placeholder="t('dash.port.autoIp')" readonly>
                                        <small class="text-muted">{{ t('dash.port.autoIpHint') }}</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('dash.port.protocol') }}</label>
                                        <div>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp"> TCP</label>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="udp"> UDP</label>
                                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp+udp"> TCP+UDP</label>
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('dash.port.internalPort') }}</label>
                                            <input type="number" class="form-control" v-model.number="deviceForm.internal_port" min="1" max="65535">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('dash.port.externalPort') }}</label>
                                            <div class="input-group">
                                                <input type="number" class="form-control" :class="{ 'is-invalid': deviceCheckResult === false }" v-model.number="deviceForm.external_port" min="1" max="65535">
                                                <pv-button type="button" @click="randomDevicePort" variant="outline">{{ t('dash.port.random') }}</pv-button>
                                            </div>
                                            <small class="text-muted">{{ t('admin.port.availableRange') }} {{ networkConfig.port_range_start }}-{{ networkConfig.port_range_end }}</small>
                                        </div>
                                    </div>
                                    <div class="d-flex justify-content-end gap-2">
                                        <pv-button type="button" @click="cancelDeviceForm" variant="outline">{{ t('common.cancel') }}</pv-button>
                                        <pv-button type="button" @click="submitDeviceRule" variant="primary">{{ editingDeviceRuleId ? t('common.save') : t('common.add') }}</pv-button>
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
                                            <h2 class="modal-title">{{ t('dash.confirm.title') }}</h2>
                                            <button class="modal-close" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">✕</button>
                                        </div>
                                        <div class="modal-body" style="padding:24px 28px;text-align:center">
                                            <p style="font-size:15px;color:var(--text-primary);line-height:1.6;margin:0 0 20px">{{ confirmState?.vmId !== null ? confirmActionText : confirmLxcActionText }}</p>
                                            <div style="display:flex;gap:10px;justify-content:center">
                                                <pv-button variant="danger" size="lg" @click="confirmState?.vmId !== null ? confirmAction(userVms.find(function(v){return v.id===confirmState.vmId})||userVms[0]) : confirmLxcAction(userLxcContainers.find(function(c){return c.ct_id===lxcConfirmState.ctId})||userLxcContainers[0])">{{ t('dash.confirm.execute') }}</pv-button>
                                                <pv-button variant="secondary" size="lg" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">{{ t('common.cancel') }}</pv-button>
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
                                            <h2 class="modal-title">{{ detailVm._isLxc ? (detailVm.name || ('CT ' + detailVm.vm_id)) : (detailVm.name || ('VM ' + detailVm.vm_id)) }} {{ t('common.detail') }}</h2>
                                            <button class="modal-close" @click="closeVmDetail()">✕</button>
                                        </div>
                                        <div class="modal-body">
                                            <!-- 基本信息区域 -->
                                            <div class="info-card">
                                                <div class="info-grid">
                                                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? t('admin.detail.ctId') : t('admin.detail.vmId') }}</span><span class="info-value">{{ detailVm.vm_id || '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ t('dash.vm.privateIp') }}</span><span class="info-value">{{ detailVm.ip || '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ t('dash.detail.hardware') }}</span><span class="info-value">{{ detailVmConfigStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ t('dash.vm.renewPrice') }}</span><span class="info-value">{{ detailVm.renewal_price ? detailVm.renewal_price + t('common.perSlash') + (detailVm.renewal_period === 'year' ? t('dash.period.year') : detailVm.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? t('dash.lxc.image') : t('admin.detail.osName') }}</span><span class="info-value">{{ detailVmOsStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ t('dash.detail.status') }}</span><span class="info-value">{{ detailVmStatusStr }}</span></div>
                                                    <div class="info-item"><span class="info-label">{{ t('dash.detail.uptime') }}</span><span class="info-value">{{ detailVmUptimeStr }}</span></div>
                                                </div>
                                            </div>
                                            <!-- 监控图表区域 -->
                                            <h4 style="font-size:16px;color:var(--text-secondary);margin-bottom:16px;">{{ t('dash.detail.monitor') }}</h4>
                                            <div class="chart-grid">
                                                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.cpu') }}</div><canvas id="detailCpuChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.mem') }}</div><canvas id="detailMemChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.net') }}</div><canvas id="detailNetChart"></canvas></div>
                                                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.diskIo') }}</div><canvas id="detailDiskChart"></canvas></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                </Teleport>
                            
`);

// 共享弹窗模板（单一来源：shared-dialog-templates.js，规范第七节）
if (window.__sharedDialogTemplates) {
  window.__adminTemplateParts.push(window.__sharedDialogTemplates);
}

// 自定义 Prompt 弹窗（带输入框）——admin 专属：promptOk/promptCancel 仅在 admin 端注册，
// 不能放入共享模板（dashboard/user-center 渲染时 withKeys(undefined) 会抛错）
(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<Teleport to="body">
<div class="modal fade" id="customPromptModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-body py-4 px-4">
                <div class="custom-alert-icon mb-3 text-center">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                    </svg>
                </div>
                <p class="custom-alert-msg mb-3 text-center" style="color:var(--text-primary);font-size:14px;line-height:1.6;white-space:pre-line;">{{ customPromptMessage }}</p>
                <input type="text" class="form-control text-center" id="customPromptInput" v-model="customPromptValue" @keydown.enter="promptOk" autocomplete="off">
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                <pv-button type="button" variant="outline" @click="promptCancel">{{ t('common.cancel') }}</pv-button>
                <pv-button type="button" variant="primary" @click="promptOk">{{ t('common.ok') }}</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>
`);
})();
})();
