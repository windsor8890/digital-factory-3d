# DF-01 数字工厂 · 总装车间 / authoring contract

Single-file WebGL digital twin of an EV final-assembly factory: a cutaway factory
hall with a live production line and a data layer (zone footprints, projected
labels, energy + material flow pulses, AGV paths) that reads the simulation.

**Deliverable (lead builds):** `digital-factory-3d.html` at workspace root.
Works from `file://`, no network, no runtime build step. three.js r160 is inlined.

## Concept & visual direction

A **physical factory model under museum light** — warm concrete, steel, safety
orange, ivory machine paint — wrapped by a **precise amber/graphite data layer**.
Reads like a SCADA/HMI engineering drawing made physical, not like a neon
cyberpunk scene. Palette in `PAL` / `MAT`; HUD CSS vars in `shell.html`.

- Background: near-black warm graphite void, faint floor grid, soft studio key
  light from upper-left, cool rim from the right, fog for depth.
- Materials must be **PBR and consistent** (use `MAT` where possible). No pure
  saturated primaries, no flat untextured white, no purple. One amber signal
  accent (#f2a73b), green #9ed6b4 = run, amber = idle, red #ff5638 = fault.
- Detail level: readable at 25–40 m camera distance; small greebles only where
  the camera can get close. No low-poly toy look: chamfers, frames, cables,
  labels, warning stripes, footings make the difference.
- Scale: metres. Human ≈ 1.75 m. Hall is 156 × 80 m, eaves 15.8 m. Everything
  must obey that — a car body is 4.6 × 1.8 × 1.5 m, a trailer 13.6 m, etc.

## Files & owners (disjoint write scopes)

| file | owner | purpose |
| --- | --- | --- |
| `src-df/10-util.js` | lead | THREE alias, math/noise, layout, palette, textures, materials, geometry helpers, SIM, picking |
| `src-df/20-studio.js` | lead | background, studio lights, env map, fog, ground |
| `src-df/30-building.js` | **architect** | slab + painted floor, cutaway walls/columns/trusses, support rooms, exterior hardscape, utility yard |
| `src-df/40-process.js` | **process** | press line (Z02), body/weld robots (Z03), paint booth (Z04) |
| `src-df/45-logistics.js` | **logistics** | AS/RS + docks (Z01), AGVs, forklifts, trucks/yard |
| `src-df/50-assembly.js` | **assembly** | final assembly lines (Z05), EOL + staging + dispatch cars (Z06) |
| `src-df/60-data.js` | **data** | zone footprints, projected labels, energy/material flow, scan, beacons, envelope |
| `src-df/70-post.js` | lead | bloom / tilt-shift / grade |
| `src-df/90-boot.js` | lead | assembly, camera, picking, HUD wiring, loop |
| `src-df/shell.html` | lead | DOM + CSS |
| `build-df.js` | lead | concatenates fragments, inlines three.js |
| `qa-df/` | lead + verifier | screenshots, console capture, interaction checks |

**Write only your own module.** Do not edit `shell.html`, `10-util.js`, other
modules, `build-df.js`, or the deliverable. `tools/` is read-only in this sandbox.

## Build / test your module

```powershell
cd D:\code\vibe-projects-dsh
node build-df.js qa-df/<you>.html --stub=building,process,logistics,assembly,data   # only your module live (remove your own name from stub list)
python qa-df/shot.py --file qa-df/<you>.html --query "instant=1&still=1&view=Z02&lq=1" --out qa-df/<you>.png
# or (headless Chrome, slower):
powershell -ExecutionPolicy Bypass -File qa-df/shot.ps1 -File qa-df/<you>.html -Out qa-df/<you>.png -Query "instant=1&still=1&lq=1&view=Z02" -W 1200 -H 760
```

`python qa-df/shot.py --help` for options; it also dumps console errors, `__METRICS__`
(draw calls / triangles / fps) and `__BUILD_LOG__`. Pixel ratio is pinned with `lq=1`
(software renderer is slow; 1200×760 is a good working size).

Useful URL flags: `instant=1` skip reveal · `still=1` freeze camera drift ·
`raw=1` skip post · `nolabels=1` · `nodata=1` · `view=overview|Z01..Z06` ·
`azim= elev= dist= fov= tx= ty= tz=` · `pr=1` pin pixel ratio · `sim=1|2|4`.

## Coordinates & layout (DO NOT CHANGE)

Metres. `+x` east (screen right), `+z` south (toward the default camera), `+y` up.
Interior floor at `y = 0`; hall `x ∈ [-78, 78]`, `z ∈ [-40, 40]`.

`HALL = { x0:-78, x1:78, z0:-40, z1:40, floorY:0, trussY:13.5, wallTop:15.8 }`

### Zones (`ZONES[]`, `zoneById(id)`)

| id | zh | en | x | z | content |
| --- | --- | --- | --- | --- | --- |
| Z01 | 原材料立库 | RAW STORE / AS-RS | -76…-50 | -34…34 | 4 high-bay rack aisles along z, stacker cranes, inbound docks on west wall |
| Z02 | 冲压线 | PRESS LINE | -47…-14 | -34…-6 | 4 presses in a row along x at z≈-20, coil feeder west, scrap east |
| Z03 | 焊装车间 | BODY SHOP | -47…-14 | 6…34 | 8 robot cells in 2 rows along x (z≈14 and z≈26), body shells, fume hoods |
| Z04 | 涂装车间 | PAINT SHOP | -9…13 | -33…-4 | enclosed booth + oven, conveyor serpentine, AHUs on roof |
| Z05 | 总装线 | FINAL ASSEMBLY | 17…62 | 6…34 | 2 parallel lines at z=12 and z=28, 13 stations each, overhead conveyor |
| Z06 | 检测发运 | EOL & DISPATCH | 62…76 | 4…36 | light tunnel + EOL test, finished cars staged, outbound docks on east wall |
| Z07 | 辅助区 | SUPPORT | 16…60 | -40…-24 | control room (glass, screens), electrical room, maintenance crib |
| — | 能源站 | UTILITY YARD | -48…-24 | -54…-42 | **outside** north wall: transformers, chillers, tanks, pipe bridge |

Central spine `z ∈ [-3, 3]` is the AGV aisle — keep it clear. Cross aisles
`x ∈ [13, 17]`, `x ∈ [-50, -47]`, `x ∈ [60, 64]`, `z ∈ [34, 40]` stay clear too.

### Shared anchors (`AX`)

```
AX.agvRoute          // [[x,z],...] closed loop on the spine, for AGVs + data path
AX.inboundDocks      // [{x:-78,z:-20},{x:-78,z:0},{x:-78,z:20}] west wall door centres
AX.outboundDocks     // [{x:78,z:12},{x:78,z:28}] east wall door centres
AX.pressLine         // {z:-20, xs:[-42,-33,-24,-15]}
AX.weldCells         // 8 cell centres [{x,z}] rows z=14 / z=26
AX.paintBooth        // {x0:-9,x1:13,z0:-31,z1:-8}
AX.assemblyLines     // [{z:12,x0:18,x1:62},{z:28,x0:18,x1:62}]
AX.eol               // {x:66,z:12}
AX.controlRoom       // {x0:20,x1:38,z0:-38,z1:-25}
AX.utilityYard       // {x0:-48,x1:-24,z0:-54,z1:-42}
AX.energyEntry       // {x:-36,y:3.2,z:-40} conduit entry
AX.transferBridge    // {x0:13,x1:20,z0:-4,z1:10,y:7.2} paint → assembly overhead conveyor
AX.inboundDriveway   // west truck apron strip {x0:-104,x1:-78,z0:-27,z1:27}
AX.outboundDriveway  // east truck apron strip {x0:78,x1:104,z0:2,z1:38}
```

**Cutaway orientation (fixed by lead):** the default camera is south-west and high.
Keep **north wall (z = -40)** and **east wall (x = 78)** at full height (15.8 m) as the
backdrop; the **south edge (z = 40)** is only a low parapet/slab edge (≤1.2 m); the
**west wall (x = -78)** is cut down to ~7.5 m so the AS/RS hall is visible from above,
with its three dock doors still in the wall. Interior must read from above and through
the two open faces — never roof the hall (no roof deck; open trusses only).

### Overhead transfer bridge

Process owns the **finished-body overhead conveyor** from the body shop / paint exit
through `AX.transferBridge` at y≈7.2; assembly's overhead conveyor must continue from
that area (x≈20, z≈10) — keep the bridge corridor clear of other geometry. Nothing
else may be built above the central AGV spine (z ∈ [-3, 3]) below 6 m.

### Station list expected in SIM (one per machine group; exact ids free)

- Z01: `ASRS-01/02` (stacker cranes), `DOCK-IN` (inbound), `AGV-01` fleet
- Z02: `PR-01` … `PR-04` (presses), `XF-01` (transfer/gantry)
- Z03: `WB-01` … `WB-04` (weld cell groups)
- Z04: `PT-01` (paint booth), `OV-01` (oven)
- Z05: `AS-01`, `AS-02` (two lines), `OC-01` (overhead conveyor)
- Z06: `EOL-01` (light tunnel / test), `DOCK-OUT` (dispatch)

Everything registered must visibly react to `st.state` (`down` → stop + red beacon;
`idle` → amber). Beacons are small emissive spheres + glow sprites near the machine
top, referenced by `st.beacon`.

Anchors are for things other modules must agree on. Inside your own zone, choose
your own sub-layout — obey the zone bounds (leave a 1 m belt), the clearance
above, and the shared anchors.

## Shared globals (from 10-util.js; read-only for you)

`T` (THREE), `PI/TAU`, `clamp/lerp/smooth/fract`, `mulberry32(seed)`, `rng` (shared
seeded stream — do not rely on its sequence), `pick(arr)`, `noise2/fbm`.
`HALL`, `ZONES`, `zoneById(id)`, `AX`, `PAL`, `TEX`, `MAT`, `ENVU`, `TICKS`,
`addTick(fn)`, `addTickLate(fn)`.
Helpers: `addBox(parent,w,h,d,x,y,z,mat,opts)` (y = centre) · `addBoxBase(...)`
(y = base) · `addCylinderBase(parent,rTop,rBottom,h,seg,x,baseY,z,mat,opts)` ·
`addPlaneXZ(parent,w,d,x,y,z,mat,opts)` · `addPlane(parent,w,h,x,y,z,mat,opts)` ·
`addRibbon(parent,points,width,y,mat,opts)` · `lineBetween(parent,a,b,r,mat)` ·
`polylineTube(parent,points,r,mat)` · `mergeGeoms(geoms)` · `mergeStatic(group)`
(merge all static meshes by material — huge perf win, call once at end of build;
skips `visible=false`, `userData.noMerge`, and Sprites/InstancedMesh) ·
`shadowify(obj,cast,receive)` · `contactShadow(parent,w,d,x,z,opacity)` ·
`glowSprite(hex,size,opacity,tex)` · `canvasTexture(w,h,painter,opts)` ·
`noiseTexture`, `glowTexture`, `stripeTexture`, `makeSignTexture(text,sub,opts)`,
`addSign(parent,w,h,x,y,z,texture,opts)` · `addInstanced(parent,geo,mat,items)` ·
`ensureStyle(id,css)` · `byId(id)` · `pickable(obj,data)` · `SIM`.

`opts` for addBox: `{ cast:true, receive:true, rotY, rotX, rotZ, name, noMerge,
pick:{kind,id,title,zone,anchor:{x,y,z}} }`.

### Shared textures (`TEX`) and materials (`MAT`)

`TEX`: `concrete`, `polishedConcrete`, `asphalt`, `steel`, `steelDark`,
`diamondPlate`, `hazard`, `wallPanel`, `wallInner`, `windowBand`, `meshFence`,
`palletWood`, `cardboard`, `screen`, `screenAmber`, `glow`, `glowTight`, `grain`,
`oilStain`, `hatch`, `tyre`.
`MAT`: `floor`, `apron`, `asphalt`, `slabSide`, `wallPanel`, `wallInner`,
`windowBand`, `roof`, `steel`, `steelDark`, `galv`, `machineGrey`, `machineDark`,
`machineWhite`, `orange`, `yellow`, `white`, `black`, `hazard`, `rubber`,
`glassDark`, `glassClear`, `screen`, `ledWarm`, `ledAmber`, `ledGreen`, `ledRed`,
`pallet`, `cardboard`, `fence`, `paintBody` (array of 4 car paint materials),
`carGlass`, `tyre`, `truckWhite`, `truckDark`, `concreteDark`.

### Simulation API (`SIM`) — the single source of truth for live state

`SIM.t` real seconds · `SIM.clock` factory minutes since 00:00 · `SIM.clockRate`
(8 sim-seconds per real second) · `SIM.speed` 1/2/4 · `SIM.sdt(dt)` sim-seconds
this frame · `SIM.shift` {start:480,end:1200} · `SIM.output` · `SIM.target` ·
`SIM.takt` 58 · `SIM.oee` {a,p,q,oee} · `SIM.stations` · `SIM.zones` ·
`SIM.alarms` · `SIM.agv` {active,total,battery[]} · `SIM.counts` {wip,...} ·
`SIM.history` {out[],oee[],energy[]} · `SIM.energy` {demand,perZone} ·
`SIM.paused` · `SIM.frame(dt)` called by boot.

```js
const st = SIM.registerStation({ id:'PR-01', zone:'Z02', name:'伺服压力机 01',
  kind:'press', cycle:58, beacon:{x:-42,y:7.2,z:-20} });
// every frame: st.state is 'run' | 'idle' | 'down' (SIM flips it, raises alarms).
// read st.state to freeze your animation; write st.progress / st.util only if useful.
SIM.completeUnit(zoneId)   // call when a finished car leaves EOL (assembly only)
SIM.wip(zoneId, n)         // update WIP count for HUD/zone card
```
Register **one station per machine group** you own (≈ 2–4 total each). Every
registered station shows in the inspector and may raise an alarm — everything
you register must visually react (`st.state==='down'` → machine stops / red beacon).

## Rules

1. Wrap your module in an IIFE; expose exactly one global builder:
   `window.buildBuilding = function(){...}` etc. No other globals except
   `window.DATA` for the data module (API: `{setDataLayer(on), setLabels(on),
   focus(pickData), clearFocus(), ready}`).
2. Add your group to `scene` inside the builder: `scene.add(group)`. Use
   `scene` (a global set up by boot before builders run). Animate via `addTick`.
3. **Pickable** objects (zones, machine groups, AGVs): invisible proxy box +
   `pickable(proxy, {kind:'zone'|'machine'|'agv'|'truck', id, title, zone,
   anchor:{x,y,z}})`; group it into your zone group. Keep ≤ 40 proxies total.
4. Perf budget: your module ≤ 90k triangles, ≤ 60 draw calls after
   `mergeStatic` (target total scene < 400 draw calls, < 1.2M tris). No
   per-frame geometry/texture allocation; reuse temp vectors; no per-frame DOM
   writes except data layer labels.
5. Shadows: only key light casts. Mark big static surfaces `receive:true`; cast
   on machines/racks/vehicles, not on tiny greebles.
6. Use `TICKS` animations sparingly and cheaply; keep 60 fps on a laptop GPU.
7. Chinese text in textures is fine (`makeSignTexture` with the system fonts).
8. Never rely on another module having rendered: use `AX` anchors, not their
   meshes. Never call another module's functions.
9. Start your file with a short header comment: what it builds + station ids.
10. After building, report: file, line count, station ids, draw calls
    (`scene.drawCalls` after first frame / see HUD), triangles, any contract
    deviations, screenshot path. Do not leave test HTML in the repo root.

## Data layer specifics (60-data.js)

Owns: `#labels` DOM container; zone floor footprints + corner ticks + zone code;
DOM labels with leader lines for 7 zones (+ optional key machines) using
`lab` classes you inject via `ensureStyle`; energy flow from `AX.energyEntry`
to each zone (animated dashed amber lines with travelling pulses); material flow
along AGV route + conveyors; sweeping floor scan; station beacons from
`SIM.stations[].beacon` (colour = state) + alarm ping; building envelope dashed
box. All of it toggles with `DATA.setDataLayer(on)`; labels separately with
`DATA.setLabels(on)`. Must respect `?nodata=1`, `?nolabels=1`, `?still=1`.
`DATA.focus(pickData)` highlights the picked zone/machine and opens its label.

## Camera views

`overview` home view + one view per zone; lead defines them from `ZONES` bounds.
When authoring, check your zone reads well from its zone view and from overview.

## Definition of done for your module

- `node build-df.js qa-df/<you>.html --stub=…` runs clean, console empty.
- Screenshot at 1440×900 from your zone view looks intentional in the shared
  palette; no z-fighting, no floating parts, no interpenetration with walls.
- All moving parts animate; station `down` freezes animation and turns beacon red.
- ≤ budget tris/draw calls; `mergeStatic` applied on static groups.
- Short report back (see rule 10).
