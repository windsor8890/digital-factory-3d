/* ============================================================
   90 · boot — assembly, camera, picking, HUD wiring, frame loop
   ============================================================ */

let renderer, scene, camera;
const APP = {};
window.APP = APP;

(function boot() {
  const el = (id) => document.getElementById(id);
  const canvas = el("stage");
  const veil = el("veil");
  const isStill = FLAGS.still;
  const instant = FLAGS.instant;

  let dpr = FLAGS.lq ? 1 : (FLAGS.pr ? Math.max(0.5, Math.min(2, FLAGS.pr)) : Math.min(window.devicePixelRatio || 1, 1.75));
  let postOn = !FLAGS.raw;
  let dataOn = !FLAGS.noData;
  let labelsOn = !FLAGS.noLabels;
  let tourOn = false;
  let selectedZone = null;
  let hoverPick = null;
  let firstFrame = true;
  let started = false;
  let ready = false;
  let qualityDropped = false;

  /* ---------- camera rig ---------- */
  const HOME = { tx: 4, ty: 3, tz: 2, azim: -0.7, elev: 0.44, dist: 300, fov: 29 };
  const VIEWS = { overview: HOME };
  for (const z of ZONES) VIEWS[z.id] = z.view;

  const cam = { tx: 0, ty: 0, tz: 0, azim: 0, elev: 0, dist: 0, fov: 27 };
  const goal = { tx: 0, ty: 0, tz: 0, azim: 0, elev: 0, dist: 0, fov: 27 };
  const camTarget = new T.Vector3();
  let flying = false;
  let userDragging = false;
  let idleTimer = 0;
  /* ---------- cinematic tour: continuous camera move through every stage ----------
     Shot i starts where shot i-1 ends; each shot first flies in to its subject pose
     `m` (share = split) then drifts to `b` while the subject stays framed. The last
     shot ends on the opening pose so the whole loop is one seamless one-take. */
  const CINEMA = [
    { zone: "overview", zh: "总览", en: "PLANT OVERVIEW", dur: 10, split: 0.62,
      a: { tx: 0, ty: 5, tz: 6, azim: -0.86, elev: 0.5, dist: 352, fov: 31 },
      m: { tx: 3, ty: 4, tz: 3, azim: -0.76, elev: 0.47, dist: 322, fov: 30 },
      b: { tx: 6, ty: 3, tz: 0, azim: -0.62, elev: 0.42, dist: 286, fov: 28 } },
    { zone: "Z01", zh: "原材料立库", en: "RAW STORE / AS-RS", dur: 10, split: 0.55,
      m: { tx: -62, ty: 6, tz: 0, azim: -0.72, elev: 0.38, dist: 82, fov: 34 },
      b: { tx: -58, ty: 5.5, tz: 0, azim: -0.95, elev: 0.33, dist: 66, fov: 36 } },
    { zone: "Z02", zh: "冲压线", en: "PRESS LINE", dur: 10, split: 0.5,
      m: { tx: -30, ty: 4, tz: -20, azim: 0.44, elev: 0.15, dist: 36, fov: 42 },
      b: { tx: -26, ty: 4.4, tz: -20, azim: 0.3, elev: 0.19, dist: 30, fov: 40 } },
    { zone: "Z03", zh: "焊装车间", en: "BODY SHOP", dur: 10, split: 0.5,
      m: { tx: -30, ty: 3, tz: 20, azim: 1.54, elev: 0.12, dist: 32, fov: 44 },
      b: { tx: -26, ty: 3.2, tz: 22, azim: 1.3, elev: 0.16, dist: 40, fov: 42 } },
    { zone: "Z04", zh: "涂装车间", en: "PAINT SHOP", dur: 9.5, split: 0.5,
      m: { tx: 2, ty: 3, tz: -18, azim: 0.0, elev: 0.12, dist: 31, fov: 42 },
      b: { tx: 3, ty: 3.4, tz: -19, azim: 0.3, elev: 0.16, dist: 36, fov: 40 } },
    { zone: "Z05", zh: "总装线", en: "FINAL ASSEMBLY", dur: 10.5, split: 0.55,
      m: { tx: 40, ty: 5, tz: 20, azim: -0.9, elev: 0.3, dist: 70, fov: 30 },
      b: { tx: 44, ty: 4.6, tz: 20, azim: -1.1, elev: 0.26, dist: 62, fov: 32 } },
    { zone: "Z06", zh: "检测发运", en: "EOL & DISPATCH", dur: 9.5, split: 0.5,
      m: { tx: 68, ty: 4, tz: 21, azim: -1.55, elev: 0.11, dist: 30, fov: 42 },
      b: { tx: 70, ty: 4.2, tz: 18, azim: -1.55, elev: 0.12, dist: 24, fov: 44 } },
    { zone: "overview", zh: "升空", en: "PULL-UP", dur: 9, split: 0.62,
      m: { tx: 66, ty: 6, tz: 24, azim: -0.35, elev: 0.32, dist: 110, fov: 32 },
      b: { tx: 52, ty: 5, tz: 12, azim: -0.52, elev: 0.44, dist: 210, fov: 30 } },
    { zone: "overview", zh: "总览", en: "PLANT OVERVIEW", dur: 10, split: 0.5,
      m: { tx: 22, ty: 4, tz: 4, azim: -0.7, elev: 0.48, dist: 330, fov: 29 },
      b: null },
  ];
  // the closing shot returns exactly to the opening pose for a seamless loop
  CINEMA[CINEMA.length - 1].b = CINEMA[0].a;
  for (let i = 1; i < CINEMA.length; i++) CINEMA[i].a = CINEMA[i - 1].b;
  const CINEMA_SPEED = Q.tourfast === "1" ? 0.16 : 1;
  const CINEMA_START = [];
  let CINEMA_TOTAL = 0;
  for (const shot of CINEMA) {
    CINEMA_START.push(CINEMA_TOTAL);
    CINEMA_TOTAL += shot.dur * CINEMA_SPEED;
  }
  let cinemaPaused = false;
  let cinemaStart = 0;
  let cinemaShotIdx = -1;
  let cinemaShownPct = -1;
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
  function lerpPose(a, b, t) {
    return {
      tx: lerp(a.tx, b.tx, t), ty: lerp(a.ty, b.ty, t), tz: lerp(a.tz, b.tz, t),
      azim: lerp(a.azim, b.azim, t), elev: lerp(a.elev, b.elev, t),
      dist: lerp(a.dist, b.dist, t), fov: lerp(a.fov, b.fov, t),
    };
  }

  const ptr = { nx: 0, ny: 0, sx: 0, sy: 0 };
  const drag = { active: false, moved: 0, x: 0, y: 0, downTime: 0, pointers: new Map(), pinch: 0 };

  const raycaster = new T.Raycaster();
  const ndc = new T.Vector2();
  const tmpV = new T.Vector3();
  const tmpV2 = new T.Vector3();
  const UP = new T.Vector3(0, 1, 0);
  const RIGHT = new T.Vector3();

  function shortestAngle(a, b) {
    let d = ((b - a + PI) % TAU + TAU) % TAU - PI;
    return a + d;
  }
  function applyGoal(v, instantSnap) {
    goal.tx = v.tx; goal.ty = v.ty; goal.tz = v.tz;
    goal.azim = v.azim; goal.elev = v.elev; goal.dist = v.dist;
    goal.fov = v.fov || 27;
    flying = true;
    if (instantSnap) {
      cam.tx = goal.tx; cam.ty = goal.ty; cam.tz = goal.tz;
      cam.azim = goal.azim; cam.elev = goal.elev; cam.dist = goal.dist;
      cam.fov = goal.fov;
      flying = false;
    }
  }
  function updateCamera(dt) {
    if (tourOn) {
      // cinematic mode: the pose is driven directly by the shot path, no smoothing/parallax
      camTarget.set(cam.tx, cam.ty, cam.tz);
      const ce = Math.cos(cam.elev), se = Math.sin(cam.elev);
      const ca = Math.cos(cam.azim), sa = Math.sin(cam.azim);
      camera.position.set(
        camTarget.x + cam.dist * ce * sa,
        camTarget.y + cam.dist * se,
        camTarget.z + cam.dist * ce * ca
      );
      camera.lookAt(camTarget);
      if (Math.abs(camera.fov - cam.fov) > 0.002) {
        camera.fov = cam.fov;
        camera.updateProjectionMatrix();
      }
      if (postOn && post.mats.composite) {
        post.mats.composite.uniforms.uFocus.value = cam.dist;
        post.mats.composite.uniforms.uRange.value = cam.dist * 1.8;
      }
      return;
    }
    const k = 1 - Math.exp(-dt * (userDragging ? 16 : 4.4));
    const kp = 1 - Math.exp(-dt * 3.4);
    // shortest-path interpolation of the orbit azimuth
    const da = ((goal.azim - cam.azim + PI) % TAU + TAU) % TAU - PI;
    cam.azim += da * k;
    cam.elev = lerp(cam.elev, goal.elev, k);
    cam.dist = lerp(cam.dist, goal.dist, k);
    cam.fov = lerp(cam.fov, goal.fov, k);
    if (Math.abs(camera.fov - cam.fov) > 0.02) {
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }
    cam.tx = lerp(cam.tx, goal.tx + ptr.sx * 1.5, kp);
    cam.ty = lerp(cam.ty, goal.ty - ptr.sy * 1.0, kp);
    cam.tz = lerp(cam.tz, goal.tz + ptr.sx * 0.4, kp);
    if (flying) {
      const close = Math.abs(goal.dist - cam.dist) < 1.2 && Math.abs(goal.elev - cam.elev) < 0.004 &&
        Math.abs(cam.tx - goal.tx) < 2.0 && Math.abs(cam.tz - goal.tz) < 2.0;
      if (close) flying = false;
    }
    if (!isStill && !flying && !userDragging && idleTimer > 7 && !tourOn) {
      goal.azim += dt * 0.0035;
    }
    // camera position on a spherical orbit around target
    camTarget.set(cam.tx, cam.ty, cam.tz);
    const ce = Math.cos(cam.elev), se = Math.sin(cam.elev);
    const ca = Math.cos(cam.azim), sa = Math.sin(cam.azim);
    camera.position.set(
      camTarget.x + cam.dist * ce * sa,
      camTarget.y + cam.dist * se,
      camTarget.z + cam.dist * ce * ca
    );
    camera.lookAt(camTarget);
    // keep the studio background centred on the camera
    if (studio.scene) studio.scene.position.set(0, 0, 0);
    if (postOn && post.mats.composite) {
      post.mats.composite.uniforms.uFocus.value = cam.dist;
      post.mats.composite.uniforms.uRange.value = cam.dist * 1.8;
    }
  }

  /* ---------- renderer / scene ---------- */
  function initRenderer() {
    try {
      renderer = new T.WebGLRenderer({
        canvas: canvas, antialias: false, alpha: false, stencil: false,
        powerPreference: "high-performance",
      });
    } catch (e) {
      reportError("WebGL 初始化失败 / WebGL unavailable: " + e);
      const vt = document.querySelector(".veil-text");
      if (vt) vt.innerHTML = "<b>无法启动 WebGL</b>请使用支持 WebGL2 的浏览器";
      return false;
    }
    renderer.setPixelRatio(dpr);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = postOn ? T.NoToneMapping : T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x060708, 1);
    renderer.info.autoReset = false;
    APP.renderer = renderer;
    return true;
  }

  function buildScene() {
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(27, window.innerWidth / window.innerHeight, 2, 1600);
    APP.scene = scene;
    APP.camera = camera;

    // shared procedural textures + materials must exist before any builder runs
    buildTextures();
    buildMaterials();

    buildStudio();
    scene.environment = studio.env;
    if (studio.env) studio.env.colorSpace = T.SRGBColorSpace;

    const log = [];
    const steps = [
      ["buildBuilding", "建筑外壳"],
      ["buildProcess", "工艺产线"],
      ["buildLogistics", "物流系统"],
      ["buildAssembly", "总装线"],
      ["buildData", "数据层"],
    ];
    for (const [fn, label] of steps) {
      const f = window[fn];
      if (typeof f !== "function") { log.push(label + ": stub"); continue; }
      const t0 = performance.now();
      try {
        f();
        log.push(label + " " + Math.round(performance.now() - t0) + "ms");
      } catch (e) {
        reportError("BUILD " + label + ": " + (e && e.stack ? e.stack : e));
      }
    }
    window.__BUILD_LOG__ = log;
    scene.updateMatrixWorld(true);

    if (postOn) {
      const s = renderer.getDrawingBufferSize(new T.Vector2());
      initPost(s.x, s.y);
    }

    if (window.DATA) {
      if (DATA.setDataLayer) DATA.setDataLayer(dataOn);
      if (DATA.setLabels) DATA.setLabels(labelsOn);
    }
  }

  /* ---------- HUD ---------- */
  const ui = {
    clock: el("clock"), shiftName: el("shiftName"), syncVal: el("syncVal"),
    oeeVal: el("oeeVal"), oeeDelta: el("oeeDelta"), oeeA: el("oeeA"), oeeP: el("oeeP"), oeeQ: el("oeeQ"),
    oeeRing: el("oeeRing"),
    outVal: el("outVal"), outTarget: el("outTarget"), outDelta: el("outDelta"), spark: el("sparkOut"),
    outRate: el("outRate"),
    wipVal: el("wipVal"), wipBar: el("wipBar"),
    agvVal: el("agvVal"), agvBar: el("agvBar"),
    energyVal: el("energyVal"), energyPeak: el("energyPeak"), energyBars: el("energyBars"),
    alarmCount: el("alarmCount"), alarmList: el("alarmList"),
    zoneList: el("zoneList"), views: el("views"),
    inspKind: el("inspKind"), inspTitle: el("inspTitle"), inspSub: el("inspSub"),
    inspStat1: el("inspStat1"), inspStat2: el("inspStat2"), inspStat3: el("inspStat3"),
    inspMachines: el("inspMachines"), inspHint: el("inspHint"),
    tooltip: el("tooltip"), debug: el("debug"),
    rates: el("rates"), viewName: el("viewName"),
    compass: el("compassNeedle"), scaleLine: el("scaleLine"), scaleText: el("scaleText"),
    tourChapter: el("tourChapter"), tourIndex: el("tourIndex"), tourTitle: el("tourTitle"),
    tourSub: el("tourSub"), tourProgress: el("tourProgress"),
  };

  const zoneUi = {};
  const dockBtns = {};
  const machineUi = {};
  let machineSig = "";
  let alarmSig = "";
  let sparkCtx = null;
  let wipShown = -1;

  const nf = (v, d) => Number(v).toLocaleString("en-US", { maximumFractionDigits: d === undefined ? 0 : d, minimumFractionDigits: d === undefined ? 0 : d });
  const pad2 = (v) => (v < 10 ? "0" : "") + v;
  function clockStr(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    const h = Math.floor(m / 60);
    const mm = Math.floor(m % 60);
    const ss = Math.floor((m * 60) % 60);
    return pad2(h) + ":" + pad2(mm) + ":" + pad2(ss);
  }
  function clockShort(minutes) {
    const m = ((minutes % 1440) + 1440) % 1440;
    return pad2(Math.floor(m / 60)) + ":" + pad2(Math.floor(m % 60));
  }

  function buildRingTicks() {
    const ring = document.querySelector(".ring");
    if (!ring) return;
    const NS = "http://www.w3.org/2000/svg";
    const g = document.createElementNS(NS, "g");
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * TAU - PI / 2;
      const long = i % 9 === 0;
      const r1 = long ? 56 : 58.5, r2 = 61;
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", (60 + Math.cos(a) * r1).toFixed(2));
      l.setAttribute("y1", (60 + Math.sin(a) * r1).toFixed(2));
      l.setAttribute("x2", (60 + Math.cos(a) * r2).toFixed(2));
      l.setAttribute("y2", (60 + Math.sin(a) * r2).toFixed(2));
      l.setAttribute("class", "tick");
      g.appendChild(l);
    }
    ring.appendChild(g);
  }

  function updateInstruments() {
    if (!ui.scaleLine || !camera) return;
    const pxPerM = (window.innerHeight * 0.5) / (Math.tan((camera.fov * PI) / 360) * Math.max(40, cam.dist));
    const choices = [1, 2, 5, 10, 20, 50, 100, 200];
    let nice = choices[choices.length - 1];
    for (const c of choices) {
      const px = c * pxPerM;
      if (px >= 44 && px <= 130) { nice = c; break; }
    }
    ui.scaleLine.style.width = Math.max(20, Math.min(150, nice * pxPerM)).toFixed(0) + "px";
    ui.scaleText.textContent = nice + " m";
    // compass: project a point 20 m north of the target, get its screen direction
    tmpV.set(cam.tx, cam.ty, cam.tz).project(camera);
    tmpV2.set(cam.tx, cam.ty, cam.tz - 20).project(camera);
    const dx = tmpV2.x - tmpV.x;
    const dy = tmpV2.y - tmpV.y;
    if (tmpV2.z > 1 || Math.abs(dx) + Math.abs(dy) < 1e-5) {
      ui.compass.style.opacity = "0.18";
    } else {
      ui.compass.style.opacity = "1";
      ui.compass.style.transform = "rotate(" + ((Math.atan2(dx, dy) * 180) / PI).toFixed(1) + "deg)";
    }
  }

  function buildZoneRail() {
    for (const z of ZONES) {
      if (z.id === "Z07") continue;
      const li = document.createElement("li");
      li.dataset.zone = z.id;
      li.innerHTML =
        '<button type="button">' +
        '<span class="idx"><i class="dot"></i>' + z.code + "</span>" +
        '<span class="zt"><b class="zh">' + z.zh + '</b><em class="en">' + z.en + "</em></span>" +
        '<span class="zu"><em>78%</em><i><u style="--u:.78"></u></i></span>' +
        "</button>";
      ui.zoneList.appendChild(li);
      zoneUi[z.id] = {
        li: li,
        util: li.querySelector(".zu em"),
        bar: li.querySelector(".zu u"),
        dot: li.querySelector(".dot"),
      };
      li.querySelector("button").addEventListener("click", () => {
        stopTour();
        selectView(z.id);
        setActiveView(z.id);
      });
    }
    ui.views.querySelectorAll("button").forEach((b) => {
      dockBtns[b.dataset.view] = b;
      b.addEventListener("click", () => {
        if (b.dataset.view === "overview") { stopTour(); selectView("overview"); setActiveView("overview"); }
        else { stopTour(); selectView(b.dataset.view); setActiveView(b.dataset.view); }
      });
    });
    setActiveView(FLAGS.view && VIEWS[FLAGS.view] ? FLAGS.view : "overview");
  }

  function setActiveView(name) {
    for (const k in dockBtns) dockBtns[k].classList.toggle("on", k === name);
    for (const id in zoneUi) zoneUi[id].li.classList.toggle("on", id === name);
    if (ui.viewName) {
      if (name === "overview") ui.viewName.textContent = "总览 · OVERVIEW";
      else {
        const z = zoneById(name);
        ui.viewName.textContent = z.code + " " + z.zh + " · " + z.short;
      }
    }
  }

  function buildEnergyBars() {
    const zs = ZONES.filter((z) => z.id !== "Z07");
    ui.energyBars.innerHTML = "";
    for (const z of zs) {
      const bar = document.createElement("i");
      bar.dataset.z = z.code;
      ui.energyBars.appendChild(bar);
    }
  }

  function buildMachineList(zoneId) {
    const z = zoneById(zoneId);
    const list = SIM.stations.filter((s) => s.zone === zoneId);
    ui.inspMachines.innerHTML = "";
    for (const id in machineUi) delete machineUi[id];
    if (!list.length) {
      ui.inspMachines.innerHTML = '<div style="padding:18px 14px;font-family:var(--cjk);font-size:10px;letter-spacing:.08em;color:var(--faint)">等待设备数据 · NO EQUIPMENT DATA</div>';
      ui.inspHint.textContent = "该分区无独立设备";
      return;
    }
    for (const st of list) {
      const btn = document.createElement("button");
      btn.innerHTML =
        '<i class="st ' + st.state + '"></i>' +
        "<span><b>" + st.name + "</b><em>" + st.id + " · " + String(st.kind || "").toUpperCase() + "</em></span>" +
        '<span class="util">' + Math.round((st.util || 0) * 100) + "%</span>";
      btn.addEventListener("click", () => focusStation(st.id));
      ui.inspMachines.appendChild(btn);
      machineUi[st.id] = { btn: btn, dot: btn.querySelector(".st"), util: btn.querySelector(".util") };
    }
    ui.inspHint.textContent = "点击设备定位 · " + list.length + " 台设备";
  }

  function updateMachineRows() {
    for (const id in machineUi) {
      const st = SIM.station(id);
      if (!st) continue;
      const r = machineUi[id];
      r.dot.className = "st " + st.state;
      r.util.textContent = Math.round((st.util || 0) * 100) + "%";
    }
  }

  function selectZone(zoneId, fly) {
    const z = zoneById(zoneId);
    selectedZone = zoneId;
    document.body.classList.add("inspecting");
    ui.inspKind.textContent = "ZONE / 分区 " + z.code;
    ui.inspTitle.textContent = z.zh;
    ui.inspSub.textContent = z.en + " · " + z.id;
    buildMachineList(zoneId);
    updateInspector();
    if (fly) applyGoal(z.view);
    if (window.DATA && DATA.focus) {
      DATA.focus({ kind: "zone", zone: zoneId, title: z.zh, anchor: { x: (z.x0 + z.x1) / 2, y: 2, z: (z.z0 + z.z1) / 2 } });
    }
  }

  function closeInspector() {
    document.body.classList.remove("inspecting");
    selectedZone = null;
    if (window.DATA && DATA.clearFocus) DATA.clearFocus();
  }

  function selectView(name) {
    if (name === "overview") {
      applyGoal(HOME);
      closeInspector();
      setActiveView("overview");
    } else {
      selectZone(name, true);
      setActiveView(name);
    }
  }

  function focusStation(id) {
    const st = SIM.station(id);
    if (!st) return;
    applyGoal({
      tx: st.beacon ? st.beacon.x : cam.tx,
      ty: st.beacon ? Math.max(2, st.beacon.y - 1.5) : cam.ty,
      tz: st.beacon ? st.beacon.z : cam.tz,
      azim: cam.azim + 0.22,
      elev: 0.3,
      dist: 34,
    });
    if (st.zone) {
      selectZone(st.zone, false);
      setActiveView(st.zone);
    }
    if (window.DATA && DATA.focus) {
      DATA.focus({ kind: "machine", id: st.id, zone: st.zone, title: st.name, anchor: st.beacon || null });
    }
    if (ui.viewName) ui.viewName.textContent = st.id + " · " + st.name;
    for (const mid in machineUi) machineUi[mid].btn.classList.toggle("active", mid === id);
  }

  function updateClockUI() {
    ui.clock.textContent = clockStr(SIM.clock);
    const inShift = SIM.clock >= SIM.shift.start && SIM.clock < SIM.shift.end;
    ui.shiftName.textContent = inShift ? "白班 A · DAY" : "夜班 B · NIGHT";
    ui.syncVal.textContent = (99.6 + Math.sin(SIM.t * 0.6) * 0.2).toFixed(1) + "%";
  }

  function drawSpark() {
    const c = ui.spark;
    if (!c) return;
    const pw = c.clientWidth || 288;
    const ph = 54;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    if (c.width !== Math.round(pw * scale) || c.height !== Math.round(ph * scale)) {
      c.width = Math.round(pw * scale);
      c.height = Math.round(ph * scale);
      sparkCtx = null;
    }
    if (!sparkCtx) {
      sparkCtx = c.getContext("2d");
      sparkCtx.setTransform(scale, 0, 0, scale, 0, 0);
    }
    const ctx = sparkCtx;
    ctx.clearRect(0, 0, pw, ph);
    const data = SIM.history.out;
    if (!data || data.length < 2) return;
    let min = Infinity, max = -Infinity;
    for (const v of data) { if (v < min) min = v; if (v > max) max = v; }
    const lo = min - (max - min) * 0.25 - 1;
    const hi = max + (max - min) * 0.25 + 1;
    const X = (i) => (i / (data.length - 1)) * (pw - 2) + 1;
    const Y = (v) => ph - 8 - ((v - lo) / (hi - lo)) * (ph - 16);
    // grid
    ctx.strokeStyle = "rgba(236,231,221,0.055)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const y = 8 + i * ((ph - 16) / 2);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(pw, y); ctx.stroke();
    }
    // fill
    const grad = ctx.createLinearGradient(0, 0, 0, ph);
    grad.addColorStop(0, "rgba(242,167,59,0.24)");
    grad.addColorStop(1, "rgba(242,167,59,0)");
    ctx.beginPath();
    ctx.moveTo(X(0), ph);
    for (let i = 0; i < data.length; i++) ctx.lineTo(X(i), Y(data[i]));
    ctx.lineTo(X(data.length - 1), ph);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    // line
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const x = X(i), y = Y(data[i]);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(242,167,59,0.95)";
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // head
    const hx = X(data.length - 1), hy = Y(data[data.length - 1]);
    ctx.beginPath(); ctx.arc(hx, hy, 2, 0, TAU); ctx.fillStyle = "#ffce7a"; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, 5, 0, TAU); ctx.fillStyle = "rgba(242,167,59,0.16)"; ctx.fill();
  }

  function updateKpis() {
    const o = SIM.oee;
    const pct = o.oee * 100;
    ui.oeeVal.textContent = pct.toFixed(1);
    ui.oeeA.textContent = (o.a * 100).toFixed(1) + "%";
    ui.oeeP.textContent = (o.p * 100).toFixed(1) + "%";
    ui.oeeQ.textContent = (o.q * 100).toFixed(1) + "%";
    ui.oeeA.parentNode.querySelector("u").style.setProperty("--w", o.a.toFixed(3));
    ui.oeeP.parentNode.querySelector("u").style.setProperty("--w", o.p.toFixed(3));
    ui.oeeQ.parentNode.querySelector("u").style.setProperty("--w", o.q.toFixed(3));
    const C = 2 * PI * 52;
    ui.oeeRing.style.strokeDashoffset = (C * (1 - clamp(o.oee, 0, 1))).toFixed(2);
    const delta = (o.oee - 0.874) * 100;
    ui.oeeDelta.textContent = (delta >= 0 ? "▲ " : "▼ ") + Math.abs(delta).toFixed(1) + " vs 昨日同期";
    ui.oeeDelta.style.color = delta >= 0 ? "var(--green)" : "var(--red)";

    ui.outVal.textContent = nf(SIM.output);
    ui.outTarget.textContent = nf(SIM.target);
    ui.outRate.textContent = Math.round((3600 / (SIM.taktActual || 58)) * 2) + " 台/h · 节拍 " + (SIM.taktActual || 58).toFixed(1) + " s";
    const shiftStart = SIM.shift.start, shiftEnd = SIM.shift.end;
    const prog = clamp((SIM.clock - shiftStart) / (shiftEnd - shiftStart), 0, 1);
    const expected = Math.max(1, SIM.target * prog);
    const dOut = (SIM.output / expected - 1) * 100;
    ui.outDelta.textContent = (dOut >= 0 ? "+" : "") + dOut.toFixed(1) + "%";
    ui.outDelta.style.color = dOut >= 0 ? "var(--green)" : "var(--red)";
    ui.outDelta.style.borderColor = dOut >= 0 ? "rgba(158,214,180,0.22)" : "rgba(255,86,56,0.3)";

    // WIP is smoothed so late-arriving module telemetry doesn't make the card jump
    if (wipShown < 0) wipShown = SIM.counts.wip;
    wipShown += (SIM.counts.wip - wipShown) * 0.08;
    if (Math.abs(SIM.counts.wip - wipShown) < 0.6) wipShown = SIM.counts.wip;
    const wipDisp = Math.round(wipShown);
    ui.wipVal.textContent = nf(wipDisp);
    ui.wipBar.style.setProperty("--w", clamp(wipShown / 300, 0.03, 1).toFixed(3));
    ui.agvVal.innerHTML = SIM.agv.active + "<span>/" + SIM.agv.total + "</span>";
    ui.agvBar.style.setProperty("--w", clamp(SIM.agv.active / Math.max(1, SIM.agv.total), 0.03, 1).toFixed(3));

    ui.energyVal.textContent = SIM.energy.demand.toFixed(2);
    ui.energyPeak.textContent = "峰 " + SIM.energy.peak.toFixed(2);
    const bars = ui.energyBars.children;
    for (let i = 0; i < bars.length; i++) {
      const zid = ZONES[i].id;
      const per = SIM.energy.perZone[zid] || 0;
      bars[i].style.setProperty("--h", clamp(per / 0.5, 0.05, 1).toFixed(3));
    }
  }

  function updateZones() {
    for (const id in zoneUi) {
      const zs = SIM.zones[id];
      const zr = zoneUi[id];
      if (!zs) continue;
      const util = clamp(zs.util || 0.8, 0, 1);
      zr.util.textContent = Math.round(util * 100) + "%";
      zr.bar.style.setProperty("--u", util.toFixed(3));
      zr.li.classList.toggle("down", !!zs.anyDown);
      zr.li.classList.remove("warn");
    }
  }

  function renderAlarms() {
    const list = SIM.alarms.slice(0, 4);
    const sig = SIM.alarms.filter((a) => a.active).length + "|" + list.map((a) => a.id + (a.active ? "1" : "0")).join(",");
    if (sig === alarmSig) return;
    alarmSig = sig;
    ui.alarmList.innerHTML = "";
    if (!list.length) {
      ui.alarmList.innerHTML = '<li style="grid-template-columns:1fr"><span style="color:var(--faint)">产线运行正常 · ALL SYSTEMS NOMINAL</span></li>';
    }
    for (const a of list) {
      const lv = a.level === 0 ? 0 : a.level === 2 ? 2 : 1;
      const li = document.createElement("li");
      li.className = "lv" + lv + (a.active ? "" : " resolved");
      const state = a.active ? (lv === 2 ? "ALERT" : lv === 1 ? "WARN" : "INFO") : "OK";
      li.innerHTML = "<em>" + clockShort(a.clock) + "</em><span>" + a.text + " · " + a.stationId + '</span><i>' + state + "</i>";
      ui.alarmList.appendChild(li);
    }
    const active = SIM.alarms.filter((a) => a.active).length;
    ui.alarmCount.textContent = active;
    ui.alarmCount.style.background = active > 0 ? "var(--amber)" : "rgba(158,214,180,0.7)";
  }

  function updateInspector() {
    if (!selectedZone) return;
    const zs = SIM.zones[selectedZone];
    if (!zs) return;
    ui.inspStat1.textContent = Math.round((zs.util || 0) * 100) + "%";
    ui.inspStat2.textContent = nf(zs.wip || 0);
    ui.inspStat3.textContent = (zs.energy || 0).toFixed(2);
    updateMachineRows();
  }

  function updateAlarmAndInspector() {
    renderAlarms();
    updateInspector();
  }

  /* ---------- input ---------- */
  function pointerNdc(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -(((e.clientY - r.top) / r.height) * 2 - 1),
    };
  }

  function pickAt(e) {
    const p = pointerNdc(e);
    ndc.set(p.x, p.y);
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(PICKABLES, false);
    return hits.length ? hits[0].object.userData.pick : null;
  }

  function showTooltip(data, e) {
    if (!data || data.kind === "zone") {
      ui.tooltip.classList.remove("on");
      hoverPick = data || null;
      canvas.style.cursor = data ? "pointer" : "";
      return;
    }
    hoverPick = data;
    ui.tooltip.innerHTML = "<b>" + (data.title || data.id || "") + "</b><em>" +
      (data.kind ? String(data.kind).toUpperCase() : "") + (data.zone ? " · " + data.zone : "") + "</em>";
    ui.tooltip.style.left = e.clientX + "px";
    ui.tooltip.style.top = e.clientY + "px";
    ui.tooltip.classList.add("on");
    canvas.style.cursor = "pointer";
  }

  let hoverAcc = 0;
  function bindInput() {
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== undefined && e.button !== 0 && e.pointerType === "mouse") return;
      drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.pointers.size === 1) {
        drag.active = true;
        drag.moved = 0;
        drag.x = e.clientX; drag.y = e.clientY;
        drag.downTime = performance.now();
        userDragging = true;
        idleTimer = 0;
        canvas.classList.add("dragging");
        canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      } else if (drag.pointers.size === 2) {
        const p = [...drag.pointers.values()];
        drag.pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    });

    canvas.addEventListener("pointermove", (e) => {
      ptr.nx = (e.clientX / window.innerWidth) * 2 - 1;
      ptr.ny = (e.clientY / window.innerHeight) * 2 - 1;
      if (drag.pointers.has(e.pointerId)) drag.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.pointers.size === 2) {
        const p = [...drag.pointers.values()];
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        if (drag.pinch > 0 && d > 0) {
          goal.dist = clamp(goal.dist * (drag.pinch / d), 46, 470);
        }
        drag.pinch = d;
        return;
      }
      if (drag.active && drag.pointers.size === 1) {
        const dx = e.clientX - drag.x;
        const dy = e.clientY - drag.y;
        drag.moved += Math.abs(dx) + Math.abs(dy);
        drag.x = e.clientX; drag.y = e.clientY;
        idleTimer = 0;
        if (tourOn && drag.moved > 6) stopTour();
        goal.azim -= dx * 0.0031;
        goal.elev = clamp(goal.elev + dy * 0.0024, 0.09, 1.32);
        flying = false;
        return;
      }
      hoverAcc += 1;
      if (hoverAcc % 2 === 0) {
        const hit = pickAt(e);
        showTooltip(hit, e);
      }
    });

    const endDrag = (e) => {
      const wasActive = drag.active;
      drag.pointers.delete(e.pointerId);
      if (drag.pointers.size < 2) drag.pinch = 0;
      if (!drag.pointers.size) {
        drag.active = false;
        userDragging = false;
        canvas.classList.remove("dragging");
        idleTimer = 0;
        if (wasActive && drag.moved < 7 && performance.now() - drag.downTime < 500) {
          const hit = pickAt(e);
          if (hit) handlePick(hit);
          else if (selectedZone) closeInspector();
        }
      }
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("pointerleave", () => {
      if (!drag.active) showTooltip(null);
    });

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      idleTimer = 0;
      if (tourOn) stopTour();
      goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.00105), 46, 470);
      flying = false;
    }, { passive: false });

    window.addEventListener("keydown", (e) => {
      const k = e.key;
      if (k === "Escape") {
        if (tourOn) stopTour();
        else closeInspector();
        return;
      }
      if (k === "f" || k === "F") { toggleFull(); return; }
      if (k === "h" || k === "H") { document.body.classList.toggle("ui-hidden"); return; }
      if (k === "b" || k === "B") { toggleLetterbox(); return; }
      if (k === "l" || k === "L") { setLabels(!labelsOn); return; }
      if (k === "d" || k === "D") { setData(!dataOn); return; }
      if (k === " ") { e.preventDefault(); setTour(!tourOn); return; }
      if (k === "0" || k === "o" || k === "O") { selectView("overview"); setActiveView("overview"); return; }
      const num = parseInt(k, 10);
      if (num >= 1 && num <= 6) {
        const z = ZONES[num - 1];
        if (z) { selectView(z.id); setActiveView(z.id); }
      }
    });

    window.addEventListener("resize", () => {
      clearTimeout(window.__dfResize);
      window.__dfResize = setTimeout(resizeAll, 160);
    });
    document.addEventListener("fullscreenchange", () => { setTimeout(resizeAll, 120); });

    el("btnFull").addEventListener("click", toggleFull);
    el("inspClose").addEventListener("click", closeInspector);
    el("inspFocus").addEventListener("click", () => {
      if (selectedZone) { applyGoal(zoneById(selectedZone).view); }
    });
    el("btnData").addEventListener("click", () => setData(!dataOn));
    el("btnLabels").addEventListener("click", () => setLabels(!labelsOn));
    el("btnTour").addEventListener("click", () => setTour(!tourOn));
    el("btnReset").addEventListener("click", () => {
      stopTour();
      applyGoal(HOME);
      closeInspector();
      setActiveView("overview");
    });
    if (ui.rates) {
      ui.rates.querySelectorAll("button").forEach((b) => {
        if (parseFloat(b.dataset.rate) === SIM.speed) b.classList.add("on");
        else b.classList.remove("on");
        b.addEventListener("click", () => {
          SIM.speed = parseFloat(b.dataset.rate);
          ui.rates.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
        });
      });
    }
  }

  function handlePick(data) {
    if (!data) return;
    if (tourOn) stopTour();
    const z = data.zone ? zoneById(data.zone) : null;
    if (data.kind === "zone" && z) {
      selectZone(z.id, true);
      setActiveView(z.id);
    } else {
      if (z) { selectZone(z.id, false); setActiveView(z.id); }
      focusStationFromPick(data);
    }
  }
  function focusStationFromPick(data) {
    if (data.anchor) {
      applyGoal({
        tx: data.anchor.x, ty: Math.max(2, data.anchor.y - 1.5), tz: data.anchor.z,
        azim: cam.azim + 0.2, elev: 0.3, dist: 34,
      });
    }
    if (window.DATA && DATA.focus) DATA.focus(data);
  }

  function setData(on) {
    dataOn = !!on;
    el("btnData").classList.toggle("on", dataOn);
    if (window.DATA && DATA.setDataLayer) DATA.setDataLayer(dataOn);
  }
  function setLabels(on) {
    labelsOn = !!on;
    el("btnLabels").classList.toggle("on", labelsOn);
    if (window.DATA && DATA.setLabels) DATA.setLabels(labelsOn);
  }
  function setTourLabel(text) {
    const em = el("btnTour") && el("btnTour").querySelector("em");
    if (em) em.textContent = text;
  }

  /* ---------- cinematic tour engine ---------- */
  function onCinemaShot(idx) {
    const shot = CINEMA[idx];
    const pad = (n) => (n < 10 ? "0" : "") + n;
    if (ui.tourIndex) ui.tourIndex.textContent = pad(idx + 1) + " / " + pad(CINEMA.length);
    if (ui.tourTitle) ui.tourTitle.textContent = shot.zh;
    if (ui.tourSub) ui.tourSub.textContent = shot.en;
    if (ui.tourChapter) {
      ui.tourChapter.classList.remove("swap");
      void ui.tourChapter.offsetWidth;
      ui.tourChapter.classList.add("swap");
    }
    setTourLabel((idx + 1) + "/" + CINEMA.length);
    // HUD state, without opening the inspector (keeps the frame cinematic)
    closeInspector();
    setActiveView(shot.zone === "overview" ? "overview" : shot.zone);
    const z = shot.zone === "overview" ? null : zoneById(shot.zone);
    if (ui.viewName) {
      ui.viewName.textContent = z ? z.code + " " + z.zh + " · " + z.short : "总览 · OVERVIEW";
    }
    if (window.DATA) {
      if (z && DATA.focus) {
        DATA.focus({ kind: "zone", zone: shot.zone, title: z.zh, anchor: { x: (z.x0 + z.x1) / 2, y: 2, z: (z.z0 + z.z1) / 2 } });
      } else if (DATA.clearFocus) {
        DATA.clearFocus();
      }
    }
  }

  function cinemaApplyAt(elapsedSec) {
    let t = ((elapsedSec % CINEMA_TOTAL) + CINEMA_TOTAL) % CINEMA_TOTAL;
    let i = 0;
    while (i < CINEMA.length - 1 && t >= CINEMA_START[i] + CINEMA[i].dur * CINEMA_SPEED) i++;
    const shot = CINEMA[i];
    const local = clamp((t - CINEMA_START[i]) / (shot.dur * CINEMA_SPEED), 0, 1);
    const split = shot.split || 0.5;
    const pose = local <= split
      ? lerpPose(shot.a, shot.m, easeInOutCubic(local / split))
      : lerpPose(shot.m, shot.b, easeInOutCubic((local - split) / (1 - split)));
    cam.tx = pose.tx;
    cam.ty = pose.ty;
    cam.tz = pose.tz;
    cam.azim = pose.azim;
    cam.elev = pose.elev;
    cam.dist = pose.dist;
    cam.fov = pose.fov;
    goal.tx = cam.tx; goal.ty = cam.ty; goal.tz = cam.tz;
    goal.azim = cam.azim; goal.elev = cam.elev; goal.dist = cam.dist; goal.fov = cam.fov;
    flying = false;
    if (i !== cinemaShotIdx) {
      cinemaShotIdx = i;
      onCinemaShot(i);
    }
    const pct = (t / CINEMA_TOTAL) * 100;
    if (ui.tourProgress && Math.abs(pct - cinemaShownPct) > 0.2) {
      cinemaShownPct = pct;
      ui.tourProgress.style.width = pct.toFixed(2) + "%";
    }
  }
  function cinemaTick(now) {
    if (!tourOn || cinemaPaused) return;
    cinemaApplyAt((now - cinemaStart) / 1000);
  }
  function startCinema(seekSec) {
    closeInspector();
    tourOn = true;
    cinemaPaused = false;
    cinemaShotIdx = -1;
    cinemaShownPct = -1;
    cinemaStart = performance.now() - (seekSec || 0) * 1000;
    el("btnTour").classList.add("on");
    document.body.classList.add("touring");
    setTourLabel("1/" + CINEMA.length);
    if (ui.tourProgress) ui.tourProgress.style.width = "0%";
    ptr.sx = 0; ptr.sy = 0;
    if (seekSec !== undefined && seekSec > 0) cinemaApplyAt(seekSec);
  }
  function setTour(on) {
    if (on) startCinema(0);
    else stopTour();
  }
  function stopTour() {
    if (!tourOn) return;
    tourOn = false;
    cinemaPaused = false;
    cinemaShotIdx = -1;
    document.body.classList.remove("touring");
    el("btnTour").classList.remove("on");
    setTourLabel("TOUR");
    // hold the current camera where the film left it, then hand control back
    goal.tx = cam.tx; goal.ty = cam.ty; goal.tz = cam.tz;
    goal.azim = cam.azim; goal.elev = cam.elev; goal.dist = cam.dist; goal.fov = cam.fov;
    flying = false;
    ptr.sx = 0; ptr.sy = 0;
    idleTimer = 0;
  }
  function toggleLetterbox() {
    const on = !document.body.classList.contains("cine-bars");
    document.body.classList.toggle("cine-bars", on);
    // B enters a clean "film" view: bars on + HUD off (press B again to restore)
    document.body.classList.toggle("ui-hidden", on);
  }
  function toggleFull() {
    try {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    } catch (e) { /* ignore */ }
  }

  /* ---------- resize ---------- */
  function resizeAll() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h);
    if (postOn && post.mats.composite) {
      const s = renderer.getDrawingBufferSize(new T.Vector2());
      initPost(s.x, s.y);
    }
  }

  /* ---------- HUD tick ---------- */
  let uiAcc = 0, alarmAcc = 0, sparkAcc = 0;

  function updateHud(dt) {
    uiAcc += dt;
    alarmAcc += dt;
    sparkAcc += dt;
    if (uiAcc >= 0.12) {
      uiAcc = 0;
      updateClockUI();
      updateKpis();
      updateZones();
      updateInstruments();
    }
    if (sparkAcc >= 0.45) { sparkAcc = 0; drawSpark(); }
    if (alarmAcc >= 0.5) { alarmAcc = 0; updateAlarmAndInspector(); }
  }

  /* ---------- frame loop ---------- */
  let lastNow = 0;
  let fpsFrames = 0, lastFpsAt = 0, fpsValue = 60;
  let bootTime = 0;

  function frame(now) {
    const dt = lastNow ? Math.min((now - lastNow) / 1000, 0.05) : 0.016;
    lastNow = now;
    SIM.frame(dt);
    idleTimer += dt;
    ptr.sx = lerp(ptr.sx, ptr.nx, 1 - Math.exp(-dt * 2.6));
    ptr.sy = lerp(ptr.sy, ptr.ny, 1 - Math.exp(-dt * 2.6));

    if (tourOn) cinemaTick(now);

    updateCamera(dt);
    renderer.info.reset();
    for (let i = 0; i < TICKS.length; i++) TICKS[i](SIM.t, dt);
    for (let i = 0; i < TICKS_LATE.length; i++) TICKS_LATE[i](SIM.t, dt);

    if (postOn && post.mats.composite) renderPost(SIM.t);
    else {
      renderer.setRenderTarget(null);
      renderer.clear(true, true, true);
      renderer.render(studio.scene, studio.camera);
      renderer.clearDepth();
      renderer.render(scene, camera);
    }

    updateHud(dt);

    if (firstFrame) {
      firstFrame = false;
      requestAnimationFrame(() => {
        canvas.classList.add("live");
        document.body.classList.add("live");
        if (veil) {
          if (instant) { veil.style.transition = "opacity .35s ease"; }
          veil.classList.add("gone");
        }
        setTimeout(() => {
          ready = true;
          window.__READY__ = true;
          document.body.dataset.ready = "1";
        }, instant ? 120 : 1000);
      });
    }

    // fps + metrics (wall-clock based, independent of the capped sim dt)
    fpsFrames++;
    if (!lastFpsAt) lastFpsAt = now;
    if (now - lastFpsAt >= 750) {
      fpsValue = Math.max(1, Math.round((fpsFrames * 1000) / (now - lastFpsAt)));
      fpsFrames = 0;
      lastFpsAt = now;
      const info = renderer.info;
      window.__METRICS__ = {
        fps: fpsValue,
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        programs: info.programs ? info.programs.length : 0,
        dpr: dpr,
        stations: SIM.stations.length,
        alarms: SIM.alarms.filter((a) => a.active).length,
        view: selectedZone || "overview",
        clock: clockStr(SIM.clock),
        output: SIM.output,
      };
      if (document.body.classList.contains("debug")) {
        const m = window.__METRICS__;
        ui.debug.textContent = "FPS " + m.fps + "  DRAW " + m.drawCalls + "  TRI " + (m.triangles / 1000).toFixed(0) +
          "k  ST " + m.stations + "  DPR " + m.dpr + "\nBUILD " + (window.__BUILD_LOG__ || []).join(" | ");
      }
    }
    // degrade dpr once if struggling (real GPUs only)
    if (!FLAGS.lq && !qualityDropped && now - bootTime > 6000 && fpsValue < 34 && dpr > 1.15) {
      qualityDropped = true;
      dpr = Math.min(dpr, 1.15);
      resizeAll();
    }

    requestAnimationFrame(frame);
  }

  /* ---------- boot ---------- */
  function init() {
    bootTime = performance.now();
    if (Q.debug === "1") document.body.classList.add("debug");
    if (Q.hideui === "1") document.body.classList.add("ui-hidden");
    if (!initRenderer()) return;

    buildScene();
    if (postOn && renderer) { /* post initialised in buildScene */ }
    // prime the simulation once so HUD and inspector read live values before the first frame
    SIM.frame(0.016);

    // URL camera overrides
    const v = FLAGS.view && VIEWS[FLAGS.view] ? VIEWS[FLAGS.view] : HOME;
    applyGoal(v, true);
    if (Q.azim !== undefined) { goal.azim = cam.azim = parseFloat(Q.azim); }
    if (Q.elev !== undefined) { goal.elev = cam.elev = clamp(parseFloat(Q.elev), 0.05, 1.4); }
    if (Q.dist !== undefined) { goal.dist = cam.dist = clamp(parseFloat(Q.dist), 30, 600); }
    if (Q.tx !== undefined) { goal.tx = cam.tx = parseFloat(Q.tx); }
    if (Q.ty !== undefined) { goal.ty = cam.ty = parseFloat(Q.ty); }
    if (Q.tz !== undefined) { goal.tz = cam.tz = parseFloat(Q.tz); }
    if (Q.fov !== undefined) {
      goal.fov = cam.fov = clamp(parseFloat(Q.fov), 8, 75);
      camera.fov = cam.fov;
      camera.updateProjectionMatrix();
    }

    buildZoneRail();
    buildRingTicks();
    buildEnergyBars();
    bindInput();
    updateClockUI();
    updateKpis();
    updateZones();
    drawSpark();
    setData(dataOn);
    setLabels(labelsOn);
    if (FLAGS.view && FLAGS.view !== "overview" && VIEWS[FLAGS.view]) {
      if (!FLAGS.noCard) selectZone(FLAGS.view, false);
      setActiveView(FLAGS.view);
    }
    renderAlarms();
    updateInspector();
    if (Q.letterbox === "1" || Q.film === "1") document.body.classList.add("cine-bars");
    if (Q.film === "1") document.body.classList.add("ui-hidden");
    if (Q.tourat !== undefined) {
      const seek = clamp(parseFloat(Q.tourat) || 0, 0, Math.max(0.01, CINEMA_TOTAL - 0.01));
      startCinema(seek);
      cinemaPaused = true;
      cinemaApplyAt(seek);
    } else if (Q.tour === "1" || Q.film === "1") {
      startCinema(0);
    }
    if (Q.sim !== undefined && SIM.speed !== parseFloat(Q.sim)) SIM.speed = parseFloat(Q.sim);
    if (ui.rates) ui.rates.querySelectorAll("button").forEach((b) => b.classList.toggle("on", parseFloat(b.dataset.rate) === SIM.speed));

    // expose for QA / console
    window.__APP__ = {
      selectView: selectView, selectZone: selectZone, focusStation: focusStation,
      setData: setData, setLabels: setLabels, setTour: setTour,
      cam: cam, goal: goal, applyGoal: applyGoal, SIM: SIM,
      tour: {
        isOn: () => tourOn,
        shot: () => cinemaShotIdx,
        shots: CINEMA.map((s) => ({ zone: s.zone, zh: s.zh, en: s.en, dur: s.dur })),
        total: CINEMA_TOTAL,
        elapsed: () => (performance.now() - cinemaStart) / 1000,
        start: () => startCinema(0),
        stop: stopTour,
        pause: (p) => { cinemaPaused = !!p; },
        seek: (sec) => { startCinema(sec); cinemaPaused = true; cinemaApplyAt(sec); },
        letterbox: toggleLetterbox,
      },
      getRenderer: () => renderer, getScene: () => scene, getCamera: () => camera,
    };

    // pre-compile the heaviest materials once, then start
    try { renderer.compile(scene, camera); } catch (e) { /* optional */ }
    started = true;
    requestAnimationFrame(frame);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
