import crypto from 'node:crypto';
import { request } from 'node:http';

/**
 * 爱快软路由 API SDK
 * 封装登录、调用、查询等操作
 */
export class IKuaiClient {
  #baseUrl;
  #cookie = '';
  #loggedIn = false;
  #debug = false;

  /**
   * @param {string} baseUrl  路由器地址，如 http://10.10.10.1
   * @param {object} [options]
   * @param {boolean} [options.debug]  是否打印请求日志
   */
  constructor(baseUrl, options = {}) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#debug = options.debug ?? false;
  }

  /** MD5 工具 */
  static #md5(str) {
    return crypto.createHash('md5').update(String(str)).digest('hex');
  }

  /** 日志 */
  #log(...args) {
    if (this.#debug) console.log('[IKuaiSDK]', ...args);
  }

  /**
   * 底层 HTTP 请求
   */
  #fetch(path, options = {}) {
    const url = new URL(path, this.#baseUrl);
    const { method = 'POST', body, headers = {}, isFormData = false } = options;

    if (this.#cookie) {
      headers['Cookie'] = this.#cookie;
    }

    if (body) {
      if (isFormData) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded';
      } else {
        headers['Content-Type'] = 'application/json;charset=UTF-8';
      }
    }

    this.#log(`→ ${method} ${url.pathname}`, isFormData ? '(form)' : body);

    return new Promise((resolve, reject) => {
      const req = request(url, {
        method,
        headers,
        timeout: 8000,
      }, (res) => {
        // 保存 cookie（同名 cookie 替换，避免旧过期 session 干扰新登录）
        const setCookie = res.headers['set-cookie'];
        if (setCookie) {
          const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
          for (const c of cookies) {
            const name = c.split('=')[0];
            const value = c.split(';')[0];
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (this.#cookie.includes(name + '=')) {
              // 同名 cookie 替换为新值
              this.#cookie = this.#cookie.replace(new RegExp(escaped + '=[^;]*'), value);
            } else {
              this.#cookie += (this.#cookie ? '; ' : '') + value;
            }
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            this.#log(`← ${url.pathname}`, JSON.stringify(parsed).slice(0, 200));
            resolve(parsed);
          } catch {
            this.#log(`← ${url.pathname} (raw)`, data.slice(0, 200));
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });

      if (body) {
        req.write(isFormData ? body : JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * 登录路由器
   * @param {string} username
   * @param {string} password  明文密码
   */
  async login(username, password) {
    // 清空旧会话状态，防止过期 cookie 干扰新登录
    this.#cookie = '';
    this.#loggedIn = false;

    const passwd = IKuaiClient.#md5(password);
    const body = {
      username,
      passwd,
      pass: passwd,
      remember_password: true,
    };

    const result = await this.#fetch('/Action/login', {
      body,
      isFormData: false,
    });

    if (result?.Result === 10000) {
      this.#loggedIn = true;
      this.#log('登录成功');
      return true;
    }

    // 部分版本返回 30000 也算成功
    if (result?.Result === 30000) {
      this.#loggedIn = true;
      this.#log('登录成功');
      return true;
    }

    throw new Error(`登录失败: ${JSON.stringify(result)}`);
  }

  /**
   * 登出并清空会话状态（用于会话过期后重新登录前调用）
   */
  logout() {
    this.#cookie = '';
    this.#loggedIn = false;
  }

  /**
   * 通用 API 调用
   * @param {string} funcName  功能模块名
   * @param {string} action    操作类型（show/add/edit/del）
   * @param {object} [param]   参数对象
   */
  async call(funcName, action, param = {}) {
    if (!this.#loggedIn) throw new Error('请先调用 login()');

    const body = {
      func_name: funcName,
      action,
      param,
    };

    return await this.#fetch('/Action/call', { body });
  }

  /**
   * 查询数据（只读安全操作）
   * @param {string} funcName
   * @param {object} [param]  默认分页查全部
   */
  async show(funcName, param = {}) {
    const defaultParam = { TYPE: 'data,total', limit: '0,500', ORDER_BY: '', ORDER: '' };
    const merged = { ...defaultParam, ...param };
    return await this.call(funcName, 'show', merged);
  }

  /**
   * 新增数据（会记录返回的 RowId）
   */
  async add(funcName, param = {}) {
    return await this.call(funcName, 'add', param);
  }

  /**
   * 编辑数据
   */
  async edit(funcName, param = {}) {
    return await this.call(funcName, 'edit', param);
  }

  /** set 别名 */
  async set(funcName, param = {}) {
    return await this.call(funcName, 'set', param);
  }

  /**
   * 删除数据
   */
  async del(funcName, param = {}) {
    return await this.call(funcName, 'del', param);
  }

  /**
   * 获取系统信息
   */
  async getSystemInfo() {
    return await this.call('system', 'show', {});
  }

  /**
   * 获取系统状态（CPU/内存/流量）
   */
  async getSysStats() {
    return await this.call('sysstat', 'show', {});
  }

  /** 是否已登录 */
  get isLoggedIn() {
    return this.#loggedIn;
  }
}