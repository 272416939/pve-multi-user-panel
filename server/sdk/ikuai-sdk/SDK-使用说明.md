# 爱快软路由 API SDK 使用说明

## 安装

将 `ikuai-sdk.js` 放入你的项目目录，无需任何 npm 依赖（使用 Node.js 内置的 `crypto`、`http` 模块）。

## 引入方式

### 方式一：ESM（推荐，Node.js ≥ 16）

```javascript
import { IKuaiClient } from './ikuai-sdk.js';
```

### 方式二：CommonJS 项目中使用

```javascript
const { IKuaiClient } = await import('./ikuai-sdk.js');
```

## 快速开始

```javascript
import { IKuaiClient } from './ikuai-sdk.js';

// 1. 创建客户端
const router = new IKuaiClient('http://10.10.10.1');

// 2. 登录（密码明文，SDK 自动 MD5）
await router.login('admin', 'your_password');

// 3. 查询数据（只读）
const leases = await router.show('dhcp_lease');
console.log('DHCP 租约:', leases.Data.data);

// 4. 新增数据
const addResult = await router.add('simple_qos', {
  ip_addr: '192.168.1.100',
  upload: '512',
  download: '2048',
  comment: '限速规则',
  enabled: 'yes',
  week: '1234567',
  time: '00:00-23:59'
});
console.log('新增 ID:', addResult.RowId);

// 5. 编辑数据
await router.edit('simple_qos', {
  id: addResult.RowId,
  upload: '1024',
  comment: '已修改'
});

// 6. 删除数据
await router.del('simple_qos', { id: addResult.RowId });
```

## API 参考

### `new IKuaiClient(baseUrl, options?)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `baseUrl` | string | 路由器地址，如 `http://10.10.10.1` |
| `options.debug` | boolean | 是否打印请求日志（默认 false） |

### `router.login(username, password)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `username` | string | 登录用户名 |
| `password` | string | **明文密码**，SDK 自动 MD5 加密 |

### `router.call(funcName, action, param)`

通用 API 调用，所有操作底层都走这个方法。

| 参数 | 类型 | 说明 |
|------|------|------|
| `funcName` | string | 功能模块名，如 `dhcp_lease`、`dnat`、`simple_qos` |
| `action` | string | 操作类型：`show` / `add` / `edit` / `del` |
| `param` | object | 请求参数 |

**返回结构：**

```javascript
{
  Result: 30000,      // 30000=成功
  ErrMsg: 'Success',
  RowId: 1,           // add 操作时返回
  Data: {             // show 操作时返回
    data: [ ... ],
    total: 10
  }
}
```

### `router.show(funcName, param?)`

查询数据（只读安全操作）。`param` 默认值：

```javascript
{ TYPE: 'data,total', limit: '0,500', ORDER_BY: '', ORDER: '' }
```

### `router.add(funcName, param)`

新增数据，返回包含 `RowId`。

### `router.edit(funcName, param)`

编辑数据。**注意：edit 需要带上全部核心字段**，不能只传要修改的字段。

```javascript
// 正确：带上全字段
await router.edit('dnat', {
  id: 1,
  lan_addr: '192.168.1.100',
  lan_port: '80',
  wan_port: '3000',
  protocol: 'tcp',
  enabled: 'yes',
  comment: '改了备注',
  interface: 'adsl1'
});

// 错误：只传 comment 会报参数错误
await router.edit('dnat', {
  id: 1,
  comment: '改了备注'  // ❌ 缺少其他必填字段
});
```

### `router.del(funcName, param)`

删除数据，通常传 `{ id: xxx }`。

### `router.set(funcName, param)`

与 `edit` 等同（部分模块使用 `set` 动作名）。

## 可用模块列表（已探测到）

| 模块 | 类型 | 说明 | 支持操作 |
|------|------|------|---------|
| `upgrade` | 系统 | 系统升级信息 | show |
| `backup` | 系统 | 备份文件列表 | show |
| `wan` | 网络 | WAN 口配置 | show |
| `lan` | 网络 | LAN 口配置 | show |
| `dhcp_lease` | 网络 | DHCP 租约 | show add edit del |
| `dhcp_static` | 网络 | DHCP 静态绑定 | show add edit del |
| `monitor_lanip` | 网络 | LAN 在线设备 | show |
| `dnat` | 网络 | 端口映射 | show add edit del |
| `arp` | 网络 | ARP 绑定 | show add edit del |
| `vlan` | 网络 | VLAN 配置 | show |
| `simple_qos` | 流控 | 简单限速 | show add edit del |
| `acl` | 安全 | ACL 规则 | show add edit del |
| `url_redirect` | 安全 | URL 重定向 | show |
| `l2tp_client` | VPN | L2TP 客户端 | show |
| `pptp_client` | VPN | PPTP 客户端 | show |
| `pppoe_server` | 认证 | PPPoE 服务端 | show |
| `ddns` | 应用 | 动态域名 | show |
| `ipv6` | 应用 | IPv6 设置 | show |

## 常见问题

### 登录支持哪几种密码加密方式？

两种都支持：

| 方式 | pass 字段值 |
|------|------------|
| MD5 | `MD5(密码)`，如 `e10adc3949ba59abbe56e057f20f883e` |
| salt_11 | `Base64("salt_11" + 密码)`，如 `c2FsdF8xMWFiY2RlZmdoaWprbA==` |

SDK 默认使用 **MD5 方式**。

### 响应结果中 Result 值的含义

| Result | 含义 |
|--------|------|
| 10000 | 登录成功 |
| 30000 | 操作成功 |
| 30001 | 参数错误（字段名不对或缺少必填字段） |
| 30002 | 功能模块不存在或因其他原因失败 |
| 30006 | 未知的 TYPE 参数值 |