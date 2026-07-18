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
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">存储分组管理</h5>
      <pv-button @click="diskPage.openStorageGroupForm(null)" size="sm">+ 新建分组</pv-button>
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
            <p class="text-muted small mb-2">已绑定硬盘类型：</p>
            <div>
              <span class="badge bg-info me-1" v-for="spec in diskPage.diskSpecs.value.filter(s => s.storage_group_id === g.id)" :key="spec.id">{{ spec.disk_type }}</span>
              <span v-if="diskPage.diskSpecs.value.filter(s => s.storage_group_id === g.id).length === 0" class="text-muted small">暂无</span>
            </div>
            <div class="mt-3 d-flex gap-2">
              <pv-button @click="diskPage.openStorageGroupForm(g)" variant="outline" size="sm">编辑</pv-button>
              <pv-button @click="diskPage.deleteStorageGroup(g.id)" variant="outline-danger" size="sm">删除</pv-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="diskPage.storageGroups.value.length === 0" class="col-12 text-center text-muted py-5">暂无存储分组，点击「新建分组」创建</div>
    </div>
  </div>

  <!-- ====== 数据盘规格管理 ====== -->
  <div v-if="activeTabDisk === 'specs'">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">硬盘规格管理</h5>
      <pv-button @click="diskPage.openDiskSpecForm(null)" size="sm">+ 新建硬盘</pv-button>
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
                <span v-if="spec.enabled">● 启用</span>
                <span v-else>● 禁用</span>
              </span>
            </div>
            <div class="text-muted small mb-1"><strong>存储分组：</strong>{{ spec.group_name || '-' }}</div>
            <hr class="my-2">
            <div class="small">
              <div><strong>起售量：</strong>{{ spec.min_size_gb }} GiB &nbsp; <strong>截止量：</strong>{{ spec.max_size_gb }} GiB</div>
              <div><strong>月  价：</strong>￥{{ spec.price_per_gb }} 元/GiB</div>
              <div v-if="spec.quarterly_discount"><strong>季  付：</strong>{{ spec.quarterly_discount }}% off（￥{{ diskPage.calcDiscountedPrice(spec).quarterly }}/GiB/月）</div>
              <div v-if="spec.yearly_discount"><strong>年  付：</strong>{{ spec.yearly_discount }}% off（￥{{ diskPage.calcDiscountedPrice(spec).yearly }}/GiB/月）</div>
              <div><strong>存储池：</strong>{{ spec.storage_pool }}</div>
              <div v-if="spec.mbps_rd || spec.mbps_wr"><strong>带宽限速：</strong>读 {{ spec.mbps_rd || '无' }} MB/s (突发 {{ spec.mbps_rd_max || '无' }}) / 写 {{ spec.mbps_wr || '无' }} MB/s (突发 {{ spec.mbps_wr_max || '无' }})</div>
              <div v-if="spec.iops_rd || spec.iops_wr"><strong>IOPS 限速：</strong>读 {{ spec.iops_rd || '无' }} (突发 {{ spec.iops_rd_max || '无' }}) / 写 {{ spec.iops_wr || '无' }} (突发 {{ spec.iops_wr_max || '无' }})</div>
              <div v-if="spec.description" class="mt-1 text-muted">{{ spec.description }}</div>
            </div>
            <!-- 存储池容量使用进度条 -->
            <div v-if="diskPage.getStorageInfo(spec.storage_pool)" class="mt-2">
              <div class="d-flex justify-content-between small text-muted mb-1">
                <span>存储池使用率</span>
                <span>{{ diskPage.getStorageInfo(spec.storage_pool).used_pct }}%</span>
              </div>
              <div class="progress" style="height:6px;">
                <div class="progress-bar" :style="{ width: diskPage.getStorageInfo(spec.storage_pool).used_pct + '%', backgroundColor: diskPage.getStorageBarColor(diskPage.getStorageInfo(spec.storage_pool).used_pct) }"></div>
              </div>
              <div class="small text-muted mt-1">剩余：{{ diskPage.formatStorageSize(diskPage.getStorageInfo(spec.storage_pool).avail_gb) }} / 总量：{{ diskPage.formatStorageSize(diskPage.getStorageInfo(spec.storage_pool).total_gb) }}</div>
            </div>
            <div class="mt-3 d-flex gap-2">
              <pv-button @click="diskPage.openDiskSpecForm(spec)" variant="outline" size="sm">编辑</pv-button>
              <pv-button @click="diskPage.deleteDiskSpec(spec.id)" variant="outline-danger" size="sm">删除</pv-button>
            </div>
          </div>
        </div>
      </div>
      <div v-if="diskPage.diskSpecs.value.length === 0" class="col-12 text-center text-muted py-5">暂无规格，点击「新建硬盘」创建</div>
    </div>
  </div>

  <!-- ====== 生命周期与到期处理 ====== -->
  <div v-if="activeTabDisk === 'lifecycle'">
    <div class="card">
      <div class="card-header">
        <span>生命周期参数配置</span>
      </div>
      <div class="card-body">
        <div v-if="diskPage.lifecycleConfig.value">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label">预警提前天数</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.warn_days" min="0">
              <div class="form-text">到期前提醒</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">宽限期时长</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.grace_days" min="0">
              <div class="form-text">到期后缓冲</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">优雅关机超时（秒）</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.shutdown_timeout" min="0">
              <div class="form-text">超时强制断电</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">保留期时长</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.retention_days" min="0">
              <div class="form-text">逾期自动销毁</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">自动续费提前天数</label>
              <input class="form-control" type="number" v-model.number="diskPage.lifecycleForm.value.auto_renew_days" min="0">
              <div class="form-text">到期前自动续费</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">预警提醒频率</label>
              <select class="form-select" v-model="diskPage.lifecycleForm.value.warn_frequency">
                <option value="daily">每日1次</option>
                <option value="twice_daily">每日2次</option>
              </select>
              <div class="form-text">&nbsp;</div>
            </div>
            <div class="col-md-4">
              <label class="form-label">宽限期提醒频率</label>
              <select class="form-select" v-model="diskPage.lifecycleForm.value.grace_frequency">
                <option value="daily">每日1次</option>
                <option value="twice_daily">每日2次</option>
              </select>
              <div class="form-text">&nbsp;</div>
            </div>
          </div>
          <div class="mt-4 d-flex gap-2">
            <pv-button @click="diskPage.saveLifecycleConfig" variant="primary" size="sm">保存</pv-button>
            <pv-button @click="diskPage.cancelEditLifecycle" variant="secondary" size="sm">取消</pv-button>
            <pv-button @click="diskPage.resetLifecycleDefaults" variant="outline" size="sm">恢复默认</pv-button>
          </div>
        </div>
        <div v-else class="text-center text-muted py-3">加载中...</div>
      </div>
    </div>
  </div>

  <!-- 数据盘管理 -->
  <div v-if="activeTabDisk === 'data-disks'">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h4 class="module-title mb-0">数据盘管理</h4>
      <div class="d-flex gap-2">
        <pv-button variant="outline" size="sm" @click="diskPage.importExistingDisks()">导入存量磁盘</pv-button>
        <pv-button variant="primary" size="sm" @click="diskPage.openBatchEditGroup()" :disabled="diskPage.selectedDiskIds.value.length === 0">批量修改分组</pv-button>
        <pv-button variant="outline" size="sm" @click="diskPage.loadAllDisks()">刷新</pv-button>
      </div>
    </div>
    <div class="table-container">
      <div class="table-scroll">
        <table class="table table-hover table-sm table-align-center">
          <thead>
            <tr>
              <th style="width:36px" class="text-center"><input type="checkbox" :checked="diskPage.selectedDiskIds.value.length === diskPage.allDisks.value.filter(d => d.status !== 'destroyed').length && diskPage.allDisks.value.length > 0" @change="diskPage.selectAllDisks($event.target.checked)"></th>
              <th>ID</th>
              <th>用户</th>
              <th>名称</th>
              <th>存储分组</th>
              <th>规格</th>
              <th>类型</th>
              <th>容量</th>
              <th>状态</th>
              <th>绑定VM</th>
              <th>到期时间</th>
              <th>剩余天数</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="disk in diskPage.allDisks.value" :key="disk.id">
              <td class="text-center"><input type="checkbox" :value="disk.id" v-model="diskPage.selectedDiskIds.value"></td>
              <td>{{ disk.username || '-' }}</td>
              <td>{{ disk.disk_name || '-' }}<span v-if="disk.is_legacy" class="text-muted small ms-1">(随VM)</span></td>
              <td>{{ disk.group_name || '-' }}</td>
              <td>{{ disk.spec_name || '-' }}</td>
              <td>{{ disk.disk_type }}</td>
              <td>{{ disk.capacity_gb }} GiB</td>
              <td><span :class="diskPage.getDiskStatusClass(disk.status)">{{ diskPage.getDiskStatusText(disk.status) }}</span></td>
              <td>{{ disk.bind_vmid ? 'VM-' + disk.bind_vmid : '-' }}</td>
              <td>{{ disk.status === 'destroyed' ? '0' : (disk.expire_time ? diskPage.formatDate(disk.expire_time) : '-') }}</td>
              <td>{{ disk.status === 'destroyed' ? '0' : (disk.expire_time ? diskPage.daysUntilExpire(disk.expire_time) : '-') }}</td>
              <td>
                <div class="table-actions">
                  <button v-if="disk.status !== 'destroyed'" class="table-btn btn-primary" @click="diskPage.openEditDiskForm(disk)">编辑</button>
                  <button v-if="disk.status !== 'destroyed' && !disk.is_legacy" class="table-btn btn-danger" @click="diskPage.destroyDisk(disk)">销毁</button>
                  <button v-if="disk.status !== 'destroyed' && disk.is_legacy" class="table-btn btn-secondary" disabled title="legacy磁盘随VM销毁">销毁</button>
                  <button v-else-if="disk.status === 'destroyed'" class="table-btn btn-danger" @click="diskPage.hardDeleteDisk(disk)">删除</button>
                </div>
              </td>
            </tr>
            <tr v-if="!diskPage.allDisks.value || diskPage.allDisks.value.length === 0">
              <td colspan="13" class="text-center text-muted py-4">暂无数据盘</td>
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
        <h5 class="modal-title">{{ diskPage.editingStorageGroup.value ? '编辑存储分组' : '新建存储分组' }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showStorageGroupModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">分组名称</label>
          <input class="form-control" v-model="diskPage.storageGroupForm.value.name" placeholder="如 NVME-A" maxlength="50">
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showStorageGroupModal.value = false">取消</pv-button>
        <pv-button @click="diskPage.saveStorageGroup" variant="primary">确定</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 硬盘规格弹窗 -->
<div class="modal fade" id="diskSpecModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-lg modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">{{ diskPage.editingDiskSpec.value ? '编辑硬盘规格' : '新建硬盘规格' }}</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showDiskSpecModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="row g-3">
          <!-- 基本信息 -->
          <div class="col-12"><h6 class="border-bottom pb-2">基本信息</h6></div>
          <div class="col-md-6">
            <label class="form-label">规格名称</label>
            <input class="form-control" v-model="diskPage.diskSpecForm.value.name" maxlength="100" placeholder="如 企业级 NVME 高性能盘">
          </div>
          <div class="col-md-3">
            <label class="form-label">类型</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.disk_type">
              <option value="NVME">NVME</option>
              <option value="SATA">SATA</option>
              <option value="HDD">HDD</option>
              <option value="U2">U2</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">存储分组</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.storage_group_id">
              <option value="">请选择</option>
              <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">启用状态</label>
            <div class="form-check form-switch mt-2">
              <input class="form-check-input" type="checkbox" v-model="diskPage.diskSpecForm.value.enabled" id="specEnabled">
              <label class="form-check-label" for="specEnabled">启用</label>
            </div>
          </div>
          <div class="col-md-9">
            <label class="form-label">规格描述</label>
            <textarea class="form-control" rows="2" v-model="diskPage.diskSpecForm.value.description" maxlength="500" placeholder="展示在用户购买页的描述信息"></textarea>
          </div>

          <!-- 容量与定价 -->
          <div class="col-12"><h6 class="border-bottom pb-2 mt-2">容量与定价</h6></div>
          <div class="col-md-3">
            <label class="form-label">最低容量</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.min_size_gb" min="1">
              <span class="input-group-text">GiB</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">最大容量</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.max_size_gb" min="1">
              <span class="input-group-text">GiB</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">每 GiB 月单价</label>
            <div class="input-group">
              <span class="input-group-text">￥</span>
              <input class="form-control" type="number" step="0.0001" v-model.number="diskPage.diskSpecForm.value.price_per_gb" min="0">
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">存储位置</label>
            <select class="form-select" v-model="diskPage.diskSpecForm.value.storage_pool">
              <option value="">请选择</option>
              <option v-for="s in diskPage.pveStorages.value" :key="s.storage" :value="s.storage">{{ s.storage }} (剩余 {{ diskPage.formatStorageSize(s.avail_gb) }})</option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">季付折扣</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.quarterly_discount" min="0" max="100" placeholder="0">
              <span class="input-group-text">%</span>
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">年付折扣</label>
            <div class="input-group">
              <input class="form-control" type="number" v-model.number="diskPage.diskSpecForm.value.yearly_discount" min="0" max="100" placeholder="0">
              <span class="input-group-text">%</span>
            </div>
          </div>

          <!-- QoS 限速参数 -->
          <div class="col-12">
            <a href="#" @click.prevent="diskPage.showQosSection.value = !diskPage.showQosSection.value" class="text-decoration-none">
              <h6 class="border-bottom pb-2 mt-2">QoS 限速参数 <small class="text-muted">({{ diskPage.showQosSection.value ? '收起' : '展开' }})</small></h6>
            </a>
          </div>
          <template v-if="diskPage.showQosSection.value">
            <div class="col-md-3">
              <label class="form-label">读取限速</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_rd" min="0" placeholder="留空无限制">
                <span class="input-group-text">MB/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">读突发峰值</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_rd_max" min="0" placeholder="留空无限制">
                <span class="input-group-text">MB</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">写入限制</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_wr" min="0" placeholder="留空无限制">
                <span class="input-group-text">MB/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">写突发峰值</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.mbps_wr_max" min="0" placeholder="留空无限制">
                <span class="input-group-text">MB</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">读取 IOPS</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_rd" min="0" placeholder="留空无限制">
                <span class="input-group-text">ops/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">读 IOPS 突发</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_rd_max" min="0" placeholder="留空无限制">
                <span class="input-group-text">ops</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">写入 IOPS</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_wr" min="0" placeholder="留空无限制">
                <span class="input-group-text">ops/s</span>
              </div>
            </div>
            <div class="col-md-3">
              <label class="form-label">写 IOPS 突发</label>
              <div class="input-group">
                <input class="form-control" type="number" v-model="diskPage.diskSpecForm.value.iops_wr_max" min="0" placeholder="留空无限制">
                <span class="input-group-text">ops</span>
              </div>
            </div>
          </template>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showDiskSpecModal.value = false">取消</pv-button>
        <pv-button @click="diskPage.saveDiskSpec" variant="primary">确定</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 编辑磁盘弹窗 -->
<div class="modal fade" id="editDiskModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">编辑磁盘</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showEditDiskModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <div class="mb-3">
          <label class="form-label">磁盘名称</label>
          <input class="form-control" v-model="diskPage.editDiskForm.value.disk_name" maxlength="30" placeholder="最多30字符">
        </div>
        <div class="mb-3">
          <label class="form-label">存储分组</label>
          <select class="form-select" v-model="diskPage.editDiskForm.value.storage_group_id">
            <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
        <div class="mb-3">
          <label class="form-label">规格 <span class="text-muted small">（选择后自动填充对应存储分组）</span></label>
          <select class="form-select" v-model="diskPage.editDiskForm.value.spec_id" @change="diskPage.onSpecChange">
            <option :value="null">无规格</option>
            <option v-for="s in diskPage.diskSpecs.value" :key="s.id" :value="s.id">{{ s.name }} ({{ s.disk_type }})</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary" @click="diskPage.showEditDiskModal.value = false">取消</pv-button>
        <pv-button @click="diskPage.saveEditDisk" variant="primary">保存</pv-button>
      </div>
    </div>
  </div>
</div>

<!-- 批量修改分组弹窗 -->
<div class="modal fade" id="batchEditGroupModal" tabindex="-1" data-bs-backdrop="static">
  <div class="modal-dialog modal-dialog-centered">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title">批量修改存储分组</h5>
        <pv-button type="button" variant="close" data-bs-dismiss="modal" @click="diskPage.showBatchEditGroupModal.value = false"></pv-button>
      </div>
      <div class="modal-body">
        <p class="text-muted small mb-3">已选择 <strong>{{ diskPage.selectedDiskIds.value.length }}</strong> 个磁盘</p>
        <div class="mb-3">
          <label class="form-label">目标存储分组</label>
          <select class="form-select" v-model="diskPage.batchGroupId.value">
            <option :value="null">请选择</option>
            <option v-for="g in diskPage.storageGroups.value" :key="g.id" :value="g.id">{{ g.name }}</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <pv-button type="button" data-bs-dismiss="modal" variant="secondary">取消</pv-button>
        <pv-button @click="diskPage.submitBatchEditGroup" variant="primary" :disabled="!diskPage.batchGroupId.value">确定修改</pv-button>
      </div>
    </div>
  </div>
</div>
  `);
})();
