// The Codex (📜): a full-screen book over the map with three tabs —
//   Bestiary         the creatures (BESTIARY, data/bestiary.json) the
//                    visitor's group has met; the rest aren't shown at all.
//                    Tag who has met what in each entry's `groups` list.
//   Rogues' Gallery  portraits of the people met in lore the visitor can
//                    read, grouped by location (each NPC's `location`).
//   Chronicle        the group's story in the order it was played
//                    (STORY_ORDER), filed under chapter headings
//                    (WM_CHAPTERS), as a recap with links into each panel —
//                    and that place's own ambience track (WM_TRACKS), for
//                    the places that have one.
// Also the creature panel, opened from a Bestiary card or a
// {{creature:id}} link in lore.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

const CODEX_TABS = ['bestiary', 'gallery', 'chronicle'];
let codexTab = 'bestiary';

const CREATURE_KIND_LABELS = {
  legendary: { section: 'Legendary Monsters', single: 'Legendary Monster' },
  monster:   { section: 'Crooked Moon Monsters', single: 'Crooked Moon Monster' },
  familiar:  { section: 'Familiars', single: 'Familiar' },
};

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hasMetCreature(id) {
  const c = BESTIARY[id];
  if (!c) return false;
  if (isAdminUnlocked()) return true;
  const group = getRecognizedGroup();
  return !!group && (c.groups || []).includes(group);
}

// A creature's pictures this visitor may see. An entry can limit a
// picture to certain groups with `imageGroups` ({ "path": ["1", "2"] }) —
// e.g. the Vermin Familiar's weasel, centipede and pigeon forms, so each
// group sees only the forms it actually met. Unlisted pictures show to
// everyone who has met the creature.
function visibleCreatureImages(c) {
  const limits = c.imageGroups || {};
  if (isAdminUnlocked()) return c.images || [];
  const group = getRecognizedGroup();
  return (c.images || []).filter(src => !limits[src] || limits[src].includes(group));
}

// ── Creature panel ────────────────────────────────────────────────
function buildCreaturePanelContent(id) {
  const c = BESTIARY[id];
  if (!c) return `<div class="panel-title">This creature hasn't been recorded yet.</div>`;
  const kind = CREATURE_KIND_LABELS[c.kind]?.single || 'Creature';

  if (!hasMetCreature(id)) {
    return `
      <div class="panel-eyebrow">${kind}</div>
      <div class="panel-title">???</div>
      <div class="panel-divider"></div>
      <p class="panel-body" style="font-style:italic; opacity:0.7;">Your party has not yet crossed paths with this creature, or lived to describe it.</p>`;
  }
  const images = visibleCreatureImages(c).map(src => imageFrameHtml(src, c.name)).join('');
  const body = hasMeaningfulContent(c.body)
    ? c.body
    : `<p class="panel-body" style="font-style:italic; opacity:0.6;">No account of this creature has yet been recorded.</p>`;
  return `
    <div class="panel-eyebrow">${kind}</div>
    <div class="panel-title">${escHtml(c.name)}</div>
    ${c.subtitle ? `<div class="panel-pronunciation">${escHtml(c.subtitle)}</div>` : ''}
    ${images}
    <div class="panel-divider"></div>
    ${body}`;
}

function openCreaturePanel(id) { openSecondaryPanel('creature', buildCreaturePanelContent(id)); }
function closeCreaturePanel()  { closeSecondaryPanel('creature'); }

// ── Opening, closing, tabs ────────────────────────────────────────
function isCodexOpen() {
  return isPanelOpen('codex');
}

function openCodex(tab = codexTab) {
  const codex = document.getElementById('codex');
  const content = document.getElementById('codex-content');
  if (!codex || !content) return;
  const wasOpen = isCodexOpen();
  closeIndex();
  closeReenterNamePrompt();
  codexTab = CODEX_TABS.includes(tab) ? tab : 'bestiary';
  renderCodex();
  codex.classList.add('open');
  afterPanelOpened('codex', content, wasOpen);
  syncUrl();
}

function closeCodex() {
  const wasOpen = isCodexOpen();
  document.getElementById('codex')?.classList.remove('open');
  afterPanelClosed('codex', wasOpen);
  syncUrl();
}

// Switching tabs replaces the current history entry rather than adding
// one, so Back leaves the Codex instead of stepping through tabs.
function showCodexTab(tab) {
  codexTab = CODEX_TABS.includes(tab) ? tab : 'bestiary';
  renderCodex();
  document.getElementById('codex-content').scrollTop = 0;
  syncUrl({ replace: true });
}

function renderCodex() {
  const content = document.getElementById('codex-content');
  if (!content) return;
  document.querySelectorAll('.codex-tab').forEach(btn => {
    const active = btn.dataset.tab === codexTab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
  content.setAttribute('aria-labelledby', `codex-tab-${codexTab}`);
  if (codexTab === 'gallery') content.innerHTML = galleryHtml();
  else if (codexTab === 'chronicle') content.innerHTML = chronicleHtml();
  else content.innerHTML = bestiaryHtml();
}

function notRecognizedHint() {
  return isAdminUnlocked() || getRecognizedGroup()
    ? ''
    : `<p class="codex-hint">Enter one of your characters' names (👤) to see what your party has discovered.</p>`;
}

// ── Bestiary ──────────────────────────────────────────────────────
// Only creatures the visitor's group has met appear — nothing at all
// (name, art or outline) for the rest, just a count of how many remain.
function bestiaryHtml() {
  const ids = Object.keys(BESTIARY);
  const met = ids.filter(hasMetCreature);
  const unseen = ids.length - met.length;
  let html = `<p class="codex-intro">Every horror your party has faced and lived to describe.</p>`;
  html += notRecognizedHint();

  ['legendary', 'monster', 'familiar'].forEach(kind => {
    const inKind = met.filter(id => BESTIARY[id].kind === kind);
    if (!inKind.length) return;
    html += `<h3 class="codex-section-title">${CREATURE_KIND_LABELS[kind].section}</h3><div class="codex-grid">`;
    inKind.forEach(id => {
      const c = BESTIARY[id];
      const img = visibleCreatureImages(c)[0];
      html += `<button class="codex-card" data-creature="${escHtml(id)}">
        ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : ''}
        <span class="codex-card-name">${escHtml(c.name)}</span>
      </button>`;
    });
    html += `</div>`;
  });

  if (!met.length) html += `<p class="codex-note">Nothing has crossed your path yet… that you know of.</p>`;
  if (unseen > 0) html += `<p class="codex-note">${unseen} ${unseen === 1 ? 'creature still lurks' : 'creatures still lurk'} unseen in the dark.</p>`;
  return html;
}

// ── Rogues' Gallery ───────────────────────────────────────────────
// Where an NPC is listed: their `location` in NPCS (a Wickermoor id) if
// set; otherwise the first place, in chapter order, whose readable lore
// mentions them — so a newly added NPC still lands somewhere sensible.
function npcGalleryLocation(id) {
  const group = getRecognizedGroup();
  if (NPCS[id]?.location) return NPCS[id].location;
  const name = getRecognizedName();
  const mention = WICKERMOOR_HOTSPOTS
    .filter(hs => isUnlockedForGroup(hs.id, group) && npcIdsIn(revealedLoreHtml(hs.id, group, name)).includes(id))
    .sort((a, b) => (WM_CHAPTERS[a.id]?.chapter ?? 99) - (WM_CHAPTERS[b.id]?.chapter ?? 99))[0];
  return mention ? mention.id : null;
}

function galleryHtml() {
  const group = getRecognizedGroup();
  const known = [...knownNpcIds()].filter(id => NPCS[id]);
  const unknown = Object.keys(NPCS).length - known.length;

  // Group by location. A location the visitor hasn't unlocked isn't named —
  // its people go under "Elsewhere in the Hollow" instead.
  const sections = new Map();
  known.forEach(id => {
    let loc = npcGalleryLocation(id);
    if (loc && !isUnlockedForGroup(loc, group)) loc = null;
    if (!sections.has(loc)) sections.set(loc, []);
    sections.get(loc).push(id);
  });
  const order = loc => loc === null ? 999 : (WM_CHAPTERS[loc]?.chapter ?? 99);
  const label = loc => loc === null ? 'Elsewhere in the Hollow' : (WICKERMOOR_HOTSPOTS.find(h => h.id === loc)?.label || loc);
  const sorted = [...sections.keys()].sort((a, b) => order(a) - order(b) || chapterListOrder(a) - chapterListOrder(b));

  let html = `<p class="codex-intro">Faces your party has come to know in the hollow — friend, foe, and everything between.</p>`;
  html += notRecognizedHint();
  sorted.forEach(loc => {
    const ids = sections.get(loc).sort((a, b) => NPCS[a].name.localeCompare(NPCS[b].name));
    html += `<h3 class="codex-section-title">${escHtml(label(loc))}</h3><div class="codex-grid portraits">`;
    ids.forEach(id => {
      html += `<button class="codex-card" data-npc="${escHtml(id)}">
        <img src="${NPCS[id].image}" alt="" loading="lazy" decoding="async">
        <span class="codex-card-name">${escHtml(NPCS[id].name)}</span>
      </button>`;
    });
    html += `</div>`;
  });
  if (unknown > 0) html += `<p class="codex-note">${unknown} ${unknown === 1 ? 'face remains' : 'faces remain'} unknown.</p>`;
  return html;
}

// Places sharing a chapter keep the order they're listed in WM_CHAPTERS —
// so the data's order is the travel order (and the place to change it).
function chapterListOrder(id) {
  const i = Object.keys(WM_CHAPTERS).indexOf(id);
  return i === -1 ? Infinity : i;
}

// ── Chronicle ─────────────────────────────────────────────────────
// A short plain-text excerpt of a lore entry: subheadings and [[image]]
// tags removed, cut at a word boundary.
function loreExcerpt(html, max = 280) {
  const text = String(html || '')
    .replace(/<p class="panel-subheader">[\s\S]*?<\/p>/g, ' ')
    .replace(/\[\[[^\]]*\]\]/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, text.lastIndexOf(' ', max)).replace(/[,;:.]$/, '') + '…';
}

// Whose story the Chronicle shows: the visitor's own group — or, for the
// GM (admin), whichever group they've picked with the switcher.
let chronicleGroupChoice = null;

function chronicleGroup() {
  if (isAdminUnlocked()) return chronicleGroupChoice || Object.keys(GROUPS)[0];
  return getRecognizedGroup();
}

function groupCanSee(place, group) {
  const rule = UNLOCKS[place];
  return !!group && (rule === 'all' || (Array.isArray(rule) && rule.includes(group)));
}

// Splits a lore entry at its section headings (<p class="panel-subheader">)
// into [{ title, html }]; text before the first heading has title ''.
function loreSections(html) {
  const sections = [{ title: '', html: '' }];
  String(html || '').split(/(<p class="panel-subheader">[\s\S]*?<\/p>)/).forEach(part => {
    const m = part.match(/^<p class="panel-subheader">([\s\S]*?)<\/p>$/);
    if (m) sections.push({ title: m[1].replace(/<[^>]*>/g, '').trim(), html: '' });
    else sections[sections.length - 1].html += part;
  });
  return sections.filter(s => s.title || hasMeaningfulContent(s.html));
}

// One beat of the timeline: a place, and optionally one headed section of
// that group's write-up there.
function timelineBeat(place, beatTitle, date, group, seen) {
  const hs = WICKERMOOR_HOTSPOTS.find(h => h.id === place);
  if (!hs) return null;
  const ch = WM_CHAPTERS[place] || {};
  const entry = WM_LORE[place];
  const own = !!(entry && typeof entry === 'object' && entry.byGroup && hasMeaningfulContent(entry.byGroup[group]));
  const name = group === getRecognizedGroup() ? getRecognizedName() : null;
  const html = revealedLoreHtml(place, group, name);
  const section = beatTitle ? loreSections(html).find(s => s.title === beatTitle) : null;
  return {
    hs,
    beat: section ? beatTitle : '',
    date: date || '',
    chapter: ch.chapter ?? 99,
    title: ch.title || '',
    heading: ch.heading || '',
    art: ch.art,
    own,
    isNew: isNewLore(place, seen),
    excerpt: loreExcerpt(section ? section.html : html),
  };
}

// The group's story in the order it was played: STORY_ORDER[group] lists
// beats ({ place, beat?, date? }). Anything the group has unlocked that the
// order doesn't mention yet follows at the end, by chapter, so a new unlock
// shows up even before it's been placed in the timeline.
function chronicleEntries() {
  const group = chronicleGroup();
  if (!group) return [];
  const seen = loadSeenLore();
  const listed = new Set();
  const beats = [];
  ((typeof STORY_ORDER !== 'undefined' && STORY_ORDER[group]) || []).forEach(b => {
    if (!groupCanSee(b.place, group)) return;
    const beat = timelineBeat(b.place, b.beat, b.date, group, seen);
    if (beat) { beats.push(beat); listed.add(b.place); }
  });
  WICKERMOOR_HOTSPOTS
    .filter(hs => groupCanSee(hs.id, group) && !listed.has(hs.id))
    .map(hs => timelineBeat(hs.id, null, null, group, seen))
    .sort((a, b) => a.chapter - b.chapter || chapterListOrder(a.hs.id) - chapterListOrder(b.hs.id))
    .forEach(b => beats.push(b));
  return beats;
}

// The heading an entry is filed under. WM_CHAPTERS can give a `heading`
// of its own — e.g. "Interlude · The Webwoods" for a homebrew session that
// isn't one of the book's chapters.
function chronicleHeading(e) {
  if (e.heading) return e.heading;
  if (e.chapter === 99) return 'Elsewhere in the Hollow';
  return `Chapter ${e.chapter}${e.title ? ' · ' + e.title : ''}`;
}

function chronicleHtml() {
  let html = `<p class="codex-intro">The tale of your party's wanderings through Wickermoor Hollow, in the order it happened.</p>`;
  if (isAdminUnlocked()) {
    const current = chronicleGroup();
    html += `<div class="chronicle-groups" role="group" aria-label="Show the story of">` +
      Object.keys(GROUPS).map(g => `<button class="chronicle-group${g === current ? ' active' : ''}" data-chronicle-group="${escHtml(g)}" aria-pressed="${g === current}">Group ${escHtml(g)}</button>`).join('') +
      `</div>`;
  }
  html += notRecognizedHint();
  const entries = chronicleEntries();
  if (!entries.length) return html;

  let lastHeading = null;
  const trackShown = new Set();
  html += `<ol class="chronicle">`;
  entries.forEach((e, i) => {
    const label = chronicleHeading(e);
    if (label !== lastHeading) {
      lastHeading = label;
      html += `<li class="chronicle-chapter" aria-hidden="true">${escHtml(label)}</li>`;
    }
    // A place's ambience track is offered once, at its first beat.
    const track = trackShown.has(e.hs.id) ? '' : trackButtonHtml(e.hs.id);
    trackShown.add(e.hs.id);
    html += `<li class="chronicle-entry">
      ${e.art ? `<img class="chronicle-art" src="${e.art}" alt="" loading="lazy" decoding="async">` : '<div class="chronicle-art blank"></div>'}
      <div class="chronicle-text">
        <div class="chronicle-meta"><span class="chronicle-step">${i + 1}</span>${e.beat ? escHtml(e.hs.label) : ''}${e.date ? `<span class="chronicle-date">${escHtml(e.date)}</span>` : ''}</div>
        <div class="chronicle-title">${escHtml(e.beat || e.hs.label)}
          ${e.own ? '' : `<span class="chronicle-tag">Visited</span>`}
          ${e.isNew ? `<span class="index-new">new</span>` : ''}
        </div>
        <p class="chronicle-excerpt">${escHtml(e.excerpt)}</p>
        <div class="chronicle-actions">
          <button class="chronicle-read" data-chronicle="${escHtml(e.hs.id)}" data-beat="${escHtml(e.beat)}">Read on →</button>
          ${track}
        </div>
      </div>
    </li>`;
  });
  html += `</ol>`;
  return html;
}

// "Read on" opens the location's own panel over the Codex, scrolled to the
// beat's section; closing it (or Back) returns here.
function openChronicleEntry(id, beatTitle) {
  const hs = WICKERMOOR_HOTSPOTS.find(h => h.id === id);
  if (!hs) return;
  if (getActiveMapKey() !== 'wickermoor') openWickermoor();
  openPanel(hs.id, hs.label);
  if (!beatTitle) return;
  const heading = [...document.querySelectorAll('#panel-content .panel-subheader')]
    .find(h => h.textContent.trim() === beatTitle);
  if (heading) requestAnimationFrame(() => heading.scrollIntoView({ block: 'start' }));
}

document.addEventListener('click', e => {
  const read = e.target.closest?.('[data-chronicle]');
  if (read) { openChronicleEntry(read.dataset.chronicle, read.dataset.beat); return; }
  const pick = e.target.closest?.('[data-chronicle-group]');
  if (pick) {
    chronicleGroupChoice = pick.dataset.chronicleGroup;
    renderCodex();
  }
});

// Arrow keys move between the tabs (standard tablist behaviour).
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('codex-tab')) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = CODEX_TABS.indexOf(codexTab);
  const next = CODEX_TABS[(i + (e.key === 'ArrowRight' ? 1 : CODEX_TABS.length - 1)) % CODEX_TABS.length];
  showCodexTab(next);
  document.getElementById(`codex-tab-${next}`)?.focus();
});
