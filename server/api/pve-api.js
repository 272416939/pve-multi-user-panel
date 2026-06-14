const axios = require('axios');
const https = require('https');
require('dotenv').config();

class PveApi {
  constructor() {
    this.host = process.env.PVE_HOST;
    this.apiToken = process.env.PVE_API_TOKEN;
    this.node = null;
    this.axiosInstance = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
      headers: {
        'Authorization': `PVEAPIToken=${this.apiToken}`
      }
    });
  }

  async detectNode() {
    try {
      const nodes = await this.getNodes();
      if (nodes && nodes.length > 0) {
        this.node = nodes[0].node;
      }
    } catch (error) {
      console.error('检测节点失败:', error.message);
      if (error.response) {
        console.error('节点检测错误响应:', error.response.data);
      }
    }
  }

  async getNodes() {
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes`);
    return response.data.data;
  }

  async getVms() {
    if (!this.node) {
      await this.detectNode();
    }
    if (!this.node) {
      throw new Error('未找到可用的 PVE 节点');
    }
    const url = `${this.host}/api2/json/nodes/${this.node}/qemu`;
    const response = await this.axiosInstance.get(url);
    const vms = response.data.data || [];
    return vms;
  }

  async getVmStatus(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/current`);
    return response.data.data;
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
    const response = await this.axiosInstance.post(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/status/reset`);
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
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}/snapshot/${snapname}`);
    return response.data;
  }

  async destroyVm(vmid) {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.delete(`${this.host}/api2/json/nodes/${this.node}/qemu/${vmid}`);
    return response.data;
  }

  async getStorageList() {
    if (!this.node) {
      await this.detectNode();
    }
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage`);
    const storages = response.data.data || [];
    return storages.filter(s => s.content && s.content.split(',').includes('backup'));
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
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/tasks/${encodeURIComponent(upid)}/status`);
    return response.data.data;
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
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage/${storage}/content`);
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
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/lxc/${vmid}/status/current`);
    return response.data.data;
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
    const response = await this.axiosInstance.get(`${this.host}/api2/json/nodes/${this.node}/storage/${storage}/content?content=vztmpl`);
    return response.data.data || [];
  }

  async getNextAvailableVmid() {
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
