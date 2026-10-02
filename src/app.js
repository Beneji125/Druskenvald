// ═══════════════════════════════════════════════════════════════
// APP LOGIC — reads the data injected by build.js (from data/*.json)
// via the global consts: SCENE_IMAGES, LORE, WM_LOCATIONS, WM_BEINGS,
// WM_SCENES, WM_PORTRAITS, WM_TRACKS, WM_LORE, GROUPS, UNLOCKS, SPECIES,
// SETTLEMENT_LIGHTS, MAIN_HOTSPOTS_SVG, WICKERMOOR_LIGHTS,
// WICKERMOOR_HOTSPOTS.
// ═══════════════════════════════════════════════════════════════

// localStorage can throw outright (Safari private mode, browsers set to
// block site data, sandboxed iframes) rather than just returning null.
// Every read/write goes through this wrapper so a blocked store degrades to
// an in-memory one for the visit — music settings and unlocks still work,
// they just aren't remembered next time — instead of an exception halting
// whatever click handler touched it.
const store = (() => {
  const memory = {};
  return {
    get(key) {
      try { return localStorage.getItem(key); }
      catch { return key in memory ? memory[key] : null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); }
      catch { memory[key] = String(value); }
    },
    remove(key) {
      try { localStorage.removeItem(key); }
      catch { delete memory[key]; }
    },
  };
})();

function panelImageHtml(id, label) {
  const src = SCENE_IMAGES[id];
  if (src) {
    return `<div class="panel-image-frame">
      <img src="${src}" alt="${label}" class="panel-image">
    </div>`;
  }
  return `<div class="panel-image-placeholder">
    <div class="placeholder-icon">⬡</div>
    <div class="placeholder-text">Illustration — Coming Soon</div>
  </div>`;
}

function enterSite() {
  const ts = document.getElementById('title-screen');
  const app = document.getElementById('app');
  initMusic(); // called directly from this click handler so the browser
               // still counts it as tied to a user gesture, satisfying
               // autoplay-blocking policies
  ts.classList.add('fade-out');
  setTimeout(() => {
    ts.style.display = 'none';
    app.classList.add('visible');
    buildHotspots();
  }, 800);
}

const MUSIC_VOLUME_DEFAULT = 0.1;
const MUSIC_MUTED_STORAGE_KEY = 'druskenvald_music_muted';
const MUSIC_VOLUME_STORAGE_KEY = 'druskenvald_music_volume';
const DEFAULT_TRACK_SRC = 'audio/Creaking_Bones.mp3';
const DEFAULT_TRACK_TITLE = 'Creaking Bones';
let musicMuted = false;

function initMusic() {
  const audio = document.getElementById('bg-music');
  const slider = document.getElementById('music-volume-slider');
  if (!audio) return;

  const storedVolume = parseFloat(store.get(MUSIC_VOLUME_STORAGE_KEY));
  audio.volume = Number.isFinite(storedVolume) ? storedVolume : MUSIC_VOLUME_DEFAULT;
  if (slider) slider.value = audio.volume;

  musicMuted = store.get(MUSIC_MUTED_STORAGE_KEY) === 'true';
  updateMusicButton();
  updateNowPlayingLabel(DEFAULT_TRACK_TITLE);
  setupMusicProgressBar();
  if (!musicMuted) {
    audio.play().catch(() => {
      // Autoplay can still be refused in some browsers/settings even after
      // a user gesture — leave it paused silently; the toggle button lets
      // the visitor start it manually.
    });
  }
}

// Single place that changes the muted state, so the topbar icon, the
// remembered preference, and an open panel's location-track button (see
// trackButtonHtml) can't drift out of step with what's actually playing.
function setMusicMuted(muted) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;
  musicMuted = muted;
  if (muted) {
    audio.pause();
  } else {
    audio.play().catch(() => {});
  }
  store.set(MUSIC_MUTED_STORAGE_KEY, String(muted));
  updateMusicButton();
  if (currentTrackId) setTrackButtonState(currentTrackId, !muted);
}

function toggleMusic() {
  setMusicMuted(!musicMuted);
}

function setMusicVolume(value) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;
  audio.volume = value;
  store.set(MUSIC_VOLUME_STORAGE_KEY, String(value));
  // Dragging the slider implies wanting to hear it, so unmute if needed.
  if (musicMuted && value > 0) setMusicMuted(false);
}

function updateMusicButton() {
  const btn = document.getElementById('music-toggle-btn');
  if (!btn) return;
  btn.textContent = musicMuted ? '🔇' : '🔊';
  btn.title = musicMuted ? 'Unmute music' : 'Mute music';
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m + ':' + String(s).padStart(2, '0');
}

// Number of bars in the stylized waveform seek bar (see buildWaveformBars).
// Purely decorative — there's no per-track amplitude data to visualize, so
// every track shows the same bar pattern; only how much of it is "played"
// (recolored) changes.
const WAVEFORM_BAR_COUNT = 42;

// Draws the waveform's bars once into #music-waveform-bars. Heights come
// from a small sum of two sine waves seeded by bar index — the same
// "looks organic without being truly random" trick used for the map's
// torch/lantern flicker (see flickerMultiplier) — rather than uniform
// bars (a flat "barcode") or literal Math.random() (would look noisy and
// re-roll differently if this ever got called twice).
function buildWaveformBars() {
  const group = document.getElementById('music-waveform-bars');
  if (!group) return;
  const ns = 'http://www.w3.org/2000/svg';
  const viewW = 200, viewH = 28;
  const barW = 2.6, gap = 2.1, unit = barW + gap;

  for (let i = 0; i < WAVEFORM_BAR_COUNT; i++) {
    const h = 5 + 9 * (0.5 + 0.5 * Math.sin(i * 0.7)) + 6 * (0.5 + 0.5 * Math.sin(i * 1.9 + 1.3));
    const x = i * unit;
    const y = (viewH - h) / 2;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', 'wf-bar');
    rect.setAttribute('x', x.toFixed(2));
    rect.setAttribute('y', y.toFixed(2));
    rect.setAttribute('width', barW);
    rect.setAttribute('height', h.toFixed(2));
    rect.setAttribute('rx', barW / 2);
    group.appendChild(rect);
  }
  // viewBox width covers exactly the bars drawn, so preserveAspectRatio
  // "none" (set in the markup) stretches this cleanly to the CSS width.
  const svg = document.getElementById('music-waveform');
  if (svg) svg.setAttribute('viewBox', `0 0 ${(WAVEFORM_BAR_COUNT * unit).toFixed(2)} ${viewH}`);
}

// Recolors bars up to the playback fraction as "played" rather than
// resizing anything — cheap (a class toggle per bar) and avoids any
// layout/reflow cost on every timeupdate tick.
function updateWaveformProgress(fraction) {
  const bars = document.querySelectorAll('#music-waveform-bars .wf-bar');
  if (!bars.length) return;
  const playedCount = Math.round(clamp01(fraction) * bars.length);
  bars.forEach((bar, i) => bar.classList.toggle('played', i < playedCount));
}

function seekMusicFromEvent(e) {
  const audio = document.getElementById('bg-music');
  const svg = document.getElementById('music-waveform');
  if (!audio || !svg || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0) return;
  const fraction = clamp01((e.clientX - rect.left) / rect.width);
  audio.currentTime = fraction * audio.duration;
  updateWaveformProgress(fraction); // instant feedback; timeupdate will confirm shortly after
}

// Click-to-seek and drag-to-seek (via Pointer Events, unifying mouse/touch)
// on the waveform.
function setupWaveformSeek() {
  const svg = document.getElementById('music-waveform');
  if (!svg) return;
  let dragging = false;
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    seekMusicFromEvent(e);
  });
  svg.addEventListener('pointermove', (e) => { if (dragging) seekMusicFromEvent(e); });
  svg.addEventListener('pointerup', () => { dragging = false; });
  svg.addEventListener('pointercancel', () => { dragging = false; });
}

// Wires the waveform + time readout to #bg-music once; the same listeners
// keep working across src changes (default track <-> a Wickermoor
// location's track, see toggleLocationTrack) since they're on the audio
// element itself, not tied to any one track.
function setupMusicProgressBar() {
  const audio = document.getElementById('bg-music');
  const timeLabel = document.getElementById('music-time');
  if (!audio || !timeLabel) return;

  buildWaveformBars();
  setupWaveformSeek();

  audio.addEventListener('loadedmetadata', () => {
    timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
  });
  audio.addEventListener('timeupdate', () => {
    const fraction = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.currentTime / audio.duration : 0;
    updateWaveformProgress(fraction);
    timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
  });
}

function updateNowPlayingLabel(title) {
  const label = document.getElementById('music-now-playing');
  if (!label) return;
  label.textContent = title || '';
}

function buildHotspots() {
  setupCanvasSizes();
  buildSvgHotspots('main', 'hotspots-main-svg', MAIN_HOTSPOTS_SVG);
  buildSvgHotspots('wickermoor', 'hotspots-wickermoor-svg', WICKERMOOR_HOTSPOTS);
  startLightingAnimation();
  initZoomPan();
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

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

function buildSvgHotspots(layerKey, svgId, hotspots) {
  const svg = document.getElementById(svgId);
  const tooltip = document.getElementById('svg-tooltip');
  const ns = 'http://www.w3.org/2000/svg';

  hotspots.forEach(hs => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', hs.d);
    path.setAttribute('class', 'hotspot-poly');
    path.setAttribute('data-label', hs.label);

    path.addEventListener('mousemove', (e) => {
      // Wickermoor hotspots are individually gated per group (see
      // isUnlockedForGroup/UNLOCKS below); a visitor whose group hasn't
      // explored this location/being yet — including one who hasn't
      // entered a recognized character name at all, so getRecognizedGroup()
      // is null — shouldn't get its identity for free just by hovering.
      // Province hotspots on the main map have no such gating (their
      // UNLOCKS rule is always "all") and keep showing their name as before.
      const locked = layerKey === 'wickermoor' && !isUnlockedForGroup(hs.id, getRecognizedGroup());
      tooltip.textContent = locked ? '???' : hs.label;
      tooltip.style.left = e.clientX + 'px';
      tooltip.style.top = e.clientY + 'px';
      tooltip.classList.add('show');
    });
    path.addEventListener('mouseenter', () => {
      showProvinceReveal(layerKey, hs.d);
    });
    path.addEventListener('mouseleave', () => {
      tooltip.classList.remove('show');
      hideProvinceReveal(layerKey);
    });
    path.addEventListener('click', () => {
      if (justPanned) return;
      tooltip.classList.remove('show');
      if (hs.isWickermoor) {
        openWickermoor();
      } else {
        openPanel(hs.id, hs.label);
      }
    });

    svg.appendChild(path);
  });
}

// ═══════════════════════════════════════════════════════════════
// ZOOM & PAN
// A single CSS transform (translate + scale) on each map layer's
// .zoom-layer wrapper handles zoom/pan for everything inside it (image,
// canvases, SVG hotspots) together, so their existing alignment and the
// browser's native hit-testing on the SVG paths keep working with no
// coordinate-math changes anywhere else.
// ═══════════════════════════════════════════════════════════════

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const ZOOM_WHEEL_FACTOR = 1.15;

const zoomState = {
  main:       { scale: 1, tx: 0, ty: 0 },
  wickermoor: { scale: 1, tx: 0, ty: 0 },
};

// Set by the drag-to-pan handler whenever a gesture moved enough to count as
// a pan rather than a click; checked (and reset) by hotspot click handlers
// so finishing a drag over a hotspot doesn't also open its panel.
let justPanned = false;

function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }

function getActiveMapKey() {
  const wm = document.getElementById('layer-wickermoor');
  return (wm && !wm.classList.contains('hidden')) ? 'wickermoor' : 'main';
}

function getZoomLayerEl(key) {
  return document.getElementById(key === 'wickermoor' ? 'zoom-layer-wickermoor' : 'zoom-layer-main');
}

function clampPan(key) {
  const wrapper = document.getElementById('map-wrapper');
  const state = zoomState[key];
  if (!wrapper) return;
  const w = wrapper.clientWidth, h = wrapper.clientHeight;
  const minTx = Math.min(0, w - w * state.scale);
  const minTy = Math.min(0, h - h * state.scale);
  state.tx = clampNum(state.tx, minTx, 0);
  state.ty = clampNum(state.ty, minTy, 0);
}

function applyZoomTransform(key) {
  const el = getZoomLayerEl(key);
  if (!el) return;
  const { scale, tx, ty } = zoomState[key];
  el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function resetZoomState(key) {
  zoomState[key] = { scale: 1, tx: 0, ty: 0 };
  applyZoomTransform(key);
}

// Zooms the active layer by `factor`, keeping the content under (px, py) —
// in #map-wrapper-local coordinates — fixed in place.
function zoomAtPoint(key, factor, px, py) {
  const state = zoomState[key];
  const contentX = (px - state.tx) / state.scale;
  const contentY = (py - state.ty) / state.scale;
  const newScale = clampNum(state.scale * factor, ZOOM_MIN, ZOOM_MAX);

  state.tx = px - contentX * newScale;
  state.ty = py - contentY * newScale;
  state.scale = newScale;

  clampPan(key);
  applyZoomTransform(key);
}

function zoomIn()  { zoomButtonStep(ZOOM_WHEEL_FACTOR); }
function zoomOut() { zoomButtonStep(1 / ZOOM_WHEEL_FACTOR); }

function zoomButtonStep(factor) {
  const wrapper = document.getElementById('map-wrapper');
  if (!wrapper) return;
  const key = getActiveMapKey();
  zoomAtPoint(key, factor, wrapper.clientWidth / 2, wrapper.clientHeight / 2);
}

function resetZoomView() {
  resetZoomState(getActiveMapKey());
}

function initZoomPan() {
  const wrapper = document.getElementById('map-wrapper');
  if (!wrapper) return;

  wrapper.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = wrapper.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
    zoomAtPoint(getActiveMapKey(), factor, px, py);
  }, { passive: false });

  // Pointer Events keep desktop dragging and touch dragging on one code
  // path. A second active pointer turns the gesture into a midpoint-anchored
  // pinch, so phones do not have to rely exclusively on the +/- buttons.
  const pointers = new Map();
  let drag = null;
  let pinch = null;
  let gestureMoved = false;

  function pinchMetrics() {
    const [a, b] = Array.from(pointers.values()).slice(0, 2);
    if (!a || !b) return null;
    return {
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
    };
  }

  wrapper.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      drag = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY };
      gestureMoved = false;
    } else if (pointers.size === 2) {
      pinch = pinchMetrics();
      drag = null;
    }
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const next = pinchMetrics();
      if (!next || !pinch) { pinch = next; return; }
      const rect = wrapper.getBoundingClientRect();
      const key = getActiveMapKey();
      const state = zoomState[key];
      state.tx += next.midX - pinch.midX;
      state.ty += next.midY - pinch.midY;
      const factor = pinch.distance > 0 && next.distance > 0 ? next.distance / pinch.distance : 1;
      zoomAtPoint(key, factor, next.midX - rect.left, next.midY - rect.top);
      pinch = next;
      gestureMoved = true;
      pointers.forEach((_, pointerId) => wrapper.setPointerCapture?.(pointerId));
      wrapper.classList.add('panning');
      return;
    }
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.lastX;
    const dy = e.clientY - drag.lastY;
    if (!gestureMoved && (Math.abs(e.clientX - drag.startX) > 6 || Math.abs(e.clientY - drag.startY) > 6)) {
      gestureMoved = true;
      wrapper.setPointerCapture?.(e.pointerId);
      wrapper.classList.add('panning');
    }
    if (gestureMoved) {
      const key = getActiveMapKey();
      const state = zoomState[key];
      state.tx += dx;
      state.ty += dy;
      clampPan(key);
      applyZoomTransform(key);
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (wrapper.hasPointerCapture?.(e.pointerId)) wrapper.releasePointerCapture(e.pointerId);
    if (pointers.size === 1) {
      const [pointerId, point] = pointers.entries().next().value;
      drag = { pointerId, startX: point.x, startY: point.y, lastX: point.x, lastY: point.y };
      pinch = null;
    } else if (pointers.size === 0) {
      if (gestureMoved) {
        justPanned = true;
        setTimeout(() => { justPanned = false; }, 0);
      }
      drag = null;
      pinch = null;
      gestureMoved = false;
      wrapper.classList.remove('panning');
    }
  }

  wrapper.addEventListener('pointerup', endPointer);
  wrapper.addEventListener('pointercancel', endPointer);

  window.addEventListener('resize', () => {
    clampPan('main');
    applyZoomTransform('main');
    clampPan('wickermoor');
    applyZoomTransform('wickermoor');
  });
}

function openWickermoor() {
  const wmImg = document.getElementById('wickermoor-map-img');
  if (wmImg && wmImg.dataset.src) {
    wmImg.src = wmImg.dataset.src;
    delete wmImg.dataset.src;
  }
  document.getElementById('layer-main').classList.add('hidden');
  document.getElementById('layer-wickermoor').classList.remove('hidden');
  document.getElementById('back-btn').classList.add('visible');
  document.getElementById('breadcrumb-text').textContent = 'Wickermoor Hollow';
  resetZoomState('main');
  resetZoomState('wickermoor');
  closePanel();
}

function returnToMain() {
  document.getElementById('layer-wickermoor').classList.add('hidden');
  document.getElementById('layer-main').classList.remove('hidden');
  document.getElementById('back-btn').classList.remove('visible');
  document.getElementById('breadcrumb-text').textContent = 'The Thirteen Provinces';
  resetZoomState('main');
  resetZoomState('wickermoor');
  closePanel();
}

// Tracked so submitReenterName() (see the group-unlocking section below)
// can rebuild whatever panel is currently open after recognizing a new
// character, rather than leaving it showing stale locked/unlocked state
// until the visitor closes and reopens it themselves.
let currentOpenPanelId = null;
let currentOpenPanelLabel = null;

function openPanel(id, label) {
  const panel = document.getElementById('lore-panel');
  const content = document.getElementById('panel-content');
  const overlay = document.getElementById('overlay');

  currentOpenPanelId = id;
  currentOpenPanelLabel = label;
  content.innerHTML = buildPanelContent(id, label);
  panel.classList.add('open');
  overlay.classList.add('show');
  content.scrollTop = 0;
}

function closePanel() {
  currentOpenPanelId = null;
  currentOpenPanelLabel = null;
  document.getElementById('lore-panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  hideProvinceReveal(getActiveMapKey());
  closeSpeciesPanel();
  closeNpcPanel();
}

// Species panel — a secondary panel (slides in from the left) shown when a
// clickable species mention is clicked inside a province's lore. Left open
// independently of the main lore panel so the reader keeps their place.
function openSpeciesPanel(id) {
  const panel = document.getElementById('species-panel');
  const content = document.getElementById('species-panel-content');
  const overlay = document.getElementById('species-overlay');
  if (!panel || !content || !overlay) return;

  content.innerHTML = buildSpeciesPanelContent(id);
  panel.classList.add('open');
  overlay.classList.add('show');
  content.scrollTop = 0;
}

function closeSpeciesPanel() {
  const panel = document.getElementById('species-panel');
  const overlay = document.getElementById('species-overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

function buildSpeciesPanelContent(id) {
  const sp = SPECIES[id];
  if (!sp) return `<div class="panel-title">Species lore coming soon.</div>`;

  let html = '';
  html += `<div class="panel-eyebrow">Native Species</div>`;
  html += `<div class="panel-title">${sp.name}</div>`;
  if (sp.pronunciation) {
    html += `<div class="panel-pronunciation">${sp.pronunciation}</div>`;
  }
  html += `<div class="panel-image-frame"><img src="${sp.image}" alt="${sp.name}" class="panel-image"></div>`;
  html += '<div class="panel-divider"></div>';
  html += sp.body;
  return html;
}

// NPC panel — same secondary-panel pattern as the species panel above,
// triggered by clicking a named NPC mentioned inside a Wickermoor
// location/being's own lore text (the `npc-link` elements written into
// WM_LORE in data/descriptions.json). NPCS entries hold a name + portrait,
// plus an optional `body` — buildNpcPanelContent only adds a bio section
// when one is present, rather than showing an empty one.
function openNpcPanel(id) {
  const panel = document.getElementById('npc-panel');
  const content = document.getElementById('npc-panel-content');
  const overlay = document.getElementById('npc-overlay');
  if (!panel || !content || !overlay) return;

  content.innerHTML = buildNpcPanelContent(id);
  panel.classList.add('open');
  overlay.classList.add('show');
  content.scrollTop = 0;
}

function closeNpcPanel() {
  const panel = document.getElementById('npc-panel');
  const overlay = document.getElementById('npc-overlay');
  if (panel) panel.classList.remove('open');
  if (overlay) overlay.classList.remove('show');
}

function buildNpcPanelContent(id) {
  const npc = NPCS[id];
  if (!npc) return `<div class="panel-title">This NPC hasn't been added yet.</div>`;

  let html = '';
  html += `<div class="panel-eyebrow">Wickermoor Hollow</div>`;
  html += `<div class="panel-title">${npc.name}</div>`;
  html += `<div class="panel-image-frame"><img src="${npc.image}" alt="${npc.name}" class="panel-image"></div>`;
  if (npc.body) {
    html += '<div class="panel-divider"></div>';
    html += npc.body;
  }
  return html;
}

function buildPanelContent(id, label) {
  // Wickermoor sub-locations and beings
  if (id.startsWith('wm_')) {
    return buildWMContent(id, label);
  }

  const lore = LORE[id];
  if (!lore) return `<div class="panel-title">${label}</div><p class="panel-body">Lore coming soon.</p>`;

  let html = '';

  // Eyebrow
  if (lore.eyebrow) {
    html += `<div class="panel-eyebrow">${lore.eyebrow}</div>`;
  }

  // Title
  html += `<div class="panel-title">${lore.title}</div>`;

  // Pronunciation
  if (lore.pronunciation) {
    html += `<div class="panel-pronunciation">${lore.pronunciation}</div>`;
  }

  // Image (real scene art if available, otherwise placeholder)
  html += panelImageHtml(id, lore.title);

  // Species tag
  if (lore.species) {
    html += `<div class="species-tag">Native Species: ${lore.species}</div>`;
  }

  // Quote
  if (lore.quote) {
    html += `<blockquote class="panel-quote">"${lore.quote}"<cite>${lore.quoteAttrib}</cite></blockquote>`;
  }

  html += '<div class="panel-divider"></div>';

  // Main body
  if (id === 'wickermoor_hollow') {
    html += lore.body;
    // Add WM location list
    WM_LOCATIONS.forEach(loc => {
      html += `<div class="wm-location-entry">
        <div class="wm-location-name">${loc}</div>
        <div class="wm-location-locked">🔒 Enter the hollow to learn more.</div>
      </div>`;
    });
    WM_BEINGS.forEach(b => {
      html += `<div class="wm-location-entry">
        <div class="wm-location-name">${b.name}</div>
        <div class="wm-location-locked" style="opacity:0.8; font-style:italic;">${b.flavor}</div>
      </div>`;
    });
    html += lore.wickermoorSuffix || '';
  } else {
    html += lore.body;
  }

  // Password section (for provinces)
  if (lore.species) {
    html += buildPasswordSection(id);
  }

  return html;
}

// ── Per-location ambience tracks ──────────────────────────────────
// WM_TRACKS (data/descriptions.json) maps a Wickermoor id to
// { src, title? }; ids with no entry simply get no player. Starting one
// takes over the single shared #bg-music element/topbar player (see
// setupMusicProgressBar/updateNowPlayingLabel above) rather than playing
// in a second, independent player — so it shows up with the same
// play/pause, volume, and progress controls the background loop normally
// uses. Only one track plays at a time; pausing it (or letting it finish)
// hands #bg-music back to the default looping track.
let currentTrackId = null;

// HTML-attribute-escapes a string (order matters: & must go first, or it
// would double-encode the entities produced by the other replacements).
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

function trackButtonHtml(id) {
  const track = WM_TRACKS[id];
  if (!track) return '';
  const playing = currentTrackId === id && !musicMuted;
  const label = track.title ? `Play "${track.title}"` : 'Play Ambience';
  // Several track filenames/titles contain an apostrophe (e.g. "When It's
  // Time"). The onclick attribute here is single-quoted with double-quoted
  // JS string arguments inside it, so a literal apostrophe in `id`/`src`
  // would otherwise prematurely close the *HTML attribute* itself (not
  // just the JS string) — escAttr() HTML-escapes it to &#39; so the
  // browser's attribute parser treats it as a literal character; the
  // decoded value the JS engine then sees is back to a plain apostrophe,
  // which is harmless inside a double-quoted JS string.
  return `
    <div class="wm-track-player">
      <button class="wm-track-btn${playing ? ' playing' : ''}" id="wm-track-btn-${id}" onclick='toggleLocationTrack("${escAttr(id)}", "${escAttr(track.src)}")'>
        ${playing ? '⏸ Pause' : '▶ ' + label}
      </button>
    </div>
  `;
}

function setTrackButtonState(id, playing) {
  const btn = document.getElementById('wm-track-btn-' + id);
  if (!btn) return;
  const track = WM_TRACKS[id];
  const label = track && track.title ? `Play "${track.title}"` : 'Play Ambience';
  btn.textContent = playing ? '⏸ Pause' : '▶ ' + label;
  btn.classList.toggle('playing', playing);
}

function toggleLocationTrack(id, src) {
  const audio = document.getElementById('bg-music');
  if (!audio) return;

  // Clicking the currently-playing track's own button stops it and hands
  // the topbar player back to the default looping track.
  // If it's this track but paused (muted from the topbar), resume it where
  // it left off instead of restarting from the beginning.
  if (currentTrackId === id) {
    if (audio.paused) setMusicMuted(false);
    else revertToDefaultTrack(audio);
    return;
  }

  // Switching away from whatever else was playing (if anything).
  if (currentTrackId) setTrackButtonState(currentTrackId, false);

  currentTrackId = id;
  audio.loop = false;
  audio.src = src;
  audio.currentTime = 0;
  // Pressing play is an explicit request to hear it — clear any mute so the
  // topbar icon matches (setMusicMuted also starts playback).
  if (musicMuted) setMusicMuted(false);
  else audio.play().catch(() => {});
  setTrackButtonState(id, true);
  updateNowPlayingLabel((WM_TRACKS[id] && WM_TRACKS[id].title) || 'Ambience');
  setResetButtonVisible(true);

  audio.onended = () => revertToDefaultTrack(audio);
}

// Public entry point for the topbar's "return to default track" button —
// resetToDefaultTrack() (no args, reads #bg-music itself) vs.
// revertToDefaultTrack(audio) (internal, called with the element already
// in hand by toggleLocationTrack/the 'ended' handler).
function resetToDefaultTrack() {
  const audio = document.getElementById('bg-music');
  if (!audio || currentTrackId === null) return; // nothing to return from
  revertToDefaultTrack(audio);
}

function setResetButtonVisible(visible) {
  const btn = document.getElementById('music-reset-btn');
  if (btn) btn.classList.toggle('visible', visible);
}

function revertToDefaultTrack(audio) {
  const finishedId = currentTrackId;
  currentTrackId = null;
  audio.onended = null;
  if (finishedId) setTrackButtonState(finishedId, false);
  updateNowPlayingLabel(DEFAULT_TRACK_TITLE);
  setResetButtonVisible(false);
  audio.loop = true;
  audio.src = DEFAULT_TRACK_SRC;
  audio.currentTime = 0;
  if (!musicMuted) audio.play().catch(() => {});
}

// ── Per-location scene images ──────────────────────────────────────
// WM_SCENES (data/descriptions.json) maps a Wickermoor id to an array of
// image paths — some ids have several (e.g. wm_grinning_sinner has three).
// All of an id's images render together, in order — no gallery/carousel,
// since each will eventually sit next to the specific bit of lore it
// illustrates once that's wired up, rather than being cycled through
// generically at the top of the panel. Shown only once the id is unlocked
// (same gate as the track player and Revealed Lore), same as the panel
// title — real artwork of, say, the Horned King would give away exactly
// who's behind the "???" even without the name being shown. Ids with no
// images, or that are still locked, show nothing here at all — no
// "coming soon" placeholder — rather than implying art is pending for
// every one of the 25 locations/beings.
function imageFrameHtml(src, alt) {
  return `<div class="panel-image-frame"><img src="${src}" alt="${alt}" class="panel-image"></div>`;
}

// Strips the folder and extension off an image path so a token can name
// an image by something short and readable instead of by position —
// "scenes/SCENE_Chapter11_Wickermoor_Village.jpeg" is referenced as
// "[[SCENE_Chapter11_Wickermoor_Village]]", "chapter-art/Drowned
// Crossroads.jpg" as "[[Drowned Crossroads]]".
function imageBasename(path) {
  return path.split('/').pop().replace(/\.[^./]+$/, '');
}

// Lets an entry's own prose (WM_LORE in data/descriptions.json) decide
// exactly where one of its images sits — between which paragraphs —
// rather than every image for an id always bunching up in one block at
// the top of the panel. Write "[[<filename, no folder or extension>]]"
// anywhere inside a `default`/`byGroup` string, naming any image already
// listed for that id in WM_SCENES or WM_PORTRAITS (searched together, so
// one token syntax covers both — no need to say which kind it is). A name
// that doesn't match anything renders a visible inline warning instead of
// silently vanishing, so a typo shows up immediately while authoring
// rather than just quietly not showing an image.
//
// Any image a text doesn't reference by name at all — including, for
// now, every one of the 25 entries written before this existed — is
// returned as `leftover`, so the caller can still show it, just falling
// back to the old top-of-panel block for whatever's unclaimed.
// Every [[name]] token used in a *different* byGroup variant of this same
// id than the one currently being rendered (`html`) — deliberately not
// counting `default`, since default is the shared/baseline text and its
// images are meant to still fall back to the top-of-panel block for a
// group whose own text doesn't mention them (a group's byGroup text
// replaces default entirely once it has real content, so an image only
// ever placed in default would otherwise never be reachable at all for
// that group). Only a *group-specific* story beat — one placed only in
// group 1's own text, say — should stay hidden from group 2/3.
function otherGroupClaimedImageNames(id, html) {
  const entry = WM_LORE[id];
  const names = new Set();
  if (!entry || !entry.byGroup) return names;
  const re = /\[\[([^\]]+)\]\]/g;
  Object.values(entry.byGroup).forEach(t => {
    if (!t || t === html) return;
    let m;
    while ((m = re.exec(t))) names.add(m[1].trim());
  });
  return names;
}

function interleaveImages(html, id) {
  const images = [...(WM_SCENES[id] || []), ...(WM_PORTRAITS[id] || [])];
  const used = new Set();

  const out = html.replace(/\[\[([^\]]+)\]\]/g, (match, rawName) => {
    const name = rawName.trim();
    const idx = images.findIndex((src, i) => !used.has(i) && imageBasename(src) === name);
    if (idx === -1) {
      return `<span style="color:#c0392b; font-style:italic;">[[missing image: ${name}]]</span>`;
    }
    used.add(idx);
    return imageFrameHtml(images[idx], '');
  });

  // Only images claimed by a *different group's* own text stay hidden —
  // everything else nobody's placed (or that only default places) still
  // falls back to the old top-of-panel block.
  const excluded = otherGroupClaimedImageNames(id, html);
  const leftover = images.filter((src, i) => !used.has(i) && !excluded.has(imageBasename(src)));

  return { html: out, leftover };
}

// The six former heroes whose fall gave the Horned King his power (see
// their WM_LORE entries) — collectively "the Fallen" in the source
// material. Horned King and Crooked Queen are deliberately not included:
// they're a different tier of antagonist, and the "portrait always leads"
// rule below is specific to the Fallen.
const FALLEN_IDS = [
  'wm_beast_of_blight', 'wm_weeping_widow', 'wm_chained_reaper',
  'wm_grinning_sinner', 'wm_harvest_terror', 'wm_crimson_abbot',
];

function buildWMContent(id, label) {
  // Every being uses the same generic "not yet told" teaser (see the
  // locked branches below) rather than individual bespoke flavor text —
  // Horned King and Crooked Queen previously had their own, but that read
  // oddly once unlocked, sitting above their actual revealed lore.
  const beings = {
    'wm_horned_king':     { name: 'The Horned King' },
    'wm_crooked_queen':   { name: 'The Crooked Queen' },
    'wm_beast_of_blight': { name: 'The Beast of Blight' },
    'wm_weeping_widow':   { name: 'The Weeping Widow' },
    'wm_chained_reaper':  { name: 'The Chained Reaper' },
    'wm_grinning_sinner': { name: 'The Grinning Sinner' },
    'wm_harvest_terror':  { name: 'The Harvest Terror' },
    'wm_crimson_abbot':   { name: 'The Crimson Abbot' },
  };

  const isBeing = beings[id];

  // The panel title itself stays a mystery until this id's lore is actually
  // unlocked for the visitor's recognized group — consistent with the
  // hotspot hover tooltip (see buildSvgHotspots), so identity isn't given
  // away just by clicking in.
  const locked = !isUnlockedForGroup(id, getRecognizedGroup());

  // buildPasswordSection resolves the lore text and (while unlocked)
  // substitutes any [[image name]] tokens in it — whatever's left
  // unclaimed comes back as `leftover` so it can still render, just in
  // the old top-of-panel block below.
  const passwordSection = buildPasswordSection(id);
  let topImages = passwordSection.leftover;

  // The Fallen's own NPC portrait always leads the top-of-panel block,
  // regardless of what else is leftover. This is deliberately *not* done
  // by placing a [[portrait]] token in the lore text: which text variant
  // is showing (default vs. a specific group's) varies per visitor, so a
  // token embedded in only one of those wouldn't reliably put the
  // portrait first — or even show it at all — for everyone else.
  if (!locked && FALLEN_IDS.includes(id) && WM_PORTRAITS[id] && WM_PORTRAITS[id][0]) {
    const portrait = WM_PORTRAITS[id][0];
    topImages = [portrait, ...topImages.filter(src => src !== portrait)];
  }

  const topImagesHtml = topImages
    .map(src => imageFrameHtml(src, locked ? '???' : (isBeing ? isBeing.name : label)))
    .join('');

  if (isBeing) {
    const displayName = locked ? '???' : isBeing.name;
    // Only shown while locked — once unlocked, the "Revealed Lore" section
    // below already tells their story, so a "not yet told" teaser sitting
    // right above it would contradict itself.
    const flavorHtml = locked
      ? `<p class="panel-body" style="font-style:italic; opacity:0.7;">Its story is not yet told. In time you will learn the truth.</p>`
      : '';
    return `
      <div class="panel-eyebrow">Wickermoor Hollow</div>
      <div class="panel-title">${displayName}</div>
      ${topImagesHtml}
      <div class="panel-divider"></div>
      ${locked ? '' : trackButtonHtml(id)}
      ${flavorHtml}
      ${passwordSection.html}
    `;
  }

  // Location — same reasoning as the being teaser above: only shown while
  // locked, since it would otherwise contradict the revealed lore beneath it.
  const displayLabel = locked ? '???' : label;
  const teaserHtml = locked
    ? `<p class="panel-body" style="font-style:italic; opacity:0.65;">The roads of Wickermoor Hollow do not give up their secrets easily. Explore the land to uncover its lore.</p>`
    : '';
  return `
    <div class="panel-eyebrow">Wickermoor Hollow</div>
    <div class="panel-title">${displayLabel}</div>
    ${topImagesHtml}
    <div class="panel-divider"></div>
    ${locked ? '' : trackButtonHtml(id)}
    ${teaserHtml}
    ${passwordSection.html}
  `;
}

// ── Group-based unlocking ─────────────────────────────────────────
// Instead of one unique password per region, each region already explored
// in play is tagged (in UNLOCKS, from data/descriptions.json) with which of
// the campaign's groups found it — "all" for content every group can see
// (the provinces), or a list of group ids. Typing any of a group's
// character names (GROUPS) into any lock recognizes this visitor as
// belonging to that group; recognition is remembered (localStorage) and
// immediately unlocks everything tagged to that group across the whole
// site, not just the one lock they typed into.
const RECOGNIZED_GROUP_STORAGE_KEY = 'druskenvald_recognized_group';
const RECOGNIZED_NAME_STORAGE_KEY = 'druskenvald_recognized_name';

// name (lowercased) -> group id, built once from GROUPS.
const NAME_TO_GROUP = {};
Object.entries(GROUPS).forEach(([groupId, names]) => {
  names.forEach(name => { NAME_TO_GROUP[name.toLowerCase()] = groupId; });
});

function getRecognizedGroup() {
  return store.get(RECOGNIZED_GROUP_STORAGE_KEY);
}

// The specific character name last used to unlock something, lowercased.
// Not used to gate access (that's still group-based, see isUnlockedForGroup)
// — kept only so revealedLoreHtml can pick a per-character variant once
// WM_LORE entries start defining a `byCharacter` map.
function getRecognizedName() {
  return store.get(RECOGNIZED_NAME_STORAGE_KEY);
}

// GM/admin backdoor — deliberately not a character name (so it can never
// collide with GROUPS) and not one of the site's own mystery reveals (see
// the "why not Kehlenn/Horned King/Rowan" discussion this came out of):
// unlocks every Wickermoor id at once regardless of UNLOCKS, without
// needing to belong to a specific party's group. Scoped to "wm_" ids only
// in isUnlockedForGroup below — main-map provinces don't have anything to
// bypass (their UNLOCKS rule is already "all").
const ADMIN_PASSWORD = 'vermintoll';
const ADMIN_UNLOCKED_STORAGE_KEY = 'druskenvald_admin_unlocked';

function isAdminUnlocked() {
  return store.get(ADMIN_UNLOCKED_STORAGE_KEY) === 'true';
}

// Single place that writes recognition state, so entering a new
// name/password always fully replaces whatever was recognized before
// rather than layering on top of it. Without this, admin recognition in
// particular was "sticky": isUnlockedForGroup checks isAdminUnlocked()
// first, so once it was set, typing a regular character name afterward
// (to check what a lower-access group actually sees) set the new group
// but never cleared the old admin flag — admin access silently persisted
// underneath it, making every group look like it could see everything.
function setRecognizedIdentity({ admin = false, groupId = null, name = null } = {}) {
  store.set(ADMIN_UNLOCKED_STORAGE_KEY, String(admin));
  if (groupId) {
    store.set(RECOGNIZED_GROUP_STORAGE_KEY, groupId);
    store.set(RECOGNIZED_NAME_STORAGE_KEY, name);
  } else {
    store.remove(RECOGNIZED_GROUP_STORAGE_KEY);
    store.remove(RECOGNIZED_NAME_STORAGE_KEY);
  }
}

function isUnlockedForGroup(id, groupId) {
  if (isAdminUnlocked() && id.startsWith('wm_')) return true;
  if (!groupId) return false;
  const rule = UNLOCKS[id];
  if (!rule) return false;
  return rule === 'all' || rule.includes(groupId);
}

// Real lore for a region (WM_LORE[id], from data/descriptions.json) is
// shown once unlocked; anything not written yet falls back to the original
// placeholder, so adding lore for one location doesn't require touching
// this function again.
//
// WM_LORE[id] is either a plain HTML string (shown to everyone, no
// variants) or an object shaped like:
//   { default: "<p>...</p>", byGroup: { "1": "<p>...</p>" }, byCharacter: { "sylas": "<p>...</p>" } }
// Resolution picks the most specific match available: an exact character
// name first, then the visitor's group, then the entry's own default.
// True once `html` has actual text in it, not just empty markup — e.g.
// `<p class="panel-body"></p>` (an unwritten byGroup/byCharacter
// placeholder someone's prepared to fill in later) strips down to nothing
// and doesn't count. Without this, an empty-but-present override would
// still beat `default` below, showing visitors a blank paragraph instead
// of the general story every group can already see.
function hasMeaningfulContent(html) {
  return !!(html && html.replace(/<[^>]*>/g, '').trim().length > 0);
}

function revealedLoreHtml(id, groupId, characterName) {
  const entry = WM_LORE[id];
  if (!entry) {
    return `<p class="panel-body" style="font-style:italic; opacity:0.5;">Content will appear here when added by the GM.</p>`;
  }
  if (typeof entry === 'string') return entry;

  if (characterName && entry.byCharacter && hasMeaningfulContent(entry.byCharacter[characterName])) {
    return entry.byCharacter[characterName];
  }
  if (groupId && entry.byGroup && hasMeaningfulContent(entry.byGroup[groupId])) {
    return entry.byGroup[groupId];
  }
  return entry.default || `<p class="panel-body" style="font-style:italic; opacity:0.5;">Content will appear here when added by the GM.</p>`;
}

// Returns { html, leftover } rather than a plain string — buildWMContent
// needs to know which images (if any) still need showing in the old
// top-of-panel block, once whatever [[image name]] tokens are in the
// resolved lore text (see interleaveImages) have claimed theirs.
function buildPasswordSection(id) {
  const recognizedGroup = getRecognizedGroup();
  const recognizedName = getRecognizedName();

  if (isUnlockedForGroup(id, recognizedGroup)) {
    const { html: loreHtml, leftover } =
      interleaveImages(revealedLoreHtml(id, recognizedGroup, recognizedName), id);
    return {
      html: `
        <div class="locked-content unlocked">
          <div class="panel-section-title">Revealed Lore</div>
          ${loreHtml}
        </div>
      `,
      leftover,
    };
  }
  // Still locked — no images shown anywhere yet (top block or embedded),
  // so no need to run interleaveImages here; the raw text just sits
  // hidden in #locked-${id} until checkPassword's full panel rebuild
  // re-renders everything under the new, unlocked state.
  return {
    html: `
      <div class="password-section">
        <div class="password-label">Restricted Lore</div>
        <p class="password-flavor">Some knowledge must be found, not given. If your party has explored this place, enter one of your characters' names below.</p>
        <div class="password-input-row">
          <input type="text" class="password-input" id="pw-${id}" placeholder="Enter a character's name…" onkeydown="if(event.key==='Enter') checkPassword('${id}')">
          <button class="password-btn" onclick="checkPassword('${id}')">Unlock</button>
        </div>
        <div class="password-error" id="pw-err-${id}"></div>
      </div>
      <div class="locked-content" id="locked-${id}">
        <div class="panel-section-title">Revealed Lore</div>
        ${revealedLoreHtml(id, recognizedGroup, recognizedName)}
      </div>
    `,
    leftover: [],
  };
}

function checkPassword(id) {
  const input = document.getElementById('pw-' + id);
  const err = document.getElementById('pw-err-' + id);

  const entered = input.value.trim().toLowerCase();

  if (entered === ADMIN_PASSWORD) {
    setRecognizedIdentity({ admin: true });
  } else if (NAME_TO_GROUP[entered]) {
    // The name is a real character, so we now know (and remember) which
    // group this visitor is — even if this particular region isn't
    // unlocked for that group yet.
    setRecognizedIdentity({ groupId: NAME_TO_GROUP[entered], name: entered });
  } else {
    err.textContent = "That name isn't recognized here.";
    err.classList.add('show');
    input.value = '';
    input.focus(); // re-prompt: return the cursor to the now-empty input so it's clear they should try again
    return;
  }

  if (isUnlockedForGroup(id, getRecognizedGroup())) {
    // Rebuild the whole panel from scratch rather than just patching the
    // lore text in place — the panel was first rendered under the old
    // (locked) state, so its title is still "???" and its scene
    // images/portraits/track player (all gated the same way as the lore
    // text, see buildWMContent/interleaveImages/trackButtonHtml) are
    // still hidden. A full re-render is the only way all of those pick up
    // the new unlock state together, instead of only the text updating
    // while everything else stays stuck showing "still locked".
    if (currentOpenPanelId) openPanel(currentOpenPanelId, currentOpenPanelLabel);
  } else {
    err.textContent = "Your party hasn't explored this yet.";
    err.classList.add('show');
    input.value = '';
  }
}

// Global "re-enter a character's name" widget in the topbar (see
// template.html) — the per-location password boxes above only ever come
// up contextually, inside a locked panel; this lets a visitor switch
// which character they're recognized as (or recognize themselves for the
// first time) from anywhere, not just while looking at a specific locked
// region.
function toggleReenterNamePrompt() {
  const prompt = document.getElementById('reenter-name-prompt');
  if (!prompt) return;
  const opening = !prompt.classList.contains('open');
  prompt.classList.toggle('open', opening);
  if (opening) document.getElementById('reenter-name-input').focus();
}

function submitReenterName() {
  const input = document.getElementById('reenter-name-input');
  const err = document.getElementById('reenter-name-error');

  const entered = input.value.trim().toLowerCase();

  if (entered === ADMIN_PASSWORD) {
    setRecognizedIdentity({ admin: true });
  } else if (NAME_TO_GROUP[entered]) {
    setRecognizedIdentity({ groupId: NAME_TO_GROUP[entered], name: entered });
  } else {
    err.textContent = "That name isn't recognized here.";
    err.classList.add('show');
    input.value = '';
    input.focus();
    return;
  }

  err.classList.remove('show');
  input.value = '';
  document.getElementById('reenter-name-prompt').classList.remove('open');

  // Whatever panel is currently open (if any) was rendered under the old
  // recognition, so its title/lore/track player/images may all be stale
  // — rebuild it against the newly recognized group rather than leaving
  // it showing the previous visitor's view until manually reopened.
  if (currentOpenPanelId) openPanel(currentOpenPanelId, currentOpenPanelLabel);
}

// Escape unwinds one layer at a time: a secondary (species/NPC) panel sits
// on top of the main lore panel, so it closes first; then the topbar's name
// prompt if it's open; then the lore panel itself.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const isOpen = id => document.getElementById(id)?.classList.contains('open');
  if (isOpen('npc-panel')) {
    closeNpcPanel();
  } else if (isOpen('species-panel')) {
    closeSpeciesPanel();
  } else if (isOpen('reenter-name-prompt')) {
    document.getElementById('reenter-name-prompt').classList.remove('open');
  } else {
    closePanel();
  }
});
