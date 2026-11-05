"""qa-df/probe-flicker.py — measure frame-to-frame flicker in the far background.

Loads the deliverable at the overview camera, captures two frames ~0.7 s apart,
and reports mean/p99 absolute differences over:
  - top void (pure background above the hall)
  - far ground (studio ground field around the hall)
Variants: default, css grain disabled, ?raw=1 (post pipeline off).
"""
import asyncio
import io
import os

import numpy as np
from PIL import Image
from playwright.async_api import async_playwright

CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILE = os.path.join(ROOT, "digital-factory-3d.html")
BASE = "file:///" + FILE.replace("\\", "/")

REGIONS = {
    "top-void": (320, 80, 900, 210),      # pure background above the factory
    "far-ground": (150, 640, 420, 830),   # studio ground / yard, bottom-left
    "far-right": (1050, 620, 1330, 820),  # ground + horizon right
}


def shot(page):
    data = page.screenshot_bytes if hasattr(page, "screenshot_bytes") else None
    return data


async def grab(page, query, css_off=False):
    await page.goto(BASE + "?" + query, wait_until="domcontentloaded", timeout=180000)
    await page.wait_for_function("window.__READY__ === true", timeout=180000)
    if css_off:
        await page.add_style_tag(content=".grain{display:none!important}")
    await page.wait_for_timeout(1200)
    a = await page.screenshot()
    await page.wait_for_timeout(700)
    b = await page.screenshot()
    return a, b


def diff_stats(a_bytes, b_bytes):
    a = np.asarray(Image.open(io.BytesIO(a_bytes)).convert("RGB"), dtype=np.int16)
    b = np.asarray(Image.open(io.BytesIO(b_bytes)).convert("RGB"), dtype=np.int16)
    d = np.abs(a - b).mean(axis=2)
    out = {}
    for name, (x0, y0, x1, y1) in REGIONS.items():
        r = d[y0:y1, x0:x1].ravel()
        out[name] = {"mean": round(float(r.mean()), 3), "p99": int(np.percentile(r, 99)),
                     "pixels_gt8": int((r > 8).sum()), "n": int(r.size)}
    out["whole"] = {"mean": round(float(d.mean()), 3), "p99": int(np.percentile(d, 99))}
    return out


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            executable_path=CHROME, headless=True,
            args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--hide-scrollbars"],
        )
        page = await browser.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=1)
        variants = [
            ("default", "instant=1&still=1&lq=1&hideui=1"),
            ("css-grain-off", "instant=1&still=1&lq=1&hideui=1"),
            ("raw", "instant=1&still=1&lq=1&hideui=1&raw=1"),
            ("default-drift", "instant=1&lq=1&hideui=1"),
            ("raw-drift", "instant=1&lq=1&hideui=1&raw=1"),
        ]
        report = {}
        for name, q in variants:
            a, b = await grab(page, q, css_off=(name == "css-grain-off"))
            # write downscaled contact strip of the pair for visual reference
            im = Image.open(io.BytesIO(a))
            im.save(os.path.join(ROOT, "qa-df", "lead", "flicker-%s-a.png" % name))
            report[name] = diff_stats(a, b)
            print(name, report[name])
        await browser.close()
    import json
    with open(os.path.join(ROOT, "qa-df", "lead", "flicker.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    asyncio.run(main())
