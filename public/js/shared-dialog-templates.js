// public/js/shared-dialog-templates.js - 三端共享弹窗模板（单一来源）
// 规范第七节：弹窗模板只定义一次，admin/dashboard/user-center 三端复用
// 加载顺序：必须在各端模板文件（admin-template-modals.js / dashboard-template-modals.js / user-center-template.js）之前加载

window.__sharedDialogTemplates = `
<!-- 自定义 Alert 弹窗（三端共享） -->
<Teleport to="body">
<div class="modal fade" id="customAlertModal" tabindex="-1" data-bs-backdrop="static">
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-body text-center py-4">
                <div class="custom-alert-icon mb-3">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                </div>
                <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customAlertMessage }}</p>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                <pv-button type="button" variant="primary" @mousedown="(e) => e.target.blur()" data-bs-dismiss="modal">确定</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>

<!-- 自定义 Confirm 弹窗（三端共享） -->
<Teleport to="body">
<div class="modal fade" id="customConfirmModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
    <div class="modal-dialog modal-sm modal-dialog-centered">
        <div class="modal-content">
            <div class="modal-body text-center py-4">
                <div class="custom-alert-icon mb-3">
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                </div>
                <p class="custom-confirm-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;white-space:pre-line;">{{ customConfirmMessage }}</p>
            </div>
            <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                <pv-button type="button" variant="outline" @click="confirmCancel">取消</pv-button>
                <pv-button type="button" variant="primary" @click="confirmOk">确定</pv-button>
            </div>
        </div>
    </div>
</div>
</Teleport>
`;
