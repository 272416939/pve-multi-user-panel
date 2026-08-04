(function() {
  var parts = window.__adminTemplateParts;
  if (parts && parts.length > 0) {
    var el = document.getElementById("appTemplate");
    if (el) {
      // 模板片段自包含根节点（规范第七节：装配器纯拼接，不做 div 配平 hack）
      el.innerHTML = parts.join("\n\n");
    }
  }
})();
