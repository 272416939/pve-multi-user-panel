/**
 * 邮件模板注册表（单一来源）
 *
 * 所有系统邮件的默认模板定义集中于此，与 RATE_LIMIT_RULES 注册表模式一致：
 * - initDb() 启动时按 code 唯一键 INSERT IGNORE 写入 email_templates 表（已存在不覆盖，保留管理员修改）
 * - 运行时 getTemplate(code) = DB 有则用 DB（可编辑）；DB 缺失回退本注册表默认（兜底，保证邮件必达）
 * - 「恢复默认」= 用本文件默认值覆盖 DB 记录
 *
 * 模板字段说明：
 * - code     唯一标识（与调用点 sendTemplateEmail(to, code, vars) 对应）
 * - name     显示名称（管理端列表展示）
 * - category 分类：auth（认证）/ notice（资源通知）/ billing（账单）/ reminder（到期提醒）/ system（系统）
 * - subject  邮件主题，支持 {变量}
 * - title    邮件头部 h1（站点名）下方的副标题，支持 {变量}
 * - content  正文 HTML 片段（套共享外壳），支持 {变量}
 * - variables 模板声明的变量白名单 [{name, label, example, group}]：前端变量面板展示 + 后端保存校验
 *
 * 通用变量（渲染时自动注入，无需在 variables 中声明，前端面板统一展示）：
 * - {site_name} 站点名称（db.config site:name）
 * - {now}       当前时间（new Date().toLocaleString('zh-CN')）
 * - {site_url}  站点 URL（process.env.SITE_URL）
 *
 * 变量替换规则（services/email-template.js renderTemplate）：
 * - 只替换本模板 variables 声明 + 通用变量；未知 {xxx} 保留原文并 console.warn（保存接口另有白名单校验）
 * - subject/title 中的变量值做 HTML 实体转义；content 原样插入
 * - 值为空的变量所在行（独占行或行内唯一变量、无嵌套标签）自动折叠，如"续费价格："行
 */

// 分类定义（管理端分组展示）
const EMAIL_TEMPLATE_CATEGORIES = [
    { key: 'auth', label: '认证类' },
    { key: 'notice', label: '资源通知' },
    { key: 'billing', label: '账单类' },
    { key: 'reminder', label: '到期提醒' },
    { key: 'system', label: '系统通知' }
];

/**
 * 邮件外壳样式参数（单一来源）
 * - 管理端「邮件外壳样式」参数化面板展示与校验
 * - initDb() 时写入 config 表默认键（mail:shell_<key>）
 * - createEmailTemplate 渲染时按参数生成 <style>（缺省回退 default）
 * - custom_css 为高级模式：追加到 <style> 末尾的 CSS 源码
 */
const EMAIL_SHELL_PARAMS = [
    { key: 'header_from', label: '头部渐变起始色', group: '头部', type: 'color', default: '#667eea' },
    { key: 'header_to', label: '头部渐变结束色', group: '头部', type: 'color', default: '#764ba2' },
    { key: 'header_text', label: '头部标题文字色', group: '头部', type: 'color', default: '#ffffff' },
    { key: 'card_bg', label: '卡片背景色', group: '卡片', type: 'color', default: '#ffffff' },
    { key: 'card_radius', label: '卡片圆角（px）', group: '卡片', type: 'number', default: 16, min: 0, max: 40 },
    { key: 'btn_from', label: '按钮渐变起始色', group: '按钮', type: 'color', default: '#667eea' },
    { key: 'btn_to', label: '按钮渐变结束色', group: '按钮', type: 'color', default: '#764ba2' },
    { key: 'btn_text', label: '按钮文字色', group: '按钮', type: 'color', default: '#ffffff' },
    { key: 'footer_bg', label: '页脚背景色', group: '页脚', type: 'color', default: '#f7fafc' },
    { key: 'footer_text', label: '页脚文字色', group: '页脚', type: 'color', default: '#718096' },
    { key: 'footer_note', label: '页脚第一行文案', group: '页脚', type: 'text', default: '此邮件由系统自动发送，请勿直接回复。', maxLen: 100 },
    { key: 'footer_contact', label: '页脚第二行文案', group: '页脚', type: 'text', default: '如有问题，请联系管理员。', maxLen: 100 },
    { key: 'custom_css', label: '自定义样式（高级）', group: '高级', type: 'css', default: '', maxLen: 8000 }
];

// 通用变量（渲染自动注入；前端变量面板统一展示）
const GLOBAL_VARIABLES = [
    { name: 'site_name', label: '站点名称', example: '云服务控制台', group: '系统' },
    { name: 'now', label: '当前时间', example: '2026-08-12 14:30:00', group: '时间' },
    { name: 'site_url', label: '站点地址', example: 'https://example.com', group: '系统' }
];

// 常用变量快捷定义（减少重复）
const V_USER = [
    { name: 'username', label: '用户昵称', example: '张三', group: '用户' }
];
const V_RESOURCE = [
    { name: 'resource_name', label: '资源名称', example: 'web-server-01', group: '资源' },
    { name: 'resource_id', label: '资源 ID', example: '1001', group: '资源' }
];
const V_TIME = [
    { name: 'expire_time', label: '到期时间', example: '2026-12-31 23:59:59', group: '时间' }
];
const V_MONEY = [
    { name: 'amount', label: '金额（元）', example: '100.00', group: '金额' },
    { name: 'balance_before', label: '变动前余额', example: '500.00', group: '金额' },
    { name: 'balance_after', label: '变动后余额', example: '400.00', group: '金额' }
];
const V_ORDER = [
    { name: 'order_no', label: '订单号', example: 'ORD20260812001', group: '订单' }
];

const EMAIL_TEMPLATES = {

    // ==================== 认证类（同步发送，即时反馈） ====================

    password_reset: {
        code: 'password_reset',
        name: '密码重置',
        category: 'auth',
        subject: '密码重置',
        title: '密码重置请求',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <p>我们收到了您的密码重置请求。</p>
            <p>请点击下方按钮重置您的密码：</p>
            <p style="text-align: center;">
                <a href="{link}" class="btn" target="_blank">重置密码</a>
            </p>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                如果按钮无法点击，请复制以下链接到浏览器：<br>
                <a href="{link}" style="word-break: break-all;">{link}</a>
            </p>
            <div class="info-box">
                <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快操作。</p>
            </div>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                <strong>如果您没有请求重置密码</strong>，请忽略此邮件，您的密码不会被修改。
            </p>`,
        variables: V_USER.concat([
            { name: 'link', label: '重置链接', example: 'https://example.com/?resetPassword=xxx', group: '链接' }
        ])
    },

    password_reset_not_found: {
        code: 'password_reset_not_found',
        name: '密码重置（邮箱未注册提示）',
        category: 'auth',
        subject: '密码重置请求 - {site_name}',
        title: '未找到使用此邮箱的账号',
        content: `
            <p>您好，</p>
            <p>我们收到了使用此邮箱地址重置密码的请求，但<strong>该邮箱未绑定任何账号，或尚未完成邮箱验证</strong>。</p>
            <p>可能的原因：</p>
            <ul style="margin-left: 20px; color: #4a5568;">
                <li>注册时使用的是其他邮箱地址（常见于有多个邮箱、记混了绑定邮箱的情况）</li>
                <li>绑定了此邮箱但未完成邮箱验证</li>
            </ul>
            <div class="info-box">
                <p style="margin-bottom: 0;">请返回密码重置页面，<strong>确认注册时使用的邮箱地址后重试</strong>。</p>
            </div>
            <div class="divider"></div>
            <p style="color: #999; font-size: 12px;">
                如果您没有发起过密码重置请求，请忽略此邮件。<br>
                为保护账号隐私，我们不会在网页上提示邮箱是否已注册，特以此邮件说明。
            </p>`,
        variables: []
    },

    register_code: {
        code: 'register_code',
        name: '注册验证码',
        category: 'auth',
        subject: '注册验证码 - {site_name}',
        title: '注册验证码 - {site_name}',
        content: `
            <p>您好，您正在进行账号注册，验证码为：</p>
            <div style="text-align:center;margin:20px 0;">
                <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#7c3aed;background:#f5f3ff;padding:12px 24px;border-radius:8px;display:inline-block;">{code}</span>
            </div>
            <p style="color:#666;">验证码有效期为 10 分钟，请尽快使用。</p>
            <p style="color:#999;font-size:12px;">如非本人操作，请忽略此邮件。</p>`,
        variables: [
            { name: 'code', label: '验证码', example: '123456', group: '链接' }
        ]
    },

    email_verify_rebind: {
        code: 'email_verify_rebind',
        name: '邮箱换绑验证',
        category: 'auth',
        subject: '邮箱换绑验证 - {site_name}',
        title: '请验证您的新邮箱',
        content: `
            <p>您好，{username}！</p>
            <p>您正在将当前账号的绑定邮箱更换为：</p>
            <div style="text-align:center;margin:20px 0;">
                <span style="font-size:18px;font-weight:bold;color:#7c3aed;background:#f5f3ff;padding:10px 20px;border-radius:8px;display:inline-block;word-break:break-all;">{email}</span>
            </div>
            <p>请点击下方按钮确认完成换绑：</p>
            <p style="text-align: center;">
                <a href="{link}" class="btn" target="_blank">确认换绑邮箱</a>
            </p>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                如果按钮无法点击，请复制以下链接到浏览器：<br>
                <a href="{link}" style="word-break: break-all;">{link}</a>
            </p>
            <div class="info-box">
                <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快完成换绑。</p>
            </div>
            <div class="warning-box">
                <p style="margin-bottom: 0;"><strong>安全提醒：</strong>如非您本人操作，请立即修改账号密码并联系管理员，以防账号被他人接管。</p>
            </div>`,
        variables: V_USER.concat([
            { name: 'email', label: '新邮箱', example: 'user@example.com', group: '用户' },
            { name: 'link', label: '验证链接', example: 'https://example.com/api/user/verify-email/xxx', group: '链接' }
        ])
    },

    email_verify_resend: {
        code: 'email_verify_resend',
        name: '邮箱验证（重发）',
        category: 'auth',
        subject: '邮箱验证 - {site_name}',
        title: '请验证您的邮箱',
        content: `
            <p>您好，{username}！</p>
            <p>您正在进行邮箱验证，请点击下方按钮完成验证：</p>
            <p style="text-align: center;">
                <a href="{link}" class="btn" target="_blank">验证邮箱地址</a>
            </p>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                如果按钮无法点击，请复制以下链接到浏览器：<br>
                <a href="{link}" style="word-break: break-all;">{link}</a>
            </p>
            <div class="info-box">
                <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快验证。</p>
            </div>`,
        variables: V_USER.concat([
            { name: 'link', label: '验证链接', example: 'https://example.com/api/user/verify-email/xxx', group: '链接' }
        ])
    },

    email_verify_first: {
        code: 'email_verify_first',
        name: '邮箱验证（首次绑定）',
        category: 'auth',
        subject: '邮箱验证 - {site_name}',
        title: '请验证您的邮箱',
        content: `
            <p>您好，{username}！</p>
            <p>感谢您注册 {site_name}！</p>
            <p>请点击下方按钮验证您的邮箱地址：</p>
            <p style="text-align: center;">
                <a href="{link}" class="btn" target="_blank">验证邮箱地址</a>
            </p>
            <div class="divider"></div>
            <p style="color: #718096; font-size: 14px;">
                如果按钮无法点击，请复制以下链接到浏览器：<br>
                <a href="{link}" style="word-break: break-all;">{link}</a>
            </p>
            <div class="info-box">
                <p style="margin-bottom: 0;">该链接将在 <strong>1 小时后过期</strong>，请尽快验证。</p>
            </div>`,
        variables: V_USER.concat([
            { name: 'link', label: '验证链接', example: 'https://example.com/api/user/verify-email/xxx', group: '链接' }
        ])
    },

    smtp_test: {
        code: 'smtp_test',
        name: 'SMTP 测试邮件',
        category: 'auth',
        subject: 'SMTP 配置测试',
        title: '测试邮件',
        content: `
            <p>您好，</p>
            <p>恭喜！您的 SMTP 配置测试成功！</p>
            <div class="divider"></div>
            <p>现在您可以正常使用邮件功能了，包括：</p>
            <ul style="margin-left: 20px; color: #4a5568;">
                <li>邮箱验证</li>
                <li>密码重置</li>
                <li>虚拟机到期提醒</li>
                <li>续费提醒</li>
            </ul>`,
        variables: []
    },

    // ==================== 资源通知类 ====================

    vm_provisioned: {
        code: 'vm_provisioned',
        name: '虚拟机开通通知（管理员分配）',
        category: 'notice',
        subject: '虚拟机已开通 - {site_name}',
        title: '虚拟机开通通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="info-box" style="border-left-color: #48bb78;">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    您的虚拟机已开通！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">VMID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <p>您可以前往「我的虚拟机」页面开始使用。如有问题请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    vm_removed: {
        code: 'vm_removed',
        name: '虚拟机移除通知',
        category: 'notice',
        subject: '虚拟机已被移除 - {site_name}',
        title: '虚拟机移除通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    您的虚拟机已被移除
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">VMID：{resource_id}</p>
            </div>
            <div class="divider"></div>
            <p>如果对此操作有疑问，请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE)
    },

    lxc_provisioned: {
        code: 'lxc_provisioned',
        name: 'LXC 容器开通通知（管理员分配）',
        category: 'notice',
        subject: 'LXC 容器已开通 - {site_name}',
        title: '容器开通通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="info-box" style="border-left-color: #48bb78;">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    您的 LXC 容器已开通！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">CT ID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <p>您可以前往「我的 LXC 容器」页面开始使用。如有问题请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    lxc_removed: {
        code: 'lxc_removed',
        name: 'LXC 容器移除通知',
        category: 'notice',
        subject: 'LXC 容器已被移除 - {site_name}',
        title: '容器移除通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    您的 LXC 容器已被移除
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">CT ID：{resource_id}</p>
            </div>
            <div class="divider"></div>
            <p>如果对此操作有疑问，请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE)
    },

    subnet_provisioned: {
        code: 'subnet_provisioned',
        name: '子网开通成功',
        category: 'notice',
        subject: '子网开通成功 - {site_name}',
        title: '子网开通成功',
        content: `
            <p>您的私有网络子网已开通成功！</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">VLAN 名称：<strong>{vlan_name}</strong></p>
                <p style="margin-bottom: 4px;">网关：<strong>{gateway}</strong></p>
                <p style="margin-bottom: 4px;">地址池：<strong>{address_pool}</strong></p>
                <p>开通时间：{now}</p>
            </div>
            <p>您可以在「我的虚拟机 / 容器」中绑定该子网使用。</p>`,
        variables: [
            { name: 'vlan_name', label: 'VLAN 名称', example: 'vlan_VPC8xK', group: '资源' },
            { name: 'gateway', label: '网关', example: '172.16.1.1', group: '资源' },
            { name: 'address_pool', label: '地址池', example: '172.16.1.2-172.16.1.254', group: '资源' }
        ]
    },

    server_provisioned: {
        code: 'server_provisioned',
        name: '服务器开通成功（用户侧 VM）',
        category: 'notice',
        subject: '服务器开通成功',
        title: '服务器开通成功',
        content: `
            <p>您的新服务器已开通成功！</p>
            <p>类型：虚拟机</p>
            <p>名称：{resource_name}</p>
            <p>订单号：{order_no}</p>`,
        variables: V_RESOURCE.concat(V_ORDER)
    },

    lxc_provisioned_user: {
        code: 'lxc_provisioned_user',
        name: '容器开通成功（用户侧 LXC）',
        category: 'notice',
        subject: '容器开通成功',
        title: '容器开通成功',
        content: `
            <p>您的新容器已开通成功！</p>
            <p>类型：LXC 容器</p>
            <p>名称：{resource_name}</p>
            <p>订单号：{order_no}</p>`,
        variables: V_RESOURCE.concat(V_ORDER)
    },

    server_provisioned_admin: {
        code: 'server_provisioned_admin',
        name: '服务器开通成功（管理员代开 VM）',
        category: 'notice',
        subject: '服务器开通成功',
        title: '服务器开通成功',
        content: `
            <p>您的新服务器已开通成功！</p>
            <p>类型：虚拟机</p>
            <p>名称：{resource_name}</p>
            <p>订单号：{order_no}</p>
            <p>到期时间：{expire_time}</p>`,
        variables: V_RESOURCE.concat(V_ORDER).concat(V_TIME)
    },

    lxc_provisioned_admin: {
        code: 'lxc_provisioned_admin',
        name: '容器开通成功（管理员代开 LXC）',
        category: 'notice',
        subject: '服务器开通成功',
        title: '服务器开通成功',
        content: `
            <p>您的新服务器已开通成功！</p>
            <p>类型：容器</p>
            <p>名称：{resource_name}</p>
            <p>订单号：{order_no}</p>
            <p>到期时间：{expire_time}</p>`,
        variables: V_RESOURCE.concat(V_ORDER).concat(V_TIME)
    },

    server_account: {
        code: 'server_account',
        name: '服务器账号信息（VM 登录账号）',
        category: 'notice',
        subject: '服务器账号信息 - {site_name}',
        title: '服务器账号信息',
        content: `
            <div class="info-box" style="border-left-color: #667eea;">
                <p style="margin-bottom: 8px;"><strong>您的服务器 {resource_name} 已开通</strong></p>
                <p style="margin-bottom: 4px;">账号：{account}</p>
                <p style="margin-bottom: 4px;">密码：{password}</p>
            </div><div class="divider"></div>
            <p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>`,
        variables: V_RESOURCE.concat([
            { name: 'account', label: '登录账号', example: 'root', group: '资源' },
            { name: 'password', label: '登录密码', example: 'Xk9#pQ2v', group: '资源' }
        ])
    },

    lxc_root_password: {
        code: 'lxc_root_password',
        name: '容器 root 密码',
        category: 'notice',
        subject: '容器 root 密码 - {site_name}',
        title: '容器 root 密码',
        content: `
            <div class="info-box" style="border-left-color: #667eea;">
                <p style="margin-bottom: 8px;"><strong>您的容器 {resource_name} 已开通</strong></p>
                <p style="margin-bottom: 4px;">Root 账号：root</p>
                <p style="margin-bottom: 4px;">密码：{password}</p>
            </div><div class="divider"></div>
            <p>请尽快修改密码。此密码仅此一封邮件发送，如需重置请在控制台操作。</p>`,
        variables: V_RESOURCE.concat([
            { name: 'password', label: '登录密码', example: 'Xk9#pQ2v', group: '资源' }
        ])
    },

    // ==================== 账单类 ====================

    recharge_notify: {
        code: 'recharge_notify',
        name: '充值到账通知',
        category: 'billing',
        subject: '充值到账通知 - {site_name}',
        title: '充值到账通知',
        content: `
            <p>您好，您已成功 <strong>充值 ¥{amount}</strong>。</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">充值金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">当前余额：<strong>¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">订单编号：<strong>{order_no}</strong></p>
                <p>充值时间：{now}</p>
            </div>
            <p>前往 <a href="{site_url}/user-center">用户中心</a> 查看余额详情。</p>`,
        variables: V_MONEY.concat(V_ORDER)
    },

    disk_purchase: {
        code: 'disk_purchase',
        name: '硬盘购买成功',
        category: 'billing',
        subject: '硬盘购买成功 - {site_name}',
        title: '硬盘购买成功',
        content: `
            <p>您的数据盘已购买成功！</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">硬盘名称：<strong>{disk_name}</strong></p>
                <p style="margin-bottom: 4px;">容量：<strong>{capacity_gb} GiB × {quantity} 块</strong></p>
                <p style="margin-bottom: 4px;">计费周期：<strong>{period}</strong></p>
                <p style="margin-bottom: 4px;">实付金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">订单编号：<strong>{order_no}</strong></p>
                <p>购买时间：{now}</p>
            </div>
            <p>前往 <a href="{site_url}/">控制面板</a> 查看硬盘详情。</p>`,
        variables: [
            { name: 'disk_name', label: '硬盘名称', example: '数据盘A', group: '资源' },
            { name: 'capacity_gb', label: '容量（GiB）', example: '50', group: '资源' },
            { name: 'quantity', label: '数量（块）', example: '2', group: '资源' },
            { name: 'period', label: '计费周期', example: '1个月', group: '时间' }
        ].concat(V_MONEY).concat(V_ORDER)
    },

    disk_purchase_refund: {
        code: 'disk_purchase_refund',
        name: '硬盘购买失败退款',
        category: 'billing',
        subject: '硬盘购买失败已退款 - {site_name}',
        title: '硬盘购买失败 - 已退款',
        content: `
            <p>非常抱歉，您购买的数据盘创建失败，款项已原路退回。</p>
            <div class="warning-box">
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">原订单号：<strong>{order_no}</strong></p>
                <p style="margin-bottom: 4px;">退款单号：<strong>{refund_order_no}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系客服。</p>`,
        variables: V_MONEY.concat(V_ORDER).concat([
            { name: 'refund_order_no', label: '退款单号', example: 'REFUND20260812001', group: '订单' }
        ])
    },

    disk_resize: {
        code: 'disk_resize',
        name: '硬盘扩容成功',
        category: 'billing',
        subject: '硬盘扩容成功 - {site_name}',
        title: '硬盘扩容成功',
        content: `
            <p>您的数据盘已扩容成功！</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">磁盘名称：<strong>{disk_name}</strong></p>
                <p style="margin-bottom: 4px;">扩容：<strong>{old_size} GiB → {new_size} GiB</strong></p>
                <p style="margin-bottom: 4px;">扩容费用：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">订单编号：<strong>{order_no}</strong></p>
                <p>扩容时间：{now}</p>
            </div>
            <p>前往 <a href="{site_url}/">控制面板</a> 查看硬盘详情。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' },
            { name: 'old_size', label: '扩容前容量（GiB）', example: '50', group: '资源' },
            { name: 'new_size', label: '扩容后容量（GiB）', example: '100', group: '资源' }
        ].concat(V_MONEY).concat(V_ORDER)
    },

    disk_resize_refund: {
        code: 'disk_resize_refund',
        name: '硬盘扩容失败退款',
        category: 'billing',
        subject: '硬盘扩容失败已退款 - {site_name}',
        title: '硬盘扩容失败 - 已退款',
        content: `
            <p>非常抱歉，您硬盘扩容操作失败，款项已原路退回。</p>
            <div class="warning-box">
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">原订单号：<strong>{order_no}</strong></p>
                <p style="margin-bottom: 4px;">退款单号：<strong>{refund_order_no}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系客服。</p>`,
        variables: V_MONEY.concat(V_ORDER).concat([
            { name: 'refund_order_no', label: '退款单号', example: 'REFUND20260812001', group: '订单' }
        ])
    },

    disk_destroy_refund: {
        code: 'disk_destroy_refund',
        name: '硬盘销毁退款',
        category: 'billing',
        subject: '硬盘销毁退款 - {site_name}',
        title: '硬盘销毁退款',
        content: `
            <p>您的数据盘已销毁，退款已到账。</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">磁盘名称：<strong>{disk_name}</strong></p>
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">退款说明：<strong>{refund_desc}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系客服。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' }
        ].concat(V_MONEY).concat([
            { name: 'refund_desc', label: '退款说明', example: '未使用时长退款', group: '金额' }
        ])
    },

    disk_admin_destroy: {
        code: 'disk_admin_destroy',
        name: '硬盘管理员销毁退款',
        category: 'billing',
        subject: '硬盘已被管理员销毁 - {site_name}',
        title: '硬盘已被管理员销毁 - 退款到账',
        content: `
            <p>您的数据盘已被管理员销毁，退款已到账。</p>
            <div class="warning-box">
                <p style="margin-bottom: 4px;">磁盘名称：<strong>{disk_name}</strong></p>
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">退款说明：<strong>{refund_desc}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系管理员。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' }
        ].concat(V_MONEY).concat([
            { name: 'refund_desc', label: '退款说明', example: '违规使用销毁', group: '金额' }
        ])
    },

    disk_renewal: {
        code: 'disk_renewal',
        name: '硬盘续费成功',
        category: 'billing',
        subject: '硬盘续费成功 - {site_name}',
        title: '硬盘续费成功',
        content: `
            <p>您的数据盘已续费成功！</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">磁盘名称：<strong>{disk_name}</strong></p>
                <p style="margin-bottom: 4px;">续费详情：<strong>{period}</strong></p>
                <p style="margin-bottom: 4px;">到期时间：<strong>{expire_time}</strong></p>
                <p style="margin-bottom: 4px;">实付金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">订单编号：<strong>{order_no}</strong></p>
                <p>续费时间：{now}</p>
            </div>
            <p>前往 <a href="{site_url}/">控制面板</a> 查看硬盘详情。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' },
            { name: 'period', label: '续费详情', example: '1个月', group: '时间' }
        ].concat(V_TIME).concat(V_MONEY).concat(V_ORDER)
    },

    resource_renewal: {
        code: 'resource_renewal',
        name: '资源续费成功（VM/LXC）',
        category: 'billing',
        subject: '资源续费成功 - {site_name}',
        title: '资源续费成功',
        content: `
            <p>您好，您的 <strong>{resource_label}「{resource_name}」</strong> 已续费成功。</p>
            <div class="info-box">
                <p style="margin-bottom: 4px;">资源名称：<strong>{resource_name}</strong></p>
                <p style="margin-bottom: 4px;">续费详情：<strong>{period}</strong></p>
                <p style="margin-bottom: 4px;">到期时间：<strong>{expire_time}</strong></p>
                <p style="margin-bottom: 4px;">实付金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">订单编号：<strong>{order_no}</strong></p>
                <p>续费时间：{now}</p>
            </div>
            <p>前往 <a href="{site_url}/">控制面板</a> 查看资源详情。</p>`,
        variables: [
            { name: 'resource_label', label: '资源类型', example: '虚拟机', group: '资源' },
            { name: 'resource_name', label: '资源名称', example: 'web-server-01', group: '资源' },
            { name: 'period', label: '续费详情', example: '1个月', group: '时间' }
        ].concat(V_TIME).concat(V_MONEY).concat(V_ORDER)
    },

    cdk_renewal_lxc: {
        code: 'cdk_renewal_lxc',
        name: 'CDK 续费成功（LXC）',
        category: 'billing',
        subject: 'CDK 续费成功 - {site_name}',
        title: '续费成功通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="info-box" style="border-left-color: #48bb78;">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    CDK 续费成功！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>续费详情：</strong></p>
                <p style="margin-bottom: 4px;">LXC 容器：{resource_name}（CT {resource_id}）</p>
                <p style="margin-bottom: 4px;">续费时长：{duration}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
                <p style="margin-bottom: 0;">新到期时间：{new_expire_time}</p>
            </div>
            <p>祝您使用愉快！如有问题请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat([
            { name: 'duration', label: '续费时长', example: '30天', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元', group: '金额' },
            { name: 'new_expire_time', label: '新到期时间', example: '2027-01-01 00:00:00', group: '时间' }
        ])
    },

    cdk_renewal_vm: {
        code: 'cdk_renewal_vm',
        name: 'CDK 续费成功（VM）',
        category: 'billing',
        subject: 'CDK 续费成功 - {site_name}',
        title: '续费成功通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="info-box" style="border-left-color: #48bb78;">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    CDK 续费成功！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>续费详情：</strong></p>
                <p style="margin-bottom: 4px;">虚拟机：{resource_name}（VMID: {resource_id}）</p>
                <p style="margin-bottom: 4px;">续费时长：{duration}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
                <p style="margin-bottom: 0;">新到期时间：{new_expire_time}</p>
            </div>
            <p>祝您使用愉快！如有问题请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat([
            { name: 'duration', label: '续费时长', example: '30天', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元', group: '金额' },
            { name: 'new_expire_time', label: '新到期时间', example: '2027-01-01 00:00:00', group: '时间' }
        ])
    },

    cdk_gift: {
        code: 'cdk_gift',
        name: 'CDK 兑换码通知',
        category: 'billing',
        subject: '您收到 CDK 兑换码 - {site_name}',
        title: 'CDK 兑换码通知',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="info-box" style="border-left-color: #48bb78;">
                <p style="margin-bottom: 8px; font-size: 16px;">
                    为您生成了 {cdk_count} 张 CDK 兑换码
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>CDK 详情：</strong></p>
                <p style="margin-bottom: 4px;">续费时长：{duration}</p>
                <p style="margin-bottom: 4px;">有效期至：{expire_time}</p>
                {cdk_list}
            </div>
            <div class="divider"></div>
            <p>请前往「我的虚拟机」页面点击「CDK 兑换」输入兑换码进行续费。</p>`,
        variables: V_USER.concat([
            { name: 'cdk_count', label: '生成张数', example: '2', group: '资源' },
            { name: 'duration', label: '续费时长', example: '30天', group: '时间' },
            { name: 'expire_time', label: '有效期至', example: '2026-12-31', group: '时间' },
            { name: 'cdk_list', label: '兑换码列表（≤5 张时显示，传 HTML 或留空）', example: '<p style="margin-bottom: 4px;">兑换码：<br>CDK-XXXX<br>CDK-YYYY</p>', group: '资源', html: true }
        ])
    },

    provision_failed: {
        code: 'provision_failed',
        name: '开通失败退款（VM/LXC）',
        category: 'billing',
        subject: '{resource_label}开通失败 - 已退款 - {site_name}',
        title: '{resource_label}开通失败 - 已退款',
        content: `
            <p>非常抱歉，您订购的{resource_label} <strong>{resource_name}</strong> 开通失败，款项已原路退回。</p>
            <div class="warning-box">
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">余额变动：<strong>¥{balance_before} → ¥{balance_after}</strong></p>
                <p style="margin-bottom: 4px;">原订单号：<strong>{order_no}</strong></p>
                <p style="margin-bottom: 4px;">退款单号：<strong>{refund_order_no}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系客服。</p>`,
        variables: [
            { name: 'resource_label', label: '资源类型', example: '虚拟机', group: '资源' },
            { name: 'resource_name', label: '资源名称', example: 'web-server-01', group: '资源' }
        ].concat(V_MONEY).concat(V_ORDER).concat([
            { name: 'refund_order_no', label: '退款单号', example: 'REFUND20260812001', group: '订单' }
        ])
    },

    provision_failed_restore: {
        code: 'provision_failed_restore',
        name: '开通失败退款（恢复补偿）',
        category: 'billing',
        subject: '{resource_label}开通失败已退款 - {site_name}',
        title: '{resource_label}开通失败 - 已退款',
        content: `
            <p>非常抱歉，您订购的{resource_label} <strong>{resource_name}</strong> 开通失败，款项已原路退回。</p>
            <div class="warning-box">
                <p style="margin-bottom: 4px;">退款金额：<strong>¥{amount}</strong></p>
                <p style="margin-bottom: 4px;">原订单号：<strong>{order_no}</strong></p>
                <p>退款时间：{now}</p>
            </div>
            <p>如有疑问请联系客服。</p>`,
        variables: [
            { name: 'resource_label', label: '资源类型', example: '虚拟机', group: '资源' },
            { name: 'resource_name', label: '资源名称', example: 'web-server-01', group: '资源' }
        ].concat(V_MONEY).concat(V_ORDER)
    },

    // ==================== 到期提醒类 ====================

    vm_expiry_reminder: {
        code: 'vm_expiry_reminder',
        name: '虚拟机到期前提醒',
        category: 'reminder',
        subject: '虚拟机到期提醒',
        title: '虚拟机将在{days}天后到期',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 0;">
                    您的虚拟机将在 <strong style="font-size: 18px;">{days} 天</strong> 后到期！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">VMID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <p>请及时续费或联系管理员，以免影响您的使用！</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'days', label: '剩余天数', example: '7', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    vm_expiry_alert: {
        code: 'vm_expiry_alert',
        name: '虚拟机已到期续费提醒',
        category: 'reminder',
        subject: '虚拟机已到期 - 请及时续费',
        title: '虚拟机已到期',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 0; font-size: 16px;">
                    您的虚拟机 <strong>已到期</strong>！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>虚拟机信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">VMID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <div class="warning-box">
                <p style="margin-bottom: 0;">
                    续费提醒（{reminder_count}/3）— 数据保留还剩 <strong style="color: #ed6463; font-size: 18px;">{remaining_days} 天</strong>，请尽快续费，以免数据丢失！
                </p>
            </div>
            <p style="margin-top: 16px;">如有问题，请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'reminder_count', label: '第几次提醒', example: '1', group: '时间' },
            { name: 'remaining_days', label: '数据保留剩余天数', example: '2', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    lxc_expiry_reminder: {
        code: 'lxc_expiry_reminder',
        name: 'LXC 容器到期前提醒',
        category: 'reminder',
        subject: 'LXC 容器到期提醒',
        title: 'LXC 容器将在{days}天后到期',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 0;">
                    您的 LXC 容器将在 <strong style="font-size: 18px;">{days} 天</strong> 后到期！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">CT ID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <p>请及时续费或联系管理员，以免影响您的使用！</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'days', label: '剩余天数', example: '7', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    lxc_expiry_alert: {
        code: 'lxc_expiry_alert',
        name: 'LXC 容器已到期续费提醒',
        category: 'reminder',
        subject: 'LXC 容器已到期 - 请及时续费',
        title: 'LXC 容器已到期',
        content: `
            <p>您好 <strong>{username}</strong>，</p>
            <div class="warning-box">
                <p style="margin-bottom: 0; font-size: 16px;">
                    您的 LXC 容器 <strong>已到期</strong>！
                </p>
            </div>
            <div class="info-box">
                <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                <p style="margin-bottom: 4px;">名称：{resource_name}</p>
                <p style="margin-bottom: 4px;">CT ID：{resource_id}</p>
                <p style="margin-bottom: 4px;">到期时间：{expire_time}</p>
                <p style="margin-bottom: 4px;">续费价格：{renewal_price}</p>
            </div>
            <div class="divider"></div>
            <div class="warning-box">
                <p style="margin-bottom: 0;">
                    续费提醒（{reminder_count}/3）— 数据保留还剩 <strong style="color: #ed6463; font-size: 18px;">{remaining_days} 天</strong>，请尽快续费，以免数据丢失！
                </p>
            </div>
            <p style="margin-top: 16px;">如有问题，请联系管理员。</p>`,
        variables: V_USER.concat(V_RESOURCE).concat(V_TIME).concat([
            { name: 'reminder_count', label: '第几次提醒', example: '1', group: '时间' },
            { name: 'remaining_days', label: '数据保留剩余天数', example: '2', group: '时间' },
            { name: 'renewal_price', label: '续费价格（可留空）', example: '50.00 元/月', group: '金额' }
        ])
    },

    disk_expiry_warn: {
        code: 'disk_expiry_warn',
        name: '硬盘到期提醒（到期前）',
        category: 'reminder',
        subject: '【硬盘到期提醒】{disk_name}',
        title: '硬盘到期提醒',
        content: `
            <p>您的数据盘 <strong>{disk_name}</strong>（{capacity_gb} GiB）将在 {expire_time} 到期。</p>
            <p>请及时续费以免影响使用。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' },
            { name: 'capacity_gb', label: '容量（GiB）', example: '50', group: '资源' }
        ].concat(V_TIME)
    },

    disk_expiry_grace: {
        code: 'disk_expiry_grace',
        name: '硬盘到期提醒（宽限期）',
        category: 'reminder',
        subject: '【硬盘到期提醒】{disk_name}',
        title: '硬盘到期提醒',
        content: `
            <p>您的数据盘 <strong>{disk_name}</strong>（{capacity_gb} GiB）已到期，当前处于宽限期。</p>
            <p>请尽快续费，宽限期结束后磁盘将从虚拟机分离。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' },
            { name: 'capacity_gb', label: '容量（GiB）', example: '50', group: '资源' }
        ]
    },

    disk_expiry_expired: {
        code: 'disk_expiry_expired',
        name: '硬盘到期提醒（保留期）',
        category: 'reminder',
        subject: '【硬盘到期提醒】{disk_name}',
        title: '硬盘到期提醒',
        content: `
            <p>您的数据盘 <strong>{disk_name}</strong>（{capacity_gb} GiB）已到期分离，进入保留期。</p>
            <p>保留期内续费可重新挂载，逾期将自动销毁。</p>`,
        variables: [
            { name: 'disk_name', label: '磁盘名称', example: '数据盘A', group: '资源' },
            { name: 'capacity_gb', label: '容量（GiB）', example: '50', group: '资源' }
        ]
    },

    storage_alert: {
        code: 'storage_alert',
        name: '存储容量告警（发送管理员）',
        category: 'reminder',
        subject: '【存储容量告警】{storage_name} 使用率 {used_pct}%',
        title: '存储容量告警',
        content: `
            <h3>存储容量告警</h3>
            <p><strong>存储名：</strong>{storage_name}</p>
            <p><strong>当前使用率：</strong>{used_pct}%</p>
            <p><strong>已用容量 / 总容量：</strong>{used_tb} TiB / {total_tb} TiB</p>
            <p style="color:#dc3545;"><strong>请及时扩容存储池或清理闲置磁盘。</strong></p>`,
        variables: [
            { name: 'storage_name', label: '存储名', example: 'local-lvm', group: '资源' },
            { name: 'used_pct', label: '当前使用率（%）', example: '85', group: '资源' },
            { name: 'used_tb', label: '已用容量（TiB）', example: '1.85', group: '资源' },
            { name: 'total_tb', label: '总容量（TiB）', example: '2.18', group: '资源' }
        ]
    },

    // ==================== 系统通知类 ====================

    lxc_backup_result: {
        code: 'lxc_backup_result',
        name: 'LXC 备份结果通知',
        category: 'system',
        subject: 'LXC 容器备份{status}',
        title: 'LXC 容器备份{status}',
        content: `
            <p>您好，{username}！</p>
            <p>您的 LXC 容器 (CT {vmid}) 备份{status}。{detail}</p>`,
        variables: V_USER.concat([
            { name: 'vmid', label: '容器 ID', example: '2003', group: '资源' },
            { name: 'status', label: '状态（完成/失败）', example: '完成', group: '系统' },
            { name: 'detail', label: '详情（失败原因等，可留空）', example: '原因：超时', group: '系统' }
        ])
    },

    lxc_restore_result: {
        code: 'lxc_restore_result',
        name: 'LXC 恢复结果通知',
        category: 'system',
        subject: 'LXC 容器恢复{status}',
        title: 'LXC 容器恢复{status}',
        content: `
            <p>您好，{username}！</p>
            <p>您的 LXC 容器 (CT {vmid}) 恢复{status}。{detail}</p>`,
        variables: V_USER.concat([
            { name: 'vmid', label: '容器 ID', example: '2003', group: '资源' },
            { name: 'status', label: '状态（完成/失败）', example: '完成', group: '系统' },
            { name: 'detail', label: '详情（失败原因等，可留空）', example: '原因：超时', group: '系统' }
        ])
    },

    vm_backup_result: {
        code: 'vm_backup_result',
        name: 'VM 备份结果通知',
        category: 'system',
        subject: '备份{status}通知',
        title: '备份{status}通知',
        content: `
            <p>您好，{username}！</p>
            <p>您虚拟机 <strong>{vm_name}</strong> 的备份{status}。{detail}</p>
            <p>如非本人操作，请忽略此邮件。</p>`,
        variables: V_USER.concat([
            { name: 'vm_name', label: '虚拟机名称', example: 'web-server-01', group: '资源' },
            { name: 'status', label: '状态（完成/失败）', example: '完成', group: '系统' },
            { name: 'detail', label: '详情（备份文件/原因，可留空）', example: '备份文件：vzdump-qemu-1001.vma.zst', group: '系统' }
        ])
    },

    vm_restore_result: {
        code: 'vm_restore_result',
        name: 'VM 恢复结果通知',
        category: 'system',
        subject: '备份恢复{status}通知',
        title: '备份恢复{status}通知',
        content: `
            <p>您好，{username}！</p>
            <p>您虚拟机 <strong>{vm_name}</strong> 的备份恢复{status}。{detail}</p>
            <p>如非本人操作，请忽略此邮件。</p>`,
        variables: V_USER.concat([
            { name: 'vm_name', label: '虚拟机名称', example: 'web-server-01', group: '资源' },
            { name: 'status', label: '状态（完成/失败）', example: '完成', group: '系统' },
            { name: 'detail', label: '详情（失败原因，可留空）', example: '原因：磁盘空间不足', group: '系统' }
        ])
    }
};

module.exports = { EMAIL_TEMPLATES, EMAIL_TEMPLATE_CATEGORIES, GLOBAL_VARIABLES, EMAIL_SHELL_PARAMS };
