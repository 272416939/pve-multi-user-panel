(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`


                <div v-if="activeSection === 'manage'">
                    <!-- CDK 管理 -->
                    <div v-if="activeTab === 'cdk'">
                        <div class="module-header">
                            <h4 class="module-title">CDK 兑换码管理</h4>
                            <div class="d-flex gap-2">
                                <pv-button @click="exportCdkCsv()" :disabled="cdkList.length === 0" variant="glass">

                                    导出全部 CSV
                                
</pv-button>
                                <pv-button style="border-color:rgba(239,68,68,0.3);background:linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1));color:#FCA5A5;" @click="cleanupCdk" variant="glass">

                                    清理过期/已使用
                                
</pv-button>
                            </div>
                        </div>

                        <div class="card mb-4">
                            <div class="card-header">
                                <h5 class="mb-0">生成 CDK</h5>
                            </div>
                            <div class="card-body">
                                <form @submit.prevent="generateCdkBatch">
                                    <!-- 第一行：续费时长 + 生成数量 -->
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-7 col-lg-8">
                                            <label class="form-label text-muted small mb-1">续费时长</label>
                                            <div class="d-flex gap-2 flex-wrap align-items-center">
                                                <div class="btn-group" role="group">
                                                    <pv-button type="button" :class="cdkForm.duration_days === 7 ? 'btn-glass-active' : 'btn-glass-inactive'" @click="cdkForm.duration_days = 7" size="sm">7天</pv-button>
                                                    <pv-button type="button" :class="cdkForm.duration_days === 30 ? 'btn-glass-active' : 'btn-glass-inactive'" @click="cdkForm.duration_days = 30" size="sm">30天</pv-button>
                                                    <pv-button type="button" :class="cdkForm.duration_days === 90 ? 'btn-glass-active' : 'btn-glass-inactive'" @click="cdkForm.duration_days = 90" size="sm">90天</pv-button>
                                                    <pv-button type="button" :class="cdkForm.duration_days === 180 ? 'btn-glass-active' : 'btn-glass-inactive'" @click="cdkForm.duration_days = 180" size="sm">半年</pv-button>
                                                    <pv-button type="button" :class="cdkForm.duration_days === 365 ? 'btn-glass-active' : 'btn-glass-inactive'" @click="cdkForm.duration_days = 365" size="sm">1年</pv-button>
                                                </div>
                                                <div class="input-group input-group-sm" style="width:100px;flex-shrink:0;">
                                                    <input type="number" class="form-control form-control-sm" v-model.number="cdkForm.duration_days" min="1" placeholder="天数">
                                                    <span class="input-group-text">天</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="col-md-5 col-lg-4">
                                            <label class="form-label text-muted small mb-1">生成数量</label>
                                            <input type="number" class="form-control form-control-sm" v-model.number="cdkForm.count" min="1" max="1000" :disabled="cdkSelectedUsers.length > 0">
                                            <small class="text-muted d-block mt-1" v-if="cdkSelectedUsers.length === 0">最多 1000 个</small>
                                            <small class="text-muted d-block mt-1" v-else>已按选中用户数生成 {{ cdkSelectedUsers.length }} 个 CDK</small>
                                        </div>
                                    </div>
                                    <!-- 第二行：有效期 + 分配用户 -->
                                    <div class="row g-3 mb-3">
                                        <div class="col-md-7 col-lg-6">
                                            <label class="form-label text-muted small mb-1">CDK 有效期（可选）</label>
                                            <input type="datetime-local" class="form-control form-control-sm" v-model="cdkForm.expires_at" step="1" onfocus="this.showPicker?.()">
                                            <small class="text-muted d-block mt-1">留空则永不过期</small>
                                        </div>
                                        <div class="col-md-5 col-lg-6">
                                            <label class="form-label text-muted small mb-1">分配给指定用户（可选）</label>
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
                                                           placeholder="搜索用户名...">
                                                </div>
                                                <div v-if="cdkUserSearchOpen && filteredUsers.length > 0" class="tag-dropdown">
                                                    <div v-for="u in filteredUsers" :key="u.id" class="tag-dropdown-item"
                                                         @mousedown.prevent="addCdkUser(u)">
                                                        {{ u.username }}
                                                    </div>
                                                </div>
                                            </div>
                                            <small class="text-muted d-block mt-1">搜索并选择用户，每人自动获得一个 CDK</small>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="primary" :disabled="!cdkForm.duration_days || cdkForm.duration_days < 1" formnovalidate size="sm">

                                        批量生成 CDK
                                    
</pv-button>
                                </form>
                            </div>
                        </div>

                        <div class="card">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">CDK 列表（{{ cdkList.length }}）</h5>
                                <div v-if="selectedCdkIds.length > 0" class="d-flex align-items-center gap-2">
                                    <span class="text-muted small">已选 {{ selectedCdkIds.length }} 个</span>
                                    <pv-button @click="batchDeleteCdk" variant="outline-danger" size="sm">批量删除</pv-button>
                                </div>
                            </div>
                            <div class="table-responsive" style="max-height: 500px; overflow-y: auto;">
                                <table class="table table-striped mb-0 table-sm">
                                    <thead style="position: sticky; top: 0;">
                                        <tr>
                                            <th style="width: 40px;">
                                                <input type="checkbox" :checked="selectedCdkIds.length === cdkList.length && cdkList.length > 0" @change="toggleSelectAllCdk">
                                            </th>
                                            <th>ID</th>
                                            <th>兑换码</th>
                                            <th>续费天数</th>
                                            <th>批次</th>
                                            <th>状态</th>
                                            <th>分配用户</th>
                                            <th>使用人</th>
                                            <th>使用 VM</th>
                                            <th>创建时间</th>
                                            <th>有效期至</th>
                                            <th>使用时间</th>
                                            <th>操作</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr v-for="cdk in cdkList" :key="cdk.id">
                                            <td>
                                                <input type="checkbox" :value="cdk.id" v-model="selectedCdkIds">
                                            </td>
                                            <td>{{ cdk.id }}</td>
                                            <td>
                                                <code class="user-select-all" style="cursor: pointer;" @click="copyCdkCode(cdk.code)">{{ cdk.code }}</code>
                                            </td>
                                            <td>{{ cdk.duration_days }} 天</td>
                                            <td><small class="text-muted">{{ cdk.batch_id || '-' }}</small></td>
                                            <td>
                                                <span v-if="cdk.is_used" class="badge bg-secondary">已使用</span>
                                                <span v-else-if="cdk.expires_at && new Date(cdk.expires_at) <= new Date()" class="badge bg-warning">已过期</span>
                                                <span v-else class="badge bg-success">未使用</span>
                                            </td>
                                            <td>{{ cdk.target_username || '-' }}</td>
                                            <td>{{ cdk.used_username || '-' }}</td>
                                            <td>{{ cdk.used_vm_name || (cdk.used_vm_vmid ? 'VM ' + cdk.used_vm_vmid : '-') }}</td>
                                            <td><small>{{ formatDate(cdk.created_at) }}</small></td>
                                            <td><small>{{ cdk.expires_at ? formatDate(cdk.expires_at) : '永久' }}</small></td>
                                            <td><small>{{ cdk.used_at ? formatDate(cdk.used_at) : '-' }}</small></td>
                                            <td>
                                                <pv-button @click="deleteCdk(cdk.id)" variant="outline-danger">删除</pv-button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                            <div v-if="cdkList.length === 0" class="text-muted text-center py-4">
                                暂无 CDK 兑换码
                            </div>
                        </div>
                    </div>

                    <!-- 消息管理 -->
                    <div v-if="activeTab === 'messages'">
                        <div class="row justify-content-center">
                            <div class="col-md-8">
                                <h4 class="module-title">消息管理</h4>
                                <div class="card">
                                    <div class="card-body">
                                        <form @submit.prevent="sendAdminMessage">
                                            <div class="mb-3">
                                                <label class="form-label">推送范围</label>
                                                <select class="form-select" v-model="adminMsgForm.scope">
                                                    <option value="all">全体用户</option>
                                                    <option value="selected">指定用户（可多选）</option>
                                                </select>
                                                <div v-if="adminMsgForm.scope === 'selected' && msgSelectedUsers.length > 0" class="text-info small mt-1">
                                                    已选择 <strong>{{ msgSelectedUsers.length }}</strong> 位接收用户，确认发送后将同步推送站内消息
                                                </div>
                                                <div v-if="adminMsgForm.scope === 'all'" class="text-warning small mt-1">
                                                    全体推送将下发给平台全部注册用户，请谨慎发布公告
                                                </div>
                                            </div>
                                            <div class="mb-3" v-if="adminMsgForm.scope === 'selected'">
                                                <label class="form-label">选择用户（可多选）</label>
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
                                                               placeholder="输入用户名搜索...">
                                                    </div>
                                                    <div v-if="msgUserSearchOpen && filteredMsgUsers.length > 0" class="tag-dropdown">
                                                        <div v-for="u in filteredMsgUsers" :key="u.id" class="tag-dropdown-item"
                                                             @mousedown.prevent="addMsgUser(u)">
                                                            {{ u.username }}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div v-if="msgSelectedUsers.length === 0" class="text-muted small mt-1">请至少选择一个用户</div>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">消息类型</label>
                                                <select class="form-select" v-model="adminMsgForm.type">
                                                    <option value="1">系统公告</option>
                                                    <option value="2">业务通知</option>
                                                    <option value="5">客服私聊</option>
                                                </select>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">消息标题</label>
                                                <input type="text" class="form-control" v-model="adminMsgForm.title" required autocomplete="off">
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">消息内容</label>
                                                <textarea class="form-control" rows="4" v-model="adminMsgForm.content" required placeholder="支持Markdown语法，可设置标题、链接、加粗、列表等格式"></textarea>
                                                <div class="text-muted small mt-1">
                                                    格式快捷参考：**加粗**、[超链接](url)、#标题、-无序列表
                                                </div>
                                            </div>
                                            <div class="mb-3">
                                                <label class="form-label">关联链接（可选）</label>
                                                <input type="text" class="form-control" v-model="adminMsgForm.link_url" placeholder="如 /user/vms">
                                            </div>
                                            <pv-button type="submit" variant="primary" :disabled="adminSending">发送</pv-button>
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
