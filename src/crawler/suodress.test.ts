import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildRig, SHIRTS, SKINS } from './characters';
import { generateLevel, type Level } from './level';
import { generateMokki } from './mokki';
import { diffSnapshots, type DressActor, type DressHost, snapshotWorld, SUO_FOG, SuoDress } from './suodress';
import { THEMES } from './textures';

/**
 * Going under and coming back: SUO redresses a real generated floor (and the
 * mökki), and on the way out every material, light, fog value, exposure and
 * person is exactly as it was, and everything it made is freed.
 */

function office(floor: number): Level {
  const theme = THEMES[floor % THEMES.length];
  if (theme === undefined) throw new Error('no theme');
  // Headless (no canvas in node) but with the furniture, trim and lights the game builds.
  return generateLevel(floor, theme, 777 + floor, true, true);
}

/** A person as the game builds one: a voxel rig, a name sprite and an hp bar over their head. */
function person(x: number, z: number, k: number): DressActor {
  const rig = buildRig({ skin: SKINS[k % SKINS.length] ?? 0, hair: 0x2b1b0e, top: SHIRTS[k % SHIRTS.length] ?? 0, legs: 0x2e3440 });
  const root = rig.root;
  root.position.set(x, 0, z);
  root.rotation.y = k * 0.7;
  const name = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff }));
  name.position.y = 2.2;
  root.add(name);
  const hpBar = new THREE.Group();
  hpBar.add(new THREE.Mesh(new THREE.PlaneGeometry(1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff0000 })));
  hpBar.visible = k % 2 === 0;
  root.add(hpBar);
  return { root, pos: root.position, hpBar };
}

function hostFor(level: Level, outdoor: boolean): DressHost {
  const scene = new THREE.Scene();
  scene.add(level.group);
  scene.fog = outdoor ? new THREE.Fog(0xe8c0a8, 30, 150) : new THREE.Fog(0x1a1d22, 6, 42);
  scene.background = new THREE.Color(outdoor ? 0xf2c6a4 : 0x1a1d22);
  const lights: THREE.PointLight[] = [];
  for (let i = 0; i < 8; i++) {
    const l = new THREE.PointLight(0xfff4dc, 16, 16, 1.4);
    l.position.set(i * 3, 2.9, 4);
    l.visible = !outdoor && i < 5;
    l.castShadow = i === 0;
    scene.add(l);
    lights.push(l);
  }
  const carry = new THREE.PointLight(0xfff0dd, 4, 8, 1.5);
  carry.position.set(0, 0.3, 0);
  const hemi = new THREE.HemisphereLight(0xfff4dc, 0x3c3a36, 1.05);
  const sun = new THREE.DirectionalLight(0xffc890, outdoor ? 2.8 : 0);
  sun.castShadow = outdoor;
  scene.add(carry, hemi, sun);
  const actors = [person(level.start.x + 3, level.start.z, 0), person(level.start.x - 4, level.start.z + 2, 1), person(level.start.x, level.start.z + 6, 2)];
  for (const a of actors) scene.add(a.root);
  // One of them culled behind a wall when the vision starts: they must stay culled after it.
  (actors[1] as DressActor).root.visible = false;
  return { scene, group: level.group, lights, carry, hemi, sun, renderer: { toneMappingExposure: outdoor ? 0.82 : 1.15 }, bloom: { strength: 0.5, threshold: 0.82 }, actors };
}

function tagged(level: Level, tag: string): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  level.group.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.suo === tag) out.push(o as THREE.Mesh); });
  return out;
}

/** Every material in the world before the vision, with a flag that trips if anything frees one. */
function watchOriginals(h: DressHost): { disposed: string[] } {
  const seen = new Set<THREE.Material>();
  const out = { disposed: [] as string[] };
  const watch = (o: THREE.Object3D): void => {
    if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Sprite)) return;
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
    for (const m of mats) {
      if (seen.has(m)) continue;
      seen.add(m);
      m.addEventListener('dispose', () => out.disposed.push(m.type));
    }
  };
  h.group.traverse(watch);
  for (const a of h.actors) a.root.traverse(watch);
  return out;
}

describe('the SUO dress', () => {
  it('the world is built with its SUO surfaces tagged: walls, floor, ceiling, lamps', () => {
    const lv = office(1);
    for (const tag of ['wall', 'floor', 'ceiling', 'timber', 'lamp']) expect(tagged(lv, tag).length, tag).toBeGreaterThan(0);
    const m = generateMokki(4242, true);
    for (const tag of ['wall', 'floor', 'water']) expect(tagged(m, tag).length, `mökki ${tag}`).toBeGreaterThan(0);
  });

  for (const [where, outdoor, build] of [
    ['an office floor', false, () => office(2)],
    ['the basement', false, () => office(0)],
    ['the mökki', true, () => generateMokki(4242, true, ['woodshed', 'savusauna'])],
  ] as const) {
    it(`on ${where}: redresses in place, then restores exactly and frees what it made`, () => {
      const lv = build();
      const h = hostFor(lv, outdoor);
      const before = snapshotWorld(h);
      const originals = watchOriginals(h);
      const wall = tagged(lv, 'wall')[0] as THREE.Mesh;
      const floor = tagged(lv, 'floor')[0] as THREE.Mesh;
      const wallMat = wall.material;
      const floorMat = floor.material;

      const dress = new SuoDress(h);
      dress.apply(1234);

      // It looks like SUO: new surfaces, the lamps out, one low amber light, the fog in close.
      expect(wall.material).not.toBe(wallMat);
      expect(floor.material).not.toBe(floorMat);
      expect(wall.material).not.toBe(floor.material);
      for (const l of h.lights) expect(l.intensity).toBe(0);
      expect(h.sun.intensity).toBe(0);
      expect(h.carry.intensity).toBeGreaterThan(0);
      expect(h.carry.position.y).toBeLessThan(0);
      expect(h.carry.color.r).toBeGreaterThan(h.carry.color.b);
      const fog = h.scene.fog as THREE.Fog;
      expect(fog.color.getHex()).toBe(SUO_FOG);
      expect(fog.far).toBeLessThan(30);
      expect(diffSnapshots(before, snapshotWorld(h)).length).toBeGreaterThan(0);
      // People are dark shapes: one silhouette material, no sprites, no bars; blob shadows untouched.
      const silhouettes = new Set<THREE.Material>();
      for (const a of h.actors) {
        a.root.traverse((o) => {
          if (o instanceof THREE.Sprite) expect(o.visible).toBe(false);
          if (o instanceof THREE.Mesh && o.userData.blob !== true && !a.hpBar?.children.includes(o)) silhouettes.add(o.material as THREE.Material);
        });
        expect(a.hpBar?.visible).toBe(false);
      }
      expect(silhouettes.size).toBe(1);

      // They turn, slowly, to face you; nobody moves.
      const px = lv.start.x;
      const pz = lv.start.z;
      const a0 = h.actors[0] as DressActor;
      const pos0 = a0.pos.clone();
      const want = Math.atan2(px - a0.pos.x, pz - a0.pos.z);
      const gap = (y: number): number => Math.abs(Math.atan2(Math.sin(want - y), Math.cos(want - y)));
      const startGap = gap(a0.root.rotation.y);
      dress.turnPeople(px, pz, 0.1);
      expect(gap(a0.root.rotation.y)).toBeLessThan(startGap);
      expect(startGap - gap(a0.root.rotation.y)).toBeLessThan(0.1);
      for (let i = 0; i < 200; i++) dress.turnPeople(px, pz, 0.05);
      expect(gap(a0.root.rotation.y)).toBeLessThan(1e-6);
      expect(a0.pos.equals(pos0)).toBe(true);

      const made = [...dress.owned];
      expect(made.length).toBeGreaterThan(0);
      const freed = new Set<unknown>();
      for (const x of made) x.addEventListener('dispose', () => freed.add(x));

      dress.restore();

      expect(diffSnapshots(before, snapshotWorld(h))).toEqual([]);
      expect(wall.material).toBe(wallMat);
      expect(floor.material).toBe(floorMat);
      expect(freed.size).toBe(made.length);
      expect(originals.disposed).toEqual([]);
      // A second restore (the loop and a load racing) does nothing.
      dress.restore();
      expect(diffSnapshots(before, snapshotWorld(h))).toEqual([]);
    });
  }

  it('the snapshot notices what a restore could miss (the check has teeth)', () => {
    const lv = office(1);
    const h = hostFor(lv, false);
    const before = snapshotWorld(h);
    const cases: [string, () => void, () => void][] = [
      ['a light', () => { (h.lights[3] as THREE.PointLight).intensity = 0; }, () => { (h.lights[3] as THREE.PointLight).intensity = 16; }],
      ['the carried light', () => { h.carry.position.y = -0.8; }, () => { h.carry.position.y = 0.3; }],
      ['the hemisphere ground', () => { h.hemi.groundColor.setHex(0); }, () => { h.hemi.groundColor.setHex(0x3c3a36); }],
      ['the exposure', () => { h.renderer.toneMappingExposure = 1; }, () => { h.renderer.toneMappingExposure = 1.15; }],
      ['the bloom', () => { h.bloom.threshold = 0.7; }, () => { h.bloom.threshold = 0.82; }],
      ['a person turned', () => { (h.actors[0] as DressActor).root.rotation.y += 0.01; }, () => { (h.actors[0] as DressActor).root.rotation.y -= 0.01; }],
      ['a person hidden', () => { (h.actors[0] as DressActor).root.visible = false; }, () => { (h.actors[0] as DressActor).root.visible = true; }],
    ];
    const wall = tagged(lv, 'wall')[0] as THREE.Mesh;
    const wallMat = wall.material;
    const other = new THREE.MeshBasicMaterial();
    cases.push(['a wall material', () => { wall.material = other; }, () => { wall.material = wallMat; }]);
    const fog = h.scene.fog;
    cases.push(['the fog', () => { h.scene.fog = new THREE.Fog(0x1a1d22, 6, 41); }, () => { h.scene.fog = fog; }]);
    for (const [what, spoil, mend] of cases) {
      spoil();
      expect(diffSnapshots(before, snapshotWorld(h)).length, what).toBeGreaterThan(0);
      mend();
      expect(diffSnapshots(before, snapshotWorld(h)), what).toEqual([]);
    }
  });
});
