const { createApp, ref, onMounted, onUnmounted, onBeforeUnmount, watch, nextTick } = Vue;

const App = {
    template: '#appTemplate',
    setup() {
        const user = ref(null);
        const activeSubTab = ref(window.location.hash ? window.location.hash.slice(1) : 'settings');
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
        const orderPage = ref(1);
        const orderTotal = ref(0);
        const orderFilter = ref({ order_no: '', type: '' });

        // 充值轮询相关
        const rechargePendingOrderNo = ref('');
        const rechargePendingAmount = ref('');

        // pending order 持久化：手机端支付完成后页面可能被支付宝/浏览器重建，
        // 通过 localStorage 在页面加载时恢复轮询，确保支付成功后能看到弹窗+余额更新
        const PENDING_KEY = 'recharge_pending';
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
                // 注意：不得删除所有 .modal-backdrop（会破坏其他仍开着弹窗的遮罩）
                el.addEventListener('hide.bs.modal', function onHide() {
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                }, { once: true });
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
                window.applyModalZIndex(el);
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
                // 先 dispose 旧实例，再注册事件（dispose 会清除旧监听器）
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                // hide 前彻底 blur 焦点，防止 Bootstrap 恢复焦点到底层 modal 触发 focus trap 冲突
                el.addEventListener('hide.bs.modal', function onHide() {
                    if (document.activeElement && document.activeElement !== document.body) {
                        document.activeElement.blur();
                    }
                }, { once: true });
                // 获取动态 z-index（customConfirmModal 不走 bsModalShow，需单独管理）
                const zIndex = window.ModalZIndexManager.acquire();
                el._modalZIndex = zIndex;
                el.style.zIndex = zIndex;
                // hidden 时释放 z-index + 清理 body 状态，防止残留 modal-open 导致底层 modal 卡死
                el.addEventListener('hidden.bs.modal', function onHidden() {
                    el.removeEventListener('hidden.bs.modal', onHidden);
                    if (el._modalZIndex != null) {
                        window.ModalZIndexManager.release(el._modalZIndex);
                        el._modalZIndex = null;
                        el.style.zIndex = '';
                    }
                    if (window.ModalZIndexManager && window.ModalZIndexManager.getActiveCount() === 0) {
                        document.body.classList.remove('modal-open');
                        document.body.style.removeProperty('padding-right');
                        document.body.style.removeProperty('overflow');
                    }
                }, { once: true });
                new bootstrap.Modal(el, { focus: false }).show();
                // shown 后设置 backdrop z-index
                el.addEventListener('shown.bs.modal', function onShown() {
                    el.removeEventListener('shown.bs.modal', onShown);
                    var backdrops = document.querySelectorAll('.modal-backdrop');
                    var backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
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
                            rechargeError.value = '二维码库加载失败，请刷新重试';
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
                    rechargeError.value = '暂未检测到支付成功，请确认支付完成后重试';
                    setTimeout(() => { rechargeError.value = ''; }, 3000);
                }
            } catch (e) {
                rechargeError.value = '查询失败，请稍后重试';
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
                const params = { page: txPage.value, limit: 20 };
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

        const loadMyOrders = async (page) => {
            orderPage.value = page || 1;
            try {
                const params = { page: orderPage.value, limit: 20 };
                if (orderFilter.value.order_no) params.order_no = orderFilter.value.order_no;
                if (orderFilter.value.type) params.type = orderFilter.value.type;
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
            customAlertMessage.value = '恢复码已复制';
            var oldModal = bootstrap.Modal.getInstance(el);
            if (oldModal) oldModal.dispose();
            window.applyModalZIndex(el);
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
                var oldModal = bootstrap.Modal.getInstance(el);
                if (oldModal) oldModal.dispose();
                window.applyModalZIndex(el);
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
            txList, txTotal, txPage, txFilter, myOrders, orderPage, orderTotal, orderFilter,
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