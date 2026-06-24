(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'packages'">

                    <div v-if="activeTabPackages === 'vm'" class="tab-panel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">VM 套餐管理</h5>
                            <div>
                                <pv-button @click="packagePage.openVmGroupForm(null)" size="sm" variant="outline">分组管理</pv-button>
                                <pv-button @click="packagePage.openVmPackageForm(null)" size="sm">+ 新建套餐</pv-button>
                            </div>
                        </div>
                        <!-- 分组列表 -->
                        <div v-if="packagePage.vmPackageGroups.value.length > 0" class="mb-3 group-badges-container" @dragover="packagePage.handleContainerDragOver($event, 'group-vm')" @drop="packagePage.handleDropOnContainer($event, 'group-vm')">
                            <span v-for="g in packagePage.vmPackageGroups.value" :key="g.id"
                                class="badge bg-info me-2 mb-1 group-badge-draggable"
                                draggable="true"
                                :data-drag-id="g.id" data-drag-type="group-vm"
                                :class="{ 'row-dragging': packagePage.dragState.draggingId === g.id && packagePage.dragState.draggingType === 'group-vm' }"
                                @dragstart="packagePage.handleDragStart($event, g.id, 'group-vm')"
                                @dragover="packagePage.handleDragOver($event, g.id, 'group-vm')"
                                @dragleave="packagePage.handleDragLeave($event, g.id)"
                                @drop="packagePage.handleDrop($event, g.id, 'group-vm')"
                                @dragend="packagePage.handleDragEnd()"
                                @touchstart="packagePage.handleTouchStart($event, g.id, 'group-vm')"
                                @touchmove="packagePage.handleTouchMove($event)"
                                @touchend="packagePage.handleTouchEnd($event)"
                                @touchcancel="packagePage.handleTouchEnd($event)">
                                {{ g.name }}
                                <pv-button @click="packagePage.openVmGroupForm(g)" size="sm" variant="link" class="text-white p-0 ms-1">编辑</pv-button>
                                <pv-button @click="packagePage.deleteVmGroup(g.id)" size="sm" variant="link" class="text-white p-0 ms-1">删除</pv-button>
                            </span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr><th>ID</th><th>套餐名</th><th>分组</th><th>模板</th><th>CPU</th><th>内存</th><th>磁盘</th><th>月付</th><th>季付折扣</th><th>年付折扣</th><th>库存</th><th>已售</th><th>状态</th><th>操作</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'vm')" @drop="packagePage.handleDropOnContainer($event, 'vm')">
                                    <tr v-for="p in packagePage.vmPackages.value" :key="p.id"
                                        draggable="true"
                                        :data-drag-id="p.id" data-drag-type="vm"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === p.id && packagePage.dragState.draggingType === 'vm' }"
                                        @dragstart="packagePage.handleDragStart($event, p.id, 'vm')"
                                        @dragover="packagePage.handleDragOver($event, p.id, 'vm')"
                                        @dragleave="packagePage.handleDragLeave($event, p.id)"
                                        @drop="packagePage.handleDrop($event, p.id, 'vm')"
                                        @dragend="packagePage.handleDragEnd()"
                                        @touchstart="packagePage.handleTouchStart($event, p.id, 'vm')"
                                        @touchmove="packagePage.handleTouchMove($event)"
                                        @touchend="packagePage.handleTouchEnd($event)"
                                        @touchcancel="packagePage.handleTouchEnd($event)">
                                        <td>{{ p.id }}</td>
                                        <td>{{ p.name }}</td>
                                        <td>{{ p.group_name || '-' }}</td>
                                        <td>
                                            <span v-if="p.template_name">{{ p.template_name }}</span>
                                            <span v-else class="text-secondary">模板已删除</span>
                                        </td>
                                        <td>{{ p.cores }}核</td>
                                        <td>{{ p.memory }}MB</td>
                                        <td>{{ p.disk_size }}GB</td>
                                        <td>{{ p.monthly_price }}元</td>
                                        <td>{{ p.quarterly_discount || 0 }}%</td>
                                        <td>{{ p.yearly_discount || 0 }}%</td>
                                        <td>{{ p.stock === -1 || p.stock === null ? '不限' : p.stock }}</td>
                                        <td>{{ p.sold_count || 0 }}</td>
                                        <td><span :class="p.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ p.status === 'active' ? '启用' : '停用' }}</span></td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                            <pv-button @click="packagePage.openVmPackageForm(p)" variant="outline">编辑</pv-button>
                            <pv-button @click="packagePage.restockVmPackage(p)" variant="outline">补货</pv-button>
                            <pv-button @click="packagePage.deleteVmPackage(p.id)" variant="outline">删除</pv-button>
                        </div>
                                        </td>
                                    </tr>
                                    <tr v-if="packagePage.vmPackages.value.length === 0"><td colspan="14" class="text-center text-muted">暂无套餐</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div v-if="activeTabPackages === 'lxc'" class="tab-panel">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="mb-0">LXC 套餐管理</h5>
                            <div>
                                <pv-button @click="packagePage.openLxcGroupForm(null)" size="sm" variant="outline">分组管理</pv-button>
                                <pv-button @click="packagePage.openLxcPackageForm(null)" size="sm">+ 新建套餐</pv-button>
                            </div>
                        </div>
                        <!-- 分组列表 -->
                        <div v-if="packagePage.lxcPackageGroups.value.length > 0" class="mb-3 group-badges-container" @dragover="packagePage.handleContainerDragOver($event, 'group-lxc')" @drop="packagePage.handleDropOnContainer($event, 'group-lxc')">
                            <span v-for="g in packagePage.lxcPackageGroups.value" :key="g.id"
                                class="badge bg-info me-2 mb-1 group-badge-draggable"
                                draggable="true"
                                :data-drag-id="g.id" data-drag-type="group-lxc"
                                :class="{ 'row-dragging': packagePage.dragState.draggingId === g.id && packagePage.dragState.draggingType === 'group-lxc' }"
                                @dragstart="packagePage.handleDragStart($event, g.id, 'group-lxc')"
                                @dragover="packagePage.handleDragOver($event, g.id, 'group-lxc')"
                                @dragleave="packagePage.handleDragLeave($event, g.id)"
                                @drop="packagePage.handleDrop($event, g.id, 'group-lxc')"
                                @dragend="packagePage.handleDragEnd()"
                                @touchstart="packagePage.handleTouchStart($event, g.id, 'group-lxc')"
                                @touchmove="packagePage.handleTouchMove($event)"
                                @touchend="packagePage.handleTouchEnd($event)"
                                @touchcancel="packagePage.handleTouchEnd($event)">
                                {{ g.name }}
                                <pv-button @click="packagePage.openLxcGroupForm(g)" size="sm" variant="link" class="text-white p-0 ms-1">编辑</pv-button>
                                <pv-button @click="packagePage.deleteLxcGroup(g.id)" size="sm" variant="link" class="text-white p-0 ms-1">删除</pv-button>
                            </span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-hover align-middle">
                                <thead class="table-light">
                                    <tr><th>ID</th><th>套餐名</th><th>分组</th><th>模板</th><th>CPU</th><th>内存</th><th>Swap</th><th>磁盘</th><th>月付</th><th>季付折扣</th><th>年付折扣</th><th>库存</th><th>已售</th><th>状态</th><th>操作</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'lxc')" @drop="packagePage.handleDropOnContainer($event, 'lxc')">
                                    <tr v-for="p in packagePage.lxcPackages.value" :key="p.id"
                                        draggable="true"
                                        :data-drag-id="p.id" data-drag-type="lxc"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === p.id && packagePage.dragState.draggingType === 'lxc' }"
                                        @dragstart="packagePage.handleDragStart($event, p.id, 'lxc')"
                                        @dragover="packagePage.handleDragOver($event, p.id, 'lxc')"
                                        @dragleave="packagePage.handleDragLeave($event, p.id)"
                                        @drop="packagePage.handleDrop($event, p.id, 'lxc')"
                                        @dragend="packagePage.handleDragEnd()"
                                        @touchstart="packagePage.handleTouchStart($event, p.id, 'lxc')"
                                        @touchmove="packagePage.handleTouchMove($event)"
                                        @touchend="packagePage.handleTouchEnd($event)"
                                        @touchcancel="packagePage.handleTouchEnd($event)">
                                        <td>{{ p.id }}</td><td>{{ p.name }}</td><td>{{ p.group_name || '-' }}</td><td><span v-if="p.template_name">{{ p.template_name }}</span><span v-else class="text-secondary">模板已删除</span></td>
                                        <td>{{ p.cores }}核</td><td>{{ p.memory }}MB</td><td>{{ p.swap }}MB</td><td>{{ p.disk_size }}GB</td>
                                        <td>{{ p.monthly_price }}元</td><td>{{ p.quarterly_discount || 0 }}%</td><td>{{ p.yearly_discount || 0 }}%</td>
                                        <td>{{ p.stock === -1 || p.stock === null ? '不限' : p.stock }}</td>
                                        <td>{{ p.sold_count || 0 }}</td>
                                        <td><span :class="p.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ p.status === 'active' ? '启用' : '停用' }}</span></td>
                                        <td>
                        <div class="btn-group btn-group-sm">
                            <pv-button @click="packagePage.openLxcPackageForm(p)" variant="outline">编辑</pv-button>
                            <pv-button @click="packagePage.restockLxcPackage(p)" variant="outline">补货</pv-button>
                            <pv-button @click="packagePage.deleteLxcPackage(p.id)" variant="outline">删除</pv-button>
                        </div>
                    </td>
                                    </tr>
                                    <tr v-if="packagePage.lxcPackages.value.length === 0"><td colspan="15" class="text-center text-muted">暂无套餐</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </div>
                <!-- end packages -->

                <!-- VM 套餐弹窗 -->
                <div class="modal fade" id="vmPackageModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.vmPackageForm.value.id ? '编辑 VM 套餐' : '新建 VM 套餐' }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <!-- 基本信息 -->
                                    <div class="col-md-6"><label class="form-label">套餐名称</label><input class="form-control" v-model="packagePage.vmPackageForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">VM 模板</label>
                                        <select class="form-select" v-model="packagePage.vmPackageForm.value.template_id">
                                            <option value="">请选择模板</option>
                                            <option v-for="t in packagePage.vmTemplateOptions.value" :key="t.id" :value="t.id">{{ t.name || ('VM ' + t.vmid) }}</option>
                                        </select>
                                    </div>
                                    <!-- 核心配置 -->
                                    <div class="col-md-3"><label class="form-label">CPU (核)</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">内存 (MB)</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.memory"></div>
                                    <div class="col-md-3"><label class="form-label">磁盘 (GB)</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.disk_size"></div>
                                    <div class="col-md-3"><label class="form-label">库存数量</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.stock" placeholder="-1 不限量，0 售罄"></div>
                                    <!-- 价格 -->
                                    <div class="col-md-4"><label class="form-label">月付 (元)</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.monthly_price"></div>
                                    <div class="col-md-4"><label class="form-label">季付优惠 (%)</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.vmPackageForm.value.quarterly_discount" placeholder="0-100，0表示无优惠"></div>
                                    <div class="col-md-4"><label class="form-label">年付优惠 (%)</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.vmPackageForm.value.yearly_discount" placeholder="0-100，0表示无优惠"></div>
                                    <!-- 扩展信息 -->
                                    <div class="col-md-12"><label class="form-label">描述</label><textarea class="form-control" rows="2" v-model="packagePage.vmPackageForm.value.description" placeholder="套餐描述信息"></textarea></div>
                                    <div class="col-md-4"><label class="form-label">CPU 型号</label><input class="form-control" v-model="packagePage.vmPackageForm.value.cpu_model" placeholder="如 Intel Xeon"></div>
                                    <div class="col-md-4"><label class="form-label">带宽 (Mbps)</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.bandwidth"></div>
                                    <div class="col-md-6"><label class="form-label">分组</label>
                                        <select class="form-select" v-model="packagePage.vmPackageForm.value.group_id">
                                            <option :value="null">无分组</option>
                                            <option v-for="g in packagePage.vmPackageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
                                        </select>
                                    </div>
                                    <!-- 状态 -->
                                    <div class="col-md-6"><label class="form-label">状态</label><select class="form-select" v-model="packagePage.vmPackageForm.value.status"><option value="active">启用</option><option value="inactive">停用</option></select></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button @click="packagePage.saveVmPackage()" variant="primary">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LXC 套餐弹窗 -->
                <div class="modal fade" id="lxcPackageModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.lxcPackageForm.value.id ? '编辑 LXC 套餐' : '新建 LXC 套餐' }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <!-- 基本信息 -->
                                    <div class="col-md-6"><label class="form-label">套餐名称</label><input class="form-control" v-model="packagePage.lxcPackageForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">LXC 模板</label>
                                        <select class="form-select" v-model="packagePage.lxcPackageForm.value.template_id">
                                            <option value="">请选择模板</option>
                                            <option v-for="t in packagePage.lxcTemplateOptions.value" :key="t.id" :value="t.id">{{ t.name || ('LXC ' + t.vmid) }}</option>
                                        </select>
                                    </div>
                                    <!-- 核心配置 -->
                                    <div class="col-md-3"><label class="form-label">CPU (核)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">内存 (MB)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.memory"></div>
                                    <div class="col-md-2"><label class="form-label">Swap (MB)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.swap"></div>
                                    <div class="col-md-2"><label class="form-label">磁盘 (GB)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.disk_size"></div>
                                    <div class="col-md-2"><label class="form-label">库存</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.stock" placeholder="-1 不限量，0 售罄"></div>
                                    <!-- 价格 -->
                                    <div class="col-md-4"><label class="form-label">月付 (元)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.monthly_price"></div>
                                    <div class="col-md-4"><label class="form-label">季付优惠 (%)</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.lxcPackageForm.value.quarterly_discount" placeholder="0-100，0表示无优惠"></div>
                                    <div class="col-md-4"><label class="form-label">年付优惠 (%)</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.lxcPackageForm.value.yearly_discount" placeholder="0-100，0表示无优惠"></div>
                                    <!-- 扩展信息 -->
                                    <div class="col-md-12"><label class="form-label">描述</label><textarea class="form-control" rows="2" v-model="packagePage.lxcPackageForm.value.description" placeholder="套餐描述信息"></textarea></div>
                                    <div class="col-md-4"><label class="form-label">CPU 型号</label><input class="form-control" v-model="packagePage.lxcPackageForm.value.cpu_model" placeholder="如 Intel Xeon"></div>
                                    <div class="col-md-4"><label class="form-label">带宽 (Mbps)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.bandwidth"></div>
                                    <div class="col-md-6"><label class="form-label">分组</label>
                                        <select class="form-select" v-model="packagePage.lxcPackageForm.value.group_id">
                                            <option :value="null">无分组</option>
                                            <option v-for="g in packagePage.lxcPackageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
                                        </select>
                                    </div>
                                    <!-- 状态 -->
                                    <div class="col-md-6"><label class="form-label">状态</label><select class="form-select" v-model="packagePage.lxcPackageForm.value.status"><option value="active">启用</option><option value="inactive">停用</option></select></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button @click="packagePage.saveLxcPackage()" variant="primary">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VM 分组弹窗 -->
                <div class="modal fade" id="vmGroupModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.vmGroupForm.value.id ? '编辑分组' : '新建分组' }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3"><label class="form-label">分组名称</label><input class="form-control" v-model="packagePage.vmGroupForm.value.name"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button @click="packagePage.saveVmGroup()" variant="primary">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LXC 分组弹窗 -->
                <div class="modal fade" id="lxcGroupModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.lxcGroupForm.value.id ? '编辑分组' : '新建分组' }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3"><label class="form-label">分组名称</label><input class="form-control" v-model="packagePage.lxcGroupForm.value.name"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
                                <pv-button @click="packagePage.saveLxcGroup()" variant="primary">保存</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
`);
})();
