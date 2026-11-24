// What happens in the house: the things you can look at and use, the
// séance, Petunia and her teacup, the music room's cursed waltz, the
// Crooked Man, the storm on the porch, Dread, mementos, clues and saving.
//
// There's no fighting. The house wins by frightening you: every scare adds
// Dread, and when it's full your nerve breaks and you flee to the porch
// (nothing is lost; Dread settles back down). You win by paying attention:
// what you learn in one room opens the way in another.

const SAVE_KEY = 'crooked_house_save_v1';

const MEMENTOS = [
  { id: 'gem',  glyph: '◆', name: 'A red bloodstone',          hint: 'A gem' },
  { id: 'key',  glyph: '♪', name: 'A black ivory key',         hint: 'A key' },
  { id: 'cup',  glyph: '☕', name: "Petunia's porcelain teacup", hint: 'A cup' },
  { id: 'doll', glyph: '✦', name: 'A doll',                    hint: 'A doll' },
  { id: 'bear', glyph: '✦', name: 'A bear',                    hint: 'A bear' },
  { id: 'pin',  glyph: '✦', name: 'A pin',                     hint: 'A pin' },
];

const CLUES = [
  { id: 'lockwoods', text: 'A portrait in the foyer names the Lockwoods: Eustace, his wife Petunia, their daughter Sally, their infant son Arthur, and Petunia’s mother Keziah. Beside them, their servants Joseph and Gail Patrini and their son Francis.' },
  { id: 'patrini',   text: 'The spirit speaking through the board is Joseph Patrini, the Lockwoods’ servant.' },
  { id: 'upstairs',  text: 'Phillip and Adela Druskenvald are here, upstairs.' },
  { id: 'eustace',   text: 'Patrini was murdered, by Eustace Lockwood.' },
  { id: 'attic',     text: 'A hag is behind all of this. She is in the attic.' },
  { id: 'mementos',  text: 'Six mementos open the way to the attic: a gem, a key, a cup, a doll, a bear and a pin. They are on every floor.' },
  { id: 'son',       text: 'Patrini’s last words: “Find my son. He lives.”' },
];

// How high each thing's glint hangs (world units; the ceiling is WALL_H).
const THING_HEIGHTS = {
  petunia: 70, spirit_board: 46, harpsichord: 66, portraits: 80, peacock: 95, oven: 62, feast: 48,
  staircase: 60, front_door: 72, chandelier: 92, fireplace: 50, landscapes: 80, mirror: 70,
  collapsed_shelf: 45, tree: 95, bench: 30,
};

// Things you can look at or use, and where they are (floor-plan pixels).
// Names and descriptions come from the points of interest in explore.json
// unless given here; `run` is the script for using it.
const THINGS = [
  { id: 'petunia', name: 'Petunia Lockwood', x: 520, y: 470, verb: 'Speak to', run: () => petuniaScene(), when: () => !game.flags.petuniaGone },
  { id: 'spirit_board', verb: 'Use', run: () => seance() },
  { id: 'harpsichord', verb: 'Play', run: () => harpsichordScene() },
  { id: 'portraits', verb: 'Study', run: () => portraitsScene() },
  { id: 'peacock', verb: 'Examine', run: () => peacockScene() },
  { id: 'oven', verb: 'Examine', run: () => ovenScene() },
  { id: 'feast', verb: 'Examine', run: () => feastScene() },
  { id: 'staircase', verb: 'Climb', run: () => stairsScene() },
  { id: 'front_door' }, { id: 'chandelier' }, { id: 'fireplace' }, { id: 'landscapes' },
  { id: 'mirror' }, { id: 'collapsed_shelf' }, { id: 'tree' },
  { id: 'bench', when: () => game.flags.petuniaGone },
].map(t => {
  const poi = FLOOR.pois.find(p => p.id === t.id) || {};
  return { x: poi.x, y: poi.y, name: poi.name, text: poi.text, h: THING_HEIGHTS[t.id] ?? 50, ...t };
});

const game = {
  cx: 0, cy: 0, dir: 0, dread: 0,
  mementos: new Set(), clues: new Set(), flags: {}, seen: new Set(), roomsSeen: new Set(),
  busy: false,       // a scene is playing: no walking
  curse: false,      // the waltz is playing
};

// ─── Saving ───────────────────────────────────────────────────────────

function newGame() {
  const c = GRID.cellAtPx(FLOOR.start.x, FLOOR.start.y);
  Object.assign(game, { cx: c.cx, cy: c.cy, dir: 0, dread: 0, mementos: new Set(), clues: new Set(), flags: {}, seen: new Set(), roomsSeen: new Set(), curse: false });
  game.doorsOpen = frontDoorOpen();
  store.remove(SAVE_KEY);
}

function saveGame() {
  store.set(SAVE_KEY, JSON.stringify({
    v: 1, cx: game.cx, cy: game.cy, dir: game.dir, dread: game.dread,
    mementos: [...game.mementos], clues: [...game.clues], flags: game.flags, seen: [...game.seen], roomsSeen: [...game.roomsSeen],
    doorsOpen: [...game.doorsOpen],
  }));
}

function loadGame() {
  try {
    const s = JSON.parse(store.get(SAVE_KEY));
    if (!s || s.v !== 1 || !GRID.at(s.cx, s.cy)?.walk) return false;
    Object.assign(game, { cx: s.cx, cy: s.cy, dir: s.dir, dread: s.dread, mementos: new Set(s.mementos), clues: new Set(s.clues), flags: s.flags || {}, seen: new Set(s.seen), roomsSeen: new Set(s.roomsSeen), curse: false });
    game.doorsOpen = s.doorsOpen ? new Set(s.doorsOpen.filter(id => DOORS.byId(id))) : frontDoorOpen();
    return true;
  } catch { return false; }
}

function hasSave() { return !!store.get(SAVE_KEY); }

// Every door starts closed, except the front door: the house opened that
// one for you.
function frontDoorOpen() { return new Set(DOORS.list.filter(d => d.rooms.includes('porch')).map(d => d.id)); }

// ─── Dread, mementos, clues ───────────────────────────────────────────

function addDread(n) {
  game.dread = clamp(game.dread + n, 0, DREAD_MAX);
  ui.setDread(game.dread);
  if (n > 0) { $('dread').classList.remove('jolt'); void $('dread').offsetWidth; $('dread').classList.add('jolt'); }
  if (game.dread >= DREAD_MAX && !game.flags.breaking) nerveBreaks();
}

async function nerveBreaks() {
  game.flags.breaking = true;
  if (game.curse) endCurse(true);
  ui.flash('#000', 1600);
  await ui.say('', 'It is too much. You run — blindly, through doors and dark hallways, the house howling at your back — and stop only when cold rain hits your face. You are on the porch. The front door stands open, waiting.');
  const c = GRID.cellAtPx(FLOOR.start.x, FLOOR.start.y);
  teleport(c.cx, c.cy, 0);
  game.dread = 4; ui.setDread(4);
  delete game.flags.breaking;
  saveGame();
}

function giveMemento(id) {
  game.mementos.add(id);
  const m = MEMENTOS.find(x => x.id === id);
  ui.log(`Memento found: ${m.name}. (${game.mementos.size} of 6)`, 'gain');
  sound.pluck(NOTE.E * 2, 0, 1.4, 0.12); sound.pluck(NOTE.A * 2, 0.15, 1.6, 0.1);
  if (game.mementos.has('cup') && game.mementos.has('key') && !game.flags.toldNext) {
    game.flags.toldNext = true;
    setTimeout(() => ui.log('Two mementos are yours. The rest are deeper in the house: the gallery, the kitchen and the floor above open in a later chapter.', 'note'), 2500);
  }
  saveGame();
}

function addClue(id) {
  if (game.clues.has(id)) return;
  game.clues.add(id);
  ui.log('Added to your journal.', 'note');
  saveGame();
}

// ─── Moving into a square ─────────────────────────────────────────────
// Called after every step (and teleport). Marks what you can now see on
// the map, announces rooms, and sets off whatever waits in that square.

function enteredCell(prev) {
  const c = GRID.at(game.cx, game.cy);
  markSeen(c);
  const room = roomById(c.room);
  const prevRoom = prev ? prev.room : null;
  if (room && c.room !== prevRoom) {
    ui.setRoom(room.name);
    sound.setPlace(c.room === 'porch' ? 'out' : c.room === 'conservatory' ? 'glass' : 'in');
    if (!game.roomsSeen.has(c.room)) {
      game.roomsSeen.add(c.room);
      showRoomCard(room);
    } else hideRoomCard();
  }
  if (game.curse && c.room !== 'music') endCurse(false);
  if (c.noEscape) return noEscape();
  if (c.room === 'music' && isDanceFloor(c) && !game.flags.musicSolved && !game.curse) startCurse();
  if (c.room === 'hallway' && game.flags.seanceDone && !game.flags.crookedManSeen) crookedMan();
  saveGame();
}

// You can see the square you're in and, through open edges, its
// neighbours: those are revealed on the map.
function markSeen(c) {
  game.seen.add(`${c.cx},${c.cy}`);
  c.edges.forEach((e, d) => {
    if (e === 'open' || e === 'door') game.seen.add(`${c.cx + DIRS[d][0]},${c.cy + DIRS[d][1]}`);
  });
}

function showRoomCard(room) {
  $('room-card-title').textContent = room.name;
  $('room-card-text').textContent = room.text;
  const card = $('room-card');
  card.hidden = false;
  card.classList.remove('show'); void card.offsetWidth; card.classList.add('show');
  clearTimeout(showRoomCard.timer);
  showRoomCard.timer = setTimeout(hideRoomCard, 16000);
}
function hideRoomCard() { $('room-card').hidden = true; }

// What you could use right now: the nearest thing to a point just ahead of
// you, within about a square, and not on the far side of a wall. (Things
// sit where they are on the floor plan, not on the grid, so a harpsichord
// can be ahead of you and a little to one side.)
function thingAtHand() {
  const here = GRID.at(game.cx, game.cy);
  const fx = here.x + DIRS[game.dir][0] * CELL * 0.75, fy = here.y + DIRS[game.dir][1] * CELL * 0.75;
  let best = null, bestD = CELL * 1.05;
  for (const t of THINGS) {
    if (t.when && !t.when()) continue;
    const d = Math.hypot(t.x - fx, t.y - fy);
    if (d >= bestD) continue;
    if (GRID.segs.some(([a, b]) => segmentsCross([here.x, here.y], [t.x, t.y], a, b))) continue;
    best = t; bestD = d;
  }
  return best;
}

async function useThing(t) {
  if (game.busy) return;
  game.busy = true;
  (game.flags.examined = game.flags.examined || {})[t.id] = true;   // its glint dims from now on
  try {
    if (t.run) await t.run();
    else await ui.say(t.name, t.text);
  } finally {
    game.busy = false;
    lockInput(250);
  }
}

// ─── The porch: No Escape ─────────────────────────────────────────────

async function noEscape() {
  strike(1.4);
  ui.flash('#dfe6ff', 700);
  const c = GRID.cellAtPx(FLOOR.returnTo.x, FLOOR.returnTo.y);
  teleport(c.cx, c.cy, 0);
  addDread(1);
  ui.log(FLOOR.noEscape.text, 'scare');
}

// ─── The foyer ────────────────────────────────────────────────────────

async function portraitsScene() {
  const t = THINGS.find(x => x.id === 'portraits');
  await ui.say(t.name, t.text);
  addClue('lockwoods');
}

async function stairsScene() {
  await ui.say('The staircase', 'You set a foot on the first step, and the whole staircase groans and shifts, twisting away from you up into the dark. The floor above is not ready for you. Not yet.');
}

// ─── The parlour: the séance ──────────────────────────────────────────

const SEANCE_QUESTIONS = [
  { id: 'who',       q: 'Who are you?',                    a: 'PATRINI', clue: 'patrini' },
  { id: 'here',      q: 'Are Phillip and Adela here?',     a: 'YES' },
  { id: 'where',     q: 'Where are they?',                 a: 'UPSTAIRS', after: 'here', clue: 'upstairs' },
  { id: 'died',      q: 'How did you die?',                a: 'MURDER' },
  { id: 'killer',    q: 'Who killed you?',                 a: 'EUSTACE LOCKWOOD', after: 'died', clue: 'eustace' },
  { id: 'blame',     q: 'Who is responsible for all this?', a: 'HAG' },
  { id: 'hag',       q: 'Where is the hag?',               a: 'ATTIC', after: 'blame', clue: 'attic' },
  { id: 'attic',     q: 'How do we reach the attic?',      a: '6 MEMENTOS', after: 'hag' },
  { id: 'mementos',  q: 'What are the mementos?',          a: 'GEM KEY CUP DOLL BEAR PIN', after: 'attic', clue: 'mementos' },
  { id: 'where_mem', q: 'Where are they?',                 a: 'EVERY FLOOR', after: 'mementos' },
];

async function seance() {
  if (game.flags.seanceDone) {
    await ui.say('The spirit board', 'You rest your fingers on the planchette. The board is cold, and nothing answers. Whoever spoke through it has said all they will.');
    return;
  }
  const go = await ui.say('The spirit board', 'Adela Druskenvald’s spirit board lies ready on the table, the little heart-shaped planchette at its centre. A séance needs a question to begin: is anyone there?', [
    { id: 'yes', text: 'Rest your fingers on the planchette and ask' }, { id: 'no', text: 'Leave it alone' }]);
  if (go !== 'yes') return;

  const board = openOuija();
  sound.startDrone();
  setHearth(true);
  board.say('A fire bursts into life in the cold hearth. Under your fingers, the planchette begins to move.');
  await board.spell('HELLO');
  const asked = new Set();
  let anger = 0;
  for (;;) {
    const open = SEANCE_QUESTIONS.filter(q => !asked.has(q.id) && (!q.after || asked.has(q.after)));
    const pick = await board.choose([...open.map(q => ({ id: q.id, text: q.q })), { id: 'bye', text: 'Thank the spirit and say goodbye' }]);
    if (pick === 'bye') break;
    const q = SEANCE_QUESTIONS.find(x => x.id === pick);
    asked.add(q.id);
    board.say(`“${q.q}”`);
    // Spirits don't like being questioned: now and then the board turns
    // on you, and it gets worse each time.
    if (Math.random() < 0.15) {
      anger++;
      await board.thrash();
      board.say('The planchette tears itself out from under your fingers and spins wildly. Something cold presses on the back of your neck.');
      addDread(anger);
      if (game.flags.breaking) { closeOuija(board); return; }
    }
    await board.spell(q.a);
    if (q.clue) addClue(q.clue);
  }
  if (asked.has('mementos')) {
    board.say('The planchette drags itself slowly across the board, as if the spirit were spending the last of its strength.');
    await board.spell('FIND MY SON HE LIVES');
    addClue('son');
  }
  await board.spell('GOODBYE');
  board.say('The fire in the hearth goes out with a hiss, and the room is plunged into a darker dark than before.');
  setHearth(false);
  sound.stopDrone();
  game.flags.seanceDone = true;
  saveGame();
  await sleep(2200);
  closeOuija(board);
}

function setHearth(lit) {
  world.fixedLights.forEach(l => { if (l.userData.id === 'fireplace') l.userData.boost = lit ? 4 : 1; });
  world.hearthMats.forEach(m => { m.emissiveIntensity = lit ? 1.6 : 0.25; });
  if (world.boardMat) world.boardMat.emissiveIntensity = lit ? 0.5 : 0.12;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// The spirit board, from the official artwork (explore/Ouija_Board.webp):
// the alphabet in a ring around the horned face, YES / GOODBYE / NO across
// the top, the numbers along the foot. OUIJA_SPOTS are each one's centre in
// the artwork's pixels; the planchette (explore/Planchette.webp) glides so
// its window sits over each in turn, and the answer builds up beside it.
const OUIJA_W = 1539, OUIJA_H = 2000;
const OUIJA_SPOTS = { W: [325, 650], X: [450, 565], Y: [545, 535], Z: [645, 500], A: [760, 480], B: [875, 495], C: [1010, 535], D: [1115, 615], E: [1180, 705], F: [1270, 790], G: [1295, 930], H: [1285, 1085], I: [1235, 1255], J: [1180, 1355], K: [1115, 1400], L: [1055, 1460], M: [935, 1500], N: [795, 1525], O: [655, 1490], P: [535, 1470], Q: [420, 1405], R: [335, 1300], S: [265, 1205], T: [245, 1060], U: [240, 900], V: [290, 770], "1": [232, 1720], "2": [345, 1720], "3": [467, 1720], "4": [590, 1720], "5": [705, 1720], "6": [825, 1720], "7": [934, 1720], "8": [1039, 1720], "9": [1161, 1720], "0": [1285, 1720], "YES": [262, 248], "GOODBYE": [773, 295], "NO": [1251, 237] };
const OUIJA_WORDS = ['YES', 'NO', 'GOODBYE'];
// Where the window's centre is in the planchette picture (fractions), and
// how wide the planchette is against the board.
const PLANCHETTE = { lensX: 0.5, lensY: 0.243, width: 0.2 };

function openOuija() {
  const root = $('ouija');
  root.innerHTML = `
    <div class="ouija-board">
      <div class="ob-stage">
        <img class="ob-board" src="explore/Ouija_Board.webp" alt="The spirit board: the alphabet in a ring around a horned, many-eyed face, with YES, GOODBYE and NO above and the numbers below">
        <div class="ob-glow"></div>
        <img class="ob-planchette" src="explore/Planchette.webp" alt="">
      </div>
      <div class="ob-side">
        <p class="ouija-spelled" aria-live="polite"></p>
        <p class="ouija-text" aria-live="polite"></p>
        <div class="ouija-choices"></div>
      </div>
    </div>`;
  root.hidden = false;
  ui.overlay = 'ouija';
  const pl = root.querySelector('.ob-planchette');
  const glowEl = root.querySelector('.ob-glow');
  pl.style.width = `${PLANCHETTE.width * 100}%`;
  pl.style.transformOrigin = `${PLANCHETTE.lensX * 100}% ${PLANCHETTE.lensY * 100}%`;
  const spelled = root.querySelector('.ouija-spelled');
  const place = (x, y, rot) => {
    pl.style.left = `${(x / OUIJA_W * 100).toFixed(3)}%`;
    pl.style.top = `${(y / OUIJA_H * 100).toFixed(3)}%`;
    pl.style.transform = `translate(-${PLANCHETTE.lensX * 100}%, -${PLANCHETTE.lensY * 100}%) rotate(${rot.toFixed(1)}deg)`;
  };
  let at = [770, 1000];
  place(at[0], at[1], 0);
  const pos = OUIJA_SPOTS;
  const moveTo = (to, ms) => new Promise(res => {
    const from = at.slice(), t0 = performance.now();
    const tick = now => {
      const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const wob = Math.sin(now / 90) * 6 * (1 - k);
      at = [lerp(from[0], to[0], e) + wob, lerp(from[1], to[1], e)];
      place(at[0], at[1], wob * 0.8 + (at[0] - 770) / 60);
      if (k < 1) requestAnimationFrame(tick); else res();
    };
    requestAnimationFrame(tick);
  });
  // A pulse of light in the window as it settles on a letter.
  const glow = ch => {
    const [x, y] = pos[ch];
    glowEl.style.left = `${(x / OUIJA_W * 100).toFixed(3)}%`;
    glowEl.style.top = `${(y / OUIJA_H * 100).toFixed(3)}%`;
    glowEl.classList.remove('lit'); void glowEl.offsetWidth; glowEl.classList.add('lit');
  };
  return {
    root,
    say(text) { root.querySelector('.ouija-text').textContent = text; },
    async spell(answer) {
      spelled.textContent = '';
      if (OUIJA_WORDS.includes(answer)) {
        sound.scrape();
        await moveTo(pos[answer], 1100); glow(answer); spelled.textContent = answer;
        await sleep(900);
        return;
      }
      for (const ch of answer) {
        if (ch === ' ') { spelled.textContent += ' '; await sleep(350); continue; }
        sound.scrape();
        // The same letter twice: lift away a little and come back down.
        if (Math.hypot(at[0] - pos[ch][0], at[1] - pos[ch][1]) < 30) await moveTo([pos[ch][0] + 70, pos[ch][1] + 50], 260);
        await moveTo(pos[ch], 620);
        glow(ch);
        spelled.textContent += ch;
        await sleep(260);
      }
      await sleep(900);
    },
    async thrash() {
      for (let i = 0; i < 6; i++) { sound.scrape(); await moveTo([250 + Math.random() * 1040, 350 + Math.random() * 1400], 140); }
      ui.flash('#9fb6ff', 300);
    },
    choose(choices) {
      return new Promise(resolve => {
        const box = root.querySelector('.ouija-choices');
        box.innerHTML = '';
        choices.forEach((c, i) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.innerHTML = `<span class="key">${i + 1}</span>`;
          b.appendChild(document.createTextNode(c.text));
          b.addEventListener('click', () => done(c.id));
          box.appendChild(b);
        });
        const onKey = e => { const n = Number(e.key); if (n >= 1 && n <= choices.length) { e.preventDefault(); e.stopImmediatePropagation(); done(choices[n - 1].id); } };
        let answered = false;
        const done = id => { if (answered) return; answered = true; document.removeEventListener('keydown', onKey, true); box.innerHTML = ''; resolve(id); };
        document.addEventListener('keydown', onKey, true);
        box.querySelector('button')?.focus({ preventScroll: true });
      });
    },
  };
}

function closeOuija() {
  $('ouija').hidden = true;
  $('ouija').innerHTML = '';
  if (ui.overlay === 'ouija') ui.overlay = null;
  sound.stopDrone();
}

// ─── The conservatory: Petunia ────────────────────────────────────────

async function petuniaScene() {
  const angered = game.flags.petuniaAngered;
  let text = game.flags.petuniaMet
    ? (angered ? 'Petunia sits as before, gazing at the tree, but her shoulders are rigid now. She knows you are there.' : 'Petunia sits on the bench, the teacup in her lap, lost in thought.')
    : 'A pale woman in a black mourning gown sits on the bench, gazing at the tree. She holds a white porcelain teacup in both hands, and a faded green ribbon is tied around her throat. She doesn’t seem to notice you.';
  game.flags.petuniaMet = true;
  const said = new Set();
  let speaker = '';
  for (;;) {
    const choices = [];
    if (!said.has('greet')) choices.push({ id: 'greet', text: '“Good evening.”' });
    if (said.has('greet') && !said.has('tree')) choices.push({ id: 'tree', text: 'Ask about the tree' });
    if (said.has('greet') && !said.has('cup')) choices.push({ id: 'cup', text: 'Ask for her teacup' });
    if (said.has('greet') && game.clues.has('lockwoods')) choices.push({ id: 'children', text: 'Speak of Sally and Arthur' });
    choices.push({ id: 'snatch', text: 'Snatch the teacup from her hands' });
    choices.push({ id: 'leave', text: 'Leave her be' });
    const pick = await ui.say(speaker, text, choices);
    said.add(pick);
    if (pick === 'leave') return;
    speaker = 'Petunia Lockwood';
    if (pick === 'greet') {
      text = angered
        ? '“You again.” She doesn’t turn her head. “Mind your manners in my house, or don’t come into it.” Then, more softly, as if the moment had already slipped away: “Will you take some tea?”'
        : '“Oh! I didn’t hear you come in. You’ll forgive me, I was miles away.” She smiles without looking up. “Will you take some tea? The bergamot is lovely this time of year.”';
    } else if (pick === 'tree') {
      text = '“I planted it the spring we came. Eustace laughed, said nothing would ever grow in Wickermoor soil. But it did. Everything grew, that first summer.” Her smile falters. “Is it still summer?”';
    } else if (pick === 'cup') {
      text = '“My cup? Oh, no, dear. I couldn’t. It was my mother’s, and her mother’s before that.” She turns it slowly in her hands, and stops, listening, as though for children’s voices somewhere in the house.';
    } else if (pick === 'children') {
      speaker = '';
      await ui.say('Petunia Lockwood', '“Sally? Arthur?” The cup trembles in her hands. “Where are they? I’ve sat here so long, and they never come down for tea. Sally always comes down for tea.”');
      await ui.say('', 'She looks at you for the first time. Her eyes are very dark. “Find them. Please. Take it, take my cup, only find my children.” She presses the teacup into your hands. It is ice cold.');
      game.flags.petuniaGone = true;
      fadeSprite('petunia');
      await ui.say('', 'When you look up, the bench is empty. Only the tree is there, green and heavy with fruit, and a faint smell of bergamot.');
      giveMemento('cup');
      return;
    } else if (pick === 'snatch') {
      ui.flash('#cfe0ff', 900);
      sound.thunder(0.6);
      await ui.say('', 'You reach for the cup. Petunia’s head snaps round, and the green ribbon at her throat slips a finger’s width. The air turns to ice. She rises, and the scream that tears out of her is not a sound a living woman could make —');
      game.flags.petuniaAngered = true;
      stepBack();
      addDread(4);
      ui.log('You stagger back. She is on the bench again, as if nothing had happened. She will not forget.', 'scare');
      return;
    }
  }
}

// ─── The music room: the cursed waltz ─────────────────────────────────

const DANCE = { x: 850, y: 925, rx: 95, ry: 85 };
const PATRINI_TUNE = ['E', 'G', 'A', 'G', 'E', 'D'];

function isDanceFloor(c) { return ((c.x - DANCE.x) / DANCE.rx) ** 2 + ((c.y - DANCE.y) / DANCE.ry) ** 2 <= 1; }

function startCurse() {
  game.curse = true;
  game.curseStart = performance.now();
  // The Harpsichord crashes in at once (musicFor plays it while the
  // curse lasts).
  sound.setTheme('waltz', { fade: 0.25, restart: true });
  world.weasels.forEach(s => { s.visible = true; });
  ui.log('The harpsichord crashes into a lurching, discordant waltz. In the cracked mirror the room is full of dancers.', 'scare');
  setTimeout(() => { if (game.curse) ui.log('“Vessla Browntooth will sacrifice your souls!” chitter the weasels pouring from the walls, all in one voice.', 'scare'); }, 2600);
  addDread(1);
}

function endCurse(quiet) {
  game.curse = false;
  world.weasels.forEach(s => { s.visible = false; });
  if (!quiet) ui.log('The music fades behind you, though your feet still want to dance.', 'note');
}

async function harpsichordScene() {
  if (game.flags.musicSolved) {
    await ui.say('The harpsichord', 'Silent now. There is a gap in the keys where the black ivory one used to be.');
    return;
  }
  if (!game.curse) {
    await ui.say('The harpsichord', 'You touch a key. The harpsichord answers with a crash of discord, and the whole room begins to turn.');
    startCurse();
  }
  const guided = game.clues.has('patrini');
  await ui.say('', guided
    ? 'Only another tune can drown out the waltz. As you sit, a cold blue hand settles over yours: Patrini, the old servant from the spirit board, guiding your fingers.'
    : 'Only another tune can drown out the waltz. Listen to the melody that rises faintly under the noise, and play it back.');
  const ok = await melodyPuzzle(guided);
  if (!ok) { ui.log('You pull away from the keys. The waltz plays on.', 'note'); return; }
  endCurse(true);
  showPatrini();
  ui.log('The waltz breaks off. In the silence a shimmering blue figure sits at the harpsichord and plays, slow and sad.', 'note');
  // Patrini's song: The Echoes, from the top, for as long as you stay in
  // the music room (see musicFor in main.js).
  game.echoesPlaying = true;
  sound.setTheme('echoes', { fade: 1.5, restart: true });
  await ui.say('Joseph Patrini', 'He sings, very softly, of a kitchen fire that never went out, of children’s feet on the stairs, of a house that was warm once. The song ends before it should, as though he can’t remember the rest.');
  await ui.say('', 'The figure fades. With a soft crack, a single black ivory key springs loose and clatters to the floor.');
  game.flags.musicSolved = true;
  giveMemento('key');
}

// The keyboard: the tune plays with its keys lit, then you play it back.
// With Patrini's help, the next key glows faintly under your hand.
function melodyPuzzle(guided) {
  return new Promise(resolve => {
    const root = $('keys');
    const notes = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    root.innerHTML = `<div class="keys-panel"><p class="keys-text">Listen…</p><div class="keyboard">${notes.map((n, i) => `<button type="button" class="key" data-note="${n}"><span>${i + 1}</span></button>`).join('')}</div><button type="button" class="keys-leave">Step away</button></div>`;
    root.hidden = false;
    ui.overlay = 'keys';
    const text = root.querySelector('.keys-text');
    const keyEl = n => root.querySelector(`[data-note="${n}"]`);
    let pos = 0, listening = false;
    const light = (n, ms = 380, cls = 'lit') => { const el = keyEl(n); el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); };
    const hint = () => { root.querySelectorAll('.key').forEach(k => k.classList.remove('hint')); if (guided && listening) keyEl(PATRINI_TUNE[pos]).classList.add('hint'); };
    const playTune = async () => {
      listening = false; hint();
      text.textContent = 'Listen…';
      await sleep(500);
      for (const n of PATRINI_TUNE) { sound.pluck(NOTE[n], 0, 0.9, 0.2); light(n, 420); await sleep(guided ? 650 : 480); }
      text.textContent = 'Now play it back.';
      pos = 0; listening = true; hint();
    };
    const press = n => {
      if (!listening) return;
      sound.pluck(NOTE[n], 0, 0.9, 0.22);
      light(n, 250, 'pressed');
      if (n === PATRINI_TUNE[pos]) {
        pos++;
        if (pos === PATRINI_TUNE.length) { listening = false; setTimeout(() => finish(true), 600); }
        hint();
      } else {
        listening = false;
        sound.pluck(NOTE.C / 4, 0, 1.4, 0.3, -60); sound.pluck(NOTE.F / 4 * 1.06, 0, 1.4, 0.25);
        text.textContent = 'The waltz swells and swallows your note.';
        addDread(1);
        if (game.flags.breaking) { finish(false); return; }
        setTimeout(playTune, 1400);
      }
    };
    const onKey = e => { const i = Number(e.key) - 1; if (i >= 0 && i < notes.length) { e.preventDefault(); e.stopImmediatePropagation(); press(notes[i]); } else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); } else e.stopImmediatePropagation(); };
    let finished = false;
    const finish = ok => { if (finished) return; finished = true; document.removeEventListener('keydown', onKey, true); root.hidden = true; root.innerHTML = ''; ui.overlay = null; lockInput(300); resolve(ok); };
    root.querySelectorAll('.key').forEach(k => k.addEventListener('click', () => press(k.dataset.note)));
    root.querySelector('.keys-leave').addEventListener('click', () => finish(false));
    document.addEventListener('keydown', onKey, true);
    playTune();
  });
}

function showPatrini() {
  const s = world.patrini;
  s.visible = true; s.material.opacity = 0;
  const t0 = performance.now();
  const tick = now => {
    const k = (now - t0) / 1000;
    s.material.opacity = k < 1 ? k : k < 7 ? 1 : Math.max(0, 1 - (k - 7));
    if (k < 8) requestAnimationFrame(tick); else s.visible = false;
  };
  requestAnimationFrame(tick);
}

// ─── Teasers for rooms the next chapter opens up ──────────────────────

async function peacockScene() {
  const t = THINGS.find(x => x.id === 'peacock');
  const pick = await ui.say(t.name, t.text, [{ id: 'pry', text: 'Try to pry out the bloodstone' }, { id: 'leave', text: 'Leave it' }]);
  if (pick !== 'pry') return;
  await ui.say('', 'The instant your fingers touch the stone, marble grinds against marble. The peacock’s head turns, slowly, towards you, and its great tail begins to rise. You snatch your hand back, and it settles. But it is watching you now.');
  addDread(2);
}

async function ovenScene() {
  const t = THINGS.find(x => x.id === 'oven');
  if (!game.flags.ovenHeard) {
    game.flags.ovenHeard = true;
    await ui.say(t.name, t.text);
    await ui.say('', 'Then the greasy stench of burning fills the kitchen. Black smoke curls from around the iron door, and from inside comes pounding, and muffled screaming.');
    addDread(1);
  }
  const pick = await ui.say(t.name, 'The screaming goes on behind the iron door.', [{ id: 'lock', text: 'Look closely at the lock' }, { id: 'open', text: 'Force the door open' }, { id: 'leave', text: 'Back away' }]);
  if (pick === 'lock') {
    await ui.say('', 'Scratched into the rust, almost too faint to see, a small sigil glows like a coal. Whatever is behind this door, the lock was made to be opened.');
  } else if (pick === 'open') {
    ui.flash('#ff8a40', 800);
    await ui.say('', 'You wrench at the lock and the iron door bursts open in a roar of heat. Shrieking, burning shapes reach for you, and then are gone. The oven is cold. Your eyebrows are not.');
    addDread(2);
  }
}

async function feastScene() {
  const t = THINGS.find(x => x.id === 'feast');
  const pick = await ui.say(t.name, t.text, [{ id: 'eat', text: 'Take something from the table' }, { id: 'leave', text: 'Leave it' }]);
  if (pick !== 'eat') return;
  await ui.say('', 'You lift a little cake from a silver tray. It is warm, and it moves. You drop it, and it crawls back onto its plate.');
  addDread(1);
}

// ─── The hallway: the Crooked Man ─────────────────────────────────────

function crookedMan() {
  game.flags.crookedManSeen = true;
  // A few squares ahead along the hall, in whichever direction you face
  // (or behind you, if there's no hall ahead).
  const along = d => { let c = GRID.at(game.cx, game.cy), n = 0; while (n < 3 && canStep(c, d)) { c = GRID.at(c.cx + DIRS[d][0], c.cy + DIRS[d][1]); n++; } return n >= 2 ? c : null; };
  const spot = along(game.dir) || along((game.dir + 2) % 4);
  if (!spot) return;
  const s = world.crookedMan;
  s.position.set(spot.x, 0, spot.y);
  s.visible = true; s.material.opacity = 0;
  strike(1);
  const t0 = performance.now();
  const tick = now => {
    const k = (now - t0) / 1000;
    s.material.opacity = k < 0.4 ? k / 0.4 : k < 2.4 ? 1 : Math.max(0, 1 - (k - 2.4) / 0.8);
    if (k < 3.3) requestAnimationFrame(tick); else s.visible = false;
  };
  requestAnimationFrame(tick);
  ui.log('A tall, crooked figure stands in the hall with an axe raised. “I cut them down, one by one!” He swings — and is gone.', 'scare');
  addDread(1);
}

function fadeSprite(kind) {
  const s = world.sprites.find(x => x.userData.kind === kind);
  if (!s) return;
  const t0 = performance.now();
  const tick = now => { const k = (now - t0) / 1500; s.material.opacity = Math.max(0, 1 - k); if (k < 1) requestAnimationFrame(tick); else s.visible = false; };
  requestAnimationFrame(tick);
}
