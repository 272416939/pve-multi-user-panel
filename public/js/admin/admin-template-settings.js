(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'settings'">
                    <!-- SMTP 配置 -->
                    <div v-if="activeTab === 'smtp'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('settings.smtp.title') }}</h4>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="saveSmtpConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.smtp.host') }}</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.host" placeholder="smtp.example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.port') }}</label>
                                            <input type="number" class="form-control" v-model="smtpConfig.port" placeholder="587">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.username') }}</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.user" placeholder="user@example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.password') }}</label>
                                            <input type="password" class="form-control" v-model="smtpConfig.password" :placeholder="t('settings.keepBlank')" autocomplete="off">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.smtp.fromName') }}</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.from_name" :placeholder="t('settings.smtp.fromNamePh')">
                                            <small class="text-muted">{{ t('settings.smtp.fromNameHint') }}</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.smtp.from') }}</label>
                                            <input type="email" class="form-control" v-model="smtpConfig.from" :placeholder="t('settings.smtp.fromPh')">
                                            <div class="form-check mt-2">
                                                <input type="checkbox" class="form-check-input" id="smtpSecure" v-model="smtpConfig.secure">
                                                <label class="form-check-label" for="smtpSecure">{{ t('settings.smtp.ssl') }}</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="smtpEnabled" v-model="smtpConfig.enabled">
                                        <label class="form-check-label" for="smtpEnabled">{{ t('settings.smtp.enabled') }}</label>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="glass" >{{ t('settings.saveConfig') }}</pv-button>
                                        <pv-button type="button" variant="outline" size="lg" @click="testSmtpConfig">{{ t('settings.smtp.testSend') }}</pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 邮件队列状态（Redis 异步发送，管理端只读展示） -->
                        <div class="card mb-4">
                            <div class="card-body">
                                <h6 class="mb-2" style="font-weight:600;">{{ t('settings.emailQueue.title') }}</h6>
                                <div class="d-flex flex-wrap gap-3" style="font-size:13px;color:#718096;">
                                    <span>{{ t('settings.emailQueue.modeLabel') }}{{ emailQueueStats ? (emailQueueStats.redisEnabled ? t('settings.emailQueue.redisAsync') : t('settings.emailQueue.syncNoRedis')) : t('common.loading') }}</span>
                                    <span v-if="emailQueueStats">{{ t('settings.emailQueue.pending') }}{{ emailQueueStats.pending }}</span>
                                    <span v-if="emailQueueStats">{{ t('settings.emailQueue.active') }}{{ emailQueueStats.active }}</span>
                                    <span v-if="emailQueueStats">{{ t('settings.emailQueue.failed') }}{{ emailQueueStats.failed }}</span>
                                    <span v-if="emailQueueStats && emailQueueStats.syncFailedCount > 0" style="color:#ed6463;">{{ t('settings.emailQueue.syncFailed') }}{{ emailQueueStats.syncFailedCount }}</span>
                                    <span v-if="emailQueueStats && emailQueueStats.lastError" style="color:#ed6463;">{{ t('settings.emailQueue.lastError') }}{{ emailQueueStats.lastError }}（{{ emailQueueStats.lastFailedAt }}）</span>
                                </div>
                                <small class="text-muted">{{ t('settings.emailQueue.desc') }}</small>
                            </div>
                        </div>

                        <div class="module-header">
                            <h4 class="module-title">{{ t('settings.reminder.title') }}</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <form @submit.prevent="saveReminderConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.reminder.days1') }}</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days1" min="0" placeholder="7">
                                            <small class="text-muted">{{ t('settings.reminder.zeroDisable') }}</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.reminder.days2') }}</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days2" min="0" placeholder="3">
                                            <small class="text-muted">{{ t('settings.reminder.zeroDisable') }}</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.reminder.days3') }}</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days3" min="0" placeholder="1">
                                            <small class="text-muted">{{ t('settings.reminder.zeroDisable') }}</small>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" >{{ t('settings.reminder.save') }}</pv-button>
                                </form>
                            </div>
                        </div>

                        <!-- 邮件外壳样式（参数化 + 高级自定义 CSS，作用于所有系统邮件） -->
                        <div class="module-header mt-4">
                            <h4 class="module-title">{{ t('settings.emailShell.title') }}</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <p class="text-muted small mb-3">{{ t('settings.emailShell.desc') }}</p>
                                <div v-for="g in emailShellGroups" :key="g" class="mb-3">
                                    <h6 class="mb-2" style="font-weight:600;color:var(--color-primary);">{{ g }}</h6>
                                    <div class="row g-3">
                                        <div v-for="p in emailShellParamsByGroup(g)" :key="p.key" class="col-md-3">
                                            <label class="form-label">{{ p.label }}</label>
                                            <input v-if="p.type === 'color'" type="color" class="form-control form-control-color" style="height:38px;padding:4px;cursor:pointer;" :title="p.default" v-model="emailShellForm[p.key]">
                                            <input v-else-if="p.type === 'number'" type="number" class="form-control" v-model.number="emailShellForm[p.key]" :min="p.min" :max="p.max">
                                            <input v-else type="text" class="form-control" v-model="emailShellForm[p.key]">
                                        </div>
                                    </div>
                                </div>
                                <!-- 高级：自定义 CSS 源码（追加到邮件 <style> 末尾，可覆盖任意内置规则） -->
                                <div class="mb-2">
                                    <div class="d-flex align-items-center gap-2 mb-1">
                                        <h6 class="mb-0" style="font-weight:600;color:var(--color-primary);">{{ t('settings.emailShell.advanced') }}</h6>
                                        <small class="text-muted">{{ t('settings.emailShell.cssHint') }}</small>
                                    </div>
                                    <textarea class="form-control font-monospace" rows="6" v-model="emailShellForm.custom_css" :placeholder="t('settings.emailShell.cssPh')"></textarea>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button variant="glass" @click="saveEmailShell" :disabled="emailShellSaving">{{ emailShellSaving ? t('common.saving') : t('settings.emailShell.save') }}</pv-button>
                                    <pv-button variant="outline" size="lg" @click="previewEmailShell">{{ t('settings.emailShell.preview') }}</pv-button>
                                    <pv-button variant="outline-danger" size="lg" @click="resetEmailShell">{{ t('settings.emailShell.reset') }}</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- 邮件模板管理（可编辑系统邮件模板：主题/副标题/正文，支持 {变量} 占位符，可恢复默认） -->
                        <div class="module-header mt-4">
                            <h4 class="module-title">{{ t('settings.emailTpl.title') }}</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
                                    <p class="text-muted small mb-0">{{ t('settings.emailTpl.desc') }}</p>
                                    <pv-button variant="table" @click="toggleEmailTemplateAll">{{ emailTemplateAllExpanded ? t('settings.emailTpl.collapseAll') : t('settings.emailTpl.expandAll') }}</pv-button>
                                </div>
                                <div v-for="cat in emailTemplateCategories" :key="cat.key" class="notification-group mb-3">
                                    <div class="notification-group-header d-flex justify-content-between align-items-center px-3 py-2 cursor-pointer" @click="toggleEmailTemplateCategory(cat.key)">
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="notification-group-icon" v-html="cat.svg"></span>
                                            <span class="fw-bold">{{ cat.label }}</span>
                                            <small class="text-muted">（{{ emailTemplatesByCategory(cat.key).length }} {{ t('settings.emailTpl.countTpl') }}）</small>
                                        </div>
                                        <svg class="notification-chevron transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: emailTemplateCategoryCollapsed[cat.key] ? 'rotate(0deg)' : 'rotate(90deg)' }"><polyline points="9 18 15 12 9 6"/></svg>
                                    </div>
                                    <div v-if="!emailTemplateCategoryCollapsed[cat.key]" class="notification-group-items">
                                    <div v-for="tpl in emailTemplatesByCategory(cat.key)" :key="tpl.code">
                                        <div class="notification-item-row d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-2">
                                            <div class="d-flex align-items-center gap-2">
                                                <strong>{{ tpl.name }}</strong>
                                                <span class="text-muted" style="font-size:12px;">{{ tpl.code }}</span>
                                                <span class="text-muted" style="font-size:12px;">v{{ tpl.version }}</span>
                                            </div>
                                            <div class="d-flex gap-1">
                                                <pv-button variant="table" @click="toggleEmailTemplateEdit(tpl.code)">{{ tpl.code === emailTemplateEditing ? t('settings.emailTpl.collapse') : t('common.edit') }}</pv-button>
                                                <pv-button variant="table-danger" @click="resetEmailTemplate(tpl.code)">{{ t('settings.emailShell.reset') }}</pv-button>
                                            </div>
                                        </div>
                                        <div v-if="tpl.code === emailTemplateEditing" class="border-top p-3" style="border-color:var(--border-color) !important;">
                                            <div class="row g-3 mb-3">
                                                <div class="col-md-6">
                                                    <label class="form-label">{{ t('settings.emailTpl.subject') }}</label>
                                                    <input type="text" class="form-control" v-model="emailTemplateForm.subject" :placeholder="t('settings.emailTpl.subjectPh')">
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label">{{ t('settings.emailTpl.subtitle') }}</label>
                                                    <input type="text" class="form-control" v-model="emailTemplateForm.title" :placeholder="t('settings.emailTpl.subtitlePh')">
                                                </div>
                                            </div>
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <div class="d-flex gap-1">
                                                    <pv-button :variant="emailTemplateMode === 'rich' ? 'glass-active' : 'glass-inactive'" size="lg" @click="switchEmailTemplateMode('rich')">{{ t('settings.emailTpl.rich') }}</pv-button>
                                                    <pv-button :variant="emailTemplateMode === 'source' ? 'glass-active' : 'glass-inactive'" size="lg" @click="switchEmailTemplateMode('source')">{{ t('settings.emailTpl.source') }}</pv-button>
                                                </div>
                                                <small class="text-muted">{{ t('settings.emailTpl.varFormat') }}<code>{{ t('settings.etpl.varExample') }}</code>{{ t('settings.emailTpl.varFormatSuffix') }}</small>
                                            </div>
                                            <div class="email-template-quill-wrap mb-2" v-show="emailTemplateMode === 'rich'">
                                                <div id="emailTemplateQuill" style="min-height:200px;"></div>
                                            </div>
                                            <small v-if="emailTemplateMode === 'rich'" class="text-muted d-block mb-2">{{ t('settings.emailTpl.richHint') }}</small>
                                            <div class="mb-2" v-show="emailTemplateMode === 'source'">
                                                <textarea id="emailTemplateSource" class="form-control font-monospace" rows="10" v-model="emailTemplateSource" :placeholder="t('settings.emailTpl.sourcePh')"></textarea>
                                            </div>
                                            <!-- 可用变量面板（mousedown.prevent 防点击夺焦：链接气泡编辑态点变量时
                                                 焦点保持气泡输入框，否则 Quill 检测失焦关闭气泡、变量插不进去） -->
                                            <div class="mb-2 p-2 rounded" style="background:rgba(255,255,255,0.04);border:1px solid var(--border-color);">
                                                <small class="text-muted d-block mb-1">{{ t('settings.emailTpl.vars') }}</small>
                                                <div class="d-flex flex-wrap gap-1">
                                                    <span v-for="v in emailTemplateAllVariables(tpl)" :key="v.name" class="badge" style="cursor:pointer;background:color-mix(in srgb, var(--color-primary) 18%, transparent);color:var(--color-primary);border:1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);font-weight:500;" :title="tFormat('settings.varExample', v.label, v.example || '')" @mousedown.prevent @click="insertEmailTemplateVar(v.name)">{{ '{' + v.name + '}' }}</span>
                                                </div>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <pv-button variant="glass" @click="saveEmailTemplate" :disabled="emailTemplateSaving">{{ emailTemplateSaving ? t('common.saving') : t('settings.emailTpl.save') }}</pv-button>
                                                <pv-button variant="outline" size="lg" @click="previewEmailTemplate">{{ t('common.preview') }}</pv-button>
                                                <pv-button variant="outline" size="lg" @click="toggleEmailTemplateEdit(tpl.code)">{{ t('common.cancel') }}</pv-button>
                                            </div>
                                        </div>
                                    </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 邮件模板预览弹窗（非 Bootstrap，v-if + 动态 v-html，z-index 由 ModalZIndexManager 管理） -->
                        <div v-if="emailTemplatePreviewShow" id="emailTemplatePreviewWrap" class="modal" style="display:block;background:rgba(0,0,0,0.5);" @click.self="emailTemplatePreviewShow = false">
                            <div class="modal-dialog modal-lg modal-dialog-scrollable" @click.stop>
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">{{ t('settings.emailPreview.title') }}{{ emailTemplatePreviewSubject }}</h5>
                                        <pv-button variant="close" @click="emailTemplatePreviewShow = false">×</pv-button>
                                    </div>
                                    <div class="modal-body email-template-preview-body" style="overflow-y:auto;overflow-x:hidden;">
                                        <div v-html="emailTemplatePreviewHtml"></div>
                                    </div>
                                    <div class="modal-footer">
                                        <pv-button variant="outline" size="lg" @click="emailTemplatePreviewShow = false">{{ t('common.close') }}</pv-button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 按钮链接编辑弹窗（插入按钮链接：URL 输入 + 变量快捷插入，z-index 由 ModalZIndexManager 管理） -->
                        <div v-if="emailBtnLinkShow" id="emailBtnLinkWrap" class="modal" style="display:block;background:rgba(0,0,0,0.5);" @click.self="closeEmailBtnLinkPrompt(false)">
                            <div class="modal-dialog" style="max-width:520px;" @click.stop>
                                <div class="modal-content">
                                    <div class="modal-header">
                                        <h5 class="modal-title">{{ emailBtnLinkTitle }}</h5>
                                        <pv-button variant="close" @click="closeEmailBtnLinkPrompt(false)">&times;</pv-button>
                                    </div>
                                    <div class="modal-body">
                                        <label class="form-label">{{ emailBtnLinkMode === 'link' ? t('settings.emailBtn.linkText') : t('settings.emailBtn.btnText') }}{{ t('settings.emailBtn.varSuffix') }}</label>
                                        <input type="text" class="form-control mb-2" id="emailBtnLinkTextInput" v-model="emailBtnLinkText" :placeholder="emailBtnLinkMode === 'link' ? t('settings.emailBtn.linkPh') : t('settings.emailBtn.btnPh')" maxlength="50" autocomplete="off" @keydown="emailBtnLinkKeydown">
                                        <label class="form-label">{{ t('settings.emailBtn.url') }}</label>
                                        <input type="text" class="form-control" id="emailBtnLinkInput" v-model="emailBtnLinkUrl" :placeholder="t('settings.emailBtn.urlPh')" autocomplete="off" @keydown="emailBtnLinkKeydown">
                                        <div class="mt-2 p-2 rounded" style="background:rgba(255,255,255,0.04);border:1px solid var(--border-color);">
                                            <small class="text-muted d-block mb-1">{{ t('settings.emailTpl.vars') }}</small>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span v-for="v in emailBtnLinkVariables" :key="v.name" class="badge" style="cursor:pointer;background:color-mix(in srgb, var(--color-primary) 18%, transparent);color:var(--color-primary);border:1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);font-weight:500;" :title="tFormat('settings.varExample', v.label, v.example || '')" @mousedown.prevent @click="insertEmailBtnLinkVar(v.name)">{{ '{' + v.name + '}' }}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="modal-footer">
                                        <pv-button variant="outline" size="lg" @click="closeEmailBtnLinkPrompt(false)">{{ t('common.cancel') }}</pv-button>
                                        <pv-button variant="primary" @click="closeEmailBtnLinkPrompt(true)">{{ t('common.confirm') }}</pv-button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <!-- end settings(smtp) -->
<div v-if="activeSection === 'settings'">

                <!-- 爱快节点设置 -->
                <div v-if="activeTab === 'ikuai'">
                    <div class="module-header">
                        <h4 class="module-title">{{ t('settings.ikuai.title') }}</h4>
                    </div>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="text-muted small mb-3">{{ t('settings.ikuai.desc') }}</p>
                            <form @submit.prevent="saveIkuaiConfig">
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.ikuai.host') }}</label>
                                        <input type="text" class="form-control" v-model="ikuaiConfig.host" :placeholder="t('settings.ikuai.hostPh')">
                                        <small class="text-muted">{{ t('settings.ikuai.hostHint') }}</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.username') }}</label>
                                        <input type="text" class="form-control" v-model="ikuaiConfig.username" :placeholder="t('settings.ikuai.userPh')" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.password') }}</label>
                                        <input type="password" class="form-control" v-model="ikuaiConfig.password" :placeholder="t('settings.keepBlank')" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="ikuaiStrictTls" v-model="ikuaiConfig.strict_tls">
                                            <label class="form-check-label" for="ikuaiStrictTls">{{ t('settings.tlsStrict') }}</label>
                                        </div>
                                        <small class="text-muted">{{ t('settings.ikuai.tlsHint') }}</small>
                                    </div>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button type="button" variant="outline" @click="testIkuaiConfig" :disabled="ikuaiTesting">
                                        {{ ikuaiTesting ? t('settings.testing') : t('settings.testConn') }}
                                    </pv-button>
                                    <pv-button type="submit" variant="glass" :disabled="ikuaiConfigSaving">
                                        {{ ikuaiConfigSaving ? t('common.saving') : t('settings.saveConfig') }}
                                    </pv-button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <!-- end settings(ikuai) -->

                <!-- PVE 节点设置 -->
                <div v-if="activeTab === 'pve'">
                    <div class="module-header">
                        <h4 class="module-title">{{ t('settings.pve.title') }}</h4>
                    </div>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="text-muted small mb-3">{{ t('settings.pve.desc') }}</p>
                            <form @submit.prevent="savePveConfig">
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.pve.apiUrl') }}</label>
                                        <input type="text" class="form-control" v-model="pveConfig.host" placeholder="https://192.168.1.100:8006">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.pve.apiToken') }}</label>
                                        <input type="password" class="form-control" v-model="pveConfig.api_token" :placeholder="t('settings.keepBlank')" autocomplete="off">
                                        <small class="text-muted">{{ t('settings.pve.tokenFormat') }}</small>
                                    </div>
                                </div>
                                <hr class="my-4">
                                <h6 class="mb-3">{{ t('settings.pve.sshTitle') }}</h6>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('settings.pve.sshHost') }}</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_host" placeholder="192.168.1.100">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">{{ t('settings.pve.sshPort') }}</label>
                                        <input type="number" class="form-control" v-model="pveConfig.ssh_port" placeholder="22">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">{{ t('settings.pve.sshUser') }}</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_user" placeholder="root">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">{{ t('settings.pve.sshPassword') }}</label>
                                        <input type="password" class="form-control" v-model="pveConfig.ssh_password" :placeholder="t('settings.keepBlank')" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="pveStrictTls" v-model="pveConfig.strict_tls">
                                            <label class="form-check-label" for="pveStrictTls">{{ t('settings.tlsStrict') }}</label>
                                        </div>
                                        <small class="text-muted">{{ t('settings.pve.tlsHint') }}</small>
                                    </div>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button type="button" variant="outline" @click="testPveConfig" :disabled="pveTesting">
                                        {{ pveTesting ? t('settings.testing') : t('settings.testConn') }}
                                    </pv-button>
                                    <pv-button type="submit" variant="glass" :disabled="pveConfigSaving">
                                        {{ pveConfigSaving ? t('common.saving') : t('settings.saveConfig') }}
                                    </pv-button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
                <!-- end settings(pve) -->

                    <!-- 快照 & 备份配置（合并） -->
                    <div v-if="activeTab === 'snapshot-backup'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('settings.snapBackup.title') }}</h4>
                        </div>

                        <!-- 快照配置 -->
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0">{{ t('settings.snapBackup.snapTitle') }}</h5></div>
                            <div class="card-body">
                                <form @submit.prevent="saveSnapshotConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.snapBackup.snapPerVm') }}</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.max_per_vm" min="1" placeholder="5">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.snapBackup.snapDailyCreate') }}</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_create_limit" min="1" placeholder="20">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.snapBackup.snapDailyRestore') }}</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_restore_limit" min="1" placeholder="10">
                                        </div>
                                    </div>
                                    <div class="d-flex align-items-center gap-3">
                                        <pv-button type="submit" variant="glass" >{{ t('settings.snapBackup.saveSnap') }}</pv-button>
                                        <small class="text-muted">{{ t('settings.snapBackup.limitUserOnly') }}</small>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 备份配置 -->
                        <div class="card">
                            <div class="card-header"><h5 class="mb-0">{{ t('settings.snapBackup.backupTitle') }}</h5></div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">{{ t('settings.snapBackup.backupStorage') }}</label>
                                    <select class="form-select" v-model="backupConfigForm.default_storage">
                                        <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                    </select>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('settings.snapBackup.backupPerVm') }}</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.max_per_vm" min="1">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">{{ t('settings.snapBackup.backupDaily') }}</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.daily_limit" min="1">
                                    </div>
                                </div>
                                <p class="text-muted small mb-3">{{ t('settings.snapBackup.limitUserOnlyAdminFree') }}</p>
                                <pv-button @click="saveBackupConfig" variant="glass">{{ t('settings.snapBackup.saveBackup') }}</pv-button>
                            </div>
                        </div>
                    </div>

                    <!-- 网络管理 -->
                    <div v-if="activeTab === 'network'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('settings.network.title') }}</h4>
                        </div>
                        <div class="card" style="position: relative; z-index: 3; overflow: visible;">
                            <div class="card-header"><h5 class="mb-0">{{ t('settings.network.portForward') }}</h5></div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.portStart') }}</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_start" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.portEnd') }}</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_end" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <small class="text-muted">{{ t('settings.network.portRangeHint') }}</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.maxPerUser') }}</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.max_per_user" min="0" max="100">
                                        <small class="text-muted">{{ t('settings.network.maxPerUserHint') }}</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.wanIface') }}</label>
                                        <div class="input-group">
                                            <input type="text" class="form-control" v-model="networkConfig.wan_interface" :placeholder="t('settings.network.wanIfacePh')" readonly>
                                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" :disabled="wanInterfaceList.length === 0">{{ t('settings.select') }}</button>
                                            <ul class="dropdown-menu dropdown-menu-end" style="z-index: 1080;">
                                                <li v-for="iface in wanInterfaceList" :key="iface.name">
                                                    <a class="dropdown-item d-flex justify-content-between align-items-center" :class="{ 'active': isWanInterfaceSelected(iface.name) }" href="#" @click.prevent="toggleWanInterface(iface.name)">
                                                        <span>{{ iface.name }} ({{ iface.ip || t('settings.network.dialup') }})</span>
                                                        <i v-if="isWanInterfaceSelected(iface.name)" class="bi bi-check-circle-fill text-primary ms-2"></i>
                                                    </a>
                                                </li>
                                                <li v-if="wanInterfaceList.length === 0"><span class="dropdown-item text-muted">{{ t('settings.network.noIface') }}</span></li>
                                                <li><hr class="dropdown-divider"></li>
                                                <li><a class="dropdown-item text-danger" href="#" @click.prevent="networkConfig.wan_interface = ''">{{ t('settings.network.clear') }}</a></li>
                                            </ul>
                                        </div>
                                        <small class="text-muted">{{ t('settings.network.wanIfaceHint') }}</small>
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <pv-button variant="outline" size="lg" @click="refreshIfaceList">{{ t('settings.network.refreshIface') }}</pv-button>
                                        <small class="text-muted" v-if="ifaceUpdateTime" style="white-space: nowrap;">{{ t('settings.network.lastUpdate') }}{{ ifaceUpdateTime }}</small>
                                    </div>
                                </div>
                                <pv-button variant="glass" @click="saveNetworkConfig">{{ t('settings.saveConfig') }}</pv-button>
                            </div>
                        </div>

                        <!-- CNAME 域名配置 -->
                        <div class="card mt-3" style="position: relative; z-index: 1;">
                            <div class="card-header"><h5 class="mb-0">{{ t('settings.network.cnameTitle') }}</h5></div>
                            <div class="card-body">
                                <p class="text-muted small mb-3">{{ t('settings.network.cnameDesc') }}</p>
                                <div v-for="(entry, idx) in cnameEntries" :key="idx" class="row g-2 mb-2 align-items-center">
                                    <div class="col-md-3">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.label" :placeholder="t('settings.network.cnameLabelPh')">
                                    </div>
                                    <div class="col-md-7">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.domain" :placeholder="t('settings.network.cnameDomainPh')">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button @click="removeCnameEntry(idx)" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
                                    </div>
                                </div>
                                <div class="d-flex gap-2 mt-2">
                                    <pv-button @click="addCnameEntry" variant="outline" size="lg">{{ t('settings.network.addNode') }}</pv-button>
                                    <pv-button @click="saveNetworkConfig" variant="glass">{{ t('settings.network.saveCname') }}</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- DHCP 服务端设置 -->
                        <div class="card mt-3">
                            <div class="card-header">
                                <h5 class="mb-0">{{ t('settings.network.dhcpTitle') }}</h5>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.dns1') }}</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns1" placeholder="180.76.76.76">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.dns2') }}</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns2" placeholder="223.5.5.5">
                                    </div>
                                </div>
                                <small class="text-muted">{{ t('settings.network.dhcpDesc') }}</small>
                                <div class="mt-3 d-flex gap-2">
                                    <pv-button @click="saveNetworkConfig" variant="glass">{{ t('settings.saveConfig') }}</pv-button>
                                    <pv-button variant="outline" size="lg" @click="syncDhcpBindings">{{ t('settings.network.syncIkuai') }}</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- 私有网络 - VLAN 设置 -->
                        <div class="card mt-3" style="position: relative; z-index: 2;">
                            <div class="card-header">
                                <h5 class="mb-0">{{ t('settings.network.vlanTitle') }}</h5>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.vlanIpStart') }}</label>
                                        <input type="text" class="form-control" v-model="networkConfig.vlan_ip_segment_start" placeholder="172.16.0.1">
                                        <small class="text-muted">{{ t('settings.network.vlanIpStartHint') }}</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.vlanIdStart') }}</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.vlan_id_start" min="2" max="4090" placeholder="1000">
                                        <small class="text-muted">{{ t('settings.network.vlanIdHint') }}</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.vlanIface') }}</label>
                                        <select class="form-select" v-model="networkConfig.vlan_interface">
                                            <option value="" disabled>{{ t('settings.network.selectLan') }}</option>
                                            <option v-for="iface in lanInterfaceList" :key="iface.name" :value="iface.name">
                                                {{ iface.name }}{{ iface.comment ? ' (' + iface.comment + ')' : '' }}
                                            </option>
                                        </select>
                                        <small class="text-muted">{{ t('settings.network.vlanIfaceHint') }}</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">{{ t('settings.network.vlanMaxPerUser') }}</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.vlan_max_per_user" min="0" max="1000" placeholder="5">
                                        <small class="text-muted">{{ t('settings.network.vlanMaxHint') }}</small>
                                    </div>
                                </div>
                                <small class="text-muted">{{ t('settings.network.vlanDesc') }}</small>
                                <div class="mt-3 d-flex gap-2">
                                    <pv-button @click="saveNetworkConfig" variant="glass">{{ t('settings.saveConfig') }}</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                <!-- 支付配置 -->
                <div v-if="activeSection === 'settings' && activeTab === 'pay'">
                    <div class="module-header">
                        <h4 class="module-title">{{ t('settings.pay.title') }}</h4>
                    </div>
                    <div class="table-container" style="padding:24px;">
                        <div class="row g-3">
                            <div class="col-md-6 mb-3">
                                <label class="form-label">{{ t('settings.pay.baseUrl') }}</label>
                                <input type="text" class="form-control" v-model="payConfig.base_url" placeholder="https://pay.microgg.cn/">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">{{ t('settings.pay.pid') }}</label>
                                <input type="number" class="form-control" v-model="payConfig.pid" :placeholder="t('settings.pay.pidPh')">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">{{ t('settings.pay.md5Key') }}</label>
                                <input type="password" class="form-control" v-model="payConfig.md5_key" :placeholder="t('settings.pay.md5KeyPh')">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">{{ t('settings.pay.merchantKey') }}</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_private_key" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">{{ t('settings.pay.platformKey') }}</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_public_key" placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"></textarea>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">{{ t('settings.pay.amountLimit') }}</label></div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">{{ t('settings.pay.minAmount') }}</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.min_amount" :placeholder="t('settings.pay.minAmountPh')">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">{{ t('settings.pay.maxAmount') }}</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.max_amount" :placeholder="t('settings.pay.maxAmountPh')">
                            </div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">{{ t('settings.pay.versionSwitch') }}</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV1Switch" v-model="payConfig.v1_enabled">
                                    <label class="form-check-label" for="payV1Switch">{{ t('settings.pay.v1Enabled') }}</label>
                                </div>
                                <small class="text-muted">{{ t('settings.pay.v1Hint') }}</small>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV2Switch" v-model="payConfig.v2_enabled">
                                    <label class="form-check-label" for="payV2Switch">{{ t('settings.pay.v2Enabled') }}</label>
                                </div>
                                <small class="text-muted">{{ t('settings.pay.v2Hint') }}</small>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">{{ t('settings.pay.methods') }}</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payAlipaySwitch" v-model="payConfig.alipay_enabled">
                                    <label class="form-check-label" for="payAlipaySwitch">{{ t('settings.pay.alipay') }}</label>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payWxpaySwitch" v-model="payConfig.wxpay_enabled">
                                    <label class="form-check-label" for="payWxpaySwitch">{{ t('settings.pay.wxpay') }}</label>
                                </div>
                            </div>
                        </div>
                        <pv-button type="button" @click="savePayConfig" style="margin-top:12px;" variant="glass">

                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> {{ t('settings.saveConfig') }}
                        
</pv-button>
                    </div>
                </div>

                    <!-- 站点设置 -->
                    <div v-if="activeSection === 'settings' && activeTab === 'site'">
                        <div class="module-header">
                            <h4 class="module-title">{{ t('settings.site.title') }}</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">{{ t('settings.site.name') }}</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.name" :placeholder="t('settings.site.namePh')">
                                    <small class="text-muted">{{ t('settings.site.nameHint') }}</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('settings.site.logoText') }}</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.logo_text" :placeholder="t('settings.site.logoTextPh')">
                                    <small class="text-muted">{{ t('settings.site.logoTextHint') }}</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('settings.site.loginTitle') }}</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.login_title" :placeholder="t('settings.site.loginTitlePh')">
                                    <small class="text-muted">{{ t('settings.site.loginTitleHint') }}</small>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="registerEnabled" v-model="siteConfigForm.register_enabled">
                                        <label class="form-check-label" for="registerEnabled">{{ t('settings.site.allowRegister') }}</label>
                                    </div>
                                    <small class="text-muted">{{ t('settings.site.allowRegisterHint') }}</small>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveSiteConfig" :disabled="siteConfigSaving">
                                    {{ siteConfigSaving ? t('common.saving') : t('settings.site.save') }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- 模板样式 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-1">{{ t('settings.site.template') }}</h5>
                                <p class="text-muted small mb-3">{{ t('settings.site.templateDesc') }}</p>
                                <div class="d-flex flex-wrap gap-3 mb-3">
                                    <!-- 赛博霓虹预览卡 -->
                                    <div class="template-picker" :class="{ 'template-picker-active': templateStyle === 'default' }" @click="selectTemplate('default')" role="button" tabindex="0">
                                        <div class="template-preview template-preview-default">
                                            <div class="tp-sidebar">
                                                <div class="tp-logo"></div>
                                                <div class="tp-nav"></div>
                                                <div class="tp-nav tp-nav-active"></div>
                                                <div class="tp-nav"></div>
                                            </div>
                                            <div class="tp-main">
                                                <div class="tp-header"></div>
                                                <div class="tp-cards">
                                                    <div class="tp-card"></div>
                                                    <div class="tp-card"></div>
                                                    <div class="tp-card"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="template-picker-body">
                                            <div class="d-flex align-items-center gap-2">
                                                <strong>{{ t('settings.site.cyberTheme') }}</strong>
                                                <span v-if="templateStyle === 'default'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">{{ t('settings.site.cyberThemeDesc') }}</small>
                                        </div>
                                    </div>
                                    <!-- SAAS 企业风预览卡 -->
                                    <div class="template-picker" :class="{ 'template-picker-active': templateStyle === 'saas' }" @click="selectTemplate('saas')" role="button" tabindex="0">
                                        <div class="template-preview template-preview-saas">
                                            <div class="tp-sidebar">
                                                <div class="tp-logo"></div>
                                                <div class="tp-nav"></div>
                                                <div class="tp-nav tp-nav-active"></div>
                                                <div class="tp-nav"></div>
                                            </div>
                                            <div class="tp-main">
                                                <div class="tp-header"></div>
                                                <div class="tp-cards">
                                                    <div class="tp-card"></div>
                                                    <div class="tp-card"></div>
                                                    <div class="tp-card"></div>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="template-picker-body">
                                            <div class="d-flex align-items-center gap-2">
                                                <strong>{{ t('settings.site.saasTheme') }}</strong>
                                                <span v-if="templateStyle === 'saas'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">{{ t('settings.site.saasThemeDesc') }}</small>
                                        </div>
                                    </div>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveTemplateStyle" :disabled="templateStyleSaving">
                                    {{ templateStyleSaving ? t('common.saving') : t('settings.site.saveTemplate') }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- 系统默认语言 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-1">{{ t('settings.language') }}</h5>
                                <p class="text-muted small mb-3">{{ t('settings.language.desc') }}</p>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <select class="form-select" v-model="langForm" style="max-width: 300px;">
                                            <option value="zh-CN">{{ t('lang.zh-CN') }}</option>
                                            <option value="zh-TW">{{ t('lang.zh-TW') }}</option>
                                            <option value="en">{{ t('lang.en') }}</option>
                                            <option value="de">{{ t('lang.de') }}</option>
                                            <option value="ja">{{ t('lang.ja') }}</option>
                                            <option value="ko">{{ t('lang.ko') }}</option>
                                            <option value="fr">{{ t('lang.fr') }}</option>
                                        </select>
                                    </div>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveLang" :disabled="langSaving">
                                    {{ langSaving ? t('common.saving') : t('settings.language.save') }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- Redis 缓存配置 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-3">{{ t('settings.redis.title') }}</h5>
                                <p class="text-muted small mb-3">{{ t('settings.redis.desc') }}</p>
                                <form @submit.prevent="saveRedisConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.redis.host') }}</label>
                                            <input type="text" class="form-control" v-model="redisConfig.host" :placeholder="t('settings.redis.hostPh')">
                                            <small class="text-muted">{{ t('settings.redis.hostHint') }}</small>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">{{ t('settings.port') }}</label>
                                            <input type="number" class="form-control" v-model.number="redisConfig.port" placeholder="6379">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">{{ t('settings.redis.db') }}</label>
                                            <input type="number" class="form-control" v-model.number="redisConfig.db" placeholder="0">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.password') }}</label>
                                            <input type="password" class="form-control" v-model="redisConfig.password" :placeholder="t('settings.redis.pwdPh')">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">{{ t('settings.redis.prefix') }}</label>
                                            <input type="text" class="form-control" v-model="redisConfig.prefix" placeholder="pve:">
                                            <small class="text-muted">{{ t('settings.redis.prefixHint') }}</small>
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="button" variant="outline" @click="testRedisConfig" :disabled="redisTesting">
                                            {{ redisTesting ? t('settings.testing') : t('settings.testConn') }}
                                        </pv-button>
                                        <pv-button type="submit" variant="glass" :disabled="redisConfigSaving">
                                            {{ redisConfigSaving ? t('common.saving') : t('settings.saveConfig') }}
                                        </pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 用户日志上限配置 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-3">{{ t('settings.log.title') }}</h5>
                                <p class="text-muted small mb-3">{{ t('settings.log.desc') }}</p>
                                <form @submit.prevent="saveLogConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.log.userKeep') }}</label>
                                            <input type="number" class="form-control" v-model.number="logConfigForm.keep_count" min="100" max="100000" placeholder="5000">
                                            <small class="text-muted">{{ t('settings.log.range') }}</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">{{ t('settings.log.adminKeep') }}</label>
                                            <input type="number" class="form-control" v-model.number="logConfigForm.keep_admin_count" min="100" max="100000" placeholder="5000">
                                            <small class="text-muted">{{ t('settings.log.range') }}</small>
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="glass" :disabled="logConfigSaving">
                                            {{ logConfigSaving ? t('common.saving') : t('settings.saveConfig') }}
                                        </pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 危险操作：清除缓存 -->
                        <div class="card mt-3" style="border-color: rgba(239, 68, 68, 0.3);">
                            <div class="card-header" style="background: rgba(239, 68, 68, 0.05);">
                                <h5 class="mb-0 text-danger">{{ t('settings.danger') }}</h5>
                            </div>
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <div>
                                        <strong>{{ t('settings.clearCache') }}</strong>
                                        <p class="text-muted small mb-0">{{ t('settings.clearCacheDesc') }}<br>{{ t('settings.clearCacheNote') }}</p>
                                    </div>
                                    <pv-button type="button" variant="danger" @click="clearAllCache" :disabled="cacheClearing">
                                        {{ cacheClearing ? t('settings.clearing') : t('settings.clearAllCache') }}
                                    </pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                <!-- UApiPro IP 归属地配置 -->
                <div v-if="activeSection === 'settings' && activeTab === 'uapipro'">
                    <div class="module-header">
                        <h4 class="module-title">{{ t('settings.uapipro.title') }}</h4>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title mb-3">{{ t('settings.uapipro.apiConfig') }}</h5>
                            <p class="text-muted small mb-3">{{ t('settings.uapipro.desc') }}</p>
                            <div class="form-check form-switch mb-3">
                                <input class="form-check-input" type="checkbox" id="uapiproEnabled" v-model="uapiproConfig.enabled">
                                <label class="form-check-label" for="uapiproEnabled">{{ t('settings.uapipro.enabled') }}</label>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">{{ t('settings.uapipro.apiKey') }}</label>
                                <input type="password" class="form-control" v-model="uapiproConfig.api_key" :placeholder="t('settings.uapipro.apiKeyPh')">
                                <small class="text-muted">{{ t('settings.uapipro.apiKeyHint') }}</small>
                            </div>
                            <pv-button type="button" variant="glass" @click="saveUapiproConfig" :disabled="uapiproSaving">
                                {{ uapiproSaving ? t('common.saving') : t('settings.saveConfig') }}
                            </pv-button>
                        </div>
                    </div>

                    <div class="card mt-3">
                        <div class="card-body">
                            <h5 class="card-title mb-3">{{ t('settings.uapipro.test') }}</h5>
                            <p class="text-muted small mb-3">{{ t('settings.uapipro.testDesc') }}</p>
                            <div class="d-flex gap-2 align-items-center flex-wrap">
                                <input type="text" class="form-control" style="max-width:260px;" v-model="uapiproTestIp" :placeholder="t('settings.uapipro.testIpPh')">
                                <pv-button type="button" variant="outline" @click="testUapiproIpQuery" :disabled="uapiproTesting">
                                    {{ uapiproTesting ? t('settings.uapipro.querying') : t('settings.uapipro.testQuery') }}
                                </pv-button>
                            </div>
                            <div v-if="uapiproTestResult" class="mt-3" style="padding:12px;border-radius:8px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);">
                                <div class="small text-muted">{{ t('settings.uapipro.queryIp') }}{{ uapiproTestResult.ip }}</div>
                                <div class="mt-1">{{ uapiproTestResult.location || t('settings.uapipro.noResult') }}</div>
                            </div>
                            <div v-if="uapiproTestError" class="mt-3 text-danger small">{{ uapiproTestError }}</div>
                        </div>
                    </div>
                </div>

                </div>
                <!-- end 系统设置区域 -->

                <!-- 财务管理 - 交易流水 -->
                

`);
})();
