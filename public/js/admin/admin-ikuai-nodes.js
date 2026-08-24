// 管理端 爱快节点 页面逻辑（区域管理 → 爱快节点）
// 模板引用全部经 $.ikuaiNodesPage 暴露（window.__admin 在 setup return 中整体展开，见 admin-page.js）
window.__admin = window.__admin || {};
window.__admin.ikuaiNodesPage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;
    var computed = Vue.computed;

    var nodes = ref([]);          // 节点列表
    var loading = ref(false);
    var versionModal = ref(false); // 版本选择弹窗
    var formModal = ref(false);    // 全量表单弹窗
    var formVersion = ref('v3');   // 版本选择卡片
    var editing = ref(false);      // 编辑态
    var editingId = ref(null);
    var interfaces = ref([]);      // 外网接口列表
    var testing = ref(false);
    var saving = ref(false);
    var pollTimer = null;

    var form = reactive({
        id: null, name: '', host: '', username: '', password: '', api_key: '',
        version: 'v3', strict_tls: false, enabled: true, sort_order: 0
    });
    var networkForm = reactive({
        port_range_start: '', port_range_end: '', default_protocol: 'tcp', wan_interface: [], max_per_user: '',
        dhcp_dns1: '', dhcp_dns2: '',
        vlan_ip_segment_start: '', vlan_id_start: '', vlan_interface: '', vlan_max_per_user: '',
        cname_domain: ''
    });

    var wanIfaceText = computed(function () {
        return (networkForm.wan_interface || []).join(', ');
    });

    // ==================== 加载 ====================
    // 统一入口：core.js watch/onMounted 同源调用
    async function load() {
        await loadNodes();
        startPoll();
    }

    async function loadNodes() {
        try {
            var data = await api('/admin/ikuai/nodes');
            nodes.value = (data && data.nodes) || [];
        } catch (e) {
            console.error('加载爱快节点列表失败', e && e.message);
            nodes.value = [];
        }
    }

    // 30s 轮询刷新连接状态（进入 section 后启动；切换 section / 组件销毁时 stopPoll 清理）
    function startPoll() {
        stopPoll();
        pollTimer = setInterval(function () { loadNodes(); }, 30000);
    }

    function stopPoll() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    // ==================== 弹窗 ====================
    function openVersionModal() {
        formVersion.value = 'v3';
        $.bsModalShow('ikuaiVersionModal');
    }

    function confirmVersion() {
        $.bsModalHide('ikuaiVersionModal');
        editing.value = false;
        editingId.value = null;
        openForm(null);
    }

    function editNode(node) {
        editing.value = true;
        editingId.value = node.id;
        openForm(node);
    }

    function resetNetwork() {
        networkForm.port_range_start = '';
        networkForm.port_range_end = '';
        networkForm.default_protocol = 'tcp';
        networkForm.wan_interface = [];
        networkForm.max_per_user = '';
        networkForm.dhcp_dns1 = '';
        networkForm.dhcp_dns2 = '';
        networkForm.vlan_ip_segment_start = '';
        networkForm.vlan_id_start = '';
        networkForm.vlan_interface = '';
        networkForm.vlan_max_per_user = '';
        networkForm.cname_domain = '';
    }

    function parseWanIface(val) {
        if (!val) return [];
        if (Array.isArray(val)) return val.filter(Boolean);
        if (typeof val === 'string') {
            try {
                var arr = JSON.parse(val);
                if (Array.isArray(arr)) return arr.filter(Boolean);
            } catch (_) {}
            return val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        }
        return [];
    }

    async function openForm(node) {
        form.id = node && node.id ? node.id : null;
        form.name = node ? node.name : '';
        form.host = node ? node.host : '';
        form.version = node ? node.version : formVersion.value;
        form.username = node ? (node.username || '') : '';
        form.password = node ? (node.password || '') : '';
        form.api_key = node ? (node.api_key || '') : '';
        form.strict_tls = node ? !!node.strict_tls : false;
        form.enabled = node ? (node.enabled !== false) : true;
        form.sort_order = node ? (node.sort_order || 0) : 0;
        resetNetwork();
        interfaces.value = [];
        // 编辑态：拉取详情预填（凭据掩码回显 + 网络配置）
        if (node && node.id) {
            try {
                var d = await api('/admin/ikuai/nodes/' + node.id);
                var nd = d.node || {};
                form.name = nd.name || '';
                form.host = nd.host || '';
                form.version = nd.version || (formVersion.value || 'v3');
                form.username = nd.username || '';
                form.password = nd.password || '';   // maskSecret 占位，保存时后端精确匹配回退
                form.api_key = nd.api_key || '';
                form.strict_tls = !!nd.strict_tls;
                form.enabled = nd.enabled !== false;
                form.sort_order = nd.sort_order || 0;
                var net = d.network || {};
                networkForm.port_range_start = net.port_range_start != null ? parseInt(net.port_range_start) : '';
                networkForm.port_range_end = net.port_range_end != null ? parseInt(net.port_range_end) : '';
                networkForm.default_protocol = net.default_protocol || 'tcp';
                networkForm.wan_interface = parseWanIface(net.wan_interface);
                networkForm.max_per_user = net.max_per_user != null ? parseInt(net.max_per_user) : '';
                networkForm.dhcp_dns1 = net.dhcp_dns1 || '';
                networkForm.dhcp_dns2 = net.dhcp_dns2 || '';
                networkForm.vlan_ip_segment_start = net.vlan_ip_segment_start || '';
                networkForm.vlan_id_start = net.vlan_id_start != null ? parseInt(net.vlan_id_start) : '';
                networkForm.vlan_interface = net.vlan_interface || '';
                networkForm.vlan_max_per_user = net.vlan_max_per_user != null ? parseInt(net.vlan_max_per_user) : '';
                networkForm.cname_domain = net.cname_domain || '';
            } catch (e) {
                console.error('加载爱快节点详情失败', e && e.message);
            }
        }
        $.bsModalShow('ikuaiFormModal');
        refreshInterfaces();
    }

    // 外网接口列表：编辑态按节点拉取，新增态无 node_id（服务端回退旧全局配置，失败静默）
    async function refreshInterfaces() {
        try {
            var q = editingId.value ? ('?node_id=' + editingId.value) : '';
            var data = await api('/admin/ikuai/nodes/interfaces' + q);
            interfaces.value = (data && data.interfaces) || [];
        } catch (e) {
            console.error('获取外网接口列表失败', e && e.message);
            interfaces.value = [];
        }
    }

    function toggleWanIface(name) {
        var arr = networkForm.wan_interface || [];
        var idx = arr.indexOf(name);
        if (idx > -1) arr.splice(idx, 1);
        else arr.push(name);
        networkForm.wan_interface = arr.slice();
    }

    function isWanIfaceSelected(name) {
        return (networkForm.wan_interface || []).indexOf(name) > -1;
    }

    // ==================== 测试连接 ====================
    function buildTestPayload() {
        var p = { host: form.host, version: form.version, strict_tls: !!form.strict_tls };
        if (editingId.value != null) p.node_id = editingId.value;
        if (form.version !== 'v4') p.username = form.username;
        p.password = form.password;
        p.api_key = form.api_key;
        return p;
    }

    // 测试连接按钮（silentOk 为真时成功不弹窗——保存前自动测试场景）
    async function testConnection(silentOk) {
        if (testing.value) return false;
        testing.value = true;
        try {
            var res = await api('/admin/ikuai/nodes/test', { method: 'POST', body: buildTestPayload() });
            if (!silentOk) alert(res && res.message ? res.message : window.__i18n.t('nodes.testOk'));
            return true;
        } catch (e) {
            console.error('测试连接失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('nodes.testFail'));
            return false;
        } finally {
            testing.value = false;
        }
    }

    // 行级手动测试（已保存凭据）
    async function rowTest(node) {
        try {
            var res = await api('/admin/ikuai/nodes/' + node.id + '/test', { method: 'POST' });
            alert(res && res.message ? res.message : window.__i18n.t('nodes.testOk'));
            await loadNodes();
        } catch (e) {
            console.error('测试节点失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('nodes.testFail'));
            await loadNodes();
        }
    }

    // ==== 保存：先自动测试通过才提交（测试失败弹原因并阻断）====
    async function saveNode() {
        if (saving.value) return;
        if (!(form.name || '').trim()) { alert(window.__i18n.t('nodes.nodeNameRequired')); return; }
        if (!(form.host || '').trim()) { alert(window.__i18n.t('nodes.hostRequired')); return; }
        if (form.version !== 'v4') {
            if (!(form.username || '').trim()) { alert(window.__i18n.t('nodes.usernameRequired')); return; }
            if (!(form.password || '').trim() && !editing.value) { alert(window.__i18n.t('nodes.passwordRequired')); return; }
        } else if (!(form.api_key || '').trim() && !editing.value) {
            alert(window.__i18n.t('nodes.apiTokenRequired'));
            return;
        }
        var tested = await testConnection(true);
        if (!tested) return;
        saving.value = true;
        try {
            var payload = {
                name: (form.name || '').trim(),
                version: form.version,
                host: (form.host || '').trim(),
                username: form.username,
                password: form.password,
                api_key: form.api_key,
                strict_tls: !!form.strict_tls,
                enabled: form.enabled !== false,
                sort_order: form.sort_order || 0,
                network: buildNetwork()
            };
            if (editing.value) {
                await api('/admin/ikuai/nodes/' + editingId.value, { method: 'PUT', body: payload });
            } else {
                await api('/admin/ikuai/nodes', { method: 'POST', body: payload });
            }
            $.bsModalHide('ikuaiFormModal');
            alert(window.__i18n.t('nodes.saveOk'));
            await loadNodes();
        } catch (e) {
            console.error('保存爱快节点失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        } finally {
            saving.value = false;
        }
    }

    // 网络配置：剔除空值（后端校验/持久化只在提供非空键时生效，避免 'NaN'/'0' 脏值）
    function buildNetwork() {
        var net = {};
        Object.keys(networkForm).forEach(function (k) {
            var v = networkForm[k];
            if (v === undefined || v === null) return;
            if (k === 'wan_interface') { if (Array.isArray(v)) net[k] = v.slice(); return; }
            if (v === '') return;
            net[k] = v;
        });
        return net;
    }

    async function deleteNode(node) {
        var ok = await window.customConfirm(window.__i18n.tFormat('nodes.deleteNodeConfirm', node.name));
        if (!ok) return;
        try {
            await api('/admin/ikuai/nodes/' + node.id, { method: 'DELETE' });
            alert(window.__i18n.t('nodes.deleteOk'));
            await loadNodes();
        } catch (e) {
            console.error('删除爱快节点失败', e && e.message);
            await loadNodes();
            // 409 被占用：后端 refs（pveNodes/subnets/portForwards）无法经 api() 透传（shared.js 只抛 Error(message)），
            // 这里展示后端错误 message（已含 code 词条译文或原文）
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        }
    }

    return {
        nodes: nodes,
        loading: loading,
        versionModal: versionModal,
        formModal: formModal,
        formVersion: formVersion,
        editing: editing,
        editingId: editingId,
        interfaces: interfaces,
        testing: testing,
        saving: saving,
        form: form,
        networkForm: networkForm,
        wanIfaceText: wanIfaceText,
        load: load,
        loadNodes: loadNodes,
        loadStop: stopPoll,
        openVersionModal: openVersionModal,
        confirmVersion: confirmVersion,
        editNode: editNode,
        openForm: openForm,
        refreshInterfaces: refreshInterfaces,
        toggleWanIface: toggleWanIface,
        isWanIfaceSelected: isWanIfaceSelected,
        testConnection: testConnection,
        rowTest: rowTest,
        saveNode: saveNode,
        deleteNode: deleteNode
    };
})();
