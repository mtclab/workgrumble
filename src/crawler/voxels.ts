import * as THREE from 'three';

/**
 * The voxel kit behind the office people, Musti and your own first-person
 * arm. A model is sculpted cell by cell on one lattice, greedy-meshed into
 * flat quads, and painted through vertex colours that carry the light a
 * voxel artist would paint in: ambient occlusion in every crease, a gentle
 * top-lit gradient and a little grain in cloth, knitwear, hair and fur.
 *
 * A meshed shape remembers palette slots rather than colours, so one shape
 * serves every colour scheme that wears it; each scheme only adds a colour
 * buffer. Everything handed out here is cached and shared: see `paintShape`.
 */

/** Edge of one voxel, in metres: a person is about forty of them tall. */
export const V = 0.045;

/** How a slot's colour varies voxel to voxel. */
export const GRAIN = { SMOOTH: 0, CLOTH: 1, HAIR: 2, KNIT: 3 } as const;

/** Brightness of each grain's tones (tone 0 is the plain colour). */
const TONE: readonly (readonly number[])[] = [
  [1, 1, 1, 1],
  // Cloth: an occasional thread a shade off, a hint of weave rather than a pattern.
  [1, 1.03, 0.965, 1],
  [1, 1.1, 0.88, 0.78],
  // Knitwear: ribs, alternate columns a little darker.
  [1, 0.9, 1, 1],
];

/** Light left at a vertex with 0..3 open neighbours (strong, as painted). */
const AO = [0.46, 0.64, 0.82, 1];
/** Extra shade for a face that looks into a one-voxel gap. */
const CAVITY = 0.8;

/** A deterministic 0..1 hash of a cell (the repo bans Math.random). */
export function hash(i: number, j: number, k: number, s: number): number {
  let h = Math.imul(i + 0x9e37, 0x85ebca6b) ^ Math.imul(j + 0x7f4a, 0xc2b2ae35) ^ Math.imul(k + 0x3c6e, 0x27d4eb2f) ^ Math.imul(s + 1, 0x165667b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** The tone (0..3) a voxel of `slot` is painted in, for its grain. */
function toneOf(grain: number, slot: number, i: number, j: number, k: number): number {
  switch (grain) {
    case GRAIN.CLOTH: {
      const h = hash(i, j, k, slot);
      return h < 0.86 ? 0 : h < 0.93 ? 1 : 2;
    }
    case GRAIN.HAIR: {
      // Hair and fur run in strands: a column keeps its tone for a couple of cells.
      const h = hash(i, j >> 1, k, 7);
      return h < 0.45 ? 0 : h < 0.72 ? 1 : h < 0.92 ? 2 : 3;
    }
    case GRAIN.KNIT:
      return (i + k) & 1;
    default:
      return 0;
  }
}

/** A box of fine detail (a face pixel, a glasses frame) in lattice units. */
interface Fine {
  readonly s: number;
  readonly x0: number; readonly x1: number;
  readonly y0: number; readonly y1: number;
  readonly z0: number; readonly z1: number;
  /** False for a decal lying flat on a surface: its back face is never seen. */
  readonly back: boolean;
}

/**
 * A block of voxels in lattice coordinates: cell (i, j, k) spans x in
 * [i - 0.5, i + 0.5], y in [j, j + 1] and z in [k - 0.5, k + 0.5] voxels, so
 * odd widths and depths sit symmetric about the model's centre line. A cell
 * holds a palette slot (1..63); 0 is empty.
 */
export class Vox {
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

  /** Recolour the rearmost (-z) filled cell of column (i, j). */
  back(s: number, i: number, j: number): this {
    for (let k = this.z0; k < this.z0 + this.nz; k++) {
      if (this.get(i, j, k) !== 0) return this.set(i, j, k, s);
    }
    return this;
  }

  /**
   * Grow a one-cell layer of `s` over the cells whose slot `onto` accepts,
   * into the empty cells `where` allows. Only face neighbours count, so a
   * layer over a chamfered block keeps its chamfer (hair over a skull).
   */
  grow(s: number, onto: (slot: number) => boolean, where: (i: number, j: number, k: number) => boolean): this {
    const add: number[] = [];
    const on = (i: number, j: number, k: number): boolean => {
      const t = this.get(i, j, k);
      return t !== 0 && onto(t);
    };
    for (let k = this.z0; k < this.z0 + this.nz; k++) {
      for (let j = this.y0; j < this.y0 + this.ny; j++) {
        for (let i = this.x0; i < this.x0 + this.nx; i++) {
          if (this.get(i, j, k) !== 0 || !where(i, j, k)) continue;
          if (on(i - 1, j, k) || on(i + 1, j, k) || on(i, j - 1, k) || on(i, j + 1, k) || on(i, j, k - 1) || on(i, j, k + 1)) add.push(i, j, k);
        }
      }
    }
    for (let n = 0; n < add.length; n += 3) this.set(add[n] ?? 0, add[n + 1] ?? 0, add[n + 2] ?? 0, s);
    return this;
  }

  /** Where the front (+z) surface of column (i, j) lies, in lattice units. */
  frontAt(i: number, j: number): number {
    for (let k = this.z0 + this.nz - 1; k >= this.z0; k--) if (this.get(i, j, k) !== 0) return k + 0.5;
    return this.z0 - 0.5;
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

const CORNER_ORDER_POS = [0, 1, 2, 3] as const;
const CORNER_ORDER_NEG = [0, 3, 2, 1] as const;
const FLAT = [1, 1, 1, 1] as const;

/** Quads collected for one part, in metres about its pivot. */
class Quads {
  readonly pos: number[] = [];
  readonly nrm: number[] = [];
  readonly slot: number[] = [];
  readonly light: number[] = [];
  readonly idx: number[] = [];

  constructor(private readonly pivot: readonly [number, number, number], private readonly top: number) {}

  /** The painted top-lit gradient: the bottom a little dim, the top bright. */
  private gradient(y: number): number {
    return 0.8 + 0.22 * Math.min(1, Math.max(0, y / this.top));
  }

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
      this.pos.push(x - this.pivot[0], y - this.pivot[1], z - this.pivot[2]);
      this.nrm.push(d === 0 ? dir : 0, d === 1 ? dir : 0, d === 2 ? dir : 0);
      this.slot.push(s);
      this.light.push((lights[c] ?? 1) * this.gradient(y));
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

/** A lattice cell lookup (a neighbouring part's block, or the part's own). */
export type Occupied = (i: number, j: number, k: number) => boolean;

/**
 * Greedy-mesh a voxel block: hidden faces culled, coplanar neighbours with the
 * same slot, tone and corner occlusion merged into one quad.
 */
function meshVoxels(g: Vox, occ: Occupied, grain: ArrayLike<number>, q: Quads): void {
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
                const tone = toneOf(grain[slot] ?? 0, slot, i, j, k);
                key = 1 + (slot | (tone << 6) | (packed << 8) | (cav << 16));
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
            const tone = TONE[grain[slot] ?? 0]?.[(raw >> 6) & 3] ?? 1;
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

/** A meshed part before colouring: position, normal and index buffers every colour scheme shares. */
export interface Shape {
  readonly position: THREE.BufferAttribute;
  readonly normal: THREE.BufferAttribute;
  readonly index: THREE.BufferAttribute;
  readonly slots: Uint8Array;
  readonly light: Float32Array;
  /** The palette slots it uses, for its colour cache key. */
  readonly used: readonly number[];
  readonly sphere: THREE.Sphere;
  readonly triangles: number;
}

export interface MeshOpts {
  /** Where the part hangs from, in metres: positions come out relative to it. */
  readonly pivot: readonly [number, number, number];
  /** Each slot's grain (GRAIN.*); slots not listed are smooth. */
  readonly grain: ArrayLike<number>;
  /** Height of the model, for the top-lit gradient (metres). */
  readonly top: number;
  /**
   * What else shades this part (its neighbours when the model stands at
   * rest); the part's own cells always count. Leave out for none.
   */
  readonly neighbours?: Occupied;
  /** Mesh the voxels (true) or only the fine detail (false, for decals). */
  readonly voxels?: boolean;
}

/** Mesh a sculpted block, voxels and fine detail, into a colourless shape. */
export function meshShape(g: Vox, o: MeshOpts): Shape {
  const q = new Quads(o.pivot, o.top);
  if (o.voxels !== false) {
    const nb = o.neighbours;
    meshVoxels(g, nb === undefined ? (i, j, k) => g.get(i, j, k) !== 0 : (i, j, k) => g.get(i, j, k) !== 0 || nb(i, j, k), o.grain, q);
  }
  meshFine(g.fine, q);
  const position = new THREE.BufferAttribute(new Float32Array(q.pos), 3);
  const normal = new THREE.BufferAttribute(new Float32Array(q.nrm), 3);
  const count = q.pos.length / 3;
  const index = count > 65535 ? new THREE.BufferAttribute(new Uint32Array(q.idx), 1) : new THREE.BufferAttribute(new Uint16Array(q.idx), 1);
  const used = [...new Set(q.slot)].sort((a, b) => a - b);
  const bounds = new THREE.BufferGeometry();
  bounds.setAttribute('position', position);
  bounds.computeBoundingSphere();
  const sphere = bounds.boundingSphere?.clone() ?? new THREE.Sphere();
  return { position, normal, index, slots: new Uint8Array(q.slot), light: new Float32Array(q.light), used, sphere, triangles: q.idx.length / 3 };
}

// ---------------------------------------------------------------- colour

const albedos = new Map<number, readonly [number, number, number]>();
const tmp = new THREE.Color();

/**
 * The colour a voxel is painted, in linear light. Bright colours roll off
 * above a knee so a white shirt or a pale face under a ceiling lamp stays
 * cloth and skin rather than a light source: greys and whites are pressed
 * hardest, saturated colours only near the top, and nothing reaches 1.
 */
export function albedo(hex: number): readonly [number, number, number] {
  let c = albedos.get(hex);
  if (c === undefined) {
    tmp.setHex(hex);
    const hi = Math.max(tmp.r, tmp.g, tmp.b);
    const lo = Math.min(tmp.r, tmp.g, tmp.b);
    const sat = hi > 0 ? (hi - lo) / hi : 0;
    const t = Math.min(1, sat / 0.6);
    const knee = 0.5 + 0.2 * t;
    const ceiling = 0.8 + 0.18 * t;
    const out = hi <= knee ? hi : knee + (hi - knee) / (1 + (hi - knee) / (ceiling - knee));
    const k = hi > 0 ? out / hi : 1;
    c = [tmp.r * k, tmp.g * k, tmp.b * k];
    albedos.set(hex, c);
  }
  return c;
}

const coloured = new Map<string, THREE.BufferGeometry>();

/**
 * A shape in one palette's colours (slot -> hex), cached under `key` plus the
 * colours it uses.
 *
 * The shared-buffer rule: every colour variant of a shape reuses the shape's
 * position, normal and index attributes and only owns its colour buffer, and
 * every geometry returned here is cached for the whole session. So a mesh
 * that shows one must be marked `userData.shared` (disposeTree skips those)
 * and none may ever be disposed: freeing one variant would delete GL buffers
 * that its siblings are still drawing with.
 */
export function paintShape(key: string, shape: Shape, pal: ArrayLike<number>): THREE.BufferGeometry {
  let ck = key;
  for (const s of shape.used) ck += `|${(pal[s] ?? 0).toString(36)}`;
  const hit = coloured.get(ck);
  if (hit !== undefined) return hit;
  const n = shape.slots.length;
  const col = new Float32Array(n * 3);
  // Albedo once per slot rather than per vertex.
  const lin = new Float32Array(64 * 3);
  for (const s of shape.used) {
    const [r, g, b] = albedo(pal[s] ?? 0);
    lin[s * 3] = r;
    lin[s * 3 + 1] = g;
    lin[s * 3 + 2] = b;
  }
  for (let v = 0; v < n; v++) {
    const s = shape.slots[v] ?? 0;
    const l = shape.light[v] ?? 1;
    col[v * 3] = Math.min(1, (lin[s * 3] ?? 0) * l);
    col[v * 3 + 1] = Math.min(1, (lin[s * 3 + 1] ?? 0) * l);
    col[v * 3 + 2] = Math.min(1, (lin[s * 3 + 2] ?? 0) * l);
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

/** Where lit colour starts to roll off, and what it never passes (linear, before exposure). */
const KNEE = 0.55;
const CEILING = 0.8;

/**
 * The lit colour of a voxel model rolls off softly toward a ceiling just
 * under the bloom threshold, so a white shirt or a pale face under a ceiling
 * lamp or your carry light keeps its painted shading instead of glowing.
 * Emissive (a hit flash, a clone's glow) is added after, untouched.
 */
const SOFT_LIGHT = /* glsl */ `
	vec3 litLight = totalDiffuse + totalSpecular;
	float litPeak = max( max( litLight.r, litLight.g ), litLight.b );
	if ( litPeak > ${KNEE.toFixed(3)} ) {
		float over = litPeak - ${KNEE.toFixed(3)};
		litLight *= ( ${KNEE.toFixed(3)} + over / ( 1.0 + over / ${(CEILING - KNEE).toFixed(3)} ) ) / litPeak;
	}
	vec3 outgoingLight = litLight + totalEmissiveRadiance;`;

function softLight(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.fragmentShader = shader.fragmentShader.replace('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;', SOFT_LIGHT);
}

/** The one material a voxel model needs: its colours are in the vertices. */
export function voxelMaterial(): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = softLight;
  m.customProgramCacheKey = () => 'voxel-soft-light';
  return m;
}
