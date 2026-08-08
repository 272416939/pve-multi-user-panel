/**
 * 邮件异步队列（BullMQ + Redis）
 *
 * 背景：历史上全部邮件调用点同步 await sendEmail，SMTP 网络往返直接拖慢
 * 用户请求（购买磁盘/开通 VM/充值到账/验证码等）。本模块将通知类邮件改为
 * Redis 队列异步发送：入队毫秒级返回，进程内 Worker 消费发送。
 *
 * 降级策略（沿用项目"Redis 不可用 → 内存/DB 回退"风格）：
 * - Redis 未配置 / 入队失败 → 直接同步发送，保证邮件不丢、功能可用
 *
 * 调用约定：通知类邮件用 enqueueEmail（永不抛异常）；验证码/换绑等需要
 * 立即反馈发送结果的场景仍直接调 utils/email.js 的 sendEmail（同步）。
 */

const { Queue, Worker } = require('bullmq');

const QUEUE_NAME = 'email';

let _queue = null;   // 生产端 Queue
let _worker = null;  // 消费端 Worker

// 进程内统计（供管理端 stats 接口；failed 事件在重试耗尽后写入）
let _stats = {
    lastError: null,
    lastFailedAt: null,
    failedCount: 0
};

// 惰性获取队列：模块加载时 Redis 未必就绪（启动流程：DB 读 Redis 配置 → env → 初始化连接）
function getQueue() {
    var redisClient = require('../api/redis').getRedisClient();
    if (!redisClient) return null;
    if (!_queue) {
        _queue = new Queue(QUEUE_NAME, { connection: redisClient });
    }
    return _queue;
}

/**
 * 入队一封通知类邮件（异步发送）。永不抛异常：
 * - Redis 不可用 / 入队失败 → 降级直接同步发送（保证邮件送达）
 * @param {string} to - 收件人邮箱
 * @param {string} subject - 邮件主题
 * @param {string} html - 邮件 HTML 内容
 * @returns {Promise<boolean>} true=已入队；false=降级同步发送
 */
async function enqueueEmail(to, subject, html) {
    try {
        var queue = getQueue();
        if (!queue) {
            // Redis 未配置：降级同步发送
            await require('../utils/email').sendEmail(to, subject, html);
            return false;
        }
        await queue.add(QUEUE_NAME, { to, subject, html }, {
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
            removeOnComplete: { count: 500 },
            removeOnFail: { count: 100 }
        });
        return true;
    } catch (e) {
        // 入队失败（Redis 瞬断等）：降级同步发送，保证邮件不丢
        console.error('[email-queue] 入队失败，降级同步发送:', e.message);
        try {
            await require('../utils/email').sendEmail(to, subject, html);
        } catch (sendErr) {
            console.error('[email-queue] 降级同步发送失败:', sendErr.message);
        }
        return false;
    }
}

/**
 * 启动邮件消费 Worker（随主进程启动，server.js 中 Redis 初始化后调用）。
 * Redis 未配置时跳过（所有邮件走同步降级路径）。
 */
function startEmailWorker() {
    try {
        var redisModule = require('../api/redis');
        var redisClient = redisModule.getRedisClient();
        if (!redisClient) return null;

        // Worker 需要独立连接（阻塞式命令），不能复用主连接；getRedis() 按 env 配置新建连接
        var workerConnection = redisModule.getRedis();
        var worker = new Worker(QUEUE_NAME, async (job) => {
            var payload = job.data || {};
            if (!payload.to || !payload.subject || !payload.html) {
                throw new Error('邮件任务数据不完整');
            }
            await require('../utils/email').sendEmail(payload.to, payload.subject, payload.html);
        }, {
            connection: workerConnection,
            concurrency: 5
        });

        worker.on('failed', (job, err) => {
            _stats.lastError = String((err && err.message) || err || '未知错误').slice(0, 300);
            _stats.lastFailedAt = new Date().toLocaleString('zh-CN');
            _stats.failedCount++;
            console.error('[email-queue] 邮件发送失败(已重试' + ((job && job.attemptsMade) || 0) + '次):', _stats.lastError);
        });
        worker.on('error', (err) => {
            console.error('[email-queue] Worker 连接错误:', err && err.message);
        });

        _worker = worker;
        console.log('[email-queue] 邮件队列 Worker 已启动');
        return worker;
    } catch (e) {
        console.warn('[email-queue] Worker 启动失败（邮件将走同步发送）:', e.message);
        return null;
    }
}

/**
 * 重启队列与 Worker（Redis 配置热更新后调用，server/services/redis-admin.js）。
 */
function restartEmailWorker() {
    try {
        if (_worker) {
            _worker.close();
            _worker = null;
        }
        if (_queue) {
            _queue.close();
            _queue = null;
        }
    } catch (e) {
        // 忽略关闭异常
    }
    return startEmailWorker();
}

/**
 * 获取邮件队列统计（管理端只读接口使用；失败时返回零值，不影响接口）
 * @returns {Promise<{redisEnabled:boolean,pending:number,active:number,failed:number,delayed:number,lastError:string|null,lastFailedAt:string|null,failedCount:number}>}
 */
async function getEmailQueueStats() {
    var stats = {
        redisEnabled: false,
        pending: 0,
        active: 0,
        failed: 0,
        delayed: 0,
        lastError: _stats.lastError,
        lastFailedAt: _stats.lastFailedAt,
        failedCount: _stats.failedCount
    };
    try {
        var queue = getQueue();
        if (!queue) return stats;
        stats.redisEnabled = true;
        var counts = await queue.getJobCounts('waiting', 'active', 'failed', 'delayed');
        stats.pending = counts.waiting || 0;
        stats.active = counts.active || 0;
        stats.failed = counts.failed || 0;
        stats.delayed = counts.delayed || 0;
    } catch (e) {
        console.error('[email-queue] 获取队列统计失败:', e.message);
    }
    return stats;
}

module.exports = { enqueueEmail, startEmailWorker, restartEmailWorker, getEmailQueueStats };
