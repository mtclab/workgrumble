import type { Rng } from './rng';
import {
  COMPOSED,
  type ComposedId,
  type ComposedRecipe,
  type Door,
  layTemplate,
  type Piece,
  type PlacedFeature,
  type PlacedTemplate,
  type PlanRoom,
  type RecipePlan,
  type TemplateId,
} from './templates';

/**
 * Floors composed from templates (docs/SPEC_HELLDESK_030_S2.md, S2a): a
 * recipe's templates are laid (templates.ts), placed by rejection sampling
 * (the kitchen and the atrium of a hub near the middle, then the largest
 * first), and joined up by corridors two cells wide, routed between their
 * doors and never through a template: a spanning tree first, then every
 * door left over joined to the nearest corridor, then extra corridors until
 * the floor has the recipe's loops. A recipe with a spine gets it first: a
 * back corridor two cells wide from the lobby's service door to the
 * objective's, past a supply closet, that the corridors only cross where
 * they must. The result is a footprint like the spike's, carved and
 * furnished by `generateLevel` the way it always was.
 */

/** Cells of wall between two templates (room for a two-wide corridor and a spare). */
const GAP = 3;
/** Cells kept clear at the floor's edge. */
const MARGIN = 3;
/** What a turn costs a route, in cells: corridors run straight, with corners. */
const TURN = 4;
/** What a corridor pays to cross the spine, or to run beside it, per cell. */
const SPINE_COST = 40;
/** What a loop's corridor pays per cell to follow a corridor that is already there (so it makes a new way round). */
const REUSE_COST = 3;
/** What a corridor pays per cell to run right beside another (two side by side read as one wide blob). */
const BESIDE_COST = 1.5;
/** Room to start composing in, as a share of the templates' own area (with their gaps): it grows until they fit. */
const PACKING = 1;

/** Spots that fit, tried for each template before the most compact is kept. */
const CANDIDATES = 16;

/** Templates a hub keeps near its middle (spec 3.3: hub-first). */
const CENTRAL: ReadonlySet<TemplateId> = new Set(['T4', 'T6']);

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** A door of a placed template, in floor cells. */
interface FloorDoor extends Door {
  readonly piece: number;
}

/**
 * Compose a recipe's floor. The same dice give the same floor; throws only
 * if no floor composes at any size (the gates hold every recipe to 150 seeds).
 */
export function composeRecipe(id: ComposedId, r: Rng): RecipePlan {
  const recipe: ComposedRecipe = COMPOSED[id];
  const pieces = recipe.templates.filter((s) => s.chance === undefined || r.chance(s.chance)).map((s) => layTemplate(s.id, r));
  const area = pieces.reduce((sum, p) => sum + (p.w + GAP) * (p.h + GAP), 0);
  const widest = Math.max(...pieces.map((p) => Math.max(p.w, p.h)));
  let size = Math.max(widest + 2 * MARGIN, Math.ceil(Math.sqrt(area * PACKING)) + 2 * MARGIN);
  for (let attempt = 0; attempt < 60; attempt++) {
    const out = tryCompose(id, recipe, pieces, size, r);
    if (out !== null) return out;
    if (attempt % 3 === 2) size += 2;
  }
  throw new Error(`${id}: no floor would compose`);
}

function tryCompose(id: ComposedId, recipe: ComposedRecipe, pieces: readonly Piece[], size: number, r: Rng): RecipePlan | null {
  const W = size;
  const H = size;
  const hub = recipe.style === 'hub';

  // ---- Place: central templates first (a hub's), then the largest first.
  const order = pieces.map((_, k) => k).sort((a, b) => {
    const ca = hub && CENTRAL.has((pieces[a] as Piece).id) ? 1 : 0;
    const cb = hub && CENTRAL.has((pieces[b] as Piece).id) ? 1 : 0;
    const pa = pieces[a] as Piece;
    const pb = pieces[b] as Piece;
    return cb - ca || pb.w * pb.h - pa.w * pa.h || a - b;
  });
  const at: Rect[] = new Array<Rect>(pieces.length);
  const rects: Rect[] = [];
  for (const k of order) {
    const p = pieces[k] as Piece;
    const central = hub && CENTRAL.has(p.id);
    const lo = (span: number): number => (central ? Math.max(MARGIN, Math.floor(span / 4)) : MARGIN);
    const hi = (span: number, len: number): number => (central ? Math.min(span - MARGIN - len, Math.floor((span * 3) / 4) - len) : span - MARGIN - len);
    // Rejection sampling, keeping the most compact of the first few spots that fit (the floor packs tighter:
    // shorter walks). Most spots tried sit a gap away from a template already down, along one of its sides.
    let spot: Rect | null = null;
    let best = Infinity;
    let found = 0;
    for (let t = 0; t < 400 && found < CANDIDATES; t++) {
      let x: number;
      let y: number;
      if (rects.length > 0 && !central && r.chance(0.8)) {
        const o = r.pick(rects);
        const side = r.int(0, 3);
        x = side === 0 ? o.x - GAP - p.w : side === 1 ? o.x + o.w + GAP : r.int(o.x - p.w + 1, o.x + o.w - 1);
        y = side === 2 ? o.y - GAP - p.h : side === 3 ? o.y + o.h + GAP : r.int(o.y - p.h + 1, o.y + o.h - 1);
        if (x < MARGIN || y < MARGIN || x > W - MARGIN - p.w || y > H - MARGIN - p.h) continue;
      } else {
        const fall = central && t >= 200;
        const x0 = fall ? MARGIN : lo(W);
        const y0 = fall ? MARGIN : lo(H);
        const x1 = fall ? W - MARGIN - p.w : hi(W, p.w);
        const y1 = fall ? H - MARGIN - p.h : hi(H, p.h);
        if (x1 < x0 || y1 < y0) continue;
        x = r.int(x0, x1);
        y = r.int(y0, y1);
      }
      const clash = rects.some((o) => x < o.x + o.w + GAP && x + p.w + GAP > o.x && y < o.y + o.h + GAP && y + p.h + GAP > o.y);
      if (clash) continue;
      found++;
      const all = [...rects, { x, y, w: p.w, h: p.h }];
      const span = Math.max(...all.map((o) => o.x + o.w)) - Math.min(...all.map((o) => o.x)) + Math.max(...all.map((o) => o.y + o.h)) - Math.min(...all.map((o) => o.y));
      if (span < best) {
        best = span;
        spot = { x, y, w: p.w, h: p.h };
      }
    }
    if (spot === null) return null;
    at[k] = spot;
    rects.push(spot);
  }

  // ---- Stamp the templates, every edge door shut until a corridor reaches it.
  const grid: string[] = new Array<string>(W * H).fill('#');
  const owner = new Int16Array(W * H).fill(-1);
  const doors: FloorDoor[] = [];
  const service: FloorDoor[] = [];
  pieces.forEach((p, k) => {
    const o = at[k] as Rect;
    for (let y = 0; y < p.h; y++) {
      for (let x = 0; x < p.w; x++) {
        const i = (o.y + y) * W + o.x + x;
        const c = p.rows[y]?.[x] ?? '#';
        const edge = x === 0 || y === 0 || x === p.w - 1 || y === p.h - 1;
        grid[i] = edge ? '#' : c;
        owner[i] = k;
      }
    }
    for (const d of p.doors) doors.push({ ...d, x: o.x + d.x, y: o.y + d.y, piece: k });
    for (const d of p.service) service.push({ ...d, x: o.x + d.x, y: o.y + d.y, piece: k });
  });
  const cellOf = (d: Door): number => d.y * W + d.x;
  const porch = (d: Door): number => (d.y + d.dy) * W + d.x + d.dx;
  const border = (i: number): boolean => {
    const x = i % W;
    const y = (i - x) / W;
    return x < 1 || y < 1 || x > W - 2 || y > H - 2;
  };
  const open = new Set<number>();
  const paths: number[][] = [];

  const carve = (blocks: readonly number[], c: '.' | 's'): void => {
    for (const b of blocks) {
      for (const i of [b, b + 1, b + W, b + W + 1]) {
        // A corridor across the spine leaves the spine the spine.
        if (c === '.' && grid[i] === 's') continue;
        grid[i] = c;
      }
    }
  };
  const openDoor = (d: FloorDoor, c: 'D' | 'v'): void => {
    grid[cellOf(d)] = c;
    open.add(cellOf(d));
  };

  const entry = pieces.findIndex((p) => p.id === 'T7');
  if (entry < 0) throw new Error(`${id}: no lobby (T7)`);
  const objective = recipe.objective === null ? -1 : pieces.findIndex((p) => p.id === recipe.objective);
  if (recipe.objective !== null && objective < 0) throw new Error(`${id}: no ${recipe.objective} for the objective`);

  // ---- The spine: from the lobby's service door to the objective's, touching no other door.
  const closets: number[] = [];
  const spineDoors = new Set<number>();
  if (recipe.spine) {
    const from = service.filter((d) => d.piece === entry);
    const to = service.filter((d) => d.piece === objective);
    const pairs = from.flatMap((a) => to.map((b) => [a, b] as const))
      .sort(([a1, b1], [a2, b2]) => Math.abs(a1.x - b1.x) + Math.abs(a1.y - b1.y) - (Math.abs(a2.x - b2.x) + Math.abs(a2.y - b2.y)));
    let spine: number[] | null = null;
    for (const [a, b] of pairs) {
      const others = new Set([...doors, ...service].filter((d) => d !== a && d !== b).map(porch));
      const blocked = (i: number): boolean => owner[i] !== -1 || border(i) || others.has(i);
      spine = route(W, H, blocked, () => 0.25, porchBlocks(a, W), goalBlocks(b, W));
      if (spine !== null) {
        carve(spine, 's');
        openDoor(a, 'v');
        openDoor(b, 'v');
        spineDoors.add(cellOf(a));
        spineDoors.add(cellOf(b));
        break;
      }
    }
    if (spine === null) return null;
    paths.push(spine);
    // A supply closet in an alcove off the spine, as near its middle as there is wall for one.
    const porches = new Set([...doors, ...service].map(porch));
    const cells = spine.flatMap((b) => [b, b + 1, b + W, b + W + 1]);
    const mid = cells.length / 2;
    const spots: { cell: number; score: number }[] = [];
    cells.forEach((s, k) => {
      for (const n of [s - 1, s + 1, s - W, s + W]) {
        if (grid[n] !== '#' || owner[n] !== -1 || border(n) || porches.has(n)) continue;
        const walls = [n - 1, n + 1, n - W, n + W].filter((m) => m !== s);
        // Walled on its other three sides by plain wall, and touching only the spine.
        if (walls.some((m) => grid[m] !== '#' || border(m))) continue;
        if ([n - 1, n + 1, n - W, n + W].some((m) => grid[m] !== '#' && grid[m] !== 's')) continue;
        spots.push({ cell: n, score: Math.abs(k - mid) });
      }
    });
    spots.sort((a, b) => a.score - b.score || a.cell - b.cell);
    const near = spots.slice(0, Math.max(1, Math.ceil(spots.length / 3)));
    if (near.length === 0) return null;
    const closet = r.pick(near).cell;
    grid[closet] = 'c';
    closets.push(closet);
  }

  // ---- Corridors: what they may not touch, and what they pay.
  const nearSpine = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) {
    if (grid[i] !== 's' && grid[i] !== 'c' && !spineDoors.has(i)) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) nearSpine[ny * W + nx] = 1;
    }
  }
  const corridorBlocked = (i: number): boolean => owner[i] !== -1 || border(i) || grid[i] === 'c';
  const beside = (i: number): boolean => grid[i] !== '.' && (grid[i - 1] === '.' || grid[i + 1] === '.' || grid[i - W] === '.' || grid[i + W] === '.');
  const corridorCost = (reuse: number) => (i: number): number => (nearSpine[i] === 1 ? SPINE_COST : 0) + (grid[i] === '.' ? reuse : beside(i) ? BESIDE_COST : 0.25);
  const isCorridor = (i: number): boolean => grid[i] === '.' && owner[i] === -1;
  const join = (a: FloorDoor, b: FloorDoor, reuse: number): boolean => {
    const path = route(W, H, corridorBlocked, corridorCost(reuse), porchBlocks(a, W), goalBlocks(b, W));
    if (path === null) return false;
    carve(path, '.');
    openDoor(a, 'D');
    openDoor(b, 'D');
    paths.push(path);
    return true;
  };

  // A spanning tree from the lobby, by the nearest pair of doors.
  const linked = new Set<number>([entry]);
  while (linked.size < pieces.length) {
    const tries: { a: FloorDoor; b: FloorDoor; d: number }[] = [];
    for (const a of doors) {
      if (!linked.has(a.piece)) continue;
      for (const b of doors) {
        if (linked.has(b.piece)) continue;
        tries.push({ a, b, d: Math.abs(a.x - b.x) + Math.abs(a.y - b.y) });
      }
    }
    tries.sort((p, q) => p.d - q.d || cellOf(p.a) - cellOf(q.a) || cellOf(p.b) - cellOf(q.b));
    const done = tries.find((t) => join(t.a, t.b, 0));
    if (done === undefined) return null;
    linked.add(done.b.piece);
  }

  // Every door left over: to the nearest corridor (a door is never a dead end in a wall).
  for (const d of doors) {
    if (open.has(cellOf(d))) continue;
    if (isCorridor(porch(d))) {
      openDoor(d, 'D');
      continue;
    }
    const goal = (b: number): boolean => [b, b + 1, b + W, b + W + 1].some(isCorridor);
    const path = route(W, H, corridorBlocked, corridorCost(0), porchBlocks(d, W), goal);
    if (path === null) return null;
    carve(path, '.');
    openDoor(d, 'D');
    paths.push(path);
  }

  // Loops until the recipe's count is met: a gate, not a hope.
  const walk = (i: number): boolean => grid[i] !== '#' && grid[i] !== '=';
  for (let t = 0; t < 16 && loopCount(W, H, walk, rects) < recipe.loops; t++) {
    if (pieces.length < 2) break;
    const a = r.int(0, pieces.length - 1);
    const b = (a + r.int(1, pieces.length - 1)) % pieces.length;
    const da = doors.filter((d) => d.piece === a);
    const db = doors.filter((d) => d.piece === b);
    if (da.length === 0 || db.length === 0) continue;
    join(r.pick(da), r.pick(db), REUSE_COST);
  }
  if (loopCount(W, H, walk, rects) < recipe.loops) return null;

  // ---- What the floor's users need to find in it.
  const rooms: PlanRoom[] = [];
  const roomIds: number[][] = pieces.map(() => []);
  const addRooms = (k: number): void => {
    const p = pieces[k] as Piece;
    const o = at[k] as Rect;
    for (const rm of p.rooms) {
      (roomIds[k] as number[]).push(rooms.length);
      rooms.push({ ...rm, x: o.x + rm.x, y: o.y + rm.y });
    }
  };
  addRooms(entry);
  pieces.forEach((_, k) => { if (k !== entry) addRooms(k); });
  if (rooms[0]?.tag !== 'lobby') throw new Error(`${id}: the lobby is not room 0`);

  const features: PlacedFeature[] = [];
  const nodes = new Set<number>();
  pieces.forEach((p, k) => {
    const o = at[k] as Rect;
    for (const f of p.features) {
      const cell = (o.y + f.y) * W + o.x + f.x;
      if (f.kind === 'node') nodes.add(cell);
      else features.push({ kind: f.kind, cell });
    }
  });
  for (const d of doors) if (open.has(cellOf(d))) nodes.add(porch(d));
  for (const path of paths) {
    if (grid[path[0] ?? 0] === 's') continue;
    for (let k = 8; k < path.length - 4; k += 8) nodes.add(path[k] as number);
  }
  const glass: number[] = [];
  const spine: number[] = [];
  const spineNodes: number[] = [];
  for (let i = 0; i < W * H; i++) {
    if (grid[i] === '=') glass.push(i);
    if (grid[i] === 's' || spineDoors.has(i)) spine.push(i);
    // Where a corridor meets the spine: the one point a patrol crosses it.
    if (grid[i] === 's' && [i - 1, i + 1, i - W, i + W].some(isCorridor)) spineNodes.push(i);
  }
  if (spine.length > 0 && spineNodes.length === 0) {
    const sp = paths[0] ?? [];
    spineNodes.push(sp[sp.length >> 1] as number);
  }
  const templates: PlacedTemplate[] = pieces.map((p, k) => {
    const o = at[k] as Rect;
    return {
      id: p.id, ...o, rooms: roomIds[k] as number[],
      doors: doors.filter((d) => d.piece === k).map(cellOf),
      service: service.filter((d) => d.piece === k && open.has(cellOf(d))).map(cellOf),
    };
  });
  const rows: string[] = [];
  for (let y = 0; y < H; y++) rows.push(grid.slice(y * W, y * W + W).join(''));
  return {
    id, w: W, h: H, rows, rooms, glass, spine,
    nodes: [...nodes].filter((i) => walk(i) && grid[i] !== 'c').sort((a, b) => a - b),
    spineNodes,
    composed: { templates, objective, features, closets },
  };
}

/** The blocks (two by two, by their top-left cell) right outside a door, the way out of it. */
function porchBlocks(d: Door, W: number): { block: number; dir: number }[] {
  const px = d.x + d.dx;
  const py = d.y + d.dy;
  if (d.dx !== 0) {
    const bx = d.dx > 0 ? px : px - 1;
    const dir = d.dx > 0 ? 0 : 1;
    return [{ block: (py - 1) * W + bx, dir }, { block: py * W + bx, dir }];
  }
  const by = d.dy > 0 ? py : py - 1;
  const dir = d.dy > 0 ? 2 : 3;
  return [{ block: by * W + px - 1, dir }, { block: by * W + px, dir }];
}

function goalBlocks(d: Door, W: number): (block: number) => boolean {
  const goals = new Set(porchBlocks(d, W).map((p) => p.block));
  return (b) => goals.has(b);
}

/**
 * The cheapest way for a corridor two cells wide from `starts` to a block
 * `goal` accepts: blocks of two by two cells, every cell of them clear,
 * paying one a step, `cost` for each cell, and `TURN` a corner. The blocks
 * of the way, in order, or null.
 */
function route(
  W: number,
  H: number,
  blocked: (cell: number) => boolean,
  cost: (cell: number) => number,
  starts: readonly { block: number; dir: number }[],
  goal: (block: number) => boolean,
): number[] | null {
  const ok = (b: number): boolean => {
    const x = b % W;
    const y = (b - x) / W;
    if (x < 1 || y < 1 || x + 1 > W - 2 || y + 1 > H - 2) return false;
    return !blocked(b) && !blocked(b + 1) && !blocked(b + W) && !blocked(b + W + 1);
  };
  const price = (b: number): number => 1 + cost(b) + cost(b + 1) + cost(b + W) + cost(b + W + 1);
  const dist = new Float64Array(W * H * 4).fill(Infinity);
  const prev = new Int32Array(W * H * 4).fill(-1);
  const heap = new Heap();
  for (const s of starts) {
    if (!ok(s.block)) continue;
    const st = s.block * 4 + s.dir;
    const d = price(s.block);
    if (d < (dist[st] as number)) {
      dist[st] = d;
      heap.push(d, st);
    }
  }
  const STEP = [1, -1, W, -W];
  while (heap.size > 0) {
    const [d, st] = heap.pop();
    if (d > (dist[st] as number)) continue;
    const b = st >> 2;
    const dir = st & 3;
    if (goal(b)) {
      const out: number[] = [];
      for (let s = st; s >= 0; s = prev[s] as number) out.push(s >> 2);
      return out.reverse();
    }
    const x = b % W;
    for (let nd = 0; nd < 4; nd++) {
      if ((nd === 0 && x + 1 >= W) || (nd === 1 && x === 0)) continue;
      const nb = b + (STEP[nd] as number);
      if (nb < 0 || nb >= W * H || !ok(nb)) continue;
      const ns = nb * 4 + nd;
      const c = d + price(nb) + (nd === dir ? 0 : TURN);
      if (c < (dist[ns] as number)) {
        dist[ns] = c;
        prev[ns] = st;
        heap.push(c, ns);
      }
    }
  }
  return null;
}

/** A binary min-heap of (cost, state). */
class Heap {
  private readonly keys: number[] = [];
  private readonly vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }

  push(k: number, v: number): void {
    const { keys, vals } = this;
    let i = keys.length;
    keys.push(k);
    vals.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((keys[p] as number) <= k) break;
      keys[i] = keys[p] as number;
      vals[i] = vals[p] as number;
      i = p;
    }
    keys[i] = k;
    vals[i] = v;
  }

  pop(): [number, number] {
    const { keys, vals } = this;
    const top: [number, number] = [keys[0] as number, vals[0] as number];
    const k = keys.pop() as number;
    const v = vals.pop() as number;
    const n = keys.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const rr = l + 1;
        const c = rr < n && (keys[rr] as number) < (keys[l] as number) ? rr : l;
        if ((keys[c] as number) >= k) break;
        keys[i] = keys[c] as number;
        vals[i] = vals[c] as number;
        i = c;
      }
      keys[i] = k;
      vals[i] = v;
    }
    return top;
  }
}

/**
 * Independent loops on a floor: the cycle rank (edges - nodes + parts) of
 * its region graph, where a node is a template's inside (each part of it
 * you can walk round without leaving it) or a stretch of corridor, and an
 * edge is a door that joins the two. A bullpen with two doors onto one
 * corridor is a loop (in one door, out the other, back round); an office
 * that is a dead end is not; furniture that cuts a room in two counts.
 */
export function loopCount(w: number, h: number, walk: (cell: number) => boolean, rects: readonly Rect[]): number {
  const owner = new Int16Array(w * h).fill(-1);
  const ring = new Uint8Array(w * h);
  rects.forEach((o, k) => {
    for (let y = o.y; y < o.y + o.h; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        owner[y * w + x] = k;
        if (x === o.x || y === o.y || x === o.x + o.w - 1 || y === o.y + o.h - 1) ring[y * w + x] = 1;
      }
    }
  });
  const comp = new Int32Array(w * h).fill(-1);
  let comps = 0;
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (comp[i] !== -1 || ring[i] === 1 || !walk(i)) continue;
    const own = owner[i];
    comp[i] = comps;
    stack.push(i);
    while (stack.length > 0) {
      const c = stack.pop() as number;
      const x = c % w;
      for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w]) {
        if (n < 0 || n >= w * h || comp[n] !== -1 || ring[n] === 1 || owner[n] !== own || !walk(n)) continue;
        comp[n] = comps;
        stack.push(n);
      }
    }
    comps++;
  }
  const parent = Array.from({ length: comps }, (_, k) => k);
  const find = (k: number): number => {
    let x = k;
    while (parent[x] !== x) x = parent[x] = parent[parent[x] as number] as number;
    return x;
  };
  let edges = 0;
  rects.forEach((o) => {
    for (let y = o.y; y < o.y + o.h; y++) {
      for (let x = o.x; x < o.x + o.w; x++) {
        const i = y * w + x;
        if (ring[i] !== 1 || !walk(i)) continue;
        const dx = x === o.x ? -1 : x === o.x + o.w - 1 ? 1 : 0;
        const dy = y === o.y ? -1 : y === o.y + o.h - 1 ? 1 : 0;
        if ((dx !== 0) === (dy !== 0)) continue;
        const inner = comp[(y - dy) * w + x - dx] ?? -1;
        const outer = comp[(y + dy) * w + x + dx] ?? -1;
        if (inner < 0 || outer < 0) continue;
        edges++;
        parent[find(inner)] = find(outer);
      }
    }
  });
  let parts = 0;
  for (let k = 0; k < comps; k++) if (find(k) === k) parts++;
  return edges - comps + parts;
}
