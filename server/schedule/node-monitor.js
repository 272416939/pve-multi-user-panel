/**
 * 节点连接监测（30s 周期）
 * - 遍历启用的爱快节点与 PVE 节点做轻量探测（不登录、无写操作），回写 latency_ms/last_ok_at/last_error
 *   爱快：HTTPS GET 根路径，任意 HTTP 响应即视为存活（避免 V3 每 30s 刷登录日志）
 *   PVE：GET /api2/json/access/version，401 也算存活（证明服务可达且响应正常）
 * - 手动「测试」按钮走完整鉴权测试（admin-ikuai-nodes/admin-pve-nodes 路由），失败显示具体原因
 */
const https = require('https');
const http = require('http');
const db = require('../api/db');

const INTERVAL_MS = 30 * 1000;
const PROBE_TIMEOUT_MS = 5000;
let _running = false;
const _lockToken = { value: null };

// 分布式锁（多实例部署防重复探测；无 Redis 直接执行）——tasks.js 同款 token 比对模式
async function acquireLock() {
    var redis = require('../api/redis').getRedisClient();
    if (!redis) return true; // 无 Redis 时跳过锁
    try {
        var token = require('crypto').randomBytes(16).toString('hex');
        var result = await redis.set('lock:node-monitor', token, 'EX', 25, 'NX');
        if (result === 'OK') {
            _lockToken.value = token;
            return true;
        }
        return false;
    } catch (_) {
        return true; // Redis 异常时不阻止执行
    }
}

async function releaseLock() {
    var redis = require('../api/redis').getRedisClient();
    if (!redis || !_lockToken.value) return;
    try {
        // Lua 原子比对删除：仅当锁值仍是本实例写入的 token 时才删除
        const LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";
        await redis.eval(LUA, 1, 'lock:node-monitor', _lockToken.value);
    } catch (_) {}
    _lockToken.value = null;
}

/**
 * 轻量探测：返回 { ok, latency_ms, error }
 * 任意 HTTP 状态码（含 401/302）都证明服务可达；只有网络层错误/超时才算失败
 */
function probeUrl(rawUrl, strictTls) {
    return new Promise((resolve) => {
        let url;
        try {
            url = new URL(rawUrl);
        } catch (_) {
            return resolve({ ok: false, latency_ms: null, error: '地址格式无效', code: 'PROBE_URL_INVALID' });
        }
        const isHttps = url.protocol === 'https:';
        const mod = isHttps ? https : http;
        const started = Date.now();
        let settled = false;
        const done = (result) => {
            if (settled) return;
            settled = true;
            resolve(result);
        };
        const req = mod.request(url, {
            method: 'GET',
            path: url.pathname + (url.search || ''),
            timeout: PROBE_TIMEOUT_MS,
            rejectUnauthorized: isHttps ? !!strictTls : undefined,
            headers: { 'User-Agent': 'pve-panel-node-monitor' }
        }, (res) => {
            // 收到任何 HTTP 响应头即存活；立刻断开不读 body
            res.resume();
            done({ ok: true, latency_ms: Date.now() - started, error: '' });
        });
        req.on('timeout', () => {
            req.destroy();
            done({ ok: false, latency_ms: null, error: '连接超时（' + (PROBE_TIMEOUT_MS / 1000) + '秒）' });
        });
        req.on('error', (err) => {
            var msg = err.code === 'ECONNREFUSED' ? '连接被拒绝'
                : err.code === 'ENOTFOUND' ? '域名无法解析'
                : err.code === 'ECONNRESET' ? '连接被重置'
                : err.code === 'CERT_HAS_EXPIRED' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ? 'TLS 证书校验失败'
                : (err.message || '网络错误');
            done({ ok: false, latency_ms: null, error: msg });
        });
        req.end();
    });
}

async function probeIkuaiNodes() {
    const nodes = await db.ikuaNodes.list();
    for (const n of nodes) {
        if (!n.enabled || !n.host) continue;
        const r = await probeUrl(n.host, !!n.strict_tls);
        try {
            await db.ikuaNodes.updateProbe(n.id, r.ok
                ? { latency_ms: r.latency_ms, ok: true, error: '' }
                : { latency_ms: null, ok: false, error: r.error });
        } catch (e) {
            console.error('[节点监测] 回写爱快节点状态失败 #' + n.id + ':', e.message);
        }
    }
}

async function probePveNodes() {
    const nodes = await db.pveNodes.list();
    for (const n of nodes) {
        if (!n.enabled || !n.api_host) continue;
        const base = String(n.api_host).replace(/\/+$/, '');
        // 未认证请求返回 401 即可达；证书校验强度按节点配置执行（严格模式自签失败会如实记录）
        const r = await probeUrl(base + '/api2/json/access/version', !!n.strict_tls);
        try {
            await db.pveNodes.updateProbe(n.id, r.ok
                ? { latency_ms: r.latency_ms, ok: true, error: '' }
                : { latency_ms: null, ok: false, error: r.error });
        } catch (e) {
            console.error('[节点监测] 回写 PVE 节点状态失败 #' + n.id + ':', e.message);
        }
    }
}

async function runOnce() {
    if (_running) return; // 单实例内防重入
    _running = true;
    try {
        await Promise.all([probeIkuaiNodes(), probePveNodes()]);
    } catch (e) {
        console.error('[节点监测] 执行失败:', e.message);
    } finally {
        _running = false;
    }
}

function initNodeMonitor() {
    // 启动后延迟 10s 首跑（避让启动高峰），之后每 30s 一轮
    setTimeout(() => {
        runOnce();
        setInterval(async () => {
            if (await acquireLock()) {
                try {
                    await runOnce();
                } finally {
                    await releaseLock();
                }
            }
        }, INTERVAL_MS);
    }, 10000);
}

module.exports = { initNodeMonitor, probeUrl };
