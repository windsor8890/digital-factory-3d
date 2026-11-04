# 平原生物质热电厂 · 航拍三维模型 / Plain Biomass CHP

An interactive aerial 3D model of the biomass cogeneration campus photographed in
`refs/plant2-ref.jpg` — long blue-roofed fuel yards on the west, a white stepped
plant under cobalt roofs with red fascias, a hyperboloid cooling tower trailing
steam, a red-and-white stack, an enclosed conveyor arc, a ground-mounted PV array
and a small forecourt, all set in a quilt of Jianghan-plain fields.

**Open `biomass-plant-3d.html` — double-click it.** Three.js (r160, MIT) is inlined;
every texture, building, field, tree, plume and vehicle is procedural. Works from
`file://` and offline, no build step at runtime.

| element | how it is made |
| --- | --- |
| fuel yards | three long steel halls: blue-grey profiled roofs, six continuous blue skylight ribbons per bay, glazed eaves, roller doors, gantries, plant sign, brown bulk-fuel bay with conical and ridge-shaped fuel piles and tyre tracks |
| plant core | interlocking white massing under cobalt roofs with real red upstand parapets — turbine hall, taller boiler house with roof trusses/platforms/crane beam, east wing, glazed control block with a link bridge, entrance canopy, HVAC, flues and pipe racks |
| cooling tower | 104 m hyperboloid lathe shell with formwork banding baked into vertex colour, inner lip, 30 V-shaped legs, ring beam, basin and circulating-water headers |
| stack | 122 m tapered concrete shaft, white with two narrow red bands, five maintenance rings, straight ladder, flue penetration, aviation beacon |
| conveyor | enclosed tube gallery on trusses following an arc from the yards to the boiler house, stiffener rings, braced supports, transfer house |
| PV array | eight fixed-tilt rows with silver frames, dark slate modules, buried cabling, combiner boxes and setbacks |
| forecourt | car park with 15 vehicles, red/green basketball court with floodlights, 14-bay white shade canopy, workshop row, gatehouse, weighbridge, flags |
| landscape | 5.2 km warped terrain, ~900 BSP field parcels in a wheat-brown/khaki quilt with bunds, drains and farm tracks, ~3 000 instanced poplars in continuous belt rows, a 13.4 m district road with edge lines and marker posts, an 86 m river with a concrete viaduct, seven villages and five lattice pylons |
| life | wind-sheared cooling-tower plume (300 instanced billboards) and a thinner stack trail, traffic on three routes with night headlights, blinking obstruction lights, lamp glow, pollen, birds, gate flags |
| optics | 4× MSAA + FXAA, 4096 shadow map, ACES grade with a desaturated, hazy plain palette measured against the photograph, bloom, grain, vignette, optional tilt-shift |
| scale | ~479k triangles, 156 meshes, 3.7k instances, ≈155 draw calls including the shadow pass, one 1.0 MB HTML file |

## Interaction

- **drag** orbit · **wheel / pinch** dolly · **move pointer** subtle aerial parallax
- click a **+ marker** to open a facility file (8 of them); click the canvas or press **Esc** to close
- bottom dock: **总览 / 主厂房 / 冷却塔 / 燃料堆场** camera presets; **☀** lighting preset
  (afternoon → golden hour → night → morning); marker and tilt-shift toggles; fullscreen
- **solar slider** 05:00–23:00 with smooth sun, sky, shadow and site-light behaviour; **CYCLE** animates the day
- keyboard **1–4** views, **L** markers, **T** lighting, **F** fullscreen, **Space** cycle
- URL flags: `?instant=1` skip reveal, `?still=1` freeze camera drift, `?raw=1` bypass post,
  `?nolabels=1`, `?hour=`, `?azim=`, `?elev=`, `?dist=`, `?tx=&ty=&tz=`

## Files

- `biomass-plant-3d.html` — the deliverable (single self-contained file)
- `refs/plant2-ref.jpg`, `refs/pl2/*.png` — the supplied photograph and its crops
- `src-pl2/` — authoring fragments and `CONTRACT.md`:
  `10-util.js` · `20-sky.js` · `30-landscape.js` · `40-industry.js` · `45-campus.js` ·
  `50-details.js` · `60-post.js` · `90-boot.js` + `shell.html`
- `tools/build-pl2.js` — concatenates the fragments and inlines three.js
  (`node tools/build-pl2.js [out.html] [--stub=landscape,industry,campus,details]`)
- `tools/qa-pl2/stills.py` — batch stills + console/metric capture
- `tools/qa-pl2/interactions.py` — 12 headless interaction checks (orbit, presets, markers, slider, mobile)
- `tools/qa-pl2/colorstats.py`, `blackbox.py`, `probe-*.py` — regression probes

Built with Agent Teams: the lead authored the layout contract, sky, optics, boot, UI
and integration; terrain, plant core, campus and atmosphere were authored in parallel
against a written contract, then integrated and reviewed against the photograph.

## Verification

- build: `node tools/build-pl2.js` → 1 005 175 bytes, no network references, no console errors
- `python tools/qa-pl2/stills.py` → 14 shots (overview, plant, tower, fuel, PV, court, plan,
  golden, night, morning, raw, UI, mobile) with per-shot metrics and an empty console
- `python tools/qa-pl2/interactions.py biomass-plant-3d.html` → **12/12 pass**
  (8 markers on screen, card open/close, view fly-to, lighting preset, marker toggle,
  solar slider, real pointer drag orbit, zero console errors, mobile 390×844 layout)
- palette measured against the photograph (`colorstats.py`): mean luminance 0.535 vs
  0.543, saturation 0.20 vs 0.13 (the render carries no pale sky in frame)
- a regression probe guards a bug found during integration: doubled-sided bridge parapet
  strips produced zero-length vertex normals, whose NaNs bloomed into a large black cloud.
  `repairNormals()` in the landscape module now guards it (`blackbox.py` measures 0.0 %).

## Known limitations

- windows are inset panels rather than real wall openings; at extreme close-up the panel
  edges are visible
- the cooling tower interior holds a basin and a dark disc but no fill or drift eliminators
- the PV rows are single tilted sheets, not one mesh per module; tree crowns use the shared
  `makeTreeGeometry` silhouette and show their asset-pack origin inside ~300 m
- plume billboards read as soft rolls below ~150 m; the stack trail overlaps the tower plume
  mid-way (as it partly does in the photograph)
- telemetry values are illustrative, marked 示意数据 / INDICATIVE in the UI

---

# 光大钟祥 · 城乡再生能源 / Zhongxiang WTE

An interactive aerial 3D model of **光大城乡再生能源（钟祥）有限公司** — the
integrated municipal-waste and biomass cogeneration plant at Qinglong'an,
Changtan, Zhongxiang, Hubei. One self-contained HTML file, no network, no build
step at runtime.

**Open `zhongxiang-wte.html` — double-click it.** Three.js (r160, MIT) is inlined;
every texture, building, tree, plume, vehicle and field is procedural. Works from
`file://` and offline.

| element | how it is made |
| --- | --- |
| biomass fuel yard | three long covered yards on the west side: blue-grey steel roofs with continuous blue skylight ribbons, ribbon glazing, loading doors and a fuel-yard sign; connected to the plant by a long elevated fuel conveyor |
| WTE main plant | stepped white waste-to-energy massing with the 400 t/d incineration line, blue roofs and strong red fascias, a tall glazed stair/control tower, a long horizontal-window administration wing, entrance canopy, HVAC and rooftop details |
| cooling tower | 112 m hyperboloid shell with formwork bands, louvered base, supports, pipework and a wind-sheared steam plume |
| stack | red/white banded flue-gas stack, maintenance rings/ladder, its own plume and blinking aviation beacon |
| forecourt | dense east campus — long office/dorm rows, green-roof welfare building with white sunshades, a 25-bay white shade canopy, curved blue glass gallery, red/green basketball court and floodlights |
| operations | truck weighbridge, weighbridge kiosk, main gate canopies, clipped perimeter fence, internal road loop, lawns, drains, bollards and hydrants |
| landscape | clipped, slightly irregular site perimeter set in a dense broadleaf frame; ~800-field crop mosaic, ~2,800 instanced trees, hedgerows, river with animated ripples, viaduct, railway, villages and pylons |
| life | moving cars/trucks on the road routes, a far train, birds, gate flags, pollen and night headlights |
| optics | 4× MSAA scene target + FXAA clean-up, 4096 shadow map, ACES grade, bloom, grain and vignette; high-DPI rendering up to 2×; optional tilt-shift |
| scale | 849k triangles, 151 meshes, 9.2k instances — ~200 scene draw calls including the shadow pass |

## Facility data

The plant combines a **400 t/d municipal solid-waste incineration line** with a
7.5 MW condensing turbine and a **1 × 110 t/h biomass CFB boiler** with a 30 MW
extraction-condensing reheat turbine. The long blue/silver-roofed buildings are
the **biomass fuel storage yards**, not assembly halls. Facility data is from the
public project record ([project information](https://xmt.ixbang.com/ticontent-2931039-4-1.html))
and the [Zhongxiang project report](https://zhongxiang.cjyun.org/p/76828.html).

## Interaction

- **drag** orbit · **wheel / pinch** dolly · **move pointer** subtle aerial parallax
- click a **+ marker** to open a facility file; click the canvas or press **Esc** to close
- bottom dock: **总览 / 主厂房 / 冷却塔 / 燃料堆场** camera presets; **☀** lighting preset
  (midday → golden hour → night → morning); marker and tilt-shift toggles; fullscreen
- **solar slider** desktop: 05:00–23:00 with smooth sun, sky, shadow and site-light
  behaviour; **CYCLE** animates the day
- keyboard **1–4** views, **L** labels, **T** lighting, **F** fullscreen, **Space** cycle
- URL flags for stills: `?instant=1` skip reveal, `?still=1` freeze camera drift,
  `?raw=1` bypass post, `?nolabels=1`, `?hour=…`, `?azim=…`, `?elev=…`, `?dist=…`,
  `?tx=…&ty=…&tz=…`, `?fov=…`, `?pr=…`

## Files

- `zhongxiang-wte.html` — the deliverable (single self-contained file)
- `refs/power-plant-ref.png` — supplied reference photograph
- `src-plant/` — authoring fragments and `CONTRACT.md`:
  `10-util.js` · `20-sky.js` · `30-landscape.js` · `40-industry.js` ·
  `50-details.js` · `60-post.js` · `90-boot.js` + `shell.html`
- `tools/build-plant.js` — concatenates the fragments and inlines three.js
  (`node tools/build-plant.js [out.html] [--stub=landscape,industry,details]`)
- `tools/shot-plant.ps1`, `tools/qa-plant/shot.py` — headless still helpers
- `stills/zhongxiang-day.png`, `…-golden.png`, `…-night.png` — final stills

Built with Agent Teams: Lead authored util/sky/industry/boot/UI/optics and
integrated the scene; the landscape and atmosphere modules were authored in
parallel by teammates, then the whole was independently verified with Playwright.

The second revision corrects the facility identification and capacities, then goes
back to the reference for a full layout rebuild: the site becomes a clipped,
irregularly fenced campus in a dense tree frame; the three high halls become long
blue-roofed fuel yards; the east side gets the long horizontal-window wing, green
roof, 25-bay white shade canopy and relocated parking/court; the foreground gets a
smaller curved blue gallery, a long visible fuel conveyor and a proper main-gate
canopy. The camera is reframed to 480 m / 46° with the reference's risen-morning
sun, and the render now uses 4× MSAA + FXAA, a darker concrete/grass palette and a
denser procedural tree belt. Parking flicker is fixed with a single asphalt
surface, a 6 m near plane and MSAA/FXAA.

---

# The Oasis Lantern · 深空玻璃灯笼

A single-file WebGL art piece: a hand-blown glass lantern floating in deep space,
holding a miniature desert night — clay dunes, a crescent oasis that mirrors the
Milky Way, a bean-sized camel caravan walking toward the water, cacti opening
night-bloom flowers, and a crown of rice paper glowing warm against cold starlight.

**Open `oasis-lantern.html`** — double-click it. No build step, no server, no network.
Three.js (r160) is inlined, so it works offline and from a `file://` URL.

## What is in the frame

| element | how it is made |
| --- | --- |
| dunes | analytic crescent-dune fields (7 oriented ridges) + wind ripples, radial heightfield mesh, baked ambient occlusion in vertex colours |
| crescent oasis | polar mesh bounded by two offset circles; custom shader mixes a milky band, twinkling reflected stars, ripple distortion and a warm lantern glint |
| caravan | four tiny camels (capsule bodies, humps, tilted necks, swinging legs) circling the basin on the sand |
| cacti | saguaro armatures with emissive night blooms and additive glow sprites |
| camp | two tents, a fire with a flickering point light and a log ring |
| lantern | octagon of bowed glass panels (custom fresnel/specular shader), dark bronze ribs and rings, lathe-turned crown and base, rice-paper shade with accordion folds, a painted celestial frieze and starlight bleeding through |
| sky | fullscreen shader: deep gradient, nebulae, a Milky Way band and nine out-of-focus bokeh discs |
| interior night | 1150 twinkling point stars, drifting motes, a warm light pool from the paper crown |
| optics | own post pipeline: half/quarter-res defocus (depth-based CoC + gentle tilt-shift), tight bloom, chromatic fringe, film grain, vignette, ACES tonemap |
| camera | isometric-ish long lens (20° fov), slow breathing orbit, pointer parallax, drag to orbit, wheel to dolly |

## Interaction

- **drag** — orbit the lantern (vertical drag tilts)
- **move the pointer** — a slight parallax sway
- **wheel** — dolly between 5.4 and 12.5 units

## URL flags (handy for capturing stills)

`?instant=1` skips the reveal transition · `?pr=1` pins device pixel ratio ·
`?dist=` `?azim=` `?elev=` `?ty=` `?panx=` `?fov=` move the camera ·
`?hide=1` hides the lantern shell · `?aur=0` hides the aura · `?shadow=0` disables shadows.

## Files

- `oasis-lantern.html` — the deliverable (single self-contained file)
- `src/` — authoring fragments (`10-util` … `90-boot`) and the HTML shell
- `vendor/three.classic.js` — three.js r160 converted from ESM to a classic script
  (`node tools/mkthree.js` regenerates it byte-identically from `vendor/three.module.min.js`)
- `tools/build.js` — concatenates `src/` into the single file (`node tools/build.js`)
- `tools/shot.ps1` — headless-Chrome screenshot helper used while art-directing

Edit `src/*.js`, run `node tools/build.js`, reload.


---

# The Alpine Cube · 深空生态立方体

A second single-file WebGL art piece: one alpine world sealed inside a glass cube
floating in deep space — snow peaks, a meltwater river, a waterfall, conifer
forest, meadow, lake, a few small animals, sculpted clouds and ground mist, all
under a slow dawn → noon → dusk → night light cycle. Isometric long lens,
tilt-shift macro photography, clay and translucent materials, dark bokeh behind.

**Open alpine-cube.html** — double-click it. No build step, no server, no network.
Three.js (r160) is inlined, so it runs offline and from a file:// URL.

| element | how it is made |
| --- | --- |
| land | one baked 204×204 heightfield: four ridged-noise summits, a rolling meadow, a knoll, a lake basin, then a Catmull-Rom river path whose channel is carved down to a monotonic grade. Vertex-coloured by altitude / slope / wetness, with baked AO, a soil-strata skirt and a grain bump map |
| river | a shore-fitted ribbon: for every sample the ground is probed sideways until it rises above the water, so the water edge always meets the bank. Custom shader: two ripple trains, arc-length flow, fresnel sky, sparse sun glints, lace at the rim |
| waterfall | found by scanning the grade for its steepest break; a 14×26 sheet hangs from lip to plunge, scrolling streamers, foam burst and a slow mist plume at the foot |
| lake | a polar mesh with per-angle shoreline probing (organic outline), depth tint, foam ring, reflection, and a cold teal breath at night |
| glass cube | six additive fresnel panes, twelve polished welds and eight corner blocks, an inner prism fringe with a drifting dispersion gradient, and eight corner glints |
| forest | instanced conifers in three size classes (snow-dusted above the snow line), broadleaf canopies, shrubs, grass tufts, alpine flowers, reeds, boulders — placed by height / slope / wetness with clustered noise and a gentle wind sway |
| life | deer that browse and walk, hares that hop and stop, birds circling inside the glass, sculpted clay clouds with vapour veils, mist banks over meadow and lake, dust in the light, fireflies after dark |
| daylight | one keyed palette drives sun, hemisphere, sky, exposure and glass tint from a single sun elevation; the sun also aims the shadows and the volumetric shafts |
| optics | own pipeline: half / quarter-res defocus with a tilt-shift band, tight bloom, chromatic fringe, film grain, vignette, ACES tonemap |
| camera | isometric long lens (19°), slow breathing orbit, pointer parallax, drag to orbit, wheel to dolly |

## Interaction

- **drag** — orbit · **wheel** — dolly · **move the pointer** — parallax
- the day runs by itself (~124 s per round); the plaque clock shows the hour and phase
- respects prefers-reduced-motion (stills the breathing orbit and slows the day)

## URL flags (handy for stills)

?instant=1 skips the reveal · ?freeze=<s> pins absolute time (phase = s/124:
46 day, 60 dusk, 82 night) · ?t= time offset · ?cycle= seconds per day · ?pr= pixel
ratio · ?dist= ?elev= ?azim= ?ty= ?px= ?fov= camera · ?tilt= tilt-shift amount ·
?only=ground,sky,glass,water,flora,life,backdrop,shafts isolates layers ·
?hide=glass · ?shadow=0.

## Files

- alpine-cube.html — the deliverable (single self-contained file)
- src-cube/ — authoring fragments (10-util, 20-sky, 30-ground, 35-glass, 40-water,
  50-flora, 60-life, 70-post, 90-boot) and shell.html
- tools/build-cube.js — node tools/build-cube.js [out.html] [--stub=water,flora,life]
- tools/shot-cube.ps1 — headless-Chrome still helper
- preview-alpine-cube.png, stills/ — day, dusk and night stills

Edit src-cube/*.js, run node tools/build-cube.js, reload.

## Notes

The 50-flora and 60-life modules were drafted in parallel by two subagents that
both died before reporting; the lead finished, re-tuned and verified them against
still renders. 40-water was rewritten from scratch after review (the first draft
laid the ribbon over the banks and put the fall on a snow chute).

---

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
| optics | own post pipeline: 4× MSAA scene target, bloom, ACES grade, grain, vignette, subtle tilt-shift; 4096 key shadow map with tuned bias, fog; DPR up to 1.75 with auto-degrade |

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


