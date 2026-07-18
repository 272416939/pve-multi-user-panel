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
  <div class="mb-3 d-flex gap-2 flex-wrap">
    <pv-button variant="glass" size="sm" @click="openCreateDiskModal">新建</pv-button>
    <pv-button variant="outline" size="sm" @click="openBindModal" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'free') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? 'legacy磁盘随VM管理' : ''">挂载</pv-button>
    <pv-button variant="outline" size="sm" @click="unbindDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'bound') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? 'legacy磁盘随VM管理' : ''">卸载</pv-button>
    <pv-button variant="outline-danger" size="sm" @click="destroyDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status === 'bound') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? 'legacy磁盘随VM管理' : ''">销毁</pv-button>
    <pv-button variant="outline-warning" size="sm" @click="resizeDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="selectedDisks.length !== 1 || selectedDiskCannotResize()" :title="selectedDiskResizeTitle()">扩容</pv-button>
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
              <th class="text-center">ID</th>
              <th>名称</th>
              <th>存储分组</th>
              <th>规格名称</th>
              <th class="text-center">类型</th>
              <th class="text-center">容量</th>
              <th class="text-center">状态</th>
              <th class="text-center">绑定虚拟机</th>
              <th class="text-center">到期时间</th>
              <th class="text-center">剩余天数</th>
              <th class="text-center">自动续费</th>
              <th class="text-center">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="disk in disks" :key="disk.id" @click="selectDisk(disk.id)" :class="{ 'table-active': selectedDisks.includes(disk.id) }" style="cursor:pointer">
              <td class="text-center">{{ disk.id }}</td>
            <td>{{ disk.disk_name || '-' }}<span v-if="disk.is_legacy" class="text-muted small ms-1">(随VM)</span></td>
            <td>{{ disk.group_name || '-' }}</td>
            <td>{{ disk.spec_name || '-' }}</td>
            <td class="text-center"><span :class="getDiskTypeBadge(disk.disk_type)">{{ disk.disk_type }}</span></td>
            <td class="text-center">{{ disk.capacity_gb }} GiB</td>
            <td class="text-center"><span :class="getDiskStatusClass(disk.status)">{{ getDiskStatusText(disk.status) }}</span></td>
            <td class="text-center">{{ disk.bind_vmid ? 'VM-' + disk.bind_vmid : '-' }}</td>
            <td class="text-center" :class="disk.status === 'destroyed' ? '' : getExpiryColor(disk.expire_time)">{{ disk.status === 'destroyed' ? '0' : (disk.expire_time ? formatDate(disk.expire_time) : '-') }}</td>
            <td class="text-center" :class="disk.status === 'destroyed' ? '' : getExpiryColor(disk.expire_time)">{{ disk.status === 'destroyed' ? '0' : (disk.expire_time ? daysUntilExpire(disk.expire_time) : '-') }}</td>
            <td class="text-center">
              <div v-if="disk.status !== 'destroyed' && !disk.is_legacy" class="disk-auto-renew-switch">
                <input class="form-check-input" type="checkbox" role="switch" :checked="disk.auto_renew === 1" @change="toggleDiskAutoRenew(disk, $event.target.checked)">
              </div>
              <div v-else-if="disk.status !== 'destroyed' && disk.is_legacy" class="disk-auto-renew-switch">
                <input class="form-check-input" type="checkbox" role="switch" :checked="disk.auto_renew === 1" disabled title="legacy磁盘随VM管理">
              </div>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="text-center">
              <div class="table-actions" style="justify-content:center;">
                <button v-if="disk.status !== 'destroyed' && !disk.is_legacy" class="table-btn btn-info" @click="openDiskRenewModal(disk)">续费</button>
                <button v-if="disk.status !== 'destroyed' && disk.is_legacy" class="table-btn btn-secondary" disabled title="legacy磁盘随VM管理">续费</button>
                <button v-else-if="disk.status === 'destroyed'" class="table-btn btn-danger" @click="deleteDestroyedDisk(disk)">删除</button>
              </div>
            </td>
          </tr>
          <tr v-if="disks.length === 0">
            <td colspan="12" class="text-center text-muted py-4">暂无硬盘，点击"新建"购买数据盘</td>
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
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">存储分组（必选）</label>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" v-for="g in diskOptionsGroups" :key="g.id" :class="diskPurchaseForm.storage_group_id === g.id ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.storage_group_id = g.id; diskPurchaseForm.spec_id = ''; calcDiskPrice()">{{ g.name }}</button>
            <span v-if="diskOptionsGroups.length === 0" class="text-muted small">暂无可用存储分组</span>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">硬盘规格（必选）</label>
          <div v-if="diskPurchaseForm.storage_group_id" class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" v-for="s in getSpecsByGroup(diskPurchaseForm.storage_group_id)" :key="s.id" :class="diskPurchaseForm.spec_id === s.id ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.spec_id = s.id; onSpecChange()">
              <div>{{ s.name }} ({{ s.disk_type }})</div>
              <small class="d-block">￥{{ parseFloat(s.price_per_gb).toFixed(2) }}/GiB/月 <span v-if="s.quarterly_discount">季{{s.quarterly_discount}}%off</span> <span v-if="s.yearly_discount">年{{s.yearly_discount}}%off</span></small>
            </button>
            <span v-if="getSpecsByGroup(diskPurchaseForm.storage_group_id).length === 0" class="text-muted small">该分组暂无可用规格</span>
          </div>
          <span v-else class="text-muted small">请先选择存储分组</span>
        </div>
        <div class="mb-3">
          <label class="form-label">容量 (GiB) <small class="text-muted">范围：{{ getSelectedSpecMin() }}-{{ getSelectedSpecMax() }} GiB</small></label>
          <div class="d-flex align-items-center gap-2">
            <input class="form-control" type="range" v-model.number="diskPurchaseForm.capacity_gb" :min="getSelectedSpecMin()" :max="getSelectedSpecMax()" @input="calcDiskPrice" style="flex:1">
            <input class="form-control" type="number" v-model.number="diskPurchaseForm.capacity_gb" :min="getSelectedSpecMin()" :max="getSelectedSpecMax()" @input="calcDiskPrice" style="width:100px">
          </div>
        </div>
        <div class="mb-3" v-if="selectedSpec">
          <label class="form-label">规格详情</label>
          <div v-if="selectedSpec.mbps_rd || selectedSpec.mbps_wr" class="small mb-1">
            <strong>带宽限速：</strong>读 {{ selectedSpec.mbps_rd || '无' }} MB/s (突发 {{ selectedSpec.mbps_rd_max || '无' }}) / 写 {{ selectedSpec.mbps_wr || '无' }} MB/s (突发 {{ selectedSpec.mbps_wr_max || '无' }})
          </div>
          <div v-if="selectedSpec.iops_rd || selectedSpec.iops_wr" class="small mb-1">
            <strong>IOPS 限速：</strong>读 {{ selectedSpec.iops_rd || '无' }} (突发 {{ selectedSpec.iops_rd_max || '无' }}) / 写 {{ selectedSpec.iops_wr || '无' }} (突发 {{ selectedSpec.iops_wr_max || '无' }})
          </div>
          <p class="text-muted small mb-0">{{ selectedSpec.description || '暂无备注' }}</p>
          <div v-if="selectedSpec.disk_format && ['vmdk','subvol','raw'].indexOf(selectedSpec.disk_format) !== -1" class="alert alert-warning small py-1 px-2 mt-2 mb-0">
            <i class="bi bi-exclamation-triangle"></i> 该磁盘格式不支持扩容，购买后无法增加容量
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">硬盘名称 <span class="small text-muted">{{ (diskPurchaseForm.disk_name || '').length }}/30</span></label>
          <input class="form-control" v-model="diskPurchaseForm.disk_name" maxlength="30" @input="diskPurchaseForm.disk_name = (diskPurchaseForm.disk_name || '').slice(0, 30)" placeholder="选填，最多30字符" autocomplete="off">
        </div>
        <div class="mb-3">
          <label class="form-label">计费模式</label>
          <div class="text-muted small">包年包月</div>
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
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">关闭</pv-button>
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
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="bindTargetDisk">磁盘：{{ bindTargetDisk.disk_name || bindTargetDisk.volume_id }} ({{ bindTargetDisk.capacity_gb }} GiB)</p>
        <div class="mb-3">
          <label class="form-label">目标虚拟机</label>
          <select class="form-select" v-model="bindTargetVmid">
            <option value="">请选择</option>
            <option v-for="vm in userVmsForBind" :key="vm.id" :value="vm.vm_id">{{ vm.name || ('VM ' + vm.vm_id) }}{{ vm.status && vm.status.status !== 'stopped' ? '（运行中）' : '' }}</option>
          </select>
          <div v-if="userVmsForBind.length === 0" class="text-warning small mt-1">没有可用的虚拟机</div>
          <div v-if="bindTargetVmid" class="text-success small mt-1">
            <template v-for="vm in userVmsForBind" :key="vm.id">
              <span v-if="vm.vm_id === parseInt(bindTargetVmid) && vm.status && vm.status.status !== 'stopped'">✅ 支持热插拔，正在运行的虚拟机也可以挂载</span>
            </template>
          </div>
        </div>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">取消</pv-button>
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
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
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
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">取消</pv-button>
        <pv-button @click="submitRenewDisk" variant="primary" :disabled="renewAmount <= 0">确定续费</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 扩容弹窗 -->
<div class="modal fade" id="resizeDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">扩容磁盘</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="resizeTargetDisk">磁盘：{{ resizeTargetDisk.disk_name || resizeTargetDisk.volume_id }}</p>
        <p v-if="resizeTargetDisk">当前容量：<strong>{{ resizeTargetDisk.capacity_gb }} GiB</strong></p>
        <div class="mb-3">
          <label class="form-label">新增容量（GiB，增量值，非目标容量）</label>
          <input type="number" class="form-control" v-model.number="resizeInputAddGb" min="1" step="1" @input="resizeInputAddGb = parseInt(resizeInputAddGb) || 0; calcResizePrice()">
          <small class="text-muted">扩容后总容量：{{ (resizeTargetDisk ? resizeTargetDisk.capacity_gb : 0) + (resizeInputAddGb || 0) }} GiB</small>
        </div>
        <!-- 扩容费用 -->
        <div v-if="resizePrice > 0" class="alert alert-info py-2 mb-2 text-center">
          扩容费用：<strong class="fs-5">¥{{ resizePrice }}</strong>
          <small class="d-block text-muted mt-1">按剩余天数比例计算</small>
        </div>
        <div v-else-if="resizePrice < 0" class="alert alert-warning py-2 mb-2">
          磁盘已过期，无法扩容
        </div>
        <!-- 提示 -->
        <p class="text-danger small mb-1"><i class="bi bi-exclamation-triangle"></i> 扩容后无法缩容</p>
        <p v-if="resizeTargetDisk && resizeTargetDisk.status === 'bound'" class="text-success small mb-0">
          ✅ 支持热插拔扩容，无需关机
        </p>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">取消</pv-button>
        <pv-button @click="submitResizeDisk" variant="primary" :disabled="!resizeInputAddGb || resizeInputAddGb <= 0 || resizePrice < 0">确定扩容</pv-button>
      </div>
    </div>
  </div>
</div>
  `);
})();
