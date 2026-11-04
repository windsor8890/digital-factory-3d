"""qa-df/diag.py — poll live state to check that the frame loop keeps running."""
import asyncio
import json
import os
import sys

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    from playwright.async_api import async_playwright
    file_path = os.path.join(ROOT, "qa-df", "smoke.html")
    url = "file:///" + file_path.replace("\\", "/") + "?instant=1&still=1&debug=1"
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=True,
                                          args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await browser.new_page(viewport={"width": 1200, "height": 800})
        logs, errs = [], []
        page.on("console", lambda m: logs.append(m.type + ": " + m.text))
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(url, wait_until="load", timeout=60000)
        await page.wait_for_timeout(2000)
        for i in range(8):
            data = await page.evaluate("""() => ({
                clock: (document.getElementById('clock')||{}).textContent,
                metrics: window.__METRICS__ || null,
                ready: window.__READY__ === true,
                hidden: document.hidden,
                vis: document.visibilityState,
                buildLog: window.__BUILD_LOG__ || null,
                err: (document.getElementById('err')||{}).textContent || '',
                raf: typeof requestAnimationFrame
            })""")
            print(json.dumps(data, ensure_ascii=False))
            await page.wait_for_timeout(700)
        print("CONSOLE:", logs[-20:])
        print("ERRORS:", errs)
        await browser.close()

asyncio.run(main())
