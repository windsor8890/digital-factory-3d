/* ============================================================
   60 · data — holographic data layer for DF-01 数字工厂
   A. zone floor footprints (7) + corner survey ticks + code plates
   B. projected DOM labels for 6 production zones + plant telemetry
      + a focus label for the picked machine (addTickLate, 20 fps)
   C. energy distribution tree from AX.energyEntry along the north
      wall, risers at each zone, 6 travelling pulses (+2 on trunk)
   D. material flow — AGV loop dots + 2 final-assembly line pulses
   E. soft scan sweep across the hall + brighter floor leading edge
   F. dashed digital-twin envelope around the hall volume
   G. station beacons (instanced sphere + additive glow) coloured by
      SIM state, expanding alarm ping on a down transition
   H. focus reticle + label for picked machine, footprint pulse for
      picked zone.  All of it toggles via window.DATA.
   No stations are registered here; beacons mirror SIM.stations[].
   ============================================================ */

(function () {
  "use strict";

  const PROD_ZONES = ["Z01", "Z02", "Z03", "Z04", "Z05", "Z06"];

  /* label / callout css — uses the shell palette vars, ~2.4 KB */
  const LABEL_CSS = @@BT@@
#labels .df-lbl{position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;opacity:0;transition:opacity .3s ease;will-change:transform,opacity}
#labels .df-lbl.show{opacity:.88}
#labels .df-lbl.dim{opacity:.3}
#labels .df-lbl::before{content:"";position:absolute;left:-.5px;bottom:0;width:1px;height:var(--ll,16px);background:linear-gradient(to top,rgba(242,167,59,.04),rgba(242,167,59,.42));transform-origin:50% 100%;transform:rotate(var(--la,0deg));pointer-events:none}
#labels .df-lbl::after{content:"";position:absolute;left:-1px;bottom:-2px;width:2px;height:2px;border-radius:50%;background:var(--amber);box-shadow:0 0 4px rgba(242,167,59,.7);pointer-events:none}
#labels .df-card{position:absolute;left:var(--dx,0px);bottom:var(--lead,16px);transform:translateX(-50%);width:164px;padding:5px 8px 5px;border:1px solid var(--hair);background:linear-gradient(160deg,rgba(17,18,21,.72),rgba(8,9,11,.8));-webkit-backdrop-filter:blur(7px) saturate(1.1);backdrop-filter:blur(7px) saturate(1.1);box-shadow:0 2px 12px rgba(0,0,0,.34);font-family:var(--sans);color:var(--ink);white-space:nowrap;text-align:left}
#labels .df-card::before{content:"";position:absolute;left:-1px;top:-1px;width:7px;height:7px;border-left:1px solid var(--amber2);border-top:1px solid var(--amber2);opacity:.6}
#labels .df-l1{display:flex;align-items:baseline;gap:6px;line-height:1.1;margin-bottom:3px}
#labels .df-idx{font-family:var(--mono);font-size:8px;letter-spacing:.08em;color:var(--amber);flex:none}
#labels .df-zh{font-family:var(--cjk);font-size:11.5px;letter-spacing:.07em;color:var(--ink);overflow:hidden;text-overflow:ellipsis}
#labels .df-st{width:4px;height:4px;border-radius:50%;background:var(--green);box-shadow:0 0 4px rgba(158,214,180,.65);flex:none;align-self:center;margin-left:auto}
#labels .df-lbl.down .df-st{background:var(--red);box-shadow:0 0 4px rgba(255,86,56,.8)}
#labels .df-lbl.idle .df-st{background:var(--amber);box-shadow:0 0 4px rgba(242,167,59,.6)}
#labels .df-l2{display:flex;align-items:baseline;gap:5px;line-height:1;font-family:var(--mono);font-size:6.5px;letter-spacing:.12em;color:var(--faint)}
#labels .df-en{overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0}
#labels .df-util{flex:none;color:var(--dim);letter-spacing:.04em}
#labels .df-util b{font-weight:400;font-size:9px;color:var(--ink2)}
#labels .df-wip{flex:none;color:var(--dim);letter-spacing:.06em}
#labels .df-wip b{font-weight:400;font-size:9px;color:var(--ink2)}
#labels .df-lbl.hot .df-card{border-color:rgba(242,167,59,.42);background:linear-gradient(160deg,rgba(28,23,14,.8),rgba(10,10,11,.84))}
#labels .df-lbl.hot .df-idx{color:#ffce7a}
#labels .df-mach .df-card{width:176px;border-color:rgba(242,167,59,.28)}
#labels .df-mach .df-zh{color:#ffce7a}
@@BT@@;

  window.buildData = function () {
    const AMBER = PAL.amber;
    const C_AMBER = new T.Color(AMBER);
    const C_GREEN = new T.Color(PAL.green);
    const C_RED = new T.Color(PAL.red);
    const C_IVORY = new T.Color(PAL.ink);
    const BEACON_CAP = 32;

    const group = new T.Group();
    group.name = "dataLayer";
    scene.add(group);

    let dataOn = !FLAGS.noData;
    let labelsOn = !FLAGS.noLabels;
    let focusZone = null;
    let focusObj = null;

    /* ---------- shared scratch (no per-frame allocation) ---------- */
    const v3a = new T.Vector3();
    const v3b = new T.Vector3();
    const proj = { ok: false, x: 0, y: 0, d: 0 };
    function projectPoint(x, y, z) {
      v3a.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      if (v3a.z > -1.5) { proj.ok = false; return proj; }
      proj.d = -v3a.z;
      v3b.copy(v3a).applyMatrix4(camera.projectionMatrix);
      proj.x = (v3b.x * 0.5 + 0.5) * window.innerWidth;
      proj.y = (-v3b.y * 0.5 + 0.5) * window.innerHeight;
      proj.ok = Math.abs(v3b.x) < 1.45 && Math.abs(v3b.y) < 1.45;
      return proj;
    }

    /* ============================================================
       A · zone floor footprints — hairlines, corner ticks, codes
       ============================================================ */
    const FOOT_Y = 0.055;
    const FW = 0.24;          // strip width
    const TICK = 2.5;         // outward corner tick length

    function pushQuad(arrPos, arrCol, x0, z0, x1, z1, y, inten) {
      const a = inten, b = inten, c = inten;
      // two triangles (winding irrelevant: DoubleSide)
      arrPos.push(x0, y, z0, x1, y, z0, x1, y, z1);
      arrPos.push(x0, y, z0, x1, y, z1, x0, y, z1);
      for (let i = 0; i < 6; i++) arrCol.push(a, b, c);
    }
    function normRect(ax, az, bx, bz) {
      return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
    }
    const zoneQuads = {};
    const zoneBase = {};
    function buildZoneQuads(z) {
      const q = [];
      const x0 = z.x0, x1 = z.x1, z0 = z.z0, z1 = z.z1;
      q.push(normRect(x0 - FW / 2, z0 - FW / 2, x1 + FW / 2, z0 + FW / 2));
      q.push(normRect(x0 - FW / 2, z1 - FW / 2, x1 + FW / 2, z1 + FW / 2));
      q.push(normRect(x0 - FW / 2, z0 - FW / 2, x0 + FW / 2, z1 + FW / 2));
      q.push(normRect(x1 - FW / 2, z0 - FW / 2, x1 + FW / 2, z1 + FW / 2));
      for (let ix = 0; ix < 2; ix++) {
        const cx = ix ? x1 : x0;
        const dx = ix ? 1 : -1;
        for (let iz = 0; iz < 2; iz++) {
          const cz = iz ? z1 : z0;
          const dz = iz ? 1 : -1;
          q.push(normRect(cx + dx * 0.30, cz - 0.10, cx + dx * (TICK + 0.30), cz + 0.10));
          q.push(normRect(cx - 0.10, cz + dz * 0.30, cx + 0.10, cz + dz * (TICK + 0.30)));
        }
      }
      return q;
    }

    const outlinePos = [], outlineCol = [];
    const zoneSeg = {};
    for (const z of ZONES) {
      zoneQuads[z.id] = buildZoneQuads(z);
      zoneBase[z.id] = z.id === "Z07" ? 0.5 : 1.0;
      const start = outlinePos.length;
      for (const r of zoneQuads[z.id]) pushQuad(outlinePos, outlineCol, r[0], r[1], r[2], r[3], FOOT_Y, zoneBase[z.id]);
      zoneSeg[z.id] = { start: start, end: outlinePos.length };
    }
    const outlineGeo = new T.BufferGeometry();
    outlineGeo.setAttribute("position", new T.Float32BufferAttribute(outlinePos, 3));
    outlineGeo.setAttribute("color", new T.Float32BufferAttribute(outlineCol, 3));
    const outlineMat = new T.MeshBasicMaterial({
      color: AMBER, vertexColors: true, transparent: true, opacity: 0.66,
      depthWrite: false, side: T.DoubleSide, toneMapped: false,
    });
    const outlineMesh = new T.Mesh(outlineGeo, outlineMat);
    outlineMesh.renderOrder = 3;
    group.add(outlineMesh);

    // translucent zone fill (very subtle)
    const fillPos = [], fillCol = [];
    for (const id of PROD_ZONES) {
      const z = zoneById(id);
      pushQuad(fillPos, fillCol, z.x0, z.z0, z.x1, z.z1, FOOT_Y - 0.004, 1.0);
    }
    const fillGeo = new T.BufferGeometry();
    fillGeo.setAttribute("position", new T.Float32BufferAttribute(fillPos, 3));
    fillGeo.setAttribute("color", new T.Float32BufferAttribute(fillCol, 3));
    const fillMat = new T.MeshBasicMaterial({
      color: AMBER, vertexColors: true, transparent: true, opacity: 0.014,
      depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false,
    });
    const fillMesh = new T.Mesh(fillGeo, fillMat);
    fillMesh.renderOrder = 2;
    group.add(fillMesh);

    // focused-zone overlay (bright pulsing survey marking)
    let focusZoneGeo = null;
    const focusZoneMat = new T.MeshBasicMaterial({
      color: new T.Color(AMBER).multiplyScalar(1.05), vertexColors: true,
      transparent: true, opacity: 0.26, depthWrite: false, side: T.DoubleSide,
      blending: T.AdditiveBlending, toneMapped: false,
    });
    const focusZoneMesh = new T.Mesh(new T.BufferGeometry(), focusZoneMat);
    focusZoneMesh.visible = false;
    focusZoneMesh.renderOrder = 4;
    focusZoneMesh.frustumCulled = false;
    group.add(focusZoneMesh);
    function applyFocusZoneGeo() {
      if (!focusZone) { focusZoneMesh.visible = false; return; }
      const pos = [], col = [];
      for (const r of zoneQuads[focusZone]) pushQuad(pos, col, r[0], r[1], r[2], r[3], FOOT_Y + 0.012, 1.0);
      const z = zoneById(focusZone);
      pushQuad(pos, col, z.x0, z.z0, z.x1, z.z1, FOOT_Y + 0.008, 0.05);
      const geo = new T.BufferGeometry();
      geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      geo.setAttribute("color", new T.Float32BufferAttribute(col, 3));
      if (focusZoneGeo) focusZoneGeo.dispose();
      focusZoneGeo = geo;
      focusZoneMesh.geometry = geo;
      focusZoneMesh.visible = true;
    }
    function paintOutline() {
      const col = outlineGeo.attributes.color.array;
      for (const z of ZONES) {
        const id = z.id;
        const seg = zoneSeg[id];
        const dim = (focusZone && focusZone !== id) ? 0.22 : 1.0;
        const v = zoneBase[id] * dim;
        for (let i = seg.start; i < seg.end; i += 3) {
          col[i] = v; col[i + 1] = v; col[i + 2] = v;
        }
      }
      outlineGeo.attributes.color.needsUpdate = true;
    }

    /* ---------- floor code plates (one atlas, one draw call) ---------- */
    const PLATE = {
      Z01: [-54.2, 29.8, 7.2, 1.8], Z02: [-18.4, -10.6, 7.2, 1.8],
      Z03: [-18.4, 10.6, 7.2, 1.8], Z04: [5.0, -6.6, 7.2, 1.8],
      Z05: [21.6, 8.2, 7.2, 1.8], Z06: [66.0, 7.2, 5.6, 1.4],
    };
    const ATW = 2048, ATH = 256, CELLW = 512, CELLH = 128;
    const plateTex = canvasTexture(ATW, ATH, (ctx) => {
      ctx.clearRect(0, 0, ATW, ATH);
      for (let i = 0; i < PROD_ZONES.length; i++) {
        const id = PROD_ZONES[i];
        const z = zoneById(id);
        const cx = (i % 4) * CELLW, cy = ((i / 4) | 0) * CELLH;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "rgba(9,10,12,0.80)";
        ctx.fillRect(6, 6, CELLW - 12, CELLH - 12);
        ctx.strokeStyle = "rgba(242,167,59,0.55)";
        ctx.lineWidth = 2;
        ctx.strokeRect(6, 6, CELLW - 12, CELLH - 12);
        // corner ticks
        ctx.strokeStyle = "rgba(242,167,59,0.9)";
        ctx.lineWidth = 4;
        ctx.beginPath();
        for (const sx of [0, 1]) {
          for (const sy of [0, 1]) {
            const px = sx ? CELLW - 22 : 22, py = sy ? CELLH - 22 : 22;
            const dir = sx ? -1 : 1, dirY = sy ? -1 : 1;
            ctx.moveTo(px, py); ctx.lineTo(px + 26 * dir, py);
            ctx.moveTo(px, py); ctx.lineTo(px, py + 20 * dirY);
          }
        }
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "rgba(242,167,59,0.95)";
        ctx.font = "600 62px 'Cascadia Mono',Consolas,monospace";
        ctx.fillText(id, 34, 62);
        ctx.fillStyle = "rgba(242,167,59,0.34)";
        ctx.fillRect(148, 26, 2, CELLH - 52);
        ctx.fillStyle = "rgba(236,231,221,0.92)";
        ctx.font = "400 42px 'Microsoft YaHei UI','Microsoft YaHei',sans-serif";
        ctx.fillText(z.zh, 168, 56);
        ctx.fillStyle = "rgba(236,231,221,0.4)";
        ctx.font = "400 19px 'Cascadia Mono',Consolas,monospace";
        ctx.fillText(z.short, 170, 96);
        ctx.restore();
      }
    });
    plateTex.anisotropy = 8;
    const platePos = [], plateUv = [], plateIdx = [];
    for (let i = 0; i < PROD_ZONES.length; i++) {
      const id = PROD_ZONES[i];
      const cfg = PLATE[id];
      const x = cfg[0], zc = cfg[1], w = cfg[2], d = cfg[3];
      const x0 = x - w / 2, x1 = x + w / 2, z0 = zc - d / 2, z1 = zc + d / 2;
      const col = i % 4, row = (i / 4) | 0;
      const u0 = (col * CELLW + 4) / ATW, u1 = ((col + 1) * CELLW - 4) / ATW;
      const v0 = 1 - ((row + 1) * CELLH - 4) / ATH, v1 = 1 - (row * CELLH + 4) / ATH;
      const base = platePos.length / 3;
      // top-left = north-west
      platePos.push(x0, 0.075, z0, x1, 0.075, z0, x1, 0.075, z1, x0, 0.075, z1);
      plateUv.push(u0, v1, u1, v1, u1, v0, u0, v0);
      plateIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    const plateGeo = new T.BufferGeometry();
    plateGeo.setAttribute("position", new T.Float32BufferAttribute(platePos, 3));
    plateGeo.setAttribute("uv", new T.Float32BufferAttribute(plateUv, 2));
    plateGeo.setIndex(plateIdx);
    const plateMat = new T.MeshBasicMaterial({
      map: plateTex, transparent: true, opacity: 0.95, depthWrite: false,
      side: T.DoubleSide, toneMapped: false,
    });
    const plateMesh = new T.Mesh(plateGeo, plateMat);
    plateMesh.renderOrder = 3;
    group.add(plateMesh);

    /* ============================================================
       C · energy distribution tree
       ============================================================ */
    function makePath(points) {
      const pts = points.map((p) => new T.Vector3(p[0], p[1], p[2]));
      const segs = [];
      let total = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = a.distanceTo(b);
        segs.push({ ax: a.x, ay: a.y, az: a.z, bx: b.x, by: b.y, bz: b.z, s0: total, len: len });
        total += len;
      }
      return { segs: segs, total: total };
    }
    function samplePath(path, s, out) {
      const total = path.total;
      let u = s % total;
      if (u < 0) u += total;
      const segs = path.segs;
      for (let i = 0; i < segs.length; i++) {
        const sg = segs[i];
        if (u <= sg.s0 + sg.len || i === segs.length - 1) {
          const f = sg.len > 0 ? clamp((u - sg.s0) / sg.len, 0, 1) : 0;
          out.x = sg.ax + (sg.bx - sg.ax) * f;
          out.y = sg.ay + (sg.by - sg.ay) * f;
          out.z = sg.az + (sg.bz - sg.az) * f;
          return out;
        }
      }
      out.set(0, 0, 0);
      return out;
    }

    const ENTRY = AX.energyEntry;
    const TRUNK_Y = EntryY(ENTRY);
    function EntryY(e) { return e && e.y ? e.y : 3.2; }
    const trunkZ = HALL.z0 + 0.7;
    const trunkPath = makePath([[-74.6, TRUNK_Y, trunkZ], [68.4, TRUNK_Y, trunkZ]]);
    const entryPath = makePath([[ENTRY.x, TRUNK_Y, HALL.z0 + 0.05], [ENTRY.x, TRUNK_Y, trunkZ]]);
    const BRANCH_Y = 12.2;
    const branchPaths = [];
    const energyLinePos = [], energyLineS = [], energyLineLen = [];
    function addLinePath(path) {
      for (const sg of path.segs) {
        energyLinePos.push(sg.ax, sg.ay, sg.az, sg.bx, sg.by, sg.bz);
        energyLineS.push(sg.s0, sg.s0 + sg.len);
        energyLineLen.push(path.total, path.total);
      }
    }
    addLinePath(trunkPath);
    addLinePath(entryPath);
    const TAPS = [-63, -30.5, -27.9, 2, 39.5, 68.2]; // Z02/Z03 risers nudged apart
    for (let i = 0; i < PROD_ZONES.length; i++) {
      const z = zoneById(PROD_ZONES[i]);
      const tapX = TAPS[i];
      const endZ = (z.z0 + z.z1) * 0.5;
      const p = makePath([
        [tapX, TRUNK_Y, trunkZ], [tapX, BRANCH_Y, trunkZ],
        [tapX, BRANCH_Y, endZ], [tapX, BRANCH_Y - 4.6, endZ],
      ]);
      branchPaths.push(p);
      addLinePath(p);
    }
    const energyGeo = new T.BufferGeometry();
    energyGeo.setAttribute("position", new T.Float32BufferAttribute(energyLinePos, 3));
    energyGeo.setAttribute("aS", new T.Float32BufferAttribute(energyLineS, 1));
    energyGeo.setAttribute("aLen", new T.Float32BufferAttribute(energyLineLen, 1));
    const energyMat = new T.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new T.Color(AMBER).multiplyScalar(1.25) },
      },
      vertexShader: @@BT@@
        attribute float aS;
        attribute float aLen;
        varying float vS;
        varying float vLen;
        void main() {
          vS = aS; vLen = aLen;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      @@BT@@,
      fragmentShader: @@BT@@
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor;
        varying float vS;
        varying float vLen;
        void main() {
          float dash = step(0.42, fract(vS / 2.6));
          float ph = fract((vS - uTime * 16.0) / max(vLen, 1.0));
          float d = min(ph, 1.0 - ph);
          float pulse = exp(-d * 42.0);
          float a = dash * 0.30 + pulse * 0.95;
          vec3 col = uColor * (0.5 + pulse * 2.8);
          gl_FragColor = vec4(col, a);
        }
      @@BT@@,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    const energyLines = new T.LineSegments(energyGeo, energyMat);
    energyLines.frustumCulled = false;
    group.add(energyLines);

    // travelling pulses: 6 branch pulses + 2 trunk pulses
    const PULSE_N = 8;
    const pulseGeo = new T.BufferGeometry();
    const pulsePosArr = new Float32Array(PULSE_N * 3);
    pulseGeo.setAttribute("position", new T.BufferAttribute(pulsePosArr, 3));
    const pulseMat = new T.PointsMaterial({
      size: 1.15, map: TEX.glow, color: new T.Color(AMBER).multiplyScalar(1.5),
      transparent: true, opacity: 0.9, depthWrite: false, blending: T.AdditiveBlending,
      sizeAttenuation: true, toneMapped: false,
    });
    const energyPulses = new T.Points(pulseGeo, pulseMat);
    energyPulses.frustumCulled = false;
    group.add(energyPulses);
    const branchSpeed = branchPaths.map((p) => p.total / 5.2);
    const pulseOffset = [0.3, 0.9, 1.6, 2.2, 2.9, 3.6];

    // energy inlet plate
    const inletTex = makeSignTexture("能源入口 · GRID INLET", "1.29 MW · 3.2 m FEED", { w: 512, h: 128 });
    const inletMat = new T.MeshStandardMaterial({
      map: inletTex, emissiveMap: inletTex, emissive: 0xffffff, emissiveIntensity: 0.5,
      color: 0x141209, roughness: 0.6, metalness: 0.1,
    });
    const inletPlate = new T.Mesh(new T.PlaneGeometry(3.4, 0.85), inletMat);
    inletPlate.position.set(ENTRY.x + 4.2, 3.86, HALL.z0 + 0.85);
    group.add(inletPlate);

    /* ============================================================
       D · material flow — AGV loop + final-assembly lines
       ============================================================ */
    const ROUTE = AX.agvRoute;
    const routeSegs = [];
    let routeTotal = 0;
    for (let i = 0; i < ROUTE.length; i++) {
      const a = ROUTE[i], b = ROUTE[(i + 1) % ROUTE.length];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      routeSegs.push({ ax: a[0], az: a[1], dx: dx, dz: dz, s0: routeTotal, len: len });
      routeTotal += len;
    }
    function sampleRoute(s, out) {
      let u = s % routeTotal;
      if (u < 0) u += routeTotal;
      for (let i = 0; i < routeSegs.length; i++) {
        const sg = routeSegs[i];
        if (u <= sg.s0 + sg.len || i === routeSegs.length - 1) {
          const f = sg.len > 0 ? (u - sg.s0) / sg.len : 0;
          out.x = sg.ax + sg.dx * f;
          out.z = sg.az + sg.dz * f;
          return out;
        }
      }
      out.x = 0; out.z = 0;
      return out;
    }
    // dashed ghost of the AGV lane
    const routePts = ROUTE.map((p) => new T.Vector3(p[0], 0.045, p[1]));
    routePts.push(new T.Vector3(ROUTE[0][0], 0.045, ROUTE[0][1]));
    const routeGeo = new T.BufferGeometry().setFromPoints(routePts);
    const routeMat = new T.LineDashedMaterial({
      color: AMBER, dashSize: 1.5, gapSize: 2.3, transparent: true, opacity: 0.15,
      depthWrite: false, toneMapped: false,
    });
    const routeLine = new T.LineSegments(routeGeo, routeMat);
    routeLine.computeLineDistances();
    group.add(routeLine);

    const AGV_DOTS = 20, ASM_DOTS = 12;
    const FLOW_N = AGV_DOTS + ASM_DOTS;
    const flowGeo = new T.BufferGeometry();
    const flowPos = new Float32Array(FLOW_N * 3);
    const flowCol = new Float32Array(FLOW_N * 3);
    const cAgv = new T.Color(AMBER).multiplyScalar(1.15);
    const cAsm = new T.Color(PAL.white).multiplyScalar(0.95);
    for (let i = 0; i < AGV_DOTS; i++) {
      flowPos[i * 3] = 0; flowPos[i * 3 + 1] = 0.18; flowPos[i * 3 + 2] = 0;
      flowCol[i * 3] = cAgv.r; flowCol[i * 3 + 1] = cAgv.g; flowCol[i * 3 + 2] = cAgv.b;
    }
    for (let i = AGV_DOTS; i < FLOW_N; i++) {
      flowPos[i * 3] = 0; flowPos[i * 3 + 1] = 1.9; flowPos[i * 3 + 2] = 12;
      flowCol[i * 3] = cAsm.r; flowCol[i * 3 + 1] = cAsm.g; flowCol[i * 3 + 2] = cAsm.b;
    }
    flowGeo.setAttribute("position", new T.BufferAttribute(flowPos, 3));
    flowGeo.setAttribute("color", new T.BufferAttribute(flowCol, 3));
    const flowMat = new T.PointsMaterial({
      size: 0.5, map: TEX.glowTight, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
    });
    const flowPoints = new T.Points(flowGeo, flowMat);
    flowPoints.frustumCulled = false;
    group.add(flowPoints);
    const flowOffsets = new Float32Array(FLOW_N);
    for (let i = 0; i < AGV_DOTS; i++) flowOffsets[i] = (i / AGV_DOTS) * routeTotal;
    for (let i = 0; i < ASM_DOTS; i++) flowOffsets[AGV_DOTS + i] = (i / (ASM_DOTS / 2)) * 22;

    /* ============================================================
       E · scan sweep + floor leading edge
       ============================================================ */
    const scanTex = canvasTexture(256, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "rgba(242,167,59,0)");
      g.addColorStop(0.35, "rgba(242,167,59,0.10)");
      g.addColorStop(0.86, "rgba(242,167,59,0.34)");
      g.addColorStop(1, "rgba(242,167,59,0.12)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "destination-in";
      const gx = ctx.createLinearGradient(0, 0, w, 0);
      gx.addColorStop(0, "rgba(255,255,255,0)");
      gx.addColorStop(0.16, "rgba(255,255,255,1)");
      gx.addColorStop(0.84, "rgba(255,255,255,1)");
      gx.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gx;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
    });
    const scanMat = new T.MeshBasicMaterial({
      map: scanTex, transparent: true, opacity: 0.15, depthWrite: false,
      side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false,
    });
    const scanPlane = new T.Mesh(new T.PlaneGeometry(80, 14), scanMat);
    scanPlane.rotation.y = -PI / 2;
    scanPlane.position.y = 7;
    group.add(scanPlane);

    const edgeTex = canvasTexture(128, 32, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let x = 0; x < w; x++) {
        const u = x / (w - 1);
        const a = Math.pow(1 - Math.abs(u * 2 - 1), 2.1);
        ctx.fillStyle = "rgba(242,167,59," + (a * 0.95).toFixed(3) + ")";
        ctx.fillRect(x, 0, 1, h);
      }
    });
    const edgeMat = new T.MeshBasicMaterial({
      map: edgeTex, transparent: true, opacity: 0.4, depthWrite: false,
      side: T.DoubleSide, blending: T.AdditiveBlending, toneMapped: false,
    });
    const scanEdge = new T.Mesh(new T.PlaneGeometry(0.9, 80), edgeMat);
    scanEdge.rotation.x = -PI / 2;
    scanEdge.position.y = 0.035;
    group.add(scanEdge);
    const SWEEP_PERIOD = FLAGS.still ? 68 : 26;
    const SWEEP_OFFSET = FLAGS.still ? 9.5 : 1.5;
    let sweepX = -85;
    function updateScan(t) {
      const f = ((t + SWEEP_OFFSET) % SWEEP_PERIOD) / SWEEP_PERIOD;
      sweepX = -85 + f * 170;
      scanPlane.position.x = sweepX;
      scanEdge.position.x = sweepX;
      const fade = 1 - smooth(78, 85, Math.abs(sweepX));
      scanMat.opacity = 0.045 * fade;
      edgeMat.opacity = 0.16 * fade;
    }

    /* ============================================================
       F · dashed digital-twin envelope
       ============================================================ */
    const EX = 0.55;
    const bx0 = HALL.x0 - EX, bx1 = HALL.x1 + EX, bz0 = HALL.z0 - EX, bz1 = HALL.z1 + EX;
    const by0 = 0.03, by1 = 16.15;
    const boxPts = [];
    const edges = [
      [[bx0, by0, bz0], [bx1, by0, bz0]], [[bx1, by0, bz0], [bx1, by0, bz1]],
      [[bx1, by0, bz1], [bx0, by0, bz1]], [[bx0, by0, bz1], [bx0, by0, bz0]],
      [[bx0, by1, bz0], [bx1, by1, bz0]], [[bx1, by1, bz0], [bx1, by1, bz1]],
      [[bx1, by1, bz1], [bx0, by1, bz1]], [[bx0, by1, bz1], [bx0, by1, bz0]],
      [[bx0, by0, bz0], [bx0, by1, bz0]], [[bx1, by0, bz0], [bx1, by1, bz0]],
      [[bx1, by0, bz1], [bx1, by1, bz1]], [[bx0, by0, bz1], [bx0, by1, bz1]],
    ];
    for (const e of edges) {
      boxPts.push(new T.Vector3(e[0][0], e[0][1], e[0][2]));
      boxPts.push(new T.Vector3(e[1][0], e[1][1], e[1][2]));
    }
    const envelopeGeo = new T.BufferGeometry().setFromPoints(boxPts);
    const envelopeMat = new T.LineDashedMaterial({
      color: AMBER, dashSize: 2.8, gapSize: 2.6, transparent: true, opacity: 0.15,
      depthWrite: false, toneMapped: false,
    });
    const envelope = new T.LineSegments(envelopeGeo, envelopeMat);
    envelope.computeLineDistances();
    group.add(envelope);

    /* ============================================================
       G · station beacons + alarm pings
       ============================================================ */
    const beaconGroup = new T.Group();
    group.add(beaconGroup);
    const beaconGeo = new T.SphereGeometry(0.26, 8, 6);
    const beaconMat = new T.MeshBasicMaterial({ toneMapped: false });
    const beaconMesh = new T.InstancedMesh(beaconGeo, beaconMat, BEACON_CAP);
    beaconMesh.count = 0;
    beaconMesh.frustumCulled = false;
    beaconMesh.visible = false;
    beaconGroup.add(beaconMesh);

    const glowGeo = new T.BufferGeometry();
    const glowPos = new Float32Array(BEACON_CAP * 3);
    const glowCol = new Float32Array(BEACON_CAP * 3);
    glowGeo.setAttribute("position", new T.BufferAttribute(glowPos, 3));
    glowGeo.setAttribute("color", new T.BufferAttribute(glowCol, 3));
    glowGeo.setDrawRange(0, 0);
    const glowMat = new T.PointsMaterial({
      size: 0.92, map: TEX.glowTight, vertexColors: true, transparent: true, opacity: 0.35,
      depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true, toneMapped: false,
    });
    const glowPoints = new T.Points(glowGeo, glowMat);
    glowPoints.frustumCulled = false;
    glowPoints.visible = false;
    beaconGroup.add(glowPoints);

    const STATE_CODE = { run: 1, idle: 2, down: 3 };
    let beaconRefs = [];
    let beaconCount = -1;
    let beaconSig = -1;
    const prevStates = [];
    const _m4 = new T.Matrix4();
    const _q = new T.Quaternion();
    const _s1 = new T.Vector3(1, 1, 1);
    const _p = new T.Vector3();
    const _c = new T.Color();

    function stateColor(st, out) {
      const c = STATE_CODE[st.state] || 1;
      if (c === 3) out.copy(C_RED);
      else if (c === 2) out.copy(C_AMBER);
      else out.copy(C_GREEN);
      return out;
    }
    function computeBeaconSig() {
      let sig = 0;
      for (let i = 0; i < beaconRefs.length; i++) sig = (sig * 7 + (STATE_CODE[beaconRefs[i].state] || 1)) | 0;
      return sig;
    }
    function syncBeacons() {
      beaconRefs = [];
      for (const st of SIM.stations) {
        if (st && st.beacon) {
          beaconRefs.push(st);
          if (beaconRefs.length >= BEACON_CAP) break;
        }
      }
      const n = beaconRefs.length;
      beaconMesh.count = n;
      for (let i = 0; i < n; i++) {
        const b = beaconRefs[i].beacon;
        _p.set(b.x, b.y, b.z);
        _m4.compose(_p, _q, _s1);
        beaconMesh.setMatrixAt(i, _m4);
        stateColor(beaconRefs[i], _c);
        beaconMesh.setColorAt(i, _c);
        glowPos[i * 3] = b.x; glowPos[i * 3 + 1] = b.y; glowPos[i * 3 + 2] = b.z;
        glowCol[i * 3] = _c.r; glowCol[i * 3 + 1] = _c.g; glowCol[i * 3 + 2] = _c.b;
        prevStates[i] = beaconRefs[i].state;
      }
      beaconMesh.instanceMatrix.needsUpdate = true;
      if (beaconMesh.instanceColor) beaconMesh.instanceColor.needsUpdate = true;
      glowGeo.attributes.position.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
      glowGeo.setDrawRange(0, n);
      beaconMesh.visible = n > 0;
      glowPoints.visible = n > 0;
      beaconCount = SIM.stations.length;
      beaconSig = computeBeaconSig();
    }
    function updateBeaconStates() {
      const sig = computeBeaconSig();
      if (sig === beaconSig) return;
      beaconSig = sig;
      for (let i = 0; i < beaconRefs.length; i++) {
        const st = beaconRefs[i];
        stateColor(st, _c);
        beaconMesh.setColorAt(i, _c);
        glowCol[i * 3] = _c.r; glowCol[i * 3 + 1] = _c.g; glowCol[i * 3 + 2] = _c.b;
        if (st.state === "down" && prevStates[i] !== "down") spawnPing(st);
        prevStates[i] = st.state;
      }
      if (beaconMesh.instanceColor) beaconMesh.instanceColor.needsUpdate = true;
      glowGeo.attributes.color.needsUpdate = true;
    }

    /* ---------- alarm ping: billboard ring + floor ring, shared geo */
    const PING_N = 8;
    const pingGeo = new T.BufferGeometry();
    const pingCount = PING_N * 4;
    const pingCenter = new Float32Array(pingCount * 3);
    const pingStart = new Float32Array(pingCount);
    const pingColor = new Float32Array(pingCount * 3);
    const pingCorner = new Float32Array(pingCount * 2);
    const pingIndex = [];
    for (let s = 0; s < PING_N; s++) {
      const b = s * 4;
      const corners = [-1, -1, 1, -1, 1, 1, -1, 1];
      for (let k = 0; k < 4; k++) {
        pingCorner[(b + k) * 2] = corners[k * 2];
        pingCorner[(b + k) * 2 + 1] = corners[k * 2 + 1];
        pingStart[b + k] = -9999;
        pingColor[(b + k) * 3] = C_RED.r;
        pingColor[(b + k) * 3 + 1] = C_RED.g;
        pingColor[(b + k) * 3 + 2] = C_RED.b;
      }
      pingIndex.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    pingGeo.setAttribute("position", new T.Float32BufferAttribute(new Float32Array(pingCount * 3), 3));
    pingGeo.setAttribute("aCenter", new T.Float32BufferAttribute(pingCenter, 3));
    pingGeo.setAttribute("aStart", new T.Float32BufferAttribute(pingStart, 1));
    pingGeo.setAttribute("aColor", new T.Float32BufferAttribute(pingColor, 3));
    pingGeo.setAttribute("aCorner", new T.Float32BufferAttribute(pingCorner, 2));
    pingGeo.setIndex(pingIndex);
    const PING_VERT = @@BT@@
      attribute vec3 aCenter;
      attribute vec2 aCorner;
      attribute float aStart;
      attribute vec3 aColor;
      uniform float uTime;
      varying vec2 vC;
      varying float vAge;
      varying vec3 vCol;
      void main() {
        float age = clamp((uTime - aStart) / 2.3, 0.0, 1.0);
        vAge = age;
        vC = aCorner;
        vCol = aColor;
        vec4 mv = viewMatrix * vec4(aCenter, 1.0);
        mv.xy += aCorner * mix(1.0, 4.6, age);
        gl_Position = projectionMatrix * mv;
      }
    @@BT@@;
    const pingFrag = @@BT@@
      precision highp float;
      varying vec2 vC;
      varying float vAge;
      varying vec3 vCol;
      void main() {
        float r = length(vC);
        float ring = smoothstep(0.58, 0.78, r) * (1.0 - smoothstep(0.90, 1.0, r));
        float a = ring * (1.0 - vAge) * (1.0 - vAge * 0.35);
        if (a < 0.004) discard;
        gl_FragColor = vec4(vCol * (0.9 + 1.9 * (1.0 - vAge)), a);
      }
    @@BT@@;
    const pingBillboardMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: PING_VERT, fragmentShader: pingFrag,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    const pingFloorMat = new T.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: @@BT@@
        attribute vec3 aCenter;
        attribute vec2 aCorner;
        attribute float aStart;
        attribute vec3 aColor;
        uniform float uTime;
        varying vec2 vC;
        varying float vAge;
        varying vec3 vCol;
        void main() {
        float age = clamp((uTime - aStart) / 2.3, 0.0, 1.0);
        vAge = age;
        vC = aCorner;
        vCol = aColor;
        vec3 wp = vec3(aCenter.x, 0.09, aCenter.z)
          + vec3(aCorner.x * mix(1.2, 6.0, age), 0.0, aCorner.y * mix(1.2, 6.0, age));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
      @@BT@@,
      fragmentShader: pingFrag,
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
    });
    const pingBillboard = new T.Mesh(pingGeo, pingBillboardMat);
    pingBillboard.frustumCulled = false;
    pingBillboard.visible = false;
    group.add(pingBillboard);
    const pingFloor = new T.Mesh(pingGeo, pingFloorMat);
    pingFloor.frustumCulled = false;
    pingFloor.visible = false;
    group.add(pingFloor);
    let pingCursor = 0;
    function spawnPing(st) {
      const b = st.beacon;
      if (!b) return;
      const slot = pingCursor++ % PING_N;
      const base = slot * 4;
      const t = SIM.t;
      for (let k = 0; k < 4; k++) {
        const vi = base + k;
        pingStart[vi] = t;
        pingCenter[vi * 3] = b.x;
        pingCenter[vi * 3 + 1] = b.y;
        pingCenter[vi * 3 + 2] = b.z;
        pingColor[vi * 3] = C_RED.r;
        pingColor[vi * 3 + 1] = C_RED.g;
        pingColor[vi * 3 + 2] = C_RED.b;
      }
      pingGeo.attributes.aStart.needsUpdate = true;
      pingGeo.attributes.aCenter.needsUpdate = true;
      pingGeo.attributes.aColor.needsUpdate = true;
      pingBillboard.visible = true;
      pingFloor.visible = true;
    }
    function updatePings(t) {
      pingBillboardMat.uniforms.uTime.value = t;
      pingFloorMat.uniforms.uTime.value = t;
      let active = false;
      for (let s = 0; s < PING_N; s++) {
        if (pingStart[s * 4] > -1000 && t - pingStart[s * 4] < 2.4) { active = true; break; }
      }
      pingBillboard.visible = active;
      pingFloor.visible = active;
    }

    /* ============================================================
       H · focus reticle
       ============================================================ */
    const RET_SEGS = 11;
    const retGeo = new T.BufferGeometry();
    const retPos = new Float32Array(RET_SEGS * 2 * 3);
    retGeo.setAttribute("position", new T.BufferAttribute(retPos, 3));
    const retMat = new T.LineBasicMaterial({
      color: AMBER, transparent: true, opacity: 0.95, depthWrite: false,
      toneMapped: false, blending: T.AdditiveBlending,
    });
    const reticle = new T.LineSegments(retGeo, retMat);
    reticle.frustumCulled = false;
    reticle.visible = false;
    group.add(reticle);
    function fillReticle(ax, ay, az) {
      let o = 0;
      const half = 1.8, arm = 0.7, y = 0.09;
      function seg(x1, y1, z1, x2, y2, z2) {
        retPos[o++] = x1; retPos[o++] = y1; retPos[o++] = z1;
        retPos[o++] = x2; retPos[o++] = y2; retPos[o++] = z2;
      }
      for (let sx = -1; sx <= 1; sx += 2) {
        for (let sz = -1; sz <= 1; sz += 2) {
          const px = sx * half, pz = sz * half;
          seg(px, y, pz, px - sx * arm, y, pz);
          seg(px, y, pz, px, y, pz - sz * arm);
        }
      }
      const ay2 = Math.max(0.6, ay);
      seg(0, y, 0, 0, ay2, 0);              // tether
      seg(-0.35, ay2, 0, 0.35, ay2, 0);     // anchor cross x
      seg(0, ay2, -0.35, 0, ay2, 0.35);     // anchor cross z
      retGeo.attributes.position.needsUpdate = true;
      retGeo.computeBoundingSphere();
      reticle.position.set(ax, 0, az);
      reticle.visible = true;
    }
    const focusSprite = glowSprite(group, AMBER, 0.85, 0.9);
    focusSprite.visible = false;

    /* ============================================================
       B · DOM labels
       ============================================================ */
    ensureStyle("df-data-css", LABEL_CSS);
    const labelsRoot = byId("labels");
    const labels = [];
    const zoneLabels = [];
    let machineLabel = null;

    function makeLabel(kind, inner, width) {
      const el = document.createElement("div");
      el.className = "df-lbl df-" + kind;
      el.innerHTML = '<div class="df-card">' + inner + "</div>";
      labelsRoot.appendChild(el);
      const card = el.firstChild;
      const lb = {
        kind: kind, el: el, card: card, id: "",
        ax: 0, ay: 0, w: width, h: 0, lead: 16,
        shown: false, cls: "", anchor: null,
      };
      labels.push(lb);
      return lb;
    }
    function zoneLabelHTML(z) {
      return '<div class="df-l1"><span class="df-idx">' + z.id + '</span>' +
        '<span class="df-zh">' + z.zh + '</span><span class="df-st"></span></div>' +
        '<div class="df-l2"><span class="df-en">' + z.short + '</span>' +
        '<span class="df-util"><b>--</b>%</span><span class="df-wip">WIP <b>0</b></span></div>';
    }
    for (const id of PROD_ZONES) {
      const z = zoneById(id);
      const lb = makeLabel("zone", zoneLabelHTML(z), 164);
      lb.id = id;
      // callout anchors: inner / south corner of each footprint
      const cx = (z.x0 + z.x1) / 2;
      const ax = cx > 0 ? z.x0 : z.x1;
      lb.anchor = { x: ax + (cx > 0 ? 2.4 : -2.4), y: 9.8, z: z.z1 - 2.2 };
      if (id === "Z04") lb.anchor = { x: z.x1 - 2.4, y: 9.8, z: z.z1 - 2.2 };
      if (id === "Z06") lb.anchor = { x: z.x0 - 0.8, y: 9.2, z: z.z0 + 0.6 };
      lb.centerAnchor = { x: (z.x0 + z.x1) / 2, y: 10.4, z: (z.z0 + z.z1) / 2 };
      lb.utilEl = lb.card.querySelector(".df-util b");
      lb.wipEl = lb.card.querySelector(".df-wip b");
      lb.stEl = lb.card.querySelector(".df-st");
      lb._util = -1; lb._wip = -1; lb._tone = "";
      zoneLabels.push(lb);
    }

    machineLabel = makeLabel("mach",
      '<div class="df-l1"><span class="df-idx df-mid">—</span>' +
      '<span class="df-zh df-mname">—</span><span class="df-st"></span></div>' +
      '<div class="df-l2"><span class="df-en df-meta">—</span>' +
      '<span class="df-util"><b class="df-mutil">--</b>%</span>' +
      '<span class="df-wip df-mstate">—</span></div>', 176);
    machineLabel.midEl = machineLabel.card.querySelector(".df-mid");
    machineLabel.nameEl = machineLabel.card.querySelector(".df-mname");
    machineLabel.metaEl = machineLabel.card.querySelector(".df-meta");
    machineLabel.stateEl = machineLabel.card.querySelector(".df-mstate");
    machineLabel.utilEl = machineLabel.card.querySelector(".df-mutil");
    machineLabel.stEl = machineLabel.card.querySelector(".df-st");
    machineLabel._sig = "";

    // measure card heights once
    for (const lb of labels) lb.h = lb.card.offsetHeight || (lb.kind === "mach" ? 42 : 40);

    const hudBoxes = [];
    function collectHud(W, H) {
      hudBoxes.length = 0;
      const inspecting = document.body && document.body.classList.contains("inspecting");
      hudBoxes.push(18, 112, inspecting ? 386 : 300, 650);
      hudBoxes.push(W - 350, 62, W - 12, Math.min(H - 126, 800));
      hudBoxes.push(W * 0.5 - 300, H - 116, W * 0.5 + 300, H - 4);
      hudBoxes.push(0, 0, W, 80);
      if (W > 1020) hudBoxes.push(18, H - 176, 348, H - 10);
      hudBoxes.push(W - 336, H - 128, W - 8, H - 6);
    }
    const placed = [];
    function rectHitsHud(x0, y0, x1, y1) {
      for (let i = 0; i < hudBoxes.length; i += 4) {
        if (x0 < hudBoxes[i + 2] && x1 > hudBoxes[i] && y0 < hudBoxes[i + 3] && y1 > hudBoxes[i + 1]) return true;
      }
      return false;
    }
    function rectHitsPlaced(x0, y0, x1, y1) {
      for (let i = 0; i < placed.length; i += 4) {
        if (x0 < placed[i + 2] + 10 && x1 > placed[i] - 10 && y0 < placed[i + 3] + 10 && y1 > placed[i + 1] - 10) return true;
      }
      return false;
    }
    function setShown(lb, on) {
      if (lb.shown === on) return;
      lb.shown = on;
      lb.el.classList.toggle("show", on);
    }
    function setTone(lb, tone) {
      if (lb._tone === tone) return;
      lb._tone = tone;
      lb.el.classList.toggle("down", tone === "down");
      lb.el.classList.toggle("idle", tone === "idle");
      lb.el.classList.toggle("hot", tone === "hot");
    }
    const ATTEMPTS = [[16, 0], [58, 0], [16, -200], [16, 200]];
    function tryPlace(lb, ax, ay, W, H) {
      lb.ax = ax; lb.ay = ay;
      const w = lb.w, h = lb.h;
      for (let k = 0; k < ATTEMPTS.length; k++) {
        const lead = ATTEMPTS[k][0], dx = ATTEMPTS[k][1];
        const cx = ax + dx;
        const x0 = cx - w * 0.5, x1 = cx + w * 0.5;
        const y1 = ay - lead, y0 = y1 - h;
        if (x0 < 6 || x1 > W - 6) continue;
        if (y0 < 84 || y1 > H - 6) continue;
        if (rectHitsHud(x0, y0, x1, y1)) continue;
        if (rectHitsPlaced(x0, y0, x1, y1)) continue;
        placed.push(x0, y0, x1, y1);
        const ll = Math.sqrt(dx * dx + lead * lead);
        const la = Math.atan2(dx, lead) * 180 / Math.PI;
        const st = lb.el.style;
        st.setProperty("--lead", lead + "px");
        st.setProperty("--dx", dx + "px");
        st.setProperty("--ll", ll.toFixed(1) + "px");
        st.setProperty("--la", la.toFixed(2) + "deg");
        lb.lead = lead; lb.dx = dx;
        st.transform = "translate3d(" + Math.round(ax) + "px," + Math.round(ay) + "px,0)";
        return true;
      }
      return false;
    }
    function updateZoneLabel(lb) {
      const zs = SIM.zones[lb.id];
      if (!zs) return;
      const util = Math.round(clamp(zs.util || 0, 0, 1) * 100);
      const wip = Math.round(zs.wip || 0);
      if (util !== lb._util) { lb._util = util; lb.utilEl.textContent = util; }
      if (wip !== lb._wip) { lb._wip = wip; lb.wipEl.textContent = wip; }
      const tone = zs.anyDown ? "down" : util < 50 ? "idle" : "";
      if (lb._tone !== "hot") setTone(lb, tone);
    }
    function updateMachineLabel() {
      const m = machineLabel;
      if (!focusObj) { setShown(m, false); return; }
      const st = focusObj.id ? SIM.station(focusObj.id) : null;
      const sig = (focusObj.id || "") + "|" + (st ? st.state + "|" + Math.round((st.util || 0) * 100) : "");
      if (sig !== m._sig) {
        m._sig = sig;
        m.midEl.textContent = focusObj.id || focusObj.kind || "UNIT";
        m.nameEl.textContent = focusObj.title || focusObj.id || "—";
        m.metaEl.textContent = (String(focusObj.kind || "unit").toUpperCase()) + (focusObj.zone ? " · " + focusObj.zone : "");
        m.stateEl.textContent = st ? String(st.state).toUpperCase() : "TRACKED";
        const u = st ? Math.round((st.util || 0) * 100) : 0;
        m.utilEl.textContent = u;
        m.el.classList.remove("down", "idle");
        if (st && st.state === "down") m.el.classList.add("down");
        else if (st && st.state === "idle") m.el.classList.add("idle");
      }
      if (!focusObj.anchor) { setShown(m, false); return; }
      const a = focusObj.anchor;
      const pr = projectPoint(a.x, a.y, a.z);
      if (!pr.ok || pr.d > 380) { setShown(m, false); return; }
      setShown(m, tryPlace(m, pr.x, pr.y, window.innerWidth, window.innerHeight));
    }

    function updateLabels(t, dt) {
      if (!labelsRoot) return;
      const on = dataOn && labelsOn && window.innerWidth >= 900;
      if (!on) {
        for (const lb of labels) setShown(lb, false);
        return;
      }
      camera.updateMatrixWorld();
      const W = window.innerWidth, H = window.innerHeight;
      collectHud(W, H);
      placed.length = 0;
      for (const lb of zoneLabels) updateZoneLabel(lb);
      updateMachineLabel();

      // zone labels: place low anchors first so they keep short leaders
      const order = [];
      for (const lb of zoneLabels) {
        const z = zoneById(lb.id);
        const ccx = (z.x0 + z.x1) / 2, ccz = (z.z0 + z.z1) / 2;
        v3b.set(ccx, 9.8, ccz);
        const near = camera.position.distanceToSquared(v3b) < 140 * 140;
        const a = near ? lb.centerAnchor : lb.anchor;
        const pr = projectPoint(a.x, a.y, a.z);
        lb._ok = pr.ok && pr.d < 380;
        lb._px = pr.x; lb._py = pr.y;
        if (lb._ok) order.push(lb);
      }
      order.sort((a, b) => b._py - a._py);
      for (const lb of order) {
        let ok = false;
        if (focusObj) {
          lb.el.classList.add("dim");
          if (focusObj.zone === lb.id) lb.el.classList.remove("dim");
        } else {
          lb.el.classList.remove("dim");
        }
        if (lb._ok) ok = tryPlace(lb, lb._px, lb._py, W, H);
        setShown(lb, ok);
      }
      // zone focus tone
      for (const lb of zoneLabels) {
        if (focusZone === lb.id) setTone(lb, "hot");
        else if (lb._tone === "hot") setTone(lb, "");
      }
    }

    /* ============================================================
       DATA API
       ============================================================ */
    const api = {
      ready: true,
      setDataLayer: function (on) {
        dataOn = !!on;
        group.visible = dataOn;
        if (!dataOn) {
          for (const lb of labels) setShown(lb, false);
          reticle.visible = false;
          focusSprite.visible = false;
        }
      },
      setLabels: function (on) {
        labelsOn = !!on;
        if (!labelsOn) for (const lb of labels) setShown(lb, false);
      },
      focus: function (pick) {
        if (!pick) { api.clearFocus(); return; }
        if (pick.kind === "zone" || (!pick.anchor && (pick.zone || PROD_ZONES.indexOf(pick.id) >= 0))) {
          const id = pick.zone || pick.id;
          focusObj = null;
          focusZone = PROD_ZONES.indexOf(id) >= 0 ? id : null;
          reticle.visible = false;
          focusSprite.visible = false;
          applyFocusZoneGeo();
          paintOutline();
          return;
        }
        // machine / AGV / truck focus
        focusZone = pick.zone && PROD_ZONES.indexOf(pick.zone) >= 0 ? pick.zone : null;
        let anchor = pick.anchor;
        if (!anchor && pick.zone) {
          const z = zoneById(pick.zone);
          anchor = { x: (z.x0 + z.x1) / 2, y: 8.5, z: (z.z0 + z.z1) / 2 };
        }
        focusObj = {
          id: pick.id || pick.kind || "unit",
          kind: pick.kind || "unit",
          title: pick.title || pick.id || "",
          zone: pick.zone || null,
          anchor: anchor ? { x: anchor.x, y: anchor.y, z: anchor.z } : null,
        };
        applyFocusZoneGeo();
        paintOutline();
        if (focusObj.anchor) {
          fillReticle(focusObj.anchor.x, focusObj.anchor.y, focusObj.anchor.z);
          focusSprite.position.set(focusObj.anchor.x, focusObj.anchor.y, focusObj.anchor.z);
          focusSprite.visible = true;
        } else {
          reticle.visible = false;
          focusSprite.visible = false;
        }
      },
      clearFocus: function () {
        focusZone = null;
        focusObj = null;
        focusZoneMesh.visible = false;
        reticle.visible = false;
        focusSprite.visible = false;
        setShown(machineLabel, false);
        paintOutline();
        for (const lb of zoneLabels) {
          lb.el.classList.remove("dim");
          if (lb._tone === "hot") setTone(lb, "");
        }
      },
    };
    window.DATA = api;

    /* ============================================================
       TICKS
       ============================================================ */
    const _sam = new T.Vector3();
    function updateScene(t, dt) {
      if (!dataOn) return;
      energyMat.uniforms.uTime.value = t;
      // energy pulses
      for (let i = 0; i < PROD_ZONES.length; i++) {
        const path = branchPaths[i];
        const s = (t * branchSpeed[i] + pulseOffset[i] * 13.0) % path.total;
        samplePath(path, s, _sam);
        pulsePosArr[i * 3] = _sam.x;
        pulsePosArr[i * 3 + 1] = _sam.y;
        pulsePosArr[i * 3 + 2] = _sam.z;
      }
      {
        const s = (t * 24.0 + 4.0) % trunkPath.total;
        samplePath(trunkPath, s, _sam);
        pulsePosArr[18] = _sam.x; pulsePosArr[19] = _sam.y; pulsePosArr[20] = _sam.z;
        const s2 = trunkPath.total - ((t * 24.0 + 42.0) % trunkPath.total);
        samplePath(trunkPath, s2, _sam);
        pulsePosArr[21] = _sam.x; pulsePosArr[22] = _sam.y; pulsePosArr[23] = _sam.z;
      }
      pulseGeo.attributes.position.needsUpdate = true;

      // material flow dots
      for (let i = 0; i < AGV_DOTS; i++) {
        const s = (flowOffsets[i] + t * 3.1) % routeTotal;
        sampleRoute(s, _sam);
        flowPos[i * 3] = _sam.x; flowPos[i * 3 + 1] = 0.18; flowPos[i * 3 + 2] = _sam.z;
      }
      for (let i = 0; i < ASM_DOTS; i++) {
        const line = i % 2;
        const x0 = 18, x1 = 62;
        const off = flowOffsets[AGV_DOTS + i];
        const s = (off + t * 2.3) % (x1 - x0);
        flowPos[(AGV_DOTS + i) * 3] = x0 + s;
        flowPos[(AGV_DOTS + i) * 3 + 1] = 1.9;
        flowPos[(AGV_DOTS + i) * 3 + 2] = line === 0 ? 12 : 28;
      }
      flowGeo.attributes.position.needsUpdate = true;

      // station beacons
      if (SIM.stations.length !== beaconCount) syncBeacons();
      else updateBeaconStates();
      glowMat.opacity = 0.32 + 0.06 * Math.sin(t * 3.1); // subtle breathing
      updatePings(t);

      // scan sweep
      updateScan(t);

      // focus pulse
      if (focusZoneMesh.visible) focusZoneMat.opacity = 0.22 + 0.08 * Math.sin(t * 2.2);
      if (reticle.visible) {
        retMat.opacity = 0.6 + 0.3 * Math.sin(t * 2.4 + 1.2);
        reticle.rotation.y = t * 0.35;
      }
      if (focusSprite.visible) {
        focusSprite.material.opacity = 0.35 + 0.3 * (0.5 + 0.5 * Math.sin(t * 3.1));
      }
    }

    let _labelAcc = 0;
    function updateLabelsTick(t, dt) {
      _labelAcc += dt;
      if (_labelAcc < 0.05) return;
      _labelAcc = 0;
      updateLabels(t, dt);
    }

    syncBeacons();
    addTick(updateScene);
    addTickLate(updateLabelsTick);

    // respect initial URL flags / boot state
    group.visible = dataOn;
    return api;
  };
})();
