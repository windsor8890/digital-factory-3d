/* ============================================================
   70 · post — MSAA scene target, bloom, grade, grain, vignette
   (adapted from the studio art-piece pipeline for the factory)
   ============================================================ */

const PASS_VERT = @@BT@@varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }@@BT@@;

const BLUR_FRAG = @@BT@@
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform vec2 uDir;
uniform float uRadius;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
void main() {
  float ang = hash(gl_FragCoord.xy * 0.713) * 6.2831;
  vec2 d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * uDir;
  vec2 st = uTexel * d * uRadius;
  vec3 c = texture2D(uTex, vUv).rgb * 0.227027;
  c += (texture2D(uTex, vUv + st).rgb + texture2D(uTex, vUv - st).rgb) * 0.194594;
  c += (texture2D(uTex, vUv + st * 2.0).rgb + texture2D(uTex, vUv - st * 2.0).rgb) * 0.121621;
  c += (texture2D(uTex, vUv + st * 3.0).rgb + texture2D(uTex, vUv - st * 3.0).rgb) * 0.054054;
  c += (texture2D(uTex, vUv + st * 4.0).rgb + texture2D(uTex, vUv - st * 4.0).rgb) * 0.016216;
  gl_FragColor = vec4(c, 1.0);
}
@@BT@@;

const COPY_FRAG = @@BT@@
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
void main() { gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }
@@BT@@;

const BRIGHT_FRAG = @@BT@@
precision highp float;
varying vec2 vUv;
uniform sampler2D uTex;
uniform float uThreshold;
uniform float uKnee;
void main() {
  vec3 c = texture2D(uTex, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp((l - uThreshold + uKnee) / (2.0 * uKnee), 0.0, 1.0);
  float w = max(l - uThreshold, 0.0) * soft / max(l, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
@@BT@@;

const COMPOSITE_FRAG = @@BT@@
precision highp float;
varying vec2 vUv;
uniform sampler2D uScene;
uniform sampler2D uSoft;
uniform sampler2D uBlur;
uniform sampler2D uBloom;
uniform sampler2D uDepth;
uniform float uNear;
uniform float uFar;
uniform float uFocus;
uniform float uRange;
uniform float uTilt;
uniform float uBandY;
uniform float uTime;
uniform float uExposure;
uniform float uBloomAmount;
uniform float uGrain;
uniform float uVignette;
uniform float uChroma;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
vec3 aces(vec3 x) {
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055, c * 12.92, step(c, vec3(0.0031308)));
}

void main() {
  vec2 uv = vUv;
  vec2 toC = uv - 0.5;
  float ca = uChroma * dot(toC, toC);

  vec3 sharp;
  sharp.r = texture2D(uScene, uv + toC * ca).r;
  sharp.g = texture2D(uScene, uv).g;
  sharp.b = texture2D(uScene, uv - toC * ca).b;

  float rawDepth = texture2D(uDepth, uv).x;
  float viewDist = (uNear * uFar) / max(1e-5, uFar - (uFar - uNear) * rawDepth);
  float coc = clamp(abs(viewDist - uFocus) / uRange, 0.0, 1.0);
  coc = pow(coc, 0.8);

  float band = smoothstep(0.0, 0.46, abs(uv.y - uBandY));
  coc = max(coc, band * uTilt);

  vec3 soft = texture2D(uSoft, uv).rgb;
  vec3 blur = texture2D(uBlur, uv).rgb;
  vec3 col = mix(sharp, soft, clamp(coc * 1.5, 0.0, 1.0));
  col = mix(col, blur, clamp((coc - 0.42) / 0.5, 0.0, 1.0));

  vec3 bloom = texture2D(uBloom, uv).rgb;
  col += bloom * uBloomAmount;

  col *= uExposure;
  col = aces(col);

  float vig = smoothstep(1.02, 0.28, length(toC * vec2(1.02, 1.18)));
  col *= mix(1.0, vig, uVignette);

  float g = hash(gl_FragCoord.xy + fract(uTime) * 91.7) - 0.5;
  col += g * uGrain;

  col = toSRGB(col);
  gl_FragColor = vec4(col, 1.0);
}
@@BT@@;

const post = {
  rtScene: null, rtSoftA: null, rtSoftB: null, rtBlurA: null, rtBlurB: null,
  rtBright: null, rtBloomA: null, rtBloomB: null,
  mats: {}, w: 1, h: 1, enabled: true,
};

const quadGeo = new T.PlaneGeometry(2, 2);
const quadCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const quadScene = new T.Scene();
const quadMesh = new T.Mesh(quadGeo, null);
quadMesh.frustumCulled = false;
quadScene.add(quadMesh);

function pass(mat, target) {
  quadMesh.material = mat;
  APP.renderer.setRenderTarget(target || null);
  APP.renderer.render(quadScene, quadCam);
}

function makeRT(w, h, withDepth) {
  const opts = {
    type: T.HalfFloatType,
    format: T.RGBAFormat,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
    depthBuffer: !!withDepth,
    stencilBuffer: false,
    samples: FLAGS.lq ? 1 : 4,
  };
  if (withDepth) {
    const d = new T.DepthTexture(w, h);
    d.type = T.UnsignedIntType;
    d.format = T.DepthFormat;
    d.minFilter = T.NearestFilter;
    d.magFilter = T.NearestFilter;
    opts.depthTexture = d;
  }
  const rt = new T.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), opts);
  rt.texture.generateMipmaps = false;
  return rt;
}

function initPost(w, h) {
  if (post.rtScene) disposePost();
  post.w = w; post.h = h;
  post.rtScene = makeRT(w, h, true);
  post.rtSoftA = makeRT(w >> 1, h >> 1, false);
  post.rtSoftB = makeRT(w >> 1, h >> 1, false);
  post.rtBlurA = makeRT(w >> 2, h >> 2, false);
  post.rtBlurB = makeRT(w >> 2, h >> 2, false);
  post.rtBright = makeRT(w >> 2, h >> 2, false);
  post.rtBloomA = makeRT(w >> 2, h >> 2, false);
  post.rtBloomB = makeRT(w >> 2, h >> 2, false);
  post.tmp = makeRT(w >> 2, h >> 2, false);

  post.mats.copy = new T.ShaderMaterial({ uniforms: { uTex: { value: null } }, vertexShader: PASS_VERT, fragmentShader: COPY_FRAG, depthTest: false });
  post.mats.blur = new T.ShaderMaterial({
    uniforms: { uTex: { value: null }, uTexel: { value: new T.Vector2() }, uDir: { value: new T.Vector2(1, 0) }, uRadius: { value: 1 } },
    vertexShader: PASS_VERT, fragmentShader: BLUR_FRAG, depthTest: false,
  });
  post.mats.bright = new T.ShaderMaterial({
    uniforms: { uTex: { value: null }, uThreshold: { value: 1.12 }, uKnee: { value: 0.55 } },
    vertexShader: PASS_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false,
  });
  post.mats.composite = new T.ShaderMaterial({
    uniforms: {
      uScene: { value: null }, uSoft: { value: null }, uBlur: { value: null },
      uBloom: { value: null }, uDepth: { value: null },
      uNear: { value: 2 }, uFar: { value: 1400 },
      uFocus: { value: 220 }, uRange: { value: 260 },
      uTilt: { value: FLAGS.still ? 0.03 : 0.055 }, uBandY: { value: 0.46 },
      uTime: { value: 0 }, uExposure: { value: 0.98 },
      uBloomAmount: { value: 0.44 }, uGrain: { value: 0.009 },
      uVignette: { value: 0.7 }, uChroma: { value: 0.0012 },
    },
    vertexShader: PASS_VERT, fragmentShader: COMPOSITE_FRAG, depthTest: false,
  });
}

function disposePost() {
  ["rtScene", "rtSoftA", "rtSoftB", "rtBlurA", "rtBlurB", "rtBright", "rtBloomA", "rtBloomB", "tmp"].forEach((k) => {
    if (post[k]) { post[k].dispose(); post[k] = null; }
  });
}

function blurInto(src, target, radius) {
  const m = post.mats.blur;
  const w = src.width, h = src.height;
  m.uniforms.uTexel.value.set(1 / w, 1 / h);
  m.uniforms.uRadius.value = radius;
  m.uniforms.uTex.value = src.texture;
  m.uniforms.uDir.value.set(1, 0);
  pass(m, post.tmp);
  m.uniforms.uTex.value = post.tmp.texture;
  m.uniforms.uDir.value.set(0, 1);
  pass(m, target);
}

function renderPost(t) {
  const R = APP.renderer;
  R.setRenderTarget(post.rtScene);
  R.clear(true, true, true);
  R.render(studio.scene, studio.camera);
  R.clearDepth();
  R.render(APP.scene, APP.camera);

  const cm = post.mats.copy;
  cm.uniforms.uTex.value = post.rtScene.texture;
  pass(cm, post.rtSoftA);
  post.mats.blur.uniforms.uTex.value = post.rtSoftA.texture;
  post.mats.blur.uniforms.uTexel.value.set(2 / post.w, 2 / post.h);
  post.mats.blur.uniforms.uRadius.value = 1.15;
  post.mats.blur.uniforms.uDir.value.set(1, 0);
  pass(post.mats.blur, post.rtSoftB);
  post.mats.blur.uniforms.uTex.value = post.rtSoftB.texture;
  post.mats.blur.uniforms.uDir.value.set(0, 1);
  pass(post.mats.blur, post.rtSoftA);

  cm.uniforms.uTex.value = post.rtSoftA.texture;
  pass(cm, post.rtBlurB);
  post.mats.blur.uniforms.uTex.value = post.rtBlurB.texture;
  post.mats.blur.uniforms.uTexel.value.set(4 / post.w, 4 / post.h);
  post.mats.blur.uniforms.uRadius.value = 2.4;
  post.mats.blur.uniforms.uDir.value.set(1, 0);
  pass(post.mats.blur, post.rtBlurA);
  post.mats.blur.uniforms.uTex.value = post.rtBlurA.texture;
  post.mats.blur.uniforms.uDir.value.set(0, 1);
  pass(post.mats.blur, post.rtBlurB);

  post.mats.bright.uniforms.uTex.value = post.rtScene.texture;
  pass(post.mats.bright, post.rtBright);
  post.mats.blur.uniforms.uTex.value = post.rtBright.texture;
  post.mats.blur.uniforms.uTexel.value.set(4 / post.w, 4 / post.h);
  post.mats.blur.uniforms.uRadius.value = 1.5;
  post.mats.blur.uniforms.uDir.value.set(1, 0);
  pass(post.mats.blur, post.rtBloomB);
  post.mats.blur.uniforms.uTex.value = post.rtBloomB.texture;
  post.mats.blur.uniforms.uDir.value.set(0, 1);
  pass(post.mats.blur, post.rtBloomA);

  const cmp = post.mats.composite.uniforms;
  cmp.uScene.value = post.rtScene.texture;
  cmp.uSoft.value = post.rtSoftA.texture;
  cmp.uBlur.value = post.rtBlurB.texture;
  cmp.uBloom.value = post.rtBloomA.texture;
  cmp.uDepth.value = post.rtScene.depthTexture;
  cmp.uNear.value = APP.camera.near;
  cmp.uFar.value = APP.camera.far;
  cmp.uTime.value = t;
  pass(post.mats.composite, null);
}
