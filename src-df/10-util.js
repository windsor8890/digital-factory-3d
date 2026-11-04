/* ============================================================
   10 · util — foundation for DF-01 数字工厂
   layout · palette · procedural textures/materials · geometry
   helpers · instancing · picking · SIM (live factory state)
   ============================================================ */

function reportError(msg) {
  try {
    const el = document.getElementById("err");
    if (!el) return;
    el.style.display = "block";
    el.textContent += msg + "\n";
  } catch (e) { /* noop */ }
}
window.addEventListener("error", (e) => {
  reportError("ERR " + (e.message || e) + " @ " + (e.filename || "") + ":" + (e.lineno || ""));
});
window.addEventListener("unhandledrejection", (e) => {
  reportError("REJ " + ((e.reason && e.reason.message) || e.reason));
});

const T = window.THREE;
const PI = Math.PI;
const TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (v) => v - Math.floor(v);

const Q = window.__Q__ || {};
const FLAGS = {
  instant: Q.instant === "1" || Q.instant === "true",
  still: Q.still === "1",
  raw: Q.raw === "1",
  noLabels: Q.nolabels === "1",
  noData: Q.nodata === "1",
  pr: Q.pr ? parseFloat(Q.pr) : 0,
  view: Q.view || "overview",
  sim: Q.sim ? parseFloat(Q.sim) : 1,
  lq: Q.lq === "1" || Q.lq === "true",
  noCard: Q.nocard === "1",
};

/* ---------- seeded noise ---------- */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261104);
function rand(a, b) { return a + (b - a) * rng(); }
function pick(arr) { return arr[(rng() * arr.length) | 0]; }

function hash2(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
function fbm(x, y, oct) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < (oct || 4); i++) {
    s += noise2(x * f, y * f) * amp;
    f *= 2; amp *= 0.5;
  }
  return s;
}

/* ---------- layout (metres, +x east / +z south / +y up) ---------- */
const HALL = { x0: -78, x1: 78, z0: -40, z1: 40, floorY: 0, trussY: 13.5, wallTop: 15.8 };

const ZONES = [
  { id: "Z01", code: "01", zh: "原材料立库", en: "RAW STORE / AS-RS", short: "RAW STORE",
    x0: -76, x1: -50, z0: -34, z1: 34,
    view: { tx: -62, ty: 6, tz: 0, azim: -0.72, elev: 0.4, dist: 86, fov: 33 } },
  { id: "Z02", code: "02", zh: "冲压线", en: "PRESS LINE", short: "PRESS",
    x0: -47, x1: -14, z0: -34, z1: -6,
    view: { tx: -30, ty: 4, tz: -20, azim: 0.44, elev: 0.15, dist: 36, fov: 42 } },
  { id: "Z03", code: "03", zh: "焊装车间", en: "BODY SHOP", short: "BODY SHOP",
    x0: -47, x1: -14, z0: 6, z1: 34,
    view: { tx: -30, ty: 3, tz: 20, azim: 1.54, elev: 0.11, dist: 38, fov: 44 } },
  { id: "Z04", code: "04", zh: "涂装车间", en: "PAINT SHOP", short: "PAINT",
    x0: -9, x1: 13, z0: -33, z1: -4,
    view: { tx: 2, ty: 3, tz: -18, azim: 0.0, elev: 0.12, dist: 31, fov: 42 } },
  { id: "Z05", code: "05", zh: "总装线", en: "FINAL ASSEMBLY", short: "ASSEMBLY",
    x0: 17, x1: 62, z0: 6, z1: 34,
    view: { tx: 40, ty: 5, tz: 20, azim: -0.9, elev: 0.3, dist: 70, fov: 30 } },
  { id: "Z06", code: "06", zh: "检测发运", en: "EOL & DISPATCH", short: "EOL",
    x0: 62, x1: 76, z0: 4, z1: 36,
    view: { tx: 68, ty: 4, tz: 21, azim: -1.55, elev: 0.11, dist: 30, fov: 42 } },
  { id: "Z07", code: "07", zh: "辅助区", en: "SUPPORT", short: "SUPPORT",
    x0: 16, x1: 60, z0: -40, z1: -24,
    view: { tx: 38, ty: 4, tz: -32, azim: 0.08, elev: 0.2, dist: 46, fov: 40 } },
];
function zoneById(id) { return ZONES.find((z) => z.id === id) || ZONES[0]; }
function zoneCenter(z) { return { x: (z.x0 + z.x1) / 2, z: (z.z0 + z.z1) / 2 }; }

const AGV_ROUTE = [
  [-71, -3], [-56, -3], [-20, -3], [10, -3], [40, -3], [64, -3],
  [71, -3], [71, 3], [64, 3], [40, 3], [10, 3], [-20, 3], [-56, 3], [-71, 3],
];

const AX = {
  agvRoute: AGV_ROUTE,
  inboundDocks: [{ x: -78, z: -20 }, { x: -78, z: 0 }, { x: -78, z: 20 }],
  outboundDocks: [{ x: 78, z: 12 }, { x: 78, z: 28 }],
  pressLine: { z: -20, xs: [-42, -33, -24, -15] },
  weldCells: [
    { x: -42, z: 14 }, { x: -33, z: 14 }, { x: -24, z: 14 }, { x: -15, z: 14 },
    { x: -42, z: 26 }, { x: -33, z: 26 }, { x: -24, z: 26 }, { x: -15, z: 26 },
  ],
  paintBooth: { x0: -9, x1: 13, z0: -31, z1: -8 },
  assemblyLines: [{ z: 12, x0: 18, x1: 62 }, { z: 28, x0: 18, x1: 62 }],
  eol: { x: 66, z: 12 },
  controlRoom: { x0: 20, x1: 38, z0: -38, z1: -25 },
  utilityYard: { x0: -48, x1: -24, z0: -54, z1: -42 },
  energyEntry: { x: -36, y: 3.2, z: -40 },
  transferBridge: { x0: 13, x1: 20, z0: -4, z1: 10, y: 7.2 },
  inboundDriveway: { z0: -27, z1: 27, x0: -104, x1: -78 },
  outboundDriveway: { z0: 2, z1: 38, x0: 78, x1: 104 },
};

/* ---------- palette ---------- */
const PAL = {
  void: 0x08090b,
  ground: 0x101214,
  concrete: 0x9d988d,
  concreteLight: 0xb9b3a6,
  concreteDark: 0x6c6a64,
  asphalt: 0x34373a,
  steel: 0x7c8288,
  steelDark: 0x2e3236,
  galv: 0x9aa1a5,
  machine: 0x8b9096,
  machineDark: 0x30353a,
  machineWhite: 0xd9d4c8,
  orange: 0xd95c1e,
  orangeDeep: 0xb5481a,
  yellow: 0xe2a92b,
  white: 0xe7e2d7,
  glass: 0x2c3a41,
  ink: 0xece7dd,
  amber: 0xf2a73b,
  amberDeep: 0xb46f1e,
  green: 0x9ed6b4,
  red: 0xff5638,
  cool: 0x9fb6c2,
  carBodies: [0xe8e4da, 0x2c3238, 0x7e97a4, 0x9c5a3c, 0xcfd2cb],
};

const ENVU = {
  uTime: { value: 0 },
  uAmber: { value: new T.Color(PAL.amber) },
};

const TICKS = [];
function addTick(fn) { TICKS.push(fn); }
const TICKS_LATE = [];
function addTickLate(fn) { TICKS_LATE.push(fn); }

/* ---------- canvas / texture helpers ---------- */
function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}
function canvasTexture(w, h, painter, opts) {
  opts = opts || {};
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  painter(ctx, w, h);
  const tex = new T.CanvasTexture(c);
  tex.wrapS = tex.wrapT = T.RepeatWrapping;
  if (opts.repeatX || opts.repeatY) tex.repeat.set(opts.repeatX || 1, opts.repeatY || 1);
  tex.colorSpace = opts.srgb === false ? T.NoColorSpace : T.SRGBColorSpace;
  tex.anisotropy = 8;
  if (opts.nearest) { tex.magFilter = tex.minFilter = T.NearestFilter; }
  tex.needsUpdate = true;
  return tex;
}
function noiseTexture(size, opts) {
  opts = opts || {};
  const lo = opts.lo === undefined ? 90 : opts.lo;
  const hi = opts.hi === undefined ? 210 : opts.hi;
  const sd = opts.seed || 1;
  return canvasTexture(size, size, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = lo + (hi - lo) * fbm((i / 4 % w) * 0.12 + sd, Math.floor(i / 4 / w) * 0.12 + sd, 4);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false });
}
function glowTexture(size, hardness) {
  hardness = hardness || 1.6;
  return canvasTexture(size, size, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;
      g.addColorStop(u, "rgba(255,255,255," + Math.pow(1 - u, hardness).toFixed(4) + ")");
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }, { srgb: false });
}
function stripeTexture(a, b, count, vertical) {
  const size = 128;
  return canvasTexture(size, size, (ctx, w, h) => {
    ctx.fillStyle = a; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = b;
    const n = count || 4, band = (vertical ? w : h) / n;
    for (let i = 0; i < n; i++) {
      if (vertical) ctx.fillRect(i * band, 0, band / 2, h);
      else ctx.fillRect(0, i * band, w, band / 2);
    }
  });
}
function makeSignTexture(title, sub, opts) {
  opts = opts || {};
  const w = opts.w || 512, h = opts.h || 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.fillStyle = opts.bg || "#1b1e21";
  ctx.fillRect(0, 0, w, h);
  if (opts.border !== false) {
    ctx.strokeStyle = opts.borderCol || "rgba(242,167,59,0.75)";
    ctx.lineWidth = Math.max(1, h * 0.012);
    ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - ctx.lineWidth * 2, h - ctx.lineWidth * 2);
  }
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillStyle = opts.fg || "#ece7dd";
  const fs = opts.fs || Math.round(h * 0.34);
  ctx.font = (opts.weight || 600) + " " + fs + "px " + (opts.font || "'Bahnschrift','Microsoft YaHei UI',sans-serif");
  ctx.fillText(title, w * 0.06, sub ? h * 0.38 : h * 0.5);
  if (sub) {
    ctx.fillStyle = opts.fg2 || "rgba(242,167,59,0.85)";
    ctx.font = "400 " + Math.round(fs * 0.42) + "px 'Cascadia Mono',Consolas,monospace";
    ctx.fillText(sub, w * 0.062, h * 0.72);
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}
function addSign(parent, w, h, x, y, z, texture, opts) {
  opts = opts || {};
  const mat = new T.MeshStandardMaterial({
    map: texture, roughness: 0.62, metalness: 0.05,
    emissive: new T.Color(opts.emissive === undefined ? 0x2a1d0c : opts.emissive),
    emissiveMap: texture, emissiveIntensity: opts.emissiveIntensity === undefined ? 0.55 : opts.emissiveIntensity,
    transparent: !!opts.transparent, side: opts.double ? T.DoubleSide : T.FrontSide,
  });
  return addPlane(parent, w, h, x, y, z, mat, opts);
}
function ensureStyle(id, css) {
  if (document.getElementById(id)) return;
  const s = document.createElement("style");
  s.id = id;
  s.textContent = css;
  document.head.appendChild(s);
}
function byId(id) { return document.getElementById(id); }

/* ---------- textures ---------- */
const TEX = {};
function buildTextures() {
  TEX.concrete = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#8e8a81"; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      const n = fbm(x * 0.045, y * 0.045, 5) * 34 + fbm(x * 0.22, y * 0.22, 3) * 18;
      const v = 128 + n - 26 + (hash2(x, y) > 0.986 ? -34 : 0);
      img.data[i] = v * 1.02; img.data[i + 1] = v; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.10;
    for (let i = 0; i < 40; i++) {
      const x = rng() * w, y = rng() * h, r = rand(8, 60);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(40,36,30,0.9)"); g.addColorStop(1, "rgba(40,36,30,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, { repeatX: 8, repeatY: 4 });

  TEX.polishedConcrete = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#a6a197"; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      const n = fbm(x * 0.03, y * 0.03, 4) * 20 + fbm(x * 0.4, y * 0.4, 2) * 9;
      const v = 152 + n - 12;
      img.data[i] = v * 1.02; img.data[i + 1] = v * 0.995; img.data[i + 2] = v * 0.955; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeatX: 10, repeatY: 6 });

  TEX.asphalt = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#3a3d40"; ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const x = (i / 4) % w, y = Math.floor(i / 4 / w);
      const n = fbm(x * 0.5, y * 0.5, 3) * 30 + fbm(x * 0.06, y * 0.06, 3) * 16;
      const v = 52 + n - 8;
      img.data[i] = v; img.data[i + 1] = v * 1.02; img.data[i + 2] = v * 1.05; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeatX: 14, repeatY: 10 });

  TEX.steel = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8e959b"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const y = rng() * h;
      ctx.strokeStyle = "rgba(" + (rng() > 0.5 ? "255,255,255" : "0,0,0") + "," + rand(0.015, 0.06).toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + rand(-1.5, 1.5)); ctx.stroke();
    }
  }, { repeatX: 2, repeatY: 2 });

  TEX.steelDark = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#3b4045"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) {
      const y = rng() * h;
      ctx.strokeStyle = "rgba(255,255,255," + rand(0.01, 0.045).toFixed(3) + ")";
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }, { repeatX: 3, repeatY: 3 });

  TEX.diamondPlate = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#71787d"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      for (let x = 0; x < w; x += 16) {
        ctx.save(); ctx.translate(x + 8, y + 8); ctx.rotate(((x + y) / 16) % 2 ? 0.7 : -0.7);
        ctx.fillStyle = "rgba(220,226,230,0.35)"; ctx.fillRect(-5, -1.5, 10, 3);
        ctx.fillStyle = "rgba(20,22,24,0.35)"; ctx.fillRect(-5, 1.6, 10, 1.4);
        ctx.restore();
      }
    }
  }, { repeatX: 3, repeatY: 3 });

  TEX.hazard = stripeTexture("#e2a92b", "#22242a", 8, false);
  TEX.hazard.repeat.set(1, 1);

  TEX.wallPanel = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#8d9399"; ctx.fillRect(0, 0, w, h);
    const ribs = 16, rw = w / ribs;
    for (let i = 0; i < ribs; i++) {
      const g = ctx.createLinearGradient(i * rw, 0, (i + 1) * rw, 0);
      g.addColorStop(0, "rgba(40,44,48,0.55)");
      g.addColorStop(0.28, "rgba(255,255,255,0.16)");
      g.addColorStop(0.55, "rgba(255,255,255,0.03)");
      g.addColorStop(1, "rgba(20,22,24,0.55)");
      ctx.fillStyle = g; ctx.fillRect(i * rw, 0, rw, h);
    }
    ctx.fillStyle = "rgba(20,22,24,0.4)"; ctx.fillRect(0, 8, w, 2);
  }, { repeatX: 3, repeatY: 1 });

  TEX.wallInner = canvasTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#d5cfc2"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = "rgba(0,0,0,0.06)"; ctx.fillRect(0, (i * h) / 5, w, 2);
    }
    ctx.fillStyle = "rgba(0,0,0,0.035)";
    for (let i = 0; i < 8; i++) ctx.fillRect((i * w) / 8, 0, 1, h);
  }, { repeatX: 2, repeatY: 1 });

  TEX.windowBand = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#2c3a41"; ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "rgba(190,205,210,0.20)");
    g.addColorStop(0.55, "rgba(120,140,150,0.05)");
    g.addColorStop(1, "rgba(255,225,180,0.10)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#4a5157";
    for (let i = 0; i <= 8; i++) ctx.fillRect((i * w) / 8, 0, 5, h);
    ctx.fillRect(0, 0, w, 5); ctx.fillRect(0, h - 5, w, 5);
  }, { repeatX: 4, repeatY: 1 });

  TEX.meshFence = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(200,205,208,0.9)"; ctx.lineWidth = 1.6;
    for (let i = -h; i < w + h; i += 14) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(i, h); ctx.lineTo(i + h, 0); ctx.stroke();
    }
  }, { repeatX: 8, repeatY: 2 });

  TEX.palletWood = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#9a7a4e"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "rgba(60,40,18,0.16)" : "rgba(255,225,180,0.10)";
      ctx.fillRect(0, (i * h) / 6, w, h / 7);
    }
    ctx.fillStyle = "rgba(30,20,10,0.35)";
    ctx.fillRect(0, h / 2 - 3, w, 6);
  });

  TEX.cardboard = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#a98c62"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(70,50,25,0.28)"; ctx.lineWidth = 1;
    for (let x = 8; x < w; x += 24) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.fillStyle = "rgba(226,210,180,0.5)"; ctx.fillRect(w / 2 - 12, 0, 24, h);
  });

  TEX.screen = canvasTexture(512, 256, (ctx, w, h) => {
    ctx.fillStyle = "#0b1216"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 7; i++) {
      ctx.fillStyle = "rgba(242,167,59," + rand(0.05, 0.18).toFixed(2) + ")";
      ctx.fillRect(16 + i * 68, 24 + rand(0, 30), rand(30, 58), rand(20, 84));
    }
    ctx.strokeStyle = "rgba(159,214,180,0.5)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 12) ctx.lineTo(x, h - 30 - Math.sin(x * 0.03) * 24 - rand(0, 6));
    ctx.stroke();
    ctx.fillStyle = "rgba(236,231,221,0.8)"; ctx.font = "600 13px 'Cascadia Mono',monospace";
    ctx.fillText("OEE 86.4 %", 18, 22);
  });

  TEX.screenAmber = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = "#100e0a"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(242,167,59,0.85)"; ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < w; x += 8) ctx.lineTo(x, h - 10 - Math.abs(Math.sin(x * 0.05)) * (h * 0.5) - rand(0, 4));
    ctx.stroke();
    ctx.fillStyle = "rgba(242,167,59,0.9)"; ctx.font = "600 11px 'Cascadia Mono',monospace";
    ctx.fillText("FLOW 98.2", 10, 16);
  });

  TEX.glow = glowTexture(128, 1.7);
  TEX.glowTight = glowTexture(128, 4.2);
  TEX.grain = canvasTexture(256, 256, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (rng() - 0.5) * 38;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: false });
  TEX.oilStain = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(20,16,12,0.35)";
    for (let i = 0; i < 22; i++) {
      const x = w / 2 + (rng() - 0.5) * 60, y = h / 2 + (rng() - 0.5) * 50, r = rand(5, 22);
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    }
  });
  TEX.tyre = noiseTexture(128, { lo: 18, hi: 40, seed: 3 });
  TEX.concreteDark = noiseTexture(256, { lo: 62, hi: 128, seed: 7 });
  TEX.hatch = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#5d5a54"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(25,24,22,0.65)"; ctx.lineWidth = 2;
    for (let i = -h; i < w + h; i += 12) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
    }
  }, { repeatX: 4, repeatY: 4 });
  TEX.container = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#7a6a58"; ctx.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 18) {
      const g = ctx.createLinearGradient(x, 0, x + 18, 0);
      g.addColorStop(0, "rgba(255,255,255,0.10)");
      g.addColorStop(0.5, "rgba(0,0,0,0.16)");
      g.addColorStop(1, "rgba(255,255,255,0.06)");
      ctx.fillStyle = g; ctx.fillRect(x, 0, 18, h);
    }
  }, { repeatX: 2, repeatY: 1 });
}
/* ---------- materials ---------- */
function matStd(hex, opts) {
  opts = opts || {};
  const m = new T.MeshStandardMaterial({
    color: hex,
    roughness: opts.roughness === undefined ? 0.72 : opts.roughness,
    metalness: opts.metalness === undefined ? 0.05 : opts.metalness,
    envMapIntensity: opts.envMapIntensity === undefined ? 0.6 : opts.envMapIntensity,
    map: opts.map || null,
    transparent: !!opts.transparent,
    opacity: opts.opacity === undefined ? 1 : opts.opacity,
    side: opts.side || T.FrontSide,
    emissive: opts.emissive === undefined ? 0x000000 : opts.emissive,
    emissiveIntensity: opts.emissiveIntensity === undefined ? 1 : opts.emissiveIntensity,
    emissiveMap: opts.emissiveMap || null,
    alphaTest: opts.alphaTest || 0,
    depthWrite: opts.depthWrite === undefined ? true : opts.depthWrite,
    toneMapped: opts.toneMapped === undefined ? true : opts.toneMapped,
  });
  return m;
}

const MAT = {};
function buildMaterials() {
  MAT.floor = new T.MeshStandardMaterial({ map: TEX.polishedConcrete, color: 0xcfc9bd, roughness: 0.66, metalness: 0.02, envMapIntensity: 0.75 });
  MAT.apron = new T.MeshStandardMaterial({ map: TEX.concrete, color: 0xa6a196, roughness: 0.84, metalness: 0.02, envMapIntensity: 0.5 });
  MAT.asphalt = new T.MeshStandardMaterial({ map: TEX.asphalt, color: 0x9b9b98, roughness: 0.95, metalness: 0.0, envMapIntensity: 0.35 });
  MAT.slabSide = new T.MeshStandardMaterial({ map: TEX.concreteDark, color: 0x8f8a80, roughness: 0.9, metalness: 0.0 });
  MAT.wallPanel = new T.MeshStandardMaterial({ map: TEX.wallPanel, color: 0xc3c6c7, roughness: 0.58, metalness: 0.22, envMapIntensity: 0.7 });
  MAT.wallInner = new T.MeshStandardMaterial({ map: TEX.wallInner, color: 0xdad5c9, roughness: 0.78, metalness: 0.03 });
  MAT.windowBand = new T.MeshStandardMaterial({ map: TEX.windowBand, color: 0xbfccd2, roughness: 0.16, metalness: 0.55, envMapIntensity: 1.3 });
  MAT.roof = new T.MeshStandardMaterial({ map: TEX.wallPanel, color: 0x82888e, roughness: 0.52, metalness: 0.35, side: T.DoubleSide });
  MAT.steel = new T.MeshStandardMaterial({ map: TEX.steel, color: 0xb0b6ba, roughness: 0.4, metalness: 0.78, envMapIntensity: 0.85 });
  MAT.steelDark = new T.MeshStandardMaterial({ map: TEX.steelDark, color: 0x9aa0a5, roughness: 0.52, metalness: 0.7, envMapIntensity: 0.7 });
  MAT.galv = new T.MeshStandardMaterial({ map: TEX.steel, color: 0x9aa0a3, roughness: 0.36, metalness: 0.62, envMapIntensity: 0.8 });
  MAT.machineGrey = matStd(0x8f959a, { roughness: 0.52, metalness: 0.35, envMapIntensity: 0.8 });
  MAT.machineDark = matStd(0x30353a, { roughness: 0.48, metalness: 0.45, envMapIntensity: 0.8 });
  MAT.machineWhite = matStd(0xd6d1c5, { roughness: 0.5, metalness: 0.12, envMapIntensity: 0.7 });
  MAT.orange = matStd(0xd95c1e, { roughness: 0.46, metalness: 0.12, envMapIntensity: 0.7 });
  MAT.orangeDeep = matStd(0xa8431a, { roughness: 0.55, metalness: 0.1 });
  MAT.yellow = matStd(0xe2a92b, { roughness: 0.52, metalness: 0.08 });
  MAT.white = matStd(0xe7e2d7, { roughness: 0.6, metalness: 0.05 });
  MAT.black = matStd(0x1a1c1e, { roughness: 0.7, metalness: 0.2 });
  MAT.hazard = new T.MeshStandardMaterial({ map: TEX.hazard, roughness: 0.55, metalness: 0.15 });
  MAT.rubber = matStd(0x141516, { roughness: 0.95, metalness: 0.0 });
  MAT.tyre = new T.MeshStandardMaterial({ map: TEX.tyre, color: 0x2a2b2c, roughness: 0.94, metalness: 0.0 });
  MAT.glassDark = new T.MeshStandardMaterial({ color: 0x2e3b42, roughness: 0.12, metalness: 0.5, transparent: true, opacity: 0.52, envMapIntensity: 1.4, depthWrite: false });
  MAT.glassClear = new T.MeshStandardMaterial({ color: 0xbcd0d6, roughness: 0.04, metalness: 0.0, transparent: true, opacity: 0.16, envMapIntensity: 1.2, depthWrite: false, side: T.DoubleSide });
  MAT.screen = new T.MeshStandardMaterial({ map: TEX.screen, emissiveMap: TEX.screen, emissive: 0xffffff, emissiveIntensity: 1.5, color: 0x101417, roughness: 0.3, metalness: 0.2 });
  MAT.screenAmber = new T.MeshStandardMaterial({ map: TEX.screenAmber, emissiveMap: TEX.screenAmber, emissive: 0xffffff, emissiveIntensity: 1.4, color: 0x0d0b08, roughness: 0.3 });
  MAT.ledWarm = new T.MeshStandardMaterial({ color: 0x201a12, emissive: 0xffdca8, emissiveIntensity: 3.2, roughness: 0.5, metalness: 0.0, toneMapped: true });
  MAT.ledCool = new T.MeshStandardMaterial({ color: 0x10161a, emissive: 0xcfe4ec, emissiveIntensity: 2.6, roughness: 0.5 });
  MAT.ledAmber = new T.MeshStandardMaterial({ color: 0x1a1208, emissive: 0xf2a73b, emissiveIntensity: 3.4, roughness: 0.5 });
  MAT.ledGreen = new T.MeshStandardMaterial({ color: 0x0c1710, emissive: 0x7fd6a0, emissiveIntensity: 2.6, roughness: 0.5 });
  MAT.ledRed = new T.MeshStandardMaterial({ color: 0x1c0b08, emissive: 0xff5638, emissiveIntensity: 3.0, roughness: 0.5 });
  MAT.ledWhite = new T.MeshStandardMaterial({ color: 0x161a1c, emissive: 0xf3f0e8, emissiveIntensity: 2.4, roughness: 0.5 });
  MAT.pallet = new T.MeshStandardMaterial({ map: TEX.palletWood, roughness: 0.85, metalness: 0.0 });
  MAT.cardboard = new T.MeshStandardMaterial({ map: TEX.cardboard, roughness: 0.9, metalness: 0.0 });
  MAT.fence = new T.MeshStandardMaterial({ map: TEX.meshFence, color: 0xb9bec0, transparent: true, alphaTest: 0.28, side: T.DoubleSide, roughness: 0.6, metalness: 0.4, depthWrite: true });
  MAT.paintBody = PAL.carBodies.map((c) => new T.MeshStandardMaterial({ color: c, roughness: 0.28, metalness: 0.62, envMapIntensity: 1.5 }));
  MAT.carGlass = new T.MeshStandardMaterial({ color: 0x141c21, roughness: 0.08, metalness: 0.6, envMapIntensity: 1.6 });
  MAT.truckWhite = matStd(0xdcd8cf, { roughness: 0.42, metalness: 0.2, envMapIntensity: 0.8 });
  MAT.truckDark = matStd(0x2c3136, { roughness: 0.5, metalness: 0.3 });
  MAT.container = new T.MeshStandardMaterial({ map: TEX.container, color: 0xb59a7c, roughness: 0.72, metalness: 0.2 });
  MAT.concreteDark = new T.MeshStandardMaterial({ map: TEX.concreteDark, color: 0x8a867e, roughness: 0.9, metalness: 0.0 });
  MAT.plate = new T.MeshStandardMaterial({ map: TEX.diamondPlate, color: 0xa9adb0, roughness: 0.4, metalness: 0.6, envMapIntensity: 0.85 });
  MAT.hatch = new T.MeshStandardMaterial({ map: TEX.hatch, roughness: 0.9, metalness: 0.0 });
}

/* ---------- geometry helpers ---------- */
function addBox(parent, w, h, d, x, y, z, mat, opts) {
  opts = opts || {};
  const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotX) m.rotation.x = opts.rotX;
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  m.castShadow = opts.cast === undefined ? true : opts.cast;
  m.receiveShadow = opts.receive === undefined ? true : opts.receive;
  if (opts.name) m.name = opts.name;
  parent.add(m);
  if (opts.pick) pickable(m, opts.pick);
  if (opts.noMerge) m.userData.noMerge = true;
  return m;
}
function addBoxBase(parent, w, h, d, x, baseY, z, mat, opts) {
  return addBox(parent, w, h, d, x, baseY + h / 2, z, mat, opts);
}
function addCylinder(parent, rTop, rBottom, h, seg, x, y, z, mat, opts) {
  opts = opts || {};
  const m = new T.Mesh(new T.CylinderGeometry(rTop, rBottom, h, seg || 12), mat);
  m.position.set(x, y, z);
  if (opts.rotX) m.rotation.x = opts.rotX;
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  m.castShadow = opts.cast === undefined ? true : opts.cast;
  m.receiveShadow = opts.receive === undefined ? true : opts.receive;
  parent.add(m);
  if (opts.pick) pickable(m, opts.pick);
  if (opts.noMerge) m.userData.noMerge = true;
  return m;
}
function addCylinderBase(parent, rTop, rBottom, h, seg, x, baseY, z, mat, opts) {
  return addCylinder(parent, rTop, rBottom, h, seg, x, baseY + h / 2, z, mat, opts);
}
function addPlaneXZ(parent, w, d, x, y, z, mat, opts) {
  opts = opts || {};
  const m = new T.Mesh(new T.PlaneGeometry(w, d), mat);
  m.rotation.order = "YXZ";
  m.rotation.x = -PI / 2;
  if (opts.rotY) m.rotation.y = opts.rotY;
  m.position.set(x, y, z);
  m.receiveShadow = opts.receive === undefined ? true : opts.receive;
  m.castShadow = opts.cast || false;
  parent.add(m);
  if (opts.name) m.name = opts.name;
  if (opts.pick) pickable(m, opts.pick);
  if (opts.noMerge) m.userData.noMerge = true;
  return m;
}
function addPlane(parent, w, h, x, y, z, mat, opts) {
  opts = opts || {};
  const m = new T.Mesh(new T.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotX) m.rotation.x = opts.rotX;
  m.castShadow = opts.cast || false;
  m.receiveShadow = opts.receive || false;
  parent.add(m);
  if (opts.name) m.name = opts.name;
  if (opts.noMerge) m.userData.noMerge = true;
  return m;
}
function addRibbon(parent, points, width, y, mat, opts) {
  opts = opts || {};
  const n = points.length;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) {
    const p = points[i];
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(n - 1, i + 1)];
    let dx = pNext[0] - pPrev[0], dz = pNext[1] - pPrev[1];
    const L = Math.hypot(dx, dz) || 1;
    dx /= L; dz /= L;
    const nx = -dz, nz = dx;
    const hw = (typeof width === "function" ? width(i / (n - 1)) : width) / 2;
    pos.push(p[0] + nx * hw, y, p[1] + nz * hw);
    pos.push(p[0] - nx * hw, y, p[1] - nz * hw);
    uv.push(0, i * 0.5, 1, i * 0.5);
    if (i < n - 1) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new T.BufferGeometry();
  geo.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new T.Mesh(geo, mat);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function curvePoints(points, y) {
  return points.map((p) => new T.Vector3(p[0], y === undefined ? 0 : y, p[1]));
}
function lineBetween(parent, a, b, r, mat, seg) {
  const av = a.isVector3 ? a : new T.Vector3(a[0], a[1], a[2]);
  const bv = b.isVector3 ? b : new T.Vector3(b[0], b[1], b[2]);
  const dir = new T.Vector3().subVectors(bv, av);
  const len = dir.length();
  const m = new T.Mesh(new T.CylinderGeometry(r, r, len, seg || 6), mat);
  m.position.copy(av).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
  m.castShadow = false; m.receiveShadow = false;
  parent.add(m);
  return m;
}
function polylineTube(parent, points, r, mat, tubular) {
  if (tubular !== false && points.length > 3) {
    const curve = new T.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new T.Vector3(p[0], p[1], p[2]))));
    const geo = new T.TubeGeometry(curve, Math.max(8, points.length * 4), r, 6, false);
    const m = new T.Mesh(geo, mat);
    m.castShadow = false; m.receiveShadow = false;
    parent.add(m);
    return m;
  }
  const g = new T.Group();
  parent.add(g);
  for (let i = 0; i < points.length - 1; i++) lineBetween(g, points[i], points[i + 1], r, mat, 6);
  return g;
}
function mergeGeoms(geoms) {
  let vc = 0, hasUv = true, hasColor = true;
  const list = geoms.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    vc += ng.attributes.position.count;
    if (!ng.attributes.uv) hasUv = false;
    if (!ng.attributes.color) hasColor = false;
    return ng;
  });
  const pos = new Float32Array(vc * 3);
  const nor = new Float32Array(vc * 3);
  const uv = hasUv ? new Float32Array(vc * 2) : null;
  const col = hasColor ? new Float32Array(vc * 3) : null;
  let o3 = 0, o2 = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o3);
    nor.set(g.attributes.normal.array, o3);
    if (uv) uv.set(g.attributes.uv.array, o2);
    if (col) col.set(g.attributes.color.array, o3);
    o3 += g.attributes.position.count * 3;
    o2 += g.attributes.position.count * 2;
  }
  const out = new T.BufferGeometry();
  out.setAttribute("position", new T.BufferAttribute(pos, 3));
  out.setAttribute("normal", new T.BufferAttribute(nor, 3));
  if (uv) out.setAttribute("uv", new T.BufferAttribute(uv, 2));
  if (col) out.setAttribute("color", new T.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
const _mergeTmpMat = new T.Matrix4();
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new T.Matrix4().copy(root.matrixWorld).invert();
  const meshes = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSprite) return;
    if (o.visible === false || o.userData.noMerge) return;
    if (!o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    if (Array.isArray(o.material)) return;
    if (!o.material || o.material.isShaderMaterial) return;
    meshes.push(o);
  });
  const byMat = new Map();
  for (const o of meshes) {
    const key = o.material.uuid;
    let rec = byMat.get(key);
    if (!rec) { rec = { mat: o.material, geoms: [], cast: false, receive: false }; byMat.set(key, rec); }
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(_mergeTmpMat.multiplyMatrices(inv, o.matrixWorld));
    rec.geoms.push(g);
    if (o.castShadow) rec.cast = true;
    if (o.receiveShadow) rec.receive = true;
    if (o.parent) o.parent.remove(o);
  }
  let n = 0;
  byMat.forEach((rec) => {
    if (!rec.geoms.length) return;
    const merged = new T.Mesh(mergeGeoms(rec.geoms), rec.mat);
    merged.castShadow = rec.cast;
    merged.receiveShadow = rec.receive;
    merged.matrixAutoUpdate = false;
    root.add(merged);
    n++;
    for (const g of rec.geoms) g.dispose();
  });
  return n;
}
function addInstanced(parent, geo, mat, items, opts) {
  opts = opts || {};
  const mesh = new T.InstancedMesh(geo, mat, items.length);
  mesh.castShadow = opts.cast === undefined ? true : opts.cast;
  mesh.receiveShadow = opts.receive === undefined ? true : opts.receive;
  const m = new T.Matrix4();
  const q = new T.Quaternion();
  const e = new T.Euler();
  const s = new T.Vector3();
  const p = new T.Vector3();
  const col = new T.Color();
  let hasColor = false;
  items.forEach((it, i) => {
    p.set(it.x || 0, it.y || 0, it.z || 0);
    e.set(it.rx || 0, it.ry || 0, it.rz || 0);
    q.setFromEuler(e);
    s.set(it.sx === undefined ? (it.s === undefined ? 1 : it.s) : it.sx, it.sy === undefined ? (it.s === undefined ? 1 : it.s) : it.sy, it.sz === undefined ? (it.s === undefined ? 1 : it.s) : it.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
    if (it.color !== undefined) { hasColor = true; col.set(it.color); mesh.setColorAt(i, col); }
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (hasColor && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}
let _shadowTex = null;
function contactShadow(parent, w, d, x, z, opacity) {
  if (!_shadowTex) {
    _shadowTex = canvasTexture(128, 128, (ctx, cw, ch) => {
      const g = ctx.createRadialGradient(cw / 2, ch / 2, 0, cw / 2, ch / 2, cw / 2);
      g.addColorStop(0, "rgba(0,0,0,0.85)");
      g.addColorStop(0.55, "rgba(0,0,0,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
    }, { srgb: false });
  }
  const mat = new T.MeshBasicMaterial({ map: _shadowTex, transparent: true, opacity: opacity === undefined ? 0.5 : opacity, depthWrite: false, toneMapped: false });
  const m = new T.Mesh(new T.PlaneGeometry(w, d), mat);
  m.rotation.x = -PI / 2;
  m.position.set(x, 0.035, z);
  m.renderOrder = 2;
  parent.add(m);
  return m;
}
function glowSprite(parent, hex, size, opacity, tex) {
  const mat = new T.SpriteMaterial({
    map: tex || TEX.glow,
    color: hex,
    transparent: true,
    opacity: opacity === undefined ? 0.8 : opacity,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const sp = new T.Sprite(mat);
  sp.scale.set(size, size, 1);
  parent.add(sp);
  return sp;
}

/* ---------- picking ---------- */
const PICKABLES = [];
function pickable(obj, data) {
  obj.userData.pick = data;
  obj.visible = false;
  obj.userData.noMerge = true;
  PICKABLES.push(obj);
  return obj;
}
function addPickProxy(parent, data, w, h, d, x, y, z) {
  const proxy = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ visible: false }));
  proxy.position.set(x, y, z);
  proxy.visible = false;
  proxy.userData.noMerge = true;
  parent.add(proxy);
  pickable(proxy, data);
  return proxy;
}

/* ---------- SIM: live factory state ---------- */
const SIM = {
  t: 0,
  simTime: 0,
  clock: 14 * 60 + 36, // factory clock, minutes since 00:00
  clockRate: 8,        // sim seconds per real second
  speed: FLAGS.sim || 1,
  paused: false,
  shift: { start: 8 * 60, end: 20 * 60 },
  takt: 58,
  taktActual: 58,
  output: 936,
  target: 1488,
  stations: [],
  zones: {},
  alarms: [],
  alarmSeq: 0,
  counts: { wip: 186, finished: 936, scrap: 2, alerts: 0 },
  agv: { active: 3, total: 4, battery: [0.82, 0.64, 0.91, 0.37] },
  energy: { demand: 1.29, peak: 1.61, perZone: { Z01: 0.09, Z02: 0.34, Z03: 0.28, Z04: 0.31, Z05: 0.17, Z06: 0.06, Z07: 0.04 } },
  oee: { a: 0.94, p: 0.95, q: 0.992, oee: 0.886 },
  history: { out: [], oee: [], energy: [] },
  listeners: {},
  sdt: 0,
  on(type, fn) { (this.listeners[type] || (this.listeners[type] = [])).push(fn); },
  emit(type, data) { const l = this.listeners[type]; if (l) for (const fn of l) fn(data); },
  registerStation(def) {
    const st = Object.assign({
      state: "run", util: 0.85, progress: 0, timer: 0, runTime: 0, downTime: 0,
      cycle: this.takt, level: 0,
    }, def);
    if (st.state === undefined) st.state = "run";
    st.utilSeed = (st.utilSeed || this.stations.length * 1.7);
    this.stations.push(st);
    const z = this.zones[st.zone];
    if (z) z.stations.push(st.id);
    return st;
  },
  station(id) { return this.stations.find((s) => s.id === id); },
  stateOf(id) { const s = this.station(id); return s ? s.state : "run"; },
  setStation(id, patch) { const s = this.station(id); if (s) Object.assign(s, patch); return s; },
  wip(zoneId, n) {
    if (!this.zones[zoneId]) return;
    this.zones[zoneId].wip = n;
    let total = 0;
    for (const k in this.zones) total += this.zones[k].wip || 0;
    this.counts.wip = total;
  },
  completeUnit(zoneId) {
    this.output++;
    this.counts.finished = this.output;
    if (zoneId && this.zones[zoneId]) this.zones[zoneId].out++;
    this.emit("unit", { output: this.output, zone: zoneId });
  },
  pushAlarm(st, level, text) {
    const a = {
      id: "AL-" + (++this.alarmSeq), t: this.t, clock: this.clock,
      stationId: st.id, zone: st.zone, level: level, text: text, active: true,
    };
    this.alarms.unshift(a);
    if (this.alarms.length > 14) this.alarms.pop();
    this.counts.alerts++;
    this.emit("alarm", a);
    return a;
  },
  resolveAlarm(a) {
    a.active = false;
    a.resolved = this.t;
    this.emit("alarmClear", a);
  },
  frame(dtRaw) {
    const dt = Math.min(dtRaw, 0.05);
    if (this.paused) { this.sdt = 0; return; }
    const sdt = dt * this.clockRate * this.speed;
    this.sdt = sdt;
    this.t += dt;
    this.simTime += sdt;
    this.clock = (this.clock + sdt / 60) % 1440;

    // stations: state timers, utilization smoothing
    for (const st of this.stations) {
      st.runTime = (st.runTime || 0) + (st.state === "run" ? dt : 0);
      st.downTime = (st.downTime || 0) + (st.state !== "run" ? dt : 0);
      st.timer = (st.timer || 0) + dt;
      const target = st.state === "run" ? 0.9 + 0.08 * Math.sin(this.t * 0.3 + st.utilSeed || 0) : st.state === "idle" ? 0.42 : 0.02;
      st.util = lerp(st.util, target, Math.min(1, dt * 0.8));
      st.progress = (st.progress + sdt / (st.cycle || this.takt)) % 1;
    }

    // background fault injection (deterministic-ish, only when supported)
    if (!this._nextAlarmAt) this._nextAlarmAt = this.t + rand(6, 12);
    if (this.t >= this._nextAlarmAt) {
      this._nextAlarmAt = this.t + rand(12, 26);
      const cands = this.stations.filter((s) => s.state === "run" && s.allowFault !== false);
      if (cands.length) {
        const st = cands[(rng() * cands.length) | 0];
        st.state = "down";
        st.downUntil = this.t + rand(6, 15);
        const texts = {
          Z01: "堆垛机取货超时", Z02: "压力机换模未就绪", Z03: "焊枪电极磨损预警",
          Z04: "烘房温度偏差", Z05: "工位物料配送延迟", Z06: "检测线视觉标定",
        };
        this.pushAlarm(st, rng() > 0.7 ? 2 : 1, texts[st.zone] || "设备等待复位");
      }
    }
    for (const st of this.stations) {
      if (st.state === "down" && st.downUntil !== undefined && this.t >= st.downUntil) {
        st.state = "run";
        st.downUntil = undefined;
        const a = this.alarms.find((al) => al.stationId === st.id && al.active);
        if (a) this.resolveAlarm(a);
        this.emit("restore", { id: st.id });
      }
    }

    // OEE model
    let runRatio = 1, n = 0;
    for (const st of this.stations) {
      const total = st.runTime + st.downTime;
      if (total > 0.5) { runRatio += (st.state === "run" ? 1 : 0) + (st.runTime / total > 0 ? 0 : 0); n++; }
    }
    let avail = 0;
    if (this.stations.length) {
      avail = this.stations.reduce((acc, s) => acc + (s.state === "run" ? 1 : s.state === "idle" ? 0.6 : 0), 0) / this.stations.length;
    } else avail = 0.94;
    const perf = clamp(this.takt / (this.taktActual || this.takt), 0.7, 1.05);
    const qual = 0.988 + 0.006 * Math.sin(this.simTime * 0.0004) + 0.004 * Math.sin(this.simTime * 0.0021);
    this.oee.a = lerp(this.oee.a, clamp(avail, 0.55, 1), Math.min(1, dt * 0.5));
    this.oee.p = lerp(this.oee.p, perf, Math.min(1, dt * 0.3));
    this.oee.q = lerp(this.oee.q, qual, Math.min(1, dt * 0.3));
    this.oee.oee = this.oee.a * this.oee.p * this.oee.q;
    this.taktActual = this.takt * (1 + 0.02 * Math.sin(this.simTime * 0.01));

    // energy + zone utilization
    this.energy.demand = 1.27 + 0.045 * Math.sin(this.simTime * 0.02) + 0.025 * Math.sin(this.simTime * 0.11) + (this.energy.baseJitter || 0);
    const shares = { Z01: 0.09, Z02: 0.34, Z03: 0.28, Z04: 0.31, Z05: 0.17, Z06: 0.06, Z07: 0.04 };
    for (const z of ZONES) {
      const zs = this.zones[z.id];
      if (!zs) continue;
      const share = shares[z.id] || 0.05;
      zs.energy = this.energy.demand * share;
      const zStations = this.stations.filter((s) => s.zone === z.id);
      zs.util = zStations.length ? zStations.reduce((a, s) => a + s.util, 0) / zStations.length : 0.8;
      zs.anyDown = zStations.some((s) => s.state === "down");
    }

    // history sampling (for sparkline / graphs)
    if (!this._nextSample || this.t >= this._nextSample) {
      this._nextSample = this.t + 1.2;
      this.history.out.push(this.output);
      this.history.oee.push(this.oee.oee);
      this.history.energy.push(this.energy.demand);
      for (const k in this.history) { const arr = this.history[k]; if (arr.length > 96) arr.shift(); }
    }
  },
};

// seed zone state
for (const z of ZONES) {
  SIM.zones[z.id] = { id: z.id, out: 0, wip: 0, util: 0.8, energy: 0, anyDown: false, stations: [] };
}
// seed history so charts are alive on first paint
(function seedHistory() {
  for (let i = 0; i < 60; i++) {
    const out = SIM.output - (60 - i) * 2.55 + Math.sin(i * 0.4) * 1.1 + hash2(i, 3) * 1.4;
    SIM.history.out.push(Math.round(out));
    SIM.history.oee.push(0.845 + 0.045 * Math.sin(i * 0.21) + 0.018 * Math.sin(i * 0.7));
    SIM.history.energy.push(1.28 + 0.05 * Math.sin(i * 0.33) + 0.02 * hash2(i, 9));
  }
})();

/* ---------- small late helpers ---------- */
function setTransform(obj, x, y, z) { obj.position.set(x, y, z); return obj; }
function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh) {
      if (o.geometry) o.geometry.dispose();
    }
  });
}
