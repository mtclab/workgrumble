import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { blobShadow } from './characters';
import { GRAIN, meshShape, paintShape, Vox, voxelMaterial } from './voxels';

/**
 * One-off models that are not office people: Musti the dog (in voxels, like
 * the people), the chatbot, Shadow IT's unsanctioned turrets, and the bits
 * the mökki grows as you upgrade it.
 */

function lam(color: number, emissive = 0): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, emissive, roughness: 0.7, metalness: 0.05 });
}

function rbox(sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(sx, sy, sz) * 0.3), mat);
  m.position.set(x, y, z);
  return m;
}

function box(sx: number, sy: number, sz: number, mat: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(x, y, z);
  return m;
}

/** Musti's palette slots: a dark coat with the Lapphund's cream markings. */
const D = { COAT: 1, SADDLE: 2, CREAM: 3, NOSE: 4, EYE: 5, GLINT: 6, TONGUE: 7, MOUTH: 8 } as const;
const DOG_PALETTE = [0, 0x4a3424, 0x2a1d15, 0xe2c79c, 0x141010, 0x0d0a08, 0xdfe7ee, 0xd9606a, 0x3a1a18];
const DOG_GRAIN = [GRAIN.SMOOTH, GRAIN.HAIR, GRAIN.HAIR, GRAIN.HAIR, GRAIN.SMOOTH, GRAIN.SMOOTH, GRAIN.SMOOTH, GRAIN.SMOOTH, GRAIN.SMOOTH];

/** Body, ruff and chest: a fluffy barrel, the ruff standing up round the neck. */
function sculptDogBody(): Vox {
  const g = new Vox(-6, 6, 5, 20, -11, 11);
  g.rbox(D.COAT, -4, 4, 8, 16, -8, 6, 2.2);
  g.rbox(D.COAT, -4, 4, 11, 19, 3, 8, 2.1);
  // A darker saddle over the back, a cream bib and belly.
  g.paint(D.SADDLE, -3, 3, 16, 17, -7, 3);
  g.paint(D.CREAM, -3, 3, 8, 14, 7, 9).paint(D.CREAM, -2, 2, 8, 8, -5, 6);
  return g;
}

/** The head: a broad skull, a cream muzzle with a nose and a tongue out, eyebrow spots and pricked ears. */
function sculptDogHead(): Vox {
  const g = new Vox(-5, 5, 13, 26, 5, 18);
  g.rbox(D.COAT, -3, 3, 17, 22, 8, 13, 1.6);
  g.rbox(D.CREAM, -2, 2, 16, 18, 13, 16, 0.9);
  g.box(D.CREAM, -2, 2, 17, 18, 12, 12);
  g.set(0, 18, 16, D.NOSE).set(0, 18, 17, D.NOSE).set(-1, 18, 16, D.NOSE).set(1, 18, 16, D.NOSE);
  g.paint(D.MOUTH, -2, 2, 16, 16, 14, 16);
  g.set(0, 15, 15, D.TONGUE).set(0, 15, 14, D.TONGUE).set(0, 16, 15, D.TONGUE);
  // Cheeks and brows in cream, the "spectacles" round the eyes.
  g.paint(D.CREAM, -3, -3, 17, 18, 11, 13).paint(D.CREAM, 3, 3, 17, 18, 11, 13);
  g.set(-2, 21, 13, D.CREAM).set(2, 21, 13, D.CREAM).set(-2, 19, 13, D.CREAM).set(2, 19, 13, D.CREAM);
  g.paint(D.CREAM, -3, -3, 19, 20, 12, 13).paint(D.CREAM, 3, 3, 19, 20, 12, 13);
  g.set(-2, 20, 13, D.EYE).set(2, 20, 13, D.EYE);
  g.detail(D.GLINT, -2.35, -2.1, 20.6, 20.85, 13.5, 13.54, false).detail(D.GLINT, 1.65, 1.9, 20.6, 20.85, 13.5, 13.54, false);
  for (const s of [-1, 1]) {
    const a = s < 0 ? -3 : 2;
    g.box(D.COAT, a, a + 1, 23, 23, 9, 10);
    g.box(D.COAT, 2 * s, 2 * s, 24, 24, 10, 10);
    g.set(2 * s, 23, 10, D.CREAM);
  }
  return g;
}

/** One leg: coat above, cream stockings, a paw a cell longer than the leg; haunches on the back legs. */
function sculptDogLeg(x: number, front: boolean): Vox {
  const z0 = front ? 5 : -7;
  const g = new Vox(x - 3, x + 3, 0, 13, z0 - 3, z0 + 4);
  const xb = x + 1;
  g.box(D.COAT, x, xb, 1, 11, z0, z0 + 1);
  g.paint(D.CREAM, x, xb, 1, 5, z0, z0 + 1);
  g.box(D.CREAM, x, xb, 0, 0, z0, z0 + 2);
  if (!front) g.rbox(D.COAT, Math.min(x, xb) - (x < 0 ? 1 : 0), Math.max(x, xb) + (x < 0 ? 0 : 1), 6, 11, z0 - 1, z0 + 2, 1.2);
  return g;
}

/** The tail: a thick brush rising from the rump and curling forward over the back, a cream tip. */
function sculptDogTail(): Vox {
  const g = new Vox(-3, 3, 14, 26, -13, -2);
  g.rbox(D.COAT, -1, 1, 16, 19, -10, -8, 1.1);
  g.rbox(D.COAT, -1, 1, 18, 21, -9, -6, 1.1);
  g.rbox(D.CREAM, -1, 1, 19, 21, -6, -4, 1.0);
  g.paint(D.CREAM, -1, 1, 16, 18, -10, -10);
  return g;
}

const dogGeometry = new Map<string, THREE.BufferGeometry>();
let dogBody: Vox | null = null;
let dogMat: THREE.MeshStandardMaterial | null = null;

/** One of Musti's parts, cached: every Musti shares its geometry and its material. */
function dogPart(key: string, pivot: readonly [number, number, number], sculpt: () => Vox): THREE.Mesh {
  let geo = dogGeometry.get(key);
  if (geo === undefined) {
    dogBody ??= sculptDogBody();
    const body = dogBody;
    const g = key === 'body' ? body : sculpt();
    const neighbours = key === 'body' ? undefined : (i: number, j: number, k: number): boolean => body.get(i, j, k) !== 0;
    geo = paintShape(`dog:${key}`, meshShape(g, { pivot, grain: DOG_GRAIN, top: 1.1, ...(neighbours === undefined ? {} : { neighbours }) }), DOG_PALETTE);
    dogGeometry.set(key, geo);
  }
  dogMat ??= voxelMaterial();
  const m = new THREE.Mesh(geo, dogMat);
  m.userData.shared = true;
  return m;
}

/** Musti, a Finnish Lapphund: fluffy, loyal, and not fond of middle managers. */
export function dogMesh(): { root: THREE.Group; legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D } {
  const root = new THREE.Group();
  root.add(dogPart('body', [0, 0, 0], sculptDogBody));
  const head = new THREE.Group();
  head.position.set(0, 0.84, 0.42);
  // Every part a hair smaller than drawn, so no face shares a plane with the body.
  const skull = dogPart('head', [0, 0.84, 0.42], sculptDogHead);
  skull.scale.setScalar(0.99);
  head.add(skull);
  root.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [x, z, front] of [[-0.12, 0.26, true], [0.12, 0.26, true], [-0.12, -0.26, false], [0.12, -0.26, false]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0.44, z);
    const cx = x < 0 ? -3 : 2;
    const leg = dogPart(`leg${cx}${+front}`, [x, 0.44, z], () => sculptDogLeg(cx, front));
    leg.scale.set(0.98, 1, 0.98);
    g.add(leg);
    root.add(g);
    legs.push(g);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.72, -0.4);
  tail.add(dogPart('tail', [0, 0.72, -0.4], sculptDogTail));
  tail.rotation.x = -0.25;
  root.add(tail);
  const sh = blobShadow(0.9);
  if (sh !== null) root.add(sh);
  return { root, legs, tail, head };
}

/** A floating monitor with a smiley that will not stop suggesting the FAQ. */
export function chatbotMesh(): THREE.Group {
  const g = new THREE.Group();
  const shell = rbox(0.8, 0.6, 0.25, lam(0xe8e8f0), 0, 1.45, 0);
  g.add(shell);
  const screen = new THREE.Mesh(new RoundedBoxGeometry(0.66, 0.46, 0.02, 2, 0.008), new THREE.MeshBasicMaterial({ color: 0x2a7fff }));
  screen.position.set(0, 1.45, 0.13);
  g.add(screen);
  const face = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-0.14, 0.14]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), face);
    eye.position.set(x, 1.52, 0.142);
    g.add(eye);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 6, 20, Math.PI), face);
  smile.position.set(0, 1.43, 0.142);
  smile.rotation.z = Math.PI;
  g.add(smile);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.2, 10), lam(0x888888));
  neck.position.set(0, 1.08, 0);
  g.add(neck);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), lam(0x888888));
  antenna.position.set(0, 1.9, 0);
  g.add(antenna);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
  bulb.position.set(0, 2.06, 0);
  g.add(bulb);
  const sh = blobShadow(0.7);
  if (sh !== null) g.add(sh);
  return g;
}

/** An unsanctioned deployment: a laptop on a tripod, firing unreviewed code. */
export function turretMesh(): THREE.Group {
  const g = new THREE.Group();
  const leg = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.35 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.95, 8), leg);
    l.position.set(Math.sin(a) * 0.2, 0.45, Math.cos(a) * 0.2);
    l.rotation.z = Math.sin(a) * 0.3;
    l.rotation.x = -Math.cos(a) * 0.3;
    g.add(l);
  }
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 12), leg).translateY(0.92));
  const lap = new THREE.Group();
  lap.position.y = 0.97;
  lap.add(rbox(0.6, 0.035, 0.42, lam(0x9aa0a6), 0, 0, 0));
  const lid = rbox(0.6, 0.4, 0.025, lam(0x9aa0a6), 0, 0.2, -0.2);
  lid.rotation.x = -0.25;
  lap.add(lid);
  const scr = box(0.52, 0.32, 0.01, new THREE.MeshBasicMaterial({ color: 0x00ff66 }), 0, 0.2, -0.185);
  scr.rotation.x = -0.25;
  lap.add(scr);
  lap.name = 'head';
  g.add(lap);
  const sh = blobShadow(0.8);
  if (sh !== null) g.add(sh);
  return g;
}

// ---------------------------------------------------------------- mökki upgrades

export function woodshedMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 0.1, 1.6, lam(0x6a4a2a), 0, 2.2, 0));
  for (const x of [-1.4, 1.4]) g.add(box(0.12, 2.2, 0.12, lam(0x5a3a1a), x, 1.1, 0.7));
  const log = lam(0xd8c8a8);
  for (let y = 0; y < 5; y++) {
    for (let i = 0; i < 8; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.3, 7), log);
      l.rotation.x = Math.PI / 2;
      l.position.set(-1.2 + i * 0.34, 0.15 + y * 0.26, -0.1);
      g.add(l);
    }
  }
  return g;
}

export function savusaunaMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3, 2.2, 3, lam(0x2a2018), 0, 1.1, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), lam(0x1a1410));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 2.8;
  g.add(roof);
  g.add(box(0.8, 1.7, 0.06, lam(0x3a2a1a), 0, 0.85, 1.52));
  return g;
}

export function boatMesh(): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.45, 3.2, 8, 1, true, 0, Math.PI), new THREE.MeshLambertMaterial({ color: 0xc8c0b0, side: THREE.DoubleSide }));
  hull.rotation.z = Math.PI / 2;
  hull.rotation.y = Math.PI / 2;
  hull.position.y = 0.25;
  g.add(hull);
  g.add(box(1.2, 0.06, 0.4, lam(0x8a6a4a), 0, 0.35, 0));
  return g;
}

export function potatoPatchMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(3.4, 0.12, 2.2, lam(0x4a3220), 0, 0.06, 0));
  const leaf = lam(0x4f8f3a);
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), leaf);
      p.position.set(-1.4 + i * 0.56, 0.3, -0.7 + r * 0.7);
      g.add(p);
    }
  }
  return g;
}

export function paljuMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.0, 16, 1, true), new THREE.MeshLambertMaterial({ color: 0x7a5232, side: THREE.DoubleSide })));
  (g.children[0] as THREE.Mesh).position.y = 0.5;
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.05, 16), new THREE.MeshLambertMaterial({ color: 0x4f9fbf, emissive: 0x0a2a3a }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.85;
  g.add(water);
  g.add(box(0.3, 1.2, 0.3, lam(0x333333), 1.2, 0.6, 0));
  return g;
}

export function kennelMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.0, 0.8, 1.2, lam(0xb03030), 0, 0.4, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 4), lam(0x5a2a1a));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 1.05;
  g.add(roof);
  g.add(box(0.4, 0.5, 0.02, lam(0x1a1010), 0, 0.3, 0.61));
  return g;
}

export function standingStonesMesh(): THREE.Group {
  const g = new THREE.Group();
  const stone = lam(0x8a8a90);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.4, 0), stone);
    s.scale.set(0.6, 1.8, 0.5);
    s.position.set(Math.sin(a) * 1.4, 0.7, Math.cos(a) * 1.4);
    g.add(s);
  }
  const glow = new THREE.PointLight(0x7dffea, 2, 5, 2);
  glow.position.y = 1;
  g.add(glow);
  return g;
}

export function dishMesh(): THREE.Group {
  const g = new THREE.Group();
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 3), new THREE.MeshLambertMaterial({ color: 0xdddddd, side: THREE.DoubleSide }));
  dish.rotation.x = -Math.PI / 2.5;
  g.add(dish);
  g.add(box(0.06, 0.6, 0.06, lam(0x888888), 0, -0.3, 0));
  return g;
}

export function bookshelfMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(1.2, 1.6, 0.4, lam(0x6a4a2a), 0, 0.8, 0));
  const colors = [0xc0392b, 0x2980b9, 0x27ae60, 0xf39c12, 0x8e44ad];
  for (let s = 0; s < 3; s++) {
    for (let i = 0; i < 6; i++) g.add(box(0.14, 0.34, 0.3, lam(colors[(i + s) % colors.length] ?? 0xffffff), -0.45 + i * 0.18, 0.3 + s * 0.5, 0.05));
  }
  return g;
}

export function boardMesh(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.1, 1.6, 0.1, lam(0x5a3a1a), -0.6, 0.8, 0));
  g.add(box(0.1, 1.6, 0.1, lam(0x5a3a1a), 0.6, 0.8, 0));
  g.add(box(1.4, 0.9, 0.06, lam(0x9a7a4a), 0, 1.4, 0));
  const paper = lam(0xf4f0e0);
  g.add(box(0.35, 0.45, 0.01, paper, -0.35, 1.45, 0.04));
  g.add(box(0.35, 0.3, 0.01, paper, 0.1, 1.5, 0.04));
  g.add(box(0.3, 0.35, 0.01, lam(0xfff27a), 0.45, 1.35, 0.04));
  return g;
}

/** A glowing, floating document for quest items and evidence. */
export function questItemMesh(color = 0xffd98a): THREE.Group {
  const g = new THREE.Group();
  const paper = box(0.42, 0.56, 0.02, new THREE.MeshLambertMaterial({ color: 0xf8f4e8, emissive: 0x332a10 }), 0, 0, 0);
  g.add(paper);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.03, 6, 24), new THREE.MeshBasicMaterial({ color }));
  g.add(halo);
  // A glow, not a light: adding lights recompiles every lit material.
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, depthWrite: false }));
  g.add(glow);
  return g;
}

// ---------------------------------------------------------------- the induction

/**
 * Facilities' training dummy: a padded torso on a post, a head with a face
 * drawn on in marker, a stripe of hazard tape. One group, so a wind-up can
 * draw the whole of it back (it has no arms to draw).
 */
export function dummyMesh(): THREE.Group {
  const g = new THREE.Group();
  const post = lam(0x5a5a5a);
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.08, 20), post).translateY(0.04));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), post).translateY(0.44));
  const canvas = lam(0xc9b48c);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.55, 4, 14), canvas);
  torso.position.y = 1.15;
  g.add(torso);
  // Hazard tape round the middle: where to aim.
  const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.315, 0.315, 0.1, 20, 1, true), lam(0xe8c21a));
  tape.position.y = 1.12;
  g.add(tape);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), canvas);
  head.position.y = 1.78;
  g.add(head);
  const marker = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const x of [-0.07, 0.07]) g.add(box(0.035, 0.035, 0.01, marker, x, 1.82, 0.195));
  g.add(box(0.12, 0.02, 0.01, marker, 0, 1.72, 0.195));
  const sh = blobShadow(0.9);
  if (sh !== null) g.add(sh);
  return g;
}

/**
 * The computer put in the lobby for the induction's ticket: a desk and a
 * monitor facing +z (turn the group to face it into the room). `screen` is
 * the monitor's texture, or null where there is no canvas to paint one.
 */
export function inductionTerminalMesh(screen: THREE.Texture | null): THREE.Group {
  const g = new THREE.Group();
  const wood = lam(0xc8b48a);
  g.add(box(1.8, 0.08, 1.1, wood, 0, 0.74, 0));
  const metal = lam(0x6a6a6a);
  for (const side of [-1, 1]) g.add(box(0.06, 0.72, 1.0, metal, side * 0.8, 0.36, 0));
  g.add(box(0.9, 0.62, 0.5, lam(0xd8d2bf), 0, 1.12, 0));
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 0.5), new THREE.MeshBasicMaterial({ color: screen === null ? 0x0a3a8c : 0xffffff, map: screen }));
  face.position.set(0, 1.12, 0.26);
  g.add(face);
  g.add(box(0.7, 0.04, 0.22, lam(0xcfc8b0), 0, 0.8, 0.35));
  return g;
}
