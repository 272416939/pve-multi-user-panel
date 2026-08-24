import { request } from 'node:http';
import https from 'node:https';

/**
 * 爱快 V4 软路由 API SDK（REST /api/v4.0/ + Bearer Token）
 * 与 V3 SDK（ikuai-sdk.mjs）平行的薄传输层，不含业务逻辑。
 *
 * 真机实测（2026-08-24, 4.0.308）：
 * - V4 REST API 仅 HTTPS（http 入口对 /api/v4.0/* 硬 403），地址可带非 443 端口（未填默认 443）
 * - 认证 = Authorization: Bearer <令牌>（令牌在 Web 控制台「设备设置 → 登陆管理 → 个人API令牌」生成）
 * - 响应统一 { code: 0, message, results }，code=0 成功、非 0 业务失败（HTTP 仍 200）
 * - HTTP 401 = token 无效/过期；令牌为静态配置，不做重登重试
 */
export class IKuaiV4Client {
  #baseUrl;
  #token;
  #debug = false;
  #insecure = true;

  /**
   * @param {string} baseUrl  路由器地址，如 https://192.168.35.1 或 https://test.cn:58443
   * @param {object} [options]
   * @param {string} [options.token]  V4 API Token（Bearer）
   * @param {boolean} [options.debug]  是否打印请求日志
   * @param {boolean} [options.insecure]  https 时是否容忍自签证书（默认 true；false = 严格验证）
   */
  constructor(baseUrl, options = {}) {
    this.#baseUrl = String(baseUrl).replace(/\/+$/, '');
    this.#token = options.token || '';
    this.#debug = options.debug ?? false;
    this.#insecure = options.insecure !== false;
  }

  /** 日志 */
  #log(...args) {
    if (this.#debug) console.log('[IKuaiV4SDK]', ...args);
  }

  /** 组装 URL（自动补 /api/v4.0 前缀；query 参数跳过空值，自动编码） */
  #buildUrl(path, query = {}) {
    const p = path.startsWith('/api/') ? path : ('/api/v4.0' + (path.startsWith('/') ? path : '/' + path));
    const url = new URL(p, this.#baseUrl);
    Object.keys(query || {}).forEach(k => {
      const v = query[k];
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    return url;
  }

  /** 底层 HTTP 请求 */
  #fetch(method, path, options = {}) {
    const url = this.#buildUrl(path, options.query);
    const { body } = options;
    const headers = {};
    if (this.#token) headers['Authorization'] = 'Bearer ' + this.#token;
    if (body !== undefined) headers['Content-Type'] = 'application/json;charset=UTF-8';

    this.#log(`→ ${method} ${url.pathname}${url.search}`, body);

    // http/https 按协议自动选择请求模块；https 容忍自签证书时挂 rejectUnauthorized:false 的 Agent
    const isHttps = url.protocol === 'https:';
    const reqFn = isHttps ? https.request : request;
    const reqOptions = { method, headers, timeout: 8000 };
    if (isHttps && this.#insecure) {
      reqOptions.agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });
    }

    return new Promise((resolve, reject) => {
      const req = reqFn(url, reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          this.#log(`← ${method} ${url.pathname}`, res.statusCode, typeof parsed === 'string' ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200));
          resolve({ status: res.statusCode, data: parsed });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });

      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /**
   * 通用 API 请求：HTTP 状态 + 业务 code 双层校验
   * @param {string} method  GET/POST/PUT/PATCH/DELETE
   * @param {string} path    /api/v4.0/... 或相对路径
   * @param {object} [options]
   * @param {object} [options.query]  query 参数
   * @param {object} [options.body]   请求体
   * @returns {Promise<object>}  完整响应体（含 code/message/results）
   */
  async request(method, path, { query, body } = {}) {
    const { status, data } = await this.#fetch(method, path, { query, body });
    // HTTP 层：401 = token 无效/过期（不重试，令牌是静态配置）
    if (status === 401) {
      throw new Error('爱快 V4 认证失败：API Token 无效或已过期');
    }
    if (status >= 400) {
      const msg = (data && data.message) ? data.message : ('HTTP ' + status);
      throw new Error('爱快 V4 请求失败：' + msg);
    }
    // 业务层：HTTP 成功但 code != 0（文档：code=0 成功，非 0 业务失败）
    if (data && typeof data === 'object' && typeof data.code === 'number' && data.code !== 0) {
      const details = Array.isArray(data.details)
        ? ' (' + data.details.map(d => d.msg || d.message || JSON.stringify(d)).join('; ') + ')'
        : '';
      throw new Error((data.message || ('业务错误 code=' + data.code)) + details);
    }
    return data;
  }

  /** 查询（只读） */
  async get(path, query) {
    return this.request('GET', path, { query });
  }

  /** 新增 */
  async post(path, body) {
    return this.request('POST', path, { body });
  }

  /** 全量更新 */
  async put(path, body) {
    return this.request('PUT', path, { body });
  }

  /** 部分更新（启用/停用等） */
  async patch(path, body) {
    return this.request('PATCH', path, { body });
  }

  /** 删除 */
  async delete(path) {
    return this.request('DELETE', path);
  }
}
