/* ============================================================
   50 · assembly — 总装线 / FINAL ASSEMBLY (Z05) + EOL / DISPATCH (Z06)
   Z05: two skillet lines (z=12 / z=28, x 18..62), 13 stations each,
        8 cars per line on a continuous ring that feeds the EOL light
        tunnel and the dispatch doors; overhead parts conveyor OC-01
        continues the paint transfer bridge; robots, racks, operators.
   Z06: EOL light tunnel + wheel / roller test (EOL-01), dispatch drive,
        six parked finished cars + one loading bay car with open doors.
   Stations: AS-01 (line A), AS-02 (line B), OC-01 (overhead), EOL-01
   ============================================================ */
(function () {
  "use strict";

  /* ---------------------------------------------------------------
     layout — obey CONTRACT / AX.assemblyLines
     --------------------------------------------------------------- */
  const X0 = 18, X1 = 62;                        // line extent (x)
  const PITCH = 3.4, NST = 13;                   // station pitch
  const EOL_X0 = 64.0, EOL_X1 = 70.4;            // light tunnel
  const DISPATCH_X = 73.5;                       // completeUnit here
  const LINE_LEN = X1 - X0;                      // 44 m
  const RING_LEN = DISPATCH_X - X0;              // 55.5 m (line + eol drive)
  const CPL = 8;                                 // cars per line
  const SPACING = RING_LEN / CPL;                // 6.9375 m
  const TAKT = 58;                               // sim seconds
  const LINE_SPEED = SPACING / TAKT;             // m per sim second
  const CAR_Y = 0.34;                            // skillet conveyor top
  const FADE_IN = 2.0, FADE_OUT = 1.5;           // ring fade zones (m)
  const OC_Y = 6.85;                             // overhead conveyor height
  const OC_Z_FWD = 10.5, OC_Z_RET = 8.9;         // overhead tracks (line A)
  const OC_FWD = 38.6, OC_TURN = Math.PI * 0.8;
  const OC_LOOP = 2 * OC_FWD + 2 * OC_TURN;

  const ST_X = [];
  for (let i = 0; i < NST; i++) ST_X.push(X0 + 1.7 + i * PITCH);   // 19.7 .. 60.5

  const ST_EN = ["BODY DROP", "TORQUE", "SUPPLY", "DOORS", "BATTERY", "FLUID FILL", "SEAT", "GLASS", "WHEEL", "TRIM", "TORQUE", "INSPECT", "TRANSFER"];

  // station layout: t = equipment type, side = -1 north / +1 south
  const DEFS = [
    { t: "bodyDrop", side: -1 },
    { t: "torque", side: -1, gantry: true },
    { t: "racks", side: 1 },
    { t: "doors", side: 1 },
    { t: "battery", side: -1, gantry: true },
    { t: "fluid", side: 1 },
    { t: "seat", side: 1 },
    { t: "glass", side: -1, gantry: true },
    { t: "wheels", side: -1 },
    { t: "trim", side: 1 },
    { t: "torque2", side: -1, gantry: true },
    { t: "inspect", side: 1 },
    { t: "transfer", side: -1 },
  ];

  /* ---------------------------------------------------------------
     geometry helpers (no materials needed)
     --------------------------------------------------------------- */
  const _o = new T.Object3D();
  const _m = new T.Matrix4();
  const _m2 = new T.Matrix4();
  const _q = new T.Quaternion();
  const _eu = new T.Euler();
  const _v = new T.Vector3();
  const _one = new T.Vector3(1, 1, 1);
  const _col = new T.Color();

  function xf(geo, x, y, z, rx, ry, rz) {
    _o.position.set(x || 0, y || 0, z || 0);
    _o.rotation.set(rx || 0, ry || 0, rz || 0);
    _o.scale.set(1, 1, 1);
    _o.updateMatrix();
    geo.applyMatrix4(_o.matrix);
    return geo;
  }
  function bx(w, h, d, x, y, z, rx, ry, rz) {
    return xf(new T.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }
  function cyl(r, h, seg, x, y, z, rx, ry, rz) {
    return xf(new T.CylinderGeometry(r, r, h, seg || 10), x, y, z, rx, ry, rz);
  }
  function colorize(geo, hex) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const n = g.attributes.position.count;
    _col.setHex(hex);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = _col.r; arr[i * 3 + 1] = _col.g; arr[i * 3 + 2] = _col.b;
    }
    g.setAttribute("color", new T.BufferAttribute(arr, 3));
    return g;
  }

  /* ---------------------------------------------------------------
     CAR MODEL — 4.60 × 1.86 × 1.47 m, faces +x
     paint mesh: lower body (with wheel arches) + roof + pillars + mirrors
     dark mesh : glass canopy, wheels, trim, grille, underbody (vertex colours)
     --------------------------------------------------------------- */
  function buildCarGeometry(openDoors) {
    const paint = [], dark = [];
    const prof = [
      [-2.30, 0.26], [-2.36, 0.52], [-2.32, 0.88], [-2.06, 1.02],
      [-1.60, 1.065], [-0.30, 1.08], [0.42, 1.05], [0.98, 0.99],
      [1.94, 0.945], [2.24, 0.875], [2.36, 0.66], [2.31, 0.40],
      [2.04, 0.26], [1.80, 0.26], [1.72, 0.46], [1.56, 0.66],
      [1.40, 0.72], [1.24, 0.66], [1.08, 0.46], [1.00, 0.26],
      [0.00, 0.26], [-1.00, 0.26], [-1.08, 0.46], [-1.24, 0.66],
      [-1.40, 0.72], [-1.56, 0.66], [-1.72, 0.46], [-1.80, 0.26],
    ];
    const shp = new T.Shape();
    shp.moveTo(prof[0][0], prof[0][1]);
    for (let i = 1; i < prof.length; i++) shp.lineTo(prof[i][0], prof[i][1]);
    shp.closePath();
    const body = new T.ExtrudeGeometry(shp, {
      depth: 1.72, bevelEnabled: true, bevelSegments: 1,
      bevelSize: 0.05, bevelThickness: 0.045, curveSegments: 1,
    });
    body.translate(0, 0, -0.86);
    body.computeBoundingBox();
    const bb = body.boundingBox;
    body.applyMatrix4(new T.Matrix4().makeScale(4.60 / (bb.max.x - bb.min.x), 1, 1.86 / (bb.max.z - bb.min.z)));
    paint.push(body);

    // greenhouse (dark glass canopy)
    const gp = [[0.66, 1.025], [0.30, 1.33], [0.09, 1.425], [-0.96, 1.435], [-1.24, 1.36], [-1.63, 1.07], [-1.63, 1.025]];
    const gshp = new T.Shape();
    gshp.moveTo(gp[0][0], gp[0][1]);
    for (let i = 1; i < gp.length; i++) gshp.lineTo(gp[i][0], gp[i][1]);
    gshp.closePath();
    const glass = new T.ExtrudeGeometry(gshp, { depth: 1.52, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.04, bevelThickness: 0.035, curveSegments: 1 });
    glass.translate(0, 0, -0.76);
    dark.push(colorize(glass, 0x1a242b));

    function strut2(x0, y0, x1, y1, z, tw, dp) {
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ang = Math.atan2(dy, dx);
      paint.push(bx(len, tw, dp, (x0 + x1) / 2, (y0 + y1) / 2, z, 0, 0, ang));
      paint.push(bx(len, tw, dp, (x0 + x1) / 2, (y0 + y1) / 2, -z, 0, 0, ang));
    }
    strut2(0.64, 1.02, 0.20, 1.40, 0.785, 0.075, 0.05);      // A pillars
    strut2(-1.00, 1.425, -1.60, 1.055, 0.785, 0.08, 0.05);   // C pillars
    for (const s of [1, -1]) paint.push(bx(0.10, 0.44, 0.05, -0.32, 1.23, s * 0.79));
    paint.push(bx(1.26, 0.055, 1.44, -0.43, 1.45, 0));       // roof
    for (const s of [1, -1]) {                                // mirrors
      paint.push(bx(0.14, 0.09, 0.075, 0.56, 1.10, s * 1.00));
      dark.push(colorize(bx(0.055, 0.03, 0.10, 0.56, 1.065, s * 0.945), 0x101214));
    }
    paint.push(bx(0.40, 0.05, 1.50, -2.10, 1.055, 0));        // rear lip
    // lower cladding / bumpers / grille
    dark.push(colorize(bx(0.10, 0.17, 1.34, 2.325, 0.68, 0), 0x0e1012));
    dark.push(colorize(bx(0.09, 0.15, 1.55, 2.30, 0.40, 0), 0x0d0f11));
    dark.push(colorize(bx(0.32, 0.07, 1.66, 2.15, 0.245, 0), 0x0c0e10));
    dark.push(colorize(bx(0.42, 0.09, 1.52, -2.14, 0.27, 0), 0x0c0e10));
    for (const s of [1, -1]) dark.push(colorize(bx(2.05, 0.13, 0.05, 0.0, 0.33, s * 0.915), 0x1b1f23));
    dark.push(colorize(bx(3.6, 0.05, 1.64, -0.05, 0.415, 0), 0x15181a));
    dark.push(colorize(bx(2.4, 0.22, 1.5, -0.5, 0.60, 0), 0x15181a));
    // wheels: tyre + rim + hub + arch band
    const WR = 0.34;
    for (const ax of [1.42, -1.40]) {
      for (const s of [1, -1]) {
        const wz = s * 0.795;
        dark.push(colorize(cyl(WR, 0.235, 16, ax, WR, wz, PI / 2), 0x0a0b0c));
        dark.push(colorize(cyl(0.215, 0.245, 12, ax, WR, wz, PI / 2), 0x9aa0a6));
        dark.push(colorize(cyl(0.062, 0.262, 8, ax, WR, wz, PI / 2), 0x5a6065));
        dark.push(colorize(xf(new T.TorusGeometry(0.395, 0.042, 4, 9, PI * 1.04), ax, WR, wz), 0x0d0f11));
      }
    }
    if (openDoors) {
      for (const s of [1, -1]) {
        paint.push(xf(new T.BoxGeometry(0.90, 0.72, 0.045), -0.62, 0.75, s * 0.99, 0, s * 0.95, 0));
        paint.push(xf(new T.BoxGeometry(0.82, 0.72, 0.045), 0.30, 0.75, s * 0.99, 0, s * 0.95, 0));
      }
    }
    return { paint: mergeGeoms(paint), dark: mergeGeoms(dark) };
  }

  /* ---------------------------------------------------------------
     OPERATOR — 1.76 m, vertex-coloured capsule body + hi-vis vest
     --------------------------------------------------------------- */
  function buildOperatorGeo(vestHex) {
    const parts = [];
    parts.push(colorize(bx(0.34, 0.84, 0.26, 0, 0.42, 0), 0x2c3238));
    const torso = colorize(new T.CapsuleGeometry(0.215, 0.42, 3, 8), vestHex);
    torso.applyMatrix4(new T.Matrix4().makeTranslation(0, 1.19, 0));
    parts.push(torso);
    parts.push(colorize(bx(0.11, 0.52, 0.14, 0.235, 1.22, 0.0), vestHex));
    parts.push(colorize(bx(0.11, 0.52, 0.14, -0.235, 1.22, 0.0), vestHex));
    const head = colorize(new T.SphereGeometry(0.115, 8, 6), 0xb9855f);
    head.applyMatrix4(new T.Matrix4().makeTranslation(0, 1.645, 0));
    parts.push(head);
    parts.push(colorize(cyl(0.125, 0.09, 8, 0, 1.72, 0), 0xe8e2d5));
    return mergeGeoms(parts);
  }

  /* ---------------------------------------------------------------
     ROBOT geometry (white / orange, vertex-coloured)
     --------------------------------------------------------------- */
  const RB_WHITE = 0xd9d4c8, RB_GREY = 0x8f959a, RB_DARK = 0x2f353b, RB_ORANGE = 0xd95c1e;
  function buildRobotJoints() {
    const g1 = [], g2 = [], g3 = [];
    g1.push(colorize(cyl(0.36, 0.5, 10, 0, 0.25, 0), RB_DARK));
    g1.push(colorize(bx(0.52, 0.42, 0.52, 0, 0.62, 0), RB_GREY));
    g1.push(colorize(new T.CylinderGeometry(0.30, 0.50, 0.5, 10), RB_WHITE));
    g1[g1.length - 1].applyMatrix4(new T.Matrix4().makeTranslation(0, 1.02, 0));
    g1.push(colorize(bx(0.62, 0.55, 0.60, 0, 1.24, 0), RB_WHITE));
    g1.push(colorize(xf(new T.CylinderGeometry(0.20, 0.20, 0.64, 10), 0, 1.52, 0, 0, 0, PI / 2), RB_ORANGE));
    // j2 — upper arm along +y 0..1.3
    g2.push(colorize(bx(0.30, 1.30, 0.34, 0, 0.65, 0), RB_WHITE));
    g2.push(colorize(bx(0.10, 1.10, 0.36, 0.0, 0.62, 0.10), RB_ORANGE));
    g2.push(colorize(xf(new T.CylinderGeometry(0.17, 0.17, 0.52, 10), 0, 0.0, 0, 0, 0, PI / 2), RB_ORANGE));
    g2.push(colorize(xf(new T.CylinderGeometry(0.16, 0.16, 0.50, 10), 0, 1.30, 0, 0, 0, PI / 2), RB_GREY));
    // j3 — forearm + wrist + suction frame
    g3.push(colorize(bx(0.24, 1.15, 0.27, 0, 0.575, 0), RB_WHITE));
    g3.push(colorize(bx(0.10, 0.95, 0.29, 0, 0.57, -0.09), RB_ORANGE));
    g3.push(colorize(bx(0.32, 0.22, 0.34, 0, 1.20, 0), RB_GREY));
    g3.push(colorize(xf(new T.CylinderGeometry(0.17, 0.17, 0.30, 10), 0, 1.36, 0, 0, 0, PI / 2), RB_DARK));
    g3.push(colorize(bx(0.98, 0.07, 0.10, 0, 1.52, 0), RB_ORANGE));
    g3.push(colorize(bx(0.10, 0.07, 0.98, 0, 1.52, 0), RB_ORANGE));
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      g3.push(colorize(cyl(0.05, 0.10, 6, sx * 0.44, 1.60, sz * 0.44), RB_DARK));
    }
    return { j1: mergeGeoms(g1), j2: mergeGeoms(g2), j3: mergeGeoms(g3) };
  }
  function buildRobotStaticGeo() {
    const parts = [];
    parts.push(colorize(cyl(0.36, 0.5, 10, 0, 0.25, 0), RB_DARK));
    parts.push(colorize(bx(0.52, 0.42, 0.52, 0, 0.62, 0), RB_GREY));
    const sh = colorize(new T.CylinderGeometry(0.30, 0.50, 0.5, 10), RB_WHITE);
    sh.applyMatrix4(new T.Matrix4().makeTranslation(0, 1.02, 0));
    parts.push(sh);
    parts.push(colorize(bx(0.62, 0.55, 0.60, 0, 1.24, 0), RB_WHITE));
    const a1 = 0.62, ua = 1.30;
    const el = [0, 1.15 + ua * Math.cos(a1), ua * Math.sin(a1)];
    const um = new T.Matrix4().makeTranslation(0, 1.15 + (ua / 2) * Math.cos(a1), (ua / 2) * Math.sin(a1));
    const uaG = colorize(bx(0.30, ua, 0.34, 0, 0, 0, a1), RB_WHITE);
    uaG.applyMatrix4(um);
    parts.push(uaG);
    const elG = colorize(xf(new T.CylinderGeometry(0.16, 0.16, 0.50, 10), 0, 0, 0, 0, 0, PI / 2), RB_GREY);
    elG.applyMatrix4(new T.Matrix4().makeTranslation(el[0], el[1], el[2]));
    parts.push(elG);
    const a2 = 1.85, fa = 1.15;
    const wr = [0, el[1] + fa * Math.cos(a2), el[2] + fa * Math.sin(a2)];
    const fm = new T.Matrix4().makeTranslation(0, el[1] + (fa / 2) * Math.cos(a2), el[2] + (fa / 2) * Math.sin(a2));
    const faG = colorize(bx(0.24, fa, 0.27, 0, 0, 0, a2), RB_WHITE);
    faG.applyMatrix4(fm);
    parts.push(faG);
    const wm = new T.Matrix4().makeTranslation(wr[0], wr[1], wr[2]);
    const wrist = colorize(bx(0.32, 0.22, 0.34, 0, 0, 0), RB_GREY);
    wrist.applyMatrix4(wm);
    parts.push(wrist);
    const f1 = colorize(bx(0.98, 0.07, 0.10, 0, 0.16, 0.30), RB_ORANGE);
    f1.applyMatrix4(wm);
    parts.push(f1);
    const f2 = colorize(bx(0.10, 0.07, 0.98, 0, 0.16, 0.30), RB_ORANGE);
    f2.applyMatrix4(wm);
    parts.push(f2);
    return mergeGeoms(parts);
  }

  /* ---------------------------------------------------------------
     sign atlas — one texture / one material for all signage
     --------------------------------------------------------------- */
  const CELL_COLS = 4, CELL_ROWS = 8, CELL_W = 256, CELL_H = 128;
  function cellUV(i) {
    const c = i % CELL_COLS, r = Math.floor(i / CELL_COLS);
    const u0 = c / CELL_COLS, u1 = (c + 1) / CELL_COLS;
    const v1 = 1 - r / CELL_ROWS, v0 = 1 - (r + 1) / CELL_ROWS;
    return { u0: u0, v0: v0, u1: u1, v1: v1 };
  }
  function buildAtlasTexture() {
    return canvasTexture(1024, 1024, function (ctx, w, h) {
      ctx.fillStyle = "#101315"; ctx.fillRect(0, 0, w, h);
      function cell(i, title, sub, big) {
        const cx = (i % CELL_COLS) * CELL_W, cy = Math.floor(i / CELL_COLS) * CELL_H;
        ctx.fillStyle = "#181b1e"; ctx.fillRect(cx, cy, CELL_W, CELL_H);
        ctx.strokeStyle = "rgba(242,167,59,0.85)"; ctx.lineWidth = 3;
        ctx.strokeRect(cx + 6, cy + 6, CELL_W - 12, CELL_H - 12);
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillStyle = "#ece7dd";
        ctx.font = "600 " + (big ? 50 : 34) + "px 'Bahnschrift','Microsoft YaHei UI',sans-serif";
        ctx.fillText(title, cx + 16, cy + (sub ? 46 : 64));
        if (sub) {
          ctx.fillStyle = "rgba(242,167,59,0.9)";
          ctx.font = "400 15px 'Cascadia Mono',Consolas,monospace";
          ctx.fillText(sub, cx + 18, cy + 92);
        }
      }
      for (let i = 0; i < 13; i++) cell(i, (i < 9 ? "0" : "") + (i + 1), ST_EN[i], true);
      cell(13, "总装线 A", "FINAL ASSEMBLY · AS-01", true);
      cell(14, "总装线 B", "FINAL ASSEMBLY · AS-02", true);
      cell(15, "下线检测", "EOL TEST · EOL-01", true);
      cell(16, "空中输送", "OVERHEAD CONVEYOR · OC-01", true);
      cell(17, "发运", "DISPATCH · Z06", true);
      // 18: floor chevron
      const cx18 = 2 * CELL_W, cy18 = 4 * CELL_H;
      ctx.fillStyle = "#1a1d20"; ctx.fillRect(cx18, cy18, CELL_W, CELL_H);
      ctx.strokeStyle = "#f2a73b"; ctx.lineWidth = 10;
      for (let k = 0; k < 3; k++) {
        const ox = cx18 + 60 + k * 66;
        ctx.beginPath(); ctx.moveTo(ox, cy18 + 34); ctx.lineTo(ox + 34, cy18 + 64); ctx.lineTo(ox, cy18 + 94); ctx.stroke();
      }
      cell(19, "电池合装", "BATTERY MARRIAGE", true);
      cell(20, "轮胎装配", "WHEEL MOUNT", true);
      cell(21, "加注", "FLUID FILL", true);
      cell(22, "座椅", "SEAT", true);
      cell(23, "玻璃", "GLASS", true);
      cell(24, "扭矩", "TORQUE", true);
      cell(25, "检测", "INSPECT", true);
      cell(26, "车门", "DOORS", true);
      cell(27, "线束", "HARNESS", true);
      cell(28, "物料超市", "SUPERMARKET", true);
      cell(29, "转序", "TRANSFER", true);
    });
  }

  /* ---------------------------------------------------------------
     module cache
     --------------------------------------------------------------- */
  let ASSET = null;

  /* =================================================================
     BUILDER
     ================================================================= */
  window.buildAssembly = function () {
    const group = new T.Group();
    group.name = "assembly";
    scene.add(group);
    const stat = new T.Group();
    stat.name = "assembly-static";
    group.add(stat);

    if (!ASSET) {
      ASSET = {
        car: buildCarGeometry(false),
        carOpen: buildCarGeometry(true),
        ops: [buildOperatorGeo(0xe0b23a), buildOperatorGeo(0xdf8a2c), buildOperatorGeo(0xd9d4c8)],
        robot: buildRobotJoints(),
        robotStatic: buildRobotStaticGeo(),
      };
    }

    /* ---------------- custom materials ---------------- */
    const atlasTex = buildAtlasTexture();
    atlasTex.wrapS = atlasTex.wrapT = T.ClampToEdgeWrapping;
    atlasTex.needsUpdate = true;
    const atlasMat = new T.MeshStandardMaterial({
      map: atlasTex, emissiveMap: atlasTex, emissive: 0xffffff, emissiveIntensity: 0.26,
      roughness: 0.86, metalness: 0.02, side: T.FrontSide,
    });
    // warm light panel for the EOL tunnel (softer than the shared LED material)
    const matPanel = new T.MeshStandardMaterial({
      color: 0x2b2925, emissive: 0xffe6c0, emissiveIntensity: 1.05,
      roughness: 0.5, metalness: 0.05,
    });
    const matRobot = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.46, metalness: 0.28, envMapIntensity: 0.8 });
    const matOps = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.8, metalness: 0.04, envMapIntensity: 0.5 });
    const carDarkMat = MAT.carGlass.clone();
    carDarkMat.color.setHex(0xffffff);
    carDarkMat.vertexColors = true;
    carDarkMat.roughness = 0.34;
    carDarkMat.metalness = 0.5;
    carDarkMat.envMapIntensity = 1.3;

    /* ---------------- small helpers bound to stat ---------------- */
    function atlasPlane(w, h, x, y, z, cellI, rotX, rotY) {
      const uv0 = cellUV(cellI);
      const g = new T.PlaneGeometry(w, h);
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) {
        uv.setXY(i, uv0.u0 + uv.getX(i) * (uv0.u1 - uv0.u0), uv0.v0 + uv.getY(i) * (uv0.v1 - uv0.v0));
      }
      const mm = new T.Mesh(g, atlasMat);
      mm.position.set(x, y, z);
      mm.rotation.x = rotX || 0;
      mm.rotation.y = rotY || 0;
      mm.castShadow = false;
      mm.receiveShadow = true;
      stat.add(mm);
      return mm;
    }
    function B(w, h, d, x, y, z, mat, opts) { return addBox(stat, w, h, d, x, y, z, mat, opts); }
    function BB(w, h, d, x, baseY, z, mat, opts) { return addBoxBase(stat, w, h, d, x, baseY, z, mat, opts); }
    function C(r, h, seg, x, y, z, mat, opts) {
      return addCylinder(stat, r, r, h, seg || 10, x, y, z, mat, Object.assign({ cast: true }, opts || {}));
    }
    function CB(r, h, seg, x, baseY, z, mat, opts) {
      return addCylinderBase(stat, r, r, h, seg || 10, x, baseY, z, mat, Object.assign({ cast: true }, opts || {}));
    }
    function planeS(w, h, x, y, z, mat, rotY) {
      return addPlane(stat, w, h, x, y, z, mat, { rotY: rotY || 0, receive: false, cast: false });
    }
    function screenOn(x, y, z, w, h, faceYaw, amber) {
      const nx = Math.sin(faceYaw || 0), nz = Math.cos(faceYaw || 0);
      B(w + 0.09, h + 0.09, 0.05, x - nx * 0.035, y, z - nz * 0.035, MAT.machineDark, { cast: false });
      planeS(w, h, x, y, z, amber ? MAT.screenAmber : MAT.screen, faceYaw || 0);
    }
    function binMat(k) { return k % 3 === 0 ? MAT.cardboard : k % 3 === 1 ? MAT.machineWhite : MAT.pallet; }

    /* =================================================================
       A · CONVEYOR + FLOOR MARKINGS
       ================================================================= */
    function buildConveyor(z) {
      const xMid = (X0 + X1) / 2, L = X1 - X0 + 1.0;
      for (const s of [-1, 1]) {
        B(L, 0.20, 0.20, xMid, 0.10, z + s * 1.42, MAT.steelDark);
        B(L, 0.055, 0.28, xMid, 0.225, z + s * 1.42, MAT.steel);
        B(L, 0.028, 0.05, xMid, 0.26, z + s * 1.555, MAT.ledAmber, { cast: false });
      }
      for (let x = X0 + 0.8; x <= X1 - 0.5; x += 4.25) B(0.16, 0.20, 2.72, x, 0.10, z, MAT.steelDark);
      for (let x = X0 + 0.55; x < X1 - 0.2; x += 0.85) {
        addCylinder(stat, 0.072, 0.072, 2.44, 8, x, 0.245, z, MAT.steel, { rotX: PI / 2, cast: false, receive: true });
      }
      for (let i = 0; i < NST; i++) B(3.2, 0.035, 1.92, ST_X[i], 0.323, z, MAT.steelDark);
      // painted footprint
      const py = 0.016;
      B(L, 0.022, 0.09, xMid, py, z - 1.95, MAT.yellow, { cast: false });
      B(L, 0.022, 0.09, xMid, py, z + 1.95, MAT.yellow, { cast: false });
      B(0.09, 0.022, 3.99, X0 - 0.35, py, z, MAT.yellow, { cast: false });
      B(0.09, 0.022, 3.99, X1 + 0.35, py, z, MAT.yellow, { cast: false });
      for (let k = 0; k < 3; k++) {
        B(0.55, 0.02, 0.10, X0 - 0.05 + k * 0.62, py, z - 0.42, MAT.yellow, { cast: false, rotY: 0.62 });
        B(0.55, 0.02, 0.10, X0 - 0.05 + k * 0.62, py, z + 0.42, MAT.yellow, { cast: false, rotY: -0.62 });
      }
      // station floor numbers
      for (let i = 0; i < NST; i++) atlasPlane(0.92, 0.46, ST_X[i], 0.02, z + 1.82, i, -PI / 2, 0);
      // end-of-line ramp down to Z06 floor
      const rampLen = 2.4, rampAng = Math.atan2(CAR_Y, rampLen);
      B(rampLen + 0.2, 0.06, 2.7, 62 + rampLen / 2, CAR_Y - 0.03, z, MAT.steelDark, { rotZ: -rampAng });
      for (const s of [-1, 1]) {
        B(rampLen + 0.1, 0.16, 0.10, 62 + rampLen / 2, CAR_Y - 0.10, z + s * 1.34, MAT.steel, { rotZ: -rampAng });
      }
    }

    /* =================================================================
       C · STATIONS
       ================================================================= */
    function footing(x, z, w, d) { B(w, 0.03, d, x, 0.014, z, MAT.steelDark, { cast: false }); }

    function buildDropGantry(x, z) {
      for (const s of [-1, 1]) B(0.16, 3.45, 0.16, x, 1.725, z + s * 2.05, MAT.steel);
      B(0.18, 0.18, 4.42, x, 3.47, z, MAT.steel);
      B(0.14, 0.14, 4.3, x, 3.30, z, MAT.steelDark);
      B(0.62, 0.22, 0.46, x, 3.14, z, MAT.yellow);
      B(1.65, 0.09, 1.05, x, 2.72, z, MAT.orange);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        addCylinder(stat, 0.014, 0.014, 0.42, 4, x + sx * 0.55, 2.94, z + sz * 0.42, MAT.steelDark, { cast: false });
        B(0.06, 0.10, 0.06, x + sx * 0.78, 2.66, z + sz * 0.48, MAT.steelDark, { cast: false });
      }
      C(0.10, 0.26, 8, x, 3.02, z, MAT.machineGrey, { cast: false });
    }

    function eqTorque(x, z, side) {
      footing(x, z, 1.9, 1.5);
      B(1.34, 0.10, 1.06, x, 0.08, z, MAT.machineDark);
      B(0.56, 1.16, 0.62, x, 0.65, z, MAT.machineGrey);
      const cz = z - side * 0.62;
      B(0.94, 0.46, 0.30, x, 1.36, cz, MAT.machineDark, { rotX: -0.42 * side });
      screenOn(x, 1.42, cz - side * 0.16, 0.40, 0.25, side < 0 ? 0 : PI, false);
      const zr = z - side * 1.15;
      B(0.10, 0.10, 2.5, x, 3.05, zr, MAT.steel);
      B(0.09, 2.05, 0.09, x, 1.02, z - side * 0.62, MAT.steelDark);
      C(0.075, 0.30, 8, x + 0.22, 2.88, zr, MAT.machineGrey, { cast: false });
      addCylinder(stat, 0.012, 0.012, 0.95, 4, x + 0.22, 2.28, zr, MAT.steelDark, { cast: false });
      B(0.11, 0.30, 0.13, x + 0.22, 1.92, zr, MAT.orange);
      B(0.06, 0.12, 0.06, x + 0.22, 1.71, zr, MAT.steel);
      B(0.5, 0.26, 0.38, x - 0.85, 0.42, z - side * 0.3, MAT.machineWhite);
      B(0.34, 0.05, 0.30, x - 0.85, 0.60, z - side * 0.3, MAT.yellow, { cast: false });
      B(0.9, 0.05, 0.6, x, 0.05, z - side * 0.9, MAT.steelDark, { cast: false });
    }

    function eqRacks(x, z, side) {
      const ry = side < 0 ? 0 : PI;
      footing(x, z, 2.4, 1.0);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.06, 1.9, 0.06, x + sx * 1.06, 0.95, z + sz * 0.40, MAT.steelDark);
      }
      for (const sy of [0.52, 1.02, 1.52]) {
        B(2.2, 0.045, 0.84, x, sy, z, MAT.pallet);
        for (let k = 0; k < 6; k++) {
          const bx0 = x - 0.9 + k * 0.36;
          const hh = 0.20 + (k % 3) * 0.04;
          B(0.30, hh, 0.5, bx0, sy + 0.023 + hh / 2, z, binMat(k), { cast: false });
        }
      }
      B(0.8, 0.05, 0.55, x + 1.4, 0.62, z, MAT.machineGrey);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.04, 0.6, 0.04, x + 1.4 + sx * 0.34, 0.31, z + sz * 0.22, MAT.steelDark, { cast: false });
      }
      for (let k = 0; k < 2; k++) B(0.42, 0.26, 0.4, x + 1.16 + k * 0.44, 0.83, z, binMat(k + 1), { cast: false });
      atlasPlane(0.9, 0.45, x, 2.05, z - side * 0.45, 28, 0, ry);
    }

    function eqDoors(x, z, side) {
      const zl = z - side * 3.4;
      B(0.10, 0.10, 4.6, x, 3.05, zl, MAT.steel);
      for (const s of [-1, 1]) B(0.14, 3.05, 0.14, x, 1.52, zl + s * 2.15, MAT.steel);
      for (let k = 0; k < 2; k++) {
        const hz = zl + (k ? 0.62 : -0.62);
        addCylinder(stat, 0.012, 0.012, 0.6, 4, x, 2.72, hz, MAT.steelDark, { cast: false });
        B(0.045, 0.82, 1.02, x, 2.24, hz, MAT.paintBody[k], { cast: true });
        B(0.06, 0.06, 0.16, x, 2.66, hz, MAT.orange, { cast: false });
      }
      const zr = z + side * 0.25;
      B(1.3, 0.08, 0.5, x, 0.05, zr, MAT.steelDark);
      for (let k = 0; k < 4; k++) {
        B(0.045, 0.86, 1.05, x + 0.52, 0.50, zr - 0.42 + k * 0.28, MAT.paintBody[(k + 1) % 3], { rotX: 0.16 });
      }
      B(0.06, 1.1, 0.06, x + 0.5, 0.55, zr - 0.56, MAT.steel);
      B(0.06, 1.1, 0.06, x + 0.5, 0.55, zr + 0.56, MAT.steel);
      atlasPlane(0.95, 0.48, x, 2.75, z - side * 2.05, 26, 0, side < 0 ? 0 : PI);
    }

    function eqBattery(x, z, side) {
      footing(x, z, 2.4, 1.8);
      B(1.9, 0.12, 1.25, x, 0.10, z, MAT.steelDark);
      for (const sz of [-1, 1]) {
        B(0.95, 0.07, 0.08, x, 0.50, z + sz * 0.42, MAT.steel, { rotZ: 0.62 });
        B(0.95, 0.07, 0.08, x, 0.50, z + sz * 0.42, MAT.steel, { rotZ: -0.62 });
      }
      B(2.0, 0.10, 1.35, x, 0.94, z, MAT.machineGrey);
      B(1.78, 0.19, 1.12, x, 1.10, z, MAT.machineDark);
      B(1.80, 0.03, 0.10, x, 1.21, z - 0.42, MAT.ledAmber, { cast: false });
      B(1.80, 0.03, 0.10, x, 1.21, z + 0.42, MAT.ledAmber, { cast: false });
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.05, 1.15, 0.05, x + sx * 0.92, 0.60, z + sz * 0.58, MAT.steel, { cast: false });
      }
      B(0.10, 0.06, 1.2, x, 0.16, z, MAT.hazard, { cast: false });
      // cantilever carrying the next battery toward the line edge
      B(0.14, 0.14, 3.1, x - 0.9, 2.95, z - side * 1.35, MAT.steel);
      B(0.12, 2.9, 0.12, x - 0.9, 1.45, z + side * 0.25, MAT.steel);
      for (const k of [-1, 1]) {
        addCylinder(stat, 0.012, 0.012, 0.9, 4, x - 0.9 + k * 0.45, 2.42, z - side * 2.2, MAT.steelDark, { cast: false });
      }
      B(1.5, 0.14, 0.9, x - 0.9, 1.92, z - side * 2.2, MAT.machineDark);
      B(1.2, 0.14, 0.9, x + 1.35, 0.10, z + 0.15, MAT.pallet);
      B(1.1, 0.18, 0.8, x + 1.35, 0.26, z + 0.15, MAT.machineDark);
      atlasPlane(1.1, 0.55, x, 2.1, z, 19, 0, side < 0 ? 0 : PI);
    }

    function eqFluid(x, z, side) {
      footing(x, z, 2.8, 1.8);
      B(1.15, 1.62, 0.72, x, 0.81, z, MAT.machineWhite);
      B(1.0, 0.22, 0.04, x, 1.30, z - side * 0.38, MAT.orange, { cast: false });
      screenOn(x, 1.52, z - side * 0.40, 0.5, 0.3, side < 0 ? 0 : PI, true);
      C(0.33, 1.24, 12, x - 0.95, 0.62, z + side * 0.3, MAT.steel);
      C(0.30, 1.24, 12, x - 1.55, 0.62, z + side * 0.3, MAT.machineGrey);
      addCylinder(stat, 0.05, 0.05, 1.2, 6, x - 0.95, 1.9, z + side * 0.3, MAT.steelDark, { cast: false });
      const nz = z - side * 1.9;
      polylineTube(stat, [
        [x - 0.4, 1.45, z],
        [x - 0.4, 2.35, z - side * 0.4],
        [x - 0.2, 2.55, z - side * 1.0],
        [x + 0.15, 2.42, nz],
        [x + 0.18, 2.20, nz],
      ], 0.028, MAT.black);
      polylineTube(stat, [
        [x + 0.3, 1.45, z + side * 0.1],
        [x + 0.35, 2.3, z - side * 0.5],
        [x + 0.42, 2.45, z - side * 0.95],
        [x + 0.40, 2.30, nz + side * 0.25],
      ], 0.028, MAT.black);
      for (const dx of [-0.12, 0.36]) {
        C(0.05, 0.22, 8, x + dx, 2.10, nz, MAT.orange);
        C(0.028, 0.14, 6, x + dx, 1.94, nz, MAT.steel, { cast: false });
      }
      B(1.7, 0.06, 0.8, x, 0.05, z - side * 1.75, MAT.steelDark, { cast: false });
      B(1.65, 0.1, 0.05, x, 0.10, z - side * 1.75, MAT.hazard, { cast: false });
      atlasPlane(1.0, 0.5, x, 1.9, z - side * 0.37, 21, 0, side < 0 ? 0 : PI);
    }

    function buildFence(x, z, w, d, backSide) {
      const h = 1.55;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.07, h, 0.07, x + sx * w / 2, h / 2, z + sz * d / 2, MAT.steel);
      }
      for (const sx of [-1, 1]) {
        addPlane(stat, d, h, x + sx * w / 2, h / 2, z, MAT.fence, { rotY: sx * PI / 2, receive: false });
        B(0.05, 0.05, d, x + sx * w / 2, h, z, MAT.steel, { cast: false });
      }
      const zb = z + backSide * d / 2;
      addPlane(stat, w, h, x, h / 2, zb, MAT.fence, { receive: false });
      B(w, 0.05, 0.05, x, h, zb, MAT.steel, { cast: false });
      for (const sx of [-1, 1]) B(0.03, 0.16, d, x + sx * w / 2, 0.08, z, MAT.hazard, { cast: false });
    }

    function robotAt(x, z, yaw) {
      const g = new T.Group();
      g.position.set(x, 0, z);
      g.rotation.y = yaw;
      const mesh = new T.Mesh(ASSET.robotStatic, matRobot);
      mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh);
      stat.add(g);
    }

    function eqSeat(x, z, side, animated) {
      footing(x, z, 3.7, 2.7);
      buildFence(x, z, 3.5, 2.4, side);
      const rx = x - 1.2, rz = z + side * 0.1;
      B(1.0, 0.08, 1.2, rx, 0.42, rz, MAT.steelDark);
      for (let k = 0; k < 3; k++) {
        const sy = 0.56 + k * 0.46;
        B(0.55, 0.14, 0.55, rx, sy, rz, MAT.black, { cast: false });
        B(0.55, 0.42, 0.13, rx, sy + 0.24, rz - 0.22, MAT.black, { cast: false });
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.04, 0.8, 0.04, rx + sx * 0.42, 0.42, rz + sz * 0.5, MAT.steel, { cast: false });
      }
      B(1.2, 0.05, 1.4, rx, 1.86, rz, MAT.pallet, { cast: false });
      if (!animated) robotAt(x, z - side * 0.7, side < 0 ? 0 : PI);
      B(0.4, 0.9, 0.3, x + 1.6, 0.45, z - side * 0.9, MAT.machineWhite);
      screenOn(x + 1.6, 1.0, z - side * 0.9 - side * 0.16, 0.3, 0.2, side < 0 ? 0 : PI, false);
      atlasPlane(0.95, 0.48, x - 1.7, 1.3, z - side * 1.2, 22, 0, side < 0 ? 0 : PI);
    }

    function eqGlass(x, z, side, animated) {
      footing(x, z, 3.7, 2.7);
      buildFence(x, z, 3.5, 2.4, side);
      const rx = x - 1.15, rz = z + side * 0.1;
      B(1.1, 0.07, 1.3, rx, 0.35, rz, MAT.steelDark);
      B(0.07, 1.5, 1.3, rx - 0.55, 1.1, rz, MAT.steel, { rotZ: 0.24 });
      B(0.07, 1.5, 1.3, rx + 0.55, 1.1, rz, MAT.steel, { rotZ: -0.24 });
      for (let k = 0; k < 3; k++) {
        B(0.03, 1.05, 1.0, rx - 0.28 + k * 0.26, 0.95, rz, MAT.carGlass, { rotZ: 0.24, cast: false });
      }
      B(1.9, 0.05, 1.4, rx, 0.02, rz, MAT.steelDark, { cast: false });
      if (!animated) robotAt(x, z - side * 0.7, side < 0 ? 0 : PI);
      B(0.4, 0.9, 0.3, x + 1.6, 0.45, z - side * 0.9, MAT.machineWhite);
      screenOn(x + 1.6, 1.0, z - side * 0.9 - side * 0.16, 0.3, 0.2, side < 0 ? 0 : PI, false);
      atlasPlane(0.95, 0.48, x - 1.7, 1.3, z - side * 1.2, 23, 0, side < 0 ? 0 : PI);
    }

    function eqWheels(x, z, side) {
      footing(x, z, 3.3, 1.7);
      for (let k = 0; k < 2; k++) {
        const sx = x - 1.15 + k * 1.15;
        B(1.0, 0.12, 1.0, sx, 0.10, z, MAT.pallet);
        for (let n = 0; n < 4; n++) addCylinder(stat, 0.34, 0.34, 0.22, 14, sx, 0.30 + n * 0.235, z, MAT.tyre, { cast: true });
        addCylinder(stat, 0.20, 0.20, 0.10, 10, sx, 1.22, z, MAT.steel, { cast: false });
      }
      B(0.9, 0.06, 1.2, x + 1.45, 0.55, z, MAT.steelDark);
      for (let k = 0; k < 2; k++) {
        addCylinder(stat, 0.34, 0.34, 0.22, 14, x + 1.25 + k * 0.42, 0.93, z, MAT.tyre, { rotX: PI / 2, cast: true });
        addCylinder(stat, 0.20, 0.20, 0.235, 12, x + 1.25 + k * 0.42, 0.93, z, MAT.steel, { rotX: PI / 2, cast: false });
      }
      B(0.12, 2.85, 0.12, x + 0.7, 1.43, z - side * 1.2, MAT.steel);
      B(0.10, 0.10, 2.3, x + 0.7, 2.85, z - side * 0.35, MAT.steel);
      for (const k of [-1, 1]) {
        addCylinder(stat, 0.014, 0.014, 0.85, 4, x + 0.7 + k * 0.42, 2.4, z - side * 1.28, MAT.steelDark, { cast: false });
        B(0.10, 0.34, 0.11, x + 0.7 + k * 0.42, 1.94, z - side * 1.28, MAT.orange);
      }
      B(0.8, 0.06, 0.55, x - 1.6, 0.62, z, MAT.machineGrey);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        B(0.04, 0.6, 0.04, x - 1.6 + sx * 0.34, 0.31, z + sz * 0.22, MAT.steelDark, { cast: false });
      }
      atlasPlane(0.95, 0.5, x, 1.95, z - side * 0.95, 20, 0, side < 0 ? 0 : PI);
    }

    function eqTrim(x, z, side) {
      footing(x, z, 2.8, 1.8);
      B(2.0, 0.72, 0.9, x, 0.36, z, MAT.machineWhite);
      B(2.0, 0.05, 0.95, x, 0.74, z, MAT.pallet);
      for (let k = 0; k < 4; k++) B(0.40, 0.26, 0.5, x - 0.72 + k * 0.48, 0.90, z, binMat(k), { cast: false });
      B(0.9, 0.06, 0.5, x - 1.1, 1.45, z, MAT.steelDark);
      B(0.9, 0.05, 0.5, x - 1.1, 1.75, z, MAT.pallet);
      for (let k = 0; k < 2; k++) B(0.32, 0.24, 0.36, x - 1.3 + k * 0.42, 1.6, z, MAT.black, { cast: false });
      B(0.09, 0.09, 3.2, x, 2.9, z - side * 0.9, MAT.steel);
      B(0.08, 1.95, 0.08, x, 0.97, z + side * 0.55, MAT.steel);
      addCylinder(stat, 0.01, 0.01, 0.8, 4, x, 2.5, z - side * 1.7, MAT.steelDark, { cast: false });
      B(0.7, 0.06, 0.06, x, 2.1, z - side * 1.7, MAT.steelDark, { cast: false });
      atlasPlane(0.9, 0.45, x, 1.35, z + side * 0.46, 29, 0, side < 0 ? 0 : PI);
    }

    function eqHarness(x, z, side) {
      footing(x, z, 2.2, 1.7);
      B(1.5, 0.9, 0.8, x, 0.46, z, MAT.machineGrey);
      for (let k = 0; k < 3; k++) addCylinder(stat, 0.22, 0.22, 0.18, 10, x - 0.45 + k * 0.45, 1.0, z, MAT.black, { cast: false });
      B(1.7, 0.05, 1.0, x, 0.94, z, MAT.steelDark);
      B(1.3, 1.1, 0.9, x, 1.5, z + side * 0.05, MAT.machineWhite);
      screenOn(x, 1.6, z - side * 0.44, 0.4, 0.24, side < 0 ? 0 : PI, true);
      atlasPlane(0.9, 0.45, x, 1.05, z - side * 0.44, 27, 0, side < 0 ? 0 : PI);
    }

    function eqInspect(x, z, side) {
      footing(x, z, 1.8, 1.5);
      B(0.9, 0.8, 0.6, x, 0.42, z, MAT.machineWhite);
      B(0.95, 0.05, 0.65, x, 0.84, z, MAT.machineDark);
      screenOn(x, 1.06, z - side * 0.32, 0.55, 0.34, side < 0 ? 0 : PI, false);
      B(0.4, 0.18, 0.3, x, 0.12, z - side * 0.5, MAT.black, { cast: false });
      atlasPlane(1.0, 0.5, x, 1.6, z - side * 0.33, 25, 0, side < 0 ? 0 : PI);
    }

    function eqTransfer(x, z, side) {
      footing(x, z, 2.5, 1.8);
      B(1.1, 1.3, 0.9, x, 0.66, z, MAT.machineDark);
      B(1.2, 0.06, 1.0, x, 1.34, z, MAT.steel);
      screenOn(x, 1.55, z - side * 0.46, 0.45, 0.28, side < 0 ? 0 : PI, true);
      B(0.14, 0.14, 3.0, x, 2.75, z - side * 1.0, MAT.steel);
      addCylinder(stat, 0.05, 0.05, 0.8, 8, x, 2.45, z - side * 2.0, MAT.steel, { cast: false });
      B(0.5, 0.22, 0.3, x, 2.0, z - side * 2.0, MAT.orange);
      atlasPlane(0.95, 0.5, x, 1.45, z + side * 0.48, 18, 0, side < 0 ? 0 : PI);
    }

    function buildGantry(x, zl, i) {
      for (const s of [-1, 1]) {
        B(0.16, 3.85, 0.16, x, 1.925, zl + s * 2.07, MAT.steel);
        B(0.34, 0.06, 0.34, x, 0.03, zl + s * 2.07, MAT.steelDark, { cast: false });
      }
      B(0.18, 0.18, 4.42, x, 3.9, zl, MAT.steel);
      B(0.30, 0.05, 4.2, x, 3.78, zl, MAT.steelDark, { cast: false });
      atlasPlane(2.30, 1.15, x, 3.18, zl + 2.17, i, 0, 0);
      B(2.4, 0.06, 0.06, x, 3.80, zl + 2.17, MAT.steelDark, { cast: false });
      B(1.9, 0.035, 0.05, x, 3.68, zl + 2.20, MAT.ledAmber, { cast: false });
      B(0.08, 0.08, 1.4, x, 2.9, zl - 1.55, MAT.steel);
      C(0.07, 0.26, 8, x, 2.72, zl - 1.95, MAT.machineGrey, { cast: false });
      addCylinder(stat, 0.012, 0.012, 0.7, 4, x, 2.28, zl - 1.95, MAT.steelDark, { cast: false });
      B(0.09, 0.24, 0.10, x, 2.0, zl - 1.95, MAT.orange);
    }

    function buildStation(line, i) {
      const def = DEFS[i];
      const x = ST_X[i];
      const side = line.flip ? -def.side : def.side;
      const z = line.z + side * 3.4;
      switch (def.t) {
        case "bodyDrop": {
          buildDropGantry(x, line.z);
          B(1.2, 0.9, 0.7, x - 2.2, 0.45, z, MAT.machineWhite);
          screenOn(x - 2.2, 1.1, z - side * 0.34, 0.4, 0.24, side < 0 ? 0 : PI, true);
          B(1.9, 0.06, 0.5, x - 0.2, 0.05, z, MAT.steelDark);
          for (let k = 0; k < 3; k++) B(0.045, 0.85, 1.2, x + 0.2 + k * 0.32, 0.52, z, MAT.paintBody[k % 3], { rotX: 0.12, cast: false });
          break;
        }
        case "torque":
        case "torque2":
          eqTorque(x, z, side);
          break;
        case "racks":
          eqRacks(x, z, side);
          break;
        case "doors":
          eqDoors(x, z, side);
          break;
        case "battery":
          eqBattery(x, z, side);
          break;
        case "fluid":
          eqFluid(x, z, side);
          break;
        case "seat":
          eqSeat(x, z, side, line.z > 20);
          break;
        case "glass":
          eqGlass(x, z, side, line.z < 20);
          break;
        case "wheels":
          eqWheels(x, z, side);
          break;
        case "trim":
          eqTrim(x, z, side);
          break;
        case "inspect": {
          eqInspect(x, z, side);
          for (const s of [-1, 1]) B(0.12, 2.9, 0.12, x, 1.45, line.z + s * 2.07, MAT.steel);
          B(0.16, 0.14, 4.34, x, 2.95, line.z, MAT.steelDark);
          B(1.6, 0.05, 0.08, x, 2.86, line.z - 1.2, matPanel, { cast: false });
          B(1.6, 0.05, 0.08, x, 2.86, line.z + 1.2, matPanel, { cast: false });
          break;
        }
        case "transfer":
          eqTransfer(x, z, side);
          break;
      }
      if (def.gantry) buildGantry(x, line.z, i);
    }

    /* =================================================================
       E · OVERHEAD PARTS CONVEYOR (continues the paint bridge)
       ================================================================= */
    function buildOverhead() {
      const x0 = 20.4, x1 = 61.0;
      const xMid = (x0 + x1) / 2, len = x1 - x0;
      for (const zc of [OC_Z_FWD, OC_Z_RET]) {
        B(len, 0.16, 0.14, xMid, OC_Y, zc, MAT.steelDark);
        B(len, 0.05, 0.24, xMid, OC_Y - 0.10, zc, MAT.steel);
        B(len, 0.04, 0.05, xMid, OC_Y + 0.11, zc, MAT.steelDark, { cast: false });
        B(len, 0.05, 0.05, xMid, OC_Y - 0.05, zc, MAT.black, { cast: false });
      }
      // end U-turns of the loop (both chain heights)
      const turnGeo = new T.TorusGeometry(0.8, 0.06, 5, 10, PI);
      turnGeo.rotateX(PI / 2);
      function addTurn(cx, y, yaw) {
        const m = new T.Mesh(turnGeo, MAT.steelDark);
        m.position.set(cx, y, 9.7);
        m.rotation.y = yaw;
        m.castShadow = false; m.receiveShadow = false;
        stat.add(m);
      }
      for (const y of [OC_Y, OC_Y - 0.10]) {
        addTurn(59.6, y, PI / 2);
        addTurn(21.0, y, -PI / 2);
      }
      for (let x = x0 + 0.8; x < x1; x += 2.2) {
        B(0.07, 0.05, 2.0, x, OC_Y - 0.16, (OC_Z_FWD + OC_Z_RET) / 2, MAT.steelDark, { cast: false });
      }
      const colXs = [21.4, 26.6, 30.2, 36.2, 39.6, 50.8, 58.0, 61.8];
      for (const cx of colXs) {
        B(0.16, 6.6, 0.16, cx, 3.3, 9.55, MAT.steel);
        B(0.3, 0.06, 0.3, cx, 0.03, 9.55, MAT.steelDark, { cast: false });
        B(0.12, 0.12, 2.0, cx, OC_Y - 0.22, 9.7, MAT.steelDark);
        B(0.08, 0.5, 0.08, cx, OC_Y - 0.5, OC_Z_FWD, MAT.steel, { cast: false });
        B(0.08, 0.5, 0.08, cx, OC_Y - 0.5, OC_Z_RET, MAT.steel, { cast: false });
        B(0.07, 1.3, 0.07, cx, 5.9, 9.85, MAT.steel, { rotX: 0.5, cast: false });
      }
      B(1.1, 0.5, 0.42, 60.9, OC_Y + 0.32, OC_Z_FWD, MAT.machineGrey);
      B(0.9, 0.3, 0.36, 60.9, OC_Y + 0.32, OC_Z_RET, MAT.machineGrey);
      B(0.26, 0.22, 0.26, 60.9, OC_Y + 0.58, OC_Z_FWD, MAT.orange, { cast: false });
      // connection back to the paint transfer bridge (AX.transferBridge ends x=20 y=7.2)
      B(0.18, 0.50, 0.18, 20.2, OC_Y - 0.32, OC_Z_FWD, MAT.steelDark);
      B(0.18, 0.50, 0.18, 20.2, OC_Y - 0.32, OC_Z_RET, MAT.steelDark);
      B(1.7, 0.16, 0.14, 19.9, OC_Y + 0.16, 9.9, MAT.steelDark, { rotY: 0.72 });
      B(0.9, 0.14, 1.7, 19.6, OC_Y + 0.16, 9.4, MAT.steelDark, { rotY: 0.72, cast: false });
      B(0.5, 0.16, 0.5, 19.8, OC_Y - 0.40, OC_Z_RET, MAT.machineGrey);
      atlasPlane(1.3, 0.62, 21.0, OC_Y - 1.15, OC_Z_RET - 0.12, 16, 0, 0);
      atlasPlane(1.3, 0.62, 50.0, OC_Y - 1.15, OC_Z_RET - 0.12, 16, 0, PI);
    }

    /* =================================================================
       D · EOL LIGHT TUNNEL + TEST RIG + DISPATCH (Z06)
       ================================================================= */
    function buildEolLine(z) {
      for (const fx of [EOL_X0 + 0.3, EOL_X0 + 2.7, EOL_X0 + 5.1]) {
        for (const s of [-1, 1]) {
          B(0.16, 3.75, 0.16, fx, 1.875, z + s * 2.78, MAT.steel);
          B(0.36, 0.06, 0.36, fx, 0.03, z + s * 2.78, MAT.steelDark, { cast: false });
        }
        B(0.18, 0.18, 5.72, fx, 3.82, z, MAT.steel);
      }
      for (const s of [-1, 1]) {
        B(EOL_X1 - EOL_X0 + 0.4, 0.14, 0.14, (EOL_X0 + EOL_X1) / 2 + 0.2, 3.78, z + s * 2.78, MAT.steel);
        B(EOL_X1 - EOL_X0 - 0.3, 0.10, 0.06, (EOL_X0 + EOL_X1) / 2, 2.55, z + s * 2.70, matPanel, { cast: false });
        B(EOL_X1 - EOL_X0 - 0.3, 0.03, 0.05, (EOL_X0 + EOL_X1) / 2, 0.05, z + s * 2.72, MAT.ledAmber, { cast: false });
      }
      for (const fx of [EOL_X0 + 1.2, EOL_X0 + 2.9, EOL_X0 + 4.6]) {
        for (const s of [-1, 1]) B(1.5, 0.09, 1.1, fx, 3.685, z + s * 1.3, matPanel, { cast: false });
      }
      for (const fx of [EOL_X0 + 1.0, EOL_X0 + 2.4]) {
        for (const s of [-1, 1]) B(1.3, 0.03, 0.52, fx, 0.02, z + s * 0.8, MAT.steel);
      }
      for (let k = 0; k < 5; k++) {
        addCylinder(stat, 0.085, 0.085, 2.4, 10, EOL_X0 + 3.6 + k * 0.34, 0.10, z, MAT.steelDark, { rotX: PI / 2, cast: false });
      }
      for (const s of [-1, 1]) B(2.0, 0.14, 0.14, EOL_X0 + 4.2, 0.07, z + s * 1.22, MAT.steelDark);
      for (const s of [-1, 1]) {
        const mz = z + s * 3.5;
        BB(0.08, 1.02, 0.08, EOL_X0 + 1.0, 0, mz, MAT.machineDark);
        B(0.55, 0.10, 0.5, EOL_X0 + 1.0, 1.06, mz, MAT.machineDark);
        B(0.44, 0.30, 0.05, EOL_X0 + 1.0, 1.30, mz, MAT.machineDark);
        planeS(0.40, 0.26, EOL_X0 + 1.0, 1.30, mz + (s < 0 ? 0.032 : -0.032), MAT.screen, s < 0 ? 0 : PI);
      }
      // EOL header sign facing west
      atlasPlane(4.3, 1.15, EOL_X0 - 0.45, 4.35, z, 15, 0, -PI / 2);
      B(0.12, 4.0, 0.12, EOL_X0 - 0.45, 2.0, z - 2.2, MAT.steel, { cast: false });
      B(0.12, 4.0, 0.12, EOL_X0 - 0.45, 2.0, z + 2.2, MAT.steel, { cast: false });
      B(0.1, 0.1, 4.5, EOL_X0 - 0.45, 4.0, z, MAT.steel, { cast: false });
      B(0.09, 1.5, 0.09, EOL_X1 + 0.3, 0.75, z - 2.3, MAT.steelDark, { cast: false });
      B(0.22, 0.22, 0.22, EOL_X1 + 0.3, 1.6, z - 2.3, MAT.ledAmber, { cast: false });
      B(EOL_X1 - EOL_X0 + 0.8, 0.02, 0.09, (EOL_X0 + EOL_X1) / 2, 0.016, z - 3.0, MAT.yellow, { cast: false });
      B(EOL_X1 - EOL_X0 + 0.8, 0.02, 0.09, (EOL_X0 + EOL_X1) / 2, 0.016, z + 3.0, MAT.yellow, { cast: false });
    }

    function buildDispatch() {
      for (const z of [12, 28]) {
        for (let k = 0; k < 4; k++) {
          for (const s of [-1, 1]) B(0.9, 0.02, 0.08, 71.0 + k * 1.5, 0.016, z + s * 1.35, MAT.yellow, { cast: false });
        }
        B(0.7, 0.02, 0.12, 72.3, 0.018, z - 0.32, MAT.yellow, { cast: false, rotY: 0.62 });
        B(0.7, 0.02, 0.12, 72.3, 0.018, z + 0.32, MAT.yellow, { cast: false, rotY: -0.62 });
        for (let k = 0; k < 3; k++) {
          for (const s of [-1, 1]) {
            CB(0.075, 0.68, 8, 71.6 + k * 1.8, 0, z + s * 2.0, MAT.yellow);
            B(0.09, 0.05, 0.09, 71.6 + k * 1.8, 0.72, z + s * 2.0, MAT.black, { cast: false });
          }
        }
      }
      // dispatch portal over line A's exit lane
      const dz = 72.6;
      for (const s of [-1, 1]) {
        B(0.18, 4.3, 0.18, dz, 2.15, 12 + s * 2.6, MAT.steel);
        B(0.4, 0.06, 0.4, dz, 0.03, 12 + s * 2.6, MAT.steelDark, { cast: false });
      }
      B(0.2, 0.2, 5.4, dz, 4.36, 12, MAT.steel);
      atlasPlane(2.6, 1.1, dz - 0.06, 3.74, 12, 17, 0, -PI / 2);
      B(0.05, 0.05, 5.0, dz, 4.22, 12, MAT.steelDark, { cast: false });
    }

    /* =================================================================
       F · floor details
       ================================================================= */
    function buildFloorDetails() {
      // island supermarket spine (serves both lines)
      for (const z of [20.0]) {
        for (let x = 22; x < 58; x += 1.6) {
          B(0.9, 0.02, 0.08, x, 0.016, z + 1.95, MAT.yellow, { cast: false });
          B(0.9, 0.02, 0.08, x, 0.016, z - 1.95, MAT.yellow, { cast: false });
        }
      }
      for (let k = 0; k < 8; k++) {
        const x = 23.5 + k * 4.4;
        B(3.2, 0.06, 0.9, x, 1.5, 20.0, MAT.pallet, { cast: false });
        B(3.2, 0.06, 0.9, x, 1.0, 20.0, MAT.pallet, { cast: false });
        B(3.2, 0.06, 0.9, x, 0.5, 20.0, MAT.pallet, { cast: false });
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          B(0.06, 1.6, 0.06, x + sx * 1.5, 0.8, 20.0 + sz * 0.4, MAT.steelDark, { cast: false });
        }
        for (let b = 0; b < 5; b++) B(0.5, 0.24, 0.55, x - 1.2 + b * 0.6, 1.65, 20.0, binMat(b), { cast: false });
        B(3.4, 0.03, 1.1, x, 0.014, 20.0, MAT.steelDark, { cast: false });
      }
      // south-edge racks for line B
      for (let k = 0; k < 9; k++) {
        const x = 22.5 + k * 4.2;
        B(2.6, 0.06, 0.58, x, 1.4, 32.7, MAT.pallet, { cast: false });
        B(2.6, 0.06, 0.58, x, 0.9, 32.7, MAT.pallet, { cast: false });
        for (const sx of [-1, 1]) {
          B(0.06, 1.45, 0.06, x + sx * 1.2, 0.72, 32.41, MAT.steelDark, { cast: false });
          B(0.06, 1.45, 0.06, x + sx * 1.2, 0.72, 32.99, MAT.steelDark, { cast: false });
        }
        for (let b = 0; b < 4; b++) B(0.44, 0.24, 0.5, x - 0.75 + b * 0.5, 1.55, 32.7, binMat(b + 1), { cast: false });
      }
      // WIP bins near line starts
      for (const p of [[19.6, 6.9], [19.6, 33.1], [60.8, 6.9]]) {
        B(0.8, 0.7, 0.7, p[0], 0.35, p[1], MAT.machineGrey);
        B(0.84, 0.08, 0.74, p[0], 0.74, p[1], MAT.yellow, { cast: false });
      }
    }

    function buildHeader(line) {
      const z = line.z, x = 18.4;
      for (const s of [-1, 1]) B(0.16, 4.5, 0.16, x, 2.25, z + s * 2.4, MAT.steel);
      B(0.2, 0.2, 5.0, x, 4.55, z, MAT.steel);
      B(0.05, 0.34, 4.7, x, 4.32, z, MAT.steelDark, { cast: false });
      atlasPlane(3.4, 1.3, x + 0.05, 3.85, z, line.flip ? 14 : 13, 0, 0);
      B(2.9, 0.05, 0.05, x, 3.28, z + 0.06, MAT.ledAmber, { cast: false });
    }

    /* ---------------- assemble the static scene ---------------- */
    const lines = [
      { z: 12, flip: false, cars: [] },
      { z: 28, flip: true, cars: [] },
    ];
    for (const line of lines) {
      buildConveyor(line.z);
      for (let i = 0; i < NST; i++) buildStation(line, i);
      buildHeader(line);
    }
    buildOverhead();
    buildEolLine(12);
    buildEolLine(28);
    buildDispatch();
    buildFloorDetails();

    /* =================================================================
       operators + beacon masts + staging
       ================================================================= */
    const ops = [
      [21.6, 10.02, 0.5], [28.9, 10.02, -0.2], [37.9, 13.72, 1.4], [46.8, 10.02, 0.9], [52.4, 13.72, -1.1],
      [25.8, 26.2, 0.4], [32.2, 29.72, 2.1], [45.6, 26.2, -0.5], [53.0, 29.72, 1.2],
      [39.2, 19.5, 0.9], [44.8, 20.9, 2.4],
      [67.8, 17.6, 2.0], [73.4, 17.6, -1.6], [56.0, 13.72, 0.2], [21.5, 29.9, 2.8],
    ];
    for (let i = 0; i < ops.length; i++) {
      const p = ops[i];
      const mm = new T.Mesh(ASSET.ops[i % 3], matOps);
      mm.position.set(p[0], 0, p[1]);
      mm.rotation.y = p[2];
      mm.castShadow = true; mm.receiveShadow = true;
      stat.add(mm);
    }

    const beaconPos = [
      { x: 36.2, z: 14.1, y: 4.30 },     // AS-01
      { x: 36.2, z: 25.9, y: 4.30 },     // AS-02
      { x: 42.0, z: OC_Z_FWD, y: 7.35 }, // OC-01
      { x: 66.4, z: 12, y: 4.55 },       // EOL-01
    ];
    for (let i = 0; i < 2; i++) {
      const p = beaconPos[i];
      BB(0.10, p.y - 0.15, 0.10, p.x, 0, p.z, MAT.steelDark);
      B(0.2, 0.08, 0.2, p.x, p.y - 0.18, p.z, MAT.machineDark, { cast: false });
    }
    B(0.10, 0.5, 0.10, beaconPos[2].x, beaconPos[2].y - 0.3, beaconPos[2].z, MAT.steelDark, { cast: false });
    B(0.2, 0.08, 0.2, beaconPos[2].x, beaconPos[2].y - 0.18, beaconPos[2].z, MAT.machineDark, { cast: false });
    B(0.10, 0.5, 0.10, beaconPos[3].x, beaconPos[3].y - 0.3, beaconPos[3].z, MAT.steelDark, { cast: false });
    B(0.2, 0.08, 0.2, beaconPos[3].x, beaconPos[3].y - 0.18, beaconPos[3].z, MAT.machineDark, { cast: false });

    // island-edge racks (both lines) + extra harness stations
    for (let k = 0; k < 4; k++) {
      eqRacks(26.2 + k * 9.4, 17.0, 1);
      eqRacks(30.6 + k * 9.4, 22.8, -1);
    }
    eqHarness(25.0, 8.6, -1);
    eqHarness(55.2, 8.6, -1);

    // staging: 6 parked cars + 1 loading bay car (open doors)
    const staging = [
      { x: 65.2, z: 6.8, ry: 0.10, color: 1, open: false },
      { x: 70.1, z: 6.7, ry: 0.05, color: 0, open: false },
      { x: 66.0, z: 18.7, ry: 0.0, color: 2, open: false },
      { x: 71.1, z: 18.7, ry: 0.0, color: 1, open: false },
      { x: 66.0, z: 22.5, ry: PI, color: 0, open: false },
      { x: 71.1, z: 22.5, ry: PI, color: 2, open: false },
      { x: 75.4, z: 19.4, ry: 1.12, color: 0, open: true },
    ];

    // light strip local transforms (shared) — only moving cars carry lights
    const LIGHT_LOCAL = [];
    (function buildLightLocals() {
      const defs = [
        [2.315, 0.825, 0.60, 0.05, 0.065, 0.34],
        [2.315, 0.825, -0.60, 0.05, 0.065, 0.34],
        [-2.335, 0.90, 0.56, 0.05, 0.06, 0.32],
        [-2.335, 0.90, -0.56, 0.05, 0.06, 0.32],
        [-2.30, 0.93, 0.0, 0.04, 0.032, 1.42],
      ];
      for (const d of defs) {
        _o.position.set(d[0], d[1], d[2]);
        _o.rotation.set(0, 0, 0);
        _o.scale.set(d[3], d[4], d[5]);
        _o.updateMatrix();
        LIGHT_LOCAL.push(_o.matrix.clone());
      }
    })();
    const LIGHT_COUNT = CPL * 2 * 5;
    const lightGeo = new T.BoxGeometry(1, 1, 1);
    const lightMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const lightMesh = new T.InstancedMesh(lightGeo, lightMat, LIGHT_COUNT);
    lightMesh.frustumCulled = false;
    lightMesh.castShadow = false; lightMesh.receiveShadow = false;
    group.add(lightMesh);
    const headC = new T.Color(1.75, 1.62, 1.42);
    const tailC = new T.Color(2.0, 0.16, 0.09);
    for (let i = 0; i < LIGHT_COUNT; i++) lightMesh.setColorAt(i, i % 5 < 2 ? headC : tailC);
    lightMesh.instanceColor.needsUpdate = true;
    _m.identity();
    for (let i = 0; i < LIGHT_COUNT; i++) lightMesh.setMatrixAt(i, _m);

    // static (parked) cars
    for (let idx = 0; idx < staging.length; idx++) {
      const s = staging[idx];
      const geo = s.open ? ASSET.carOpen : ASSET.car;
      const m1 = new T.Mesh(geo.paint, MAT.paintBody[s.color]);
      m1.position.set(s.x, 0, s.z);
      m1.rotation.y = s.ry;
      m1.castShadow = true; m1.receiveShadow = true;
      stat.add(m1);
      const m2 = new T.Mesh(geo.dark, carDarkMat);
      m2.position.set(s.x, 0, s.z);
      m2.rotation.y = s.ry;
      m2.castShadow = false; m2.receiveShadow = true;
      stat.add(m2);
      // parking bay markings
      B(5.0, 0.02, 0.08, s.x, 0.015, s.z + 1.35, MAT.yellow, { cast: false, rotY: s.ry });
      B(5.0, 0.02, 0.08, s.x, 0.015, s.z - 1.35, MAT.yellow, { cast: false, rotY: s.ry });
    }

    /* ---------------- shadow casters: keep only major static masses ------- */
    const castMats = [MAT.steel, MAT.machineWhite, MAT.machineGrey, MAT.machineDark, MAT.orange];
    for (let ci = 0; ci < MAT.paintBody.length; ci++) castMats.push(MAT.paintBody[ci]);
    stat.traverse(function (o) {
      if (o.isMesh) o.castShadow = castMats.indexOf(o.material) >= 0;
    });

    /* ---------------- merge all static geometry ---------------- */
    mergeStatic(stat);

    /* =================================================================
       dynamic — moving cars, robots, overhead carriers, shadows, beacons
       ================================================================= */
    function makeCar() {
      const g = new T.Group();
      g.name = "asmCar";
      const m1 = new T.Mesh(ASSET.car.paint, null);
      const m2 = new T.Mesh(ASSET.car.dark, null);
      m1.castShadow = false; m1.receiveShadow = true;
      m2.castShadow = false; m2.receiveShadow = true;
      g.add(m1); g.add(m2);
      group.add(g);
      return { g: g, m1: m1, m2: m2, paint: null, dark: null, alpha: 1 };
    }

    const cars = [];
    for (let li = 0; li < 2; li++) {
      const line = lines[li];
      const phase = li === 0 ? 0 : SPACING * 0.5;
      for (let ci = 0; ci < CPL; ci++) {
        const car = makeCar();
        const col = (ci * 3 + li) % MAT.paintBody.length;
        car.paint = MAT.paintBody[col].clone();
        car.dark = carDarkMat.clone();
        car.m1.material = car.paint;
        car.m2.material = car.dark;
        car.line = line;
        car.index = li * CPL + ci;
        car.r = (phase + ci * SPACING) % RING_LEN;
        line.cars.push(car);
        cars.push(car);
      }
    }

    function applyCarPose(car) {
      const r = car.r;
      let px, py;
      if (r < LINE_LEN) {
        px = X0 + r; py = CAR_Y;
      } else {
        const d = r - LINE_LEN;
        px = X1 + d;
        py = CAR_Y * (1 - Math.min(1, d / 2.4));
      }
      car.g.position.set(px, py, car.line.z);
      car.poseX = px; car.poseY = py;
    }
    function carAlpha(r) {
      if (r < FADE_IN) return clamp(r / FADE_IN, 0, 1);
      if (r > RING_LEN - FADE_OUT) return clamp((RING_LEN - r) / FADE_OUT, 0, 1);
      return 1;
    }
    function setCarAlpha(car, a) {
      if (Math.abs(car.alpha - a) < 0.004) return;
      car.alpha = a;
      const tr = a < 0.995;
      car.paint.transparent = tr; car.paint.opacity = a;
      car.dark.transparent = tr; car.dark.opacity = a;
    }
    for (const car of cars) {
      applyCarPose(car);
      car.alpha = -1;
      setCarAlpha(car, carAlpha(car.r));
    }

    // ---- animated robots (one per line) ----
    const robots = [];
    function makeRobot(x, z, yaw, line, cfg) {
      const root = new T.Group();
      root.name = "asmRobot";
      root.position.set(x, 0, z);
      root.rotation.y = yaw;
      const j1 = new T.Group();
      const j2 = new T.Group();
      j2.position.y = 1.15;
      const j3 = new T.Group();
      j3.position.y = 1.3;
      const m1 = new T.Mesh(ASSET.robot.j1, matRobot);
      const m2 = new T.Mesh(ASSET.robot.j2, matRobot);
      const m3 = new T.Mesh(ASSET.robot.j3, matRobot);
      m1.castShadow = m2.castShadow = m3.castShadow = true;
      m1.receiveShadow = m2.receiveShadow = m3.receiveShadow = true;
      j1.add(m1); j2.add(m2); j3.add(m3);
      j1.add(j2); j2.add(j3);
      root.add(j1);
      group.add(root);
      robots.push({ root: root, j1: j1, j2: j2, j3: j3, yaw: yaw, line: line, cfg: cfg });
    }
    makeRobot(ST_X[7], 8.6 - 0.7, 0, lines[0], { base: 0.55, amp: 0.30, speed: 0.34 });
    makeRobot(ST_X[6], 24.6 - 0.7, 0, lines[1], { base: 0.55, amp: 0.30, speed: 0.28 });

    // ---- overhead carriers (2 instanced meshes) ----
    const CARRIERS = 8;
    const carrierS = [];
    for (let i = 0; i < CARRIERS; i++) carrierS.push(i * (OC_LOOP / CARRIERS));
    function buildDoorCarrierGeo() {
      const parts = [];
      parts.push(colorize(cyl(0.022, 1.8, 4, 0, -0.9, 0), 0x2b3036));
      parts.push(colorize(bx(0.08, 0.08, 0.9, 0, -1.20, 0), 0x2b3036));
      const cols = [0x2c3238, 0xe8e4da, 0x7e97a4, 0x9c5a3c];
      for (let k = 0; k < 2; k++) {
        parts.push(colorize(xf(new T.BoxGeometry(0.045, 0.88, 1.0), 0, -1.60, k ? 0.34 : -0.34), cols[(k * 2 + 1) % 4]));
      }
      return mergeGeoms(parts);
    }
    function buildShellCarrierGeo() {
      const parts = [];
      parts.push(colorize(cyl(0.022, 1.8, 4, 0, -0.9, 0), 0x2b3036));
      parts.push(colorize(bx(0.08, 0.08, 0.9, 0, -1.20, 0), 0x2b3036));
      const shell = colorize(xf(new T.BoxGeometry(0.40, 0.50, 0.92), 0, -1.62, 0), 0x9aa1a5);
      parts.push(shell);
      const shell2 = colorize(xf(new T.BoxGeometry(0.40, 0.22, 0.68), 0, -1.30, 0), 0x8a9196);
      parts.push(shell2);
      return mergeGeoms(parts);
    }
    const carrierMat = new T.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.8 });
    const doorCarriers = new T.InstancedMesh(buildDoorCarrierGeo(), carrierMat, 6);
    const shellCarriers = new T.InstancedMesh(buildShellCarrierGeo(), carrierMat, 3);
    doorCarriers.frustumCulled = false; shellCarriers.frustumCulled = false;
    doorCarriers.castShadow = shellCarriers.castShadow = true;
    group.add(doorCarriers); group.add(shellCarriers);

    const _cp = { x: 0, z: 0, yaw: 0 };
    function carrierPose(s) {
      s = ((s % OC_LOOP) + OC_LOOP) % OC_LOOP;
      if (s < OC_FWD) { _cp.x = 21 + s; _cp.z = OC_Z_FWD; _cp.yaw = 0; return _cp; }
      s -= OC_FWD;
      if (s < OC_TURN) {
        const ang = PI * (s / OC_TURN);
        _cp.x = 59.6 + 0.8 * Math.sin(ang); _cp.z = 9.7 + 0.8 * Math.cos(ang); _cp.yaw = ang;
        return _cp;
      }
      s -= OC_TURN;
      if (s < OC_FWD) { _cp.x = 59.6 - s; _cp.z = OC_Z_RET; _cp.yaw = PI; return _cp; }
      s -= OC_FWD;
      const ang = PI + PI * (s / OC_TURN);
      _cp.x = 21 + 0.8 * Math.sin(ang); _cp.z = 9.7 + 0.8 * Math.cos(ang); _cp.yaw = ang;
      return _cp;
    }

    // ---- contact shadows for moving cars ----
    const shTex = canvasTexture(64, 64, function (ctx, w, h) {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(0,0,0,0.62)");
      g.addColorStop(0.55, "rgba(0,0,0,0.30)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }, { srgb: false });
    const shMat = new T.MeshBasicMaterial({ map: shTex, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false });
    const shGeo = new T.PlaneGeometry(5.3, 2.5);
    shGeo.rotateX(-PI / 2);
    const shadowMesh = new T.InstancedMesh(shGeo, shMat, CPL * 2);
    shadowMesh.frustumCulled = false;
    shadowMesh.castShadow = false; shadowMesh.receiveShadow = false;
    shadowMesh.renderOrder = 2;
    group.add(shadowMesh);

    // ---- beacons ----
    const beaconGeo = new T.SphereGeometry(0.14, 8, 6);
    const beaconMat = new T.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const beaconMesh = new T.InstancedMesh(beaconGeo, beaconMat, 4);
    beaconMesh.frustumCulled = false;
    beaconMesh.castShadow = false; beaconMesh.receiveShadow = false;
    group.add(beaconMesh);
    const bGreen = new T.Color(0.55, 1.5, 0.85);
    const bAmber = new T.Color(1.7, 1.0, 0.20);
    const bRed = new T.Color(2.0, 0.25, 0.12);
    for (let i = 0; i < 4; i++) {
      _m.makeTranslation(beaconPos[i].x, beaconPos[i].y, beaconPos[i].z);
      beaconMesh.setMatrixAt(i, _m);
      beaconMesh.setColorAt(i, bGreen);
    }
    beaconMesh.instanceColor.needsUpdate = true;
    const beaconState = ["run", "run", "run", "run"];

    // ---- glow shimmer on the EOL floor (cheap, no sprites) ----

    /* ---- pick proxies (<= 8) ---- */
    addPickProxy(group, { kind: "machine", id: "AS-01", title: "总装线 A · FINAL ASSEMBLY A", zone: "Z05", anchor: { x: 40, y: 2.6, z: 12 } }, 44, 3.0, 4.6, 40, 1.7, 12);
    addPickProxy(group, { kind: "machine", id: "AS-02", title: "总装线 B · FINAL ASSEMBLY B", zone: "Z05", anchor: { x: 40, y: 2.6, z: 28 } }, 44, 3.0, 4.6, 40, 1.7, 28);
    addPickProxy(group, { kind: "machine", id: "OC-01", title: "空中输送链 · OVERHEAD CONVEYOR", zone: "Z05", anchor: { x: 40, y: 6.4, z: 9.7 } }, 41, 1.8, 2.6, 40.5, 6.2, 9.7);
    addPickProxy(group, { kind: "machine", id: "EOL-01", title: "下线检测 · EOL TEST", zone: "Z06", anchor: { x: 66, y: 3.2, z: 12 } }, 7.2, 4.2, 24, 67.0, 2.1, 20);
    addPickProxy(group, { kind: "machine", id: "AS-RB1", title: "玻璃装配机器人 · GLASS ROBOT", zone: "Z05", anchor: { x: ST_X[7], y: 2.2, z: 7.9 } }, 3.4, 3.6, 2.8, ST_X[7], 1.8, 7.9);
    addPickProxy(group, { kind: "machine", id: "AS-RB2", title: "座椅装配机器人 · SEAT ROBOT", zone: "Z05", anchor: { x: ST_X[6], y: 2.2, z: 23.9 } }, 3.4, 3.6, 2.8, ST_X[6], 1.8, 23.9);

    /* =================================================================
       SIM registration
       ================================================================= */
    const stA = SIM.registerStation({ id: "AS-01", zone: "Z05", name: "总装线 A / FINAL ASSEMBLY A", kind: "line", cycle: TAKT, beacon: beaconPos[0] });
    const stB = SIM.registerStation({ id: "AS-02", zone: "Z05", name: "总装线 B / FINAL ASSEMBLY B", kind: "line", cycle: TAKT, beacon: beaconPos[1] });
    const stOC = SIM.registerStation({ id: "OC-01", zone: "Z05", name: "空中输送链 / OVERHEAD CONVEYOR", kind: "conveyor", cycle: 140, beacon: beaconPos[2] });
    const stEOL = SIM.registerStation({ id: "EOL-01", zone: "Z06", name: "下线检测光廊 / EOL LIGHT TUNNEL", kind: "test", cycle: TAKT, beacon: beaconPos[3] });

    /* =================================================================
       animation tick
       ================================================================= */
    let carrierPos = 0;
    let robotPhase = 0;
    let wipPrev = -1;

    addTick(function (t, dt) {
      const sdt = SIM.sdt;
      const sA = stA.state, sB = stB.state, sOC = stOC.state, sEOL = stEOL.state;
      const eolF = sEOL === "run" ? 1 : sEOL === "idle" ? 0.4 : 0;
      const fA = (sA === "run" ? 1 : sA === "idle" ? 0.35 : 0) * eolF;
      const fB = (sB === "run" ? 1 : sB === "idle" ? 0.35 : 0) * eolF;
      let wip = 0;

      if (sdt > 0) {
        robotPhase += sdt * 0.34;
        for (let li = 0; li < 2; li++) {
          const line = lines[li];
          const f = li === 0 ? fA : fB;
          for (let ci = 0; ci < CPL; ci++) {
            const car = line.cars[ci];
            if (f > 0) {
              car.r += LINE_SPEED * f * sdt;
              if (car.r >= RING_LEN) {
                car.r -= RING_LEN;
                if (sEOL !== "down") SIM.completeUnit("Z06");
              }
            }
            applyCarPose(car);
            setCarAlpha(car, carAlpha(car.r));
            if (car.r < LINE_LEN) wip++;
            const b = car.index * 5;
            for (let k = 0; k < 5; k++) {
              _m2.copy(LIGHT_LOCAL[k]);
              _m2.elements[12] += car.poseX;
              _m2.elements[13] += car.poseY;
              _m2.elements[14] += car.line.z;
              lightMesh.setMatrixAt(b + k, _m2);
            }
            _m.makeTranslation(car.poseX, 0.02, car.line.z);
            shadowMesh.setMatrixAt(car.index, _m);
          }
        }
        lightMesh.instanceMatrix.needsUpdate = true;
        shadowMesh.instanceMatrix.needsUpdate = true;

        // overhead carriers
        carrierPos += 0.17 * sdt * (sOC === "run" ? 1 : sOC === "idle" ? 0.3 : 0);
        if (carrierPos > OC_LOOP) carrierPos -= OC_LOOP;
        let di = 0, si = 0;
        for (let i = 0; i < CARRIERS; i++) {
          const p = carrierPose(carrierS[i] + carrierPos);
          _q.setFromEuler(_eu.set(0, p.yaw, 0));
          _m.compose(_v.set(p.x, OC_Y - 0.10, p.z), _q, _one);
          if (i < 3) shellCarriers.setMatrixAt(si++, _m);
          else doorCarriers.setMatrixAt(di++, _m);
        }
        doorCarriers.instanceMatrix.needsUpdate = true;
        shellCarriers.instanceMatrix.needsUpdate = true;

        // animated robots
        for (let ri = 0; ri < robots.length; ri++) {
          const rb = robots[ri];
          const f = rb.line === lines[0] ? fA : fB;
          const ph = robotPhase * (0.6 + f * 0.6) + ri * 2.1;
          rb.j1.rotation.y = rb.yaw + Math.sin(ph * 0.9) * 0.42;
          rb.j2.rotation.x = rb.cfg.base + Math.sin(ph) * rb.cfg.amp;
          rb.j3.rotation.x = 1.35 + Math.sin(ph + 1.15) * 0.30;
        }
      }

      function setBeacon(i, st) {
        if (beaconState[i] === st) return;
        beaconState[i] = st;
        beaconMesh.setColorAt(i, st === "run" ? bGreen : st === "idle" ? bAmber : bRed);
        beaconMesh.instanceColor.needsUpdate = true;
      }
      setBeacon(0, sA);
      setBeacon(1, sB);
      setBeacon(2, sOC);
      setBeacon(3, sEOL);

      if (wip !== wipPrev) {
        wipPrev = wip;
        SIM.wip("Z05", wip);
      }
    });

    // build timing is reported through the lead's __BUILD_LOG__; no extra globals
  };
})();
