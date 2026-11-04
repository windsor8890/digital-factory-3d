"""qa-df/stills.py — batch hero stills for DF-01 (one browser, many shots).

usage: python qa-df/stills.py                      # all shots, full size
       python qa-df/stills.py --only overview,Z05  # subset
       python qa-df/stills.py --w 1200 --h 760 --lq  # faster / lower
"""
import argparse
import asyncio
import json
import os
import sys

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SHOTS = [
    ("overview",           "instant=1&still=1", 3.0),
    ("overview-labels",    "instant=1&still=1", 3.0),
    ("z01-raw-store",      "instant=1&still=1&view=Z01&nocard=1", 3.0),
    ("z02-press",          "instant=1&still=1&view=Z02&nocard=1", 3.0),
    ("z03-body",           "instant=1&still=1&view=Z03&nocard=1", 3.0),
    ("z04-paint",          "instant=1&still=1&view=Z04&nocard=1", 3.0),
    ("z05-assembly",       "instant=1&still=1&view=Z05&nocard=1", 3.0),
    ("z06-eol",            "instant=1&still=1&view=Z06&nocard=1", 3.0),
    ("detail-line",        "instant=1&still=1&nocard=1&dist=52&elev=0.33&azim=-0.5&tx=41&ty=3.4&tz=17", 3.0),
    ("detail-press",       "instant=1&still=1&nocard=1&dist=44&elev=0.3&azim=-1.1&tx=-33&ty=3&tz=-19", 3.0),
    ("detail-warehouse",   "instant=1&still=1&nocard=1&dist=62&elev=0.36&azim=-0.9&tx=-62&ty=8&tz=8", 3.0),
    ("detail-support",     "instant=1&still=1&nocard=1&dist=48&elev=0.33&azim=0.1&tx=30&ty=3&tz=-32", 3.0),
    ("no-data",            "instant=1&still=1&nodata=1&nolabels=1", 3.0),
    ("no-labels",          "instant=1&still=1&nolabels=1", 3.0),
    ("raw",                "instant=1&still=1&raw=1", 3.0),
    ("interactive-z05",    "instant=1&still=1&view=Z05", 3.0),
]


async def main():
    from playwright.async_api import async_playwright

    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="digital-factory-3d.html")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=float, default=3.0)
    ap.add_argument("--lq", action="store_true", help="add lq=1 and pin pixel ratio low")
    ap.add_argument("--only", default="")
    ap.add_argument("--outdir", default="qa-df/final")
    ap.add_argument("--json", default="qa-df/final/stills.json")
    args = ap.parse_args()
    only = set(x.strip() for x in args.only.split(",") if x.strip())
    file_path = args.file if os.path.isabs(args.file) else os.path.join(ROOT, args.file)
    outdir = args.outdir if os.path.isabs(args.outdir) else os.path.join(ROOT, args.outdir)
    os.makedirs(outdir, exist_ok=True)
    report = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )
        for name, query, wait in SHOTS:
            if only and name not in only:
                continue
            errors = []
            page = await browser.new_page(viewport={"width": args.w, "height": args.h}, device_scale_factor=1)
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
            page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
            q = query + ("&lq=1" if args.lq else "&pr=1")
            url = "file:///" + file_path.replace("\\", "/") + "?" + q
            await page.goto(url, wait_until="load", timeout=120000)
            try:
                await page.wait_for_function("window.__READY__ === true", timeout=120000)
            except Exception:
                pass
            await page.wait_for_timeout(int(max(wait, args.wait) * 1000))
            shot_path = os.path.join(outdir, name + ".png")
            await page.screenshot(path=shot_path)
            metrics = await page.evaluate("window.__METRICS__ || null")
            errpanel = await page.evaluate("(document.getElementById('err')||{}).textContent || ''")
            report.append({"name": name, "path": shot_path, "metrics": metrics,
                           "errors": errors, "error_panel": errpanel})
            print(("ok   " if not errors and not errpanel.strip() else "WARN ") + name +
                  "  " + json.dumps(metrics, ensure_ascii=False))
            if errors:
                print("   errors:", errors[:4])
            if errpanel.strip():
                print("   err panel:", errpanel[:300])
            await page.close()
        await browser.close()

    with open(os.path.join(ROOT, args.json), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
    bad = [r for r in report if r["errors"] or r["error_panel"].strip()]
    print("\n%d stills, %d with warnings -> %s" % (len(report), len(bad), outdir))
    return 0 if not bad else 1


if __name__ == "__main__":
    if not os.path.exists(CHROME):
        print("NO CHROME")
        sys.exit(2)
    sys.exit(asyncio.run(main()))
