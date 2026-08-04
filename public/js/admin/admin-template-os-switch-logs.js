(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 系统切换日志详情弹窗（筛选/表格/分页已并入 admin-template-logs.js 统一卡片） -->
    <div v-if="activeSection === 'logs' && logTab === 'os-switch'">
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
