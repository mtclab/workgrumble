import * as THREE from 'three';
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
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
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
  group.add(ground);
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry((W - 2) * TILE + 80, (H - LAKE_ROW) * TILE + 40),
    new THREE.MeshLambertMaterial({ color: 0x2f5f7a, emissive: 0x0a2030, transparent: true, opacity: 0.92 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.set((W * TILE) / 2, 0.05, LAKE_ROW * TILE + ((H - LAKE_ROW) * TILE + 40) / 2);
  water.name = 'water';
  group.add(water);
  // Shore stones.
  const stoneGeo: THREE.BufferGeometry[] = [];
  for (let x = 1; x < W - 1; x++) {
    if (!r.chance(0.5)) continue;
    const g = new THREE.DodecahedronGeometry(r.range(0.3, 0.7));
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
    const t = new THREE.CylinderGeometry(0.18 * s, 0.25 * s, 1.6 * s, 6);
    t.translate(x, 0.8 * s, z);
    trunkGeo.push(t);
    for (let i = 0; i < 3; i++) {
      const c = new THREE.ConeGeometry((1.6 - i * 0.4) * s, 2.0 * s, 7);
      c.translate(x, (2.0 + i * 1.2) * s, z);
      pineGeo.push(c);
    }
  };
  const addBirch = (x: number, z: number, s: number): void => {
    const t = new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 4 * s, 6);
    t.translate(x, 2 * s, z);
    birchGeo.push(t);
    const l = new THREE.IcosahedronGeometry(1.4 * s, 0);
    l.translate(x, 4.4 * s, z);
    leafGeo.push(l);
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
    const walls = box(bw, height, bh, lam(color, logs), bx + bw / 2, height / 2, bz + bh / 2);
    g.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(bw, bh) * 0.78, 1.8, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(bw / Math.max(bw, bh), 1, bh / Math.max(bw, bh));
    roof.position.set(bx + bw / 2, height + 0.9, bz + bh / 2);
    g.add(roof);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) block(x, y, true);
    group.add(g);
    return g;
  };
  // The cottage, with a red door and a porch light.
  const cottage = building(8, 6, 6, 4, 3.2, 0xb0703a);
  cottage.add(box(1.0, 2.0, 0.08, lam(0x8a1c1c), cc(11), 1.0, 10 * TILE + 0.05));
  const porch = new THREE.PointLight(0xffd9a0, 6, 10, 1.6);
  porch.position.set(cc(11), 2.6, 10 * TILE + 0.6);
  cottage.add(porch);
  for (const wx of [9, 13]) cottage.add(box(0.9, 0.8, 0.06, lam(0xffe8a0, null, 0x886620), cc(wx), 1.6, 10 * TILE + 0.04));
  add('bed', 11, 10, cottage);
  // Stash: a chest on the porch.
  const chest = new THREE.Group();
  chest.add(box(1.0, 0.6, 0.6, lam(0x6a4020, planks), 0, 0.3, 0));
  chest.add(box(1.05, 0.08, 0.65, lam(0x3a2010), 0, 0.62, 0));
  chest.position.set(cc(13) + 0.3, 0, cc(11));
  group.add(chest);
  block(13, 11);
  add('stash', 13, 11, chest);

  // The sauna hut on the shore, chimney smoking.
  const sauna = building(22, 20, 3, 3, 2.6, 0x8a5a30);
  sauna.add(box(0.9, 1.9, 0.08, lam(0x5a3a1a), cc(23), 0.95, 20 * TILE - 0.05));
  const chimney = box(0.4, 1.4, 0.4, lam(0x444444), cc(24), 3.6, cc(21));
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
  for (let y = LAKE_ROW - 1; y <= dockEnd; y++) group.add(box(TILE * 0.9, 0.2, TILE, dockMat, cc(dockX), 0.2, cc(y)));
  const ladder = box(0.6, 0.8, 0.1, lam(0x888888), cc(dockX), 0.1, cc(LAKE_ROW + 5) + 1);
  group.add(ladder);
  add('lake', dockX, LAKE_ROW + 5, ladder);

  // Grill and the Saunatonttu's rune stone.
  const grill = new THREE.Group();
  grill.add(box(0.9, 0.8, 0.6, lam(0x222222), 0, 0.4, 0));
  grill.add(box(0.8, 0.05, 0.5, lam(0xff5a1a, null, 0xaa3300), 0, 0.82, 0));
  const glow = new THREE.PointLight(0xff7a2a, 3, 5, 2);
  glow.position.y = 1.2;
  grill.add(glow);
  grill.position.set(cc(15), 0, cc(14));
  group.add(grill);
  block(15, 14);
  add('grill', 15, 14, grill);

  const stone = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), lam(0x7d7d80));
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
  car.add(box(4.0, 1.0, 1.9, lam(0xb03030), 0, 0.7, 0));
  car.add(box(2.2, 0.8, 1.7, lam(0x223344), -0.2, 1.5, 0));
  for (const [x, z] of [[-1.3, 0.95], [1.3, 0.95], [-1.3, -0.95], [1.3, -0.95]] as const) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), lam(0x111111));
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, 0.4, z);
    car.add(wheel);
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
