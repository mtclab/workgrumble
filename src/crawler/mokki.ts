import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { type Interactable, type InteractKind, type Level, type Room, type Spawn, TILE } from './level';
import {
  boardMesh,
  boatMesh,
  bookshelfMesh,
  dishMesh,
  kennelMesh,
  paljuMesh,
  potatoPatchMesh,
  savusaunaMesh,
  standingStonesMesh,
  woodshedMesh,
} from './meshes';
import { Rng } from './rng';
import { grassTexture, logTexture, woodTexture } from './textures';

/**
 * The mökki: a summer cottage by a lake, where every weekend goes. Sauna,
 * lake, grill, a bed to rest (and level up) in, a stash, the Saunatonttu at
 * his rune stone, and the mosquitoes, who are the only thing here that raises
 * tickets. Built as a Level so walking, collision and the map all just work.
 */

const W = 36;
const H = 36;
export const LAKE_ROW = 25;

/** Every weekend you can build on the plot; what you have built shows up here. */
export function generateMokki(seed: number, headless = false, upgrades: readonly string[] = []): Level {
  const has = (id: string): boolean => upgrades.includes(id);
  const r = new Rng(seed);
  const floor = new Uint8Array(W * H).fill(1);
  const solid = new Uint8Array(W * H);
  const opaque = new Uint8Array(W * H);
  const roomOf = new Int16Array(W * H).fill(0);
  const group = new THREE.Group();
  const interactables: Interactable[] = [];
  const spawns: Spawn[] = [];
  let nextId = 0;
  const cc = (c: number): number => c * TILE + TILE / 2;
  const block = (x: number, y: number, sight = false): void => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    solid[y * W + x] = 1;
    if (sight) opaque[y * W + x] = 1;
  };
  const add = (kind: InteractKind, x: number, y: number, mesh: THREE.Object3D | null): void => {
    interactables.push({ kind, x: cc(x), z: cc(y), id: nextId++, room: 0, used: false, mesh, lock: 0 });
  };
  const paint = <T>(fn: () => T): T | null => (headless ? null : fn());
  const lam = (color: number, map: THREE.Texture | null = null, emissive = 0): THREE.MeshLambertMaterial =>
    new THREE.MeshLambertMaterial({ color, map, emissive });
  const box = (sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    const rr = Math.min(0.06, Math.min(sx, sy, sz) * 0.2);
    const m = new THREE.Mesh(rr < 0.005 ? new THREE.BoxGeometry(sx, sy, sz) : new RoundedBoxGeometry(sx, sy, sz, 2, rr), mat);
    m.position.set(x, y, z);
    return m;
  };

  // Forest edge.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) block(x, y, true);
    }
  }
  // The lake: everything south of the shore, bar the laituri (dock).
  const dockX = 18;
  const dockEnd = LAKE_ROW + (has('laituri') ? 8 : 5);
  for (let y = LAKE_ROW; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (x === dockX && y <= dockEnd) continue;
      block(x, y);
    }
  }

  // Ground and water.
  const grass = paint(() => grassTexture(seed));
  grass?.repeat.set(W, H);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * TILE + 80, H * TILE + 80), lam(0xffffff, grass));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((W * TILE) / 2, 0, (H * TILE) / 2);
  ground.receiveShadow = true;
  ground.name = 'ground';
  group.add(ground);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry((W - 2) * TILE + 80, (H - LAKE_ROW) * TILE + 40),
    headless ? new THREE.MeshLambertMaterial({ color: 0x2f5f7a }) : waterMaterial(),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((W * TILE) / 2, 0.05, LAKE_ROW * TILE + ((H - LAKE_ROW) * TILE + 40) / 2);
  water.name = 'water';
  group.add(water);
  // Shore stones.
  const stoneGeo: THREE.BufferGeometry[] = [];
  for (let x = 1; x < W - 1; x++) {
    if (!r.chance(0.5)) continue;
    const g = new THREE.DodecahedronGeometry(r.range(0.3, 0.7), 1);
    g.scale(1.2, 0.6, 1);
    g.translate(cc(x) + r.range(-0.6, 0.6), 0.1, LAKE_ROW * TILE + r.range(-0.4, 0.3));
    stoneGeo.push(g);
  }
  if (stoneGeo.length > 0) group.add(new THREE.Mesh(mergeGeometries(stoneGeo), lam(0x7a7a78)));

  // Trees: pines and birches, merged by material.
  const pineGeo: THREE.BufferGeometry[] = [];
  const trunkGeo: THREE.BufferGeometry[] = [];
  const birchGeo: THREE.BufferGeometry[] = [];
  const leafGeo: THREE.BufferGeometry[] = [];
  const addPine = (x: number, z: number, s: number): void => {
    const t = new THREE.CylinderGeometry(0.14 * s, 0.26 * s, 2.2 * s, 10);
    t.translate(x, 1.1 * s, z);
    trunkGeo.push(t);
    // Tiers of boughs, each a little lopsided (from the position: the plot's dice stay untouched).
    const twist = Math.abs(Math.sin(x * 12.9898 + z * 78.233));
    for (let i = 0; i < 4; i++) {
      const c = new THREE.ConeGeometry((1.7 - i * 0.36) * s, 1.9 * s, 14, 1, true);
      c.rotateY(twist * 6 + i);
      c.translate(x + (i % 2 === 0 ? 0.06 : -0.06) * s * twist, (1.9 + i * 1.05) * s, z);
      pineGeo.push(c);
      // Close the underside of each tier so the sun cannot see through it.
      const base = new THREE.CircleGeometry((1.7 - i * 0.36) * s, 14);
      base.rotateX(Math.PI / 2);
      base.translate(x, (1.9 + i * 1.05) * s - 0.95 * s, z);
      pineGeo.push(base);
    }
  };
  const addBirch = (x: number, z: number, s: number): void => {
    const t = new THREE.CylinderGeometry(0.1 * s, 0.16 * s, 4.2 * s, 10);
    t.translate(x, 2.1 * s, z);
    birchGeo.push(t);
    const twist = Math.abs(Math.sin(x * 4.1 + z * 9.7));
    for (let k = 0; k < 4; k++) {
      const a = k * 1.9 + twist * 5;
      const l = new THREE.IcosahedronGeometry((0.9 + (k % 2) * 0.25) * s, 1);
      l.scale(1, 0.85, 1);
      l.translate(x + Math.sin(a) * 0.7 * s, (4.1 + (k % 3) * 0.5) * s, z + Math.cos(a) * 0.7 * s);
      leafGeo.push(l);
    }
  };
  // Forest beyond the edge, for the look of it.
  for (let i = 0; i < 160; i++) {
    const side = r.int(0, 3);
    const along = r.range(-20, W * TILE + 20);
    const out = r.range(0.5, 18);
    const x = side === 0 ? along : side === 1 ? along : side === 2 ? -out : W * TILE + out;
    const z = side === 0 ? -out : side === 1 ? H * TILE + out + 30 : along;
    if (side === 1) continue;
    if (r.chance(0.7)) addPine(x, z, r.range(0.9, 1.6));
    else addBirch(x, z, r.range(0.9, 1.3));
  }
  // Across the lake, a far shore of forest.
  for (let i = 0; i < 50; i++) addPine(r.range(-20, W * TILE + 20), H * TILE + r.range(10, 30), r.range(1.2, 2));

  // Buildings.
  const logs = paint(() => logTexture());
  const planks = paint(() => woodTexture());
  const roofMat = lam(0x5a2a1a);
  const building = (x0: number, y0: number, w: number, h: number, height: number, color: number): THREE.Group => {
    const g = new THREE.Group();
    const bx = x0 * TILE;
    const bz = y0 * TILE;
    const bw = w * TILE;
    const bh = h * TILE;
    // Log walls: round logs stacked, crossing and sticking out at the corners.
    const logR = 0.16;
    const logGeo: THREE.BufferGeometry[] = [];
    const rows = Math.round(height / (logR * 1.7));
    for (let k = 0; k < rows; k++) {
      const y = logR + k * logR * 1.7;
      const alongX = k % 2 === 0;
      for (const side of [0, 1]) {
        if (alongX) {
          const lg = new THREE.CylinderGeometry(logR, logR, bw + 0.5, 10);
          lg.rotateZ(Math.PI / 2);
          lg.translate(bx + bw / 2, y, bz + logR + side * (bh - 2 * logR));
          logGeo.push(lg);
        } else {
          const lg = new THREE.CylinderGeometry(logR, logR, bh + 0.5, 10);
          lg.rotateX(Math.PI / 2);
          lg.translate(bx + logR + side * (bw - 2 * logR), y + logR * 0.85, bz + bh / 2);
          logGeo.push(lg);
        }
      }
    }
    const walls = new THREE.Mesh(mergeGeometries(logGeo), lam(color, logs));
    for (const lg of logGeo) lg.dispose();
    g.add(walls);
    // Fill behind the logs so there is no daylight between them.
    g.add(box(bw - 0.3, height, bh - 0.3, lam(new THREE.Color(color).multiplyScalar(0.7).getHex()), bx + bw / 2, height / 2, bz + bh / 2));
    // A gable roof along the long side, with overhangs, and log gable ends.
    const along = bw >= bh;
    const span = along ? bh : bw;
    const len = (along ? bw : bh) + 0.9;
    const rise = Math.min(2.2, span * 0.42);
    const slope = Math.atan2(rise, span / 2);
    const slab = Math.hypot(rise, span / 2) + 0.45;
    for (const side of [-1, 1]) {
      const r0 = new THREE.Mesh(new RoundedBoxGeometry(along ? len : slab, 0.16, along ? slab : len, 2, 0.05), roofMat);
      if (along) r0.rotateX(side * slope);
      else r0.rotateZ(-side * slope);
      const off = (Math.cos(slope) * slab) / 2 - 0.22;
      r0.position.set(bx + bw / 2 + (along ? 0 : side * off), height + rise / 2 + 0.05, bz + bh / 2 + (along ? side * off : 0));
      g.add(r0);
    }
    const tri = new THREE.Shape();
    tri.moveTo(-span / 2, 0);
    tri.lineTo(span / 2, 0);
    tri.lineTo(0, rise);
    tri.closePath();
    for (const side of [0, 1]) {
      const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }), lam(color, logs));
      if (along) {
        gable.rotation.y = Math.PI / 2;
        gable.position.set(bx + side * (bw - 0.2), height, bz + bh / 2);
      } else {
        gable.position.set(bx + bw / 2, height, bz + side * (bh - 0.2));
      }
      g.add(gable);
    }
    g.add(box(along ? len : 0.2, 0.2, along ? 0.2 : len, roofMat, bx + bw / 2, height + rise + 0.05, bz + bh / 2));
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) block(x, y, true);
    group.add(g);
    return g;
  };
  // The cottage, with a red door and a porch light.
  const cottage = building(8, 6, 6, 4, 3.2, 0x9c6a42);
  cottage.add(box(1.0, 2.0, 0.08, lam(0x8a1c1c), cc(11), 1.0, 10 * TILE + 0.1));
  const porch = new THREE.PointLight(0xffd9a0, 6, 10, 1.6);
  porch.position.set(cc(11), 2.6, 10 * TILE + 0.6);
  cottage.add(porch);
  for (const wx of [9, 13]) {
    cottage.add(box(1.1, 1.0, 0.1, lam(0xf2efe6), cc(wx), 1.6, 10 * TILE + 0.06));
    cottage.add(box(0.9, 0.8, 0.06, lam(0xffe8a0, null, 0x886620), cc(wx), 1.6, 10 * TILE + 0.1));
    cottage.add(box(0.05, 0.8, 0.08, lam(0xf2efe6), cc(wx), 1.6, 10 * TILE + 0.13));
    cottage.add(box(0.9, 0.05, 0.08, lam(0xf2efe6), cc(wx), 1.6, 10 * TILE + 0.13));
  }
  cottage.add(box(1.25, 2.25, 0.1, lam(0xf2efe6), cc(11), 1.1, 10 * TILE + 0.04));
  add('bed', 11, 10, cottage);
  // Stash: a chest on the porch.
  const chest = new THREE.Group();
  chest.add(box(1.0, 0.6, 0.6, lam(0x6a4020, planks), 0, 0.3, 0));
  chest.add(box(1.05, 0.08, 0.65, lam(0x3a2010), 0, 0.62, 0));
  for (const x of [-0.35, 0.35]) chest.add(box(0.06, 0.66, 0.64, lam(0x555555), x, 0.33, 0));
  chest.position.set(cc(13) + 0.3, 0, cc(11));
  group.add(chest);
  block(13, 11);
  add('stash', 13, 11, chest);

  // The sauna hut on the shore, chimney smoking.
  const sauna = building(22, 20, 3, 3, 2.6, 0x8a5a30);
  sauna.add(box(0.9, 1.9, 0.08, lam(0x5a3a1a), cc(23), 0.95, 20 * TILE - 0.05));
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 12), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.5 }));
  chimney.position.set(cc(24), 3.8, cc(21));
  sauna.add(chimney);
  const smoke = new THREE.Group();
  smoke.name = 'smoke';
  smoke.position.set(cc(24), 4.4, cc(21));
  for (let i = 0; i < 5; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.3 + i * 0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.35, depthWrite: false }));
    puff.position.y = i * 0.5;
    smoke.add(puff);
  }
  group.add(smoke);
  add('kiuas', 23, 19, sauna);

  // Laituri, with the avanto at the end.
  const dockMat = lam(0xa07a50, planks);
  for (let y = LAKE_ROW - 1; y <= dockEnd; y++) {
    for (let k = 0; k < 4; k++) group.add(box(TILE * 0.95, 0.06, TILE / 4 - 0.05, dockMat, cc(dockX), 0.26, cc(y) - TILE / 2 + TILE / 8 + k * (TILE / 4)));
    if ((y - LAKE_ROW) % 2 === 0) for (const side of [-1, 1]) group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.4, 10), dockMat).translateX(cc(dockX) + side * TILE * 0.45).translateY(-0.4).translateZ(cc(y)));
  }
  const ladder = box(0.6, 0.8, 0.1, lam(0x888888), cc(dockX), 0.1, cc(LAKE_ROW + 5) + 1);
  group.add(ladder);
  add('lake', dockX, LAKE_ROW + 5, ladder);

  // Grill and the Saunatonttu's rune stone.
  const grill = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1e1e1e, metalness: 0.6, roughness: 0.4, side: THREE.DoubleSide }));
  bowl.position.y = 0.82;
  grill.add(bowl);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 8), lam(0x333333));
    leg.position.set(Math.sin(a) * 0.28, 0.42, Math.cos(a) * 0.28);
    leg.rotation.set(Math.cos(a) * 0.18, 0, -Math.sin(a) * 0.18);
    grill.add(leg);
  }
  const coals = new THREE.Mesh(new THREE.CircleGeometry(0.38, 18), lam(0xff5a1a, null, 0xaa3300));
  coals.rotation.x = -Math.PI / 2;
  coals.position.y = 0.8;
  grill.add(coals);
  const grate = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 4, 24), lam(0x888888));
  grate.rotation.x = Math.PI / 2;
  grate.position.y = 0.84;
  grill.add(grate);
  const glow = new THREE.PointLight(0xff7a2a, 3, 5, 2);
  glow.position.y = 1.2;
  grill.add(glow);
  grill.position.set(cc(15), 0, cc(14));
  group.add(grill);
  block(15, 14);
  add('grill', 15, 14, grill);

  const stone = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), lam(0x7d7d80));
  rock.scale.set(0.8, 1.4, 0.6);
  rock.position.y = 1.1;
  stone.add(rock);
  const rune = box(0.5, 0.5, 0.02, new THREE.MeshBasicMaterial({ color: 0x7dffea }), 0, 1.3, 0.52);
  stone.add(rune);
  stone.position.set(cc(28), 0, cc(8));
  group.add(stone);
  block(28, 8, true);
  add('runestone', 28, 8, stone);
  spawns.push({ kind: 'tonttu', x: cc(27), z: cc(10), room: 0 });

  // The car, which is how Monday happens.
  const car = new THREE.Group();
  const paintMat = new THREE.MeshStandardMaterial({ color: 0xb03030, metalness: 0.5, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x223344, metalness: 0.2, roughness: 0.1 });
  car.add(new THREE.Mesh(new RoundedBoxGeometry(4.1, 0.85, 1.9, 3, 0.3), paintMat).translateY(0.72));
  car.add(new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.8, 1.75, 3, 0.28), paintMat).translateX(-0.35).translateY(1.4));
  car.add(new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.62, 1.8, 2, 0.2), glass).translateX(-0.35).translateY(1.43));
  for (const x of [-2.03, 2.03]) for (const z of [-0.6, 0.6]) car.add(new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), lam(x > 0 ? 0xfff6c0 : 0xff3030, null, x > 0 ? 0x999966 : 0x660000)).translateX(x).translateY(0.85).translateZ(z).rotateY(x > 0 ? Math.PI / 2 : -Math.PI / 2));
  for (const [x, z] of [[-1.3, 0.95], [1.3, 0.95], [-1.3, -0.95], [1.3, -0.95]] as const) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.13, 10, 18), lam(0x111111));
    wheel.position.set(x, 0.4, z);
    car.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 14), new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.8, roughness: 0.3 }));
    hub.rotation.x = Math.PI / 2;
    hub.position.set(x, 0.4, z);
    car.add(hub);
  }
  car.position.set(cc(4) + 1, 0, cc(4));
  group.add(car);
  for (let x = 3; x <= 5; x++) block(x, 4);
  add('car', 5, 5, car);

  // ---- What you have built. ----
  const place = (mesh: THREE.Object3D, x: number, y: number, cells: readonly [number, number][], rotY = 0): THREE.Object3D => {
    mesh.position.set(cc(x), 0, cc(y));
    mesh.rotation.y = rotY;
    group.add(mesh);
    for (const [bx, by] of cells) block(bx, by);
    return mesh;
  };
  // The upgrade board is always there: it is where you plan the farm.
  add('board', 16, 10, place(boardMesh(), 16, 10, [[16, 10]], Math.PI));
  if (has('woodshed')) place(woodshedMesh(), 6, 13, [[5, 13], [6, 13], [7, 13]]);
  if (has('savusauna')) {
    const smokeSauna = place(savusaunaMesh(), 28, 21, [[27, 20], [28, 20], [29, 20], [27, 21], [28, 21], [29, 21]]);
    add('kiuas', 28, 19, smokeSauna);
  }
  if (has('laituri')) {
    const boat = boatMesh();
    boat.position.set(cc(dockX) + 1.6, 0, cc(LAKE_ROW + 4));
    group.add(boat);
    add('dock', dockX, dockEnd, boat);
  }
  if (has('potatoes')) add('patch', 5, 17, place(potatoPatchMesh(), 5, 17, [[4, 17], [5, 17], [6, 17]]));
  if (has('palju')) add('palju', 20, 21, place(paljuMesh(), 20, 21, [[20, 21]]));
  if (has('guestroom')) building(14, 6, 2, 3, 2.6, 0xa0683a);
  if (has('dog')) place(kennelMesh(), 7, 12, [[7, 12]], Math.PI / 2);
  if (has('runegarden')) place(standingStonesMesh(), 30, 11, [[30, 11]]);
  if (has('satellite')) {
    const dish = dishMesh();
    dish.position.set(cc(12), 4.1, cc(7));
    cottage.add(dish);
    add('terminal', 9, 10, dish);
  }
  if (has('library')) add('bookshelf', 8, 11, place(bookshelfMesh(), 8, 11, [[8, 11]]));

  // Trees inside the plot, clear of everything.
  const keepClear = (x: number, y: number): boolean => solid[y * W + x] === 1 || y >= LAKE_ROW - 2 || (y > 9 && y < 17 && x > 7 && x < 20) || (x < 12 && y < 10);
  for (let i = 0; i < 26; i++) {
    const x = r.int(2, W - 3);
    const y = r.int(2, LAKE_ROW - 3);
    if (keepClear(x, y)) continue;
    let crowded = false;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (solid[(y + oy) * W + x + ox] === 1) crowded = true;
    if (crowded) continue;
    if (r.chance(0.6)) addPine(cc(x), cc(y), r.range(0.9, 1.3));
    else addBirch(cc(x), cc(y), r.range(0.9, 1.2));
    block(x, y);
  }
  if (trunkGeo.length > 0) group.add(new THREE.Mesh(mergeGeometries(trunkGeo), lam(0x5a3a1e)));
  if (pineGeo.length > 0) group.add(new THREE.Mesh(mergeGeometries(pineGeo), lam(0x2f5a2a)));
  if (birchGeo.length > 0) group.add(new THREE.Mesh(mergeGeometries(birchGeo), lam(0xeeeeea)));
  if (leafGeo.length > 0) group.add(new THREE.Mesh(mergeGeometries(leafGeo), lam(0x7aa84a)));

  if (!headless) {
    // The white night: the sun sits just above the northern treeline and never quite sets.
    const sky = new Sky();
    sky.scale.setScalar(150);
    sky.name = 'sky';
    const u = sky.material.uniforms;
    const set = (k: string, v: number): void => { const x = u[k]; if (x !== undefined) x.value = v; };
    set('turbidity', 3.5);
    set('rayleigh', 1.4);
    set('mieCoefficient', 0.004);
    set('mieDirectionalG', 0.78);
    set('cloudCoverage', 0.35);
    set('cloudDensity', 0.35);
    (u.sunPosition?.value as THREE.Vector3 | undefined)?.copy(MOKKI_SUN);
    group.add(sky);
    group.add(grassField(solid, seed));
  }
  // Everything standing up casts a shadow in the low sun.
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.name === 'ground' || o.name === 'water' || o.name === 'sky') return;
    o.castShadow = true;
    o.receiveShadow = true;
  });

  // Mosquitoes by the water, obviously.
  for (let i = 0; i < 7; i++) spawns.push({ kind: 'mosquito', x: cc(r.int(4, W - 5)), z: cc(r.int(LAKE_ROW - 6, LAKE_ROW - 2)), room: 0 });

  const room: Room = { x: 1, y: 1, w: W - 2, h: H - 2, kind: 'lobby', id: 0 };
  const seen = new Uint8Array(W * H).fill(1);
  return {
    w: W, h: H, floor, solid, opaque, roomOf, rooms: [room], interactables, spawns,
    start: { x: cc(7), z: cc(5) },
    bossSpawn: { x: cc(8), z: cc(5) },
    lightSpots: [],
    group,
    seen,
  };
}

/** Where the white-night sun hangs: low, in the north (-z). */
export const MOKKI_SUN = new THREE.Vector3(-0.35, 0.09, -0.93).normalize();

/**
 * The lake: ripples from a few moving sine waves, the sky in it at a low
 * angle (fresnel), and the sun on it. No reflection render: cheap enough
 * for every quality setting.
 */
function waterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    fog: true,
    uniforms: {
      ...THREE.UniformsLib.fog,
      time: { value: 0 },
      sunDir: { value: MOKKI_SUN.clone() },
      deep: { value: new THREE.Color(0x0e2a3c) },
      shallow: { value: new THREE.Color(0x2f6a7e) },
      skyCol: { value: new THREE.Color(0xf6c9a8) },
    },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float time;
      uniform vec3 sunDir, deep, shallow, skyCol;
      varying vec3 vWorld;
      vec2 wave(vec2 p, vec2 d, float f, float s) {
        float ph = dot(p, d) * f + time * s;
        return d * cos(ph) * f;
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.9, 1.3) * 0.06
               + wave(p, normalize(vec2(-0.4, 1.0)), 1.7, 1.9) * 0.035
               + wave(p, normalize(vec2(0.7, -0.8)), 3.1, 2.7) * 0.02
               + wave(p, normalize(vec2(-1.0, -0.2)), 6.3, 3.9) * 0.01;
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        float depthMix = clamp((vWorld.z - 50.0) / 30.0, 0.0, 1.0);
        vec3 col = mix(shallow, deep, depthMix);
        col = mix(col, skyCol, 0.25 + 0.6 * fres);
        vec3 h = normalize(sunDir + v);
        float spec = pow(max(dot(n, h), 0.0), 180.0);
        col += vec3(1.0, 0.85, 0.65) * spec * 1.6;
        gl_FragColor = vec4(col, 0.94);
        #include <fog_fragment>
      }`,
  });
}

/** Tufts of grass over the plot, swaying in a breeze off the lake. */
function grassField(solid: Uint8Array, seed: number): THREE.InstancedMesh {
  const r = new Rng(seed ^ 0x9e37);
  // A tuft: three tapered blades, leaning out a little, pointed at the tip.
  const blade = new THREE.PlaneGeometry(0.09, 0.5, 1, 4);
  blade.translate(0, 0.25, 0);
  const pos = blade.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) * (1 - (y / 0.5) * 0.92));
    pos.setZ(i, (y / 0.5) * (y / 0.5) * 0.08);
  }
  blade.computeVertexNormals();
  const cross = mergeGeometries([0, 1, 2].map((k) => blade.clone().rotateY((k * Math.PI * 2) / 3).translate(Math.sin(k * 2.1) * 0.03, 0, Math.cos(k * 2.1) * 0.03)));
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const time = { value: 0 };
  mat.onBeforeCompile = (shader): void => {
    shader.uniforms.windTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float windTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(windTime * 1.7 + wp.x * 0.35 + wp.z * 0.21) * 0.12 + sin(windTime * 3.1 + wp.z * 0.9) * 0.04;
        transformed.x += sway * position.y * position.y * 3.0;`);
  };
  mat.userData.windTime = time;
  const count = 3200;
  const mesh = new THREE.InstancedMesh(cross, mat, count);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let n = 0;
  for (let t = 0; t < count * 3 && n < count; t++) {
    const x = r.range(2, (W - 2) * TILE);
    const z = r.range(2, (LAKE_ROW - 0.4) * TILE);
    const cx = Math.floor(x / TILE);
    const cz = Math.floor(z / TILE);
    if (solid[cz * W + cx] === 1) continue;
    const sc = r.range(0.6, 1.4);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.range(0, Math.PI));
    m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(sc, sc * r.range(0.7, 1.3), sc));
    mesh.setMatrixAt(n, m4);
    col.setHSL(r.range(0.23, 0.3), r.range(0.4, 0.6), r.range(0.28, 0.42));
    if (r.chance(0.04)) col.setHSL(r.range(0.12, 0.16), 0.7, 0.55);
    mesh.setColorAt(n, col);
    n++;
  }
  mesh.count = n;
  mesh.name = 'grass';
  mesh.receiveShadow = true;
  return mesh;
}

