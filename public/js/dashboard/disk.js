// public/js/dashboard/disk.js - 用户硬盘管理逻辑
// 安全设计：Vue 3 Options API + CSP nonce 合规，数据隔离由后端 SQL 层保证
// 注意：Vue 3 模板中 ref 自动解包，模板内 disks 即数组本身（不使用 .value）

(function() {
  var $ = window.__dashboard;
  if (!$) { console.error('[dashboard/disk.js] window.__dashboard not initialized'); return; }
  var Vue = window.Vue;
  var ref = Vue.ref;
  var computed = Vue.computed;

  // ===== 状态 =====
  $.disks = ref([]);
  $.diskOptions = ref({ groups: [], specs: [] });
  $.selectedDisks = ref([]);
  $.diskLoading = ref(false);

  // 购买弹窗状态
  $.showCreateDiskModal = ref(false);
  $.diskPurchaseForm = ref({
    spec_id: '', storage_group_id: '',
    capacity_gb: 100, disk_name: '',
    period: 'month', period_count: 1, quantity: 1, auto_renew: false
  });
  $.purchasePrice = ref(0);

  // 挂载弹窗状态
  $.showBindModal = ref(false);
  $.bindTargetDisk = ref(null);
  $.bindTargetVmid = ref('');
  $.userVmsForBind = ref([]);

  // 续费弹窗
  $.showRenewModal = ref(false);
  $.renewDisk = ref(null);
  $.renewPeriod = ref('month');
  $.renewPeriodCount = ref(1);
  $.renewAmount = ref(0);

  // 计算属性：从 diskOptions 安全提取 groups（Vue 3 模板自动解包）
  $.diskOptionsGroups = computed(function() {
    var opts = $.diskOptions.value;
    return (opts && opts.groups) ? opts.groups : [];
  });

  // 获取 token 的辅助函数
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

  // ===== 加载磁盘列表 =====
  $.loadDisks = async function() {
    $.diskLoading.value = true;
    try {
      var res = await authFetch('/api/disks');
      if (!res.ok) throw new Error('加载失败');
      $.disks.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载磁盘列表失败:', e.message);
    } finally {
      $.diskLoading.value = false;
    }
  };

  // ===== 加载购买选项 =====
  $.loadDiskOptions = async function() {
    try {
      var res = await authFetch('/api/disk-options');
      if (!res.ok) throw new Error('加载失败');
      $.diskOptions.value = await res.json();
    } catch (e) {
      console.error('[disk] 加载选项失败:', e.message);
    }
  };

  // ===== 计算价格 =====
  $.calcDiskPrice = function() {
    var f = $.diskPurchaseForm.value;
    if (!f.spec_id || !f.capacity_gb) { $.purchasePrice.value = 0; return; }
    var spec = ($.diskOptions.value.specs || []).find(function(s) { return s.id === parseInt(f.spec_id); });
    if (!spec) { $.purchasePrice.value = 0; return; }
    var monthly = parseFloat(spec.price_per_gb) * parseInt(f.capacity_gb);
    var months = f.period === 'quarter' ? 3 : f.period === 'year' ? 12 : 1;
    var discount = 0;
    if (f.period === 'quarter' && spec.quarterly_discount) discount = parseInt(spec.quarterly_discount);
    if (f.period === 'year' && spec.yearly_discount) discount = parseInt(spec.yearly_discount);
    var amount = monthly * months * (1 - discount / 100) * (parseInt(f.quantity) || 1);
    $.purchasePrice.value = parseFloat(amount.toFixed(2));
  };

  // 按存储分组过滤规格
  $.getSpecsByGroup = function(groupId) {
    if (!groupId) return [];
    var specs = $.diskOptions.value && $.diskOptions.value.specs ? $.diskOptions.value.specs : [];
    return specs.filter(function(s) {
      return s.storage_group_id === parseInt(groupId) && s.enabled;
    });
  };

  // 选择规格时自动设置容量范围
  $.onSpecChange = function() {
    var specId = $.diskPurchaseForm.value.spec_id;
    if (!specId) return;
    var spec = ($.diskOptions.value.specs || []).find(function(s) { return s.id === parseInt(specId); });
    if (spec) {
      $.diskPurchaseForm.value.capacity_gb = spec.min_size_gb;
      $.diskPurchaseForm.value.storage_group_id = spec.storage_group_id;
      $.calcDiskPrice();
    }
  };

  // ===== 打开购买弹窗 =====
  $.openCreateDiskModal = async function() {
    await $.loadDiskOptions();
    $.diskPurchaseForm.value = {
      spec_id: '', storage_group_id: '',
      capacity_gb: 100, disk_name: '',
      period: 'month', period_count: 1, quantity: 1, auto_renew: false
    };
    $.purchasePrice.value = 0;
    $.showCreateDiskModal.value = true;
  };

  // ===== 提交购买 =====
  $.submitPurchaseDisk = async function() {
    var f = $.diskPurchaseForm.value;
    if (!f.spec_id) { return alert('请选择硬盘规格'); }
    if (!f.capacity_gb || f.capacity_gb < 1) { return alert('请输入有效容量'); }
    try {
      var res = await authFetch('/api/disks/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spec_id: parseInt(f.spec_id),
          capacity_gb: parseInt(f.capacity_gb),
          disk_name: f.disk_name || '',
          period: f.period,
          period_count: parseInt(f.period_count) || 1,
          quantity: parseInt(f.quantity) || 1,
          auto_renew: f.auto_renew
        })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '购买失败');
      $.showCreateDiskModal.value = false;
      alert('购买成功');
      await $.loadDisks();
    } catch (e) {
      alert('购买失败: ' + e.message);
    }
  };

  // ===== 打开挂载弹窗 =====
  $.openBindModal = async function() {
    var diskId = $.selectedDisks.value[0];
    var disk = $.disks.value.find(function(d) { return d.id === diskId; });
    if (!disk) return alert('请先选择一块磁盘');
    if (disk.status !== 'free' && disk.status !== 'expired') {
      return alert('该磁盘状态不允许挂载');
    }
    $.bindTargetDisk.value = disk;
    $.bindTargetVmid.value = '';
    // 获取用户已关机的 VM 列表
    if ($.userVms && $.userVms.value) {
      $.userVmsForBind.value = $.userVms.value.filter(function(vm) {
        return vm.status && vm.status.status === 'stopped';
      });
    }
    $.showBindModal.value = true;
  };

  // ===== 提交挂载 =====
  $.submitBindDisk = async function() {
    var disk = $.bindTargetDisk.value;
    var vmid = $.bindTargetVmid.value;
    if (!vmid) { return alert('请选择目标虚拟机'); }
    try {
      var res = await authFetch('/api/disks/' + disk.id + '/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vmid: parseInt(vmid) })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '挂载失败');
      $.showBindModal.value = false;
      alert('挂载成功（总线: ' + data.bus + ', 设备号: ' + data.dev + '）');
      await $.loadDisks();
    } catch (e) {
      alert('挂载失败: ' + e.message);
    }
  };

  // ===== 卸载磁盘 =====
  $.unbindDisk = async function(disk) {
    if (!disk) return;
    if (!confirm('确定卸载磁盘 "' + (disk.disk_name || disk.volume_id) + '"?\n注意：请先关闭虚拟机')) return;
    try {
      var res = await authFetch('/api/disks/' + disk.id + '/unbind', {
        method: 'POST'
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '卸载失败');
      alert('卸载成功');
      await $.loadDisks();
    } catch (e) {
      alert('卸载失败: ' + e.message);
    }
  };

  // ===== 扩容磁盘 =====
  $.resizeDisk = async function(disk) {
    if (!disk) return;
    var newSize = prompt('当前容量：' + disk.capacity_gb + ' GiB\n请输入新容量（GiB）：', disk.capacity_gb + 10);
    if (!newSize) return;
    newSize = parseInt(newSize);
    if (isNaN(newSize) || newSize <= disk.capacity_gb) {
      return alert('新容量必须大于当前容量（' + disk.capacity_gb + ' GiB）');
    }
    try {
      var res = await authFetch('/api/disks/' + disk.id + '/resize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ capacity_gb: newSize })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '扩容失败');
      alert('扩容成功，新容量：' + data.new_capacity + ' GiB');
      await $.loadDisks();
    } catch (e) {
      alert('扩容失败: ' + e.message);
    }
  };

  // ===== 销毁磁盘 =====
  $.destroyDisk = async function(disk) {
    if (!disk) return;
    if (!confirm('确定销毁磁盘 "' + (disk.disk_name || disk.volume_id) + '"?\n此操作不可恢复！')) return;
    try {
      var res = await authFetch('/api/disks/' + disk.id + '/destroy', {
        method: 'POST'
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '销毁失败');
      alert('销毁成功');
      await $.loadDisks();
    } catch (e) {
      alert('销毁失败: ' + e.message);
    }
  };

  // ===== 续费 =====
  $.openRenewModal = function(disk) {
    $.renewDisk.value = disk;
    $.renewPeriod.value = 'month';
    $.renewPeriodCount.value = 1;
    $.calcRenewAmount();
    $.showRenewModal.value = true;
  };

  $.calcRenewAmount = function() {
    var disk = $.renewDisk.value;
    if (!disk) { $.renewAmount.value = 0; return; }
    var monthly = parseFloat(disk.price_per_gb) * parseInt(disk.capacity_gb);
    var months = $.renewPeriod.value === 'quarter' ? 3 : $.renewPeriod.value === 'year' ? 12 : 1;
    var discount = 0;
    if ($.renewPeriod.value === 'quarter' && disk.quarterly_discount) discount = parseInt(disk.quarterly_discount);
    if ($.renewPeriod.value === 'year' && disk.yearly_discount) discount = parseInt(disk.yearly_discount);
    $.renewAmount.value = parseFloat((monthly * months * (1 - discount / 100)).toFixed(2));
  };

  $.submitRenewDisk = async function() {
    var disk = $.renewDisk.value;
    if (!disk) return;
    try {
      var res = await authFetch('/api/disks/' + disk.id + '/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period: $.renewPeriod.value,
          period_count: parseInt($.renewPeriodCount.value) || 1
        })
      });
      var data = await res.json();
      if (!res.ok) return alert(data.error || '续费失败');
      $.showRenewModal.value = false;
      alert('续费成功');
      await $.loadDisks();
    } catch (e) {
      alert('续费失败: ' + e.message);
    }
  };

  // ===== 工具函数 =====
  $.getDiskStatusText = function(status) {
    var map = { free: '空闲', bound: '已绑定', grace: '宽限期', expired: '已到期', destroyed: '已销毁' };
    return map[status] || status;
  };

  $.getDiskStatusClass = function(status) {
    var map = { free: 'badge bg-success', bound: 'badge bg-primary', grace: 'badge bg-warning', expired: 'badge bg-danger', destroyed: 'badge bg-secondary' };
    return map[status] || 'badge bg-secondary';
  };

  $.getDiskTypeBadge = function(type) {
    var map = { NVME: 'badge bg-info', SATA: 'badge bg-secondary', HDD: 'badge bg-warning', U2: 'badge bg-dark' };
    return map[type] || 'badge bg-secondary';
  };

  // 初始化入口
  $.initDisk = function() {
    // 不在初始化时加载磁盘，切换到 disk section 时才加载（在 core.js switchSection 中触发）
  };
})();
