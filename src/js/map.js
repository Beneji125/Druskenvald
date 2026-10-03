// Map interaction: clickable SVG hotspots, zoom & pan (mouse wheel,
// drag, pinch), and switching between the main map and Wickermoor Hollow.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

// Every hotspot path built, so their labels/markers can be refreshed when
// the visitor's recognized group changes (see refreshHotspots).
const hotspotEls = [];

// Touch screens have no hover, so the first tap on a hotspot "arms" it —
// showing its name and revealing its shape, like hovering does — and a
// second tap on the same hotspot opens it. Tapping elsewhere disarms.
let armedHotspot = null;

// Wickermoor hotspots are individually gated per group (see
// isUnlockedForGroup); a visitor whose group hasn't explored a
// location/being yet shouldn't get its identity for free by hovering,
// focusing or tapping it. Province hotspots (UNLOCKS rule "all") always
// show their name.
function hotspotLabel(layerKey, hs) {
  const locked = layerKey === 'wickermoor' && !isUnlockedForGroup(hs.id, getRecognizedGroup());
  return locked ? '???' : hs.label;
}

function showTooltip(text, x, y) {
  const tooltip = document.getElementById('svg-tooltip');
  tooltip.textContent = text;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
  tooltip.classList.add('show');
}

function hideTooltip() {
  document.getElementById('svg-tooltip').classList.remove('show');
}

// Tooltip anchored at a hotspot's on-screen centre — used for keyboard
// focus and touch, where there's no cursor position to follow.
function showTooltipForPath(path, text) {
  const r = path.getBoundingClientRect();
  showTooltip(text, r.left + r.width / 2, r.top + r.height / 2);
}

function activateHotspot(layerKey, hs) {
  armedHotspot = null;
  hideTooltip();
  if (hs.isWickermoor) {
    openWickermoor();
  } else {
    openPanel(hs.id, hs.label);
  }
}

function buildSvgHotspots(layerKey, svgId, hotspots) {
  const svg = document.getElementById(svgId);
  const ns = 'http://www.w3.org/2000/svg';

  hotspots.forEach(hs => {
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', hs.d);
    path.setAttribute('class', 'hotspot-poly');
    // Focusable and announced as a button, so the map can be explored with
    // Tab + Enter (aria-label is filled in by refreshHotspots).
    path.setAttribute('tabindex', '0');
    path.setAttribute('role', 'button');
    let lastPointerType = 'mouse';

    path.addEventListener('pointerdown', (e) => { lastPointerType = e.pointerType; });
    path.addEventListener('mousemove', (e) => {
      showTooltip(hotspotLabel(layerKey, hs), e.clientX, e.clientY);
    });
    path.addEventListener('mouseenter', () => {
      showProvinceReveal(layerKey, hs.d);
    });
    path.addEventListener('mouseleave', () => {
      if (armedHotspot === path) return; // a touch-armed hotspot stays lit until disarmed
      hideTooltip();
      hideProvinceReveal(layerKey);
    });
    path.addEventListener('focus', () => {
      // Only for keyboard focus — a mouse click also focuses the path, but
      // then the tooltip should keep following the cursor instead.
      if (!path.matches(':focus-visible')) return;
      showProvinceReveal(layerKey, hs.d);
      showTooltipForPath(path, hotspotLabel(layerKey, hs));
    });
    path.addEventListener('blur', () => {
      if (armedHotspot === path) return;
      hideTooltip();
      hideProvinceReveal(layerKey);
    });
    path.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      activateHotspot(layerKey, hs);
    });
    path.addEventListener('click', () => {
      if (justPanned) return;
      if (lastPointerType === 'touch' && armedHotspot !== path) {
        armedHotspot = path;
        showProvinceReveal(layerKey, hs.d);
        showTooltipForPath(path, hotspotLabel(layerKey, hs));
        return;
      }
      activateHotspot(layerKey, hs);
    });

    svg.appendChild(path);
    hotspotEls.push({ layerKey, hs, path });
  });
}

// Disarms a touch-armed hotspot when a tap lands anywhere else on the map.
function setupHotspotDisarm() {
  const wrapper = document.getElementById('map-wrapper');
  if (!wrapper) return;
  wrapper.addEventListener('pointerdown', (e) => {
    if (!armedHotspot || e.target === armedHotspot) return;
    armedHotspot = null;
    hideTooltip();
    hideProvinceReveal(getActiveMapKey());
  });
}

// Re-labels every hotspot for the current recognition state (a locked
// Wickermoor location is announced as "Unknown location", not its name)
// and flags any with lore the visitor hasn't read yet (see isNewLore).
//
// The pulsing "new" outlines are copies drawn into a separate overlay <svg>
// per map (newLoreOverlay), and it's that whole overlay whose opacity
// pulses. Animating the hotspot paths themselves forced the browser to
// repaint the entire full-size map graphic on every animation frame; fading
// one overlay layer is handled by the GPU without repainting anything.
function refreshHotspots() {
  const newPaths = { main: [], wickermoor: [] };
  hotspotEls.forEach(({ layerKey, hs, path }) => {
    const label = hotspotLabel(layerKey, hs);
    path.setAttribute('aria-label', label === '???' ? 'Unknown location' : label);
    const isNew = hs.isWickermoor ? anyNewWickermoorLore() : isNewLore(hs.id);
    path.classList.toggle('is-new', isNew); // marker only; drawn by the overlay
    if (isNew) newPaths[layerKey].push(hs.d);
  });
  Object.entries(newPaths).forEach(([layerKey, ds]) => {
    const overlay = newLoreOverlay(layerKey);
    if (!overlay) return;
    overlay.replaceChildren(...ds.map(d => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', d);
      p.setAttribute('class', 'new-lore-outline');
      return p;
    }));
    overlay.classList.toggle('has-new', ds.length > 0);
  });
}

// The overlay for a map layer, created on first use just beneath that
// layer's clickable hotspot <svg> (same viewBox, so the outlines line up;
// pointer-events off, so clicks still reach the hotspots).
function newLoreOverlay(layerKey) {
  const id = `new-lore-${layerKey}`;
  let overlay = document.getElementById(id);
  if (overlay) return overlay;
  const hotspotSvg = document.getElementById(layerKey === 'wickermoor' ? 'hotspots-wickermoor-svg' : 'hotspots-main-svg');
  if (!hotspotSvg) return null;
  overlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  overlay.id = id;
  overlay.setAttribute('class', 'hotspot-svg new-lore-overlay');
  overlay.setAttribute('viewBox', hotspotSvg.getAttribute('viewBox'));
  overlay.setAttribute('preserveAspectRatio', hotspotSvg.getAttribute('preserveAspectRatio'));
  overlay.setAttribute('aria-hidden', 'true');
  hotspotSvg.before(overlay);
  return overlay;
}

// ── Zoom & pan ─────────────────────────────────────────────────
// A single CSS transform (translate + scale) on each map layer's
// .zoom-layer wrapper handles zoom/pan for everything inside it (image,
// canvases, SVG hotspots) together, so their existing alignment and the
// browser's native hit-testing on the SVG paths keep working with no
// coordinate-math changes anywhere else.
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

function getActiveMapKey() {
  const wm = document.getElementById('layer-wickermoor');
  return (wm && !wm.classList.contains('hidden')) ? 'wickermoor' : 'main';
}

function getZoomLayerEl(key) {
  return document.getElementById(key === 'wickermoor' ? 'zoom-layer-wickermoor' : 'zoom-layer-main');
}

// Where the map art itself sits at zoom 1: the zoom layer fills the whole
// viewport and the image is "contain"-fitted inside it, so on a screen
// whose shape doesn't match the map's there's empty space on two sides.
function mapFitBox(key) {
  const wrapper = document.getElementById('map-wrapper');
  const W = wrapper.clientWidth, H = wrapper.clientHeight;
  const { CW, CH } = MAP_LAYERS[key];
  const fit = Math.min(W / CW, H / CH);
  const mw = CW * fit, mh = CH * fit;
  return { W, H, mw, mh, offX: (W - mw) / 2, offY: (H - mh) / 2 };
}

// Keeps the map art itself (not the empty space around it) in view: along
// an axis where the zoomed map is narrower than the screen it's centred;
// where it's wider, it can be dragged no further than its own edges.
function clampAxis(t, scale, view, size, offset) {
  const shown = size * scale;
  if (shown <= view) return (view - shown) / 2 - offset * scale;
  return clampNum(t, view - shown - offset * scale, -offset * scale);
}

function clampPan(key) {
  const wrapper = document.getElementById('map-wrapper');
  if (!wrapper) return;
  const state = zoomState[key];
  const b = mapFitBox(key);
  state.tx = clampAxis(state.tx, state.scale, b.W, b.mw, b.offX);
  state.ty = clampAxis(state.ty, state.scale, b.H, b.mh, b.offY);
}

// The "home" view a map opens at (and ⟲ returns to). Normally the whole
// map. On a portrait phone that would leave the map a thin strip with most
// of the screen empty, so it opens zoomed to fill the screen's height
// instead — swipe sideways to explore, pinch out to see all of it.
function homeScale(key) {
  const b = mapFitBox(key);
  const portraitPhone = b.H > b.W && window.matchMedia('(max-width: 760px)').matches;
  const cover = Math.max(b.W / b.mw, b.H / b.mh);
  return portraitPhone && cover > 1.25 ? Math.min(cover, ZOOM_MAX) : 1;
}

function applyZoomTransform(key) {
  const el = getZoomLayerEl(key);
  if (!el) return;
  const { scale, tx, ty } = zoomState[key];
  el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

// Back to the home view, centred. `atHome` lets a rotation or resize
// re-fit a map the visitor hasn't moved, without undoing one they have.
function resetZoomState(key) {
  const wrapper = document.getElementById('map-wrapper');
  if (!wrapper || !wrapper.clientWidth) {
    zoomState[key] = { scale: 1, tx: 0, ty: 0, atHome: true };
    applyZoomTransform(key);
    return;
  }
  const b = mapFitBox(key);
  const scale = homeScale(key);
  zoomState[key] = {
    scale,
    tx: (b.W - b.mw * scale) / 2 - b.offX * scale,
    ty: (b.H - b.mh * scale) / 2 - b.offY * scale,
    atHome: true,
  };
  clampPan(key);
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
  state.atHome = false;

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
  resetZoomState('main');
  resetZoomState('wickermoor');

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
      state.atHome = false;
      clampPan(key);
      applyZoomTransform(key);
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  });

  // Double-tap on an empty part of the map (not a location) zooms in 2x
  // around that spot, or back to the home view once fully zoomed in.
  let lastTap = null;
  function handleTap(e) {
    if (e.pointerType !== 'touch' || e.target.closest?.('.hotspot-poly')) { lastTap = null; return; }
    const now = performance.now();
    if (lastTap && now - lastTap.time < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30) {
      lastTap = null;
      const key = getActiveMapKey();
      if (zoomState[key].scale >= ZOOM_MAX * 0.95) {
        resetZoomState(key);
      } else {
        const rect = wrapper.getBoundingClientRect();
        zoomAtPoint(key, 2, e.clientX - rect.left, e.clientY - rect.top);
      }
      return;
    }
    lastTap = { time: now, x: e.clientX, y: e.clientY };
  }

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    if (pointers.size === 1 && !gestureMoved && e.type === 'pointerup') handleTap(e);
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
    ['main', 'wickermoor'].forEach(key => {
      if (zoomState[key].atHome) {
        resetZoomState(key);
      } else {
        clampPan(key);
        applyZoomTransform(key);
      }
    });
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
  armedHotspot = null;
  hideTooltip();
  // Keyboard focus was on the main map's (now hidden) Wickermoor hotspot —
  // move it to the "Return" button, from which Tab continues into the
  // hollow's own hotspots.
  const focusWasOnMap = !!document.activeElement?.closest?.('#layer-main');
  closePanel();
  if (focusWasOnMap) document.getElementById('back-btn')?.focus({ preventScroll: true });
}

function returnToMain() {
  document.getElementById('layer-wickermoor').classList.add('hidden');
  document.getElementById('layer-main').classList.remove('hidden');
  document.getElementById('back-btn').classList.remove('visible');
  document.getElementById('breadcrumb-text').textContent = 'The Thirteen Provinces';
  resetZoomState('main');
  resetZoomState('wickermoor');
  armedHotspot = null;
  hideTooltip();
  closePanel();
  // Coming back from the hollow, land keyboard focus on its hotspot again.
  if (document.activeElement === document.getElementById('back-btn') || document.activeElement === document.body) {
    hotspotEls.find(h => h.layerKey === 'main' && h.hs.isWickermoor)?.path.focus({ preventScroll: true });
  }
}
