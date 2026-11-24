// Flashbacks: when you free a ghost, you live their last minutes, in the
// house as it was seventy years ago (warm, lamplit, no storm, the family
// alive). You can walk and look, but only where the memory goes, and you
// can't change how it ends. A ghost you destroyed instead is remembered
// through Eustace Lockwood's eyes, with the axe in your hands.
//
// Each memory is a short script (FLASHBACKS, below) built from a few
// steps: say something, wait until you reach a place, wait until you use
// a remembered thing, show or hide someone. Each one leaves you knowing
// something useful.

const fb = { active: null, things: [], sprites: [], allowed: null, corrupt: false };

function inFlashback() { return !!fb.active; }

// Can you walk into this square during the memory?
function flashbackAllows(c) { return !fb.allowed || fb.allowed.includes(c.room); }

async function runFlashback(id, { corrupt = false } = {}) {
  const def = FLASHBACKS[id];
  const back = { cx: game.cx, cy: game.cy, dir: game.dir, dread: game.dread };
  fb.active = id; fb.corrupt = corrupt; fb.allowed = def.rooms;
  game.inFlashback = true;
  // A memory usually starts at the end of a scene (freeing a ghost), which
  // counts as busy: in the memory you must be free to walk and act.
  const wasBusy = game.busy;
  game.busy = false;
  ui.select(null);
  await fadeTo('#f4e6c8', 1400);
  $('game').classList.add(corrupt ? 'past-corrupt' : 'past');
  // In the past the house was lived in: every door stands open.
  const doorsBefore = DOORS.list.map(d => d.open);
  setAllDoors(DOORS.list.map(() => true));
  sound.setPast(true);
  hideRoomCard();
  try {
    await (corrupt ? def.corrupt : def.play)(fbApi(def));
  } finally {
    fb.things.forEach(t => { const i = THINGS.indexOf(t); if (i >= 0) THINGS.splice(i, 1); });
    fb.sprites.forEach(s => { world.scene.remove(s); const i = billboards.indexOf(s); if (i >= 0) billboards.splice(i, 1); });
    fb.things = []; fb.sprites = [];
    await fadeTo('#000', 1600);
    $('game').classList.remove('past', 'past-corrupt');
    setAllDoors(doorsBefore);
    sound.setPast(false);
    fb.active = null; fb.allowed = null;
    game.inFlashback = false;
    game.busy = wasBusy;
    teleport(back.cx, back.cy, back.dir);
    game.dread = back.dread; ui.setDread(back.dread);
    fadeFrom(1600);
    saveGame();
  }
}

// Opens or closes every door at once, without swinging (for the cut into
// and out of a memory).
function setAllDoors(states) {
  DOORS.list.forEach((d, i) => {
    d.open = states[i];
    const v = world.doors[d.id];
    v.amount = v.target = v.from = d.open ? 1 : 0;
    v.leaves.forEach(l => { l.pivot.rotation.y = l.base + l.sign * v.amount * DOOR_SWING; });
  });
  world.fixedLights.forEach(f => { if (f.castShadow) f.shadow.needsUpdate = true; });
}

// What a memory script can do.
function fbApi(def) {
  return {
    // A title card over a pale screen, then into the memory at a square.
    async begin(title, cx, cy, dir) {
      teleport(cx, cy, dir);
      await showCard(title);
      fadeFrom(1400);
      await sleep(900);
    },
    say: (text, who = '') => ui.say(who, text),
    log: text => ui.log(text, 'note'),
    // Resolves once you're standing in one of these rooms (or squares).
    reach(test) {
      return new Promise(res => {
        const check = () => {
          const c = GRID.at(game.cx, game.cy);
          if (!motion.to && (typeof test === 'function' ? test(c) : test.includes(c.room))) res(); else requestAnimationFrame(check);
        };
        check();
      });
    },
    // A remembered thing to look at or use: resolves when you do.
    thing(spec) {
      return new Promise(res => {
        const t = { h: 50, verb: 'Look at', ...spec, memory: true, run: async () => {
          if (spec.text) await ui.say(spec.name, spec.text);
          const i = THINGS.indexOf(t); if (i >= 0) THINGS.splice(i, 1);
          res();
        } };
        THINGS.push(t); fb.things.push(t);
      });
    },
    // Someone in the memory: a figure at a place, warmly lit.
    person(kind, x, y, tint = 0xfff0dc) {
      const s = addSprite(world.scene, kind, x, y);
      if (s.material.color) s.material.color.set(tint);
      s.material.opacity = 1; s.material.transparent = true;
      s.userData.memory = true;
      fb.sprites.push(s);
      return s;
    },
    remove(s) { s.visible = false; },
    wait: ms => sleep(ms),
    // The end of the memory: a cut to black with the last words.
    async end(text) {
      ui.flash(fb.corrupt ? '#600' : '#000', 2400);
      sound.thunder(1.2);
      await sleep(400);
      await showCard(text, true);
    },
  };
}

// A full-screen card of text, for titles and endings.
function showCard(text, ending = false) {
  return new Promise(res => {
    const el = $('fb-card');
    el.innerHTML = `<p></p><button type="button" class="big">Continue</button>`;
    el.querySelector('p').textContent = text;
    el.classList.toggle('ending', ending);
    el.hidden = false;
    ui.overlay = 'card';
    const btn = el.querySelector('button');
    const done = () => { el.hidden = true; ui.overlay = null; document.removeEventListener('keydown', onKey, true); lockInput(300); res(); };
    const onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); done(); } else e.stopImmediatePropagation(); };
    btn.addEventListener('click', done);
    setTimeout(() => { document.addEventListener('keydown', onKey, true); btn.focus({ preventScroll: true }); }, 600);
  });
}

function fadeTo(colour, ms) {
  const f = $('fade');
  f.style.background = colour;
  f.style.transition = `opacity ${ms}ms ease`;
  f.style.opacity = '1';
  return sleep(ms);
}
function fadeFrom(ms) {
  const f = $('fade');
  f.style.transition = `opacity ${ms}ms ease`;
  f.style.opacity = '0';
}

// ─── The memories ─────────────────────────────────────────────────────
// Squares are grid squares (cx, cy, facing 0–3 = N E S W).

const FLASHBACKS = {
  // Petunia: tea in the conservatory, the evening it happened.
  petunia: {
    rooms: ['conservatory', 'hallway'],
    async play(m) {
      await m.begin('Seventy years ago. The conservatory, on a summer evening. You are Petunia Lockwood.', 9, 7, 0);
      await m.say('The glass is warm from the day. The tree is heavy with fruit, and the room smells of it. You’ve made tea, the way you always do, and set out cups for the children.');
      await m.thing({ id: 'm_tea', name: 'The tea tray', x: 560, y: 478, h: 34, verb: 'Pour', text: 'You pour three cups: yours, and Sally’s with extra sugar, and a little one for Arthur that he won’t drink. Sally will be down any minute. Sally always comes down for tea.' });
      m.log('Upstairs, Sally laughs at something. Arthur is crying again.');
      await m.say('They’re late. You go to the door to call them.');
      await m.reach(c => c.room === 'hallway' || (c.cx === 11 && c.cy === 8));
      await m.say('“Sally! Arthur! Tea!” Your voice goes up the stairs and doesn’t come back. The laughing has stopped. Arthur has stopped crying. Somewhere above, a floorboard creaks, and then another, coming down.');
      const e = m.person('crookedMan', 714, 760, 0xd8c8b0);
      await m.wait(600);
      await m.say('Eustace is on the stairs. He is carrying the axe from the woodshed, and he is wet to the elbows, and he is smiling as if he’s been away a long time and has only just come home. “Pet,” he says. “There you are.”', 'Petunia Lockwood');
      await m.say('Your legs know before you do. You run back to your tree.');
      await m.reach(c => c.room === 'conservatory' && Math.hypot(c.x - 490, c.y - 360) < 120);
      m.remove(e);
      await m.end('He found her under her tree, with the tea still warm in her cup. Afterwards she tied her green ribbon tight about her throat, as if that could hold her together. It did, for seventy years.\n\nUpstairs, Sally had pushed her doll to the bottom of the toy chest, so that it wouldn’t be frightened. Arthur’s blue bear was still in his cradle.');
      addClue('toys');
    },
    async corrupt(m) {
      await m.begin('Seventy years ago. The hallway. You are Eustace Lockwood, and the axe is heavy in your hands.', 11, 9, 0);
      await m.say('The house has been talking to you for weeks. Tonight, at last, you understand everything it says. Your hands are wet. You don’t look at them.');
      const p = m.person('petunia', 520, 470, 0xfff0dc);
      await m.say('She’s in the conservatory, under her tree, with her tea. She’s calling for the children. They won’t come.');
      await m.reach(c => c.room === 'conservatory' && Math.hypot(c.x - 520, c.y - 470) < 90);
      await m.say('“Eustace?” She stands. The cup rattles in its saucer. “Eustace, what have you done?”', 'Petunia Lockwood');
      m.remove(p);
      await m.end('You don’t remember swinging. You only remember the green ribbon, afterwards, and how carefully you tied it, as if you could take it all back. Somewhere in the walls, something was laughing. It sounded like you.');
    },
  },

  // Joseph Patrini: the music room, playing for Gail.
  patrini: {
    rooms: ['music', 'hallway'],
    async play(m) {
      await m.begin('Seventy years ago. The music room, late. You are Joseph Patrini, the Lockwoods’ manservant.', 16, 16, 0);
      const gail = m.person('petunia', 850, 925, 0xffe0c8);
      await m.say('The family is in bed. The room is yours and Gail’s, the way it always is after the last fire is banked. She wants the song. The one you wrote for her.');
      await m.thing({ id: 'm_harpsichord', name: 'The harpsichord', x: 965, y: 845, h: 66, verb: 'Play', text: 'You play it for her, the little climbing tune that turns and comes home. Gail dances alone on the boards, slow, her eyes closed, and laughs when she gets the steps wrong. She pins up her hair with the silver hairpin you gave her the Christmas you were married.' });
      PATRINI_TUNE.concat(PATRINI_TUNE).forEach((n, i) => sound.pluck(NOTE[n], i * 0.55, 1.2, 0.16));
      await m.wait(1500);
      await m.say('Then, from upstairs, a scream. It stops too suddenly.');
      await m.say('“Gail. Go up the back way. Hide in the trophy room, behind the great bear, and don’t come out. Don’t come out for anything. Not even for me.”', 'Joseph Patrini');
      m.remove(gail);
      await m.say('She goes. You go the other way, into the hall, towards the sound.');
      await m.reach(['hallway']);
      m.person('crookedMan', 714, 640, 0xd8c8b0);
      await m.say('Mr Lockwood is coming down the hall. He is smiling. He has the axe.', 'Joseph Patrini');
      await m.end('He didn’t feel it. He was thinking of the tune, and of Gail behind the great stuffed bear upstairs, with her silver hairpin, keeping very still. He never found out if it was still enough.\n\nFrancis, their son, was never found at all.');
      addClue('gail');
    },
    async corrupt(m) {
      await m.begin('Seventy years ago. The hallway. You are Eustace Lockwood.', 12, 13, 2);
      await m.say('Music. The servant is playing his little tune, as if this were an ordinary night. The house hates that tune. You hate it too, now.');
      const j = m.person('patrini', 930, 875, 0xfff0dc);
      await m.reach(['music']);
      await m.say('He stops playing when he sees you. He stands between you and the door his wife has just gone through.', 'Joseph Patrini');
      m.remove(j);
      await m.end('He didn’t beg. He hummed. You can still hear it, sometimes, under the floorboards: the little climbing tune, never quite reaching home.');
    },
  },
};
