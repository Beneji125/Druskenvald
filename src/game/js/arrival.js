// The arrival. A new game begins outside, at dusk, at the estate's open
// gate at the top of the hill, with Wickermoor Village lighting its lamps
// below (the book's "Meet the Jenkins" and "There Was a Crooked Man"): the
// Jenkins come out of the barn to say hello on their way to town, the grey
// cat Wisp stares you down, and as you walk up to the manor it twists into
// the Crooked House before your eyes. The Crooked Man waves from the porch,
// has his say, bows and vanishes; thunder, and the storm rolls in. Then
// it's yours to play, on the porch.
//
// Only for a new game, and it can be skipped (the Skip button, or Esc).
// The estate itself (the grounds, the barns, the upper storeys and roof of
// the house) is built for every game: it's what's out there in the dark
// when you look off the porch, twisted for good.

const ARRIVAL = {
  gate: { x: 592, z: 2330 },
  hillTop: 2420, hillDrop: 0.34, valley: -1500,
  village: { x: 700, z: 8200 },
  pond: { x: -150, z: 1780, r: 230 },
  barns: [
    { x: 1440, z: 1780, w: 240, d: 160, h: 130, rot: 0.3 },
    { x: 1700, z: 1380, w: 200, d: 150, h: 115, rot: -0.2 },
  ],
  host: { x: 650, z: 1150 },       // where the Crooked Man waits on the porch
  houseC: { x: 613, z: 640 },      // what the house twists about
  bush: { x: 452, z: 2292 },       // where Wisp comes from
};
const STOREYS = 3, ROOF_CAP = 3, ROOF_PITCH = 0.85;
const TOP = WALL_H * STOREYS;
const SKIP = Symbol('skip');
const arrival = {
  active: false, skipped: false, tweens: [], wakers: new Set(),
  cam: { x: 0, z: 0, yaw: 0, pitch: 0, bob: 0, walked: 0, walking: false },
  twist: 1, storm: 1, wobble: 0, close: 0,
  speed: 1,      // >1 hurries it along (for testing)
};
let grounds = null;

function groundY(z) { return z <= ARRIVAL.hillTop ? 0 : Math.max(ARRIVAL.valley, -(z - ARRIVAL.hillTop) * ARRIVAL.hillDrop); }

// How the house bends as it turns crooked: nothing at the ground floor
// (that's the house you walk through, already crooked in its own small
// way), more the higher you go: a twist about the middle, a lean, a sag.
function bend(x, y, z) {
  const h = Math.max(0, y - WALL_H) / (2 * WALL_H);
  if (!h) return [x, y, z];
  const C = ARRIVAL.houseC, a = h * 0.085;
  const rx = x - C.x, rz = z - C.z;
  let bx = C.x + rx * Math.cos(a) - rz * Math.sin(a), bz = C.z + rx * Math.sin(a) + rz * Math.cos(a);
  bx += h * h * (30 * Math.sin(z * 0.006 + 0.7) + 16 * Math.sin(x * 0.017));
  bz += h * h * (22 * Math.sin(x * 0.008 + 2.1));
  const by = y + h * 26 * Math.sin(x * 0.011 + z * 0.005) - h * h * 12;
  return [bx, by, bz];
}

// Flat pieces, gathered into one geometry.
function quadBuilder() {
  const pos = [], uv = [];
  return {
    add(p, t = [[0, 0], [1, 0], [1, 1], [0, 1]]) { [0, 1, 2, 0, 2, 3].forEach(i => { pos.push(...p[i]); uv.push(...t[i]); }); },
    tri(p, t) { [0, 1, 2].forEach(i => { pos.push(...p[i]); uv.push(...t[i]); }); },
    empty() { return !pos.length; },
    geo() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeVertexNormals();
      return g;
    },
  };
}

// A geometry (in world coordinates) that bends with the house.
function warpable(geo) {
  const tidy = Float32Array.from(geo.attributes.position.array);
  const bent = new Float32Array(tidy.length);
  for (let i = 0; i < tidy.length; i += 3) bent.set(bend(tidy[i], tidy[i + 1], tidy[i + 2]), i);
  grounds.warped.push({ geo, tidy, bent });
  return geo;
}

// ─── Building the estate ──────────────────────────────────────────────

function buildGrounds() {
  const scene = world.scene;
  const g = grounds = { warped: [], flowers: [], weeds: [], leafy: [], people: {}, skinAt: -1 };
  const add = (geo, mat, { shadow = true } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const fixed = [];     // static parts, merged at the end (mergeStatic)
  const boxAt = (w, h, d, mat, x, y, z, rot = 0, shadow = true) => {
    const m = add(new THREE.BoxGeometry(w, h, d), mat, { shadow });
    m.position.set(x, y, z); m.rotation.y = rot;
    fixed.push(m);
    return m;
  };

  // ── The ground: grass to the brow of the hill, then the hillside down
  // to the valley and the village.
  const grass = grassTexture(); grass.repeat.set(330, 44);
  g.grassMat = new THREE.MeshStandardMaterial({ map: grass, roughness: 1, side: THREE.DoubleSide });
  world.ground.geometry.dispose();
  // (In smaller pieces and a little below the floors, so a huge triangle's
  // depth can never poke up through the house's floors.)
  world.ground.geometry = new THREE.PlaneGeometry(50000, 6600, 100, 24);
  world.ground.material = g.grassMat;
  g.grassMat.polygonOffset = true; g.grassMat.polygonOffsetFactor = 2; g.grassMat.polygonOffsetUnits = 4;
  world.ground.position.set(1000, -1.5, ARRIVAL.hillTop - 3300);
  const zFoot = ARRIVAL.hillTop - ARRIVAL.valley / ARRIVAL.hillDrop;
  const hill = quadBuilder();
  const gu = (x, z) => [x / 150, z / 150];
  const hillPts = [[-24000, -0.5, ARRIVAL.hillTop], [26000, -0.5, ARRIVAL.hillTop], [26000, ARRIVAL.valley, zFoot], [-24000, ARRIVAL.valley, zFoot]];
  hill.add(hillPts, hillPts.map(p => gu(p[0], p[2])));
  const vale = [[-24000, ARRIVAL.valley, zFoot], [26000, ARRIVAL.valley, zFoot], [26000, ARRIVAL.valley, zFoot + 3500], [-24000, ARRIVAL.valley, zFoot + 3500]];
  hill.add(vale, vale.map(p => gu(p[0], p[2])));
  // Far hills across the valley, so the land meets the sky at the horizon.
  const ridge = x => ARRIVAL.valley + 1500 + 160 * Math.sin(x * 0.0006 + 1) + 90 * Math.sin(x * 0.0017);
  for (let x = -24000; x < 26000; x += 1000) {
    const z0 = zFoot + 3500, z1 = zFoot + 8000;
    const p = [[x, ARRIVAL.valley, z0], [x + 1000, ARRIVAL.valley, z0], [x + 1000, ridge(x + 1000), z1], [x, ridge(x), z1]];
    hill.add(p, p.map(q => gu(q[0], q[2])));
  }
  const hillTex = grassTexture(); hillTex.repeat.set(1, 1);
  g.hillMat = new THREE.MeshStandardMaterial({ map: hillTex, roughness: 1, side: THREE.DoubleSide });
  add(hill.geo(), g.hillMat, { shadow: false });

  // ── The path: from the front steps to the gate and on down the hill.
  const path = quadBuilder();
  const pathPts = [];
  for (let z = 1240; z <= 3700; z += 40) pathPts.push([592 + (z > ARRIVAL.hillTop ? Math.sin((z - ARRIVAL.hillTop) / 700) * 120 : 0), z]);
  for (let i = 0; i < pathPts.length - 1; i++) {
    const [x0, z0] = pathPts[i], [x1, z1] = pathPts[i + 1], w = 34;
    path.add([[x0 - w, groundY(z0) + 0.4, z0], [x0 + w, groundY(z0) + 0.4, z0], [x1 + w, groundY(z1) + 0.4, z1], [x1 - w, groundY(z1) + 0.4, z1]],
      [[0, z0 / 80], [1, z0 / 80], [1, z1 / 80], [0, z1 / 80]]);
  }
  add(path.geo(), new THREE.MeshStandardMaterial({ map: gravelTexture(), roughness: 1, side: THREE.DoubleSide }), { shadow: false });

  // ── The pond.
  g.pondMat = new THREE.MeshStandardMaterial({ color: 0x1c2a3a, roughness: 0.1, metalness: 0.5, emissive: 0x6a4a6a, emissiveIntensity: 0.5 });
  const pond = add(new THREE.CircleGeometry(ARRIVAL.pond.r, 40), g.pondMat, { shadow: false });
  pond.rotation.x = -Math.PI / 2; pond.scale.set(1.3, 1, 1);
  pond.position.set(ARRIVAL.pond.x, 0.6, ARRIVAL.pond.z);

  // ── The fence along the brow of the hill, and the gate, standing open.
  const postMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3a2a1c'), roughness: 0.9 });
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6a645a, roughness: 1 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.6, metalness: 0.4 });
  const G = ARRIVAL.gate, gap = 64;
  [[-1500, G.x - gap - 12], [G.x + gap + 12, 2700]].forEach(([x0, x1]) => {
    for (let x = x0; x <= x1; x += 80) boxAt(6, 52, 6, postMat, x, 26, G.z, 0, false);
    [18, 40].forEach(y => boxAt(x1 - x0, 4, 3, postMat, (x0 + x1) / 2, y, G.z, 0, false));
  });
  [G.x - gap, G.x + gap].forEach((x, i) => {
    boxAt(24, 96, 24, stoneMat, x, 48, G.z);
    boxAt(30, 8, 30, stoneMat, x, 100, G.z);
    // each leaf of the gate swung open, inwards
    const leaf = add(new THREE.BoxGeometry(gap - 14, 64, 3).translate((gap - 14) / 2, 0, 0), ironMat, { shadow: false });
    leaf.position.set(x + (i ? -12 : 12), 40, G.z);
    leaf.rotation.y = i ? Math.PI + 1.6 : -1.6;
  });

  // ── Two barns, red boards and grey roofs, one with its doors open.
  const barnMat = new THREE.MeshStandardMaterial({ map: barnTexture(), roughness: 0.95 });
  const barnRoofMat = new THREE.MeshStandardMaterial({ map: slateTexture(), roughness: 0.9, side: THREE.DoubleSide });
  g.barnGlowMat = new THREE.MeshStandardMaterial({ color: 0x1a1008, emissive: 0xffa050, emissiveIntensity: 0.9 });
  ARRIVAL.barns.forEach((b, i) => {
    boxAt(b.w, b.h, b.d, barnMat, b.x, b.h / 2, b.z, b.rot);
    const roof = quadBuilder(), rh = b.h * 0.5, o = 12, hw = b.w / 2 + o, hd = b.d / 2 + o;
    roof.add([[-hw, b.h, -hd], [hw, b.h, -hd], [hw, b.h + rh, 0], [-hw, b.h + rh, 0]], [[0, 0], [4, 0], [4, 2], [0, 2]]);
    roof.add([[-hw, b.h, hd], [hw, b.h, hd], [hw, b.h + rh, 0], [-hw, b.h + rh, 0]], [[0, 0], [4, 0], [4, 2], [0, 2]]);
    const r = add(roof.geo(), barnRoofMat);
    r.position.set(b.x, 0, b.z); r.rotation.y = b.rot;
    const gable = quadBuilder();
    [-1, 1].forEach(s => gable.tri([[s * b.w / 2, b.h, -b.d / 2], [s * b.w / 2, b.h, b.d / 2], [s * b.w / 2, b.h + rh - 4, 0]], [[0, 0], [1, 0], [0.5, 1]]));
    const gm = add(gable.geo(), new THREE.MeshStandardMaterial({ map: barnTexture(), roughness: 0.95, side: THREE.DoubleSide }));
    gm.position.set(b.x, 0, b.z); gm.rotation.y = b.rot;
    // the doors, on the end facing the path
    const door = add(new THREE.PlaneGeometry(64, 86), i === 0 ? g.barnGlowMat : postMat, { shadow: false });
    const [dx, dz] = turnXZ(-b.w / 2 - 0.8, 0, b.rot);
    door.position.set(b.x + dx, 43, b.z + dz); door.rotation.y = b.rot - Math.PI / 2;
    if (i === 0) g.barnDoor = { x: b.x + turnXZ(-b.w / 2 - 30, 0, b.rot)[0], z: b.z + turnXZ(-b.w / 2 - 30, 0, b.rot)[1] };
  });

  // ── The house above the ground floor: two more storeys on the same
  // footprint (except the glasshouse), a hipped roof, chimneys, the
  // turret over the gallery, and lit windows.
  const upper = c => !!c && c.walk && !!c.room && c.room !== 'porch' && c.room !== 'conservatory';
  const half = CELL / 2, T = WALL_T / 2;
  const walls = quadBuilder(), wins = quadBuilder();
  GRID.cells.forEach(c => {
    if (!upper(c)) return;
    DIRS.forEach(([dx, dy], d) => {
      if (upper(GRID.at(c.cx + dx, c.cy + dy))) return;
      const k = [[c.x - half, c.y - half], [c.x + half, c.y - half], [c.x + half, c.y + half], [c.x - half, c.y + half]];
      let [a, b] = [[k[0], k[1]], [k[1], k[2]], [k[2], k[3]], [k[3], k[0]]][d];
      const ux = (b[0] - a[0]) / CELL, uz = (b[1] - a[1]) / CELL;
      a = [a[0] + dx * T - ux * T, a[1] + dy * T - uz * T]; b = [b[0] + dx * T + ux * T, b[1] + dy * T + uz * T];
      const la = wallLean(a[0], a[1]), lb = wallLean(b[0], b[1]);
      for (let r = 0; r < 4; r++) {
        const y0 = WALL_H - 2 + r * (TOP - WALL_H + 2) / 4, y1 = WALL_H - 2 + (r + 1) * (TOP - WALL_H + 2) / 4;
        walls.add([[a[0] + la[0], y0, a[1] + la[1]], [b[0] + lb[0], y0, b[1] + lb[1]], [b[0] + lb[0], y1, b[1] + lb[1]], [a[0] + la[0], y1, a[1] + la[1]]],
          [[0, y0 / WALL_H], [1, y0 / WALL_H], [1, y1 / WALL_H], [0, y1 / WALL_H]]);
      }
      if ((c.cx + c.cy + d) % 2) return;
      // a window on each upper storey
      const mx = (a[0] + b[0]) / 2 + dx * 1.2 + (la[0] + lb[0]) / 2, mz = (a[1] + b[1]) / 2 + dy * 1.2 + (la[1] + lb[1]) / 2;
      for (let s = 1; s < STOREYS; s++) {
        const yc = WALL_H * (s + 0.45), hw = 17, hh = 34;
        wins.add([[mx - ux * hw, yc - hh, mz - uz * hw], [mx + ux * hw, yc - hh, mz + uz * hw], [mx + ux * hw, yc + hh, mz + uz * hw], [mx - ux * hw, yc + hh, mz - uz * hw]]);
      }
    });
  });
  // The rotting skin: one canvas, redrawn as the rot spreads, on these
  // walls and on the ground floor's outside walls too.
  g.skinCanvas = artCanvas(128, 256)[0];
  houseSkin(g.skinCanvas, 1);
  g.skinTex = artTexture(g.skinCanvas, { repeat: true });
  // (repainted from the weatherboard photograph once it has loaded)
  whenArt(photoSrc('weathered_plank_siding'), () => { houseSkin(g.skinCanvas, Math.max(0, g.skinAt)); g.skinTex.needsUpdate = true; });
  g.skinMat = new THREE.MeshStandardMaterial({ map: g.skinTex, roughness: 0.95, side: THREE.DoubleSide });
  add(warpable(walls.geo()), g.skinMat);
  const ext = world.wallMats.exterior;
  if (ext) { ext.map = g.skinTex; ext.needsUpdate = true; }
  const win = windowTextures();
  g.winMat = new THREE.MeshStandardMaterial({ map: win.map, transparent: true, alphaTest: 0.05, emissive: 0xffb060, emissiveMap: win.glow, emissiveIntensity: 0, roughness: 0.4, side: THREE.DoubleSide });

  // The roof: each corner of the footprint's squares raised by how far it
  // is from the edge (up to a flat top): a hipped roof that follows the
  // house's shape.
  const corner = (i, j) => [GRID.ox + i * CELL, GRID.oy + j * CELL];
  const edgeCorners = [];
  for (let j = 0; j <= GRID.rows; j++) for (let i = 0; i <= GRID.cols; i++) {
    const around = [GRID.at(i - 1, j - 1), GRID.at(i, j - 1), GRID.at(i - 1, j), GRID.at(i, j)];
    if (around.some(upper) && !around.every(upper)) edgeCorners.push([i, j]);
  }
  const heights = new Map();
  const roofH = (i, j) => {
    const key = i + ',' + j;
    if (!heights.has(key)) {
      let d = Infinity;
      edgeCorners.forEach(([a, b]) => { d = Math.min(d, Math.hypot(a - i, b - j)); });
      heights.set(key, TOP + Math.min(d, ROOF_CAP) * ROOF_PITCH * CELL);
    }
    return heights.get(key);
  };
  const roof = quadBuilder();
  let chimneys = [];
  GRID.cells.forEach(c => {
    if (!upper(c)) return;
    const i = c.cx, j = c.cy;
    const p = [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].map(([a, b]) => { const [x, z] = corner(a, b); return [x, roofH(a, b), z]; });
    const t = p.map(q => [q[0] / 60, q[2] / 60]);
    if (Math.abs(p[0][1] - p[2][1]) <= Math.abs(p[1][1] - p[3][1])) { roof.tri([p[0], p[1], p[2]], [t[0], t[1], t[2]]); roof.tri([p[0], p[2], p[3]], [t[0], t[2], t[3]]); }
    else { roof.tri([p[0], p[1], p[3]], [t[0], t[1], t[3]]); roof.tri([p[1], p[2], p[3]], [t[1], t[2], t[3]]); }
    if (Math.min(...p.map(q => q[1])) >= TOP + ROOF_CAP * ROOF_PITCH * CELL - 1) chimneys.push(c);
  });
  g.roofMat = new THREE.MeshStandardMaterial({ map: slateTexture(), roughness: 0.85, side: THREE.DoubleSide });
  add(warpable(roof.geo()), g.roofMat);
  const brickMat = new THREE.MeshStandardMaterial({ color: 0x3a2622, roughness: 1 });
  // The central tower (as in the official painting of the house): a
  // square lantern-room on the flat of the roof, a steep cap with iron
  // cresting, and one round window that wakes up, burning orange, when the
  // house turns.
  const flat = chimneys.slice().sort((a, b) => Math.hypot(a.x - ARRIVAL.houseC.x, a.y - (ARRIVAL.houseC.z + 160)) - Math.hypot(b.x - ARRIVAL.houseC.x, b.y - (ARRIVAL.houseC.z + 160)))[0];
  if (flat) {
    const y0 = TOP + ROOF_CAP * ROOF_PITCH * CELL - 6, tw = 70, th = 150, tx = flat.x, tz = flat.y;
    add(warpable(new THREE.BoxGeometry(tw, th, tw, 2, 4, 2).translate(tx, y0 + th / 2, tz)), g.skinMat);
    add(warpable(new THREE.BoxGeometry(tw + 12, 5, tw + 12, 2, 1, 2).translate(tx, y0 + th + 2, tz)), g.roofMat);
    add(warpable(new THREE.ConeGeometry((tw + 6) * 0.72, 64, 4, 3).rotateY(Math.PI / 4).translate(tx, y0 + th + 36, tz)), g.roofMat);
    const crest = quadBuilder();
    for (let i = -3; i <= 3; i++) { const x = tx + i * 9; crest.add([[x - 0.8, y0 + th + 66, tz - 0.5], [x + 0.8, y0 + th + 66, tz - 0.5], [x + 0.8, y0 + th + 82, tz - 0.5], [x - 0.8, y0 + th + 82, tz - 0.5]]); }
    add(warpable(crest.geo()), new THREE.MeshStandardMaterial({ color: 0x141414, side: THREE.DoubleSide }), { shadow: false });
    g.eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1410 });
    add(warpable(new THREE.CircleGeometry(18, 24).translate(tx, y0 + th * 0.62, tz + tw / 2 + 0.8)), g.eyeMat, { shadow: false });
    const bars = quadBuilder(), yc = y0 + th * 0.62, zf = tz + tw / 2 + 1.2;
    bars.add([[tx - 18, yc - 1.4, zf], [tx + 18, yc - 1.4, zf], [tx + 18, yc + 1.4, zf], [tx - 18, yc + 1.4, zf]]);
    bars.add([[tx - 1.4, yc - 18, zf], [tx + 1.4, yc - 18, zf], [tx + 1.4, yc + 18, zf], [tx - 1.4, yc + 18, zf]]);
    add(warpable(bars.geo()), new THREE.MeshBasicMaterial({ color: 0x0a0806, side: THREE.DoubleSide }), { shadow: false });
    chimneys = chimneys.filter(c => Math.hypot(c.x - tx, c.y - tz) > 120);
  }
  chimneys = [chimneys[1], chimneys[chimneys.length - 2]].filter(Boolean);
  chimneys.forEach(c => {
    const y0 = TOP + ROOF_CAP * ROOF_PITCH * CELL - 10;
    add(warpable(new THREE.BoxGeometry(26, 90, 26, 1, 3, 1).translate(c.x, y0 + 45, c.y)), brickMat);
  });
  // The turret, rising out of the round gallery.
  const tur = { x: 250, z: 905, r: 112 }, tTop = TOP + WALL_H;
  add(warpable(new THREE.CylinderGeometry(tur.r, tur.r, tTop - WALL_H + 2, 20, 6).translate(tur.x, (tTop + WALL_H - 2) / 2, tur.z)), g.skinMat);
  add(warpable(new THREE.ConeGeometry(tur.r + 16, 330, 20, 5).translate(tur.x, tTop + 165, tur.z)), g.roofMat);
  add(warpable(new THREE.CylinderGeometry(1.2, 1.2, 40, 6, 2).translate(tur.x, tTop + 350, tur.z)), new THREE.MeshStandardMaterial({ color: 0x141414 }), { shadow: false });
  [-1.1, -0.35, 0.4, 1.15, Math.PI].forEach(a => {
    const nx = Math.sin(a), nz = Math.cos(a), tx = Math.cos(a), tz = -Math.sin(a);
    for (let s = 1; s <= STOREYS; s++) {
      const yc = WALL_H * (s + 0.45), cx = tur.x + nx * (tur.r + 1.5), cz = tur.z + nz * (tur.r + 1.5);
      wins.add([[cx - tx * 14, yc - 30, cz - tz * 14], [cx + tx * 14, yc - 30, cz + tz * 14], [cx + tx * 14, yc + 30, cz + tz * 14], [cx - tx * 14, yc + 30, cz - tz * 14]]);
    }
  });
  add(warpable(wins.geo()), g.winMat, { shadow: false });

  // ── The porch: a roof over it, and posts along its rail.
  const porchTop = quadBuilder();
  GRID.cells.forEach(c => {
    if (!c.walk || c.room !== 'porch' || c.noEscape) return;
    porchTop.add([[c.x - half, WALL_H + 0.6, c.y - half], [c.x + half, WALL_H + 0.6, c.y - half], [c.x + half, WALL_H + 0.6, c.y + half], [c.x - half, WALL_H + 0.6, c.y + half]],
      [[(c.x - half) / 60, (c.y - half) / 60], [(c.x + half) / 60, (c.y - half) / 60], [(c.x + half) / 60, (c.y + half) / 60], [(c.x - half) / 60, (c.y + half) / 60]]);
    c.edges.forEach((e, d) => {
      if (e !== 'rail') return;
      const n = DIRS[d], k = [[c.x - half, c.y - half], [c.x + half, c.y - half], [c.x + half, c.y + half], [c.x - half, c.y + half]];
      const [a] = [[k[0], k[1]], [k[1], k[2]], [k[2], k[3]], [k[3], k[0]]][d];
      boxAt(d % 2 ? 6 : CELL + 2, 10, d % 2 ? CELL + 2 : 6, postMat, c.x + n[0] * half, WALL_H - 5, c.y + n[1] * half, 0, false);
      if ((c.cx + c.cy) % 2 === 0) boxAt(8, WALL_H, 8, postMat, a[0], WALL_H / 2, a[1]);
      // the garden beds below the rail: flowers now, weeds and thistles later
      const fx = c.x + n[0] * (half + 20), fz = c.y + n[1] * (half + 20);
      const f = addSprite(scene, 'flowers', fx, fz); f.scale.set(1.3, 1.3, 1.3); g.flowers.push(f);
      const w = addSprite(scene, 'weeds', fx, fz); w.scale.set(1.4, 1.4, 1.4); g.weeds.push(w);
    });
  });
  add(porchTop.geo(), g.roofMat, { shadow: false });

  // ── Trees: the dead ones you'll see from the porch were, before, in
  // leaf and in blossom. Moved off the path, the pond and the barns.
  const clear = [{ x: ARRIVAL.pond.x, z: ARRIVAL.pond.z, r: ARRIVAL.pond.r * 1.3 + 150 }, ...ARRIVAL.barns.map(b => ({ x: b.x, z: b.z, r: 260 }))];
  for (let z = 1150; z <= 2450; z += 100) clear.push({ x: 592, z, r: 260 });
  world.trees.forEach(t => {
    for (let n = 0; n < 40; n++) {
      const hit = clear.find(k => Math.hypot(t.position.x - k.x, t.position.z - k.z) < k.r);
      if (!hit) break;
      const dx = t.position.x - hit.x || 1, dz = t.position.z - hit.z, len = Math.hypot(dx, dz);
      t.position.x += dx / len * 40; t.position.z += dz / len * 40;
    }
    t.position.y = groundY(t.position.z);
    const leaf = addSprite(scene, 'tree', t.position.x, t.position.z);
    leaf.position.y = t.position.y;
    leaf.scale.setScalar(2.4); leaf.material.opacity = 0; leaf.visible = false;
    g.leafy.push(leaf);
  });
  g.bush = addSprite(scene, 'tree', ARRIVAL.bush.x, ARRIVAL.bush.z);
  g.bush.scale.setScalar(0.45);
  g.leafy.push(g.bush);

  // ── The village, far below: lamps coming on.
  const lamps = [], rand = seededRandom(61);
  const V = ARRIVAL.village;
  for (let i = 0; i < 150; i++) {
    const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 1300;
    lamps.push(V.x + Math.cos(a) * r * 1.6, ARRIVAL.valley + 10 + rand() * 30, V.z + Math.sin(a) * r * 0.7);
  }
  const lampGeo = new THREE.BufferGeometry();
  lampGeo.setAttribute('position', new THREE.Float32BufferAttribute(lamps, 3));
  g.lampMat = new THREE.PointsMaterial({ map: lampGlowTexture(), size: 70, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, color: 0xffd8a0 });
  g.village = new THREE.Points(lampGeo, g.lampMat);
  g.village.frustumCulled = false;
  scene.add(g.village);

  // ── The sky at dusk, and the low sun.
  g.sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 24, 12), new THREE.MeshBasicMaterial({ map: duskSkyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }));
  g.sky.renderOrder = -1;
  scene.add(g.sky);
  // After the twist: a churning green-grey storm sky (the official
  // painting's), and the moon behind it.
  g.clouds = new THREE.Mesh(new THREE.SphereGeometry(8800, 24, 12), new THREE.MeshBasicMaterial({ map: stormCloudTexture(), side: THREE.BackSide, fog: false, depthWrite: false, transparent: true, opacity: 0 }));
  g.clouds.renderOrder = -1;
  scene.add(g.clouds);
  g.moon = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshBasicMaterial({ map: moonTexture(), fog: false, depthWrite: false, transparent: true }));
  g.moon.renderOrder = -1;
  scene.add(g.moon);
  g.sun = new THREE.DirectionalLight(0xffa070, 0);
  g.sun.position.set(ARRIVAL.houseC.x - 3000, 600, ARRIVAL.houseC.z + 1600);
  g.sun.target.position.set(ARRIVAL.houseC.x, 0, ARRIVAL.houseC.z);
  scene.add(g.sun, g.sun.target);

  // ── The people.
  ['walter', 'gilly', 'dani', 'shuck', 'wisp', 'crookedHost'].forEach(k => {
    const s = addSprite(scene, k, 0, 0);
    s.visible = false;
    s.material.transparent = true;
    g.people[k] = s;
  });
  const host = g.people.crookedHost.material;
  host.depthWrite = false; host.alphaTest = 0;

  mergeStatic(scene, fixed);
  setTwist(1);
  showOutdoors(false);
}

// How far the house has turned crooked (0 tidy, 1 crooked).
function setTwist(k) {
  const g = grounds;
  arrival.twist = k;
  g.warped.forEach(w => {
    const a = w.geo.attributes.position.array;
    for (let i = 0; i < a.length; i++) a[i] = w.tidy[i] + (w.bent[i] - w.tidy[i]) * k;
    w.geo.attributes.position.needsUpdate = true;
    w.geo.computeVertexNormals();
    w.geo.computeBoundingSphere();
  });
  const q = Math.round(k * 12) / 12;
  if (q !== g.skinAt) { g.skinAt = q; houseSkin(g.skinCanvas, q); g.skinTex.needsUpdate = true; }
  g.winMat.emissiveIntensity = 1.4 * Math.max(0, 1 - k * 1.6);
  // the tower's round window: dark glass, then a burning eye
  if (g.eyeMat) g.eyeMat.color.set(0x1a1410).lerp(new THREE.Color(0xff8a2a), clamp01((k - 0.4) / 0.6));
  g.winMat.color.setScalar(1 - k * 0.75);
  g.roofMat.color.setScalar(1 - k * 0.45);
  g.pondMat.emissiveIntensity = 0.5 * (1 - k);
  g.grassMat.color.setScalar(lerp(1, 0.45, k));
  g.hillMat.color.setScalar(lerp(1, 0.45, k));
  g.barnGlowMat.emissiveIntensity = 0.9 * (1 - k * 0.7);
  // Petals wilt and drop; weeds and thistles push up through the beds.
  g.flowers.forEach((f, i) => {
    const w = clamp01(k * 1.6 - (i % 5) * 0.08);
    f.scale.set(1.3, 1.3 * (1 - w), 1.3);
    f.material.color.setRGB(1 - w * 0.6, 1 - w * 0.75, 1 - w * 0.7);
    f.visible = w < 1;
  });
  g.weeds.forEach((w, i) => {
    const s = clamp01((k - 0.3 - (i % 4) * 0.05) / 0.5);
    w.scale.set(1.4, 1.4 * s, 1.4);
    w.visible = s > 0;
  });
  // The trees lose their leaves.
  g.leafy.forEach(l => { l.material.opacity = 1 - k; l.visible = k < 1 && arrival.active; });
  world.trees.forEach(t => { t.material.transparent = true; t.material.opacity = k; t.visible = k > 0; });
}

// The outdoors only the arrival shows: the sky and the sun, the lamps of
// the village, the people.
function showOutdoors(on) {
  const g = grounds;
  g.sky.visible = on;
  g.clouds.visible = on;
  g.moon.visible = on;
  g.village.visible = on;
  g.sun.intensity = 0;
  Object.values(g.people).forEach(s => { s.visible = false; });
  g.leafy.forEach(l => { l.visible = on && arrival.twist < 1; });
}

// ─── Running it ───────────────────────────────────────────────────────

function tween(ms, fn) {
  return new Promise(resolve => {
    if (arrival.skipped) return resolve();
    arrival.tweens.push({ t0: performance.now(), ms: ms / arrival.speed, fn, resolve });
  });
}
const wait = ms => tween(ms, () => {});
const smooth = k => k * k * (3 - 2 * k);
// Each beat of the scene: if it's been skipped meanwhile, stop there.
async function beat(p) { const r = await p; if (arrival.skipped) throw SKIP; return r; }

// The angle `to`, give or take whole turns, nearest `from`.
function nearAngle(from, to) { return to + Math.round((from - to) / (Math.PI * 2)) * Math.PI * 2; }
function yawTo(x, z) { const c = arrival.cam; return Math.atan2(-(x - c.x), -(z - c.z)); }

function walkTo(x, z, ms, yaw) {
  const c = arrival.cam, x0 = c.x, z0 = c.z, y0 = c.yaw, y1 = yaw === undefined ? y0 : nearAngle(y0, yaw);
  c.walking = true;
  return tween(ms, k => {
    const e = smooth(k);
    c.x = lerp(x0, x, e); c.z = lerp(z0, z, e); c.yaw = lerp(y0, y1, e);
    if (k >= 1) c.walking = false;
  });
}
function lookTo(yaw, pitch, ms) {
  const c = arrival.cam, y0 = c.yaw, y1 = nearAngle(y0, yaw), p0 = c.pitch;
  return tween(ms, k => { const e = smooth(k); c.yaw = lerp(y0, y1, e); if (pitch !== undefined) c.pitch = lerp(p0, pitch, e); });
}
// Someone walking (sprites keep to the ground, with a little bob).
function walkSprite(s, x, z, ms) {
  const x0 = s.position.x, z0 = s.position.z, ph = Math.random() * 6;
  return tween(ms, k => {
    s.position.x = lerp(x0, x, k); s.position.z = lerp(z0, z, k);
    s.position.y = groundY(s.position.z) + (k < 1 ? Math.abs(Math.sin(k * ms / 160 + ph)) * 1.6 : 0);
  });
}
function placeSprite(s, x, z) { s.position.set(x, groundY(z), z); s.visible = true; s.material.opacity = 1; }
function fadeFigure(s, to, ms) {
  const from = s.material.opacity;
  s.visible = true;
  return tween(ms, k => { s.material.opacity = lerp(from, to, k); if (k >= 1 && to === 0) s.visible = false; });
}

// A line of narration over the scene. It stays long enough to read, or
// until you click it or press Space or Enter.
function caption(text) {
  const el = $('arrival-cap');
  el.textContent = text;
  el.hidden = false;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  const ms = Math.max(3800, text.length * 62) / arrival.speed;
  return beat(new Promise(resolve => {
    const done = () => { arrival.wakers.delete(done); clearTimeout(timer); el.classList.remove('show'); resolve(); };
    const timer = setTimeout(done, ms);
    arrival.wakers.add(done);
  }));
}
const say = (who, text, choices) => beat(ui.say(who, text, choices));

async function runArrival() {
  const A = arrival, g = grounds, P = g.people;
  Object.assign(A, { active: true, skipped: false, tweens: [], wobble: 0, close: 0 });
  game.busy = true;
  $('game').classList.add('arriving');
  $('btn-skip').hidden = false;
  hideRoomCard();
  sound.setCalm(true);
  sound.setTheme(null, { fade: 0.3 });
  setFrontDoor(false, true);
  setTwist(0);
  A.storm = 0;
  showOutdoors(true);
  world.camera.far = 40000; world.camera.updateProjectionMatrix();
  Object.assign(A.cam, { x: 626, z: 2640, yaw: Math.PI, pitch: -0.13, walking: false });
  const f = $('fade');
  f.style.transition = 'none'; f.style.background = '#000'; f.style.opacity = '1';
  try {
    await beat(wait(200));
    fadeFrom(2500);
    // The view back down the hill, then round to the estate.
    await caption('The road from Wickermoor climbs the hill in the last of the light. Behind you, down in the valley, the village is lighting its lamps.');
    lookTo(0.02, 0.06, 5000);
    await caption('At the top of the hill, a fence, and its gate standing open. Beyond it lies a well-kept estate: a pond, two barns, and a stately three-storey manor with a porch wrapped around it. The Druskenvalds have asked you to dinner.');
    await beat(walkTo(598, 2420, 2600, 0));
    await beat(walkTo(592, 2190, 2800, 0));

    // The Jenkins, out of the barn.
    const door = g.barnDoor, meet = { x: 690, z: 2096 };
    const family = [['walter', 0, 0], ['gilly', 30, 12], ['dani', 54, 6], ['shuck', 74, 16]];
    family.forEach(([k, dx, dz]) => placeSprite(P[k], door.x + dx * 0.3, door.z + dz));
    lookTo(yawTo(door.x, door.z), 0.0, 1600);
    const walk = Promise.all(family.map(([k, dx, dz]) => walkSprite(P[k], meet.x + dx - 30, meet.z + dz * 0.5, 8000)));
    await beat(wait(1400));
    lookTo(yawTo(meet.x + 10, meet.z), -0.02, 6200);
    await caption('Three people come out of the nearest barn and wave to you: a tall, bearded man in a flat cap, a woman in a shawl, and a girl with a red-furred dog at her heels.');
    await beat(walk);
    await beat(lookTo(yawTo(meet.x + 10, meet.z), -0.03, 500));
    await jenkinsTalk();

    // Off they go, through the gate and down the hill.
    const out = family.map(([k, dx], i) => walkSprite(P[k], 600 + dx * 0.5 - 20, ARRIVAL.gate.z + 20 + i * 8, 4200).then(() => walkSprite(P[k], 640 + dx * 0.4, 3150 + i * 12, 9000)));
    lookTo(yawTo(600, ARRIVAL.gate.z + 60), -0.05, 2600);
    await caption('They pass through the gate and set off down the hill towards Wickermoor. The girl keeps looking back at the house until the road dips and takes her out of sight.');
    // Wisp.
    placeSprite(P.wisp, ARRIVAL.bush.x - 6, ARRIVAL.bush.z + 4);
    await beat(lookTo(yawTo(540, 2300), -0.3, 1500));
    await beat(walkSprite(P.wisp, 548, 2300, 2600));
    await caption('A grey cat strolls out of the bushes, quite unhurried. It stops, and stares at you, one after another, for a long moment.');
    await say('The grey cat', '“Mrrrreoww…”');
    walkSprite(P.wisp, 980, 2140, 7000).then(() => { P.wisp.visible = false; });
    await beat(wait(1500));
    Promise.all(out).then(() => family.forEach(([k]) => { P[k].visible = false; }));

    // Up the path to the house.
    await beat(lookTo(0, 0.08, 1800));
    walkTo(592, 1940, 5200, 0);
    await caption('The path climbs through the garden towards the house. Lamplight glows in the upper windows, and the flowerbeds along the porch are bright even in the dusk.');
    await beat(wait(800));

    // The house turns.
    ui.flash('#3a4a22', 1400);
    sound.startDrone();
    lookTo(0, 0.17, 3000);
    const twist = tween(8000, k => { setTwist(smooth(k)); A.wobble = Math.sin(k * Math.PI); });
    await caption('As you near the house, a wave of nausea slams into you. Before your eyes its pleasant face shifts: shadow and rot spread across its walls, and every line of wall and eave, window and roof twists to an angle that shouldn’t be.');
    await caption('The garden chokes with weeds and thistles; bright petals wilt and drop away. In a breath the house has aged decades. It is a house out of a nightmare.');
    await beat(twist);
    sound.stopDrone();
    A.wobble = 0;

    // The Crooked Man.
    const host = P.crookedHost;
    placeSprite(host, ARRIVAL.host.x, ARRIVAL.host.z);
    host.material.opacity = 0;
    strike(0.5);
    await beat(fadeFigure(host, 1, 900));
    A.waving = true;
    await beat(lookTo(yawTo(ARRIVAL.host.x, ARRIVAL.host.z), 0.06, 900));
    await say('A voice from the porch', '“Welcome to the Crooked House, friends. We’ve been expecting you.”');
    await beat(walkTo(596, 1440, 4200, yawTo(ARRIVAL.host.x, ARRIVAL.host.z)));
    await beat(lookTo(yawTo(ARRIVAL.host.x, ARRIVAL.host.z), 0.1, 600));
    A.waving = false;
    const how = await hostTalk();

    if (how === 'bowed') {
      await caption('He doffs his hat to you and bows, low and mocking.');
      await beat(tween(1400, k => { host.scale.y = 1 - Math.sin(k * Math.PI) * 0.22; }));
    } else {
      await beat(walkTo(596, 1330, 700));
    }
    await beat(fadeFigure(host, 0, how === 'bowed' ? 500 : 120));

    // Thunder, and the storm.
    strike(1.6);
    sound.thunder(1.6);
    ui.flash('#dfe6ff', 900);
    sound.setCalm(false);
    sound.setPlace('out');
    const storm = tween(3500, k => { A.storm = smooth(k); });
    await caption('As if on his command, a cacophonous boom of thunder shakes the house, and the storm rolls in: the sky opens, the rain pours down, the wind howls.');
    await beat(storm);
    setFrontDoor(true);
    await caption('On the porch, the front door creaks open.');
    await beat(walkTo(592, 1262, 3600, 0));
    const start = GRID.at(game.cx, game.cy);
    await beat(tween(1800, k => { A.close = k; arrival.cam.x = lerp(592, start.x, smooth(k)); arrival.cam.z = lerp(1262, start.y + CAM_BACK, smooth(k)); arrival.cam.walking = k < 1; arrival.cam.pitch = lerp(0.1, -0.04, smooth(k)); }));
  } catch (e) {
    if (e !== SKIP) console.error(e);
  }
  finishArrival();
}

// The Jenkins (book: "The Conversation with the Jenkins"). Walter can't
// speak: he signs, and Gilly or Dani put it into words.
async function jenkinsTalk() {
  await say('Gilly Jenkin', '“Evening! You’ll be the Druskenvalds’ dinner guests, I expect. I’m Gilly Jenkin. This is my husband, Walter, and our Dani. And that’s Shuck.”');
  const topics = [
    { id: 'where', text: 'Where are you off to?', lines: [
      ['Gilly Jenkin', '“Down to the village for a few things we can’t grow ourselves. It’s a rare outing for us, with the land to keep.”'],
      ['Dani', '“And a book. For me.”'],
      ['', 'Walter signs something, and Dani rolls her eyes. “Papa says one book.”'] ] },
    { id: 'hosts', text: 'What are the Druskenvalds like?', lines: [
      ['Gilly Jenkin', '“We’ve only just met them: Phillip and Adela moved in last evening. Truth be told, we weren’t sure they’d ever come at all. But we’re glad they did.”'],
      ['', 'Walter signs. “He says we haven’t seen them yet tonight, mind,” Gilly adds. “Still settling in, I expect.”'] ] },
    { id: 'village', text: 'How do you find Wickermoor?', lines: [
      ['Gilly Jenkin', '“Good people, mostly. Mayor Somerton especially: she’s been nothing but kind to us.”'],
      ['', 'Walter nods firmly.'] ] },
    { id: 'dani', text: 'Say hello to Dani', lines: [
      ['', 'Dani doesn’t answer. She’s looking past you, at the house, and the red dog presses close against her legs.'],
      ['Dani', '“Don’t stay too late.”'],
      ['Gilly Jenkin', '“Dani! Don’t mind her. She’s got an imagination on her, this one.”'] ] },
  ];
  const asked = new Set();
  let text = 'Walter smiles and signs something with his big hands. Gilly laughs. “He says welcome to the estate. We look after the grounds, and grow most of what we eat.”';
  for (;;) {
    const left = topics.filter(t => !asked.has(t.id));
    const pick = await say('', text, [...left.map(t => ({ id: t.id, text: t.text })), { id: 'bye', text: 'Enjoy your evening' }]);
    if (pick !== 'bye') {
      asked.add(pick);
      for (const [who, line] of topics.find(t => t.id === pick).lines) await say(who, line);
    }
    if (pick === 'bye' || asked.size === topics.length) break;
    text = 'Gilly glances down the hill at the fading light. Walter waits, cap in hand.';
  }
  await say('Gilly Jenkin', '“Well, we mustn’t keep you. Have a lovely visit with the Druskenvalds!”');
}

// The Crooked Man on the porch (book: "A Crooked Chat"). Ask what you
// like; try to lay a hand on him and the house simply takes him away.
async function hostTalk() {
  await caption('Closer, you can see him properly: tall, lanky and contorted, his limbs jutting at odd angles and his neck bent to one side like a hanged man’s. He wears a tattered suit and a bent-top hat that hides his eyes, and his grin is impossibly wide, and full of crooked yellow teeth.');
  const lines = {
    who: ['Who are you?', '“Who I am is unimportant. What I am is for you to find out. I am your destiny. You will be crooked too.”'],
    hosts: ['Where are Phillip and Adela?', '“Phillip and Adela are inside, waiting for you. They are getting to know the house. Or, more accurately, the house is getting to know them.”'],
    want: ['What do you want with us?', '“Phillip, Adela, you, and all your kind are a curse upon this once beautiful land. You will return from whence you came in blood and fire.”'],
  };
  const asked = new Set();
  let text = 'He waits at the top of the steps, grinning, his head hanging to one side.';
  for (;;) {
    const choices = Object.entries(lines).filter(([id]) => !asked.has(id)).map(([id, [q]]) => ({ id, text: q }));
    choices.push({ id: 'go', text: asked.size ? 'Enough. We’re going in.' : 'Say nothing' }, { id: 'rush', text: 'Rush at him' });
    const pick = await say('', text, choices);
    if (pick === 'rush') {
      await say('', 'You run at him, up the steps — and close on nothing. The house has simply taken him back. The air where he stood smells of wet earth.');
      return 'gone';
    }
    if (pick === 'go') break;
    asked.add(pick);
    await say('The Crooked Man', lines[pick][1]);
    if (asked.size === Object.keys(lines).length) break;
    text = 'He grins on, waiting.';
  }
  await say('The Crooked Man', '“Go on in and enjoy the refreshments I’ve prepared for you. Phillip and Adela will be with you shortly.”');
  return 'bowed';
}

function skipArrival() {
  if (!arrival.active || arrival.skipped) return;
  arrival.skipped = true;
  arrival.tweens.forEach(t => t.resolve());
  arrival.tweens = [];
  [...arrival.wakers].forEach(w => w());
  if (ui.cancelSay) ui.cancelSay();
}

// Hand over to the game, on the porch, facing the open front door.
function finishArrival() {
  if (!arrival.active) return;
  const A = arrival;
  A.skipped = true;
  A.tweens.forEach(t => t.resolve()); A.tweens = [];
  [...A.wakers].forEach(w => w());
  if (ui.cancelSay) ui.cancelSay();
  A.active = false;
  $('arrival-cap').hidden = true;
  $('btn-skip').hidden = true;
  $('game').classList.remove('arriving');
  sound.stopDrone();
  sound.setCalm(false);
  sound.setPlace('out');
  A.storm = 1; A.wobble = 0; A.waving = false;
  setTwist(1);
  showOutdoors(false);
  grounds.people.crookedHost.scale.y = 1;
  setFrontDoor(true, true);
  world.camera.far = 3000;
  world.scene.fog.color.set(0x030306); world.scene.fog.density = 0.0042;
  world.scene.background.set(0x030306);
  resize();
  const f = $('fade');
  f.style.transition = 'opacity 600ms ease'; f.style.opacity = '0';
  // Facing north, into the house.
  game.dir = 0; yaw = 0;
  motion.from = motion.to = null;
  snapMood = true;
  game.roomsSeen.delete('porch');
  game.flags.arrived = true;
  game.busy = false;
  lockInput(500);
  enteredCell(null);
  $('view').focus({ preventScroll: true });
}

// The front door: shut until the Crooked Man has gone. `instant` sets it
// without the creak.
function setFrontDoor(open, instant = false) {
  DOORS.list.filter(d => d.rooms.includes('porch')).forEach(d => {
    if (d.open === open) return;
    if (!instant) return swingDoor(d, open);
    d.open = open;
    if (open) game.doorsOpen.add(d.id); else game.doorsOpen.delete(d.id);
    const v = world.doors[d.id];
    v.amount = v.target = open ? 1 : 0;
    v.leaves.forEach(l => { l.pivot.rotation.y = l.base + l.sign * v.amount * DOOR_SWING; });
  });
}

// Every frame of the arrival: the camera, the light and the sky, the
// storm when it comes, and anyone walking.
function tickArrival(now, dt) {
  const A = arrival, g = grounds, c = A.cam, cam = world.camera;
  A.tweens.slice().forEach(t => {
    const k = Math.min(1, (now - t.t0) / t.ms);
    t.fn(k);
    if (k >= 1) { A.tweens.splice(A.tweens.indexOf(t), 1); t.resolve(); }
  });
  // Walking bobs the view; the twist makes it reel.
  if (c.walking) { c.walked += dt; c.bob = Math.sin(c.walked * 9) * 2; } else c.bob *= 0.9;
  cam.position.set(c.x, EYE_H + groundY(c.z) + c.bob, c.z);
  cam.rotation.order = 'YXZ';
  cam.rotation.y = c.yaw;
  cam.rotation.x = c.pitch + Math.sin(clock * 0.29) * 0.008 + A.wobble * Math.sin(clock * 1.7) * 0.04;
  cam.rotation.z = Math.sin(clock * 0.37) * 0.01 + A.wobble * Math.sin(clock * 2.3) * 0.07 + A.storm * 0.012;
  const fov = (innerWidth < innerHeight ? 82 : 72) + A.wobble * Math.sin(clock * 1.3) * 6;
  if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  billboards.forEach(b => { b.rotation.y = c.yaw; });
  g.sky.position.copy(cam.position);
  g.clouds.position.copy(cam.position);
  g.clouds.rotation.y = clock * 0.004;
  // the moon: up to the north-east, pale at dusk, sickly green after
  g.moon.position.set(cam.position.x + 3600, cam.position.y + 3900, cam.position.z - 6200);
  g.moon.lookAt(cam.position);

  // The light: dusk, then the gloom of the twist, then the storm.
  const tw = A.twist, st = A.storm;
  if (st > 0.3 && clock > nextStrike) { strike(0.5 + Math.random() * 0.7); nextStrike = clock + 6 + Math.random() * 9; }
  strikes = strikes.filter(s => clock - s < 1.5);
  let f = 0;
  for (const s of strikes) if (clock >= s) f += Math.exp(-(clock - s) * 9);
  f = Math.min(1.6, f);
  const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k);
  const amb = world.ambient;
  amb.color.copy(mix(0xffc8b0, 0x9ab4a6, tw).lerp(new THREE.Color(0x6c7a9c), st));
  amb.groundColor.copy(mix(0x4a3a40, 0x3a3a44, tw).lerp(new THREE.Color(0x3b3426), st));
  amb.intensity = lerp(lerp(2.4, 3.4, tw), 4.2, st) + f * 1.2;
  // the low sun, and after the twist a cold, sickly moonlight
  g.sun.color.copy(mix(0xffa070, 0xa0c0b4, tw));
  g.sun.intensity = lerp(1.8, 1.1, tw) * (1 - st * 0.6);
  world.lightning.intensity = f * 3;
  g.sky.material.color.copy(mix(0xffffff, 0x3a4640, tw).lerp(new THREE.Color(0x0a0c0b), st)).multiplyScalar(1 + f * 0.8);
  g.clouds.material.opacity = tw * (1 - st * 0.55);
  g.clouds.material.color.setScalar(1 - st * 0.6 + f * 0.6);
  g.moon.material.opacity = 0.35 + tw * 0.55 - st * 0.5;
  g.moon.material.color.copy(mix(0xfff4e0, 0xd8f0e0, tw));
  // (At dusk the fog matches the sky just under the horizon, so the far
  // edge of the valley melts into it.)
  world.scene.fog.color.copy(mix(0x5a3a48, 0x1e2622, tw).lerp(new THREE.Color(0x030306), st));
  world.scene.fog.density = lerp(lerp(0.00022, 0.0006, tw), lerp(0.0016, 0.0042, A.close), st);
  world.scene.background.copy(world.scene.fog.color);
  g.lampMat.opacity = (1 - st) * (0.85 + 0.15 * Math.sin(clock * 3.1));
  world.lantern.intensity = LANTERN.intensity * st * (1 + Math.sin(clock * 13.1) * 0.04);
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  world.lantern.position.set(cam.position.x + rx * 9 + fx * 8, cam.position.y - 14, cam.position.z + rz * 9 + fz * 8);
  world.rain.visible = st > 0.2;
  world.rain.material.uniforms.time.value = clock;
  world.rain.material.uniforms.flash.value = f;
  world.rain.material.uniforms.center.value.set(cam.position.x, 0, cam.position.z);
  world.windowMats.forEach(m => { m.emissiveIntensity = 0.05 + f * 1.4; });
  // The Crooked Man waves.
  const host = g.people.crookedHost;
  if (host.visible) host.position.x = ARRIVAL.host.x + (A.waving ? Math.sin(clock * 5) * 1.5 : 0);
}
