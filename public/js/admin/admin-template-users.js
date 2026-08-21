(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'manage'">

                    <!-- 用户管理 -->
                    <div v-if="activeTab === 'users'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.users.title') }}</h4>
                            <pv-button @click="showCreateUser = true" variant="glass">{{ t('admin.users.create') }}</pv-button>
                        </div>
                        <div class="row g-2 mb-3 align-items-end">
                            <div class="col-md-3">
                                <label class="form-label small mb-1">{{ t('admin.users.usernameEmail') }}</label>
                                <input type="text" class="form-control form-control-sm" v-model="userFilter.keyword" :placeholder="t('admin.users.searchPlaceholder')" @keyup.enter="searchUsers">
                            </div>
                            <div class="col-md-2">
                                <label class="form-label small mb-1">{{ t('admin.users.role') }}</label>
                                <select class="form-select form-select-sm" v-model="userFilter.role">
                                    <option value="">{{ t('common.all') }}</option>
                                    <option value="admin">{{ t('admin.users.adminRole') }}</option>
                                    <option value="user">{{ t('admin.users.userRole') }}</option>
                                </select>
                            </div>
                            <div class="col-md-2 d-flex gap-2">
                                <pv-button @click="searchUsers" size="sm">{{ t('admin.common.query') }}</pv-button>
                                <pv-button @click="userFilter={keyword:'',role:''};searchUsers()" variant="outline" size="sm">{{ t('common.reset') }}</pv-button>
                            </div>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 table-align-center">
                                    <thead>
                                        <tr>
                                            <th>ID</th>
                                            <th>{{ t('admin.users.avatar') }}</th>
                                            <th>{{ t('admin.users.username') }}</th>
                                            <th>{{ t('admin.users.email') }}</th>
                                            <th>{{ t('admin.users.balance') }}</th>
                                            <th>{{ t('admin.users.emailVerified') }}</th>
                                            <th>2FA</th>
                                            <th>{{ t('admin.users.role') }}</th>
                                            <th>{{ t('admin.users.createdAt') }}</th>
                                            <th>{{ t('common.actions') }}</th>
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
                                                    {{ u.emailVerified ? t('admin.users.verified') : t('admin.users.unverified') }}
                                                </span>
                                            </td>
                                            <td><span>{{ u.totp_enabled ? t('common.enabled') : '-' }}</span></td>
                                            <td><span class="badge" :class="u.role === 'admin' ? 'bg-primary' : 'bg-secondary'">{{ u.role }}</span></td>
                                            <td>{{ formatDate(u.created_at) }}</td>
                                            <td>
                                                <div class="d-flex gap-2">
                                                    <pv-button @click="rechargeUser = u; rechargeShow = true" size="sm">{{ t('admin.users.recharge') }}</pv-button>
                                                    <pv-button @click="editUser(u)" variant="primary" size="sm">{{ t('common.edit') }}</pv-button>
                                                    <pv-button variant="outline-danger" size="sm" @pv-click="deleteUser(u.id)" :disabled="u.username === 'admin'">{{ t('common.delete') }}</pv-button>
                                                </div>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                            <pv-pagination :total="userTotal" :page="userPage" :page-size="userPageSize" @change="loadUsers" @page-size-change="changeUserPageSize"></pv-pagination>
                        </div>
                    </div>

                </div>
                <!-- end packages -->

                

`);
})();
