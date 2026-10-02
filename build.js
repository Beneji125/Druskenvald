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
function toConstDeclarations(dataObject) {
  return Object.entries(dataObject)
    .map(([name, value]) => `const ${name} = ${JSON.stringify(value, null, 2)};`)
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
const SHORTHAND_RE = /\{\{(npc|species|creature):([^}|]+)(?:\|([^}]*))?\}\}/g;
const SHORTHAND_TABLES = { npc: 'NPCS', species: 'SPECIES', creature: 'BESTIARY' };

function expandShorthand(data, errors) {
  const tables = { npc: data.NPCS || {}, species: data.SPECIES || {}, creature: data.BESTIARY || {} };
  return mapStrings(data, (str, where) => str.replace(SHORTHAND_RE, (match, kind, rawId, rawText) => {
    const id = rawId.trim();
    const entry = tables[kind][id];
    if (!entry) {
      errors.push(`${where}: ${match} — no ${SHORTHAND_TABLES[kind]} entry "${id}"`);
      return match;
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

  // Bestiary "met by" lists must name real groups.
  for (const [id, c] of Object.entries(data.BESTIARY || {})) {
    (c.groups || []).forEach(g => { if (!GROUPS[g]) errors.push(`BESTIARY.${id}.groups: unknown group "${g}"`); });
  }

  // An NPC's Rogues' Gallery location must be a real Wickermoor location.
  for (const [id, n] of Object.entries(data.NPCS || {})) {
    if (n.location && !(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === n.location)) {
      errors.push(`NPCS.${id}.location: "${n.location}" is not a Wickermoor hotspot id`);
    }
  }

  // Chronicle entries must belong to real Wickermoor locations.
  for (const id of Object.keys(data.WM_CHAPTERS || {})) {
    if (!(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === id)) errors.push(`WM_CHAPTERS.${id}: no Wickermoor hotspot has this id`);
  }
  for (const id of Object.keys(data.WM_TEASERS || {})) {
    if (!(hotspots.WICKERMOOR_HOTSPOTS || []).some(h => h.id === id)) errors.push(`WM_TEASERS.${id}: no Wickermoor hotspot has this id`);
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
  const descriptions = expandShorthand({ ...readJson('data/descriptions.json'), ...readJson('data/bestiary.json') }, expandErrors);
  const result = validate(descriptions, hotspots);
  // Character names are validated in plain text above, then shipped to the
  // page only as hashes (see src/js/hash.js) so they can't be read from it.
  descriptions.GROUPS = Object.fromEntries(
    Object.entries(descriptions.GROUPS || {}).map(([g, names]) => [g, names.map(nameHash)]));
  const errors = [...expandErrors, ...result.errors];

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
    appJs,
  ].join('\n\n');

  // Using split/join rather than String.replace: the CSS and script text
  // contain literal "$" sequences (e.g. `${label}` template literals),
  // and String.replace treats "$"-prefixed sequences in its replacement
  // argument as special patterns ($&, $1, etc.), which would corrupt them.
  const output = template
    .split('/*__STYLES__*/').join(css.trim())
    .split('/*__APP_SCRIPT__*/').join(combinedScript);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output);
  console.log(`Built ${path.relative(ROOT, OUTPUT_FILE)} (${output.length} bytes)`);
}

const hashArg = process.argv.indexOf('--hash');
if (hashArg !== -1) {
  const word = process.argv[hashArg + 1];
  if (!word) { console.error('usage: node build.js --hash <word>'); process.exit(1); }
  console.log(nameHash(word));
} else {
  build();
}
