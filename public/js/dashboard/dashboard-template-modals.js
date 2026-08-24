(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
  window.__dashboardTemplateParts.push(`
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
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.assignTo') }}</label>
                        <select class="form-select" v-model="editVmForm.user_id">
                            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                        </select>
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.expiry') }}</label>
                        <input type="datetime-local" class="form-control" v-model="editVmForm.expiration_date" step="1">
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.renewPrice') }}</label>
                        <input type="number" step="0.01" min="0" class="form-control" v-model="editVmForm.renewal_price" :placeholder="t('common.ph.price')">
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                        <select class="form-select" v-model="editVmForm.renewal_period">
                            <option value="month">{{ t('dash.month30') }}</option>
                            <option value="quarter">{{ t('dash.quarter90') }}</option>
                            <option value="year">{{ t('dash.year365') }}</option>
                        </select>
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.macGroup') }}</label>
                        <select class="form-select" v-model="editVmForm.mac_group_id">
                            <option value="">{{ t('dash.noGroup') }}</option>
                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + ' ' + g.id }}</option>
                        </select>
                    </div>
                    <div class="d-flex gap-2">
                        <pv-button type="submit" variant="primary" formnovalidate>{{ t('common.save') }}</pv-button>
                        <pv-button v-if="user && user.role === 'admin'" type="button" @click="removeVm" variant="outline-warning">{{ t('dash.detachOnly') }}</pv-button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
</Teleport>

<Teleport to="body">
<div class="modal fade" id="snapshotModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.snap.manageVm', snapshotVmName) }}</h5>
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
                                <span class="badge bg-secondary">{{ tFormat('dash.count.snapshot', snapshots.length) }}</span>
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
                                        <pv-button @click="rollbackSnapshot(snapshotVmId, snap.name)" :title="t('dash.snap.rollbackTitle')" variant="outline" size="sm">{{ t('dash.snap.rollback') }}</pv-button>
                                        <pv-button @click="deleteSnapshot(snapshotVmId, snap.name)" :title="t('dash.snap.deleteTitle')" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
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
                                        <div class="small text-muted">{{ t('dash.snap.currentCount') }}</div>
                                        <div class="fw-bold" :class="snapshotLimits.current >= snapshotLimits.max ? 'text-danger' : ''">{{ snapshotLimits.current }} / {{ snapshotLimits.max }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">{{ t('dash.snap.todayCreate') }}</div>
                                        <div class="fw-bold" :class="snapshotLimits.today_creates >= snapshotLimits.max_creates ? 'text-danger' : ''">{{ snapshotLimits.today_creates }} / {{ snapshotLimits.max_creates }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">{{ t('dash.snap.todayRestore') }}</div>
                                        <div class="fw-bold" :class="snapshotLimits.today_rollbacks >= snapshotLimits.max_rollbacks ? 'text-danger' : ''">{{ snapshotLimits.today_rollbacks }} / {{ snapshotLimits.max_rollbacks }}</div>
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

<Teleport to="body">
<div class="modal fade" id="backupModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.backup.manageVm', backupVmName) }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <div class="card mb-3">
                    <div class="card-header">
                        <h6 class="mb-0">{{ t('dash.backup.limitInfo') }}</h6>
                    </div>
                    <div class="card-body">
                        <div v-if="backupLimits.current >= backupLimits.max_per_vm || backupLimits.today_creates >= backupLimits.daily_limit" class="alert alert-warning py-2 mb-2 small">
                            <span v-if="backupLimits.current >= backupLimits.max_per_vm">{{ t('dash.backup.maxReached') }}</span>
                            <span v-else>{{ t('dash.backup.dailyLimit') }}</span>
                        </div>
                        <div class="row text-center g-2">
                            <div class="col-6">
                                <div class="border rounded p-2">
                                    <div class="small text-muted">{{ t('dash.backup.currentCount') }}</div>
                                    <div class="fw-bold" :class="backupLimits.current >= backupLimits.max_per_vm ? 'text-danger' : ''">{{ backupLimits.current }} / {{ backupLimits.max_per_vm }}</div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="border rounded p-2">
                                    <div class="small text-muted">{{ t('dash.snap.todayCreate') }}</div>
                                    <div class="fw-bold" :class="backupLimits.today_creates >= backupLimits.daily_limit ? 'text-danger' : ''">{{ backupLimits.today_creates }} / {{ backupLimits.daily_limit }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-header"><h6 class="mb-0">{{ t('dash.backup.create') }}</h6></div>
                    <div class="card-body">
                        <div class="mb-2">
                            <textarea class="form-control form-control-sm" v-model="backupForm.notes" rows="2" maxlength="50" :placeholder="t('common.ph.notesOptional')" style="resize:none"></textarea>
                            <small class="text-muted">{{ (backupForm.notes || '').length }}/50</small>
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
                            <span class="badge bg-secondary">{{ tFormat('dash.count.backup', backups.length) }}</span>
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
                                        <th>{{ t('common.description') }}</th>
                                        <th style="width:100px;">{{ t('common.status') }}</th>
                                        <th>{{ t('common.storage') }}</th>
                                        <th style="width:120px;">{{ t('common.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(b, idx) in backups" :key="b.id">
                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="backupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleBackupSelect(b.id)" style="cursor:pointer"></td>
                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                        <td class="small text-muted">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                        <td>
                                            <span v-if="b.status === 'completed'" class="badge bg-success">{{ t('dash.statusDone') }}</span>
                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">{{ t('dash.statusPending') }}</span>
                                            <span v-else class="badge bg-danger">{{ t('dash.statusFailed') }}</span>
                                        </td>
                                        <td class="small">{{ b.storage }}</td>
                                        <td>
                                            <div class="d-flex gap-1">
                                                <pv-button v-if="b.status === 'completed'" @click="restoreBackup(b)" :title="t('dash.backup.restoreTitle')" variant="outline" size="sm">{{ t('dash.backup.restore') }}</pv-button>
                                                <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteBackup(b.id)" :title="t('dash.backup.deleteTitle')" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
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

<Teleport to="body">
<div class="modal fade" id="lxcPasswordResetModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ t('dash.resetPwd.ctTitle') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <form @submit.prevent="submitLxcPasswordReset">
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.resetPwd.newPwd') }}<span class="small text-muted">{{ (lxcPasswordForm.password || '').length }}/13</span></label>
                        <div class="input-group">
                            <input :type="lxcPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="lxcPasswordForm.password" maxlength="13" required autocomplete="new-password" :placeholder="t('register.pwdPh')" @input="lxcPasswordForm.password = lxcPasswordForm.password.slice(0,13)">
                            <button class="btn btn-outline-secondary" type="button" @click="lxcPwdShowPwd = !lxcPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                <svg v-if="lxcPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.resetPwd.confirmPwd') }}</label>
                        <div class="input-group">
                            <input :type="lxcPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="lxcPasswordForm.confirm" required autocomplete="new-password" :placeholder="t('register.confirmPlaceholder')">
                            <button class="btn btn-outline-secondary" type="button" @click="lxcPwdShowPwd = !lxcPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                <svg v-if="lxcPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                            </button>
                        </div>
                    </div>
                    <pv-button type="submit" variant="primary">{{ t('dash.resetPwd.title') }}</pv-button>
                </form>
            </div>
        </div>
    </div>
</div>
</Teleport>

<Teleport to="body">
<div class="modal fade" id="editLxcModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ t('dash.editLxc') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <form @submit.prevent="updateLxc" novalidate>
                    <div class="mb-3">
                        <label class="form-label">{{ t('common.name') }}</label>
                        <input type="text" class="form-control" v-model="editLxcForm.name">
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.assignTo') }}</label>
                        <select class="form-select" v-model="editLxcForm.user_id">
                            <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                        </select>
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.expiry') }}</label>
                        <input type="datetime-local" class="form-control" v-model="editLxcForm.expiration_date" step="1">
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.renewPrice') }}</label>
                        <input type="number" step="0.01" min="0" class="form-control" v-model="editLxcForm.renewal_price" :placeholder="t('common.ph.price')">
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                        <select class="form-select" v-model="editLxcForm.renewal_period">
                            <option value="month">{{ t('dash.month30') }}</option>
                            <option value="quarter">{{ t('dash.quarter90') }}</option>
                            <option value="year">{{ t('dash.year365') }}</option>
                        </select>
                    </div>
                    <div v-if="user && user.role === 'admin'" class="mb-3">
                        <label class="form-label">{{ t('dash.macGroup') }}</label>
                        <select class="form-select" v-model="editLxcForm.mac_group_id">
                            <option value="">{{ t('dash.noGroup') }}</option>
                            <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + ' ' + g.id }}</option>
                        </select>
                    </div>
                    <div class="d-flex gap-2">
                        <pv-button type="submit" variant="primary" formnovalidate>{{ t('common.save') }}</pv-button>
                        <pv-button v-if="user && user.role === 'admin'" type="button" @click="removeLxc" variant="warning">{{ t('dash.detachOnly') }}</pv-button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>
</Teleport>

<Teleport to="body">
<div class="modal fade" id="lxcSnapshotModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.snap.manageCt', lxcSnapshotCtName) }}</h5>
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
                                <pv-button @click="createLxcSnapshot()" :disabled="lxcSnapshotCreating" size="sm">
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
                                <pv-button v-if="isAnyLxcSnapshotSelected" @click="batchDeleteLxcSnapshots()" :disabled="lxcSnapshotDeleting" variant="outline-danger" size="sm">
                                    <span v-if="lxcSnapshotDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                    {{ t('dash.batchDeletePrefix') }}{{ lxcSnapshotSelected.size }})
                                </pv-button>
                                <span class="badge bg-secondary">{{ tFormat('dash.count.snapshot', lxcSnapshots.length) }}</span>
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
                                        <pv-button @click="rollbackLxcSnapshot(snap.name)" :title="t('dash.snap.rollbackTitle')" variant="outline" size="sm">{{ t('dash.snap.rollback') }}</pv-button>
                                        <pv-button @click="deleteLxcSnapshot(snap.name)" :title="t('dash.snap.deleteTitle')" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
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
                                        <div class="small text-muted">{{ t('dash.snap.currentCount') }}</div>
                                        <div class="fw-bold" :class="lxcSnapshotLimits.current >= lxcSnapshotLimits.max ? 'text-danger' : ''">{{ lxcSnapshotLimits.current }} / {{ lxcSnapshotLimits.max }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">{{ t('dash.snap.todayCreate') }}</div>
                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_creates >= lxcSnapshotLimits.max_creates ? 'text-danger' : ''">{{ lxcSnapshotLimits.today_creates }} / {{ lxcSnapshotLimits.max_creates }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">{{ t('dash.snap.todayRestore') }}</div>
                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_rollbacks >= lxcSnapshotLimits.max_rollbacks ? 'text-danger' : ''">{{ lxcSnapshotLimits.today_rollbacks }} / {{ lxcSnapshotLimits.max_rollbacks }}</div>
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

<Teleport to="body">
<div class="modal fade" id="lxcBackupModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.backup.manageCt', lxcBackupCtName) }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <div class="card mb-3">
                    <div class="card-header">
                        <h6 class="mb-0">{{ t('dash.backup.limitInfo') }}</h6>
                    </div>
                    <div class="card-body">
                        <div v-if="lxcBackupLimits.current >= lxcBackupLimits.max_per_vm || lxcBackupLimits.today_creates >= lxcBackupLimits.daily_limit" class="alert alert-warning py-2 mb-2 small">
                            <span v-if="lxcBackupLimits.current >= lxcBackupLimits.max_per_vm">{{ t('dash.backup.maxReached') }}</span>
                            <span v-else>{{ t('dash.backup.dailyLimit') }}</span>
                        </div>
                        <div class="row text-center g-2">
                            <div class="col-6">
                                <div class="border rounded p-2">
                                    <div class="small text-muted">{{ t('dash.backup.currentCount') }}</div>
                                    <div class="fw-bold" :class="lxcBackupLimits.current >= lxcBackupLimits.max_per_vm ? 'text-danger' : ''">{{ lxcBackupLimits.current }} / {{ lxcBackupLimits.max_per_vm }}</div>
                                </div>
                            </div>
                            <div class="col-6">
                                <div class="border rounded p-2">
                                    <div class="small text-muted">{{ t('dash.snap.todayCreate') }}</div>
                                    <div class="fw-bold" :class="lxcBackupLimits.today_creates >= lxcBackupLimits.daily_limit ? 'text-danger' : ''">{{ lxcBackupLimits.today_creates }} / {{ lxcBackupLimits.daily_limit }}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="card mb-3">
                    <div class="card-header"><h6 class="mb-0">{{ t('dash.backup.create') }}</h6></div>
                    <div class="card-body">
                        <div class="mb-2">
                            <textarea class="form-control form-control-sm" v-model="lxcBackupForm.notes" rows="2" maxlength="50" :placeholder="t('common.ph.notesOptional')" style="resize:none"></textarea>
                            <small class="text-muted">{{ (lxcBackupForm.notes || '').length }}/50</small>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">{{ t('dash.backup.stopMode') }}</small>
                            <pv-button @click="createLxcBackup()" :disabled="lxcBackupCreating" size="sm">
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
                            <pv-button v-if="isAnyLxcBackupSelected" @click="batchDeleteLxcBackups()" :disabled="lxcBackupDeleting" variant="outline-danger" size="sm">
                                <span v-if="lxcBackupDeleting" class="spinner-border spinner-border-sm me-1"></span>
                                {{ t('dash.batchDeletePrefix') }}{{ lxcBackupSelected.size }})
                            </pv-button>
                            <span class="badge bg-secondary">{{ tFormat('dash.count.backup', lxcBackups.length) }}</span>
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
                                        <th>{{ t('common.description') }}</th>
                                        <th style="width:100px;">{{ t('common.status') }}</th>
                                        <th>{{ t('common.storage') }}</th>
                                        <th style="width:120px;">{{ t('common.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(b, idx) in lxcBackups" :key="b.id">
                                        <td class="checkbox-col"><input type="checkbox" class="form-check-input" :checked="lxcBackupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleLxcBackupSelect(b.id)" style="cursor:pointer"></td>
                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                        <td class="small text-muted">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                        <td>
                                            <span v-if="b.status === 'completed'" class="badge bg-success">{{ t('dash.statusDone') }}</span>
                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">{{ t('dash.statusPending') }}</span>
                                            <span v-else class="badge bg-danger">{{ t('dash.statusFailed') }}</span>
                                        </td>
                                        <td class="small">{{ b.storage }}</td>
                                        <td>
                                            <pv-button v-if="b.status === 'completed'" @click="restoreLxcBackup(b)" :title="t('dash.backup.restoreTitle')" variant="outline" size="sm">{{ t('dash.backup.restore') }}</pv-button>
                                            <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteLxcBackup(b.id, lxcBackupCtId)" :title="t('dash.backup.deleteTitle')" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
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

<!-- CDK 兑换弹窗 -->
<Teleport to="body">
<div class="modal fade" id="cdkRedeemModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ t('dash.overview.cdk') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body" @click="toggleCdkDropdown('vm', false); toggleCdkDropdown('lxc', false)">
                <div v-if="cdkRedeemStep === 'input'">
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.cdk.code') }}</label>
                        <input type="text" class="form-control" v-model="cdkRedeemForm.code" :placeholder="t('dash.cdk.codePh')" style="text-transform: uppercase;" @input="cdkRedeemForm.code = cdkRedeemForm.code.toUpperCase()">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.cdk.resType') }}</label>
                        <div class="d-flex gap-3">
                            <label class="form-check-label d-flex align-items-center gap-1" style="cursor:pointer;">
                                <input type="radio" class="form-check-input" value="vm" v-model="cdkRedeemType">
                                {{ t('nav.vms') }}
                            </label>
                            <label class="form-check-label d-flex align-items-center gap-1" style="cursor:pointer;">
                                <input type="radio" class="form-check-input" value="lxc" v-model="cdkRedeemType">
                                {{ t('dash.cdk.resLxc') }}
                            </label>
                        </div>
                    </div>
                    <div class="mb-3" v-if="cdkRedeemType === 'vm'">
                        <label class="form-label" id="cdk-vm-label">{{ t('dash.cdk.selectVm') }}</label>
                        <div class="custom-select" style="width:100%;" @click.stop>
                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-vm-label"
                                 data-cdk-select="vm"
                                 @click="toggleCdkDropdown('vm', !cdkVmDropdownOpen)"
                                 @keydown.enter.prevent="toggleCdkDropdown('vm', !cdkVmDropdownOpen)"
                                 @keydown.space.prevent="toggleCdkDropdown('vm', !cdkVmDropdownOpen)"
                                 @keydown.esc="toggleCdkDropdown('vm', false)">
                                <span v-if="cdkRedeemForm.vm_id">
                                    {{ getRedeemableVmName(cdkRedeemForm.vm_id) }}
                                </span>
                                <span v-else class="custom-select-placeholder">{{ t('dash.cdk.selectVm') }}</span>
                            </div>
                        </div>
                        <!-- 下拉菜单 Teleport 到 body，绕过 modal-content 的 backdrop-filter 导致 fixed 降级 -->
                        <Teleport to="body">
                            <div v-if="cdkVmDropdownOpen" class="custom-select-dropdown" role="listbox" data-cdk-dropdown="vm" style="display:block">
                                <div v-for="vm in userVms" :key="vm.id" class="option" role="option"
                                     :class="{ selected: cdkRedeemForm.vm_id == vm.id }"
                                     @click="cdkRedeemForm.vm_id = vm.id; toggleCdkDropdown('vm', false);">
                                    {{ vm.name || 'VM ' + vm.vm_id }}{{ t('dash.expireParen') }} {{ vm.expiration_date ? formatDate(vm.expiration_date) : t('dash.unset') }} <span :class="getExpiryColor(vm.expiration_date)">{{ vm.expiration_date ? daysUntilExpire(vm.expiration_date) : '' }}</span>）
                                </div>
                            </div>
                        </Teleport>
                    </div>
                    <div class="mb-3" v-if="cdkRedeemType === 'lxc'">
                        <label class="form-label" id="cdk-lxc-label">{{ t('dash.cdk.selectLxc') }}</label>
                        <div class="custom-select" style="width:100%;" @click.stop>
                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-lxc-label"
                                 data-cdk-select="lxc"
                                 @click="toggleCdkDropdown('lxc', !cdkLxcDropdownOpen)"
                                 @keydown.enter.prevent="toggleCdkDropdown('lxc', !cdkLxcDropdownOpen)"
                                 @keydown.space.prevent="toggleCdkDropdown('lxc', !cdkLxcDropdownOpen)"
                                 @keydown.esc="toggleCdkDropdown('lxc', false)">
                                <span v-if="cdkRedeemForm.container_id">
                                    {{ getRedeemableLxcName(cdkRedeemForm.container_id) }}
                                </span>
                                <span v-else class="custom-select-placeholder">{{ t('dash.cdk.selectLxc') }}</span>
                            </div>
                        </div>
                        <Teleport to="body">
                            <div v-if="cdkLxcDropdownOpen" class="custom-select-dropdown" role="listbox" data-cdk-dropdown="lxc" style="display:block">
                                <div v-for="ct in userLxcContainers" :key="ct.id" class="option" role="option"
                                     :class="{ selected: cdkRedeemForm.container_id == ct.id }"
                                     @click="cdkRedeemForm.container_id = ct.id; toggleCdkDropdown('lxc', false);">
                                    {{ ct.name || 'CT ' + ct.ct_id }}{{ t('dash.expireParen') }} {{ ct.expiration_date ? formatDate(ct.expiration_date) : t('dash.unset') }} <span :class="getExpiryColor(ct.expiration_date)">{{ ct.expiration_date ? daysUntilExpire(ct.expiration_date) : '' }}</span>）
                                </div>
                            </div>
                        </Teleport>
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
                <pv-button type="button" @click="redeemCdk" :disabled="!cdkRedeemForm.code || (cdkRedeemType === 'vm' && !cdkRedeemForm.vm_id) || (cdkRedeemType === 'lxc' && !cdkRedeemForm.container_id)" variant="primary">{{ t('dash.cdk.confirm') }}</pv-button>
            </div>
            <div class="modal-footer" v-if="cdkRedeemStep === 'result'">
                <pv-button type="button" data-bs-dismiss="modal" @click="cdkRedeemStep = 'input'">{{ t('dash.statusDone') }}</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- 续费弹窗 -->
<Teleport to="body">
<div v-if="renewShow" class="modal" style="display:block;background:rgba(0,0,0,0.5);" @click.self="renewShow = false">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ t('dash.renew.balanceDeduct') }}</h5>
                <pv-button type="button" variant="close" @click="renewShow = false"></pv-button>
            </div>
            <div class="modal-body">
                <p v-if="renewResource">{{ t('dash.renew.resource') }} {{ renewResource.name || (renewResource.vm_id ? 'VM ' + renewResource.vm_id : 'CT ' + renewResource.ct_id) }} <span class="text-muted">(ID: {{ renewResource.vm_id || renewResource.ct_id }})</span></p>
                <p v-if="renewResource">{{ t('dash.renew.priceLabel') }} ¥{{ parseFloat(renewResource.renewal_price||0).toFixed(2) }} / {{ renewPeriodLabel(renewResource.renewal_period) }}</p>
                <p v-if="renewResource && renewResource.expiration_date">{{ t('dash.renew.expiryLabel') }} {{ formatDate(renewResource.expiration_date) }} <span :class="getExpiryColor(renewResource.expiration_date) + ' small'">({{ daysUntilExpire(renewResource.expiration_date) }})</span></p>
                <!-- 关联数据盘续费（仅 VM） -->
                <div v-if="renewResource && renewResource.vm_id !== undefined && diskListForRenew && diskListForRenew.length > 0" class="mb-3">
                    <label class="form-label">{{ t('dash.renew.diskRenew') }}</label>
                    <div v-for="disk in diskListForRenew" :key="disk.id" class="form-check mb-1">
                        <input type="checkbox" :id="'disk-renew-' + disk.id" v-model="disk._selected" class="form-check-input">
                        <label :for="'disk-renew-' + disk.id" class="form-check-label">
                            {{ disk.disk_name || disk.volume_id }}（{{ disk.capacity_gb }} GiB）
                            <span class="text-muted small">{{ t('dash.renew.expiry') }} {{ formatDate(disk.expire_time) }} +￥{{ calcDiskRenewPrice(disk).toFixed(2) }}</span>
                        </label>
                    </div>
                    <div v-if="selectedDiskRenewTotal > 0" class="text-muted small mt-1">{{ t('dash.renew.diskTotal') }} ¥{{ selectedDiskRenewTotal.toFixed(2) }}</div>
                </div>
                <div class="mb-3">
                    <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                    <select class="form-select" v-model="renewFormPeriod" style="max-width:200px;">
                        <option value="month">{{ t('dash.monthly30') }}</option>
                        <option value="quarter">{{ t('dash.quarterly90') }}</option>
                        <option value="year">{{ t('dash.yearly365') }}</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">{{ t('dash.renew.qty') }}({{ renewPeriodLabel(renewFormPeriod) }})</label>
                    <input type="number" class="form-control" v-model.number="renewQuantity" min="1" step="1" style="max-width:120px;" @change="renewQuantity = Math.max(1, Math.floor(Math.abs(renewQuantity || 1)))">
                </div>
                <p v-if="renewResource">{{ t('dash.renew.payable') }} ¥{{ calcRenewTotal().toFixed(2) }}</p>
                <p>{{ t('dash.renew.balance') }} ¥{{ walletBalance }}</p>
                <div v-if="renewError" class="alert alert-danger py-2">{{ renewError }}</div>
            </div>
            <div class="modal-footer d-flex gap-2">
                <pv-button type="button" @click="renewShow = false" variant="secondary">{{ t('common.cancel') }}</pv-button>
                <pv-button type="button" @click="submitRenew" variant="primary">{{ t('dash.renew.confirm') }}</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- VM 重置密码弹窗 -->
<Teleport to="body">
<div v-if="vmPwdShow" id="vmPwdModalWrap" class="modal" style="display:block;background:rgba(0,0,0,0.5);" @click.self="vmPwdShow = false">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ t('dash.resetPwd.title') }}</h5>
                <pv-button type="button" variant="close" @click="vmPwdShow = false"></pv-button>
            </div>
            <div class="modal-body">
                <div v-if="vmPwdCiuser === false" class="alert alert-danger py-2 mb-0">{{ t('dash.resetPwd.noCloudInit') }}</div>
                <div v-else>
                    <p v-if="vmPwdResource">{{ t('dash.resetPwd.resource') }} {{ vmPwdResource.name || ('VM ' + vmPwdResource.vm_id) }}</p>
                    <p v-if="vmPwdResource">{{ t('dash.resetPwd.account') }}: {{ vmPwdCiuser }}</p>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.resetPwd.newPwd') }}<span class="small text-muted">{{ (vmPwdNewPassword || '').length }}/13</span></label>
                        <div class="input-group">
                            <input :type="vmPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="vmPwdNewPassword" maxlength="13" :placeholder="t('register.pwdPh')" @input="vmPwdNewPassword = vmPwdNewPassword.slice(0,13)">
                            <button class="btn btn-outline-secondary" type="button" @click="vmPwdShowPwd = !vmPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                <svg v-if="vmPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.resetPwd.confirmPwd') }}</label>
                        <div class="input-group">
                            <input :type="vmPwdShowPwd ? 'text' : 'password'" class="form-control" v-model="vmPwdConfirm" :placeholder="t('register.confirmPlaceholder')" autocomplete="new-password">
                            <button class="btn btn-outline-secondary" type="button" @click="vmPwdShowPwd = !vmPwdShowPwd" tabindex="-1" style="border-color:#444;background:transparent;color:#aaa;">
                                <svg v-if="vmPwdShowPwd" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486z"/><path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/><path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/></svg>
                                <svg v-else xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/></svg>
                            </button>
                        </div>
                    </div>
                    <div v-if="vmPwdError" class="alert alert-danger py-2">{{ vmPwdError }}</div>
                </div>
            </div>
            <div class="modal-footer d-flex gap-2" v-if="vmPwdCiuser !== false">
                <pv-button type="button" @click="vmPwdShow = false" variant="secondary">{{ t('common.cancel') }}</pv-button>
                <pv-button type="button" @click="submitVmPasswordReset" :disabled="!vmPwdNewPassword || vmPwdNewPassword.length < 8" variant="primary">{{ t('dash.resetPwd.confirm') }}</pv-button>
            </div>
            <div class="modal-footer" v-if="vmPwdCiuser === false">
                <pv-button type="button" @click="vmPwdShow = false" variant="secondary">{{ t('common.close') }}</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- 套餐订购弹窗 -->
<Teleport to="body">
<div class="modal fade" id="orderModal" tabindex="-1" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="background:var(--bg-modal)">
        <div class="modal-header"><h5 class="modal-title">{{ t('dash.order.confirmOrder') }}</h5><pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
        <div class="modal-body">
            <div class="mb-3"><strong>{{ orderPackage.name }}</strong></div>
            <!-- 私有网络：子网选择（VM/LXC 下单必选，放在操作系统上方） -->
            <div class="mb-3">
                <label class="form-label">{{ t('dash.order.network') }}<span class="text-danger">*</span></label>
                <select class="form-select" v-model="orderForm.subnet_id" :disabled="orderSubnetsLoading">
                    <option :value="0">{{ t('dash.order.selectNetwork') }}</option>
                    <option v-for="s in orderSubnets" :key="s.id" :value="s.id">
                        {{ s.vlan_name }}（{{ s.cidr }}）
                    </option>
                </select>
                <div class="form-text text-muted" v-if="orderSubnetsLoading">{{ t('common.loading') }}</div>
                <div class="form-text text-muted" v-else-if="orderSubnets.length === 0">{{ t('dash.order.noSubnet') }}</div>
            </div>
            <!-- v1.3 新增：操作系统选择（仅 VM 套餐显示） -->
            <div class="mb-3" v-if="orderType === 'vm'">
                <label class="form-label">{{ t('dash.order.os') }}<span class="text-danger">*</span></label>
                <select class="form-select" v-model="orderForm.os_template_id" :disabled="orderOsLoading">
                    <option :value="0">{{ t('dash.order.selectOs') }}</option>
                    <option v-for="t in orderOsTemplates" :key="t.id" :value="t.id">
                        {{ t.name }}
                    </option>
                </select>
                <div class="form-text text-muted" v-if="orderOsLoading">{{ t('common.loading') }}</div>
                <div class="form-text text-muted" v-else-if="orderOsTemplates.length === 0">
                    {{ t('dash.order.noOs') }}
                </div>
            </div>
            <div class="mb-3">
                <label class="form-label">{{ t('dash.billingPeriod') }}</label>
                <div class="order-period-display">
                    <span class="badge bg-primary">{{ orderForm.period === 'month' ? t('dash.order.monthPay') : (orderForm.period === 'quarter' ? t('dash.order.quarterPay') : t('dash.order.yearPay')) }}</span>
                    <span class="text-muted ms-2" v-if="orderPackage.monthly_price">¥{{ getPackageFinalPrice(orderPackage, orderForm.period) }} / {{ orderForm.period === 'month' ? t('dash.period.month') : (orderForm.period === 'quarter' ? t('dash.period.quarter') : t('dash.period.year')) }}</span>
                </div>
            </div>
            <div class="mb-3"><label class="form-label">{{ t('common.quantity') }}</label>
                <input type="number" class="form-control" v-model="orderForm.quantity" min="1" max="10">
            </div>
            <div class="d-flex justify-content-between mb-2">
                <span>{{ t('dash.order.balance') }}</span>
                <strong>¥{{ walletBalance }}</strong>
            </div>
            <div class="alert alert-info">{{ t('dash.order.total') }}<strong>{{ tFormat('dash.order.totalYuan', orderTotal) }}</strong></div>
        </div>
        <div class="modal-footer d-flex gap-2">
            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
            <pv-button type="button" @click="confirmOrder" :disabled="orderLoading || (orderType === 'vm' && (!orderForm.os_template_id || !orderForm.subnet_id)) || (orderType === 'lxc' && !orderForm.subnet_id)" variant="primary">{{ orderLoading ? t('dash.processing') : t('dash.order.orderNow') }}</pv-button>
        </div>
    </div></div>
</div>
</Teleport>

<!-- 消息详情弹窗 -->
<Teleport to="body">
<div class="modal fade" id="messageDetailModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ currentMsg.title }}</h5>
                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <div class="mb-3">
                    <span class="message-type-badge" :class="'msg-type-' + currentMsg.type">
                        {{ {1:t('user.message.system'),2:t('user.message.business'),3:t('user.message.renewal'),4:t('user.message.ticket'),5:t('user.message.cs')}[currentMsg.type] || t('nav.messages') }}
                    </span>
                    <span class="text-muted ms-2 small">{{ formatDate(currentMsg.created_at) }}</span>
                </div>
                <div class="message-detail-content" style="line-height:1.7;white-space:pre-wrap;">{{ currentMsg.content }}</div>
            </div>
            <div class="modal-footer d-flex gap-2">
                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">{{ t('common.delete') }}</pv-button>
                <pv-button type="button" data-bs-dismiss="modal">{{ t('common.close') }}</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- 切换系统弹窗 -->
<Teleport to="body">
<div class="modal fade" id="osSwitchModal" tabindex="-1" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content" style="background:var(--bg-modal)">
        <div class="modal-header"><h5 class="modal-title">{{ t('dash.osSwitch.title') }}</h5><pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
        <div class="modal-body">
            <div class="alert alert-warning" style="border:1px solid var(--bs-warning-border-subtle, #ffc107);background:color-mix(in srgb, var(--bs-warning) 15%, var(--bg-card, #fff));">
                <strong style="color:var(--bs-warning-text-emphasis, #664d00);font-size:15px;">{{ t('dash.osSwitch.warn') }}</strong>
                <ul class="mb-0 mt-1" style="color:var(--text-primary);line-height:1.8;">
                    <li>{{ t('dash.osSwitch.willClear') }}<strong style="color:var(--bs-danger);">{{ t('dash.osSwitch.clearDisk') }}</strong>{{ t('dash.osSwitch.backupFirst') }}</li>
                    <li>{{ t('dash.osSwitch.diskSafe') }}<strong style="color:var(--bs-success);">{{ t('dash.osSwitch.noLoss') }}</strong></li>
                    <li>{{ t('dash.osSwitch.duration') }}</li>
                    <li>{{ t('dash.osSwitch.newPwd') }}</li>
                </ul>
            </div>
            <div class="mb-3">
                <label class="form-label fw-bold" style="color:var(--bs-primary)">{{ t('dash.osSwitch.selectTarget') }}</label>
                <div class="row g-2">
                    <div class="col-md-6" v-for="t in osSwitchList" :key="t.id">
                        <div class="card border" @click="osSwitchSelectedId = t.id"
                          :style="{
                            cursor:'pointer',
                            transition:'all .25s ease',
                            borderColor: osSwitchSelectedId === t.id ? 'var(--bs-primary)' : 'var(--border-color, #dee2e6)',
                            background: osSwitchSelectedId === t.id ? 'color-mix(in srgb, var(--bs-primary) 8%, var(--bg-card, #fff))' : 'var(--bg-card, #fff)',
                            boxShadow: osSwitchSelectedId === t.id ? '0 2px 12px rgba(var(--bs-primary-rgb),0.25)' : 'none'
                          }">
                            <div class="card-body py-3 px-3">
                                <div class="d-flex align-items-center gap-2 mb-1">
                                    <span class="d-inline-flex align-items-center justify-content-center rounded-circle"
                                      :style="{
                                        width:'20px', height:'20px', flexShrink:0,
                                        border:'2px solid',
                                        borderColor: osSwitchSelectedId === t.id ? 'var(--bs-primary)' : 'var(--border-color, #adb5bd)',
                                        transition:'all .2s ease'
                                      }">
                                        <span v-if="osSwitchSelectedId === t.id" class="rounded-circle d-block"
                                          :style="{width:'10px', height:'10px', background:'var(--bs-primary)'}"></span>
                                    </span>
                                    <div class="fw-bold" :style="{color: osSwitchSelectedId === t.id ? 'var(--bs-primary)' : 'var(--text-primary)'}">{{ t.name }}</div>
                                </div>
                                <div class="small" style="margin-left:30px;color:var(--text-secondary)">{{ t.description ? t.description.substring(0,40) : '' }}</div>
                                <div class="small" style="margin-left:30px;color:var(--text-secondary)" v-if="t.description">{{ t.description.substring(0,40) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div v-if="osSwitchList.length === 0" class="text-muted small py-3 text-center">{{ t('dash.osSwitch.none') }}</div>
            </div>
            <div class="current-os text-muted small mb-2" v-if="osSwitchCurrentName">
                {{ t('dash.osSwitch.current') }}{{ osSwitchCurrentName }}
            </div>
            <div class="form-check" v-if="osSwitchSelectedId">
                <input class="form-check-input" type="checkbox" id="osSwitchConfirm" v-model="osSwitchConfirm">
                <label class="form-check-label" for="osSwitchConfirm">{{ t('dash.osSwitch.acknowledge') }}</label>
            </div>
        </div>
        <div class="modal-footer d-flex gap-2">
            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
            <pv-button type="button" variant="danger" :disabled="!osSwitchConfirm || osSwitchSubmitting" :loading="osSwitchSubmitting" @click="submitOsSwitch()">{{ t('dash.osSwitch.confirm') }}</pv-button>
        </div>
    </div></div>
</div>
</Teleport>

<!-- 新建子网确认弹窗 -->
<Teleport to="body">
<div class="modal fade" id="createSubnetModal" tabindex="-1" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="background:var(--bg-modal)">
        <div class="modal-header"><h5 class="modal-title">{{ t('dash.subnet.create') }}</h5><pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
        <div class="modal-body">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="text-muted small">{{ t('dash.subnet.created') }}<strong>{{ subnetQuota.used }}</strong> / <strong>{{ subnetQuota.max > 0 ? subnetQuota.max : '∞' }}</strong> {{ t('dash.subnet.subnetUnit') }}</span>
                <span v-if="subnetQuota.max > 0" class="text-muted small">{{ tFormat('dash.subnet.remaining', Math.max(0, subnetQuota.max - subnetQuota.used)) }}</span>
                <span v-else class="text-muted small">{{ t('dash.subnet.adminUnlimited') }}</span>
            </div>
            <div class="mb-3">
                <label class="form-label">{{ t('nodes.belongZone') }}</label>
                <select class="form-select" v-model="subnetZoneId">
                    <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                    <option v-for="z in subnetZones" :key="z.id" :value="z.id">{{ z.name }}{{ z.region_name ? ' (' + z.region_name + ')' : '' }}</option>
                </select>
            </div>
            <div v-if="subnetQuota.max > 0 && subnetQuota.used >= subnetQuota.max" class="alert alert-warning py-2 small mb-3">
                {{ t('dash.subnet.limitReached') }}
            </div>
            <p class="text-muted small">{{ t('dash.subnet.autoAssignHint') }}</p>
            <ul class="small text-muted mb-3">
                <li>{{ t('dash.subnet.autoInc') }}</li>
                <li>{{ t('dash.subnet.gatewayHint') }}</li>
                <li>{{ t('dash.subnet.nameAuto') }}</li>
            </ul>
            <div class="alert alert-info mb-0">
                <div>{{ t('dash.subnet.viewHint') }}<strong>{{ t('dash.subnet.segmentGateway') }}</strong></div>
                <div class="mt-1">{{ t('dash.subnet.unbindFirst') }}</div>
            </div>
            <div v-if="subnetCreating" class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                {{ t('dash.subnet.creating') }}
            </div>
        </div>
        <div class="modal-footer d-flex gap-2">
            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
            <pv-button type="button" @click="createSubnet" :disabled="subnetCreating || (subnetQuota.max > 0 && subnetQuota.used >= subnetQuota.max)" :loading="subnetCreating" variant="primary">{{ t('dash.subnet.confirmCreate') }}</pv-button>
        </div>
    </div></div>
</div>
</Teleport>

<!-- 绑定子网弹窗 -->
<Teleport to="body">
<div class="modal fade" id="bindSubnetModal" tabindex="-1" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="background:var(--bg-modal)">
        <div class="modal-header"><h5 class="modal-title">{{ t('dash.subnet.bind') }}</h5><pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
        <div class="modal-body">
            <div class="mb-3">
                <strong>{{ bindSubnetDevice.name || (bindSubnetDevice.type === 'vm' ? ('VM ' + bindSubnetDevice.vm_id) : ('CT ' + bindSubnetDevice.ct_id)) }}</strong>
                <span v-if="bindSubnetDevice.status && bindSubnetDevice.status.status === 'running'" class="badge bg-success ms-2">{{ t('dash.vm.running') }}</span>
                <span v-else class="badge bg-secondary ms-2">{{ t('dash.vm.stopped') }}</span>
            </div>
            <div class="alert alert-warning small" v-if="bindSubnetDevice.status && bindSubnetDevice.status.status === 'running'">
                <template v-if="user && user.role === 'admin'">{{ t('dash.subnet.runningBindHint') }}</template>
                <template v-else>{{ t('dash.subnet.runningHint') }}</template>
            </div>
            <div class="alert alert-warning small" v-else-if="bindSubnetDevice.status && bindSubnetDevice.status.status !== 'running'">
                {{ t('dash.subnet.unbindHint') }}
            </div>
            <!-- 已绑定：显示当前子网 + 解绑按钮 -->
            <template v-if="bindSubnetCurrentSubnet">
                <div class="mb-3">
                    <label class="form-label">{{ t('dash.subnet.currentBound') }}</label>
                    <div class="form-control" readonly>
                        {{ bindSubnetCurrentSubnet.vlan_name }}（{{ bindSubnetCurrentSubnet.cidr }}{{ t('dash.subnet.availIpSuffix') }}{{ bindSubnetCurrentSubnet.available }}
                    </div>
                    <div class="form-text text-muted" v-if="bindSubnetDevice.dhcp_static_ip">{{ t('dash.subnet.assignedIp') }}: {{ bindSubnetDevice.dhcp_static_ip }}</div>
                </div>
                <pv-button type="button" variant="outline-danger" :disabled="bindSubnetSubmitting || (bindSubnetDevice.status && bindSubnetDevice.status.status === 'running')" :loading="bindSubnetSubmitting" @click="unbindSubnet">{{ t('dash.subnet.unbind') }}</pv-button>
            </template>
            <!-- 未绑定：选择子网 + 绑定按钮 -->
            <template v-else>
                <div class="mb-3">
                    <label class="form-label">{{ t('dash.subnet.select') }}<span class="text-danger">*</span></label>
                    <select class="form-select" v-model="bindSubnetForm.subnet_id">
                        <option :value="0">{{ t('dash.subnet.select') }}</option>
                        <option v-for="s in subnets" :key="s.id" :value="s.id">
                            {{ s.vlan_name }}（{{ s.cidr }}{{ t('dash.subnet.availIpSuffix') }}{{ s.available }}
                        </option>
                    </select>
                    <div class="form-text text-muted" v-if="subnets.length === 0">{{ t('dash.subnet.noSubnet') }}</div>
                </div>
                <pv-button type="button" @click="bindSubnet" :disabled="bindSubnetSubmitting || !bindSubnetForm.subnet_id || (bindSubnetDevice.status && bindSubnetDevice.status.status === 'running' && !(user && user.role === 'admin'))" :loading="bindSubnetSubmitting" variant="primary">{{ t('dash.subnet.confirmBind') }}</pv-button>
            </template>
            <div v-if="bindSubnetSubmitting" class="text-center text-muted py-3">
                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                {{ t('common.processing') }}
            </div>
        </div>
    </div></div>
</div>
</Teleport>

<!-- 重置 LXC IP 弹窗（私有网络：需先绑定子网，随机 IP 取自子网 IP 池） -->
<Teleport to="body">
<div class="modal fade" id="resetLxcIpModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.resetIpCt', lxcPasswordResetCtId) }}</h5>
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
                        <pv-button type="button" @click="randomLxcIp" :title="t('dash.randomIp.title')" variant="outline">{{ t('dash.random') }}</pv-button>
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

<!-- 重置 VM IP 弹窗（私有网络：需先绑定子网，随机 IP 取自子网 IP 池） -->
<Teleport to="body">
<div class="modal fade" id="resetVmIpModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">{{ tFormat('dash.resetIpVm', resetVmIpVm?.vm_id) }}</h5>
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
                        <pv-button type="button" @click="randomVmIp" :title="t('dash.randomIp.title')" variant="outline">{{ t('dash.random') }}</pv-button>
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

`);

// 共享弹窗模板（单一来源：shared-dialog-templates.js，规范第七节）
if (window.__sharedDialogTemplates) {
  window.__dashboardTemplateParts.push(window.__sharedDialogTemplates);
}
})();
