(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- PVE 节点管理 -->
    <div v-if="activeSection === 'pve-nodes'">
        <div class="module-header">
            <h4 class="module-title">{{ t('nav.pveNodes') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="glass" size="lg" @click="pveNodesPage.openFormModal()">{{ t('nodes.addNode') }}</pv-button>
            </div>
        </div>
        <div v-if="pveNodesPage.loading.value" class="text-center py-4">
            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
        </div>
        <div v-else class="table-container mb-4" style="padding:12px;">
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 table-align-center">
                    <thead>
                        <tr>
                            <th>{{ t('common.name') }}</th>
                            <th>{{ t('nodes.belongRegion') }}</th>
                            <th>{{ t('nodes.belongZone') }}</th>
                            <th>{{ t('nodes.apiHost') }}</th>
                            <th>{{ t('nodes.tlsStatus') }}</th>
                            <th>{{ t('nodes.backupStorage') }}</th>
                            <th>{{ t('nodes.connStatus') }}</th>
                            <th>{{ t('common.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="n in pveNodesPage.nodes.value" :key="n.id">
                            <td>{{ n.name }}</td>
                            <td>{{ n.region_name || '-' }}</td>
                            <td>{{ n.zone_name || '-' }}</td>
                            <td>{{ n.api_host }}</td>
                            <td><span :class="n.strict_tls ? 'text-success' : 'text-muted'">{{ n.strict_tls ? '√' : '×' }}</span></td>
                            <td>{{ n.backup_storage || '-' }}</td>
                            <td>
                                <span v-if="n.last_error" :title="n.last_error" class="text-danger">{{ t('nodes.connFailed') }}</span>
                                <span v-else-if="n.latency_ms != null" class="text-success">{{ n.latency_ms }}ms</span>
                                <span v-else class="text-muted">{{ t('nodes.connNone') }}</span>
                            </td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" variant="outline" @click="pveNodesPage.rowTest(n)">{{ t('nodes.rowTest') }}</pv-button>
                                    <pv-button size="sm" @click="pveNodesPage.openFormModal(n)">{{ t('common.edit') }}</pv-button>
                                    <pv-button size="sm" variant="danger" @click="pveNodesPage.deleteNode(n)">{{ t('common.delete') }}</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="pveNodesPage.nodes.value.length === 0">
                            <td colspan="8" class="text-center text-muted">{{ t('nodes.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 新增/编辑节点表单弹窗 -->
        <div class="modal fade" id="pveNodeFormModal" tabindex="-1">
            <div class="modal-dialog modal-xl"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ pveNodesPage.editing.value ? t('nodes.editPveNode') : t('nodes.addPveNode') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <form @submit.prevent="pveNodesPage.saveNode()">
                        <!-- 基础信息 -->
                        <h6 class="section-label">{{ t('nodes.baseInfo') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label">{{ t('common.name') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="pveNodesPage.form.name" :placeholder="t('nodes.nodeNamePh')">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.belongZone') }} <span class="text-danger">*</span></label>
                                <select class="form-select" v-model="pveNodesPage.form.zone_id">
                                    <option value="">{{ t('nodes.selectZone') }}</option>
                                    <option v-for="z in pveNodesPage.formOptions.zones" :key="z.id" :value="z.id">{{ z.name }}{{ z.region_name ? ' (' + z.region_name + ')' : '' }}</option>
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.relatedIkuaiNode') }} <span class="text-danger">*</span></label>
                                <select class="form-select" v-model="pveNodesPage.form.ikuai_node_id">
                                    <option value="">{{ t('nodes.selectIkuai') }}</option>
                                    <option v-for="i in pveNodesPage.formOptions.ikua_nodes" :key="i.id" :value="i.id">{{ i.name }}{{ i.version ? ' (' + i.version.toUpperCase() + ')' : '' }}</option>
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.apiHost') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="pveNodesPage.form.api_host" :placeholder="t('nodes.apiHostPh')">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.apiToken') }} <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" v-model="pveNodesPage.form.api_token" :placeholder="pveNodesPage.editing.value ? t('settings.keepBlank') : ''" autocomplete="off">
                            </div>
                            <div class="col-md-4">
                                <div class="form-check form-switch mt-4">
                                    <input class="form-check-input" type="checkbox" id="pveNodeStrictTls" v-model="pveNodesPage.form.strict_tls">
                                    <label class="form-check-label" for="pveNodeStrictTls">{{ t('settings.tlsStrict') }}</label>
                                </div>
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- SSH -->
                        <h6 class="section-label">{{ t('nodes.ssh') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label">{{ t('nodes.sshHost') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="pveNodesPage.form.ssh_host">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('nodes.sshPort') }} <span class="text-danger">*</span></label>
                                <input type="number" class="form-control" v-model.number="pveNodesPage.form.ssh_port" min="1" max="65535">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('nodes.sshUser') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="pveNodesPage.form.ssh_user">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('nodes.sshPassword') }} <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" v-model="pveNodesPage.form.ssh_password" :placeholder="pveNodesPage.editing.value ? t('settings.keepBlank') : ''" autocomplete="off">
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- 备份存储 -->
                        <h6 class="section-label">{{ t('nodes.backupStorage') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">{{ t('nodes.backupStorage') }} <span class="text-danger">*</span></label>
                                <select class="form-select" v-model="pveNodesPage.form.backup_storage">
                                    <option value="">{{ t('nodes.selectStorage') }}</option>
                                    <option v-for="s in pveNodesPage.storages.value" :key="s.storage || s" :value="s.storage || s">{{ s.storage || s }}</option>
                                </select>
                                <small class="text-muted" v-if="pveNodesPage.storagesLoading.value">{{ t('nodes.storagesLoading') }}</small>
                            </div>
                        </div>

                        <div class="d-flex gap-2 mt-4">
                            <pv-button type="button" variant="outline" @click="pveNodesPage.testConnection()" :disabled="pveNodesPage.testing.value">
                                {{ pveNodesPage.testing.value ? t('settings.testing') : t('settings.testConn') }}
                            </pv-button>
                            <pv-button type="submit" variant="primary" :disabled="pveNodesPage.saving.value">
                                {{ pveNodesPage.saving.value ? t('common.saving') : t('nodes.saveNodeBtn') }}
                            </pv-button>
                        </div>
                    </form>
                </div>
            </div></div>
        </div>

        <!-- 快照 & 备份策略 -->
        <div class="card mt-4">
            <div class="card-header"><h5 class="mb-0">{{ t('nodes.snapBackupTitle') }}</h5></div>
            <div class="card-body">
                <div class="row g-4">
                    <!-- 快照配置 -->
                    <div class="col-md-6">
                        <h6 class="section-label">{{ t('nodes.snapConfig') }}</h6>
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label">{{ t('settings.snapBackup.snapPerVm') }}</label>
                                <input type="number" class="form-control" v-model.number="snapshotConfig.max_per_vm" min="1">
                            </div>
                            <div class="col-12">
                                <label class="form-label">{{ t('settings.snapBackup.snapDailyCreate') }}</label>
                                <input type="number" class="form-control" v-model.number="snapshotConfig.daily_create_limit" min="1">
                            </div>
                            <div class="col-12">
                                <label class="form-label">{{ t('settings.snapBackup.snapDailyRestore') }}</label>
                                <input type="number" class="form-control" v-model.number="snapshotConfig.daily_restore_limit" min="1">
                            </div>
                            <div class="col-12">
                                <pv-button variant="glass" @click="saveSnapshotConfig()">{{ t('settings.snapBackup.saveSnap') }}</pv-button>
                            </div>
                        </div>
                    </div>
                    <!-- 备份配置 -->
                    <div class="col-md-6">
                        <h6 class="section-label">{{ t('nodes.backupConfig') }}</h6>
                        <div class="row g-3">
                            <div class="col-12">
                                <!-- 备份存储按节点配置（各 PVE 节点表单的「备份存储」），无需全局默认 -->
                                <p class="text-muted small mb-1">{{ t('nodes.backupStorageByNode') }}</p>
                            </div>
                            <div class="col-6">
                                <label class="form-label">{{ t('settings.snapBackup.backupPerVm') }}</label>
                                <input type="number" class="form-control" v-model.number="backupConfigForm.max_per_vm" min="1">
                            </div>
                            <div class="col-6">
                                <label class="form-label">{{ t('settings.snapBackup.backupDaily') }}</label>
                                <input type="number" class="form-control" v-model.number="backupConfigForm.daily_limit" min="1">
                            </div>
                            <div class="col-12">
                                <pv-button variant="glass" @click="saveBackupConfig()">{{ t('settings.snapBackup.saveBackup') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
                <p class="text-muted small mt-3 mb-0">{{ t('settings.snapBackup.limitUserOnlyAdminFree') }}</p>
            </div>
        </div>
    </div>
    `);
})();
