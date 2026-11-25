// Each encounter's own challenge, played in the arena between turns (see
// playRound in encounter.js). What you chose on your turn changes the
// next round through `st.flags`.

// ─── The Phantom Feast: courses ───────────────────────────────────────
// Dishes circle you with the cutlery. Take the right course as it passes
// (soup, fish, roast, sweets: Mrs Patrini's card in the kitchen says so)
// and nothing else; each right course calms the feast.

const COURSES = [
  { id: 'soup', name: 'the soup', line: 'You take the soup tureen out of the air, and set it down, and bow. The feast hums, approving.' },
  { id: 'fish', name: 'the fish', line: 'The fish, next, as it should be. A spoon taps twice against a glass, like applause.' },
  { id: 'roast', name: 'the roast', line: 'The roast lowers itself into your hands, steaming and heavy. Somewhere, a host is smiling.' },
  { id: 'sweets', name: 'the sweets', line: 'Last, the sweets: a cake that sighs as you take it. The whole feast settles, contented.' },
];

function feastRound(st) {
  const f = st.flags, course = f.course || 0, done = course >= COURSES.length;
  const card = game.items.includes('menu');
  const slow = f.grace ? 0.6 : 1, still = f.sit ? 2.5 : 0, onlyRight = !!f.praise;
  f.grace = f.sit = f.praise = false;
  return {
    title: done ? 'The feast is sated' : card ? `Take ${COURSES[course].name}` : 'Take the right course',
    text: done ? 'Only the cutlery still flies, half-hearted.' : card
      ? `Mrs Patrini’s card says ${COURSES[course].name} comes next. Take it as it passes; dodge everything else.`
      : 'Dishes circle you, and one of them is the right course. Take it, and nothing else.',
    hint: 'Move into the right dish to take it · WASD or the arrow keys · drag on a touch screen',
    duration: 9,
    spawn(api, t, dt) {
      if (t < still) return;
      if (!done) {
        this.nd = (this.nd ?? 0.3) - dt;
        if (this.nd <= 0) {
          this.nd = api.easy ? 1.0 : 0.8;
          const pick = onlyRight ? course : (api.rand() < 0.4 ? course : Math.floor(api.rand() * COURSES.length));
          // across the table, somewhere: you go and take it
          const e = api.edge(), tx = 40 + api.rand() * (api.w - 80), ty = 30 + api.rand() * (api.h - 60);
          const d = Math.hypot(tx - e.x, ty - e.y) || 1, sp = (38 + api.rand() * 22) * slow, right = pick === course;
          api.add({ x: e.x, y: e.y, vx: (tx - e.x) / d * sp, vy: (ty - e.y) / d * sp, r: 11, hurt: false, life: 9,
            draw: (ctx, s) => drawDish(ctx, s.x, s.y, COURSES[pick].id, card && right),
            take: (s, a) => {
              if (right) { f.course = course + 1; sound.pickup(); a.calm(1); st.roundLine = COURSES[course].line; a.end(); }
              else { a.hurt(1); a.say(pick < course ? 'You’ve had that one already. The feast is offended.' : 'Not yet! Every dish rattles with disgust.'); }
            } });
        }
      }
      this.nc = (this.nc ?? 0.8) - dt;
      if (this.nc <= 0) {
        this.nc = (api.easy ? 0.95 : 0.65) / slow;
        const e = api.edge(), v = api.aim(e, (105 + api.rand() * 45) * slow);
        api.add({ x: e.x, y: e.y, ...v, r: 5, draw: (ctx, s) => drawCutlery(ctx, s, Math.atan2(v.vy, v.vx)) });
      }
    },
  };
}

function drawDish(ctx, x, y, kind, glow) {
  if (glow) { const g = ctx.createRadialGradient(x, y, 4, x, y, 20); g.addColorStop(0, 'rgba(255,220,140,0.55)'); g.addColorStop(1, 'rgba(255,220,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 20, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#b8b2a0'; ctx.beginPath(); ctx.ellipse(x, y + 4, 12, 5, 0, 0, Math.PI * 2); ctx.fill();
  if (kind === 'soup') { ctx.fillStyle = '#d8d2c2'; ctx.beginPath(); ctx.ellipse(x, y, 9, 7, 0, 0, Math.PI); ctx.fill(); ctx.fillStyle = '#9a6a2a'; ctx.beginPath(); ctx.ellipse(x, y, 8, 2.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(230,230,230,0.5)'; ctx.beginPath(); ctx.moveTo(x - 3, y - 4); ctx.quadraticCurveTo(x - 5, y - 9, x - 2, y - 13); ctx.stroke(); }
  if (kind === 'fish') { ctx.fillStyle = '#c9874a'; ctx.beginPath(); ctx.ellipse(x - 1, y, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.moveTo(x + 7, y); ctx.lineTo(x + 13, y - 5); ctx.lineTo(x + 13, y + 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#1a1008'; ctx.beginPath(); ctx.arc(x - 6, y - 1, 1, 0, Math.PI * 2); ctx.fill(); }
  if (kind === 'roast') { ctx.fillStyle = '#7a3e1c'; ctx.beginPath(); ctx.ellipse(x, y - 1, 9, 6, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#e8dcc0'; ctx.fillRect(x + 6, y - 6, 6, 2.5); }
  if (kind === 'sweets') { ctx.fillStyle = '#e8d8c0'; ctx.fillRect(x - 7, y - 6, 14, 8); ctx.fillStyle = '#8a2a3a'; ctx.fillRect(x - 7, y - 7, 14, 2.5); ctx.beginPath(); ctx.arc(x, y - 9, 2, 0, Math.PI * 2); ctx.fill(); }
}
function drawCutlery(ctx, s, ang) {
  ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang);
  ctx.strokeStyle = '#c8c8cc'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(8, 0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(4, -2.5); ctx.lineTo(9, -2.5); ctx.moveTo(4, 2.5); ctx.lineTo(9, 2.5); ctx.stroke();
  ctx.restore();
}

// ─── Petunia: don't spill ─────────────────────────────────────────────
// You snatched her cup: give it back whole. Her grief comes in waves (a
// cold glimmer on one side, then the push); lean against them to keep the
// tea level. The less tea is left, the further the cup can tip. Not a drop
// spilled, and she softens.

function cupRound(st) {
  const f = st.flags;
  const soft = (f.apologised ? 0.75 : 1) * (f.named ? 0.65 : 1);
  return {
    title: 'Keep her cup level',
    text: 'Her grief shakes the room in waves. Keep her teacup level, and don’t spill a drop.',
    hint: 'Lean against each wave with ← → or A D · or drag left and right on a touch screen',
    duration: easyMode() ? 10 : 12,
    preview(ctx) { drawCup(ctx, 0, 1, []); },
    start(api) { Object.assign(this, { a: 0, v: 0, tea: 1, spills: 0, next: 1.4, warn: 0, side: 0, drops: [] }); },
    update(api, dt) {
      this.next -= dt;
      if (this.next <= 0 && !this.warn) { this.side = api.rand() < 0.5 ? -1 : 1; this.warn = api.easy ? 0.95 : 0.7; }
      if (this.warn) {
        this.warn -= dt;
        if (this.warn <= 0) { this.warn = 0; this.v += this.side * (0.75 + api.rand() * 0.35) * soft * (api.easy ? 0.55 : 1); this.next = (api.easy ? 2.2 : 1.6) + api.rand() * 0.8; sound.whisper(); }
      }
      this.v += (Math.sin(api.t * 6.1) * 0.06 + (api.rand() - 0.5) * 0.1) * soft * dt * (api.easy ? 2 : 4);
      let input = (api.held('arrowleft', 'a') ? -1 : 0) + (api.held('arrowright', 'd') ? 1 : 0);
      if (api.pointer.down && api.pointer.x !== null) input = clamp((api.pointer.x - api.w / 2) / 70, -1, 1);
      this.v += input * 3.2 * dt;
      this.v *= Math.pow(0.2, dt);
      this.a = clamp(this.a + this.v * dt, -1.1, 1.1);
      // does the tea reach the lower rim?
      if (55 * Math.abs(Math.sin(this.a)) - 70 * Math.cos(this.a) + 14 + 36 * this.tea > 0) {
        this.spills++; this.tea = Math.max(0, this.tea - 0.2);
        const s = Math.sign(this.a) || 1;
        for (let i = 0; i < 9; i++) this.drops.push({ x: 180 + s * 50, y: 120, vx: s * (30 + api.rand() * 50), vy: -20 - api.rand() * 40, life: 1 });
        this.a = s * 0.12; this.v = -s * 0.2;
        api.hurt(1);
        api.say(this.spills === 1 ? 'Tea slops over the rim. Her wail rises.' : 'More spills. The cold bites into your fingers.');
      }
      this.drops.forEach(d => { d.vy += 300 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.life -= dt; });
      this.drops = this.drops.filter(d => d.life > 0);
    },
    stop(api, how) {
      if (how === 'broke') return;
      if (!this.spills) { api.calm(1); st.roundLine = 'Not a drop spilled. She watches your careful hands, and something in her face loosens.'; }
      else st.roundLine = this.spills === 1 ? 'One spill. She looks at the stain on the saucer, and then at you.' : 'The saucer swims with spilt tea. She will not look at you.';
    },
    draw(ctx, api) {
      // cold creeping in from the side the next wave comes from
      ctx.fillStyle = '#080a10'; ctx.fillRect(0, 0, api.w, api.h);
      if (this.warn) {
        const x = this.side < 0 ? 0 : api.w, g = ctx.createLinearGradient(x, 0, x - this.side * 140, 0);
        g.addColorStop(0, 'rgba(170,200,255,0.55)'); g.addColorStop(1, 'rgba(170,200,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, api.w, api.h);
        ctx.fillStyle = 'rgba(210,230,255,0.9)'; ctx.font = '22px Georgia, serif'; ctx.textAlign = 'center';
        ctx.fillText(this.side < 0 ? '⟵' : '⟶', this.side < 0 ? 26 : api.w - 26, 112);
      }
      drawCup(ctx, this.a, this.tea, this.drops);
      ctx.fillStyle = '#e8d5a3'; ctx.font = '12px Georgia, serif'; ctx.textAlign = 'left';
      ctx.fillText(`Tea: ${'●'.repeat(Math.ceil(this.tea * 5))}${'○'.repeat(5 - Math.ceil(this.tea * 5))}`, 10, 18);
    },
  };
}

// The cup, tipped by `a`, with the tea level in the world (it doesn't tip).
function drawCup(ctx, a, tea, drops) {
  const bx = 180, by = 175;
  ctx.fillStyle = '#d8dce4'; ctx.beginPath(); ctx.ellipse(bx, by + 6, 90, 10, 0, 0, Math.PI * 2); ctx.fill();   // the saucer
  ctx.save(); ctx.translate(bx, by); ctx.rotate(a);
  const bowl = () => { ctx.beginPath(); ctx.moveTo(-55, -70); ctx.quadraticCurveTo(-52, -6, -32, 0); ctx.lineTo(32, 0); ctx.quadraticCurveTo(52, -6, 55, -70); ctx.closePath(); };
  // the tea, level whatever the cup does
  ctx.save(); bowl(); ctx.clip();
  ctx.rotate(-a);
  ctx.fillStyle = '#8a5a22'; ctx.fillRect(-200, -14 - 36 * tea, 400, 200);
  ctx.fillStyle = 'rgba(255,230,180,0.25)'; ctx.fillRect(-200, -14 - 36 * tea, 400, 2);
  ctx.restore();
  ctx.lineWidth = 5; ctx.strokeStyle = '#eef0f4'; bowl(); ctx.stroke();
  ctx.lineWidth = 2; ctx.strokeStyle = '#3f8a52'; ctx.beginPath(); ctx.moveTo(-54, -60); ctx.quadraticCurveTo(0, -56, 54, -60); ctx.stroke();   // her green band
  ctx.lineWidth = 6; ctx.strokeStyle = '#eef0f4'; ctx.beginPath(); ctx.arc(64, -40, 14, -Math.PI / 2, Math.PI / 2); ctx.stroke();   // the handle
  ctx.restore();
  ctx.fillStyle = '#8a5a22';
  drops.forEach(d => { ctx.globalAlpha = Math.max(0, d.life); ctx.beginPath(); ctx.arc(d.x, d.y, 2.2, 0, Math.PI * 2); ctx.fill(); });
  ctx.globalAlpha = 1;
}

// ─── The peacock: the gaze ────────────────────────────────────────────
// From above: its red eye sweeps the gallery like a lighthouse. Move from
// bust to bust (they block the beam) towards the bird; in the beam, stone
// creeps up your legs. Reach it with the mirror shard and raise it as the
// eye finds you: it meets its own gaze. With your eyes shut you can't see
// the beam (or the busts), but it can barely hold you; listen for its hum.

const GAZE = { eye: { x: 180, y: 24 }, busts: [[110, 104], [250, 104], [180, 142], [72, 166], [288, 166]], r: 13 };

function gazeRound(st) {
  const f = st.flags;
  const blind = !!f.eyes, slow = f.keziah ? 0.7 : 1, narrow = f.vermin ? 0.6 : 1;
  f.eyes = false;
  const shard = game.items.includes('shard');
  return {
    title: blind ? 'Eyes shut: listen' : 'Cross the gallery',
    text: blind ? 'Eyes shut. You can’t see its gaze, but you can hear it: a hum that rises as it nears, louder on its side.' : shard
      ? 'Get close, keeping the busts between you and its eye. Then raise the mirror as its gaze finds you.'
      : 'Get close to the bird, keeping the busts between you and its eye.',
    hint: (shard ? 'Space: raise the mirror · ' : '') + 'Move with WASD or the arrow keys · drag on a touch screen',
    action: shard ? 'Raise the mirror' : null,
    duration: 16,
    preview(ctx) { drawGallery(ctx, f.gx ?? 180, f.gy ?? 204, Math.PI / 2, 0.17 * narrow, false, 0); },
    start(api) { this.x = f.gx ?? 180; this.y = f.gy ?? 204; this.m = 0; this.touched = false; },
    beam(api) { return Math.PI / 2 + Math.sin(api.t * (api.easy ? 0.85 : 1.3) * slow + 0.6) * 1.1; },
    update(api, dt) {
      const th = this.beam(api), hw = 0.17 * narrow;
      const sp = 52 * (1 - 0.6 * this.m);
      let dx = (api.held('arrowright', 'd') ? 1 : 0) - (api.held('arrowleft', 'a') ? 1 : 0), dy = (api.held('arrowdown', 's') ? 1 : 0) - (api.held('arrowup', 'w') ? 1 : 0);
      if (api.pointer.down && api.pointer.x !== null) { const ddx = api.pointer.x - this.x, ddy = api.pointer.y - this.y, d = Math.hypot(ddx, ddy); if (d > 4) { dx = ddx / d; dy = ddy / d; } }
      const len = Math.hypot(dx, dy) || 1;
      this.x = clamp(this.x + dx / len * sp * dt, 14, api.w - 14); this.y = clamp(this.y + dy / len * sp * dt, 40, api.h - 10);
      GAZE.busts.forEach(([bx, by]) => { const ex = this.x - bx, ey = this.y - by, d = Math.hypot(ex, ey); if (d < GAZE.r + 6) { this.x = bx + ex / d * (GAZE.r + 6); this.y = by + ey / d * (GAZE.r + 6); } });
      // in the beam, and not behind a bust?
      const phi = Math.atan2(this.y - GAZE.eye.y, this.x - GAZE.eye.x);
      const hidden = GAZE.busts.some(([bx, by]) => segDist(GAZE.eye.x, GAZE.eye.y, this.x, this.y, bx, by) < GAZE.r);
      this.lit = Math.abs(phi - th) < hw && !hidden;
      this.m = clamp(this.m + (this.lit ? (blind ? 1.6 : 4.5) * (api.easy ? 0.6 : 1) : -0.3) * dt, 0, 1);
      if (this.m >= 1) { api.hurt(1); this.m = 0.35; this.y = Math.min(api.h - 10, this.y + 30); api.say('Stone creeps up to your knees. You tear free, and stumble back.'); }
      if (blind) sound.hum(clamp(1 - Math.abs(phi - th) / 0.7, 0, 1), -clamp((th - phi) / 0.7, -1, 1));
      // at the bird
      const near = Math.hypot(this.x - GAZE.eye.x, this.y - (GAZE.eye.y + 16)) < 40;
      if (near && shard && (api.press(' ', 'enter') || api.pointer.tapped)) {
        if (this.lit || Math.abs(phi - th) < hw * 2.2) {
          api.calm(st.def.calmMax);
          st.roundLine = 'You raise the mirror shard as its gaze falls on you. Its red eye meets its own reflection, and holds, and cannot look away. Grey creeps back over the white marble like frost, and the great tail stiffens.';
          api.end(); return;
        }
        api.say('Too soon: its eye is elsewhere. Wait for the gaze to find you.');
      }
      if (near && !shard && !this.touched) {
        this.touched = true; api.calm(1);
        api.say('You lay your hand on its cold neck. It shudders under your palm, and the sweep falters.');
        this.x = 180; this.y = 204;
      }
    },
    stop(api) { f.gx = this.x; f.gy = this.y; sound.hum(0); },
    draw(ctx, api) { drawGallery(ctx, this.x, this.y, this.beam(api), 0.17 * narrow, blind, this.m, api.invuln > 0 && Math.floor(api.invuln * 12) % 2); },
  };
}

function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay, l = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / l, 0, 1);
  return Math.hypot(ax + vx * t - px, ay + vy * t - py);
}

function drawGallery(ctx, px, py, th, hw, blind, m, flicker) {
  ctx.fillStyle = '#0c0b0a'; ctx.fillRect(0, 0, ARENA_W, ARENA_H);
  ctx.strokeStyle = 'rgba(200,190,170,0.25)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(180, 120, 172, 112, 0, 0, Math.PI * 2); ctx.stroke();
  if (!blind) {
    // the beam, cut short where the busts stand in it
    ctx.save();
    ctx.beginPath(); ctx.moveTo(GAZE.eye.x, GAZE.eye.y);
    ctx.arc(GAZE.eye.x, GAZE.eye.y, 420, th - hw, th + hw); ctx.closePath();
    ctx.fillStyle = 'rgba(200,30,30,0.35)'; ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#0c0b0a';
    GAZE.busts.forEach(([bx, by]) => {
      const a = Math.atan2(by - GAZE.eye.y, bx - GAZE.eye.x), d = Math.hypot(bx - GAZE.eye.x, by - GAZE.eye.y), s = Math.asin(Math.min(1, GAZE.r / d));
      ctx.beginPath(); ctx.moveTo(GAZE.eye.x + Math.cos(a - s) * d, GAZE.eye.y + Math.sin(a - s) * d);
      ctx.lineTo(GAZE.eye.x + Math.cos(a - s) * 420, GAZE.eye.y + Math.sin(a - s) * 420); ctx.lineTo(GAZE.eye.x + Math.cos(a + s) * 420, GAZE.eye.y + Math.sin(a + s) * 420);
      ctx.lineTo(GAZE.eye.x + Math.cos(a + s) * d, GAZE.eye.y + Math.sin(a + s) * d); ctx.closePath(); ctx.fill();
    });
    ctx.fillStyle = '#8a8478';
    GAZE.busts.forEach(([bx, by]) => { ctx.beginPath(); ctx.arc(bx, by, GAZE.r, 0, Math.PI * 2); ctx.fill(); });
  }
  // the peacock
  ctx.fillStyle = blind ? 'rgba(220,214,200,0.12)' : '#dcd6c8';
  ctx.beginPath(); ctx.arc(GAZE.eye.x, GAZE.eye.y - 6, 30, 0, Math.PI); ctx.fill();
  ctx.fillStyle = '#c4181a'; ctx.beginPath(); ctx.arc(GAZE.eye.x, GAZE.eye.y, 3.5, 0, Math.PI * 2); ctx.fill();
  if (blind) { const g = ctx.createRadialGradient(px, py, 10, px, py, 46); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.96)'); ctx.fillStyle = g; ctx.fillRect(0, 0, ARENA_W, ARENA_H); }
  drawSoul(ctx, px, py, flicker);
  if (m > 0) { ctx.fillStyle = 'rgba(160,160,150,0.85)'; ctx.fillRect(px - 10, py + 12, 20 * m, 3); }    // the stone creeping up
}

// ─── The boogleswarm: herding ─────────────────────────────────────────
// From above: the weasels flock, and your lantern's light pushes them
// away. Drive them into the crack in the wall; any that dart in out of
// the dark bite. Every third of the swarm herded home calms them a step.
// (The dark way: stamp on them instead.)

function herdRound(st) {
  const f = st.flags;
  const R = (f.lanternHigh ? 80 : 58) + (easyMode() ? 10 : 0), stamps = f.shout ? 3 : 0, lure = !!f.tooth, ring = !!f.salt, crushing = !!f.crushing;
  f.lanternHigh = f.shout = f.tooth = f.salt = false;
  const total = f.total ?? (f.total = easyMode() ? 18 : 24);
  if (f.left === undefined) f.left = total;
  const crack = { x: 334, y0: 68, y1: 152 };
  return {
    title: crushing ? 'Crush them' : 'Herd them into the crack',
    text: crushing ? 'Bring your heel down on them. All of them.' : 'Your light drives them back. Push the swarm into the crack in the wall.' + (lure ? ' The tooth you threw lies by the crack, and they want it.' : ''),
    hint: crushing ? 'Space or tap: stamp · move with WASD or the arrow keys' : (stamps ? 'Space: stamp and shout · ' : '') + 'Move with WASD or the arrow keys · drag on a touch screen',
    action: crushing || stamps ? 'Stamp' : null,
    duration: crushing ? 10 : 16,
    start(api) {
      this.x = 60; this.y = 110; this.stamps = stamps; this.splats = []; this.ws = [];
      for (let i = 0; i < f.left; i++) this.ws.push({ x: 120 + api.rand() * 160, y: 30 + api.rand() * 160, vx: 0, vy: 0, dash: 0, warn: 0 });
      this.herded = 0; this.killed = 0;
    },
    update(api, dt) {
      let dx = (api.held('arrowright', 'd') ? 1 : 0) - (api.held('arrowleft', 'a') ? 1 : 0), dy = (api.held('arrowdown', 's') ? 1 : 0) - (api.held('arrowup', 'w') ? 1 : 0);
      if (api.pointer.down && api.pointer.x !== null) { const ddx = api.pointer.x - this.x, ddy = api.pointer.y - this.y, d = Math.hypot(ddx, ddy); if (d > 4) { dx = ddx / d; dy = ddy / d; } }
      const len = Math.hypot(dx, dy) || 1;
      this.x = clamp(this.x + dx / len * 92 * dt, 8, api.w - 8); this.y = clamp(this.y + dy / len * 92 * dt, 8, api.h - 8);
      const stomp = api.press(' ') || (crushing && api.pointer.tapped);
      if (stomp && crushing) {
        sound.hit();
        this.ws = this.ws.filter(w => { if (Math.hypot(w.x - this.x, w.y - this.y) < 18) { this.splats.push({ x: w.x, y: w.y }); this.killed++; return false; } return true; });
      } else if (stomp && this.stamps > 0) {
        this.stamps--; sound.thunder(0.25);
        this.ws.forEach(w => { const ex = w.x - this.x, ey = w.y - this.y, d = Math.hypot(ex, ey) || 1; if (d < 80) { w.vx += ex / d * 260; w.vy += ey / d * 260; } });
      }
      // They flock (keeping together, moving together, not crowding), flee
      // your light, and edge back towards you when you're far off.
      for (const w of this.ws) {
        const ex = w.x - this.x, ey = w.y - this.y, d = Math.hypot(ex, ey) || 1;
        let ax = (api.rand() - 0.5) * 50, ay = (api.rand() - 0.5) * 50;
        let cx = 0, cy = 0, vx = 0, vy = 0, n = 0;
        for (const o of this.ws) {
          if (o === w) continue;
          const sx = w.x - o.x, sy = w.y - o.y, sd = Math.hypot(sx, sy);
          if (sd < 10 && sd > 0) { ax += sx / sd * 150; ay += sy / sd * 150; }
          if (sd < 55) { cx += o.x; cy += o.y; vx += o.vx; vy += o.vy; n++; }
        }
        if (n) { ax += (cx / n - w.x) * 0.9; ay += (cy / n - w.y) * 0.9; ax += (vx / n - w.vx) * 1.2; ay += (vy / n - w.vy) * 1.2; }
        if (!crushing && d < R) { ax += ex / d * 460 * (1 - d / R); ay += ey / d * 460 * (1 - d / R); }
        else if (d > R * 1.7) { ax -= ex / d * 16; ay -= ey / d * 16; }
        if (lure && api.t < 6) { const lx = crack.x - 14 - w.x, ly = (crack.y0 + crack.y1) / 2 - w.y, ld = Math.hypot(lx, ly) || 1; ax += lx / ld * 90; ay += ly / ld * 90; }
        // now and then one darts in at you out of the dark (its eyes flare first)
        if (!crushing && !w.dash && !w.warn && d > R * 0.9 && d < R * 2 && api.rand() < dt * (api.easy ? 0.005 : 0.009)) w.warn = 0.5;
        if (w.warn) { w.warn -= dt; if (w.warn <= 0) { w.warn = 0; w.dash = 0.6; } }
        if (w.dash) { w.dash = Math.max(0, w.dash - dt); w.vx = -ex / d * 160; w.vy = -ey / d * 160; if (d < 9) { if (ring) { w.vx = ex / d * 200; w.vy = ey / d * 200; w.dash = 0; } else if (api.hurt(1)) { w.dash = 0; w.vx = ex / d * 220; w.vy = ey / d * 220; } } }
        else { w.vx += ax * dt; w.vy += ay * dt; }
        w.vx *= Math.pow(0.4, dt); w.vy *= Math.pow(0.4, dt);
        const sp = Math.hypot(w.vx, w.vy), max = w.dash ? 160 : 85; if (sp > max) { w.vx *= max / sp; w.vy *= max / sp; }
        w.x += w.vx * dt; w.y += w.vy * dt;
        if (w.x < 4 || w.x > api.w - 4) { w.vx *= -0.6; w.x = clamp(w.x, 4, api.w - 4); }
        if (w.y < 4 || w.y > api.h - 4) { w.vy *= -0.6; w.y = clamp(w.y, 4, api.h - 4); }
        if (!crushing && w.x > crack.x && w.y > crack.y0 && w.y < crack.y1) { w.home = true; this.herded++; sound.scurry(0.6); }
      }
      this.ws = this.ws.filter(w => !w.home);
      if (!this.ws.length) api.end();
    },
    stop(api, how) {
      f.left = this.ws.length;
      if (crushing) { f.crushing = false; st.roundEnd = 'killed'; return; }
      if (how === 'broke') return;
      const steps = Math.floor((total - f.left) / (total / st.def.calmMax)) - st.calm;
      if (steps > 0) api.calm(steps);
      st.roundLine = !f.left ? 'The last of them squeezes into the crack, with a backward grin.' : this.herded ? `${this.herded} more of them slink back into the crack. ${f.left} left.` : 'They scatter, and regroup, and none of them goes home.';
    },
    draw(ctx, api) {
      ctx.fillStyle = '#0a0908'; ctx.fillRect(0, 0, api.w, api.h);
      // the crack
      ctx.strokeStyle = '#000'; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(api.w, crack.y0 - 10); ctx.lineTo(crack.x + 6, crack.y0 + 8); ctx.lineTo(crack.x + 2, 110); ctx.lineTo(crack.x + 8, crack.y1 - 6); ctx.lineTo(api.w, crack.y1 + 10); ctx.stroke();
      ctx.strokeStyle = 'rgba(200,180,140,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      if (lure && api.t < 6) { ctx.fillStyle = '#ece4cc'; ctx.beginPath(); ctx.arc(crack.x - 14, 110, 3, 0, Math.PI * 2); ctx.fill(); }
      // your light
      if (!crushing) { const g = ctx.createRadialGradient(this.x, this.y, 4, this.x, this.y, R); g.addColorStop(0, 'rgba(255,210,140,0.28)'); g.addColorStop(1, 'rgba(255,210,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, R, 0, Math.PI * 2); ctx.fill(); }
      if (ring) { ctx.strokeStyle = 'rgba(235,230,215,0.5)'; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.arc(this.x, this.y, 12, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = 'rgba(120,10,10,0.6)'; this.splats.forEach(s => { ctx.beginPath(); ctx.ellipse(s.x, s.y, 7, 4, 0.4, 0, Math.PI * 2); ctx.fill(); });
      this.ws.forEach(w => {
        const a = Math.atan2(w.vy, w.vx);
        ctx.save(); ctx.translate(w.x, w.y); ctx.rotate(a);
        ctx.fillStyle = '#6a5c52'; ctx.beginPath(); ctx.ellipse(0, 0, 6, 2.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#6a5c52'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-11, Math.sin(api.t * 9 + w.x) * 2); ctx.stroke();
        ctx.fillStyle = w.warn || w.dash ? '#ff2a2a' : 'rgba(255,60,60,0.6)'; ctx.beginPath(); ctx.arc(4.5, -1, w.warn ? 1.8 : 1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      });
      drawSoul(ctx, this.x, this.y, api.invuln > 0 && Math.floor(api.invuln * 12) % 2);
      ctx.fillStyle = '#e8d5a3'; ctx.font = '12px Georgia, serif'; ctx.textAlign = 'left';
      ctx.fillText(crushing ? `Crushed: ${this.killed}` : `Left: ${this.ws.length}${this.stamps ? `   Stamps: ${this.stamps}` : ''}`, 10, 18);
    },
  };
}

// ─── The oven fire: get out ───────────────────────────────────────────
// The trap fires: the kitchen burns, square by square, out from the oven.
// Get to the door. The pump fills a bucket that puts out the fire round
// you, once.

function ovenEscape(st) {
  const T = 30, C = 12, R = 7;
  // the fallen shelf, the kitchen table, the barrel, the cupboard
  const blocked = new Set(['4,1', '5,1', '6,1', '4,3', '5,3', '6,3', '4,4', '5,4', '6,4', '1,4', '2,6', '3,6']);
  const pump = [1, 1], door = [0, 6];
  return {
    title: 'Get out!',
    text: 'The kitchen is burning. Get to the door; the pump by the wall will fill a bucket.',
    hint: 'Step with WASD or the arrow keys · Space: throw the bucket · tap a square beside you',
    action: 'Throw the bucket',
    duration: 30,
    start(api) {
      this.p = [9, 3]; this.fire = new Map(); this.bucket = false; this.tick = 0; this.hold = 0; this.debris = []; this.nextDebris = 1.2;
      [[10, 1], [11, 1], [10, 0], [11, 0], [10, 2]].forEach(([x, y]) => this.fire.set(x + ',' + y, 1));
    },
    update(api, dt) {
      this.tick += dt;
      const every = api.easy ? 0.6 : 0.4;
      if (this.tick > every) {
        this.tick = 0;
        [...this.fire.keys()].forEach(k => {
          const [x, y] = k.split(',').map(Number);
          [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
            const nx = x + dx, ny = y + dy, nk = nx + ',' + ny;
            if (nx < 0 || ny < 0 || nx >= C || ny >= R || blocked.has(nk) || (nx === door[0] && ny === door[1]) || this.fire.has(nk)) return;
            if (api.rand() < 0.34) this.fire.set(nk, 1);
          });
        });
      }
      // burning debris from the ceiling: a square near you glows, then
      // catches
      this.nextDebris -= dt;
      if (this.nextDebris <= 0) {
        this.nextDebris = (api.easy ? 1.6 : 1.05) + api.rand() * 0.6;
        const x = clamp(this.p[0] + Math.round((api.rand() - 0.5) * 4), 0, C - 1), y = clamp(this.p[1] + Math.round((api.rand() - 0.5) * 4), 0, R - 1);
        if (!blocked.has(x + ',' + y) && !(x === door[0] && y === door[1])) this.debris.push({ x, y, t: api.easy ? 0.9 : 0.65 });
      }
      this.debris.forEach(d => { d.t -= dt; if (d.t <= 0) this.fire.set(d.x + ',' + d.y, 1); });
      this.debris = this.debris.filter(d => d.t > 0);
      // stepping, one square at a time (holding a key repeats)
      let dir = null;
      const K = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
      for (const k of api.pressed) if (K[k]) dir = K[k];
      if (!dir) { this.hold -= dt; if (this.hold <= 0) for (const k of api.keys) if (K[k]) { dir = K[k]; break; } }
      if (api.pointer.tapped && api.pointer.x !== null) { const tx = Math.floor(api.pointer.x / T), ty = Math.floor(api.pointer.y / T), ddx = tx - this.p[0], ddy = ty - this.p[1]; if (Math.abs(ddx) + Math.abs(ddy) >= 1) dir = Math.abs(ddx) > Math.abs(ddy) ? [Math.sign(ddx), 0] : [0, Math.sign(ddy)]; }
      if (dir) {
        this.hold = 0.17;
        const nx = this.p[0] + dir[0], ny = this.p[1] + dir[1];
        if (nx >= 0 && ny >= 0 && nx < C && ny < R && !blocked.has(nx + ',' + ny)) { this.p = [nx, ny]; sound.footstep('stone'); }
      }
      if (this.p[0] === pump[0] && this.p[1] === pump[1] && !this.bucket) { this.bucket = true; api.say('You work the pump handle and fill a bucket. Space to throw it.'); }
      if (this.bucket && (api.press(' ') || (api.pointer.tapped && Math.floor(api.pointer.x / T) === this.p[0] && Math.floor(api.pointer.y / T) === this.p[1]))) {
        this.bucket = false; sound.thunder(0.2);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.fire.delete((this.p[0] + dx) + ',' + (this.p[1] + dy));
        api.say('Hiss and steam: the fire round you dies back.');
      }
      if (this.fire.has(this.p.join(','))) api.hurt(1);
      if (this.p[0] === door[0] && this.p[1] === door[1]) api.end();
    },
    stop(api, how) { if (how === 'done' && !(this.p[0] === door[0] && this.p[1] === door[1])) { addDread(2); drawEncDread(); } },
    draw(ctx, api) {
      ctx.fillStyle = '#1a1612'; ctx.fillRect(0, 0, api.w, api.h);
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        const k = x + ',' + y;
        ctx.fillStyle = (x + y) % 2 ? '#24201c' : '#201c18'; ctx.fillRect(x * T, y * T, T, T);
        if (blocked.has(k)) { ctx.fillStyle = '#3a2a1c'; ctx.fillRect(x * T + 2, y * T + 2, T - 4, T - 4); }
        if (this.fire.has(k)) {
          const fl = 0.6 + 0.4 * Math.sin(api.t * 12 + x * 3 + y * 5);
          ctx.fillStyle = `rgba(255,${Math.round(90 + 60 * fl)},30,${0.55 + 0.3 * fl})`; ctx.fillRect(x * T, y * T, T, T);
        }
      }
      this.debris.forEach(d => { ctx.strokeStyle = `rgba(255,180,80,${(0.5 + 0.5 * Math.sin(api.t * 20)).toFixed(2)})`; ctx.lineWidth = 2; ctx.strokeRect(d.x * T + 3, d.y * T + 3, T - 6, T - 6); });
      ctx.fillStyle = '#4a6a8a'; ctx.fillRect(pump[0] * T + 8, pump[1] * T + 6, T - 16, T - 12);
      ctx.fillStyle = '#e8d5a3'; ctx.font = '10px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('pump', pump[0] * T + T / 2, pump[1] * T + T - 2);
      ctx.fillStyle = '#5a3a1c'; ctx.fillRect(door[0] * T + 2, door[1] * T + 2, T - 4, T - 4);
      ctx.fillStyle = '#e8d5a3'; ctx.fillText('door', door[0] * T + T / 2, door[1] * T + T / 2 + 3);
      ctx.fillStyle = '#3a1a10'; ctx.fillRect(10 * T, 0, T * 2, T * 2); ctx.fillStyle = '#ff8a40'; ctx.fillText('oven', 11 * T, T);
      drawSoul(ctx, this.p[0] * T + T / 2, this.p[1] * T + T / 2, api.invuln > 0 && Math.floor(api.invuln * 12) % 2);
      if (this.bucket) { ctx.fillStyle = '#8ab0d8'; ctx.fillRect(this.p[0] * T + T - 9, this.p[1] * T + 3, 6, 7); }
    },
  };
}
