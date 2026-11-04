"""qa-df/inspect.py — dump computed styles of the energy bar elements."""
import asyncio, json, os
from playwright.async_api import async_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    url = "file:///" + os.path.join(ROOT, "qa-df", "smoke.html").replace("\\", "/") + "?instant=1&still=1&lq=1"
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True,
                                    args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 1200, "height": 800})
        await page.goto(url, wait_until="load")
        await page.wait_for_timeout(2500)
        data = await page.evaluate("""() => {
            const bar = document.querySelector('.bars i');
            const card = bar.closest('.card');
            const cs = getComputedStyle(bar);
            const cc = getComputedStyle(card);
            const r = bar.getBoundingClientRect();
            return {
                bar: {w: r.width, h: r.height, filter: cs.filter, boxShadow: cs.boxShadow,
                      bg: cs.backgroundImage, opacity: cs.opacity, transition: cs.transition,
                      transform: cs.transform, mixBlend: cs.mixBlendMode, backdrop: cs.backdropFilter},
                card: {backdrop: cc.backdropFilter, filter: cc.filter, bg: cc.backgroundColor, overflow: cc.overflow, contain: cc.contain, isolation: cc.isolation},
                count: document.querySelectorAll('.bars i').length,
                heights: [...document.querySelectorAll('.bars i')].map(x => getComputedStyle(x).height),
                vars: [...document.querySelectorAll('.bars i')].map(x => x.style.getPropertyValue('--h')),
            };
        }""")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        el = await page.query_selector(".bars")
        await el.screenshot(path=os.path.join(ROOT, "qa-df", "el-bars.png"))
        await b.close()

asyncio.run(main())
