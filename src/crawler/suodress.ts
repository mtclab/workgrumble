import * as THREE from 'three';
import { normalMapFrom } from './graphics';
import { bogFloorTexture, peatCeilingTexture, peatWallTexture } from './textures';

/**
 * SUO's costume for the place you are standing in: the same floor, gone
 * under the bog. Walls, floor and ceiling take peat, timber and bog water;
 * the ceiling lights go out and one low amber light is left; the fog comes in
 * close and amber; people turn into dark silhouettes. Everything it touches
 * is written down first and put back exactly on the way out, and everything
 * it makes is freed.
 *
 * It knows nothing of the Game (only the handful of things it redresses), so
 * the unit tests can dress a real generated floor and check the restore.
 *
 * Which meshes are what is tagged where the world is built, in
 * `userData.suo`: 'wall', 'floor', 'ceiling', 'timber', 'lamp', 'water',
 * 'hide' (laid-over room floors, the mökki sky). `userData.suoRepeat` gives
 * a floor or ceiling its texture repeat (one tile per grid cell).
 */

export type SuoTag = 'wall' | 'floor' | 'ceiling' | 'timber' | 'lamp' | 'water' | 'hide';

/** A person on the floor, as far as the vision is concerned. */
export interface DressActor {
  readonly root: THREE.Object3D;
  readonly pos: THREE.Vector3;
  readonly hpBar?: THREE.Object3D;
  readonly bubble?: THREE.Object3D | null;
}

export interface DressHost {
  readonly scene: THREE.Scene;
  readonly group: THREE.Group;
  readonly lights: readonly THREE.PointLight[];
  /** The light the camera carries: the one that stays lit, low and amber. */
  readonly carry: THREE.PointLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;
  readonly renderer: { toneMappingExposure: number };
  readonly bloom: { strength: number; threshold: number };
  readonly actors: readonly DressActor[];
}

/** SUO's colours: peat-dark air, amber light. */
export const SUO_FOG = 0x2e1d0f;
const SUO_FOG_NEAR = 1.5;
const SUO_FOG_FAR = 24;
const SILHOUETTE = 0x0d0907;

/** Radians a silhouette turns per second to face you: slowly. */
const TURN_RATE = 0.45;

// ================================================================== the snapshot

/**
 * Everything a vision may touch, as plain values, so "put back exactly" is a
 * deep equality and not a hope. Objects are keyed by three's object id.
 */
export interface WorldSnapshot {
  /** `visible` is null where the game itself decides it frame by frame. */
  readonly objects: Record<number, { visible: boolean | null; rotY: number; material: string; castShadow: boolean }>;
  readonly lights: Record<number, { color: number; intensity: number; distance: number; decay: number; x: number; y: number; z: number; ground: number; castShadow: boolean }>;
  readonly fog: { color: number; near: number; far: number } | null;
  readonly background: number | null;
  readonly exposure: number;
  readonly bloom: { strength: number; threshold: number };
}

function materialKey(o: THREE.Object3D): string {
  if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.Sprite)) return '';
  const m = o.material as THREE.Material | THREE.Material[];
  return Array.isArray(m) ? m.map((x) => x.uuid).join(',') : m.uuid;
}

export function snapshotWorld(h: DressHost): WorldSnapshot {
  const objects: Record<number, WorldSnapshot['objects'][number]> = {};
  const lights: Record<number, WorldSnapshot['lights'][number]> = {};
  const note = (o: THREE.Object3D, engineShown = false): void => {
    objects[o.id] = { visible: engineShown ? null : o.visible, rotY: o.rotation.y, material: materialKey(o), castShadow: o.castShadow };
    if (o instanceof THREE.Light) {
      const p = o as THREE.PointLight;
      lights[o.id] = {
        color: o.color.getHex(), intensity: o.intensity,
        distance: typeof p.distance === 'number' ? p.distance : 0, decay: typeof p.decay === 'number' ? p.decay : 0,
        x: o.position.x, y: o.position.y, z: o.position.z,
        ground: o instanceof THREE.HemisphereLight ? o.groundColor.getHex() : 0,
        castShadow: o.castShadow,
      };
    }
  };
  h.group.traverse(note);
  // Whether a person, their speech bubble or their health bar is shown is the
  // game's call every frame (sight lines past walls, distance, a fight), not
  // something a vision changes and must put back: record the rest of them.
  for (const a of h.actors) a.root.traverse((o) => note(o, o === a.root || o === a.bubble || o === a.hpBar));
  for (const l of [...h.lights, h.carry, h.hemi, h.sun]) note(l);
  const fog = h.scene.fog;
  const bg = h.scene.background;
  return {
    objects, lights,
    fog: fog instanceof THREE.Fog ? { color: fog.color.getHex(), near: fog.near, far: fog.far } : null,
    background: bg instanceof THREE.Color ? bg.getHex() : null,
    exposure: h.renderer.toneMappingExposure,
    bloom: { strength: h.bloom.strength, threshold: h.bloom.threshold },
  };
}

/** Every way `after` differs from `before`, one line each; empty when restored exactly. */
export function diffSnapshots(before: WorldSnapshot, after: WorldSnapshot): string[] {
  const out: string[] = [];
  const cmp = (what: string, a: unknown, b: unknown): void => {
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push(`${what}: ${JSON.stringify(a)} -> ${JSON.stringify(b)}`);
  };
  for (const id of new Set([...Object.keys(before.objects), ...Object.keys(after.objects)])) cmp(`object ${id}`, before.objects[Number(id)], after.objects[Number(id)]);
  for (const id of new Set([...Object.keys(before.lights), ...Object.keys(after.lights)])) cmp(`light ${id}`, before.lights[Number(id)], after.lights[Number(id)]);
  cmp('fog', before.fog, after.fog);
  cmp('background', before.background, after.background);
  cmp('exposure', before.exposure, after.exposure);
  cmp('bloom', before.bloom, after.bloom);
  return out;
}

// ================================================================== the dress

type Swap = [THREE.Mesh, THREE.Material | THREE.Material[]];

export class SuoDress {
  private readonly h: DressHost;
  /** Materials and textures made for this vision: all freed on restore. */
  readonly owned: (THREE.Material | THREE.Texture)[] = [];
  private readonly swaps: Swap[] = [];
  private readonly shown: [THREE.Object3D, boolean][] = [];
  private readonly turned: [THREE.Object3D, number][] = [];
  private readonly lit: [THREE.Light, number, boolean][] = [];
  private readonly mats = new Map<SuoTag, THREE.Material>();
  private carry: { color: number; intensity: number; distance: number; decay: number; pos: THREE.Vector3 } | null = null;
  private hemi = { color: 0, ground: 0, intensity: 0 };
  private fog: THREE.Fog | THREE.FogExp2 | null = null;
  private background: THREE.Color | THREE.Texture | THREE.CubeTexture | null = null;
  private exposure = 1;
  private bloom = { strength: 0, threshold: 0 };
  private silhouette: THREE.MeshBasicMaterial | null = null;
  private dressed = false;

  constructor(host: DressHost) {
    this.h = host;
  }

  /** Put SUO on. Textures only where there is a document to paint them on. */
  apply(seed: number): void {
    if (this.dressed) return;
    this.dressed = true;
    const h = this.h;
    // Surfaces.
    h.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) && !(o instanceof THREE.InstancedMesh)) return;
      const tag = o.userData.suo as SuoTag | undefined;
      if (tag === undefined) return;
      if (tag === 'hide') {
        this.hide(o);
        return;
      }
      const mesh = o as THREE.Mesh;
      this.swaps.push([mesh, mesh.material]);
      mesh.material = this.material(tag, mesh, seed);
    });
    // Lights: every lamp in the place goes out (the count stays the same, so
    // no shader has to be rebuilt for it), and the carried light is the one
    // left: low, amber, short.
    for (const l of h.lights) this.dim(l);
    h.group.traverse((o) => { if (o instanceof THREE.Light) this.dim(o); });
    this.dim(h.sun);
    const c = h.carry;
    this.carry = { color: c.color.getHex(), intensity: c.intensity, distance: c.distance, decay: c.decay, pos: c.position.clone() };
    c.color.setHex(0xffa24a);
    c.intensity = 7;
    c.distance = 12;
    c.decay = 1.3;
    c.position.set(0, -0.8, 0);
    this.hemi = { color: h.hemi.color.getHex(), ground: h.hemi.groundColor.getHex(), intensity: h.hemi.intensity };
    h.hemi.color.setHex(0x6b4a26);
    h.hemi.groundColor.setHex(0x120b06);
    h.hemi.intensity = 0.32;
    // The air.
    this.fog = h.scene.fog;
    this.background = h.scene.background;
    h.scene.fog = new THREE.Fog(SUO_FOG, SUO_FOG_NEAR, SUO_FOG_FAR);
    h.scene.background = new THREE.Color(SUO_FOG);
    this.exposure = h.renderer.toneMappingExposure;
    h.renderer.toneMappingExposure = 1.05;
    this.bloom = { strength: h.bloom.strength, threshold: h.bloom.threshold };
    h.bloom.strength = 0.6;
    h.bloom.threshold = 0.7;
    // People: dark shapes, no names, no bubbles, no bars.
    this.silhouette = this.own(new THREE.MeshBasicMaterial({ color: SILHOUETTE }));
    for (const a of h.actors) {
      this.turned.push([a.root, a.root.rotation.y]);
      if (a.hpBar !== undefined) this.hide(a.hpBar);
      a.root.traverse((o) => {
        if (o instanceof THREE.Sprite) this.hide(o);
        else if (o instanceof THREE.Mesh && o.userData.blob !== true && o !== a.hpBar && !isUnder(o, a.hpBar)) {
          const mesh = o as THREE.Mesh;
          this.swaps.push([mesh, mesh.material]);
          mesh.material = this.silhouette as THREE.MeshBasicMaterial;
        }
      });
    }
  }

  /** Every silhouette turns, slowly, to face the player. No other movement. */
  turnPeople(px: number, pz: number, dt: number): void {
    const step = TURN_RATE * dt;
    for (const [root] of this.turned) {
      const want = Math.atan2(px - root.position.x, pz - root.position.z);
      let d = want - root.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      root.rotation.y += Math.max(-step, Math.min(step, d));
    }
  }

  /** Take SUO off: everything back as it was, everything made for it freed. */
  restore(): void {
    if (!this.dressed) return;
    this.dressed = false;
    const h = this.h;
    for (const [mesh, mat] of this.swaps) mesh.material = mat;
    for (const [o, v] of this.shown) o.visible = v;
    for (const [o, y] of this.turned) o.rotation.y = y;
    for (const [l, i, cast] of this.lit) {
      l.intensity = i;
      l.castShadow = cast;
    }
    const c = this.carry;
    if (c !== null) {
      h.carry.color.setHex(c.color);
      h.carry.intensity = c.intensity;
      h.carry.distance = c.distance;
      h.carry.decay = c.decay;
      h.carry.position.copy(c.pos);
    }
    h.hemi.color.setHex(this.hemi.color);
    h.hemi.groundColor.setHex(this.hemi.ground);
    h.hemi.intensity = this.hemi.intensity;
    h.scene.fog = this.fog;
    h.scene.background = this.background;
    h.renderer.toneMappingExposure = this.exposure;
    h.bloom.strength = this.bloom.strength;
    h.bloom.threshold = this.bloom.threshold;
    for (const x of this.owned) x.dispose();
    this.owned.length = 0;
    this.swaps.length = 0;
    this.shown.length = 0;
    this.turned.length = 0;
    this.lit.length = 0;
    this.mats.clear();
    this.silhouette = null;
  }

  private own<T extends THREE.Material | THREE.Texture>(x: T): T {
    this.owned.push(x);
    return x;
  }

  private hide(o: THREE.Object3D): void {
    this.shown.push([o, o.visible]);
    o.visible = false;
  }

  private dim(l: THREE.Light): void {
    // A dark light keeps its shadow flag (changing it would rebuild shaders),
    // but a settings change mid-vision may flip it: it goes back as found.
    this.lit.push([l, l.intensity, l.castShadow]);
    l.intensity = 0;
  }

  /** One material per kind of surface, made the first time a mesh needs it. */
  private material(tag: Exclude<SuoTag, 'hide'>, mesh: THREE.Mesh, seed: number): THREE.Material {
    const have = this.mats.get(tag);
    if (have !== undefined) return have;
    const paint = typeof document !== 'undefined';
    const tex = (make: () => THREE.CanvasTexture): THREE.CanvasTexture | null => {
      if (!paint) return null;
      const t = this.own(make());
      const rep = mesh.userData.suoRepeat as [number, number] | undefined;
      if (rep !== undefined) t.repeat.set(rep[0], rep[1]);
      return t;
    };
    const normal = (t: THREE.CanvasTexture | null, strength: number, invert = false): THREE.CanvasTexture | null => {
      const n = normalMapFrom(t, strength, invert);
      if (n !== null) {
        this.own(n);
        if (t !== null) n.repeat.copy(t.repeat);
      }
      return n;
    };
    let m: THREE.Material;
    switch (tag) {
      case 'wall': {
        const t = tex(() => peatWallTexture(seed));
        m = new THREE.MeshStandardMaterial({ map: t, normalMap: normal(t, 2.2), roughness: 0.95, metalness: 0 });
        break;
      }
      case 'floor': {
        // Wet: the carried light catches in the pools.
        const t = tex(() => bogFloorTexture(seed + 1));
        m = new THREE.MeshStandardMaterial({ map: t, normalMap: normal(t, 2, true), roughness: 0.32, metalness: 0.15 });
        break;
      }
      case 'ceiling': {
        const t = tex(() => peatCeilingTexture(seed + 2));
        m = new THREE.MeshStandardMaterial({ map: t, normalMap: normal(t, 1.5, true), roughness: 1, metalness: 0 });
        break;
      }
      case 'timber':
        m = new THREE.MeshStandardMaterial({ color: 0x3a281a, roughness: 0.85, metalness: 0 });
        break;
      case 'lamp':
        // A dead tube: dark glass that still takes a little of the light.
        m = new THREE.MeshStandardMaterial({ color: 0x1a1612, roughness: 0.3, metalness: 0.2 });
        break;
      case 'water':
        m = new THREE.MeshStandardMaterial({ color: 0x0c1412, roughness: 0.08, metalness: 0.35 });
        break;
    }
    this.own(m);
    this.mats.set(tag, m);
    return m;
  }
}

function isUnder(o: THREE.Object3D, parent: THREE.Object3D | undefined): boolean {
  if (parent === undefined) return false;
  for (let p = o.parent; p !== null; p = p.parent) if (p === parent) return true;
  return false;
}
