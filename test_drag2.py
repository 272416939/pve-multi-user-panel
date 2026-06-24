from playwright.sync_api import sync_playwright

URL = "https://pve.owoser.cn:54037"
USER = "admin"
PWD = "Wlk990528@@@@"

def do_drag(page, from_idx, to_idx):
    """用 Playwright 真实鼠标拖拽"""
    result = page.evaluate("""([fromIdx, toIdx]) => {
        const tb = document.querySelector('tbody');
        const trs = Array.from(tb.querySelectorAll('tr[draggable="true"]'));
        if (trs.length <= Math.max(fromIdx, toIdx)) return 'index out of range';
        return 'from=' + trs[fromIdx].querySelector('td').textContent + ' to=' + trs[toIdx].querySelector('td').textContent;
    }""", [from_idx, to_idx])
    # 用真实鼠标操作
    from_tr = page.query_selector(f'tbody tr[draggable="true"]:nth-child({from_idx+1})')
    to_tr = page.query_selector(f'tbody tr[draggable="true"]:nth-child({to_idx+1})')
    if not from_tr or not to_tr:
        return f"selector not found: {result}"
    from_box = from_tr.bounding_box()
    to_box = to_tr.bounding_box()
    if not from_box or not to_box:
        return f"no box: {result}"
    page.mouse.move(from_box['x'] + from_box['width']/2, from_box['y'] + from_box['height']/2)
    page.mouse.down()
    page.wait_for_timeout(100)
    # 中间移动几下
    for step in range(5):
        mx = from_box['x'] + (to_box['x'] - from_box['x']) * (step+1)/5 + from_box['width']/2
        my = from_box['y'] + (to_box['y'] - from_box['y']) * (step+1)/5 + from_box['height']/2
        page.mouse.move(mx, my)
        page.wait_for_timeout(30)
    page.mouse.move(to_box['x'] + to_box['width']/2, to_box['y'] + to_box['height']/2)
    page.wait_for_timeout(100)
    page.mouse.up()
    page.wait_for_timeout(2000)
    # 检查顺序
    after = page.evaluate("""() => {
        const tb = document.querySelector('tbody');
        const trs = tb.querySelectorAll('tr[draggable="true"]');
        return Array.from(trs).map(tr => tr.querySelector('td').textContent).join(',');
    }""")
    state = page.evaluate("""() => JSON.stringify({
        draggingId: window.packagePage.dragState.draggingId,
        dragType: window.packagePage.dragState.dragType,
        dragOverId: window.packagePage.dragState.dragOverId,
        fromIdx: window.packagePage.dragState.dragFromIndex
    })""")
    return f"{result} | after={after} | state={state}"

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

        before = page.evaluate("""() => {
            const tb = document.querySelector('tbody');
            return Array.from(tb.querySelectorAll('tr[draggable="true"]')).map(tr => tr.querySelector('td').textContent).join(',');
        }""")
        print("=== Initial order:", before)

        # 测试1: 拖 idx 1 -> 0
        print("\n--- Drag 1->0 ---")
        print(do_drag(page, 1, 0))

        # 测试2: 立即再次拖 idx 0 -> 2
        print("\n--- Drag 0->2 ---")
        print(do_drag(page, 0, 2))

        # 测试3: 立即再次拖 idx 2 -> 1
        print("\n--- Drag 2->1 ---")
        print(do_drag(page, 2, 1))

        # 测试4: 立即再次拖 idx 1 -> 0
        print("\n--- Drag 1->0 ---")
        print(do_drag(page, 1, 0))

        print("\n=== Console errors:")
        for m in msgs:
            if "error" in m.lower() or "PAGEERROR" in m:
                print(m)

        browser.close()

if __name__ == "__main__":
    main()
