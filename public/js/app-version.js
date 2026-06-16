(function() {
    fetch('/api/version').then(function(r){return r.json()}).then(function(d) {
        var v = 'v' + d.version;
        var el = document.getElementById('appVersion');
        if (el) el.textContent = v;
        el = document.getElementById('currentVersion');
        if (el) el.textContent = v;
    });
})();