/* ============================================================
   45 · logistics — Z01 原材料立库 / AS-RS · 月台 · 厂区 · AGV
   Builds: high-bay racking (4 double rows / 3 crane aisles /
   12 levels), 3 animated stacker cranes, rack-end transfer
   conveyor + shipping buffer, inbound docks (west) with 3 backed
   trailers, outbound docks (east) with 2 trailers + car ramp,
   east yard containers / truck lanes / gate + guard hut,
   4 AGVs on AX.agvRoute, 2 counterbalance forklifts.
   Stations: ASRS-01 ASRS-02 ASRS-03 · DOCK-IN · AGV-01 · DOCK-OUT
   ============================================================ */
(function () {
  "use strict";

  /* ----------------------------------------------------------
     layout (metres, +x east / +z south / +y up)
     ---------------------------------------------------------- */
  const RACK_ROW_X = [-73.3, -66.5, -59.7, -52.9]; // double-rack row centres
  const AISLE_X = [-69.9, -63.1, -56.3];           // crane aisle centres
  const RACK_HW = 2.2;          // half width of a double row (2.2 m each side)
  const RACK_TOP = 19.8;
  const LEVELS = 12;
  const LEVEL_Y0 = 1.2;         // centre line of lowest pallet
  const LEVEL_PITCH = 1.6;
  const BAY = 1.5;
  const RACK_SEGS = [           // z segments (cross aisles at z = ±20, central gap ±8)
    { z0: 8.0, z1: 17.0 },
    { z0: 23.0, z1: 29.0 },
    { z0: -17.0, z1: -8.0 },
    { z0: -29.0, z1: -23.0 },
  ];
  const CRANE_ZMAX = 31.0;
  const CRANE_ZMIN = -30.9;
  const CONV_Z = 33.0;
  const CONV_Y = 0.85;
  const CONV_X0 = -74.0;
  const CONV_X1 = -49.4;
  const PAD_OFF = 2.0;          // P&D transfer conveyor offset from aisle centre
  const PICK_EXT = 1.55;
  const DEPOSIT_EXT = 1.3;
  const PALLET_Y = (lvl) => LEVEL_Y0 + lvl * LEVEL_PITCH;
  const CHARGE_BAY = { x: -66.0, z: -5.0 };
  const WEST = { wallIn: -77.75, wallOut: -78.25, doorH: 4.2, doorW: 4.5 };
  const EAST = { wallIn: 77.75, wallOut: 78.25, doorH: 4.2, doorW: 4.5 };

  /* local palette used by the vertex-coloured (instanced) machines */
  const C = {
    steel: 0x9aa1a5, steelDark: 0x3a4045, dark: 0x2c3136, galv: 0x9aa1a5,
    yellow: 0xe2a92b, orange: 0xd95c1e, white: 0xd9d4c8, cream: 0xd2cbbd,
    rubber: 0x17181a, wood: 0x9a7a4e, woodDark: 0x7d5f3a, card: 0xb08f63,
    card2: 0xa27f52, machine: 0x8f959a, glass: 0x2c3a41, glassClear: 0x93a8b2,
    red: 0xd8402c, green: 0x86c9a2, amber: 0xf0a13c, ledWhite: 0xfff2d8,
    concrete: 0x8a867e,
  };

  /* deterministic local random stream (independent of the shared rng) */
  const lrng = mulberry32(20261104 + 45);
  function lrand(a, b) { return a + (b - a) * lrng(); }
  function lpick(arr) { return arr[(lrng() * arr.length) | 0]; }

  /* ----------------------------------------------------------
     scratch objects — never allocate inside the tick
     ---------------------------------------------------------- */
  const _m4 = new T.Matrix4();
  const _p = new T.Vector3();
  const _q = new T.Quaternion();
  const _e = new T.Euler();
  const _s = new T.Vector3();
  const _col = new T.Color();

  /* ----------------------------------------------------------
     vertex-coloured geometry helpers (for instanced machines)
     ---------------------------------------------------------- */
  function paintGeo(g, hex) {
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    _col.setHex(hex);
    const r = _col.r, gg = _col.g, b = _col.b;
    for (let i = 0; i < n; i++) {
      col[i * 3] = r;
      col[i * 3 + 1] = gg;
      col[i * 3 + 2] = b;
    }
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    return g;
  }
  function pushBox(list, w, h, d, x, y, z, hex, o) {
    const g = new T.BoxGeometry(w, h, d);
    if (o) {
      if (o.rx) g.rotateX(o.rx);
      if (o.ry) g.rotateY(o.ry);
      if (o.rz) g.rotateZ(o.rz);
    }
    g.translate(x, y, z);
    paintGeo(g, hex);
    list.push(g);
    return g;
  }
  function pushCyl(list, rT, rB, h, seg, x, y, z, hex, o) {
    const g = new T.CylinderGeometry(rT, rB, h, seg || 10, 1, false);
    if (o) {
      if (o.rx) g.rotateX(o.rx);
      if (o.ry) g.rotateY(o.ry);
      if (o.rz) g.rotateZ(o.rz);
    }
    g.translate(x, y, z);
    paintGeo(g, hex);
    list.push(g);
    return g;
  }
  function mergeColored(list) { return mergeGeoms(list); }

  /* static vertex-coloured utility batch — one merged draw call for
     markings / ramps / cabinets / small painted parts (fewer materials) */
  const SV = [];
  function svBox(w, h, d, x, y, z, hex, o) { pushBox(SV, w, h, d, x, y, z, hex, o); }
  function svCyl(rT, rB, h, seg, x, y, z, hex, o) { pushCyl(SV, rT, rB, h, seg, x, y, z, hex, o); }
  function svFlat(w, d, x, z, hex, y) { pushBox(SV, w, 0.014, d, x, y === undefined ? 0.03 : y, z, hex); }
  function flushStaticVC(sg) {
    if (!SV.length) return null;
    const mat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.24, envMapIntensity: 0.7 });
    const m = new T.Mesh(mergeGeoms(SV), mat);
    m.receiveShadow = true;
    m.castShadow = false;
    sg.add(m);
    SV.length = 0;
    S.vcStaticMat = mat;
    return m;
  }

  function vcMetal() {
    return new T.MeshStandardMaterial({
      vertexColors: true, roughness: 0.44, metalness: 0.62, envMapIntensity: 0.85,
    });
  }
  function vcMatte() {
    return new T.MeshStandardMaterial({
      vertexColors: true, roughness: 0.66, metalness: 0.16, envMapIntensity: 0.72,
    });
  }
  /* neutral carton-wrap texture (load colour comes from the instance tint) */
  function makeCartonTexture() {
    return canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#b9b4ab";
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        ctx.fillStyle = "rgba(58,54,48,0.16)";
        ctx.fillRect(x, 0, 2, h);
      }
      ctx.fillStyle = "rgba(58,54,48,0.2)";
      ctx.fillRect(0, h * 0.46, w, 3);
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = "rgba(" + (rng() > 0.5 ? "255,255,255" : "40,38,34") + "," + (0.02 + rng() * 0.05).toFixed(3) + ")";
        ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 1 + rng() * 2);
      }
    });
  }

  /* matrix writer for InstancedMesh parts */
  function setPart(mesh, i, x, y, z, ry, sc) {
    _p.set(x, y, z);
    _e.set(0, ry || 0, 0);
    _q.setFromEuler(_e);
    const s = sc === undefined ? 1 : sc;
    _s.set(s, s, s);
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
  }
  function setPartFull(mesh, i, x, y, z, ry, sx, sy, sz) {
    _p.set(x, y, z);
    _e.set(0, ry || 0, 0);
    _q.setFromEuler(_e);
    _s.set(sx, sy, sz);
    _m4.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m4);
  }

  /* ----------------------------------------------------------
     module state (filled by build, consumed by tick)
     ---------------------------------------------------------- */
  const S = {
    group: null,
    staticG: null,
    cranes: [],
    craneMesh: {},
    craneSprite: [],
    agv: [],
    agvMesh: {},
    agvProxy: [],
    fork: [],
    forkMesh: {},
    convMesh: null,
    convPallets: [],
    route: null,
    signals: null,
    sigIdx: { crane: [], agv: [], fl: [], dockIn: [], dockOut: [], st: {} },
    stations: {},
    timers: {},
  };

  /* ==========================================================
     Z01 · AS/RS racking
     ========================================================== */
  function buildRacking(sg) {
    const uprights = [];
    const beams = [];
    const pallets = [];
    const boxes = [];
    const coils = [];
    // low-saturation load palette: kraft / shrink-wrap grey / blue-grey
    const boxTints = [0x7b6a55, 0x6b7074, 0x4e5b64, 0x8a8172, 0x6f6a60, 0x7d7466];
    const palletTints = [0xb9b0a2, 0xa89f92, 0xc2b9ab, 0x9e9588];
    const coilTints = [0xffffff, 0xdfe3e5, 0xc8ccce, 0xb0b5b8];

    for (let r = 0; r < RACK_ROW_X.length; r++) {
      const rowX = RACK_ROW_X[r];
      for (let s = 0; s < RACK_SEGS.length; s++) {
        const seg = RACK_SEGS[s];
        const bays = Math.round((seg.z1 - seg.z0) / BAY);
        // --- upright frames ---
        for (let f = 0; f <= bays; f++) {
          const z = seg.z0 + f * BAY;
          const xo = [-RACK_HW + 0.06, -0.1, 0.1, RACK_HW - 0.06];
          for (let k = 0; k < 4; k++) {
            uprights.push({ x: rowX + xo[k], y: RACK_TOP / 2, z: z, sx: 0.12, sy: RACK_TOP, sz: 0.12 });
          }
        }
        // --- beams + loads, level by level ---
        for (let lvl = 0; lvl < LEVELS; lvl++) {
          const beamY = LEVEL_Y0 - 0.15 + lvl * LEVEL_PITCH;
          const py = PALLET_Y(lvl);
          for (let side = -1; side <= 1; side += 2) {
            const bx = rowX + side * 1.1;
            // two pallet-support rails per side
            beams.push({ x: bx - 0.55, y: beamY, z: (seg.z0 + seg.z1) / 2, sx: 0.11, sy: 0.16, sz: seg.z1 - seg.z0 });
            beams.push({ x: bx + 0.55, y: beamY, z: (seg.z0 + seg.z1) / 2, sx: 0.11, sy: 0.16, sz: seg.z1 - seg.z0 });
            for (let b = 0; b < bays; b++) {
              if (lrng() > 0.64) continue; // ~35 % of slots stay empty so the steel grid reads
              const sz = seg.z0 + (b + 0.5) * BAY;
              const scl = lrand(0.96, 1.04);
              pallets.push({
                x: bx, y: py, z: sz, sx: scl, sy: 1, sz: scl,
                color: lpick(palletTints),
              });
              const kind = lrng();
              if (kind < 0.58) {
                const bh = lrng() < 0.38 ? lrand(0.26, 0.44) : lrand(0.52, 0.82); // half-height stacks
                boxes.push({
                  x: bx + lrand(-0.03, 0.03), y: py + 0.07 + bh / 2,
                  z: sz + lrand(-0.05, 0.05),
                  sx: lrand(0.72, 0.92), sy: bh, sz: lrand(0.62, 0.9),
                  ry: lrng() > 0.86 ? 0.12 : 0,
                  color: lpick(boxTints),
                });
              } else if (kind < 0.64) {
                coils.push({
                  x: bx, y: py + 0.07 + 0.44, z: sz,
                  sx: 1, sy: lrand(0.88, 1.05), sz: 1,
                  color: lpick(coilTints),
                });
              }
            }
          }
        }
        // --- end-frame diagonal braces (static, merged) ---
        for (let e2 = 0; e2 < 2; e2++) {
          const ez = e2 === 0 ? seg.z0 + 0.1 : seg.z1 - 0.1;
          for (let side = -1; side <= 1; side += 2) {
            const bx = rowX + side * 1.1;
            for (let lvl = 0; lvl < LEVELS; lvl += 6) {
              const by = LEVEL_Y0 + lvl * LEVEL_PITCH + 0.8;
              addBox(sg, 0.07, 2.6, 0.07, bx, by, ez, MAT.steelDark, { rotX: 0.62 });
            }
          }
        }
      }
    }

    /* --- collision guards: safety yellow at each aisle end --- */
    for (let a = 0; a < AISLE_X.length; a++) {
      for (const zEnd of [-29.6, 29.6]) {
        for (const dx of [-1.52, 1.52]) {
          addCylinderBase(sg, 0.13, 0.16, 1.15, 8, AISLE_X[a] + dx, 0, zEnd, MAT.yellow, { cast: true });
          addBox(sg, 0.3, 0.18, 0.3, AISLE_X[a] + dx, 0.09, zEnd, MAT.hazard, {});
        }
        // hazard band on the floor at the aisle mouth
        addPlaneXZ(sg, 2.3, 0.55, AISLE_X[a], 0.012, zEnd + (zEnd > 0 ? -0.85 : 0.85), MAT.hazard, {});
      }
    }
    // aisle floor guide lines
    for (let a = 0; a < AISLE_X.length; a++) {
      addPlaneXZ(sg, 0.09, 60.0, AISLE_X[a] - 1.12, 0.011, 0.2, MAT.yellow, {});
      addPlaneXZ(sg, 0.09, 60.0, AISLE_X[a] + 1.12, 0.011, 0.2, MAT.yellow, {});
    }

    /* --- instanced rack members --- */
    const unit = new T.BoxGeometry(1, 1, 1);
    addInstanced(sg, unit, MAT.steelDark, uprights, { cast: true, receive: true });
    addInstanced(sg, unit, MAT.steel, beams, { cast: false, receive: true });

    const palletGeo = new T.BoxGeometry(1.2, 0.14, 1.0);
    addInstanced(sg, palletGeo, MAT.pallet, pallets, { cast: false, receive: true });
    addInstanced(sg, unit, S.mats.carton, boxes, { cast: false, receive: true });
    const coilGeo = new T.CylinderGeometry(0.42, 0.42, 0.85, 8, 1, false);
    addInstanced(sg, coilGeo, MAT.galv, coils, { cast: false, receive: true });

    /* --- crane rail (bottom) + top guide rail --- */
    for (let a = 0; a < AISLE_X.length; a++) {
      const ax = AISLE_X[a];
      addBoxBase(sg, 0.18, 0.07, 62.0, ax, 0.0, 0.2, MAT.steelDark, { cast: false }); // bottom rail
      addBoxBase(sg, 0.10, 0.03, 62.0, ax, 0.07, 0.2, MAT.steel, { cast: false });    // running surface
      addBox(sg, 0.16, 0.14, 62.6, ax, 22.3, 0.2, MAT.steel, { cast: true });         // top guide rail
      // top rail supports: ties at rack top + posts up to the rail
      for (let z = -28; z <= 28; z += 6) {
        addBox(sg, 6.8, 0.18, 0.22, ax, RACK_TOP + 0.06, z, MAT.steelDark, { cast: true });
        addBox(sg, 0.14, 2.5, 0.14, ax, RACK_TOP + 1.25, z, MAT.steelDark, { cast: true });
        addBox(sg, 0.1, 0.1, 1.0, ax, 22.02, z, MAT.steelDark, { cast: false });
      }
      // crane power rail (festoon conductor) along one side
      addBox(sg, 0.07, 0.09, 62.0, ax - 1.05, 19.6, 0.2, MAT.steel, { cast: false });
      // aisle mouth floor hazard strips (drive-over, no collision)
      addPlaneXZ(sg, 2.0, 0.5, ax, 0.012, 31.0, MAT.hazard, {});
      addPlaneXZ(sg, 2.0, 0.5, ax, 0.012, -30.8, MAT.hazard, {});
    }

    /* --- high-bay LED strip lights along the rack tops --- */
    for (let r = 0; r < RACK_ROW_X.length; r++) {
      for (let z = -27; z <= 27; z += 9) {
        addBox(sg, 0.14, 0.06, 2.6, RACK_ROW_X[r], RACK_TOP + 0.2, z, MAT.ledWarm, { cast: false, receive: false });
      }
    }

    /* --- rack guards / floor markings for the P&D area --- */
    svFlat(26.0, 3.4, -62.5, 31.4, C.concrete, 0.011);
    for (let a = 0; a < AISLE_X.length; a++) {
      addBoxBase(sg, 0.12, 1.0, 0.12, AISLE_X[a] - 2.0, 0, 30.1, MAT.yellow, { cast: true });
      addBoxBase(sg, 0.12, 1.0, 0.12, AISLE_X[a] + 2.0, 0, 30.1, MAT.yellow, { cast: true });
    }
  }

  /* ==========================================================
     Z01 · stacker cranes (instanced vertex-coloured parts)
     ========================================================== */
  function craneBridgeGeo() {
    const g = [];
    // travelling base
    pushBox(g, 2.2, 0.42, 1.5, 0, 0.5, 0, C.dark);
    pushBox(g, 2.5, 0.18, 1.7, 0, 0.82, 0, C.yellow);
    pushBox(g, 2.52, 0.14, 0.22, 0, 0.62, 0.78, C.yellow);
    pushBox(g, 2.52, 0.14, 0.22, 0, 0.62, -0.78, C.yellow);
    // bogie wheels
    for (const wx of [-0.86, 0.86]) {
      for (const wz of [-0.62, 0.62]) {
        pushCyl(g, 0.19, 0.19, 0.16, 10, wx, 0.19, wz, C.rubber, { rz: PI / 2 });
        pushBox(g, 0.3, 0.22, 0.34, wx, 0.3, wz, C.steelDark);
      }
    }
    // four-column lattice mast (0.9 x 1.0 m footprint, 21.4 m tall)
    for (const mx of [-0.45, 0.45]) {
      for (const mz of [-0.5, 0.5]) {
        pushBox(g, 0.16, 21.4, 0.16, mx, 11.6, mz, C.yellow);
      }
    }
    for (let i = 0; i < 15; i++) {
      const y = 1.62 + i * 1.4;
      pushBox(g, 1.06, 0.12, 0.12, 0, y, 0.5, C.steelDark);
      pushBox(g, 1.06, 0.12, 0.12, 0, y, -0.5, C.steelDark);
      pushBox(g, 0.12, 0.12, 1.16, 0.45, y, 0, C.steelDark);
      pushBox(g, 0.12, 0.12, 1.16, -0.45, y, 0, C.steelDark);
      if (i < 14) {
        pushBox(g, 1.7, 0.06, 0.06, 0, y + 0.7, 0.5, C.steelDark, { rz: i % 2 ? 0.95 : -0.95 });
        pushBox(g, 1.7, 0.06, 0.06, 0, y + 0.7, -0.5, C.steelDark, { rz: i % 2 ? -0.95 : 0.95 });
      }
    }
    // machinery house + top guide rollers
    pushBox(g, 1.02, 0.62, 1.2, 0, 21.5, 0, C.yellow);
    pushBox(g, 1.06, 0.12, 1.24, 0, 21.86, 0, C.steelDark);
    pushBox(g, 0.4, 0.3, 0.4, 0, 22.05, 0, C.yellow);
    for (const wz of [-0.42, 0.42]) {
      pushCyl(g, 0.13, 0.13, 0.14, 8, 0, 22.18, wz, C.steelDark, {});
    }
    pushBox(g, 0.1, 0.62, 0.1, 0.52, 22.15, 0.34, C.steelDark);
    pushBox(g, 0.16, 0.12, 0.16, 0.52, 22.5, 0.34, C.dark);
    // hazard chevrons on the base ends
    for (const mx of [-1.02, 1.02]) {
      pushBox(g, 0.14, 0.36, 1.3, mx, 0.48, 0, C.yellow);
    }
    // operator cab on the base, facing +z
    pushBox(g, 0.55, 0.42, 0.55, 0, 1.02, 0.96, C.steelDark);
    pushBox(g, 1.0, 1.5, 1.05, 0, 1.95, 1.16, C.cream);
    pushBox(g, 1.04, 0.3, 1.09, 0, 2.85, 1.16, C.orange);
    pushBox(g, 0.86, 0.74, 0.05, 0, 2.1, 1.7, C.glass);
    pushBox(g, 0.05, 0.62, 0.8, 0.5, 2.02, 1.16, C.glass);
    pushBox(g, 0.06, 0.9, 0.1, -0.42, 1.92, 1.7, C.dark);
    // handrails on base
    pushBox(g, 2.3, 0.06, 0.06, 0, 1.15, -0.82, C.yellow);
    pushBox(g, 0.06, 1.0, 0.06, 1.1, 0.62, -0.82, C.yellow);
    pushBox(g, 0.06, 1.0, 0.06, -1.1, 0.62, -0.82, C.yellow);
    // cable carrier tray
    pushBox(g, 0.24, 0.1, 1.2, -0.78, 0.9, 0, C.steelDark);
    return mergeColored(g);
  }
  function craneCarriageGeo() {
    const g = [];
    pushBox(g, 1.3, 0.3, 1.5, 0, 0, 0, C.steelDark);
    pushBox(g, 0.14, 0.3, 0.16, 0.56, 0.06, 0.6, C.yellow);
    pushBox(g, 0.14, 0.3, 0.16, 0.56, 0.06, -0.6, C.yellow);
    pushBox(g, 0.14, 0.3, 0.16, -0.56, 0.06, 0.6, C.yellow);
    pushBox(g, 0.14, 0.3, 0.16, -0.56, 0.06, -0.6, C.yellow);
    pushBox(g, 0.12, 0.82, 1.0, -0.42, 0.28, 0, C.steelDark);
    // small operator cab hanging on the +z side
    pushBox(g, 0.82, 1.12, 0.8, 0, 1.05, 0.98, C.cream);
    pushBox(g, 0.86, 0.12, 0.84, 0, 1.63, 0.98, C.orange);
    pushBox(g, 0.68, 0.62, 0.05, 0, 1.12, 1.4, C.glass);
    pushBox(g, 0.05, 0.5, 0.56, 0.42, 1.06, 0.98, C.glass);
    pushBox(g, 0.06, 0.75, 0.06, -0.36, 1.42, 0.98, C.steelDark);
    pushBox(g, 0.5, 0.34, 0.14, 0, 0.42, 0.98, C.dark);
    return mergeColored(g);
  }
  function craneForkGeo() {
    const g = [];
    pushBox(g, 0.42, 0.52, 0.92, 0, 0.02, 0, C.steelDark);
    pushBox(g, 0.1, 0.74, 0.86, 0.26, 0.16, 0, C.steel);
    pushBox(g, 1.2, 0.08, 0.17, 0.72, -0.13, 0.32, C.galv);
    pushBox(g, 1.2, 0.08, 0.17, 0.72, -0.13, -0.32, C.galv);
    pushBox(g, 0.16, 0.16, 0.16, 0.05, -0.16, 0.32, C.yellow);
    pushBox(g, 0.16, 0.16, 0.16, 0.05, -0.16, -0.32, C.yellow);
    return mergeColored(g);
  }
  function craneLoadGeo() {
    const g = [];
    pushBox(g, 1.2, 0.14, 1.0, 0, 0, 0, C.wood);
    pushBox(g, 0.98, 0.72, 0.88, 0, 0.43, 0, C.card);
    pushBox(g, 0.7, 0.08, 0.9, 0, 0.79, 0, C.card2);
    return mergeColored(g);
  }

  function buildCranes(parent) {
    const bridgeGeo = craneBridgeGeo();
    const carriageGeo = craneCarriageGeo();
    const forkGeo = craneForkGeo();
    const loadGeo = craneLoadGeo();
    const mBridge = vcMetal();
    const mCarriage = vcMetal();
    const mFork = vcMetal();
    const mLoad = vcMatte();

    const mk = (geo, mat, n) => {
      const m = new T.InstancedMesh(geo, mat, n);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      parent.add(m);
      return m;
    };
    S.craneMesh.bridge = mk(bridgeGeo, mBridge, 3);
    S.craneMesh.carriage = mk(carriageGeo, mCarriage, 3);
    S.craneMesh.fork = mk(forkGeo, mFork, 3);
    S.craneMesh.load = mk(loadGeo, mLoad, 3);
    S.craneMesh.fork.castShadow = false;
    S.craneMesh.load.castShadow = false;

    for (let i = 0; i < 3; i++) {
      S.cranes.push({
        z: CRANE_ZMAX - i * 7, y: 0.87, ext: 0, load: 0, side: 1,
        phase: i * 0.31, cycle: 0, period: 56 + i * 5, seed: 91 + i * 37,
        tgtZ: -6 + i * 8, tgtY: 0.87,
      });
      craneTargets(S.cranes[i]);
    }
    poseCranes(0);
  }

  function craneTargets(c) {
    const rr = mulberry32(c.seed + c.cycle * 7919);
    c.tgtZ = -28.2 + rr() * 56.4;
    c.tgtY = PALLET_Y(Math.floor(rr() * LEVELS)) - 0.05;
    c.side = rr() > 0.5 ? 1 : -1;
  }

  function smooth01(x) { const t = x < 0 ? 0 : x > 1 ? 1 : x; return t * t * (3 - 2 * t); }

  function poseCranes(dt) {
    for (let i = 0; i < 3; i++) {
      const c = S.cranes[i];
      const p = c.phase;
      let z, y = 0.87, ext = 0, load = 0, side = c.side;
      if (p < 0.34) {
        z = lerp(CRANE_ZMAX, c.tgtZ, smooth01(p / 0.34));
        side = c.side;
      } else if (p < 0.45) {
        z = c.tgtZ;
        y = lerp(0.87, c.tgtY, smooth01((p - 0.34) / 0.11));
        side = c.side;
      } else if (p < 0.52) {
        z = c.tgtZ;
        y = c.tgtY;
        ext = lerp(0, PICK_EXT, smooth01((p - 0.45) / 0.07));
        side = c.side;
        load = p > 0.49 ? 1 : 0;
      } else if (p < 0.62) {
        z = c.tgtZ;
        y = c.tgtY;
        ext = lerp(PICK_EXT, 0, smooth01((p - 0.52) / 0.10));
        side = c.side;
        load = 1;
      } else if (p < 0.80) {
        const t = smooth01((p - 0.62) / 0.18);
        z = lerp(c.tgtZ, CRANE_ZMAX, t);
        y = lerp(c.tgtY, 0.87, t);
        side = c.side;
        load = 1;
      } else if (p < 0.90) {
        z = CRANE_ZMAX;
        y = 0.87;
        ext = lerp(0, DEPOSIT_EXT, smooth01((p - 0.80) / 0.10));
        side = c.side;
        load = p < 0.885 ? 1 : 0;
      } else {
        z = CRANE_ZMAX;
        y = 0.87;
        ext = lerp(DEPOSIT_EXT, 0, smooth01((p - 0.90) / 0.10));
        side = c.side;
        load = 0;
      }
      c.z = z; c.y = y; c.ext = ext; c.load = load; c.side = side;
      const ax = AISLE_X[i];
      setPart(S.craneMesh.bridge, i, ax, 0, z, 0);
      setPart(S.craneMesh.carriage, i, ax, y, z, side > 0 ? 0 : PI);
      // fork slide: extends from the carriage toward the picked/placed side
      setPart(S.craneMesh.fork, i, ax + side * ext, y, z, side > 0 ? 0 : PI);
      if (load) {
        setPartFull(S.craneMesh.load, i, ax + side * (ext + 0.72), y + 0.05, z, side > 0 ? 0 : PI, 1, 1, 1);
      } else {
        setPart(S.craneMesh.load, i, ax, -50, z, 0, 0.0001);
      }
    }
    S.craneMesh.bridge.instanceMatrix.needsUpdate = true;
    S.craneMesh.carriage.instanceMatrix.needsUpdate = true;
    S.craneMesh.fork.instanceMatrix.needsUpdate = true;
    S.craneMesh.load.instanceMatrix.needsUpdate = true;
  }

  /* ==========================================================
     Z01 · rack-end transfer conveyor + shipping buffer
     ========================================================== */
  function conveyorRun(sg, along, a0, a1, fixed, y, width) {
    // along: "x" => runs along x at z = fixed; "z" => runs along z at x = fixed
    const len = Math.abs(a1 - a0);
    const mid = (a0 + a1) / 2;
    if (along === "x") {
      addBox(sg, len, 0.12, 0.16, mid, y - 0.11, fixed - width / 2, MAT.steel, { cast: true });
      addBox(sg, len, 0.12, 0.16, mid, y - 0.11, fixed + width / 2, MAT.steel, { cast: true });
      addBox(sg, len, 0.06, width, mid, y - 0.24, fixed, MAT.steelDark, { cast: false });
      for (let x = Math.min(a0, a1) + 1; x < Math.max(a0, a1); x += 3.2) {
        addBoxBase(sg, 0.1, y - 0.3, 0.1, x, 0, fixed - width / 2 + 0.06, MAT.steel, { cast: true });
        addBoxBase(sg, 0.1, y - 0.3, 0.1, x, 0, fixed + width / 2 - 0.06, MAT.steel, { cast: true });
        addBox(sg, 0.08, 0.06, width, x, 0.12, fixed, MAT.steelDark, { cast: false });
      }
    } else {
      addBox(sg, 0.16, 0.12, len, fixed - width / 2, y - 0.11, mid, MAT.steel, { cast: true });
      addBox(sg, 0.16, 0.12, len, fixed + width / 2, y - 0.11, mid, MAT.steel, { cast: true });
      addBox(sg, width, 0.06, len, fixed, y - 0.24, mid, MAT.steelDark, { cast: false });
      for (let z = Math.min(a0, a1) + 1; z < Math.max(a0, a1); z += 3.2) {
        addBoxBase(sg, 0.1, y - 0.3, 0.1, fixed - width / 2 + 0.06, 0, z, MAT.steel, { cast: true });
        addBoxBase(sg, 0.1, y - 0.3, 0.1, fixed + width / 2 - 0.06, 0, z, MAT.steel, { cast: true });
        addBox(sg, width, 0.06, 0.08, fixed, 0.12, z, MAT.steelDark, { cast: false });
      }
    }
  }

  function buildConveyor(sg, parent) {
    // main take-away conveyor: along x at the south rack ends, heading east
    conveyorRun(sg, "x", CONV_X0, CONV_X1, CONV_Z, CONV_Y, 1.15);
    // six P&D spur conveyors: one either side of every crane aisle
    for (let a = 0; a < AISLE_X.length; a++) {
      for (const side of [-1, 1]) {
        const cx = AISLE_X[a] + side * PAD_OFF;
        conveyorRun(sg, "z", 30.35, CONV_Z - 0.6, cx, CONV_Y, 1.4);
        // sensor post + pallet stop at the P&D station
        addBoxBase(sg, 0.1, 1.3, 0.1, cx - 0.72, 0, 30.5, MAT.steel, { cast: true });
        svBox(0.22, 0.26, 0.05, cx - 0.72, 1.2, 30.5, C.dark);
        addBox(sg, 1.3, 0.1, 0.1, cx, CONV_Y + 0.03, 30.45, MAT.yellow, { cast: false });
        // floor marking of the station
        addPlaneXZ(sg, 2.3, 1.9, cx, 0.012, 31.4, MAT.hazard, {});
      }
    }
    // transfer turntable where main conveyor leaves Z01
    svBox(1.9, 0.12, 1.9, CONV_X1, CONV_Y - 0.2, CONV_Z, C.steel);

    // rollers (instanced)
    const rollerGeo = new T.CylinderGeometry(0.055, 0.055, 1, 5, 1, false);
    rollerGeo.rotateX(PI / 2); // axis along z
    const rollerItems = [];
    for (let x = CONV_X0 + 0.3; x < CONV_X1; x += 0.46) {
      rollerItems.push({ x: x, y: CONV_Y + 0.02, z: CONV_Z, sx: 1, sy: 1, sz: 1.1 });
    }
    for (let a = 0; a < AISLE_X.length; a++) {
      for (const side of [-1, 1]) {
        const cx = AISLE_X[a] + side * PAD_OFF;
        for (let z = 30.5; z < CONV_Z - 0.7; z += 0.46) {
          rollerItems.push({ x: cx, y: CONV_Y + 0.02, z: z, ry: PI / 2, sz: 1.35 });
        }
      }
    }
    addInstanced(sg, rollerGeo, MAT.steel, rollerItems, { cast: false, receive: true });

    // moving pallets on the take-away conveyor (instanced, animated)
    const convGeo = new T.BoxGeometry(1.15, 0.14, 1.0);
    const conv = new T.InstancedMesh(convGeo, MAT.pallet, 6);
    conv.castShadow = false;
    conv.receiveShadow = true;
    conv.frustumCulled = false;
    conv.instanceMatrix.setUsage(T.DynamicDrawUsage);
    parent.add(conv);
    S.convMesh = conv;
    for (let i = 0; i < 6; i++) {
      S.convPallets.push({ d: (i / 6) * (CONV_X1 - CONV_X0 - 0.6) });
    }

    /* --- shipping buffer / staging stage near x≈-49 --- */
    const bx = -49.0, bz = 30.9;
    svFlat(3.3, 4.0, bx, bz, C.concrete, 0.004);
    addPlaneXZ(sg, 3.5, 0.12, bx, 0.016, bz - 2.06, MAT.yellow, {});
    addPlaneXZ(sg, 3.5, 0.12, bx, 0.016, bz + 2.06, MAT.yellow, {});
    addPlaneXZ(sg, 0.12, 4.0, bx - 1.72, 0.016, bz, MAT.yellow, {});
    addPlaneXZ(sg, 0.12, 4.0, bx + 1.72, 0.016, bz, MAT.yellow, {});
    // staged pallets (static, merged)
    const stk = [
      [-49.7, 29.9, 1], [-48.2, 29.9, 2], [-49.7, 31.2, 2], [-48.2, 31.2, 1],
      [-48.9, 30.5, 1],
    ];
    for (const s2 of stk) {
      for (let h = 0; h < s2[2]; h++) {
        addBox(sg, 1.2, 0.14, 1.0, s2[0], 0.07 + h * 1.05, s2[1], MAT.pallet, { cast: true });
        if (h === s2[2] - 1) {
          addBox(sg, 0.85, 0.8, 0.8, s2[0], 0.54 + h * 1.05, s2[1], MAT.cardboard, { cast: true });
        }
      }
    }
    // buffer sign posts (behind the take-away conveyor)
    addBoxBase(sg, 0.08, 2.9, 0.08, bx - 1.5, 0, bz + 2.9, MAT.steel, { cast: true });
    addBoxBase(sg, 0.08, 2.9, 0.08, bx + 1.5, 0, bz + 2.9, MAT.steel, { cast: true });
  }

  /* ==========================================================
     docks — leveler ramps, seals, bumpers, markings
     ========================================================== */
  function buildDockInside(sg, wallIn, wallOut, dir, doorZ) {
    const g = new T.Group();
    sg.add(g);
    const len = 3.9, wid = 3.5;
    const tilt = Math.atan2(1.11, len);
    const cx = wallIn + dir * (len / 2 + 0.05);
    // sloped leveler plate: high at the trailer bed, flush with the hall floor
    svBox(len, 0.1, wid, cx, 0.585, doorZ, C.galv, { rz: -dir * tilt });
    // side lips / kerbs
    addBox(g, len, 0.14, 0.12, cx, 0.70, doorZ - wid / 2 + 0.06, MAT.yellow, { rotZ: -dir * tilt, cast: true });
    addBox(g, len, 0.14, 0.12, cx, 0.70, doorZ + wid / 2 - 0.06, MAT.yellow, { rotZ: -dir * tilt, cast: true });
    // pit frame in the floor
    addBoxBase(g, len + 0.4, 0.09, 0.3, cx, 0, doorZ - wid / 2 - 0.2, MAT.hazard, { cast: false });
    addBoxBase(g, len + 0.4, 0.09, 0.3, cx, 0, doorZ + wid / 2 + 0.2, MAT.hazard, { cast: false });
    addBoxBase(g, 0.3, 0.09, wid + 0.7, wallIn + dir * (len + 0.25), 0, doorZ, MAT.hazard, { cast: false });
    // dock bumpers (outside face)
    for (const dz of [-1.85, 1.85]) {
      addBox(g, 0.34, 0.55, 0.5, wallOut - dir * 0.18, 0.85, doorZ + dz, MAT.rubber, { cast: true });
    }
    // dock seal / shelter pads
    for (const dz of [-2.3, 2.3]) {
      addBox(g, 0.34, 3.6, 0.5, wallOut - dir * 0.17, 2.2, doorZ + dz, MAT.rubber, { cast: true });
    }
    addBox(g, 0.34, 0.6, 5.1, wallOut - dir * 0.17, 4.45, doorZ, MAT.rubber, { cast: true });
    // light bar + lamp head above the doorway (inside)
    addBoxBase(g, 0.09, 0.1, 0.09, wallIn + dir * 0.55, 4.55, doorZ + 1.9, MAT.steel, {});
    svBox(0.5, 0.16, 0.72, wallIn + dir * 0.32, 4.5, doorZ, C.dark);
    addBox(g, 0.34, 0.07, 0.56, wallIn + dir * 0.2, 4.44, doorZ, MAT.ledWarm, { cast: false, receive: false });
    // control cabinet
    svBox(0.42, 1.35, 0.62, wallIn + dir * 0.62, 0.675, doorZ + 2.85, C.dark);
    svBox(0.02, 0.3, 0.4, wallIn + dir * 0.42, 1.05, doorZ + 2.85, 0x9fb6c2);
    // floor markings
    addPlaneXZ(g, 1.1, 4.6, wallIn + dir * 1.5, 0.02, doorZ, MAT.hazard, {});
    addBoxBase(g, 0.16, 0.9, 0.16, wallIn + dir * 2.9, 0, doorZ - 2.5, MAT.yellow, {});
    addBoxBase(g, 0.16, 0.9, 0.16, wallIn + dir * 2.9, 0, doorZ + 2.5, MAT.yellow, {});
    return g;
  }

  /* --- trailer body (local: rear at x=0, extends +x) --- */
  function buildTrailer(sg, xRear, z, rotY, opt) {
    const g = new T.Group();
    g.position.set(xRear, 0, z);
    g.rotation.y = rotY;
    sg.add(g);
    const W = 2.5, bed = 1.15, top = 3.82, L = 13.2, bc = 0.14 + L / 2;
    const bodyMat = opt.dark ? S.mats.containerDark : MAT.container;
    // chassis
    addBox(g, L - 0.4, 0.24, 0.24, bc - 0.1, 1.0, -0.55, MAT.truckDark, { cast: true });
    addBox(g, L - 0.4, 0.24, 0.24, bc - 0.1, 1.0, 0.55, MAT.truckDark, { cast: true });
    for (let i = 0; i < 6; i++) {
      addBox(g, 0.16, 0.16, 2.1, 1.0 + i * 2.2, 1.0, 0, MAT.truckDark, { cast: false });
    }
    // bed floor
    addBox(g, L, 0.14, 2.42, bc, bed - 0.07, 0, MAT.steelDark, { cast: false });
    if (opt.open) {
      // hollow body: walls + roof, rear opening with the doors swung out
      addBox(g, L, 2.6, 0.1, bc, bed + 1.3, -W / 2 + 0.05, bodyMat, { cast: true });
      addBox(g, L, 2.6, 0.1, bc, bed + 1.3, W / 2 - 0.05, bodyMat, { cast: true });
      addBox(g, 0.1, 2.6, W, bc + L / 2 - 0.05, bed + 1.3, 0, bodyMat, { cast: true });
      addBox(g, L, 0.1, W, bc, top, 0, MAT.truckDark, { cast: true });
      addBox(g, L, 0.1, 0.12, bc, bed + 2.55, -W / 2 + 0.05, MAT.truckDark, { cast: false });
      addBox(g, L, 0.1, 0.12, bc, bed + 2.55, W / 2 - 0.05, MAT.truckDark, { cast: false });
      // pallets inside
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 2; c++) {
          const px = 1.4 + r * 2.6, pz = c === 0 ? -0.55 : 0.55;
          addBox(g, 1.15, 0.14, 1.0, px, bed + 0.07, pz, MAT.pallet, { cast: true });
          addBox(g, 0.9, 0.72, 0.8, px, bed + 0.5, pz, MAT.cardboard, { cast: true });
        }
      }
      // rear frame + two doors swung outward
      addBox(g, 0.16, 2.62, 0.16, 0.06, bed + 1.3, -W / 2 + 0.06, MAT.truckDark, { cast: true });
      addBox(g, 0.16, 2.62, 0.16, 0.06, bed + 1.3, W / 2 - 0.06, MAT.truckDark, { cast: true });
      addBox(g, 0.16, 0.18, W, 0.06, top - 0.06, 0, MAT.truckDark, { cast: true });
      for (const side of [-1, 1]) {
        const dg = new T.Group();
        dg.position.set(0.1, 0, side * (W / 2 - 0.03));
        dg.rotation.y = side * 2.35;
        g.add(dg);
        addBox(dg, 0.07, 2.4, 1.15, 0.03, bed + 1.25, -side * 0.6, bodyMat, { cast: true });
        addBox(dg, 0.1, 2.4, 0.1, 0.05, bed + 1.25, -side * 1.15, MAT.truckDark, { cast: false });
        for (let i = 0; i < 3; i++) {
          addCylinder(dg, 0.03, 0.03, 2.2, 6, 0.1, bed + 1.25, -side * (0.2 + i * 0.4), MAT.steel, {});
        }
      }
    } else {
      // closed box body
      addBox(g, L, 2.62, W, bc, (bed + top) / 2, 0, bodyMat, { cast: true });
      addBox(g, L, 0.1, 0.1, bc, top - 0.1, -W / 2 - 0.02, MAT.truckDark, { cast: false });
      addBox(g, L, 0.1, 0.1, bc, top - 0.1, W / 2 + 0.02, MAT.truckDark, { cast: false });
      addBox(g, L, 0.12, 0.1, bc, bed + 0.1, -W / 2 - 0.02, MAT.truckDark, { cast: false });
      addBox(g, L, 0.12, 0.1, bc, bed + 0.1, W / 2 + 0.02, MAT.truckDark, { cast: false });
      // rear doors
      addBox(g, 0.09, 2.5, 1.2, 0.06, bed + 1.3, -0.61, bodyMat, { cast: true });
      addBox(g, 0.09, 2.5, 1.2, 0.06, bed + 1.3, 0.61, bodyMat, { cast: true });

    }
    // rear frame & bumper / lights
    addBox(g, 0.18, 0.18, 2.5, 0.02, 0.58, 0, MAT.truckDark, { cast: true });
    addBox(g, 0.16, 0.3, 2.5, 0.0, 0.42, 0, MAT.truckDark, { cast: true });
    for (const dz of [-0.95, 0.95]) {
      addBox(g, 0.06, 0.16, 0.34, 0.0, 0.72, dz, MAT.ledRed, { cast: false, receive: false });
      addBox(g, 0.06, 0.16, 0.2, 0.0, 0.9, dz * 1.15, MAT.ledWarm, { cast: false, receive: false });
    }
    // rear axles / wheels
    for (const ax of [1.7, 3.0]) {
      for (const dz of [-1.1, 1.1]) {
        addCylinder(g, 0.5, 0.5, 0.3, 10, ax, 0.5, dz, MAT.tyre, { rotX: PI / 2 });
        addBox(g, 0.5, 0.12, 0.36, ax, 0.5, dz, MAT.steelDark, { cast: false });
      }
      addBox(g, 2.0, 0.1, 2.3, ax + 0.0, 1.02, 0, MAT.steelDark, { cast: false });
    }
    // mudguards + flaps
    for (const dz of [-1.18, 1.18]) {
      addBox(g, 2.4, 0.1, 0.42, 2.35, 1.1, dz, MAT.truckDark, { cast: false });
      addBox(g, 0.05, 0.45, 0.4, 1.2, 0.78, dz, MAT.rubber, { cast: false });
    }
    // landing legs
    addBox(g, 0.16, 0.86, 0.16, 10.8, 0.45, -0.62, MAT.steelDark, { cast: true });
    addBox(g, 0.16, 0.86, 0.16, 10.8, 0.45, 0.62, MAT.steelDark, { cast: true });
    addBox(g, 0.4, 0.1, 0.3, 10.8, 0.05, -0.62, MAT.steelDark, { cast: false });
    addBox(g, 0.4, 0.1, 0.3, 10.8, 0.05, 0.62, MAT.steelDark, { cast: false });
    // side skirts + company stripe
    for (const dz of [-W / 2 - 0.03, W / 2 + 0.03]) {
      addBox(g, 4.4, 0.5, 0.06, 8.3, 0.72, dz, MAT.truckDark, { cast: false });
      addBox(g, 7.6, 0.16, 0.03, 6.0, 2.5, dz, MAT.yellow, { cast: false });
    }
    return g;
  }

  /* --- tractor unit (local: fifth wheel at x=0, nose +x) --- */
  function buildTractor(sg, x, z, rotY, cabMat) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    sg.add(g);
    // chassis
    addBox(g, 5.6, 0.26, 0.9, 2.7, 1.05, 0, MAT.truckDark, { cast: true });
    addBox(g, 1.2, 0.18, 1.15, 0.55, 1.33, 0, MAT.steelDark, { cast: false }); // fifth wheel
    // cab
    addBox(g, 2.5, 1.0, 2.4, 4.15, 1.72, 0, cabMat, { cast: true });
    addBox(g, 2.1, 1.42, 2.3, 4.3, 2.93, 0, cabMat, { cast: true });
    addBox(g, 1.7, 0.5, 2.2, 3.75, 3.86, 0, cabMat, { cast: true });
    // glass
    addBox(g, 0.07, 1.02, 1.9, 5.36, 2.94, 0, MAT.glassDark, { cast: false });
    for (const dz of [-1.15, 1.15]) {
      addBox(g, 1.5, 0.66, 0.05, 4.2, 3.02, dz, MAT.glassDark, { cast: false });
    }
    // front / grille / bumper
    addBox(g, 0.12, 0.7, 1.7, 5.5, 1.55, 0, MAT.truckDark, { cast: true });
    addBox(g, 0.3, 0.34, 2.4, 5.45, 1.0, 0, MAT.steelDark, { cast: true });
    for (const dz of [-0.78, 0.78]) {
      addBox(g, 0.08, 0.2, 0.42, 5.58, 1.28, dz, MAT.ledWarm, { cast: false, receive: false });
    }
    // mirrors + exhaust + fuel tanks
    for (const dz of [-1.32, 1.32]) {
      addBox(g, 0.06, 0.5, 0.1, 5.1, 3.1, dz, MAT.truckDark, { cast: false });
    }
    addBox(g, 0.14, 1.7, 0.14, 3.3, 2.5, 1.16, MAT.steel, { cast: true });
    for (const dz of [-1.05, 1.05]) {
      addCylinder(g, 0.33, 0.33, 1.25, 10, 2.2, 0.72, dz, MAT.steel, { rotX: PI / 2 });
    }
    // roof marker lights
    for (let i = 0; i < 3; i++) {
      addBox(g, 0.12, 0.08, 0.18, 4.9 - i * 0.22, 4.16, -0.6 + i * 0.6, MAT.ledWarm, { cast: false, receive: false });
    }
    // wheels: steer axle + two rear axles (dual)
    for (const dz of [-1.02, 1.02]) {
      addCylinder(g, 0.55, 0.55, 0.34, 10, 4.95, 0.55, dz, MAT.tyre, { rotX: PI / 2 });
    }
    for (const ax of [1.3, 2.55]) {
      for (const dz of [-1.0, 1.0]) {
        addCylinder(g, 0.55, 0.55, 0.5, 10, ax, 0.55, dz, MAT.tyre, { rotX: PI / 2 });
      }
      addBox(g, 2.1, 0.1, 2.3, ax, 1.1, 0, MAT.steelDark, { cast: false });
    }
    for (const dz of [-1.22, 1.22]) {
      addBox(g, 1.9, 0.1, 0.46, 2.0, 1.16, dz, MAT.truckDark, { cast: false });
    }
    return g;
  }

  /* ==========================================================
     Z01/Z06 · inbound & outbound dock environment
     ========================================================== */
  function buildInbound(sg, parent) {
    const docks = AX.inboundDocks;
    for (let i = 0; i < docks.length; i++) {
      const d = docks[i];
      buildDockInside(sg, WEST.wallIn, WEST.wallOut, 1, d.z);
      // trailer backed in (dark van, tan van, open van)
      const dark = i === 0;
      const open = i === 1;
      buildTrailer(sg, WEST.wallOut - 0.35, d.z, PI, { dark: dark, open: open });
      if (i < 2) buildTractor(sg, WEST.wallOut - 0.35 - 13.15, d.z, PI, MAT.truckWhite);
      // wheel chocks
      for (const dz of [-1.3, 1.3]) {
        addBox(sg, 0.5, 0.22, 0.26, WEST.wallOut - 1.7, 0.11, d.z + dz, MAT.yellow, { cast: true });
      }
      // painted dock bay on the apron
      svFlat(14.0, 0.14, WEST.wallOut - 7.2, d.z - 1.85, 0xcfcabb);
      svFlat(14.0, 0.14, WEST.wallOut - 7.2, d.z + 1.85, 0xcfcabb);
    }
    // waiting tractor (detached, queued on the west apron)
    buildTractor(sg, -82.5, 25.0, PI, MAT.truckWhite);
    // queued rig waiting on the north lane
    buildTrailer(sg, -103.0, -25.0, 0, { dark: true, open: false });
    buildTractor(sg, -89.85, -25.0, 0, MAT.truckDark);
    // apron lane markings
    for (const z of [-26.4, -0.1, 26.4]) {
      addPlaneXZ(sg, 25.0, 0.12, -91.0, 0.018, z, MAT.yellow, {});
    }
    addPlaneXZ(sg, 0.14, 52, -78.9, 0.018, 0, MAT.hazard, {});
    // staging pallets just inside the inbound doors
    for (const z of [-20, 20]) {
      for (let i = 0; i < 3; i++) {
        addBox(sg, 1.2, 0.14, 1.0, -72.6 + i * 1.4, 0.07, z + (i % 2 ? 1.5 : -1.5), MAT.pallet, { cast: true });
        addBox(sg, 0.86, 0.62, 0.78, -72.6 + i * 1.4, 0.45, z + (i % 2 ? 1.5 : -1.5), MAT.cardboard, { cast: true });
      }
    }
  }

  function buildOutbound(sg, parent) {
    const docks = AX.outboundDocks;
    for (let i = 0; i < docks.length; i++) {
      const d = docks[i];
      buildDockInside(sg, EAST.wallIn, EAST.wallOut, -1, d.z);
      buildTrailer(sg, EAST.wallOut + 0.35, d.z, 0, { dark: i === 1, open: i === 0 });
      buildTractor(sg, EAST.wallOut + 0.35 + 13.15, d.z, 0, i === 0 ? MAT.truckWhite : MAT.truckDark);
      for (const dz of [-1.3, 1.3]) {
        addBox(sg, 0.5, 0.22, 0.26, EAST.wallOut + 1.7, 0.11, d.z + dz, MAT.yellow, { cast: true });
      }
      addPlaneXZ(sg, 14.0, 0.14, EAST.wallOut + 7.2, 0.02, d.z - 1.85, MAT.yellow, {});
      addPlaneXZ(sg, 14.0, 0.14, EAST.wallOut + 7.2, 0.02, d.z + 1.85, MAT.yellow, {});
    }
    // portable car-loading ramp at the southern dock (drive-up into the trailer)
    const rz = AX.outboundDocks[1].z + 3.1;
    const rampLen = 4.4, rampW = 3.2, rampTilt = Math.atan2(1.1, rampLen);
    addBox(sg, rampLen, 0.16, rampW, EAST.wallIn - rampLen / 2 - 0.2, 0.6, rz, MAT.steel, { rotZ: rampTilt, cast: true });
    for (const dz of [-rampW / 2 + 0.1, rampW / 2 - 0.1]) {
      addBox(sg, rampLen, 0.3, 0.12, EAST.wallIn - rampLen / 2 - 0.2, 0.72, rz + dz, MAT.yellow, { rotZ: rampTilt, cast: true });
      addBox(sg, rampLen, 0.08, 0.08, EAST.wallIn - rampLen / 2 - 0.2, 1.35, rz + dz, MAT.yellow, { cast: false });
    }
    addBox(sg, 0.16, 0.5, rampW, EAST.wallIn - 0.1, 1.35, rz, MAT.yellow, { cast: false });
    addPlaneXZ(sg, 2.6, 5.4, EAST.wallIn - 5.4, 0.02, rz, MAT.hazard, {});
  }

  /* ==========================================================
     east yard — containers, gate, parking, lanes
     ========================================================== */
  function buildEastYard(sg, parent) {
    // container stack — static, vertex-coloured, varied colours
    const contItems = [
      { x: 90, y: 0, z: -18.2, color: 0x8a6a4a },
      { x: 90, y: 0, z: -15.4, color: 0x3f5a66 },
      { x: 90, y: 0, z: -12.6, color: 0x7a4a3a },
      { x: 90, y: 2.56, z: -15.4, color: 0x5d6b4d },
      { x: 99.4, y: 0, z: -8.0, ry: PI / 2, color: 0x8a8276 },
      { x: 85.0, y: 0, z: -7.6, ry: PI / 2, color: 0x46606a },
    ];
    for (const c of contItems) {
      const ry = c.ry || 0;
      svBox(12.2, 2.5, 2.44, c.x, c.y + 1.25, c.z, c.color, { ry: ry });
      svBox(12.3, 0.12, 2.5, c.x, c.y + 2.52, c.z, 0x8f8f8f, { ry: ry });
      svBox(12.3, 0.14, 2.5, c.x, c.y + 0.06, c.z, 0x6f6f6f, { ry: ry });
      for (const dx of [-6.05, 6.05]) {
        svBox(0.16, 2.4, 2.5, c.x + (ry ? 0 : dx), c.y + 1.25, c.z + (ry ? dx : 0), 0x8a8a8a);
      }
    }

    // painted truck lanes from the gate to the docks
    for (const d of AX.outboundDocks) {
      addPlaneXZ(sg, 24.0, 0.12, 90.0, 0.018, d.z - 1.9, MAT.yellow, {});
      addPlaneXZ(sg, 24.0, 0.12, 90.0, 0.018, d.z + 1.9, MAT.yellow, {});
    }
    svFlat(0.16, 34.0, 82.0, 20.0, 0xcfcabb);
    // trailer parking bays (south-east corner of the yard)
    for (let i = 0; i < 3; i++) {
      svFlat(15.0, 0.12, 93.0, 34.0 + i * 3.0, 0xcfcabb);
      addBox(sg, 1.2, 0.2, 0.3, 100.0, 0.1, 35.5 + i * 3.0, MAT.yellow, { cast: true });
    }
    buildTrailer(sg, 84.0, 35.5, 0, { dark: false, open: false });
    // yard tractor between the dock lanes
    buildTractor(sg, 94.0, 20.0, PI / 2, MAT.truckWhite);

    // gate posts + boom + guard hut at the east site edge
    const gx = 103.0;
    for (const gz of [12.0, 28.0]) {
      svBox(0.66, 3.0, 0.66, gx, 1.5, gz, C.concrete);
      svBox(0.8, 0.16, 0.8, gx, 3.08, gz, C.steelDark);
    }
    // boom barrier (lowered) from the southern post
    const boom = new T.Group();
    boom.position.set(gx - 0.2, 1.0, 28.0);
    boom.rotation.y = PI / 2;
    sg.add(boom);
    addBox(boom, 7.6, 0.14, 0.14, 3.8, 0, 0, MAT.steel, { cast: true });
    for (let i = 0; i < 6; i++) {
      addBox(boom, 0.6, 0.18, 0.18, 0.6 + i * 1.25, 0, 0, MAT.yellow, { cast: true });
    }
    addBoxBase(sg, 0.4, 0.5, 0.4, gx - 0.8, 0, 24.4, MAT.steelDark, { cast: true });
    // guard hut
    svBox(2.6, 0.12, 2.6, gx + 0.4, 0.06, 31.4, C.concrete);
    addBoxBase(sg, 2.3, 2.35, 2.3, gx + 0.4, 0.12, 31.4, MAT.truckWhite, { cast: true });
    addBox(sg, 2.5, 0.16, 2.5, gx + 0.4, 2.55, 31.4, MAT.truckDark, { cast: true });
    addBox(sg, 0.06, 1.0, 1.6, gx - 0.78, 1.65, 31.4, MAT.glassDark, { cast: false });
    addBox(sg, 1.2, 1.0, 0.06, gx + 0.4, 1.65, 30.24, MAT.glassDark, { cast: false });
    addBox(sg, 0.35, 0.08, 1.1, gx - 0.82, 2.6, 31.4, MAT.truckDark, { cast: false });
    // lane edge + stop line at the gate
    svFlat(0.2, 20.0, gx - 2.0, 20.0, 0xcfcabb);
    svFlat(12.0, 0.25, gx - 8.0, 24.0, 0xcfcabb);
  }

  /* ==========================================================
     AGV fleet — AX.agvRoute loop
     ========================================================== */
  function agvBodyGeo() {
    const g = [];
    pushBox(g, 2.4, 0.18, 1.4, 0, 0.42, 0, C.dark);
    pushBox(g, 2.06, 0.22, 1.16, 0, 0.26, 0, C.steelDark);
    pushBox(g, 2.46, 0.07, 1.30, 0, 0.515, 0, C.yellow);
    pushBox(g, 0.12, 0.18, 1.3, 1.24, 0.34, 0, C.rubber);
    pushBox(g, 0.12, 0.18, 1.3, -1.24, 0.34, 0, C.rubber);
    pushBox(g, 1.9, 0.06, 1.16, 0, 0.545, 0, C.steel);
    // wheels (axis z, roll along x)
    for (const wx of [-0.82, 0.82]) {
      for (const wz of [-0.6, 0.6]) {
        pushCyl(g, 0.165, 0.165, 0.16, 10, wx, 0.165, wz, C.rubber, { rx: PI / 2 });
      }
    }
    // front white / rear red marker lights
    for (const dz of [-0.44, 0.44]) {
      pushBox(g, 0.07, 0.1, 0.2, 1.23, 0.47, dz, C.ledWhite);
      pushBox(g, 0.07, 0.1, 0.2, -1.23, 0.47, dz, C.red);
    }
    // antenna + charge contacts
    pushCyl(g, 0.02, 0.02, 0.6, 6, -0.95, 0.82, 0.48, C.steel);
    pushBox(g, 0.2, 0.08, 0.2, -0.95, 1.14, 0.48, C.dark);
    pushBox(g, 0.3, 0.12, 0.3, 1.05, 0.4, -0.5, C.dark);
    return mergeColored(g);
  }
  function agvLoadGeo() {
    const g = [];
    pushBox(g, 1.15, 0.14, 1.0, 0, 0.07, 0, C.wood);
    pushBox(g, 0.95, 0.62, 0.86, 0, 0.45, 0, C.card);
    pushBox(g, 0.97, 0.1, 0.3, 0, 0.3, 0, C.woodDark);
    pushBox(g, 0.7, 0.06, 0.88, 0, 0.78, 0, C.card2);
    return mergeColored(g);
  }

  function buildAGVs(sg, parent) {
    const route = AX.agvRoute;
    const segs = [];
    let total = 0;
    for (let i = 0; i < route.length; i++) {
      const a = route[i];
      const b = route[(i + 1) % route.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      segs.push({ x0: a[0], z0: a[1], x1: b[0], z1: b[1], len: len, cum: total, h: Math.atan2(-(b[1] - a[1]), b[0] - a[0]) });
      total += len;
    }
    S.route = { segs: segs, total: total };

    const bodyMat = vcMetal();
    const loadMat = vcMatte();
    const bodyGeo = agvBodyGeo();
    const loadGeo = agvLoadGeo();
    const mk = (geo, mat, n) => {
      const m = new T.InstancedMesh(geo, mat, n);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      parent.add(m);
      return m;
    };
    S.agvMesh.body = mk(bodyGeo, bodyMat, 4);
    S.agvMesh.load = mk(loadGeo, loadMat, 4);
    S.agvMesh.load.castShadow = false;

    // charger pedestal at the charge bay
    svBox(0.5, 1.5, 0.7, CHARGE_BAY.x + 1.7, 0.75, CHARGE_BAY.z, C.dark);
    svBox(0.02, 0.4, 0.5, CHARGE_BAY.x + 1.43, 1.1, CHARGE_BAY.z, 0x9fb6c2);
    addCylinder(sg, 0.06, 0.06, 1.0, 8, CHARGE_BAY.x + 1.7, 0.06, CHARGE_BAY.z - 0.5, MAT.rubber, { rotX: PI / 2 });
    addPlaneXZ(sg, 3.6, 2.6, CHARGE_BAY.x + 0.6, 0.014, CHARGE_BAY.z, MAT.hazard, {});
    svFlat(3.4, 2.4, CHARGE_BAY.x + 0.6, CHARGE_BAY.z, C.concrete, 0.008);
    addBoxBase(sg, 0.14, 0.9, 0.14, CHARGE_BAY.x - 1.2, 0, CHARGE_BAY.z - 1.0, MAT.yellow, {});

    for (let i = 0; i < 4; i++) {
      S.agv.push({
        dist: (i / 3) * total, yaw: 0, x: 0, z: 0, batt: 0.9 - i * 0.15,
        charging: i === 3, loaded: i !== 3, scl: 0.94 + lrng() * 0.1,
      });
      S.agvProxy.push(addPickProxy(parent, {
        kind: "agv", id: "AGV-0" + (i + 1), title: "AGV 0" + (i + 1) + " · 自动导引车",
        zone: "Z01", anchor: { x: -60, y: 1.6, z: 0 },
      }, 2.6, 1.3, 1.5, 0, 1, 0));
    }
    poseAGVs(0);
  }

  function routeAt(dist) {
    const R = S.route;
    let d = dist % R.total;
    if (d < 0) d += R.total;
    let i = 0;
    while (i < R.segs.length - 1 && R.segs[i + 1].cum <= d) i++;
    const s = R.segs[i];
    const t = (d - s.cum) / (s.len || 1);
    return { x: s.x0 + (s.x1 - s.x0) * t, z: s.z0 + (s.z1 - s.z0) * t, h: s.h, i: i, rem: s.len * (1 - t) };
  }
  function angLerp(a, b, t) {
    let d = ((b - a + PI) % TAU + TAU) % TAU - PI;
    return a + d * t;
  }

  function poseAGVs(dt) {
    for (let i = 0; i < S.agv.length; i++) {
      const a = S.agv[i];
      const st = S.stations.agv;
      let speed = 1.4;
      if (st && st.state === "idle") speed *= 0.45;
      if (st && st.state === "down") speed = 0;
      if (a.charging) speed = 0;
      if (speed > 0) {
        const r = routeAt(a.dist + 2.0);
        // gentle deceleration into curves
        const slow = 0.5 + 0.5 * Math.min(1, r.rem / 3.0);
        a.dist += dt * SIM.speed * speed * slow;
        if (a.dist > S.route.total) a.dist -= S.route.total;
      }
      let x, z, h;
      if (a.charging) {
        x = CHARGE_BAY.x; z = CHARGE_BAY.z; h = 0;
      } else {
        const r = routeAt(a.dist);
        x = r.x; z = r.z; h = r.h;
      }
      const k = dt > 0 ? 1 - Math.exp(-dt * 6.5) : 1;
      a.yaw = dt > 0 ? angLerp(a.yaw, h, k) : h;
      a.x = x; a.z = z;
      setPart(S.agvMesh.body, i, x, 0, z, a.yaw);
      if (a.loaded) setPartFull(S.agvMesh.load, i, x, 0.57, z, a.yaw, a.scl, a.scl, a.scl);
      else setPart(S.agvMesh.load, i, x, -50, z, 0, 0.0001);
      if (S.agvProxy[i]) S.agvProxy[i].position.set(x, 0.8, z);
      // battery drift
      a.batt = a.charging ? Math.min(1, a.batt + dt * 0.02) : Math.max(0.22, a.batt - dt * 0.007);
    }
    S.agvMesh.body.instanceMatrix.needsUpdate = true;
    S.agvMesh.load.instanceMatrix.needsUpdate = true;
  }

  /* ==========================================================
     forklifts — compact counterbalance trucks
     ========================================================== */
  function forkliftBodyGeo() {
    const g = [];
    pushBox(g, 1.08, 0.72, 1.14, -0.42, 0.62, 0, C.yellow);
    pushBox(g, 0.8, 0.48, 1.04, 0.06, 0.66, 0, C.dark);
    pushBox(g, 0.9, 0.1, 0.92, -0.1, 0.98, 0, C.dark);
    pushBox(g, 0.55, 0.5, 0.55, -0.16, 1.2, 0, C.dark);
    pushBox(g, 0.14, 0.45, 0.55, -0.4, 1.4, 0, C.dark);
    // mast + tilt cylinder
    pushBox(g, 0.13, 2.0, 0.13, 0.62, 1.32, 0.42, C.steelDark);
    pushBox(g, 0.13, 2.0, 0.13, 0.62, 1.32, -0.42, C.steelDark);
    pushBox(g, 0.1, 0.1, 0.96, 0.62, 2.27, 0, C.steelDark);
    pushBox(g, 0.11, 0.11, 0.9, 0.62, 0.98, 0, C.steelDark);
    pushBox(g, 0.09, 0.09, 0.62, 0.56, 1.62, 0.18, C.galv);
    // overhead guard
    for (const gx of [-0.76, 0.3]) {
      for (const gz of [-0.5, 0.5]) pushBox(g, 0.07, 1.04, 0.07, gx, 1.88, gz, C.steelDark);
    }
    pushBox(g, 1.22, 0.08, 1.1, -0.23, 2.42, 0, C.steelDark);
    pushBox(g, 0.3, 0.06, 0.3, 0.0, 2.47, -0.2, C.dark);
    // hazard stripe on the counterweight
    for (let i = 0; i < 4; i++) pushBox(g, 0.12, 0.16, 1.16, -0.86 + i * 0.22, 0.36, 0, C.dark);
    // wheels
    for (const wz of [-0.55, 0.55]) pushCyl(g, 0.3, 0.3, 0.2, 10, 0.5, 0.3, wz, C.rubber, { rx: PI / 2 });
    for (const wz of [-0.48, 0.48]) pushCyl(g, 0.24, 0.24, 0.18, 10, -0.62, 0.24, wz, C.rubber, { rx: PI / 2 });
    // exhaust + lights
    pushCyl(g, 0.035, 0.035, 0.45, 6, 0.18, 1.62, 0.46, C.steelDark);
    pushBox(g, 0.06, 0.1, 0.2, 0.6, 1.05, 0.38, C.ledWhite);
    pushBox(g, 0.06, 0.12, 0.16, -0.9, 0.6, 0.4, C.red);
    return mergeColored(g);
  }
  function forkliftForkGeo() {
    const g = [];
    pushBox(g, 0.16, 0.7, 0.9, 0, 0.3, 0, C.dark);
    pushBox(g, 0.1, 0.82, 0.86, 0.1, 0.36, 0, C.steelDark);
    pushBox(g, 1.15, 0.07, 0.15, 0.62, 0.04, 0.3, C.galv);
    pushBox(g, 1.15, 0.07, 0.15, 0.62, 0.04, -0.3, C.galv);
    pushBox(g, 0.9, 0.13, 0.92, 0.66, 0.15, 0, C.wood);
    pushBox(g, 0.78, 0.52, 0.74, 0.66, 0.48, 0, C.card);
    return mergeColored(g);
  }

  function buildForklifts(sg, parent) {
    const bodyMat = vcMetal();
    const forkMat = vcMatte();
    const mk = (geo, mat) => {
      const m = new T.InstancedMesh(geo, mat, 2);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(T.DynamicDrawUsage);
      parent.add(m);
      return m;
    };
    S.forkMesh.body = mk(forkliftBodyGeo(), bodyMat);
    S.forkMesh.fork = mk(forkliftForkGeo(), forkMat);
    S.forkMesh.fork.castShadow = false;
    S.fork.push({
      mode: "x", // travels along x (central gap lane)
      x0: -68.0, x1: -51.5, z: -6.7, t: 0.2, dir: 1, turn: 0,
      period: 30.0, lift: 0.9, yaw: PI / 2,
    });
    S.fork.push({
      mode: "z", // east dispatch lane
      z0: 27.0, z1: 13.0, x: -49.2, t: 0.6, dir: 1, turn: 0,
      period: 26.0, lift: 0.6, yaw: 0,
    });
    poseForklifts(0);
  }

  function poseForklifts(dt) {
    for (let i = 0; i < 2; i++) {
      const f = S.fork[i];
      const st = S.stations.asrs[0];
      let spd = 1;
      if (st && st.state === "idle") spd = 0.5;
      if (st && st.state === "down") spd = 0;
      f.t += (dt * SIM.speed * spd) / f.period;
      if (f.t >= 1) f.t -= 1;
      const t = f.t;
      let x, z, yaw;
      // 0..0.38 travel A->B, 0.38..0.5 turn, 0.5..0.88 travel B->A, 0.88..1 turn
      if (t < 0.38) {
        const k = smooth01(t / 0.38);
        if (f.mode === "x") { x = lerp(f.x0, f.x1, k); z = f.z; yaw = 0; }
        else { x = f.x; z = lerp(f.z0, f.z1, k); yaw = PI / 2; }
      } else if (t < 0.5) {
        const k = (t - 0.38) / 0.12;
        const base = f.mode === "x" ? 0 : PI / 2;
        yaw = base + PI * smooth01(k);
        if (f.mode === "x") { x = f.x1; z = f.z; } else { x = f.x; z = f.z1; }
      } else if (t < 0.88) {
        const k = smooth01((t - 0.5) / 0.38);
        if (f.mode === "x") { x = lerp(f.x1, f.x0, k); z = f.z; yaw = PI; }
        else { x = f.x; z = lerp(f.z1, f.z0, k); yaw = -PI / 2; }
      } else {
        const k = (t - 0.88) / 0.12;
        const base = f.mode === "x" ? PI : -PI / 2;
        yaw = base + PI * smooth01(k);
        if (f.mode === "x") { x = f.x0; z = f.z; } else { x = f.x; z = f.z0; }
      }
      // fork lift bob
      f.lift = 0.45 + 0.9 * (0.5 + 0.5 * Math.sin(SIM.t * 0.45 + i * 2.3));
      f.x = x; f.z = z; f.yaw = yaw;
      setPart(S.forkMesh.body, i, x, 0, z, yaw);
      // fork assembly: local mast at x=0.62, lifts along y
      const mx = x + 0.62 * Math.cos(yaw);
      const mz = z - 0.62 * Math.sin(yaw);
      setPart(S.forkMesh.fork, i, mx, f.lift, mz, yaw);
    }
    S.forkMesh.body.instanceMatrix.needsUpdate = true;
    S.forkMesh.fork.instanceMatrix.needsUpdate = true;
  }

  /* ==========================================================
     signs — one atlas texture => single merged draw call
     ========================================================== */
  const SIGN_CELLS = [
    ["原材料立库", "Z01 · RAW STORE / AS-RS · 12 LEVELS"],
    ["巷道 A", "AISLE A · STACKER CRANE 01"],
    ["巷道 B", "AISLE B · STACKER CRANE 02"],
    ["巷道 C", "AISLE C · STACKER CRANE 03"],
    ["发运缓存", "SHIPPING BUFFER · OUTBOUND STAGE"],
    ["发运月台", "Z06 · OUTBOUND DOCKS · DOCK-OUT"],
  ];

  function buildSignAtlas(sg) {
    const CW = 512, CH = 128, cols = 2, rows = 3;
    const tex = canvasTexture(CW * cols, CH * rows, (ctx) => {
      for (let i = 0; i < SIGN_CELLS.length; i++) {
        const cx = (i % cols) * CW, cy = Math.floor(i / cols) * CH;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = "#1b1e21";
        ctx.fillRect(0, 0, CW, CH);
        ctx.strokeStyle = "rgba(242,167,59,0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(2, 2, CW - 4, CH - 4);
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ece7dd";
        ctx.font = "600 46px 'Bahnschrift','Microsoft YaHei UI',sans-serif";
        ctx.fillText(SIGN_CELLS[i][0], 26, 46);
        ctx.fillStyle = "rgba(242,167,59,0.9)";
        ctx.font = "400 19px 'Cascadia Mono',Consolas,monospace";
        ctx.fillText(SIGN_CELLS[i][1], 27, 92);
        ctx.restore();
      }
    });
    const mat = new T.MeshStandardMaterial({
      map: tex, emissive: 0x2a1d0c, emissiveMap: tex, emissiveIntensity: 0.55,
      roughness: 0.62, metalness: 0.05,
    });
    S.signMat = mat;
    const addAtlasSign = (w, h, x, y, z, rotY, cell) => {
      const g = new T.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      const col = cell % cols, row = Math.floor(cell / cols);
      const u0 = col / cols, u1 = (col + 1) / cols;
      const v1 = 1 - row / rows, v0 = 1 - (row + 1) / rows;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      }
      const m = new T.Mesh(g, mat);
      m.position.set(x, y, z);
      m.rotation.y = rotY || 0;
      m.castShadow = false;
      m.receiveShadow = false;
      sg.add(m);
      return m;
    };
    // west header
    addAtlasSign(6.4, 1.6, WEST.wallIn + 0.06, 6.3, 10.6, PI / 2, 0);
    // three crane aisle labels mounted on the rack end frames
    for (let a = 0; a < 3; a++) {
      const ax = AISLE_X[a];
      svBox(1.95, 0.6, 0.1, ax + 1.55, 5.6, 29.08, C.dark);
      svBox(0.1, 0.5, 0.22, ax + 1.0, 5.6, 29.04, C.steelDark);
      svBox(0.1, 0.5, 0.22, ax + 2.1, 5.6, 29.04, C.steelDark);
      addAtlasSign(1.7, 0.5, ax + 1.55, 5.6, 29.14, 0, 1 + a);
    }
    // shipping buffer sign
    addAtlasSign(2.9, 0.8, -49.0, 2.86, 33.85, 0, 4);
    // dispatch sign on the interior of the east (full height) wall
    addAtlasSign(6.0, 1.5, EAST.wallIn - 0.06, 6.4, 20.0, -PI / 2, 5);
  }

  /* ==========================================================
     selection proxies
     ========================================================== */
  function buildPicks(sg, parent) {
    // one proxy for the whole raw-store racking block
    addPickProxy(parent, {
      kind: "machine", id: "ASRS-RACKS", title: "高架立体货架 · 12 层", zone: "Z01",
      anchor: { x: -63, y: 12, z: 0 },
    }, 25.0, 21.0, 58.0, -63.0, 10.6, 0.0);
    // stacking crane proxy (focused above the middle aisle)
    addPickProxy(parent, {
      kind: "machine", id: "ASRS-02", title: "堆垛机 02 · 巷道 B", zone: "Z01",
      anchor: { x: AISLE_X[1], y: 12, z: 0 },
    }, 2.6, 21.0, 4.0, AISLE_X[1], 11.0, 0.0);
    // two trucks at the docks
    addPickProxy(parent, {
      kind: "truck", id: "TRK-IN-02", title: "入库挂车 02 · 13.6 m", zone: "Z01",
      anchor: { x: WEST.wallOut - 6, y: 2.4, z: 0 },
    }, 14.0, 3.6, 2.6, WEST.wallOut - 6.6, 2.1, 0.0);
    addPickProxy(parent, {
      kind: "truck", id: "TRK-OUT-01", title: "发运挂车 01 · 装车中", zone: "Z06",
      anchor: { x: EAST.wallOut + 6, y: 2.4, z: AX.outboundDocks[0].z },
    }, 14.0, 3.6, 2.6, EAST.wallOut + 6.6, 2.1, AX.outboundDocks[0].z);
  }

  /* ==========================================================
     station beacons & traffic signals (one instanced mesh)
     ========================================================== */
  function buildSignals(parent) {
    const items = [];
    const idx = S.sigIdx;
    // crane mast-top beacons (positions updated every frame)
    for (let i = 0; i < 3; i++) {
      idx.crane.push(items.length);
      items.push({ x: AISLE_X[i] + 0.52, y: 23.0, z: 30, sc: 2.6, hex: 0x9ed6b4, dyn: "crane" });
    }
    // inbound dock traffic lights (3) + outbound (2)
    for (const d of AX.inboundDocks) {
      idx.dockIn.push(items.length);
      items.push({ x: WEST.wallIn + 0.42, y: 4.05, z: d.z + 2.15, sc: 0.9, hex: 0x9ed6b4, dyn: "dockIn" });
    }
    for (const d of AX.outboundDocks) {
      idx.dockOut.push(items.length);
      items.push({ x: EAST.wallIn - 0.42, y: 4.05, z: d.z + 2.15, sc: 0.9, hex: 0x9ed6b4, dyn: "dockOut" });
    }
    // station beacons
    idx.st.dockIn = items.length;
    items.push({ x: WEST.wallIn + 0.5, y: 5.35, z: 0, sc: 1.3, hex: 0x9ed6b4, dyn: "stDockIn" });
    idx.st.dockOut = items.length;
    items.push({ x: EAST.wallIn - 0.5, y: 5.35, z: 20, sc: 1.3, hex: 0x9ed6b4, dyn: "stDockOut" });
    idx.st.agv = items.length;
    items.push({ x: CHARGE_BAY.x + 1.7, y: 1.95, z: CHARGE_BAY.z, sc: 1.1, hex: 0x9ed6b4, dyn: "stAgv" });
    // AGV + forklift beacons (positions updated every frame)
    for (let i = 0; i < 4; i++) {
      idx.agv.push(items.length);
      items.push({ x: 0, y: 1.3, z: 0, sc: 0.8, hex: 0x9ed6b4, dyn: "agv" });
    }
    for (let i = 0; i < 2; i++) {
      idx.fl.push(items.length);
      items.push({ x: 0, y: 2.6, z: 0, sc: 0.8, hex: 0x9ed6b4, dyn: "fork" });
    }
    const geo = new T.SphereGeometry(0.13, 6, 3);
    const mat = new T.MeshStandardMaterial({
      color: 0x0c0e10, emissive: 0xffffff, emissiveIntensity: 3.1, roughness: 0.4, metalness: 0.0,
    });
    const mesh = new T.InstancedMesh(geo, mat, items.length);
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    S.signals = mesh;
    S.sigItems = items;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      setPart(mesh, i, it.x, it.y, it.z, 0, it.sc);
      mesh.setColorAt(i, _col.setHex(it.hex));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  function stateHex(st) {
    if (!st) return PAL.green;
    if (st.state === "down") return 0xff5638;
    if (st.state === "idle") return 0xf2a73b;
    return 0x86d6a6;
  }

  function updateSignals() {
    const mesh = S.signals;
    const st = S.stations;
    const pulse = 0.78 + 0.32 * Math.sin(SIM.t * 3.1);
    const bright = 0.8 + 0.25 * Math.sin(SIM.t * 2.2);
    let k;
    // cranes: follow the travelling mast
    for (let i = 0; i < 3; i++) {
      k = S.sigIdx.crane[i];
      const it = S.sigItems[k];
      it.z = S.cranes[i].z;
      setPart(mesh, k, AISLE_X[i] + 0.52, 23.0, it.z, 0, it.sc);
      _col.setHex(stateHex(st.asrs[i])).multiplyScalar(pulse);
      mesh.setColorAt(k, _col);
    }
    // crane glow sprites removed (single draw-call budget) — data layer draws beacon glow
    // dock traffic lights
    for (let i = 0; i < S.sigIdx.dockIn.length; i++) {
      k = S.sigIdx.dockIn[i];
      _col.setHex(stateHex(st.dockIn)).multiplyScalar(bright);
      mesh.setColorAt(k, _col);
    }
    for (let i = 0; i < S.sigIdx.dockOut.length; i++) {
      k = S.sigIdx.dockOut[i];
      _col.setHex(stateHex(st.dockOut)).multiplyScalar(bright);
      mesh.setColorAt(k, _col);
    }
    // station beacons
    _col.setHex(stateHex(st.dockIn)).multiplyScalar(pulse);
    mesh.setColorAt(S.sigIdx.st.dockIn, _col);
    _col.setHex(stateHex(st.dockOut)).multiplyScalar(pulse);
    mesh.setColorAt(S.sigIdx.st.dockOut, _col);
    _col.setHex(stateHex(st.agv)).multiplyScalar(pulse);
    mesh.setColorAt(S.sigIdx.st.agv, _col);
    // AGV beacons
    for (let i = 0; i < 4; i++) {
      k = S.sigIdx.agv[i];
      const a = S.agv[i];
      setPart(mesh, k, a.x - 0.95 * Math.cos(a.yaw), 1.32, a.z + 0.95 * Math.sin(a.yaw), 0, S.sigItems[k].sc);
      _col.setHex(a.charging ? 0xf2a73b : stateHex(st.agv)).multiplyScalar(pulse);
      mesh.setColorAt(k, _col);
    }
    // forklift beacons
    for (let i = 0; i < 2; i++) {
      k = S.sigIdx.fl[i];
      const f = S.fork[i];
      setPart(mesh, k, f.x - 0.1, 2.62, f.z, 0, S.sigItems[k].sc);
      _col.setHex(stateHex(st.asrs[0])).multiplyScalar(pulse);
      mesh.setColorAt(k, _col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
  }

  /* ==========================================================
     tick
     ========================================================== */
  function tick(t, dt) {
    const spd = SIM.speed || 1;
    // cranes
    for (let i = 0; i < 3; i++) {
      const c = S.cranes[i];
      const st = S.stations.asrs[i];
      const run = st.state === "run" ? 1 : st.state === "idle" ? 0.35 : 0;
      if (run > 0) {
        c.phase += (dt * spd * run) / c.period;
        if (c.phase >= 1) {
          c.phase -= 1;
          c.cycle++;
          craneTargets(c);
        }
      }
    }
    poseCranes(dt);
    // conveyor pallets (~0.4 m/s, stopped with the inbound flow)
    const convRun = S.stations.dockIn.state === "down" ? 0 : 1;
    const span = CONV_X1 - CONV_X0 - 0.6;
    for (let i = 0; i < S.convPallets.length; i++) {
      const cp = S.convPallets[i];
      cp.d = (cp.d + dt * spd * 0.42 * convRun) % span;
      const x = CONV_X0 + 0.3 + cp.d;
      setPartFull(S.convMesh, i, x, CONV_Y + 0.09, CONV_Z, 0, 1, 1, 1);
    }
    S.convMesh.instanceMatrix.needsUpdate = true;
    // AGV fleet + forklifts
    poseAGVs(dt);
    poseForklifts(dt);
    updateSignals();

    // SIM agv + zone wip (throttled)
    S.timers.agv = (S.timers.agv || 0) + dt;
    if (S.timers.agv > 0.5) {
      S.timers.agv = 0;
      const st = S.stations.agv;
      SIM.agv.total = 4;
      SIM.agv.active = st.state === "down" ? 0 : st.state === "idle" ? 2 : 3;
      for (let i = 0; i < 4; i++) SIM.agv.battery[i] = Math.round(S.agv[i].batt * 100) / 100;
    }
    S.timers.wip = (S.timers.wip || 0) + dt;
    if (S.timers.wip > 2.5) {
      S.timers.wip = 0;
      const n = 230 + Math.round(70 * (0.5 + 0.5 * Math.sin(SIM.t * 0.21)));
      SIM.wip("Z01", n);
    }
  }

  /* ==========================================================
     builder
     ========================================================== */
  window.buildLogistics = function () {
    const group = new T.Group();
    group.name = "logistics";
    scene.add(group);
    S.group = group;

    const sg = new T.Group();
    sg.name = "logistics-static";
    group.add(sg);
    S.staticG = sg;

    // module-local materials
    S.mats = {
      containerDark: new T.MeshStandardMaterial({
        map: TEX.container, color: 0x4a525a, roughness: 0.66, metalness: 0.28, envMapIntensity: 0.7,
      }),
      carton: new T.MeshStandardMaterial({
        map: makeCartonTexture(), roughness: 0.88, metalness: 0.02, envMapIntensity: 0.5,
      }),
    };

    // --- stations ---
    S.stations.asrs = [];
    for (let i = 0; i < 3; i++) {
      S.stations.asrs.push(SIM.registerStation({
        id: "ASRS-0" + (i + 1), zone: "Z01", name: "堆垛机 0" + (i + 1) + " · 巷道 " + "ABC"[i],
        kind: "crane", cycle: 58 + i * 5,
        beacon: { x: AISLE_X[i] + 0.52, y: 23.2, z: 0 },
        allowFault: true,
      }));
    }
    S.stations.dockIn = SIM.registerStation({
      id: "DOCK-IN", zone: "Z01", name: "入库月台 · 3 门", kind: "dock", cycle: 74,
      beacon: { x: WEST.wallIn + 0.6, y: 5.6, z: 0 },
    });
    S.stations.agv = SIM.registerStation({
      id: "AGV-01", zone: "Z01", name: "AGV 车队 · 4 台", kind: "agv", cycle: 46,
      beacon: { x: CHARGE_BAY.x + 1.7, y: 2.2, z: CHARGE_BAY.z },
    });
    S.stations.dockOut = SIM.registerStation({
      id: "DOCK-OUT", zone: "Z06", name: "发运月台 · 2 门", kind: "dock", cycle: 82,
      beacon: { x: EAST.wallIn - 0.6, y: 5.6, z: 20 },
    });

    // --- geometry ---
    buildRacking(sg);
    buildCranes(group);
    buildConveyor(sg, group);
    buildInbound(sg, group);
    buildOutbound(sg, group);
    buildEastYard(sg, group);
    buildAGVs(sg, group);
    buildForklifts(sg, group);
    buildSignAtlas(sg);
    buildPicks(sg, group);
    buildSignals(group);

    // static vertex-coloured utility batch (ramps, markings, small cabinets)
    flushStaticVC(sg);

    // merge all static geometry (one draw per material)
    mergeStatic(sg);

    // shadow-pass budget: only structure + vehicles cast (not paint / greebles)
    const castMats = [MAT.steel, MAT.steelDark, MAT.container, S.mats.containerDark,
      MAT.truckDark, MAT.truckWhite, MAT.tyre, MAT.pallet, MAT.cardboard];
    sg.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      if (castMats.indexOf(o.material) < 0) o.castShadow = false;
    });

    // run one pose so the first frame is correct
    updateSignals();

    addTick(tick);
  };
})();
