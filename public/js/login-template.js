(function() {
  var el = document.getElementById("appTemplate");
  if (el) el.innerHTML = `        <div>
            <div v-if="!showResetPassword" class="row justify-content-center">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">登录</h5>
                        </div>
                        <div class="card-body">
                            <div v-if="registerEnabled" class="login-tab-switch">
                                <button type="button" :class="{ active: currentView === 'login' }" @click="switchView('login')">登录</button>
                                <button type="button" :class="{ active: currentView === 'register' }" @click="switchView('register')">注册</button>
                            </div>
                            <div v-if="currentView === 'login'">
                            <div v-if="!showTwofaInput">
                                <form @submit.prevent="login" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label" for="login-username">用户名</label>
                                        <input type="text" class="form-control" id="login-username" name="username" autocomplete="username" v-model="loginForm.username" @input="clearLoginErrors" required>
                                        <span class="login-field-error" v-if="loginUsernameError">{{ loginUsernameError }}</span>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="login-password">密码</label>
                                        <input type="password" class="form-control" id="login-password" name="password" autocomplete="current-password" v-model="loginForm.password" @input="clearLoginErrors" required>
                                        <span class="login-field-error" v-if="loginPasswordError">{{ loginPasswordError }}</span>
                                    </div>
                                    <div class="login-form-error" v-if="loginError">{{ loginError }}</div>
                                    <pv-button type="submit" variant="primary" style="width:100%">登录</pv-button>
                                </form>
                                <div class="mt-3 text-center">
                                    <pv-button type="button" variant="link" @click="showResetPassword = true">忘记密码？</pv-button>
                                </div>
                            </div>
                            <div v-else>
                                <div class="text-center mb-3">
                                    <h6 class="mb-1">双重验证</h6>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label" for="twofa-code">验证码</label>
                                    <input type="text" class="form-control" id="twofa-code" autocomplete="one-time-code" v-model="twofaCode" @input="twofaError = ''" @keyup="handleTwofaInput" @keydown.enter.prevent="verifyTwofa" ref="twofaInputRef" maxlength="30" placeholder="输入 6 位验证码或恢复码">
                                    <span class="login-field-error" v-if="twofaError">{{ twofaError }}</span>
                                </div>
                                <p class="text-muted small text-center mb-3" style="font-size:0.82rem;line-height:1.5;">请输入身份验证器中的 6 位验证码，或使用恢复码登录</p>
                                <pv-button type="button" variant="primary" @click="verifyTwofa">验证</pv-button>
                                <pv-button type="button" variant="secondary" @click="backToLogin">返回</pv-button>
                            </div>
                            </div>
                            <div v-else-if="currentView === 'register'" class="register-form">
                                <h6 class="register-title">注册新账号</h6>
                                <div class="mb-3">
                                    <label class="form-label">用户名</label>
                                    <input type="text" class="form-control" v-model="registerForm.username" placeholder="3-32 位字符" autocomplete="username">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">密码</label>
                                    <input type="password" class="form-control" v-model="registerForm.password" autocomplete="new-password">
                                    <div v-if="passwordStrength.level" class="password-strength">
                                        <div class="password-strength-bar" :class="'strength-' + passwordStrength.level" :style="{ width: passwordStrength.percent + '%' }"></div>
                                    </div>
                                    <div class="password-strength-text" v-if="passwordStrength.text">{{ passwordStrength.text }}</div>
                                    <div class="register-hint">至少 8 位，包含大小写字母和特殊字符 (@#$%^&*!)</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">邮箱</label>
                                    <input type="email" class="form-control" v-model="registerForm.email" autocomplete="email">
                                    <button type="button" class="send-code-btn" @click="sendCode" :disabled="codeCountdown > 0">
                                        {{ codeCountdown > 0 ? codeCountdown + 's 后重发' : '发送验证码' }}
                                    </button>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">验证码</label>
                                    <input type="text" class="form-control" v-model="registerForm.code" maxlength="6" placeholder="6 位数字" autocomplete="one-time-code">
                                </div>
                                <div v-if="registerError" class="login-form-error">{{ registerError }}</div>
                                <button type="button" class="btn btn-primary" style="width:100%" @click="submitRegister" :disabled="registerSubmitting">
                                    {{ registerSubmitting ? '注册中...' : '注册' }}
                                </button>
                                <div class="mt-3 text-center">
                                    <a href="javascript:void(0)" class="register-back-link" @click="switchView('login')">已有账号？去登录</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div v-else class="row justify-content-center">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">重置密码</h5>
                        </div>
                        <div class="card-body">
                            <div v-if="!resetTokenValidated">
                                <form @submit.prevent="requestPasswordReset">
                                    <div class="mb-3">
                                        <label class="form-label" for="reset-email">邮箱地址</label>
                                        <input type="email" class="form-control" id="reset-email" name="email" autocomplete="email" v-model="resetEmail" required>
                                    </div>
                                    <div v-if="resetMessage" class="alert alert-success">{{ resetMessage }}</div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" >发送重置链接</pv-button>
                                        <pv-button type="button" variant="secondary" @click="showResetPassword = false">返回</pv-button>
                                    </div>
                                </form>
                            </div>
                            <div v-else>
                                <form @submit.prevent="resetPassword">
                                    <div class="mb-3">
                                        <label class="form-label" for="new-password">新密码</label>
                                        <input type="password" class="form-control" id="new-password" name="new-password" autocomplete="new-password" v-model="newPassword" required minlength="6">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="confirm-password">确认密码</label>
                                        <input type="password" class="form-control" id="confirm-password" name="confirm-password" autocomplete="new-password" v-model="confirmPassword" required minlength="6">
                                    </div>
                                    <div v-if="resetError" class="alert alert-danger">{{ resetError }}</div>
                                    <div v-if="resetSuccess" class="alert alert-success">{{ resetSuccess }}</div>
                                    <pv-button type="submit" variant="primary" >重置密码</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Teleport to="body">

            <div class="modal fade" id="customAlertModal" tabindex="-1" data-bs-backdrop="static">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-body text-center py-4">
                            <div class="custom-alert-icon mb-3" aria-hidden="true">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customAlertMessage }}</p>
                        </div>
                        <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                            <pv-button type="button" variant="primary" data-bs-dismiss="modal">确定</pv-button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal fade" id="customConfirmModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
                <div class="modal-dialog modal-sm modal-dialog-centered">
                    <div class="modal-content">
                        <div class="modal-body text-center py-4">
                            <div class="custom-alert-icon mb-3" aria-hidden="true">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#ffc107" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                            </div>
                            <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customConfirmMessage }}</p>
                        </div>
                        <div class="modal-footer justify-content-center border-0 pt-0 pb-4 gap-3">
                            <pv-button type="button" variant="outline" @click="confirmCancel">取消</pv-button>
                            <pv-button type="button" variant="primary" @click="confirmOk">确定</pv-button>
                        </div>
                    </div>
                </div>
            </div>

            </Teleport>

            <!-- C-2 修复：强制改密模态框 -->
            <Teleport to="body">
            <div v-if="showForceChangePwd" class="modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1060">
                <div class="glass-card" style="max-width:420px;margin:15vh auto;padding:24px;border-radius:16px;text-align:center;background:var(--login-bg-card);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)">
                    <h3 style="margin-bottom:12px;color:var(--login-text-input)">首次登录 - 强制修改密码</h3>
                    <p style="color:var(--login-text-label);margin-bottom:16px;font-size:13px">为了账户安全，请设置一个新的登录密码</p>
                    <input type="password" v-model="forceNewPassword" placeholder="新密码（至少8位）" style="width:100%;padding:10px 14px;margin-bottom:10px;border-radius:8px;border:1px solid var(--login-border-input);background:var(--login-bg-input);color:var(--login-text-input);outline:none;box-sizing:border-box;font-size:14px" @keyup.enter="submitForceChangePwd" />
                    <input type="password" v-model="forceConfirmPassword" placeholder="确认新密码" style="width:100%;padding:10px 14px;margin-bottom:10px;border-radius:8px;border:1px solid var(--login-border-input);background:var(--login-bg-input);color:var(--login-text-input);outline:none;box-sizing:border-box;font-size:14px" @keyup.enter="submitForceChangePwd" />
                    <div v-if="forcePwdError" style="color:var(--login-color-error);font-size:12px;margin-bottom:12px">{{ forcePwdError }}</div>
                    <pv-button type="button" @click="submitForceChangePwd" style="width:100%;padding:10px;border:none;border-radius:8px;background:var(--login-gradient-primary);color:#fff;font-size:14px;cursor:pointer;font-weight:600">确认修改</pv-button>
                </div>
            </div>
            </Teleport>
        </div>
    `;
})();
