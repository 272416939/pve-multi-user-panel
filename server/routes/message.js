const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { pushUnreadCount } = require('../websocket/push-proxy');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const cacheStore = require('../utils/cache-store');
// unreadCache 迁移到 cache-store（Redis 优先，内存回退，多实例一致）
const unreadCache = cacheStore.create('unread', 10);

// V3-04 修复：消息内容服务端净化（纵深防御，防 DOMPurify 异常时存储型 XSS）
// 保留基本换行/列表语义，剔除 HTML 标签、javascript: 协议与内联事件
function sanitizeMessageContent(text) {
    var s = String(text == null ? '' : text);
    // 1. 剔除 script/style 块及其内容
    s = s.replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*(script|style)\s*>/gi, '');
    // 2. 剥离剩余 HTML 标签
    s = s.replace(/<[^>]*>/g, '');
    // 3. 剔除危险协议链接（javascript:/data:/vbscript:）
    s = s.replace(/(javascript|data|vbscript)\s*:/gi, '$1&#58;');
    // 4. 截断长度（与服务端限制一致）
    if (s.length > 50000) s = s.substring(0, 50000);
    return s;
}

router.get('/messages', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const type = req.query.type || 'all';
        const result = await db.messages.getByUser(req.user.id, type, page);
        res.json(result);
    } catch (error) {
        console.error('获取消息列表失败:', error);
        res.status(500).json({ error: '获取消息列表失败' });
    }
});

router.get('/messages/unread-count', authMiddleware, async (req, res) => {
    try {
        const cached = await unreadCache.get(String(req.user.id));
        if (cached !== null) return res.json({ count: cached });
        const count = await db.messages.getUnreadCount(req.user.id);
        await unreadCache.set(String(req.user.id), count);
        res.json({ count });
    } catch (error) {
        res.status(500).json({ error: '获取未读数失败' });
    }
});

router.get('/messages/:id', authMiddleware, async (req, res) => {
    try {
        const msg = await db.messages.getById(parseInt(req.params.id));
        if (!msg) return res.status(404).json({ error: '消息不存在' });
        if (msg.uid !== 0 && msg.uid !== req.user.id) return res.status(403).json({ error: '无权限' });
        await db.messages.markRead(msg.id);
        res.json(msg);
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '获取消息失败' });
    }
});

router.put('/messages/:id/read', authMiddleware, async (req, res) => {
    try {
        const msgId = parseInt(req.params.id);
        const msg = await db.messages.getById(msgId);
        if (!msg) return res.status(404).json({ error: '消息不存在' });
        if (msg.uid !== 0 && msg.uid !== req.user.id) {
            return res.status(403).json({ error: '无权限' });
        }
        await db.messages.markRead(msgId);
        res.json({ message: '已标记已读' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败' });
    }
});

router.put('/messages/read-all', authMiddleware, async (req, res) => {
    try {
        await db.messages.markAllRead(req.user.id);
        res.json({ message: '全部标记已读' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败' });
    }
});

router.delete('/messages/:id', authMiddleware, async (req, res) => {
    try {
        await db.messages.delete(parseInt(req.params.id), req.user.id);
        res.json({ message: '消息已删除' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '删除消息失败' });
    }
});

router.delete('/messages', authMiddleware, async (req, res) => {
    try {
        await db.messages.deleteAll(req.user.id);
        res.json({ message: '消息已清空' });
        // 修复：清空消息后失效未读数缓存
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '清空消息失败' });
    }
});

router.post('/admin/messages/send', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { uids, title, content, type, link_url, link_text } = req.body;
        if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
        // V3-04 修复：发送前净化标题与内容（服务端纵深防御）
        const safeTitle = String(title).replace(/<[^>]*>/g, '').substring(0, 500);
        const safeContent = sanitizeMessageContent(content);
        const safeLinkUrl = String(link_url || '').substring(0, 500).replace(/(javascript|data|vbscript)\s*:/gi, '');
        const safeLinkText = String(link_text || '').replace(/<[^>]*>/g, '').substring(0, 200);

        if (!uids || uids.length === 0) {
            const users = await db.users.getAll();
            const batchId = Date.now().toString();
            for (const user of users) {
                await db.messages.create({
                    uid: user.id,
                    title: safeTitle, content: safeContent,
                    type: type || 1,
                    send_type: 2,
                    link_url: safeLinkUrl || '',
                    link_text: safeLinkText || '',
                    batch_id: batchId
                });
            }
            res.json({ message: `已向 ${users.length} 个用户发送消息` });
            await unreadCache.clear();
            pushUnreadCount();
        } else {
            // 多选用户发送
            const uidArr = Array.isArray(uids) ? uids : [uids];
            const batchId = Date.now().toString();
            let sentCount = 0;
            for (const uid of uidArr) {
                const parsedUid = parseInt(uid);
                if (isNaN(parsedUid)) continue;
                const targetUser = await db.users.getById(parsedUid);
                if (!targetUser) continue;
                await db.messages.create({
                    uid: parsedUid,
                    title: safeTitle, content: safeContent,
                    type: type || 5,
                    send_type: 2,
                    link_url: safeLinkUrl || '',
                    link_text: safeLinkText || '',
                    batch_id: batchId
                });
                sentCount++;
            }
            res.json({ message: `消息已发送给 ${sentCount} 个用户` });
            for (const uid of uidArr) { await unreadCache.del(String(parseInt(uid))); }
            pushUnreadCount();
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        res.status(500).json({ error: '发送消息失败' });
    }
});

router.get('/admin/messages/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const stats = await db.messages.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: '获取统计失败' });
    }
});


module.exports = router;
