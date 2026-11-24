// The hauntings you can't simply look at: each room's encounter, as data
// for the encounter engine (encounter.js), and the scenes that start them.
// Kills raise Crookedness (game.crooked); see the dark route.

const ENCOUNTERS = {};

// ─── The dining room: the Phantom Feast ───────────────────────────────
// The book: the food and tablecloth come alive; dishes fly at you, each
// with its own effect (the sugar bowl blinds, the roast fish poisons, the
// lobster claw cuts). Here: dodge the dishes; calm the feast by honouring
// it as a guest would; or burn it.

ENCOUNTERS.feast = {
  name: 'The Phantom Feast',
  art: () => feastFoeArt(),
  calmMax: 3,
  intro: 'As you reach for the table, the cutlery begins to tremble. The tablecloth heaves like something breathing underneath, and every dish on the table rises into the air and turns towards you.',
  prompt: st => ['The feast hangs in the air, dripping, waiting.', 'Plates circle you slowly, like birds.', 'The tablecloth ripples. Somewhere, a chair scrapes back.'][st.turn % 3],
  calmFull: 'The dishes sink slowly back towards the table. The feast is satisfied. You could let it rest.',
  notReady: 'The feast isn’t done with you yet.',
  flee: 'You back out of the room, and the dishes clatter down behind you.',
  acts: [
    { id: 'grace', text: 'Say grace', once: true, calm: 1, line: 'You bow your head and say the grace your grandmother used to say. The plates hesitate. A sugar bowl lowers itself an inch, almost politely.' },
    { id: 'sit', text: 'Take a seat at the table', once: true, calm: 1, line: 'You pull out a chair and sit, as a guest should. For a moment every dish is perfectly still, as though a host somewhere has smiled.' },
    { id: 'cook', text: 'Praise Mrs Patrini’s cooking', once: true, calm: 1, when: () => game.clues.has('lockwoods'),
      line: '“Gail Patrini’s roast,” you say, “the best in Wickermoor.” A ladle taps twice against a tureen, delighted, and the gravy boat makes a small, contented bow.' },
    { id: 'eat', text: 'Eat something', line: 'You snatch a pastry out of the air and bite. It is warm. It moves in your mouth. You spit it out, gagging, and the whole feast laughs.',
      run: () => { addDread(1); drawEncDread(); } },
  ],
  items: {
    salt: { line: 'You pour a ring of salt around your feet. Whatever crosses it slows, as if wading through something thick.', shrink: 0.35 },
    matches: { kill: true, line: 'You strike a match and drop it on the tablecloth. It goes up at once, with a shriek that comes from every dish at the same time. The feast burns. It takes a long time.' },
    knife: { line: 'You wave the carving knife at the floating roast. It ducks, offended, and comes at you twice as hard.' },
  },
  patterns: [
    { duration: 7, text: 'Sugar bowls! They fling their sugar as they pass.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 0.75 : 0.5;
        const x = 20 + api.rand() * (api.w - 40);
        api.add({ x, y: -12, vx: (api.rand() - 0.5) * 60, vy: 120 + api.rand() * 50, r: 9, glyph: '◒', color: '#e8e4dc', onHit: (s, a) => a.effect('blind', 2.2) });
      } },
    { duration: 7, text: 'Roast fish glide through the air in a shoal.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 1.3 : 0.95;
        const fromLeft = api.rand() < 0.5, y0 = 30 + api.rand() * (api.h - 60);
        for (let i = 0; i < (api.easy ? 3 : 4); i++) {
          api.add({ x: fromLeft ? -20 - i * 34 : api.w + 20 + i * 34, y: y0, vx: fromLeft ? 130 : -130, vy: 0, r: 8, glyph: '❧', color: '#c9874a',
            update: (s, d, tt) => { s.y = y0 + Math.sin(tt * 4 + i) * 18; }, onHit: (s, a) => a.effect('slow', 3) });
        }
      } },
    { duration: 7, text: 'Lobster claws snap shut across the table, left and right.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0.3) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 1.1 : 0.8;
        const y = 20 + api.rand() * (api.h - 40), w = api.w * (0.45 + api.rand() * 0.15), left = api.rand() < 0.5;
        api.add({ x: left ? w / 2 : api.w - w / 2, y, rect: [w, 14], color: '#b8402e', armed: 0.6, life: 0.95 });
      } },
  ],
};

// The feast as you face it: the table, with dishes rising off it.
function feastFoeArt() {
  const [c, ctx] = artCanvas(256, 256);
  ctx.fillStyle = '#d8d2c2'; ctx.fillRect(20, 190, 216, 26);
  ctx.fillStyle = '#3a2414'; ctx.fillRect(20, 216, 216, 10); ctx.fillRect(34, 226, 10, 30); ctx.fillRect(212, 226, 10, 30);
  const dish = (x, y, col, w = 40) => { ctx.fillStyle = '#a0a4a8'; ctx.beginPath(); ctx.ellipse(x, y + 8, w / 2, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, w / 2.6, 10, 0, Math.PI, Math.PI * 2); ctx.fill(); };
  dish(128, 120, '#8a4a1c', 70); dish(60, 70, '#c9874a'); dish(196, 80, '#b8402e'); dish(90, 160, '#e8e4dc', 30); dish(176, 150, '#6a2a5a', 32);
  ctx.strokeStyle = 'rgba(216,210,194,0.4)'; ctx.setLineDash([2, 5]);
  [[128, 130], [60, 80], [196, 90]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, y + 10); ctx.lineTo(x, 188); ctx.stroke(); });
  return c;
}

// Approaching the feast starts it, until it's been dealt with.
async function feastScene() {
  const t = THINGS.find(x => x.id === 'feast');
  if (game.flags.feastDone) {
    await ui.say(t.name, game.flags.feastDone === 'killed'
      ? 'The table is a black scar. Ash lies where the feast was, and the smell of it will not leave the room.'
      : 'The table is bare and dusty now, the feast gone as though it had never been. The room feels lighter.');
    return;
  }
  const pick = await ui.say(t.name, t.text, [{ id: 'near', text: 'Step up to the table' }, { id: 'leave', text: 'Leave it' }]);
  if (pick !== 'near') return;
  const result = await runEncounter(ENCOUNTERS.feast);
  if (result === 'released') {
    game.flags.feastDone = 'released';
    world.feastMat && (world.feastMat.map = null, world.feastMat.color.set(0x5a5048), world.feastMat.needsUpdate = true);
    await ui.say('', 'The dishes settle onto the table one by one, and crumble, and are dust. Where the roast was, something glints among the ashes of the feast: a plain gold ring.');
    giveItem('ring', { quiet: true });
    addDread(-2);
  } else if (result === 'killed') {
    game.flags.feastDone = 'killed';
    game.crooked = (game.crooked || 0) + 1;
    world.feastMat && (world.feastMat.map = null, world.feastMat.color.set(0x1a1410), world.feastMat.needsUpdate = true);
    await ui.say('', 'When the fire dies, the table is scorched black. In the ash lies a gold ring, blistered by the heat. Somewhere in the walls, something sighs with pleasure.');
    giveItem('ring', { quiet: true });
  }
  saveGame();
}

// ─── The kitchen: the oven ────────────────────────────────────────────
// The book: smoke and screams from a locked brick oven; a hidden glyph on
// the lock is a trap. Spot it (flour on the lock, or terrified eyes) and
// you can disarm it, and the burning souls inside are let go. Force the
// door and the trap fires: get out of the flames, and the souls burn away.
// Either way, the oven holds the charred second half of Patrini's tune.

ENCOUNTERS.ovenFire = {
  name: 'The Oven',
  art: () => ovenFoeArt(),
  hazard: true,
  intro: 'The iron door bursts open with a roar. Shrieking, burning shapes pour out of the oven, and the kitchen fills with fire and black, choking smoke.',
  survived: 'You stagger clear, coughing. Behind you the shrieking thins, and stops, and the burning shapes are gone. Burned away. The oven ticks as it cools.',
  calmMax: 1, acts: [], items: {},
  patterns: [
    { duration: 6, text: 'Fire! Find the gaps in the flames.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 0.9 : 0.65;
        const gap = api.rand() * (api.h - 70) + 10;
        for (let y = 6; y < api.h; y += 18) if (y < gap || y > gap + (api.easy ? 70 : 55)) api.add({ x: api.w + 12, y, vx: -150, vy: 0, r: 8, glyph: '🔥', color: '#ff8a40' });
      } },
    { duration: 5, text: 'Burning hands reach for you.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 0.7 : 0.45;
        const e = api.edge(), v = api.aim(e, 110);
        api.add({ x: e.x, y: e.y, ...v, r: 7, color: '#ff6a2a' });
      } },
  ],
};

function ovenFoeArt() {
  const [c, ctx] = artCanvas(256, 256);
  ctx.drawImage(ovenFrontTexture().image, 28, 40, 200, 200);
  const g = ctx.createRadialGradient(128, 150, 5, 128, 150, 90);
  g.addColorStop(0, 'rgba(255,220,120,0.95)'); g.addColorStop(0.5, 'rgba(255,90,20,0.6)'); g.addColorStop(1, 'rgba(255,40,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return c;
}

async function ovenScene() {
  const t = THINGS.find(x => x.id === 'oven');
  const f = game.flags;
  if (f.ovenDone) {
    await ui.say(t.name, f.ovenDone === 'killed'
      ? 'The oven is cold and black inside, and smells of something you will not name. It is quiet now. Too quiet.'
      : 'The oven door hangs open. Inside there is only clean grey ash, and a feeling, faint as warmth, of something grateful.');
    return;
  }
  // Frightened enough, you see what was hidden on the lock all along.
  if (game.dread >= 7 && !f.glyphSeen) {
    f.glyphSeen = true;
    await ui.say(t.name, 'Your eyes are wide and your heart is hammering, and so you see it: a small coiled glyph scratched into the rusted lock, glowing faintly like a coal. It was always there.');
  }
  if (!f.ovenHeard) {
    f.ovenHeard = true;
    await ui.say(t.name, t.text);
    await ui.say('', 'Then the greasy stench of burning fills the kitchen. Black smoke curls from around the iron door, and from inside comes pounding, and muffled screaming.');
    addDread(1);
  }
  const choices = [];
  if (f.glyphSeen) choices.push({ id: 'trace', text: 'Trace the glyph backwards, to undo it' });
  else choices.push({ id: 'lock', text: 'Look closely at the lock' });
  choices.push({ id: 'open', text: 'Force the door open', dark: true }, { id: 'leave', text: 'Back away' });
  const pick = await ui.say(t.name, 'The screaming goes on behind the iron door.', choices);
  if (pick === 'lock') {
    await ui.say('', 'Rust, and a lock heavier than it needs to be. You can’t see anything else, though something about the lock makes your skin crawl. If only you could see it better.');
  } else if (pick === 'trace') {
    const ok = await glyphPuzzle();
    if (ok === null) return;
    if (ok) {
      f.ovenDone = 'freed';
      sound.door(true);
      await ui.say('', 'The last line of the glyph unravels under your finger, and the lock falls open of its own accord. The door swings wide. The burning shapes inside go still, and the fire goes out of them, and they rise past you like warm air and are gone. One of them, small, touches your hand as it passes.');
      await ui.say('', 'In the ash at the back of the oven, something didn’t burn: a page of music, charred at the edges.');
      giveItem('music_b', { quiet: true });
      addDread(-2);
    } else {
      await ui.say('', 'The glyph flares white-hot under your finger. It knows what you were trying to do.');
      await ovenTrap();
    }
  } else if (pick === 'open') {
    await ovenTrap();
  }
  saveGame();
}

async function ovenTrap() {
  const r = await runEncounter(ENCOUNTERS.ovenFire);
  if (r !== 'survived') return;
  game.flags.ovenDone = 'killed';
  game.crooked = (game.crooked || 0) + 1;
  await ui.say('', 'When the smoke clears, the oven is empty but for ash, and a page of music, burned almost black at the edges.');
  giveItem('music_b', { quiet: true });
}

// The glyph: a single unbroken line over a grid of dots. It's shown being
// drawn; to undo it, draw it backwards: from its end to its start, every
// stroke reversed. Arrow keys / WASD, or the buttons.
const GLYPH = [[1, 1], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1], [0, 0], [1, 0], [2, 0]];
function glyphPuzzle() {
  return new Promise(resolve => {
    const root = $('keys');
    const S = 70, O = 35;
    const dot = ([x, y]) => [O + x * S, O + y * S];
    root.innerHTML = `<div class="keys-panel glyph-panel">
      <p class="keys-text">Watch how it was drawn…</p>
      <svg class="glyph" viewBox="0 0 210 210" aria-label="The glyph">
        ${[0, 1, 2].flatMap(y => [0, 1, 2].map(x => `<circle cx="${O + x * S}" cy="${O + y * S}" r="5" class="gdot"/>`)).join('')}
        <polyline class="gline" points=""/><polyline class="gmine" points=""/><circle class="gpen" r="8" cx="-20" cy="-20"/>
      </svg>
      <div class="glyph-pad">${['up', 'left', 'down', 'right'].map(d => `<button type="button" data-d="${d}">${{ up: '▲', left: '◀', down: '▼', right: '▶' }[d]}</button>`).join('')}</div>
      <button type="button" class="keys-leave">Step away</button></div>`;
    root.hidden = false; ui.overlay = 'keys';
    const text = root.querySelector('.keys-text'), line = root.querySelector('.gline'), mine = root.querySelector('.gmine'), pen = root.querySelector('.gpen');
    // The moves that undo it: from the last point back to the first.
    const back = [...GLYPH].reverse();
    const need = back.slice(1).map((p, i) => { const q = back[i]; return p[0] > q[0] ? 'right' : p[0] < q[0] ? 'left' : p[1] > q[1] ? 'down' : 'up'; });
    let pos = 0, live = false, misses = 0;
    const show = async () => {
      live = false; mine.setAttribute('points', ''); line.setAttribute('points', ''); line.style.transition = ''; line.style.opacity = '1';
      text.textContent = 'Watch how it was drawn…';
      const pts = [];
      for (const p of GLYPH) { pts.push(dot(p).join(',')); line.setAttribute('points', pts.join(' ')); const [x, y] = dot(p); pen.setAttribute('cx', x); pen.setAttribute('cy', y); await sleep(easyMode() ? 420 : 300); }
      text.textContent = 'Now undo it: trace it back from the end to the start.';
      line.style.transition = 'opacity 1.2s'; line.style.opacity = easyMode() ? '1' : '0.12';   // from memory
      const [x, y] = dot(back[0]); pen.setAttribute('cx', x); pen.setAttribute('cy', y);
      mine.setAttribute('points', dot(back[0]).join(','));
      pos = 0; live = true;
    };
    const press = d => {
      if (!live) return;
      if (d === need[pos]) {
        pos++;
        const p = back[pos]; const [x, y] = dot(p);
        pen.setAttribute('cx', x); pen.setAttribute('cy', y);
        mine.setAttribute('points', back.slice(0, pos + 1).map(q => dot(q).join(',')).join(' '));
        sound.pluck(NOTE.E * (1 + pos / 10), 0, 0.3, 0.08);
        if (pos === need.length) { live = false; setTimeout(() => finish(true), 600); }
      } else {
        misses++; live = false;
        sound.hit(); addDread(1);
        root.querySelector('.glyph').classList.remove('flare'); void root.querySelector('.glyph').offsetWidth; root.querySelector('.glyph').classList.add('flare');
        if (misses >= 3 || game.flags.breaking) { setTimeout(() => finish(false), 500); return; }
        text.textContent = `The glyph flares. ${3 - misses === 1 ? 'Once more and it will fire.' : 'Careful.'}`;
        setTimeout(show, 1300);
      }
    };
    const KEYS = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    const onKey = e => { const d = KEYS[e.key.toLowerCase()]; e.stopImmediatePropagation(); if (d) { e.preventDefault(); press(d); } else if (e.key === 'Escape') { e.preventDefault(); finish(null); } };
    let done = false;
    const finish = ok => { if (done) return; done = true; document.removeEventListener('keydown', onKey, true); root.hidden = true; root.innerHTML = ''; ui.overlay = null; lockInput(300); resolve(ok); };
    root.querySelectorAll('.glyph-pad button').forEach(b => b.addEventListener('click', () => press(b.dataset.d)));
    root.querySelector('.keys-leave').addEventListener('click', () => finish(null));
    document.addEventListener('keydown', onKey, true);
    show();
  });
}

// ─── The conservatory: Petunia, angered ───────────────────────────────
// The book: forced, her grief turns to rage and she drains the life from
// you; her green ribbon, pulled loose, destroys her. Here: snatch her cup
// and she rises against you. Calm her with what she longs for, or seize
// the ribbon.

ENCOUNTERS.petunia = {
  name: 'Petunia Lockwood',
  art: 'petunia',
  calmMax: 3,
  intro: 'Petunia’s head snaps round. The green ribbon at her throat slips a finger’s width, and the air turns to ice. She rises from the bench, and the scream that tears out of her is not a sound a living woman could make.',
  prompt: st => ['Her hands reach for you, cold as the grave.', 'She is weeping, and every tear freezes as it falls.', '“Give it back,” she says, in a voice like cracking ice. “It’s all I have.”'][st.turn % 3],
  calmFull: 'Her hands fall to her sides. The ice in the air softens. She looks lost, and tired, and very sad. You could let her be.',
  notReady: 'She’s still too far gone in her grief.',
  flee: 'You stumble back out of the conservatory. Behind you, the weeping goes on.',
  acts: [
    { id: 'sorry', text: 'Apologise', once: true, calm: 1, line: '“I’m sorry. I shouldn’t have.” For a moment the cold eases. She doesn’t look at you, but she hears you.' },
    { id: 'names', text: 'Speak of Sally and Arthur', once: true, calm: 2, when: () => game.clues.has('lockwoods'),
      line: '“Sally,” you say. “Arthur.” Her face crumples. “My babies. Where are my babies?” The reaching hands falter.', run: () => { game.flags.petuniaNamed = true; } },
    { id: 'ribbon', text: 'Seize the green ribbon', dark: true, line: 'You lunge past her hands and catch the faded green ribbon at her throat, and pull. It comes undone far too easily.',
      run: st => { st.result = 'killed'; } },
  ],
  items: {
    tea: { calm: 2, line: 'You hold out the bergamot tea. She stops. She takes it in her cold hands, and smells it, and her shoulders drop. “That’s how I make it,” she whispers.', run: () => { swapItem('tea', 'kettle'); game.flags.petuniaTea = true; } },
    doll: { calm: 2, line: 'You hold up Sally’s doll. Petunia makes a small, broken sound and reaches for it, not for you.' },
    bear: { calm: 2, line: 'You hold up Arthur’s blue bear. “He can’t sleep without it,” she says, and the rage goes out of her like a breath.' },
    knife: { line: 'You raise the knife. She doesn’t even flinch. What could it do to her now?' },
  },
  patterns: [
    { duration: 6, text: 'Cold hands sweep across the room, reaching for you.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0.2) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 1.1 : 0.8;
        const left = api.rand() < 0.5, y = 20 + api.rand() * (api.h - 40);
        api.add({ x: left ? -40 : api.w + 40, y, vx: left ? 170 : -170, vy: 0, rect: [70, 16], color: '#b8c4d8' });
      } },
    { duration: 6, text: 'Her tears freeze as they fall.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 0.22 : 0.14;
        api.add({ x: api.rand() * api.w, y: -8, vx: 0, vy: 90 + api.rand() * 70, r: 4, color: '#cfe0ff' });
      } },
    { duration: 6, text: 'The teacup shatters in her hands, and the pieces fly.',
      spawn(api, t, dt) {
        this.next = (this.next ?? 0.3) - dt;
        if (this.next > 0) return;
        this.next = api.easy ? 1.4 : 1.0;
        const n = api.easy ? 8 : 12, off = api.rand() * Math.PI;
        for (let i = 0; i < n; i++) { const a = off + i / n * Math.PI * 2; api.add({ x: api.w / 2, y: api.h / 2, vx: Math.cos(a) * 110, vy: Math.sin(a) * 110, r: 5, color: '#f0f0f4', armed: 0.25 }); }
      } },
  ],
};

async function petuniaForced() {
  const r = await runEncounter(ENCOUNTERS.petunia);
  const f = game.flags;
  if (r === 'released') return petuniaAtPeace();
  if (r === 'killed') {
    f.petuniaGone = true; f.petuniaKilled = true;
    fadeSprite('petunia');
    sound.thunder(1);
    await ui.say('', 'Her head tips, and tips, and falls. There is a great deal of blood, and then there is none, and no Petunia either: only the faded green ribbon in your hand, and the white teacup lying on the bench where she sat.');
    game.crooked = (game.crooked || 0) + 1;
    game.tainted.push('cup');
    giveItem('ribbon', { quiet: true });
    giveMemento('cup');
    await runFlashback('petunia', { corrupt: true });
    return;
  }
  f.petuniaAngered = true;
  saveGame();
}
