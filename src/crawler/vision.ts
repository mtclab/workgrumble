import * as THREE from 'three';
import { sfx } from './audio';
import type { Game } from './game';
import { isSolidAt, toCell } from './level';
import { fx } from './rng';
import { farthestCell, figureCell, SteamClock, SUO_LINES } from './suo';
import { diffSnapshots, SuoDress, snapshotWorld, type WorldSnapshot } from './suodress';

/**
 * A vision: thirty seconds under the steam (see `docs/SPEC_SUO.md`).
 *
 * The place you are standing in is redressed in place (`SuoDress`), the HUD
 * gives way to one serif line and a thin steam meter, and the Löylyhenki
 * stands somewhere 10 to 18 m off. Reach it and press E for the blessing, or
 * let the steam run out; either way you surface with nothing lost. The Game
 * owns the when (the trigger, saves, pause); this owns the what.
 */

/** Press E within this many metres of the figure. */
const REACH = 2.4;
/** Closer than this, the line says it is waiting for you. */
const NEAR = 3.6;
/** The crossing's stop, in seconds. */
export const CROSSING_STOP = 0.07;
/** How long the way-under line stays before the seek line. */
const ENTER_LINE = 3;
/** How long a passing line (a refused save) holds the screen. */
const NOTE_LINE = 2.5;
/** Walking pace in the bog: the ground takes your feet. */
const BOG_PACE = 0.8;

export type VisionEnd = 'blessed' | 'faded';

/** The serif line, the steam meter and the white frame: DOM made once per Game, kept hidden between visions. */
class Veil {
  readonly root: HTMLDivElement;
  private readonly line: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly flashEl: HTMLDivElement;
  private shownLine = '';
  private shownFill = -1;

  constructor(mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'suo-veil';
    this.line = document.createElement('div');
    this.line.className = 'suo-line';
    const meter = document.createElement('div');
    meter.className = 'suo-meter';
    this.fill = document.createElement('div');
    this.fill.className = 'suo-meter-fill';
    meter.append(this.fill);
    this.root.append(this.line, meter);
    this.flashEl = document.createElement('div');
    this.flashEl.className = 'suo-flash';
    mount.append(this.root, this.flashEl);
  }

  show(on: boolean): void {
    this.root.style.display = on ? 'flex' : 'none';
    if (!on) {
      this.shownLine = '';
      this.shownFill = -1;
    }
  }

  /** Only touches the DOM when something changed: this runs every frame. */
  set(line: string, fraction: number): void {
    if (line !== this.shownLine) {
      this.shownLine = line;
      this.line.textContent = line;
    }
    const f = Math.round(fraction * 1000);
    if (f !== this.shownFill) {
      this.shownFill = f;
      this.fill.style.transform = `scaleX(${f / 1000})`;
    }
  }

  /** One white frame: shown now, gone after the next frame is drawn. */
  flash(): void {
    this.flashEl.style.display = 'block';
    requestAnimationFrame(() => requestAnimationFrame(() => { this.flashEl.style.display = 'none'; }));
  }
}

const veils = new WeakMap<HTMLElement, Veil>();

function veilFor(mount: HTMLElement): Veil {
  let v = veils.get(mount);
  if (v === undefined) {
    v = new Veil(mount);
    veils.set(mount, v);
  }
  return v;
}

/**
 * The Löylyhenki: a tall column of steam with a little light in its chest.
 * Additive and outside the fog, so it reads as a glow through the murk from
 * the far end of the room.
 */
function buildFigure(): { group: THREE.Group; puffs: THREE.Mesh[]; owned: (THREE.Material | THREE.BufferGeometry)[] } {
  const group = new THREE.Group();
  group.name = 'loylyhenki';
  const geo = new THREE.SphereGeometry(1, 16, 12);
  const steam = new THREE.MeshBasicMaterial({ color: 0xe8e2d4, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const core = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const puffs: THREE.Mesh[] = [];
  // Wider at the shoulders, thinning towards the ground: steam rising off something standing.
  const column: readonly [number, number, number][] = [
    [0.3, 0.26, 0.5], [0.8, 0.32, 0.55], [1.3, 0.4, 0.6], [1.75, 0.46, 0.55], [2.15, 0.4, 0.45], [2.55, 0.27, 0.34],
  ];
  for (const [y, r, h] of column) {
    const m = new THREE.Mesh(geo, steam);
    m.position.y = y;
    m.scale.set(r, h, r);
    m.userData.baseY = y;
    m.userData.baseR = r;
    group.add(m);
    puffs.push(m);
  }
  const heart = new THREE.Mesh(geo, core);
  heart.position.y = 1.65;
  heart.scale.setScalar(0.09);
  group.add(heart);
  return { group, puffs, owned: [geo, steam, core] };
}

export class Vision {
  readonly clock = new SteamClock();
  /** Where the Löylyhenki stands (world x, z). */
  readonly at: { readonly x: number; readonly z: number };
  private readonly g: Game;
  private readonly dress: SuoDress;
  private readonly before: WorldSnapshot;
  private readonly veil: Veil;
  private readonly figure: THREE.Group;
  private readonly puffs: THREE.Mesh[];
  private readonly owned: (THREE.Material | THREE.BufferGeometry)[];
  private readonly steamAt = new THREE.Vector3();
  private age = 0;
  private noteT = 0;
  private note = '';
  private steamIn = 0;
  private ended = false;

  constructor(g: Game) {
    this.g = g;
    const host = {
      scene: g.scene, group: g.level.group, lights: g.lights, carry: g.carry, hemi: g.hemi, sun: g.sun,
      renderer: g.renderer, bloom: g.pipeline.bloom,
      // The people as they are now: nobody arrives or leaves while you are under.
      actors: [...g.actors],
    };
    this.before = snapshotWorld(host);
    this.dress = new SuoDress(host);
    this.dress.apply((g.save.seed ^ g.save.floor * 131) >>> 0);
    const p = g.player.pos;
    this.at = figureCell(g.level, p.x, p.z, fx) ?? farthestCell(g.level, p.x, p.z);
    const fig = buildFigure();
    this.figure = fig.group;
    this.puffs = fig.puffs;
    this.owned = fig.owned;
    this.figure.position.set(this.at.x, 0, this.at.z);
    g.scene.add(this.figure);
    this.steamAt.set(this.at.x, 1.2, this.at.z);
    this.veil = veilFor(g.mount);
    this.veil.show(true);
    this.veil.flash();
    this.veil.set(SUO_LINES.enter, 1);
    sfx.crossing(true);
    sfx.setAmbient('suo');
  }

  /** Metres from the player to the figure, on the ground. */
  distance(): number {
    const p = this.g.player.pos;
    return Math.hypot(p.x - this.at.x, p.z - this.at.z);
  }

  /** A passing line in place of the usual one (the HUD is not there to toast in). */
  say(line: string): void {
    this.note = line;
    this.noteT = NOTE_LINE;
  }

  /**
   * One tick of play under the steam: look, walk, reach for the figure. Null
   * while it goes on; how it ended once it has.
   */
  update(dt: number): VisionEnd | null {
    const g = this.g;
    this.age += dt;
    this.noteT = Math.max(0, this.noteT - dt);
    const gone = this.clock.tick(dt);
    g.look();
    if (g.input.hit('Escape')) {
      g.pause();
      return null;
    }
    g.walk(dt, BOG_PACE);
    const p = g.player.pos;
    this.dress.turnPeople(p.x, p.z, dt);
    this.animateFigure(dt);
    const d = this.distance();
    if (d <= REACH && g.hit('interact')) return 'blessed';
    if (gone) return 'faded';
    const line = this.noteT > 0 ? this.note : this.age < ENTER_LINE ? SUO_LINES.enter : d <= NEAR ? SUO_LINES.near : SUO_LINES.seek;
    this.veil.set(line, this.clock.fraction);
    return null;
  }

  private animateFigure(dt: number): void {
    const t = this.age;
    for (let i = 0; i < this.puffs.length; i++) {
      const m = this.puffs[i] as THREE.Mesh;
      const r = m.userData.baseR as number;
      const breathe = 1 + Math.sin(t * 1.3 + i * 0.9) * 0.08;
      m.position.x = Math.sin(t * 0.7 + i * 1.7) * 0.07;
      m.position.z = Math.cos(t * 0.6 + i * 1.3) * 0.05;
      m.position.y = (m.userData.baseY as number) + Math.sin(t * 0.9 + i) * 0.04;
      m.scale.x = r * breathe;
      m.scale.z = r * breathe;
    }
    this.steamIn -= dt;
    if (this.steamIn <= 0) {
      this.steamIn = 0.35;
      this.g.particles.emit('steam', this.steamAt, 3, 0.45);
    }
  }

  /**
   * Leave: everything put back, everything made for the vision freed. Returns
   * how the world differs from before it (empty when the restore is exact).
   * `loud` is the crossing back (white frame, the hiss rising into the hum);
   * a vision cut short by a load or the title screen leaves quietly.
   */
  end(loud: boolean): string[] {
    if (this.ended) return [];
    this.ended = true;
    const g = this.g;
    this.dress.restore();
    g.scene.remove(this.figure);
    for (const x of this.owned) x.dispose();
    const after = snapshotWorld({
      scene: g.scene, group: g.level.group, lights: g.lights, carry: g.carry, hemi: g.hemi, sun: g.sun,
      renderer: g.renderer, bloom: g.pipeline.bloom, actors: g.actors,
    });
    this.veil.show(false);
    if (loud) {
      this.veil.flash();
      sfx.crossing(false);
    }
    sfx.setAmbient(g.save.location === 'mokki' ? 'mokki' : 'office');
    return diffSnapshots(this.before, after);
  }
}

// ================================================================== handles for the browser tests

/**
 * Stand the player in the cell beside this floor's kiuas, close and facing
 * it, so a browser test can press E on a real sauna. Only a spot where E
 * would reach the kiuas (and not, say, the tonttu) counts. False if the
 * floor has no kiuas to use.
 */
export function standAtKiuas(g: Game, find: (g: Game) => void): boolean {
  const lv = g.level;
  for (const it of lv.interactables) {
    if (it.kind !== 'kiuas' || it.used) continue;
    const cx = toCell(it.x);
    const cz = toCell(it.z);
    for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const i = (cz + oz) * lv.w + cx + ox;
      if (lv.floor[i] !== 1 || lv.solid[i] === 1) continue;
      // Just inside the neighbouring cell, on the side towards the kiuas.
      const x = it.x + ox * 1.4;
      const z = it.z + oz * 1.4;
      g.player.pos.set(x, 0, z);
      g.player.yaw = Math.atan2(ox, oz);
      g.player.pitch = 0;
      find(g);
      const t = g.promptTarget;
      if (t !== null && t.kind === 'interact' && t.it === it) return true;
    }
  }
  return false;
}

/**
 * Stand the player a short walk (1.6 m) from the Löylyhenki, facing it, so a
 * browser test can walk the last steps and press E. False outside a vision.
 */
export function standNearFigure(g: Game): boolean {
  const v = g.vision;
  if (v === null) return false;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const x = v.at.x + Math.sin(a) * 1.6;
    const z = v.at.z + Math.cos(a) * 1.6;
    if (isSolidAt(g.level, x, z)) continue;
    g.player.pos.set(x, 0, z);
    g.player.yaw = Math.atan2(-(v.at.x - x), -(v.at.z - z));
    g.player.pitch = 0;
    return true;
  }
  return false;
}
