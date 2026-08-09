/* ============================================
 * select-glass.js — 原生 form-select 玻璃化包裹器（三端共用）
 * --------------------------------------------
 * 将 select.form-select 无侵入包裹为 .custom-select 玻璃下拉组件：
 * - 原生 select 保留在 DOM（v-model / 表单提交 / required 校验继续工作），
 *   仅绝对定位 + 透明隐藏（不用 display:none，避免跳过 HTML5 required 校验）
 * - 展开弹层挂载 document.body（避开 modal-content backdrop-filter
 *   导致 position:fixed 降级的坑，等价 CDK 的 Teleport 方案）
 * - 打开时从 select.options 实时重建选项列表（支持 Vue 动态 options）
 * - MutationObserver 自动处理 Vue v-if / 弹窗渲染出来的新 select
 * 样式权威：public/shared/css/components.css 的 .custom-select-*（SaaS 覆盖在 template-saas.css）
 * ============================================ */
(function () {
    'use strict';
    if (window.__selectGlassBound) return;
    window.__selectGlassBound = true;

    var active = null; // 当前打开的 { wrapper, dropdown, select, trigger }

    function closeAll() {
        if (!active) return;
        var a = active;
        active = null;
        a.wrapper.classList.remove('open');
        a.dropdown.style.display = 'none';
        if (window.releaseFixedDropdown) window.releaseFixedDropdown(a.dropdown);
    }

    function build(select) {
        var isSm = select.classList.contains('form-select-sm');
        // wrapper
        var wrapper = document.createElement('div');
        wrapper.className = 'custom-select' + (isSm ? ' custom-select-sm' : '');
        // trigger
        var trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        trigger.setAttribute('role', 'button');
        trigger.setAttribute('tabindex', '0');
        var textEl = document.createElement('span');
        textEl.className = 'custom-select-text';
        trigger.appendChild(textEl);
        wrapper.appendChild(trigger);
        // 弹层挂 body：避开 modal backdrop-filter 的 fixed 降级
        var dropdown = document.createElement('div');
        dropdown.className = 'custom-select-dropdown' + (isSm ? ' custom-select-dropdown-sm' : '');
        dropdown.style.display = 'none';
        document.body.appendChild(dropdown);
        wrapper.__dropdown = dropdown;
        // 隐藏原生 select：保留 DOM 语义（表单提交 / required 校验 / v-model）
        // 注意：不覆盖 width/height（select 可能带 style="width:140px" 内联宽度，需要继承）
        select.style.cssText = (select.style.cssText ? select.style.cssText + ';' : '') +
            'position:absolute;opacity:0;pointer-events:none;';
        select.insertAdjacentElement('beforebegin', wrapper);
        if (select.disabled) wrapper.classList.add('disabled');

        // 宽度继承原 select：优先内联 style（如 style="width:140px"），其次取渲染宽度
        // （隐藏弹窗内 select 初始 rect 为 0，打开时再补）
        function syncWidth() {
            if (wrapper.style.width) return;
            var inline = select.style.width;
            if (inline && inline !== 'auto') { wrapper.style.width = inline; return; }
            var r = select.getBoundingClientRect();
            if (r.width > 0) wrapper.style.width = r.width + 'px';
        }
        syncWidth();

        // 占位文本：第一个 value==='' 的 option（如「全部」「请选择」）
        function placeholderText() {
            for (var i = 0; i < select.options.length; i++) {
                if (select.options[i].value === '') return select.options[i].textContent.trim();
            }
            return '请选择';
        }
        // trigger 文本与原生 select 同步
        function syncText() {
            var idx = select.selectedIndex;
            if (idx >= 0 && select.options[idx] && select.options[idx].value !== '') {
                textEl.textContent = select.options[idx].textContent.trim();
                textEl.className = 'custom-select-text';
            } else {
                textEl.textContent = placeholderText();
                textEl.className = 'custom-select-text custom-select-placeholder';
            }
        }

        function open() {
            closeAll();
            if (select.disabled) return;
            syncWidth();
            // 打开时重建选项（select.options 实时来源，支持 Vue 动态选项/回填）
            dropdown.innerHTML = '';
            for (var i = 0; i < select.options.length; i++) {
                (function (opt) {
                    var el = document.createElement('div');
                    el.className = 'option';
                    if (opt.disabled) el.classList.add('disabled');
                    if (opt.value === select.value) el.classList.add('selected');
                    el.textContent = opt.textContent.trim();
                    el.addEventListener('click', function (e) {
                        e.stopPropagation();
                        if (opt.disabled) return;
                        select.value = opt.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                        syncText();
                        close();
                    });
                    dropdown.appendChild(el);
                })(select.options[i]);
            }
            dropdown.style.display = 'block';
            wrapper.classList.add('open');
            if (window.positionFixedDropdown) window.positionFixedDropdown(trigger, dropdown);
            // 弹层宽度至少等于触发器宽度（positionFixedDropdown 固定 minWidth 160px，此处补足）
            var tw = trigger.getBoundingClientRect().width;
            dropdown.style.minWidth = Math.max(tw, 160) + 'px';
            active = { wrapper: wrapper, dropdown: dropdown, select: select, trigger: trigger };
        }
        function close() {
            if (active && active.dropdown === dropdown) active = null;
            wrapper.classList.remove('open');
            dropdown.style.display = 'none';
            if (window.releaseFixedDropdown) window.releaseFixedDropdown(dropdown);
        }
        function toggle() {
            if (dropdown.style.display === 'block') close();
            else open();
        }

        trigger.addEventListener('click', function (e) { e.stopPropagation(); toggle(); });
        trigger.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
            else if (e.key === 'Escape') { e.preventDefault(); close(); }
        });
        select.addEventListener('change', syncText);
        // Vue 重渲染 option 列表时同步 trigger 文本
        var optMo = new MutationObserver(syncText);
        optMo.observe(select, { childList: true, subtree: true, characterData: true });
        window.addEventListener('resize', closeAll);
        // 滚动（捕获模式覆盖弹窗内滚动）时关闭，避免 fixed 弹层错位；弹层自身滚动除外
        window.addEventListener('scroll', function (e) {
            if (e.target !== dropdown) closeAll();
        }, true);
        syncText();
    }

    function scan(root) {
        var sels = root.querySelectorAll ? root.querySelectorAll('select.form-select:not([data-glass-bound])') : [];
        for (var i = 0; i < sels.length; i++) {
            var sel = sels[i];
            sel.dataset.glassBound = '1';
            try { build(sel); } catch (e) { console.error('select-glass 包裹失败:', e); }
        }
    }

    // 初始扫描 + 动态扫描（Vue v-if 切换 section / 弹窗打开渲染）
    if (document.body) scan(document.body);
    var mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
            var added = muts[i].addedNodes;
            for (var j = 0; j < added.length; j++) {
                var n = added[j];
                if (n.nodeType !== 1) continue;
                if (n.matches && n.matches('select.form-select:not([data-glass-bound])')) {
                    n.dataset.glassBound = '1';
                    try { build(n); } catch (e) { console.error('select-glass 包裹失败:', e); }
                } else if (n.querySelectorAll) {
                    scan(n);
                }
            }
            // Vue v-if 销毁 wrapper 时清理挂载在 body 上的弹层，防泄漏
            var removed = muts[i].removedNodes;
            for (var k = 0; k < removed.length; k++) {
                var rn = removed[k];
                if (rn.nodeType !== 1) continue;
                var w = rn.matches && rn.matches('.custom-select') ? rn : (rn.querySelectorAll ? rn.querySelector('.custom-select') : null);
                if (w && w.__dropdown) {
                    try { w.__dropdown.remove(); } catch (e) {}
                    if (active && active.wrapper === w) active = null;
                }
            }
        }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // 点击外部任意处关闭打开的弹层
    document.addEventListener('click', function (e) {
        if (active && !active.wrapper.contains(e.target) && !active.dropdown.contains(e.target)) {
            closeAll();
        }
    });
})();
