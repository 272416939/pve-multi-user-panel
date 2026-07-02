const api = (endpoint, options = {}) => {
    return ensureValidToken().then(token => {
        const fetchOptions = {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                ...options.headers
            }
        };
        if (fetchOptions.body && typeof fetchOptions.body === 'object' && !(fetchOptions.body instanceof FormData)) {
            fetchOptions.body = JSON.stringify(fetchOptions.body);
        }
        return fetch(`/api${endpoint}`, fetchOptions);
    }).then(async res => {
        if (res.status === 401) {
            const data = await res.json().catch(() => ({}));
            if (data.code === 'TOKEN_EXPIRED') {
                const refreshToken = localStorage.getItem('refreshToken');
                if (refreshToken) {
                    const refreshRes = await fetch('/api/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken })
                    });
                    if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        localStorage.setItem('token', refreshData.token);
                        localStorage.setItem('refreshToken', refreshData.refreshToken);
                        const retryOptions = {
                            ...options,
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${refreshData.token}`,
                                ...options.headers
                            }
                        };
                        if (retryOptions.body && typeof retryOptions.body === 'object' && !(retryOptions.body instanceof FormData)) {
                            retryOptions.body = JSON.stringify(retryOptions.body);
                        }
                        return fetch(`/api${endpoint}`, retryOptions).then(async r => {
                            const d = await r.json();
                            if (!r.ok) throw new Error(d.error || '请求失败');
                            return d;
                        });
                    }
                }
            }
            const token = localStorage.getItem('token');
            if (token) {
                localStorage.removeItem('token');
                localStorage.removeItem('refreshToken');
                window.location.href = 'login.html';
            }
            throw new Error(data.error || '请求失败');
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '请求失败');
        return data;
    });
};

// 本地检查 JWT 是否过期，过期则提前刷新
var _refreshPromise = null;

function ensureValidToken() {
    const token = localStorage.getItem('token');
    if (!token) return Promise.resolve(null);
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now() + 300000) {
            return Promise.resolve(token);
        }
    } catch {
        return Promise.resolve(token);
    }
    // token 将在5分钟内过期或已过期，需要刷新
    // 防止并发刷新：如果已有刷新进行中，等待同一个 Promise
    if (_refreshPromise) return _refreshPromise;
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        localStorage.removeItem('token');
        return Promise.resolve(null);
    }
    _refreshPromise = fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refreshToken })
    }).then(function(res) {
        if (res.ok) return res.json();
        return res.json().then(function(d) { throw new Error(d.error || '刷新失败'); });
    }).then(function(data) {
        if (data.token) {
            localStorage.setItem('token', data.token);
            if (data.refreshToken) localStorage.setItem('refreshToken', data.refreshToken);
            _refreshPromise = null;
            return data.token;
        }
        throw new Error('无token');
    }).catch(function() {
        _refreshPromise = null;
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        return null;
    });
    return _refreshPromise;
}

// ===== PushClient: 统一WebSocket推送通道 =====
window._pushClient = null;
window._pushSubscribeQueue = [];
window._pushReconnectDelay = 1000;
window.initPushClient = function(onMessage, onOpen) {
    if (window._pushClient && window._pushClient.readyState === WebSocket.OPEN) return;
    window._pushClient = null;
    api('/user/push-ticket').then(function(r) {
        if (!r.ticket) return;
        var protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        var ws = new WebSocket(protocol + '//' + location.host + '/ws/push?ticket=' + r.ticket);
        window._pushClient = ws;
        ws.addEventListener('open', function() {
            window._pushReconnectDelay = 1000;
            if (onOpen) onOpen();
            var q = window._pushSubscribeQueue;
            while (q.length) { sendPush(q.shift()); }
        });
        ws.addEventListener('message', function(e) {
            try {
                var msg = JSON.parse(e.data);
                if (onMessage) onMessage(msg);
            } catch (_) {}
        });
        ws.addEventListener('close', function() {
            window._pushClient = null;
            var delay = window._pushReconnectDelay;
            delay += Math.floor(Math.random() * 1000);
            window._pushReconnectDelay = Math.min(window._pushReconnectDelay * 2, 60000);
            setTimeout(function() { window.initPushClient(onMessage, onOpen); }, delay);
        });
        ws.addEventListener('error', function() {
            window._pushClient = null;
        });
    }).catch(function() {});
};

window.sendPush = function(msg) {
    if (window._pushClient && window._pushClient.readyState === WebSocket.OPEN) {
        window._pushClient.send(JSON.stringify(msg));
    }
};

const getGeekAvatar = (username) => {
    const name = username || '?';
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const palettes = [
        ['#667eea', '#764ba2'],
        ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'],
        ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'],
        ['#a18cd1', '#fbc2eb'],
        ['#fccb90', '#d57eeb'],
        ['#e0c3fc', '#8ec5fc'],
        ['#f5576c', '#667eea'],
        ['#667eea', '#43e97b']
    ];
    const idx = Math.abs(hash) % palettes.length;
    const [c1, c2] = palettes[idx];
    const letter = name.charAt(0).toUpperCase();
    const seed = Math.abs(hash);
    const lines = [];
    for (let i = 0; i < 6; i++) {
        const x1 = 10 + ((seed * (i + 1) * 7) % 60);
        const y1 = 10 + ((seed * (i + 1) * 13) % 60);
        const x2 = x1 + 10 + ((seed * (i + 1) * 3) % 20);
        const y2 = y1;
        const x3 = x2;
        const y3 = y2 + 8 + ((seed * (i + 1) * 5) % 15);
        const hasDot = (seed * (i + 1)) % 3 === 0;
        const dotTag = hasDot ? `<circle cx="${x3}" cy="${y3}" r="2" fill="rgba(255,255,255,0.4)"/>` : '';
        lines.push(`<polyline points="${x1},${y1} ${x2},${y2} ${x3},${y3}" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="${x1}" cy="${y1}" r="1.5" fill="rgba(255,255,255,0.35)"/>${dotTag}`);
    }
    const dots = [];
    for (let x = 6; x < 74; x += 10) {
        for (let y = 6; y < 74; y += 10) {
            if ((x * y + seed) % 7 === 0) {
                dots.push(`<circle cx="${x}" cy="${y}" r="1" fill="rgba(255,255,255,0.15)"/>`);
            }
        }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs><rect width="80" height="80" fill="url(#bg)" rx="40"/>${dots.join('')}<text x="40" y="48" text-anchor="middle" fill="rgba(255,255,255,0.9)" font-family="monospace" font-size="28" font-weight="bold">${letter}</text>${lines.join('')}</svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg);
};

const formatMemory = (mb) => {
    if (!mb) return '0 MB';
    if (mb >= 1024) return (mb / 1024).toFixed(1) + ' GB';
    return Math.round(mb) + ' MB';
};

const formatBytes = (bytes, binary) => {
    if (!bytes) return '0 B';
    var units;
    var divisor;
    if (binary) {
        units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
        divisor = 1024;
    } else {
        units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        divisor = 1000;
    }
    let unitIndex = 0;
    let value = bytes;
    while (value >= divisor && unitIndex < units.length - 1) {
        value /= divisor;
        unitIndex++;
    }
    return value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2) + ' ' + units[unitIndex];
};

// 从 PVE config 中提取磁盘配置大小，优先返回配置值（如 40 GB），避免 maxdisk 字节换算偏差
const formatDiskSize = (item) => {
    if (!item) return '-';
    // 优先从 config 提取配置的磁盘大小（如 scsi0: ...,size=40G 或 rootfs: ...,size=40G）
    if (item.config) {
        var diskKeys = ['scsi0','virtio0','sata0','ide0','rootfs'];
        for (var i = 0; i < diskKeys.length; i++) {
            var dv = item.config[diskKeys[i]];
            if (dv) {
                var m = dv.match(/size=(\d+)([KMGT]?)/i);
                if (m) {
                    var num = parseInt(m[1]);
                    var unit = (m[2] || 'G').toUpperCase();
                    if (unit === 'T') return (num * 1024) + ' GB';
                    if (unit === 'M') return (num / 1024).toFixed(1) + ' GB';
                    if (unit === 'K') return (num / 1024 / 1024).toFixed(2) + ' GB';
                    return num + ' GB';
                }
            }
        }
    }
    // 兜底：用 status.maxdisk 换算（按 1024 进制）
    if (item.status && item.status.maxdisk) {
        return Math.round(item.status.maxdisk / 1073741824 * 10) / 10 + ' GB';
    }
    return '-';
};

const formatDate = (date) => {
    if (!date) return '-';
    var d = typeof date === 'string' ? date : date;
    // MySQL 本地时间格式 YYYY-MM-DD HH:MM:SS — 按组件解析为本地时间
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(d)) {
        var parts = d.split(/[- :]/);
        return new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4], +parts[5]).toLocaleString('zh-CN');
    }
    if (typeof d === 'string' && !/[Zz]|[+-]\d{2}:\d{2}$/.test(d) && !d.includes('T')) {
        d = d + 'Z';
    }
    return new Date(d).toLocaleString('zh-CN');
};

const formatUptime = (seconds) => {
    if (!seconds || seconds < 0) return '';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}天${hours}小时`;
    if (hours > 0) return `${hours}小时${minutes}分钟`;
    return `${minutes}分钟`;
};

const trimContent = (text) => {
    return text ? text.replace(/\n/g, ' ') : '';
};

// 将 datetime-local 输入框的值（YYYY-MM-DDTHH:MM）转换为本地时间字符串 YYYY-MM-DD HH:MM:SS
// 用于发送给后端保存，避免 toISOString() 转换为 UTC 导致时区偏差
const toLocalDateTimeStr = (datetimeLocalValue) => {
    if (!datetimeLocalValue) return null;
    // datetime-local 格式：YYYY-MM-DDTHH:MM 或 YYYY-MM-DDTHH:MM:SS
    var s = datetimeLocalValue.replace('T', ' ');
    // 补齐秒数
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(s)) s += ':00';
    return s;
};

const formatDateTimeLocal = (dateStr) => {
    if (!dateStr) return '';
    var safe = dateStr;
    // MySQL 本地时间格式 YYYY-MM-DD HH:MM:SS — 按组件解析为本地时间
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(safe)) {
        var parts = safe.split(/[- :]/);
        var dt = new Date(+parts[0], +parts[1] - 1, +parts[2], +parts[3], +parts[4], +parts[5]);
        if (isNaN(dt.getTime())) return '';
        var y2 = dt.getFullYear();
        var m2 = String(dt.getMonth() + 1).padStart(2, '0');
        var d2 = String(dt.getDate()).padStart(2, '0');
        var h2 = String(dt.getHours()).padStart(2, '0');
        var mi2 = String(dt.getMinutes()).padStart(2, '0');
        return y2 + '-' + m2 + '-' + d2 + 'T' + h2 + ':' + mi2;
    }
    if (!/[Zz]|[+-]\d{2}:\d{2}$/.test(dateStr) && !dateStr.includes('T')) {
        safe = dateStr + 'Z';
    }
    const date = new Date(safe);
    if (isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const setupCustomAlert = (customAlertMessage) => {
    window.alert = (message) => {
        customAlertMessage.value = message;
        const el = document.getElementById('customAlertModal');
        if (el) {
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            // 注意：不得删除所有 .modal-backdrop（会破坏其他仍开着弹窗的遮罩）
            // 仅 dispose 当前弹窗的旧实例，让 Bootstrap 自然清理其 backdrop
            const old = bootstrap.Modal.getInstance(el);
            if (old) old.dispose();
            el.addEventListener('hide.bs.modal', function onHide() {
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.blur();
                }
            }, { once: true });
            // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
            window.applyModalZIndex(el);
            bootstrap.Modal.getOrCreateInstance(el, { focus: false }).show();
        }
    };
};

const setupCustomConfirm = (customConfirmMessage, customConfirmResolve) => {
    window.customConfirm = (message) => {
        return new Promise((resolve) => {
            customConfirmMessage.value = message;
            customConfirmResolve.value = resolve;
            const el = document.getElementById('customConfirmModal');
            if (!el) { resolve(false); return; }
            if (document.activeElement && document.activeElement !== document.body) {
                document.activeElement.blur();
            }
            // 注意：不得删除所有 .modal-backdrop（会破坏其他仍开着弹窗的遮罩）
            const old = bootstrap.Modal.getInstance(el);
            if (old) old.dispose();
            el.addEventListener('hide.bs.modal', function onHide() {
                if (document.activeElement && document.activeElement !== document.body) {
                    document.activeElement.blur();
                }
            }, { once: true });
            // 动态 z-index：后弹出的弹窗始终在之前弹窗之上
            window.applyModalZIndex(el);
            bootstrap.Modal.getOrCreateInstance(el, { focus: false }).show();
        });
    };
};

const confirmOk = (customConfirmResolve) => {
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

const confirmCancel = (customConfirmResolve) => {
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

const authGuard = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = 'login.html';
        return null;
    }
    try {
        const userData = await api('/user/profile');
        return userData;
    } catch (e) {
        localStorage.removeItem('token');
        window.location.href = 'login.html';
        return null;
    }
};

const logout = () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
        fetch('/api/logout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken })
        }).catch(() => {});
    }
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    window.location.href = 'login.html';
};

// XSS-4 修复：替换内联 onclick 为 addEventListener（CSP nonce 合规）
document.addEventListener('DOMContentLoaded', function() {
    var sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebarToggleBtn && typeof toggleSidebar === 'function') {
        sidebarToggleBtn.addEventListener('click', toggleSidebar);
    }
    var headerRefreshBtn = document.getElementById('headerRefreshBtn');
    if (headerRefreshBtn) {
        headerRefreshBtn.addEventListener('click', function() { location.reload(); });
    }
    var headerLogoutBtn = document.getElementById('headerLogoutBtn');
    if (headerLogoutBtn) {
        headerLogoutBtn.addEventListener('click', function(e) { e.preventDefault(); logout(); });
    }
    var sidebarOverlay = document.getElementById('sidebarOverlay');
    if (sidebarOverlay && typeof toggleSidebar === 'function') {
        sidebarOverlay.addEventListener('click', toggleSidebar);
    }
});

// ===== ModalZIndexManager: 统一弹窗 z-index 管理器 =====
// 解决弹窗叠加时 z-index 硬编码导致后弹出的弹窗可能被先弹出的弹窗遮挡的问题
window.ModalZIndexManager = (function() {
    'use strict';
    var BASE_Z_INDEX = 1050;  // 基准 z-index
    var STEP = 10;            // 每次递增步长（留出 backdrop 空间）
    var counter = BASE_Z_INDEX;
    var activeZIndices = [];  // 当前活跃的 z-index 栈

    return {
        // 获取下一个可用 z-index（用于弹窗本身）
        acquire: function() {
            counter += STEP;
            activeZIndices.push(counter);
            return counter;
        },
        // 获取 backdrop 的 z-index（比当前弹窗小 5）
        acquireBackdrop: function(modalZIndex) {
            return modalZIndex - 5;
        },
        // 回收 z-index（弹窗关闭时调用）
        release: function(zIndex) {
            var idx = activeZIndices.indexOf(zIndex);
            if (idx > -1) activeZIndices.splice(idx, 1);
            // 如果没有活跃弹窗，重置计数器到基准值
            if (activeZIndices.length === 0) {
                counter = BASE_Z_INDEX;
            }
        },
        // 获取当前活跃弹窗数量
        getActiveCount: function() {
            return activeZIndices.length;
        },
        // 获取当前最高 z-index
        getTopZIndex: function() {
            return activeZIndices.length > 0 ? activeZIndices[activeZIndices.length - 1] : BASE_Z_INDEX;
        }
    };
})();

// ===== applyModalZIndex / releaseModalZIndex 公共 helper =====
// 供 alert/confirm/showAlertAndWait/rechargeResultModal 等不走 bsModalShow 的弹窗复用
// 保证后弹出的弹窗 z-index 永远高于先弹出的弹窗
window.applyModalZIndex = function(el) {
    if (!el || !window.ModalZIndexManager) return null;
    var zIndex = window.ModalZIndexManager.acquire();
    el._modalZIndex = zIndex;
    el.style.zIndex = zIndex;
    // shown 后设置 backdrop z-index
    // 注意：多弹窗叠加时，querySelectorAll 取最后一个（最新弹窗的 backdrop），而非第一个
    el.addEventListener('shown.bs.modal', function onShown() {
        el.removeEventListener('shown.bs.modal', onShown);
        var backdrops = document.querySelectorAll('.modal-backdrop');
        var backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;
        if (backdrop) {
            backdrop.style.zIndex = window.ModalZIndexManager.acquireBackdrop(zIndex);
        }
    }, { once: true });
    // hidden 时 release z-index
    el.addEventListener('hidden.bs.modal', function onHidden() {
        el.removeEventListener('hidden.bs.modal', onHidden);
        if (el._modalZIndex != null) {
            window.ModalZIndexManager.release(el._modalZIndex);
            el._modalZIndex = null;
            el.style.zIndex = '';
        }
    }, { once: true });
    return zIndex;
};

