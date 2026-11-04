"""qa-df/probe-sim.py — inspect SIM zone state vs inspector readout."""
import asyncio, json, os
from playwright.async_api import async_playwright
CHROME = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

async def main():
    url = "file:///" + os.path.join(ROOT, "digital-factory-3d.html").replace("\\", "/") + "?instant=1&still=1&lq=1&view=Z03"
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=CHROME, headless=True, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
        page = await b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        await page.goto(url, wait_until="domcontentloaded", timeout=180000)
        await page.wait_for_function("window.__READY__ === true", timeout=180000)
        await page.wait_for_timeout(5000)
        data = await page.evaluate("""() => {
            const S = window.__APP__.SIM;
            const insp = document.getElementById('inspector');
            const rect = insp.getBoundingClientRect();
            return {
                zones: Object.fromEntries(Object.entries(S.zones).map(([k,v]) => [k, {energy: v.energy, util: v.util, wip: v.wip, stations: v.stations.length, out: v.out}])),
                energyDemand: S.energy.demand,
                counts: S.counts,
                output: S.output,
                clock: S.clock,
                stations: S.stations.map(s => ({id: s.id, zone: s.zone, state: s.state, util: +s.util.toFixed(2), beacon: !!s.beacon})),
                inspRect: {x: rect.x, y: rect.y, w: rect.width, h: rect.height},
                inspStats: [1,2,3].map(i => (document.getElementById('inspStat'+i)||{}).textContent),
                inspTitle: (document.getElementById('inspTitle')||{}).textContent,
                labels: document.querySelectorAll('#labels > *').length,
                err: (document.getElementById('err')||{}).textContent || '',
            };
        }""")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        print("PAGEERRORS:", errs)
        await b.close()

asyncio.run(main())
