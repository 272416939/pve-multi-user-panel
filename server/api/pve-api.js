const axios = require('axios');
const https = require('https');
const http = require('http');
require('dotenv').config();

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

class PveApi {
  constructor() {
    this.node = null;
    // 内部缓存（从 DB 读取，60s TTL）
    this._configCache = null;
    this._configCacheTime = 0;
    this._configTTL = 60000; // 60 秒
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

  // 从 DB 读取 PVE 配置（带缓存）
  async _getConfig() {
    var now = Date.now();
    if (this._configCache && now - this._configCacheTime < this._configTTL) {
      return this._configCache;
    }
    try {
      const db = require('./db');
      const config = await db.config.getPve();
      this._configCache = config;
      this._configCacheTime = now;
      return config;
    } catch (e) {
      console.error('[pve-api] 读取 PVE 配置失败:', e.message);
      return { host: '', api_token: '', ssh_host: '', ssh_port: 22, ssh_user: 'root', ssh_password: '' };
    }
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
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes`);
    return response.data.data;
  }

  async getVms(options) {
    if (!this.node) {
      await this.detectNode();
    }
    if (!this.node) {
      throw new Error('未找到可用的 PVE 节点');
    }
    const url = `${this.host}/api2/json/nodes/${this.node}/qemu`;
    const response = await this.axiosInstance.get(url);
    var vms = response.data.data || [];
    if (options && options.templateOnly) {
      vms = vms.filter(function(vm) { return vm.template === 1; });
    }
    return vms;
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
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/config`);
    return response.data.data;
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
    return response.data;
  }

  async startVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/start`);
    return response.data;
  }

  async stopVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/stop`);
    return response.data;
  }

  async shutdownVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/shutdown`);
    return response.data;
  }

  async rebootVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/reboot`);
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
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot`);
    const snapshots = response.data.data || [];
    return snapshots.filter(s => !s.name.startsWith('__') && s.name !== 'current');
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
    return response.data;
  }

  async rollbackSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot/${snapname}/rollback`);
    return response.data;
  }

  async deleteSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot/${encodeURIComponent(snapname)}`);
    return response.data;
  }

  async destroyVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}`);
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
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
    const storages = response.data.data || [];
    return storages.filter(s => s.content && s.content.split(',').includes('backup'));
  }

  async getAllStorages() {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
    return response.data.data || [];
  }

  async getLxcStorageList() {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
    const storages = response.data.data || [];
    // LXC 容器需要 rootdir 类型的存储
    return storages.filter(s => !s.content || s.content.split(',').includes('rootdir'));
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
    return response.data;
  }

  // ==================== LXC 容器相关方法 ====================

  async getLxcContainers() {
    if (!this.node) {
      await this.detectNode();
    }
    if (!this.node) {
      throw new Error('未找到可用的 PVE 节点');
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc`);
    return response.data.data || [];
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
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/config`);
    return response.data.data;
  }

  async startLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/start`);
    return response.data;
  }

  async stopLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/stop`);
    return response.data;
  }

  async shutdownLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/shutdown`);
    return response.data;
  }

  async rebootLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/reboot`);
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
    return response.data;
  }

  async deleteLxc(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}`);
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
    return response.data;
  }

  async getLxcSnapshots(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot`);
    const snapshots = response.data.data || [];
    return snapshots.filter(s => !s.name.startsWith('__') && s.name !== 'current');
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
    return response.data;
  }

  async rollbackLxcSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot/${snapname}/rollback`);
    return response.data;
  }

  async deleteLxcSnapshot(vmid, snapname) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/snapshot/${snapname}`);
    return response.data;
  }

  async getTemplates(storage) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage/${encodeURIComponent(storage)}/content?content=vztmpl`);
    return response.data.data || [];
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
    return response.data;
  }
}

module.exports = new PveApi();
