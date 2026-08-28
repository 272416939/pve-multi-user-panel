(function() {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;
    var computed = Vue.computed;

    // ==================== 状态 ====================
    $.networkConfig = reactive({
        port_range_start: 50000,
        port_range_end: 60000,
        default_protocol: 'tcp',
        wan_interface: '',
        max_per_user: 10,
        cname_domain: '',
        vlan_ip_segment_start: '172.16.0.1',
        vlan_id_start: 1000,
        vlan_interface: 'lan1',
        vlan_max_per_user: 5
    });
    $.cnameEntries = ref([]);
    $.ifaceList = ref([]);
    $.ifaceUpdateTime = ref('');
    $.forwardRules = ref([]);
    $.forwardRulesLoading = ref(false);
    $.showForwardModal = ref(false);
    $.forwardForm = reactive({
        id: null, type: 'vm', vm_id: null, ct_id: null,
        name: '', ip: '', internal_port: null, external_port: null,
        protocol: 'tcp', pve_node_id: ''
    });
    $.isEditingForward = ref(false);
    $.selectedForwardIds = ref([]);
    $.availableDevices = ref([]);
    $.userForwardCount = ref(0);
    $.maxForwardPerUser = ref(10);
    $.checkResult = ref(null);
    $.forwardFilterType = ref('all');
    $.forwardSearchText = ref('');
    // 多节点：可选 PVE 节点（表单选节点 + 列表按节点筛选，''=全部）
    $.forwardNodeOptions = ref([]);
    $.forwardFilterNodeId = ref('');

    // 设备端口转发弹窗
    $.deviceModal = reactive({ device: { deviceId: null, type: 'vm', name: '', ip: '', pve_node_id: null } });
    $.deviceRules = ref([]);
    $.showDeviceForm = ref(false);
    $.forwardConfig = ref({ max_per_user: 10, port_range_start: 50000, port_range_end: 60000, used: 0, remaining: 10 });
    $.editingDeviceRuleId = ref(null);
    $.deviceForm = reactive({ name: '', ip: '', protocol: 'tcp', internal_port: null, external_port: null });
    $.deviceCheckResult = ref(null);

    // 分页
    $.forwardPage = ref(1);
    $.forwardVmPage = ref(1);
    $.forwardLxcPage = ref(1);
    $.forwardPageSize = 20;

    // 私有网络管理（管理员视角，只读列表）
    $.privateSubnets = ref([]);
    $.privateSubnetsLoading = ref(false);
    $.privateSubnetSearch = ref('');
    $.privateSubnetPage = ref(1);
    $.privateSubnetPageSize = 20;
    // 多节点：按所属 PVE 节点筛选（''=全部）
    $.privateSubnetNodeId = ref('');

    // ==================== computed ====================
    $.paginatedForwardRules = computed(function() {
        var start = ($.forwardPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    $.paginatedPrivateSubnets = computed(function() {
        var start = ($.privateSubnetPage.value - 1) * $.privateSubnetPageSize;
        return $.privateSubnets.value.slice(start, start + $.privateSubnetPageSize);
    });

    $.vmForwardTotal = computed(function() {
        return $.forwardRules.value.length;
    });

    $.lxcForwardTotal = computed(function() {
        return $.forwardRules.value.length;
    });

    $.paginatedVmForwardRules = computed(function() {
        var start = ($.forwardVmPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    $.paginatedLxcForwardRules = computed(function() {
        var start = ($.forwardLxcPage.value - 1) * $.forwardPageSize;
        return $.forwardRules.value.slice(start, start + $.forwardPageSize);
    });

    // 仅显示 LAN 类型接口供 DHCP 选择（若没有 LAN 类型，降级显示全部非 VLAN 接口兜底）
    // VLAN 子接口（面板自建 vlan_VPC*）不是物理口，任何父接口/转发源下拉都要排除
    $.lanInterfaceList = computed(function() {
        var lan = $.ifaceList.value.filter(function(i) { return i.type === 'lan'; });
        return lan.length > 0 ? lan : $.ifaceList.value.filter(function(i) { return i.type !== 'vlan'; });
    });

    // 仅显示 WAN 类型接口供端口转发选择
    $.wanInterfaceList = computed(function() {
        var wan = $.ifaceList.value.filter(function(i) { return i.type === 'wan'; });
        return wan.length > 0 ? wan : $.ifaceList.value.filter(function(i) { return i.type !== 'vlan'; });
    });

    // ==================== 函数 ====================
    $.loadNetworkConfig = async function() {
        try {
            var res = await api('/admin/ikuai/config');
            // 只取节点网络设置字段（连接配置字段由 loadIkuaiConfig 负责，避免污染整对象提交）
            var net = {
                port_range_start: res.port_range_start,
                port_range_end: res.port_range_end,
                default_protocol: res.default_protocol,
                wan_interface: res.wan_interface,
                max_per_user: res.max_per_user,
                dhcp_ip_range_start: res.dhcp_ip_range_start,
                dhcp_ip_range_end: res.dhcp_ip_range_end,
                dhcp_interface: res.dhcp_interface,
                dhcp_gateway: res.dhcp_gateway,
                dhcp_dns1: res.dhcp_dns1,
                dhcp_dns2: res.dhcp_dns2,
                vlan_ip_segment_start: res.vlan_ip_segment_start,
                vlan_id_start: res.vlan_id_start,
                vlan_interface: res.vlan_interface,
                vlan_max_per_user: res.vlan_max_per_user,
                cname_domain: res.cname_domain
            };
            Object.assign($.networkConfig, net);
            // 确保 wan_interface 是字符串（后端已返回逗号分隔字符串，兼容旧数组格式）
            if (Array.isArray(res.wan_interface)) {
                $.networkConfig.wan_interface = res.wan_interface.filter(Boolean).join(',');
            } else if (res.wan_interface == null) {
                $.networkConfig.wan_interface = '';
            }
            $.maxForwardPerUser.value = res.max_per_user || 10;
            // 从数据库加载缓存的接口列表（无需立即请求 ikuai）
            if (res.iface_list && res.iface_list.length > 0) {
                $.ifaceList.value = res.iface_list;
                $.ifaceUpdateTime.value = window.__i18n.t('admin.net.cached');
            }
            // 解析 cname_domain 为 cnameEntries 数组
            $.parseCnameEntries();
        } catch (e) { console.error('加载网络配置失败:', e); }
    };

    // 将 cname_domain 逗号分隔字符串解析为 {label, domain} 数组
    // 存储格式: label||.domain 或 中文前缀.domain（旧格式兼容）
    $.parseCnameEntries = function() {
        var raw = $.networkConfig.cname_domain || '';
        var items = raw.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
        $.cnameEntries.value = items.map(function(item) {
            // 新格式: label||.domain
            var sep = item.indexOf('||');
            if (sep > -1) {
                // label/domain 双侧 trim：防止输入空格入库导致列表页标签错位
                return { label: item.substring(0, sep).trim(), domain: item.substring(sep + 2).trim() };
            }
            // 旧格式兼容: 中文前缀 + .域名（如 自动.auto.mcsr.cc）
            var match = item.match(/^([\u4e00-\u9fa5]+)(\..+)$/);
            if (match) return { label: match[1], domain: match[2] };
            // 以 . 开头，无标签
            if (item.startsWith('.')) return { label: '', domain: item };
            // 兜底：整个作为域名
            return { label: '', domain: item };
        });
        if ($.cnameEntries.value.length === 0) $.cnameEntries.value.push({ label: '', domain: '' });
    };

    $.addCnameEntry = function() {
        $.cnameEntries.value.push({ label: '', domain: '' });
    };

    $.removeCnameEntry = function(idx) {
        $.cnameEntries.value.splice(idx, 1);
        if ($.cnameEntries.value.length === 0) $.cnameEntries.value.push({ label: '', domain: '' });
    };

    // 节点级网络配置（外网接口/端口段/DHCP/VLAN）已迁至「爱快节点」表单，按爱快节点作用域读写
    // （admin-ikuai-nodes.js）。原 saveNetworkConfig / syncDhcpBindings / refreshIfaceList 走的是
    // 不带 node_id 的全局端点，多节点下只会命中默认节点，语义已失效且模板早无引用，故移除。
    // loadNetworkConfig 保留：VM/LXC 列表的 CNAME 列仍用它做站点级兜底展示。

    // 多节点：可选 PVE 节点下拉（统一数据源 /admin/pve/nodes，只留启用节点）
    $.loadForwardNodeOptions = async function() {
        try {
            var res = await api('/admin/pve/nodes');
            var nodes = (res && res.nodes) || [];
            $.forwardNodeOptions.value = nodes.filter(function(n) { return n.enabled !== 0; });
        } catch (e) {
            console.error('加载节点列表失败:', e);
            $.forwardNodeOptions.value = [];
        }
    };

    // 端口转发规则当前生效的节点（表单选中优先；筛选下拉次之），用于按节点作用域取端口段/占用
    $.currentForwardNodeId = function() {
        return $.forwardForm.pve_node_id || $.forwardFilterNodeId.value || '';
    };

    // 端口转发
    $.loadForwardRules = async function(type) {
        $.forwardRulesLoading.value = true;
        try {
            var search = ($.forwardSearchText.value || '').trim();
            var url = '/port-forwards';
            var qs = [];
            if (type && type !== 'all') qs.push('type=' + type);
            if (search) qs.push('search=' + encodeURIComponent(search));
            if ($.forwardFilterNodeId.value) qs.push('node_id=' + encodeURIComponent($.forwardFilterNodeId.value));
            if (qs.length > 0) url += '?' + qs.join('&');
            var rules = await api(url);
            $.forwardRules.value = rules || [];
            // 获取当前用户数量
            var userRules = await api('/port-forwards');
            $.userForwardCount.value = (userRules || []).length;
            // 页码修正
            var total = $.forwardRules.value.length;
            var totalPages = Math.ceil(total / $.forwardPageSize);
            if ($.forwardPage.value > totalPages) $.forwardPage.value = Math.max(1, totalPages);
        } catch (e) { console.error('加载转发规则失败:', e); }
        finally { $.forwardRulesLoading.value = false; }
    };

    // 节点筛选变更：重置页码后重载（与类型/搜索筛选同源）
    $.onForwardNodeFilterChange = function() {
        $.forwardPage.value = 1;
        $.loadForwardRules($.forwardFilterType.value);
    };

    // 私有网络列表（管理员视角）
    $.loadPrivateSubnets = async function() {
        $.privateSubnetsLoading.value = true;
        try {
            var search = ($.privateSubnetSearch.value || '').trim();
            var url = '/admin/subnets';
            var qs = [];
            if (search) qs.push('search=' + encodeURIComponent(search));
            if ($.privateSubnetNodeId.value) qs.push('node_id=' + encodeURIComponent($.privateSubnetNodeId.value));
            if (qs.length > 0) url += '?' + qs.join('&');
            var list = await api(url);
            $.privateSubnets.value = list || [];
            // 页码修正
            var totalPages = Math.ceil($.privateSubnets.value.length / $.privateSubnetPageSize);
            if ($.privateSubnetPage.value > totalPages) $.privateSubnetPage.value = Math.max(1, totalPages);
        } catch (e) { console.error('加载私有网络列表失败:', e); }
        finally { $.privateSubnetsLoading.value = false; }
    };

    $.onPrivateSubnetSearch = function() {
        $.privateSubnetPage.value = 1;
        $.loadPrivateSubnets();
    };

    $.onPrivateSubnetNodeChange = function() {
        $.privateSubnetPage.value = 1;
        $.loadPrivateSubnets();
    };

    // 设备列表按指定节点过滤（nodeId 省略时用筛选下拉值；均为空=全部，管理员可跨节点总览）
    $.loadForwardDevices = async function(type, nodeId) {
        if (type === 'general') {
            $.availableDevices.value = [];
            return;
        }
        try {
            var nid = nodeId !== undefined && nodeId !== null && nodeId !== '' ? nodeId : $.forwardFilterNodeId.value;
            var url = '/port-forwards/extract-ips';
            if (nid) url += '?node_id=' + encodeURIComponent(nid);
            var devices = await api(url);
            $.availableDevices.value = (devices || []).filter(function(d) { return d.type === type; });
        } catch (e) { console.error('加载设备列表失败:', e); }
    };

    $.onForwardTypeChange = function() {
        var type = $.forwardForm.type;
        $.forwardForm.vm_id = null;
        $.forwardForm.ct_id = null;
        $.forwardForm.ip = '';
        $.checkResult.value = null;
        // 节点归属：general 由管理员显式选（沿用筛选值作默认）；设备类型由所选设备带出，先清空
        $.forwardForm.pve_node_id = type === 'general' ? ($.forwardFilterNodeId.value || '') : '';
        $.loadForwardDevices(type);
    };

    $.openAddForward = async function(type) {
        $.isEditingForward.value = false;
        $.forwardForm.id = null;
        $.forwardForm.type = type || 'vm';
        $.forwardForm.vm_id = null;
        $.forwardForm.ct_id = null;
        $.forwardForm.name = '';
        $.forwardForm.ip = '';
        $.forwardForm.internal_port = null;
        $.forwardForm.external_port = null;
        $.forwardForm.protocol = 'tcp';
        $.forwardForm.pve_node_id = $.forwardForm.type === 'general' ? ($.forwardFilterNodeId.value || '') : '';
        $.checkResult.value = null;
        $.selectedForwardIds.value = [];
        if ($.forwardNodeOptions.value.length === 0) await $.loadForwardNodeOptions();
        await $.loadForwardDevices($.forwardForm.type);
        $.showForwardModal.value = true;
        $.bsModalShow('forwardModal');
    };

    $.selectDevice = function() {
        var device = $.availableDevices.value.find(function(d) {
            if ($.forwardForm.type === 'vm') return d.device_id === $.forwardForm.vm_id;
            return d.device_id === $.forwardForm.ct_id;
        });
        if (device) {
            $.forwardForm.ip = device.ip;
            $.forwardForm.name = device.name;
            // 设备类型的节点唯一真源是设备台账（表单只读展示，后端同样强制取设备行节点）
            $.forwardForm.pve_node_id = device.pve_node_id != null ? String(device.pve_node_id) : '';
        }
    };

    $.randomPort = async function() {
        try {
            var url = '/port-forwards/random-port';
            var nid = $.currentForwardNodeId();
            if (nid) url += '?node_id=' + encodeURIComponent(nid);
            var res = await api(url);
            $.forwardForm.external_port = res.port;
            $.checkResult.value = null;
        } catch (e) { alert(e.message); }
    };

    $.checkPortConflict = async function() {
        if (!$.forwardForm.external_port) return;
        try {
            var url = '/port-forwards/check-port?port=' + $.forwardForm.external_port;
            var nid = $.currentForwardNodeId();
            if (nid) url += '&node_id=' + encodeURIComponent(nid);
            var res = await api(url);
            $.checkResult.value = res.available;
        } catch (e) { $.checkResult.value = null; }
    };

    $.submitForward = async function() {
        // 校验
        if ($.forwardForm.type === 'vm' && !$.forwardForm.vm_id) return alert(window.__i18n.t('admin.pickVm'));
        if ($.forwardForm.type === 'lxc' && !$.forwardForm.ct_id) return alert(window.__i18n.t('admin.port.pickCt'));
        if ($.forwardForm.type === 'general' && !$.forwardForm.pve_node_id) return alert(window.__i18n.t('err.FORWARD_NODE_REQUIRED'));
        if (!$.forwardForm.ip) return alert(window.__i18n.t('dash.port.targetIpRequired'));
        if (!$.forwardForm.internal_port) return alert(window.__i18n.t('dash.port.internalRequired'));
        if (!$.forwardForm.external_port) return alert(window.__i18n.t('dash.port.externalRequired'));
        // 管理员不受系统配置的端口范围限制
        if ($.userRole.value !== 'admin') {
            if ($.forwardForm.external_port < $.networkConfig.port_range_start || $.forwardForm.external_port > $.networkConfig.port_range_end) {
                return alert(window.__i18n.t('admin.port.rangePrefix') + $.networkConfig.port_range_start + '-' + $.networkConfig.port_range_end + window.__i18n.t('admin.port.rangeSuffix'));
            }
        }
        try {
            var body = {
                type: $.forwardForm.type,
                vm_id: $.forwardForm.type === 'vm' ? $.forwardForm.vm_id : null,
                ct_id: $.forwardForm.type === 'lxc' ? $.forwardForm.ct_id : null,
                name: $.forwardForm.name,
                ip: $.forwardForm.ip,
                internal_port: $.forwardForm.internal_port,
                external_port: $.forwardForm.external_port,
                protocol: $.forwardForm.protocol,
                // 多节点：general 由此字段定节点；设备类型后端强制取设备行节点，此值仅作跨节点同 vmid 消歧
                pve_node_id: $.forwardForm.pve_node_id || null
            };
            if ($.isEditingForward.value && $.forwardForm.id) {
                await api('/port-forwards/' + $.forwardForm.id, { method: 'PUT', body: body });
            } else {
                await api('/port-forwards', { method: 'POST', body: body });
            }
            $.showForwardModal.value = false;
            $.bsModalHide('forwardModal');
            $.loadForwardRules($.forwardFilterType.value);
        } catch (e) { alert(e.error || e.message); }
    };

    $.deleteForward = async function(id) {
        if (!await window.customConfirm(window.__i18n.t('dash.port.deleteOneConfirm'))) return;
        try {
            await api('/port-forwards/' + id, { method: 'DELETE' });
            $.loadForwardRules($.forwardFilterType.value);
        } catch (e) { alert(window.__i18n.t('common.deleteFailedMsg') + e.message); }
    };

    $.batchDeleteForwards = async function() {
        if ($.selectedForwardIds.value.length === 0) return alert(window.__i18n.t('dash.port.pickDelete'));
        if (!await window.customConfirm(window.__i18n.t('admin.fwd.batchDelPfx') + $.selectedForwardIds.value.length + window.__i18n.t('dash.port.batchSuffix'))) return;
        try {
            await api('/port-forwards/batch-delete', { method: 'POST', body: { ids: $.selectedForwardIds.value } });
            $.selectedForwardIds.value = [];
            $.loadForwardRules($.forwardFilterType.value);
        } catch (e) { alert(window.__i18n.t('dash.port.batchDelFail') + e.message); }
    };

    $.toggleSelectAllForwards = function(event) {
        if (event.target.checked) {
            $.selectedForwardIds.value = $.forwardRules.value.map(function(r) { return r.id; });
        } else {
            $.selectedForwardIds.value = [];
        }
    };

    // 设备端口转发
    $.openDeviceForward = async function(device, type) {
        $.showDeviceForm.value = false; // 重置为列表页，避免上次关闭时停留在表单页
        $.editingDeviceRuleId.value = null;
        // 多节点：记录设备所属节点，规则过滤与端口段/占用查询都按此节点作用域
        var devNodeId = device.pve_node_id != null ? device.pve_node_id : null;
        $.deviceModal.device = {
            deviceId: type === 'vm' ? device.vm_id : device.ct_id,
            type: type,
            name: device.name || '',
            ip: device.ip || '',
            pve_node_id: devNodeId
        };
        $.deviceRules.value = [];
        try {
            var nodeQs = devNodeId != null ? '?node_id=' + encodeURIComponent(devNodeId) : '';
            var results = await Promise.all([
                api('/port-forwards' + nodeQs),
                api('/port-forwards/extract-ips' + nodeQs),
                api('/port-forwards/config' + nodeQs)
            ]);
            var rules = results[0];
            var ips = results[1];
            var cfg = results[2];
            // 跨节点同 vmid：设备节点已知时必须同时比对节点，否则会混入他节点同号设备的规则
            $.deviceRules.value = (rules || []).filter(function(r) {
                var idMatch = (type === 'vm' && r.vm_id === device.vm_id) ||
                       (type === 'lxc' && r.ct_id === device.ct_id);
                if (!idMatch) return false;
                if (devNodeId == null || r.pve_node_id == null) return true;
                return Number(r.pve_node_id) === Number(devNodeId);
            });
            // 获取设备 IP
            var deviceIp = (ips || []).find(function(d) { return d.type === type && d.device_id === (type === 'vm' ? device.vm_id : device.ct_id); });
            if (deviceIp && deviceIp.ip) {
                $.deviceModal.device.ip = deviceIp.ip;
            }
            $.forwardConfig.value = cfg || { max_per_user: 10, used: 0, remaining: 10 };
        } catch (e) { console.error(e); }
        $.bsModalShow('deviceForwardModal');
    };

    $.openDeviceFormModal = function() {
        $.editingDeviceRuleId.value = null;
        $.deviceForm.name = '';
        $.deviceForm.ip = $.deviceModal.device.ip || '';
        $.deviceForm.protocol = 'tcp';
        $.deviceForm.internal_port = null;
        $.deviceForm.external_port = null;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = true;
    };

    $.openDeviceEditModal = function(rule) {
        $.editingDeviceRuleId.value = rule.id;
        $.deviceForm.name = rule.name || '';
        $.deviceForm.ip = rule.ip || '';
        $.deviceForm.protocol = rule.protocol || 'tcp';
        $.deviceForm.internal_port = rule.internal_port;
        $.deviceForm.external_port = rule.external_port;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = true;
    };

    $.cancelDeviceForm = function() {
        $.editingDeviceRuleId.value = null;
        $.deviceCheckResult.value = null;
        $.showDeviceForm.value = false;
    };

    $.submitDeviceRule = async function() {
        var ip = $.deviceForm.ip || $.deviceModal.device.ip;
        if (!ip) return alert(window.__i18n.t('admin.port.noIp'));
        if (!$.deviceForm.internal_port) return alert(window.__i18n.t('dash.port.internalRequired'));
        if (!$.deviceForm.external_port) return alert(window.__i18n.t('dash.port.externalRequired'));
        try {
            var body = {
                type: $.deviceModal.device.type,
                vm_id: $.deviceModal.device.type === 'vm' ? $.deviceModal.device.deviceId : null,
                ct_id: $.deviceModal.device.type === 'lxc' ? $.deviceModal.device.deviceId : null,
                name: $.deviceForm.name,
                ip: ip,
                internal_port: $.deviceForm.internal_port,
                external_port: $.deviceForm.external_port,
                protocol: $.deviceForm.protocol,
                // 跨节点同 vmid 消歧（后端仍以设备台账行的节点为准）
                pve_node_id: $.deviceModal.device.pve_node_id != null ? $.deviceModal.device.pve_node_id : null
            };
            if ($.editingDeviceRuleId.value) {
                await api('/port-forwards/' + $.editingDeviceRuleId.value, { method: 'PUT', body: body });
            } else {
                await api('/port-forwards', { method: 'POST', body: body });
            }
            $.editingDeviceRuleId.value = null;
            var devNodeQs = $.deviceModal.device.pve_node_id != null ? '?node_id=' + encodeURIComponent($.deviceModal.device.pve_node_id) : '';
            var rules = await api('/port-forwards' + devNodeQs);
            $.deviceRules.value = (rules || []).filter(function(r) {
                var idMatch = ($.deviceModal.device.type === 'vm' && r.vm_id === $.deviceModal.device.deviceId) ||
                       ($.deviceModal.device.type === 'lxc' && r.ct_id === $.deviceModal.device.deviceId);
                if (!idMatch) return false;
                if ($.deviceModal.device.pve_node_id == null || r.pve_node_id == null) return true;
                return Number(r.pve_node_id) === Number($.deviceModal.device.pve_node_id);
            });
            var cfg = await api('/port-forwards/config' + devNodeQs);
            $.forwardConfig.value = cfg || $.forwardConfig.value;
            $.showDeviceForm.value = false;
        } catch (e) { alert(e.error || e.message); }
    };

    $.deleteDeviceRule = async function(rule) {
        var dmEl = document.getElementById('deviceForwardModal');
        if (dmEl) {
            var dmInst = bootstrap.Modal.getInstance(dmEl);
            if (dmInst) {
                await new Promise(function(resolve) {
                    dmEl.addEventListener('hidden.bs.modal', resolve, { once: true });
                    dmInst.hide();
                });
            }
        }
        var ok = await window.customConfirm(window.__i18n.t('dash.port.deleteConfirm1') + (rule.name || rule.external_port) + window.__i18n.t('dash.port.delTailQ'));
        if (!ok) { $.bsModalShow('deviceForwardModal'); return; }
        try {
            await api('/port-forwards/' + rule.id, { method: 'DELETE' });
            $.deviceRules.value = $.deviceRules.value.filter(function(r) { return r.id !== rule.id; });
            var delNodeQs = $.deviceModal.device.pve_node_id != null ? '?node_id=' + encodeURIComponent($.deviceModal.device.pve_node_id) : '';
            var cfg = await api('/port-forwards/config' + delNodeQs);
            $.forwardConfig.value = cfg || $.forwardConfig.value;
        } catch (e) {
            alert(window.__i18n.t('common.deleteFailedMsg') + e.message);
            $.bsModalShow('deviceForwardModal');
            return;
        }
        $.bsModalShow('deviceForwardModal');
    };

    $.randomDevicePort = async function() {
        try {
            var url = '/port-forwards/random-port';
            if ($.deviceModal.device.pve_node_id != null) url += '?node_id=' + encodeURIComponent($.deviceModal.device.pve_node_id);
            var res = await api(url);
            $.deviceForm.external_port = res.port;
            $.deviceCheckResult.value = null;
        } catch (e) { alert(e.message); }
    };

    // ==================== initNetwork ====================
    $.initNetwork = function() {
        // 无特殊生命周期逻辑
    };
})();
