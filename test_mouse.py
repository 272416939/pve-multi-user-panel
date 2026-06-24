from playwright.sync_api import sync_playwright

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def get_order(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[data-drag-id]')).map(tr => tr.querySelector('td').textContent).join(',')""")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--ignore-certificate-errors"])
        ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()
        msgs = []
        page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))

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
        print("=== Before:", get_order(page))

        # 用真实鼠标 mousedown -> move -> mouseup（触发我们的纯鼠标事件拖拽）
        def mouse_drag(from_idx, to_idx):
            from_el = page.locator('tbody tr[data-drag-id]').nth(from_idx)
            to_el = page.locator('tbody tr[data-drag-id]').nth(to_idx)
            fb = from_el.bounding_box()
            tb = to_el.bounding_box()
            page.mouse.move(fb['x'] + fb['width']/2, fb['y'] + fb['height']/2)
            page.mouse.down()
            page.wait_for_timeout(80)
            steps = 10
            for s in range(1, steps+1):
                mx = fb['x'] + (tb['x'] - fb['x']) * s/steps + fb['width']/2
                my = fb['y'] + (tb['y'] - fb['y']) * s/steps + fb['height']/2
                page.mouse.move(mx, my)
                page.wait_for_timeout(20)
            page.mouse.move(tb['x'] + tb['width']/2, tb['y'] + tb['height']/2)
            page.wait_for_timeout(80)
            page.mouse.up()
            page.wait_for_timeout(2500)

        tests = [(1, 0), (0, 2), (2, 1), (1, 0), (3, 0)]
        for i, (f, t) in enumerate(tests):
            mouse_drag(f, t)
            print(f"Drag {i+1} ({f}->{t}): {get_order(page)}")

        print("\n=== Console msgs:")
        for m in msgs[:15]:
            print(m)
        browser.close()

if __name__ == "__main__":
    main()
