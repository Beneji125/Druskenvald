// Group-based unlocking: recognizing a character name (or the admin
// password), remembering it, and deciding which Wickermoor lore a visitor's
// group may see.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

// ── Group-based unlocking ─────────────────────────────────────────
// Instead of one unique password per region, each region already explored
// in play is tagged (in UNLOCKS, from data/descriptions.json) with which of
// the campaign's groups found it — "all" for content every group can see
// (the provinces), or a list of group ids. Typing any of a group's
// character names (GROUPS) into any lock recognizes this visitor as
// belonging to that group; recognition is remembered (localStorage) and
// immediately unlocks everything tagged to that group across the whole
// site, not just the one lock they typed into.
const RECOGNIZED_GROUP_STORAGE_KEY = 'druskenvald_recognized_group';

const RECOGNIZED_NAME_STORAGE_KEY = 'druskenvald_recognized_name';

// name (lowercased) -> group id, built once from GROUPS.
const NAME_TO_GROUP = {};

Object.entries(GROUPS).forEach(([groupId, names]) => {
  names.forEach(name => { NAME_TO_GROUP[name.toLowerCase()] = groupId; });
});

function getRecognizedGroup() {
  return store.get(RECOGNIZED_GROUP_STORAGE_KEY);
}

// The specific character name last used to unlock something, lowercased.
// Not used to gate access (that's still group-based, see isUnlockedForGroup)
// — kept only so revealedLoreHtml can pick a per-character variant once
// WM_LORE entries start defining a `byCharacter` map.
function getRecognizedName() {
  return store.get(RECOGNIZED_NAME_STORAGE_KEY);
}

// GM/admin backdoor — deliberately not a character name (so it can never
// collide with GROUPS) and not one of the site's own mystery reveals (see
// the "why not Kehlenn/Horned King/Rowan" discussion this came out of):
// unlocks every Wickermoor id at once regardless of UNLOCKS, without
// needing to belong to a specific party's group. Scoped to "wm_" ids only
// in isUnlockedForGroup below — main-map provinces don't have anything to
// bypass (their UNLOCKS rule is already "all").
const ADMIN_PASSWORD = 'vermintoll';

const ADMIN_UNLOCKED_STORAGE_KEY = 'druskenvald_admin_unlocked';

function isAdminUnlocked() {
  return store.get(ADMIN_UNLOCKED_STORAGE_KEY) === 'true';
}

// Single place that writes recognition state, so entering a new
// name/password always fully replaces whatever was recognized before
// rather than layering on top of it. Without this, admin recognition in
// particular was "sticky": isUnlockedForGroup checks isAdminUnlocked()
// first, so once it was set, typing a regular character name afterward
// (to check what a lower-access group actually sees) set the new group
// but never cleared the old admin flag — admin access silently persisted
// underneath it, making every group look like it could see everything.
function setRecognizedIdentity({ admin = false, groupId = null, name = null } = {}) {
  store.set(ADMIN_UNLOCKED_STORAGE_KEY, String(admin));
  if (groupId) {
    store.set(RECOGNIZED_GROUP_STORAGE_KEY, groupId);
    store.set(RECOGNIZED_NAME_STORAGE_KEY, name);
  } else {
    store.remove(RECOGNIZED_GROUP_STORAGE_KEY);
    store.remove(RECOGNIZED_NAME_STORAGE_KEY);
  }
}

function isUnlockedForGroup(id, groupId) {
  if (isAdminUnlocked() && id.startsWith('wm_')) return true;
  if (!groupId) return false;
  const rule = UNLOCKS[id];
  if (!rule) return false;
  return rule === 'all' || rule.includes(groupId);
}

// Real lore for a region (WM_LORE[id], from data/descriptions.json) is
// shown once unlocked; anything not written yet falls back to the original
// placeholder, so adding lore for one location doesn't require touching
// this function again.
//
// WM_LORE[id] is either a plain HTML string (shown to everyone, no
// variants) or an object shaped like:
//   { default: "<p>...</p>", byGroup: { "1": "<p>...</p>" }, byCharacter: { "sylas": "<p>...</p>" } }
// Resolution picks the most specific match available: an exact character
// name first, then the visitor's group, then the entry's own default.
// True once `html` has actual text in it, not just empty markup — e.g.
// `<p class="panel-body"></p>` (an unwritten byGroup/byCharacter
// placeholder someone's prepared to fill in later) strips down to nothing
// and doesn't count. Without this, an empty-but-present override would
// still beat `default` below, showing visitors a blank paragraph instead
// of the general story every group can already see.
function hasMeaningfulContent(html) {
  return !!(html && html.replace(/<[^>]*>/g, '').trim().length > 0);
}

function revealedLoreHtml(id, groupId, characterName) {
  const entry = WM_LORE[id];
  if (!entry) {
    return `<p class="panel-body" style="font-style:italic; opacity:0.5;">Content will appear here when added by the GM.</p>`;
  }
  if (typeof entry === 'string') return entry;

  if (characterName && entry.byCharacter && hasMeaningfulContent(entry.byCharacter[characterName])) {
    return entry.byCharacter[characterName];
  }
  if (groupId && entry.byGroup && hasMeaningfulContent(entry.byGroup[groupId])) {
    return entry.byGroup[groupId];
  }
  return entry.default || `<p class="panel-body" style="font-style:italic; opacity:0.5;">Content will appear here when added by the GM.</p>`;
}

// Returns { html, leftover } rather than a plain string — buildWMContent
// needs to know which images (if any) still need showing in the old
// top-of-panel block, once whatever [[image name]] tokens are in the
// resolved lore text (see interleaveImages) have claimed theirs.
function buildPasswordSection(id) {
  const recognizedGroup = getRecognizedGroup();
  const recognizedName = getRecognizedName();

  if (isUnlockedForGroup(id, recognizedGroup)) {
    const { html: loreHtml, leftover } =
      interleaveImages(revealedLoreHtml(id, recognizedGroup, recognizedName), id);
    return {
      html: `
        <div class="locked-content unlocked">
          <div class="panel-section-title">Revealed Lore</div>
          ${loreHtml}
        </div>
      `,
      leftover,
    };
  }
  // Still locked — no images shown anywhere yet (top block or embedded),
  // so no need to run interleaveImages here; the raw text just sits
  // hidden in #locked-${id} until checkPassword's full panel rebuild
  // re-renders everything under the new, unlocked state.
  return {
    html: `
      <div class="password-section">
        <div class="password-label">Restricted Lore</div>
        <p class="password-flavor">Some knowledge must be found, not given. If your party has explored this place, enter one of your characters' names below.</p>
        <div class="password-input-row">
          <input type="text" class="password-input" id="pw-${id}" placeholder="Enter a character's name…" onkeydown="if(event.key==='Enter') checkPassword('${id}')">
          <button class="password-btn" onclick="checkPassword('${id}')">Unlock</button>
        </div>
        <div class="password-error" id="pw-err-${id}"></div>
      </div>
      <div class="locked-content" id="locked-${id}">
        <div class="panel-section-title">Revealed Lore</div>
        ${revealedLoreHtml(id, recognizedGroup, recognizedName)}
      </div>
    `,
    leftover: [],
  };
}

// Shared by the per-location lock (checkPassword) and the topbar widget
// (submitReenterName): recognizes whatever's typed into `input` as the
// admin password or a character name, remembering the result. A real
// character name records which group this visitor is even if the region
// they typed it into isn't unlocked for that group yet. Returns false (and
// shows the error, re-focusing the emptied input) if nothing matched.
function recognizeEnteredName(input, err) {
  const entered = input.value.trim().toLowerCase();
  if (entered === ADMIN_PASSWORD) {
    setRecognizedIdentity({ admin: true });
    return true;
  }
  if (NAME_TO_GROUP[entered]) {
    setRecognizedIdentity({ groupId: NAME_TO_GROUP[entered], name: entered });
    return true;
  }
  err.textContent = "That name isn't recognized here.";
  err.classList.add('show');
  input.value = '';
  input.focus();
  return false;
}

function checkPassword(id) {
  const input = document.getElementById('pw-' + id);
  const err = document.getElementById('pw-err-' + id);

  if (!recognizeEnteredName(input, err)) return;

  if (isUnlockedForGroup(id, getRecognizedGroup())) {
    // Rebuild the whole panel from scratch rather than just patching the
    // lore text in place — the panel was first rendered under the old
    // (locked) state, so its title is still "???" and its scene
    // images/portraits/track player (all gated the same way as the lore
    // text, see buildWMContent/interleaveImages/trackButtonHtml) are
    // still hidden. A full re-render is the only way all of those pick up
    // the new unlock state together, instead of only the text updating
    // while everything else stays stuck showing "still locked".
    if (currentOpenPanelId) openPanel(currentOpenPanelId, currentOpenPanelLabel);
  } else {
    err.textContent = "Your party hasn't explored this yet.";
    err.classList.add('show');
    input.value = '';
  }
}

// Global "re-enter a character's name" widget in the topbar (see
// template.html) — the per-location password boxes above only ever come
// up contextually, inside a locked panel; this lets a visitor switch
// which character they're recognized as (or recognize themselves for the
// first time) from anywhere, not just while looking at a specific locked
// region.
function toggleReenterNamePrompt() {
  const prompt = document.getElementById('reenter-name-prompt');
  if (!prompt) return;
  const opening = !prompt.classList.contains('open');
  prompt.classList.toggle('open', opening);
  if (opening) document.getElementById('reenter-name-input').focus();
}

function submitReenterName() {
  const input = document.getElementById('reenter-name-input');
  const err = document.getElementById('reenter-name-error');

  if (!recognizeEnteredName(input, err)) return;

  err.classList.remove('show');
  input.value = '';
  document.getElementById('reenter-name-prompt').classList.remove('open');

  // Whatever panel is currently open (if any) was rendered under the old
  // recognition, so its title/lore/track player/images may all be stale
  // — rebuild it against the newly recognized group rather than leaving
  // it showing the previous visitor's view until manually reopened.
  if (currentOpenPanelId) openPanel(currentOpenPanelId, currentOpenPanelLabel);
}
