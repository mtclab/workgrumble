import { type Actor, type ActorKind, say, setMarker, walkClear, type WatchAct, type WatchCtx } from './entities';
import { flowField, type Level, lineOfSight, NEIGHBOURS8, TILE, toCell, wallBetween } from './level';
import { fx } from './rng';
import { cancelWindup } from './windup';
import type { AlarmRule } from './mission';

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

export type { AlarmRule } from './mission';
export { ALARM_RULES } from './mission';

/** Seconds an Alert person goes without seeing you before they start searching. */
export const SEARCH_AFTER = 8;
/** The search's countdown, seconds: at zero they give up, to Noticed. */
export const SEARCH_COUNTDOWN = 20;
/** Seconds of nobody seeing you and no fighting before the tier drops a step. */
export const COOLDOWN = 45;
/** How far a person at Alert keeps track of you, given a line of sight (the hostile AI's own reach). */
export const CHASE_SIGHT = 30;

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
/** 'searching': was Alert, lost you, and is looking (the search rule). */
export type Mood = 'calm' | 'investigating' | 'wary' | 'alert' | 'searching';

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
  /** Has you in their cone, in range, in sight, this frame (as of `lookedAt`, the game time they last looked). */
  seeing: boolean;
  lookedAt: number;
  /** The last thing they said about you, and when (game time). */
  bark: string;
  barkAt: number;
  /** Expecting you (D7 social cards): seeing you raises nothing. */
  readonly expected: boolean;
  /** How much quicker than anyone else they see you (a pocket of vendors looking for somebody to pitch at). */
  readonly keen: number;
  /** Called in by the card's going-loud (the Head of People): after you, but not a second alarm of their own. */
  readonly called: boolean;
  /** At Alert: seconds since they last saw you, and where that was. */
  lost: number;
  lastSeen: Point | null;
  /** Searching: seconds left on the countdown over their head. */
  countdown: number;
  /** What is over their head ('?', '!', the countdown), or '' for nothing. */
  shown: string;
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
  /** The mission's tier went up (or, by the card's alarm rule, down): announce it. */
  tierChanged(to: Tier, from: Tier, by: Actor | null, why: string): void;
  /** Damage dealt or taken just now: a fight keeps the cooldown rule from cooling anything. */
  fighting?(): boolean;
}

const SEARCH_BARKS = ['Where did they go?', 'I KNOW you are still here.', 'Come out. I just want a word.'];
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
  /** Everyone who has been Alert, by actor id: under 'one-way', two of them and it is Escalated. */
  readonly alerted = new Set<number>();
  /** Seconds with nobody seeing you and no fighting (the cooldown rule's clock). */
  quietT = 0;
  /**
   * The 'search' rule: seconds since anyone on the card last saw you. With
   * nobody left to justify the tier (whoever was after you is resolved) the
   * floor holds it and searches on this clock: SEARCH_AFTER, then the
   * SEARCH_COUNTDOWN, then one step down.
   */
  unseenT = 0;
  /** This frame the tier is the floor's to hold (nobody left after you): see `floorSearch`. */
  private held = false;
  /** Flow fields toward a cell, for walking somewhere that is not the player. */
  private readonly fields = new Map<number, Int16Array>();

  constructor(readonly level: Level, private readonly host: WatchHost, start: Tier = 0, readonly rule: AlarmRule = 'one-way') {
    this.tier = start;
  }

  /** Watch somebody: the crowd of a mission, as the card places them. */
  add(a: Actor, sort: Sort, opts: { tag?: string | null; route?: readonly Point[]; pauses?: readonly number[]; expected?: boolean; keen?: number; called?: boolean } = {}): Watcher {
    const route = opts.route ?? [];
    const w: Watcher = {
      actor: a, sort, tag: opts.tag ?? null,
      suspicion: 0, peak: 0, mood: 'calm', hold: 0, spot: null, searching: false, searchT: 0, glanceT: 0, glanceYaw: 0,
      post: { x: a.pos.x, z: a.pos.z }, baseYaw: a.yaw,
      route, pauses: opts.pauses ?? route.map(() => 3), leg: 0, pauseT: 0,
      seeing: false, lookedAt: -Infinity, bark: '', barkAt: -1,
      expected: opts.expected === true, keen: opts.keen ?? 1, called: opts.called === true, lost: 0, lastSeen: null, countdown: 0, shown: '',
    };
    this.watchers.set(a.id, w);
    return w;
  }

  /**
   * Put back a person as a save kept them: suspicion and mood. Alert comes
   * back after you (the caller makes them so); searching comes back with its
   * countdown; investigating comes back where they were going.
   */
  restore(w: Watcher, st: { suspicion: number; peak: number; mood: Mood; countdown: number; spot: Point | null; lost?: number; lastSeen?: Point | null }): void {
    w.suspicion = st.suspicion;
    w.peak = st.peak;
    w.mood = st.mood;
    w.countdown = st.countdown;
    w.spot = st.spot;
    w.searchT = SEARCH_TIME;
    // The search rule's clock and spot: how long they have been without you, and where they last had you.
    w.lost = st.lost ?? 0;
    w.lastSeen = st.lastSeen ?? null;
    if (st.mood === 'alert') {
      if (!w.called) this.alerted.add(w.actor.id);
      this.mark(w, '!', '#ff4030');
    } else if (st.mood === 'searching') {
      if (!w.called) this.alerted.add(w.actor.id);
      w.lastSeen ??= st.spot;
      this.mark(w, countdownText(w.countdown), '#ffb020');
    } else if (st.mood === 'investigating') {
      this.mark(w, '?', '#ffb020');
    }
  }

  watches(a: Actor): boolean {
    return this.watchers.has(a.id);
  }

  /** One frame of a calm person's attention, from the enemy AI. */
  look(a: Actor, dt: number, sees: boolean, dist: number): WatchAct {
    const w = this.watchers.get(a.id);
    if (w === undefined) return LEGACY;
    // Escalated: everyone hostile on sight, which is today's game (who sees you then is the hostile AI's business).
    if (this.tier >= 3) {
      w.seeing = false;
      return LEGACY;
    }
    if (w.mood === 'alert') return ALERTED;
    const v = this.host.view();
    const range = sightRange(a.kind);
    w.seeing = sees && !v.invisible && dist <= range && inCone(a.yaw, a.pos.x, a.pos.z, v.x, v.z);
    w.lookedAt = v.time;
    // Searching and they find you: Alert again, at once (the pause before a swing still holds).
    if (w.mood === 'searching') {
      if (w.seeing) {
        this.alert(w, v.time);
        return ALERTED;
      }
      return this.routine(w, dt, v.time);
    }
    // Unseen (invisible) freezes it: no rise, no decay. Somebody expecting you sees nothing odd in you.
    if (!v.invisible) {
      if (w.seeing && !w.expected) {
        w.suspicion = Math.min(100, w.suspicion + sightRise(dist, range, v.crouching, v.stealth) * w.keen * dt);
      } else if (w.suspicion < INVESTIGATE) {
        w.suspicion = Math.max(0, w.suspicion - DECAY * dt);
      }
    }
    if (w.seeing && !w.expected && w.suspicion >= INVESTIGATE && w.mood !== 'investigating') this.investigate(w, { x: v.x, z: v.z }, 'sight', v.time);
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
      w.lost = 0;
      if (!w.called) this.alerted.add(a.id);
      return;
    }
    this.alert(w, time);
  }

  /**
   * Once a frame, from the mission: the alarm rule's clocks. Under 'search',
   * an Alert person who has lost you for SEARCH_AFTER seconds searches, and
   * a search that runs out drops them to Noticed; the tier follows. Under
   * 'cooldown', COOLDOWN quiet seconds take the tier down a step.
   */
  tick(dt: number): void {
    if (this.rule === 'one-way') return;
    const v = this.host.view();
    let seen = false;
    let gaveUp = false;
    for (const w of this.watchers.values()) {
      const a = w.actor;
      if (a.resolved) continue;
      // Somebody who looked this frame or the last (the people move after the mission's frame) and had you in view.
      if (w.seeing && v.time - w.lookedAt <= 0.1) seen = true;
      if (w.mood === 'alert') {
        const chasing = !v.invisible && Math.hypot(v.x - a.pos.x, v.z - a.pos.z) <= CHASE_SIGHT && lineOfSight(this.level, a.pos.x, a.pos.z, v.x, v.z);
        if (chasing) {
          seen = true;
          w.lost = 0;
          w.lastSeen = { x: v.x, z: v.z };
        } else {
          w.lost += dt;
        }
        if (this.rule === 'search' && this.tier < 3 && !chasing && w.lost >= SEARCH_AFTER) this.search(w, v.time);
      } else if (w.mood === 'searching') {
        w.countdown = Math.max(0, w.countdown - dt);
        if (w.countdown <= 0) {
          this.giveUp(w);
          gaveUp = true;
        } else if (countdownText(w.countdown) !== w.shown) this.mark(w, countdownText(w.countdown), '#ffb020');
      }
    }
    if (this.rule === 'search') {
      this.unseenT = seen ? 0 : this.unseenT + dt;
      if (this.tier < 3) this.follow(gaveUp);
      return;
    }
    // Cooldown: nobody seeing you, and no fight, for long enough.
    const fight = this.host.fighting?.() ?? false;
    if (seen || fight || this.tier === 0) {
      this.quietT = 0;
      return;
    }
    this.quietT += dt;
    if (this.quietT >= COOLDOWN) {
      this.quietT = 0;
      this.coolOneStep();
    }
  }

  /** How many are after you right now (Alert, or searching for you). */
  alertNow(): number {
    let n = 0;
    for (const w of this.watchers.values()) if (!w.called && !w.actor.resolved && (w.mood === 'alert' || w.mood === 'searching')) n++;
    return n;
  }

  /** The 'search' rule: lost you long enough, they go looking where they last saw you, with the countdown over their head. */
  private search(w: Watcher, time: number): void {
    const a = w.actor;
    w.mood = 'searching';
    w.countdown = SEARCH_COUNTDOWN;
    a.aggro = false;
    cancelWindup(a);
    w.spot = w.lastSeen ?? { x: a.pos.x, z: a.pos.z };
    w.searching = false;
    w.searchT = SEARCH_TIME;
    this.mark(w, countdownText(w.countdown), '#ffb020');
    this.say(w, fx.pick(SEARCH_BARKS), time);
  }

  /** The search ran out: they give up, back to Noticed (wary, the bar at Investigate). */
  private giveUp(w: Watcher): void {
    w.mood = 'wary';
    w.suspicion = INVESTIGATE;
    w.spot = null;
    w.searching = false;
    this.mark(w, null);
  }

  /**
   * The 'search' rule's tier: the highest person's (Escalated is not touched
   * here: it stays). It comes down when a search gives up. When nobody is
   * left to justify it (whoever was after you is resolved), it does not drop
   * at once: the floor holds it and searches, SEARCH_AFTER and then the
   * SEARCH_COUNTDOWN from the last time anyone saw you, and then it comes
   * down one step, announced.
   */
  private follow(gaveUp: boolean): void {
    let top: Tier = 0;
    for (const w of this.watchers.values()) {
      if (w.actor.resolved) continue;
      const t = moodTier(w);
      if (t > top) top = t;
    }
    this.held = false;
    if (top >= this.tier) return;
    const from = this.tier;
    if (gaveUp) {
      this.tier = top;
      this.host.tierChanged(top, from, null, top === 1 ? 'they gave up looking' : 'nobody is looking any more');
      return;
    }
    if (this.unseenT < SEARCH_AFTER + SEARCH_COUNTDOWN) {
      this.held = true;
      return;
    }
    this.unseenT = 0;
    this.tier = (from - 1) as Tier;
    this.host.tierChanged(this.tier, from, null, 'the floor stopped searching');
  }

  /**
   * The least tier the people's moods call for right now: two after you
   * (Alert or searching, nobody called in among them) is Escalated, anyone
   * after you is Alert, anyone looking into something (or still wary, at
   * Investigate) is Noticed. The tier is never below it; under 'search'
   * (short of Escalated) it is exactly this unless the floor is holding it
   * (`holding`), and under 'one-way' it only ever goes up.
   */
  required(): Tier {
    let after = 0;
    let top: Tier = 0;
    for (const w of this.watchers.values()) {
      if (w.actor.resolved) continue;
      const t = moodTier(w);
      if (t > top) top = t;
      if (t === 2 && !w.called) after++;
    }
    return after >= 2 ? 3 : top;
  }

  /** The floor is holding the tier above what the people call for ('search', nobody left after you). */
  holding(): boolean {
    return this.held;
  }

  /** The floor searching for you on its own (the 'search' rule, nobody left after you): seconds left on its countdown, or null. */
  floorSearch(): number | null {
    return this.held && this.unseenT >= SEARCH_AFTER ? Math.max(0, SEARCH_AFTER + SEARCH_COUNTDOWN - this.unseenT) : null;
  }

  /**
   * The 'cooldown' rule: everyone above the new tier comes down to it, and
   * it is announced. Out of Escalated, only the one who saw you last stays
   * Alert; everyone else who was after you is Noticed, and goes to look
   * where they last saw you.
   */
  private coolOneStep(): void {
    const from = this.tier;
    const to = (from - 1) as Tier;
    this.tier = to;
    const after = [...this.watchers.values()].filter((w) => !w.actor.resolved && (w.actor.aggro || w.mood === 'alert' || w.mood === 'searching'));
    // The one who saw you most recently (one the card did not call in, if there is one).
    const keeper = to === 2 ? [...after].sort((p, q) => Number(p.called) - Number(q.called) || p.lost - q.lost)[0] : undefined;
    for (const w of this.watchers.values()) {
      const a = w.actor;
      if (a.resolved) continue;
      if (to === 2) {
        if (w === keeper) {
          w.mood = 'alert';
          w.lost = 0;
          a.aggro = true;
        } else if (after.includes(w)) {
          a.aggro = false;
          cancelWindup(a);
          w.suspicion = INVESTIGATE;
          w.peak = Math.max(w.peak, w.suspicion);
          w.mood = 'investigating';
          w.hold = 0;
          this.lookAt(w, w.lastSeen ?? { x: a.pos.x, z: a.pos.z });
          this.mark(w, '?', '#ffb020');
        }
      } else if (to === 1) {
        if (w.mood === 'alert' || w.mood === 'searching' || a.aggro) {
          a.aggro = false;
          cancelWindup(a);
          w.mood = 'wary';
          w.suspicion = INVESTIGATE;
          w.spot = null;
          this.mark(w, null);
        }
      } else if (w.suspicion >= INVESTIGATE || w.mood === 'investigating') {
        w.suspicion = INVESTIGATE - 1;
        w.mood = 'calm';
        w.spot = null;
        w.hold = 0;
        this.mark(w, null);
      }
    }
    this.alerted.clear();
    for (const w of this.watchers.values()) if (!w.called && !w.actor.resolved && (w.mood === 'alert' || w.mood === 'searching')) this.alerted.add(w.actor.id);
    this.host.tierChanged(to, from, null, 'it blew over');
  }

  /** What is over their head: remembered, so the HUD and the tests can read it. */
  private mark(w: Watcher, text: string | null, color = '#ffb020'): void {
    w.shown = text ?? '';
    setMarker(w.actor, text, color);
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
    this.mark(w, '?', '#ffb020');
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
    w.lost = 0;
    // Where they saw you raise the alarm: a search starts from there, even if they never see you again.
    const v = this.host.view();
    w.lastSeen = { x: v.x, z: v.z };
    if (!w.called) this.alerted.add(a.id);
    this.mark(w, '!', '#ff4030');
    this.say(w, fx.pick(ALERT_BARKS), time);
    this.raise(2, a, `${a.name} raised the alarm`);
    // Everyone in earshot is Noticed, and comes to where the shout was.
    for (const o of this.watchers.values()) {
      if (o === w || o.mood === 'alert' || o.actor.resolved) continue;
      const d = Math.hypot(o.actor.pos.x - a.pos.x, o.actor.pos.z - a.pos.z);
      const reach = wallBetween(this.level, a.pos.x, a.pos.z, o.actor.pos.x, o.actor.pos.z) ? EARSHOT / 2 : EARSHOT;
      if (d > reach || o.mood === 'searching') continue;
      o.suspicion = Math.max(o.suspicion, INVESTIGATE);
      o.peak = Math.max(o.peak, o.suspicion);
      if (o.mood === 'investigating') this.lookAt(o, { x: a.pos.x, z: a.pos.z });
      else this.investigate(o, { x: a.pos.x, z: a.pos.z }, 'shout', time);
    }
    // One-way: anyone who has ever been Alert counts. Under a rule that cools, only who is after you now.
    if ((this.rule === 'one-way' ? this.alerted.size : this.alertNow()) >= 2) this.raise(3, a, 'a second person raised the alarm');
  }

  /** What a person who is not Alert does: investigate, glance, or their day. */
  private routine(w: Watcher, dt: number, time: number): WatchAct {
    const a = w.actor;
    if ((w.mood === 'investigating' || w.mood === 'searching') && w.spot !== null) {
      if (!w.searching && Math.hypot(w.spot.x - a.pos.x, w.spot.z - a.pos.z) > 1.2) {
        const step = this.walkTo(a, w.spot, a.speed * SEARCH_PACE);
        // No way nearer (behind glass, say): search from here.
        if (step.kind !== 'move' || step.speed > 0) return step;
      }
      // At the spot (or as near as it goes): look round, then back to work, wary.
      // A search (the alarm rule) looks round until its countdown says otherwise.
      w.searching = true;
      w.searchT -= dt;
      if (w.mood === 'investigating' && w.searchT <= 0 && w.hold <= 0) {
        w.mood = 'wary';
        w.spot = null;
        this.mark(w, null);
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

/** The tier one person's mood calls for on its own: after you (Alert, searching) is Alert; looking into something, or wary at Investigate, is Noticed. */
function moodTier(w: Watcher): Tier {
  if (w.mood === 'alert' || w.mood === 'searching') return 2;
  return w.mood === 'investigating' || w.suspicion >= INVESTIGATE ? 1 : 0;
}

/** The search's countdown as it shows over their head. */
export function countdownText(left: number): string {
  return `? ${Math.ceil(left)}`;
}
