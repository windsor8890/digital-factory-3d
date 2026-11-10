# DF-01 数字工厂 · Digital Factory Twin

An interactive single-file WebGL digital twin of an EV final-assembly factory:
a cutaway hall with six production zones — raw-material AS/RS, press line, body
shop, paint shop, final assembly and end-of-line/dispatch — plus a live data
layer and a SCADA-style HUD driven by a small factory simulation. Amber survey
lines, projected zone labels, energy-flow pulses and station beacons sit over a
warm concrete-and-steel physical model under studio light.

**Open `digital-factory-3d.html` — double-click it.** three.js (r160, MIT) is
inlined; every texture, machine, vehicle, label and chart is procedural. Works
from `file://` and offline, no build step at runtime.

| element | how it is made |
| --- | --- |
| hall shell | 156 × 80 m cutaway: 4k procedurally painted concrete floor (saw-cut joints, zone stencils, AGV lane, walkways, dock chevrons, footings, oil/tyre marks), north + east full-height walls with ribbed cladding, ribbon windows and girts, west wall cut at 7.5 m with three roller-door docks, low south parapet, 10 transverse steel trusses + H columns, open skylight frames, 14 LED high-bays, 24 signs from one atlas |
| Z01 AS/RS | four double-sided 19.8 m rack rows (≈64 % slots filled with instanced kraft/shrink-wrap/blue-grey loads and coils), three animated stacker cranes with lifting carriages and extending forks, inbound trailers + dock levelers/seals, P&D conveyors, two forklifts, charging bay |
| Z02 press line | four crowned servo presses with animated slides and open die bays, gap gantry transfers carrying blanks, uncoiler + coil stack, scrap conveyor/bin, safety fencing, light curtains, pulpit, hazard markings |
| Z03 body shop | eight six-axis orange robot cells with articulated instanced links and weld sparks/flash, body-in-white shells indexing on two roller conveyors, fixtures, fume canopies with ducts, light curtains, cell signs |
| Z04 paint shop | enclosed 8 m booth with translucent observation walls, four painted shells on a serpentine conveyor, four swaying paint robots, ceiling light grid, extract plenum, roof AHUs/fans, glowing-mouth oven and exhaust stack |
| Z05 assembly | two lines (z=12 / z=28, x 18–62): skillet conveyors, 13 stations each (tool-balancer rails, supermarket racks, torque pedestals, fluid fill, seat/glass robot cells, battery marriage lift), 8 crawling cars per line, overhead conveyor with 8 hangers, 15 operators |
| Z06 EOL & dispatch | two 6.4 m light tunnels with "下线检测 / EOL" signage, wheel-alignment plates and roller test rig, six parked finished cars + one loading, dispatch portal, bollards |
| AGV & yard | four AGVs on a spine loop with varied pallet loads, indicator lights and curve deceleration; three inbound trailers, two outbound trailers with car-loading ramp, containers, gate + boom + guard hut |
| data layer | amber zone footprints + corner ticks + floor code plates, projected DOM labels with leader lines and live metrics (utilization/WIP), energy-flow trunk + six branches with travelling pulses, AGV/material-flow dots, slow floor scan sweep, dashed twin envelope, 21 station beacons (green run / amber idle / red down) with alarm pings, focus crosshair |
| simulation | 21 stations, 58 s takt × 2 lines → 124 units/h, shift clock 08:00–20:00 (14:36 start), OEE from availability/performance/quality, injected faults and auto-restores, WIP/energy/AGV telemetry, 96-point output history |
| HUD | drawing-title block, zone index with utilization bars, OEE ring + A/P/Q, output sparkline, WIP/AGV/energy cards, alarm feed, inspector with station list, view chips + data/label/tour/reset toggles, sim-rate 1×/2×/4×, compass, scale bar, keyboard shortcuts |
| optics | own post pipeline: 4× MSAA scene target, bloom, ACES grade, static luminance-masked film grain, vignette, subtle tilt-shift; 4096 key shadow map with tuned bias, fog; DPR up to 1.75 with auto-degrade |

## Interaction

- **drag** orbit · **wheel / pinch** dolly · **move pointer** parallax · **click** a
  floor zone, machine or AGV to inspect it
- left zone index or bottom dock: **总览** + six zones fly-to; the inspector lists
  that zone's stations with live state and utilization — click one to focus it
- toggle **数据层 DATA**, **标签 TAGS**, **巡游 TOUR**, **复位 RESET**, sim rate
  1× / 2× / 4×, fullscreen
- **巡游 = 电影级运镜**: 点「巡游」后进入一段约 **88 秒的无缝长镜头**，覆盖全部环节——
  总览 → 原材料立库 → 冲压线 → 焊装车间 → 涂装车间 → 总装线 → 检测发运 → 升空 →
  回到总览，然后循环。每站先缓入抵达、再低速漂移，底部显示 `03 / 09 冲压线 PRESS LINE`
  章节字幕与整段进度线，按钮显示当前镜头号；按 `Esc`、空格、再次点按钮或拖拽场景即可退出。
- **录屏**：`?film=1` 直接进入纯净电影模式（自动巡游 + 隐藏 UI + 2.39:1 遮幅循环）；
  想保留 HUD 用 `?tour=1`，想单独要遮幅按 `B`（会连同 UI 一起收起，再按恢复）；
  `?tourat=25` 可把巡游定格在第 25 秒（方便逐帧检查/拍照），`?tourfast=1` 为 QA 加速版。
- keyboard **1–6** zones, **0** overview, **L** labels, **D** data layer,
  **Space** tour, **H** hide UI, **B** cinematic bars (with UI off), **F** fullscreen,
  **Esc** close inspector / stop tour
- URL flags: `?instant=1` skip reveal, `?still=1` freeze camera drift,
  `?raw=1` bypass post, `?lq=1` low quality, `?nolabels=1`, `?nodata=1`,
  `?nocard=1`, `?hideui=1`, `?debug=1`, `?view=overview|Z01…Z06`,
  `?azim= ?elev= ?dist= ?fov= ?tx= ?ty= ?tz=`, `?sim=1|2|4`, `?pr=`, `?tour=1`,
  `?film=1` (clean cinematic loop), `?letterbox=1`, `?tourat=<seconds>`,
  `?tourfast=1`

## Files

- `digital-factory-3d.html` — the deliverable (single self-contained file)
- `src-df/` — authoring fragments + `CONTRACT.md`:
  `10-util.js` · `20-studio.js` · `30-building.js` · `40-process.js` ·
  `45-logistics.js` · `50-assembly.js` · `60-data.js` · `70-post.js` ·
  `90-boot.js` + `shell.html`
- `build-df.js` — `node build-df.js [out.html] [--stub=building,process,logistics,assembly,data]`
- `qa-df/` — `shot.py` (Playwright still + console/metric capture), `stills.py`
  (batch stills), `interactions.py` (29-check headless regression),
  `shot.ps1` (headless-Chrome), plus per-module and final screenshots

Edit `src-df/*.js`, run `node build-df.js`, reload.

## Verification

- build: `node build-df.js` → ≈1.16 MB single file, no network references, empty
  console, no page errors
- `python qa-df/interactions.py --file digital-factory-3d.html` → **29/29**
  (boot, HUD, zone/dock navigation, inspector, machine focus, data/label toggles,
  4× sim rate, wheel dolly, drag orbit, clock advance, tour, clean console,
  mobile 390×844 layout, no x-overflow)
- batch stills: overview + six zone views + detail/raw/no-data captures with
  per-shot metrics and console capture
- `python qa-df/probe-cinema.py` → cinematic engine: tour starts from the dock,
  advances 0→1→2, chapter slate/button label update, drag cancels, letterbox clean
  frame OK
- `python qa-df/probe-tour.py` → full 88.5 s tour visited **9/9 chapters** in order
  (总览 → 立库 → 冲压 → 焊装 → 涂装 → 总装 → 检测发运 → 升空 → 总览) then stopped
  cleanly; the loop end equals the opening pose for a seamless repeat
- `python qa-df/cinema-shots.py` → nine 1440×900 tour stills (arrival poses) for
  framing/clipping review
- `python qa-df/probe-flicker.py` → far-view background temporal stability:
  frame-to-frame difference 5.6/255 before, **0.0/255 after** (grain is now
  static and luminance-masked; the animated grain had made the dark void shimmer)
- scene: 271 draw calls including post, ≈291k triangles, 21 registered stations,
  69 programs, 4096 shadow map; software-rendered QA at ≈1 fps, hardware 60 fps
- independent verifier pass over the built deliverable (see `qa-df/verify/`):
  zero console messages, one `file://` request only, all flags and end-to-end
  flows verified; no P0, two P1 HUD layout issues found and fixed (landscape
  inspector / title-block–dock collision), P2s addressed or waived

Built with Agent Teams: the Lead authored the util/studio/post/shell/boot
foundation, the data HUD and camera system, then integrated and QA'd; the
building shell, process equipment, logistics, final-assembly and data-layer
modules were authored in parallel by five teammates against a written contract
(`src-df/CONTRACT.md`) and independently verified afterwards.

## Known limitations

- warehouse loads are instanced boxes/coils; extreme close-ups reveal repeated
  silhouettes
- moving cars are merged 2-mesh assemblies with instanced contact shadows (no
  per-car shadow-map cast, to keep the draw-call budget)
- DOM telemetry labels hide below 900 px viewport width; the data layer is
  deliberately restrained at overview distance
- the Z07 support block is background architecture only — the six production
  zones are the navigable ones; the drawing title block hides below ~1420 px wide
  and the inspector becomes a scrollable panel below 620 px tall, to keep the dock
  clear on small screens
- all telemetry is illustrative and marked 示意数据 · DEMO TELEMETRY
