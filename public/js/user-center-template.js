(function() {
  var el = document.getElementById("appTemplate");
  if (el) el.innerHTML = `        <div v-if="!user" class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">{{ t('common.loading') }}</span>
            </div>
            <p class="mt-2 text-muted">{{ t('common.loadingAuth') }}</p>
        </div>

        <div v-else>
            <!-- 侧边栏子导航（通过Teleport渲染到#sidebarSubNav） -->
            <Teleport to="#sidebarSubNav">
                <a class="nav-item" :title="t('nav.personal')" :class="{ active: activeSubTab === 'settings' }"
                   @click.prevent="switchSubTab('settings')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span><span class="nav-text">{{ t('nav.personal') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.memos')" :class="{ active: activeSubTab === 'memos' }"
                   @click.prevent="switchSubTab('memos')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span><span class="nav-text">{{ t('nav.memos') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.messages')" :class="{ active: activeSubTab === 'messages' }"
                   @click.prevent="switchSubTab('messages')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg></span><span class="nav-text">{{ t('nav.messages') }}</span>
                    <span v-if="unreadCount > 0" class="nav-badge">{{ unreadCount }}</span>
                </a>
                <a class="nav-item" :title="t('nav.notifications')" :class="{ active: activeSubTab === 'notifications' }"
                   @click.prevent="switchSubTab('notifications')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg></span><span class="nav-text">{{ t('nav.notifications') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.security')" :class="{ active: activeSubTab === 'security' }"
                   @click.prevent="switchSubTab('security')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span><span class="nav-text">{{ t('nav.security') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.recharge')" :class="{ active: activeSubTab === 'wallet-recharge' }"
                   @click.prevent="switchSubTab('wallet-recharge')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></span><span class="nav-text">{{ t('nav.recharge') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.transactions')" :class="{ active: activeSubTab === 'wallet-transactions' }"
                   @click.prevent="switchSubTab('wallet-transactions')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg></span><span class="nav-text">{{ t('nav.transactions') }}</span>
                </a>
                <a class="nav-item" :title="t('nav.myOrders')" :class="{ active: activeSubTab === 'orders' }"
                   @click.prevent="switchSubTab('orders')">
                    <span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg></span><span class="nav-text">{{ t(&#39;nav.myOrders&#39;) }}</span>
                </a>
            </Teleport>

            <div v-if="activeSubTab === 'settings'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <!-- 卡片1：基本资料（头像/用户名/简介） -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-3 text-muted">{{ t('user.profile') }}</h6>
                                <div class="mb-3">
                                    <div class="d-flex align-items-center gap-3">
                                        <div class="avatar-circle">
                                            <img v-if="profileForm.avatar" :src="profileForm.avatar" class="avatar-img">
                                            <img v-else :src="getGeekAvatar(profileForm.username || user?.username)" class="avatar-img">
                                        </div>
                                        <div>
                                            <input type="file" ref="avatarFileInput" class="d-none" accept=".jpg,.jpeg,.png" @change="handleAvatarUpload">
                                            <pv-button type="button" variant="outline" size="lg" @click="$refs.avatarFileInput.click()">{{ t('user.avatar.select') }}</pv-button>
                                            <div class="small text-muted mt-1">{{ avatarFileName || t('user.avatar.none') }}</div>
                                            <small class="text-muted">{{ t('user.avatar.hint') }}</small>
                                        </div>
                                    </div>
                                </div>

                                <form @submit.prevent="updateProfile">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.username') }}</label>
                                        <input type="text" class="form-control" v-model="profileForm.username">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.bio') }}</label>
                                        <textarea class="form-control" rows="3" v-model="profileForm.bio" :placeholder="t('user.bio.placeholder')"></textarea>
                                    </div>
                                    <pv-button type="submit" variant="glass" >{{ t('user.saveProfile') }}</pv-button>
                                </form>
                            </div>
                        </div>

                        <!-- 卡片2：邮箱（独立绑定/换绑） -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-3 text-muted">{{ t('user.email') }}</h6>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('user.email.current') }}</label>
                                    <div class="d-flex align-items-center gap-2">
                                        <span>{{ user.email || t('user.email.unbound') }}</span>
                                        <small v-if="profileForm.emailVerified" class="text-success">✓ {{ t('user.email.verified') }}</small>
                                        <small v-else-if="user.email" class="text-warning">● {{ t('user.email.unverified') }}</small>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ user.email ? t('user.email.rebind') : t('user.email.bind') }}</label>
                                    <div class="d-flex gap-2">
                                        <input type="email" class="form-control" v-model="profileForm.email" :placeholder="user.email ? t('user.email.newPlaceholder') : t('user.email.placeholder')">
                                        <pv-button v-if="profileForm.email && profileForm.email !== user.email" type="button" variant="outline" @click="bindEmail">{{ user.email ? t('user.email.rebind') : t('user.email.bind') }}</pv-button>
                                        <pv-button v-else-if="!profileForm.emailVerified" type="button" variant="secondary" @click="resendVerification">{{ t('user.email.resend') }}</pv-button>
                                    </div>
                                    <!-- M-1 修复：换绑邮箱需输入当前密码做二次验证 -->
                                    <input v-if="profileForm.email && profileForm.email !== user.email" type="password" class="form-control mt-2" v-model="profileForm.emailPassword" :placeholder="t('user.email.passwordHint')">
                                    <div class="mt-1">
                                        <small v-if="profileForm.emailVerified" class="text-success">✓ {{ t('user.email.verified') }}</small>
                                        <small v-else-if="profileForm.email && profileForm.email === user.email" class="text-warning">● {{ t('user.email.unverified') }}</small>
                                        <small v-else-if="profileForm.email" class="text-muted">{{ t('user.email.clickToSave', user.email ? t('user.email.rebind') : t('user.email.bind')) }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 卡片3：修改密码（独立重置按钮，复用注册页确认密码交互） -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-3 text-muted">{{ t('user.password') }}</h6>
                                <form @submit.prevent="updatePassword">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.password.new') }}</label>
                                        <input type="password" class="form-control" v-model="profileForm.password" autocomplete="new-password" :placeholder="t('user.password.new')">
                                        <small class="text-muted">{{ t('user.password.hint') }}</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.password.confirm') }}</label>
                                        <input type="password" class="form-control" v-model="profileForm.confirmPassword" autocomplete="new-password" :placeholder="t('user.password.confirm')">
                                        <small v-if="profileForm.confirmPassword && profileForm.confirmPassword !== profileForm.password" class="text-danger">{{ t('user.password.mismatch') }}</small>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.password.current') }}</label>
                                        <input type="password" class="form-control" v-model="profileForm.currentPassword" autocomplete="current-password" :placeholder="t('user.profile.currentPwdPh')">
                                    </div>
                                    <pv-button type="submit" variant="primary" >{{ t('user.password.submit') }}</pv-button>
                                    <small class="text-muted d-block mt-2">{{ t('user.password.notice') }}</small>
                                </form>
                            </div>
                        </div>

                        <!-- 卡片4：界面模板（个人偏好，覆盖站点全局默认） -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-3 text-muted">{{ t('user.template') }}</h6>
                                <p class="text-muted small mb-3">{{ t('user.template.desc') }}</p>
                                <div class="d-flex flex-wrap gap-3 mb-3">
                                    <!-- 跟随站点默认 -->
                                    <div class="template-picker" :class="{ 'template-picker-active': templatePreference === '' }" @click="selectTemplate('')" role="button" tabindex="0">
                                        <div class="template-preview template-preview-follow">
                                            <div class="tp-follow-center">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16"/><path d="M3 21v-5h5"/></svg>
                                                <span>AUTO</span>
                                            </div>
                                        </div>
                                        <div class="template-picker-body">
                                            <div class="d-flex align-items-center gap-2">
                                                <strong>{{ t('user.template.follow') }}</strong>
                                                <span v-if="templatePreference === ''" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">{{ tFormat('user.template.follow.current', siteDefaultName) }}</small>
                                        </div>
                                    </div>
                                    <!-- 赛博霓虹预览卡 -->
                                    <div class="template-picker" :class="{ 'template-picker-active': templatePreference === 'default' }" @click="selectTemplate('default')" role="button" tabindex="0">
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
                                                <strong>{{ t('settings.template.default') }}</strong>
                                                <span v-if="templatePreference === 'default'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">{{ t('settings.template.default.desc') }}</small>
                                        </div>
                                    </div>
                                    <!-- SAAS 企业风预览卡 -->
                                    <div class="template-picker" :class="{ 'template-picker-active': templatePreference === 'saas' }" @click="selectTemplate('saas')" role="button" tabindex="0">
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
                                                <strong>{{ t('settings.template.saas') }}</strong>
                                                <span v-if="templatePreference === 'saas'" class="template-check">
                                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                </span>
                                            </div>
                                            <small class="text-muted">{{ t('settings.template.saas.desc') }}</small>
                                        </div>
                                    </div>
                                </div>
                                <pv-button type="button" variant="primary" @click="saveTemplatePreference" :disabled="templatePreferenceSaving">
                                    {{ templatePreferenceSaving ? t('common.saving') : t('user.template.save') }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- 卡片5：语言设置（个人偏好，覆盖站点全局默认） -->
                        <div class="card mb-3">
                            <div class="card-body">
                                <h6 class="card-subtitle mb-3 text-muted">{{ t('user.language') }}</h6>
                                <p class="text-muted small mb-3">{{ t('user.language.desc') }} {{ t('user.language.siteDefault') }}<strong>{{ siteDefaultLangName }}</strong>。</p>
                                <div class="mb-3">
                                    <select class="form-select" v-model="langPreference" style="max-width: 300px;">
                                        <option value="">{{ t('user.language.follow') }}</option>
                                        <option value="zh-CN">{{ t('lang.zh-CN') }}</option>
                                        <option value="zh-TW">{{ t('lang.zh-TW') }}</option>
                                        <option value="en">{{ t('lang.en') }}</option>
                                        <option value="de">{{ t('lang.de') }}</option>
                                        <option value="ja">{{ t('lang.ja') }}</option>
                                        <option value="ko">{{ t('lang.ko') }}</option>
                                        <option value="fr">{{ t('lang.fr') }}</option>
                                    </select>
                                </div>
                                <pv-button type="button" variant="primary" @click="saveLangPreference" :disabled="langPreferenceSaving">
                                    {{ langPreferenceSaving ? t('common.saving') : t('user.language.save') }}
                                </pv-button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'memos'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">{{ t('user.memos.title') }}</h4>
                            <pv-button variant="primary" size="sm" @click="addMemo">+ {{ t('user.memos.add') }}</pv-button>
                        </div>
                        <div v-if="memosLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">{{ t('common.loading') }}</span>
                            </div>
                        </div>
                        <div v-else-if="memos.length === 0" class="text-muted text-center py-4">
                            {{ t('user.memos.empty') }}
                        </div>
                        <div v-else class="row g-3">
                            <div v-for="memo in memos" :key="memo.id" class="col-md-6">
                                <div class="card h-100">
                                    <div class="card-body d-flex flex-column">
                                        <div class="d-flex justify-content-between align-items-start mb-2">
                                            <h6 class="mb-0">{{ memo.title || t('user.memos.noTitle') }}</h6>
                                            <div class="btn-group btn-group-sm" style="gap:4px">
                                                <pv-button variant="secondary" @click="editMemo(memo)">{{ t('common.edit') }}</pv-button>
                                                <pv-button variant="danger" @click="deleteMemo(memo.id)">{{ t('common.delete') }}</pv-button>
                                            </div>
                                        </div>
                                        <p class="card-text text-muted small flex-grow-1">{{ memo.content || t('user.memos.noContent') }}</p>
                                        <small class="text-muted">{{ t('user.memos.updatedAt') }} {{ formatDate(memo.updated_at) }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'messages'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">{{ t('user.message.title') }}</h4>
                            <div class="d-flex gap-2">
                                <pv-button variant="outline" size="sm" @click="markAllRead">{{ t('user.message.markAllRead') }}</pv-button>
                                <pv-button variant="danger" size="sm" @click="clearAllMessages">{{ t('user.message.clearRead') }}</pv-button>
                            </div>
                        </div>
                        <!-- 消息类型 tabs：与 admin 日志中心一致的玻璃渐变药丸样式（nav-tabs） -->
                        <ul class="nav nav-tabs mb-3">
                            <li class="nav-item"><a class="nav-link" :class="{ active: msgType === 'all' }" href="#" @click.prevent="msgType = 'all'; loadMessages()">{{ t('common.all') }}</a></li>
                            <li class="nav-item"><a class="nav-link" :class="{ active: msgType === '1' }" href="#" @click.prevent="msgType = '1'; loadMessages()">{{ t('user.message.system') }}</a></li>
                            <li class="nav-item"><a class="nav-link" :class="{ active: msgType === '2' }" href="#" @click.prevent="msgType = '2'; loadMessages()">{{ t('user.message.business') }}</a></li>
                            <li class="nav-item"><a class="nav-link" :class="{ active: msgType === '3' }" href="#" @click.prevent="msgType = '3'; loadMessages()">{{ t('user.message.renewal') }}</a></li>
                            <li class="nav-item"><a class="nav-link" :class="{ active: msgType === '5' }" href="#" @click.prevent="msgType = '5'; loadMessages()">{{ t('user.message.cs') }}</a></li>
                        </ul>
                        <div v-if="messagesLoading" class="text-center py-4">
                            <div class="spinner-border text-primary" role="status">
                                <span class="visually-hidden">{{ t('common.loading') }}</span>
                            </div>
                        </div>
                        <div v-else-if="messages.length === 0" class="text-muted text-center py-4">{{ t('user.message.empty') }}</div>
                        <div v-else class="message-list">
                            <div v-for="msg in messages" :key="msg.id" class="message-item" :class="{ 'message-unread': !msg.is_read }" @click="viewMessage(msg)">
                                <div class="message-header">
                                    <span class="message-type-badge" :class="'msg-type-' + msg.type">
                                        {{ {1:t('user.message.system'),2:t('user.message.business'),3:t('user.message.renewal'),4:t('user.message.ticket'),5:t('user.message.cs')}[msg.type] || t('user.message.title') }}
                                    </span>
                                    <span class="d-flex align-items-center gap-2">
                                        <span class="message-status-badge" :class="msg.is_read ? 'status-read' : 'status-unread'">{{ msg.is_read ? t('user.message.read') : t('user.message.unread') }}</span>
                                        <span class="message-time">{{ formatDate(msg.created_at) }}</span>
                                    </span>
                                </div>
                                <div class="message-title">{{ msg.title }}</div>
                                <div class="message-preview">{{ trimContent(msg.content) }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 通知设置 -->
            <div v-if="activeSubTab === 'notifications'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-body">
                                <h5 class="mb-3 d-flex align-items-center gap-2">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                                    {{ t('user.notif.title') }}
                                </h5>
                                <p class="text-muted mb-4">{{ t('user.notif.desc') }}</p>

                                <!-- 总开关 -->
                                <div class="notification-master-switch mb-4">
                                    <div class="d-flex justify-content-between align-items-center p-3 rounded notification-master-bg">
                                        <div>
                                            <div class="fw-bold">{{ t('user.notif.masterSwitch') }}</div>
                                            <small class="text-muted">{{ t('user.notif.masterSwitchDesc') }}</small>
                                        </div>
                                        <div class="form-check form-switch mb-0">
                                            <input class="form-check-input" type="checkbox" id="emailMasterSwitch"
                                                   :checked="notifSettings.email_notifications_enabled"
                                                   @change="toggleNotifSetting('email_notifications_enabled', $event.target.checked)">
                                            <label class="form-check-label" for="emailMasterSwitch">
                                                {{ notifSettings.email_notifications_enabled ? t('user.notif.on') : t('user.notif.off') }}
                                            </label>
                                        </div>
                                    </div>
                                </div>

                                <!-- 通知分类 -->
                                <div v-for="group in notifGroups" :key="group.key" class="notification-group mb-3">
                                    <div class="notification-group-header d-flex justify-content-between align-items-center p-2 rounded cursor-pointer"
                                         @click="group.expanded = !group.expanded">
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="notification-group-icon" v-html="DOMPurify.sanitize(group.svg)"></span>
                                            <span class="fw-bold">{{ t(group.labelKey) }}</span>
                                            <small class="text-muted">{{ tFormat('user.notif.itemsEnabled', group.enabledCount, group.items.length) }}</small>
                                        </div>
                                        <svg class="notification-chevron transition-transform" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :style="{ transform: group.expanded ? 'rotate(90deg)' : 'rotate(0deg)' }"><polyline points="9 18 15 12 9 6"/></svg>
                                    </div>
                                    <div v-show="group.expanded" class="notification-group-items mt-2">
                                        <div v-for="item in group.items" :key="item.key" class="d-flex justify-content-between align-items-center py-2 px-3 notification-item-row">
                                            <span :class="{ 'text-muted': !notifSettings.email_notifications_enabled }">{{ t(item.labelKey) }}</span>
                                            <div class="form-check form-switch mb-0">
                                                <input class="form-check-input" type="checkbox"
                                                       :id="'notif_' + item.key"
                                                       :checked="notifSettings[item.key]"
                                                       :disabled="!notifSettings.email_notifications_enabled"
                                                       @change="toggleNotifSetting(item.key, $event.target.checked)">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 余额充值 -->
            <div v-if="activeSubTab === 'wallet-recharge'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <span class="text-muted">{{ t('user.wallet.balance') }}</span>
                                    <span class="fw-bold fs-5">¥{{ walletBalance }}</span>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('user.wallet.inputAmount') }}</label>
                                    <input type="number" step="0.01" min="0.01" class="form-control" v-model="rechargeAmount" :placeholder="t('user.wallet.amountPlaceholder')" style="max-width:300px;">
                                    <small class="text-muted">{{ tFormat('user.wallet.amountRange', payMethods.min_amount, payMethods.max_amount) }}</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('user.wallet.payMethod') }}</label>
                                    <div v-if="payMethods.alipay" class="form-check">
                                        <input class="form-check-input" type="radio" v-model="rechargeMethod" value="alipay" id="ucPayAlipay">
                                        <label class="form-check-label" for="ucPayAlipay">{{ t('user.wallet.alipay') }}</label>
                                    </div>
                                    <div v-if="payMethods.wxpay" class="form-check">
                                        <input class="form-check-input" type="radio" v-model="rechargeMethod" value="wxpay" id="ucPayWxpay">
                                        <label class="form-check-label" for="ucPayWxpay">{{ t('user.wallet.wxpay') }}</label>
                                    </div>
                                    <div v-if="!payMethods.alipay && !payMethods.wxpay" class="text-muted small">{{ t('user.wallet.noPayMethod') }}</div>
                                </div>
                                <div v-if="rechargeError" class="alert alert-danger py-2 mb-3">{{ rechargeError }}</div>
                                <pv-button variant="primary" @click="submitRecharge" :disabled="!rechargeMethod || !rechargeAmount || rechargeSubmitting">
                                    <span v-if="rechargeSubmitting">{{ t('user.wallet.submitting') }}</span>
                                    <span v-else>{{ t('user.wallet.submitRecharge') }}</span>
                                </pv-button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 交易明细 -->
            <div v-if="activeSubTab === 'wallet-transactions'">
                <div class="row justify-content-center">
                    <div class="col-md-10">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">{{ t('user.wallet.transactions') }}</h4>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('user.wallet.startTime') }}</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="txFilter.start_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('user.wallet.endTime') }}</label>
                                        <input type="datetime-local" class="form-control form-control-sm" v-model="txFilter.end_time">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('user.wallet.tradeType') }}</label>
                                        <select class="form-select form-select-sm" v-model="txFilter.trade_type">
                                            <option value="">{{ t('common.all') }}</option>
                                            <option value="recharge">{{ t('user.wallet.tx.recharge') }}</option>
                                            <option value="admin_recharge">{{ t('user.wallet.tx.adminRecharge') }}</option>
                                            <option value="new_order">{{ t('user.wallet.tx.newOrder') }}</option>
                                            <option value="renewal">{{ t('user.wallet.tx.renewal') }}</option>
                                            <option value="refund">{{ t('user.wallet.tx.refund') }}</option>
                                            <option value="disk_purchase">{{ t('user.wallet.tx.diskPurchase') }}</option>
                                            <option value="disk_renewal">{{ t('user.wallet.tx.diskRenewal') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('user.wallet.orderNo') }}</label>
                                        <input type="text" class="form-control form-control-sm" v-model="txFilter.order_no" :placeholder="t('user.wallet.orderNoPlaceholder')" autocomplete="off" @keyup.enter="loadTx(1)">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button variant="primary" size="sm" @click="loadTx(1)">{{ t('user.wallet.search') }}</pv-button>
                                        <pv-button variant="outline" size="sm" class="ms-1" @click="txFilter = {start_time:'',end_time:'',trade_type:'',order_no:''};loadTx(1);">{{ t('common.reset') }}</pv-button>
                                    </div>
                                </div>
                                <div class="table-responsive">
                                    <table class="table table-hover table-sm mb-0 table-align-center">
                                        <thead><tr><th>{{ t('user.wallet.payTime') }}</th><th>{{ t('user.wallet.payMethod') }}</th><th>{{ t('user.wallet.orderNo') }}</th><th>{{ t('user.wallet.tradeNo') }}</th><th>{{ t('common.type') }}</th><th>{{ t('user.wallet.amount') }}</th></tr></thead>
                                        <tbody>
                                            <tr v-for="tx in txList" :key="tx.id">
                                                <td>{{ formatDate(tx.pay_time) }}</td>
                                                <td>{{ tx.pay_method === 'alipay' ? t('user.wallet.alipay') : tx.pay_method === 'wxpay' ? t('user.wallet.wxpay') : tx.pay_method === 'balance' ? t('user.wallet.pay.balance') : tx.pay_method === 'manual' ? t('user.wallet.pay.manual') : tx.pay_method === 'balance_refund' ? t('user.wallet.pay.balanceRefund') : tx.pay_method === 'alipay_refund' ? t('user.wallet.pay.alipayRefund') : tx.pay_method === 'wxpay_refund' ? t('user.wallet.pay.wxpayRefund') : tx.pay_method }}</td>
                                                <td><code style="font-size:11px;">{{ tx.order_no }}</code> <pv-button variant="link" size="sm" class="p-0 ms-1" @click="copyOrderNo(tx.order_no)" :title="t('common.copy')">{{ t('common.copy') }}</pv-button></td>
                                                <td><code style="font-size:11px;">{{ tx.trade_no || '-' }}</code></td>
                                                <td><span :class="tx.trade_type === 'recharge' ? 'badge bg-success' : tx.trade_type === 'admin_recharge' ? 'badge bg-warning' : tx.trade_type === 'refund' ? 'badge bg-warning' : tx.trade_type === 'new_order' ? 'badge bg-primary' : tx.trade_type === 'disk_purchase' ? 'badge bg-info' : tx.trade_type === 'disk_renewal' ? 'badge bg-primary' : 'badge badge-renewal'" :style="tx.trade_type !== 'recharge' && tx.trade_type !== 'admin_recharge' && tx.trade_type !== 'refund' && tx.trade_type !== 'new_order' && tx.trade_type !== 'disk_purchase' && tx.trade_type !== 'disk_renewal' ? 'background:#0d9488;color:#fff' : ''">{{ tx.trade_type === 'recharge' ? t('user.wallet.tx.recharge') : tx.trade_type === 'admin_recharge' ? t('user.wallet.tx.adminRecharge') : tx.trade_type === 'refund' ? t('user.wallet.tx.refund') : tx.trade_type === 'new_order' ? t('user.wallet.tx.newOrder') : tx.trade_type === 'disk_purchase' ? t('user.wallet.tx.diskPurchase') : tx.trade_type === 'disk_renewal' ? t('user.wallet.tx.diskRenewal') : t('user.wallet.tx.renewal') }}</span></td>
                                                <td>¥{{ tx.amount }}</td>
                                            </tr>
                                            <tr v-if="!txList || txList.length === 0"><td colspan="6" class="text-center text-muted py-4">{{ t('user.wallet.txEmpty') }}</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                                <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                                <pv-pagination :total="txTotal" :page="txPage" :page-size="txPageSize" @change="loadTx" @page-size-change="changeTxPageSize"></pv-pagination>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 我的订单 -->
            <div v-if="activeSubTab === 'orders'">
                <div class="row justify-content-center">
                    <div class="col-md-10">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h4 class="mb-0">{{ t('nav.myOrders') }}</h4>
                        </div>
                        <div class="table-container mb-4" style="padding:12px;">
                                <div class="row g-2 mb-3 align-items-end">
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('user.order.orderNo') }}</label>
                                        <input type="text" class="form-control form-control-sm" v-model="orderFilter.order_no" :placeholder="t('user.order.orderNoPlaceholder')" autocomplete="off" @keyup.enter="loadMyOrders(1)">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('common.type') }}</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.type">
                                            <option value="">{{ t('common.all') }}</option>
                                            <option value="vm">VM</option>
                                            <option value="lxc">LXC</option>
                                            <option value="disk">{{ t('user.order.disk') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small mb-1">{{ t('common.status') }}</label>
                                        <select class="form-select form-select-sm" v-model="orderFilter.status">
                                            <option value="">{{ t('common.all') }}</option>
                                            <option value="completed">{{ t('user.order.completed') }}</option>
                                            <option value="pending">{{ t('user.order.pending') }}</option>
                                            <option value="refunded">{{ t('user.order.refunded') }}</option>
                                            <option value="destroyed">{{ t('user.order.destroyed') }}</option>
                                        </select>
                                    </div>
                                    <div class="col-md-2 d-flex gap-2">
                                        <pv-button @click="loadMyOrders(1)" size="sm">{{ t('user.order.search') }}</pv-button>
                                        <pv-button @click="orderFilter={order_no:'',type:'',status:''};loadMyOrders(1)" variant="outline" size="sm">{{ t('common.reset') }}</pv-button>
                                    </div>
                                </div>
                            <div class="table-responsive">
                                    <table class="table table-hover table-sm mb-0 table-align-center">
                                        <thead><tr><th>{{ t('user.order.orderNo') }}</th><th>{{ t('user.order.package') }}</th><th>{{ t('common.type') }}</th><th>{{ t('user.order.period') }}</th><th>{{ t('user.order.quantity') }}</th><th>{{ t('user.order.amount') }}</th><th>{{ t('common.status') }}</th><th>{{ t('user.order.time') }}</th></tr></thead>
                                    <tbody>
                                        <tr v-for="o in myOrders" :key="o.id">
                                            <td><code style="font-size:11px;">{{ o.order_no }}</code></td>
                                            <td>{{ o.order_kind === 'renewal' ? (o.type === 'disk' ? (o.resource_name || '') : (o.resource_name || '') + '（' + (o.type === 'vm' ? 'vm' : 'lxc') + '：' + o.resource_id + '）') : (o.type === 'disk' ? o.package_name : o.package_name + '[' + (o.type === 'vm' ? 'vm' : 'lxc') + '：' + o.resource_id + ']') }}</td>
                                            <td><span :class="o.type === 'vm' ? 'badge bg-info' : o.type === 'lxc' ? 'badge bg-success' : 'badge bg-warning'">{{ o.order_kind === 'renewal' ? (o.type === 'vm' ? t('user.order.renewVm') : o.type === 'lxc' ? t('user.order.renewLxc') : t('user.order.renewDisk')) : (o.type === 'vm' ? t('user.order.vm') : o.type === 'lxc' ? t('user.order.lxc') : t('user.order.disk')) }}</span></td>
                                            <td>{{ o.period === 'month' ? t('user.order.periodMonth') : o.period === 'quarter' ? t('user.order.periodQuarter') : t('user.order.periodYear') }}</td>
                                            <td>{{ o.period_count }}</td>
                                            <td>¥{{ o.amount }}</td>
                                            <td><span class="badge" :class="o.status === 'completed' ? 'bg-success' : o.status === 'refunded' ? 'bg-danger' : o.status === 'destroyed' ? 'bg-secondary' : 'bg-warning'">{{ o.status === 'completed' ? t('user.order.completed') : o.status === 'refunded' ? t('user.order.refunded') : o.status === 'destroyed' ? t('user.order.destroyed') : o.status === 'pending' ? t('user.order.pending') : o.status }}</span></td>
                                            <td>{{ formatDate(o.created_at) }}</td>
                                        </tr>
                                        <tr v-if="!myOrders || myOrders.length === 0"><td colspan="8" class="text-center text-muted py-4">{{ t('user.order.empty') }}</td></tr>
                                    </tbody>
                                </table>
                            </div>
                            <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                            <pv-pagination :total="orderTotal" :page="orderPage" :page-size="orderPageSize" @change="loadMyOrders" @page-size-change="changeOrderPageSize"></pv-pagination>
                        </div>
                    </div>
                </div>
            </div>

            <div v-if="activeSubTab === 'security'">
                <div class="row justify-content-center">
                    <div class="col-md-8">
                        <div class="table-container mb-4" style="padding:12px;">
                                <h5 class="mb-3">{{ t('user.devices.title') }}</h5>
                                <div v-if="devicesLoading" class="text-center py-3">
                                    <div class="spinner-border spinner-border-sm text-primary" role="status"></div>
                                </div>
                                <div v-else-if="devices.length === 0" class="text-muted text-center py-3">
                                    {{ t('user.devices.empty') }}
                                </div>
                                <div v-else class="table-responsive">
                                    <table class="table table-sm table-hover mb-0 table-align-center">
                                        <thead>
                                            <tr>
                                                <th>{{ t('user.devices.device') }}</th>
                                                <th>IP</th>
                                                <th>{{ t('user.devices.loginTime') }}</th>
                                                <th>{{ t('common.actions') }}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="d in devices" :key="d.id">
                                                <td>
                                                    <span>{{ d.device_name }}</span>
                                                    <span v-if="d.id === currentDeviceId" class="badge bg-info ms-1" style="font-size:10px;">{{ t('user.devices.current') }}</span>
                                                </td>
                                                <td class="text-muted small">{{ d.ip }}<span v-if="d.ip_location">（{{ d.ip_location }}）</span></td>
                                                <td class="text-muted small">{{ formatDate(d.created_at) }}</td>
                                                <td>
                                                    <pv-button v-if="d.id !== currentDeviceId" variant="danger" size="sm" @click="revokeDevice(d.id)">{{ t('user.devices.revoke') }}</pv-button>
                                                    <span v-else class="text-muted small">-</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div v-if="devices.length > 0" class="mt-2">
                                    <pv-button variant="secondary" size="sm" @click="revokeOtherDevices">{{ t('user.devices.revokeOthers') }}</pv-button>
                                </div>
                        </div>

                        <div class="card">
                            <div class="card-body">
                                <template v-if="!twofaEnabled">
                                    <h5 class="card-title mb-1">{{ t('user.twofa.title') }}</h5>
                                    <p class="text-muted small mb-2">{{ t('user.twofa.desc') }}</p>
                                    <pv-button variant="primary" @click="openTwofaSetup">{{ t('user.twofa.bind') }}</pv-button>
                                    <p class="text-muted small mt-2 mb-0">{{ t('user.twofa.installHint') }}</p>
                                </template>
                                <template v-else>
                                    <h5 class="card-title mb-1">{{ t('user.twofa.enabled') }}</h5>
                                    <p class="text-muted small mb-2">{{ t('user.twofa.enabledDesc') }}</p>
                                    <div class="d-flex gap-2 flex-wrap">
                                        <pv-button variant="outline" size="sm" @click="showRecoveryCodes">{{ t('user.twofa.viewCodes') }}</pv-button>
                                        <pv-button variant="danger" size="sm" @click="openDisableTwofa">{{ t('user.twofa.disableBtn') }}</pv-button>
                                    </div>
                                </template>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Teleport: 弹窗 -->
            <Teleport to="body">
                <!-- 备忘录编辑弹窗 -->
                <div class="modal fade" id="memoModal" tabindex="-1">
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ editMemoForm.id ? t('user.memos.edit') : t('user.memos.new') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <form @submit.prevent="saveMemo">
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.memos.titleLabel') }}</label>
                                        <input type="text" class="form-control" v-model="editMemoForm.title" :placeholder="t('user.memos.titlePh')">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label">{{ t('user.memos.content') }}</label>
                                        <textarea class="form-control" rows="5" v-model="editMemoForm.content" :placeholder="t('user.memos.contentPh')"></textarea>
                                    </div>
                                    <pv-button type="submit" variant="glass">{{ t('common.save') }}</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>

                ${window.__sharedDialogTemplates}

                <!-- 扫码/跳转支付弹窗 -->
                <div class="modal fade" id="rechargePendingModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                    <div class="modal-dialog modal-dialog-centered recharge-pay-modal">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4 px-4">
                                <!-- PC 端：二维码扫码 -->
                                <template v-if="!rechargeIsMobile">
                                    <h6 class="mb-3" style="color:var(--text-primary);font-size:15px;font-weight:600;">{{ tFormat('user.recharge.scanPay', rechargeMethod === 'alipay' ? t('user.recharge.alipay') : t('user.recharge.wxpay')) }}</h6>
                                    <div class="recharge-qr-wrap mb-2">
                                        <div v-if="rechargeQrLoading" class="recharge-qr-loading">
                                            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
                                        </div>
                                        <div id="rechargeQrContainer" class="recharge-qr-container"></div>
                                    </div>
                                    <button type="button" class="btn btn-outline-primary btn-sm recharge-check-btn mb-1" @click="checkPayStatus">{{ t('user.recharge.done') }}</button>
                                </template>
                                <!-- 手机端：跳转按钮 -->
                                <template v-else>
                                    <h6 class="mb-3" style="color:var(--text-primary);font-size:15px;font-weight:600;">{{ t('user.recharge.clickToPay') }}</h6>
                                    <button type="button" class="btn btn-primary recharge-pay-btn mb-3" @click="openMobilePay">
                                        {{ tFormat('user.recharge.openPay', rechargeMethod === 'alipay' ? t('user.recharge.alipay') : t('user.recharge.wxpay')) }}
                                    </button>
                                    <p class="mb-0" style="color:var(--text-secondary);font-size:12px;">{{ t('user.recharge.backHint') }}</p>
                                </template>
                                <!-- 公共订单信息 -->
                                <p class="mb-1" style="color:var(--text-secondary);font-size:13px;">{{ t('user.recharge.orderNo') }}{{ rechargePendingOrderNo }}</p>
                                <p class="mb-0" style="color:var(--text-secondary);font-size:13px;">{{ t('user.recharge.amount') }}<strong style="color:var(--color-primary);">¥{{ rechargePendingAmount }}</strong></p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                                <pv-button type="button" variant="secondary" @click="cancelRecharge">{{ t('user.recharge.cancelPay') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 充值结果弹窗 -->
                <div class="modal fade" id="rechargeResultModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content">
                            <div class="modal-body text-center py-4">
                                <div class="custom-alert-icon mb-3">
                                    <!-- 成功图标 -->
                                    <svg v-if="rechargeResultType === 'success'" width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                                    </svg>
                                    <!-- 失败图标 -->
                                    <svg v-else width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                                    </svg>
                                </div>
                                <h6 class="mb-2" style="color:var(--text-primary);font-size:15px;font-weight:600;">{{ rechargeResultTitle }}</h6>
                                <p v-if="rechargeResultType === 'success'" class="mb-0" style="color:var(--text-secondary);font-size:13px;">
                                    {{ t('user.recharge.success') }}<strong style="color:var(--color-primary);">¥{{ rechargeResultAmount }}</strong>
                                </p>
                            </div>
                            <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                                <button type="button" class="btn btn-primary px-4" @click="closeRechargeResult">{{ t('common.confirm') }}</button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 消息详情弹窗 -->
                <div class="modal fade" id="messageDetailModal" tabindex="-1">
                    <div class="modal-dialog modal-lg">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ currentMsg.title }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <span class="message-type-badge" :class="'msg-type-' + currentMsg.type">
                                        {{ {1:t('user.message.system'),2:t('user.message.business'),3:t('user.message.renewal'),4:t('user.message.ticket'),5:t('user.message.cs')}[currentMsg.type] || t('user.message.title') }}
                                    </span>
                                    <span class="text-muted ms-2 small">{{ formatDate(currentMsg.created_at) }}</span>
                                </div>
                                <div class="message-detail-content markdown-body" style="line-height:1.7;white-space:pre-wrap;" v-html="parseMarkdown(currentMsg.content)"></div>
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" @click="deleteMessage(currentMsg.id)" variant="danger">{{ t('common.delete') }}</pv-button>
                                <pv-button type="button" data-bs-dismiss="modal">{{ t('common.close') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 设置弹窗 -->
                <div class="modal fade" id="twofaSetupModal" tabindex="-1">
                    <div class="modal-dialog modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ t('user.twofa.bind') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">{{ t('user.twofa.scanQr') }}</p>
                                <div class="text-center mb-3">
                                    <img v-if="twofaQrcode" :src="twofaQrcode" alt="2FA QR Code" style="width:200px;height:200px;">
                                </div>
                                <p class="mb-1 small">{{ t('user.twofa.manualKey') }}</p>
                                <p class="mb-3"><code>{{ twofaSecret }}</code></p>
                                <p class="mb-2">{{ t('user.twofa.enterCode') }}</p>
                                <div class="input-group mb-0">
                                    <input type="text" class="form-control" v-model="twofaSetupCode" maxlength="6" :placeholder="t('user.twofa.codePh')">
                                    <pv-button type="button" @click="verifyTwofaSetup" :disabled="twofaSetupCode.length !== 6" variant="primary">{{ t('user.twofa.verifyEnable') }}</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 恢复码弹窗 -->
                <div class="modal fade" id="twofaRecoveryModal" tabindex="-1">
                    <div class="modal-dialog modal-lg modal-dialog-scrollable">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ t('user.twofa.recoveryCode') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <div class="alert alert-warning d-flex align-items-center mb-3" role="alert">
                                    <svg class="me-2 flex-shrink-0" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                    <span>{{ t('user.twofa.saveCodesWarn') }}</span>
                                </div>
                                <div class="table-container mb-3" style="padding:12px;">
                                <table class="table table-sm table-hover table-align-center">
                                    <thead><tr><th>#</th><th>{{ t('user.twofa.recoveryCode') }}</th><th>{{ t('common.status') }}</th><th>{{ t('user.twofa.createdAt') }}</th></tr></thead>
                                    <tbody>
                                        <tr v-for="(rc, idx) in twofaRecoveryCodes" :key="rc.id">
                                            <td class="text-muted small">{{ idx + 1 }}</td>
                                            <td><code style="cursor:pointer;font-size:13px;letter-spacing:1px;" @click="copySingleCode(rc.code)">{{ rc.code }}</code></td>
                                            <td>
                                                <span v-if="rc.used" class="badge bg-secondary">{{ t('user.twofa.used') }}</span>
                                                <span v-else class="badge bg-success">{{ t('user.twofa.unused') }}</span>
                                            </td>
                                            <td class="text-muted small">{{ rc.created_at ? formatDate(rc.created_at) : '-' }}</td>
                                        </tr>
                                    </tbody>
                                </table>
                                </div>
                                <div class="d-flex gap-2 mt-3">
                                    <pv-button variant="secondary" size="sm" @click="copyRecoveryCodes">{{ t('user.twofa.copyAll') }}</pv-button>
                                    <pv-button variant="outline" size="sm" @click="downloadRecoveryCodes">{{ t('common.download') }}</pv-button>
                                    <pv-button variant="outline-danger" size="sm" @click="regenerateRecoveryCodes">{{ t('user.twofa.regenerate') }}</pv-button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2FA 禁用弹窗 -->
                <div class="modal fade" id="twofaDisableModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ t('user.twofa.disable') }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">{{ t('user.twofa.disableConfirmHint') }}</p>
                                <input type="password" class="form-control" v-model="twofaDisablePassword" :placeholder="t('user.twofa.currentPwdPh')">
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="disableTwofa" :disabled="!twofaDisablePassword" variant="danger">{{ t('user.twofa.confirmDisable') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- M-1 修复：敏感操作二次验证弹窗（当前密码或 2FA 动态码） -->
                <div class="modal fade" id="secondaryAuthModal" tabindex="-1" data-bs-backdrop="static">
                    <div class="modal-dialog modal-sm">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h5 class="modal-title">{{ secondaryAuthTitle }}</h5>
                                <pv-button type="button" data-bs-dismiss="modal"></pv-button>
                            </div>
                            <div class="modal-body">
                                <p class="mb-2">{{ t('user.secAuth.hint') }}</p>
                                <!-- V5-修复：不用 @keyup.enter 修饰符（Teleport 内 withKeys helper 触发 Vue 3.3.11 编译产物 _Vue 解构失败），改无修饰符 @keyup + JS 判断 -->
                                <input type="text" class="form-control" v-model="secondaryAuthInput" :placeholder="t('user.secAuth.ph')" @keyup="onSecondaryAuthKeyup">
                            </div>
                            <div class="modal-footer d-flex gap-2">
                                <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                                <pv-button type="button" @click="confirmSecondaryAuth" :disabled="!secondaryAuthInput" variant="primary">{{ t('user.secAuth.verify') }}</pv-button>
                            </div>
                        </div>
                    </div>
                </div>
            </Teleport>

            <!-- Toast 提示 -->
            <transition name="toast-fade">
                <div v-if="toastMessage" class="toast-notification" :class="'toast-' + toastType">
                    {{ toastMessage }}
                </div>
            </transition>

            <div class="text-center py-4 mt-4 text-muted small">
                <div>PVE 管理面板 <span id="appVersion"></span></div>
            </div>
        </div>
    </template>`;
})();
