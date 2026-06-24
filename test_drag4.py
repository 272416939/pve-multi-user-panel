from playwright.sync_api import sync_playwright

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def get_order(page):
    return page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")

def get_state(page):
    return page.evaluate("""() => JSON.stringify({d:window.packagePage.dragState.draggingId, t:window.packagePage.dragState.dragType, o:window.packagePage.dragState.dragOverId, f:window.packagePage.dragState.dragFromIndex})""")

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
        print("=== Initial:", get_order(page))

        tests = [(1,0), (0,2), (2,1), (1,0), (3,0)]
        for i, (f, t) in enumerate(tests):
            try:
                page.locator('tbody tr[draggable="true"]').nth(f).drag_to(
                    page.locator('tbody tr[draggable="true"]').nth(t), timeout=5000)
                page.wait_for_timeout(2500)
                print(f"Drag {i+1} ({f}->{t}): order={get_order(page)} state={get_state(page)}")
            except Exception as e:
                print(f"Drag {i+1} ({f}->{t}) ERROR: {e} state={get_state(page)}")

        print("\n=== Console msgs:")
        for m in msgs[:20]:
            print(m)
        browser.close()

if __name__ == "__main__":
    main()
