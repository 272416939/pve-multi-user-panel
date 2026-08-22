const { createApp, ref, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } = Vue;

const App = {
    template: '#appTemplate',
    setup() {
        // 模板 v-html 净化依赖（user-center-template.js 通知分组图标直接引用 DOMPurify，
        // Vue 模板表达式不查全局变量，必须在 setup 暴露，否则渲染报 reading 'sanitize'）
        const DOMPurify = window.DOMPurify;
        const user = ref(null);
        const activeSubTab = ref(window.location.hash ? window.location.hash.slice(1) : 'settings');
        const navItems = ref([]);
        const currentNavId = ref('user-center');

        const profileForm = ref({ username: '', password: '', confirmPassword: '', currentPassword: '', emailPassword: '', bio: '', avatar: '', email: '', emailVerified: false });
        // 界面模板个人偏好（'' = 跟随站点默认，'default' / 'saas' = 个人固定）
        const templatePreference = ref('');
        const templatePreferenceSaving = ref(false);
        // 站点全局默认模板（跟随站点默认卡需要）
        const siteDefault = ref('default');
        const siteDefaultName = ref(window.__i18n.t('settings.template.default'));
        // 语言偏好（'' = 跟随站点默认）
        const langPreference = ref('');
        const langPreferenceSaving = ref(false);
        const siteDefaultLang = ref('zh-CN');
        const siteDefaultLangName = ref(window.__i18n.t('lang.zh-CN'));
        const memos = ref([]);
        const memosLoading = ref(false);
        const editMemoForm = ref({ id: null, title: '', content: '' });
        const unreadCount = ref(0);
        const messages = ref([]);
        const messagesLoading = ref(false);
        const msgType = ref('all');
        const msgTotal = ref(0);
        const msgPage = ref(1);
        const msgPageSize = ref(20);
        let msgLoadSeq = 0;
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
        const txPageSize = ref(20);
        const txFilter = ref({ start_time: '', end_time: '', trade_type: '', order_no: '' });
        const myOrders = ref([]);
        const orderPage = ref(1);
        const orderPageSize = ref(20);
        const orderTotal = ref(0);
        const orderFilter = ref({ order_no: '', type: '', status: '' });

        // 充值轮询相关
        const rechargePendingOrderNo = ref('');
        const rechargePendingAmount = ref('');

        // pending order 持久化：手机端支付完成后页面可能被支付宝/浏览器重建，
        // 通过 localStorage 在页面加载时恢复轮询，确保支付成功后能看到弹窗+余额更新
        const PENDING_KEY = window.__storageKeys.RECHARGE_PENDING;
        const savePending = (orderNo, amount, method) => {
            try {
                localStorage.setItem(PENDING_KEY, JSON.stringify({ orderNo, amount, method, ts: Date.now() }));
            } catch (e) {}
        };
        const loadPending = () => {
            try {
                const raw = localStorage.getItem(PENDING_KEY);
                if (!raw) return null;
                const data = JSON.parse(raw);
                // 超过 15 分钟视为过期，避免残留；同时校验字段类型，防止 localStorage 被篡改注入非法结构
                if (!data || typeof data.orderNo !== 'string' || typeof data.ts !== 'number' || Date.now() - (data.ts || 0) > 15 * 60 * 1000) {
                    localStorage.removeItem(PENDING_KEY);
                    return null;
                }
                return data;
            } catch (e) { return null; }
        };
        const clearPending = () => {
            try { localStorage.removeItem(PENDING_KEY); } catch (e) {}
        };
        const rechargeResultType = ref(''); // success / fail / cancel / timeout
        const rechargeResultTitle = ref('');
        const rechargeResultAmount = ref('');
        const rechargeQrLoading = ref(false);    // PC 端二维码生成中
        const rechargePayUrl = ref('');          // 支付链接（手机端跳转用）
        const rechargeIsMobile = ref(false);     // 是否手机端
        let rechargePollingTimer = null;

        // ===== 通知设置相关 =====
        const notifSettings = ref({
            email_notifications_enabled: 1,
            notify_vm_provisioned: 1,
            notify_lxc_provisioned: 1,
            notify_account_password: 1,
            notify_subnet_provisioned: 1,
            notify_vm_refund: 1,
            notify_lxc_refund: 1,
            notify_disk_purchase: 1,
            notify_disk_resize: 1,
            notify_disk_renewal: 1,
            notify_disk_refund: 1,
            notify_disk_destroy_refund: 1,
            notify_recharge: 1,
            notify_renewal: 1,
            notify_expiry_reminder: 1,
            notify_expiry_alert: 1,
            notify_backup_result: 1
        });
        const notifGroups = ref([
            {
                key: 'provision',
                labelKey: 'user.notif.group.provision',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h20v11H2z"/><polyline points="12 17 12 20"/><line x1="8" y1="20" x2="16" y2="20"/><line x1="7" y1="8" x2="17" y2="8"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_vm_provisioned', labelKey: 'user.notif.item.notify_vm_provisioned' },
                    { key: 'notify_lxc_provisioned', labelKey: 'user.notif.item.notify_lxc_provisioned' },
                    { key: 'notify_account_password', labelKey: 'user.notif.item.notify_account_password' },
                    { key: 'notify_subnet_provisioned', labelKey: 'user.notif.item.notify_subnet_provisioned' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            },
            {
                key: 'refund',
                labelKey: 'user.notif.group.refund',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_vm_refund', labelKey: 'user.notif.item.notify_vm_refund' },
                    { key: 'notify_lxc_refund', labelKey: 'user.notif.item.notify_lxc_refund' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            },
            {
                key: 'disk',
                labelKey: 'user.notif.group.disk',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><path d="M4 6h16a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z"/><circle cx="7" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r="1" fill="currentColor" stroke="none"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_disk_purchase', labelKey: 'user.notif.item.notify_disk_purchase' },
                    { key: 'notify_disk_resize', labelKey: 'user.notif.item.notify_disk_resize' },
                    { key: 'notify_disk_renewal', labelKey: 'user.notif.item.notify_disk_renewal' },
                    { key: 'notify_disk_refund', labelKey: 'user.notif.item.notify_disk_refund' },
                    { key: 'notify_disk_destroy_refund', labelKey: 'user.notif.item.notify_disk_destroy_refund' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            },
            {
                key: 'wallet',
                labelKey: 'user.notif.group.wallet',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="6" y1="15" x2="10" y2="15"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_recharge', labelKey: 'user.notif.item.notify_recharge' },
                    { key: 'notify_renewal', labelKey: 'user.notif.item.notify_renewal' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            },
            {
                key: 'expiry',
                labelKey: 'user.notif.group.expiry',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_expiry_reminder', labelKey: 'user.notif.item.notify_expiry_reminder' },
                    { key: 'notify_expiry_alert', labelKey: 'user.notif.item.notify_expiry_alert' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            },
            {
                key: 'backup',
                labelKey: 'user.notif.group.backup',
                svg: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
                expanded: false,
                items: [
                    { key: 'notify_backup_result', labelKey: 'user.notif.item.notify_backup_result' }
                ],
                get enabledCount() { return this.items.filter(i => notifSettings.value[i.key]).length; }
            }
        ]);

        const loadNotifSettings = async () => {
            try {
                const data = await api('/user/notification-settings');
                if (data) {
                    for (const key of Object.keys(notifSettings.value)) {
                        if (data[key] !== undefined) {
                            notifSettings.value[key] = data[key];
                        }
                    }
                }
            } catch (e) {
                console.error('加载通知设置失败', e);
            }
        };

        const toggleNotifSetting = async (field, value) => {
            notifSettings.value[field] = value ? 1 : 0;
            try {
                await api('/user/notification-settings', {
                    method: 'PUT',
                    body: JSON.stringify({ [field]: value ? 1 : 0 })
                });
                // 找到对应的标签用于 toast 提示
                let labelKey = '';
                if (field === 'email_notifications_enabled') {
                    labelKey = 'user.notif.masterLabel';
                } else {
                    for (const group of notifGroups.value) {
                        const item = group.items.find(i => i.key === field);
                        if (item) { labelKey = item.labelKey; break; }
                    }
                }
                showToast(window.__i18n.tFormat('user.notif.toggleResult',
                    window.__i18n.t(labelKey),
                    value ? window.__i18n.t('user.notif.enabled') : window.__i18n.t('user.notif.disabled')), 'success');
            } catch (e) {
                // 回滚
                notifSettings.value[field] = value ? 0 : 1;
                showToast(window.__i18n.tFormat('user.notif.saveFailed', e.message), 'error');
            }
        };

        // Toast 提示
        const toastMessage = ref('');
        const toastType = ref('success');
        const showToast = (msg, type = 'success') => {
            toastMessage.value = msg;
            toastType.value = type;
            setTimeout(() => { toastMessage.value = ''; }, 2500);
        };

        const parseMarkdown = (text) => {
            if (!text) return '';
            try {
                return DOMPurify.sanitize(marked.parse(text));
            } catch {
                return DOMPurify.sanitize(String(text));
            }
        };

        const customAlertMessage = ref('');
        const customConfirmMessage = ref('');
        const customConfirmResolve = ref(null);
        // 弹窗逻辑统一由 shared.js 提供（规范第七节：单一来源），refs 就绪后立即接入
        setupCustomAlert(customAlertMessage);
        setupCustomConfirm(customConfirmMessage, customConfirmResolve);

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
                rechargeError.value = window.__i18n.t('user.recharge.inProgress');
                return;
            }
            const amount = parseFloat(rechargeAmount.value);
            if (isNaN(amount) || amount <= 0) { rechargeError.value = window.__i18n.t('user.recharge.invalidAmount'); return; }
            const min = parseFloat(payMethods.value.min_amount) || 0.01;
            if (amount < min) { rechargeError.value = window.__i18n.t('user.recharge.minAmount1') + min.toFixed(2) + window.__i18n.t('common.currencyUnit'); return; }
            if (!rechargeMethod.value) { rechargeError.value = window.__i18n.t('user.recharge.pickMethod'); return; }
            rechargeSubmitting.value = true;
            rechargeError.value = '';
            try {
                const res = await api('/wallet/recharge', { method: 'POST', body: { amount: amount.toFixed(2), pay_method: rechargeMethod.value } });
                if (res.success && res.redirect_url) {
                    const payUrl = res.redirect_url;
                    rechargePendingOrderNo.value = res.order_no;
                    rechargePendingAmount.value = amount.toFixed(2);
                    rechargePayUrl.value = payUrl;
                    // 持久化 pending order，手机端支付完成后页面被重建也能恢复轮询
                    savePending(res.order_no, amount.toFixed(2), rechargeMethod.value);
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
                            rechargeError.value = window.__i18n.t('user.recharge.qrLibFail');
                            rechargeSubmitting.value = false;
                            return;
                        }
                        rechargeQrLoading.value = true;
                    }
                    // 显示扫码支付弹窗
                    const modalEl = document.getElementById('rechargePendingModal');
                    if (modalEl) {
                        // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
                        window.applyModalZIndex(modalEl);
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
                                    rechargeError.value = window.__i18n.t('user.recharge.qrFailRetry');
                                    rechargeSubmitting.value = false;
                                }
                            }
                        });
                    }
                    // 启动轮询
                    pollOrderStatus(res.order_no, amount.toFixed(2));
                } else { rechargeError.value = res.error || window.__i18n.t('user.recharge.orderFail'); }
            } catch (e) { rechargeError.value = e.message || window.__i18n.t('shared.retryLater'); }
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
                    clearPending();
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
                        clearPending();
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
                rechargeResultTitle.value = window.__i18n.t('user.recharge.successTitle');
                // 金额格式化：兼容 string/number，统一输出两位小数
                var num = parseFloat(amount);
                rechargeResultAmount.value = isNaN(num) ? '--' : num.toFixed(2);
            } else if (type === 'fail') {
                rechargeResultTitle.value = window.__i18n.t('user.recharge.failed');
                rechargeResultAmount.value = '';
            } else if (type === 'cancel') {
                rechargeResultTitle.value = window.__i18n.t('user.recharge.cancelled');
                rechargeResultAmount.value = '';
            } else if (type === 'timeout') {
                rechargeResultTitle.value = window.__i18n.t('user.recharge.timeout');
                rechargeResultAmount.value = '';
            }
            const el = document.getElementById('rechargeResultModal');
            if (el) {
                // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
                window.applyModalZIndex(el);
                const modal = bootstrap.Modal.getOrCreateInstance(el);
                modal.show();
            }
        };

        const cancelRecharge = () => {
            stopPolling();
            clearPending();
            // 清除二维码容器
            var qrContainer = document.getElementById('rechargeQrContainer');
            if (qrContainer) qrContainer.innerHTML = '';
            closePendingModal();
            showRechargeResult('cancel', '');
        };

        // 手机端点击跳转到支付宝/微信 app
        const openMobilePay = () => {
            if (!rechargePayUrl.value) return;
            // scheme URL（alipays://、weixin://、alipay://）由系统直接唤起对应 app
            // https URL（z-pay 中转页）直接让浏览器打开，中转页会自动唤起支付宝/微信 app
            // 不再用 alipays://platformapi/startapp?saId=10000067&url=... 包装 https URL：
            //   支付宝内部浏览器容器对中转页跳转有限制，
            //   安卓 10.8.76+ 会提示"暂未找到此功能，请稍后再试"，
            //   鸿蒙因 H5 容器规则不同而正常
            window.location.href = rechargePayUrl.value;
        };

        // 手动检查支付状态（用户点击"我已完成支付"按钮）
        const checkPayStatus = async () => {
            if (!rechargePendingOrderNo.value) return;
            try {
                const status = await api('/wallet/order-status/' + rechargePendingOrderNo.value);
                if (status.status === 'paid') {
                    stopPolling();
                    closePendingModal();
                    clearPending();
                    showRechargeResult('success', status.amount || rechargePendingAmount.value);
                    loadWalletBalance();
                    rechargeAmount.value = '';
                    rechargeMethod.value = '';
                } else {
                    // 未支付，提示用户
                    rechargeError.value = window.__i18n.t('user.recharge.notDetected');
                    setTimeout(() => { rechargeError.value = ''; }, 3000);
                }
            } catch (e) {
                rechargeError.value = window.__i18n.t('user.recharge.queryFail');
                setTimeout(() => { rechargeError.value = ''; }, 3000);
            }
        };

        // 手机端从支付 app 切回浏览器时，自动检测支付完成
        // 不依赖 rechargePollingTimer：页面可能被支付宝/浏览器重建，timer 已丢失，
        // 但只要 localStorage 里有 pending order 就查询
        const handleVisibilityChange = async () => {
            if (document.visibilityState !== 'visible') return;
            // 优先用内存中的 pending order，其次从 localStorage 恢复
            let orderNo = rechargePendingOrderNo.value;
            if (!orderNo) {
                const p = loadPending();
                if (p) {
                    orderNo = p.orderNo;
                    rechargePendingOrderNo.value = p.orderNo;
                    rechargePendingAmount.value = p.amount;
                    rechargeMethod.value = p.method || '';
                }
            }
            if (!orderNo) {
                // 无 pending order，仅刷新余额（可能支付已完成但 pending 已清）
                loadWalletBalance();
                return;
            }
            try {
                const status = await api('/wallet/order-status/' + orderNo);
                if (status.status === 'paid') {
                    stopPolling();
                    closePendingModal();
                    clearPending();
                    showRechargeResult('success', status.amount || rechargePendingAmount.value);
                    loadWalletBalance();
                    rechargeAmount.value = '';
                    rechargeMethod.value = '';
                } else {
                    // 仍未支付，恢复轮询继续等待
                    if (!rechargePollingTimer) {
                        pollOrderStatus(orderNo, rechargePendingAmount.value);
                    }
                }
            } catch (e) {
                // 忽略错误，恢复轮询兜底
                if (!rechargePollingTimer) {
                    pollOrderStatus(orderNo, rechargePendingAmount.value);
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
                const params = { page: txPage.value, limit: txPageSize.value };
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
        // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
        const changeTxPageSize = (size) => {
            txPageSize.value = size || 20;
            loadTx(1);
        };

        const copyOrderNo = (orderNo) => {
            if (navigator.clipboard) { navigator.clipboard.writeText(orderNo).then(() => alert(window.__i18n.t('user.order.noCopied'))); }
            else { const el = document.createElement('textarea'); el.value = orderNo; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el); alert(window.__i18n.t('user.order.noCopied')); }
        };

        const loadMyOrders = async (page) => {
            orderPage.value = page || 1;
            try {
                const params = { page: orderPage.value, limit: orderPageSize.value };
                if (orderFilter.value.order_no) params.order_no = orderFilter.value.order_no;
                if (orderFilter.value.type) params.type = orderFilter.value.type;
                if (orderFilter.value.status) params.status = orderFilter.value.status;
                const res = await api('/orders?' + new URLSearchParams(params));
                if (Array.isArray(res)) {
                    myOrders.value = res;
                    orderTotal.value = res.length;
                } else {
                    myOrders.value = res.data || res.rows || [];
                    orderTotal.value = res.total || 0;
                }
            } catch (e) { console.error('加载订单失败', e); }
        };
        // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
        const changeOrderPageSize = (size) => {
            orderPageSize.value = size || 20;
            loadMyOrders(1);
        };

        // 初始化加载钱包数据
        loadWalletBalance();
        loadPayMethods();

        const handleReturnPayment = async () => {
            var qs = window.location.search;
            if (!qs) return;
            // 放宽条件：z-pay 手机端支付宝 H5 跳回时 URL 可能不带 trade_status=TRADE_SUCCESS，
            // 只要带 out_trade_no 就查询订单实际状态（后端 /wallet/order-status 不泄露订单是否存在）
            var params = new URLSearchParams(qs);
            var outTradeNo = params.get('out_trade_no');
            if (!outTradeNo) return;
            try {
                // 优先用同步回调接口（带验签+入账兜底），失败则降级到订单状态查询
                var res;
                try {
                    res = await api('/wallet/return' + qs);
                } catch (e) {
                    // /wallet/return 验签失败或订单已处理时可能报错，降级查询
                    res = null;
                }
                // 清理 URL 参数，防止刷新重复触发
                window.history.replaceState({}, '', window.location.pathname + (activeSubTab.value !== 'settings' ? '#' + activeSubTab.value : ''));
                if (res && res.success) {
                    clearPending();
                    stopPolling();
                    closePendingModal();
                    loadWalletBalance();
                    showRechargeResult('success', res.amount || '');
                    return;
                }
                // 同步回调未成功入账，查询订单实际状态
                const status = await api('/wallet/order-status/' + outTradeNo);
                if (status.status === 'paid') {
                    clearPending();
                    stopPolling();
                    closePendingModal();
                    loadWalletBalance();
                    showRechargeResult('success', status.amount || '');
                } else {
                    // 仍未支付，恢复 pending 状态并启动轮询
                    rechargePendingOrderNo.value = outTradeNo;
                    rechargePendingAmount.value = params.get('money') || '';
                    rechargeMethod.value = params.get('type') || '';
                    savePending(outTradeNo, rechargePendingAmount.value, rechargeMethod.value);
                    if (!rechargePollingTimer) {
                        pollOrderStatus(outTradeNo, rechargePendingAmount.value);
                    }
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
            // 注意：不得删除所有 .modal-backdrop，否则会破坏其他仍开着弹窗的遮罩层
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
                // 多弹窗叠加时，querySelectorAll 取最后一个（当前弹窗的 backdrop）
                el.addEventListener('shown.bs.modal', function onShown() {
                    el.removeEventListener('shown.bs.modal', onShown);
                    const backdrops = document.querySelectorAll('.modal-backdrop');
                    const backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
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
                        // 仅当没有其他活跃弹窗时才清理 body 状态，防止残留 modal-open 导致底层 modal 卡死
                        if (window.ModalZIndexManager && window.ModalZIndexManager.getActiveCount() === 0) {
                            document.body.classList.remove('modal-open');
                            document.body.style.removeProperty('padding-right');
                            document.body.style.removeProperty('overflow');
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
            if (tab === 'notifications') await loadNotifSettings();
            if (tab === 'security') { await loadDevices(); await loadTwofaStatus(); }
            // 钱包/订单数据在切换 tab 时重新拉取（watch 也会触发，这里显式调用避免竞态）
            if (tab === 'wallet-transactions') await loadTx(1);
            if (tab === 'orders') await loadMyOrders(1);
            // settings 数据在 onMounted 时已通过 loadProfile 加载
            // 移动端自动收起侧边栏
            if (window.innerWidth <= 768) {
                var sb = document.getElementById('sidebar');
                var ol = document.getElementById('sidebarOverlay');
                if (sb) sb.classList.remove('open');
                if (ol) ol.classList.remove('show');
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

        const handleEmailVerification = () => {            var params = new URLSearchParams(window.location.search);
            var verified = params.get('email_verified');
            if (verified === '1') {
                setTimeout(function() { alert(window.__i18n.t('user.email.verifyOk')); }, 500);
                var url = new URL(window.location);
                url.searchParams.delete('email_verified');
                url.searchParams.delete('reason');
                window.history.replaceState({}, '', url.toString());
            } else if (verified === '0') {
                var reason = params.get('reason');
                var msg = window.__i18n.t('user.email.verifyFail');
                if (reason === 'expired') msg = window.__i18n.t('user.email.linkExpired');
                else if (reason === 'user_not_found') msg = window.__i18n.t('user.notFound');
                else if (reason === 'error') msg = window.__i18n.t('user.verifyError');
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

        // 界面模板个人偏好：载入服务端偏好并同步到 localStorage（跨设备）
        const loadTemplatePreference = async () => {
            try {
                var res = await api('/user/template');
                templatePreference.value = (res && res.template) || '';
                var sd = (res && res.siteDefault) || 'default';
                siteDefault.value = sd;
                siteDefaultName.value = sd === 'saas' ? window.__i18n.t('settings.template.saas') : window.__i18n.t('settings.template.default');
                window.applyTemplate(templatePreference.value, sd);
            } catch (e) {
                console.error('加载界面模板偏好失败', e);
            }
        };

        // 界面模板：点击卡片实时预览（仅改 documentElement，不写 localStorage，保存才持久化）
        const selectTemplate = (v) => {
            if (v !== '' && v !== 'default' && v !== 'saas') return;
            templatePreference.value = v;
            var target = v === '' ? siteDefault.value : v;
            var html = document.documentElement;
            html.setAttribute('data-template', target);
            if (document.body) document.body.setAttribute('data-template', target);
        };

        // 界面模板个人偏好：保存到服务端 + 本地立即应用
        const saveTemplatePreference = async () => {
            templatePreferenceSaving.value = true;
            try {
                var res = await api('/user/template', {
                    method: 'PUT',
                    body: JSON.stringify({ template: templatePreference.value })
                });
                templatePreference.value = (res && res.template) || '';
                window.applyTemplate(templatePreference.value, (res && res.siteDefault) || 'default');
                alert(window.__i18n.t('user.tpl.saved'));
            } catch (e) {
                alert(window.__i18n.t('common.saveFailedMsg') + (e.message || window.__i18n.t('common.unknownError')));
            }
            templatePreferenceSaving.value = false;
        };

        // 语言偏好：载入服务端偏好
        const loadLangPreference = async () => {
            try {
                var res = await api('/user/lang');
                langPreference.value = (res && res.lang) || '';
                var sd = (res && res.siteDefault) || 'zh-CN';
                siteDefaultLang.value = sd;
                // 语言名走注册表（含自定义语言，见 i18n.js getLanguageName）
                siteDefaultLangName.value = window.__i18n.getLanguageName(sd);
                // 应用用户实际语言（个人偏好优先，其次站点默认）
                var resolved = langPreference.value || sd;
                if (window.__i18n && window.__i18n.getLocale() !== resolved) {
                    await window.__i18n.setLocale(resolved);
                }
            } catch (e) {
                console.error('加载语言偏好失败', e);
            }
        };

        // 语言偏好：保存到服务端 + 本地立即应用
        const saveLangPreference = async () => {
            langPreferenceSaving.value = true;
            try {
                var res = await api('/user/lang', {
                    method: 'PUT',
                    body: JSON.stringify({ lang: langPreference.value })
                });
                langPreference.value = (res && res.lang) || '';
                // 立即应用语言（触发全站重渲染；跟随站点默认时用返回的 siteDefault）
                var target = langPreference.value || (res && res.siteDefault) || 'zh-CN';
                await window.__i18n.setLocale(target);
                // 更新站点默认显示
                var sd = (res && res.siteDefault) || 'zh-CN';
                siteDefaultLang.value = sd;
                siteDefaultLangName.value = window.__i18n.getLanguageName(sd);
                alert(window.__i18n.t('user.language.save') + ' ' + window.__i18n.t('common.success'));
            } catch (e) {
                alert(window.__i18n.t('common.saveFailedMsg') + (e.message || window.__i18n.t('common.unknownError')));
            }
            langPreferenceSaving.value = false;
        };

        const updateProfile = async () => {
            try {
                const data = {
                    username: profileForm.value.username,
                    bio: profileForm.value.bio
                };
                const result = await api('/user/profile', {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                user.value = result.user;
                alert(window.__i18n.t('user.profile.updateOk'));
            } catch (e) {
                alert(e.message);
            }
        };

        // 独立修改密码卡片：新密码 + 确认密码（复用注册页交互）+ 当前密码二次验证
        const updatePassword = async () => {
            if (!profileForm.value.password) {
                alert(window.__i18n.t('user.secAuth.newPwdRequired'));
                return;
            }
            if (profileForm.value.password !== profileForm.value.confirmPassword) {
                alert(window.__i18n.t('register.passwordMismatch'));
                return;
            }
            if (!profileForm.value.currentPassword) {
                alert(window.__i18n.t('user.sec.pwdNeedsCurrent'));
                return;
            }
            try {
                const result = await api('/user/password', {
                    method: 'PUT',
                    body: JSON.stringify({ password: profileForm.value.password, current_password: profileForm.value.currentPassword })
                });
                profileForm.value.password = '';
                profileForm.value.confirmPassword = '';
                profileForm.value.currentPassword = '';
                alert(result.message);
            } catch (e) {
                // 限速 429 倒计时已由 api() 统一拼接进错误文案，这里原样展示
                alert(e.message);
            }
        };

        const avatarFileName = ref('');
        const handleAvatarUpload = async (e) => {
            const file = e.target.files[0];
            if (file) {
                if (file.size > 2 * 1024 * 1024) {
                    alert(window.__i18n.t('user.avatar.tooLarge'));
                    avatarFileName.value = '';
                    e.target.value = '';
                    return;
                }
                if (!['image/jpeg', 'image/png'].includes(file.type)) {
                    alert(window.__i18n.t('user.avatar.format'));
                    avatarFileName.value = '';
                    e.target.value = '';
                    return;
                }
                avatarFileName.value = file.name;
                try {
                    const formData = new FormData();
                    formData.append('avatar', file);
                    const token = await ensureValidToken();
                    const response = await fetch('/api/user/avatar', {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${token || ''}`
                        },
                        body: formData
                    });
                    if (!response.ok) {
                        const data = await response.json();
                        throw new Error(data.error || window.__i18n.t('common.uploadFailed'));
                    }
                    const data = await response.json();
                    profileForm.value.avatar = data.avatar;
                    if (user.value) {
                        user.value.avatar = data.avatar;
                    }
                    alert(window.__i18n.t('user.avatar.uploadOk'));
                } catch (e) {
                    alert(e.message);
                }
            }
        };

        const bindEmail = async () => {
            try {
                // M-1 修复：换绑邮箱需要当前密码做二次验证
                if (!profileForm.value.emailPassword) {
                    alert(window.__i18n.t('user.sec.emailNeedsCurrent'));
                    return;
                }
                const result = await api('/user/email', {
                    method: 'PUT',
                    body: JSON.stringify({ email: profileForm.value.email, current_password: profileForm.value.emailPassword })
                });
                profileForm.value.emailVerified = false;
                profileForm.value.emailPassword = '';
                user.value.email = result.user.email;
                user.value.emailVerified = false;
                alert(result.message);
            } catch (e) {
                // 限速 429 倒计时已由 api() 统一拼接进错误文案，这里原样展示
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
                // 限速 429 倒计时已由 api() 统一拼接进错误文案，这里原样展示
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
            if (!await window.customConfirm(window.__i18n.t('user.memos.deleteConfirm'))) return;
            try {
                await api(`/user/memos/${id}`, { method: 'DELETE' });
                await loadMemos();
            } catch (e) {
                alert(e.message);
            }
        };

        const loadMessages = async (page) => {
            const seq = ++msgLoadSeq;
            msgPage.value = page || 1;
            messagesLoading.value = true;
            try {
                const params = { type: msgType.value, page: msgPage.value, limit: msgPageSize.value };
                const data = await api('/messages?' + new URLSearchParams(params));
                if (seq !== msgLoadSeq) return; // 已有更新的请求，丢弃本次结果
                messages.value = data.list || [];
                msgTotal.value = data.total || 0;
                // 删除/清空后当前页可能为空：若非第 1 页且还有数据，回退到最后一页
                if (messages.value.length === 0 && msgTotal.value > 0 && msgPage.value > 1) {
                    return loadMessages(Math.ceil(msgTotal.value / msgPageSize.value));
                }
            } catch (e) {
                if (seq !== msgLoadSeq) return;
                console.error('加载消息失败', e);
            } finally {
                if (seq === msgLoadSeq) messagesLoading.value = false;
            }
        };
        // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
        const changeMsgPageSize = (size) => {
            msgPageSize.value = size || 20;
            loadMessages(1);
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
                alert(window.__i18n.t('user.message.detailFail'));
            }
        };

        const markAllRead = async () => {
            try {
                await api('/messages/read-all', { method: 'PUT' });
                await loadMessages(msgPage.value); // 列表按 is_read 排序，标记后重载保持一致性
                unreadCount.value = 0;
            } catch (e) {
                alert(e.message);
            }
        };

        const deleteMessage = async (id) => {
            if (!await window.customConfirm(window.__i18n.t('user.message.deleteConfirm'))) return;
            try {
                await api('/messages/' + id, { method: 'DELETE' });
                bsModalHide('messageDetailModal');
                await loadMessages(msgPage.value); // 删空当前页时自动回退
                loadUnreadCount();
            } catch (e) {
                alert(e.message);
            }
        };

        const clearAllMessages = async () => {
            if (!await window.customConfirm(window.__i18n.t('user.message.clearReadConfirm'))) return;
            try {
                await api('/messages', { method: 'DELETE' });
                await loadMessages(msgPage.value); // 重载修正 total；页面删空时自动回退
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
                const refreshToken = localStorage.getItem(window.__storageKeys.REFRESH_TOKEN);
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
            if (await window.customConfirm(window.__i18n.t('user.devices.kickConfirm'))) {
                try {
                    await api(`/user/devices/${id}`, { method: 'DELETE' });
                    devices.value = devices.value.filter(d => d.id !== id);
                    alert(window.__i18n.t('user.devices.kicked'));
                } catch (e) {
                    alert(e.message);
                }
            }
        };

        const revokeOtherDevices = async () => {
            if (await window.customConfirm(window.__i18n.t('user.devices.kickAllConfirm'))) {
                try {
                    const refreshToken = localStorage.getItem(window.__storageKeys.REFRESH_TOKEN);
                    await api('/user/devices', {
                        method: 'DELETE',
                        body: JSON.stringify({ refreshToken })
                    });
                    devices.value = devices.value.filter(d => d.id === currentDeviceId.value);
                    alert(window.__i18n.t('user.devices.kickedAll'));
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
            if (codes.length === 0) { alert(window.__i18n.t('user.twofa.noCodes')); return; }
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
            customAlertMessage.value = window.__i18n.t('user.twofa.codesCopied');
            var oldModal = bootstrap.Modal.getInstance(el);
            if (oldModal) oldModal.dispose();
            window.applyModalZIndex(el);
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
            customAlertMessage.value = window.__i18n.t('user.twofa.codeCopied');
            var oldModal = bootstrap.Modal.getInstance(el);
            if (oldModal) oldModal.dispose();
            window.applyModalZIndex(el);
            new bootstrap.Modal(el, { focus: false }).show();
        };

        const downloadRecoveryCodes = () => {
            const text = twofaRecoveryCodes.value.map(rc => (rc.used ? window.__i18n.t('user.twofa.usedTag') : '') + rc.code).join('\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'recovery-codes.txt';
            a.click();
            URL.revokeObjectURL(url);
        };

        // M-1 修复：恢复码重生成前先做二次验证（当前密码或 2FA 动态码）
        const secondaryAuthInput = ref('');
        const secondaryAuthTitle = ref(window.__i18n.t('user.twofa.title'));
        let secondaryAuthCallback = null;

        const openSecondaryAuth = (title, cb) => {
            secondaryAuthTitle.value = title;
            secondaryAuthInput.value = '';
            secondaryAuthCallback = cb;
            bsModalShow('secondaryAuthModal');
        };

        const confirmSecondaryAuth = async () => {
            const input = secondaryAuthInput.value.trim();
            if (!input) {
                alert(window.__i18n.t('user.twofa.pwdOrCodeRequired'));
                return;
            }
            bsModalHide('secondaryAuthModal');
            const cb = secondaryAuthCallback;
            secondaryAuthCallback = null;
            if (cb) await cb(input);
        };

        // V5-修复：回车触发二次验证（无修饰符 @keyup，避免 Teleport 内 withKeys helper 问题）
        const onSecondaryAuthKeyup = (event) => {
            if (event && event.key === 'Enter') {
                confirmSecondaryAuth();
            }
        };

        const regenerateRecoveryCodes = async () => {
            bsModalHide('twofaRecoveryModal');
            await new Promise(r => setTimeout(r, 300));
            if (!await window.customConfirm(window.__i18n.t('user.twofa.regenerateConfirm'))) {
                bsModalShow('twofaRecoveryModal');
                return;
            }
            openSecondaryAuth(window.__i18n.t('user.twofa.regenerateBtn'), async (input) => {
                try {
                    const data = await api('/user/2fa/recovery-codes/regenerate', {
                        method: 'POST',
                        body: JSON.stringify({
                            current_password: input,
                            code: input
                        })
                    });
                    twofaRecoveryCodes.value = (data.recovery_codes || []).map((code, i) => ({ id: i + 1, code, used: 0, created_at: new Date().toISOString() }));
                    twofaRecoveryCount.value = twofaRecoveryCodes.value.length;
                    const el = document.getElementById('customAlertModal');
                    if (el) {
                        el.addEventListener('hidden.bs.modal', function onHidden() {
                            el.removeEventListener('hidden.bs.modal', onHidden);
                            bsModalShow('twofaRecoveryModal');
                        }, { once: true });
                    }
                    customAlertMessage.value = window.__i18n.t('user.twofa.regenerated');
                    var oldModal = bootstrap.Modal.getInstance(el);
                    if (oldModal) oldModal.dispose();
                    window.applyModalZIndex(el);
                    new bootstrap.Modal(el, { focus: false }).show();
                } catch (e) {
                    bsModalShow('twofaRecoveryModal');
                    await new Promise(r => setTimeout(r, 300));
                    alert(window.__i18n.t('user.twofa.regenerateFail') + e.message);
                }
            });
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
                alert(window.__i18n.t('user.twofa.disabledToast'));
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
                // 兜底：URL 没带回调参数但 localStorage 有 pending order（页面被支付宝/浏览器重建），
                // 恢复 pending 状态并启动轮询，确保支付成功后能看到弹窗+余额更新
                if (!rechargePollingTimer && !rechargePendingOrderNo.value) {
                    const p = loadPending();
                    if (p) {
                        rechargePendingOrderNo.value = p.orderNo;
                        rechargePendingAmount.value = p.amount;
                        rechargeMethod.value = p.method || '';
                        pollOrderStatus(p.orderNo, p.amount);
                    }
                }
                await loadNavItems();
                await loadProfile();
                await loadTemplatePreference();
                await loadLangPreference();
                window.syncUserTemplate && window.syncUserTemplate();
                handleEmailVerification();
                if (window.location.hash === '#messages' || activeSubTab.value === 'messages') {
                    activeSubTab.value = 'messages';
                    await loadMessages();
                } else if (activeSubTab.value === 'security') {
                    await loadDevices();
                    await loadTwofaStatus();
                } else if (activeSubTab.value === 'wallet-transactions') {
                    await loadTx(1);
                } else if (activeSubTab.value === 'orders') {
                    await loadMyOrders(1);
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
            if (val !== 'settings' && window.location.hash !== '#' + val) {
                history.replaceState(null, '', '#' + val);
            } else if (val === 'settings' && window.location.hash) {
                history.replaceState(null, '', window.location.pathname);
            }
            if (val === 'wallet-transactions') loadTx(1);
            if (val === 'orders') loadMyOrders(1);
        });

        // 监听 user 变化同步 header
        watch(user, () => {
            syncHeaderUser();
        }, { deep: true });

        return {
            // i18n 翻译函数（响应式：语言切换时自动重渲染）
            t: window.__i18n.t,
            tFormat: window.__i18n.tFormat,
            user,
            DOMPurify,
            activeSubTab,
            navItems,
            currentNavId,
            switchSubTab,
            profileForm,
            templatePreference,
            templatePreferenceSaving,
            siteDefaultName,
            selectTemplate,
            saveTemplatePreference,
            langPreference,
            langPreferenceSaving,
            siteDefaultLangName,
            loadLangPreference,
            saveLangPreference,
            memos,
            memosLoading,
            editMemoForm,
            unreadCount,
            messages,
            messagesLoading,
            msgType,
            msgTotal,
            msgPage,
            msgPageSize,
            currentMsg,
            parseMarkdown,
            customAlertMessage,
            customConfirmMessage,
            getGeekAvatar,
            formatDate,
            copyText: function(text) { if (window.copyText) window.copyText(text); },
            logout,
            loadProfile,
            loadMemos,
            updateProfile,
            updatePassword,
            avatarFileName,
            handleAvatarUpload,
            bindEmail,
            resendVerification,
            addMemo,
            editMemo,
            saveMemo,
            deleteMemo,
            loadUnreadCount,
            loadMessages,
            changeMsgPageSize,
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
            // V5-修复：二次验证弹窗状态/函数补暴露（模板引用，缺了会导致 undefined）
            secondaryAuthInput,
            secondaryAuthTitle,
            openSecondaryAuth,
            confirmSecondaryAuth,
            onSecondaryAuthKeyup,
            walletBalance, payMethods, rechargeAmount, rechargeMethod, rechargeSubmitting, rechargeError,
            txList, txTotal, txPage, txPageSize, txFilter, myOrders, orderPage, orderPageSize, orderTotal, orderFilter,
            submitRecharge, loadTx, copyOrderNo, loadMyOrders, changeTxPageSize, changeOrderPageSize,
            rechargePendingOrderNo, rechargePendingAmount, rechargeResultType, rechargeResultTitle, rechargeResultAmount,
            rechargeQrLoading, rechargePayUrl, rechargeIsMobile,
            pollOrderStatus, cancelRecharge, closeRechargeResult, openMobilePay, checkPayStatus,
            notifSettings, notifGroups, loadNotifSettings, toggleNotifSetting,
            toastMessage, toastType, showToast
        };
    }
};

// i18n：先加载当前语言翻译，再挂载 Vue（确保首次渲染即为目标语言）
(async function () {
    if (window.__i18n && !window.__i18n.isLoaded()) {
        await window.__i18n.init(window.__initialLocale || 'zh-CN');
    }
    var app = createApp(App);
    // 组件内部（pv-pagination 等）不继承主组件 setup return 的 t/tFormat，
    // 必须经 globalProperties 提供（与 admin/dashboard 一致）；缺失会导致组件渲染抛错 → 分页条静默消失
    app.config.globalProperties.t = window.__i18n.t;
    app.config.globalProperties.tFormat = window.__i18n.tFormat;
    // 语言下拉选项列表（系统 + 自定义语言；注册表加载失败时回退 7 种系统语言）
    app.config.globalProperties.i18nLanguageList = window.__i18n.getLanguages;
    app.mount('#app');
})();

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
                if (ol) ol.classList.remove('show');
                // 如果是<a>标签且有href，延迟导航确保先关闭
                if (item.tagName === 'A' && item.href && item.href !== window.location.href) {
                    e.preventDefault();
                    setTimeout(function() { window.location.href = item.href; }, 300);
                }
            }
        });
    });
});