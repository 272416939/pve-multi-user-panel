const nodemailer = require('nodemailer');

// 统一获取站点名称（管理端可自定义），供邮件主题/模板头部使用，避免硬编码面板名
async function getSiteName() {
    try {
        // 行内懒加载避免 utils 顶层依赖 api 层（规范第七节：utils 是叶子层）
        var db = require('../api/db');
        var name = await db.config.get('site:name');
        return name || '云服务控制台';
    } catch (e) {
        return '云服务控制台';
    }
}

function createEmailTemplate(title, content, siteName) {
    return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * {
                    margin: 0;
                    padding: 0;
                    box-sizing: border-box;
                }
                body {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
                    background: linear-gradient(135deg, #1a143a 0%, #2d1b4e 50%, #1a143a 100%);
                    min-height: 100vh;
                    padding: 20px;
                }
                .email-container {
                    max-width: 600px;
                    margin: 0 auto;
                    background: rgba(255, 255, 255, 0.95);
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                }
                .email-header {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    padding: 30px 20px;
                    text-align: center;
                }
                .email-header h1 {
                    color: white;
                    font-size: 24px;
                    font-weight: 600;
                    margin-bottom: 5px;
                }
                .email-header p {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 14px;
                }
                .email-content {
                    padding: 30px;
                    color: #2d3748;
                    line-height: 1.8;
                    font-size: 16px;
                }
                .email-content p {
                    margin-bottom: 16px;
                }
                .email-content a {
                    color: #667eea;
                    text-decoration: none;
                    font-weight: 500;
                }
                .email-content a:hover {
                    text-decoration: underline;
                }
                .email-content strong {
                    color: #667eea;
                    font-weight: 600;
                }
                .btn {
                    display: inline-block;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white !important;
                    padding: 14px 32px;
                    border-radius: 8px;
                    text-decoration: none !important;
                    font-weight: 600;
                    margin: 10px 0;
                    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
                }
                .divider {
                    height: 1px;
                    background: linear-gradient(90deg, transparent, #e2e8f0, transparent);
                    margin: 24px 0;
                }
                .email-footer {
                    background: #f7fafc;
                    padding: 20px 30px;
                    text-align: center;
                    color: #718096;
                    font-size: 13px;
                }
                .email-footer p {
                    margin-bottom: 8px;
                }
                .info-box {
                    background: linear-gradient(135deg, rgba(102, 126, 234, 0.1) 0%, rgba(118, 75, 162, 0.1) 100%);
                    border-left: 4px solid #667eea;
                    padding: 16px 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                .warning-box {
                    background: linear-gradient(135deg, rgba(246, 173, 85, 0.1) 0%, rgba(237, 100, 99, 0.1) 100%);
                    border-left: 4px solid #ed6463;
                    padding: 16px 20px;
                    border-radius: 8px;
                    margin: 20px 0;
                }
                /* 富文本编辑器（Quill）输出类兼容：真实邮件环境无 quill.snow.css，补齐对齐/缩进/字号类保证预览与发送一致 */
                .ql-align-center { text-align: center; }
                .ql-align-right { text-align: right; }
                .ql-align-justify { text-align: justify; }
                .ql-indent-1 { margin-left: 2em; }
                .ql-indent-2 { margin-left: 4em; }
                .ql-indent-3 { margin-left: 6em; }
                .ql-indent-4 { margin-left: 8em; }
                .ql-indent-5 { margin-left: 10em; }
                .ql-size-small { font-size: 0.75em; }
                .ql-size-large { font-size: 1.5em; }
                .ql-size-huge { font-size: 2.5em; }
                .email-content ol, .email-content ul { margin-left: 20px; }
                .email-content li { margin-bottom: 6px; }
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>${siteName || '云服务控制台'}</h1>
                    <p>${title}</p>
                </div>
                <div class="email-content">
                    ${content}
                </div>
                <div class="email-footer">
                    <p>此邮件由系统自动发送，请勿直接回复。</p>
                    <p>如有问题，请联系管理员。</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ---- SMTP 配置与 transporter 缓存（发送性能优化） ----
// 历史问题：每次发信都从 DB 读 SMTP 配置 + 新建 transporter（全新 TCP+TLS 连接）+ verify() 握手，
// 单封邮件 1~3 秒，且全部调用点 await 同步等待，导致购买/开通/验证码等接口被拖慢。
// 优化：单例 transporter（pool 连接复用）+ SMTP 配置内存缓存；配置变更时由 resetTransporterCache 失效。

let _smtpConfig = null;   // SMTP 配置缓存（含 strict_tls）
let _transporter = null;  // 单例 transporter（连接池复用）

// 获取 SMTP 配置（带内存缓存；SMTP 配置保存/测试后由 resetTransporterCache 失效）
async function getSmtpConfig() {
    if (_smtpConfig) return _smtpConfig;
    // 行内懒加载避免 utils 顶层依赖 api 层（规范第七节：utils 是叶子层）
    var db = require('../api/db');
    var config = await db.config.getSmtp();
    // SMTP TLS 验证：默认关闭（兼容自签证书），可在 SMTP 配置中开启
    var strictTls = false;
    try {
        var tlsVal = await db.config.get('smtp:strict_tls');
        strictTls = tlsVal === '1';
    } catch (e) {}
    _smtpConfig = Object.assign({}, config, { strictTls });
    return _smtpConfig;
}

// 失效 transporter 与 SMTP 配置缓存（SMTP 配置保存/测试时调用，下次发送自动重建）
function resetTransporterCache() {
    if (_transporter) {
        try {
            _transporter.close();
        } catch (e) {
            // 忽略关闭异常
        }
        _transporter = null;
    }
    _smtpConfig = null;
}

async function sendEmail(to, subject, html) {
    let config;
    try {
        config = await getSmtpConfig();
    } catch (e) {
        throw new Error('邮件发送失败: ' + e.message);
    }

    if (!config.enabled || !config.host || !config.user || !config.password) {
        throw new Error('SMTP 配置不完整或未启用');
    }

    try {
        if (!_transporter) {
            _transporter = nodemailer.createTransport({
                host: config.host,
                port: config.port,
                secure: config.secure,
                auth: {
                    user: config.user,
                    pass: config.password
                },
                tls: {
                    rejectUnauthorized: config.strictTls
                },
                // 连接池复用：避免每次发信新建 TCP+TLS 连接（历史上每次新建是性能瓶颈）
                pool: true,
                maxConnections: 3,
                maxMessages: 100
            });
        }

        // 构造发件人地址：优先使用配置的邮箱，未配置则使用 SMTP 用户名
        // 若配置了发件人名称，则使用 "名称 <邮箱>" 格式
        const fromEmail = config.from || config.user;
        const fromField = config.from_name
            ? `${config.from_name.replace(/[<>]/g, '').trim()} <${fromEmail}>`
            : fromEmail;

        const mailOptions = {
            from: fromField,
            to: to,
            subject: subject,
            html: html
        };

        return await _transporter.sendMail(mailOptions);
    } catch (error) {
        // 连接可能已失效（SMTP 重启/超时），重置 transporter 下次自动重建
        resetTransporterCache();
        console.error('发送邮件失败:', error);
        throw new Error('邮件发送失败: ' + error.message);
    }
}

/**
 * 检查用户是否允许接收某类邮件通知
 * @param {number} userId - 用户ID
 * @param {string} category - 通知类别（如 notify_vm_provisioned）
 * @returns {boolean} 是否允许发送
 */
async function shouldSendEmail(userId, category) {
    try {
        // 行内懒加载避免 utils 顶层依赖 api 层（规范第七节：utils 是叶子层）
        var db = require('../api/db');
        if (!userId || !category) return true;
        var settings = await db.userSettings.getByUserId(userId);
        // 总开关关闭 → 不发送
        if (settings.email_notifications_enabled === 0) return false;
        // 对应类别开关关闭 → 不发送
        if (settings[category] === 0) return false;
        return true;
    } catch (e) {
        // 查询失败时默认允许发送（不影响主流程）
        console.error('[email] shouldSendEmail 查询失败:', e.message);
        return true;
    }
}

module.exports = { createEmailTemplate, sendEmail, getSiteName, shouldSendEmail, resetTransporterCache };
