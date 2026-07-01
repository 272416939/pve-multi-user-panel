(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'lxc'" class="lxc-section">

                    <!-- Tab 1: 新建 LXC 容器 -->
                    <div v-if="activeTabLxc === 'create'">
                        <div class="card">
                            <div class="card-header"><h5 class="mb-0">新建 LXC 容器</h5></div>
                            <div class="card-body">
                                <form @submit.prevent="createLxc" novalidate>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">模板</label>
                                            <select class="form-select" v-model="lxcForm.ostemplate" required>
                                                <option value="">请选择模板</option>
                                                <option v-for="tpl in lxcTemplates" :key="tpl.volid" :value="tpl.volid">{{ lxcTemplateLabel(tpl) }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">存储位置</label>
                                            <select class="form-select" v-model="lxcForm.storage">
                                                <option value="">默认</option>
                                                <option v-for="s in lxcStorageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">主机名</label>
                                            <input type="text" class="form-control" v-model="lxcForm.hostname" placeholder="例如: my-container" required>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">CPU 核心数</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.cores" min="1" max="64">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">磁盘 (GB)</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.disk" min="1" max="1000">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">内存 (MB)</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.memory" min="64" max="1048576">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">Swap (MB)</label>
                                            <input type="number" class="form-control" v-model.number="lxcForm.swap" min="0" max="1048576">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Root 密码</label>
                                            <input type="password" class="form-control" v-model="lxcForm.password" autocomplete="new-password">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">确认密码</label>
                                            <input type="password" class="form-control" v-model="lxcForm.confirmPassword" autocomplete="new-password">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">网络桥接</label>
                                            <select class="form-select" v-model="lxcForm.net0Bridge">
                                                <option value="vmbr0">vmbr0</option>
                                                <option value="vmbr1">vmbr1</option>
                                            </select>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">IPv4（留空=DHCP）</label>
                                            <div class="input-group">
                                                <input type="text" class="form-control" v-model="lxcForm.net0Ip" placeholder="如: 192.168.1.100/24">
                                                <pv-button type="button" @click="randomLxcCreateIp" title="随机生成 DHCP 范围内未绑定的 IP" variant="outline">🎲</pv-button>
                                            </div>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">MAC（留空=自动）</label>
                                            <input type="text" class="form-control" v-model="lxcForm.net0Mac" placeholder="自动生成">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">特性</label>
                                            <input type="text" class="form-control" v-model="lxcForm.features" placeholder="如: nesting=1,fuse=1">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">IPv6（留空=DHCP）</label>
                                            <input type="text" class="form-control" v-model="lxcForm.net0Ip6" placeholder="如: 2001:db8::1/64">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="lxcUnprivileged" v-model="lxcForm.unprivileged">
                                                <label class="form-check-label" for="lxcUnprivileged">非特权容器（推荐）</label>
                                            </div>
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-check">
                                                <input type="checkbox" class="form-check-input" id="lxcStart" v-model="lxcForm.start">
                                                <label class="form-check-label" for="lxcStart">创建后自动启动</label>
                                            </div>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" >创建容器</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>

                    <!-- Tab 2: 分配 LXC 容器 -->
                    <div v-if="activeTabLxc === 'assign'">
                        <div class="module-header">
                            <h4 class="module-title">分配 LXC 容器</h4>
                            <pv-button style="border-color:rgba(251,191,36,0.3);background:linear-gradient(135deg, rgba(251,191,36,0.15), rgba(245,158,11,0.1));color:#FCD34D;" @click="checkExpired" variant="glass">

                                立即检查过期容器
                            
</pv-button>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="assignLxc" novalidate>
                                    <div class="row">
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">容器</label>
                                            <select class="form-select" v-model="lxcAssignForm.ct_id" required>
                                                <option value="">请选择</option>
                                                <option v-for="ct in lxcContainers" :key="ct.vmid" :value="ct.vmid">
                                                    {{ ct.name || 'CT ' + ct.vmid }} ({{ ct.vmid }})
                                                </option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">用户</label>
                                            <select class="form-select" v-model="lxcAssignForm.user_id" required>
                                                <option value="">请选择</option>
                                                <option v-for="u in users" :key="u.id" :value="u.id">{{ u.username }}</option>
                                            </select>
                                        </div>
                                        <div class="col-md-3 mb-3">
                                            <label class="form-label">名称</label>
                                            <input type="text" class="form-control" v-model="lxcAssignForm.name">
                                        </div>
                                        <div class="col-md-4 mb-3">
                                            <label class="form-label">到期时间</label>
                                            <input type="datetime-local" class="form-control" v-model="lxcAssignForm.expiration_date" step="1" onfocus="this.showPicker?.()">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">续费价格</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="lxcAssignForm.renewal_price" placeholder="如: 50.00">
                                        </div>
                                        <div class="col-md-1 mb-3">
                                            <label class="form-label">周期</label>
                                            <select class="form-select" v-model="lxcAssignForm.renewal_period">
                                                <option value="month">月（30天计）</option>
                                                <option value="quarter">季（90天计）</option>
                                                <option value="year">年（365天计）</option>
                                            </select>
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">月付原价</label>
                                            <input type="number" step="0.01" min="0" class="form-control" v-model="lxcAssignForm.monthly_price" placeholder="如 20">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">季付折扣(%)</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="lxcAssignForm.quarterly_discount" placeholder="如 5（表示5%）">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">年付折扣(%)</label>
                                            <input type="number" step="1" min="0" max="100" class="form-control" v-model="lxcAssignForm.yearly_discount" placeholder="如 10（表示10%）">
                                        </div>
                                        <div class="col-md-2 mb-3">
                                            <label class="form-label">MAC分组</label>
                                            <select class="form-select" v-model="lxcAssignForm.mac_group_id">
                                                <option value="">不加入分组</option>
                                                <option v-for="g in macGroups" :key="g.id" :value="g.id">{{ g.group_name || '分组 ' + g.id }}</option>
                                            </select>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" formnovalidate>分配</pv-button>
                                </form>
                            </div>
                        </div>

                        <div v-show="availableLxc.length === 0 && assignedLxc.length === 0" class="text-muted text-center py-4">
                            没有找到容器
                        </div>

                        <div v-show="availableLxc.length > 0">
                            <h5>待分配的容器:</h5>
                            <div class="card mb-4">
                                <div class="table-responsive">
                                    <table class="table table-striped mb-0">
                                        <thead>
                                            <tr>
                                                <th>CT ID</th>
                                                <th>名称</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="ct in availableLxc" :key="ct.vmid">
                                                <td>{{ ct.vmid }}</td>
                                                <td>{{ ct.name || '-' }}</td>
                                                <td>
                                                    <span :class="ct.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ ct.status === 'running' ? '运行中' : '已停止' }}
                                                    </span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div v-show="assignedLxc.length > 0">
                            <h5>已分配的容器:</h5>
                            <div class="card">
                                <div class="table-responsive">
                                    <table class="table table-striped mb-0">
                                        <thead>
                                            <tr>
                                                <th>CT ID</th>
                                                <th>名称</th>
                                                <th>分配给</th>
                                                <th>状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="ct in assignedLxc" :key="ct.vmid">
                                                <td>{{ ct.vmid }}</td>
                                                <td>{{ ct.name || '-' }}</td>
                                                <td>{{ ct.assigned_user || '-' }}</td>
                                                <td>
                                                    <span :class="ct.status === 'running' ? 'tag-run' : 'tag-stop'">
                                                        {{ ct.status === 'running' ? '运行中' : '已停止' }}
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
                        <div v-if="lxcLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">加载中...</span>
                            </div>
                            <p class="mt-2 text-muted">加载中...</p>
                        </div>
                        <div v-else class="vm-table-wrap">
                            <div class="table-container">
                                <div class="table-scroll">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>CTID</th>
                                                <th>用户</th>
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
                                            <tr v-for="ct in userLxcContainers" :key="ct.id">
                                                <td>{{ ct.ct_id }}</td>
                                                <td>{{ ct.username || '-' }}</td>
                                                <td>{{ ct.name || ('CT ' + ct.ct_id) }}</td>
                                                <td>{{ ct.ip || ct.dhcp_static_ip || '-' }}</td>
                                                <td>
                                                    <template v-if="networkConfig.cname_domain">
                                                        <div v-for="cname in formatCnameList(networkConfig.cname_domain, ct.ct_id)" :key="cname" class="text-primary" style="line-height:1.5;">{{ cname }}</div>
                                                    </template>
                                                    <span v-else class="text-muted">-</span>
                                                </td>
                                                <td>{{ (ct.config ? (ct.config.cores || 1) + '核' + formatMemory(ct.config.memory) : '-') }} {{ ct.config || ct.status ? '/ ' + formatDiskSize(ct) : '' }}</td>
                                                <td>{{ ct.renewal_price ? ct.renewal_price + '元/' + (ct.renewal_period === 'year' ? '年' : ct.renewal_period === 'quarter' ? '季' : '月') : '-' }}</td>
                                                <td>{{ ct.template_name || (ct.config ? (ct.config.ostype || '-') : '-') }}</td>
                                                <td><span :class="ct.status && ct.status.status === 'running' ? 'tag-run' : 'tag-stop'">{{ ct.status && ct.status.status === 'running' ? '运行中' : '已停止' }}</span></td>
                                                <td>
                                                    <div class="table-actions">
                                                        <button class="table-btn btn-primary" @click="openLxcDetail(ct)">详情</button>
                                                        <div class="btn-group-table" v-if="ct.status && ct.status.status === 'running'">
                                                            <button class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'reboot')">重启</button>
                                                            <button class="table-btn" @click="requestLxcConfirm(ct.ct_id, 'shutdown')">关机</button>
                                                            <button class="table-btn btn-danger" @click="requestLxcConfirm(ct.ct_id, 'stop')">停止</button>
                                                        </div>
                                                        <div class="btn-group-table" v-if="!ct.status || ct.status.status !== 'running'">
                                                            <button class="table-btn btn-primary" @click="startLxc(ct.ct_id)">启动</button>
                                                            <button class="table-btn btn-warning" @click="removeLxcById(ct.id)">移除</button>
                                                            <button class="table-btn btn-danger" @click="openDestroyLxcModalFromList(ct)">销毁</button>
                                                        </div>
                                                        <div class="dropdown-table">
                                                            <button class="table-btn dropdown-toggle" @click.stop="toggleAdminDropdown($event.currentTarget)">更多</button>
                                                            <ul class="dropdown-menu-table">
                                                                <li><a href="#" @click.prevent="openLxcSnapshotPanel(ct)">快照</a></li>
                                                                <li><a href="#" @click.prevent="openLxcBackupPanel(ct)">备份</a></li>
                                                                <li><a href="#" @click.prevent="openDeviceForward(ct, 'lxc')">网络</a></li>
                                                                <li><a href="#" @click.prevent="openLxcTerminal(ct.ct_id)">终端</a></li>
                                                                <li><a href="#" @click.prevent="editLxc(ct)">编辑</a></li>
                                                                <li><a href="#" @click.prevent="openResetLxcIpModal(ct)" class="text-warning">重置IP</a></li>
                                                                <li><a href="#" @click.prevent="openResetLxcPasswordModal(ct)" class="text-warning">重置密码</a></li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                            <tr v-if="userLxcContainers.length === 0">
                                                <td colspan="9" class="text-center text-muted py-4">暂无 LXC 容器</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                        <div v-if="!lxcLoading && userLxcContainers.length === 0" class="text-muted text-center py-4">
                            暂无 LXC 容器
                        </div>
                    </div>
                </div>

                <!-- 后台管理区域 -->
                

`);
})();
