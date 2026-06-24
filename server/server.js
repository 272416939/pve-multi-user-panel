const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const pkg = require('../package.json');
const { WebSocket } = require('ws');
require('dotenv').config();
const crypto = require('crypto');
const { authMiddleware } = require('./middleware/auth');
const { checkRateLimit } = require('./middleware/rate-limiter');

// 统一设置服务器时区为 Asia/Shanghai，确保 new Date() 和数据库时间写入一致
process.env.TZ = process.env.TZ || 'Asia/Shanghai';

// 检查 .env 文件是否存在
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');
if (!fs.existsSync(envPath)) {
    console.error('\n[错误] 未找到 .env 配置文件！');
    if (fs.existsSync(envExamplePath)) {
        console.error('[提示] 请复制 .env.example 为 .env 并填写配置：');
        console.error('       cp .env.example .env\n');
    } else {
        console.error('[提示] 请在项目根目录创建 .env 文件并填写配置\n');
    }
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// MISC-1 修复：仅信任一层代理（防止 req.ip 伪造绕过限速）
app.set('trust proxy', 1);
// MISC-9 修复：禁用 X-Powered-By 头，不暴露框架信息
app.disable('x-powered-by');

// EJS 模板引擎配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(cors({
    origin: function (origin, callback) {
        // MISC-4 修复：精确匹配 protocol+host+port，不再按 hostname 宽松放行
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
        if (process.env.SITE_URL) {
            allowedOrigins.push(process.env.SITE_URL.replace(/\/+$/, ''));
        }
        allowedOrigins.push('http://localhost:3002');
        allowedOrigins.push('http://127.0.0.1:3002');

        if (!origin) return callback(null, true);
        if (allowedOrigins.some(o => o.trim() === origin)) {
            return callback(null, true);
        }
        console.warn('[cors] blocked origin:', origin);
        callback(new Error('CORS policy: Origin not allowed'));
    },
    credentials: true
}));
// MISC-10 修复：body 限制从 10mb 降至 1mb
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

app.use((req, res, next) => {
    // XSS-4 修复：生成 per-request CSP nonce，替换 unsafe-inline
    const cspNonce = crypto.randomBytes(16).toString('base64');
    res.locals.cspNonce = cspNonce;

    const origSetHeader = res.setHeader;
    res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'expires') return;
        return origSetHeader.call(this, name, value);
    };
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    // XSS-4 修复：script-src 使用 nonce 替代 unsafe-inline（保留 unsafe-eval 供 Vue 运行时模板编译）
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'nonce-" + cspNonce + "' 'unsafe-eval' https://jsd.owoser.cn",
        "style-src 'self' 'unsafe-inline' https://jsd.owoser.cn https://fonts.loli.net",
        "font-src 'self' https://gstatic.loli.net",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' ws: wss: https:",
        "frame-ancestors 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'"
    ].join('; '));
    next();
});

app.use(express.static(path.join(__dirname, '../public'), {
    setHeaders: (res, filePath) => {
        res.removeHeader('Expires');
        if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));
// 自动注入JS缓存版本号：HTML中 ?v=xxx 统一替换为当前 package.json 版本
app.use((req, res, next) => {
    const isEjsPage = ['/admin', '/dashboard', '/user-center', '/login'].includes(req.path);
    if (!req.path.endsWith('.html') && !isEjsPage) return next();
    const origSend = res.send.bind(res);
    res.send = function (body) {
        if (typeof body === 'string' && body.includes('<script')) {
            body = body.replace(/\?v=[^"'\s]*/g, '?v=' + pkg.version);
        }
        return origSend(body);
    };
    next();
});
app.use('/images', express.static(path.join(__dirname, '../images'), {
    setHeaders: (res) => {
        res.removeHeader('Expires');
        res.setHeader('Cache-Control', 'public, max-age=3600');
    }
}));

// 版本号接口（需认证）
app.get('/api/version', authMiddleware, (req, res) => {
    res.json({ version: pkg.version });
});

// 公开接口：获取站点配置（供前端和登录页使用）
app.get('/api/site/config', async (req, res) => {
    try {
        var db = require('./api/db');
        var name = await db.config.get('site:name') || 'PVE 多用户控制面板';
        var logoText = await db.config.get('site:logo_text') || 'PVE 面板';
        var loginTitle = await db.config.get('site:login_title') || 'PVE Panel';
        var registerEnabled = await db.config.get('register:enabled') || '0';
        res.json({
            name: name,
            logo_text: logoText,
            login_title: loginTitle,
            register_enabled: registerEnabled === '1'
        });
    } catch (e) {
        res.json({
            name: 'PVE 多用户控制面板',
            logo_text: 'PVE 面板',
            login_title: 'PVE Panel',
            register_enabled: false
        });
    }
});

// MISC-5 修复：全局 API 限速（每 IP 每分钟 300 次请求）
app.use('/api', async (req, res, next) => {
    try {
        var limit = await checkRateLimit('ratelimit:global:' + req.ip, 300, 60000);
        if (!limit.allowed) {
            return res.status(429).json({ error: '请求过于频繁，请稍后再试' });
        }
    } catch (e) {
        // 限速器异常不应阻断请求
    }
    next();
});

app.use('/api', require('./routes/auth'));
app.use('/api', require('./routes/user'));
app.use('/api', require('./routes/admin-user'));
app.use('/api', require('./routes/vm'));
app.use('/api', require('./routes/lxc'));
app.use('/api', require('./routes/snapshot'));
app.use('/api', require('./routes/backup'));
app.use('/api', require('./routes/cdk'));
app.use('/api', require('./routes/message'));
app.use('/api', require('./routes/admin-config'));
app.use('/api', require('./routes/network'));
app.use('/api', require('./routes/wallet'));
app.use('/api', require('./routes/admin-wallet'));
app.use('/api', require('./routes/ikuai'));
app.use('/api', require('./routes/template'));
app.use('/api', require('./routes/package'));

const vncProxy = require('./websocket/vnc-proxy');
const terminalProxy = require('./websocket/terminal-proxy');
const pushProxy = require('./websocket/push-proxy');

const httpServer = http.createServer(app);

httpServer.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    if (url.pathname === '/vnc-proxy') {
        vncProxy.handleUpgrade(request, socket, head, (ws) => {
            vncProxy.emit('connection', ws, request);
        });
    } else if (url.pathname === '/term-proxy') {
        terminalProxy.handleUpgrade(request, socket, head, (ws) => {
            terminalProxy.emit('connection', ws, request);
        });
    } else if (url.pathname === '/ws/push') {
        pushProxy.handleUpgrade(request, socket, head, (ws) => {
            pushProxy.emit('connection', ws, request);
        });
    } else {
        socket.destroy();
    }
});

// EJS 渲染中间件：注入站点配置到 res.locals.siteConfig
// 优先 Redis 缓存（多实例一致），回退到进程内存缓存
app.locals.siteConfigCache = { data: null, expires: 0 };
var redisClient = require('./api/redis').getRedisClient();
var SITE_CONFIG_REDIS_KEY = 'site_config';
var SITE_CONFIG_TTL = 60; // 秒

async function getSiteConfigCached() {
    var now = Date.now();
    var cache = app.locals.siteConfigCache;
    // 1. 进程内存缓存（最快）
    if (cache.data && now < cache.expires) {
        return cache.data;
    }
    // 2. Redis 缓存（多实例一致）
    if (redisClient) {
        try {
            var cached = await redisClient.get(SITE_CONFIG_REDIS_KEY);
            if (cached) {
                var parsed = JSON.parse(cached);
                cache.data = parsed;
                cache.expires = now + SITE_CONFIG_TTL * 1000;
                return parsed;
            }
        } catch (e) {
            console.warn('[site-config] Redis 读取失败，回退到数据库:', e.message);
        }
    }
    // 3. 数据库查询
    try {
        var db = require('./api/db');
        var name = await db.config.get('site:name') || 'PVE 多用户控制面板';
        var logoText = await db.config.get('site:logo_text') || 'PVE 面板';
        var loginTitle = await db.config.get('site:login_title') || 'PVE Panel';
        var data = { name: name, logo_text: logoText, login_title: loginTitle };
        cache.data = data;
        cache.expires = now + SITE_CONFIG_TTL * 1000;
        // 写入 Redis
        if (redisClient) {
            try { await redisClient.set(SITE_CONFIG_REDIS_KEY, JSON.stringify(data), 'EX', SITE_CONFIG_TTL); } catch (e) {}
        }
        return data;
    } catch (e) {
        return { name: 'PVE 多用户控制面板', logo_text: 'PVE 面板', login_title: 'PVE Panel' };
    }
}

app.use(async (req, res, next) => {
    try {
        res.locals.siteConfig = await getSiteConfigCached();
    } catch (e) {
        res.locals.siteConfig = { name: 'PVE 多用户控制面板', logo_text: 'PVE 面板', login_title: 'PVE Panel' };
    }
    next();
});

// 旧 URL 重定向到 EJS 路由
app.get('/admin.html', (req, res) => res.redirect(301, '/admin'));
app.get('/dashboard.html', (req, res) => res.redirect(301, '/dashboard'));
app.get('/user-center.html', (req, res) => res.redirect(301, '/user-center'));
app.get('/login.html', (req, res) => res.redirect(301, '/login'));
app.get('/vnc.html', (req, res) => res.redirect(301, '/vnc'));
app.get('/terminal.html', (req, res) => res.redirect(301, '/terminal'));

// EJS 页面路由
app.get('/admin', (req, res) => res.render('pages/admin', { title: '管理后台', page: 'admin' }));
app.get('/dashboard', (req, res) => res.render('pages/dashboard', { title: '仪表盘', page: 'dashboard' }));
app.get('/user-center', (req, res) => res.render('pages/user-center', { title: '用户中心', page: 'user-center' }));
app.get('/login', (req, res) => res.render('pages/login', { title: '登录', page: 'login' }));
app.get('/vnc', (req, res) => res.render('pages/vnc'));
app.get('/terminal', (req, res) => res.render('pages/terminal'));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// 全局错误处理：确保 API 返回 JSON 而非 HTML
app.use((err, req, res, next) => {
    console.error('[error]', err.message || err);
    if (req.path.startsWith('/api/')) {
        var errMsg = (process.env.DEBUG === 'true') ? (err.message || '服务器内部错误') : '服务器内部错误';
        return res.status(err.status || 500).json({ error: errMsg });
    }
    res.status(500).send('服务器内部错误');
});

httpServer.listen(PORT, async () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);

    try {
        const { getRedisClient } = require('./api/redis');
        const redis = getRedisClient();
        app.locals.redis = redis;
        if (!redis) {
            console.log('[redis] 未配置 REDIS_HOST，使用进程内存模式');
        }
    } catch (e) {
        console.warn('[redis] 初始化异常:', e.message);
        app.locals.redis = null;
    }

    console.log(`[system] 当前系统版本：v${pkg.version}`);

    // 初始化数据库（建表+迁移，MySQL 唯一驱动）
    const db = require('./api/db');
    try {
        await db.initDb();
    } catch (error) {
        console.error('[数据库] MySQL 初始化失败:', error.message);
        process.exit(1);
    }

    try {
        const pveApi = require('./api/pve-api');
        await pveApi.detectNode();
    } catch (error) {
        console.error('启动时检测节点失败:', error);
    }

    require('./schedule/tasks').initScheduledTasks();
});
