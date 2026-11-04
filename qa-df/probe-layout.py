"""qa-df/probe-layout.py — verify P1 layout fixes (landscape inspector, title block vs dock)."""
import asyncio, json, os
from playwright.async_api import async_playwright
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def check(page, w, h, view, label):
    url = "file:///" + os.path.join(ROOT, "digital-factory-3d.html").replace("\\", "/") + "?instant=1&still=1&lq=1&view=" + view
    await page.set_viewport_size({"width": w, "height": h})
    await page.goto(url, wait_until="domcontentloaded", timeout=180000)
    await page.wait_for_function("window.__READY__ === true", timeout=180000)
    await page.wait_for_timeout(2500)
    data = await page.evaluate("""() => {
        const insp = document.getElementById('inspector');
        const dock = document.getElementById('dock');
        const tb = document.getElementById('titleBlock');
        const ir = insp.getBoundingClientRect(), dr = dock.getBoundingClientRect(), tr = tb.getBoundingClientRect();
        const btn = document.querySelector('#views button[data-view="overview"]');
        const br = btn ? btn.getBoundingClientRect() : null;
        const topEl = br ? document.elementFromPoint(br.x + br.width/2, br.y + br.height/2) : null;
        const cs = getComputedStyle(insp);
        return {
            viewport: [innerWidth, innerHeight],
            insp: {y: ir.y, bottom: ir.bottom, h: ir.height, display: cs.display, overflowY: cs.overflowY},
            dock: {x: dr.x, bottom: dr.bottom, h: dr.height},
            title: {display: getComputedStyle(tb).display, right: tr.right},
            dockBtnTopElement: topEl ? (topEl.id || topEl.tagName + '.' + (topEl.className||'')) : null,
            dockBtnClickable: topEl ? (topEl === btn || btn.contains(topEl)) : null,
            inspOverDock: !(ir.bottom <= dr.y || ir.y >= dr.bottom || ir.right <= dr.left || ir.left >= dr.right),
            scrollH: insp.scrollHeight, clientH: insp.clientHeight,
        };
    }""")
    shot = os.path.join(ROOT, "qa-df", "lead", "layout-%s.png" % label)
    await page.screenshot(path=shot)
    print(label, json.dumps(data, ensure_ascii=False))
    return data

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        r1 = await check(page, 844, 390, "Z01", "landscape-844x390-z01")
        r2 = await check(page, 1280, 900, "overview", "desktop-1280x900")
        r3 = await check(page, 1440, 900, "overview", "desktop-1440x900")
        print("P1-1 landscape inspector over dock:", r1["inspOverDock"], "ins scrollable:", r1["scrollH"] > r1["clientH"], "dock button hit:", r1["dockBtnClickable"])
        print("P1-2 title block hidden @1280:", r2["title"]["display"] == "none", "dock button hit:", r2["dockBtnClickable"])
        print("1440 title block:", r3["title"]["display"], "dock btn hit:", r3["dockBtnClickable"])
        await b.close()

asyncio.run(main())
