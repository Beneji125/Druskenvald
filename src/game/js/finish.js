// The finishing pass: the house is drawn into an off-screen picture first,
// and then onto the screen through one shader that gives everything the
// same look as the characters (see stylizePainting in art.js): ink lines
// where shapes meet, tones gently pressed into a few bands, film grain,
// a vignette, and a colour grade that goes cold and grey as Dread rises.
//
// It costs one extra full-screen draw. It's skipped on low-powered devices
// and can be turned off in the volume panel ("Film look").

const FINISH_KEY = 'crooked_house_finish';
const finish = {
  on: store.get(FINISH_KEY) !== 'off',
  target: null, scene: null, camera: null, material: null,
};

const FINISH_SHADER = {
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tColor;
    uniform sampler2D tDepth;
    uniform vec2 res;
    uniform float near, far, time, dread, ink;
    varying vec2 vUv;
    // 1/z is linear across any flat surface on screen, so its second
    // difference is zero on walls and floors and large only where one
    // shape passes in front of another: a clean place for an ink line.
    float invZ(vec2 uv) { return 1.0 / max(0.001, -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far)); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 px = 1.0 / res;
      vec3 lin = texture2D(tColor, vUv).rgb;
      // to the screen's colours first (the renderer's own tone mapping)
      vec3 col = linearToOutputTexel(vec4(toneMapping(lin), 1.0)).rgb;
      // ink: depth creases, and only strong changes in brightness
      float w = invZ(vUv);
      float lx = invZ(vUv - vec2(px.x, 0.0)) + invZ(vUv + vec2(px.x, 0.0)) - 2.0 * w;
      float ly = invZ(vUv - vec2(0.0, px.y)) + invZ(vUv + vec2(0.0, px.y)) - 2.0 * w;
      float crease = (abs(lx) + abs(ly)) / w;
      float l0 = luma(col);
      float gx = luma(linearToOutputTexel(vec4(toneMapping(texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb), 1.0)).rgb) - l0;
      float gy = luma(linearToOutputTexel(vec4(toneMapping(texture2D(tColor, vUv + vec2(0.0, px.y)).rgb), 1.0)).rgb) - l0;
      float line = max(smoothstep(0.04, 0.16, crease), smoothstep(0.16, 0.34, length(vec2(gx, gy))) * 0.55) * ink;
      // a few tones: brightness pulled towards bands, softly
      float bands = 7.0;
      float lq = (floor(l0 * bands) + 0.5) / bands;
      // (never lifting the darkest pixels, which would blow up their noise)
      float ratio = clamp(lq / max(l0, 0.02), 0.75, 1.25);
      col = mix(col, col * ratio, 0.3 * smoothstep(0.03, 0.12, l0));
      // Dread: colour drains, the shadows go cold
      float d = dread;
      col = mix(col, vec3(luma(col)), d * 0.55);
      col *= mix(vec3(1.0), vec3(0.86, 0.92, 1.06), d);
      col = mix(col, vec3(0.04, 0.03, 0.025), line);
      // the edges of the picture darken; grain over everything
      vec2 v = vUv - 0.5;
      col *= mix(0.64, 1.0, smoothstep(0.8, 0.3, length(v * vec2(1.0, 0.85))));
      col += (hash(vUv * res + fract(time) * 91.7) - 0.5) * 0.045;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function setupFinish(r, q) {
  if (q === 'low') { finish.on = false; return; }
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  finish.target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(size.x, size.y),
    samples: 0,
  });
  finish.material = new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: finish.target.texture }, tDepth: { value: finish.target.depthTexture },
      res: { value: size.clone() }, near: { value: 2 }, far: { value: 3000 }, time: { value: 0 }, dread: { value: 0 }, ink: { value: 1 },
    },
    vertexShader: FINISH_SHADER.vertexShader, fragmentShader: FINISH_SHADER.fragmentShader,
    depthTest: false, depthWrite: false,
  });
  finish.scene = new THREE.Scene();
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), finish.material);
  quad.frustumCulled = false;
  finish.scene.add(quad);
  finish.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

function resizeFinish(r) {
  if (!finish.target) return;
  const size = r.getDrawingBufferSize(new THREE.Vector2());
  finish.target.setSize(size.x, size.y);
  finish.material.uniforms.res.value.copy(size);
}

// Draws a frame: straight to the screen, or through the finishing pass.
function drawFrame(r, scene, cam) {
  if (!finish.on || !finish.target) { r.render(scene, cam); return; }
  const u = finish.material.uniforms;
  u.near.value = cam.near; u.far.value = cam.far;
  u.time.value = clock;
  // Dread grades the picture from uneasy on; memories stay warm.
  u.dread.value = game.inFlashback || arrival.active ? 0 : clamp01((game.dread - 3) / 7);
  r.setRenderTarget(finish.target);
  r.render(scene, cam);
  r.setRenderTarget(null);
  r.render(finish.scene, finish.camera);
}
