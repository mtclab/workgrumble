import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './rng';
import { normalMapFrom } from './graphics';
import {
  woodTexture,
  carpetTexture,
  ceilingTexture,
  parquetTexture,
  POSTERS,
  posterTexture,
  rackTexture,
  screenTexture,
  signTexture,
  type Theme,
  tileTexture,
  wallTexture,
} from './textures';

/** World units per grid cell. */
export const TILE = 2;
export const WALL_H = 3.2;

export type RoomKind =
  | 'lobby'
  | 'cubicles'
  | 'meeting'
  | 'kitchen'
  | 'server'
  | 'it'
  | 'office'
  | 'boss'
  | 'print'
  | 'sauna';

export interface Room {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  kind: RoomKind;
  readonly id: number;
}

export type InteractKind =
  | 'terminal'
  | 'printer'
  | 'cooler'
  | 'coffee'
  | 'vending'
  | 'itdesk'
  | 'elevator'
  | 'crate'
  | 'kiuas'
  | 'locker'
  | 'fridge'
  | 'pantti'
  | 'bed'
  | 'lake'
  | 'grill'
  | 'stash'
  | 'car'
  | 'runestone'
  | 'board'
  | 'dock'
  | 'patch'
  | 'palju'
  | 'bookshelf';

export interface Interactable {
  readonly kind: InteractKind;
  readonly x: number;
  readonly z: number;
  readonly id: number;
  readonly room: number;
  used: boolean;
  /** Meshes to highlight or change when used. */
  readonly mesh: THREE.Object3D | null;
  /** Lock difficulty for supply closets (0 = unlocked). */
  lock: number;
}

export type SpawnKind =
  | 'user' | 'caller' | 'customer' | 'manager' | 'healer' | 'helper' | 'reply' | 'jam' | 'npc' | 'tonttu' | 'mosquito'
  | 'consultant' | 'shadowit' | 'vendor' | 'chatbot';

export interface Spawn {
  readonly kind: SpawnKind;
  readonly x: number;
  readonly z: number;
  readonly room: number;
}

export interface Level {
  readonly w: number;
  readonly h: number;
  /** 1 = walkable floor. */
  readonly floor: Uint8Array;
  /** 1 = something solid stands in this cell. */
  readonly solid: Uint8Array;
  /** 1 = blocks line of sight. */
  readonly opaque: Uint8Array;
  /** Room index per cell, -1 for corridors and walls. */
  readonly roomOf: Int16Array;
  readonly rooms: readonly Room[];
  readonly interactables: Interactable[];
  readonly spawns: readonly Spawn[];
  readonly start: { x: number; z: number };
  readonly bossSpawn: { x: number; z: number };
  readonly lightSpots: readonly THREE.Vector3[];
  readonly group: THREE.Group;
  /** Which cells the player has seen, for the automap. */
  readonly seen: Uint8Array;
}

export function cellCenter(c: number): number {
  return c * TILE + TILE / 2;
}

export function toCell(v: number): number {
  return Math.floor(v / TILE);
}

export function isSolidAt(level: Level, x: number, z: number): boolean {
  const cx = toCell(x);
  const cz = toCell(z);
  if (cx < 0 || cz < 0 || cx >= level.w || cz >= level.h) return true;
  return level.solid[cz * level.w + cx] === 1;
}

/** Grid DDA line of sight between two world points. */
export function lineOfSight(level: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  const steps = Math.ceil(dist / (TILE * 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = toCell(ax + dx * t);
    const cz = toCell(az + dz * t);
    if (cx < 0 || cz < 0 || cx >= level.w || cz >= level.h) return false;
    if (level.opaque[cz * level.w + cx] === 1) return false;
  }
  return true;
}

/**
 * Whether a wall stands between two points: a cell that blocks sight and is
 * not floor. Props that block sight (pillars, lockers, racks) stand on floor
 * cells and are left out on purpose - a pillar fills half its cell, and
 * something behind it can still show round the side - as are see-through
 * walls, which are not opaque. So this only ever says "hidden" for a real wall.
 */
export function wallBetween(level: Level, ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const steps = Math.ceil(Math.hypot(dx, dz) / (TILE * 0.25));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = toCell(ax + dx * t);
    const cz = toCell(az + dz * t);
    if (cx < 0 || cz < 0 || cx >= level.w || cz >= level.h) return true;
    const c = cz * level.w + cx;
    if (level.opaque[c] === 1 && level.floor[c] !== 1) return true;
  }
  return false;
}

/** Push a circle out of solid cells. Returns true if it hit something. */
export function collideCircle(level: Level, pos: THREE.Vector3, r: number): boolean {
  let hit = false;
  const minX = toCell(pos.x - r);
  const maxX = toCell(pos.x + r);
  const minZ = toCell(pos.z - r);
  const maxZ = toCell(pos.z + r);
  for (let cz = minZ; cz <= maxZ; cz++) {
    for (let cx = minX; cx <= maxX; cx++) {
      const out = cx < 0 || cz < 0 || cx >= level.w || cz >= level.h;
      if (!out && level.solid[cz * level.w + cx] !== 1) continue;
      const x0 = cx * TILE;
      const z0 = cz * TILE;
      const nx = Math.max(x0, Math.min(pos.x, x0 + TILE));
      const nz = Math.max(z0, Math.min(pos.z, z0 + TILE));
      const ddx = pos.x - nx;
      const ddz = pos.z - nz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < r * r) {
        hit = true;
        const d = Math.sqrt(d2);
        if (d > 1e-5) {
          pos.x = nx + (ddx / d) * r;
          pos.z = nz + (ddz / d) * r;
        } else {
          // Centre inside the cell: shove out along the shallow axis.
          const cxm = x0 + TILE / 2;
          const czm = z0 + TILE / 2;
          if (Math.abs(pos.x - cxm) > Math.abs(pos.z - czm)) {
            pos.x = pos.x > cxm ? x0 + TILE + r : x0 - r;
          } else {
            pos.z = pos.z > czm ? z0 + TILE + r : z0 - r;
          }
        }
      }
    }
  }
  return hit;
}

/** BFS distance field over walkable cells, for enemy navigation. */
export function flowField(level: Level, fromX: number, fromZ: number, maxSteps = 60): Int16Array {
  const dist = new Int16Array(level.w * level.h).fill(-1);
  const sx = toCell(fromX);
  const sz = toCell(fromZ);
  if (sx < 0 || sz < 0 || sx >= level.w || sz >= level.h) return dist;
  const queue = new Int32Array(level.w * level.h);
  let head = 0;
  let tail = 0;
  const start = sz * level.w + sx;
  dist[start] = 0;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++] as number;
    const d = dist[cur] as number;
    if (d >= maxSteps) continue;
    const cx = cur % level.w;
    const cz = (cur - cx) / level.w;
    for (const [ox, oz] of NEIGHBOURS4) {
      const nx = cx + ox;
      const nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= level.w || nz >= level.h) continue;
      const n = nz * level.w + nx;
      if (dist[n] !== -1 || level.solid[n] === 1) continue;
      dist[n] = d + 1;
      queue[tail++] = n;
    }
  }
  return dist;
}

const NEIGHBOURS4: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const NEIGHBOURS8: readonly (readonly [number, number])[] = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

// ---------------------------------------------------------------------------
// Generation

interface Builder {
  readonly boxes: Map<string, THREE.BufferGeometry[]>;
}

/** Built once, cloned into place: most furniture comes in a handful of sizes. */
const templates = new Map<string, THREE.BufferGeometry>();
function template(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let t = templates.get(key);
  if (t === undefined) {
    const g = make();
    // A plain BufferGeometry: cloning a RoundedBoxGeometry would rebuild one from scratch first.
    const flat = g.index !== null ? g.toNonIndexed() : g;
    t = new THREE.BufferGeometry().copy(flat);
    if (flat !== g) flat.dispose();
    g.dispose();
    templates.set(key, t);
  }
  return t.clone();
}

/** A softened box: every prop edge catches the light instead of ending in a hard line. */
function softBox(sx: number, sy: number, sz: number, round = 0.35): THREE.BufferGeometry {
  const r = Math.min(0.05, Math.min(sx, sy, sz) * round);
  // Big pieces get a smooth bevel; small ones a single chamfer; slivers stay square.
  const seg = Math.max(sx, sy, sz) > 0.9 ? 2 : 1;
  return template(`box|${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}|${r.toFixed(3)}`, () => (r < 0.006 ? new THREE.BoxGeometry(sx, sy, sz) : new RoundedBoxGeometry(sx, sy, sz, seg, r)));
}

function addBox(
  b: Builder,
  key: string,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  rotY = 0,
): void {
  if (!decor) return;
  const g = softBox(sx, sy, sz);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(x, y, z);
  addGeom(b, key, g);
}

/** Any shape, merged with everything else of the same material. */
function addGeom(b: Builder, key: string, g: THREE.BufferGeometry): void {
  if (!decor) {
    g.dispose();
    return;
  }
  const list = b.boxes.get(key);
  if (list === undefined) b.boxes.set(key, [g]);
  else list.push(g);
}

/** Place a geometry: rotate about y, then move. */
function placed(g: THREE.BufferGeometry, x: number, y: number, z: number, rotY = 0): THREE.BufferGeometry {
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

/** A swivel office chair; the seat faces +z after `rotY`, the back is behind it. */
function officeChair(b: Builder, x: number, z: number, rotY: number): void {
  if (!decor) return;
  const local = (lx: number, lz: number): [number, number] => [x + lx * Math.cos(rotY) + lz * Math.sin(rotY), z - lx * Math.sin(rotY) + lz * Math.cos(rotY)];
  addGeom(b, 'chair', placed(softBox(0.5, 0.09, 0.48, 0.5), x, 0.5, z, rotY));
  const [bx, bz] = local(0, -0.24);
  const back = softBox(0.46, 0.55, 0.07, 0.5);
  back.rotateX(-0.12);
  addGeom(b, 'chair', placed(back, bx, 0.86, bz, rotY));
  addGeom(b, 'metal', placed(template('chair-column', () => new THREE.CylinderGeometry(0.03, 0.035, 0.36, 8)), x, 0.28, z));
  for (let k = 0; k < 5; k++) {
    const a = rotY + (k / 5) * Math.PI * 2;
    const leg = softBox(0.05, 0.035, 0.3, 0.5);
    leg.translate(0, 0, 0.15);
    addGeom(b, 'metal', placed(leg, x, 0.09, z, a));
    addGeom(b, 'chair', placed(template('caster', () => new THREE.SphereGeometry(0.035, 6, 4)), x + Math.sin(a) * 0.29, 0.035, z + Math.cos(a) * 0.29));
  }
}

/** A flat-panel monitor on a stand, its screen facing +z after `rotY`. */
function flatMonitor(b: Builder, x: number, y: number, z: number, rotY: number, w = 0.6): void {
  if (!decor) return;
  addGeom(b, 'monitor', placed(softBox(w, w * 0.62, 0.04, 0.5), x, y + 0.34, z, rotY));
  addGeom(b, 'metal', placed(template('monitor-neck', () => new THREE.CylinderGeometry(0.018, 0.018, 0.24, 6)), x, y + 0.12, z));
  addGeom(b, 'metal', placed(softBox(0.22, 0.015, 0.15, 0.5), x, y + 0.008, z, rotY));
}

/** A potted office plant: a tapered pot, a clump of leaves. `seed` varies it without touching the level's dice. */
function pottedPlant(b: Builder, x: number, z: number, seed: number, tall = 1): void {
  if (!decor) return;
  addGeom(b, 'plant', placed(new THREE.CylinderGeometry(0.24, 0.18, 0.5, 14), x, 0.25, z));
  addGeom(b, 'plant', placed(new THREE.TorusGeometry(0.235, 0.03, 6, 16).rotateX(Math.PI / 2), x, 0.5, z));
  const n = 5 + (seed % 3);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + seed * 0.7;
    const rr = 0.12 + ((seed >> k) & 1) * 0.08;
    const leaf = new THREE.IcosahedronGeometry(0.2 + ((seed + k) % 3) * 0.05, 1);
    leaf.scale(1, 1.3 * tall, 1);
    addGeom(b, 'leaf', placed(leaf, x + Math.sin(a) * rr, 0.75 + ((k * 7 + seed) % 5) * 0.12 * tall, z + Math.cos(a) * rr));
  }
  addGeom(b, 'leaf', placed(new THREE.IcosahedronGeometry(0.22, 1).scale(1, 1.4 * tall, 1), x, 1.15 * tall + 0.1, z));
}

/** A desk plant: a small pot and a few leaves. */
function deskPlant(b: Builder, x: number, y: number, z: number): void {
  if (!decor) return;
  addGeom(b, 'plant', placed(new THREE.CylinderGeometry(0.07, 0.055, 0.12, 10), x, y + 0.06, z));
  for (let k = 0; k < 3; k++) addGeom(b, 'leaf', placed(new THREE.IcosahedronGeometry(0.07, 1).scale(0.8, 1.4, 0.8), x + (k - 1) * 0.04, y + 0.18 + (k % 2) * 0.04, z));
}

/** Deterministic noise from a cell, so decoration never consumes the level's dice. */
function cellHash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return h;
}

/**
 * Textures need a DOM canvas; the unit tests generate floors in node, where
 * only the grid and geometry matter.
 */
let headless = false;
/** Furniture, trim and lights. The unit tests usually only need the grid; one test builds the lot. */
let decor = true;
function paint<T>(fn: () => T): T | null {
  return headless ? null : fn();
}

/**
 * Who you meet in an ordinary room. The building gets stranger as you go up:
 * the chatbot from the second floor, vendors and consultants from the third,
 * Shadow IT from the fourth.
 */
function rollHostile(r: Rng, floorIndex: number): SpawnKind {
  const roll = r.next();
  if (floorIndex >= 1 && roll < 0.07) return 'chatbot';
  if (floorIndex >= 2 && roll < 0.13) return 'vendor';
  if (floorIndex >= 2 && roll < 0.19) return 'consultant';
  if (floorIndex >= 3 && roll < 0.25) return 'shadowit';
  const rest = r.next();
  return rest < 0.45 ? 'user' : rest < 0.7 ? 'caller' : rest < 0.85 + floorIndex * 0.02 ? 'customer' : rest < 0.95 ? 'reply' : 'manager';
}

/** A walkable, empty cell in a room (for quest items and people placed after generation). */
export function freeSpotIn(level: Level, room: Room, r: Rng, taken: ReadonlySet<number> = new Set()): { x: number; z: number; cell: number } | null {
  for (let t = 0; t < 80; t++) {
    const x = r.int(room.x + 1, Math.max(room.x + 1, room.x + room.w - 2));
    const y = r.int(room.y + 1, Math.max(room.y + 1, room.y + room.h - 2));
    const i = y * level.w + x;
    if (level.floor[i] === 1 && level.solid[i] === 0 && !taken.has(i)) return { x: cellCenter(x), z: cellCenter(y), cell: i };
  }
  return null;
}

function clearFurnitureCell(builder: Builder, cell: number, w: number): void {
  const x = (cell % w) * TILE;
  const z = Math.floor(cell / w) * TILE;
  for (const [key, geoms] of builder.boxes) {
    builder.boxes.set(key, geoms.filter((g) => {
      g.computeBoundingBox();
      const b = g.boundingBox!;
      if (b.max.x <= x + 0.05 || b.min.x >= x + TILE - 0.05 || b.max.z <= z + 0.05 || b.min.z >= z + TILE - 0.05) return true;
      g.dispose();
      return false;
    }));
  }
}

export function repairFloorAccess(level: Pick<Level, 'w' | 'h' | 'floor' | 'solid' | 'opaque' | 'rooms' | 'interactables' | 'start'> & { spawns: Spawn[] }, r: Rng, builder: Builder): void {
  // Props must never seal off part of the floor. Flood from the
  // lobby. An empty pocket nobody needs is simply filled in. A pocket with
  // somebody in it gets a way in: squeeze past a desk if there is one, and
  // only if the one thing in the way is a machine (a fridge, a locker, a
  // terminal), move the people out instead of making the machine a ghost.
  const { w, h, floor, solid, opaque, rooms, spawns, interactables, start } = level;
  const lobby = rooms[0] as Room;
  const dropped = new Set<Spawn>();
  const stub = { w, h, solid } as unknown as Level;
  const machineCells = new Set(interactables.map((it) => toCell(it.z) * w + toCell(it.x)));
  const cellOf = (s: Spawn): number => toCell(s.z) * w + toCell(s.x);
  for (let guard = 0; guard < 400; guard++) {
    const reached = flowField(stub, start.x, start.z, 32000);
    let lost = -1;
    for (let i = 0; i < w * h; i++) {
      if (floor[i] === 1 && solid[i] === 0 && reached[i] === -1) {
        lost = i;
        break;
      }
    }
    if (lost < 0) break;
    const pocket = new Set<number>([lost]);
    const stack = [lost];
    while (stack.length > 0) {
      const cur = stack.pop() as number;
      const x = cur % w;
      const y = (cur - x) / w;
      for (const [ox, oy] of NEIGHBOURS4) {
        const n = (y + oy) * w + (x + ox);
        if (floor[n] === 1 && solid[n] === 0 && !pocket.has(n)) {
          pocket.add(n);
          stack.push(n);
        }
      }
    }
    const inside = spawns.map((sp, k) => (pocket.has(cellOf(sp)) ? k : -1)).filter((k) => k >= 0);
    if (inside.length === 0) {
      for (const i of pocket) solid[i] = 1;
      continue;
    }
    let bridge = -1;
    for (const i of pocket) {
      const x = i % w;
      const y = (i - x) / w;
      for (const [ox, oy] of NEIGHBOURS4) {
        const n = (y + oy) * w + (x + ox);
        if (floor[n] !== 1 || solid[n] !== 1 || machineCells.has(n)) continue;
        const nx = n % w;
        const ny = (n - nx) / w;
        if (NEIGHBOURS4.some(([ax, ay]) => reached[(ny + ay) * w + (nx + ax)] !== -1 && reached[(ny + ay) * w + (nx + ax)] !== undefined)) {
          bridge = n;
          break;
        }
      }
      if (bridge >= 0) break;
    }
    if (bridge >= 0) {
      solid[bridge] = 0;
      opaque[bridge] = 0;
      clearFurnitureCell(builder, bridge, w);
      continue;
    }
    // Only a machine in the way: rehome the people and fill the pocket.
    for (const k of inside) {
      const sp = spawns[k] as Spawn;
      const rm = rooms[sp.room] ?? lobby;
      let moved: Spawn | null = null;
      for (let t = 0; t < 60 && moved === null; t++) {
        const x = r.int(rm.x, rm.x + rm.w - 1);
        const y = r.int(rm.y, rm.y + rm.h - 1);
        const i = y * w + x;
        if (floor[i] === 1 && solid[i] === 0 && reached[i] !== -1) moved = { ...sp, x: cellCenter(x), z: cellCenter(y) };
      }
      if (moved === null) dropped.add(sp);
      else spawns[k] = moved;
    }
    for (const i of pocket) solid[i] = 1;
  }

  for (let k = spawns.length - 1; k >= 0; k--) if (dropped.has(spawns[k]!)) spawns.splice(k, 1);
}

export function generateLevel(floorIndex: number, theme: Theme, seed: number, noTextures = false, withDecor = !noTextures): Level {
  headless = noTextures;
  decor = withDecor;
  const r = new Rng(seed);
  const w = 44 + Math.min(floorIndex, 4) * 4;
  const h = w;
  const floor = new Uint8Array(w * h);
  const solid = new Uint8Array(w * h).fill(1);
  const opaque = new Uint8Array(w * h).fill(1);
  const roomOf = new Int16Array(w * h).fill(-1);
  const rooms: Room[] = [];

  const carve = (x: number, y: number, room: number): void => {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return;
    const i = y * w + x;
    floor[i] = 1;
    solid[i] = 0;
    opaque[i] = 0;
    if (room >= 0) roomOf[i] = room;
  };

  // Rooms: rejection-sampled rectangles with a one-cell wall between.
  const target = 9 + Math.min(floorIndex, 4) * 2;
  for (let tries = 0; tries < 600 && rooms.length < target; tries++) {
    const big = rooms.length === 0 ? false : tries % 7 === 0;
    const rw = big ? r.int(9, 12) : r.int(5, 9);
    const rh = big ? r.int(9, 12) : r.int(5, 9);
    const rx = r.int(2, w - rw - 3);
    const ry = r.int(2, h - rh - 3);
    const clash = rooms.some((o) =>
      rx < o.x + o.w + 2 && rx + rw + 2 > o.x && ry < o.y + o.h + 2 && ry + rh + 2 > o.y);
    if (clash) continue;
    rooms.push({ x: rx, y: ry, w: rw, h: rh, kind: 'cubicles', id: rooms.length });
  }

  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) carve(x, y, room.id);
    }
  }

  // Corridors: a minimum spanning tree by centre distance, plus a few loops so
  // it plays like a dungeon rather than a tree.
  const centre = (rm: Room): [number, number] => [Math.floor(rm.x + rm.w / 2), Math.floor(rm.y + rm.h / 2)];
  const connected = new Set<number>([0]);
  const edges: [number, number][] = [];
  while (connected.size < rooms.length) {
    let best: [number, number, number] | null = null;
    for (const a of connected) {
      const ra = rooms[a] as Room;
      for (const rb of rooms) {
        if (connected.has(rb.id)) continue;
        const [ax, ay] = centre(ra);
        const [bx, by] = centre(rb);
        const d = Math.abs(ax - bx) + Math.abs(ay - by);
        if (best === null || d < best[2]) best = [a, rb.id, d];
      }
    }
    if (best === null) break;
    connected.add(best[1]);
    edges.push([best[0], best[1]]);
  }
  for (let i = 0; i < Math.floor(rooms.length / 3); i++) {
    edges.push([r.int(0, rooms.length - 1), r.int(0, rooms.length - 1)]);
  }
  for (const [a, b] of edges) {
    if (a === b) continue;
    const [ax, ay] = centre(rooms[a] as Room);
    const [bx, by] = centre(rooms[b] as Room);
    const horizontalFirst = r.chance(0.5);
    const cx = horizontalFirst ? bx : ax;
    const cy = horizontalFirst ? ay : by;
    const carveLine = (x0: number, y0: number, x1: number, y1: number): void => {
      const sx = Math.sign(x1 - x0);
      const sy = Math.sign(y1 - y0);
      let x = x0;
      let y = y0;
      for (;;) {
        carve(x, y, -1);
        carve(x + (sy !== 0 ? 1 : 0), y + (sx !== 0 ? 1 : 0), -1);
        if (x === x1 && y === y1) break;
        x += sx;
        y += sy;
      }
    };
    carveLine(ax, ay, cx, cy);
    carveLine(cx, cy, bx, by);
  }
  // Corridor cells that ended up inside a room keep the room id they had.

  // Assign kinds. Lobby = room 0, boss = farthest room from it.
  const [lx, ly] = centre(rooms[0] as Room);
  let bossIdx = 1;
  let bestD = -1;
  for (const rm of rooms) {
    if (rm.id === 0) continue;
    const [x, y] = centre(rm);
    const d = Math.abs(x - lx) + Math.abs(y - ly);
    if (d > bestD && rm.w >= 7 && rm.h >= 7) {
      bestD = d;
      bossIdx = rm.id;
    }
  }
  if (bestD < 0) {
    for (const rm of rooms) {
      if (rm.id === 0) continue;
      const [x, y] = centre(rm);
      const d = Math.abs(x - lx) + Math.abs(y - ly);
      if (d > bestD) {
        bestD = d;
        bossIdx = rm.id;
      }
    }
  }
  (rooms[0] as Room).kind = 'lobby';
  (rooms[bossIdx] as Room).kind = 'boss';
  const others = r.shuffle(rooms.filter((rm) => rm.id !== 0 && rm.id !== bossIdx));
  // A sauna on most floors: Finnish building regulations, probably.
  const plan: RoomKind[] = ['kitchen', 'it', 'server', 'meeting', 'print', 'office', 'sauna', 'kitchen', 'server', 'meeting'];
  const hasSauna = r.chance(0.7);
  others.forEach((rm, i) => {
    const k = plan[i];
    if (k === 'sauna' && !hasSauna) rm.kind = 'cubicles';
    else rm.kind = k !== undefined && (i < 7 || r.chance(0.5)) ? k : 'cubicles';
  });
  // The story NPC for this floor waits in an office, meeting room or desk area.
  const npcRoom = others.find((rm) => rm.kind === 'office') ?? others.find((rm) => rm.kind === 'meeting') ?? others.find((rm) => rm.kind === 'cubicles') ?? others[0];

  const group = new THREE.Group();
  const builder: Builder = { boxes: new Map() };
  const interactables: Interactable[] = [];
  const spawns: Spawn[] = [];
  const lightSpots: THREE.Vector3[] = [];
  let nextId = 0;

  const block = (x: number, y: number, blocksSight = false): void => {
    const i = y * w + x;
    solid[i] = 1;
    if (blocksSight) opaque[i] = 1;
  };
  const free = (x: number, y: number): boolean => {
    const i = y * w + x;
    return floor[i] === 1 && solid[i] === 0;
  };
  const addInteract = (kind: InteractKind, x: number, y: number, room: number, mesh: THREE.Object3D | null): void => {
    interactables.push({ kind, x: cellCenter(x), z: cellCenter(y), id: nextId++, room, used: false, mesh, lock: 0 });
  };
  // Doorway cells (room edge cells that a corridor enters) must never be
  // blocked, or rooms seal themselves off.
  const isDoorway = (x: number, y: number, rm: Room): boolean => {
    const edge = x === rm.x || y === rm.y || x === rm.x + rm.w - 1 || y === rm.y + rm.h - 1;
    if (!edge) return false;
    for (const [ox, oy] of NEIGHBOURS4) {
      const nx = x + ox;
      const ny = y + oy;
      const inside = nx >= rm.x && ny >= rm.y && nx < rm.x + rm.w && ny < rm.y + rm.h;
      if (!inside && floor[ny * w + nx] === 1) return true;
    }
    return false;
  };
  const nearDoor = (x: number, y: number, rm: Room): boolean => {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= rm.x && ny >= rm.y && nx < rm.x + rm.w && ny < rm.y + rm.h && isDoorway(nx, ny, rm)) return true;
      }
    }
    return false;
  };
  const wallSpot = (rm: Room): [number, number] | null => {
    for (let t = 0; t < 40; t++) {
      const side = r.int(0, 3);
      const x = side < 2 ? r.int(rm.x + 1, rm.x + rm.w - 2) : side === 2 ? rm.x : rm.x + rm.w - 1;
      const y = side >= 2 ? r.int(rm.y + 1, rm.y + rm.h - 2) : side === 0 ? rm.y : rm.y + rm.h - 1;
      if (free(x, y) && !nearDoor(x, y, rm)) return [x, y];
    }
    return null;
  };
  const interiorSpot = (rm: Room): [number, number] | null => {
    for (let t = 0; t < 40; t++) {
      const x = r.int(rm.x + 1, rm.x + rm.w - 2);
      const y = r.int(rm.y + 1, rm.y + rm.h - 2);
      if (free(x, y)) return [x, y];
    }
    return null;
  };

  const screenMats: THREE.MeshBasicMaterial[] = [];
  const addTerminal = (x: number, y: number, rm: Room, facing: number): void => {
    const cx = cellCenter(x);
    const cz = cellCenter(y);
    addBox(builder, 'desk', cx, 0.74, cz, 1.8, 0.08, 1.1, facing);
    // Legs sit at the desk's local ends, so rotate the offset with it.
    for (const side of [-1, 1]) {
      addBox(builder, 'metal', cx + side * 0.8 * Math.cos(facing), 0.36, cz - side * 0.8 * Math.sin(facing), 0.06, 0.72, 1.0, facing);
    }
    const mon = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.62, 0.5), new THREE.MeshLambertMaterial({ color: 0xd8d2bf }));
    body.position.y = 1.12;
    mon.add(body);
    const mat = new THREE.MeshBasicMaterial({ map: paint(() => screenTexture(['WorkgrumbleOS', '', '> tickets: ?', '> press E'], '#0a3a8c')) });
    screenMats.push(mat);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.5), mat);
    screen.position.set(0, 1.12, 0.26);
    mon.add(screen);
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.04, 0.22), new THREE.MeshLambertMaterial({ color: 0xcfc8b0 }));
    kb.position.set(0, 0.8, 0.35);
    mon.add(kb);
    mon.position.set(cx, 0, cz);
    mon.rotation.y = facing;
    group.add(mon);
    block(x, y);
    addInteract('terminal', x, y, rm.id, mon);
  };
  const facingInto = (x: number, y: number, rm: Room): number => {
    if (y === rm.y) return 0;
    if (y === rm.y + rm.h - 1) return Math.PI;
    if (x === rm.x) return Math.PI / 2;
    if (x === rm.x + rm.w - 1) return -Math.PI / 2;
    return 0;
  };

  const poster = (x: number, y: number, rm: Room): void => {
    // Stick a poster on the outside wall face next to (x,y).
    const cx = cellCenter(x);
    const cz = cellCenter(y);
    const text = r.pick(POSTERS);
    const posterSeed = r.int(0, 9999);
    const tex = paint(() => posterTexture(text, posterSeed));
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshLambertMaterial({ map: tex }));
    mesh.position.y = 1.9;
    if (y === rm.y) {
      mesh.position.set(cx, 1.9, cz - TILE / 2 + 0.02);
    } else if (y === rm.y + rm.h - 1) {
      mesh.position.set(cx, 1.9, cz + TILE / 2 - 0.02);
      mesh.rotation.y = Math.PI;
    } else if (x === rm.x) {
      mesh.position.set(cx - TILE / 2 + 0.02, 1.9, cz);
      mesh.rotation.y = Math.PI / 2;
    } else {
      mesh.position.set(cx + TILE / 2 - 0.02, 1.9, cz);
      mesh.rotation.y = -Math.PI / 2;
    }
    group.add(mesh);
  };

  for (const rm of rooms) {
    const x0 = rm.x;
    const y0 = rm.y;
    const x1 = rm.x + rm.w - 1;
    const y1 = rm.y + rm.h - 1;
    const cxr = cellCenter(Math.floor(rm.x + rm.w / 2));
    const czr = cellCenter(Math.floor(rm.y + rm.h / 2));
    lightSpots.push(new THREE.Vector3(cxr, WALL_H - 0.3, czr));
    for (let k = 0; k < 2; k++) {
      const spot = wallSpot(rm);
      if (spot !== null && rm.kind !== 'server') poster(spot[0], spot[1], rm);
    }

    switch (rm.kind) {
      case 'cubicles': {
        for (let y = y0 + 1; y < y1; y += 3) {
          for (let x = x0 + 1; x < x1; x++) {
            if (!free(x, y) || nearDoor(x, y, rm)) continue;
            const cx = cellCenter(x);
            const cz = cellCenter(y);
            addBox(builder, 'desk', cx, 0.74, cz, TILE - 0.04, 0.05, 1.2);
            for (const side of [-1, 1]) addBox(builder, 'metal', cx + side * (TILE / 2 - 0.08), 0.36, cz - 0.05, 0.05, 0.72, 1.0);
            addBox(builder, 'partition', cx, 0.7, cz - 0.62, TILE, 1.4, 0.08);
            addBox(builder, 'metal', cx, 1.41, cz - 0.62, TILE, 0.03, 0.1);
            flatMonitor(builder, cx + r.range(-0.4, 0.4), 0.77, cz - 0.3, 0);
            const hsh = cellHash(x, y);
            addBox(builder, 'chair', cx + 0.1, 0.785, cz + 0.05, 0.62, 0.02, 0.2);
            if ((hsh & 3) === 0) addGeom(builder, 'counter', placed(new THREE.CylinderGeometry(0.045, 0.04, 0.1, 10), cx + 0.62, 0.82, cz - 0.1));
            if ((hsh & 12) === 4) deskPlant(builder, cx - 0.7, 0.77, cz - 0.35);
            officeChair(builder, cx, cz + 0.85, Math.PI + ((hsh >> 4) % 7 - 3) * 0.12);
            block(x, y);
            if (r.chance(0.35)) spawns.push({ kind: r.chance(0.3) ? 'caller' : 'user', x: cx, z: cz + TILE, room: rm.id });
          }
        }
        const t = wallSpot(rm);
        if (t !== null) addTerminal(t[0], t[1], rm, facingInto(t[0], t[1], rm));
        break;
      }
      case 'meeting': {
        for (let y = y0 + 2; y <= y1 - 2; y++) {
          for (let x = x0 + 2; x <= x1 - 2; x++) block(x, y);
        }
        if (x1 - 2 >= x0 + 2 && y1 - 2 >= y0 + 2) {
          const tw = (x1 - x0 - 3) * TILE - 0.2;
          const td = (y1 - y0 - 3) * TILE - 0.2;
          const tx = (cellCenter(x0 + 2) + cellCenter(x1 - 2)) / 2;
          const tz = (cellCenter(y0 + 2) + cellCenter(y1 - 2)) / 2;
          addGeom(builder, 'wood', placed(new RoundedBoxGeometry(tw, 0.08, td, 3, 0.04), tx, 0.76, tz));
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) addGeom(builder, 'metal', placed(new THREE.CylinderGeometry(0.04, 0.05, 0.72, 8), tx + sx * (tw / 2 - 0.3), 0.36, tz + sz * (td / 2 - 0.3)));
          flatMonitor(builder, tx, 0.8, tz - td / 2 + 0.3, 0, 0.5);
        }
        for (let x = x0 + 2; x <= x1 - 2; x += 1) {
          officeChair(builder, cellCenter(x), cellCenter(y0 + 1) + 0.3, 0);
        }
        spawns.push({ kind: 'manager', x: cellCenter(x0 + 1), z: cellCenter(y0 + 1), room: rm.id });
        for (let i = 0; i < 2; i++) {
          const s = interiorSpot(rm);
          if (s !== null) spawns.push({ kind: 'user', x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
        }
        break;
      }
      case 'kitchen': {
        for (let x = x0; x <= x1; x++) {
          if (!free(x, y0) || nearDoor(x, y0, rm)) continue;
          addBox(builder, 'counter', cellCenter(x), 0.5, cellCenter(y0), TILE, 1.0, TILE * 0.9);
          block(x, y0);
        }
        const c1 = wallSpot(rm);
        if (c1 !== null) {
          const m = coolerMesh();
          m.position.set(cellCenter(c1[0]), 0, cellCenter(c1[1]));
          group.add(m);
          block(c1[0], c1[1]);
          addInteract('cooler', c1[0], c1[1], rm.id, m);
        }
        const c2 = wallSpot(rm);
        if (c2 !== null) {
          const m = coffeeMesh();
          m.position.set(cellCenter(c2[0]), 0, cellCenter(c2[1]));
          group.add(m);
          block(c2[0], c2[1]);
          addInteract('coffee', c2[0], c2[1], rm.id, m);
        }
        const c3 = wallSpot(rm);
        if (c3 !== null) {
          const m = vendingMesh();
          m.position.set(cellCenter(c3[0]), 0, cellCenter(c3[1]));
          m.rotation.y = facingInto(c3[0], c3[1], rm);
          group.add(m);
          block(c3[0], c3[1], true);
          addInteract('vending', c3[0], c3[1], rm.id, m);
        }
        const c4 = wallSpot(rm);
        if (c4 !== null) {
          const m = fridgeMesh();
          m.position.set(cellCenter(c4[0]), 0, cellCenter(c4[1]));
          m.rotation.y = facingInto(c4[0], c4[1], rm);
          group.add(m);
          block(c4[0], c4[1], true);
          addInteract('fridge', c4[0], c4[1], rm.id, m);
        }
        const c5 = wallSpot(rm);
        if (c5 !== null) {
          const m = panttiMesh();
          m.position.set(cellCenter(c5[0]), 0, cellCenter(c5[1]));
          m.rotation.y = facingInto(c5[0], c5[1], rm);
          group.add(m);
          block(c5[0], c5[1]);
          addInteract('pantti', c5[0], c5[1], rm.id, m);
        }
        const s = interiorSpot(rm);
        if (s !== null) spawns.push({ kind: 'healer', x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
        break;
      }
      case 'sauna': {
        // Lauteet (benches) along the far wall, the kiuas by the door.
        for (let x = x0; x <= x1; x++) {
          if (!free(x, y1) || nearDoor(x, y1, rm)) continue;
          addBox(builder, 'bench', cellCenter(x), 0.45, cellCenter(y1), TILE, 0.9, TILE * 0.95);
          addBox(builder, 'bench', cellCenter(x), 1.0, cellCenter(y1) + 0.45, TILE, 0.12, TILE * 0.5);
          block(x, y1);
        }
        const k = wallSpot(rm);
        if (k !== null) {
          const m = kiuasMesh();
          m.position.set(cellCenter(k[0]), 0, cellCenter(k[1]));
          group.add(m);
          block(k[0], k[1]);
          addInteract('kiuas', k[0], k[1], rm.id, m);
        }
        const wood = paint(() => woodTexture());
        wood?.repeat.set(rm.w, rm.h);
        const planks = new THREE.Mesh(new THREE.PlaneGeometry(rm.w * TILE, rm.h * TILE), new THREE.MeshLambertMaterial({ map: wood, color: 0xd9a86c }));
        planks.rotation.x = -Math.PI / 2;
        planks.position.set(x0 * TILE + (rm.w * TILE) / 2, 0.01, y0 * TILE + (rm.h * TILE) / 2);
        planks.userData.suo = 'hide';
        group.add(planks);
        const t = interiorSpot(rm);
        if (t !== null) spawns.push({ kind: 'tonttu', x: cellCenter(t[0]), z: cellCenter(t[1]), room: rm.id });
        break;
      }
      case 'server': {
        for (let x = x0 + 1; x < x1; x += 2) {
          for (let y = y0 + 1; y < y1; y++) {
            if (!free(x, y) || nearDoor(x, y, rm)) continue;
            addBox(builder, 'rack', cellCenter(x), 1.2, cellCenter(y), TILE * 0.8, 2.4, TILE * 0.9);
            block(x, y, true);
          }
        }
        const s = interiorSpot(rm);
        if (s !== null) {
          const m = crateMesh();
          m.position.set(cellCenter(s[0]), 0, cellCenter(s[1]));
          group.add(m);
          block(s[0], s[1]);
          addInteract('crate', s[0], s[1], rm.id, m);
        }
        const t = wallSpot(rm);
        if (t !== null) addTerminal(t[0], t[1], rm, facingInto(t[0], t[1], rm));
        const a = interiorSpot(rm);
        if (a !== null) spawns.push({ kind: 'helper', x: cellCenter(a[0]), z: cellCenter(a[1]), room: rm.id });
        break;
      }
      case 'it': {
        // The Internal IT counter: a long desk with a hatch.
        const yCounter = y0 + 1;
        for (let x = x0 + 1; x < x1; x++) {
          if (nearDoor(x, yCounter, rm)) continue;
          addBox(builder, 'counter', cellCenter(x), 0.55, cellCenter(yCounter), TILE, 1.1, TILE * 0.7);
          block(x, yCounter);
        }
        const deskX = Math.floor(rm.x + rm.w / 2);
        const sign = itSignMesh();
        sign.position.set(cellCenter(deskX), 2.5, cellCenter(yCounter) - 0.2);
        group.add(sign);
        addInteract('itdesk', deskX, yCounter, rm.id, sign);
        const t = wallSpot(rm);
        if (t !== null && t[1] !== yCounter) addTerminal(t[0], t[1], rm, facingInto(t[0], t[1], rm));
        break;
      }
      case 'print': {
        const p = interiorSpot(rm);
        if (p !== null) {
          const m = printerMesh();
          m.position.set(cellCenter(p[0]), 0, cellCenter(p[1]));
          group.add(m);
          block(p[0], p[1]);
          addInteract('printer', p[0], p[1], rm.id, m);
          spawns.push({ kind: 'jam', x: cellCenter(p[0]) + 1.5, z: cellCenter(p[1]), room: rm.id });
        }
        const t = wallSpot(rm);
        if (t !== null) addTerminal(t[0], t[1], rm, facingInto(t[0], t[1], rm));
        for (let i = 0; i < 2; i++) {
          const s = interiorSpot(rm);
          if (s !== null) spawns.push({ kind: 'user', x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
        }
        break;
      }
      case 'office': {
        const s = interiorSpot(rm);
        if (s !== null) {
          addBox(builder, 'wood', cellCenter(s[0]), 0.76, cellCenter(s[1]), TILE, 0.1, TILE * 0.8);
          block(s[0], s[1]);
        }
        spawns.push({ kind: 'manager', x: cellCenter(x0 + 1), z: cellCenter(y1 - 1), room: rm.id });
        spawns.push({ kind: 'customer', x: cellCenter(x1 - 1), z: cellCenter(y1 - 1), room: rm.id });
        break;
      }
      case 'lobby': {
        const t = wallSpot(rm);
        if (t !== null) addTerminal(t[0], t[1], rm, facingInto(t[0], t[1], rm));
        for (let i = 0; i < 3; i++) {
          const s = interiorSpot(rm);
          if (s !== null && r.chance(0.5)) {
            pottedPlant(builder, cellCenter(s[0]), cellCenter(s[1]), cellHash(s[0], s[1]) % 97, 1.2);
            block(s[0], s[1]);
          }
        }
        break;
      }
      case 'boss':
        for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]] as const) {
          addGeom(builder, 'pillar', placed(new THREE.CylinderGeometry(TILE * 0.26, TILE * 0.26, WALL_H - 0.5, 20), cellCenter(x), WALL_H / 2, cellCenter(y)));
          addGeom(builder, 'pillar', placed(new RoundedBoxGeometry(TILE * 0.66, 0.25, TILE * 0.66, 2, 0.04), cellCenter(x), 0.125, cellCenter(y)));
          addGeom(builder, 'pillar', placed(new RoundedBoxGeometry(TILE * 0.66, 0.25, TILE * 0.66, 2, 0.04), cellCenter(x), WALL_H - 0.125, cellCenter(y)));
          block(x, y, true);
        }
        for (let i = 0; i < 2; i++) {
          const s = interiorSpot(rm);
          if (s !== null) spawns.push({ kind: 'reply', x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
        }
        break;
    }

    // Supply closets: locked, full of things you should not take.
    if ((rm.kind === 'office' || rm.kind === 'server' || rm.kind === 'meeting' || rm.kind === 'cubicles' || rm.kind === 'print') && r.chance(0.45)) {
      const l = wallSpot(rm);
      if (l !== null) {
        const m = lockerMesh();
        m.position.set(cellCenter(l[0]), 0, cellCenter(l[1]));
        m.rotation.y = facingInto(l[0], l[1], rm);
        group.add(m);
        block(l[0], l[1], true);
        addInteract('locker', l[0], l[1], rm.id, m);
        const it = interactables[interactables.length - 1];
        if (it !== undefined) it.lock = Math.min(95, 15 + floorIndex * 12 + r.int(0, 25));
      }
    }
    if (rm === npcRoom) {
      const s = interiorSpot(rm);
      if (s !== null) spawns.push({ kind: 'npc', x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
    }

    // Everyone else: users in whatever room, scaled with the floor.
    if (rm.kind !== 'lobby' && rm.kind !== 'boss' && rm.kind !== 'it' && rm.kind !== 'sauna') {
      // Crowds stop growing after the second floor; the people in them keep getting tougher.
      const extra = r.int(0, 1 + Math.min(floorIndex, 2));
      for (let i = 0; i < extra; i++) {
        const s = interiorSpot(rm);
        if (s === null) continue;
        spawns.push({ kind: rollHostile(r, floorIndex), x: cellCenter(s[0]), z: cellCenter(s[1]), room: rm.id });
      }
    }
  }

  // Elevators: arrival in the lobby, exit in the boss room. The doors go on a
  // stretch of wall with no corridor opening next to it.
  const lobby = rooms[0] as Room;
  const start = { x: cellCenter(Math.floor(lobby.x + lobby.w / 2)), z: cellCenter(Math.floor(lobby.y + lobby.h / 2)) };
  const bossRoom = rooms[bossIdx] as Room;
  const bossSpawn = { x: cellCenter(Math.floor(bossRoom.x + bossRoom.w / 2)), z: cellCenter(Math.floor(bossRoom.y + bossRoom.h / 2)) };
  const liftSpot = (rm: Room, first: 'top' | 'bottom'): { x: number; y: number; px: number; pz: number; rot: number } => {
    const sides = first === 'bottom' ? ['bottom', 'top', 'left', 'right'] as const : ['top', 'bottom', 'left', 'right'] as const;
    const mid = (a: number, n: number): number[] => {
      const out: number[] = [];
      const c = Math.floor(a + n / 2);
      for (let k = 0; k < n; k++) {
        const v = c + (k % 2 === 0 ? k / 2 : -(k + 1) / 2);
        if (v > a && v < a + n - 1) out.push(v);
      }
      return out;
    };
    for (const side of sides) {
      const cells: [number, number][] = side === 'top' || side === 'bottom'
        ? mid(rm.x, rm.w).map((x) => [x, side === 'top' ? rm.y : rm.y + rm.h - 1])
        : mid(rm.y, rm.h).map((y) => [side === 'left' ? rm.x : rm.x + rm.w - 1, y]);
      for (const [x, y] of cells) {
        if (!free(x, y) || nearDoor(x, y, rm)) continue;
        const cx = cellCenter(x);
        const cz = cellCenter(y);
        switch (side) {
          case 'top': return { x, y, px: cx, pz: cz - TILE / 2 + 0.15, rot: 0 };
          case 'bottom': return { x, y, px: cx, pz: cz + TILE / 2 - 0.15, rot: Math.PI };
          case 'left': return { x, y, px: cx - TILE / 2 + 0.15, pz: cz, rot: Math.PI / 2 };
          default: return { x, y, px: cx + TILE / 2 - 0.15, pz: cz, rot: -Math.PI / 2 };
        }
      }
    }
    const x = Math.floor(rm.x + rm.w / 2);
    const y = rm.y + rm.h - 1;
    return { x, y, px: cellCenter(x), pz: cellCenter(y) + TILE / 2 - 0.15, rot: Math.PI };
  };
  {
    const exit = liftSpot(bossRoom, 'bottom');
    const doors = elevatorMesh();
    doors.position.set(exit.px, 0, exit.pz);
    doors.rotation.y = exit.rot;
    group.add(doors);
    addInteract('elevator', exit.x, exit.y, bossRoom.id, doors);
    const arrival = liftSpot(lobby, 'top');
    const arrive = elevatorMesh();
    arrive.position.set(arrival.px, 0, arrival.pz);
    arrive.rotation.y = arrival.rot;
    group.add(arrive);
  }

  repairFloorAccess({ w, h, floor, solid, opaque, rooms, spawns, interactables, start }, r, builder);

  // ---- Static geometry ----
  // `userData.suo` says what each surface becomes when the steam takes you
  // under (see suodress.ts); `suoRepeat` gives a plane its tiles per side.
  const std = (params: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial => new THREE.MeshStandardMaterial(params);
  const wallTex = paint(() => wallTexture(theme));
  const wallMat = std({ map: wallTex, normalMap: paint(() => normalMapFrom(wallTex, 1.2)), roughness: 0.92, metalness: 0 });
  const wallGeoms: THREE.BufferGeometry[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (floor[y * w + x] === 1) continue;
      let touches = false;
      for (const [ox, oy] of NEIGHBOURS8) {
        const nx = x + ox;
        const ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h && floor[ny * w + nx] === 1) touches = true;
      }
      if (!touches) continue;
      const g = new THREE.BoxGeometry(TILE, WALL_H, TILE);
      g.translate(cellCenter(x), WALL_H / 2, cellCenter(y));
      wallGeoms.push(g);
    }
  }
  if (wallGeoms.length > 0) {
    const walls = new THREE.Mesh(mergeGeometries(wallGeoms), wallMat);
    walls.receiveShadow = true;
    walls.castShadow = true;
    walls.userData.suo = 'wall';
    group.add(walls);
  }

  const carpet = paint(() => carpetTexture(theme, seed));
  carpet?.repeat.set(w, h);
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), std({ map: carpet, normalMap: paint(() => normalMapFrom(carpet, 2.5)), roughness: 1, metalness: 0 }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  floorMesh.receiveShadow = true;
  floorMesh.userData.suo = 'floor';
  floorMesh.userData.suoRepeat = [w, h];
  group.add(floorMesh);
  const ceil = paint(() => ceilingTexture(theme));
  ceil?.repeat.set(w, h);
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), std({ map: ceil, normalMap: paint(() => normalMapFrom(ceil, 1.5, true)), roughness: 0.95 }));
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set((w * TILE) / 2, WALL_H, (h * TILE) / 2);
  ceilMesh.userData.suo = 'ceiling';
  ceilMesh.userData.suoRepeat = [w, h];
  group.add(ceilMesh);

  // Rooms that are not carpeted: a floor of their own, laid over the carpet.
  const roomFloor = (rm: Room, mat: THREE.Material): void => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(rm.w * TILE, rm.h * TILE), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(rm.x * TILE + (rm.w * TILE) / 2, 0.008, rm.y * TILE + (rm.h * TILE) / 2);
    m.receiveShadow = true;
    // Under the steam there is one floor, the bog's.
    m.userData.suo = 'hide';
    group.add(m);
  };
  const floorMat = (tex: THREE.CanvasTexture | null, rm: Room, per: number, roughness: number, metalness = 0, bump = 1.5): THREE.MeshStandardMaterial => {
    tex?.repeat.set(rm.w / per, rm.h / per);
    return std({ map: tex, normalMap: paint(() => normalMapFrom(tex, bump, true)), roughness, metalness });
  };
  for (const rm of rooms) {
    switch (rm.kind) {
      case 'lobby': roomFloor(rm, floorMat(paint(() => tileTexture('#d8d4cc', '#c4bfb4', 'rgba(60,55,50,0.6)', 4, seed + 1)), rm, 2, 0.28, 0.05)); break;
      case 'kitchen': roomFloor(rm, floorMat(paint(() => tileTexture('#e8e4da', '#3a3a3a', 'rgba(0,0,0,0.35)', 8, seed + 2)), rm, 2, 0.55)); break;
      case 'server': roomFloor(rm, floorMat(paint(() => tileTexture('#9aa0a6', '#8f959b', 'rgba(20,20,20,0.8)', 2, seed + 3, false)), rm, 1, 0.45, 0.6, 3)); break;
      case 'it': roomFloor(rm, floorMat(paint(() => tileTexture('#cfd6c8', '#c0c8b8', 'rgba(0,0,0,0.25)', 4, seed + 4)), rm, 2, 0.6)); break;
      case 'meeting':
      case 'office': roomFloor(rm, floorMat(paint(() => parquetTexture()), rm, 2, 0.5, 0, 1)); break;
      case 'boss': roomFloor(rm, floorMat(paint(() => carpetTexture({ ...theme, carpet: '#5a1418', carpetFleck: '#3e0d10' }, seed + 5)), rm, 1, 1, 0, 2.5)); break;
      default: break;
    }
  }

  // Architecture: skirting along every wall, a lintel over every opening into
  // a room, vents in the ceiling.
  const trim: THREE.BufferGeometry[] = [];
  const lintels: THREE.BufferGeometry[] = [];
  const vents: THREE.BufferGeometry[] = [];
  const jambs: THREE.BufferGeometry[] = [];
  for (let y = 1; y < (decor ? h - 1 : 1); y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (floor[i] !== 1) continue;
      for (const [ox, oy] of NEIGHBOURS4) {
        const n = (y + oy) * w + (x + ox);
        if (floor[n] !== 1) {
          // Skirting, a cornice where wall meets ceiling, and a dado rail in the rooms: one piece per wall edge.
          const inRoom = (roomOf[i] ?? -1) >= 0;
          const g = template(`trim|${ox}|${oy}|${inRoom}`, () => {
            const parts = [
              new THREE.BoxGeometry(ox !== 0 ? 0.06 : TILE, 0.14, oy !== 0 ? 0.06 : TILE).translate(ox * (TILE / 2 - 0.03), 0.07, oy * (TILE / 2 - 0.03)),
              new THREE.BoxGeometry(ox !== 0 ? 0.09 : TILE, 0.1, oy !== 0 ? 0.09 : TILE).translate(ox * (TILE / 2 - 0.045), WALL_H - 0.05, oy * (TILE / 2 - 0.045)),
            ];
            if (inRoom) parts.push(new THREE.BoxGeometry(ox !== 0 ? 0.035 : TILE, 0.05, oy !== 0 ? 0.035 : TILE).translate(ox * (TILE / 2 - 0.018), 1.02, oy * (TILE / 2 - 0.018)));
            const merged = mergeGeometries(parts);
            for (const p of parts) p.dispose();
            return merged;
          });
          g.translate(cellCenter(x), 0, cellCenter(y));
          trim.push(g);
        } else if ((roomOf[i] ?? -1) < 0 && (roomOf[n] ?? -1) >= 0) {
          // Corridor into a room: a lintel on the boundary, and a door frame.
          const g = new THREE.BoxGeometry(ox !== 0 ? 0.25 : TILE, 0.45, oy !== 0 ? 0.25 : TILE);
          g.translate(cellCenter(x) + ox * TILE / 2, WALL_H - 0.225, cellCenter(y) + oy * TILE / 2);
          lintels.push(g);
          const bx = cellCenter(x) + ox * TILE / 2;
          const bz = cellCenter(y) + oy * TILE / 2;
          const head = template(`jamb-head|${ox !== 0}`, () => new RoundedBoxGeometry(ox !== 0 ? 0.3 : TILE, 0.12, oy !== 0 ? 0.3 : TILE, 1, 0.03));
          head.translate(bx, WALL_H - 0.51, bz);
          jambs.push(head);
          // Posts where the opening meets the wall on either side.
          for (const side of [-1, 1]) {
            const px = oy !== 0 ? side : 0;
            const pz = ox !== 0 ? side : 0;
            const a = (y + pz) * w + (x + px);
            const bcell = (y + oy + pz) * w + (x + ox + px);
            if (floor[a] === 1 && floor[bcell] === 1) continue;
            const post = template(`jamb-post|${ox !== 0}`, () => new RoundedBoxGeometry(ox !== 0 ? 0.3 : 0.14, WALL_H - 0.45, oy !== 0 ? 0.3 : 0.14, 1, 0.03));
            post.translate(bx + px * (TILE / 2 - 0.07), (WALL_H - 0.45) / 2, bz + pz * (TILE / 2 - 0.07));
            jambs.push(post);
          }
        }
      }
      if ((roomOf[i] ?? -1) >= 0 && x % 4 === 3 && y % 5 === 2) {
        const g = new THREE.BoxGeometry(0.7, 0.03, 0.7);
        g.translate(cellCenter(x), WALL_H - 0.015, cellCenter(y));
        vents.push(g);
      }
    }
  }
  const trimMat = std({ color: new THREE.Color(theme.wallTrim), roughness: 0.6 });
  if (trim.length > 0) {
    const t = new THREE.Mesh(mergeGeometries(trim), trimMat);
    t.userData.suo = 'timber';
    group.add(t);
  }
  if (jambs.length > 0) {
    const j = new THREE.Mesh(mergeGeometries(jambs), std({ color: new THREE.Color(theme.wallTrim).multiplyScalar(0.85), roughness: 0.45 }));
    j.castShadow = true;
    j.receiveShadow = true;
    j.userData.suo = 'timber';
    group.add(j);
  }
  if (lintels.length > 0) {
    const l = new THREE.Mesh(mergeGeometries(lintels), wallMat);
    l.castShadow = true;
    l.userData.suo = 'wall';
    group.add(l);
  }
  if (vents.length > 0) group.add(new THREE.Mesh(mergeGeometries(vents), std({ color: 0x3a3d42, roughness: 0.4, metalness: 0.7 })));

  // Fluorescent panels in every room and every few corridor cells.
  const panelGeoms: THREE.BufferGeometry[] = [];
  const frameGeoms: THREE.BufferGeometry[] = [];
  for (let y = 0; y < (decor ? h : 0); y++) {
    for (let x = 0; x < w; x++) {
      if (floor[y * w + x] !== 1) continue;
      const inRoom = (roomOf[y * w + x] ?? -1) >= 0;
      if ((inRoom && x % 3 === 1 && y % 3 === 1) || (!inRoom && (x + y) % 5 === 0)) {
        const g = new THREE.BoxGeometry(1.2, 0.04, 0.6);
        g.translate(cellCenter(x), WALL_H - 0.03, cellCenter(y));
        panelGeoms.push(g);
        const f = new THREE.BoxGeometry(1.32, 0.05, 0.72);
        f.translate(cellCenter(x), WALL_H - 0.015, cellCenter(y));
        frameGeoms.push(f);
      }
    }
  }
  if (panelGeoms.length > 0) {
    const tube = new THREE.Color(theme.light).multiplyScalar(1.6);
    const panels = new THREE.Mesh(mergeGeometries(panelGeoms), new THREE.MeshBasicMaterial({ color: tube }));
    panels.userData.suo = 'lamp';
    group.add(panels);
    group.add(new THREE.Mesh(mergeGeometries(frameGeoms), std({ color: 0xb8b8b0, roughness: 0.5, metalness: 0.4 })));
  }

  // Server rooms blink. Three LED colours, three phases; the game animates them.
  const ledMats = [0x3cff6a, 0xffb020, 0x40a0ff].map((c) => new THREE.MeshBasicMaterial({ color: c }));
  const ledGeoms: THREE.BufferGeometry[][] = [[], [], []];
  for (const rm of rooms) {
    if (rm.kind !== 'server') continue;
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        const i = y * w + x;
        if (solid[i] !== 1 || opaque[i] !== 1 || floor[i] !== 1) continue;
        for (const side of [-1, 1]) {
          for (let k = 0; k < 7; k++) {
            const g = new THREE.BoxGeometry(0.03, 0.035, 0.05);
            g.translate(cellCenter(x) + side * (TILE * 0.4 + 0.01), 0.35 + k * 0.28 + r.range(0, 0.08), cellCenter(y) + r.range(-0.7, 0.7));
            (ledGeoms[r.int(0, 2)] as THREE.BufferGeometry[]).push(g);
          }
        }
      }
    }
  }
  ledGeoms.forEach((list, k) => {
    if (list.length > 0) group.add(new THREE.Mesh(mergeGeometries(list), ledMats[k]));
  });
  group.userData.leds = ledMats;

  // EXIT over the lift, and a fire extinguisher in some rooms (Health and Safety insists).
  const exitIt = interactables.find((i) => i.kind === 'elevator');
  if (exitIt?.mesh !== null && exitIt?.mesh !== undefined) {
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.34), new THREE.MeshBasicMaterial({ map: paint(() => signTexture('EXIT', '#e8ffe8', '#0a7a2a')), color: 0xffffff }));
    sign.position.set(0, 3.0, 0.12);
    sign.userData.suo = 'lamp';
    exitIt.mesh.add(sign);
  }
  const extMat = std({ color: 0xc0281e, roughness: 0.35, metalness: 0.2 });
  const extGeoms: THREE.BufferGeometry[] = [];
  for (const rm of rooms) {
    if (!r.chance(0.45) || rm.kind === 'sauna') continue;
    const spot = wallSpot(rm);
    if (spot === null) continue;
    const [ex, ey] = spot;
    const dx = ex === rm.x ? -1 : ex === rm.x + rm.w - 1 ? 1 : 0;
    const dz = ey === rm.y ? -1 : ey === rm.y + rm.h - 1 ? 1 : 0;
    const g = new THREE.CylinderGeometry(0.11, 0.11, 0.55, 10);
    g.translate(cellCenter(ex) + dx * (TILE / 2 - 0.15), 0.62, cellCenter(ey) + dz * (TILE / 2 - 0.15));
    extGeoms.push(g);
  }
  if (extGeoms.length > 0) group.add(new THREE.Mesh(mergeGeometries(extGeoms), extMat));

  const rackTex = paint(() => rackTexture());
  const mats: Record<string, THREE.Material> = {
    desk: std({ color: 0xc8b48a, roughness: 0.55 }),
    metal: std({ color: 0x6b6f75, roughness: 0.4, metalness: 0.7 }),
    partition: std({ color: 0x6f7c8f, roughness: 0.95 }),
    monitor: std({ color: 0x1d1f24, emissive: 0x0b2a5a, emissiveIntensity: 1.2, roughness: 0.3 }),
    chair: std({ color: 0x23262b, roughness: 0.7 }),
    wood: std({ color: 0x7a5232, map: paint(() => woodTexture()), roughness: 0.5 }),
    counter: std({ color: 0xe6e2d6, roughness: 0.35 }),
    rack: std({ map: rackTex, emissive: 0x111111, roughness: 0.5, metalness: 0.5 }),
    plant: std({ color: 0x8a5a36, roughness: 0.8 }),
    leaf: std({ color: 0x3f8a3a, roughness: 0.7 }),
    pillar: std({ color: 0x9c8f7a, roughness: 0.6 }),
    bench: std({ color: 0xc8955a, map: paint(() => woodTexture()), roughness: 0.7 }),
  };
  for (const [key, geoms] of builder.boxes) {
    if (geoms.length === 0) continue;
    const mat = mats[key] ?? std({ color: 0xff00ff });
    // Mixed shapes: weld them as plain triangle soup with the same attributes.
    const soup = geoms.map((g) => {
      const n = g.index !== null ? g.toNonIndexed() : g;
      for (const name of Object.keys(n.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
      return n;
    });
    const m = new THREE.Mesh(mergeGeometries(soup), mat);
    for (const g of soup) if (!geoms.includes(g)) g.dispose();
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    for (const g of geoms) g.dispose();
  }
  for (const list of [wallGeoms, panelGeoms, frameGeoms, trim, lintels, vents, jambs, extGeoms, ...ledGeoms]) for (const g of list) g.dispose();
  // Interactive props cast shadows too.
  for (const it of interactables) it.mesh?.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = true; });

  return {
    w, h, floor, solid, opaque, roomOf, rooms, interactables, spawns, start, bossSpawn,
    lightSpots, group, seen: new Uint8Array(w * h),
  };
}

// ---- Interactive prop meshes ----

function lambert(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.55, metalness: 0.1 });
}

function metal(color: number, roughness = 0.35): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.75 });
}

function box(sx: number, sy: number, sz: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(softBox(sx, sy, sz, 0.18), mat);
  m.position.set(x, y, z);
  return m;
}

function cyl(rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 16): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  return m;
}

function coolerMesh(): THREE.Group {
  const g = new THREE.Group();
  const white = lambert(0xeeeeee);
  g.add(box(0.55, 1.0, 0.55, white, 0, 0.5, 0));
  g.add(box(0.5, 0.04, 0.3, metal(0x9a9a9a), 0, 0.72, 0.16));
  for (const [x, c] of [[-0.1, 0x3a7bd5], [0.1, 0xd53a3a]] as const) g.add(box(0.06, 0.08, 0.06, lambert(c), x, 0.86, 0.3));
  const water = new THREE.MeshStandardMaterial({ color: 0x7fc4ff, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0 });
  const bottle = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 6, 16), water);
  bottle.position.y = 1.36;
  g.add(bottle);
  g.add(cyl(0.07, 0.07, 0.12, water, 0, 1.03, 0));
  g.add(cyl(0.05, 0.035, 0.1, lambert(0xffffff), 0.2, 0.2, 0.3, 10));
  return g;
}

function coffeeMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.4, 0.9, 1.2, lambert(0xe6e2d6), 0, 0.45, 0));
  const body = metal(0x2b2b2b, 0.4);
  g.add(box(0.62, 0.78, 0.5, body, 0, 1.3, -0.05));
  g.add(box(0.5, 0.1, 0.3, metal(0x9a9a9a), 0, 0.95, 0.12));
  g.add(box(0.42, 0.16, 0.02, new THREE.MeshBasicMaterial({ color: 0x9fe8ff }), 0, 1.5, 0.21));
  g.add(box(0.2, 0.1, 0.08, lambert(0xff3b30, 0x661111), 0.15, 1.32, 0.22));
  g.add(cyl(0.04, 0.04, 0.12, metal(0x777777), 0, 1.08, 0.18, 10));
  g.add(cyl(0.055, 0.045, 0.1, lambert(0xffffff), 0, 0.96, 0.18, 12));
  for (let k = 0; k < 3; k++) g.add(cyl(0.05, 0.042, 0.1, lambert([0xc0392b, 0x2e86c1, 0xf1c40f][k] ?? 0xffffff), -0.5 + k * 0.14, 0.95, 0.35, 12));
  return g;
}

function vendingMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.2, 2.2, 0.9, lambert(0xb3202a), 0, 1.1, 0));
  g.add(box(0.82, 1.4, 0.03, new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, roughness: 0.05 }), -0.1, 1.35, 0.46));
  const inside = lambert(0x1a1a1a);
  g.add(box(0.78, 1.36, 0.02, inside, -0.1, 1.35, 0.3));
  // Rows of cans behind the glass.
  const cans = [0x2ecc71, 0x1e90ff, 0xf1c40f, 0xffffff, 0xe74c3c, 0x9b59b6];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      g.add(cyl(0.05, 0.05, 0.18, lambert(cans[(row * 2 + col) % cans.length] ?? 0xffffff), -0.42 + col * 0.16, 0.8 + row * 0.33, 0.38, 10));
    }
  }
  g.add(box(0.2, 0.5, 0.04, metal(0x333333), 0.46, 1.4, 0.46));
  g.add(box(0.6, 0.18, 0.05, lambert(0x111111), -0.1, 0.35, 0.46));
  return g;
}

function printerMesh(): THREE.Group {
  const g = new THREE.Group();
  const shell = lambert(0xd9d6cc);
  g.add(box(1.2, 0.8, 0.95, shell, 0, 0.4, 0));
  g.add(box(1.1, 0.25, 0.85, lambert(0xcac6ba), 0, 0.93, 0));
  for (let k = 0; k < 2; k++) g.add(box(1.0, 0.02, 0.02, lambert(0x8a8577), 0, 0.2 + k * 0.28, 0.48));
  g.add(box(0.7, 0.03, 0.5, lambert(0xf8f8f8), 0, 1.08, 0.05));
  g.add(box(0.36, 0.12, 0.2, lambert(0x333333), 0.35, 1.1, 0.35));
  g.add(box(0.18, 0.07, 0.02, lambert(0xff9500, 0xaa4400), 0.35, 1.13, 0.46));
  return g;
}

function crateMesh(): THREE.Group {
  const g = new THREE.Group();
  const wood = lambert(0x8a6a3f);
  g.add(box(1.0, 0.7, 0.8, wood, 0, 0.35, 0));
  const slat = lambert(0x5f4a2c);
  for (const y of [0.12, 0.58]) g.add(box(1.03, 0.08, 0.83, slat, 0, y, 0));
  g.add(box(0.5, 0.04, 0.3, lambert(0xe8e0c8), 0.1, 0.72, 0.1));
  return g;
}

function itSignMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = paint(() => screenTexture(['INTERNAL IT', 'SERVICE DESK', '', 'Take a number.', 'Now serving: 4'], '#12351c'));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  g.add(m);
  g.add(box(2.55, 1.35, 0.06, metal(0x2b2b2b), 0, 0, -0.04));
  return g;
}

function elevatorMesh(): THREE.Group {
  const g = new THREE.Group();
  const frame = metal(0x7d858c, 0.3);
  g.add(box(2.3, 2.9, 0.16, frame, 0, 1.45, -0.02));
  const door = metal(0xb9c1c7, 0.22);
  for (const side of [-1, 1]) g.add(box(0.96, 2.5, 0.06, door, side * 0.49, 1.25, 0.08));
  g.add(box(0.02, 2.5, 0.08, lambert(0x333333), 0, 1.25, 0.1));
  const panel = box(0.12, 0.3, 0.04, metal(0x444444), 1.3, 1.25, 0.06);
  g.add(panel);
  g.add(cyl(0.025, 0.025, 0.02, lambert(0xffffff, 0x777777), 1.3, 1.3, 0.09, 10).rotateX(Math.PI / 2));
  const lamp = box(0.3, 0.12, 0.04, new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 2.78, 0.1);
  lamp.name = 'lamp';
  g.add(lamp);
  return g;
}

function fridgeMesh(): THREE.Group {
  const g = new THREE.Group();
  const white = lambert(0xe8e8e8);
  g.add(box(1.0, 2.0, 0.85, white, 0, 1.0, 0));
  g.add(box(0.96, 0.02, 0.02, lambert(0xbbbbbb), 0, 1.3, 0.43));
  for (const y of [1.0, 1.65]) g.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.35, 4, 8), metal(0x999999)).translateX(0.38).translateY(y).translateZ(0.46));
  // The note on the door, which is the whole story of every office fridge.
  g.add(box(0.3, 0.22, 0.01, lambert(0xfff27a), -0.2, 1.6, 0.43));
  for (const [x, y, c] of [[-0.3, 1.1, 0xe74c3c], [0.05, 1.8, 0x3498db], [-0.05, 0.9, 0x2ecc71]] as const) g.add(cyl(0.03, 0.03, 0.02, lambert(c), x, y, 0.44, 10).rotateX(Math.PI / 2));
  return g;
}

function panttiMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 1.8, 0.8, lambert(0x2e7d32), 0, 0.9, 0));
  g.add(cyl(0.16, 0.16, 0.06, lambert(0x111111), 0, 1.1, 0.4, 20).rotateX(Math.PI / 2));
  g.add(box(0.5, 0.2, 0.03, new THREE.MeshBasicMaterial({ color: 0x9dff9d }), 0, 1.5, 0.41));
  g.add(box(0.3, 0.06, 0.03, lambert(0xdddddd), 0, 0.7, 0.41));
  return g;
}

function kiuasMesh(): THREE.Group {
  const g = new THREE.Group();
  const iron = metal(0x2b2b2b, 0.6);
  g.add(box(0.85, 0.85, 0.85, iron, 0, 0.45, 0));
  g.add(box(0.95, 0.06, 0.95, iron, 0, 0.9, 0));
  const rock = new THREE.MeshStandardMaterial({ color: 0x6b6b6b, roughness: 0.95 });
  for (let i = 0; i < 12; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12 + (i % 3) * 0.02, 1), rock);
    m.position.set(-0.3 + (i % 4) * 0.2, 1.0 + Math.floor(i / 4) * 0.1, -0.25 + ((i * 7) % 3) * 0.25);
    m.rotation.set(i, i * 2, i * 3);
    g.add(m);
  }
  const glow = box(0.45, 0.18, 0.02, new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 0, 0.35, 0.44);
  g.add(glow);
  const light = new THREE.PointLight(0xff8a3a, 6, 7, 1.6);
  light.position.set(0, 1.4, 0);
  g.add(light);
  const wood = lambert(0x8a5a2a);
  g.add(cyl(0.16, 0.13, 0.25, wood, 0.7, 0.13, 0.3, 14));
  const ladle = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.45, 4, 6), wood);
  ladle.position.set(0.72, 0.4, 0.3);
  ladle.rotation.z = 0.5;
  g.add(ladle);
  return g;
}

function lockerMesh(): THREE.Group {
  const g = new THREE.Group();
  const steel = metal(0x5d6d7e, 0.45);
  g.add(box(1.4, 2.2, 0.8, steel, 0, 1.1, 0));
  g.add(box(0.02, 2.1, 0.82, lambert(0x2c3e50), 0, 1.1, 0));
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) g.add(box(0.4, 0.025, 0.02, lambert(0x34495e), side * 0.35, 1.9 - k * 0.06, 0.41));
  }
  g.add(box(0.12, 0.16, 0.06, lambert(0xd4af37, 0x332200), 0.14, 1.1, 0.42));
  g.add(box(0.5, 0.13, 0.01, lambert(0xffffff), -0.35, 1.6, 0.41));
  return g;
}
