// Shareable links: the address bar mirrors what's on screen, so any page
// can be bookmarked or sent to another player, and the browser's Back
// button steps back out of panels and maps.
//
//   (no hash)                 the main map
//   #ardengloom               the main map with a province's panel open
//   #wickermoor               the Wickermoor Hollow map
//   #wickermoor/wm_crimson    Wickermoor with a location's panel open
//   #codex/bestiary           the Codex, on a tab (bestiary, gallery,
//                             chronicle) — over whichever map was showing
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

// What the address should be right now: an open lore panel wins, then
// the Codex, then just the map.
function currentRouteHash() {
  if (!currentOpenPanelId && isCodexOpen()) return `#codex/${codexTab}`;
  return routeHash(getActiveMapKey(), currentOpenPanelId);
}

// Called after anything that changes the map, open panel or Codex.
// `replace` updates the current history entry instead of adding one.
function syncUrl({ replace = false } = {}) {
  if (!routerReady || applyingRoute) return;
  const target = currentRouteHash();
  if (target === location.hash) return;
  if (replace) {
    history.replaceState(history.state, '', target || location.pathname + location.search);
    return;
  }

  // Closing a panel that was opened on top of this exact page: step back
  // through history instead of piling up a new entry, so Back afterwards
  // leaves the page rather than re-opening the panel just closed.
  const state = history.state;
  if (state && state.openedFrom !== undefined && state.openedFrom === target) {
    history.back();
    return;
  }
  const newState = (currentOpenPanelId || isCodexOpen()) ? { openedFrom: location.hash } : {};
  history.pushState(newState, '', target || location.pathname + location.search);
}

function parseRoute(hash) {
  const raw = decodeURIComponent(hash.replace(/^#/, ''));
  if (raw === 'codex' || raw.startsWith('codex/')) return { codexTab: raw.split('/')[1] || 'bestiary' };
  if (raw === 'wickermoor') return { mapKey: 'wickermoor', panelId: null };
  if (raw.startsWith('wickermoor/')) return { mapKey: 'wickermoor', panelId: raw.slice('wickermoor/'.length) };
  return { mapKey: 'main', panelId: raw || null };
}

// Brings the UI in line with the current address (on entering the site,
// and on Back/Forward). Unknown ids are ignored and the address tidied up.
function applyRoute() {
  const route = parseRoute(location.hash);
  if (route.codexTab) {
    applyingRoute = true;
    try {
      if (currentOpenPanelId) closePanel();
      if (!isCodexOpen()) openCodex(route.codexTab);
      else if (codexTab !== route.codexTab) showCodexTab(route.codexTab);
    } finally {
      applyingRoute = false;
    }
    if (currentRouteHash() !== location.hash) history.replaceState(history.state, '', currentRouteHash());
    return;
  }

  const { mapKey, panelId } = route;
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
    // A plain map address means the Codex was left (a panel address may
    // sit on top of it — e.g. a Chronicle entry being read).
    if (!hs && isCodexOpen()) closeCodex();
  } finally {
    applyingRoute = false;
  }

  const actual = currentRouteHash();
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
