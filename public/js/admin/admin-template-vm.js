(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'vms'">
                    <div v-if="activeTabVm === 'manage'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('nav.vmList') }}</h4>
                        </div>
                    <div v-if="vmsLoading" class="text-center py-4">
                        <div class="spinner-border text-primary" role="status">
                            <span class="visually-hidden">{{ t('common.loading') }}</span>
                        </div>
                        <p class="mt-2 text-muted">{{ t('common.loading') }}</p>
                    </div>
                    <div v-else class="vm-table-wrap">
                        <!-- 移动端卡片视图 -->
                        <div class="d-block d-md-none">
                            <div v-if="userVms.length === 0" class="text-center text-muted py-4">{{ t('dash.vm.empty') }}</div>
                            <div v-for="vm in userVms" :key="vm.id" class="vm-mobile-card">
                                <div class="vm-mobile-card-header">
                                    <div class="vm-mobile-card-title">
                                        {{ vm.name || ('VM ' + vm.vm_id) }}
                                        <span class="vm-mobile-card-id">#{{ vm.vm_id }}</span>
                                    </div>
                                    <template v-if="vm._provisioning">
                                        <span class="tag-pending">{{ t('dash.vm.provisioning') }}</span>
                                    </template>
                                    <template v-else-if="vmBusyClass(vm)">
                                        <span :class="vmBusyClass(vm)">{{ vmBusyText(vm) }}</span>
                                    </template>
                                    <template v-else>
                                        <span :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                                    </template>
                                </div>
                                <div class="vm-mobile-card-body">
                                    <div class="vm-mobile-card-row" v-if="vm.username"><span class="vm-mobile-card-label">{{ t('admin.osswitchlog.user') }}</span><span class="vm-mobile-card-value">{{ vm.username }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.privateIp') }}</span><span class="vm-mobile-card-value">{{ vm.ip || vm.dhcp_static_ip || '-' }}</span></div>
                                    <div v-if="networkConfig.cname_domain" class="vm-mobile-card-cname">
                                        <div class="vm-mobile-card-cname-toggle" @click="vm._cnameOpen = !vm._cnameOpen">
                                            <span class="vm-mobile-card-label">{{ t('dash.vm.cname') }}</span>
                                            <svg :style="{ transform: vm._cnameOpen ? 'rotate(90deg)' : '' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                                        </div>
                                        <div v-if="vm._cnameOpen" class="vm-mobile-card-cname-list">
                                            <div v-for="cname in formatCnameList(networkConfig.cname_domain, vm.vm_id)" :key="cname.domain" class="vm-mobile-card-cname-item">
                                                <span class="text-primary"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</span>
                                                <button class="cname-copy-btn" @click="copyText(cname.domain)" :title="t('common.copy')">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.config') }}</span><span class="vm-mobile-card-value">{{ vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + t('dash.detail.coresSuffix') + formatMemory(vm.config.memory) : '-' }} / {{ formatDiskSize(vm) }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.renewPrice') }}</span><span class="vm-mobile-card-value">{{ vm.renewal_price ? vm.renewal_price + t('common.perSlash') + (vm.renewal_period === 'year' ? t('dash.period.year') : vm.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                                </div>
                                <div class="vm-mobile-card-actions">
                                    <pv-button variant="table-primary" @click="openVmDetail(vm)">{{ t('common.detail') }}</pv-button>
                                    <pv-button variant="table" @click="vmBusyBlock(vm) !== false && openVncConsole(vm.vm_id)">{{ t('dash.vm.console') }}</pv-button>
                                    <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table" @click="requestConfirm(vm.id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                    <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table" @click="requestConfirm(vm.id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                    <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table-danger" @click="requestConfirm(vm.id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                    <pv-button v-if="!vm.status || vm.status.status !== 'running'" variant="table-primary" @click="vm._busy ? vmBusyBlock(vm) : startVm(vm.vm_id)" :disabled="vm._busy">{{ t('dash.vm.start') }}</pv-button>
                                    <pv-button v-if="!vm.status || vm.status.status !== 'running'" variant="table-danger" @click="vm._busy ? vmBusyBlock(vm) : openDestroyVmModal(vm)" :disabled="vm._busy">{{ t('dash.disk.destroy') }}</pv-button>
                                    <div class="dropdown-table">
                                        <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('common.more') }}</button>
                                        <ul class="dropdown-menu-table">
                                            <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openSnapshotPanel(vm)">{{ t('dash.vm.snapshot') }}</a></li>
                                            <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openBackupPanel(vm)">{{ t('dash.vm.backup') }}</a></li>
                                            <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openDeviceForward(vm, 'vm')">{{ t('dash.vm.network') }}</a></li>
                                            <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">{{ t('dash.vm.console') }}</a></li>
                                            <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : editVm(vm)">{{ t('common.edit') }}</a></li>
                                            <li v-if="!vm.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                            <li v-else><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openResetVmIpModal(vm)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
                                            <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openAdminVmPasswordReset(vm)">{{ t('login.resetTitle') }}</a></li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- 桌面端表格视图 -->
                        <div class="table-container d-none d-md-block">
                            <div class="table-scroll">
                                <table class="table-align-center">
                                    <thead>
                                        <tr>
                                            <th>VMID</th>
                                            <th>{{ t('admin.osswitchlog.user') }}</th>
                                            <th>{{ t('dash.vm.hostname') }}</th>
                                            <th>{{ t('admin.vmpage.defaultUser') }}</th>
                                            <th>{{ t('dash.vm.privateIp') }}</th>
                                            <th class="text-start">{{ t('dash.vm.cname') }}</th>
                                            <th>{{ t('dash.vm.config') }}</th>
                                            <th>{{ t('dash.expiryTime') }}</th>
                                            <th>{{ t('dash.vm.renewPrice') }}</th>
                                            <th>{{ t('vnc.groupSystem') }}</th>
                                            <th>{{ t('common.status') }}</th>
                                            <th>{{ t('common.actions') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="vm in userVms" :key="vm.id">
                                            <td>{{ vm.vm_id }}</td>
                                            <td>{{ vm.username || '-' }}</td>
                                            <td>{{ vm.name || ('VM ' + vm.vm_id) }}</td>
                                            <td>{{ vm.config?.ciuser || t('dash.vm.noCloudInit') }}</td>
                                            <td>{{ vm.ip || vm.dhcp_static_ip || '-' }}</td>
                                            <td>
                                                <template v-if="networkConfig.cname_domain">
                                                    <div v-for="cname in formatCnameList(networkConfig.cname_domain, vm.vm_id)" :key="cname.domain" class="cname-cell text-primary" :title="cname.label + cname.domain"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</div>
                                                </template>
                                                <span v-else class="text-muted">-</span>
                                            </td>
                                            <td>{{ (vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + t('dash.detail.coresSuffix') + formatMemory(vm.config.memory) : '-') }} {{ vm.config || vm.status ? '/ ' + formatDiskSize(vm) : '' }}</td>
                                            <td><span v-if="vm.expiration_date" :class="getExpiryColor(vm.expiration_date)">{{ formatDate(vm.expiration_date) + ' ' + daysUntilExpire(vm.expiration_date) }}</span><span v-else class="text-muted">-</span></td>
                                            <td>{{ vm.renewal_price ? vm.renewal_price + t('common.perSlash') + (vm.renewal_period === 'year' ? t('dash.period.year') : vm.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</td>
                                            <td>{{ vm.os || (vm.config ? (vm.config.ostype || '-') : '-') }}</td>
                                            <td>
                                                <template v-if="vm._provisioning">
                                                    <span class="tag-pending">{{ t('dash.vm.provisioning') }}</span>
                                                </template>
                                                <template v-else-if="vmBusyClass(vm)">
                                                    <span :class="vmBusyClass(vm)">{{ vmBusyText(vm) }}</span>
                                                </template>
                                                <template v-else>
                                                    <span :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                                                </template>
                                            </td>
                                        <td>
                                            <div v-if="vm._busy" class="table-actions">
                                                <pv-button variant="table-primary" @click="openVmDetail(vm)">{{ t('common.detail') }}</pv-button>
                                                <pv-button variant="table" @click="openVncConsole(vm.vm_id)">{{ t('dash.vm.console') }}</pv-button>
                                            </div>
                                            <div v-else class="table-actions">
                                                <pv-button variant="table-primary" @click="openVmDetail(vm)">{{ t('common.detail') }}</pv-button>
                                                <div class="btn-group-table" v-if="vm.status && vm.status.status === 'running'">
                                                    <pv-button variant="table" @click="requestConfirm(vm.id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                                    <pv-button variant="table" @click="requestConfirm(vm.id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                                    <pv-button variant="table-danger" @click="requestConfirm(vm.id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                                </div>
                                                <div class="btn-group-table" v-if="!vm.status || vm.status.status !== 'running'">
                                                    <pv-button variant="table-primary" @click="startVm(vm.vm_id)">{{ t('dash.vm.start') }}</pv-button>
                                                    <pv-button variant="table-warning" @click="removeVmById(vm.id)">{{ t('common.remove') }}</pv-button>
                                                    <pv-button variant="table-danger" @click="openDestroyVmModal(vm)">{{ t('dash.disk.destroy') }}</pv-button>
                                                </div>
                                                <div class="dropdown-table">
                                                    <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('common.more') }}</button>
                                                    <ul class="dropdown-menu-table">
                                                        <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'reboot')">{{ t('dash.vm.reboot') }}</a></li>
                                                        <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'shutdown')">{{ t('dash.vm.shutdown') }}</a></li>
                                                        <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'stop')" class="text-danger">{{ t('dash.vm.stop') }}</a></li>
                                                        <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="startVm(vm.vm_id)" class="text-success">{{ t('dash.vm.start') }}</a></li>
                                                        <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="openDestroyVmModal(vm)" class="text-danger">{{ t('dash.disk.destroy') }}</a></li>
                                                        <li><a href="#" @click.prevent="openSnapshotPanel(vm)">{{ t('dash.vm.snapshot') }}</a></li>
                                                        <li><a href="#" @click.prevent="openBackupPanel(vm)">{{ t('dash.vm.backup') }}</a></li>
                                                        <li><a href="#" @click.prevent="openDeviceForward(vm, 'vm')">{{ t('dash.vm.network') }}</a></li>
                                                        <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">{{ t('dash.vm.console') }}</a></li>
                                                        <li><a href="#" @click.prevent="editVm(vm)">{{ t('common.edit') }}</a></li>
                                                        <li v-if="!vm.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                                        <li v-else><a href="#" @click.prevent="openResetVmIpModal(vm)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
                                                        <li><a href="#" @click.prevent="openAdminVmPasswordReset(vm)">{{ t('login.resetTitle') }}</a></li>
                                                    </ul>
                                                </div>
                                            </div>
                                        </td>
                                        </tr>
                                        <tr v-if="userVms.length === 0">
                                            <td colspan="12" class="text-center text-muted py-4">{{ t('dash.vm.empty') }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div v-if="!vmsLoading && userVms.length === 0" class="text-muted text-center py-4">
                        {{ t('dash.vm.empty') }}
                    </div>
                    </div>
                    <div v-if="activeTabVm === 'assign'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('nav.vmAssign') }}</h4>
                            <pv-button variant="outline-warning" size="lg" @click="checkExpired">

                                {{ t('admin.vmpage.checkExpiredNow') }}
                            
</pv-button>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="assignVm" novalidate>
                                    <div class="row">
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">{{ t('nav.vms') }}</label>
                                            <select class="form-select" v-model="assignForm.vm_id" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="vm in availableVms" :key="vm.vmid" :value="vm.vmid">
                                                    {{ vm.name || 'VM ' + vm.vmid }} ({{ vm.vmid }})
                                                </option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.osswitchlog.user') }}</label>
                                            <select class="form-select" v-model="assignForm.user_id" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ u.username }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">{{ t('common.name') }}</label>
                                            <input type="text" class="form-control" v-model="assignForm.name">
                                        </div>
                                        <div class="col-md-4 mb-3">
                                            <label class="form-label">{{ t('dash.expiryTime') }}</label>
                                            <input type="datetime-local" class="form-control" v-model="assignForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('dash.vm.renewPrice') }}</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="assignForm.renewal_price" :placeholder="t('common.ph.price')">
                                        </div>
                                        <div class="col-md-1 mb-3">
                                            <label class="form-label">{{ t('user.order.period') }}</label>
                                            <select class="form-select" v-model="assignForm.renewal_period">
                                                <option value="month">{{ t('dash.month30') }}</option>
                                                <option value="quarter">{{ t('dash.quarter90') }}</option>
                                                <option value="year">{{ t('dash.year365') }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.monthlyOriginal') }}</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="assignForm.monthly_price" :placeholder="t('admin.pkg.pricePh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.quarterlyDiscPct') }}</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="assignForm.quarterly_discount" :placeholder="t('admin.pkg.qDiscPh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.yearlyDiscPct') }}</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="assignForm.yearly_discount" :placeholder="t('admin.pkg.yDiscPh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('dash.macGroup') }}</label>
                                            <select class="form-select" v-model="assignForm.mac_group_id">
                                                <option value="">{{ t('dash.noGroup') }}</option>
                                                <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" formnovalidate>{{ t('admin.assign') }}</pv-button>
                                </form>
                            </div>
                        </div>

                        <div v-show="availableVms.length === 0 && assignedVms.length === 0" class="text-muted text-center py-4">
                            {{ t('admin.vmpage.noneFound') }}
                        </div>

                        <div v-show="availableVms.length > 0">
                            <h5>{{ t('admin.vmpage.pendingLabel') }}</h5>
                            <div class="table-container mb-4" style="padding:12px;">
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>VM ID</th>
                                                <th>{{ t('common.name') }}</th>
                                                <th>{{ t('common.status') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="vm in availableVms" :key="vm.vmid">
                                                <td>{{ vm.vmid }}</td>
                                                <td>{{ vm.name || '-' }}</td>
                                                <td>
                                                    <span :class="vm.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ vm.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div v-show="assignedVms.length > 0">
                            <h5>{{ t('admin.vmpage.assignedLabel') }}</h5>
                            <div class="table-container mb-4" style="padding:12px;">
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>VM ID</th>
                                                <th>{{ t('common.name') }}</th>
                                                <th>{{ t('dash.assignTo') }}</th>
                                                <th>{{ t('common.status') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="vm in assignedVms" :key="vm.vmid">
                                                <td>{{ vm.vmid }}</td>
                                                <td>{{ vm.name || '-' }}</td>
                                                <td>{{ vm.assigned_user || '-' }}</td>
                                                <td>
                                                    <span :class="vm.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ vm.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <!-- LXC 容器管理区域 -->
                

`);
})();
