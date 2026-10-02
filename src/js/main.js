// Entry point and page-wide listeners: entering from the title screen,
// clicks/keys on lore links, keyboard shortcuts, and Escape handling.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

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
    restoreLightMode();
    updateIdentityUi();
    // Arriving through a shared link (e.g. #wickermoor/wm_crimson) goes
    // straight there; from here on the address follows what's on screen.
    applyRoute();
    routerReady = true;
  }, 800);
}

function buildHotspots() {
  setupCanvasSizes();
  buildSvgHotspots('main', 'hotspots-main-svg', MAIN_HOTSPOTS_SVG);
  buildSvgHotspots('wickermoor', 'hotspots-wickermoor-svg', WICKERMOOR_HOTSPOTS);
  startLightingAnimation();
  initZoomPan();
  setupHotspotDisarm();
  refreshHotspots();
}

// Species/NPC mentions inside lore text are plain markup carrying
// data-species / data-npc (written by hand, or expanded by build.js from
// the {{species:id}} / {{npc:id}} shorthand) rather than inline onclick
// handlers — one delegated listener here opens the matching panel, by
// click or, since the links are focusable, by Enter/Space.
function openLoreLink(el) {
  if (el.dataset.npc) openNpcPanel(el.dataset.npc);
  else if (el.dataset.species) openSpeciesPanel(el.dataset.species);
}

document.addEventListener('click', e => {
  const link = e.target.closest('[data-npc], [data-species]');
  if (link) openLoreLink(link);
});

document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const link = e.target.closest?.('[data-npc], [data-species]');
  if (!link) return;
  e.preventDefault(); // Space would otherwise scroll the panel
  openLoreLink(link);
});

// Escape unwinds one layer at a time: a secondary (species/NPC) panel sits
// on top of the main lore panel, so it closes first; then the topbar's
// popovers (search, name prompt) if open, returning focus to their button;
// then the lore panel itself.
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const isOpen = id => document.getElementById(id)?.classList.contains('open');
  if (isOpen('npc-panel')) {
    closeNpcPanel();
  } else if (isOpen('species-panel')) {
    closeSpeciesPanel();
  } else if (isOpen('index-popover')) {
    closeIndex();
    document.getElementById('index-btn')?.focus();
  } else if (isOpen('reenter-name-prompt')) {
    closeReenterNamePrompt();
    document.getElementById('reenter-name-btn')?.focus();
  } else {
    closePanel();
  }
});

// "/" opens the search index from anywhere on the map (not while typing,
// and not while a panel is covering the topbar).
document.addEventListener('keydown', e => {
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
  if (!document.getElementById('app')?.classList.contains('visible')) return;
  if (document.getElementById('topbar')?.inert) return;
  e.preventDefault();
  if (!isIndexOpen()) toggleIndex();
});

// Clicking/tapping outside a topbar popover closes it.
document.addEventListener('pointerdown', e => {
  if (isIndexOpen() && !e.target.closest('#index-widget')) closeIndex();
  if (document.getElementById('reenter-name-prompt')?.classList.contains('open') && !e.target.closest('#reenter-name-widget')) {
    closeReenterNamePrompt();
  }
});
