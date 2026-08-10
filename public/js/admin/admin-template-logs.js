(function () {
    if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
    window.__adminTemplateParts.push(`
    <!-- 日志中心（操作日志 / 后台操作 / 登录日志 / 系统切换 四 tab） -->
    <div v-if="activeSection === 'logs'">
        <div class="module-header">
            <h4 class="module-title">日志中心</h4>
            <div class="d-flex gap-2">
                <pv-button variant="outline" size="sm" @click="refreshLogs">刷新日志</pv-button>
                <pv-button variant="outline" size="sm" v-if="logTab !== 'os-switch'" @click="exportLogs">导出 CSV</pv-button>
                <pv-button variant="outline" size="sm" @click="batchDeleteLogs">批量删除</pv-button>
                <pv-button variant="danger" size="sm" @click="clearLogs">清空</pv-button>
            </div>
        </div>
        <!-- tab 切换：按钮在切换时保持一致，仅刷新/导出/清空/批量删除对应 tab 数据 -->
        <ul class="nav nav-tabs mb-3">
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'operation' }" href="#" @click.prevent="switchLogTab('operation')">操作日志</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'admin' }" href="#" @click.prevent="switchLogTab('admin')">后台操作</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'login' }" href="#" @click.prevent="switchLogTab('login')">登录日志</a>
            </li>
            <li class="nav-item">
                <a class="nav-link" :class="{ active: logTab === 'os-switch' }" href="#" @click.prevent="switchLogTab('os-switch')">系统切换</a>
            </li>
        </ul>
        <!-- 四个 tab 共用同一表格容器（玻璃态 table-container，与交易流水样式一致融入主题）；
             系统切换详情弹窗由 admin-template-os-switch-logs.js 提供 -->
        <div class="table-container mb-4" style="padding:12px;">
                <!-- Tips：日志保留上限提示（红字，深色模式自动加深） -->
                <div class="py-1 px-2 mb-2 small" style="color: var(--color-danger);" v-if="logKeepCount > 0">
                    <i class="bi bi-info-circle me-1"></i>Tips：用户操作日志每用户上限 {{ logKeepCount }} 条，后台操作日志全站上限 {{ logKeepAdminCount }} 条，超出自动清理最早的历史数据
                </div>
                <!-- 筛选栏：操作日志 -->
                <div class="row g-2 mb-3" v-if="logTab === 'operation'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="opLogFilter.category" @change="searchLogs">
                            <option value="">全部类型</option>
                            <option value="user_login">用户登陆</option>
                            <option value="vm_lxc">操作VM/LXC</option>
                            <option value="password">重置密码</option>
                            <option value="purchase">新购/续费</option>
                            <option value="disk">硬盘管理</option>
                            <option value="setting">功能设置</option>
                            <option value="security">安全设置</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="opLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="opLogFilter.username" placeholder="用户名" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="opLogFilter.keyword" placeholder="关键字搜索" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="opLogFilter.start_date" title="开始日期">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="opLogFilter.end_date" title="结束日期">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">查询</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">重置</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：后台操作 -->
                <div class="row g-2 mb-3" v-if="logTab === 'admin'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="adminLogFilter.action_prefix" @change="searchLogs">
                            <option value="">全部类型</option>
                            <option value="user">用户管理</option>
                            <option value="config">配置管理</option>
                            <option value="disk">磁盘管理</option>
                            <option value="vm,lxc">虚拟机管理</option>
                            <option value="package,template,os-template">套餐模板</option>
                            <option value="package-group">套餐分组</option>
                            <option value="cdk">CDK管理</option>
                            <option value="backup">备份管理</option>
                            <option value="message">消息管理</option>
                            <option value="network">网络管理</option>
                            <option value="order">订单开通</option>
                            <option value="log">日志管理</option>
                            <option value="cache">缓存管理</option>
                            <option value="system">系统操作</option>
                            <option value="security">安全设置</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="adminLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="adminLogFilter.username" placeholder="用户名" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="adminLogFilter.keyword" placeholder="关键字搜索" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="adminLogFilter.start_date" title="开始日期">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="adminLogFilter.end_date" title="结束日期">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">查询</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">重置</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：登录日志 -->
                <div class="row g-2 mb-3" v-if="logTab === 'login'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="loginLogFilter.status" @change="searchLogs">
                            <option value="">全部状态</option>
                            <option value="success">登录成功</option>
                            <option value="failed">登录失败</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="loginLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="loginLogFilter.username" placeholder="用户名" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="loginLogFilter.keyword" placeholder="关键字搜索" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="loginLogFilter.start_date" title="开始日期">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="loginLogFilter.end_date" title="结束日期">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">查询</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">重置</pv-button>
                    </div>
                </div>
                <!-- 筛选栏：系统切换 -->
                <div class="row g-2 mb-3" v-if="logTab === 'os-switch'">
                    <div class="col-auto">
                        <select class="form-select form-select-sm" style="width:130px" v-model="osSwitchLogFilter.status" @change="loadOsSwitchLogs(1)">
                            <option value="">全部状态</option>
                            <option value="success">成功</option>
                            <option value="failed">失败</option>
                            <option value="running">切换中</option>
                            <option value="pending">等待中</option>
                            <option value="rolled_back">已回滚</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.vm_id" placeholder="VMID" type="number" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="osSwitchLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="osSwitchLogFilter.username" placeholder="用户名" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:160px" v-model="osSwitchLogFilter.keyword" placeholder="关键字搜索" autocomplete="off" @keyup.enter="loadOsSwitchLogs(1)">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="osSwitchLogFilter.start_date" title="开始日期">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" type="date" style="width:150px" v-model="osSwitchLogFilter.end_date" title="结束日期">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="loadOsSwitchLogs(1)">查询</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetOsSwitchLogFilter()">重置</pv-button>
                    </div>
                </div>
                <!-- 操作日志表格（全站用户操作，排除后台操作） -->
                <div class="table-responsive" v-if="logTab === 'operation'">
                    <table class="table table-hover mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">编码</th>
                                <th style="width:110px">用户</th>
                                <th style="width:110px">操作类型</th>
                                <th class="text-start">详情</th>
                                <th style="width:170px">操作时间</th>
                                <th style="width:70px">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small">{{ row.category_name }}</td>
                                <td class="small text-start text-break">{{ row.detail_text }}</td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td><pv-button size="sm" variant="danger" @click="deleteLogRow(row)">删除</pv-button></td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="7" class="text-center text-muted py-3">暂无操作日志</td>
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
                                <th style="width:80px">编码</th>
                                <th style="width:110px">管理员</th>
                                <th style="width:130px">操作类型</th>
                                <th class="text-start">详情</th>
                                <th style="width:170px">操作时间</th>
                                <th style="width:70px">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small text-break">{{ row.sub_category_name || row.action }}</td>
                                <td class="small text-start text-break">{{ row.detail_text }}</td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td><pv-button size="sm" variant="danger" @click="deleteLogRow(row)">删除</pv-button></td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="7" class="text-center text-muted py-3">暂无后台操作日志</td>
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
                                <th style="width:80px">编码</th>
                                <th style="width:110px">用户</th>
                                <th style="width:230px">IP地址（归属地）</th>
                                <th class="text-start ps-3">用户代理</th>
                                <th class="text-nowrap" style="width:100px">登陆状态</th>
                                <th style="width:170px">时间</th>
                                <th style="width:70px">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username ? row.username + '[' + row.user_id + ']' : (row.user_id || '-') }}</td>
                                <td class="small">{{ row.ip }}<span v-if="row.ip_location">（{{ row.ip_location }}）</span></td>
                                <td class="small text-start ps-3 text-break">{{ row.user_agent }}</td>
                                <td class="text-nowrap"><span :class="'badge ' + (row.status === 'success' ? 'bg-success' : 'bg-danger')">{{ row.status === 'success' ? '登录成功' : '登录失败' }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                                <td><pv-button size="sm" variant="danger" @click="deleteLogRow(row)">删除</pv-button></td>
                            </tr>
                            <tr v-if="!currentLogList || currentLogList.length === 0">
                                <td colspan="8" class="text-center text-muted py-3">暂无登录日志</td>
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
                                <th style="width:80px">编码</th>
                                <th style="width:90px">VMID</th>
                                <th style="width:110px">用户</th>
                                <th>来源系统</th>
                                <th>目标系统</th>
                                <th style="width:110px">状态</th>
                                <th style="width:170px">时间</th>
                                <th style="width:130px">操作</th>
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
                                    }[row.status] || 'bg-secondary'">{{ {success:'成功',failed:'失败',running:'切换中',pending:'等待中',rolled_back:'已回滚'}[row.status] || row.status }}</span>
                                    <span v-if="row.admin_intervention_required" class="badge bg-danger ms-1">需介入</span>
                                </td>
                                <td class="small">{{ row.started_at ? formatDate(row.started_at) : '-' }}</td>
                                <td>
                                    <div class="d-flex gap-1">
                                        <pv-button size="sm" @click="showOsSwitchLogDetail(row)">详情</pv-button>
                                        <pv-button size="sm" variant="danger" @click="deleteLogRow(row)" :disabled="row.status === 'running'">删除</pv-button>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="!osSwitchLogList || osSwitchLogList.length === 0">
                                <td colspan="9" class="text-center text-muted py-3">暂无切换日志</td>
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
