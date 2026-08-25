var $ = window.__admin;

// 全局工具函数：到期时间显示（在 setup 之前定义，确保模板编译时可用）
$.daysUntilExpire = function(expireTime) {
    if (!expireTime) return '';
    var diff = new Date(expireTime) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return window.__i18n.t('dash.disk.statusExpired');
    return window.__i18n.t('dash.remainPrefix') + days + window.__i18n.t('common.days');
};
$.getExpiryColor = function(expireTime) {
    if (!expireTime) return '';
    var diff = new Date(expireTime) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return 'text-danger';
    if (days <= 3) return 'text-danger';
    if (days <= 7) return 'text-warning';
    return 'text-success';
};
// 备份中/恢复中/切换中 徽标样式与文案（Admin 列表服用，数据字段与用户端一致）
$.vmBusyClass = function(v) {
    if (!v || !v._busy || !v.busyType) return '';
    if (v.busyType === 'switch') return 'tag-switch';
    if (v.busyType === 'backup') return 'tag-backup';
    if (v.busyType === 'restore') return 'tag-restore';
    return '';
};
$.vmBusyText = function(v) {
    if (!v || !v._busy || !v.busyType) return '';
    if (v.busyType === 'switch') return window.__i18n.t('admin.osswitchlog.status.running');
    if (v.busyType === 'backup') return window.__i18n.t('dash.busy.backup');
    if (v.busyType === 'restore') return window.__i18n.t('dash.busy.restore');
    return '';
};
// 操作被锁定时点击统一提示
$.vmBusyBlock = function(v) {
    if (!v || !v._busy || !v.busyType) return;
    var label = $.vmBusyText(v) || window.__i18n.t('common.actions');
    alert(label + window.__i18n.t('dash.busy.waitSuffix'));
    return false;
};

var App = {
    template: '#appTemplate',
    setup: function() {
        // 兜底初始化：确保关键 ref 在模板渲染前一定存在（防止异步加载时序导致 undefined 崩溃）
        if (!$.vmIpForm) $.vmIpForm = Vue.ref({ ip_mode: 'dhcp', ip: '' });
        if (!$.lxcIpForm) $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
        if (!$.confirmState) $.confirmState = Vue.ref({ vmId: null, action: null });
        if (!$.lxcConfirmState) $.lxcConfirmState = Vue.ref({ ctId: null, action: null });
        if (!$.snapshotForm) $.snapshotForm = Vue.ref({ name: '', description: '' });
        if (!$.lxcSnapshotForm) $.lxcSnapshotForm = Vue.ref({ name: '', description: '' });
        if (!$.userVms) $.userVms = Vue.ref([]);
        if (!$.userLxcContainers) $.userLxcContainers = Vue.ref([]);
        if (!$.lxcContainers) $.lxcContainers = Vue.ref([]);
        if (!$.templatePage) $.templatePage = {};
        if (!$.templatePage.vmTemplates) $.templatePage.vmTemplates = Vue.ref([]);
        if (!$.templatePage.lxcTemplates) $.templatePage.lxcTemplates = Vue.ref([]);
        if (!$.templatePage.allStorages) $.templatePage.allStorages = Vue.ref([]);
        if (!$.templatePage.pveTemplateVms) $.templatePage.pveTemplateVms = Vue.ref([]);
        if (!$.templatePage.vmTemplateForm) $.templatePage.vmTemplateForm = Vue.ref({ id: null, name: '', template_vmid: '', cores: 1, memory: 1024, disk_size: 20, network_bridge: 'vmbr0', network_model: 'virtio', os_type: '', target_storage: 'local-lvm', clone_mode: 'full', cpu_affinity: '', description: '', status: 'active' });
        if (!$.templatePage.lxcTemplateForm) $.templatePage.lxcTemplateForm = Vue.ref({ id: null, name: '', ostemplate: '', storage: '', rootfs_storage: 'local-lvm', cores: 1, memory: 512, swap: 512, disk_size: 8, network_bridge: 'vmbr0', network_mode: 'dhcp', ipv6_enabled: 1, ip6_mode: 'dhcp', ip6_addr: '', ip4_addr: '', unprivileged: 1, features: '', description: '', status: 'active' });
        if (!$.templatePage.lxcStorages) $.templatePage.lxcStorages = Vue.ref([]);
        if (!$.templatePage.lxcTplStorages) $.templatePage.lxcTplStorages = Vue.ref([]);
        if (!$.templatePage.lxcOstemplates) $.templatePage.lxcOstemplates = Vue.ref([]);
        // LXC 特性多选下拉兜底（modal 常驻渲染，template.js 未定义时也不崩）
        if (!$.templatePage.lxcFeatureOpen) $.templatePage.lxcFeatureOpen = Vue.ref(false);
        if (!$.templatePage.lxcFeaturesSet) $.templatePage.lxcFeaturesSet = Vue.ref(new Set());
        if (!$.templatePage.lxcFeatureOptions) $.templatePage.lxcFeatureOptions = Vue.ref([
            { name: 'nesting', descKey: 'admin.lxc.feat.nesting' }, { name: 'fuse', descKey: 'admin.lxc.feat.fuse' },
            { name: 'keyctl', descKey: 'admin.lxc.feat.keyctl' }, { name: 'mknod', descKey: 'admin.lxc.feat.mknod' },
            { name: 'mount', descKey: 'admin.lxc.feat.mount' }, { name: 'nfs', descKey: 'admin.lxc.feat.nfs' },
            { name: 'samba', descKey: 'admin.lxc.feat.samba' }, { name: 'cifs', descKey: 'admin.lxc.feat.cifs' }
        ]);
        if (!$.lxcFeatureOptions) $.lxcFeatureOptions = Vue.ref([]);
        if (!$.lxcFeatureDefaultSet) $.lxcFeatureDefaultSet = ['nesting'];
        if (!$.templatePage.lxcFeatureText) $.templatePage.lxcFeatureText = Vue.computed(function() { return ''; });
        if (!$.lxcFeatureOpen) $.lxcFeatureOpen = Vue.ref(false);
        if (!$.lxcFeaturesSet) $.lxcFeaturesSet = Vue.ref(new Set());
        if (!$.lxcFeatureText) $.lxcFeatureText = Vue.computed(function() { return ''; });
        // 兜底：直开表单初始勾选同步（业务页正常加载时此处因 set 已存在被跳过）
        if ($.lxcFeaturesSet && $.lxcForm && $.syncLxcFeatureSet) {
            $.syncLxcFeatureSet($.lxcFeaturesSet, $.lxcForm, 'features');
        }
        if (!$.packagePage) $.packagePage = {};
        if (!$.packagePage.vmPackages) $.packagePage.vmPackages = Vue.ref([]);
        if (!$.packagePage.lxcPackages) $.packagePage.lxcPackages = Vue.ref([]);
        if (!$.packagePage.vmProvisionForm) $.packagePage.vmProvisionForm = Vue.ref({ package_id: '' });
        if (!$.packagePage.lxcProvisionForm) $.packagePage.lxcProvisionForm = Vue.ref({ package_id: '' });
        if (!$.packagePage.vmPackageForm) $.packagePage.vmPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, disk_size: 0, monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' });
        if (!$.packagePage.vmTemplateOptions) $.packagePage.vmTemplateOptions = Vue.ref([]);
        if (!$.packagePage.lxcPackageForm) $.packagePage.lxcPackageForm = Vue.ref({ id: null, name: '', template_id: '', cores: 0, memory: 0, swap: 0, disk_size: 0, monthly_price: 0, quarterly_price: 0, yearly_price: 0, description: '', status: 'active' });
        if (!$.packagePage.lxcTemplateOptions) $.packagePage.lxcTemplateOptions = Vue.ref([]);
        // 端口转发及MAC分组组件所需ref——确保在网络/ikuai模块未就绪时也不崩溃
        if (!$.macGroups) $.macGroups = Vue.ref([]);
        if (!$.userForwardCount) $.userForwardCount = Vue.ref(0);
        if (!$.maxForwardPerUser) $.maxForwardPerUser = Vue.ref(10);
        if (!$.selectedForwardIds) $.selectedForwardIds = Vue.ref([]);
        if (!$.forwardRulesLoading) $.forwardRulesLoading = Vue.ref(false);
        if (!$.forwardRules) $.forwardRules = Vue.ref([]);
        if (!$.paginatedVmForwardRules) $.paginatedVmForwardRules = Vue.ref([]);
        if (!$.forwardVmPage) $.forwardVmPage = Vue.ref(1);
        if (!$.vmForwardTotal) $.vmForwardTotal = Vue.ref(0);
        if (!$.paginatedLxcForwardRules) $.paginatedLxcForwardRules = Vue.ref([]);
        if (!$.forwardLxcPage) $.forwardLxcPage = Vue.ref(1);
        if (!$.lxcForwardTotal) $.lxcForwardTotal = Vue.ref(0);
        if (!$.isEditingForward) $.isEditingForward = Vue.ref(false);
        if (!$.showForwardModal) $.showForwardModal = Vue.ref(false);
        if (!$.redisConfig) $.redisConfig = Vue.ref({ host: '', port: 6379, password: '', db: 0, prefix: 'pve:' });
        if (!$.redisConfigSaving) $.redisConfigSaving = Vue.ref(false);
        if (!$.redisTesting) $.redisTesting = Vue.ref(false);
        // 硬盘设置兜底初始化
        if (!$.diskPage) $.diskPage = {};
        if (!$.diskPage.storageGroups) $.diskPage.storageGroups = Vue.ref([]);
        if (!$.diskPage.diskSpecs) $.diskPage.diskSpecs = Vue.ref([]);
        if (!$.diskPage.lifecycleConfig) $.diskPage.lifecycleConfig = Vue.ref(null);
        if (!$.diskPage.editingStorageGroup) $.diskPage.editingStorageGroup = Vue.ref(null);
        if (!$.diskPage.showStorageGroupModal) $.diskPage.showStorageGroupModal = Vue.ref(false);
        if (!$.diskPage.storageGroupForm) $.diskPage.storageGroupForm = Vue.ref({ name: '', sort_order: 0 });
        if (!$.diskPage.editingDiskSpec) $.diskPage.editingDiskSpec = Vue.ref(null);
        if (!$.diskPage.showDiskSpecModal) $.diskPage.showDiskSpecModal = Vue.ref(false);
        if (!$.diskPage.showQosSection) $.diskPage.showQosSection = Vue.ref(false);
        if (!$.diskPage.diskSpecForm) $.diskPage.diskSpecForm = Vue.ref({ name: '', disk_type: 'NVME', storage_group_id: '', enabled: true, min_size_gb: 10, max_size_gb: 2000, price_per_gb: 0.8, quarterly_discount: 0, yearly_discount: 0, storage_pool: '', mbps_rd: '', mbps_rd_max: '', mbps_wr: '', mbps_wr_max: '', iops_rd: '', iops_rd_max: '', iops_wr: '', iops_wr_max: '', description: '' });
        if (!$.diskPage.editingLifecycle) $.diskPage.editingLifecycle = Vue.ref(false);
        if (!$.diskPage.lifecycleForm) $.diskPage.lifecycleForm = Vue.ref({ warn_days: 7, warn_frequency: 'daily', grace_days: 3, grace_frequency: 'twice_daily', retention_days: 15, auto_renew_days: 1 });
        // OS 模板兜底初始化
        if (!$.osTemplatePage) $.osTemplatePage = {};
        if (!$.osTemplatePage.osTemplates) $.osTemplatePage.osTemplates = Vue.ref([]);
        if (!$.osTemplatePage.pveTemplateVms) $.osTemplatePage.pveTemplateVms = Vue.ref([]);
        if (!$.osTemplatePage.pveConfigLoading) $.osTemplatePage.pveConfigLoading = Vue.ref(false);
        if (!$.osTemplatePage.allStorages) $.osTemplatePage.allStorages = Vue.ref([]);
        if (!$.osTemplatePage.formData) $.osTemplatePage.formData = Vue.reactive({ name: '', template_vmid: '', os_type: '', os_version: '', ostype: '', arch: 'x86_64', target_storage: 'local-lvm', ciuser: '', description: '', icon: '', sort_order: 0, allowed_package_ids: '', enabled: 1, status: 'active' });
        if (!$.osTemplatePage.saving) $.osTemplatePage.saving = Vue.ref(false);
        // OS 切换日志兜底初始化
        if (!$.osSwitchLogList) $.osSwitchLogList = Vue.ref([]);
        if (!$.osSwitchLogTotal) $.osSwitchLogTotal = Vue.ref(0);
        if (!$.osSwitchLogPage) $.osSwitchLogPage = Vue.ref(1);
        if (!$.osSwitchLogFilter) $.osSwitchLogFilter = Vue.reactive({ status: '', vm_id: '', user_id: '' });
        if (!$.osSwitchLogSelected) $.osSwitchLogSelected = Vue.reactive([]);
        if (!$.osSwitchLogDetail) $.osSwitchLogDetail = Vue.ref(null);
        // i18n 管理兜底初始化（页面脚本异常时避免模板引用 undefined 崩溃）
        if (!$.i18nPage) $.i18nPage = {};
        if (!$.activeTabDisk) $.activeTabDisk = Vue.ref(localStorage.getItem(window.__storageKeys.ADMIN_ACTIVE_TAB_DISK) || 'storage-groups');
        $.initCore();
        $.initVm();
        $.initLxc();
        $.initAdmin();
        $.initNetwork();
        $.initUpdate();
        $.initTemplate();
        $.initDisk && $.initDisk();
        $.toggleAdminDropdown = function(target) {
            var dd = target.parentElement;
            var isOpen = dd.classList.contains('open');
            // 关闭所有已打开的下拉，淡出后移回原位
            document.querySelectorAll('.dropdown-table.open').forEach(function(el) {
                el.classList.remove('open');
                var menu = el._movedMenu;
                if (menu) {
                    window.closeFixedDropdownAnimated(menu, function() {
                        menu.style.display = 'none';
                        if (menu._originalParent) {
                            menu._originalParent.appendChild(menu);
                            menu._originalParent = null;
                        }
                        el._movedMenu = null;
                    });
                }
            });
            if (!isOpen) {
                dd.classList.add('open');
                var menu = dd.querySelector('.dropdown-menu-table');
                if (menu) {
                    // 移到 body 下，绕过 table-container 的 backdrop-filter 导致 fixed 降级
                    menu._originalParent = dd;
                    dd._movedMenu = menu; // 记录引用，关闭时能找到
                    document.body.appendChild(menu);
                    menu.style.display = 'block'; // 移到 body 后 CSS 后代选择器失效，手动控制 display
                    if (window.ModalZIndexManager) {
                        var z0 = window.ModalZIndexManager.acquire();
                        menu._dropdownZIndex = z0;
                        menu.style.zIndex = z0;
                    }
                    if (window.positionFixedDropdown) {
                        void menu.offsetWidth;
                        window.positionFixedDropdown(target, menu);
                    }
                }
            }
        };
        $.toggleSidebar = toggleSidebar;
        return $;
    }
};
var app = Vue.createApp(App);

  // 注册全局属性，确保模板任意作用域都能找到
  app.config.globalProperties.daysUntilExpire = $.daysUntilExpire;
  app.config.globalProperties.getExpiryColor = $.getExpiryColor;
  app.config.globalProperties.vmBusyClass = $.vmBusyClass;
  app.config.globalProperties.vmBusyText = $.vmBusyText;
  app.config.globalProperties.vmBusyBlock = $.vmBusyBlock;
  app.config.globalProperties.formatDate = $.formatDate;
  // i18n 翻译函数（响应式：语言切换时自动重渲染）
  app.config.globalProperties.t = window.__i18n.t;
  app.config.globalProperties.tFormat = window.__i18n.tFormat;
  // 日志分类/子分类标识 → i18n key（模板内不直接引用 window，经 globalProperties 转发）
  app.config.globalProperties.logCatKey = function (k) { return window.__logI18n ? window.__logI18n.cat(k) : ''; };
  app.config.globalProperties.logSubKey = function (k) { return window.__logI18n ? window.__logI18n.sub(k) : ''; };
  // 语言下拉选项列表（系统 + 自定义语言；注册表加载失败时回退 7 种系统语言）
  app.config.globalProperties.i18nLanguageList = window.__i18n.getLanguages;
// Global error handler — catch render errors and show on screen
app.config.errorHandler = function(err, instance, info) {
    console.error('[Vue Error]', err, instance, info);
    var msg = err && err.message ? err.message : String(err);
    var compName = '?';
    if (instance) {
        if (instance.type) compName = instance.type.name || instance.type.__name || 'VueComponent';
        else compName = 'root';
    }
    // Try to extract the template snippet from error stack
    var errStack = err && err.stack ? err.stack : '';
    var detail = msg + ' [comp=' + compName + ', hook=' + info + ']';
    // Find which property might be undefined by extracting from the message
    var missingMatch = msg.match(/Cannot read properties of undefined \(reading '([^']+)'\)/);
    if (missingMatch) detail += ' [prop=' + missingMatch[1] + ']';
    var el = document.createElement('div');
    el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#dc3545;color:#fff;padding:12px 20px;font-size:13px;font-family:monospace;max-height:120px;overflow:auto';
    el.textContent = '[Vue Error] ' + detail;
    document.body.appendChild(el);
    setTimeout(function() { el.remove(); }, 15000);
};

// ==================== 端口转发列表组件 ====================
app.component('port-forward-list', {
    template: '\
        <div>\
<div class="module-header">\
	                <h4 class="module-title">{{ t(\'dash.port.mgmtTitle\') }}</h4>\
	                <div class="d-flex align-items-center gap-2">\
	                    <select class="form-select form-select-sm" style="width:auto" v-model="forwardFilterType" @change="filterForward">\
	                        <option value="all">{{ t(\'common.all\') }}</option>\
	                        <option value="vm">VM</option>\
	                        <option value="lxc">LXC</option>\
	                        <option value="general">{{ t(\'admin.port.generic\') }}</option>\
	                    </select>\
	                    <input type="text" class="form-control form-control-sm" style="width:200px" v-model="forwardSearchText" :placeholder="t(\'admin.fwd.searchPh\')" @input="onForwardSearch">\
	                    <pv-button variant="primary" size="sm" class="me-2" @click="openAddForward" :disabled="userForwardCount >= maxForwardPerUser && userRole !== \'admin\'">{{ t(\'dash.port.add\') }}</pv-button>\
	                    <pv-button variant="danger" size="sm" @click="batchDelete" :disabled="selectedForwardIds.length === 0">{{ t(\'admin.logs.batchDelete\') }}</pv-button>\
	                </div>\
            </div>\
            <div v-if="forwardRulesLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>\
            <div v-else-if="forwardRules.length === 0" class="text-center py-4 text-muted">{{ t(\'dash.port.empty\') }}</div>\
            <div v-else class="table-container mb-4" style="padding:12px;">\
                <div class="table-responsive">\
                <table class="table table-hover table-align-center">\
                    <thead>\
                        <tr>\
                            <th v-if="userRole === \'admin\'" class="checkbox-col"><input type="checkbox" @change="toggleAll"></th>\
                            <th>{{ t(\'admin.fwd.idx\') }}</th>\
                            <th>{{ t(\'common.name\') }}</th>\
                            <th>{{ t(\'common.type\') }}</th>\
                            <th>{{ t(\'dash.port.targetIp\') }}</th>\
                            <th>{{ t(\'dash.port.internalPort\') }}</th>\
                            <th>{{ t(\'dash.port.externalPort\') }}</th>\
                            <th>{{ t(\'dash.port.protocol\') }}</th>\
                            <th>{{ t(\'common.status\') }}</th>\
                            <th>{{ t(\'admin.fwd.syncStatus\') }}</th>\
                            <th>{{ t(\'common.actions\') }}</th>\
                        </tr>\
                    </thead>\
                    <tbody>\
                        <tr v-for="(rule, idx) in paginatedForwardRules" :key="rule.id" :class="{ \'text-muted text-decoration-line-through\': rule.sync_status === \'orphan\' }">\
                            <td v-if="userRole === \'admin\'" class="checkbox-col"><input type="checkbox" :value="rule.id" v-model="selectedForwardIds"></td>\
                            <td>{{ (forwardPage - 1) * forwardPageSize + idx + 1 }}</td>\
                            <td>{{ rule.name || \'-\' }}</td>\
                            <td>\
                                <span v-if="rule.type === \'vm\'" class="badge bg-primary">VM</span>\
                                <span v-else-if="rule.type === \'lxc\'" class="badge bg-info">LXC</span>\
                                <span v-else class="badge bg-secondary">{{ t(\'admin.port.generic\') }}</span>\
                            </td>\
                            <td>{{ rule.ip }}</td>\
                            <td>{{ rule.internal_port }}</td>\
                            <td>{{ rule.external_port }}</td>\
                            <td>{{ rule.protocol?.toUpperCase() }}</td>\
                            <td><span :class="rule.enabled ? \'text-success\' : \'text-muted\'">{{ rule.enabled ? t(\'admin.common.enabled\') : t(\'admin.common.disabled\') }}</span></td>\
                            <td>\
                                <span v-if="rule.sync_status === \'synced\'" class="badge bg-success">{{ t(\'admin.fwd.synced\') }}</span>\
                                <span v-else-if="rule.sync_status === \'orphan\'" class="badge bg-secondary">{{ t(\'admin.fwd.orphan\') }}</span>\
                                <span v-else-if="rule.sync_status === \'failed\'" class="badge bg-danger">{{ t(\'admin.osswitchlog.status.failed\') }}</span>\
                                <span v-else class="badge bg-warning text-dark">{{ t(\'admin.fwd.pendingSync\') }}</span>\
                            </td>\
                            <td>\
                                <pv-button variant="outline" size="sm" class="me-1" @click="editForward(rule)">{{ t(\'common.edit\') }}</pv-button>\
                                <pv-button variant="outline-danger" size="sm" @click="deleteForward(rule.id)">{{ t(\'common.delete\') }}</pv-button>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
                </div>\
                <!-- 分页：通用分页条（pv-pagination 单一实现） -->\
                <pv-pagination :total="forwardTotal" :page="forwardPage" :page-size="forwardPageSize" @change="setPage"></pv-pagination>\
            </div>\
            <div class="text-muted small" v-if="userRole !== \'admin\'">\
                {{ t(\'admin.fwd.usedPfx\') }}{{ userForwardCount }} / {{ maxForwardPerUser }}{{ t(\'common.countUnit\') }}\
            </div>\
        </div>\
    ',
    computed: {
        userRole() { return $.user.value ? $.user.value.role : 'user'; },
        userForwardCount() { return $.userForwardCount.value || 0; },
        maxForwardPerUser() { return $.maxForwardPerUser.value || 10; },
        selectedForwardIds: {
            get() { return $.selectedForwardIds.value || []; },
            set(val) { $.selectedForwardIds.value = val; }
        },
        forwardRulesLoading() { return $.forwardRulesLoading.value; },
        forwardRules() { return $.forwardRules.value; },
        paginatedForwardRules() { return $.paginatedForwardRules.value; },
        forwardPage() { return $.forwardPage.value; },
        forwardPageSize() { return $.forwardPageSize; },
        forwardTotal() { return $.forwardRules.value.length; },
        forwardFilterType: {
            get() { return $.forwardFilterType ? $.forwardFilterType.value : 'all'; },
            set(val) { if ($.forwardFilterType) $.forwardFilterType.value = val; }
        },
        forwardSearchText: {
            get() { return $.forwardSearchText ? $.forwardSearchText.value : ''; },
            set(val) { if ($.forwardSearchText) $.forwardSearchText.value = val; }
        }
    },
    methods: {
        openAddForward() {
            var defaultType = ($.user.value && $.user.value.role === 'admin') ? 'general' : 'vm';
            $.openAddForward(defaultType);
        },
        batchDelete() { $.batchDeleteForwards(); },
        toggleAll(e) { $.toggleSelectAllForwards(e); },
        filterForward() {
            var t = $.forwardFilterType ? $.forwardFilterType.value : 'all';
            $.loadForwardRules(t);
        },
        onForwardSearch() {
            var t = $.forwardFilterType ? $.forwardFilterType.value : 'all';
            $.loadForwardRules(t);
        },
        prevPage() { if ($.forwardPage.value > 1) $.forwardPage.value--; },
        nextPage() { $.forwardPage.value++; },
        setPage(p) { if (p >= 1) $.forwardPage.value = p; },
        editForward(rule) {
            $.isEditingForward.value = true;
            Object.assign($.forwardForm, {
                id: rule.id, type: rule.type,
                vm_id: rule.vm_id, ct_id: rule.ct_id,
                name: rule.name, ip: rule.ip,
                internal_port: rule.internal_port,
                external_port: rule.external_port,
                protocol: rule.protocol
            });
            // general 类型无需加载设备列表
            if (rule.type !== 'general') {
                api('/port-forwards/extract-ips').then(function(devices) {
                    $.availableDevices.value = (devices || []).filter(function(d) { return d.type === rule.type; });
                }).catch(function(e) { console.error('加载设备列表失败:', e); });
            } else {
                $.availableDevices.value = [];
            }
            $.showForwardModal.value = true;
            $.bsModalShow('forwardModal');
        },
        deleteForward(id) { $.deleteForward(id); }
    }
});

// ==================== 私有网络列表组件（管理员视角，只读） ====================
app.component('private-network-list', {
    template: '\
        <div>\
            <div class="module-header">\
                <h4 class="module-title">{{ t(\'admin.net.privateTitle\') }}</h4>\
                <div class="d-flex align-items-center gap-2">\
                    <input type="text" class="form-control form-control-sm" style="width:240px" v-model="privateSubnetSearch" :placeholder="t(\'admin.net.searchPh\')" @input="onPrivateSubnetSearch">\
                </div>\
            </div>\
            <div v-if="privateSubnetsLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>\
            <div v-else-if="privateSubnets.length === 0" class="text-center py-4 text-muted">{{ t(\'admin.net.empty\') }}</div>\
            <div v-else class="table-container mb-4" style="padding:12px;">\
                <div class="table-responsive">\
                <table class="table table-sm table-hover mb-0 table-align-center">\
                    <thead>\
                        <tr>\
                            <th>ID</th>\
                            <th>{{ t(\'admin.net.owner\') }}</th>\
                            <th>VLAN ID</th>\
                            <th>{{ t(\'admin.net.name\') }}</th>\
                            <th>{{ t(\'admin.net.gatewayMask\') }}</th>\
                            <th>{{ t(\'admin.net.pool\') }}</th>\
                            <th>{{ t(\'admin.net.availIp\') }}</th>\
                            <th>{{ t(\'admin.net.iface\') }}</th>\
                            <th>{{ t(\'admin.net.boundDevice\') }}</th>\
                            <th>{{ t(\'admin.users.createdAt\') }}</th>\
                        </tr>\
                    </thead>\
                    <tbody>\
                        <tr v-for="(s, idx) in paginatedPrivateSubnets" :key="s.id">\
                            <td>{{ s.id }}</td>\
                            <td>{{ s.username || \'-\' }}</td>\
                            <td><span class="badge bg-primary">{{ s.vlan_id }}</span></td>\
                            <td><span class="text-primary">{{ s.vlan_name }}</span></td>\
                            <td>{{ s.gateway }} / {{ s.netmask }}</td>\
                            <td>{{ s.addr_pool }}</td>\
                            <td>{{ s.available }}</td>\
                            <td>{{ s.interface }}</td>\
                            <td>\
                                <span v-if="s.vm_count + s.lxc_count === 0" class="text-muted">-</span>\
                                <span v-else>\
                                    <span v-if="s.vm_count > 0">VM {{ s.vm_count }}</span>\
                                    <span v-if="s.vm_count > 0 && s.lxc_count > 0"> | </span>\
                                    <span v-if="s.lxc_count > 0">LXC {{ s.lxc_count }}</span>\
                                </span>\
                            </td>\
                            <td>{{ formatDate(s.created_at) }}</td>\
                        </tr>\
                    </tbody>\
                </table>\
                </div>\
                <pv-pagination :total="privateSubnetTotal" :page="privateSubnetPage" :page-size="privateSubnetPageSize" @change="setPrivateSubnetPage"></pv-pagination>\
            </div>\
        </div>\
    ',
    computed: {
        privateSubnets() { return $.privateSubnets.value || []; },
        paginatedPrivateSubnets() { return $.paginatedPrivateSubnets.value || []; },
        privateSubnetsLoading() { return $.privateSubnetsLoading.value; },
        privateSubnetTotal() { return $.privateSubnets.value.length; },
        privateSubnetPage() { return $.privateSubnetPage.value; },
        privateSubnetPageSize() { return $.privateSubnetPageSize; },
        privateSubnetSearch: {
            get() { return $.privateSubnetSearch ? $.privateSubnetSearch.value : ''; },
            set(val) { if ($.privateSubnetSearch) $.privateSubnetSearch.value = val; }
        }
    },
    methods: {
        onPrivateSubnetSearch() { $.onPrivateSubnetSearch(); },
        setPrivateSubnetPage(p) { if (p >= 1) $.privateSubnetPage.value = p; }
    }
});

  // i18n：异步初始化语录 + 挂载前确保翻译已加载
  (async function () {
      if (window.__i18n && !window.__i18n.isLoaded()) {
          await window.__i18n.init(window.__initialLocale || 'zh-CN');
      }
      app.mount('#app');
      // 挂载完成后 Vue 才渲染出 header 的头像下拉菜单（含徽章/余额/退出按钮）；
      // shared.js 的 DOMContentLoaded 一次性绑定此时已错过，需在此补触发余额加载
      if (window.loadHeaderBalance) window.loadHeaderBalance();
      // #themeToggle 是 Vue 渲染（mount 后才有），DOMContentLoaded 时 getElementById 找不到即静默返回
      // （28bba00 把 mount 挪进 await i18n.init 后导致）；必须在 mount 后补调主题切换绑定
      if (window.initThemeToggle) window.initThemeToggle();
  })();

  // ===== Bottom inline script (DOM utilities) =====
  function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
  }
  document.addEventListener('DOMContentLoaded', function() {
      // 注意：侧边栏导航点击已由 Vue @click.prevent + switchSection() 统一处理（含移动端自动收起）

      // 界面模板个人偏好同步（跨设备，管理员个人偏好同样生效）
      if (window.syncUserTemplate) window.syncUserTemplate();

      function syncHeaderUser() {
          if (window.__admin && window.__admin.user && window.__admin.user.value) {
              var u = window.__admin.user.value;
              var avatarEl = document.querySelector('.header-user-avatar');
              var nameEl = document.querySelector('.header-username');
              if (avatarEl) {
                  if (u.avatar) {
                      avatarEl.src = u.avatar;
                  } else {
                      avatarEl.src = getGeekAvatar(u.username || 'Admin');
                  }
              }
              if (nameEl) nameEl.textContent = u.username || 'Admin';
          }
      }

      if (window.__admin && window.__admin.user) {
          syncHeaderUser();
      }

      // 侧边栏切换按钮已由 Vue @click.prevent="toggleSidebar()" 绑定（CSP nonce 合规）

      // 用户下拉菜单点击切换
      var userDrop = document.getElementById('userInfoDrop');
      if (userDrop) {
          userDrop.addEventListener('click', function(e) {
              e.stopPropagation();
              userDrop.classList.toggle('open');
          });
          // 点击外部关闭
          document.addEventListener('click', function(e) {
              if (!userDrop.contains(e.target)) {
                  userDrop.classList.remove('open');
              }
          });
      }

      document.addEventListener('click', function(e) {
          var allOpen = document.querySelectorAll('.dropdown-table.open');
          allOpen.forEach(function(dd) {
              if (!dd.contains(e.target)) {
                  dd.classList.remove('open');
                  var menu = dd._movedMenu;
                  if (menu) {
                      window.closeFixedDropdownAnimated(menu, function() {
                          menu.style.display = 'none';
                          if (menu._originalParent) {
                              menu._originalParent.appendChild(menu);
                              menu._originalParent = null;
                          }
                          dd._movedMenu = null;
                      });
                  }
              }
          });
      });
  });
