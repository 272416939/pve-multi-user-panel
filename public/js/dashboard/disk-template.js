// public/js/dashboard/disk-template.js - 用户硬盘管理模板
// 安全设计：使用 Vue {{ }} 插值，无 v-html 渲染用户数据，CSP nonce 合规
// 注意：Vue 3 模板中 ref 自动解包，模板内 disks 即数组本身（不使用 .value）

(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];

  window.__dashboardTemplateParts.push(`
<!-- 硬盘管理 -->
<div v-show="activeSection === 'disk'">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h4 class="module-title mb-0">硬盘管理</h4>
  </div>

  <!-- 顶栏功能按钮 -->
  <div class="mb-3">
    <button class="btn btn-primary btn-sm me-2" @click="openCreateDiskModal">新建</button>
    <button class="btn btn-outline-secondary btn-sm me-2" @click="openBindModal" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'free')">挂载</button>
    <button class="btn btn-outline-secondary btn-sm me-2" @click="unbindDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'bound')">卸载</button>
    <button class="btn btn-outline-danger btn-sm me-2" @click="destroyDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status === 'bound')">销毁</button>
    <button class="btn btn-outline-primary btn-sm" @click="resizeDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1">扩容</button>
  </div>

  <!-- 加载中 -->
  <div v-if="diskLoading" class="text-center py-5">
    <div class="spinner-border text-primary" role="status"><span class="visually-hidden">加载中...</span></div>
  </div>

  <!-- 磁盘列表 -->
  <div v-else class="table-container">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th style="width:40px"><input type="checkbox" @change="selectedDisks = $event.target.checked ? disks.map(function(d) { return d.id; }) : []" :checked="selectedDisks.length === disks.length && disks.length > 0"></th>
            <th>ID</th>
            <th>名称</th>
            <th>规格名称</th>
            <th>类型</th>
            <th>容量</th>
            <th>状态</th>
            <th>绑定虚拟机</th>
            <th>到期时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="disk in disks" :key="disk.id">
            <td><input type="checkbox" v-model="selectedDisks" :value="disk.id"></td>
            <td>{{ disk.id }}</td>
            <td>{{ disk.disk_name || '-' }}</td>
            <td>{{ disk.spec_id ? disk.spec_id : '-' }}</td>
            <td><span :class="getDiskTypeBadge(disk.disk_type)">{{ disk.disk_type }}</span></td>
            <td>{{ disk.capacity_gb }} GiB</td>
            <td><span :class="getDiskStatusClass(disk.status)">{{ getDiskStatusText(disk.status) }}</span></td>
            <td>{{ disk.bind_vmid ? 'VM-' + disk.bind_vmid : '-' }}</td>
            <td :class="getExpiryColor(disk.expire_time)">{{ disk.expire_time ? formatDate(disk.expire_time) : '-' }}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary" @click="openRenewModal(disk)" :disabled="disk.status === 'destroyed'">续费</button>
            </td>
          </tr>
          <tr v-if="disks.length === 0">
            <td colspan="10" class="text-center text-muted py-4">暂无硬盘，点击"新建"购买数据盘</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- 新建硬盘弹窗 -->
<div class="modal fade" id="createDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">购买数据盘</h5>
        <pv-button type="button" variant="close" @click="showCreateDiskModal = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">存储分组</label>
          <select class="form-select" v-model="diskPurchaseForm.storage_group_id" @change="diskPurchaseForm.spec_id = ''; calcDiskPrice()">
            <option value="">请选择</option>
            <option v-for="g in diskOptionsGroups" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label">硬盘规格</label>
          <select class="form-select" v-model="diskPurchaseForm.spec_id" @change="onSpecChange">
            <option value="">请选择</option>
            <option v-for="s in getSpecsByGroup(diskPurchaseForm.storage_group_id)" :key="s.id" :value="s.id">
              {{ s.name }} ({{ s.disk_type }}) - ￥{{ s.price_per_gb }}/GiB/月
            </option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label">容量 (GiB)</label>
          <div class="d-flex align-items-center gap-2">
            <input class="form-control" type="range" v-model.number="diskPurchaseForm.capacity_gb" min="10" max="2000" style="flex:1">
            <input class="form-control" type="number" v-model.number="diskPurchaseForm.capacity_gb" min="10" style="width:100px">
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">硬盘名称</label>
          <input class="form-control" v-model="diskPurchaseForm.disk_name" maxlength="100" placeholder="选填">
        </div>
        <div class="mb-3">
          <label class="form-label">购买时长</label>
          <div class="d-flex gap-2">
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'month' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'month'; calcDiskPrice()">月付</button>
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'quarter' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'quarter'; calcDiskPrice()">季付</button>
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'year' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'year'; calcDiskPrice()">年付</button>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">购买数量</label>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary" @click="diskPurchaseForm.quantity = Math.max(1, (diskPurchaseForm.quantity || 1) - 1); calcDiskPrice()">-</button>
            <span class="fw-bold" style="width:40px;text-align:center">{{ diskPurchaseForm.quantity }}</span>
            <button class="btn btn-sm btn-outline-secondary" @click="diskPurchaseForm.quantity = Math.min(100, (diskPurchaseForm.quantity || 1) + 1); calcDiskPrice()">+</button>
            <span class="text-muted small ms-2">块</span>
          </div>
        </div>
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model="diskPurchaseForm.auto_renew" id="autoRenew">
            <label class="form-check-label" for="autoRenew">自动续费</label>
          </div>
        </div>
        <div class="alert alert-info py-2 mb-0 text-center">
          总价：<strong class="fs-5">￥{{ purchasePrice }}</strong>
        </div>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" @click="showCreateDiskModal = false" variant="outline">关闭</pv-button>
        <pv-button @click="submitPurchaseDisk" variant="primary" :disabled="!diskPurchaseForm.spec_id || purchasePrice <= 0">确定</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 挂载弹窗 -->
<div class="modal fade" id="bindDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">挂载磁盘</h5>
        <pv-button type="button" variant="close" @click="showBindModal = false"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="bindTargetDisk">磁盘：{{ bindTargetDisk.disk_name || bindTargetDisk.volume_id }} ({{ bindTargetDisk.capacity_gb }} GiB)</p>
        <div class="mb-3">
          <label class="form-label">目标虚拟机（仅显示已关机 VM）</label>
          <select class="form-select" v-model="bindTargetVmid">
            <option value="">请选择</option>
            <option v-for="vm in userVmsForBind" :key="vm.id" :value="vm.vm_id">{{ vm.name || ('VM ' + vm.vm_id) }}</option>
          </select>
          <div v-if="userVmsForBind.length === 0" class="text-warning small mt-1">没有已关机的虚拟机</div>
        </div>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" @click="showBindModal = false" variant="outline">取消</pv-button>
        <pv-button @click="submitBindDisk" variant="primary" :disabled="!bindTargetVmid">确定挂载</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 续费弹窗 -->
<div class="modal fade" id="renewDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">续费磁盘</h5>
        <pv-button type="button" variant="close" @click="showRenewModal = false"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="renewDisk">磁盘：{{ renewDisk.disk_name || renewDisk.volume_id }} ({{ renewDisk.capacity_gb }} GiB)</p>
        <div class="mb-3">
          <label class="form-label">续费时长</label>
          <div class="d-flex gap-2">
            <button class="btn btn-sm" :class="renewPeriod === 'month' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'month'; calcRenewAmount()">月付</button>
            <button class="btn btn-sm" :class="renewPeriod === 'quarter' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'quarter'; calcRenewAmount()">季付</button>
            <button class="btn btn-sm" :class="renewPeriod === 'year' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'year'; calcRenewAmount()">年付</button>
          </div>
        </div>
        <div class="alert alert-info py-2 mb-0 text-center">
          续费金额：<strong class="fs-5">￥{{ renewAmount }}</strong>
        </div>
      </div>
      <div class="modal-footer" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" @click="showRenewModal = false" variant="outline">取消</pv-button>
        <pv-button @click="submitRenewDisk" variant="primary" :disabled="renewAmount <= 0">确定续费</pv-button>
      </div>
    </div>
  </div>
</div>
  `);
})();
