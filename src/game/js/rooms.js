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
