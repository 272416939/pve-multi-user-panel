(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'vms'">
                    <div v-if="activeTabVm === 'manage'">
                        <div class="module-header">
                            <h4 class="module-title">虚拟机列表</h4>
                        </div>
                    <div v-if="vmsLoading" class="text-center py-4">
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
                                        {{ vm.name || ('VM ' + vm.vm_id) }}
                                        <span class="vm-mobile-card-id">#{{ vm.vm_id }}</span>
                                    </div>
                                    <span :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? '运行中' : '已停止' }}</span>
                                </div>
                                <div class="vm-mobile-card-body">
                                    <div class="vm-mobile-card-row" v-if="vm.username"><span class="vm-mobile-card-label">用户</span><span class="vm-mobile-card-value">{{ vm.username }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">内网IP</span><span class="vm-mobile-card-value">{{ vm.ip || vm.dhcp_static_ip || '-' }}</span></div>
                                    <div v-if="networkConfig.cname_domain" class="vm-mobile-card-fullrow"><span class="vm-mobile-card-label">CNAME域名</span><div class="vm-mobile-card-value text-primary" style="line-height:1.5;"><span v-for="cname in formatCnameList(networkConfig.cname_domain, vm.vm_id)" :key="cname" style="display:block;">{{ cname }}</span></div></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">配置</span><span class="vm-mobile-card-value">{{ vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + '核 ' + formatMemory(vm.config.memory) : '-' }} / {{ formatDiskSize(vm) }}</span></div>
                                    <div class="vm-mobile-card-row"><span class="vm-mobile-card-label">续费价格</span><span class="vm-mobile-card-value">{{ vm.renewal_price ? vm.renewal_price + '元/' + (vm.renewal_period === 'year' ? '年' : vm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</span></div>
                                </div>
                                <div class="vm-mobile-card-actions">
                                    <button class="table-btn btn-primary" @click="openVmDetail(vm)">详情</button>
                                    <button v-if="vm.status && vm.status.status === 'running'" class="table-btn" @click="requestConfirm(vm.id, 'reboot')">重启</button>
                                    <button v-if="vm.status && vm.status.status === 'running'" class="table-btn" @click="requestConfirm(vm.id, 'shutdown')">关机</button>
                                    <button v-if="vm.status && vm.status.status === 'running'" class="table-btn btn-danger" @click="requestConfirm(vm.id, 'stop')">停止</button>
                                    <button v-if="!vm.status || vm.status.status !== 'running'" class="table-btn btn-primary" @click="startVm(vm.vm_id)">开机</button>
                                    <button v-if="!vm.status || vm.status.status !== 'running'" class="table-btn btn-danger" @click="openDestroyVmModal(vm)">销毁</button>
                                    <div class="dropdown-table">
                                        <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                        <ul class="dropdown-menu-table">
                                            <li><a href="#" @click.prevent="openSnapshotPanel(vm)">快照</a></li>
                                            <li><a href="#" @click.prevent="openBackupPanel(vm)">备份</a></li>
                                            <li><a href="#" @click.prevent="openDeviceForward(vm, 'vm')">网络</a></li>
                                            <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">控制台</a></li>
                                            <li><a href="#" @click.prevent="editVm(vm)">编辑</a></li>
                                            <li><a href="#" @click.prevent="openResetVmIpModal(vm)" class="text-warning">重置IP</a></li>
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
                                            <th>VMID</th>
                                            <th>用户</th>
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
                                        <tr v-for="vm in userVms" :key="vm.id">
                                            <td>{{ vm.vm_id }}</td>
                                            <td>{{ vm.username || '-' }}</td>
                                            <td>{{ vm.name || ('VM ' + vm.vm_id) }}</td>
                                            <td>{{ vm.config?.ciuser || '未安装Cloud-init驱动' }}</td>
                                            <td>{{ vm.ip || vm.dhcp_static_ip || '-' }}</td>
                                            <td>
                                                <template v-if="networkConfig.cname_domain">
                                                    <div v-for="cname in formatCnameList(networkConfig.cname_domain, vm.vm_id)" :key="cname" class="text-primary" style="line-height:1.5;">{{ cname }}</div>
                                                </template>
                                                <span v-else class="text-muted">-</span>
                                            </td>
                                            <td>{{ (vm.config ? (vm.config.sockets||1) + '*' + (vm.config.cores||1) + '核 ' + formatMemory(vm.config.memory) : '-') }} {{ vm.config || vm.status ? '/ ' + formatDiskSize(vm) : '' }}</td>
                                            <td>{{ vm.renewal_price ? vm.renewal_price + '元/' + (vm.renewal_period === 'year' ? '年' : vm.renewal_period === 'quarter' ? '季' : '月') : '-' }}</td>
                                            <td>{{ vm.os || (vm.config ? (vm.config.ostype || '-') : '-') }}</td>
                                            <td><span :class="vm.status && vm.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ vm.status && vm.status.status === 'running' ? '运行中' : '已停止' }}</span></td>
                                            <td>
                                                <div class="table-actions">
                                                    <button class="table-btn btn-primary" @click="openVmDetail(vm)">详情</button>
                                                    <div class="btn-group-table" v-if="vm.status && vm.status.status === 'running'">
                                                        <button class="table-btn" @click="requestConfirm(vm.id, 'reboot')">重启</button>
                                                        <button class="table-btn" @click="requestConfirm(vm.id, 'shutdown')">关机</button>
                                                        <button class="table-btn btn-danger" @click="requestConfirm(vm.id, 'stop')">停止</button>
                                                    </div>
                                                    <div class="btn-group-table" v-if="!vm.status || vm.status.status !== 'running'">
                                                        <button class="table-btn btn-primary" @click="startVm(vm.vm_id)">开机</button>
                                                        <button class="table-btn btn-warning" @click="removeVmById(vm.id)">移除</button>
                                                        <button class="table-btn btn-danger" @click="openDestroyVmModal(vm)">销毁</button>
                                                    </div>
                                                    <div class="dropdown-table">
                                                        <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                                        <ul class="dropdown-menu-table">
                                                            <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'reboot')">重启</a></li>
                                                            <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'shutdown')">关机</a></li>
                                                            <li class="d-md-none" v-if="vm.status && vm.status.status === 'running'"><a href="#" @click.prevent="requestConfirm(vm.id, 'stop')" class="text-danger">停止</a></li>
                                                            <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="startVm(vm.vm_id)" class="text-success">开机</a></li>
                                                            <li class="d-md-none" v-if="!vm.status || vm.status.status !== 'running'"><a href="#" @click.prevent="openDestroyVmModal(vm)" class="text-danger">销毁</a></li>
                                                            <li><a href="#" @click.prevent="openSnapshotPanel(vm)">快照</a></li>
                                                            <li><a href="#" @click.prevent="openBackupPanel(vm)">备份</a></li>
                                                            <li><a href="#" @click.prevent="openDeviceForward(vm, 'vm')">网络</a></li>
                                                            <li><a href="#" @click.prevent="openVncConsole(vm.vm_id)">控制台</a></li>
                                                            <li><a href="#" @click.prevent="editVm(vm)">编辑</a></li>
                                                            <li><a href="#" @click.prevent="openResetVmIpModal(vm)" class="text-warning">重置IP</a></li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                        <tr v-if="userVms.length === 0">
                                            <td colspan="10" class="text-center text-muted py-4">暂无虚拟机</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                    <div v-if="!vmsLoading && userVms.length === 0" class="text-muted text-center py-4">
                        暂无虚拟机
                    </div>
                    </div>
                    <div v-if="activeTabVm === 'assign'">
                        <div class="module-header">
                            <h4 class="module-title">分配虚拟机</h4>
                            <pv-button style="border-color:rgba(251,191,36,0.3);background:linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1));color:#FCD34D;" @click="checkExpired" variant="glass">

                                立即检查过期虚拟机
                            
</pv-button>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="assignVm" novalidate>
                                    <div class="row">
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">虚拟机</label>
                                            <select class="form-select" v-model="assignForm.vm_id" required>
                                                <option value="">请选择</option>
                                                <option v-for="vm in availableVms" :key="vm.vmid" :value="vm.vmid">
                                                    {{ vm.name || 'VM ' + vm.vmid }} ({{ vm.vmid }})
                                                </option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">用户</label>
                                            <select class="form-select" v-model="assignForm.user_id" required>
                                                <option value="">请选择</option>
                                                <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">名称</label>
                                            <input type="text" class="form-control" v-model="assignForm.name">
                                        </div>
                                        <div class="col-md-4 mb-3">
                                            <label class="form-label">到期时间</label>
                                            <input type="datetime-local" class="form-control" v-model="assignForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">续费价格</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="assignForm.renewal_price" placeholder="如: 50.00">
                                        </div>
                                        <div class="col-md-1 mb-3">
                                            <label class="form-label">周期</label>
                                            <select class="form-select" v-model="assignForm.renewal_period">
                                                <option value="month">月（30天计）</option>
                                                <option value="quarter">季（90天计）</option>
                                                <option value="year">年（365天计）</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">月付原价</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="assignForm.monthly_price" placeholder="如 20">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">季付折扣(%)</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="assignForm.quarterly_discount" placeholder="如 5（表示5%）">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">年付折扣(%)</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="assignForm.yearly_discount" placeholder="如 10（表示10%）">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">MAC分组</label>
                                            <select class="form-select" v-model="assignForm.mac_group_id">
                                                <option value="">不加入分组</option>
                                                <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" formnovalidate>分配</pv-button>
                                </form>
                            </div>
                        </div>

                        <div v-show="availableVms.length === 0 && assignedVms.length === 0" class="text-muted text-center py-4">
                            没有找到虚拟机，请确认 PVE 服务已启动
                        </div>

                        <div v-show="availableVms.length > 0">
                            <h5>待分配的虚拟机:</h5>
                            <div class="card mb-4">
                                <div class="table-responsive">
                                    <table class="table table-striped mb-0">
                                        <thead>
                                            <tr>
                                                <th>VM ID</th>
                                                <th>名称</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="vm in availableVms" :key="vm.vmid">
                                                <td>{{ vm.vmid }}</td>
                                                <td>{{ vm.name || '-' }}</td>
                                                <td>
                                                    <span :class="vm.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ vm.status === 'running' ? '运行中' : '已停止' }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div v-show="assignedVms.length > 0">
                            <h5>已分配的虚拟机:</h5>
                            <div class="card">
                                <div class="table-responsive">
                                    <table class="table table-striped mb-0">
                                        <thead>
                                            <tr>
                                                <th>VM ID</th>
                                                <th>名称</th>
                                                <th>分配给</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="vm in assignedVms" :key="vm.vmid">
                                                <td>{{ vm.vmid }}</td>
                                                <td>{{ vm.name || '-' }}</td>
                                                <td>{{ vm.assigned_user || '-' }}</td>
                                                <td>
                                                    <span :class="vm.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ vm.status === 'running' ? '运行中' : '已停止' }}
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
