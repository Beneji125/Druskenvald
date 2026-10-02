// The 🔍 quick-jump index: a filterable list of everything this visitor
// can see — the main map's places, Wickermoor locations their group has
// discovered (undiscovered ones are only counted, never named), species,
// and the people mentioned in lore they can read. Opened from the topbar,
// or with the "/" key.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

function npcIdsIn(html) {
  return [...String(html || '').matchAll(/data-npc="([^"]+)"/g)].map(m => m[1]);
}

// Built fresh each time the index opens or the filter changes, since what's
// visible depends on who the visitor is recognized as.
function indexSections() {
  const group = getRecognizedGroup();
  const name = getRecognizedName();

  const places = MAIN_HOTSPOTS_SVG.map(hs => hs.isWickermoor
    ? { label: 'Wickermoor Hollow', go: () => openWickermoor() }
    : { label: hs.label, go: () => { if (getActiveMapKey() !== 'main') returnToMain(); openPanel(hs.id, hs.label); } });

  const unlocked = WICKERMOOR_HOTSPOTS.filter(hs => isUnlockedForGroup(hs.id, group));
  const seen = loadSeenLore();
  const hollow = unlocked.map(hs => ({
    label: hs.label,
    isNew: isNewLore(hs.id, seen),
    go: () => { if (getActiveMapKey() !== 'wickermoor') openWickermoor(); openPanel(hs.id, hs.label); },
  }));
  const undiscovered = WICKERMOOR_HOTSPOTS.length - unlocked.length;

  const species = Object.entries(SPECIES).map(([id, sp]) => ({ label: sp.name, go: () => openSpeciesPanel(id) }));

  // Only people the visitor has actually read about — listing every NPC
  // would spoil who turns up in places their party hasn't been.
  const npcIds = new Set();
  Object.values(LORE).forEach(l => npcIdsIn(l.body).forEach(id => npcIds.add(id)));
  unlocked.forEach(hs => npcIdsIn(revealedLoreHtml(hs.id, group, name)).forEach(id => npcIds.add(id)));
  const people = [...npcIds].filter(id => NPCS[id]).map(id => ({ label: NPCS[id].name, go: () => openNpcPanel(id) }));

  const byLabel = (a, b) => a.label.localeCompare(b.label);
  return [
    { title: 'Druskenvald', items: places.sort(byLabel) },
    {
      title: 'Wickermoor Hollow',
      items: hollow.sort(byLabel),
      note: undiscovered ? `${undiscovered} ${undiscovered === 1 ? 'place remains' : 'places remain'} undiscovered.` : '',
    },
    { title: 'Species', items: species.sort(byLabel) },
    { title: 'People', items: people.sort(byLabel) },
  ];
}

// Items rendered by the last renderIndex(), in on-screen order, so Enter in
// the filter box can open the first match.
let indexVisibleItems = [];

function renderIndex() {
  const results = document.getElementById('index-results');
  const filter = (document.getElementById('index-filter')?.value || '').trim().toLowerCase();
  if (!results) return;

  results.innerHTML = '';
  indexVisibleItems = [];
  indexSections().forEach(section => {
    const items = section.items.filter(item => !filter || item.label.toLowerCase().includes(filter));
    if (!items.length && (filter || !section.note)) return;

    const heading = document.createElement('div');
    heading.className = 'index-section-title';
    heading.textContent = section.title;
    results.appendChild(heading);

    items.forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'index-item';
      btn.textContent = item.label;
      if (item.isNew) {
        const badge = document.createElement('span');
        badge.className = 'index-new';
        badge.textContent = 'new';
        btn.appendChild(badge);
      }
      btn.addEventListener('click', () => openIndexItem(item));
      results.appendChild(btn);
      indexVisibleItems.push(item);
    });

    if (section.note && !filter) {
      const note = document.createElement('div');
      note.className = 'index-note';
      note.textContent = section.note;
      results.appendChild(note);
    }
  });

  if (!indexVisibleItems.length) {
    const empty = document.createElement('div');
    empty.className = 'index-note';
    empty.textContent = 'Nothing by that name… yet.';
    results.appendChild(empty);
  }
}

// Focus goes back to the 🔍 button first, so that's where it returns when
// the panel this opens is closed (the list item itself is about to vanish).
function openIndexItem(item) {
  closeIndex();
  document.getElementById('index-btn')?.focus({ preventScroll: true });
  item.go();
}

function isIndexOpen() {
  return !!document.getElementById('index-popover')?.classList.contains('open');
}

function toggleIndex() {
  if (isIndexOpen()) { closeIndex(); return; }
  closeReenterNamePrompt();
  const filter = document.getElementById('index-filter');
  if (filter) filter.value = '';
  renderIndex();
  document.getElementById('index-popover').classList.add('open');
  document.getElementById('index-btn')?.setAttribute('aria-expanded', 'true');
  filter?.focus();
}

function closeIndex() {
  document.getElementById('index-popover')?.classList.remove('open');
  document.getElementById('index-btn')?.setAttribute('aria-expanded', 'false');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('index-filter')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && indexVisibleItems.length) {
      e.preventDefault();
      openIndexItem(indexVisibleItems[0]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      document.querySelector('#index-results .index-item')?.focus();
    }
  });
  // Up/Down arrows move between results once one has focus.
  document.getElementById('index-results')?.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const items = [...document.querySelectorAll('#index-results .index-item')];
    const i = items.indexOf(document.activeElement);
    if (i === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowUp' && i === 0) document.getElementById('index-filter')?.focus();
    else items[Math.max(0, Math.min(items.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
  });
});
