(function () {
    if (!window.__dashboardTemplateParts) window.__dashboardTemplateParts = [];
    window.__dashboardTemplateParts.push(`
    <!-- 日志页 -->
    <div v-show="activeSection === 'logs'">
        <div class="module-header">
            <h4 class="module-title">日志</h4>
            <div class="d-flex gap-2">
                <pv-button variant="outline" size="sm" @click="refreshLogs">刷新日志</pv-button>
                <pv-button variant="outline" size="sm" @click="exportLogs">导出日志</pv-button>
                <pv-button variant="danger" size="sm" @click="clearLogs">清空日志</pv-button>
            </div>
        </div>
        <div class="card mb-4">
            <div class="card-body">
                <!-- tab 切换：按钮在切换时保持一致，仅刷新/导出/清空对应 tab 数据 -->
                <ul class="nav nav-tabs mb-3">
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: logTab === 'operation' }" href="#" @click.prevent="switchLogTab('operation')">操作日志</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" :class="{ active: logTab === 'login' }" href="#" @click.prevent="switchLogTab('login')">登陆日志</a>
                    </li>
                </ul>
                <!-- 筛选栏 -->
                <div class="row g-2 mb-3">
                    <div class="col-auto" v-if="logTab === 'operation'">
                        <select class="form-select form-select-sm" style="width:140px" v-model="opLogFilter.category" @change="searchLogs">
                            <option value="">全部</option>
                            <option value="user_login">用户登陆</option>
                            <option value="vm_lxc">操作VM/LXC</option>
                            <option value="password">重置密码</option>
                            <option value="order">服务开通</option>
                            <option value="disk">硬盘管理</option>
                            <option value="setting">功能设置</option>
                            <option value="security">安全设置</option>
                        </select>
                    </div>
                    <div class="col-auto" v-if="logTab === 'login'">
                        <select class="form-select form-select-sm" style="width:140px" v-model="loginLogFilter.status" @change="searchLogs">
                            <option value="">全部</option>
                            <option value="success">登录成功</option>
                            <option value="failed">登录失败</option>
                        </select>
                    </div>
                    <div class="col-auto">
                        <input class="form-control form-control-sm" style="width:220px" v-model="logKeyword" placeholder="关键字搜索" autocomplete="off" @keyup.enter="searchLogs">
                    </div>
                    <div class="col-auto d-flex gap-2">
                        <pv-button size="sm" @click="searchLogs">查询</pv-button>
                        <pv-button size="sm" variant="outline" @click="resetLogFilter">重置</pv-button>
                    </div>
                </div>
                <!-- 操作日志表格 -->
                <div class="table-responsive" v-if="logTab === 'operation'">
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th style="width:120px">用户</th>
                                <th style="width:130px">操作类型</th>
                                <th class="text-start">详情</th>
                                <th style="width:170px">操作时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in opLogList" :key="row.id">
                                <td>{{ row.username || '-' }}</td>
                                <td>{{ row.category_name }}</td>
                                <td class="small text-start text-break">{{ row.detail_text }}</td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                            </tr>
                            <tr v-if="!opLogList || opLogList.length === 0">
                                <td colspan="4" class="text-center text-muted py-3">暂无操作日志</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- 登录日志表格 -->
                <div class="table-responsive" v-if="logTab === 'login'">
                    <table class="table table-striped mb-0 table-sm table-align-center">
                        <thead>
                            <tr>
                                <th style="width:230px">IP地址（归属地）</th>
                                <th class="text-start ps-3">用户代理</th>
                                <th class="text-nowrap" style="width:100px">登陆状态</th>
                                <th style="width:170px">时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="row in loginLogList" :key="row.id">
                                <td class="small">{{ row.ip }}<span v-if="row.ip_location">（{{ row.ip_location }}）</span></td>
                                <td class="small text-muted text-start ps-3 text-break">{{ row.user_agent }}</td>
                                <td class="text-nowrap"><span :class="'badge ' + (row.status === 'success' ? 'bg-success' : 'bg-danger')">{{ row.status === 'success' ? '登录成功' : '登录失败' }}</span></td>
                                <td class="small text-nowrap">{{ row.created_at }}</td>
                            </tr>
                            <tr v-if="!loginLogList || loginLogList.length === 0">
                                <td colspan="4" class="text-center text-muted py-3">暂无登录日志</td>
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
