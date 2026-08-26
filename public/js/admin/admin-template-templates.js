(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'templates'">

                    <!-- VM 模板管理 -->
                    <div v-if="activeTabTemplates === 'vm'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.templates.vmTitle') }}</h4>
                            <pv-button @click="templatePage.openVmTemplateForm(null)" size="sm">{{ t('admin.templates.newVm') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr>
                                        <th>ID</th><th>{{ t('common.name') }}</th><th>{{ t('admin.assetNode') }}</th><th>{{ t('admin.templates.systemDiskGB') }}</th><th>CPU</th><th>{{ t('admin.common.memory') }}</th><th>{{ t('admin.templates.targetStorage') }}</th><th>{{ t('admin.templates.cloneMode') }}</th><th>{{ t('admin.templates.networkBridge') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for='row in templatePage.vmTemplates.value' :key='row.id'>
                                        <td>{{ row.id }}</td>
                                        <td>{{ row.name }}</td>
                                        <td>{{ row.pve_node_name || '-' }}</td>
                                        <td>{{ row.disk_size }}</td>
                                        <td>{{ row.cores }}{{ t('dash.detail.coresSuffix') }}</td>
                                        <td>{{ row.memory }}MB</td>
                                        <td>{{ row.target_storage }}</td>
                                        <td>{{ row.clone_mode === 'full' ? t('admin.templates.cloneFull') : t('admin.templates.cloneLink') }}</td>
                                        <td>{{ row.network_bridge }}</td>
                                        <td><span :class="row.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ row.status === 'active' ? t('admin.common.enabled') : t('admin.common.disabled') }}</span></td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <pv-button @click="templatePage.openVmTemplateForm(row)" variant="outline">{{ t('common.edit') }}</pv-button>
                                                <pv-button @click="templatePage.duplicateVmTemplate(row)" variant="outline">{{ t('common.copy') }}</pv-button>
                                                <pv-button @click="templatePage.deleteVmTemplate(row.id)" variant="outline-danger">{{ t('common.delete') }}</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr v-if="templatePage.vmTemplates.value.length === 0"><td colspan="11" class="text-center text-muted">{{ t('admin.templates.noVm') }}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                    <!-- LXC 模板管理 -->
                    <div v-if="activeTabTemplates === 'lxc'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.templates.lxcTitle') }}</h4>
                            <pv-button @click="templatePage.openLxcTemplateForm(null)" size="sm">{{ t('admin.templates.newLxc') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr>
                                        <th>ID</th><th>{{ t('common.name') }}</th><th>{{ t('admin.assetNode') }}</th><th>{{ t('admin.templates.templatePath') }}</th><th>{{ t('admin.templates.storage') }}</th><th>CPU</th><th>{{ t('admin.common.memory') }}</th><th>{{ t('admin.common.disk') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for='row in templatePage.lxcTemplates.value' :key='row.id'>
                                        <td>{{ row.id }}</td>
                                        <td>{{ row.name }}</td>
                                        <td>{{ row.pve_node_name || '-' }}</td>
                                        <td>{{ row.ostemplate.split('/').pop() }}</td>
                                        <td>{{ row.storage }}</td>
                                        <td>{{ row.cores }}{{ t('dash.detail.coresSuffix') }}</td>
                                        <td>{{ row.memory }}MB</td>
                                        <td>{{ row.disk_size }}GB</td>
                                        <td><span :class="row.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ row.status === 'active' ? t('admin.common.enabled') : t('admin.common.disabled') }}</span></td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <pv-button @click="templatePage.openLxcTemplateForm(row)" variant="outline">{{ t('common.edit') }}</pv-button>
                                                <pv-button @click="templatePage.duplicateLxcTemplate(row)" variant="outline">{{ t('common.copy') }}</pv-button>
                                                <pv-button @click="templatePage.deleteLxcTemplate(row.id)" variant="outline-danger">{{ t('common.delete') }}</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr v-if="templatePage.lxcTemplates.value.length === 0"><td colspan="10" class="text-center text-muted">{{ t('admin.templates.noLxc') }}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                </div>
                <!-- end 模板管理区域 -->

                <!-- 系统设置区域 -->
                
`);
})();
