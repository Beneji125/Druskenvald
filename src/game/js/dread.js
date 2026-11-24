// Dread: not just a meter to keep empty, but how you see the house.
//
//   0–3  Calm        an old, rotting house. Safe, and blind to its secrets.
//   4–6  Uneasy      whispers; things not quite right start to show.
//   7–9  Terrified   the house's true face; some secrets exist only here.
//   10   Breaking    you run (story.js: nerveBreaks).
//
// The lantern is how you steer it. Bright, it keeps you calm, but burns
// oil faster and hides what the house would rather you didn't see. Low,
// Dread creeps up (never past LOW_CAP on its own) and the hidden starts to
// show. If the oil runs out, the dark drives you all the way to breaking.
// You calm down by the lit parlour fire, with a cup of tea, by freeing a
// ghost, or just by keeping the lantern bright.
//
// Things in THINGS can carry `minDread` (only there when you're at least
// that frightened) and `dreadText: [n, text]` (what you see instead once
// your Dread is n or more).

const DREAD_BANDS = [
  { name: 'calm', from: 0 }, { name: 'uneasy', from: 4 }, { name: 'terrified', from: 7 }, { name: 'breaking', from: 10 },
];
const LOW_CAP = 8;
// Seconds per point of Dread gained or lost, by situation.
const DREAD_RATES = { hearth: -5, bright: -30, low: 25, dark: 8 };
// Oil: the share of a full lantern burned per second at each setting.
// A full lantern lasts 15 minutes bright, nearly 40 low.
const OIL_BURN = { bright: 1 / 900, low: 1 / 2300 };
const LANTERN_LEVEL = { bright: 1, low: 0.32, dark: 0.04 };

function dreadBand(d = game.dread) {
  return [...DREAD_BANDS].reverse().find(b => d >= b.from).name;
}

let dreadClock = 0, lanternNow = 1;

// Called every frame by the main loop (dt in seconds). Returns the
// lantern's brightness (0–1) for the light.
function tickDread(dt, here) {
  const quiet = !game.busy && !ui.overlay && !game.curse && !game.inEncounter && !game.flags.breaking;
  // Oil.
  const setting = game.lanternLow ? 'low' : 'bright';
  if (!easyMode() && game.oil > 0) {
    const before = game.oil;
    game.oil = Math.max(0, game.oil - OIL_BURN[setting] * dt);
    if (before > 0.15 && game.oil <= 0.15) ui.log('The lantern is guttering. It needs oil.', 'scare');
    if (before > 0 && game.oil === 0) { ui.log('The lantern sputters and goes out. The dark presses in.', 'scare'); sound.hit(); }
  }
  ui.setOil(easyMode() ? 1 : game.oil);
  const dark = game.oil <= 0 && !easyMode();
  // Dread drifting.
  const byFire = game.flags.hearthLit && here.room === 'parlor';
  const rate = dark ? DREAD_RATES.dark : byFire ? DREAD_RATES.hearth : game.lanternLow ? DREAD_RATES.low : DREAD_RATES.bright;
  if (quiet) {
    dreadClock += dt;
    if (dreadClock >= Math.abs(rate)) {
      dreadClock = 0;
      if (rate < 0 && game.dread > 0) addDread(-1);
      else if (rate > 0 && (dark || game.dread < LOW_CAP)) addDread(1);
    }
  } else dreadClock = 0;
  // The lantern's light eases towards its setting.
  const target = dark ? LANTERN_LEVEL.dark : LANTERN_LEVEL[setting];
  lanternNow += (target - lanternNow) * Math.min(1, dt * 3);
  applyDreadLook(dt);
  return lanternNow;
}

// How Dread looks and sounds: the view darkens at the edges and drains of
// colour as it rises; whispers when uneasy, a heartbeat when terrified.
let lookNow = 0;
function applyDreadLook(dt) {
  const target = game.dread / DREAD_MAX;
  lookNow += (target - lookNow) * Math.min(1, dt * 1.5);
  const veil = $('dread-veil');
  veil.style.opacity = String(Math.max(0, (lookNow - 0.25) * 1.25).toFixed(3));
  const sat = 1 - Math.max(0, lookNow - 0.35) * 0.9;
  $('view').style.filter = lookNow > 0.36 ? `saturate(${sat.toFixed(2)}) contrast(${(1 + (lookNow - 0.36) * 0.25).toFixed(2)})` : '';
  sound.setDreadBand(dreadBand());
}

function toggleLantern() {
  if (!easyMode() && game.oil <= 0) { ui.log('There’s no oil left to burn.', 'note'); return; }
  game.lanternLow = !game.lanternLow;
  ui.setLanternMode(game.lanternLow);
  ui.log(game.lanternLow ? 'You turn the lantern down. The dark comes closer, and so does everything in it.' : 'You turn the lantern up, and the house draws back a little.', 'note');
  saveGame();
}

function refillLantern() {
  takeItem('oil');
  game.oil = 1;
  ui.setOil(1);
  ui.log('You fill the lantern. The flame steadies and climbs.', 'gain');
  saveGame();
}

async function drinkTea() {
  swapItem('tea', 'kettle');
  await ui.say('', 'You drink the bergamot tea straight from the kettle’s spout, scalding and sweet. For a moment you’re somewhere warm and ordinary, and your hands stop shaking.');
  addDread(-3);
}

// What a thing looks like at your current Dread.
function thingText(t) {
  if (t.dreadText && game.dread >= t.dreadText[0]) return t.dreadText[1];
  return t.text;
}
