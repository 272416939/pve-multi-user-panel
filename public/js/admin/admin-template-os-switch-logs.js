(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 系统切换日志详情弹窗（筛选/表格/分页已并入 admin-template-logs.js 统一卡片） -->
    <div v-if="activeSection === 'logs' && logTab === 'os-switch'">
        <!-- 详情弹窗 -->
        <div class="modal fade" id="osSwitchLogDetailModal" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ t('admin.osswitchlog.title') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3" v-if="osSwitchLogDetail">
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.logId') }}</label>
                            <div class="fw-bold">{{ osSwitchLogDetail.id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">VMID</label>
                            <div class="fw-bold">{{ osSwitchLogDetail.vm_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.user') }}</label>
                            <div>{{ osSwitchLogDetail.username || osSwitchLogDetail.user_id }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('common.status') }}</label>
                            <div><span :class="'badge ' + (osSwitchLogDetail.status === 'success' ? 'bg-success' : osSwitchLogDetail.status === 'failed' ? 'bg-danger' : 'bg-secondary')">{{ {success:t('admin.osswitchlog.status.success'),failed:t('admin.osswitchlog.status.failed'),running:t('admin.osswitchlog.status.running'),pending:t('admin.osswitchlog.status.pending'),rolled_back:t('admin.osswitchlog.status.rolledBack')}[osSwitchLogDetail.status] || osSwitchLogDetail.status }}</span></div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.fromSystem') }}</label>
                            <div>{{ osSwitchLogDetail.from_os_template_name || osSwitchLogDetail.from_os_template_id || '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.toSystem') }}</label>
                            <div>{{ osSwitchLogDetail.to_os_template_name || osSwitchLogDetail.to_os_template_id }}</div>
                        </div>
                        <div class="col-12"><hr></div>
                        <div class="col-md-6" v-if="osSwitchLogDetail.new_system_volume_id">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.newSystemDisk') }}</label>
                            <div class="small">{{ osSwitchLogDetail.new_system_volume_id }}</div>
                        </div>
                        <div class="col-md-6" v-if="osSwitchLogDetail.order_no">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.orderNo') }}</label>
                            <div class="small">{{ osSwitchLogDetail.order_no }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogDetail.fail_stage">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.lastStage') }}</label>
                            <div>{{ osSwitchLogDetail.fail_stage }}</div>
                        </div>
                        <div class="col-12" v-if="osSwitchLogDetail.error_message">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.errorMessage') }}</label>
                            <pre class="bg-dark text-danger p-2 rounded small" style="white-space:pre-wrap;max-height:120px;overflow-y:auto">{{ osSwitchLogDetail.error_message }}</pre>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.startTime') }}</label>
                            <div>{{ formatDate(osSwitchLogDetail.started_at) }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.finishTime') }}</label>
                            <div>{{ osSwitchLogDetail.finished_at ? formatDate(osSwitchLogDetail.finished_at) : '-' }}</div>
                        </div>
                        <div class="col-md-6">
                            <label class="form-label text-muted small">{{ t('admin.osswitchlog.needAdmin') }}</label>
                            <div>{{ osSwitchLogDetail.admin_intervention_required ? t('common.yes') : t('common.no') }}</div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.close') }}</pv-button>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();
