import * as THREE from 'three';
import { sfx } from './audio';
import { placeQuestPickup } from './combat';
import type { CompassMarker } from './compass';
import { type DialogueNode, type DialogueOption, said } from './dialogue';
import { disposeTree } from './dispose';
import { type Actor, disposeActor, lastingMemo, setMarker, walkClear } from './entities';
import type { Game } from './game';
import { cellCenter, flowField, freeSpotIn, type Interactable, lineOfSight, type Room, toCell } from './level';
import {
  type AlarmRule,
  ALARM_WORDS,
  type CrowdSpec,
  type Finish,
  type MissionCard,
  MissionRun,
  type Outcome,
  type PersonSave,
  type PlaySave,
  payout,
  type Payout,
} from './mission';
import { QUEST_ITEMS } from './quests';
import { marcusBackups } from './story';
import { Rng } from './rng';
import * as screens from './screens';
import {
  ALERT_PAUSE,
  INVESTIGATE,
  type NoiseKind,
  type Point,
  SPRINT_NOISE_EVERY,
  type Tier,
  TIER_NAMES,
  Watch,
  type WatchView,
} from './stealth';

/**
 * A mission card in the game (docs/SPEC_HELLDESK_030.md 6.0, and S1b of
 * docs/SPEC_HELLDESK_030_S1.md): its people placed and watched, the alarm
 * played by the card's rule and announced, the HUD eye and the amber bars
 * over heads, the lift that finishes or aborts it, and the results card.
 *
 * Two ways in. A career takes a card from the week's deck up the lift
 * (`Game.loadCard`): the run is the career's, saved with it (`note`), paid
 * into it, and the results card goes back to the hub. The debug path
 * `crawler.html?mission=<id>` puts a fresh trainee on a card and saves
 * nothing. The rules are in mission.ts and stealth.ts.
 */

/** Options for a card in play: its dealt rules, a career's, and a run to resume. */
export interface PlayOptions {
  readonly alarm?: AlarmRule;
  readonly afterHours?: boolean;
  /** The giver's after-hours pay rate (1 in the day). */
  readonly rate?: number;
  /** Played in a career (the deck): saved, paid into it, and back to the hub at the end. */
  readonly career?: boolean;
  /** A run as a save kept it: the people, the alarm, the objective, where they were. */
  readonly from?: PlaySave | null;
}

/** An escort's nerve drains this fast (per second) with somebody after you within ESCORT_FRIGHT metres of them. */
const NERVE_DRAIN = 18;
const NERVE_BACK = 3;
const ESCORT_FRIGHT = 6;
/** The escort is there: in the counter's room, within this of it (they keep a step behind you). */
const ESCORT_REACH = 4.5;
/** After hours: lights at this share (lighting only: light-affects-sight is S4). */
export const AFTER_HOURS_LIGHT = 0.4;
/** A pocket's people see you this many times quicker. */
const POCKET_KEEN = 3;

/** Lights go to this when the mission is Escalated (spec 2.3: "the alarm tint"). */
const ALARM_TINT = 0xff5a40;
/** Over a head: the amber suspicion bar, metres up. */
const BAR_Y = 2.5;

/**
 * Where a mission shows itself outside the 3D scene: the HUD panel (eye,
 * tier, objective) and the results card. The DOM one is `domView`; the unit
 * tests hand in their own.
 */
export interface MissionView {
  /** The eye at `tier`, the objective line, and the card's alarm rule in its plain words. */
  draw(tier: Tier, goal: string, rule: string): void;
  show(on: boolean): void;
  /** The results card, with its buttons (Again and Title on the debug path; Back to the hub in a career). */
  result(head: string, dead: boolean, rows: readonly (readonly [string, string])[], buttons: readonly (readonly [string, () => void])[]): void;
  dispose(): void;
}

interface Bar {
  readonly group: THREE.Group;
  readonly fill: THREE.Mesh;
  readonly mats: readonly THREE.MeshBasicMaterial[];
}

/** The eye in the HUD: closed (Quiet), half open (Noticed), open and red (Alert, Escalated). */
const EYES: Readonly<Record<Tier, string>> = {
  0: '<path d="M3 12 Q20 22 37 12" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M10 16 l-2 4 M20 18 v4 M30 16 l2 4" stroke="currentColor" stroke-width="2"/>',
  1: '<path d="M3 12 Q20 2 37 12 Q20 22 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="14" r="4.5" fill="currentColor"/><path d="M3 12 Q20 2 37 12 Q20 8 3 12 Z" fill="currentColor"/>',
  2: '<path d="M3 12 Q20 1 37 12 Q20 23 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="12" r="6" fill="currentColor"/><circle cx="20" cy="12" r="2.2" fill="#140606"/>',
  3: '<path d="M3 12 Q20 1 37 12 Q20 23 3 12 Z" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="20" cy="12" r="6" fill="currentColor"/><circle cx="20" cy="12" r="2.2" fill="#140606"/>',
};

export class MissionPlay {
  readonly run: MissionRun;
  readonly watch: Watch;
  /** The card's people, as placed; `specs` says what each was placed as (the same order). */
  readonly crowd: Actor[] = [];
  readonly specs: CrowdSpec[] = [];
  readonly alarm: AlarmRule;
  readonly afterHours: boolean;
  /** The giver's after-hours pay rate. */
  readonly rate: number;
  readonly career: boolean;
  /** An escort's nerve (0-100): at zero they bolt, and the card has failed. */
  nerve = 100;
  /** The person being escorted, if the card has one. */
  escortee: Actor | null = null;
  /** The card's scattered copies (a collect objective), and which are picked up. */
  readonly scatter: { readonly id: string; readonly x: number; readonly z: number; picked: boolean }[] = [];
  /** The card's going-loud (the closet bolted, somebody called) has happened. */
  loudDone = false;
  private readonly rng: Rng;
  /** Rooms by the tag a card names them by. */
  private readonly rooms: Record<string, number[]> = {};
  private readonly bars = new Map<number, Bar>();
  private hudShown = '';
  private sprintIn = 0;
  private repAtStart: number;
  private standingAtStart: { management: number; staff: number };
  private tinted = false;
  private detectedAt: number | null = null;
  private noticedAt: number | null = null;
  private noiseEvents = 0;
  private readonly observed = new Map<number, number>();
  /** Why the card failed (its own failure: the clock, the escort), shown on the results card. */
  private failedWhy = '';
  /** "Back to the lift" has been said (once, whenever the objective got done: in a frame or between two). */
  private doneSaid = false;
  /** How many of the crowd the card itself placed; everyone after them joined later (called in, summoned). */
  private placed = 0;

  constructor(private readonly g: Game, readonly card: MissionCard, readonly seed: number, readonly pinned: boolean, private readonly view: MissionView = domView(g, card), opts: PlayOptions = {}) {
    this.rng = new Rng(seed ^ 0x6d697373);
    this.alarm = opts.alarm ?? card.alarm;
    this.afterHours = opts.afterHours === true;
    this.rate = opts.rate ?? 1;
    this.career = opts.career === true;
    const from = opts.from ?? null;
    const start: Tier = card.style === 'loud' ? 3 : 0;
    this.run = new MissionRun(card, start, from?.run);
    if (start >= 2) this.detectedAt = 0;
    if (start >= 1) this.noticedAt = 0;
    this.watch = new Watch(g.level, {
      view: () => this.seen(),
      tierChanged: (to, fromTier, by, why) => this.tierChanged(to, fromTier, by, why),
      fighting: () => g.time - g.combatAt < 2,
    }, from?.tier ?? start, this.alarm);
    this.repAtStart = g.save.rep;
    this.standingAtStart = { management: g.save.standing.management, staff: g.save.standing.staff };
    this.tagRooms();
    this.placeCrowd();
    this.placed = this.crowd.length;
    const closet = this.closet();
    if (card.objective.kind === 'take' && closet !== undefined) g.lockerItems.set(closet.id, card.objective.item);
    this.placeScatter();
    if (from !== null) this.resume(from);
    this.doneSaid = this.run.objectiveDone;
    this.dropScatter();
    g.markers = this.markers();
    g.markersIn = 0;
    // The eye and the objective are up from the briefing on.
    this.drawHud();
  }

  /** What the watchers can know about the player. */
  private seen(): WatchView {
    const g = this.g;
    return { x: g.player.pos.x, z: g.player.pos.z, crouching: g.player.crouching, stealth: Math.min(0.9, g.derivedCache.stealth), invisible: g.invisible, time: g.time };
  }

  // ---------------------------------------------------------------- the crowd

  /**
   * Rooms by the tags the card names them by, in a seeded order: a
   * recipe's footprint tags, or (today's generator, a 'large' card) the
   * rooms' kinds. Marcus's office is one of the offices, by the dice.
   */
  private tagRooms(): void {
    const lv = this.g.level;
    const layout = lv.recipe;
    if (layout !== undefined) {
      for (const [tag, ids] of Object.entries(layout.rooms)) this.rooms[tag] = this.rng.shuffle([...ids]);
    } else {
      for (const rm of lv.rooms) if (rm.id !== 0) (this.rooms[rm.kind] ??= []).push(rm.id);
      for (const ids of Object.values(this.rooms)) this.rng.shuffle(ids);
    }
    if (this.card.crowd.some((c) => c.room === 'marcus') || (this.card.objective.kind === 'fix' && this.card.objective.room === 'marcus')) {
      const offices = this.rooms.office ?? [];
      const k = offices.findIndex((id) => lv.interactables.some((it) => it.kind === 'terminal' && it.room === id));
      if (k >= 0) this.rooms.marcus = offices.splice(k, 1);
    }
  }

  /** Who the card cannot do without: its tagged people and the people its objective is about. The rest are the crowd after hours halves. */
  private essential(spec: CrowdSpec): boolean {
    const ob = this.card.objective;
    return spec.tag !== undefined || (ob.kind === 'resolve' && ob.tag === undefined && spec.kind === ob.who);
  }

  private placeCrowd(): void {
    const g = this.g;
    const taken = new Set<number>();
    const turn: Record<string, number> = {};
    // After hours (D6): half the crowd, the card's own people kept.
    let extra = 0;
    for (const spec of this.card.crowd) {
      for (let k = 0; k < (spec.count ?? 1); k++) {
        const n = turn[spec.room] ?? 0;
        turn[spec.room] = n + 1;
        if (this.afterHours && !this.essential(spec) && extra++ % 2 === 1) continue;
        const spot = this.spotFor(spec, spec.together === true ? 0 : n, taken);
        if (spot === null) continue;
        const helper = spec.kind === 'helper';
        const opts = {
          ...(spec.elite !== undefined ? { elite: spec.elite } : {}),
          ...(helper ? { role: spec.role ?? 'intern', npc: { id: `card-${spec.tag ?? 'helper'}`, name: spec.name ?? 'Josh (Intern)' } } : {}),
        };
        const a = g.spawnAt(spec.kind, spot.x, spot.z, spot.room, false, opts);
        if (a === null) continue;
        taken.add(toCell(a.pos.z) * g.level.w + toCell(a.pos.x));
        if (spec.name !== undefined) a.name = spec.name;
        this.crowd.push(a);
        this.specs.push(spec);
        if (helper) {
          // The one you are escorting follows you, and is nobody's watcher.
          a.recruited = true;
          this.escortee = a;
          continue;
        }
        a.docile = false;
        const rm = g.level.rooms[spot.room];
        if (rm !== undefined) a.yaw = this.towardDoor(a, rm);
        const route = spec.sort === 'patrol' ? this.routeFrom(a, spec.crossesSpine === true) : [];
        this.watch.add(a, spec.sort, { tag: spec.tag ?? null, route, pauses: route.map(() => this.rng.range(2, 4)), expected: spec.expected === true, keen: spec.pocket === true ? POCKET_KEEN : 1 });
      }
    }
  }

  private spotFor(spec: CrowdSpec, n: number, taken: ReadonlySet<number>): (Point & { room: number }) | null {
    const lv = this.g.level;
    if (spec.room === 'node') {
      const nodes = lv.recipe?.nodes ?? [];
      const cell = nodes[this.rng.int(0, Math.max(0, nodes.length - 1))];
      if (cell === undefined) return null;
      return { x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)), room: -1 };
    }
    // A room the map does not have (a floor with no print room): any room but the lobby, seeded.
    const ids = this.rooms[spec.room] ?? Object.values(this.rooms).flat().filter((id) => id !== 0);
    const rm = lv.rooms[ids[n % Math.max(1, ids.length)] ?? -1] ?? (spec.room === 'lobby' ? lv.rooms[0] : undefined);
    if (rm === undefined) return null;
    const s = freeSpotIn(lv, rm, this.rng, taken);
    return s === null ? null : { x: s.x, z: s.z, room: rm.id };
  }

  /** The card's scattered copies (a collect objective): one each on a free spot in the offices, HR and the open plan, seeded. */
  private placeScatter(): void {
    const ob = this.card.objective;
    if (ob.kind !== 'collect') return;
    const lv = this.g.level;
    const rooms = ['office', 'hr', 'open', 'meeting'].flatMap((t) => this.rooms[t] ?? []).map((id) => lv.rooms[id]).filter((rm): rm is Room => rm !== undefined);
    const taken = new Set<number>();
    for (let k = 0; k < ob.of && rooms.length > 0; k++) {
      const rm = rooms[k % rooms.length];
      if (rm === undefined) continue;
      const spot = freeSpotIn(lv, rm, this.rng, taken);
      if (spot === null) continue;
      taken.add(toCell(spot.z) * lv.w + toCell(spot.x));
      this.scatter.push({ id: `card:${ob.item}:${k}`, x: spot.x, z: spot.z, picked: false });
    }
  }

  /** The copies not yet picked up, on the floor. */
  private dropScatter(): void {
    for (const c of this.scatter) if (!c.picked) placeQuestPickup(this.g, c.x, c.z, c.id);
  }

  /**
   * One of the card's people resolved, by any road (combat.ts
   * `resolveActor`, hosts.ts `resolvePeacefully`), at the moment it happens:
   * the objective counts it and the run keeps the Rep it really paid
   * (`earned`, after the employer's rate and any talk-down's cut). Counted
   * here and not by a look over the crowd each frame, so where the frame is
   * when a save is written can never lose it.
   */
  resolvedPerson(a: Actor, earned: number): void {
    const i = this.crowd.indexOf(a);
    if (i < 0) return;
    this.run.resolved(i, a.kind, earned, this.specs[i]?.tag ?? null);
  }

  /** A copy picked up (`updatePickups`, for a pickup id of the card's). */
  picked(id: string): void {
    const c = this.scatter.find((x) => x.id === id);
    if (c === undefined || c.picked || this.run.over) return;
    c.picked = true;
    this.run.collected();
    const ob = this.card.objective;
    if (ob.kind === 'collect' && !this.run.objectiveDone) this.g.hud.toast(`${QUEST_ITEMS[ob.item]?.name ?? 'Got one'}: ${this.run.progress}/${ob.count}.`, 'info');
  }

  /** The objective's closet (the stapler's, in HR's office). */
  private closet(): Interactable | undefined {
    const lv = this.g.level;
    const id = lv.recipe?.closet ?? -1;
    return id < 0 ? undefined : lv.interactables.find((it) => it.id === id);
  }

  /** The computer a fix objective is about (in Marcus's office). */
  fixTerminal(): Interactable | undefined {
    const ob = this.card.objective;
    if (ob.kind !== 'fix') return undefined;
    const room = this.rooms[ob.room]?.[0];
    return room === undefined ? undefined : this.g.level.interactables.find((it) => it.kind === 'terminal' && it.room === room);
  }

  /** Desk-bound people face the way in: the nearest opening in their room's edge. */
  private towardDoor(a: Actor, rm: Room): number {
    const lv = this.g.level;
    let best: Point | null = null;
    let bestD = Infinity;
    for (let y = rm.y; y < rm.y + rm.h; y++) {
      for (let x = rm.x; x < rm.x + rm.w; x++) {
        if (x !== rm.x && y !== rm.y && x !== rm.x + rm.w - 1 && y !== rm.y + rm.h - 1) continue;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = x + ox;
          const ny = y + oy;
          const outside = nx < rm.x || ny < rm.y || nx >= rm.x + rm.w || ny >= rm.y + rm.h;
          if (!outside || lv.floor[ny * lv.w + nx] !== 1) continue;
          const p = { x: cellCenter(nx), z: cellCenter(ny) };
          const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
          if (d < bestD) {
            bestD = d;
            best = p;
          }
        }
      }
    }
    return best === null ? a.yaw : Math.atan2(best.x - a.pos.x, best.z - a.pos.z);
  }

  /**
   * A patrol (spec 4.3): from their post to the corridor node nearest it,
   * two more nodes in a seeded order, the near node again, and home. One
   * that crosses the spine (the stapler's HR) first steps out of the back
   * door to the spine's node and back: the quiet route's one exposure.
   */
  private routeFrom(a: Actor, crossesSpine = false): Point[] {
    const lv = this.g.level;
    const at = (cell: number): Point => ({ x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)) });
    const near2 = (p: number, q: number): number => {
      const pp = at(p);
      const qq = at(q);
      return Math.hypot(pp.x - a.pos.x, pp.z - a.pos.z) - Math.hypot(qq.x - a.pos.x, qq.z - a.pos.z);
    };
    const nodes = [...(lv.recipe?.nodes ?? [])].sort(near2);
    const near = nodes[0];
    if (near === undefined) return [];
    const far = this.rng.shuffle(nodes.slice(1)).slice(0, 2);
    const post = { x: a.pos.x, z: a.pos.z };
    const spine = crossesSpine ? [...(lv.recipe?.spineNodes ?? [])].sort(near2)[0] : undefined;
    return [post, ...(spine === undefined ? [] : [at(spine), post]), at(near), ...far.map(at), at(near)];
  }

  // ---------------------------------------------------------------- the game's hooks

  /** One frame of play: the clock, sprint noise, resolves, the objective, the HUD. */
  update(dt: number, sprinting: boolean): void {
    if (this.run.over) return;
    const g = this.g;
    this.run.tick(dt);
    for (const w of this.watch.watchers.values()) {
      if (w.sort === 'patrol' && this.inView(w.actor)) this.observed.set(w.actor.id, (this.observed.get(w.actor.id) ?? 0) + dt);
    }
    if (sprinting) {
      this.sprintIn -= dt;
      if (this.sprintIn <= 0) {
        this.noise('sprint');
        this.sprintIn = SPRINT_NOISE_EVERY;
      }
    } else {
      this.sprintIn = 0;
    }
    // The card's alarm rule (D7): searches, cool-downs.
    this.watch.tick(dt);
    // Somebody of the crowd turned on you by a road the watch did not see (a failed talk-down): Alert.
    for (const w of this.watch.watchers.values()) {
      if (w.actor.aggro && !w.actor.resolved && w.mood !== 'alert') this.watch.aggroed(w.actor, g.time);
    }
    for (const w of this.watch.watchers.values()) if (w.peak >= INVESTIGATE) this.run.noticedBy(w.tag);
    const ob = this.card.objective;
    if (ob.kind === 'take' && g.save.questItems.includes(ob.item)) this.run.took(ob.item);
    if (ob.kind === 'escort' && !this.escort(dt)) return;
    // A P1's clock (spec 2.5): out of time and the card has failed.
    if (this.card.sla !== undefined && !this.run.objectiveDone && this.run.seconds >= this.card.sla) {
      this.fail('The SLA ran out');
      return;
    }
    // Going loud on a card that says what it costs (the stapler): the closet bolted, somebody called in.
    if (!this.loudDone && this.card.onLoud !== undefined && this.watch.tier >= 2 && !this.run.objectiveDone) this.goLoud(false);
    if (!this.doneSaid && this.run.objectiveDone) {
      this.doneSaid = true;
      sfx.chime();
      g.hud.toast(ob.kind === 'take' ? `${QUEST_ITEMS[ob.item]?.name ?? 'Got it'}. Now back to the lift.`
        : ob.kind === 'escort' ? `${this.escortee?.name ?? 'They'} made it to the counter. Back to the lift.`
          : ob.kind === 'fix' ? 'The backup agent is running again. Back to the lift.'
            : ob.kind === 'collect' ? `${ob.count} of them. That will do. Back to the lift.` : 'That is all of them. Back to the lift.', 'good');
    }
    if (this.watch.tier >= 3 && !this.tinted) {
      this.tinted = true;
      this.lightColors = g.lights.map((l) => l.color.getHex());
      for (const l of g.lights) l.color.setHex(ALARM_TINT);
    }
    this.drawHud();
    this.drawBars();
  }

  /** The light colours before the alarm tint, to put back when the tier cools below Escalated. */
  private lightColors: number[] = [];

  /**
   * An escort, frame by frame: their nerve drains with anyone after you
   * close to them, comes back slowly otherwise; at zero they bolt (the card
   * has failed). At the counter, the objective is done. False if it failed.
   */
  private escort(dt: number): boolean {
    const j = this.escortee;
    if (j === null) return true;
    const g = this.g;
    const scared = g.actors.some((a) => a.hostile && a.aggro && !a.resolved && Math.hypot(a.pos.x - j.pos.x, a.pos.z - j.pos.z) < ESCORT_FRIGHT);
    const before = this.nerve;
    this.nerve = scared ? Math.max(0, this.nerve - NERVE_DRAIN * dt) : Math.min(100, this.nerve + NERVE_BACK * dt);
    if (scared && before >= 50 && this.nerve < 50) {
      setMarker(j, '!', '#ffb020');
      g.hud.toast(`${j.name} is losing it (nerve ${Math.round(this.nerve)}). Get them away from the fight.`, 'bad');
    }
    if (!scared && this.nerve >= 50 && before < 50) setMarker(j, null);
    if (this.nerve <= 0) {
      this.fail(`${j.name} panicked and took the lift`);
      return false;
    }
    const lv = this.g.level;
    const desk = lv.interactables.find((it) => it.kind === 'itdesk');
    const inRoom = desk !== undefined && lv.roomOf[toCell(j.pos.z) * lv.w + toCell(j.pos.x)] === desk.room;
    if (!this.run.objectiveDone && desk !== undefined && inRoom && Math.hypot(desk.x - j.pos.x, desk.z - j.pos.z) <= ESCORT_REACH) this.run.reached();
    return true;
  }

  /**
   * The card's going-loud (the stapler's tuning): the objective's closet is
   * bolted (a harder lock, a Security check under pressure) and somebody is
   * called in, already after you. `quiet`: putting it back after a reload
   * (whoever was called is among the people the save kept).
   */
  private goLoud(quiet: boolean): void {
    const on = this.card.onLoud;
    this.loudDone = true;
    if (on === undefined) return;
    const closet = this.closet();
    if (closet !== undefined && on.lock !== undefined && !closet.used) closet.lock += on.lock;
    if (quiet) return;
    this.callIn();
    sfx.error();
    this.g.hud.toast(`${on.summon?.line ?? 'They have bolted the closet.'}${closet !== undefined && on.lock !== undefined ? ` (lock ${closet.lock})` : ''}`, 'bad');
  }

  /** Whoever the card's going-loud calls in (the Head of People), after you unless `quiet` (a save from before extras were kept). */
  private callIn(quiet = false): void {
    const g = this.g;
    const spec = this.card.onLoud?.summon;
    if (spec === undefined) return;
    const spot = this.spotFor(spec, 0, new Set());
    const a = spot === null ? null : g.spawnAt(spec.kind, spot.x, spot.z, spot.room, false);
    if (a === null) return;
    if (spec.name !== undefined) a.name = spec.name;
    a.docile = false;
    this.crowd.push(a);
    this.specs.push(spec);
    this.watch.add(a, spec.sort, { tag: spec.tag ?? null, called: true });
    if (!quiet) {
      a.cooldown = Math.max(a.cooldown, ALERT_PAUSE);
      this.watch.aggroed(a, g.time);
    }
  }

  /**
   * Somebody who came onto the card's map in play (a manager's "someone from
   * my team", a reply-all, a turret: `Game.spawn`): one of the card's people
   * from now on, watched like the rest, so the card's alarm rule holds for
   * them (they search, stand down and cool off with everyone), they count
   * toward the tier, and a save keeps them.
   */
  summoned(a: Actor): void {
    if (this.run.over || this.crowd.includes(a)) return;
    a.docile = false;
    this.crowd.push(a);
    this.specs.push({ kind: a.kind, room: 'summoned', sort: 'wander' });
    this.watch.add(a, 'wander');
    if (a.aggro) this.watch.aggroed(a, this.g.time);
  }

  /** The card has failed by its own failure (the SLA, the escort bolting). */
  fail(why: string): void {
    if (this.run.over) return;
    this.failedWhy = why;
    this.finish('failed');
  }

  noise(kind: NoiseKind): void {
    if (this.run.over) return;
    this.noiseEvents++;
    this.watch.noise(kind, this.g.player.pos.x, this.g.player.pos.z, this.g.time);
  }

  /** Somebody turned on you, by any road. */
  aggroed(a: Actor): void {
    this.watch.aggroed(a, this.g.time);
  }

  /** Who saw that: the watched who have you in their cone right now, near enough. */
  witnesses(range: number, kinds: readonly Actor['kind'][]): Actor[] {
    const pp = this.g.player.pos;
    return this.watch.witnesses().filter((a) => kinds.includes(a.kind) && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < range);
  }

  /** A crime with witnesses (a lock picked in view): each of them is Alert. */
  crime(seen: readonly Actor[]): void {
    for (const a of seen) {
      if (a.aggro || a.resolved) continue;
      a.aggro = true;
      a.docile = false;
      a.cooldown = Math.max(a.cooldown, ALERT_PAUSE);
      this.g.noticed(a);
      this.watch.aggroed(a, this.g.time);
    }
  }

  private tierChanged(to: Tier, from: Tier, by: Actor | null, why: string): void {
    const g = this.g;
    if (to < from) {
      // The card's alarm rule let it cool (search, cooldown): announced like a rise.
      sfx.ding();
      g.hud.toast(`STOOD DOWN to ${TIER_NAMES[to].toUpperCase()}: ${why}.`, 'good');
      if (from >= 3) {
        sfx.setBoss(false);
        this.tinted = false;
        g.lights.forEach((l, i) => l.color.setHex(this.lightColors[i] ?? l.color.getHex()));
      }
      this.drawHud();
      return;
    }
    this.run.tier(to);
    if (to >= 1 && this.noticedAt === null) this.noticedAt = this.run.seconds;
    if (to >= 2 && this.detectedAt === null) this.detectedAt = this.run.seconds;
    if (to === 1) {
      sfx.ding();
      g.hud.toast(`NOTICED: ${why}.`, 'bad');
    } else if (to === 2) {
      sfx.error();
      g.hud.toast(`ALERT: ${why}. Tannoy: "Security to floor 7B. Security to floor 7B."`, 'bad');
    } else if (to === 3) {
      sfx.setBoss(true);
      g.hud.toast(`ESCALATED: ${by === null ? 'the floor' : why}. Everyone is hostile on sight. The lift still works.`, 'epic');
    }
  }

  // ---------------------------------------------------------------- the lift, and the end

  liftPrompt(): string {
    return this.run.objectiveDone ? 'E: Take the lift - close the card' : 'E: The lift (the card is not done)';
  }

  /**
   * E on the lift. On the debug path: done, the card closes; not, you may
   * abort it. In a career the lift's buttons (S1b "The lift as mission
   * select"): Finish once the objective is done, Abort while it is not (the
   * card stays on the board until Friday) or, on a P1, back to the hub (a
   * P1 is never aborted, only left), and Friday once the week's P1 is done.
   */
  lift(): void {
    if (this.run.over) return;
    const g = this.g;
    const go = (then: () => void): (() => null) => () => {
      g.afterDialogue = then;
      return null;
    };
    if (!this.career) {
      if (this.run.objectiveDone) {
        this.finish('done');
        return;
      }
      g.openDialogue({
        speaker: 'The lift',
        text: `The card is not done: ${this.card.objective.text} Leave anyway? An aborted card pays nothing.`,
        options: [
          { label: 'Abort the card.', pick: go(() => this.finish('aborted')) },
          { label: 'Not yet.', leave: true, pick: () => null },
        ],
      });
      return;
    }
    const options: DialogueOption[] = [];
    if (this.run.objectiveDone) options.push({ label: 'Finish: close the card', pick: go(() => this.finish('done')) });
    else if (this.card.p1 === true) options.push({ label: 'Back to the hub (the P1 waits as you left it)', pick: go(() => g.leaveP1()) });
    else options.push({ label: 'Abort: back to the hub (the card stays on the board until Friday)', pick: go(() => this.finish('aborted')) });
    if (g.p1Done() && !this.run.objectiveDone && this.card.p1 !== true) {
      options.push({ label: 'Friday: to the mökki (the card stays on the board)', pick: go(() => {
        this.finish('aborted', true);
        g.leaveForFriday();
      }) });
    }
    options.push({ label: 'Not yet.', leave: true, pick: () => null });
    const status = this.run.objectiveDone ? 'The card is done: close it and you are paid.' : `The card is not done: ${this.card.objective.text}`;
    g.openDialogue({ speaker: 'The lift', subtitle: `#${this.card.number} ${this.card.title}`, text: `A pan-pipe cover of something you used to like. ${status}`, options });
  }

  /**
   * Close the card (`done` only once the objective is), pay it at the
   * card's rate, and show what happened. In a career the deck hears of it
   * (`Game.cardEnded`); a burnout goes to the burnout screen, and `silent`
   * (Friday from the mission's lift) shows no results card.
   */
  finish(how: Finish, silent = false): void {
    const end = this.run.finish(how, this.rate);
    if (end === null) return;
    const g = this.g;
    if (how === 'done') {
      g.addRep(end.pay.base + end.pay.bonus);
      if (end.pay.management !== 0) g.standing('management', end.pay.management);
      if (end.pay.staff !== 0) g.standing('staff', end.pay.staff);
    }
    sfx.setBoss(false);
    this.show(false);
    if (this.career) g.cardEnded(this, end.outcome);
    if (silent || (this.career && how === 'burnout')) return;
    this.showResult(end.outcome, end.pay);
  }

  private showResult(o: Outcome, pay: Payout): void {
    const g = this.g;
    const s = g.save;
    const mins = Math.floor(o.seconds / 60);
    const secs = Math.floor(o.seconds % 60);
    const head = o.finish === 'done' ? 'CARD CLOSED' : o.finish === 'aborted' ? 'CARD ABORTED' : o.finish === 'failed' ? 'CARD FAILED' : 'BURNED OUT';
    const how = o.finish === 'done' ? (pay.quiet ? 'Finished quiet' : 'Finished loud')
      : o.finish === 'aborted' ? (this.career && this.card.p1 !== true ? 'Aborted at the lift (still on the board until Friday)' : 'Aborted at the lift')
        : o.finish === 'failed' ? `Failed: ${this.failedWhy}` : 'Burned out on the card';
    const rep = s.rep - this.repAtStart;
    const mgmt = s.standing.management - this.standingAtStart.management;
    const staff = s.standing.staff - this.standingAtStart.staff;
    const sign = (n: number): string => `${n >= 0 ? '+' : ''}${Math.round(n)}`;
    const why = o.finish === 'done' && !pay.quiet ? (o.spoiled ? ' (HR noticed you)' : ` (it reached ${TIER_NAMES[o.maxTier]})`) : '';
    const rows: [string, string][] = [
      ['Card', `#${this.card.number} ${this.card.title}`],
      ['Finished', `${how}${why}`],
      ['Time', `${mins}:${String(secs).padStart(2, '0')}`],
      ['Rep', `${sign(rep)} (card ${pay.base}, quiet bonus ${pay.bonus}, resolves ${pay.perResolve})`],
      ['Standing', `Management ${sign(mgmt)}, Staff ${sign(staff)}`],
      ['Escalation reached', TIER_NAMES[o.maxTier]],
      ['Alarm rule', ALARM_WORDS[this.alarm]],
    ];
    if (this.afterHours) rows.push(['After hours', `pay x${this.rate}`]);
    if (o.finish === 'failed') rows.push(['Consequence', this.card.failure.text]);
    if (this.career) {
      this.view.result(head, o.finish === 'burnout', rows, [['Back to the hub', () => g.leaveMission()]]);
      return;
    }
    const again = this.pinned ? this.seed : (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    this.view.result(head, o.finish === 'burnout', rows, [['Again', () => startMission(g, this.card, again, this.pinned, this.alarm)], ['Title', () => screens.showTitle(g)]]);
  }

  // ---------------------------------------------------------------- what the player sees

  /** Up in play only; the results card has its own screen. */
  show(visible: boolean): void {
    const on = visible && !this.run.over;
    this.view.show(on);
    for (const b of this.bars.values()) if (!on) b.group.visible = false;
  }

  private drawHud(): void {
    const t = this.watch.tier;
    const ob = this.card.objective;
    const count = ob.kind === 'resolve' || ob.kind === 'collect' ? ` (${this.run.progress}/${ob.count})` : '';
    const nerve = ob.kind === 'escort' ? ` (${this.escortee?.name ?? 'Their'} nerve ${Math.round(this.nerve)})` : '';
    const clock = this.card.sla !== undefined ? ` (SLA ${Math.max(0, Math.ceil(this.card.sla - this.run.seconds))} s)` : '';
    const goal = this.run.objectiveDone ? 'Back to the lift.' : `${ob.text}${count}${nerve}${clock}`;
    const rule = `${ALARM_WORDS[this.alarm]}${this.afterHours ? ' After hours.' : ''}`;
    const key = `${t}|${goal}|${rule}`;
    if (key === this.hudShown) return;
    this.hudShown = key;
    this.view.draw(t, goal, rule);
  }

  /**
   * The amber bar over each head as suspicion rises (spec 4.4). From
   * Investigate up it shows through walls: you always know who is coming.
   * Alert has its own "!", and Escalated needs no bars at all.
   */
  private drawBars(): void {
    const g = this.g;
    const q = g.camera.quaternion;
    for (const w of this.watch.watchers.values()) {
      const a = w.actor;
      let bar = this.bars.get(a.id);
      const shown = this.watch.tier < 3 && w.mood !== 'alert' && w.mood !== 'searching' && !a.resolved && w.suspicion > 0.5
        && (w.suspicion >= INVESTIGATE || this.inView(a));
      if (!shown) {
        if (bar !== undefined) bar.group.visible = false;
        continue;
      }
      if (bar === undefined) {
        bar = makeBar();
        g.scene.add(bar.group);
        this.bars.set(a.id, bar);
      }
      bar.group.visible = true;
      bar.group.position.set(a.pos.x, BAR_Y * (a.rig?.root.scale.y ?? 1), a.pos.z);
      bar.group.quaternion.copy(q);
      const k = Math.max(0.001, w.suspicion / 100);
      bar.fill.scale.x = k;
      bar.fill.position.x = -(1 - k) * 0.45;
      const through = w.suspicion >= INVESTIGATE;
      for (const m of bar.mats) m.depthTest = !through;
    }
  }

  markers(): CompassMarker[] {
    const lv = this.g.level;
    const gold = '#ffd54a';
    if (this.run.over) return [];
    const lift = lv.interactables.find((it) => it.kind === 'elevator');
    if (this.run.objectiveDone) return lift === undefined ? [] : [{ x: lift.x, z: lift.z, icon: '◆', color: gold, label: 'The lift' }];
    const ob = this.card.objective;
    switch (ob.kind) {
      case 'take': {
        const closet = this.closet();
        return closet === undefined ? [] : [{ x: closet.x, z: closet.z, icon: '◆', color: gold, label: 'HR\'s closet' }];
      }
      case 'collect':
        return this.scatter.filter((c) => !c.picked).map((c) => ({ x: c.x, z: c.z, icon: '◆', color: gold, label: QUEST_ITEMS[ob.item]?.name ?? 'Post-it' }));
      case 'escort': {
        const desk = lv.interactables.find((it) => it.kind === 'itdesk');
        const out: CompassMarker[] = desk === undefined ? [] : [{ x: desk.x, z: desk.z, icon: '◆', color: gold, label: 'Internal IT' }];
        if (this.escortee !== null) out.push({ x: this.escortee.pos.x, z: this.escortee.pos.z, icon: '◇', color: gold, label: this.escortee.name });
        return out;
      }
      case 'fix': {
        const t = this.fixTerminal();
        return t === undefined ? [] : [{ x: t.x, z: t.z, icon: '◆', color: gold, label: 'Marcus\'s computer' }];
      }
      case 'resolve':
        return this.crowd.filter((a, i) => a.kind === ob.who && (ob.tag === undefined || this.specs[i]?.tag === ob.tag) && !a.resolved)
          .map((a) => ({ x: a.pos.x, z: a.pos.z, icon: '◆', color: gold, label: a.name }));
    }
  }

  /** The light share the map is lit at (after hours, dimmer). */
  get lightScale(): number {
    return this.afterHours ? AFTER_HOURS_LIGHT : 1;
  }

  /**
   * E on a computer on the card's map: the one a fix objective is about is
   * the card's (the backup agent, then Marcus's three-way choice); any
   * other is an ordinary desk. True when the card took it.
   */
  use(it: Interactable): boolean {
    const t = this.fixTerminal();
    if (t === undefined || it.id !== t.id) return false;
    const g = this.g;
    if (this.run.over || this.run.objectiveDone) {
      g.hud.toast('The backup agent is running. It says so in green, which is new.', 'info');
      return true;
    }
    const marcus = this.crowd.find((_a, i) => this.specs[i]?.tag === 'marcus');
    g.exercise('troubleshooting', 1);
    g.openDialogue(marcusBackups(g, marcus?.name ?? 'Marcus from Sales', (text, mood) => {
      this.run.reached();
      return said(marcus?.name ?? 'Marcus from Sales', text, mood ?? 'neutral');
    }));
    return true;
  }

  /** E on one of the card's own people who is not after you: what they have to say (null: as anyone else). */
  talk(a: Actor): DialogueNode | null {
    const i = this.crowd.indexOf(a);
    const tag = this.specs[i]?.tag;
    if (a === this.escortee) return said(a.name, this.run.objectiveDone ? 'I made it! Morag gave me a badge. It has the wrong name on it.' : `Right behind you. (Nerve ${Math.round(this.nerve)}.)`, 'neutral', 'Come on, then');
    if (tag === 'marcus' && !a.aggro) return said(a.name, this.run.objectiveDone ? 'Is it fixed? Do not tell me how.' : 'It is on my computer. The agent. Just... go and look.', 'neutral', 'On it');
    return null;
  }

  /** Everything the run keeps across a save. */
  save(): PlaySave {
    const people: PersonSave[] = this.crowd.map((a, i) => {
      const w = this.watch.watchers.get(a.id);
      return {
        i, x: a.pos.x, z: a.pos.z, yaw: a.yaw, hp: a.hp, resolved: a.resolved, aggro: a.aggro,
        suspicion: w?.suspicion ?? 0, peak: w?.peak ?? 0, mood: w?.mood ?? 'calm', countdown: w?.countdown ?? 0, spot: w?.spot ?? null,
        stolen: a.stolen, talked: a.talked, enragedT: a.enragedT, memo: lastingMemo(a), gift: a.giftGiven, fleeT: a.fleeT,
        ...(i >= this.placed ? { extra: {
          kind: a.kind, name: a.name, room: a.room, elite: a.elite, rep: a.rep, sort: w?.sort ?? 'wander', tag: w?.tag ?? null,
          called: w?.called === true, owner: this.crowd.findIndex((o) => o.id === a.owner), ttl: a.ttl,
        } } : {}),
      };
    });
    return {
      run: this.run.save(), tier: this.watch.tier, quietT: this.watch.quietT, people,
      collected: this.scatter.flatMap((c, k) => (c.picked ? [k] : [])), loudDone: this.loudDone, nerve: this.nerve,
      repAtStart: this.repAtStart, managementAtStart: this.standingAtStart.management, staffAtStart: this.standingAtStart.staff,
      detectedAt: this.detectedAt, noticedAt: this.noticedAt, noiseEvents: this.noiseEvents,
    };
  }

  /** Into the career's save, before it is written (`Game.writeSlotFor`). */
  note(): void {
    const m = this.g.save.mission;
    if (this.career && m !== null && !this.run.over) m.run = this.save();
  }

  /** A run put back as a save kept it: the alarm, the people as they were, what had been picked up. */
  private resume(from: PlaySave): void {
    const g = this.g;
    if (from.loudDone) this.goLoud(true);
    this.rejoin(from);
    this.watch.quietT = from.quietT;
    this.nerve = from.nerve;
    this.repAtStart = from.repAtStart;
    this.standingAtStart = { management: from.managementAtStart, staff: from.staffAtStart };
    this.detectedAt = from.detectedAt;
    this.noticedAt = from.noticedAt;
    this.noiseEvents = from.noiseEvents;
    for (const k of from.collected) {
      const c = this.scatter[k];
      if (c !== undefined) c.picked = true;
    }
    for (const p of from.people) {
      const a = this.crowd[p.i];
      if (a === undefined) continue;
      if (p.resolved) {
        // Dealt with before the save: gone from the map, counted already (the run kept the count).
        a.resolved = true;
        a.expired = true;
        disposeActor(g.scene, a);
        continue;
      }
      a.pos.set(p.x, 0, p.z);
      a.yaw = p.yaw;
      a.hp = Math.min(a.maxHp, p.hp);
      // What happened between you and them: a bill still owed, a talk had (a failed one stays failed), a rage, a beat, a gift.
      a.stolen = p.stolen ?? 0;
      a.talked = p.talked === true;
      a.enragedT = p.enragedT ?? 0;
      for (const k of p.memo ?? []) a.memo[k] = true;
      a.giftGiven = p.gift === true;
      a.fleeT = p.fleeT ?? 0;
      const w = this.watch.watchers.get(a.id);
      if (w !== undefined) this.watch.restore(w, p);
      if (p.aggro && p.mood !== 'searching') {
        a.aggro = true;
        a.docile = false;
        a.cooldown = Math.max(a.cooldown, ALERT_PAUSE);
      }
    }
    g.actors = g.actors.filter((a) => !(a.expired && this.crowd.includes(a)));
  }

  /**
   * Everyone a save kept who was not placed by the card (called in, summoned
   * in play), back in their places in the crowd, in order. A save from
   * before these were kept has only the card's call-in there, and gets it.
   */
  private rejoin(from: PlaySave): void {
    const g = this.g;
    const later = from.people.filter((p) => p.i >= this.placed).sort((p, q) => p.i - q.i);
    for (const p of later) {
      if (p.i !== this.crowd.length) break;
      const e = p.extra;
      if (e === undefined) {
        if (!from.loudDone || this.crowd.length !== this.placed) break;
        this.callIn(true);
        continue;
      }
      const a = g.spawnAt(e.kind, p.x, p.z, e.room, false, { elite: e.elite, ...(e.ttl > 0 ? { ttl: e.ttl } : {}) });
      if (a === null) break;
      a.name = e.name;
      a.rep = e.rep;
      a.docile = false;
      a.owner = this.crowd[e.owner]?.id ?? 0;
      this.crowd.push(a);
      this.specs.push(e.called ? this.card.onLoud?.summon ?? { kind: e.kind, room: 'summoned', sort: e.sort } : { kind: e.kind, room: 'summoned', sort: e.sort });
      this.watch.add(a, e.sort, { tag: e.tag, called: e.called });
    }
  }

  dispose(): void {
    this.view.dispose();
    for (const b of this.bars.values()) {
      this.g.scene.remove(b.group);
      disposeTree(b.group, true);
    }
    this.bars.clear();
  }

  // ---------------------------------------------------------------- for the browser tests and the bot

  /** In the player's view, also in headless play where render culling is not run. */
  private inView(a: Actor): boolean {
    const g = this.g;
    const p = g.player.pos;
    const dx = a.pos.x - p.x;
    const dz = a.pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const half = Math.atan(Math.tan(g.camera.fov * Math.PI / 360) * g.camera.aspect);
    return !a.resolved && d <= 45 && (d < 0.1 || (-dx * Math.sin(g.player.yaw) - dz * Math.cos(g.player.yaw)) / d >= Math.cos(half))
      && lineOfSight(g.level, p.x, p.z, a.pos.x, a.pos.z);
  }

  /** Only the eye, visible people/bars and patrol routes learned after five seconds in view. */
  hud(): MissionHud {
    const actors: MissionHud['actors'][number][] = [];
    const routes: Point[][] = [];
    for (const w of this.watch.watchers.values()) {
      const patrol = (this.observed.get(w.actor.id) ?? 0) >= 5 - 1e-9 ? w.route.map((p) => ({ ...p })) : [];
      if (patrol.length) routes.push(patrol);
      const visible = this.inView(w.actor);
      const bar = this.watch.tier < 3 && w.mood !== 'alert' && w.mood !== 'searching' && !w.actor.resolved && w.suspicion > 0.5 && (visible || w.suspicion >= INVESTIGATE);
      if (!visible && !bar) continue;
      actors.push({ id: w.actor.id, visible, sort: w.sort, hostile: w.actor.hostile, aggro: w.actor.aggro,
        x: w.actor.pos.x, z: w.actor.pos.z, yaw: visible ? w.actor.yaw : null,
        suspicion: bar ? w.suspicion : null, patrol, mark: visible ? w.shown : '' });
    }
    return { tier: this.watch.tier, actors, routes, rule: this.alarm };
  }

  /**
   * Read-only state for the measurement bot and the browser tests: the tier,
   * every watched person's suspicion and route, the spine's cells, the run.
   */
  debug(): MissionDebug {
    const lv = this.g.level;
    const at = (cell: number): Point => ({ x: cellCenter(cell % lv.w), z: cellCenter(Math.floor(cell / lv.w)) });
    return {
      card: this.card.id, seed: this.seed, style: this.card.style, alarm: this.alarm, afterHours: this.afterHours, rate: this.rate, career: this.career,
      objective: this.card.objective.kind, nerve: this.nerve, loudDone: this.loudDone,
      scatter: this.scatter.map((c) => ({ x: c.x, z: c.z, picked: c.picked })),
      escortee: this.escortee === null ? null : { id: this.escortee.id, x: this.escortee.pos.x, z: this.escortee.pos.z },
      fixAt: ((t) => (t === undefined ? null : { id: t.id, x: t.x, z: t.z }))(this.fixTerminal()),
      tier: this.watch.tier, tierName: TIER_NAMES[this.watch.tier], maxTier: this.run.maxTier,
      seconds: this.run.seconds, objectiveDone: this.run.objectiveDone, progress: this.run.progress,
      spoiled: this.run.spoiled, over: this.run.over, finish: this.run.outcome?.finish ?? null,
      detectedAt: this.detectedAt, noticedAt: this.noticedAt, noiseEvents: this.noiseEvents,
      result: this.run.outcome === null ? null : {
        ...payout(this.card, this.run.outcome, this.rate), repTotal: Math.round(this.g.save.rep - this.repAtStart),
      },
      hud: this.hud(),
      actors: [...this.watch.watchers.values()].map((w) => ({
        id: w.actor.id, name: w.actor.name, kind: w.actor.kind, tag: w.tag, sort: w.sort,
        hostile: w.actor.hostile, aggro: w.actor.aggro, resolved: w.actor.resolved,
        suspicion: w.suspicion, mood: w.mood, seeing: w.seeing, bark: w.bark, barkAt: w.barkAt,
        x: w.actor.pos.x, z: w.actor.pos.z, yaw: w.actor.yaw, countdown: w.countdown, mark: w.shown,
        patrol: w.route.map((p) => ({ x: p.x, z: p.z })),
      })),
      spine: (lv.recipe?.spine ?? []).map(at),
    };
  }

  /**
   * Stand the player `dist` m in front of watcher `id`, inside their cone, in
   * their sight, facing away from them. It only moves the player.
   */
  standInView(id: number, dist: number): boolean {
    const g = this.g;
    const a = this.crowd.find((x) => x.id === id);
    if (a === undefined) return false;
    const lv = g.level;
    for (const off of [0, 0.25, -0.25, 0.5, -0.5]) {
      const yaw = a.yaw + off;
      const x = a.pos.x + Math.sin(yaw) * dist;
      const z = a.pos.z + Math.cos(yaw) * dist;
      const c = toCell(z) * lv.w + toCell(x);
      if (lv.floor[c] !== 1 || lv.solid[c] !== 0) continue;
      if (!lineOfSight(lv, a.pos.x, a.pos.z, x, z) || !walkClear(lv, a.pos.x, a.pos.z, x, z)) continue;
      g.player.pos.set(x, 0, z);
      // The player faces -sin(yaw), -cos(yaw): away from them.
      g.player.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z));
      g.player.pitch = 0;
      return true;
    }
    return false;
  }

  /**
   * Stand the player `dist` m from the nearest copy still lying on the
   * floor (a collect card), facing it, with a clear step onto it. It only
   * moves the player: walking over it (the W key) is the player's.
   */
  toCopy(dist: number): boolean {
    const g = this.g;
    const lv = g.level;
    const pp = g.player.pos;
    const left = this.scatter.filter((c) => !c.picked).sort((p, q) => Math.hypot(p.x - pp.x, p.z - pp.z) - Math.hypot(q.x - pp.x, q.z - pp.z));
    for (const c of left) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const x = c.x + Math.sin(ang) * dist;
        const z = c.z + Math.cos(ang) * dist;
        const cell = toCell(z) * lv.w + toCell(x);
        if (lv.floor[cell] !== 1 || lv.solid[cell] !== 0 || !walkClear(lv, x, z, c.x, c.z)) continue;
        g.player.pos.set(x, 0, z);
        // The player faces -sin(yaw), -cos(yaw): toward the copy.
        g.player.yaw = Math.atan2(x - c.x, z - c.z);
        g.player.pitch = 0;
        return true;
      }
    }
    return false;
  }

  /**
   * Stand the player two cells into the service spine from the lobby's back
   * door, facing straight down it (along its row, to its far end). It only
   * moves the player. False on a card with no spine.
   */
  toSpine(): boolean {
    const g = this.g;
    const lv = g.level;
    const field = flowField(lv, lv.start.x, lv.start.z, 32000);
    const dist = (c: number): number => field[c] ?? -1;
    const open = (lv.recipe?.spine ?? []).filter((c) => lv.solid[c] === 0 && dist(c) >= 0).sort((p, q) => dist(p) - dist(q));
    const door = open[0];
    if (door === undefined) return false;
    const first = open.find((c) => dist(c) >= dist(door) + 2);
    if (first === undefined) return false;
    const row = Math.floor(first / lv.w);
    const end = open.filter((c) => Math.floor(c / lv.w) === row).sort((p, q) => dist(q) - dist(p))[0];
    if (end === undefined || end === first) return false;
    const x = cellCenter(first % lv.w);
    const z = cellCenter(row);
    g.player.pos.set(x, 0, z);
    // The player faces -sin(yaw), -cos(yaw).
    g.player.yaw = Math.atan2(x - cellCenter(end % lv.w), 0);
    g.player.pitch = 0;
    return true;
  }
}

/** The read-only picture `debug()` gives. */
export interface MissionDebug {
  readonly card: string;
  readonly seed: number;
  readonly style: string;
  readonly alarm: AlarmRule;
  readonly afterHours: boolean;
  readonly rate: number;
  readonly career: boolean;
  readonly objective: string;
  readonly nerve: number;
  readonly loudDone: boolean;
  readonly scatter: readonly { readonly x: number; readonly z: number; readonly picked: boolean }[];
  readonly escortee: { readonly id: number; readonly x: number; readonly z: number } | null;
  readonly fixAt: { readonly id: number; readonly x: number; readonly z: number } | null;
  readonly tier: Tier;
  readonly tierName: string;
  readonly maxTier: Tier;
  readonly seconds: number;
  readonly objectiveDone: boolean;
  readonly progress: number;
  readonly spoiled: boolean;
  readonly over: boolean;
  readonly finish: Finish | null;
  readonly detectedAt: number | null;
  readonly noticedAt: number | null;
  readonly noiseEvents: number;
  readonly result: (Payout & { readonly repTotal: number }) | null;
  readonly hud: MissionHud;
  readonly actors: readonly {
    readonly id: number; readonly name: string; readonly kind: string; readonly tag: string | null; readonly sort: string;
    readonly hostile: boolean; readonly aggro: boolean; readonly resolved: boolean;
    readonly suspicion: number; readonly mood: string; readonly seeing: boolean; readonly bark: string; readonly barkAt: number;
    readonly x: number; readonly z: number; readonly yaw: number; readonly countdown: number; readonly mark: string; readonly patrol: readonly Point[];
  }[];
  readonly spine: readonly Point[];
}

export interface MissionHud {
  readonly tier: Tier;
  readonly actors: readonly {
    readonly id: number; readonly visible: boolean; readonly sort: string;
    readonly hostile: boolean; readonly aggro: boolean;
    readonly x: number; readonly z: number; readonly yaw: number | null;
    readonly suspicion: number | null; readonly patrol: readonly Point[];
    /** What is over their head, while they are in view ('?', '!', a search's countdown). */
    readonly mark: string;
  }[];
  readonly routes: readonly (readonly Point[])[];
  /** The card's alarm rule, as the HUD prints it. */
  readonly rule: AlarmRule;
}

function makeBar(): Bar {
  const group = new THREE.Group();
  const bgMat = new THREE.MeshBasicMaterial({ color: 0x2a1a00, transparent: true, opacity: 0.75 });
  const fillMat = new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true });
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), bgMat);
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.09), fillMat);
  fill.position.z = 0.001;
  bg.renderOrder = 13;
  fill.renderOrder = 14;
  group.add(bg, fill);
  group.visible = false;
  return { group, fill, mats: [bgMat, fillMat] };
}

/** The card's briefing: who it is from, what to do, what loud means, and the alarm rule. */
export function briefing(card: MissionCard, alarm: AlarmRule, afterHours: boolean): DialogueNode {
  return said(card.source, `"${card.voice}" ${card.objective.text} ${card.loud} The alarm: ${ALARM_WORDS[alarm]}${afterHours ? ' After hours: half the floor has gone home, and the lights are down.' : ''}`, 'neutral', 'Take the card');
}

/** Take a card on the debug path (`?mission=`): the map behind the loading card, then the briefing. */
export function startMission(g: Game, card: MissionCard, seed: number, pinned: boolean, alarm: AlarmRule = card.alarm): void {
  screens.showLoading(g, 'Taking the card', () => {
    g.loadMission(card, seed, pinned, alarm);
    screens.startPlay(g);
    g.openDialogue(briefing(card, alarm, false));
  });
}

/** The mission's DOM: a HUD panel over the game, and the results card on the overlay. */
function domView(g: Game, card: MissionCard): MissionView {
  const el = document.createElement('div');
  el.className = 'mission-hud';
  el.setAttribute('data-testid', 'mission-hud');
  g.mount.append(el);
  return {
    draw(tier, goal, rule) {
      el.dataset.tier = String(tier);
      el.innerHTML = `<div class="mission-eye-row"><svg class="mission-eye" viewBox="0 0 40 24" aria-hidden="true">${EYES[tier]}</svg><span class="mission-tier"></span></div><div class="mission-goal"></div><div class="mission-rule" data-testid="mission-rule"></div>`;
      const label = el.querySelector('.mission-tier');
      if (label !== null) label.textContent = TIER_NAMES[tier].toUpperCase();
      const line = el.querySelector('.mission-goal');
      if (line !== null) line.textContent = `#${card.number} ${card.title}: ${goal}`;
      const words = el.querySelector('.mission-rule');
      if (words !== null) words.textContent = `Alarm: ${rule}`;
    },
    show(on) {
      el.style.display = on ? 'block' : 'none';
    },
    result(head, dead, rows, buttons) {
      g.screen = 'ending';
      g.input.releaseLock();
      const list = document.createElement('dl');
      list.className = 'mission-result';
      list.setAttribute('data-testid', 'mission-result');
      for (const [k, v] of rows) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = v;
        list.append(dt, dd);
      }
      screens.setOverlay(g, `<div class="title-logo small${dead ? ' dead' : ''}">${head}</div>`, buttons.map(([label, act]) => [label, act]), list, { menu: true });
    },
    dispose() {
      el.remove();
    },
  };
}
