(function () {
    if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
    window.__dashboardTemplateParts.push(`
    <!-- 日志页 -->
    <div v-show="activeSection === 'logs'">
        <div class="module-header">
            <h4 class="module-title">{{ t('dash.log.title') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="outline" size="sm" @click="refreshLogs">{{ t('dash.log.refresh') }}</pv-button>
                <pv-button variant="outline" size="sm" @click="exportLogs">{{ t('dash.log.export') }}</pv-button>
                <pv-button variant="danger" size="sm" @click="clearLogs">{{ t('dash.log.clear') }}</pv-button>
            </div>
        </div>
        <div class="table-container mb-4" style="padding:12px;">
                <!-- tab 切换：按钮在切换时保持一致，仅刷新/导出/清空对应 tab 数据（log-nav-tabs：与 admin 日志中心一致的玻璃渐变药丸样式） -->
                <ul class="nav nav-tabs log-nav-tabs mb-3">
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: logTab === 'operation' }" href="#" @click.prevent="switchLogTab('operation')">{{ t('dash.log.opTab') }}</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: logTab === 'login' }" href="#" @click.prevent="switchLogTab('login')">{{ t('dash.log.loginTab') }}</a>
                    </li>
                </ul>
                <!-- Tips：日志保留上限提示（红字，深色模式自动加深） -->
                <div class="py-1 px-2 mb-2 small" style="color: var(--color-danger);" v-if="logKeepCount > 0">
                    <i class="bi bi-info-circle me-1"></i>{{ tFormat('dash.log.keepTip', logKeepCount) }}
                </div>
                <!-- 筛选栏 -->
                <div class="row g-2 mb-3">
                    <div class="col-auto" v-if="logTab === 'operation'">
                        <select class="form-select form-select-sm" style="width:140px" v-model="opLogFilter.category" @change="searchLogs">
                            <option value="">{{ t('common.all') }}</option>
                            <option value="user_login">{{ t('dash.log.catUserLogin') }}</option>
                            <option value="vm_lxc">{{ t('dash.log.catVmLxc') }}</option>
                            <option value="password">{{ t('dash.log.catPassword') }}</option>
                            <option value="purchase">{{ t('dash.log.catPurchase') }}</option>
                            <option value="disk">{{ t('dash.disk.manage') }}</option>
                            <option value="setting">{{ t('dash.log.catSetting') }}</option>
                            <option value="security">{{ t('dash.log.catSecurity') }}</option>
                        </select>
                    </div>
                    <div class="col-auto" v-if="logTab === 'login'">
                        <select class="form-select form-select-sm" style="width:140px" v-model="loginLogFilter.status" @change="searchLogs">
                            <option value="">{{ t('common.all') }}</option>
                            <option value="success">{{ t('dash.log.loginSuccess') }}</option>
                            <option value="failed">{{ t('dash.log.loginFailed') }}</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:220px" v-model="logKeyword" :placeholder="t('dash.log.keyword')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">{{ t('dash.log.search') }}</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">{{ t('common.reset') }}</pv-button>
                    </div>
                </div>
                <!-- 操作日志表格 -->
                <div class="table-responsive" v-if="logTab === 'operation'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th style="width:120px">{{ t('dash.log.user') }}</th>
                                <th style="width:130px">{{ t('dash.log.opType') }}</th>
                                <th class="text-start">{{ t('common.detail') }}</th>
                                <th style="width:170px">{{ t('dash.log.opTime') }}</th>
                                <th style="width:70px">{{ t('common.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in opLogList" :key="row.id">
                                <td>{{ row.username || '-' }}</td>
                                <td>{{ row.category_name }}</td>
                                <td class="small text-start"><span class="log-detail-truncate" :title="row.detail_text">{{ row.detail_text }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td><pv-button size="sm" @click="showLogDetail(row)">{{ t('common.detail') }}</pv-button></td>
                            </tr>
                            <tr v-if="!opLogList || opLogList.length === 0">
                                <td colspan="5" class="text-center text-muted py-3">{{ t('dash.log.noOpLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 登录日志表格 -->
                <div class="table-responsive" v-if="logTab === 'login'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th style="width:230px">{{ t('dash.log.ipLocation') }}</th>
                                <th class="text-start ps-3">{{ t('dash.log.userAgent') }}</th>
                                <th class="text-nowrap" style="width:100px">{{ t('dash.log.loginStatus') }}</th>
                                <th style="width:170px">{{ t('dash.log.time') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in loginLogList" :key="row.id">
                                <td class="small">{{ row.ip }}<span v-if="row.ip_location">（{{ row.ip_location }}）</span></td>
                                <td class="small text-start ps-3 text-break">{{ row.user_agent }}</td>
                                <td class="text-nowrap"><span :class="'badge ' + (row.status === 'success' ? 'bg-success' : 'bg-danger')">{{ row.status === 'success' ? t('dash.log.loginSuccess') : t('dash.log.loginFailed') }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                            </tr>
                            <tr v-if="!loginLogList || loginLogList.length === 0">
                                <td colspan="4" class="text-center text-muted py-3">{{ t('dash.log.noLoginLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 分页：通用分页条（pv-pagination 单一实现） -->
                <pv-pagination :total="currentLogTotal" :page="currentLogPage" :page-size="logPageSize" @change="loadCurrentLogs" @page-size-change="changeLogPageSize"></pv-pagination>
        </div>
    </div>
    `);
})();
