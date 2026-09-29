import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildRig, disposeRig, type Expression, HAIRS, type Outfit, type Rig, setExpression, SHIRTS, SKINS, TROUSERS, viewmodelArm } from './characters';
import { disposeTree } from './dispose';
import { dogMesh } from './meshes';

/** The voxel people: every outfit option builds, shares its caches, and stays in budget. */

const EXPRESSIONS: readonly Expression[] = ['neutral', 'angry', 'happy', 'smug', 'kind', 'stern', 'tired'];
const STYLES = ['short', 'long', 'bun', 'bald', 'hood', 'tonttu'] as const;
const PLAIN: Outfit = { skin: 0xf1c9a5, hair: 0x6b4423, top: 0x8fb3d9, legs: 0x2e3440 };
const EVERYTHING: Outfit = {
  skin: 0x8d5524, hair: 0x111111, top: 0x8fb3d9, legs: 0x2e3440, shoes: 0x5b3a24, tie: 0xc0392b, lanyard: 0x2266cc,
  cardigan: 0x8e44ad, glasses: true, headset: true, hairStyle: 'long', backpack: 0x444444, beard: 0x222222, scale: 1.15, face: 'angry',
};

/** Every outfit option on and off, across every hair style and a spread of colours. */
function outfits(): Outfit[] {
  const out: Outfit[] = [PLAIN, EVERYTHING];
  let n = 0;
  for (const hairStyle of STYLES) {
    for (let bits = 0; bits < 64; bits += 5) {
      n++;
      out.push({
        skin: SKINS[n % SKINS.length] ?? 0, hair: HAIRS[n % HAIRS.length] ?? 0, top: SHIRTS[n % SHIRTS.length] ?? 0, legs: TROUSERS[n % TROUSERS.length] ?? 0,
        hairStyle, face: EXPRESSIONS[n % EXPRESSIONS.length] ?? 'neutral',
        ...(bits & 1 ? { tie: 0xc0392b } : {}),
        ...(bits & 2 ? { lanyard: 0xf1c40f } : {}),
        ...(bits & 4 ? { cardigan: 0x2e86c1 } : {}),
        ...(bits & 8 ? { glasses: true, backpack: 0x7d3c98 } : {}),
        ...(bits & 16 ? { headset: true, beard: 0x4a3020 } : {}),
        ...(bits & 32 ? { scale: 1.15, shoes: 0xd9d4ca } : {}),
      });
    }
  }
  return out;
}

function meshesOf(rig: Rig): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.blob !== true) out.push(o as THREE.Mesh);
  });
  return out;
}

function triangles(root: THREE.Object3D): number {
  let t = 0;
  root.traverse((o) => {
    if (o instanceof THREE.Mesh && o.userData.blob !== true) t += ((o.geometry as THREE.BufferGeometry).index?.count ?? 0) / 3;
  });
  return t;
}

/** A checksum of every position and colour in a rig. */
function checksum(rig: Rig): number {
  let s = 0;
  for (const m of meshesOf(rig)) {
    const g = m.geometry;
    for (const name of ['position', 'color']) {
      const a = g.getAttribute(name).array;
      for (let i = 0; i < a.length; i++) s = (s * 31 + Math.round((a[i] ?? 0) * 1e4)) % 1e9;
    }
  }
  return s;
}

describe('voxel people', () => {
  it('builds every option with one shared material, cached geometry and sane buffers', () => {
    for (const o of outfits()) {
      const rig = buildRig(o);
      expect(rig.materials).toHaveLength(1);
      expect(rig.face.material).toBe(rig.faceMat);
      expect(rig.face.parent).toBe(rig.head);
      expect(rig.hand.parent).toBe(rig.armR);
      for (const m of meshesOf(rig)) {
        expect(m.userData.shared).toBe(true);
        expect(rig.materials).toContain(m.material);
        const g = m.geometry;
        expect(g.getAttribute('normal')).toBeDefined();
        expect(Array.from(g.getAttribute('position').array).every((v) => Number.isFinite(v))).toBe(true);
        const colours = Array.from(g.getAttribute('color').array);
        expect(colours.reduce((a, b) => Math.min(a, b), 1)).toBeGreaterThanOrEqual(0);
        expect(colours.reduce((a, b) => Math.max(a, b), 0)).toBeLessThanOrEqual(1);
      }
      expect(triangles(rig.root)).toBeLessThan(8000);
      disposeRig(rig);
    }
  });

  it('keeps the pivots animation and held tools rely on', () => {
    const rig = buildRig(PLAIN);
    expect(rig.legL.position.toArray()).toEqual([-0.1, 0.92, 0]);
    expect(rig.legR.position.toArray()).toEqual([0.1, 0.92, 0]);
    expect(rig.armL.position.toArray()).toEqual([-0.228, 1.49, 0]);
    expect(rig.armR.position.toArray()).toEqual([0.228, 1.49, 0]);
    expect(rig.head.position.y).toBe(1.63);
    rig.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.root);
    expect(box.max.y).toBeGreaterThan(1.75);
    expect(box.max.y).toBeLessThan(1.96);
    expect(box.min.y).toBeGreaterThan(-1e-6);
    // The fist is where the hand group is.
    const hand = new THREE.Vector3();
    rig.hand.getWorldPosition(hand);
    expect(hand.y).toBeGreaterThan(0.84);
    expect(hand.y).toBeLessThan(1.0);
    expect(buildRig({ ...PLAIN, hairStyle: 'tonttu' }).root.scale.x).toBeCloseTo(0.6);
    expect(buildRig({ ...PLAIN, scale: 1.15 }).root.scale.x).toBeCloseTo(1.15);
  });

  it('makes every outfit field show', () => {
    const geometries = (o: Outfit): THREE.BufferGeometry[] => meshesOf(buildRig(o)).map((m) => m.geometry);
    const base = geometries(PLAIN);
    const changes: Partial<Outfit>[] = [
      { skin: 0x5c3a1e }, { hair: 0xd8b36a }, { top: 0xd98fb3 }, { legs: 0x4a4036 }, { shoes: 0xd9d4ca }, { tie: 0xc0392b },
      { lanyard: 0x2266cc }, { cardigan: 0x8e44ad }, { glasses: true }, { headset: true }, { backpack: 0x444444 }, { beard: 0x222222 },
      { face: 'happy' }, { scale: 1.15 }, ...STYLES.filter((s) => s !== 'short').map((hairStyle) => ({ hairStyle })),
    ];
    for (const c of changes) {
      const other = geometries({ ...PLAIN, ...c });
      const same = other.length === base.length && other.every((g, i) => g === base[i]);
      expect(same, JSON.stringify(c)).toBe(false);
    }
  });

  it('changes mood by swapping only the cached face', () => {
    const rig = buildRig(EVERYTHING);
    const before = meshesOf(rig).filter((m) => m !== rig.face).map((m) => m.geometry);
    const faces = new Set<THREE.BufferGeometry>();
    for (const e of EXPRESSIONS) {
      setExpression(rig, e);
      expect(rig.expression).toBe(e);
      faces.add(rig.face.geometry);
    }
    expect(faces.size).toBe(EXPRESSIONS.length);
    expect(meshesOf(rig).filter((m) => m !== rig.face).map((m) => m.geometry)).toEqual(before);
    const again = buildRig(EVERYTHING);
    setExpression(again, 'tired');
    expect(again.face.geometry).toBe(rig.face.geometry);
  });

  it('leaves cached geometry alone when a rig is disposed', () => {
    const rig = buildRig(EVERYTHING);
    let disposed = 0;
    for (const m of meshesOf(rig)) (m.geometry).addEventListener('dispose', () => disposed++);
    disposeRig(rig);
    disposeTree(rig.root, true);
    expect(disposed).toBe(0);
  });

  it('builds the same figures from a fresh module', async () => {
    const mine = [EVERYTHING, PLAIN, { ...PLAIN, hairStyle: 'bun' as const, glasses: true }].map((o) => checksum(buildRig(o)));
    vi.resetModules();
    const fresh = await import('./characters');
    // Warm the fresh caches in a different order, to catch order-dependent state.
    fresh.buildRig({ ...PLAIN, hairStyle: 'hood' });
    const theirs = [EVERYTHING, PLAIN, { ...PLAIN, hairStyle: 'bun' as const, glasses: true }].map((o) => checksum(fresh.buildRig(o)));
    expect(theirs).toEqual(mine);
  });

  it('builds a warm crowd quickly', () => {
    const list = outfits();
    for (const o of list) buildRig(o);
    const t = performance.now();
    for (let i = 0; i < 4; i++) for (const o of list) buildRig(o);
    // Repeated outfits cost a few groups each; this is a generous bound.
    expect((performance.now() - t) / (4 * list.length)).toBeLessThan(3);
  });
});

describe('Musti and your own arm', () => {
  it('builds the dog from shared voxel parts, jointed as before', () => {
    const d = dogMesh();
    expect(d.legs).toHaveLength(4);
    expect(d.head.position.toArray()).toEqual([0, 0.84, 0.42]);
    expect(d.tail.position.toArray()).toEqual([0, 0.72, -0.4]);
    let meshes = 0;
    d.root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.userData.blob === true) return;
      meshes++;
      expect(o.userData.shared).toBe(true);
    });
    expect(meshes).toBe(7);
    expect(triangles(d.root)).toBeLessThan(6000);
    expect((dogMesh().root.children[0] as THREE.Mesh).geometry).toBe((d.root.children[0] as THREE.Mesh).geometry);
  });

  it('gives the first-person arm a shared voxel mesh', () => {
    const arm = viewmodelArm(PLAIN);
    expect(arm.userData.shared).toBe(true);
    expect(viewmodelArm(PLAIN).geometry).toBe(arm.geometry);
    const box = new THREE.Box3().setFromObject(arm);
    expect(box.max.z).toBeGreaterThan(0.3);
    expect(box.min.z).toBeLessThan(0);
  });
});
