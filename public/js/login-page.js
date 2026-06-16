const { createApp, ref, onMounted, nextTick } = Vue;

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

                onMounted(() => {
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
                    confirmOk,
                    confirmCancel
                };
            }
        };

        createApp(App).mount('#app');

(function() {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    btn.addEventListener('click', function() {
        var current = document.documentElement.getAttribute('data-theme') || 'dark';
        var next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next;
        var cm = document.querySelector('meta[name="color-scheme"]');
        if (cm) cm.content = next;
        if (document.body) document.body.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
    });
})();