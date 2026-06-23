(function() {
    var token = localStorage.getItem('token');
    if (!token) return;
    fetch('/api/version', { headers: { 'Authorization': 'Bearer ' + token } }).then(function(r){ if(!r.ok) throw new Error('unauth'); return r.json() }).then(function(d) {
        var v = 'v' + d.version;
        var el = document.getElementById('appVersion');
        if (el) el.textContent = v;
        el = document.getElementById('currentVersion');
        if (el) el.textContent = v;
    }).catch(function(){});
})();
