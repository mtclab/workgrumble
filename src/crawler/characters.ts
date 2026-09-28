import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Soft-voxel office people: rounded blocks, a pixel-art face, and a blob
 * shadow, with a procedural walk cycle. Everyone in the building is the same
 * rig in a different outfit and a different mood.
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
  readonly faceMat: THREE.MeshStandardMaterial;
  readonly outfit: Outfit;
  expression: Expression;
  phase: number;
  /** Resting emissive colour (a clone's blue glow); hit flashes return to it. */
  glow: number;
}

const geoCache = new Map<string, THREE.BufferGeometry>();

function rounded(sx: number, sy: number, sz: number): THREE.BufferGeometry {
  const key = `${sx.toFixed(3)}|${sy.toFixed(3)}|${sz.toFixed(3)}`;
  let g = geoCache.get(key);
  if (g === undefined) {
    const r = Math.min(sx, sy, sz) * 0.28;
    g = new RoundedBoxGeometry(sx, sy, sz, 2, r);
    geoCache.set(key, g);
  }
  return g;
}

function part(
  parent: THREE.Object3D,
  sx: number, sy: number, sz: number,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(rounded(sx, sy, sz), mat);
  m.position.set(x, y, z);
  // Geometry is cached and shared; the rig's own materials are freed by disposeRig.
  m.userData.shared = true;
  parent.add(m);
  return m;
}

const faceCache = new Map<string, THREE.CanvasTexture>();

/** A 16x16 pixel face painted on the front of the head. */
export function faceTexture(skin: number, expr: Expression, glasses: boolean): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const key = `${skin}|${expr}|${glasses}`;
  const cached = faceCache.get(key);
  if (cached !== undefined) return cached;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const g = c.getContext('2d');
  if (g === null) return null;
  g.fillStyle = `#${skin.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 16, 16);
  const px = (x: number, y: number, w = 1, h = 1): void => g.fillRect(x, y, w, h);
  g.fillStyle = 'rgba(220,90,90,0.25)';
  px(2, 10, 2, 1);
  px(12, 10, 2, 1);
  g.fillStyle = '#ffffff';
  px(3, 6, 3, 2);
  px(10, 6, 3, 2);
  g.fillStyle = '#1a1410';
  if (expr === 'tired') {
    px(3, 7, 3, 1);
    px(10, 7, 3, 1);
  } else {
    px(4, 6, 2, 2);
    px(10, 6, 2, 2);
  }
  g.fillStyle = '#3a2a1a';
  if (expr === 'angry') {
    px(3, 4, 1, 1); px(4, 5, 2, 1);
    px(12, 4, 1, 1); px(10, 5, 2, 1);
  } else if (expr === 'smug' || expr === 'stern') {
    px(3, 5, 3, 1); px(10, 4, 3, 1);
  } else if (expr === 'kind' || expr === 'happy') {
    px(3, 4, 3, 1); px(10, 4, 3, 1);
  } else {
    px(3, 5, 3, 1); px(10, 5, 3, 1);
  }
  if (glasses) {
    g.fillStyle = '#111';
    px(2, 5, 5, 1); px(9, 5, 5, 1); px(2, 8, 5, 1); px(9, 8, 5, 1);
    px(2, 5, 1, 4); px(6, 5, 1, 4); px(9, 5, 1, 4); px(13, 5, 1, 4); px(7, 6, 2, 1);
  }
  g.fillStyle = '#6a1f1f';
  switch (expr) {
    case 'angry': px(5, 12, 6, 1); px(4, 13, 1, 1); px(11, 13, 1, 1); break;
    case 'happy': px(5, 11, 1, 1); px(10, 11, 1, 1); px(6, 12, 4, 1); g.fillStyle = '#fff'; px(6, 11, 4, 1); break;
    case 'kind': px(5, 11, 1, 1); px(10, 11, 1, 1); px(6, 12, 4, 1); break;
    case 'smug': px(7, 12, 4, 1); px(11, 11, 1, 1); break;
    case 'stern': px(5, 12, 6, 1); break;
    case 'tired': px(6, 12, 4, 1); px(6, 13, 4, 1); break;
    default: px(6, 12, 4, 1);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  // Shared by every face with this look: disposers must leave it alone.
  t.userData.cached = true;
  faceCache.set(key, t);
  return t;
}

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

export function buildRig(o: Outfit): Rig {
  const mats: THREE.MeshStandardMaterial[] = [];
  const mat = (c: number, roughness = 0.82): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0 });
    mats.push(m);
    return m;
  };
  const skin = mat(o.skin, 0.6);
  const top = mat(o.top);
  const legs = mat(o.legs);
  const hair = mat(o.hair);
  const shoes = mat(o.shoes ?? 0x1b1b1b);
  const small = o.hairStyle === 'tonttu';

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const shadow = blobShadow();
  if (shadow !== null) root.add(shadow);

  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.95, 0);
  part(legL, 0.21, 0.86, 0.23, legs, 0, -0.43, 0);
  part(legL, 0.23, 0.12, 0.34, shoes, 0, -0.88, 0.05);
  body.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.95, 0);
  part(legR, 0.21, 0.86, 0.23, legs, 0, -0.43, 0);
  part(legR, 0.23, 0.12, 0.34, shoes, 0, -0.88, 0.05);
  body.add(legR);

  part(body, 0.54, 0.68, 0.32, top, 0, 1.28, 0);
  if (o.cardigan !== undefined) {
    const c = mat(o.cardigan);
    part(body, 0.2, 0.66, 0.34, c, -0.18, 1.28, 0);
    part(body, 0.2, 0.66, 0.34, c, 0.18, 1.28, 0);
  }
  if (o.tie !== undefined) part(body, 0.09, 0.46, 0.04, mat(o.tie), 0, 1.33, 0.16);
  if (o.lanyard !== undefined) {
    const l = mat(o.lanyard);
    part(body, 0.04, 0.3, 0.03, l, -0.08, 1.45, 0.165);
    part(body, 0.04, 0.3, 0.03, l, 0.08, 1.45, 0.165);
    part(body, 0.13, 0.17, 0.03, mat(0xffffff), 0, 1.25, 0.175);
  }
  if (o.backpack !== undefined) part(body, 0.44, 0.52, 0.22, mat(o.backpack), 0, 1.28, -0.26);

  const sleeve = o.cardigan !== undefined ? mat(o.cardigan) : top;
  const armL = new THREE.Group();
  armL.position.set(-0.35, 1.58, 0);
  part(armL, 0.17, 0.62, 0.19, sleeve, 0, -0.28, 0);
  part(armL, 0.15, 0.14, 0.15, skin, 0, -0.64, 0);
  body.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.35, 1.58, 0);
  part(armR, 0.17, 0.62, 0.19, sleeve, 0, -0.28, 0);
  part(armR, 0.15, 0.14, 0.15, skin, 0, -0.64, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.66, 0.05);
  armR.add(hand);
  body.add(armR);

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  part(head, 0.4, 0.42, 0.38, skin, 0, 0.23, 0);
  const expression = o.face ?? 'neutral';
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTexture(o.skin, expression, o.glasses === true), roughness: 0.6 });
  mats.push(faceMat);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.38), faceMat);
  face.position.set(0, 0.23, 0.192);
  head.add(face);
  const style = o.hairStyle ?? 'short';
  if (style === 'short') {
    part(head, 0.42, 0.12, 0.4, hair, 0, 0.46, -0.01);
    part(head, 0.42, 0.3, 0.08, hair, 0, 0.32, -0.17);
  }
  if (style === 'long') {
    part(head, 0.44, 0.14, 0.42, hair, 0, 0.47, 0);
    part(head, 0.44, 0.46, 0.12, hair, 0, 0.22, -0.18);
  }
  if (style === 'bun') {
    part(head, 0.44, 0.12, 0.42, hair, 0, 0.47, 0);
    part(head, 0.42, 0.26, 0.08, hair, 0, 0.34, -0.17);
    part(head, 0.22, 0.2, 0.2, hair, 0, 0.6, -0.12);
  }
  if (style === 'hood') {
    part(head, 0.48, 0.22, 0.46, top, 0, 0.45, -0.02);
    part(head, 0.48, 0.46, 0.1, top, 0, 0.22, -0.21);
  }
  if (style === 'tonttu') {
    const red = mat(0xc0282d);
    part(head, 0.46, 0.14, 0.44, red, 0, 0.46, 0);
    part(head, 0.32, 0.22, 0.32, red, 0, 0.6, -0.03);
    part(head, 0.18, 0.2, 0.18, red, 0, 0.76, -0.08);
    part(head, 0.1, 0.12, 0.1, mat(0xffffff), 0, 0.9, -0.12);
  }
  if (o.beard !== undefined) part(head, 0.38, 0.24, 0.1, mat(o.beard), 0, 0.06, 0.17);
  if (o.headset === true) {
    const hs = mat(0x222222);
    part(head, 0.46, 0.06, 0.1, hs, 0, 0.46, 0);
    part(head, 0.07, 0.14, 0.14, hs, 0.22, 0.22, 0);
  }
  body.add(head);

  root.scale.setScalar((o.scale ?? 1) * (small ? 0.6 : 1));
  return { root, body, head, armL, armR, legL, legR, hand, materials: mats, faceMat, outfit: o, expression, phase: 0, glow: 0 };
}

export function setExpression(rig: Rig, expr: Expression): void {
  if (rig.expression === expr) return;
  rig.expression = expr;
  rig.faceMat.map = faceTexture(rig.outfit.skin, expr, rig.outfit.glasses === true);
  rig.faceMat.needsUpdate = true;
}

/** Advance the walk cycle by `speed` (m/s) over `dt`. */
export function animateRig(rig: Rig, speed: number, dt: number, attacking = 0): void {
  rig.phase += dt * (3 + speed * 2.2);
  const amp = Math.min(0.8, speed * 0.22);
  const s = Math.sin(rig.phase);
  rig.legL.rotation.x = s * amp;
  rig.legR.rotation.x = -s * amp;
  rig.armL.rotation.x = -s * amp * 0.8;
  rig.armR.rotation.x = attacking > 0 ? -1.6 + attacking * 1.6 : s * amp * 0.8;
  rig.body.position.y = Math.abs(Math.cos(rig.phase)) * amp * 0.08;
  rig.body.scale.y = speed < 0.1 ? 1 + Math.sin(rig.phase * 0.5) * 0.012 : 1;
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
