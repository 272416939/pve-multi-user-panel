import sys
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

        # 1. 登录
        page.goto(URL + "/login", wait_until="networkidle")
        page.fill('input[name="username"]', USER)
        page.fill('input[name="password"]', PWD)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1500)

        # 2. URL 直接进入套餐管理
        page.goto(URL + "/admin?section=packages", wait_until="networkidle")
        page.wait_for_timeout(2500)
        print("=== URL:", page.url)

        # 3. 验证函数签名
        sig = page.evaluate("""() => {
            if (!window.packagePage || !window.packagePage.handleDragOver) return 'NOT FOUND';
            return window.packagePage.handleDragOver.toString().split('\\n')[0];
        }""")
        print("=== handleDragOver sig:", sig)

        # 4. 获取 VM 套餐行
        rows_info = page.evaluate("""() => {
            const tb = document.querySelector('tbody');
            if (!tb) return 'no tbody';
            const trs = tb.querySelectorAll('tr[draggable="true"]');
            return 'rows=' + trs.length + ' ids=' + Array.from(trs).map(tr => tr.querySelector('td')?.textContent).join(',');
        }""")
        print("=== VM rows:", rows_info)

        # 5. 获取分组 badge
        groups_info = page.evaluate("""() => {
            const spans = document.querySelectorAll('.group-badge-draggable');
            return 'groups=' + spans.length + ' texts=' + Array.from(spans).map(s => s.textContent.trim().slice(0,10)).join('|');
        }""")
        print("=== Groups:", groups_info)

        if "rows=0" in rows_info or "no tbody" in rows_info:
            print("=== ERROR: no draggable rows, screenshot saved")
            page.screenshot(path="e:/code/pve管理面板/shot_err.png", full_page=True)
            print("=== Console msgs:")
            for m in msgs:
                print(m)
            browser.close()
            return

        # 6. 执行拖拽：把第2行拖到第1行前面
        result = page.evaluate("""async () => {
            const tb = document.querySelector('tbody');
            const trs = Array.from(tb.querySelectorAll('tr[draggable="true"]'));
            if (trs.length < 2) return 'not enough rows';
            const from = trs[1];
            const to = trs[0];
            const fromId = from.querySelector('td').textContent;
            const toId = to.querySelector('td').textContent;

            // 模拟 dragstart
            const ds = new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
            Object.defineProperty(ds, 'dataTransfer', { value: { effectAllowed: 'move', setData: () => {}, getData: () => '', dropEffect: 'move' } });
            from.dispatchEvent(ds);

            // 模拟 dragover on target
            const doEvt = new DragEvent('dragover', { bubbles: true, cancelable: true });
            Object.defineProperty(doEvt, 'dataTransfer', { value: { dropEffect: 'move' } });
            Object.defineProperty(doEvt, 'currentTarget', { value: to });
            Object.defineProperty(doEvt, 'preventDefault', { value: () => {} });
            to.dispatchEvent(doEvt);

            // 检查 dragOverId 是否正确（类型隔离测试）
            const dragOverId = window.packagePage.dragState.dragOverId;
            const dragType = window.packagePage.dragState.dragType;
            const fromIdx = window.packagePage.dragState.dragFromIndex;

            // 模拟 drop on target
            const dpEvt = new DragEvent('drop', { bubbles: true, cancelable: true });
            Object.defineProperty(dpEvt, 'preventDefault', { value: () => {} });
            to.dispatchEvent(dpEvt);

            return JSON.stringify({ fromId, toId, dragOverId, dragType, fromIdx, msg: 'drop dispatched' });
        }""")
        print("=== Drag result:", result)

        page.wait_for_timeout(3000)
        page.screenshot(path="e:/code/pve管理面板/shot_after_drag.png", full_page=True)

        # 7. 拖拽后再次检查行顺序
        after_info = page.evaluate("""() => {
            const tb = document.querySelector('tbody');
            const trs = tb.querySelectorAll('tr[draggable="true"]');
            return 'after rows=' + trs.length + ' ids=' + Array.from(trs).map(tr => tr.querySelector('td')?.textContent).join(',');
        }""")
        print("=== After drag:", after_info)

        print("=== Console msgs (" + str(len(msgs)) + "):")
        for m in msgs[:40]:
            print(m)

        browser.close()

if __name__ == "__main__":
    main()
