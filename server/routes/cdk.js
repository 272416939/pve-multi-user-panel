const express = require('express');
const router = express.Router();
const db = require('../api/db');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');
const { generateUniqueCdkCode } = require('../utils/cdk-generator');
const { safeError } = require('../utils/safe-error');
// 业务下沉 services/（规范第七节）：CDK 兑换/批量生成走 services/cdk.js
const cdkService = require('../services/cdk');
const pveApi = require('../api/pve-api');

const { checkConfiguredRateLimit } = require('../middleware/rate-limiter');

async function checkCdkRateLimit(userId, ip) {
    return checkConfiguredRateLimit('cdk', `ratelimit:cdk:${userId}:${ip}`);
}

router.post('/admin/cdk/generate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { duration_days, expires_at } = req.body;
 
        if (!duration_days || duration_days < 1) {
            return res.status(400).json({ error: '请提供有效的续费天数', code: 'RENEW_DAYS_REQUIRED' });
        }
 
        const code = await generateUniqueCdkCode();
        const newCdk = await db.cdk.create({
            code,
            duration_days: parseInt(duration_days),
            created_by: req.user.id,
            expires_at: expires_at || null
        });
 
        // 操作审计：生成 CDK
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cdk.generate', resourceType: 'cdk', resourceId: newCdk.id, details: '生成CDK 1 张(续费' + parseInt(duration_days) + '天)', req });
        } catch (e) {}
        res.json(newCdk);
    } catch (error) {
        console.error('生成 CDK 失败:', error);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

// 批量生成（业务在 services/cdk.js）
router.post('/admin/cdk/batch-generate', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await cdkService.batchGenerateCdk({
            duration_days: req.body.duration_days,
            count: req.body.count,
            expires_at: req.body.expires_at,
            target_user_ids: req.body.target_user_ids,
            created_by: req.user.id
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error , code: result.code });
        }
        // 操作审计：批量生成 CDK
        try {
            const { auditLog } = require('../utils/audit-log');
            var generatedCount = result.data && typeof result.data.count === 'number' ? result.data.count
                : (result.data && Array.isArray(result.data.cdks) ? result.data.cdks.length : '');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cdk.generate', resourceType: 'cdk', details: '批量生成CDK ' + generatedCount + ' 张(续费' + parseInt(req.body.duration_days) + '天)', req });
        } catch (e) {}
        res.json(result.data);
    } catch (error) {
        console.error('批量生成 CDK 失败:', error);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});

router.get('/admin/cdk/list', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.cdk.getPaginated({
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 20
        });
        res.json(result);
    } catch (error) {
        console.error('获取 CDK 列表失败:', error);
        res.status(500).json({ error: '获取 CDK 列表失败', code: 'CDK_LIST_FAILED' });
    }
});

router.get('/admin/cdk/export', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { batch_id } = req.query;
        let cdkList;
        
        if (batch_id) {
            cdkList = await db.cdk.getByBatchId(batch_id);
        } else {
            cdkList = await db.cdk.getAll();
        }
 
        // 构建 CSV（V4-06 修复：全字段统一转义，防公式注入 + 逗号/引号错位）
        const headers = '兑换码,续费天数,批次号,分配用户,创建时间,有效期,状态,使用用户,使用VM,使用时间';
        const { escapeCsvField } = require('../utils/csv');
        const rows = cdkList.map(c => {
            const status = c.is_used ? '已使用' : (c.expires_at && new Date(c.expires_at) <= new Date() ? '已过期' : '未使用');
            const usedUser = c.used_username || '';
            const usedVm = c.used_vm_name || (c.used_vm_vmid ? 'VM ' + c.used_vm_vmid : '');
            return [
                escapeCsvField(c.code),
                escapeCsvField(c.duration_days),
                escapeCsvField(c.batch_id || ''),
                escapeCsvField(c.target_username || ''),
                escapeCsvField(c.created_at),
                escapeCsvField(c.expires_at || ''),
                escapeCsvField(status),
                escapeCsvField(usedUser),
                escapeCsvField(usedVm),
                escapeCsvField(c.used_at || '')
            ].join(',');
        });
 
        const csv = '\uFEFF' + headers + '\n' + rows.join('\n');
 
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=cdk-codes-${Date.now()}.csv`);
        res.send(csv);
    } catch (error) {
        console.error('导出 CDK 失败:', error);
        res.status(500).json({ error: '导出 CDK 失败', code: 'CDK_EXPORT_FAILED' });
    }
});

router.delete('/admin/cdk/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const cdk = await db.cdk.getById(id);
        
        if (!cdk) {
            return res.status(404).json({ error: 'CDK 不存在', code: 'CDK_NOT_FOUND' });
        }
 
        await db.cdk.delete(id);
        // 操作审计：删除 CDK
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cdk.delete', resourceType: 'cdk', resourceId: id, details: '删除CDK #' + id + '(续费' + (cdk.duration_days || '-') + '天)', req });
        } catch (e) {}
        res.json({ message: 'CDK 删除成功' });
    } catch (error) {
        console.error('删除 CDK 失败:', error);
        res.status(500).json({ error: '删除 CDK 失败', code: 'CDK_DELETE_FAILED' });
    }
});

router.post('/admin/cdk/cleanup', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const result = await db.cdk.deleteExpiredOrUsed();
        // 操作审计：清理过期/已用 CDK
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cdk.delete', resourceType: 'cdk', details: '清理过期/已用CDK ' + (result.changes || 0) + ' 张', req });
        } catch (e) {}
        res.json({ message: '清理完成', deleted: result.changes });
    } catch (error) {
        console.error('清理 CDK 失败:', error);
        res.status(500).json({ error: '清理 CDK 失败', code: 'CDK_CLEAN_FAILED' });
    }
});

router.post('/admin/cdk/batch-delete', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: '请提供要删除的 CDK ID 列表', code: 'CDK_IDS_REQUIRED' });
        }
        await db.cdk.deleteBatch(ids.map(id => parseInt(id)));
        // 操作审计：批量删除 CDK
        try {
            const { auditLog } = require('../utils/audit-log');
            await auditLog({ userId: req.user.id, username: req.user.username, action: 'admin.cdk.delete', resourceType: 'cdk', details: '批量删除CDK ' + ids.length + ' 张', req });
        } catch (e) {}
        res.json({ message: `成功删除 ${ids.length} 个 CDK` });
    } catch (error) {
        console.error('批量删除 CDK 失败:', error);
        res.status(500).json({ error: '批量删除 CDK 失败', code: 'CDK_BATCH_DELETE_FAILED' });
    }
});

router.get('/user/cdk/redeemable-vms', authMiddleware, async (req, res) => {
    try {
        // L-12 修复：对每台 VM 外呼 PVE，加用户级限速（admin 可配置）
        const listRate = await checkConfiguredRateLimit('cdk_redeemable', 'ratelimit:cdk-redeemable:' + req.user.id);
        if (!listRate.allowed) return res.status(429).json({ error: '查询过于频繁，请稍后再试', code: 'RATE_LIMITED_QUERY', retryAfter: listRate.retryAfter });

        let userVms;
        userVms = await db.vms.getByUserId(req.user.id);
        
        const vmsWithDetails = [];
        for (const vm of userVms) {
            try {
                const status = await pveApi.getVmStatus(vm.vm_id);
                vmsWithDetails.push({
                    id: vm.id,
                    vm_id: vm.vm_id,
                    name: vm.name || 'VM ' + vm.vm_id,
                    expiration_date: vm.expiration_date,
                    status: status?.status
                });
            } catch (error) {
                vmsWithDetails.push({
                    id: vm.id,
                    vm_id: vm.vm_id,
                    name: vm.name || 'VM ' + vm.vm_id,
                    expiration_date: vm.expiration_date,
                    status: null
                });
            }
        }
        
        res.json(vmsWithDetails);
    } catch (error) {
        res.status(500).json({ error: '获取虚拟机列表失败', code: 'VM_LIST_LOAD_FAILED' });
    }
});

// 用户兑换（业务在 services/cdk.js）
router.post('/user/cdk/redeem', authMiddleware, async (req, res) => {
    try {
        const cdkRate = await checkCdkRateLimit(req.user.id, req.ip);
        if (!cdkRate.allowed) {
            return res.status(429).json({ error: 'CDK 兑换操作过于频繁，请稍后再试', code: 'RATE_LIMITED_CDK_REDEEM', retryAfter: cdkRate.retryAfter });
        }

        const result = await cdkService.redeemCdk({
            userId: req.user.id,
            code: req.body.code,
            vm_id: req.body.vm_id,
            container_id: req.body.container_id,
            req: req
        });
        if (!result.ok) {
            return res.status(result.status).json({ error: result.error , code: result.code });
        }
        res.json(result.data);
    } catch (error) {
        console.error('兑换 CDK 失败:', error);
        res.status(500).json({ error: safeError(error), code: 'INTERNAL_ERROR' });
    }
});


module.exports = router;
