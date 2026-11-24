// Builds the 3D house from the grid: a wall on every walled edge (papered on
// the room's side), floors and ceilings square by square, door frames,
// the porch railing, windows that light up with the lightning, the
// furniture, the house's own lights, and the storm outside.
//
// Every wall leans a little at the top and the camera never sits quite
// level: there isn't a right angle anywhere in the Crooked House.

// Furniture and fixtures, in floor-plan pixels. Sprite kinds are upright
// pictures (art.js SPRITES); the rest are simple shapes. `block` keeps the
// player out of the squares it covers: `r` is a radius around the centre,
// `rect` is [width, depth].
const SCENERY = [
  // Parlour
  { kind: 'roundTable', x: 505, y: 630, block: { r: 30 } },
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ kind: 'chair', x: 505 + Math.cos(i * Math.PI / 4) * 74, y: 630 + Math.sin(i * Math.PI / 4) * 74 })),
  { kind: 'fireplace', x: 340, y: 742, wall: 3 },
  { kind: 'sofa', x: 312, y: 590 },
  // Foyer
  { kind: 'chandelier', x: 535, y: 950 },
  { kind: 'stairs', x: 640, y: 845, block: { rect: [60, 110] } },
  // Gallery
  ...[[300, 800], [236, 816], [186, 860], [196, 968], [252, 992], [322, 990]].map(([x, y]) => ({ kind: 'bustOnPedestal', x, y })),
  { kind: 'peacock', x: 152, y: 930, block: { r: 20 } },
  // Music room
  { kind: 'harpsichord', x: 965, y: 845, block: { r: 30 } },
  { kind: 'mirror', x: 845, y: 802, wall: 0 },
  { kind: 'sofa', x: 790, y: 880 },
  { kind: 'sofa', x: 960, y: 1035 },
  { kind: 'harp', x: 880, y: 1035 },
  { kind: 'danceFloor', x: 850, y: 925 },
  // Dining room
  { kind: 'diningTable', x: 865, y: 650, block: { rect: [80, 180] } },
  ...[[810, 590], [810, 650], [810, 710], [920, 590], [920, 650], [920, 710], [865, 545], [865, 755]].map(([x, y]) => ({ kind: 'chair', x, y })),
  { kind: 'sideboard', x: 990, y: 650 },
  // Kitchen
  { kind: 'oven', x: 975, y: 440, block: { r: 30 } },
  { kind: 'fallenShelf', x: 880, y: 262, block: { r: 30 } },
  { kind: 'barrel', x: 724, y: 252 },
  { kind: 'chair', x: 470, y: 1135 },   // the porch's rocking chair
  // Conservatory
  { kind: 'tree', x: 490, y: 300, block: { r: 40 } },
  { kind: 'bench', x: 520, y: 480, rot: 0 },
  { kind: 'bench', x: 350, y: 300, rot: Math.PI / 2 },
  { kind: 'shrub', x: 330, y: 440 }, { kind: 'shrub', x: 650, y: 230 }, { kind: 'shrub', x: 330, y: 160 }, { kind: 'shrub', x: 640, y: 160 },
];

let world = null;

// Each room's own base light: what you can make out beyond the lantern.
// `sky` tints what faces up and out, `level` is how much of it there is.
// It eases from one room's to the next as you walk (main.js).
const ROOM_MOOD = {
  porch:        { sky: 0x6c7a9c, level: 4.2 },   // storm light
  foyer:        { sky: 0x8a8cc8, level: 4.2 },   // the chandelier's cold glow
  parlor:       { sky: 0xb8644a, level: 3.6 },   // old firelight in the wallpaper
  gallery:      { sky: 0xaaa290, level: 3.6 },   // pale marble
  music:        { sky: 0x6a7ab8, level: 3.8 },   // moonlit blue
  dining:       { sky: 0xc08e50, level: 3.6 },   // the feast's warm glow
  kitchen:      { sky: 0xa85a38, level: 3.4 },   // embers behind the oven door
  conservatory: { sky: 0x7c9aa8, level: 4.4 },   // grey rain through the glass
  hallway:      { sky: 0x8a6a4c, level: 2.4 },   // the darkest place in the house
};
// The lantern: warm, carried low; gentle up close, reaching far.
const LANTERN = { color: 0xffcc9c, intensity: 60, distance: 600, decay: 0.7 };

function buildWorld(renderer, quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030306);
  scene.fog = new THREE.FogExp2(0x030306, 0.0042);
  const camera = new THREE.PerspectiveCamera(72, 1, 2, 3000);
  const flash = { value: 0 };
  const w = { scene, camera, flash, sprites: [], fixedLights: [], windowMats: [], hearthMats: [], disposables: [] };
  world = w;
  const box = (wd, h, d, mat, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };

  // ── Walls and doors ──
  // Walls are solid slabs WALL_T thick, centred on the line between two
  // squares, papered on each face with the paper of the room it faces. They
  // meet at corners, show their thickness at wall ends, and leave a framed
  // opening wherever there's a door.
  const wallMats = {};
  const wallMat = key => wallMats[key] || (wallMats[key] = new THREE.MeshStandardMaterial({
    map: key === 'exterior' ? exteriorTexture() : key === 'top' ? null : wallTexture(key),
    color: key === 'top' ? 0x2a221b : 0xffffff, roughness: 0.95, metalness: 0 }));
  w.wallMats = wallMats;
  const faces = {};
  // One flat quad, wound so its front faces `normal`.
  const quad = (key, pts, normal, uvs) => {
    const [p0, p1, p2] = pts;
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const vx = p2[0] - p0[0], vy = p2[1] - p0[1], vz = p2[2] - p0[2];
    const cross = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    let order = [0, 1, 2, 0, 2, 3];
    if (cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] < 0) order = [0, 2, 1, 0, 3, 2];
    const f = faces[key] || (faces[key] = { pos: [], uv: [] });
    order.forEach(i => { f.pos.push(...pts[i]); f.uv.push(...uvs[i]); });
  };
  const lean = (x, z, h) => { const l = wallLean(x, z); return [l[0] * h / WALL_H, l[1] * h / WALL_H]; };
  // A slab along the wall line a→b (2D points), from s0 to s1 along it and
  // from height h0 to h1; `n` is the unit normal towards side A.
  const slab = (a, b, s0, s1, h0, h1, keyA, keyB, n, { bottom = false } = {}) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
    const at = (s, side, h) => {
      const x = a[0] + ux * s, z = a[1] + uz * s, l = lean(x, z, h);
      return [x + n[0] * side * WALL_T / 2 + l[0], h, z + n[1] * side * WALL_T / 2 + l[1]];
    };
    const v0 = h0 / WALL_H, v1 = h1 / WALL_H, u0 = s0 / CELL, u1 = s1 / CELL;
    const uvSide = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    quad(keyA, [at(s0, 1, h0), at(s1, 1, h0), at(s1, 1, h1), at(s0, 1, h1)], [n[0], 0, n[1]], uvSide);
    quad(keyB, [at(s0, -1, h0), at(s1, -1, h0), at(s1, -1, h1), at(s0, -1, h1)], [-n[0], 0, -n[1]], uvSide);
    const flat = [[0, 0], [1, 0], [1, 1], [0, 1]];
    quad('top', [at(s0, 1, h1), at(s1, 1, h1), at(s1, -1, h1), at(s0, -1, h1)], [0, 1, 0], flat);
    if (bottom) quad('frame', [at(s0, 1, h0), at(s1, 1, h0), at(s1, -1, h0), at(s0, -1, h0)], [0, -1, 0], flat);
    quad(bottom ? 'frame' : 'top', [at(s0, 1, h0), at(s0, -1, h0), at(s0, -1, h1), at(s0, 1, h1)], [-ux, 0, -uz], flat);
    quad(bottom ? 'frame' : 'top', [at(s1, 1, h0), at(s1, -1, h0), at(s1, -1, h1), at(s1, 1, h1)], [ux, 0, uz], flat);
  };
  const corners = c => {
    const h = CELL / 2;
    return [[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x + h, c.y + h], [c.x - h, c.y + h]]; // NW NE SE SW
  };
  // The edge on side `dir`, ordered so the room is on its left (faces in).
  const edgeOf = (c, dir) => { const k = corners(c); return [[k[1], k[0]], [k[2], k[1]], [k[3], k[2]], [k[0], k[3]]][dir]; };
  const paper = c => (!c || !c.walk) ? 'exterior' : c.room === 'porch' ? 'exterior' : (c.room || 'hallway');

  // Plain walls: each edge once — from the square to its east or south, or
  // to any side that has no square beyond it.
  GRID.cells.forEach(c => {
    if (!c.walk) return;
    c.edges.forEach((e, dir) => {
      if (e !== 'wall') return;
      const n = GRID.at(c.cx + DIRS[dir][0], c.cy + DIRS[dir][1]);
      if ((dir === 0 || dir === 3) && n && n.walk) return;    // the neighbour draws it
      const [a, b] = edgeOf(c, dir);
      slab(a, b, 0, CELL, 0, WALL_H, paper(c), paper(n), [-DIRS[dir][0], -DIRS[dir][1]]);
    });
  });

  // Doorways: wall either side of the opening and a lintel over it, a
  // moulded frame round it, and the door itself, hinged at the side.
  w.doors = {};
  const frameMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3a2414'), roughness: 0.8 });
  wallMats.frame = frameMat;
  // The leaf's picture, and the same picture flipped for its back face, so
  // the knob is at the free edge from both sides.
  const doorTex = doorTexture();
  const doorTexBack = doorTex.clone();
  doorTexBack.wrapS = THREE.RepeatWrapping; doorTexBack.repeat.x = -1; doorTexBack.offset.x = 1;
  const doorFront = new THREE.MeshStandardMaterial({ map: doorTex, roughness: 0.7 });
  const doorBack = new THREE.MeshStandardMaterial({ map: doorTexBack, roughness: 0.7 });
  // (The same materials suit every leaf, either side of a double door:
  // each leaf's own x runs from its hinge to its free edge.)
  const doorMats = [frameMat, frameMat, frameMat, frameMat, doorFront, doorBack];
  DOORS.list.forEach(door => {
    const c = door.cells[0], d = door.dir;
    const k = corners(c), L = CELL * door.cells.length;
    const a = d === 1 ? k[1] : k[3];                                   // NE going south, or SW going east
    const u = d === 1 ? [0, 1] : [1, 0];
    const b = [a[0] + u[0] * L, a[1] + u[1] * L];
    const n = [-DIRS[d][0], -DIRS[d][1]];                              // towards the first room
    const nb = GRID.at(c.cx + DIRS[d][0], c.cy + DIRS[d][1]);
    const W = door.cells.length === 1 ? 38 : 2 * CELL - 26, o0 = (L - W) / 2, o1 = (L + W) / 2;
    slab(a, b, 0, o0, 0, WALL_H, paper(c), paper(nb), n);
    slab(a, b, o1, L, 0, WALL_H, paper(c), paper(nb), n);
    slab(a, b, o0, o1, DOOR_H, WALL_H, paper(c), paper(nb), n, { bottom: true });
    // The frame: two posts and a head, standing a little proud of both faces.
    const along = Math.atan2(-u[1], u[0]);
    const at = s => [a[0] + u[0] * s, a[1] + u[1] * s];
    [[o0 - 3], [o1 + 3]].forEach(([s]) => box(6, DOOR_H + 6, WALL_T + 3, frameMat, at(s)[0], (DOOR_H + 6) / 2, at(s)[1], along));
    const mid = at((o0 + o1) / 2);
    box(W + 12, 7, WALL_T + 3, frameMat, mid[0], DOOR_H + 3.5, mid[1], along);
    // The leaves, hinged on the posts: one, or a pair meeting in the middle.
    const leaves = (door.cells.length === 1 ? [[o0, 1]] : [[o0, 1], [o1, -1]]).map(([s, toward]) => {
      const lw = W / door.cells.length - 1;
      const geo = new THREE.BoxGeometry(lw, DOOR_H - 1, 3.5);
      geo.translate(lw / 2, (DOOR_H - 1) / 2, 0);
      const leaf = new THREE.Mesh(geo, doorMats);
      leaf.castShadow = leaf.receiveShadow = true;
      const pivot = new THREE.Group();
      const p = at(s);
      pivot.position.set(p[0], 0.5, p[1]);
      const base = Math.atan2(-u[1] * toward, u[0] * toward);           // closed: lying along the wall
      pivot.rotation.y = base;
      pivot.add(leaf);
      scene.add(pivot);
      // Swing towards door.swingInto: whichever way round puts the open
      // leaf on that room's side of the wall.
      const into = door.swingInto === door.rooms[0] ? n : [-n[0], -n[1]];
      const a = base + DOOR_SWING;
      const sign = (Math.cos(a) * into[0] - Math.sin(a) * into[1]) > 0 ? 1 : -1;
      return { pivot, base, sign };
    });
    // Where the handle is: at the free edge of a single door, between the
    // leaves of a double one.
    const handle = at(door.cells.length === 1 ? o1 - 5 : L / 2);
    w.doors[door.id] = { door, leaves, amount: 0, target: 0, normal: n, line: a, u, handle };
  });

  Object.entries(faces).forEach(([key, f]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(f.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(f.uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, wallMat(key));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });

  // ── Floors and ceilings ──
  const floorMats = {}, ceilMats = {};
  const floorQuads = {}, ceilQuads = {};
  GRID.cells.forEach(c => {
    if (!c.walk) return;
    const room = c.room || 'porch';
    const k = corners(c);
    const fq = floorQuads[room] || (floorQuads[room] = []);
    fq.push(k);
    if (!c.noEscape) {
      const ck = room === 'conservatory' ? 'glass' : room === 'porch' ? 'porch' : 'plaster';
      (ceilQuads[ck] || (ceilQuads[ck] = [])).push(k);
    }
  });
  const flatGeo = (list, y, down) => {
    const pos = [], uv = [];
    list.forEach(k => {
      const pts = k.map(([x, z]) => [x, y, z]);
      const order = down ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
      order.forEach(i => { pos.push(...pts[i]); uv.push(pts[i][0] / (CELL * 2), -pts[i][2] / (CELL * 2)); });
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };
  Object.entries(floorQuads).forEach(([room, list]) => {
    const m = floorMats[room] || (floorMats[room] = new THREE.MeshStandardMaterial({ map: floorTexture(room), roughness: 0.9, metalness: 0 }));
    const mesh = new THREE.Mesh(flatGeo(list, 0, false), m);
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
  Object.entries(ceilQuads).forEach(([kind, list]) => {
    const m = ceilMats[kind] || (ceilMats[kind] = new THREE.MeshStandardMaterial({ map: ceilingTexture(kind), roughness: 1, metalness: 0,
      emissive: kind === 'glass' ? 0x9fb4d8 : 0x000000, emissiveIntensity: 0 }));
    if (kind === 'glass') w.windowMats.push(m);
    scene.add(new THREE.Mesh(flatGeo(list, WALL_H, true), m));
  });

  // ── The porch railing ──
  const railMat = new THREE.MeshStandardMaterial({ map: woodTexture('#2e2620'), roughness: 0.9 });
  GRID.cells.forEach(c => {
    if (!c.walk) return;
    c.edges.forEach((e, dir) => {
      if (e !== 'rail') return;
      const [a, b] = edgeOf(c, dir);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const along = dir % 2 === 0 ? 0 : Math.PI / 2;
      box(CELL, 4, 5, railMat, mx, 40, mz, along);
      box(CELL, 3, 4, railMat, mx, 20, mz, along);
      box(5, 44, 5, railMat, a[0], 22, a[1]);
    });
  });

  // ── Windows ──
  const win = windowTextures();
  const winMat = new THREE.MeshStandardMaterial({ map: win.map, transparent: true, alphaTest: 0.05, emissive: 0xaec4ee, emissiveMap: win.glow, emissiveIntensity: 0.05, roughness: 0.4 });
  w.windowMats.push(winMat);
  FLOOR.windows.forEach(wp => {
    let best = null, bestD = 70;
    GRID.cells.forEach(c => {
      if (!c.walk || c.room === 'porch') return;
      c.edges.forEach((e, dir) => {
        if (e !== 'wall') return;
        const [a, b] = edgeOf(c, dir);
        const d = Math.hypot((a[0] + b[0]) / 2 - wp.x, (a[1] + b[1]) / 2 - wp.y);
        if (d < bestD) { bestD = d; best = [a, b]; }
      });
    });
    if (!best) return;
    const [a, b] = best;
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const nx = dz / len, nz = -dx / len;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), winMat);
    plane.position.set((a[0] + b[0]) / 2 + nx * (WALL_T / 2 + 0.6), WALL_H / 2, (a[1] + b[1]) / 2 + nz * (WALL_T / 2 + 0.6));
    plane.rotation.y = Math.atan2(nx, nz);
    scene.add(plane);
  });

  // ── Furniture ──
  GRID.cells.forEach(c => { c.blocked = false; });
  // The pieces added for search spots (items.js), against their walls.
  [...SEARCHES.filter(s => s.prop), PUMP].forEach(s => addScenery(w, { kind: s.prop, x: s.x, y: s.y, rot: s.wallDir % 2 ? Math.PI / 2 : 0 }, box));
  SCENERY.forEach(p => {
    addScenery(w, p, box);
    if (p.block) {
      GRID.cells.forEach(c => {
        if (!c.walk) return;
        const inR = p.block.r !== undefined && Math.hypot(c.x - p.x, c.y - p.y) < p.block.r + CELL / 2;
        const inRect = p.block.rect && Math.abs(c.x - p.x) < p.block.rect[0] / 2 && Math.abs(c.y - p.y) < p.block.rect[1] / 2;
        if (inR || inRect) c.blocked = true;
      });
    }
  });

  // Things drawn straight onto a wall (e.g. the hallway scratches). Shown
  // or hidden each frame by the main loop, for things only Dread reveals.
  w.decals = THINGS.filter(t => t.decal).map(t => {
    const [dw, dh] = t.decalSize;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(dw, dh), new THREE.MeshStandardMaterial({ map: t.decal(), transparent: true, depthWrite: false, roughness: 1 }));
    const n = [-DIRS[t.wallDir][0], -DIRS[t.wallDir][1]];
    m.position.set(t.x + n[0] * 0.6, t.h, t.y + n[1] * 0.6);
    m.rotation.y = Math.atan2(n[0], n[1]);
    m.userData.thing = t;
    scene.add(m);
    return m;
  });

  // ── Outside: dark ground, dead trees, the storm ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x0b0d0a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(FLOOR.width / 2, -0.5, FLOOR.height / 2);
  scene.add(ground);
  w.ground = ground;
  const treeRand = seededRandom(44);
  w.trees = [];
  for (let i = 0; i < 14; i++) {
    const a = treeRand() * Math.PI * 2, r = 820 + treeRand() * 500;
    const s = addSprite(scene, 'shrub', FLOOR.width / 2 + Math.cos(a) * r, FLOOR.height / 2 + Math.sin(a) * r);
    s.scale.setScalar(6.5);
    w.trees.push(s);
  }

  // ── Light ──
  const ambient = new THREE.HemisphereLight(0x4a5670, 0x120c08, 0.32);
  scene.add(ambient);
  w.ambient = ambient;
  const lantern = new THREE.PointLight(LANTERN.color, LANTERN.intensity, LANTERN.distance, LANTERN.decay);
  lantern.castShadow = true;
  lantern.shadow.mapSize.set(quality === 'low' ? 256 : 512, quality === 'low' ? 256 : 512);
  lantern.shadow.camera.near = 2; lantern.shadow.camera.far = 460; lantern.shadow.bias = -0.003;
  scene.add(lantern);
  w.lantern = lantern;
  FLOOR.lights.forEach((l, i) => {
    const light = new THREE.PointLight(l.color, 0, l.distance * 1.2, 1.5);
    light.position.set(l.x, l.h * WALL_H / 70, l.y);
    light.userData = { id: l.id, base: l.intensity * 1500, flicker: l.flicker || 0, phase: i * 1.7, boost: 1 };
    if (l.shadow && quality !== 'low') {
      light.castShadow = true;
      light.shadow.mapSize.set(256, 256);
      light.shadow.camera.near = 2; light.shadow.camera.far = l.distance * 1.2; light.shadow.bias = -0.004;
      light.shadow.autoUpdate = false; light.shadow.needsUpdate = true;
    }
    scene.add(light);
    w.fixedLights.push(light);
  });
  const lightning = new THREE.DirectionalLight(0xc8d4ff, 0);
  lightning.position.set(FLOOR.width * 0.3, 900, FLOOR.height * 1.3);
  lightning.target.position.set(FLOOR.width / 2, 0, FLOOR.height / 2);
  scene.add(lightning, lightning.target);
  w.lightning = lightning;

  w.rain = buildRain(quality === 'low' ? 500 : 1300);
  scene.add(w.rain);
  return w;
}

// Leaning tops: depends only on position, so joined walls lean together.
function wallLean(x, z) {
  return [Math.sin(x * 0.013 + z * 0.007) * 3 + Math.sin(z * 0.031) * 1.2, Math.cos(z * 0.011 - x * 0.005) * 3 + Math.sin(x * 0.027) * 1.2];
}

function addScenery(w, p, box) {
  const { scene } = w;
  if (SPRITES[p.kind]) {
    w.sprites.push(addSprite(scene, p.kind, p.x, p.y));
    return;
  }
  const wood = c => new THREE.MeshStandardMaterial({ map: woodTexture(c), roughness: 0.75 });
  switch (p.kind) {
    case 'roundTable': {
      const top = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 4, 32), wood('#3a2212'));
      top.position.set(p.x, 38, p.y); top.castShadow = top.receiveShadow = true; scene.add(top);
      // The spirit board and its planchette, lying on the table: the same
      // artwork the séance uses. The board faces whoever sits on the
      // fireplace side.
      const lay = (src, wd, dp, y, glow) => {
        const img = new Image();
        const tex = new THREE.CanvasTexture(img);
        tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
        img.onload = () => { tex.needsUpdate = true; };
        img.src = src;
        const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.2, roughness: 0.6, emissive: glow ? 0x9a70ff : 0x000000, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.12 : 0 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(wd, dp), mat);
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        scene.add(m);
        return m;
      };
      const board = lay('explore/Ouija_Board.webp', 34, 34 * 2000 / 1539, 40.1, true);
      board.position.set(p.x, 40.1, p.y);
      board.rotation.z = Math.PI * 0.75;
      w.boardMat = board.material;
      const pl = lay('explore/Planchette.webp', 7, 7 * 1078 / 621, 40.3, false);
      pl.position.set(p.x + 3, 40.3, p.y - 2);
      pl.rotation.z = Math.PI * 0.6;
      box(10, 36, 10, wood('#2a180c'), p.x, 18, p.y);
      break;
    }
    case 'diningTable': {
      const feastMat = new THREE.MeshStandardMaterial({ map: feastTexture(), roughness: 0.7 });
      const top = new THREE.Mesh(new THREE.BoxGeometry(80, 5, 180), [wood('#3a2414'), wood('#3a2414'), feastMat, wood('#3a2414'), wood('#3a2414'), wood('#3a2414')]);
      top.position.set(p.x, 38, p.y); top.castShadow = top.receiveShadow = true; scene.add(top);
      w.feastMat = feastMat;
      [[-34, -84], [34, -84], [-34, 84], [34, 84]].forEach(([dx, dz]) => box(6, 36, 6, wood('#2a180c'), p.x + dx, 18, p.y + dz));
      break;
    }
    case 'sideboard': box(30, 44, 120, wood('#33200f'), p.x, 22, p.y); break;
    // Search-spot furniture: each is drawn along its wall (`rot` turns it
    // to an east or west wall).
    case 'console': {
      const m = wood('#3a2414');
      box(48, 4, 18, m, p.x, 40, p.y, p.rot);
      box(44, 10, 16, wood('#2e1c0e'), p.x, 33, p.y, p.rot);
      const off = [[-20, -6], [20, -6], [-20, 6], [20, 6]];
      off.forEach(([a, b]) => { const [x, z] = turnXZ(a, b, p.rot); box(3, 30, 3, m, p.x + x, 15, p.y + z); });
      break;
    }
    case 'umbrellas': {
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(7, 6, 26, 12), new THREE.MeshStandardMaterial({ color: 0x3a4a3a, roughness: 0.8 }));
      pot.position.set(p.x, 13, p.y); pot.castShadow = pot.receiveShadow = true; scene.add(pot);
      [[-2, 0.15], [2, -0.1], [0, 0.3]].forEach(([dx, tilt]) => { const u = box(1.5, 44, 1.5, new THREE.MeshStandardMaterial({ color: 0x1a1612 }), p.x + dx, 30, p.y); u.rotation.z = tilt; });
      break;
    }
    case 'sconce': {
      const brass = new THREE.MeshStandardMaterial({ color: 0x8a6a2a, roughness: 0.4, metalness: 0.7 });
      box(10, 3, 8, brass, p.x, 62, p.y, p.rot);
      const glass = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 12, 10), new THREE.MeshStandardMaterial({ color: 0xa0a890, roughness: 0.2, transparent: true, opacity: 0.5 }));
      glass.position.set(p.x, 70, p.y); scene.add(glass);
      break;
    }
    case 'woodbasket': box(30, 16, 20, new THREE.MeshStandardMaterial({ color: 0x4a3420, roughness: 1 }), p.x, 8, p.y, p.rot); break;
    case 'cupboard': {
      box(46, 70, 22, wood('#3a2616'), p.x, 35, p.y, p.rot);
      const [x, z] = turnXZ(0, 11.5, p.rot);
      box(42, 2, 1, wood('#1e140a'), p.x + x, 36, p.y + z, p.rot);
      break;
    }
    case 'pottingBench': {
      box(50, 4, 22, wood('#4a3a28'), p.x, 30, p.y, p.rot);
      [[-22, -8], [22, -8], [-22, 8], [22, 8]].forEach(([a, b]) => { const [x, z] = turnXZ(a, b, p.rot); box(3, 30, 3, wood('#3a2a1a'), p.x + x, 15, p.y + z); });
      [[-14, 0], [2, 3], [15, -2]].forEach(([a, b]) => { const [x, z] = turnXZ(a, b, p.rot); const pot = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 8, 10), new THREE.MeshStandardMaterial({ color: 0x8a4a2a, roughness: 1 })); pot.position.set(p.x + x, 36, p.y + z); pot.castShadow = true; scene.add(pot); });
      break;
    }
    case 'cabinet': {
      box(36, 64, 18, wood('#2e1c0e'), p.x, 32, p.y, p.rot);
      const [x, z] = turnXZ(0, 9.2, p.rot);
      const glass = box(30, 40, 0.5, new THREE.MeshStandardMaterial({ color: 0x8aa0b0, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.35 }), p.x + x, 40, p.y + z, p.rot);
      glass.castShadow = false;
      break;
    }
    case 'musicStand': {
      const brass = new THREE.MeshStandardMaterial({ color: 0x9a7a3a, roughness: 0.4, metalness: 0.7 });
      box(2, 44, 2, brass, p.x, 22, p.y);
      const desk = box(26, 18, 1.5, brass, p.x, 50, p.y, p.rot); desk.rotateX(-0.35);
      break;
    }
    case 'pump': {
      box(30, 20, 24, new THREE.MeshStandardMaterial({ color: 0x5a5650, roughness: 0.9 }), p.x, 30, p.y, p.rot);
      const iron = new THREE.MeshStandardMaterial({ color: 0x2a2826, roughness: 0.5, metalness: 0.6 });
      box(5, 30, 5, iron, p.x, 55, p.y);
      const h = box(18, 2, 2, iron, p.x, 70, p.y, p.rot); h.rotation.z = 0.4;
      break;
    }
    case 'bench': box(80, 18, 24, new THREE.MeshStandardMaterial({ color: 0x4a4e44, roughness: 1 }), p.x, 9, p.y, p.rot || 0); break;
    case 'oven': {
      const mats = [brickTexture(), brickTexture(), brickTexture(), brickTexture(), ovenFrontTexture(), brickTexture()].map(t => new THREE.MeshStandardMaterial({ map: t, roughness: 0.9, emissive: 0x501008, emissiveIntensity: 0.15 }));
      const m = new THREE.Mesh(new THREE.BoxGeometry(64, 70, 56), mats);
      m.position.set(p.x, 35, p.y); m.rotation.y = -Math.PI * 0.75;   // door towards the room m.castShadow = m.receiveShadow = true; scene.add(m);
      w.ovenMats = mats;
      break;
    }
    case 'fallenShelf': {
      const m = box(110, 14, 34, wood('#3b2816'), p.x, 30, p.y);
      m.rotation.z = 0.42; m.rotation.y = 0.2;
      box(70, 6, 46, wood('#2e1d10'), p.x + 20, 18, p.y + 6).rotation.z = -0.25;
      break;
    }
    case 'harpsichord': {
      const caseMat = wood('#24160c');
      const front = new THREE.MeshStandardMaterial({ map: harpsichordFrontTexture(), roughness: 0.6 });
      const m = new THREE.Mesh(new THREE.BoxGeometry(110, 30, 50), [caseMat, caseMat, caseMat, caseMat, caseMat, front]);
      m.position.set(p.x, 44, p.y); m.rotation.y = Math.PI * 0.82; m.castShadow = m.receiveShadow = true; scene.add(m);
      const lid = box(110, 3, 50, caseMat, p.x, 74, p.y, Math.PI * 0.82);
      lid.rotateX(-0.75); lid.position.y = 78;
      [[-46, -18], [46, -18], [-46, 18], [46, 18]].forEach(([dx, dz]) => {
        const a = Math.PI * 0.82, rx = dx * Math.cos(a) + dz * Math.sin(a), rz = -dx * Math.sin(a) + dz * Math.cos(a);
        box(5, 30, 5, caseMat, p.x + rx, 15, p.y + rz);
      });
      break;
    }
    case 'bustOnPedestal': {
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(9, 11, 46, 12), new THREE.MeshStandardMaterial({ color: 0x5a544a, roughness: 0.9 }));
      ped.position.set(p.x, 23, p.y); ped.castShadow = ped.receiveShadow = true; scene.add(ped);
      w.sprites.push(addSprite(scene, 'bust', p.x, p.y));
      break;
    }
    case 'stairs': {
      // A quarter-turn of steps climbing the foyer's north-east corner.
      const mat = wood('#3a2616');
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * (1 - i / 16);
        box(26, 8 + i * 10, 40, mat, p.x + 20 + Math.cos(a) * 34, (8 + i * 10) / 2, p.y + 40 - Math.sin(a) * 60 - i * 6, -a);
      }
      break;
    }
    case 'fireplace': {
      const t = fireplaceTextures();
      const mat = new THREE.MeshStandardMaterial({ map: t.map, emissive: 0xff7a30, emissiveMap: t.glow, emissiveIntensity: 0.25, roughness: 0.9 });
      w.hearthMats.push(mat);
      const m = new THREE.Mesh(new THREE.BoxGeometry(70, 64, 20), [mat, mat, mat, mat, mat, mat]);
      m.position.set(p.x, 32, p.y); m.rotation.y = Math.PI * 0.25; m.castShadow = m.receiveShadow = true; scene.add(m);
      break;
    }
    case 'mirror': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(48, 62), new THREE.MeshStandardMaterial({ map: mirrorTexture(), transparent: true, alphaTest: 0.05, roughness: 0.2, metalness: 0.5 }));
      const c = GRID.cellAtPx(p.x, p.y);
      m.position.set(p.x, 62, c.y - CELL / 2 + 4.5);   // flat on the square's north wall
      scene.add(m);
      w.mirror = m;
      break;
    }
    case 'danceFloor': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(170, 150), new THREE.MeshStandardMaterial({ map: danceFloorTexture(), transparent: true, depthWrite: false, roughness: 1 }));
      m.rotation.x = -Math.PI / 2; m.position.set(p.x, 0.4, p.y); m.receiveShadow = true;
      scene.add(m);
      break;
    }
  }
}

// An upright cut-out that turns to face you (main.js turns every one in
// `billboards` each frame). Furniture and statues are lit by your lantern
// like everything else; ghosts and candle flames give their own light.
const billboards = [];
// Rotates a local (along-wall, out-of-wall) offset by `rot`.
function turnXZ(a, b, rot = 0) { return [a * Math.cos(rot) + b * Math.sin(rot), -a * Math.sin(rot) + b * Math.cos(rot)]; }

function addSprite(scene, kind, x, y) {
  const spec = SPRITES[kind];
  const geo = new THREE.PlaneGeometry(spec.size[0], spec.size[1]);
  geo.translate(0, spec.size[1] / 2, 0);   // stand on the floor
  const mat = (spec.ghost || spec.unlit)
    ? new THREE.MeshBasicMaterial({ map: spriteTexture(kind), transparent: true, depthWrite: !spec.ghost, alphaTest: spec.ghost ? 0 : 0.1, fog: true })
    : new THREE.MeshStandardMaterial({ map: spriteTexture(kind), transparent: true, alphaTest: 0.1, roughness: 0.9, metalness: 0 });
  mat.side = THREE.DoubleSide;
  const s = new THREE.Mesh(geo, mat);
  s.position.set(x, spec.lift || 0, y);
  s.userData.kind = kind;
  scene.add(s);
  billboards.push(s);
  return s;
}

// Rain: streaks in a box that follows the camera, kept out from under the
// roof (the house and the porch; the front steps are open to the sky).
function buildRain(count) {
  const [c, ctx] = artCanvas(256, Math.round(256 * FLOOR.height / FLOOR.width));
  const s = 256 / FLOOR.width;
  ctx.scale(s, s);
  ctx.fillStyle = '#fff';
  FLOOR.walkable.filter(a => !/steps/.test(a.note || '')).forEach(a => {
    ctx.beginPath(); a.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  });
  const roof = new THREE.CanvasTexture(c);
  const seeds = new Float32Array(count * 2 * 4), tips = new Float32Array(count * 2);
  const rand = seededRandom(77);
  for (let i = 0; i < count; i++) { const v = [rand(), rand(), rand(), rand()]; for (let k = 0; k < 2; k++) { seeds.set(v, (i * 2 + k) * 4); tips[i * 2 + k] = k; } }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  geo.setAttribute('tip', new THREE.BufferAttribute(tips, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { time: { value: 0 }, center: { value: new THREE.Vector3() }, flash: { value: 0 }, roof: { value: roof }, size: { value: new THREE.Vector2(FLOOR.width, FLOOR.height) } },
    vertexShader: `
      attribute vec4 seed; attribute float tip;
      uniform float time; uniform vec3 center; uniform float flash; uniform sampler2D roof; uniform vec2 size;
      varying float vAlpha;
      void main() {
        const float span = 700.0, fall = 260.0;
        float y = fall * (1.0 - fract(time * (420.0 + seed.w * 160.0) / fall + seed.z));
        vec2 xz = center.xz + (fract((seed.xy * span - center.xz) / span + 0.5) - 0.5) * span;
        xz.x += y * 0.18 + tip * 3.0;
        y += tip * 16.0;
        vec2 uv = vec2(xz.x / size.x, 1.0 - xz.y / size.y);
        float r = (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) ? texture2D(roof, uv).r : 0.0;
        vAlpha = (1.0 - step(0.5, r)) * (0.22 + flash * 0.5) * (0.35 + 0.65 * tip);
        gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, y, xz.y, 1.0);
      }`,
    fragmentShader: `varying float vAlpha; void main() { gl_FragColor = vec4(0.72, 0.8, 0.92, vAlpha); }`,
  });
  const rain = new THREE.LineSegments(geo, mat);
  rain.frustumCulled = false;
  return rain;
}
