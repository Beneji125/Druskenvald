// Placeholder art, all drawn in code on canvases: wallpapers and floors for
// each room, and ink-style figures and furniture. Every piece is made by one
// function below, so a real drawing can replace any of them later: load an
// image instead and return it from the same function (see the README).

const ART_INK = '#120c08';

function artCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function artTexture(canvas, { repeat = false, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}

function artGrime(ctx, w, h, rand, amount = 1) {
  for (let i = 0; i < 260 * amount; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${(rand() * 0.05).toFixed(3)})`;
    ctx.fillRect(rand() * w, rand() * h, 1 + rand() * 12, 1 + rand() * 12);
  }
  for (let i = 0; i < 18 * amount; i++) {
    ctx.fillStyle = `rgba(10,6,4,${(0.05 + rand() * 0.1).toFixed(3)})`;
    ctx.fillRect(rand() * w, rand() * h * 0.4, 1 + rand() * 2, 30 + rand() * h);
  }
}

// ─── Walls ────────────────────────────────────────────────────────────
// One square's worth of wall, floor (bottom of the canvas) to ceiling:
// wallpaper above a panelled dado, a skirting board and a cornice. Each
// room has its own paper; some get pictures hung on it.

const ROOM_WALLS = {
  parlor:       { paper: '#4a2b2b', motif: '#6b3d38', dado: '#2b1a12', pattern: 'damask' },
  foyer:        { paper: '#1f2b23', motif: '#2d3d31', dado: '#22170f', pattern: 'stripe', pictures: 'portrait' },
  gallery:      { paper: '#4b4741', motif: '#57524a', dado: '#2d241b', pattern: 'plain', pictures: 'landscape' },
  music:        { paper: '#1f2836', motif: '#2b3850', dado: '#1c1510', pattern: 'stripe' },
  dining:       { paper: '#4a3a1e', motif: '#5e4a26', dado: '#2a1c10', pattern: 'damask' },
  kitchen:      { paper: '#5b574c', motif: '#6a6658', dado: '#4a4a44', pattern: 'tile' },
  hallway:      { paper: '#2d2016', motif: '#3a2a1c', dado: '#1f150d', pattern: 'panel' },
  conservatory: { paper: '#2f3a35', motif: '#3c4a42', dado: '#2b2a24', pattern: 'plain' },
  porch:        { paper: '#3b352e', motif: '#2d2822', dado: '#2b241d', pattern: 'boards' },
};

function wallTexture(roomId, variant = 0) {
  const spec = ROOM_WALLS[roomId] || ROOM_WALLS.hallway;
  const [c, ctx] = artCanvas(128, 256);
  const rand = seededRandom(roomId.length * 97 + variant * 13);
  ctx.fillStyle = spec.paper;
  ctx.fillRect(0, 0, 128, 256);
  ctx.fillStyle = spec.motif;
  if (spec.pattern === 'damask') {
    for (let y = 18; y < 170; y += 38) for (let x = (y / 38) % 2 ? 0 : 32; x < 140; x += 64) {
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 14, 0, 0, Math.PI * 2);
      ctx.moveTo(x, y - 20); ctx.lineTo(x + 6, y); ctx.lineTo(x, y + 20); ctx.lineTo(x - 6, y); ctx.closePath();
      ctx.fill();
    }
  } else if (spec.pattern === 'stripe') {
    for (let x = 0; x < 128; x += 16) ctx.fillRect(x, 0, 6, 170);
  } else if (spec.pattern === 'tile') {
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    for (let y = 90; y < 170; y += 16) for (let x = 0; x < 128; x += 16) ctx.strokeRect(x + ((y / 16) % 2) * 8, y, 16, 16);
  } else if (spec.pattern === 'panel' || spec.pattern === 'boards') {
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    if (spec.pattern === 'panel') { ctx.strokeRect(14, 20, 100, 70); ctx.strokeRect(14, 100, 100, 66); }
    else for (let y = 0; y < 256; y += 14) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y + 2); ctx.stroke(); }
  }
  // Pictures on the wall.
  if (spec.pictures && rand() < 0.85) {
    const pw = 44 + rand() * 20, ph = spec.pictures === 'portrait' ? 60 + rand() * 14 : 38 + rand() * 10;
    const px = 64 - pw / 2 + (rand() - 0.5) * 16, py = 40 + rand() * 30;
    ctx.save();
    ctx.translate(px + pw / 2, py + ph / 2);
    ctx.rotate((rand() - 0.5) * 0.12);        // every frame hangs a little crooked
    ctx.translate(-pw / 2, -ph / 2);
    ctx.fillStyle = '#6b5428'; ctx.fillRect(-5, -5, pw + 10, ph + 10);
    ctx.fillStyle = '#3d2e14'; ctx.fillRect(-2, -2, pw + 4, ph + 4);
    if (spec.pictures === 'portrait') {
      ctx.fillStyle = '#1a1410'; ctx.fillRect(0, 0, pw, ph);
      ctx.fillStyle = '#8a7a60';
      ctx.beginPath(); ctx.ellipse(pw / 2, ph * 0.38, pw * 0.17, ph * 0.17, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.ellipse(pw / 2, ph, pw * 0.38, ph * 0.38, 0, Math.PI, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0a0806';                                      // wide, frightened eyes
      ctx.beginPath(); ctx.arc(pw / 2 - 4, ph * 0.36, 2.3, 0, Math.PI * 2); ctx.arc(pw / 2 + 4, ph * 0.36, 2.3, 0, Math.PI * 2); ctx.fill();
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, ph);
      sky.addColorStop(0, '#3a3c48'); sky.addColorStop(1, '#5a4f3a');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, pw, ph);
      ctx.fillStyle = '#2a2a22';
      ctx.beginPath(); ctx.moveTo(0, ph * 0.7);
      for (let x = 0; x <= pw; x += 6) ctx.lineTo(x, ph * (0.55 + rand() * 0.2));
      ctx.lineTo(pw, ph); ctx.lineTo(0, ph); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Dado, skirting, cornice.
  ctx.fillStyle = spec.dado; ctx.fillRect(0, 170, 128, 86);
  ctx.fillStyle = 'rgba(255,230,190,0.06)'; ctx.fillRect(0, 168, 128, 4);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
  ctx.strokeRect(10, 182, 108, 54);
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 242, 128, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(0, 0, 128, 8);
  artGrime(ctx, 128, 256, rand);
  // Damp creeping down from the ceiling.
  const damp = ctx.createLinearGradient(0, 0, 0, 90);
  damp.addColorStop(0, 'rgba(8,6,4,0.45)'); damp.addColorStop(1, 'rgba(8,6,4,0)');
  ctx.fillStyle = damp; ctx.fillRect(0, 0, 128, 90);
  return artTexture(c);
}

// The outside of the house, seen from the porch: grey weatherboards.
function exteriorTexture() {
  const [c, ctx] = artCanvas(128, 256);
  const rand = seededRandom(5);
  ctx.fillStyle = '#34302b'; ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 12) {
    ctx.fillStyle = `rgba(0,0,0,${0.25 + rand() * 0.2})`; ctx.fillRect(0, y, 128, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(0, y + 2, 128, 2);
  }
  artGrime(ctx, 128, 256, rand, 1.5);
  return artTexture(c);
}

// A window: frame and dark rain-streaked panes on a transparent canvas, plus
// a matching mask of just the panes, which lightning makes glow.
function windowTextures() {
  const [c, ctx] = artCanvas(128, 256);
  const [m, mctx] = artCanvas(128, 256);
  const rand = seededRandom(9);
  const x0 = 22, y0 = 52, w = 84, h = 120;
  ctx.fillStyle = '#2a1d12'; ctx.fillRect(x0 - 8, y0 - 8, w + 16, h + 16);
  ctx.fillStyle = '#0c1118'; ctx.fillRect(x0, y0, w, h);
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, 128, 256);
  mctx.fillStyle = '#fff'; mctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(160,180,210,0.25)'; ctx.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = x0 + rand() * w, y = y0 + rand() * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 6 + rand() * 14); ctx.stroke(); }
  ctx.fillStyle = '#2a1d12';
  ctx.fillRect(x0 + w / 2 - 3, y0, 6, h);
  for (let k = 1; k < 3; k++) ctx.fillRect(x0, y0 + h * k / 3 - 3, w, 6);
  mctx.fillStyle = '#000';
  mctx.fillRect(x0 + w / 2 - 3, y0, 6, h);
  for (let k = 1; k < 3; k++) mctx.fillRect(x0, y0 + h * k / 3 - 3, w, 6);
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x0 - 12, y0 + h + 6, w + 24, 8);   // sill
  return { map: artTexture(c), glow: artTexture(m, { srgb: false }) };
}

// ─── Floors and ceilings ──────────────────────────────────────────────
// Each tiles every two squares, in floor-plan coordinates, so it runs on
// unbroken from square to square.

function floorTexture(roomId) {
  const [c, ctx] = artCanvas(256, 256);
  const rand = seededRandom(roomId.length * 31 + 7);
  const tiles = (a, b, n = 8) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x * s, y * s, s, s);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    for (let i = 0; i < 14; i++) { ctx.beginPath(); let x = rand() * 256, y = rand() * 256; ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rand() - 0.5) * 40; y += (rand() - 0.5) * 40; ctx.lineTo(x, y); } ctx.stroke(); }
  };
  const boards = (base, w = 32) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += w) {
      ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.25).toFixed(2)})`; ctx.fillRect(x, 0, w, 256);
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, 0, 2, 256);
      const joint = rand() * 256; ctx.fillRect(x, joint, w, 2);
      for (let k = 0; k < 6; k++) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + 4 + rand() * (w - 8), rand() * 256, 1, 20 + rand() * 60); }
    }
  };
  if (roomId === 'foyer') tiles('#4b4440', '#2a2522');
  else if (roomId === 'conservatory') tiles('#55534a', '#3a3a33');
  else if (roomId === 'kitchen') {
    ctx.fillStyle = '#3f3a33'; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3;
    for (let y = 0; y < 256; y += 42) for (let x = -20; x < 256; x += 60) ctx.strokeRect(x + ((y / 42) % 2) * 30 + rand() * 6, y + rand() * 4, 56, 40);
    for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(${170 + rand() * 60},${150 + rand() * 50},120,0.5)`; ctx.fillRect(rand() * 256, rand() * 256, 3 + rand() * 6, 2 + rand() * 4); } // broken crockery
  }
  else if (roomId === 'porch') boards('#2b231c', 24);
  else if (roomId === 'music') boards('#2c2018');
  else if (roomId === 'gallery') tiles('#4a463f', '#433f39', 4);
  else boards(roomId === 'dining' ? '#3a2818' : '#33241a');
  artGrime(ctx, 256, 256, rand, 1.2);
  return artTexture(c, { repeat: true });
}

// The blackened ring of the music room's dance floor, laid over its boards.
function danceFloorTexture() {
  const [c, ctx] = artCanvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
  g.addColorStop(0, 'rgba(8,5,3,0.35)'); g.addColorStop(0.75, 'rgba(8,5,3,0.75)'); g.addColorStop(1, 'rgba(8,5,3,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(128, 128, 128, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,0.25)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(128, 128, 92, 0, Math.PI * 2); ctx.stroke();
  return artTexture(c);
}

function ceilingTexture(kind) {
  const [c, ctx] = artCanvas(256, 256);
  const rand = seededRandom(kind.length * 11);
  if (kind === 'glass') {
    ctx.fillStyle = '#0a1016'; ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = '#1e1a16';
    for (let x = 0; x < 256; x += 64) ctx.fillRect(x, 0, 6, 256);
    for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, 6);
    return artTexture(c, { repeat: true });
  }
  ctx.fillStyle = kind === 'porch' ? '#1d1712' : '#25201b'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#140f0b';
  for (let x = 0; x < 256; x += 128) ctx.fillRect(x, 0, 22, 256);
  artGrime(ctx, 256, 256, rand, 2);
  return artTexture(c, { repeat: true });
}

// ─── Upright figures and furniture (sprites) ──────────────────────────
// Drawn on a canvas whose bottom edge is the floor. Each entry gives the
// canvas size and its size in the world.

function inkSprite(w, h, draw) {
  const [c, ctx] = artCanvas(w, h);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.strokeStyle = ART_INK; ctx.lineWidth = 3;
  draw(ctx, w, h);
  return artTexture(c);
}

const SPRITES = {
  chair: { size: [26, 48], draw: () => inkSprite(64, 128, (ctx) => {
    ctx.fillStyle = '#4a2a1c';
    ctx.beginPath(); ctx.moveTo(14, 128); ctx.lineTo(16, 70); ctx.lineTo(12, 12); ctx.quadraticCurveTo(32, 0, 52, 12); ctx.lineTo(48, 70); ctx.lineTo(50, 128);
    ctx.lineTo(44, 128); ctx.lineTo(42, 84); ctx.lineTo(22, 84); ctx.lineTo(20, 128); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6b2e2a'; ctx.fillRect(18, 20, 28, 46); ctx.strokeRect(18, 20, 28, 46);
    ctx.fillStyle = '#5a2620'; ctx.fillRect(10, 70, 44, 14); ctx.strokeRect(10, 70, 44, 14);
  }) },
  sofa: { size: [70, 40], draw: () => inkSprite(192, 110, (ctx) => {
    ctx.fillStyle = '#4b3a5c';
    ctx.beginPath(); ctx.roundRect(14, 14, 164, 60, 18); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(4, 46, 184, 46, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a2c48'; ctx.fillRect(10, 90, 172, 10); ctx.strokeRect(10, 90, 172, 10);
    ctx.fillStyle = ART_INK; ctx.fillRect(16, 100, 8, 10); ctx.fillRect(168, 100, 8, 10);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.moveTo(96, 50); ctx.lineTo(96, 88); ctx.stroke();
  }) },
  chandelier: { size: [60, 40], lift: 72, unlit: true, draw: () => inkSprite(160, 140, (ctx) => {
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(80, 60); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(80, 84, 64, 14, 0.06, 0, Math.PI * 2); ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 24, y = 82 - Math.sin(i / 5 * Math.PI) * 6;
      ctx.beginPath(); ctx.moveTo(80, 60); ctx.lineTo(x, y); ctx.stroke();
      ctx.fillStyle = '#d8cfb8'; ctx.fillRect(x - 3, y - 18, 6, 16);
      const g = ctx.createRadialGradient(x, y - 24, 0, x, y - 24, 12);
      g.addColorStop(0, 'rgba(235,225,255,1)'); g.addColorStop(1, 'rgba(200,180,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 24, 12, 0, Math.PI * 2); ctx.fill();
    }
  }) },
  tree: { size: [150, 150], draw: () => inkSprite(256, 256, (ctx) => {
    const rand = seededRandom(3);
    ctx.fillStyle = '#2a1c12'; ctx.beginPath(); ctx.moveTo(112, 256); ctx.quadraticCurveTo(120, 170, 104, 120); ctx.lineTo(146, 120); ctx.quadraticCurveTo(134, 180, 146, 256); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, r = rand() * 92;
      ctx.fillStyle = `rgb(${30 + rand() * 30},${80 + rand() * 60},${40 + rand() * 30})`;
      ctx.beginPath(); ctx.ellipse(128 + Math.cos(a) * r, 96 + Math.sin(a) * r * 0.75, 16, 9, a, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 22; i++) {
      const a = rand() * Math.PI * 2, r = 20 + rand() * 70;
      ctx.fillStyle = '#d9a48a'; ctx.beginPath(); ctx.arc(128 + Math.cos(a) * r, 100 + Math.sin(a) * r * 0.7, 6, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke();
    }
  }) },
  shrub: { size: [60, 60], draw: () => inkSprite(128, 128, (ctx) => {
    const rand = seededRandom(8);
    ctx.strokeStyle = '#3a3028'; ctx.lineWidth = 2;
    const branch = (x, y, a, l, d) => { if (d > 4) return; const x2 = x + Math.cos(a) * l, y2 = y + Math.sin(a) * l; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x2, y2); ctx.stroke(); branch(x2, y2, a - 0.4 - rand() * 0.3, l * 0.72, d + 1); branch(x2, y2, a + 0.4 + rand() * 0.3, l * 0.72, d + 1); };
    branch(64, 128, -Math.PI / 2, 38, 0);
  }) },
  bust: { size: [22, 28], lift: 46, draw: () => inkSprite(96, 122, (ctx) => {
    // A stern marble head and shoulders: blank eyes, a heavy brow, shading
    // down one side.
    const g = ctx.createLinearGradient(10, 0, 86, 0);
    g.addColorStop(0, '#d6d0c2'); g.addColorStop(1, '#8a8476');
    ctx.fillStyle = g; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(8, 122); ctx.quadraticCurveTo(10, 84, 48, 80); ctx.quadraticCurveTo(86, 84, 88, 122); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(38, 82); ctx.lineTo(40, 64); ctx.lineTo(56, 64); ctx.lineTo(58, 82); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(30, 40); ctx.quadraticCurveTo(30, 6, 50, 6); ctx.quadraticCurveTo(68, 6, 66, 40); ctx.quadraticCurveTo(64, 66, 48, 68); ctx.quadraticCurveTo(32, 66, 30, 40); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(40,36,30,0.55)';
    ctx.fillRect(34, 30, 28, 4);                                  // the brow's shadow
    ctx.beginPath(); ctx.moveTo(48, 34); ctx.lineTo(45, 50); ctx.lineTo(50, 50); ctx.closePath(); ctx.fill();   // nose
    ctx.fillStyle = '#121212'; ctx.fillRect(40, 94, 16, 8);       // a worn name plate
  }) },
  peacock: { size: [110, 110], draw: () => inkSprite(256, 256, (ctx) => {
    ctx.fillStyle = '#cfc8b8';
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (1.05 + i * 0.07);
      ctx.beginPath(); ctx.moveTo(128, 170); ctx.lineTo(128 + Math.cos(a) * 118, 170 + Math.sin(a) * 118); ctx.lineTo(128 + Math.cos(a + 0.06) * 112, 170 + Math.sin(a + 0.06) * 112); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9b9584'; ctx.beginPath(); ctx.arc(128 + Math.cos(a + 0.03) * 98, 170 + Math.sin(a + 0.03) * 98, 7, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#cfc8b8';
    }
    ctx.fillStyle = '#dcd6c8';
    ctx.beginPath(); ctx.ellipse(128, 200, 30, 44, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(118, 168); ctx.quadraticCurveTo(108, 120, 126, 100); ctx.quadraticCurveTo(140, 96, 138, 110); ctx.quadraticCurveTo(130, 130, 138, 168); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a3201a'; ctx.beginPath(); ctx.arc(131, 106, 3.2, 0, Math.PI * 2); ctx.fill();  // the bloodstone eye
    ctx.fillStyle = '#6a6458'; ctx.fillRect(96, 236, 64, 20); ctx.strokeRect(96, 236, 64, 20);
  }) },
  harp: { size: [36, 64], draw: () => inkSprite(96, 170, (ctx) => {
    ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(20, 165); ctx.lineTo(20, 20); ctx.quadraticCurveTo(70, 0, 80, 60); ctx.lineTo(70, 165); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(220,200,160,0.6)';
    for (let x = 26; x < 70; x += 6) { ctx.beginPath(); ctx.moveTo(x, 30 + (x - 26) * 0.4); ctx.lineTo(x, 160); ctx.stroke(); }
  }) },
  barrel: { size: [34, 40], draw: () => inkSprite(96, 112, (ctx) => {
    ctx.fillStyle = '#4a3220'; ctx.beginPath(); ctx.ellipse(48, 56, 40, 54, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 4; [20, 56, 92].forEach(y => { ctx.beginPath(); ctx.moveTo(10, y); ctx.lineTo(86, y); ctx.stroke(); });
  }) },
  // ─── People and things that move ───
  petunia: { size: [46, 74], ghost: true, draw: () => inkSprite(128, 206, (ctx) => {
    ctx.fillStyle = 'rgba(16,14,20,0.92)';
    ctx.beginPath(); ctx.moveTo(40, 64); ctx.quadraticCurveTo(26, 120, 18, 206); ctx.lineTo(110, 206); ctx.quadraticCurveTo(100, 120, 88, 64); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d9dde6'; ctx.beginPath(); ctx.ellipse(64, 40, 17, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a4e5c'; ctx.beginPath(); ctx.ellipse(57, 40, 4, 2.2, 0, 0, Math.PI * 2); ctx.ellipse(71, 40, 4, 2.2, 0, 0, Math.PI * 2); ctx.fill();   // downcast eyes
    ctx.strokeStyle = '#8a8e9a'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(59, 53); ctx.quadraticCurveTo(64, 51, 69, 53); ctx.stroke();
    ctx.fillStyle = '#2a2a33'; ctx.beginPath(); ctx.ellipse(64, 26, 20, 14, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f8a52'; ctx.fillRect(48, 60, 32, 6);                       // the green ribbon
    ctx.fillStyle = '#e8ecf2'; ctx.beginPath(); ctx.ellipse(64, 112, 12, 7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(54, 104, 20, 10);  // the teacup
    ctx.fillStyle = '#c8ccd6'; ctx.beginPath(); ctx.arc(50, 116, 7, 0, Math.PI * 2); ctx.arc(78, 116, 7, 0, Math.PI * 2); ctx.fill();
  }) },
  crookedMan: { size: [58, 116], draw: () => {
    const [c, ctx] = artCanvas(128, 256);
    ctx.shadowColor = 'rgba(170,195,255,0.95)'; ctx.shadowBlur = 10; ctx.fillStyle = '#050304';
    ctx.beginPath(); ctx.ellipse(70, 34, 13, 17, 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(52, 22); ctx.lineTo(90, 14); ctx.lineTo(84, 0); ctx.lineTo(62, 6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(56, 48); ctx.quadraticCurveTo(40, 120, 46, 200); ctx.lineTo(34, 252); ctx.lineTo(58, 252); ctx.lineTo(64, 206); ctx.lineTo(74, 252); ctx.lineTo(96, 252); ctx.lineTo(84, 196); ctx.quadraticCurveTo(94, 120, 82, 50); ctx.closePath(); ctx.fill();
    ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = '#050304';
    ctx.beginPath(); ctx.moveTo(80, 60); ctx.lineTo(108, 118); ctx.lineTo(112, 150); ctx.stroke();
    ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(112, 150); ctx.lineTo(96, 40); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(96, 40); ctx.lineTo(122, 30); ctx.lineTo(120, 64); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'rgba(255,240,200,1)'; ctx.fillStyle = '#f2e6c4';
    ctx.beginPath(); ctx.arc(74, 34, 2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(81, 31, 2, 0, Math.PI * 2); ctx.fill();
    return artTexture(c);
  } },
  weasel: { size: [30, 16], draw: () => inkSprite(128, 64, (ctx) => {
    ctx.fillStyle = '#3a2618';
    ctx.beginPath(); ctx.moveTo(6, 50); ctx.quadraticCurveTo(30, 30, 70, 34); ctx.quadraticCurveTo(100, 26, 118, 38); ctx.lineTo(122, 44); ctx.quadraticCurveTo(100, 50, 76, 52); ctx.quadraticCurveTo(40, 58, 6, 50); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillRect(40, 50, 4, 12); ctx.fillRect(84, 50, 4, 12);
    ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(108, 36, 2.5, 0, Math.PI * 2); ctx.fill();
  }) },
  // Filthy Jasper: a grey, greasy weasel sitting up, with a man's pink
  // hands, clutching a tooth.
  jasper: { size: [32, 40], draw: () => inkSprite(96, 120, (ctx) => {
    ctx.fillStyle = '#5a5248';
    ctx.beginPath(); ctx.moveTo(30, 118); ctx.quadraticCurveTo(14, 70, 38, 44); ctx.quadraticCurveTo(48, 36, 58, 44); ctx.quadraticCurveTo(80, 70, 66, 118); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(66, 112); ctx.quadraticCurveTo(92, 108, 88, 84); ctx.lineWidth = 6; ctx.stroke(); ctx.lineWidth = 3;   // tail
    ctx.beginPath(); ctx.ellipse(48, 30, 16, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(36, 22); ctx.lineTo(34, 10); ctx.lineTo(42, 18); ctx.moveTo(60, 22); ctx.lineTo(62, 10); ctx.lineTo(54, 18); ctx.fill(); ctx.stroke();   // ears
    ctx.beginPath(); ctx.moveTo(48, 36); ctx.lineTo(48, 46); ctx.stroke();   // snout
    ctx.fillStyle = '#f0c060'; ctx.beginPath(); ctx.arc(41, 28, 2.6, 0, Math.PI * 2); ctx.arc(55, 28, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8a8a0';                                                  // the hands
    ctx.beginPath(); ctx.ellipse(38, 70, 7, 5, 0.4, 0, Math.PI * 2); ctx.ellipse(58, 70, 7, 5, -0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2; [34, 38, 42].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x - 1, 80); ctx.stroke(); }); [54, 58, 62].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 72); ctx.lineTo(x + 1, 80); ctx.stroke(); });
    ctx.fillStyle = '#ece4cc'; ctx.beginPath(); ctx.moveTo(44, 62); ctx.lineTo(52, 62); ctx.lineTo(50, 72); ctx.lineTo(46, 72); ctx.closePath(); ctx.fill(); ctx.stroke();   // the tooth
  }) },
  // His nest: rags and paper, and teeth packed in like seeds.
  nest: { size: [46, 16], draw: () => inkSprite(160, 56, (ctx) => {
    const rand = seededRandom(13);
    ctx.fillStyle = '#3a3026'; ctx.beginPath(); ctx.ellipse(80, 40, 74, 16, 0, Math.PI, Math.PI * 2); ctx.lineTo(154, 52); ctx.lineTo(6, 52); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 26; i++) { ctx.fillStyle = ['#5a4a3a', '#7a6a50', '#4a3a40'][i % 3]; ctx.fillRect(10 + rand() * 140, 26 + rand() * 22, 8 + rand() * 14, 3 + rand() * 4); }
    ctx.fillStyle = '#ece4cc'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(16 + rand() * 128, 30 + rand() * 20, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }) },
  patrini: { size: [44, 90], ghost: true, draw: () => {
    const [c, ctx] = artCanvas(128, 256);
    ctx.shadowColor = 'rgba(120,180,255,1)'; ctx.shadowBlur = 16; ctx.fillStyle = 'rgba(110,160,235,0.55)';
    ctx.beginPath(); ctx.ellipse(64, 46, 18, 22, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(40, 72); ctx.quadraticCurveTo(30, 160, 44, 256); ctx.lineTo(84, 256); ctx.quadraticCurveTo(98, 160, 88, 72); ctx.closePath(); ctx.fill();
    return artTexture(c);
  } },
};

const spriteTextureCache = {};
function spriteTexture(kind) {
  if (!spriteTextureCache[kind]) spriteTextureCache[kind] = SPRITES[kind].draw();
  return spriteTextureCache[kind];
}

// ─── Faces of furniture (for boxes) ───────────────────────────────────

function woodTexture(base = '#3b2616') {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(base.length + base.charCodeAt(2));
  ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.18).toFixed(2)})`; ctx.fillRect(0, rand() * 128, 128, 1 + rand() * 2); }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, 126, 126);
  return artTexture(c);
}

function brickTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(12);
  ctx.fillStyle = '#1c120c'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 12) for (let x = -12; x < 128; x += 26) {
    ctx.fillStyle = `rgb(${90 + rand() * 40},${40 + rand() * 20},${30 + rand() * 15})`;
    ctx.fillRect(x + ((y / 12) % 2) * 13, y + 1, 24, 10);
  }
  return artTexture(c);
}

// A door leaf: dark panelled wood, scuffed, with a tarnished brass knob.
// The same picture on both faces.
function doorTexture() {
  const [c, ctx] = artCanvas(128, 256);
  const rand = seededRandom(17);
  ctx.fillStyle = '#2b1a0e'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.2).toFixed(2)})`; ctx.fillRect(rand() * 128, 0, 1 + rand() * 2, 256); }
  const panel = (x, y, w, h) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,220,170,0.06)'; ctx.fillRect(x + 3, y + 3, w - 6, h - 6);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.strokeRect(x + 3, y + 3, w - 6, h - 6);
  };
  panel(14, 14, 44, 96); panel(70, 14, 44, 96);
  panel(14, 128, 44, 112); panel(70, 128, 44, 112);
  ctx.fillStyle = '#8a6a2a'; ctx.beginPath(); ctx.arc(112, 122, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#c9a050'; ctx.beginPath(); ctx.arc(110, 120, 2.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#111'; ctx.fillRect(110, 132, 4, 8);                 // keyhole
  artGrime(ctx, 128, 256, rand, 0.8);
  return artTexture(c);
}

// Words scratched through the hallway wallpaper by a child's hand.
function scratchesDecal() {
  const [c, ctx] = artCanvas(256, 150);
  ctx.strokeStyle = 'rgba(232,216,180,0.6)'; ctx.lineWidth = 1.1; ctx.lineCap = 'round';
  ctx.font = '22px Georgia, serif'; ctx.textAlign = 'center';
  const lines = ['SHE SLEEPS IN THE', 'ROUND ROOM', 'DONT LOOK IN HER EYE', 'LET HER LOOK IN HER OWN'];
  const rand = seededRandom(66);
  lines.forEach((l, i) => {
    ctx.save(); ctx.translate(128, 30 + i * 34); ctx.rotate((rand() - 0.5) * 0.1);
    ctx.strokeText(l, 0, 0); ctx.restore();
  });
  return artTexture(c);
}

// A glint: a soft four-pointed star, marking something you can look at
// or use.
function glintTexture() {
  const [c, ctx] = artCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 20);
  g.addColorStop(0, 'rgba(255,244,214,1)'); g.addColorStop(0.35, 'rgba(255,214,150,0.45)'); g.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,238,200,0.95)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const r = i % 2 ? 2.5 : 30, a = i * Math.PI / 4; ctx.lineTo(32 + Math.sin(a) * r, 32 - Math.cos(a) * r); }
  ctx.closePath(); ctx.fill();
  return artTexture(c);
}

// The oven's front: brick, with a black iron door and its heavy lock.
function ovenFrontTexture() {
  const [c, ctx] = artCanvas(128, 128);
  ctx.drawImage(brickTexture().image, 0, 0);
  ctx.fillStyle = '#121212'; ctx.beginPath(); ctx.roundRect(30, 40, 68, 54, 8); ctx.fill();
  ctx.strokeStyle = '#2c2c2c'; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#6a4a22'; ctx.fillRect(60, 60, 10, 14); ctx.strokeStyle = '#3a2a12'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(65, 60, 5, Math.PI, Math.PI * 2); ctx.stroke();
  return artTexture(c);
}

// The fireplace: a stone surround around a black hearth. The hearth glows
// through `glow`, brighter while the fire is lit.
function fireplaceTextures() {
  const [c, ctx] = artCanvas(128, 128);
  const [m, mctx] = artCanvas(128, 128);
  ctx.fillStyle = '#6a6256'; ctx.fillRect(0, 10, 128, 118);
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; for (let y = 10; y < 128; y += 16) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(128, y); ctx.stroke(); }
  ctx.fillStyle = '#4a3a2a'; ctx.fillRect(0, 0, 128, 14);
  ctx.fillStyle = '#080605'; ctx.beginPath(); ctx.moveTo(28, 128); ctx.lineTo(28, 60); ctx.quadraticCurveTo(64, 36, 100, 60); ctx.lineTo(100, 128); ctx.closePath(); ctx.fill();
  mctx.fillStyle = '#000'; mctx.fillRect(0, 0, 128, 128);
  const g = mctx.createRadialGradient(64, 118, 2, 64, 110, 44);
  g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#a64'); g.addColorStop(1, '#000');
  mctx.fillStyle = g; mctx.fillRect(28, 60, 72, 68);
  return { map: artTexture(c), glow: artTexture(m) };
}

// The long dining table's cloth, laid for the feast.
function feastTexture() {
  const [c, ctx] = artCanvas(128, 256);
  const rand = seededRandom(21);
  ctx.fillStyle = '#d8d2c2'; ctx.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 8; i++) { const x = i % 2 ? 98 : 30, y = 30 + Math.floor(i / 2) * 60; ctx.fillStyle = '#f2efe6'; ctx.beginPath(); ctx.arc(x, y, 14, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#999'; ctx.stroke(); }
  ctx.fillStyle = '#a0a4a8'; ctx.beginPath(); ctx.ellipse(64, 128, 26, 40, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#8a4a1c'; ctx.beginPath(); ctx.ellipse(64, 128, 18, 30, 0, 0, Math.PI * 2); ctx.fill();          // the roast
  for (let i = 0; i < 14; i++) { ctx.fillStyle = ['#8a1a1a', '#3a6a2a', '#c9a040', '#6a2a5a'][i % 4]; ctx.beginPath(); ctx.arc(20 + rand() * 88, 10 + rand() * 236, 4 + rand() * 4, 0, Math.PI * 2); ctx.fill(); }
  return artTexture(c);
}

// Harpsichord: lacquered case with yellowed keys along its front.
function harpsichordFrontTexture() {
  const [c, ctx] = artCanvas(256, 64);
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#d8c89a'; ctx.fillRect(10, 8, 236, 26);
  ctx.fillStyle = '#111';
  for (let x = 10; x < 246; x += 11) { ctx.fillRect(x, 8, 1, 26); if ((x / 11) % 7 !== 2 && (x / 11) % 7 !== 6) ctx.fillRect(x + 7, 8, 5, 15); }
  return artTexture(c);
}

// A mirror on the music room wall: oval, with its long crack.
function mirrorTexture() {
  const [c, ctx] = artCanvas(128, 160);
  ctx.fillStyle = '#5a4420'; ctx.beginPath(); ctx.ellipse(64, 80, 58, 76, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(0, 0, 128, 160);
  g.addColorStop(0, '#3a4450'); g.addColorStop(1, '#1a1e24');
  ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(64, 80, 48, 66, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(230,240,255,0.7)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(30, 30); ctx.lineTo(52, 66); ctx.lineTo(46, 90); ctx.lineTo(78, 120); ctx.lineTo(90, 146); ctx.stroke();
  return artTexture(c);
}

// ─── Item pictures (the inventory bar) ────────────────────────────────
// One small ink drawing per item, 64×64, returned as an image URL. To use
// real art for an item, return its file's path instead (e.g.
// 'explore/items/kettle.png') for that id.

const itemIconCache = {};
function itemIcon(id) {
  if (itemIconCache[id]) return itemIconCache[id];
  const [c, ctx] = artCanvas(64, 64);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.lineWidth = 2.5; ctx.strokeStyle = '#1a120b';
  const shape = (fill, path) => { ctx.fillStyle = fill; ctx.beginPath(); path(); ctx.fill(); ctx.stroke(); };
  const kettle = body => {
    shape(body, () => { ctx.moveTo(14, 50); ctx.quadraticCurveTo(10, 26, 32, 24); ctx.quadraticCurveTo(54, 26, 50, 50); ctx.closePath(); });
    shape(body, () => { ctx.moveTo(48, 36); ctx.lineTo(60, 26); ctx.lineTo(58, 32); ctx.lineTo(50, 42); ctx.closePath(); });
    ctx.beginPath(); ctx.arc(32, 22, 13, Math.PI, 0); ctx.stroke();
    shape('#5a3a1a', () => { ctx.ellipse(32, 24, 5, 2.5, 0, 0, Math.PI * 2); });
  };
  const steam = col => { ctx.strokeStyle = col; ctx.lineWidth = 2; [24, 32, 40].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 14); ctx.quadraticCurveTo(x - 4, 9, x, 4); ctx.stroke(); }); ctx.strokeStyle = '#1a120b'; ctx.lineWidth = 2.5; };
  const page = (fill, x0, x1, torn) => {
    shape(fill, () => { ctx.moveTo(x0, 8); ctx.lineTo(x1, 8); if (torn === 'right') { for (let y = 8; y <= 56; y += 6) ctx.lineTo(x1 + (y / 6 % 2 ? -3 : 2), y); } else ctx.lineTo(x1, 56); ctx.lineTo(x0, 56); if (torn === 'left') { for (let y = 56; y >= 8; y -= 6) ctx.lineTo(x0 + (y / 6 % 2 ? 3 : -2), y); } ctx.closePath(); });
    ctx.lineWidth = 1; for (let y = 16; y < 52; y += 10) { ctx.beginPath(); ctx.moveTo(x0 + 3, y); ctx.lineTo(x1 - 3, y); ctx.stroke(); }
    ctx.fillStyle = '#1a120b'; for (let x = x0 + 6; x < x1 - 4; x += 7) { ctx.beginPath(); ctx.ellipse(x, 14 + ((x * 7) % 30), 2.2, 1.6, -0.4, 0, Math.PI * 2); ctx.fill(); }
    ctx.lineWidth = 2.5;
  };
  switch (id) {
    case 'matches':
      shape('#8a2a1a', () => ctx.rect(12, 22, 40, 24));
      shape('#d8c49a', () => ctx.rect(16, 26, 32, 16));
      [[20, 10], [28, 8], [36, 12]].forEach(([x, y]) => { ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x + 4, y); ctx.stroke(); shape('#b02a1a', () => ctx.arc(x + 4, y, 3, 0, Math.PI * 2)); });
      break;
    case 'kettle': kettle('#b8743a'); break;
    case 'kettle_water': kettle('#b8743a'); shape('#5a8ac0', () => { ctx.moveTo(32, 32); ctx.quadraticCurveTo(25, 44, 32, 46); ctx.quadraticCurveTo(39, 44, 32, 32); }); break;
    case 'kettle_hot': kettle('#c8843a'); steam('#d8dce6'); break;
    case 'tea': kettle('#c8843a'); steam('#d8dce6'); shape('#6a9a3a', () => ctx.ellipse(32, 40, 7, 5, 0, 0, Math.PI * 2)); break;
    case 'bergamot':
      shape('#8ab83a', () => ctx.ellipse(32, 36, 18, 17, 0, 0, Math.PI * 2));
      shape('#3a6a2a', () => { ctx.moveTo(32, 20); ctx.quadraticCurveTo(44, 8, 52, 14); ctx.quadraticCurveTo(44, 22, 32, 20); });
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(25, 30, 5, 3, -0.5, 0, Math.PI * 2); ctx.fill();
      break;
    case 'flour':
      shape('#d8ccb0', () => { ctx.moveTo(16, 56); ctx.lineTo(12, 22); ctx.quadraticCurveTo(32, 12, 52, 22); ctx.lineTo(48, 56); ctx.closePath(); });
      ctx.beginPath(); ctx.moveTo(18, 22); ctx.quadraticCurveTo(32, 30, 46, 22); ctx.stroke();
      ctx.fillStyle = '#7a6a50'; ctx.font = 'bold 12px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('FLOUR', 32, 44);
      break;
    case 'salt':
      shape('#6a5a4a', () => { ctx.moveTo(14, 26); ctx.lineTo(18, 56); ctx.lineTo(46, 56); ctx.lineTo(50, 26); ctx.closePath(); });
      shape('#eeeae0', () => ctx.ellipse(32, 26, 18, 6, 0, 0, Math.PI * 2));
      break;
    case 'knife':
      shape('#a8aab0', () => { ctx.moveTo(10, 44); ctx.lineTo(40, 20); ctx.quadraticCurveTo(46, 18, 44, 24); ctx.lineTo(16, 48); ctx.closePath(); });
      shape('#e8dcc0', () => { ctx.moveTo(40, 22); ctx.lineTo(54, 10); ctx.lineTo(58, 14); ctx.lineTo(44, 26); ctx.closePath(); });
      break;
    case 'hatchet':
      shape('#5a3a1a', () => { ctx.moveTo(16, 56); ctx.lineTo(40, 12); ctx.lineTo(45, 15); ctx.lineTo(21, 58); ctx.closePath(); });
      shape('#7a7a80', () => { ctx.moveTo(36, 8); ctx.lineTo(58, 16); ctx.quadraticCurveTo(56, 30, 48, 30); ctx.lineTo(34, 22); ctx.closePath(); });
      break;
    case 'oil':
      shape('#7a7a6a', () => { ctx.moveTo(18, 56); ctx.lineTo(18, 26); ctx.lineTo(28, 18); ctx.lineTo(36, 18); ctx.lineTo(46, 26); ctx.lineTo(46, 56); ctx.closePath(); });
      shape('#4a4a40', () => ctx.rect(28, 8, 8, 10));
      shape('#c8a040', () => ctx.rect(22, 34, 20, 12));
      break;
    case 'shard':
      shape('#9ab0c8', () => { ctx.moveTo(30, 4); ctx.lineTo(44, 20); ctx.lineTo(38, 60); ctx.lineTo(22, 34); ctx.closePath(); });
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.moveTo(32, 12); ctx.lineTo(36, 40); ctx.stroke();
      break;
    case 'music_a': page('#e8dcb8', 12, 40, 'right'); break;
    case 'music_b': page('#c8a878', 24, 52, 'left'); ctx.fillStyle = 'rgba(40,20,8,0.5)'; ctx.fillRect(44, 8, 8, 48); break;
    case 'music_full': page('#e8dcb8', 8, 56, null); ctx.strokeStyle = 'rgba(40,20,8,0.6)'; ctx.beginPath(); ctx.moveTo(32, 8); for (let y = 8; y <= 56; y += 6) ctx.lineTo(32 + (y / 6 % 2 ? -2 : 2), y); ctx.stroke(); break;
    case 'ring':
      ctx.lineWidth = 7; ctx.strokeStyle = '#1a120b'; ctx.beginPath(); ctx.ellipse(32, 34, 17, 13, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#d8a83a'; ctx.beginPath(); ctx.ellipse(32, 34, 17, 13, 0, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'ribbon':
      ctx.lineWidth = 8; ctx.strokeStyle = '#2a5a32'; ctx.beginPath(); ctx.moveTo(8, 40); ctx.bezierCurveTo(22, 12, 40, 56, 56, 22); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = '#5a9a5a'; ctx.beginPath(); ctx.moveTo(8, 40); ctx.bezierCurveTo(22, 12, 40, 56, 56, 22); ctx.stroke();
      break;
    case 'doll':
      shape('#c89a6a', () => ctx.arc(32, 16, 9, 0, Math.PI * 2));
      shape('#8a3a2a', () => { ctx.moveTo(22, 26); ctx.lineTo(42, 26); ctx.lineTo(48, 56); ctx.lineTo(16, 56); ctx.closePath(); });
      break;
    case 'bear':
      shape('#5a78b0', () => { ctx.arc(22, 14, 6, 0, Math.PI * 2); ctx.moveTo(48, 14); ctx.arc(42, 14, 6, 0, Math.PI * 2); });
      shape('#5a78b0', () => ctx.arc(32, 22, 12, 0, Math.PI * 2));
      shape('#5a78b0', () => ctx.ellipse(32, 46, 15, 14, 0, 0, Math.PI * 2));
      ctx.fillStyle = '#1a120b'; ctx.beginPath(); ctx.arc(27, 20, 2, 0, Math.PI * 2); ctx.arc(37, 23, 2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'tooth':
      shape('#ece4cc', () => { ctx.moveTo(18, 14); ctx.quadraticCurveTo(32, 4, 46, 14); ctx.quadraticCurveTo(50, 30, 44, 36); ctx.lineTo(40, 56); ctx.lineTo(34, 40); ctx.lineTo(30, 40); ctx.lineTo(24, 56); ctx.lineTo(20, 36); ctx.quadraticCurveTo(14, 30, 18, 14); });
      break;
    default:
      shape('#888', () => ctx.arc(32, 32, 16, 0, Math.PI * 2));
  }
  return (itemIconCache[id] = c.toDataURL());
}
