var $ = window.__admin;

// 全局工具函数：到期时间显示（在 setup 之前定义，确保模板编译时可用）
$.daysUntilExpire = function(expireTime) {
    if (!expireTime) return '';
    var diff = new Date(expireTime) - new Date();
    var days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    if (days <= 0) return '已到期';
    return '剩余' + days + '天';
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

var App = {
    template: '#appTemplate',
    setup: function() {
        // 兜底初始化：确保关键 ref 在模板渲染前一定存在（防止异步加载时序导致 undefined 崩溃）
        if (!$.vmIpForm) $.vmIpForm = Vue.ref({ ip_mode: 'dhcp', ip: '' });
        if (!$.lxcIpForm) $.lxcIpForm = Vue.ref({ ip_mode: 'static', ip: '' });
        if (!$.confirmState) $.confirmState = Vue.ref({ vmId: null, action: null });
        if (!$.lxcConfirmState) $.lxcConfirmState = Vue.ref({ ctId: null, action: null });
        if (!$.snapshotForm) $.snapshotForm = Vue.ref({ name: '', description: '' });
        if (!$.pveConfig) $.pveConfig = Vue.ref({ host: '', api_token: '', ssh_host: '', ssh_port: 22, ssh_user: 'root', ssh_password: '', strict_tls: false });
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
        if (!$.templatePage.lxcOstemplates) $.templatePage.lxcOstemplates = Vue.ref([]);
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
        if (!$.diskPage.lifecycleForm) $.diskPage.lifecycleForm = Vue.ref({ warn_days: 7, warn_frequency: 'daily', grace_days: 3, grace_frequency: 'twice_daily', shutdown_timeout: 300, retention_days: 15, auto_renew_days: 1 });
        if (!$.activeTabDisk) $.activeTabDisk = Vue.ref(localStorage.getItem('admin_activeTabDisk') || 'storage-groups');
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
<div class="d-flex justify-content-between align-items-center mb-3">\
	                <h4 class="mb-0">端口转发管理</h4>\
	                <div class="d-flex align-items-center gap-2">\
	                    <select class="form-select form-select-sm" style="width:auto" v-model="forwardFilterType" @change="filterForward">\
	                        <option value="all">全部</option>\
	                        <option value="vm">VM</option>\
	                        <option value="lxc">LXC</option>\
	                        <option value="general">通用</option>\
	                    </select>\
	                    <input type="text" class="form-control form-control-sm" style="width:200px" v-model="forwardSearchText" placeholder="搜索 IP 或端口..." @input="onForwardSearch">\
	                    <pv-button variant="primary" size="sm" class="me-2" @click="openAddForward" :disabled="userForwardCount >= maxForwardPerUser && userRole !== \'admin\'">添加端口转发</pv-button>\
	                    <pv-button variant="danger" size="sm" @click="batchDelete" :disabled="selectedForwardIds.length === 0">批量删除</pv-button>\
	                </div>\
            </div>\
            <div v-if="forwardRulesLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>\
            <div v-else-if="forwardRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>\
            <div v-else class="table-responsive">\
                <table class="table table-striped table-hover table-align-center">\
                    <thead>\
                        <tr>\
                            <th v-if="userRole === \'admin\'" class="checkbox-col"><input type="checkbox" @change="toggleAll"></th>\
                            <th>序号</th>\
                            <th>名称</th>\
                            <th>类型</th>\
                            <th>目标 IP</th>\
                            <th>内网端口</th>\
                            <th>外网端口</th>\
                            <th>协议</th>\
                            <th>状态</th>\
                            <th>同步状态</th>\
                            <th>操作</th>\
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
                                <span v-else class="badge bg-secondary">通用</span>\
                            </td>\
                            <td>{{ rule.ip }}</td>\
                            <td>{{ rule.internal_port }}</td>\
                            <td>{{ rule.external_port }}</td>\
                            <td>{{ rule.protocol?.toUpperCase() }}</td>\
                            <td><span :class="rule.enabled ? \'text-success\' : \'text-muted\'">{{ rule.enabled ? \'启用\' : \'禁用\' }}</span></td>\
                            <td>\
                                <span v-if="rule.sync_status === \'synced\'" class="badge bg-success">已同步</span>\
                                <span v-else-if="rule.sync_status === \'orphan\'" class="badge bg-secondary">孤立</span>\
                                <span v-else-if="rule.sync_status === \'failed\'" class="badge bg-danger">失败</span>\
                                <span v-else class="badge bg-warning text-dark">待同步</span>\
                            </td>\
                            <td>\
                                <pv-button variant="outline" size="sm" class="me-1" @click="editForward(rule)">编辑</pv-button>\
                                <pv-button variant="outline-danger" size="sm" @click="deleteForward(rule.id)">删除</pv-button>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
            </div>\
            <nav v-if="forwardTotal > forwardPageSize" class="mt-2">\
                <ul class="pagination pagination-sm justify-content-center mb-0">\
                    <li class="page-item" :class="{ disabled: forwardPage <= 1 }">\
                        <button class="page-link" @click="prevPage">上一页</button>\
                    </li>\
                    <li class="page-item disabled">\
                        <span class="page-link">{{ forwardPage }} / {{ Math.ceil(forwardTotal / forwardPageSize) }}</span>\
                    </li>\
                    <li class="page-item" :class="{ disabled: forwardPage >= Math.ceil(forwardTotal / forwardPageSize) }">\
                        <button class="page-link" @click="nextPage">下一页</button>\
                    </li>\
                </ul>\
            </nav>\
            <div class="text-muted small" v-if="userRole !== \'admin\'">\
                已使用 {{ userForwardCount }} / {{ maxForwardPerUser }} 条\
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

  app.mount('#app');

  // ===== Bottom inline script (DOM utilities) =====
  function toggleSidebar() {
      document.getElementById('sidebar').classList.toggle('open');
      document.getElementById('sidebarOverlay').classList.toggle('show');
  }
  document.addEventListener('DOMContentLoaded', function() {
      // 注意：侧边栏导航点击已由 Vue @click.prevent + switchSection() 统一处理（含移动端自动收起）

      // 统一主题切换（theme-init.js 中的 window.initThemeToggle）
      if (window.initThemeToggle) window.initThemeToggle();

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
