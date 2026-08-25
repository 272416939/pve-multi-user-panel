// public/js/shared/log-i18n.js - 日志「操作类型/子分类」分类标识 → i18n key 映射（单一来源）
// 后端列表响应返回 category_key / sub_category_key（见 server/routes/log.js / admin-logs.js），
// 前端据此映射 t() key，使分类列跟随站点语言；禁止在页面 JS 里各自拷贝本映射。
(function () {
    var CAT = {
        user_login: 'dash.log.catUserLogin',
        vm_lxc: 'dash.log.catVmLxc',
        password: 'dash.log.catPassword',
        purchase: 'dash.log.catPurchase',
        disk: 'dash.log.catDisk',
        setting: 'dash.log.catSetting',
        security: 'dash.log.catSecurity',
        admin: 'dash.log.catAdmin'
    };
    var SUB = {
        user: 'admin.sub.user',
        config: 'admin.sub.config',
        disk: 'admin.sub.disk',
        vm: 'admin.sub.vm',
        lxc: 'admin.sub.lxc',
        package: 'admin.sub.package',
        'package-group': 'admin.sub.packageGroup',
        template: 'admin.sub.template',
        'os-template': 'admin.sub.osTemplate',
        region: 'admin.sub.region',
        zone: 'admin.sub.zone',
        'email-template': 'admin.sub.emailTemplate',
        i18n: 'admin.sub.i18n',
        cdk: 'admin.sub.cdk',
        backup: 'admin.sub.backup',
        message: 'admin.sub.message',
        network: 'admin.sub.network',
        order: 'admin.sub.order',
        log: 'admin.sub.log',
        cache: 'admin.sub.cache',
        system: 'admin.sub.system',
        security: 'admin.sub.security'
    };
    window.__logI18n = {
        // 操作日志分类标识 → t() key；未知返回 ''（模板兜底显示原文）
        cat: function (k) { return CAT[k] || ''; },
        // 后台操作二级子域标识 → t() key；未知返回 ''
        sub: function (k) { return SUB[k] || ''; }
    };
})();
