// public/js/admin/disk.js - 管理员硬盘设置逻辑
// 安全设计：Vue 3 Options API + CSP nonce 合规
// 注意：diskPage 是普通对象，其属性是 ref，模板中使用 diskPage.xxx.value 访问

(function() {
  var $ = window.__admin;
  if (!$) { console.error('[admin/disk.js] window.__admin not initialized'); return; }
  var Vue = window.Vue;
  var ref = Vue.ref;

  // 获取 token 的辅助函数（每次调用从 localStorage 获取，确保 token 是最新的）
  function getToken() {
    return localStorage.getItem(window.__storageKeys.TOKEN);
  }

  // 带认证的 fetch 封装
  function authFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    var token = getToken();
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, options);
  }

  // 带认证的 fetch + JSON 封装
  function authFetchJson(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    var token = getToken();
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    if (!options.headers['Content-Type']) {
      options.headers['Content-Type'] = 'application/json';
    }
    return fetch(url, options);
  }

  // ===== diskPage 命名空间对象（与 templatePage/packagePage 模式一致）=====
  $.diskPage = $.diskPage || {};

  // ===== 存储分组管理 =====
  $.diskPage.storageGroups = ref([]);
  $.diskPage.storageGroupForm = ref({ name: '', sort_order: 0, zone_id: '' });
  $.diskPage.groupZoneOptions = ref([]);   // 可用区列表（分组绑定可用区下拉用）
  // 规格表单可选分组：通用分组 + 与所选节点同可用区的分组
  $.diskPage.filteredStorageGroups = Vue.computed(function () {
    var nid = $.diskPage.diskSpecForm.value.pve_node_id;
    var node = null;
    if (nid != null && nid !== '') {
      var opts = $.diskPage.pveNodeOptions.value || [];
      for (var i = 0; i < opts.length; i++) {
        if (Number(opts[i].id) === Number(nid)) { node = opts[i]; break; }
      }
    }
    return ($.diskPage.storageGroups.value || []).filter(function (g) {
      // 通用分组恒可用；已绑区分组需与节点同区（节点未选时不过滤，由禁用态兜底）
      return !g.zone_id || !node || !node.zone_id || Number(g.zone_id) === Number(node.zone_id);
    });
  });
  $.diskPage.editingStorageGroup = ref(null);
  $.diskPage.showStorageGroupModal = ref(false);

  $.diskPage.loadStorageGroups = async function() {
    try {
      var res = await authFetch('/api/storage-groups');
      if (!res.ok) throw new Error(window.__i18n.t('common.loadFailed'));
      $.diskPage.storageGroups.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载存储分组失败:', e.message);
    }
  };

  $.diskPage.openStorageGroupForm = async function(group) {
    $.diskPage.editingStorageGroup.value = group;
    // 加载可用区列表（分组可选绑定；空=通用）
    try {
      var optRes = await authFetch('/api/admin/pve/nodes/form-options');
      var optData = await optRes.json();
      $.diskPage.groupZoneOptions.value = (optData && optData.zones) || [];
    } catch (e) {
      console.error('[disk] 加载可用区列表失败:', e && e.message);
      $.diskPage.groupZoneOptions.value = [];
    }
    $.diskPage.storageGroupForm.value = {
      name: group ? group.name : '',
      sort_order: group ? group.sort_order : 0,
      zone_id: group && group.zone_id ? group.zone_id : ''
    };
    $.diskPage.showStorageGroupModal.value = true;
    $.bsModalShow('storageGroupModal');
  };

  $.diskPage.saveStorageGroup = async function() {
    try {
      var f = $.diskPage.storageGroupForm.value;
      if (!f.name || !f.name.trim()) return alert(window.__i18n.t('admin.disk.groupNameRequired'));

      // 新建时自动获取当前最大 sort_order + 1
      var sortOrder = parseInt(f.sort_order) || 0;
      if (!$.diskPage.editingStorageGroup.value) {
        var groups = $.diskPage.storageGroups.value;
        if (groups.length > 0) {
          sortOrder = Math.max.apply(null, groups.map(function(g) { return g.sort_order || 0; })) + 1;
        }
      }

      var url = $.diskPage.editingStorageGroup.value
        ? '/api/storage-groups/' + $.diskPage.editingStorageGroup.value.id
        : '/api/storage-groups';
      var method = $.diskPage.editingStorageGroup.value ? 'PUT' : 'POST';

      var res = await authFetchJson(url, {
        method: method,
        body: JSON.stringify({ name: f.name.trim(), sort_order: sortOrder, zone_id: f.zone_id ? parseInt(f.zone_id) : null })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('common.failed'));
      $.bsModalHide('storageGroupModal');
      await Promise.all([$.diskPage.loadStorageGroups(), $.diskPage.loadDiskSpecs()]);
    } catch (e) {
      alert(window.__i18n.t('common.opFailedMsg') + e.message);
    }
  };

  $.diskPage.deleteStorageGroup = async function(id) {
    var group = ($.diskPage.storageGroups.value || []).find(function(g) { return g.id === id; });
    var specs = ($.diskPage.diskSpecs.value || []).filter(function(s) { return s.storage_group_id === id; });
    var hint = '';
    if (group) {
      if (specs.length > 0) {
        hint = window.__i18n.t('admin.disk.groupBoundPfxNl') + specs.length + window.__i18n.t('admin.disk.groupBoundSuffix') + specs.map(function(s) { return s.disk_type + '|' + s.name; }).join('、');
        hint += window.__i18n.t('admin.disk.delGroupWarnNl');
      }
    }
    if (!(await customConfirm(window.__i18n.t('admin.disk.deleteGroupConfirm') + (group ? group.name : '') + '」？' + hint))) return;
    try {
      var res = await authFetch('/api/storage-groups/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('admin.logs.deleteFailed'));
      await $.diskPage.loadStorageGroups();
    } catch (e) {
      alert(window.__i18n.t('common.deleteFailedMsg') + e.message);
    }
  };

  // ===== 存储分组拖拽排序 =====
  $.diskPage.dragIndex = ref(null);
  $.diskPage.dragOverIdx = ref(null);

  $.diskPage.onDragStart = function(e, index) {
    $.diskPage.dragIndex.value = index;
    e.target.style.opacity = '0.5';
    e.target.style.transform = 'scale(0.95)';
    e.dataTransfer.effectAllowed = 'move';
  };

  $.diskPage.onDragOver = function(e, index) {
    e.preventDefault();
    $.diskPage.dragOverIdx.value = index;
    e.dataTransfer.dropEffect = 'move';
  };

  $.diskPage.onDragLeave = function() {
    $.diskPage.dragOverIdx.value = null;
  };

  $.diskPage.onDrop = function(e, index) {
    e.preventDefault();
    var fromIdx = $.diskPage.dragIndex.value;
    if (fromIdx === null || fromIdx === index) {
      $.diskPage.dragIndex.value = null;
      $.diskPage.dragOverIdx.value = null;
      return;
    }
    var groups = $.diskPage.storageGroups.value.slice();
    var moved = groups.splice(fromIdx, 1)[0];
    groups.splice(index, 0, moved);
    $.diskPage.storageGroups.value = groups;
    $.diskPage.dragIndex.value = null;
    $.diskPage.dragOverIdx.value = null;
    $.diskPage.saveGroupSort();
  };

  $.diskPage.onDragEnd = function(e) {
    e.target.style.opacity = '';
    e.target.style.transform = '';
    $.diskPage.dragIndex.value = null;
    $.diskPage.dragOverIdx.value = null;
  };

  $.diskPage.saveGroupSort = async function() {
    var groups = $.diskPage.storageGroups.value;
    var order = groups.map(function(g, i) { return { id: g.id, sort_order: i }; });
    try {
      var res = await authFetchJson('/api/storage-groups/sort', {
        method: 'PUT',
        body: JSON.stringify({ order: order })
      });
      var data = await res.json();
      if (!res.ok) console.error('[disk] 保存排序失败:', data.error);
    } catch (e) {
      console.error('[disk] 保存排序失败:', e.message);
    }
  };

  // 清除缓存
  $.diskPage.clearGroupCache = function() {
    var token = getToken();
    fetch('/api/storage-groups', { headers: { 'Authorization': 'Bearer ' + token } });
  };

  // ===== 硬盘规格管理 =====
  $.diskPage.diskSpecs = ref([]);
  $.diskPage.pveStorages = ref([]);       // PVE 存储（卡片用量展示 + 弹窗存储池默认；默认节点）
  $.diskPage.diskSpecStorages = ref([]);  // 硬盘规格弹窗存储池下拉（按所选节点加载）
  $.diskPage.pveNodeOptions = ref([]);    // PVE 节点列表（所属节点下拉用）

  $.diskPage.loadNodeOptions = async function() {
    try {
      var res = await authFetch('/api/admin/pve/nodes');
      var data = await res.json();
      $.diskPage.pveNodeOptions.value = (data && data.nodes) || [];
    } catch (e) {
      console.error('[disk] 加载 PVE 节点列表失败:', e.message);
    }
  };

  $.diskPage.diskSpecForm = ref({
    name: '', disk_type: 'NVME', storage_group_id: '', enabled: true,
    min_size_gb: 10, max_size_gb: 2000, price_per_gb: 0.8,
    quarterly_discount: 0, yearly_discount: 0, storage_pool: '', disk_format: 'qcow2',
    mbps_rd: '', mbps_rd_max: '', mbps_wr: '', mbps_wr_max: '',
    iops_rd: '', iops_rd_max: '', iops_wr: '', iops_wr_max: '',
    description: '', pve_node_id: null
  });
  $.diskPage.editingDiskSpec = ref(null);
  $.diskPage.showDiskSpecModal = ref(false);
  $.diskPage.showQosSection = ref(false);

  $.diskPage.loadDiskSpecs = async function() {
    try {
      var res = await authFetch('/api/disk-specs');
      if (!res.ok) throw new Error(window.__i18n.t('common.loadFailed'));
      $.diskPage.diskSpecs.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载规格失败:', e.message);
    }
  };

  // 加载 PVE 存储列表（供存储位置下拉）。多节点：可选 nodeId 指定节点；无 nodeId 时加载默认节点并同步卡片用量列表
  $.diskPage.loadPveStorages = async function(nodeId) {
    try {
      var url = '/api/pve-storages' + (nodeId ? '?node_id=' + nodeId : '');
      var res = await authFetch(url);
      if (!res.ok) throw new Error(window.__i18n.t('common.loadFailed'));
      var list = await res.json();
      $.diskPage.diskSpecStorages.value = list;
      if (!nodeId) {
        $.diskPage.pveStorages.value = list;
      }
    } catch (e) {
      console.error('[disk] 加载 PVE 存储列表失败:', e.message);
    }
  };

  // 所属节点变更：按所选节点重新加载存储池下拉（无节点 = 默认节点）
  $.diskPage.onNodeChange = function() {
    var nid = $.diskPage.diskSpecForm.value.pve_node_id || null;
    // 切节点时清空旧存储池（旧节点存储对该节点无效）
    $.diskPage.diskSpecForm.value.storage_pool = '';
    $.diskPage.diskSpecForm.value.disk_format = 'qcow2';
    // 分组按可用区过滤后，若当前所选分组不在可选集内则清空
    var gid = $.diskPage.diskSpecForm.value.storage_group_id;
    if (gid) {
      var ok = ($.diskPage.filteredStorageGroups.value || []).some(function (g) { return Number(g.id) === Number(gid); });
      if (!ok) $.diskPage.diskSpecForm.value.storage_group_id = '';
    }
    if (nid) {
      $.diskPage.loadPveStorages(nid);
    } else {
      // 未选择节点：存储位置不显示任何存储
      $.diskPage.diskSpecStorages.value = [];
    }
  };

  // 格式化存储容量显示
  $.diskPage.formatStorageSize = function(gb) {
    if (!gb || gb <= 0) return window.__i18n.t('admin.disk.unknown');
    if (gb >= 1024) return (gb / 1024).toFixed(1) + ' TiB';
    return gb + ' GiB';
  };

  // 存储使用率颜色分级（文档 3.3.3）
  $.diskPage.getStorageUsageClass = function(pct) {
    if (pct >= 90) return 'bg-danger';
    if (pct >= 70) return 'bg-warning';
    return 'bg-success';
  };

  // 存储进度条颜色（加深）
  $.diskPage.getStorageBarColor = function(pct) {
    if (pct >= 90) return '#dc3545';
    if (pct >= 70) return '#fd7e14';
    return '#198754';
  };

  // 根据存储池名称查找 PVE 存储信息（卡片用量用 pveStorages，弹窗存储池用 diskSpecStorages，双源兜底）
  $.diskPage.getStorageInfo = function(poolName) {
    if (!poolName) return null;
    var storages = $.diskPage.pveStorages.value || [];
    for (var i = 0; i < storages.length; i++) {
      if (storages[i].storage === poolName) return storages[i];
    }
    var specStorages = $.diskPage.diskSpecStorages.value || [];
    for (var j = 0; j < specStorages.length; j++) {
      if (specStorages[j].storage === poolName) return specStorages[j];
    }
    return null;
  };

  // 判断所选存储是否为文件系统类（需选择磁盘格式扩展名）
  $.diskPage.isFileSystemStorage = function(poolName) {
    var info = $.diskPage.getStorageInfo(poolName);
    if (!info || !info.type) return false;
    return ['dir', 'btrfs', 'nfs', 'cephfs'].indexOf(info.type) !== -1;
  };

  // 切换存储位置时联动重置磁盘格式
  $.diskPage.onStoragePoolChange = function() {
    if ($.diskPage.isFileSystemStorage($.diskPage.diskSpecForm.value.storage_pool)) {
      // 文件系统存储默认 qcow2
      if (!$.diskPage.diskSpecForm.value.disk_format) {
        $.diskPage.diskSpecForm.value.disk_format = 'qcow2';
      }
    } else {
      // 块设备存储清空格式
      $.diskPage.diskSpecForm.value.disk_format = '';
    }
  };

  $.diskPage.openDiskSpecForm = async function(spec) {
    $.diskPage.editingDiskSpec.value = spec;
    if (spec) {
      $.diskPage.diskSpecForm.value = {
        name: spec.name || '', disk_type: spec.disk_type || 'NVME',
        storage_group_id: spec.storage_group_id || '', enabled: spec.enabled === 1 || spec.enabled === true,
        min_size_gb: spec.min_size_gb || 10, max_size_gb: spec.max_size_gb || 2000,
        price_per_gb: spec.price_per_gb || 0.8,
        quarterly_discount: spec.quarterly_discount || 0, yearly_discount: spec.yearly_discount || 0,
        storage_pool: spec.storage_pool || '',
        disk_format: spec.disk_format || 'qcow2',
        mbps_rd: spec.mbps_rd || '', mbps_rd_max: spec.mbps_rd_max || '',
        mbps_wr: spec.mbps_wr || '', mbps_wr_max: spec.mbps_wr_max || '',
        iops_rd: spec.iops_rd || '', iops_rd_max: spec.iops_rd_max || '',
        iops_wr: spec.iops_wr || '', iops_wr_max: spec.iops_wr_max || '',
        description: spec.description || '',
        pve_node_id: spec.pve_node_id || null
      };
    } else {
      $.diskPage.diskSpecForm.value = {
        name: '', disk_type: 'NVME', storage_group_id: '', enabled: true,
        min_size_gb: 10, max_size_gb: 2000, price_per_gb: 0.8,
        quarterly_discount: 0, yearly_discount: 0, storage_pool: '', disk_format: 'qcow2',
        mbps_rd: '', mbps_rd_max: '', mbps_wr: '', mbps_wr_max: '',
        iops_rd: '', iops_rd_max: '', iops_wr: '', iops_wr_max: '',
        description: '', pve_node_id: null
      };
    }
    $.diskPage.showQosSection.value = false;
    // 先加载 PVE 节点列表；有节点才加载该节点存储池（未选节点时存储位置为空）
    await $.diskPage.loadNodeOptions();
    var nid = $.diskPage.diskSpecForm.value.pve_node_id || null;
    if (nid) {
      await $.diskPage.loadPveStorages(nid);
    } else {
      $.diskPage.diskSpecStorages.value = [];
    }
    $.diskPage.showDiskSpecModal.value = true;
    $.bsModalShow('diskSpecModal');
  };

  $.diskPage.saveDiskSpec = async function() {
    try {
      var f = $.diskPage.diskSpecForm.value;
      if (!f.name || !f.name.trim()) return alert(window.__i18n.t('admin.disk.specNameRequired'));
      if (!f.storage_group_id) return alert(window.__i18n.t('dash.disk.pickGroup'));
      if (!f.storage_pool || !f.storage_pool.trim()) return alert(window.__i18n.t('admin.disk.pickStorage'));

      var url = $.diskPage.editingDiskSpec.value
        ? '/api/disk-specs/' + $.diskPage.editingDiskSpec.value.id
        : '/api/disk-specs';
      var method = $.diskPage.editingDiskSpec.value ? 'PUT' : 'POST';

      var res = await authFetchJson(url, {
        method: method,
        body: JSON.stringify({
          name: f.name.trim(), disk_type: f.disk_type,
          storage_group_id: parseInt(f.storage_group_id),
          enabled: f.enabled, min_size_gb: parseInt(f.min_size_gb) || 10,
          max_size_gb: parseInt(f.max_size_gb) || 2000,
          price_per_gb: parseFloat(f.price_per_gb) || 0,
          quarterly_discount: parseInt(f.quarterly_discount) || 0,
          yearly_discount: parseInt(f.yearly_discount) || 0,
          storage_pool: f.storage_pool.trim(),
          disk_format: f.disk_format || null,
          mbps_rd: f.mbps_rd || null, mbps_rd_max: f.mbps_rd_max || null,
          mbps_wr: f.mbps_wr || null, mbps_wr_max: f.mbps_wr_max || null,
          iops_rd: f.iops_rd || null, iops_rd_max: f.iops_rd_max || null,
          iops_wr: f.iops_wr || null, iops_wr_max: f.iops_wr_max || null,
          description: f.description || '',
          pve_node_id: f.pve_node_id || null
        })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('common.failed'));
      $.bsModalHide('diskSpecModal');
      await $.diskPage.loadDiskSpecs();
    } catch (e) {
      alert(window.__i18n.t('common.opFailedMsg') + e.message);
    }
  };

  $.diskPage.deleteDiskSpec = async function(id) {
    var spec = ($.diskPage.diskSpecs.value || []).find(function(s) { return s.id === id; });
    var name = spec ? (spec.disk_type + '|' + spec.name) : '';
    if (!(await customConfirm(window.__i18n.t('admin.disk.deleteSpecConfirm') + name + '」？'))) return;
    try {
      var res = await authFetch('/api/disk-specs/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('admin.logs.deleteFailed'));
      await $.diskPage.loadDiskSpecs();
    } catch (e) {
      alert(window.__i18n.t('common.deleteFailedMsg') + e.message);
    }
  };

  // 计算折扣后单价（显示用 2 位小数，计算时用原始 parseFloat 值保证精度）
  $.diskPage.calcDiscountedPrice = function(spec) {
    var monthly = parseFloat(spec.price_per_gb) || 0;
    return {
      quarterly: (monthly * (1 - (parseInt(spec.quarterly_discount) || 0) / 100)).toFixed(2),
      yearly: (monthly * (1 - (parseInt(spec.yearly_discount) || 0) / 100)).toFixed(2)
    };
  };

  // ===== 生命周期配置 =====
  $.diskPage.lifecycleConfig = ref(null);
  $.diskPage.editingLifecycle = ref(false);
  $.diskPage.lifecycleSaveMsg = ref('');
  $.diskPage.lifecycleForm = ref({
    warn_days: 7, warn_frequency: 'daily', grace_days: 3,
    grace_frequency: 'twice_daily',
    retention_days: 15, auto_renew_days: 1
  });

  $.diskPage.loadLifecycleConfig = async function() {
    try {
      var res = await authFetch('/api/lifecycle-config');
      if (!res.ok) throw new Error(window.__i18n.t('common.loadFailed'));
      var data = await res.json();
      $.diskPage.lifecycleConfig.value = data;
      $.diskPage.lifecycleForm.value = {
        warn_days: data.warn_days || 7,
        warn_frequency: data.warn_frequency || 'daily',
        grace_days: data.grace_days || 3,
        grace_frequency: data.grace_frequency || 'twice_daily',
        retention_days: data.retention_days || 15,
        auto_renew_days: data.auto_renew_days || 1
      };
    } catch (e) {
      console.error('[disk] 加载生命周期配置失败:', e.message);
    }
  };

  $.diskPage.saveLifecycleConfig = async function() {
    try {
      var f = $.diskPage.lifecycleForm.value;
      var res = await authFetchJson('/api/lifecycle-config', {
        method: 'PUT',
        body: JSON.stringify(f)
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('common.saveFailed'));
      $.diskPage.editingLifecycle.value = false;
      await $.diskPage.loadLifecycleConfig();
      alert(window.__i18n.t('common.saveOk'));
    } catch (e) {
      alert(window.__i18n.t('common.saveFailedMsg') + e.message);
    }
  };

  $.diskPage.cancelEditLifecycle = function() {
    $.diskPage.editingLifecycle.value = false;
    $.diskPage.loadLifecycleConfig();
  };

  $.diskPage.resetLifecycleDefaults = function() {
    $.diskPage.lifecycleForm.value = {
      warn_days: 7, warn_frequency: 'daily', grace_days: 3,
      grace_frequency: 'twice_daily',
      retention_days: 15, auto_renew_days: 1
    };
  };

  // ===== 数据盘管理 =====
  $.diskPage.allDisks = ref([]);
  $.diskPage.selectedDiskIds = ref([]);
  $.diskPage.batchGroupId = ref(null);
  $.diskPage.showBatchEditGroupModal = ref(false);

  $.diskPage.selectAllDisks = function(checked) {
    if (checked) {
      $.diskPage.selectedDiskIds.value = $.diskPage.allDisks.value
        .filter(function(d) { return d.status !== 'destroyed'; })
        .map(function(d) { return d.id; });
    } else {
      $.diskPage.selectedDiskIds.value = [];
    }
  };

  $.diskPage.openBatchEditGroup = function() {
    if ($.diskPage.selectedDiskIds.value.length === 0) return alert(window.__i18n.t('admin.disk.pickFirst'));
    $.diskPage.batchGroupId.value = null;
    $.diskPage.showBatchEditGroupModal.value = true;
    $.bsModalShow('batchEditGroupModal');
  };

  $.diskPage.submitBatchEditGroup = async function() {
    var groupId = $.diskPage.batchGroupId.value;
    if (!groupId) return alert(window.__i18n.t('admin.disk.pickTargetGroup'));
    var ids = $.diskPage.selectedDiskIds.value;
    if (ids.length === 0) return alert(window.__i18n.t('admin.disk.pickDisk'));

    try {
      var res = await authFetchJson('/api/admin/disks/batch/storage-group', {
        method: 'PUT',
        body: JSON.stringify({ disk_ids: ids, storage_group_id: groupId })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('admin.disk.modifyFailed'));
      $.bsModalHide('batchEditGroupModal');
      $.diskPage.showBatchEditGroupModal.value = false;
      alert(window.__i18n.t('admin.disk.modifyOk1') + data.updated + '/' + data.total + window.__i18n.t('admin.disk.countSuffix'));
      $.diskPage.selectedDiskIds.value = [];
      await $.diskPage.loadAllDisks();
    } catch (e) {
      alert(window.__i18n.t('admin.disk.modifyFailedMsg') + e.message);
    }
  };

  $.diskPage.loadAllDisks = async function() {
    try {
      var res = await authFetch('/api/admin/disks');
      if (!res.ok) throw new Error(window.__i18n.t('common.loadFailed'));
      var data = await res.json();
      $.diskPage.allDisks.value = data.rows || data.data || data || [];
    } catch (e) {
      console.error('[disk] 加载数据盘失败:', e.message);
    }
  };

  $.diskPage.destroyDisk = async function(disk) {
    if (!disk) return;
    var ok = await customConfirm(window.__i18n.t('dash.disk.destroyConfirm1') + (disk.disk_name || disk.volume_id) + window.__i18n.t('dash.disk.destroyAdminMid'));
    if (!ok) return;
    try {
      var res = await authFetch('/api/admin/disks/' + disk.id + '/destroy', { method: 'POST' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('dash.disk.destroyFailed'));
      if (data.refund_amount > 0) {
        alert(window.__i18n.tFormat('dash.disk.destroyRefunded', data.refund_amount));
      } else {
        alert(window.__i18n.t('dash.disk.destroyed'));
      }
      await $.diskPage.loadAllDisks();
    } catch (e) {
      alert(window.__i18n.tFormat('dash.disk.destroyFailedMsg', e.message));
    }
  };

  $.diskPage.hardDeleteDisk = async function(disk) {
    if (!disk) return;
    var ok = await customConfirm(window.__i18n.t('dash.disk.deleteDestroyedConfirm'));
    if (!ok) return;
    try {
      var res = await authFetch('/api/admin/disks/' + disk.id + '/destroy', { method: 'POST' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('admin.logs.deleteFailed'));
      alert(window.__i18n.t('dash.disk.deleteFailed'));
      await $.diskPage.loadAllDisks();
    } catch (e) {
      alert(window.__i18n.t('common.deleteFailedMsg') + e.message);
    }
  };

  $.diskPage.importExistingDisks = async function() {
    var ok = await customConfirm(window.__i18n.t('admin.disk.importConfirm'));
    if (!ok) return;

    // 显示加载中弹窗
    var loadingEl = document.createElement('div');
    loadingEl.className = 'modal-backdrop fade show';
    loadingEl.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
    loadingEl.innerHTML = '<div style="background:var(--card-bg,#1e1e2e);border-radius:12px;padding:40px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.4);">'
      + '<div class="spinner-border text-primary" style="width:3rem;height:3rem;" role="status"></div>'
      + '<p class="mt-3 mb-0" style="color:var(--text-primary,#fff);font-size:16px;">' + window.__i18n.t('admin.disk.scanning') + '</p>'
      + '<p class="mt-1 mb-0" style="color:var(--text-secondary,#999);font-size:13px;">' + window.__i18n.t('admin.disk.pleaseWait') + '</p>'
      + '</div>';
    document.body.appendChild(loadingEl);

    try {
      var res = await authFetch('/api/disk-import', { method: 'POST' });
      var data = await res.json();
      // 移除加载弹窗
      document.body.removeChild(loadingEl);

      if (!res.ok) return alert(data.error || window.__i18n.t('admin.disk.importFailed'));
      var msg = window.__i18n.t('admin.disk.importDone');
      if (data.cleaned > 0) msg += window.__i18n.t('admin.disk.impCleanedNl') + data.cleaned + window.__i18n.t('admin.geSuffix');
      if (data.imported > 0) msg += window.__i18n.t('admin.disk.importedNewNl') + data.imported + window.__i18n.t('admin.geSuffix');
      if (data.skipped > 0) msg += window.__i18n.t('admin.disk.skippedNl') + data.skipped + window.__i18n.t('admin.geSuffix');
      if (data.unmatched > 0) msg += window.__i18n.t('admin.disk.unmatchedNl') + data.unmatched + window.__i18n.t('admin.geSuffix');
      alert(msg);
      await $.diskPage.loadAllDisks();
    } catch (e) {
      // 移除加载弹窗
      if (loadingEl.parentNode) document.body.removeChild(loadingEl);
      alert(window.__i18n.t('admin.disk.importFailedMsg') + e.message);
    }
  };

  // ===== 编辑磁盘 =====
  $.diskPage.editingDisk = ref(null);
  $.diskPage.editDiskForm = ref({ disk_name: '', storage_group_id: '', spec_id: null });
  $.diskPage.showEditDiskModal = ref(false);

  $.diskPage.openEditDiskForm = function(disk) {
    $.diskPage.editingDisk.value = disk;
    $.diskPage.editDiskForm.value = {
      disk_name: disk.disk_name || '',
      storage_group_id: disk.storage_group_id,
      spec_id: disk.spec_id
    };
    $.diskPage.showEditDiskModal.value = true;
    $.bsModalShow('editDiskModal');
  };

  // 规格变更时自动填充存储分组（但可手动调整）
  $.diskPage.onSpecChange = function() {
    var specId = $.diskPage.editDiskForm.value.spec_id;
    if (specId) {
      var spec = $.diskPage.diskSpecs.value.find(function(s) { return s.id === specId; });
      if (spec) {
        $.diskPage.editDiskForm.value.storage_group_id = spec.storage_group_id;
      }
    }
  };

  $.diskPage.saveEditDisk = async function() {
    try {
      var f = $.diskPage.editDiskForm.value;
      if (!f.disk_name || !f.disk_name.trim()) return alert(window.__i18n.t('admin.disk.nameRequired'));
      if (!f.storage_group_id) return alert(window.__i18n.t('dash.disk.pickGroup'));

      var res = await authFetchJson('/api/admin/disks/' + $.diskPage.editingDisk.value.id, {
        method: 'PUT',
        body: JSON.stringify({
          disk_name: f.disk_name.trim(),
          storage_group_id: parseInt(f.storage_group_id),
          spec_id: f.spec_id || null
        })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || window.__i18n.t('admin.disk.editFailed'));
      $.bsModalHide('editDiskModal');
      $.diskPage.showEditDiskModal.value = false;
      alert(window.__i18n.t('admin.disk.editOk'));
      await $.diskPage.loadAllDisks();
    } catch (e) {
      alert(window.__i18n.t('admin.disk.editFailedMsg') + e.message);
    }
  };

  // 辅助函数
  $.diskPage.formatDate = function(d) {
    if (!d) return '-';
    var date = new Date(d);
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0') + ' ' + String(date.getHours()).padStart(2, '0') + ':' + String(date.getMinutes()).padStart(2, '0');
  };

  $.diskPage.daysUntilExpire = function(expireTime) {
    if (!expireTime) return '-';
    var expire = new Date(expireTime);
    var now = new Date();
    var diff = expire - now;
    if (diff <= 0) return '0';
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  $.diskPage.getDiskStatusText = function(status) {
    var map = { free: window.__i18n.t('dash.disk.statusFree'), bound: window.__i18n.t('dash.disk.statusMounted'), grace: window.__i18n.t('dash.disk.statusGrace'), expired: window.__i18n.t('common.expired'), destroyed: window.__i18n.t('dash.disk.statusDestroyed') };
    return map[status] || status;
  };

  $.diskPage.getDiskStatusClass = function(status) {
    var map = {
      free: 'badge bg-success',
      bound: 'badge bg-primary',
      grace: 'badge bg-warning',
      expired: 'badge bg-danger',
      destroyed: 'badge bg-secondary'
    };
    return map[status] || 'badge bg-secondary';
  };

  // 初始化入口
  $.initDisk = function() {
    $.diskPage.loadStorageGroups();
    $.diskPage.loadDiskSpecs();
    $.diskPage.loadLifecycleConfig();
    $.diskPage.loadPveStorages();
    $.diskPage.loadAllDisks();
  };
})();
