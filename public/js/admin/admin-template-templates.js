(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'templates'">

                    <!-- VM 模板管理 -->
                    <div v-if="activeTabTemplates === 'vm'" class="tab-panel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">VM 模板管理</h5>
                            <pv-button @click="templatePage.openVmTemplateForm(null)" size="sm">+ 新建 VM 模板</pv-button>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th>ID</th><th>名称</th><th>模板 VM</th><th>CPU</th><th>内存</th><th>目标存储</th><th>克隆模式</th><th>网桥</th><th>状态</th><th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="t in templatePage.vmTemplates.value" :key="t.id">
                                        <td>{{ t.id }}</td>
                                        <td>{{ t.name }}</td>
                                        <td>{{ t.template_vmid }}</td>
                                        <td>{{ t.cores }}核</td>
                                        <td>{{ t.memory }}MB</td>
                                        <td>{{ t.target_storage }}</td>
                                        <td>{{ t.clone_mode === 'full' ? '完整克隆' : '链接克隆' }}</td>
                                        <td>{{ t.network_bridge }}</td>
                                        <td><span :class="t.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ t.status === 'active' ? '启用' : '停用' }}</span></td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <pv-button @click="templatePage.openVmTemplateForm(t)" variant="outline">编辑</pv-button>
                                                <pv-button @click="templatePage.deleteVmTemplate(t.id)" variant="outline-danger">删除</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr v-if="templatePage.vmTemplates.value.length === 0"><td colspan="10" class="text-center text-muted">暂无 VM 模板</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- LXC 模板管理 -->
                    <div v-if="activeTabTemplates === 'lxc'" class="tab-panel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">LXC 模板管理</h5>
                            <pv-button @click="templatePage.openLxcTemplateForm(null)" size="sm">+ 新建 LXC 模板</pv-button>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr>
                                        <th>ID</th><th>名称</th><th>模板路径</th><th>存储</th><th>CPU</th><th>内存</th><th>磁盘</th><th>状态</th><th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="t in templatePage.lxcTemplates.value" :key="t.id">
                                        <td>{{ t.id }}</td>
                                        <td>{{ t.name }}</td>
                                        <td>{{ t.ostemplate.split('/').pop() }}</td>
                                        <td>{{ t.storage }}</td>
                                        <td>{{ t.cores }}核</td>
                                        <td>{{ t.memory }}MB</td>
                                        <td>{{ t.disk_size }}GB</td>
                                        <td><span :class="t.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ t.status === 'active' ? '启用' : '停用' }}</span></td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <pv-button @click="templatePage.openLxcTemplateForm(t)" variant="outline">编辑</pv-button>
                                                <pv-button @click="templatePage.deleteLxcTemplate(t.id)" variant="outline-danger">删除</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                    <tr v-if="templatePage.lxcTemplates.value.length === 0"><td colspan="9" class="text-center text-muted">暂无 LXC 模板</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
                <!-- end 模板管理区域 -->

                <!-- 系统设置区域 -->
                
`);
})();
