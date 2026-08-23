const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { pushUnreadCount } = require('../websocket/push-proxy');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const cacheStore = require('../utils/cache-store');
// unreadCache 迁移到 cache-store（Redis 优先，内存回退，多实例一致）
const unreadCache = cacheStore.create('unread', 10);
// V4-05 修复：净化函数下沉到 utils/message-sanitize.js（db-messaging.create 已统一调用，此处复用共享实现）
const { sanitizeTitle, sanitizeMessageContent, sanitizeLinkUrl, sanitizeLinkText } = require('../utils/message-sanitize');

router.get('/messages', authMiddleware, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 200);
        const type = req.query.type || 'all';
        const result = await db.messages.getByUser(req.user.id, type, page, limit);
        res.json(result);
    } catch (error) {
        console.error('获取消息列表失败:', error);
        res.status(500).json({ error: '获取消息列表失败', code: 'MESSAGE_LIST_FAILED' });
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
        res.status(500).json({ error: '获取未读数失败', code: 'UNREAD_LOAD_FAILED' });
    }
});

router.get('/messages/:id', authMiddleware, async (req, res) => {
    try {
        const msg = await db.messages.getById(parseInt(req.params.id));
        if (!msg) return res.status(404).json({ error: '消息不存在', code: 'MESSAGE_NOT_FOUND' });
        if (msg.uid !== 0 && msg.uid !== req.user.id) return res.status(403).json({ error: '无权限', code: 'FORBIDDEN' });
        await db.messages.markRead(msg.id);
        res.json(msg);
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '获取消息失败', code: 'MESSAGE_LOAD_FAILED' });
    }
});

router.put('/messages/:id/read', authMiddleware, async (req, res) => {
    try {
        const msgId = parseInt(req.params.id);
        const msg = await db.messages.getById(msgId);
        if (!msg) return res.status(404).json({ error: '消息不存在', code: 'MESSAGE_NOT_FOUND' });
        if (msg.uid !== 0 && msg.uid !== req.user.id) {
            return res.status(403).json({ error: '无权限', code: 'FORBIDDEN' });
        }
        await db.messages.markRead(msgId);
        res.json({ message: '已标记已读' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败', code: 'MARK_READ_FAILED' });
    }
});

router.put('/messages/read-all', authMiddleware, async (req, res) => {
    try {
        await db.messages.markAllRead(req.user.id);
        res.json({ message: '全部标记已读' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '标记已读失败', code: 'MARK_READ_FAILED' });
    }
});

router.delete('/messages/:id', authMiddleware, async (req, res) => {
    try {
        await db.messages.delete(parseInt(req.params.id), req.user.id);
        // 操作审计：删除消息
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'setting.message.delete', details: '删除消息1条', req });
        } catch (_) {}
        res.json({ message: '消息已删除' });
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '删除消息失败', code: 'MESSAGE_DELETE_FAILED' });
    }
});

router.delete('/messages', authMiddleware, async (req, res) => {
    try {
        // 先统计将删除的已读消息条数（操作审计用）
        let deletedCount = 0;
        try {
            const pool = require('../api/db').getPool();
            const [rows] = await pool.execute('SELECT COUNT(*) AS c FROM messages WHERE (uid = ? OR uid = 0) AND is_read = 1', [req.user.id]);
            deletedCount = rows && rows[0] ? rows[0].c : 0;
        } catch (_) {}
        await db.messages.deleteAll(req.user.id);
        // 操作审计：删除消息 N 条
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'setting.message.delete', details: '删除消息' + deletedCount + '条', req });
        } catch (_) {}
        res.json({ message: '消息已清空' });
        // 修复：清空消息后失效未读数缓存
        await unreadCache.del(String(req.user.id));
        pushUnreadCount();
    } catch (error) {
        res.status(500).json({ error: '清空消息失败', code: 'MESSAGE_CLEAR_FAILED' });
    }
});

router.post('/admin/messages/send', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { uids, title, content, type, link_url, link_text } = req.body;
        if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空', code: 'TITLE_CONTENT_REQUIRED' });
        // V3-04/V4-05 修复：发送前净化标题与内容（服务端纵深防御，与 create 统一净化幂等）
        const safeTitle = sanitizeTitle(title);
        const safeContent = sanitizeMessageContent(content);
        const safeLinkUrl = sanitizeLinkUrl(link_url);
        const safeLinkText = sanitizeLinkText(link_text);

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
            // 操作审计：全站群发消息
            try {
                const { auditLog } = require('../utils/audit-log');
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.message.broadcast', resourceType: 'message', details: '群发消息 ' + users.length + ' 条(标题:' + safeTitle + ')', req });
            } catch (e) {}
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
            // 操作审计：多选用户发送消息
            try {
                const { auditLog } = require('../utils/audit-log');
                await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.message.broadcast', resourceType: 'message', details: '发送消息 ' + sentCount + ' 条(标题:' + safeTitle + ')', req });
            } catch (e) {}
            res.json({ message: `消息已发送给 ${sentCount} 个用户` });
            for (const uid of uidArr) { await unreadCache.del(String(parseInt(uid))); }
            pushUnreadCount();
        }
    } catch (error) {
        console.error('发送消息失败:', error);
        res.status(500).json({ error: '发送消息失败', code: 'MESSAGE_SEND_FAILED' });
    }
});

router.get('/admin/messages/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const stats = await db.messages.getStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: '获取统计失败', code: 'STATS_LOAD_FAILED' });
    }
});


module.exports = router;
