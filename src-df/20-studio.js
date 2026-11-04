/* ============================================================
   20 · studio — dark photographic studio around the factory
   background gradient · environment map · key / fill / rim
   ============================================================ */

const studio = {
  scene: null,
  camera: null,
  env: null,
  lights: {},
};

const STUDIO_VERT = @@BT@@varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }@@BT@@;

const STUDIO_FRAG = @@BT@@
precision highp float;
varying vec2 vUv;
uniform float uTime;
void main() {
  vec2 uv = vUv;
  vec3 top = vec3(0.006, 0.0075, 0.0105);
  vec3 mid = vec3(0.0135, 0.0150, 0.0175);
  vec3 bot = vec3(0.021, 0.0205, 0.0185);
  float y = smoothstep(0.0, 1.0, uv.y);
  vec3 col = mix(bot, mid, smoothstep(0.0, 0.55, y));
  col = mix(col, top, smoothstep(0.5, 1.0, y));
  float glow = 1.0 - smoothstep(0.0, 0.72, length((uv - vec2(0.40, 0.60)) * vec2(1.05, 0.78)));
  col += vec3(0.045, 0.033, 0.018) * pow(max(glow, 0.0), 1.7) * 0.55;
  float rim = 1.0 - smoothstep(0.0, 0.85, length((uv - vec2(0.86, 0.52)) * vec2(0.9, 1.4)));
  col += vec3(0.010, 0.016, 0.021) * max(rim, 0.0) * 0.8;
  col += vec3(0.015, 0.014, 0.012) * smoothstep(0.03, 0.0, abs(uv.y - 0.20));
  gl_FragColor = vec4(col, 1.0);
}
@@BT@@;

function buildStudio() {
  // ---- background pass ----
  const bgScene = new T.Scene();
  const bgCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const bgMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: STUDIO_VERT,
    fragmentShader: STUDIO_FRAG,
    depthTest: false,
    depthWrite: false,
  });
  const bgQuad = new T.Mesh(new T.PlaneGeometry(2, 2), bgMat);
  bgQuad.frustumCulled = false;
  bgScene.add(bgQuad);
  studio.scene = bgScene;
  studio.camera = bgCam;
  studio.bgMat = bgMat;

  // ---- environment map: warm softboxes in a dark studio (equirect) ----
  const envTex = canvasTexture(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#1a1c1e");
    g.addColorStop(0.52, "#0b0c0d");
    g.addColorStop(1, "#050505");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // key softbox (upper left)
    let rg = ctx.createRadialGradient(w * 0.22, h * 0.24, 0, w * 0.22, h * 0.24, w * 0.17);
    rg.addColorStop(0, "rgba(255,238,209,1)");
    rg.addColorStop(0.35, "rgba(255,225,185,0.45)");
    rg.addColorStop(1, "rgba(255,225,185,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    // cool rim strip (right)
    rg = ctx.createRadialGradient(w * 0.82, h * 0.42, 0, w * 0.82, h * 0.42, w * 0.20);
    rg.addColorStop(0, "rgba(190,220,236,0.75)");
    rg.addColorStop(1, "rgba(190,220,236,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    // low warm bounce
    rg = ctx.createRadialGradient(w * 0.5, h * 0.9, 0, w * 0.5, h * 0.9, w * 0.35);
    rg.addColorStop(0, "rgba(190,150,100,0.35)");
    rg.addColorStop(1, "rgba(190,150,100,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    // overhead strip lights
    ctx.fillStyle = "rgba(255,236,205,0.55)";
    for (let i = 0; i < 4; i++) ctx.fillRect(w * 0.34 + i * w * 0.09, h * 0.06, w * 0.03, h * 0.06);
  }, { srgb: true });
  envTex.mapping = T.EquirectangularReflectionMapping;
  studio.env = envTex;

  // ---- lights ----
  const key = new T.DirectionalLight(0xfff2e2, 2.3);
  key.position.set(-128, 168, 96);
  key.castShadow = true;
  key.shadow.mapSize.set(FLAGS.lq ? 2048 : 4096, FLAGS.lq ? 2048 : 4096);
  key.shadow.camera.left = -132;
  key.shadow.camera.right = 132;
  key.shadow.camera.top = 112;
  key.shadow.camera.bottom = -112;
  key.shadow.camera.near = 30;
  key.shadow.camera.far = 420;
  key.shadow.bias = -0.00035;
  key.shadow.normalBias = 0.35;
  key.shadow.radius = 2;
  scene.add(key);
  scene.add(key.target);
  studio.lights.key = key;

  const rim = new T.DirectionalLight(0xa8c6da, 0.88);
  rim.position.set(150, 92, -170);
  scene.add(rim);
  studio.lights.rim = rim;

  const top = new T.DirectionalLight(0xfff3e2, 0.36);
  top.position.set(20, 240, 40);
  scene.add(top);
  studio.lights.top = top;

  const hemi = new T.HemisphereLight(0x6b7e8a, 0x241f1a, 0.55);
  scene.add(hemi);
  studio.lights.hemi = hemi;

  const amb = new T.AmbientLight(0x2b2a27, 0.18);
  scene.add(amb);
  studio.lights.amb = amb;

  // ---- infinite studio ground, faint grid ----
  const groundMat = new T.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: @@BT@@
      varying vec3 vW;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    @@BT@@,
    fragmentShader: @@BT@@
      precision highp float;
      varying vec3 vW;
      uniform float uTime;
      float hgrid(vec2 p, float s, float w) {
        vec2 g = abs(fract(p / s - 0.5) - 0.5) * s;
        return smoothstep(w, 0.0, min(g.x, g.y));
      }
      void main() {
        float d = length(vW.xz);
        float fade = 1.0 - smoothstep(120.0, 760.0, d);
        vec3 base = mix(vec3(0.006, 0.0068, 0.008), vec3(0.016, 0.016, 0.0155), smoothstep(0.0, 260.0, d));
        float g1 = hgrid(vW.xz, 12.0, 0.045) * 0.05;
        float g2 = hgrid(vW.xz, 60.0, 0.09) * 0.09;
        vec3 col = base + vec3(0.16, 0.14, 0.11) * (g1 + g2) * (1.0 - smoothstep(120.0, 520.0, d));
        float pool = 1.0 - smoothstep(40.0, 300.0, length(vW.xz - vec2(0.0, 6.0)));
        col += vec3(0.028, 0.022, 0.014) * pool * 0.7;
        col = mix(vec3(0.004, 0.0045, 0.005), col, fade);
        gl_FragColor = vec4(col, 1.0);
      }
    @@BT@@,
  });
  const ground = new T.Mesh(new T.PlaneGeometry(2200, 2200), groundMat);
  ground.rotation.x = -PI / 2;
  ground.position.y = -0.55;
  ground.receiveShadow = false;
  ground.frustumCulled = false;
  scene.add(ground);
  studio.ground = ground;

  // fog to sink the far ground into the void
  scene.fog = new T.FogExp2(0x0b0c0e, 0.0016);
  studio.fog = scene.fog;

  addTick((t) => {
    studio.bgMat.uniforms.uTime.value = t;
    groundMat.uniforms.uTime.value = t;
  });
}

/* ground reveal: the site pad fades in after the studio buys a frame */
