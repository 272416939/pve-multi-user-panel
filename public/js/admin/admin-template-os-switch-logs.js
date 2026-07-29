(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 系统切换日志 -->
    <div v-if="activeSection === 'os-switch-logs'">
        <div class="admin-card" v-if="osSwitchLogsPage">
            <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
                <h3 class="mb-0">系统切换日志</h3>
                <div class="d-flex gap-2">
                    <pv-button variant="outline-danger" size="sm" @click="osSwitchLogsPage.batchDelete()">批量删除</pv-button>
                    <pv-button variant="danger" size="sm" @click="osSwitchLogsPage.clearAll()">清空全部</pv-button>
                </div>
            </div>
            <!-- 筛选栏 -->
            <div class="px-3 py-2 d-flex flex-wrap gap-2 align-items-center border-bottom">
                <select class="form-select form-select-sm" style="width:130px" v-model="osSwitchLogsPage.filters.status">
                    <option value="">全部状态</option>
                    <option value="success">成功</option>
                    <option value="failed">失败</option>
                    <option value="running">运行中</option>
                    <option value="pending">等待中</option>
                    <option value="rollback">已回滚</option>
                </select>
                <input class="form-control form-control-sm" style="width:120px" v-model="osSwitchLogsPage.filters.vm_id" placeholder="VMID" type="number">
                <input class="form-control form-control-sm" style="width:120px" v-model="osSwitchLogsPage.filters.user_id" placeholder="用户ID" type="number">
                <pv-button size="sm" @click="osSwitchLogsPage.load()">筛选</pv-button>
                <pv-button size="sm" variant="outline" @click="osSwitchLogsPage.resetFilters()">重置</pv-button>
                <span class="text-muted small ms-auto">共 {{ osSwitchLogsPage.total }} 条</span>
            </div>
            <div class="table-responsive">
                <table class="table table-hover align-middle table-align-center">
                    <thead class="table-light">
                        <tr>
                            <th style="width:40px"><input type="checkbox" @change="osSwitchLogsPage.toggleAll($event)" :checked="osSwitchLogsPage.isAllSelected()"></th>
                            <th>ID</th>
                            <th>VMID</th>
                            <th>用户</th>
                            <th>从系统</th>
                            <th>到系统</th>
                            <th>状态</th>
                            <th>金额</th>
                            <th>开始时间</th>
                            <th>完成时间</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="row in osSwitchLogsPage.list" :key="row.id">
                            <td><input type="checkbox" :checked="osSwitchLogsPage.selectedIds.includes(row.id)" @change="osSwitchLogsPage.toggleOne(row.id)"></td>
                            <td>{{ row.id }}</td>
                            <td>{{ row.vm_id }}</td>
                            <td>{{ row.user_id }}</td>
                            <td class="text-muted small">{{ row.from_os_template_id || '-' }}</td>
                            <td>{{ row.to_os_template_id }}</td>
                            <td>
                                <span :class="'badge ' + {
                                    success: 'bg-success',
                                    failed: 'bg-danger',
                                    running: 'bg-primary',
                                    pending: 'bg-warning text-dark',
                                    rollback: 'bg-secondary'
                                }[row.status] || 'bg-secondary'">{{ row.status }}</span>
                                <span v-if="row.admin_intervention_required" class="badge bg-danger ms-1">需介入</span>
                            </td>
                            <td>{{ row.amount_charged > 0 ? '¥' + row.amount_charged : '-' }}</td>
                            <td class="small">{{ row.started_at ? formatTime(row.started_at) : '-' }}</td>
                            <td class="small">{{ row.finished_at ? formatTime(row.finished_at) : '-' }}</td>
                            <td>
                                <div class="d-flex gap-1">
                                    <pv-button size="sm" @click="osSwitchLogsPage.showDetail(row)">详情</pv-button>
                                    <pv-button size="sm" variant="danger" @click="osSwitchLogsPage.deleteRow(row.id)" :disabled="row.status === 'running'">删除</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="osSwitchLogsPage.list.length === 0">
                            <td colspan="11" class="text-center text-muted py-4">暂无切换日志</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <!-- 分页 -->
            <div class="px-3 py-2 d-flex justify-content-between align-items-center" v-if="osSwitchLogsPage.totalPages > 1">
                <small class="text-muted">第 {{ osSwitchLogsPage.page }} / {{ osSwitchLogsPage.totalPages }} 页</small>
                <nav><ul class="pagination pagination-sm mb-0">
                    <li class="page-item" :class="{ disabled: osSwitchLogsPage.page <= 1 }">
                        <a class="page-link" href="#" @click.prevent="osSwitchLogsPage.goPage(osSwitchLogsPage.page - 1)">上一页</a>
                    </li>
                    <li class="page-item" :class="{ disabled: osSwitchLogsPage.page >= osSwitchLogsPage.totalPages }">
                        <a class="page-link" href="#" @click.prevent="osSwitchLogsPage.goPage(osSwitchLogsPage.page + 1)">下一页</a>
                    </li>
                </ul></nav>
            </div>
        </div>

        <!-- 详情弹窗 -->
        <div class="modal fade" id="osSwitchLogDetailModal" tabindex="-1">
            <div class="modal-dialog modal-lg"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">切换日志详情 #{{ osSwitchLogsPage.detail?.id }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3" v-if="osSwitchLogsPage.detail">
                        <div class="col-md-6">
                            <label class="form-label text-muted small">日志 ID</label>
                            <div class="fw-bold">{{ osSwitchLogsPage.detail.id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">VMID</label>
                            <div class="fw-bold">{{ osSwitchLogsPage.detail.vm_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">用户 ID</label>
                            <div>{{ osSwitchLogsPage.detail.user_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">状态</label>
                            <div><span :class="'badge ' + (osSwitchLogsPage.detail.status === 'success' ? 'bg-success' : osSwitchLogsPage.detail.status === 'failed' ? 'bg-danger' : 'bg-secondary')">{{ osSwitchLogsPage.detail.status }}</span></div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">来源系统模板 ID</label>
                            <div>{{ osSwitchLogsPage.detail.from_os_template_id || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">目标系统模板 ID</label>
                            <div>{{ osSwitchLogsPage.detail.to_os_template_id }}</div>
                        </div>
                        <div class="col-12"><hr></div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">旧系统盘</label>
                            <div class="small">{{ osSwitchLogsPage.detail.old_system_volume_id || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">新系统盘</label>
                            <div class="small">{{ osSwitchLogsPage.detail.new_system_volume_id || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">旧 MAC 地址</label>
                            <div class="small">{{ osSwitchLogsPage.detail.old_mac_address || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">新 MAC 地址</label>
                            <div class="small">{{ osSwitchLogsPage.detail.new_mac_address || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">MAC 同步状态</label>
                            <div>{{ osSwitchLogsPage.detail.mac_sync_status || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">金额</label>
                            <div>{{ osSwitchLogsPage.detail.amount_charged > 0 ? '¥' + osSwitchLogsPage.detail.amount_charged : '-' }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogsPage.detail.error_message">
                            <label class="form-label text-muted small">错误信息</label>
                            <pre class="bg-dark text-danger p-2 rounded small" style="white-space:pre-wrap;max-height:150px;overflow-y:auto">{{ osSwitchLogsPage.detail.error_message }}</pre>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">开始时间</label>
                            <div>{{ formatTime(osSwitchLogsPage.detail.started_at) }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">完成时间</label>
                            <div>{{ osSwitchLogsPage.detail.finished_at ? formatTime(osSwitchLogsPage.detail.finished_at) : '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">是否需要管理员介入</label>
                            <div>{{ osSwitchLogsPage.detail.admin_intervention_required ? '是' : '否' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">是否已回滚</label>
                            <div>{{ osSwitchLogsPage.detail.rollback_performed ? '是' : '否' }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogsPage.detail.order_no">
                            <label class="form-label text-muted small">订单号</label>
                            <div>{{ osSwitchLogsPage.detail.order_no }}</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <pv-button type="button" data-bs-dismiss="modal" variant="secondary">关闭</pv-button>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();
