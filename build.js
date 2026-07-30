// Combines src/template.html + src/styles.css + src/app.js +
// src/data/descriptions.json + src/data/hotspots.json into the final,
// self-contained docs/index.html — the file GitHub Pages serves (repo
// setting: Pages source = main branch, /docs folder).
//
// Run with: node build.js
//
// Edit the files under src/, never docs/index.html directly — it is
// generated and gets overwritten. Media assets (maps, scenes/, species/,
// audio/, the cover image) live directly in docs/ since they're served
// as-is, not built from anything.
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC_DIR = path.join(ROOT, 'src');
const OUTPUT_FILE = path.join(ROOT, 'docs', 'index.html');

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

function build() {
  const template = readFile('template.html');
  const css = readFile('styles.css');
  const appJs = readFile('app.js');
  const descriptions = readJson('data/descriptions.json');
  const hotspots = readJson('data/hotspots.json');

  const combinedScript = [
    '// ═══════════════════════════════════════════════════════════════',
    '// DATA — generated from src/data/descriptions.json and src/data/hotspots.json',
    '// Edit those files, not this block.',
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

build();
