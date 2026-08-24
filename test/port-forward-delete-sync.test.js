// 单元测试：端口转发删除一致性修复（孤儿数据根因）
// 覆盖：deleteIkuaiRuleStrict（严格删除+幂等核对）+ syncPortForwardsFromIkuai 启动收敛/孤儿自动清理
// 依赖 mock 方式：require.cache 替换（项目无 proxyquire/sinon）
const assert = require('assert');
const path = require('path');

const IKUAI_API = path.join(__dirname, '..', 'server', 'api', 'ikuai-api.js');
const IKUAI_CLIENTS = path.join(__dirname, '..', 'server', 'api', 'ikuai-clients.js');
const DB = path.join(__dirname, '..', 'server', 'api', 'db.js');
const PVE_API = path.join(__dirname, '..', 'server', 'api', 'pve-api.js');

function mockModule(modulePath, exports) {
    const resolved = require.resolve(modulePath);
    require.cache[resolved] = { id: resolved, filename: resolved, loaded: true, exports };
}

function clearMock(modulePath) {
    delete require.cache[require.resolve(modulePath)];
}

// 清理 mock：每次加载目标模块前先清缓存，避免串用
function freshRequire(modulePath) {
    delete require.cache[require.resolve(modulePath)];
    return require(modulePath);
}

describe('deleteIkuaiRuleStrict（严格删除 + 幂等核对）', function () {
    afterEach(function () {
        clearMock(IKUAI_API);
        clearMock(IKUAI_CLIENTS);
        clearMock(DB);
        clearMock(path.join(__dirname, '..', 'server', 'services', 'port-forward-sync.js'));
    });

    function loadWithIkuai(ikuaiMock) {
        // 规则未落 ikuai_node_id 时走默认节点：DB 只须提供 getDefaultId
        mockModule(DB, { ikuaNodes: { getDefaultId: async () => 1 } });
        // 客户端经工厂获取（port-forward-sync 已多节点化）
        mockModule(IKUAI_CLIENTS, {
            getIkuaiClient: async () => ikuaiMock,
            getIkuaiClientForPve: async () => ikuaiMock,
            invalidateIkuaiClient: () => {}
        });
        return freshRequire(path.join(__dirname, '..', 'server', 'services', 'port-forward-sync.js'));
    }

    const ruleWithId = { id: 1, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', ikuai_id: JSON.stringify([{ interface: 'lan2', id: '88' }]) };
    const ruleNoId = { id: 2, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', ikuai_id: '' };

    it('爱快未配置：返回 deleted:true 且不调用删除接口', async function () {
        let calls = 0;
        const mod = loadWithIkuai({ isConfigured: () => false, deletePortForward: async () => { calls++; } });
        const ret = await mod.deleteIkuaiRuleStrict(ruleWithId);
        assert.deepStrictEqual(ret, { deleted: true });
        assert.strictEqual(calls, 0);
    });

    it('有 ikuai_id 且删除成功：deleted:true，按 id 调用', async function () {
        const deleted = [];
        const mod = loadWithIkuai({ isConfigured: () => true, deletePortForward: async (id) => { deleted.push(id); } });
        const ret = await mod.deleteIkuaiRuleStrict(ruleWithId);
        assert.deepStrictEqual(ret, { deleted: true });
        assert.deepStrictEqual(deleted, ['88']);
    });

    it('删除报错但回查爱快列表已无该规则：视为已删除（幂等，防重试死循环）', async function () {
        const mod = loadWithIkuai({
            isConfigured: () => true,
            deletePortForward: async () => { throw new Error('规则不存在'); },
            getPortForwards: async () => [{ id: '99', wan_port: '19999', lan_port: '9999', lan_ip: '10.0.0.9', protocol: 'udp' }]
        });
        const ret = await mod.deleteIkuaiRuleStrict(ruleWithId);
        assert.deepStrictEqual(ret, { deleted: true });
    });

    it('删除报错且爱快列表仍有该规则：返回 deleted:false 与错误（调用方不得删 DB）', async function () {
        const mod = loadWithIkuai({
            isConfigured: () => true,
            deletePortForward: async () => { throw new Error('写入数据失败'); },
            getPortForwards: async () => [{ id: '88', wan_port: '18080', lan_port: '8080', lan_ip: '10.0.0.5', protocol: 'tcp' }]
        });
        const ret = await mod.deleteIkuaiRuleStrict(ruleWithId);
        assert.strictEqual(ret.deleted, false);
        assert.match(ret.error, /写入数据失败/);
    });

    it('无 ikuai_id：按 端口+IP 匹配删除（兼容旧数据）', async function () {
        const deleted = [];
        const mod = loadWithIkuai({
            isConfigured: () => true,
            deletePortForward: async (id) => { deleted.push(id); },
            getPortForwards: async () => [{ id: '88', wan_port: '18080', lan_port: '8080', lan_ip: '10.0.0.5', protocol: 'tcp' }]
        });
        const ret = await mod.deleteIkuaiRuleStrict(ruleNoId);
        assert.deepStrictEqual(ret, { deleted: true });
        assert.deepStrictEqual(deleted, ['88']);
    });
});

describe('syncPortForwardsFromIkuai 启动收敛 + 孤儿自动清理', function () {
    const auditCalls = [];

    function baseDbMock(localRules) {
        const deletedIds = new Set();
        return {
            portForwards: {
                getAll: async () => localRules,
                create: async () => ({}),
                update: async (id, patch) => {
                    const r = localRules.find(x => x.id === id);
                    if (r) Object.assign(r, patch);
                },
                delete: async (id) => { deletedIds.add(id); },
                getDeletedIds: () => deletedIds
            },
            vms: { getAll: async () => [] },
            lxcContainers: { getAll: async () => [] },
            // 多节点：同步遍历爱快节点；生产迁移保证配置过爱快去重时至少有一条默认节点
            ikuaNodes: {
                list: async () => [{ id: 1, name: '默认爱快', enabled: 1, host: 'http://192.168.9.1', version: 'v3' }],
                getDefaultId: async () => 1,
                get: async () => ({ id: 1, name: '默认爱快', enabled: 1, host: 'http://192.168.9.1', version: 'v3' })
            },
            auditLogs: { create: async (row) => { auditCalls.push(row); } }
        };
    }

    function baseIkuaiMock(ikuaiRules) {
        return {
            isConfigured: () => true,
            getPortForwards: async () => ikuaiRules,
            getDhcpLeases: async () => [],
            getLanIps: async () => [],
            deletePortForward: async () => {}
        };
    }

    afterEach(function () {
        clearMock(IKUAI_API);
        clearMock(IKUAI_CLIENTS);
        clearMock(DB);
        clearMock(PVE_API);
        clearMock(path.join(__dirname, '..', 'server', 'services', 'ikuai-sync.js'));
        // 关键：port-forward-sync.js 也须清除，否则下一用例复用旧 mock 引用（deletePortForward 覆盖不生效）
        clearMock(path.join(__dirname, '..', 'server', 'services', 'port-forward-sync.js'));
        auditCalls.length = 0;
    });

    function loadSync(dbMock, ikuaiMock) {
        mockModule(DB, dbMock);
        // 爱快客户端经工厂获取：mock 工厂直接返回被测客户端（对齐 sync 的多节点结构）
        mockModule(IKUAI_CLIENTS, {
            getIkuaiClient: async () => ikuaiMock,
            getIkuaiClientForPve: async () => ikuaiMock,
            invalidateIkuaiClient: () => {}
        });
        mockModule(PVE_API, { getVmConfig: async () => null, getLxcConfig: async () => null });
        return freshRequire(path.join(__dirname, '..', 'server', 'services', 'ikuai-sync.js'));
    }

    it('deleting 残留 + 爱快已无 → 物理删除并写系统审计', async function () {
        const localRules = [
            { id: 1, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', sync_status: 'deleting', ikuai_id: JSON.stringify([{ interface: 'lan2', id: '88' }]) }
        ];
        const dbMock = baseDbMock(localRules);
        const sync = loadSync(dbMock, baseIkuaiMock([{ id: '99', wan_port: '19999', lan_port: '9999', lan_ip: '10.0.0.9', protocol: 'udp' }]));
        await sync.syncPortForwardsFromIkuai();
        assert.ok(dbMock.portForwards.getDeletedIds().has(1), 'deleting 残留应被物理删除');
        assert.strictEqual(auditCalls.length, 1);
        assert.strictEqual(auditCalls[0].user_id, 0, '系统审计 userId=0');
        assert.strictEqual(auditCalls[0].username, 'system');
        assert.match(auditCalls[0].details, /收敛删除中断/);
    });

    it('deleting 残留 + 爱快仍有 → 重试删除成功则删 DB', async function () {
        const localRules = [
            { id: 2, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', sync_status: 'deleting', ikuai_id: JSON.stringify([{ interface: 'lan2', id: '88' }]) }
        ];
        const dbMock = baseDbMock(localRules);
        const ikuaiMock = baseIkuaiMock([{ id: '88', wan_port: '18080', lan_port: '8080', lan_ip: '10.0.0.5', protocol: 'tcp' }]);
        const sync = loadSync(dbMock, ikuaiMock);
        await sync.syncPortForwardsFromIkuai();
        assert.ok(dbMock.portForwards.getDeletedIds().has(2), '重试成功后应删 DB');
        assert.strictEqual(auditCalls.length, 1);
        assert.match(auditCalls[0].details, /重试删除中断/);
    });

    it('deleting 残留 + 爱快仍有 + 重试失败 → 回滚 synced 不删 DB 不写审计', async function () {
        const localRules = [
            { id: 3, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', sync_status: 'deleting', ikuai_id: JSON.stringify([{ interface: 'lan2', id: '88' }]) }
        ];
        const dbMock = baseDbMock(localRules);
        const ikuaiMock = baseIkuaiMock([{ id: '88', wan_port: '18080', lan_port: '8080', lan_ip: '10.0.0.5', protocol: 'tcp' }]);
        ikuaiMock.deletePortForward = async () => { throw new Error('设备写路径故障'); };
        const sync = loadSync(dbMock, ikuaiMock);
        await sync.syncPortForwardsFromIkuai();
        assert.strictEqual(dbMock.portForwards.getDeletedIds().size, 0, '重试失败不得删 DB');
        assert.strictEqual(localRules[0].sync_status, 'synced', '应回滚为 synced');
        assert.strictEqual(auditCalls.length, 0, '回滚不伪造删除审计');
    });

    it('synced/orphan 未匹配爱快 → 自动清理 + 系统审计；pending 不自动清理', async function () {
        const localRules = [
            { id: 4, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', sync_status: 'synced', ikuai_id: JSON.stringify([{ interface: 'lan2', id: '88' }]) },
            { id: 5, ip: '10.0.0.6', internal_port: 9090, external_port: 19090, protocol: 'tcp', sync_status: 'orphan', ikuai_id: '' },
            { id: 6, ip: '10.0.0.7', internal_port: 10000, external_port: 20000, protocol: 'tcp', sync_status: 'pending', ikuai_id: '' }
        ];
        const dbMock = baseDbMock(localRules);
        const ikuaiRules = [{ id: '66', wan_port: '16000', lan_port: '6000', lan_ip: '10.0.0.6', protocol: 'tcp' }];
        const sync = loadSync(dbMock, baseIkuaiMock(ikuaiRules));
        await sync.syncPortForwardsFromIkuai();
        const deleted = dbMock.portForwards.getDeletedIds();
        assert.ok(deleted.has(4) && deleted.has(5), 'synced/orphan 应清理');
        assert.ok(!deleted.has(6), 'pending 不自动清理');
        assert.strictEqual(auditCalls.length, 2);
        assert.ok(auditCalls.every(a => a.user_id === 0 && a.username === 'system'));
        assert.match(auditCalls[0].details, /清理孤儿/);
    });

    it('爱快返回空列表 → 保护跳过，不清理任何本地记录', async function () {
        const localRules = [
            { id: 7, ip: '10.0.0.5', internal_port: 8080, external_port: 18080, protocol: 'tcp', sync_status: 'deleting', ikuai_id: '' },
            { id: 8, ip: '10.0.0.6', internal_port: 9090, external_port: 19090, protocol: 'tcp', sync_status: 'synced', ikuai_id: '' }
        ];
        const dbMock = baseDbMock(localRules);
        const sync = loadSync(dbMock, baseIkuaiMock([]));
        await sync.syncPortForwardsFromIkuai();
        assert.strictEqual(dbMock.portForwards.getDeletedIds().size, 0, '爱快空列表不得误删任何记录');
        assert.strictEqual(auditCalls.length, 0);
    });
});
