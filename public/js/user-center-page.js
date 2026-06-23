const { createApp, ref, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } = Vue;

const App = {
    template: '#appTemplate',
    setup() {
        const user = ref(null);
        const activeSubTab = ref(localStorage.getItem('ucenter_subtab') || 'settings');
        const navItems = ref([]);
        const currentNavId = ref('user-center');

        const profileForm = ref({ username: '', password: '', bio: '', avatar: '', email: '', emailVerified: false });
        const memos = ref([]);
        const memosLoading = ref(false);
        const editMemoForm = ref({ id: null, title: '', content: '' });
        const unreadCount = ref(0);
        const messages = ref([]);
        const messagesLoading = ref(false);
        const msgType = ref('all');
        const currentMsg = ref({ title: '', content: '', type: 1, created_at: '' });

        const devices = ref([]);
        const devicesLoading = ref(false);
        const currentDeviceId = ref(0);

        const twofaEnabled = ref(false);
        const twofaRecoveryCount = ref(0);
        const twofaSecret = ref('');
        const twofaQrcode = ref('');
        const twofaSetupCode = ref('');
        const twofaDisablePassword = ref('');
        const twofaRecoveryCodes = ref([]);

        // 钱包
        const walletBalance = ref('0.00');
        const payMethods = ref({ alipay: false, wxpay: false, min_amount: 0.01, max_amount: 999999.99 });
        const rechargeAmount = ref('');
        const rechargeMethod = ref('');
        const rechargeSubmitting = ref(false);
        const rechargeError = ref('');
        const txList = ref([]);
        const txTotal = ref(0);
        const txPage = ref(1);
        const txFilter = ref({ start_time: '', end_time: '', trade_type: '', order_no: '' });
        const myOrders = ref([]);

        // 充值轮询相关
        const rechargePendingOrderNo = ref('');
        const rechargePendingAmount = ref('');
        const rechargeResultType = ref(''); // success / fail / cancel / timeout
        const rechargeResultTitle = ref('');
        const rechargeResultAmount = ref('');
        const rechargeQrLoading = ref(false);    // PC 端二维码生成中
        const rechargePayUrl = ref('');          // 支付链接（手机端跳转用）
        const rechargeIsMobile = ref(false);     // 是否手机端
        let rechargePollingTimer = null;

        const parseMarkdown = (text) => {
            if (!text) return '';
            try {
                return DOMPurify.sanitize(marked.parse(text));
            } catch {
                return text;
            }
        };

        const customAlertMessage = ref('');
        const customConfirmMessage = ref('');
        const customConfirmResolve = ref(null);

        window.alert = (message) => {
            customAlertMessage.value = message;
            const el = document.getElementById('customAlertModal');
            if (el) {
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.blur();
                }
                document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
                el.addEventListener('hide.bs.modal', function onHide() {
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                }, { once: true });
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                new bootstrap.Modal(el, { focus: false }).show();
            }
        };

        window.customConfirm = (message) => {
            return new Promise((resolve) => {
                customConfirmMessage.value = message;
                customConfirmResolve.value = resolve;
                const el = document.getElementById('customConfirmModal');
                if (!el) { resolve(false); return; }
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.blur();
                }
                document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
                el.addEventListener('hide.bs.modal', function onHide() {
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                }, { once: true });
                // 获取动态 z-index（customConfirmModal 不走 bsModalShow，需单独管理）
                const zIndex = window.ModalZIndexManager.acquire();
                el._modalZIndex = zIndex;
                el.style.zIndex = zIndex;
                // hidden 时释放 z-index（confirmOk/confirmCancel 均通过 modal.hide() 关闭）
                el.addEventListener('hidden.bs.modal', function onHidden() {
                    el.removeEventListener('hidden.bs.modal', onHidden);
                    if (el._modalZIndex != null) {
                        window.ModalZIndexManager.release(el._modalZIndex);
                        el._modalZIndex = null;
                        el.style.zIndex = '';
                    }
                }, { once: true });
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                new bootstrap.Modal(el, { focus: false }).show();
                // shown 后设置 backdrop z-index
                el.addEventListener('shown.bs.modal', function onShown() {
                    el.removeEventListener('shown.bs.modal', onShown);
                    var backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.style.zIndex = window.ModalZIndexManager.acquireBackdrop(zIndex);
                    }
                }, { once: true });
            });
        };

        // ===== 钱包相关 =====
        const loadWalletBalance = async () => {
            try {
                const res = await api('/wallet/balance');
                walletBalance.value = res.balance || '0.00';
            } catch (e) { console.error('钱包余额加载失败', e); }
        };

        const loadPayMethods = async () => {
            try {
                const res = await api('/wallet/pay-config');
                payMethods.value = res;
            } catch (e) { console.error('支付配置加载失败', e); }
        };

        const submitRecharge = async () => {
            // 重复提交防护
            if (rechargePollingTimer) {
                rechargeError.value = '已有充值进行中，请先完成或取消';
                return;
            }
            const amount = parseFloat(rechargeAmount.value);
            if (isNaN(amount) || amount <= 0) { rechargeError.value = '请输入有效的充值金额'; return; }
            const min = parseFloat(payMethods.value.min_amount) || 0.01;
            if (amount < min) { rechargeError.value = '最低充值金额为 ' + min.toFixed(2) + ' 元'; return; }
            if (!rechargeMethod.value) { rechargeError.value = '请选择支付方式'; return; }
            rechargeSubmitting.value = true;
            rechargeError.value = '';
            try {
                const res = await api('/wallet/recharge', { method: 'POST', body: { amount: amount.toFixed(2), pay_method: rechargeMethod.value } });
                if (res.success && res.redirect_url) {
                    const payUrl = res.redirect_url;
                    rechargePendingOrderNo.value = res.order_no;
                    rechargePendingAmount.value = amount.toFixed(2);
                    rechargePayUrl.value = payUrl;
                    // 设备检测
                    const ua = navigator.userAgent || '';
                    const mobile = /Android|iPhone|iPad|iPod|Mobile|Windows Phone/i.test(ua);
                    rechargeIsMobile.value = mobile;
                    if (mobile) {
                        // 手机端：不生成二维码，显示跳转按钮
                        rechargeQrLoading.value = false;
                    } else {
                        // PC 端：用支付链接生成二维码（qrcodejs2 渲染到 DOM）
                        if (!window.QRCode) {
                            rechargeError.value = '二维码库加载失败，请刷新重试';
                            rechargeSubmitting.value = false;
                            return;
                        }
                        rechargeQrLoading.value = true;
                    }
                    // 显示扫码支付弹窗
                    const modalEl = document.getElementById('rechargePendingModal');
                    if (modalEl) {
                        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
                        modal.show();
                    }
                    // PC 端：弹窗 DOM 渲染后生成二维码
                    if (!mobile) {
                        nextTick(() => {
                            var qrContainer = document.getElementById('rechargeQrContainer');
                            if (qrContainer) {
                                qrContainer.innerHTML = '';
                                try {
                                    new QRCode(qrContainer, {
                                        text: payUrl,
                                        width: 240,
                                        height: 240,
                                        colorDark: '#000000',
                                        colorLight: '#ffffff'
                                    });
                                    rechargeQrLoading.value = false;
                                } catch (e2) {
                                    console.error('二维码生成失败', e2);
                                    rechargeError.value = '二维码生成失败，请稍后重试';
                                    rechargeSubmitting.value = false;
                                }
                            }
                        });
                    }
                    // 启动轮询
                    pollOrderStatus(res.order_no, amount.toFixed(2));
                } else { rechargeError.value = res.error || '创建订单失败'; }
            } catch (e) { rechargeError.value = e.message || '请求失败，请稍后重试'; }
            rechargeSubmitting.value = false;
        };

        const pollOrderStatus = (orderNo, amount) => {
            const startTime = Date.now();
            const timeout = 10 * 60 * 1000; // 10 分钟
            let interval = 2000; // 默认 2 秒
            let consecutiveErrors = 0; // 连续错误计数

            const tick = async () => {
                // 检查超时
                if (Date.now() - startTime > timeout) {
                    stopPolling();
                    closePendingModal();
                    showRechargeResult('timeout', '');
                    return;
                }
                // 查询订单状态
                try {
                    const status = await api('/wallet/order-status/' + orderNo);
                    consecutiveErrors = 0;
                    interval = 2000; // 恢复正常间隔
                    if (status.status === 'paid') {
                        stopPolling();
                        closePendingModal();
                        showRechargeResult('success', status.amount || amount);
                        loadWalletBalance();
                        rechargeAmount.value = '';
                        rechargeMethod.value = '';
                        return;
                    }
                } catch (e) {
                    consecutiveErrors++;
                    // 遇到错误（如 429 限速）时退避，最多 10 秒
                    interval = Math.min(2000 * consecutiveErrors, 10000);
                }
                // 安排下一次查询
                rechargePollingTimer = setTimeout(tick, interval);
            };

            // 启动首次查询
            rechargePollingTimer = setTimeout(tick, interval);
        };

        const stopPolling = () => {
            if (rechargePollingTimer) {
                clearTimeout(rechargePollingTimer);
                rechargePollingTimer = null;
            }
        };

        const closePendingModal = () => {
            const el = document.getElementById('rechargePendingModal');
            if (el) {
                const modal = bootstrap.Modal.getInstance(el);
                if (modal) modal.hide();
            }
        };

        const showRechargeResult = (type, amount) => {
            rechargeResultType.value = type;
            if (type === 'success') {
                rechargeResultTitle.value = '充值成功';
                // 金额格式化：兼容 string/number，统一输出两位小数
                var num = parseFloat(amount);
                rechargeResultAmount.value = isNaN(num) ? '--' : num.toFixed(2);
            } else if (type === 'fail') {
                rechargeResultTitle.value = '充值失败';
                rechargeResultAmount.value = '';
            } else if (type === 'cancel') {
                rechargeResultTitle.value = '支付已取消';
                rechargeResultAmount.value = '';
            } else if (type === 'timeout') {
                rechargeResultTitle.value = '支付超时';
                rechargeResultAmount.value = '';
            }
            const el = document.getElementById('rechargeResultModal');
            if (el) {
                const modal = bootstrap.Modal.getOrCreateInstance(el);
                modal.show();
            }
        };

        const cancelRecharge = () => {
            stopPolling();
            // 清除二维码容器
            var qrContainer = document.getElementById('rechargeQrContainer');
            if (qrContainer) qrContainer.innerHTML = '';
            closePendingModal();
            showRechargeResult('cancel', '');
        };

        // 手机端点击跳转到支付宝/微信 app
        const openMobilePay = () => {
            if (!rechargePayUrl.value) return;
            let url = rechargePayUrl.value;
            // 支付宝手机端：若返回的是 http/https 网页 URL（中转页），
            // 包装成 alipays scheme 用内部浏览器容器打开（saId=10000067），
            // saId=10000007 是扫一扫，会导致打开扫码界面而非支付界面
            if (rechargeMethod.value === 'alipay' && /^https?:\/\//i.test(url)) {
                url = 'alipays://platformapi/startapp?saId=10000067&url=' + encodeURIComponent(url);
            }
            window.location.href = url;
        };

        // 手动检查支付状态（用户点击"我已完成支付"按钮）
        const checkPayStatus = async () => {
            if (!rechargePendingOrderNo.value) return;
            try {
                const status = await api('/wallet/order-status/' + rechargePendingOrderNo.value);
                if (status.status === 'paid') {
                    stopPolling();
                    closePendingModal();
                    showRechargeResult('success', status.amount || rechargePendingAmount.value);
                    loadWalletBalance();
                    rechargeAmount.value = '';
                    rechargeMethod.value = '';
                } else {
                    // 未支付，提示用户
                    rechargeError.value = '暂未检测到支付成功，请确认支付完成后重试';
                    setTimeout(() => { rechargeError.value = ''; }, 3000);
                }
            } catch (e) {
                rechargeError.value = '查询失败，请稍后重试';
                setTimeout(() => { rechargeError.value = ''; }, 3000);
            }
        };

        // 手机端从支付 app 切回浏览器时，自动检测支付完成
        const handleVisibilityChange = async () => {
            if (document.visibilityState === 'visible' && rechargePollingTimer && rechargePendingOrderNo.value) {
                try {
                    const status = await api('/wallet/order-status/' + rechargePendingOrderNo.value);
                    if (status.status === 'paid') {
                        stopPolling();
                        closePendingModal();
                        showRechargeResult('success', status.amount || rechargePendingAmount.value);
                        loadWalletBalance();
                        rechargeAmount.value = '';
                        rechargeMethod.value = '';
                    }
                } catch (e) {
                    // 忽略错误，轮询会继续
                }
            }
        };

        const closeRechargeResult = () => {
            const el = document.getElementById('rechargeResultModal');
            if (el) {
                const modal = bootstrap.Modal.getInstance(el);
                if (modal) {
                    // 等 Bootstrap 关闭动画完成后再清空状态，避免动画过程中
                    // rechargeResultType 变空导致图标切到 v-else 的红色 X（看起来像失败弹窗一闪而过）
                    el.addEventListener('hidden.bs.modal', () => {
                        rechargeResultType.value = '';
                        rechargeResultTitle.value = '';
                        rechargeResultAmount.value = '';
                    }, { once: true });
                    modal.hide();
                } else {
                    rechargeResultType.value = '';
                    rechargeResultTitle.value = '';
                    rechargeResultAmount.value = '';
                }
            } else {
                rechargeResultType.value = '';
                rechargeResultTitle.value = '';
                rechargeResultAmount.value = '';
            }
        };

        const loadTx = async (page) => {
            txPage.value = page || 1;
            try {
                const params = { page: txPage.value, limit: 10 };
                const f = txFilter.value;
                if (f.start_time) params.start_time = f.start_time;
                if (f.end_time) params.end_time = f.end_time;
                if (f.trade_type) params.trade_type = f.trade_type;
                if (f.order_no) params.order_no = f.order_no;
                const res = await api('/wallet/transactions?' + new URLSearchParams(params));
                txList.value = res.data || [];
                txTotal.value = res.total || 0;
            } catch (e) { console.error('加载交易明细失败', e); }
        };

        const copyOrderNo = (orderNo) => {
            if (navigator.clipboard) { navigator.clipboard.writeText(orderNo).then(() => alert('订单号已复制')); }
            else { const el = document.createElement('textarea'); el.value = orderNo; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); alert('订单号已复制'); }
        };

        const loadMyOrders = async () => {
            try { myOrders.value = await api('/orders'); } catch (e) { console.error('加载订单失败', e); }
        };

        // 初始化加载钱包数据
        loadWalletBalance();
        loadPayMethods();

        const handleReturnPayment = async () => {
            var qs = window.location.search;
            if (!qs || qs.indexOf('trade_status=TRADE_SUCCESS') === -1) return;
            try {
                var res = await api('/wallet/return' + qs);
                if (res.success) {
                    window.history.replaceState({}, '', window.location.pathname + (activeSubTab.value !== 'settings' ? '#' + activeSubTab.value : ''));
                    loadWalletBalance();
                    // 显示充值成功弹窗
                    showRechargeResult('success', res.amount || '');
                }
            } catch (e) {
                console.error('同步回调处理失败', e);
            }
        };

        const confirmOk = () => {
            const resolve = customConfirmResolve.value;
            if (resolve) {
                customConfirmResolve.value = null;
                resolve(true);
            }
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
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
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            const el = document.getElementById('customConfirmModal');
            if (el) {
                const modal = bootstrap.Modal.getInstance(el);
                if (modal) modal.hide();
            }
        };

        const bsModalShow = (id) => {
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            const el = document.getElementById(id);
            if (!el) return;
            const old = bootstrap.Modal.getInstance(el);
            if (old) old.dispose();
            // 获取动态 z-index
            const zIndex = window.ModalZIndexManager.acquire();
            el._modalZIndex = zIndex;
            el.style.zIndex = zIndex;
            window.Vue.nextTick(() => {
                const modal = new bootstrap.Modal(el, { focus: false });
                modal.show();
                // shown 后设置 backdrop z-index
                el.addEventListener('shown.bs.modal', function onShown() {
                    el.removeEventListener('shown.bs.modal', onShown);
                    const backdrop = document.querySelector('.modal-backdrop');
                    if (backdrop) {
                        backdrop.style.zIndex = window.ModalZIndexManager.acquireBackdrop(zIndex);
                    }
                });
            });
        };
        const bsModalHide = (id) => {
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            const el = document.getElementById(id);
            if (el) {
                const modal = bootstrap.Modal.getInstance(el);
                const zIndex = el._modalZIndex;
                if (modal) {
                    el.addEventListener('hidden.bs.modal', function cleanup() {
                        el.removeEventListener('hidden.bs.modal', cleanup);
                        if (zIndex != null) {
                            window.ModalZIndexManager.release(zIndex);
                            el._modalZIndex = null;
                            el.style.zIndex = '';
                        }
                    }, { once: true });
                    modal.hide();
                } else if (zIndex != null) {
                    window.ModalZIndexManager.release(zIndex);
                    el._modalZIndex = null;
                    el.style.zIndex = '';
                }
            }
        };
        // 统一子Tab切换方法（侧边栏导航调用）
        const switchSubTab = async (tab) => {
            activeSubTab.value = tab;
            // 根据tab懒加载数据
            if (tab === 'memos') await loadMemos();
            if (tab === 'messages') await loadMessages();
            if (tab === 'security') { await loadDevices(); await loadTwofaStatus(); }
            // settings 数据在 onMounted 时已通过 loadProfile 加载
            // 移动端自动收起侧边栏
            if (window.innerWidth <= 768) {
                var sb = document.getElementById('sidebar');
                var ol = document.getElementById('sidebarOverlay');
                if (sb) sb.classList.remove('open');
                if (ol) ol.style.display = 'none';
            }
        };

        const loadProfile = async () => {
            try {
                const profile = await api('/user/profile');
                profileForm.value = {
                    username: profile.username,
                    password: '',
                    bio: profile.bio || '',
                    avatar: profile.avatar || '',
                    email: profile.email || '',
                    emailVerified: profile.emailVerified || false
                };
                if (user.value) {
                    user.value = { ...user.value, ...profile };
                }
            } catch (e) {
                console.error('加载用户资料失败', e);
            }
        };

        const handleEmailVerification = () => {
            var params = new URLSearchParams(window.location.search);
            var verified = params.get('email_verified');
            if (verified === '1') {
                setTimeout(function() { alert('邮箱验证成功！'); }, 500);
                var url = new URL(window.location);
                url.searchParams.delete('email_verified');
                url.searchParams.delete('reason');
                window.history.replaceState({}, '', url.toString());
            } else if (verified === '0') {
                var reason = params.get('reason');
                var msg = '邮箱验证失败';
                if (reason === 'expired') msg = '验证链接已过期，请重新发送验证邮件';
                else if (reason === 'user_not_found') msg = '用户不存在';
                else if (reason === 'error') msg = '验证过程出错，请重试';
                setTimeout(function() { alert(msg); }, 500);
                var url = new URL(window.location);
                url.searchParams.delete('email_verified');
                url.searchParams.delete('reason');
                window.history.replaceState({}, '', url.toString());
            }
        };

        const loadMemos = async () => {
            memosLoading.value = true;
            try {
                memos.value = await api('/user/memos');
            } catch (e) {
                console.error('加载备忘录失败', e);
            } finally {
                memosLoading.value = false;
            }
        };

        const updateProfile = async () => {
            try {
                const data = {
                    username: profileForm.value.username,
                    bio: profileForm.value.bio
                };
                if (profileForm.value.password) {
                    data.password = profileForm.value.password;
                }
                const result = await api('/user/profile', {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                user.value = result.user;
                alert('资料更新成功！');
            } catch (e) {
                alert(e.message);
            }
        };

        const handleAvatarUpload = async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    alert('头像文件大小不能超过2MB');
                    e.target.value = '';
                    return;
                }
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    alert('仅支持 JPG 和 PNG 格式');
                    e.target.value = '';
                    return;
                }
                try {
                    const formData = new FormData();
                    formData.append('avatar', file);
                    const token = localStorage.getItem('token');
                    const response = await fetch('/api/user/avatar', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token}`
                        },
                        body: formData
                    });
                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || '上传失败');
                    }
                    const data = await response.json();
                    profileForm.value.avatar = data.avatar;
                    if (user.value) {
                        user.value.avatar = data.avatar;
                    }
                    alert('头像上传成功！');
                } catch (e) {
                    alert(e.message);
                }
            }
        };

        const bindEmail = async () => {
            try {
                const result = await api('/user/email', {
                    method: 'PUT',
                    body: JSON.stringify({ email: profileForm.value.email })
                });
                profileForm.value.emailVerified = false;
                user.value.email = result.user.email;
                user.value.emailVerified = false;
                alert(result.message);
            } catch (e) {
                alert(e.message);
            }
        };

        const resendVerification = async () => {
            try {
                const result = await api('/user/email', {
                    method: 'PUT',
                    body: JSON.stringify({ email: profileForm.value.email })
                });
                alert(result.message);
            } catch (e) {
                alert(e.message);
            }
        };

        const addMemo = () => {
            editMemoForm.value = { id: null, title: '', content: '' };
            bsModalShow('memoModal');
        };

        const editMemo = (memo) => {
            editMemoForm.value = { id: memo.id, title: memo.title, content: memo.content };
            bsModalShow('memoModal');
        };

        const saveMemo = async () => {
            try {
                if (editMemoForm.value.id) {
                    await api(`/user/memos/${editMemoForm.value.id}`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            title: editMemoForm.value.title,
                            content: editMemoForm.value.content
                        })
                    });
                } else {
                    await api('/user/memos', {
                        method: 'POST',
                        body: JSON.stringify({
                            title: editMemoForm.value.title,
                            content: editMemoForm.value.content
                        })
                    });
                }
                bsModalHide('memoModal');
                await loadMemos();
            } catch (e) {
                alert(e.message);
            }
        };

        const deleteMemo = async (id) => {
            if (!await window.customConfirm('确定删除此备忘录？')) return;
            try {
                await api(`/user/memos/${id}`, { method: 'DELETE' });
                await loadMemos();
            } catch (e) {
                alert(e.message);
            }
        };

        const loadMessages = async () => {
            messagesLoading.value = true;
            try {
                const data = await api('/messages?type=' + msgType.value);
                messages.value = data.list || [];
            } catch (e) {
                console.error('加载消息失败', e);
            } finally {
                messagesLoading.value = false;
            }
        };

        const viewMessage = async (msg) => {
            try {
                const detail = await api('/messages/' + msg.id);
                currentMsg.value = detail;
                if (!msg.is_read) {
                    msg.is_read = 1;
                    loadUnreadCount();
                }
                bsModalShow('messageDetailModal');
            } catch (e) {
                alert('获取消息详情失败');
            }
        };

        const markAllRead = async () => {
            try {
                await api('/messages/read-all', { method: 'PUT' });
                messages.value.forEach(m => m.is_read = 1);
                unreadCount.value = 0;
            } catch (e) {
                alert(e.message);
            }
        };

        const deleteMessage = async (id) => {
            if (!await window.customConfirm('确定删除此消息？')) return;
            try {
                await api('/messages/' + id, { method: 'DELETE' });
                messages.value = messages.value.filter(m => m.id !== id);
                bsModalHide('messageDetailModal');
                loadUnreadCount();
            } catch (e) {
                alert(e.message);
            }
        };

        const clearAllMessages = async () => {
            if (!await window.customConfirm('确定清空所有已读消息？未读消息将保留。')) return;
            try {
                await api('/messages', { method: 'DELETE' });
                messages.value = messages.value.filter(m => !m.is_read);
                loadUnreadCount();
            } catch (e) {
                alert(e.message);
            }
        };

        const trimContent = (content) => {
            if (!content) return '';
            const text = content.replace(/<[^>]*>/g, '');
            return text.length > 100 ? text.substring(0, 100) + '...' : text;
        };

        const loadUnreadCount = async () => {
            try {
                const data = await api('/messages/unread-count');
                unreadCount.value = data.count;
            } catch (e) {}
        };

        const loadDevices = async () => {
            devicesLoading.value = true;
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                const data = await api('/user/devices');
                devices.value = data;
                if (refreshToken) {
                    const current = data.find(d => d.token === refreshToken);
                    if (current) currentDeviceId.value = current.id;
                }
            } catch (e) {
            } finally {
                devicesLoading.value = false;
            }
        };

        const revokeDevice = async (id) => {
            if (await window.customConfirm('确定要将该设备下线吗？')) {
                try {
                    await api(`/user/devices/${id}`, { method: 'DELETE' });
                    devices.value = devices.value.filter(d => d.id !== id);
                    alert('设备已下线');
                } catch (e) {
                    alert(e.message);
                }
            }
        };

        const revokeOtherDevices = async () => {
            if (await window.customConfirm('确定要下线除当前设备外的所有设备吗？')) {
                try {
                    const refreshToken = localStorage.getItem('refreshToken');
                    await api('/user/devices', {
                        method: 'DELETE',
                        body: JSON.stringify({ refreshToken })
                    });
                    devices.value = devices.value.filter(d => d.id === currentDeviceId.value);
                    alert('其他设备已下线');
                } catch (e) {
                    alert(e.message);
                }
            }
        };

        const loadTwofaStatus = async () => {
            try {
                const data = await api('/user/2fa/status');
                twofaEnabled.value = data.enabled;
                twofaRecoveryCount.value = data.recovery_count || 0;
            } catch (e) {
                twofaEnabled.value = false;
                twofaRecoveryCount.value = 0;
            }
        };

        const openTwofaSetup = async () => {
            try {
                const data = await api('/user/2fa/setup', { method: 'POST' });
                twofaSecret.value = data.secret;
                twofaQrcode.value = data.qrcode;
                twofaSetupCode.value = '';
                await Vue.nextTick();
                await new Promise(r => setTimeout(r, 100));
                bsModalShow('twofaSetupModal');
            } catch (e) {
                alert(e.message);
            }
        };

        const verifyTwofaSetup = async () => {
            try {
                const data = await api('/user/2fa/verify', {
                    method: 'POST',
                    body: JSON.stringify({ code: twofaSetupCode.value })
                });
                bsModalHide('twofaSetupModal');
                twofaEnabled.value = true;
                twofaRecoveryCodes.value = (data.recovery_codes || []).map((code, i) => ({ id: i + 1, code, used: 0, created_at: new Date().toISOString() }));
                twofaRecoveryCount.value = twofaRecoveryCodes.value.length;
                setTimeout(() => bsModalShow('twofaRecoveryModal'), 300);
            } catch (e) {
                alert(e.message);
            }
        };

        const loadTwofaRecoveryCodes = async () => {
            try {
                const data = await api('/user/2fa/recovery-codes');
                twofaRecoveryCodes.value = data.codes || [];
            } catch (e) {
                alert(e.message);
            }
        };

        const showRecoveryCodes = async () => {
            await loadTwofaRecoveryCodes();
            bsModalShow('twofaRecoveryModal');
        };

        const copyRecoveryCodes = async () => {
            const codes = twofaRecoveryCodes.value.filter(rc => !rc.used).map(rc => rc.code);
            if (codes.length === 0) { alert('没有未使用的恢复码'); return; }
            const text = codes.join('\n');
            bsModalHide('twofaRecoveryModal');
            await new Promise(r => setTimeout(r, 300));
            try {
                await navigator.clipboard.writeText(text);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = text;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            const el = document.getElementById('customAlertModal');
            if (el) {
                el.addEventListener('hidden.bs.modal', function onHidden() {
                    el.removeEventListener('hidden.bs.modal', onHidden);
                    bsModalShow('twofaRecoveryModal');
                }, { once: true });
            }
            customAlertMessage.value = '未使用的恢复码已复制到剪贴板';
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            var oldModal = bootstrap.Modal.getInstance(el);
            if (oldModal) oldModal.dispose();
            new bootstrap.Modal(el, { focus: false }).show();
        };

        const copySingleCode = async (code) => {
            bsModalHide('twofaRecoveryModal');
            await new Promise(r => setTimeout(r, 300));
            try {
                await navigator.clipboard.writeText(code);
            } catch {
                const ta = document.createElement('textarea');
                ta.value = code;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            const el = document.getElementById('customAlertModal');
            if (el) {
                el.addEventListener('hidden.bs.modal', function onHidden() {
                    el.removeEventListener('hidden.bs.modal', onHidden);
                    bsModalShow('twofaRecoveryModal');
                }, { once: true });
            }
            customAlertMessage.value = '恢复码已复制';
            document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
            document.body.classList.remove('modal-open');
            document.body.style.removeProperty('padding-right');
            var oldModal = bootstrap.Modal.getInstance(el);
            if (oldModal) oldModal.dispose();
            new bootstrap.Modal(el, { focus: false }).show();
        };

        const downloadRecoveryCodes = () => {
            const text = twofaRecoveryCodes.value.map(rc => (rc.used ? '[已使用] ' : '') + rc.code).join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
        };

        const regenerateRecoveryCodes = async () => {
            bsModalHide('twofaRecoveryModal');
            await new Promise(r => setTimeout(r, 300));
            if (!await window.customConfirm('确定要重新生成恢复码吗？当前的恢复码将全部作废。')) {
                bsModalShow('twofaRecoveryModal');
                return;
            }
            try {
                const data = await api('/user/2fa/recovery-codes/regenerate', { method: 'POST' });
                twofaRecoveryCodes.value = (data.recovery_codes || []).map((code, i) => ({ id: i + 1, code, used: 0, created_at: new Date().toISOString() }));
                twofaRecoveryCount.value = twofaRecoveryCodes.value.length;
                const el = document.getElementById('customAlertModal');
                if (el) {
                    el.addEventListener('hidden.bs.modal', function onHidden() {
                        el.removeEventListener('hidden.bs.modal', onHidden);
                        bsModalShow('twofaRecoveryModal');
                    }, { once: true });
                }
                customAlertMessage.value = '恢复码已重新生成';
                document.querySelectorAll('.modal-backdrop').forEach(b => b.remove());
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('padding-right');
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                new bootstrap.Modal(el, { focus: false }).show();
            } catch (e) {
                bsModalShow('twofaRecoveryModal');
                await new Promise(r => setTimeout(r, 300));
                alert('重新生成恢复码失败：' + e.message);
            }
        };

        const openDisableTwofa = () => {
            twofaDisablePassword.value = '';
            bsModalShow('twofaDisableModal');
        };

        const disableTwofa = async () => {
            try {
                await api('/user/2fa/disable', {
                    method: 'POST',
                    body: JSON.stringify({ password: twofaDisablePassword.value })
                });
                bsModalHide('twofaDisableModal');
                twofaEnabled.value = false;
                twofaRecoveryCount.value = 0;
                twofaDisablePassword.value = '';
                alert('二次验证已禁用');
            } catch (e) {
                alert(e.message);
            }
        };

        const loadNavItems = async () => {
            try {
                const res = await api('/user/nav');
                navItems.value = res.items || [];
            } catch (e) {
                navItems.value = [];
            }
        };

        // 同步 header 用户信息 + 管理员返回按钮
        const syncHeaderUser = () => {
            const avatarEl = document.getElementById('headerAvatar');
            const usernameEl = document.getElementById('headerUsername');
            const adminLink = document.getElementById('adminBackLink');
            if (user.value && avatarEl && usernameEl) {
                usernameEl.textContent = user.value.username;
                if (user.value.avatar) {
                    avatarEl.src = user.value.avatar;
                } else {
                    avatarEl.src = getGeekAvatar(user.value.username);
                }
                // 管理员显示侧边栏"管理后台"按钮
                if (adminLink) {
                    adminLink.style.display = user.value.role === 'admin' ? '' : 'none';
                }
            }
        };

        onMounted(async () => {
            // 手机端从支付 app 切回时自动检测支付完成
            document.addEventListener('visibilitychange', handleVisibilityChange);
            const userData = await authGuard();
            if (userData) {
                user.value = userData;
                syncHeaderUser();
                await handleReturnPayment();
                await loadNavItems();
                await loadProfile();
                handleEmailVerification();
                if (window.location.hash === '#messages' || activeSubTab.value === 'messages') {
                    activeSubTab.value = 'messages';
                    await loadMessages();
                } else if (activeSubTab.value === 'security') {
                    await loadDevices();
                    await loadTwofaStatus();
                } else if (activeSubTab.value === 'wallet-transactions') {
                    await loadTx(1);
                } else {
                    await loadMemos();
                }
                await loadUnreadCount();
                initPushClient(function(msg) {
                    if (msg.type === 'unread') {
                        unreadCount.value = msg.count;
                    }
                });
            }
        });

        onUnmounted(() => {
        });

        onBeforeUnmount(() => {
            stopPolling();
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        });

        watch(activeSubTab, (val) => {
            localStorage.setItem('ucenter_subtab', val);
            if (val === 'wallet-transactions') loadTx(1);
        });

        // 监听 user 变化同步 header
        watch(user, () => {
            syncHeaderUser();
        }, { deep: true });

        return {
            user,
            activeSubTab,
            navItems,
            currentNavId,
            switchSubTab,
            profileForm,
            memos,
            memosLoading,
            editMemoForm,
            unreadCount,
            messages,
            messagesLoading,
            msgType,
            currentMsg,
            parseMarkdown,
            customAlertMessage,
            customConfirmMessage,
            getGeekAvatar,
            formatDate,
            logout,
            loadProfile,
            loadMemos,
            updateProfile,
            handleAvatarUpload,
            bindEmail,
            resendVerification,
            addMemo,
            editMemo,
            saveMemo,
            deleteMemo,
            loadUnreadCount,
            loadMessages,
            viewMessage,
            markAllRead,
            deleteMessage,
            clearAllMessages,
            trimContent,
            confirmOk,
            confirmCancel,
            devices,
            devicesLoading,
            currentDeviceId,
            loadDevices,
            revokeDevice,
            revokeOtherDevices,
            twofaEnabled,
            twofaRecoveryCount,
            twofaSecret,
            twofaQrcode,
            twofaSetupCode,
            twofaDisablePassword,
            twofaRecoveryCodes,
            loadTwofaStatus,
            openTwofaSetup,
            verifyTwofaSetup,
            loadTwofaRecoveryCodes,
            showRecoveryCodes,
            copyRecoveryCodes,
            copySingleCode,
            downloadRecoveryCodes,
            regenerateRecoveryCodes,
            openDisableTwofa,
            disableTwofa,
            walletBalance, payMethods, rechargeAmount, rechargeMethod, rechargeSubmitting, rechargeError,
            txList, txTotal, txPage, txFilter, myOrders,
            submitRecharge, loadTx, copyOrderNo, loadMyOrders,
            rechargePendingOrderNo, rechargePendingAmount, rechargeResultType, rechargeResultTitle, rechargeResultAmount,
            rechargeQrLoading, rechargePayUrl, rechargeIsMobile,
            pollOrderStatus, cancelRecharge, closeRechargeResult, openMobilePay, checkPayStatus
        };
    }
};

var app = createApp(App);
app.mount('#app');

/* ===== Sidebar Toggle & Theme Switch ===== */
function toggleSidebar() {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar && overlay) {
        sidebar.classList.toggle('open');
        overlay.classList.toggle('show');
    }
}

// Theme toggle — 统一使用 theme-init.js
if (window.initThemeToggle) window.initThemeToggle();

/* ===== Sidebar nav auto-close on mobile (与dashboard统一: 768px阈值) ===== */
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('.sidebar .nav-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
            if (window.innerWidth <= 768) {
                var sb = document.getElementById('sidebar');
                var ol = document.getElementById('sidebarOverlay');
                if (sb) sb.classList.remove('open');
                if (ol) ol.style.display = 'none';
                // 如果是<a>标签且有href，延迟导航确保先关闭
                if (item.tagName === 'A' && item.href && item.href !== window.location.href) {
                    e.preventDefault();
                    setTimeout(function() { window.location.href = item.href; }, 300);
                }
            }
        });
    });
});