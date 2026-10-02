// The Codex (📜): a full-screen book over the map with three tabs —
//   Bestiary         every creature (BESTIARY, data/bestiary.json); ones the
//                    visitor's group has met are shown, the rest as dark
//                    "???" silhouettes. Tag who has met what in each
//                    entry's `groups` list.
//   Rogues' Gallery  portraits of the people met in lore the visitor can read.
//   Chronicle        the group's unlocked Wickermoor story, in chapter order
//                    (WM_CHAPTERS), as a recap with links into each panel.
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
  const images = (c.images || []).map(src => imageFrameHtml(src, c.name)).join('');
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
function bestiaryHtml() {
  const ids = Object.keys(BESTIARY);
  const metCount = ids.filter(hasMetCreature).length;
  let html = `<p class="codex-intro">Your party has encountered <strong>${metCount}</strong> of the ${ids.length} creatures known to stalk Druskenvald.</p>`;
  html += notRecognizedHint();

  ['legendary', 'monster', 'familiar'].forEach(kind => {
    const inKind = ids.filter(id => BESTIARY[id].kind === kind);
    if (!inKind.length) return;
    html += `<h3 class="codex-section-title">${CREATURE_KIND_LABELS[kind].section}</h3><div class="codex-grid">`;
    inKind.forEach(id => {
      const c = BESTIARY[id];
      const img = (c.images || [])[0];
      if (hasMetCreature(id)) {
        html += `<button class="codex-card" data-creature="${escHtml(id)}">
          ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : ''}
          <span class="codex-card-name">${escHtml(c.name)}</span>
        </button>`;
      } else {
        // A silhouette only — the name and text stay out of the page.
        html += `<div class="codex-card unmet" aria-label="Unknown creature">
          ${img ? `<img src="${img}" alt="" loading="lazy" decoding="async">` : ''}
          <span class="codex-card-name">???</span>
        </div>`;
      }
    });
    html += `</div>`;
  });
  return html;
}

// ── Rogues' Gallery ───────────────────────────────────────────────
function galleryHtml() {
  const known = [...knownNpcIds()].filter(id => NPCS[id])
    .sort((a, b) => NPCS[a].name.localeCompare(NPCS[b].name));
  const unknown = Object.keys(NPCS).length - known.length;
  let html = `<p class="codex-intro">Faces your party has come to know in the hollow — friend, foe, and everything between.</p>`;
  html += notRecognizedHint();
  html += `<div class="codex-grid portraits">`;
  known.forEach(id => {
    html += `<button class="codex-card" data-npc="${escHtml(id)}">
      <img src="${NPCS[id].image}" alt="" loading="lazy" decoding="async">
      <span class="codex-card-name">${escHtml(NPCS[id].name)}</span>
    </button>`;
  });
  html += `</div>`;
  if (unknown > 0) html += `<p class="codex-note">${unknown} ${unknown === 1 ? 'face remains' : 'faces remain'} unknown.</p>`;
  return html;
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

function chronicleEntries() {
  const group = getRecognizedGroup();
  const name = getRecognizedName();
  const seen = loadSeenLore();
  return WICKERMOOR_HOTSPOTS
    .filter(hs => isUnlockedForGroup(hs.id, group))
    .map(hs => {
      const ch = WM_CHAPTERS[hs.id] || {};
      const entry = WM_LORE[hs.id];
      const own = !!(group && entry && typeof entry === 'object' && entry.byGroup && hasMeaningfulContent(entry.byGroup[group]));
      return {
        hs,
        chapter: ch.chapter ?? 99,
        title: ch.title || '',
        art: ch.art,
        own,
        isNew: isNewLore(hs.id, seen),
        excerpt: loreExcerpt(revealedLoreHtml(hs.id, group, name)),
      };
    })
    .sort((a, b) => a.chapter - b.chapter || Number(b.own) - Number(a.own) || a.hs.label.localeCompare(b.hs.label));
}

function chronicleHtml() {
  const entries = chronicleEntries();
  let html = `<p class="codex-intro">The tale of your party's wanderings through Wickermoor Hollow, as far as it has been told.</p>`;
  html += notRecognizedHint();
  if (!entries.length) return html;

  let lastChapter = null;
  html += `<ol class="chronicle">`;
  entries.forEach(e => {
    if (e.chapter !== lastChapter) {
      lastChapter = e.chapter;
      const label = e.chapter === 99 ? 'Elsewhere in the Hollow' : `Chapter ${e.chapter}${e.title ? ' · ' + escHtml(e.title) : ''}`;
      html += `<li class="chronicle-chapter" aria-hidden="true">${label}</li>`;
    }
    html += `<li class="chronicle-entry">
      ${e.art ? `<img class="chronicle-art" src="${e.art}" alt="" loading="lazy" decoding="async">` : '<div class="chronicle-art blank"></div>'}
      <div class="chronicle-text">
        <div class="chronicle-title">${escHtml(e.hs.label)}
          ${e.own ? `<span class="chronicle-tag">Your party's tale</span>` : ''}
          ${e.isNew ? `<span class="index-new">new</span>` : ''}
        </div>
        <p class="chronicle-excerpt">${escHtml(e.excerpt)}</p>
        <button class="chronicle-read" data-chronicle="${escHtml(e.hs.id)}">Read on →</button>
      </div>
    </li>`;
  });
  html += `</ol>`;
  return html;
}

// "Read on" opens the location's own panel over the Codex; closing it
// (or Back) returns here.
function openChronicleEntry(id) {
  const hs = WICKERMOOR_HOTSPOTS.find(h => h.id === id);
  if (!hs) return;
  if (getActiveMapKey() !== 'wickermoor') openWickermoor();
  openPanel(hs.id, hs.label);
}

document.addEventListener('click', e => {
  const read = e.target.closest?.('[data-chronicle]');
  if (read) openChronicleEntry(read.dataset.chronicle);
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
