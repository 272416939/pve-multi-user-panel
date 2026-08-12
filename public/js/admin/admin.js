(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var computed = Vue.computed;
    var watch = Vue.watch;

    // ==================== 状态 ====================
    $.users = ref([]);
    $.userPage = ref(1);
    $.userPageSize = ref(20);
    $.userTotal = ref(0);
    $.userFilter = ref({ keyword: '', role: '' });
    $.showCreateUser = ref(false);
    $.createUserForm = ref({ username: '', password: '', role: 'user', email: '', emailVerified: false });
    $.editUserForm = ref({ id: null, username: '', password: '', role: 'user', email: '', emailVerified: false, totp_enabled: false });
    $.assignForm = ref({ vm_id: '', user_id: '', name: '', expiration_date: '', renewal_price: '', renewal_period: 'month', monthly_price: '', quarterly_discount: '', yearly_discount: '', mac_group_id: '' });
    $.smtpConfig = ref({ host: '', port: 587, secure: false, user: '', password: '', from: '', from_name: '', enabled: false });
    $.emailQueueStats = ref(null);
    $.pveConfig = ref({ host: '', api_token: '', ssh_host: '', ssh_port: 22, ssh_user: 'root', ssh_password: '', strict_tls: false });
    $.reminderConfig = ref({ days1: 7, days2: 3, days3: 1 });
    $.snapshotConfig = ref({ max_per_vm: 5, daily_create_limit: 20, daily_restore_limit: 10 });
    $.storageList = ref([]);
    $.backupConfigForm = ref({ default_storage: 'local', max_per_vm: 3, daily_limit: 3 });
    $.testEmail = ref('');
    $.siteLogoText = ref($.__siteLogoText || 'PVE 面板');
    $.siteConfigForm = ref({ name: '', logo_text: '', login_title: '', register_enabled: false });
    $.siteConfigSaving = ref(false);
    // 模板样式（站点全局默认，个人偏好优先级更高）
    $.templateStyle = ref('default');
    $.templateStyleSaving = ref(false);
    $.redisConfig = ref({ host: '', port: 6379, password: '', db: 0, prefix: 'pve:' });
    $.redisConfigSaving = ref(false);
    $.redisTesting = ref(false);
    $.cacheClearing = ref(false);
    // 用户日志上限配置
    $.logConfigForm = ref({ keep_count: 5000, keep_admin_count: 5000 });
    $.logConfigSaving = ref(false);
    $.cdkList = ref([]);
    $.cdkForm = ref({ duration_days: 30, count: 1, expires_at: '' });
    $.cdkResult = ref([]);
    $.cdkResultBatchId = ref('');
    $.cdkSelectedUsers = ref([]);
    $.cdkUserSearch = ref('');
    $.cdkUserSearchOpen = ref(false);
    $.selectedCdkIds = ref([]);
    $.rechargeShow = ref(false);
    $.rechargeUser = ref(null);
    $.rechargeAmount = ref(0);
    $.rechargeError = ref('');

    // ===== 非 Bootstrap 弹窗 z-index 监听（v-if 控制的弹窗）=====
    var rechargeModalZIndex = null;
    watch($.rechargeShow, function(val) {
        if (val) {
            Vue.nextTick(function() {
                var el = document.getElementById('rechargeModalWrap');
                if (el) rechargeModalZIndex = $.applyModalZIndex(el);
            });
        } else if (rechargeModalZIndex != null) {
            window.ModalZIndexManager.release(rechargeModalZIndex);
            rechargeModalZIndex = null;
        }
    });

    $.filteredUsers = computed(function() {
        var q = $.cdkUserSearch.value.toLowerCase().trim();
        if (!q) return [];
        return $.users.value.filter(function(u) { return u.username.toLowerCase().includes(q); });
    });

    $.addCdkUser = function(user) {
        if (!$.cdkSelectedUsers.value.find(function(u) { return u.id === user.id; })) {
            $.cdkSelectedUsers.value.push({ id: user.id, username: user.username });
        }
        $.cdkUserSearch.value = '';
    };

    $.handleCdkSearchBackspace = function(e) {
        if (!$.cdkUserSearch.value && $.cdkSelectedUsers.value.length) {
            e.preventDefault();
            $.cdkSelectedUsers.value.pop();
        }
    };

    $.handleCdkSearchBlur = function() {
        setTimeout(function() { $.cdkUserSearchOpen.value = false; }, 200);
    };

    $.adminMsgForm = ref({ scope: 'all', uids: [], type: '1', title: '', content: '', link_url: '' });
    $.adminSending = ref(false);

    // 消息管理 - 标签输入框
    $.msgSelectedUsers = ref([]);
    $.msgUserSearch = ref('');
    $.msgUserSearchOpen = ref(false);

    $.filteredMsgUsers = computed(function() {
        var q = $.msgUserSearch.value.toLowerCase().trim();
        if (!q) return [];
        return $.users.value.filter(function(u) { return u.username.toLowerCase().includes(q) && !$.msgSelectedUsers.value.find(function(s) { return s.id === u.id; }); });
    });

    $.addMsgUser = function(user) {
        if (!$.msgSelectedUsers.value.find(function(u) { return u.id === user.id; })) {
            $.msgSelectedUsers.value.push({ id: user.id, username: user.username });
        }
        $.msgUserSearch.value = '';
    };

    $.handleMsgSearchBackspace = function(e) {
        if (!$.msgUserSearch.value && $.msgSelectedUsers.value.length) {
            e.preventDefault();
            $.msgSelectedUsers.value.pop();
        }
    };

    $.handleMsgSearchBlur = function() {
        setTimeout(function() { $.msgUserSearchOpen.value = false; }, 200);
    };

    // CDK 兑换相关
    $.cdkRedeemForm = ref({ code: '', type: 'vm', resource_id: '' });
    $.cdkRedeemStep = ref('input');
    $.cdkRedeemError = ref('');
    $.cdkRedeemMessage = ref('');
    $.cdkVmDropdownOpen = ref(false);

    // 爱快 MAC 分组列表
    $.macGroups = ref([]);
    $.loadMacGroups = async function() {
        try {
            $.macGroups.value = await api('/ikuai/mac-groups');
        } catch (e) {
            $.macGroups.value = [];
        }
    };

    // ==================== 函数 ====================
    // 用户管理
    // 请求序号保护：并发加载时仅采纳最后一次请求的结果，避免旧响应覆盖新列表
    $.userLoadSeq = 0;
    $.loadUsers = async function(page) {
        var seq = ++$.userLoadSeq;
        $.userPage.value = page || 1;
        try {
            var params = { page: $.userPage.value, limit: $.userPageSize.value };
            if ($.userFilter.value.keyword) params.keyword = $.userFilter.value.keyword;
            if ($.userFilter.value.role) params.role = $.userFilter.value.role;
            var res = await api('/users?' + new URLSearchParams(params));
            if (seq !== $.userLoadSeq) return; // 已有更新的请求，丢弃本次结果
            if (Array.isArray(res)) {
                $.users.value = res;
                $.userTotal.value = res.length;
            } else {
                $.users.value = res.rows || res.data || [];
                $.userTotal.value = res.total || 0;
            }
        } catch (e) {
            if (seq !== $.userLoadSeq) return;
            console.error('加载用户失败', e);
        }
    };
    $.searchUsers = function() { $.loadUsers(1); };
    // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
    $.changeUserPageSize = function(size) {
        $.userPageSize.value = size || 20;
        $.loadUsers(1);
    };

    $.createUser = async function() {
        try {
            await api('/users', {
                method: 'POST',
                body: JSON.stringify($.createUserForm.value)
            });
            $.createUserForm.value = { username: '', password: '', role: 'user', email: '', emailVerified: false };
            await $.loadData();
            $.bsModalHide('createUserModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.deleteUser = async function(id) {
        if (await window.customConfirm('确定删除此用户？该用户名下若仍有虚拟机、容器、硬盘、私有网络、余额等资产将无法删除')) {
            try {
                await api('/users/' + id, { method: 'DELETE' });
                $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.editUser = function(u) {
        // 快照锁定当前用户数据，避免编辑期间列表刷新覆盖表单
        $.editUserForm.value = {
            id: u.id,
            username: u.username,
            password: '',
            role: u.role,
            email: u.email || '',
            emailVerified: u.emailVerified || false,
            totp_enabled: u.totp_enabled || false
        };
        $.bsModalShow('editUserModal');
    };

    $.updateUser = async function() {
        try {
            var updateData = {
                username: $.editUserForm.value.username,
                role: $.editUserForm.value.role,
                email: $.editUserForm.value.email,
                emailVerified: $.editUserForm.value.emailVerified
            };
            if ($.editUserForm.value.password) {
                updateData.password = $.editUserForm.value.password;
            }
            await api('/users/' + $.editUserForm.value.id, {
                method: 'PUT',
                body: JSON.stringify(updateData)
            });
            $.editUserForm.value = { id: null, username: '', password: '', role: 'user', email: '', emailVerified: false, totp_enabled: false };
            await $.loadData();
            $.bsModalHide('editUserModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.disableUser2fa = async function(userId) {
        if (!(await window.customConfirm('确定禁用此用户的 2FA 二次验证？'))) return;
        try {
            await api('/admin/user/' + userId + '/disable-2fa', { method: 'POST' });
            $.editUserForm.value.totp_enabled = false;
            await $.loadData();
            alert('2FA 已禁用');
        } catch (e) {
            alert(e.message);
        }
    };

    // SMTP 管理
    $.saveSmtpConfig = async function() {
        try {
            await api('/admin/smtp', {
                method: 'PUT',
                body: JSON.stringify($.smtpConfig.value)
            });
            alert('配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // 邮件队列状态（Redis 异步发送监控，仅展示不影响主流程）
    $.loadEmailQueueStats = async function() {
        try {
            $.emailQueueStats.value = await api('/admin/email-queue/stats');
        } catch (e) {
            console.warn('邮件队列状态加载失败:', e.message || e);
        }
    };

    // PVE 节点配置
    $.loadPveConfig = async function() {
        try {
            var config = await api('/admin/pve/config');
            $.pveConfig.value = config;
        } catch (e) {
            // 端点不存在（旧版本服务）或服务未重启，静默处理不阻塞加载
            console.warn('PVE 配置加载失败（服务可能需要重启）:', e.message || e);
        }
    };

    $.savePveConfig = async function() {
        try {
            await api('/admin/pve/config', { method: 'PUT', body: $.pveConfig.value });
            alert('PVE 配置保存成功');
            await $.loadPveConfig();
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
    };

    $.testSmtpConfig = async function() {
        $.bsModalShow('testEmailModal');
    };

    $.sendTestEmail = async function() {
        try {
            await api('/admin/smtp/test', {
                method: 'POST',
                body: JSON.stringify({ testEmail: $.testEmail.value })
            });
            alert('测试邮件已发送');
            $.bsModalHide('testEmailModal');
        } catch (e) {
            alert(e.message);
        }
    };

    $.saveReminderConfig = async function() {
        try {
            await api('/admin/reminder', {
                method: 'PUT',
                body: JSON.stringify($.reminderConfig.value)
            });
            alert('配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // ==================== 邮件外壳样式（参数化 + 高级自定义 CSS） ====================
    $.emailShellParams = ref([]);
    $.emailShellForm = ref({});
    $.emailShellSaving = ref(false);

    // 加载外壳样式（参数定义 + 当前值）
    $.loadEmailShell = async function() {
        try {
            var res = await api('/admin/email-shell');
            $.emailShellParams.value = res.params || [];
            var form = {};
            (res.params || []).forEach(function(p) {
                var val = res.values && res.values[p.key];
                form[p.key] = (val !== undefined && val !== null && val !== '') ? val : p.default;
            });
            $.emailShellForm.value = form;
        } catch (e) {
            console.warn('邮件外壳样式加载失败:', e.message || e);
        }
    };

    // 参数分组（按 EMAIL_SHELL_PARAMS 的 group 顺序去重）
    $.emailShellGroups = computed(function() {
        var groups = [];
        ($.emailShellParams.value || []).forEach(function(p) {
            if (groups.indexOf(p.group) === -1) groups.push(p.group);
        });
        return groups;
    });

    // 某组参数（custom_css 单独在「高级」区渲染，不在参数网格重复）
    $.emailShellParamsByGroup = function(g) {
        return ($.emailShellParams.value || []).filter(function(p) { return p.group === g && p.type !== 'css'; });
    };

    // 保存外壳样式（服务端校验 + 失效缓存，立即生效）
    $.saveEmailShell = async function() {
        $.emailShellSaving.value = true;
        try {
            var res = await api('/admin/email-shell', {
                method: 'PUT',
                body: JSON.stringify($.emailShellForm.value)
            });
            $.emailShellForm.value = res.values || $.emailShellForm.value;
            alert(res.message || '样式已保存');
        } catch (e) {
            alert(e.message);
        } finally {
            $.emailShellSaving.value = false;
        }
    };

    // 恢复默认外壳样式
    $.resetEmailShell = async function() {
        if (!(await window.customConfirm('确认将邮件外壳样式恢复为系统默认？当前修改将被覆盖。'))) return;
        try {
            var res = await api('/admin/email-shell/reset', { method: 'POST' });
            $.emailShellForm.value = res.values || $.emailShellForm.value;
            alert(res.message || '已恢复默认');
        } catch (e) {
            alert(e.message);
        }
    };

    // 预览外壳样式：用 SMTP 测试模板 + 当前编辑的 shell 参数渲染（未保存也可预览）
    $.previewEmailShell = async function() {
        var tpl = ($.emailTemplates.value || []).find(function(t) { return t.code === 'smtp_test'; });
        if (!tpl) { alert('邮件模板尚未加载'); return; }
        try {
            var res = await api('/admin/email-templates/smtp_test/preview', {
                method: 'POST',
                body: JSON.stringify({ subject: tpl.subject, title: tpl.title, content: tpl.content, shell: $.emailShellForm.value })
            });
            $.emailTemplatePreviewSubject.value = res.subject || '';
            // 外壳 CSS 可信直接保留，正文过 DOMPurify（见 setEmailPreviewHtml 注释）
            $.setEmailPreviewHtml(res.html || '');
            $.emailTemplatePreviewShow.value = true;
        } catch (e) {
            alert(e.message);
        }
    };

    // ==================== 邮件模板管理 ====================
    $.emailTemplates = ref([]);
    $.emailTemplateCategories = ref([]);
    $.emailTemplateGlobalVariables = ref([]);
    $.emailTemplateEditing = ref('');                    // 当前展开编辑的模板 code（'' = 全部收起）
    $.emailTemplateForm = ref({ subject: '', title: '', content: '' });
    $.emailTemplateMode = ref('rich');                   // rich | source
    $.emailTemplateSource = ref('');
    $.emailTemplateSaving = ref(false);
    $.emailTemplatePreviewShow = ref(false);
    $.emailTemplatePreviewHtml = ref('');
    $.emailTemplatePreviewSubject = ref('');

    /**
     * 设置预览 HTML：邮件外壳 <style> 为服务端生成（可信），直接保留；
     * 模板正文（管理员编辑内容）过 DOMPurify 净化后重组。
     * 注：DOMPurify 会硬剥离 <style> 标签（ADD_TAGS 无效），不能整体 sanitize，否则外壳样式全丢。
     */
    $.setEmailPreviewHtml = function(html) {
        var raw = html || '';
        var styleMatch = raw.match(/<style>([\s\S]*?)<\/style>/);
        var shellCss = styleMatch ? styleMatch[1] : '';
        var bodyHtml = raw.replace(/<style>[\s\S]*?<\/style>/, '');
        var safeBody = window.DOMPurify ? DOMPurify.sanitize(bodyHtml, { ADD_ATTR: ['target'] }) : bodyHtml;
        $.emailTemplatePreviewHtml.value = shellCss ? '<style>' + shellCss + '</style>' + safeBody : safeBody;
    };

    // 预览弹窗 z-index 管理（非 Bootstrap 弹窗，参照 rechargeModalWrap 模式）
    var emailTemplatePreviewZIndex = null;
    watch($.emailTemplatePreviewShow, function(val) {
        if (val) {
            Vue.nextTick(function() {
                var el = document.getElementById('emailTemplatePreviewWrap');
                if (el) emailTemplatePreviewZIndex = $.applyModalZIndex(el);
            });
        } else if (emailTemplatePreviewZIndex != null) {
            window.ModalZIndexManager.release(emailTemplatePreviewZIndex);
            emailTemplatePreviewZIndex = null;
        }
    });

    // 加载模板列表（含分类/通用变量定义）
    $.loadEmailTemplates = async function() {
        try {
            var res = await api('/admin/email-templates');
            $.emailTemplates.value = res.templates || [];
            $.emailTemplateCategories.value = res.categories || [];
            $.emailTemplateGlobalVariables.value = res.globalVariables || [];
        } catch (e) {
            console.warn('邮件模板加载失败:', e.message || e);
        }
    };

    // 按分类取模板（模板列表分组展示）
    $.emailTemplatesByCategory = function(catKey) {
        return ($.emailTemplates.value || []).filter(function(t) { return t.category === catKey; });
    };

    // 模板可用变量 = 模板声明变量 + 全局通用变量（site_name/now/site_url）
    $.emailTemplateAllVariables = function(tpl) {
        var list = (tpl.variables || []).slice();
        ($.emailTemplateGlobalVariables.value || []).forEach(function(v) { list.push(v); });
        return list;
    };

    // 初始化 Quill 富文本编辑器（模板编辑区展开后调用；DOM 由 v-if/v-show 控制）
    $.initEmailTemplateQuill = function() {
        $.destroyEmailTemplateQuill();
        var el = document.getElementById('emailTemplateQuill');
        if (!el || typeof Quill === 'undefined') return;
        // 自定义色板：Quill 2 默认色板无纯黑（最深仅 #444444 深灰），且首项为「清除格式」，
        // 用户选「黑色」会点到深灰、选「灰色」会误触清除格式 → 颜色错乱。
        // 显式提供 黑/深灰/中灰/浅灰/白 + 常用色，第一个色块即纯黑，便于准确选择。
        var EMAIL_COLORS = ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff', '#e60000', '#ff9900', '#ffff00', '#008a00', '#0066cc', '#9933ff', '#facccc', '#ffebcc', '#ffffcc', '#cce8cc', '#cce0f5', '#ebd6ff', '#888888', '#444444'];
        var quill = new Quill(el, {
            theme: 'snow',
            placeholder: '编辑邮件正文…',
            modules: {
                toolbar: [
                    [{ header: [2, 3, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ color: EMAIL_COLORS.slice() }, { background: EMAIL_COLORS.slice() }],
                    [{ list: 'ordered' }, { list: 'bullet' }],
                    ['blockquote', 'link', 'code-block'],
                    ['clean']
                ]
            }
        });
        var content = $.emailTemplateForm.value.content || '';
        if (content) {
            try {
                quill.clipboard.dangerouslyPasteHTML(content);
            } catch (e) {
                quill.root.innerHTML = content;
            }
        }
        quill.on('text-change', function() {
            var html = quill.root.innerHTML;
            $.emailTemplateForm.value.content = html;
            $.emailTemplateSource.value = html;
        });
        window.__emailTemplateQuill = quill;
        $.applyEmailToolbarTitles();
    };

    // 工具栏按钮/下拉中文提示（Quill 默认只有图标，悬浮 title 说明功能）
    $.applyEmailToolbarTitles = function() {
        try {
            var tb = document.querySelector('.email-template-quill-wrap .ql-toolbar');
            if (!tb) return;
            // 普通按钮
            var BTN_TITLES = {
                '.ql-bold': '加粗',
                '.ql-italic': '斜体',
                '.ql-underline': '下划线',
                '.ql-strike': '删除线',
                '.ql-blockquote': '引用',
                '.ql-link': '插入链接',
                '.ql-code-block': '代码块',
                '.ql-clean': '清除格式',
                '.ql-list[value="ordered"]': '有序列表',
                '.ql-list[value="bullet"]': '无序列表'
            };
            Object.keys(BTN_TITLES).forEach(function(sel) {
                var el = tb.querySelector(sel);
                if (el) el.setAttribute('title', BTN_TITLES[sel]);
            });
            // 下拉选择器（标题/文字颜色/背景颜色）
            var PICKER_TITLES = {
                '.ql-header': '标题级别',
                '.ql-color': '文字颜色',
                '.ql-background': '背景颜色'
            };
            Object.keys(PICKER_TITLES).forEach(function(sel) {
                var el = tb.querySelector(sel + ' .ql-picker-label');
                if (el) el.setAttribute('title', PICKER_TITLES[sel]);
            });
            // 下拉选项提示（色板/标题选项在 Quill 初始化时已生成（隐藏），直接补一次 title；
            // MutationObserver 兜底后续新增节点）
            if (!tb.__qlPickerTitleBound) {
                tb.__qlPickerTitleBound = true;
                var applyItemTitles = function() {
                    tb.querySelectorAll('.ql-header .ql-picker-options .ql-picker-item').forEach(function(item) {
                        if (!item.getAttribute('title')) {
                            var v = item.getAttribute('data-value');
                            item.setAttribute('title', v === 'false' || v === null ? '正文' : '标题 ' + v);
                        }
                    });
                    tb.querySelectorAll('.ql-color .ql-picker-options .ql-picker-item, .ql-background .ql-picker-options .ql-picker-item').forEach(function(item) {
                        if (!item.getAttribute('title')) {
                            var v = item.getAttribute('data-value');
                            item.setAttribute('title', v ? '颜色 ' + v : '清除颜色格式');
                        }
                    });
                };
                applyItemTitles();
                var mo = new MutationObserver(function() {
                    applyItemTitles();
                });
                mo.observe(tb, { childList: true, subtree: true });
            }
        } catch (e) {
            console.warn('工具栏提示设置失败:', e.message);
        }
    };

    $.destroyEmailTemplateQuill = function() {
        if (window.__emailTemplateQuill) {
            try { window.__emailTemplateQuill = null; } catch (e) {}
        }
    };

    // 展开/收起模板编辑区（一次只展开一个）
    $.toggleEmailTemplateEdit = async function(code) {
        if ($.emailTemplateEditing.value === code) {
            $.emailTemplateEditing.value = '';
            $.destroyEmailTemplateQuill();
            return;
        }
        var tpl = ($.emailTemplates.value || []).find(function(t) { return t.code === code; });
        if (!tpl) return;
        $.emailTemplateEditing.value = code;
        $.emailTemplateForm.value = { subject: tpl.subject || '', title: tpl.title || '', content: tpl.content || '' };
        $.emailTemplateSource.value = tpl.content || '';
        $.emailTemplateMode.value = 'rich';
        await Vue.nextTick();
        $.initEmailTemplateQuill();
    };

    // 富文本/源码模式切换（双向同步，DOM 用 v-show 保留不销毁）
    $.switchEmailTemplateMode = function(mode) {
        if (mode === $.emailTemplateMode.value) return;
        var quill = window.__emailTemplateQuill;
        if (mode === 'source') {
            if (quill) $.emailTemplateSource.value = quill.root.innerHTML;
        } else {
            // 切回富文本：把源码写回编辑器
            if (quill && $.emailTemplateSource.value) {
                try {
                    var delta = quill.clipboard.convert({ html: $.emailTemplateSource.value });
                    quill.setContents(delta, 'silent');
                } catch (e) {}
            }
        }
        $.emailTemplateMode.value = mode;
    };

    // 插入变量到光标处（富文本用 Quill 选区，源码用 textarea 选区）
    $.insertEmailTemplateVar = function(name) {
        var varStr = '{' + name + '}';
        if ($.emailTemplateMode.value === 'source') {
            var ta = document.getElementById('emailTemplateSource');
            if (!ta) return;
            var start = ta.selectionStart;
            var end = ta.selectionEnd;
            var val = ta.value;
            ta.value = val.slice(0, start) + varStr + val.slice(end);
            $.emailTemplateSource.value = ta.value;
            ta.selectionStart = ta.selectionEnd = start + varStr.length;
            ta.focus();
        } else {
            var quill = window.__emailTemplateQuill;
            if (!quill) return;
            var sel = quill.getSelection();
            var index = sel ? sel.index : quill.getLength();
            quill.insertText(index, varStr);
            quill.setSelection(index + varStr.length);
            quill.focus();
        }
    };

    // 保存模板（当前模式内容 → PUT → 更新本地列表）
    $.saveEmailTemplate = async function() {
        var code = $.emailTemplateEditing.value;
        if (!code) return;
        var form = $.emailTemplateForm.value;
        if ($.emailTemplateMode.value === 'source') {
            form.content = $.emailTemplateSource.value;
        } else if (window.__emailTemplateQuill) {
            form.content = window.__emailTemplateQuill.root.innerHTML;
        }
        $.emailTemplateSaving.value = true;
        try {
            var res = await api('/admin/email-templates/' + code, {
                method: 'PUT',
                body: JSON.stringify(form)
            });
            var tpl = ($.emailTemplates.value || []).find(function(t) { return t.code === code; });
            if (tpl && res.template) {
                tpl.subject = res.template.subject;
                tpl.title = res.template.title;
                tpl.content = res.template.content;
                tpl.version = res.template.version;
                tpl.updated_at = res.template.updated_at;
            }
            alert(res.message || '模板已保存');
        } catch (e) {
            alert(e.message);
        } finally {
            $.emailTemplateSaving.value = false;
        }
    };

    // 预览：用示例变量值渲染完整邮件（服务端渲染，复用渲染引擎）
    // 注意：必须带上外壳样式表单（emailShellForm），否则未保存的样式参数（如正文文字色改黑）不生效，预览与发送不一致
    $.previewEmailTemplate = async function() {
        var code = $.emailTemplateEditing.value;
        if (!code) return;
        var form = $.emailTemplateForm.value;
        if ($.emailTemplateMode.value === 'source') {
            form.content = $.emailTemplateSource.value;
        } else if (window.__emailTemplateQuill) {
            form.content = window.__emailTemplateQuill.root.innerHTML;
        }
        try {
            var res = await api('/admin/email-templates/' + code + '/preview', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, form, { shell: $.emailShellForm.value }))
            });
            $.emailTemplatePreviewSubject.value = res.subject || '';
            // 外壳 CSS 可信直接保留，正文过 DOMPurify（见 setEmailPreviewHtml 注释）
            $.setEmailPreviewHtml(res.html || '');
            $.emailTemplatePreviewShow.value = true;
        } catch (e) {
            alert(e.message);
        }
    };

    // 恢复默认（常量注册表覆盖；正在编辑时同步刷新表单）
    $.resetEmailTemplate = async function(code) {
        var tpl = ($.emailTemplates.value || []).find(function(t) { return t.code === code; });
        if (!(await window.customConfirm('确认将「' + (tpl ? tpl.name : code) + '」恢复为系统默认模板？当前修改将被覆盖。'))) return;
        try {
            var res = await api('/admin/email-templates/' + code + '/reset', {
                method: 'POST'
            });
            if ($.emailTemplateEditing.value === code) {
                $.emailTemplateForm.value = { subject: (res.template && res.template.subject) || '', title: (res.template && res.template.title) || '', content: (res.template && res.template.content) || '' };
                $.emailTemplateSource.value = (res.template && res.template.content) || '';
                Vue.nextTick(function() { $.initEmailTemplateQuill(); });
            }
            await $.loadEmailTemplates();
            alert(res.message || '已恢复默认');
        } catch (e) {
            alert(e.message);
        }
    };

    // 站点配置
    $.loadSiteConfig = async function() {
        try {
            var res = await api('/admin/site/config');
            $.siteConfigForm.value = {
                name: res.name || '',
                logo_text: res.logo_text || '',
                login_title: res.login_title || '',
                register_enabled: !!res.register_enabled
            };
            // 同步模板样式选择（站点全局默认值）
            if (res.template) $.templateStyle.value = res.template;
        } catch (e) {
            console.error('加载站点配置失败:', e);
        }
    };

    // 模板样式：点击卡片实时预览（仅改 documentElement 属性，不写 localStorage，不保存）
    $.selectTemplate = function(v) {
        if (v !== 'default' && v !== 'saas') return;
        $.templateStyle.value = v;
        document.documentElement.setAttribute('data-template', v);
        if (document.body) document.body.setAttribute('data-template', v);
    };

    // 模板样式：保存站点全局默认
    $.saveTemplateStyle = async function() {
        $.templateStyleSaving.value = true;
        try {
            await api('/admin/site/config', {
                method: 'PUT',
                body: JSON.stringify({ template: $.templateStyle.value })
            });
            alert('模板样式保存成功，已全局生效');
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
        $.templateStyleSaving.value = false;
    };

    $.saveSiteConfig = async function() {
        $.siteConfigSaving.value = true;
        try {
            await api('/admin/site/config', {
                method: 'PUT',
                body: JSON.stringify($.siteConfigForm.value)
            });
            alert('站点配置保存成功');
            // 保存后刷新 LOGO 显示
            $.siteLogoText.value = $.siteConfigForm.value.logo_text || 'PVE 面板';
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
        $.siteConfigSaving.value = false;
    };

    // 一键清除所有缓存（Redis + 内存），带二次确认
    $.clearAllCache = async function() {
        var confirmed = await window.customConfirm(
            '⚠️ 危险操作：清除所有缓存\n' +
            '此操作将立即清除以下数据：\n' +
            '· 用户列表 / 套餐列表缓存\n' +
            '· 设备状态 / 用户活跃状态缓存\n' +
            '· JWT 黑名单（已登出的令牌将恢复可用）\n' +
            '· 未读消息数 / 用户资料缓存\n' +
            '· 站点配置缓存\n' +
            '· 验证码 / 找回密码 Token\n' +
            '· 登录限速计数器\n' +
            '确认要继续吗？'
        );
        if (!confirmed) return;
        $.cacheClearing.value = true;
        try {
            await api('/admin/cache/clear', { method: 'POST' });
            alert('所有缓存已清除');
        } catch (e) {
            alert('清除失败: ' + (e.message || '未知错误'));
        }
        $.cacheClearing.value = false;
    };

    // Redis 配置
    $.loadRedisConfig = async function() {
        try {
            var config = await api('/admin/redis/config');
            $.redisConfig.value = config;
        } catch (e) {
            console.warn('Redis 配置加载失败（服务可能需要重启）:', e.message || e);
        }
    };

    $.saveRedisConfig = async function() {
        $.redisConfigSaving.value = true;
        try {
            await api('/admin/redis/config', { method: 'PUT', body: $.redisConfig.value });
            alert('Redis 配置保存成功');
            await $.loadRedisConfig();
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
        $.redisConfigSaving.value = false;
    };

    // 用户日志上限配置（用户操作按用户维度 / 后台操作按全站维度）
    $.loadLogConfig = async function() {
        try {
            var config = await api('/admin/log/config');
            $.logConfigForm.value = { keep_count: config.keep_count || 5000, keep_admin_count: config.keep_admin_count || 5000 };
        } catch (e) {
            console.warn('日志配置加载失败:', e.message || e);
        }
    };

    $.saveLogConfig = async function() {
        $.logConfigSaving.value = true;
        try {
            await api('/admin/log/config', { method: 'PUT', body: $.logConfigForm.value });
            alert('日志配置保存成功');
            await $.loadLogConfig();
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
        $.logConfigSaving.value = false;
    };

    // Redis 测试连接
    $.testRedisConfig = async function() {
        $.redisTesting.value = true;
        try {
            var result = await api('/admin/redis/test', { method: 'POST', body: $.redisConfig.value });
            if (result.success) {
                alert(result.message);
            } else {
                alert(result.message);
            }
        } catch (e) {
            alert('测试失败: ' + (e.message || '未知错误'));
        }
        $.redisTesting.value = false;
    };

    // 快照配置
    $.loadSnapshotConfig = async function() {
        try {
            var data = await api('/admin/snapshot-config');
            if (data) {
                $.snapshotConfig.value = Object.assign({ max_per_vm: 5, daily_create_limit: 20, daily_restore_limit: 10 }, data);
            }
        } catch (e) {
            console.error('加载快照配置失败', e);
        }
    };

    $.saveSnapshotConfig = async function() {
        try {
            await api('/admin/snapshot-config', {
                method: 'PUT',
                body: JSON.stringify($.snapshotConfig.value)
            });
            alert('快照配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // 存储列表
    $.loadStorageList = async function() {
        try {
            var data = await api('/admin/storage');
            $.storageList.value = data || [];
            if ($.storageList.value.length > 0 && !$.backupForm.value.storage) {
                $.backupForm.value.storage = $.storageList.value[0].id;
            }
        } catch (e) {
            console.error('加载存储列表失败', e);
        }
    };

    // 备份配置
    $.loadBackupConfig = async function() {
        try {
            var data = await api('/admin/backup-config');
            if (data) {
                $.backupConfigForm.value = Object.assign({ default_storage: 'local', max_per_vm: 3, daily_limit: 3 }, data);
            }
        } catch (e) {
            console.error('加载备份配置失败', e);
        }
    };

    $.saveBackupConfig = async function() {
        try {
            await api('/admin/backup-config', {
                method: 'PUT',
                body: JSON.stringify($.backupConfigForm.value)
            });
            alert('备份配置已保存');
        } catch (e) {
            alert(e.message);
        }
    };

    // CDK 管理
    $.generateCdkBatch = async function() {
        try {
            var expires = toLocalDateTimeStr($.cdkForm.value.expires_at);
            var result = await api('/admin/cdk/batch-generate', {
                method: 'POST',
                body: JSON.stringify(Object.assign({}, $.cdkForm.value, {
                    target_user_ids: $.cdkSelectedUsers.value.length > 0 ? $.cdkSelectedUsers.value.map(function(u) { return u.id; }) : null,
                    expires_at: expires
                }))
            });
            $.cdkResult.value = result.codes;
            $.cdkResultBatchId.value = result.batch_id;
            $.cdkSelectedUsers.value = [];
            $.cdkUserSearch.value = '';
            $.bsModalShow('cdkResultModal');
            $.loadData();
        } catch (e) {
            alert(e.message);
        }
    };

    $.copyCdkCode = function(code) {
        navigator.clipboard.writeText(code);
        alert('已复制');
    };

    $.copyBatchCodes = async function() {
        var codes = $.cdkResult.value.map(function(c) { return c.code; }).join('\n');
        await navigator.clipboard.writeText(codes);
        alert('已复制全部兑换码');
    };

    $.exportCdkCsv = async function(batchId) {
        try {
            var token = await ensureValidToken();
            var url = '/api/admin/cdk/export';
            if (batchId) url += '?batch_id=' + batchId;
            var response = await fetch(url, {
                headers: { 'Authorization': 'Bearer ' + (token || '') }
            });
            if (!response.ok) {
                var data = await response.json();
                throw new Error(data.error || '导出失败');
            }
            var blob = await response.blob();
            var link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = 'cdk-codes-' + Date.now() + '.csv';
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (e) {
            alert(e.message);
        }
    };

    $.cleanupCdk = async function() {
        if (await window.customConfirm('确定要清理所有已使用和已过期的 CDK 吗？')) {
            try {
                await api('/admin/cdk/cleanup', { method: 'POST' });
                alert('清理完成');
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.deleteCdk = async function(id) {
        if (await window.customConfirm('确定要删除这个 CDK 吗？')) {
            try {
                await api('/admin/cdk/' + id, { method: 'DELETE' });
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.batchDeleteCdk = async function() {
        var ids = $.selectedCdkIds.value;
        if (ids.length === 0) return;
        if (await window.customConfirm('确定要删除选中的 ' + ids.length + ' 个 CDK 吗？')) {
            try {
                await api('/admin/cdk/batch-delete', {
                    method: 'POST',
                    body: JSON.stringify({ ids: ids })
                });
                $.selectedCdkIds.value = [];
                await $.loadData();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    $.toggleSelectAllCdk = function() {
        if ($.selectedCdkIds.value.length === $.cdkList.value.length) {
            $.selectedCdkIds.value = [];
        } else {
            $.selectedCdkIds.value = $.cdkList.value.map(function(c) { return c.id; });
        }
    };

    // 消息管理
    $.sendAdminMessage = async function() {
        var content = $.adminMsgForm.value.content ? $.adminMsgForm.value.content.trim() : '';
        if (!content) {
            return alert('消息内容不能为空，请填写通知正文');
        }
        if (content.length > 5000) {
            return alert('内容超出字数上限，请精简文案或拆分发送');
        }
        $.adminSending.value = true;
        try {
            $.adminMsgForm.value.uids = $.msgSelectedUsers.value.map(function(u) { return u.id; });
            await api('/admin/messages/send', {
                method: 'POST',
                body: JSON.stringify($.adminMsgForm.value)
            });
            $.adminMsgForm.value = { scope: 'all', uids: [], type: '1', title: '', content: '', link_url: '' };
            $.msgSelectedUsers.value = [];
            $.msgUserSearch.value = '';
            alert('消息发送成功');
        } catch (e) {
            alert(e.message);
        } finally {
            $.adminSending.value = false;
        }
    };

    $.deleteMessage = async function(id) {
        if (await window.customConfirm('确定要删除这条消息吗？')) {
            try {
                await api('/messages/' + id, { method: 'DELETE' });
                $.bsModalHide('messageDetailModal');
                $.loadUnreadCount();
            } catch (e) {
                alert(e.message);
            }
        }
    };

    // ==================== initAdmin ====================
    $.initAdmin = function() {
        // 无特殊生命周期逻辑
    };

    // 支付配置
    $.payConfig = ref({ base_url: '', pid: '', md5_key: '', v2_public_key: '', v2_private_key: '', v1_enabled: true, v2_enabled: false, alipay_enabled: true, wxpay_enabled: true, min_amount: 0.01, max_amount: 999999.99 });

    $.loadPayConfig = async function() {
        try {
            var config = await api('/admin/pay/config');
            $.payConfig.value = config;
        } catch (e) {
            console.error('加载支付配置失败', e);
        }
    };

    $.savePayConfig = async function() {
        try {
            await api('/admin/pay/config', { method: 'PUT', body: $.payConfig.value });
            alert('支付配置保存成功！');
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        }
    };

    // UApiPro IP 归属地配置
    $.uapiproConfig = ref({ enabled: false, api_key: '' });
    $.uapiproSaving = ref(false);
    $.uapiproTesting = ref(false);
    $.uapiproTestIp = ref('8.8.8.8');
    $.uapiproTestResult = ref(null);
    $.uapiproTestError = ref('');

    $.loadUapiproConfig = async function() {
        try {
            var config = await api('/admin/uapipro/config');
            $.uapiproConfig.value = config;
        } catch (e) {
            console.error('加载 UApiPro 配置失败', e);
        }
    };

    $.saveUapiproConfig = async function() {
        $.uapiproSaving.value = true;
        try {
            await api('/admin/uapipro/config', { method: 'PUT', body: $.uapiproConfig.value });
            alert('UApiPro 配置保存成功！');
            await $.loadUapiproConfig();
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        } finally {
            $.uapiproSaving.value = false;
        }
    };

    $.testUapiproIpQuery = async function() {
        var ip = ($.uapiproTestIp.value || '').trim();
        if (!ip) {
            $.uapiproTestError.value = '请输入要查询的 IP 地址';
            return;
        }
        $.uapiproTesting.value = true;
        $.uapiproTestError.value = '';
        $.uapiproTestResult.value = null;
        try {
            var result = await api('/admin/uapipro/test', { method: 'POST', body: { ip: ip } });
            $.uapiproTestResult.value = result;
        } catch (e) {
            $.uapiproTestError.value = e.message || '查询失败';
        } finally {
            $.uapiproTesting.value = false;
        }
    };

    // ==================== 安全防护·限速设置 ====================
    $.rateLimitConfig = ref({ master_enabled: true, categories: [] });
    $.rateLimitSaving = ref(false);

    // 秒 → 显示值+单位（整小时→小时，整分钟→分钟，否则秒）；时间窗统一以秒存储
    function secToWindowUI(sec) {
        if (sec % 3600 === 0) return { windowValue: sec / 3600, windowUnit: 'hour' };
        if (sec % 60 === 0) return { windowValue: sec / 60, windowUnit: 'min' };
        return { windowValue: sec, windowUnit: 'sec' };
    }
    // 显示值+单位 → 秒
    function windowUIToSec(value, unit) {
        if (unit === 'hour') return value * 3600;
        if (unit === 'min') return value * 60;
        return value;
    }

    $.loadRateLimitConfig = async function() {
        try {
            var data = await api('/admin/rate-limit/config');
            // 注入 windowValue/windowUnit 供表单编辑（原始秒值保留在 windowSec）
            data.categories.forEach(function(cat) {
                cat.rules.forEach(function(rule) {
                    var ui = secToWindowUI(rule.windowSec);
                    rule.windowValue = ui.windowValue;
                    rule.windowUnit = ui.windowUnit;
                });
            });
            $.rateLimitConfig.value = data;
        } catch (e) {
            console.error('加载限速配置失败', e);
        }
    };

    $.saveRateLimitConfig = async function(restoreDefault) {
        if ($.rateLimitSaving.value) return;
        var cfg = $.rateLimitConfig.value;
        // 前端兜底校验（与后端一致：次数 1-10000，时间窗 1-86400 秒）
        for (var i = 0; i < cfg.categories.length; i++) {
            var cat = cfg.categories[i];
            for (var j = 0; j < cat.rules.length; j++) {
                var rule = cat.rules[j];
                var max = parseInt(rule.max);
                var windowSec = windowUIToSec(parseInt(rule.windowValue) || 0, rule.windowUnit);
                if (!Number.isInteger(max) || max < 1 || max > 10000) {
                    alert('规则「' + rule.label + '」限速次数须为 1-10000 的整数');
                    return;
                }
                if (!Number.isInteger(windowSec) || windowSec < 1 || windowSec > 86400) {
                    alert('规则「' + rule.label + '」时间窗须在 1 秒 ~ 24 小时之间');
                    return;
                }
                rule.max = max;
                rule.windowSec = windowSec;
            }
        }
        $.rateLimitSaving.value = true;
        try {
            // 严格 === true 判断：按钮事件绑定会传入 MouseEvent，!!restoreDefault 会把普通保存误判为恢复默认
            var isRestoreDefault = restoreDefault === true;
            await api('/admin/rate-limit/config', {
                method: 'PUT',
                body: JSON.stringify({ master_enabled: !!cfg.master_enabled, categories: cfg.categories, restore_default: isRestoreDefault })
            });
            alert('限速配置保存成功');
            await $.loadRateLimitConfig();
        } catch (e) {
            alert('保存失败: ' + (e.message || '未知错误'));
        } finally {
            $.rateLimitSaving.value = false;
        }
    };

    // 恢复默认：将每条规则与总开关还原为服务端下发的 defaults（与系统内置一致）
    $.resetRateLimitConfig = async function() {
        if ($.rateLimitSaving.value) return;
        var cfg = $.rateLimitConfig.value;
        if (!cfg.categories || !cfg.categories.length) return;
        cfg.master_enabled = true;
        cfg.categories.forEach(function(cat) {
            cat.rules.forEach(function(rule) {
                rule.enabled = rule.defaults.enabled;
                rule.max = rule.defaults.max;
                rule.windowSec = rule.defaults.windowSec;
                var ui = secToWindowUI(rule.windowSec);
                rule.windowValue = ui.windowValue;
                rule.windowUnit = ui.windowUnit;
            });
        });
        // 恢复默认：传 restore_default 标记，后端审计详情按「恢复默认参数」记录
        await $.saveRateLimitConfig(true);
    };

    // 财务管理 - 交易流水
    $.financeFilter = ref({ start_time: '', end_time: '', pay_method: '', trade_type: '', order_no: '' });    $.transactionList = ref([]);
    $.transactionTotal = ref(0);
    $.financePage = ref(1);
    $.financePageSize = ref(20);

    $.loadTransactions = async function(page) {
        $.financePage.value = page || 1;
        try {
            var params = { page: $.financePage.value, limit: $.financePageSize.value };
            var f = $.financeFilter.value;
            if (f.start_time) params.start_time = f.start_time;
            if (f.end_time) params.end_time = f.end_time;
            if (f.pay_method) params.pay_method = f.pay_method;
            if (f.trade_type) params.trade_type = f.trade_type;
            if (f.order_no) params.order_no = f.order_no;
            var res = await api('/admin/transactions?' + new URLSearchParams(params));
            $.transactionList.value = res.data || [];
            $.transactionTotal.value = res.total || 0;
        } catch (e) {
            console.error('加载流水失败', e);
        }
    };
    // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
    $.changeFinancePageSize = function(size) {
        $.financePageSize.value = size || 20;
        $.loadTransactions(1);
    };

    $.exportTransactions = async function() {
        try {
            var f = $.financeFilter.value;
            var params = {};
            if (f.start_time) params.start_time = f.start_time;
            if (f.end_time) params.end_time = f.end_time;
            if (f.pay_method) params.pay_method = f.pay_method;
            if (f.trade_type) params.trade_type = f.trade_type;
            if (f.order_no) params.order_no = f.order_no;
            var token = await ensureValidToken();
            var resp = await fetch('/api/admin/transactions/export?' + new URLSearchParams(params), {
                headers: { 'Authorization': 'Bearer ' + (token || '') }
            });
            if (!resp.ok) {
                var err = await resp.json().catch(function() { return { error: '导出失败' }; });
                throw new Error(err.error || '导出失败');
            }
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'transaction_history.csv';
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            alert('导出失败: ' + (e.message || ''));
        }
    };

    // 订单管理
    $.orders = Vue.ref([]);
    $.orderPage = Vue.ref(1);
    $.orderPageSize = Vue.ref(20);
    $.orderTotal = Vue.ref(0);
    $.orderFilter = Vue.reactive({ order_no: '', type: '', status: '', start_time: '', end_time: '' });

    $.loadOrders = async function(page) {
        page = page || 1;
        $.orderPage.value = page;
        try {
            var params = new URLSearchParams();
            params.set('page', page);
            params.set('limit', String($.orderPageSize.value));
            if ($.orderFilter.order_no) params.set('order_no', $.orderFilter.order_no);
            if ($.orderFilter.type) params.set('type', $.orderFilter.type);
            if ($.orderFilter.status) params.set('status', $.orderFilter.status);
            if ($.orderFilter.start_time) params.set('start_time', $.orderFilter.start_time);
            if ($.orderFilter.end_time) params.set('end_time', $.orderFilter.end_time);
            var data = await api('/admin/orders?' + params.toString());
            $.orders.value = data.rows || [];
            $.orderTotal.value = data.total || 0;
        } catch(e) { console.error('加载订单失败', e); }
    };
    // 每页条数切换：从第 1 页重新加载（pv-pagination 事件回调）
    $.changeOrderPageSize = function(size) {
        $.orderPageSize.value = size || 20;
        $.loadOrders(1);
    };

    $.exportOrders = async function() {
        try {
            var params = new URLSearchParams();
            if ($.orderFilter.order_no) params.set('order_no', $.orderFilter.order_no);
            if ($.orderFilter.type) params.set('type', $.orderFilter.type);
            if ($.orderFilter.status) params.set('status', $.orderFilter.status);
            if ($.orderFilter.start_time) params.set('start_time', $.orderFilter.start_time);
            if ($.orderFilter.end_time) params.set('end_time', $.orderFilter.end_time);
            var token = await ensureValidToken();
            var resp = await fetch('/api/admin/orders/export?' + params.toString(), {
                headers: { 'Authorization': 'Bearer ' + (token || '') }
            });
            if (!resp.ok) { alert('导出失败'); return; }
            var blob = await resp.blob();
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'orders.csv';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch(e) { console.error('导出订单失败', e); }
    };

    $.searchOrders = function() { $.loadOrders(1); };

    // ==================== 系统切换日志 ====================
    $.osSwitchLogList = Vue.ref([]);
    $.osSwitchLogTotal = Vue.ref(0);
    $.osSwitchLogPage = Vue.ref(1);
    $.osSwitchLogFilter = Vue.reactive({ status: '', vm_id: '', user_id: '', username: '', keyword: '', start_date: '', end_date: '' });
    $.osSwitchLogSelected = Vue.reactive([]);
    $.osSwitchLogDetail = Vue.ref(null);
    const OS_SWITCH_LOG_LIMIT = 20;

    $.loadOsSwitchLogs = async function(page) {
        page = page || 1;
        $.osSwitchLogPage.value = page;
        try {
            // 分页大小跟随日志中心统一设置（20/50/100，admin-logs.js 未加载时回退常量）
            var pageSize = ($.logPageSize && $.logPageSize.value) ? $.logPageSize.value : OS_SWITCH_LOG_LIMIT;
            var params = '?page=' + page + '&limit=' + pageSize;
            if ($.osSwitchLogFilter.status) params += '&status=' + encodeURIComponent($.osSwitchLogFilter.status);
            if ($.osSwitchLogFilter.vm_id) params += '&vm_id=' + encodeURIComponent($.osSwitchLogFilter.vm_id);
            if ($.osSwitchLogFilter.user_id) params += '&user_id=' + encodeURIComponent($.osSwitchLogFilter.user_id);
            if ($.osSwitchLogFilter.username) params += '&username=' + encodeURIComponent($.osSwitchLogFilter.username);
            var osKw = ($.osSwitchLogFilter.keyword || '').trim();
            if (osKw) params += '&keyword=' + encodeURIComponent(osKw);
            if ($.osSwitchLogFilter.start_date) params += '&start_date=' + encodeURIComponent($.osSwitchLogFilter.start_date);
            if ($.osSwitchLogFilter.end_date) params += '&end_date=' + encodeURIComponent($.osSwitchLogFilter.end_date);
            var res = await api('/admin/os-switch-logs' + params);
            if (res && res.success) {
                $.osSwitchLogList.value = res.data || [];
                $.osSwitchLogTotal.value = res.total || 0;
                $.osSwitchLogSelected.value = [];
            } else {
                $.osSwitchLogList.value = [];
                $.osSwitchLogTotal.value = 0;
            }
        } catch (e) {
            console.error('[os-switch-logs] 加载失败', e);
            $.osSwitchLogList.value = [];
            $.osSwitchLogTotal.value = 0;
        }
    };

    $.resetOsSwitchLogFilter = function() {
        $.osSwitchLogFilter.status = '';
        $.osSwitchLogFilter.vm_id = '';
        $.osSwitchLogFilter.user_id = '';
        $.osSwitchLogFilter.username = '';
        $.osSwitchLogFilter.keyword = '';
        $.osSwitchLogFilter.start_date = '';
        $.osSwitchLogFilter.end_date = '';
        $.loadOsSwitchLogs(1);
    };

    // 全选/取消
    $.toggleAllOsSwitchLog = function(e) {
        if (e.target.checked) {
            $.osSwitchLogSelected.value = $.osSwitchLogList.value.map(function(r) { return r.id; });
        } else {
            $.osSwitchLogSelected.value = [];
        }
    };
    $.toggleOneOsSwitchLog = function(id) {
        var idx = $.osSwitchLogSelected.value.indexOf(id);
        if (idx > -1) {
            $.osSwitchLogSelected.value.splice(idx, 1);
        } else {
            $.osSwitchLogSelected.value.push(id);
        }
    };
    $.isAllOsSwitchLogSelected = function() {
        return $.osSwitchLogList.value.length > 0 && $.osSwitchLogSelected.value.length === $.osSwitchLogList.value.length;
    };

    $.showOsSwitchLogDetail = function(row) {
        $.osSwitchLogDetail.value = row;
        var el = document.getElementById('osSwitchLogDetailModal');
        if (el) {
            var modal = new bootstrap.Modal(el);
            modal.show();
        }
    };

    $.deleteOsSwitchLog = async function(id) {
        if (!(await window.customConfirm('确认删除日志 #' + id + '？'))) return;
        try {
            var res = await api('/admin/os-switch-logs/' + id, { method: 'DELETE' });
            if (res && res.success) {
                $.loadOsSwitchLogs($.osSwitchLogPage.value);
            } else {
                alert(res.error || '删除失败');
            }
        } catch (e) {
            alert('删除请求失败');
        }
    };

    $.batchDeleteOsSwitchLog = async function() {
        var ids = $.osSwitchLogSelected.value;
        if (ids.length === 0) { alert('请先选择要删除的日志'); return; }
        if (!(await window.customConfirm('确认删除选中的 ' + ids.length + ' 条日志？'))) return;
        try {
            var res = await api('/admin/os-switch-logs/batch-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: ids })
            });
            if (res && res.success) {
                alert(res.message || '已删除');
                $.osSwitchLogSelected.value = [];
                $.loadOsSwitchLogs($.osSwitchLogPage.value);
            } else {
                alert(res.error || '批量删除失败');
            }
        } catch (e) {
            alert('请求失败');
        }
    };

    $.clearAllOsSwitchLog = async function() {
        if (!(await window.customConfirm('⚠️ 高危操作！确认清空所有切换日志（运行中和需介入的日志将被保留）？'))) return;
        var confirmStr = await window.customPrompt('请输入 CLEAR_ALL_OS_SWITCH_LOGS 确认清空：');
        if (confirmStr !== 'CLEAR_ALL_OS_SWITCH_LOGS') { alert('确认串不正确'); return; }
        try {
            var res = await api('/admin/os-switch-logs/clear', {
                method: 'POST',
                body: JSON.stringify({ confirm: confirmStr })
            });
            if (res && res.success) {
                alert(res.message || '已清空');
                $.loadOsSwitchLogs(1);
            } else {
                alert(res.error || '清空失败');
            }
        } catch (e) {
            alert('请求失败');
        }
    };
})();
