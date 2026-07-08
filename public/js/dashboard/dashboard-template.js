(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
  window.__dashboardTemplateParts.push(`    <!-- 原来的 container 内容区域（移除了旧的 navbar） -->
    <div v-if="!user" class="text-center py-5">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">加载中...</span>
        </div>
        <p class="mt-2 text-muted">正在验证登录状态...</p>
    </div>

    <div v-else>
        <!-- Overview 总览 -->
        <div v-show="activeSection === 'overview'">
            <div class="d-flex justify-content-between align-items-center mb-3">
                <h4 class="module-title mb-0">资源运行概况</h4>
                <pv-button variant="glass" @click="openCdkRedeem">CDK 兑换</pv-button>
            </div>
            <div class="row g-3 mb-4">
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                            <span class="stat-label">虚拟机运行中</span>
                        </div>
                        <div class="stat-num">{{ userVms.filter(v => v.status && v.status.status === 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg></span>
                            <span class="stat-label">虚拟机已停止</span>
                        </div>
                        <div class="stat-num">{{ userVms.filter(v => !v.status || v.status.status !== 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-run"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                            <span class="stat-label">容器运行中</span>
                        </div>
                        <div class="stat-num">{{ userLxcContainers.filter(c => c.status && c.status.status === 'running').length }}</div>
                    </div>
                </div>
                <div class="col-sm-6 col-md-3">
                    <div class="stat-card">
                        <div class="stat-card-head">
                            <span class="stat-icon stat-icon-stop"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></span>
                            <span class="stat-label">容器已停止</span>
                        </div>
                        <div class="stat-num">{{ userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length }}</div>
                    </div>
                </div>
            </div>

            <h4 class="module-title">资源分布</h4>
            <div class="row g-4">
                <div class="col-md-6">
                    <div class="overview-chart-card">
                        <div class="circle-wrap">
                            <svg width="160" height="160" viewBox="-7 -7 144 144">
                                <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                <circle class="circle-progress" :style="{ strokeDashoffset: circleVmOffset }" cx="65" cy="65" r="60"></circle>
                            </svg>
                            <div class="circle-text">
                                <div class="circle-num">{{ userVms.length }}</div>
                                <div class="circle-name">虚拟机</div>
                            </div>
                        </div>
                        <div class="chart-legend">
                            <span class="legend-item"><span class="legend-dot dot-run"></span> 运行 {{ userVms.filter(v => v.status && v.status.status === 'running').length }}</span>
                            <span class="legend-item"><span class="legend-dot dot-stop"></span> 停止 {{ userVms.filter(v => !v.status || v.status.status !== 'running').length }}</span>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="overview-chart-card">
                        <div class="circle-wrap">
                            <svg width="160" height="160" viewBox="-7 -7 144 144">
                                <circle class="circle-bg" cx="65" cy="65" r="60"></circle>
                                <circle class="circle-progress" :style="{ strokeDashoffset: circleCtOffset, stroke: userLxcContainers.length > 0 ? '#36D399' : '#6B7280' }" cx="65" cy="65" r="60"></circle>
                            </svg>
                            <div class="circle-text">
                                <div class="circle-num">{{ userLxcContainers.length }}</div>
                                <div class="circle-name">容器</div>
                            </div>
                        </div>
                        <div class="chart-legend">
                            <span class="legend-item"><span class="legend-dot dot-run"></span> 运行 {{ userLxcContainers.filter(c => c.status && c.status.status === 'running').length }}</span>
                            <span class="legend-item"><span class="legend-dot dot-stop"></span> 停止 {{ userLxcContainers.filter(c => !c.status || c.status.status !== 'running').length }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- VM Section -->
        <div v-show="activeSection === 'vm'">
            <h4 class="module-title">我的虚拟机</h4>
            <div v-if="loading" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2 text-muted">加载中...</p>
            </div>
            <div v-else class="vm-table-wrap">
                <!-- 移动端卡片视图 -->
                <div class="d-block d-md-none">
                    <div v-if="userVms.length === 0" class="text-center text-muted py-4">暂无虚拟机</div>
                    <div v-for="vm in userVms" :key="vm.id" class="vm-mobile-card">
                        <div class="vm-mobile-card-header">
                            <div class="vm-mobile-card-title">
                                <span v-if="vm._provisioning" class="spinner-border spinner-border-sm text-primary"></span>
                                {{ vm.name || ('VM ' + vm.vm_id) }}
                                <span class="vm-mobile-card-id">#{{ vm.vm_id }}</span>
                            </div>
                            <span v-if="vm._provisioning" class="tag-pending">开通中</span>
                            <span v-else :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? '运行中' : '已停止' }}</span>
                        </div>
                        <div v-if="!vm._provisioning" class="vm-mobile-card-body">
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">内网IP</span><span class="vm-mobile-card-value">{{ vm.ip || vm.dhcp_static_ip || '-' }}</span></div>
                            <div v-if="cnameDomain" class="vm-mobile-card-row"><span class="vm-mobile-card-label">CNAME</span><span class="vm-mobile-card-value text-primary" style="line-height:1.5;"><div v-for="cname in formatCnameList(cnameDomain, vm.vm_id)" :key="cname">{{ cname }}</div></span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">配置</span><span class="vm-mobile-card-value">{{ vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + '核 ' + formatMemory(vm.config.memory) : '-' }} / {{ formatDiskSize(vm) }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">续费价格</span><span class="vm-mobile-card-value">{{ vm.renewal_price ? vm.renewal_price + '元/' + (vm.renewal_period === 'year' ? '年' : vm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</span></div>
                            <div class="vm-mobile-card-row" v-if="vm.config?.ciuser"><span class="vm-mobile-card-label">账号</span><span class="vm-mobile-card-value">{{ vm.config.ciuser }}</span></div>
                        </div>
                        <div v-if="vm._provisioning" class="text-center text-muted py-2"><small>正在开通中，请稍后刷新</small></div>
                        <div v-else class="vm-mobile-card-actions">
                            <button class="table-btn btn-primary" @click="openVmDetail(vm)">详情</button>
                            <button v-if="vm.status && vm.status.status === 'running'" class="table-btn" @click="requestConfirm(vm.id, 'reboot')">重启</button>
                            <button v-if="vm.status && vm.status.status === 'running'" class="table-btn" @click="requestConfirm(vm.id, 'shutdown')">关机</button>
                            <button v-if="vm.status && vm.status.status === 'running'" class="table-btn btn-danger" @click="requestConfirm(vm.id, 'stop')">停止</button>
                            <button v-if="!vm.status || vm.status.status !== 'running'" class="table-btn btn-primary" @click="startVm(vm.vm_id)">开机</button>
                            <div class="dropdown-table">
                                <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                <ul class="dropdown-menu-table">
                                    <li><a href="#" @click.prevent="openSnapshotPanel(vm)">快照</a></li>
                                    <li><a href="#" @click.prevent="openBackupPanel(vm)">备份</a></li>
                                    <li><a href="#" @click.prevent="openDeviceForward(vm, 'vm')">网络</a></li>
                                    <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">控制台</a></li>
                                    <li><a href="#" @click.prevent="renewResource = vm; renewShow = true">续费</a></li>
                                    <li><a href="#" @click.prevent="openVmPasswordReset(vm)">重置密码</a></li>
                                    <li><a href="#" @click.prevent="editVm(vm)">编辑</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- 桌面端表格视图 -->
                <div class="table-container d-none d-md-block">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>主机名称</th>
                                    <th>默认账号</th>
                                    <th>内网IP</th>
                                    <th>CNAME域名</th>
                                    <th>配置</th>
                                    <th>续费价格</th>
                                    <th>系统</th>
                                    <th>状态</th>
                                    <th>操作</th>
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
                                    <td>{{ vm.config?.ciuser || '-' }}</td>
                                    <td>{{ vm.ip || vm.dhcp_static_ip || '-' }}</td>
                                    <td>
                                        <template v-if="cnameDomain && !vm._provisioning">
                                            <div v-for="cname in formatCnameList(cnameDomain, vm.vm_id)" :key="cname" class="text-primary" style="line-height:1.5;">{{ cname }}</div>
                                        </template>
                                        <span v-else class="text-muted">-</span>
                                    </td>
                                    <td>{{ (vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + '核 ' + formatMemory(vm.config.memory) : '-') }} {{ vm._provisioning ? '' : (vm.config || vm.status ? '/ ' + formatDiskSize(vm) : '') }}</td>
                                    <td>{{ vm.renewal_price ? vm.renewal_price + '元/' + (vm.renewal_period === 'year' ? '年' : vm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</td>
                                    <td>{{ vm.os || (vm.config ? (vm.config.ostype || '-') : '-') }}</td>
                                    <td>
                                        <template v-if="vm._provisioning">
                                            <span class="tag-pending">开通中</span>
                                        </template>
                                        <template v-else>
                                            <span :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? '运行中' : '已停止' }}</span>
                                        </template>
                                    </td>
                                    <td>
                                        <div v-if="vm._provisioning" class="text-center text-muted py-2">
                                            <small>正在开通中，请稍后刷新</small>
                                        </div>
                                        <div v-else class="table-actions">
                                            <button class="table-btn btn-primary" @click="openVmDetail(vm)">详情</button>
                                            <div class="btn-group-table" v-if="vm.status && vm.status.status === 'running'">
                                                <button class="table-btn" @click="requestConfirm(vm.id, 'reboot')">重启</button>
                                                <button class="table-btn" @click="requestConfirm(vm.id, 'shutdown')">关机</button>
                                                <button class="table-btn btn-danger" @click="requestConfirm(vm.id, 'stop')">停止</button>
                                            </div>
                                            <div class="btn-group-table" v-if="!vm.status || vm.status.status !== 'running'">
                                                <button class="table-btn btn-primary" @click="startVm(vm.vm_id)">开机</button>
                                            </div>
                                            <div class="dropdown-table">
                                                <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                                <ul class="dropdown-menu-table">
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'reboot')">重启</a></li>
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'shutdown')">关机</a></li>
                                                    <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'stop')" class="text-danger">停止</a></li>
                                                    <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="startVm(vm.vm_id)" class="text-success">开机</a></li>
                                                    <li><a href="#" @click.prevent="openSnapshotPanel(vm)">快照</a></li>
                                                    <li><a href="#" @click.prevent="openBackupPanel(vm)">备份</a></li>
                                                    <li><a href="#" @click.prevent="openDeviceForward(vm, 'vm')">网络</a></li>
                                                    <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">控制台</a></li>
                                                    <li><a href="#" @click.prevent="renewResource = vm; renewShow = true">续费</a></li>
                                                    <li><a href="#" @click.prevent="openVmPasswordReset(vm)">重置密码</a></li>
                                                    <li><a href="#" @click.prevent="editVm(vm)">编辑</a></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr v-if="userVms.length === 0">
                                    <td colspan="9" class="text-center text-muted py-4">暂无虚拟机</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- LXC Section -->
        <div v-show="activeSection === 'lxc'">
            <h4 class="module-title">我的容器</h4>
            <div v-if="lxcLoading" class="text-center py-4">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">加载中...</span>
                </div>
                <p class="mt-2 text-muted">加载中...</p>
            </div>
            <div v-else class="vm-table-wrap">
                <!-- 移动端卡片视图 -->
                <div class="d-block d-md-none">
                    <div v-if="userLxcContainers.length === 0" class="text-center text-muted py-4">暂无容器</div>
                    <div v-for="ct in userLxcContainers" :key="ct.id" class="vm-mobile-card">
                        <div class="vm-mobile-card-header">
                            <div class="vm-mobile-card-title">
                                <span v-if="ct._provisioning" class="spinner-border spinner-border-sm text-primary"></span>
                                {{ ct.name || ('CT ' + ct.ct_id) }}
                                <span class="vm-mobile-card-id">#{{ ct.ct_id }}</span>
                            </div>
                            <span v-if="ct._provisioning" class="tag-pending">开通中</span>
                            <span v-else :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? '运行中' : '已停止' }}</span>
                        </div>
                        <div v-if="!ct._provisioning" class="vm-mobile-card-body">
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">内网IP</span><span class="vm-mobile-card-value">{{ ct.ip || ct.dhcp_static_ip || '-' }}</span></div>
                            <div v-if="cnameDomain" class="vm-mobile-card-row"><span class="vm-mobile-card-label">CNAME</span><span class="vm-mobile-card-value text-primary" style="line-height:1.5;"><div v-for="cname in formatCnameList(cnameDomain, ct.ct_id)" :key="cname">{{ cname }}</div></span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">配置</span><span class="vm-mobile-card-value">{{ ct.config ? (ct.config.cores || 1) + '核 ' + formatMemory(ct.config.memory) : '-' }} / {{ formatDiskSize(ct) }}</span></div>
                            <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">续费价格</span><span class="vm-mobile-card-value">{{ ct.renewal_price ? ct.renewal_price + '元/' + (ct.renewal_period === 'year' ? '年' : ct.renewal_period === 'quarter' ? '季' : '月') : '-' }}</span></div>
                            <div class="vm-mobile-card-row" v-if="ct.template_name"><span class="vm-mobile-card-label">镜像</span><span class="vm-mobile-card-value">{{ ct.template_name }}</span></div>
                        </div>
                        <div v-if="ct._provisioning" class="text-center text-muted py-2"><small>正在开通中，请稍后刷新</small></div>
                        <div v-else class="vm-mobile-card-actions">
                            <button class="table-btn btn-primary" @click="openLxcDetail(ct)">详情</button>
                            <button v-if="ct.status && ct.status.status === 'running'" class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'reboot')">重启</button>
                            <button v-if="ct.status && ct.status.status === 'running'" class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">关机</button>
                            <button v-if="ct.status && ct.status.status === 'running'" class="table-btn btn-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">停止</button>
                            <button v-if="!ct.status || ct.status.status !== 'running'" class="table-btn btn-primary" @click="startLxc(ct.ct_id)">启动</button>
                            <div class="dropdown-table">
                                <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                <ul class="dropdown-menu-table">
                                    <li><a href="#" @click.prevent="openLxcSnapshotPanel(ct)">快照</a></li>
                                    <li><a href="#" @click.prevent="openLxcBackupPanel(ct)">备份</a></li>
                                    <li><a href="#" @click.prevent="openDeviceForward(ct, 'lxc')">网络</a></li>
                                    <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">终端</a></li>
                                    <li><a href="#" @click.prevent="renewResource = ct; renewShow = true">续费</a></li>
                                    <li><a href="#" @click.prevent="editLxc(ct)">编辑</a></li>
                                    <li><a href="#" @click.prevent="openLxcPasswordReset(ct)" class="text-warning">重置密码</a></li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- 桌面端表格视图 -->
                <div class="table-container d-none d-md-block">
                    <div class="table-scroll">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>容器名称</th>
                                    <th>内网IP</th>
                                    <th>CNAME域名</th>
                                    <th>配置</th>
                                    <th>续费价格</th>
                                    <th>镜像</th>
                                    <th>状态</th>
                                    <th>操作</th>
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
                                    <td>{{ ct.ip || ct.dhcp_static_ip || '-' }}</td>
                                    <td>
                                        <template v-if="cnameDomain && !ct._provisioning">
                                            <div v-for="cname in formatCnameList(cnameDomain, ct.ct_id)" :key="cname" class="text-primary" style="line-height:1.5;">{{ cname }}</div>
                                        </template>
                                        <span v-else class="text-muted">-</span>
                                    </td>
                                    <td>{{ (ct.config ? (ct.config.cores || 1) + '核' + formatMemory(ct.config.memory) : '-') }} {{ ct._provisioning ? '' : (ct.config || ct.status ? '/ ' + formatDiskSize(ct) : '') }}</td>
                                    <td>{{ ct.renewal_price ? ct.renewal_price + '元/' + (ct.renewal_period === 'year' ? '年' : ct.renewal_period === 'quarter' ? '季' : '月') : '-' }}</td>
                                    <td>{{ ct.template_name || (ct.config ? (ct.config.ostype || '-') : '-') }}</td>
                                    <td>
                                        <template v-if="ct._provisioning">
                                            <span class="tag-pending">开通中</span>
                                        </template>
                                        <template v-else>
                                            <span :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? '运行中' : '已停止' }}</span>
                                        </template>
                                    </td>
                                    <td>
                                        <div v-if="ct._provisioning" class="text-center text-muted py-2">
                                            <small>正在开通中，请稍后刷新</small>
                                        </div>
                                        <div v-else class="table-actions">
                                            <button class="table-btn btn-primary" @click="openLxcDetail(ct)">详情</button>
                                            <div class="btn-group-table" v-if="ct.status && ct.status.status === 'running'">
                                                <button class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'reboot')">重启</button>
                                                <button class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">关机</button>
                                                <button class="table-btn btn-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">停止</button>
                                            </div>
                                            <div class="btn-group-table" v-if="!ct.status || ct.status.status !== 'running'">
                                                <button class="table-btn btn-primary" @click="startLxc(ct.ct_id)">启动</button>
                                            </div>
                                            <div class="dropdown-table">
                                                <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                                <ul class="dropdown-menu-table">
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'reboot')">重启</a></li>
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'shutdown')">关机</a></li>
                                                    <li class="d-md-none" v-if="ct.status && ct.status.status === 'running'"><a href="#" @click.prevent="requestLxcConfirm(ct.ct_id, 'stop')" class="text-danger">停止</a></li>
                                                    <li class="d-md-none" v-if="!ct.status || ct.status.status !== 'running'"><a href="#" @click.prevent="startLxc(ct.ct_id)" class="text-success">启动</a></li>
                                                    <li><a href="#" @click.prevent="openLxcSnapshotPanel(ct)">快照</a></li>
                                                    <li><a href="#" @click.prevent="openLxcBackupPanel(ct)">备份</a></li>
                                                    <li><a href="#" @click.prevent="openDeviceForward(ct, 'lxc')">网络</a></li>
                                                    <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">终端</a></li>
                                                    <li><a href="#" @click.prevent="renewResource = ct; renewShow = true">续费</a></li>
                                                    <li><a href="#" @click.prevent="editLxc(ct)">编辑</a></li>
                                                    <li><a href="#" @click.prevent="openLxcPasswordReset(ct)" class="text-warning">重置密码</a></li>
                                                </ul>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                                <tr v-if="userLxcContainers.length === 0">
                                    <td colspan="8" class="text-center text-muted py-4">暂无容器</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    </div>

<!-- 套餐订购页 -->
<div v-if="activeSection === 'order'">
    <div v-if="activeTabOrder === 'vm'">
        <h4 class="mb-4">VM 虚拟机套餐</h4>
        <div v-for="grp in vmGroupedPackages" :key="grp.group_name" class="package-group-section">
            <h5 class="package-group-title" v-if="grp.group_name !== '默认'">{{ grp.group_name }}</h5>
            <div class="package-cards">
                <div class="package-card" v-for="p in grp.packages" :key="p.id" v-show="p.status === 'active'">
                    <div class="package-card-header">{{ p.name }}</div>
                    <div class="package-card-body">
                        <div class="package-spec"><span class="spec-label">CPU 型号</span><span class="spec-value">{{ p.cpu_model || '-' }}</span></div>
                        <div class="package-spec"><span class="spec-label">vCPU 数量</span><span class="spec-value">{{ p.cores }} 核</span></div>
                        <div class="package-spec"><span class="spec-label">内存</span><span class="spec-value">{{ p.memory }} MB</span></div>
                        <div class="package-spec"><span class="spec-label">磁盘</span><span class="spec-value">{{ p.disk_size }} GB</span></div>
                        <div class="package-spec"><span class="spec-label">带宽</span><span class="spec-value">{{ p.bandwidth || '-' }} Mbps</span></div>
                        <div class="package-desc">备注：<span v-html="parseMarkdown(p.description)"></span></div>
                        <div class="package-stock">库存：{{ p.stock === -1 || p.stock === null ? '不限' : p.stock }}</div>
                        <div class="price-tabs">
                            <div class="price-tab" :class="{ 'price-tab-active': (pkgSelectedPeriod[p.id] || 'month') === 'month' }" @click="selectPackagePeriod(p.id, 'month')">
                                <span class="price-tab-badge">0%</span>
                                <span class="price-tab-label">月付</span>
                                <span class="price-tab-original" style="visibility:hidden">&nbsp;</span>
                                <span class="price-tab-price">¥{{ p.monthly_price }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'quarter' }" @click="selectPackagePeriod(p.id, 'quarter')">
                                <span class="price-tab-badge" :class="{ 'price-tab-badge-discount': p.quarterly_discount > 0 }">-{{ p.quarterly_discount || 0 }}%</span>
                                <span class="price-tab-label">季付</span>
                                <span class="price-tab-original" :style="{ visibility: p.quarterly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 3).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'quarter') }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'year' }" @click="selectPackagePeriod(p.id, 'year')">
                                <span class="price-tab-badge" :class="{ 'price-tab-badge-discount': p.yearly_discount > 0 }">-{{ p.yearly_discount || 0 }}%</span>
                                <span class="price-tab-label">年付</span>
                                <span class="price-tab-original" :style="{ visibility: p.yearly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 12).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'year') }}</span>
                            </div>
                        </div>
                        <pv-button :disabled="p.stock !== -1 && p.stock !== null && p.stock <= 0" @click="openOrderModal(p, 'vm', pkgSelectedPeriod[p.id] || 'month')">{{ (p.stock !== -1 && p.stock !== null && p.stock <= 0) ? '已售罄' : '立即开通' }}</pv-button>
                    </div>
                </div>
            </div>
            <div class="package-empty" v-if="grp.packages.length === 0">该分组暂无可用套餐</div>
        </div>
        <div class="package-empty" v-if="vmGroupedPackages.length === 0">暂无可用套餐</div>
    </div>
    <div v-if="activeTabOrder === 'lxc'">
        <h4 class="mb-4">LXC 容器套餐</h4>
        <div v-for="grp in lxcGroupedPackages" :key="grp.group_name" class="package-group-section">
            <h5 class="package-group-title" v-if="grp.group_name !== '默认'">{{ grp.group_name }}</h5>
            <div class="package-cards">
                <div class="package-card" v-for="p in grp.packages" :key="p.id" v-show="p.status === 'active'">
                    <div class="package-card-header">{{ p.name }}</div>
                    <div class="package-card-body">
                        <div class="package-spec"><span class="spec-label">CPU 型号</span><span class="spec-value">{{ p.cpu_model || '-' }}</span></div>
                        <div class="package-spec"><span class="spec-label">vCPU 数量</span><span class="spec-value">{{ p.cores }} 核</span></div>
                        <div class="package-spec"><span class="spec-label">内存</span><span class="spec-value">{{ p.memory }} MB</span></div>
                        <div class="package-spec"><span class="spec-label">磁盘</span><span class="spec-value">{{ p.disk_size }} GB</span></div>
                        <div class="package-spec"><span class="spec-label">带宽</span><span class="spec-value">{{ p.bandwidth || '-' }} Mbps</span></div>
                        <div class="package-desc">备注：<span v-html="parseMarkdown(p.description)"></span></div>
                        <div class="package-stock">库存：{{ p.stock === -1 || p.stock === null ? '不限' : p.stock }}</div>
                        <div class="price-tabs">
                            <div class="price-tab" :class="{ 'price-tab-active': (pkgSelectedPeriod[p.id] || 'month') === 'month' }" @click="selectPackagePeriod(p.id, 'month')">
                                <span class="price-tab-badge">0%</span>
                                <span class="price-tab-label">月付</span>
                                <span class="price-tab-original" style="visibility:hidden">&nbsp;</span>
                                <span class="price-tab-price">¥{{ p.monthly_price }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'quarter' }" @click="selectPackagePeriod(p.id, 'quarter')">
                                <span class="price-tab-badge" :class="{ 'price-tab-badge-discount': p.quarterly_discount > 0 }">-{{ p.quarterly_discount || 0 }}%</span>
                                <span class="price-tab-label">季付</span>
                                <span class="price-tab-original" :style="{ visibility: p.quarterly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 3).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'quarter') }}</span>
                            </div>
                            <div class="price-tab" :class="{ 'price-tab-active': pkgSelectedPeriod[p.id] === 'year' }" @click="selectPackagePeriod(p.id, 'year')">
                                <span class="price-tab-badge" :class="{ 'price-tab-badge-discount': p.yearly_discount > 0 }">-{{ p.yearly_discount || 0 }}%</span>
                                <span class="price-tab-label">年付</span>
                                <span class="price-tab-original" :style="{ visibility: p.yearly_discount > 0 ? 'visible' : 'hidden' }">¥{{ (p.monthly_price * 12).toFixed(2) }}</span>
                                <span class="price-tab-price">¥{{ getPackageFinalPrice(p, 'year') }}</span>
                            </div>
                        </div>
                        <pv-button :disabled="p.stock !== -1 && p.stock !== null && p.stock <= 0" @click="openOrderModal(p, 'lxc', pkgSelectedPeriod[p.id] || 'month')">{{ (p.stock !== -1 && p.stock !== null && p.stock <= 0) ? '已售罄' : '立即开通' }}</pv-button>
                    </div>
                </div>
            </div>
            <div class="package-empty" v-if="grp.packages.length === 0">该分组暂无可用套餐</div>
        </div>
        <div class="package-empty" v-if="lxcGroupedPackages.length === 0">暂无可用套餐</div>
    </div>
</div>

<Teleport to="body">

<div class="modal fade" id="deviceForwardModal" tabindex="-1">
    <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
            <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
                <h5 class="modal-title">{{ currentDevice.name || (currentDevice.type === 'vm' ? 'VM ' + currentDevice.deviceId : 'CT ' + currentDevice.deviceId) }} - 端口转发管理</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
            </div>
            <div class="modal-body" style="min-height:150px;">

                <!-- 规则列表 -->
                <template v-if="!showDeviceForm">
                    <div class="d-flex justify-content-between align-items-center mb-3">
                        <div><span class="text-muted small">共 {{ deviceRules.length }} 条规则</span><span class="text-muted small ms-3">剩余可用 {{ forwardConfig.remaining }} 条</span></div>
                        <pv-button variant="primary" size="sm" @click="openDeviceFormModal">添加端口转发</pv-button>
                    </div>
                    <div v-if="deviceRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>
                    <div v-else class="table-responsive mb-0">
                        <table class="table table-striped table-hover mb-0">
                            <thead><tr>
                                <th>名称</th><th>目标 IP</th><th>内网端口</th><th>外网端口</th><th>协议</th><th>状态</th><th>操作</th>
                            </tr></thead>
                            <tbody>
                                <tr v-for="rule in deviceRules" :key="rule.id" :class="{ 'text-muted': rule.sync_status === 'orphan' }">
                                    <td>{{ rule.name || '-' }}</td>
                                    <td>{{ rule.ip }}</td>
                                    <td>{{ rule.internal_port }}</td>
                                    <td>{{ rule.external_port }}</td>
                                    <td>{{ (rule.protocol || '').toUpperCase() }}</td>
                                    <td><span :class="rule.enabled ? 'text-success' : 'text-muted'">{{ rule.enabled ? '启用' : '禁用' }}</span></td>
                                    <td>
                                        <pv-button variant="outline" size="sm" @click="openDeviceEditModal(rule)" title="编辑">编辑</pv-button>
                                        <pv-button variant="outline-danger" size="sm" @click="deleteDeviceRule(rule)" title="删除">删除</pv-button>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </template>

                <!-- 添加/编辑表单 -->
                <template v-else>
                    <div class="mb-3">
                        <label class="form-label">规则名称</label>
                        <input type="text" class="form-control" v-model="deviceForm.name" placeholder="自定义备注，如 SSH 转发">
                    </div>
                    <div class="mb-3">
                        <label class="form-label">目标 IP</label>
                        <input type="text" class="form-control" v-model="deviceForm.ip" placeholder="自动获取设备 IP" readonly>
                        <small class="text-muted">目标 IP 自动从当前设备获取，不可手动修改</small>
                    </div>
                    <div class="mb-3">
                        <label class="form-label">协议</label>
                        <div>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp"> TCP</label>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="udp"> UDP</label>
                            <label class="me-3"><input type="radio" v-model="deviceForm.protocol" value="tcp+udp"> TCP+UDP</label>
                        </div>
                    </div>
                    <div class="row mb-3">
                        <div class="col-md-6">
                            <label class="form-label">内网端口</label>
                            <input type="number" class="form-control" v-model.number="deviceForm.internal_port" min="1" max="65535">
                        </div>
                        <div class="col-md-6">
                            <label class="form-label">外网端口</label>
                            <div class="input-group">
                                <input type="number" class="form-control" :class="{ 'is-invalid': deviceCheckResult === false }" v-model.number="deviceForm.external_port" min="1" max="65535">
                                <pv-button type="button" @click="randomDevicePort" variant="outline">🎲</pv-button>
                            </div>
                            <small class="text-muted">可用范围: {{ forwardConfig.port_range_start }}-{{ forwardConfig.port_range_end }}</small>
                        </div>
                    </div>
                    <div class="d-flex justify-content-end gap-2">
                        <pv-button type="button" @click="cancelDeviceForm" variant="outline">取消</pv-button>
                        <pv-button type="button" @click="submitDeviceRule" variant="primary">{{ editingDeviceRuleId ? '保存' : '添加' }}</pv-button>
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
            <h2 class="modal-title">操作确认</h2>
            <pv-button variant="close" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()"></pv-button>
        </div>
        <div class="modal-body" style="padding:24px 28px;text-align:center">
            <p style="font-size:15px;color:var(--text-primary);line-height:1.6;margin:0 0 20px">{{ confirmState?.vmId !== null ? confirmActionText : confirmLxcActionText }}</p>
            <div style="display:flex;gap:10px;justify-content:center">
                <pv-button variant="danger" @click="confirmState?.vmId !== null ? confirmAction(userVms.find(function(v){return v.id===confirmState.vmId})||userVms[0]) : confirmLxcAction(userLxcContainers.find(function(c){return c.ct_id===lxcConfirmState.ctId})||userLxcContainers[0])">确认执行</pv-button>
                <pv-button variant="outline" @click="confirmState?.vmId !== null ? cancelConfirm() : cancelLxcConfirm()">取消</pv-button>
            </div>
        </div>
    </div>
</div>

<!-- VM/CT 详情监控弹窗 -->
<div class="vm-detail-modal" :class="{ show: showVmDetail }" @click.self="closeVmDetail()">
    <div class="modal-content" style="max-width:720px">
        <div class="modal-header">
            <h2 class="modal-title">{{ detailVm._isLxc ? (detailVm.name || ('CT ' + detailVm.vm_id)) : (detailVm.name || ('VM ' + detailVm.vm_id)) }} 详情</h2>
            <pv-button variant="close" @click="closeVmDetail()"></pv-button>
        </div>
        <div class="modal-body">
            <!-- 基本信息区域 -->
            <div class="info-card">
                <div class="info-grid">
                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? '容器ID' : '虚拟机ID' }}</span><span class="info-value">{{ detailVm.vm_id || '-' }}</span></div>
                    <div class="info-item"><span class="info-label">内网IP</span><span class="info-value">{{ detailVm.ip || '-' }}</span></div>
                    <div class="info-item"><span class="info-label">硬件配置</span><span class="info-value">{{ detailVmConfigStr }}</span></div>
                    <div class="info-item"><span class="info-label">续费价格</span><span class="info-value">{{ detailVm.renewal_price ? detailVm.renewal_price + '元/' + (detailVm.renewal_period === 'year' ? '年' : detailVm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</span></div>
                    <div class="info-item">
                        <span class="info-label">到期时间</span>
                        <span class="info-value" :class="detailVm.expiration_date && new Date(detailVm.expiration_date) < new Date() ? 'text-danger' : ''">{{ detailVm.expiration_date ? formatDate(detailVm.expiration_date) : '未设置' }}</span>
                    </div>
                    <div class="info-item"><span class="info-label">{{ detailVm._isLxc ? '镜像' : '操作系统' }}</span><span class="info-value">{{ detailVmOsStr }}</span></div>
                    <div class="info-item"><span class="info-label">运行状态</span><span class="info-value">{{ detailVmStatusStr }}</span></div>
                    <div class="info-item"><span class="info-label">运行时长</span><span class="info-value">{{ detailVmUptimeStr }}</span></div>
                </div>
            </div>
            <!-- 监控图表区域 -->
            <h4 style="font-size:16px;color:var(--text-secondary);margin-bottom:16px;">实时性能监控</h4>
            <div class="chart-grid">
                <div class="chart-card"><div class="chart-title">CPU 使用率 (%)</div><canvas id="detailCpuChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">内存使用率 (%)</div><canvas id="detailMemChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">网络流量 (Mbps)</div><canvas id="detailNetChart"></canvas></div>
                <div class="chart-card"><div class="chart-title">磁盘IO (MB/s)</div><canvas id="detailDiskChart"></canvas></div>
            </div>
        </div>
    </div>
</div>
`);
})();