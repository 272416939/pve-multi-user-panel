(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`


                <div v-if="activeSection === 'manage'">
                    <!-- CDK 管理 -->
                    <div v-if="activeTab === 'cdk'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('admin.cdk.title') }}</h4>
                            <div class="d-flex gap-2">
                                <pv-button @click="exportCdkCsv()" :disabled="cdkTotal === 0" variant="glass">

                                    {{ t('admin.cdk.exportAll') }}
                                
</pv-button>
                                <pv-button variant="outline-danger" size="lg" @click="cleanupCdk">

                                    {{ t('admin.cdk.cleanup') }}
                                
</pv-button>
                            </div>
                        </div>

                        <div class="card mb-4">
                            <div class="card-header">
                                <h5 class="mb-0">{{ t('admin.cdk.generate') }}</h5>
                            </div>
                            <div class="card-body">
                                <form @submit.prevent="generateCdkBatch">
                                    <!-- 第一行：续费时长 + 生成数量 -->
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-7 col-lg-8">
                                            <label class="form-label text-muted small mb-1">{{ t('dash.disk.renewDuration') }}</label>
                                            <div class="d-flex gap-2 flex-wrap align-items-center">
                                                <div class="btn-group" role="group" style="gap:4px">
                                                    <pv-button type="button" :variant="cdkForm.duration_days === 7 ? 'glass-active' : 'glass-inactive'" @click="cdkForm.duration_days = 7">{{ t('admin.cdk.d7') }}</pv-button>
                                                    <pv-button type="button" :variant="cdkForm.duration_days === 30 ? 'glass-active' : 'glass-inactive'" @click="cdkForm.duration_days = 30">{{ t('admin.cdk.d30') }}</pv-button>
                                                    <pv-button type="button" :variant="cdkForm.duration_days === 90 ? 'glass-active' : 'glass-inactive'" @click="cdkForm.duration_days = 90">{{ t('admin.cdk.d90') }}</pv-button>
                                                    <pv-button type="button" :variant="cdkForm.duration_days === 180 ? 'glass-active' : 'glass-inactive'" @click="cdkForm.duration_days = 180">{{ t('admin.cdk.halfYear') }}</pv-button>
                                                    <pv-button type="button" :variant="cdkForm.duration_days === 365 ? 'glass-active' : 'glass-inactive'" @click="cdkForm.duration_days = 365">{{ t('admin.cdk.d365') }}</pv-button>
                                                </div>
                                                <div class="input-group input-group-sm" style="width:100px;flex-shrink:0;">
                                                    <input type="number" class="form-control form-control-sm" v-model.number="cdkForm.duration_days" min="1" :placeholder="t('admin.cdk.daysLabel')">
                                                    <span class="input-group-text">{{ t('common.days') }}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-5 col-lg-4">
                                            <label class="form-label text-muted small mb-1">{{ t('admin.cdk.genCount') }}</label>
                                            <input type="number" class="form-control form-control-sm" v-model.number="cdkForm.count" min="1" max="1000" :disabled="cdkSelectedUsers.length > 0">
                                            <small class="text-muted d-block mt-1" v-if="cdkSelectedUsers.length === 0">{{ t('admin.cdk.max1000') }}</small>
                                            <small class="text-muted d-block mt-1" v-else>{{ t('admin.cdk.genPerUser1') }} {{ cdkSelectedUsers.length }} {{ t('admin.cdk.cdksSuffix') }}</small>
                                        </div>
                                    </div>
                                    <!-- 第二行：有效期 + 分配用户 -->
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-7 col-lg-6">
                                            <label class="form-label text-muted small mb-1">{{ t('admin.cdk.expiryOptional') }}</label>
                                            <input type="datetime-local" class="form-control form-control-sm" v-model="cdkForm.expires_at" step="1" onfocus="this.showPicker?.()">
                                            <small class="text-muted d-block mt-1">{{ t('admin.cdk.noExpiryHint') }}</small>
                                        </div>
                                        <div class="col-md-5 col-lg-6">
                                            <label class="form-label text-muted small mb-1">{{ t('admin.cdk.assignUsersOptional') }}</label>
                                            <div class="tag-input-wrapper">
                                                <div class="tag-list tag-list-sm">
                                                    <span v-for="(u, idx) in cdkSelectedUsers" :key="u.id" class="tag-item">
                                                        {{ u.username }}
                                                        <pv-button type="button" variant="close" @click="cdkSelectedUsers.splice(idx, 1)"></pv-button>
                                                    </span>
                                                    <input type="text" class="tag-input-field tag-input-field-sm" v-model="cdkUserSearch"
                                                           @input="cdkUserSearchOpen = true"
                                                           @focus="cdkUserSearchOpen = true"
                                                           @blur="handleCdkSearchBlur"
                                                           @keydown.delete="handleCdkSearchBackspace"
                                                           :placeholder="t('admin.cdk.searchUserPh')">
                                                </div>
                                                <div v-if="cdkUserSearchOpen && filteredUsers.length > 0" class="tag-dropdown">
                                                    <div v-for="u in filteredUsers" :key="u.id" class="tag-dropdown-item"
                                                         @mousedown.prevent="addCdkUser(u)">
                                                        {{ u.username }}
                                                    </div>
                                                </div>
                                            </div>
                                            <small class="text-muted d-block mt-1">{{ t('admin.cdk.pickUsersHint') }}</small>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="primary" :disabled="!cdkForm.duration_days || cdkForm.duration_days < 1" formnovalidate size="sm">

                                        {{ t('admin.cdk.batchGenerate') }}
                                    
</pv-button>
                                </form>
                            </div>
                        </div>

                        <div class="table-container mb-4" style="padding:12px;">
                            <div class="d-flex justify-content-between align-items-center mb-3">
                                <h5 class="mb-0">{{ t('admin.cdk.listPfx') }}{{ cdkTotal }}）</h5>
                                <div v-if="selectedCdkIds.length > 0" class="d-flex align-items-center gap-2">
                                    <span class="text-muted small">{{ t('admin.cdk.selCount') }} {{ selectedCdkIds.length }} {{ t('admin.geSuffix') }}</span>
                                    <pv-button @click="batchDeleteCdk" variant="outline-danger" size="sm">{{ t('admin.logs.batchDelete') }}</pv-button>
                                </div>
                            </div>
                            <div class="table-responsive">
                                <table class="table table-hover mb-0 table-sm table-align-center">
                                    <thead style="position: sticky; top: 0;">
                                        <tr>
                                            <th class="checkbox-col">
                                                <input type="checkbox" :checked="cdkList.length > 0 && cdkList.every(function(c) { return selectedCdkIds.indexOf(c.id) !== -1; })" @change="toggleSelectAllCdk">
                                            </th>
                                            <th>ID</th>
                                            <th>{{ t('admin.cdk.codeShort') }}</th>
                                            <th>{{ t('admin.cdk.renewDays') }}</th>
                                            <th>{{ t('admin.cdk.batch') }}</th>
                                            <th>{{ t('common.status') }}</th>
                                            <th>{{ t('admin.cdk.assignUsers') }}</th>
                                            <th>{{ t('admin.cdk.usedBy') }}</th>
                                            <th>{{ t('admin.cdk.usedVm') }}</th>
                                            <th>{{ t('admin.users.createdAt') }}</th>
                                            <th>{{ t('admin.cdk.validUntil') }}</th>
                                            <th>{{ t('admin.cdk.usedAt') }}</th>
                                            <th>{{ t('common.actions') }}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="cdk in cdkList" :key="cdk.id">
                                            <td class="checkbox-col">
                                                <input type="checkbox" :value="cdk.id" v-model="selectedCdkIds">
                                            </td>
                                            <td>{{ cdk.id }}</td>
                                            <td>
                                                <code class="user-select-all" style="cursor: pointer;" @click="copyCdkCode(cdk.code)">{{ cdk.code }}</code>
                                            </td>
                                            <td>{{ cdk.duration_days }} {{ t('common.days') }}</td>
                                            <td><small class="text-muted">{{ cdk.batch_id || '-' }}</small></td>
                                            <td>
                                                <span v-if="cdk.is_used" class="badge bg-secondary">{{ t('admin.cdk.used') }}</span>
                                                <span v-else-if="cdk.expires_at && new Date(cdk.expires_at) <= new Date()" class="badge bg-warning">{{ t('common.expired') }}</span>
                                                <span v-else class="badge bg-success">{{ t('admin.cdk.unused') }}</span>
                                            </td>
                                            <td>{{ cdk.target_username || '-' }}</td>
                                            <td>{{ cdk.used_username || '-' }}</td>
                                            <td>{{ cdk.used_vm_name || (cdk.used_vm_vmid ? 'VM ' + cdk.used_vm_vmid : '-') }}</td>
                                            <td><small>{{ formatDate(cdk.created_at) }}</small></td>
                                            <td><small>{{ cdk.expires_at ? formatDate(cdk.expires_at) : t('admin.cdk.permanent') }}</small></td>
                                            <td><small>{{ cdk.used_at ? formatDate(cdk.used_at) : '-' }}</small></td>
                                            <td>
                                                <pv-button @click="deleteCdk(cdk.id)" variant="outline-danger">{{ t('common.delete') }}</pv-button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div v-if="cdkList.length === 0" class="text-muted text-center py-4">
                                {{ t('admin.cdk.empty') }}
                            </div>
                            <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                            <pv-pagination :total="cdkTotal" :page="cdkPage" :page-size="cdkPageSize" @change="loadCdkList" @page-size-change="changeCdkPageSize"></pv-pagination>
                        </div>
                    </div>

                    <!-- 消息管理 -->
                    <div v-if="activeTab === 'messages'">
                        <div class="row justify-content-center">
                            <div class="col-md-8">
                                <div class="module-header">
                                    <h4 class="module-title">{{ t('nav.messageManage') }}</h4>
                                </div>
                                <div class="card">
                                    <div class="card-body">
                                        <form @submit.prevent="sendAdminMessage">
                                            <div class="mb-3">
                                                <label class="form-label">{{ t('admin.msg.scope') }}</label>
                                                <select class="form-select" v-model="adminMsgForm.scope">
                                                    <option value="all">{{ t('admin.msg.allUsers') }}</option>
                                                    <option value="selected">{{ t('admin.msg.specificUsers') }}</option>
                                                </select>
                                                <div v-if="adminMsgForm.scope === 'selected' && msgSelectedUsers.length > 0" class="text-info small mt-1">
                                                    {{ t('admin.msg.selectedPrefix') }} <strong>{{ msgSelectedUsers.length }}</strong> {{ t('admin.msg.receiversSuffix') }}
                                                </div>
                                                <div v-if="adminMsgForm.scope === 'all'" class="text-warning small mt-1">
                                                    {{ t('admin.msg.allUsersWarn') }}
                                                </div>
                                            </div>
                                            <div class="mb-3" v-if="adminMsgForm.scope === 'selected'">
                                                <label class="form-label">{{ t('admin.msg.pickUsers') }}</label>
                                                <div class="tag-input-wrapper">
                                                    <div class="tag-list">
                                                        <span v-for="(u, idx) in msgSelectedUsers" :key="u.id" class="tag-item">
                                                            {{ u.username }}
                                                            <pv-button type="button" variant="close" @click="msgSelectedUsers.splice(idx, 1)"></pv-button>
                                                        </span>
                                                        <input type="text" class="tag-input-field" v-model="msgUserSearch"
                                                               @input="msgUserSearchOpen = true"
                                                               @focus="msgUserSearchOpen = true"
                                                               @blur="handleMsgSearchBlur"
                                                               @keydown.delete="handleMsgSearchBackspace"
                                                               :placeholder="t('admin.msg.searchUserPh')">
                                                    </div>
                                                    <div v-if="msgUserSearchOpen && filteredMsgUsers.length > 0" class="tag-dropdown">
                                                        <div v-for="u in filteredMsgUsers" :key="u.id" class="tag-dropdown-item"
                                                             @mousedown.prevent="addMsgUser(u)">
                                                            {{ u.username }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div v-if="msgSelectedUsers.length === 0" class="text-muted small mt-1">{{ t('admin.msg.pickAtLeastOne') }}</div>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">{{ t('admin.msg.type') }}</label>
                                                <select class="form-select" v-model="adminMsgForm.type">
                                                    <option value="1">{{ t('user.message.system') }}</option>
                                                    <option value="2">{{ t('user.message.business') }}</option>
                                                    <option value="5">{{ t('user.message.cs') }}</option>
                                                </select>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">{{ t('admin.msg.title') }}</label>
                                                <input type="text" class="form-control" v-model="adminMsgForm.title" required autocomplete="off">
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">{{ t('admin.msg.content') }}</label>
                                                <textarea class="form-control" rows="4" v-model="adminMsgForm.content" required :placeholder="t('admin.msg.mdHint')"></textarea>
                                                <div class="text-muted small mt-1">
                                                    {{ t('admin.msg.mdRef') }}
                                                </div>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">{{ t('admin.msg.linkOptional') }}</label>
                                                <input type="text" class="form-control" v-model="adminMsgForm.link_url" :placeholder="t('admin.msg.linkPh')">
                                            </div>
                                            <pv-button type="submit" variant="primary" :disabled="adminSending">{{ t('common.send') }}</pv-button>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <!-- end 后台管理区域 -->
`);
})();
