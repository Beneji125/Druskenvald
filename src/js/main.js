// Entry point and page-wide listeners: entering from the title screen,
// clicks/keys on lore links, and Escape handling.
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
  }, 800);
}

function buildHotspots() {
  setupCanvasSizes();
  buildSvgHotspots('main', 'hotspots-main-svg', MAIN_HOTSPOTS_SVG);
  buildSvgHotspots('wickermoor', 'hotspots-wickermoor-svg', WICKERMOOR_HOTSPOTS);
  startLightingAnimation();
  initZoomPan();
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
