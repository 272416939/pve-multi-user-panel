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

// 注册 process 级错误处理，防止 unhandledRejection/uncaughtException 导致进程无日志退出
process.on('unhandledRejection', (reason, promise) => {
    console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.stack || err.message || err);
    process.exit(1);
});

const app = express();
const PORT = process.env.PORT || 3000;

// MISC-1 修复：仅信任一层代理（防止 req.ip 伪造绕过限速）
app.set('trust proxy', 1);
// MISC-9 修复：禁用 X-Powered-By 头，不暴露框架信息
app.disable('x-powered-by');

// 生产环境标记（启用模板缓存、错误信息脱敏等 Express 内置优化）
if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
    console.log('[system] NODE_ENV 未设置，已自动设为 production（启用模板缓存等优化）');
}

// EJS 模板引擎配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
// 启用模板缓存：编译后的模板函数缓存在内存，避免每次请求重新读磁盘+编译
app.set('view cache', true);

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
    // 优化：静态资源文件跳过 CSP nonce 生成（减少 crypto 开销）
    var ext = req.path.split('.').pop();
    if (['js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'woff', 'woff2', 'ttf', 'map'].includes(ext)) {
        return next();
    }
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
    // 安全响应头补充
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    // HSTS：仅在 HTTPS 请求时设置（避免 HTTP 开发环境冲突）
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
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
    etag: true,
    lastModified: true,
    maxAge: '1h',
    setHeaders: (res, filePath) => {
        res.removeHeader('Expires');
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
            res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
        } else if (filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.gif') || filePath.endsWith('.svg') || filePath.endsWith('.ico')) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        } else if (filePath.endsWith('.woff') || filePath.endsWith('.woff2') || filePath.endsWith('.ttf')) {
            res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
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

// 健康检查端点（供负载均衡器/K8s 探测，无需认证）
app.get('/health', (req, res) => {
    res.json({ status: 'ok', version: pkg.version, timestamp: new Date().toISOString() });
});

// 公开接口：获取站点配置（供前端和登录页使用）
// 优化：使用站点配置缓存，避免每次请求查 4 次数据库
app.get('/api/site/config', async (req, res) => {
    try {
        var data = await getSiteConfigCached();
        var db = require('./api/db');
        var registerEnabled = await db.config.get('register:enabled') || '0';
        res.json({
            name: data.name,
            logo_text: data.logo_text,
            login_title: data.login_title,
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
// 优化：API 请求和静态资源请求跳过，只对页面渲染请求执行
app.locals.siteConfigCache = { data: null, expires: 0 };
function getRedisClient() { return require('./api/redis').getRedisClient(); }
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
    var redis = getRedisClient();
    if (redis) {
        try {
            var cached = await redis.get(SITE_CONFIG_REDIS_KEY);
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
        if (redis) {
            try { await redis.set(SITE_CONFIG_REDIS_KEY, JSON.stringify(data), 'EX', SITE_CONFIG_TTL); } catch (e) {}
        }
        return data;
    } catch (e) {
        return { name: 'PVE 多用户控制面板', logo_text: 'PVE 面板', login_title: 'PVE Panel' };
    }
}

// 优化：只对页面渲染请求（/admin /dashboard 等）执行站点配置查询，API 和静态资源跳过
app.use(async (req, res, next) => {
    // API 请求、静态文件、WebSocket 升级请求跳过
    if (req.path.startsWith('/api/') || req.path.startsWith('/images/') ||
        req.path.startsWith('/shared/') || req.path.startsWith('/css/') ||
        req.path.startsWith('/js/') || req.path.startsWith('/components/') ||
        req.path.startsWith('/novnc/') || req.path.startsWith('/health')) {
        return next();
    }
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
app.get('/vnc', async (req, res) => {
    const sessionId = req.query.session;
    if (!sessionId) {
        return res.render('pages/vnc', { error: '缺少会话参数' });
    }
    const consoleSession = require('./utils/console-session');
    const sessionData = await consoleSession.getSession(sessionId);
    if (!sessionData) {
        return res.render('pages/vnc', { error: '会话已失效，请重新打开控制台' });
    }
    res.render('pages/vnc', {
        ticket: sessionData.ticket,
        vmid: String(sessionData.vmid),
        type: sessionData.subtype || sessionData.type || 'qemu'
    });
});
app.get('/terminal', async (req, res) => {
    const sessionId = req.query.session;
    if (!sessionId) {
        return res.render('pages/terminal', { vmid: '', error: '缺少会话参数' });
    }
    const consoleSession = require('./utils/console-session');
    const sessionData = await consoleSession.getSession(sessionId);
    if (!sessionData) {
        return res.render('pages/terminal', { vmid: '', error: '会话已失效，请重新打开终端' });
    }
    res.render('pages/terminal', { vmid: String(sessionData.vmid) });
});

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

    console.log(`[system] 当前系统版本：v${pkg.version}`);

    // 初始化数据库（建表+迁移，MySQL 唯一驱动）
    const db = require('./api/db');
    try {
        await db.initDb();
    } catch (error) {
        console.error('[数据库] MySQL 初始化失败:', error.message);
        process.exit(1);
    }

    // 从 DB 加载 Redis 配置，写入 process.env 后初始化连接
    try {
        var redisConfig = await db.config.getRedis();
        if (redisConfig && redisConfig.host) {
            process.env.REDIS_HOST = redisConfig.host;
            process.env.REDIS_PORT = String(redisConfig.port || 6379);
            process.env.REDIS_PASSWORD = redisConfig.password || '';
            process.env.REDIS_DB = String(redisConfig.db || 0);
            process.env.REDIS_PREFIX = redisConfig.prefix || 'pve:';
        } else {
            // 未配置 Redis 地址，确保 REDIS_HOST 不存在（disable Redis）
            delete process.env.REDIS_HOST;
        }
        const redisModule = require('./api/redis');
        redisModule.resetClient(); // 断开旧连接（如有），强制下次 getRedisClient 重新连接
        const redisClient = redisModule.getRedisClient();
        app.locals.redis = redisClient;
        if (!redisClient) {
            console.log('[redis] 未配置 Redis，使用进程内存模式');
        }
    } catch (e) {
        console.warn('[redis] 初始化异常:', e.message);
        app.locals.redis = null;
    }

    try {
        const pveApi = require('./api/pve-api');
        await pveApi.detectNode();
    } catch (error) {
        console.error('启动时检测节点失败:', error);
    }

    require('./schedule/tasks').initScheduledTasks();
});
