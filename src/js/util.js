// Small shared helpers used across the other files: the storage
// wrapper, number clamps, and string escaping.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

// localStorage can throw outright (Safari private mode, browsers set to
// block site data, sandboxed iframes) rather than just returning null.
// Every read/write goes through this wrapper so a blocked store degrades to
// an in-memory one for the visit — music settings and unlocks still work,
// they just aren't remembered next time — instead of an exception halting
// whatever click handler touched it.
const store = (() => {
  const memory = {};
  return {
    get(key) {
      try { return localStorage.getItem(key); }
      catch { return key in memory ? memory[key] : null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); }
      catch { memory[key] = String(value); }
    },
    remove(key) {
      try { localStorage.removeItem(key); }
      catch { delete memory[key]; }
    },
  };
})();

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function clampNum(v, min, max) { return Math.max(min, Math.min(max, v)); }

// HTML-attribute-escapes a string (order matters: & must go first, or it
// would double-encode the entities produced by the other replacements).
function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// Strips the folder and extension off an image path so a token can name
// an image by something short and readable instead of by position —
// "scenes/SCENE_Chapter11_Wickermoor_Village.webp" is referenced as
// "[[SCENE_Chapter11_Wickermoor_Village]]", "chapter-art/Drowned
// Crossroads.jpg" as "[[Drowned Crossroads]]".
function imageBasename(path) {
  return path.split('/').pop().replace(/\.[^./]+$/, '');
}
