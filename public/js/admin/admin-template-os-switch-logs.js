(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 系统切换日志（日志中心 tab，header 按钮由 admin-template-logs.js 统一提供） -->
    <div v-if="activeSection === 'logs' && logTab === 'os-switch'">
        <div class="card mb-4">
            <div class="card-body">
                <!-- 筛选栏 -->
                <div class="row g-2 mb-3">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:120px" v-model="osSwitchLogFilter.status">
                            <option value="">全部状态</option>
                            <option value="success">成功</option>
                            <option value="failed">失败</option>
                            <option value="running">切换中</option>
                            <option value="pending">等待中</option>
                            <option value="rolled_back">已回滚</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.vm_id" placeholder="VMID" type="number">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.user_id" placeholder="用户ID" type="number">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="loadOsSwitchLogs(1)">筛选</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetOsSwitchLogFilter()">重置</pv-button>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllOsSwitchLog($event)" :checked="isAllOsSwitchLogSelected()"></th>
                                <th>ID</th>
                                <th>VMID</th>
                                <th>用户</th>
                                <th>来源系统</th>
                                <th>目标系统</th>
                                <th>状态</th>
                                <th>时间</th>
                                <th>操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in osSwitchLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="osSwitchLogSelected.includes(row.id)" @change="toggleOneOsSwitchLog(row.id)"></td>
                                <td>{{ row.id }}</td>
                                <td>{{ row.vm_id }}</td>
                                <td>{{ row.username || row.user_id }}</td>
                                <td class="text-muted small">{{ row.from_os_template_name || row.from_os_template_id || '-' }}</td>
                                <td>{{ row.to_os_template_name || row.to_os_template_id }}</td>
                                <td>
                                    <span :class="'badge ' + {
                                        success: 'bg-success', failed: 'bg-danger',
                                        running: 'bg-primary', pending: 'bg-warning text-dark',
                                        rolled_back: 'bg-secondary'
                                    }[row.status] || 'bg-secondary'">{{ {success:'成功',failed:'失败',running:'切换中',pending:'等待中',rolled_back:'已回滚'}[row.status] || row.status }}</span>
                                    <span v-if="row.admin_intervention_required" class="badge bg-danger ms-1">需介入</span>
                                </td>
                                <td class="small">{{ row.started_at ? formatDate(row.started_at) : '-' }}</td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <pv-button size="sm" @click="showOsSwitchLogDetail(row)">详情</pv-button>
                                        <pv-button size="sm" variant="danger" @click="deleteOsSwitchLog(row.id)" :disabled="row.status === 'running'">删除</pv-button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!osSwitchLogList || osSwitchLogList.length === 0">
                                <td colspan="9" class="text-center text-muted py-3">暂无切换日志</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 分页 -->
                <div class="d-flex justify-content-between align-items-center mt-3" v-if="osSwitchLogTotal > 0">
                    <small class="text-muted">共 {{ osSwitchLogTotal }} 条</small>
                    <div>
                        <pv-button :disabled="osSwitchLogPage <= 1" @click="loadOsSwitchLogs(osSwitchLogPage-1)" variant="outline" size="sm">上一页</pv-button>
                        <span class="mx-2 text-muted small">{{ osSwitchLogPage }} / {{ Math.ceil(osSwitchLogTotal / 20) || 1 }}</span>
                        <pv-button :disabled="osSwitchLogPage*20 >= osSwitchLogTotal" @click="loadOsSwitchLogs(osSwitchLogPage+1)" variant="outline" size="sm">下一页</pv-button>
                    </div>
                </div>
            </div>
        </div>

        <!-- 详情弹窗 -->
        <div class="modal fade" id="osSwitchLogDetailModal" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">切换日志详情</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3" v-if="osSwitchLogDetail">
                        <div class="col-md-6">
                            <label class="form-label text-muted small">日志 ID</label>
                            <div class="fw-bold">{{ osSwitchLogDetail.id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">VMID</label>
                            <div class="fw-bold">{{ osSwitchLogDetail.vm_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">用户</label>
                            <div>{{ osSwitchLogDetail.username || osSwitchLogDetail.user_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">状态</label>
                            <div><span :class="'badge ' + (osSwitchLogDetail.status === 'success' ? 'bg-success' : osSwitchLogDetail.status === 'failed' ? 'bg-danger' : 'bg-secondary')">{{ {success:'成功',failed:'失败',running:'切换中',pending:'等待中',rolled_back:'已回滚'}[osSwitchLogDetail.status] || osSwitchLogDetail.status }}</span></div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">来源系统</label>
                            <div>{{ osSwitchLogDetail.from_os_template_name || osSwitchLogDetail.from_os_template_id || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">目标系统</label>
                            <div>{{ osSwitchLogDetail.to_os_template_name || osSwitchLogDetail.to_os_template_id }}</div>
                        </div>
                        <div class="col-12"><hr></div>
                        <div class="col-md-6" v-if="osSwitchLogDetail.new_system_volume_id">
                            <label class="form-label text-muted small">新系统盘</label>
                            <div class="small">{{ osSwitchLogDetail.new_system_volume_id }}</div>
                        </div>
                        <div class="col-md-6" v-if="osSwitchLogDetail.order_no">
                            <label class="form-label text-muted small">订单号</label>
                            <div class="small">{{ osSwitchLogDetail.order_no }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogDetail.fail_stage">
                            <label class="form-label text-muted small">最后阶段</label>
                            <div>{{ osSwitchLogDetail.fail_stage }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogDetail.error_message">
                            <label class="form-label text-muted small">错误信息</label>
                            <pre class="bg-dark text-danger p-2 rounded small" style="white-space:pre-wrap;max-height:120px;overflow-y:auto">{{ osSwitchLogDetail.error_message }}</pre>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">开始时间</label>
                            <div>{{ formatDate(osSwitchLogDetail.started_at) }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">完成时间</label>
                            <div>{{ osSwitchLogDetail.finished_at ? formatDate(osSwitchLogDetail.finished_at) : '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">需管理员介入</label>
                            <div>{{ osSwitchLogDetail.admin_intervention_required ? '是' : '否' }}</div>
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