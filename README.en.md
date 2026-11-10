# DF-01 Digital Factory Twin

[简体中文](README.md) · English

A single-file, offline interactive 3D digital twin of an EV final-assembly factory:
cutaway hall, live data layer, SCADA-style HUD and a cinematic auto tour.

**▶ Open [`digital-factory-3d.html`](digital-factory-3d.html)** — double-click it
(Chrome / Edge, no network required).

## Highlights

- **Full process chain**: raw-material AS/RS → press line → body shop → paint shop →
  final assembly → EOL & dispatch (Z01–Z06): high-bay racks and stacker cranes,
  4 servo presses, 8 welding-robot cells, paint booth/oven, two assembly lines,
  EOL light tunnels and dispatch docks.
- **Live twin**: 21 stations, 58 s takt, OEE / output / WIP / energy / alarms;
  zone footprints, projected labels, energy & material flow pulses, station beacons.
- **Cinematic tour**: 9 continuous shots, ~88 s seamless loop covering every stage;
  `?film=1` for clean recording (HUD hidden + 2.39:1 letterbox).
- **Single-file offline**: three.js r160 inlined, fully procedural models/textures/charts,
  zero external requests; 60 fps on a desktop GPU.

## Controls

- Drag to orbit · wheel to dolly · click a floor zone or machine to inspect
- Keyboard: `1–6` zones, `0` overview, `D` data layer, `L` labels, `Space` tour,
  `B` letterbox, `F` fullscreen, `Esc` close/stop
- Recording: `?film=1`; tour with HUD: `?tour=1`; freeze: `?tourat=25`

## Build

```powershell
node build-df.js
```

`src-df/` fragments are concatenated and three.js is inlined to produce
`digital-factory-3d.html`; `qa-df/` contains Playwright stills, console capture
and interaction regression scripts.

## Verification

- Interaction regression **29/29**, tour chapter coverage **9/9**, zero console
  errors and zero external requests
- Frame-to-frame background delta ≈ 0 at far views (static, luminance-masked grain)
- Reference metrics: 271 draw calls / 291k triangles / 21 stations

## Docs

- Authoring contract: [`src-df/CONTRACT.md`](src-df/CONTRACT.md)
- Reproducible prompt: [`PROMPT-数字工厂.md`](PROMPT-数字工厂.md)

> Telemetry is illustrative (DEMO TELEMETRY).
