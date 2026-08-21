(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'settings'">
                    <!-- SMTP 配置 -->
                    <div v-if="activeTab === 'smtp'">
                        <div class="module-header">
                            <h4 class="module-title">SMTP 配置</h4>
                        </div>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="saveSmtpConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">SMTP 服务器</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.host" placeholder="smtp.example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">端口</label>
                                            <input type="number" class="form-control" v-model="smtpConfig.port" placeholder="587">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">用户名</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.user" placeholder="user@example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">密码</label>
                                            <input type="password" class="form-control" v-model="smtpConfig.password" placeholder="留空则不修改" autocomplete="off">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">发件人名称</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.from_name" placeholder="如：OWO CLOUD（留空则使用发件人邮箱）">
                                            <small class="text-muted">收件人看到的发件人名称</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">发件人邮箱</label>
                                            <input type="email" class="form-control" v-model="smtpConfig.from" placeholder="noreply@example.com（留空则使用 SMTP 用户名）">
                                            <div class="form-check mt-2">
                                                <input type="checkbox" class="form-check-input" id="smtpSecure" v-model="smtpConfig.secure">
                                                <label class="form-check-label" for="smtpSecure">使用 SSL/TLS</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="smtpEnabled" v-model="smtpConfig.enabled">
                                        <label class="form-check-label" for="smtpEnabled">启用 SMTP</label>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="glass" >保存配置</pv-button>
                                        <pv-button type="button" variant="outline" size="lg" @click="testSmtpConfig">发送测试邮件</pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 邮件队列状态（Redis 异步发送，管理端只读展示） -->
                        <div class="card mb-4">
                            <div class="card-body">
                                <h6 class="mb-2" style="font-weight:600;">邮件队列状态</h6>
                                <div class="d-flex flex-wrap gap-3" style="font-size:13px;color:#718096;">
                                    <span>发送模式：{{ emailQueueStats ? (emailQueueStats.redisEnabled ? 'Redis 异步队列' : '同步发送（未配置 Redis）') : '加载中...' }}</span>
                                    <span v-if="emailQueueStats">待发送：{{ emailQueueStats.pending }}</span>
                                    <span v-if="emailQueueStats">发送中：{{ emailQueueStats.active }}</span>
                                    <span v-if="emailQueueStats">重试后失败：{{ emailQueueStats.failed }}</span>
                                    <span v-if="emailQueueStats && emailQueueStats.syncFailedCount > 0" style="color:#ed6463;">同步发送失败：{{ emailQueueStats.syncFailedCount }}</span>
                                    <span v-if="emailQueueStats && emailQueueStats.lastError" style="color:#ed6463;">最近失败：{{ emailQueueStats.lastError }}（{{ emailQueueStats.lastFailedAt }}）</span>
                                </div>
                                <small class="text-muted">通知、密码重置、邮箱验证等邮件通过 Redis 队列异步发送（失败自动重试 3 次），不阻塞用户请求；注册验证码与 SMTP 测试邮件为同步直发（需即时反馈），其失败计入「同步发送失败」。Redis 未启用时自动降级为同步发送。</small>
                            </div>
                        </div>

                        <div class="module-header">
                            <h4 class="module-title">到期提醒配置</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <form @submit.prevent="saveReminderConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 1（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days1" min="0" placeholder="7">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 2（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days2" min="0" placeholder="3">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 3（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days3" min="0" placeholder="1">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" >保存提醒配置</pv-button>
                                </form>
                            </div>
                        </div>

                        <!-- 邮件外壳样式（参数化 + 高级自定义 CSS，作用于所有系统邮件） -->
                        <div class="module-header mt-4">
                            <h4 class="module-title">邮件外壳样式</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <p class="text-muted small mb-3">自定义系统邮件的统一外观（头部横幅/卡片/按钮/页脚）。保存后立即生效，所有新发送邮件按新样式生成。</p>
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
                                        <h6 class="mb-0" style="font-weight:600;color:var(--color-primary);">高级：自定义样式</h6>
                                        <small class="text-muted">追加到邮件 <code>&lt;style&gt;</code> 末尾的 CSS 源码</small>
                                    </div>
                                    <textarea class="form-control font-monospace" rows="6" v-model="emailShellForm.custom_css" placeholder="如：.email-header { padding: 40px 20px; }"></textarea>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button variant="glass" @click="saveEmailShell" :disabled="emailShellSaving">{{ emailShellSaving ? '保存中...' : '保存样式' }}</pv-button>
                                    <pv-button variant="outline" size="lg" @click="previewEmailShell">预览邮件</pv-button>
                                    <pv-button variant="outline-danger" size="lg" @click="resetEmailShell">恢复默认</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- 邮件模板管理（可编辑系统邮件模板：主题/副标题/正文，支持 {变量} 占位符，可恢复默认） -->
                        <div class="module-header mt-4">
                            <h4 class="module-title">邮件模板</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="d-flex align-items-start justify-content-between flex-wrap gap-2 mb-3">
                                    <p class="text-muted small mb-0">编辑系统自动发送的邮件模板，点击「编辑」展开编辑器，支持富文本/源码两种模式；「可用变量」点击即可插入光标处，变量值在发送时自动替换。保存后立即生效，可随时「恢复默认」。</p>
                                    <pv-button variant="table" @click="toggleEmailTemplateAll">{{ emailTemplateAllExpanded ? '全部收起' : '全部展开' }}</pv-button>
                                </div>
                                <div v-for="cat in emailTemplateCategories" :key="cat.key" class="notification-group mb-3">
                                    <div class="notification-group-header d-flex justify-content-between align-items-center px-3 py-2 cursor-pointer" @click="toggleEmailTemplateCategory(cat.key)">
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="notification-group-icon" v-html="cat.svg"></span>
                                            <span class="fw-bold">{{ cat.label }}</span>
                                            <small class="text-muted">（{{ emailTemplatesByCategory(cat.key).length }} 个模板）</small>
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
                                                <pv-button variant="table" @click="toggleEmailTemplateEdit(tpl.code)">{{ tpl.code === emailTemplateEditing ? '收起' : '编辑' }}</pv-button>
                                                <pv-button variant="table-danger" @click="resetEmailTemplate(tpl.code)">恢复默认</pv-button>
                                            </div>
                                        </div>
                                        <div v-if="tpl.code === emailTemplateEditing" class="border-top p-3" style="border-color:var(--border-color) !important;">
                                            <div class="row g-3 mb-3">
                                                <div class="col-md-6">
                                                    <label class="form-label">邮件主题</label>
                                                    <input type="text" class="form-control" v-model="emailTemplateForm.subject" placeholder="主题支持变量，如：虚拟机到期提醒">
                                                </div>
                                                <div class="col-md-6">
                                                    <label class="form-label">邮件副标题（头部标题下方）</label>
                                                    <input type="text" class="form-control" v-model="emailTemplateForm.title" placeholder="如：虚拟机将在{days}天后到期">
                                                </div>
                                            </div>
                                            <div class="d-flex justify-content-between align-items-center mb-2">
                                                <div class="d-flex gap-1">
                                                    <pv-button :variant="emailTemplateMode === 'rich' ? 'glass-active' : 'glass-inactive'" size="lg" @click="switchEmailTemplateMode('rich')">富文本</pv-button>
                                                    <pv-button :variant="emailTemplateMode === 'source' ? 'glass-active' : 'glass-inactive'" size="lg" @click="switchEmailTemplateMode('source')">源码</pv-button>
                                                </div>
                                                <small class="text-muted">变量格式：<code>{变量名}</code>，仅支持小写字母、数字、下划线</small>
                                            </div>
                                            <div class="email-template-quill-wrap mb-2" v-show="emailTemplateMode === 'rich'">
                                                <div id="emailTemplateQuill" style="min-height:200px;"></div>
                                            </div>
                                            <small v-if="emailTemplateMode === 'rich'" class="text-muted d-block mb-2">提示：富文本模式不支持按钮、提示块等复杂样式（打开时部分样式会被简化显示，未改动保存不受影响）；需要保留或编辑复杂排版时请切换「源码」模式。</small>
                                            <div class="mb-2" v-show="emailTemplateMode === 'source'">
                                                <textarea id="emailTemplateSource" class="form-control font-monospace" rows="10" v-model="emailTemplateSource" placeholder="粘贴或编辑 HTML 源码，支持 {变量} 占位符"></textarea>
                                            </div>
                                            <!-- 可用变量面板（mousedown.prevent 防点击夺焦：链接气泡编辑态点变量时
                                                 焦点保持气泡输入框，否则 Quill 检测失焦关闭气泡、变量插不进去） -->
                                            <div class="mb-2 p-2 rounded" style="background:rgba(255,255,255,0.04);border:1px solid var(--border-color);">
                                                <small class="text-muted d-block mb-1">可用变量（点击插入光标处）</small>
                                                <div class="d-flex flex-wrap gap-1">
                                                    <span v-for="v in emailTemplateAllVariables(tpl)" :key="v.name" class="badge" style="cursor:pointer;background:color-mix(in srgb, var(--color-primary) 18%, transparent);color:var(--color-primary);border:1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);font-weight:500;" :title="v.label + '（示例：' + (v.example || '') + '）'" @mousedown.prevent @click="insertEmailTemplateVar(v.name)">{{ '{' + v.name + '}' }}</span>
                                                </div>
                                            </div>
                                            <div class="d-flex gap-2">
                                                <pv-button variant="glass" @click="saveEmailTemplate" :disabled="emailTemplateSaving">{{ emailTemplateSaving ? '保存中...' : '保存模板' }}</pv-button>
                                                <pv-button variant="outline" size="lg" @click="previewEmailTemplate">预览</pv-button>
                                                <pv-button variant="outline" size="lg" @click="toggleEmailTemplateEdit(tpl.code)">取消</pv-button>
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
                                        <h5 class="modal-title">邮件预览：{{ emailTemplatePreviewSubject }}</h5>
                                        <pv-button variant="close" @click="emailTemplatePreviewShow = false">×</pv-button>
                                    </div>
                                    <div class="modal-body email-template-preview-body" style="overflow-y:auto;overflow-x:hidden;">
                                        <div v-html="emailTemplatePreviewHtml"></div>
                                    </div>
                                    <div class="modal-footer">
                                        <pv-button variant="outline" size="lg" @click="emailTemplatePreviewShow = false">关闭</pv-button>
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
                                        <label class="form-label">{{ emailBtnLinkMode === 'link' ? '链接文字' : '按钮文字' }}（支持 {变量} 占位符）</label>
                                        <input type="text" class="form-control mb-2" id="emailBtnLinkTextInput" v-model="emailBtnLinkText" :placeholder="emailBtnLinkMode === 'link' ? '如：查看详情' : '如：确认换绑邮箱'" maxlength="50" autocomplete="off" @keydown="emailBtnLinkKeydown">
                                        <label class="form-label">按钮跳转链接（支持 {变量} 占位符）</label>
                                        <input type="text" class="form-control" id="emailBtnLinkInput" v-model="emailBtnLinkUrl" placeholder="https://… 或 {link}" autocomplete="off" @keydown="emailBtnLinkKeydown">
                                        <div class="mt-2 p-2 rounded" style="background:rgba(255,255,255,0.04);border:1px solid var(--border-color);">
                                            <small class="text-muted d-block mb-1">可用变量（点击插入光标处）</small>
                                            <div class="d-flex flex-wrap gap-1">
                                                <span v-for="v in emailBtnLinkVariables" :key="v.name" class="badge" style="cursor:pointer;background:color-mix(in srgb, var(--color-primary) 18%, transparent);color:var(--color-primary);border:1px solid color-mix(in srgb, var(--color-primary) 40%, transparent);font-weight:500;" :title="v.label + '（示例：' + (v.example || '') + '）'" @mousedown.prevent @click="insertEmailBtnLinkVar(v.name)">{{ '{' + v.name + '}' }}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="modal-footer">
                                        <pv-button variant="outline" size="lg" @click="closeEmailBtnLinkPrompt(false)">取消</pv-button>
                                        <pv-button variant="primary" @click="closeEmailBtnLinkPrompt(true)">确定</pv-button>
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
                        <h4 class="module-title">爱快节点设置</h4>
                    </div>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="text-muted small mb-3">配置爱快软路由连接信息（用于 DHCP 租约查询、端口映射同步、接口列表、VLAN/子网）。支持 http 与 https，密码加密存储，保存后显示为打码值；保存后立即生效，无需重启。</p>
                            <form @submit.prevent="saveIkuaiConfig">
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">爱快地址</label>
                                        <input type="text" class="form-control" v-model="ikuaiConfig.host" placeholder="http://192.168.1.1:80 或 https://192.168.1.1:443">
                                        <small class="text-muted">需包含协议（http:// 或 https://）与端口；留空表示停用爱快同步</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">用户名</label>
                                        <input type="text" class="form-control" v-model="ikuaiConfig.username" placeholder="路由器登录用户名" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">密码</label>
                                        <input type="password" class="form-control" v-model="ikuaiConfig.password" placeholder="留空则不修改" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="ikuaiStrictTls" v-model="ikuaiConfig.strict_tls">
                                            <label class="form-check-label" for="ikuaiStrictTls">TLS 严格证书验证</label>
                                        </div>
                                        <small class="text-muted">爱快使用自签证书时请关闭（默认关闭）。开启后将验证 HTTPS 连接的 TLS 证书。</small>
                                    </div>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button type="button" variant="outline" @click="testIkuaiConfig" :disabled="ikuaiTesting">
                                        {{ ikuaiTesting ? '测试中...' : '测试连接' }}
                                    </pv-button>
                                    <pv-button type="submit" variant="glass" :disabled="ikuaiConfigSaving">
                                        {{ ikuaiConfigSaving ? '保存中...' : '保存配置' }}
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
                        <h4 class="module-title">PVE 节点设置</h4>
                    </div>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="text-muted small mb-3">配置 Proxmox VE 服务器的连接信息。API Token 和 SSH 密码将加密存储，保存后显示为打码值。</p>
                            <form @submit.prevent="savePveConfig">
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">PVE API 地址</label>
                                        <input type="text" class="form-control" v-model="pveConfig.host" placeholder="https://192.168.1.100:8006">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">API Token</label>
                                        <input type="password" class="form-control" v-model="pveConfig.api_token" placeholder="留空则不修改" autocomplete="off">
                                        <small class="text-muted">格式: root@pam!panel=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</small>
                                    </div>
                                </div>
                                <hr class="my-4">
                                <h6 class="mb-3">SSH 连接（用于终端、密码重置、备份恢复等）</h6>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">SSH 地址</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_host" placeholder="192.168.1.100">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">SSH 端口</label>
                                        <input type="number" class="form-control" v-model="pveConfig.ssh_port" placeholder="22">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">SSH 用户名</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_user" placeholder="root">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">SSH 密码</label>
                                        <input type="password" class="form-control" v-model="pveConfig.ssh_password" placeholder="留空则不修改" autocomplete="off">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="pveStrictTls" v-model="pveConfig.strict_tls">
                                            <label class="form-check-label" for="pveStrictTls">TLS 严格证书验证</label>
                                        </div>
                                        <small class="text-muted">PVE 使用自签证书时请关闭。开启后将验证 PVE API 和 VNC 连接的 TLS 证书。</small>
                                    </div>
                                </div>
                                <div class="d-flex gap-2">
                                    <pv-button type="button" variant="outline" @click="testPveConfig" :disabled="pveTesting">
                                        {{ pveTesting ? '测试中...' : '测试连接' }}
                                    </pv-button>
                                    <pv-button type="submit" variant="glass" :disabled="pveConfigSaving">
                                        {{ pveConfigSaving ? '保存中...' : '保存配置' }}
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
                            <h4 class="module-title">快照 & 备份配置</h4>
                        </div>

                        <!-- 快照配置 -->
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0">快照设置</h5></div>
                            <div class="card-body">
                                <form @submit.prevent="saveSnapshotConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">每台虚拟机最多快照数</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.max_per_vm" min="1" placeholder="5">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">单个用户每日创建上限</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_create_limit" min="1" placeholder="20">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">单个用户每日恢复上限</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_restore_limit" min="1" placeholder="10">
                                        </div>
                                    </div>
                                    <div class="d-flex align-items-center gap-3">
                                        <pv-button type="submit" variant="glass" >保存快照配置</pv-button>
                                        <small class="text-muted">以上限制仅对普通用户生效</small>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 备份配置 -->
                        <div class="card">
                            <div class="card-header"><h5 class="mb-0">备份设置</h5></div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">全局默认备份存储位置</label>
                                    <select class="form-select" v-model="backupConfigForm.default_storage">
                                        <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                    </select>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">每台 VM 最多备份数</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.max_per_vm" min="1">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">单用户每日备份上限</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.daily_limit" min="1">
                                    </div>
                                </div>
                                <p class="text-muted small mb-3">限制仅对普通用户生效，管理员不受限</p>
                                <pv-button @click="saveBackupConfig" variant="glass">保存备份配置</pv-button>
                            </div>
                        </div>
                    </div>

                    <!-- 网络管理 -->
                    <div v-if="activeTab === 'network'">
                        <div class="module-header">
                            <h4 class="module-title">网络配置</h4>
                        </div>
                        <div class="card" style="position: relative; z-index: 3; overflow: visible;">
                            <div class="card-header"><h5 class="mb-0">端口转发配置</h5></div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">端口范围起始</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_start" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">端口范围结束</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_end" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <small class="text-muted">新建端口转发时将自动校验此范围</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">每用户最大规则数</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.max_per_user" min="0" max="100">
                                        <small class="text-muted">0=不限制，超过限制时用户无法新增转发</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">默认外网接口</label>
                                        <div class="input-group">
                                            <input type="text" class="form-control" v-model="networkConfig.wan_interface" placeholder="点击右侧下拉框选择接口" readonly>
                                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" :disabled="wanInterfaceList.length === 0">选择</button>
                                            <ul class="dropdown-menu dropdown-menu-end" style="z-index: 1080;">
                                                <li v-for="iface in wanInterfaceList" :key="iface.name">
                                                    <a class="dropdown-item d-flex justify-content-between align-items-center" :class="{ 'active': isWanInterfaceSelected(iface.name) }" href="#" @click.prevent="toggleWanInterface(iface.name)">
                                                        <span>{{ iface.name }} ({{ iface.ip || '拨号获取' }})</span>
                                                        <i v-if="isWanInterfaceSelected(iface.name)" class="bi bi-check-circle-fill text-primary ms-2"></i>
                                                    </a>
                                                </li>
                                                <li v-if="wanInterfaceList.length === 0"><span class="dropdown-item text-muted">暂无可用接口，请先刷新</span></li>
                                                <li><hr class="dropdown-divider"></li>
                                                <li><a class="dropdown-item text-danger" href="#" @click.prevent="networkConfig.wan_interface = ''">清空</a></li>
                                            </ul>
                                        </div>
                                        <small class="text-muted">多个接口用英文逗号分隔，将作为一条规则绑定多接口</small>
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <pv-button variant="outline" size="lg" @click="refreshIfaceList">刷新接口</pv-button>
                                        <small class="text-muted" v-if="ifaceUpdateTime" style="white-space: nowrap;">最后更新: {{ ifaceUpdateTime }}</small>
                                    </div>
                                </div>
                                <pv-button variant="glass" @click="saveNetworkConfig">保存配置</pv-button>
                            </div>
                        </div>

                        <!-- CNAME 域名配置 -->
                        <div class="card mt-3" style="position: relative; z-index: 1;">
                            <div class="card-header"><h5 class="mb-0">CNAME 域名设置</h5></div>
                            <div class="card-body">
                                <p class="text-muted small mb-3">配置统一公网域名，所有虚拟机/容器通过此域名访问。节点名称支持中文、英文、数字，域名必须以 <code>.</code> 开头（如 <code>.example.com</code>），域名前会自动加上 VMID。</p>
                                <div v-for="(entry, idx) in cnameEntries" :key="idx" class="row g-2 mb-2 align-items-center">
                                    <div class="col-md-3">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.label" placeholder="节点名称（如 电信）">
                                    </div>
                                    <div class="col-md-7">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.domain" placeholder="域名（如 .example.com）">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button @click="removeCnameEntry(idx)" variant="outline-danger" size="sm">删除</pv-button>
                                    </div>
                                </div>
                                <div class="d-flex gap-2 mt-2">
                                    <pv-button @click="addCnameEntry" variant="outline" size="lg">+ 新增节点</pv-button>
                                    <pv-button @click="saveNetworkConfig" variant="glass">保存 CNAME</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- DHCP 服务端设置 -->
                        <div class="card mt-3">
                            <div class="card-header">
                                <h5 class="mb-0">DHCP 服务端设置</h5>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">DNS1</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns1" placeholder="180.76.76.76">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">DNS2</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns2" placeholder="223.5.5.5">
                                    </div>
                                </div>
                                <small class="text-muted">创建私有网络子网的 DHCP 服务端时将自动填入此 DNS。服务接口、网关与地址池由系统按 VLAN 设置自动生成。</small>
                                <div class="mt-3 d-flex gap-2">
                                    <pv-button @click="saveNetworkConfig" variant="glass">保存配置</pv-button>
                                    <pv-button variant="outline" size="lg" @click="syncDhcpBindings">从爱快同步</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- 私有网络 - VLAN 设置 -->
                        <div class="card mt-3" style="position: relative; z-index: 2;">
                            <div class="card-header">
                                <h5 class="mb-0">私有网络 - VLAN 设置</h5>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">IP段开始范围</label>
                                        <input type="text" class="form-control" v-model="networkConfig.vlan_ip_segment_start" placeholder="172.16.0.1">
                                        <small class="text-muted">用户创建私有网络时系统从这里获取开始范围，并在倒数第二位 +1 分配（如 172.16.0.1 → 172.16.1.1 → 172.16.2.1）</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">VLANID 开始范围</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.vlan_id_start" min="2" max="4090" placeholder="1000">
                                        <small class="text-muted">整数范围 2~4090</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">所属接口（LAN）</label>
                                        <select class="form-select" v-model="networkConfig.vlan_interface">
                                            <option value="" disabled>请选择 LAN 接口</option>
                                            <option v-for="iface in lanInterfaceList" :key="iface.name" :value="iface.name">
                                                {{ iface.name }}{{ iface.comment ? ' (' + iface.comment + ')' : '' }}
                                            </option>
                                        </select>
                                        <small class="text-muted">新建子网的 VLAN 将挂载到此物理接口</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">每用户最多创建子网数量</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.vlan_max_per_user" min="0" max="1000" placeholder="5">
                                        <small class="text-muted">0=不限制，超过限制时用户无法新建子网（管理员不受限）</small>
                                    </div>
                                </div>
                                <small class="text-muted">VLAN 名称由系统内置生成（vlan_VPC 开头 + 随机字符，≤15 位），不可编辑；VLAN 备注自动记录所属用户。所有配置修改均记录操作日志。</small>
                                <div class="mt-3 d-flex gap-2">
                                    <pv-button @click="saveNetworkConfig" variant="glass">保存配置</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                <!-- 支付配置 -->
                <div v-if="activeSection === 'settings' && activeTab === 'pay'">
                    <div class="module-header">
                        <h4 class="module-title">支付API对接信息</h4>
                    </div>
                    <div class="table-container" style="padding:24px;">
                        <div class="row g-3">
                            <div class="col-md-6 mb-3">
                                <label class="form-label">接口地址</label>
                                <input type="text" class="form-control" v-model="payConfig.base_url" placeholder="https://pay.microgg.cn/">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">商户ID</label>
                                <input type="number" class="form-control" v-model="payConfig.pid" placeholder="商户号">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V1 MD5秘钥</label>
                                <input type="password" class="form-control" v-model="payConfig.md5_key" placeholder="商户MD5签名密钥">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V2 RSA 商户私钥</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_private_key" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V2 RSA 平台公钥</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_public_key" placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"></textarea>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">充值金额限制</label></div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">最低充值金额（元）</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.min_amount" placeholder="如: 0.01">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">最大充值金额（元）</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.max_amount" placeholder="如: 999999.99">
                            </div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">接口版本开关</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV1Switch" v-model="payConfig.v1_enabled">
                                    <label class="form-check-label" for="payV1Switch">启用 V1 (MD5签名)</label>
                                </div>
                                <small class="text-muted">基于 submit.php / mapi.php / api.php 的 MD5 签名接口</small>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV2Switch" v-model="payConfig.v2_enabled">
                                    <label class="form-check-label" for="payV2Switch">启用 V2 (RSA签名)</label>
                                </div>
                                <small class="text-muted">基于 /api/pay/* 的 RSA-SHA256 签名接口，需填写上方密钥</small>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">支付方式</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payAlipaySwitch" v-model="payConfig.alipay_enabled">
                                    <label class="form-check-label" for="payAlipaySwitch">支付宝</label>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payWxpaySwitch" v-model="payConfig.wxpay_enabled">
                                    <label class="form-check-label" for="payWxpaySwitch">微信支付</label>
                                </div>
                            </div>
                        </div>
                        <pv-button type="button" @click="savePayConfig" style="margin-top:12px;" variant="glass">

                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> 保存配置
                        
</pv-button>
                    </div>
                </div>

                    <!-- 站点设置 -->
                    <div v-if="activeSection === 'settings' && activeTab === 'site'">
                        <div class="module-header">
                            <h4 class="module-title">站点设置</h4>
                        </div>
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">站点名称</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.name" placeholder="站点名称（用于页面标题、邮件等）">
                                    <small class="text-muted">显示在浏览器标签页标题、邮件模板等位置</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">LOGO 文字</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.logo_text" placeholder="侧边栏 LOGO 文字">
                                    <small class="text-muted">显示在管理后台和用户面板左上角</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">登录页 LOGO 文字</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.login_title" placeholder="登录页 LOGO 文字">
                                    <small class="text-muted">显示在登录页卡片上的 LOGO 文字</small>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="registerEnabled" v-model="siteConfigForm.register_enabled">
                                        <label class="form-check-label" for="registerEnabled">允许用户注册</label>
                                    </div>
                                    <small class="text-muted">开启后登录页将显示注册入口</small>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveSiteConfig" :disabled="siteConfigSaving">
                                    {{ siteConfigSaving ? '保存中...' : '保存设置' }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- 模板样式 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-1">模板样式</h5>
                                <p class="text-muted small mb-3">选择全站默认使用的界面模板，点击卡片可实时预览，保存后对所有未设置个人偏好的用户生效（用户可在「用户中心 → 个人设置」中自选覆盖）。</p>
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
                                                <strong>赛博霓虹</strong>
                                                <span v-if="templateStyle === 'default'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">霓虹赛博 · 紫青发光</small>
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
                                                <strong>SAAS 企业风</strong>
                                                <span v-if="templateStyle === 'saas'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">腾讯云风格 · 扁平极简</small>
                                        </div>
                                    </div>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveTemplateStyle" :disabled="templateStyleSaving">
                                    {{ templateStyleSaving ? '保存中...' : '保存模板' }}
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
                                <h5 class="card-title mb-3">Redis 缓存配置</h5>
                                <p class="text-muted small mb-3">配置 Redis 缓存服务。密码将加密存储，留空地址则禁用 Redis，所有缓存回退到进程内存。</p>
                                <form @submit.prevent="saveRedisConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">Redis 地址</label>
                                            <input type="text" class="form-control" v-model="redisConfig.host" placeholder="留空则禁用 Redis">
                                            <small class="text-muted">Redis 服务器主机名或 IP 地址</small>
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">端口</label>
                                            <input type="number" class="form-control" v-model.number="redisConfig.port" placeholder="6379">
                                        </div>
                                        <div class="col-md-3">
                                            <label class="form-label">数据库</label>
                                            <input type="number" class="form-control" v-model.number="redisConfig.db" placeholder="0">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">密码</label>
                                            <input type="password" class="form-control" v-model="redisConfig.password" placeholder="无密码留空">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">Key 前缀</label>
                                            <input type="text" class="form-control" v-model="redisConfig.prefix" placeholder="pve:">
                                            <small class="text-muted">所有缓存 key 的前缀，多实例共用 Redis 时防止冲突</small>
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="button" variant="outline" @click="testRedisConfig" :disabled="redisTesting">
                                            {{ redisTesting ? '测试中...' : '测试连接' }}
                                        </pv-button>
                                        <pv-button type="submit" variant="glass" :disabled="redisConfigSaving">
                                            {{ redisConfigSaving ? '保存中...' : '保存配置' }}
                                        </pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 用户日志上限配置 -->
                        <div class="card mt-3">
                            <div class="card-body">
                                <h5 class="card-title mb-3">日志保留上限</h5>
                                <p class="text-muted small mb-3">用户操作日志按每个用户维度保留，后台操作日志按全站维度保留；超出后自动清理最早的历史数据（每小时清理一次），两者互不挤占。</p>
                                <form @submit.prevent="saveLogConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">用户操作日志（每用户）</label>
                                            <input type="number" class="form-control" v-model.number="logConfigForm.keep_count" min="100" max="100000" placeholder="5000">
                                            <small class="text-muted">范围 100-100000，默认 5000</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">后台操作日志（全站）</label>
                                            <input type="number" class="form-control" v-model.number="logConfigForm.keep_admin_count" min="100" max="100000" placeholder="5000">
                                            <small class="text-muted">范围 100-100000，默认 5000</small>
                                        </div>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="glass" :disabled="logConfigSaving">
                                            {{ logConfigSaving ? '保存中...' : '保存配置' }}
                                        </pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 危险操作：清除缓存 -->
                        <div class="card mt-3" style="border-color: rgba(239, 68, 68, 0.3);">
                            <div class="card-header" style="background: rgba(239, 68, 68, 0.05);">
                                <h5 class="mb-0 text-danger">危险操作</h5>
                            </div>
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <div>
                                        <strong>一键清除所有缓存</strong>
                                        <p class="text-muted small mb-0">将清除 Redis 和内存中的全部缓存数据，包括：用户列表、套餐列表、设备状态、用户活跃状态、JWT 黑名单、未读消息、用户资料、站点配置、验证码、找回密码 Token、限速计数器等。<br>清除后所有用户需重新登录，进行中的操作可能受影响。</p>
                                    </div>
                                    <pv-button type="button" variant="danger" @click="clearAllCache" :disabled="cacheClearing">
                                        {{ cacheClearing ? '清除中...' : '清除所有缓存' }}
                                    </pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                <!-- UApiPro IP 归属地配置 -->
                <div v-if="activeSection === 'settings' && activeTab === 'uapipro'">
                    <div class="module-header">
                        <h4 class="module-title">UApiPro IP 归属地查询</h4>
                    </div>
                    <div class="card">
                        <div class="card-body">
                            <h5 class="card-title mb-3">API 配置</h5>
                            <p class="text-muted small mb-3">使用 uapis.cn 的 IP 归属地查询接口，为登录设备记录等位置显示 IP 归属地（如：203.0.113.42（示例运营商 中国 示例省 示例市））。API Key 将加密存储，留空则使用 uapis.cn 游客免费额度（有调用频率限制）。</p>
                            <div class="form-check form-switch mb-3">
                                <input class="form-check-input" type="checkbox" id="uapiproEnabled" v-model="uapiproConfig.enabled">
                                <label class="form-check-label" for="uapiproEnabled">启用 IP 归属地显示</label>
                            </div>
                            <div class="mb-3">
                                <label class="form-label">API Key</label>
                                <input type="password" class="form-control" v-model="uapiproConfig.api_key" placeholder="uapis.cn 控制台签发的 API Key，留空则使用游客额度">
                                <small class="text-muted">可在 uapis.cn/console 免费签发；通过 X-API-Key 请求头传递，请勿将 Key 放入 URL</small>
                            </div>
                            <pv-button type="button" variant="glass" @click="saveUapiproConfig" :disabled="uapiproSaving">
                                {{ uapiproSaving ? '保存中...' : '保存配置' }}
                            </pv-button>
                        </div>
                    </div>

                    <div class="card mt-3">
                        <div class="card-body">
                            <h5 class="card-title mb-3">IP 查询测试</h5>
                            <p class="text-muted small mb-3">输入公网 IP 验证归属地查询接口是否可用（直接外呼，不经缓存）。</p>
                            <div class="d-flex gap-2 align-items-center flex-wrap">
                                <input type="text" class="form-control" style="max-width:260px;" v-model="uapiproTestIp" placeholder="如: 8.8.8.8">
                                <pv-button type="button" variant="outline" @click="testUapiproIpQuery" :disabled="uapiproTesting">
                                    {{ uapiproTesting ? '查询中...' : '测试查询' }}
                                </pv-button>
                            </div>
                            <div v-if="uapiproTestResult" class="mt-3" style="padding:12px;border-radius:8px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);">
                                <div class="small text-muted">查询 IP：{{ uapiproTestResult.ip }}</div>
                                <div class="mt-1">{{ uapiproTestResult.location || '未查询到归属地信息' }}</div>
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
