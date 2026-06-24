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

        page.goto(URL + "/login", wait_until="networkidle")
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PWD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        page.goto(URL + "/admin?section=packages", wait_until="networkidle")
        page.wait_for_timeout(2500)

        before = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== Initial:", before)

        # 用 drag_and_drop API (基于 CDP Input.dispatchDragEvent，触发真实 HTML5 DnD)
        from_tr = page.locator('tbody tr[draggable="true"]').nth(1)
        to_tr = page.locator('tbody tr[draggable="true"]').nth(0)

        # 检查 dragstart 是否绑定
        bound_check = page.evaluate("""() => {
            const tr = document.querySelector('tbody tr[draggable="true"]');
            return 'draggable=' + tr.draggable + ' hasDragStart=' + (typeof tr.ondragstart !== 'undefined');
        }""")
        print("=== Bound check:", bound_check)

        try:
            from_tr.drag_to(to_tr, timeout=5000)
            print("=== drag_to executed")
        except Exception as e:
            print("=== drag_to error:", e)

        page.wait_for_timeout(3000)
        after = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== After drag_to:", after)

        state = page.evaluate("""() => JSON.stringify(window.packagePage.dragState)""")
        print("=== State:", state)

        print("\n=== Console msgs:")
        for m in msgs[:20]:
            print(m)

        page.screenshot(path="e:/code/pve管理面板/shot_dnd.png", full_page=True)
        browser.close()

if __name__ == "__main__":
    main()
