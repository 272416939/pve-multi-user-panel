(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'manage'">

                    <!-- 用户管理 -->
                    <div v-if="activeTab === 'users'">
                        <div class="module-header">
                            <h4 class="module-title">用户管理</h4>
                            <pv-button @click="showCreateUser = true" variant="glass">创建用户</pv-button>
                        </div>
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-md-3">
                                <label class="form-label small mb-1">用户名/邮箱</label>
                                <input type="text" class="form-control form-control-sm" v-model="userFilter.keyword" placeholder="搜索用户名或邮箱" @keyup.enter="searchUsers">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">角色</label>
                                <select class="form-select form-select-sm" v-model="userFilter.role">
                                    <option value="">全部</option>
                                    <option value="admin">管理员</option>
                                    <option value="user">普通用户</option>
                                </select>
                            </div>
                            <div class="col-md-2 d-flex gap-2">
                                <pv-button @click="searchUsers" size="sm">查询</pv-button>
                                <pv-button @click="userFilter={keyword:'',role:''};searchUsers()" variant="outline" size="sm">重置</pv-button>
                            </div>
                        </div>
                        <div class="card">
                            <div class="table-responsive">
                                <table class="table table-striped mb-0">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>头像</th>
                                            <th>用户名</th>
                                            <th>邮箱</th>
                                            <th>余额</th>
                                            <th>邮箱验证</th>
                                            <th>2FA</th>
                                            <th>角色</th>
                                            <th>创建时间</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="u in users" :key="u.id">
                                            <td>{{ u.id }}</td>
                                            <td>
                                                <img v-if="u.avatar" :src="u.avatar" class="rounded-circle" style="width: 32px; height: 32px; object-fit: cover;">
                                                <img v-else :src="getGeekAvatar(u.username)" class="rounded-circle" style="width: 32px; height: 32px; object-fit: cover;">
                                            </td>
                                            <td>{{ u.username }}</td>
                                            <td>{{ u.email || '-' }}</td>
                                            <td>{{ parseFloat(u.balance||0).toFixed(2) }}</td>
                                            <td>
                                                <span class="badge" :class="u.emailVerified ? 'bg-success' : 'bg-warning'">
                                                    {{ u.emailVerified ? '已验证' : '未验证' }}
                                                </span>
                                            </td>
                                            <td><span>{{ u.totp_enabled ? '✅' : '-' }}</span></td>
                                            <td><span class="badge" :class="u.role === 'admin' ? 'bg-primary' : 'bg-secondary'">{{ u.role }}</span></td>
                                            <td>{{ formatDate(u.created_at) }}</td>
                                            <td>
                                                <pv-button @click="rechargeUser = u; rechargeShow = true" size="sm">充值</pv-button>
                                                <pv-button @click="editUser(u)" variant="primary">编辑</pv-button>
                                                <pv-button variant="danger" size="sm" @pv-click="deleteUser(u.id)" :disabled="u.username === 'admin'">删除</pv-button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div class="d-flex justify-content-between align-items-center mt-3" v-if="userTotal > 0">
                                <small class="text-muted">共 {{ userTotal }} 条</small>
                                <div>
                                    <pv-button :disabled="userPage <= 1" @click="loadUsers(userPage - 1)" variant="outline" size="sm">上一页</pv-button>
                                    <span class="mx-2 text-muted small">{{ userPage }} / {{ Math.ceil(userTotal / 20) || 1 }}</span>
                                    <pv-button :disabled="userPage * 20 >= userTotal" @click="loadUsers(userPage + 1)" variant="outline" size="sm">下一页</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <!-- end packages -->

                

`);
})();
