from playwright.sync_api import sync_playwright

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--ignore-certificate-errors"])
        ctx = browser.new_context(ignore_https_errors=True, viewport={"width": 1600, "height": 1000})
        page = ctx.new_page()

        page.goto(URL + "/login", wait_until="networkidle")
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PWD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)
        page.goto(URL + "/admin?section=packages", wait_until="networkidle")
        page.wait_for_timeout(2500)

        # 注入事件监听（在当前页面，导航后不丢失）
        page.evaluate("""() => {
            window.__dragLog = [];
            const types = ['dragstart','dragenter','dragover','dragleave','drop','dragend'];
            types.forEach(t => {
                document.addEventListener(t, (e) => {
                    window.__dragLog.push({
                        type: t,
                        target: (e.target.tagName + (e.target.className && typeof e.target.className==='string' ? '.'+e.target.className.split(' ')[0] : '')).slice(0,40),
                        preventDefault: e.defaultPrevented,
                        overId: window.packagePage ? window.packagePage.dragState.dragOverId : null,
                        dragType: window.packagePage ? window.packagePage.dragState.dragType : null
                    });
                }, true);
            });
        }""")

        order_before = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== Before:", order_before)

        # 获取起止元素位置
        boxes = page.evaluate("""() => {
            const trs = document.querySelectorAll('tbody tr[draggable="true"]');
            const f = trs[1].getBoundingClientRect();
            const t = trs[0].getBoundingClientRect();
            return {fx:f.x+f.width/2, fy:f.y+f.height/2, tx:t.x+t.width/2, ty:t.y+t.height/2};
        }""")
        print("=== Boxes:", boxes)

        page.evaluate("() => window.__dragLog = []")

        # 用 CDP dispatchDragEvent 模拟真实 HTML5 拖拽
        client = page.context.new_cdp_session(page)

        # drag start
        client.send("Input.dispatchDragEvent", {
            "type": "dragStart",
            "x": boxes["fx"], "y": boxes["fy"],
            "data": {"items": [{"mimeType": "text/plain", "data": "6"}]}
        })
        page.wait_for_timeout(200)

        # drag over 中间和目标
        mid_x = (boxes["fx"] + boxes["tx"]) / 2
        mid_y = (boxes["fy"] + boxes["ty"]) / 2
        client.send("Input.dispatchDragEvent", {"type": "dragUpdate", "x": mid_x, "y": mid_y})
        page.wait_for_timeout(100)
        client.send("Input.dispatchDragEvent", {"type": "dragUpdate", "x": boxes["tx"], "y": boxes["ty"]})
        page.wait_for_timeout(100)

        # drop
        client.send("Input.dispatchDragEvent", {
            "type": "drop",
            "x": boxes["tx"], "y": boxes["ty"],
            "data": {"items": [{"mimeType": "text/plain", "data": "6"}]}
        })
        page.wait_for_timeout(100)
        client.send("Input.dispatchDragEvent", {"type": "dragCancel", "x": boxes["tx"], "y": boxes["ty"]})
        page.wait_for_timeout(2500)

        order_after = page.evaluate("""() => Array.from(document.querySelectorAll('tbody tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',')""")
        print("=== After:", order_after)

        log = page.evaluate("() => window.__dragLog")
        print(f"\n=== Events ({len(log)}):")
        for ev in log:
            print(f"  {ev['type']:12} target={ev['target']:25} preventDef={ev['preventDefault']} overId={ev['overId']} dragType={ev['dragType']}")

        state = page.evaluate("() => JSON.stringify(window.packagePage.dragState)")
        print("\n=== Final state:", state)
        browser.close()

if __name__ == "__main__":
    main()
