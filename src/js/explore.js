// Explorable 3D places: walk through a floor plan by lantern light.
//
// The first (and so far only) one is the Crooked House's first floor. The
// floor plan art becomes the ground, its walls are raised from traced
// centrelines (src/data/explore.json), and the visitor carries a lantern
// through the dark rooms. Everything else is light and weather: a few
// fixed lights (chandelier, fire, oven), a storm outside with rain and
// lightning, dust in the lantern light. Walking into a room shows its
// description; glints mark things worth a closer look.
//
// Opened from lore with {{explore:crooked_house|Some text}} (see build.js),
// which becomes a button calling openExplore('crooked_house').
//
// three.js isn't part of the page: docs/vendor/three-explore.min.js (a
// trimmed build holding only the parts used here, see the README) is
// fetched the first time someone opens a place, so the map itself loads
// exactly as before.
//
// Coordinates: everything in explore.json is in the floor image's pixels,
// x right and y down. In the 3D scene that's x and z, with y up — one image
// pixel is one scene unit, so a 5ft square on the plan is roughly 60 units.
//
// Part of the site script: build.js concatenates src/js/*.js (in the
// order listed in build.js) after the data constants, into one <script>.

const EXPLORE_THREE_SRC = 'vendor/three-explore.min.js';
const EXPLORE_GRID = 4;            // walkability grid cell, in image pixels
const EXPLORE_BODY_RADIUS = 9;     // how close the lantern-bearer gets to walls
const EXPLORE_WALK_SPEED = 135;    // image pixels per second
const EXPLORE_LANTERN_HEIGHT = 36;
const EXPLORE_POI_RANGE = 85;      // how near a point of interest has to be to inspect it
const EXPLORE_SOUND_STORAGE_KEY = 'druskenvald_explore_sound';

let exploreThreePromise = null;
let explore = null; // the open view's state, or null

function isExploreOpen() { return !!explore; }

function loadExploreThree() {
  if (!exploreThreePromise) {
    exploreThreePromise = import(new URL(EXPLORE_THREE_SRC, document.baseURI).href)
      .catch(err => { exploreThreePromise = null; throw err; });
  }
  return exploreThreePromise;
}

// ─── Small geometry helpers ───────────────────────────────────────────

function explorePointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function explorePolyCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : pts[0];
}

// The house has "not a single right angle": every wall top leans a little,
// by an amount that depends only on where it is (so joined walls agree).
function exploreWallLean(x, z) {
  return [
    Math.sin(x * 0.013 + z * 0.007) * 4 + Math.sin(z * 0.031) * 1.5,
    Math.cos(z * 0.011 - x * 0.005) * 4 + Math.sin(x * 0.027) * 1.5,
  ];
}

// ─── The walkability grid ─────────────────────────────────────────────
// Rasterised once: the walkable areas filled in, then every wall stroked
// out again, widened by the bearer's radius so the lantern never clips
// into one. The same grid drives collisions and click-to-walk paths.

function exploreBuildGrid(floor) {
  const cols = Math.ceil(floor.width / EXPLORE_GRID), rows = Math.ceil(floor.height / EXPLORE_GRID);
  const c = document.createElement('canvas');
  c.width = cols; c.height = rows;
  const ctx = c.getContext('2d');
  ctx.scale(1 / EXPLORE_GRID, 1 / EXPLORE_GRID);
  ctx.fillStyle = '#fff';
  floor.walkable.forEach(area => {
    ctx.beginPath();
    area.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  floor.walls.forEach(w => {
    ctx.lineWidth = exploreWallThickness(w) + EXPLORE_BODY_RADIUS * 2;
    ctx.beginPath();
    w.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  });
  const data = ctx.getImageData(0, 0, cols, rows).data;
  const grid = new Uint8Array(cols * rows);
  for (let i = 0; i < grid.length; i++) grid[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return { cols, rows, cells: grid };
}

function exploreWallThickness(w) { return w.glass ? 8 : (w.outer ? 15 : 13); }

function exploreWalkable(grid, x, y) {
  const cx = Math.floor(x / EXPLORE_GRID), cy = Math.floor(y / EXPLORE_GRID);
  if (cx < 0 || cy < 0 || cx >= grid.cols || cy >= grid.rows) return false;
  return grid.cells[cy * grid.cols + cx] === 1;
}

// Nearest walkable cell to (x, y), searching outward a little — so a click
// on a table or just inside a wall still walks to the spot next to it.
function exploreNearestWalkable(grid, x, y, maxR = 40) {
  if (exploreWalkable(grid, x, y)) return [x, y];
  for (let r = EXPLORE_GRID; r <= maxR; r += EXPLORE_GRID) {
    for (let a = 0; a < 16; a++) {
      const px = x + Math.cos(a / 16 * Math.PI * 2) * r, py = y + Math.sin(a / 16 * Math.PI * 2) * r;
      if (exploreWalkable(grid, px, py)) return [px, py];
    }
  }
  return null;
}

function exploreLineClear(grid, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!exploreWalkable(grid, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false;
  }
  return true;
}

// A* over the grid (8 directions), then pulled taut: each waypoint skips
// ahead to the furthest later one it can see in a straight line.
function exploreFindPath(grid, sx, sy, tx, ty) {
  const { cols, rows, cells } = grid;
  const start = Math.floor(sy / EXPLORE_GRID) * cols + Math.floor(sx / EXPLORE_GRID);
  const goal = Math.floor(ty / EXPLORE_GRID) * cols + Math.floor(tx / EXPLORE_GRID);
  if (!cells[goal]) return null;
  const g = new Float32Array(cols * rows).fill(Infinity);
  const from = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const gx = goal % cols, gy = Math.floor(goal / cols);
  const h = i => { const dx = Math.abs(i % cols - gx), dy = Math.abs(Math.floor(i / cols) - gy); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); };
  const heap = [[h(start), start]];
  const push = item => { heap.push(item); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  g[start] = 0;
  const dirs = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false;
  while (heap.length) {
    const [, cur] = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    const cx = cur % cols, cy = Math.floor(cur / cols);
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (!cells[n] || closed[n]) continue;
      // No cutting corners diagonally past a wall.
      if (dx && dy && (!cells[cy * cols + nx] || !cells[ny * cols + cx])) continue;
      const ng = g[cur] + cost;
      if (ng < g[n]) { g[n] = ng; from[n] = cur; push([ng + h(n), n]); }
    }
  }
  if (!found) return null;
  const raw = [];
  for (let i = goal; i !== -1 && i !== start; i = from[i]) {
    raw.push([(i % cols + 0.5) * EXPLORE_GRID, (Math.floor(i / cols) + 0.5) * EXPLORE_GRID]);
  }
  raw.reverse();
  raw[raw.length - 1] = [tx, ty];
  const path = [];
  let px = sx, py = sy, i = 0;
  while (i < raw.length) {
    let j = raw.length - 1;
    while (j > i && !exploreLineClear(grid, px, py, raw[j][0], raw[j][1])) j--;
    path.push(raw[j]);
    [px, py] = raw[j];
    i = j + 1;
  }
  return path;
}

// ─── Textures drawn on canvases ───────────────────────────────────────

function exploreGlowTexture(THREE, rgb, size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${rgb},1)`);
  g.addColorStop(0.25, `rgba(${rgb},0.55)`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A small four-pointed sparkle for things worth a closer look.
function exploreSparkleTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 14);
  g.addColorStop(0, 'rgba(255,240,200,1)');
  g.addColorStop(1, 'rgba(255,210,130,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = 'rgba(255,232,180,0.9)';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 ? 3 : 30, a = i * Math.PI / 4;
    ctx.lineTo(32 + Math.sin(a) * r, 32 - Math.cos(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Old plaster over dark boards: mottled, streaked with damp, darker towards
// the floor. Drawn with a fixed seed so it's the same every visit.
function exploreWallTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const rand = seededRandom(31);
  ctx.fillStyle = '#3a312a';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const v = rand() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${(rand() * 0.05).toFixed(3)})`;
    ctx.fillRect(rand() * 256, rand() * 256, 2 + rand() * 18, 2 + rand() * 18);
  }
  for (let i = 0; i < 70; i++) {
    const x = rand() * 256;
    ctx.fillStyle = `rgba(10,6,4,${(0.05 + rand() * 0.12).toFixed(3)})`;
    ctx.fillRect(x, rand() * 80, 1 + rand() * 3, 60 + rand() * 200);
  }
  const skirting = ctx.createLinearGradient(0, 180, 0, 256);
  skirting.addColorStop(0, 'rgba(12,8,6,0)');
  skirting.addColorStop(0.55, 'rgba(12,8,6,0.55)');
  skirting.addColorStop(1, 'rgba(8,5,4,0.85)');
  ctx.fillStyle = skirting;
  ctx.fillRect(0, 180, 256, 76);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, 0, 256, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

// Where the house has a roof: 1 inside, a little under the conservatory's
// glass, 0 outdoors. Keeps the rain outside and decides how much of each
// lightning flash reaches the floor.
function exploreRoofMask(THREE, floor) {
  const c = document.createElement('canvas');
  const s = 512 / floor.width;
  c.width = 512; c.height = Math.round(floor.height * s);
  const ctx = c.getContext('2d');
  ctx.scale(s, s);
  const fill = (pts, colour) => {
    ctx.fillStyle = colour;
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fill();
  };
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, floor.width, floor.height);
  fill(floor.walkable[0].points, '#fff');
  floor.rooms.filter(r => r.glassRoof).forEach(r => fill(r.points, 'rgb(90,90,90)'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// The Crooked Man as a shape glimpsed at the end of the hall: a tall,
// stooped black figure with an axe.
function exploreCrookedManTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const ctx = c.getContext('2d');
  // A cold, faint outline so the black shape reads against a dark floor.
  ctx.shadowColor = 'rgba(170,195,255,0.95)';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#050304';
  ctx.beginPath();
  ctx.ellipse(70, 34, 13, 17, 0.35, 0, Math.PI * 2);              // head
  ctx.fill();
  ctx.beginPath();                                                   // hat
  ctx.moveTo(52, 22); ctx.lineTo(90, 14); ctx.lineTo(84, 0); ctx.lineTo(62, 6); ctx.closePath();
  ctx.fill();
  ctx.beginPath();                                                   // body and coat
  ctx.moveTo(56, 48); ctx.quadraticCurveTo(40, 120, 46, 200);
  ctx.lineTo(34, 252); ctx.lineTo(58, 252); ctx.lineTo(64, 206);
  ctx.lineTo(74, 252); ctx.lineTo(96, 252); ctx.lineTo(84, 196);
  ctx.quadraticCurveTo(94, 120, 82, 50); ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.strokeStyle = '#050304';
  ctx.beginPath(); ctx.moveTo(80, 60); ctx.lineTo(108, 118); ctx.lineTo(112, 150); ctx.stroke(); // arm
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(112, 150); ctx.lineTo(96, 40); ctx.stroke();                       // axe haft
  ctx.beginPath(); ctx.moveTo(96, 40); ctx.lineTo(122, 30); ctx.lineTo(120, 64); ctx.closePath(); ctx.fill(); // axe head
  ctx.shadowColor = 'rgba(255,240,200,1)';
  ctx.fillStyle = '#f2e6c4';
  ctx.beginPath(); ctx.arc(74, 34, 2, 0, Math.PI * 2); ctx.fill();   // eyes
  ctx.beginPath(); ctx.arc(81, 31, 2, 0, Math.PI * 2); ctx.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ─── Building the scene ───────────────────────────────────────────────

// Walls standing between the camera and the lantern drop to a low stub so
// they never hide the bearer — a band along the line from the lantern back
// towards the camera, measured on the ground. (Only what's drawn changes:
// the walls' shadows, and collisions, are unaffected.)
function exploreCutaway(material, uniforms) {
  material.onBeforeCompile = shader => {
    shader.uniforms.cutLantern = uniforms.lantern;
    shader.uniforms.cutEye = uniforms.eye;
    shader.vertexShader = 'varying vec3 vCutPos;\n' + shader.vertexShader.replace(
      '#include <worldpos_vertex>',
      '#include <worldpos_vertex>\n  vCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vCutPos;\nuniform vec3 cutLantern;\nuniform vec3 cutEye;\n' + shader.fragmentShader.replace(
      'void main() {',
      `void main() {
  {
    vec2 a = cutLantern.xz, b = cutEye.xz, p = vCutPos.xz;
    vec2 ab = b - a;
    float k = clamp(dot(p - a, ab) / max(dot(ab, ab), 1.0), 0.0, 1.0);
    float band = distance(p, a + ab * k);
    if (k > 0.0 && band < 60.0 + 40.0 * k && vCutPos.y > 9.0) discard;
  }`);
  };
}

// Each wall segment becomes a leaning slab; the segment is lengthened by
// half the wall's thickness at both ends so joined segments overlap
// rather than leaving notches at the corners.
function exploreWallGeometry(THREE, walls, height) {
  const pos = [], uv = [];
  const sides = [], tops = [];
  const quad = (target, a, b, c, d, ua, ub, va = 0, vb = 1) => {
    target.push([a, b, c, d, ua, ub, va, vb]);
  };
  walls.forEach(w => {
    const t = exploreWallThickness(w), h = w.glass ? 14 : height;
    let along = 0;
    for (let i = 0; i < w.points.length - 1; i++) {
      const [ax, az] = w.points[i], [bx, bz] = w.points[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 0.5) continue;
      const ux = (bx - ax) / len, uz = (bz - az) / len, nx = -uz * t / 2, nz = ux * t / 2;
      const e = t / 2;
      const a0 = [ax - ux * e, az - uz * e], b0 = [bx + ux * e, bz + uz * e];
      const base = (p, s) => [p[0] + nx * s, 0, p[1] + nz * s];
      const top = (p, s) => { const l = exploreWallLean(p[0], p[1]); return [p[0] + nx * s + l[0] * h / height, h, p[1] + nz * s + l[1] * h / height]; };
      const A1 = base(a0, 1), A2 = base(a0, -1), B1 = base(b0, 1), B2 = base(b0, -1);
      const A1t = top(a0, 1), A2t = top(a0, -1), B1t = top(b0, 1), B2t = top(b0, -1);
      const u0 = along / 96, u1 = (along + len + t) / 96;
      quad(sides, A1, B1, B1t, A1t, u0, u1);
      quad(sides, B2, A2, A2t, B2t, u0, u1);
      quad(sides, A2, A1, A1t, A2t, 0, t / 96);
      quad(sides, B1, B2, B2t, B1t, 0, t / 96);
      quad(tops, A1t, B1t, B2t, A2t, 0, 1, 0, 1);
      along += len;
    }
  });
  const emit = q => {
    for (const [a, b, c, d, ua, ub, va, vb] of q) {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
    }
  };
  emit(sides);
  const sideCount = sides.length * 6;
  emit(tops);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.computeVertexNormals();
  geo.addGroup(0, sideCount, 0);
  geo.addGroup(sideCount, tops.length * 6, 1);
  return geo;
}

function exploreGlassGeometry(THREE, walls, height) {
  const pos = [];
  walls.filter(w => w.glass).forEach(w => {
    for (let i = 0; i < w.points.length - 1; i++) {
      const [ax, az] = w.points[i], [bx, bz] = w.points[i + 1];
      const la = exploreWallLean(ax, az), lb = exploreWallLean(bx, bz);
      pos.push(ax, 14, az, bx, 14, bz, bx + lb[0], height, bz + lb[1],
               ax, 14, az, bx + lb[0], height, bz + lb[1], ax + la[0], height, az + la[1]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

// Windows: a pale pane on both faces of the nearest wall, which brightens
// when lightning flashes outside.
function exploreWindowGeometry(THREE, floor) {
  const pos = [];
  const segs = [];
  floor.walls.forEach(w => { for (let i = 0; i < w.points.length - 1; i++) segs.push([w.points[i], w.points[i + 1], exploreWallThickness(w)]); });
  floor.windows.forEach(win => {
    let best = null, bestD = Infinity;
    for (const [a, b, t] of segs) {
      const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
      const k = clamp01(((win.x - a[0]) * dx + (win.y - a[1]) * dz) / l2);
      const d = Math.hypot(a[0] + dx * k - win.x, a[1] + dz * k - win.y);
      if (d < bestD) { bestD = d; best = { a, b, t, x: a[0] + dx * k, z: a[1] + dz * k }; }
    }
    if (!best) return;
    const len = Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1]);
    const ux = (best.b[0] - best.a[0]) / len, uz = (best.b[1] - best.a[1]) / len;
    const half = (win.w || 30) / 2, y0 = 26, y1 = 52;
    for (const s of [1, -1]) {
      const off = best.t / 2 + 0.8;
      const cx = best.x - uz * off * s, cz = best.z + ux * off * s;
      const p = (k, y) => [cx + ux * k, y, cz + uz * k];
      pos.push(...p(-half, y0), ...p(half, y0), ...p(half, y1), ...p(-half, y0), ...p(half, y1), ...p(-half, y1));
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geo;
}

// Rain: streaks that live in a box around the camera's target and wrap
// round it as it moves (so a fixed number of drops always fills the view),
// and that vanish wherever the house has a roof.
function exploreRain(THREE, floor, roofMask, count) {
  const seeds = new Float32Array(count * 2 * 4), tips = new Float32Array(count * 2);
  const rand = seededRandom(77);
  for (let i = 0; i < count; i++) {
    const s = [rand(), rand(), rand(), rand()];
    for (let k = 0; k < 2; k++) { seeds.set(s, (i * 2 + k) * 4); tips[i * 2 + k] = k; }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('tip', new THREE.BufferAttribute(tips, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: {
      time: { value: 0 }, center: { value: new THREE.Vector3() }, flash: { value: 0 },
      roofMask: { value: roofMask }, size: { value: new THREE.Vector2(floor.width, floor.height) },
    },
    vertexShader: `
      attribute vec4 seed; attribute float tip;
      uniform float time; uniform vec3 center; uniform float flash;
      uniform sampler2D roofMask; uniform vec2 size;
      varying float vAlpha;
      void main() {
        const float span = 1100.0, fall = 380.0;
        float speed = 520.0 + seed.w * 200.0;
        float y = fall * (1.0 - fract(time * speed / fall + seed.z));
        vec2 xz = center.xz + (fract((seed.xy * span - center.xz) / span + 0.5) - 0.5) * span;
        xz.x += y * 0.22 + tip * 5.0;
        y += tip * 24.0;
        vec2 uv = vec2(xz.x / size.x, 1.0 - xz.y / size.y);
        float roof = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(roofMask, uv).r : 0.0;
        vAlpha = (1.0 - step(0.08, roof)) * (0.16 + flash * 0.5) * (0.35 + 0.65 * tip);
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, y, xz.y, 1.0);
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() { gl_FragColor = vec4(0.72, 0.8, 0.92, vAlpha); }`,
  });
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false;
  return rain;
}

// Dust motes hanging in the air, only visible near the lantern.
function exploreDust(THREE, count) {
  const seeds = new Float32Array(count * 4);
  const rand = seededRandom(5);
  for (let i = 0; i < seeds.length; i++) seeds[i] = rand();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, lantern: { value: new THREE.Vector3() }, scale: { value: 1 } },
    vertexShader: `
      attribute vec4 seed;
      uniform float time; uniform vec3 lantern; uniform float scale;
      varying float vAlpha;
      void main() {
        const float span = 300.0;
        vec3 p = vec3(seed.x, seed.y, seed.z) * span;
        p += vec3(sin(time * 0.21 + seed.w * 40.0), sin(time * 0.13 + seed.x * 30.0) * 0.6, cos(time * 0.17 + seed.y * 50.0)) * 14.0;
        p.y = mod(p.y - time * 3.0, 110.0) + 4.0;
        p.xz = lantern.xz + (fract((p.xz - lantern.xz) / span + 0.5) - 0.5) * span;
        float d = distance(p, lantern);
        vAlpha = smoothstep(150.0, 15.0, d) * (0.35 + 0.65 * fract(seed.w * 7.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = scale * (1.2 + seed.w * 2.2) * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(1.0, 0.82, 0.55, vAlpha * smoothstep(0.5, 0.0, r));
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

// ─── Sound: rain and thunder, made on the fly ─────────────────────────
// No sound files: filtered noise for the rain, a low swept rumble for each
// thunderclap. Off when the visitor has muted the site's music.

function exploreAudio() {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  let ctx;
  try { ctx = new Ctx(); } catch { return null; }
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const ch = noise.getChannelData(0);
  let last = 0;
  for (let i = 0; i < ch.length; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = w * 0.6 + last * 3; }
  const rain = ctx.createBufferSource();
  rain.buffer = noise; rain.loop = true;
  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'bandpass'; rainFilter.frequency.value = 1400; rainFilter.Q.value = 0.4;
  const rainGain = ctx.createGain();
  rainGain.gain.value = 0.14;
  rain.connect(rainFilter).connect(rainGain).connect(master);
  rain.start();
  return {
    ctx, master, noise,
    setOn(on) {
      if (on && ctx.state === 'suspended') ctx.resume();
      master.gain.setTargetAtTime(on ? 0.6 : 0, ctx.currentTime, 0.4);
    },
    thunder(strength) {
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noise;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(260 + strength * 500, t);
      lp.frequency.exponentialRampToValueAtTime(70, t + 2.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.9 * strength, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.25 * strength, t + 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      src.connect(lp).connect(g).connect(master);
      src.start(t, Math.random());
      src.stop(t + 3.6);
    },
    close() { try { rain.stop(); ctx.close(); } catch { /* already closed */ } },
  };
}

// ─── The overlay's controls ───────────────────────────────────────────

function exploreBuildUi(place, floor) {
  const root = document.createElement('div');
  root.id = 'explore';
  root.className = 'explore';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', `${place.title}, ${floor.name}`);
  root.tabIndex = -1;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  root.innerHTML = `
    <canvas class="explore-canvas" aria-hidden="true"></canvas>
    <div class="explore-top">
      <button type="button" class="explore-btn explore-leave">↩ Leave the house</button>
      <div class="explore-heading"><span class="explore-place">${escAttr(place.title)}</span><span class="explore-floor">${escAttr(floor.name)}</span></div>
      <div class="explore-top-right">
        <button type="button" class="explore-btn explore-rooms-btn" aria-expanded="false" aria-controls="explore-rooms">Rooms</button>
        <button type="button" class="explore-btn explore-sound" aria-pressed="true" title="Rain and thunder">🔊</button>
      </div>
    </div>
    <div class="explore-rooms" id="explore-rooms" hidden></div>
    <div class="explore-banner" aria-live="polite"></div>
    <button type="button" class="explore-prompt" hidden></button>
    <div class="explore-card" hidden>
      <button type="button" class="explore-card-close" aria-label="Close">×</button>
      <h3 class="explore-card-title"></h3>
      <p class="explore-card-text"></p>
    </div>
    <div class="explore-help">${touch
      ? 'Drag to look around · Tap the floor to walk · Pinch to zoom · Tap a glint to inspect it'
      : 'Click the floor to walk, or use WASD · Drag or Q/E to turn · Scroll to zoom · Enter to inspect'}</div>
    <div class="explore-loading"><span>Entering the house…</span></div>`;
  const rooms = root.querySelector('.explore-rooms');
  floor.rooms.forEach(r => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'explore-room-link';
    b.dataset.room = r.id;
    b.textContent = r.name;
    rooms.appendChild(b);
  });
  return root;
}

// ─── Opening and closing ──────────────────────────────────────────────

async function openExplore(placeId, floorId) {
  if (explore) return;
  const place = (typeof EXPLORE_PLACES !== 'undefined') && EXPLORE_PLACES[placeId];
  if (!place) return;
  const floor = place.floors.find(f => f.id === floorId) || place.floors[0];
  const ui = exploreBuildUi(place, floor);
  document.body.appendChild(ui);
  document.body.classList.add('exploring');
  const app = document.getElementById('app');
  if (app) app.inert = true;
  const state = explore = {
    placeId, place, floor, ui, opener: document.activeElement, raf: 0, disposed: false,
    listeners: [],
  };
  history.pushState({ ...(history.state || {}), explore: placeId }, '', location.href);
  exploreListen(window, 'popstate', () => { if (explore === state) exploreTeardown(); });
  ui.querySelector('.explore-leave').addEventListener('click', closeExplore);
  ui.focus({ preventScroll: true });

  let THREE;
  try {
    THREE = await loadExploreThree();
  } catch (err) {
    exploreFail(state, 'The house could not be loaded. Check your connection and try again.');
    return;
  }
  if (explore !== state) return;
  try {
    await exploreSetup(THREE, state);
  } catch (err) {
    console.error(err);
    exploreFail(state, 'Your browser could not draw the house in 3D (WebGL is unavailable or turned off).');
  }
}

function exploreFail(state, message) {
  if (explore !== state) return;
  const loading = state.ui.querySelector('.explore-loading');
  loading.innerHTML = `<span>${escAttr(message)}</span>`;
  loading.classList.add('failed');
}

// Closes at once, then steps back past the history entry opening it added
// (so Back afterwards leaves the panel, not a closed house). Tearing down
// first means a second quick Escape can't step back twice.
function closeExplore() {
  if (!explore) return;
  const pushed = history.state && history.state.explore === explore.placeId;
  exploreTeardown();
  if (pushed) history.back();
}

function exploreListen(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  explore.listeners.push(() => target.removeEventListener(type, fn, opts));
}

function exploreTeardown() {
  const state = explore;
  if (!state) return;
  explore = null;
  state.disposed = true;
  cancelAnimationFrame(state.raf);
  state.listeners.forEach(off => off());
  if (state.audio) state.audio.close();
  if (state.scene) {
    state.scene.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      const mats = Array.isArray(obj.material) ? obj.material : (obj.material ? [obj.material] : []);
      mats.forEach(m => { Object.values(m).forEach(v => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
  }
  if (state.renderer) { state.renderer.dispose(); state.renderer.forceContextLoss(); }
  state.ui.remove();
  document.body.classList.remove('exploring');
  const app = document.getElementById('app');
  if (app) app.inert = false;
  if (state.opener && state.opener.isConnected) state.opener.focus({ preventScroll: true });
}

// ─── The scene and its loop ───────────────────────────────────────────

async function exploreSetup(THREE, state) {
  const { floor, ui } = state;
  const canvas = ui.querySelector('.explore-canvas');
  const low = typeof lightingQuality !== 'undefined' && lightingQuality === 'low';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !low, powerPreference: 'high-performance' });
  state.renderer = renderer;
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, low ? 1 : 1.75);
  renderer.setPixelRatio(state.pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  state.scene = scene;
  scene.background = new THREE.Color(0x050407);
  scene.fog = new THREE.FogExp2(0x050407, 0.00075);
  const camera = new THREE.PerspectiveCamera(40, 1, 5, 5000);
  state.camera = camera;

  const floorTex = await new THREE.TextureLoader().loadAsync(floor.image);
  if (state.disposed) return;
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const roofMask = exploreRoofMask(THREE, floor);

  // The floor plan itself as the ground. Lightning lights it as an
  // emissive flash, held back (in the shader) wherever there's a roof.
  const flash = { value: 0 };
  state.flash = flash;
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.92, metalness: 0, emissive: 0xc8d4ff, emissiveMap: floorTex, emissiveIntensity: 1 });
  floorMat.onBeforeCompile = shader => {
    shader.uniforms.roofMask = { value: roofMask };
    shader.uniforms.flash = flash;
    shader.fragmentShader = 'uniform sampler2D roofMask;\nuniform float flash;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n  totalEmissiveRadiance *= flash * (1.0 - 0.92 * texture2D(roofMask, vMapUv).r);');
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(floor.width, floor.height), floorMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(floor.width / 2, 0, floor.height / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const wallTex = exploreWallTexture(THREE);
  const cutaway = { lantern: { value: new THREE.Vector3() }, eye: { value: new THREE.Vector3() } };
  state.cutaway = cutaway;
  const wallMats = [
    new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.95, metalness: 0, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x0c0a09, roughness: 1, metalness: 0, side: THREE.DoubleSide }),
  ];
  wallMats.forEach(m => exploreCutaway(m, cutaway));
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x8fb2c8, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  exploreCutaway(glassMat, cutaway);
  const walls = new THREE.Mesh(exploreWallGeometry(THREE, floor.walls, floor.wallHeight), wallMats);
  walls.castShadow = true;
  walls.receiveShadow = true;
  scene.add(walls);

  const glass = new THREE.Mesh(exploreGlassGeometry(THREE, floor.walls, floor.wallHeight), glassMat);
  scene.add(glass);

  const windowMat = new THREE.MeshBasicMaterial({ color: 0x9fb6dc, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  state.windowMat = windowMat;
  scene.add(new THREE.Mesh(exploreWindowGeometry(THREE, floor), windowMat));

  // Light. A faint, cold fill so the dark isn't flat black; the house's
  // own few lights; the lantern; and the lightning.
  const ambient = new THREE.HemisphereLight(0x5a6a8c, 0x0b0806, 0.32);
  state.ambient = ambient;
  scene.add(ambient);

  state.fixedLights = floor.lights.map((l, i) => {
    const light = new THREE.PointLight(l.color, 0, l.distance, 1.4);
    light.position.set(l.x, l.h, l.y);
    light.userData = { base: l.intensity * 900, flicker: l.flicker || 0, phase: i * 1.7 };
    if (l.shadow && !low) {
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 2;
      light.shadow.camera.far = l.distance;
      light.shadow.bias = -0.004;
      light.shadow.autoUpdate = false; // the walls never move: drawn once
      light.shadow.needsUpdate = true;
    }
    scene.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: exploreGlowTexture(THREE, '255,236,200'), color: l.color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(l.id === 'chandelier' ? 70 : 34);
    glow.position.copy(light.position);
    scene.add(glow);
    return light;
  });

  const lantern = new THREE.Group();
  const lanternLight = new THREE.PointLight(0xffaa5c, 1100, 520, 1.4);
  lanternLight.castShadow = true;
  lanternLight.shadow.mapSize.set(low ? 256 : 512, low ? 256 : 512);
  lanternLight.shadow.camera.near = 2;
  lanternLight.shadow.camera.far = 520;
  lanternLight.shadow.bias = -0.004;
  lantern.add(lanternLight);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
  lantern.add(flame);
  const pane = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 9, 6, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  lantern.add(pane);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1d1712, roughness: 0.55, metalness: 0.7 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 5.6, 4, 6), iron);
  cap.position.y = 6.5;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1.6, 6), iron);
  base.position.y = -5.3;
  lantern.add(cap, base);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: exploreGlowTexture(THREE, '255,190,120'), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.scale.setScalar(46);
  lantern.add(halo);
  scene.add(lantern);
  state.lantern = lantern;
  state.lanternLight = lanternLight;

  const lightning = new THREE.DirectionalLight(0xc8d4ff, 0);
  lightning.position.set(floor.width * 0.3, 900, floor.height * 1.1);
  lightning.target.position.set(floor.width / 2, 0, floor.height / 2);
  scene.add(lightning, lightning.target);
  state.lightning = lightning;

  state.rain = exploreRain(THREE, floor, roofMask, low ? 500 : 1400);
  scene.add(state.rain);
  if (!low) {
    state.dust = exploreDust(THREE, 160);
    scene.add(state.dust);
  }

  // Glints marking the points of interest.
  const glintTex = exploreSparkleTexture(THREE);
  state.glints = floor.pois.map(p => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    s.scale.setScalar(20);
    s.position.set(p.x, 16, p.y);
    s.userData.poi = p;
    scene.add(s);
    return s;
  });

  const man = new THREE.Sprite(new THREE.SpriteMaterial({ map: exploreCrookedManTexture(THREE), transparent: true, opacity: 0, depthWrite: false }));
  man.scale.set(58, 116, 1);
  man.center.set(0.5, 0);
  man.visible = false;
  scene.add(man);
  state.crookedMan = man;

  // Where the bearer is and where the camera looks from.
  state.grid = exploreBuildGrid(floor);
  state.pos = { x: floor.start.x, y: floor.start.y };
  state.view = { yaw: floor.start.facing || 0, pitch: 0.98, dist: window.innerWidth < window.innerHeight ? 640 : 520, tx: state.pos.x, ty: state.pos.y };
  state.keys = new Set();
  state.path = null;
  state.room = null;
  state.seenRooms = new Set();
  state.inspected = new Set();
  state.firedEvents = new Set();
  state.time = 0;
  state.nextStrike = 3;
  state.strikes = [];
  state.frameCost = { sum: 0, n: 0 };
  state.walkTime = 0;

  state.audio = exploreAudio();
  const soundBtn = ui.querySelector('.explore-sound');
  const savedSound = store.get(EXPLORE_SOUND_STORAGE_KEY);
  state.soundOn = savedSound ? savedSound === 'on' : !(typeof musicMuted !== 'undefined' && musicMuted);
  const applySound = () => {
    soundBtn.textContent = state.soundOn ? '🔊' : '🔇';
    soundBtn.setAttribute('aria-pressed', String(state.soundOn));
    soundBtn.title = state.soundOn ? 'Rain and thunder: on' : 'Rain and thunder: off';
    if (state.audio) state.audio.setOn(state.soundOn);
  };
  soundBtn.addEventListener('click', () => {
    state.soundOn = !state.soundOn;
    store.set(EXPLORE_SOUND_STORAGE_KEY, state.soundOn ? 'on' : 'off');
    applySound();
  });
  applySound();

  exploreWireInput(THREE, state);
  exploreResize(state);
  exploreListen(window, 'resize', () => exploreResize(state));

  ui.querySelector('.explore-loading').classList.add('done');
  setTimeout(() => ui.querySelector('.explore-help')?.classList.add('faded'), 9000);
  let last = performance.now();
  const tick = now => {
    if (state.disposed) return;
    state.raf = requestAnimationFrame(tick);
    if (document.hidden) { last = now; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t0 = performance.now();
    exploreStep(THREE, state, dt);
    renderer.render(scene, camera);
    exploreWatchCost(state, performance.now() - t0, dt);
  };
  state.raf = requestAnimationFrame(tick);
}

function exploreResize(state) {
  const w = window.innerWidth, h = window.innerHeight;
  state.renderer.setSize(w, h, false);
  state.camera.aspect = w / h;
  // A tall phone screen sees very little across at the desktop's field of
  // view, so it gets a wider one.
  state.camera.fov = w < h ? 55 : 40;
  state.camera.updateProjectionMatrix();
}

// If frames are slow, draw fewer pixels, then drop the fixed lights'
// shadows: the lantern's own shadows are what matter most.
function exploreWatchCost(state, ms, dt) {
  const f = state.frameCost;
  f.sum += dt * 1000; f.n++;
  if (f.n < 90) return;
  const avg = f.sum / f.n;
  f.sum = 0; f.n = 0;
  if (avg < 34) return;
  if (state.pixelRatio > 1) {
    state.pixelRatio = 1;
    state.renderer.setPixelRatio(1);
    exploreResize(state);
  } else {
    state.fixedLights.forEach(l => { l.castShadow = false; });
  }
}

function exploreWireInput(THREE, state) {
  const { ui, floor } = state;
  const canvas = ui.querySelector('.explore-canvas');
  const raycaster = new THREE.Raycaster();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  const pointers = new Map();
  let drag = null, pinch = null;

  const groundAt = (clientX, clientY) => {
    const ndc = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, state.camera);
    return raycaster.ray.intersectPlane(groundPlane, hit) ? [hit.x, hit.z] : null;
  };
  const glintAt = (clientX, clientY) => {
    const ndc = new THREE.Vector2(clientX / window.innerWidth * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, state.camera);
    const visible = state.glints.filter(g => g.material.opacity > 0.05);
    const hits = raycaster.intersectObjects(visible, false);
    return hits.length ? hits[0].object.userData.poi : null;
  };

  exploreListen(canvas, 'pointerdown', e => {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), dist: state.view.dist };
      drag = null;
    } else {
      drag = { moved: false };
    }
  });
  exploreListen(canvas, 'pointermove', e => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 0) state.view.dist = clampNum(pinch.dist * pinch.d / d, 170, 1100);
      return;
    }
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) drag.moved = true;
    if (drag.moved) {
      state.view.yaw -= dx * 0.006;
      state.view.pitch = clampNum(state.view.pitch + dy * 0.005, 0.55, 1.42);
    }
  });
  const end = e => {
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!p || !drag || drag.moved || e.type === 'pointercancel') { if (!pointers.size) drag = null; return; }
    drag = null;
    const poi = glintAt(e.clientX, e.clientY);
    if (poi && Math.hypot(poi.x - state.pos.x, poi.y - state.pos.y) < EXPLORE_POI_RANGE * 1.6) { exploreShowPoi(state, poi); return; }
    const target = groundAt(e.clientX, e.clientY);
    if (target) exploreWalkTo(state, target[0], target[1], poi);
  };
  exploreListen(canvas, 'pointerup', end);
  exploreListen(canvas, 'pointercancel', end);
  exploreListen(canvas, 'wheel', e => {
    e.preventDefault();
    state.view.dist = clampNum(state.view.dist * Math.exp(e.deltaY * 0.0012), 170, 1100);
  }, { passive: false });

  // Keys are caught while the house is open, so the site's own shortcuts
  // (Escape closing panels, "/" for search) don't fire behind it.
  exploreListen(document, 'keydown', e => {
    if (e.key === 'Tab') return;
    if (e.target.closest && e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;
    e.stopPropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape') {
      e.preventDefault();
      if (!ui.querySelector('.explore-rooms').hidden) exploreToggleRooms(state, false);
      else if (!ui.querySelector('.explore-card').hidden) exploreHideCard(state);
      else closeExplore();
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
      state.keys.add(k);
      state.path = null;
    } else if (k === 'q' || k === 'e') {
      e.preventDefault();
      state.keys.add(k);
    } else if (k === 'enter' || k === 'f' || k === ' ') {
      if (state.nearPoi) { e.preventDefault(); exploreShowPoi(state, state.nearPoi); }
    } else if (k === '+' || k === '=') {
      state.view.dist = clampNum(state.view.dist * 0.85, 170, 1100);
    } else if (k === '-' || k === '_') {
      state.view.dist = clampNum(state.view.dist / 0.85, 170, 1100);
    }
  }, true);
  exploreListen(document, 'keyup', e => { state.keys.delete(e.key.toLowerCase()); }, true);
  exploreListen(window, 'blur', () => state.keys.clear());

  ui.querySelector('.explore-prompt').addEventListener('click', () => { if (state.nearPoi) exploreShowPoi(state, state.nearPoi); });
  ui.querySelector('.explore-card-close').addEventListener('click', () => exploreHideCard(state));
  ui.querySelector('.explore-rooms-btn').addEventListener('click', () => exploreToggleRooms(state));
  ui.querySelector('.explore-rooms').addEventListener('click', e => {
    const b = e.target.closest('[data-room]');
    if (!b) return;
    const room = floor.rooms.find(r => r.id === b.dataset.room);
    exploreToggleRooms(state, false);
    if (!room) return;
    const [cx, cy] = room.anchor || explorePolyCentroid(room.points);
    exploreWalkTo(state, cx, cy);
  });
}

function exploreToggleRooms(state, open) {
  const menu = state.ui.querySelector('.explore-rooms');
  const btn = state.ui.querySelector('.explore-rooms-btn');
  const show = open === undefined ? menu.hidden : open;
  menu.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
  if (show) menu.querySelector('button')?.focus({ preventScroll: true });
}

function exploreWalkTo(state, x, y, poi) {
  const target = exploreNearestWalkable(state.grid, x, y, poi ? 70 : 40);
  if (!target) return;
  const path = exploreFindPath(state.grid, state.pos.x, state.pos.y, target[0], target[1]);
  state.path = path && path.length ? path : null;
  state.pathPoi = poi || null;
}

function exploreShowCard(state, title, text) {
  const card = state.ui.querySelector('.explore-card');
  card.querySelector('.explore-card-title').textContent = title;
  card.querySelector('.explore-card-text').textContent = text;
  card.hidden = false;
  card.classList.remove('show');
  void card.offsetWidth; // restart the fade-in
  card.classList.add('show');
}

function exploreHideCard(state) {
  state.ui.querySelector('.explore-card').hidden = true;
  state.cardFor = null;
}

function exploreShowPoi(state, poi) {
  state.inspected.add(poi.id);
  state.cardFor = 'poi:' + poi.id;
  exploreShowCard(state, poi.name, poi.text);
}

function exploreBanner(state, text, ms = 2600) {
  const b = state.ui.querySelector('.explore-banner');
  b.textContent = text;
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
  clearTimeout(state.bannerTimer);
  state.bannerTimer = setTimeout(() => b.classList.remove('show'), ms);
}

function exploreStrike(state, strength = 1) {
  const t = state.time;
  state.strikes.push(t, t + 0.12 + Math.random() * 0.1);
  if (Math.random() < 0.5) state.strikes.push(t + 0.35 + Math.random() * 0.2);
  if (state.audio && state.soundOn) setTimeout(() => state.audio && state.audio.thunder(strength), 250 + Math.random() * 1200 * (1.2 - strength));
}

// One frame of everything that moves.
function exploreStep(THREE, state, dt) {
  const { floor, view, pos, keys } = state;
  state.time += dt;
  const t = state.time;

  // Turning and walking.
  if (keys.has('q')) view.yaw += dt * 1.6;
  if (keys.has('e')) view.yaw -= dt * 1.6;
  let mx = 0, my = 0;
  const fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const side = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  if (fwd || side) {
    const sy = Math.sin(view.yaw), cy = Math.cos(view.yaw);
    mx = -sy * fwd + cy * side;
    my = -cy * fwd - sy * side;
    const l = Math.hypot(mx, my);
    mx /= l; my /= l;
  } else if (state.path) {
    const [wx, wy] = state.path[0];
    const dx = wx - pos.x, dy = wy - pos.y, d = Math.hypot(dx, dy);
    // Within one step: land on the waypoint (rather than overshooting it
    // and stepping back again on a slow frame) and head for the next.
    if (d <= EXPLORE_WALK_SPEED * dt) {
      pos.x = wx; pos.y = wy;
      state.walkTime += dt;
      state.path.shift();
      if (!state.path.length) {
        state.path = null;
        if (state.pathPoi) { exploreShowPoi(state, state.pathPoi); state.pathPoi = null; }
      }
    } else { mx = dx / d; my = dy / d; }
  }
  const moving = mx || my;
  if (moving) {
    const step = EXPLORE_WALK_SPEED * dt;
    const nx = pos.x + mx * step, ny = pos.y + my * step;
    if (exploreWalkable(state.grid, nx, ny)) { pos.x = nx; pos.y = ny; }
    else if (exploreWalkable(state.grid, nx, pos.y)) pos.x = nx;
    else if (exploreWalkable(state.grid, pos.x, ny)) pos.y = ny;
    else state.path = null;
    state.walkTime += dt;
  }

  // No Escape: step off the porch and the storm throws you back.
  if (floor.noEscape && explorePointInPoly(pos.x, pos.y, floor.noEscape.points) && !(state.noEscapeUntil > t)) {
    state.noEscapeUntil = t + 1.5;
    exploreStrike(state, 1.3);
    pos.x = floor.returnTo.x; pos.y = floor.returnTo.y;
    state.path = null;
    exploreBanner(state, floor.noEscape.text, 4200);
  }

  // Lantern: carried, so it bobs a little while walking and sways.
  const bob = moving ? Math.sin(state.walkTime * 9) * 1.6 : Math.sin(t * 1.3) * 0.6;
  state.lantern.position.set(pos.x, EXPLORE_LANTERN_HEIGHT + bob, pos.y);
  const flick = 1 + Math.sin(t * 13.1) * 0.04 + Math.sin(t * 7.3 + 1) * 0.05 + Math.sin(t * 23.7) * 0.025;
  state.lanternLight.intensity = 1100 * flick;
  state.fixedLights.forEach(l => {
    const u = l.userData;
    l.intensity = u.base * (1 + u.flicker * (Math.sin(t * 2.3 + u.phase) * 0.6 + Math.sin(t * 5.9 + u.phase * 2) * 0.4));
  });

  // Lightning.
  if (t > state.nextStrike) {
    exploreStrike(state, 0.5 + Math.random() * 0.6);
    state.nextStrike = t + 7 + Math.random() * 11;
  }
  state.strikes = state.strikes.filter(s => t - s < 1.5);
  let f = 0;
  for (const s of state.strikes) if (t >= s) f += Math.exp(-(t - s) * 9);
  f = Math.min(1.6, f);
  state.flash.value = f * 0.9;
  state.lightning.intensity = f * 2.2;
  state.ambient.intensity = 0.32 + f * 0.25;
  state.windowMat.opacity = 0.1 + f * 0.75;
  state.rain.material.uniforms.flash.value = f;
  state.rain.material.uniforms.time.value = t;
  state.rain.material.uniforms.center.value.set(view.tx, 0, view.ty);
  if (state.dust) {
    state.dust.material.uniforms.time.value = t;
    state.dust.material.uniforms.lantern.value.copy(state.lantern.position);
    state.dust.material.uniforms.scale.value = state.pixelRatio;
  }

  // Camera: eases after the lantern.
  const ease = 1 - Math.exp(-dt * 5);
  view.tx += (pos.x - view.tx) * ease;
  view.ty += (pos.y - view.ty) * ease;
  const cp = Math.cos(view.pitch), sp = Math.sin(view.pitch);
  state.camera.position.set(view.tx + Math.sin(view.yaw) * cp * view.dist, sp * view.dist + 20, view.ty + Math.cos(view.yaw) * cp * view.dist);
  state.camera.lookAt(view.tx, 20, view.ty);
  state.scene.fog.density = 0.4 / view.dist;
  state.cutaway.lantern.value.copy(state.lantern.position);
  state.cutaway.eye.value.copy(state.camera.position);

  // Which room, and what's near enough to inspect.
  const room = floor.rooms.find(r => r.id !== 'hallway' && r.id !== 'porch' && explorePointInPoly(pos.x, pos.y, r.points))
    || floor.rooms.find(r => explorePointInPoly(pos.x, pos.y, r.points));
  if (room && room !== state.room) {
    state.room = room;
    exploreBanner(state, room.name);
    if (!state.seenRooms.has(room.id)) {
      state.seenRooms.add(room.id);
      state.cardFor = 'room:' + room.id;
      exploreShowCard(state, room.name, room.text);
    } else if (state.cardFor && state.cardFor.startsWith('room:')) {
      exploreHideCard(state);
    }
    exploreEvents(state, room);
  }
  let near = null, nearD = EXPLORE_POI_RANGE;
  state.glints.forEach(g => {
    const p = g.userData.poi;
    const d = Math.hypot(p.x - pos.x, p.y - pos.y);
    const seen = state.inspected.has(p.id);
    const target = d < 280 ? (seen ? 0.28 : 0.85) * (0.75 + 0.25 * Math.sin(t * 3 + p.x)) * Math.min(1, (280 - d) / 90) : 0;
    g.material.opacity += (target - g.material.opacity) * Math.min(1, dt * 6);
    if (d < nearD) { near = p; nearD = d; }
  });
  exploreUpdatePrompt(THREE, state, near);

  // The Crooked Man fading in and out.
  const man = state.crookedMan;
  if (man.visible) {
    const age = t - man.userData.start;
    man.material.opacity = age < 0.5 ? age / 0.5 : age < 2.2 ? 1 : Math.max(0, 1 - (age - 2.2) / 0.9);
    if (age > 3.1) man.visible = false;
  }
}

function exploreUpdatePrompt(THREE, state, poi) {
  const prompt = state.ui.querySelector('.explore-prompt');
  state.nearPoi = poi;
  if (!poi) { prompt.hidden = true; return; }
  const v = new THREE.Vector3(poi.x, 30, poi.y).project(state.camera);
  if (v.z > 1) { prompt.hidden = true; return; }
  const label = `🔍 ${poi.name}`;
  if (prompt.textContent !== label) prompt.textContent = label;
  prompt.hidden = false;
  prompt.style.left = `${((v.x + 1) / 2 * window.innerWidth).toFixed(1)}px`;
  prompt.style.top = `${((1 - v.y) / 2 * window.innerHeight).toFixed(1)}px`;
}

// Scripted moments, each once per visit: e.g. after the séance board has
// been looked at, the Crooked Man shows himself at the end of the hall.
function exploreEvents(state, room) {
  (state.floor.events || []).forEach(ev => {
    if (state.firedEvents.has(ev.id) || ev.room !== room.id) return;
    if (ev.after && !state.inspected.has(ev.after)) return;
    state.firedEvents.add(ev.id);
    if (ev.id === 'crooked_man') {
      // Down the hall, a little way ahead in the direction the camera
      // faces, so he's always in view.
      const ahead = -Math.cos(state.view.yaw) >= 0 ? 1 : -1;
      const man = state.crookedMan;
      man.position.set(714, 0, clampNum(state.pos.y + ahead * 150, 545, 1075));
      man.visible = true;
      man.userData.start = state.time;
      exploreStrike(state, 1);
    }
    exploreBanner(state, ev.text, 3200);
  });
}
