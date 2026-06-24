from playwright.sync_api import sync_playwright

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--ignore-certificate-errors"])
        ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        msgs = []
        page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: msgs.append(f"[PAGEERROR] {e}"))

        page.goto(URL + "/login", wait_until="networkidle")
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PWD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        page.goto(URL + "/admin?section=packages", wait_until="networkidle")
        page.wait_for_timeout(2500)

        ver = page.evaluate("() => window.__PKG_JS_VERSION || 'unknown'")
        print("=== JS version:", ver)

        has_mousedown = page.evaluate("() => !!(window.packagePage && window.packagePage.handleMouseDown)")
        print("=== handleMouseDown exists:", has_mousedown)

        rows_info = page.evaluate("""() => {
            const trs = document.querySelectorAll('tbody tr[data-drag-id]');
            const spans = document.querySelectorAll('[data-drag-id][data-drag-type="group-vm"]');
            return 'trs=' + trs.length + ' groupSpans=' + spans.length;
        }""")
        print("=== Elements:", rows_info)

        # 检查 tr 是否有 data-drag-id 属性
        attr_check = page.evaluate("""() => {
            const tr = document.querySelector('tbody tr');
            if (!tr) return 'no tr';
            return 'draggable=' + tr.draggable + ' dataDragId=' + tr.getAttribute('data-drag-id') + ' dataDragType=' + tr.getAttribute('data-drag-type') + ' hasMousedown=' + (typeof tr.onmousedown);
        }""")
        print("=== TR attrs:", attr_check)

        # 尝试鼠标拖拽
        order_before = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[data-drag-id]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== Before:", order_before)

        if order_before and order_before != "":
            fb = page.locator('tbody tr[data-drag-id]').nth(1).bounding_box()
            tb = page.locator('tbody tr[data-drag-id]').nth(0).bounding_box()
            print("=== boxes:", fb, tb)
            page.mouse.move(fb['x']+fb['width']/2, fb['y']+fb['height']/2)
            page.mouse.down()
            page.wait_for_timeout(100)
            for s in range(1, 11):
                mx = fb['x'] + (tb['x']-fb['x'])*s/10 + fb['width']/2
                my = fb['y'] + (tb['y']-fb['y'])*s/10 + fb['height']/2
                page.mouse.move(mx, my)
                page.wait_for_timeout(25)
            page.mouse.up()
            page.wait_for_timeout(2500)
            order_after = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[data-drag-id]')).map(tr => tr.querySelector('td').textContent).join(',')""")
            print("=== After:", order_after)

            state = page.evaluate("() => JSON.stringify(window.packagePage.dragState)")
            print("=== State:", state)

        print("\n=== Console msgs:")
        for m in msgs[:20]:
            print(m)
        browser.close()

if __name__ == "__main__":
    main()
