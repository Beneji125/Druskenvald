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
    // A hazard: no choices, just get through it.
    if (def.hazard) {
      if (def.round) {
        if ((await playRound(st, arena)) === 'broke') st.result = 'broke';
      } else for (const p of def.patterns) {
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
      const outcome = def.round ? await playRound(st, arena) : await dodge(st, arena, def.patterns[st.turn % def.patterns.length]);
      if (outcome === 'broke') { st.result = 'broke'; break; }
      st.turn++;
      if (st.roundEnd) { const r = st.roundEnd; st.roundEnd = null; if (r !== 'continue') st.result = r; }
      if (st.result) break;
      if (st.roundLine) { const line = st.roundLine; st.roundLine = null; await encSay(line); }
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
      if (b.hint) { const h = document.createElement('small'); h.className = 'enc-hint'; h.textContent = b.hint; el.appendChild(h); }
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
      const sub = await encButtons([...acts.map(a => ({ id: a.id, text: a.text, dark: a.dark, hint: a.hint })), { id: 'back', text: 'Back' }]);
      if (sub !== 'back') return { type: 'act', act: acts.find(a => a.id === sub) };
    } else if (pick === 'item') {
      if (!game.items.length) { p.textContent = 'You aren’t carrying anything.'; await encButtons([{ id: 'back', text: 'Back' }]); continue; }
      const sub = await encButtons([...game.items.map(id => ({ id, text: ITEMS[id].name, dark: !!(def.items[id] && def.items[id].kill), hint: def.items[id] && def.items[id].hint })), { id: 'back', text: 'Back' }]);
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
  // (a painting still on its way: draw it when it arrives)
  if (img instanceof HTMLImageElement && !(img.complete && img.naturalWidth)) { img.addEventListener('load', () => drawFoe(canvas, art), { once: true }); return; }
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
    const rand = seededRandom(st.turn * 101 + st.def.name.length);
    // Lingering effects from what hit you: `blind` (the arena goes dark
    // but for a little light round the flame) and `slow` (sluggish).
    const fx = { blind: 0, slow: 0 };
    // The salt line: a ring inside which shots crawl.
    const pad = st.shrink * 60;
    const inSalt = s => pad && s.x > pad * 1.6 && s.x < ARENA_W - pad * 1.6 && s.y > pad && s.y < ARENA_H - pad;
    const bounds = { x0: SOUL_R, x1: ARENA_W - SOUL_R, y0: SOUL_R, y1: ARENA_H - SOUL_R };
    const api = {
      soul, rand, w: ARENA_W, h: ARENA_H, easy, st,
      end(how = 'done') { finish(how); },
      calm(n) { addCalm(st, n); },
      say(text) { $('encounter').querySelector('.enc-text').textContent = text; },
      hurt(n = 1) { if (invuln > 0) return; invuln = easy ? 1.4 : 0.9; sound.hit(); addDread(easy ? n * 0.5 : n); drawEncDread(); if (game.dread >= DREAD_MAX) finish('broke'); },
      add(s) { s.age = 0; if (s.vx) s.vx *= speed; if (s.vy) s.vy *= speed; if (s.hurt === undefined) s.hurt = true; shots.push(s); return s; },
      edge() { const side = Math.floor(rand() * 4); return side === 0 ? { x: rand() * ARENA_W, y: -10 } : side === 1 ? { x: ARENA_W + 10, y: rand() * ARENA_H } : side === 2 ? { x: rand() * ARENA_W, y: ARENA_H + 10 } : { x: -10, y: rand() * ARENA_H }; },
      effect(name, secs) { fx[name] = Math.max(fx[name], easy ? secs * 0.6 : secs); },
      aim(from, sp) { const dx = soul.x - from.x, dy = soul.y - from.y, d = Math.hypot(dx, dy) || 1; return { vx: dx / d * sp, vy: dy / d * sp }; },
    };
    $('encounter').querySelector('.enc-text').textContent = pattern.text || '';
    let paused = false, elapsed = 0;
    const togglePause = () => { paused = !paused; held.clear(); drag = null; if (paused) drawRoundPaused(canvas); };
    roundMenu(pattern, null, togglePause);
    if (pattern.start) pattern.start(api);
    const KEYS = { w: 'u', arrowup: 'u', s: 'd', arrowdown: 'd', a: 'l', arrowleft: 'l', d: 'r', arrowright: 'r' };
    const down = e => {
      e.stopImmediatePropagation();
      if (isPauseKey(e)) { e.preventDefault(); if (!e.repeat) togglePause(); return; }
      const k = KEYS[e.key.toLowerCase()]; if (k && !paused) { held.add(k); e.preventDefault(); }
    };
    const up = e => { const k = KEYS[e.key.toLowerCase()]; if (k) held.delete(k); e.stopImmediatePropagation(); };
    let drag = null;
    const rect = () => canvas.getBoundingClientRect();
    const pdown = e => { if (paused) { togglePause(); return; } canvas.setPointerCapture(e.pointerId); const r = rect(); drag = { x: e.clientX, y: e.clientY, sx: soul.x, sy: soul.y, k: ARENA_W / r.width }; };
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
      if (document.hidden && !paused) togglePause();
      if (paused) { requestAnimationFrame(frame); return; }
      t += dt; elapsed += dt;
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
        if (s.take && Math.hypot(soul.x - s.x, soul.y - s.y) < (s.r || 6) + SOUL_R) { shots.splice(i, 1); s.take(s, api); if (ended) return; continue; }
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
      if (elapsed >= pattern.duration) { finish('done'); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// ─── Rounds ───────────────────────────────────────────────────────────
// Between turns, each encounter plays its own small challenge (its
// `round(st)`, in rooms.js and challenges.js): either a dodge pattern (as
// before) or a challenge `{ title, hint, duration, start(api), update(api,
// dt), draw(ctx, api) }`. First a moment to get ready: the goal, the
// controls, 3-2-1.

// Shared by both kinds of round. The line under the arena: how to play,
// an on-screen button for the round's action key (for touch screens; the
// key still works), and a pause button.
function roundMenu(spec, onAction, onPause) {
  const menu = $('encounter').querySelector('.enc-menu');
  menu.innerHTML = '';
  const hint = document.createElement('span');
  hint.className = 'enc-dodge-hint';
  hint.textContent = spec.hint || 'Move with WASD or the arrow keys · drag on a touch screen';
  menu.appendChild(hint);
  const row = document.createElement('div');
  row.className = 'enc-round-buttons';
  if (spec.action && onAction) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'enc-action'; b.textContent = spec.action;
    b.addEventListener('pointerdown', e => { e.preventDefault(); onAction(); });
    b.addEventListener('keydown', e => { if (e.key === 'Enter') e.preventDefault(); });
    row.appendChild(b);
  }
  if (onPause) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'enc-pause'; b.textContent = 'Pause';
    b.setAttribute('aria-label', 'Pause the round (Escape or P)');
    b.addEventListener('click', () => { b.blur(); onPause(); });
    row.appendChild(b);
  }
  menu.appendChild(row);
}

// A paused round: the arena dimmed, and how to go on.
function drawRoundPaused(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.fillStyle = 'rgba(7,6,10,0.72)'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8d5a3'; ctx.font = '600 22px Cinzel, Georgia, serif';
  ctx.fillText('Paused', ARENA_W / 2, ARENA_H / 2 - 12);
  ctx.fillStyle = '#c9a96e'; ctx.font = '13px Georgia, serif';
  ctx.fillText('Escape, P or a tap to go on', ARENA_W / 2, ARENA_H / 2 + 16);
  ctx.restore();
}
const isPauseKey = e => e.key === 'Escape' || e.key.toLowerCase() === 'p';

async function playRound(st, canvas) {
  const spec = st.def.round(st);
  await getReady(canvas, spec);
  return spec.spawn ? dodge(st, canvas, spec) : challenge(st, canvas, spec);
}

function getReady(canvas, spec) {
  const root = $('encounter');
  root.querySelector('.enc-text').textContent = spec.text || spec.title || '';
  roundMenu(spec);
  const ctx = canvas.getContext('2d');
  const t0 = performance.now(), ms = easyMode() ? 2200 : 1700;
  return new Promise(res => {
    const frame = now => {
      const k = (now - t0) / ms;
      ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      if (spec.preview) spec.preview(ctx);
      ctx.fillStyle = 'rgba(7,6,10,0.55)'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#c9a96e'; ctx.font = '600 15px Cinzel, Georgia, serif';
      ctx.fillText(spec.title || 'Get ready', ARENA_W / 2, ARENA_H / 2 - 30);
      ctx.fillStyle = '#e8d5a3'; ctx.font = '40px Cinzel, Georgia, serif';
      ctx.fillText(String(Math.max(1, 3 - Math.floor(k * 3))), ARENA_W / 2, ARENA_H / 2 + 14);
      if (k < 1) requestAnimationFrame(frame); else res();
    };
    requestAnimationFrame(frame);
  });
}

// A challenge: input (keys held and pressed, the pointer), a clock, and an
// `api` for the round to hurt you, calm them, speak, or end early.
function challenge(st, canvas, spec) {
  return new Promise(resolve => {
    const easy = easyMode();
    const ctx = canvas.getContext('2d');
    const keys = new Set(), pressed = [];
    const pointer = { x: null, y: null, down: false, tapped: false };
    let ended = false, last = performance.now(), paused = false, elapsed = 0;
    const togglePause = () => { paused = !paused; keys.clear(); pointer.down = false; if (paused) drawRoundPaused(canvas); };
    const api = {
      st, easy, w: ARENA_W, h: ARENA_H, keys, pressed, pointer, t: 0, invuln: 0,
      rand: seededRandom(st.turn * 131 + st.def.name.length * 7),
      hurt(n = 1) {
        if (api.invuln > 0) return false;
        api.invuln = easy ? 1.3 : 0.85;
        sound.hit(); addDread(easy ? n * 0.5 : n); drawEncDread();
        if (game.dread >= DREAD_MAX) finish('broke');
        return true;
      },
      calm(n) { addCalm(st, n); },
      say(text) { $('encounter').querySelector('.enc-text').textContent = text; },
      end(how = 'done') { finish(how); },
      held: (...ks) => ks.some(k => keys.has(k)),
      press: (...ks) => pressed.some(k => ks.includes(k)),
    };
    $('encounter').querySelector('.enc-text').textContent = spec.text || '';
    roundMenu(spec, () => { if (!paused) pressed.push(spec.actionKey || ' '); }, togglePause);
    if (spec.start) spec.start(api);
    const down = e => {
      if (isPauseKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) togglePause(); return; }
      if (paused) { e.stopImmediatePropagation(); return; }
      const k = e.key.toLowerCase();
      if (!e.repeat) pressed.push(k);
      keys.add(k);
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'w', 'a', 's', 'd'].includes(k)) e.preventDefault();
      e.stopImmediatePropagation();
    };
    const up = e => { keys.delete(e.key.toLowerCase()); e.stopImmediatePropagation(); };
    const toArena = e => { const r = canvas.getBoundingClientRect(); return [(e.clientX - r.left) * ARENA_W / r.width, (e.clientY - r.top) * ARENA_H / r.height]; };
    const pdown = e => { if (paused) { togglePause(); return; } canvas.setPointerCapture(e.pointerId); [pointer.x, pointer.y] = toArena(e); pointer.down = true; pointer.tapped = true; };
    const pmove = e => { [pointer.x, pointer.y] = toArena(e); };
    const pup = () => { pointer.down = false; };
    document.addEventListener('keydown', down, true);
    document.addEventListener('keyup', up, true);
    canvas.addEventListener('pointerdown', pdown);
    canvas.addEventListener('pointermove', pmove);
    canvas.addEventListener('pointerup', pup);
    canvas.addEventListener('pointercancel', pup);
    function finish(how) {
      if (ended) return;
      ended = true;
      document.removeEventListener('keydown', down, true);
      document.removeEventListener('keyup', up, true);
      canvas.removeEventListener('pointerdown', pdown);
      canvas.removeEventListener('pointermove', pmove);
      canvas.removeEventListener('pointerup', pup);
      canvas.removeEventListener('pointercancel', pup);
      if (spec.stop) spec.stop(api, how);
      resolve(how);
    }
    const frame = now => {
      if (ended) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (document.hidden && !paused) togglePause();
      if (paused) { requestAnimationFrame(frame); return; }
      api.t += dt; elapsed += dt; api.invuln = Math.max(0, api.invuln - dt);
      api.left = Math.max(0, spec.duration - elapsed);
      spec.update(api, dt);
      pressed.length = 0; pointer.tapped = false;
      if (ended) return;
      ctx.save(); spec.draw(ctx, api); ctx.restore();
      // time left, as a thin bar along the bottom
      if (spec.duration) { ctx.fillStyle = 'rgba(232,213,163,0.35)'; ctx.fillRect(0, ARENA_H - 3, ARENA_W * api.left / spec.duration, 3); }
      if (spec.duration && api.left <= 0) { finish('done'); return; }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

// The lantern flame that stands for you, drawn at (x, y).
function drawSoul(ctx, x, y, flicker = false) {
  if (flicker) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, SOUL_R * 2.6);
  g.addColorStop(0, 'rgba(255,240,200,1)'); g.addColorStop(0.35, 'rgba(255,180,90,0.9)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, SOUL_R * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff4dc';
  ctx.beginPath(); ctx.moveTo(x, y - SOUL_R * 1.4); ctx.quadraticCurveTo(x + SOUL_R, y, x, y + SOUL_R * 0.8); ctx.quadraticCurveTo(x - SOUL_R, y, x, y - SOUL_R * 1.4); ctx.fill();
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
    else if (s.draw) s.draw(ctx, s);
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
