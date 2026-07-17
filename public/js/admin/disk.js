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
    return localStorage.getItem('token');
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
  $.diskPage.storageGroupForm = ref({ name: '', sort_order: 0 });
  $.diskPage.editingStorageGroup = ref(null);
  $.diskPage.showStorageGroupModal = ref(false);

  $.diskPage.loadStorageGroups = async function() {
    try {
      var res = await authFetch('/api/storage-groups');
      if (!res.ok) throw new Error('加载失败');
      $.diskPage.storageGroups.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载存储分组失败:', e.message);
    }
  };

  $.diskPage.openStorageGroupForm = function(group) {
    $.diskPage.editingStorageGroup.value = group;
    $.diskPage.storageGroupForm.value = {
      name: group ? group.name : '',
      sort_order: group ? group.sort_order : 0
    };
    $.diskPage.showStorageGroupModal.value = true;
  };

  $.diskPage.saveStorageGroup = async function() {
    try {
      var f = $.diskPage.storageGroupForm.value;
      if (!f.name || !f.name.trim()) return alert('请输入分组名称');

      var url = $.diskPage.editingStorageGroup.value
        ? '/api/storage-groups/' + $.diskPage.editingStorageGroup.value.id
        : '/api/storage-groups';
      var method = $.diskPage.editingStorageGroup.value ? 'PUT' : 'POST';

      var res = await authFetchJson(url, {
        method: method,
        body: JSON.stringify({ name: f.name.trim(), sort_order: parseInt(f.sort_order) || 0 })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '操作失败');
      $.diskPage.showStorageGroupModal.value = false;
      await $.diskPage.loadStorageGroups();
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  };

  $.diskPage.deleteStorageGroup = async function(id) {
    if (!confirm('确定删除该存储分组？')) return;
    try {
      var res = await authFetch('/api/storage-groups/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '删除失败');
      await $.diskPage.loadStorageGroups();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  // ===== 硬盘规格管理 =====
  $.diskPage.diskSpecs = ref([]);
  $.diskPage.diskSpecForm = ref({
    name: '', disk_type: 'NVME', storage_group_id: '', enabled: true,
    min_size_gb: 10, max_size_gb: 2000, price_per_gb: 0.8,
    quarterly_discount: 0, yearly_discount: 0, storage_pool: '',
    mbps_rd: '', mbps_rd_max: '', mbps_wr: '', mbps_wr_max: '',
    iops_rd: '', iops_rd_max: '', iops_wr: '', iops_wr_max: '',
    description: ''
  });
  $.diskPage.editingDiskSpec = ref(null);
  $.diskPage.showDiskSpecModal = ref(false);
  $.diskPage.showQosSection = ref(false);

  $.diskPage.loadDiskSpecs = async function() {
    try {
      var res = await authFetch('/api/disk-specs');
      if (!res.ok) throw new Error('加载失败');
      $.diskPage.diskSpecs.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载规格失败:', e.message);
    }
  };

  $.diskPage.openDiskSpecForm = function(spec) {
    $.diskPage.editingDiskSpec.value = spec;
    if (spec) {
      $.diskPage.diskSpecForm.value = {
        name: spec.name || '', disk_type: spec.disk_type || 'NVME',
        storage_group_id: spec.storage_group_id || '', enabled: spec.enabled === 1 || spec.enabled === true,
        min_size_gb: spec.min_size_gb || 10, max_size_gb: spec.max_size_gb || 2000,
        price_per_gb: spec.price_per_gb || 0.8,
        quarterly_discount: spec.quarterly_discount || 0, yearly_discount: spec.yearly_discount || 0,
        storage_pool: spec.storage_pool || '',
        mbps_rd: spec.mbps_rd || '', mbps_rd_max: spec.mbps_rd_max || '',
        mbps_wr: spec.mbps_wr || '', mbps_wr_max: spec.mbps_wr_max || '',
        iops_rd: spec.iops_rd || '', iops_rd_max: spec.iops_rd_max || '',
        iops_wr: spec.iops_wr || '', iops_wr_max: spec.iops_wr_max || '',
        description: spec.description || ''
      };
    } else {
      $.diskPage.diskSpecForm.value = {
        name: '', disk_type: 'NVME', storage_group_id: '', enabled: true,
        min_size_gb: 10, max_size_gb: 2000, price_per_gb: 0.8,
        quarterly_discount: 0, yearly_discount: 0, storage_pool: '',
        mbps_rd: '', mbps_rd_max: '', mbps_wr: '', mbps_wr_max: '',
        iops_rd: '', iops_rd_max: '', iops_wr: '', iops_wr_max: '',
        description: ''
      };
    }
    $.diskPage.showQosSection.value = false;
    $.diskPage.showDiskSpecModal.value = true;
  };

  $.diskPage.saveDiskSpec = async function() {
    try {
      var f = $.diskPage.diskSpecForm.value;
      if (!f.name || !f.name.trim()) return alert('请输入规格名称');
      if (!f.storage_group_id) return alert('请选择存储分组');
      if (!f.storage_pool || !f.storage_pool.trim()) return alert('请选择存储位置');

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
          mbps_rd: f.mbps_rd || null, mbps_rd_max: f.mbps_rd_max || null,
          mbps_wr: f.mbps_wr || null, mbps_wr_max: f.mbps_wr_max || null,
          iops_rd: f.iops_rd || null, iops_rd_max: f.iops_rd_max || null,
          iops_wr: f.iops_wr || null, iops_wr_max: f.iops_wr_max || null,
          description: f.description || ''
        })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '操作失败');
      $.diskPage.showDiskSpecModal.value = false;
      await $.diskPage.loadDiskSpecs();
    } catch (e) {
      alert('操作失败: ' + e.message);
    }
  };

  $.diskPage.deleteDiskSpec = async function(id) {
    if (!confirm('确定删除该规格？')) return;
    try {
      var res = await authFetch('/api/disk-specs/' + id, { method: 'DELETE' });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '删除失败');
      await $.diskPage.loadDiskSpecs();
    } catch (e) {
      alert('删除失败: ' + e.message);
    }
  };

  // 计算折扣后单价
  $.diskPage.calcDiscountedPrice = function(spec) {
    var monthly = parseFloat(spec.price_per_gb) || 0;
    return {
      quarterly: (monthly * (1 - (parseInt(spec.quarterly_discount) || 0) / 100)).toFixed(4),
      yearly: (monthly * (1 - (parseInt(spec.yearly_discount) || 0) / 100)).toFixed(4)
    };
  };

  // ===== 生命周期配置 =====
  $.diskPage.lifecycleConfig = ref(null);
  $.diskPage.editingLifecycle = ref(false);
  $.diskPage.lifecycleForm = ref({
    warn_days: 7, warn_frequency: 'daily', grace_days: 3,
    grace_frequency: 'twice_daily', shutdown_timeout: 300,
    retention_days: 15, check_time: '02:00', auto_renew_days: 1
  });

  $.diskPage.loadLifecycleConfig = async function() {
    try {
      var res = await authFetch('/api/lifecycle-config');
      if (!res.ok) throw new Error('加载失败');
      var data = await res.json();
      $.diskPage.lifecycleConfig.value = data;
      $.diskPage.lifecycleForm.value = {
        warn_days: data.warn_days || 7,
        warn_frequency: data.warn_frequency || 'daily',
        grace_days: data.grace_days || 3,
        grace_frequency: data.grace_frequency || 'twice_daily',
        shutdown_timeout: data.shutdown_timeout || 300,
        retention_days: data.retention_days || 15,
        check_time: data.check_time || '02:00',
        auto_renew_days: data.auto_renew_days || 1
      };
    } catch (e) {
      console.error('[disk] 加载生命周期配置失败:', e.message);
    }
  };

  $.diskPage.editLifecycle = function() {
    $.diskPage.editingLifecycle.value = true;
  };

  $.diskPage.saveLifecycleConfig = async function() {
    try {
      var f = $.diskPage.lifecycleForm.value;
      var res = await authFetchJson('/api/lifecycle-config', {
        method: 'PUT',
        body: JSON.stringify(f)
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '保存失败');
      $.diskPage.editingLifecycle.value = false;
      await $.diskPage.loadLifecycleConfig();
    } catch (e) {
      alert('保存失败: ' + e.message);
    }
  };

  $.diskPage.cancelEditLifecycle = function() {
    $.diskPage.editingLifecycle.value = false;
    $.diskPage.loadLifecycleConfig();
  };

  $.diskPage.resetLifecycleDefaults = function() {
    $.diskPage.lifecycleForm.value = {
      warn_days: 7, warn_frequency: 'daily', grace_days: 3,
      grace_frequency: 'twice_daily', shutdown_timeout: 300,
      retention_days: 15, check_time: '02:00', auto_renew_days: 1
    };
  };

  // 初始化入口
  $.initDisk = function() {
    $.diskPage.loadStorageGroups();
    $.diskPage.loadDiskSpecs();
    $.diskPage.loadLifecycleConfig();
  };
})();
