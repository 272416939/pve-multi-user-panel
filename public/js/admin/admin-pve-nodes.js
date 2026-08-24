// 管理端 PVE 节点 页面逻辑（区域管理 → PVE 节点）
// 底部「快照与备份策略」复用 admin.js 的全局 snapshot/backup 配置（$.snapshotConfig/$.backupConfigForm，
// $.loadSnapshotConfig/$.saveSnapshotConfig/$.loadBackupConfig/$.saveBackupConfig/$.loadStorageList）。
// 模板引用全部经 $.pveNodesPage 暴露（window.__admin 在 setup return 中整体展开，见 admin-page.js）
window.__admin = window.__admin || {};
window.__admin.pveNodesPage = (function () {
    var $ = window.__admin;
    var Vue = window.Vue;
    var ref = Vue.ref;
    var reactive = Vue.reactive;

    var nodes = ref([]);
    var loading = ref(false);
    var formModal = ref(false);
    var editing = ref(false);
    var editingId = ref(null);
    var storages = ref([]);
    var storagesLoading = ref(false);
    var testing = ref(false);
    var saving = ref(false);
    var formOptions = reactive({ zones: [], ikua_nodes: [] });

    var form = reactive({
        id: null, name: '', zone_id: '', api_host: '', api_token: '', strict_tls: false,
        ssh_host: '', ssh_port: 22, ssh_user: 'root', ssh_password: '',
        backup_storage: '', ikuai_node_id: '', enabled: true, sort_order: 0
    });

    // ==================== 加载 ====================
    // 统一入口：core.js watch/onMounted 同源调用
    async function load() {
        await Promise.all([
            loadNodes(),
            loadFormOptions().catch(function (e) { console.error('加载表单选项失败', e && e.message); }),
            $.loadSnapshotConfig ? $.loadSnapshotConfig() : Promise.resolve(),
            $.loadBackupConfig ? $.loadBackupConfig() : Promise.resolve(),
            $.loadStorageList ? $.loadStorageList() : Promise.resolve()
        ]);
    }

    async function loadNodes() {
        loading.value = true;
        try {
            var data = await api('/admin/pve/nodes');
            nodes.value = (data && data.nodes) || [];
        } catch (e) {
            console.error('加载 PVE 节点列表失败', e && e.message);
            nodes.value = [];
        } finally {
            loading.value = false;
        }
    }

    async function loadFormOptions() {
        var data = await api('/admin/pve/nodes/form-options');
        formOptions.zones = (data && data.zones) || [];
        formOptions.ikua_nodes = (data && data.ikua_nodes) || [];
    }

    // ==================== 弹窗 ====================
    function resetForm() {
        form.id = null;
        form.name = '';
        form.zone_id = '';
        form.api_host = '';
        form.api_token = '';
        form.strict_tls = false;
        form.ssh_host = '';
        form.ssh_port = 22;
        form.ssh_user = 'root';
        form.ssh_password = '';
        form.backup_storage = '';
        form.ikuai_node_id = '';
        form.enabled = true;
        form.sort_order = 0;
    }

    async function openFormModal(node) {
        editing.value = !!node;
        editingId.value = node ? node.id : null;
        resetForm();
        storages.value = [];
        await loadFormOptions().catch(function (e) { console.error('加载表单选项失败', e && e.message); });
        // 编辑态：拉取详情 + 已保存节点的存储列表；新增态：存储列表在测试通过后经 storages-preview 填充
        if (node && node.id) {
            try {
                var d = await api('/admin/pve/nodes/' + node.id);
                var nd = d.node || {};
                form.id = nd.id;
                form.name = nd.name || '';
                form.zone_id = nd.zone_id || '';
                form.api_host = nd.api_host || '';
                form.api_token = nd.api_token || '';
                form.strict_tls = !!nd.strict_tls;
                form.ssh_host = nd.ssh_host || '';
                form.ssh_port = nd.ssh_port || 22;
                form.ssh_user = nd.ssh_user || 'root';
                form.ssh_password = nd.ssh_password || '';
                form.backup_storage = nd.backup_storage || '';
                form.ikuai_node_id = nd.ikuai_node_id || '';
                form.enabled = nd.enabled !== false;
                form.sort_order = nd.sort_order || 0;
            } catch (e) {
                console.error('加载 PVE 节点详情失败', e && e.message);
            }
            loadStorages(node.id);
        }
        $.bsModalShow('pveNodeFormModal');
    }

    // 编辑态：按已保存节点拉取存储列表
    async function loadStorages(nodeId) {
        storagesLoading.value = true;
        try {
            var data = await api('/admin/pve/nodes/storages?node_id=' + nodeId);
            storages.value = (data && data.storages) || [];
        } catch (e) {
            console.error('加载备份存储列表失败', e && e.message);
            storages.value = [];
        } finally {
            storagesLoading.value = false;
        }
    }

    // 新增态：按表单当前连接值预览存储列表（测试通过后调用，不落库）
    async function loadStoragesPreview() {
        storagesLoading.value = true;
        try {
            var body = buildTestPayload();
            delete body.ssh_host; delete body.ssh_port; delete body.ssh_user; delete body.ssh_password; delete body.node_id;
            var data = await api('/admin/pve/nodes/storages-preview', { method: 'POST', body: body });
            storages.value = (data && data.storages) || [];
        } catch (e) {
            console.error('预览备份存储列表失败', e && e.message);
            storages.value = [];
        } finally {
            storagesLoading.value = false;
        }
    }

    // ==================== 测试连接 ====================
    function buildTestPayload() {
        var p = {
            api_host: form.api_host,
            api_token: form.api_token,
            strict_tls: !!form.strict_tls,
            ssh_host: form.ssh_host,
            ssh_port: form.ssh_port || 22,
            ssh_user: form.ssh_user,
            ssh_password: form.ssh_password
        };
        if (editingId.value != null) p.node_id = editingId.value;
        return p;
    }

    // 测试连接按钮（silentOk 为真时成功不弹窗——保存前自动测试场景）；
    // 新增态测试成功后填充备份存储下拉
    async function testConnection(silentOk) {
        if (testing.value) return false;
        testing.value = true;
        try {
            var res = await api('/admin/pve/nodes/test', { method: 'POST', body: buildTestPayload() });
            if (!editing.value) await loadStoragesPreview();
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
            var res = await api('/admin/pve/nodes/' + node.id + '/test', { method: 'POST' });
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
        if (!form.zone_id) { alert(window.__i18n.t('nodes.zoneRequired')); return; }
        if (!(form.api_host || '').trim()) { alert(window.__i18n.t('nodes.apiHostRequired')); return; }
        if (!(form.api_token || '').trim() && !editing.value) { alert(window.__i18n.t('nodes.apiTokenRequired')); return; }
        if (!(form.ssh_host || '').trim()) { alert(window.__i18n.t('nodes.sshHostRequired')); return; }
        if (!(form.ssh_port || '').trim()) { alert(window.__i18n.t('nodes.sshPortRequired')); return; }
        if (!(form.ssh_user || '').trim()) { alert(window.__i18n.t('nodes.sshUserRequired')); return; }
        if (!form.ikuai_node_id) { alert(window.__i18n.t('nodes.relatedIkuaiRequired')); return; }
        if (!(form.backup_storage || '').trim()) { alert(window.__i18n.t('nodes.backupStorageRequired')); return; }
        var tested = await testConnection(true);
        if (!tested) return;
        saving.value = true;
        try {
            var payload = {
                name: (form.name || '').trim(),
                zone_id: form.zone_id,
                ikuai_node_id: form.ikuai_node_id,
                api_host: (form.api_host || '').trim(),
                api_token: form.api_token,
                ssh_host: (form.ssh_host || '').trim(),
                ssh_port: form.ssh_port || 22,
                ssh_user: (form.ssh_user || '').trim(),
                ssh_password: form.ssh_password,
                strict_tls: !!form.strict_tls,
                backup_storage: (form.backup_storage || '').trim(),
                enabled: form.enabled !== false,
                sort_order: form.sort_order || 0
            };
            if (editing.value) {
                await api('/admin/pve/nodes/' + editingId.value, { method: 'PUT', body: payload });
            } else {
                await api('/admin/pve/nodes', { method: 'POST', body: payload });
            }
            $.bsModalHide('pveNodeFormModal');
            alert(window.__i18n.t('nodes.saveOk'));
            await loadNodes();
        } catch (e) {
            console.error('保存 PVE 节点失败', e && e.message);
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        } finally {
            saving.value = false;
        }
    }

    async function deleteNode(node) {
        var ok = await window.customConfirm(window.__i18n.tFormat('nodes.deleteNodeConfirm', node.name));
        if (!ok) return;
        try {
            await api('/admin/pve/nodes/' + node.id, { method: 'DELETE' });
            alert(window.__i18n.t('nodes.deleteOk'));
            await loadNodes();
        } catch (e) {
            console.error('删除 PVE 节点失败', e && e.message);
            await loadNodes();
            alert(e && e.message ? e.message : window.__i18n.t('shared.retryLater'));
        }
    }

    return {
        nodes: nodes,
        loading: loading,
        formModal: formModal,
        editing: editing,
        editingId: editingId,
        storages: storages,
        storagesLoading: storagesLoading,
        testing: testing,
        saving: saving,
        formOptions: formOptions,
        form: form,
        load: load,
        loadNodes: loadNodes,
        loadFormOptions: loadFormOptions,
        openFormModal: openFormModal,
        loadStorages: loadStorages,
        loadStoragesPreview: loadStoragesPreview,
        testConnection: testConnection,
        rowTest: rowTest,
        saveNode: saveNode,
        deleteNode: deleteNode
    };
})();
