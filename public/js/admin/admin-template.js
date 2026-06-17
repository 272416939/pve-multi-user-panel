(function() {
  var parts = window.__adminTemplateParts;
  if (parts && parts.length > 0) {
    var el = document.getElementById("appTemplate");
    if (el) {
      el.innerHTML = parts.join("\n\n") + "\n</div>\n</div>\n</div>\n</div>\n</div>\n</div>";
    }
  }
})();
