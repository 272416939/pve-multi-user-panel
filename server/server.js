const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');
const pkg = require('../package.json');
const { WebSocket } = require('ws');
require('dotenv').config();

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

// R3-2 补充: 反向代理环境下 req.ip 需要信任代理头才能获取真实客户端IP
app.set('trust proxy', true);

// EJS 模板引擎配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
        // 自动将 SITE_URL 加入白名单（按 hostname 匹配，忽略端口差异）
        let siteHost = '';
        if (process.env.SITE_URL) {
            try {
                siteHost = new URL(process.env.SITE_URL).hostname;
                allowedOrigins.push(process.env.SITE_URL.replace(/\/+$/, ''));
            } catch (_) {}
        }
        allowedOrigins.push('http://localhost:3002');
        allowedOrigins.push('http://127.0.0.1:3002');

        if (!origin) return callback(null, true);
        // 精确匹配或同 hostname（端口不同也放行）
        if (allowedOrigins.some(o => o.trim() === origin)) {
            return callback(null, true);
        }
        if (siteHost) {
            try {
                if (new URL(origin).hostname === siteHost) {
                    return callback(null, true);
                }
            } catch (_) {}
        }
        console.warn('[cors] blocked origin:', origin, 'siteHost:', siteHost);
        callback(new Error('CORS policy: Origin not allowed'));
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
    const origSetHeader = res.setHeader;
    res.setHeader = function (name, value) {
        if (name.toLowerCase() === 'expires') return;
        return origSetHeader.call(this, name, value);
    };
    res.removeHeader('X-Frame-Options');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    // L-4 修复：CSP 策略（允许项目依赖的 CDN 资源）
    res.setHeader('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
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
        if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        } else if (filePath.endsWith('.js')) {
            res.setHeader('Cache-Control', 'no-cache');
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

// 版本号接口（无需认证）
app.get('/api/version', (req, res) => {
    res.json({ version: pkg.version });
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
        return res.status(err.status || 500).json({ error: err.message || '服务器内部错误' });
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

    // MySQL 模式下异步初始化数据库（建表+迁移）
    const db = require('./api/db');
    if (process.env.DB_TYPE === 'mysql' && db.initDb) {
        try {
            await db.initDb();
        } catch (error) {
            console.error('[数据库] MySQL 初始化失败:', error.message);
            process.exit(1);
        }
    }

    try {
        const pveApi = require('./api/pve-api');
        await pveApi.detectNode();
    } catch (error) {
        console.error('启动时检测节点失败:', error);
    }

    require('./schedule/tasks').initScheduledTasks();
});
