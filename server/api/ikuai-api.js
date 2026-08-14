const db = require('./db');

class IkuaiApi {
    constructor() {
        // 配置不再于模块加载时读 .env，改为惰性从面板 DB 加载（60s 内存缓存）；
        // 保存配置后 reloadConfig() 清缓存立即生效，无需重启
        this.config = null;          // { host, username, password, strict_tls }
        this._configLoadedAt = 0;
        this._configTTL = 60000;
        this.client = null;
        this._clientConfigKey = '';  // 当前 client 对应的配置签名，变化时重建 client
    }

    isConfigured() {
        // 同步语义：判断已加载的内存配置（启动预热/调用前需先 await ensureConfig()）
        var c = this.config;
        if (!c) {
            // 兜底：冷启动未预热时异步补载（本轮返回未配置，下次调用生效）
            this.ensureConfig().catch(function () {});
            return false;
        }
        return !!(c.host && c.username && c.password);
    }

    // 配置加载：面板 DB 优先；仅当从未在面板配置过（DB 无 ikuai:host 行）且 .env 存在 IKUAI_* 时，
    // 用 .env 一次性迁移入 DB。面板显式清空地址 = 停用，不回退 .env（绝不覆盖面板已有配置）。
    async ensureConfig() {
        var now = Date.now();
        if (this.config && (now - this._configLoadedAt) < this._configTTL) return this.config;
        try {
            var cfg = await db.config.getIkuai();
            var hostRow = await db.config.get('ikuai:host'); // undefined = 从未在面板保存过
            if (!cfg.host && hostRow === undefined) {
                var envHost = process.env.IKUAI_HOST || '';
                var envUser = process.env.IKUAI_USER || '';
                var envPass = process.env.IKUAI_PASSWORD || '';
                if (envHost && envUser && envPass) {
                    cfg = { host: envHost, username: envUser, password: envPass, strict_tls: false };
                    try {
                        await db.config.setIkuai(cfg);
                        console.log(`[ikuai] 已从 .env 迁移配置到面板 DB (${envHost})`);
                    } catch (e) {
                        console.error('[ikuai] .env 配置迁移写入 DB 失败（本次继续使用 env 兜底）:', e.message);
                    }
                } else {
                    cfg = null;
                }
            } else if (!cfg.host) {
                cfg = null; // 面板已显式清空地址：保持停用
            }
            this.config = cfg;
            this._configLoadedAt = Date.now();
            return cfg;
        } catch (e) {
            console.error('[ikuai] 读取配置失败:', e.message);
            return this.config; // DB 故障时沿用旧缓存（若有），避免配置丢失
        }
    }

    // 热加载：清空配置缓存 + 重置登录态，下次调用自动重读 DB 并重建连接
    async reloadConfig() {
        this.config = null;
        this._configLoadedAt = 0;
        this._clientConfigKey = '';
        if (this.client) {
            try { this.client.logout(); } catch (e) {}
            this.client = null;
        }
        await this.ensureConfig();
    }

    async _ensureLogin() {
        var cfg = await this.ensureConfig();
        if (!cfg || !cfg.host || !cfg.username || !cfg.password) {
            throw new Error('爱快未配置（请在 系统设置 → 爱快节点设置 中配置）');
        }
        var key = cfg.host + '|' + cfg.username + '|' + cfg.password + '|' + (cfg.strict_tls ? '1' : '0');
        if (this._clientConfigKey !== key) {
            // 配置变化：丢弃旧会话并重建 client
            if (this.client) {
                try { this.client.logout(); } catch (e) {}
                this.client = null;
            }
            this._clientConfigKey = key;
        }
        if (this.client && this.client.isLoggedIn) return;
        await this._login(cfg);
    }

    async _login(cfg) {
        if (!this.client) {
            const { IKuaiClient } = await import('../sdk/ikuai-sdk/ikuai-sdk.mjs');
            this.client = new IKuaiClient(cfg.host, {
                debug: process.env.DEBUG === 'true',
                insecure: !cfg.strict_tls // 默认容忍自签证书；开启严格验证后校验证书
            });
        }
        try {
            await this.client.login(cfg.username, cfg.password);
            console.log(`[ikuai] 登录成功 (${cfg.host})`);
        } catch (e) {
            console.error('[ikuai] 登录失败:', e.message);
            throw e;
        }
    }

    async _call(funcName, action, param) {
        await this._ensureLogin();
        try {
            const result = await this.client.call(funcName, action, param);
            if (result?.Result === 30000) return result.Data;
            // 会话过期（10014）：主动重登后重试一次
            if (result?.Result === 10014) {
                throw new Error('no login authentication');
            }
            throw new Error(result?.ErrMsg || `Result=${result?.Result}`);
        } catch (e) {
            // 重新登录前先清空旧会话状态，防止过期 cookie 干扰（logout 后 isLoggedIn=false，_ensureLogin 会重新登录）
            try {
                if (this.client) this.client.logout();
                await this._ensureLogin();
                const retryResult = await this.client.call(funcName, action, param);
                if (retryResult?.Result === 30000) return retryResult.Data;
                throw new Error(retryResult?.ErrMsg || `Result=${retryResult?.Result}`);
            } catch (retryErr) {
                console.error(`[ikuai] ${funcName}/${action} 失败:`, retryErr.message);
                throw retryErr;
            }
        }
    }

    // 测试连接（只读验证：登录 + 拉取 DHCP 租约；设备不支持 system/sysstat 等函数名，用业务只读接口验证连通性）
    async testConnection() {
        var data = await this._call('dhcp_lease', 'show', { TYPE: 'total,data', ORDER_BY: 'timeout', ORDER: 'desc', limit: '0,1000' });
        var total = (data && data.total !== undefined) ? data.total : (data && Array.isArray(data.data) ? data.data.length : 0);
        return { leaseCount: total };
    }

    async getPortForwards() {
        const data = await this._call('dnat', 'show', { TYPE: 'data,total', limit: '0,9999', ORDER_BY: 'id', ORDER: '', orderType: '' });
        const list = data?.data || data?.rows || data || [];
        return list.map(item => ({
            id: item.id,
            lan_ip: item.lan_ip || item.lan_addr || '',
            lan_addr: item.lan_addr || item.lan_ip || '',
            lan_port: String(item.lan_port || ''),
            wan_port: String(item.wan_port || ''),
            protocol: item.protocol || '',
            comment: item.comment || '',
            enabled: item.enabled === 'yes' || item.enabled === '1' ? 'yes' : 'no',
            interface: item.interface || item.wan_iface || ''
        }));
    }

    async addPortForward(rule) {
        const comment = rule.comment || '';
        const result = await this._call('dnat', 'add', {
            lan_addr: rule.ip,
            lan_port: String(rule.internal_port),
            wan_port: String(rule.external_port),
            protocol: rule.protocol || 'tcp',
            comment: comment,
            enabled: 'yes',
            interface: rule.interface || ''
        });
        console.log(`[ikuai] 端口映射新增成功: ${rule.ip}:${rule.internal_port} → ${rule.external_port}`);
        return result;
    }

    async editPortForward(ruleId, rule) {
        const comment = ((rule.comment || '').replace(/[^\x20-\x7E\u4E00-\u9FA5a-zA-Z0-9\s\-_,.]/g, '')).substring(0, 50);
        const result = await this._call('dnat', 'edit', {
            id: Number(ruleId),
            lan_addr: rule.ip,
            lan_port: String(rule.internal_port),
            wan_port: String(rule.external_port),
            protocol: rule.protocol || 'tcp',
            comment: comment,
            enabled: 'yes',
            interface: rule.interface || ''
        });
        console.log(`[ikuai] 端口映射编辑成功: ID=${ruleId}`);
        return result;
    }

    async deletePortForward(ruleId) {
        const result = await this._call('dnat', 'del', { id: Number(ruleId) });
        console.log(`[ikuai] 端口映射删除成功: ID=${ruleId}`);
        return result;
    }

    async getDhcpLeases() {
        const data = await this._call('dhcp_lease', 'show', {
            TYPE: 'total,data',
            ORDER_BY: 'timeout',
            ORDER: 'desc',
            limit: '0,1000'
        });
        const list = data?.data || data || [];
        return list.map(d => ({
            ip: d.ip_addr || '',
            ipaddr: d.ip_addr || '',
            mac: d.mac || '',
            hwaddr: d.mac || '',
            comment: d.comment || '',
            hostname: d.hostname || ''
        }));
    }

    async getLanIps() {
        const data = await this._call('monitor_lanip', 'show', {
            TYPE: 'data,total',
            ORDER_BY: 'ip_addr_int',
            orderType: 'IP',
            limit: '0,1000',
            ORDER: ''
        });
        const list = data?.data || data || [];
        return list.map(d => ({
            ip: d.ip_addr || '',
            mac: d.mac || '',
            hostname: d.hostname || ''
        }));
    }

    async getInterfaces() {
        const interfaces = [];
        const seen = new Set();

        // 1. 获取 WAN 接口（来自 dnat 端口转发可用的外网接口）
        try {
            const data = await this._call('dnat', 'show', { TYPE: 'interface,protocol' });
            const ifaceList = data?.interface || data?.data?.interface || [];
            ifaceList.forEach(item => {
                const name = Array.isArray(item) ? item[0] : String(item);
                const comment = Array.isArray(item) && item.length > 1 ? item[1] : '';
                if (name && !seen.has(name)) {
                    seen.add(name);
                    interfaces.push({
                        name: name,
                        ip: '',
                        status: '已连接',
                        type: 'wan',
                        gateway: '',
                        comment: comment || ''
                    });
                }
            });
        } catch (e) {
            console.error('[ikuai] 获取WAN接口列表失败:', e.message);
        }

        // 2. 从 DHCP 租约中提取 LAN 接口
        try {
            const data = await this._call('dhcp_lease', 'show', {
                TYPE: 'total,data',
                ORDER_BY: 'timeout',
                ORDER: 'desc',
                limit: '0,1000'
            });
            const list = data?.data || data || [];
            list.forEach(d => {
                const iface = d.interface || d.bind_interface || d.server_interface || d.lan_interface || '';
                if (iface && !seen.has(iface)) {
                    seen.add(iface);
                    interfaces.push({
                        name: iface,
                        ip: '',
                        status: '已连接',
                        type: 'lan',
                        gateway: '',
                        comment: 'DHCP'
                    });
                }
            });
        } catch (e) {
            console.error('[ikuai] 从DHCP租约获取接口失败:', e.message);
        }

        // 3. 从 DHCP 静态绑定中提取 LAN 接口
        try {
            const data = await this._call('dhcp_static', 'show', {
                TYPE: 'static_total,static_data',
                limit: '0,1000',
                ORDER_BY: '',
                ORDER: ''
            });
            const list = data?.data || data?.static_data || [];
            list.forEach(item => {
                const iface = item.interface || '';
                if (iface && !seen.has(iface)) {
                    seen.add(iface);
                    interfaces.push({
                        name: iface,
                        ip: '',
                        status: '已连接',
                        type: 'lan',
                        gateway: '',
                        comment: 'DHCP'
                    });
                }
            });
        } catch (e) {
            console.error('[ikuai] 从DHCP静态绑定获取接口失败:', e.message);
        }

        // 3.5 并入 VLAN 可用父接口（vlan show TYPE interface，爱快 VLAN 下拉同源；
        //    设备上仅有 LAN 口时 DHCP 租约可能为空，避免下拉漏掉可用接口）
        try {
            const data = await this._call('vlan', 'show', { TYPE: 'interface' });
            const ifaceList = data?.interface || [];
            if (Array.isArray(ifaceList)) {
                ifaceList.forEach(item => {
                    const name = Array.isArray(item) ? item[0] : String(item);
                    const comment = Array.isArray(item) && item.length > 1 ? item[1] : '';
                    if (name && !seen.has(name)) {
                        seen.add(name);
                        interfaces.push({
                            name: name,
                            ip: '',
                            status: '已连接',
                            type: 'lan',
                            gateway: '',
                            comment: comment || 'VLAN'
                        });
                    }
                });
            }
        } catch (e) {
            console.error('[ikuai] 从 VLAN 接口枚举获取接口失败:', e.message);
        }

        console.log(`[ikuai] 获取到 ${interfaces.length} 个接口 (WAN: ${interfaces.filter(i=>i.type==='wan').length}, LAN: ${interfaces.filter(i=>i.type==='lan').length})`);
        return interfaces;
    }

    // ===== 私有网络：VLAN 接口 =====
    // VLAN 列表（创建子网时查重、反查 id 用）
    async getVlans() {
        const data = await this._call('vlan', 'show', {
            TYPE: 'data,total',
            limit: '0,1000',
            ORDER_BY: '',
            ORDER: ''
        });
        const list = data?.data || data || [];
        return list.map(item => ({
            id: item.id || '',
            vlan_id: String(item.vlan_id || ''),
            vlan_name: item.vlan_name || '',
            ip_addr: item.ip_addr || '',
            interface: item.interface || '',
            comment: item.comment || '',
            enabled: item.enabled
        }));
    }

    // VLAN 可用父接口枚举（vlan show TYPE interface，与爱快后台 VLAN 下拉同源）
    // 失败回退：dhcp 服务端 + 现有 vlan 的接口并集（best-effort，空数组表示不可枚举）
    async getVlanInterfaces() {
        try {
            const data = await this._call('vlan', 'show', { TYPE: 'interface' });
            const list = data?.interface || [];
            if (Array.isArray(list) && list.length > 0) {
                return list.map(item => (Array.isArray(item) ? item[0] : String(item))).filter(Boolean);
            }
        } catch (e) {
            console.error('[ikuai] 获取 VLAN 可用接口失败:', e.message);
        }
        try {
            const servers = await this.getDhcpServers();
            const vlans = await this.getVlans();
            const set = new Set();
            servers.forEach(s => { if (s.interface) set.add(s.interface); });
            vlans.forEach(v => { if (v.interface) set.add(v.interface); });
            return [...set];
        } catch (e) {
            return [];
        }
    }

    // VLAN 新增（私有网络子网创建）
    async addVlan({ vlan_id, vlan_name, ip_addr, interface: iface, netmask, comment }) {
        try {
            const result = await this._call('vlan', 'add', {
                vlan_id: String(vlan_id),
                vlan_name: vlan_name,
                ip_addr: ip_addr,
                mac: '',
                ip_mask: '',
                interface: iface || '',
                netmask: netmask || '255.255.255.0',
                comment: comment || '',
                enabled: 'yes'
            });
            console.log(`[ikuai] VLAN 新增成功: ${vlan_name} (ID=${vlan_id}, IP=${ip_addr}, 接口=${iface})`);
            return result;
        } catch (e) {
            // 携带创建上下文：爱快 30001 对「参数错误/账号无写权限」统一返回同一文案，无上下文难定位
            throw new Error(`VLAN 创建失败(接口=${iface || ''}, VLAN=${vlan_id}, IP=${ip_addr || ''}): ${e.message}`);
        }
    }

    // VLAN 删除（子网删除）
    async deleteVlan(id) {
        const result = await this._call('vlan', 'del', { id: Number(id) });
        console.log(`[ikuai] VLAN 删除成功: ID=${id}`);
        return result;
    }

    // ===== 私有网络：DHCP 服务端 =====
    // DHCP 服务端列表（反查 id/available 用）
    async getDhcpServers() {
        const data = await this._call('dhcp_server', 'show', {
            TYPE: 'total,data',
            limit: '0,1000',
            ORDER_BY: '',
            ORDER: ''
        });
        const list = data?.data || data || [];
        return list.map(item => ({
            id: item.id || '',
            interface: item.interface || '',
            addr_pool: item.addr_pool || '',
            netmask: item.netmask || '',
            gateway: item.gateway || '',
            dns1: item.dns1 || '',
            dns2: item.dns2 || '',
            available: parseInt(item.available) || 0,
            enabled: item.enabled,
            status: item.status
        }));
    }

    // 按接口名反查 DHCP 服务端（子网创建/刷新 available 用）
    async getDhcpServerByInterface(iface) {
        const servers = await this.getDhcpServers();
        return servers.find(s => s.interface === iface) || null;
    }

    // DHCP 服务端新增（私有网络子网创建）
    async addDhcpServer({ interface: iface, addr_pool, netmask, gateway, dns1, dns2 }) {
        const result = await this._call('dhcp_server', 'add', {
            interface: iface,
            addr_pool: addr_pool,
            netmask: netmask || '255.255.255.0',
            gateway: gateway,
            dns1: dns1 || '180.76.76.76',
            dns2: dns2 || '223.5.5.5',
            lease: 120,
            delay: 0,
            exclude_pool: '',
            enabled: 'yes',
            check_addr_valid: 1,
            check_relay_only: 0,
            phy_ifnames: 'all',
            opt15: '', opt_type15: 0, opt28: '', opt_type28: 0, opt43: '', opt_type43: 0,
            opt60: '', opt_type60: 0, opt66: '', opt_type66: 0, opt67: '', opt_type67: 0,
            opt80: '', opt_type80: 0, opt119: '', opt_type119: 0, opt125: '', opt_type125: 0,
            opt128: '', opt_type128: 0, opt138: '', opt_type138: 0,
            wins1: '', wins2: '', domain: '', opt121: '', opt_type121: 2
        });
        console.log(`[ikuai] DHCP 服务端新增成功: 接口=${iface}, 地址池=${addr_pool}`);
        return result;
    }

    // DHCP 服务端删除（子网删除）
    async deleteDhcpServer(id) {
        const result = await this._call('dhcp_server', 'del', { id: Number(id) });
        console.log(`[ikuai] DHCP 服务端删除成功: ID=${id}`);
        return result;
    }

    // DHCP 静态绑定：查询所有已绑定的 MAC/IP
    async getDhcpStaticBindings() {
        const data = await this._call('dhcp_static', 'show', {
            TYPE: 'static_total,static_data',
            limit: '0,1000',
            ORDER_BY: '',
            ORDER: ''
        });
        const list = data?.data || data?.static_data || [];
        return list.map(item => ({
            id: item.id || '',
            mac: (item.mac || '').toLowerCase(),
            ip: item.ipaddr || item.ip || item.ip_addr || '',
            // 兼容不同字段名，并去除前后空格
            comment: (item.comment || item.remark || item.note || item.desc || '').trim(),
            interface: item.interface || ''
        }));
    }

    // DHCP 静态绑定：新增
    async addDhcpStaticBinding(mac, ip, comment, iface, gateway, dns1, dns2) {
        // 从数据库读取 DHCP 配置作为默认值
        const cfgGateway = await db.config.get('dhcp:gateway') || '10.0.0.1';
        const cfgInterface = await db.config.get('dhcp:interface') || 'lan2';
        const cfgDns1 = await db.config.get('dhcp:dns1') || '119.29.29.29';
        const cfgDns2 = await db.config.get('dhcp:dns2') || '223.5.5.5';
        const result = await this._call('dhcp_static', 'add', {
            id: Math.floor(Date.now() / 1000),
            newRow: true,
            hostname: '',
            ip_addr: ip,
            mac: mac,
            gateway: gateway || cfgGateway,
            interface: iface || cfgInterface,
            dns1: dns1 || cfgDns1,
            dns2: dns2 || cfgDns2,
            comment: comment || '',
            enabled: 'yes'
        });
        console.log(`[ikuai] DHCP 静态绑定新增成功: ${mac} → ${ip} (${comment})`);
        return result;
    }

    // DHCP 静态绑定：编辑（修改 IP）
    async editDhcpStaticBinding(bindingId, mac, newIp, comment, iface, gateway, dns1, dns2) {
        const cfgGateway = await db.config.get('dhcp:gateway') || '10.0.0.1';
        const cfgInterface = await db.config.get('dhcp:interface') || 'lan2';
        const cfgDns1 = await db.config.get('dhcp:dns1') || '119.29.29.29';
        const cfgDns2 = await db.config.get('dhcp:dns2') || '223.5.5.5';
        const result = await this._call('dhcp_static', 'edit', {
            id: Number(bindingId),
            ip_addr: newIp,
            mac: mac,
            gateway: gateway || cfgGateway,
            interface: iface || cfgInterface,
            dns1: dns1 || cfgDns1,
            dns2: dns2 || cfgDns2,
            comment: comment || '',
            enabled: 'yes'
        });
        console.log(`[ikuai] DHCP 静态绑定编辑成功: ID=${bindingId}, ${mac} → ${newIp}`);
        return result;
    }

    // DHCP 静态绑定：删除
    async deleteDhcpStaticBinding(id) {
        const result = await this._call('dhcp_static', 'del', { id: Number(id) });
        console.log(`[ikuai] DHCP 静态绑定删除成功: ID=${id}`);
        return result;
    }

    // MAC 分组（爱快对象组）：获取分组列表
    // func_name: macgroup, action: show
    async getMacGroups() {
        try {
            const data = await this._call('macgroup', 'show', {
                TYPE: 'total,data',
                limit: '0,500',
                ORDER_BY: '',
                ORDER: ''
            });
            const list = data?.data || data || [];
            if (!Array.isArray(list)) {
                console.log('[ikuai] macgroup show Data 不是数组，类型:', typeof list);
                return [];
            }
            return list.map(item => ({
                // id 统一转字符串：与 DB TEXT 列（mysql2 返回字符串）及前端 v-model 严格比较保持一致
                id: String(item.id || ''),
                group_name: item.group_name || '',
                comment: item.comment || '',
                enabled: item.enabled || 'yes',
                addr_pool: item.addr_pool || '',
                members: (item.addr_pool || '').split(/,/).filter(Boolean).map(function(m) {
                    return { mac: m.toLowerCase(), comment: '' };
                })
            }));
        } catch (e) {
            console.error('[ikuai] 获取 MAC 分组列表失败:', e.message);
            return [];
        }
    }

    // MAC 分组：添加 MAC 到分组（addr_pool 空格分隔 → 追加 → edit）
    async addMacToGroup(groupId, mac, comment) {
        var current = await this._getMacGroupById(groupId);
        if (!current) throw new Error('MAC 分组 ID=' + groupId + ' 不存在');
        var pool = (current.addr_pool || '').trim();
        var macs = pool ? pool.split(/,/) : [];
        var normalized = mac.toLowerCase();
        if (macs.indexOf(normalized) >= 0) {
            console.log('[ikuai] MAC 分组新增: mac=' + normalized + ' 已存在，跳过');
            return;
        }
        macs.push(normalized);
        await this._call('macgroup', 'edit', {
            id: groupId,
            group_name: current.group_name,
            addr_pool: macs.join(','),
            comment: current.comment || ''
        });
        console.log('[ikuai] MAC 分组新增: groupId=' + groupId + ', mac=' + normalized);
    }

    // MAC 分组：从分组删除 MAC（addr_pool → 过滤 → edit）
    async removeMacFromGroup(groupId, mac) {
        var current = await this._getMacGroupById(groupId);
        if (!current) throw new Error('MAC 分组 ID=' + groupId + ' 不存在');
        var pool = (current.addr_pool || '').trim();
        var macs = pool ? pool.split(/,/) : [];
        var normalized = mac.toLowerCase();
        var idx = macs.indexOf(normalized);
        if (idx < 0) {
            console.log('[ikuai] MAC 分组删除: mac=' + normalized + ' 不在分组中，跳过');
            return;
        }
        macs.splice(idx, 1);
        await this._call('macgroup', 'edit', {
            id: groupId,
            group_name: current.group_name,
            addr_pool: macs.join(','),
            comment: current.comment || ''
        });
        console.log('[ikuai] MAC 分组删除: groupId=' + groupId + ', mac=' + normalized);
    }

    // MAC 分组：更新分组内 MAC（先删旧，再加新）
    async updateMacInGroup(groupId, oldMac, newMac, comment) {
        if (oldMac && oldMac !== newMac) {
            try { await this.removeMacFromGroup(groupId, oldMac); } catch (e) {}
        }
        if (newMac) {
            return await this.addMacToGroup(groupId, newMac, comment);
        }
    }

    // 内部：获取单个 MAC 分组的完整数据
    async _getMacGroupById(groupId) {
        var groups = await this.getMacGroups();
        for (var i = 0; i < groups.length; i++) {
            if (String(groups[i].id) === String(groupId)) return groups[i];
        }
        return null;
    }
}

module.exports = new IkuaiApi();