// public/js/admin/admin-template-disk.js - 管理员硬盘设置模板
// 安全设计：使用 Vue {{ }} 插值，无 v-html 渲染用户数据，CSP nonce 合规
// 注意：diskPage 是普通对象，其属性是 ref，模板中使用 diskPage.xxx.value 访问

(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];

  window.__adminTemplateParts.push(`
<!-- 硬盘设置 -->
<div v-if="activeSection === 'disk-settings' && diskPage && diskPage.storageGroups">

  <!-- ====== 存储分组管理 ====== -->
  <div v-if="activeTabDisk === 'storage-groups'">
    <div class="module-header">
      <h4 class="module-title">{{ t('admin.disk.storageGroupsTitle') }}</h4>
      <pv-button @click="diskPage.openStorageGroupForm(null)" size="sm">{{ t('admin.disk.addGroup') }}</pv-button>
    </div>
    <div class="row">
      <div class="col-md-4 mb-3" v-for="(g, idx) in diskPage.storageGroups.value" :key="g.id"
        draggable="true"
        @dragstart="diskPage.onDragStart($event, idx)"
        @dragover="diskPage.onDragOver($event, idx)"
        @dragleave="diskPage.onDragLeave"
        @drop="diskPage.onDrop($event, idx)"
        @dragend="diskPage.onDragEnd($event)"
        :class="{
          'sort-dragging': diskPage.dragIndex.value === idx,
          'sort-drag-over': diskPage.dragOverIdx.value === idx && diskPage.dragIndex.value !== idx
        }"
        style="transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex align-items-center mb-2">
              <span class="text-muted me-2" style="cursor:grab;font-size:16px;">⠿</span>
              <h6 class="card-title mb-0">{{ g.name }}</h6>
            </div>
            <p class="text-muted small mb-2">{{ t('admin.disk.boundTypes') }}</p>
            <div>
              <span class="badge bg-info me-1" v-for="spec in diskPage.diskSpecs.value.filter(s => s.storage_group_id === g.id)" :key="spec.id">{{ spec.disk_type }}|{{ spec.name }}</span>
              <span v-if="diskPage.diskSpecs.value.filter(s => s.storage_group_id === g.id).length === 0" class="text-muted small">{{ t('admin.disk.none') }}</span>
            </div>
            <div class="mt-3 d-flex gap-2">
              <pv-button @click="diskPage.openStorageGroupForm(g)" variant="outline" size="sm">{{ t('common.edit') }}</pv-button>
              <pv-button @click="diskPage.deleteStorageGroup(g.id)" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="diskPage.storageGroups.value.length === 0" class="col-12 text-center text-muted py-5">{{ t('admin.disk.noGroups') }}</div>
    </div>
  </div>

  <!-- ====== 数据盘规格管理 ====== -->
  <div v-if="activeTabDisk === 'specs'">
    <div class="module-header">
      <h4 class="module-title">{{ t('admin.disk.specsTitle') }}</h4>
      <pv-button @click="diskPage.openDiskSpecForm(null)" size="sm">{{ t('admin.disk.addSpec') }}</pv-button>
    </div>
    <div class="row">
      <div class="col-md-6 mb-3" v-for="spec in diskPage.diskSpecs.value" :key="spec.id">
        <div class="card h-100">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="card-title mb-1">{{ spec.disk_type }}</h6>
                <span class="text-muted small">{{ spec.name }}</span>
              </div>
              <span class="badge" :class="spec.enabled ? 'bg-success' : 'bg-secondary'">
                <span v-if="spec.enabled">{{ t('admin.disk.enabled') }}</span>
                <span v-else>{{ t('admin.disk.disabled') }}</span>
              </span>
            </div>
            <div class="text-muted small mb-1"><strong>{{ t('admin.disk.storageGroupLabel') }}</strong>{{ spec.group_name || '-' }}</div>
            <hr class="my-2">
            <div class="small">
              <div><strong>{{ t('admin.disk.minSize') }}</strong>{{ spec.min_size_gb }} GiB &nbsp; <strong>{{ t('admin.disk.maxSize') }}</strong>{{ spec.max_size_gb }} GiB</div>
              <div><strong>{{ t('admin.disk.monthlyPrice') }}</strong>{{ tFormat('admin.disk.priceYuanPerGiB', parseFloat(spec.price_per_gb).toFixed(2)) }}</div>
              <div><strong>{{ t('admin.disk.quarterlyPrice') }}</strong><span v-if="spec.quarterly_discount">{{ tFormat('admin.disk.discountMonthly', spec.quarterly_discount, diskPage.calcDiscountedPrice(spec).quarterly) }}</span><span v-else>-</span></div>
              <div><strong>{{ t('admin.disk.yearlyPrice') }}</strong><span v-if="spec.yearly_discount">{{ tFormat('admin.disk.discountMonthly', spec.yearly_discount, diskPage.calcDiscountedPrice(spec).yearly) }}</span><span v-else>-</span></div>
              <div><strong>{{ t('admin.disk.storagePool') }}</strong>{{ spec.storage_pool || '-' }}</div>
              <div><strong>{{ t('admin.disk.diskFormat') }}</strong>{{ spec.disk_format || t('admin.disk.default') }}</div>
              <div><strong>{{ t('admin.disk.bandwidthLimit') }}</strong>{{ t('admin.disk.read') }} {{ spec.mbps_rd || t('admin.disk.none') }} MB/s ({{ t('admin.disk.burst') }} {{ spec.mbps_rd_max || t('admin.disk.none') }}) / {{ t('admin.disk.write') }} {{ spec.mbps_wr || t('admin.disk.none') }} MB/s ({{ t('admin.disk.burst') }} {{ spec.mbps_wr_max || t('admin.disk.none') }})</div>
              <div><strong>{{ t('admin.disk.iopsLimit') }}</strong>{{ t('admin.disk.read') }} {{ spec.iops_rd || t('admin.disk.none') }} ({{ t('admin.disk.burst') }} {{ spec.iops_rd_max || t('admin.disk.none') }}) / {{ t('admin.disk.write') }} {{ spec.iops_wr || t('admin.disk.none') }} ({{ t('admin.disk.burst') }} {{ spec.iops_wr_max || t('admin.disk.none') }})</div>
              <div class="mt-1 text-muted"><strong>{{ t('admin.disk.remark') }}</strong>{{ spec.description || '-' }}</div>
            </div>
            <!-- 存储池容量使用进度条 -->
            <div v-if="diskPage.getStorageInfo(spec.storage_pool)" class="mt-2">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>{{ t('admin.disk.poolUsage') }}</span>
                <span>{{ diskPage.getStorageInfo(spec.storage_pool).used_pct }}%</span>
              </div>
              <div class="progress" style="height:6px;">
                <div class="progress-bar" :style="{ width: diskPage.getStorageInfo(spec.storage_pool).used_pct + '%', backgroundColor: diskPage.getStorageBarColor(diskPage.getStorageInfo(spec.storage_pool).used_pct) }"></div>
              </div>
              <div class="small text-muted mt-1">{{ t('admin.disk.remaining') }}{{ diskPage.formatStorageSize(diskPage.getStorageInfo(spec.storage_pool).avail_gb) }} / {{ t('admin.disk.total') }}{{ diskPage.formatStorageSize(diskPage.getStorageInfo(spec.storage_pool).total_gb) }}</div>
            </div>
            <div class="mt-3 d-flex gap-2">
              <pv-button @click="diskPage.openDiskSpecForm(spec)" variant="outline" size="sm">{{ t('common.edit') }}</pv-button>
              <pv-button @click="diskPage.deleteDiskSpec(spec.id)" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="diskPage.diskSpecs.value.length === 0" class="col-12 text-center text-muted py-5">{{ t('admin.disk.noSpecs') }}</div>
    </div>
  </div>

  <!-- ====== 生命周期与到期处理 ====== -->
  <div v-if="activeTabDisk === 'lifecycle'">
    <div class="module-header">
      <h4 class="module-title">{{ t('admin.disk.lifecycleTitle') }}</h4>
    </div>
    <div class="card">
      <div class="card-body">
        <div v-if="diskPage.lifecycleConfig.value">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.warnDays') }}</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.warn_days" min="0">
              <div class="form-text">{{ t('admin.disk.warnDaysHint') }}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.graceDays') }}</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.grace_days" min="0">
              <div class="form-text">{{ t('admin.disk.graceDaysHint') }}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.retentionDays') }}</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.retention_days" min="0">
              <div class="form-text">{{ t('admin.disk.retentionDaysHint') }}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.autoRenewDays') }}</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.auto_renew_days" min="0">
              <div class="form-text">{{ t('admin.disk.autoRenewDaysHint') }}</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.warnFrequency') }}</label>
              <select class="form-select" v-model="diskPage.lifecycleForm.value.warn_frequency">
                <option value="daily">{{ t('admin.disk.onceDaily') }}</option>
                <option value="twice_daily">{{ t('admin.disk.twiceDaily') }}</option>
              </select>
              <div class="form-text">&nbsp;</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">{{ t('admin.disk.graceFrequency') }}</label>
              <select class="form-select" v-model="diskPage.lifecycleForm.value.grace_frequency">
                <option value="daily">{{ t('admin.disk.onceDaily') }}</option>
                <option value="twice_daily">{{ t('admin.disk.twiceDaily') }}</option>
              </select>
              <div class="form-text">&nbsp;</div>
            </div>
          </div>
          <div class="mt-4 d-flex gap-2">
            <pv-button @click="diskPage.saveLifecycleConfig" variant="primary" size="sm">{{ t('common.save') }}</pv-button>
            <pv-button @click="diskPage.cancelEditLifecycle" variant="secondary" size="sm">{{ t('common.cancel') }}</pv-button>
            <pv-button @click="diskPage.resetLifecycleDefaults" variant="outline" size="sm">{{ t('admin.disk.resetDefaults') }}</pv-button>
          </div>
        </div>
        <div v-else class="text-center text-muted py-3">{{ t('common.loading') }}</div>
      </div>
    </div>
  </div>

  <!-- 数据盘管理 -->
  <div v-if="activeTabDisk === 'data-disks'">
    <div class="module-header">
      <h4 class="module-title">{{ t('admin.disk.dataDisksTitle') }}</h4>
      <div class="d-flex gap-2">
        <pv-button variant="outline" size="sm" @click="diskPage.importExistingDisks()">{{ t('admin.disk.importDisks') }}</pv-button>
        <pv-button variant="primary" size="sm" @click="diskPage.openBatchEditGroup()" :disabled="diskPage.selectedDiskIds.value.length === 0">{{ t('admin.disk.batchEditGroup') }}</pv-button>
        <pv-button variant="outline" size="sm" @click="diskPage.loadAllDisks()">{{ t('common.refresh') }}</pv-button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="table table-hover table-sm table-align-center">
          <thead>
            <tr>
              <th style="width:36px" class="text-center"><input type="checkbox" :checked="diskPage.selectedDiskIds.value.length === diskPage.allDisks.value.filter(d => d.status !== 'destroyed').length && diskPage.allDisks.value.length > 0" @change="diskPage.selectAllDisks($event.target.checked)"></th>
              <th>ID</th>
              <th>{{ t('dash.log.user') }}</th>
              <th>{{ t('common.name') }}</th>
              <th>{{ t('admin.disk.pvePath') }}</th>
              <th>{{ t('admin.disk.storageGroup') }}</th>
              <th>{{ t('admin.disk.spec') }}</th>
              <th>{{ t('admin.disk.type') }}</th>
              <th>{{ t('admin.disk.capacity') }}</th>
              <th>{{ t('common.status') }}</th>
              <th>{{ t('admin.disk.boundVm') }}</th>
              <th>{{ t('admin.disk.expireTime') }}</th>
              <th>{{ t('admin.disk.remainingDays') }}</th>
              <th>{{ t('common.actions') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="disk in diskPage.allDisks.value" :key="disk.id">
              <td class="text-center"><input type="checkbox" :value="disk.id" v-model="diskPage.selectedDiskIds.value"></td>
              <td>{{ disk.id }}</td>
              <td>{{ disk.username || '-' }}</td>
              <td>{{ disk.disk_name || '-' }}<span v-if="disk.is_legacy" class="text-muted small ms-1">({{ t('admin.disk.followVm') }})</span></td>
              <td><code class="small" style="word-break:break-all;white-space:normal">{{ disk.volume_id }}</code></td>
              <td>{{ disk.spec_name || '-' }}</td>
              <td>{{ disk.disk_type }}</td>
              <td>{{ disk.capacity_gb }} GiB</td>
              <td><span :class="diskPage.getDiskStatusClass(disk.status)">{{ diskPage.getDiskStatusText(disk.status) }}</span></td>
              <td>{{ disk.bind_vmid ? 'VM-' + disk.bind_vmid : '-' }}</td>
              <td>{{ disk.status === 'destroyed' ? '0' : (disk.is_legacy ? t('admin.disk.followVm') : (disk.expire_time ? diskPage.formatDate(disk.expire_time) : '-')) }}</td>
              <td>{{ disk.status === 'destroyed' ? '0' : (disk.is_legacy ? t('admin.disk.followVm') : (disk.expire_time ? diskPage.daysUntilExpire(disk.expire_time) : '-')) }}</td>
              <td>
                <div class="table-actions">
                  <pv-button v-if="disk.status !== 'destroyed'" variant="table-primary" @click="diskPage.openEditDiskForm(disk)">{{ t('common.edit') }}</pv-button>
                  <pv-button v-if="disk.status !== 'destroyed' && !disk.is_legacy" variant="table-danger" @click="diskPage.destroyDisk(disk)">{{ t('admin.disk.destroy') }}</pv-button>
                  <pv-button v-if="disk.status !== 'destroyed' && disk.is_legacy" variant="table" disabled :title="t('admin.disk.legacyDestroyHint')">{{ t('admin.disk.destroy') }}</pv-button>
                  <pv-button v-else-if="disk.status === 'destroyed'" variant="table-danger" @click="diskPage.hardDeleteDisk(disk)">{{ t('common.delete') }}</pv-button>
                </div>
              </td>
            </tr>
            <tr v-if="!diskPage.allDisks.value || diskPage.allDisks.value.length === 0">
              <td colspan="14" class="text-center text-muted py-4">{{ t('admin.disk.noDisks') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

</div>
<!-- end disk-settings -->

<!-- 存储分组弹窗 -->
<div class="modal fade" id="storageGroupModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ diskPage.editingStorageGroup.value ? t('admin.disk.editGroup') : t('admin.disk.newGroup') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showStorageGroupModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">{{ t('admin.disk.groupName') }}</label>
          <input class="form-control" v-model="diskPage.storageGroupForm.value.name" :placeholder="t('admin.disk.groupNamePh')" maxlength="50">
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showStorageGroupModal.value = false">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="diskPage.saveStorageGroup" variant="primary">{{ t('common.confirm') }}</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 硬盘规格弹窗 -->
<div class="modal fade" id="diskSpecModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-lg modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ diskPage.editingDiskSpec.value ? t('admin.disk.editSpec') : t('admin.disk.newSpec') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showDiskSpecModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="row g-3">
          <!-- 基本信息 -->
          <div class="col-12"><h6 class="border-bottom pb-2">{{ t('admin.disk.basicInfo') }}</h6></div>
          <div class="col-md-6">
            <label class="form-label">{{ t('admin.disk.specName') }}</label>
            <input class="form-control" v-model="diskPage.diskSpecForm.value.name" maxlength="100" :placeholder="t('admin.disk.specNamePh')">
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.type') }}</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.disk_type">
              <option value="NVME">NVME</option>
              <option value="SATA">SATA</option>
              <option value="HDD">HDD</option>
              <option value="U2">U2</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.storageGroup') }}</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.storage_group_id">
              <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
              <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>
          <div class="col-md-6">
            <label class="form-label">{{ t('pkg.node') }}</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.pve_node_id" @change="diskPage.onNodeChange()">
              <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
              <option v-for="n in diskPage.pveNodeOptions.value" :key="n.id" :value="n.id">{{ n.name }}{{ n.zone_name ? ' (' + n.zone_name + ')' : '' }}</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.enabledStatus') }}</label>
            <div class="form-check form-switch mt-2">
              <input class="form-check-input" type="checkbox" v-model="diskPage.diskSpecForm.value.enabled" id="specEnabled">
              <label class="form-check-label" for="specEnabled">{{ t('admin.disk.enabled') }}</label>
            </div>
          </div>
          <div class="col-md-9">
            <label class="form-label">{{ t('admin.disk.specDesc') }}</label>
            <textarea class="form-control" rows="2" v-model="diskPage.diskSpecForm.value.description" maxlength="500" :placeholder="t('admin.disk.specDescPh')"></textarea>
          </div>

          <!-- 容量与定价 -->
          <div class="col-12"><h6 class="border-bottom pb-2 mt-2">{{ t('admin.disk.capacityPricing') }}</h6></div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.minCapacity') }}</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.min_size_gb" min="1">
              <span class="input-group-text">GiB</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.maxCapacity') }}</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.max_size_gb" min="1">
              <span class="input-group-text">GiB</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.pricePerGiB') }}</label>
            <div class="input-group">
              <span class="input-group-text">￥</span>
              <input class="form-control" type="number" step="0.01" v-model.number="diskPage.diskSpecForm.value.price_per_gb" min="0">
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.storageLocation') }}</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.storage_pool" @change="diskPage.onStoragePoolChange()">
              <option value="">{{ t('admin.disk.pleaseSelect') }}</option>
              <option v-for="s in diskPage.diskSpecStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }} ({{ s.type || t('admin.disk.unknown') }}，{{ t('admin.disk.remaining') }}{{ diskPage.formatStorageSize(s.avail_gb) }})</option>
            </select>
          </div>
          <div class="col-md-3" v-if="diskPage.isFileSystemStorage(diskPage.diskSpecForm.value.storage_pool)">
            <label class="form-label">{{ t('admin.disk.diskFormat') }}</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.disk_format">
              <option value="qcow2">{{ t('admin.disk.qcow2') }}</option>
              <option value="raw">{{ t('admin.disk.raw') }}</option>
              <option value="vmdk" v-if="diskPage.getStorageInfo(diskPage.diskSpecForm.value.storage_pool) && diskPage.getStorageInfo(diskPage.diskSpecForm.value.storage_pool).type !== 'btrfs'">{{ t('admin.disk.vmdk') }}</option>
              <option value="subvol" v-if="diskPage.getStorageInfo(diskPage.diskSpecForm.value.storage_pool) && diskPage.getStorageInfo(diskPage.diskSpecForm.value.storage_pool).type === 'btrfs'">{{ t('admin.disk.subvol') }}</option>
            </select>
            <div class="form-text">{{ t('admin.disk.formatHint') }}</div>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.quarterlyDiscount') }}</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.quarterly_discount" min="0" max="100" placeholder="0">
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">{{ t('admin.disk.yearlyDiscount') }}</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.yearly_discount" min="0" max="100" placeholder="0">
              <span class="input-group-text">%</span>
            </div>
          </div>

          <!-- QoS 限速参数 -->
          <div class="col-12">
            <a href="#" @click.prevent="diskPage.showQosSection.value = !diskPage.showQosSection.value" class="text-decoration-none">
              <h6 class="border-bottom pb-2 mt-2">{{ t('admin.disk.qosTitle') }} <small class="text-muted">({{ diskPage.showQosSection.value ? t('admin.disk.collapse') : t('admin.disk.expand') }})</small></h6>
            </a>
          </div>
          <template v-if="diskPage.showQosSection.value">
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.readLimit') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_rd" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">MB/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.readBurst') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_rd_max" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">MB</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.writeLimit') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_wr" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">MB/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.writeBurst') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_wr_max" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">MB</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.readIops') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_rd" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">ops/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.readIopsBurst') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_rd_max" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">ops</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.writeIops') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_wr" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">ops/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">{{ t('admin.disk.writeIopsBurst') }}</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_wr_max" min="0" :placeholder="t('admin.disk.blankUnlimited')">
                <span class="input-group-text">ops</span>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showDiskSpecModal.value = false">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="diskPage.saveDiskSpec" variant="primary">{{ t('common.confirm') }}</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 编辑磁盘弹窗 -->
<div class="modal fade" id="editDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ t('admin.disk.editDisk') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showEditDiskModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">{{ t('admin.disk.diskName') }}</label>
          <input class="form-control" v-model="diskPage.editDiskForm.value.disk_name" maxlength="30" :placeholder="t('admin.disk.max30Chars')">
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('admin.disk.storageGroup') }}</label>
          <select class="form-select" v-model="diskPage.editDiskForm.value.storage_group_id">
            <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label">{{ t('admin.disk.spec') }} <span class="text-muted small">{{ t('admin.disk.specAutoFillHint') }}</span></label>
          <select class="form-select" v-model="diskPage.editDiskForm.value.spec_id" @change="diskPage.onSpecChange">
            <option :value="null">{{ t('admin.disk.noSpec') }}</option>
            <option v-for="s in diskPage.diskSpecs.value" :key="s.id" :value="s.id">{{ s.name }} ({{ s.disk_type }})</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showEditDiskModal.value = false">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="diskPage.saveEditDisk" variant="primary">{{ t('common.save') }}</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 批量修改分组弹窗 -->
<div class="modal fade" id="batchEditGroupModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ t('admin.disk.batchEditTitle') }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showBatchEditGroupModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <p class="text-muted small mb-3">{{ tFormat('admin.disk.selectedCount', diskPage.selectedDiskIds.value.length) }}</p>
        <div class="mb-3">
          <label class="form-label">{{ t('admin.disk.targetGroup') }}</label>
          <select class="form-select" v-model="diskPage.batchGroupId.value">
            <option :value="null">{{ t('admin.disk.pleaseSelect') }}</option>
            <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
        <pv-button @click="diskPage.submitBatchEditGroup" variant="primary" :disabled="!diskPage.batchGroupId.value">{{ t('admin.disk.confirmModify') }}</pv-button>
      </div>
    </div>
  </div>
</div>
  `);
})();
