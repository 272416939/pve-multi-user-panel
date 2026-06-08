const nodemailer = require('nodemailer');
const db = require('../api/db-sqlite');

function createEmailTemplate(title, content) {
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
            </style>
        </head>
        <body>
            <div class="email-container">
                <div class="email-header">
                    <h1>PVE 多用户控制面板</h1>
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

async function sendEmail(to, subject, html) {
    const config = db.config.getSmtp();
    
    if (!config.enabled || !config.host || !config.user || !config.password) {
        throw new Error('SMTP 配置不完整或未启用');
    }
    
    try {
        const transporter = nodemailer.createTransport({
            host: config.host,
            port: config.port,
            secure: config.secure,
            auth: {
                user: config.user,
                pass: config.password
            },
            tls: {
                rejectUnauthorized: false
            }
        });
        
        await transporter.verify();
        
        const mailOptions = {
            from: config.from || config.user,
            to: to,
            subject: subject,
            html: html
        };
        
        return await transporter.sendMail(mailOptions);
    } catch (error) {
        console.error('发送邮件失败:', error);
        throw new Error('邮件发送失败: ' + error.message);
    }
}

module.exports = { createEmailTemplate, sendEmail };
