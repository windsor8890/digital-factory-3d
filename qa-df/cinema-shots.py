"""qa-df/cinema-shots.py — capture the cinematic tour at given times + test shot progression.

usage: python qa-df/cinema-shots.py [--file qa-df/lead/cinema.html] [--only 1,2] [--w 1440 --h 900] [--ui]
"""
import argparse
import asyncio
import json
import os

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# (name, seek seconds) — midpoints of each shot in the 89 s loop
SHOTS = [
    ("01-overview", 6.2),
    ("02-raw-store", 15.5),
    ("03-press", 25.0),
    ("04-body-shop", 35.0),
    ("05-paint", 44.75),
    ("06-assembly", 55.3),
    ("07-eol", 64.75),
    ("08-pullup", 75.1),
    ("09-return", 83.5),
]


async def main():
    from playwright.async_api import async_playwright
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="qa-df/lead/cinema.html")
    ap.add_argument("--only", default="")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--ui", action="store_true", help="keep the HUD (default hidden)")
    ap.add_argument("--outdir", default="qa-df/cinema")
    ap.add_argument("--json", default="qa-df/cinema/cinema.json")
    args = ap.parse_args()
    only = set(x.strip() for x in args.only.split(",") if x.strip())
    file_path = args.file if os.path.isabs(args.file) else os.path.join(ROOT, args.file)
    outdir = os.path.join(ROOT, args.outdir)
    os.makedirs(outdir, exist_ok=True)
    report = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )
        for name, seek in SHOTS:
            if only and name not in only and name.split("-")[0] not in only:
                continue
            page = await browser.new_page(viewport={"width": args.w, "height": args.h})
            errors = []
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
            q = "instant=1&still=1&lq=1&pr=1&tourat=%s" % seek
            if not args.ui:
                q += "&hideui=1"
            url = "file:///" + file_path.replace("\\", "/") + "?" + q
            await page.goto(url, wait_until="domcontentloaded", timeout=180000)
            try:
                await page.wait_for_function("window.__READY__ === true", timeout=180000)
            except Exception:
                pass
            await page.wait_for_timeout(1600)
            shot_path = os.path.join(outdir, name + ".png")
            await page.screenshot(path=shot_path)
            st = await page.evaluate("""() => ({
                shot: window.__APP__ && window.__APP__.tour ? window.__APP__.tour.shot() : -1,
                on: window.__APP__ && window.__APP__.tour ? window.__APP__.tour.isOn() : false,
                chapter: (document.getElementById('tourTitle')||{}).textContent,
                index: (document.getElementById('tourIndex')||{}).textContent,
                pos: window.__APP__ ? {
                    tx:+window.__APP__.cam.tx.toFixed(1), ty:+window.__APP__.cam.ty.toFixed(1),
                    tz:+window.__APP__.cam.tz.toFixed(1), dist:+window.__APP__.cam.dist.toFixed(1),
                    azim:+window.__APP__.cam.azim.toFixed(2), elev:+window.__APP__.cam.elev.toFixed(2),
                    fov:+window.__APP__.cam.fov.toFixed(1)} : null,
            })""")
            report.append({"name": name, "seek": seek, "path": shot_path, "state": st, "errors": errors})
            print("ok?" if not errors else "ERR", name, json.dumps(st, ensure_ascii=False), errors[:2])
            await page.close()
        await browser.close()

    with open(os.path.join(ROOT, args.json), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    bad = [r for r in report if r["errors"]]
    print("\n%d stills, %d with errors -> %s" % (len(report), len(bad), outdir))
    return 0 if not bad else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
