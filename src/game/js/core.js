// The Crooked House — a small first-person adventure through the house's
// first floor, in the spirit of old grid-based dungeon crawlers: step from
// square to square, turn in quarter turns, and solve the house's hauntings
// by choices and wits (there is no combat).
//
// build.js joins src/game/js/*.js, in the order listed in GAME_FILES, into
// one <script type="module"> in docs/crooked-house.html, after the house
// data (EXPLORE_PLACES, from src/data/explore.json) and an import of the
// trimmed three.js build as THREE.
//
// This file: small helpers, and the grid the whole game moves on. The grid
// is worked out from the walls traced in explore.json — nothing about it
// is drawn by hand — so a change to a wall there changes the game too.

const PLACE = EXPLORE_PLACES.crooked_house;
const FLOOR = PLACE.floors[0];
const CELL = FLOOR.grid.cell;          // one square, in floor-plan pixels (~5 ft)
const WALL_H = 112;                    // ~10 ft ceilings
const EYE_H = 60;
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // N, E, S, W (y grows south)
const DIR_NAMES = ['north', 'east', 'south', 'west'];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clamp01 = v => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;

// localStorage can throw (private windows, blocked site data): fall back to
// memory so the game still works, it just won't remember.
const store = (() => {
  const mem = {};
  return {
    get(k) { try { return localStorage.getItem(k); } catch { return k in mem ? mem[k] : null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = String(v); } },
    remove(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
  };
})();

// mulberry32: a small seeded generator, so placeholder art and particles
// come out the same every visit.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pointInPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}

// ─── The grid ─────────────────────────────────────────────────────────
// A square is walkable if its centre is in one of the floor's walkable
// areas. Two neighbouring squares are separated by a wall if the line
// between their centres crosses a traced wall; a gap in the traced walls
// is a doorway. Edges out of the walkable area are the house's outer wall,
// or — from the porch — its railing.

const GRID = (() => {
  const ox = FLOOR.grid.x, oy = FLOOR.grid.y;
  const cols = Math.ceil((FLOOR.width - ox) / CELL), rows = Math.ceil((FLOOR.height - oy) / CELL);
  const segs = [];
  FLOOR.walls.forEach(w => { for (let i = 0; i < w.points.length - 1; i++) segs.push([w.points[i], w.points[i + 1]]); });
  const centre = (cx, cy) => [ox + (cx + 0.5) * CELL, oy + (cy + 0.5) * CELL];
  const roomAt = (x, y) =>
    FLOOR.rooms.find(r => r.id !== 'hallway' && r.id !== 'porch' && pointInPoly(x, y, r.points))
    || FLOOR.rooms.find(r => pointInPoly(x, y, r.points)) || null;
  const cells = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const [x, y] = centre(cx, cy);
      const walk = FLOOR.walkable.some(a => pointInPoly(x, y, a.points));
      const room = walk ? roomAt(x, y) : null;
      cells.push({ cx, cy, x, y, walk, room: room ? room.id : null, noEscape: walk && FLOOR.noEscape && pointInPoly(x, y, FLOOR.noEscape.points) });
    }
  }
  const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= cols || cy >= rows) ? null : cells[cy * cols + cx];
  // What lies across each of a square's four edges: 'open', 'door',
  // 'wall' or 'rail'.
  cells.forEach(c => {
    c.edges = DIRS.map(([dx, dy]) => {
      if (!c.walk) return 'none';
      const n = at(c.cx + dx, c.cy + dy);
      if (!n || !n.walk) return (c.room === 'porch' || !c.room) ? 'rail' : 'wall';
      const a = [c.x, c.y], b = [n.x, n.y];
      if (segs.some(([p, q]) => segmentsCross(a, b, p, q))) return 'wall';
      return n.room !== c.room ? 'door' : 'open';
    });
  });
  // The front steps lead down into the storm: open on their far side
  // (that's where No Escape catches you) rather than railed off.
  cells.forEach(c => { if (c.noEscape) c.edges = c.edges.map(e => (e === 'rail' ? 'open' : e)); });
  const cellAtPx = (x, y) => at(Math.floor((x - ox) / CELL), Math.floor((y - oy) / CELL));
  return { cols, rows, cells, at, centre, cellAtPx, ox, oy, segs };
})();

function canStep(c, dir) {
  if (!c) return false;
  const e = c.edges[dir];
  if (e === 'wall' || e === 'rail' || e === 'none') return false;
  const n = GRID.at(c.cx + DIRS[dir][0], c.cy + DIRS[dir][1]);
  return !!(n && n.walk && !n.blocked);   // `blocked`: big furniture (world.js)
}

function roomById(id) { return FLOOR.rooms.find(r => r.id === id) || null; }
