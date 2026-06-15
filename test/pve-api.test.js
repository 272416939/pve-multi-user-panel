var { expect } = require('chai');

describe('PVE API - cloneVm', function() {

  it('cloneVm 返回 response.data.data（UPID 字符串）', async function() {
    var pveApi = require('../server/api/pve-api');

    var fakeData = { data: 'UPID:pve-node:0001:root@pam:clone' };
    var callCount = 0;

    pveApi.detectNode = async function() {
      pveApi.node = 'pve-node';
    };

    var originalPost = pveApi.axiosInstance.post;
    pveApi.axiosInstance.post = async function() {
      callCount++;
      return { data: fakeData };
    };

    try {
      var result = await pveApi.cloneVm(100, 200, { name: 'test-vm' });
      expect(result).to.equal('UPID:pve-node:0001:root@pam:clone');
      expect(callCount).to.equal(1);
    } finally {
      pveApi.axiosInstance.post = originalPost;
    }
  });
});

describe('PVE API - waitForTask', function() {

  this.timeout(10000);

  var originalGetTaskStatus;

  beforeEach(function() {
    var pveApi = require('../server/api/pve-api');
    originalGetTaskStatus = pveApi.getTaskStatus.bind(pveApi);
    pveApi.detectNode = async function() {
      pveApi.node = 'pve-node';
    };
  });

  afterEach(function() {
    var pveApi = require('../server/api/pve-api');
    pveApi.getTaskStatus = originalGetTaskStatus;
  });

  it('任务成功完成时 resolve（running → stopped + exitstatus=OK）', async function() {
    var pveApi = require('../server/api/pve-api');
    var callCount = 0;

    pveApi.getTaskStatus = async function() {
      callCount++;
      if (callCount === 1) {
        return { type: 'qemuclone', id: '100', status: 'running' };
      }
      return { type: 'qemuclone', id: '100', status: 'stopped', exitstatus: 'OK' };
    };

    var result = await pveApi.waitForTask('UPID:test:success', 5000);
    expect(result).to.have.property('status', 'stopped');
    expect(result).to.have.property('exitstatus', 'OK');
    expect(callCount).to.equal(2);
  });

  it('任务失败时 reject（exitstatus !== OK）', async function() {
    var pveApi = require('../server/api/pve-api');
    var callCount = 0;

    pveApi.getTaskStatus = async function() {
      callCount++;
      if (callCount === 1) {
        return { type: 'qemuclone', id: '100', status: 'running' };
      }
      return { type: 'qemuclone', id: '100', status: 'stopped', exitstatus: 'VM 100 already running' };
    };

    try {
      await pveApi.waitForTask('UPID:test:failure', 5000);
      expect.fail('应该抛出错误');
    } catch (err) {
      expect(err.message).to.include('VM 100 already running');
      expect(callCount).to.equal(2);
    }
  });

  it('超时时 reject（超过 timeout 毫秒）', async function() {
    var pveApi = require('../server/api/pve-api');

    pveApi.getTaskStatus = async function() {
      return { type: 'qemuclone', id: '100', status: 'running' };
    };

    try {
      await pveApi.waitForTask('UPID:test:timeout', 200);
      expect.fail('应该抛出超时错误');
    } catch (err) {
      expect(err.message).to.include('timeout');
    }
  });
});
