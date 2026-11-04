// The Codex (📜): a full-screen book over the map with three tabs —
//   Bestiary         the creatures (BESTIARY, data/bestiary.json) the
//                    visitor's group has met; the rest aren't shown at all.
//                    Tag who has met what in each entry's `groups` list.
//   Faces of the Hollow
//                    portraits of the people the visitor's group has met
//                    (named in lore they can read, or NPCS `metBy`),
//                    grouped by location (each NPC's `location`).
//   Chronicle        the group's story in the order it was played
//                    (STORY_ORDER), filed under chapter headings
//                    (WM_CHAPTERS), each beat written out in full, with a
//                    chapter list and a "Continue reading" bookmark —
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
  // A fresh opening starts at the top (where "Continue reading" is), and
  // before rendering, so the Chronicle doesn't count whatever happened to
  // be on screen last time as read.
  if (!wasOpen) content.scrollTop = 0;
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
  else if (codexTab === 'chronicle') { content.innerHTML = chronicleHtml(); watchChronicleReading(content); }
  else content.innerHTML = bestiaryHtml();
}

function notRecognizedHint() {
  return isAdminUnlocked() || getRecognizedGroup()
    ? ''
    : `<p class="codex-hint">Enter one of your characters' names (👤) to see what your party has discovered.</p>`;
}

// ── Bestiary ──────────────────────────────────────────────────────
// Only creatures the visitor's group has met appear — nothing at all
// (name, art, outline or a count) for the rest.
function bestiaryHtml() {
  const ids = Object.keys(BESTIARY);
  const met = ids.filter(hasMetCreature);
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
  return html;
}

// ── Faces of the Hollow ───────────────────────────────────────────────
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
  return html;
}

// Places sharing a chapter keep the order they're listed in WM_CHAPTERS —
// so the data's order is the travel order (and the place to change it).
function chapterListOrder(id) {
  const i = Object.keys(WM_CHAPTERS).indexOf(id);
  return i === -1 ? Infinity : i;
}

// ── Chronicle ─────────────────────────────────────────────────────
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

// A group's story as numbered steps, in the order it was played:
// STORY_ORDER[group] lists beats ({ place, beat?, date? }). Anything the
// group has unlocked that the order doesn't mention yet follows at the
// end, by chapter, so a new unlock shows up even before it's been placed.
// Shared by the Chronicle and the step numbers in each place's panel.
function timelineSteps(group) {
  if (!group) return [];
  const steps = [];
  const listed = new Set();
  ((typeof STORY_ORDER !== 'undefined' && STORY_ORDER[group]) || []).forEach(b => {
    if (!groupCanSee(b.place, group) || !WICKERMOOR_HOTSPOTS.some(h => h.id === b.place)) return;
    steps.push({ place: b.place, beat: b.beat || '', date: b.date || '' });
    listed.add(b.place);
  });
  WICKERMOOR_HOTSPOTS
    .filter(hs => groupCanSee(hs.id, group) && !listed.has(hs.id))
    .sort((a, b) => (WM_CHAPTERS[a.id]?.chapter ?? 99) - (WM_CHAPTERS[b.id]?.chapter ?? 99) || chapterListOrder(a.id) - chapterListOrder(b.id))
    .forEach(hs => steps.push({ place: hs.id, beat: '', date: '' }));
  return steps.map((s, i) => ({ ...s, step: i + 1 }));
}

// Puts each beat's timeline step number in front of its heading in a
// place's panel (and in front of the panel's lore when the whole place is
// one beat), so the order things happened in can be followed from the map
// too — gaps in the numbers are what happened elsewhere in between.
function numberStoryBeats(html, place, group) {
  const steps = timelineSteps(group).filter(s => s.place === place);
  if (!steps.length) return html;
  const chip = n => `<span class="beat-step" title="Step ${n} of your party's story">${n}</span>`;
  const whole = steps.find(s => !s.beat);
  let out = html.replace(/<p class="panel-subheader">([\s\S]*?)<\/p>/g, (m, inner) => {
    const title = inner.replace(/<[^>]*>/g, '').trim();
    const s = steps.find(x => x.beat === title);
    return s ? `<p class="panel-subheader" data-beat="${escHtml(title)}">${chip(s.step)}${inner}</p>` : m;
  });
  if (whole) out = `<p class="beat-whole">${chip(whole.step)}In your party's story</p>` + out;
  return out;
}

// The images a place's text can name with [[image]] tokens.
function placeImages(place) {
  return [...(WM_SCENES[place] || []), ...(WM_PORTRAITS[place] || [])];
}

// One beat of the Chronicle, written out in full: the beat's own section of
// the group's write-up (or the whole text). The images the section names
// become its pictures (shown beside the text, not in it); without any, the
// place's chapter art is offered instead.
function timelineBeat(step, group, seen) {
  const { place, beat: beatTitle, date } = step;
  const hs = WICKERMOOR_HOTSPOTS.find(h => h.id === place);
  if (!hs) return null;
  const ch = WM_CHAPTERS[place] || {};
  const entry = WM_LORE[place];
  const own = !!(entry && typeof entry === 'object' && entry.byGroup && hasMeaningfulContent(entry.byGroup[group]));
  const name = group === getRecognizedGroup() ? getRecognizedName() : null;
  const raw = revealedLoreHtml(place, group, name);

  let body = raw;
  let beat = '';
  if (beatTitle) {
    const sections = loreSections(raw);
    const i = sections.findIndex(s => s.title === beatTitle);
    if (i !== -1) {
      beat = beatTitle;
      body = sections[i].html;
      // Whatever comes before the first heading (often the place's opening
      // picture) belongs with the first beat.
      const firstTitled = sections.findIndex(s => s.title);
      if (i === firstTitled && i > 0) body = sections[0].html + body;
    }
  }

  const images = placeImages(place);
  const pictures = [];
  body = body.replace(/\[\[([^\]]+)\]\]/g, (m, rawName) => {
    const src = images.find(s => !pictures.includes(s) && imageBasename(s) === rawName.trim());
    if (src) pictures.push(src);
    return '';
  });
  if (!pictures.length && ch.art) pictures.push(ch.art);

  return {
    hs, beat, date, step: step.step,
    chapter: ch.chapter ?? 99,
    title: ch.title || '',
    heading: ch.heading || '',
    pictures,
    own,
    isNew: isNewLore(place, seen),
    body,
  };
}

// Each picture appears once, at the first beat that has it — a place
// visited over several beats doesn't repeat the same image every time.
function chronicleEntries() {
  const group = chronicleGroup();
  const seen = loadSeenLore();
  const shown = new Set();
  return timelineSteps(group).map(s => timelineBeat(s, group, seen)).filter(Boolean).map(e => {
    e.pictures = e.pictures.filter(src => !shown.has(src));
    e.pictures.forEach(src => shown.add(src));
    return e;
  });
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

  // Chapter list: one link per heading, in story order (a chapter the
  // party came back to later is listed again, with its own steps).
  const runs = [];
  entries.forEach(e => {
    const label = chronicleHeading(e);
    const last = runs[runs.length - 1];
    if (last && last.label === label) last.to = e.step;
    else runs.push({ label, from: e.step, to: e.step });
  });

  const resume = chronicleResumeStep(entries);
  html += `<nav class="chronicle-toc" aria-label="Chapters">` +
    (resume ? `<button class="chronicle-resume" data-chronicle-jump="chronicle-step-${resume}">Continue reading · step ${resume}</button>` : '') +
    `<details><summary>Chapters</summary><ol>` +
    runs.map((r, i) => `<li><button data-chronicle-jump="chronicle-ch-${i}">${escHtml(r.label)}<span class="chronicle-toc-steps">${r.from === r.to ? r.from : `${r.from}–${r.to}`}</span></button></li>`).join('') +
    `</ol></details></nav>`;

  // The last beat of each place: reading to the end of it counts as having
  // read that place's lore (clears its "new" marker on the map).
  const lastOfPlace = new Map();
  entries.forEach(e => lastOfPlace.set(e.hs.id, e.step));

  let run = -1;
  let lastHeading = null;
  const trackShown = new Set();
  html += `<ol class="chronicle">`;
  entries.forEach(e => {
    const label = chronicleHeading(e);
    if (label !== lastHeading) {
      lastHeading = label;
      run++;
      html += `<li class="chronicle-chapter" id="chronicle-ch-${run}" aria-hidden="true">${escHtml(label)}</li>`;
    }
    // A place's ambience track is offered once, at its first beat.
    const track = trackShown.has(e.hs.id) ? '' : trackButtonHtml(e.hs.id);
    trackShown.add(e.hs.id);
    html += `<li class="chronicle-entry" id="chronicle-step-${e.step}" data-step="${e.step}" data-place="${escHtml(e.hs.id)}"${lastOfPlace.get(e.hs.id) === e.step ? ' data-last-of-place' : ''}>
      <div class="chronicle-head">
        <div class="chronicle-meta"><span class="chronicle-step">${e.step}</span>${e.beat ? escHtml(e.hs.label) : ''}${e.date ? `<span class="chronicle-date">${escHtml(e.date)}</span>` : ''}</div>
        <h4 class="chronicle-title">${escHtml(e.beat || e.hs.label)}
          ${e.own ? '' : `<span class="chronicle-tag">Visited</span>`}
          ${e.isNew ? `<span class="index-new">new</span>` : ''}
        </h4>
      </div>
      ${e.pictures.length ? `<div class="chronicle-figures">${e.pictures.map(src =>
        `<button class="chronicle-figure" data-lightbox="${escHtml(src)}" aria-label="Show the picture larger"><img src="${src}" alt="" loading="lazy" decoding="async"></button>`).join('')}</div>` : ''}
      <div class="chronicle-body">${e.body}</div>
      <div class="chronicle-actions">
        <button class="chronicle-read" data-chronicle="${escHtml(e.hs.id)}" data-beat="${escHtml(e.beat)}">Show on the map</button>
        ${track}
      </div>
    </li>`;
  });
  html += `</ol>`;
  return html;
}

// ── Reading progress ──────────────────────────────────────────────
// Remembers, per group, the furthest step read to its end, so the
// Chronicle can offer "Continue reading" at the next one — handy once a
// new session's beats have been added.
const CHRONICLE_PROGRESS_KEY = 'druskenvald_chronicle_read';

function loadChronicleProgress() {
  try { return JSON.parse(store.get(CHRONICLE_PROGRESS_KEY)) || {}; }
  catch { return {}; }
}

function chronicleResumeStep(entries) {
  const read = loadChronicleProgress()[chronicleGroup()] || 0;
  const next = entries.find(e => e.step > read);
  return read && next ? next.step : null;
}

function noteChronicleStepRead(step) {
  const group = chronicleGroup();
  const progress = loadChronicleProgress();
  if ((progress[group] || 0) >= step) return;
  progress[group] = step;
  store.set(CHRONICLE_PROGRESS_KEY, JSON.stringify(progress));
}

// Watches for the end of each beat scrolling into view: that step counts
// as read, and at a place's last beat, so does the place's lore — but only
// in the visitor's own group's story (not one the GM is browsing).
let chronicleObserver = null;

function watchChronicleReading(content) {
  chronicleObserver?.disconnect();
  chronicleObserver = null;
  if (typeof IntersectionObserver === 'undefined') return;
  const ownStory = chronicleGroup() === getRecognizedGroup();
  chronicleObserver = new IntersectionObserver(seen => {
    seen.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      chronicleObserver.unobserve(target);
      const entry = target.closest('.chronicle-entry');
      noteChronicleStepRead(Number(entry.dataset.step));
      if (ownStory && entry.hasAttribute('data-last-of-place')) {
        const place = entry.dataset.place;
        markLoreSeen(place);
        content.querySelectorAll(`.chronicle-entry[data-place="${place}"] .index-new`).forEach(n => n.remove());
      }
    });
  }, { root: content });
  content.querySelectorAll('.chronicle-actions').forEach(n => chronicleObserver.observe(n));
}

// "Show on the map" opens the location's own panel over the Codex,
// scrolled to the beat's section; closing it (or Back) returns here.
function openChronicleEntry(id, beatTitle) {
  const hs = WICKERMOOR_HOTSPOTS.find(h => h.id === id);
  if (!hs) return;
  if (getActiveMapKey() !== 'wickermoor') openWickermoor();
  openPanel(hs.id, hs.label);
  if (!beatTitle) return;
  const heading = [...document.querySelectorAll('#panel-content .panel-subheader')]
    .find(h => (h.dataset.beat || h.textContent.trim()) === beatTitle);
  if (heading) requestAnimationFrame(() => heading.scrollIntoView({ block: 'start' }));
}

document.addEventListener('click', e => {
  const read = e.target.closest?.('[data-chronicle]');
  if (read) { openChronicleEntry(read.dataset.chronicle, read.dataset.beat); return; }
  const figure = e.target.closest?.('[data-lightbox]');
  if (figure) { openLightbox(figure.dataset.lightbox); return; }
  const jump = e.target.closest?.('[data-chronicle-jump]');
  if (jump) { document.getElementById(jump.dataset.chronicleJump)?.scrollIntoView({ block: 'start' }); return; }
  const pick = e.target.closest?.('[data-chronicle-group]');
  if (pick) {
    chronicleGroupChoice = pick.dataset.chronicleGroup;
    renderCodex();
  }
});

// A Chronicle picture shown full size over everything; any click or
// Escape closes it (before Escape reaches the Codex itself).
function openLightbox(src) {
  let box = document.getElementById('lightbox');
  if (!box) {
    box = document.createElement('div');
    box.id = 'lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Picture');
    box.innerHTML = '<img alt="">';
    box.addEventListener('click', closeLightbox);
    document.body.appendChild(box);
  }
  box.querySelector('img').src = src;
  box.classList.add('open');
}

function closeLightbox() {
  document.getElementById('lightbox')?.classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || !document.getElementById('lightbox')?.classList.contains('open')) return;
  e.stopImmediatePropagation();
  closeLightbox();
}, true);

// Arrow keys move between the tabs (standard tablist behaviour).
document.addEventListener('keydown', e => {
  if (!e.target.classList?.contains('codex-tab')) return;
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  const i = CODEX_TABS.indexOf(codexTab);
  const next = CODEX_TABS[(i + (e.key === 'ArrowRight' ? 1 : CODEX_TABS.length - 1)) % CODEX_TABS.length];
  showCodexTab(next);
  document.getElementById(`codex-tab-${next}`)?.focus();
});
