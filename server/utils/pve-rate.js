const pveCounterCache = new Map();

function _applyRate(key, statusData) {
    if (!statusData || typeof statusData !== 'object') return statusData;
    const fields = ['netin', 'netout', 'diskread', 'diskwrite'];
    const hasCounter = fields.some(f => typeof statusData[f] === 'number');
    if (!hasCounter) return statusData;

    const now = Date.now();
    const prev = pveCounterCache.get(key);
    const result = { ...statusData };

    if (prev && prev._timestamp && (now - prev._timestamp) > 0) {
        const dt = (now - prev._timestamp) / 1000;
        for (const field of fields) {
            if (typeof statusData[field] === 'number' && typeof prev[field] === 'number') {
                const diff = statusData[field] - prev[field];
                result[field] = diff >= 0 ? diff / dt : 0;
            }
        }
    } else {
        for (const field of fields) {
            if (typeof statusData[field] === 'number') {
                result[field] = 0;
            }
        }
    }

    const entry = { _timestamp: now };
    for (const field of fields) {
        if (typeof statusData[field] === 'number') {
            entry[field] = statusData[field];
        }
    }
    pveCounterCache.set(key, entry);

    return result;
}

function clearExpiredCache() {
    const expire = Date.now() - 2 * 3600 * 1000;
    for (const [key, val] of pveCounterCache) {
        if (val._timestamp < expire) {
            pveCounterCache.delete(key);
        }
    }
}

// 每小时清理过期的速率限制缓存，防止内存泄漏
setInterval(() => {
    clearExpiredCache();
}, 3600000).unref();

module.exports = { _applyRate, clearExpiredCache };
