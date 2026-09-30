import * as THREE from 'three';
import { GRAIN, hash, meshShape, type Occupied, paintShape, type Shape, Vox, voxelMaterial } from './voxels';

/**
 * Office people as hand-built voxel figures, in the spirit of Cube World and
 * MagicaVoxel: chunky and crisp, heads a little big, faces bold pixel art
 * that reads across a room. Each part (a leg, an arm, the torso, the head)
 * is sculpted cell by cell on the voxel kit's 4.5 cm lattice (voxels.ts) and
 * shaded by its neighbours as they stand, so armpits, the crotch and the
 * underside of the chin are dark. Faces are half-size voxels on the front of
 * the head, one small cached mesh per mood. Shapes are cached per option set
 * and only recoloured per outfit, so a crowd costs a few groups each.
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

// ---------------------------------------------------------------- palette slots

/**
 * What a voxel is made of. The outfit decides each slot's colour, so one
 * sculpted shape serves every colour scheme that wears it.
 */
const S = {
  SKIN: 1, SKIN_SHADE: 2, HAIR: 3, BROW: 4, TOP: 5, TOP_DARK: 6, SLEEVE: 7, SLEEVE_DARK: 8,
  LEGS: 9, LEGS_DARK: 10, SHOE: 11, SOLE: 12, TIE: 13, TIE_DARK: 14, LANYARD: 15, BADGE: 16,
  INK: 17, CARDI: 18, CARDI_DARK: 19, PACK: 20, PACK_DARK: 21, BEARD: 22, GEAR: 23, GEAR_HI: 24,
  EYE: 25, WHITE: 26, MOUTH: 27, BLUSH: 28, BAG: 29, HAT: 30, HAT_DARK: 31, FUR: 32,
  BUCKLE: 33, SHIRT: 34, GLINT: 35, SEAM: 36, LID: 37, PHOTO: 38, BUTTON: 39,
} as const;
const SLOT_COUNT = 40;

/** Each slot's grain: cloth has a hint of weave, knitwear ribs, hair runs in strands. */
const GRAINS = new Uint8Array(SLOT_COUNT);
for (const s of [S.TOP, S.TOP_DARK, S.SEAM, S.SLEEVE, S.SLEEVE_DARK, S.LEGS, S.LEGS_DARK, S.PACK, S.PACK_DARK, S.HAT, S.SHIRT]) GRAINS[s] = GRAIN.CLOTH;
for (const s of [S.CARDI, S.CARDI_DARK]) GRAINS[s] = GRAIN.KNIT;
for (const s of [S.HAIR, S.BEARD, S.FUR]) GRAINS[s] = GRAIN.HAIR;

// ---------------------------------------------------------------- the figure

/** Key heights, in lattice rows (row j spans j..j+1 voxels up from the floor). */
const HIP = 18;
const BELT = 21;
const WAIST = 22;
const SHOULDER = 33;
/** The chin: the head is seven rows from here up, the crown rounding over. */
const CHIN = 35;

/** The figure's height for the top-lit gradient, in metres. */
const TALL = 1.9;

type Side = -1 | 1;

/** One leg: a trouser leg on a sturdy two-tone shoe that splays a little outward. */
function sculptLeg(side: Side): Vox {
  const xa = side < 0 ? -3 : 1;
  const xb = side < 0 ? -1 : 3;
  const g = new Vox(xa - 2, xb + 2, 0, BELT, -3, 4);
  g.box(S.LEGS, xa, xb, 2, BELT - 1, -2, 1);
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

/** One arm: a sleeve with a cuff, a rounded shoulder, a sturdy fist with a thumb. */
function sculptArm(side: Side, knit: boolean): Vox {
  const xa = side < 0 ? -6 : 4;
  const xb = side < 0 ? -4 : 6;
  const inner = side < 0 ? xb : xa;
  const outer = side < 0 ? xa : xb;
  const g = new Vox(xa - 1, xb + 1, 17, SHOULDER + 2, -3, 3);
  g.box(knit ? S.CARDI : S.SLEEVE, xa, xb, WAIST, SHOULDER, -1, 1);
  g.set(outer, SHOULDER, -1, 0).set(outer, SHOULDER, 1, 0);
  g.box(knit ? S.CARDI_DARK : S.SLEEVE_DARK, xa, xb, WAIST, WAIST, -1, 1);
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
  /** A tonttu's plain woollen tunic: no buttons, no pockets. */
  readonly tunic: boolean;
}

/**
 * A fine decal on the front of a part (a button, a pocket, a strap): it
 * stands `d` proud of whatever surface is under its middle.
 */
function decal(g: Vox, s: number, x0: number, x1: number, y0: number, y1: number, d: number): void {
  const z = g.frontAt(Math.round((x0 + x1) / 2), Math.floor((y0 + y1) / 2));
  g.detail(s, x0, x1, y0, y1, z, z + d);
}

/** Hips, belt, shirt and neck (seven cells across), with whatever they wear over them. */
function sculptTorso(t: TorsoOpts): Vox {
  const g = new Vox(-6, 6, 16, 36, -8, 6);
  // Hips, a belt with a buckle, back pockets.
  g.box(S.LEGS, -3, 3, HIP, BELT, -2, 2, 1);
  g.paint(S.LEGS_DARK, -3, 3, BELT, BELT, -2, 2);
  g.front(S.BUCKLE, 0, BELT);
  g.paint(S.LEGS_DARK, -2, -1, 19, 19, -2, -2).paint(S.LEGS_DARK, 1, 2, 19, 19, -2, -2);
  // The shirt: a rounded block, the chest and shoulder blades a cell prouder.
  g.box(S.TOP, -3, 3, WAIST, SHOULDER, -2, 2, 1);
  g.box(S.TOP, -2, 2, 26, SHOULDER, 3, 3);
  g.set(-2, 26, 3, 0).set(2, 26, 3, 0);
  g.box(S.TOP, -2, 2, 28, 32, -3, -3);
  g.set(-2, 28, -3, 0).set(2, 28, -3, 0);
  if (t.portly) {
    // A paunch pushing the shirt and the belt out a cell.
    g.box(S.TOP, -2, 2, WAIST, 26, 3, 3).set(-2, WAIST, 3, 0).set(2, WAIST, 3, 0);
    g.box(S.TOP, -1, 1, 23, 25, 4, 4);
    g.box(S.LEGS_DARK, -1, 1, BELT, BELT, 3, 3);
    g.front(S.BUCKLE, 0, BELT);
  }
  // Shoulder seams and a neck.
  g.paint(S.TOP_DARK, -3, -3, SHOULDER, SHOULDER, -1, 1).paint(S.TOP_DARK, 3, 3, SHOULDER, SHOULDER, -1, 1);
  g.box(S.SKIN, -1, 1, SHOULDER + 1, CHIN, -1, 1);
  // The collar: a ring round the neck, open at the throat.
  for (let i = -2; i <= 2; i++) {
    for (let k = -2; k <= 3; k++) if (Math.abs(i) === 2 || k === -2 || k >= 2) g.paint(S.TOP_DARK, i, i, SHOULDER, SHOULDER, k, k);
  }
  g.front(S.SKIN, 0, SHOULDER);

  if (t.suit) {
    // A jacket open in a V over a white shirt, with lapels and two buttons.
    for (let j = 29; j <= SHOULDER; j++) {
      const half = j >= 32 ? 1 : 0;
      for (let i = -half; i <= half; i++) g.front(S.SHIRT, i, j);
      g.front(S.TOP_DARK, -half - 1, j).front(S.TOP_DARK, half + 1, j);
    }
    for (const y of [25.35, 27.35]) decal(g, S.BUTTON, -0.17, 0.17, y, y + 0.34, 0.08);
  } else if (t.hoodie && !t.tie && !t.cardigan) {
    // A pouch across the belly and drawstrings from the hood.
    g.front(S.SEAM, -2, 25).front(S.SEAM, -1, 25).front(S.SEAM, 1, 25).front(S.SEAM, 2, 25);
    g.front(S.SEAM, -2, 24).front(S.SEAM, 2, 24).front(S.SEAM, -2, 23).front(S.SEAM, 2, 23);
    for (const x of [-0.8, 0.55]) {
      decal(g, S.SHIRT, x, x + 0.25, 30.4, SHOULDER + 0.95, 0.07);
      decal(g, S.BUTTON, x - 0.04, x + 0.29, 30.0, 30.45, 0.1);
    }
  } else if (!t.tie && !t.cardigan && !t.tunic) {
    // A button placket and a breast pocket.
    decal(g, S.SEAM, -0.14, 0.14, WAIST + 0.1, 25.95, 0.03);
    decal(g, S.SEAM, -0.14, 0.14, 26.05, SHOULDER - 0.05, 0.03);
    for (const y of [23.3, 26.4, 29.4, 32.2]) decal(g, S.BUTTON, -0.15, 0.15, y, y + 0.3, 0.07);
    if (!t.lanyard) {
      decal(g, S.TOP, 0.85, 2.1, 28.9, 30.1, 0.05);
      decal(g, S.SEAM, 0.85, 2.1, 29.92, 30.18, 0.07);
    }
  }
  if (t.tie) {
    // Knot at the collar, a blade down the front (inside the V on a suit).
    const bottom = t.suit ? 29 : 24;
    g.front(S.TIE_DARK, 0, SHOULDER);
    for (let j = bottom; j <= SHOULDER - 1; j++) g.front(S.TIE, 0, j);
    if (!t.suit) g.front(S.TIE_DARK, 0, 24);
    g.detail(S.TIE_DARK, -0.45, 0.45, 32.95, 33.9, 3.4, 3.78);
    if (!t.suit) g.front(S.TOP, -1, SHOULDER).front(S.TOP, 1, SHOULDER);
  }
  if (t.cardigan) {
    // Knitwear over everything but a V at the neck; it hangs over the belt,
    // with a ribbed hem, pockets and buttons down the front.
    const half = (j: number): number => (j >= 31 ? 1 : 0);
    for (let k = -3; k <= 4; k++) {
      for (let j = 20; j <= SHOULDER; j++) {
        for (let i = -5; i <= 5; i++) {
          const s = g.get(i, j, k);
          if (s === 0 || s === S.SKIN) continue;
          const open = k >= 2 && j >= 28 && Math.abs(i) <= half(j);
          if (!open) g.set(i, j, k, S.CARDI);
        }
      }
    }
    for (let j = 28; j <= SHOULDER; j++) g.front(S.CARDI_DARK, -half(j) - 1, j).front(S.CARDI_DARK, half(j) + 1, j);
    g.paint(S.CARDI_DARK, -3, 3, 20, 20, -2, 2);
    for (const y of [22.4, 24.4, 26.4]) decal(g, S.BUTTON, -0.17, 0.17, y, y + 0.34, 0.08);
    for (const x of [-2.35, 0.95]) decal(g, S.CARDI_DARK, x, x + 1.4, 23.9, 24.15, 0.06);
  }
  if (t.backpack) {
    // A pack with a pocket, a zip, a carry loop and straps over the shoulders.
    g.rbox(S.PACK, -2, 2, 23, 32, -5, -3, 1.2);
    g.rbox(S.PACK, -1, 1, 24, 27, -6, -6, 0.6);
    g.paint(S.PACK_DARK, -1, 1, 27, 27, -6, -6).paint(S.PACK_DARK, -2, 2, 30, 30, -5, -5);
    g.set(-1, SHOULDER, -4, S.PACK_DARK).set(1, SHOULDER, -4, S.PACK_DARK);
    g.box(S.PACK_DARK, -1, 1, SHOULDER + 1, SHOULDER + 1, -4, -4);
    for (const i of [-3, 3]) {
      g.paint(S.PACK_DARK, i, i, SHOULDER, SHOULDER, -2, 2);
      for (let j = 26; j <= 32; j++) g.front(S.PACK_DARK, i, j);
    }
  }
  if (t.lanyard) {
    // A cord round the back of the neck, over the collar and down the chest
    // to an ID badge: a coloured header, a photo, two lines of text.
    const y = SHOULDER + 1;
    g.detail(S.LANYARD, -1.62, 1.62, y, y + 0.32, -1.62, -1.5);
    for (const sgn of [-1, 1]) {
      g.detail(S.LANYARD, sgn < 0 ? -1.62 : 1.5, sgn < 0 ? -1.5 : 1.62, y, y + 0.32, -1.62, 1.2);
      g.detail(S.LANYARD, sgn < 0 ? -1.95 : 1.5, sgn < 0 ? -1.5 : 1.95, y - 0.02, y + 0.1, 1.1, 3.6);
      for (const [x, j] of [[1.72, 33], [1.42, 32], [1.08, 31], [0.74, 30]] as const) {
        const cx = sgn * x;
        decal(g, S.LANYARD, cx - 0.22, cx + 0.22, j, j + 1, 0.05);
      }
    }
    decal(g, S.BUCKLE, -0.35, 0.35, 29.2, 29.95, 0.12);
    decal(g, S.BADGE, -0.8, 0.8, 27.2, 29.3, 0.1);
    g.detail(S.LANYARD, -0.8, 0.8, 28.95, 29.3, 3.6, 3.63, false);
    g.detail(S.PHOTO, -0.62, -0.08, 27.45, 28.75, 3.6, 3.64, false);
    g.detail(S.INK, 0.08, 0.62, 28.3, 28.5, 3.6, 3.64, false);
    g.detail(S.INK, 0.08, 0.5, 27.85, 28.05, 3.6, 3.64, false);
  }
  return g;
}

type HairStyle = NonNullable<Outfit['hairStyle']>;

interface HeadOpts {
  readonly style: HairStyle;
  readonly glasses: boolean;
  readonly headset: boolean;
  readonly beard: boolean;
  /** Which way the fringe falls (and, for short hair, a quiff or a crop). */
  readonly variant: 0 | 1;
}

/**
 * The skull, in rows up from the chin (c): the chin, then mouth, nose, eyes,
 * brows, forehead and a crown that rounds over. Seven cells wide and deep,
 * the vertical edges chamfered, ears at nose and eye height.
 */
function skull(g: Vox, ears: boolean): void {
  const c = CHIN;
  g.box(S.SKIN, -3, 3, c + 2, c + 5, -3, 3, 1);
  g.box(S.SKIN, -2, 2, c + 6, c + 6, -2, 2, 1);
  g.box(S.SKIN, -2, 2, c + 1, c + 1, -3, 3, 1);
  g.box(S.SKIN, -2, 2, c, c, -2, 3);
  if (!ears) return;
  g.box(S.SKIN, -4, -4, c + 2, c + 3, 0, 0).box(S.SKIN, 4, 4, c + 2, c + 3, 0, 0);
  g.set(-4, c + 2, 0, S.SKIN_SHADE).set(4, c + 2, 0, S.SKIN_SHADE);
}

const isHair = (s: number): boolean => s === S.HAIR;

/** Head, hair and headgear; glasses and nose as fine detail. */
function sculptHead(h: HeadOpts): Vox {
  const c = CHIN;
  const g = new Vox(-6, 6, c - 6, c + 15, -8, 6);
  const style = h.style;
  if (style === 'hood') {
    // The hood first: a rounded shell the skull then fills, open at the face.
    g.rbox(S.TOP, -4, 4, c - 1, c + 7, -4, 4, 1.8);
    g.box(S.TOP, -3, 3, c - 2, c - 1, -4, -3, 1);
    g.box(S.TOP, -3, 3, c - 1, c, -3, 2, 1);
  }
  // Ears, except under a hood.
  skull(g, style !== 'hood');
  // The fringe sweeps to one side or the other.
  const f = h.variant === 0 ? -1 : 1;
  if (style === 'short' || style === 'long' || style === 'bun') {
    // A scalp of hair over the crown, the temples and down the back, a
    // swept fringe; then a layer grown over it for volume.
    g.paint(S.HAIR, -2, 2, c + 6, c + 6, -2, 2);
    g.paint(S.HAIR, -3, -3, c + 4, c + 5, -3, 1).paint(S.HAIR, 3, 3, c + 4, c + 5, -3, 1);
    g.paint(S.HAIR, -3, 3, c + 2, c + 5, -3, -2);
    g.set(2 * f, c + 5, 3, S.HAIR).set(f, c + 5, 3, S.HAIR).set(2 * f, c + 4, 3, S.HAIR);
    g.grow(S.HAIR, isHair, (_i, j, k) => j >= c + 2 && (k <= 3 || j >= c + 6) && !(k === 3 && j < c + 6));
  }
  if (style === 'short') {
    if (h.variant === 0) {
      // A quiff lifting off the hairline.
      g.box(S.HAIR, -2, 2, c + 7, c + 7, 3, 3).set(-2 * f, c + 7, 3, 0);
      g.set(2 * f, c + 7, -2, 0);
    } else {
      // A crop, parted on one side, the top stepped back from the hairline.
      g.box(0, -1, 1, c + 7, c + 7, 2, 2);
      g.paint(S.BROW, f, f, c + 7, c + 7, -2, 1);
    }
  }
  if (style === 'long') {
    // Straight curtains to the shoulders, ragged at the ends.
    g.paint(S.HAIR, -3, -3, c + 1, c + 3, -3, 1).paint(S.HAIR, 3, 3, c + 1, c + 3, -3, 1);
    g.box(S.HAIR, -4, -4, c - 1, c + 3, -3, 1).box(S.HAIR, 4, 4, c - 1, c + 3, -3, 1);
    g.box(S.HAIR, -3, 3, c - 1, c + 1, -4, -4);
    g.box(S.HAIR, -2, 2, c, c + 4, -5, -5);
    for (let i = -4; i <= 4; i++) {
      for (let k = -5; k <= 1; k++) if (hash(i, c - 1, k, 3) < 0.4) g.set(i, c - 1, k, 0);
    }
  }
  if (style === 'bun') {
    // A bun pinned at the back of the crown, seated in the hair, a band round it.
    g.rbox(S.HAIR, -2, 2, c + 4, c + 7, -6, -4, 1.3);
    g.paint(S.BROW, -2, 2, c + 4, c + 7, -5, -5);
  }
  if (style === 'bald') {
    // A horseshoe of close-cropped hair from the nape round over the ears,
    // a little fuller at the sides; the crown is bare.
    g.paint(S.HAIR, -3, 3, c + 1, c + 4, -3, -2);
    g.paint(S.HAIR, -3, -3, c + 3, c + 4, -3, 1).paint(S.HAIR, 3, 3, c + 3, c + 4, -3, 1);
    g.grow(S.HAIR, isHair, (i, j, k) => j >= c + 1 && j <= c + 4 && k <= 1 && (k <= -3 || (Math.abs(i) >= 4 && j >= c + 3)));
  }
  if (style === 'hood') {
    g.box(0, -2, 2, c, c + 6, 4, 4);
    g.paint(S.TOP_DARK, -3, 3, c - 1, c + 7, 4, 4);
    g.paint(S.HAIR, -2, 2, c + 6, c + 6, 3, 3).paint(S.HAIR, -2, -1, c + 5, c + 5, 3, 3);
  }
  if (style === 'tonttu') {
    // White tufts and a red pointed cap that flops back to a bobble.
    g.box(S.HAIR, -4, -4, c + 3, c + 5, -2, 1).box(S.HAIR, 4, 4, c + 3, c + 5, -2, 1);
    g.paint(S.HAIR, -3, 3, c + 5, c + 6, -3, -2);
    for (let n = 0; n < 6; n++) {
      const cz = -0.7 * n;
      const half = 4.6 - 0.72 * n;
      for (let k = -8; k <= 6; k++) {
        for (let i = -5; i <= 5; i++) {
          const ax = Math.abs(i);
          const az = Math.abs(k - cz);
          if (ax <= half - 0.5 && az <= half - 0.5 && ax + az <= half * 1.3) g.set(i, c + 6 + n, k, n === 0 ? S.HAT_DARK : S.HAT);
        }
      }
    }
    g.set(0, c + 12, -4, S.HAT).set(0, c + 12, -5, S.HAT).set(0, c + 11, -6, S.HAT).set(0, c + 11, -7, S.HAT);
    g.rbox(S.FUR, -1, 0, c + 9, c + 10, -8, -7, 0.9);
  }
  if (h.beard) {
    // A jaw of beard up to the sideburns; a tonttu's spills down the chest.
    g.paint(S.BEARD, -3, 3, c, c + 1, -3, 3);
    g.paint(S.BEARD, -3, -3, c + 2, c + 3, -2, 1).paint(S.BEARD, 3, 3, c + 2, c + 3, -2, 1);
    if (style === 'tonttu') {
      g.rbox(S.BEARD, -2, 2, c - 4, c, 0, 4, 1.2);
      g.box(0, -3, 3, c - 4, c - 4, -2, 6).box(S.BEARD, -1, 1, c - 4, c - 4, 1, 3);
    } else {
      g.box(S.BEARD, -2, 2, c - 1, c - 1, 0, 3, 1).box(S.BEARD, -1, 1, c, c, 4, 4);
    }
    g.detail(S.BEARD, -1, 1, c + 1.5, c + 2, 3.5, 3.78, false);
    g.detail(S.BEARD, -1.5, -1, c + 1.1, c + 1.9, 3.5, 3.74, false).detail(S.BEARD, 1, 1.5, c + 1.1, c + 1.9, 3.5, 3.74, false);
  }
  if (h.headset) {
    // A band over the top (pressed into the hair), padded cups over the
    // ears, a boom mic.
    let side = c + 6;
    for (let i = -3; i <= 3; i++) {
      let top = g.topY(i, 0);
      if (g.get(i, top, 0) === S.SKIN) top++;
      g.set(i, top, 0, S.GEAR);
      if (i === 3) side = top;
    }
    for (const i of [-4, 4]) {
      for (let j = c + 4; j < side; j++) g.set(i, j, 0, S.GEAR);
      g.box(S.GEAR, i, i, c + 2, c + 3, -1, 1);
      g.set(i + Math.sign(i), c + 2, 0, S.GEAR_HI);
    }
    g.detail(S.GEAR, 4.45, 4.7, c + 1.4, c + 1.65, 0.4, 3.8);
    g.detail(S.GEAR, 2.2, 4.7, c + 1.4, c + 1.65, 3.55, 3.8);
    g.detail(S.GEAR_HI, 1.55, 2.25, c + 1.15, c + 1.9, 3.5, 4.0);
  }
  // The nose: a half-voxel nub in the middle of the face.
  g.detail(S.SKIN, -0.5, 0.5, c + 2.05, c + 2.95, 3.5, 3.92, false);
  if (h.glasses) {
    // Thin frames with a margin of skin round each eye, a lens glint, a
    // bridge, and arms back over the ears.
    const z0 = 3.7;
    const z1 = 3.86;
    const w = 0.25;
    const lo = c + 2.5;
    const hi = c + 4.5;
    for (const sgn of [-1, 1]) {
      const a = sgn < 0 ? -2.5 : 0.5;
      const b = a + 2;
      g.detail(S.GEAR, a, b, hi - w, hi, z0, z1).detail(S.GEAR, a, b, lo, lo + w, z0, z1);
      g.detail(S.GEAR, a, a + w, lo + w, hi - w, z0, z1).detail(S.GEAR, b - w, b, lo + w, hi - w, z0, z1);
      g.detail(S.GLINT, b - w - 0.22, b - w - 0.04, hi - w - 0.22, hi - w - 0.04, z0, z0 + 0.04, false);
      const edge = sgn * 2.5;
      const out = sgn * 3.62;
      g.detail(S.GEAR, Math.min(edge, out), Math.max(edge, out), c + 3.8, c + 4.05, z0, z1);
      g.detail(S.GEAR, Math.min(out, sgn * 3.5), Math.max(out, sgn * 3.5), c + 3.8, c + 4.05, 0.2, z0);
    }
    g.detail(S.GEAR, -0.5, 0.5, c + 3.75, c + 4, z0, z1);
  }
  return g;
}

// ---------------------------------------------------------------- faces

/**
 * Faces as pixel art in half-voxel pixels on the front of the skull. Each
 * row is ten pixels across the middle of the face; the first row is the
 * forehead (y 40..40.5 voxels) and the last sits over the chin. e eye,
 * w eye with a catch-light, o eye white, b brow, m mouth, t teeth, k blush,
 * l eyelid, g tired shadow.
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
    '.lll...lll',
    '.oee...oee',
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
  e: S.EYE, w: S.EYE, o: S.WHITE, b: S.BROW, m: S.MOUTH, t: S.WHITE, k: S.BLUSH, l: S.LID, g: S.BAG,
};

/** How far each kind of face pixel stands proud of the skin, in voxels. */
const FACE_RELIEF: Readonly<Record<string, number>> = { b: 0.24, e: 0.14, w: 0.14, o: 0.12, l: 0.12, g: 0.06, k: 0.05, m: 0.1, t: 0.12 };

/** The bottom of the face art, and the front of the face, in lattice units. */
const FACE_Y = CHIN;
const FACE_Z = 3.5;

/**
 * A mood's pixels, fitted to the face that wears it. Behind glasses the
 * brows ride a row higher, clear of the frames, and tired shadows drop below
 * them; on dark skin open eyes get whites at their outer corners.
 */
function facePixels(expr: Expression, glasses: boolean, dark: boolean): string[][] {
  const px = FACE_ART[expr].map((row) => [...row]);
  const at = (r: number, c: number): string => px[r]?.[c] ?? '.';
  const put = (r: number, c: number, ch: string): void => {
    const row = px[r];
    if (row !== undefined && c >= 0 && c < row.length) row[c] = ch;
  };
  if (glasses) {
    for (let r = 1; r < px.length; r++) {
      for (let c = 0; c < 10; c++) {
        if (at(r, c) !== 'b') continue;
        put(r, c, '.');
        put(r - 1, c, 'b');
      }
    }
    for (let c = 0; c < 10; c++) {
      if (at(5, c) === 'g' && at(6, c) === '.') {
        put(5, c, '.');
        put(6, c, 'g');
      }
    }
  }
  if (dark) {
    const eye = (ch: string): boolean => ch === 'e' || ch === 'w';
    for (let r = 0; r < px.length; r++) {
      // Only a solid pair of eye pixels is an open eye (not a closed, smiling one).
      for (const [from, to, step] of [[0, 4, 1], [9, 5, -1]] as const) {
        for (let c: number = from; c !== to; c += step) {
          if (eye(at(r, c)) && eye(at(r, c + step))) {
            if (at(r, c - step) === '.') put(r, c - step, 'o');
            break;
          }
        }
      }
    }
  }
  return px;
}

function sculptFace(expr: Expression, glasses: boolean, dark: boolean): Vox {
  const g = new Vox(0, 0, 0, 0, 0, 0);
  facePixels(expr, glasses, dark).forEach((row, r) => {
    const vv = 10 - r;
    for (let c = 0; c < row.length; ) {
      const ch = row[c] ?? '.';
      let len = 1;
      while (row[c + len] === ch) len++;
      const s = FACE_INK[ch];
      if (s !== undefined) {
        const x0 = -2.5 + c * 0.5;
        const y0 = FACE_Y + vv * 0.5;
        const z1 = FACE_Z + (FACE_RELIEF[ch] ?? 0.1);
        g.detail(s, x0, x0 + len * 0.5, y0, y0 + 0.5, FACE_Z, z1, false);
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
/** Your own forearm in first person. */
const VIEW = 7;

/** Where each part hangs from, in metres. */
function pivotOf(part: number): [number, number, number] {
  switch (part) {
    case LEG_L: return [-0.1, 0.92, 0];
    case LEG_R: return [0.1, 0.92, 0];
    case ARM_L: return [-0.228, 1.49, 0];
    case ARM_R: return [0.228, 1.49, 0];
    case HEAD:
    case FACE: return [0, 1.63, 0];
    case VIEW: return [0, 0.0225, -0.045];
    default: return [0, 0, 0];
  }
}

let canon: Vox[] | null = null;

/** Plain parts, standing: what each part's occlusion sees of its neighbours. */
function canonical(): Vox[] {
  canon ??= [
    sculptLeg(-1), sculptLeg(1),
    sculptTorso({ tie: false, suit: false, lanyard: false, cardigan: false, backpack: false, hoodie: false, portly: false, tunic: false }),
    sculptArm(-1, false), sculptArm(1, false),
    sculptHead({ style: 'bald', glasses: false, headset: false, beard: false, variant: 0 }),
  ];
  return canon;
}

const shapes = new Map<string, Shape>();

function shapeOf(key: string, part: number, sculpt: () => Vox): Shape {
  const hit = shapes.get(key);
  if (hit !== undefined) return hit;
  const g = sculpt();
  let neighbours: Occupied | undefined;
  if (part <= HEAD) {
    const others = canonical().filter((_, n) => n !== part);
    neighbours = (i, j, k) => others.some((o) => o.get(i, j, k) !== 0);
  }
  const top = part === VIEW ? 0.09 : TALL;
  const shape = meshShape(g, { pivot: pivotOf(part), grain: GRAINS, top, voxels: part !== FACE, ...(neighbours === undefined ? {} : { neighbours }) });
  shapes.set(key, shape);
  return shape;
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

/** A tie on a dark top is a suit. */
function suited(o: Outfit): boolean {
  return o.tie !== undefined && luminance(o.top) < 0.35;
}

/** Shoes when the outfit names none: polish with a suit, boots on a tonttu, otherwise a mix. */
function defaultShoes(o: Outfit): number {
  if (suited(o)) return 0x1d1917;
  if (o.hairStyle === 'tonttu') return 0x3a2618;
  const pick = [0x2a211c, 0x5b3a24, 0x39404c, 0xd9d4ca];
  return pick[((o.top >>> 4) ^ (o.legs >>> 2) ^ o.skin) & 3] ?? 0x2a211c;
}

/** Dark skin gets lighter lips and lids, so a face still reads at a distance. */
function darkSkin(o: Outfit): boolean {
  return luminance(o.skin) < 0.4;
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
  p[S.PHOTO] = 0x7d8fa6;
  p[S.CARDI] = o.cardigan ?? 0;
  p[S.CARDI_DARK] = trim(o.cardigan ?? 0, 0.66);
  p[S.PACK] = o.backpack ?? 0;
  p[S.PACK_DARK] = trim(o.backpack ?? 0, 0.62);
  p[S.BEARD] = o.beard ?? o.hair;
  p[S.GEAR] = 0x1c1c21;
  p[S.GEAR_HI] = 0x50505a;
  const dark = darkSkin(o);
  p[S.EYE] = dark ? 0x0b0706 : 0x1a120e;
  p[S.WHITE] = 0xf1eee6;
  p[S.GLINT] = 0xdfe7ee;
  p[S.MOUTH] = luminance(o.skin) < 0.3 ? mix(o.skin, 0xc0504a, 0.45) : dark ? 0x3a1214 : 0x5e1f22;
  p[S.LID] = p[S.SKIN_SHADE] ?? 0;
  p[S.BLUSH] = mix(o.skin, 0xff5a5a, 0.32);
  p[S.BAG] = dark ? mix(darker(o.skin, 0.55), 0x3a2050, 0.35) : mix(darker(o.skin, 0.7), 0x6a4a96, 0.4);
  p[S.HAT] = 0xc4262b;
  p[S.HAT_DARK] = 0x8e1a1f;
  p[S.FUR] = 0xf6f3ec;
  p[S.BUCKLE] = 0xc8b27a;
  p[S.SHIRT] = 0xf2f0ea;
  const coat = o.cardigan ?? o.top;
  p[S.BUTTON] = suited(o) ? trim(o.top, 0.6) : luminance(coat) > 0.6 ? darker(coat, 0.7) : mix(coat, 0xf2f0ea, 0.55);
  palettes.set(o, p);
  return p;
}

function faceGeometry(expr: Expression, o: Outfit): THREE.BufferGeometry {
  const glasses = o.glasses === true;
  const dark = darkSkin(o);
  const key = `face:${expr}${+glasses}${+dark}`;
  return paintShape(key, shapeOf(key, FACE, () => sculptFace(expr, glasses, dark)), paletteOf(o));
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

// ---------------------------------------------------------------- your arm

/**
 * Your forearm in first person, cut from the same kit as everyone else: a
 * fist round the handle of whatever you hold, a cuff, and a sleeve running
 * back toward you (+z) and out past the bottom of the screen.
 */
function sculptViewArm(knit: boolean): Vox {
  const g = new Vox(-3, 3, -2, 3, -4, 11);
  g.box(knit ? S.CARDI : S.SLEEVE, -1, 1, -1, 1, 1, 11);
  g.box(knit ? S.CARDI_DARK : S.SLEEVE_DARK, -1, 1, -1, 1, 1, 1);
  // A crease along the top of the sleeve, where the elbow bends.
  g.paint(knit ? S.CARDI_DARK : S.SLEEVE_DARK, 0, 1, 1, 1, 7, 7);
  // The fist: knuckles forward, fingers curled under, the thumb over the grip.
  g.box(S.SKIN, -1, 1, -1, 1, -2, 0);
  g.set(-1, 1, -2, 0).set(1, 1, -2, 0).set(-1, -1, -2, 0).set(1, -1, -2, 0);
  g.paint(S.SKIN_SHADE, -1, 1, -1, -1, -2, -1);
  g.box(S.SKIN, -2, -2, 0, 1, -1, 0);
  g.set(-1, 2, -1, S.SKIN);
  return g;
}

let viewMat: THREE.MeshStandardMaterial | null = null;

/**
 * The first-person arm for an outfit, its origin at the middle of the fist.
 * Its geometry and material are cached and shared (marked so disposal leaves
 * them be), so it costs nothing to rebuild.
 */
export function viewmodelArm(o: Outfit): THREE.Mesh {
  const knit = o.cardigan !== undefined;
  const key = `view${+knit}`;
  viewMat ??= voxelMaterial();
  const m = new THREE.Mesh(paintShape(key, shapeOf(key, VIEW, () => sculptViewArm(knit)), paletteOf(o)), viewMat);
  m.userData.shared = true;
  return m;
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
  const mat = voxelMaterial();
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
    suit: suited(o),
    lanyard: o.lanyard !== undefined,
    cardigan: o.cardigan !== undefined,
    backpack: o.backpack !== undefined,
    hoodie: style === 'hood',
    portly: (o.scale ?? 1) >= 1.12,
    tunic: style === 'tonttu',
  };
  mesh(`torso${+t.tie}${+t.suit}${+t.lanyard}${+t.cardigan}${+t.backpack}${+t.hoodie}${+t.portly}${+t.tunic}`, TORSO, () => sculptTorso(t), body);

  const arms: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const side of [-1, 1] as const) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.228, 1.49, 0);
    mesh(`arm${side}${+t.cardigan}`, side < 0 ? ARM_L : ARM_R, () => sculptArm(side, t.cardigan), arm);
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
  const skullMesh = mesh(`head:${style}${+h.glasses}${+h.headset}${+h.beard}${variant}`, HEAD, () => sculptHead(h), head);
  const expression = o.face ?? 'neutral';
  const face = new THREE.Mesh(faceGeometry(expression, o), mat);
  face.userData.shared = true;
  head.add(face);
  body.add(head);
  // Everyone holds their head a little differently, so a crowd is not a row
  // of statues. It tilts the meshes inside the head group, which callers
  // turn and nod freely.
  const tilt = (hash(o.skin, o.hair, o.top, o.legs) - 0.5) * 0.14;
  skullMesh.rotation.z = tilt;
  face.rotation.z = tilt;

  root.scale.setScalar((o.scale ?? 1) * (style === 'tonttu' ? 0.6 : 1));
  const [legL, legR] = legs as [THREE.Group, THREE.Group];
  const [armL, armR] = arms as [THREE.Group, THREE.Group];
  return { root, body, head, armL, armR, legL, legR, hand, materials: [mat], faceMat: mat, face, outfit: o, expression, phase: 0, glow: 0 };
}

/** Change mood: swaps in the cached face mesh, nothing else is rebuilt. */
export function setExpression(rig: Rig, expr: Expression): void {
  if (rig.expression === expr) return;
  rig.expression = expr;
  rig.face.geometry = faceGeometry(expr, rig.outfit);
}

/** Advance the walk cycle by `speed` (m/s) over `dt`. */
export function animateRig(rig: Rig, speed: number, dt: number, attacking = 0, windup = 0): void {
  rig.phase += dt * (3 + speed * 2.2);
  const amp = Math.min(0.8, speed * 0.22);
  const s = Math.sin(rig.phase);
  rig.legL.rotation.x = s * amp;
  rig.legR.rotation.x = -s * amp;
  rig.armL.rotation.x = -s * amp * 0.8;
  rig.armL.rotation.z = -0.06;
  // Winding up, the arm draws back behind them; the strike swings it through to the front.
  rig.armR.rotation.x = attacking > 0 ? -1.6 + attacking * 1.6 : windup > 0 ? windup * 1.3 : s * amp * 0.8;
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
