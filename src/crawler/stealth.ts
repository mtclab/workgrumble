import { type Actor, type ActorKind, say, setMarker, walkClear, type WatchAct, type WatchCtx } from './entities';
import { flowField, type Level, NEIGHBOURS8, TILE, toCell, wallBetween } from './level';
import { fx } from './rng';

/**
 * The 0.3.0 spike's minimum stealth (docs/SPEC_HELLDESK_030.md 4.1, 2.3):
 * sight in a cone and noise, nothing else - no light, no disguise, no hiding,
 * no distractions. Every watched person carries a suspicion of 0-100; the
 * mission carries one escalation tier that only ever goes up.
 *
 * The rules up top are pure. `Watch` is the per-mission runtime the enemy AI
 * asks (`GameCtx.watch`): what a calm person does this frame, and when they
 * stop being calm.
 */

/** Suspicion at which a person comes to look (a bark, a "?", the walk over). */
export const INVESTIGATE = 40;
/** Suspicion at which a person is Alert: hostile, and the mission is Alert. */
export const ALERT = 80;
/** The cone a person sees in, whole (a real cone: today it is all round). */
export const CONE = (110 * Math.PI) / 180;
/** Suspicion per second at close range, standing, with no stealth at all. */
export const SIGHT_RISE = 35;
/** Past this share of the range, the rise is halved (peripheral). */
export const PERIPHERAL = 0.6;
/** Per second, out of sight and below Investigate. */
export const DECAY = 8;
/**
 * Investigate always begins with a bark and this long a walk before anything
 * can make the person Alert (spec 4.4): no check counts during it.
 */
export const INVESTIGATE_HOLD = 1.0;
/** From Alert to the first wind-up at the earliest (spec 2.3: "0.5 s pause"). */
export const ALERT_PAUSE = 0.5;
/** An Alert person's shout reaches this far; through a wall, half as far. */
export const EARSHOT = 12;
/** Seconds an investigator looks round at the spot before going back to what they were doing. */
export const SEARCH_TIME = 4;

/** Noise events: who hears it (radius, m) and how much it raises their suspicion. */
export const NOISE = {
  sprint: { radius: 6, jump: 15 },
  swing: { radius: 8, jump: 30 },
  gun: { radius: 18, jump: 60 },
} as const;
export type NoiseKind = keyof typeof NOISE;

/** Seconds between two sprint noises while you keep sprinting. */
export const SPRINT_NOISE_EVERY = 1;

export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAMES: Readonly<Record<Tier, string>> = { 0: 'Quiet', 1: 'Noticed', 2: 'Alert', 3: 'Escalated' };

/** How far a person sees (spec 4.1: user 9, manager 13; the rest as users). */
export function sightRange(kind: ActorKind): number {
  return kind === 'boss' ? 16 : kind === 'manager' || kind === 'consultant' ? 13 : 9;
}

/** Is (px, pz) inside the cone of someone at (ax, az) facing `yaw` (forward is sin, cos)? */
export function inCone(yaw: number, ax: number, az: number, px: number, pz: number, cone = CONE): boolean {
  const dx = px - ax;
  const dz = pz - az;
  const d = Math.hypot(dx, dz);
  if (d < 1e-4) return true;
  return (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / d >= Math.cos(cone / 2);
}

/**
 * Suspicion per second from seeing you `dist` m off (0 beyond `range`).
 * Crouching halves it; `stealth` is your gear and skill (0..0.9), not the
 * crouch, which counts once, here.
 */
export function sightRise(dist: number, range: number, crouching: boolean, stealth: number): number {
  if (dist > range) return 0;
  return SIGHT_RISE * (crouching ? 0.5 : 1) * (1 - stealth) * (dist > range * PERIPHERAL ? 0.5 : 1);
}

/** The highest tier a person's suspicion means on its own. */
export function tierOf(suspicion: number): Tier {
  return suspicion >= ALERT ? 2 : suspicion >= INVESTIGATE ? 1 : 0;
}

/** How a person spends a calm day. Desk-bound sit and sweep a 90 degree look; wanderers mill; patrollers walk a route. */
export type Sort = 'desk' | 'wander' | 'patrol';
export type Mood = 'calm' | 'investigating' | 'wary' | 'alert';

export interface Point {
  readonly x: number;
  readonly z: number;
}

export interface Watcher {
  readonly actor: Actor;
  readonly sort: Sort;
  /** The card's name for them ('hr'), or null. */
  readonly tag: string | null;
  suspicion: number;
  /** The highest suspicion they ever reached. */
  peak: number;
  mood: Mood;
  /** Seconds left of the walk-before-any-check. */
  hold: number;
  /** Where they are going to look: where they saw you, or what they heard. */
  spot: Point | null;
  /** At the spot (or as near as it goes), looking round, for `searchT` more seconds. */
  searching: boolean;
  searchT: number;
  /** Turned to a noise below Investigate: facing it this much longer. */
  glanceT: number;
  glanceYaw: number;
  readonly post: Point;
  readonly baseYaw: number;
  /** A patroller's route (corridor nodes) and the pause at each, seconds. */
  readonly route: readonly Point[];
  readonly pauses: readonly number[];
  leg: number;
  pauseT: number;
  /** Has you in their cone, in range, in sight, this frame. */
  seeing: boolean;
  /** The last thing they said about you, and when (game time). */
  bark: string;
  barkAt: number;
}

/** What the watchers can know about the player. */
export interface WatchView {
  readonly x: number;
  readonly z: number;
  readonly crouching: boolean;
  /** Gear and skill only, 0..0.9 (the crouch is its own factor). */
  readonly stealth: number;
  readonly invisible: boolean;
  readonly time: number;
}

export interface WatchHost {
  view(): WatchView;
  /** The mission's tier went up: announce it. */
  tierChanged(to: Tier, from: Tier, by: Actor | null, why: string): void;
}

const SIGHT_BARKS = ['Can I help you?', 'Sorry, are you meant to be in here?', 'Hello? Who is that?'];
const NOISE_BARKS = ['What was that?', 'Hello? Anyone there?', 'Did somebody drop something?'];
const ALERT_BARKS = ['Right! Security! SECURITY!', 'I KNEW it. Stay right there.', 'Excuse me! EXCUSE me!'];

const LEGACY: WatchAct = { kind: 'legacy' };
const WANDER: WatchAct = { kind: 'wander' };
const ALERTED: WatchAct = { kind: 'alert', pause: ALERT_PAUSE };

/** Speeds as shares of the person's own: a stroll for routine, brisker to look into something. */
const ROUTINE_PACE = 0.4;
const SEARCH_PACE = 0.6;

export class Watch implements WatchCtx {
  tier: Tier;
  readonly watchers = new Map<number, Watcher>();
  /** Everyone who has been Alert, by actor id: two of them and it is Escalated. */
  readonly alerted = new Set<number>();
  /** Flow fields toward a cell, for walking somewhere that is not the player. */
  private readonly fields = new Map<number, Int16Array>();

  constructor(readonly level: Level, private readonly host: WatchHost, start: Tier = 0) {
    this.tier = start;
  }

  /** Watch somebody: the crowd of a mission, as the card places them. */
  add(a: Actor, sort: Sort, opts: { tag?: string | null; route?: readonly Point[]; pauses?: readonly number[] } = {}): Watcher {
    const route = opts.route ?? [];
    const w: Watcher = {
      actor: a, sort, tag: opts.tag ?? null,
      suspicion: 0, peak: 0, mood: 'calm', hold: 0, spot: null, searching: false, searchT: 0, glanceT: 0, glanceYaw: 0,
      post: { x: a.pos.x, z: a.pos.z }, baseYaw: a.yaw,
      route, pauses: opts.pauses ?? route.map(() => 3), leg: 0, pauseT: 0,
      seeing: false, bark: '', barkAt: -1,
    };
    this.watchers.set(a.id, w);
    return w;
  }

  watches(a: Actor): boolean {
    return this.watchers.has(a.id);
  }

  /** One frame of a calm person's attention, from the enemy AI. */
  look(a: Actor, dt: number, sees: boolean, dist: number): WatchAct {
    const w = this.watchers.get(a.id);
    // Escalated: everyone hostile on sight, which is today's game.
    if (w === undefined || this.tier >= 3) return LEGACY;
    if (w.mood === 'alert') return ALERTED;
    const v = this.host.view();
    const range = sightRange(a.kind);
    w.seeing = sees && !v.invisible && dist <= range && inCone(a.yaw, a.pos.x, a.pos.z, v.x, v.z);
    // Unseen (invisible) freezes it: no rise, no decay.
    if (!v.invisible) {
      if (w.seeing) {
        w.suspicion = Math.min(100, w.suspicion + sightRise(dist, range, v.crouching, v.stealth) * dt);
      } else if (w.suspicion < INVESTIGATE) {
        w.suspicion = Math.max(0, w.suspicion - DECAY * dt);
      }
    }
    if (w.seeing && w.suspicion >= INVESTIGATE && w.mood !== 'investigating') this.investigate(w, { x: v.x, z: v.z }, 'sight', v.time);
    if (w.seeing && w.mood === 'investigating') this.lookAt(w, { x: v.x, z: v.z });
    this.holdBack(w, dt);
    w.peak = Math.max(w.peak, w.suspicion);
    if (w.suspicion >= ALERT && w.hold <= 0) {
      this.alert(w, v.time);
      return ALERTED;
    }
    return this.routine(w, dt, v.time);
  }

  /**
   * A noise at (x, z). Everyone in its radius jumps by its amount and turns to
   * face the SPOT (they investigate where it was, not you).
   */
  noise(kind: NoiseKind, x: number, z: number, time: number): void {
    if (this.tier >= 3) return;
    const n = NOISE[kind];
    for (const w of this.watchers.values()) {
      const a = w.actor;
      if (a.resolved || w.mood === 'alert') continue;
      if (Math.hypot(a.pos.x - x, a.pos.z - z) > n.radius) continue;
      w.suspicion = Math.min(100, w.suspicion + n.jump);
      const yaw = Math.atan2(x - a.pos.x, z - a.pos.z);
      a.yaw = yaw;
      w.glanceYaw = yaw;
      w.glanceT = 2.5;
      if (w.suspicion >= INVESTIGATE) {
        if (w.mood === 'investigating') this.lookAt(w, { x, z });
        else this.investigate(w, { x, z }, 'noise', time);
      }
      this.holdBack(w, 0);
      w.peak = Math.max(w.peak, w.suspicion);
    }
  }

  /** Somebody turned on you by any road (a hit, a failed talk, sight at Escalated): they count as Alert. */
  aggroed(a: Actor, time: number): void {
    const w = this.watchers.get(a.id);
    if (w === undefined || w.mood === 'alert') return;
    if (this.tier >= 3) {
      w.mood = 'alert';
      this.alerted.add(a.id);
      return;
    }
    this.alert(w, time);
  }

  /** Whoever is calm and has you in view right now (a crime's witnesses). */
  witnesses(): Actor[] {
    return [...this.watchers.values()].filter((w) => w.seeing && !w.actor.resolved).map((w) => w.actor);
  }

  private raise(to: Tier, by: Actor | null, why: string): void {
    if (to <= this.tier) return;
    const from = this.tier;
    this.tier = to;
    this.host.tierChanged(to, from, by, why);
  }

  private say(w: Watcher, text: string, time: number): void {
    w.bark = text;
    w.barkAt = time;
    say(w.actor, text, 2.6);
  }

  private investigate(w: Watcher, spot: Point, why: 'sight' | 'noise' | 'shout', time: number): void {
    const fresh = w.mood === 'calm';
    w.mood = 'investigating';
    this.lookAt(w, spot);
    w.hold = INVESTIGATE_HOLD;
    w.suspicion = Math.max(w.suspicion, INVESTIGATE);
    setMarker(w.actor, '?', '#ffb020');
    if (fresh || time - w.barkAt > 6) this.say(w, fx.pick(why === 'sight' ? SIGHT_BARKS : NOISE_BARKS), time);
    this.raise(1, w.actor, why === 'sight' ? `${w.actor.name} saw something` : `${w.actor.name} heard something`);
  }

  /** A new place to look: walk there, then search it afresh. */
  private lookAt(w: Watcher, spot: Point): void {
    w.spot = spot;
    w.searching = false;
    w.searchT = SEARCH_TIME;
  }

  /** The walk before any check: nothing takes them past Investigate while it lasts. */
  private holdBack(w: Watcher, dt: number): void {
    if (w.hold <= 0) return;
    w.hold = Math.max(0, w.hold - dt);
    w.suspicion = Math.min(w.suspicion, ALERT - 1);
  }

  private alert(w: Watcher, time: number): void {
    const a = w.actor;
    w.mood = 'alert';
    w.suspicion = 100;
    w.peak = 100;
    this.alerted.add(a.id);
    setMarker(a, '!', '#ff4030');
    this.say(w, fx.pick(ALERT_BARKS), time);
    this.raise(2, a, `${a.name} raised the alarm`);
    // Everyone in earshot is Noticed, and comes to where the shout was.
    for (const o of this.watchers.values()) {
      if (o === w || o.mood === 'alert' || o.actor.resolved) continue;
      const d = Math.hypot(o.actor.pos.x - a.pos.x, o.actor.pos.z - a.pos.z);
      const reach = wallBetween(this.level, a.pos.x, a.pos.z, o.actor.pos.x, o.actor.pos.z) ? EARSHOT / 2 : EARSHOT;
      if (d > reach) continue;
      o.suspicion = Math.max(o.suspicion, INVESTIGATE);
      o.peak = Math.max(o.peak, o.suspicion);
      if (o.mood === 'investigating') this.lookAt(o, { x: a.pos.x, z: a.pos.z });
      else this.investigate(o, { x: a.pos.x, z: a.pos.z }, 'shout', time);
    }
    if (this.alerted.size >= 2) this.raise(3, a, 'a second person raised the alarm');
  }

  /** What a person who is not Alert does: investigate, glance, or their day. */
  private routine(w: Watcher, dt: number, time: number): WatchAct {
    const a = w.actor;
    if (w.mood === 'investigating' && w.spot !== null) {
      if (!w.searching && Math.hypot(w.spot.x - a.pos.x, w.spot.z - a.pos.z) > 1.2) {
        const step = this.walkTo(a, w.spot, a.speed * SEARCH_PACE);
        // No way nearer (behind glass, say): search from here.
        if (step.kind !== 'move' || step.speed > 0) return step;
      }
      // At the spot (or as near as it goes): look round, then back to work, wary.
      w.searching = true;
      w.searchT -= dt;
      if (w.searchT <= 0 && w.hold <= 0) {
        w.mood = 'wary';
        w.spot = null;
        setMarker(a, null);
      }
      return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: a.yaw + dt * 2.2 };
    }
    if (w.glanceT > 0) {
      w.glanceT -= dt;
      return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: w.glanceYaw };
    }
    switch (w.sort) {
      case 'wander':
        return WANDER;
      case 'desk': {
        if (Math.hypot(w.post.x - a.pos.x, w.post.z - a.pos.z) > 0.8) return this.walkTo(a, w.post, a.speed * ROUTINE_PACE);
        // Sat at the desk, looking round: a 90 degree sweep.
        return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: w.baseYaw + Math.sin(time * 0.5 + a.id) * (Math.PI / 4) };
      }
      case 'patrol': {
        const target = w.route[w.leg];
        if (target === undefined) return WANDER;
        if (w.pauseT > 0) {
          w.pauseT -= dt;
          if (w.pauseT <= 0) w.leg = (w.leg + 1) % w.route.length;
          return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: null };
        }
        if (Math.hypot(target.x - a.pos.x, target.z - a.pos.z) <= 0.8) {
          w.pauseT = w.pauses[w.leg] ?? 3;
          return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: null };
        }
        return this.walkTo(a, target, a.speed * ROUTINE_PACE);
      }
    }
  }

  /** A step toward (x, z): straight when the way is clear, by a flow field round corners when not. */
  private walkTo(a: Actor, to: Point, speed: number): WatchAct {
    const lv = this.level;
    if (walkClear(lv, a.pos.x, a.pos.z, to.x, to.z)) return { kind: 'move', dx: to.x - a.pos.x, dz: to.z - a.pos.z, speed, yaw: null };
    const cell = toCell(to.z) * lv.w + toCell(to.x);
    let field = this.fields.get(cell);
    if (field === undefined) {
      field = flowField(lv, to.x, to.z, 32000);
      this.fields.set(cell, field);
    }
    const cx = toCell(a.pos.x);
    const cz = toCell(a.pos.z);
    const here = field[cz * lv.w + cx] ?? -1;
    let best = here < 0 ? 32767 : here;
    let bx = cx;
    let bz = cz;
    for (const [ox, oz] of NEIGHBOURS8) {
      const nx = cx + ox;
      const nz = cz + oz;
      if (nx < 0 || nz < 0 || nx >= lv.w || nz >= lv.h) continue;
      if (ox !== 0 && oz !== 0 && (lv.solid[cz * lv.w + nx] === 1 || lv.solid[nz * lv.w + cx] === 1)) continue;
      const d = field[nz * lv.w + nx] ?? -1;
      if (d >= 0 && d < best) {
        best = d;
        bx = nx;
        bz = nz;
      }
    }
    if (bx === cx && bz === cz) return { kind: 'move', dx: 0, dz: 0, speed: 0, yaw: null };
    return { kind: 'move', dx: bx * TILE + TILE / 2 - a.pos.x, dz: bz * TILE + TILE / 2 - a.pos.z, speed, yaw: null };
  }
}
