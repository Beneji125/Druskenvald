// Furniture and fixtures, built from simple shapes (boxes, cylinders,
// spheres) in one style: dark, worn wood, faded cloth, tarnished brass,
// grey stone. People, ghosts and creatures stay as flat drawn cut-outs
// (SPRITES in art.js); so do the peacock and the chandelier.
//
// Sizes are life-size: the floor plan's pixels are about a tenth of a foot
// (a square is five feet, the ceilings ten), so a chair seat sits at 17 and
// a table top at 28.
//
// Each piece is a group standing at (x, y) on the plan, turned by `rot`:
// its own +z is its front, so a piece against a wall has its back to it
// (see snapPiece, below).

const FURN_MATS = {};
function furnMat(key, make) { return FURN_MATS[key] || (FURN_MATS[key] = make()); }
const woodM = c => furnMat('wood' + c, () => new THREE.MeshStandardMaterial({ map: woodTexture(c), roughness: 0.75 }));
const clothM = c => furnMat('cloth' + c, () => new THREE.MeshStandardMaterial({ map: fabricTexture(c), roughness: 1 }));
const plainM = (c, r = 0.9, m = 0) => furnMat(`plain${c}/${r}/${m}`, () => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m }));
const stoneM = () => furnMat('stone', () => new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 }));
const brassM = () => plainM(0x6e5426, 0.45, 0.65);
const ironM = () => plainM(0x232120, 0.55, 0.6);
const marbleM = () => plainM(0x726c62, 0.55, 0);

// The palette: one muted cloth per room, and the woods.
const CLOTH = { parlor: '#4a2a28', music: '#2c3446', porch: '#3a3028', dining: '#4a3424', gallery: '#3a3a34' };
const WOOD = { dark: '#2a190d', mid: '#3a2414', light: '#4a3420', grey: '#3e3a32' };

// Facing away from the wall on side `d` (0–3, N E S W) of a square.
function faceAway(d) { return Math.atan2(-DIRS[d][0], -DIRS[d][1]); }
// Facing a point.
function faceTowards(x, y, tx, ty) { return Math.atan2(tx - x, ty - y); }

// Puts a piece flat against the nearest wall of its square (or the wall on
// side `p.wall`, if given): its back `depth / 2` out from the wall's face,
// facing into the room.
function snapPiece(p, depth) {
  const c = GRID.cellAtPx(p.x, p.y);
  if (!c || !c.walk) return;
  let d = p.wall;
  if (d === undefined) {
    let best = Infinity;
    c.edges.forEach((e, k) => {
      if (e !== 'wall') return;
      const dist = k % 2 ? Math.abs(p.x - (c.x + DIRS[k][0] * CELL / 2)) : Math.abs(p.y - (c.y + DIRS[k][1] * CELL / 2));
      if (dist < best) { best = dist; d = k; }
    });
  }
  if (d === undefined) return;
  const out = CELL / 2 - WALL_T / 2 - depth / 2 - 0.5;
  if (d % 2) p.x = c.x + DIRS[d][0] * out; else p.y = c.y + DIRS[d][1] * out;
  p.rot = faceAway(d);
  p.wallDir = d;
}

function piece(scene, x, z, rot = 0) {
  const g = new THREE.Group();
  g.position.set(x, 0, z); g.rotation.y = rot;
  scene.add(g);
  return g;
}
function mesh(g, geo, mat, x, y, z, shadow = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = shadow; m.receiveShadow = true;
  g.add(m);
  return m;
}
const blk = (g, w, h, d, mat, x, y, z, shadow) => mesh(g, new THREE.BoxGeometry(w, h, d), mat, x, y, z, shadow);
const cyl = (g, rt, rb, h, mat, x, y, z, seg = 14, shadow) => mesh(g, new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y, z, shadow);
const ball = (g, r, mat, x, y, z, s = [1, 1, 1]) => { const m = mesh(g, new THREE.SphereGeometry(r, 14, 10), mat, x, y, z); m.scale.set(...s); return m; };

// Every part of every piece is its own mesh while it's built; once the
// house is furnished, mergeStatic() bakes all the parts that never move
// into one mesh per material, so the whole house draws in a few dozen
// calls instead of a thousand (and the lantern's shadows with it). Parts
// that change later (the feast, the fire, glass) are left as they are:
// anything under an object with userData.keep, transparent, or with more
// than one material.
function mergeStatic(scene, roots) {
  const buckets = new Map();
  const take = o => {
    if (o.userData.keep) return;
    [...o.children].forEach(take);
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent || !o.geometry.attributes.uv) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    let b = buckets.get(o.material);
    if (!b) buckets.set(o.material, b = { pos: [], norm: [], uv: [], cast: false });
    const add = (arr, attr) => { const a = attr.array; for (let i = 0; i < a.length; i++) arr.push(a[i]); };
    add(b.pos, g.attributes.position); add(b.norm, g.attributes.normal); add(b.uv, g.attributes.uv);
    b.cast = b.cast || o.castShadow;
    g.dispose();
    o.parent.remove(o);
  };
  roots.forEach(r => { if (!r) return; r.updateWorldMatrix(true, true); take(r); });
  const made = [];
  buckets.forEach((b, mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.norm, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = b.cast; m.receiveShadow = true;
    scene.add(m);
    made.push(m);
  });
  return made;
}

// ─── The pieces ───────────────────────────────────────────────────────

function chair(g, cloth, rocking = false) {
  const w = woodM(WOOD.mid);
  [[-7, -7], [7, -7], [-7, 7], [7, 7]].forEach(([x, z]) => blk(g, 2, 17, 2, w, x, 8.5, z));
  blk(g, 18, 2.5, 18, w, 0, 17.2, 0);
  blk(g, 16, 2, 15, clothM(cloth), 0, 19.4, 0.5);
  [-7, 7].forEach(x => blk(g, 2, 24, 2, w, x, 30, -8));
  blk(g, 13, 15, 1.4, clothM(cloth), 0, 30, -8);
  blk(g, 18, 2.5, 2.4, w, 0, 42, -8);
  if (rocking) [-7, 7].forEach(x => { const r = blk(g, 2, 1.6, 30, w, x, 0.8, 0); r.rotation.x = 0.04; });
}

function sofa(g, cloth, len = 70) {
  const c = clothM(cloth), w = woodM(WOOD.dark);
  blk(g, len, 9, 28, c, 0, 8.5, 0);
  [-1, 1].forEach(s => blk(g, len / 2 - 7, 5, 22, c, s * (len / 4 - 2.5), 15.5, 2));
  blk(g, len, 20, 7, c, 0, 22, -10.5);
  [-1, 1].forEach(s => { blk(g, 6, 11, 28, c, s * (len / 2 - 3), 18.5, 0); });
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => blk(g, 3, 4, 3, w, a * (len / 2 - 4), 2, b * 11));
}

function roundTable(g) {
  const w = woodM(WOOD.mid);
  cyl(g, 30, 30, 2.5, w, 0, 27.8, 0, 32);
  cyl(g, 30.6, 30.6, 1, woodM(WOOD.dark), 0, 26.2, 0, 32);
  cyl(g, 3.5, 4.5, 24, woodM(WOOD.dark), 0, 14, 0);
  [0, 1, 2].forEach(i => { const f = blk(g, 3, 3, 20, woodM(WOOD.dark), 0, 1.5, 0); f.rotation.y = i * Math.PI * 2 / 3; f.translateZ(8); });
}

function sideboard(g) {
  const w = woodM(WOOD.mid), dk = woodM(WOOD.dark);
  blk(g, 110, 26, 24, w, 0, 18, 0);
  blk(g, 116, 2.5, 27, dk, 0, 32.3, 0.5);
  [-1, 0, 1].forEach(i => {
    blk(g, 32, 7, 1, dk, i * 36, 26, 12.4);
    blk(g, 32, 14, 1, dk, i * 36, 13, 12.4);
    blk(g, 4, 1.5, 1.5, brassM(), i * 36, 26, 13.4);
  });
  [[-52, -10], [52, -10], [-52, 10], [52, 10]].forEach(([x, z]) => blk(g, 3, 5, 3, dk, x, 2.5, z));
  // a pair of tarnished candlesticks
  [-40, 40].forEach(x => { cyl(g, 1.2, 2.4, 9, brassM(), x, 38, -4); cyl(g, 0.9, 0.9, 6, plainM(0xcfc6aa), x, 45.5, -4); });
}

// The long dining table and the phantom feast laid on it. Returns what
// setFeast() needs to change when the feast ends.
function diningTable(g) {
  const w = woodM(WOOD.mid), dk = woodM(WOOD.dark);
  blk(g, 76, 3, 176, w, 0, 27.5, 0);
  [[-32, -80], [32, -80], [-32, 80], [32, 80]].forEach(([x, z]) => blk(g, 4, 26, 4, dk, x, 13, z));
  blk(g, 66, 4, 2, dk, 0, 24, -80); blk(g, 66, 4, 2, dk, 0, 24, 80);
  const cloth = new THREE.MeshStandardMaterial({ map: tableclothTexture(), roughness: 1 });
  blk(g, 82, 0.6, 182, cloth, 0, 29.3, 0);
  [-41, 41].forEach(x => blk(g, 0.6, 9, 182, cloth, x, 25, 0, false));
  [-91, 91].forEach(z => blk(g, 82, 9, 0.6, cloth, 0, 25, z, false));
  const food = new THREE.Group(); g.add(food);
  const plate = plainM(0xb8b2a0, 0.5), silver = plainM(0x8a8a88, 0.35, 0.7), wine = plainM(0x4a0e10, 0.3);
  const place = (x, z) => {
    cyl(food, 6.5, 5.5, 0.7, plate, x, 30, z, 18);
    cyl(food, 1.4, 1.1, 5, plainM(0x9a9a98, 0.3, 0.6), x + (x < 0 ? 8 : -8), 32.2, z - 7, 8);
    cyl(food, 1.3, 1.3, 1.5, wine, x + (x < 0 ? 8 : -8), 34.4, z - 7, 8);
  };
  [-60, 0, 60].forEach(z => { place(-27, z); place(27, z); });
  place(0, -80); place(0, 80);
  // The centre: a roast on a silver platter, tureens and bowls of fruit.
  cyl(food, 15, 13, 1, silver, 0, 30.2, 0, 24);
  (ball(food, 9, plainM(0x6a3a1c, 0.6), 0, 33, 0, [1.3, 0.62, 1]));
  [-36, 36].forEach(z => {
    cyl(food, 7, 5, 6, plate, 0, 32.6, z, 16);
    (cyl(food, 6.4, 6.4, 0.6, plainM(0x6a4420, 0.4), 0, 35.4, z, 16));
  });
  [[-14, -22], [14, 22]].forEach(([x, z]) => {
    cyl(food, 6, 3.5, 3.5, plate, x, 31.6, z, 14);
    ['#6a2020', '#5a6a2a', '#8a6a2a', '#4a2448'].forEach((c, i) => (ball(food, 2.2, plainM(new THREE.Color(c).getHex(), 0.6), x + (i % 2 ? 2 : -2), 34, z + (i < 2 ? 2 : -2))));
  });
  // Two candelabra, their candles lit (the flames kept apart, to put out).
  const flames = [];
  const lit = new THREE.Group(); lit.userData.keep = true; g.add(lit);
  [-56, 56].forEach(z => {
    cyl(food, 4, 5, 1.2, brassM(), 0, 30.4, z);
    cyl(food, 0.9, 1.2, 16, brassM(), 0, 38, z);
    blk(food, 18, 1, 1.4, brassM(), 0, 45, z);
    [-8, 0, 8].forEach(x => {
      cyl(food, 1, 1, 7, plainM(0x9a927c), x, 49.5, z, 8);
      const f = mesh(lit, new THREE.ConeGeometry(0.9, 2.6, 8), new THREE.MeshBasicMaterial({ color: 0xffd890 }), x, 54.2, z, false);
      flames.push(f);
    });
  });
  // The dishes baked into a few meshes of their own, which setFeast can
  // hide or char all at once.
  const baked = new THREE.Group();
  g.parent.add(baked);
  food.userData.keep = false;
  mergeStatic(baked, [food]);
  g.remove(food);
  return { food: baked, cloth, flames };
}

// The feast's end: freed, the food crumbles to dust and the candles go
// out; burned, everything is charred black.
function setFeast(state) {
  const f = world.feast;
  if (!f || world.feastState === state) return;
  world.feastState = state;
  if (state === 'released') {
    f.food.visible = false;
    f.flames.forEach(m => { m.visible = false; });
    f.cloth.color.set(0x8a8478);
  } else if (state === 'killed') {
    f.cloth.color.set(0x2a2420);
    f.food.children.forEach(m => { m.material = plainM(0x16120e, 1); });
    f.flames.forEach(m => { m.visible = false; });
  }
}

function harpsichord(outer) {
  // (built from the keyboard back; shifted so the middle of the case is at
  // the piece's position)
  const g = new THREE.Group(); g.position.z = 36; outer.add(g);
  const caseM = woodM(WOOD.dark);
  // The case: long and tapering away from the keys (a wing), on turned legs.
  const shape = [[-17, 0], [17, 0], [17, -50], [6, -78], [-17, -78]];
  const body = new THREE.Group(); g.add(body); body.position.y = 26;
  for (let i = 0; i < shape.length; i++) {
    const [ax, az] = shape[i], [bx, bz] = shape[(i + 1) % shape.length];
    const len = Math.hypot(bx - ax, bz - az);
    const side = blk(body, len, 10, 1.6, caseM, (ax + bx) / 2, 5, (az + bz) / 2);
    side.rotation.y = -Math.atan2(bz - az, bx - ax);
  }
  blk(body, 33, 1, 76, woodM(WOOD.mid), 0, 1, -39);              // the soundboard's floor
  const lid = blk(body, 33, 1, 64, caseM, 0, 10, -45);            // the lid, propped open
  lid.rotation.z = -0.9; lid.position.set(-14, 22, -45);
  const keys = new THREE.MeshStandardMaterial({ map: harpsichordFrontTexture(), roughness: 0.6 });
  mesh(body, new THREE.BoxGeometry(32, 1.5, 9), [caseM, caseM, keys, caseM, caseM, caseM], 0, 3, 4.5);
  blk(body, 34, 4, 2, caseM, 0, 2, 9.5);
  [[-14, 5], [14, 5], [-14, -70], [8, -70]].forEach(([x, z]) => cyl(g, 1.4, 2.2, 26, caseM, x, 13, z, 8));
  // a stool before it
  blk(g, 18, 2, 12, clothM(CLOTH.music), 0, 17, 18);
  [[-7, 13], [7, 13], [-7, 23], [7, 23]].forEach(([x, z]) => blk(g, 1.6, 16, 1.6, caseM, x, 8, z));
}

function harp(g) {
  const gilt = plainM(0x7a6230, 0.45, 0.5);
  blk(g, 14, 4, 18, gilt, 0, 2, 0);                                              // base
  const col = cyl(g, 1.6, 2, 58, gilt, -5, 31, 6, 10); col.rotation.x = 0.06;     // the column
  const sb = blk(g, 4, 54, 7, woodM(WOOD.light), 3, 30, -4); sb.rotation.x = -0.3; // the soundboard
  const neck = blk(g, 3, 3, 24, gilt, -1, 58, -4); neck.rotation.x = 0.35;
  const pts = [];
  for (let i = 0; i < 9; i++) { const k = i / 8; pts.push(-1, 10 + k * 40, -10 + k * 12, -1, 57 + k * 2, -12 + k * 18); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xb8a880, transparent: true, opacity: 0.6 })));
}

function barrel(g) {
  const w = woodM(WOOD.light);
  cyl(g, 10.5, 10.5, 30, w, 0, 15, 0, 16);
  cyl(g, 12, 12, 10, w, 0, 15, 0, 16);
  [4, 15, 26].forEach(y => cyl(g, 12.3 - Math.abs(y - 15) * 0.15, 12.3 - Math.abs(y - 15) * 0.15, 1.6, ironM(), 0, y, 0, 16));
}

// A mossy stone garden bench: a slab on two carved supports.
function bench(g) {
  const st = furnMat('mossStone', () => new THREE.MeshStandardMaterial({ map: stoneTexture(true), roughness: 1 }));
  blk(g, 66, 4, 18, st, 0, 15, 0);
  [-24, 24].forEach(x => { blk(g, 10, 13, 14, st, x, 6.5, 0); blk(g, 13, 2, 17, st, x, 1, 0); });
}

// A potted plant for the glasshouse: a clay pot with the bare branches.
function pottedShrub(g, scene, x, y) {
  cyl(g, 9, 7, 14, plainM(0x6a3a24, 1), 0, 7, 0, 14);
  cyl(g, 8.4, 8.4, 0.5, plainM(0x1e1610, 1), 0, 13.6, 0, 14);
  const s = addSprite(scene, 'shrub', x, y);
  s.position.y = 12; s.scale.setScalar(1.1);
  return s;
}

// The bergamot tree in the conservatory: a gnarled trunk, a few limbs and
// a crown of leaves with the green fruit, kept under the glass.
function bergamotTree(g) {
  const bark = woodM('#2e2016');
  cyl(g, 4, 6.5, 64, bark, 0, 32, 0, 10);
  [[0.6, 0, 30], [-0.5, 1.8, 26], [0.4, 3.6, 22]].forEach(([tilt, a, len]) => {
    const limb = cyl(g, 1.6, 3, len, bark, 0, 56, 0, 8);
    limb.rotation.set(tilt * Math.cos(a), 0, tilt * Math.sin(a));
    limb.translateY(len / 2 - 2);
  });
  const leaf = furnMat('leaves', () => new THREE.MeshStandardMaterial({ map: leafTexture(), roughness: 1 }));
  const rand = seededRandom(81);
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * Math.PI * 2, r = 14 + rand() * 18;
    ball(g, 14 + rand() * 6, leaf, Math.cos(a) * r, 82 + rand() * 14, Math.sin(a) * r, [1, 0.7, 1]);
  }
  ball(g, 20, leaf, 0, 96, 0, [1, 0.6, 1]);
  const fruit = plainM(0x8a9a3a, 0.6);
  for (let i = 0; i < 14; i++) { const a = rand() * Math.PI * 2, r = 22 + rand() * 18; ball(g, 2.2, fruit, Math.cos(a) * r, 74 + rand() * 18, Math.sin(a) * r); }
  // a ring of earth round its foot
  cyl(g, 22, 24, 1.2, plainM(0x1e1610, 1), 0, 0.6, 0, 20, false);
}

// The parlour fireplace: stone jambs and lintel, a wooden mantel shelf, a
// hearth slab, the firebox and the fire (lit or banked, see setHearth).
function fireplace(g, w) {
  const st = stoneM();
  blk(g, 84, 3, 30, st, 0, 1.5, 6);                         // hearth
  [-31, 31].forEach(x => blk(g, 14, 52, 16, st, x, 26, -1));
  blk(g, 76, 12, 18, st, 0, 50, -1);                       // lintel
  blk(g, 90, 3, 22, woodM(WOOD.dark), 0, 57.5, 0);          // mantel shelf
  blk(g, 50, 44, 3, plainM(0x0a0806, 1), 0, 22, -8);        // the back of the firebox
  [-24, 24].forEach(x => blk(g, 2, 44, 14, plainM(0x100c0a, 1), x, 22, -1));
  const logs = woodM('#24160c');
  [[-6, 0.3], [6, -0.3]].forEach(([x, r]) => { const l = cyl(g, 2.2, 2.2, 26, logs, x, 5, 0, 8); l.rotation.set(0, r, Math.PI / 2); });
  const fire = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xff7a30, emissiveMap: fireTexture(), emissiveIntensity: 0.25, transparent: true, depthWrite: false });
  w.hearthMats.push(fire);
  mesh(g, new THREE.PlaneGeometry(40, 30), fire, 0, 17, -2, false);
  // things on the mantel: a clock and two candlesticks
  blk(g, 10, 13, 6, woodM(WOOD.mid), 0, 65.5, -4);
  cyl(g, 3, 3, 0.6, plainM(0xc8bea0), 0, 67, -0.7, 16).rotation.x = Math.PI / 2;
  [-28, 28].forEach(x => cyl(g, 1.2, 2.2, 10, brassM(), x, 64, -4));
}

// The foyer stairs: a straight flight up along the east wall, solid steps
// with a banister on the open side, climbing into the dark.
function stairs(g) {
  const w = woodM(WOOD.mid), dk = woodM(WOOD.dark), runner = clothM('#3a2224');
  const n = 10, rise = 11.2, go = 11, wide = 50;
  for (let i = 0; i < n; i++) {
    const h = rise * (i + 1);
    blk(g, wide, h, go, dk, 0, h / 2, -i * go);
    blk(g, wide + 2, 1.4, go + 1.5, w, 0, h + 0.7, -i * go + 0.6);
    blk(g, 26, 0.3, go, runner, 0, h + 1.5, -i * go, false);
  }
  // The banister: a newel post, balusters and a sloping rail.
  const side = -wide / 2 + 2;
  cyl(g, 2.6, 2.6, 46, dk, side, 23, 3, 10);
  ball(g, 3.2, dk, side, 47, 3);
  for (let i = 0; i < n; i += 1) cyl(g, 0.7, 0.7, 30, dk, side, rise * (i + 1) + 15, -i * go, 6);
  const len = Math.hypot(n * go, n * rise);
  const rail = blk(g, 2.4, 2.4, len, w, side, rise * (n / 2) + 32, -(n - 1) * go / 2);
  rail.rotation.x = Math.atan2(rise, go);
}

function bustOnPedestal(g) {
  const st = plainM(0x4e4a44, 0.9);
  blk(g, 18, 3, 18, st, 0, 1.5, 0);
  cyl(g, 6.5, 7.5, 34, st, 0, 20, 0, 12);
  blk(g, 16, 3, 16, st, 0, 38.5, 0);
  blk(g, 6, 2, 0.6, plainM(0x1a1814, 0.6, 0.4), 0, 30, 6.9);    // the worn name plate
  const m = marbleM();
  ball(g, 9, m, 0, 44, 0, [1, 0.55, 0.62]);                   // shoulders
  cyl(g, 2.6, 3, 6, m, 0, 49.5, 0, 10);                       // neck
  ball(g, 4.6, m, 0, 56, 0.4, [0.85, 1.12, 0.95]);            // head
  ball(g, 1.1, m, 0, 55.6, 4.6, [0.8, 1.4, 0.9]);              // nose
}

// The spirit board and its planchette, lying on the parlour table: the
// same artwork the séance uses. The board faces whoever sits on the
// fireplace side.
function layBoard(w, p) {
  const lay = (src, wd, dp) => {
    const img = new Image();
    const tex = new THREE.CanvasTexture(img);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    img.onload = () => { tex.needsUpdate = true; };
    img.src = src;
    const glow = src.includes('Board');
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.2, roughness: 0.6, emissive: glow ? 0x9a70ff : 0x000000, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.12 : 0 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, dp), mat);
    m.rotation.x = -Math.PI / 2;
    m.receiveShadow = true;
    w.scene.add(m);
    return m;
  };
  const board = lay('explore/Ouija_Board.webp', 32, 32 * 2000 / 1539);
  board.position.set(p.x, 29.2, p.y);
  board.rotation.z = Math.PI * 0.75;
  w.boardMat = board.material;
  const pl = lay('explore/Planchette.webp', 6.5, 6.5 * 1078 / 621);
  pl.position.set(p.x + 3, 29.4, p.y - 2);
  pl.rotation.z = Math.PI * 0.6;
}

// ─── The search spots' furniture (items.js), along their walls ─────────

function consoleTable(g) {
  const w = woodM(WOOD.mid);
  blk(g, 46, 2.5, 16, w, 0, 30, 0);
  blk(g, 42, 6, 14, woodM(WOOD.dark), 0, 26, -0.5);
  blk(g, 10, 1.4, 1, brassM(), 0, 26, 6.8);
  [[-20, -6], [20, -6], [-20, 6], [20, 6]].forEach(([x, z]) => blk(g, 2.4, 28, 2.4, w, x, 14, z));
}
function umbrellaStand(g) {
  cyl(g, 6.5, 5.5, 22, plainM(0x2e3a32, 0.7), 0, 11, 0, 14);
  [[-2, 0, 0.12], [2, 1, -0.1], [0, -2, 0.2]].forEach(([x, z, tilt]) => {
    const u = cyl(g, 1.1, 2.4, 40, plainM(0x161412, 0.8), x, 30, z, 8);
    u.rotation.z = tilt;
    ball(g, 1.4, woodM(WOOD.light), x - tilt * 20, 51, z);
  });
}
function sconce(g) {
  blk(g, 8, 10, 1.4, brassM(), 0, 64, -3.3);
  blk(g, 1.4, 1.4, 8, brassM(), 0, 62, 0);
  cyl(g, 2.6, 2, 2, brassM(), 0, 63, 4, 10);
  cyl(g, 3.2, 2.6, 9, new THREE.MeshStandardMaterial({ color: 0x9a9a84, roughness: 0.2, transparent: true, opacity: 0.45 }), 0, 68.5, 4, 10);
}
function woodBasket(g) {
  blk(g, 30, 12, 18, woodM('#4a3620'), 0, 6, 0);
  const logs = woodM('#3a2a18');
  [[-7, 0], [0, 0.3], [7, -0.2], [-3.5, 0.1], [3.5, -0.1]].forEach(([x, r], i) => { const l = cyl(g, 2.6, 2.6, 26, logs, x, i < 3 ? 14 : 18.5, 0, 8); l.rotation.set(Math.PI / 2, 0, r); });
}
function cupboard(g) {
  const w = woodM(WOOD.mid), dk = woodM(WOOD.dark);
  blk(g, 44, 72, 20, w, 0, 36, 0);
  blk(g, 48, 3, 22, dk, 0, 73.5, 0.5);
  [-10.5, 10.5].forEach(x => { blk(g, 19, 30, 1, dk, x, 50, 10.4); blk(g, 19, 30, 1, dk, x, 17, 10.4); blk(g, 1.2, 4, 1.2, brassM(), x > 0 ? 1.5 : -1.5, 36, 11.2); });
}
function pottingBench(g) {
  const w = woodM(WOOD.grey);
  blk(g, 50, 2.5, 20, w, 0, 30, 0);
  blk(g, 50, 2, 18, w, 0, 9, 0);
  blk(g, 50, 12, 1.5, w, 0, 37, -9.5);
  [[-23, -8], [23, -8], [-23, 8], [23, 8]].forEach(([x, z]) => blk(g, 2.6, 30, 2.6, w, x, 15, z));
  [[-14, 0], [2, 3], [15, -2]].forEach(([x, z]) => cyl(g, 4.4, 3.4, 7, plainM(0x6a3a24, 1), x, 34.7, z, 10));
  [[-10, 0], [6, 0]].forEach(([x, z]) => cyl(g, 5, 4, 6, plainM(0x6a3a24, 1), x, 13, z, 10));
}
function cabinet(g) {
  const w = woodM(WOOD.dark);
  blk(g, 34, 64, 16, w, 0, 32, 0);
  blk(g, 38, 3, 18, w, 0, 65.5, 0.5);
  const glass = blk(g, 28, 38, 0.5, new THREE.MeshStandardMaterial({ color: 0x6a7a88, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.3 }), 0, 42, 8.3, false);
  glass.castShadow = false;
  [26, 46].forEach(y => blk(g, 30, 1, 13, woodM(WOOD.mid), 0, y, 0));
  blk(g, 30, 16, 1, woodM(WOOD.mid), 0, 12, 8.2);
}
function musicStand(g) {
  const b = brassM();
  cyl(g, 1, 1, 44, b, 0, 22, 0, 8);
  [0, 2.1, 4.2].forEach(a => { const f = blk(g, 1, 1, 12, b, 0, 1, 0); f.rotation.y = a; f.translateZ(5); });
  const desk = blk(g, 24, 16, 1, b, 0, 50, 1); desk.rotation.x = -0.35;
  blk(g, 24, 1.5, 3, b, 0, 42.5, 4);
}
function pump(g) {
  const st = stoneM();
  blk(g, 32, 22, 22, st, 0, 31, 0);
  blk(g, 26, 6, 18, plainM(0x1a1a1c, 0.3), 0, 39.5, 1);       // the sink's well
  blk(g, 34, 3, 24, st, 0, 43.5, 0);
  [-12, 12].forEach(x => blk(g, 5, 20, 18, st, x, 10, 0));
  const iron = ironM();
  cyl(g, 2.4, 2.8, 26, iron, 0, 56, -6, 10);
  const spout = blk(g, 2.4, 2.4, 10, iron, 0, 64, -1); spout.rotation.x = 0.3;
  const handle = blk(g, 2, 2, 20, iron, 0, 70, -10); handle.rotation.x = -0.5;
}

// The furniture of SCENERY (world.js) and the search spots, by kind.
// Returns the built group (or a sprite, for those that stay cut-outs).
const FURNITURE = {
  chair: (g, p) => chair(g, p.cloth || CLOTH.parlor, p.rocking),
  sofa: (g, p) => sofa(g, p.cloth || CLOTH.parlor, p.len),
  roundTable, sideboard, harpsichord, harp, barrel, bench, stairs, bustOnPedestal,
  console: consoleTable, umbrellas: umbrellaStand, sconce, woodbasket: woodBasket,
  cupboard, pottingBench, cabinet, musicStand, pump,
  tree: bergamotTree,
};
// How deep each is (for snapping it against a wall).
const FURN_DEPTH = { sofa: 28, sideboard: 27, fireplace: 30, console: 16, umbrellas: 13, sconce: 0, woodbasket: 18, cupboard: 22, pottingBench: 20, cabinet: 18, musicStand: 6, pump: 24 };

function addScenery(w, p) {
  const { scene } = w;
  if (p.snap) snapPiece(p, FURN_DEPTH[p.kind] ?? 20);
  if (FURNITURE[p.kind]) {
    const g = piece(scene, p.x, p.y, p.rot || 0);
    FURNITURE[p.kind](g, p);
    if (p.kind === 'roundTable') layBoard(w, p);
    return g;
  }
  if (p.kind === 'shrub') { const g = piece(scene, p.x, p.y); w.sprites.push(pottedShrub(g, scene, p.x, p.y)); return g; }
  if (SPRITES[p.kind]) { w.sprites.push(addSprite(scene, p.kind, p.x, p.y)); return null; }
  switch (p.kind) {
    case 'diningTable': {
      const g = piece(scene, p.x, p.y, p.rot || 0);
      w.feast = diningTable(g);
      return g;
    }
    case 'fireplace': {
      const g = piece(scene, p.x, p.y, p.rot || 0);
      fireplace(g, w);
      return g;
    }
    case 'oven': {
      const mats = [brickTexture(), brickTexture(), brickTexture(), brickTexture(), ovenFrontTexture(), brickTexture()].map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0x501008, emissiveIntensity: 0.15 }));
      const g = piece(scene, p.x, p.y, -Math.PI * 0.75);   // its door towards the room
      mesh(g, new THREE.BoxGeometry(64, 66, 56), mats, 0, 33, 0);
      blk(g, 70, 4, 60, stoneM(), 0, 68, 0);
      cyl(g, 7, 8, 44, plainM(0x3a2418, 1), 0, 92, -14, 10);     // the flue
      w.ovenMats = mats;
      return g;
    }
    case 'fallenShelf': {
      const g = piece(scene, p.x, p.y, 0.2);
      const w1 = woodM(WOOD.light);
      // a tall dresser, toppled forward and caught on its own drawer
      const a = blk(g, 100, 64, 16, w1, 0, 24, -4); a.rotation.x = -0.95;
      [-30, 0, 30].forEach(x => { const s = blk(g, 2, 60, 14, woodM(WOOD.mid), x, 26, -2); s.rotation.x = -0.95; });
      blk(g, 40, 10, 18, woodM(WOOD.mid), -20, 5, 20);
      // broken crockery around it
      const rand = seededRandom(5), shard = plainM(0x9a9282, 0.6);
      for (let i = 0; i < 14; i++) { const s = blk(g, 2 + rand() * 4, 0.6, 2 + rand() * 4, shard, (rand() - 0.5) * 110, 0.3, 18 + rand() * 30, false); s.rotation.y = rand() * 3; }
      return g;
    }
    case 'mirror': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 52), new THREE.MeshStandardMaterial({ map: mirrorTexture(), transparent: true, alphaTest: 0.05, roughness: 0.2, metalness: 0.5 }));
      const c = GRID.cellAtPx(p.x, p.y);
      m.position.set(p.x, 62, c.y - CELL / 2 + WALL_T / 2 + 0.6);   // flat on the square's north wall
      scene.add(m);
      w.mirror = m;
      return m;
    }
    case 'danceFloor': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(170, 150), new THREE.MeshStandardMaterial({ map: danceFloorTexture(), transparent: true, depthWrite: false, roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.4, p.y); m.receiveShadow = true;
      scene.add(m);
      return m;
    }
  }
  return null;
}
