// Filthy Jasper: Vessla Browntooth's familiar, weasel-like but with a
// man's hands, collector of teeth. He is how Dread follows you around.
//
//   Uneasy (4+)     glimpsed now and then, off to one side, gone when you
//                   turn to look.
//   Terrified (7+)  he waits for you in the room, and will talk. He trades
//                   in teeth: stolen things back, a hint, or his "help"
//                   (your fear, taken away, for a little of your soul:
//                   Crookedness).
//   Breaking        when your nerve breaks, he steals something you carry
//                   (a memento too) and hides it in his nest.
//   His nest        under the foyer stairs, only there for frightened
//                   eyes until you've found it once. Everything he stole
//                   is there.
//
// He grows fond of you as you grow crooked, which is worse.

const JASPER_PRICES = { item: 2, memento: 3, hint: 1 };
const NEST = { id: 'nest', name: 'Jasper’s nest', x: 668, y: 960, h: 18, verb: 'Search' };
const jasper = { mode: 'hidden', until: 0, nextGlimpse: 12, cell: null, yawAt: 0, room: null };

// Things to say, worst to best: he speaks to you more warmly the more
// crooked you've become.
function jasperVoice() {
  const c = game.crooked || 0;
  return c >= 3 ? 'friend' : c >= 1 ? 'admiring' : 'sneering';
}

// ─── In the world ─────────────────────────────────────────────────────

// Called every frame by the main loop.
function tickJasper(dt, here, now) {
  const s = world.jasper;
  const quiet = !game.busy && !ui.overlay && !game.curse && !game.inEncounter && !game.flags.breaking && here.room !== 'porch';
  const band = dreadBand();
  // Terrified: he's here, waiting, a square or two away.
  if (quiet && (band === 'terrified')) {
    if (jasper.mode !== 'present' || jasper.room !== here.room) {
      const c = jasperSpot(1, 2, 0) || jasperSpot(1, 1, 1);
      if (c) { place(s, c, 16); jasper.mode = 'present'; jasper.room = here.room; sound.scurry(); }
    }
  } else if (jasper.mode === 'present') hide(s);
  // Uneasy: a glimpse at the edge of sight, now and then.
  if (jasper.mode === 'glimpse') {
    const turned = Math.abs(yawDelta(yaw, jasper.yawAt)) > 0.25;
    if (now > jasper.until || turned || !quiet) hide(s);
  } else if (jasper.mode === 'hidden' && quiet && band === 'uneasy') {
    jasper.nextGlimpse -= dt;
    if (jasper.nextGlimpse <= 0) {
      jasper.nextGlimpse = 18 + Math.random() * 22;
      const c = jasperSpot(2, 3, 1);
      if (c) { place(s, c); jasper.mode = 'glimpse'; jasper.until = now + 900; jasper.yawAt = yaw; sound.scurry(); }
    }
  }
  if (s.visible) s.position.y = Math.abs(Math.sin(now / 140)) * 1.5;   // twitching
  // His nest: there when you're terrified, or once you know where it is.
  world.nest.visible = thingAvailable(NEST_THING);
}

// `back`: how far past the square's middle (away from you) he sits, so
// that close up he's still in view.
function place(s, c, back = 0) {
  jasper.cell = c;
  const jitter = back ? 6 : (CELL / 2 - 10), [fx, fy] = DIRS[game.dir];
  s.position.set(c.x + fx * back + (Math.random() - 0.5) * jitter, 0, c.y + fy * back + (Math.random() - 0.5) * jitter);
  JASPER_THING.x = s.position.x; JASPER_THING.y = s.position.z;
  s.visible = true;
}
function hide(s) { s.visible = false; jasper.mode = 'hidden'; jasper.cell = null; }
function yawDelta(a, b) { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// A walkable square `min`–`max` steps away that you can see from where you
// stand: straight ahead (side = 0), or ahead and off to one side (side = 1,
// for a glimpse at the edge of your view).
function jasperSpot(min, max, side) {
  const here = GRID.at(game.cx, game.cy);
  const [fx, fy] = DIRS[game.dir], [rx, ry] = DIRS[(game.dir + 1) % 4];
  const options = [];
  for (let d = min; d <= max; d++) {
    const offs = side ? [-1, 1].map(k => k * Math.ceil(d / 2)) : [0];   // waiting for you: straight ahead
    offs.forEach(o => {
      const c = GRID.at(here.cx + fx * d + rx * o, here.cy + fy * d + ry * o);
      if (!c || !c.walk || c.blocked || c.room !== here.room) return;
      if (GRID.segs.some(([a, b]) => segmentsCross([here.x, here.y], [c.x, c.y], a, b))) return;
      options.push(c);
    });
  }
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}

// ─── Talking ──────────────────────────────────────────────────────────

const JASPER_THING = { id: 'jasper', name: 'Filthy Jasper', verb: 'Speak to', x: 0, y: 0, h: 22,
  when: () => jasper.mode === 'present', run: () => jasperTalk() };
const NEST_THING = { ...NEST, when: () => game.flags.nestFound || game.dread >= 7, run: () => searchNest() };
THINGS.push(JASPER_THING, NEST_THING);

async function jasperTalk() {
  const v = jasperVoice();
  const greet = {
    sneering: 'A weaselly thing, grey and greasy, crouches on the floor and looks up at you with small wet eyes. Its hands are a man’s hands, pink and long-fingered. One of them is turning a tooth over and over. “Ooh,” it says. “Frightened, are we? Frightened is when we can talk. Jasper is Jasper. What does the little master want?”',
    admiring: 'Jasper sits up on his haunches when he sees you, and something like respect comes into his wet little eyes. “There’s the one,” he says. “The one who does what needs doing. Jasper has been watching. What does the master want?”',
    friend: 'Jasper scurries to your feet, delighted, and rubs his pink hands together. “Friend! Friend has come back! Jasper knew. Jasper always knows. The house likes you very much now. What shall we do, friend?”',
  }[v];
  let text = greet;
  for (;;) {
    const choices = [];
    if (game.stolen.length) choices.push({ id: 'back', text: `“Give me back what you took.” (${game.stolen.length} thing${game.stolen.length > 1 ? 's' : ''})` });
    choices.push({ id: 'hint', text: `“Tell me something useful.” (${JASPER_PRICES.hint} tooth)` });
    choices.push({ id: 'want', text: '“What do you want with teeth?”' });
    choices.push({ id: 'help', text: '“Make the fear stop.”' });
    choices.push({ id: 'leave', text: 'Back away' });
    const pick = await ui.say('Filthy Jasper', text, choices);
    if (pick === 'leave') return;
    if (pick === 'want') text = '“Teeth are where the soul holds on, when it’s frightened.” He clicks the tooth against his own. “Grit your teeth, they say. Clench your jaw. Mistress likes them. Mistress makes things with them.” He giggles. “You have lovely teeth.”';
    if (pick === 'hint') {
      if (game.teeth < JASPER_PRICES.hint) { text = '“A tooth for a secret. That’s fair. That’s the price.” He holds out his little pink palm, empty. “No tooth, no secret.”'; continue; }
      addTeeth(-JASPER_PRICES.hint);
      text = `He snatches the tooth and pops it somewhere inside his fur. “${jasperHint()}”`;
    }
    if (pick === 'back') text = await jasperReturn();
    if (pick === 'help') {
      const yes = await ui.say('Filthy Jasper', '“Jasper can take it away. All of it. The shaking, the cold, the eyes in the walls. Just give Jasper a little something.” He taps his own chest, where a heart would be. “A little bit. You won’t miss it.”', [{ id: 'yes', text: 'Let him', dark: true }, { id: 'no', text: '“No.”' }]);
      if (yes !== 'yes') { text = '“No? No.” He shrugs his narrow shoulders. “Later, then. Jasper will ask again later.”'; continue; }
      game.crooked = (game.crooked || 0) + 1;
      await ui.say('', 'He lays one small pink hand flat against your chest. There is a feeling like a thread being pulled out of a seam, slowly, from somewhere deep inside you. Then it’s done, and you’re not afraid any more. You’re not much of anything any more.');
      addDread(-DREAD_MAX);
      hide(world.jasper);
      saveGame();
      return;
    }
  }
}

async function jasperReturn() {
  const lines = [];
  for (const id of [...game.stolen]) {
    const memento = MEMENTOS.find(m => m.id === id);
    const price = memento ? JASPER_PRICES.memento : JASPER_PRICES.item;
    const name = ownedName(id);
    if (game.teeth < price) { lines.push(`“${name.charAt(0).toUpperCase() + name.slice(1)}? That’s ${price} teeth, that is.”`); continue; }
    addTeeth(-price);
    restoreStolen(id);
    lines.push(`He counts ${price} teeth out of your hand and drops ${name} into it.`);
  }
  return lines.join(' ') + (game.stolen.length ? ' “Find more teeth, little master. Or find where Jasper keeps things.” He winks.' : ' “All square,” he says. “For now.”');
}

function jasperHint() {
  const f = game.flags, m = game.mementos;
  if (!game.clues.has('lockwoods')) return 'The pictures in the front hall have names on them. Names are useful. Names make the dead turn round.';
  if (!f.petuniaFreed && !f.petuniaGone) return f.petuniaTea ? 'Mother has her tea. Now she wants her little ones. Say their names to her.' : 'Mother is so cold. She’d like her tea. Hot, mind, from her own tree, and the fire in the parlour is the only one that burns.';
  if (!f.feastDone) return 'The dinner wants a guest with manners. Sit. Say grace. Praise the cook. Or burn it, burn it! Jasper likes it when they burn.';
  if (!f.musicSolved) return 'The music room wants a different song. The old servant knows one. Ask him, at the board in the parlour, and he’ll help your hands.';
  if (!m.has('gem')) return 'The white bird in the round room. Don’t look in its eye. Let it look in its own, with a bit of a broken mirror.';
  return 'Upstairs, upstairs. Not yet. The stairs aren’t ready for you. Soon.';
}

// ─── Stealing and the nest ────────────────────────────────────────────

// "your carving knife", "the black ivory key", "Petunia’s porcelain teacup".
function ownedName(id) {
  const m = MEMENTOS.find(x => x.id === id);
  if (m) return /^A /.test(m.name) ? 'the ' + m.name.slice(2) : m.name;
  return 'your ' + ITEMS[id].name.toLowerCase();
}

// When your nerve breaks: one thing you carry, gone. Returns its name.
function jasperSteal() {
  const pool = [...game.items.filter(id => id !== 'kettle_hot'), ...game.mementos];
  if (!pool.length) return null;
  const id = pool[Math.floor(Math.random() * pool.length)];
  if (game.mementos.has(id)) game.mementos.delete(id);
  else takeItem(id);
  game.stolen.push(id);
  ui.drawInventory();
  saveGame();
  return ownedName(id);
}

function restoreStolen(id) {
  game.stolen = game.stolen.filter(x => x !== id);
  if (MEMENTOS.some(m => m.id === id)) game.mementos.add(id);
  else giveItem(id, { quiet: true });
  saveGame();
}

async function searchNest() {
  const first = !game.flags.nestFound;
  game.flags.nestFound = true;
  if (!game.stolen.length) {
    await ui.say(NEST.name, first
      ? 'Under the stairs, in the dark, a nest: rags, hair, chewed paper, and teeth. Hundreds of teeth, packed in like seeds. Something has been living here a long time. You prise a couple of loose teeth from the edge.'
      : 'The nest. Rags and teeth, and the warm, musky smell of something that has only just left. Nothing of yours is here.');
    if (first) addTeeth(2);
    saveGame();
    return;
  }
  const names = game.stolen.map(ownedName);
  await ui.say(NEST.name, `${first ? 'Under the stairs, in the dark, a nest: rags, hair, chewed paper, and teeth, packed in like seeds. ' : ''}Tucked deep in among the teeth, still warm from being slept on: ${names.join(', ')}. You take ${names.length > 1 ? 'them' : 'it'} back. From somewhere in the walls comes an outraged chittering.`);
  [...game.stolen].forEach(restoreStolen);
}
