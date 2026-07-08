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
                                            <label class="form-label">发件人名称</label>
                                            <input type="text" class="form-control" v-model="smtpConfig.from_name" placeholder="如：OWO CLOUD（留空则使用发件人邮箱）">
                                            <small class="text-muted">收件人看到的发件人名称</small>
                                        </div>
                                        <div class="col-md-6">
                                            <label class="form-label">发件人邮箱</label>
                                            <input type="email" class="form-control" v-model="smtpConfig.from" placeholder="noreply@example.com（留空则使用 SMTP 用户名）">
                                            <div class="form-check mt-2">
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

                <!-- PVE 节点设置 -->
                <div v-if="activeTab === 'pve'">
                    <h4 class="module-title">PVE 节点设置</h4>
                    <div class="card mb-4">
                        <div class="card-body">
                            <p class="text-muted small mb-3">配置 Proxmox VE 服务器的连接信息。API Token 和 SSH 密码将加密存储，保存后显示为打码值。</p>
                            <form @submit.prevent="savePveConfig">
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">PVE API 地址</label>
                                        <input type="text" class="form-control" v-model="pveConfig.host" placeholder="https://192.168.1.100:8006">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">API Token</label>
                                        <input type="password" class="form-control" v-model="pveConfig.api_token" placeholder="留空则不修改" autocomplete="off">
                                        <small class="text-muted">格式: root@pam!panel=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx</small>
                                    </div>
                                </div>
                                <hr class="my-4">
                                <h6 class="mb-3">SSH 连接（用于终端、密码重置、备份恢复等）</h6>
                                <div class="row mb-3">
                                    <div class="col-md-6">
                                        <label class="form-label">SSH 地址</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_host" placeholder="192.168.1.100">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">SSH 端口</label>
                                        <input type="number" class="form-control" v-model="pveConfig.ssh_port" placeholder="22">
                                    </div>
                                    <div class="col-md-3">
                                        <label class="form-label">SSH 用户名</label>
                                        <input type="text" class="form-control" v-model="pveConfig.ssh_user" placeholder="root">
                                    </div>
                                </div>
                                <div class="row mb-3">
                                    <div class="col-md-8">
                                        <label class="form-label">SSH 密码</label>
                                        <input type="password" class="form-control" v-model="pveConfig.ssh_password" placeholder="留空则不修改" autocomplete="off">
                                    </div>
                                </div>
                                <pv-button type="submit" variant="glass">保存配置</pv-button>
                            </form>
                        </div>
                    </div>
                </div>
                <!-- end settings(pve) -->

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
                        <div class="card" style="position: relative; z-index: 3; overflow: visible;">
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
                                        <div class="input-group">
                                            <input type="text" class="form-control" v-model="networkConfig.wan_interface" placeholder="点击右侧下拉框选择接口" readonly>
                                            <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" :disabled="wanInterfaceList.length === 0">选择</button>
                                            <ul class="dropdown-menu dropdown-menu-end" style="z-index: 1080;">
                                                <li v-for="iface in wanInterfaceList" :key="iface.name">
                                                    <a class="dropdown-item d-flex justify-content-between align-items-center" :class="{ 'active': isWanInterfaceSelected(iface.name) }" href="#" @click.prevent="toggleWanInterface(iface.name)">
                                                        <span>{{ iface.name }} ({{ iface.ip || '拨号获取' }})</span>
                                                        <i v-if="isWanInterfaceSelected(iface.name)" class="bi bi-check-circle-fill text-primary ms-2"></i>
                                                    </a>
                                                </li>
                                                <li v-if="wanInterfaceList.length === 0"><span class="dropdown-item text-muted">暂无可用接口，请先刷新</span></li>
                                                <li><hr class="dropdown-divider"></li>
                                                <li><a class="dropdown-item text-danger" href="#" @click.prevent="networkConfig.wan_interface = ''">清空</a></li>
                                            </ul>
                                        </div>
                                        <small class="text-muted">多个接口用英文逗号分隔，将作为一条规则绑定多接口</small>
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
                        <div class="card mt-3" style="position: relative; z-index: 1;">
                            <div class="card-header"><h5 class="mb-0">CNAME 域名设置</h5></div>
                            <div class="card-body">
                                <p class="text-muted small mb-3">配置统一公网域名，所有虚拟机/容器通过此域名访问。每行一个线路，填写线路名称和域名，域名前会自动加上 VMID。</p>
                                <div v-for="(entry, idx) in cnameEntries" :key="idx" class="row g-2 mb-2 align-items-center">
                                    <div class="col-md-3">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.label" placeholder="节点名称（如 电信）">
                                    </div>
                                    <div class="col-md-7">
                                        <input type="text" class="form-control form-control-sm" v-model="entry.domain" placeholder="域名（如 .example.com）">
                                    </div>
                                    <div class="col-md-2">
                                        <pv-button @click="removeCnameEntry(idx)" variant="outline-danger" size="sm">删除</pv-button>
                                    </div>
                                </div>
                                <div class="d-flex gap-2 mt-2">
                                    <pv-button @click="addCnameEntry" variant="outline" size="sm">+ 新增节点</pv-button>
                                    <pv-button @click="saveNetworkConfig" variant="primary" size="sm">💾 保存 CNAME</pv-button>
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

                    <!-- 站点设置 -->
                    <div v-if="activeSection === 'settings' && activeTab === 'site'">
                        <h4 class="module-title">站点设置</h4>
                        <div class="card">
                            <div class="card-body">
                                <div class="mb-3">
                                    <label class="form-label">站点名称</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.name" placeholder="站点名称（用于页面标题、邮件等）">
                                    <small class="text-muted">显示在浏览器标签页标题、邮件模板等位置</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">LOGO 文字</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.logo_text" placeholder="侧边栏 LOGO 文字">
                                    <small class="text-muted">显示在管理后台和用户面板左上角</small>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label">登录页 LOGO 文字</label>
                                    <input type="text" class="form-control" v-model="siteConfigForm.login_title" placeholder="登录页 LOGO 文字">
                                    <small class="text-muted">显示在登录页卡片上的 LOGO 文字</small>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="registerEnabled" v-model="siteConfigForm.register_enabled">
                                        <label class="form-check-label" for="registerEnabled">允许用户注册</label>
                                    </div>
                                    <small class="text-muted">开启后登录页将显示注册入口</small>
                                </div>
                                <pv-button type="button" variant="glass" @click="saveSiteConfig" :disabled="siteConfigSaving">
                                    {{ siteConfigSaving ? '保存中...' : '保存设置' }}
                                </pv-button>
                            </div>
                        </div>

                        <!-- 危险操作：清除缓存 -->
                        <div class="card mt-3" style="border-color: rgba(239, 68, 68, 0.3);">
                            <div class="card-header" style="background: rgba(239, 68, 68, 0.05);">
                                <h5 class="mb-0 text-danger">危险操作</h5>
                            </div>
                            <div class="card-body">
                                <div class="d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <div>
                                        <strong>一键清除所有缓存</strong>
                                        <p class="text-muted small mb-0">将清除 Redis 和内存中的全部缓存数据，包括：用户列表、套餐列表、设备状态、用户活跃状态、JWT 黑名单、未读消息、用户资料、站点配置、验证码、找回密码 Token、限速计数器等。<br>清除后所有用户需重新登录，进行中的操作可能受影响。</p>
                                    </div>
                                    <pv-button type="button" variant="danger" @click="clearAllCache" :disabled="cacheClearing">
                                        {{ cacheClearing ? '清除中...' : '清除所有缓存' }}
                                    </pv-button>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <!-- end 系统设置区域 -->

                <!-- 财务管理 - 交易流水 -->
                

`);
})();
