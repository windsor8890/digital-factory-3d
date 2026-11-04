/* ============================================================
   40 · process — Z02 冲压线 PRESS LINE · Z03 焊装车间 BODY SHOP
                 Z04 涂装车间 PAINT SHOP · overhead body conveyor
   stations: PR-01..04 servo presses · XF-01 gantry transfer
             WB-01..04 weld cell groups · PT-01 paint booth · OV-01 oven
   ============================================================ */
(function () {
  "use strict";

  const PI2 = PI * 0.5;
  const ROOT = new T.Group();
  const ST = new T.Group();
  ROOT.add(ST);

  /* ---------------- scratch (never allocate in ticks) ---------------- */
  const _m0 = new T.Matrix4();
  const _m1 = new T.Matrix4();
  const _m2 = new T.Matrix4();
  const _v0 = new T.Vector3();
  const _v1 = new T.Vector3();
  const _q0 = new T.Quaternion();
  const _e0 = new T.Euler();
  const _c0 = new T.Color();
  const _zAxis = new T.Vector3(0, 0, 1);
  const _yAxis = new T.Vector3(0, 1, 0);
  const _xAxis = new T.Vector3(1, 0, 0);

  /* ---------------- static geometry helpers ---------------- */
  function b(w, h, d, x, y, z, mat, o) { return addBox(ST, w, h, d, x, y, z, mat, o); }
  function bb(w, h, d, x, by, z, mat, o) { return addBoxBase(ST, w, h, d, x, by, z, mat, o); }
  function cyb(rt, rb, h, seg, x, by, z, mat, o) { return addCylinderBase(ST, rt, rb, h, seg, x, by, z, mat, o); }
  function cyc(rt, rb, h, seg, x, y, z, mat, o) { return addCylinder(ST, rt, rb, h, seg, x, y, z, mat, o); }
  function xz(w, d, x, y, z, mat, o) { return addPlaneXZ(ST, w, d, x, y, z, mat, o); }
  function pl(w, h, x, y, z, mat, o) { return addPlane(ST, w, h, x, y, z, mat, o); }

  function beam(a, c, w, h, mat, o) {
    const dx = c[0] - a[0], dy = c[1] - a[1], dz = c[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return null;
    const m = new T.Mesh(new T.BoxGeometry(w, h, len), mat);
    m.position.set((a[0] + c[0]) / 2, (a[1] + c[1]) / 2, (a[2] + c[2]) / 2);
    _v0.set(dx / len, dy / len, dz / len);
    m.quaternion.setFromUnitVectors(_zAxis, _v0);
    m.castShadow = o && o.cast === false ? false : true;
    m.receiveShadow = true;
    ST.add(m);
    return m;
  }

  function hazardBand(cx, cz, len, width, alongX, y) {
    const yy = y === undefined ? 0.014 : y;
    const g = new T.PlaneGeometry(len, width);
    const uv = g.attributes.uv;
    const reps = Math.max(2, Math.round(len / 0.62));
    const vrep = Math.max(0.6, width / 0.62);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * reps, uv.getY(i) * vrep);
    _m0.makeRotationX(-PI2);
    if (!alongX) { _m1.makeRotationY(PI2); _m0.premultiply(_m1); }
    g.applyMatrix4(_m0);
    const m = new T.Mesh(g, M_HAZ);
    m.position.set(cx, yy, cz);
    m.castShadow = false; m.receiveShadow = true;
    ST.add(m);
    return m;
  }

  function floorLine(x0, z0, x1, z1, width, mat) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.05) return null;
    return b(len, 0.016, width, (x0 + x1) / 2, 0.011, (z0 + z1) / 2, mat,
      { cast: false, rotY: Math.atan2(-dz, dx) });
  }

  /* ---------------- instanced helpers ---------------- */
  function geoBox(w, h, d, x, y, z, rx, ry, rz) {
    const g = new T.BoxGeometry(w, h, d);
    if (rx || ry || rz) { _e0.set(rx || 0, ry || 0, rz || 0); _m0.makeRotationFromEuler(_e0); g.applyMatrix4(_m0); }
    if (x || y || z) g.translate(x || 0, y || 0, z || 0);
    return g;
  }
  function geoCyl(rt, rb, h, seg, x, y, z, rx, ry, rz) {
    const g = new T.CylinderGeometry(rt, rb, h, seg || 10);
    if (rx || ry || rz) { _e0.set(rx || 0, ry || 0, rz || 0); _m0.makeRotationFromEuler(_e0); g.applyMatrix4(_m0); }
    if (x || y || z) g.translate(x || 0, y || 0, z || 0);
    return g;
  }
  function geoMerge(list) { return mergeGeoms(list); }

  function inst(geo, mat, n, o) {
    const im = new T.InstancedMesh(geo, mat, n);
    im.castShadow = o && o.cast === false ? false : true;
    im.receiveShadow = true;
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    im.frustumCulled = false;
    ROOT.add(im);
    return im;
  }

  /* ---------------- materials ---------------- */
  let M_SIGN = null, M_BOOTH_LIGHT = null, M_OVEN_GLOW = null, M_OIL = null, M_HAZ = null;
  let SIGN_TEX = null;
  const SIGN_W = 2048, SIGN_H = 1024;
  const SCELL = {};

  function makeMaterials() {
    M_OIL = new T.MeshStandardMaterial({
      map: TEX.oilStain, transparent: true, opacity: 0.8, depthWrite: false,
      roughness: 0.92, metalness: 0.0, polygonOffset: true, polygonOffsetFactor: -1,
    });
    const hzTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#e2a92b"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#202226"; ctx.lineWidth = 26;
      for (let i = -h; i < w + h; i += 64) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke(); }
    });
    M_HAZ = new T.MeshStandardMaterial({
      map: hzTex, roughness: 0.62, metalness: 0.08,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    M_BOOTH_LIGHT = new T.MeshStandardMaterial({
      color: 0x1b1712, emissive: 0xffe9c2, emissiveIntensity: 2.3, roughness: 0.5, metalness: 0.05,
    });
    M_OVEN_GLOW = new T.MeshStandardMaterial({
      color: 0x24150a, emissive: 0xf2a73b, emissiveIntensity: 2.6, roughness: 0.5, metalness: 0.0,
    });
  }

  function oil(x, z, s, r) {
    const m = addPlaneXZ(ST, s, s, x, 0.022, z, M_OIL, { receive: true, rotY: r || 0 });
    m.castShadow = false; m.renderOrder = 1;
    return m;
  }

  /* ---------------- sign atlas ---------------- */
  function buildSignAtlas() {
    const defs = [
      ["press", 0, 0, 1024, 256, "冲压线 · PRESS LINE", "Z02 · SERVO TANDEM 4 PRESSES", 1],
      ["body", 1024, 0, 1024, 256, "焊装车间 · BODY SHOP", "Z03 · 8 ROBOT WELD CELLS", 1],
      ["paint", 0, 256, 1024, 256, "涂装车间 · PAINT SHOP", "Z04 · BOOTH / OVEN / AHU", 1],
      ["conv", 1024, 256, 1024, 256, "车身输送 · BODY CONVEYOR", "→ FINAL ASSEMBLY · Z05", 1],
    ];
    const tags = [
      "PR-01|伺服压力机", "PR-02|伺服压力机", "PR-03|伺服压力机", "PR-04|伺服压力机",
      "WB-01|焊装单元", "WB-02|焊装单元", "WB-03|焊装单元", "WB-04|焊装单元",
      "WB-05|焊装单元", "WB-06|焊装单元", "WB-07|焊装单元", "WB-08|焊装单元",
      "XF-01|搬运机械手", "PT-01|涂装室", "OV-01|烘干炉", "Z03|焊装车间",
    ];
    for (let i = 0; i < tags.length; i++) {
      const col = i % 8, row = (i / 8) | 0;
      const parts = tags[i].split("|");
      defs.push(["tag_" + parts[0], col * 256, 512 + row * 128, 256, 128, parts[0], parts[1], 0]);
    }
    const tex = canvasTexture(SIGN_W, SIGN_H, (ctx, w, h) => {
      ctx.fillStyle = "#111417"; ctx.fillRect(0, 0, w, h);
      for (const d of defs) {
        const key = d[0], x = d[1], y = d[2], cw = d[3], ch = d[4], title = d[5], sub = d[6], wide = d[7];
        ctx.fillStyle = "#1a1e21"; ctx.fillRect(x + 3, y + 3, cw - 6, ch - 6);
        ctx.strokeStyle = wide ? "rgba(242,167,59,0.62)" : "rgba(242,167,59,0.42)";
        ctx.lineWidth = wide ? 4 : 3;
        ctx.strokeRect(x + 9, y + 9, cw - 18, ch - 18);
        ctx.fillStyle = "rgba(242,167,59,0.85)";
        ctx.fillRect(x + 9, y + 9, wide ? 10 : 7, ch - 18);
        ctx.textBaseline = "middle";
        if (wide) {
          ctx.fillStyle = "#ece7dd";
          ctx.font = "600 " + Math.round(ch * 0.36) + "px 'Bahnschrift','Microsoft YaHei UI','Segoe UI',sans-serif";
          ctx.fillText(title, x + cw * 0.055, y + ch * 0.40);
          ctx.fillStyle = "rgba(242,167,59,0.88)";
          ctx.font = "500 " + Math.round(ch * 0.155) + "px 'Cascadia Mono',Consolas,monospace";
          ctx.fillText(sub, x + cw * 0.057, y + ch * 0.75);
        } else {
          ctx.fillStyle = "#ece7dd";
          ctx.font = "600 " + Math.round(ch * 0.44) + "px 'Bahnschrift','Microsoft YaHei UI','Segoe UI',sans-serif";
          ctx.fillText(title, x + cw * 0.09, y + ch * 0.40);
          ctx.fillStyle = "rgba(242,167,59,0.85)";
          ctx.font = "500 " + Math.round(ch * 0.25) + "px 'Microsoft YaHei UI','Segoe UI',sans-serif";
          ctx.fillText(sub, x + cw * 0.09, y + ch * 0.74);
        }
        SCELL[key] = { x: x, y: y, w: cw, h: ch };
      }
    });
    SIGN_TEX = tex;
    M_SIGN = new T.MeshStandardMaterial({
      map: tex, roughness: 0.52, metalness: 0.14,
      emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.4,
    });
  }

  function signPlane(key, w, h, x, y, z, rotY) {
    const c = SCELL[key];
    if (!c) return null;
    const g = new T.PlaneGeometry(w, h);
    const uv = g.attributes.uv;
    const u0 = c.x / SIGN_W, u1 = (c.x + c.w) / SIGN_W;
    const v1 = 1 - c.y / SIGN_H, v0 = 1 - (c.y + c.h) / SIGN_H;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    const m = new T.Mesh(g, M_SIGN);
    m.position.set(x, y, z);
    if (rotY) m.rotation.y = rotY;
    m.castShadow = false; m.receiveShadow = false;
    ST.add(m);
    return m;
  }

  function signBoard(key, w, h, x, y, z, rotY) {
    const r = rotY || 0;
    b(w + 0.12, h + 0.12, 0.09, x, y, z, MAT.machineDark, { cast: false, rotY: r });
    signPlane(key, w, h, x + Math.sin(r) * 0.055, y, z + Math.cos(r) * 0.055, r);
  }

  /* ---------------- stations / beacons ---------------- */
  const STATIONS = [];
  function regStation(id, zone, name, kind, bx, by, bz, cycle) {
    const st = SIM.registerStation({
      id: id, zone: zone, name: name, kind: kind, cycle: cycle || SIM.takt,
      beacon: { x: bx, y: by, z: bz },
    });
    STATIONS.push(st);
    return st;
  }

  function beaconPost(x, baseY, z, h) {
    const hh = h === undefined ? 0.24 : h;
    cyb(0.11, 0.13, 0.05, 8, x, baseY, z, MAT.galv, { cast: false });
    cyb(0.055, 0.075, hh, 8, x, baseY + 0.05, z, MAT.machineDark, { cast: false });
  }

  let BEACON_MESH = null;
  const BEACON_STATE = [];
  let GLOW_GEO = null, GLOW_MAT = null, GLOW_PTS = null, GLOW_COL = null, GLOW_POS = null;
  let FLASH_BASE = 0;
  const ROBOTS = [];
  const FLASH_N = 8;

  function initBeaconVisuals() {
    const n = STATIONS.length;
    const geo = new T.SphereGeometry(0.085, 8, 6);
    const mat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    BEACON_MESH = new T.InstancedMesh(geo, mat, n);
    BEACON_MESH.frustumCulled = false;
    BEACON_MESH.instanceColor = new T.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    ROOT.add(BEACON_MESH);
    for (let i = 0; i < n; i++) {
      const st = STATIONS[i];
      BEACON_STATE[i] = "";
      _c0.set(0x9ed6b4);
      BEACON_MESH.setColorAt(i, _c0);
    }

    // one additive points cloud: station beacons + weld flashes
    const total = n + FLASH_N;
    GLOW_POS = new Float32Array(total * 3);
    GLOW_COL = new Float32Array(total * 3);
    for (let i = 0; i < n; i++) {
      GLOW_POS[i * 3] = STATIONS[i].beacon.x;
      GLOW_POS[i * 3 + 1] = STATIONS[i].beacon.y;
      GLOW_POS[i * 3 + 2] = STATIONS[i].beacon.z;
    }
    FLASH_BASE = n;
    for (let i = 0; i < FLASH_N; i++) GLOW_POS[(n + i) * 3 + 1] = -999;
    GLOW_GEO = new T.BufferGeometry();
    GLOW_GEO.setAttribute("position", new T.BufferAttribute(GLOW_POS, 3).setUsage(T.DynamicDrawUsage));
    GLOW_GEO.setAttribute("color", new T.BufferAttribute(GLOW_COL, 3).setUsage(T.DynamicDrawUsage));
    GLOW_MAT = new T.PointsMaterial({
      size: 1.5, map: TEX.glow, vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false,
    });
    GLOW_PTS = new T.Points(GLOW_GEO, GLOW_MAT);
    GLOW_PTS.frustumCulled = false;
    ROOT.add(GLOW_PTS);
  }

  const _beaconCol = { run: 0x9ed6b4, idle: 0xf2a73b, down: 0xff5638 };
  function updateBeacons() {
    let dirty = false;
    for (let i = 0; i < STATIONS.length; i++) {
      const st = STATIONS[i];
      if (BEACON_STATE[i] === st.state) continue;
      BEACON_STATE[i] = st.state;
      dirty = true;
      const hex = _beaconCol[st.state] || 0x9ed6b4;
      _c0.set(hex);
      BEACON_MESH.setColorAt(i, _c0);
      _c0.set(hex);
      GLOW_COL[i * 3] = _c0.r * 1.5; GLOW_COL[i * 3 + 1] = _c0.g * 1.5; GLOW_COL[i * 3 + 2] = _c0.b * 1.5;
    }
    if (dirty) {
      if (BEACON_MESH.instanceColor) BEACON_MESH.instanceColor.needsUpdate = true;
      GLOW_GEO.attributes.color.needsUpdate = true;
    }
  }

  /* ---------------- weld sparks ---------------- */
  const SPARK_MAX = 160;
  const spPos = new Float32Array(SPARK_MAX * 3);
  const spCol = new Float32Array(SPARK_MAX * 3);
  const spVel = new Float32Array(SPARK_MAX * 3);
  const spLife = new Float32Array(SPARK_MAX);
  let spHead = 0, spGeo = null, spPts = null;

  function initSparks() {
    for (let i = 0; i < SPARK_MAX; i++) spPos[i * 3 + 1] = -999;
    spGeo = new T.BufferGeometry();
    spGeo.setAttribute("position", new T.BufferAttribute(spPos, 3).setUsage(T.DynamicDrawUsage));
    spGeo.setAttribute("color", new T.BufferAttribute(spCol, 3).setUsage(T.DynamicDrawUsage));
    const mat = new T.PointsMaterial({
      size: 0.16, map: TEX.glowTight, vertexColors: true, transparent: true,
      blending: T.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false,
    });
    spPts = new T.Points(spGeo, mat);
    spPts.frustumCulled = false;
    ROOT.add(spPts);
  }

  function spawnSparks(x, y, z, n, power) {
    for (let k = 0; k < n; k++) {
      const i = spHead; spHead = (spHead + 1) % SPARK_MAX;
      spPos[i * 3] = x; spPos[i * 3 + 1] = y; spPos[i * 3 + 2] = z;
      spVel[i * 3] = rand(-1.7, 1.7); spVel[i * 3 + 1] = rand(0.4, 3.4); spVel[i * 3 + 2] = rand(-1.7, 1.7);
      spLife[i] = rand(0.22, 0.55);
      const pw = (power || 1) * 1.5;
      spCol[i * 3] = pw; spCol[i * 3 + 1] = pw * 0.68; spCol[i * 3 + 2] = pw * 0.26;
    }
  }

  function tickSparks(dt) {
    let any = false;
    for (let i = 0; i < SPARK_MAX; i++) {
      if (spLife[i] <= 0) continue;
      any = true;
      spLife[i] -= dt;
      if (spLife[i] <= 0) { spPos[i * 3 + 1] = -999; continue; }
      spVel[i * 3 + 1] -= 8.0 * dt;
      spPos[i * 3] += spVel[i * 3] * dt;
      spPos[i * 3 + 1] += spVel[i * 3 + 1] * dt;
      spPos[i * 3 + 2] += spVel[i * 3 + 2] * dt;
      const f = Math.min(1, spLife[i] * 2.6);
      spCol[i * 3] = 1.7 * f; spCol[i * 3 + 1] = 1.05 * f; spCol[i * 3 + 2] = 0.38 * f;
    }
    if (any) {
      spGeo.attributes.position.needsUpdate = true;
      spGeo.attributes.color.needsUpdate = true;
    }
  }

  /* ---------------- spinners (coil drum, fans) ---------------- */
  const SPIN = [];
  let SPIN_INST = null;
  const SPIN_GEO = () => geoMerge([
    geoCyl(0.1, 0.1, 0.22, 8, 0, 0, 0),
    geoBox(0.14, 0.04, 0.9, 0, 0, 0.42),
    geoBox(0.14, 0.04, 0.9, 0, 0, -0.42),
    geoBox(0.9, 0.04, 0.14, 0.42, 0, 0),
    geoBox(0.9, 0.04, 0.14, -0.42, 0, 0),
  ]);

  function initSpinners() {
    if (!SPIN.length) return;
    SPIN_INST = inst(SPIN_GEO(), MAT.galv, SPIN.length, { cast: false });
    for (let i = 0; i < SPIN.length; i++) {
      const s = SPIN[i];
      _m0.makeRotationY(0);
      _m1.makeRotationX(s.axis === "x" ? PI2 : s.axis === "z" ? PI2 : 0);
      _m0.premultiply(_m1);
      _m0.setPosition(s.x, s.y, s.z);
      SPIN_INST.setMatrixAt(i, _m0);
    }
  }

  function tickSpinners(t) {
    if (!SPIN_INST) return;
    for (let i = 0; i < SPIN.length; i++) {
      const s = SPIN[i];
      const ang = (s.phase || 0) + t * (s.speed || 2);
      _m0.makeRotationY(ang);
      if (s.axis === "x") { _m1.makeRotationX(PI2); _m0.premultiply(_m1); }
      else if (s.axis === "z") { _m1.makeRotationX(PI2); _m0.premultiply(_m1); }
      _m0.setPosition(s.x, s.y, s.z);
      SPIN_INST.setMatrixAt(i, _m0);
    }
    SPIN_INST.instanceMatrix.needsUpdate = true;
  }

  /* ============================================================
     Z02 · PRESS LINE
     ============================================================ */
  const PRESS_X = [-42, -33, -24, -15];
  const PRESS_Z = -20;
  const GAP_X = [-37.5, -28.5, -19.5];
  const PR_ST = [];
  let XF_ST = null;
  const PR_PHASE = [0.08, 0.34, 0.61, 0.86];
  let XF_PHASE = 0;
  let SLIDE_INST = null;
  let GANTRY_INST = null;
  const SLIDE_UP = 5.45, SLIDE_DOWN = 3.11;

  function pressStroke(u) {
    if (u < 0.30) return smooth(0, 1, u / 0.30);
    if (u < 0.46) return 1;
    if (u < 0.88) return 1 - smooth(0, 1, (u - 0.46) / 0.42);
    return 0;
  }

  function buildZ02() {
    const z = PRESS_Z;
    for (let i = 0; i < 4; i++) buildPress(PRESS_X[i], z, i);
    buildGantry(z);
    buildLineSign(z + 11.6);
    buildZ02Extras(z);
    buildCoilFeeder(-46.1, z);
    buildScrap(-15.4, z);
    buildPressFence(PRESS_X, z);

    // floor bands + walkways
    hazardBand(-28.7, z + 4.45, 35.9, 0.3, true);
    hazardBand(-28.7, z - 4.45, 35.9, 0.3, true);
    floorLine(-46.4, z + 5.6, -10.9, z + 5.6, 0.09, MAT.machineWhite);
    floorLine(-46.4, z + 7.0, -10.9, z + 7.0, 0.09, MAT.machineWhite);
    floorLine(-46.4, z + 5.6, -46.4, z + 7.0, 0.09, MAT.machineWhite);
    // painted bays below press heels
    for (let i = 0; i < 4; i++) {
      const px = PRESS_X[i];
      floorLine(px - 4.2, z + 6.1, px + 4.2, z + 6.1, 0.1, MAT.yellow);
      hazardBand(px, z + 3.35, 7.4, 0.26, true);
    }
    // oil stains
    oil(-39.3, -16.6, 2.6, 0.4); oil(-30.6, -15.2, 1.9, 2.1); oil(-25.4, -17.1, 2.2, 1.2);
    oil(-18.2, -16.2, 1.7, 0.8); oil(-43.6, -21.6, 2.4, 2.8); oil(-12.9, -19.2, 1.6, 1.4);
    oil(-34.5, -22.4, 2.1, 0.2);

    // ---- station beacons (housings built per press; gantry housing here)
    for (let i = 0; i < 4; i++) PR_ST.push(regStation("PR-0" + (i + 1), "Z02", "伺服压力机 0" + (i + 1), "press", PRESS_X[i], 7.2, z, 58));
    beaconPost(-28.5, 4.86, z, 0.2);
    XF_ST = regStation("XF-01", "Z02", "高速搬运机械手 · GANTRY", "transfer", -28.5, 5.16, z, 46);

    // ---- instanced animated parts
    SLIDE_INST = inst(geoMerge([
      geoBox(4.9, 0.65, 3.3, 0, 0, 0),
      geoBox(4.2, 0.75, 2.9, 0, -0.72, 0),
      geoBox(0.42, 0.9, 0.42, -2.2, -0.05, -1.42),
      geoBox(0.42, 0.9, 0.42, 2.2, -0.05, -1.42),
      geoBox(0.42, 0.9, 0.42, -2.2, -0.05, 1.42),
      geoBox(0.42, 0.9, 0.42, 2.2, -0.05, 1.42),
      geoBox(1.3, 0.4, 1.1, 0, 0.5, 0),
      geoBox(0.16, 0.24, 0.9, -1.5, 0.4, 0),
      geoBox(0.16, 0.24, 0.9, 1.5, 0.4, 0),
    ]), MAT.machineGrey, 4);
    for (let i = 0; i < 4; i++) { _m0.makeTranslation(PRESS_X[i], SLIDE_UP, z); SLIDE_INST.setMatrixAt(i, _m0); }

    GANTRY_INST = inst(geoMerge([
      geoBox(0.72, 0.24, 0.55, 0, 0.13, -2.92),
      geoBox(0.72, 0.24, 0.55, 0, 0.13, 2.92),
      geoBox(0.28, 0.3, 5.9, 0, 0.14, 0),
      geoBox(0.16, 1.9, 0.16, 0, -0.85, -1.5),
      geoBox(0.16, 1.9, 0.16, 0, -0.85, 1.5),
      geoBox(3.2, 0.12, 0.2, 0, -1.86, -1.4),
      geoBox(3.2, 0.12, 0.2, 0, -1.86, 1.4),
      geoBox(0.2, 0.12, 2.8, 0, -1.86, 0),
      geoCyl(0.07, 0.09, 0.14, 6, -1.3, -1.99, -1.2),
      geoCyl(0.07, 0.09, 0.14, 6, 0, -1.99, -1.2),
      geoCyl(0.07, 0.09, 0.14, 6, 1.3, -1.99, -1.2),
      geoCyl(0.07, 0.09, 0.14, 6, -1.3, -1.99, 1.2),
      geoCyl(0.07, 0.09, 0.14, 6, 0, -1.99, 1.2),
      geoCyl(0.07, 0.09, 0.14, 6, 1.3, -1.99, 1.2),
      geoBox(2.9, 0.05, 1.7, 0, -2.07, 0),
    ]), MAT.galv, 3);
    for (let g = 0; g < 3; g++) { _m0.makeTranslation(GAP_X[g], 4.6, z); GANTRY_INST.setMatrixAt(g, _m0); }

    // ---- pick proxies
    for (let i = 0; i < 4; i++) {
      addPickProxy(ROOT, {
        kind: "machine", id: "PR-0" + (i + 1), title: "伺服压力机 0" + (i + 1) + " · SERVO PRESS",
        zone: "Z02", anchor: { x: PRESS_X[i], y: 4.4, z: z },
      }, 7.2, 7.2, 6.0, PRESS_X[i], 3.6, z);
    }
    addPickProxy(ROOT, {
      kind: "machine", id: "XF-01", title: "高速搬运机械手 · GANTRY TRANSFER",
      zone: "Z02", anchor: { x: -28.5, y: 4.9, z: z },
    }, 35.5, 3.0, 6.6, -28.5, 4.4, z);
  }

  function buildPress(x, z, i) {
    const W = 6.6, D = 5.4;
    // plinth + yellow edge
    bb(W + 0.4, 0.3, D + 0.4, x, 0, z, MAT.concreteDark);
    b(W + 0.44, 0.06, 0.12, x, 0.3, z + (D + 0.4) / 2 - 0.06, MAT.yellow, { cast: false });
    b(W + 0.44, 0.06, 0.12, x, 0.3, z - (D + 0.4) / 2 + 0.06, MAT.yellow, { cast: false });
    b(0.12, 0.06, D + 0.4, x + (W + 0.4) / 2 - 0.06, 0.3, z, MAT.yellow, { cast: false });
    b(0.12, 0.06, D + 0.4, x - (W + 0.4) / 2 + 0.06, 0.3, z, MAT.yellow, { cast: false });
    // four uprights + foot pads
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      bb(0.85, 5.6, 0.95, x + sx * 2.7, 0.3, z + sz * 2.05, MAT.machineGrey);
      bb(1.12, 0.1, 1.2, x + sx * 2.7, 0.3, z + sz * 2.05, MAT.machineDark, { cast: false });
      // dark accent plates on the uprights
      b(0.9, 0.7, 1.0, x + sx * 2.7, 1.25, z + sz * 2.05, MAT.machineDark, { cast: false });
      b(0.9, 0.28, 1.0, x + sx * 2.7, 3.15, z + sz * 2.05, MAT.machineDark, { cast: false });
      b(0.9, 0.28, 1.0, x + sx * 2.7, 4.95, z + sz * 2.05, MAT.machineDark, { cast: false });
      // guide rail faces (bright)
      b(0.1, 4.2, 0.12, x + sx * 3.13, 3.3, z + sz * 2.05, MAT.galv, { cast: false });
    }
    // crown + crowned cap
    bb(6.6, 0.72, 5.0, x, 5.9, z, MAT.machineGrey);
    b(6.6, 0.1, 5.0, x, 5.94, z, MAT.machineDark, { cast: false });
    bb(6.1, 0.28, 4.35, x, 6.62, z, MAT.machineDark);
    // crown hydraulic units (visible nubs above crown)
    for (const sx of [-1, 1]) {
      cyc(0.24, 0.26, 0.55, 10, x + sx * 2.3, 6.95, z + 1.55, MAT.machineGrey, { cast: false });
      cyc(0.16, 0.16, 0.2, 10, x + sx * 2.3, 7.28, z + 1.55, MAT.steelDark, { cast: false });
      cyc(0.2, 0.22, 0.5, 10, x + sx * 2.3, 6.92, z - 1.55, MAT.steelDark, { cast: false });
    }
    // crown front grille + hazard strip
    for (let k = -2; k <= 2; k++) b(0.5, 0.34, 0.06, x + k * 1.1, 6.28, z + 2.49, MAT.machineDark, { cast: false });
    // motor / pump unit on the north face of the crown
    b(1.6, 0.6, 0.7, x + 1.2, 6.2, z - 2.85, MAT.machineDark, { cast: false });
    b(4.9, 0.05, 3.4, x, 6.9, z, MAT.machineGrey, { cast: false });
    for (let k = -2; k <= 2; k++) {
      b(0.14, 0.5, 0.08, x + k * 1.18, 6.26, z + 2.52, MAT.galv, { cast: false });
      b(0.14, 0.5, 0.08, x + k * 1.18, 6.26, z - 2.52, MAT.galv, { cast: false });
    }
    b(5.2, 0.08, 0.5, x, 6.64, z + 1.85, MAT.yellow, { cast: false });
    // tie beams
    beam([x - 2.4, 5.56, z - 1.62], [x + 2.4, 5.56, z - 1.62], 0.16, 0.18, MAT.steelDark);
    beam([x - 2.4, 5.56, z + 1.62], [x + 2.4, 5.56, z + 1.62], 0.16, 0.18, MAT.steelDark);
    // bed / bolster / lower die
    bb(5.9, 0.9, 4.5, x, 0.3, z, MAT.machineGrey);
    b(5.2, 0.14, 4.0, x, 1.27, z, MAT.galv);
    bb(4.6, 0.7, 3.2, x, 1.34, z, MAT.machineDark);
    b(5.0, 0.1, 3.5, x, 1.3, z, MAT.galv, { cast: false });
    for (let k = -1; k <= 1; k++) b(0.12, 0.55, 0.3, x + k * 1.6, 1.6, z + 1.62, MAT.galv, { cast: false });
    // back sheet (north) + stiffeners
    b(6.2, 4.4, 0.14, x, 3.6, z - 2.58, MAT.machineDark);
    for (let k = -2; k <= 2; k++) b(0.16, 4.2, 0.1, x + k * 1.35, 3.6, z - 2.66, MAT.machineGrey, { cast: false });
    // ---- die bay: open front with visible slide, glass only on the upper section
    // upper windows (2 panes) + heavy frame
    b(2.05, 2.0, 0.05, x - 1.1, 4.7, z + 2.65, MAT.glassClear, { cast: false, receive: false });
    b(2.05, 2.0, 0.05, x + 1.1, 4.7, z + 2.65, MAT.glassClear, { cast: false, receive: false });
    for (const fx of [-2.2, 0, 2.2]) b(0.14, 2.25, 0.16, x + fx, 4.7, z + 2.65, MAT.galv, { cast: false });
    for (const fy of [3.62, 5.78]) b(4.55, 0.14, 0.16, x, fy, z + 2.65, MAT.galv, { cast: false });
    // lower die-bay opening: only a low kick guard + curtain posts
    b(4.6, 0.1, 0.12, x, 1.12, z + 2.72, MAT.yellow, { cast: false });
    pl(4.4, 0.72, x, 0.74, z + 2.73, MAT.fence, { receive: false });
    for (const sx of [-1, 1]) b(0.1, 4.4, 0.1, x + sx * 2.3, 3.3, z + 2.7, MAT.yellow, { cast: false });
    // inside of the die bay: bright reflection plates so the slide reads
    b(5.2, 0.06, 0.12, x, 5.72, z + 1.55, MAT.ledWhite, { cast: false });
    b(4.4, 0.9, 0.05, x, 5.1, z + 2.32, MAT.machineWhite, { cast: false });
    // side frames: rear half sheeted, front half open
    for (const sx of [-1, 1]) {
      b(0.12, 4.4, 2.6, x + sx * 3.14, 3.6, z - 1.3, MAT.machineDark);
      for (let k = 0; k < 3; k++) b(0.1, 4.3, 0.08, x + sx * 3.14, 3.6, z - 2.5 + k * 0.9, MAT.galv, { cast: false });
      b(0.06, 2.6, 2.5, x + sx * 3.14, 4.5, z + 1.25, MAT.glassClear, { cast: false, receive: false });
      b(0.1, 0.12, 3.9, x + sx * 3.14, 5.85, z, MAT.galv, { cast: false });
      b(0.1, 0.12, 3.9, x + sx * 3.14, 1.35, z, MAT.galv, { cast: false });
      b(0.1, 2.4, 0.1, x + sx * 3.14, 2.6, z + 2.2, MAT.yellow, { cast: false });
    }
    // side yellow guards at yard level
    for (const sx of [-1, 1]) {
      b(0.1, 1.1, 0.1, x + sx * 3.32, 0.55, z - 2.2, MAT.yellow, { cast: false });
      b(0.1, 1.1, 0.1, x + sx * 3.32, 0.55, z + 2.2, MAT.yellow, { cast: false });
      b(0.08, 0.08, 4.5, x + sx * 3.32, 1.06, z, MAT.yellow, { cast: false });
    }
    // hydraulic piping
    cyc(0.07, 0.07, 4.0, 8, x + 2.56, 3.25, z + 2.5, MAT.steelDark, { cast: false });
    cyc(0.07, 0.07, 4.0, 8, x + 2.78, 3.25, z + 2.5, MAT.steelDark, { cast: false });
    beam([x - 2.5, 5.32, z + 2.52], [x + 2.5, 5.32, z + 2.52], 0.1, 0.1, MAT.steelDark);
    b(1.2, 0.6, 0.4, x - 1.9, 4.9, z - 2.7, MAT.galv, { cast: false });
    b(0.8, 0.35, 0.3, x + 1.6, 5.2, z - 2.7, MAT.steelDark, { cast: false });
    // work lights
    for (const lx of [-1.55, 0, 1.55]) bb(0.55, 0.07, 0.16, x + lx, 5.8, z + 1.9, MAT.ledWhite, { cast: false });
    // control cabinet (north side)
    const cabx = x + 2.75, cabz = z - 3.45;
    bb(1.25, 1.9, 0.72, cabx, 0.3, cabz, MAT.machineDark);
    b(1.15, 0.04, 0.66, cabx, 1.2, cabz, MAT.galv, { cast: false });
    b(0.04, 1.3, 0.03, cabx - 0.61, 1.1, cabz + 0.36, MAT.steelDark, { cast: false });
    b(0.3, 0.02, 0.03, cabx, 0.95, cabz + 0.37, MAT.ledWhite, { cast: false });
    b(0.3, 0.02, 0.03, cabx, 1.05, cabz + 0.37, MAT.ledAmber, { cast: false });
    pl(0.5, 0.3, cabx, 1.55, cabz + 0.37, MAT.screen);
    // operator pedestal outside fence
    const opx = x + 2.4, opz = z + 5.35;
    bb(0.55, 0.95, 0.42, opx, 0, opz, MAT.machineDark);
    bb(0.42, 0.28, 0.42, opx, 0.06, opz + 0.2, MAT.machineGrey, { cast: false });
    bb(0.16, 0.5, 0.16, opx, 0.55, opz - 0.08, MAT.steelDark, { cast: false });
    b(0.66, 0.42, 0.13, opx, 1.22, opz - 0.06, MAT.machineDark, { rotX: -0.42, cast: false });
    pl(0.52, 0.28, opx, 1.24, opz + 0.01, MAT.screen, { rotX: -0.42 });
    b(0.1, 0.05, 0.05, opx - 0.2, 1.02, opz + 0.05, MAT.ledRed, { cast: false });
    b(0.1, 0.05, 0.05, opx + 0.0, 1.02, opz + 0.05, MAT.ledWhite, { cast: false });
    // beacon housing
    beaconPost(x, 6.9, z, 0.24);
    signBoard("tag_PR-0" + (i + 1), 0.56, 0.28, x + 1.55, 3.28, z + 2.69, 0);
    // power cable to cabinet
    b(0.07, 0.05, 1.6, x + 2.75, 2.05, z - 2.6, MAT.black, { cast: false });
  }

  function lightCurtain(xa, xb, zline, h) {
    const cx = (xa + xb) / 2, w = xb - xa;
    const hh = h === undefined ? 2.0 : h;
    b(0.1, hh, 0.1, xa, hh / 2, zline, MAT.machineDark, { cast: false });
    b(0.1, hh, 0.1, xb, hh / 2, zline, MAT.machineDark, { cast: false });
    b(0.14, 0.1, 0.14, xa, hh - 0.06, zline, MAT.ledRed, { cast: false });
    b(0.14, 0.1, 0.14, xb, hh - 0.06, zline, MAT.ledRed, { cast: false });
    b(0.14, 0.09, 0.14, xa, 0.14, zline, MAT.ledRed, { cast: false });
    b(0.14, 0.09, 0.14, xb, 0.14, zline, MAT.ledRed, { cast: false });
    const n = 9;
    for (let i = 0; i < n; i++) {
      const yy = 0.25 + (i + 0.5) * (hh - 0.48) / n;
      b(w - 0.24, 0.02, 0.024, cx, yy, zline, MAT.ledRed, { cast: false });
    }
  }

  function fenceSeg(x0, z0, x1, z1, h) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len < 0.4) return;
    const H = h === undefined ? 2.05 : h;
    const n = Math.max(1, Math.round(len / 2.6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b(0.09, H, 0.09, x0 + dx * t, H / 2, z0 + dz * t, MAT.galv, { cast: false });
      b(0.17, 0.05, 0.17, x0 + dx * t, 0.03, z0 + dz * t, MAT.machineDark, { cast: false });
    }
    const rotY = Math.atan2(-dz, dx);
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const mx = x0 + dx * (t0 + t1) / 2, mz = z0 + dz * (t0 + t1) / 2;
      addPlane(ST, len / n - 0.1, H - 0.24, mx, H * 0.5, mz, MAT.fence, { rotY: rotY, receive: false });
    }
    beam([x0, H, z0], [x1, H, z1], 0.07, 0.07, MAT.galv, { cast: false });
    beam([x0, 0.3, z0], [x1, 0.3, z1], 0.05, 0.05, MAT.galv, { cast: false });
  }

  function buildPressFence(xs, z) {
    const zS = z + 4.45, zN = z - 4.45;
    const xw = -46.7, xe = -10.8;
    fenceSeg(xw, zN, xe, zN);
    fenceSeg(xw, zN, xw, zS);
    fenceSeg(xe, zN, xe, zS);
    // south side: gate at each press, opening for scrap conveyor
    let cursor = xw;
    for (let i = 0; i < 4; i++) {
      const gx = xs[i];
      fenceSeg(cursor, zS, gx - 0.8, zS);
      lightCurtain(gx - 0.8, gx + 0.8, zS);
      floorLine(gx - 0.8, zS + 0.55, gx + 0.8, zS + 0.55, 0.12, MAT.yellow ? MAT.yellow : MAT.yellow);
      cursor = gx + 0.8;
    }
    fenceSeg(cursor, zS, -16.3, zS);
    lightCurtain(-16.3, -14.5, zS);
    fenceSeg(-14.5, zS, xe, zS);
    // warning posts
    for (const px of [-45.0, -31.5, -22.5, -13.6]) {
      bb(0.12, 1.0, 0.12, px, 0, zS + 0.9, MAT.yellow, { cast: false });
      b(0.22, 0.22, 0.22, px, 1.0, zS + 0.9, MAT.ledAmber, { cast: false });
    }
  }

  function buildGantry(z) {
    // one self-contained transfer gantry in each gap between presses
    for (const gx of GAP_X) {
      for (const sz of [-1, 1]) {
        const rz = z + sz * 2.92;
        b(2.5, 0.2, 0.22, gx, 4.6, rz, MAT.galv);
        b(2.5, 0.07, 0.13, gx, 4.72, rz, MAT.steelDark, { cast: false });
        for (const ex of [-1.05, 1.05]) {
          bb(0.16, 4.6, 0.16, gx + ex, 0, rz, MAT.galv);
          bb(0.42, 0.05, 0.42, gx + ex, 0, rz, MAT.machineDark, { cast: false });
          beam([gx + ex, 2.0, rz], [gx + ex * 0.4, 4.45, rz], 0.09, 0.09, MAT.galv, { cast: false });
        }
        b(0.16, 0.3, 0.34, gx - 1.3, 4.6, rz, MAT.yellow, { cast: false });
        b(0.16, 0.3, 0.34, gx + 1.3, 4.6, rz, MAT.yellow, { cast: false });
        b(1.9, 0.08, 0.24, gx, 4.84, rz, MAT.black, { cast: false });
      }
      b(0.22, 0.26, 6.0, gx, 4.74, z, MAT.galv);
      // drive cabinet on the frame
      b(0.5, 0.72, 0.3, gx + 1.1, 3.95, z + 2.92, MAT.machineDark, { cast: false });
      b(0.3, 0.05, 0.05, gx + 1.1, 4.16, z + 2.77, MAT.ledWhite, { cast: false });
    }
    signBoard("tag_XF-01", 0.62, 0.31, -28.5, 4.96, z + 3.12, 0);
  }

  function buildLineSign(z) {
    const x0 = -45.3, x1 = -13.2, y = 4.75, cx = (x0 + x1) / 2;
    for (const px of [x0, x1]) {
      bb(0.26, y, 0.26, px, 0, z, MAT.galv);
      bb(0.72, 0.06, 0.72, px, 0, z, MAT.machineDark, { cast: false });
      b(0.34, 0.08, 0.34, px, 0.04, z, MAT.yellow, { cast: false });
    }
    b(x1 - x0, 0.26, 0.3, cx, y, z, MAT.galv);
    b(x1 - x0, 0.12, 0.3, cx, y + 0.85, z, MAT.galv, { cast: false });
    for (let xx = x0 + 0.8; xx < x1 - 0.8; xx += 1.55) {
      beam([xx, y + 0.1, z], [xx + 0.78, y + 0.82, z], 0.07, 0.07, MAT.galv, { cast: false });
    }
    signBoard("press", 3.5, 0.88, cx, y - 0.72, z + 0.13, 0);
    b(3.9, 0.06, 0.12, cx, y - 1.22, z + 0.15, MAT.yellow, { cast: false });
    // walkway under the sign gantry
    hazardBand(cx, z + 1.0, x1 - x0 - 1.0, 0.3, true);
  }

  function buildZ02Extras(z) {
    // ---- die storage racks along the north aisle
    for (let r = 0; r < 2; r++) {
      const rx = -30.5 + r * 4.6, rz = z - 8.8;
      for (const sx of [-1.35, 1.35]) for (const sz of [-1, 1]) b(0.16, 2.5, 0.16, rx + sx, 1.25, rz + sz * 1.0, MAT.galv, { cast: false });
      for (const sy of [0.25, 1.25]) b(2.9, 0.14, 2.15, rx, sy, rz, MAT.galv, { cast: false });
      b(2.9, 0.12, 0.16, rx, 2.5, rz - 1.0, MAT.galv, { cast: false });
      b(2.9, 0.12, 0.16, rx, 2.5, rz + 1.0, MAT.galv, { cast: false });
      // dies on the shelves
      b(2.3, 0.62, 1.7, rx, 0.62, rz, MAT.machineDark);
      b(2.3, 0.62, 1.7, rx, 1.62, rz, MAT.machineDark);
      for (const sy of [0.62, 1.62]) {
        b(2.36, 0.07, 1.76, rx, sy + 0.34, rz, MAT.yellow, { cast: false });
        b(0.4, 0.16, 0.3, rx - 0.6, sy + 0.42, rz + 0.9, MAT.galv, { cast: false });
      }
      b(0.5, 0.3, 0.4, rx + 0.85, 2.56, rz, MAT.ledAmber, { cast: false });
    }
    // ---- coil storage (3 coils on cradles)
    for (let c = 0; c < 3; c++) {
      const cxx = -44.4 + c * 2.35, czz = z - 7.4;
      for (const sz of [-1, 1]) b(0.18, 0.7, 0.16, cxx, 0.35, czz + sz * 0.85, MAT.galv, { cast: false });
      b(0.9, 0.14, 1.9, cxx, 0.12, czz, MAT.galv, { cast: false });
      cyc(0.86, 0.86, 1.05, 14, cxx, 1.0, czz, MAT.galv, { rotX: PI2, cast: false });
      cyc(0.92, 0.92, 0.06, 14, cxx, 1.0, czz + 0.55, MAT.steelDark, { rotX: PI2, cast: false });
      b(0.5, 0.02, 0.5, cxx, 0.5, czz, MAT.yellow, { cast: false });
    }
    // ---- blank stacks near press 1/2
    for (let s = 0; s < 2; s++) {
      const sx = -38.9 + s * 2.2, sz = z - 5.6;
      b(1.3, 0.14, 1.3, sx, 0.14, sz, MAT.pallet);
      b(1.2, 0.34, 1.2, sx, 0.4, sz, MAT.galv);
      b(1.24, 0.04, 1.24, sx, 0.58, sz, MAT.steelDark, { cast: false });
      b(0.8, 0.02, 0.06, sx, 0.6, sz, MAT.yellow, { cast: false });
    }
    // ---- control pulpit (south-west)
    const px = -43.2, pzz = z + 8.2;
    bb(2.4, 1.5, 2.0, px, 0, pzz, MAT.machineWhite);
    bb(2.4, 0.1, 2.0, px, 1.5, pzz, MAT.machineDark, { cast: false });
    b(2.2, 0.9, 0.06, px, 0.95, pzz + 1.0, MAT.glassClear, { cast: false });
    b(2.4, 0.12, 0.12, px, 1.5, pzz + 1.02, MAT.galv, { cast: false });
    for (let k = -1; k <= 1; k++) b(0.1, 0.9, 0.1, px + k * 1.1, 0.95, pzz + 1.0, MAT.galv, { cast: false });
    b(0.8, 0.5, 0.06, px, 1.9, pzz + 1.0, MAT.machineDark, { cast: false });
    signBoard("press", 1.65, 0.42, px, 1.86, pzz + 1.08, 0);
    // ---- utility pipe rack along the north side
    for (let xx = -45.6; xx < -11.5; xx += 5.6) {
      b(0.16, 3.0, 0.16, xx, 1.5, z - 6.0, MAT.galv, { cast: false });
      b(0.16, 0.16, 0.7, xx, 3.0, z - 6.0, MAT.galv, { cast: false });
    }
    beam([-45.8, 2.85, z - 6.22], [-11.3, 2.85, z - 6.22], 0.14, 0.14, MAT.steelDark, { cast: false });
    beam([-45.8, 3.06, z - 5.82], [-11.3, 3.06, z - 5.82], 0.1, 0.1, MAT.galv, { cast: false });
    // ---- drums / waste near the east end
    for (let d = 0; d < 3; d++) {
      const dx = -12.6, dz = z + 5.4 + d * 0.9;
      cyb(0.29, 0.29, 0.88, 12, dx, 0, dz, MAT.galv);
      cyb(0.3, 0.3, 0.05, 12, dx, 0.88, dz, MAT.machineDark, { cast: false });
      b(0.6, 0.02, 0.6, dx, 0.5, dz, MAT.yellow, { cast: false });
    }
  }


  function buildCoilFeeder(x, z) {
    // base + housing
    bb(2.6, 0.28, 2.9, x, 0, z, MAT.machineDark);
    bb(2.2, 0.09, 2.5, x, 0.28, z, MAT.galv, { cast: false });
    bb(1.5, 1.5, 1.5, x + 0.2, 0.28, z - 1.55, MAT.machineDark);
    b(1.5, 0.12, 1.5, x + 0.2, 1.82, z - 1.55, MAT.machineGrey, { cast: false });
    b(0.7, 0.5, 0.08, x + 0.2, 0.9, z - 0.78, MAT.galv, { cast: false });
    b(0.12, 0.12, 0.12, x + 0.2, 1.15, z - 0.74, MAT.ledWhite, { cast: false });
    // mandrel (axis z)
    cyc(0.23, 0.23, 1.9, 10, x + 0.2, 1.3, z - 0.4, MAT.galv, { rotX: PI2 });
    // coil side plates
    cyc(1.02, 1.02, 0.05, 18, x + 0.2, 1.3, z + 0.25, MAT.steelDark, { rotX: PI2, cast: false });
    cyc(1.02, 1.02, 0.05, 18, x + 0.2, 1.3, z - 1.05, MAT.steelDark, { rotX: PI2, cast: false });
    // peeler arm + hold down roller
    beam([x + 0.2, 2.0, z - 1.5], [x + 0.2, 2.55, z + 0.55], 0.16, 0.16, MAT.galv);
    cyc(0.16, 0.16, 0.55, 10, x + 0.2, 2.2, z + 0.62, MAT.galv, { rotX: PI2, cast: false });
    b(0.5, 0.3, 0.5, x + 0.2, 2.55, z + 0.55, MAT.machineDark, { cast: false });
    // feed rolls + strip to press
    for (const dz of [-0.35, 0.35]) cyc(0.16, 0.16, 0.9, 10, x + 1.55, 0.95, z + dz * 0.9, MAT.galv, { rotX: PI2, cast: false });
    b(0.9, 0.16, 0.9, x + 1.55, 0.62, z - 0.35, MAT.machineDark, { cast: false });
    b(0.9, 0.16, 0.9, x + 1.55, 0.62, z + 0.35, MAT.machineDark, { cast: false });
    b(0.85, 0.03, 1.15, x + 1.35, 1.12, z, MAT.galv, { cast: false });
    b(1.6, 0.03, 1.15, x - 0.1, 1.15, z, MAT.galv, { cast: false });
    // coil (spinner)
    SPIN.push({ x: x + 0.2, y: 1.3, z: z - 0.4, axis: "z", speed: 0.55 });
    // guard posts
    for (const sz of [-1, 1]) b(0.1, 1.1, 0.1, x + 1.9, 0.55, z + sz * 1.25, MAT.yellow, { cast: false });
    b(0.08, 0.08, 2.6, x + 1.9, 1.08, z, MAT.yellow, { cast: false });
    hazardBand(x + 0.6, z + 1.85, 2.2, 0.24, true);
  }

  function buildScrap(x, z) {
    const z0 = z + 2.7, z1 = -10.2, len = z1 - z0;
    const cz = (z0 + z1) / 2;
    b(1.5, 0.18, len, x, 0.72, cz, MAT.galv);
    b(1.16, 0.06, len - 0.3, x, 0.83, cz, MAT.black, { cast: false });
    for (const sx of [-0.64, 0.64]) {
      b(0.08, 0.3, len, x + sx, 0.9, cz, MAT.galv, { cast: false });
    }
    for (let zz = z0 + 0.5; zz < z1; zz += 2.4) {
      for (const sx of [-0.55, 0.55]) b(0.1, 0.72, 0.1, x + sx, 0.36, zz, MAT.galv, { cast: false });
      b(0.12, 0.08, 1.3, x, 0.68, zz, MAT.galv, { cast: false });
    }
    // drive motor + chute at press side
    b(0.42, 0.42, 0.6, x - 0.85, 0.55, z0 - 0.1, MAT.machineDark, { cast: false });
    b(1.2, 0.24, 0.9, x, 1.0, z0 - 0.35, MAT.machineDark, { cast: false });
    // scrap pieces
    b(0.4, 0.06, 0.3, x + 0.1, 0.9, cz + 0.6, MAT.galv, { cast: false, rotY: 0.3 });
    b(0.3, 0.05, 0.34, x - 0.2, 0.92, cz - 0.4, MAT.galv, { cast: false, rotY: -0.6 });
    b(0.34, 0.05, 0.2, x + 0.2, 0.9, cz - 1.3, MAT.galv, { cast: false, rotY: 0.9 });
    // bin (open top)
    const bz = -8.9;
    bb(2.5, 0.12, 2.3, x, 0, bz, MAT.machineDark);
    for (const sx of [-1.2, 1.2]) b(0.09, 1.35, 2.3, x + sx, 0.12 + 0.675, bz, MAT.machineDark);
    for (const sz of [-1.12, 1.12]) b(2.5, 1.35, 0.09, x, 0.12 + 0.675, bz + sz, MAT.machineDark);
    b(2.44, 0.05, 0.1, x, 1.45, bz + 1.12, MAT.yellow, { cast: false });
    b(2.44, 0.05, 0.1, x, 1.45, bz - 1.12, MAT.yellow, { cast: false });
    b(0.1, 0.05, 2.3, x + 1.2, 1.45, bz, MAT.yellow, { cast: false });
    b(0.1, 0.05, 2.3, x - 1.2, 1.45, bz, MAT.yellow, { cast: false });
    // scrap pile
    b(1.6, 0.3, 1.4, x, 0.35, bz, MAT.galv, { cast: false });
    b(1.1, 0.25, 1.0, x + 0.2, 0.6, bz - 0.1, MAT.galv, { cast: false, rotY: 0.4 });
    b(0.7, 0.2, 0.6, x - 0.2, 0.8, bz + 0.2, MAT.galv, { cast: false, rotY: -0.3 });
    // bin hazard label
    b(0.5, 0.28, 0.04, x, 1.75, bz + 1.17, MAT.yellow, { cast: false });
  }

  function tickZ02(t, dt) {
    // presses
    for (let i = 0; i < 4; i++) {
      const st = PR_ST[i];
      if (st.state !== "down") {
        PR_PHASE[i] += (dt / (4.4 + i * 0.16)) * (st.state === "idle" ? 0.45 : 1);
      }
      const s = pressStroke((PR_PHASE[i] % 1 + 1) % 1);
      _m0.makeTranslation(PRESS_X[i], SLIDE_UP - (SLIDE_UP - SLIDE_DOWN) * s, PRESS_Z);
      SLIDE_INST.setMatrixAt(i, _m0);
    }
    SLIDE_INST.instanceMatrix.needsUpdate = true;
    // gantry transfer
    if (XF_ST.state !== "down") {
      XF_PHASE += (dt / 3.4) * (XF_ST.state === "idle" ? 0.45 : 1);
    }
    for (let g = 0; g < 3; g++) {
      const ph = (XF_PHASE + g * 0.33) * TAU;
      _m0.makeTranslation(GAP_X[g] + Math.sin(ph) * 0.8, 4.6, PRESS_Z);
      GANTRY_INST.setMatrixAt(g, _m0);
    }
    GANTRY_INST.instanceMatrix.needsUpdate = true;
  }

  /* ============================================================
     Z03 · BODY SHOP — 8 six-axis robot weld cells, 2 conveyors
     ============================================================ */
  const WB_ST = [];
  const WELD_ROWS = [14, 26];
  const WELD_X = [-42, -33, -24, -15];
  const WELD = [];
  const biwX = [-44, -35, -26, -17, -44, -35, -26, -17];
  let BIW_INST = null;
  let RTUR = null, RLOW = null, RUP = null, RWR = null;

  function biwGeo() {
    const g = [
      geoBox(4.2, 0.1, 1.5, 0, 0.06, 0),
      geoBox(0.16, 0.16, 1.46, 1.95, 0.15, 0),
      geoBox(0.16, 0.16, 1.46, -1.95, 0.15, 0),
      geoBox(4.1, 0.16, 0.12, 0, 0.2, 0.72),
      geoBox(4.1, 0.16, 0.12, 0, 0.2, -0.72),
      geoBox(0.14, 0.14, 1.5, 2.0, 0.28, 0),
      geoBox(0.14, 0.14, 1.5, -2.0, 0.28, 0),
      geoBox(0.09, 0.95, 0.1, 0.9, 0.7, 0.68, 0, 0, 0.18),
      geoBox(0.09, 0.95, 0.1, 0.9, 0.7, -0.68, 0, 0, 0.18),
      geoBox(0.09, 1.0, 0.1, -0.3, 0.72, 0.7),
      geoBox(0.09, 1.0, 0.1, -0.3, 0.72, -0.7),
      geoBox(0.09, 0.95, 0.1, -1.6, 0.7, 0.68, 0, 0, -0.2),
      geoBox(0.09, 0.95, 0.1, -1.6, 0.7, -0.68, 0, 0, -0.2),
      geoBox(3.6, 0.09, 0.09, -0.3, 1.21, 0.66),
      geoBox(3.6, 0.09, 0.09, -0.3, 1.21, -0.66),
      geoBox(0.12, 0.09, 1.4, 1.45, 1.21, 0),
      geoBox(0.12, 0.09, 1.4, -1.95, 1.21, 0),
      geoBox(0.12, 0.22, 1.5, 1.2, 0.98, 0),
      geoBox(0.12, 0.3, 1.5, -2.05, 0.55, 0),
      geoBox(2.3, 0.07, 1.66, -0.3, 1.26, 0),
      geoBox(1.15, 0.07, 1.56, 1.5, 0.95, 0),
      geoBox(0.8, 0.07, 1.56, -1.85, 0.97, 0),
    ];
    return geoMerge(g);
  }

  function robotLinks() {
    // shared instanced link geometry (origin = joint pivot)
    const turret = geoMerge([
      geoBox(0.62, 0.6, 0.62, 0, 0.3, 0),
      geoBox(0.72, 0.3, 0.5, 0, 0.82, 0.02),
      geoCyl(0.27, 0.27, 0.8, 10, 0, 0.95, 0.05, 0, 0, PI2),
      geoBox(0.3, 0.24, 0.22, 0.3, 0.62, -0.24),
    ]);
    const lower = geoMerge([
      geoBox(0.34, 1.5, 0.4, 0, 0.75, 0),
      geoCyl(0.24, 0.24, 0.56, 10, 0, 0, 0, 0, 0, PI2),
      geoBox(0.14, 0.5, 0.14, 0, 0.5, 0.24),
      geoBox(0.1, 0.3, 0.1, 0, 1.2, -0.2),
    ]);
    const upper = geoMerge([
      geoBox(0.28, 1.4, 0.34, 0, 0.7, 0),
      geoCyl(0.2, 0.2, 0.46, 10, 0, 0, 0, 0, 0, PI2),
      geoBox(0.1, 0.34, 0.12, 0.18, 0.9, 0),
      geoBox(0.18, 0.18, 0.18, 0, 1.34, 0),
    ]);
    const wrist = geoMerge([
      geoBox(0.22, 0.44, 0.26, 0, 0.2, 0),
      geoCyl(0.11, 0.11, 0.1, 8, 0, 0.44, 0),
      geoBox(0.16, 0.16, 0.16, 0, 0.06, 0),
      geoBox(0.09, 0.34, 0.1, 0, 0.45, 0.03),
      geoCyl(0.05, 0.05, 0.26, 8, 0, 0.63, 0.02),
      geoCyl(0.035, 0.06, 0.1, 8, 0, 0.79, 0.02),
    ]);
    return { turret: turret, lower: lower, upper: upper, wrist: wrist };
  }

  function bodyConveyor(x0, x1, z) {
    const len = x1 - x0, cx = (x0 + x1) / 2;
    b(len, 0.18, 0.18, cx, 0.62, z - 0.66, MAT.galv);
    b(len, 0.18, 0.18, cx, 0.62, z + 0.66, MAT.galv);
    b(len, 0.1, 0.42, cx, 0.58, z, MAT.steelDark, { cast: false });
    for (let xx = x0 + 0.8; xx < x1; xx += 3.1) {
      for (const sz of [-0.66, 0.66]) b(0.12, 0.62, 0.12, xx, 0.31, z + sz, MAT.galv, { cast: false });
      b(0.1, 0.06, 1.5, xx, 0.56, z, MAT.galv, { cast: false });
    }
    for (let xx = x0 + 0.35; xx < x1 - 0.2; xx += 0.72) {
      cyc(0.095, 0.095, 1.36, 6, xx, 0.75, z, MAT.galv, { rotX: PI2, cast: false });
    }
    for (const ex of [x0, x1]) {
      b(0.2, 1.35, 2.0, ex, 1.32, z, MAT.machineDark, { cast: false });
      b(0.5, 0.55, 0.5, ex + (ex === x0 ? 0.35 : -0.35), 0.5, z + 0.95, MAT.machineDark, { cast: false });
    }
    floorLine(x0, z - 1.05, x1, z - 1.05, 0.08, MAT.yellow);
    floorLine(x0, z + 1.05, x1, z + 1.05, 0.08, MAT.yellow);
  }

  function buildWeldCell(cx, cz, ci) {
    const hw = 3.5, hd = 2.75;
    // guard fences on the two long sides
    fenceSeg(cx - hw, cz - hd, cx + hw, cz - hd, 2.0);
    fenceSeg(cx - hw, cz + hd, cx + hw, cz + hd, 2.0);
    // west light curtain (conveyor opening): parallel red beams between two posts
    const fx = cx - hw;
    for (const sz of [-1, 1]) b(0.09, 2.75, 0.09, fx, 1.375, cz + sz * 1.1, MAT.machineDark, { cast: false });
    for (let i = 0; i < 9; i++) b(0.02, 0.024, 2.2, fx, 0.35 + i * 0.235, cz, MAT.ledRed, { cast: false });
    b(0.1, 0.1, 0.1, fx, 2.7, cz - 1.1, MAT.ledRed, { cast: false });
    b(0.1, 0.1, 0.1, fx, 2.7, cz + 1.1, MAT.ledRed, { cast: false });
    // cell outline + number sign
    floorLine(cx - hw, cz - hd, cx + hw, cz - hd, 0.1, MAT.yellow);
    floorLine(cx + hw, cz - hd, cx + hw, cz + hd, 0.1, MAT.yellow);
    signBoard("tag_WB-0" + (ci + 1), 0.6, 0.3, cx, 2.28, cz + hd + 0.07, 0);
    // cable tray along the north fence
    b(6.4, 0.1, 0.3, cx, 1.72, cz - hd + 0.16, MAT.galv, { cast: false });
    b(6.4, 0.16, 0.08, cx, 1.63, cz - hd + 0.02, MAT.steelDark, { cast: false });
    // ---- robot rig
    const rx = cx, rz = cz - 2.0;
    const rig = new T.Group();
    rig.position.set(rx, 0, rz);
    const turret = new T.Object3D(); turret.position.set(0, 0.55, 0); rig.add(turret);
    const shoulder = new T.Object3D(); shoulder.position.set(0, 0.95, 0.05); turret.add(shoulder);
    const elbow = new T.Object3D(); elbow.position.set(0, 1.5, 0); shoulder.add(elbow);
    const wrist = new T.Object3D(); wrist.position.set(0, 1.4, 0); elbow.add(wrist);
    rig.updateMatrixWorld(true);
    WELD.push({
      rig: rig, turret: turret, shoulder: shoulder, elbow: elbow, wrist: wrist,
      wb: ci >> 1, phase: 0.31 + ci * 0.37, sparkT: 0,
    });
    // static robot base + cable dress
    cyb(0.64, 0.7, 0.55, 12, rx, 0, rz, MAT.orange);
    cyb(0.4, 0.5, 0.09, 12, rx, 0.55, rz, MAT.machineDark, { cast: false });
    b(0.26, 0.06, 0.26, rx + 0.48, 0.03, rz + 0.42, MAT.machineDark, { cast: false });
    b(0.12, 0.5, 0.12, rx - 0.5, 0.3, rz + 0.5, MAT.black, { cast: false });
    // robot controller cabinet
    const kx = cx + 2.55, kz = cz - 2.35;
    bb(0.95, 1.7, 0.55, kx, 0, kz, MAT.machineDark);
    b(0.85, 0.05, 0.5, kx, 1.06, kz, MAT.galv, { cast: false });
    pl(0.42, 0.26, kx, 1.46, kz + 0.285, MAT.screen);
    b(0.36, 0.05, 0.04, kx, 0.97, kz + 0.29, MAT.ledWhite, { cast: false });
    b(0.12, 0.06, 0.05, kx + 0.35, 1.55, kz + 0.28, MAT.ledAmber, { cast: false });
    // tip dresser + wire spool stand
    bb(0.5, 0.9, 0.45, cx - 2.6, 0, cz - 2.35, MAT.machineDark);
    b(0.4, 0.06, 0.35, cx - 2.6, 0.95, cz - 2.35, MAT.galv, { cast: false });
    cyb(0.28, 0.28, 0.5, 10, cx - 3.05, 0.6, cz - 1.9, MAT.steelDark, { cast: false });
    // ---- fixture / clamps around the shell dwell position
    b(4.7, 0.12, 1.9, cx, 0.7, cz, MAT.galv, { cast: false });
    for (const sx of [-1.75, 0, 1.75]) b(0.18, 0.34, 1.9, cx + sx, 0.89, cz, MAT.machineDark, { cast: false });
    for (const sx of [-1.65, 1.65]) for (const sz of [-1, 1]) {
      b(0.22, 0.62, 0.22, cx + sx, 0.5, cz + sz * 1.16, MAT.galv, { cast: false });
      b(0.2, 0.16, 0.34, cx + sx, 0.98, cz + sz * (1.16 - 0.14), MAT.machineDark, { cast: false });
      b(0.1, 0.18, 0.1, cx + sx, 1.1, cz + sz * 1.16, MAT.ledRed, { cast: false });
    }
    // ---- fume extraction hood + duct to the truss line
    const hx = cx, hz = cz - 1.65;
    for (const sx of [-1.5, 1.5]) for (const sz of [-1.0, 1.0]) b(0.1, 0.9, 0.1, hx + sx, 4.35, hz + sz, MAT.galv, { cast: false });
    b(3.2, 0.1, 2.2, hx, 4.85, hz, MAT.galv, { cast: false });
    b(3.4, 0.13, 2.4, hx, 4.95, hz, MAT.galv, { cast: false });
    for (let k = 0; k < 5; k++) b(0.14, 0.28, 2.0, hx - 1.3 + k * 0.65, 4.72, hz, MAT.machineDark, { cast: false });
    b(3.5, 0.06, 0.08, hx, 5.04, hz + 1.23, MAT.yellow, { cast: false });
    cyb(0.26, 0.26, 8.3, 10, hx, 5.02, hz, MAT.machineGrey, { cast: false });
    for (const sx of [-1.45, 1.45]) for (const sz of [-0.95, 0.95]) beam([hx, 7.4, hz], [hx + sx, 5.02, hz + sz], 0.04, 0.04, MAT.galv, { cast: false });
    for (const dy of [6.4, 8.4, 10.6]) cyb(0.34, 0.34, 0.1, 10, hx, dy, hz, MAT.galv, { cast: false });
    // ---- cell floor hazard at the aisle side
    hazardBand(cx, cz + hd + 0.45, 6.4, 0.24, true);
  }

  function buildBodySign() {
    const z = 32.6, x0 = -39.6, x1 = -33.6, y = 4.9, cx = (x0 + x1) / 2;
    for (const px of [x0, x1]) {
      bb(0.22, y, 0.22, px, 0, z, MAT.galv);
      bb(0.62, 0.06, 0.62, px, 0, z, MAT.machineDark, { cast: false });
    }
    b(x1 - x0, 0.22, 0.26, cx, y, z, MAT.galv);
    signBoard("body", 3.2, 0.8, cx, y - 0.62, z + 0.11, 0);
    b(3.5, 0.06, 0.1, cx, y - 1.1, z + 0.14, MAT.yellow, { cast: false });
  }

  function buildZ03() {
    for (const rz of WELD_ROWS) bodyConveyor(-46.3, -14.4, rz);
    const parts = robotLinks();
    RTUR = inst(parts.turret, MAT.orange, 8);
    RLOW = inst(parts.lower, MAT.orange, 8);
    RUP = inst(parts.upper, MAT.orange, 8);
    RWR = inst(parts.wrist, MAT.steelDark, 8);
    for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) buildWeldCell(WELD_X[c], WELD_ROWS[r], r * 4 + c);
    BIW_INST = inst(biwGeo(), MAT.machineWhite, 8);
    for (let i = 0; i < 8; i++) { _m0.makeTranslation(biwX[i], 0.78, WELD_ROWS[i < 4 ? 0 : 1]); BIW_INST.setMatrixAt(i, _m0); }

    // row aisle markings
    for (const rz of WELD_ROWS) {
      floorLine(-46.4, rz - 3.1, -11.2, rz - 3.1, 0.09, MAT.machineWhite);
      floorLine(-46.4, rz + 3.1, -11.2, rz + 3.1, 0.09, MAT.machineWhite);
    }
    hazardBand(-30, 20, 34, 0.28, true);
    // part racks in the central aisle between rows
    for (let r = 0; r < 3; r++) {
      const rx = -39.5 + r * 8.6, rz = 20.1;
      for (const sx of [-1.1, 1.1]) for (const sz of [-0.6, 0.6]) b(0.12, 1.9, 0.12, rx + sx, 0.95, rz + sz, MAT.galv, { cast: false });
      b(2.4, 0.12, 1.3, rx, 0.55, rz, MAT.galv, { cast: false });
      b(2.4, 0.12, 1.3, rx, 1.5, rz, MAT.galv, { cast: false });
      b(2.1, 0.06, 1.1, rx, 0.62, rz, MAT.galv, { cast: false });
      b(2.1, 0.06, 1.1, rx, 1.57, rz, MAT.galv, { cast: false });
      for (let p = 0; p < 2; p++) b(1.9, 0.9, 0.06, rx, 1.05, rz - 0.2 + p * 0.4, MAT.galv, { cast: false, rotX: 0.08 });
      b(0.4, 0.3, 0.1, rx - 1.0, 2.0, rz + 0.62, MAT.ledAmber, { cast: false });
    }
    // material totes near the east end
    for (let r = 0; r < 4; r++) {
      bb(0.9, 0.85, 0.9, -13.6 - (r % 2) * 1.1, 0, 8.4 + r * 1.0, MAT.machineDark, { cast: false });
      b(0.92, 0.06, 0.92, -13.6 - (r % 2) * 1.1, 0.85, 8.4 + r * 1.0, MAT.yellow, { cast: false });
    }
    // operator pulpit on the south aisle
    const px = -30.5, pz = 31.2;
    bb(2.6, 1.5, 1.9, px, 0, pz, MAT.machineWhite);
    bb(2.6, 0.1, 1.9, px, 1.5, pz, MAT.machineDark, { cast: false });
    b(2.4, 0.9, 0.06, px, 0.95, pz - 0.98, MAT.glassClear, { cast: false });
    for (let k = -1; k <= 1; k++) b(0.1, 0.9, 0.1, px + k * 1.2, 0.95, pz - 0.98, MAT.galv, { cast: false });
    b(0.8, 0.5, 0.06, px, 1.9, pz - 0.98, MAT.machineDark, { cast: false });
    signBoard("body", 1.7, 0.43, px, 1.86, pz - 1.06, PI);
    buildBodySign();

    // ---- stations WB-01..04 (each covers 2 cells) + status masts
    for (let k = 0; k < 4; k++) {
      const row = k < 2 ? 0 : 1;
      const mx = k % 2 === 0 ? -37.5 : -19.5;
      const mz = WELD_ROWS[row] - 2.75;
      b(0.1, 5.2, 0.1, mx, 2.6, mz, MAT.galv, { cast: false });
      b(0.26, 0.06, 0.26, mx, 0.03, mz, MAT.machineDark, { cast: false });
      beaconPost(mx, 5.2, mz, 0.16);
      WB_ST.push(regStation("WB-0" + (k + 1), "Z03", "焊装机器人单元 0" + (k + 1) + " · WELD CELLS", "robot", mx, 5.45, mz, 58));
    }
    // pick proxies per weld group
    for (let k = 0; k < 4; k++) {
      const row = k < 2 ? 0 : 1;
      const bx = k % 2 === 0 ? -37.5 : -19.5;
      addPickProxy(ROOT, {
        kind: "machine", id: "WB-0" + (k + 1), title: "焊装机器人单元 0" + (k + 1) + " · WELD CELL GROUP",
        zone: "Z03", anchor: { x: bx, y: 4.6, z: WELD_ROWS[row] },
      }, 16.8, 5.0, 6.2, bx, 2.6, WELD_ROWS[row]);
    }
  }

  function tickZ03(t, dt) {
    for (let i = 0; i < WELD.length; i++) {
      const R = WELD[i];
      const st = WB_ST[R.wb];
      const run = st.state !== "down";
      if (run) R.phase += (dt / (8.0 + i * 0.23)) * (st.state === "idle" ? 0.4 : 1);
      const ph = R.phase * TAU;
      R.turret.rotation.y = 0.24 * Math.sin(ph * 0.5 + i * 0.9);
      R.shoulder.rotation.x = 0.55 + 0.16 * Math.sin(ph + i * 0.7);
      R.elbow.rotation.x = 1.45 + 0.1 * Math.sin(ph + i * 0.7 + 1.1);
      R.wrist.rotation.x = 0.9 + 0.1 * Math.sin(ph + i * 0.4 + 2.0);
      R.rig.updateMatrixWorld(true);
      RTUR.setMatrixAt(i, R.turret.matrixWorld);
      RLOW.setMatrixAt(i, R.shoulder.matrixWorld);
      RUP.setMatrixAt(i, R.elbow.matrixWorld);
      RWR.setMatrixAt(i, R.wrist.matrixWorld);
      const fi = FLASH_BASE + i;
      const welding = run && Math.sin(ph + i * 0.7) > 0.42;
      if (welding) {
        _v0.set(0, 0.82, 0).applyMatrix4(R.wrist.matrixWorld);
        R.sparkT -= dt;
        if (R.sparkT <= 0) { R.sparkT = 0.055 + rng() * 0.06; spawnSparks(_v0.x, _v0.y, _v0.z, 2, 1); }
        GLOW_POS[fi * 3] = _v0.x; GLOW_POS[fi * 3 + 1] = _v0.y; GLOW_POS[fi * 3 + 2] = _v0.z;
        const bg = 1.0 + 0.55 * Math.sin(t * 31 + i * 2.1);
        GLOW_COL[fi * 3] = 2.1 * bg; GLOW_COL[fi * 3 + 1] = 1.55 * bg; GLOW_COL[fi * 3 + 2] = 0.85 * bg;
      } else {
        GLOW_POS[fi * 3 + 1] = -999;
        GLOW_COL[fi * 3] = 0; GLOW_COL[fi * 3 + 1] = 0; GLOW_COL[fi * 3 + 2] = 0;
      }
    }
    RTUR.instanceMatrix.needsUpdate = true;
    RLOW.instanceMatrix.needsUpdate = true;
    RUP.instanceMatrix.needsUpdate = true;
    RWR.instanceMatrix.needsUpdate = true;
    GLOW_GEO.attributes.position.needsUpdate = true;
    GLOW_GEO.attributes.color.needsUpdate = true;

    // body shells advancing west -> east, freeze when their group is down
    for (let i = 0; i < 8; i++) {
      const row = i < 4 ? 0 : 1;
      const a = WB_ST[row * 2], b2 = WB_ST[row * 2 + 1];
      let sp = 0;
      if (a.state !== "down" && b2.state !== "down") sp = (a.state === "idle" || b2.state === "idle") ? 0.12 : 0.36;
      biwX[i] += sp * dt;
      if (biwX[i] > -13.9) biwX[i] -= 32.4;
      _m0.makeTranslation(biwX[i], 0.78, WELD_ROWS[row]);
      BIW_INST.setMatrixAt(i, _m0);
    }
    BIW_INST.instanceMatrix.needsUpdate = true;
  }

  /* ============================================================
     Z04 · PAINT SHOP — enclosed booth + oven + AHUs + ceiling grid
     ============================================================ */
  const BOOTH = { x0: -9, x1: 6, z0: -31, z1: -8, h: 8 };
  const OVEN = { x0: 6, x1: 13, z0: -29, z1: -10, h: 6 };
  let PT_ST = null, OV_ST = null;
  let PAINT_PATH = null;
  const PB_D = [0, 16, 32, 48];
  const PAINT = [];
  let PAINT_ARM = null;
  let BODY_INST = null, BODY_GLASS = null;
  const _pathOut = new Float32Array(5);

  function makePathLut(ctrl, n) {
    const curve = new T.CatmullRomCurve3(
      ctrl.map((p) => new T.Vector3(p[0], p[1] || 0, p[2])), false, "catmullrom", 0.15);
    const len = curve.getLength();
    const pts = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const p = curve.getPointAt(u);
      const tg = curve.getTangentAt(u);
      pts[i * 5] = p.x; pts[i * 5 + 1] = p.y; pts[i * 5 + 2] = p.z;
      const l = Math.hypot(tg.x, tg.z) || 1;
      pts[i * 5 + 3] = tg.x / l; pts[i * 5 + 4] = tg.z / l;
    }
    return { pts: pts, n: n, len: len, step: len / (n - 1) };
  }

  function samplePath(P, d, out) {
    let t = d % P.len;
    if (t < 0) t += P.len;
    let f = t / P.step;
    let i0 = Math.floor(f);
    if (i0 >= P.n - 1) i0 = P.n - 2;
    const fr = f - i0;
    const a = i0 * 5, b2 = (i0 + 1) * 5;
    out[0] = P.pts[a] + (P.pts[b2] - P.pts[a]) * fr;
    out[1] = P.pts[a + 1] + (P.pts[b2 + 1] - P.pts[a + 1]) * fr;
    out[2] = P.pts[a + 2] + (P.pts[b2 + 2] - P.pts[a + 2]) * fr;
    const hx0 = P.pts[a + 3], hz0 = P.pts[a + 4], hx1 = P.pts[b2 + 3], hz1 = P.pts[b2 + 4];
    let hx = hx0 + (hx1 - hx0) * fr, hz = hz0 + (hz1 - hz0) * fr;
    const l = Math.hypot(hx, hz) || 1;
    out[3] = hx / l; out[4] = hz / l;
    return out;
  }

  function pathBeams(P, off, dy, w, h, mat) {
    const step = 6;
    for (let i = 0; i + step < P.n; i += step) {
      const a = i * 5, b2 = (i + step) * 5;
      const hx = P.pts[a + 3], hz = P.pts[a + 4];
      const nx = -hz, nz = hx;
      const ax = P.pts[a] + nx * off, ay = P.pts[a + 1] + dy, az = P.pts[a + 2] + nz * off;
      const bx = P.pts[b2] + nx * off, by = P.pts[b2 + 1] + dy, bz = P.pts[b2 + 2] + nz * off;
      beam([ax, ay, az], [bx, by, bz], w, h, mat, { cast: false });
    }
  }

  function panelRun(ax, az, bx, bz, y0, y1, mat, thick, cast) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    if (len < 0.01) return;
    b(len, y1 - y0, thick || 0.18, (ax + bx) / 2, (y0 + y1) / 2, (az + bz) / 2, mat,
      { rotY: Math.atan2(-dz, dx), cast: cast === false ? false : true });
  }
  function glassRun(ax, az, bx, bz, y0, y1) {
    panelRun(ax, az, bx, bz, y0, y1, MAT.glassClear, 0.07, false);
  }
  function frameRun(ax, az, bx, bz, y0, y1, step) {
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    const n = Math.max(1, Math.round(len / step));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      b(0.16, y1 - y0, 0.27, ax + dx * t, (y0 + y1) / 2, az + dz * t, MAT.galv, { rotY: rotY, cast: false });
    }
    for (const yy of [y0, (y0 + y1) / 2, y1]) {
      b(len, 0.13, 0.25, (ax + bx) / 2, yy, (az + bz) / 2, MAT.galv, { rotY: rotY, cast: false });
    }
  }
  function boothWall(ax, az, bx, bz) {
    panelRun(ax, az, bx, bz, 0, 0.95, MAT.machineWhite, 0.18, true);
    glassRun(ax, az, bx, bz, 0.95, 6.0);
    panelRun(ax, az, bx, bz, 6.0, 8.0, MAT.machineWhite, 0.18, true);
    frameRun(ax, az, bx, bz, 0.95, 6.0, 2.6);
    panelRun(ax, az, bx, bz, 0, 0.14, MAT.machineDark, 0.22, false);
    panelRun(ax, az, bx, bz, 7.86, 8.0, MAT.galv, 0.24, false);
    const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz);
    const rotY = Math.atan2(-dz, dx);
    const n = Math.max(2, Math.round(len / 1.25));
    for (let i = 1; i < n; i++) b(0.035, 0.95, 0.2, ax + dx * i / n, 0.475, az + dz * i / n, MAT.machineGrey, { rotY: rotY, cast: false });
    // yellow base band inside the booth
    b(len, 0.16, 0.06, (ax + bx) / 2, 0.88, (az + bz) / 2, MAT.yellow, { rotY: rotY, cast: false });
  }

  function paintedBodyGeo() {
    return geoMerge([
      geoBox(4.4, 0.12, 1.7, 0, 0.12, 0),
      geoBox(4.5, 0.56, 1.82, 0, 0.48, 0),
      geoBox(1.15, 0.14, 1.62, 1.6, 0.82, 0),
      geoBox(0.85, 0.14, 1.62, -1.9, 0.83, 0),
      geoBox(4.2, 0.12, 0.1, 0, 0.3, 0.9),
      geoBox(4.2, 0.12, 0.1, 0, 0.3, -0.9),
      geoBox(0.09, 0.55, 0.1, 0.75, 1.02, 0.78, 0, 0, -0.12),
      geoBox(0.09, 0.55, 0.1, 0.75, 1.02, -0.78, 0, 0, -0.12),
      geoBox(0.09, 0.55, 0.1, -0.35, 1.02, 0.8),
      geoBox(0.09, 0.55, 0.1, -0.35, 1.02, -0.8),
      geoBox(0.09, 0.55, 0.1, -1.5, 1.02, 0.78, 0, 0, 0.15),
      geoBox(0.09, 0.55, 0.1, -1.5, 1.02, -0.78, 0, 0, 0.15),
      geoBox(2.35, 0.08, 1.7, -0.3, 1.33, 0),
    ]);
  }
  function paintedGlassGeo() {
    return geoMerge([geoBox(2.15, 0.5, 1.74, -0.3, 1.02, 0)]);
  }

  function buildPaintConveyor() {
    const ctrl = [
      [-7.4, 0.86, -8.7], [-7.4, 0.86, -26.2], [2.6, 0.86, -26.2],
      [4.4, 0.86, -20.4], [-6.2, 0.86, -20.4], [-6.2, 0.86, -14.4], [6.4, 0.86, -14.4],
    ];
    PAINT_PATH = makePathLut(ctrl, 220);
    pathBeams(PAINT_PATH, 0, -0.05, 1.16, 0.08, MAT.black);
    pathBeams(PAINT_PATH, -0.66, 0.05, 0.09, 0.15, MAT.galv);
    pathBeams(PAINT_PATH, 0.66, 0.05, 0.09, 0.15, MAT.galv);
    for (let i = 6; i < PAINT_PATH.n; i += 26) {
      const x = PAINT_PATH.pts[i * 5], z = PAINT_PATH.pts[i * 5 + 2];
      b(0.1, 0.8, 0.1, x, 0.4, z, MAT.galv, { cast: false });
      b(0.1, 0.06, 1.1, x, 0.78, z, MAT.galv, { cast: false });
    }
    // floor guides
    floorLine(-7.6, -8.9, -7.6, -26.3, 0.07, MAT.yellow);
    floorLine(2.8, -26.4, 4.6, -20.2, 0.07, MAT.yellow);
  }

  function buildPaintRobot(x, z, yaw, colHex, ph) {
    cyb(0.36, 0.42, 0.06, 10, x, 0, z, MAT.machineWhite, { cast: false });
    cyb(0.25, 0.31, 3.3, 10, x, 0.06, z, MAT.machineWhite);
    cyb(0.31, 0.31, 0.1, 10, x, 3.36, z, MAT.machineDark, { cast: false });
    bb(0.72, 0.5, 0.72, x, 0, z, MAT.machineDark, { cast: false });
    const piv = new T.Object3D();
    piv.position.set(x, 3.52, z);
    piv.rotation.y = yaw;
    piv.updateMatrixWorld(true);
    PAINT.push({ piv: piv, yaw: yaw, ph: ph });
    _c0.set(colHex);
    PAINT_ARM.setColorAt(PAINT.length - 1, _c0);
  }

  function buildZ04() {
    const bx0 = BOOTH.x0, bx1 = BOOTH.x1, bz0 = BOOTH.z0, bz1 = BOOTH.z1;
    // ---- booth walls (south wall has the body/personnel entry)
    boothWall(bx0, bz0, bx1, bz0);                       // north
    boothWall(bx0, bz0, bx0, -11.5);                     // west (N part)
    boothWall(bx0, -10.5, bx0, bz1);                     // west (S part)
    panelRun(bx0, -11.5, bx0, -10.5, 2.15, 8.0, MAT.machineWhite, 0.18, true);
    boothWall(bx0, bz1, -8.5, bz1);                      // south (west stub)
    boothWall(-6.7, bz1, bx1, bz1);                      // south (main)
    panelRun(-8.5, bz1, -6.7, bz1, 2.35, 8.0, MAT.machineWhite, 0.18, true);
    panelRun(-8.5, bz1, -6.7, bz1, 0.0, 0.2, MAT.galv, 0.2, false);
    glassRun(-8.5, bz1, -6.7, bz1, 2.35, 6.0);
    frameRun(-8.5, bz1, -6.7, bz1, 2.35, 6.0, 1.7);
    // east wall (shared with the oven) with the oven mouth
    boothWall(bx1, bz0, bx1, -20.0);
    boothWall(bx1, -12.0, bx1, bz1);
    panelRun(bx1, -20.0, bx1, -12.0, 4.9, 8.0, MAT.machineWhite, 0.18, true);
    frameRun(bx1, -20.0, bx1, -12.0, 4.9, 6.0, 2.6);
    // door frames + hazard markings at the openings
    for (const sz of [-1, 1]) b(0.14, 2.4, 0.14, -8.55 + (sz + 1) * 0.925, 1.2, bz1, MAT.galv, { cast: false });
    b(1.9, 0.12, 0.16, -7.6, 2.38, bz1, MAT.galv, { cast: false });
    hazardBand(-7.6, bz1 + 0.85, 2.2, 0.28, true);
    hazardBand(-7.6, bz1 - 0.9, 2.2, 0.28, true);
    floorLine(-6.4, bz1 + 6.0, -6.4, bz1 + 0.6, 0.1, MAT.machineWhite);
    // ---- booth roof: frame + translucent panels
    for (const zz of [bz0, bz1]) b(bx1 - bx0, 0.28, 0.3, (bx0 + bx1) / 2, 8.12, zz, MAT.galv);
    for (let k = 0; k <= 4; k++) {
      const xx = bx0 + (bx1 - bx0) * k / 4;
      b(0.3, 0.28, bz1 - bz0, xx, 8.12, (bz0 + bz1) / 2, MAT.galv);
      beam([xx, 8.0, bz0 + 0.4], [xx, 8.0, bz1 - 0.4], 0.16, 0.16, MAT.galv, { cast: false });
    }
    for (let c = 0; c < 3; c++) {
      for (let r = 0; r < 4; r++) {
        const px = bx0 + 2.5 + c * (bx1 - bx0 - 5) / 2;
        const pz = bz0 + 2.9 + r * (bz1 - bz0 - 5.8) / 3;
        b(4.55, 0.045, 5.6, px, 8.02, pz, MAT.glassClear, { cast: false, receive: false });
      }
    }
    // ceiling light grid (inside)
    for (let c = 0; c < 5; c++) {
      for (let r = 0; r < 3; r++) {
        b(1.5, 0.1, 0.22, bx0 + 2.0 + c * (bx1 - bx0 - 4) / 4, 7.42, bz0 + 3.4 + r * 7.0, M_BOOTH_LIGHT, { cast: false });
      }
    }
    // extract plenum + grilles
    b(4.2, 1.0, 2.6, -1.5, 8.85, -25.6, MAT.galv);
    for (let k = 0; k < 6; k++) b(3.9, 0.05, 0.12, -1.5, 8.32, -26.6 + k * 0.42, MAT.machineDark, { cast: false });
    // ---- interior: conveyor, bodies, paint robots, cabinets
    buildPaintConveyor();
    const armGeo = geoMerge([
      geoBox(0.5, 0.42, 0.5, 0, 0.1, 0),
      geoBox(0.26, 0.26, 2.4, 0, 0.22, 1.2),
      geoBox(0.3, 0.3, 0.42, 0, 0.2, 2.35),
      geoCyl(0.16, 0.16, 0.3, 10, 0, 0.0, 2.5),
      geoBox(0.1, 0.6, 0.1, 0, 0.5, 0.4),
    ]);
    const armMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.25, envMapIntensity: 0.9 });
    PAINT_ARM = inst(armGeo, armMat, 4);
    buildPaintRobot(-3.4, -23.4, PI, 0xe7e2d7, 0.2);
    buildPaintRobot(2.4, -23.4, 0, 0x8f3f33, 1.7);
    buildPaintRobot(-3.4, -17.4, 0, 0x3f5f7c, 3.1);
    buildPaintRobot(3.4, -17.4, PI, 0xe7e2d7, 4.4);
    // paint store cabinets along the north wall
    for (let k = 0; k < 3; k++) {
      const cx = -7.2 + k * 1.35;
      bb(1.2, 2.0, 0.55, cx, 0, -30.3, MAT.machineWhite);
      b(1.2, 0.1, 0.6, cx, 2.0, -30.3, MAT.machineDark, { cast: false });
      b(1.24, 0.14, 0.06, cx, 1.55, -30.02, MAT.yellow, { cast: false });
      b(1.1, 0.04, 0.02, cx, 1.15, -30.02, MAT.steelDark, { cast: false });
    }
    // ---- painted-body instanced meshes (booth 4 + overhead 4)
    const bodyMat = new T.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.3 });
    BODY_INST = inst(paintedBodyGeo(), bodyMat, 8);
    BODY_GLASS = inst(paintedGlassGeo(), MAT.carGlass, 8, { cast: false });
    const bcols = [0xd9d6cc, 0x9aa4ab, 0x8f3f33, 0x3f5f7c, 0xcfd2cb, 0x2c3238, 0x8f3f33, 0x3f5f7c];
    for (let i = 0; i < 8; i++) { _c0.set(bcols[i]); BODY_INST.setColorAt(i, _c0); }
    // initial matrices
    for (let i = 0; i < 4; i++) {
      samplePath(PAINT_PATH, PB_D[i], _pathOut);
      _m0.makeRotationY(Math.atan2(-_pathOut[4], _pathOut[3]));
      _m0.setPosition(_pathOut[0], 0.86, _pathOut[2]);
      BODY_INST.setMatrixAt(i, _m0);
      BODY_GLASS.setMatrixAt(i, _m0);
    }
    // ---- oven tunnel
    buildOven();
    // ---- roof AHUs
    buildAhu(0.2, 8.0, -21.0, 3.6, 1.7, 2.3, 0);
    buildAhu(-4.8, 8.0, -11.8, 2.4, 1.4, 1.8, 1);
    buildAhu(9.4, 6.0, -13.6, 2.8, 1.6, 1.9, 2);
    // ducts from AHUs into the roof
    b(1.1, 1.0, 1.1, 0.2, 7.6, -21.0, MAT.galv, { cast: false });
    b(0.9, 0.9, 0.9, -4.8, 7.6, -11.8, MAT.galv, { cast: false });
    b(1.0, 1.0, 1.0, 9.4, 5.6, -13.6, MAT.galv, { cast: false });
    // extract duct from plenum north
    b(1.0, 0.8, 3.6, -1.5, 8.9, -29.2, MAT.galv);
    // ---- signs
    signBoard("paint", 3.2, 0.8, -1.4, 6.85, -7.88, 0);
    // exterior paint-supply pipework / louvres on the south face
    for (let k = 0; k < 3; k++) {
      const ppx = 0.6 + k * 1.1;
      b(0.09, 6.2, 0.09, ppx, 3.1, -7.9, MAT.galv, { cast: false });
      b(0.24, 0.16, 0.2, ppx, 1.55, -7.84, MAT.machineDark, { cast: false });
    }
    b(2.4, 0.09, 0.09, 1.7, 6.2, -7.9, MAT.galv, { cast: false });
    b(2.2, 1.1, 0.16, 4.4, 5.3, -7.86, MAT.machineGrey, { cast: false });
    for (let k = 0; k < 5; k++) b(2.0, 0.1, 0.07, 4.4, 4.9 + k * 0.2, -7.78, MAT.machineDark, { cast: false });
    signBoard("tag_PT-01", 0.6, 0.3, -5.4, 2.55, -7.88, 0);
    signBoard("tag_OV-01", 0.6, 0.3, 9.6, 4.3, -9.88, 0);
    // ---- station beacons + pick proxies
    beaconPost(-7.7, 8.0, -9.3, 0.28);
    PT_ST = regStation("PT-01", "Z04", "涂装室 · PAINT BOOTH", "booth", -7.7, 8.42, -9.3, 58);
    beaconPost(12.4, 6.0, -11.2, 0.22);
    OV_ST = regStation("OV-01", "Z04", "烘干炉 · OVEN", "oven", 12.4, 6.36, -11.2, 58);
    addPickProxy(ROOT, {
      kind: "machine", id: "PT-01", title: "涂装室 · PAINT BOOTH", zone: "Z04",
      anchor: { x: -1.5, y: 5.4, z: -19.5 },
    }, 15.4, 8.2, 23.4, -1.5, 4.1, -19.5);
    addPickProxy(ROOT, {
      kind: "machine", id: "OV-01", title: "烘干炉 · OVEN", zone: "Z04",
      anchor: { x: 9.5, y: 4.2, z: -19.5 },
    }, 7.4, 6.2, 19.4, 9.5, 3.1, -19.5);
  }

  function buildAhu(x, baseY, z, w, h, d, fanCount) {
    bb(w, h, d, x, baseY, z, MAT.machineWhite);
    b(w + 0.06, 0.12, d + 0.06, x, baseY + h, z, MAT.machineDark, { cast: false });
    // raised feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      b(0.16, 0.35, 0.16, x + sx * (w / 2 - 0.25), baseY + 0.18, z + sz * (d / 2 - 0.25), MAT.galv, { cast: false });
    }
    // access door + grille
    b(w * 0.42, h * 0.6, 0.05, x - w * 0.18, baseY + h * 0.5, z + d / 2 + 0.02, MAT.galv, { cast: false });
    b(w * 0.5, h * 0.22, 0.05, x + w * 0.2, baseY + h * 0.72, z + d / 2 + 0.02, MAT.machineDark, { cast: false });
    // fan hood on top
    for (let k = 0; k < fanCount; k++) {
      const fx = x - (fanCount - 1) * 0.55 + k * 1.1;
      cyb(0.52, 0.52, 0.24, 12, fx, baseY + h + 0.06, z, MAT.machineDark, { cast: false });
      cyb(0.46, 0.46, 0.06, 12, fx, baseY + h + 0.3, z, MAT.galv, { cast: false });
      SPIN.push({ x: fx, y: baseY + h + 0.34, z: z, axis: "y", speed: 7 + k });
    }
    if (fanCount === 0) {
      cyb(0.5, 0.5, 0.24, 12, x + w * 0.2, baseY + h, z, MAT.machineDark, { cast: false });
      SPIN.push({ x: x + w * 0.2, y: baseY + h + 0.2, z: z, axis: "y", speed: 6 });
    }
  }

  function buildOven() {
    const o = OVEN, cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
    // roof
    b(7.2, 0.22, 19.2, cx, 6, cz, MAT.machineWhite);
    b(7.3, 0.12, 19.3, cx, 6.15, cz, MAT.machineDark, { cast: false });
    // south / north / east walls
    panelRun(o.x0, o.z1, o.x1, o.z1, 0, 6, MAT.machineWhite, 0.2, true);
    // exterior heat glow + service pipes on the south face
    b(6.6, 0.16, 0.07, 9.5, 4.62, o.z1 + 0.16, M_OVEN_GLOW, { cast: false });
    b(6.8, 0.18, 0.22, 9.5, 4.42, o.z1 + 0.2, MAT.machineDark, { cast: false });
    for (let k = 0; k < 4; k++) b(0.14, 3.9, 0.14, 7.1 + k * 1.55, 1.95, o.z1 + 0.22, MAT.galv, { cast: false });
    b(5.4, 0.12, 0.12, 9.4, 3.86, o.z1 + 0.22, MAT.galv, { cast: false });
    panelRun(o.x0, o.z0, o.x1, o.z0, 0, 6, MAT.machineWhite, 0.2, true);
    panelRun(o.x1, o.z0, o.x1, -20.5, 0, 6, MAT.machineWhite, 0.2, true);
    panelRun(o.x1, -17.5, o.x1, o.z1, 0, 6, MAT.machineWhite, 0.2, true);
    panelRun(o.x1, -20.5, o.x1, -17.5, 5.4, 6, MAT.machineWhite, 0.2, true);
    panelRun(o.x1, -20.5, o.x1, -17.5, 0, 3.4, MAT.machineWhite, 0.2, true);
    // insulation ribs
    for (let zz = o.z0 + 0.5; zz < o.z1; zz += 1.2) {
      b(0.08, 6, 0.07, o.x1 + 0.12, 3, zz, MAT.galv, { cast: false });
      b(0.07, 6, 0.08, o.x0 - 0.12, 3, zz, MAT.galv, { cast: false });
    }
    for (let xx = o.x0 + 0.6; xx < o.x1; xx += 1.2) {
      b(0.07, 6, 0.08, xx, 3, o.z1 + 0.12, MAT.galv, { cast: false });
      b(0.07, 6, 0.08, xx, 3, o.z0 - 0.12, MAT.galv, { cast: false });
    }
    // glowing oven mouth (west face, inside the booth)
    b(0.16, 0.2, 8.2, 6.02, 4.98, -16, M_OVEN_GLOW, { cast: false });
    b(0.16, 0.2, 8.2, 6.02, 0.36, -16, M_OVEN_GLOW, { cast: false });
    for (const zz of [-20.0, -12.0]) b(0.16, 4.7, 0.2, 6.02, 2.65, zz, M_OVEN_GLOW, { cast: false });
    pl(7.9, 4.5, 6.05, 2.62, -16, M_OVEN_GLOW, { rotY: -PI2 });
    // interior conveyor + dark interior wall
    b(0.2, 4.4, 8.0, 12.8, 2.6, -16, MAT.machineDark, { cast: false });
    b(6.6, 0.06, 1.2, 9.5, 0.86, -16, MAT.black, { cast: false });
    // east exit opening + glow
    pl(2.8, 1.9, 13.06, 4.35, -19.0, M_OVEN_GLOW, { rotY: -PI2 });
    b(3.4, 0.18, 0.24, 13.2, 5.35, -19.0, MAT.machineDark, { cast: false });
    // exhaust stack
    cyb(0.5, 0.56, 9.3, 12, 11.6, 6.1, -26.0, MAT.steelDark);
    for (const yy of [7.4, 9.6, 11.8, 13.8]) cyc(0.62, 0.62, 0.13, 12, 11.6, yy, -26.0, MAT.galv, { cast: false });
    cyc(0.64, 0.3, 0.45, 12, 11.6, 15.55, -26.0, MAT.steelDark, { cast: false });
    // stack ladder
    for (let yy = 6.6; yy < 15.0; yy += 0.55) b(0.5, 0.04, 0.04, 11.0, yy, -26.0, MAT.galv, { cast: false });
    b(0.05, 8.6, 0.05, 10.78, 10.8, -26.0, MAT.galv, { cast: false });
    b(0.05, 8.6, 0.05, 11.22, 10.8, -26.0, MAT.galv, { cast: false });
    // oven roof AHU is built by caller; roof-duct to stack
    b(0.9, 0.7, 5.0, 10.6, 6.0, -23.4, MAT.galv, { cast: false });
    // south side service door + sign
    b(1.1, 2.1, 0.1, 8.2, 1.05, o.z1 + 0.14, MAT.galv, { cast: false });
    b(0.12, 0.12, 0.12, 8.68, 1.05, o.z1 + 0.2, MAT.ledWhite, { cast: false });
    hazardBand(10.8, o.z1 + 0.75, 2.6, 0.26, true);
    signBoard("tag_OV-01", 0.55, 0.28, 11.3, 3.2, o.z1 + 0.13, 0);
  }

  function tickZ04(t, dt) {
    const ptDown = PT_ST.state === "down";
    const lit = ptDown ? 0.3 : 2.3;
    M_BOOTH_LIGHT.emissiveIntensity = lerp(M_BOOTH_LIGHT.emissiveIntensity, lit, Math.min(1, dt * 2));
    _c0.set(ptDown ? 0xff5638 : 0xffe9c2);
    M_BOOTH_LIGHT.emissive.lerp(_c0, Math.min(1, dt * 2));
    const ovDown = OV_ST.state === "down";
    M_OVEN_GLOW.emissiveIntensity = lerp(M_OVEN_GLOW.emissiveIntensity, ovDown ? 0.45 : 2.6, Math.min(1, dt * 2.2));
    _c0.set(ovDown ? 0xff5638 : 0xf2a73b);
    M_OVEN_GLOW.emissive.lerp(_c0, Math.min(1, dt * 2.2));

    for (let i = 0; i < PAINT.length; i++) {
      const R = PAINT[i];
      if (!ptDown) R.ph += dt * 0.36 * (PT_ST.state === "idle" ? 0.5 : 1);
      R.piv.rotation.y = R.yaw + 0.36 * Math.sin(R.ph + i * 1.6);
      R.piv.updateMatrixWorld(true);
      PAINT_ARM.setMatrixAt(i, R.piv.matrixWorld);
    }
    PAINT_ARM.instanceMatrix.needsUpdate = true;

    // painted bodies on the booth serpentine
    for (let i = 0; i < 4; i++) {
      if (!ptDown) PB_D[i] = (PB_D[i] + dt * 0.62) % PAINT_PATH.len;
      samplePath(PAINT_PATH, PB_D[i], _pathOut);
      _m0.makeRotationY(Math.atan2(-_pathOut[4], _pathOut[3]));
      _m0.setPosition(_pathOut[0], 0.86, _pathOut[2]);
      BODY_INST.setMatrixAt(i, _m0);
      BODY_GLASS.setMatrixAt(i, _m0);
    }
  }

  /* ============================================================
     OVERHEAD BODY CONVEYOR — paint → assembly through transferBridge
     ============================================================ */
  const OV_CTRL = [
    [11.4, 4.15, -19.1], [13.35, 4.3, -18.85], [14.9, 5.75, -18.2],
    [16.2, 7.05, -17.0], [16.6, 7.2, -13.2], [16.6, 7.2, -7.6],
    [17.25, 7.2, -3.2], [18.15, 7.2, 2.3], [18.9, 7.2, 7.0], [19.7, 7.2, 9.9],
  ];
  let OV_PATH = null, HANG_INST = null;
  const HANG_D = [0, 0, 0, 0];
  let OV_SPEED = 0.85;
  const BODY_DROP = 1.82;

  function hangerGeo() {
    return geoMerge([
      geoBox(0.6, 0.18, 0.36, 0, 0.02, 0),
      geoBox(0.17, 0.52, 0.17, 0, -0.26, 0),
      geoBox(1.9, 0.16, 0.18, 0, -0.5, 0),
      geoBox(0.14, 0.18, 0.14, -0.85, -0.58, 0),
      geoBox(0.14, 0.18, 0.14, 0.85, -0.58, 0),
      geoBox(1.7, 0.1, 0.14, 0, -0.66, 0),
      geoBox(0.1, 0.1, 0.1, -0.6, -0.4, 0),
      geoBox(0.1, 0.1, 0.1, 0.6, -0.4, 0),
    ]);
  }

  function buildOverhead() {
    OV_PATH = makePathLut(OV_CTRL, 200);
    // rails + chain
    pathBeams(OV_PATH, -0.22, 0, 0.09, 0.14, MAT.galv);
    pathBeams(OV_PATH, 0.22, 0, 0.09, 0.14, MAT.galv);
    pathBeams(OV_PATH, 0, -0.14, 0.26, 0.06, MAT.steelDark);
    // wall brackets off the oven east wall
    for (const zz of [-16.6, -11.2]) {
      beam([13.1, 8.2, zz], [16.78, 8.2, zz], 0.16, 0.2, MAT.galv);
      beam([13.1, 6.6, zz], [16.66, 7.94, zz], 0.11, 0.11, MAT.galv, { cast: false });
      beam([16.78, 8.12, zz], [16.6, 7.3, zz], 0.09, 0.09, MAT.galv, { cast: false });
      beam([13.1, 7.34, zz], [16.6, 7.28, zz], 0.1, 0.1, MAT.galv, { cast: false });
    }
    beam([13.1, 5.4, -19.3], [14.3, 6.5, -18.5], 0.1, 0.1, MAT.galv, { cast: false });
    // portal support frame across the bridge
    const A = [17.85, 9.15, -4.0], B = [19.35, 9.15, 7.1];
    for (const c of [[A[0], A[2]], [B[0], B[2]]]) {
      bb(0.34, 9.3, 0.34, c[0], 0, c[1], MAT.galv);
      bb(0.9, 0.1, 0.9, c[0], 0, c[1], MAT.machineDark, { cast: false });
      for (const s of [-1, 1]) beam([c[0] + s * 0.42, 0.12, c[1]], [c[0] + s * 0.17, 1.1, c[1]], 0.12, 0.12, MAT.galv, { cast: false });
    }
    beam(A, B, 0.34, 0.42, MAT.galv);
    beam([A[0], 8.3, A[2]], [B[0], 8.3, B[2]], 0.18, 0.18, MAT.galv, { cast: false });
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10, t1 = (i + 1) / 10;
      const x0 = A[0] + (B[0] - A[0]) * t0, z0 = A[2] + (B[2] - A[2]) * t0;
      const x1 = A[0] + (B[0] - A[0]) * t1, z1 = A[2] + (B[2] - A[2]) * t1;
      if (i % 2) beam([x0, 8.3, z0], [x1, 9.1, z1], 0.1, 0.1, MAT.galv, { cast: false });
      else beam([x0, 9.1, z0], [x1, 8.3, z1], 0.1, 0.1, MAT.galv, { cast: false });
    }
    // hanger rods from the portal beam down to the track
    const rodPts = [[-3.2, 17.25], [2.3, 18.15], [7.0, 18.9]];
    for (const rp of rodPts) {
      const t = (rp[0] - A[2]) / (B[2] - A[2]);
      const bx = A[0] + (B[0] - A[0]) * t;
      beam([bx, 8.32, rp[0]], [rp[1], 7.26, rp[0]], 0.09, 0.09, MAT.galv, { cast: false });
    }
    // access platform + stair at the first column
    b(1.9, 0.1, 1.7, 17.85, 2.6, -4.2, MAT.galv);
    for (const sx of [-1, 1]) b(0.06, 1.0, 1.7, 17.85 + sx * 0.92, 3.1, -4.2, MAT.galv, { cast: false });
    b(1.9, 0.06, 0.06, 17.85, 3.6, -5.02, MAT.galv, { cast: false });
    for (let k = 0; k < 8; k++) {
      const yy = 2.6 - (k + 0.5) * (2.6 / 8);
      b(1.0, 0.07, 0.34, 17.85, yy, -5.1 - k * 0.35, MAT.galv, { cast: false });
    }
    for (const sx of [-1, 1]) {
      beam([17.85 + sx * 0.5, 2.6, -5.1], [17.85 + sx * 0.5, 0.05, -7.9], 0.06, 1.0, MAT.galv, { cast: false });
      for (let k = 0; k < 4; k++) b(0.05, 0.9, 0.05, 17.85 + sx * 0.5, 2.2 - k * 0.62, -5.3 - k * 0.7, MAT.galv, { cast: false });
    }
    // end vestibule toward assembly (open to the north)
    b(2.1, 0.14, 2.2, 19.7, 8.5, 10.0, MAT.machineDark, { cast: false });
    b(0.14, 3.0, 2.2, 18.65, 7.0, 10.0, MAT.machineDark, { cast: false });
    b(2.1, 3.0, 0.14, 19.7, 7.0, 11.1, MAT.machineDark, { cast: false });
    b(2.1, 3.0, 0.04, 19.7, 7.0, 8.95, MAT.black, { cast: false });
    // sign on the portal beam
    signBoard("conv", 2.2, 0.55, 18.62, 8.7, 3.9, -0.62);
    // hangers
    HANG_INST = inst(hangerGeo(), MAT.galv, 4);
    for (let i = 0; i < 4; i++) {
      HANG_D[i] = (OV_PATH.len / 4) * i + 2.0;
      samplePath(OV_PATH, HANG_D[i], _pathOut);
      _m0.makeRotationY(Math.atan2(-_pathOut[4], _pathOut[3]));
      _m0.setPosition(_pathOut[0], _pathOut[1], _pathOut[2]);
      HANG_INST.setMatrixAt(i, _m0);
      _m0.setPosition(_pathOut[0], _pathOut[1] - BODY_DROP, _pathOut[2]);
      BODY_INST.setMatrixAt(4 + i, _m0);
      BODY_GLASS.setMatrixAt(4 + i, _m0);
    }
    BODY_INST.instanceMatrix.needsUpdate = true;
    BODY_GLASS.instanceMatrix.needsUpdate = true;
    HANG_INST.instanceMatrix.needsUpdate = true;
  }

  function tickOverhead(t, dt) {
    const run = OV_ST.state !== "down";
    if (run) {
      const v = dt * OV_SPEED * (OV_ST.state === "idle" ? 0.4 : 1);
      for (let i = 0; i < 4; i++) {
        HANG_D[i] = (HANG_D[i] + v) % OV_PATH.len;
        samplePath(OV_PATH, HANG_D[i], _pathOut);
        _m0.makeRotationY(Math.atan2(-_pathOut[4], _pathOut[3]));
        _m0.setPosition(_pathOut[0], _pathOut[1], _pathOut[2]);
        HANG_INST.setMatrixAt(i, _m0);
        _m0.setPosition(_pathOut[0], _pathOut[1] - BODY_DROP, _pathOut[2]);
        BODY_INST.setMatrixAt(4 + i, _m0);
        BODY_GLASS.setMatrixAt(4 + i, _m0);
      }
      HANG_INST.instanceMatrix.needsUpdate = true;
    }
    BODY_INST.instanceMatrix.needsUpdate = true;
    BODY_GLASS.instanceMatrix.needsUpdate = true;
  }

  /* ============================================================
     assembly / frame
     ============================================================ */
  function tickAll(t, dt) {
    updateBeacons();
    tickZ02(t, dt);
    tickZ03(t, dt);
    tickZ04(t, dt);
    tickOverhead(t, dt);
    tickSparks(dt);
    tickSpinners(t);
  }

  function buildQaFloor() {
    if (Q.floor !== "1") return;
    const m = new T.Mesh(new T.PlaneGeometry(220, 130), MAT.floor);
    m.rotation.x = -PI2;
    m.position.set(-8, 0.0, 0);
    m.receiveShadow = true;
    ST.add(m);
  }

  function buildAll() {
    ROOT.name = "process";
    ST.name = "process-static";
    makeMaterials();
    buildSignAtlas();
    buildQaFloor();
    buildZ02();
    buildZ03();
    buildZ04();
    buildOverhead();
    initBeaconVisuals();
    initSparks();
    initSpinners();
    mergeStatic(ST);
    scene.add(ROOT);
    addTick(tickAll);
    SIM.wip("Z02", 6);
    SIM.wip("Z03", 18);
    SIM.wip("Z04", 10);
  }

  window.buildProcess = function () { buildAll(); };
})();
