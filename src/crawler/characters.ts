import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Office people, sculpted: a lathed torso, capsule limbs, an egg of a head
 * with modelled eyes, brows, nose and mouth, and hair, ties, lanyards,
 * cardigans and headsets on top. Each limb is one vertex-coloured mesh, so a
 * whole person is a handful of draw calls. The face is its own small mesh
 * and changes with their mood.
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
  /** Brows and mouth: swapped when the expression changes. */
  readonly face: THREE.Mesh;
  readonly outfit: Outfit;
  expression: Expression;
  phase: number;
  /** Resting emissive colour (a clone's blue glow); hit flashes return to it. */
  glow: number;
}

// ---------------------------------------------------------------- sculpting

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();

/** Unit primitives, built once and cloned into place. */
const PRIM = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  ball: new THREE.SphereGeometry(1, 10, 7),
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  cylinder: new THREE.CylinderGeometry(1, 1, 1, 12),
  cone: new THREE.ConeGeometry(1, 1, 14),
};

interface Place {
  x?: number; y?: number; z?: number;
  rx?: number; ry?: number; rz?: number;
  sx?: number; sy?: number; sz?: number;
}

/** Collects coloured, transformed pieces and welds them into one geometry. */
class Sculpt {
  private readonly pieces: THREE.BufferGeometry[] = [];

  add(src: THREE.BufferGeometry, color: number, p: Place = {}): this {
    // Always a plain geometry: cloning a subclass (an ExtrudeGeometry) would rebuild a default one first.
    const g = src.index !== null ? src.toNonIndexed() : new THREE.BufferGeometry().copy(src);
    if (g.getAttribute('uv') !== undefined) g.deleteAttribute('uv');
    if (g.getAttribute('uv1') !== undefined) g.deleteAttribute('uv1');
    tmpE.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0);
    tmpQ.setFromEuler(tmpE);
    tmpM.compose(tmpP.set(p.x ?? 0, p.y ?? 0, p.z ?? 0), tmpQ, tmpS.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    g.applyMatrix4(tmpM);
    const c = new THREE.Color(color);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.pieces.push(g);
    return this;
  }

  /** A sphere of radius r, squashed by (sx, sy, sz). */
  ball(color: number, r: number, p: Place = {}, fine = true): this {
    return this.add(fine ? PRIM.sphere : PRIM.ball, color, { ...p, sx: r * (p.sx ?? 1), sy: r * (p.sy ?? 1), sz: r * (p.sz ?? 1) });
  }

  /** A capsule of radius r and straight length len, along y unless rotated. */
  capsule(color: number, r: number, len: number, p: Place = {}): this {
    const g = new THREE.CapsuleGeometry(r, len, 4, 10);
    this.add(g, color, p);
    g.dispose();
    return this;
  }

  empty(): boolean {
    return this.pieces.length === 0;
  }

  build(): THREE.BufferGeometry {
    const g = mergeGeometries(this.pieces, false);
    for (const p of this.pieces) p.dispose();
    this.pieces.length = 0;
    return g;
  }
}

/** A body of revolution from (radius, height) pairs; `gap` leaves the front open (a cardigan). */
function lathe(profile: readonly [number, number][], gap = 0): THREE.LatheGeometry {
  const pts = profile.map(([r, y]) => new THREE.Vector2(r, y));
  // Lathe sweeps from +z round: start just past the front, stop just before it.
  return gap > 0 ? new THREE.LatheGeometry(pts, 18, gap / 2, Math.PI * 2 - gap) : new THREE.LatheGeometry(pts, 18);
}

const TORSO: readonly [number, number][] = [
  [0.0, 0.9], [0.165, 0.9], [0.18, 0.98], [0.172, 1.1], [0.182, 1.24], [0.205, 1.38], [0.215, 1.46], [0.19, 1.53], [0.12, 1.585], [0.05, 1.6], [0.0, 1.6],
];

function darker(c: number, k: number): number {
  return new THREE.Color(c).multiplyScalar(k).getHex();
}

// ---------------------------------------------------------------- faces

const LIP = 0x8a3b3b;
const faceCache = new Map<string, THREE.BufferGeometry>();

/** Brows and a mouth (and eyelids, when tired), for one look. Cached and shared. */
function faceGeometry(expr: Expression, brow: number, skin: number): THREE.BufferGeometry {
  const key = `${expr}|${brow}|${skin}`;
  const hit = faceCache.get(key);
  if (hit !== undefined) return hit;
  const s = new Sculpt();
  const browTilt = expr === 'angry' ? 0.42 : expr === 'stern' ? 0.18 : expr === 'kind' || expr === 'happy' ? -0.15 : expr === 'tired' ? -0.25 : 0;
  const browY = expr === 'angry' ? 0.222 : expr === 'happy' || expr === 'kind' ? 0.24 : 0.232;
  for (const side of [-1, 1]) {
    // Inner end down when angry; a raised arch when smug on one side.
    const lift = expr === 'smug' && side === 1 ? 0.012 : 0;
    s.capsule(brow, 0.0085, 0.045, { x: side * 0.056, y: browY + lift, z: 0.129, rz: Math.PI / 2 + side * browTilt });
  }
  const mouthY = 0.082;
  if (expr === 'happy' || expr === 'kind') {
    const arc = expr === 'happy' ? Math.PI * 0.9 : Math.PI * 0.7;
    const g = new THREE.TorusGeometry(0.036, 0.0075, 5, 12, arc);
    s.add(g, LIP, { y: mouthY + 0.03, z: 0.142, rz: Math.PI * 1.5 - arc / 2, sy: 0.8 });
    g.dispose();
  } else if (expr === 'angry') {
    const g = new THREE.TorusGeometry(0.034, 0.008, 5, 12, Math.PI * 0.8);
    s.add(g, LIP, { y: mouthY - 0.025, z: 0.142, rz: Math.PI / 2 - Math.PI * 0.4, sy: 0.7 });
    g.dispose();
  } else if (expr === 'smug') {
    const g = new THREE.TorusGeometry(0.03, 0.0075, 5, 10, Math.PI * 0.55);
    s.add(g, LIP, { x: 0.012, y: mouthY + 0.024, z: 0.142, rz: Math.PI * 1.5 - 0.1 });
    g.dispose();
  } else {
    s.capsule(LIP, 0.0075, expr === 'tired' ? 0.03 : 0.042, { y: expr === 'tired' ? mouthY - 0.004 : mouthY, z: 0.14, rz: Math.PI / 2 });
  }
  if (expr === 'tired') {
    // Heavy eyelids.
    for (const side of [-1, 1]) s.ball(skin, 0.03, { x: side * 0.055, y: 0.198, z: 0.132, sx: 1.05, sy: 0.55, sz: 0.6 }, false);
  }
  const g = s.build();
  g.userData.cached = true;
  faceCache.set(key, g);
  return g;
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
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0 });
  const mats = [mat];
  const tonttu = o.hairStyle === 'tonttu';
  const shoes = o.shoes ?? 0x1b1b1b;
  const sleeve = o.cardigan ?? o.top;
  const mesh = (s: Sculpt, parent: THREE.Object3D): THREE.Mesh | null => {
    if (s.empty()) return null;
    const m = new THREE.Mesh(s.build(), mat);
    parent.add(m);
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shadow = blobShadow();
  if (shadow !== null) root.add(shadow);

  // Legs: trousers to the ankle, a rounded shoe.
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.1, 0.92, 0);
    const s = new Sculpt()
      .capsule(o.legs, 0.085, 0.36, { y: -0.2 })
      .capsule(o.legs, 0.072, 0.34, { y: -0.56 })
      .ball(shoes, 0.085, { y: -0.86, z: 0.045, sx: 1, sy: 0.6, sz: 1.65 })
      .ball(darker(shoes, 0.6), 0.086, { y: -0.895, z: 0.045, sx: 1.02, sy: 0.18, sz: 1.68 }, false);
    mesh(s, leg);
    body.add(leg);
    legs.push(leg);
  }

  // Torso, hips, collar, and whatever they wear over it.
  const torso = new Sculpt();
  torso.add(lathe(TORSO), o.top, { sz: 0.66 });
  torso.ball(o.legs, 0.175, { y: 0.93, sx: 1.02, sy: 0.55, sz: 0.72 });
  torso.add(PRIM.cylinder, o.skin, { y: 1.62, sx: 0.055, sy: 0.1, sz: 0.055 });
  torso.add(new THREE.TorusGeometry(0.075, 0.018, 6, 16), darker(o.top, 0.9), { y: 1.585, rx: Math.PI / 2, sz: 0.8 });
  if (o.cardigan !== undefined) {
    const cardi = lathe(TORSO.map(([r, y]) => [r * 1.07 + (r > 0 ? 0.004 : 0), y] as [number, number]), 0.55);
    torso.add(cardi, o.cardigan, { sz: 0.7 });
    cardi.dispose();
    // Buttons down the open front.
    for (let k = 0; k < 4; k++) torso.ball(darker(o.cardigan, 0.7), 0.012, { x: 0.075, y: 1.02 + k * 0.1, z: 0.12 }, false);
  }
  if (o.tie !== undefined) {
    torso.ball(o.tie, 0.024, { y: 1.53, z: 0.128, sy: 0.8 }, false);
    const blade = new THREE.Shape();
    blade.moveTo(-0.022, 0);
    blade.lineTo(0.022, 0);
    blade.lineTo(0.036, -0.34);
    blade.lineTo(0, -0.39);
    blade.lineTo(-0.036, -0.34);
    blade.closePath();
    const tg = new THREE.ExtrudeGeometry(blade, { depth: 0.008, bevelEnabled: false });
    torso.add(tg, o.tie, { y: 1.515, z: 0.134, rx: 0.07 });
    tg.dispose();
  }
  if (o.lanyard !== undefined) {
    const loop = new THREE.TorusGeometry(0.11, 0.007, 4, 18, Math.PI);
    torso.add(loop, o.lanyard, { y: 1.47, z: 0.1, rx: Math.PI / 2 + 0.9, rz: Math.PI, sy: 1.5 });
    loop.dispose();
    torso.add(PRIM.cylinder, 0xf4f4f4, { y: 1.3, z: 0.132, sx: 0.045, sy: 0.1, sz: 0.004 });
    torso.add(PRIM.cylinder, o.lanyard, { y: 1.335, z: 0.136, sx: 0.042, sy: 0.02, sz: 0.003 });
  }
  if (o.backpack !== undefined) {
    torso.capsule(o.backpack, 0.13, 0.2, { y: 1.28, z: -0.2, sx: 1.25, sz: 0.62 });
    for (const side of [-1, 1]) torso.capsule(darker(o.backpack, 0.7), 0.014, 0.36, { x: side * 0.1, y: 1.34, z: -0.03, rx: 0.2 });
  }
  mesh(torso, body);

  // Arms: shoulder, upper arm, forearm, hand.
  const arms: THREE.Group[] = [];
  let hand = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.228, 1.49, 0);
    const s = new Sculpt()
      .ball(sleeve, 0.064, { y: -0.01 }, false)
      .capsule(sleeve, 0.055, 0.22, { y: -0.16, rz: side * 0.06 })
      .capsule(sleeve, 0.048, 0.2, { x: side * 0.012, y: -0.41 })
      .ball(o.skin, 0.052, { x: side * 0.012, y: -0.585, z: 0.005, sx: 0.85, sy: 1.15, sz: 0.7 }, false)
      .ball(o.skin, 0.02, { x: side * -0.02, y: -0.56, z: 0.035 }, false);
    mesh(s, arm);
    if (side === 1) {
      hand = new THREE.Group();
      hand.position.set(0.012, -0.6, 0.04);
      arm.add(hand);
    }
    body.add(arm);
    arms.push(arm);
  }

  // Head: skull, ears, nose, eyes; hair; glasses, beard, headset.
  const head = new THREE.Group();
  head.position.set(0, 1.63, 0);
  const h = new Sculpt();
  h.ball(o.skin, 0.155, { y: 0.16, sx: 0.93, sy: 1.06, sz: 0.98 });
  h.ball(o.skin, 0.118, { y: 0.085, z: 0.02, sx: 0.95, sy: 0.9, sz: 1 });
  for (const side of [-1, 1]) {
    h.ball(o.skin, 0.034, { x: side * 0.145, y: 0.15, z: -0.005, sx: 0.5, sy: 1, sz: 0.8 }, false);
    h.ball(0xffffff, 0.027, { x: side * 0.055, y: 0.19, z: 0.128, sx: 1.05, sy: 0.95, sz: 0.55 }, false);
    h.ball(0x1f150d, 0.015, { x: side * 0.055, y: 0.188, z: 0.141, sz: 0.5 }, false);
    h.ball(0xffffff, 0.004, { x: side * 0.051, y: 0.194, z: 0.149 }, false);
  }
  h.ball(darker(o.skin, 0.92), 0.026, { y: 0.14, z: 0.15, sx: 0.8, sy: 1.1, sz: 0.9 }, false);
  // Cheeks, a little warmth.
  for (const side of [-1, 1]) h.ball(darker(o.skin, 0.96), 0.03, { x: side * 0.08, y: 0.115, z: 0.108, sz: 0.5 }, false);

  const hairC = o.hair;
  const cap = (thetaLen: number, color: number, r = 0.165, tilt = -0.35, phiGap = 0): void => {
    const g = new THREE.SphereGeometry(r, 18, 10, phiGap > 0 ? Math.PI / 2 + phiGap / 2 : 0, phiGap > 0 ? Math.PI * 2 - phiGap : Math.PI * 2, 0, thetaLen);
    h.add(g, color, { y: 0.17, z: -0.01, rx: tilt, sx: 0.98, sy: 1.04, sz: 1.02 });
    g.dispose();
  };
  const style = o.hairStyle ?? 'short';
  if (style === 'short') cap(Math.PI * 0.5, hairC);
  if (style === 'long') {
    cap(Math.PI * 0.55, hairC);
    h.capsule(hairC, 0.13, 0.22, { y: 0.02, z: -0.085, sx: 1.12, sz: 0.5 });
  }
  if (style === 'bun') {
    cap(Math.PI * 0.52, hairC);
    h.ball(hairC, 0.075, { y: 0.31, z: -0.1 });
  }
  if (style === 'bald') {
    const ring = new THREE.TorusGeometry(0.15, 0.028, 6, 18, Math.PI * 1.2);
    h.add(ring, hairC, { y: 0.13, z: -0.01, rx: Math.PI / 2, rz: -Math.PI * 0.1 - Math.PI / 2, sy: 1.05 });
    ring.dispose();
  }
  if (style === 'hood') {
    cap(Math.PI * 0.68, o.top, 0.19, -0.2, 1.4);
    h.capsule(o.top, 0.14, 0.1, { y: 0.04, z: -0.09, sx: 1.2, sz: 0.6 });
  }
  if (tonttu) {
    h.add(PRIM.cone, 0xc0282d, { y: 0.4, z: -0.05, rx: -0.45, sx: 0.18, sy: 0.45, sz: 0.18 });
    h.ball(0xc0282d, 0.17, { y: 0.24, z: -0.01, sy: 0.4 });
    h.ball(0xffffff, 0.05, { y: 0.58, z: -0.22 });
  }
  if (o.beard !== undefined) {
    h.ball(o.beard, 0.12, { y: 0.045, z: 0.07, sx: 1, sy: 0.85, sz: 0.72 });
    h.capsule(o.beard, 0.014, 0.05, { y: 0.106, z: 0.148, rz: Math.PI / 2 });
  }
  if (o.glasses === true) {
    const rim = new THREE.TorusGeometry(0.036, 0.0055, 5, 16);
    for (const side of [-1, 1]) {
      h.add(rim, 0x151515, { x: side * 0.056, y: 0.19, z: 0.152, sx: 1.1, sy: 0.9 });
      h.capsule(0x151515, 0.004, 0.13, { x: side * 0.1, y: 0.2, z: 0.085, rx: Math.PI / 2, ry: side * 0.25 });
    }
    rim.dispose();
    h.capsule(0x151515, 0.004, 0.022, { y: 0.195, z: 0.155, rz: Math.PI / 2 });
  }
  if (o.headset === true) {
    const band = new THREE.TorusGeometry(0.162, 0.011, 5, 18, Math.PI);
    h.add(band, 0x222222, { y: 0.16 });
    band.dispose();
    for (const side of [-1, 1]) h.add(PRIM.cylinder, 0x222222, { x: side * 0.16, y: 0.15, rz: Math.PI / 2, sx: 0.045, sy: 0.03, sz: 0.045 });
    h.capsule(0x222222, 0.006, 0.12, { x: 0.13, y: 0.08, z: 0.08, rx: Math.PI / 2 - 0.3, ry: -0.6 });
    h.ball(0x333333, 0.014, { x: 0.075, y: 0.075, z: 0.135 }, false);
  }
  mesh(h, head);
  const expression = o.face ?? 'neutral';
  const face = new THREE.Mesh(faceGeometry(expression, darker(hairC, tonttu ? 0.9 : 0.8), o.skin), mat);
  face.userData.shared = true;
  head.add(face);
  body.add(head);

  root.scale.setScalar((o.scale ?? 1) * (tonttu ? 0.6 : 1));
  const [legL, legR] = legs as [THREE.Group, THREE.Group];
  const [armL, armR] = arms as [THREE.Group, THREE.Group];
  return { root, body, head, armL, armR, legL, legR, hand, materials: mats, faceMat: mat, face, outfit: o, expression, phase: 0, glow: 0 };
}

export function setExpression(rig: Rig, expr: Expression): void {
  if (rig.expression === expr) return;
  rig.expression = expr;
  rig.face.geometry = faceGeometry(expr, darker(rig.outfit.hair, rig.outfit.hairStyle === 'tonttu' ? 0.9 : 0.8), rig.outfit.skin);
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
