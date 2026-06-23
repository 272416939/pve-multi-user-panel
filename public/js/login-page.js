const { createApp, ref, onMounted, onUnmounted, nextTick, computed } = Vue;

        function getDeviceName() {
            const ua = navigator.userAgent;
            let browser = '浏览器';
            if (ua.includes('Edg')) browser = 'Edge';
            else if (ua.includes('Chrome')) browser = 'Chrome';
            else if (ua.includes('Firefox')) browser = 'Firefox';
            else if (ua.includes('Safari')) browser = 'Safari';
            let os = '';
            if (ua.includes('HarmonyOS') || ua.includes('鸿蒙') || ua.includes('OpenHarmony')) os = '鸿蒙';
            else if (ua.includes('Windows NT 11')) os = 'Win11';
            else if (ua.includes('Windows NT 10')) os = 'Win10';
            else if (ua.includes('Windows')) os = 'Windows';
            else if (ua.includes('Mac OS X')) os = 'macOS';
            else if (ua.includes('iPhone')) os = 'iPhone';
            else if (ua.includes('iPad')) os = 'iPad';
            else if (ua.includes('Android')) os = 'Android';
            else if (ua.includes('Linux')) os = 'Linux';
            return os ? browser + ' / ' + os : browser;
        }

        const App = {
            template: '#appTemplate',
            setup() {
                const loginForm = ref({ username: '', password: '' });
                const loginError = ref('');
                const loginUsernameError = ref('');
                const loginPasswordError = ref('');
                const showResetPassword = ref(false);
                const resetEmail = ref('');
                const resetMessage = ref('');
                const resetTokenValidated = ref(false);
                const resetToken = ref('');
                const newPassword = ref('');
                const confirmPassword = ref('');
                const resetError = ref('');
                const resetSuccess = ref('');
                const customAlertMessage = ref('');
                const customConfirmMessage = ref('');
                const customConfirmResolve = ref(null);

                const showTwofaInput = ref(false);
                const partialToken = ref('');
                const pendingRefreshToken = ref('');
                const twofaCode = ref('');
                const twofaError = ref('');
                const twofaInputRef = ref(null);

                // C-2 修复：强制改密状态
                const showForceChangePwd = ref(false);
                const forceNewPassword = ref('');
                const forceConfirmPassword = ref('');
                const forcePwdError = ref('');

                // 注册功能
                const currentView = ref('login');
                const registerEnabled = ref(false);
                const siteLoginTitle = ref(window.__siteLoginTitle || 'PVE Panel');
                const registerForm = ref({ username: '', password: '', email: '', code: '' });
                const registerError = ref('');
                const registerSubmitting = ref(false);
                const codeCountdown = ref(0);
                let codeTimer = null;

                setupCustomAlert(customAlertMessage);
                setupCustomConfirm(customConfirmMessage, customConfirmResolve);

                const confirmOk = () => {
                    const resolve = customConfirmResolve.value;
                    if (resolve) {
                        customConfirmResolve.value = null;
                        resolve(true);
                    }
                    const el = document.getElementById('customConfirmModal');
                    if (el) {
                        const modal = bootstrap.Modal.getInstance(el);
                        if (modal) modal.hide();
                    }
                };

                const confirmCancel = () => {
                    const resolve = customConfirmResolve.value;
                    if (resolve) {
                        customConfirmResolve.value = null;
                        resolve(false);
                    }
                    const el = document.getElementById('customConfirmModal');
                    if (el) {
                        const modal = bootstrap.Modal.getInstance(el);
                        if (modal) modal.hide();
                    }
                };

                const login = async () => {
                    loginError.value = '';
                    loginUsernameError.value = '';
                    loginPasswordError.value = '';
                    // 前端空值校验
                    let hasError = false;
                    if (!loginForm.value.username.trim()) {
                        loginUsernameError.value = '用户名不能为空';
                        hasError = true;
                    }
                    if (!loginForm.value.password) {
                        loginPasswordError.value = '登录密码不能为空';
                        hasError = true;
                    }
                    if (hasError) return;
                    try {
                        const body = { ...loginForm.value };
                        body.device_name = getDeviceName();
                        const data = await api('/login', {
                            method: 'POST',
                            body: JSON.stringify(body)
                        });
                        if (data.twofa_required) {
                            partialToken.value = data.partial_token;
                            pendingRefreshToken.value = data.refresh_token || '';
                            showTwofaInput.value = true;
                            twofaCode.value = '';
                            twofaError.value = '';
                            await nextTick();
                            const inputEl = document.getElementById('twofa-code');
                            if (inputEl) inputEl.focus();
                            return;
                        }
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('refreshToken', data.refreshToken);

                        // C-2 修复：强制改密检查
                        if (data.must_change_password) {
                            showForceChangePwd.value = true;
                            forceNewPassword.value = '';
                            forceConfirmPassword.value = '';
                            forcePwdError.value = '';
                            return;
                        }

                        // 获取用户信息，判断角色
                        const userData = await api('/user/profile');
                        if (userData.role === 'admin') {
                            window.location.href = 'admin.html';
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    } catch (e) {
                        if (e.message.includes('网络') || e.message.includes('fetch') || e.message.includes('NetworkError') || e.message.includes('Failed to fetch')) {
                            loginError.value = '服务器连接异常，请稍后再试';
                        } else {
                            loginError.value = e.message;
                        }
                    }
                };

                const clearLoginErrors = () => {
                    loginError.value = '';
                    loginUsernameError.value = '';
                    loginPasswordError.value = '';
                };

                const verifyTwofa = async () => {
                    twofaError.value = '';
                    const code = twofaCode.value.trim();
                    if (!code) {
                        twofaError.value = '请输入验证码';
                        return;
                    }
                    try {
                        const data = await api('/login/2fa', {
                            method: 'POST',
                            body: JSON.stringify({
                                partial_token: partialToken.value,
                                code: code,
                                refresh_token: pendingRefreshToken.value
                            })
                        });
                        localStorage.setItem('token', data.token);
                        localStorage.setItem('refreshToken', data.refreshToken);

                        // C-2 修复：强制改密检查（2FA 登录）
                        if (data.must_change_password) {
                            showForceChangePwd.value = true;
                            forceNewPassword.value = '';
                            forceConfirmPassword.value = '';
                            forcePwdError.value = '';
                            return;
                        }

                        const userData = await api('/user/profile');
                        if (userData.role === 'admin') {
                            window.location.href = 'admin.html';
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    } catch (e) {
                        if (e.message.includes('网络') || e.message.includes('fetch') || e.message.includes('NetworkError') || e.message.includes('Failed to fetch')) {
                            twofaError.value = '服务器连接异常，请稍后再试';
                        } else {
                            twofaError.value = e.message;
                        }
                    }
                };

                const backToLogin = () => {
                    showTwofaInput.value = false;
                    partialToken.value = '';
                    pendingRefreshToken.value = '';
                    twofaCode.value = '';
                    twofaError.value = '';
                };

                const handleTwofaInput = (e) => {
                    twofaCode.value = e.target.value;
                };

                const requestPasswordReset = async () => {
                    try {
                        await api('/auth/forgot-password', {
                            method: 'POST',
                            body: JSON.stringify({ email: resetEmail.value })
                        });
                        resetMessage.value = '如果该邮箱已绑定，重置链接已发送！';
                    } catch (e) {
                        resetMessage.value = '如果该邮箱已绑定，重置链接已发送！';
                    }
                };

                const resetPassword = async () => {
                    try {
                        resetError.value = '';
                        resetSuccess.value = '';
                        if (newPassword.value !== confirmPassword.value) {
                            resetError.value = '两次输入的密码不一致！';
                            return;
                        }
                        await api('/auth/reset-password', {
                            method: 'POST',
                            body: JSON.stringify({ token: resetToken.value, newPassword: newPassword.value })
                        });
                        resetSuccess.value = '密码重置成功！';
                        setTimeout(() => {
                            showResetPassword.value = false;
                            resetTokenValidated.value = false;
                        }, 2000);
                    } catch (e) {
                        resetError.value = e.message;
                    }
                };

                // C-2 修复：提交强制改密
                const submitForceChangePwd = async () => {
                    forcePwdError.value = '';
                    const newPwd = forceNewPassword.value;
                    const confirmPwd = forceConfirmPassword.value;

                    if (!newPwd || newPwd.length < 8) {
                        forcePwdError.value = '密码长度至少8位';
                        return;
                    }
                    if (newPwd !== confirmPwd) {
                        forcePwdError.value = '两次输入的密码不一致';
                        return;
                    }

                    try {
                        await api('/user/profile', {
                            method: 'PUT',
                            body: JSON.stringify({ password: newPwd })
                        });
                        // 改密成功，获取角色信息后跳转
                        const userData = await api('/user/profile');
                        showForceChangePwd.value = false;
                        if (userData.role === 'admin') {
                            window.location.href = 'admin.html';
                        } else {
                            window.location.href = 'dashboard.html';
                        }
                    } catch (e) {
                        forcePwdError.value = e.message || '修改失败，请重试';
                    }
                };

                // 注册功能：切换视图
                const switchView = (view) => {
                    currentView.value = view;
                    registerError.value = '';
                };

                // 注册功能：密码强度计算
                const passwordStrength = computed(() => {
                    const pwd = registerForm.value.password;
                    if (!pwd) return { level: '', percent: 0, text: '' };
                    const hasLower = /[a-z]/.test(pwd);
                    const hasUpper = /[A-Z]/.test(pwd);
                    const hasSpecial = /[@#$%^&*!]/.test(pwd);
                    const hasLen = pwd.length >= 8;
                    const score = [hasLower, hasUpper, hasSpecial, hasLen].filter(Boolean).length;
                    if (score <= 1) return { level: 'weak', percent: 33, text: '弱' };
                    if (score <= 3) return { level: 'medium', percent: 66, text: '中' };
                    return { level: 'strong', percent: 100, text: '强' };
                });

                // 注册功能：发送验证码
                const sendCode = async () => {
                    const email = registerForm.value.email.trim();
                    if (!email) { registerError.value = '请输入邮箱'; return; }
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { registerError.value = '邮箱格式不正确'; return; }
                    if (codeCountdown.value > 0) return;
                    try {
                        registerError.value = '';
                        const res = await api('/register/send-code', { method: 'POST', body: JSON.stringify({ email }) });
                        if (res.success) {
                            codeCountdown.value = 60;
                            codeTimer = setInterval(() => {
                                codeCountdown.value--;
                                if (codeCountdown.value <= 0) { clearInterval(codeTimer); codeTimer = null; }
                            }, 1000);
                        } else {
                            registerError.value = res.error || '验证码发送失败';
                        }
                    } catch (e) {
                        registerError.value = e.message || '请求失败，请稍后重试';
                    }
                };

                // 注册功能：提交注册
                const submitRegister = async () => {
                    const f = registerForm.value;
                    if (!f.username || f.username.length < 3 || f.username.length > 32) {
                        registerError.value = '用户名长度需为 3-32 位'; return;
                    }
                    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*[@#$%^&*!]).{8,}$/.test(f.password)) {
                        registerError.value = '密码必须至少 8 位，包含大小写字母和特殊字符'; return;
                    }
                    if (!f.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) {
                        registerError.value = '邮箱格式不正确'; return;
                    }
                    if (!f.code || f.code.length !== 6) {
                        registerError.value = '请输入 6 位验证码'; return;
                    }
                    registerSubmitting.value = true;
                    registerError.value = '';
                    try {
                        const res = await api('/register', { method: 'POST', body: JSON.stringify(f) });
                        if (res.success) {
                            switchView('login');
                            loginForm.value.username = f.username;
                            alert(res.message || '注册成功，请登录');
                            registerForm.value = { username: '', password: '', email: '', code: '' };
                            if (codeTimer) { clearInterval(codeTimer); codeTimer = null; codeCountdown.value = 0; }
                        } else {
                            registerError.value = res.error || '注册失败';
                        }
                    } catch (e) {
                        registerError.value = e.message || '请求失败，请稍后重试';
                    }
                    registerSubmitting.value = false;
                };

                onMounted(async () => {
                    const urlParams = new URLSearchParams(window.location.search);
                    const resetTokenParam = urlParams.get('resetPassword');

                    if (resetTokenParam) {
                        showResetPassword.value = true;
                        resetToken.value = resetTokenParam;
                        fetch('/api/auth/reset-password/' + resetTokenParam).then(res => {
                            if (res.ok) {
                                resetTokenValidated.value = true;
                            } else {
                                resetError.value = '链接无效或已过期';
                            }
                        }).catch(err => {
                            resetError.value = '链接无效或已过期';
                        });
                        window.history.replaceState({}, document.title, window.location.pathname);
                        return;
                    }

                    // 检查是否已登录
                    const token = localStorage.getItem('token');
                    if (token) {
                        window.location.href = 'dashboard.html';
                        return;
                    }

                    // 获取站点配置（含注册开关和登录页 LOGO 文字）
                    try {
                        const res = await api('/site/config');
                        siteLoginTitle.value = res.login_title || 'PVE Panel';
                        registerEnabled.value = res.register_enabled === true;
                    } catch (e) {
                        registerEnabled.value = false;
                    }
                });

                onUnmounted(() => {
                    if (codeTimer) {
                        clearInterval(codeTimer);
                        codeTimer = null;
                    }
                });

                return {
                    loginForm,
                    loginError,
                    loginUsernameError,
                    loginPasswordError,
                    showResetPassword,
                    resetEmail,
                    resetMessage,
                    resetTokenValidated,
                    resetToken,
                    newPassword,
                    confirmPassword,
                    resetError,
                    resetSuccess,
                    customAlertMessage,
                    customConfirmMessage,
                    showTwofaInput,
                    twofaCode,
                    twofaError,
                    twofaInputRef,
                    // C-2 修复：强制改密
                    showForceChangePwd,
                    forceNewPassword,
                    forceConfirmPassword,
                    forcePwdError,
                    login,
                    clearLoginErrors,
                    verifyTwofa,
                    backToLogin,
                    handleTwofaInput,
                    requestPasswordReset,
                    resetPassword,
                    submitForceChangePwd,
                    // 注册功能
                    currentView,
                    registerEnabled,
                    siteLoginTitle,
                    registerForm,
                    registerError,
                    registerSubmitting,
                    codeCountdown,
                    passwordStrength,
                    switchView,
                    sendCode,
                    submitRegister,
                    confirmOk,
                    confirmCancel
                };
            }
        };

        var app = createApp(App);
        app.mount('#app');

// Theme toggle — 统一使用 theme-init.js
if (window.initThemeToggle) window.initThemeToggle();