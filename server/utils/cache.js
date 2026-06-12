const stores = {};

function ttl(storeName, ttlMs) {
    if (!stores[storeName]) {
        stores[storeName] = { map: new Map(), ttl: ttlMs || 60000 };
    }
    var s = stores[storeName];
    return {
        get: function(key) {
            var entry = s.map.get(key);
            if (!entry) return undefined;
            if (Date.now() - entry.ts > s.ttl) {
                s.map.delete(key);
                return undefined;
            }
            return entry.value;
        },
        set: function(key, value) {
            s.map.set(key, { value: value, ts: Date.now() });
        },
        del: function(key) {
            s.map.delete(key);
        },
        clear: function() {
            s.map.clear();
        }
    };
}

setInterval(function() {
    var now = Date.now();
    for (var name in stores) {
        var s = stores[name];
        for (var entry of s.map) {
            if (now - entry[1].ts > s.ttl) {
                s.map.delete(entry[0]);
            }
        }
    }
}, 60000);

module.exports = { ttl };
