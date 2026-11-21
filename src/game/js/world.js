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
  // Conservatory
  { kind: 'tree', x: 490, y: 300, block: { r: 40 } },
  { kind: 'bench', x: 520, y: 480, rot: 0 },
  { kind: 'bench', x: 350, y: 300, rot: Math.PI / 2 },
  { kind: 'shrub', x: 330, y: 440 }, { kind: 'shrub', x: 650, y: 230 }, { kind: 'shrub', x: 330, y: 160 }, { kind: 'shrub', x: 640, y: 160 },
];

let world = null;

function buildWorld(renderer, quality) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030306);
  scene.fog = new THREE.FogExp2(0x030306, 0.0042);
  const camera = new THREE.PerspectiveCamera(72, 1, 2, 3000);
  const flash = { value: 0 };
  const w = { scene, camera, flash, sprites: [], fixedLights: [], windowMats: [], hearthMats: [], disposables: [] };
  world = w;

  // ── Walls ──
  const wallMats = {};
  const wallMat = key => wallMats[key] || (wallMats[key] = new THREE.MeshStandardMaterial({
    map: key === 'exterior' ? exteriorTexture() : wallTexture(key), roughness: 0.95, metalness: 0 }));
  const quads = {};
  const pushQuad = (key, a, b, inset, h0, h1, lean = true) => {
    // a→b along the floor; the face is pushed `inset` towards the room.
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
    const nx = dz / len, nz = -dx / len;           // points into the room
    const A = [a[0] + nx * inset, a[1] + nz * inset], B = [b[0] + nx * inset, b[1] + nz * inset];
    const top = p => { const l = lean ? wallLean(p[0], p[1]) : [0, 0]; return [p[0] + l[0], h1, p[1] + l[1]]; };
    const q = quads[key] || (quads[key] = { pos: [], uv: [] });
    const p0 = [A[0], h0, A[1]], p1 = [B[0], h0, B[1]], p2 = top(B), p3 = top(A);
    // Wound so the front faces the room.
    q.pos.push(...p0, ...p2, ...p1, ...p0, ...p3, ...p2);
    const v0 = h0 / WALL_H, v1 = h1 / WALL_H;
    q.uv.push(1, v0, 0, v1, 0, v0, 1, v0, 1, v1, 0, v1);
  };
  const corners = c => {
    const h = CELL / 2;
    return [[c.x - h, c.y - h], [c.x + h, c.y - h], [c.x + h, c.y + h], [c.x - h, c.y + h]]; // NW NE SE SW
  };
  // The edge on side `dir`, ordered so the room is on its left (faces in).
  const edgeOf = (c, dir) => { const k = corners(c); return [[k[1], k[0]], [k[2], k[1]], [k[3], k[2]], [k[0], k[3]]][dir]; };

  GRID.cells.forEach(c => {
    if (!c.walk) return;
    c.edges.forEach((e, dir) => {
      if (e !== 'wall') return;
      const [a, b] = edgeOf(c, dir);
      const key = c.room === 'porch' ? 'exterior' : (c.room || 'hallway');
      pushQuad(key, a, b, 3.5, 0, WALL_H);
    });
  });
  Object.entries(quads).forEach(([key, q]) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
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

  // ── Door frames and the porch railing ──
  const frameMat = new THREE.MeshStandardMaterial({ map: woodTexture('#3a2414'), roughness: 0.8 });
  const railMat = new THREE.MeshStandardMaterial({ map: woodTexture('#2e2620'), roughness: 0.9 });
  const box = (wd, h, d, mat, x, y, z, rotY = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(wd, h, d), mat);
    m.position.set(x, y, z); m.rotation.y = rotY;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  GRID.cells.forEach(c => {
    if (!c.walk) return;
    c.edges.forEach((e, dir) => {
      const [a, b] = edgeOf(c, dir);
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      const along = dir % 2 === 0 ? 0 : Math.PI / 2;
      if (e === 'door' && (dir === 1 || dir === 2)) {
        // Posts at either side of the opening and a lintel over it: the
        // opening is a little narrower than the square, like a real door.
        const off = CELL / 2 - 5;
        const ux = dir % 2 === 0 ? 1 : 0, uz = dir % 2 === 0 ? 0 : 1;
        box(10, WALL_H, 12, frameMat, mx - ux * off, WALL_H / 2, mz - uz * off, along);
        box(10, WALL_H, 12, frameMat, mx + ux * off, WALL_H / 2, mz + uz * off, along);
        box(CELL, WALL_H - 92, 12, frameMat, mx, (WALL_H + 92) / 2, mz, along);
      } else if (e === 'rail') {
        box(CELL, 4, 5, railMat, mx, 40, mz, along);
        box(CELL, 3, 4, railMat, mx, 20, mz, along);
        box(5, 44, 5, railMat, a[0], 22, a[1]);
      }
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
    plane.position.set((a[0] + b[0]) / 2 + nx * 4.5, WALL_H / 2, (a[1] + b[1]) / 2 + nz * 4.5);
    plane.rotation.y = Math.atan2(nx, nz);
    scene.add(plane);
  });

  // ── Furniture ──
  GRID.cells.forEach(c => { c.blocked = false; });
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

  // ── Outside: dark ground, dead trees, the storm ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: 0x0b0d0a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(FLOOR.width / 2, -0.5, FLOOR.height / 2);
  scene.add(ground);
  const treeRand = seededRandom(44);
  for (let i = 0; i < 14; i++) {
    const a = treeRand() * Math.PI * 2, r = 820 + treeRand() * 500;
    const s = addSprite(scene, 'shrub', FLOOR.width / 2 + Math.cos(a) * r, FLOOR.height / 2 + Math.sin(a) * r);
    s.scale.setScalar(6.5);
  }

  // ── Light ──
  const ambient = new THREE.HemisphereLight(0x4a5670, 0x0a0806, 0.32);
  scene.add(ambient);
  w.ambient = ambient;
  const lantern = new THREE.PointLight(0xffc48a, 230, 520, 1.1);
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
  return [Math.sin(x * 0.013 + z * 0.007) * 5 + Math.sin(z * 0.031) * 2, Math.cos(z * 0.011 - x * 0.005) * 5 + Math.sin(x * 0.027) * 2];
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
      const top = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 4, 32), [wood('#3a2212'), new THREE.MeshStandardMaterial({ map: spiritBoardTexture(), roughness: 0.6, emissive: 0x9a70ff, emissiveIntensity: 0.12 }), wood('#3a2212')]);
      top.position.set(p.x, 38, p.y); top.castShadow = top.receiveShadow = true; scene.add(top);
      w.boardMat = top.material[1];
      box(10, 36, 10, wood('#2a180c'), p.x, 18, p.y);
      break;
    }
    case 'diningTable': {
      const top = new THREE.Mesh(new THREE.BoxGeometry(80, 5, 180), [wood('#3a2414'), wood('#3a2414'), new THREE.MeshStandardMaterial({ map: feastTexture(), roughness: 0.7 }), wood('#3a2414'), wood('#3a2414'), wood('#3a2414')]);
      top.position.set(p.x, 38, p.y); top.castShadow = top.receiveShadow = true; scene.add(top);
      [[-34, -84], [34, -84], [-34, 84], [34, 84]].forEach(([dx, dz]) => box(6, 36, 6, wood('#2a180c'), p.x + dx, 18, p.y + dz));
      break;
    }
    case 'sideboard': box(30, 44, 120, wood('#33200f'), p.x, 22, p.y); break;
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
