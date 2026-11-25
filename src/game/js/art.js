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

// ─── Photographs of real surfaces ─────────────────────────────────────
// Free (CC0) textures from Poly Haven (polyhaven.com), in
// docs/explore/textures/. Each texture is first drawn in code, as before;
// when its photograph arrives it's repainted from it, recoloured to the
// same colour, so the house keeps its palette and gains real wood grain,
// stone, plaster and wear.
const photoSrc = name => `explore/textures/${name}.webp`;
const PHOTO_LUM = new Map();
function photoLum(img) {     // the photograph's average brightness
  if (!PHOTO_LUM.has(img)) {
    const [c, ctx] = artCanvas(8, 8);
    ctx.filter = 'grayscale(1)'; ctx.drawImage(img, 0, 0, 8, 8);
    const d = ctx.getImageData(0, 0, 8, 8).data;
    let t = 0; for (let i = 0; i < d.length; i += 4) t += d[i];
    PHOTO_LUM.set(img, Math.max(0.05, t / 64 / 255));
  }
  return PHOTO_LUM.get(img);
}
function hexLum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16 & 255) + 0.587 * (n >> 8 & 255) + 0.114 * (n & 255)) / 255;
}
// When the photograph `name` has loaded, repaint `tex` with `paint`.
function withPhoto(tex, name, paint) {
  whenArt(photoSrc(name), img => {
    const c = tex.image, ctx = c.getContext('2d');
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    paint(ctx, img, c.width, c.height);
    ctx.restore();
    tex.needsUpdate = true;
  });
  return tex;
}
// The photograph's light and shade in `base`'s colour and brightness.
function photoAs(ctx, img, x, y, w, h, base, contrast = 1.15) {
  ctx.save();
  ctx.filter = `grayscale(1) brightness(${(hexLum(base) / photoLum(img)).toFixed(3)}) contrast(${contrast})`;
  ctx.drawImage(img, x, y, w, h);
  ctx.filter = 'none';
  ctx.globalCompositeOperation = 'color';
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  ctx.restore();
}
// The photograph laid over what's there as grime: its darks darken.
function photoGrime(ctx, img, x, y, w, h, strength = 0.5) {
  ctx.save();
  ctx.globalAlpha = strength; ctx.globalCompositeOperation = 'multiply';
  ctx.filter = `grayscale(1) brightness(${(0.82 / photoLum(img)).toFixed(3)}) contrast(1.4)`;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
}

// ─── Walls ────────────────────────────────────────────────────────────
// One square's worth of wall, floor (bottom of the canvas) to ceiling:
// wallpaper above a panelled dado, a skirting board and a cornice. Each
// room has its own paper; some get pictures hung on it.

const ROOM_WALLS = {
  parlor:       { paper: '#3e2826', motif: '#4c302c', dado: '#2b1a12', pattern: 'damask' },
  foyer:        { paper: '#1f2b23', motif: '#26342a', dado: '#22170f', pattern: 'stripe' },
  gallery:      { paper: '#46423c', motif: '#4e4a42', dado: '#2d241b', pattern: 'plain' },
  music:        { paper: '#1f2836', motif: '#2b3850', dado: '#1c1510', pattern: 'stripe' },
  dining:       { paper: '#45361e', motif: '#524024', dado: '#2a1c10', pattern: 'damask' },
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
  const tex = artTexture(c);
  // the paper stained and worn, the panelling real wood
  withPhoto(tex, 'decrepit_wallpaper', (cx, img) => photoGrime(cx, img, 0, 0, 128, 170, 0.42));
  withPhoto(tex, 'wood_table_worn', (cx, img) => photoGrime(cx, img, 0, 170, 128, 86, 0.4));
  return tex;
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

// Which photograph each room's floor is, and in what colour.
const FLOOR_PHOTOS = {
  foyer: ['checkered_pavement_tiles', '#3c3632', 1.5], conservatory: ['stone_tiles', '#3e4038', 1.2],
  kitchen: ['monastery_stone_floor', '#3a3630', 1.2], porch: ['dark_wooden_planks', '#2b231c', 1.2],
  music: ['old_wooden_floor_02', '#2c2018', 1.2], gallery: ['stone_floor', '#4a463f', 1.2],
  dining: ['herringbone_parquet', '#3a2818', 1.3], other: ['old_wood_floor', '#33241a', 1.25],
};
function floorTexture(roomId) {
  const [c, ctx] = artCanvas(512, 512);
  ctx.scale(2, 2);
  const rand = seededRandom(roomId.length * 31 + 7);
  const tiles = (a, b, n = 8) => {
    const s = 256 / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 ? a : b;
      ctx.fillRect(x * s, y * s, s, s);
    }
    for (let i = 0; i < 30; i++) { ctx.fillStyle = `rgba(${rand() < 0.5 ? '0,0,0' : '255,240,220'},${(rand() * 0.06).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(rand() * 256, rand() * 256, 10 + rand() * 40, 6 + rand() * 24, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
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
  if (roomId === 'foyer') tiles('#3c3632', '#2a2522');
  else if (roomId === 'conservatory') tiles('#45443c', '#36362f');
  else if (roomId === 'kitchen') {
    // flagstones, each a slightly different grey
    ctx.fillStyle = '#211d19'; ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 64) for (let x = 0; x < 256; x += 64) {
      const o = ((y / 64) % 2) * 32, v = 52 + rand() * 16;
      [[x + o, y], [x + o - 256, y]].forEach(([fx, fy]) => { ctx.fillStyle = `rgb(${v},${v - 4},${v - 9})`; ctx.fillRect(fx + 2, fy + 2, 60, 60); });
    }
  }
  else if (roomId === 'porch') boards('#2b231c', 24);
  else if (roomId === 'music') boards('#2c2018');
  else if (roomId === 'gallery') tiles('#4a463f', '#433f39', 4);
  else boards(roomId === 'dining' ? '#3a2818' : '#33241a');
  artGrime(ctx, 256, 256, rand, 1.2);
  const [photo, base, contrast] = FLOOR_PHOTOS[roomId] || FLOOR_PHOTOS.other;
  return withPhoto(artTexture(c, { repeat: true }), photo, (cx, img, w, h) => photoAs(cx, img, 0, 0, w, h, base, contrast));
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

// The glasshouse roof's iron glazing bars; drawn the same on its picture
// and on its glow mask, so lightning lights the panes and not the iron.
function glassFrames(ctx, colour) {
  ctx.fillStyle = colour;
  for (let x = 0; x < 256; x += 32) ctx.fillRect(x, 0, x % 128 ? 3 : 8, 256);
  for (let y = 0; y < 256; y += 64) ctx.fillRect(0, y, 256, y % 128 ? 3 : 8);
}
function glassGlowTexture() {
  const [c, ctx] = artCanvas(256, 256);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 256, 256);
  glassFrames(ctx, '#000');
  return artTexture(c, { repeat: true, srgb: false });
}

function ceilingTexture(kind) {
  const [c, ctx] = artCanvas(256, 256);
  const rand = seededRandom(kind.length * 11);
  if (kind === 'glass') {
    const g = ctx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, '#0c1218'); g.addColorStop(1, '#070a0e');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = 'rgba(150,170,200,0.18)'; ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) { const x = rand() * 256, y = rand() * 256; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1, y + 5 + rand() * 12); ctx.stroke(); }
    ctx.fillStyle = 'rgba(20,30,18,0.5)';
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.ellipse(rand() * 256, rand() * 256, 14 + rand() * 20, 6 + rand() * 10, rand() * 3, 0, Math.PI * 2); ctx.fill(); }   // leaves on the glass
    ctx.fillStyle = '#16120e';
    glassFrames(ctx, '#16120e');
    return artTexture(c, { repeat: true });
  }
  ctx.fillStyle = kind === 'porch' ? '#1d1712' : '#25201b'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#140f0b';
  for (let x = 0; x < 256; x += 128) ctx.fillRect(x, 0, 22, 256);
  artGrime(ctx, 256, 256, rand, 2);
  return withPhoto(artTexture(c, { repeat: true }), kind === 'porch' ? 'dark_wooden_planks' : 'plastered_wall', (cx, img, w, h) => {
    photoAs(cx, img, 0, 0, w, h, kind === 'porch' ? '#1d1712' : '#25201b', 1.3);
    cx.fillStyle = '#140f0b'; for (let x = 0; x < w; x += w / 2) cx.fillRect(x, 0, w * 0.086, h);    // the beams
  });
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
    // chain, a tarnished ring, six arms; thin candles with small cold
    // flames (the foyer's ghost-light), and crystal drops beneath
    ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(80, 60); ctx.stroke();
    ctx.strokeStyle = '#2a2018'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(80, 86, 62, 12, 0.06, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(190,160,100,0.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(80, 85, 62, 12, 0.06, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
    ctx.strokeStyle = ART_INK;
    for (let i = 0; i < 7; i++) {
      const x = 26 + i * 18, y = 100 + Math.sin(i / 6 * Math.PI) * 6;
      ctx.strokeStyle = 'rgba(150,140,120,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x, y - 16); ctx.lineTo(x, y); ctx.stroke(); ctx.strokeStyle = ART_INK;
      ctx.fillStyle = 'rgba(200,210,240,0.75)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1.6, y + 3.5); ctx.lineTo(x, y + 7); ctx.lineTo(x - 1.6, y + 3.5); ctx.closePath(); ctx.fill();
    }
    for (let i = 0; i < 6; i++) {
      const x = 20 + i * 24, y = 82 - Math.sin(i / 5 * Math.PI) * 6;
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(80, 60); ctx.quadraticCurveTo((80 + x) / 2, 66, x, y); ctx.stroke();
      // the cup and the candle, wax run down one side
      ctx.fillStyle = '#3a2c20'; ctx.beginPath(); ctx.ellipse(x, y, 6, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#c9bfa6'; ctx.fillRect(x - 2, y - 14, 4, 13);
      ctx.fillStyle = '#e4dcc6'; ctx.fillRect(x - 2, y - 14, 1.5, 9);
      // halo, then a small teardrop flame
      const g = ctx.createRadialGradient(x, y - 19, 0, x, y - 19, 9);
      g.addColorStop(0, 'rgba(200,190,255,0.55)'); g.addColorStop(1, 'rgba(160,140,255,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - 19, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f2eeff'; ctx.beginPath(); ctx.moveTo(x, y - 25); ctx.quadraticCurveTo(x + 3, y - 18, x, y - 15); ctx.quadraticCurveTo(x - 3, y - 18, x, y - 25); ctx.fill();
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
    // the marble peacock as the encounter shows it: tail fanned, carved
    // feathers each ending in a stone eye, its one bloodstone eye lit
    const marble = (x0, y0, x1, y1) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, '#ebe5d8'); g.addColorStop(1, '#9d968a'); return g; };
    const fx = 128, fy = 176;
    for (let i = 0; i < 17; i++) {
      const a = Math.PI * (1.06 + i * 0.055), len = 92 + Math.sin(i / 16 * Math.PI) * 22;
      const tx = fx + Math.cos(a) * len, ty = fy + Math.sin(a) * len;
      const nx = -Math.sin(a), ny = Math.cos(a);
      ctx.fillStyle = marble(fx, fy, tx, ty); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx + nx * 2, fy + ny * 2); ctx.lineTo(tx + nx * 4 - Math.cos(a) * 10, ty + ny * 4 - Math.sin(a) * 10); ctx.lineTo(tx - nx * 4 - Math.cos(a) * 10, ty - ny * 4 - Math.sin(a) * 10); ctx.lineTo(fx - nx * 2, fy - ny * 2); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#e4ddd0'; ctx.beginPath(); ctx.ellipse(tx - Math.cos(a) * 4, ty - Math.sin(a) * 4, 9, 7, a, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a7266'; ctx.beginPath(); ctx.ellipse(tx - Math.cos(a) * 4, ty - Math.sin(a) * 4, 4, 3, a, 0, Math.PI * 2); ctx.fill();
    }
    // the plinth, legs, body
    ctx.fillStyle = '#5a554c'; ctx.fillRect(84, 232, 88, 22); ctx.strokeRect(84, 232, 88, 22);
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(118, 214); ctx.lineTo(116, 234); ctx.moveTo(138, 214); ctx.lineTo(140, 234); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.fillStyle = marble(100, 160, 160, 230);
    ctx.beginPath(); ctx.ellipse(128, 192, 28, 32, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // the neck in an S, the head, beak and crest
    ctx.beginPath(); ctx.moveTo(116, 170); ctx.bezierCurveTo(108, 140, 136, 132, 126, 104); ctx.lineTo(140, 104); ctx.bezierCurveTo(150, 134, 124, 142, 140, 170); ctx.closePath(); ctx.fillStyle = marble(110, 100, 150, 170); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(133, 98, 11, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8c0b2'; ctx.beginPath(); ctx.moveTo(142, 96); ctx.lineTo(156, 101); ctx.lineTo(142, 104); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 1.5; [[-8, -22], [0, -26], [8, -22]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.moveTo(133, 89); ctx.lineTo(133 + dx, 89 + dy * 0.7); ctx.stroke(); ctx.fillStyle = '#ddd6c8'; ctx.beginPath(); ctx.arc(133 + dx, 89 + dy * 0.7, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
    const glow = ctx.createRadialGradient(136, 96, 0, 136, 96, 14); glow.addColorStop(0, 'rgba(255,60,40,0.8)'); glow.addColorStop(1, 'rgba(255,30,20,0)');
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(136, 96, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b01c14'; ctx.beginPath(); ctx.arc(136, 96, 3.4, 0, Math.PI * 2); ctx.fill();   // the bloodstone eye
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
  // (coloured like the official boogleswarm: grey-brown, pale-bellied,
  // red-eyed)
  weasel: { size: [30, 16], draw: () => inkSprite(128, 64, (ctx) => {
    ctx.fillStyle = '#5a4c44';
    ctx.beginPath(); ctx.moveTo(6, 50); ctx.quadraticCurveTo(30, 30, 70, 34); ctx.quadraticCurveTo(100, 26, 118, 38); ctx.lineTo(122, 44); ctx.quadraticCurveTo(100, 50, 76, 52); ctx.quadraticCurveTo(40, 58, 6, 50); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#b8aca0'; ctx.beginPath(); ctx.moveTo(60, 50); ctx.quadraticCurveTo(90, 50, 112, 44); ctx.lineTo(100, 48); ctx.quadraticCurveTo(80, 54, 60, 52); ctx.fill();
    ctx.fillStyle = '#5a4c44'; ctx.fillRect(40, 50, 4, 12); ctx.fillRect(84, 50, 4, 12);
    ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 6; ctx.fillStyle = '#ff3a3a'; ctx.beginPath(); ctx.arc(108, 36, 2.8, 0, Math.PI * 2); ctx.fill();
  }) },
  // His nest: rags and paper, and teeth packed in like seeds.
  nest: { size: [46, 16], draw: () => inkSprite(160, 56, (ctx) => {
    const rand = seededRandom(13);
    ctx.fillStyle = '#3a3026'; ctx.beginPath(); ctx.ellipse(80, 40, 74, 16, 0, Math.PI, Math.PI * 2); ctx.lineTo(154, 52); ctx.lineTo(6, 52); ctx.closePath(); ctx.fill(); ctx.stroke();
    for (let i = 0; i < 26; i++) { ctx.fillStyle = ['#5a4a3a', '#7a6a50', '#4a3a40'][i % 3]; ctx.fillRect(10 + rand() * 140, 26 + rand() * 22, 8 + rand() * 14, 3 + rand() * 4); }
    ctx.fillStyle = '#ece4cc'; for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc(16 + rand() * 128, 30 + rand() * 20, 1.8, 0, Math.PI * 2); ctx.fill(); }
  }) },
};

const spriteTextureCache = {};
function spriteTexture(kind) {
  if (!spriteTextureCache[kind]) spriteTextureCache[kind] = SPRITES[kind].draw();
  return spriteTextureCache[kind];
}

// ─── Faces of furniture (for boxes) ───────────────────────────────────

function woodTexture(base = '#3b2616') {
  const [c, ctx] = artCanvas(256, 256);
  ctx.scale(2, 2);
  const rand = seededRandom(base.length + base.charCodeAt(2));
  ctx.fillStyle = base; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(0,0,0,${(rand() * 0.18).toFixed(2)})`; ctx.fillRect(0, rand() * 128, 128, 1 + rand() * 2); }
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3; ctx.strokeRect(1, 1, 126, 126);
  return withPhoto(artTexture(c), 'wood_table_worn', (cx, img, w, h) => {
    photoAs(cx, img, 0, 0, w, h, base, 1.25);
    cx.strokeStyle = 'rgba(0,0,0,0.6)'; cx.lineWidth = 6; cx.strokeRect(2, 2, w - 4, h - 4);
  });
}

function brickTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(12);
  ctx.fillStyle = '#1c120c'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 12) for (let x = -12; x < 128; x += 26) {
    ctx.fillStyle = `rgb(${64 + rand() * 26},${36 + rand() * 14},${30 + rand() * 10})`;
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
  return withPhoto(artTexture(c), 'wood_table_worn', (cx, img, w, h) => photoGrime(cx, img, 0, 0, w, h, 0.45));
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

// Harpsichord: lacquered case with yellowed keys along its front.
function harpsichordFrontTexture() {
  const [c, ctx] = artCanvas(256, 64);
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#8a7e60'; ctx.fillRect(10, 8, 236, 26);
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
    case 'menu': page('#e8dcb8', 12, 52, null); ctx.fillStyle = 'rgba(40,20,8,0.7)'; [20, 28, 36, 44].forEach(y => ctx.fillRect(22, y, 20, 2)); ctx.fillStyle = '#8a2a1a'; ctx.fillRect(22, 14, 20, 2); break;
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

// ─── The arrival (arrival.js): the estate at dusk ─────────────────────

Object.assign(SPRITES, {
  // Walter Jenkin: tall, bearded, in a flat cap and a work coat.
  walter: { size: [30, 66], draw: () => inkSprite(96, 212, (ctx) => {
    ctx.fillStyle = '#3a3a2c'; ctx.fillRect(34, 150, 11, 60); ctx.fillRect(51, 150, 11, 60);              // trousers
    ctx.fillStyle = '#5a4530'; ctx.beginPath(); ctx.moveTo(26, 62); ctx.lineTo(70, 62); ctx.lineTo(74, 160); ctx.lineTo(22, 160); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d8b48e'; ctx.beginPath(); ctx.ellipse(48, 38, 14, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a5a3a'; ctx.beginPath(); ctx.moveTo(35, 42); ctx.quadraticCurveTo(48, 70, 61, 42); ctx.closePath(); ctx.fill();   // beard
    ctx.fillStyle = '#4a4436'; ctx.beginPath(); ctx.ellipse(48, 24, 17, 8, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.fillRect(40, 22, 26, 5);   // cap
    ctx.fillStyle = '#d8b48e'; ctx.beginPath(); ctx.ellipse(78, 60, 6, 8, 0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // a raised hand
    ctx.lineWidth = 8; ctx.strokeStyle = '#5a4530'; ctx.beginPath(); ctx.moveTo(68, 70); ctx.lineTo(77, 66); ctx.stroke();
  }) },
  // Gilly Jenkin: a long skirt, a shawl, her hair up.
  gilly: { size: [28, 58], draw: () => inkSprite(96, 200, (ctx) => {
    ctx.fillStyle = '#4a5a6a'; ctx.beginPath(); ctx.moveTo(34, 84); ctx.quadraticCurveTo(20, 150, 16, 198); ctx.lineTo(80, 198); ctx.quadraticCurveTo(76, 150, 62, 84); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8a4a3a'; ctx.beginPath(); ctx.moveTo(24, 62); ctx.lineTo(72, 62); ctx.lineTo(62, 108); ctx.lineTo(34, 108); ctx.closePath(); ctx.fill(); ctx.stroke();   // shawl
    ctx.fillStyle = '#e0bc98'; ctx.beginPath(); ctx.ellipse(48, 40, 13, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#6a3a22'; ctx.beginPath(); ctx.ellipse(48, 28, 15, 9, 0, Math.PI, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(48, 16, 7, 0, Math.PI * 2); ctx.fill();
  }) },
  // Dani: ten years old, plaits, a pinafore.
  dani: { size: [20, 40], draw: () => inkSprite(80, 160, (ctx) => {
    ctx.fillStyle = '#6a3048'; ctx.beginPath(); ctx.moveTo(28, 70); ctx.lineTo(52, 70); ctx.lineTo(62, 128); ctx.lineTo(18, 128); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8e0d0'; ctx.fillRect(30, 80, 20, 40);
    ctx.fillStyle = '#3a2a22'; ctx.fillRect(28, 128, 8, 30); ctx.fillRect(44, 128, 8, 30);
    ctx.fillStyle = '#e4c0a0'; ctx.beginPath(); ctx.ellipse(40, 48, 13, 15, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#a86a32'; ctx.beginPath(); ctx.ellipse(40, 38, 14, 8, 0, Math.PI, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#a86a32'; ctx.beginPath(); ctx.moveTo(27, 42); ctx.lineTo(22, 70); ctx.moveTo(53, 42); ctx.lineTo(58, 70); ctx.stroke();
    ctx.fillStyle = '#1a120b'; ctx.beginPath(); ctx.arc(35, 48, 1.8, 0, Math.PI * 2); ctx.arc(45, 48, 1.8, 0, Math.PI * 2); ctx.fill();
  }) },
  // Shuck: a red-furred dog that never leaves Dani's side.
  shuck: { size: [36, 26], draw: () => inkSprite(140, 100, (ctx) => {
    ctx.fillStyle = '#9a3a1a';
    ctx.beginPath(); ctx.ellipse(66, 52, 40, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    [36, 50, 82, 96].forEach(x => { ctx.fillRect(x - 4, 60, 8, 38); ctx.strokeRect(x - 4, 60, 8, 38); });
    ctx.beginPath(); ctx.moveTo(104, 44); ctx.lineTo(126, 26); ctx.lineTo(136, 34); ctx.lineTo(118, 52); ctx.closePath(); ctx.fill(); ctx.stroke();   // head
    ctx.beginPath(); ctx.moveTo(120, 28); ctx.lineTo(118, 12); ctx.lineTo(128, 24); ctx.fill(); ctx.stroke();   // ear
    ctx.lineWidth = 6; ctx.strokeStyle = '#9a3a1a'; ctx.beginPath(); ctx.moveTo(28, 46); ctx.quadraticCurveTo(10, 40, 8, 22); ctx.stroke();   // tail
  }) },
  // The grey cat, Wisp.
  wisp: { size: [20, 18], draw: () => inkSprite(96, 86, (ctx) => {
    ctx.fillStyle = '#7a7a80';
    ctx.beginPath(); ctx.ellipse(44, 56, 26, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    [26, 36, 54, 62].forEach(x => { ctx.fillRect(x - 3, 62, 6, 22); });
    ctx.beginPath(); ctx.arc(70, 34, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(60, 26); ctx.lineTo(60, 12); ctx.lineTo(68, 22); ctx.moveTo(80, 26); ctx.lineTo(82, 12); ctx.lineTo(74, 22); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = '#7a7a80'; ctx.beginPath(); ctx.moveTo(20, 50); ctx.quadraticCurveTo(4, 30, 14, 8); ctx.stroke();
    ctx.fillStyle = '#d8f070'; ctx.beginPath(); ctx.ellipse(65, 33, 3, 2, 0, 0, Math.PI * 2); ctx.ellipse(76, 33, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  }) },
  flowers: { size: [44, 16], draw: () => inkSprite(176, 64, (ctx) => {
    const rand = seededRandom(21);
    ctx.fillStyle = '#2e5a2a'; for (let i = 0; i < 26; i++) { ctx.beginPath(); ctx.ellipse(10 + rand() * 156, 44 + rand() * 18, 6, 14, rand() - 0.5, 0, Math.PI * 2); ctx.fill(); }
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = ['#e85a6a', '#f0d060', '#e890c0', '#f4f0e8', '#b070d8'][i % 5];
      const x = 10 + rand() * 156, y = 12 + rand() * 34;
      for (let p = 0; p < 5; p++) { const a = p * 1.256; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 4, y + Math.sin(a) * 4, 3.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#5a3a10'; ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
  }) },
  weeds: { size: [48, 30], draw: () => inkSprite(176, 110, (ctx) => {
    const rand = seededRandom(22);
    ctx.strokeStyle = '#2a2a1a'; ctx.lineWidth = 3;
    for (let i = 0; i < 22; i++) {
      const x = 8 + rand() * 160, h = 40 + rand() * 66, lean = (rand() - 0.5) * 30;
      ctx.beginPath(); ctx.moveTo(x, 110); ctx.quadraticCurveTo(x + lean * 0.3, 110 - h / 2, x + lean, 110 - h); ctx.stroke();
      if (i % 3 === 0) { ctx.fillStyle = '#4a2a4a'; ctx.beginPath(); ctx.arc(x + lean, 106 - h, 6, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#2a2a1a'; ctx.beginPath(); ctx.ellipse(x + lean, 112 - h, 5, 6, 0, 0, Math.PI * 2); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(x + lean * 0.5, 110 - h * 0.5); ctx.lineTo(x + lean * 0.5 + 12, 100 - h * 0.5); ctx.moveTo(x + lean * 0.5, 104 - h * 0.6); ctx.lineTo(x + lean * 0.5 - 12, 96 - h * 0.6); ctx.stroke(); }
    }
  }) },
});

// The house's skin, from tidy to crooked: pale painted weatherboards that
// rot spreads across as `rot` goes from 0 to 1 (redrawn as it does).
function houseSkin(canvas, rot) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const rand = seededRandom(31);
  const mix = (a, b) => a.map((v, i) => Math.round(v + (b[i] - v) * rot));
  const [r, g, b] = mix([196, 186, 166], [46, 48, 42]);
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fillRect(0, 0, W, H);
  const siding = artImage(photoSrc('weathered_plank_siding'));
  if (siding.complete && siding.naturalWidth) {
    // weatherboards from the photograph, painted pale, then stripped dark
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    photoAs(ctx, siding, 0, 0, W, H / 2, hex, 1.3); photoAs(ctx, siding, 0, H / 2, W, H / 2, hex, 1.3);
  } else for (let y = 0; y < H; y += 12) {
    ctx.fillStyle = `rgba(0,0,0,${0.12 + rot * 0.18 + rand() * 0.1})`; ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, y + 2, W, 2);
  }
  // Mould and rot: stains running down from the eaves and the sills,
  // and damp creeping up from below, each appearing in its own moment.
  for (let i = 0; i < 46; i++) {
    const at = rand() * 0.75, x = rand() * W, y = rand() * H, wide = 3 + rand() * 12, long = 20 + rand() * 90, kind = rand();
    const k = Math.max(0, Math.min(1, (rot - at) / 0.25));
    if (!k) continue;
    if (kind < 0.6) {
      const grad = ctx.createLinearGradient(0, y, 0, y + long * k);
      grad.addColorStop(0, kind < 0.3 ? 'rgba(26,36,18,0.6)' : 'rgba(20,14,10,0.6)');
      grad.addColorStop(1, 'rgba(20,20,10,0)');
      ctx.fillStyle = grad; ctx.fillRect(x, y, wide, long * k);
    } else {
      const grad = ctx.createRadialGradient(x, y, 0, x, y, wide * 3 * k);
      grad.addColorStop(0, 'rgba(34,46,24,0.45)'); grad.addColorStop(1, 'rgba(30,40,20,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.ellipse(x, y, wide * 3 * k, wide * 1.6 * k, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (rot > 0) { ctx.fillStyle = `rgba(16,20,10,${(rot * 0.35).toFixed(3)})`; ctx.fillRect(0, H * 0.8, W, H * 0.2); }
  if (rot > 0.5) artGrime(ctx, W, H, seededRandom(5), (rot - 0.5) * 3);
}

function slateTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(17);
  ctx.fillStyle = '#2a2a30'; ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16 % 2) * 8; x < 128; x += 16) {
    const v = 34 + rand() * 18;
    ctx.fillStyle = `rgb(${v},${v},${v + 6})`; ctx.fillRect(x + 1, y + 1, 14, 14);
  }
  return withPhoto(artTexture(c, { repeat: true }), 'roof_slates_02', (cx, img, w, h) => photoAs(cx, img, 0, 0, w, h, '#2e2e34', 1.3));
}

function grassTexture() {
  const [c, ctx] = artCanvas(256, 256);
  const rand = seededRandom(23);
  ctx.fillStyle = '#3a4a2a'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = rand();
    ctx.fillStyle = v < 0.4 ? 'rgba(80,100,50,0.5)' : v < 0.8 ? 'rgba(30,40,20,0.5)' : 'rgba(110,100,60,0.4)';
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 2 + rand() * 5);
  }
  return artTexture(c, { repeat: true });
}

function gravelTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(24);
  ctx.fillStyle = '#6a6052'; ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 900; i++) { const v = 60 + rand() * 80; ctx.fillStyle = `rgb(${v},${v * 0.92},${v * 0.8})`; ctx.fillRect(rand() * 128, rand() * 128, 1 + rand() * 3, 1 + rand() * 3); }
  return artTexture(c, { repeat: true });
}

function barnTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(25);
  ctx.fillStyle = '#6a2a1e'; ctx.fillRect(0, 0, 128, 128);
  for (let x = 0; x < 128; x += 10) { ctx.fillStyle = `rgba(0,0,0,${0.2 + rand() * 0.2})`; ctx.fillRect(x, 0, 2, 128); }
  artGrime(ctx, 128, 128, rand, 0.6);
  return artTexture(c, { repeat: true });
}

// The sky at dusk, top to bottom: night coming in overhead, the last of
// the light at the horizon.
function duskSkyTexture() {
  const [c, ctx] = artCanvas(8, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0e0e24'); g.addColorStop(0.3, '#2c2850'); g.addColorStop(0.44, '#6a4a74');
  g.addColorStop(0.5, '#c46a6a'); g.addColorStop(0.54, '#e89a6a'); g.addColorStop(0.6, '#5a3a48'); g.addColorStop(1, '#141018');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 8, 512);
  return artTexture(c);
}

function lampGlowTexture() {
  const [c, ctx] = artCanvas(32, 32);
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,230,170,1)'); g.addColorStop(0.3, 'rgba(255,190,110,0.6)'); g.addColorStop(1, 'rgba(255,160,80,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32);
  return artTexture(c);
}


// ─── Furniture (furniture.js) ─────────────────────────────────────────

// Upholstery: a faded weave in one colour, worn paler in places.
function fabricTexture(base) {
  const [c, ctx] = artCanvas(64, 64);
  const rand = seededRandom(base.charCodeAt(1) * 7 + base.charCodeAt(3));
  ctx.fillStyle = base; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 64; y += 2) { ctx.fillStyle = `rgba(0,0,0,${(0.05 + rand() * 0.06).toFixed(3)})`; ctx.fillRect(0, y, 64, 1); }
  for (let i = 0; i < 6; i++) { ctx.fillStyle = 'rgba(255,240,220,0.05)'; ctx.beginPath(); ctx.ellipse(rand() * 64, rand() * 64, 6 + rand() * 10, 4 + rand() * 6, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
  return withPhoto(artTexture(c, { repeat: true }), 'velour_velvet', (cx, img, w, h) => photoAs(cx, img, 0, 0, w, h, base, 1.6));
}

// Grey dressed stone, in blocks; with moss, for the garden bench.
function stoneTexture(moss = false) {
  const [c, ctx] = artCanvas(128, 128);
  const rand = seededRandom(moss ? 44 : 43);
  ctx.fillStyle = '#2a2724'; ctx.fillRect(0, 0, 128, 128);
  if (moss) { ctx.fillStyle = '#58544c'; ctx.fillRect(0, 0, 128, 128); }
  else for (let y = 0; y < 128; y += 32) for (let x = -32; x < 128; x += 64) {
    const v = 78 + rand() * 18;
    ctx.fillStyle = `rgb(${v},${v - 4},${v - 10})`; ctx.fillRect(x + ((y / 32) % 2) * 32 + 1, y + 1, 62, 30);
  }
  artGrime(ctx, 128, 128, rand, 0.8);
  const mossy = cx => { const r2 = seededRandom(45); for (let i = 0; i < 26; i++) { cx.fillStyle = `rgba(${50 + r2() * 20},${74 + r2() * 20},${36},0.45)`; cx.beginPath(); cx.ellipse(r2() * cx.canvas.width, r2() * cx.canvas.height, 4 + r2() * 14, 3 + r2() * 8, r2() * 3, 0, Math.PI * 2); cx.fill(); } };
  if (moss) mossy(ctx);
  return withPhoto(artTexture(c, { repeat: true }), moss ? 'castle_wall_slates' : 'stone_tile_wall', (cx, img, w, h) => {
    photoAs(cx, img, 0, 0, w, h, moss ? '#58544c' : '#5a564e', 1.2);
    if (moss) mossy(cx);
  });
}

// The dining table's cloth: old linen, yellowed, with wine stains.
function tableclothTexture() {
  const [c, ctx] = artCanvas(128, 256);
  const rand = seededRandom(27);
  ctx.fillStyle = '#767062'; ctx.fillRect(0, 0, 128, 256);
  ctx.strokeStyle = 'rgba(60,50,40,0.25)'; ctx.lineWidth = 2; ctx.strokeRect(5, 5, 118, 246);
  for (let i = 0; i < 18; i++) { ctx.fillStyle = `rgba(${rand() < 0.5 ? '60,50,36' : '255,250,235'},${(rand() * 0.08).toFixed(3)})`; ctx.beginPath(); ctx.ellipse(rand() * 128, rand() * 256, 8 + rand() * 20, 6 + rand() * 14, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
  for (let i = 0; i < 10; i++) { ctx.fillStyle = `rgba(80,20,24,${(0.15 + rand() * 0.2).toFixed(2)})`; ctx.beginPath(); ctx.ellipse(rand() * 128, rand() * 256, 3 + rand() * 9, 2 + rand() * 6, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
  return artTexture(c);
}

// Leaves, dense and glossy, for the bergamot tree's crown.
function leafTexture() {
  const [c, ctx] = artCanvas(64, 64);
  const rand = seededRandom(33);
  ctx.fillStyle = '#1c3218'; ctx.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 60; i++) { const v = rand(); ctx.fillStyle = v < 0.4 ? '#2e4e26' : v < 0.8 ? '#24401e' : '#3e5e2e'; ctx.beginPath(); ctx.ellipse(rand() * 64, rand() * 64, 5, 2.4, rand() * 3, 0, Math.PI * 2); ctx.fill(); }
  return artTexture(c, { repeat: true });
}

// Flames for the hearth: lit by setHearth (story.js) through emissive.
function fireTexture() {
  const [c, ctx] = artCanvas(64, 64);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 60, 2, 32, 50, 30);
  g.addColorStop(0, '#fff'); g.addColorStop(0.35, '#c86'); g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(8, 64); for (let x = 8; x <= 56; x += 6) ctx.lineTo(x, 26 + Math.abs(Math.sin(x * 0.7)) * 22); ctx.lineTo(56, 64); ctx.closePath(); ctx.fill();
  return artTexture(c);
}

// ─── Pictures on the walls (world.js hangs them) ──────────────────────

// A '#rrggbb' colour lightened (k > 0) or darkened (k < 0) by a fraction.
function shadeHex(hex, k) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.round(clamp(k >= 0 ? v + (255 - v) * k : v * (1 + k), 0, 255));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// A family portrait, each one different, painted the way the house's own
// portraits are: light from one side, a lighter ground behind the head,
// dark period clothes, brush dabs, cracked varnish; eyes a little too wide.
function portraitTexture(seed) {
  const W = 192, H = 256;
  const [c, ctx] = artCanvas(W, H);
  const rand = seededRandom(seed * 19 + 3);
  const pick = arr => arr[Math.floor(rand() * arr.length)];
  const woman = rand() < 0.5, child = rand() < 0.18, old = !child && rand() < 0.3;
  const ground = ['#4a3e2c', '#34392f', '#43302f', '#373442'][seed % 4];
  const bg = ctx.createRadialGradient(W * 0.42, H * 0.36, 8, W * 0.5, H * 0.5, H * 0.75);
  bg.addColorStop(0, ground); bg.addColorStop(1, '#0b0907');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  // a heavy drape in one corner, sometimes
  if (rand() < 0.5) { const dx = rand() < 0.5 ? 0 : W; ctx.fillStyle = 'rgba(70,20,24,0.55)'; ctx.beginPath(); ctx.moveTo(dx, 0); ctx.quadraticCurveTo(Math.abs(dx - 60), 90, Math.abs(dx - 30), H); ctx.lineTo(dx, H); ctx.fill(); }
  const skin = pick(['#b8987a', '#c4a284', '#a88a6e', '#caa88a']);
  const skinDark = shadeHex(skin, -0.32);
  const hair = old ? pick(['#8a8478', '#a8a296', '#6a645a']) : pick(['#1c1510', '#3a2818', '#4e3420', '#2a2018', '#6a4a2a']);
  const coat = pick(['#17141a', '#211816', '#141a20', '#24201a', '#2a1a1e']);
  const cx = 96, hy = child ? 118 : 100, hw = child ? 24 : 27, hh = child ? 30 : 35;
  // shoulders and clothes
  const sw = child ? 58 : 78, top = hy + hh + 18;
  ctx.fillStyle = coat;
  ctx.beginPath(); ctx.moveTo(cx - sw, H); ctx.quadraticCurveTo(cx - sw + 4, top + 6, cx - 18, top - 6); ctx.lineTo(cx + 18, top - 6); ctx.quadraticCurveTo(cx + sw - 4, top + 6, cx + sw, H); ctx.closePath(); ctx.fill();
  // the light catching the left shoulder
  const sh = ctx.createLinearGradient(cx - sw, 0, cx + sw, 0); sh.addColorStop(0, 'rgba(255,240,210,0.10)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = sh; ctx.fill();
  // the neck
  ctx.fillStyle = skinDark; ctx.fillRect(cx - 10, hy + hh - 10, 20, 26);
  if (woman) {
    // a high lace collar and a brooch
    ctx.fillStyle = '#d8cfbc'; ctx.beginPath(); ctx.moveTo(cx - 15, hy + hh + 4); ctx.quadraticCurveTo(cx, hy + hh + 12, cx + 15, hy + hh + 4); ctx.lineTo(cx + 13, hy + hh + 24); ctx.quadraticCurveTo(cx, hy + hh + 30, cx - 13, hy + hh + 24); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(120,110,90,0.6)'; ctx.lineWidth = 1; for (let i = -12; i <= 12; i += 4) { ctx.beginPath(); ctx.arc(cx + i, hy + hh + 26, 2, 0, Math.PI); ctx.stroke(); }
    ctx.fillStyle = pick(['#8a2a22', '#2a4a5a', '#3a5a32']); ctx.beginPath(); ctx.ellipse(cx, hy + hh + 38, 5, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#c9a96e'; ctx.lineWidth = 1.5; ctx.stroke();
  } else {
    // a white shirt, a dark cravat, lapels
    ctx.fillStyle = '#d8d0c0'; ctx.beginPath(); ctx.moveTo(cx - 16, top - 4); ctx.lineTo(cx, top + 34); ctx.lineTo(cx + 16, top - 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = pick(['#1a1414', '#3a1a1a', '#1a2230']); ctx.beginPath(); ctx.moveTo(cx - 8, top - 2); ctx.lineTo(cx + 8, top - 2); ctx.lineTo(cx + 4, top + 12); ctx.lineTo(cx - 4, top + 12); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 18, top - 4); ctx.lineTo(cx - 6, top + 44); ctx.moveTo(cx + 18, top - 4); ctx.lineTo(cx + 6, top + 44); ctx.stroke();
  }
  // hair behind the head
  ctx.fillStyle = hair;
  if (woman) { ctx.beginPath(); ctx.ellipse(cx, hy - 4, hw + 5, hh + 3, 0, Math.PI * 0.9, Math.PI * 2.1); ctx.fill(); }
  // the face: a tapering jaw, lit from the left
  const face = new Path2D();
  face.moveTo(cx - hw, hy - 6);
  face.quadraticCurveTo(cx - hw, hy - hh, cx, hy - hh);
  face.quadraticCurveTo(cx + hw, hy - hh, cx + hw, hy - 6);
  face.quadraticCurveTo(cx + hw - 2, hy + hh * 0.55, cx, hy + hh);
  face.quadraticCurveTo(cx - hw + 2, hy + hh * 0.55, cx - hw, hy - 6);
  const fg = ctx.createLinearGradient(cx - hw, 0, cx + hw, 0); fg.addColorStop(0, shadeHex(skin, 0.08)); fg.addColorStop(0.55, skin); fg.addColorStop(1, skinDark);
  ctx.fillStyle = fg; ctx.fill(face);
  ctx.fillStyle = 'rgba(170,70,60,0.16)'; [[-13, 12], [13, 12]].forEach(([dx, dy]) => { ctx.beginPath(); ctx.ellipse(cx + dx, hy + dy, 7, 5, 0, 0, Math.PI * 2); ctx.fill(); });
  if (old) { ctx.strokeStyle = 'rgba(70,45,30,0.35)'; ctx.lineWidth = 1; [[-14, 18, -8, 24], [14, 18, 8, 24], [-10, -16, 10, -16]].forEach(([a, b, c2, d]) => { ctx.beginPath(); ctx.moveTo(cx + a, hy + b); ctx.lineTo(cx + c2, hy + d); ctx.stroke(); }); }
  // hair on top
  ctx.fillStyle = hair;
  if (woman) {
    ctx.beginPath(); ctx.moveTo(cx - hw - 2, hy - 2); ctx.quadraticCurveTo(cx - hw - 4, hy - hh - 8, cx, hy - hh - 6); ctx.quadraticCurveTo(cx + hw + 4, hy - hh - 8, cx + hw + 2, hy - 2); ctx.quadraticCurveTo(cx + 10, hy - hh + 4, cx, hy - hh + 8); ctx.quadraticCurveTo(cx - 10, hy - hh + 4, cx - hw - 2, hy - 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx, hy - hh - 10, 13, 10, 0, 0, Math.PI * 2); ctx.fill();    // a bun
  } else if (!old || rand() < 0.6) {
    ctx.beginPath(); ctx.moveTo(cx - hw - 1, hy - 4); ctx.quadraticCurveTo(cx - hw, hy - hh - 6, cx + 4, hy - hh - 5); ctx.quadraticCurveTo(cx + hw + 2, hy - hh - 2, cx + hw + 1, hy - 4); ctx.quadraticCurveTo(cx + hw - 4, hy - hh + 8, cx - 6, hy - hh + 10); ctx.quadraticCurveTo(cx - hw + 2, hy - hh + 12, cx - hw - 1, hy - 4); ctx.fill();
    if (rand() < 0.5) { ctx.fillRect(cx - hw, hy - 6, 5, 22); ctx.fillRect(cx + hw - 5, hy - 6, 5, 22); }   // side-whiskers
  }
  // a little light in the hair
  ctx.strokeStyle = 'rgba(255,240,210,0.12)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx - 6, hy - hh + 2, hw * 0.7, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  // eyes, a little too wide; brows; a nose in shadow; a thin mouth
  const ey = hy - 3, ex = 11;
  [-1, 1].forEach(k => {
    ctx.fillStyle = 'rgba(60,40,30,0.35)'; ctx.beginPath(); ctx.ellipse(cx + k * ex, ey - 1, 8, 5, 0, 0, Math.PI * 2); ctx.fill();   // the socket
    ctx.fillStyle = '#efe6d4'; ctx.beginPath(); ctx.ellipse(cx + k * ex, ey, 5.6, 3.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = pick(['#3a2a1a', '#2a3a4a', '#3a4a2a']); ctx.beginPath(); ctx.arc(cx + k * ex + (rand() - 0.5) * 1.5, ey, 2.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#080605'; ctx.beginPath(); ctx.arc(cx + k * ex, ey, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(40,24,16,0.85)'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(cx + k * ex, ey + 0.5, 6, 4, 0, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();   // the lid
    ctx.strokeStyle = shadeHex(hair, -0.2); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx + k * (ex - 6), ey - 8); ctx.quadraticCurveTo(cx + k * ex, ey - 11 - rand() * 2, cx + k * (ex + 7), ey - 7); ctx.stroke();
  });
  ctx.fillStyle = 'rgba(60,36,24,0.4)'; ctx.beginPath(); ctx.moveTo(cx + 1, ey + 2); ctx.lineTo(cx + 5, ey + 15); ctx.lineTo(cx - 2, ey + 16); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(60,30,24,0.75)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(cx - 7, hy + 22); ctx.quadraticCurveTo(cx, hy + 23 + (rand() - 0.6) * 3, cx + 7, hy + 22); ctx.stroke();
  if (!woman && !child && rand() < 0.45) {   // a moustache, or a full beard
    ctx.fillStyle = hair;
    if (rand() < 0.5) { ctx.beginPath(); ctx.moveTo(cx - 11, hy + 21); ctx.quadraticCurveTo(cx, hy + 13, cx + 11, hy + 21); ctx.quadraticCurveTo(cx, hy + 18, cx - 11, hy + 21); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(cx - hw + 1, hy + 4); ctx.quadraticCurveTo(cx - hw + 4, hy + hh + 14, cx, hy + hh + 16); ctx.quadraticCurveTo(cx + hw - 4, hy + hh + 14, cx + hw - 1, hy + 4); ctx.quadraticCurveTo(cx + 8, hy + 20, cx, hy + 26); ctx.quadraticCurveTo(cx - 8, hy + 20, cx - hw + 1, hy + 4); ctx.fill(); }
  }
  // brush dabs over everything, the paint's own texture
  for (let i = 0; i < 900; i++) {
    const x = rand() * W, y = rand() * H, l = rand() < 0.5;
    ctx.fillStyle = l ? 'rgba(255,240,210,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.beginPath(); ctx.ellipse(x, y, 2 + rand() * 5, 1 + rand() * 1.5, rand() * Math.PI, 0, Math.PI * 2); ctx.fill();
  }
  // craquelure: fine cracks in the old paint
  ctx.strokeStyle = 'rgba(10,8,6,0.12)'; ctx.lineWidth = 0.5;
  for (let i = 0; i < 40; i++) { let x = rand() * W, y = rand() * H; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (rand() - 0.5) * 12; y += (rand() - 0.5) * 12; ctx.lineTo(x, y); } ctx.stroke(); }
  artGrime(ctx, W, H, rand, 0.35);
  // old varnish, darker towards the edges
  ctx.fillStyle = 'rgba(90,64,20,0.2)'; ctx.fillRect(0, 0, W, H);
  const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H / 2, H * 0.7); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  return artTexture(c);
}

// A landscape: moor, lake or wood under a heavy sky, each different.
function landscapeTexture(seed) {
  const [c, ctx] = artCanvas(160, 112);
  const rand = seededRandom(seed * 23 + 5);
  const sky = ctx.createLinearGradient(0, 0, 0, 70);
  const tops = [['#4a4e5a', '#8a7a5a'], ['#3a4250', '#6a6a64'], ['#5a4a46', '#9a7a52'], ['#2e3440', '#5a5e5a']][seed % 4];
  sky.addColorStop(0, tops[0]); sky.addColorStop(1, tops[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 160, 112);
  const band = (y0, amp, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, 112); for (let x = 0; x <= 160; x += 8) ctx.lineTo(x, y0 + Math.sin(x * 0.04 + rand() * 6) * amp + rand() * amp * 0.5); ctx.lineTo(160, 112); ctx.closePath(); ctx.fill(); };
  band(56, 8, '#3e4038'); band(68, 6, '#34362c');
  if (seed % 3 === 1) { ctx.fillStyle = '#4a5462'; ctx.fillRect(0, 78, 160, 10); }      // a lake
  band(84, 5, '#2a2a20');
  if (seed % 3 === 2) for (let i = 0; i < 9; i++) { const x = rand() * 160; ctx.fillStyle = '#1e2018'; ctx.beginPath(); ctx.moveTo(x, 90); ctx.lineTo(x + 6, 56 + rand() * 14); ctx.lineTo(x + 12, 90); ctx.fill(); }
  artGrime(ctx, 160, 112, rand, 0.4);
  ctx.fillStyle = 'rgba(80,60,20,0.16)'; ctx.fillRect(0, 0, 160, 112);
  return artTexture(c);
}

// A still life for the dining room and parlour: fruit, a jug, a dead bird.
function stillLifeTexture(seed) {
  const [c, ctx] = artCanvas(128, 96);
  const rand = seededRandom(seed * 29 + 7);
  ctx.fillStyle = '#1a140e'; ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = '#3a2a1a'; ctx.fillRect(0, 62, 128, 34);
  ctx.fillStyle = '#5a4a32'; ctx.beginPath(); ctx.ellipse(40, 46, 13, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(34, 26, 12, 6);
  ['#6a2a1e', '#7a6a2a', '#4a2a3a', '#6a4a1a'].forEach((col, i) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(66 + i * 10 + rand() * 4, 60 - (i % 2) * 6, 6, 0, Math.PI * 2); ctx.fill(); });
  if (seed % 2) { ctx.fillStyle = '#4a4a42'; ctx.beginPath(); ctx.ellipse(100, 70, 14, 6, 0.3, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(80,60,20,0.18)'; ctx.fillRect(0, 0, 128, 96);
  return artTexture(c);
}


// ─── The official artwork ─────────────────────────────────────────────
// Characters from the book's own illustrations (docs/explore/characters/,
// masters in source-assets/originals/). Each loads once; a sprite made from
// one is drawn onto its canvas when the picture arrives.

const CHARACTER_ART = {
  crookedMan: 'explore/characters/crooked-man.webp',          // full figure
  crookedManClose: 'explore/characters/crooked-man-close.webp', // the doorway painting, cropped
  jasper: 'explore/characters/filthy-jasper.webp',
  boogleswarm: 'explore/characters/boogleswarm.webp',
  joseph: 'explore/characters/joseph-patrini.webp',
  gail: 'explore/characters/gail-patrini.webp',
  sally: 'explore/characters/sally-lockwood.webp',
};
const ART_IMAGES = {};
function artImage(src) {
  if (!ART_IMAGES[src]) { const img = new Image(); img.src = src; ART_IMAGES[src] = img; }
  return ART_IMAGES[src];
}
// Calls `fn(img)` once the picture is ready (straight away if it is).
function whenArt(src, fn) {
  const img = artImage(src);
  if (img.complete && img.naturalWidth) fn(img); else img.addEventListener('load', () => fn(img), { once: true });
}
// Start fetching them all now, so they're ready by the time they're seen.
Object.values(CHARACTER_ART).forEach(artImage);

// A canvas texture painted from a picture once it has loaded.
function paintedTexture(cw, ch, src, paint) {
  const [c, ctx] = artCanvas(cw, ch);
  const tex = artTexture(c);
  whenArt(src, img => { ctx.clearRect(0, 0, cw, ch); paint(ctx, img, cw, ch); tex.needsUpdate = true; });
  return tex;
}
// The whole picture, fitted to the canvas's bottom edge, with a faint glow
// round it so it stands out of the dark.
function paintGlowing(glow) {
  return (ctx, img, cw, ch) => {
    const pad = 10, s = Math.min((cw - pad * 2) / img.width, (ch - pad) / img.height);
    const w = img.width * s, h = img.height * s;
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 12; }
    ctx.drawImage(img, (cw - w) / 2, ch - h, w, h);
  };
}
// A whole person from an official head-and-shoulders portrait: the
// portrait at life size, and beneath it a soft body in their colours that
// fades away towards the floor, the way someone half-remembered (or a
// ghost) would. `ghost` washes it all cold blue.
function paintFigure(body, ghost = false) {
  return (ctx, img, cw, ch) => {
    const bustH = ch * body.bust, bustW = Math.min(cw, bustH * img.width / img.height);
    const x0 = cw / 2, top = bustH * 0.8;
    // the body: shoulders as wide as the portrait's, narrowing at the
    // waist, then the skirt or coat
    ctx.filter = 'blur(2px)';      // soft-edged, like something half-seen
    ctx.fillStyle = body.colour;
    ctx.beginPath();
    ctx.moveTo(x0 - bustW * 0.46, top);
    ctx.quadraticCurveTo(x0 - bustW * 0.42, top + ch * 0.18, x0 - bustW * 0.3, top + ch * 0.26);
    ctx.lineTo(x0 - bustW * body.hem, ch);
    ctx.lineTo(x0 + bustW * body.hem, ch);
    ctx.lineTo(x0 + bustW * 0.3, top + ch * 0.26);
    ctx.quadraticCurveTo(x0 + bustW * 0.42, top + ch * 0.18, x0 + bustW * 0.46, top);
    ctx.closePath(); ctx.fill();
    if (body.apron) { ctx.fillStyle = body.apron; ctx.beginPath(); ctx.moveTo(x0 - bustW * 0.2, top + ch * 0.2); ctx.lineTo(x0 + bustW * 0.2, top + ch * 0.2); ctx.lineTo(x0 + bustW * 0.3, ch); ctx.lineTo(x0 - bustW * 0.3, ch); ctx.closePath(); ctx.fill(); }
    ctx.filter = 'none';
    // light from one side
    const g = ctx.createLinearGradient(x0 - bustW / 2, 0, x0 + bustW / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.3)'); g.addColorStop(0.45, 'rgba(255,240,220,0.06)'); g.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = g; ctx.fillRect(0, top, cw, ch); ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(img, x0 - bustW / 2, 0, bustW, bustH);
    stylizePainting(ctx, cw, ch, STYLE.person);
    // fading out towards the floor
    // (one fill over the whole canvas: destination-in clears whatever it
    // doesn't cover)
    const fade = ctx.createLinearGradient(0, 0, 0, ch);
    fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.5, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = fade; ctx.fillRect(0, 0, cw, ch);
    if (ghost) { ctx.globalCompositeOperation = 'source-atop'; ctx.fillStyle = 'rgba(110,160,235,0.55)'; ctx.fillRect(0, 0, cw, ch); }
    ctx.globalCompositeOperation = 'source-over';
  };
}
const BODIES = {
  joseph: { bust: 0.34, colour: '#1c1e22', hem: 0.36 },                       // black tailcoat
  gail: { bust: 0.34, colour: '#1c2024', hem: 0.48, apron: '#cfc8b8' },       // black dress, white apron
  sally: { bust: 0.4, colour: '#bcb6c6', hem: 0.46 },                         // a pale frock
};

// In the house, the paintings are stylized so they sit in its light like
// everything else: posterized to a few tones, the painted highlights
// pressed down, outlined in ink, with a little paper grain, and lit by the
// lantern and the room rather than glowing. `keep(r, g, b)` picks out
// accents left in their own bright colour (the Crooked Man's yellow grin,
// Jasper's pink eye); `lift` brightens the tones a little.
function stylizePainting(ctx, cw, ch, { bands = 5, sat = 0.6, tint = [1, 0.96, 0.88], lift = 1, keep = null } = {}) {
  const d = ctx.getImageData(0, 0, cw, ch), p = d.data;
  const a = new Uint8Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) a[i] = p[i * 4 + 3] > 40 ? 1 : 0;
  const lum = new Float32Array(cw * ch);
  for (let i = 0; i < cw * ch; i++) lum[i] = (0.3 * p[i * 4] + 0.59 * p[i * 4 + 1] + 0.11 * p[i * 4 + 2]) / 255;
  const rand = seededRandom(3);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const i = y * cw + x, o = i * 4;
    if (!a[i]) { p[o + 3] = 0; continue; }
    // ink: the silhouette's edge, and strong edges inside it
    let edge = false;
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= cw || yy >= ch || !a[yy * cw + xx]) { edge = true; break; }
    }
    const gx = x > 0 && x < cw - 1 ? lum[i + 1] - lum[i - 1] : 0, gy = y > 0 && y < ch - 1 ? lum[i + cw] - lum[i - cw] : 0;
    if (keep && keep(p[o], p[o + 1], p[o + 2])) { p[o + 3] = 255; continue; }
    if (edge || Math.hypot(gx, gy) > 0.3) { p[o] = 18; p[o + 1] = 12; p[o + 2] = 8; p[o + 3] = 255; continue; }
    const L = Math.max(0.001, lum[i]);
    const band = Math.min(0.85, (Math.floor(Math.min(0.999, L) * bands) + 0.5) / bands * 0.95 * lift);
    const grain = 0.9 + rand() * 0.1;
    for (let k = 0; k < 3; k++) {
      const c = p[o + k] / 255, grey = L;
      const desat = grey + (c - grey) * sat;
      p[o + k] = Math.max(0, Math.min(255, desat * (band / L) * 255 * tint[k] * grain));
    }
    p[o + 3] = 255;
  }
  ctx.putImageData(d, 0, 0);
}
function paintStylized(opts) {
  return (ctx, img, cw, ch) => { paintGlowing(null)(ctx, img, cw, ch); stylizePainting(ctx, cw, ch, opts); };
}
// The accents: yellowed teeth; a pink-red eye.
const keepTeeth = (r, g, b) => r > 150 && g > 120 && b < 0.6 * g && r - b > 80;
const keepEye = (r, g, b) => r > 190 && g < 110 && b > 70;


const STYLE = {
  crookedMan: { bands: 5, sat: 0.55, lift: 1.18, keep: keepTeeth },
  jasper: { bands: 5, sat: 0.7, keep: keepEye },
  person: { bands: 6, sat: 0.65, lift: 1.1 },
};

// The paintings as cut-outs in the house, stylized (sizes are life-size,
// as for the furniture: the Crooked Man stands taller than a door).
Object.assign(SPRITES, {
  crookedMan: { size: [46, 94], draw: () => paintedTexture(256, 512, CHARACTER_ART.crookedMan, paintStylized(STYLE.crookedMan)) },
  crookedHost: { size: [46, 94], draw: () => paintedTexture(256, 512, CHARACTER_ART.crookedMan, paintStylized(STYLE.crookedMan)) },
  jasper: { size: [40, 35], draw: () => paintedTexture(256, 224, CHARACTER_ART.jasper, paintStylized(STYLE.jasper)) },
  patrini: { size: [18, 64], ghost: true, draw: () => paintedTexture(128, 456, CHARACTER_ART.joseph, paintFigure(BODIES.joseph, true)) },
  joseph: { size: [18, 64], draw: () => paintedTexture(128, 456, CHARACTER_ART.joseph, paintFigure(BODIES.joseph)) },
  gail: { size: [17, 57], draw: () => paintedTexture(128, 430, CHARACTER_ART.gail, paintFigure(BODIES.gail)) },
  sally: { size: [15, 44], draw: () => paintedTexture(128, 376, CHARACTER_ART.sally, paintFigure(BODIES.sally)) },
});

// A portrait for the foyer wall, from an official head-and-shoulders
// painting: on a dark ground, under old varnish.
function officialPortraitTexture(src) {
  return paintedTexture(96, 128, src, (ctx, img, cw, ch) => {
    const bg = ctx.createRadialGradient(cw / 2, ch * 0.4, 4, cw / 2, ch * 0.5, ch * 0.7);
    bg.addColorStop(0, '#3a3226'); bg.addColorStop(1, '#0e0c0a');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, cw, ch);
    const s = Math.min(cw / img.width, (ch - 6) / img.height) * 1.05;
    ctx.drawImage(img, (cw - img.width * s) / 2, ch - img.height * s, img.width * s, img.height * s);
    ctx.fillStyle = 'rgba(80,60,20,0.22)'; ctx.fillRect(0, 0, cw, ch);
  });
}

// The storm sky after the twist: churning green-grey cloud, as in the
// official painting of the house. Lower half fades out (the land is there).
function stormCloudTexture() {
  const [c, ctx] = artCanvas(512, 256);
  const rand = seededRandom(91);
  ctx.fillStyle = '#26302b'; ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 260; i++) {
    const x = rand() * 512, y = rand() * 150, r = 10 + rand() * 46, v = rand();
    const col = v < 0.5 ? `rgba(120,140,128,${(0.05 + rand() * 0.12).toFixed(3)})` : `rgba(14,20,17,${(0.08 + rand() * 0.16).toFixed(3)})`;
    ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, r * 1.8, r * 0.55, (rand() - 0.5) * 0.8, 0, Math.PI * 2); ctx.fill();
    if (x < 60) { ctx.beginPath(); ctx.ellipse(x + 512, y, r * 1.8, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }   // wrap round
  }
  const fade = ctx.createLinearGradient(0, 110, 0, 140);
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = fade; ctx.fillRect(0, 110, 512, 146);
  return artTexture(c);
}

// The moon: a pale disc with a soft halo.
function moonTexture() {
  const [c, ctx] = artCanvas(128, 128);
  const halo = ctx.createRadialGradient(64, 64, 14, 64, 64, 64);
  halo.addColorStop(0, 'rgba(240,250,240,0.5)'); halo.addColorStop(1, 'rgba(200,230,210,0)');
  ctx.fillStyle = halo; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#eef4ea'; ctx.beginPath(); ctx.arc(64, 64, 16, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(150,170,150,0.35)'; [[58, 60, 4], [70, 68, 3], [62, 72, 2.5]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); });
  return artTexture(c);
}


// ─── The lantern in your hand ─────────────────────────────────────────
// Drawn once, in the same inked style as the rest: your sleeve and hand
// reaching up from the bottom right, holding the lantern by its ring. The
// flame is drawn separately (heldFlameArt) so it can flicker and dim.
function heldLanternArt() {
  const [c, ctx] = artCanvas(400, 600);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = ART_INK; ctx.lineWidth = 5;
  const path = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(...pts[0]); pts.slice(1).forEach(p => p.length === 4 ? ctx.quadraticCurveTo(...p) : ctx.lineTo(...p)); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  // the sleeve: dark wool, a turned-back cuff
  path([[420, 610], [282, 236], [210, 250], [250, 330], [330, 610]], '#2a2420');
  ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 3;
  [[300, 610, 240, 330], [370, 610, 270, 300]].forEach(([a, b, x, y]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo(x + 20, y + 120, x, y); ctx.stroke(); });
  ctx.strokeStyle = ART_INK; ctx.lineWidth = 5;
  path([[200, 240], [292, 224], [306, 262], [214, 284]], '#3a3028');
  // the lantern's ring, held up, and its chain of light
  ctx.lineWidth = 6; ctx.strokeStyle = '#1a1612';
  ctx.beginPath(); ctx.ellipse(190, 178, 26, 20, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.stroke();
  ctx.lineWidth = 5; ctx.strokeStyle = ART_INK;
  // the cap: a little iron chimney and a cone
  path([[178, 196], [202, 196], [206, 214], [174, 214]], '#2a2622');
  path([[150, 250], [168, 214], [212, 214], [230, 250]], '#3a342c');
  // the frame and the glass (the glass is clear: the flame shows through)
  ctx.fillStyle = 'rgba(255,214,150,0.18)'; ctx.fillRect(152, 252, 76, 132);
  ctx.strokeStyle = '#2a2622'; ctx.lineWidth = 7;
  [[152, 252, 152, 384], [228, 252, 228, 384], [190, 252, 190, 384]].forEach(([a, b, x, y]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(x, y); ctx.stroke(); });
  ctx.strokeStyle = ART_INK; ctx.lineWidth = 5; ctx.strokeRect(152, 252, 76, 132);
  ctx.strokeStyle = 'rgba(255,240,210,0.35)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(160, 262); ctx.lineTo(160, 330); ctx.stroke();      // a glint on the glass
  ctx.strokeStyle = ART_INK; ctx.lineWidth = 5;
  // the base: the oil font
  path([[144, 384], [236, 384], [242, 404], [224, 424], [156, 424], [138, 404]], '#3a342c');
  ctx.fillStyle = '#5a4a30'; ctx.fillRect(150, 400, 80, 4);
  // the hand, closed round the ring
  path([[214, 158], [250, 150], [278, 170], [300, 232], [252, 256], [218, 236], [200, 196]], '#b89478');
  ctx.strokeStyle = 'rgba(60,30,20,0.55)'; ctx.lineWidth = 3;
  [[222, 176, 246, 172], [226, 196, 254, 192], [230, 214, 258, 212]].forEach(([a, b, x, y]) => { ctx.beginPath(); ctx.moveTo(a, b); ctx.quadraticCurveTo((a + x) / 2, b - 6, x, y); ctx.stroke(); });
  ctx.fillStyle = 'rgba(40,20,10,0.25)'; ctx.beginPath(); ctx.moveTo(262, 170); ctx.lineTo(300, 232); ctx.lineTo(268, 246); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = ART_INK; ctx.lineWidth = 5;
  path([[206, 186], [192, 166], [204, 154], [222, 166]], '#c8a488');   // the thumb over the ring
  return c.toDataURL();
}
// The flame and its glow, drawn on their own so they can flicker.
function heldFlameArt() {
  const [c, ctx] = artCanvas(160, 220);
  const g = ctx.createRadialGradient(80, 140, 4, 80, 130, 80);
  g.addColorStop(0, 'rgba(255,230,170,0.95)'); g.addColorStop(0.35, 'rgba(255,170,80,0.45)'); g.addColorStop(1, 'rgba(255,140,60,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 160, 220);
  const f = ctx.createLinearGradient(0, 100, 0, 160);
  f.addColorStop(0, '#fff6d8'); f.addColorStop(1, '#ffb050');
  ctx.fillStyle = f; ctx.beginPath(); ctx.moveTo(80, 96); ctx.quadraticCurveTo(96, 132, 88, 152); ctx.quadraticCurveTo(80, 162, 72, 152); ctx.quadraticCurveTo(64, 132, 80, 96); ctx.fill();
  return c.toDataURL();
}


// A cobweb, spun across a corner: threads from the corner (bottom middle
// of the picture is the corner's lowest point) and the spiral between.
function cobwebTexture() {
  const [c, ctx] = artCanvas(128, 128);
  ctx.strokeStyle = 'rgba(220,215,200,0.55)'; ctx.lineWidth = 1;
  const ox = 64, oy = 4;        // where the threads meet (the top corner)
  const rand = seededRandom(74);
  const spokes = [];
  for (let i = 0; i <= 7; i++) { const a = Math.PI * (0.1 + i / 7 * 0.8); spokes.push(a); ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + Math.cos(a) * 140, oy + Math.sin(a) * 140); ctx.stroke(); }
  for (let r = 14; r < 130; r += 10 + rand() * 6) {
    ctx.beginPath();
    spokes.forEach((a, i) => { const rr = r + (rand() - 0.5) * 4, x = ox + Math.cos(a) * rr, y = oy + Math.sin(a) * rr; i ? ctx.quadraticCurveTo(ox + Math.cos(a - 0.06) * rr * 0.96, oy + Math.sin(a - 0.06) * rr * 0.96, x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200,195,180,0.12)'; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(0, 128); ctx.lineTo(128, 128); ctx.closePath(); ctx.fill();
  return artTexture(c);
}

// A worn rug: a border, a faded field, a medallion; round or oblong. An
// oblong one is drawn at its own proportions (`aspect`, length over
// width), as a runner: a row of medallions down its length.
function rugTexture(base, round, aspect = 1) {
  const W = 256, H = Math.round(256 * clamp(aspect, 1, 3));
  const [c, ctx] = artCanvas(W, H);
  const rand = seededRandom(base.charCodeAt(2) * 3 + (round ? 1 : 0));
  ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
  const ring = (inset, col, wdt) => { ctx.strokeStyle = col; ctx.lineWidth = wdt; if (round) { ctx.beginPath(); ctx.arc(128, 128, 128 - inset, 0, Math.PI * 2); ctx.stroke(); } else ctx.strokeRect(inset, inset, W - inset * 2, H - inset * 2); };
  ring(10, 'rgba(160,120,60,0.45)', 6); ring(22, 'rgba(20,12,8,0.5)', 10); ring(34, 'rgba(160,120,60,0.3)', 3);
  const medallion = (cx, cy, r) => {
    ctx.fillStyle = 'rgba(150,110,60,0.28)';
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.75, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r * 0.75, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(20,12,8,0.35)'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2); ctx.fill();
  };
  const n = Math.max(1, Math.round(H / W));
  for (let i = 0; i < n; i++) medallion(W / 2, H * (i + 0.5) / n, Math.min(64, H / n * 0.3));
  artGrime(ctx, W, H, rand, 1.4);
  if (round) { ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(128, 128, 127, 0, Math.PI * 2); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  const tex = artTexture(c);
  return withPhoto(tex, 'velour_velvet', (cx, img, w, h) => photoGrime(cx, img, 0, 0, w, h, 0.35));
}
