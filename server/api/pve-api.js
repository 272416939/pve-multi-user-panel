const axios = require('axios');
const https = require('https');
const http = require('http');
const cacheStore = require('../utils/cache-store');
require('dotenv').config();

// PERF-06: PVE 只读接口短 TTL 缓存（30s）
// 存储列表/模板列表/VM 配置等只读数据被表单下拉高频请求，每次实时打 PVE 节点
// （30s 超时+失败重试）会拖垮所有依赖它的接口。短 TTL 缓存 + 写操作统一清除，
// 一致性风险仅 30s 窗口，PVE 面板本身也是手动刷新。
const pveCache = cacheStore.create('pve', 30);

/**
 * 清空 PVE 只读缓存（所有写操作方法调用，防止读到过期配置/列表）
 */
async function clearPveCache() {
    try { await pveCache.clear(); } catch (e) {}
}

// 对幂等 GET 请求进行重试（仅对 502/503/504/超时/连接重置 重试）
async function withRetry(fn, maxRetries = 2) {
  let lastErr;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.code === 'ECONNRESET' || e.code === 'ETIMEDOUT' ||
          (e.response && [502, 503, 504].includes(e.response.status))) {
        if (i < maxRetries) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
          continue;
        }
      }
      throw e;
    }
  }
  throw lastErr;
}

// pve_nodes 行 → PveApi 配置形状（api_host→host 对齐旧全局键字段名）
function mapNodeRow(node) {
  return {
    host: node.api_host || '',
    api_token: node.api_token || '',
    ssh_host: node.ssh_host || '',
    ssh_port: node.ssh_port || 22,
    ssh_user: node.ssh_user || 'root',
    ssh_password: node.ssh_password || '',
    strict_tls: !!node.strict_tls,
    backup_storage: node.backup_storage || 'local'
  };
}

class PveApi {
  /**
   * @param {number|null} nodeId - 绑定的 pve_nodes.id；null=默认节点（过渡兼容：
   *   先取默认节点行，无任何节点时回退旧全局 config 键，保证未迁移调用点行为不变）
   */
  constructor(nodeId = null) {
    this.nodeId = nodeId;
    this._resolvedNodeId = null; // 实际绑定的节点 ID（_getConfig 内解析，缓存键前缀用）
    this.node = null;
    // 内部缓存（从 DB 读取，保存节点配置后 reloadConfig()/invalidatePveClient() 即时失效，TTL 仅兜底）
    this._configCache = null;
    this._configCacheTime = 0;
    this._configTTL = 300000; // 5 分钟
    this._httpsAgent = null;
    var self = this;
    // axios 实例（httpsAgent 在拦截器中动态设置，依赖 DB 配置的 strict_tls）
    this.axiosInstance = axios.create({
      httpAgent: new http.Agent({
        keepAlive: true,
        maxSockets: 50
      }),
      timeout: 30000
    });
    // 拦截器：确保配置已加载 + 注入完整 URL、认证头、TLS 策略
    this.axiosInstance.interceptors.request.use(async function(config) {
      var cfg = await self.ensureConfig();
      config.baseURL = cfg.host;
      config.headers['Authorization'] = 'PVEAPIToken=' + cfg.api_token;
      // 根据 DB 配置动态创建/复用 httpsAgent
      var strictTls = !!cfg.strict_tls;
      if (!self._httpsAgent || self._httpsAgentStrictTls !== strictTls) {
        self._httpsAgent = new https.Agent({
          keepAlive: true,
          maxSockets: 50,
          rejectUnauthorized: strictTls
        });
        self._httpsAgentStrictTls = strictTls;
        if (strictTls) {
          console.log('[pve-api] TLS 严格证书验证已启用');
        } else {
          console.warn('[pve-api] ⚠️ TLS 证书验证已禁用（自签证书模式），生产环境建议启用');
        }
      }
      config.httpsAgent = self._httpsAgent;
      return config;
    });
  }

  // 从 DB 读取 PVE 配置（带缓存）。多节点：按 nodeId 读 pve_nodes 行；
  // 默认客户端：先解析默认节点行，无任何节点时回退旧全局 pve:* 配置键
  async _getConfig() {
    var now = Date.now();
    if (this._configCache && now - this._configCacheTime < this._configTTL) {
      return this._configCache;
    }
    try {
      const db = require('./db');
      var config = null;
      if (this.nodeId != null) {
        const node = await db.pveNodes.get(this.nodeId);
        if (!node) throw new Error('PVE 节点不存在 (#' + this.nodeId + ')');
        config = mapNodeRow(node);
        this._resolvedNodeId = this.nodeId;
      } else {
        const defaultId = await db.pveNodes.getDefaultId();
        if (defaultId != null) {
          const node = await db.pveNodes.get(defaultId);
          if (node && node.api_host) {
            config = mapNodeRow(node);
            this._resolvedNodeId = defaultId;
          }
        }
        if (!config) {
          config = await db.config.getPve(); // 全新安装/尚未建节点时的引导路径
          this._resolvedNodeId = null;
        }
      }
      this._configCache = config;
      this._configCacheTime = now;
      return config;
    } catch (e) {
      console.error('[pve-api] 读取 PVE 节点配置失败:', e.message);
      return { host: '', api_token: '', ssh_host: '', ssh_port: 22, ssh_user: 'root', ssh_password: '' };
    }
  }

  // 只读缓存键：必须带节点作用域前缀（不同节点的 storages/vms/vmconfig 互不相同）
  // 用构造时绑定的 this.nodeId 作前缀（_resolvedNodeId 要等 ensureConfig 才解析；
  // 懒加载完成前求值会退化为 'x'，所有节点首批缓存互相串写——多节点 LXC 列表 500 根因）
  _ck(key) {
    return 'n' + (this.nodeId != null ? this.nodeId : 'x') + ':' + key;
  }

  // 保存配置后刷新缓存
  async reloadConfig() {
    this._configCache = null;
    this._configCacheTime = 0;
    await this._getConfig();
  }

  // 获取 host（getter，兼容旧代码 this.host 访问）
  get host() {
    return this._configCache ? this._configCache.host : '';
  }

  // 获取 apiToken（getter）
  get apiToken() {
    return this._configCache ? this._configCache.api_token : '';
  }

  // 确保配置已加载（异步调用方需要 await）
  async ensureConfig() {
    if (!this._configCache || Date.now() - this._configCacheTime >= this._configTTL) {
      await this._getConfig();
    }
    return this._configCache;
  }

  async detectNode() {
    try {
      const nodes = await this.getNodes();
      if (nodes && nodes.length > 0) {
        this.node = nodes[0].node;
      }
    } catch (error) {
      console.error('检测节点失败:', error.message);
    }
  }

  async getNodes() {
    return pveCache.get(this._ck('nodes'), async () => {
      const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes`);
      return response.data.data;
    });
  }

  async getVms(options) {
    var cacheKey = this._ck(options && options.templateOnly ? 'vms:tpl' : 'vms');
    var self = this;
    return pveCache.get(cacheKey, async () => {
      if (!self.node) {
        await self.detectNode();
      }
      if (!self.node) {
        throw new Error('未找到可用的 PVE 节点');
      }
      const url = `${self.host}/api2/json/nodes/${self.node}/qemu`;
      const response = await self.axiosInstance.get(url);
      var vms = response.data.data || [];
      if (options && options.templateOnly) {
        vms = vms.filter(function(vm) { return vm.template === 1; });
      }
      return vms;
    });
  }

  async getVmStatus(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    try {
      const response = await withRetry(() => this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/current`));
      return response.data.data;
    } catch (e) {
      if (e.response && [404, 500].includes(e.response.status)) {
        this.node = null;
        await this.detectNode();
      }
      throw e;
    }
  }

  async getVmConfig(vmid) {
    var self = this;
    return pveCache.get(self._ck('vmconfig:' + vmid), async () => {
      if (!self.node) {
        await self.detectNode();
      }
      const response = await self.axiosInstance.get(`${self.host}/api2/json/nodes/${self.node}/qemu/${vmid}/config`);
      return response.data.data;
    });
  }

  async updateVmConfig(vmid, params) {
    if (!this.node) {
      await this.detectNode();
    }
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
    const response = await this.axiosInstance.put(
      `${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/config`,
      searchParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    clearPveCache();
    return response.data;
  }

  async startVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/start`);
    clearPveCache();
    return response.data;
  }

  async stopVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/stop`);
    clearPveCache();
    return response.data;
  }

  async shutdownVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/shutdown`);
    clearPveCache();
    return response.data;
  }

  async rebootVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/reboot`);
    clearPveCache();
    return response.data;
  }

  async getVncConsole(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/vncproxy`);
    const { port, ticket } = response.data.data;
    return { port, ticket, node: this.node };
  }

  async getSnapshots(vmid) {
    var self = this;
    return pveCache.get(self._ck('snapshots:' + vmid), async () => {
      if (!self.node) {
        await self.detectNode();
      }
      const response = await self.axiosInstance.get(`${self.host}/api2/json/nodes/${self.node}/qemu/${vmid}/snapshot`);
      const snapshots = response.data.data || [];
      return snapshots.filter(s => !s.name.startsWith('__') && s.name !== 'current');
    });
  }

  async createSnapshot(vmid, snapname, description) {
    if (!this.node) {
      await this.detectNode();
    }
    const params = new URLSearchParams();
    params.append('snapname', snapname);
    if (description) params.append('description', description);
    params.append('vmstate', '1');
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    clearPveCache();
    return response.data;
  }

  async rollbackSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`);
    clearPveCache();
    return response.data;
  }

  async deleteSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}`);
    clearPveCache();
    return response.data;
  }

  async destroyVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}`);
    clearPveCache();
    return response.data;
  }

  async cloneVm(templateVmid, newVmid, params) {
    if (!this.node) {
      await this.detectNode();
    }
    const searchParams = new URLSearchParams();
    searchParams.append('newid', String(newVmid));
    if (params && params.name) searchParams.append('name', params.name);
    if (params && params.target) searchParams.append('target', params.target);
    if (params && params.storage) searchParams.append('storage', params.storage);
    if (params && params.clone_mode === 'full') {
      searchParams.append('full', '1');
    }
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/qemu/${templateVmid}/clone`,
      searchParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 300000 }
    );
    clearPveCache();
    return response.data.data;
  }

  // 在 VM 之间移动磁盘（PVE API: move_disk）
  // 自动处理 LV 重命名和存储索引更新
  // format: 可选，DIR 存储跨存储时 PVE 需知道源磁盘格式（如 raw/qcow2）
  async moveDisk(sourceVmid, disk, targetVmid, targetDisk, format) {
    if (!this.node) {
      await this.detectNode();
    }
    const searchParams = new URLSearchParams();
    searchParams.append('disk', String(disk));
    searchParams.append('target-vmid', String(targetVmid));
    searchParams.append('target-disk', String(targetDisk));
    if (format) {
      searchParams.append('format', format);
    }
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/qemu/${sourceVmid}/move_disk`,
      searchParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 300000 }
    );
    clearPveCache();
    return response.data.data;
  }

  async waitForTask(upid, timeout = 300000) {
    const pollInterval = 2000;
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= timeout) {
        throw new Error(`Task ${upid} timed out after ${timeout / 1000} seconds`);
      }

      const taskStatus = await this.getTaskStatus(upid);

      if (taskStatus.status === 'stopped') {
        if (taskStatus.exitstatus === 'OK') {
          return taskStatus;
        }
        throw new Error(`Task failed: ${taskStatus.exitstatus}`);
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
  }

  async getStorageList() {
    return pveCache.get(this._ck('storages'), async () => {
      if (!this.node) {
        await this.detectNode();
      }
      const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
      const storages = response.data.data || [];
      return storages.filter(s => s.content && s.content.split(',').includes('backup'));
    });
  }

  async getAllStorages() {
    return pveCache.get(this._ck('all-storages'), async () => {
      if (!this.node) {
        await this.detectNode();
      }
      const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
      return response.data.data || [];
    });
  }

  async getLxcStorageList() {
    return pveCache.get(this._ck('lxc-storages'), async () => {
      if (!this.node) {
        await this.detectNode();
      }
      const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
      const storages = response.data.data || [];
      // LXC 容器需要 rootdir 类型的存储
      return storages.filter(s => !s.content || s.content.split(',').includes('rootdir'));
    });
  }

  async createBackup(vmid, storage, mode = 'stop') {
    if (!this.node) {
      await this.detectNode();
    }
    const params = new URLSearchParams();
    params.append('vmid', String(vmid));
    params.append('storage', storage);
    params.append('mode', mode);
    params.append('compress', 'zstd');
    params.append('remove', '0');
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/vzdump`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 30000 }
    );
    clearPveCache();
    return response.data;
  }

  async getTaskStatus(upid) {
    if (!this.node) {
      await this.detectNode();
    }
    try {
      const response = await withRetry(() => this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/tasks/${encodeURIComponent(upid)}/status`));
      return response.data.data;
    } catch (e) {
      if (e.response && [404, 500].includes(e.response.status)) {
        this.node = null;
        await this.detectNode();
      }
      throw e;
    }
  }

  async deleteBackupFile(volid) {
    if (!this.node) {
      await this.detectNode();
    }
    const storage = volid.split(':')[0];
    const volidEncoded = encodeURIComponent(volid);
    try {
      const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/storage/${storage}/content/${volidEncoded}`);
      clearPveCache();
      return response.data;
    } catch (e) {
      if (e.response?.status === 404) {
        console.log('备份文件在 PVE 中已不存在，跳过删除:', volid);
        return { data: null };
      }
      throw e;
    }
  }

  async getStorageContent(storage) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage/${encodeURIComponent(storage)}/content`);
    return response.data.data || [];
  }

  async restoreBackup(vmid, volid) {
    if (!this.node) {
      await this.detectNode();
    }
    const params = new URLSearchParams();
    params.append('archive', volid);
    params.append('vmid', String(vmid));
    params.append('force', '1');
    params.append('unique', '0');
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/qemu`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 }
    );
    clearPveCache();
    return response.data;
  }

  // ==================== LXC 容器相关方法 ====================

  async getLxcContainers() {
    var self = this;
    return pveCache.get(self._ck('lxc-vms'), async () => {
      if (!self.node) {
        await self.detectNode();
      }
      if (!self.node) {
        throw new Error('未找到可用的 PVE 节点');
      }
      const response = await self.axiosInstance.get(`${self.host}/api2/json/nodes/${self.node}/lxc`);
      return response.data.data || [];
    });
  }

  async getLxcStatus(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    try {
      const response = await withRetry(() => this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/current`));
      return response.data.data;
    } catch (e) {
      if (e.response && [404, 500].includes(e.response.status)) {
        this.node = null;
        await this.detectNode();
      }
      throw e;
    }
  }

  async getLxcConfig(vmid) {
    var self = this;
    return pveCache.get(self._ck('lxc-config:' + vmid), async () => {
      if (!self.node) {
        await self.detectNode();
      }
      const response = await self.axiosInstance.get(`${self.host}/api2/json/nodes/${self.node}/lxc/${vmid}/config`);
      return response.data.data;
    });
  }

  async startLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/start`);
    clearPveCache();
    return response.data;
  }

  async stopLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/stop`);
    clearPveCache();
    return response.data;
  }

  async shutdownLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/shutdown`);
    clearPveCache();
    return response.data;
  }

  async rebootLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/reboot`);
    clearPveCache();
    return response.data;
  }

  async getLxcVncConsole(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/vncproxy`);
    const { port, ticket } = response.data.data;
    return { port, ticket, node: this.node };
  }

  async getTerminal(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/termproxy`);
    const { port, ticket } = response.data.data;
    return { port, ticket, node: this.node };
  }

  async createLxc(params) {
    if (!this.node) {
      await this.detectNode();
    }
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/lxc`,
      searchParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 }
    );
    clearPveCache();
    return response.data;
  }

  async deleteLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}`);
    clearPveCache();
    return response.data;
  }

  async updateLxcConfig(vmid, params) {
    if (!this.node) {
      await this.detectNode();
    }
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        searchParams.append(key, String(value));
      }
    }
    const response = await this.axiosInstance.put(
      `${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/config`,
      searchParams.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    clearPveCache();
    return response.data;
  }

  async getLxcSnapshots(vmid) {
    var self = this;
    return pveCache.get(self._ck('lxc-snapshots:' + vmid), async () => {
      if (!self.node) {
        await self.detectNode();
      }
      const response = await self.axiosInstance.get(`${self.host}/api2/json/nodes/${self.node}/lxc/${vmid}/snapshot`);
      const snapshots = response.data.data || [];
      return snapshots.filter(s => !s.name.startsWith('__') && s.name !== 'current');
    });
  }

  async createLxcSnapshot(vmid, snapname, description) {
    if (!this.node) {
      await this.detectNode();
    }
    const params = new URLSearchParams();
    params.append('snapname', snapname);
    if (description) params.append('description', description);
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    clearPveCache();
    return response.data;
  }

  async rollbackLxcSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot/${encodeURIComponent(snapname)}/rollback`);
    clearPveCache();
    return response.data;
  }

  async deleteLxcSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot/${encodeURIComponent(snapname)}`);
    clearPveCache();
    return response.data;
  }

  async getTemplates(storage) {
    return pveCache.get(this._ck('templates:' + storage), async () => {
      if (!this.node) {
        await this.detectNode();
      }
      const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage/${encodeURIComponent(storage)}/content?content=vztmpl`);
      return response.data.data || [];
    });
  }

  async getNextAvailableVmid() {
    try {
      const resp = await withRetry(() => this.axiosInstance.get(`${this.host}/api2/json/cluster/nextid`));
      return parseInt(resp.data.data);
    } catch (e) {
      console.warn('[pve-api] /cluster/nextid 失败，回退到手动计算:', e.message);
      if (!this.node) {
        await this.detectNode();
      }
      const [qemuVms, lxcCts] = await Promise.all([
        this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/qemu`).then(r => r.data.data || []),
        this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc`).then(r => r.data.data || [])
      ]);
      const allIds = [...qemuVms, ...lxcCts].map(vm => parseInt(vm.vmid)).filter(id => !isNaN(id));
      const maxId = allIds.length > 0 ? Math.max(...allIds) : 99;
      return maxId + 1;
    }
  }

  async restoreLxcBackup(vmid, volid, storage) {
    if (!this.node) {
      await this.detectNode();
    }
    const params = new URLSearchParams();
    params.append('vmid', String(vmid));
    params.append('restore', '1');
    params.append('ostemplate', volid);
    if (storage) params.append('storage', storage);
    const response = await this.axiosInstance.post(
      `${this.host}/api2/json/nodes/${this.node}/lxc`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 60000 }
    );
    clearPveCache();
    return response.data;
  }

  /**
   * 测试 PVE API 与 SSH 连通性（对表单当前值测试，不依赖已保存配置，不做任何写操作）
   * 返回 { success: boolean, message: string, info } 结构（redis-admin 测试连接同款模式，友好中文文案）
   * @param {object} params - { host, api_token, strict_tls, ssh_host, ssh_port, ssh_user, ssh_password }
   * @returns {Promise<{success: boolean, message: string, info?: {nodes: number, ssh: boolean|null}}>}
   */
  async testConnection(params) {
    var { friendlyTestError } = require('../utils/friendly-test-error');
    var host = String(params.host || '').trim().replace(/\/+$/, '');
    if (!host) return { success: false, message: '请填写 PVE API 地址再测试' };
    // SSRF 防护：仅允许 http/https 协议（与保存接口校验一致）
    if (!/^https?:\/\/\S+$/i.test(host)) return { success: false, message: 'PVE API 地址必须以 http:// 或 https:// 开头' };
    var apiToken = String(params.api_token || '').trim();
    if (!apiToken) return { success: false, message: '请填写 API Token 再测试' };
    var agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !!params.strict_tls });
    var response;
    try {
      response = await axios.get(host + '/api2/json/nodes', {
        headers: { Authorization: 'PVEAPIToken=' + apiToken },
        httpsAgent: agent,
        timeout: 10000
      });
    } catch (e) {
      return { success: false, message: 'PVE API 连接失败: ' + friendlyTestError(e) };
    }
    var nodes = response.data && response.data.data;
    if (!Array.isArray(nodes)) return { success: false, message: 'PVE API 响应格式异常' };
    // SSH 校验：仅当填写了 SSH 地址时才测试（测试连接以 API 连通性为主，SSH 为附加项）
    var ssh = null;
    if (String(params.ssh_host || '').trim()) {
      if (!params.ssh_password) return { success: false, message: '已填写 SSH 地址，请同时填写 SSH 密码' };
      try {
        var { execSSH } = require('./ssh-exec');
        var r = await execSSH(String(params.ssh_host).trim(), String(params.ssh_user || '').trim() || 'root', params.ssh_password, 'echo ok', 15000, parseInt(params.ssh_port) || 22);
        if (r.code !== 0) {
          return { success: false, message: 'SSH 命令执行失败: ' + String(r.stderr || r.stdout || ('退出码 ' + r.code)).trim() };
        }
        ssh = true;
      } catch (e) {
        return { success: false, message: 'SSH 连接失败: ' + friendlyTestError(e) };
      }
    }
    return {
      success: true,
      message: 'PVE API 连接成功（' + nodes.length + ' 个节点），SSH ' + (ssh ? '连接成功' : '未配置跳过'),
      info: { nodes: nodes.length, ssh }
    };
  }
}

module.exports = new PveApi();
// 类引用挂在单例上，供 pve-clients.js 工厂创建多节点实例
module.exports.PveApi = PveApi;
