// Things you carry: what they are, where they're found, what they combine
// into, and what they do when used on something. All of it is data, kept
// together here, so items and puzzles can be added or changed without
// touching the rest of the game:
//
//   ITEMS    every item: its name and what you see when you examine it
//            (its picture is drawn by itemIcon() in art.js)
//   SEARCHES places you can search, and what each holds. A search that
//            turns up nothing turns up a human tooth instead (the house is
//            full of them), once per place.
//   COMBOS   two items that go together, and what they make
//   USES     an item used on one of the THINGS (story.js) or on a search
//            spot: a line of text, a new item, or a script
//
// An item used on something with no entry gets a fitting refusal
// (REFUSALS), and two items that don't go together say so.

const ITEMS = {
  matches:      { name: 'Matches', text: 'A battered box of matches. It rattles: a dozen left, maybe.' },
  kettle:       { name: 'Kettle', text: 'A dented copper kettle, black on the bottom. Empty.' },
  kettle_water: { name: 'Kettle of water', text: 'The kettle, full of cold, faintly brown water from the pump.' },
  kettle_hot:   { name: 'Hot kettle', text: 'Steam curls from the spout. The handle is almost too hot to hold.' },
  tea:          { name: 'Bergamot tea', text: 'Hot water steeped with bergamot from the conservatory tree. It smells like a summer afternoon that ended a long time ago.' },
  bergamot:     { name: 'Bergamot', text: 'A green bergamot fruit from the conservatory tree, fragrant and firm, impossibly fresh.' },
  flour:        { name: 'Bag of flour', text: 'Half a sack of flour, grey with age. Fine enough to settle into the smallest crack.' },
  salt:         { name: 'Salt', text: 'A crock of coarse salt. Every grandmother in Wickermoor knows what a line of salt keeps out.' },
  knife:        { name: 'Carving knife', text: 'A long carving knife with a bone handle. Rust has eaten the edge, but the point is sharp.' },
  hatchet:      { name: 'Hatchet', text: 'A small hatchet for kindling. There is something dark worked into the grain of the handle.' },
  oil:          { name: 'Lamp oil', text: 'A tin flask of lamp oil. Enough to keep the lantern burning a good while.' },
  shard:        { name: 'Mirror shard', text: 'A long shard of the cracked music-room mirror. In it, the room behind you looks subtly wrong.' },
  music_a:      { name: 'Torn sheet music', text: 'The first half of a page of handwritten music, torn across. The notes climb, then stop mid-phrase. In the corner: “for G., from J.”' },
  music_b:      { name: 'Charred sheet music', text: 'The second half of a page of music, scorched at the edges. The melody falls back down to rest.' },
  music_full:   { name: 'Patrini’s tune', text: 'The two halves of the page, laid edge to edge: a short, gentle melody written by Joseph Patrini for his wife Gail.' },
  ring:         { name: 'Gold ring', text: 'A plain gold ring, found among the food on the feast table. Engraved inside: “E. & P.”' },
  ribbon:       { name: 'Green ribbon', text: 'A faded green ribbon. It is cold, and it is not quite dry.' },
  doll:         { name: 'Wooden doll', text: 'Sally Lockwood’s wooden doll, its painted smile worn almost away by small hands.' },
  bear:         { name: 'Blue teddy bear', text: 'Arthur Lockwood’s blue teddy bear, one button eye hanging by a thread.' },
};

// Places to search, in floor-plan pixels. `finds` is the item there, if
// any; `h` is how high its glint hangs. A spot with no `finds` holds a
// tooth.
const SEARCHES = [
  { id: 'console',     room: 'foyer',        x: 470,  y: 1078, h: 46, prop: 'console', name: 'The console table', finds: 'matches', text: 'A narrow table by the front door, its drawer swollen shut with damp. You work it open.' },
  { id: 'umbrellas',   room: 'foyer',        x: 650,  y: 1070, h: 40, prop: 'umbrellas', name: 'The umbrella stand', text: 'Three umbrellas, every one of them rotted to the ribs.' },
  { id: 'woodbasket',  room: 'parlor',       x: 425,  y: 770,  h: 22, prop: 'woodbasket', name: 'The woodbasket', finds: 'hatchet', text: 'Kindling, long gone to powder, and underneath it something heavier.' },
  { id: 'parlor_sofa', room: 'parlor',       x: 312,  y: 590,  h: 30, name: 'The sofa', text: 'You push your hand down between the rotten cushions.' },
  { id: 'cupboard',    room: 'kitchen',      x: 830,  y: 485,  h: 46, prop: 'cupboard', name: 'The cupboard', finds: 'kettle', text: 'Most of the crockery is smashed. One thing has survived.' },
  { id: 'shelf_heap',  room: 'kitchen',      x: 880,  y: 262,  h: 36, name: 'The collapsed shelf', finds: 'flour', text: 'You dig through the wreck of the shelf and the plaster it brought down with it.' },
  { id: 'barrel',      room: 'kitchen',      x: 724,  y: 252,  h: 40, name: 'The barrel', finds: 'salt', text: 'A barrel in the corner, its lid half off.' },
  { id: 'sideboard',   room: 'dining',       x: 990,  y: 650,  h: 46, name: 'The sideboard', finds: 'knife', text: 'Drawers of tarnished silver, every fork bent and every spoon twisted.' },
  { id: 'potting',     room: 'conservatory', x: 640,  y: 470,  h: 36, prop: 'pottingBench', name: 'The potting bench', finds: 'oil', text: 'Cracked pots, dead earth, a trowel rusted into a lump.' },
  { id: 'gallery_cab', room: 'gallery',      x: 300,  y: 1035, h: 40, prop: 'cabinet', name: 'The display cabinet', text: 'A glass-fronted cabinet of curios: a stuffed bird, a seashell, a bundle of letters too damp to read.' },
  { id: 'music_stand', room: 'music',        x: 900,  y: 1040, h: 52, prop: 'musicStand', name: 'The music stand', finds: 'music_a', text: 'A brass music stand with a few loose pages still clipped to it.' },
  { id: 'music_sofa',  room: 'music',        x: 790,  y: 880,  h: 30, name: 'The settee', text: 'The cushions crunch. You try not to think about why.' },
  { id: 'sconce',      room: 'hallway',      x: 742,  y: 760,  h: 70, prop: 'sconce', name: 'The wall lamp', finds: 'oil', text: 'An old oil lamp in a bracket on the wall, cold for years. Its reservoir still sloshes when you lift it.' },
  { id: 'rocker',      room: 'porch',        x: 470,  y: 1135, h: 36, name: 'The rocking chair', text: 'A rocking chair on the porch, still gently rocking though the wind can’t reach it.' },
];

const COMBOS = [
  { a: 'kettle_hot', b: 'bergamot', makes: 'tea', text: 'You drop the bergamot into the kettle. The steam turns sweet and sharp, and for a moment the house smells like somebody’s home.' },
  { a: 'kettle_water', b: 'bergamot', text: 'The water is cold. It needs heating first.' },
  { a: 'kettle', b: 'bergamot', text: 'There’s no water in the kettle.' },
  { a: 'music_a', b: 'music_b', makes: 'music_full', text: 'The torn edges meet exactly. The melody climbs, turns, and comes gently home.' },
  { a: 'matches', b: 'music_a', text: 'You could burn it. You don’t.' },
  { a: 'knife', b: 'ribbon', text: 'You can’t bring yourself to cut it.' },
];

// item → thing (or search spot). `text` alone just says something;
// `gives`/`takes` change what you carry; `run` is a script.
const USES = [
  { item: 'matches', on: 'fireplace', run: () => lightHearth() },
  { item: 'kettle', on: 'pump', takes: 'kettle', gives: 'kettle_water', text: 'You work the pump handle. It shrieks, coughs, and spits out a stream of cold water.' },
  { item: 'kettle_water', on: 'fireplace', run: () => heatKettle() },
  { item: 'kettle', on: 'fireplace', text: 'Heating an empty kettle won’t help anyone.' },
  { item: 'tea', on: 'petunia', run: () => petuniaScene('tea') },
  { item: 'doll', on: 'petunia', run: () => petuniaScene('doll') },
  { item: 'bear', on: 'petunia', run: () => petuniaScene('bear') },
  { item: 'knife', on: 'mirror', run: () => takeShard() },
  { item: 'hatchet', on: 'harpsichord', run: () => smashHarpsichord() },
  { item: 'hatchet', on: 'mirror', text: 'One swing would bring the whole mirror down, and every dancer in it with it. Not like that.' },
  { item: 'flour', on: 'oven', run: () => dustTheLock() },
  { item: 'matches', on: 'oven', text: 'Fire is the last thing this oven needs.' },
  { item: 'ring', on: 'portraits', text: 'You hold the ring up to the Lockwood portrait. On Petunia’s painted hand, a plain gold band, and on Eustace’s, its twin.' },
  { item: 'shard', on: 'peacock', text: 'You raise the shard. The peacock’s stone eye catches its own reflection, and for a moment the marble seems to flinch. Not yet: you’d need to be ready for what it does next.' },
];

// When nothing above fits.
const REFUSALS = [
  'That does nothing.',
  'You can’t see how that would help.',
  'Nothing happens. Somewhere in the walls, something laughs.',
  'That won’t work here.',
];

// ─── Carrying ─────────────────────────────────────────────────────────

function hasItem(id) { return game.items.includes(id); }

function giveItem(id, { quiet = false } = {}) {
  if (!ITEMS[id] || hasItem(id)) return;
  game.items.push(id);
  ui.drawInventory();
  ui.flashSlot(id);
  if (!quiet) ui.log(`You take ${articled(ITEMS[id].name)}.`, 'gain');
  sound.pickup();
  saveGame();
}

function takeItem(id) {
  game.items = game.items.filter(x => x !== id);
  if (ui.selected === id) ui.select(null);
  ui.drawInventory();
  saveGame();
}

function swapItem(from, to) {
  const i = game.items.indexOf(from);
  if (i < 0) return giveItem(to);
  game.items[i] = to;
  if (ui.selected === from) ui.select(null);
  ui.drawInventory();
  ui.flashSlot(to);
  saveGame();
}

function articled(name) {
  if (/^(Patrini|Petunia)/.test(name)) return name;
  if (/^(Matches|Salt|Lamp oil|Bergamot tea)$/.test(name)) return 'some ' + name.toLowerCase();
  return (/^[AEIOU]/i.test(name) ? 'an ' : 'a ') + name.charAt(0).toLowerCase() + name.slice(1);
}

function addTeeth(n) {
  game.teeth += n;
  ui.drawInventory();
  saveGame();
}

// ─── Combining and using ──────────────────────────────────────────────

async function combineItems(a, b) {
  const c = COMBOS.find(x => (x.a === a && x.b === b) || (x.a === b && x.b === a));
  ui.select(null);
  if (!c) { ui.log(`The ${ITEMS[a].name.toLowerCase()} and the ${ITEMS[b].name.toLowerCase()} don’t go together.`, 'note'); return; }
  if (c.makes) {
    // Whichever of the two isn't the "container" is used up; the other
    // becomes the new item.
    const keep = c.a.startsWith('kettle') || c.a === 'music_a' ? c.a : c.b;
    const used = keep === c.a ? c.b : c.a;
    takeItem(used);
    swapItem(keep, c.makes);
  }
  await ui.say('', c.text);
}

async function useItemOn(id, thing) {
  ui.select(null);
  const u = USES.find(x => x.item === id && x.on === thing.id);
  if (!u) {
    ui.log(REFUSALS[(id.length + thing.id.length) % REFUSALS.length], 'note');
    return;
  }
  if (u.run) return u.run();
  if (u.takes && u.gives) swapItem(u.takes, u.gives);
  else if (u.gives) giveItem(u.gives, { quiet: true });
  if (u.text) await ui.say('', u.text);
}

// ─── Searching ────────────────────────────────────────────────────────

async function searchSpot(s) {
  if (game.searched.has(s.id)) {
    await ui.say(s.name, 'You’ve already been through it. There’s nothing more here.');
    return;
  }
  game.searched.add(s.id);
  if (s.finds === 'oil' && hasItem('oil')) {
    // Already carrying a flask: pour this straight into the lantern.
    await ui.say(s.name, `${s.text} You already have a flask, so you pour this straight into the lantern.`);
    game.oil = 1; ui.setOil(1);
  } else if (s.finds) {
    await ui.say(s.name, s.text);
    giveItem(s.finds);
  } else {
    await ui.say(s.name, `${s.text} Nothing useful. Only, pressed into the dust where something should have been, a single human tooth.`);
    addTeeth(1);
    ui.log(`A tooth. (${game.teeth} so far.)`, 'note');
  }
  saveGame();
}

// Furniture added for a search spot stands flush against the nearest wall
// of its square (walls run along the grid's edges, not the traced lines),
// and its glint moves with it.
const PROP_DEPTH = { decal: 0, sconce: 8, console: 18, umbrellas: 14, woodbasket: 20, cupboard: 22, pottingBench: 22, cabinet: 18, musicStand: 10, pump: 24 };
function snapToWall(s) {
  const c = GRID.cellAtPx(s.x, s.y);
  if (!c || !c.walk) return;
  let best = null;
  c.edges.forEach((e, d) => {
    if (e !== 'wall') return;
    const dist = d % 2 ? Math.abs(s.x - (c.x + DIRS[d][0] * CELL / 2)) : Math.abs(s.y - (c.y + DIRS[d][1] * CELL / 2));
    if (!best || dist < best.dist) best = { d, dist };
  });
  if (!best) return;
  const inset = WALL_T / 2 + PROP_DEPTH[s.prop] / 2 + 1, lim = CELL / 2 - 12;
  s.wallDir = best.d;
  if (best.d % 2) { s.x = c.x + DIRS[best.d][0] * (CELL / 2 - inset); s.y = clamp(s.y, c.y - lim, c.y + lim); }
  else { s.y = c.y + DIRS[best.d][1] * (CELL / 2 - inset); s.x = clamp(s.x, c.x - lim, c.x + lim); }
}
const PUMP = { id: 'pump', x: 1012, y: 258, prop: 'pump' };
[...SEARCHES.filter(s => s.prop), PUMP, ...THINGS.filter(t => t.decal)].forEach(snapToWall);

// Search spots join THINGS, so they glint and can be faced and used like
// anything else. The pump isn't a search, but it's somewhere to use the
// kettle.
SEARCHES.forEach(s => THINGS.push({
  id: s.id, x: s.x, y: s.y, h: s.h, name: s.name, verb: 'Search',
  search: true, run: () => searchSpot(s), when: () => !game.searched.has(s.id),
}));
THINGS.push({ id: 'pump', x: PUMP.x, y: PUMP.y, h: 46, name: 'The pump', verb: 'Look at', text: 'An iron hand pump over a stone sink, its handle worn bright by years of use. Somebody could fill something here.' });

// ─── The scripts behind some uses ─────────────────────────────────────

async function lightHearth() {
  if (game.flags.hearthLit) { await ui.say('The fireplace', 'The fire is already burning.'); return; }
  await ui.say('The fireplace', 'You scrape a match and touch it to the old kindling. It catches at the third try, and the fire takes hold with a soft roar. Warm light spills across the parlour. For the first time since you came in, you can breathe.');
  game.flags.hearthLit = true;
  setHearth(true);
  saveGame();
}

async function heatKettle() {
  if (!game.flags.hearthLit) { await ui.say('The fireplace', 'The hearth is cold. You’d need to light it first.'); return; }
  swapItem('kettle_water', 'kettle_hot');
  await ui.say('The fireplace', 'You hang the kettle over the flames. Before long it is muttering, then whistling, thin and high, like someone calling from very far away.');
}

async function takeShard() {
  if (game.flags.shardTaken) { await ui.say('The cracked mirror', 'You’ve taken what the mirror will give.'); return; }
  game.flags.shardTaken = true;
  await ui.say('The cracked mirror', 'You work the knife point into the long crack. A sliver of glass comes free with a tiny, distinct sound, like someone gasping. For a moment every reflection in the room turns to look at you.');
  giveItem('shard', { quiet: true });
  addDread(1);
}

async function dustTheLock() {
  if (game.flags.glyphSeen) { await ui.say('The oven', 'The glyph on the lock is still there, picked out in white.'); return; }
  game.flags.glyphSeen = true;
  await ui.say('The oven', 'You blow a pinch of flour across the rusted lock. It settles into the lines of something carved there, too fine to see before: a small, coiled glyph. It is warm. It is waiting for someone to force the door.');
  saveGame();
}

// Combining from the inventory bar runs like any other scene: no walking
// meanwhile, and a pause after.
async function useThingCombine(a, b) {
  if (game.busy) return;
  game.busy = true;
  try { await combineItems(a, b); } finally { game.busy = false; lockInput(250); }
}

async function examineItem(id) {
  if (game.busy || !id) return;
  game.busy = true;
  try { await ui.say(ITEMS[id].name, ITEMS[id].text); } finally { game.busy = false; lockInput(250); }
}
