(function() {
    if (window.__adminTemplateParts) {
        window.__adminTemplateParts.push('\
<div v-if="activeSection === \'port-forward\'">\
    <port-forward-list></port-forward-list>\
</div>\
        ');
    }
})();
