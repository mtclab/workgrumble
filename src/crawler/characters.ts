import * as THREE from 'three';

/**
 * Office people as hand-built voxel figures. Each part (a leg, an arm, the
 * torso, the head) is sculpted cell by cell on a 4.5 cm lattice, then
 * greedy-meshed into flat quads whose vertex colours carry the lighting a
 * voxel artist would paint in: ambient occlusion in every crease, a gentle
 * top-lit gradient, and a little per-voxel grain in cloth and hair. Faces are
 * pixel art in half-size voxels on the front of the head, one small cached
 * mesh per mood. Shapes are cached per option set and only recoloured per
 * outfit, so a crowd of office people costs a few group allocations each.
 */

export type Expression = 'neutral' | 'angry' | 'happy' | 'smug' | 'kind' | 'stern' | 'tired';

export interface Outfit {
  readonly skin: number;
  readonly hair: number;
  readonly top: number;
  readonly legs: number;
  readonly shoes?: number;
  readonly tie?: number;
  readonly lanyard?: number;
  readonly cardigan?: number;
  readonly glasses?: boolean;
  readonly headset?: boolean;
  readonly hairStyle?: 'short' | 'long' | 'bun' | 'bald' | 'hood' | 'tonttu';
  readonly backpack?: number;
  readonly beard?: number;
  readonly scale?: number;
  readonly face?: Expression;
}

export interface Rig {
  readonly root: THREE.Group;
  readonly body: THREE.Group;
  readonly head: THREE.Group;
  readonly armL: THREE.Group;
  readonly armR: THREE.Group;
  readonly legL: THREE.Group;
  readonly legR: THREE.Group;
  /** Where a held tool attaches. */
  readonly hand: THREE.Group;
  readonly materials: THREE.MeshStandardMaterial[];
  /** The rig's material (kept for callers that tint or fade the face). */
  readonly faceMat: THREE.MeshStandardMaterial;
  /** The pixel-art face: its geometry is swapped when the expression changes. */
  readonly face: THREE.Mesh;
  readonly outfit: Outfit;
  expression: Expression;
  phase: number;
  /** Resting emissive colour (a clone's blue glow); hit flashes return to it. */
  glow: number;
}

// ---------------------------------------------------------------- the lattice

/** Edge of one voxel, in metres: a person is about forty of them tall. */
const V = 0.045;

/**
 * What a voxel is made of. The outfit decides each slot's colour, so one
 * sculpted shape serves every colour scheme that wears it.
 */
const S = {
  SKIN: 1, SKIN_SHADE: 2, HAIR: 3, BROW: 4, TOP: 5, TOP_DARK: 6, SLEEVE: 7, SLEEVE_DARK: 8,
  LEGS: 9, LEGS_DARK: 10, SHOE: 11, SOLE: 12, TIE: 13, TIE_DARK: 14, LANYARD: 15, BADGE: 16,
  INK: 17, CARDI: 18, CARDI_DARK: 19, PACK: 20, PACK_DARK: 21, BEARD: 22, GEAR: 23, GEAR_HI: 24,
  EYE: 25, WHITE: 26, MOUTH: 27, BLUSH: 28, BAG: 29, HAT: 30, HAT_DARK: 31, FUR: 32,
  BUCKLE: 33, SHIRT: 34, GLINT: 35, SEAM: 36,
} as const;
const SLOT_COUNT = 37;

/** How a slot varies voxel to voxel: 0 smooth, 1 woven cloth, 2 hair in strands. */
const GRAIN = new Uint8Array(SLOT_COUNT);
for (const s of [S.TOP, S.TOP_DARK, S.SEAM, S.SLEEVE, S.SLEEVE_DARK, S.LEGS, S.LEGS_DARK, S.CARDI, S.CARDI_DARK, S.PACK, S.PACK_DARK, S.HAT, S.SHIRT, S.SOLE]) GRAIN[s] = 1;
for (const s of [S.HAIR, S.BEARD, S.FUR]) GRAIN[s] = 2;

/** Brightness of each grain's tones (tone 0 is the plain colour). */
const TONE: readonly (readonly number[])[] = [
  [1, 1, 1, 1],
  [1, 1.05, 0.94, 1],
  [1, 1.1, 0.88, 0.78],
];

/** Light left at a vertex with 0..3 open neighbours (strong, as painted). */
const AO = [0.46, 0.64, 0.82, 1];
/** Extra shade for a face that looks into a one-voxel gap. */
const CAVITY = 0.8;

/** A deterministic 0..1 hash of a cell (the repo bans Math.random). */
function hash(i: number, j: number, k: number, s: number): number {
  let h = Math.imul(i + 0x9e37, 0x85ebca6b) ^ Math.imul(j + 0x7f4a, 0xc2b2ae35) ^ Math.imul(k + 0x3c6e, 0x27d4eb2f) ^ Math.imul(s + 1, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The tone (0..3) a voxel is painted in. */
function toneOf(slot: number, i: number, j: number, k: number): number {
  const grain = GRAIN[slot] ?? 0;
  if (grain === 0) return 0;
  if (grain === 1) {
    const h = hash(i, j, k, slot);
    return h < 0.7 ? 0 : h < 0.85 ? 1 : 2;
  }
  // Hair runs in strands: a column keeps its tone for a couple of cells.
  const h = hash(i, j >> 1, k, 7);
  return h < 0.45 ? 0 : h < 0.72 ? 1 : h < 0.92 ? 2 : 3;
}

/** The painted top-lit gradient: feet a little dim, the crown bright. */
function gradient(y: number): number {
  return 0.8 + 0.22 * Math.min(1, Math.max(0, y / 1.9));
}

/** A box of fine detail (a face pixel, a glasses frame) in lattice units. */
interface Fine {
  readonly s: number;
  readonly x0: number; readonly x1: number;
  readonly y0: number; readonly y1: number;
  readonly z0: number; readonly z1: number;
  /** False for a decal lying flat on the head: its back face is never seen. */
  readonly back: boolean;
}

/**
 * A block of voxels in lattice coordinates: cell (i, j, k) spans x in
 * [i - 0.5, i + 0.5], y in [j, j + 1] and z in [k - 0.5, k + 0.5] voxels, so
 * odd widths and depths sit symmetric about the body's centre line.
 */
class Vox {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly cells: Uint8Array;
  readonly fine: Fine[] = [];

  constructor(readonly x0: number, x1: number, readonly y0: number, y1: number, readonly z0: number, z1: number) {
    this.nx = x1 - x0 + 1;
    this.ny = y1 - y0 + 1;
    this.nz = z1 - z0 + 1;
    this.cells = new Uint8Array(this.nx * this.ny * this.nz);
  }

  private at(i: number, j: number, k: number): number {
    const a = i - this.x0;
    const b = j - this.y0;
    const c = k - this.z0;
    if (a < 0 || b < 0 || c < 0 || a >= this.nx || b >= this.ny || c >= this.nz) return -1;
    return a + this.nx * (b + this.ny * c);
  }

  get(i: number, j: number, k: number): number {
    const n = this.at(i, j, k);
    return n < 0 ? 0 : this.cells[n] ?? 0;
  }

  set(i: number, j: number, k: number, s: number): this {
    const n = this.at(i, j, k);
    if (n >= 0) this.cells[n] = s;
    return this;
  }

  /** Fill (slot 0 carves) an inclusive box of cells, its vertical edges cut back by `cut`. */
  box(s: number, xa: number, xb: number, ya: number, yb: number, za: number, zb: number, cut = 0, paint = false): this {
    for (let k = za; k <= zb; k++) {
      for (let i = xa; i <= xb; i++) {
        if (cut > 0 && Math.min(i - xa, xb - i) + Math.min(k - za, zb - k) < cut) continue;
        for (let j = ya; j <= yb; j++) {
          if (paint && this.get(i, j, k) === 0) continue;
          this.set(i, j, k, s);
        }
      }
    }
    return this;
  }

  /** Recolour the filled cells of a box. */
  paint(s: number, xa: number, xb: number, ya: number, yb: number, za: number, zb: number): this {
    return this.box(s, xa, xb, ya, yb, za, zb, 0, true);
  }

  /** A box with every edge rounded by radius `r` (in cells), sampled at cell centres. */
  rbox(s: number, xa: number, xb: number, ya: number, yb: number, za: number, zb: number, r: number): this {
    const cx = (xa + xb) / 2;
    const cy = (ya + yb + 1) / 2;
    const cz = (za + zb) / 2;
    const hx = (xb - xa + 1) / 2;
    const hy = (yb - ya + 1) / 2;
    const hz = (zb - za + 1) / 2;
    for (let k = za; k <= zb; k++) {
      for (let j = ya; j <= yb; j++) {
        for (let i = xa; i <= xb; i++) {
          const px = Math.abs(i - cx) - (hx - r);
          const py = Math.abs(j + 0.5 - cy) - (hy - r);
          const pz = Math.abs(k - cz) - (hz - r);
          const d = Math.hypot(Math.max(px, 0), Math.max(py, 0), Math.max(pz, 0)) + Math.min(Math.max(px, py, pz), 0) - r;
          if (d <= 0.02) this.set(i, j, k, s);
        }
      }
    }
    return this;
  }

  /** Recolour the frontmost (+z) filled cell of column (i, j). */
  front(s: number, i: number, j: number): this {
    for (let k = this.z0 + this.nz - 1; k >= this.z0; k--) {
      if (this.get(i, j, k) !== 0) return this.set(i, j, k, s);
    }
    return this;
  }

  /** The highest filled cell of column (i, k), or the grid floor. */
  topY(i: number, k: number): number {
    for (let j = this.y0 + this.ny - 1; j >= this.y0; j--) if (this.get(i, j, k) !== 0) return j;
    return this.y0;
  }

  /** Add a fine box (lattice units: x and z at cell centres, y at cell floors). */
  detail(s: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, back = true): this {
    this.fine.push({ s, x0, x1, y0, y1, z0, z1, back });
    return this;
  }
}

// ---------------------------------------------------------------- meshing

/** Quads collected for one part, in metres about its pivot. */
class Quads {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly slot: number[] = [];
  readonly light: number[] = [];
  readonly idx: number[] = [];

  constructor(private readonly px: number, private readonly py: number, private readonly pz: number) {}

  /**
   * One quad on the plane `plane` across axis `d` (0 x, 1 y, 2 z), spanning
   * [a0, a1] x [b0, b1] on the next two axes; `lights` are per corner in
   * the order (a0 b0) (a1 b0) (a1 b1) (a0 b1).
   */
  quad(d: number, dir: number, plane: number, a0: number, a1: number, b0: number, b1: number, s: number, lights: readonly number[]): void {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const base = this.pos.length / 3;
    const corners = dir > 0 ? CORNER_ORDER_POS : CORNER_ORDER_NEG;
    const p = [0, 0, 0];
    for (const c of corners) {
      p[d] = plane;
      p[u] = c === 0 || c === 3 ? a0 : a1;
      p[v] = c === 0 || c === 1 ? b0 : b1;
      const x = (p[0] ?? 0) * V;
      const y = (p[1] ?? 0) * V;
      const z = (p[2] ?? 0) * V;
      this.pos.push(x - this.px, y - this.py, z - this.pz);
      this.nrm.push(d === 0 ? dir : 0, d === 1 ? dir : 0, d === 2 ? dir : 0);
      this.slot.push(s);
      this.light.push((lights[c] ?? 1) * gradient(y));
    }
    // Split along the diagonal whose corners are darker together, so a lone
    // dark corner fades evenly instead of leaving a hard triangle.
    const l0 = lights[corners[0]] ?? 1;
    const l1 = lights[corners[1]] ?? 1;
    const l2 = lights[corners[2]] ?? 1;
    const l3 = lights[corners[3]] ?? 1;
    if (l0 + l2 > l1 + l3) this.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
    else this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

const CORNER_ORDER_POS = [0, 1, 2, 3] as const;
const CORNER_ORDER_NEG = [0, 3, 2, 1] as const;
const FLAT = [1, 1, 1, 1] as const;

/** A lattice cell lookup (another part's canonical block, or this one's own). */
type Occupied = (i: number, j: number, k: number) => boolean;

/**
 * Greedy-mesh a voxel block: hidden faces culled, coplanar neighbours with the
 * same slot, tone and corner occlusion merged into one quad.
 */
function meshVoxels(g: Vox, occ: Occupied, q: Quads): void {
  const n = [g.nx, g.ny, g.nz];
  const o = [g.x0, g.y0, g.z0];
  const c = [0, 0, 0];
  const e = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ] as const;
  const lights = [1, 1, 1, 1];
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;
    const nu = n[u] ?? 0;
    const nv = n[v] ?? 0;
    const nd = n[d] ?? 0;
    const ed = e[d] ?? e[0];
    const eu = e[u] ?? e[0];
    const ev = e[v] ?? e[0];
    const mask = new Int32Array(nu * nv);
    for (const dir of [1, -1]) {
      for (let s = 0; s < nd; s++) {
        let any = false;
        for (let b = 0; b < nv; b++) {
          for (let a = 0; a < nu; a++) {
            c[d] = s;
            c[u] = a;
            c[v] = b;
            const i = (c[0] ?? 0) + (o[0] ?? 0);
            const j = (c[1] ?? 0) + (o[1] ?? 0);
            const k = (c[2] ?? 0) + (o[2] ?? 0);
            const slot = g.get(i, j, k);
            let key = 0;
            if (slot !== 0) {
              const li = i + ed[0] * dir;
              const lj = j + ed[1] * dir;
              const lk = k + ed[2] * dir;
              if (g.get(li, lj, lk) === 0) {
                // Occlusion at the four corners, from the layer the face looks into.
                let packed = 0;
                for (let corner = 0; corner < 4; corner++) {
                  const su = corner === 0 || corner === 3 ? -1 : 1;
                  const sv = corner === 0 || corner === 1 ? -1 : 1;
                  const s1 = occ(li + eu[0] * su, lj + eu[1] * su, lk + eu[2] * su) ? 1 : 0;
                  const s2 = occ(li + ev[0] * sv, lj + ev[1] * sv, lk + ev[2] * sv) ? 1 : 0;
                  const cc = occ(li + eu[0] * su + ev[0] * sv, lj + eu[1] * su + ev[1] * sv, lk + eu[2] * su + ev[2] * sv) ? 1 : 0;
                  const ao = s1 === 1 && s2 === 1 ? 0 : 3 - (s1 + s2 + cc);
                  packed |= ao << (corner * 2);
                }
                const cav = occ(li + ed[0] * dir, lj + ed[1] * dir, lk + ed[2] * dir) ? 1 : 0;
                key = 1 + (slot | (toneOf(slot, i, j, k) << 6) | (packed << 8) | (cav << 16));
                any = true;
              }
            }
            mask[a + b * nu] = key;
          }
        }
        if (!any) continue;
        const plane = s + (o[d] ?? 0) + (dir > 0 ? 1 : 0) - (d === 1 ? 0 : 0.5);
        for (let b = 0; b < nv; b++) {
          for (let a = 0; a < nu; ) {
            const key = mask[a + b * nu] ?? 0;
            if (key === 0) {
              a++;
              continue;
            }
            let w = 1;
            while (a + w < nu && mask[a + w + b * nu] === key) w++;
            let h = 1;
            grow: while (b + h < nv) {
              for (let t = 0; t < w; t++) if (mask[a + t + (b + h) * nu] !== key) break grow;
              h++;
            }
            for (let y = 0; y < h; y++) mask.fill(0, a + (b + y) * nu, a + w + (b + y) * nu);
            const raw = key - 1;
            const slot = raw & 63;
            const tone = TONE[GRAIN[slot] ?? 0]?.[(raw >> 6) & 3] ?? 1;
            const cav = (raw >> 16) & 1 ? CAVITY : 1;
            for (let corner = 0; corner < 4; corner++) lights[corner] = (AO[(raw >> (8 + corner * 2)) & 3] ?? 1) * tone * cav;
            const ua = a + (o[u] ?? 0) - (u === 1 ? 0 : 0.5);
            const vb = b + (o[v] ?? 0) - (v === 1 ? 0 : 0.5);
            q.quad(d, dir, plane, ua, ua + w, vb, vb + h, slot, lights);
            a += w;
          }
        }
      }
    }
  }
}

/** Fine boxes: flat-lit, with a painted darker underside. */
function meshFine(boxes: readonly Fine[], q: Quads): void {
  const under = [0.72, 0.72, 0.72, 0.72];
  const side = [0.92, 0.92, 0.92, 0.92];
  for (const f of boxes) {
    q.quad(0, 1, f.x1, f.y0, f.y1, f.z0, f.z1, f.s, side);
    q.quad(0, -1, f.x0, f.y0, f.y1, f.z0, f.z1, f.s, side);
    q.quad(1, 1, f.y1, f.z0, f.z1, f.x0, f.x1, f.s, FLAT);
    q.quad(1, -1, f.y0, f.z0, f.z1, f.x0, f.x1, f.s, under);
    q.quad(2, 1, f.z1, f.x0, f.x1, f.y0, f.y1, f.s, FLAT);
    if (f.back) q.quad(2, -1, f.z0, f.x0, f.x1, f.y0, f.y1, f.s, side);
  }
}

/** A meshed part before colouring: shared position, normal and index buffers. */
interface Shape {
  readonly position: THREE.BufferAttribute;
  readonly normal: THREE.BufferAttribute;
  readonly index: THREE.BufferAttribute;
  readonly slots: Uint8Array;
  readonly light: Float32Array;
  /** The palette slots it uses, for its colour cache key. */
  readonly used: readonly number[];
  readonly sphere: THREE.Sphere;
}

function finish(q: Quads): Shape {
  const position = new THREE.BufferAttribute(new Float32Array(q.pos), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(q.nrm), 3);
  const count = q.pos.length / 3;
  const index = count > 65535 ? new THREE.BufferAttribute(new Uint32Array(q.idx), 1) : new THREE.BufferAttribute(new Uint16Array(q.idx), 1);
  const slots = new Uint8Array(q.slot);
  const used = [...new Set(q.slot)].sort((a, b) => a - b);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', position);
  g.computeBoundingSphere();
  const sphere = g.boundingSphere?.clone() ?? new THREE.Sphere();
  return { position, normal, index, slots, light: new Float32Array(q.light), used, sphere };
}

// ---------------------------------------------------------------- sculpting

type Side = -1 | 1;

/** One leg: a trouser leg on a sturdy two-tone shoe that splays a little outward. */
function sculptLeg(side: Side): Vox {
  const xa = side < 0 ? -3 : 1;
  const xb = side < 0 ? -1 : 3;
  const g = new Vox(xa - 2, xb + 2, 0, 21, -3, 4);
  g.box(S.LEGS, xa, xb, 2, 20, -2, 1);
  // Round off the calf, turn up the hem.
  g.box(0, xa, xa, 2, 16, -2, -2).box(0, xb, xb, 2, 16, -2, -2);
  g.paint(S.LEGS_DARK, xa, xb, 2, 2, -2, 1);
  // The shoe: a sole, a rounded toe proud of the leg, an instep.
  const sa = side < 0 ? xa - 1 : xa;
  const sb = side < 0 ? xb : xb + 1;
  g.box(S.SOLE, sa, sb, 0, 0, -2, 3, 1);
  g.box(S.SHOE, sa, sb, 1, 1, -2, 3, 1);
  g.box(S.SHOE, xa, xb, 2, 2, 2, 2);
  return g;
}

/** One arm: a sleeve with a cuff, a rounded shoulder, a sturdy hand with a thumb. */
function sculptArm(side: Side): Vox {
  const xa = side < 0 ? -6 : 4;
  const xb = side < 0 ? -4 : 6;
  const inner = side < 0 ? xb : xa;
  const outer = side < 0 ? xa : xb;
  const g = new Vox(xa - 1, xb + 1, 17, 35, -3, 3);
  g.box(S.SLEEVE, xa, xb, 22, 33, -1, 1);
  g.set(outer, 33, -1, 0).set(outer, 33, 1, 0);
  g.box(S.SLEEVE_DARK, xa, xb, 22, 22, -1, 1);
  g.box(S.SKIN, xa, xb, 19, 21, -1, 1);
  g.set(outer, 19, -1, 0).set(outer, 19, 1, 0).set(inner, 19, -1, 0);
  g.set(inner, 20, 2, S.SKIN).set(inner, 21, 2, S.SKIN);
  return g;
}

interface TorsoOpts {
  readonly tie: boolean;
  readonly suit: boolean;
  readonly lanyard: boolean;
  readonly cardigan: boolean;
  readonly backpack: boolean;
  /** Under a hood: a hoodie with a pouch and drawstrings. */
  readonly hoodie: boolean;
  /** A comfortable middle, for the bigger people of the office. */
  readonly portly: boolean;
}

/** Hips, belt, shirt and neck (seven cells across), with whatever they wear over them. */
function sculptTorso(t: TorsoOpts): Vox {
  const g = new Vox(-6, 6, 16, 36, -8, 6);
  // Hips, a belt with a buckle, back pockets.
  g.box(S.LEGS, -3, 3, 18, 21, -2, 2, 1);
  g.paint(S.LEGS_DARK, -3, 3, 21, 21, -2, 2);
  g.front(S.BUCKLE, 0, 21);
  g.paint(S.LEGS_DARK, -2, -1, 19, 19, -2, -2).paint(S.LEGS_DARK, 1, 2, 19, 19, -2, -2);
  // The shirt: a rounded block with the chest a cell prouder.
  g.box(S.TOP, -3, 3, 22, 33, -2, 2, 1);
  g.box(S.TOP, -2, 2, 26, 33, 3, 3);
  g.set(-2, 26, 3, 0).set(2, 26, 3, 0);
  if (t.portly) {
    // A paunch pushing the shirt and the belt out a cell.
    g.box(S.TOP, -2, 2, 22, 26, 3, 3).set(-2, 22, 3, 0).set(2, 22, 3, 0);
    g.box(S.TOP, -1, 1, 23, 25, 4, 4);
    g.box(S.LEGS_DARK, -1, 1, 21, 21, 3, 3);
    g.front(S.BUCKLE, 0, 21);
  }
  // Shoulder seams and a neck.
  g.paint(S.TOP_DARK, -3, -3, 33, 33, -1, 1).paint(S.TOP_DARK, 3, 3, 33, 33, -1, 1);
  g.box(S.SKIN, -1, 1, 34, 35, -1, 1);
  // The collar: a ring round the neck, open at the throat.
  for (let i = -2; i <= 2; i++) {
    for (let k = -2; k <= 3; k++) if (Math.abs(i) === 2 || k === -2 || k >= 2) g.paint(S.TOP_DARK, i, i, 33, 33, k, k);
  }
  g.front(S.SKIN, 0, 33);

  if (t.suit) {
    // A jacket open in a V over a white shirt, with lapels and two buttons.
    for (let j = 29; j <= 33; j++) {
      const half = j >= 32 ? 1 : 0;
      for (let i = -half; i <= half; i++) g.front(S.SHIRT, i, j);
      g.front(S.TOP_DARK, -half - 1, j).front(S.TOP_DARK, half + 1, j);
    }
    g.front(S.TOP_DARK, 0, 27).front(S.TOP_DARK, 0, 25);
  } else if (t.hoodie && !t.tie && !t.cardigan) {
    // A pouch across the belly and drawstrings from the hood.
    g.front(S.SEAM, -2, 25).front(S.SEAM, -1, 25).front(S.SEAM, 1, 25).front(S.SEAM, 2, 25);
    g.front(S.SEAM, -2, 24).front(S.SEAM, 2, 24).front(S.SEAM, -2, 23).front(S.SEAM, 2, 23);
    g.front(S.SHIRT, -1, 32).front(S.SHIRT, 1, 32).front(S.SHIRT, -1, 31).front(S.SHIRT, 1, 31);
  } else if (!t.tie && !t.cardigan) {
    // A button placket and a breast pocket.
    g.front(S.SEAM, 0, 31).front(S.SEAM, 0, 28);
    g.front(S.SEAM, 1, 29).front(S.SEAM, 2, 29);
  }
  if (t.tie) {
    // Knot at the collar, a blade down the front (inside the V on a suit).
    const bottom = t.suit ? 29 : 24;
    g.front(S.TIE_DARK, 0, 33);
    for (let j = bottom; j <= 32; j++) g.front(S.TIE, 0, j);
    if (!t.suit) g.front(S.TIE_DARK, 0, 24);
    g.detail(S.TIE_DARK, -0.45, 0.45, 32.95, 33.9, 3.4, 3.78);
    if (!t.suit) g.front(S.TOP, -1, 33).front(S.TOP, 1, 33);
  }
  if (t.cardigan) {
    // Knitwear over everything but a V at the neck; it hangs over the belt.
    const half = (j: number): number => (j >= 31 ? 1 : 0);
    for (let k = -3; k <= 4; k++) {
      for (let j = 20; j <= 33; j++) {
        for (let i = -5; i <= 5; i++) {
          const s = g.get(i, j, k);
          if (s === 0 || s === S.SKIN) continue;
          const open = k >= 2 && j >= 28 && Math.abs(i) <= half(j);
          if (!open) g.set(i, j, k, S.CARDI);
        }
      }
    }
    for (let j = 28; j <= 33; j++) g.front(S.CARDI_DARK, -half(j) - 1, j).front(S.CARDI_DARK, half(j) + 1, j);
    for (const j of [23, 26]) g.front(S.CARDI_DARK, 0, j);
    g.paint(S.CARDI_DARK, -3, 3, 20, 20, -2, 2);
  }
  if (t.backpack) {
    // A pack with a pocket, a zip, a carry loop and straps over the shoulders.
    g.rbox(S.PACK, -2, 2, 23, 32, -5, -3, 1.2);
    g.rbox(S.PACK, -1, 1, 24, 27, -6, -6, 0.6);
    g.paint(S.PACK_DARK, -1, 1, 27, 27, -6, -6).paint(S.PACK_DARK, -2, 2, 30, 30, -5, -5);
    g.set(-1, 33, -4, S.PACK_DARK).set(1, 33, -4, S.PACK_DARK);
    g.box(S.PACK_DARK, -1, 1, 34, 34, -4, -4);
    for (const i of [-3, 3]) {
      g.paint(S.PACK_DARK, i, i, 33, 33, -2, 2);
      for (let j = 26; j <= 32; j++) g.front(S.PACK_DARK, i, j);
    }
  }
  if (t.lanyard) {
    // A strap from behind the neck to an ID badge on the chest.
    for (const [i, j] of [[2, 33], [2, 32], [1, 31], [1, 30]] as const) g.front(S.LANYARD, -i, j).front(S.LANYARD, i, j);
    g.paint(S.LANYARD, -2, -2, 33, 33, -2, 2).paint(S.LANYARD, 2, 2, 33, 33, -2, 2);
    g.detail(S.LANYARD, -0.35, 0.35, 29.2, 29.9, 3.5, 3.62);
    g.detail(S.BADGE, -0.8, 0.8, 27.2, 29.3, 3.5, 3.6);
    g.detail(S.INK, -0.6, -0.1, 27.6, 28.9, 3.6, 3.64, false);
    g.detail(S.LANYARD, 0.1, 0.6, 28.5, 28.75, 3.6, 3.64, false);
    g.detail(S.INK, 0.1, 0.6, 28.0, 28.2, 3.6, 3.64, false);
  }
  return g;
}

type HairStyle = NonNullable<Outfit['hairStyle']>;

interface HeadOpts {
  readonly style: HairStyle;
  readonly glasses: boolean;
  readonly headset: boolean;
  readonly beard: boolean;
  /** Which way the fringe falls (and, for short hair, a quiff or not). */
  readonly variant: 0 | 1;
}

/** The skull: seven cells wide, deep and tall, its edges rounded off, with ears. */
function skull(g: Vox): void {
  g.box(S.SKIN, -3, 3, 36, 41, -3, 3, 1);
  g.box(S.SKIN, -2, 2, 35, 35, -2, 3);
  g.set(-3, 41, -2, 0).set(3, 41, -2, 0).set(-3, 41, 2, 0).set(3, 41, 2, 0);
  g.box(S.SKIN, -4, -4, 37, 38, 0, 0).box(S.SKIN, 4, 4, 37, 38, 0, 0);
  g.set(-4, 37, 0, S.SKIN_SHADE).set(4, 37, 0, S.SKIN_SHADE);
}

/** Head, hair and headgear; glasses and nose as fine detail. */
function sculptHead(h: HeadOpts): Vox {
  const g = new Vox(-6, 6, 29, 50, -8, 6);
  const style = h.style;
  if (style === 'hood') {
    // The hood first: a rounded shell the skull then fills, open at the face.
    g.rbox(S.TOP, -4, 4, 34, 42, -4, 4, 1.8);
    g.box(S.TOP, -3, 3, 33, 34, -4, -3, 1);
    g.box(S.TOP, -3, 3, 34, 35, -3, 2, 1);
  }
  skull(g);
  // The fringe sweeps to one side or the other.
  const f = h.variant === 0 ? -1 : 1;
  if (style === 'short' || style === 'long' || style === 'bun') {
    // A cap of hair over the crown and down the back; a swept fringe.
    g.paint(S.HAIR, -3, 3, 41, 41, -3, 3);
    g.paint(S.HAIR, -3, 3, 37, 40, -3, -2);
    g.paint(S.HAIR, -3, -3, 39, 40, -3, 1).paint(S.HAIR, 3, 3, 39, 40, -3, 1);
    g.set(2 * f, 40, 3, S.HAIR).set(f, 40, 3, S.HAIR).set(2 * f, 39, 3, S.HAIR);
  }
  if (style === 'short') {
    g.box(S.HAIR, -3, 3, 42, 42, -3, 2, 1);
    // A quiff over the forehead, or a crop with a tuft at the crown.
    if (h.variant === 0) g.box(S.HAIR, -1, 1, 43, 43, -1, 1).set(2 * f, 43, 0, S.HAIR).set(0, 43, 2, S.HAIR);
    else g.box(S.HAIR, -1, 1, 43, 43, -2, 0).set(-f, 43, -1, S.HAIR);
    g.box(S.HAIR, -4, -4, 39, 41, -3, 1).box(S.HAIR, 4, 4, 39, 41, -3, 1);
    g.box(S.HAIR, -2, 2, 37, 41, -4, -4).box(S.HAIR, -3, 3, 39, 41, -4, -4);
    g.set(-4, 41, -3, 0).set(4, 41, -3, 0);
  }
  if (style === 'long') {
    // Straight curtains to the shoulders, ragged at the ends.
    g.box(S.HAIR, -3, 3, 42, 42, -3, 2, 1);
    g.box(S.HAIR, -4, -4, 34, 41, -3, 1).box(S.HAIR, 4, 4, 34, 41, -3, 1);
    g.paint(S.HAIR, -3, -3, 36, 40, -3, 1).paint(S.HAIR, 3, 3, 36, 40, -3, 1);
    g.box(S.HAIR, -3, 3, 34, 41, -4, -4).box(S.HAIR, -2, 2, 35, 40, -5, -5);
    for (let i = -4; i <= 4; i++) {
      for (let k = -5; k <= 1; k++) if (hash(i, 34, k, 3) < 0.4) g.set(i, 34, k, 0);
    }
    g.set(-4, 41, 1, 0).set(4, 41, 1, 0);
  }
  if (style === 'bun') {
    g.rbox(S.HAIR, -1, 1, 42, 44, -5, -3, 1.3);
    g.paint(S.BROW, -1, 1, 42, 42, -5, -3);
  }
  if (style === 'bald') {
    // A horseshoe of close-cropped hair round the back and over the ears.
    g.paint(S.HAIR, -3, 3, 37, 39, -3, -2);
    g.paint(S.HAIR, -3, -3, 38, 39, -3, 0).paint(S.HAIR, 3, 3, 38, 39, -3, 0);
    g.box(S.HAIR, -2, 2, 37, 39, -4, -4, 1);
  }
  if (style === 'hood') {
    g.box(0, -2, 2, 35, 41, 4, 4);
    g.paint(S.TOP_DARK, -3, 3, 34, 42, 4, 4);
    g.paint(S.HAIR, -2, 2, 41, 41, 3, 3).paint(S.HAIR, -2, -1, 40, 40, 3, 3);
  }
  if (style === 'tonttu') {
    // White tufts and a red pointed cap that flops back to a bobble.
    g.box(S.HAIR, -4, -4, 38, 40, -2, 1).box(S.HAIR, 4, 4, 38, 40, -2, 1);
    g.paint(S.HAIR, -3, 3, 40, 41, -3, -2);
    for (let n = 0; n < 6; n++) {
      const cz = -0.7 * n;
      const half = 4.6 - 0.72 * n;
      for (let k = -8; k <= 6; k++) {
        for (let i = -5; i <= 5; i++) {
          const ax = Math.abs(i);
          const az = Math.abs(k - cz);
          if (ax <= half - 0.5 && az <= half - 0.5 && ax + az <= half * 1.3) g.set(i, 41 + n, k, n === 0 ? S.HAT_DARK : S.HAT);
        }
      }
    }
    g.set(0, 47, -4, S.HAT).set(0, 47, -5, S.HAT).set(0, 46, -6, S.HAT).set(0, 46, -7, S.HAT);
    g.rbox(S.FUR, -1, 0, 44, 45, -8, -7, 0.9);
  }
  if (h.beard) {
    // A jaw of beard up to the sideburns; a tonttu's spills down the chest.
    g.paint(S.BEARD, -3, 3, 35, 36, -3, 3);
    g.paint(S.BEARD, -3, -3, 37, 38, -2, 1).paint(S.BEARD, 3, 3, 37, 38, -2, 1);
    if (style === 'tonttu') {
      g.rbox(S.BEARD, -2, 2, 31, 35, 0, 4, 1.2);
      g.box(0, -3, 3, 31, 31, -2, 6).box(S.BEARD, -1, 1, 31, 31, 1, 3);
    } else {
      g.box(S.BEARD, -2, 2, 34, 34, 0, 3, 1).box(S.BEARD, -1, 1, 35, 35, 4, 4);
    }
    g.detail(S.BEARD, -1, 1, 36.5, 37, 3.5, 3.78, false);
    g.detail(S.BEARD, -1.5, -1, 36.1, 36.9, 3.5, 3.74, false).detail(S.BEARD, 1, 1.5, 36.1, 36.9, 3.5, 3.74, false);
  }
  if (h.headset) {
    // A band over the top, padded cups over the ears, a boom mic.
    for (let i = -3; i <= 3; i++) g.set(i, g.topY(i, 0) + 1, 0, S.GEAR);
    for (const i of [-4, 4]) {
      const top = g.topY(Math.sign(i) * 3, 0);
      for (let j = 39; j <= top; j++) g.set(i, j, 0, S.GEAR);
    }
    for (const i of [-4, 4]) {
      g.box(S.GEAR, i, i, 36, 38, -1, 1);
      g.set(i, 36, -1, 0).set(i, 36, 1, 0).set(i, 38, -1, 0).set(i, 38, 1, 0);
      g.set(i + Math.sign(i), 37, 0, S.GEAR_HI);
    }
    g.detail(S.GEAR, 4.45, 4.7, 36.4, 36.65, 0.4, 3.8);
    g.detail(S.GEAR, 2.2, 4.7, 36.4, 36.65, 3.55, 3.8);
    g.detail(S.GEAR_HI, 1.55, 2.25, 36.15, 36.9, 3.5, 4.0);
  }
  // The nose: a half-voxel nub in the middle of the face.
  g.detail(S.SKIN, -0.5, 0.5, 37.05, 37.95, 3.5, 3.92, false);
  if (h.glasses) {
    // Thin frames with a margin of skin round each eye, a lens glint, a
    // bridge, and arms back over the ears.
    const z0 = 3.7;
    const z1 = 3.86;
    const w = 0.25;
    for (const sgn of [-1, 1]) {
      const a = sgn < 0 ? -2.5 : 0.5;
      const b = a + 2;
      g.detail(S.GEAR, a, b, 39.5 - w, 39.5, z0, z1).detail(S.GEAR, a, b, 37.5, 37.5 + w, z0, z1);
      g.detail(S.GEAR, a, a + w, 37.5 + w, 39.5 - w, z0, z1).detail(S.GEAR, b - w, b, 37.5 + w, 39.5 - w, z0, z1);
      g.detail(S.GLINT, b - w - 0.22, b - w - 0.04, 39.5 - w - 0.22, 39.5 - w - 0.04, z0, z0 + 0.04, false);
      const edge = sgn * 2.5;
      const out = sgn * 3.62;
      g.detail(S.GEAR, Math.min(edge, out), Math.max(edge, out), 38.8, 39.05, z0, z1);
      g.detail(S.GEAR, Math.min(out, sgn * 3.5), Math.max(out, sgn * 3.5), 38.8, 39.05, 0.2, z0);
    }
    g.detail(S.GEAR, -0.5, 0.5, 38.75, 39, z0, z1);
  }
  return g;
}

/**
 * Faces as pixel art on a 14 x 14 grid of half-voxel pixels across the front
 * of the skull; these rows cover columns 2-11 and rows 10 down to 1 (row 0
 * is the chin). e eye, w eye with a glint, b brow, m mouth, t teeth,
 * k blush, l eyelid, g tired shadow.
 */
const FACE_ART: Record<Expression, readonly string[]> = {
  neutral: [
    '..........',
    '.bbb..bbb.',
    '..........',
    '.we....we.',
    '.ee....ee.',
    '..........',
    '..........',
    '..........',
    '...mmmm...',
    '..........',
  ],
  angry: [
    'b........b',
    '.bb....bb.',
    '...b..b...',
    '.ee....ee.',
    '.ee....ee.',
    '..........',
    '..........',
    '...mmmm...',
    '..m....m..',
    '..........',
  ],
  happy: [
    '.bbb..bbb.',
    '..........',
    '..........',
    '.we....we.',
    '.ee....ee.',
    '..........',
    '.m......m.',
    '..mttttm..',
    '...mmmm...',
    '..........',
  ],
  smug: [
    '.......bb.',
    '.bbb.....b',
    '..........',
    '.ll....ll.',
    '.ee....ee.',
    '..........',
    '..........',
    '........m.',
    '...mmmmm..',
    '..........',
  ],
  kind: [
    '..........',
    '.bbb..bbb.',
    '..........',
    '.ee....ee.',
    'e..e..e..e',
    'kk......kk',
    '..........',
    '..m....m..',
    '...mmmm...',
    '..........',
  ],
  stern: [
    '..........',
    '..........',
    'bbbb..bbbb',
    '.ee....ee.',
    '.ee....ee.',
    '..........',
    '..........',
    '..........',
    '..mmmmmm..',
    '..........',
  ],
  tired: [
    '..........',
    '..........',
    '.bb....bb.',
    'bll....llb',
    '.ee....ee.',
    '.gg....gg.',
    '..........',
    '....mm....',
    '....mm....',
    '..........',
  ],
};

const FACE_INK: Readonly<Record<string, number>> = {
  e: S.EYE, w: S.EYE, b: S.BROW, m: S.MOUTH, t: S.WHITE, k: S.BLUSH, l: S.SKIN_SHADE, g: S.BAG,
};

/** How far each kind of face pixel stands proud of the skin, in voxels. */
const FACE_RELIEF: Readonly<Record<string, number>> = { b: 0.24, e: 0.14, w: 0.14, l: 0.12, g: 0.06, k: 0.05, m: 0.1, t: 0.12 };

function sculptFace(expr: Expression): Vox {
  const g = new Vox(0, 0, 0, 0, 0, 0);
  const rows = FACE_ART[expr];
  rows.forEach((row, r) => {
    const vv = 10 - r;
    for (let c = 0; c < row.length; ) {
      const ch = row[c] ?? '.';
      let len = 1;
      while (row[c + len] === ch) len++;
      const s = FACE_INK[ch];
      if (s !== undefined) {
        const u = c + 2;
        const x0 = -3.5 + u * 0.5;
        const y0 = 35 + vv * 0.5;
        const z1 = 3.5 + (FACE_RELIEF[ch] ?? 0.1);
        g.detail(s, x0, x0 + len * 0.5, y0, y0 + 0.5, 3.5, z1, false);
        // A small catch-light in the upper corner of each eye.
        if (ch === 'w') g.detail(S.GLINT, x0 + 0.06, x0 + 0.28, y0 + 0.22, y0 + 0.44, z1, z1 + 0.03, false);
      }
      c += len;
    }
  });
  return g;
}

// ---------------------------------------------------------------- caches

/** Part ids, for looking up the neighbours whose shadow a part catches. */
const LEG_L = 0;
const LEG_R = 1;
const TORSO = 2;
const ARM_L = 3;
const ARM_R = 4;
const HEAD = 5;
const FACE = 6;

/** Where each part hangs from, in metres. */
function pivotOf(part: number): [number, number, number] {
  switch (part) {
    case LEG_L: return [-0.1, 0.92, 0];
    case LEG_R: return [0.1, 0.92, 0];
    case ARM_L: return [-0.228, 1.49, 0];
    case ARM_R: return [0.228, 1.49, 0];
    case HEAD:
    case FACE: return [0, 1.63, 0];
    default: return [0, 0, 0];
  }
}

let canon: Vox[] | null = null;

/** Plain parts, standing: what each part's occlusion sees of its neighbours. */
function canonical(): Vox[] {
  canon ??= [
    sculptLeg(-1), sculptLeg(1),
    sculptTorso({ tie: false, suit: false, lanyard: false, cardigan: false, backpack: false, hoodie: false, portly: false }),
    sculptArm(-1), sculptArm(1),
    sculptHead({ style: 'bald', glasses: false, headset: false, beard: false, variant: 0 }),
  ];
  return canon;
}

const shapes = new Map<string, Shape>();

function shapeOf(key: string, part: number, sculpt: () => Vox): Shape {
  const hit = shapes.get(key);
  if (hit !== undefined) return hit;
  const g = sculpt();
  const [px, py, pz] = pivotOf(part);
  const q = new Quads(px, py, pz);
  if (part !== FACE) {
    const others = canonical().filter((_, n) => n !== part);
    meshVoxels(g, (i, j, k) => g.get(i, j, k) !== 0 || others.some((o) => o.get(i, j, k) !== 0), q);
  }
  meshFine(g.fine, q);
  const shape = finish(q);
  shapes.set(key, shape);
  return shape;
}

const coloured = new Map<string, THREE.BufferGeometry>();
/** The brightest a painted voxel gets (linear): white shirts stay cloth, not lamps. */
const WHITEST = 0.84;
const tmpC = new THREE.Color();

/** A part in an outfit's colours: shares the shape's buffers, owns its colours. */
function paintShape(key: string, shape: Shape, pal: readonly number[]): THREE.BufferGeometry {
  let ck = key;
  for (const s of shape.used) ck += `|${(pal[s] ?? 0).toString(36)}`;
  const hit = coloured.get(ck);
  if (hit !== undefined) return hit;
  const n = shape.slots.length;
  const col = new Float32Array(n * 3);
  // Palette in linear light, once per slot rather than per vertex.
  const lin = new Float32Array(SLOT_COUNT * 3);
  for (const s of shape.used) {
    tmpC.setHex(pal[s] ?? 0);
    lin[s * 3] = tmpC.r;
    lin[s * 3 + 1] = tmpC.g;
    lin[s * 3 + 2] = tmpC.b;
  }
  for (let v = 0; v < n; v++) {
    const s = shape.slots[v] ?? 0;
    const l = shape.light[v] ?? 1;
    col[v * 3] = Math.min(WHITEST, (lin[s * 3] ?? 0) * l);
    col[v * 3 + 1] = Math.min(WHITEST, (lin[s * 3 + 1] ?? 0) * l);
    col[v * 3 + 2] = Math.min(WHITEST, (lin[s * 3 + 2] ?? 0) * l);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', shape.position);
  g.setAttribute('normal', shape.normal);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(shape.index);
  g.boundingSphere = shape.sphere.clone();
  g.userData.cached = true;
  coloured.set(ck, g);
  return g;
}

// ---------------------------------------------------------------- colours

function channels(c: number): [number, number, number] {
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

function luminance(c: number): number {
  const [r, g, b] = channels(c);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function mix(a: number, b: number, t: number): number {
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
}

function darker(c: number, k: number): number {
  return mix(0, c, k);
}

/** A trim colour that shows against its base: darker, unless the base is nearly black. */
function trim(c: number, k = 0.68): number {
  return luminance(c) > 0.16 ? darker(c, k) : mix(c, 0xffffff, (1 - k) * 0.6);
}

/** Shoes when the outfit names none: polish with a suit, otherwise a mix. */
function defaultShoes(o: Outfit): number {
  if (o.tie !== undefined && luminance(o.top) < 0.35) return 0x1d1917;
  const pick = [0x2a211c, 0x5b3a24, 0x39404c, 0xd9d4ca];
  return pick[((o.top >>> 4) ^ (o.legs >>> 2) ^ o.skin) & 3] ?? 0x2a211c;
}

const palettes = new WeakMap<Outfit, number[]>();

/** Every slot's colour for one outfit. */
function paletteOf(o: Outfit): number[] {
  const hit = palettes.get(o);
  if (hit !== undefined) return hit;
  const p = new Array<number>(SLOT_COUNT).fill(0);
  const sleeve = o.cardigan ?? o.top;
  const shoes = o.shoes ?? defaultShoes(o);
  p[S.SKIN] = o.skin;
  p[S.SKIN_SHADE] = mix(darker(o.skin, 0.66), 0x6a3a30, 0.15);
  p[S.HAIR] = o.hair;
  const lh = luminance(o.hair);
  p[S.BROW] = lh > 0.85 ? darker(o.hair, 0.8) : lh > 0.45 ? darker(o.hair, 0.5) : darker(o.hair, 0.7);
  p[S.TOP] = o.top;
  p[S.TOP_DARK] = trim(o.top, 0.74);
  p[S.SEAM] = trim(o.top, 0.86);
  p[S.SLEEVE] = sleeve;
  p[S.SLEEVE_DARK] = trim(sleeve, 0.74);
  p[S.LEGS] = o.legs;
  p[S.LEGS_DARK] = trim(o.legs, 0.7);
  p[S.SHOE] = shoes;
  p[S.SOLE] = luminance(shoes) > 0.5 ? darker(shoes, 0.78) : luminance(shoes) < 0.15 ? 0x4a4038 : darker(shoes, 0.55);
  p[S.TIE] = o.tie ?? 0;
  p[S.TIE_DARK] = darker(o.tie ?? 0, 0.72);
  p[S.LANYARD] = o.lanyard ?? 0;
  p[S.BADGE] = 0xf4f3ee;
  p[S.INK] = 0x55606e;
  p[S.CARDI] = o.cardigan ?? 0;
  p[S.CARDI_DARK] = trim(o.cardigan ?? 0, 0.66);
  p[S.PACK] = o.backpack ?? 0;
  p[S.PACK_DARK] = trim(o.backpack ?? 0, 0.62);
  p[S.BEARD] = o.beard ?? o.hair;
  p[S.GEAR] = 0x1c1c21;
  p[S.GEAR_HI] = 0x50505a;
  const dark = luminance(o.skin) < 0.4;
  p[S.EYE] = dark ? 0x0b0706 : 0x1a120e;
  p[S.WHITE] = 0xf1eee6;
  p[S.GLINT] = 0xdfe7ee;
  p[S.MOUTH] = dark ? 0x2e0e10 : 0x5e1f22;
  p[S.BLUSH] = mix(o.skin, 0xff5a5a, 0.32);
  p[S.BAG] = dark ? mix(darker(o.skin, 0.55), 0x3a2050, 0.35) : mix(darker(o.skin, 0.7), 0x6a4a96, 0.4);
  p[S.HAT] = 0xc4262b;
  p[S.HAT_DARK] = 0x8e1a1f;
  p[S.FUR] = 0xf6f3ec;
  p[S.BUCKLE] = 0xc8b27a;
  p[S.SHIRT] = 0xf2f0ea;
  palettes.set(o, p);
  return p;
}

function faceGeometry(expr: Expression, pal: readonly number[]): THREE.BufferGeometry {
  const key = `face:${expr}`;
  return paintShape(key, shapeOf(key, FACE, () => sculptFace(expr)), pal);
}

/** Kept for the HUD portrait: a 16x16 pixel face. */
export function faceTexture(skin: number, expr: Expression, glasses: boolean): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (g === null) return null;
  g.fillStyle = `#${skin.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 16, 16);
  g.fillStyle = '#1a1410';
  g.fillRect(4, 6, 2, 2);
  g.fillRect(10, 6, 2, 2);
  if (glasses) {
    g.strokeStyle = '#111';
    g.strokeRect(2.5, 5.5, 4, 3);
    g.strokeRect(9.5, 5.5, 4, 3);
  }
  g.fillStyle = '#6a1f1f';
  g.fillRect(6, expr === 'happy' || expr === 'kind' ? 11 : 12, 4, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- shadows

let shadowMat: THREE.MeshBasicMaterial | null = null;
let blobsOn = true;

/** With real shadows on, the painted blob shadows step aside. */
export function setBlobShadows(on: boolean): void {
  blobsOn = on;
  if (shadowMat !== null) shadowMat.visible = on;
}

/** Everything in a rig casts a real shadow (except its blob). */
export function castShadows(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.blob !== true) o.castShadow = true;
  });
}
const shadowGeo = new THREE.PlaneGeometry(1, 1);

export function blobShadow(size = 0.95): THREE.Mesh | null {
  if (typeof document === 'undefined') return null;
  if (shadowMat === null) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const g = c.getContext('2d');
    if (g === null) return null;
    const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    shadowMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false });
  }
  const m = new THREE.Mesh(shadowGeo, shadowMat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.scale.set(size, size, 1);
  m.renderOrder = 1;
  m.userData.shared = true;
  m.userData.blob = true;
  m.visible = blobsOn;
  return m;
}

// ---------------------------------------------------------------- the rig

export function buildRig(o: Outfit): Rig {
  const pal = paletteOf(o);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  const style = o.hairStyle ?? 'short';
  const mesh = (key: string, part: number, sculpt: () => Vox, parent: THREE.Object3D): THREE.Mesh => {
    const m = new THREE.Mesh(paintShape(key, shapeOf(key, part, sculpt), pal), mat);
    // Cached geometry belongs to every rig wearing it: disposal leaves it be.
    m.userData.shared = true;
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shadow = blobShadow();
  if (shadow !== null) root.add(shadow);

  const legs: THREE.Group[] = [];
  for (const side of [-1, 1] as const) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, 0.92, 0);
    // A hair narrower than drawn, so the hidden top never shares a plane with the hips.
    mesh(`leg${side}`, side < 0 ? LEG_L : LEG_R, () => sculptLeg(side), leg).scale.set(0.98, 1, 0.98);
    body.add(leg);
    legs.push(leg);
  }

  const t: TorsoOpts = {
    tie: o.tie !== undefined,
    suit: o.tie !== undefined && luminance(o.top) < 0.35,
    lanyard: o.lanyard !== undefined,
    cardigan: o.cardigan !== undefined,
    backpack: o.backpack !== undefined,
    hoodie: style === 'hood',
    portly: (o.scale ?? 1) >= 1.12,
  };
  mesh(`torso${+t.tie}${+t.suit}${+t.lanyard}${+t.cardigan}${+t.backpack}${+t.hoodie}${+t.portly}`, TORSO, () => sculptTorso(t), body);

  const arms: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.228, 1.49, 0);
    mesh(`arm${side}`, side < 0 ? ARM_L : ARM_R, () => sculptArm(side), arm);
    if (side === 1) {
      hand = new THREE.Group();
      hand.position.set(0.0, -0.56, 0.03);
      arm.add(hand);
    }
    body.add(arm);
    arms.push(arm);
  }

  const head = new THREE.Group();
  head.position.set(0, 1.63, 0);
  // Which way the fringe falls follows from their colours, so a crowd is not all one haircut.
  const variant = ((o.hair >>> 3) ^ (o.skin >>> 5) ^ (o.top >>> 7)) & 1 ? 1 : 0;
  const h: HeadOpts = { style, glasses: o.glasses === true, headset: o.headset === true, beard: o.beard !== undefined, variant };
  mesh(`head:${style}${+h.glasses}${+h.headset}${+h.beard}${variant}`, HEAD, () => sculptHead(h), head);
  const expression = o.face ?? 'neutral';
  const face = new THREE.Mesh(faceGeometry(expression, pal), mat);
  face.userData.shared = true;
  head.add(face);
  body.add(head);

  root.scale.setScalar((o.scale ?? 1) * (style === 'tonttu' ? 0.6 : 1));
  const [legL, legR] = legs as [THREE.Group, THREE.Group];
  const [armL, armR] = arms as [THREE.Group, THREE.Group];
  return { root, body, head, armL, armR, legL, legR, hand, materials: [mat], faceMat: mat, face, outfit: o, expression, phase: 0, glow: 0 };
}

/** Change mood: swaps in the cached face mesh, nothing else is rebuilt. */
export function setExpression(rig: Rig, expr: Expression): void {
  if (rig.expression === expr) return;
  rig.expression = expr;
  rig.face.geometry = faceGeometry(expr, paletteOf(rig.outfit));
}

/** Advance the walk cycle by `speed` (m/s) over `dt`. */
export function animateRig(rig: Rig, speed: number, dt: number, attacking = 0): void {
  rig.phase += dt * (3 + speed * 2.2);
  const amp = Math.min(0.8, speed * 0.22);
  const s = Math.sin(rig.phase);
  rig.legL.rotation.x = s * amp;
  rig.legR.rotation.x = -s * amp;
  rig.armL.rotation.x = -s * amp * 0.8;
  rig.armL.rotation.z = -0.06;
  rig.armR.rotation.x = attacking > 0 ? -1.6 + attacking * 1.6 : s * amp * 0.8;
  rig.armR.rotation.z = 0.06;
  rig.body.position.y = Math.abs(Math.cos(rig.phase)) * amp * 0.08;
  // Breathing, and a little sway of the shoulders when they walk.
  rig.body.scale.y = speed < 0.1 ? 1 + Math.sin(rig.phase * 0.5) * 0.012 : 1;
  rig.body.rotation.y = s * amp * 0.08;
}

/** Flash every material a colour (hit feedback). */
export function tintRig(rig: Rig, color: number, amount: number): void {
  for (const m of rig.materials) {
    if (amount > 0) m.emissive.setHex(color).multiplyScalar(amount);
    else m.emissive.setHex(rig.glow);
  }
}

export function disposeRig(rig: Rig): void {
  for (const m of rig.materials) m.dispose();
}

export const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
export const HAIRS = [0x2b1b0e, 0x6b4423, 0xd8b36a, 0x111111, 0x8a8a8a, 0xa0522d];
export const SHIRTS = [0x8fb3d9, 0xffffff, 0xd9c28f, 0x9fd98f, 0xd98fb3, 0xb3a3d9, 0xe0e0e0];
export const TROUSERS = [0x2e3440, 0x3b3b3b, 0x4a4036, 0x1f2a44];
