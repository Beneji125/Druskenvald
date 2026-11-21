// The game loop: the renderer, walking and turning (one square, one
// quarter-turn at a time, eased so it doesn't jump), the lantern, the
// storm, and the controls — keyboard, the on-screen pad, and the buttons.

const STEP_MS = 230, TURN_MS = 190;
let renderer = null;
const motion = { from: null, to: null, t0: 0, ms: 0, yawFrom: 0, yawTo: 0, bump: 0 };
const queued = [];
let yaw = 0, nextStrike = 4, strikes = [], clock = 0;

function quality() {
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  return (mem && mem <= 2) || (cores && cores <= 2) ? 'low' : 'high';
}

function startGame(fresh) {
  if (fresh || !loadGame()) newGame();
  sound.start();
  $('start').hidden = true;
  $('game').hidden = false;
  if (!renderer) {
    const q = quality();
    try {
      renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: q !== 'low', powerPreference: 'high-performance' });
    } catch (err) {
      console.warn(err);
      $('game').hidden = true;
      $('start').hidden = false;
      $('start-error').hidden = false;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1 : 1.5));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    buildWorld(renderer, q);
    addCharacters();
    ui.mapImage = new Image();
    ui.mapImage.src = FLOOR.image;
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(loop);
  }
  world.sprites.find(s => s.userData.kind === 'petunia').visible = !game.flags.petuniaGone;
  yaw = -game.dir * Math.PI / 2;
  motion.from = motion.to = null;
  ui.setDread(game.dread);
  const c = GRID.at(game.cx, game.cy);
  ui.setRoom(roomById(c.room)?.name || '');
  game.roomsSeen.delete(c.room);
  enteredCell(null);
  $('view').focus({ preventScroll: true });
}

// The people (and weasels) of the house: sprites that come and go.
function addCharacters() {
  world.sprites.push(addSprite(world.scene, 'petunia', 520, 470));
  world.weasels = [0, 1, 2, 3, 4].map(i => {
    const s = addSprite(world.scene, 'weasel', DANCE.x, DANCE.y);
    s.userData.orbit = { r: 40 + i * 14, speed: (i % 2 ? 1 : -1) * (1.4 + i * 0.25), phase: i * 1.3 };
    s.visible = false;
    return s;
  });
  world.patrini = addSprite(world.scene, 'patrini', 930, 875);
  world.patrini.visible = false;
  world.crookedMan = addSprite(world.scene, 'crookedMan', 0, 0);
  world.crookedMan.visible = false;
  [world.patrini, world.crookedMan].forEach(s => { s.material.transparent = true; s.material.depthWrite = false; s.material.alphaTest = 0; });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  world.camera.aspect = w / h;
  world.camera.fov = w < h ? 82 : 72;
  world.camera.updateProjectionMatrix();
}

// ─── Moving ───────────────────────────────────────────────────────────

function busy() { return game.busy || !!ui.overlay || !!motion.to || game.flags.breaking; }

function act(cmd) {
  if (busy()) { if (queued.length < 1 && !game.busy && !ui.overlay) queued.push(cmd); return; }
  if (cmd === 'left' || cmd === 'right') return turn(cmd === 'left' ? -1 : 1);
  if (cmd === 'use') { const t = thingAtHand(); if (t) useThing(t); return; }
  const rel = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
  if (rel === undefined) return;
  // On the cursed dance floor your feet don't always obey.
  if (game.curse && Math.random() < 0.3) {
    ui.log('You spin with the dancers.', 'scare');
    return turn(Math.random() < 0.5 ? -1 : 1);
  }
  step((game.dir + rel) % 4);
}

function step(dir) {
  const c = GRID.at(game.cx, game.cy);
  if (!canStep(c, dir)) { motion.bump = performance.now(); return; }
  const n = GRID.at(c.cx + DIRS[dir][0], c.cy + DIRS[dir][1]);
  motion.from = c; motion.to = n; motion.t0 = performance.now(); motion.ms = STEP_MS;
  motion.yawFrom = motion.yawTo = yaw;
  game.cx = n.cx; game.cy = n.cy;
}

function turn(d) {
  game.dir = (game.dir + d + 4) % 4;
  motion.from = motion.to = GRID.at(game.cx, game.cy);
  motion.t0 = performance.now(); motion.ms = TURN_MS;
  motion.yawFrom = yaw; motion.yawTo = yaw - d * Math.PI / 2;
  motion.turning = true;
}

function teleport(cx, cy, dir) {
  const prev = GRID.at(game.cx, game.cy);
  game.cx = cx; game.cy = cy; game.dir = dir;
  yaw = -dir * Math.PI / 2;
  motion.from = motion.to = null;
  queued.length = 0;
  enteredCell(prev);
}

function stepBack() {
  const back = (game.dir + 2) % 4, c = GRID.at(game.cx, game.cy);
  if (canStep(c, back)) teleport(c.cx + DIRS[back][0], c.cy + DIRS[back][1], game.dir);
}

function strike(strength = 1) {
  strikes.push(clock, clock + 0.12 + Math.random() * 0.1);
  if (Math.random() < 0.5) strikes.push(clock + 0.35 + Math.random() * 0.2);
  setTimeout(() => sound.thunder(strength), 250 + Math.random() * 1000 * (1.3 - Math.min(1.2, strength)));
}

// ─── The loop ─────────────────────────────────────────────────────────

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  if (document.hidden || $('game').hidden) { last = now; return; }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;

  // Where the camera is: easing between squares and between headings.
  let px, pz, bob = 0;
  const here = GRID.at(game.cx, game.cy);
  if (motion.to) {
    const k = Math.min(1, (now - motion.t0) / motion.ms), e = 1 - (1 - k) ** 3;
    px = lerp(motion.from.x, motion.to.x, e); pz = lerp(motion.from.y, motion.to.y, e);
    yaw = lerp(motion.yawFrom, motion.yawTo, e);
    if (!motion.turning) bob = Math.sin(k * Math.PI) * 3;
    if (k >= 1) {
      const from = motion.from, wasStep = !motion.turning;
      motion.from = motion.to = null; motion.turning = false;
      yaw = -game.dir * Math.PI / 2 + Math.round((yaw + game.dir * Math.PI / 2) / (Math.PI * 2)) * Math.PI * 2;
      if (wasStep) enteredCell(from);
      if (queued.length && !busy()) act(queued.shift());
    }
  } else { px = here.x; pz = here.y; }
  // Bumping into a wall: a little lurch forward and back.
  const bk = (now - motion.bump) / 200;
  const bump = bk < 1 ? Math.sin(bk * Math.PI) * 6 : 0;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const cam = world.camera;
  cam.position.set(px + fx * (bump - 10), EYE_H + bob, pz + fz * (bump - 10));
  cam.rotation.order = 'YXZ';
  cam.rotation.y = yaw;
  // Never quite level, in a house with no right angles. The cursed waltz
  // sets the room swaying.
  const sway = game.curse ? Math.sin(clock * 2.1) * 0.06 : 0;
  cam.rotation.z = Math.sin(clock * 0.37) * 0.018 + Math.sin(clock * 0.13) * 0.012 + sway;
  cam.rotation.x = -0.04 + Math.sin(clock * 0.29) * 0.01 + (game.curse ? Math.sin(clock * 1.3) * 0.03 : 0);

  // The lantern, held a little to the right and below the eye.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  world.lantern.position.set(cam.position.x + rx * 9 + fx * 8, EYE_H - 14 + bob, cam.position.z + rz * 9 + fz * 8);
  world.lantern.intensity = 300 * (1 + Math.sin(clock * 13.1) * 0.04 + Math.sin(clock * 7.3 + 1) * 0.05);
  world.fixedLights.forEach(l => {
    const u = l.userData;
    l.intensity = u.base * u.boost * (1 + u.flicker * (Math.sin(clock * 2.3 + u.phase) * 0.6 + Math.sin(clock * 5.9 + u.phase * 2) * 0.4));
  });

  // The storm.
  if (clock > nextStrike) { strike(0.4 + Math.random() * 0.6); nextStrike = clock + 8 + Math.random() * 12; }
  strikes = strikes.filter(s => clock - s < 1.5);
  let f = 0;
  for (const s of strikes) if (clock >= s) f += Math.exp(-(clock - s) * 9);
  f = Math.min(1.6, f);
  world.lightning.intensity = f * (here.room === 'porch' ? 3 : 0.6);
  world.ambient.intensity = 0.32 + f * (here.room === 'porch' || here.room === 'conservatory' ? 0.6 : 0.12);
  world.windowMats.forEach(m => { m.emissiveIntensity = 0.05 + f * 1.4; });
  world.rain.material.uniforms.time.value = clock;
  world.rain.material.uniforms.flash.value = f;
  world.rain.material.uniforms.center.value.set(cam.position.x, 0, cam.position.z);

  // Weasels running rings round the dance floor while the waltz plays.
  if (game.curse) world.weasels.forEach(s => {
    const o = s.userData.orbit, a = clock * o.speed + o.phase;
    s.position.set(DANCE.x + Math.cos(a) * o.r, 0, DANCE.y + Math.sin(a) * o.r * 0.8);
  });
  // The waltz wears on your nerves, but not while you're at the keys
  // fighting it (or reading).
  if (game.curse && (game.busy || ui.overlay)) game.curseStart = now;
  else if (game.curse && now - game.curseStart > 3500) { game.curseStart = now; addDread(1); }

  // Dread ebbs slowly when nothing is happening.
  if (game.dread > 0 && !game.curse && !game.busy && clock - (game.dreadEbb || 0) > 30) { game.dreadEbb = clock; addDread(-1); }
  else if (game.dread === 0 || game.curse || game.busy) game.dreadEbb = clock;

  // Cut-outs turn to face you.
  billboards.forEach(b => { b.rotation.y = yaw; });

  // Hide anything you're standing inside of.
  world.sprites.forEach(s => {
    if (s.userData.kind === 'petunia' && game.flags.petuniaGone) return;
    const d = Math.hypot(s.position.x - cam.position.x, s.position.z - cam.position.z);
    s.material.opacity = d < 18 ? 0 : d < 34 ? (d - 18) / 16 : (s.userData.kind === 'petunia' ? 0.92 : 1);
  });

  ui.setPrompt(busy() ? null : thingAtHand());
  renderer.render(world.scene, cam);
}

// ─── Controls ─────────────────────────────────────────────────────────

const KEYMAP = {
  w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back',
  a: 'strafeLeft', d: 'strafeRight', q: 'left', arrowleft: 'left', e: 'right', arrowright: 'right',
  ' ': 'use', enter: 'use', f: 'use',
};

document.addEventListener('keydown', e => {
  if ($('game').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape') { if (ui.overlay === 'journal' || ui.overlay === 'map') { e.preventDefault(); ui.close(); } return; }
  if (k === 'm') { e.preventDefault(); ui.toggle('map'); return; }
  if (k === 'j' || k === 'i') { e.preventDefault(); ui.toggle('journal'); return; }
  if (ui.overlay || game.busy) return;
  if (e.target.closest && e.target.closest('button') && (k === ' ' || k === 'enter')) return;
  const cmd = KEYMAP[k];
  if (cmd) { e.preventDefault(); if (!e.repeat || cmd !== 'use') act(cmd); }
});

document.querySelectorAll('[data-cmd]').forEach(b => {
  b.addEventListener('click', () => act(b.dataset.cmd));
});
$('prompt').addEventListener('click', () => act('use'));
$('btn-map').addEventListener('click', () => ui.toggle('map'));
$('btn-journal').addEventListener('click', () => ui.toggle('journal'));
document.querySelectorAll('.overlay .close').forEach(b => b.addEventListener('click', () => ui.close()));
$('room-card-close').addEventListener('click', hideRoomCard);
const soundBtn = $('btn-sound');
const showSound = () => { soundBtn.textContent = sound.on ? '🔊' : '🔇'; soundBtn.setAttribute('aria-pressed', String(sound.on)); soundBtn.title = sound.on ? 'Sound on' : 'Sound off'; };
soundBtn.addEventListener('click', () => { sound.setOn(!sound.on); showSound(); });
showSound();

$('btn-continue').hidden = !hasSave();
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-new').addEventListener('click', () => startGame(true));
if (!hasSave()) $('btn-new').textContent = 'Enter the house';

// A handle for testing and debugging from the browser console.
window.crookedHouse = { game, act, teleport, useThing, thingAtHand, THINGS, GRID, world: () => world };
