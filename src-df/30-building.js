/* ============================================================
   30 · building — DF-01 数字工厂 / 总装车间 A
   Painted concrete slab (procedural 4k floor art) · cutaway hall
   shell (N+E full height walls w/ cladding + ribbon windows, W
   cut at 7.5 m with 3 inbound dock doors, S low parapet) · steel
   columns / transverse trusses / purlins / skylight frames ·
   hanging services + linear LED high-bays · Z07 support rooms
   (glass control room, LV room, maintenance crib) · exterior
   apron, dock canopies, driveways, perimeter fence, light masts ·
   utility yard + energy pipe bridge · zone pick proxies.
   Static only — mergeStatic() applied once at the end.
   ============================================================ */
(function () {
  "use strict";

  /* deterministic local stream — do not disturb the shared rng */
  const R = mulberry32(0x0df01);
  const rr = (a, b) => a + (b - a) * R();
  const RI = (n) => (R() * n) | 0;

  const HX0 = HALL.x0, HX1 = HALL.x1, HZ0 = HALL.z0, HZ1 = HALL.z1;
  const EAVE = HALL.wallTop, TY = HALL.trussY;
  const WALL_T = 0.5;
  const GRID = 12;
  const DOOR_W = 4.5, DOOR_H = 4.2;
  const WEST_FACE = HX0 - WALL_T;   /* -78.5 */
  const NORTH_FACE = HZ0 - WALL_T;  /* -40.5 */
  const EAST_FACE = HX1 + WALL_T;   /*  78.5 */
  const FONT_CJK = "'Bahnschrift','Microsoft YaHei UI','Microsoft YaHei',sans-serif";
  const FONT_MONO = "'Cascadia Mono',Consolas,'Courier New',monospace";

  const B = {};        /* module-local materials */
  const PULSES = [];   /* glow sprites animated cheaply in one tick */

  /* ---------------- tiny local helpers ---------------- */
  function bx(g, w, h, d, x, y, z, mat, o) { return addBox(g, w, h, d, x, y, z, mat, o || {}); }
  function bxB(g, w, h, d, x, by, z, mat, o) { return addBoxBase(g, w, h, d, x, by, z, mat, o || {}); }
  function cylB(g, rt, rb, h, seg, x, by, z, mat, o) { return addCylinderBase(g, rt, rb, h, seg, x, by, z, mat, o || {}); }
  function planeXZ(g, w, d, x, y, z, mat, o) { return addPlaneXZ(g, w, d, x, y, z, mat, o || {}); }
  function plane(g, w, h, x, y, z, mat, o) { return addPlane(g, w, h, x, y, z, mat, o || {}); }
  function tubeX(g, r, len, x, y, z, mat, o) {
    return addCylinder(g, r, r, len, 8, x, y, z, mat, Object.assign({ rotZ: PI / 2 }, o || {}));
  }
  function tubeZ(g, r, len, x, y, z, mat, o) {
    return addCylinder(g, r, r, len, 8, x, y, z, mat, Object.assign({ rotX: PI / 2 }, o || {}));
  }
  function cloneTex(tex, rx, ry) {
    const t = tex.clone();
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.anisotropy = 8;
    t.needsUpdate = true;
    return t;
  }

  /* ============================================================
     1 · PROCEDURAL TEXTURES — the painted floor is the hero
     ============================================================ */

  function makeNoiseTile(size, seed, lo, hi) {
    const c = makeCanvas(size, size);
    const ctx = c.getContext("2d");
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const px = i % size, py = (i / size) | 0;
      const v = lo + (hi - lo) * fbm(px * 0.055, py * 0.055, 4);
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /* ---- the floor: 4096 × 2048 over the full 156 × 80 m hall ---- */
  function makeFloorTexture() {
    const W = 4096, H = 2048;
    const px = W / 156, pz = H / 80;
    const X = (x) => (x + 78) * px;
    const Z = (z) => (z + 40) * pz;
    const MW = (m) => m * px;      /* metres along x → px */
    const MZ = (m) => m * pz;      /* metres along z → px */
    const tileA = makeNoiseTile(256, 5150, 42, 214);
    const tileB = makeNoiseTile(256, 991, 60, 198);

    return canvasTexture(W, H, (ctx, w, h) => {
      /* ---------- warm polished concrete base ---------- */
      ctx.fillStyle = "#c2b9a7";
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = "overlay";
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = ctx.createPattern(tileA, "repeat");
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "soft-light";
      ctx.globalAlpha = 0.62;
      ctx.save();
      ctx.scale(5.5, 5.5);
      ctx.fillRect(0, 0, w / 5.5, h / 5.5);
      ctx.restore();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.12;
      ctx.save();
      ctx.scale(0.32, 0.32);
      ctx.fillStyle = ctx.createPattern(tileB, "repeat");
      ctx.fillRect(0, 0, w / 0.32, h / 0.32);
      ctx.restore();
      ctx.restore();

      /* broad warm / cool mottling patches */
      for (let i = 0; i < 90; i++) {
        const x = R() * w, y = R() * h, rad = rr(90, 640);
        const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
        const warm = R() > 0.45;
        g.addColorStop(0, warm ? "rgba(156,140,114,0.075)" : "rgba(112,118,122,0.07)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      /* fine grain speckle */
      for (let i = 0; i < 5200; i++) {
        const x = R() * w, y = R() * h, s = rr(1, 2.6);
        ctx.fillStyle = R() > 0.5 ? "rgba(74,68,58,0.055)" : "rgba(238,233,222,0.05)";
        ctx.fillRect(x, y, s, s);
      }

      /* ---------- saw-cut expansion joints every 6 m ---------- */
      ctx.save();
      for (let gx = -72; gx <= 72; gx += 6) {
        const p = X(gx);
        ctx.strokeStyle = "rgba(56,50,42,0.54)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
        ctx.strokeStyle = "rgba(240,236,226,0.10)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p + 2, 0); ctx.lineTo(p + 2, h); ctx.stroke();
      }
      for (let gz = -36; gz <= 36; gz += 6) {
        const p = Z(gz);
        ctx.strokeStyle = "rgba(56,50,42,0.54)";
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
        ctx.strokeStyle = "rgba(240,236,226,0.10)";
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, p + 2); ctx.lineTo(w, p + 2); ctx.stroke();
      }
      ctx.restore();
      /* faint joint dust halos */
      ctx.save();
      ctx.globalAlpha = 0.2;
      for (let gx = -72; gx <= 72; gx += 6) {
        ctx.fillStyle = "rgba(70,62,50,1)";
        ctx.fillRect(X(gx) - 9, 0, 18, h);
      }
      for (let gz = -36; gz <= 36; gz += 6) {
        ctx.fillStyle = "rgba(70,62,50,1)";
        ctx.fillRect(0, Z(gz) - 7, w, 14);
      }
      ctx.restore();

      /* ---------- helpers ---------- */
      const fTxt = (str, x, z, hm, style, o) => {
        o = o || {};
        const size = Math.round(hm * pz);
        ctx.save();
        ctx.translate(X(x), Z(z));
        if (o.rot) ctx.rotate(o.rot);
        ctx.font = (o.weight || 700) + " " + size + "px " + (o.font || FONT_CJK);
        ctx.textAlign = o.align || "center";
        ctx.textBaseline = "middle";
        if (o.stroke) {
          ctx.strokeStyle = o.stroke;
          ctx.lineWidth = Math.max(2, size * 0.045);
          ctx.strokeText(str, 0, 0);
        }
        ctx.fillStyle = style;
        ctx.fillText(str, 0, 0);
        ctx.restore();
      };
      const line = (x0, z0, x1, z1, wm, style, dash) => {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(X(x0), Z(z0));
        ctx.lineTo(X(x1), Z(z1));
        ctx.lineWidth = Math.max(1.5, wm * px);
        ctx.strokeStyle = style;
        if (dash) ctx.setLineDash(dash.map((v) => v * px));
        ctx.stroke();
        ctx.restore();
      };
      const outset = (x0, z0, x1, z1, wm, style, dash) => {
        ctx.save();
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1.5, wm * px);
        if (dash) ctx.setLineDash(dash.map((v) => v * px));
        ctx.strokeRect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * pz);
        ctx.restore();
      };
      const fillZone = (x0, z0, x1, z1, style) => {
        ctx.fillStyle = style;
        ctx.fillRect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * pz);
      };
      const chevron = (cx, cz, dir, size, style) => {
        ctx.save();
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(2, 0.18 * px);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const a = size * 0.5, b = size * 0.62;
        for (let k = 0; k < 2; k++) {
          const ox = cx + (dir > 0 ? -1 : 1) * k * size * 0.5;
          ctx.beginPath();
          ctx.moveTo(X(ox - dir * a * 0.0 - dir * a), Z(cz - a));
          ctx.lineTo(X(ox + dir * a * 0.0), Z(cz));
          ctx.lineTo(X(ox - dir * a), Z(cz + b));
          ctx.stroke();
        }
        ctx.restore();
      };

      /* ---------- pedestrian walkways (safety green / warm white) ---------- */
      fillZone(-78, -40, 78, -36.4, "rgba(96,138,114,0.62)");
      fillZone(-78, 36.2, 78, 40, "rgba(96,138,114,0.62)");
      line(-78, -36.4, 78, -36.4, 0.28, "rgba(240,236,226,0.88)");
      line(-78, -39.82, 78, -39.82, 0.14, "rgba(240,236,226,0.45)");
      line(-78, 36.2, 78, 36.2, 0.28, "rgba(240,236,226,0.88)");
      line(-78, 39.86, 78, 39.86, 0.14, "rgba(240,236,226,0.45)");
      /* walkway hatch ticks */
      ctx.save();
      ctx.strokeStyle = "rgba(240,236,226,0.30)";
      ctx.lineWidth = 5;
      for (let x = -76; x <= 76; x += 2.4) {
        ctx.beginPath();
        ctx.moveTo(X(x), Z(-36.4)); ctx.lineTo(X(x + 1.1), Z(-40));
        ctx.moveTo(X(x), Z(36.2)); ctx.lineTo(X(x + 1.1), Z(40));
        ctx.stroke();
      }
      ctx.restore();
      fTxt("行人通道 · PEDESTRIAN WALKWAY", -6, -38.2, 0.95, "rgba(240,236,226,0.62)", { weight: 600 });
      fTxt("行人通道 · PEDESTRIAN WALKWAY", -6, 38.1, 0.95, "rgba(240,236,226,0.62)", { weight: 600 });

      /* ---------- zone boundaries + stencils ---------- */
      for (const zn of ZONES) {
        if (zn.id === "Z07") continue;
        outset(zn.x0 + 0.6, zn.z0 + 0.6, zn.x1 - 0.6, zn.z1 - 0.6, 0.78, "rgba(228,182,84,0.96)", [2.4, 1.6]);
        outset(zn.x0 + 0.6, zn.z0 + 0.6, zn.x1 - 0.6, zn.z1 - 0.6, 0.16, "rgba(240,236,226,0.4)");
        /* corner ticks */
        const ex = 3.4;
        [[zn.x0 + 0.6, zn.z0 + 0.6, 1, 1], [zn.x1 - 0.6, zn.z0 + 0.6, -1, 1],
         [zn.x0 + 0.6, zn.z1 - 0.6, 1, -1], [zn.x1 - 0.6, zn.z1 - 0.6, -1, -1]].forEach((c) => {
          line(c[0], c[1], c[0] + ex * c[2], c[1], 0.5, "rgba(222,174,74,1)");
          line(c[0], c[1], c[0], c[1] + ex * c[3], 0.5, "rgba(222,174,74,1)");
        });
      }
      const stencils = [
        ["Z01", "原材料立库", "RAW STORE / AS-RS", -71.5, 27.6],
        ["Z02", "冲压线", "PRESS LINE", -43.0, -31.2],
        ["Z03", "焊装车间", "BODY SHOP", -43.0, 28.0],
        ["Z04", "涂装车间", "PAINT SHOP", 1.5, -30.6],
        ["Z05", "总装线", "FINAL ASSEMBLY", 20.0, 29.4],
        ["Z06", "检测发运", "EOL & DISPATCH", 66.0, 31.4],
      ];
      for (const s of stencils) {
        fTxt(s[0], s[3], s[4], 5.2, "rgba(240,236,226,0.9)", { stroke: "rgba(228,182,84,0.75)", weight: 800 });
        fTxt(s[1], s[3], s[4] + 3.5, 2.1, "rgba(228,182,84,0.95)", { weight: 700 });
        fTxt(s[2], s[3], s[4] + 4.95, 0.95, "rgba(240,236,226,0.68)", { weight: 400, font: FONT_MONO });
      }

      /* ---------- central AGV lane, z ∈ [-3, 3] ---------- */
      fillZone(-78, -3, 78, 3, "rgba(206,192,160,0.10)");
      line(-78, -3.3, 78, -3.3, 0.62, "rgba(228,182,84,0.96)");
      line(-78, 3.3, 78, 3.3, 0.62, "rgba(228,182,84,0.96)");
      line(-78, -2.72, 78, -2.72, 0.16, "rgba(240,236,226,0.42)");
      line(-78, 2.72, 78, 2.72, 0.16, "rgba(240,236,226,0.42)");
      line(-78, 0, 78, 0, 0.4, "rgba(246,242,232,0.96)", [3.0, 2.0]);
      for (let x = -70; x <= 70; x += 10) {
        chevron(x, -1.6, 1, 2.8, "rgba(228,182,84,0.94)");
        chevron(x, 1.6, -1, 2.8, "rgba(228,182,84,0.94)");
      }
      fTxt("AGV 自动导引车 · KEEP CLEAR", -34, 6.3, 1.05, "rgba(222,174,74,0.72)", { weight: 600 });
      fTxt("AGV 自动导引车 · KEEP CLEAR", 34, -6.3, 1.05, "rgba(222,174,74,0.72)", { weight: 600 });

      /* ---------- crosswalk at x ≈ 15 ---------- */
      fillZone(13.1, -6.6, 16.9, 6.6, "rgba(240,236,226,0.22)");
      for (let i = 0; i < 9; i++) {
        const z0 = -6.0 + i * 1.5;
        fillZone(13.5, z0, 16.5, z0 + 1.0, "rgba(246,242,232,0.94)");
      }
      line(13.1, -6.6, 13.1, 6.6, 0.26, "rgba(246,242,232,0.85)");
      line(16.9, -6.6, 16.9, 6.6, 0.26, "rgba(246,242,232,0.85)");
      /* second crossing on the west cross aisle x ≈ -48.5 */
      fillZone(-50.4, -6.2, -46.6, 6.2, "rgba(240,236,226,0.20)");
      for (let i = 0; i < 8; i++) {
        const z0 = -5.6 + i * 1.5;
        fillZone(-50.0, z0, -47.0, z0 + 0.95, "rgba(246,242,232,0.88)");
      }

      /* ---------- hazard chevrons at all dock doors ---------- */
      const hazBand = (x0, z0, x1, z1) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * pz);
        ctx.clip();
        ctx.fillStyle = "rgba(214,176,62,0.90)";
        ctx.fillRect(X(x0), Z(z0), (x1 - x0) * px, (z1 - z0) * pz);
        ctx.strokeStyle = "rgba(22,23,25,0.82)";
        ctx.lineWidth = 0.42 * px;
        const step = 1.0 * px;
        for (let i = -40; i < 120; i++) {
          ctx.beginPath();
          ctx.moveTo(X(x0) + i * step, Z(z0));
          ctx.lineTo(X(x0) + i * step + (z1 - z0) * pz, Z(z1));
          ctx.stroke();
        }
        ctx.restore();
      };
      for (const d of AX.inboundDocks) hazBand(-78, d.z - 4.2, -73.6, d.z + 4.2);
      for (const d of AX.outboundDocks) hazBand(73.6, d.z - 4.2, 78, d.z + 4.2);
      for (const d of AX.inboundDocks) {
        fTxt("D" + (AX.inboundDocks.indexOf(d) + 1), -76.0, d.z - 5.1, 1.15, "rgba(246,242,232,0.92)", { weight: 800 });
      }
      fTxt("OUTBOUND →", 75.9, 33.6, 0.9, "rgba(222,174,74,0.9)", { weight: 700, rot: -PI / 2 });

      /* ---------- Z01 forklift lanes + keep-clear ---------- */
      line(-78, -12.0, -50, -12.0, 0.3, "rgba(222,174,74,0.85)", [2.0, 1.4]);
      line(-78, -9.0, -50, -9.0, 0.3, "rgba(222,174,74,0.85)", [2.0, 1.4]);
      line(-78, 9.0, -50, 9.0, 0.3, "rgba(222,174,74,0.85)", [2.0, 1.4]);
      line(-78, 12.0, -50, 12.0, 0.3, "rgba(222,174,74,0.85)", [2.0, 1.4]);
      for (let x = -74; x <= -54; x += 4) {
        chevron(x, -10.5, 1, 1.8, "rgba(222,174,74,0.82)");
        chevron(x, 10.5, -1, 1.8, "rgba(222,174,74,0.82)");
      }
      for (const d of AX.inboundDocks) {
        outset(-78, d.z - 5.6, -71.6, d.z + 5.6, 0.3, "rgba(222,174,74,0.95)", [1.2, 0.8]);
        fTxt("KEEP CLEAR", -75.2, d.z + 5.0, 0.75, "rgba(222,174,74,0.88)", { weight: 700, font: FONT_MONO });
      }
      /* high-bay rack footing lines along z */
      for (const rx of [-73.5, -66.5, -59.5, -52.5]) {
        line(rx - 0.75, -33, rx - 0.75, 33, 0.18, "rgba(240,236,226,0.40)");
        line(rx + 0.75, -33, rx + 0.75, 33, 0.18, "rgba(240,236,226,0.40)");
      }

      /* ---------- painted equipment footings ---------- */
      const footing = (cx, cz, fw, fd, opt) => {
        opt = opt || {};
        outset(cx - fw / 2, cz - fd / 2, cx + fw / 2, cz + fd / 2, 0.4, "rgba(62,56,46,0.82)");
        outset(cx - fw / 2 + 0.3, cz - fd / 2 + 0.3, cx + fw / 2 - 0.3, cz + fd / 2 - 0.3, 0.1, "rgba(240,236,226,0.32)");
        const bw = 0.18;
        [[cx - fw / 2 + 0.7, cz - fd / 2 + 0.7], [cx + fw / 2 - 0.7, cz - fd / 2 + 0.7],
         [cx - fw / 2 + 0.7, cz + fd / 2 - 0.7], [cx + fw / 2 - 0.7, cz + fd / 2 - 0.7]].forEach((p) => {
          ctx.save();
          ctx.fillStyle = "rgba(48,44,38,0.9)";
          ctx.beginPath();
          ctx.arc(X(p[0]), Z(p[1]), Math.max(3, bw * 0.55 * px), 0, TAU);
          ctx.fill();
          ctx.strokeStyle = "rgba(240,236,226,0.45)";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        });
        if (opt.label) fTxt(opt.label, cx, cz + fd / 2 - 0.6, 0.9, "rgba(240,236,226,0.55)", { weight: 700, font: FONT_MONO });
      };
      /* press line footings (Z02, z = -20) */
      for (const pxx of AX.pressLine.xs) footing(pxx, AX.pressLine.z, 8.2, 6.4, { label: "PR" });
      fTxt("冲压线 · PRESS LINE", -28.5, -27.2, 1.25, "rgba(222,174,74,0.8)", { weight: 700 });
      /* weld cell footings (z = 14 / 26) */
      for (const c of AX.weldCells) footing(c.x, c.z, 8.6, 7.0, { label: "WB" });
      /* assembly line station ticks */
      for (const ln of AX.assemblyLines) {
        outset(ln.x0 - 1, ln.z - 3.6, ln.x1 + 1, ln.z + 3.6, 0.4, "rgba(228,182,84,0.9)");
        for (let x = ln.x0 + 1.7; x <= ln.x1; x += 3.4) {
          line(x, ln.z - 3.6, x, ln.z - 2.6, 0.2, "rgba(240,236,226,0.6)");
          line(x, ln.z + 2.6, x, ln.z + 3.6, 0.2, "rgba(240,236,226,0.6)");
        }
      }
      fTxt("总装线 A · FINAL ASSEMBLY LINE A", 40, 16.4, 1.0, "rgba(240,236,226,0.5)", { weight: 600 });
      fTxt("总装线 B · FINAL ASSEMBLY LINE B", 40, 32.4, 1.0, "rgba(240,236,226,0.5)", { weight: 600 });
      /* paint booth footprint */
      const pb = AX.paintBooth;
      outset(pb.x0, pb.z0, pb.x1, pb.z1, 0.5, "rgba(64,58,48,0.85)");
      outset(pb.x0 + 0.5, pb.z0 + 0.5, pb.x1 - 0.5, pb.z1 - 0.5, 0.14, "rgba(240,236,226,0.4)");
      for (const c of [[pb.x0, pb.z0], [pb.x1, pb.z0], [pb.x0, pb.z1], [pb.x1, pb.z1]]) {
        fillZone(c[0] - 1.3, c[1] - 1.3, c[0] + 1.3, c[1] + 1.3, "rgba(214,176,62,0.62)");
      }
      fTxt("涂装车间 · PAINT SHOP", 2, pb.z1 - 1.6, 1.15, "rgba(222,174,74,0.85)", { weight: 700 });
      /* EOL / light tunnel footing */
      outset(62.6, 8.2, 75.4, 16.0, 0.32, "rgba(64,58,48,0.8)");
      /* inbound dock approach lanes */
      fTxt("INBOUND · 收货", -75.6, 15.0, 0.8, "rgba(222,174,74,0.85)", { weight: 600, rot: -PI / 2 });

      /* ---------- oil stains near the press line ---------- */
      ctx.save();
      for (let i = 0; i < 26; i++) {
        const bx0 = -45 + R() * 34, bz0 = -25 + R() * 11;
        const rad = rr(0.5, 2.4);
        const g = ctx.createRadialGradient(X(bx0), Z(bz0), 0, X(bx0), Z(bz0), rad * px);
        g.addColorStop(0, "rgba(32,27,21,0.30)");
        g.addColorStop(0.6, "rgba(38,32,25,0.16)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(X(bx0) - rad * px, Z(bz0) - rad * pz, rad * 2 * px, rad * 2 * pz);
      }
      /* a couple of tire streaks by the presses */
      ctx.strokeStyle = "rgba(34,29,23,0.13)";
      ctx.lineWidth = 0.28 * px;
      for (let i = 0; i < 7; i++) {
        const x0 = -46 + R() * 30, z0 = -24 + R() * 8;
        ctx.beginPath();
        ctx.moveTo(X(x0), Z(z0));
        ctx.quadraticCurveTo(X(x0 + rr(-3, 3)), Z(z0 + rr(-2, 2)), X(x0 + rr(-8, 8)), Z(z0 + rr(-1, 1)));
        ctx.stroke();
      }
      ctx.restore();

      /* ---------- warehouse tyre marks ---------- */
      ctx.save();
      ctx.strokeStyle = "rgba(30,26,21,0.16)";
      ctx.lineWidth = 0.32 * px;
      ctx.lineCap = "round";
      for (let i = 0; i < 12; i++) {
        const ax = -74 + R() * 20, bz = -32 + R() * 64;
        const dir = R() > 0.5 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(X(ax), Z(bz));
        ctx.bezierCurveTo(X(ax + dir * 3), Z(bz + rr(-1, 1)), X(ax + dir * 9), Z(bz + rr(-1, 1)), X(ax + dir * 15), Z(bz + rr(-1.5, 1.5)));
        ctx.stroke();
      }
      /* tyre tracks along the AGV lane */
      ctx.strokeStyle = "rgba(30,26,21,0.07)";
      ctx.lineWidth = 0.22 * px;
      for (const zz of [-1.75, -1.35, 1.35, 1.75]) {
        ctx.beginPath(); ctx.moveTo(X(-76), Z(zz)); ctx.lineTo(X(76), Z(zz + 0.12)); ctx.stroke();
      }
      ctx.restore();

      /* ---------- utility covers / drains ---------- */
      const drain = (cx, cz) => {
        ctx.save();
        ctx.fillStyle = "rgba(46,50,52,0.78)";
        ctx.fillRect(X(cx) - 0.36 * px, Z(cz) - 0.26 * pz, 0.72 * px, 0.52 * pz);
        ctx.strokeStyle = "rgba(20,22,23,0.75)";
        ctx.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          ctx.beginPath();
          ctx.moveTo(X(cx - 0.28 + i * 0.14), Z(cz - 0.22));
          ctx.lineTo(X(cx - 0.28 + i * 0.14), Z(cz + 0.22));
          ctx.stroke();
        }
        ctx.strokeStyle = "rgba(210,208,198,0.35)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(X(cx) - 0.36 * px, Z(cz) - 0.26 * pz, 0.72 * px, 0.52 * pz);
        ctx.restore();
      };
      for (let x = -68; x <= 68; x += 24) { drain(x, -3.7); drain(x + 12, 3.7); }
      const cover = (cx, cz, r) => {
        ctx.save();
        ctx.fillStyle = "rgba(72,72,66,0.55)";
        ctx.beginPath(); ctx.arc(X(cx), Z(cz), r * px, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(30,30,28,0.5)"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = "rgba(210,208,198,0.22)"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(X(cx), Z(cz), r * 0.72 * px, 0, TAU); ctx.stroke();
        ctx.restore();
      };
      cover(-60, 21.5, 0.4); cover(22, -14.5, 0.4); cover(52, 6.5, 0.36); cover(-30, 16, 0.36);

      /* ---------- hero floor graphic: DF-01 ---------- */
      ctx.save();
      ctx.translate(X(1.2), Z(29.8));
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.strokeStyle = "rgba(222,174,74,0.82)";
      ctx.lineWidth = 8;
      ctx.strokeRect(-MW(7.8), -MZ(4.2), MW(15.6), MZ(8.4));
      ctx.strokeStyle = "rgba(240,236,226,0.30)";
      ctx.lineWidth = 3;
      ctx.strokeRect(-MW(7.4), -MZ(3.8), MW(14.8), MZ(7.6));
      ctx.fillStyle = "rgba(242,238,228,0.82)";
      ctx.font = "800 " + Math.round(5.2 * pz) + "px " + FONT_CJK;
      ctx.fillText("DF-01", 0, -1.35 * pz);
      ctx.fillStyle = "rgba(222,174,74,0.92)";
      ctx.font = "600 " + Math.round(1.06 * pz) + "px " + FONT_CJK;
      ctx.fillText("数字工厂 · 总装车间 A · DIGITAL FACTORY", 0, 1.9 * pz);
      ctx.fillStyle = "rgba(242,238,228,0.48)";
      ctx.font = "400 " + Math.round(0.72 * pz) + "px " + FONT_MONO;
      ctx.fillText("CELL 01 / 02 / 03 / 04 / 05 / 06", 0, 3.1 * pz);
      ctx.restore();

      /* directional floor arrows near the cross aisles */
      const arrow = (cx, cz, rot, sm) => {
        ctx.save();
        ctx.translate(X(cx), Z(cz));
        ctx.rotate(rot);
        ctx.fillStyle = "rgba(222,174,74,0.80)";
        ctx.beginPath();
        ctx.moveTo(-MW(2.4) * sm, -MZ(0.3) * sm);
        ctx.lineTo(0, -MZ(0.3) * sm);
        ctx.lineTo(0, -MZ(0.9) * sm);
        ctx.lineTo(MW(1.6) * sm, 0);
        ctx.lineTo(0, MZ(0.9) * sm);
        ctx.lineTo(0, MZ(0.3) * sm);
        ctx.lineTo(-MW(2.4) * sm, MZ(0.3) * sm);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      };
      arrow(-2.5, 37.4, 0, 1);
      arrow(15, 8.6, -PI / 2, 0.8);
      arrow(-48.5, -8.2, PI / 2, 0.8);

      /* ---------- painted wear: grime + traffic polish ---------- */
      ctx.save();
      ctx.globalCompositeOperation = "multiply";
      ctx.globalAlpha = 0.10;
      ctx.scale(0.62, 0.62);
      ctx.fillStyle = ctx.createPattern(tileB, "repeat");
      ctx.fillRect(0, 0, w / 0.62, h / 0.62);
      ctx.restore();
      /* softly dark traffic bands down the main aisle */
      ctx.save();
      const tg = ctx.createLinearGradient(0, Z(-6), 0, Z(6));
      tg.addColorStop(0, "rgba(40,34,26,0)");
      tg.addColorStop(0.5, "rgba(40,34,26,0.10)");
      tg.addColorStop(1, "rgba(40,34,26,0)");
      ctx.fillStyle = tg;
      ctx.fillRect(0, Z(-6), w, (12 / 80) * h);
      ctx.restore();
    }, { srgb: true });
  }

  /* ============================================================
     2 · SIGN ATLAS — one texture / one material for every board
     ============================================================ */
  const SIGN_SLOTS = [
    { title: "DF-01", sub: "总装车间 A · FINAL ASSEMBLY HALL", big: 1, bg: "#15181b" },
    { title: "安全第一", sub: "SAFETY FIRST · 0 ACCIDENTS · 安全生产 人人有责", acc: "#9ed6b4", bg: "#121d17" },
    { title: "紧急疏散", sub: "EVACUATION · EXIT 01 / 02  →", acc: "#f2a73b", bg: "#1b1710", arrow: "r" },
    { title: "冲压线", sub: "PRESS LINE · Z02  →", acc: "#f2a73b", bg: "#191b1e", arrow: "r" },
    { title: "焊装车间", sub: "BODY SHOP · Z03  ←", acc: "#f2a73b", bg: "#191b1e", arrow: "l" },
    { title: "涂装车间", sub: "PAINT SHOP · Z04  →", acc: "#f2a73b", bg: "#191b1e", arrow: "r" },
    { title: "总装线", sub: "FINAL ASSEMBLY · Z05  →", acc: "#f2a73b", bg: "#191b1e", arrow: "r" },
    { title: "检测发运", sub: "EOL & DISPATCH · Z06  →", acc: "#f2a73b", bg: "#191b1e", arrow: "r" },
    { title: "能源入口", sub: "ENERGY ENTRY · 高压危险", acc: "#ffb35c", bg: "#1d1409", haz: 1 },
    { title: "收货区", sub: "INBOUND · DOCK D1 – D3  ←", acc: "#f2a73b", bg: "#171a1c", arrow: "l" },
    { title: "发货区", sub: "OUTBOUND · DOCK D4 – D5  →", acc: "#f2a73b", bg: "#171a1c", arrow: "r" },
    { title: "电气 / LV", sub: "ELECTRICAL ROOM · 闲人免进", acc: "#e8c26a", bg: "#17191c", haz: 1 },
    { title: "维护间", sub: "MAINTENANCE CRIB", acc: "#c9cfd2", bg: "#17191c" },
    { title: "控制室", sub: "CONTROL ROOM · AUTHORIZED ONLY", acc: "#9ed6b4", bg: "#131c19" },
    { title: "能源站", sub: "UTILITY YARD · 10 kV", acc: "#e8c26a", bg: "#17191c", haz: 1 },
    { title: "数字工厂", sub: "DIGITAL TWIN · DF-01 · 数字孪生", acc: "#f2a73b", bg: "#15181b" },
  ];

  function makeSignAtlas() {
    const W = 4096, H = 512, SW = 512, SH = 256;
    const tex = canvasTexture(W, H, (ctx) => {
      for (let i = 0; i < SIGN_SLOTS.length; i++) {
        const s = SIGN_SLOTS[i];
        const cx = (i % 8) * SW, cy = ((i / 8) | 0) * SH;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = s.bg || "#191c1f";
        ctx.fillRect(0, 0, SW, SH);
        const g = ctx.createLinearGradient(0, 0, 0, SH);
        g.addColorStop(0, "rgba(255,255,255,0.055)");
        g.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, SW, SH);
        /* accent bar + border */
        ctx.fillStyle = s.acc || "#f2a73b";
        ctx.fillRect(0, 0, 7, SH);
        ctx.fillRect(0, 0, SW, 5);
        ctx.strokeStyle = "rgba(242,167,59,0.45)";
        ctx.lineWidth = 3;
        ctx.strokeRect(10, 10, SW - 20, SH - 20);
        /* hazard tick field for danger boards */
        if (s.haz) {
          ctx.save();
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.rect(SW - 120, 14, 96, SH - 28);
          ctx.clip();
          ctx.fillStyle = "#c9a13a";
          ctx.fillRect(SW - 120, 14, 96, SH - 28);
          ctx.strokeStyle = "rgba(24,25,27,0.8)";
          ctx.lineWidth = 9;
          for (let k = -8; k < 16; k++) {
            ctx.beginPath();
            ctx.moveTo(SW - 120 + k * 24, 14);
            ctx.lineTo(SW - 120 + k * 24 + (SH - 28), SH - 14);
            ctx.stroke();
          }
          ctx.restore();
        }
        /* title + sub */
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ece7dd";
        ctx.font = "700 " + (s.big ? 108 : 84) + "px " + FONT_CJK;
        ctx.fillText(s.title, 34, s.big ? 104 : 96);
        ctx.fillStyle = s.acc || "rgba(242,167,59,0.92)";
        ctx.font = "400 " + (s.sub.length > 38 ? 21 : 27) + "px " + FONT_MONO;
        ctx.fillText(s.sub, 36, 184);
        ctx.fillStyle = "rgba(236,231,221,0.32)";
        ctx.font = "400 18px " + FONT_MONO;
        ctx.fillText("DF-01 · 总装车间 A", 36, SH - 32);
        /* direction chevrons */
        if (s.arrow && !s.haz) {
          ctx.strokeStyle = "rgba(242,167,59,0.85)";
          ctx.lineWidth = 9;
          ctx.lineJoin = "round";
          for (let k = 0; k < 3; k++) {
            const ax = SW - 152 + k * 46, ay = SH / 2 + 6;
            ctx.beginPath();
            if (s.arrow === "r") {
              ctx.moveTo(ax, ay - 34); ctx.lineTo(ax + 30, ay); ctx.lineTo(ax, ay + 34);
            } else {
              ctx.moveTo(ax + 30, ay - 34); ctx.lineTo(ax, ay); ctx.lineTo(ax + 30, ay + 34);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }, { srgb: true });
    return new T.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.42,
      roughness: 0.55, metalness: 0.08, envMapIntensity: 0.7,
    });
  }

  /* place a plane that samples one slot of the sign atlas */
  function signQuad(g, slot, w, h, x, y, z, rotY) {
    const m = plane(g, w, h, x, y, z, B.signs, rotY ? { rotY: rotY } : {});
    const col = slot % 8, row = (slot / 8) | 0;
    const u0 = col / 8, u1 = (col + 1) / 8;
    const v1 = 1 - row / 2, v0 = 1 - (row + 1) / 2;
    const uv = m.geometry.attributes.uv;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1);
    uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  /* ============================================================
     3 · LOCAL MATERIALS
     ============================================================ */
  function makeMats() {
    B.floor = new T.MeshStandardMaterial({
      map: makeFloorTexture(), color: 0xe8e1d3, roughness: 0.55, metalness: 0.04,
      envMapIntensity: 0.9,
    });
    B.apron = new T.MeshStandardMaterial({
      map: cloneTex(TEX.concrete, 46, 26), color: 0x9e978b,
      roughness: 0.88, metalness: 0.02, envMapIntensity: 0.36,
    });
    B.gravel = new T.MeshStandardMaterial({
      map: cloneTex(TEX.concreteDark, 12, 6), color: 0x8a8a84,
      roughness: 0.96, metalness: 0.02, envMapIntensity: 0.3,
    });
    B.wallInner = new T.MeshStandardMaterial({
      map: cloneTex(TEX.wallInner, 26, 2), color: 0xdcd7cb,
      roughness: 0.8, metalness: 0.03, envMapIntensity: 0.5,
    });
    B.wallPanel = new T.MeshStandardMaterial({
      map: cloneTex(TEX.wallPanel, 40, 2), color: 0xd2d6d8,
      roughness: 0.56, metalness: 0.28, envMapIntensity: 0.8,
    });
    const winTex = canvasTexture(512, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#a2b5bd");
      g.addColorStop(0.45, "#73878f");
      g.addColorStop(1, "#3c4a52");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(216,228,234,0.30)";
      ctx.beginPath();
      ctx.moveTo(0, h * 0.12); ctx.lineTo(w * 0.44, 0); ctx.lineTo(w * 0.64, 0);
      ctx.lineTo(0, h * 0.56); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "rgba(206,220,228,0.14)";
      ctx.beginPath();
      ctx.moveTo(w * 0.56, 0); ctx.lineTo(w * 0.78, 0); ctx.lineTo(0, h);
      ctx.lineTo(0, h * 0.66); ctx.closePath(); ctx.fill();
      /* mullion frames + transom */
      ctx.fillStyle = "#384349";
      for (let i = 0; i <= 8; i++) ctx.fillRect((i * w) / 8 - 3, 0, 6, h);
      ctx.fillRect(0, 0, w, 9);
      ctx.fillRect(0, h - 9, w, 9);
      ctx.fillStyle = "rgba(56,67,73,0.9)";
      ctx.fillRect(0, h * 0.54 - 4, w, 8);
      ctx.fillStyle = "rgba(255,255,255,0.10)";
      ctx.fillRect(0, 9, w, 2);
    }, { repeatX: 9, repeatY: 1 });
    B.window = new T.MeshStandardMaterial({
      map: winTex, color: 0xc2d2da, roughness: 0.2, metalness: 0.3,
      envMapIntensity: 1.2, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.45,
    });
    B.steel = new T.MeshStandardMaterial({
      map: cloneTex(TEX.steel, 5, 2), color: 0x9ba2a7,
      roughness: 0.46, metalness: 0.34, envMapIntensity: 0.85,
    });
    B.roof = new T.MeshStandardMaterial({
      map: cloneTex(TEX.concrete, 9, 4), color: 0xa89f92,
      roughness: 0.84, metalness: 0.04, envMapIntensity: 0.4,
    });
    B.fence = new T.MeshStandardMaterial({
      map: cloneTex(TEX.meshFence, 2, 1), color: 0x707880,
      roughness: 0.6, metalness: 0.45, transparent: true, alphaTest: 0.32,
      side: T.DoubleSide, envMapIntensity: 0.6,
    });
    B.maroon = matStd(0x62352f, { roughness: 0.68, metalness: 0.22, envMapIntensity: 0.5 });
    /* true 45° hazard stripes — applied with metre-scaled UVs (never stretched) */
    const hazTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#c9a13a";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(26,27,29,0.92)";
      ctx.lineWidth = 26;
      for (let i = -h; i < w + h; i += 64) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + h, h);
        ctx.stroke();
      }
    });
    B.haz = new T.MeshStandardMaterial({ map: hazTex, roughness: 0.58, metalness: 0.12, envMapIntensity: 0.5 });
    B.signs = makeSignAtlas();
  }

  /* hazard plane with UVs scaled per metre so stripes never stretch */
  function hazPlane(g, w, h, x, y, z, rotY, rotX) {
    const m = plane(g, w, h, x, y, z, B.haz, { rotY: rotY, rotX: rotX });
    const uv = m.geometry.attributes.uv;
    const su = w / 0.9, sv = h / 0.9;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    uv.needsUpdate = true;
    m.castShadow = false;
    m.receiveShadow = false;
    return m;
  }

  /* ============================================================
     4 · FLOOR SLAB
     ============================================================ */
  function buildFloor(g) {
    /* structural slab: top at y = 0, cut edges visible */
    bx(g, 157.0, 0.7, 81.0, 0, -0.35, 0, MAT.slabSide, { cast: false, receive: true, name: "slab" });
    /* the painted hero surface */
    planeXZ(g, 156, 80, 0, 0.015, 0, B.floor, { receive: true, cast: false, name: "floor" });
    /* a soft dark reveal under the slab edge so it sits on the apron */
    bx(g, 158.0, 0.22, 82.0, 0, -0.78, 0, MAT.concreteDark, { cast: false, receive: false });
  }

  /* ============================================================
     5 · HALL SHELL — walls, structure, services, signage
     ============================================================ */
  function buildShell(g) {
    buildWalls(g);
    buildStructure(g);
    buildServices(g);
    buildWallSigns(g);
  }

  /* ---- full-height north + east walls, west cut wall, south parapet ---- */
  function buildWalls(g) {
    /* ---------------- north wall (z = -40), full 15.8 m ---------------- */
    const nz = HZ0 - WALL_T / 2;
    bx(g, 156.4, 8.5, WALL_T, 0, 4.25, nz, B.wallInner, {});
    bx(g, 156.4, 3.0, WALL_T + 0.06, 0, 10.0, nz, B.window, {});
    bx(g, 156.4, 4.3, WALL_T, 0, 13.65, nz, B.wallInner, {});
    plane(g, 156.4, 8.5, 0, 4.25, NORTH_FACE - 0.03, B.wallPanel, { rotY: PI });
    plane(g, 156.4, 4.3, 0, 13.65, NORTH_FACE - 0.03, B.wallPanel, { rotY: PI });
    bx(g, 156.9, 0.32, 1.02, 0, EAVE + 0.16, nz, B.steel, { cast: false });
    bxB(g, 156.4, 0.9, 0.28, 0, 0, HZ0 + 0.14, MAT.concreteDark, { cast: false });
    bxB(g, 156.4, 0.62, 0.22, 0, 0, NORTH_FACE - 0.11, MAT.concreteDark, { cast: false });
    /* window sill + head trims (interior) */
    bx(g, 156.4, 0.2, 0.22, 0, 8.38, HZ0 + 0.11, B.steel, { cast: false });
    bx(g, 156.4, 0.22, 0.26, 0, 11.62, HZ0 + 0.13, B.steel, { cast: false });
    /* interior girts */
    for (const y of [2.9, 5.6, 14.0]) bx(g, 156.4, 0.14, 0.18, 0, y, HZ0 + 0.08, B.steel, { cast: false });
    /* ribbon-window mullions every 3 m, divided by the structural grid */
    for (let x = -75; x <= 75; x += 3) {
      bx(g, 0.09, 3.1, 0.16, x, 10.0, HZ0 + 0.1, B.steel, { cast: false });
    }

    /* ---------------- east wall (x = 78), full height ---------------- */
    const ex = HX1 + WALL_T / 2;
    bx(g, WALL_T, 8.5, 80.4, ex, 4.25, 0, B.wallInner, {});
    bx(g, WALL_T + 0.06, 3.0, 80.4, ex, 10.0, 0, B.window, {});
    bx(g, WALL_T, 4.3, 80.4, ex, 13.65, 0, B.wallInner, {});
    plane(g, 80.4, 8.5, EAST_FACE + 0.03, 4.25, 0, B.wallPanel, { rotY: PI / 2 });
    plane(g, 80.4, 4.3, EAST_FACE + 0.03, 13.65, 0, B.wallPanel, { rotY: PI / 2 });
    bx(g, 1.02, 0.32, 80.6, ex, EAVE + 0.16, 0, B.steel, { cast: false });
    bxB(g, 0.28, 0.9, 80.4, HX1 - 0.14, 0, 0, MAT.concreteDark, { cast: false });
    bxB(g, 0.22, 0.62, 80.4, EAST_FACE + 0.11, 0, 0, MAT.concreteDark, { cast: false });
    bx(g, 0.22, 0.2, 80.4, HX1 - 0.11, 8.38, 0, B.steel, { cast: false });
    bx(g, 0.26, 0.22, 80.4, HX1 - 0.13, 11.62, 0, B.steel, { cast: false });
    for (const y of [2.9, 5.6, 14.0]) bx(g, 0.18, 0.14, 80.4, HX1 - 0.08, y, 0, B.steel, { cast: false });
    for (let z = -36; z <= 36; z += 3) {
      bx(g, 0.16, 3.1, 0.09, HX1 - 0.1, 10.0, z, B.steel, { cast: false });
    }

    /* ---------------- west wall (x = -78) CUT at 7.5 m ---------------- */
    const wz = HX0 + WALL_T / 2;
    bxB(g, WALL_T, 7.5, 80.4, wz, 0, 0, MAT.slabSide, {});
    bxB(g, 1.0, 0.62, 80.6, wz, 0, 0, MAT.concreteDark, { cast: false });
    plane(g, 80.4, 6.8, WEST_FACE - 0.03, 4.0, 0, B.wallPanel, { rotY: -PI / 2 });
    plane(g, 80.4, 7.5, HX0 + 0.02, 3.75, 0, B.wallInner, { rotY: PI / 2 });
    /* clean sectioned cap: concrete + steel edge flashing */
    bx(g, 0.98, 0.32, 80.6, -78.25, 7.66, 0, MAT.concreteDark, { cast: false });
    bx(g, 1.06, 0.09, 80.6, -78.25, 7.86, 0, MAT.galv, { cast: false });
    /* cut-edge reveal strip on the interior face */
    bx(g, 0.06, 0.16, 80.4, HX0 - 0.03, 7.42, 0, B.steel, { cast: false });
    /* exterior girts, downpipes and louvres so the facade reads from outside */
    for (const y of [1.75, 3.35, 4.95, 6.55]) {
      bx(g, 0.09, 0.14, 80.2, WEST_FACE - 0.1, y, 0, B.steel, { cast: false });
    }
    for (const z of [-36, -12, 12, 36]) {
      bx(g, 0.15, 7.2, 0.15, WEST_FACE - 0.12, 3.6, z, MAT.galv, { cast: false });
      bx(g, 0.34, 0.16, 0.34, WEST_FACE - 0.16, 0.08, z, MAT.galv, { cast: false });
    }
    for (const z of [-30, 5, 30]) {
      bx(g, 0.14, 1.1, 1.7, WEST_FACE - 0.12, 6.2, z, MAT.machineDark, { cast: false });
      for (let k = 0; k < 4; k++) {
        bx(g, 0.18, 0.06, 1.5, WEST_FACE - 0.14, 5.85 + k * 0.22, z, MAT.galv, { cast: false });
      }
    }
    /* big building id on the west facade, clear of the canopies */
    signQuad(g, 0, 5.4, 2.7, WEST_FACE - 0.07, 5.95, -33.5, -PI / 2);

    /* ---------------- south slab edge: low parapet + flashing ---------------- */
    bxB(g, 157.0, 1.06, 0.36, 0, 0, HZ1 + 0.24, MAT.slabSide, {});
    bx(g, 157.2, 0.08, 0.48, 0, 1.10, HZ1 + 0.24, MAT.galv, { cast: false });
    bx(g, 157.0, 0.16, 0.08, 0, 0.98, HZ1 + 0.04, B.steel, { cast: false });
    /* hazard strip on the outside face of the parapet */
    for (let x = -72; x <= 72; x += 24) hazPlane(g, 3.4, 0.34, x, 0.62, HZ1 + 0.42, 0);
  }

  /* ---- steel columns, transverse trusses, purlins, skylight frames ---- */
  function buildStructure(g) {
    /* H-section column */
    const web = new T.BoxGeometry(0.10, TY, 0.26); web.translate(0, TY / 2, 0);
    const f1 = new T.BoxGeometry(0.30, TY, 0.045); f1.translate(0, TY / 2, 0.145);
    const f2 = new T.BoxGeometry(0.30, TY, 0.045); f2.translate(0, TY / 2, -0.145);
    const colGeo = mergeGeoms([web, f1, f2]);
    web.dispose(); f1.dispose(); f2.dispose();

    const items = [];
    for (let x = -72; x <= 72; x += GRID) {
      items.push({ x: x, y: 0, z: HZ0 + 0.15 });
      items.push({ x: x, y: 0, z: HZ1 - 0.15 });
    }
    for (let z = -36; z <= 36; z += GRID) items.push({ x: HX1 - 0.15, y: 0, z: z, ry: PI / 2 });
    addInstanced(g, colGeo, B.steel, items, { cast: true, receive: true });

    /* base plates + top gussets */
    for (const it of items) {
      bx(g, 0.74, 0.07, 0.74, it.x, 0.035, it.z, B.steel, { cast: false });
      bx(g, 0.5, 0.42, 0.5, it.x, TY - 0.21, it.z, B.steel, { cast: false });
    }

    /* ---- Z01 high-bay bay (x <= -50): open to the sky above 13.5 m.
       The AS/RS racks reach ~19.8 m with crane masts to ~22.3 m, so the
       three western truss lines are omitted; their wall columns are carried
       up to the 15.8 m eave as plain posts instead. ---- */
    for (const x of [-72, -60, -48]) {
      for (const z of [HZ0 + 0.15, HZ1 - 0.15]) {
        bx(g, 0.3, EAVE - TY, 0.3, x, TY + (EAVE - TY) / 2, z, B.steel);
        bx(g, 0.54, 0.12, 0.54, x, EAVE + 0.06, z, B.steel, { cast: false });
      }
    }

    /* ---- transverse roof trusses, one per 12 m column line (Z01 bay open) ---- */
    const tz0 = HZ0 + 0.15, tz1 = HZ1 - 0.15;
    const n = 8, dz = (tz1 - tz0) / n, H = 1.5;
    for (let xi = -72; xi <= 72; xi += GRID) {
      if (xi <= -48) continue; /* open high-bay bay over Z01 */
      /* bottom + top chords */
      bx(g, 0.22, 0.2, tz1 - tz0, xi, TY, (tz0 + tz1) / 2, B.steel);
      bx(g, 0.22, 0.2, tz1 - tz0, xi, TY + H, (tz0 + tz1) / 2, B.steel);
      for (let i = 0; i <= n; i++) {
        const zz = tz0 + i * dz;
        bx(g, 0.14, H, 0.14, xi, TY + H / 2, zz, B.steel);
      }
      const len = Math.hypot(dz, H), ang = Math.atan2(H, dz);
      for (let i = 0; i < n; i++) {
        const zz = tz0 + (i + 0.5) * dz;
        bx(g, 0.11, 0.11, len, xi, TY + H / 2, zz, B.steel, { rotX: i % 2 === 0 ? -ang : ang });
      }
    }
    /* longitudinal top ties: wall lines stay, centre tie resumes east of Z01 */
    for (const zz of [tz0, tz1]) bx(g, 156.4, 0.2, 0.2, 0, TY + H + 0.22, zz, B.steel);
    bx(g, 124, 0.2, 0.2, 16, TY + H + 0.22, 0, B.steel);
    /* eave angle members along both long walls */
    bx(g, 156.4, 0.16, 0.16, 0, TY - 0.5, HZ0 + 0.3, B.steel, { cast: false });
    bx(g, 156.4, 0.16, 0.16, 0, TY - 0.5, HZ1 - 0.3, B.steel, { cast: false });

    /* ---- purlins + skylight ribbon frame over the press bay (Z02) only ---- */
    for (let zz = -36; zz <= 36; zz += GRID) {
      bx(g, 24, 0.14, 0.18, -24, TY + H + 0.17, zz, B.steel, { cast: false });
    }
    for (const sx of [-30]) {
      bx(g, 0.16, 0.2, 64, sx - 1.3, TY + H + 0.34, 0, B.steel, { cast: false });
      bx(g, 0.16, 0.2, 64, sx + 1.3, TY + H + 0.34, 0, B.steel, { cast: false });
      for (let zz = -28; zz <= 28; zz += 8) {
        bx(g, 2.76, 0.1, 0.14, sx, TY + H + 0.34, zz, B.steel, { cast: false });
      }
    }
  }

  /* ---- hanging services: sprinkler mains, cable trays, LED high-bays ---- */
  const HIGHBAY = [
    [22, 12], [36, 12], [50, 12], [58, 12],
    [22, 28], [36, 28], [50, 28], [58, 28],
    [-4, -12], [4, -24], [-30, 14], [-40, 26], [-34, -20], [66, 12],
  ];

  function buildServices(g) {
    /* Roof-hung services stop east of the Z01 high-bay bay (racks reach 19.8 m);
       nothing below ~23.5 m is allowed over x < -50. */
    /* sprinkler mains along the truss bottom chords */
    tubeX(g, 0.16, 120, 14, TY - 0.46, -20, MAT.orangeDeep, { cast: false });
    tubeX(g, 0.16, 120, 14, TY - 0.46, 20, MAT.orangeDeep, { cast: false });
    tubeX(g, 0.1, 120, 14, TY - 0.72, -20, MAT.galv, { cast: false });
    for (let x = -40; x <= 60; x += 20) {
      tubeZ(g, 0.07, 76, x, TY - 0.38, 0, MAT.orangeDeep, { cast: false });
      lineBetween(g, [x, TY - 0.30, -20], [x, TY, -20], 0.022, B.steel);
      lineBetween(g, [x, TY - 0.30, 20], [x, TY, 20], 0.022, B.steel);
    }
    for (let x = -42; x <= 66; x += 12) {
      lineBetween(g, [x, TY - 0.30, -20], [x, TY, -20], 0.02, B.steel);
      lineBetween(g, [x, TY - 0.30, 20], [x, TY, 20], 0.02, B.steel);
    }

    /* cable trays + conduits above the AGV spine (well above 6 m) */
    for (const zz of [-2.4, 2.4]) {
      bx(g, 120, 0.05, 0.62, 14, 11.92, zz, MAT.galv, { cast: false });
      bx(g, 120, 0.17, 0.05, 14, 11.99, zz - 0.31, MAT.galv, { cast: false });
      bx(g, 120, 0.17, 0.05, 14, 11.99, zz + 0.31, MAT.galv, { cast: false });
      for (let x = -42; x <= 66; x += 12) {
        lineBetween(g, [x, 12.0, zz], [x, TY, zz], 0.02, B.steel);
      }
    }
    tubeX(g, 0.055, 120, 14, 12.28, -1.1, MAT.galv, { cast: false });
    tubeX(g, 0.055, 120, 14, 12.38, 1.1, MAT.galv, { cast: false });

    /* 14 linear LED high-bays over press / weld / paint / assembly / EOL */
    let li = 0;
    for (const p of HIGHBAY) {
      const [x, z] = p;
      bx(g, 2.6, 0.14, 0.34, x, 11.62, z, B.steel, { cast: false });
      bx(g, 2.3, 0.05, 0.24, x, 11.52, z, MAT.ledWarm, { cast: false });
      lineBetween(g, [x - 0.95, 11.69, z], [x - 0.95, TY, z], 0.018, B.steel);
      lineBetween(g, [x + 0.95, 11.69, z], [x + 0.95, TY, z], 0.018, B.steel);
      /* soft pooled glow on 3 of them only (sprite draw-call budget) */
      if (li === 0 || li === 5 || li === 11) {
        const sp = glowSprite(g, 0xffd9a2, 9, 0.0, TEX.glowTight);
        sp.position.set(x, 11.3, z);
        PULSES.push({ s: sp, base: 0.34, amp: 0.06, ph: li * 1.7, f: 0.9 });
      }
      li++;
    }

    /* wall-mounted cabinets / hose reels on the north wall */
    for (const x of [-58, -26, 12, 52]) {
      bx(g, 1.6, 2.0, 0.34, x, 1.7, HZ0 + 0.19, MAT.machineGrey, { cast: false });
      bx(g, 0.4, 0.08, 0.05, x - 0.5, 1.5, HZ0 + 0.37, MAT.ledGreen, { cast: false });
    }
    for (const x of [-44, 30, 66]) {
      bx(g, 0.5, 0.8, 0.32, x, 1.5, HZ0 + 0.18, MAT.orangeDeep, { cast: false });
    }
  }

  /* ---- signage on the inner faces ---- */
  function buildWallSigns(g) {
    const nz = HZ0 + 0.26; /* mounted clear of the interior girts */
    /* hero board above the window band */
    signQuad(g, 0, 8.4, 4.2, -2, 13.55, nz, 0);
    /* digital-twin banner balancing it on the right */
    signQuad(g, 15, 8.4, 4.2, 44, 13.55, nz, 0);
    /* safety + zone boards between girts */
    signQuad(g, 1, 5.0, 2.5, -50, 6.6, nz, 0);
    signQuad(g, 1, 4.4, 2.2, -66, 6.6, nz, 0);
    signQuad(g, 3, 4.2, 2.1, -38, 6.5, nz, 0);
    signQuad(g, 4, 4.2, 2.1, -24, 6.5, nz, 0);
    signQuad(g, 5, 4.2, 2.1, -4, 6.5, nz, 0);
    signQuad(g, 6, 4.2, 2.1, 26, 6.6, nz, 0);
    signQuad(g, 7, 4.2, 2.1, 70, 6.6, nz, 0);
    signQuad(g, 8, 3.2, 1.6, -32, 5.6, nz, 0);
    signQuad(g, 15, 4.4, 2.2, 8, 6.6, nz, 0);
    signQuad(g, 2, 2.8, 1.4, 75.0, 3.1, HZ0 + 0.06, 0);
    /* east wall interior boards */
    signQuad(g, 10, 5.2, 2.6, HX1 - 0.08, 6.6, 20, -PI / 2);
    signQuad(g, 2, 2.8, 1.4, HX1 - 0.06, 3.2, 4, -PI / 2);
    /* west wall exterior: inbound boards above each canopy + big one */
    for (const d of AX.inboundDocks) {
      signQuad(g, 9, 3.0, 1.5, WEST_FACE - 0.06, 6.65, d.z, -PI / 2);
    }
    signQuad(g, 9, 6.2, 3.1, WEST_FACE - 0.06, 5.15, -10, -PI / 2);
    /* east wall exterior outbound board */
    signQuad(g, 10, 6.0, 3.0, EAST_FACE + 0.06, 7.2, 20, PI / 2);
  }

  /* ============================================================
     6 · Z07 SUPPORT ROOMS — control room / LV room / maintenance
     ============================================================ */
  const RX0 = 18.4, RX1 = 61.2;      /* block extents in x */
  const RZ0 = -39.55, RZ1 = -24.9;   /* block extents in z */
  const RY = 4.2;                    /* eave height of the block */
  const RF = 0.14;                   /* raised interior floor */
  const SILL = 1.1;                  /* control room glass sill */
  const GTOP = 3.5;                  /* control room glass head */

  function buildRooms(g) {
    const cx = (RX0 + RX1) / 2, cz = (RZ0 + RZ1) / 2;
    const W = RX1 - RX0, D = RZ1 - RZ0;

    /* ---- raised floor slab (whole block) ---- */
    bxB(g, W, RF, D, cx, 0, cz, MAT.concreteDark, { receive: true });
    bx(g, W + 0.14, 0.05, D + 0.14, cx, RF - 0.02, cz, MAT.concreteDark, { cast: false });

    /* ---- outer shell: back / side walls + partitions ---- */
    bx(g, W, RY, 0.14, cx, RY / 2, RZ0 + 0.07, MAT.wallInner, {});
    bx(g, 0.14, RY, D, RX0 + 0.07, RY / 2, cz, MAT.wallInner, {});
    bx(g, 0.14, RY, D, RX1 - 0.07, RY / 2, cz, MAT.wallInner, {});
    bx(g, 0.12, RY, D, 39.0, RY / 2, cz, MAT.wallInner, {});
    bx(g, 0.12, RY, D, 52.2, RY / 2, cz, MAT.wallInner, {});

    /* ---- control room front: sill + header + glazing ---- */
    const CF = RZ1 + 0.07; /* front wall centre */
    bx(g, 2.2, RY, 0.16, 19.5, RY / 2, CF, MAT.wallInner, {});       /* west pier 18.4..20.6 */
    bx(g, 2.4, RY, 0.16, 37.8, RY / 2, CF, MAT.wallInner, {});       /* east pier 36.6..39.0 */
    bx(g, 15.9, SILL, 0.16, 28.6, SILL / 2, CF, MAT.wallInner, {});
    bx(g, 15.9, RY - GTOP, 0.16, 28.6, (RY + GTOP) / 2, CF, MAT.wallInner, {});
    /* glazing */
    plane(g, 15.85, GTOP - SILL, 28.6, (GTOP + SILL) / 2, CF + 0.09, MAT.glassClear, { rotY: 0 });
    /* white mullions + rails */
    for (let i = 0; i <= 6; i++) {
      bx(g, 0.09, GTOP - SILL, 0.14, 20.63 + i * 2.658, (GTOP + SILL) / 2, CF + 0.11, MAT.machineWhite, { cast: false });
    }
    bx(g, 15.9, 0.1, 0.16, 28.6, GTOP, CF + 0.11, MAT.machineWhite, { cast: false });
    bx(g, 15.9, 0.1, 0.16, 28.6, SILL, CF + 0.11, MAT.machineWhite, { cast: false });
    /* sliding glass door (slightly open) at the east end */
    bx(g, 0.09, 2.3, 0.15, 35.85, 1.15, CF + 0.2, MAT.machineWhite, { cast: false });
    bx(g, 1.15, 2.25, 0.05, 35.25, 1.15, CF + 0.16, MAT.glassDark, { cast: false });
    bx(g, 0.05, 0.5, 0.05, 34.75, 1.1, CF + 0.24, MAT.galv, { cast: false });
    /* low step + hazard nose at the door */
    bx(g, 1.6, 0.05, 0.5, 35.3, RF + 0.02, CF + 0.35, MAT.yellow, { cast: false });

    /* ---- electrical room front: window band + door ---- */
    bx(g, 1.2, RY, 0.16, 39.6, RY / 2, CF, MAT.wallInner, {});
    bx(g, 1.8, RY, 0.16, 41.1, RY / 2, CF, MAT.wallInner, {});
    bx(g, 0.9, RY, 0.16, 51.75, RY / 2, CF, MAT.wallInner, {});
    bx(g, 8.0, 1.7, 0.16, 46.0, 0.85, CF, MAT.wallInner, {});
    bx(g, 8.0, RY - 3.1, 0.16, 46.0, (RY + 3.1) / 2, CF, MAT.wallInner, {});
    plane(g, 7.9, 1.4, 46.0, 2.4, CF + 0.09, MAT.glassClear, { rotY: 0 });
    for (let i = 0; i <= 4; i++) {
      bx(g, 0.07, 1.4, 0.13, 42.05 + i * 1.975, 2.4, CF + 0.1, MAT.machineGrey, { cast: false });
    }
    /* steel door */
    bx(g, 1.22, 2.22, 0.1, 42.3, 1.11, CF + 0.03, MAT.galv, { cast: false });
    bx(g, 0.06, 0.24, 0.13, 41.85, 1.1, CF + 0.08, MAT.galv, { cast: false });
    bx(g, 0.5, 0.34, 0.03, 42.3, 2.36, CF + 0.1, MAT.ledGreen, { cast: false });

    /* ---- maintenance crib: open front with two posts ---- */
    bx(g, 0.22, RY, 0.22, 52.45, RY / 2, CF, B.steel, { cast: false });
    bx(g, 0.22, RY, 0.22, 60.95, RY / 2, CF, B.steel, { cast: false });
    bx(g, 8.3, 0.24, 0.2, 56.7, RY - 0.12, CF, MAT.machineGrey, { cast: false });

    /* ---- roof slab + parapet + rooftop plant ---- */
    bx(g, W + 0.5, 0.26, D + 0.45, cx, RY + 0.13, cz, B.roof, { cast: true, receive: true });
    bx(g, W + 0.5, 0.26, 0.14, cx, RY + 0.39, RZ1 + 0.14, MAT.machineGrey, { cast: false });
    bx(g, W + 0.5, 0.26, 0.14, cx, RY + 0.39, RZ0 - 0.12, MAT.machineGrey, { cast: false });
    bx(g, 0.14, 0.26, D + 0.45, RX0 - 0.18, RY + 0.39, cz, MAT.machineGrey, { cast: false });
    bx(g, 0.14, 0.26, D + 0.45, RX1 + 0.18, RY + 0.39, cz, MAT.machineGrey, { cast: false });
    /* dark fascia band + white soffit light strip along the front edge */
    bx(g, W + 0.7, 0.44, 0.18, cx, RY - 0.24, RZ1 + 0.22, MAT.machineDark, { cast: false });
    bx(g, W - 0.6, 0.06, 0.1, cx, RY - 0.06, RZ1 + 0.3, MAT.ledWhite, { cast: false });
    /* amber accent line under the fascia */
    bx(g, W + 0.1, 0.05, 0.05, cx, RY - 0.48, RZ1 + 0.31, MAT.ledAmber, { cast: false });
    /* rooftop HVAC units */
    for (const p of [[26.5, -33.0], [46.5, -30.8]]) {
      const hx = p[0], hz = p[1];
      bx(g, 3.2, 1.05, 2.0, hx, RY + 0.78, hz, MAT.machineGrey, {});
      bx(g, 3.3, 0.08, 2.1, hx, RY + 1.34, hz, MAT.machineDark, { cast: false });
      cylB(g, 0.62, 0.62, 0.1, 16, hx - 0.7, RY + 1.38, hz, MAT.machineDark, { cast: false });
      cylB(g, 0.62, 0.62, 0.1, 16, hx + 0.7, RY + 1.38, hz, MAT.machineDark, { cast: false });
      bx(g, 0.8, 0.5, 0.7, hx + 1.1, RY + 0.55, hz, MAT.galv, { cast: false });
    }
    bx(g, 2.4, 0.55, 0.7, 35.5, RY + 0.5, -36.5, MAT.galv, { cast: false });
    cylB(g, 0.28, 0.28, 1.6, 10, 55.0, RY + 0.45, -37.2, MAT.galv, { cast: false });

    /* room-block front articulation: plinth, lamps, downpipes */
    bx(g, W + 0.2, 0.38, 0.22, cx, 0.19, RZ1 + 0.16, MAT.machineDark, { cast: false });
    for (const x of [21.5, 27.5, 33.5, 50.0, 55.0, 59.5]) {
      bx(g, 0.44, 0.16, 0.16, x, RY - 0.62, RZ1 + 0.3, MAT.ledWarm, { cast: false });
    }
    for (const x of [19.0, 39.35, 52.55, 60.6]) {
      bx(g, 0.16, RY, 0.16, x, RY / 2, RZ1 + 0.14, MAT.galv, { cast: false });
    }

    /* contact shadow / AO at the front edge of the block */
    contactShadow(g, 45, 5.6, cx, RZ1 + 2.6, 0.34);

    /* ---------------- CONTROL ROOM interior ---------------- */
    const ccx = 28.7, czz = -32.0;
    planeXZ(g, 20.3, 14.3, ccx, RF + 0.012, czz, MAT.apron, { receive: true });
    /* video wall on the back wall */
    bx(g, 7.0, 2.55, 0.1, ccx, 2.62, RZ0 + 0.22, MAT.machineDark, { cast: false });
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 2; r++) {
        const sm = (c + r) % 2 ? MAT.screenAmber : MAT.screen;
        plane(g, 1.98, 1.06, ccx - 2.2 + c * 2.2, 3.18 - r * 1.16, RZ0 + 0.29, sm, {});
      }
    }
    /* consoles facing the video wall */
    for (let i = 0; i < 3; i++) {
      const x = 24.4 + i * 4.3;
      bx(g, 2.9, 0.72, 0.86, x, RF + 0.4, -31.2, MAT.machineGrey, {});
      bx(g, 3.05, 0.09, 0.96, x, RF + 0.82, -31.25, MAT.machineWhite, { cast: false });
      bx(g, 0.5, 0.035, 0.17, x, RF + 0.88, -30.95, MAT.machineDark, { cast: false });
      for (let k = 0; k < 2; k++) {
        const sm = k === 0 ? MAT.screen : MAT.screenAmber;
        plane(g, 0.82, 0.5, x - 0.55 + k * 1.12, RF + 1.13, -31.55, sm, { rotX: -0.22 });
      }
    }
    /* operator chairs */
    for (let i = 0; i < 3; i++) {
      const x = 24.4 + i * 4.3;
      bx(g, 0.48, 0.07, 0.46, x, RF + 0.47, -30.2, MAT.machineDark, { cast: false });
      bx(g, 0.46, 0.52, 0.07, x, RF + 0.78, -29.98, MAT.machineDark, { cast: false, rotX: 0.12 });
      cylB(g, 0.05, 0.05, 0.34, 8, x, RF + 0.11, -30.2, B.steel, { cast: false });
      bx(g, 0.52, 0.04, 0.52, x, RF + 0.09, -30.2, MAT.machineDark, { cast: false });
    }
    /* server rack + wall monitor */
    bx(g, 0.82, 2.0, 0.8, 37.2, RF + 1.0, -37.6, MAT.machineDark, {});
    for (let i = 0; i < 5; i++) bx(g, 0.06, 0.05, 0.02, 37.2, RF + 0.5 + i * 0.3, -37.19, i % 2 ? MAT.ledGreen : MAT.ledAmber, { cast: false });
    plane(g, 1.5, 0.85, 37.6, 2.5, -31.9, MAT.screen, { rotY: -PI / 2 });
    /* ceiling light strips */
    for (const zz of [-30.2, -35.0]) bx(g, 14.0, 0.05, 0.16, ccx, RY - 0.07, zz, MAT.ledWhite, { cast: false });
    /* sign above the glass door */
    signQuad(g, 13, 1.7, 0.85, 29.6, 3.82, RZ1 + 0.17, 0);

    /* ---------------- LV ROOM interior ---------------- */
    planeXZ(g, 12.6, 14.3, 45.6, RF + 0.012, czz, MAT.apron, { receive: true });
    for (let i = 0; i < 8; i++) {
      const x = 40.2 + i * 1.2;
      bx(g, 1.04, 2.2, 0.66, x, RF + 1.15, -38.55, MAT.machineGrey, {});
      bx(g, 0.86, 0.02, 0.03, x, RF + 1.35, -38.2, MAT.machineDark, { cast: false });
      bx(g, 0.86, 0.02, 0.03, x, RF + 0.85, -38.2, MAT.machineDark, { cast: false });
      bx(g, 0.07, 0.07, 0.02, x + 0.38, RF + 2.0, -38.2, MAT.ledGreen, { cast: false });
    }
    bx(g, 11.0, 0.06, 0.45, 45.6, 3.55, -38.6, MAT.galv, { cast: false });
    hazPlane(g, 1.3, 0.6, 42.3, RF + 0.03, CF - 0.35, 0, -PI / 2);
    bx(g, 8.0, 0.05, 0.16, 45.6, RY - 0.07, -33.0, MAT.ledWhite, { cast: false });
    bx(g, 8.0, 0.05, 0.16, 45.6, RY - 0.07, -37.3, MAT.ledWhite, { cast: false });
    /* transformer / LV warning boards */
    signQuad(g, 11, 2.2, 1.1, 46.0, 3.62, RZ1 + 0.17, 0);
    signQuad(g, 11, 1.6, 0.8, 39.1, 2.6, -33.0, PI / 2);

    /* ---------------- MAINTENANCE CRIB interior ---------------- */
    planeXZ(g, 8.7, 14.3, 56.7, RF + 0.012, czz, MAT.apron, { receive: true });
    /* workbench + pegboard */
    bx(g, 4.2, 0.92, 0.92, 56.2, RF + 0.48, -38.8, MAT.machineGrey, {});
    bx(g, 4.4, 0.07, 1.0, 56.2, RF + 0.96, -38.78, MAT.machineWhite, { cast: false });
    bx(g, 3.8, 1.2, 0.05, 56.2, 2.3, RZ0 + 0.2, MAT.machineDark, { cast: false });
    for (let i = 0; i < 9; i++) {
      bx(g, 0.07, rr(0.18, 0.34), 0.04, 54.5 + i * 0.42, 2.3, RZ0 + 0.25, MAT.galv, { cast: false });
    }
    bx(g, 0.5, 0.08, 0.3, 55.0, RF + 1.04, -38.7, MAT.machineDark, { cast: false });
    bx(g, 0.24, 0.18, 0.3, 57.4, RF + 1.05, -38.7, MAT.yellow, { cast: false });
    /* tool cabinets + drawers */
    for (const p of [[53.2, -38.75], [58.4, -38.75]]) {
      bx(g, 1.0, 1.42, 0.62, p[0], RF + 0.71, p[1], MAT.machineGrey, {});
      for (let d = 0; d < 3; d++) bx(g, 0.92, 0.26, 0.03, p[0], RF + 0.36 + d * 0.4, p[1] + 0.33, MAT.orange, { cast: false });
    }
    /* shelving rack with cardboard boxes */
    for (const dz of [-0.3, 0.3]) {
      for (const dx of [-1.1, 1.1]) bx(g, 0.06, 2.2, 0.06, 58.6 + dx, RF + 1.1, -35.6 + dz, MAT.galv, { cast: false });
    }
    for (let s = 0; s < 3; s++) {
      bx(g, 2.3, 0.06, 0.66, 58.6, RF + 0.6 + s * 0.72, -35.6, MAT.galv, { cast: false });
      bx(g, 0.7, 0.36, 0.42, 57.8, RF + 0.82 + s * 0.72, -35.6, MAT.cardboard, {});
      bx(g, 0.5, 0.28, 0.38, 58.9, RF + 0.78 + s * 0.72, -35.6, MAT.cardboard, {});
    }
    /* pallet + parts */
    bx(g, 1.2, 0.14, 0.8, 54.2, RF + 0.07, -35.2, MAT.cardboard, {});
    bx(g, 0.9, 0.5, 0.7, 54.2, RF + 0.4, -35.2, MAT.cardboard, {});
    bx(g, 1.5, 0.05, 0.16, 56.7, RY - 0.07, -33.0, MAT.ledWhite, { cast: false });
    signQuad(g, 12, 2.2, 1.1, 56.7, 3.7, RZ1 + 0.17, 0);

    /* perimeter blocking bollards in front of the crib */
    for (const x of [53.0, 55.6, 58.2]) {
      cylB(g, 0.1, 0.1, 0.9, 10, x, 0, RZ1 + 0.9, MAT.yellow, { cast: false });
    }
  }

  /* ============================================================
     7 · EXTERIOR — apron, docks, driveways, fence, site context
     ============================================================ */
  const FY = -0.15;   /* apron / yard level */

  function buildExterior(g) {
    buildApron(g);
    buildWestDocks(g);
    buildEastDocks(g);
    buildSiteContext(g);
    buildFenceAndGates(g);
    buildSiteFurniture(g);
  }

  /* ---- apron slab + asphalt driveways + painted truck lanes ---- */
  function buildApron(g) {
    bx(g, 230, 0.25, 130, 0, FY - 0.125, 0, B.apron, { cast: false, receive: true, name: "apron" });
    /* inbound (west) + outbound (east) driveways */
    const iwd = AX.inboundDriveway, owd = AX.outboundDriveway;
    planeXZ(g, iwd.x1 - iwd.x0, iwd.z1 - iwd.z0, (iwd.x0 + iwd.x1) / 2, FY + 0.022, (iwd.z0 + iwd.z1) / 2, MAT.asphalt, { receive: true });
    planeXZ(g, owd.x1 - owd.x0, owd.z1 - owd.z0, (owd.x0 + owd.x1) / 2, FY + 0.022, (owd.z0 + owd.z1) / 2, MAT.asphalt, { receive: true });
    /* service road along the south fence line */
    planeXZ(g, 218, 4.2, 0, FY + 0.02, 54, MAT.asphalt, { receive: true });
    /* painted truck lanes on the west driveway */
    for (const z of [-18, -9, 9, 18]) {
      for (let i = 0; i < 6; i++) {
        planeXZ(g, 0.14, 2.4, -101 + i * 4.2, FY + 0.032, z, MAT.machineWhite, { receive: false });
      }
    }
    planeXZ(g, 0.16, 53, -91, FY + 0.032, 0, MAT.yellow, { receive: false });
    /* painted lanes on the east driveway */
    for (const z of [8, 20, 32]) planeXZ(g, 24, 0.16, 91, FY + 0.032, z, MAT.machineWhite, { receive: false });
    /* south road dashes */
    for (let x = -100; x <= 100; x += 8) planeXZ(g, 3.2, 0.14, x, FY + 0.032, 54, MAT.yellow, { receive: false });
    /* apron edge kerb along the south of the hall */
    bx(g, 160, 0.18, 0.3, 0, FY + 0.09, HZ1 + 1.2, MAT.concreteDark, { cast: false, receive: false });
    /* painted no-park hatch bands beside the docks */
    for (const d of AX.inboundDocks) {
      for (let i = 0; i < 4; i++) planeXZ(g, 0.18, 2.0, -82.6 + i * 1.1, FY + 0.033, d.z, MAT.machineWhite, { receive: false });
    }
  }

  /* ---- three west inbound docks: roller doors, seals, canopies, ramps ---- */
  function buildWestDocks(g) {
    for (let i = 0; i < AX.inboundDocks.length; i++) {
      const z = AX.inboundDocks[i].z;
      /* concrete dock platform */
      bxB(g, 3.1, 0.6, 8.8, WEST_FACE - 1.55, FY, z, B.apron, {});
      /* hazard stripe on the outer face */
      hazPlane(g, 8.6, 0.5, WEST_FACE - 3.12, 0.11, z, -PI / 2);
      /* steel leveler plate in the door mouth */
      bx(g, 1.8, 0.06, 2.9, WEST_FACE - 1.0, 0.48, z, MAT.galv, { cast: false });
      /* roller door: dark recess + ribbed steel slats */
      bx(g, 0.1, DOOR_H, DOOR_W - 0.1, WEST_FACE - 0.03, 0.45 + DOOR_H / 2, z, MAT.machineDark, { cast: false });
      for (let k = 0; k < 9; k++) {
        bx(g, 0.13, 0.42, DOOR_W - 0.16, WEST_FACE - 0.09, 0.66 + k * 0.47, z, MAT.galv, { cast: false });
      }
      /* door frame */
      bx(g, 0.24, DOOR_H + 0.8, 0.2, WEST_FACE - 0.14, 0.45 + (DOOR_H + 0.8) / 2, z - DOOR_W / 2 - 0.17, B.steel, {});
      bx(g, 0.24, DOOR_H + 0.8, 0.2, WEST_FACE - 0.14, 0.45 + (DOOR_H + 0.8) / 2, z + DOOR_W / 2 + 0.17, B.steel, {});
      bx(g, 0.24, 0.3, DOOR_W + 0.74, WEST_FACE - 0.14, 0.45 + DOOR_H + 0.33, z, B.steel, {});
      /* rubber dock seals */
      bx(g, 0.36, DOOR_H + 0.2, 0.32, WEST_FACE - 0.36, 0.45 + DOOR_H / 2 + 0.05, z - DOOR_W / 2 - 0.36, MAT.rubber, { cast: false });
      bx(g, 0.36, DOOR_H + 0.2, 0.32, WEST_FACE - 0.36, 0.45 + DOOR_H / 2 + 0.05, z + DOOR_W / 2 + 0.36, MAT.rubber, { cast: false });
      bx(g, 0.36, 0.32, DOOR_W + 1.04, WEST_FACE - 0.36, 0.45 + DOOR_H + 0.48, z, MAT.rubber, { cast: false });
      /* rubber bumpers */
      bx(g, 0.38, 0.64, 0.44, WEST_FACE - 0.52, 0.94, z - 2.05, MAT.rubber, { cast: false });
      bx(g, 0.38, 0.64, 0.44, WEST_FACE - 0.52, 0.94, z + 2.05, MAT.rubber, { cast: false });
      /* cantilever canopy + tie rods */
      bx(g, 6.4, 0.15, 6.4, WEST_FACE - 2.95, 5.5, z, MAT.galv, { rotZ: 0.05 });
      bx(g, 0.16, 0.42, 6.4, WEST_FACE - 6.14, 5.3, z, B.steel, { rotZ: 0.05 });
      lineBetween(g, [WEST_FACE - 5.85, 5.28, z - 2.55], [WEST_FACE - 0.1, 7.0, z - 2.55], 0.035, MAT.galv);
      lineBetween(g, [WEST_FACE - 5.85, 5.28, z + 2.55], [WEST_FACE - 0.1, 7.0, z + 2.55], 0.035, MAT.galv);
      /* canopy downlight */
      bx(g, 1.7, 0.12, 0.36, WEST_FACE - 1.4, 5.28, z, MAT.ledWarm, { cast: false });
      /* wheel stops on the driveway */
      bxB(g, 1.9, 0.17, 0.32, WEST_FACE - 4.7, FY, z - 2.5, MAT.yellow, { cast: false });
      bxB(g, 1.9, 0.17, 0.32, WEST_FACE - 4.7, FY, z + 2.5, MAT.yellow, { cast: false });
      /* bollards flanking the ramp */
      cylB(g, 0.13, 0.15, 1.05, 10, WEST_FACE - 3.35, FY, z - 4.6, MAT.yellow, { cast: false });
      cylB(g, 0.13, 0.15, 1.05, 10, WEST_FACE - 3.35, FY, z + 4.6, MAT.yellow, { cast: false });
    }
    /* west wall man doors between the dock doors */
    for (const z of [-31.5, 31.5]) {
      bx(g, 0.12, 2.25, 1.15, WEST_FACE - 0.05, 1.28, z, MAT.galv, { cast: false });
      bx(g, 0.16, 2.45, 1.35, WEST_FACE - 0.02, 1.36, z, B.steel, { cast: false });
      bx(g, 0.1, 0.14, 0.5, WEST_FACE - 0.2, 2.5, z, MAT.ledWarm, { cast: false });
      bxB(g, 1.3, 0.14, 1.5, WEST_FACE - 0.4, 0.0, z, MAT.concreteDark, { cast: false });
    }
  }

  /* ---- east outbound dispatch doors + canopies ---- */
  function buildEastDocks(g) {
    for (const d of AX.outboundDocks) {
      const z = d.z;
      /* interior roller door */
      bx(g, 0.12, 5.4, 5.0, HX1 - 0.06, 2.7, z, MAT.machineDark, { cast: false });
      for (let k = 0; k < 10; k++) {
        bx(g, 0.14, 0.48, 4.9, HX1 - 0.12, 0.75 + k * 0.5, z, MAT.galv, { cast: false });
      }
      bx(g, 0.26, 5.7, 0.22, HX1 - 0.15, 2.85, z - 2.6, B.steel, {});
      bx(g, 0.26, 5.7, 0.22, HX1 - 0.15, 2.85, z + 2.6, B.steel, {});
      bx(g, 0.26, 0.34, 5.44, HX1 - 0.15, 5.62, z, B.steel, {});
      bx(g, 0.3, 0.62, 0.42, HX1 - 0.26, 0.95, z - 1.9, MAT.rubber, { cast: false });
      bx(g, 0.3, 0.62, 0.42, HX1 - 0.26, 0.95, z + 1.9, MAT.rubber, { cast: false });
      bx(g, 1.7, 0.12, 0.36, HX1 - 0.7, 6.0, z, MAT.ledWarm, { cast: false });
      /* exterior platform + canopy */
      bxB(g, 3.0, 0.6, 8.0, EAST_FACE + 1.5, FY, z, B.apron, {});
      hazPlane(g, 7.8, 0.5, EAST_FACE + 3.02, 0.11, z, PI / 2);
      bx(g, 5.6, 0.15, 5.8, EAST_FACE + 2.7, 5.6, z, MAT.galv, { rotZ: -0.05 });
      bx(g, 0.38, 0.6, 0.4, EAST_FACE + 0.5, 0.94, z - 1.9, MAT.rubber, { cast: false });
      bx(g, 0.38, 0.6, 0.4, EAST_FACE + 0.5, 0.94, z + 1.9, MAT.rubber, { cast: false });
    }
    /* east wall man doors */
    for (const z of [4, 36]) {
      bx(g, 0.1, 2.25, 1.15, EAST_FACE + 0.05, 1.28, z, MAT.galv, { cast: false });
      bx(g, 0.14, 2.45, 1.35, EAST_FACE + 0.02, 1.36, z, B.steel, { cast: false });
      bx(g, 0.1, 0.14, 0.5, EAST_FACE + 0.2, 2.5, z, MAT.ledWarm, { cast: false });
    }
  }

  /* ---- low site context: containers, service road furniture, markings ---- */
  function buildSiteContext(g) {
    /* two static containers */
    bxB(g, 12.2, 2.62, 2.6, 92, FY, 50, MAT.container, { rotY: 0.22, cast: true, receive: true });
    bxB(g, 12.2, 2.62, 2.6, -88, FY, 51, B.maroon, { rotY: -0.14, cast: true, receive: true });
    /* corner castings on both */
    for (const p of [[92, 50, 0.22], [-88, 51, -0.14]]) {
      const c = Math.cos(p[2]), s = Math.sin(p[2]);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const ox = sx * 5.9, oz = sz * 1.1;
          bx(g, 0.36, 0.24, 0.36, p[0] + ox * c + oz * s, FY + 2.52, p[1] - ox * s + oz * c, B.steel, { cast: false });
        }
      }
    }
    /* yard line markings + a painted staging grid near the guard post */
    for (let i = 0; i < 5; i++) planeXZ(g, 3.2, 0.12, 96 + i * 3.4, FY + 0.032, 44, MAT.machineWhite, { receive: false });
    for (let i = 0; i < 5; i++) planeXZ(g, 0.12, 3.2, 96, FY + 0.032, 41.5 + i * 1.6, MAT.machineWhite, { receive: false });
    /* painted edge line along the apron */
    planeXZ(g, 0.18, 126, -108, FY + 0.032, 0, MAT.yellow, { receive: false });
    planeXZ(g, 0.18, 126, 108, FY + 0.032, 0, MAT.yellow, { receive: false });
  }

  /* ---- chain-link perimeter fence, gates, guard post ---- */
  function fenceRun(g, x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.round(len / 3.2));
    const rotY = -Math.atan2(dz, dx);
    for (let i = 0; i < n; i++) {
      const ax = x0 + (dx * i) / n, az = z0 + (dz * i) / n;
      plane(g, len / n - 0.05, 2.32, ax + dx / (2 * n), FY + 1.26, az + dz / (2 * n), B.fence, { rotY: rotY, cast: false, receive: false });
      bx(g, 0.1, 2.56, 0.1, ax, FY + 1.28, az, MAT.galv, { cast: false });
    }
    bx(g, 0.1, 2.56, 0.1, x1, FY + 1.28, z1, MAT.galv, { cast: false });
    bx(g, len, 0.07, 0.07, (x0 + x1) / 2, FY + 2.5, (z0 + z1) / 2, MAT.galv, { cast: false, rotY: rotY });
  }

  function fenceGate(g, x, z0, z1, leaves) {
    const zc = (z0 + z1) / 2, len = z1 - z0;
    /* gate posts */
    bx(g, 0.24, 3.0, 0.24, x, FY + 1.5, z0, B.steel, { cast: false });
    bx(g, 0.24, 3.0, 0.24, x, FY + 1.5, z1, B.steel, { cast: false });
    /* sliding leaves: galvanised frame + mesh panels */
    for (let i = 0; i < leaves; i++) {
      const zl = z0 + (len / leaves) * (i + 0.5);
      const w = len / leaves - 0.12;
      const ox = x + (i % 2 ? 0.07 : -0.07);
      const np = Math.max(2, Math.round(w / 3.2));
      for (let k = 0; k < np; k++) {
        const pw = w / np - 0.04;
        plane(g, pw, 2.2, ox, FY + 1.24, zl - w / 2 + (k + 0.5) * (w / np), B.fence, { rotY: PI / 2, cast: false, receive: false });
        bx(g, 0.07, 2.26, 0.07, ox, FY + 1.25, zl - w / 2 + k * (w / np), MAT.galv, { cast: false });
      }
      bx(g, 0.09, 2.3, 0.09, ox, FY + 1.25, zl - w / 2, MAT.galv, { cast: false });
      bx(g, 0.09, 2.3, 0.09, ox, FY + 1.25, zl + w / 2, MAT.galv, { cast: false });
      bx(g, 0.09, 0.09, w, ox, FY + 2.36, zl, MAT.galv, { cast: false });
      bx(g, 0.09, 0.09, w, ox, FY + 0.14, zl, MAT.galv, { cast: false });
      bx(g, 0.06, 0.06, w, ox, FY + 1.25, zl, MAT.galv, { cast: false, rotX: 0.28 });
    }
    /* gate motor + sign */
    bx(g, 0.5, 0.7, 0.6, x + 0.5, FY + 0.35, z0 - 0.3, MAT.machineGrey, { cast: false });
    signQuad(g, 9, 2.6, 1.3, x - 0.3, FY + 2.1, zc, -PI / 2);
    /* boom barrier: yellow arm with black bands */
    bx(g, 0.1, 1.1, 0.1, x - 2.6, FY + 0.55, zc, MAT.yellow, { cast: false });
    bx(g, 0.09, 0.09, 4.6, x - 2.6, FY + 1.05, zc - 2.3, MAT.yellow, { cast: false });
    for (let k = 0; k < 4; k++) {
      bx(g, 0.1, 0.1, 0.34, x - 2.6, FY + 1.05, zc - 0.9 - k * 1.1, MAT.machineDark, { cast: false });
    }
  }

  function buildFenceAndGates(g) {
    /* site perimeter (fence line) with two vehicle gates */
    fenceRun(g, -112, 62, 112, 62);
    fenceRun(g, -112, -62, 112, -62);
    fenceRun(g, -112, -62, -112, -14);
    fenceRun(g, -112, 0, -112, 62);
    fenceGate(g, -112, -14, 0, 2);
    fenceRun(g, 112, -62, 112, 8);
    fenceRun(g, 112, 22, 112, 62);
    fenceGate(g, 112, 8, 22, 2);

    /* small guard post at the east gate */
    const gx = 105.5, gz = 36;
    bxB(g, 3.6, 0.28, 3.0, gx, FY, gz, MAT.concreteDark, { cast: false });
    bxB(g, 3.3, 2.7, 2.7, gx, FY + 0.28, gz, MAT.wallInner, { cast: true, receive: true });
    bx(g, 3.8, 0.2, 3.2, gx, FY + 3.06, gz, B.roof, { cast: true });
    plane(g, 2.4, 1.1, gx - 1.66, FY + 1.8, gz, MAT.glassDark, { rotY: -PI / 2 });
    plane(g, 2.0, 1.0, gx, FY + 1.8, gz + 1.36, MAT.glassDark, {});
    bx(g, 0.9, 2.1, 0.1, gx + 0.7, FY + 1.34, gz + 1.37, MAT.galv, { cast: false });
    bx(g, 0.3, 0.14, 0.18, gx - 1.5, FY + 3.25, gz + 1.2, MAT.ledWarm, { cast: false });
    bx(g, 4.2, 0.12, 3.6, gx, FY + 3.24, gz, B.steel, { cast: false });
    signQuad(g, 14, 2.2, 1.1, gx - 1.35, FY + 2.35, gz + 1.37, 0);
  }

  /* ---- light masts, bollards, hydrant, small exterior details ---- */
  function buildSiteFurniture(g) {
    const masts = [[-102, 46], [96, 44], [-104, -34]];
    for (const p of masts) {
      cylB(g, 0.2, 0.28, 12.0, 10, p[0], FY, p[1], MAT.galv, { cast: true });
      bx(g, 2.8, 0.16, 0.24, p[0], FY + 11.9, p[1], MAT.galv, { cast: false });
      for (const ox of [-1.0, 0, 1.0]) {
        bx(g, 0.62, 0.14, 0.4, p[0] + ox, FY + 11.78, p[1], MAT.machineDark, { cast: false });
        bx(g, 0.5, 0.05, 0.3, p[0] + ox, FY + 11.7, p[1], MAT.ledWarm, { cast: false });
      }
      bxB(g, 0.9, 0.4, 0.9, p[0], FY, p[1], MAT.concreteDark, { cast: false });
    }
    /* bollard line around the hall corners / driveways */
    const bollards = [
      [-84, -34], [-84, -12], [-84, 12], [-84, 34], [-82, 38],
      [84, -34], [84, 0], [84, 34], [82, 38],
      [-104, -30], [-104, 30], [104, 4], [104, 34],
    ];
    for (const p of bollards) {
      cylB(g, 0.13, 0.16, 1.0, 10, p[0], FY, p[1], MAT.yellow, { cast: false });
      cylB(g, 0.14, 0.14, 0.08, 10, p[0], FY + 0.86, p[1], MAT.machineDark, { cast: false });
    }
    /* fire hydrant */
    cylB(g, 0.15, 0.18, 0.85, 10, -86, FY, -30, MAT.orangeDeep, { cast: false });
    cylB(g, 0.2, 0.2, 0.16, 10, -86, FY + 0.9, -30, MAT.orangeDeep, { cast: false });
    for (const ox of [-0.22, 0.22]) {
      cylB(g, 0.08, 0.08, 0.24, 8, -86 + ox, FY + 0.55, -30, MAT.galv, { cast: false, rotZ: PI / 2 });
    }
    /* a few low utility boxes along the west apron */
    for (const p of [[-85, 20], [-85, -18], [86, 18]]) {
      bxB(g, 0.9, 0.9, 0.6, p[0], FY, p[1], MAT.machineGrey, { cast: false });
      bx(g, 0.94, 0.08, 0.64, p[0], FY + 0.94, p[1], MAT.machineDark, { cast: false });
    }
  }

  /* ============================================================
     7b · UTILITY YARD + ENERGY PIPE BRIDGE (outside the north wall)
     ============================================================ */
  function buildUtilityYard(g) {
    const u = AX.utilityYard;
    const cx = (u.x0 + u.x1) / 2, cz = (u.z0 + u.z1) / 2;
    /* gravel pad + kerb */
    bxB(g, u.x1 - u.x0 + 2.0, 0.22, u.z1 - u.z0 + 2.0, cx, FY - 0.05, cz, B.gravel, { cast: false, receive: true });
    bxB(g, u.x1 - u.x0 + 2.4, 0.3, 0.24, cx, FY - 0.1, u.z1 + 1.1, MAT.concreteDark, { cast: false });
    /* fence around the yard (3 sides) */
    fenceRun(g, u.x0 - 1.0, u.z0 - 1.0, u.x0 + (u.x1 - u.x0) + 1.0, u.z0 - 1.0);
    fenceRun(g, u.x0 - 1.0, u.z0 - 1.0, u.x0 - 1.0, u.z1 + 0.6);
    fenceRun(g, u.x1 + 1.0, u.z0 - 1.0, u.x1 + 1.0, u.z1 + 0.6);
    /* gate in the yard fence, facing the yard approach */
    bx(g, 0.9, 0.1, 0.1, -45, FY + 2.3, u.z0 - 1.0, MAT.galv, { cast: false });

    /* ---- two oil-filled transformers with radiator fins ---- */
    for (const tx of [-44.2, -38.6]) {
      const tz = -50.6;
      bxB(g, 4.0, 0.34, 2.9, tx, FY, tz, MAT.concreteDark, { cast: false });
      bx(g, 3.0, 2.1, 2.0, tx, FY + 1.35, tz, MAT.machineGrey, { receive: true });
      /* tank lid + conservator */
      bx(g, 3.2, 0.16, 2.2, tx, FY + 2.44, tz, MAT.machineDark, { cast: false });
      tubeX(g, 0.34, 2.2, tx, FY + 2.95, tz - 0.4, MAT.machineGrey, { cast: false });
      /* radiator fins on both long sides */
      for (let k = 0; k < 9; k++) {
        bx(g, 0.05, 1.5, 0.22, tx - 1.55, FY + 1.25, tz - 0.8 + k * 0.2, MAT.machineDark, { cast: false });
        bx(g, 0.05, 1.5, 0.22, tx + 1.55, FY + 1.25, tz - 0.8 + k * 0.2, MAT.machineDark, { cast: false });
      }
      /* bushings on top */
      for (const ox of [-0.9, 0, 0.9]) {
        cylB(g, 0.1, 0.14, 0.85, 8, tx + ox, FY + 2.52, tz + 0.55, MAT.machineWhite, { cast: false });
        cylB(g, 0.05, 0.05, 0.2, 6, tx + ox, FY + 3.36, tz + 0.55, MAT.galv, { cast: false });
      }
      /* warning plate */
      hazPlane(g, 0.9, 0.36, tx, FY + 1.1, tz + 1.02, 0);
    }

    /* ---- three air-cooled chillers ---- */
    const chill = [[-32.4, -50.8], [-27.6, -50.8], [-30.0, -46.8]];
    for (const p of chill) {
      bxB(g, 3.4, 0.3, 1.4, p[0], FY, p[1], MAT.concreteDark, { cast: false });
      bx(g, 3.2, 1.9, 1.25, p[0], FY + 1.25, p[1], MAT.machineGrey, {});
      bx(g, 3.3, 0.1, 1.35, p[0], FY + 2.25, p[1], MAT.machineDark, { cast: false });
      for (const ox of [-1.05, 0, 1.05]) {
        cylB(g, 0.42, 0.42, 0.12, 14, p[0] + ox, FY + 2.32, p[1], MAT.machineDark, { cast: false });
        cylB(g, 0.1, 0.1, 0.05, 8, p[0] + ox, FY + 2.4, p[1], MAT.galv, { cast: false });
      }
      /* grille slits */
      for (let k = 0; k < 5; k++) bx(g, 2.6, 0.05, 0.03, p[0], FY + 0.8 + k * 0.2, p[1] + 0.64, MAT.machineDark, { cast: false });
    }

    /* ---- two vertical storage tanks ---- */
    for (const p of [[-45.4, -45.4], [-42.0, -45.4]]) {
      bxB(g, 3.6, 0.35, 3.6, p[0], FY, p[1], MAT.concreteDark, { cast: false });
      cylB(g, 1.45, 1.45, 5.2, 18, p[0], FY + 0.35, p[1], MAT.machineWhite, { receive: true });
      cylB(g, 1.5, 1.5, 0.18, 18, p[0], FY + 5.55, p[1], MAT.galv, { cast: false });
      cylB(g, 0.75, 0.75, 0.2, 14, p[0], FY + 5.73, p[1], MAT.galv, { cast: false });
      for (let k = 0; k < 3; k++) {
        cylB(g, 1.49, 1.49, 0.09, 18, p[0], FY + 1.1 + k * 1.4, p[1], MAT.galv, { cast: false });
      }
      /* ladder cage hint + pipe stubs */
      bx(g, 0.1, 5.0, 0.1, p[0] + 1.35, FY + 2.8, p[1] + 0.2, MAT.galv, { cast: false });
      tubeX(g, 0.16, 1.6, p[0] - 1.9, FY + 1.0, p[1], MAT.galv, { cast: false });
      hazPlane(g, 1.4, 0.4, p[0], FY + 0.5, p[1] + 1.46, 0);
    }

    /* ---- energy pipe bridge across the north wall ---- */
    const ey = AX.energyEntry;
    const rackZ0 = u.z1 + 0.2, rackZ1 = HZ0 - 0.1;
    /* rack frame: 2 portal columns + cross beam outside, penetration collar at wall */
    for (const zz of [rackZ0, -41.4]) {
      bx(g, 0.24, 4.6, 0.24, ey.x - 2.6, FY + 2.3, zz, B.steel, { cast: true });
      bx(g, 0.24, 4.6, 0.24, ey.x + 2.6, FY + 2.3, zz, B.steel, { cast: true });
      bx(g, 5.7, 0.22, 0.24, ey.x, FY + 4.55, zz, B.steel, { cast: true });
    }
    bx(g, 0.16, 4.6, 0.16, ey.x - 2.6, FY + 2.3, -40.9, B.steel, { cast: false });
    bx(g, 0.16, 4.6, 0.16, ey.x + 2.6, FY + 2.3, -40.9, B.steel, { cast: false });
    /* three insulated pipes: from the yard, through the wall, then up inside */
    const pipeXs = [ey.x - 1.5, ey.x, ey.x + 1.5];
    for (let pi = 0; pi < 3; pi++) {
      const px = pipeXs[pi];
      const zRow = -37.9 + pi * 0.55;
      const pts = [
        new T.Vector3(px, 3.15, rackZ0 - 1.6),
        new T.Vector3(px, 3.15, rackZ0 + 0.4),
        new T.Vector3(px, 3.15, -41.4),
        new T.Vector3(px, 3.2, -40.4),
        new T.Vector3(px, 3.6, -39.6),
        new T.Vector3(px, 6.0, -38.6),
        new T.Vector3(px, 12.1, zRow),
        new T.Vector3(px + 2.4, 12.1, zRow),
      ];
      const curve = new T.CatmullRomCurve3(pts);
      const geo = new T.TubeGeometry(curve, 30, 0.19, 7, false);
      const pm = new T.Mesh(geo, MAT.galv);
      pm.castShadow = false;
      pm.receiveShadow = false;
      g.add(pm);
      /* insulation bands along the outdoor run */
      for (let k = 0; k < 4; k++) {
        cylB(g, 0.22, 0.22, 0.1, 8, px, 3.15, rackZ0 - 1.2 + k * 0.85, MAT.machineDark, { cast: false });
      }
      /* inside: header run east along the truss bottom chord */
      tubeX(g, 0.17, 34.0 - (px + 2.4), (px + 2.4 + 34.0) / 2, 12.1, zRow, MAT.galv, { cast: false });
      for (let xx = -28; xx <= 32; xx += 12) {
        lineBetween(g, [xx, 12.15, zRow], [xx, TY, zRow], 0.02, B.steel);
      }
      /* wall clamps */
      for (const yy of [4.6, 7.4, 10.2]) {
        bx(g, 0.5, 0.12, 0.16, px, yy, HZ0 + 0.3, B.steel, { cast: false });
      }
    }
    /* wall penetration plate + flanges */
    bx(g, 4.6, 2.6, 0.2, ey.x, 3.1, HZ0 - 0.12, B.steel, { cast: false });
    for (const px of pipeXs) {
      tubeZ(g, 0.36, 0.14, px, 3.15, HZ0 - 0.02, MAT.galv, { cast: false });
      tubeZ(g, 0.36, 0.14, px, 3.15, HZ0 - 0.28, MAT.galv, { cast: false });
    }
    /* energy-entry beacon (data flows start here) */
    const sp = glowSprite(g, 0xffb45c, 7.5, 0.6, TEX.glow);
    sp.position.set(ey.x, ey.y + 0.9, HZ0 + 0.9);
    PULSES.push({ s: sp, base: 0.45, amp: 0.16, ph: 0.4, f: 1.4 });
    bx(g, 0.5, 0.5, 0.16, ey.x, ey.y + 0.2, HZ0 + 0.16, MAT.ledAmber, { cast: false });
    bx(g, 0.9, 0.3, 0.05, ey.x, 4.6, HZ0 + 0.14, B.steel, { cast: false });
    /* yard sign board on the fence */
    signQuad(g, 14, 3.2, 1.6, -36, FY + 1.9, u.z0 - 1.02, 0);
  }

  /* ============================================================
     8 · PICK PROXIES + ANIMATION + BUILD
     ============================================================ */
  function buildPicks(g) {
    for (const z of ZONES) {
      const cx = (z.x0 + z.x1) / 2, cz = (z.z0 + z.z1) / 2;
      addPickProxy(g, {
        kind: "zone", id: z.id, title: z.zh, zone: z.id,
        anchor: { x: cx, y: 2, z: cz },
      }, z.x1 - z.x0 - 1.2, 0.9, z.z1 - z.z0 - 1.2, cx, 1.2, cz);
    }

    /* one cheap tick: breathe the few glow sprites (no allocations) */
    addTick((t) => {
      for (let i = 0; i < PULSES.length; i++) {
        const p = PULSES[i];
        p.s.material.opacity = p.base + p.amp * Math.sin(t * p.f + p.ph);
      }
    });
  }

  window.buildBuilding = function () {
    if (!TEX.concrete) { buildTextures(); buildMaterials(); }
    if (!B.floor) makeMats();

    const g = new T.Group();
    g.name = "building";
    scene.add(g);

    buildFloor(g);
    buildShell(g);
    buildRooms(g);
    buildExterior(g);
    buildUtilityYard(g);
    buildPicks(g);

    /* shadow budget: only big volumes cast; greebles and glow surfaces never do */
    const NO_CAST = [B.apron, B.floor, B.signs, B.haz, B.fence, B.gravel, B.window,
      MAT.galv, MAT.ledWarm, MAT.ledWhite, MAT.ledAmber, MAT.ledGreen,
      MAT.screen, MAT.screenAmber, MAT.glassClear, MAT.glassDark,
      MAT.rubber, MAT.yellow, MAT.orangeDeep, MAT.machineDark,
      MAT.machineWhite, MAT.cardboard, MAT.asphalt];
    g.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (NO_CAST.indexOf(o.material) >= 0) o.castShadow = false;
    });

    mergeStatic(g);
    return g;
  };
})();
