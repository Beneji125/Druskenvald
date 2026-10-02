// Map interaction: clickable SVG hotspots, zoom & pan (mouse wheel,
// drag, pinch), and switching between the main map and Wickermoor Hollow.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

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
