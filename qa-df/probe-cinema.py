"""qa-df/probe-cinema.py — verify the cinematic tour engine end-to-end.

- starts the tour from the dock button, samples shot/chapter progression (wall clock)
- checks the chapter slate, button label, body class
- manual drag must stop the tour
- checks ?letterbox=1 and captures a UI chapter still + a letterbox clean still
"""
import asyncio
import json
import os

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "file:///" + os.path.join(ROOT, "digital-factory-3d.html").replace("\\", "/")


async def main():
    from playwright.async_api import async_playwright
    results = []
    errors_all = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )

        async def load(page, q):
            await page.goto(BASE + "?" + q, wait_until="domcontentloaded", timeout=180000)
            await page.wait_for_function("window.__READY__ === true", timeout=180000)
            await page.wait_for_timeout(800)

        async def state(page):
            return await page.evaluate("""() => ({
                on: window.__APP__.tour.isOn(),
                shot: window.__APP__.tour.shot(),
                total: window.__APP__.tour.total,
                elapsed: +window.__APP__.tour.elapsed().toFixed(2),
                chapter: (document.getElementById('tourTitle')||{}).textContent,
                index: (document.getElementById('tourIndex')||{}).textContent,
                btn: (document.querySelector('#btnTour em')||{}).textContent,
                touring: document.body.classList.contains('touring'),
                bars: document.body.classList.contains('cine-bars'),
                ciebars: getComputedStyle(document.getElementById('cinebars')).display,
            })""")

        # ---- 1. running tour (fast) from the button ----
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.on("console", lambda m: errs.append("CONSOLE " + m.text) if m.type == "error" else None)
        await load(page, "instant=1&still=1&lq=1&tourfast=1")
        await page.click("#btnTour")
        first = await state(page)
        samples = []
        for _ in range(16):
            await page.wait_for_timeout(500)
            s = await state(page)
            if not samples or samples[-1]["shot"] != s["shot"]:
                samples.append(s)
            if len(samples) >= 4:
                break
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "cinema", "ui-tour-running.png"))
        shots_seen = [s["shot"] for s in samples]
        chapters = [s["chapter"] for s in samples]
        ok1 = first["on"] and first["touring"] and first["btn"].endswith("/9") and len(set(shots_seen)) >= 3
        results.append(("tour starts + advances", ok1, {"first": first, "shots": shots_seen, "chapters": chapters}))
        print("running:", json.dumps({"shots": shots_seen, "chapters": chapters, "first_btn": first["btn"]}, ensure_ascii=False))

        # manual drag cancels
        await page.mouse.move(720, 480)
        await page.mouse.down()
        await page.mouse.move(880, 500, steps=6)
        await page.mouse.up()
        await page.wait_for_timeout(700)
        stop = await state(page)
        results.append(("drag cancels tour", (not stop["on"]) and (not stop["touring"]) and stop["btn"] == "TOUR", stop))
        await page.close()

        # ---- 2. UI chapter still (press shot) ----
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await load(page, "instant=1&still=1&lq=1&pr=1&tourat=25")
        st = await state(page)
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "cinema", "ui-chapter-press.png"))
        results.append(("chapter slate visible", st["on"] and st["touring"] and "冲压" in (st["chapter"] or "") and "03 / 09" in (st["index"] or ""), st))
        print("chapter:", json.dumps(st, ensure_ascii=False))
        await page.close()

        # ---- 3. letterbox clean still ----
        page = await browser.new_page(viewport={"width": 1440, "height": 900})
        await load(page, "instant=1&still=1&lq=1&pr=1&tourat=55.3&hideui=1&letterbox=1")
        st = await state(page)
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "cinema", "clean-letterbox.png"))
        results.append(("letterbox + clean frame", st["bars"] and st["ciebars"] == "block", st))
        print("letterbox:", json.dumps(st, ensure_ascii=False))
        await page.close()

        await browser.close()

    ok = all(r[1] for r in results)
    print("\n" + ("PASS" if ok else "FAIL") + "  errors:", errs)
    for name, good, data in results:
        print(("  OK  " if good else "  FAIL") + " " + name)
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
