var $ = window.__admin;
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
        $.initCore();
        $.initVm();
        $.initLxc();
        $.initAdmin();
        $.initNetwork();
        $.initUpdate();
        $.initTemplate();
        $.toggleAdminDropdown = function(target) {
            var dd = target.parentElement;
            var isOpen = dd.classList.contains('open');
            document.querySelectorAll('.dropdown-table.open').forEach(function(el) {
                el.classList.remove('open');
            });
            if (!isOpen) {
                dd.classList.add('open');
            }
        };
        return $;
    }
};
var app = Vue.createApp(App);

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

// ==================== 端口转发列表组件（VM） ====================
app.component('vm-port-forward-list', {
    template: '\
        <div>\
            <div class="d-flex justify-content-between align-items-center mb-3">\
                <h4 class="mb-0">端口转发管理</h4>\
                <div>\
                    <button class="btn btn-primary btn-sm me-2" @click="openAddForward" :disabled="userForwardCount >= maxForwardPerUser && userRole !== \'admin\'">\
                        添加端口转发\
                    </button>\
                    <button class="btn btn-danger btn-sm" @click="batchDelete" :disabled="selectedForwardIds.length === 0">批量删除</button>\
                </div>\
            </div>\
            <div v-if="forwardRulesLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>\
            <div v-else-if="forwardRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>\
            <div v-else class="table-responsive">\
                <table class="table table-striped table-hover">\
                    <thead>\
                        <tr>\
                            <th v-if="userRole === \'admin\'"><input type="checkbox" @change="toggleAll"></th>\
                            <th>序号</th>\
                            <th>名称</th>\
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
                        <tr v-for="(rule, idx) in paginatedVmForwardRules" :key="rule.id" :class="{ \'text-muted text-decoration-line-through\': rule.sync_status === \'orphan\' }">\
                            <td v-if="userRole === \'admin\'"><input type="checkbox" :value="rule.id" v-model="selectedForwardIds"></td>\
                            <td>{{ (forwardVmPage - 1) * forwardPageSize + idx + 1 }}</td>\
                            <td>{{ rule.name || \'-\' }}</td>\
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
                                <button class="btn btn-sm btn-outline-primary me-1" @click="editForward(rule)">编辑</button>\
                                <button class="btn btn-sm btn-outline-danger" @click="deleteForward(rule.id)">删除</button>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
            </div>\
            <nav v-if="vmForwardTotal > forwardPageSize" class="mt-2">\
                <ul class="pagination pagination-sm justify-content-center mb-0">\
                    <li class="page-item" :class="{ disabled: forwardVmPage <= 1 }">\
                        <button class="page-link" @click="prevVmPage">上一页</button>\
                    </li>\
                    <li class="page-item disabled">\
                        <span class="page-link">{{ forwardVmPage }} / {{ Math.ceil(vmForwardTotal / forwardPageSize) }}</span>\
                    </li>\
                    <li class="page-item" :class="{ disabled: forwardVmPage >= Math.ceil(vmForwardTotal / forwardPageSize) }">\
                        <button class="page-link" @click="nextVmPage">下一页</button>\
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
        paginatedVmForwardRules() { return $.paginatedVmForwardRules.value; },
        forwardVmPage() { return $.forwardVmPage.value; },
        forwardPageSize() { return $.forwardPageSize; },
        vmForwardTotal() { return $.vmForwardTotal.value; }
    },
    methods: {
         openAddForward() { $.openAddForward('vm'); },
         batchDelete() { $.batchDeleteForwards(); },
         toggleAll(e) { $.toggleSelectAllForwards(e); },
         prevVmPage() { if ($.forwardVmPage.value > 1) $.forwardVmPage.value--; },
         nextVmPage() { $.forwardVmPage.value++; },
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
             $.showForwardModal.value = true;
         },
         deleteForward(id) { $.deleteForward(id); }
     }
 });

 // ==================== 端口转发列表组件（LXC） ====================
  app.component('lxc-port-forward-list', {
      template: '\
          <div>\
              <div class="d-flex justify-content-between align-items-center mb-3">\
                  <h4 class="mb-0">端口转发管理</h4>\
                  <div>\
                      <button class="btn btn-primary btn-sm me-2" @click="openAddForward" :disabled="userForwardCount >= maxForwardPerUser && userRole !== \'admin\'">\
                          添加端口转发\
                      </button>\
                      <button class="btn btn-danger btn-sm" @click="batchDelete" :disabled="selectedForwardIds.length === 0">批量删除</button>\
                  </div>\
              </div>\
            <div v-if="forwardRulesLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>\
            <div v-else-if="forwardRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>\
            <div v-else class="table-responsive">\
                <table class="table table-striped table-hover">\
                    <thead>\
                        <tr>\
                            <th v-if="userRole === \'admin\'"><input type="checkbox" @change="toggleAll"></th>\
                            <th>序号</th>\
                            <th>名称</th>\
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
                        <tr v-for="(rule, idx) in paginatedLxcForwardRules" :key="rule.id" :class="{ \'text-muted text-decoration-line-through\': rule.sync_status === \'orphan\' }">\
                            <td v-if="userRole === \'admin\'"><input type="checkbox" :value="rule.id" v-model="selectedForwardIds"></td>\
                            <td>{{ (forwardLxcPage - 1) * forwardPageSize + idx + 1 }}</td>\
                            <td>{{ rule.name || \'-\' }}</td>\
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
                                <button class="btn btn-sm btn-outline-primary me-1" @click="editForward(rule)">编辑</button>\
                                <button class="btn btn-sm btn-outline-danger" @click="deleteForward(rule.id)">删除</button>\
                            </td>\
                        </tr>\
                    </tbody>\
                </table>\
            </div>\
            <nav v-if="lxcForwardTotal > forwardPageSize" class="mt-2">\
                <ul class="pagination pagination-sm justify-content-center mb-0">\
                    <li class="page-item" :class="{ disabled: forwardLxcPage <= 1 }">\
                        <button class="page-link" @click="prevLxcPage">上一页</button>\
                    </li>\
                    <li class="page-item disabled">\
                        <span class="page-link">{{ forwardLxcPage }} / {{ Math.ceil(lxcForwardTotal / forwardPageSize) }}</span>\
                    </li>\
                    <li class="page-item" :class="{ disabled: forwardLxcPage >= Math.ceil(lxcForwardTotal / forwardPageSize) }">\
                        <button class="page-link" @click="nextLxcPage">下一页</button>\
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
         paginatedLxcForwardRules() { return $.paginatedLxcForwardRules.value; },
         forwardLxcPage() { return $.forwardLxcPage.value; },
         forwardPageSize() { return $.forwardPageSize; },
         lxcForwardTotal() { return $.lxcForwardTotal.value; }
     },
     methods: {
          openAddForward() { $.openAddForward('lxc'); },
          batchDelete() { $.batchDeleteForwards(); },
          toggleAll(e) { $.toggleSelectAllForwards(e); },
          prevLxcPage() { if ($.forwardLxcPage.value > 1) $.forwardLxcPage.value--; },
          nextLxcPage() { $.forwardLxcPage.value++; },
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
              $.showForwardModal.value = true;
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

      var toggleBtn = document.querySelector('.sidebar-toggle');
      // 注意：按钮已有 onclick="toggleSidebar()"，不再重复绑定

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
              }
          });
      });
  });