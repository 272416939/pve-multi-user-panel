var { expect } = require('chai');
var fs = require('fs');
var path = require('path');

function readSrc(relPath) {
    return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

describe('端口转发统一与备份弹窗修复', function() {

    describe('Task 1: VM/LXC 端口转发子标签已移除', function() {
        var baseSrc = readSrc('public/js/admin/admin-template-base.js');
        var vmSrc = readSrc('public/js/admin/admin-template-vm.js');
        var lxcSrc = readSrc('public/js/admin/admin-template-lxc.js');

        it('侧边栏不再包含 vms-network 菜单项', function() {
            expect(baseSrc).to.not.match(/data-subsection="vms-network"/);
        });

        it('侧边栏不再包含 lxc-network 菜单项', function() {
            expect(baseSrc).to.not.match(/data-subsection="lxc-network"/);
        });

        it('VM 模板不再包含 network 子标签', function() {
            expect(vmSrc).to.not.match(/activeTabVm === 'network'/);
        });

        it('LXC 模板不再包含 network 子标签', function() {
            expect(lxcSrc).to.not.match(/activeTabLxc === 'network'/);
        });
    });

    describe('Task 2: 系统设置-网络管理配置已迁移到爱快节点页', function() {
        var settingsSrc = readSrc('public/js/admin/admin-template-settings.js');
        var ikuaiNodesSrc = readSrc('public/js/admin/admin-template-ikuai-nodes.js');
        var pveNodesSrc = readSrc('public/js/admin/admin-template-pve-nodes.js');

        it('设置页不再包含"所有端口转发"列表卡片', function() {
            expect(settingsSrc).to.not.match(/所有端口转发/);
        });

        it('设置页不再包含网络四组配置（端口范围/CNAME/DHCP 已迁至爱快节点页）', function() {
            expect(settingsSrc).to.not.match(/port_range_start/);
            expect(settingsSrc).to.not.match(/cnameEntries/);
            expect(settingsSrc).to.not.match(/dhcp/);
        });

        it('爱快节点页包含网络四组配置', function() {
            expect(ikuaiNodesSrc).to.match(/port_range_start/);
            expect(ikuaiNodesSrc).to.match(/cname_domain/);
            expect(ikuaiNodesSrc).to.match(/vlan_id_start/);
        });

        it('PVE 节点页包含快照与备份策略卡片', function() {
            expect(pveNodesSrc).to.match(/snapBackup|snapshotBackup|snapshot-config/);
        });
    });

    describe('Task 3: 端口转发管理一级标签已新增', function() {
        var baseSrc = readSrc('public/js/admin/admin-template-base.js');
        var portForwardSrc = readSrc('public/js/admin/admin-template-port-forward.js');
        var ejsSrc = readSrc('views/pages/admin.ejs');

        it('侧边栏包含端口转发管理一级菜单项', function() {
            expect(baseSrc).to.match(/switchSection\('port-forward'\)/);
            // 支持 i18n 改造：既有「端口转发管理」字面量已迁移为 t('nav.portForward')，用连接点与 data- 属性断言
            expect(baseSrc).to.match(/port-forward/);
        });

        it('端口转发管理菜单项位于 LXC 容器管理与后台管理之间', function() {
            var lxcEnd = baseSrc.indexOf('submenu-lxc');
            var portForwardIdx = baseSrc.indexOf("switchSection('port-forward')");
            var manageIdx = baseSrc.indexOf("toggleSubmenu('manage')");
            expect(portForwardIdx, '端口转发菜单项未找到').to.be.greaterThan(-1);
            expect(lxcEnd, 'LXC submenu 未找到').to.be.greaterThan(-1);
            expect(manageIdx, '后台管理菜单项未找到').to.be.greaterThan(-1);
            expect(portForwardIdx).to.be.greaterThan(lxcEnd);
            expect(portForwardIdx).to.be.lessThan(manageIdx);
        });

        it('存在端口转发 section 模板文件', function() {
            expect(portForwardSrc).to.match(/activeSection === \\'port-forward\\'/);
            expect(portForwardSrc).to.match(/port-forward-list/);
        });

        it('admin.ejs 加载了端口转发模板文件', function() {
            expect(ejsSrc).to.match(/admin-template-port-forward\.js/);
        });
    });

    describe('Task 4: 端口转发列表组件已合并', function() {
        var pageSrc = readSrc('public/js/admin/admin-page.js');
        var networkSrc = readSrc('public/js/admin/network.js');
        var coreSrc = readSrc('public/js/admin/core.js');

        it('不再存在 vm-port-forward-list 组件', function() {
            expect(pageSrc).to.not.match(/app\.component\('vm-port-forward-list'/);
        });

        it('不再存在 lxc-port-forward-list 组件', function() {
            expect(pageSrc).to.not.match(/app\.component\('lxc-port-forward-list'/);
        });

        it('存在合并后的 port-forward-list 组件', function() {
            expect(pageSrc).to.match(/app\.component\('port-forward-list'/);
        });

        it('合并组件包含类型筛选下拉', function() {
            var compMatch = pageSrc.match(/app\.component\('port-forward-list'[\s\S]*?\}\);/);
            expect(compMatch, 'port-forward-list 组件未找到').to.not.be.null;
            expect(compMatch[0]).to.match(/forwardFilterType/);
            expect(compMatch[0]).to.match(/common\.all[\s\S]*?VM[\s\S]*?LXC/);
        });

        it('合并组件包含类型列（VM/LXC 徽章）', function() {
            var compMatch = pageSrc.match(/app\.component\('port-forward-list'[\s\S]*?\}\);/);
            expect(compMatch, 'port-forward-list 组件未找到').to.not.be.null;
            expect(compMatch[0]).to.match(/rule\.type === \\'vm\\'/);
        });

        it('合并组件使用 pv-button', function() {
            var compMatch = pageSrc.match(/app\.component\('port-forward-list'[\s\S]*?\}\);/);
            expect(compMatch, 'port-forward-list 组件未找到').to.not.be.null;
            expect(compMatch[0]).to.match(/<pv-button/);
        });

        it('network.js 定义了 forwardFilterType', function() {
            expect(networkSrc).to.match(/\$\.forwardFilterType\s*=\s*ref/);
        });

        it('core.js onMounted 加载 port-forward 数据', function() {
            expect(coreSrc).to.match(/activeSection\.value === 'port-forward'/);
            expect(coreSrc).to.match(/loadForwardRules\('all'\)/);
        });

        it('core.js watch(activeSection) 加载 port-forward 数据', function() {
            expect(coreSrc).to.match(/watch\(\s*\$\.activeSection[\s\S]*?port-forward[\s\S]*?loadForwardRules/);
        });

        it('core.js 已清理 switchSubsection 中的 network 加载逻辑', function() {
            // switchSubsection 不应再包含 network 相关的 loadForwardRules
            var switchFnMatch = coreSrc.match(/\$\.switchSubsection\s*=\s*function[\s\S]*?\n\s*\};/);
            if (switchFnMatch) {
                expect(switchFnMatch[0]).to.not.match(/tab === 'network'/);
            }
        });
    });

    describe('Task 5: 备份弹窗显示限制信息', function() {
        var modalsSrc = readSrc('public/js/dashboard/dashboard-template-modals.js');

        it('VM 备份弹窗包含 backupLimits 引用', function() {
            expect(modalsSrc).to.match(/backupLimits/);
        });

        it('LXC 备份弹窗包含 lxcBackupLimits 引用', function() {
            expect(modalsSrc).to.match(/lxcBackupLimits/);
        });

        it('VM 备份弹窗显示当前/最大备份数', function() {
            expect(modalsSrc).to.match(/max_per_vm/);
        });

        it('VM 备份弹窗显示今日/每日上限', function() {
            expect(modalsSrc).to.match(/daily_limit/);
        });
    });

    describe('Task 6: 备份弹窗移除存储位置选项', function() {
        var modalsSrc = readSrc('public/js/dashboard/dashboard-template-modals.js');
        var coreSrc = readSrc('public/js/dashboard/core.js');

        it('VM 备份弹窗不再包含存储位置下拉', function() {
            // backupModal 内不应有 storageList 引用
            expect(modalsSrc).to.not.match(/backupForm\.storage/);
        });

        it('LXC 备份弹窗不再包含存储位置下拉', function() {
            expect(modalsSrc).to.not.match(/lxcBackupForm\.storage/);
        });

        it('dashboard core.js 不再定义 storageList', function() {
            expect(coreSrc).to.not.match(/\$\.storageList\s*=\s*ref/);
        });

        it('dashboard 不再引用 storageList', function() {
            expect(modalsSrc).to.not.match(/storageList/);
            expect(coreSrc).to.not.match(/storageList/);
        });
    });
});
