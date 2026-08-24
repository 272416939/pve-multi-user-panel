const db = require('./db');

/**
 * 爱快 V4 业务封装（REST /api/v4.0/ + Bearer Token）
 * 与 server/api/ikuai-api.js（V3 门面）同名同签名、输出形态对齐，
 * 由 V3 门面按配置 version 分发调用，V3 逻辑零改动。
 *
 * 真机实测（2026-08-24, 4.0.308）：
 * - 所有列表端点统一 { code:0, message, results }；列表键名三形态：
 *   total/data（dnat/dhcp services/dhcp clients）、static_total/static_data（dhcp static）、
 *   mac_data/mac_total（mac-objects）
 * - vlan_name/interface 允许下划线（vlan_test1 实测，文档正则过严不强制）
 * - dhcp services 响应自带 available；设备 DHCP 服务 phy_ifnames 用 "all"
 * - dnat/dhcp-static 创建响应形态以真机为准（创建后按需反查/rowid）
 */
class IkuaiV4Api {
    constructor({ host, token, insecure, debug }) {
        this._cfg = { host, token, insecure, debug };
        this.client = null;
        this._clientPromise = null;
    }

    /** 懒加载底层 SDK client（.mjs 动态 import，首次调用时建立） */
    async _api() {
        if (this.client) return this.client;
        if (!this._clientPromise) {
            this._clientPromise = import('../sdk/ikuai-sdk/ikuai-sdk-v4.mjs').then(mod => {
                this.client = new mod.IKuaiV4Client(this._cfg.host, {
                    token: this._cfg.token,
                    insecure: this._cfg.insecure,
                    debug: this._cfg.debug === true
                });
                return this.client;
            });
        }
        return this._clientPromise;
    }

    /** 清洗为爱快 tagname（1-15 字符，中英文数字下划线连字符，不能以 _/- 开头） */
    _tagname(name, fallback = 'ikuai') {
        let s = String(name || '').replace(/[^\u4e00-\u9fa5a-zA-Z0-9_-]/g, '').slice(0, 15);
        s = s.replace(/^[-_]+/, '');
        return s || fallback;
    }

    /** 清洗 comment（去控制字符，截断 64） */
    _comment(name) {
        return String(name || '').replace(/[\x00-\x1f\x7f]/g, '').slice(0, 64);
    }

    /** 分页拉全量（list 端点默认 20/页，循环 page 直到收满） */
    async _listAll(path, keys) {
        const api = await this._api();
        const all = [];
        const pageSize = 500;
        for (let page = 1; page <= 20; page++) {
            const resp = await api.get(path, { page, limit: pageSize });
            const results = (resp && resp.results) || {};
            const data = results[keys.dataKey] || [];
            const total = results[keys.totalKey];
            all.push(...data);
            if (data.length < pageSize || (typeof total === 'number' && all.length >= total)) break;
        }
        return all;
    }

    /** DHCP 服务重启（配置变更后调用生效；容错不影响主流程） */
    async _restartDhcp() {
        try {
            const api = await this._api();
            await api.post('/network/dhcp/services:restart');
        } catch (e) {
            console.error('[ikuai-v4] DHCP 服务重启失败（不影响主流程）:', e.message);
        }
    }

    // ===== 测试连接 =====
    // V4 用 monitoring/system（一次请求验证令牌 + 返回设备版本/主机名）
    // 必须校验响应结构（results.sysinfo.verinfo）：指向非 V4 设备时 302/200 HTML 已被 SDK 拦截，此处双保险
    async testConnection() {
        const api = await this._api();
        const resp = await api.get('/monitoring/system');
        const sysinfo = (resp && resp.results && resp.results.sysinfo) || {};
        if (!sysinfo || typeof sysinfo !== 'object' || !sysinfo.verinfo) {
            throw new Error('爱快 V4 响应格式异常（请确认该地址是爱快 V4 设备，且 REST API 已开放）');
        }
        const verinfo = sysinfo.verinfo || {};
        return {
            leaseCount: 0,
            version: verinfo.version || verinfo.verstring || '',
            hostname: sysinfo.hostname || ''
        };
    }

    // ===== 端口转发（dnat）=====
    async getPortForwards() {
        const list = await this._listAll('/network/dnat/rules', { totalKey: 'total', dataKey: 'data' });
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
        const api = await this._api();
        const comment = this._comment(rule.comment);
        const result = await api.post('/network/dnat/rules', {
            tagname: this._tagname(comment, 'pf'),
            enabled: 'yes',
            lan_addr: rule.ip,
            lan_port: String(rule.internal_port),
            wan_port: String(rule.external_port),
            protocol: rule.protocol || 'tcp',
            interface: rule.interface || '',
            comment: comment
        });
        console.log(`[ikuai-v4] 端口映射新增成功: ${rule.ip}:${rule.internal_port} → ${rule.external_port}`);
        return result;
    }

    // V4 PUT 为全量修改需回读 tagname 等全部字段，改用「删旧 + 建新」（与 V3 编辑=删旧建新语义一致）
    async editPortForward(ruleId, rule) {
        const api = await this._api();
        try {
            await api.delete('/network/dnat/rules/' + Number(ruleId));
        } catch (e) {
            console.log(`[ikuai-v4] 端口映射编辑删除旧规则 ID=${ruleId} 失败（忽略，继续新建）:`, e.message);
        }
        return this.addPortForward(rule);
    }

    async deletePortForward(ruleId) {
        const api = await this._api();
        const result = await api.delete('/network/dnat/rules/' + Number(ruleId));
        console.log(`[ikuai-v4] 端口映射删除成功: ID=${ruleId}`);
        return result;
    }

    // ===== DHCP 租约 / LAN IP =====
    async getDhcpLeases() {
        const list = await this._listAll('/network/dhcp/clients', { totalKey: 'total', dataKey: 'data' });
        return list.map(d => ({
            ip: d.ip_addr || '',
            ipaddr: d.ip_addr || '',
            mac: d.mac || '',
            hwaddr: d.mac || '',
            comment: d.comment || '',
            hostname: d.hostname || ''
        }));
    }

    // V3 monitor_lanip 在 V4 无直接对应；用 DHCP 租约 + 静态绑定并集覆盖 IP↔MAC 反查
    async getLanIps() {
        const map = new Map();
        const leases = await this._listAll('/network/dhcp/clients', { totalKey: 'total', dataKey: 'data' });
        leases.forEach(d => { if (d.ip_addr && d.mac) map.set(d.ip_addr, { ip: d.ip_addr, mac: d.mac, hostname: d.hostname || '' }); });
        const statics = await this._listAll('/network/dhcp/static', { totalKey: 'static_total', dataKey: 'static_data' });
        statics.forEach(d => { if (d.ip_addr && d.mac && !map.has(d.ip_addr)) map.set(d.ip_addr, { ip: d.ip_addr, mac: d.mac, hostname: d.hostname || '' }); });
        return [...map.values()];
    }

    // ===== 接口枚举 =====
    // WAN=wan-config data[].name；LAN=lan-config data[].name；VLAN=network/vlan data[].vlan_name
    async getInterfaces() {
        const api = await this._api();
        const interfaces = [];
        const seen = new Set();
        const push = (name, type, ip, comment) => {
            if (name && !seen.has(name)) {
                seen.add(name);
                interfaces.push({ name, ip: ip || '', status: '已连接', type, gateway: '', comment: comment || '' });
            }
        };
        try {
            const resp = await api.get('/interfaces/wan-config');
            (resp?.results?.data || []).forEach(w => {
                const ip = String(w.ip_mask || '').split('/')[0];
                push(w.name, 'wan', ip, w.internet === 1 ? 'PPPoE' : '');
            });
        } catch (e) {
            console.error('[ikuai-v4] 获取WAN接口列表失败:', e.message);
        }
        try {
            const resp = await api.get('/interfaces/lan-config');
            (resp?.results?.data || []).forEach(l => {
                const ip = String(l.ip_mask || '').split('/')[0];
                push(l.name, 'lan', ip, 'DHCP');
            });
        } catch (e) {
            console.error('[ikuai-v4] 获取LAN接口列表失败:', e.message);
        }
        try {
            const vlans = await this._listAll('/network/vlan', { totalKey: 'total', dataKey: 'data' });
            vlans.forEach(v => push(v.vlan_name, 'lan', v.ip_addr || '', 'VLAN'));
        } catch (e) {
            console.error('[ikuai-v4] 获取VLAN接口失败:', e.message);
        }
        console.log(`[ikuai-v4] 获取到 ${interfaces.length} 个接口 (WAN: ${interfaces.filter(i => i.type === 'wan').length}, LAN: ${interfaces.filter(i => i.type === 'lan').length})`);
        return interfaces;
    }

    // ===== 私有网络：VLAN =====
    async getVlans() {
        const list = await this._listAll('/network/vlan', { totalKey: 'total', dataKey: 'data' });
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

    // VLAN 可用父接口 = LAN 接口（lan-config data[].name）；失败回退现有 vlan 父接口 + dhcp 服务接口并集
    async getVlanInterfaces() {
        const api = await this._api();
        try {
            const resp = await api.get('/interfaces/lan-config');
            const names = (resp?.results?.data || []).map(l => l.name).filter(Boolean);
            if (names.length > 0) return names;
        } catch (e) {
            console.error('[ikuai-v4] 获取 VLAN 可用接口失败:', e.message);
        }
        try {
            const set = new Set();
            const vlans = await this._listAll('/network/vlan', { totalKey: 'total', dataKey: 'data' });
            vlans.forEach(v => { if (v.interface) set.add(v.interface); });
            const servers = await this.getDhcpServers();
            servers.forEach(s => { if (s.interface) set.add(s.interface); });
            return [...set];
        } catch (e) {
            return [];
        }
    }

    async addVlan({ vlan_id, vlan_name, ip_addr, interface: iface, netmask, comment }) {
        const api = await this._api();
        try {
            const result = await api.post('/network/vlan', {
                vlan_id: String(vlan_id),
                vlan_name: vlan_name,
                interface: iface || '',
                netmask: netmask || '255.255.255.0',
                enabled: 'yes',
                ip_addr: ip_addr || '',
                mac: '',
                ip_mask: '',
                comment: comment || ''
            });
            console.log(`[ikuai-v4] VLAN 新增成功: ${vlan_name} (ID=${vlan_id}, IP=${ip_addr}, 接口=${iface})`);
            return result;
        } catch (e) {
            // 携带创建上下文：爱快对「参数错误/账号无写权限」统一返回错误，无上下文难定位
            throw new Error(`VLAN 创建失败(接口=${iface || ''}, VLAN=${vlan_id}, IP=${ip_addr || ''}): ${e.message}`);
        }
    }

    async deleteVlan(id) {
        const api = await this._api();
        const result = await api.delete('/network/vlan/' + Number(id));
        console.log(`[ikuai-v4] VLAN 删除成功: ID=${id}`);
        return result;
    }

    // ===== 私有网络：DHCP 服务端 =====
    async getDhcpServers() {
        const list = await this._listAll('/network/dhcp/services', { totalKey: 'total', dataKey: 'data' });
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

    // DHCP 服务端新增（phy_ifnames 用 "all"——真机设备自带服务即此值；创建后 restart 生效）
    async addDhcpServer({ interface: iface, addr_pool, netmask, gateway, dns1, dns2 }) {
        const api = await this._api();
        const result = await api.post('/network/dhcp/services', {
            enabled: 'yes',
            tagname: this._tagname(iface, 'dhcp'),
            interface: iface,
            phy_ifnames: 'all',
            addr_pool: addr_pool,
            exclude_pool: '',
            netmask: netmask || '255.255.255.0',
            gateway: gateway,
            dns1: dns1 || '180.76.76.76',
            dns2: dns2 || '223.5.5.5',
            lease: 120,
            delay: 0,
            check_addr_valid: 1,
            check_relay_only: 0,
            opt_type15: 0, opt15: '', opt_type28: 0, opt28: '', opt_type43: 0, opt43: '',
            opt_type60: 0, opt60: '', opt_type66: 0, opt66: '', opt_type67: 0, opt67: '',
            opt_type80: 0, opt80: '', opt_type119: 0, opt119: '', opt_type125: 0, opt125: '',
            opt_type128: 0, opt128: '', opt_type138: 0, opt138: '', opt_type121: 2, opt121: '',
            wins1: '', wins2: '', domain: '', next_server: ''
        });
        console.log(`[ikuai-v4] DHCP 服务端新增成功: 接口=${iface}, 地址池=${addr_pool}`);
        await this._restartDhcp();
        return result;
    }

    async deleteDhcpServer(id) {
        const api = await this._api();
        const result = await api.delete('/network/dhcp/services/' + Number(id));
        console.log(`[ikuai-v4] DHCP 服务端删除成功: ID=${id}`);
        await this._restartDhcp();
        return result;
    }

    // ===== DHCP 静态绑定 =====
    async getDhcpStaticBindings() {
        const list = await this._listAll('/network/dhcp/static', { totalKey: 'static_total', dataKey: 'static_data' });
        return list.map(item => ({
            id: item.id || '',
            mac: (item.mac || '').toLowerCase(),
            ip: item.ipaddr || item.ip || item.ip_addr || '',
            comment: (item.comment || item.remark || item.note || item.desc || '').trim(),
            interface: item.interface || ''
        }));
    }

    async addDhcpStaticBinding(mac, ip, comment, iface, gateway, dns1, dns2) {
        const api = await this._api();
        // 与 V3 同源：未显式传入时读 DB 配置作为默认值
        const cfgGateway = await db.config.getIkuaiSetting('dhcp:gateway') || '10.0.0.1';
        const cfgInterface = await db.config.getIkuaiSetting('dhcp:interface') || 'lan2';
        const cfgDns1 = await db.config.getIkuaiSetting('dhcp:dns1') || '180.76.76.76';
        const cfgDns2 = await db.config.getIkuaiSetting('dhcp:dns2') || '223.5.5.5';
        const finalComment = this._comment(comment);
        const result = await api.post('/network/dhcp/static', {
            enabled: 'yes',
            mac: mac,
            ip_addr: ip,
            interface: iface || cfgInterface,
            tagname: this._tagname(finalComment, 'dhcp'),
            comment: finalComment,
            gateway: gateway || cfgGateway,
            dns1: dns1 || cfgDns1,
            dns2: dns2 || cfgDns2,
            hostname: ''
        });
        console.log(`[ikuai-v4] DHCP 静态绑定新增成功: ${mac} → ${ip} (${finalComment})`);
        return result;
    }

    async editDhcpStaticBinding(bindingId, mac, newIp, comment, iface, gateway, dns1, dns2) {
        const api = await this._api();
        const cfgGateway = await db.config.getIkuaiSetting('dhcp:gateway') || '10.0.0.1';
        const cfgInterface = await db.config.getIkuaiSetting('dhcp:interface') || 'lan2';
        const cfgDns1 = await db.config.getIkuaiSetting('dhcp:dns1') || '180.76.76.76';
        const cfgDns2 = await db.config.getIkuaiSetting('dhcp:dns2') || '223.5.5.5';
        const finalComment = this._comment(comment);
        // V4 PUT 为全量修改，必须携带全部字段
        const result = await api.put('/network/dhcp/static/' + Number(bindingId), {
            enabled: 'yes',
            mac: mac,
            ip_addr: newIp,
            interface: iface || cfgInterface,
            tagname: this._tagname(finalComment, 'dhcp'),
            comment: finalComment,
            gateway: gateway || cfgGateway,
            dns1: dns1 || cfgDns1,
            dns2: dns2 || cfgDns2,
            hostname: ''
        });
        console.log(`[ikuai-v4] DHCP 静态绑定编辑成功: ID=${bindingId}, ${mac} → ${newIp}`);
        return result;
    }

    async deleteDhcpStaticBinding(id) {
        const api = await this._api();
        const result = await api.delete('/network/dhcp/static/' + Number(id));
        console.log(`[ikuai-v4] DHCP 静态绑定删除成功: ID=${id}`);
        return result;
    }

    // ===== MAC 分组（V4 = mac-objects 对象组）=====
    async getMacGroups() {
        try {
            const list = await this._listAll('/mac-objects', { totalKey: 'mac_total', dataKey: 'mac_data' });
            if (!Array.isArray(list)) return [];
            return list.map(item => {
                const values = Array.isArray(item.group_value) ? item.group_value : [];
                return {
                    // id 统一转字符串：与 DB TEXT 列及前端 v-model 严格比较保持一致
                    id: String(item.id || ''),
                    group_name: item.group_name || '',
                    comment: '',
                    enabled: item.enabled || 'yes',
                    addr_pool: values.map(v => String(v.mac || '')).join(','),
                    members: values.map(v => ({ mac: String(v.mac || '').toLowerCase(), comment: v.comment || '' }))
                };
            });
        } catch (e) {
            console.error('[ikuai-v4] 获取 MAC 分组列表失败:', e.message);
            return [];
        }
    }

    async _getMacGroupById(groupId) {
        const groups = await this.getMacGroups();
        for (let i = 0; i < groups.length; i++) {
            if (String(groups[i].id) === String(groupId)) return groups[i];
        }
        return null;
    }

    // V4 对象组内容为 group_value 数组（[{mac,comment}]），替代 V3 addr_pool 逗号串；PUT 全量提交
    async _putMacGroup(groupId, group_name, values) {
        const api = await this._api();
        return api.put('/mac-objects/' + Number(groupId), {
            group_name: group_name,
            group_value: values
        });
    }

    async addMacToGroup(groupId, mac, comment) {
        const current = await this._getMacGroupById(groupId);
        if (!current) throw new Error('MAC 分组 ID=' + groupId + ' 不存在');
        const values = current.members.map(m => ({ mac: m.mac, comment: m.comment || '' }));
        const normalized = String(mac).toLowerCase();
        if (values.some(v => String(v.mac).toLowerCase() === normalized)) {
            console.log('[ikuai-v4] MAC 分组新增: mac=' + normalized + ' 已存在，跳过');
            return;
        }
        values.push({ mac: normalized, comment: this._comment(comment) });
        await this._putMacGroup(groupId, current.group_name, values);
        console.log('[ikuai-v4] MAC 分组新增: groupId=' + groupId + ', mac=' + normalized);
    }

    async removeMacFromGroup(groupId, mac) {
        const current = await this._getMacGroupById(groupId);
        if (!current) throw new Error('MAC 分组 ID=' + groupId + ' 不存在');
        const normalized = String(mac).toLowerCase();
        const values = current.members.filter(m => String(m.mac).toLowerCase() !== normalized);
        if (values.length === current.members.length) {
            console.log('[ikuai-v4] MAC 分组删除: mac=' + normalized + ' 不在分组中，跳过');
            return;
        }
        await this._putMacGroup(groupId, current.group_name, values);
        console.log('[ikuai-v4] MAC 分组删除: groupId=' + groupId + ', mac=' + normalized);
    }

    // 更新分组内 MAC（先删旧，再加新）
    async updateMacInGroup(groupId, oldMac, newMac, comment) {
        if (oldMac && oldMac !== newMac) {
            try { await this.removeMacFromGroup(groupId, oldMac); } catch (e) {}
        }
        if (newMac) {
            return await this.addMacToGroup(groupId, newMac, comment);
        }
    }
}

module.exports = { IkuaiV4Api };
