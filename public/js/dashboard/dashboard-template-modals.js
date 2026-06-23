(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
  window.__dashboardTemplateParts.push(`
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
                        <input type="datetime-local" class="form-control" v-model="editVmForm.expiration_date" step="1">
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
                        <pv-button type="button" @click="removeVm" variant="outline">移除（仅解绑）</pv-button>
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
                                <input type="text" class="form-control form-control-sm" v-model="snapshotForm.name" placeholder="快照名称（英文、数字、-、_，最少2字符）" @input="filterSnapshotName">
                            </div>
                            <div class="mb-2">
                                <textarea class="form-control form-control-sm" v-model="snapshotForm.description" rows="2" placeholder="描述（可选）"></textarea>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <small :class="snapshotForm.name.length >= 20 ? 'text-danger' : 'text-muted'">{{ snapshotForm.name.length }}/20</small>
                                <pv-button @click="createSnapshot(snapshotVmId)" :disabled="!isSnapshotNameValid || snapshotCreating" size="sm">
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
                                <pv-button v-if="isAnySnapshotSelected" @click="batchDeleteSnapshots(snapshotVmId)" :disabled="snapshotDeleting" size="sm">
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
                                        <pv-button @click="rollbackSnapshot(snapshotVmId, snap.name)" title="回滚到此快照" variant="outline" size="sm">回滚</pv-button>
                                        <pv-button @click="deleteSnapshot(snapshotVmId, snap.name)" title="删除快照" variant="outline" size="sm">删除</pv-button>
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
                                        <div class="small text-muted">当前快照数</div>
                                        <div class="fw-bold" :class="snapshotLimits.current >= snapshotLimits.max ? 'text-danger' : ''">{{ snapshotLimits.current }} / {{ snapshotLimits.max }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">今日创建</div>
                                        <div class="fw-bold" :class="snapshotLimits.today_creates >= snapshotLimits.max_creates ? 'text-danger' : ''">{{ snapshotLimits.today_creates }} / {{ snapshotLimits.max_creates }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">今日恢复</div>
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
                            <small class="text-muted">{{ (backupForm.notes || '').length }}/50</small>
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
                            <pv-button v-if="isAnyBackupSelected" @click="batchDeleteBackups(backupVmId)" :disabled="backupDeleting" size="sm">
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
                                        <th style="width:40px;"><input type="checkbox" class="form-check-input" :checked="isAllBackupsSelected" @change="toggleSelectAllBackups" :disabled="backups.length === 0" style="cursor:pointer"></th>
                                        <th style="width:40px;">#</th>
                                        <th>备份时间</th>
                                        <th>大小</th>
                                        <th>备注</th>
                                        <th style="width:100px;">状态</th>
                                        <th>存储</th>
                                        <th style="width:120px;">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(b, idx) in backups" :key="b.id">
                                        <td><input type="checkbox" class="form-check-input" :checked="backupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleBackupSelect(b.id)" style="cursor:pointer"></td>
                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                        <td class="small text-muted">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                        <td>
                                            <span v-if="b.status === 'completed'" class="badge bg-success">完成</span>
                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">等待中</span>
                                            <span v-else class="badge bg-danger">失败</span>
                                        </td>
                                        <td class="small">{{ b.storage }}</td>
                                        <td>
                                            <pv-button v-if="b.status === 'completed'" @click="restoreBackup(b)" title="恢复此备份" variant="outline" size="sm">恢复</pv-button>
                                            <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteBackup(b.id)" title="删除备份" variant="outline" size="sm">删除</pv-button>
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

<Teleport to="body">
<div class="modal fade" id="lxcPasswordResetModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">重置容器密码</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body">
                <form @submit.prevent="submitLxcPasswordReset">
                    <div class="mb-3">
                        <label class="form-label">新密码</label>
                        <input type="password" class="form-control" v-model="lxcPasswordForm.password" required autocomplete="new-password">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">确认密码</label>
                        <input type="password" class="form-control" v-model="lxcPasswordForm.confirm" required autocomplete="new-password">
                    </div>
                    <pv-button type="submit" variant="primary">重置密码</pv-button>
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
                        <input type="datetime-local" class="form-control" v-model="editLxcForm.expiration_date" step="1">
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
                        <pv-button type="button" @click="removeLxc" variant="warning">移除（仅解绑）</pv-button>
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
                <h5 class="modal-title">快照管理 - {{ lxcSnapshotCtName }}</h5>
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
                                <input type="text" class="form-control form-control-sm" v-model="lxcSnapshotForm.name" placeholder="快照名称（英文、数字、-、_，最少2字符）" @input="filterLxcSnapshotName">
                            </div>
                            <div class="mb-2">
                                <textarea class="form-control form-control-sm" v-model="lxcSnapshotForm.description" rows="2" placeholder="描述（可选）"></textarea>
                            </div>
                            <div class="d-flex justify-content-between align-items-center">
                                <small :class="lxcSnapshotForm.name.length >= 20 ? 'text-danger' : 'text-muted'">{{ lxcSnapshotForm.name.length }}/20</small>
                                <pv-button @click="createLxcSnapshot()" :disabled="!isLxcSnapshotNameValid || lxcSnapshotCreating" size="sm">
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
                                <pv-button v-if="isAnyLxcSnapshotSelected" @click="batchDeleteLxcSnapshots()" :disabled="lxcSnapshotDeleting" size="sm">
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
                                        <pv-button @click="rollbackLxcSnapshot(snap.name)" title="回滚到此快照" variant="outline" size="sm">回滚</pv-button>
                                        <pv-button @click="deleteLxcSnapshot(snap.name)" title="删除快照" variant="outline" size="sm">删除</pv-button>
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
                                        <div class="small text-muted">当前快照数</div>
                                        <div class="fw-bold" :class="lxcSnapshotLimits.current >= lxcSnapshotLimits.max ? 'text-danger' : ''">{{ lxcSnapshotLimits.current }} / {{ lxcSnapshotLimits.max }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">今日创建</div>
                                        <div class="fw-bold" :class="lxcSnapshotLimits.today_creates >= lxcSnapshotLimits.max_creates ? 'text-danger' : ''">{{ lxcSnapshotLimits.today_creates }} / {{ lxcSnapshotLimits.max_creates }}</div>
                                    </div>
                                </div>
                                <div class="col-4">
                                    <div class="border rounded p-2">
                                        <div class="small text-muted">今日恢复</div>
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
                <h5 class="modal-title">备份管理 - {{ lxcBackupCtName }}</h5>
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
                            <small class="text-muted">{{ (lxcBackupForm.notes || '').length }}/50</small>
                        </div>
                        <div class="d-flex justify-content-between align-items-center">
                            <small class="text-muted">停止模式备份 · zstd 压缩</small>
                            <pv-button @click="createLxcBackup()" :disabled="lxcBackupCreating" size="sm">
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
                            <pv-button v-if="isAnyLxcBackupSelected" @click="batchDeleteLxcBackups()" :disabled="lxcBackupDeleting" size="sm">
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
                                        <th style="width:40px;"><input type="checkbox" class="form-check-input" :checked="isAllLxcBackupsSelected" @change="toggleSelectAllLxcBackups" :disabled="lxcBackups.length === 0" style="cursor:pointer"></th>
                                        <th style="width:40px;">#</th>
                                        <th>备份时间</th>
                                        <th>大小</th>
                                        <th>备注</th>
                                        <th style="width:100px;">状态</th>
                                        <th>存储</th>
                                        <th style="width:120px;">操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(b, idx) in lxcBackups" :key="b.id">
                                        <td><input type="checkbox" class="form-check-input" :checked="lxcBackupSelected.has(b.id)" :disabled="b.status === 'running' || b.status === 'pending'" @change="toggleLxcBackupSelect(b.id)" style="cursor:pointer"></td>
                                        <td class="text-muted small">{{ idx + 1 }}</td>
                                        <td class="small">{{ formatDate(b.created_at) }}</td>
                                        <td class="small">{{ b.size ? formatBytes(b.size) : '-' }}</td>
                                        <td class="small text-muted">{{ b.notes ? b.notes.substring(0, 50) : '-' }}</td>
                                        <td>
                                            <span v-if="b.status === 'completed'" class="badge bg-success">完成</span>
                                            <span v-else-if="b.status === 'running'" class="badge bg-warning text-dark">{{ b.progress }}%</span>
                                            <span v-else-if="b.status === 'pending'" class="badge bg-info">等待中</span>
                                            <span v-else class="badge bg-danger">失败</span>
                                        </td>
                                        <td class="small">{{ b.storage }}</td>
                                        <td>
                                            <pv-button v-if="b.status === 'completed'" @click="restoreLxcBackup(b)" title="恢复此备份" variant="outline" size="sm">恢复</pv-button>
                                            <pv-button v-if="b.status !== 'running' && b.status !== 'pending'" @click="deleteLxcBackup(b.id, lxcBackupCtId)" title="删除备份" variant="outline" size="sm">删除</pv-button>
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

<!-- CDK 兑换弹窗 -->
<Teleport to="body">
<div class="modal fade" id="cdkRedeemModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">CDK 兑换</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body" @click="cdkVmDropdownOpen = false; cdkLxcDropdownOpen = false">
                <div v-if="cdkRedeemStep === 'input'">
                    <div class="mb-3">
                        <label class="form-label">CDK 兑换码</label>
                        <input type="text" class="form-control" v-model="cdkRedeemForm.code" placeholder="输入 CDK 码，如 PVE-XXXX-XXXX-XXXX" style="text-transform: uppercase;" @input="cdkRedeemForm.code = cdkRedeemForm.code.toUpperCase()">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">资源类型</label>
                        <div class="d-flex gap-3">
                            <label class="form-check-label d-flex align-items-center gap-1" style="cursor:pointer;">
                                <input type="radio" class="form-check-input" value="vm" v-model="cdkRedeemType">
                                虚拟机
                            </label>
                            <label class="form-check-label d-flex align-items-center gap-1" style="cursor:pointer;">
                                <input type="radio" class="form-check-input" value="lxc" v-model="cdkRedeemType">
                                LXC容器
                            </label>
                        </div>
                    </div>
                    <div class="mb-3" v-if="cdkRedeemType === 'vm'">
                        <label class="form-label" id="cdk-vm-label">选择要续费的虚拟机</label>
                        <div class="custom-select" :class="{ open: cdkVmDropdownOpen }" @click.stop>
                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-vm-label"
                                 @click="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                 @keydown.enter.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                 @keydown.space.prevent="cdkVmDropdownOpen = !cdkVmDropdownOpen"
                                 @keydown.esc="cdkVmDropdownOpen = false">
                                <span v-if="cdkRedeemForm.vm_id">
                                    {{ getRedeemableVmName(cdkRedeemForm.vm_id) }}
                                </span>
                                <span v-else class="custom-select-placeholder">请选择要续费的虚拟机</span>
                            </div>
                            <div class="custom-select-dropdown" role="listbox">
                                <div v-for="vm in userVms" :key="vm.id" class="option" role="option"
                                     :class="{ selected: cdkRedeemForm.vm_id == vm.id }"
                                     @click="cdkRedeemForm.vm_id = vm.id; cdkVmDropdownOpen = false;">
                                    {{ vm.name || 'VM ' + vm.vm_id }}（到期: {{ vm.expiration_date ? formatDate(vm.expiration_date) : '未设置' }}）
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="mb-3" v-if="cdkRedeemType === 'lxc'">
                        <label class="form-label" id="cdk-lxc-label">选择要续费的LXC容器</label>
                        <div class="custom-select" :class="{ open: cdkLxcDropdownOpen }" @click.stop>
                            <div class="custom-select-trigger" role="button" tabindex="0" aria-labelledby="cdk-lxc-label"
                                 @click="cdkLxcDropdownOpen = !cdkLxcDropdownOpen"
                                 @keydown.enter.prevent="cdkLxcDropdownOpen = !cdkLxcDropdownOpen"
                                 @keydown.space.prevent="cdkLxcDropdownOpen = !cdkLxcDropdownOpen"
                                 @keydown.esc="cdkLxcDropdownOpen = false">
                                <span v-if="cdkRedeemForm.container_id">
                                    {{ getRedeemableLxcName(cdkRedeemForm.container_id) }}
                                </span>
                                <span v-else class="custom-select-placeholder">请选择要续费的LXC容器</span>
                            </div>
                            <div class="custom-select-dropdown" role="listbox">
                                <div v-for="ct in userLxcContainers" :key="ct.id" class="option" role="option"
                                     :class="{ selected: cdkRedeemForm.container_id == ct.id }"
                                     @click="cdkRedeemForm.container_id = ct.id; cdkLxcDropdownOpen = false;">
                                    {{ ct.name || 'CT ' + ct.ct_id }}（到期: {{ ct.expiration_date ? formatDate(ct.expiration_date) : '未设置' }}）
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
                <pv-button type="button" @click="redeemCdk" :disabled="!cdkRedeemForm.code || (cdkRedeemType === 'vm' && !cdkRedeemForm.vm_id) || (cdkRedeemType === 'lxc' && !cdkRedeemForm.container_id)" variant="primary">确认兑换</pv-button>
            </div>
            <div class="modal-footer" v-if="cdkRedeemStep === 'result'">
                <pv-button type="button" data-bs-dismiss="modal" @click="cdkRedeemStep = 'input'">完成</pv-button>
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
                <h5 class="modal-title">余额抵扣续费</h5>
                <pv-button type="button" variant="close" @click="renewShow = false"></pv-button>
            </div>
            <div class="modal-body">
                <p v-if="renewResource">续费资源：{{ renewResource.name || '资源' }}</p>
                <p v-if="renewResource">续费价格：¥{{ parseFloat(renewResource.renewal_price||0).toFixed(2) }} / {{ renewPeriodLabel(renewResource.renewal_period) }}</p>
                <p v-if="renewResource && renewResource.expire_time">到期时间：{{ renewResource.expire_time }} <span v-if="renewResource.expire_time" class="text-warning small">({{ daysUntilExpire(renewResource.expire_time) }})</span></p>
                <div class="mb-3">
                    <label class="form-label">计费周期</label>
                    <select class="form-select" v-model="renewFormPeriod" style="max-width:200px;">
                        <option value="month">月付（30天）</option>
                        <option value="quarter">季付（90天）</option>
                        <option value="year">年付（365天）</option>
                    </select>
                </div>
                <div class="mb-3">
                    <label class="form-label">续费数量({{ renewPeriodLabel(renewFormPeriod) }})</label>
                    <input type="number" class="form-control" v-model.number="renewQuantity" min="1" step="1" style="max-width:120px;" @change="renewQuantity = Math.max(1, Math.floor(Math.abs(renewQuantity || 1)))">
                </div>
                <p v-if="renewResource">应付金额：¥{{ calcRenewTotal().toFixed(2) }}</p>
                <p>当前余额：¥{{ walletBalance }}</p>
                <div v-if="renewError" class="alert alert-danger py-2">{{ renewError }}</div>
            </div>
            <div class="modal-footer">
                <pv-button type="button" @click="renewShow = false" variant="secondary">取消</pv-button>
                <pv-button type="button" @click="submitRenew" variant="primary">确认续费</pv-button>
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
                <h5 class="modal-title">重置密码</h5>
                <pv-button type="button" variant="close" @click="vmPwdShow = false"></pv-button>
            </div>
            <div class="modal-body">
                <div v-if="vmPwdCiuser === false" class="alert alert-danger py-2 mb-0">当前虚拟机未配置Cloud-init驱动，请联系管理员！</div>
                <div v-else>
                    <p v-if="vmPwdResource">资源：{{ vmPwdResource.name || ('VM ' + vmPwdResource.vm_id) }}</p>
                    <p v-if="vmPwdResource">账号：{{ vmPwdCiuser }}</p>
                    <div class="mb-3">
                        <label class="form-label">新密码</label>
                        <input type="password" class="form-control" v-model="vmPwdNewPassword" placeholder="至少6位">
                    </div>
                    <div v-if="vmPwdError" class="alert alert-danger py-2">{{ vmPwdError }}</div>
                </div>
            </div>
            <div class="modal-footer" v-if="vmPwdCiuser !== false">
                <pv-button type="button" @click="vmPwdShow = false" variant="secondary">取消</pv-button>
                <pv-button type="button" @click="submitVmPasswordReset" :disabled="!vmPwdNewPassword || vmPwdNewPassword.length < 6" variant="primary">确认重置</pv-button>
            </div>
            <div class="modal-footer" v-if="vmPwdCiuser === false">
                <pv-button type="button" @click="vmPwdShow = false" variant="secondary">关闭</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

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
                <p class="custom-confirm-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;white-space:pre-line;">{{ customConfirmMessage }}</p>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                <button type="button" class="btn btn-outline-light px-3" @click="confirmCancel">取消</button>
                <button type="button" class="btn btn-primary px-3" @click="confirmOk">确定</button>
            </div>
        </div>
    </div>
</div>

<!-- 套餐订购弹窗 -->
<Teleport to="body">
<div class="modal fade" id="orderModal" tabindex="-1" data-bs-focus="false">
    <div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="background:var(--bg-modal)">
        <div class="modal-header"><h5 class="modal-title">确认订购</h5><pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
        <div class="modal-body">
            <div class="mb-3"><strong>{{ orderPackage.name }}</strong></div>
            <div class="mb-3">
                <label class="form-label">计费周期</label>
                <div class="order-period-display">
                    <span class="badge bg-primary">{{ orderForm.period === 'month' ? '月付' : (orderForm.period === 'quarter' ? '季付' : '年付') }}</span>
                    <span class="text-muted ms-2" v-if="orderPackage.monthly_price">¥{{ getPackageFinalPrice(orderPackage, orderForm.period) }} / {{ orderForm.period === 'month' ? '月' : (orderForm.period === 'quarter' ? '季' : '年') }}</span>
                </div>
            </div>
            <div class="mb-3"><label class="form-label">数量</label>
                <input type="number" class="form-control" v-model="orderForm.quantity" min="1" max="10">
            </div>
            <div class="d-flex justify-content-between mb-2">
                <span>当前余额：</span>
                <strong>¥{{ walletBalance }}</strong>
            </div>
            <div class="alert alert-info">应付：<strong>{{ orderTotal }} 元</strong></div>
        </div>
        <div class="modal-footer">
            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
            <pv-button type="button" @click="confirmOrder" :disabled="orderLoading" variant="primary">{{ orderLoading ? '处理中...' : '确认开通' }}</pv-button>
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
                        {{ {1:'系统公告',2:'业务通知',3:'续费提醒',4:'工单消息',5:'客服私聊'}[currentMsg.type] || '消息' }}
                    </span>
                    <span class="text-muted ms-2 small">{{ formatDate(currentMsg.created_at) }}</span>
                </div>
                <div class="message-detail-content" style="line-height:1.7;white-space:pre-wrap;">{{ currentMsg.content }}</div>
            </div>
            <div class="modal-footer">
                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">删除</pv-button>
                <pv-button type="button" data-bs-dismiss="modal">关闭</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

`);
})();
