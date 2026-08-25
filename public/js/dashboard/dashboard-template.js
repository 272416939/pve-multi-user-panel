(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
  window.__dashboardTemplateParts.push(`    <!-- 原来的 container 内容区域（移除了旧的 navbar） -->
    <div v-if="!user" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">{{ t('common.loading') }}</span>
        </div>
        <p class="mt-2 text-muted">{{ t('common.loadingAuth') }}</p>
    </div>

    <div v-else>
        <!-- Overview 总览 -->
        <div v-show="activeSection === 'overview'">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="module-title mb-0">{{ t('dash.overview.title') }}</h4>
                <pv-button variant="glass" @click="openCdkRedeem">{{ t('dash.overview.cdk') }}</pv-button>
            </div>
            <div class="row g-3 mb-4">
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                            <span class="stat-label">{{ t('dash.overview.vmRunning') }}</span>
                        </div>
                        <div class="stat-num">{{ userVms.filter(v => v.status && v.status.status === 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                            <span class="stat-label">{{ t('dash.overview.vmStopped') }}</span>
                        </div>
                        <div class="stat-num">{{ userVms.filter(v => !v.status || v.status.status !== 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                            <span class="stat-label">{{ t('dash.overview.ctRunning') }}</span>
                        </div>
                        <div class="stat-num">{{ userLxcContainers.filter(c => c.status && c.status.status === 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                            <span class="stat-label">{{ t('dash.overview.ctStopped') }}</span>
                        </div>
                        <div class="stat-num">{{ userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length }}</div>
                    </div>
                </div>
            </div>

            <h4 class="module-title">{{ t('dash.overview.distribution') }}</h4>
            <div class="row g-4">
                <div class="col-md-6">
                    <div class="overview-chart-card">
                        <div class="circle-wrap">
                            <svg width="160" height="160" viewBox="-7 -7 144 144">
                                <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                <circle class="circle-progress" :style="{ strokeDashoffset: circleVmOffset }" cx="65" cy="65" r="60" transform="rotate(-90 65 65)"></circle>
                            </svg>
                            <div class="circle-text">
                                <div class="circle-num">{{ userVms.length }}</div>
                                <div class="circle-name">{{ t('dash.vm.vm') }}</div>
                            </div>
                        </div>
                        <div class="chart-legend">
                            <span class="legend-item"><span class="legend-dot dot-run"></span> {{ tFormat('dash.overview.runCount', userVms.filter(v => v.status && v.status.status === 'running').length) }}</span>
                            <span class="legend-item"><span class="legend-dot dot-stop"></span> {{ tFormat('dash.overview.stopCount', userVms.filter(v => !v.status || v.status.status !== 'running').length) }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="overview-chart-card">
                        <div class="circle-wrap">
                            <svg width="160" height="160" viewBox="-7 -7 144 144">
                                <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                <circle class="circle-progress" :style="{ strokeDashoffset: circleCtOffset, stroke: userLxcContainers.length > 0 ? '#36D399' : '#6B7280' }" cx="65" cy="65" r="60" transform="rotate(-90 65 65)"></circle>
                            </svg>
                            <div class="circle-text">
                                <div class="circle-num">{{ userLxcContainers.length }}</div>
                                <div class="circle-name">{{ t('dash.lxc.ct') }}</div>
                            </div>
                        </div>
                        <div class="chart-legend">
                            <span class="legend-item"><span class="legend-dot dot-run"></span> {{ tFormat('dash.overview.runCount', userLxcContainers.filter(c => c.status && c.status.status === 'running').length) }}</span>
                            <span class="legend-item"><span class="legend-dot dot-stop"></span> {{ tFormat('dash.overview.stopCount', userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length) }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- VM Section -->
        <div v-show="activeSection === 'vm'">
            <h4 class="module-title">{{ t('dash.vm.myVms') }}</h4>
            <div v-if="loading" class="text-center py-4">
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
                                <span v-if="vm._provisioning" class="spinner-border spinner-border-sm text-primary"></span>
                                {{ vm.name || ('VM ' + vm.vm_id) }}
                                <span class="vm-mobile-card-id">#{{ vm.vm_id }}</span>
                            </div>
                            <span v-if="vm._provisioning" class="tag-pending">{{ t('dash.vm.provisioning') }}</span>
                            <span v-else-if="vmBusyClass(vm)" :class="vmBusyClass(vm)">{{ vmBusyText(vm) }}</span>
                            <span v-else :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                        </div>
                        <div v-if="!vm._provisioning" class="vm-mobile-card-body">
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('admin.assetZone') }}</span><span class="vm-mobile-card-value">{{ vm.zone_name || '-' }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.privateIp') }}</span><span class="vm-mobile-card-value">{{ vm.ip || vm.dhcp_static_ip || '-' }}</span></div>
                            <div v-if="cnameDomain" class="vm-mobile-card-cname">
                                <div class="vm-mobile-card-cname-toggle" @click="vm._cnameOpen = !vm._cnameOpen">
                                    <span class="vm-mobile-card-label">{{ t('dash.vm.cname') }}</span>
                                    <svg :style="{ transform: vm._cnameOpen ? 'rotate(90deg)' : '' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                                <div v-if="vm._cnameOpen" class="vm-mobile-card-cname-list">
                                    <div v-for="cname in formatCnameList(cnameDomain, vm.vm_id)" :key="cname.domain" class="vm-mobile-card-cname-item">
                                        <span class="text-primary"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</span>
                                        <button class="cname-copy-btn" @click="copyText(cname.domain)" :title="t('dash.vm.noSubnetHint')">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.config') }}</span><span class="vm-mobile-card-value">{{ vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + t('dash.detail.coresSuffix') + formatMemory(vm.config.memory) : '-' }} / {{ formatDiskSize(vm) }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.renewPrice') }}</span><span class="vm-mobile-card-value">{{ vm.renewal_price ? vm.renewal_price + t('common.perSlash') + (vm.renewal_period === 'year' ? t('dash.period.year') : vm.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.expiry') }}</span><span class="vm-mobile-card-value" :class="getExpiryColor(vm.expiration_date)">{{ vm.expiration_date ? formatDate(vm.expiration_date) + ' ' + daysUntilExpire(vm.expiration_date) : '-' }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.account') }}</span><span class="vm-mobile-card-value">{{ vm.config?.ciuser || t('dash.vm.noCloudInit') }}</span></div>
                        </div>
                        <div v-if="vm._provisioning" class="text-center text-muted py-2"><small>{{ tFormat('dash.vm.provisioningHint', t('dash.vm.provisioning')) }}</small></div>
                        <div v-else class="vm-mobile-card-actions">
                            <pv-button variant="table-primary" @click="openVmDetail(vm)">{{ t('dash.vm.detail') }}</pv-button>
                            <pv-button variant="table" @click="vmBusyBlock(vm) !== false && openVncConsole(vm.vm_id)">{{ t('dash.vm.console') }}</pv-button>
                            <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table" @click="requestConfirm(vm.id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                            <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table" @click="requestConfirm(vm.id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                            <pv-button v-if="vm.status && vm.status.status === 'running' && !vm._busy" variant="table-danger" @click="requestConfirm(vm.id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                            <pv-button v-if="!vm.status || vm.status.status !== 'running'" variant="table-primary" @click="startVm(vm.vm_id)" :disabled="vm._busy">{{ t('dash.vm.start') }}</pv-button>
                            <div class="dropdown-table">
                                <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('dash.vm.more') }}</button>
                                <ul class="dropdown-menu-table">
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openSnapshotPanel(vm)">{{ t('dash.vm.snapshot') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openBackupPanel(vm)">{{ t('dash.vm.backup') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openDeviceForward(vm, 'vm')">{{ t('dash.vm.network') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openBindSubnet(vm, 'vm')">{{ t('dash.vm.bindSubnet') }}</a></li>
                                    <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)"> {{ t('dash.vm.console') }} </a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openRenewModal(vm)">{{ t('dash.vm.renew') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openVmPasswordReset(vm)">{{ t('dash.vm.resetPwd') }}</a></li>
                                    <li v-if="!vm.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                    <li v-else><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openResetVmIpModal(vm)">{{ t('dash.vm.resetIp') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : osSwitch.openOsSwitchModal(vm)">{{ t('dash.vm.switchOs') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : editVm(vm)">{{ t('dash.vm.edit') }}</a></li>
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
                                    <th>ID</th>
                                    <th>{{ t('dash.vm.hostname') }}</th>
                                    <th>{{ t('admin.assetZone') }}</th>
                                    <th>{{ t('dash.vm.account') }}</th>
                                    <th>{{ t('dash.vm.privateIp') }}</th>
                                    <th class="text-start">{{ t('dash.vm.cname') }}</th>
                                    <th>{{ t('dash.vm.config') }}</th>
                                    <th>{{ t('dash.vm.expiry') }}</th>
                                    <th>{{ t('dash.vm.renewPrice') }}</th>
                                    <th>{{ t('dash.vm.os') }}</th>
                                    <th>{{ t('dash.vm.status') }}</th>
                                    <th>{{ t('dash.vm.actions') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="vm in userVms" :key="vm.id" :class="{ 'row-provisioning': vm._provisioning }">
                                    <td>{{ vm.vm_id }}</td>
                                    <td>
                                        <template v-if="vm._provisioning">
                                            <div class="provisioning-cell">
                                                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                                                <span>{{ vm.name }}</span>
                                            </div>
                                        </template>
                                        <template v-else>{{ vm.name || ('VM ' + vm.vm_id) }}</template>
                                    </td>
                                    <td>{{ vm.zone_name || '-' }}</td>
                                    <td>{{ vm.config?.ciuser || t('dash.vm.noCloudInit') }}</td>
                                    <td>{{ vm.ip || vm.dhcp_static_ip || '-' }}</td>
                                    <td>
                                        <template v-if="cnameDomain && !vm._provisioning">
                                            <div v-for="cname in formatCnameList(cnameDomain, vm.vm_id)" :key="cname.domain" class="cname-cell text-primary" :title="cname.label + cname.domain"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</div>
                                        </template>
                                        <span v-else class="text-muted">-</span>
                                    </td>
                                    <td>{{ (vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + t('dash.detail.coresSuffix') + formatMemory(vm.config.memory) : '-') }} {{ vm._provisioning ? '' : (vm.config || vm.status ? '/ ' + formatDiskSize(vm) : '') }}</td>
                                    <td><span v-if="vm._provisioning" class="text-muted">-</span><span v-else :class="getExpiryColor(vm.expiration_date)">{{ vm.expiration_date ? formatDate(vm.expiration_date) + ' ' + daysUntilExpire(vm.expiration_date) : '-' }}</span></td>
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
                                        <div v-if="vm._provisioning" class="text-center text-muted py-2">
                                            <small>{{ tFormat('dash.vm.provisioningHint', t('dash.vm.provisioning')) }}</small>
                                        </div>
                                        <div v-else class="table-actions">
                                            <pv-button variant="table-primary" @click="openVmDetail(vm)">{{ t('dash.vm.detail') }}</pv-button>
                                            <div class="btn-group-table" v-if="vm.status && vm.status.status === 'running' && !vm._busy">
                                                <pv-button variant="table" @click="requestConfirm(vm.id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                                <pv-button variant="table" @click="requestConfirm(vm.id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                                <pv-button variant="table-danger" @click="requestConfirm(vm.id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                            </div>
                                            <div class="btn-group-table" v-if="!vm.status || vm.status.status !== 'running'">
                                                <pv-button variant="table-primary" @click="vm._busy ? vmBusyBlock(vm) : startVm(vm.vm_id)" :disabled="vm._busy">{{ t('dash.vm.start') }}</pv-button>
                                            </div>
                                            <div class="dropdown-table">
                                                <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('dash.vm.more') }}</button>
                                                <ul class="dropdown-menu-table">
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running' && !vm._busy"><a href="#" @click.prevent="requestConfirm(vm.id, 'reboot')"> {{ t('dash.vm.reboot') }} </a></li>
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running' && !vm._busy"><a href="#" @click.prevent="requestConfirm(vm.id, 'shutdown')"> {{ t('dash.vm.shutdown') }} </a></li>
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running' && !vm._busy"><a href="#" @click.prevent="requestConfirm(vm.id, 'stop')" class="text-danger"> {{ t('dash.vm.stop') }} </a></li>
                                                    <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : startVm(vm.vm_id)" class="text-success"> {{ t('dash.vm.start') }} </a></li>
                                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openSnapshotPanel(vm)">{{ t('dash.vm.snapshot') }}</a></li>
                                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openBackupPanel(vm)">{{ t('dash.vm.backup') }}</a></li>
                                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openDeviceForward(vm, 'vm')">{{ t('dash.vm.network') }}</a></li>
                                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openBindSubnet(vm, 'vm')">{{ t('dash.vm.bindSubnet') }}</a></li>
                                                    <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)"> {{ t('dash.vm.console') }} </a></li>
                                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openRenewModal(vm)">{{ t('dash.vm.renew') }}</a></li>
<li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openVmPasswordReset(vm)">{{ t('dash.vm.resetPwd') }}</a></li>
                                    <li v-if="!vm.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                    <li v-else><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : openResetVmIpModal(vm)">{{ t('dash.vm.resetIp') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : osSwitch.openOsSwitchModal(vm)">{{ t('dash.vm.switchOs') }}</a></li>
                                    <li><a href="#" @click.prevent="vm._busy ? vmBusyBlock(vm) : editVm(vm)">{{ t('dash.vm.edit') }}</a></li>
                                </ul>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr v-if="userVms.length === 0">
                                    <td colspan="10" class="text-center text-muted py-4">{{ t('dash.vm.empty') }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- LXC Section -->
        <div v-show="activeSection === 'lxc'">
            <h4 class="module-title">{{ t('dash.lxc.myCts') }}</h4>
            <div v-if="lxcLoading" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ t('common.loading') }}</span>
                </div>
                <p class="mt-2 text-muted">{{ t('common.loading') }}</p>
            </div>
            <div v-else class="vm-table-wrap">
                <!-- 移动端卡片视图 -->
                <div class="d-block d-md-none">
                    <div v-if="userLxcContainers.length === 0" class="text-center text-muted py-4">{{ t('dash.lxc.empty') }}</div>
                    <div v-for="ct in userLxcContainers" :key="ct.id" class="vm-mobile-card">
                        <div class="vm-mobile-card-header">
                            <div class="vm-mobile-card-title">
                                <span v-if="ct._provisioning" class="spinner-border spinner-border-sm text-primary"></span>
                                {{ ct.name || ('CT ' + ct.ct_id) }}
                                <span class="vm-mobile-card-id">#{{ ct.ct_id }}</span>
                            </div>
                            <span v-if="ct._provisioning" class="tag-pending">{{ t('dash.vm.provisioning') }}</span>
                            <span v-else-if="vmBusyClass(ct)" :class="vmBusyClass(ct)">{{ vmBusyText(ct) }}</span>
                            <span v-else :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                        </div>
                        <div v-if="!ct._provisioning" class="vm-mobile-card-body">
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('admin.assetZone') }}</span><span class="vm-mobile-card-value">{{ ct.zone_name || '-' }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.privateIp') }}</span><span class="vm-mobile-card-value">{{ ct.ip || ct.dhcp_static_ip || '-' }}</span></div>
                            <div v-if="cnameDomain" class="vm-mobile-card-cname">
                                <div class="vm-mobile-card-cname-toggle" @click="ct._cnameOpen = !ct._cnameOpen">
                                    <span class="vm-mobile-card-label">{{ t('dash.vm.cname') }}</span>
                                    <svg :style="{ transform: ct._cnameOpen ? 'rotate(90deg)' : '' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                                </div>
                                <div v-if="ct._cnameOpen" class="vm-mobile-card-cname-list">
                                    <div v-for="cname in formatCnameList(cnameDomain, ct.ct_id)" :key="cname.domain" class="vm-mobile-card-cname-item">
                                        <span class="text-primary"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</span>
                                        <button class="cname-copy-btn" @click="copyText(cname.domain)" :title="t('dash.vm.noSubnetHint')">
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.config') }}</span><span class="vm-mobile-card-value">{{ ct.config ? (ct.config.cores || 1) + t('dash.detail.coresSuffix') + formatMemory(ct.config.memory) : '-' }} / {{ formatDiskSize(ct) }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.renewPrice') }}</span><span class="vm-mobile-card-value">{{ ct.renewal_price ? ct.renewal_price + t('common.perSlash') + (ct.renewal_period === 'year' ? t('dash.period.year') : ct.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.expiry') }}</span><span class="vm-mobile-card-value" :class="getExpiryColor(ct.expiration_date)">{{ ct.expiration_date ? formatDate(ct.expiration_date) + ' ' + daysUntilExpire(ct.expiration_date) : '-' }}</span></div>
                            <div class="vm-mobile-card-row" v-if="ct.template_name"><span class="vm-mobile-card-label"> {{ t('dash.lxc.image') }} </span><span class="vm-mobile-card-value">{{ ct.template_name }}</span></div>
                        </div>
                        <div v-if="ct._provisioning" class="text-center text-muted py-2"><small>{{ tFormat('dash.vm.provisioningHint', t('dash.vm.provisioning')) }}</small></div>
                        <div v-else class="vm-mobile-card-actions">
                            <pv-button variant="table-primary" @click="openLxcDetail(ct)">{{ t('dash.vm.detail') }}</pv-button>
                            <pv-button variant="table" @click="vmBusyBlock(ct) !== false && openLxcTerminal(ct.ct_id)">{{ t('dash.lxc.terminal') }}</pv-button>
                            <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table" @click="requestLxcConfirm(ct.ct_id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                            <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                            <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                            <pv-button v-if="!ct.status || ct.status.status !== 'running'" variant="table-primary" @click="startLxc(ct.ct_id)" :disabled="ct._busy">{{ t('dash.lxc.start') }}</pv-button>
                            <div class="dropdown-table">
                                <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('dash.vm.more') }}</button>
                                <ul class="dropdown-menu-table">
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcSnapshotPanel(ct)">{{ t('dash.vm.snapshot') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcBackupPanel(ct)">{{ t('dash.vm.backup') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openDeviceForward(ct, 'lxc')">{{ t('dash.vm.network') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openBindSubnet(ct, 'lxc')">{{ t('dash.vm.bindSubnet') }}</a></li>
                                    <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">{{ t('dash.vm.terminal') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openRenewModal(ct)">{{ t('dash.vm.renew') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : editLxc(ct)">{{ t('dash.vm.edit') }}</a></li>
                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcPasswordReset(ct)" class="text-warning">{{ t('dash.vm.resetPwd') }}</a></li>
                                    <li v-if="!ct.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                    <li v-else><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openResetLxcIpModal(ct)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
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
                                    <th>ID</th>
                                    <th>{{ t('dash.lxc.name') }}</th>
                                    <th>{{ t('admin.assetZone') }}</th>
                                    <th>{{ t('dash.vm.privateIp') }}</th>
                                    <th class="text-start">{{ t('dash.vm.cname') }}</th>
                                    <th>{{ t('dash.vm.config') }}</th>
                                    <th>{{ t('dash.vm.expiry') }}</th>
                                    <th>{{ t('dash.vm.renewPrice') }}</th>
                                    <th>{{ t('dash.lxc.image') }}</th>
                                    <th>{{ t('dash.vm.status') }}</th>
                                    <th>{{ t('dash.vm.actions') }}</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr v-for="ct in userLxcContainers" :key="ct.id" :class="{ 'row-provisioning': ct._provisioning }">
                                    <td>{{ ct.ct_id }}</td>
                                    <td>
                                        <template v-if="ct._provisioning">
                                            <div class="provisioning-cell">
                                                <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
                                                <span>{{ ct.name }}</span>
                                            </div>
                                        </template>
                                        <template v-else>{{ ct.name || ('CT ' + ct.ct_id) }}</template>
                                    </td>
                                    <td>{{ ct.zone_name || '-' }}</td>
                                    <td>{{ ct.ip || ct.dhcp_static_ip || '-' }}</td>
                                    <td>
                                        <template v-if="cnameDomain && !ct._provisioning">
                                            <div v-for="cname in formatCnameList(cnameDomain, ct.ct_id)" :key="cname.domain" class="cname-cell text-primary" :title="cname.label + cname.domain"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</div>
                                        </template>
                                        <span v-else class="text-muted">-</span>
                                    </td>
                                    <td>{{ (ct.config ? (ct.config.cores || 1) + t('dash.detail.coresSuffix') + formatMemory(ct.config.memory) : '-') }} {{ ct._provisioning ? '' : (ct.config || ct.status ? '/ ' + formatDiskSize(ct) : '') }}</td>
                                    <td><span v-if="ct._provisioning" class="text-muted">-</span><span v-else :class="getExpiryColor(ct.expiration_date)">{{ ct.expiration_date ? formatDate(ct.expiration_date) + ' ' + daysUntilExpire(ct.expiration_date) : '-' }}</span></td>
                                    <td>{{ ct.renewal_price ? ct.renewal_price + t('common.perSlash') + (ct.renewal_period === 'year' ? t('dash.period.year') : ct.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</td>
                                    <td>{{ ct.template_name || (ct.config ? (ct.config.ostype || '-') : '-') }}</td>
                                    <td>
                                        <template v-if="ct._provisioning">
                                            <span class="tag-pending">{{ t('dash.vm.provisioning') }}</span>
                                        </template>
                                        <template v-else-if="vmBusyClass(ct)">
                                            <span :class="vmBusyClass(ct)">{{ vmBusyText(ct) }}</span>
                                        </template>
                                        <template v-else>
                                            <span :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                                        </template>
                                    </td>
                                    <td>
                                        <div v-if="ct._provisioning" class="text-center text-muted py-2">
                                            <small>{{ tFormat('dash.vm.provisioningHint', t('dash.vm.provisioning')) }}</small>
                                        </div>
                                        <div v-else class="table-actions">
                                            <pv-button variant="table-primary" @click="openLxcDetail(ct)">{{ t('dash.vm.detail') }}</pv-button>
                                            <div class="btn-group-table" v-if="ct.status && ct.status.status === 'running' && !ct._busy">
                                                <pv-button variant="table" @click="requestLxcConfirm(ct.ct_id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                                <pv-button variant="table" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                                <pv-button variant="table-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                            </div>
                                            <div class="btn-group-table" v-if="!ct.status || ct.status.status !== 'running'">
                                                <pv-button variant="table-primary" @click="ct._busy ? vmBusyBlock(ct) : startLxc(ct.ct_id)" :disabled="ct._busy">{{ t('dash.lxc.start') }}</pv-button>
                                            </div>
                                            <div class="dropdown-table">
                                                <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('dash.vm.more') }}</button>
                                                <ul class="dropdown-menu-table">
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running' && !ct._busy"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'reboot')"> {{ t('dash.vm.reboot') }} </a></li>
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running' && !ct._busy"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'shutdown')"> {{ t('dash.vm.shutdown') }} </a></li>
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running' && !ct._busy"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'stop')" class="text-danger"> {{ t('dash.vm.stop') }} </a></li>
                                                    <li class="d-md-none" v-if="!ct.status || ct.status.status !== 'running'"><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : startLxc(ct.ct_id)" class="text-success"> {{ t('dash.lxc.start') }} </a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcSnapshotPanel(ct)">{{ t('dash.vm.snapshot') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcBackupPanel(ct)">{{ t('dash.vm.backup') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openDeviceForward(ct, 'lxc')">{{ t('dash.vm.network') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openBindSubnet(ct, 'lxc')">{{ t('dash.vm.bindSubnet') }}</a></li>
                                                    <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">{{ t('dash.vm.terminal') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openRenewModal(ct)">{{ t('dash.vm.renew') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : editLxc(ct)">{{ t('dash.vm.edit') }}</a></li>
                                                    <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcPasswordReset(ct)" class="text-warning">{{ t('dash.vm.resetPwd') }}</a></li>
                                                    <li v-if="!ct.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                    <li v-else><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openResetLxcIpModal(ct)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr v-if="userLxcContainers.length === 0">
                                    <td colspan="9" class="text-center text-muted py-4">{{ t('dash.lxc.empty') }}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- 私有网络（子网管理） -->
        <div v-show="activeSection === 'subnet'">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="module-title">{{ t('dash.subnet.title') }}</h4>
                <div class="d-flex gap-2">
                    <pv-button variant="outline" @click="refreshSubnets" :disabled="subnetRefreshing" :loading="subnetRefreshing">{{ t('dash.subnet.refresh') }}</pv-button>
                    <pv-button variant="glass" @click="openCreateSubnet">+ {{ t('dash.subnet.create') }}</pv-button>
                </div>
            </div>
            <div v-if="subnetLoading" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">{{ t('common.loading') }}</span>
                </div>
                <p class="mt-2 text-muted">{{ t('common.loading') }}</p>
            </div>
            <div v-else class="table-container" style="padding:12px;">
                <div class="table-responsive">
                    <table class="table table-sm table-hover mb-0 table-align-center">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>{{ t('dash.subnet.network') }}</th>
                                <th>{{ t('dash.subnet.gateway') }}</th>
                                <th>{{ t('dash.subnet.addrPool') }}</th>
                                <th>{{ t('dash.subnet.servers') }}</th>
                                <th>{{ t('dash.subnet.available') }}</th>
                                <th>{{ t('dash.subnet.createdAt') }}</th>
                                <th>{{ t('dash.vm.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="s in subnets" :key="s.id">
                                <td>{{ s.id }}</td>
                                <td>
                                    <span class="text-primary">{{ s.vlan_name }}</span>
                                </td>
                                <td>{{ s.gateway }} / {{ s.netmask }}</td>
                                <td>{{ s.addr_pool }}</td>
                                <td>
                                    <span v-if="s.vm_count + s.lxc_count === 0" class="text-muted">-</span>
                                    <span v-else>
                                        <span v-if="s.vm_count > 0">VM {{ s.vm_count }}</span>
                                        <span v-if="s.vm_count > 0 && s.lxc_count > 0"> | </span>
                                        <span v-if="s.lxc_count > 0">LXC {{ s.lxc_count }}</span>
                                    </span>
                                </td>
                                <td>{{ s.available }}</td>
                                <td>{{ formatDate(s.created_at) }}</td>
                                <td>
                                    <pv-button size="sm" variant="outline-danger" @click="deleteSubnet(s)">{{ t('dash.subnet.delete') }}</pv-button>
                                </td>
                            </tr>
                            <tr v-if="subnets.length === 0">
                                <td colspan="8" class="text-center text-muted py-4">{{ t('dash.subnet.noSubnet') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

<!-- 套餐订购页 -->
<div v-if="activeSection === 'order'">
    <div class="mb-3 d-flex flex-wrap gap-2 align-items-center">
        <span class="text-muted small me-1">{{ t('order.pickZone') }}</span>
        <button type="button" class="btn btn-sm" :class="!selectedOrderZone ? 'btn-primary' : 'btn-outline-secondary'" @click="selectOrderZone(null)">{{ t('common.all') }}</button>
        <button type="button" class="btn btn-sm" v-for="z in orderZones" :key="z.id" :class="Number(selectedOrderZone) === Number(z.id) ? 'btn-primary' : 'btn-outline-secondary'" @click="selectOrderZone(z.id)">{{ z.name }}</button>
    </div>
    <div v-if="activeTabOrder === 'vm'">
        <h4 class="module-title">{{ t('dash.order.vmTitle') }}</h4>
        <div v-for="grp in filteredVmGroupedPackages" :key="grp.group_name" class="package-group-section">
            <h5 class="package-group-title" v-if="grp.group_name !== t('admin.disk.default')">{{ grp.group_name }}</h5>
            <div class="package-cards">
                <div class="package-card" v-for="p in grp.packages" :key="p.id" v-show="p.status === 'active'">
                    <div class="package-card-header">{{ p.name }}<span v-if="p.zone_name" class="badge bg-info ms-1">{{ p.zone_name }}</span></div>
                    <div class="package-card-body">
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.cpuModel') }}</span><span class="spec-value">{{ p.cpu_model || '-' }}</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.vcpu') }}</span><span class="spec-value">{{ p.cores }} {{ t('dash.detail.coresSuffix') }}</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.memory') }}</span><span class="spec-value">{{ p.memory }} MB</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.disk') }}</span><span class="spec-value">{{ p.disk_size }} GB</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.bandwidth') }}</span><span class="spec-value">{{ p.bandwidth || '-' }} Mbps</span></div>
                        <div class="package-desc">{{ t('dash.order.note') }}：<span v-html="parseMarkdown(p.description)"></span></div>
                        <div class="package-stock">{{ t('dash.stockPrefix') }}{{ p.stock === -1 || p.stock === null ? t('dash.order.unlimited') : p.stock }}</div>
                        <div class="price-tabs">
                            <div class="price-tab" :class="{ 'price-tab-active': (pkgSelectedPeriod[p.id] || 'month') === 'month' }" @click="selectPackagePeriod(p.id, 'month')">
                                <span class="price-tab-label">{{ t('dash.order.monthPay') }}</span>
                                <span class="price-tab-original" style="visibility:hidden">&nbsp;</span>
                                <span class="price-tab-price">¥{{ p.monthly_price }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'quarter' }" @click="selectPackagePeriod(p.id, 'quarter')">
                                <span v-if="p.quarterly_discount > 0" class="price-tab-badge price-tab-badge-discount">-{{ p.quarterly_discount }}%</span>
                                <span class="price-tab-label">{{ t('dash.order.quarterPay') }}</span>
                                <span class="price-tab-original" :style="{ visibility: p.quarterly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 3).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'quarter') }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'year' }" @click="selectPackagePeriod(p.id, 'year')">
                                <span v-if="p.yearly_discount > 0" class="price-tab-badge price-tab-badge-discount">-{{ p.yearly_discount }}%</span>
                                <span class="price-tab-label">{{ t('dash.order.yearPay') }}</span>
                                <span class="price-tab-original" :style="{ visibility: p.yearly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 12).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'year') }}</span>
                            </div>
                        </div>
                        <pv-button :disabled="p.stock !== -1 && p.stock !== null && p.stock <= 0" @click="openOrderModal(p, 'vm', pkgSelectedPeriod[p.id] || 'month')">{{ (p.stock !== -1 && p.stock !== null && p.stock <= 0) ? t('dash.order.soldOut') : t('dash.order.orderNow') }}</pv-button>
                    </div>
                </div>
            </div>
            <div class="package-empty" v-if="grp.packages.length === 0">{{ t('dash.order.noPackage') }}</div>
        </div>
        <div class="package-empty" v-if="filteredVmGroupedPackages.length === 0">{{ t('dash.order.noPackages') }}</div>
    </div>
    <div v-if="activeTabOrder === 'lxc'">
        <h4 class="module-title">{{ t('dash.order.lxcTitle') }}</h4>
        <div v-for="grp in filteredLxcGroupedPackages" :key="grp.group_name" class="package-group-section">
            <h5 class="package-group-title" v-if="grp.group_name !== t('admin.disk.default')">{{ grp.group_name }}</h5>
            <div class="package-cards">
                <div class="package-card" v-for="p in grp.packages" :key="p.id" v-show="p.status === 'active'">
                    <div class="package-card-header">{{ p.name }}<span v-if="p.zone_name" class="badge bg-info ms-1">{{ p.zone_name }}</span></div>
                    <div class="package-card-body">
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.cpuModel') }}</span><span class="spec-value">{{ p.cpu_model || '-' }}</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.vcpu') }}</span><span class="spec-value">{{ p.cores }} {{ t('dash.detail.coresSuffix') }}</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.memory') }}</span><span class="spec-value">{{ p.memory }} MB</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.disk') }}</span><span class="spec-value">{{ p.disk_size }} GB</span></div>
                        <div class="package-spec"><span class="spec-label">{{ t('dash.order.bandwidth') }}</span><span class="spec-value">{{ p.bandwidth || '-' }} Mbps</span></div>
                        <div class="package-desc">{{ t('dash.order.note') }}：<span v-html="parseMarkdown(p.description)"></span></div>
                        <div class="package-stock">{{ t('dash.stockPrefix') }}{{ p.stock === -1 || p.stock === null ? t('dash.order.unlimited') : p.stock }}</div>
                        <div class="price-tabs">
                            <div class="price-tab" :class="{ 'price-tab-active': (pkgSelectedPeriod[p.id] || 'month') === 'month' }" @click="selectPackagePeriod(p.id, 'month')">
                                <span class="price-tab-label">{{ t('dash.order.monthPay') }}</span>
                                <span class="price-tab-original" style="visibility:hidden">&nbsp;</span>
                                <span class="price-tab-price">¥{{ p.monthly_price }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'quarter' }" @click="selectPackagePeriod(p.id, 'quarter')">
                                <span v-if="p.quarterly_discount > 0" class="price-tab-badge price-tab-badge-discount">-{{ p.quarterly_discount }}%</span>
                                <span class="price-tab-label">{{ t('dash.order.quarterPay') }}</span>
                                <span class="price-tab-original" :style="{ visibility: p.quarterly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 3).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'quarter') }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'year' }" @click="selectPackagePeriod(p.id, 'year')">
                                <span v-if="p.yearly_discount > 0" class="price-tab-badge price-tab-badge-discount">-{{ p.yearly_discount }}%</span>
                                <span class="price-tab-label">{{ t('dash.order.yearPay') }}</span>
                                <span class="price-tab-original" :style="{ visibility: p.yearly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 12).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'year') }}</span>
                            </div>
                        </div>
                        <pv-button :disabled="p.stock !== -1 && p.stock !== null && p.stock <= 0" @click="openOrderModal(p, 'lxc', pkgSelectedPeriod[p.id] || 'month')">{{ (p.stock !== -1 && p.stock !== null && p.stock <= 0) ? t('dash.order.soldOut') : t('dash.order.orderNow') }}</pv-button>
                    </div>
                </div>
            </div>
            <div class="package-empty" v-if="grp.packages.length === 0">{{ t('dash.order.noPackage') }}</div>
        </div>
        <div class="package-empty" v-if="filteredLxcGroupedPackages.length === 0">{{ t('dash.order.noPackages') }}</div>
    </div>
</div>

<Teleport to="body">

<div class="modal fade" id="deviceForwardModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
                <h5 class="modal-title">{{ currentDevice.name || (currentDevice.type === 'vm' ? 'VM ' + currentDevice.deviceId : 'CT ' + currentDevice.deviceId) }} - {{ t('dash.port.mgmtTitle') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body" style="min-height:150px;">

                <!-- 规则列表 -->
                <template v-if="!showDeviceForm">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div><span class="text-muted small">{{ tFormat('dash.port.totalRules', deviceRules.length) }}</span><span class="text-muted small ms-3">{{ tFormat('dash.port.remaining', forwardConfig.remaining) }}</span></div>
                        <pv-button variant="primary" size="sm" @click="openDeviceFormModal">{{ t('dash.port.add') }}</pv-button>
                    </div>
                    <div v-if="deviceRules.length === 0" class="text-center py-4 text-muted">{{ t('dash.port.empty') }}</div>
                    <div v-else class="table-responsive mb-0">
                        <table class="table table-hover mb-0 table-align-center">
                            <thead><tr>
                                <th>{{ t('dash.port.name') }}</th><th>{{ t('dash.port.targetIp') }}</th><th>{{ t('dash.port.internalPort') }}</th><th>{{ t('dash.port.externalPort') }}</th><th>{{ t('dash.port.protocol') }}</th><th>{{ t('dash.vm.status') }}</th><th>{{ t('dash.vm.actions') }}</th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="rule in deviceRules" :key="rule.id" :class="{ 'text-muted': rule.sync_status === 'orphan' }">
                                    <td>{{ rule.name || '-' }}</td>
                                    <td>{{ rule.ip }}</td>
                                    <td>{{ rule.internal_port }}</td>
                                    <td>{{ rule.external_port }}</td>
                                    <td>{{ (rule.protocol || '').toUpperCase() }}</td>
                                    <td><span :class="rule.enabled ? 'text-success' : 'text-muted'">{{ rule.enabled ? t('admin.common.enabled') : t('admin.disk.disabled') }}</span></td>
                                    <td>
                                        <div class="d-flex gap-1">
                                            <pv-button variant="outline" size="sm" @click="openDeviceEditModal(rule)" :title="t('common.edit')">{{ t('dash.port.edit') }}</pv-button>
                                            <pv-button variant="outline-danger" size="sm" @click="deleteDeviceRule(rule)" :title="t('common.delete')">{{ t('dash.subnet.delete') }}</pv-button>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>

                <!-- 添加/编辑表单 -->
                <template v-else>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.port.ruleName') }}</label>
                        <input type="text" class="form-control" v-model="deviceForm.name" :placeholder="t('dash.vm.noSubnetHint')">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.port.targetIp') }}</label>
                        <input type="text" class="form-control" v-model="deviceForm.ip" :placeholder="t('dash.vm.noSubnetHint')" readonly>
                        <small class="text-muted">{{ t('dash.port.autoIpHint') }}</small>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">{{ t('dash.port.protocol') }}</label>
                        <div>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp"> TCP</label>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="udp"> UDP</label>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp+udp"> TCP+UDP</label>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">{{ t('dash.port.internalPort') }}</label>
                            <input type="number" class="form-control" v-model.number="deviceForm.internal_port" min="1" max="65535">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">{{ t('dash.port.externalPort') }}</label>
                            <div class="input-group">
                                <input type="number" class="form-control" :class="{ 'is-invalid': deviceCheckResult === false }" v-model.number="deviceForm.external_port" min="1" max="65535">
                                <pv-button type="button" @click="randomDevicePort" variant="outline">{{ t('dash.port.random') }}</pv-button>
                            </div>
                            <small class="text-muted">{{ tFormat('dash.port.range', forwardConfig.port_range_start, forwardConfig.port_range_end) }}</small>
                        </div>
                    </div>
                    <div class="d-flex justify-content-end gap-2">
                        <pv-button type="button" @click="cancelDeviceForm" variant="outline">{{ t('dash.port.cancel') }}</pv-button>
                        <pv-button type="button" @click="submitDeviceRule" variant="primary">{{ editingDeviceRuleId ? t('common.save') : t('common.add') }}</pv-button>
                    </div>
                </template>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- VM/LXC 操作确认弹窗 -->
<div class="vm-detail-modal" :class="{ show: confirmState?.vmId !== null || lxcConfirmState?.ctId !== null }" @click.self="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">
    <div class="modal-content" style="max-width:440px">
        <div class="modal-header">
            <h2 class="modal-title">{{ t('dash.confirm.title') }}</h2>
            <pv-button variant="close" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()"></pv-button>
        </div>
        <div class="modal-body" style="padding:24px 28px;text-align:center">
            <p style="font-size:15px;color:var(--text-primary);line-height:1.6;margin:0 0 20px">{{ confirmState?.vmId !== null ? confirmActionText : confirmLxcActionText }}</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <pv-button variant="danger" @click="confirmState?.vmId !== null ? confirmAction(userVms.find(function(v){return v.id===confirmState.vmId})||userVms[0]) : confirmLxcAction(userLxcContainers.find(function(c){return c.ct_id===lxcConfirmState.ctId})||userLxcContainers[0])">{{ t('dash.confirm.execute') }}</pv-button>
                <pv-button variant="outline" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">{{ t('dash.port.cancel') }}</pv-button>
            </div>
        </div>
    </div>
</div>

<!-- VM/CT 详情监控弹窗 -->
<div class="vm-detail-modal" :class="{ show: showVmDetail }" @click.self="closeVmDetail()">
    <div class="modal-content" style="max-width:720px">
        <div class="modal-header">
            <h2 class="modal-title">{{ detailVm._isLxc ? (detailVm.name || ('CT ' + detailVm.vm_id)) : (detailVm.name || ('VM ' + detailVm.vm_id)) }} {{ t('dash.detail.title') }}</h2>
            <pv-button variant="close" @click="closeVmDetail()"></pv-button>
        </div>
        <div class="modal-body">
            <!-- 基本信息区域 -->
            <div class="info-card">
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? t('admin.detail.ctId') : t('admin.detail.vmId') }}</span><span class="info-value">{{ detailVm.vm_id || '-' }}</span></div>
                    <div class="info-item"><span class="info-label">{{ t('dash.detail.privateIp') }}</span><span class="info-value">{{ detailVm.ip || '-' }}</span></div>
                    <div class="info-item"><span class="info-label">{{ t('dash.detail.hardware') }}</span><span class="info-value">{{ detailVmConfigStr }}</span></div>
                    <div class="info-item"><span class="info-label">{{ t('dash.detail.renewPrice') }}</span><span class="info-value">{{ detailVm.renewal_price ? detailVm.renewal_price + t('common.perSlash') + (detailVm.renewal_period === 'year' ? t('dash.period.year') : detailVm.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                    <div class="info-item">
                        <span class="info-label">{{ t('dash.detail.expiry') }}</span>
                        <span class="info-value" :class="detailVm.expiration_date ? getExpiryColor(detailVm.expiration_date) : ''">{{ detailVm.expiration_date ? formatDate(detailVm.expiration_date) + '（' + daysUntilExpire(detailVm.expiration_date) + '）' : t('dash.detail.notSet') }}</span>
                    </div>
                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? t('dash.lxc.image') : t('admin.detail.osName') }}</span><span class="info-value">{{ detailVmOsStr }}</span></div>
                    <div class="info-item"><span class="info-label">{{ t('dash.detail.status') }}</span><span class="info-value">{{ detailVmStatusStr }}</span></div>
                    <div class="info-item"><span class="info-label">{{ t('dash.detail.uptime') }}</span><span class="info-value">{{ detailVmUptimeStr }}</span></div>
                </div>
            </div>
            <!-- 监控图表区域 -->
            <h4 style="font-size:16px;color:var(--text-secondary);margin-bottom:16px;">{{ t('dash.detail.monitor') }}</h4>
            <div class="chart-grid">
                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.cpu') }}</div><canvas id="detailCpuChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.mem') }}</div><canvas id="detailMemChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.net') }}</div><canvas id="detailNetChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">{{ t('dash.detail.diskIo') }}</div><canvas id="detailDiskChart"></canvas></div>
            </div>
        </div>
    </div>
</div>
`);
})();