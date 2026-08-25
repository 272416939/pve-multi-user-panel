(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'lxc'" class="lxc-section">

                    <!-- Tab 1: 新建 LXC 容器 -->
                    <div v-if="activeTabLxc === 'create'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('nav.lxcCreate') }}</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <form @submit.prevent="createLxc" novalidate>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.assetNode') }}</label>
                                            <select class="form-select" v-model="lxcCreateNodeId" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="n in lxcNodeOptions" :key="n.id" :value="String(n.id)">{{ n.name }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('common.template') }}</label>
                                            <select class="form-select" v-model="lxcForm.ostemplate" required>
                                                <option value="">{{ t('admin.pkg.pickTpl') }}</option>
                                                <option v-for="tpl in lxcTemplates" :key="tpl.volid" :value="tpl.volid">{{ lxcTemplateLabel(tpl) }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.disk.storageLocation') }}</label>
                                            <select class="form-select" v-model="lxcForm.storage">
                                                <option value="">{{ t('admin.disk.default') }}</option>
                                                <option v-for="s in lxcStorageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('admin.lxc.hostname') }}</label>
                                            <input type="text" class="form-control" v-model="lxcForm.hostname" :placeholder="t('admin.lxc.hostnamePh')" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">{{ t('admin.hw.cpuCount') }}</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.cores" min="1" max="64">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">{{ t('admin.hw.diskGb') }}</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.disk" min="1" max="1000">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.hw.memMb') }}</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.memory" min="64" max="1048576">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Swap (MB)</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.swap" min="0" max="1048576">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('admin.lxc.rootPwd') }}</label>
                                            <input type="password" class="form-control" v-model="lxcForm.password" autocomplete="new-password">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('register.confirmPassword') }}</label>
                                            <input type="password" class="form-control" v-model="lxcForm.confirmPassword" autocomplete="new-password">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.lxc.bridge') }}</label>
                                            <select class="form-select" v-model="lxcForm.net0Bridge">
                                                <option value="vmbr0">vmbr0</option>
                                                <option value="vmbr1">vmbr1</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.lxc.ipv4Label') }}</label>
                                            <div class="input-group">
                                                <input type="text" class="form-control" v-model="lxcForm.net0Ip" :placeholder="t('admin.lxc.ipv4Ph')">
                                                <pv-button type="button" @click="randomLxcCreateIp" :title="t('dash.randomIp.titleDhcp')" variant="outline">{{ t('dash.port.random') }}</pv-button>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.lxc.macLabel') }}</label>
                                            <input type="text" class="form-control" v-model="lxcForm.net0Mac" :placeholder="t('admin.lxc.autoGen')">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.lxc.features') }}</label>
                                            <input type="text" class="form-control" v-model="lxcForm.features" :placeholder="t('admin.lxc.featuresPh')">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('admin.lxc.ipv6Label') }}</label>
                                            <input type="text" class="form-control" v-model="lxcForm.net0Ip6" :placeholder="t('admin.lxc.ipv6Ph')">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="lxcUnprivileged" v-model="lxcForm.unprivileged">
                                                <label class="form-check-label" for="lxcUnprivileged">{{ t('admin.lxc.unprivilegedRec') }}</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="lxcStart" v-model="lxcForm.start">
                                                <label class="form-check-label" for="lxcStart">{{ t('admin.lxc.startAfterCreate') }}</label>
                                            </div>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" >{{ t('admin.lxc.createBtn') }}</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 2: 分配 LXC 容器 -->
                    <div v-if="activeTabLxc === 'assign'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('nav.lxcAssign') }}</h4>
                            <pv-button variant="outline-warning" size="lg" @click="checkExpired">

                                {{ t('admin.lxc.checkExpiredNow') }}
                            
</pv-button>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="assignLxc" novalidate>
                                    <div class="row">
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.assetNode') }}</label>
                                            <select class="form-select" v-model="lxcAssignNodeId" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="n in lxcNodeOptions" :key="n.id" :value="String(n.id)">{{ n.name }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">{{ t('nav.containers') }}</label>
                                            <select class="form-select" v-model="lxcAssignForm.ct_id" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="ct in lxcContainers" :key="ct.vmid" :value="ct.vmid">
                                                    {{ ct.name || 'CT ' + ct.vmid }} ({{ ct.vmid }})
                                                </option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.osswitchlog.user') }}</label>
                                            <select class="form-select" v-model="lxcAssignForm.user_id" required>
                                                <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
                                                <option v-for="u in users" :key="u.id" :value="String(u.id)">{{ u.username }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">{{ t('common.name') }}</label>
                                            <input type="text" class="form-control" v-model="lxcAssignForm.name">
                                        </div>
                                        <div class="col-md-4 mb-3">
                                            <label class="form-label">{{ t('dash.expiryTime') }}</label>
                                            <input type="datetime-local" class="form-control" v-model="lxcAssignForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('dash.vm.renewPrice') }}</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="lxcAssignForm.renewal_price" :placeholder="t('common.ph.price')">
                                        </div>
                                        <div class="col-md-1 mb-3">
                                            <label class="form-label">{{ t('user.order.period') }}</label>
                                            <select class="form-select" v-model="lxcAssignForm.renewal_period">
                                                <option value="month">{{ t('dash.month30') }}</option>
                                                <option value="quarter">{{ t('dash.quarter90') }}</option>
                                                <option value="year">{{ t('dash.year365') }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.monthlyOriginal') }}</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="lxcAssignForm.monthly_price" :placeholder="t('admin.pkg.pricePh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.quarterlyDiscPct') }}</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="lxcAssignForm.quarterly_discount" :placeholder="t('admin.pkg.qDiscPh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('admin.pkg.yearlyDiscPct') }}</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="lxcAssignForm.yearly_discount" :placeholder="t('admin.pkg.yDiscPh')">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">{{ t('dash.macGroup') }}</label>
                                            <select class="form-select" v-model="lxcAssignForm.mac_group_id">
                                                <option value="">{{ t('dash.noGroup') }}</option>
                                                <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || t('dash.groupPrefix') + g.id }}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" formnovalidate>{{ t('admin.assign') }}</pv-button>
                                </form>
                            </div>
                        </div>

                        <div v-show="availableLxc.length === 0 && assignedLxc.length === 0" class="text-muted text-center py-4">
                            {{ t('admin.lxc.noneFound') }}
                        </div>

                        <div v-show="availableLxc.length > 0">
                            <h5>{{ t('admin.lxc.pendingLabel') }} <span v-if="lxcAssignNodeName" class="text-muted small">· {{ lxcAssignNodeName }}</span></h5>
                            <div class="table-container mb-4" style="padding:12px;">
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>CT ID</th>
                                                <th>{{ t('common.name') }}</th>
                                                <th>{{ t('common.status') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="ct in availableLxc" :key="ct.vmid">
                                                <td>{{ ct.vmid }}</td>
                                                <td>{{ ct.name || '-' }}</td>
                                                <td>
                                                    <span :class="ct.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ ct.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div v-show="assignedLxc.length > 0">
                            <h5>{{ t('admin.lxc.assignedLabel') }} <span v-if="lxcAssignNodeName" class="text-muted small">· {{ lxcAssignNodeName }}</span></h5>
                            <div class="table-container mb-4" style="padding:12px;">
                                <div class="table-responsive">
                                    <table class="table table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>CT ID</th>
                                                <th>{{ t('common.name') }}</th>
                                                <th>{{ t('dash.assignTo') }}</th>
                                                <th>{{ t('common.status') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="ct in assignedLxc" :key="ct.vmid">
                                                <td>{{ ct.vmid }}</td>
                                                <td>{{ ct.name || '-' }}</td>
                                                <td>{{ ct.assigned_user || '-' }}</td>
                                                <td>
                                                    <span :class="ct.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ ct.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                    </div>

                    <!-- Tab 3: 容器管理 -->
                    <div v-if="activeTabLxc === 'manage'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('nav.containerManage') }}</h4>
                        </div>
                        <div v-if="lxcLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">{{ t('common.loading') }}</span>
                            </div>
                            <p class="mt-2 text-muted">{{ t('common.loading') }}</p>
                        </div>
                        <div v-else class="vm-table-wrap">
                        <!-- 移动端卡片视图 -->
                        <div class="d-block d-md-none">
                            <div v-if="userLxcContainers.length === 0" class="text-center text-muted py-4">{{ t('admin.lxc.empty') }}</div>
                            <div v-for="ct in userLxcContainers" :key="ct.id" class="vm-mobile-card">
                                <div class="vm-mobile-card-header">
                                    <div class="vm-mobile-card-title">
                                        {{ ct.name || ('CT ' + ct.ct_id) }}
                                        <span class="vm-mobile-card-id">#{{ ct.ct_id }}</span>
                                    </div>
                                    <template v-if="vmBusyClass(ct)">
                                        <span :class="vmBusyClass(ct)">{{ vmBusyText(ct) }}</span>
                                    </template>
                                    <template v-else>
                                        <span :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                                    </template>
                                </div>
                                <div class="vm-mobile-card-body">
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('admin.assetZone') }}</span><span class="vm-mobile-card-value">{{ ct.zone_name || '-' }}</span></div>
                                    <div class="vm-mobile-card-row" v-if="ct.username"><span class="vm-mobile-card-label">{{ t('admin.osswitchlog.user') }}</span><span class="vm-mobile-card-value">{{ ct.username }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.privateIp') }}</span><span class="vm-mobile-card-value">{{ ct.ip || ct.dhcp_static_ip || '-' }}</span></div>
                                    <div v-if="networkConfig.cname_domain" class="vm-mobile-card-cname">
                                        <div class="vm-mobile-card-cname-toggle" @click="ct._cnameOpen = !ct._cnameOpen">
                                            <span class="vm-mobile-card-label">{{ t('dash.vm.cname') }}</span>
                                            <svg :style="{ transform: ct._cnameOpen ? 'rotate(90deg)' : '' }" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                                        </div>
                                        <div v-if="ct._cnameOpen" class="vm-mobile-card-cname-list">
                                            <div v-for="cname in formatCnameList(networkConfig.cname_domain, ct.ct_id)" :key="cname.domain" class="vm-mobile-card-cname-item">
                                                <span class="text-primary"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</span>
                                                <button class="cname-copy-btn" @click="copyText(cname.domain)" :title="t('common.copy')">
                                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.config') }}</span><span class="vm-mobile-card-value">{{ ct.config ? (ct.config.cores || 1) + t('dash.detail.coresSuffix') + formatMemory(ct.config.memory) : '-' }} / {{ formatDiskSize(ct) }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">{{ t('dash.vm.renewPrice') }}</span><span class="vm-mobile-card-value">{{ ct.renewal_price ? ct.renewal_price + t('common.perSlash') + (ct.renewal_period === 'year' ? t('dash.period.year') : ct.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</span></div>
                                </div>
                                <div class="vm-mobile-card-actions">
                                    <pv-button variant="table-primary" @click="openLxcDetail(ct)">{{ t('common.detail') }}</pv-button>
                                    <pv-button variant="table" @click="vmBusyBlock(ct) !== false && openLxcTerminal(ct.ct_id)">{{ t('terminal.title') }}</pv-button>
                                    <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table" @click="requestLxcConfirm(ct.ct_id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                    <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                    <pv-button v-if="ct.status && ct.status.status === 'running' && !ct._busy" variant="table-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                    <pv-button v-if="!ct.status || ct.status.status !== 'running'" variant="table-primary" @click="ct._busy ? vmBusyBlock(ct) : startLxc(ct.ct_id)" :disabled="ct._busy">{{ t('dash.lxc.start') }}</pv-button>
                                    <pv-button v-if="!ct.status || ct.status.status !== 'running'" variant="table-danger" @click="ct._busy ? vmBusyBlock(ct) : openDestroyLxcModalFromList(ct)" :disabled="ct._busy">{{ t('dash.disk.destroy') }}</pv-button>
                                    <div class="dropdown-table">
                                        <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('common.more') }}</button>
                                        <ul class="dropdown-menu-table">
                                            <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcSnapshotPanel(ct)">{{ t('dash.vm.snapshot') }}</a></li>
                                            <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openLxcBackupPanel(ct)">{{ t('dash.vm.backup') }}</a></li>
                                            <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openDeviceForward(ct, 'lxc')">{{ t('dash.vm.network') }}</a></li>
                                            <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">{{ t('terminal.title') }}</a></li>
                                            <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : editLxc(ct)">{{ t('common.edit') }}</a></li>
                                            <li v-if="!ct.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                            <li v-else><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openResetLxcIpModal(ct)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
                                            <li><a href="#" @click.prevent="ct._busy ? vmBusyBlock(ct) : openResetLxcPasswordModal(ct)" class="text-warning">{{ t('login.resetTitle') }}</a></li>
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
                                                <th>CTID</th>
                                                <th>{{ t('admin.assetZone') }}</th>
                                                <th>{{ t('admin.osswitchlog.user') }}</th>
                                                <th>{{ t('dash.lxc.name') }}</th>
                                                <th>{{ t('dash.vm.privateIp') }}</th>
                                                <th class="text-start">{{ t('dash.vm.cname') }}</th>
                                                <th>{{ t('dash.vm.config') }}</th>
                                                <th>{{ t('dash.expiryTime') }}</th>
                                                <th>{{ t('dash.vm.renewPrice') }}</th>
                                                <th>{{ t('dash.lxc.image') }}</th>
                                                <th>{{ t('common.status') }}</th>
                                                <th>{{ t('common.actions') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="ct in userLxcContainers" :key="ct.id">
                                                <td>{{ ct.ct_id }}</td>
                                                <td>{{ ct.zone_name || '-' }}</td>
                                                <td>{{ ct.username || '-' }}</td>
                                                <td>{{ ct.name || ('CT ' + ct.ct_id) }}</td>
                                                <td>{{ ct.ip || ct.dhcp_static_ip || '-' }}</td>
                                                <td>
                                                    <template v-if="(ct.cname_domain || networkConfig.cname_domain)">
                                                        <div v-for="cname in formatCnameList(ct.cname_domain || networkConfig.cname_domain, ct.ct_id)" :key="cname.domain" class="cname-cell text-primary" :title="cname.label + cname.domain"><span class="cname-label text-muted">{{ cname.label }}</span>{{ cname.domain }}</div>
                                                    </template>
                                                    <span v-else class="text-muted">-</span>
                                                </td>
                                                <td>{{ (ct.config ? (ct.config.cores || 1) + t('dash.detail.coresSuffix') + formatMemory(ct.config.memory) : '-') }} {{ ct.config || ct.status ? '/ ' + formatDiskSize(ct) : '' }}</td>
                                                <td><span v-if="ct.expiration_date" :class="getExpiryColor(ct.expiration_date)">{{ formatDate(ct.expiration_date) + ' ' + daysUntilExpire(ct.expiration_date) }}</span><span v-else class="text-muted">-</span></td>
                                                <td>{{ ct.renewal_price ? ct.renewal_price + t('common.perSlash') + (ct.renewal_period === 'year' ? t('dash.period.year') : ct.renewal_period === 'quarter' ? t('dash.period.quarter') : t('dash.period.month')) : '-' }}</td>
                                                <td>{{ ct.template_name || (ct.config ? (ct.config.ostype || '-') : '-') }}</td>
                                                <td>
                                                    <template v-if="vmBusyClass(ct)">
                                                        <span :class="vmBusyClass(ct)">{{ vmBusyText(ct) }}</span>
                                                    </template>
                                                    <template v-else>
                                                        <span :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? t('dash.vm.running') : t('dash.vm.stopped') }}</span>
                                                    </template>
                                                </td>
                                                <td>
                                                    <div v-if="ct._busy" class="table-actions">
                                                        <pv-button variant="table-primary" @click="openLxcDetail(ct)">{{ t('common.detail') }}</pv-button>
                                                        <pv-button variant="table" @click="openLxcTerminal(ct.ct_id)">{{ t('terminal.title') }}</pv-button>
                                                    </div>
                                                    <div v-else class="table-actions">
                                                        <pv-button variant="table-primary" @click="openLxcDetail(ct)">{{ t('common.detail') }}</pv-button>
                                                        <div class="btn-group-table" v-if="ct.status && ct.status.status === 'running'">
                                                            <pv-button variant="table" @click="requestLxcConfirm(ct.ct_id, 'reboot')">{{ t('dash.vm.reboot') }}</pv-button>
                                                            <pv-button variant="table" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">{{ t('dash.vm.shutdown') }}</pv-button>
                                                            <pv-button variant="table-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">{{ t('dash.vm.stop') }}</pv-button>
                                                        </div>
                                                        <div class="btn-group-table" v-if="!ct.status || ct.status.status !== 'running'">
                                                            <pv-button variant="table-primary" @click="startLxc(ct.ct_id)">{{ t('dash.lxc.start') }}</pv-button>
                                                            <pv-button variant="table-warning" @click="removeLxcById(ct.id)">{{ t('common.remove') }}</pv-button>
                                                            <pv-button variant="table-danger" @click="openDestroyLxcModalFromList(ct)">{{ t('dash.disk.destroy') }}</pv-button>
                                                        </div>
                                                        <div class="dropdown-table">
                                                            <button class="pv-btn pv-btn-table dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">{{ t('common.more') }}</button>
                                                            <ul class="dropdown-menu-table">
                                                                <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'reboot')">{{ t('dash.vm.reboot') }}</a></li>
                                                                <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'shutdown')">{{ t('dash.vm.shutdown') }}</a></li>
                                                                <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'stop')" class="text-danger">{{ t('dash.vm.stop') }}</a></li>
                                                                <li class="d-md-none" v-if="!ct.status || ct.status.status !== 'running'"><a href="#" @click.prevent="startLxc(ct.ct_id)" class="text-success">{{ t('dash.lxc.start') }}</a></li>
                                                                <li class="d-md-none" v-if="!ct.status || ct.status.status !== 'running'"><a href="#" @click.prevent="openDestroyLxcModalFromList(ct)" class="text-danger">{{ t('dash.disk.destroy') }}</a></li>
                                                                <li><a href="#" @click.prevent="openLxcSnapshotPanel(ct)">{{ t('dash.vm.snapshot') }}</a></li>
                                                                <li><a href="#" @click.prevent="openLxcBackupPanel(ct)">{{ t('dash.vm.backup') }}</a></li>
                                                                <li><a href="#" @click.prevent="openDeviceForward(ct, 'lxc')">{{ t('dash.vm.network') }}</a></li>
                                                                <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">{{ t('terminal.title') }}</a></li>
                                                                <li><a href="#" @click.prevent="editLxc(ct)">{{ t('common.edit') }}</a></li>
                                                                <li v-if="!ct.subnet_id"><a href="#" class="disabled" :title="t('dash.vm.noSubnetHint')" @click.prevent>{{ t('dash.vm.resetIp') }}</a></li>
                                                                <li v-else><a href="#" @click.prevent="openResetLxcIpModal(ct)" class="text-warning">{{ t('dash.vm.resetIp') }}</a></li>
                                                                <li><a href="#" @click.prevent="openResetLxcPasswordModal(ct)" class="text-warning">{{ t('login.resetTitle') }}</a></li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr v-if="userLxcContainers.length === 0">
                                                <td colspan="11" class="text-center text-muted py-4">{{ t('admin.lxc.empty') }}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div v-if="!lxcLoading && userLxcContainers.length === 0" class="text-muted text-center py-4">
                            {{ t('admin.lxc.empty') }}
                        </div>
                    </div>
                </div>

                <!-- 后台管理区域 -->
                

`);
})();
