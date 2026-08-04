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
        <!-- 操作/后台/登录 三个 tab 共用卡片；系统切换 tab 内容由 admin-template-os-switch-logs.js 渲染 -->
        <div class="card mb-4" v-if="logTab !== 'os-switch'">
            <div class="card-body">
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
                            <option value="order">服务开通</option>
                            <option value="disk">硬盘管理</option>
                            <option value="setting">功能设置</option>
                            <option value="security">安全设置</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="opLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="opLogFilter.username" placeholder="用户名" autocomplete="off">
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
                            <option value="cdk">CDK管理</option>
                            <option value="backup">备份管理</option>
                            <option value="message">消息管理</option>
                            <option value="network">网络管理</option>
                            <option value="order">订单开通</option>
                            <option value="log">日志管理</option>
                            <option value="system">系统操作</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:100px" v-model="adminLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off">
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
                        <input class="form-control form-control-sm" style="width:100px" v-model="loginLogFilter.user_id" placeholder="用户ID" type="number" autocomplete="off">
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:110px" v-model="loginLogFilter.username" placeholder="用户名" autocomplete="off">
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
                <!-- 操作日志表格（全站用户操作，排除后台操作） -->
                <div class="table-responsive" v-if="logTab === 'operation'">
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">ID</th>
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
                                <td class="small">{{ row.username || row.user_id || '-' }}</td>
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
                <!-- 后台操作表格（仅 admin.*，操作类型列展示 action 原文） -->
                <div class="table-responsive" v-if="logTab === 'admin'">
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">ID</th>
                                <th style="width:110px">管理员</th>
                                <th style="width:200px">操作类型</th>
                                <th class="text-start">详情</th>
                                <th style="width:170px">操作时间</th>
                                <th style="width:70px">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in currentLogList" :key="row.id">
                                <td class="checkbox-col"><input type="checkbox" :checked="selectedLogIds.includes(row.id)" @change="toggleOneLog(row.id)"></td>
                                <td class="small">{{ row.id }}</td>
                                <td class="small">{{ row.username || row.user_id || '-' }}</td>
                                <td class="small text-break">{{ row.action }}</td>
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
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th class="checkbox-col"><input type="checkbox" @change="toggleAllLog($event)" :checked="isAllLogSelected()"></th>
                                <th style="width:80px">ID</th>
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
                                <td class="small">{{ row.username || row.user_id || '-' }}</td>
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
                <!-- 分页：页码按钮 + 省略号 + 每页条数 + 跳页 -->
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-3" v-if="currentLogTotal > 0">
                    <small class="text-muted">共 {{ currentLogTotal }} 条</small>
                    <div class="d-flex align-items-center gap-1">
                        <pv-button variant="outline" size="sm" :disabled="currentLogPage <= 1" @click="loadCurrentLogs(currentLogPage - 1)">&lt;</pv-button>
                        <template v-for="(p, idx) in logPageNumbers" :key="idx">
                            <span v-if="p === '...'" class="text-muted small px-1">…</span>
                            <pv-button v-else size="sm" :variant="p === currentLogPage ? 'primary' : 'outline'" @click="loadCurrentLogs(p)">{{ p }}</pv-button>
                        </template>
                        <pv-button variant="outline" size="sm" :disabled="currentLogPage >= currentLogTotalPages" @click="loadCurrentLogs(currentLogPage + 1)">&gt;</pv-button>
                        <select class="form-select form-select-sm ms-2" style="width:auto" v-model="logPageSize" @change="changeLogPageSize">
                            <option :value="20">20条/页</option>
                            <option :value="50">50条/页</option>
                            <option :value="100">100条/页</option>
                        </select>
                        <span class="text-muted small ms-2">前往</span>
                        <input type="number" class="form-control form-control-sm" style="width:70px" v-model="logGoPage" min="1" :max="currentLogTotalPages" placeholder="页" autocomplete="off" @keyup.enter="goLogPage">
                        <span class="text-muted small">页</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    `);
})();
