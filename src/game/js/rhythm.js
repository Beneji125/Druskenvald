// The cursed waltz: while The Harpsichord plays, the music room's floor
// belongs to the dance. You can only move in time: each step or turn has
// to land on a beat (one move a beat), or you stumble and your nerve
// frays. The weasels pouring from the walls move on the beat too: if one
// lands on you it bites; land on one, in time, and you stomp it flat (the
// dark way through). To end the dance, reach the harpsichord and play a
// different song.
//
// The beat comes from the track itself (measured: 108 beats a minute,
// first beat at 0.50 s), read from the audio as it plays, so the floor
// and the music never drift apart. With the sound off, the same beat is
// kept by the clock.

const WALTZ = { period: 60 / 108, offset: 0.50 };
const BEAT_WINDOW = { normal: 0.14, easy: 0.22 };   // seconds either side of a beat
const rhythm = { started: 0, lastBeat: -1, usedBeat: -99, stumbles: 0, weasels: [], stomped: 0, tickBeat: -1, biteBeat: -99 };

// Seconds into the waltz.
function waltzTime() {
  const t = sound.tracks && sound.tracks[MUSIC.waltz[0]];
  if (t && !t.el.paused && sound.on && t.el.currentTime > 0) return t.el.currentTime;
  return (performance.now() - rhythm.started) / 1000 + WALTZ.offset;
}

// The beat at a moment (performance.now() time; default now). Moves are
// judged by when the key was pressed, not when the game got to it.
function beatNow(at) {
  const lag = at ? Math.max(0, performance.now() - at) / 1000 : 0;
  const x = (waltzTime() - lag - WALTZ.offset) / WALTZ.period;
  const index = Math.round(x);
  return { index, off: Math.abs(x - index) * WALTZ.period, phase: x - Math.floor(x) };
}

function inRhythm() { return game.curse && GRID.at(game.cx, game.cy).room === 'music'; }

// Called by act() for every move or turn while the waltz plays. Returns
// true if the move may go ahead.
function onBeat(at) {
  const b = beatNow(at);
  const win = easyMode() ? BEAT_WINDOW.easy : BEAT_WINDOW.normal;
  if (b.off <= win && b.index !== rhythm.usedBeat) { rhythm.usedBeat = b.index; pulseBeat(true); return true; }
  rhythm.stumbles++;
  pulseBeat(false);
  sound.hit();
  ui.log(b.index === rhythm.usedBeat ? 'Too quick: one step to a beat.' : 'You stumble out of time.', 'scare');
  if (rhythm.stumbles % 2 === 0) addDread(1);
  return false;
}

function startRhythm() {
  rhythm.started = performance.now();
  rhythm.usedBeat = -99; rhythm.stumbles = 0; rhythm.tickBeat = -1;
  // Weasels come out of the walls at the room's edges.
  const cells = GRID.cells.filter(c => c.walk && !c.blocked && c.room === 'music' && c.edges.some(e => e === 'wall'));
  const n = easyMode() ? 3 : 5;
  rhythm.weasels = world.weasels.slice(0, n).map((s, i) => {
    const c = cells[(i * 7 + 3) % cells.length];
    s.visible = true; s.position.set(c.x, 0, c.y);
    return { s, c, alive: true };
  });
  $('beat').hidden = false;
}

function stopRhythm() {
  rhythm.weasels.forEach(w => { w.s.visible = false; });
  rhythm.weasels = [];
  $('beat').hidden = true;
}

// Every frame while the waltz plays: weasels move on each new beat, and
// glide between squares.
function tickRhythm(dt) {
  if (!game.curse) return;
  const b = beatNow();
  const ring = $('beat');
  ring.style.setProperty('--p', b.phase.toFixed(3));
  if (b.index !== rhythm.tickBeat && b.phase < 0.5) {
    rhythm.tickBeat = b.index;
    // The weasels move every other beat: the waltz's one and three.
    if (b.index % 2 === 0 && !game.busy && !ui.overlay && GRID.at(game.cx, game.cy).room === 'music') weaselsStep();
  }
  rhythm.weasels.forEach(w => {
    if (!w.alive) return;
    w.s.position.x += (w.c.x - w.s.position.x) * Math.min(1, dt * 14);
    w.s.position.z += (w.c.y - w.s.position.z) * Math.min(1, dt * 14);
  });
}

// Each weasel takes a step: towards you when you're near, otherwise along
// the room; any that lands on you bites and is thrown off.
function weaselsStep() {
  const me = GRID.at(game.cx, game.cy);
  rhythm.weasels.forEach((w, i) => {
    if (!w.alive) return;
    const near = Math.abs(w.c.cx - me.cx) + Math.abs(w.c.cy - me.cy) <= 3;
    const dirs = [0, 1, 2, 3].filter(d => {
      const e = w.c.edges[d];
      if (e !== 'open') return false;
      const n = GRID.at(w.c.cx + DIRS[d][0], w.c.cy + DIRS[d][1]);
      return n && n.walk && !n.blocked && n.room === 'music' && !rhythm.weasels.some(o => o !== w && o.alive && o.c === n);
    });
    if (!dirs.length) return;
    let d;
    const chase = easyMode() ? 3 : 2;
    if (near && (i + rhythm.tickBeat / 2) % chase === 0) {
      dirs.sort((a, b2) => dist(w.c, a, me) - dist(w.c, b2, me));
      d = dirs[0];
    } else d = dirs[(rhythm.tickBeat * 7 + i * 3) % dirs.length];
    const to = GRID.at(w.c.cx + DIRS[d][0], w.c.cy + DIRS[d][1]);
    // Right after a bite they keep their distance for a few beats.
    if (to === me && rhythm.tickBeat - rhythm.biteBeat < 6) return;
    w.c = to;
    if (w.c === me) {
      rhythm.biteBeat = rhythm.tickBeat;
      sound.hit();
      ui.flash('#5a1a10', 250);
      ui.log('A weasel sinks its teeth into your ankle.', 'scare');
      addDread(1);
      // thrown back where it came from, and a square further if it can
      let back = GRID.at(w.c.cx - DIRS[d][0], w.c.cy - DIRS[d][1]);
      const further = back && GRID.at(back.cx - DIRS[d][0], back.cy - DIRS[d][1]);
      if (further && further.walk && !further.blocked && further.room === 'music' && back.edges[(d + 2) % 4] === 'open') back = further;
      if (back) w.c = back;
    }
  });
}
function dist(c, d, me) { const x = c.cx + DIRS[d][0], y = c.cy + DIRS[d][1]; return Math.abs(x - me.cx) + Math.abs(y - me.cy); }

// You stepped onto a weasel's square, in time: it's crushed. The dark way.
function stompAt(c) {
  const w = rhythm.weasels.find(x => x.alive && x.c === c);
  if (!w) return;
  w.alive = false; w.s.visible = false;
  rhythm.stomped++;
  sound.hit();
  ui.log('Something crunches under your heel, and squeals, and is still.', 'scare');
  if (!game.flags.stompedWeasel) { game.flags.stompedWeasel = true; game.crooked = (game.crooked || 0) + 1; }
}

function pulseBeat(ok) {
  const ring = $('beat');
  ring.classList.remove('hit', 'miss'); void ring.offsetWidth;
  ring.classList.add(ok ? 'hit' : 'miss');
}

// ─── The dark way to end it: the hatchet ──────────────────────────────

async function smashHarpsichord() {
  if (game.flags.musicSolved) { await ui.say('The harpsichord', 'There’s nothing left in it to break.'); return; }
  const pick = await ui.say('The harpsichord', 'The hatchet is heavy in your hand. One blow, and the music would stop.', [{ id: 'yes', text: 'Bring it down', dark: true }, { id: 'no', text: 'Lower it' }]);
  if (pick !== 'yes') return;
  ui.flash('#5a0a08', 900);
  sound.thunder(1);
  await ui.say('', 'The hatchet bites into the lid, and the waltz turns into a scream: not the instrument’s, a man’s. You swing again, and again, until the strings are snapped and the keys are kindling and the scream has stopped. In the silence, a single black ivory key rolls out of the wreckage and comes to rest against your foot.');
  if (game.curse) endCurse(true);
  game.flags.musicSolved = 'killed';
  game.crooked = (game.crooked || 0) + 1;
  (game.tainted = game.tainted || []).push('key');
  giveMemento('key');
  await runFlashback('patrini', { corrupt: true });
}
