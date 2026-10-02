// Map layers and the night lighting: darkness overlay, flickering
// settlement lights, the Crooked Moon's glow, colour tints, light mode, and
// the hover reveal of a province/location's shape.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

// One entry per map layer — lets the lighting/hover-reveal system below
// (originally built for just the main map) drive either layer generically
// instead of hardcoding element ids and a single lights array. CW/CH must
// match each map image's actual pixel size (and the matching <svg
// viewBox="0 0 CW CH">), since that's the coordinate space every light x/y
// and hotspot `d` string is expressed in.
const MAP_LAYERS = {
  main: {
    CW: 3000, CH: 1953,
    lightingCanvasId: 'lighting-canvas',
    tintCanvasId: 'tint-canvas',
    hoverCanvasId: 'hover-canvas',
    mapImgId: 'main-map-img',
    lights: SETTLEMENT_LIGHTS,
    hasMoon: true,
    // The main map's lights lean on the original, more understated look —
    // see the wickermoor layer's comment for what this controls.
    tintMultiplier: 1,
  },
  wickermoor: {
    CW: 3000, CH: 1951,
    lightingCanvasId: 'wickermoor-lighting-canvas',
    tintCanvasId: 'wickermoor-tint-canvas',
    hoverCanvasId: 'wickermoor-hover-canvas',
    mapImgId: 'wickermoor-map-img',
    lights: WICKERMOOR_LIGHTS,
    hasMoon: false, // no "Moon" path was traced in this map's source .xcf
    // Controls peak alpha (0..1ish, see renderLightingForLayer) of the
    // colored light drawn onto this layer's dedicated tint-canvas, which
    // sits above the map art with CSS mix-blend-mode:color — so unlike a
    // plain translucent overlay, this genuinely replaces the hue of
    // whatever's beneath it (map art + darkness) rather than just washing
    // a faint tint on top, which is what makes a light actually read as
    // casting colored light instead of just hinting at a color. Wickermoor
    // leans on distinct per-location identity colors more than the main
    // map does, so it gets a much stronger value here.
    tintMultiplier: 8,
  },
};

// One-time canvas buffer sizing — separate from the per-frame render so the
// animation loop doesn't need to touch canvas.width/height every tick.
function setupCanvasSizes() {
  Object.values(MAP_LAYERS).forEach(layer => {
    const lightingCanvas = document.getElementById(layer.lightingCanvasId);
    if (lightingCanvas) {
      lightingCanvas.width  = layer.CW;
      lightingCanvas.height = layer.CH;
    }
    const tintCanvas = document.getElementById(layer.tintCanvasId);
    if (tintCanvas) {
      tintCanvas.width  = layer.CW;
      tintCanvas.height = layer.CH;
    }
    const hoverCanvas = document.getElementById(layer.hoverCanvasId);
    if (hoverCanvas) {
      hoverCanvas.width  = layer.CW;
      hoverCanvas.height = layer.CH;
    }
  });
}

// Tuned once here and reused both when building the pre-rendered shape-glow
// caches below and when rendering (must match, or the cache won't look like
// what a live blur at the "real" tier radius would have produced).
const TIER_BLUR = { capital: 45, minor: 35, flavor: 28 };

// Parses the min/max x/y out of one of our own generated "M x,y C x,y x,y
// x,y ..." path strings. Safe to assume every number is part of an x,y pair
// in sequence, since that's the only shape these `d` strings ever take
// (see extract_xcf.py's path_to_svg_d) — and since a cubic Bezier curve
// always lies within the convex hull of its control points, the bounding
// box of every coordinate mentioned (anchors *and* control points) is
// guaranteed to be a superset of the curve's actual extent.
function shapeBoundsFromD(d) {
  const nums = d.match(/-?\d+(?:\.\d+)?/g).map(Number);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < nums.length; i += 2) {
    if (nums[i] < minX) minX = nums[i];
    if (nums[i] > maxX) maxX = nums[i];
    if (nums[i + 1] < minY) minY = nums[i + 1];
    if (nums[i + 1] > maxY) maxY = nums[i + 1];
  }
  return { minX, minY, maxX, maxY };
}

// Pre-renders a filled+blurred shape to a small offscreen canvas just once,
// instead of re-running the (comparatively expensive) canvas blur filter on
// every animation frame. Per-frame rendering then just needs a cheap
// drawImage() modulated by globalAlpha for the flicker, rather than
// recomputing the blur ~24 times a second — this is what was making the
// animation loop noticeably slower once a couple of lights had large traced
// shapes instead of simple points.
//
// `scale` (default 1) grows the shape itself, about its own center, before
// blurring — used to make a light's reveal genuinely bigger (a larger hole
// in the darkness) without touching blurPx/tier, since more blur alone
// dilutes a small shape's peak opacity instead of just widening it (see the
// blurPx comment in setupLightFlicker).
function buildShapeGlowCache(d, blurPx, fillStyle, CW, CH, scale = 1) {
  const b = shapeBoundsFromD(d);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const halfW = (b.maxX - b.minX) / 2 * scale;
  const halfH = (b.maxY - b.minY) / 2 * scale;
  const pad = blurPx * 3; // a canvas blur's visible falloff spreads roughly this far
  const x0 = Math.max(0, Math.floor(cx - halfW - pad));
  const y0 = Math.max(0, Math.floor(cy - halfH - pad));
  const x1 = Math.min(CW, Math.ceil(cx + halfW + pad));
  const y1 = Math.min(CH, Math.ceil(cy + halfH + pad));

  const off = document.createElement('canvas');
  off.width = Math.max(1, x1 - x0);
  off.height = Math.max(1, y1 - y0);
  const octx = off.getContext('2d');
  octx.translate(-x0, -y0);
  if (scale !== 1) {
    octx.translate(cx, cy);
    octx.scale(scale, scale);
    octx.translate(-cx, -cy);
  }
  octx.filter = `blur(${blurPx}px)`;
  octx.fillStyle = fillStyle;
  octx.fill(new Path2D(d));

  return { canvas: off, x: x0, y: y0 };
}

// Assigns each light (across every map layer) its own randomized (but fixed
// for the session) flicker parameters, so all the torches/hearths/lanterns
// flicker independently instead of pulsing in unison. Also pre-renders the
// blurred glow caches for any light traced as a full shape (see
// buildShapeGlowCache).
function setupLightFlicker() {
  Object.values(MAP_LAYERS).forEach(layer => {
    layer.lights.forEach(light => {
      light._rgb = hexToRgb(light.color);
      light._flicker = {
        f1: 1.6 + Math.random() * 1.2,
        f2: 3.6 + Math.random() * 2.2,
        f3: 7.6 + Math.random() * 3.6,
        p1: Math.random() * Math.PI * 2,
        p2: Math.random() * Math.PI * 2,
        p3: Math.random() * Math.PI * 2,
      };
      if (light.shape) {
        // A shape's own traced size can be smaller than (or comparable to)
        // its tier's blur radius — e.g. a single small icon rather than a
        // whole building. Canvas blur conserves total "ink" rather than
        // just softening edges, so blurring a shape by roughly its own size
        // dilutes its peak opacity well below the tier's nominal strength,
        // making it look dim no matter how high the tier goes. `blurPx`
        // lets an individual light opt out of the shared tier blur and use
        // a smaller value sized to its own shape, keeping a strong, mostly
        // undiluted core. Only set where needed; every other light is
        // unaffected.
        const blur = light.blurPx ?? (TIER_BLUR[light.tier] ?? 30);
        const scale = light.glowScale ?? 1;
        const { r: cr, g: cg, b: cb } = light._rgb;
        light._glowDark = buildShapeGlowCache(light.shape, blur, 'rgba(0,0,0,1)', layer.CW, layer.CH, scale);
        light._glowTint = buildShapeGlowCache(light.shape, blur * 0.55, `rgba(${cr},${cg},${cb},1)`, layer.CW, layer.CH, scale);
      }
    });
  });
}

// Sum of three sine waves at different frequencies/phases per light — an
// organic, non-repeating-looking flame flicker without needing true
// per-frame randomness (which would look noisy/jittery instead of smooth).
function flickerMultiplier(flicker, t) {
  const n = 0.40 * Math.sin(t * flicker.f1 + flicker.p1)
          + 0.35 * Math.sin(t * flicker.f2 + flicker.p2)
          + 0.25 * Math.sin(t * flicker.f3 + flicker.p3);
  return 1 + n * 0.40; // roughly ±40% swing — a clearly visible flame flicker
}

// Slow, gentle single-wave pulse for the Crooked Moon — fits its "ever-
// shifting, unexplained" lore better than a flame-like flicker.
function moonPulseMultiplier(t) {
  return 1 + 0.15 * Math.sin(t * 0.5); // ~12.6s period, ±15% swing
}

// Draws one frame of the darkness + moon (if any) + lights onto the given
// layer's lighting canvas, at animation time `t` (seconds since the loop
// started). Called continuously — must clearRect first since each pass
// re-composites semi-transparent layers that would otherwise compound frame
// over frame.
function renderLightingForLayer(layerKey, t) {
  const layer = MAP_LAYERS[layerKey];
  const CW = layer.CW, CH = layer.CH;
  const canvas = document.getElementById(layer.lightingCanvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, CW, CH);

  // Step 1 — night darkness base
  ctx.fillStyle = 'rgba(4, 4, 7, 0.92)';
  ctx.fillRect(0, 0, CW, CH);

  // Step 2 — cut holes with destination-out
  ctx.globalCompositeOperation = 'destination-out';

  // Moon: glow confined to roughly the moon glyph's own footprint, slightly
  // elliptical, gently pulsing in size and strength. The gradient and the
  // fill shape are both defined as plain circles in a vertically-squashed
  // coordinate space (via translate+scale) rather than a circular gradient
  // under an ctx.ellipse() fill — createRadialGradient is always isotropic,
  // so squashing only the fill shape (not the gradient) would clip the
  // ellipse's top/bottom edge before the gradient had faded to zero there,
  // producing a hard edge instead of the same soft falloff as the other
  // (circular) lights.
  if (layer.hasMoon) {
    (function() {
      const moonX = 363, moonY = 299;
      const pulse = moonPulseMultiplier(t);
      const r = 390 * pulse;
      ctx.save();
      ctx.translate(moonX, moonY);
      ctx.scale(1, 0.88);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0,    `rgba(0,0,0,${clamp01(1 * pulse).toFixed(3)})`);
      g.addColorStop(0.15, `rgba(0,0,0,${clamp01(1 * pulse).toFixed(3)})`);
      g.addColorStop(0.45, `rgba(0,0,0,${clamp01(0.65 * pulse).toFixed(3)})`);
      g.addColorStop(0.75, `rgba(0,0,0,${clamp01(0.25 * pulse).toFixed(3)})`);
      g.addColorStop(1,    'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    })();
  }

  // Lights — each punches its own soft hole in the darkness, flickering
  // like torchlight/hearthfire. Most are simple point markers (a plain
  // radial gradient); a light traced as a full shape in the source .xcf
  // instead gets `light.shape` (an SVG path `d` string) and its glow
  // follows that outline, via the pre-rendered caches from
  // setupLightFlicker()/buildShapeGlowCache() — just a cheap drawImage
  // modulated by globalAlpha per frame, not a live blur.
  const tierRadiusMult = { capital: 2.6, minor: 2.0, flavor: 1.8 };
  const tierStrength   = { capital: 0.9, minor: 0.75, flavor: 0.65 };

  layer.lights.forEach(light => {
    const flicker = flickerMultiplier(light._flicker, t);
    const peak = clamp01((tierStrength[light.tier] ?? 0.7) * flicker);

    if (light.shape) {
      ctx.save();
      ctx.globalAlpha = peak;
      ctx.drawImage(light._glowDark.canvas, light._glowDark.x, light._glowDark.y);
      ctx.restore();
      return;
    }

    const r = light.r * (tierRadiusMult[light.tier] ?? 1.8);
    const g = ctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
    g.addColorStop(0,    `rgba(0,0,0,${peak.toFixed(3)})`);
    g.addColorStop(0.3,  `rgba(0,0,0,${(peak * 0.75).toFixed(3)})`);
    g.addColorStop(0.65, `rgba(0,0,0,${(peak * 0.35).toFixed(3)})`);
    g.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(light.x, light.y, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Step 3 — reset composite mode (this canvas is reused every frame, and
  // Step 1 of the *next* frame needs a plain fillRect, not one still under
  // destination-out from this frame's Step 2)
  ctx.globalCompositeOperation = 'source-over';

  // Step 4 — colour tint, communicating each light's actual assigned color.
  // Drawn onto a *separate* canvas (layer.tintCanvasId) stacked above the
  // map art with CSS mix-blend-mode:color, rather than onto this darkness
  // canvas: a canvas's own globalCompositeOperation can only blend against
  // content already drawn on that same canvas, so drawing the tint here
  // (in the "holes" that Step 2 already made transparent) could only ever
  // plain-alpha-blend against nothing — it can't reach the separate <img>
  // element beneath to actually replace its hue. CSS mix-blend-mode, by
  // contrast, blends this whole element against everything in the stacking
  // context below it (map art *and* this darkness canvas), swapping hue at
  // each pixel's own alpha while preserving what's underneath's luminosity
  // — which is what makes a light read as actually casting colored light,
  // not just a translucent wash sitting on top of the map's own colors.
  const tintCanvas = document.getElementById(layer.tintCanvasId);
  if (!tintCanvas) return;
  const tctx = tintCanvas.getContext('2d');
  tctx.clearRect(0, 0, CW, CH);

  const tintMult = layer.tintMultiplier ?? 1;
  layer.lights.forEach(light => {
    // A handful of plain settlement torches/lanterns are meant to stay
    // "uncolored" — just the darkness-punch reveal of the map art's own
    // painted color, with no assigned identity hue recolouring it — rather
    // than every light on the map reading as a deliberately colored one.
    if (light.tintExempt) return;

    const flicker = flickerMultiplier(light._flicker, t);
    const { r: cr, g: cg, b: cb } = light._rgb;
    const a0 = clamp01(0.094 * flicker * tintMult);

    if (light.shape) {
      tctx.save();
      tctx.globalAlpha = a0;
      tctx.drawImage(light._glowTint.canvas, light._glowTint.x, light._glowTint.y);
      tctx.restore();
      return;
    }

    const r = light.r * (tierRadiusMult[light.tier] ?? 1.8) * 0.55;
    const a1 = clamp01(0.039 * flicker * tintMult);
    const g = tctx.createRadialGradient(light.x, light.y, 0, light.x, light.y, r);
    g.addColorStop(0,   `rgba(${cr},${cg},${cb},${a0.toFixed(3)})`);
    g.addColorStop(0.6, `rgba(${cr},${cg},${cb},${a1.toFixed(3)})`);
    g.addColorStop(1,   `rgba(${cr},${cg},${cb},0)`);
    tctx.fillStyle = g;
    tctx.beginPath();
    tctx.arc(light.x, light.y, r, 0, Math.PI * 2);
    tctx.fill();
  });
}

// Throttled requestAnimationFrame loop driving renderLightingForLayer() for
// whichever map layer is currently active. Pauses (skips redraws, but keeps
// ticking so it resumes smoothly) whenever the tab isn't in the foreground
// or "light mode" is on, since the darkness/moon/light animation is
// invisible in both cases.
const LIGHTING_FRAME_INTERVAL = 1000 / 24; // ~24fps is plenty for slow ambient motion
let lightingAnimationRunning = false;
let lightingAnimationStart = null;
let lastLightingRenderTime = 0;

// "Light mode" — fully removes the night/darkness overlay so the map is
// visible exactly as drawn, with no lights or shadows. Persists across
// switching between the main map and Wickermoor Hollow (it's a display
// preference, not part of the zoom/pan camera state).
let lightModeOn = false;

function toggleLightMode() {
  lightModeOn = !lightModeOn;
  const btn = document.getElementById('light-mode-btn');
  if (btn) btn.classList.toggle('active', lightModeOn);
  if (lightModeOn) {
    Object.values(MAP_LAYERS).forEach(layer => {
      const canvas = document.getElementById(layer.lightingCanvasId);
      if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      // Otherwise this stays frozen with whatever colour patches it last
      // had — the render loop (which normally repaints it every frame)
      // returns early while light mode is on.
      const tintCanvas = document.getElementById(layer.tintCanvasId);
      if (tintCanvas) tintCanvas.getContext('2d').clearRect(0, 0, tintCanvas.width, tintCanvas.height);
    });
  }
  // Turning night mode back on needs no explicit redraw here — the
  // animation loop (paused while lightModeOn) resumes drawing on its next tick.
}

function lightingAnimationTick(timestamp) {
  requestAnimationFrame(lightingAnimationTick);

  if (document.hidden) return;
  if (lightModeOn) return;
  if (timestamp - lastLightingRenderTime < LIGHTING_FRAME_INTERVAL) return;

  lastLightingRenderTime = timestamp;
  if (lightingAnimationStart === null) lightingAnimationStart = timestamp;
  renderLightingForLayer(getActiveMapKey(), (timestamp - lightingAnimationStart) / 1000);
}

function startLightingAnimation() {
  if (lightingAnimationRunning) return;
  lightingAnimationRunning = true;
  setupLightFlicker();
  requestAnimationFrame(lightingAnimationTick);
}

// Pending hideProvinceReveal() clear, if any, per layer — tracked so a fast
// re-hover (moving onto this or another hotspot before the fade-out
// finishes) can cancel it. Without this, the stale clear fires ~280ms later
// and wipes out whatever new reveal is currently showing, making the new
// hotspot flash and go dark even though the mouse never left it. (In
// practice only one layer is ever interactive at a time — the other is
// `pointer-events:none` while hidden — but keying by layer avoids relying
// on that.)
const hoverRevealHideTimeouts = {};

// Clip to the given province/location shape and draw that layer's map image
// through it, leaving all other pixels transparent so surrounding darkness
// is unaffected, then fade in. Called on mouseenter.
function showProvinceReveal(layerKey, dString) {
  const layer = MAP_LAYERS[layerKey];
  const hc = document.getElementById(layer.hoverCanvasId);
  const mapImg = document.getElementById(layer.mapImgId);
  if (!hc || !mapImg) return;

  if (hoverRevealHideTimeouts[layerKey] != null) {
    clearTimeout(hoverRevealHideTimeouts[layerKey]);
    hoverRevealHideTimeouts[layerKey] = null;
  }

  const ctx = hc.getContext('2d');
  const CW = layer.CW, CH = layer.CH;

  ctx.clearRect(0, 0, CW, CH);
  ctx.save();
  const shape = new Path2D(dString);
  ctx.clip(shape);
  ctx.drawImage(mapImg, 0, 0, CW, CH);
  ctx.restore();

  hc.style.opacity = '1';
}

// Fade the hover canvas out and clear it. Called on mouseleave.
function hideProvinceReveal(layerKey) {
  const layer = MAP_LAYERS[layerKey];
  const hc = document.getElementById(layer.hoverCanvasId);
  if (!hc) return;
  hc.style.opacity = '0';
  if (hoverRevealHideTimeouts[layerKey] != null) clearTimeout(hoverRevealHideTimeouts[layerKey]);
  // Clear after the CSS transition completes (250ms)
  hoverRevealHideTimeouts[layerKey] = setTimeout(() => {
    const ctx = hc.getContext('2d');
    ctx.clearRect(0, 0, hc.width, hc.height);
    hoverRevealHideTimeouts[layerKey] = null;
  }, 280);
}
