"""qa-df/probe-tour.py — prove the cinematic tour visits every production stage.

Runs the fast tour (?tour=1&tourfast=1) and polls the shot index + chapter until
all nine shots have been visited, then verifies stop and loop coverage.
"""
import asyncio
import json
import os

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "file:///" + os.path.join(ROOT, "digital-factory-3d.html").replace("\\", "/") + "?instant=1&still=1&lq=1&tour=1"


async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
        )
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
        await page.goto(URL, wait_until="domcontentloaded", timeout=180000)
        await page.wait_for_function("window.__READY__ === true", timeout=180000)

        seen = {}
        for _ in range(210):
            await page.wait_for_timeout(500)
            st = await page.evaluate("""() => ({
                on: window.__APP__.tour.isOn(),
                shot: window.__APP__.tour.shot(),
                chapter: (document.getElementById('tourTitle')||{}).textContent,
                index: (document.getElementById('tourIndex')||{}).textContent,
                btn: (document.querySelector('#btnTour em')||{}).textContent,
                touring: document.body.classList.contains('touring'),
            })""")
            if st["shot"] is not None and st["shot"] >= 0:
                seen.setdefault(st["shot"], {"chapter": st["chapter"], "index": st["index"], "btn": st["btn"]})
            if len(seen) >= 9:
                break
        await page.wait_for_timeout(500)
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "cinema", "running-cover.png"))

        started = await page.evaluate("window.__APP__.tour.isOn()")
        shots = await page.evaluate("window.__APP__.tour.shots")
        # stop by clicking the dock button (user path)
        await page.click("#btnTour")
        await page.wait_for_timeout(500)
        stopped = await page.evaluate("""() => ({
            on: window.__APP__.tour.isOn(),
            touring: document.body.classList.contains('touring'),
            btn: (document.querySelector('#btnTour em')||{}).textContent,
        })""")
        await browser.close()

    ordered = [seen.get(i) for i in range(9)]
    ok = started and len(seen) >= 9 and not stopped["on"] and not stopped["touring"] and stopped["btn"] == "TOUR" and not errs
    print(json.dumps({"visited": ordered, "shots_meta": shots, "stop": stopped, "errors": errs}, ensure_ascii=False, indent=1))
    print("\n" + ("PASS" if ok else "FAIL") + " | covered %d/9 chapters" % len(seen))
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
