// Ambient particles over the night map: sparks rising from the settlements'
// lights, and a few will-o'-wisps drifting over the dark. Shown at night
// and dusk; hidden in day mode, behind the Codex, and for visitors who ask
// their system for reduced motion (all three in styles.css).
//
// Every particle is a tiny element animated by CSS (transform and opacity
// only), so the browser moves them on the GPU without running any script
// per frame and without repainting the map. Nothing is drawn onto the
// lighting canvases, so they cost the lighting loop nothing.
//
// They live inside each map's zoom layer, so they pan and zoom with the map
// as part of the world. Positions and sizes are in map pixels (the same
// coordinate space as the lights in hotspots.json), turned into on-screen
// pixels through the --u unit set on each layer's box (see
// layoutAmbientLayers).
//
// Placement uses a fixed-seed random generator, so every visitor sees the
// same sparks and wisps in the same places.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

const AMBIENT_SEED = 1666;

// How many sparks each light gives off, by tier. Lights on eyes (glowing
// monster eyes, the bat's) give none, and of the small "flavor" lights
// only actual fires do.
const AMBIENT_SPARKS = {
  high: { capital: 2, minor: 1, flavor: 1, wisps: 8 },
  low:  { capital: 1, minor: 0.4, flavor: 0.4, wisps: 3 },
};
const AMBIENT_NO_SPARKS_RE = /eye/i;
const AMBIENT_FIRE_RE = /wicker|burn|fire|pyre/i;
const AMBIENT_WISP_RGB = '170, 226, 214';

// mulberry32: a small, fast seeded generator; returns floats in [0, 1).
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let ambientReady = false;

function initAmbientParticles() {
  if (ambientReady) return;
  ambientReady = true;
  buildAmbientParticles();
  window.addEventListener('resize', layoutAmbientLayers);
}

// (Re)creates every layer's particles for the current lighting quality —
// called again by setLightingQuality when a slow device steps down.
function buildAmbientParticles() {
  const counts = AMBIENT_SPARKS[lightingQuality] || AMBIENT_SPARKS.high;
  Object.entries(MAP_LAYERS).forEach(([key, layer], layerIndex) => {
    const zoomLayer = getZoomLayerEl(key);
    if (!zoomLayer) return;
    let box = zoomLayer.querySelector('.ambient-layer');
    if (!box) {
      box = document.createElement('div');
      box.className = 'ambient-layer';
      box.setAttribute('aria-hidden', 'true');
      // Above the map art and lighting, below the clickable hotspots.
      zoomLayer.insertBefore(box, zoomLayer.querySelector('svg.hotspot-svg'));
    }
    box.replaceChildren();
    const rand = seededRandom(AMBIENT_SEED + layerIndex);
    const between = (lo, hi) => lo + rand() * (hi - lo);
    const frag = document.createDocumentFragment();

    layer.lights.forEach(light => {
      if (AMBIENT_NO_SPARKS_RE.test(light.name)) return;
      if (light.tier === 'flavor' && !AMBIENT_FIRE_RE.test(light.name)) return;
      let n = counts[light.tier] ?? 0;
      // Fractional counts: that chance of one spark.
      const whole = Math.floor(n);
      n = whole + (rand() < n - whole ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const rgb = light._rgb || hexToRgb(light.color);
        const spread = (light.r || 30) * 0.5;
        const d = between(7, 13);
        frag.appendChild(ambientParticle('ambient-spark', layer,
          light.x + between(-spread, spread), light.y + between(-spread * 0.5, spread * 0.3), {
            '--s': between(9, 15).toFixed(1),
            '--dx': between(-35, 35).toFixed(0),
            '--wx': between(-18, 18).toFixed(0),
            '--dy': (-between(70, 150)).toFixed(0),
            '--o': between(0.55, 0.95).toFixed(2),
            '--c': `${rgb.r}, ${rgb.g}, ${rgb.b}`,
            '--d': `${d.toFixed(1)}s`,
            // Negative delays start each spark partway through its cycle,
            // so they don't all rise together when the page opens.
            '--delay': `${(-rand() * d).toFixed(1)}s`,
          }));
      }
    });

    for (let i = 0; i < counts.wisps; i++) {
      const d = between(22, 38);
      frag.appendChild(ambientParticle('ambient-wisp', layer,
        between(0.08, 0.92) * layer.CW, between(0.12, 0.9) * layer.CH, {
          '--s': between(26, 38).toFixed(1),
          '--x1': between(-90, 90).toFixed(0), '--y1': between(-60, 60).toFixed(0),
          '--x2': between(-90, 90).toFixed(0), '--y2': between(-60, 60).toFixed(0),
          '--x3': between(-90, 90).toFixed(0), '--y3': between(-60, 60).toFixed(0),
          '--o': between(0.4, 0.7).toFixed(2),
          '--c': AMBIENT_WISP_RGB,
          '--d': `${d.toFixed(1)}s`,
          '--delay': `${(-rand() * d).toFixed(1)}s`,
        }));
    }

    box.appendChild(frag);
  });
  layoutAmbientLayers();
}

function ambientParticle(className, layer, x, y, vars) {
  const el = document.createElement('span');
  el.className = className;
  el.style.left = `${(x / layer.CW * 100).toFixed(3)}%`;
  el.style.top = `${(y / layer.CH * 100).toFixed(3)}%`;
  Object.entries(vars).forEach(([k, v]) => el.style.setProperty(k, v));
  return el;
}

// Pins each layer's particle box to where the map art actually sits inside
// its zoom layer (the image is "contain"-fitted, so there can be empty
// bands at the sides), and sets --u, the size of one map pixel on screen
// at zoom 1. The zoom layer's own transform takes care of pan and zoom.
function layoutAmbientLayers() {
  Object.keys(MAP_LAYERS).forEach(key => {
    const box = getZoomLayerEl(key)?.querySelector('.ambient-layer');
    if (!box) return;
    const b = mapFitBox(key);
    if (!b.W) return;
    box.style.left = `${b.offX}px`;
    box.style.top = `${b.offY}px`;
    box.style.width = `${b.mw}px`;
    box.style.height = `${b.mh}px`;
    box.style.setProperty('--u', `${(b.mw / MAP_LAYERS[key].CW).toFixed(5)}px`);
  });
}
