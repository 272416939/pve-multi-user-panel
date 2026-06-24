from playwright.sync_api import sync_playwright
import json

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--ignore-certificate-errors"])
        ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()

        # 注入事件监听器记录所有拖拽事件
        page.add_init_script("""() => {
            window.__dragLog = [];
            const types = ['dragstart','dragenter','dragover','dragleave','drop','dragend','drag'];
            types.forEach(t => {
                document.addEventListener(t, (e) => {
                    const target = e.target;
                    const tag = target.tagName + (target.id ? '#'+target.id : '') + (target.className && typeof target.className === 'string' ? '.'+target.className.split(' ').join('.') : '');
                    const dt = e.dataTransfer;
                    window.__dragLog.push({
                        type: t,
                        target: tag.slice(0, 60),
                        defaultPrevented: e.defaultPrevented,
                        dropEffect: dt ? dt.dropEffect : null,
                        ts: Date.now()
                    });
                }, true);
            });
        }""")

        page.goto(URL + "/login", wait_until="networkidle")
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PWD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        page.goto(URL + "/admin?section=packages", wait_until="networkidle")
        page.wait_for_timeout(2500)

        order_before = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== Before:", order_before)

        # 清空日志
        page.evaluate("() => window.__dragLog = []")

        # 用 drag_to 测试
        try:
            page.locator('tbody tr[draggable="true"]').nth(1).drag_to(
                page.locator('tbody tr[draggable="true"]').nth(0), timeout=5000)
            page.wait_for_timeout(2500)
        except Exception as e:
            print("drag_to error:", e)

        order_after = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== After:", order_after)

        # 读取事件日志
        log = page.evaluate("() => window.__dragLog")
        print(f"\n=== Event log ({len(log)} events):")
        for ev in log:
            print(f"  {ev['type']:12} | target={ev['target']:40} | defaultPrevented={ev['defaultPrevented']} | dropEffect={ev['dropEffect']}")

        browser.close()

if __name__ == "__main__":
    main()
