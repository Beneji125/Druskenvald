// Shareable links: the address bar mirrors what's on screen, so any page
// can be bookmarked or sent to another player, and the browser's Back
// button steps back out of panels and maps.
//
//   (no hash)                 the main map
//   #ardengloom               the main map with a province's panel open
//   #wickermoor               the Wickermoor Hollow map
//   #wickermoor/wm_crimson    Wickermoor with a location's panel open
//
// A link to a Wickermoor location the visitor's group hasn't unlocked
// simply opens its locked "???" panel — the link itself gives nothing away.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

// Off until the visitor has entered from the title screen (see enterSite),
// and suppressed while applyRoute is itself driving the UI, so that
// responding to a URL change doesn't push yet another history entry.
let routerReady = false;
let applyingRoute = false;

function routeHash(mapKey, panelId) {
  if (mapKey === 'wickermoor') return panelId ? `#wickermoor/${panelId}` : '#wickermoor';
  return panelId ? `#${panelId}` : '';
}

// Called after anything that changes the map or open panel.
function syncUrl() {
  if (!routerReady || applyingRoute) return;
  const target = routeHash(getActiveMapKey(), currentOpenPanelId);
  if (target === location.hash) return;

  // Closing a panel that was opened on top of this exact page: step back
  // through history instead of piling up a new entry, so Back afterwards
  // leaves the page rather than re-opening the panel just closed.
  const state = history.state;
  if (state && state.openedFrom !== undefined && state.openedFrom === target) {
    history.back();
    return;
  }
  const newState = currentOpenPanelId ? { openedFrom: location.hash } : {};
  history.pushState(newState, '', target || location.pathname + location.search);
}

function parseRoute(hash) {
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  if (raw === 'wickermoor') return { mapKey: 'wickermoor', panelId: null };
  if (raw.startsWith('wickermoor/')) return { mapKey: 'wickermoor', panelId: raw.slice('wickermoor/'.length) };
  return { mapKey: 'main', panelId: raw || null };
}

// Brings the UI in line with the current address (on entering the site,
// and on Back/Forward). Unknown ids are ignored and the address tidied up.
function applyRoute() {
  const { mapKey, panelId } = parseRoute(location.hash);
  const hotspots = mapKey === 'wickermoor' ? WICKERMOOR_HOTSPOTS : MAIN_HOTSPOTS_SVG;
  const hs = panelId ? hotspots.find(h => h.id === panelId && !h.isWickermoor) : null;

  applyingRoute = true;
  try {
    if (getActiveMapKey() !== mapKey) {
      if (mapKey === 'wickermoor') openWickermoor();
      else returnToMain();
    }
    if (hs && currentOpenPanelId !== hs.id) openPanel(hs.id, hs.label);
    else if (!hs && currentOpenPanelId) closePanel();
  } finally {
    applyingRoute = false;
  }

  const actual = routeHash(getActiveMapKey(), currentOpenPanelId);
  if (actual !== location.hash) history.replaceState({}, '', actual || location.pathname + location.search);
}

window.addEventListener('popstate', () => {
  if (routerReady) applyRoute();
});

// The 🔗 button in the lore panel.
async function copyPanelLink() {
  const btn = document.getElementById('panel-link');
  try {
    await navigator.clipboard.writeText(location.href);
  } catch {
    // Clipboard access can be refused (older browsers, some privacy
    // settings) — fall back to showing the link to copy by hand.
    window.prompt('Copy this link:', location.href);
    return;
  }
  if (!btn) return;
  btn.textContent = '✓';
  btn.title = 'Link copied';
  setTimeout(() => {
    btn.textContent = '🔗';
    btn.title = 'Copy a link to this page';
  }, 1500);
}
