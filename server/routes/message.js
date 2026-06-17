const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { pushUnreadCount } = require('../websocket/push-proxy');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { createEmailTemplate, sendEmail } = require('../utils/email');
const { ttl: cache } = require('../utils/cache');
const unreadCache = cache('unread', 10000);
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
        const cached = unreadCache.get(req.user.id);
        if (cached !== undefined) return res.json({ count: cached });
        const count = await db.messages.getUnreadCount(req.user.id);
        unreadCache.set(req.user.id, count);
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
        unreadCache.del(req.user.id);
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
        unreadCache.del(req.user.id);
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败' });
    }
});

router.put('/messages/read-all', authMiddleware, async (req, res) => {
    try {
        await db.messages.markAllRead(req.user.id);
        res.json({ message: '全部标记已读' });
        unreadCache.del(req.user.id);
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败' });
    }
});

router.delete('/messages/:id', authMiddleware, async (req, res) => {
    try {
        await db.messages.delete(parseInt(req.params.id), req.user.id);
        res.json({ message: '消息已删除' });
        unreadCache.del(req.user.id);
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '删除消息失败' });
    }
});

router.delete('/messages', authMiddleware, async (req, res) => {
    try {
        await db.messages.deleteAll(req.user.id);
        res.json({ message: '消息已清空' });
    } catch (error) {
        res.status(500).json({ error: '清空消息失败' });
    }
});

router.post('/admin/messages/send', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { uids, title, content, type, link_url, link_text } = req.body;
        if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
        
        if (!uids || uids.length === 0) {
            const users = await db.users.getAll();
            const batchId = Date.now().toString();
            for (const user of users) {
                await db.messages.create({
                    uid: user.id,
                    title, content,
                    type: type || 1,
                    send_type: 2,
                    link_url: link_url || '',
                    link_text: link_text || '',
                    batch_id: batchId
                });
            }
            res.json({ message: `已向 ${users.length} 个用户发送消息` });
            unreadCache.clear();
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
                    title, content,
                    type: type || 5,
                    send_type: 2,
                    link_url: link_url || '',
                    link_text: link_text || '',
                    batch_id: batchId
                });
                sentCount++;
            }
            res.json({ message: `消息已发送给 ${sentCount} 个用户` });
            for (const uid of uidArr) { unreadCache.del(parseInt(uid)); }
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
