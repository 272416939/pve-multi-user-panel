(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- OS 模板管理 -->
    <div v-if="activeSection === 'templates-os'">
        <div class="module-header">
            <h4 class="module-title">{{ t('admin.ostemplate.title') }}</h4>
            <pv-button variant="primary" @click="osTemplatePage.openForm()">{{ t('admin.ostemplate.addTemplate') }}</pv-button>
        </div>
        <div class="table-container mb-4" style="padding:12px;">
            <div class="text-muted mb-2" style="font-size:0.85rem;">{{ t('admin.ostemplate.dragPrefix') }} <span class="drag-handle">⠿</span> {{ t('admin.ostemplate.dragSuffix') }}</div>
            <div class="table-responsive">
                <table id="osTemplateTable" class="table table-hover align-middle table-align-center">
                    <thead class="table-light">
                        <tr>
                            <th class="drag-handle-th"></th><th>ID</th><th>{{ t('common.name') }}</th><th>{{ t('admin.ostemplate.osType') }}</th><th>{{ t('admin.ostemplate.osVersion') }}</th><th>{{ t('admin.ostemplate.pveTemplateVmid') }}</th><th>{{ t('admin.ostemplate.targetStorage') }}</th><th>{{ t('admin.ostemplate.diskFormat') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody @dragover="osTemplatePage.handleContainerDragOver($event)" @drop="osTemplatePage.handleDropOnContainer($event)">
                        <tr v-for="row in (osTemplatePage?.osTemplates?.value) || []" :key="row.id"
                            :data-drag-id="row.id"
                            :class="{ 'row-dragging': osTemplatePage.dragState.draggingId === row.id }"
                            @dragover="osTemplatePage.handleDragOver($event, row.id)"
                            @dragleave="osTemplatePage.handleDragLeave($event, row.id)"
                            @drop="osTemplatePage.handleDrop($event, row.id)">
                            <td class="drag-handle-cell">
                                <span class="drag-handle"
                                    draggable="true"
                                    @dragstart="osTemplatePage.handleDragStart($event, row.id)"
                                    @dragend="osTemplatePage.handleDragEnd()"
                                    @touchstart="osTemplatePage.handleTouchStart($event, row.id)"
                                    @touchmove="osTemplatePage.handleTouchMove($event)"
                                    @touchend="osTemplatePage.handleTouchEnd()"
                                    @touchcancel="osTemplatePage.handleTouchEnd()">⠿</span>
                            </td>
                            <td>{{ row.id }}</td>
                            <td>{{ row.name }}</td>
                            <td>{{ row.os_type }}</td>
                            <td>{{ row.os_version }}</td>
                            <td>{{ row.template_vmid }}</td>
                            <td>{{ row.target_storage }}</td>
                            <td>{{ row.disk_format || t('admin.ostemplate.auto') }}</td>
                            <td><span :class="row.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ row.status === 'active' ? t('admin.common.enabled') : (row.status === 'maintenance' ? t('admin.common.maintenance') : t('admin.common.deprecated')) }}</span></td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" @click="osTemplatePage.openForm(row)">{{ t('common.edit') }}</pv-button>
                                    <pv-button size="sm" variant="danger" @click="osTemplatePage.deleteRow(row)">{{ t('common.delete') }}</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="(osTemplatePage?.osTemplates?.value || []).length === 0">
                            <td colspan="10" class="text-center text-muted">{{ t('admin.ostemplate.noTemplates') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
        <!-- 新增/编辑模态框 -->
        <div class="modal fade" id="osTemplateFormModal" tabindex="-1">
            <div class="modal-dialog modal-lg"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ osTemplatePage.formData.id ? t('admin.ostemplate.editTitle') : t('admin.ostemplate.newTitle') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">{{ t('common.name') }} <span class="text-danger">*</span></label>
                            <input class="form-control" v-model="osTemplatePage.formData.name">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ t('admin.ostemplate.pveTemplateVm') }} <span class="text-danger">*</span></label>
                            <select class="form-select" v-model.number="osTemplatePage.formData.template_vmid" @change="osTemplatePage.onTemplateVmidChange(osTemplatePage.formData.template_vmid)" :disabled="osTemplatePage.pveConfigLoading.value">
                                <option value="">{{ t('admin.ostemplate.selectVmPlaceholder') }}</option>
                                <option v-for="v in osTemplatePage.pveTemplateVms.value" :key="v.vmid" :value="v.vmid">{{ v.name || 'VM ' + v.vmid }} ({{ v.vmid }})</option>
                            </select>
                            <div class="form-text text-muted" v-if="osTemplatePage.pveConfigLoading.value">{{ t('admin.ostemplate.readingPveConfig') }}</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.osType') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.os_type" readonly>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.osVersion') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.os_version" readonly>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.arch') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.arch" readonly>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.targetStorage') }}</label>
                            <select class="form-select" v-model="osTemplatePage.formData.target_storage">
                                <option value="">{{ t('admin.ostemplate.selectStorage') }}</option>
                                <option v-for="s in osTemplatePage.allStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }}{{ s.maxdisk ? ' (' + (s.maxdisk/1073741824).toFixed(0) + 'GB)' : '' }}</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.targetDiskFormat') }}</label>
                            <select class="form-select" v-model="osTemplatePage.formData.disk_format">
                                <option value="">{{ t('admin.ostemplate.autoFormat') }}</option>
                                <option value="raw">raw</option>
                                <option value="qcow2">qcow2</option>
                                <option value="vmdk">vmdk</option>
                            </select>
                            <div class="form-text text-muted">{{ t('admin.ostemplate.formatHint') }}</div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.ciuser') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.ciuser">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.icon') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.icon">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">{{ t('admin.ostemplate.sortOrder') }}</label>
                            <input class="form-control" type="number" v-model="osTemplatePage.formData.sort_order">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ t('common.status') }}</label>
                            <select class="form-select" v-model="osTemplatePage.formData.status">
                                <option value="active">{{ t('admin.common.enabled') }}</option>
                                <option value="maintenance">{{ t('admin.ostemplate.maintenance') }}</option>
                                <option value="deprecated">{{ t('admin.common.deprecated') }}</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ t('admin.ostemplate.enable') }}</label>
                            <select class="form-select" v-model="osTemplatePage.formData.enabled">
                                <option :value="1">{{ t('common.yes') }}</option>
                                <option :value="0">{{ t('common.no') }}</option>
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label">{{ t('admin.ostemplate.allowedPackages') }}</label>
                            <input class="form-control" v-model="osTemplatePage.formData.allowed_package_ids">
                        </div>
                        <div class="col-12">
                            <label class="form-label">{{ t('common.description') }}</label>
                            <textarea class="form-control" rows="3" v-model="osTemplatePage.formData.description"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                    <pv-button type="button" variant="primary" @click="osTemplatePage.save()" :loading="osTemplatePage.saving">{{ t('common.save') }}</pv-button>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();