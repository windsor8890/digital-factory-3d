"""qa-df/probe-inspector.py — inspect the inspector panel geometry."""
import asyncio, json, os
from playwright.async_api import async_playwright
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def main():
    url = "file:///" + os.path.join(ROOT, "qa-df", "lead", "full-v7.html").replace("\\", "/") + "?instant=1&still=1&lq=1&view=Z03"
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        await page.goto(url, wait_until="load")
        await page.wait_for_function("window.__READY__ === true", timeout=120000)
        await page.wait_for_timeout(2500)
        data = await page.evaluate("""() => {
            const insp = document.getElementById('inspector');
            const r = insp.getBoundingClientRect();
            const cs = getComputedStyle(insp);
            return {
                bodyClass: document.body.className,
                display: cs.display, position: cs.position, top: cs.top, left: cs.left,
                rect: {x: r.x, y: r.y, w: r.width, h: r.height},
                transform: cs.transform, marginTop: cs.marginTop,
                headerRect: (() => { const h = insp.querySelector('header'); const rr = h.getBoundingClientRect(); return {x: rr.x, y: rr.y, h: rr.height}; })(),
                scrollY: window.scrollY,
                viewport: {w: innerWidth, h: innerHeight},
                anyFixed: [...document.querySelectorAll('#inspector, #zoneRail, #kpis')].map(e => ({id: e.id, pos: getComputedStyle(e).position, top: getComputedStyle(e).top})),
            };
        }""")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "lead", "probe-inspector.png"))
        await b.close()

asyncio.run(main())
