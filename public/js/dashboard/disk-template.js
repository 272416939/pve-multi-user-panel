// public/js/dashboard/disk-template.js - 用户硬盘管理模板
// 安全设计：使用 Vue {{ }} 插值，无 v-html 渲染用户数据，CSP nonce 合规
// 注意：Vue 3 模板中 ref 自动解包，模板内 disks 即数组本身（不使用 .value）

(function() {
  if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];

  window.__dashboardTemplateParts.push(`
<!-- 硬盘管理 -->
<div v-show="activeSection === 'disk'">
  <div class="d-flex justify-content-between align-items-center mb-3">
    <h4 class="module-title mb-0">{{ t('dash.disk.manage') }}</h4>
  </div>

  <!-- 顶栏功能按钮 -->
  <div class="mb-3 d-flex gap-2 flex-wrap align-items-center">
    <pv-button variant="glass" size="sm" @click="openCreateDiskModal" :disabled="diskActionLoading">{{ t('dash.disk.create') }}</pv-button>
    <pv-button variant="outline" size="sm" @click="openBindModal" :disabled="diskActionLoading || selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'free') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? t('dash.disk.legacyManaged') : ''">{{ t('dash.disk.mount') }}</pv-button>
    <pv-button variant="outline" size="sm" @click="unbindDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="diskActionLoading || selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status !== 'bound') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? t('dash.disk.legacyManaged') : ''">
      <span v-if="diskActionLoading && diskActionText === t('dash.disk.unbinding')" class="spinner-border spinner-border-sm me-1" role="status"></span>{{ t('dash.disk.unmount') }}
    </pv-button>
    <pv-button variant="outline-danger" size="sm" @click="destroyDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="diskActionLoading || selectedDisks.length !== 1 || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.status === 'bound') || (selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy)" :title="selectedDisks.length === 1 && disks.find(function(d) { return d.id === selectedDisks[0]; })?.is_legacy ? t('dash.disk.legacyManaged') : ''">
      <span v-if="diskActionLoading && diskActionText === t('dash.disk.destroying')" class="spinner-border spinner-border-sm me-1" role="status"></span>{{ t('dash.disk.destroy') }}
    </pv-button>
    <pv-button variant="outline-warning" size="sm" @click="resizeDisk(disks.find(function(d) { return d.id === selectedDisks[0]; }))" :disabled="diskActionLoading || selectedDisks.length !== 1 || selectedDiskCannotResize()" :title="selectedDiskResizeTitle()">{{ t('dash.disk.resize') }}</pv-button>
    <span v-if="diskActionLoading" class="text-muted small ms-2">
      <span class="spinner-border spinner-border-sm me-1" role="status"></span>{{ diskActionText }}
    </span>
  </div>

  <!-- 加载中 -->
  <div v-if="diskLoading" class="text-center py-5">
    <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
  </div>

  <!-- 磁盘列表 -->
  <div v-else class="table-container">
    <div class="table-scroll">
      <table>
<thead>
            <tr>
              <th class="text-center">ID</th>
              <th>{{ t('common.name') }}</th>
              <th>{{ t('admin.disk.groupZone') }}</th>
              <th>{{ t('dash.disk.storageGroup') }}</th>
              <th>{{ t('dash.disk.specName') }}</th>
              <th class="text-center">{{ t('common.type') }}</th>
              <th class="text-center">{{ t('dash.disk.capacity') }}</th>
              <th class="text-center">{{ t('common.status') }}</th>
              <th class="text-center">{{ t('dash.disk.boundVm') }}</th>
              <th class="text-center">{{ t('dash.expiryTime') }}</th>
              <th class="text-center">{{ t('dash.disk.remainingDays') }}</th>
              <th class="text-center">{{ t('dash.disk.autoRenew') }}</th>
              <th class="text-center">{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="disk in disks" :key="disk.id" @click="selectDisk(disk.id)" :class="{ 'table-active': selectedDisks.includes(disk.id) }" style="cursor:pointer">
              <td class="text-center">{{ disk.id }}</td>
            <td>{{ disk.disk_name || '-' }}<span v-if="disk.is_legacy" class="text-muted small ms-1">({{ t('dash.disk.followVm') }})</span></td>
            <td>{{ disk.zone_name || '-' }}</td>
            <td>{{ disk.group_name || '-' }}</td>
            <td>{{ disk.spec_name || '-' }}</td>
            <td class="text-center"><span :class="getDiskTypeBadge(disk.disk_type)">{{ disk.disk_type }}</span></td>
            <td class="text-center">{{ disk.capacity_gb }} GiB</td>
            <td class="text-center"><span :class="getDiskStatusClass(disk.status)">{{ getDiskStatusText(disk.status) }}</span></td>
            <td class="text-center">{{ disk.bind_vmid ? 'VM-' + disk.bind_vmid : '-' }}</td>
            <td class="text-center" :class="disk.status === 'destroyed' || disk.is_legacy ? '' : getExpiryColor(disk.expire_time)">{{ disk.status === 'destroyed' ? '0' : (disk.is_legacy ? t('dash.disk.followVm') : (disk.expire_time ? formatDate(disk.expire_time) : '-')) }}</td>
            <td class="text-center" :class="disk.status === 'destroyed' || disk.is_legacy ? '' : getExpiryColor(disk.expire_time)">{{ disk.status === 'destroyed' ? '0' : (disk.is_legacy ? t('dash.disk.followVm') : (disk.expire_time ? daysUntilExpire(disk.expire_time) : '-')) }}</td>
            <td class="text-center">
              <div v-if="disk.status !== 'destroyed' && !disk.is_legacy" class="disk-auto-renew-switch">
                <input class="form-check-input" type="checkbox" role="switch" :checked="disk.auto_renew === 1" @change="toggleDiskAutoRenew(disk, $event.target.checked)">
              </div>
              <div v-else-if="disk.status !== 'destroyed' && disk.is_legacy" class="disk-auto-renew-switch">
                <input class="form-check-input" type="checkbox" role="switch" :checked="disk.auto_renew === 1" disabled :title="t('dash.disk.legacyManaged')">
              </div>
              <span v-else class="text-muted">-</span>
            </td>
            <td class="text-center">
              <div class="table-actions" style="justify-content:center;">
                <pv-button v-if="disk.status !== 'destroyed' && !disk.is_legacy" variant="table-primary" @click="openDiskRenewModal(disk)">{{ t('dash.disk.renew') }}</pv-button>
                <pv-button v-if="disk.status !== 'destroyed' && disk.is_legacy" variant="table" disabled :title="t('dash.disk.legacyManaged')">{{ t('dash.disk.renew') }}</pv-button>
                <pv-button v-else-if="disk.status === 'destroyed'" variant="table-danger" @click="deleteDestroyedDisk(disk)">{{ t('common.delete') }}</pv-button>
              </div>
            </td>
          </tr>
          <tr v-if="disks.length === 0">
            <td colspan="13" class="text-center text-muted py-4">{{ t('dash.disk.empty') }}</td>
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
        <h5 class="modal-title">{{ t('dash.disk.purchaseTitle') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">{{ t('order.pickZone') }}</label>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" v-for="z in diskPurchaseZones" :key="z.id" :class="Number(purchaseZone) === Number(z.id) ? 'btn-primary' : 'btn-outline-secondary'" @click="purchaseZone = z.id; diskPurchaseForm.storage_group_id = ''; diskPurchaseForm.spec_id = ''; calcDiskPrice()">{{ z.name }}</button>
          </div>
          <div class="form-text">{{ t('dash.disk.zoneMountHint') }}</div>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.storageGroupRequired') }}</label>
          <div class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" v-for="g in diskOptionsGroupsFiltered" :key="g.id" :class="diskPurchaseForm.storage_group_id === g.id ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.storage_group_id = g.id; diskPurchaseForm.spec_id = ''; calcDiskPrice()">{{ g.name }}</button>
            <span v-if="diskOptionsGroupsFiltered.length === 0" class="text-muted small">{{ t('dash.disk.noStorageGroups') }}</span>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.specRequired') }}</label>
          <div v-if="diskPurchaseForm.storage_group_id" class="d-flex flex-wrap gap-2">
            <button type="button" class="btn btn-sm" v-for="s in getSpecsByGroup(diskPurchaseForm.storage_group_id)" :key="s.id" :class="diskPurchaseForm.spec_id === s.id ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.spec_id = s.id; onSpecChange()">
              <div>{{ s.name }} ({{ s.disk_type }})</div>
              <small class="d-block">￥{{ parseFloat(s.price_per_gb).toFixed(2) }}/GiB/{{ t('dash.period.month') }} <span v-if="s.quarterly_discount">{{ t('dash.period.quarter') }}{{s.quarterly_discount}}%off</span> <span v-if="s.yearly_discount">{{ t('dash.period.year') }}{{s.yearly_discount}}%off</span></small>
            </button>
            <span v-if="getSpecsByGroup(diskPurchaseForm.storage_group_id).length === 0" class="text-muted small">{{ t('dash.disk.noSpecsInGroup') }}</span>
          </div>
          <span v-else class="text-muted small">{{ t('dash.disk.selectStorageGroupFirst') }}</span>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.capacity') }} (GiB) <small class="text-muted">{{ t('dash.disk.range') }}{{ getSelectedSpecMin() }}-{{ getSelectedSpecMax() }} GiB</small></label>
          <div class="d-flex align-items-center gap-2">
            <input class="form-control" type="range" :key="diskPurchaseForm.spec_id" v-model.number="diskPurchaseForm.capacity_gb" :min="getSelectedSpecMin()" :max="getSelectedSpecMax()" @input="calcDiskPrice" style="flex:1">
            <input class="form-control" type="number" v-model.number="diskPurchaseForm.capacity_gb" :min="getSelectedSpecMin()" :max="getSelectedSpecMax()" @input="calcDiskPrice" style="width:100px">
          </div>
        </div>
        <div class="mb-3" v-if="selectedSpec">
          <label class="form-label">{{ t('dash.disk.specDetail') }}</label>
          <div v-if="selectedSpec.mbps_rd || selectedSpec.mbps_wr" class="small mb-1">
            <strong>{{ t('dash.disk.bandwidthLimit') }}</strong>{{ t('dash.disk.read') }} {{ selectedSpec.mbps_rd || t('dash.none') }} MB/s ({{ t('dash.disk.burst') }} {{ selectedSpec.mbps_rd_max || t('dash.none') }}) / {{ t('dash.disk.write') }} {{ selectedSpec.mbps_wr || t('dash.none') }} MB/s ({{ t('dash.disk.burst') }} {{ selectedSpec.mbps_wr_max || t('dash.none') }})
          </div>
          <div v-if="selectedSpec.iops_rd || selectedSpec.iops_wr" class="small mb-1">
            <strong>{{ t('dash.disk.iopsLimit') }}</strong>{{ t('dash.disk.read') }} {{ selectedSpec.iops_rd || t('dash.none') }} ({{ t('dash.disk.burst') }} {{ selectedSpec.iops_rd_max || t('dash.none') }}) / {{ t('dash.disk.write') }} {{ selectedSpec.iops_wr || t('dash.none') }} ({{ t('dash.disk.burst') }} {{ selectedSpec.iops_wr_max || t('dash.none') }})
          </div>
          <p class="text-muted small mb-0">{{ selectedSpec.description || t('dash.disk.noDesc') }}</p>
          <div v-if="selectedSpec.zone_name || selectedSpec.pve_node_name" class="small mb-1">
            <strong>{{ t('nodes.belongZone') }}</strong><span v-if="selectedSpec.zone_name">{{ selectedSpec.zone_name }}</span><span v-if="selectedSpec.zone_name && selectedSpec.pve_node_name"> · </span><span v-if="selectedSpec.pve_node_name">{{ selectedSpec.pve_node_name }}</span>
          </div>
          <div v-if="selectedSpec.storage_pool" class="small mb-1"><strong>{{ t('admin.disk.storageLocation') }}</strong>{{ selectedSpec.storage_pool }}</div>
          <div v-if="selectedSpec.disk_format && ['vmdk','subvol','raw'].indexOf(selectedSpec.disk_format) !== -1" class="alert alert-warning small py-1 px-2 mt-2 mb-0">
            <i class="bi bi-exclamation-triangle"></i> {{ t('dash.disk.formatNoResizeBuy') }}
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.name') }} <span class="small text-muted">{{ (diskPurchaseForm.disk_name || '').length }}/30</span></label>
          <input class="form-control" v-model="diskPurchaseForm.disk_name" maxlength="30" @input="diskPurchaseForm.disk_name = (diskPurchaseForm.disk_name || '').slice(0, 30)" :placeholder="t('dash.disk.namePlaceholder')" autocomplete="off">
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.billingMode') }}</label>
          <div class="text-muted small">{{ t('dash.disk.prepaid') }}</div>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.purchasePeriod') }}</label>
          <div class="d-flex gap-2">
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'month' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'month'; calcDiskPrice()">{{ t('dash.period.monthPay') }}</button>
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'quarter' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'quarter'; calcDiskPrice()">{{ t('dash.period.quarterPay') }}</button>
            <button class="btn btn-sm" :class="diskPurchaseForm.period === 'year' ? 'btn-primary' : 'btn-outline-secondary'" @click="diskPurchaseForm.period = 'year'; calcDiskPrice()">{{ t('dash.period.yearPay') }}</button>
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.quantity') }}</label>
          <div class="d-flex align-items-center gap-2">
            <button class="btn btn-sm btn-outline-secondary" @click="diskPurchaseForm.quantity = Math.max(1, (diskPurchaseForm.quantity || 1) - 1); calcDiskPrice()">-</button>
            <span class="fw-bold" style="width:40px;text-align:center">{{ diskPurchaseForm.quantity }}</span>
            <button class="btn btn-sm btn-outline-secondary" @click="if ((diskPurchaseForm.quantity || 1) < 10) { diskPurchaseForm.quantity = (diskPurchaseForm.quantity || 1) + 1; calcDiskPrice() }" :disabled="(diskPurchaseForm.quantity || 1) >= 10">+</button>
            <span class="text-muted small ms-2">{{ t('dash.disk.blockHint') }}</span>
          </div>
        </div>
        <div class="mb-3">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" v-model="diskPurchaseForm.auto_renew" id="autoRenew">
            <label class="form-check-label" for="autoRenew">{{ t('dash.disk.autoRenew') }}</label>
          </div>
        </div>
        <div class="alert alert-info py-2 mb-0 text-center">
          {{ t('dash.disk.totalPrice') }}<strong class="fs-5">￥{{ purchasePrice }}</strong>
        </div>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">{{ t('common.close') }}</pv-button>
        <pv-button @click="submitPurchaseDisk" variant="primary" :disabled="!diskPurchaseForm.spec_id || purchasePrice <= 0">{{ t('dash.confirm') }}</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 挂载弹窗 -->
<div class="modal fade" id="bindDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">{{ t('dash.disk.mountTitle') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="bindTargetDisk">{{ t('dash.disk.disk') }}：{{ bindTargetDisk.disk_name || bindTargetDisk.volume_id }} ({{ bindTargetDisk.capacity_gb }} GiB)</p>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.targetVm') }}</label>
          <select class="form-select" v-model="bindTargetVmid">
            <option value="">{{ t('dash.selectVm') }}</option>
            <option v-for="vm in userVmsForBind" :key="vm.id" :value="vm.vm_id">{{ vm.name || ('VM ' + vm.vm_id) }}{{ vm.status && vm.status.status !== 'stopped' ? t('dash.status.runningBracket') : '' }}</option>
          </select>
          <div v-if="userVmsForBind.length === 0" class="text-warning small mt-1">{{ t('dash.disk.noVmAvailable') }}</div>
          <div v-if="bindTargetVmid" class="text-success small mt-1">
            <template v-for="vm in userVmsForBind" :key="vm.id">
              <span v-if="vm.vm_id === parseInt(bindTargetVmid) && vm.status && vm.status.status !== 'stopped'">{{ t('dash.disk.hotplugHint') }}</span>
            </template>
          </div>
        </div>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="submitBindDisk" variant="primary" :disabled="diskActionLoading || !bindTargetVmid">
          <span v-if="diskActionLoading && diskActionText === t('dash.disk.binding')" class="spinner-border spinner-border-sm me-1" role="status"></span>{{ t('dash.disk.confirmMount') }}
        </pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 续费弹窗 -->
<div class="modal fade" id="renewDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">{{ t('dash.disk.renewTitle') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="renewDisk">{{ t('dash.disk.disk') }}：{{ renewDisk.disk_name || renewDisk.volume_id }} ({{ renewDisk.capacity_gb }} GiB)</p>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.renewDuration') }}</label>
          <div class="d-flex gap-2">
            <button class="btn btn-sm" :class="renewPeriod === 'month' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'month'; calcRenewAmount()">{{ t('dash.period.monthPay') }}</button>
            <button class="btn btn-sm" :class="renewPeriod === 'quarter' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'quarter'; calcRenewAmount()">{{ t('dash.period.quarterPay') }}</button>
            <button class="btn btn-sm" :class="renewPeriod === 'year' ? 'btn-primary' : 'btn-outline-secondary'" @click="renewPeriod = 'year'; calcRenewAmount()">{{ t('dash.period.yearPay') }}</button>
          </div>
        </div>
        <div class="alert alert-info py-2 mb-0 text-center">
          {{ t('dash.disk.renewAmountLabel') }}<strong class="fs-5">￥{{ renewAmount }}</strong>
        </div>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="submitRenewDisk" variant="primary" :disabled="renewAmount <= 0">{{ t('dash.disk.confirmRenew') }}</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 扩容弹窗 -->
<div class="modal fade" id="resizeDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content" style="background:var(--bg-modal);color:var(--text-primary);">
      <div class="modal-header" style="border-bottom:1px solid var(--border-color);">
        <h5 class="modal-title">{{ t('dash.disk.resizeTitle') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal"></pv-button>
      </div>
      <div class="modal-body">
        <p v-if="resizeTargetDisk">{{ t('dash.disk.disk') }}：{{ resizeTargetDisk.disk_name || resizeTargetDisk.volume_id }}</p>
        <p v-if="resizeTargetDisk">{{ t('dash.disk.currentCapacity') }}<strong>{{ resizeTargetDisk.capacity_gb }} GiB</strong></p>
        <div class="mb-3">
          <label class="form-label">{{ t('dash.disk.addCapacity') }}</label>
          <input type="number" class="form-control" v-model.number="resizeInputAddGb" min="1" step="1" @input="resizeInputAddGb = parseInt(resizeInputAddGb) || 0; calcResizePrice()">
          <small class="text-muted">{{ t('dash.disk.afterResizeTotal') }}{{ (resizeTargetDisk ? resizeTargetDisk.capacity_gb : 0) + (resizeInputAddGb || 0) }} GiB</small>
        </div>
        <!-- 扩容费用 -->
        <div v-if="resizePrice > 0" class="alert alert-info py-2 mb-2 text-center">
          {{ t('dash.disk.resizeFee') }}<strong class="fs-5">¥{{ resizePrice }}</strong>
          <small class="d-block text-muted mt-1">{{ t('dash.disk.prorateByDays') }}</small>
        </div>
        <div v-else-if="resizePrice < 0" class="alert alert-warning py-2 mb-2">
          {{ t('dash.disk.expiredNoResize') }}
        </div>
        <!-- 提示 -->
        <p class="text-danger small mb-1"><i class="bi bi-exclamation-triangle"></i> {{ t('dash.disk.noShrink') }}</p>
        <p v-if="resizeTargetDisk && resizeTargetDisk.status === 'bound'" class="text-success small mb-0">
          {{ t('dash.disk.hotplugResize') }}
        </p>
      </div>
      <div class="modal-footer d-flex gap-2" style="border-top:1px solid var(--border-color);">
        <pv-button type="button" data-bs-dismiss="modal" variant="outline">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="submitResizeDisk" variant="primary" :disabled="diskActionLoading || !resizeInputAddGb || resizeInputAddGb <= 0 || resizePrice < 0">
          <span v-if="diskActionLoading && diskActionText === t('dash.disk.resizing')" class="spinner-border spinner-border-sm me-1" role="status"></span>{{ t('dash.disk.confirmResize') }}
        </pv-button>
      </div>
    </div>
  </div>
</div>
  `);
})();
