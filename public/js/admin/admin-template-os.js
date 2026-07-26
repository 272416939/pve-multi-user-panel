(function () {
    window.__adminTemplateParts.push(`
    <!-- OS 模板管理 -->
    <div v-if="activeSection === 'templates-os'">
        <div class="admin-card">
            <div class="card-header">
                <h3>可切换系统模板</h3>
                <pv-button variant="primary" @click="osTemplatePage.openForm()">新增模板</pv-button>
            </div>
            <pv-table :data="(osTemplatePage?.osTemplates?.value) || []" :columns="[
                { key: 'id', label: 'ID' },
                { key: 'name', label: '名称' },
                { key: 'os_type', label: 'OS 类型' },
                { key: 'os_version', label: '版本' },
                { key: 'template_vmid', label: 'PVE 模板 VMID' },
                { key: 'system_disk_size', label: '系统盘(GB)' },
                { key: 'target_storage', label: '目标存储' },
                { key: 'switch_price', label: '切换价格' },
                { key: 'status', label: '状态' },
                { key: 'actions', label: '操作' }
            ]">
                <template #actions="{ row }">
                    <pv-button size="sm" @click="osTemplatePage.openForm(row)">编辑</pv-button>
                    <pv-button size="sm" variant="danger" @click="osTemplatePage.deleteRow(row)">删除</pv-button>
                </template>
            </pv-table>
        </div>
        <!-- 新增/编辑模态框 -->
        <div class="modal fade" id="osTemplateFormModal" tabindex="-1">
            <div class="modal-dialog modal-lg"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ osTemplatePage.editId ? '编辑系统模板' : '新增系统模板' }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <label class="form-label">名称 <span class="text-danger">*</span></label>
                            <input class="form-control" v-model="osTemplatePage.formData.name">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">PVE 模板 VMID <span class="text-danger">*</span></label>
                            <input class="form-control" type="number" v-model="osTemplatePage.formData.template_vmid" min="100">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">OS 类型</label>
                            <select class="form-select" v-model="osTemplatePage.formData.os_type">
                                <option value="">请选择</option>
                                <option value="debian">Debian</option>
                                <option value="ubuntu">Ubuntu</option>
                                <option value="centos">CentOS</option>
                                <option value="windows">Windows</option>
                                <option value="arch">Arch Linux</option>
                                <option value="alpine">Alpine</option>
                                <option value="other">其他</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">OS 版本</label>
                            <input class="form-control" v-model="osTemplatePage.formData.os_version">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">架构</label>
                            <select class="form-select" v-model="osTemplatePage.formData.arch">
                                <option value="x86_64">x86_64</option>
                                <option value="aarch64">aarch64</option>
                            </select>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">系统盘容量(GB)</label>
                            <input class="form-control" type="number" v-model="osTemplatePage.formData.system_disk_size" min="5" max="500">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">目标存储</label>
                            <input class="form-control" v-model="osTemplatePage.formData.target_storage">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">切换价格(元)</label>
                            <input class="form-control" type="number" step="0.01" v-model="osTemplatePage.formData.switch_price" min="0">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">cloud-init 用户</label>
                            <input class="form-control" v-model="osTemplatePage.formData.ciuser">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">图标标识</label>
                            <input class="form-control" v-model="osTemplatePage.formData.icon">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label">排序</label>
                            <input class="form-control" type="number" v-model="osTemplatePage.formData.sort_order">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">状态</label>
                            <select class="form-select" v-model="osTemplatePage.formData.status">
                                <option value="active">启用</option>
                                <option value="maintenance">维护中</option>
                                <option value="deprecated">已弃用</option>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">启用</label>
                            <select class="form-select" v-model="osTemplatePage.formData.enabled">
                                <option :value="1">是</option>
                                <option :value="0">否</option>
                            </select>
                        </div>
                        <div class="col-12">
                            <label class="form-label">允许的套餐 ID（逗号分隔，空=全部允许）</label>
                            <input class="form-control" v-model="osTemplatePage.formData.allowed_package_ids">
                        </div>
                        <div class="col-12">
                            <label class="form-label">描述</label>
                            <textarea class="form-control" rows="3" v-model="osTemplatePage.formData.description"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                    <pv-button type="button" variant="primary" @click="osTemplatePage.save()" :loading="osTemplatePage.saving">保存</pv-button>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();