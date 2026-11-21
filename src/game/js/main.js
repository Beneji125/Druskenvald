// The game loop: the renderer, walking and turning (one square, one
// quarter-turn at a time, eased so it doesn't jump), the lantern, the
// storm, and the controls — keyboard, the on-screen pad, and the buttons.

const STEP_MS = 230, TURN_MS = 190;
let renderer = null;
const motion = { from: null, to: null, t0: 0, ms: 0, yawFrom: 0, yawTo: 0, bump: 0 };
const queued = [];
let yaw = 0, nextStrike = 4, strikes = [], clock = 0;
const DOOR_SWING = 1.75, DOOR_MS = 550;   // how far doors swing open (radians), and how fast

// After a dialogue, an overlay or a scene ends, input is ignored for a
// moment, so the key press that closed it (or a quick double-tap) can't
// also set off whatever comes next.
let inputLockUntil = 0;
function lockInput(ms) {
  inputLockUntil = Math.max(inputLockUntil, performance.now() + ms);
  queued.length = 0;
}

function quality() {
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  return (mem && mem <= 2) || (cores && cores <= 2) ? 'low' : 'high';
}

function startGame(fresh) {
  if (fresh || !loadGame()) newGame();
  game.echoesPlaying = false;
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
  DOORS.list.forEach(d => {
    d.open = game.doorsOpen.has(d.id);
    const v = world.doors[d.id];
    v.amount = v.target = d.open ? 1 : 0;
    v.leaves.forEach(l => { l.sign = 1; l.pivot.rotation.y = l.base + l.sign * v.amount * DOOR_SWING; });
  });
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

function doorsMoving() { return Object.values(world.doors).some(v => v.amount !== v.target); }
function busy() { return game.busy || !!ui.overlay || !!motion.to || doorsMoving() || game.flags.breaking; }

function act(cmd) {
  if (performance.now() < inputLockUntil) return;
  if (game.busy || ui.overlay || game.flags.breaking) return;
  if (busy()) {
    // Mid-step: remember one more move, but only near the end of this
    // one, so tapping fast doesn't pile up moves that run on afterwards.
    const k = motion.to ? (performance.now() - motion.t0) / motion.ms : 1;
    if (k > 0.45 && queued.length < 1 && cmd !== 'use') queued.push(cmd);
    return;
  }
  if (cmd === 'left' || cmd === 'right') return turn(cmd === 'left' ? -1 : 1);
  const door = doorAhead();
  if (cmd === 'use') {
    if (door && !door.open) return swingDoor(door, true);
    const t = thingAtHand();
    if (t) return useThing(t);
    if (door && door.open) return swingDoor(door, false);
    return;
  }
  const rel = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
  if (rel === undefined) return;
  // Walking into a closed door opens it.
  if (rel === 0 && door && !door.open) return swingDoor(door, true);
  // On the cursed dance floor your feet don't always obey.
  if (game.curse && Math.random() < 0.3) {
    ui.log('You spin with the dancers.', 'scare');
    return turn(Math.random() < 0.5 ? -1 : 1);
  }
  step((game.dir + rel) % 4);
}

// ─── Doors ────────────────────────────────────────────────────────────

function doorAhead() {
  const c = GRID.at(game.cx, game.cy);
  return c && c.edges[game.dir] === 'door' ? DOORS.at(c, game.dir) : null;
}

// Doors swing away from you: into the next room when you open them.
function swingDoor(door, open) {
  const v = world.doors[door.id];
  if (open) {
    const mine = door.cells.some(c => c.cx === game.cx && c.cy === game.cy);
    const pn = mine ? v.normal : [-v.normal[0], -v.normal[1]];    // points back at you
    v.leaves.forEach(l => {
      const a = l.base + DOOR_SWING;
      l.sign = (Math.cos(a) * pn[0] - Math.sin(a) * pn[1]) < 0 ? 1 : -1;
    });
    game.doorsOpen.add(door.id);
  } else {
    game.doorsOpen.delete(door.id);
  }
  door.open = open;
  v.from = v.amount; v.t0 = performance.now();
  v.target = open ? 1 : 0;
  sound.door(open);
  saveGame();
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
      if (queued.length && !busy()) { const next = queued.shift(); act(next); }
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

  // Doors swinging.
  Object.values(world.doors).forEach(v => {
    if (v.amount === v.target) return;
    // By the clock, not by frames, so a slow device can't stall a door.
    const k = Math.min(1, (now - v.t0) / (DOOR_MS * Math.abs(v.target - v.from)));
    v.amount = k >= 1 ? v.target : lerp(v.from, v.target, k);
    const e = v.amount * v.amount * (3 - 2 * v.amount);
    v.leaves.forEach(l => { l.pivot.rotation.y = l.base + l.sign * e * DOOR_SWING; });
    // The house's own lights cast their shadows once; redo them now a
    // door has moved.
    if (v.amount === v.target) world.fixedLights.forEach(f => { if (f.castShadow) f.shadow.needsUpdate = true; });
  });

  // Cut-outs turn to face you.
  billboards.forEach(b => { b.rotation.y = yaw; });

  // Hide anything you're standing inside of.
  world.sprites.forEach(s => {
    if (s.userData.kind === 'petunia' && game.flags.petuniaGone) return;
    const d = Math.hypot(s.position.x - cam.position.x, s.position.z - cam.position.z);
    s.material.opacity = d < 18 ? 0 : d < 34 ? (d - 18) / 16 : (s.userData.kind === 'petunia' ? 0.92 : 1);
  });

  // Music for where you are and how you feel.
  sound.setTheme(musicFor(here));
  // Quiet for the séance; the waltz drops back while you're at the keys
  // so you can hear the tune you're playing.
  sound.duck(ui.overlay === 'ouija' ? 0.15 : ui.overlay === 'keys' ? 0.3 : 1);

  if (busy()) ui.setPrompt(null);
  else {
    const door = doorAhead(), t = thingAtHand();
    ui.setPrompt(door && !door.open ? { verb: 'Open', name: 'the door' } : t || (door ? { verb: 'Close', name: 'the door' } : null));
  }
  renderer.render(world.scene, cam);
}

// High Dread brings in the tense theme, which holds until you've calmed
// down a good way (so it doesn't flicker on and off at the threshold).
let dreadTheme = false;
function musicFor(here) {
  if (game.dread >= 7) dreadTheme = true;
  else if (game.dread <= 4) dreadTheme = false;
  if (game.curse) return 'waltz';
  if (game.echoesPlaying) return 'echoes';      // Patrini's song plays through
  if (dreadTheme) return 'dread';
  if (here.room === 'music' && game.flags.musicSolved) return 'echoes';
  return 'house';
}
sound.onThemeEnded = name => { if (name === 'echoes') game.echoesPlaying = false; };

// ─── Controls ─────────────────────────────────────────────────────────

const KEYMAP = {
  w: 'forward', arrowup: 'forward', s: 'back', arrowdown: 'back',
  a: 'strafeLeft', d: 'strafeRight', q: 'left', arrowleft: 'left', e: 'right', arrowright: 'right',
  ' ': 'use', enter: 'use', f: 'use',
};

document.addEventListener('keydown', e => {
  if ($('game').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === 'escape' && !soundPanel.hidden) { e.preventDefault(); toggleSoundPanel(false); $('btn-sound').focus(); return; }
  if (e.target.closest && e.target.closest('input')) return;     // a slider's arrow keys move the slider
  if (k === 'escape') { if (ui.overlay === 'journal' || ui.overlay === 'map') { e.preventDefault(); ui.close(); } return; }
  if (k === 'm') { e.preventDefault(); ui.toggle('map'); return; }
  if (k === 'j' || k === 'i') { e.preventDefault(); ui.toggle('journal'); return; }
  if (ui.overlay || game.busy || performance.now() < inputLockUntil) return;
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
const showSound = () => {
  soundBtn.textContent = sound.on ? '🔊' : '🔇';
  soundBtn.title = 'Volume';
  $('btn-mute').textContent = sound.on ? 'Mute' : 'Unmute';
  $('btn-mute').setAttribute('aria-pressed', String(!sound.on));
};
soundBtn.addEventListener('click', () => toggleSoundPanel());
// The volume panel: opened by the 🔊 button; Volume (everything), Music,
// and Mute. Kept between visits.
const soundPanel = $('sound-panel');
const volSlider = $('vol-all'), musicSlider = $('vol-music');
volSlider.value = Math.round(sound.volume * 100);
musicSlider.value = Math.round(sound.musicVolume * 100);
volSlider.addEventListener('input', () => { sound.setVolume(volSlider.value / 100); if (!sound.on && volSlider.value > 0) { sound.setOn(true); showSound(); } });
musicSlider.addEventListener('input', () => sound.setMusicVolume(musicSlider.value / 100));
$('btn-mute').addEventListener('click', () => { sound.setOn(!sound.on); showSound(); });
const toggleSoundPanel = open => {
  soundPanel.hidden = open === undefined ? !soundPanel.hidden : !open;
  soundBtn.setAttribute('aria-expanded', String(!soundPanel.hidden));
  if (!soundPanel.hidden) volSlider.focus({ preventScroll: true });
};
document.addEventListener('pointerdown', e => {
  if (!soundPanel.hidden && !e.target.closest('#sound-panel, #btn-sound')) toggleSoundPanel(false);
});
showSound();

$('btn-continue').hidden = !hasSave();
$('btn-continue').addEventListener('click', () => startGame(false));
$('btn-new').addEventListener('click', () => startGame(true));
if (!hasSave()) $('btn-new').textContent = 'Enter the house';

// A handle for testing and debugging from the browser console.
window.crookedHouse = { sound, game, act, teleport, useThing, thingAtHand, THINGS, GRID, world: () => world, clock: () => clock };
