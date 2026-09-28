import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Rng } from './rng';
import {
  woodTexture,
  carpetTexture,
  ceilingTexture,
  POSTERS,
  posterTexture,
  rackTexture,
  screenTexture,
  type Theme,
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

function addBox(
  b: Builder,
  key: string,
  x: number, y: number, z: number,
  sx: number, sy: number, sz: number,
  rotY = 0,
): void {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (rotY !== 0) g.rotateY(rotY);
  g.translate(x, y, z);
  const list = b.boxes.get(key);
  if (list === undefined) b.boxes.set(key, [g]);
  else list.push(g);
}

/**
 * Textures need a DOM canvas; the unit tests generate floors in node, where
 * only the grid and geometry matter.
 */
let headless = false;
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

export function generateLevel(floorIndex: number, theme: Theme, seed: number, noTextures = false): Level {
  headless = noTextures;
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
            addBox(builder, 'desk', cx, 0.74, cz, TILE, 0.06, 1.2);
            addBox(builder, 'partition', cx, 0.7, cz - 0.62, TILE, 1.4, 0.08);
            addBox(builder, 'monitor', cx + r.range(-0.4, 0.4), 1.0, cz - 0.25, 0.6, 0.45, 0.08);
            addBox(builder, 'chair', cx, 0.45, cz + 0.8, 0.5, 0.1, 0.5);
            addBox(builder, 'chair', cx, 0.8, cz + 1.05, 0.5, 0.7, 0.08);
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
          for (let x = x0 + 2; x <= x1 - 2; x++) {
            addBox(builder, 'wood', cellCenter(x), 0.76, cellCenter(y), TILE, 0.1, TILE);
            block(x, y);
          }
        }
        for (let x = x0 + 2; x <= x1 - 2; x += 1) {
          addBox(builder, 'chair', cellCenter(x), 0.5, cellCenter(y0 + 1) + 0.3, 0.5, 0.1, 0.5);
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
            addBox(builder, 'plant', cellCenter(s[0]), 0.3, cellCenter(s[1]), 0.5, 0.6, 0.5);
            addBox(builder, 'leaf', cellCenter(s[0]), 0.9, cellCenter(s[1]), 0.7, 0.6, 0.7, Math.PI / 4);
            addBox(builder, 'leaf', cellCenter(s[0]), 1.35, cellCenter(s[1]), 0.45, 0.5, 0.45);
            block(s[0], s[1]);
          }
        }
        break;
      }
      case 'boss':
        for (const [x, y] of [[x0 + 1, y0 + 1], [x1 - 1, y0 + 1], [x0 + 1, y1 - 1], [x1 - 1, y1 - 1]] as const) {
          addBox(builder, 'pillar', cellCenter(x), WALL_H / 2, cellCenter(y), TILE * 0.6, WALL_H, TILE * 0.6);
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
      const extra = r.int(0, 1 + Math.min(floorIndex, 3));
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

  // Safety pass: props must never seal off part of the floor. Flood from the
  // lobby. An empty pocket nobody needs is simply filled in. A pocket with
  // somebody in it gets a way in: squeeze past a desk if there is one, and
  // only if the one thing in the way is a machine (a fridge, a locker, a
  // terminal), move the people out instead of making the machine a ghost.
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
      spawns[k] = moved ?? { ...sp, x: start.x + TILE, z: start.z, room: 0 };
    }
    for (const i of pocket) solid[i] = 1;
  }

  // ---- Static geometry ----
  const wallMat = new THREE.MeshLambertMaterial({ map: paint(() => wallTexture(theme)) });
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
  if (wallGeoms.length > 0) group.add(new THREE.Mesh(mergeGeometries(wallGeoms), wallMat));

  const carpet = paint(() => carpetTexture(theme, seed));
  carpet?.repeat.set(w, h);
  const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), new THREE.MeshLambertMaterial({ map: carpet }));
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.set((w * TILE) / 2, 0, (h * TILE) / 2);
  group.add(floorMesh);
  const ceil = paint(() => ceilingTexture(theme));
  ceil?.repeat.set(w, h);
  const ceilMesh = new THREE.Mesh(new THREE.PlaneGeometry(w * TILE, h * TILE), new THREE.MeshLambertMaterial({ map: ceil }));
  ceilMesh.rotation.x = Math.PI / 2;
  ceilMesh.position.set((w * TILE) / 2, WALL_H, (h * TILE) / 2);
  group.add(ceilMesh);

  // Fluorescent panels in every room and every few corridor cells.
  const panelGeoms: THREE.BufferGeometry[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (floor[y * w + x] !== 1) continue;
      const inRoom = (roomOf[y * w + x] ?? -1) >= 0;
      if ((inRoom && x % 3 === 1 && y % 3 === 1) || (!inRoom && (x + y) % 5 === 0)) {
        const g = new THREE.BoxGeometry(1.2, 0.04, 0.6);
        g.translate(cellCenter(x), WALL_H - 0.02, cellCenter(y));
        panelGeoms.push(g);
      }
    }
  }
  if (panelGeoms.length > 0) {
    group.add(new THREE.Mesh(mergeGeometries(panelGeoms), new THREE.MeshBasicMaterial({ color: theme.light })));
  }

  const rackTex = paint(() => rackTexture());
  const mats: Record<string, THREE.Material> = {
    desk: new THREE.MeshLambertMaterial({ color: 0xc8b48a }),
    metal: new THREE.MeshLambertMaterial({ color: 0x6b6f75 }),
    partition: new THREE.MeshLambertMaterial({ color: 0x6f7c8f }),
    monitor: new THREE.MeshLambertMaterial({ color: 0x1d1f24, emissive: 0x0b2a5a }),
    chair: new THREE.MeshLambertMaterial({ color: 0x23262b }),
    wood: new THREE.MeshLambertMaterial({ color: 0x7a5232 }),
    counter: new THREE.MeshLambertMaterial({ color: 0xe6e2d6 }),
    rack: new THREE.MeshLambertMaterial({ map: rackTex, emissive: 0x111111 }),
    plant: new THREE.MeshLambertMaterial({ color: 0x8a5a36 }),
    leaf: new THREE.MeshLambertMaterial({ color: 0x3f8a3a }),
    pillar: new THREE.MeshLambertMaterial({ color: 0x9c8f7a }),
    bench: new THREE.MeshLambertMaterial({ color: 0xc8955a }),
  };
  for (const [key, geoms] of builder.boxes) {
    const mat = mats[key] ?? new THREE.MeshLambertMaterial({ color: 0xff00ff });
    group.add(new THREE.Mesh(mergeGeometries(geoms), mat));
    for (const g of geoms) g.dispose();
  }
  for (const g of wallGeoms) g.dispose();
  for (const g of panelGeoms) g.dispose();

  return {
    w, h, floor, solid, opaque, roomOf, rooms, interactables, spawns, start, bossSpawn,
    lightSpots, group, seen: new Uint8Array(w * h),
  };
}

// ---- Interactive prop meshes ----

function lambert(color: number, emissive = 0): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ color, emissive });
}

function box(sx: number, sy: number, sz: number, mat: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  return m;
}

function coolerMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.6, 1.0, 0.6, lambert(0xeeeeee), 0, 0.5, 0));
  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 12), new THREE.MeshLambertMaterial({ color: 0x5fb6ff, transparent: true, opacity: 0.7 }));
  bottle.position.y = 1.3;
  g.add(bottle);
  return g;
}

function coffeeMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.4, 0.9, 1.2, lambert(0xe6e2d6), 0, 0.45, 0));
  g.add(box(0.6, 0.8, 0.5, lambert(0x2b2b2b), 0, 1.3, 0));
  g.add(box(0.2, 0.1, 0.1, lambert(0xff3b30, 0x661111), 0.15, 1.5, 0.26));
  return g;
}

function vendingMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.2, 2.2, 0.9, lambert(0xb3202a), 0, 1.1, 0));
  g.add(box(0.8, 1.3, 0.05, new THREE.MeshBasicMaterial({ color: 0x8fd0ff }), -0.1, 1.3, 0.46));
  return g;
}

function printerMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.3, 1.0, 1.0, lambert(0xd9d6cc), 0, 0.5, 0));
  g.add(box(1.1, 0.2, 0.8, lambert(0xbab6aa), 0, 1.1, 0));
  g.add(box(0.2, 0.1, 0.05, lambert(0xff9500, 0xaa4400), 0.4, 0.85, 0.51));
  return g;
}

function crateMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 0.7, 0.8, lambert(0x8a6a3f), 0, 0.35, 0));
  g.add(box(1.02, 0.1, 0.82, lambert(0x5f4a2c), 0, 0.72, 0));
  return g;
}

function itSignMesh(): THREE.Group {
  const g = new THREE.Group();
  const tex = paint(() => screenTexture(['INTERNAL IT', 'SERVICE DESK', '', 'Take a number.', 'Now serving: 4'], '#12351c'));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ map: tex }));
  g.add(m);
  return g;
}

function elevatorMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(2.0, 2.6, 0.2, lambert(0x9ea6ad, 0x111111), 0, 1.3, 0));
  g.add(box(0.03, 2.5, 0.22, lambert(0x333333), 0, 1.3, 0));
  const lamp = box(0.2, 0.2, 0.05, new THREE.MeshBasicMaterial({ color: 0xff3030 }), 0, 2.85, 0.1);
  lamp.name = 'lamp';
  g.add(lamp);
  return g;
}

function fridgeMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.1, 2.0, 0.9, lambert(0xe8e8e8), 0, 1.0, 0));
  g.add(box(0.05, 0.5, 0.05, lambert(0x888888), 0.4, 1.3, 0.47));
  g.add(box(0.9, 0.02, 0.02, lambert(0x999999), 0, 1.25, 0.46));
  // The note on the door, which is the whole story of every office fridge.
  g.add(box(0.3, 0.22, 0.01, lambert(0xfff27a), -0.2, 1.6, 0.46));
  return g;
}

function panttiMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 1.8, 0.8, lambert(0x2e7d32), 0, 0.9, 0));
  g.add(box(0.3, 0.3, 0.05, new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 1.1, 0.41));
  g.add(box(0.5, 0.2, 0.05, new THREE.MeshBasicMaterial({ color: 0x9dff9d }), 0, 1.5, 0.41));
  return g;
}

function kiuasMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.9, 0.9, 0.9, lambert(0x2b2b2b), 0, 0.45, 0));
  const rock = lambert(0x6b6b6b);
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.16), rock);
    m.position.set(-0.25 + (i % 3) * 0.25, 1.0 + Math.floor(i / 3) * 0.12, -0.2 + (i % 2) * 0.3);
    g.add(m);
  }
  const glow = box(0.5, 0.2, 0.02, new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 0, 0.35, 0.46);
  g.add(glow);
  const light = new THREE.PointLight(0xff8a3a, 6, 7, 1.6);
  light.position.set(0, 1.4, 0);
  g.add(light);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.25, 10), lambert(0x8a5a2a));
  bucket.position.set(0.7, 0.13, 0.3);
  g.add(bucket);
  return g;
}

function lockerMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.4, 2.2, 0.8, lambert(0x5d6d7e), 0, 1.1, 0));
  g.add(box(0.02, 2.1, 0.82, lambert(0x2c3e50), 0, 1.1, 0));
  g.add(box(0.12, 0.16, 0.06, lambert(0xd4af37, 0x332200), 0.14, 1.1, 0.42));
  g.add(box(0.6, 0.15, 0.01, lambert(0xffffff), -0.3, 1.9, 0.41));
  return g;
}
