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
                        </div>
                    </div>

                </div>
                <!-- end packages -->

                

`);
})();
