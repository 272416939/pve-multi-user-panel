(function() {
    if (window.__adminTemplateParts) {
        window.__adminTemplateParts.push('\
<div v-if="activeSection === \'private-network\'">\
    <private-network-list></private-network-list>\
</div>\
        ');
    }
})();
