#!/usr/bin/env node
// Browser smoke test: loads the built site (docs/) in headless Chromium as
// one character of each group and walks through everything that group can
// read, failing on anything a player would notice as broken:
//   - a script error or console error,
//   - an image or track that doesn't exist under docs/,
//   - lore left with unexpanded {{npc:…}} / [[image]] tokens or a
//     "missing image" warning,
//   - a Chronicle beat with no text, or a Chronicle that doesn't match the
//     group's timeline.
//
//   node build.js && node tests/smoke.js
//
// Needs Playwright (npm install --no-save playwright && npx playwright
// install chromium). Run by .github/workflows/check-build.yml on every push.

const fs = require('fs');
const http = require('http');
const path = require('path');

let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright')); }

const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const DATA = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/descriptions.json'), 'utf8'));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml' };

function serve() {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
    const file = path.join(DOCS, rel);
    if (!file.startsWith(DOCS) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404); res.end(); return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// Everything checked inside the page for one group; returns what it found.
function walkGroup() {
  const problems = [];
  const media = new Set();
  const group = getRecognizedGroup();
  const collect = root => {
    root.querySelectorAll('img[src]').forEach(img => media.add(img.getAttribute('src')));
    root.querySelectorAll('[data-src], audio[src], source[src]').forEach(n => media.add(n.getAttribute('data-src') || n.getAttribute('src')));
  };
  const checkText = (where, el) => {
    const html = el.innerHTML;
    if (html.includes('missing image')) problems.push(`${where}: missing image`);
    if (/\{\{(npc|species|creature):/.test(html)) problems.push(`${where}: unexpanded {{…}} link`);
    if (/\[\[[^\]]+\]\]/.test(el.textContent)) problems.push(`${where}: unplaced [[image]] token`);
  };

  if (getActiveMapKey() !== 'wickermoor') openWickermoor();
  const panel = document.getElementById('panel-content');
  const attempt = (where, fn) => {
    try { fn(); } catch (e) { problems.push(`${where}: ${e.message}`); }
  };
  WICKERMOOR_HOTSPOTS.filter(hs => isUnlockedForGroup(hs.id, group)).forEach(hs => attempt(`panel ${hs.id}`, () => {
    openPanel(hs.id, hs.label);
    checkText(`panel ${hs.id}`, panel);
    collect(panel);
  }));
  closePanel();

  const content = document.getElementById('codex-content');
  ['bestiary', 'gallery', 'chronicle'].forEach(tab => attempt(`codex ${tab}`, () => {
    openCodex(tab);
    checkText(`codex ${tab}`, content);
    collect(content);
  }));
  const steps = timelineSteps(group);
  const entries = [...content.querySelectorAll('.chronicle-entry')];
  if (entries.length !== steps.length) problems.push(`chronicle: ${entries.length} beats shown, timeline has ${steps.length}`);
  entries.forEach(li => {
    const body = li.querySelector('.chronicle-body');
    if (!body || !body.textContent.trim()) problems.push(`chronicle step ${li.dataset.step} (${li.dataset.place}): no text`);
  });
  closeCodex();
  return { problems, media: [...media] };
}

(async () => {
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch();
  const failures = [];

  for (const [group, names] of Object.entries(DATA.GROUPS)) {
    const name = names[0];
    const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    page.on('pageerror', e => failures.push(`group ${group}: script error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') failures.push(`group ${group}: console error: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) failures.push(`group ${group}: ${r.status()} ${decodeURIComponent(r.url().slice(base.length))}`); });

    await page.goto(base);
    await page.click('.enter-btn');
    await page.waitForTimeout(800);
    const recognized = await page.evaluate(n => {
      document.getElementById('reenter-name-input').value = n;
      submitReenterName();
      return getRecognizedGroup();
    }, name);
    if (recognized !== group) { failures.push(`group ${group}: "${name}" was recognized as group ${recognized}`); continue; }

    const { problems, media } = await page.evaluate(walkGroup);
    problems.forEach(p => failures.push(`group ${group}: ${p}`));
    media.forEach(src => {
      if (!fs.existsSync(path.join(DOCS, decodeURIComponent(src)))) failures.push(`group ${group}: missing file ${src}`);
    });
    console.log(`group ${group} (${name}): checked ${media.length} images/tracks, ${problems.length} problem(s)`);
    await page.close();
  }

  await browser.close();
  server.close();
  if (failures.length) {
    console.error(`\n${failures.length} problem(s):\n  ` + [...new Set(failures)].join('\n  '));
    process.exit(1);
  }
  console.log('All good.');
})().catch(e => { console.error(e); process.exit(1); });
