(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'packages'">

                    <div v-if="activeTabPackages === 'vm'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.pkg.vmTitle') }}</h4>
                            <pv-button @click="packagePage.openVmPackageForm(null)" size="sm">{{ t('admin.pkg.create') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr><th class="drag-handle-th"></th><th>ID</th><th>{{ t('admin.pkg.nameShort') }}</th><th>{{ t('admin.assetZone') }}</th><th>{{ t('dash.groupPrefix') }}</th><th>{{ t('common.template') }}</th><th>CPU</th><th>{{ t('admin.common.memory') }}</th><th>{{ t('dash.renew.diskPrefix') }}</th><th>{{ t('user.order.periodMonth') }}</th><th>{{ t('admin.disk.quarterlyDiscount') }}</th><th>{{ t('admin.disk.yearlyDiscount') }}</th><th>{{ t('admin.pkg.stock') }}</th><th>{{ t('admin.pkg.sold') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'vm')" @drop="packagePage.handleDropOnContainer($event, 'vm')">
                                    <tr v-for="p in packagePage.vmPackages.value" :key="p.id"
                                        :data-drag-id="p.id" data-drag-type="vm"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === p.id && packagePage.dragState.draggingType === 'vm' }"
                                        @dragover="packagePage.handleDragOver($event, p.id, 'vm')"
                                        @dragleave="packagePage.handleDragLeave($event, p.id)"
                                        @drop="packagePage.handleDrop($event, p.id, 'vm')">
                                        <td class="drag-handle-cell">
                                            <span class="drag-handle"
                                                draggable="true"
                                                @dragstart="packagePage.handleDragStart($event, p.id, 'vm')"
                                                @dragend="packagePage.handleDragEnd()"
                                                @touchstart="packagePage.handleTouchStart($event, p.id, 'vm')"
                                                @touchmove="packagePage.handleTouchMove($event)"
                                                @touchend="packagePage.handleTouchEnd($event)"
                                                @touchcancel="packagePage.handleTouchEnd($event)">⠿</span>
                                        </td>
                                        <td>{{ p.id }}</td>
                                        <td>{{ p.name }}</td>
                                        <td>{{ p.zone_name || '-' }}</td>
                                        <td>{{ p.group_name || '-' }}</td>
                                        <td>
                                            <span v-if="p.template_name">{{ p.template_name }}</span>
                                            <span v-else class="text-secondary">{{ t('admin.pkg.tplDeleted') }}</span>
                                        </td>
                                        <td>{{ p.cores }}{{ t('dash.detail.coresSuffix') }}</td>
                                        <td>{{ p.memory }}MB</td>
                                        <td>{{ p.disk_size }}GB</td>
                                        <td>{{ p.monthly_price }}{{ t('common.currencyUnit') }}</td>
                                        <td>{{ p.quarterly_discount || 0 }}%</td>
                                        <td>{{ p.yearly_discount || 0 }}%</td>
                                        <td>{{ p.stock === -1 || p.stock === null ? t('dash.order.unlimited') : p.stock }}</td>
                                        <td>{{ p.sold_count || 0 }}</td>
                                        <td><span :class="p.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ p.status === 'active' ? t('admin.common.enabled') : t('admin.common.disabled') }}</span></td>
                                        <td>
                                            <div class="d-flex gap-2">
                            <pv-button @click="packagePage.openVmPackageForm(p)" variant="outline">{{ t('common.edit') }}</pv-button>
                            <pv-button @click="packagePage.restockVmPackage(p)" variant="outline">{{ t('admin.pkg.restock') }}</pv-button>
                            <pv-button @click="packagePage.deleteVmPackage(p.id)" variant="outline">{{ t('common.delete') }}</pv-button>
                        </div>
                                        </td>
                                    </tr>
                                    <tr v-if="packagePage.vmPackages.value.length === 0"><td colspan="15" class="text-center text-muted">{{ t('admin.pkg.empty') }}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                    <div v-if="activeTabPackages === 'vm-groups'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.pkg.vmGroupTitle') }}</h4>
                            <pv-button @click="packagePage.openVmGroupForm(null)" size="sm">{{ t('admin.disk.addGroup') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr><th class="drag-handle-th"></th><th>ID</th><th>{{ t('admin.pkg.groupNameShort') }}</th><th>{{ t('admin.pkg.planCount') }}</th><th>{{ t('common.actions') }}</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'group-vm')" @drop="packagePage.handleDropOnContainer($event, 'group-vm')">
                                    <tr v-for="g in packagePage.vmPackageGroups.value" :key="g.id"
                                        :data-drag-id="g.id" data-drag-type="group-vm"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === g.id && packagePage.dragState.draggingType === 'group-vm' }"
                                        @dragover="packagePage.handleDragOver($event, g.id, 'group-vm')"
                                        @dragleave="packagePage.handleDragLeave($event, g.id)"
                                        @drop="packagePage.handleDrop($event, g.id, 'group-vm')">
                                        <td class="drag-handle-cell">
                                            <span class="drag-handle"
                                                draggable="true"
                                                @dragstart="packagePage.handleDragStart($event, g.id, 'group-vm')"
                                                @dragend="packagePage.handleDragEnd()"
                                                @touchstart="packagePage.handleTouchStart($event, g.id, 'group-vm')"
                                                @touchmove="packagePage.handleTouchMove($event)"
                                                @touchend="packagePage.handleTouchEnd($event)"
                                                @touchcancel="packagePage.handleTouchEnd($event)">⠿</span>
                                        </td>
                                        <td>{{ g.id }}</td>
                                        <td>{{ g.name }}</td>
                                        <td>{{ packagePage.vmPackages.value.filter(p => p.group_id === g.id).length }}</td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <pv-button @click="packagePage.openVmGroupForm(g)" variant="outline">{{ t('common.edit') }}</pv-button>
                                                <pv-button @click="packagePage.deleteVmGroup(g.id)" variant="outline-danger">{{ t('common.delete') }}</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                    <div v-if="activeTabPackages === 'lxc'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.pkg.lxcTitle') }}</h4>
                            <pv-button @click="packagePage.openLxcPackageForm(null)" size="sm">{{ t('admin.pkg.create') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr><th class="drag-handle-th"></th><th>ID</th><th>{{ t('admin.pkg.nameShort') }}</th><th>{{ t('admin.assetZone') }}</th><th>{{ t('dash.groupPrefix') }}</th><th>{{ t('common.template') }}</th><th>CPU</th><th>{{ t('admin.common.memory') }}</th><th>Swap</th><th>{{ t('dash.renew.diskPrefix') }}</th><th>{{ t('user.order.periodMonth') }}</th><th>{{ t('admin.disk.quarterlyDiscount') }}</th><th>{{ t('admin.disk.yearlyDiscount') }}</th><th>{{ t('admin.pkg.stock') }}</th><th>{{ t('admin.pkg.sold') }}</th><th>{{ t('common.status') }}</th><th>{{ t('common.actions') }}</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'lxc')" @drop="packagePage.handleDropOnContainer($event, 'lxc')">
                                    <tr v-for="p in packagePage.lxcPackages.value" :key="p.id"
                                        :data-drag-id="p.id" data-drag-type="lxc"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === p.id && packagePage.dragState.draggingType === 'lxc' }"
                                        @dragover="packagePage.handleDragOver($event, p.id, 'lxc')"
                                        @dragleave="packagePage.handleDragLeave($event, p.id)"
                                        @drop="packagePage.handleDrop($event, p.id, 'lxc')">
                                        <td class="drag-handle-cell">
                                            <span class="drag-handle"
                                                draggable="true"
                                                @dragstart="packagePage.handleDragStart($event, p.id, 'lxc')"
                                                @dragend="packagePage.handleDragEnd()"
                                                @touchstart="packagePage.handleTouchStart($event, p.id, 'lxc')"
                                                @touchmove="packagePage.handleTouchMove($event)"
                                                @touchend="packagePage.handleTouchEnd($event)"
                                                @touchcancel="packagePage.handleTouchEnd($event)">⠿</span>
                                        </td>
                                        <td>{{ p.id }}</td><td>{{ p.name }}</td><td>{{ p.zone_name || '-' }}</td><td>{{ p.group_name || '-' }}</td><td><span v-if="p.template_name">{{ p.template_name }}</span><span v-else class="text-secondary">{{ t('admin.pkg.tplDeleted') }}</span></td>
                                        <td>{{ p.cores }}{{ t('dash.detail.coresSuffix') }}</td><td>{{ p.memory }}MB</td><td>{{ p.swap }}MB</td><td>{{ p.disk_size }}GB</td>
                                        <td>{{ p.monthly_price }}{{ t('common.currencyUnit') }}</td><td>{{ p.quarterly_discount || 0 }}%</td><td>{{ p.yearly_discount || 0 }}%</td>
                                        <td>{{ p.stock === -1 || p.stock === null ? t('dash.order.unlimited') : p.stock }}</td>
                                        <td>{{ p.sold_count || 0 }}</td>
                                        <td><span :class="p.status === 'active' ? 'badge bg-success' : 'badge bg-secondary'">{{ p.status === 'active' ? t('admin.common.enabled') : t('admin.common.disabled') }}</span></td>
                                        <td>
                        <div class="d-flex gap-2">
                            <pv-button @click="packagePage.openLxcPackageForm(p)" variant="outline">{{ t('common.edit') }}</pv-button>
                            <pv-button @click="packagePage.restockLxcPackage(p)" variant="outline">{{ t('admin.pkg.restock') }}</pv-button>
                            <pv-button @click="packagePage.deleteLxcPackage(p.id)" variant="outline">{{ t('common.delete') }}</pv-button>
                        </div>
                    </td>
                                    </tr>
                                    <tr v-if="packagePage.lxcPackages.value.length === 0"><td colspan="16" class="text-center text-muted">{{ t('admin.pkg.empty') }}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                    <div v-if="activeTabPackages === 'lxc-groups'" class="tab-panel">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.pkg.lxcGroupTitle') }}</h4>
                            <pv-button @click="packagePage.openLxcGroupForm(null)" size="sm">{{ t('admin.disk.addGroup') }}</pv-button>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                        <div class="table-responsive">
                            <table class="table table-hover align-middle table-align-center">
                                <thead class="table-light">
                                    <tr><th class="drag-handle-th"></th><th>ID</th><th>{{ t('admin.pkg.groupNameShort') }}</th><th>{{ t('admin.pkg.planCount') }}</th><th>{{ t('common.actions') }}</th></tr>
                                </thead>
                                <tbody @dragover="packagePage.handleContainerDragOver($event, 'group-lxc')" @drop="packagePage.handleDropOnContainer($event, 'group-lxc')">
                                    <tr v-for="g in packagePage.lxcPackageGroups.value" :key="g.id"
                                        :data-drag-id="g.id" data-drag-type="group-lxc"
                                        :class="{ 'row-dragging': packagePage.dragState.draggingId === g.id && packagePage.dragState.draggingType === 'group-lxc' }"
                                        @dragover="packagePage.handleDragOver($event, g.id, 'group-lxc')"
                                        @dragleave="packagePage.handleDragLeave($event, g.id)"
                                        @drop="packagePage.handleDrop($event, g.id, 'group-lxc')">
                                        <td class="drag-handle-cell">
                                            <span class="drag-handle"
                                                draggable="true"
                                                @dragstart="packagePage.handleDragStart($event, g.id, 'group-lxc')"
                                                @dragend="packagePage.handleDragEnd()"
                                                @touchstart="packagePage.handleTouchStart($event, g.id, 'group-lxc')"
                                                @touchmove="packagePage.handleTouchMove($event)"
                                                @touchend="packagePage.handleTouchEnd($event)"
                                                @touchcancel="packagePage.handleTouchEnd($event)">⠿</span>
                                        </td>
                                        <td>{{ g.id }}</td>
                                        <td>{{ g.name }}</td>
                                        <td>{{ packagePage.lxcPackages.value.filter(p => p.group_id === g.id).length }}</td>
                                        <td>
                                            <div class="d-flex gap-2">
                                                <pv-button @click="packagePage.openLxcGroupForm(g)" variant="outline">{{ t('common.edit') }}</pv-button>
                                                <pv-button @click="packagePage.deleteLxcGroup(g.id)" variant="outline">{{ t('common.delete') }}</pv-button>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                        </div>
                    </div>

                </div>
                <!-- end packages -->

                <!-- VM 套餐弹窗 -->
                <div class="modal fade" id="vmPackageModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.vmPackageForm.value.id ? t('admin.pkg.editVmPlan') : t('admin.pkg.newVmPlan') }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <!-- 基本信息 -->
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.pkg.name') }}</label><input class="form-control" v-model="packagePage.vmPackageForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.tpl.vm') }}</label>
                                        <select class="form-select" v-model="packagePage.vmPackageForm.value.template_id">
                                            <option value="">{{ t('admin.pkg.pickTpl') }}</option>
                                            <option v-for="t in packagePage.vmTemplateOptions.value" :key="t.id" :value="t.id">{{ t.name || ('VM ' + t.vmid) }}</option>
                                        </select>
                                    </div>
                                    <!-- 核心配置 -->
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.cpuCores') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.memMb') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.memory"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.diskGb') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.disk_size"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.pkg.stockCount') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.stock" :placeholder="t('admin.pkg.stockPh')"></div>
                                    <!-- 价格 -->
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.monthlyCny') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.monthly_price"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.quarterlyDisc') }}</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.vmPackageForm.value.quarterly_discount" :placeholder="t('admin.pkg.discPh')"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.yearlyDisc') }}</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.vmPackageForm.value.yearly_discount" :placeholder="t('admin.pkg.discPh')"></div>
                                    <!-- 扩展信息 -->
                                    <div class="col-md-12"><label class="form-label">{{ t('common.description') }}</label><textarea class="form-control" rows="2" v-model="packagePage.vmPackageForm.value.description" :placeholder="t('admin.pkg.descPh')"></textarea></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('dash.order.cpuModel') }}</label><input class="form-control" v-model="packagePage.vmPackageForm.value.cpu_model" :placeholder="t('admin.pkg.cpuModelPh')"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.bandwidth') }}</label><input class="form-control" type="number" v-model.number="packagePage.vmPackageForm.value.bandwidth"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('dash.groupPrefix') }}</label>
                                        <select class="form-select" v-model="packagePage.vmPackageForm.value.group_id">
                                            <option :value="null">{{ t('admin.pkg.noGroup') }}</option>
                                            <option v-for="g in packagePage.vmPackageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('pkg.node') }}</label>
                                        <select class="form-select" v-model="packagePage.vmPackageForm.value.pve_node_id">
                                            <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                            <option v-for="n in packagePage.pveNodeOptions.value" :key="n.id" :value="n.id">{{ n.name }}{{ n.zone_name ? ' (' + n.zone_name + ')' : '' }}</option>
                                        </select>
                                    </div>
                                    <!-- 状态 -->
                                    <div class="col-md-6"><label class="form-label">{{ t('common.status') }}</label><select class="form-select" v-model="packagePage.vmPackageForm.value.status"><option value="active">{{ t('admin.common.enabled') }}</option><option value="inactive">{{ t('admin.common.disabled') }}</option></select></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="packagePage.saveVmPackage()" variant="primary">{{ t('common.save') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LXC 套餐弹窗 -->
                <div class="modal fade" id="lxcPackageModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-lg modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.lxcPackageForm.value.id ? t('admin.pkg.editLxcPlan') : t('admin.pkg.newLxcPlan') }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="row g-3">
                                    <!-- 基本信息 -->
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.pkg.name') }}</label><input class="form-control" v-model="packagePage.lxcPackageForm.value.name"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('admin.tpl.lxc') }}</label>
                                        <select class="form-select" v-model="packagePage.lxcPackageForm.value.template_id">
                                            <option value="">{{ t('admin.pkg.pickTpl') }}</option>
                                            <option v-for="t in packagePage.lxcTemplateOptions.value" :key="t.id" :value="t.id">{{ t.name || ('LXC ' + t.vmid) }}</option>
                                        </select>
                                    </div>
                                    <!-- 核心配置 -->
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.cpuCores') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.cores"></div>
                                    <div class="col-md-3"><label class="form-label">{{ t('admin.hw.memMb') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.memory"></div>
                                    <div class="col-md-2"><label class="form-label">Swap (MB)</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.swap"></div>
                                    <div class="col-md-2"><label class="form-label">{{ t('admin.hw.diskGb') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.disk_size"></div>
                                    <div class="col-md-2"><label class="form-label">{{ t('admin.pkg.stock') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.stock" :placeholder="t('admin.pkg.stockPh')"></div>
                                    <!-- 价格 -->
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.monthlyCny') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.monthly_price"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.quarterlyDisc') }}</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.lxcPackageForm.value.quarterly_discount" :placeholder="t('admin.pkg.discPh')"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.yearlyDisc') }}</label><input class="form-control" type="number" min="0" max="100" step="1" v-model.number="packagePage.lxcPackageForm.value.yearly_discount" :placeholder="t('admin.pkg.discPh')"></div>
                                    <!-- 扩展信息 -->
                                    <div class="col-md-12"><label class="form-label">{{ t('common.description') }}</label><textarea class="form-control" rows="2" v-model="packagePage.lxcPackageForm.value.description" :placeholder="t('admin.pkg.descPh')"></textarea></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('dash.order.cpuModel') }}</label><input class="form-control" v-model="packagePage.lxcPackageForm.value.cpu_model" :placeholder="t('admin.pkg.cpuModelPh')"></div>
                                    <div class="col-md-4"><label class="form-label">{{ t('admin.pkg.bandwidth') }}</label><input class="form-control" type="number" v-model.number="packagePage.lxcPackageForm.value.bandwidth"></div>
                                    <div class="col-md-6"><label class="form-label">{{ t('dash.groupPrefix') }}</label>
                                        <select class="form-select" v-model="packagePage.lxcPackageForm.value.group_id">
                                            <option :value="null">{{ t('admin.pkg.noGroup') }}</option>
                                            <option v-for="g in packagePage.lxcPackageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-6"><label class="form-label">{{ t('pkg.node') }}</label>
                                        <select class="form-select" v-model="packagePage.lxcPackageForm.value.pve_node_id">
                                            <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                            <option v-for="n in packagePage.pveNodeOptions.value" :key="n.id" :value="n.id">{{ n.name }}{{ n.zone_name ? ' (' + n.zone_name + ')' : '' }}</option>
                                        </select>
                                    </div>
                                    <!-- 状态 -->
                                    <div class="col-md-6"><label class="form-label">{{ t('common.status') }}</label><select class="form-select" v-model="packagePage.lxcPackageForm.value.status"><option value="active">{{ t('admin.common.enabled') }}</option><option value="inactive">{{ t('admin.common.disabled') }}</option></select></div>
                                </div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="packagePage.saveLxcPackage()" variant="primary">{{ t('common.save') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- VM 分组弹窗 -->
                <div class="modal fade" id="vmGroupModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.vmGroupForm.value.id ? t('admin.pkg.editGroup') : t('admin.pkg.newGroup') }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3"><label class="form-label">{{ t('admin.disk.groupName') }}</label><input class="form-control" v-model="packagePage.vmGroupForm.value.name"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="packagePage.saveVmGroup()" variant="primary">{{ t('common.save') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- LXC 分组弹窗 -->
                <div class="modal fade" id="lxcGroupModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ packagePage.lxcGroupForm.value.id ? t('admin.pkg.editGroup') : t('admin.pkg.newGroup') }}</h5>
                                <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3"><label class="form-label">{{ t('admin.disk.groupName') }}</label><input class="form-control" v-model="packagePage.lxcGroupForm.value.name"></div>
                            </div>
                            <div class="modal-footer">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button @click="packagePage.saveLxcGroup()" variant="primary">{{ t('common.save') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
`);
})();
