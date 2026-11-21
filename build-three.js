// Rebuilds docs/vendor/three-explore.min.js: three.js trimmed down to just
// the parts the Crooked House game uses (every THREE.Something named in
// src/game/js/*.js), minified. Run it when `node build.js` says the vendor
// file is missing something:
//
//   node build-three.js
//
// Needs npm (comes with Node) and an internet connection: it installs
// three.js and esbuild into a temporary folder, not into this project.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const THREE_VERSION = '0.187.0';
const ESBUILD_VERSION = '0.25.10';
const ROOT = __dirname;
const GAME_JS = path.join(ROOT, 'src', 'game', 'js');
const OUT = path.join(ROOT, 'docs', 'vendor', 'three-explore.min.js');

const names = new Set();
for (const f of fs.readdirSync(GAME_JS).filter(f => f.endsWith('.js'))) {
  for (const m of fs.readFileSync(path.join(GAME_JS, f), 'utf8').matchAll(/\bTHREE\.([A-Z][A-Za-z0-9]*)/g)) names.add(m[1]);
}
const list = [...names].sort();
console.log(`three.js parts used (${list.length}): ${list.join(', ')}`);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-explore-'));
try {
  fs.writeFileSync(path.join(tmp, 'package.json'), '{"private":true}');
  fs.writeFileSync(path.join(tmp, 'entry.js'), `export { ${list.join(', ')} } from 'three';\n`);
  execSync(`npm install --silent --no-audit --no-fund three@${THREE_VERSION} esbuild@${ESBUILD_VERSION}`, { cwd: tmp, stdio: 'inherit' });
  const banner = `/* three.js r${THREE_VERSION.split('.')[1]} (MIT, (c) 2010-2026 three.js authors, https://threejs.org), trimmed to what the Crooked House game uses. Rebuild: node build-three.js */`;
  execSync(`npx esbuild entry.js --bundle --minify --format=esm --target=es2020 --legal-comments=none --log-level=warning --outfile=out.js "--banner:js=${banner}"`, { cwd: tmp, stdio: 'inherit' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.copyFileSync(path.join(tmp, 'out.js'), OUT);
  console.log(`Wrote ${path.relative(ROOT, OUT)} (${fs.statSync(OUT).size} bytes). Now run: node build.js`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
