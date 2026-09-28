import * as THREE from 'three';
import { disposeTree } from './dispose';

/**
 * Low-poly office people built from boxes, with a procedural walk cycle.
 * Everyone in the building is the same rig in a different outfit.
 */

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
  readonly hairStyle?: 'short' | 'long' | 'bun' | 'bald' | 'hood';
  readonly backpack?: number;
  readonly scale?: number;
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
  readonly materials: THREE.MeshLambertMaterial[];
  phase: number;
}

function part(
  parent: THREE.Object3D,
  sx: number, sy: number, sz: number,
  mat: THREE.Material,
  x: number, y: number, z: number,
): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  m.castShadow = false;
  parent.add(m);
  return m;
}

export function buildRig(o: Outfit): Rig {
  const mats: THREE.MeshLambertMaterial[] = [];
  const mat = (c: number): THREE.MeshLambertMaterial => {
    const m = new THREE.MeshLambertMaterial({ color: c });
    mats.push(m);
    return m;
  };
  const skin = mat(o.skin);
  const top = mat(o.top);
  const legs = mat(o.legs);
  const hair = mat(o.hair);
  const shoes = mat(o.shoes ?? 0x1b1b1b);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Hips at y=0.95.
  const legL = new THREE.Group();
  legL.position.set(-0.13, 0.95, 0);
  part(legL, 0.2, 0.85, 0.22, legs, 0, -0.43, 0);
  part(legL, 0.22, 0.1, 0.32, shoes, 0, -0.88, 0.05);
  body.add(legL);
  const legR = new THREE.Group();
  legR.position.set(0.13, 0.95, 0);
  part(legR, 0.2, 0.85, 0.22, legs, 0, -0.43, 0);
  part(legR, 0.22, 0.1, 0.32, shoes, 0, -0.88, 0.05);
  body.add(legR);

  const torso = part(body, 0.52, 0.66, 0.3, top, 0, 1.28, 0);
  if (o.cardigan !== undefined) {
    const c = mat(o.cardigan);
    part(body, 0.2, 0.64, 0.32, c, -0.17, 1.28, 0);
    part(body, 0.2, 0.64, 0.32, c, 0.17, 1.28, 0);
  }
  if (o.tie !== undefined) part(body, 0.08, 0.45, 0.02, mat(o.tie), 0, 1.33, 0.16);
  if (o.lanyard !== undefined) {
    const l = mat(o.lanyard);
    part(body, 0.03, 0.3, 0.02, l, -0.08, 1.45, 0.16);
    part(body, 0.03, 0.3, 0.02, l, 0.08, 1.45, 0.16);
    part(body, 0.12, 0.16, 0.02, mat(0xffffff), 0, 1.25, 0.17);
  }
  if (o.backpack !== undefined) part(body, 0.42, 0.5, 0.2, mat(o.backpack), 0, 1.28, -0.25);
  void torso;

  const armL = new THREE.Group();
  armL.position.set(-0.34, 1.58, 0);
  part(armL, 0.16, 0.62, 0.18, o.cardigan !== undefined ? mat(o.cardigan) : top, 0, -0.28, 0);
  part(armL, 0.14, 0.12, 0.14, skin, 0, -0.64, 0);
  body.add(armL);
  const armR = new THREE.Group();
  armR.position.set(0.34, 1.58, 0);
  part(armR, 0.16, 0.62, 0.18, o.cardigan !== undefined ? mat(o.cardigan) : top, 0, -0.28, 0);
  part(armR, 0.14, 0.12, 0.14, skin, 0, -0.64, 0);
  const hand = new THREE.Group();
  hand.position.set(0, -0.66, 0.05);
  armR.add(hand);
  body.add(armR);

  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  part(head, 0.36, 0.4, 0.36, skin, 0, 0.22, 0);
  // Eyes, so you can tell which way somebody is facing.
  const eye = mat(0x111111);
  part(head, 0.06, 0.06, 0.02, eye, -0.08, 0.26, 0.185);
  part(head, 0.06, 0.06, 0.02, eye, 0.08, 0.26, 0.185);
  const style = o.hairStyle ?? 'short';
  if (style === 'short') {
    part(head, 0.38, 0.12, 0.38, hair, 0, 0.46, -0.01);
    part(head, 0.38, 0.3, 0.06, hair, 0, 0.3, -0.18);
  }
  if (style === 'long') {
    part(head, 0.4, 0.14, 0.4, hair, 0, 0.46, 0);
    part(head, 0.4, 0.42, 0.1, hair, 0, 0.22, -0.18);
  }
  if (style === 'bun') {
    part(head, 0.4, 0.12, 0.4, hair, 0, 0.46, 0);
    part(head, 0.2, 0.18, 0.2, hair, 0, 0.58, -0.12);
  }
  if (style === 'hood') {
    part(head, 0.44, 0.2, 0.44, top, 0, 0.44, -0.02);
    part(head, 0.44, 0.44, 0.08, top, 0, 0.22, -0.2);
  }
  if (o.glasses === true) {
    const g = mat(0x222222);
    part(head, 0.3, 0.04, 0.02, g, 0, 0.27, 0.2);
  }
  if (o.headset === true) {
    const hs = mat(0x222222);
    part(head, 0.44, 0.05, 0.08, hs, 0, 0.44, 0);
    part(head, 0.06, 0.12, 0.12, hs, 0.21, 0.22, 0);
    part(head, 0.03, 0.03, 0.2, hs, 0.18, 0.12, 0.1);
  }
  body.add(head);

  const s = o.scale ?? 1;
  root.scale.setScalar(s);
  return { root, body, head, armL, armR, legL, legR, hand, materials: mats, phase: 0 };
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
}

/** Flash every material a colour (hit feedback). */
export function tintRig(rig: Rig, color: number, amount: number): void {
  for (const m of rig.materials) m.emissive.setHex(amount > 0 ? color : 0x000000).multiplyScalar(amount);
}

export function disposeRig(rig: Rig): void {
  disposeTree(rig.root, true);
}

// Palettes the spawner draws from.
export const SKINS = [0xf1c9a5, 0xe0ac7e, 0xc68642, 0x8d5524, 0x5c3a1e, 0xffdbac];
export const HAIRS = [0x2b1b0e, 0x6b4423, 0xd8b36a, 0x111111, 0x8a8a8a, 0xa0522d];
export const SHIRTS = [0x8fb3d9, 0xffffff, 0xd9c28f, 0x9fd98f, 0xd98fb3, 0xb3a3d9, 0xe0e0e0];
export const TROUSERS = [0x2e3440, 0x3b3b3b, 0x4a4036, 0x1f2a44];
