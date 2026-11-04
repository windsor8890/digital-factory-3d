"""qa-df/interactions.py — headless interaction regression for DF-01.

usage: python qa-df/interactions.py [--file digital-factory-3d.html] [--query ""] [--w 1280 --h 800] [--json qa-df/interactions.json]

Checks: boot, HUD, zone/dock navigation, inspector open/close, machine focus,
data/label toggles, sim rate, wheel dolly, drag orbit, clock advance, console clean,
label presence, mobile layout. Prints PASS/FAIL per check and exits non-zero on failure.
"""
import argparse
import asyncio
import json
import os
import sys

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="digital-factory-3d.html")
    ap.add_argument("--query", default="instant=1&lq=1")
    ap.add_argument("--w", type=int, default=1280)
    ap.add_argument("--h", type=int, default=800)
    ap.add_argument("--json", default="")
    args = ap.parse_args()
    from playwright.async_api import async_playwright

    file_path = args.file if os.path.isabs(args.file) else os.path.join(ROOT, args.file)
    url = "file:///" + file_path.replace("\\", "/") + ("?" + args.query if args.query else "")
    results = []
    console_errors = []

    def check(name, ok, detail=""):
        results.append({"name": name, "ok": bool(ok), "detail": str(detail)})
        print(("PASS " if ok else "FAIL ") + name + (("  — " + str(detail)) if detail and not ok else ""))

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )
        page = await browser.new_page(viewport={"width": args.w, "height": args.h}, device_scale_factor=1)
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: console_errors.append("PAGEERROR " + str(e)))
        await page.goto(url, wait_until="load", timeout=120000)

        # ---- boot ----
        ready = False
        try:
            await page.wait_for_function("window.__READY__ === true", timeout=90000)
            ready = True
        except Exception:
            pass
        await page.wait_for_timeout(1200)
        check("boot ready", ready)
        metrics = await page.evaluate("window.__METRICS__ || null")
        check("render loop metrics", metrics is not None, json.dumps(metrics))
        check("console clean", len(console_errors) == 0, console_errors[:5])
        errpanel = await page.evaluate("(document.getElementById('err')||{}).textContent || ''")
        check("no error panel", errpanel.strip() == "", errpanel[:200])

        hud = await page.evaluate("""() => ({
            zones: document.querySelectorAll('#zoneList li').length,
            dock: document.querySelectorAll('#views button').length,
            cards: document.querySelectorAll('#kpis .card').length,
            alarms: document.querySelectorAll('#alarmList li').length,
            viewName: (document.getElementById('viewName')||{}).textContent || '',
            stations: (window.__METRICS__||{}).stations || 0,
        })""")
        check("HUD zone rows = 6", hud["zones"] == 6, hud)
        check("HUD dock views = 7", hud["dock"] == 7, hud)
        check("HUD KPI cards >= 4", hud["cards"] >= 4, hud)
        check("stations registered >= 12", hud["stations"] >= 12, "stations=" + str(hud["stations"]))
        check("alarm list populated", hud["alarms"] >= 1, hud)

        async def state():
            return await page.evaluate("""() => ({
                cam: {dist: window.__APP__.cam.dist, azim: window.__APP__.cam.azim,
                      elev: window.__APP__.cam.elev, tx: window.__APP__.cam.tx, tz: window.__APP__.cam.tz},
                inspecting: document.body.classList.contains('inspecting'),
                title: (document.getElementById('inspTitle')||{}).textContent || '',
                machines: document.querySelectorAll('#inspMachines button').length,
                viewName: (document.getElementById('viewName')||{}).textContent || '',
                dataOn: document.getElementById('btnData').classList.contains('on'),
                labelsOn: document.getElementById('btnLabels').classList.contains('on'),
                speed: window.__APP__.SIM.speed,
                clock: (document.getElementById('clock')||{}).textContent || '',
                labelCount: document.querySelectorAll('#labels > *').length,
            })""")

        home = await state()

        # ---- zone navigation ----
        await page.click('#zoneList li[data-zone="Z02"] button')
        await page.wait_for_timeout(3500)
        z02 = await state()
        check("zone nav opens inspector", z02["inspecting"])
        check("zone nav title", "冲压" in z02["title"], z02["title"])
        check("zone nav dolly in", z02["cam"]["dist"] < home["cam"]["dist"] - 40, z02["cam"]["dist"])
        check("inspector machine rows", z02["machines"] >= 1, z02["machines"])
        check("view tag updates", "冲压" in z02["viewName"], z02["viewName"])

        # ---- machine focus ----
        if z02["machines"] >= 1:
            first = await page.query_selector("#inspMachines button")
            await first.click()
            await page.wait_for_timeout(2200)
            m = await state()
            check("machine focus flies closer", m["cam"]["dist"] < z02["cam"]["dist"] - 4, m["cam"]["dist"])

        # ---- close inspector ----
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        esc = await state()
        check("escape closes inspector", not esc["inspecting"])

        # ---- dock navigation ----
        await page.click('#views button[data-view="Z05"]')
        await page.wait_for_timeout(3500)
        z05 = await state()
        check("dock Z05 opens assembly", z05["inspecting"] and "总装" in z05["title"], z05["title"])

        # ---- toggles ----
        await page.click("#btnData")
        await page.wait_for_timeout(300)
        off = await state()
        await page.click("#btnData")
        await page.wait_for_timeout(300)
        on = await state()
        check("data layer toggles", off["dataOn"] != on["dataOn"] and on["dataOn"])
        await page.click("#btnLabels")
        await page.wait_for_timeout(300)
        loff = await state()
        await page.click("#btnLabels")
        await page.wait_for_timeout(300)
        check("labels toggle", loff["labelsOn"] is False and (await state())["labelsOn"] is True)
        check("DOM labels present", home["labelCount"] >= 3, home["labelCount"])

        # ---- sim rate ----
        await page.click('#rates button[data-rate="4"]')
        await page.wait_for_timeout(200)
        rate = await state()
        check("sim rate 4x", rate["speed"] == 4, rate["speed"])
        await page.click('#rates button[data-rate="1"]')

        # ---- wheel dolly ----
        before = await state()
        await page.mouse.move(args.w // 2, args.h // 2)
        await page.mouse.wheel(0, -700)
        await page.wait_for_timeout(2500)
        after = await state()
        check("wheel dolly", after["cam"]["dist"] < before["cam"]["dist"] - 5,
              (before["cam"]["dist"], after["cam"]["dist"]))

        # ---- drag orbit ----
        az0 = (await state())["cam"]["azim"]
        await page.mouse.move(args.w // 2, args.h // 2)
        await page.mouse.down()
        await page.mouse.move(args.w // 2 + 220, args.h // 2 + 40, steps=8)
        await page.mouse.up()
        await page.wait_for_timeout(2200)
        az1 = (await state())["cam"]["azim"]
        check("drag orbits", abs(az1 - az0) > 0.05, (round(az0, 3), round(az1, 3)))

        # ---- clock advances ----
        c0 = await page.evaluate("({clock: (document.getElementById('clock')||{}).textContent||'', sim: window.__APP__.SIM.simTime})")
        await page.wait_for_timeout(4200)
        c1 = await page.evaluate("({clock: (document.getElementById('clock')||{}).textContent||'', sim: window.__APP__.SIM.simTime})")
        check("sim clock advances", c0["clock"] != c1["clock"] or c1["sim"] > c0["sim"] + 0.25,
              (c0, c1))

        # ---- tour ----
        await page.click("#btnTour")
        await page.wait_for_timeout(300)
        tour_on = await page.evaluate("document.getElementById('btnTour').classList.contains('on')")
        check("tour toggle", tour_on)
        await page.click("#btnTour")

        # ---- screenshot ----
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "interaction-last.png"))
        check("final console clean", len(console_errors) == 0, console_errors[:5])

        # ---- mobile layout ----
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(1200)
        mobile = await page.evaluate("""() => ({
            kpis: getComputedStyle(document.getElementById('kpis')).display,
            rail: getComputedStyle(document.getElementById('zoneRail')).display,
            dockVisible: document.getElementById('dock').getBoundingClientRect().width > 100,
            overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
        })""")
        check("mobile hides KPI/rail", mobile["kpis"] == "none" and mobile["rail"] == "none", mobile)
        check("mobile dock visible", mobile["dockVisible"], mobile)
        check("mobile no x-overflow", not mobile["overflowX"], mobile)
        await page.screenshot(path=os.path.join(ROOT, "qa-df", "interaction-mobile.png"))
        await browser.close()

    passed = sum(1 for r in results if r["ok"])
    total = len(results)
    print("\n%d/%d checks passed" % (passed, total))
    if args.json:
        path = args.json if os.path.isabs(args.json) else os.path.join(ROOT, args.json)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"passed": passed, "total": total, "checks": results,
                       "console_errors": console_errors}, f, indent=2, ensure_ascii=False)
    return 0 if passed == total else 1


if __name__ == "__main__":
    if not os.path.exists(CHROME):
        print("NO CHROME at " + CHROME)
        sys.exit(2)
    sys.exit(asyncio.run(main()))
