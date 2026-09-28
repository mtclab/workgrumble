import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { blobShadow } from './characters';

/**
 * One-off models that are not office people: Musti the dog, the chatbot,
 * Shadow IT's unsanctioned turrets, and the bits the mökki grows as you
 * upgrade it.
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

/** Musti, a Finnish Lapphund: fluffy, loyal, and not fond of middle managers. */
export function dogMesh(): { root: THREE.Group; legs: THREE.Object3D[]; tail: THREE.Object3D; head: THREE.Object3D } {
  const root = new THREE.Group();
  const fur = lam(0x3a2a1e);
  const cream = lam(0xe6d2b0);
  const body = rbox(0.42, 0.4, 0.8, fur, 0, 0.55, 0);
  root.add(body);
  root.add(rbox(0.3, 0.22, 0.5, cream, 0, 0.42, 0.05));
  const head = new THREE.Group();
  head.position.set(0, 0.82, 0.42);
  head.add(rbox(0.34, 0.3, 0.3, fur, 0, 0, 0));
  head.add(rbox(0.2, 0.16, 0.2, cream, 0, -0.05, 0.2));
  head.add(box(0.07, 0.05, 0.03, lam(0x111111), 0, -0.02, 0.31));
  for (const x of [-0.1, 0.1]) {
    head.add(box(0.06, 0.06, 0.02, lam(0x111111), x, 0.06, 0.16));
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 4), fur);
    ear.position.set(x, 0.22, -0.02);
    head.add(ear);
  }
  root.add(head);
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[-0.14, 0.28], [0.14, 0.28], [-0.14, -0.28], [0.14, -0.28]] as const) {
    const g = new THREE.Group();
    g.position.set(x, 0.42, z);
    g.add(rbox(0.12, 0.42, 0.12, fur, 0, -0.2, 0));
    root.add(g);
    legs.push(g);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0.72, -0.42);
  tail.add(rbox(0.16, 0.16, 0.36, cream, 0, 0.12, -0.08));
  tail.rotation.x = -0.9;
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
  const screen = box(0.66, 0.46, 0.02, new THREE.MeshBasicMaterial({ color: 0x2a7fff }), 0, 1.45, 0.13);
  g.add(screen);
  const face = new THREE.MeshBasicMaterial({ color: 0xffffff });
  g.add(box(0.08, 0.08, 0.02, face, -0.14, 1.52, 0.15));
  g.add(box(0.08, 0.08, 0.02, face, 0.14, 1.52, 0.15));
  g.add(box(0.3, 0.04, 0.02, face, 0, 1.36, 0.15));
  const antenna = box(0.03, 0.3, 0.03, lam(0x888888), 0, 1.9, 0);
  g.add(antenna);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dff9a }));
  bulb.position.set(0, 2.06, 0);
  g.add(bulb);
  const sh = blobShadow(0.7);
  if (sh !== null) g.add(sh);
  return g;
}

/** An unsanctioned deployment: a laptop on a tripod, firing unreviewed code. */
export function turretMesh(): THREE.Group {
  const g = new THREE.Group();
  const leg = lam(0x333333);
  for (let i = 0; i < 3; i++) {
    const l = box(0.05, 0.9, 0.05, leg, Math.sin((i / 3) * Math.PI * 2) * 0.2, 0.45, Math.cos((i / 3) * Math.PI * 2) * 0.2);
    l.rotation.z = Math.sin((i / 3) * Math.PI * 2) * 0.3;
    l.rotation.x = -Math.cos((i / 3) * Math.PI * 2) * 0.3;
    g.add(l);
  }
  const lap = new THREE.Group();
  lap.position.y = 0.95;
  lap.add(box(0.6, 0.04, 0.42, lam(0x9aa0a6), 0, 0, 0));
  const lid = box(0.6, 0.4, 0.03, lam(0x9aa0a6), 0, 0.2, -0.2);
  lid.rotation.x = -0.25;
  lap.add(lid);
  lap.add(box(0.5, 0.3, 0.01, new THREE.MeshBasicMaterial({ color: 0x00ff66 }), 0, 0.2, -0.18));
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
