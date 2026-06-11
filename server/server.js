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

app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
        allowedOrigins.push('http://localhost:3002');
        allowedOrigins.push('http://127.0.0.1:3002');

        if (!origin || allowedOrigins.some(o => origin === o.trim())) {
            callback(null, true);
        } else {
            callback(new Error('CORS policy: Origin not allowed'));
        }
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
        } else {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));
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

const vncProxy = require('./websocket/vnc-proxy');
const terminalProxy = require('./websocket/terminal-proxy');

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
    } else {
        socket.destroy();
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

httpServer.listen(PORT, async () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log(`[system] 当前系统版本：v${pkg.version}`);

    try {
        const pveApi = require('./api/pve-api');
        await pveApi.detectNode();
    } catch (error) {
        console.error('启动时检测节点失败:', error);
    }

    require('./schedule/tasks').initScheduledTasks();
});
