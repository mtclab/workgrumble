import * as THREE from 'three';
import { sfx } from './audio';
import type { Game } from './game';
import { isSolidAt } from './level';
import { fx } from './rng';
import { hash } from './voxels';
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

/** One puff of the figure: where it rises from, how far, how wide, and when. */
interface Puff {
  readonly sprite: THREE.Sprite;
  readonly material: THREE.SpriteMaterial;
  readonly y0: number;
  readonly r: number;
  readonly phase: number;
  readonly drift: number;
}

/** How long one puff takes to rise through its band and fade, in seconds. */
const PUFF_CYCLE = 3.2;

/**
 * A soft round of steam: bright in the middle, gone at the edge, and not
 * quite round, so a column of them reads as vapour and not as balls. Drawn
 * once per vision.
 */
function puffTexture(): THREE.CanvasTexture {
  const size = 64;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (ctx === null) throw new Error('2d canvas');
  const blob = (x: number, y: number, r: number, a: number): void => {
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${a})`);
    grad.addColorStop(0.45, `rgba(255,255,255,${a * 0.45})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  };
  blob(32, 32, 30, 0.42);
  // A few lumps off-centre, placed by a fixed hash so every vision looks alike.
  for (let i = 0; i < 5; i++) {
    const ang = hash(i, 3, 7, 11) * Math.PI * 2;
    const d = 6 + hash(i, 5, 1, 13) * 9;
    blob(32 + Math.cos(ang) * d, 32 + Math.sin(ang) * d, 12 + hash(i, 2, 9, 17) * 8, 0.2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The Löylyhenki: a tall column of steam with a little light in its chest.
 * Soft sprites rise through bands shaped like someone standing - wider at
 * the shoulders, thinning to the floor - fading in and out as they go, so
 * it is always moving and never solid. Additive and outside the fog, so it
 * reads as a glow through the murk from the far end of the room.
 */
function buildFigure(): { group: THREE.Group; puffs: Puff[]; owned: (THREE.Material | THREE.Texture)[] } {
  const group = new THREE.Group();
  group.name = 'loylyhenki';
  const tex = puffTexture();
  const owned: (THREE.Material | THREE.Texture)[] = [tex];
  const puffs: Puff[] = [];
  // Band heights and half-widths: shins, knees, hips, chest, shoulders, head.
  const column: readonly [number, number][] = [
    [0.15, 0.2], [0.55, 0.26], [1.0, 0.32], [1.45, 0.4], [1.85, 0.44], [2.3, 0.3],
  ];
  let n = 0;
  for (const [y0, r] of column) {
    for (let k = 0; k < 4; k++) {
      const material = new THREE.SpriteMaterial({
        map: tex, color: 0xf2e8d8, transparent: true, opacity: 0,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      });
      owned.push(material);
      const sprite = new THREE.Sprite(material);
      group.add(sprite);
      puffs.push({ sprite, material, y0, r, phase: hash(n, 1, 2, 3), drift: (hash(n, 4, 5, 6) - 0.5) * 0.5 });
      n++;
    }
  }
  const glow = (color: number, y: number, w: number, h: number, opacity: number): void => {
    const material = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    owned.push(material);
    const s = new THREE.Sprite(material);
    s.position.y = y;
    s.scale.set(w, h, 1);
    group.add(s);
  };
  // A faint halo the height of a person, so the whole column reads as
  // someone standing there, and the ember in its chest.
  glow(0xffcf8a, 1.25, 1.5, 3.2, 0.16);
  glow(0xffd9a0, 1.6, 0.42, 0.42, 0.95);
  return { group, puffs, owned };
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
  private readonly puffs: Puff[];
  private readonly owned: (THREE.Material | THREE.Texture)[];
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
    // The white frame is a screen flash: Screen flashes off, the crossing is the sound alone.
    if (g.settings.flashes) this.veil.flash();
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
    for (const p of this.puffs) {
      // Each puff rises 0.45 m through its band, swelling, and fades out at
      // the top as the next one fades in below it.
      const u = (t / PUFF_CYCLE + p.phase) % 1;
      const size = p.r * (3.0 + u * 1.4);
      p.sprite.position.set(p.drift * p.r + Math.sin(t * 0.7 + p.phase * 6) * 0.06, p.y0 + u * 0.45, Math.cos(t * 0.6 + p.phase * 5) * 0.05);
      p.sprite.scale.set(size, size * 1.15, 1);
      p.material.opacity = Math.sin(Math.PI * u) * 0.3;
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
      if (g.settings.flashes) this.veil.flash();
      sfx.crossing(false);
    }
    sfx.setAmbient(g.save.location === 'mokki' ? 'mokki' : 'office');
    return diffSnapshots(this.before, after);
  }
}

// ================================================================== handles for the browser tests

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
