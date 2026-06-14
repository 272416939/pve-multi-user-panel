const db = require('./db');

class IkuaiApi {
    constructor() {
        this.baseUrl = process.env.IKUAI_HOST;
        this.username = process.env.IKUAI_USER || '';
        this.password = process.env.IKUAI_PASSWORD || '';
        this.client = null;
    }

    isConfigured() {
        return !!(this.username && this.password);
    }

    async _ensureLogin() {
        if (this.client && this.client.isLoggedIn) return;
        await this._login();
    }

    async _login() {
        if (!this.client) {
            const { IKuaiClient } = await import('../sdk/ikuai-sdk/ikuai-sdk.mjs');
            this.client = new IKuaiClient(this.baseUrl, {
                debug: process.env.DEBUG === 'true'
            });
        }
        try {
            await this.client.login(this.username, this.password);
            console.log(`[ikuai] 登录成功 (${this.baseUrl})`);
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
            throw new Error(result?.ErrMsg || `Result=${result?.Result}`);
        } catch (e) {
            // 尝试重新登录后重试一次
            try {
                await this.client.login(this.username, this.password);
                const retryResult = await this.client.call(funcName, action, param);
                if (retryResult?.Result === 30000) return retryResult.Data;
                throw new Error(retryResult?.ErrMsg || `Result=${retryResult?.Result}`);
            } catch (retryErr) {
                console.error(`[ikuai] ${funcName}/${action} 失败:`, retryErr.message);
                throw retryErr;
            }
        }
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

        console.log(`[ikuai] 获取到 ${interfaces.length} 个接口 (WAN: ${interfaces.filter(i=>i.type==='wan').length}, LAN: ${interfaces.filter(i=>i.type==='lan').length})`);
        return interfaces;
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
            await this._ensureLogin();
            const result = await this.client.call('macgroup', 'show', {
                TYPE: 'total,data',
                limit: '0,500',
                ORDER_BY: '',
                ORDER: ''
            });
            if (result?.Result !== 30000) {
                console.error('[ikuai] macgroup show 失败: Result=' + result?.Result + ' ErrMsg=' + (result?.ErrMsg || ''));
                return [];
            }
            const list = result.Data?.data || result.Data || [];
            if (!Array.isArray(list)) {
                console.log('[ikuai] macgroup show Data 不是数组，类型:', typeof list);
                return [];
            }
            return list.map(item => ({
                id: item.id || '',
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
        await this._ensureLogin();
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
        var result = await this.client.call('macgroup', 'edit', {
            id: groupId,
            group_name: current.group_name,
            addr_pool: macs.join(','),
            comment: current.comment || ''
        });
        if (result?.Result !== 30000) throw new Error(result?.ErrMsg || 'Result=' + result?.Result);
        console.log('[ikuai] MAC 分组新增: groupId=' + groupId + ', mac=' + normalized);
    }

    // MAC 分组：从分组删除 MAC（addr_pool → 过滤 → edit）
    async removeMacFromGroup(groupId, mac) {
        await this._ensureLogin();
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
        var result = await this.client.call('macgroup', 'edit', {
            id: groupId,
            group_name: current.group_name,
            addr_pool: macs.join(','),
            comment: current.comment || ''
        });
        if (result?.Result !== 30000) throw new Error(result?.ErrMsg || 'Result=' + result?.Result);
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