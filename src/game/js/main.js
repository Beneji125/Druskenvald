// The game loop: the renderer, walking and turning (one square, one
// quarter-turn at a time, eased so it doesn't jump), the lantern, the
// storm, and the controls — keyboard, the on-screen pad, and the buttons.

const STEP_MS = 230, TURN_MS = 190;
// The eye sits this far back from the middle of its square, so the wall
// ahead isn't right in your face (the wall behind is 24 away).
const CAM_BACK = 17;
let renderer = null;
const motion = { from: null, to: null, t0: 0, ms: 0, yawFrom: 0, yawTo: 0, bump: 0 };
const queued = [];
let yaw = 0, nextStrike = 4, strikes = [], clock = 0, nextCreak = 12;
let moodLevel = 1, moodColor = null, snapMood = true, realDt = 0;
const DOOR_SWING = 1.75, DOOR_MS = 750;   // how far doors swing open (radians), and how slowly (they creak)

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
  const resumed = !fresh && loadGame();
  if (!resumed) newGame();
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
    setupFinish(renderer, q);
    moodColor = new THREE.Color(ROOM_MOOD.porch.sky);
    addCharacters();
    buildGrounds();
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
    v.leaves.forEach(l => { l.pivot.rotation.y = l.base + l.sign * v.amount * DOOR_SWING; });
  });
  yaw = -game.dir * Math.PI / 2;
  motion.from = motion.to = null;
  ui.setDread(game.dread);
  ui.select(null);
  ui.drawInventory();
  ui.setLanternMode(game.lanternLow);
  ui.setOil(game.oil);
  setHearth(!!game.flags.hearthLit);
  const c = GRID.at(game.cx, game.cy);
  ui.setRoom(roomById(c.room)?.name || '');
  game.roomsSeen.delete(c.room);
  enteredCell(null);
  $('view').focus({ preventScroll: true });
  // A new game starts outside, at the gate (arrival.js).
  if (fresh || !resumed) { runArrival(); return; }
  // Back in a saved game: where you'd got to (the journal has the rest).
  const goal = currentGoals()[0];
  if (goal) setTimeout(() => ui.log(`Where you were: ${goal}`, 'note'), 1200);
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
  // Glints: one per thing you can look at or use, and one that marks the
  // handle of a closed door you're facing.
  const glintMat = () => new THREE.MeshBasicMaterial({ map: glintTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const glintTex = glintTexture();
  world.glints = THINGS.map(t => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glintMat());
    m.position.set(t.x, t.h, t.y); m.userData.thing = t; m.userData.phase = (t.x * 7 + t.y * 13) % 6.28;
    world.scene.add(m);
    return m;
  });
  world.doorGlint = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glintMat());
  world.scene.add(world.doorGlint);
  world.jasper = addSprite(world.scene, 'jasper', 0, 0);
  world.jasper.visible = false;
  world.nest = addSprite(world.scene, 'nest', NEST.x, NEST.y);
  world.nest.visible = false;
  world.crookedMan = addSprite(world.scene, 'crookedMan', 0, 0);
  world.crookedMan.visible = false;
  [world.patrini, world.crookedMan].forEach(s => { s.material.transparent = true; s.material.depthWrite = false; s.material.alphaTest = 0; });
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  resizeFinish(renderer);
  world.camera.aspect = w / h;
  world.camera.fov = w < h ? 82 : 72;
  world.camera.updateProjectionMatrix();
}

// ─── Moving ───────────────────────────────────────────────────────────

function doorsMoving() { return Object.values(world.doors).some(v => v.amount !== v.target); }
function busy() { return game.busy || !!ui.overlay || !!motion.to || doorsMoving() || game.flags.breaking; }

// `at`: when the key or button was pressed (event.timeStamp), for the waltz.
function act(cmd, at) {
  if (performance.now() < inputLockUntil) return;
  if (game.busy || ui.overlay || game.flags.breaking) return;
  if (busy()) {
    // Mid-step: remember one more move, but only near the end of this
    // one, so tapping fast doesn't pile up moves that run on afterwards.
    const k = motion.to ? (performance.now() - motion.t0) / motion.ms : 1;
    // (Not in the waltz: there every move needs its own beat.)
    if (k > 0.45 && queued.length < 1 && cmd !== 'use' && !inRhythm()) queued.push(cmd);
    return;
  }
  // On the cursed dance floor, every move has to land on a beat.
  if (cmd !== 'use' && inRhythm() && !onBeat(at)) return;
  if (cmd === 'left' || cmd === 'right') return turn(cmd === 'left' ? -1 : 1);
  const door = doorAhead();
  if (cmd === 'use') {
    const t = thingAtHand();
    // Holding an item: use it on whatever's in front of you.
    if (ui.selected) {
      // Some things you use on yourself: oil for the lantern, tea to drink.
      if (ui.selected === 'oil') return refillLantern();
      if (ui.selected === 'tea' && (!t || t.id !== 'petunia')) { game.busy = true; return drinkTea().finally(() => { game.busy = false; lockInput(250); }); }
      if (t) return useThing(t, ui.selected);
      ui.log(`There’s nothing here to use the ${ITEMS[ui.selected].name.toLowerCase()} on.`, 'note');
      return ui.select(null);
    }
    if (door && !door.open) return swingDoor(door, true);
    if (t) return useThing(t);
    if (door && door.open) return swingDoor(door, false);
    return;
  }
  const rel = { forward: 0, strafeRight: 1, back: 2, strafeLeft: 3 }[cmd];
  if (rel === undefined) return;
  // Walking into a closed door opens it.
  if (rel === 0 && door && !door.open) return swingDoor(door, true);
  // On the cursed dance floor your feet don't always obey.
  step((game.dir + rel) % 4);
}

// ─── Doors ────────────────────────────────────────────────────────────

function doorAhead() {
  if (game.inFlashback) return null;      // memories leave the doors as they were
  const c = GRID.at(game.cx, game.cy);
  return c && c.edges[game.dir] === 'door' ? DOORS.at(c, game.dir) : null;
}

// Each door always swings into the same room (DOORS' swingInto, in core.js).
function swingDoor(door, open) {
  const v = world.doors[door.id];
  if (open) {
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

// What's underfoot, by room, for the footsteps.
const FLOOR_SOUND = { foyer: 'tile', conservatory: 'tile', kitchen: 'stone', gallery: 'stone', porch: 'boards' };
// Where something is, left (-1) to right (1), from where you're facing.
function panTo(p) {
  const cam = world.camera, dx = p.x - cam.position.x, dz = p.z - cam.position.z;
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return (dx * rx + dz * rz) / Math.max(1, Math.hypot(dx, dz));
}

function step(dir) {
  const c = GRID.at(game.cx, game.cy);
  if (!canStep(c, dir)) { motion.bump = performance.now(); return; }
  const n = GRID.at(c.cx + DIRS[dir][0], c.cy + DIRS[dir][1]);
  sound.footstep(FLOOR_SOUND[n.room] || 'wood');
  if (game.curse) stompAt(n);        // a weasel in the way, crushed (the dark way)
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
  snapMood = true;
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
  realDt = (now - last) / 1000;
  const dt = Math.min(0.05, realDt);
  last = now;
  clock += dt;

  // Paused: the house holds still (only drawn, for the picture behind).
  if (ui.overlay === 'pause') { drawFrame(renderer, world.scene, world.camera); return; }
  // The arrival (arrival.js) has the camera to itself.
  if (arrival.active) {
    tickArrival(now, dt);
    tickDoors(now);
    drawFrame(renderer, world.scene, world.camera);
    return;
  }

  // Where the camera is: easing between squares and between headings.
  let px, pz, bob = 0;
  const here = GRID.at(game.cx, game.cy);
  if (motion.to) {
    const k = Math.min(1, (now - motion.t0) / motion.ms), e = 1 - (1 - k) ** 3;
    px = lerp(motion.from.x, motion.to.x, e); pz = lerp(motion.from.y, motion.to.y, e);
    yaw = lerp(motion.yawFrom, motion.yawTo, e);
    if (!motion.turning) bob = Math.sin(k * Math.PI) * 3 * (prefs.calm ? 0.25 : 1);
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
  cam.position.set(px + fx * (bump - CAM_BACK), EYE_H + bob, pz + fz * (bump - CAM_BACK));
  cam.rotation.order = 'YXZ';
  cam.rotation.y = yaw;
  // Never quite level, in a house with no right angles. The cursed waltz
  // sets the room swaying.
  const sway = game.curse && !prefs.calm ? Math.sin(clock * 2.1) * 0.06 : 0;
  // Crookedness: the more you've destroyed, the more the house leans.
  const lean = Math.min(5, game.crooked || 0) * 0.012;
  const drift = prefs.calm ? 0 : 1;
  cam.rotation.z = (Math.sin(clock * 0.37) * 0.018 + Math.sin(clock * 0.13) * 0.012) * drift + sway + lean * (prefs.calm ? 0.5 : 1);
  cam.rotation.x = -0.04 + (Math.sin(clock * 0.29) * 0.01 + (game.curse ? Math.sin(clock * 1.3) * 0.03 : 0)) * drift;

  // The lantern, held a little to the right and below the eye.
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  world.lantern.position.set(cam.position.x + rx * 9 + fx * 8, EYE_H - 14 + bob, cam.position.z + rz * 9 + fz * 8);
  world.lantern.intensity = LANTERN.intensity * tickDread(dt, here) * (1 + Math.sin(clock * 13.1) * 0.04 + Math.sin(clock * 7.3 + 1) * 0.05);
  tickHeld(now);
  tickAmbient(dt, cam);
  world.fixedLights.forEach(l => {
    const u = l.userData;
    l.intensity = u.base * u.boost * (1 + u.flicker * (Math.sin(clock * 2.3 + u.phase) * 0.6 + Math.sin(clock * 5.9 + u.phase * 2) * 0.4));
  });

  // The house settling: a creak from somewhere, now and then.
  if (clock > nextCreak) { if (!game.inFlashback) sound.creak(Math.random() * 2 - 1, 0.7 + Math.random() * 0.5); nextCreak = clock + 14 + Math.random() * 26; }
  // The storm.
  if (clock > nextStrike) { strike(0.4 + Math.random() * 0.6); nextStrike = clock + 8 + Math.random() * 12; }
  strikes = strikes.filter(s => clock - s < 1.5);
  let f = 0;
  for (const s of strikes) if (clock >= s) f += Math.exp(-(clock - s) * 9);
  f = Math.min(1.6, f);
  world.lightning.intensity = f * (here.room === 'porch' ? 3 : 0.6);
  // The room's own light, easing in as you pass between rooms, plus the
  // lightning where the storm can reach.
  const mood = ROOM_MOOD[here.room] || ROOM_MOOD.hallway;
  // (Real seconds, not the capped frame time, so a slow device still
  // catches up; teleports snap straight to the new room's light.)
  const ease = snapMood ? 1 : 1 - Math.exp(-Math.min(1, realDt) * 1.5);
  snapMood = false;
  moodLevel += (mood.level - moodLevel) * ease;
  moodColor.lerp(new THREE.Color(mood.sky), ease);
  world.ambient.color.copy(moodColor);
  world.ambient.groundColor.copy(moodColor).multiplyScalar(0.55);   // so walls get it too
  world.ambient.intensity = moodLevel + f * (here.room === 'porch' || here.room === 'conservatory' ? 1.2 : 0.25);
  // In a memory: a warm, lamplit evening, no storm, no lantern needed.
  if (game.inFlashback) {
    world.ambient.color.set(fb.corrupt ? 0xd07060 : 0xffd9a8);
    world.ambient.groundColor.set(fb.corrupt ? 0x401010 : 0x6a4a2a);
    world.ambient.intensity = 9;
    world.lightning.intensity = 0;
    world.lantern.intensity = 0;
  }
  world.rain.visible = !game.inFlashback;
  world.windowMats.forEach(m => { m.emissiveIntensity = 0.05 + f * 1.4; });
  world.rain.material.uniforms.time.value = clock;
  world.rain.material.uniforms.flash.value = f;
  world.rain.material.uniforms.center.value.set(cam.position.x, 0, cam.position.z);

  // The waltz: weasels move on the beat (rhythm.js).
  tickRhythm(dt);
  // The waltz wears on your nerves, but not while you're at the keys
  // fighting it (or reading).
  if (game.curse && (game.busy || ui.overlay)) game.curseStart = now;
  else if (game.curse && now - game.curseStart > 9000) { game.curseStart = now; addDread(1); }


  tickDoors(now);

  updateGlints(now, dt);
  // The portraits' curse: once your Dread reaches 6, the boogleswarm comes.
  if (game.flags.portraitCurse && game.dread >= 6 && !busy() && !game.curse && !game.inFlashback && here.room !== 'porch') {
    game.flags.portraitCurse = false;
    game.busy = true;
    boogleSwarm().finally(() => { game.busy = false; lockInput(300); });
  }
  tickJasper(dt, here, now);
  world.decals.forEach(m => {
    const target = thingAvailable(m.userData.thing) ? 1 : 0;
    m.material.opacity += (target - m.material.opacity) * Math.min(1, dt * 2);
    m.visible = m.material.opacity > 0.01;
  });

  // Cut-outs turn to face you.
  billboards.forEach(b => { b.rotation.y = yaw; });

  // Hide anything you're standing inside of.
  world.sprites.forEach(s => {
    if (s.userData.kind === 'petunia' && game.flags.petuniaGone) return;
    if (game.inFlashback && SPRITES[s.userData.kind]?.ghost) { s.material.opacity = 0; return; }   // no ghosts in the past
    const d = Math.hypot(s.position.x - cam.position.x, s.position.z - cam.position.z);
    s.material.opacity = d < 18 ? 0 : d < 34 ? (d - 18) / 16 : (s.userData.kind === 'petunia' ? 0.92 : 1);
  });

  // Music for where you are and how you feel.
  sound.setTheme(musicFor(here));
  // Quiet for the séance; the waltz drops back while you're at the keys
  // so you can hear the tune you're playing.
  sound.duck(ui.overlay === 'ouija' ? 0.15 : ui.overlay === 'keys' ? 0.3 : game.inFlashback ? 0.7 : 1);
  if (game.flags.feastDone) setFeast(game.flags.feastDone);
  setPeacock(game.inFlashback ? null : game.flags.peacockDone);   // whole again in Keziah's memory

  if (busy()) ui.setPrompt(null);
  else if (ui.selected) {
    const t = thingAtHand();
    if (ui.selected === 'oil') ui.setPrompt({ verb: 'Fill', name: 'the lantern' });
    else if (ui.selected === 'tea' && (!t || t.id !== 'petunia')) ui.setPrompt({ verb: 'Drink', name: 'the tea' });
    else ui.setPrompt({ verb: `Use the ${ITEMS[ui.selected].name.toLowerCase()} on`, name: t ? t.name : 'nothing here' });
  } else {
    const door = doorAhead(), t = thingAtHand();
    ui.setPrompt(door && !door.open ? { verb: 'Open', name: 'the door' } : t || (door ? { verb: 'Close', name: 'the door' } : null));
  }
  drawFrame(renderer, world.scene, cam);
}

// The lantern in your hand: it swings a little with each step, lags
// behind when you turn, breathes when you stand still, hangs lower when
// turned down, and its glass glows with whatever light is left.
const held = { el: $('held'), parity: 1, lastStep: null, x: 0, y: 0, r: 0 };
$('held-lantern').src = heldLanternArt();
$('held-flame').src = heldFlameArt();
function tickHeld(now) {
  const h = held, hh = h.el.offsetHeight || 300;
  let tx = 0, ty = Math.sin(clock * 1.3) * hh * 0.008, tr = Math.sin(clock * 0.9) * 1.2;
  if (motion.to && !motion.turning) {
    if (h.lastStep !== motion.t0) { h.lastStep = motion.t0; h.parity = -h.parity; }
    const k = Math.min(1, (now - motion.t0) / motion.ms), sw = Math.sin(k * Math.PI);
    tx += h.parity * sw * hh * 0.025; ty += sw * hh * 0.03; tr += h.parity * sw * 3;
  }
  if (motion.to && motion.turning) tx += (motion.yawTo - yaw) * hh * 0.3;
  if (game.lanternLow) ty += hh * 0.12;
  // eased, so it has weight
  if (prefs.calm) { tx *= 0.3; ty *= 0.3; tr *= 0.3; if (game.lanternLow) ty += hh * 0.08; }
  const e = Math.min(1, realDt * 10);
  h.x += (tx - h.x) * e; h.y += (ty - h.y) * e; h.r += (tr - h.r) * e;
  h.el.style.transform = `translate(${h.x.toFixed(1)}px, ${h.y.toFixed(1)}px) rotate(${h.r.toFixed(2)}deg)`;
  const lit = clamp01(world.lantern.intensity / LANTERN.intensity);
  h.el.style.setProperty('--lit', (0.32 + 0.75 * lit).toFixed(3));
  h.el.style.setProperty('--flame', (lit * (0.85 + Math.sin(clock * 13.1) * 0.08 + Math.sin(clock * 7.3) * 0.07)).toFixed(3));
}

// Small movements that make the house feel alive: candle flames and the
// hearth flicker, the chandelier sways on its chain, and dust drifts
// through the lantern's light.
let dust = null;
function tickAmbient(dt, cam) {
  if (!dust) {
    const n = 140, pos = new Float32Array(n * 3), rand = seededRandom(91);
    for (let i = 0; i < n * 3; i++) pos[i] = (rand() - 0.5) * 160;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: lampGlowTexture(), size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe8c8, opacity: 0.35 }));
    dust.frustumCulled = false;
    dust.userData.seeds = Array.from({ length: n }, () => rand() * 6.28);
    world.scene.add(dust);
  }
  // the motes hang round you, drifting and slowly falling, each wrapping
  // back into the box when it leaves
  const p = dust.geometry.attributes.position.array, sd = dust.userData.seeds;
  for (let i = 0; i < sd.length; i++) {
    const o = i * 3;
    p[o] += Math.sin(clock * 0.3 + sd[i]) * dt * 2.2; p[o + 1] -= dt * (0.6 + (sd[i] % 1)); p[o + 2] += Math.cos(clock * 0.25 + sd[i] * 1.7) * dt * 2.2;
    for (let k = 0; k < 3; k++) { if (p[o + k] > 80) p[o + k] -= 160; else if (p[o + k] < -80) p[o + k] += 160; }
  }
  dust.geometry.attributes.position.needsUpdate = true;
  dust.position.set(cam.position.x, cam.position.y, cam.position.z);
  dust.material.opacity = 0.32 * clamp01(world.lantern.intensity / LANTERN.intensity);
  dust.visible = !game.inFlashback;
  // candles and fire
  const flick = 1 + Math.sin(clock * 11.3) * 0.08 + Math.sin(clock * 17.9 + 1.3) * 0.06;
  if (world.feast) world.feast.flames.forEach((f, i) => { f.scale.set(1, flick + Math.sin(clock * 9 + i) * 0.1, 1); });
  if (game.flags.hearthLit) world.hearthMats.forEach(m => { m.emissiveIntensity = 1.6 * (0.85 + 0.15 * flick + Math.sin(clock * 3.1) * 0.08); });
  // the chandelier, on its long chain
  const ch = world.chandelier ??= world.sprites.find(s => s.userData.kind === 'chandelier');
  if (ch) { ch.userData.x0 ??= ch.position.x; ch.position.x = ch.userData.x0 + Math.sin(clock * 0.7) * 1.6 + (game.dread >= 7 ? Math.sin(clock * 2.3) * 1.2 : 0); }
}

// Doors swinging.
function tickDoors(now) {
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
}

// Glints near you pulse softly; the one you're facing shines brighter, and
// one you've already looked at stays faint. Each sits just in front of its
// thing (towards you), so the thing itself can't hide it, while walls and
// closed doors still do.
const GLINT_RANGE = CELL * 3.5;
function updateGlints(now, dt) {
  const cam = world.camera, quiet = busy();
  const faced = quiet ? null : thingAtHand();
  const hereRoom = GRID.at(game.cx, game.cy).room;
  const k = Math.min(1, dt * 8);
  world.glints.forEach(g => {
    const t = g.userData.thing;
    const d = Math.hypot(t.x - cam.position.x, t.y - cam.position.z);
    let target = 0;
    // Only things in the room you're in (or the one you're facing).
    const room = t.glintRoom ?? (t.glintRoom = GRID.cellAtPx(t.x, t.y)?.room ?? null);
    if (!quiet && d < GLINT_RANGE && thingAvailable(t) && (t === faced || room === hereRoom)) {
      const seen = game.flags.examined && game.flags.examined[t.id];
      const pulse = 0.75 + 0.25 * Math.sin(now / 520 + g.userData.phase);
      target = (t === faced ? 1 : seen ? 0.12 : 0.42 * pulse) * Math.min(1, (GLINT_RANGE - d) / CELL);
    }
    g.material.opacity += (target - g.material.opacity) * k;
    g.visible = g.material.opacity > 0.01;
    if (!g.visible) return;
    const s = t === faced ? 1.25 + 0.08 * Math.sin(now / 180) : 1;
    g.scale.setScalar(s);
    const len = Math.max(1, d), pull = Math.min(16, d * 0.4);
    g.position.set(t.x + (cam.position.x - t.x) / len * pull, t.h, t.y + (cam.position.z - t.y) / len * pull);
    g.rotation.y = yaw;
  });
  // The handle of the closed door in front of you.
  const door = quiet ? null : doorAhead();
  const dg = world.doorGlint;
  if (door && !door.open) {
    const [hx, hz] = world.doors[door.id].handle, [dx, dy] = DIRS[game.dir];
    dg.position.set(hx - dx * (WALL_T / 2 + 3), 46, hz - dy * (WALL_T / 2 + 3));   // on your side of it
    dg.rotation.y = yaw;
    dg.material.opacity += (0.8 + 0.2 * Math.sin(now / 200) - dg.material.opacity) * k;
  } else dg.material.opacity += (0 - dg.material.opacity) * k;
  dg.visible = dg.material.opacity > 0.01;
}

// High Dread brings in the tense theme, which holds until you've calmed
// down a good way (so it doesn't flicker on and off at the threshold).
let dreadTheme = false;
function musicFor(here) {
  if (game.dread >= 7) dreadTheme = true;
  else if (game.dread <= 4) dreadTheme = false;
  if (game.inFlashback) return fb.active === 'patrini' && !fb.corrupt ? 'echoes' : 'house';   // Patrini's song plays on in his memory
  if (game.curse) return 'waltz';
  if (game.inEncounter) return 'dread';
  // Patrini's song, straight after the puzzle: only while you stay in the
  // music room. Leave, and it's over for good.
  if (game.echoesPlaying && here.room !== 'music') game.echoesPlaying = false;
  if (game.echoesPlaying) return 'echoes';
  if (dreadTheme) return 'dread';
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
  // The arrival: Esc skips it; Space or Enter moves the narration on.
  if (arrival.active) {
    if (e.target.closest && e.target.closest('input, button')) return;
    if (k === 'escape') { e.preventDefault(); skipArrival(); }
    else if ((k === ' ' || k === 'enter') && !ui.overlay) { e.preventDefault(); [...arrival.wakers].forEach(w => w()); }
    return;
  }
  // (a slider's arrow keys move the slider; Escape still closes things)
  if (e.target.closest && e.target.closest('input') && k !== 'escape') return;
  if (k === 'escape' || k === 'p') {
    if (ui.overlay === 'journal' || ui.overlay === 'map' || ui.overlay === 'pause') { e.preventDefault(); ui.close(); return; }
    if (k === 'escape' && ui.selected) { e.preventDefault(); ui.select(null); return; }
    if (!ui.overlay && !game.busy) { e.preventDefault(); ui.open('pause'); }
    return;
  }
  if (k === 'm') { e.preventDefault(); ui.toggle('map'); return; }
  if (k === 'j') { e.preventDefault(); ui.toggle('journal'); return; }
  if (k === 'l' && !ui.overlay && !game.busy) { e.preventDefault(); toggleLantern(); return; }
  if (ui.overlay || game.busy || performance.now() < inputLockUntil) return;
  if (e.target.closest && e.target.closest('button') && (k === ' ' || k === 'enter')) return;
  // The inventory: 1–9 pick up an item (or, holding one, combine it with
  // another), X examines what you're holding, Escape puts it down.
  if (/^[1-9]$/.test(k)) {
    const id = game.items[Number(k) - 1];
    if (id) { e.preventDefault(); ui.pickSlot(id); }
    return;
  }
  if (k === 'x' && ui.selected) { e.preventDefault(); examineItem(ui.selected); return; }
  const cmd = KEYMAP[k];
  if (cmd) { e.preventDefault(); if (!e.repeat || cmd !== 'use') act(cmd, e.timeStamp); }
});

document.querySelectorAll('[data-cmd]').forEach(b => {
  b.addEventListener('click', e => act(b.dataset.cmd, e.timeStamp));
});
$('prompt').addEventListener('click', () => act('use'));
$('btn-skip').addEventListener('click', () => skipArrival());
$('arrival-cap').addEventListener('click', () => [...arrival.wakers].forEach(w => w()));
$('btn-map').addEventListener('click', () => ui.toggle('map'));
$('btn-lantern').addEventListener('click', () => { if (!ui.overlay && !game.busy) toggleLantern(); });
$('btn-journal').addEventListener('click', () => ui.toggle('journal'));
document.querySelectorAll('.overlay .close').forEach(b => b.addEventListener('click', () => ui.close()));
$('room-card-close').addEventListener('click', hideRoomCard);
$('inv-examine').addEventListener('click', () => examineItem(ui.selected));
$('inv-teeth-icon').src = itemIcon('tooth');
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
const easyBox = $('opt-easy');
easyBox.checked = easyMode();
easyBox.addEventListener('change', () => store.set(EASY_KEY, easyBox.checked ? 'on' : 'off'));
// Comfort options (the pause menu): reduced motion and larger text.
const MOTION_KEY = 'crooked_house_motion', TEXT_KEY = 'crooked_house_text';
const prefs = {
  calm: store.get(MOTION_KEY) ? store.get(MOTION_KEY) === 'reduced' : !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches),
  big: store.get(TEXT_KEY) === 'big',
};
document.documentElement.classList.toggle('big-text', prefs.big);
$('opt-motion').checked = prefs.calm;
$('opt-motion').addEventListener('change', e => { prefs.calm = e.target.checked; store.set(MOTION_KEY, prefs.calm ? 'reduced' : 'full'); });
$('opt-bigtext').checked = prefs.big;
$('opt-bigtext').addEventListener('change', e => { prefs.big = e.target.checked; store.set(TEXT_KEY, prefs.big ? 'big' : 'normal'); document.documentElement.classList.toggle('big-text', prefs.big); if (renderer) resize(); });
$('btn-pause').addEventListener('click', () => { if (!game.busy) ui.toggle('pause'); });
$('btn-resume').addEventListener('click', () => ui.close());
$('btn-title').addEventListener('click', () => { saveGame(); location.reload(); });
// Closing the tab, leaving for the map or switching away keeps where you
// were standing and how much oil is left (the story saves as it goes).
const saveOnLeave = () => { if (!$('game').hidden && !arrival.active) saveGame(); };
window.addEventListener('pagehide', saveOnLeave);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveOnLeave(); });
const filmBox = $('opt-film');
filmBox.checked = finish.on;
filmBox.addEventListener('change', () => { finish.on = filmBox.checked && !!finish.target; store.set(FINISH_KEY, filmBox.checked ? 'on' : 'off'); });
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
// Starting again over a saved game asks once more first (the save is lost).
let armedNew = null;
$('btn-new').addEventListener('click', () => {
  const b = $('btn-new');
  if (!hasSave() || armedNew) { clearTimeout(armedNew); armedNew = null; startGame(true); return; }
  const was = b.textContent;
  b.textContent = 'Start again? Your progress will be lost: click again';
  b.classList.add('armed');
  armedNew = setTimeout(() => { armedNew = null; b.textContent = was; b.classList.remove('armed'); }, 5000);
});
if (!hasSave()) $('btn-new').textContent = 'Enter the house';

// A handle for testing and debugging from the browser console.
window.crookedHouse = { renderer: () => renderer, addSprite, runEncounter, ENCOUNTERS, enc, arrival, skipArrival, rhythm, beatNow, fb, runFlashback, addDread, jasper, NEST_THING, giveItem, ui, lockUntil: () => inputLockUntil - performance.now(), busyNow: () => busy(), doorAhead: () => doorAhead(), motion, sound, game, act, teleport, useThing, thingAtHand, THINGS, GRID, world: () => world, clock: () => clock };
