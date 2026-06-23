        const urlParams = new URLSearchParams(window.location.search);
        const resetTokenParam = urlParams.get('resetPassword');
        
        if (resetTokenParam) {
            // 有重置密码 token，保留参数跳转到登录页
            window.location.replace('login?resetPassword=' + resetTokenParam);
        } else {
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    window.location.replace(payload.role === 'admin' ? 'admin' : 'dashboard');
                } catch (e) {
                    window.location.replace('dashboard');
                }
            } else {
                window.location.replace('login');
            }
        }
