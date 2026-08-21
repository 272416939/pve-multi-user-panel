(function() {
  var el = document.getElementById("appTemplate");
  if (el) el.innerHTML = `        <div>
            <div class="login-logo">{{ siteLoginTitle }}</div>
            <div class="login-subtitle">{{ t('login.subtitle') }}</div>
            <div v-if="!showResetPassword" class="row justify-content-center">
                <div class="col-md-12">
                    <div class="card">
                        <div class="card-header">
                            <h5 class="card-title mb-0">{{ t('login.title') }}</h5>
                        </div>
                        <div class="card-body">
                            <div v-if="currentView === 'login'">
                            <div v-if="!showTwofaInput">
                                <form @submit.prevent="login" novalidate>
                                    <div class="mb-3">
                                        <label class="form-label" for="login-username">{{ t('login.username') }}</label>
                                        <input type="text" class="form-control" id="login-username" name="username" autocomplete="username" v-model="loginForm.username" @input="clearLoginErrors" required>
                                        <div class="register-hint">{{ t('login.usernameHint') }}</div>
                                        <span class="login-field-error" v-if="loginUsernameError">{{ loginUsernameError }}</span>
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="login-password">{{ t('login.password') }}</label>
                                        <input type="password" class="form-control" id="login-password" name="password" autocomplete="current-password" v-model="loginForm.password" @input="clearLoginErrors" required>
                                        <span class="login-field-error" v-if="loginPasswordError">{{ loginPasswordError }}</span>
                                    </div>
                                    <div class="form-check mt-1 mb-2">
                                        <input type="checkbox" class="form-check-input" id="login-remember" v-model="loginForm.remember">
                                        <label class="form-check-label" for="login-remember">{{ t('login.remember') }}</label>
                                    </div>
                                    <div class="login-form-error" v-if="loginError">{{ loginError }}</div>
                                    <div class="d-flex gap-2 mt-2">
                                        <button type="submit" class="btn btn-primary login-submit-btn" style="flex:1">{{ t('login.submit') }}</button>
                                        <button v-if="registerEnabled" type="button" class="btn btn-outline-secondary login-submit-btn" style="flex:1" @click="switchView('register')">{{ t('register.title') }}</button>
                                    </div>
                                </form>
                                <div class="mt-3 text-center">
                                    <pv-button type="button" variant="link" @click="showResetPassword = true">{{ t('login.forgotPassword') }}</pv-button>
                                </div>
                            </div>
                            <div v-else>
                                <div class="text-center mb-3">
                                    <h6 class="mb-1">{{ t('login.twoFactorTitle') }}</h6>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label" for="twofa-code">{{ t('login.twoFactorCode') }}</label>
                                    <input type="text" class="form-control" id="twofa-code" autocomplete="one-time-code" v-model="twofaCode" @input="twofaError = ''" @keyup="handleTwofaInput" @keydown.enter.prevent="verifyTwofa" ref="twofaInputRef" maxlength="30" :placeholder="t('login.twoFactorPlaceholder')">
                                    <span class="login-field-error" v-if="twofaError">{{ twofaError }}</span>
                                </div>
                                <p class="text-muted small text-center mb-3" style="font-size:0.82rem;line-height:1.5;">{{ t('login.twoFactorDesc') }}</p>
                                <div class="d-flex gap-2 mt-3">
                                <pv-button type="button" variant="primary" @click="verifyTwofa" style="flex:1">{{ t('login.twoFactorVerify') }}</pv-button>
                                <pv-button type="button" variant="secondary" @click="backToLogin" style="flex:1">{{ t('common.back') }}</pv-button>
                                </div>
                            </div>
                            </div>
                            <div v-else-if="currentView === 'register'" class="register-form">
                                <h6 class="register-title">{{ t('register.title') }}</h6>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('register.username') }}</label>
                                    <input type="text" class="form-control" v-model="registerForm.username" :placeholder="t('register.usernameHint')" autocomplete="username">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('register.password') }}</label>
                                    <input type="password" class="form-control" v-model="registerForm.password" autocomplete="new-password">
                                    <div v-if="passwordStrength.level" class="password-strength">
                                        <div class="password-strength-bar" :class="'strength-' + passwordStrength.level" :style="{ width: passwordStrength.percent + '%' }"></div>
                                    </div>
                                    <div class="password-strength-text" v-if="passwordStrength.text">{{ passwordStrength.text }}</div>
                                    <div class="register-hint">{{ t('user.password.hint') }}</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('register.confirmPassword') }}</label>
                                    <input type="password" class="form-control" v-model="registerConfirmPassword" autocomplete="new-password" :placeholder="t('register.confirmPlaceholder')">
                                    <div v-if="registerConfirmPassword && registerConfirmPassword !== registerForm.password" class="login-field-error">{{ t('register.passwordMismatch') }}</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('register.email') }}</label>
                                    <input type="email" class="form-control" v-model="registerForm.email" autocomplete="email">
                                    <button type="button" class="send-code-btn" @click="sendCode" :disabled="codeCountdown > 0 || !canSendCode">
                                        {{ codeCountdown > 0 ? tFormat('register.resendCountdown', codeCountdown) : t('register.sendCode') }}
                                    </button>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">{{ t('login.captcha') }}</label>
                                    <input type="text" class="form-control" v-model="registerForm.code" maxlength="6" :placeholder="t('register.captchaHint')" autocomplete="one-time-code">
                                </div>
                                <div v-if="registerError" class="login-form-error">{{ registerError }}</div>
                                <button type="button" class="btn btn-primary" style="width:100%" @click="submitRegister" :disabled="registerSubmitting">
                                    {{ registerSubmitting ? t('register.registering') : t('register.submit') }}
                                </button>
                                <div class="mt-3 text-center">
                                    <a href="javascript:void(0)" class="register-back-link" @click="switchView('login')">{{ t('register.hasAccount') }}</a>
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
                            <h5 class="card-title mb-0">{{ t('login.resetTitle') }}</h5>
                        </div>
                        <div class="card-body">
                            <div v-if="!resetTokenValidated">
                                <form @submit.prevent="requestPasswordReset">
                                    <div class="mb-3">
                                        <label class="form-label" for="reset-email">{{ t('login.resetEmail') }}</label>
                                        <input type="email" class="form-control" id="reset-email" name="email" autocomplete="email" v-model="resetEmail" required>
                                    </div>
                                    <div v-if="resetMessage" class="alert alert-success">{{ resetMessage }}</div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="primary" >{{ t('login.resetSendLink') }}</pv-button>
                                        <pv-button type="button" variant="secondary" @click="showResetPassword = false">{{ t('common.back') }}</pv-button>
                                    </div>
                                </form>
                            </div>
                            <div v-else>
                                <form @submit.prevent="resetPassword">
                                    <div class="mb-3">
                                        <label class="form-label" for="new-password">{{ t('user.password.new') }}</label>
                                        <input type="password" class="form-control" id="new-password" name="new-password" autocomplete="new-password" v-model="newPassword" required minlength="6">
                                    </div>
                                    <div class="mb-3">
                                        <label class="form-label" for="confirm-password">{{ t('user.password.confirm') }}</label>
                                        <input type="password" class="form-control" id="confirm-password" name="confirm-password" autocomplete="new-password" v-model="confirmPassword" required minlength="6">
                                    </div>
                                    <div v-if="resetError" class="alert alert-danger">{{ resetError }}</div>
                                    <div v-if="resetSuccess" class="alert alert-success">{{ resetSuccess }}</div>
                                    <pv-button type="submit" variant="primary" >{{ t('user.password.submit') }}</pv-button>
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
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <p class="custom-alert-msg mb-0" style="color:var(--text-primary);font-size:14px;line-height:1.6;">{{ customAlertMessage }}</p>
                        </div>
                        <div class="modal-footer justify-content-center border-0 pt-0 pb-4">
                            <pv-button type="button" variant="primary" data-bs-dismiss="modal">{{ t('common.confirm') }}</pv-button>
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
                            <pv-button type="button" variant="outline" @click="confirmCancel">{{ t('common.cancel') }}</pv-button>
                            <pv-button type="button" variant="primary" @click="confirmOk">{{ t('common.confirm') }}</pv-button>
                        </div>
                    </div>
                </div>
            </div>

            </Teleport>

            <!-- C-2 修复：强制改密模态框 -->
            <Teleport to="body">
            <div v-if="showForceChangePwd" class="modal-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:1060">
                <div class="glass-card" style="max-width:420px;margin:15vh auto;padding:24px;border-radius:16px;text-align:center;background:var(--login-bg-card);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px)">
                    <h3 style="margin-bottom:12px;color:var(--login-text-input)">{{ t('login.forceChange.title') }}</h3>
                    <p style="color:var(--login-text-label);margin-bottom:16px;font-size:13px">{{ t('login.forceChange.desc') }}</p>
                    <input type="password" v-model="forceCurrentPassword" :placeholder="t('login.forceChange.current')" style="width:100%;padding:10px 14px;margin-bottom:10px;border-radius:8px;border:1px solid var(--login-border-input);background:var(--login-bg-input);color:var(--login-text-input);outline:none;box-sizing:border-box;font-size:14px" @keyup="handleForceKeyup" />
                    <input type="password" v-model="forceNewPassword" :placeholder="t('login.forceChange.new')" style="width:100%;padding:10px 14px;margin-bottom:10px;border-radius:8px;border:1px solid var(--login-border-input);background:var(--login-bg-input);color:var(--login-text-input);outline:none;box-sizing:border-box;font-size:14px" @keyup="handleForceKeyup" />
                    <input type="password" v-model="forceConfirmPassword" :placeholder="t('login.forceChange.confirm')" style="width:100%;padding:10px 14px;margin-bottom:10px;border-radius:8px;border:1px solid var(--login-border-input);background:var(--login-bg-input);color:var(--login-text-input);outline:none;box-sizing:border-box;font-size:14px" @keyup="handleForceKeyup" />
                    <div v-if="forcePwdError" style="color:var(--login-color-error);font-size:12px;margin-bottom:12px">{{ forcePwdError }}</div>
                    <pv-button type="button" variant="primary" size="lg" @click="submitForceChangePwd" style="width:100%">{{ t('login.forceChange.submit') }}</pv-button>
                </div>
            </div>
            </Teleport>
        </div>
    `;
})();