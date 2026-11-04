"""qa-df/shot.py — Playwright still + console/metric capture for the factory.

usage:
  python qa-df/shot.py --out qa-df/overview.png
  python qa-df/shot.py --file qa-df/mine.html --query "instant=1&still=1&view=Z02" --out qa-df/z02.png
"""
import argparse
import asyncio
import json
import os
import sys

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


async def run(args):
    from playwright.async_api import async_playwright

    file_path = args.file if os.path.isabs(args.file) else os.path.join(ROOT, args.file)
    if not os.path.exists(file_path):
        print("MISSING FILE: " + file_path)
        return 2
    out_path = args.out if os.path.isabs(args.out) else os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    url = "file:///" + file_path.replace("\\", "/") + ("?" + args.query if args.query else "")

    console, errors, warnings = [], [], []
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME,
            headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )
        page = await browser.new_page(viewport={"width": args.w, "height": args.h}, device_scale_factor=1)
        page.on("console", lambda m: (console.append(m.text) if m.type == "log" else None,
                                      warnings.append(m.text) if m.type == "warning" else None,
                                      errors.append(m.text) if m.type == "error" else None))
        page.on("pageerror", lambda e: errors.append("PAGEERROR " + str(e)))
        await page.goto(url, wait_until="load", timeout=args.timeout)
        try:
            await page.wait_for_function("window.__READY__ === true", timeout=args.timeout)
        except Exception:
            try:
                await page.wait_for_function("window.__METRICS__ !== undefined", timeout=8000)
            except Exception:
                pass
        await page.wait_for_timeout(args.wait)
        if args.hideui:
            await page.evaluate("document.body.classList.add('ui-hidden')")
            await page.wait_for_timeout(300)
        await page.screenshot(path=out_path)
        metrics = await page.evaluate("window.__METRICS__ || null")
        build_log = await page.evaluate("window.__BUILD_LOG__ || null")
        ready = await page.evaluate("window.__READY__ === true")
        err_text = await page.evaluate("(document.getElementById('err')||{}).textContent || ''")
        diag = await page.evaluate("""() => {
            const veil = document.getElementById('veil');
            const top = document.getElementById('topbar');
            const cs = veil ? getComputedStyle(veil) : null;
            return {
                bodyClass: document.body.className,
                veilClass: veil ? veil.className : null,
                veilOpacity: cs ? cs.opacity : null,
                veilVisibility: cs ? cs.visibility : null,
                veilInlineTransition: veil ? veil.style.transition : null,
                uiOpacity: top ? getComputedStyle(top).opacity : null,
                readyAttr: document.body.dataset.ready || null,
                tourOn: (window.__APP__ && window.__APP__.tour) ? window.__APP__.tour.isOn() : null,
                tourShot: (window.__APP__ && window.__APP__.tour) ? window.__APP__.tour.shot() : null,
                elapsed: Math.round(performance.now()),
            };
        }""")
        await browser.close()

    report = {
        "file": args.file,
        "url": url,
        "out": out_path,
        "ready": ready,
        "diag": diag,
        "metrics": metrics,
        "build_log": build_log,
        "errors": errors,
        "warnings": warnings,
        "console": console[-40:],
        "page_error_panel": err_text,
    }
    print(json.dumps(report, indent=2, ensure_ascii=False))
    if args.json:
        json_path = args.json if os.path.isabs(args.json) else os.path.join(ROOT, args.json)
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", default="digital-factory-3d.html")
    ap.add_argument("--out", default="qa-df/shot.png")
    ap.add_argument("--query", default="instant=1&still=1")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--wait", type=int, default=3200)
    ap.add_argument("--timeout", type=int, default=120000)
    ap.add_argument("--json", default="")
    ap.add_argument("--hideui", action="store_true")
    args = ap.parse_args()
    if not os.path.exists(CHROME):
        print("NO CHROME at " + CHROME)
        sys.exit(2)
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
