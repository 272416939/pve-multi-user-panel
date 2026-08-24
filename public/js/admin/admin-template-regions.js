(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 地域管理（区域管理 → 地域） -->
    <div v-if="activeSection === 'regions'">
        <div class="module-header">
            <h4 class="module-title">{{ t('nav.regionList') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="glass" size="lg" @click="regionsPage.openRegionModal()">{{ t('nodes.addRegion') }}</pv-button>
            </div>
        </div>
        <div v-if="regionsPage.regionLoading.value" class="text-center py-4">
            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
        </div>
        <div v-else class="table-container mb-4" style="padding:12px;">
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 table-align-center">
                    <thead>
                        <tr>
                            <th>{{ t('common.name') }}</th>
                            <th>{{ t('nodes.sortOrder') }}</th>
                            <th>{{ t('nodes.zoneCount') }}</th>
                            <th>{{ t('nodes.assetOverview') }}</th>
                            <th>{{ t('common.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="r in regionsPage.regions.value" :key="r.id">
                            <td>{{ r.name }}</td>
                            <td>{{ r.sort_order }}</td>
                            <td>{{ r.zone_count }}</td>
                            <td>
                                <div class="d-flex flex-wrap gap-2">
                                    <span class="badge bg-primary">{{ t('nodes.pveNodes') }} {{ r.pve_node_count }}</span>
                                    <span class="badge bg-info">{{ t('nodes.ikuaiNodes') }} {{ r.ikuai_node_count }}</span>
                                    <span class="badge bg-secondary">{{ t('nodes.packages') }} {{ r.package_count }}</span>
                                    <span class="badge bg-warning text-dark">{{ t('nodes.instances') }} {{ r.instance_count }}</span>
                                </div>
                            </td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" @click="regionsPage.openRegionModal(r)">{{ t('common.edit') }}</pv-button>
                                    <pv-button size="sm" variant="danger" @click="regionsPage.deleteRegion(r)">{{ t('common.delete') }}</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="regionsPage.regions.value.length === 0">
                            <td colspan="5" class="text-center text-muted">{{ t('nodes.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 新增/编辑地域弹窗 -->
        <div class="modal fade" id="regionModal" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ regionsPage.regionForm.id ? t('nodes.editRegion') : t('nodes.addRegion') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <form @submit.prevent="regionsPage.saveRegion()">
                        <div class="mb-3">
                            <label class="form-label">{{ t('common.name') }} <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" v-model="regionsPage.regionForm.name" :placeholder="t('nodes.regionNamePh')">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">{{ t('nodes.remark') }}</label>
                            <input type="text" class="form-control" v-model="regionsPage.regionForm.remark">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">{{ t('nodes.sortOrder') }}</label>
                            <input type="number" class="form-control" v-model.number="regionsPage.regionForm.sort_order" min="0">
                        </div>
                        <div class="d-flex gap-2 justify-content-end">
                            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                            <pv-button type="submit" variant="primary" :disabled="regionsPage.saving.value">{{ regionsPage.saving.value ? t('common.saving') : t('common.confirm') }}</pv-button>
                        </div>
                    </form>
                </div>
            </div></div>
        </div>
    </div>

    <!-- 可用区管理（区域管理 → 可用区） -->
    <div v-if="activeSection === 'zones'">
        <div class="module-header">
            <h4 class="module-title">{{ t('nav.zoneList') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="glass" size="lg" @click="regionsPage.openZoneModal()">{{ t('nodes.addZone') }}</pv-button>
            </div>
        </div>
        <div v-if="regionsPage.zoneLoading.value" class="text-center py-4">
            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
        </div>
        <div v-else class="table-container mb-4" style="padding:12px;">
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 table-align-center">
                    <thead>
                        <tr>
                            <th>{{ t('common.name') }}</th>
                            <th>{{ t('nodes.belongRegion') }}</th>
                            <th>{{ t('nodes.pveNodeChips') }}</th>
                            <th>{{ t('nodes.relatedIkuai') }}</th>
                            <th>{{ t('nodes.instanceCount') }}</th>
                            <th>{{ t('common.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="z in regionsPage.zones.value" :key="z.id">
                            <td>{{ z.name }}</td>
                            <td>{{ z.region_name }}</td>
                            <td>
                                <div class="d-flex flex-wrap gap-1" v-if="z.nodes && z.nodes.length">
                                    <span v-for="n in z.nodes" :key="n.id" class="badge" :class="n.enabled ? 'bg-primary' : 'bg-secondary'">
                                        <span :class="n.enabled ? 'text-success' : 'text-muted'">●</span> {{ n.name }}
                                    </span>
                                </div>
                                <span v-else class="text-muted">{{ t('nodes.none') }}</span>
                            </td>
                            <td>
                                <div class="d-flex flex-wrap gap-1" v-if="regionsPage.zoneIkuaiNames(z).length">
                                    <span v-for="n in regionsPage.zoneIkuaiNames(z)" :key="n" class="badge bg-info">{{ n }}</span>
                                </div>
                                <span v-else class="text-muted">{{ t('nodes.none') }}</span>
                            </td>
                            <td>{{ z.instance_count }}</td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" @click="regionsPage.openZoneModal(z)">{{ t('common.edit') }}</pv-button>
                                    <pv-button size="sm" variant="danger" @click="regionsPage.deleteZone(z)">{{ t('common.delete') }}</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="regionsPage.zones.value.length === 0">
                            <td colspan="6" class="text-center text-muted">{{ t('nodes.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 新增/编辑可用区弹窗 -->
        <div class="modal fade" id="zoneModal" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ regionsPage.zoneForm.id ? t('nodes.editZone') : t('nodes.addZone') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <form @submit.prevent="regionsPage.saveZone()">
                        <div class="mb-3">
                            <label class="form-label">{{ t('common.name') }} <span class="text-danger">*</span></label>
                            <input type="text" class="form-control" v-model="regionsPage.zoneForm.name" :placeholder="t('nodes.zoneNamePh')">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">{{ t('nodes.belongRegion') }} <span class="text-danger">*</span></label>
                            <select class="form-select" v-model="regionsPage.zoneForm.region_id">
                                <option value="">{{ t('nodes.regionPh') }}</option>
                                <option v-for="r in regionsPage.regions.value" :key="r.id" :value="r.id">{{ r.name }}</option>
                            </select>
                        </div>
                        <div class="mb-3">
                            <label class="form-label">{{ t('nodes.remark') }}</label>
                            <input type="text" class="form-control" v-model="regionsPage.zoneForm.remark">
                        </div>
                        <div class="mb-3">
                            <label class="form-label">{{ t('nodes.sortOrder') }}</label>
                            <input type="number" class="form-control" v-model.number="regionsPage.zoneForm.sort_order" min="0">
                        </div>
                        <div class="d-flex gap-2 justify-content-end">
                            <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                            <pv-button type="submit" variant="primary" :disabled="regionsPage.saving.value">{{ regionsPage.saving.value ? t('common.saving') : t('common.confirm') }}</pv-button>
                        </div>
                    </form>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();
