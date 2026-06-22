(function() {
  if (!window.__adminTemplateParts) window.__adminTemplateParts = [];
  window.__adminTemplateParts.push(`
<div v-if="activeSection === 'settings'">
                    <!-- SMTP 配置 -->
                    <div v-if="activeTab === 'smtp'">
                        <h4 class="module-title">SMTP 配置</h4>
                        <div class="card mb-4">
                            <div class="card-body">
                                <form @submit.prevent="saveSmtpConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">SMTP 服务器</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.host" placeholder="smtp.example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">端口</label>
                                            <input type="number" class="form-control" v-model="smtpConfig.port" placeholder="587">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">用户名</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.user" placeholder="user@example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">密码</label>
                                            <input type="password" class="form-control" v-model="smtpConfig.password" placeholder="留空则不修改" autocomplete="off">
                                        </div>
                                    </div>
                                    <div class="row mb-3">
                                        <div class="col-md-6">
                                            <label class="form-label">发件人</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.from" placeholder="noreply@example.com">
                                        </div>
                                        <div class="col-md-6">
                                            <div class="form-check mt-4">
                                                <input type="checkbox" class="form-check-input" id="smtpSecure" v-model="smtpConfig.secure">
                                                <label class="form-check-label" for="smtpSecure">使用 SSL/TLS</label>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="form-check mb-3">
                                        <input type="checkbox" class="form-check-input" id="smtpEnabled" v-model="smtpConfig.enabled">
                                        <label class="form-check-label" for="smtpEnabled">启用 SMTP</label>
                                    </div>
                                    <div class="d-flex gap-2">
                                        <pv-button type="submit" variant="glass" >保存配置</pv-button>
                                        <pv-button type="button" style="border-color:rgba(99,102,241,0.25);background:rgba(99,102,241,0.08);" @click="testSmtpConfig" variant="glass">发送测试邮件</pv-button>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <h4 class="module-title">到期提醒配置</h4>
                        <div class="card">
                            <div class="card-body">
                                <form @submit.prevent="saveReminderConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 1（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days1" min="0" placeholder="7">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 2（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days2" min="0" placeholder="3">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">提醒时间 3（天）</label>
                                            <input type="number" class="form-control" v-model.number="reminderConfig.days3" min="0" placeholder="1">
                                            <small class="text-muted">设置为 0 则不发送此提醒</small>
                                        </div>
                                    </div>
                                    <pv-button type="submit" variant="glass" >保存提醒配置</pv-button>
                                </form>
                            </div>
                        </div>
                    </div>

                </div>
                <!-- end settings(smtp) -->
<div v-if="activeSection === 'settings'">

                    <!-- 快照 & 备份配置（合并） -->
                    <div v-if="activeTab === 'snapshot-backup'">
                        <h4 class="module-title">快照 & 备份配置</h4>

                        <!-- 快照配置 -->
                        <div class="card mb-4">
                            <div class="card-header"><h5 class="mb-0">快照设置</h5></div>
                            <div class="card-body">
                                <form @submit.prevent="saveSnapshotConfig">
                                    <div class="row mb-3">
                                        <div class="col-md-4">
                                            <label class="form-label">每台虚拟机最多快照数</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.max_per_vm" min="1" placeholder="5">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">单个用户每日创建上限</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_create_limit" min="1" placeholder="20">
                                        </div>
                                        <div class="col-md-4">
                                            <label class="form-label">单个用户每日恢复上限</label>
                                            <input type="number" class="form-control" v-model.number="snapshotConfig.daily_restore_limit" min="1" placeholder="10">
                                        </div>
                                    </div>
                                    <div class="d-flex align-items-center gap-3">
                                        <pv-button type="submit" variant="glass" >保存快照配置</pv-button>
                                        <small class="text-muted">以上限制仅对普通用户生效</small>
                                    </div>
                                </form>
                            </div>
                        </div>

                        <!-- 备份配置 -->
                        <div class="card">
                            <div class="card-header"><h5 class="mb-0">备份设置</h5></div>
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">全局默认备份存储位置</label>
                                    <select class="form-select" v-model="backupConfigForm.default_storage">
                                        <option v-for="s in storageList" :key="s.id" :value="s.id">{{ s.id }} ({{ s.type }})</option>
                                    </select>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">每台 VM 最多备份数</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.max_per_vm" min="1">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label">单用户每日备份上限</label>
                                        <input type="number" class="form-control" v-model.number="backupConfigForm.daily_limit" min="1">
                                    </div>
                                </div>
                                <p class="text-muted small mb-3">限制仅对普通用户生效，管理员不受限</p>
                                <pv-button @click="saveBackupConfig" variant="glass">保存备份配置</pv-button>
                            </div>
                        </div>
                    </div>

                    <!-- 网络管理 -->
                    <div v-if="activeTab === 'network'">
                        <h4 class="module-title">端口转发配置</h4>
                        <div class="card">
                            <div class="card-header"><h5 class="mb-0">全局设置</h5></div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">端口范围起始</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_start" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">端口范围结束</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.port_range_end" min="1024" max="65535">
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <small class="text-muted">新建端口转发时将自动校验此范围</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">每用户最大规则数</label>
                                        <input type="number" class="form-control" v-model.number="networkConfig.max_per_user" min="0" max="100">
                                        <small class="text-muted">0=不限制，超过限制时用户无法新增转发</small>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">默认外网接口</label>
                                        <input type="text" class="form-control" v-model="networkConfig.wan_interface" placeholder="如：adsl1,adsl2">
                                        <small class="text-muted">多个接口用英文逗号分隔，将作为一条规则绑定多接口</small>
                                        <small class="text-muted d-block mt-1" v-if="wanInterfaceList.length > 0">
                                            可用接口：{{ wanInterfaceList.map(i => i.name).join(', ') }}
                                        </small>
                                    </div>
                                    <div class="col-md-4 d-flex align-items-center" style="padding-top: 24px;">
                                        <pv-button style="border-color:rgba(99,102,241,0.2);background:rgba(99,102,241,0.08);color:#A5B4FC;" @click="refreshIfaceList" variant="glass">刷新接口</pv-button>
                                        <small class="text-muted" v-if="ifaceUpdateTime" style="white-space: nowrap;">最后更新: {{ ifaceUpdateTime }}</small>
                                    </div>
                                </div>
                                <pv-button @click="saveNetworkConfig">💾 保存配置</pv-button>
                            </div>
                        </div>

                        <!-- CNAME 域名配置 -->
                        <div class="card mt-3">
                            <div class="card-header"><h5 class="mb-0">CNAME 域名设置</h5></div>
                            <div class="card-body">
                                <p class="text-muted small mb-3">配置统一公网域名，所有虚拟机/容器通过此域名访问（需在 DNS 服务商处将 CNAME 指向主机公网 IP）。</p>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">CNAME 域名</label>
                                        <input type="text" class="form-control" v-model="networkConfig.cname_domain" placeholder="例如: pve.example.com">
                                    </div>
                                    <div class="col-md-6 d-flex align-items-end">
                                        <pv-button @click="saveNetworkConfig" variant="primary">💾 保存 CNAME</pv-button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- DHCP 静态绑定配置 -->
                        <div class="card mt-3">
                            <div class="card-header">
                                <h5 class="mb-0">DHCP 静态绑定设置</h5>
                            </div>
                            <div class="card-body">
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">IP 分配范围起始</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_ip_range_start" placeholder="10.0.0.110">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">IP 分配范围结束</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_ip_range_end" placeholder="10.0.0.199">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">所属接口</label>
                                        <select class="form-select" v-model="networkConfig.dhcp_interface">
                                            <option value="" disabled>请选择 LAN 接口</option>
                                            <option v-for="iface in lanInterfaceList" :key="iface.name" :value="iface.name">
                                                {{ iface.name }}{{ iface.comment ? ' (' + iface.comment + ')' : '' }}
                                            </option>
                                        </select>
                                        <small class="text-muted">选择爱快中 DHCP 所在的 LAN 接口</small>
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-4">
                                        <label class="form-label">网关</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_gateway" placeholder="10.0.0.1">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">DNS1</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns1" placeholder="119.29.29.29">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label">DNS2</label>
                                        <input type="text" class="form-control" v-model="networkConfig.dhcp_dns2" placeholder="223.5.5.5">
                                    </div>
                                </div>
                                <small class="text-muted">VM/LXC 分配时将自动创建静态绑定，解绑时自动删除。IP 从指定范围中随机选取未被占用的地址。</small>
                                <div class="mt-3 d-flex gap-2">
                                    <pv-button @click="saveNetworkConfig" variant="glass">保存配置</pv-button>
                                    <pv-button style="border-color:rgba(56,189,248,0.3);background:linear-gradient(135deg, rgba(56,189,248,0.15), rgba(59,130,246,0.1));color:#7DD3FC;" @click="syncDhcpBindings" variant="glass">从爱快同步</pv-button>
                                </div>
                            </div>
                        </div>

                        <!-- 全局端口转发列表（分页） -->
                        <div class="card mt-3">
                            <div class="card-header d-flex justify-content-between align-items-center">
                                <h5 class="mb-0">所有端口转发</h5>
                                <small class="text-muted">共 {{ forwardRules.length }} 条</small>
                            </div>
                            <div class="card-body">
                                <div v-if="forwardRulesLoading" class="text-center py-3"><div class="spinner-border text-primary"></div></div>
                                <div v-else-if="forwardRules.length === 0" class="text-center py-4 text-muted">暂无端口转发规则</div>
                                <div v-else class="table-responsive">
                                    <table class="table table-striped table-hover">
                                        <thead>
                                            <tr>
                                                <th>#</th>
                                                <th>名称</th>
                                                <th>类型</th>
                                                <th>设备</th>
                                                <th>目标 IP</th>
                                                <th>内网端口</th>
                                                <th>外网端口</th>
                                                <th>协议</th>
                                                <th>状态</th>
                                                <th>同步状态</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr v-for="(rule, idx) in paginatedForwardRules" :key="rule.id" :class="{ 'text-muted': rule.sync_status === 'orphan' }">
                                                <td>{{ (forwardPage - 1) * forwardPageSize + idx + 1 }}</td>
                                                <td>{{ rule.name || '-' }}</td>
                                                <td><span class="type-badge" :class="rule.type === 'vm' ? 'type-badge-vm' : 'type-badge-ct'">{{ rule.type === 'vm' ? 'VM' : 'CT' }}</span></td>
                                                <td>{{ rule.vm_id || rule.ct_id }}</td>
                                                <td>{{ rule.ip }}</td>
                                                <td>{{ rule.internal_port }}</td>
                                                <td>{{ rule.external_port }}</td>
                                                <td>{{ (rule.protocol || '').toUpperCase() }}</td>
                                                <td><span :class="rule.enabled ? 'text-success' : 'text-muted'">{{ rule.enabled ? '启用' : '禁用' }}</span></td>
                                                <td>
                                                    <span v-if="rule.sync_status === 'synced'" class="badge bg-success">已同步</span>
                                                    <span v-else-if="rule.sync_status === 'orphan'" class="badge bg-secondary">孤立</span>
                                                    <span v-else-if="rule.sync_status === 'failed'" class="badge bg-danger">失败</span>
                                                    <span v-else class="badge bg-warning text-dark">待同步</span>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <!-- 分页 -->
                                <nav v-if="forwardRules.length > forwardPageSize" class="mt-2">
                                    <ul class="pagination pagination-sm justify-content-center mb-0">
                                        <li class="page-item" :class="{ disabled: forwardPage <= 1 }">
                                            <pv-button @click="forwardPage--">上一页</pv-button>
                                        </li>
                                        <li class="page-item disabled">
                                            <span class="page-link">{{ forwardPage }} / {{ Math.ceil(forwardRules.length / forwardPageSize) }}</span>
                                        </li>
                                        <li class="page-item" :class="{ disabled: forwardPage >= Math.ceil(forwardRules.length / forwardPageSize) }">
                                            <pv-button @click="forwardPage++">下一页</pv-button>
                                        </li>
                                    </ul>
                                </nav>
                            </div>
                        </div>
                    </div>

                <!-- 支付配置 -->
                <div v-if="activeSection === 'settings' && activeTab === 'pay'">
                    <div class="module-header">
                        <h4 class="module-title">支付API对接信息</h4>
                    </div>
                    <div class="table-container" style="padding:24px;">
                        <div class="row g-3">
                            <div class="col-md-6 mb-3">
                                <label class="form-label">接口地址</label>
                                <input type="text" class="form-control" v-model="payConfig.base_url" placeholder="https://pay.microgg.cn/">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">商户ID</label>
                                <input type="number" class="form-control" v-model="payConfig.pid" placeholder="商户号">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V1 MD5秘钥</label>
                                <input type="password" class="form-control" v-model="payConfig.md5_key" placeholder="商户MD5签名密钥">
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V2 RSA 商户私钥</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_private_key" placeholder="-----BEGIN PRIVATE KEY-----&#10;...&#10;-----END PRIVATE KEY-----"></textarea>
                            </div>
                            <div class="col-md-12 mb-3">
                                <label class="form-label">V2 RSA 平台公钥</label>
                                <textarea class="form-control" rows="4" v-model="payConfig.v2_public_key" placeholder="-----BEGIN PUBLIC KEY-----&#10;...&#10;-----END PUBLIC KEY-----"></textarea>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">充值金额限制</label></div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">最低充值金额（元）</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.min_amount" placeholder="如: 0.01">
                            </div>
                            <div class="col-md-6 mb-3">
                                <label class="form-label">最大充值金额（元）</label>
                                <input type="number" step="0.01" min="0.01" class="form-control" v-model.number="payConfig.max_amount" placeholder="如: 999999.99">
                            </div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">接口版本开关</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV1Switch" v-model="payConfig.v1_enabled">
                                    <label class="form-check-label" for="payV1Switch">启用 V1 (MD5签名)</label>
                                </div>
                                <small class="text-muted">基于 submit.php / mapi.php / api.php 的 MD5 签名接口</small>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payV2Switch" v-model="payConfig.v2_enabled">
                                    <label class="form-check-label" for="payV2Switch">启用 V2 (RSA签名)</label>
                                </div>
                                <small class="text-muted">基于 /api/pay/* 的 RSA-SHA256 签名接口，需填写上方密钥</small>
                            </div>
                            <div class="col-12"><hr style="border-color:rgba(255,255,255,0.1);margin:4px 0 12px;"></div>
                            <div class="col-12 mb-2"><label class="form-label fw-bold">支付方式</label></div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payAlipaySwitch" v-model="payConfig.alipay_enabled">
                                    <label class="form-check-label" for="payAlipaySwitch">支付宝</label>
                                </div>
                            </div>
                            <div class="col-md-6 mb-3">
                                <div class="form-check form-switch">
                                    <input class="form-check-input" type="checkbox" id="payWxpaySwitch" v-model="payConfig.wxpay_enabled">
                                    <label class="form-check-label" for="payWxpaySwitch">微信支付</label>
                                </div>
                            </div>
                        </div>
                        <pv-button type="button" @click="savePayConfig" style="margin-top:12px;" variant="glass">

                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> 保存配置
                        
</pv-button>
                    </div>
                </div>

                </div>
                <!-- end 系统设置区域 -->

                <!-- 财务管理 - 交易流水 -->
                

`);
})();
