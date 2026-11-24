// Combines src/template.html + src/styles.css + src/js/*.js +
// src/data/{descriptions,bestiary,hotspots}.json into the final,
// self-contained docs/index.html — the file GitHub Pages serves (repo
// setting: Pages source = main branch, /docs folder).
//
// Run with:
//   node build.js            validate the data, then build
//   node build.js --report   also list unused assets, unexplored locations,
//                            NPCs without a bio, etc. (a to-do list, not errors)
//   node build.js --force    build even if validation found errors
//   node build.js --hash X   print the hash of X (for ADMIN_PASSWORD_HASH
//                            in src/js/unlocks.js), without building
//
// Edit the files under src/, never docs/index.html directly — it is
// generated and gets overwritten. Media assets (maps, scenes/, species/,
// audio/, the cover image) live directly in docs/ since they're served
// as-is, not built from anything.
//
// Lore shorthand — anywhere in descriptions.json's text, instead of writing
// link markup by hand:
//   {{npc:renathyr}}                   -> link showing the NPC's own name
//   {{npc:renathyr|Sir Marius}}        -> same link, custom text
//   {{species:gnarlborn}}              -> link showing the species' name
//   {{species:gnarlborn|gnarlborn}}    -> same link, custom text
//   {{creature:kackle}}                -> link to a BESTIARY entry (opens it
//                                         in the Codex), also with |text
// An unknown id stops the build, so a typo can't ship as a dead link.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { nameHash } = require('./src/js/hash.js');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const DOCS_DIR = path.join(ROOT, 'docs');
const OUTPUT_FILE = path.join(DOCS_DIR, 'index.html');

const args = new Set(process.argv.slice(2));
const REPORT = args.has('--report');
const FORCE = args.has('--force');

// Script files under src/js/, joined in this order. They all share one
// <script> scope, so order matters only for code that runs immediately at
// load (e.g. util.js's `store` must exist before unlocks.js reads it);
// functions can call each other freely across files. A .js file in src/js/
// that isn't listed here stops the build rather than being silently left out.
const SCRIPT_FILES = [
  'hash.js',
  'util.js',
  'music.js',
  'lighting.js',
  'ambient.js',
  'map.js',
  'panels.js',
  'unlocks.js',
  'router.js',
  'index.js',
  'codex.js',
  'main.js',
];

function readFile(relPath) {
  return fs.readFileSync(path.join(SRC_DIR, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readFile(relPath));
}

// Renders one `const NAME = <value>;` declaration per top-level key of a
// data object, in the order the keys appear in the source JSON file.
// `compact` writes each value on one line — for data that's mostly long
// lists of coordinates (explore.json), which would otherwise put every
// number on a line of its own.
function toConstDeclarations(dataObject, compact = false) {
  return Object.entries(dataObject)
    .map(([name, value]) => `const ${name} = ${compact ? JSON.stringify(value) : JSON.stringify(value, null, 2)};`)
    .join('\n\n');
}

// Applies fn to every string inside a JSON value, returning a new value.
// `where` is a readable path (e.g. "WM_LORE.wm_crimson.byGroup.1") so
// validation messages can say exactly which entry has the problem.
function mapStrings(value, fn, where = '') {
  if (typeof value === 'string') return fn(value, where);
  if (Array.isArray(value)) return value.map((v, i) => mapStrings(v, fn, `${where}[${i}]`));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn, where ? `${where}.${k}` : k);
    return out;
  }
  return value;
}

function forEachString(value, fn) {
  mapStrings(value, (s, where) => { fn(s, where); return s; });
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Shorthand expansion ───────────────────────────────────────────
const SHORTHAND_RE = /\{\{(npc|species|creature|explore):([^}|]+)(?:\|([^}]*))?\}\}/g;
const SHORTHAND_TABLES = { npc: 'NPCS', species: 'SPECIES', creature: 'BESTIARY', explore: 'EXPLORE_PLACES' };

// {{explore:id|text}} is a link to the game page for a place in
// src/data/explore.json (`page`, e.g. crooked-house.html); its text
// defaults to the place's title.
function expandShorthand(data, errors, explorePlaces = {}) {
  const tables = { npc: data.NPCS || {}, species: data.SPECIES || {}, creature: data.BESTIARY || {}, explore: explorePlaces };
  return mapStrings(data, (str, where) => str.replace(SHORTHAND_RE, (match, kind, rawId, rawText) => {
    const id = rawId.trim();
    const entry = tables[kind][id];
    if (!entry) {
      errors.push(`${where}: ${match} — no ${SHORTHAND_TABLES[kind]} entry "${id}"`);
      return match;
    }
    if (kind === 'explore') {
      return `<a class="explore-link" href="${escHtml(entry.page)}">${rawText !== undefined ? rawText : escHtml(entry.title)}</a>`;
    }
    const text = rawText !== undefined ? rawText : entry.name;
    return `<strong class="${kind}-link" data-${kind}="${escHtml(id)}" role="button" tabindex="0">${text}</strong>`;
  }));
}

// ── Validation ────────────────────────────────────────────────────
const MEDIA_RE = /\.(jpe?g|png|webp|gif|svg|mp3|ogg|wav|m4a)$/i;

function imageBasename(p) {
  return p.split('/').pop().replace(/\.[^./]+$/, '');
}

function validate(data, hotspots) {
  const errors = [];
  const warnings = [];
  const NPCS = data.NPCS || {};
  const SPECIES = data.SPECIES || {};
  const GROUPS = data.GROUPS || {};
  const UNLOCKS = data.UNLOCKS || {};

  // Every referenced media file must exist under docs/.
  const referencedMedia = new Set();
  forEachString(data, (s, where) => {
    if (!MEDIA_RE.test(s) || /[<>]/.test(s)) return;
    referencedMedia.add(s);
    if (!fs.existsSync(path.join(DOCS_DIR, s))) errors.push(`${where}: file not found — docs/${s}`);
  });

  // Link markup must point at real NPC / species entries; inline onclick
  // still works but bypasses this check, so nudge toward data attributes.
  forEachString(data, (s, where) => {
    for (const m of s.matchAll(/data-npc="([^"]+)"/g)) {
      if (!NPCS[m[1]]) errors.push(`${where}: data-npc="${m[1]}" — no NPCS entry with that id`);
    }
    for (const m of s.matchAll(/data-creature="([^"]+)"/g)) {
      if (!(data.BESTIARY || {})[m[1]]) errors.push(`${where}: data-creature="${m[1]}" — no BESTIARY entry with that id`);
    }
    for (const m of s.matchAll(/data-species="([^"]+)"/g)) {
      if (!SPECIES[m[1]]) errors.push(`${where}: data-species="${m[1]}" — no SPECIES entry with that id`);
    }
    if (/onclick=/.test(s)) warnings.push(`${where}: inline onclick — prefer {{npc:id}} / {{species:id}}`);
  });

  // [[image]] tokens in Wickermoor lore must name an image listed for that
  // same id in WM_SCENES or WM_PORTRAITS (see interleaveImages in src/js/panels.js).
  for (const [id, entry] of Object.entries(data.WM_LORE || {})) {
    const available = new Set([...(data.WM_SCENES?.[id] || []), ...(data.WM_PORTRAITS?.[id] || [])].map(imageBasename));
    forEachString(entry, (s, where) => {
      for (const m of s.matchAll(/\[\[([^\]]+)\]\]/g)) {
        const name = m[1].trim();
        if (!available.has(name)) {
          errors.push(`WM_LORE.${id}${where ? '.' + where : ''}: [[${name}]] — not listed in WM_SCENES/WM_PORTRAITS for "${id}"`);
        }
      }
    });
  }

  // Bestiary "met by" lists must name real groups; per-picture limits must
  // name the creature's own pictures and real groups.
  for (const [id, c] of Object.entries(data.BESTIARY || {})) {
    (c.groups || []).forEach(g => { if (!GROUPS[g]) errors.push(`BESTIARY.${id}.groups: unknown group "${g}"`); });
    for (const [src, groups] of Object.entries(c.imageGroups || {})) {
      if (!(c.images || []).includes(src)) errors.push(`BESTIARY.${id}.imageGroups: "${src}" isn't in its images`);
      groups.forEach(g => { if (!GROUPS[g]) errors.push(`BESTIARY.${id}.imageGroups: unknown group "${g}"`); });
    }
  }

  // An NPC's Faces of the Hollow location must be a real Wickermoor location.
  for (const [id, n] of Object.entries(data.NPCS || {})) {
    if (n.location && !(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === n.location)) {
      errors.push(`NPCS.${id}.location: "${n.location}" is not a Wickermoor hotspot id`);
    }
    // metBy: the groups who have met this NPC, shown in their Gallery even
    // if no lore they can read names them.
    if (n.metBy !== undefined) {
      if (!Array.isArray(n.metBy)) errors.push(`NPCS.${id}.metBy: should be a list of group ids, like ["1", "3"]`);
      else n.metBy.filter(g => !GROUPS[g]).forEach(g => errors.push(`NPCS.${id}.metBy: "${g}" is not a group in GROUPS`));
      if (!n.body) warnings.push(`NPCS.${id}: met by a group but has no bio`);
    }
  }

  // Chronicle entries must belong to real Wickermoor locations.
  for (const id of Object.keys(data.WM_CHAPTERS || {})) {
    if (!(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === id)) errors.push(`WM_CHAPTERS.${id}: no Wickermoor hotspot has this id`);
  }
  for (const id of Object.keys(data.WM_TEASERS || {})) {
    if (!(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === id)) errors.push(`WM_TEASERS.${id}: no Wickermoor hotspot has this id`);
  }

  // The story timeline: real groups, real Wickermoor places, and any named
  // beat must be a section heading in that group's write-up for that place.
  const meaningful = h => !!(h && h.replace(/<[^>]*>/g, '').trim());
  for (const [g, beats] of Object.entries(data.STORY_ORDER || {})) {
    if (!GROUPS[g]) errors.push(`STORY_ORDER.${g}: unknown group`);
    beats.forEach((b, i) => {
      const where = `STORY_ORDER.${g}[${i}]`;
      if (!(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === b.place)) { errors.push(`${where}: "${b.place}" is not a Wickermoor hotspot id`); return; }
      const rule = UNLOCKS[b.place];
      if (!(rule === 'all' || (Array.isArray(rule) && rule.includes(g)))) warnings.push(`${where}: "${b.place}" isn't unlocked for group ${g}, so it won't show`);
      if (!b.beat) return;
      const entry = (data.WM_LORE || {})[b.place];
      const text = typeof entry === 'string' ? entry : (entry && meaningful(entry.byGroup?.[g]) ? entry.byGroup[g] : entry?.default) || '';
      const titles = [...text.matchAll(/<p class="panel-subheader">([\s\S]*?)<\/p>/g)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
      if (!titles.includes(b.beat)) errors.push(`${where}: no section "${b.beat}" in group ${g}'s ${b.place} text (has: ${titles.join(' | ') || 'no headings'})`);
    });
  }

  // A character name must belong to exactly one group.
  const seenNames = {};
  for (const [groupId, names] of Object.entries(GROUPS)) {
    for (const name of names) {
      const key = name.toLowerCase();
      if (seenNames[key] && seenNames[key] !== groupId) {
        errors.push(`GROUPS: "${name}" is in both group ${seenNames[key]} and group ${groupId}`);
      }
      seenNames[key] = groupId;
    }
  }

  // UNLOCKS must reference real groups and real hotspots.
  const hotspotIds = new Set([
    ...(hotspots.MAIN_HOTSPOTS_SVG || []),
    ...(hotspots.WICKERMOOR_HOTSPOTS || []),
  ].map(h => h.id));
  for (const [id, rule] of Object.entries(UNLOCKS)) {
    if (rule !== 'all') {
      if (!Array.isArray(rule)) errors.push(`UNLOCKS.${id}: must be "all" or a list of group ids`);
      else rule.forEach(g => { if (!GROUPS[g]) errors.push(`UNLOCKS.${id}: unknown group "${g}"`); });
    }
    if (!hotspotIds.has(id)) warnings.push(`UNLOCKS.${id}: no map hotspot has this id`);
  }

  return { errors, warnings, referencedMedia, hotspotIds };
}

// ── Optional to-do report ─────────────────────────────────────────
function listFiles(dir) {
  const full = path.join(DOCS_DIR, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter(f => MEDIA_RE.test(f)).map(f => `${dir}/${f}`);
}

function printReport(data, hotspots, { referencedMedia, hotspotIds }) {
  console.log('\n── Report ───────────────────────────────────────────');

  const wmIds = (hotspots.WICKERMOOR_HOTSPOTS || []).map(h => h.id).filter(id => id.startsWith('wm_'));
  const unexplored = wmIds.filter(id => !(data.UNLOCKS || {})[id]);
  console.log(`\nWickermoor locations no group has unlocked yet (${unexplored.length}):`);
  unexplored.forEach(id => console.log(`  ${id}`));

  const noBio = Object.entries(data.NPCS || {}).filter(([, n]) => !n.body).map(([id]) => id);
  console.log(`\nNPCs without a bio (${noBio.length}): ${noBio.join(', ')}`);

  // (No line for locations without an ambience track: not every place
  // needs one — that's a choice, not a gap.)

  // The default background track is set in the script, not the data.
  const appJs = SCRIPT_FILES.map(f => readFile('js/' + f)).join('\n');
  for (const dir of ['scenes', 'chapter-art', 'npc', 'monsters', 'species', 'audio']) {
    const unused = listFiles(dir).filter(f => !referencedMedia.has(f) && !appJs.includes(f));
    console.log(`\nNot yet used from docs/${dir}/ (${unused.length}):`);
    unused.forEach(f => console.log(`  ${f}`));
  }
  console.log('');
}

// Each map's tiny blurred preview (made by optimize_assets.py into
// src/data/map-previews.json) becomes the background of its <img>, so
// there's a soft version of the map on screen while the full 3MB image
// downloads — mostly noticeable the first time Wickermoor Hollow opens on a
// slow connection. Matches the img by its src or (before loading starts,
// see loadWickermoorMap) its data-src. A missing or out-of-date preview is
// only a warning: the site works the same without one.
function mapPreviewCss(warnings) {
  let previews = {};
  try { previews = readJson('data/map-previews.json'); } catch { /* none yet */ }
  const rules = [];
  for (const file of ['MAP_Druskenvald.jpeg', 'MAP_Wickermoor_Hollow.jpeg']) {
    const p = previews[file];
    const mapPath = path.join(DOCS_DIR, file);
    if (!p) { warnings.push(`${file}: no blurred preview — run python optimize_assets.py --apply`); continue; }
    if (fs.existsSync(mapPath) && crypto.createHash('sha1').update(fs.readFileSync(mapPath)).digest('hex') !== p.sha1) {
      warnings.push(`${file}: its blurred preview is out of date — run python optimize_assets.py --apply`);
    }
    rules.push(`  .map-img[src="${file}"], .map-img[data-src="${file}"] { background: url(${p.dataUri}) center / contain no-repeat; }`);
  }
  return rules.length ? `\n\n  /* Blurred map previews — generated by build.js from src/data/map-previews.json */\n${rules.join('\n')}` : '';
}

// Checks src/data/explore.json: the floor plan exists, every point of
// interest and scripted event names a real room or point, and each floor's
// starting spot is somewhere walkable. Also that the trimmed three.js build
// (docs/vendor/three-explore.min.js) exports everything the game uses —
// if the game starts using another part of three.js, rebuild the vendor
// file as the README describes.
function validateExplore(places, errors, warnings, gameJs) {
  const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  for (const [id, place] of Object.entries(places)) {
    (place.floors || []).forEach(floor => {
      const where = `EXPLORE_PLACES.${id}.${floor.id}`;
      if (!fs.existsSync(path.join(DOCS_DIR, floor.image || ''))) errors.push(`${where}: floor image not found — docs/${floor.image}`);
      const rooms = new Set((floor.rooms || []).map(r => r.id));
      const pois = new Set((floor.pois || []).map(p => p.id));
      (floor.pois || []).forEach(p => { if (!rooms.has(p.room)) errors.push(`${where}.pois.${p.id}: no room "${p.room}"`); });
      (floor.events || []).forEach(ev => {
        if (!rooms.has(ev.room)) errors.push(`${where}.events.${ev.id}: no room "${ev.room}"`);
        if (ev.after && !pois.has(ev.after)) errors.push(`${where}.events.${ev.id}: no point of interest "${ev.after}"`);
      });
      (floor.walls || []).forEach((w, i) => { if (!w.points || w.points.length < 2) errors.push(`${where}.walls[${i}]: needs at least two points`); });
      const walkable = (floor.walkable || []).some(a => inPoly(floor.start.x, floor.start.y, a.points));
      if (!walkable) errors.push(`${where}.start: (${floor.start.x}, ${floor.start.y}) is outside every walkable area`);
    });
  }
  const vendor = path.join(DOCS_DIR, 'vendor', 'three-explore.min.js');
  if (!fs.existsSync(vendor)) { errors.push('docs/vendor/three-explore.min.js is missing — see the README'); return; }
  const exportsBlock = (fs.readFileSync(vendor, 'utf8').match(/export\s*\{([^}]*)\}\s*;?\s*$/) || [])[1] || '';
  const exported = new Set(exportsBlock.split(',').map(e => e.trim().split(/\s+as\s+/).pop()));
  const used = new Set([...gameJs.matchAll(/\bTHREE\.([A-Z][A-Za-z0-9]*)/g)].map(m => m[1]));
  const missing = [...used].filter(n => !exported.has(n));
  if (missing.length) errors.push(`docs/vendor/three-explore.min.js doesn't export ${missing.join(', ')} — rebuild it (see the README)`);
}

function build() {
  const template = readFile('template.html');
  const css = readFile('styles.css');
  const unlisted = fs.readdirSync(path.join(SRC_DIR, 'js'))
    .filter(f => f.endsWith('.js') && !SCRIPT_FILES.includes(f));
  if (unlisted.length) {
    console.error(`error: src/js/ has files not listed in SCRIPT_FILES (build.js): ${unlisted.join(', ')}`);
    process.exit(1);
  }
  const appJs = SCRIPT_FILES
    .map(f => `// ─── src/js/${f} ${'─'.repeat(Math.max(3, 56 - f.length))}\n${readFile('js/' + f).trim()}`)
    .join('\n\n');
  const hotspots = readJson('data/hotspots.json');

  const expandErrors = [];
  // bestiary.json is kept separate only for size; it's merged in here and
  // treated exactly like the rest of descriptions.json from now on.
  const explore = readJson('data/explore.json');
  const descriptions = expandShorthand({ ...readJson('data/descriptions.json'), ...readJson('data/bestiary.json') }, expandErrors, explore.EXPLORE_PLACES);
  const result = validate(descriptions, hotspots);
  // Character names are validated in plain text above, then shipped to the
  // page only as hashes (see src/js/hash.js) so they can't be read from it.
  descriptions.GROUPS = Object.fromEntries(
    Object.entries(descriptions.GROUPS || {}).map(([g, names]) => [g, names.map(nameHash)]));
  const errors = [...expandErrors, ...result.errors];

  const previewCss = mapPreviewCss(result.warnings);
  const gameJs = readGameScript();
  validateExplore(explore.EXPLORE_PLACES || {}, errors, result.warnings, gameJs);
  result.warnings.forEach(w => console.warn(`warning: ${w}`));
  errors.forEach(e => console.error(`error: ${e}`));
  if (REPORT) printReport(descriptions, hotspots, result);

  if (errors.length && !FORCE) {
    console.error(`\n${errors.length} error(s) — docs/index.html was NOT rebuilt. Fix them, or run with --force.`);
    process.exit(1);
  }

  const combinedScript = [
    '// ═══════════════════════════════════════════════════════════════',
    '// DATA — generated from src/data/descriptions.json and src/data/hotspots.json',
    '// Edit those files, not this block. Each top-level key becomes a global',
    '// const (LORE, NPCS, WM_LORE, SETTLEMENT_LIGHTS, ...) read by src/js/*.js.',
    '// ═══════════════════════════════════════════════════════════════',
    toConstDeclarations(descriptions),
    toConstDeclarations(hotspots),
    toConstDeclarations(explore, true),
    appJs,
  ].join('\n\n');

  // Using split/join rather than String.replace: the CSS and script text
  // contain literal "$" sequences (e.g. `${label}` template literals),
  // and String.replace treats "$"-prefixed sequences in its replacement
  // argument as special patterns ($&, $1, etc.), which would corrupt them.
  const output = template
    .split('/*__STYLES__*/').join(css.trim() + previewCss)
    .split('/*__APP_SCRIPT__*/').join(combinedScript);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Built ${path.relative(ROOT, OUTPUT_FILE)} (${output.length} bytes)`);
  buildGame(explore, gameJs);
}

// ─── The Crooked House game (docs/crooked-house.html) ───────────────────
// Its own page, built the same way from src/game/: template.html, game.css
// and the scripts in GAME_FILES (joined in this order into one module
// script), after the house data from src/data/explore.json.
const GAME_FILES = ['core.js', 'art.js', 'audio.js', 'world.js', 'ui.js', 'story.js', 'items.js', 'dread.js', 'jasper.js', 'encounter.js', 'rooms.js', 'flashback.js', 'rhythm.js', 'main.js'];
const GAME_OUTPUT = path.join(DOCS_DIR, 'crooked-house.html');

function readGameScript() {
  const dir = path.join(SRC_DIR, 'game', 'js');
  const unlisted = fs.readdirSync(dir).filter(f => f.endsWith('.js') && !GAME_FILES.includes(f));
  if (unlisted.length) {
    console.error(`error: src/game/js/ has files not listed in GAME_FILES (build.js): ${unlisted.join(', ')}`);
    process.exit(1);
  }
  return GAME_FILES
    .map(f => `// ─── src/game/js/${f} ${'─'.repeat(Math.max(3, 52 - f.length))}\n${readFile('game/js/' + f).trim()}`)
    .join('\n\n');
}

function buildGame(explore, gameJs) {
  const script = [
    '// DATA — generated from src/data/explore.json; edit that, not this.',
    toConstDeclarations(explore, true),
    gameJs,
  ].join('\n\n');
  // Catch a syntax error here rather than as a blank page in the browser.
  try { new Function(script); } catch (err) {
    console.error(`error: the Crooked House game script doesn't parse: ${err.message}\n  (check src/game/js/ with: node --check src/game/js/<file>.js)`);
    process.exit(1);
  }
  const output = readFile('game/template.html')
    .split('/*__STYLES__*/').join(readFile('game/game.css').trim())
    .split('/*__GAME_SCRIPT__*/').join(script);
  fs.writeFileSync(GAME_OUTPUT, output);
  console.log(`Built ${path.relative(ROOT, GAME_OUTPUT)} (${output.length} bytes)`);
}

const hashArg = process.argv.indexOf('--hash');
if (hashArg !== -1) {
  const word = process.argv[hashArg + 1];
  if (!word) { console.error('usage: node build.js --hash <word>'); process.exit(1); }
  console.log(nameHash(word));
} else {
  build();
}
