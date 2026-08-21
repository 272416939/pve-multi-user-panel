(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 日志中心（操作日志 / 后台操作 / 登录日志 / 系统切换 四 tab） -->
    <div v-if="activeSection === 'logs'">
        <div class="module-header">
            <h4 class="module-title">{{ t('nav.logs') }}</h4>
            <div class="d-flex gap-2">
                <pv-button variant="outline" size="sm" @click="refreshLogs">{{ t('dash.log.refresh') }}</pv-button>
                <pv-button variant="outline" size="sm" v-if="logTab !== 'os-switch'" @click="exportLogs">{{ t('admin.logs.exportCsv') }}</pv-button>
                <pv-button variant="outline" size="sm" @click="batchDeleteLogs">{{ t('admin.logs.batchDelete') }}</pv-button>
                <pv-button variant="danger" size="sm" @click="clearLogs">{{ t('admin.logs.clear') }}</pv-button>
            </div>
        </div>
        <!-- tab 切换：按钮在切换时保持一致，仅刷新/导出/清空/批量删除对应 tab 数据 -->
        <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'operation' }" href="#" @click.prevent="switchLogTab('operation')">{{ t('dash.log.opTab') }}</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'admin' }" href="#" @click.prevent="switchLogTab('admin')">{{ t('admin.logs.tabAdmin') }}</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'login' }" href="#" @click.prevent="switchLogTab('login')">{{ t('dash.log.loginTab') }}</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'os-switch' }" href="#" @click.prevent="switchLogTab('os-switch')">{{ t('admin.logs.tabOsSwitch') }}</a>
            </li>
        </ul>
        <!-- 四个 tab 共用同一表格容器（玻璃态 table-container，与交易流水样式一致融入主题）；
             系统切换详情弹窗由 admin-template-os-switch-logs.js 提供 -->
        <div class="table-container mb-4" style="padding:12px;">
                <!-- Tips：日志保留上限提示（红字，深色模式自动加深） -->
                <div class="py-1 px-2 mb-2 small" style="color: var(--color-danger);" v-if="logKeepCount > 0">
                    <i class="bi bi-info-circle me-1"></i>{{ tFormat('admin.logs.keepTip', logKeepCount, logKeepAdminCount) }}
                </div>
                <!-- 筛选栏：操作日志 -->
                <div class="row g-2 mb-3" v-if="logTab === 'operation'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="opLogFilter.category" @change="searchLogs">
                            <option value="">{{ t('admin.logs.allTypes') }}</option>
                            <option value="user_login">{{ t('dash.log.catUserLogin') }}</option>
                            <option value="vm_lxc">{{ t('dash.log.catVmLxc') }}</option>
                            <option value="password">{{ t('dash.log.catPassword') }}</option>
                            <option value="purchase">{{ t('dash.log.catPurchase') }}</option>
                            <option value="disk">{{ t('dash.log.catDisk') }}</option>
                            <option value="setting">{{ t('dash.log.catSetting') }}</option>
                            <option value="security">{{ t('dash.log.catSecurity') }}</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="opLogFilter.user_id" :placeholder="t('admin.logs.userId')" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="opLogFilter.username" :placeholder="t('admin.logs.username')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="opLogFilter.keyword" :placeholder="t('dash.log.keyword')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="opLogFilter.start_date" :title="t('admin.logs.startDate')">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="opLogFilter.end_date" :title="t('admin.logs.endDate')">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">{{ t('dash.log.search') }}</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">{{ t('common.reset') }}</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：后台操作 -->
                <div class="row g-2 mb-3" v-if="logTab === 'admin'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="adminLogFilter.action_prefix" @change="searchLogs">
                            <option value="">{{ t('admin.logs.allTypes') }}</option>
                            <option value="user">{{ t('admin.sub.user') }}</option>
                            <option value="config">{{ t('admin.sub.config') }}</option>
                            <option value="disk">{{ t('admin.sub.disk') }}</option>
                            <option value="vm,lxc">{{ t('admin.logs.subVm') }}</option>
                            <option value="package,template,os-template">{{ t('admin.logs.subPackageTpl') }}</option>
                            <option value="email-template">{{ t('admin.sub.emailTemplate') }}</option>
                            <option value="package-group">{{ t('admin.sub.packageGroup') }}</option>
                            <option value="cdk">{{ t('admin.sub.cdk') }}</option>
                            <option value="backup">{{ t('admin.sub.backup') }}</option>
                            <option value="message">{{ t('admin.sub.message') }}</option>
                            <option value="network">{{ t('admin.sub.network') }}</option>
                            <option value="order">{{ t('admin.sub.order') }}</option>
                            <option value="log">{{ t('admin.sub.log') }}</option>
                            <option value="cache">{{ t('admin.sub.cache') }}</option>
                            <option value="system">{{ t('admin.sub.system') }}</option>
                            <option value="security">{{ t('dash.log.catSecurity') }}</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="adminLogFilter.user_id" :placeholder="t('admin.logs.userId')" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="adminLogFilter.username" :placeholder="t('admin.logs.username')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="adminLogFilter.keyword" :placeholder="t('dash.log.keyword')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="adminLogFilter.start_date" :title="t('admin.logs.startDate')">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="adminLogFilter.end_date" :title="t('admin.logs.endDate')">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">{{ t('dash.log.search') }}</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">{{ t('common.reset') }}</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：登录日志 -->
                <div class="row g-2 mb-3" v-if="logTab === 'login'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="loginLogFilter.status" @change="searchLogs">
                            <option value="">{{ t('admin.logs.allStatus') }}</option>
                            <option value="success">{{ t('dash.log.loginSuccess') }}</option>
                            <option value="failed">{{ t('dash.log.loginFailed') }}</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="loginLogFilter.user_id" :placeholder="t('admin.logs.userId')" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="loginLogFilter.username" :placeholder="t('admin.logs.username')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="loginLogFilter.keyword" :placeholder="t('dash.log.keyword')" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="loginLogFilter.start_date" :title="t('admin.logs.startDate')">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="loginLogFilter.end_date" :title="t('admin.logs.endDate')">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">{{ t('dash.log.search') }}</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">{{ t('common.reset') }}</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：系统切换 -->
                <div class="row g-2 mb-3" v-if="logTab === 'os-switch'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="osSwitchLogFilter.status" @change="loadOsSwitchLogs(1)">
                            <option value="">{{ t('admin.logs.allStatus') }}</option>
                            <option value="success">{{ t('admin.osswitchlog.status.success') }}</option>
                            <option value="failed">{{ t('admin.osswitchlog.status.failed') }}</option>
                            <option value="running">{{ t('admin.osswitchlog.status.running') }}</option>
                            <option value="pending">{{ t('admin.osswitchlog.status.pending') }}</option>
                            <option value="rolled_back">{{ t('admin.osswitchlog.status.rolledBack') }}</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.vm_id" placeholder="VMID" type="number" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.user_id" :placeholder="t('admin.logs.userId')" type="number" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="osSwitchLogFilter.username" :placeholder="t('admin.logs.username')" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="osSwitchLogFilter.keyword" :placeholder="t('dash.log.keyword')" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="osSwitchLogFilter.start_date" :title="t('admin.logs.startDate')">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="osSwitchLogFilter.end_date" :title="t('admin.logs.endDate')">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="loadOsSwitchLogs(1)">{{ t('dash.log.search') }}</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetOsSwitchLogFilter()">{{ t('common.reset') }}</pv-button>
                    </div>
                </div>
                <!-- 操作日志表格（全站用户操作，排除后台操作） -->
                <div class="table-responsive" v-if="logTab === 'operation'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">{{ t('admin.logs.code') }}</th>
                                <th style="width:110px">{{ t('dash.log.user') }}</th>
                                <th style="width:110px">{{ t('dash.log.opType') }}</th>
                                <th class="text-start">{{ t('common.detail') }}</th>
                                <th style="width:170px">{{ t('dash.log.opTime') }}</th>
                                <th style="width:70px">{{ t('common.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small">{{ t(logCatKey(row.category_key)) || row.category_name }}</td>
                                <td class="small text-start"><span class="log-detail-truncate" :title="row.detail_text">{{ row.detail_text }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <pv-button size="sm" @click="showLogDetail(row)">{{ t('common.detail') }}</pv-button>
                                        <pv-button size="sm" variant="danger" @click="deleteLogRow(row)">{{ t('common.delete') }}</pv-button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="7" class="text-center text-muted py-3">{{ t('dash.log.noOpLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 后台操作表格（仅 admin.*，操作类型列显示子域中文映射，如 admin.config.log → 配置管理） -->
                <div class="table-responsive" v-if="logTab === 'admin'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">{{ t('admin.logs.code') }}</th>
                                <th style="width:110px">{{ t('admin.logs.admin') }}</th>
                                <th style="width:130px">{{ t('dash.log.opType') }}</th>
                                <th class="text-start">{{ t('common.detail') }}</th>
                                <th style="width:170px">{{ t('dash.log.opTime') }}</th>
                                <th style="width:70px">{{ t('common.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small text-break">{{ t(logSubKey(row.sub_category_key)) || row.action }}</td>
                                <td class="small text-start"><span class="log-detail-truncate" :title="row.detail_text">{{ row.detail_text }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <pv-button size="sm" @click="showLogDetail(row)">{{ t('common.detail') }}</pv-button>
                                        <pv-button size="sm" variant="danger" @click="deleteLogRow(row)">{{ t('common.delete') }}</pv-button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="7" class="text-center text-muted py-3">{{ t('admin.logs.noAdminLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 登录日志表格（全站） -->
                <div class="table-responsive" v-if="logTab === 'login'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">{{ t('admin.logs.code') }}</th>
                                <th style="width:110px">{{ t('dash.log.user') }}</th>
                                <th style="width:230px">{{ t('dash.log.ipLocation') }}</th>
                                <th class="text-start ps-3">{{ t('dash.log.userAgent') }}</th>
                                <th class="text-nowrap" style="width:100px">{{ t('dash.log.loginStatus') }}</th>
                                <th style="width:170px">{{ t('dash.log.time') }}</th>
                                <th style="width:70px">{{ t('common.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small">{{ row.ip }}<span v-if="row.ip_location">（{{ row.ip_location }}）</span></td>
                                <td class="small text-start ps-3 text-break">{{ row.user_agent }}</td>
                                <td class="text-nowrap"><span :class="'badge ' + (row.status === 'success' ? 'bg-success' : 'bg-danger')">{{ row.status === 'success' ? t('dash.log.loginSuccess') : t('dash.log.loginFailed') }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td><pv-button size="sm" variant="danger" @click="deleteLogRow(row)">{{ t('common.delete') }}</pv-button></td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="8" class="text-center text-muted py-3">{{ t('dash.log.noLoginLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 系统切换表格 -->
                <div class="table-responsive" v-if="logTab === 'os-switch'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">{{ t('admin.logs.code') }}</th>
                                <th style="width:90px">VMID</th>
                                <th style="width:110px">{{ t('dash.log.user') }}</th>
                                <th>{{ t('admin.osswitchlog.fromSystem') }}</th>
                                <th>{{ t('admin.osswitchlog.toSystem') }}</th>
                                <th style="width:110px">{{ t('common.status') }}</th>
                                <th style="width:170px">{{ t('dash.log.time') }}</th>
                                <th style="width:130px">{{ t('common.actions') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in osSwitchLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="osSwitchLogSelected.includes(row.id)" @change="toggleOneOsSwitchLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.vm_id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : row.user_id }}</td>
                                <td class="small text-muted">{{ row.from_os_template_name || row.from_os_template_id || '-' }}</td>
                                <td class="small">{{ row.to_os_template_name || row.to_os_template_id }}</td>
                                <td>
                                    <span :class="'badge ' + {
                                        success: 'bg-success', failed: 'bg-danger',
                                        running: 'bg-primary', pending: 'bg-warning text-dark',
                                        rolled_back: 'bg-secondary'
                                    }[row.status] || 'bg-secondary'">{{ {success:t('admin.osswitchlog.status.success'),failed:t('admin.osswitchlog.status.failed'),running:t('admin.osswitchlog.status.running'),pending:t('admin.osswitchlog.status.pending'),rolled_back:t('admin.osswitchlog.status.rolledBack')}[row.status] || row.status }}</span>
                                    <span v-if="row.admin_intervention_required" class="badge bg-danger ms-1">{{ t('admin.logs.needIntervene') }}</span>
                                </td>
                                <td class="small">{{ row.started_at ? formatDate(row.started_at) : '-' }}</td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <pv-button size="sm" @click="showOsSwitchLogDetail(row)">{{ t('common.detail') }}</pv-button>
                                        <pv-button size="sm" variant="danger" @click="deleteLogRow(row)" :disabled="row.status === 'running'">{{ t('common.delete') }}</pv-button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!osSwitchLogList || osSwitchLogList.length === 0">
                                <td colspan="9" class="text-center text-muted py-3">{{ t('admin.logs.noOsSwitchLogs') }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 分页：通用分页条（pv-pagination 单一实现，四 tab 统一） -->
                <pv-pagination :total="currentLogTotal" :page="currentLogPage" :page-size="logPageSize" @change="loadCurrentLogs" @page-size-change="changeLogPageSize"></pv-pagination>
        </div>
    </div>
    `);
})();
