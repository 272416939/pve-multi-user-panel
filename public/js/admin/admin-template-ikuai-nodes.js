(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 爱快节点管理 -->
    <div v-if="activeSection === 'ikuai-nodes'">
        <div class="module-header">
            <h4 class="module-title">{{ t('nav.ikuaiNodes') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="glass" size="lg" @click="ikuaiNodesPage.openVersionModal()">{{ t('nodes.addNode') }}</pv-button>
            </div>
        </div>
        <div v-if="ikuaiNodesPage.loading.value" class="text-center py-4">
            <div class="spinner-border text-primary" role="status"><span class="visually-hidden">{{ t('common.loading') }}</span></div>
        </div>
        <div v-else class="table-container mb-4" style="padding:12px;">
            <div class="table-responsive">
                <table class="table table-sm table-hover mb-0 table-align-center">
                    <thead>
                        <tr>
                            <th>{{ t('common.name') }}</th>
                            <th>{{ t('nodes.interfaceVersion') }}</th>
                            <th>{{ t('nodes.host') }}</th>
                            <th>{{ t('nodes.tlsStatus') }}</th>
                            <th>{{ t('nodes.connStatus') }}</th>
                            <th>{{ t('common.actions') }}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="n in ikuaiNodesPage.nodes.value" :key="n.id">
                            <td>{{ n.name }}</td>
                            <td><span class="badge bg-secondary">{{ n.version ? n.version.toUpperCase() : '-' }}</span></td>
                            <td>{{ n.host }}</td>
                            <td><span :class="n.strict_tls ? 'text-success' : 'text-muted'">{{ n.strict_tls ? '√' : '×' }}</span></td>
                            <td>
                                <span v-if="n.last_error" :title="n.last_error" class="text-danger">{{ t('nodes.connFailed') }}</span>
                                <span v-else-if="n.latency_ms != null" class="text-success">{{ n.latency_ms }}ms</span>
                                <span v-else class="text-muted">{{ t('nodes.connNone') }}</span>
                            </td>
                            <td>
                                <div class="d-flex gap-2">
                                    <pv-button size="sm" variant="outline" @click="ikuaiNodesPage.rowTest(n)">{{ t('nodes.rowTest') }}</pv-button>
                                    <pv-button size="sm" @click="ikuaiNodesPage.editNode(n)">{{ t('common.edit') }}</pv-button>
                                    <pv-button size="sm" variant="danger" @click="ikuaiNodesPage.deleteNode(n)">{{ t('common.delete') }}</pv-button>
                                </div>
                            </td>
                        </tr>
                        <tr v-if="ikuaiNodesPage.nodes.value.length === 0">
                            <td colspan="6" class="text-center text-muted">{{ t('nodes.empty') }}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>

        <!-- 版本选择弹窗 -->
        <div class="modal fade" id="ikuaiVersionModal" tabindex="-1">
            <div class="modal-dialog"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ t('nodes.chooseVersion') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <div class="row g-3">
                        <div class="col-md-6">
                            <div class="card h-100" :class="ikuaiNodesPage.formVersion.value === 'v3' ? 'border border-primary' : 'border'" @click="ikuaiNodesPage.formVersion.value = 'v3'">
                                <div class="card-body text-center p-4">
                                    <h5 class="card-title">V3</h5>
                                    <p class="text-muted small mb-0">{{ t('nodes.versionV3Desc') }}</p>
                                </div>
                            </div>
                        </div>
                        <div class="col-md-6">
                            <div class="card h-100" :class="ikuaiNodesPage.formVersion.value === 'v4' ? 'border border-primary' : 'border'" @click="ikuaiNodesPage.formVersion.value = 'v4'">
                                <div class="card-body text-center p-4">
                                    <h5 class="card-title">V4</h5>
                                    <p class="text-muted small mb-0">{{ t('nodes.versionV4Desc') }}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <pv-button type="button" data-bs-dismiss="modal" variant="secondary">{{ t('common.cancel') }}</pv-button>
                    <pv-button type="button" variant="primary" @click="ikuaiNodesPage.confirmVersion()">{{ t('common.confirm') }}</pv-button>
                </div>
            </div></div>
        </div>

        <!-- 新增/编辑全量表单弹窗 -->
        <div class="modal fade" id="ikuaiFormModal" tabindex="-1">
            <div class="modal-dialog modal-xl"><div class="modal-content">
                <div class="modal-header"><h5 class="modal-title">{{ ikuaiNodesPage.editing.value ? t('nodes.editNode') : t('nodes.addNode') }}</h5>
                <pv-button type="button" data-bs-dismiss="modal"></pv-button></div>
                <div class="modal-body">
                    <form @submit.prevent="ikuaiNodesPage.saveNode()">
                        <!-- 基础信息 -->
                        <h6 class="section-label">{{ t('nodes.baseInfo') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label">{{ t('common.name') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="ikuaiNodesPage.form.name" :placeholder="t('nodes.nodeNamePh')">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.host') }} <span class="text-danger">*</span></label>
                                <input type="text" class="form-control" v-model="ikuaiNodesPage.form.host" :placeholder="t('nodes.hostPh')">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.interfaceVersion') }} <span class="text-danger">*</span></label>
                                <select class="form-select" v-model="ikuaiNodesPage.form.version">
                                    <option value="v3">V3</option>
                                    <option value="v4">V4</option>
                                </select>
                            </div>
                            <template v-if="ikuaiNodesPage.form.version !== 'v4'">
                                <div class="col-md-6">
                                    <label class="form-label">{{ t('settings.username') }} <span class="text-danger">*</span></label>
                                    <input type="text" class="form-control" v-model="ikuaiNodesPage.form.username" autocomplete="off">
                                </div>
                                <div class="col-md-6">
                                    <label class="form-label">{{ t('settings.password') }} <span class="text-danger">*</span></label>
                                    <input type="password" class="form-control" v-model="ikuaiNodesPage.form.password" :placeholder="ikuaiNodesPage.editing.value ? t('settings.keepBlank') : ''" autocomplete="off">
                                </div>
                            </template>
                            <div class="col-md-6" v-else>
                                <label class="form-label">{{ t('nodes.apiToken') }} <span class="text-danger">*</span></label>
                                <input type="password" class="form-control" v-model="ikuaiNodesPage.form.api_key" :placeholder="ikuaiNodesPage.editing.value ? t('settings.keepBlank') : ''" autocomplete="off">
                            </div>
                            <div class="col-md-6">
                                <div class="form-check form-switch mt-4">
                                    <input class="form-check-input" type="checkbox" id="ikuaiNodeStrictTls" v-model="ikuaiNodesPage.form.strict_tls">
                                    <label class="form-check-label" for="ikuaiNodeStrictTls">{{ t('settings.tlsStrict') }}</label>
                                </div>
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- 端口转发 -->
                        <h6 class="section-label">{{ t('nodes.portForward') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-6">
                                <label class="form-label">{{ t('nodes.wanInterface') }}</label>
                                <div class="input-group" style="position: relative; z-index: 1080; overflow: visible;">
                                    <input type="text" class="form-control" :value="ikuaiNodesPage.wanIfaceText.value" :placeholder="t('settings.network.wanIfacePh')" readonly>
                                    <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" :disabled="ikuaiNodesPage.wanInterfaceList.value.length === 0">{{ t('settings.select') }}</button>
                                    <ul class="dropdown-menu dropdown-menu-end" style="z-index: 1080;">
                                        <li v-for="iface in ikuaiNodesPage.wanInterfaceList.value" :key="iface.name">
                                            <a class="dropdown-item d-flex justify-content-between align-items-center" :class="{ 'active': ikuaiNodesPage.isWanIfaceSelected(iface.name) }" href="#" @click.prevent="ikuaiNodesPage.toggleWanIface(iface.name)">
                                                <span>{{ iface.name }} ({{ iface.ip || t('settings.network.dialup') }})</span>
                                                <i v-if="ikuaiNodesPage.isWanIfaceSelected(iface.name)" class="bi bi-check-circle-fill text-primary ms-2"></i>
                                            </a>
                                        </li>
                                        <li v-if="ikuaiNodesPage.wanInterfaceList.value.length === 0"><span class="dropdown-item text-muted">{{ t('nodes.noIface') }}</span></li>
                                        <li><hr class="dropdown-divider"></li>
                                        <li><a class="dropdown-item text-danger" href="#" @click.prevent="ikuaiNodesPage.clearWanInterfaces()">{{ t('settings.network.clear') }}</a></li>
                                    </ul>
                                </div>
                                <div class="d-flex gap-2 mt-2 align-items-center">
                                    <pv-button type="button" variant="outline" size="lg" @click="ikuaiNodesPage.refreshInterfaces()">{{ t('nodes.refreshIface') }}</pv-button>
                                </div>
                                <small class="text-muted">{{ t('nodes.wanIfaceHint') }}</small>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.portStart') }}</label>
                                <input type="number" class="form-control" v-model.number="ikuaiNodesPage.networkForm.port_range_start" min="1" max="65535">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.portEnd') }}</label>
                                <input type="number" class="form-control" v-model.number="ikuaiNodesPage.networkForm.port_range_end" min="1" max="65535">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.defaultProto') }}</label>
                                <select class="form-select" v-model="ikuaiNodesPage.networkForm.default_protocol">
                                    <option value="tcp">TCP</option>
                                    <option value="udp">UDP</option>
                                    <option value="tcp+udp">TCP + UDP</option>
                                </select>
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('nodes.perUserMax') }}</label>
                                <input type="number" class="form-control" v-model.number="ikuaiNodesPage.networkForm.max_per_user" min="0" max="1000">
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- CNAME 域名设置（行编辑，label||.domain） -->
                        <h6 class="section-label">{{ t('nodes.cname') }}</h6>
                        <div class="row g-3">
                            <div class="col-12">
                                <label class="form-label">{{ t('settings.network.cnameTitle') }}</label>
                                <p class="text-muted small mb-2">{{ t('settings.network.cnameDesc') }}</p>
                                <div v-for="(entry, idx) in ikuaiNodesPage.cnameEntries.value" :key="idx" class="row g-2 mb-2 align-items-center">
                                    <div class="col-md-4">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.label" :placeholder="t('settings.network.cnameLabelPh')">
                                    </div>
                                    <div class="col-md-6">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.domain" :placeholder="t('settings.network.cnameDomainPh')">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button @click="ikuaiNodesPage.removeCnameEntry(idx)" variant="outline-danger" size="sm">{{ t('common.delete') }}</pv-button>
                                    </div>
                                </div>
                                <div class="d-flex gap-2 mt-2">
                                    <pv-button @click="ikuaiNodesPage.addCnameEntry()" variant="outline" size="lg">{{ t('settings.network.addNode') }}</pv-button>
                                </div>
                                <small class="text-muted d-block mt-2">{{ t('nodes.cnameHint') }}</small>
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- DHCP -->
                        <h6 class="section-label">{{ t('nodes.dhcp') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-4">
                                <label class="form-label">{{ t('settings.network.dns1') }}</label>
                                <input type="text" class="form-control" v-model="ikuaiNodesPage.networkForm.dhcp_dns1" placeholder="180.76.76.76">
                            </div>
                            <div class="col-md-4">
                                <label class="form-label">{{ t('settings.network.dns2') }}</label>
                                <input type="text" class="form-control" v-model="ikuaiNodesPage.networkForm.dhcp_dns2" placeholder="223.5.5.5">
                            </div>
                        </div>

                        <hr class="my-4">
                        <!-- VLAN -->
                        <h6 class="section-label">{{ t('nodes.vlan') }}</h6>
                        <div class="row g-3">
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.vlanIpStart') }}</label>
                                <input type="text" class="form-control" v-model="ikuaiNodesPage.networkForm.vlan_ip_segment_start" placeholder="172.16.0.1">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.vlanIdStart') }}</label>
                                <input type="number" class="form-control" v-model.number="ikuaiNodesPage.networkForm.vlan_id_start" min="2" max="4090" placeholder="1000">
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.vlanIface') }}</label>
                                <select class="form-select" v-model="ikuaiNodesPage.networkForm.vlan_interface">
                                    <option value="">{{ t('nodes.selectIface') }}</option>
                                    <option v-for="iface in ikuaiNodesPage.interfaces.value" :key="iface.name" :value="iface.name">{{ iface.name }}</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label">{{ t('settings.network.vlanMaxPerUser') }}</label>
                                <input type="number" class="form-control" v-model.number="ikuaiNodesPage.networkForm.vlan_max_per_user" min="0" max="1000" placeholder="5">
                            </div>
                        </div>

                        <div class="d-flex gap-2 mt-4">
                            <pv-button type="button" variant="outline" @click="ikuaiNodesPage.testConnection()" :disabled="ikuaiNodesPage.testing.value">
                                {{ ikuaiNodesPage.testing.value ? t('settings.testing') : t('settings.testConn') }}
                            </pv-button>
                            <pv-button type="submit" variant="primary" :disabled="ikuaiNodesPage.saving.value">
                                {{ ikuaiNodesPage.saving.value ? t('common.saving') : t('nodes.saveNodeBtn') }}
                            </pv-button>
                        </div>
                    </form>
                </div>
            </div></div>
        </div>
    </div>
    `);
})();
