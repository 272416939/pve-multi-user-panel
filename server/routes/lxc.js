const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../api/db');
const pveApi = require('../api/pve-api');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { JWT_SECRET } = require('../utils/token');
const ikuaiApi = require('../api/ikuai-api');
const { _applyRate } = require('../utils/pve-rate');
const { getStatusCache } = require('../websocket/push-proxy');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { createDhcpStaticBinding, removeDhcpStaticBinding, pickUnusedStaticIp } = require('../services/dhcp');
const { execSSH, execSSHWithStdin, restoreLxcBySSH, createTerminalPty } = require('../api/ssh-exec');
const dbg = require('../utils/debug');
const vncProxy = require('../websocket/vnc-proxy');
// H-9 修复：生产环境隐藏详细错误信息
function safeError(e) {
    const isDebug = process.env.DEBUG === 'true';
    if (isDebug) return e.response?.data?.message || e.message || String(e);
    return '操作失败，请稍后重试';
}
// P2-H1② 修复：PVE LXC 列表需管理员权限（包含所有节点容器分配信息）
router.get('/pve/lxc', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const containers = await pveApi.getLxcContainers();
 
        const assignedCts = await db.lxcContainers.getAll();
        const assignedCtIds = new Set(assignedCts.map(ct => ct.ct_id));
 
        const available = containers
            .filter(ct => !assignedCtIds.has(ct.vmid))
            .sort((a, b) => b.vmid - a.vmid);
 
        const assigned = await Promise.all(
            containers
            .filter(ct => assignedCtIds.has(ct.vmid))
            .sort((a, b) => b.vmid - a.vmid)
            .map(async ct => {
                const assignment = assignedCts.find(a => a.ct_id === ct.vmid);
                const user = assignment ? await db.users.getById(assignment.user_id) : null;
                return {
                    ...ct,
                    name: assignment?.name || ct.name,
                    assigned_user: user ? user.username : null,
                    assignment_id: assignment ? assignment.id : null
                };
            })
        );
 
        res.json({ available, assigned });
    } catch (error) {
        console.error('获取 LXC 容器列表错误:', error);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/user/lxc', authMiddleware, async (req, res) => {
    try {
        let userCts;
        if (req.user.role === 'admin') {
            userCts = await Promise.all((await db.lxcContainers.getAll()).map(async ct => {
                const user = await db.users.getById(ct.user_id);
                return { ...ct, username: user?.username };
            }));
        } else {
            userCts = await db.lxcContainers.getByUserId(req.user.id);
        }
 
        const ctsWithDetails = userCts.map(ct => ({
            ...ct,
            status: null,
            config: null,
            isExpired: ct.expiration_date ? new Date(ct.expiration_date) < new Date() : false,
            destroyed: false,
            error: null
        }));
 
        for (const ctData of ctsWithDetails) {
            try {
                var cachedStatus = getStatusCache('lxc:' + ctData.ct_id, req.user.id);
                var rawStatus = cachedStatus || await pveApi.getLxcStatus(ctData.ct_id);
                var config = await pveApi.getLxcConfig(ctData.ct_id);
                ctData.status = cachedStatus || _applyRate('lxc:' + ctData.ct_id, rawStatus);
                ctData.config = config;
                ctData.error = null;
            } catch (innerError) {
                var cachedFallback = getStatusCache('lxc:' + ctData.ct_id, req.user.id);
                if (cachedFallback) {
                    ctData.status = cachedFallback;
                    ctData.error = null;
                } else {
                    const errMsg = innerError?.response?.data?.message || innerError?.message || '';
                    if (innerError.response?.status === 404 || errMsg.includes('does not exist')) {
                        ctData.destroyed = true;
                    } else {
                        ctData.error = '获取容器信息失败';
                    }
                }
            }
        }
 
        res.json(ctsWithDetails);
    } catch (error) {
        console.error('获取用户 LXC 容器列表失败:', error);
        try {
            let userCts;
            if (req.user.role === 'admin') {
                userCts = await db.lxcContainers.getAll();
            } else {
                userCts = await db.lxcContainers.getByUserId(req.user.id);
            }
            return res.json(userCts.map(ct => ({
                ...ct,
                status: null,
                config: null,
                isExpired: ct.expiration_date ? new Date(ct.expiration_date) < new Date() : false,
                destroyed: false
            })));
        } catch (e2) {
            console.error('兜底返回也失败:', e2);
            res.json([]);
        }
    }
});

router.post('/user/lxc', authMiddleware, adminMiddleware, async (req, res) => {
    const { ct_id, user_id, name, expiration_date, renewal_price, renewal_period } = req.body;
 
    if (!ct_id || !user_id) {
        return res.status(400).json({ error: '请选择容器和用户' });
    }
 
    const parsedCtId = parseInt(ct_id);
    const parsedUserId = parseInt(user_id);
 
    if (isNaN(parsedCtId) || isNaN(parsedUserId)) {
        return res.status(400).json({ error: '无效的容器或用户ID' });
    }
 
    const existingCts = await db.lxcContainers.getAll();
    if (existingCts.find(ct => ct.ct_id === parsedCtId && ct.user_id === parsedUserId)) {
        return res.status(400).json({ error: '该容器已分配给此用户' });
    }
 
    const newCt = await db.lxcContainers.create({
        ct_id: parsedCtId,
        user_id: parsedUserId,
        name,
        expiration_date,
        renewal_price: renewal_price || '',
        renewal_period: renewal_period || 'month'
    });
 
    try {
        const user = await db.users.getById(parseInt(user_id));
        await db.messages.create({
            uid: parseInt(user_id),
            title: 'LXC 容器已开通',
            content: `您的 LXC 容器 ${name || 'CT ' + ct_id} 已分配完成。${expiration_date ? '\n到期时间：' + new Date(expiration_date).toLocaleString('zh-CN') : ''}${renewal_price ? '\n续费价格：' + renewal_price : ''}`,
            type: 2,
            send_type: 1,
            link_url: '',
            link_text: ''
        });
    } catch (e) {}

    const assignedUser = await db.users.getById(parseInt(user_id));
    if (assignedUser && assignedUser.email && assignedUser.emailVerified) {
        try {
            const expiryStr = expiration_date ? new Date(expiration_date).toLocaleString('zh-CN') : '永久有效';
            const priceStr = renewal_price ? `<p style="margin-bottom: 4px;">续费价格：${renewal_price}</p>` : '';
            const emailContent = `
                <p>您好 <strong>${assignedUser.username}</strong>，</p>
                <div class="info-box" style="border-left-color: #48bb78;">
                    <p style="margin-bottom: 8px; font-size: 16px;">
                        🎉 您的 LXC 容器已开通！
                    </p>
                </div>
                <div class="info-box">
                    <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                    <p style="margin-bottom: 4px;">名称：${name || 'CT ' + ct_id}</p>
                    <p style="margin-bottom: 4px;">CT ID：${ct_id}</p>
                    <p style="margin-bottom: 4px;">到期时间：${expiryStr}</p>
                    ${priceStr}
                </div>
                <div class="divider"></div>
                <p>您可以前往「我的 LXC 容器」页面开始使用。如有问题请联系管理员。</p>
            `;
            await sendEmail(
                assignedUser.email,
                'LXC 容器已开通 - PVE 管理面板',
                createEmailTemplate('容器开通通知', emailContent)
            );
        } catch (emailError) {
            console.error(`发送 LXC 开通邮件给 ${assignedUser.username} 失败:`, emailError.message);
        }
    }
 
    try {
        const currentStatus = await pveApi.getLxcStatus(parseInt(ct_id));
        if (currentStatus && currentStatus.status === 'stopped') {
            await pveApi.startLxc(parseInt(ct_id));
            dbg(`LXC 容器 ${ct_id} 已自动开机（分配后）`);
        }
    } catch (startError) {
        console.error(`LXC 容器 ${ct_id} 自动开机失败:`, startError.message);
    }

    // DHCP 静态绑定：分配 IP
    try {
        const config = await pveApi.getLxcConfig(parsedCtId);
        if (config && config.net0) {
            const macMatch = config.net0.match(/[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}/);
            if (macMatch) {
                // 从 LXC 网络配置中提取用户手动设置的 IP（如 ip=10.0.0.150/24）
                let manualIp = '';
                const ipMatch = config.net0.match(/ip=([0-9.]+\/\d+)/);
                if (ipMatch && !ipMatch[1].startsWith('dhcp')) {
                    manualIp = ipMatch[1];
                }
                const ip = await createDhcpStaticBinding('lxc', parsedCtId, macMatch[0], manualIp);
                if (ip) await db.lxcContainers.update(newCt.id, { dhcp_static_ip: ip });
            }
        }
    } catch (e) { console.error(`LXC ${parsedCtId} DHCP 静态绑定失败:`, e.message); }

    res.json(newCt);
});

router.put('/user/lxc/:id', authMiddleware, async (req, res) => {
    const ctId = parseInt(req.params.id);
    const { name, expiration_date, renewal_price, user_id } = req.body;
 
    const ct = await db.lxcContainers.getById(ctId);
    if (!ct) {
        return res.status(404).json({ error: 'LXC 容器不存在' });
    }
 
    const isAdmin = req.user.role === 'admin';
    const isOwner = req.user.id === ct.user_id;
 
    if (!isAdmin && !isOwner) {
        return res.status(403).json({ error: '无权限操作此容器' });
    }
 
    const updates = {};
 
    if (name !== undefined) {
        updates.name = name;
    }
 
    if (isAdmin && expiration_date !== undefined) {
        updates.expiration_date = expiration_date;
        updates.reminderSent = false;
        await db.lxcContainers.reminders.clear(ctId);
    }
 
    if (isAdmin && renewal_price !== undefined) {
        updates.renewal_price = renewal_price;
    }

    if (isAdmin && renewal_period !== undefined) {
        updates.renewal_period = renewal_period;
    }
 
    if (isAdmin && user_id !== undefined && user_id !== ct.user_id) {
        const newUserId = parseInt(user_id);
        if (isNaN(newUserId)) {
            return res.status(400).json({ error: '无效的用户ID' });
        }
        updates.user_id = newUserId;
 
        try {
            const newUser = await db.users.getById(newUserId);
            if (newUser) {
                await db.messages.create({
                    uid: newUserId,
                    title: 'LXC 容器已转移',
                    content: `LXC 容器 ${ct.name || 'CT ' + ct.ct_id} 已被管理员转移给您。${expiration_date ? '\n到期时间：' + new Date(expiration_date).toLocaleString('zh-CN') : ''}`,
                    type: 2,
                    send_type: 1
                });
            }
        } catch (e) {}
    }
 
    await db.lxcContainers.update(ctId, updates);
 
    // 换绑后尝试自动开机
    if (isAdmin && user_id !== undefined && user_id !== ct.user_id) {
        try {
            const currentStatus = await pveApi.getLxcStatus(ct.ct_id);
            if (currentStatus && currentStatus.status === 'stopped') {
                await pveApi.startLxc(ct.ct_id);
                dbg(`LXC 容器 ${ct.ct_id} 已自动开机（换绑后）`);
            }
        } catch (startError) {
            console.error(`LXC 容器 ${ct.ct_id} 自动开机失败:`, startError.message);
        }
    }
 
    res.json({ message: '容器信息更新成功' });
});

router.delete('/user/lxc/:id', authMiddleware, adminMiddleware, async (req, res) => {
    const ctId = parseInt(req.params.id);
    const ct = await db.lxcContainers.getById(ctId);
    let removedCtInfo = null;
    if (ct) {
        removedCtInfo = { name: ct.name, ct_id: ct.ct_id, user_id: ct.user_id };
    }
    await db.lxcContainers.reminders.clear(ctId);
    // 级联清理端口转发
    try {
        const lxcForwards = await db.portForwards.getByCtId(removedCtInfo?.ct_id || ctId);
        for (const fw of lxcForwards) {
            if (fw.ikuai_id) {
                try { ikuaiApi.deletePortForward(fw.ikuai_id); } catch (e) {}
            }
        }
        await db.portForwards.deleteByDevice('lxc', removedCtInfo?.ct_id || ctId);
    } catch (e) { console.error('清理端口转发失败:', e.message); }
    // 清理 DHCP 静态绑定
    if (ct && ct.ct_id) {
        removeDhcpStaticBinding('lxc', ct.ct_id);
    }
    await db.lxcContainers.delete(ctId);
    if (removedCtInfo) {
        try {
            await db.messages.create({
                uid: removedCtInfo.user_id,
                title: 'LXC 容器已移除',
                content: `您的 LXC 容器 ${removedCtInfo.name || 'CT ' + removedCtInfo.ct_id} 已被管理员移除。`,
                type: 2,
                send_type: 1
            });
        } catch (e) {}
    }

    if (removedCtInfo) {
        const removedUser = await db.users.getById(removedCtInfo.user_id);
        if (removedUser && removedUser.email && removedUser.emailVerified) {
            try {
                const emailContent = `
                    <p>您好 <strong>${removedUser.username}</strong>，</p>
                    <div class="warning-box">
                        <p style="margin-bottom: 8px; font-size: 16px;">
                            ⚠️ 您的 LXC 容器已被移除
                        </p>
                    </div>
                    <div class="info-box">
                        <p style="margin-bottom: 8px;"><strong>容器信息：</strong></p>
                        <p style="margin-bottom: 4px;">名称：${removedCtInfo.name || 'CT ' + removedCtInfo.ct_id}</p>
                        <p style="margin-bottom: 4px;">CT ID：${removedCtInfo.ct_id}</p>
                    </div>
                    <div class="divider"></div>
                    <p>如果对此操作有疑问，请联系管理员。</p>
                `;
                await sendEmail(
                    removedUser.email,
                    'LXC 容器已被移除 - PVE 管理面板',
                    createEmailTemplate('容器移除通知', emailContent)
                );
            } catch (emailError) {
                console.error(`发送 LXC 移除邮件给 ${removedUser.username} 失败:`, emailError.message);
            }
        }
    }

    res.json({ message: '容器移除成功' });
});

router.post('/lxc/:vmid/start', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
            if (isOwner && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，无法开机' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        await pveApi.startLxc(vmid);
        res.json({ message: 'LXC 容器启动成功' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/shutdown', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        await pveApi.shutdownLxc(vmid);
        res.json({ message: 'LXC 容器关机命令已发送' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/stop', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        await pveApi.stopLxc(vmid);
        res.json({ message: 'LXC 容器已强制停止' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/reboot', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        await pveApi.rebootLxc(vmid);
        res.json({ message: 'LXC 容器重启命令已发送' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/vnc', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        // V-1 修复：统一权限模式 — 管理员可连接未分配容器进行运维
        if (!ct) {
            if (!isAdmin) {
                return res.status(403).json({ error: '容器未分配，无权限' });
            }
            // 管理员允许继续（用于运维未分配的容器）
        } else {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权操作此容器' });
            }
        }
 
        // 检查容器是否在运行
        let ctStatus;
        try {
            ctStatus = await pveApi.getLxcStatus(vmid);
        } catch (e) {
            return res.status(500).json({ error: '无法获取容器状态' });
        }
        if (!ctStatus || ctStatus.status !== 'running') {
            return res.status(400).json({ error: '容器未运行，请先开机' });
        }
 
        const result = await pveApi.getLxcVncConsole(vmid);

        // 安全修复：注册 ticket 到校验存储，WebSocket 代理连接时会校验
        await vncProxy.registerTicket(result.ticket, vmid, req.user.id);

        const proxyUrl = `/vnc.html?node=${result.node}&vmid=${vmid}&port=${result.port}&ticket=${encodeURIComponent(result.ticket)}&type=lxc&userId=${req.user.id}`;
        res.json({ proxyUrl });
    } catch (error) {
        console.error('获取 LXC VNC 控制台失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/terminal', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        let ctStatus;
        try {
            ctStatus = await pveApi.getLxcStatus(vmid);
        } catch (e) {
            return res.status(500).json({ error: '无法获取容器状态' });
        }
        if (!ctStatus || ctStatus.status !== 'running') {
            return res.status(400).json({ error: '容器未运行，请先开机' });
        }

        // 生成一次性 terminal ticket（5分钟有效期，绑定 vmid + userId）
        const terminalTicket = jwt.sign(
            {
                type: 'terminal',
                vmid: vmid,
                userId: req.user.id,
                username: req.user.username
            },
            JWT_SECRET,
            { expiresIn: '5m' }
        );

        const proxyUrl = `/terminal.html?vmid=${vmid}&token=${encodeURIComponent(terminalTicket)}`;
        res.json({ proxyUrl });
    } catch (error) {
        console.error('获取 LXC 终端失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/lxc/:vmid/status', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限查看此容器状态' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限查看此容器状态，资源未分配' });
        }

        const [rawStatus, config] = await Promise.all([
            pveApi.getLxcStatus(vmid),
            pveApi.getLxcConfig(req.params.vmid)
        ]);
        const status = _applyRate('lxc:' + req.params.vmid, rawStatus);
        res.json({ status, config });
    } catch (error) {
        res.status(500).json({ error: '获取容器状态失败' });
    }
});

router.get('/lxc/templates', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getStorageList();
        const templatePromises = storages.map(async (s) => {
            try {
                const templates = await pveApi.getTemplates(s.storage);
                return templates.map(t => ({ ...t, storage: s.storage }));
            } catch (e) {
                return [];
            }
        });
        const results = await Promise.all(templatePromises);
        res.json(results.flat());
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/lxc/storages', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const storages = await pveApi.getLxcStorageList();
        res.json(storages.map(s => ({ id: s.storage, type: s.type, path: s.path, content: s.content })));
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/create', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ostemplate, hostname, password, storage, cores, memory, swap, disk, net0, unprivileged, start, description } = req.body;
 
        if (!ostemplate) {
            return res.status(400).json({ error: '请选择模板' });
        }
 
        // 获取可用空闲 VMID（取当前最大 ID + 1）
        const newVmid = await pveApi.getNextAvailableVmid();
        const rootfs = (storage || 'local') + ':' + (disk || 8);
        const params = {
            vmid: newVmid,
            ostemplate,
            hostname: hostname || '',
            password: password || '',
            cores: cores || 1,
            memory: memory || 512,
            swap: swap !== undefined ? swap : 512,
            rootfs: rootfs,
            net0: net0 || 'name=eth0,bridge=vmbr0,ip=dhcp,ip6=dhcp',
            unprivileged: unprivileged ? 1 : 0,
            start: start ? 1 : 0
        };
        if (description) params.description = description;
 
        const result = await pveApi.createLxc(params);
        const upid = result.data;
 
        res.json({ upid, ct_id: newVmid, message: 'LXC 容器创建任务已提交' });
    } catch (error) {
        console.error('创建 LXC 容器失败:', error.response?.data || error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/reset-password', authMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const { password } = req.body;

        // P0-C3 修复：vmid 白名单校验，防止命令注入
        if (!Number.isInteger(vmid) || vmid < 100 || vmid > 999999999) {
            return res.status(400).json({ error: '无效的容器 ID' });
        }

        if (!password || password.length < 8) {
            return res.status(400).json({ error: '密码长度至少 8 位' });
        }
 
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';

        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        // 检查容器状态
        const status = await pveApi.getLxcStatus(vmid);
        if (status.status !== 'running') {
            return res.status(400).json({ error: '容器未运行，请先开机再重置密码' });
        }
 
        // C-3 最终修复：使用 stdin 管道传密码，彻底消除 shell 注入
        const host = process.env.PVE_SSH_HOST;
        if (!host) { return res.status(500).json({ error: 'SSH 配置不完整：未设置 PVE_SSH_HOST' }); }
        const sshPassword = process.env.PVE_SSH_PASSWORD;
        if (!sshPassword) { return res.status(500).json({ error: 'SSH 配置不完整：未设置 PVE_SSH_PASSWORD' }); }

        // 密码通过 stdin 传入 chpasswd，完全不接触 shell 解释器
        const { code, stderr } = await execSSHWithStdin(
            host, 'root', sshPassword,
            `lxc-attach -n ${vmid} -- chpasswd`,
            `root:${password}\n`,
            30000
        );
        if (code !== 0) {
            return res.status(500).json({ error: '密码重置失败: ' + (stderr || 'lxc-attach 命令执行出错') });
        }
        res.json({ message: '密码重置成功' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});

router.get('/lxc/random-ip', authMiddleware, async (req, res) => {
    try {
        const ip = await pickUnusedStaticIp();
        if (!ip) {
            return res.status(400).json({ error: '无可用 IP' });
        }
        res.json({ ip });
    } catch (error) {
        res.status(500).json({ error: '获取随机 IP 失败' });
    }
});

router.post('/lxc/:vmid/reset-ip', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);
        const { ip_mode, ip } = req.body; // ip_mode: 'dhcp' 或 'static'

        // 参数校验
        if (!ip_mode || !['dhcp', 'static', 'random'].includes(ip_mode)) {
            return res.status(400).json({ error: '无效的 IP 模式，请选择 DHCP、静态 IP 或随机' });
        }

        // 权限检查
        const allCts = await db.lxcContainers.getAll();
        const ct = allCts.find(c => c.ct_id === vmid);
        const isAdmin = req.user.role === 'admin';
        if (ct) {
            const isOwner = req.user.id === ct.user_id;
            if (!isOwner && !isAdmin) {
                return res.status(403).json({ error: '无权限操作此容器' });
            }
            // R3-10 修复：非管理员用户关机/停止时检查到期时间
            if (isOwner && !isAdmin && ct.expiration_date && new Date(ct.expiration_date) < new Date()) {
                return res.status(403).json({ error: '容器已到期，请联系管理员续费' });
            }
        } else if (!isAdmin) {
            return res.status(403).json({ error: '无权限操作此容器，资源未分配' });
        }

        // 获取当前配置
        const config = await pveApi.getLxcConfig(vmid);
        if (!config || !config.net0) {
            return res.status(400).json({ error: '无法获取容器网络配置' });
        }

        // 解析 net0 中的 MAC 和其他参数
        const macMatch = config.net0.match(/([0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5})/);
        if (!macMatch) {
            return res.status(400).json({ error: '无法解析容器 MAC 地址' });
        }
        const mac = macMatch[1];

        // 解析 net0 中除 ip/ip6/gw/firewall 之外的其他参数（统一移除，避免重复）
        let net0Parts = config.net0.split(',');
        let newNet0Parts = [];
        let hasFirewall = false;
        for (const part of net0Parts) {
            // 统一移除 ip/ip6/gw/firewall，后面根据模式重新添加
            if (!part.startsWith('ip=') && !part.startsWith('ip6=')
                && !part.startsWith('gw=') && !part.startsWith('firewall=')) {
                newNet0Parts.push(part);
            }
            if (part.startsWith('firewall=')) hasFirewall = true;
        }

        let newIp = '';
        // 从系统配置获取网关地址
        const gateway = await db.config.get('dhcp:gateway') || '10.0.0.1';

        if (ip_mode === 'dhcp') {
            newNet0Parts.push('ip=dhcp');
            newNet0Parts.push('ip6=dhcp');
            // DHCP 模式不添加 gw 和 firewall
        } else if (ip_mode === 'static') {
            if (!ip) {
                return res.status(400).json({ error: '请输入 IP 地址' });
            }
            // 验证 IP 格式
            const ipBase = ip.split('/')[0];
            if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(ipBase)) {
                return res.status(400).json({ error: 'IP 地址格式不正确' });
            }
            const cidr = ip.includes('/') ? ip : ip + '/24';
            newNet0Parts.push('ip=' + cidr);
            newNet0Parts.push('ip6=dhcp');
            newNet0Parts.push('gw=' + gateway);
            newIp = ipBase;
        } else if (ip_mode === 'random') {
            const randomIp = await pickUnusedStaticIp();
            if (!randomIp) {
                return res.status(400).json({ error: '无可用 IP，请手动输入' });
            }
            newNet0Parts.push('ip=' + randomIp + '/24');
            newNet0Parts.push('ip6=dhcp');
            newNet0Parts.push('gw=' + gateway);
            newIp = randomIp;
        } else {
            // fallback: 默认 DHCP
            newNet0Parts.push('ip=dhcp');
            newNet0Parts.push('ip6=dhcp');
        }

        const newNet0 = newNet0Parts.join(',');

        // H-12 修复：net0 含内网信息，生产环境脱敏
        if (process.env.DEBUG === 'true') {
            console.log(`[reset-ip] LXC ${vmid} 原始 net0: ${config.net0}`);
            console.log(`[reset-ip] LXC ${vmid} 新 net0: ${newNet0} (mode=${ip_mode})`);
        } else {
            console.log(`[reset-ip] LXC ${vmid} 网络配置已更新`);
        }

        // 检查容器状态，运行中需要先关机
        let wasRunning = false;
        try {
            const currentStatus = await pveApi.getLxcStatus(vmid);
            if (currentStatus && currentStatus.status === 'running') {
                wasRunning = true;
                await pveApi.shutdownLxc(vmid);
                // 等待关机完成
                for (let i = 0; i < 30; i++) {
                    await new Promise(r => setTimeout(r, 2000));
                    const s = await pveApi.getLxcStatus(vmid);
                    if (!s || s.status !== 'running') break;
                }
            }
        } catch (e) {
            console.error(`LXC ${vmid} 关机失败:`, e.message);
        }

        // 更新 PVE 容器网络配置
        try {
            await pveApi.updateLxcConfig(vmid, { net0: newNet0 });
        } catch (pveErr) {
            // 提取 PVE API 的详细错误信息
            let pveDetail = pveErr.message || '未知错误';
            if (pveErr.response && pveErr.response.data) {
                const rd = pveErr.response.data;
                if (typeof rd === 'string') pveDetail = rd;
                else if (rd.errors) pveDetail = JSON.stringify(rd.errors);
                else pveDetail = JSON.stringify(rd);
            }
            console.error(`LXC ${vmid} 更新网络配置失败:`, pveDetail);
            // 如果之前关机了，尝试恢复开机
            if (wasRunning) {
                try { await pveApi.startLxc(vmid); } catch (_) {}
            }
            return res.status(500).json({ error: safeError(pveErr) });
        }

        // 如果之前是运行状态，重新开机
        if (wasRunning) {
            try {
                await pveApi.startLxc(vmid);
            } catch (e) {
                console.error(`LXC ${vmid} 重新开机失败:`, e.message);
            }
        }

        // 更新 ikuai DHCP 静态绑定
        if (newIp && ikuaiApi.isConfigured()) {
            try {
                const bindings = await ikuaiApi.getDhcpStaticBindings();
                const comment = `CT-${vmid}`;
                const existing = bindings.find(b => b.comment === comment);
                if (existing && existing.id) {
                    await ikuaiApi.editDhcpStaticBinding(existing.id, mac, newIp, comment);
                } else {
                    // 没有已有绑定，创建新的
                    const createdIp = await createDhcpStaticBinding('lxc', vmid, mac, newIp);
                    newIp = createdIp || newIp;
                }
            } catch (e) {
                console.error(`LXC ${vmid} 更新 DHCP 静态绑定失败:`, e.message);
            }
        } else if (ip_mode === 'dhcp' && ikuaiApi.isConfigured()) {
            // DHCP 模式下删除静态绑定
            try {
                await removeDhcpStaticBinding('lxc', vmid);
            } catch (e) {
                console.error(`LXC ${vmid} 删除 DHCP 静态绑定失败:`, e.message);
            }
        }

        // 更新数据库中的 dhcp_static_ip
        if (ct) {
            await db.lxcContainers.update(ct.id, { dhcp_static_ip: newIp || '' });
        }

        // 更新端口转发规则中的 IP
        if (newIp) {
            try {
                const rules = await db.portForwards.getByCtId(vmid);
                for (const rule of rules) {
                    await db.portForwards.update(rule.id, { ip: newIp });
                    // 同步更新 ikuai 端口映射
                    if (rule.ikuai_id) {
                        try {
                            await ikuaiApi.editPortForward(rule.ikuai_id, {
                                ip: newIp,
                                internal_port: rule.internal_port,
                                external_port: rule.external_port,
                                protocol: rule.protocol,
                                comment: rule.name || '',
                                interface: await db.config.get('forward:wan_interface') || ''
                            });
                        } catch (e) {
                            console.error(`端口转发 ${rule.id} ikuai 同步失败:`, e.message);
                        }
                    }
                }
            } catch (e) {
                console.error(`LXC ${vmid} 更新端口转发 IP 失败:`, e.message);
            }
        }

        res.json({ message: 'IP 重置成功', ip: newIp || 'DHCP', net0: newNet0 });
    } catch (error) {
        console.error('重置 LXC IP 失败:', error.message);
        res.status(500).json({ error: safeError(error) });
    }
});

router.post('/lxc/:vmid/destroy', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const vmid = parseInt(req.params.vmid);

        // 检查容器状态，必须关机才能销毁
        try {
            const status = await pveApi.getLxcStatus(vmid);
            if (status && status.status === 'running') {
                return res.status(400).json({ error: '容器正在运行，请先关机后再销毁' });
            }
        } catch (e) {
            console.warn(`[lxc] 查询 ${vmid} 状态失败（继续执行销毁）:`, e.message);
        }
        
        // 先解除分配记录
        const assignedCts = await db.lxcContainers.getByCtId(vmid);
        for (const ct of assignedCts) {
            await db.lxcContainers.reminders.clear(ct.id);
            // 级联清理端口转发
            try {
                const lxcForwards = await db.portForwards.getByCtId(ct.ct_id);
                for (const fw of lxcForwards) {
                    if (fw.ikuai_id) {
                        try { ikuaiApi.deletePortForward(fw.ikuai_id); } catch (e) {}
                    }
                }
                await db.portForwards.deleteByDevice('lxc', ct.ct_id);
            } catch (e) { console.error('清理端口转发失败:', e.message); }
            // 清理 DHCP 静态绑定
            if (ct && ct.ct_id) {
                removeDhcpStaticBinding('lxc', ct.ct_id);
            }
            await db.lxcContainers.delete(ct.id);
        }
 
        // 在 PVE 上销毁
        await pveApi.deleteLxc(vmid);
        res.json({ message: 'LXC 容器已销毁' });
    } catch (error) {
        res.status(500).json({ error: safeError(error) });
    }
});


module.exports = router;
