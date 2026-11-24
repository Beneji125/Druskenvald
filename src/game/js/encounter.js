// Encounters: when a haunting turns on you. There is no fighting back.
// The house throws its fear at you, and you weave a small lantern flame
// (your nerve) through it; every hit adds Dread. Between its attacks you
// choose what to do:
//
//   Act      say or do something: what you know and what you've seen
//            opens up new things to try. The right ones bring Calm.
//   Item     use something you carry: some calm, some protect, and some
//            destroy (the dark way out).
//   Release  once Calm is full, let the haunting go: the peaceful end.
//   Flee     run, if the encounter lets you.
//
// If Dread fills, your nerve breaks: you flee to the porch, and the
// encounter is there again, from the start, next time.
//
// Each encounter is data (ENCOUNTERS, in rooms.js): who you face, what
// they say, the Acts and Items that work on them, and their attack
// patterns. runEncounter() plays one and resolves with how it ended:
// 'released', 'killed', 'fled' or 'broke'.

const EASY_KEY = 'crooked_house_easy';
const ARENA_W = 360, ARENA_H = 220;
const SOUL_R = 6;

const enc = { active: null };
function easyMode() { return store.get(EASY_KEY) === 'on'; }

async function runEncounter(def) {
  const root = $('encounter');
  const st = { def, calm: 0, turn: 0, result: null, shrink: 0, flags: {} };
  enc.active = st;
  game.inEncounter = true;
  ui.select(null);
  root.innerHTML = `
    <div class="enc-panel">
      <div class="enc-top">
        <canvas class="enc-foe" width="256" height="256" aria-hidden="true"></canvas>
        <div class="enc-who">
          <div class="enc-name"></div>
          <div class="enc-calm" role="meter" aria-label="Calm" aria-valuemin="0"><span class="enc-calm-label">Calm</span><span class="enc-calm-pips"></span></div>
          <div class="enc-dread" role="meter" aria-label="Dread" aria-valuemin="0" aria-valuemax="10"><span class="enc-calm-label">Dread</span><span class="enc-dread-pips"></span></div>
        </div>
      </div>
      <p class="enc-text" aria-live="polite"></p>
      <div class="enc-arena-wrap"><canvas class="enc-arena" aria-label="Dodge with the arrow keys or WASD, or drag"></canvas></div>
      <div class="enc-menu"></div>
    </div>`;
  root.hidden = false;
  ui.overlay = 'encounter';
  root.querySelector('.enc-name').textContent = def.name;
  drawFoe(root.querySelector('.enc-foe'), def.art);
  drawCalm(st);
  drawEncDread();
  const arena = root.querySelector('.enc-arena');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  arena.width = ARENA_W * dpr; arena.height = ARENA_H * dpr;
  arena.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  drawArena(arena, st, { x: ARENA_W / 2, y: ARENA_H / 2 }, [], 0);
  try {
    await encSay(def.intro);
    // A hazard: no choices, just get through each attack once.
    if (def.hazard) {
      for (const p of def.patterns) {
        if ((await dodge(st, arena, p)) === 'broke') { st.result = 'broke'; break; }
        st.turn++;
      }
      if (!st.result) { st.result = 'survived'; await encSay(def.survived); }
    }
    while (!st.result) {
      const choice = await encMenu(st);
      await encChoose(st, choice);
      if (!st.result && game.dread >= DREAD_MAX) st.result = 'broke';   // e.g. from something you did
      if (st.result) break;
      const outcome = await dodge(st, arena, def.patterns[st.turn % def.patterns.length]);
      if (outcome === 'broke') { st.result = 'broke'; break; }
      st.turn++;
      if (def.afterTurn) { const line = def.afterTurn(st); if (line) await encSay(line); }
    }
    if (st.result === 'broke') await encSay(def.broke || 'It is too much. You turn and run.');
  } finally {
    root.hidden = true;
    root.innerHTML = '';
    if (ui.overlay === 'encounter') ui.overlay = null;
    enc.active = null;
    game.inEncounter = false;
    lockInput(400);
  }
  if (st.result === 'broke') await nerveBreaks();
  return st.result;
}

// ─── Text and the menu ────────────────────────────────────────────────

function encSay(text) {
  if (!text) return Promise.resolve();
  const root = $('encounter');
  const p = root.querySelector('.enc-text');
  p.textContent = text;
  return encButtons([{ id: 'ok', text: 'Continue' }]);
}

// Shows buttons; resolves with the chosen id. Number keys pick, Escape
// picks a 'back' button if there is one.
function encButtons(buttons) {
  return new Promise(resolve => {
    const menu = $('encounter').querySelector('.enc-menu');
    menu.innerHTML = '';
    buttons.forEach((b, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'enc-btn' + (b.dark ? ' dark' : '') + (b.disabled ? ' disabled' : '');
      el.innerHTML = `<span class="key">${i + 1}</span>`;
      el.appendChild(document.createTextNode(b.text));
      el.addEventListener('click', () => done(b.id));
      menu.appendChild(el);
    });
    let answered = false;
    const onKey = e => {
      const n = Number(e.key);
      if (n >= 1 && n <= buttons.length) { e.preventDefault(); e.stopImmediatePropagation(); done(buttons[n - 1].id); }
      else if (e.key === 'Escape' && buttons.some(b => b.id === 'back')) { e.preventDefault(); e.stopImmediatePropagation(); done('back'); }
      else if ((e.key === 'Enter' || e.key === ' ') && buttons.length === 1) { e.preventDefault(); e.stopImmediatePropagation(); done(buttons[0].id); }
      else e.stopImmediatePropagation();
    };
    const done = id => {
      if (answered) return;
      answered = true;
      document.removeEventListener('keydown', onKey, true);
      menu.innerHTML = '';
      resolve(id);
    };
    setTimeout(() => { if (!answered) document.addEventListener('keydown', onKey, true); }, 120);
    menu.querySelector('button')?.focus({ preventScroll: true });
  });
}

async function encMenu(st) {
  const def = st.def;
  const p = $('encounter').querySelector('.enc-text');
  for (;;) {
    p.textContent = typeof def.prompt === 'function' ? def.prompt(st) : (def.prompt || 'What do you do?');
    const ready = st.calm >= def.calmMax;
    const top = [
      { id: 'act', text: 'Act' },
      { id: 'item', text: 'Item' },
      { id: 'release', text: ready ? 'Release' : 'Release (not yet)', disabled: !ready },
    ];
    if (!def.noFlee) top.push({ id: 'flee', text: 'Flee' });
    const pick = await encButtons(top);
    if (pick === 'act') {
      const acts = def.acts.filter(a => !a.when || a.when(st));
      const sub = await encButtons([...acts.map(a => ({ id: a.id, text: a.text, dark: a.dark })), { id: 'back', text: 'Back' }]);
      if (sub !== 'back') return { type: 'act', act: acts.find(a => a.id === sub) };
    } else if (pick === 'item') {
      if (!game.items.length) { p.textContent = 'You aren’t carrying anything.'; await encButtons([{ id: 'back', text: 'Back' }]); continue; }
      const sub = await encButtons([...game.items.map(id => ({ id, text: ITEMS[id].name, dark: !!(def.items[id] && def.items[id].kill) })), { id: 'back', text: 'Back' }]);
      if (sub !== 'back') return { type: 'item', id: sub };
    } else if (pick === 'release') {
      if (ready) return { type: 'release' };
      p.textContent = def.notReady || 'It isn’t ready to let go. Not yet.';
      await encButtons([{ id: 'back', text: 'Back' }]);
    } else if (pick === 'flee') return { type: 'flee' };
  }
}

async function encChoose(st, choice) {
  const def = st.def;
  if (choice.type === 'act') {
    const a = choice.act;
    const line = typeof a.line === 'function' ? a.line(st) : a.line;
    if (a.once && st.flags['did_' + a.id]) { await encSay(a.again || 'You’ve tried that. It isn’t enough on its own.'); return; }
    st.flags['did_' + a.id] = true;
    await encSay(line);
    if (a.calm) addCalm(st, a.calm);
    if (a.run) await a.run(st);
  } else if (choice.type === 'item') {
    const u = def.items[choice.id];
    if (!u) { await encSay(`The ${ITEMS[choice.id].name.toLowerCase()} is no use here.`); return; }
    await encSay(typeof u.line === 'function' ? u.line(st) : u.line);
    if (u.consume) takeItem(choice.id);
    if (u.calm) addCalm(st, u.calm);
    if (u.shrink) st.shrink = Math.min(0.6, st.shrink + u.shrink);
    if (u.run) await u.run(st);
    if (u.kill) st.result = 'killed';
  } else if (choice.type === 'release') {
    st.result = 'released';
  } else if (choice.type === 'flee') {
    await encSay(def.flee || 'You back away, and it lets you go. For now.');
    st.result = 'fled';
  }
}

function addCalm(st, n) {
  st.calm = clamp(st.calm + n, 0, st.def.calmMax);
  drawCalm(st);
  if (st.calm >= st.def.calmMax && st.def.calmFull) $('encounter').querySelector('.enc-text').textContent = st.def.calmFull;
}

function drawCalm(st) {
  const pips = $('encounter').querySelector('.enc-calm-pips');
  pips.innerHTML = '';
  for (let i = 0; i < st.def.calmMax; i++) { const s = document.createElement('span'); if (i < st.calm) s.className = 'on'; pips.appendChild(s); }
  $('encounter').querySelector('.enc-calm').setAttribute('aria-valuenow', String(st.calm));
  $('encounter').querySelector('.enc-calm').setAttribute('aria-valuemax', String(st.def.calmMax));
}

// Your Dread, which is what the encounter hits.
function drawEncDread() {
  const el = $('encounter').querySelector('.enc-dread-pips');
  if (!el) return;
  if (el.children.length !== DREAD_MAX) { el.innerHTML = ''; for (let i = 0; i < DREAD_MAX; i++) el.appendChild(document.createElement('span')); }
  [...el.children].forEach((s, i) => s.classList.toggle('on', i < game.dread));
  el.parentElement.classList.toggle('high', game.dread >= 7);
  el.parentElement.setAttribute('aria-valuenow', String(Math.round(game.dread)));
}

function drawFoe(canvas, art) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 256);
  const img = typeof art === 'function' ? art() : spriteTexture(art).image;
  const s = Math.min(240 / img.width, 240 / img.height);
  ctx.drawImage(img, (256 - img.width * s) / 2, 256 - img.height * s - 4, img.width * s, img.height * s);
}

// ─── Dodging ──────────────────────────────────────────────────────────
// A pattern: { duration (seconds), text (shown while it plays), start(api)
// optional, spawn(api, t, dt) every frame }. Through `api` a pattern adds
// shots: { x, y, vx, vy, r } circles, or { rect: [w, h] } bars, with an
// optional `glyph` (a character drawn on it), `color`, `life` (seconds),
// `update(shot, dt, t)`, and `hurt: false` for things that only look
// dangerous. `api.soul` is where the flame is; `api.rand` is seeded.

function dodge(st, canvas, pattern) {
  return new Promise(resolve => {
    const easy = easyMode();
    const speed = easy ? 0.7 : 1;
    const ctx = canvas.getContext('2d');
    const soul = { x: ARENA_W / 2, y: ARENA_H / 2 };
    const shots = [];
    const held = new Set();
    // `t` drives the pattern (capped per frame, so a stutter can't teleport
    // shots); the attack ends by the real clock, so a slow device doesn't
    // stretch it out.
    let t = 0, last = performance.now(), invuln = 0, ended = false;
    const started = performance.now();
    const rand = seededRandom(st.turn * 101 + st.def.name.length);
    // Lingering effects from what hit you: `blind` (the arena goes dark
    // but for a little light round the flame) and `slow` (sluggish).
    const fx = { blind: 0, slow: 0 };
    // The salt line: a ring inside which shots crawl.
    const pad = st.shrink * 60;
    const inSalt = s => pad && s.x > pad * 1.6 && s.x < ARENA_W - pad * 1.6 && s.y > pad && s.y < ARENA_H - pad;
    const bounds = { x0: SOUL_R, x1: ARENA_W - SOUL_R, y0: SOUL_R, y1: ARENA_H - SOUL_R };
    const api = {
      soul, rand, w: ARENA_W, h: ARENA_H, easy,
      add(s) { s.age = 0; if (s.vx) s.vx *= speed; if (s.vy) s.vy *= speed; if (s.hurt === undefined) s.hurt = true; shots.push(s); return s; },
      edge() { const side = Math.floor(rand() * 4); return side === 0 ? { x: rand() * ARENA_W, y: -10 } : side === 1 ? { x: ARENA_W + 10, y: rand() * ARENA_H } : side === 2 ? { x: rand() * ARENA_W, y: ARENA_H + 10 } : { x: -10, y: rand() * ARENA_H }; },
      effect(name, secs) { fx[name] = Math.max(fx[name], easy ? secs * 0.6 : secs); },
      aim(from, sp) { const dx = soul.x - from.x, dy = soul.y - from.y, d = Math.hypot(dx, dy) || 1; return { vx: dx / d * sp, vy: dy / d * sp }; },
    };
    $('encounter').querySelector('.enc-text').textContent = pattern.text || '';
    $('encounter').querySelector('.enc-menu').innerHTML = '<span class="enc-dodge-hint">Move with WASD or the arrow keys · drag on a touch screen</span>';
    if (pattern.start) pattern.start(api);
    const KEYS = { w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
    const down = e => { const k = KEYS[e.key.toLowerCase()]; if (k) { held.add(k); e.preventDefault(); } e.stopImmediatePropagation(); };
    const up = e => { const k = KEYS[e.key.toLowerCase()]; if (k) held.delete(k); e.stopImmediatePropagation(); };
    let drag = null;
    const rect = () => canvas.getBoundingClientRect();
    const pdown = e => { canvas.setPointerCapture(e.pointerId); const r = rect(); drag = { x: e.clientX, y: e.clientY, sx: soul.x, sy: soul.y, k: ARENA_W / r.width }; };
    const pmove = e => { if (!drag) return; soul.x = drag.sx + (e.clientX - drag.x) * drag.k; soul.y = drag.sy + (e.clientY - drag.y) * drag.k; };
    const pup = () => { drag = null; };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    canvas.addEventListener('pointerdown', pdown);
    canvas.addEventListener('pointermove', pmove);
    canvas.addEventListener('pointerup', pup);
    canvas.addEventListener('pointercancel', pup);
    const finish = how => {
      if (ended) return;
      ended = true;
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      canvas.removeEventListener('pointerdown', pdown);
      canvas.removeEventListener('pointermove', pmove);
      canvas.removeEventListener('pointerup', pup);
      canvas.removeEventListener('pointercancel', pup);
      drawArena(canvas, st, soul, [], 0);
      resolve(how);
    };
    const frame = now => {
      if (ended) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden) { requestAnimationFrame(frame); return; }
      t += dt;
      const v = 140 * dt * (fx.slow > 0 ? 0.45 : 1);
      fx.blind = Math.max(0, fx.blind - dt); fx.slow = Math.max(0, fx.slow - dt);
      if (held.has('u')) soul.y -= v; if (held.has('d')) soul.y += v;
      if (held.has('l')) soul.x -= v; if (held.has('r')) soul.x += v;
      soul.x = clamp(soul.x, bounds.x0, bounds.x1); soul.y = clamp(soul.y, bounds.y0, bounds.y1);
      pattern.spawn(api, t, dt);
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        s.age += dt;
        if (s.update) s.update(s, dt, t);
        const k = inSalt(s) ? 0.35 : 1;
        s.x += (s.vx || 0) * dt * k; s.y += (s.vy || 0) * dt * k;
        const gone = (s.life && s.age > s.life) || s.x < -60 || s.x > ARENA_W + 60 || s.y < -60 || s.y > ARENA_H + 60;
        if (gone) { shots.splice(i, 1); continue; }
        if (!s.hurt || invuln > 0 || (s.armed !== undefined && s.age < s.armed)) continue;
        const hit = s.rect
          ? Math.abs(soul.x - s.x) < s.rect[0] / 2 + SOUL_R * 0.6 && Math.abs(soul.y - s.y) < s.rect[1] / 2 + SOUL_R * 0.6
          : Math.hypot(soul.x - s.x, soul.y - s.y) < (s.r || 6) + SOUL_R * 0.6;
        if (hit) {
          invuln = easy ? 1.4 : 0.9;
          sound.hit();
          addDread(easy ? 0.5 : 1);
          drawEncDread();
          if (s.onHit) s.onHit(s, api);
          if (game.dread >= DREAD_MAX) { finish('broke'); return; }
        }
      }
      invuln = Math.max(0, invuln - dt);
      drawArena(canvas, st, soul, shots, invuln, pad, fx);
      if ((now - started) / 1000 >= pattern.duration) { finish('done'); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function drawArena(canvas, st, soul, shots, invuln, pad = 0, fx = {}) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, ARENA_W, ARENA_H);
  ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  if (pad) {                                   // the salt line: a pale ring keeping things out
    ctx.strokeStyle = 'rgba(235,230,215,0.55)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 2;
    ctx.strokeRect(pad * 1.6, pad, ARENA_W - pad * 3.2, ARENA_H - pad * 2); ctx.setLineDash([]);
  }
  shots.forEach(s => {
    const fade = s.armed !== undefined && s.age < s.armed ? 0.35 : 1;
    ctx.globalAlpha = fade;
    ctx.fillStyle = s.color || '#d8c49a';
    if (s.rect) { ctx.fillRect(s.x - s.rect[0] / 2, s.y - s.rect[1] / 2, s.rect[0], s.rect[1]); }
    else if (s.glyph) { ctx.font = `${Math.round((s.r || 6) * 2.4)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(s.glyph, s.x, s.y); }
    else { ctx.beginPath(); ctx.arc(s.x, s.y, s.r || 6, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
  });
  if (fx.blind > 0) {                          // blinded: darkness, but for the flame's own light
    const a = Math.min(1, fx.blind * 2);
    const m = ctx.createRadialGradient(soul.x, soul.y, 18, soul.x, soul.y, 60);
    m.addColorStop(0, 'rgba(7,6,10,0)'); m.addColorStop(1, `rgba(7,6,10,${0.97 * a})`);
    ctx.fillStyle = m; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  }
  // The flame: your nerve. It flickers while you're shaken.
  if (invuln > 0 && Math.floor(invuln * 12) % 2) return;
  const g = ctx.createRadialGradient(soul.x, soul.y, 0, soul.x, soul.y, SOUL_R * 2.6);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,180,90,0.9)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(soul.x, soul.y, SOUL_R * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4dc';
  ctx.beginPath(); ctx.moveTo(soul.x, soul.y - SOUL_R * 1.4); ctx.quadraticCurveTo(soul.x + SOUL_R, soul.y, soul.x, soul.y + SOUL_R * 0.8); ctx.quadraticCurveTo(soul.x - SOUL_R, soul.y, soul.x, soul.y - SOUL_R * 1.4); ctx.fill();
}
