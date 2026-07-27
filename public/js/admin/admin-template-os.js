(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- OS 模板管理 -->
    <div v-if="activeSection === 'templates-os'">
        <div class="admin-card">
            <div class="card-header">
                <h3>可切换系统模板</h3>
                <pv-button variant="primary" @click="osTemplatePage.openForm()">新增模板</pv-button>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle table-align-center">
                    <thead class="table-light">
                        <tr>
                            <th>ID</th><th>名称</th><th>OS 类型</th><th>版本</th><th>PVE 模板 VMID</th><th>目标存储</th><th>切换价格</th><th>状态</th><th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="t in (osTemplatePage?.osTemplates?.value) || []" :key="t.id">
                            <td>{{ t.id }}</td>
                            <td>{{ t.name }}</td>
                            <td>{{ t.os_type }}</td>
                            <td>{{ t.os_version }}</td>
                            <td>{{ t.template_vmid }}</td>
                            <td>{{ t.target_storage }}</td>
                            <td>{{ t.switch_price }}</td>
                            <td><span :class="t.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ t.status === 'active' ? '启用' : (t.status === 'maintenance' ? '维护' : '已弃用') }}</span></td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" @click="osTemplatePage.openForm(t)">编辑</pv-button>
                                    <pv-button size="sm" variant="danger" @click="osTemplatePage.deleteRow(t)">删除</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="(osTemplatePage?.osTemplates?.value || []).length === 0">
                            <td colspan="9" class="text-center text-muted">暂无系统模板</td>
                        </tr>
                    </tbody>
                </table>
            </div>
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
                            <label class="form-label">PVE 模板 VM <span class="text-danger">*</span></label>
                            <select class="form-select" v-model.number="osTemplatePage.formData.template_vmid" @change="osTemplatePage.onTemplateVmidChange(osTemplatePage.formData.template_vmid)" :disabled="osTemplatePage.pveConfigLoading.value">
                                <option value="">请选择 PVE 模板 VM</option>
                                <option v-for="v in osTemplatePage.pveTemplateVms.value" :key="v.vmid" :value="v.vmid">{{ v.name || 'VM ' + v.vmid }} ({{ v.vmid }})</option>
                            </select>
                            <div class="form-text text-muted" v-if="osTemplatePage.pveConfigLoading.value">正在读取模板配置...</div>
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
                            <label class="form-label">目标存储</label>
                            <select class="form-select" v-model="osTemplatePage.formData.target_storage">
                                <option value="">请选择目标存储</option>
                                <option v-for="s in osTemplatePage.allStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }}{{ s.maxdisk ? ' (' + (s.maxdisk/1073741824).toFixed(0) + 'GB)' : '' }}</option>
                            </select>
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