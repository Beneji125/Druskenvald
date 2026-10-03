// Lore panels: the main slide-in panel (provinces and Wickermoor
// locations/beings), the secondary species/NPC panels, and placement of
// scene images within Wickermoor lore.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

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

// Tracked so submitReenterName() (see the group-unlocking section below)
// can rebuild whatever panel is currently open after recognizing a new
// character, rather than leaving it showing stale locked/unlocked state
// until the visitor closes and reopens it themselves.
let currentOpenPanelId = null;
let currentOpenPanelLabel = null;

// ── Focus & dialog plumbing shared by all three panels ─────────────
// Where focus was before each panel opened, to hand it back on close (so a
// keyboard user returns to the hotspot/link they came from).
const panelReturnFocus = {};

function isPanelOpen(panelId) {
  return !!document.getElementById(panelId)?.classList.contains('open');
}

// Closed panels sit just off-screen rather than being removed, so they're
// made `inert` (unfocusable, hidden from screen readers) until opened; and
// whatever an open panel covers (map, topbar, a lore panel under a
// species/NPC panel) is made inert too, which is what keeps Tab inside the
// panel on top — the "modal" part of aria-modal.
const SECONDARY_PANELS = ['species', 'npc', 'creature'];

function updatePanelInertness() {
  const lore = isPanelOpen('lore-panel');
  const codex = isPanelOpen('codex');
  const secondary = SECONDARY_PANELS.some(kind => isPanelOpen(`${kind}-panel`));
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.inert = value; };
  set('lore-panel', !lore || secondary);
  set('codex', !codex || lore || secondary);
  SECONDARY_PANELS.forEach(kind => set(`${kind}-panel`, !isPanelOpen(`${kind}-panel`)));
  set('map-wrapper', lore || codex || secondary);
  set('topbar', lore || codex || secondary);
}

// Shared open/close bookkeeping: accessible name from the rendered title,
// focus moved into the panel (only on a fresh open — a re-render of an
// already-open panel, e.g. after unlocking, leaves focus alone), and
// focus restored to where it came from on close.
function afterPanelOpened(panelId, contentEl, wasOpen) {
  const panel = document.getElementById(panelId);
  // (The Codex has no .panel-title — it's named by its own heading.)
  const title = contentEl.querySelector('.panel-title')?.textContent.trim();
  if (title) panel.setAttribute('aria-label', title === '???' ? 'Unknown' : title);
  if (!wasOpen) {
    panelReturnFocus[panelId] = document.activeElement;
    updatePanelInertness();
    contentEl.focus({ preventScroll: true });
  }
}

function afterPanelClosed(panelId, wasOpen) {
  updatePanelInertness();
  if (!wasOpen) return;
  const back = panelReturnFocus[panelId];
  panelReturnFocus[panelId] = null;
  if (back && back.isConnected && typeof back.focus === 'function' && !back.closest('.hidden')) {
    back.focus({ preventScroll: true });
  }
}

function openPanel(id, label) {
  const panel = document.getElementById('lore-panel');
  const content = document.getElementById('panel-content');
  const overlay = document.getElementById('overlay');
  const wasOpen = isPanelOpen('lore-panel');

  currentOpenPanelId = id;
  currentOpenPanelLabel = label;
  content.innerHTML = buildPanelContent(id, label);
  panel.classList.add('open');
  overlay.classList.add('show');
  content.scrollTop = 0;
  afterPanelOpened('lore-panel', content, wasOpen);
  // Reading it counts as having seen this lore (see isNewLore).
  markLoreSeen(id);
  syncUrl();
}

function closePanel() {
  const wasOpen = isPanelOpen('lore-panel');
  currentOpenPanelId = null;
  currentOpenPanelLabel = null;
  document.getElementById('lore-panel').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  hideProvinceReveal(getActiveMapKey());
  closeSpeciesPanel();
  closeNpcPanel();
  closeCreaturePanel();
  afterPanelClosed('lore-panel', wasOpen);
  syncUrl();
}

// Species panel — a secondary panel (slides in from the left) shown when a
// clickable species mention is clicked inside a province's lore. Left open
// independently of the main lore panel so the reader keeps their place.
//
// Both secondary panels share the same markup shape in template.html —
// #<kind>-panel, #<kind>-panel-content, #<kind>-overlay — so one pair of
// helpers drives either.
function openSecondaryPanel(kind, html) {
  const panel = document.getElementById(`${kind}-panel`);
  const content = document.getElementById(`${kind}-panel-content`);
  const overlay = document.getElementById(`${kind}-overlay`);
  if (!panel || !content || !overlay) return;
  const wasOpen = isPanelOpen(`${kind}-panel`);

  content.innerHTML = html;
  panel.classList.add('open');
  overlay.classList.add('show');
  content.scrollTop = 0;
  afterPanelOpened(`${kind}-panel`, content, wasOpen);
}

function closeSecondaryPanel(kind) {
  const wasOpen = isPanelOpen(`${kind}-panel`);
  document.getElementById(`${kind}-panel`)?.classList.remove('open');
  document.getElementById(`${kind}-overlay`)?.classList.remove('show');
  afterPanelClosed(`${kind}-panel`, wasOpen);
}

function openSpeciesPanel(id) { openSecondaryPanel('species', buildSpeciesPanelContent(id)); }
function closeSpeciesPanel()  { closeSecondaryPanel('species'); }

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
function openNpcPanel(id) { openSecondaryPanel('npc', buildNpcPanelContent(id)); }
function closeNpcPanel()  { closeSecondaryPanel('npc'); }

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

// An in-world rumour (WM_TEASERS) shown on a locked location or being in
// place of its lore — a hint of what's there, never who or what exactly.
function rumourHtml(id) {
  const t = (typeof WM_TEASERS !== 'undefined') && WM_TEASERS[id];
  if (!t) return '';
  return `<figure class="rumour">
    <blockquote>“${t.text}”</blockquote>
    ${t.source ? `<figcaption>— ${t.source}</figcaption>` : ''}
  </figure>`;
}

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
      ? (rumourHtml(id) || `<p class="panel-body" style="font-style:italic; opacity:0.7;">Its story is not yet told. In time you will learn the truth.</p>`)
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
    ? (rumourHtml(id) || `<p class="panel-body" style="font-style:italic; opacity:0.65;">The roads of Wickermoor Hollow do not give up their secrets easily. Explore the land to uncover its lore.</p>`)
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

// ── Swipe to close (touch) ────────────────────────────────────────
// A quick sideways swipe closes a panel in the direction it slid in from:
// the lore panel (from the right) with a swipe right, the species/NPC/
// creature panels (from the left) with a swipe left. Mostly-vertical
// movement is left alone, so scrolling the text never closes anything.
function enableSwipeToClose(panelId, direction, close) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  let start = null;
  panel.addEventListener('touchstart', e => {
    const t = e.touches[0];
    start = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, time: performance.now() } : null;
  }, { passive: true });
  panel.addEventListener('touchend', e => {
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x, dy = t.clientY - start.y;
    const quick = performance.now() - start.time < 700;
    start = null;
    if (quick && Math.sign(dx) === direction && Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 2) close();
  }, { passive: true });
}

enableSwipeToClose('lore-panel', 1, () => closePanel());
SECONDARY_PANELS.forEach(kind => enableSwipeToClose(`${kind}-panel`, -1, () => closeSecondaryPanel(kind)));
