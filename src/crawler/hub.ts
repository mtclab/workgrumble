import { TICKETS } from './content/tickets';
import { ticketSla } from './desk';
import { type DialogueNode, said } from './dialogue';
import { type Actor, type ActorKind, type HubCtx, rollActor, say, setMarker } from './entities';
import { FINAL_FLOOR, type Game } from './game';
import { cellCenter, generateLevel, type Interactable, type Level, lineOfSight, toCell } from './level';
import { Rng } from './rng';
import { type HubArrival, type HubArrivalKind, type HubReason, type QueuedTicket, type SaveState } from './state';
import { storyBeatDone, storyNpcFor } from './story';
import { THEMES, type Theme } from './textures';
import { caughtCheck } from './vices';
import { cancelWindup } from './windup';

/**
 * The hub (docs/SPEC_HELLDESK_030_S1.md, S1a): the career's own office floor.
 * Monday starts on it, the week's major incident (P1) is up the lift, and
 * Friday is unlocked by resolving it.
 *
 * Nobody on the hub is after you unless you give them a reason, and every
 * reason is announced before anyone swings: a toast naming who and why, a
 * bark, a red "!" over them, and no swing for `HUB_GRACE` seconds. The
 * reasons are an SLA breach (the ticket's reporter), a walk-up ignored three
 * times, hitting a colleague (the victim and everyone who saw), a crime
 * witnessed, low Staff standing on a Monday, and a story choice that makes an
 * enemy. A failed talk-down enrages somebody already after you, as it always
 * did. Nothing else turns anyone: on the hub nobody summons anybody
 * (`Game.spawn`), and the quests' fights wait on the P1 floor.
 */

/** The hub is today's floor 2 in size: 52 x 52 cells, thirteen rooms. */
export const HUB_FLOOR = 2;

/** Mixed into the career's seed for its hub: the same career, the same hub. */
const HUB_SALT = 0x2f6b7c1d;

/** Seconds after turning before anyone on the hub may swing (the wind-up rule, docs/SPEC_COMBAT_READ.md). */
export const HUB_GRACE = 1.5;

/** Who can see a colleague hit, in metres. */
export const WITNESS_RANGE = 12;

/** A walk-up you walk this far away from (once they have reached you) is ignored. */
const IGNORE_DIST = 4;

/** At your side: a walk-up this close, who can see you, has reached you once they have said their piece. */
export const REACHED_DIST = 1.8;

/** Seconds their line has to have been up (the bubble over them, at your side) before walking off is ignoring them. */
export const LINE_TIME = 1;

/** An ignore is forgotten this many seconds of hub time after it was counted. */
export const IGNORE_MEMORY = 600;

/** The third ignore turns them. */
export const IGNORES_TO_TURN = 3;

/** One walk-up every this many seconds of hub time, at random between. */
const WALKUP_GAP: readonly [number, number] = [60, 120];

/** A walk-up who cannot reach you for this long gives up (no ignore counted). */
const WALKUP_GIVE_UP = 90;

/** A fight: anyone after you this close (metres) and on to you... */
export const FIGHT_RANGE = 20;

/** ...or damage dealt or taken this many seconds ago. Nobody walks up with a printer problem mid-fight. */
export const FIGHT_MEMORY = 10;

/** Below this Staff standing, somebody on the hub has been waiting all weekend. */
const GRUDGE_STAFF = -40;

export { HUB_EXTRA_BASE } from './state';

/** Who on the hub can turn: the workers. */
const WORKERS: readonly ActorKind[] = ['user', 'caller', 'manager'];

/** Who walks up with a problem. */
const WALKERS: readonly ActorKind[] = ['user', 'caller'];

/** A walk-up comes from within this many metres: somebody who can see you are about. */
const WALKUP_FROM = 30;

export function hubSeed(careerSeed: number): number {
  return (careerSeed ^ HUB_SALT) >>> 0;
}

/** One theme for the whole career. */
export function hubTheme(careerSeed: number): Theme {
  const theme = THEMES[hubSeed(careerSeed) % THEMES.length] ?? THEMES[0];
  if (theme === undefined) throw new Error('no theme');
  return theme;
}

/** The career's hub, the same every time it is built. */
export function buildHub(careerSeed: number, noTextures = false): Level {
  return generateLevel(HUB_FLOOR, hubTheme(careerSeed), hubSeed(careerSeed), noTextures, !noTextures, 'hub');
}

/**
 * The dice for one person on the hub, by spawn index: names and looks do not
 * depend on who else was spawned before them, so a reload, a person resolved
 * and next week all show the same people.
 */
export function personRng(careerSeed: number, spawnIndex: number): Rng {
  return new Rng((hubSeed(careerSeed) ^ Math.imul(spawnIndex + 1, 0x9e3779b1)) >>> 0);
}

/** Has this week's P1 been resolved (Friday is open)? */
export function p1Resolved(s: SaveState): boolean {
  return s.floorState.floor === s.floor && s.floorState.bossDone;
}

/** A floor as the lift's buttons, the floor's name and the announcements say it. */
export function floorLabel(n: number): string {
  return n === 0 ? 'B1' : n > FINAL_FLOOR ? `Overtime ${n - FINAL_FLOOR}` : String(n);
}

const OPENERS = ['Got a minute?', 'Have you got a sec?', 'Sorry, are you IT?', 'Oh good, you are here.'];
const SMALL_TALK = [
  'Morning. Is it just me, or is the Wi-Fi worse on Mondays?',
  'If you see whoever keeps taking the good mugs, tell them I know.',
  'Busy week? Same. I have three meetings about the meeting.',
  'The coffee machine said DESCALING again. It is lying.',
  'Did you get the all-staff email? Do not reply-all. Somebody will.',
];

/** The hub's state as the tests and the bot read it (actor ids, -1 for somebody not on the floor). */
export interface HubDebug {
  readonly clock: number;
  readonly nextWalkUpIn: number | null;
  readonly walker: number | null;
  readonly reached: boolean;
  readonly ignores: readonly { readonly id: number; readonly n: number }[];
  readonly hostile: readonly { readonly id: number; readonly reason: HubReason }[];
}

/** The nearest open cell's centre to a spot, within two cells, searched in a fixed order (or null). */
function freeNear(lv: Level, x: number, z: number): { x: number; z: number } | null {
  const cx = toCell(x);
  const cz = toCell(z);
  const open = (c: number, r: number): boolean => c >= 0 && r >= 0 && c < lv.w && r < lv.h && lv.floor[r * lv.w + c] === 1 && lv.solid[r * lv.w + c] === 0;
  if (open(cx, cz)) return { x, z };
  for (let ring = 1; ring <= 2; ring++) {
    for (let oz = -ring; oz <= ring; oz++) {
      for (let ox = -ring; ox <= ring; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oz)) === ring && open(cx + ox, cz + oz)) return { x: cellCenter(cx + ox), z: cellCenter(cz + oz) };
      }
    }
  }
  return null;
}

export class Hub implements HubCtx {
  private readonly g: Game;
  /** Somebody walking up to you with a problem, or null. */
  private walker: Actor | null = null;
  /** The walk-up has reached you (so walking off now is ignoring them). */
  private reached = false;
  /** Seconds the walk-up has stood at your side, in sight, since saying their line (0: not said yet). */
  private lineT = 0;
  /** Seconds since the walk-up last reached you (or began). */
  private walkerT = 0;
  /** Seconds of hub time between the last walk-up and the next. */
  private gap: number;

  constructor(g: Game) {
    this.g = g;
    this.gap = this.nextGap();
  }

  /** The lift on the hub (in the lobby). */
  lift(): Interactable | undefined {
    return this.g.level.interactables.find((it) => it.kind === 'elevator');
  }

  /**
   * Everyone on the hub, from the level's spawns: colleagues (users,
   * callers, managers) neutral, the Kitchen Cabinet, Internal IT's people,
   * the Saunatonttu, and this week's story NPC; and this week's arrivals
   * (a story's enemy, a visitor, a breach's reporter), by the lift. Whoever
   * was resolved this week stays away; whoever is after you is still after you.
   */
  populate(): void {
    const g = this.g;
    const s = g.save;
    const npc = storyNpcFor(s.floor);
    const gone = new Set(s.hub.resolved);
    g.level.spawns.forEach((sp, k) => {
      const idx = k * 4;
      if (sp.kind === 'npc') {
        if (!storyBeatDone(s.flags, npc.id) && !(npc.id === 'pa' && s.won)) g.spawnAt('npc', sp.x, sp.z, sp.room, false, { npc }, personRng(s.seed, idx));
        return;
      }
      if (gone.has(idx)) return;
      // Somebody whose chair is under a desk stands at the nearest free spot, the same one every time.
      const at = freeNear(g.level, sp.x, sp.z);
      if (at === null) return;
      const colleague = WORKERS.includes(sp.kind);
      g.spawnAt(sp.kind, at.x, at.z, sp.room, false, { spawnIndex: idx, ...(colleague ? { colleague: true } : {}) }, personRng(s.seed, idx));
    });
    for (const r of s.hub.arrivals) if (!gone.has(r.index)) this.spawnArrival(r, null);
    let still = 0;
    for (const h of s.hub.hostile) {
      const a = g.actors.find((x) => x.colleague && x.spawnIndex === h.spawnIndex);
      if (a === undefined || a.resolved) continue;
      this.makeHostile(a, h.reason);
      still++;
    }
    if (still > 0) g.hud.toast(`${still === 1 ? 'Somebody on this floor is' : `${still} people on this floor are`} still after you (the red "!").`, 'bad');
    // Hub tickets that breached while you were upstairs: their reporters come for you now, announced.
    const due = s.hub.breaches;
    s.hub.breaches = [];
    for (const q of due) this.breach(q);
  }

  /** Monday, and Staff standing is low: somebody has been waiting all weekend for a word. */
  monday(): void {
    const g = this.g;
    const s = g.save;
    if (s.standing.staff >= GRUDGE_STAFF || g.inductionDay !== null) return;
    const pool = g.actors.filter((a) => a.colleague && !a.hostile && !a.resolved);
    if (pool.length === 0) return;
    const a = new Rng((hubSeed(s.seed) ^ Math.imul(s.week, 7919)) >>> 0).pick(pool);
    this.turn(a, 'grudge', `Word gets round (Staff ${Math.round(s.standing.staff)}): ${a.name} has been waiting all weekend to have a word with you.`, 'You. A word. NOW.');
  }

  seeks(a: Actor): boolean {
    return a === this.walker;
  }

  /** The person walking up to you, if anyone (for the tests and the bot). */
  walkingUp(): Actor | null {
    return this.walker;
  }

  /** One frame on the hub: its clock, the walk-ups, and the managers' noses. */
  update(dt: number): void {
    const g = this.g;
    // Induction day: the morning is Morag's. Nobody comes over or notices anything until it is done.
    if (!g.floorAwake || g.inductionDay !== null) return;
    const h = g.save.hub;
    h.clock += dt;
    this.forget();
    this.smellTest();
    const fight = this.fighting();
    if (this.walker !== null) this.tickWalkUp(dt, fight);
    // A walk-up that falls due mid-fight waits for the fight to be over.
    else if (!fight && h.clock - h.lastWalkUp >= this.gap) this.startWalkUp();
  }

  /** Is the player in a fight: anyone after you and on to you within FIGHT_RANGE, or damage dealt or taken in the last FIGHT_MEMORY seconds? */
  fighting(): boolean {
    const g = this.g;
    if (g.time - g.combatAt < FIGHT_MEMORY) return true;
    const pp = g.player.pos;
    return g.actors.some((a) => a.hostile && a.aggro && !a.resolved && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < FIGHT_RANGE);
  }

  /**
   * An SLA breach: the ticket's reporter (by name) comes to find you. If
   * they were resolved earlier this week, the same person comes back for
   * this one; only somebody the hub has never had this week comes up in the
   * lift, as a new arrival.
   */
  breach(q: Pick<QueuedTicket, 't' | 'from'>): void {
    const g = this.g;
    const title = TICKETS[q.t]?.title ?? 'it';
    const toast = `${q.from} is on the way up, and is not happy.`;
    const bark = `"${title}" - STILL broken!`;
    const a = g.actors.find((x) => x.colleague && !x.resolved && x.name === q.from)
      ?? this.comeBack(q.from)
      ?? this.spawnArrival(this.newArrival('user', 'breach', q.from), null);
    if (a !== null) this.turn(a, 'breach', toast, bark);
  }

  /** The player has hit a colleague: the victim, and every colleague within sight of it, turn; HR hears of it. */
  assault(victim: Actor): void {
    const g = this.g;
    if (victim.hostile || victim.resolved || !victim.colleague) return;
    this.turn(victim, 'assault', `You hit ${victim.name}. HR will hear about it, and so will everyone who saw.`, 'You HIT me?!');
    const pp = g.player.pos;
    for (const w of g.actors) {
      if (w === victim || !w.colleague || w.hostile || w.resolved) continue;
      if (Math.hypot(w.pos.x - pp.x, w.pos.z - pp.z) > WITNESS_RANGE || !lineOfSight(g.level, w.pos.x, w.pos.z, pp.x, pp.z)) continue;
      this.turn(w, 'witness', `${w.name} saw you hit ${victim.name}.`, 'I SAW that!');
    }
    g.warn(`Hit ${victim.name}, a colleague, at work`);
  }

  /** A crime somebody saw (the fridge, a supply closet): the colleagues among them are after you for the week. */
  witnessed(seen: readonly Actor[], what: string): void {
    for (const w of seen) this.turn(w, 'witness', `${w.name} saw you ${what}, and is not letting it go.`, 'I saw that. Everyone will know.');
  }

  /** A story choice that makes an enemy (somebody blamed, a promise broken): they come for you, announced, and stay for the week. */
  arrive(kind: HubArrivalKind, x: number, z: number, name: string, bark: string): Actor | null {
    const a = this.spawnArrival(this.newArrival(kind, 'story', name), { x, z });
    if (a !== null) this.turn(a, 'story', `${name} is coming for you.`, bark);
    return a;
  }

  /** A colleague, for a visit that is not a fight (a manager who caught you napping, or at the cat pictures); here for the week. */
  visit(kind: HubArrivalKind, x: number, z: number): Actor | null {
    return this.spawnArrival(this.newArrival(kind, 'visit', null), { x, z });
  }

  /** E on a colleague who is not after you: a walk-up's problem, or the time of day. */
  talk(a: Actor): DialogueNode {
    const g = this.g;
    if (a !== this.walker) return said(a.name, SMALL_TALK[a.id % SMALL_TALK.length] ?? 'Morning.', 'neutral', 'Back to work');
    const t = TICKETS[a.ticket];
    const rep = 8 + g.save.floor * 2;
    return {
      speaker: a.name,
      subtitle: 'A walk-up',
      text: `${OPENERS[a.id % OPENERS.length] ?? 'Got a minute?'} "${t?.title ?? 'It is broken'}" - it has been like that since this morning.`,
      options: [
        {
          label: `Walk them through it: "${t?.fixes[0] ?? 'Turn it off and on again'}"`, tag: `+₡${rep}`, pick: () => {
            this.settle(a, true);
            g.addRep(rep);
            g.exercise('troubleshooting', 1);
            return said(a.name, 'Oh! That was it. You are a lifesaver.', 'good');
          },
        },
        {
          label: `Could you raise a ticket for that? (SLA about ${Math.max(1, Math.round(ticketSla(g, false) / 60))} min)`, tag: 'Into your queue', pick: () => {
            this.settle(a, true);
            g.enqueueTicket(a, false);
            return said(a.name, 'A ticket. Right. I will do that now. You will look at it, though?', 'neutral');
          },
        },
      ],
    };
  }

  /** Off the floor: nothing is left behind. */
  dispose(): void {
    this.walker = null;
  }

  /** What the hub is doing, read-only: for the browser tests and the balance bot. */
  debug(): HubDebug {
    const g = this.g;
    const h = g.save.hub;
    const id = (idx: number): number => g.actors.find((a) => a.colleague && a.spawnIndex === idx && !a.resolved)?.id ?? -1;
    return {
      clock: h.clock,
      nextWalkUpIn: this.walker === null ? Math.max(0, h.lastWalkUp + this.gap - h.clock) : null,
      walker: this.walker?.id ?? null,
      reached: this.reached,
      ignores: Object.entries(h.ignores).map(([idx, at]) => ({ id: id(Number(idx)), n: at.length })),
      hostile: h.hostile.map((e) => ({ id: id(e.spawnIndex), reason: e.reason })),
    };
  }

  /** The next walk-up now rather than in a minute or two of hub time (a slow renderer cannot wait that out). It only skips the wait. */
  walkUpNow(): void {
    if (this.walker === null) this.gap = this.g.save.hub.clock - this.g.save.hub.lastWalkUp;
  }

  // ---------------------------------------------------------------- inside

  /**
   * Somebody on the hub turns on you, for a reason, and says so first: the
   * toast and the bark now, the "!" over them, and no swing for HUB_GRACE
   * seconds. `bark` null keeps whatever they have just said.
   */
  private turn(a: Actor, reason: HubReason, toast: string, bark: string | null): void {
    if (a.resolved || a.hostile || !a.colleague) return;
    this.g.hud.toast(toast, 'bad');
    if (bark !== null) say(a, bark, 3, '#fff', 'rgba(140,20,0,0.92)');
    this.makeHostile(a, reason);
  }

  /** Hostile, marked, after you, and not swinging for HUB_GRACE seconds; remembered for the week. */
  private makeHostile(a: Actor, reason: HubReason): void {
    a.hostile = true;
    a.aggro = true;
    a.docile = false;
    cancelWindup(a);
    a.cooldown = Math.max(a.cooldown, HUB_GRACE);
    setMarker(a, '!', '#ff5a3a');
    if (this.walker === a) this.walker = null;
    const list = this.g.save.hub.hostile;
    if (a.spawnIndex >= 0 && !list.some((h) => h.spawnIndex === a.spawnIndex)) list.push({ spawnIndex: a.spawnIndex, reason });
  }

  /** A new arrival's record, with the next index (never one handed out before), kept for the week. `name` null: whoever they roll as. */
  private newArrival(kind: HubArrivalKind, why: HubArrival['why'], name: string | null): HubArrival {
    const h = this.g.save.hub;
    const r: HubArrival = { index: h.nextArrival, kind, name: name ?? '', why };
    h.nextArrival++;
    h.arrivals.push(r);
    return r;
  }

  /**
   * An arrival on the floor: at `at`, or stepping out of the lift into the
   * lobby. Their looks are seeded by their index, their name is the record's
   * (a visitor's record takes the name they rolled).
   */
  private spawnArrival(r: HubArrival, at: { x: number; z: number } | null): Actor | null {
    const g = this.g;
    let spot = at;
    if (spot === null) {
      const lift = this.lift();
      const x = lift === undefined ? g.level.start.x : lift.x + Math.sign(g.level.start.x - lift.x) * 1.5;
      const z = lift === undefined ? g.level.start.z : lift.z + Math.sign(g.level.start.z - lift.z) * 1.5;
      spot = freeNear(g.level, x, z) ?? g.level.start;
    }
    const a = g.spawnAt(r.kind, spot.x, spot.z, at === null ? 0 : -1, false, { colleague: true, spawnIndex: r.index }, personRng(g.save.seed, r.index));
    if (a === null) return null;
    if (r.name === '') {
      const list = g.save.hub.arrivals;
      list[list.indexOf(r)] = { ...r, name: a.name };
    } else {
      a.name = r.name;
    }
    return a;
  }

  /**
   * Somebody of this name resolved earlier this week (one of the hub's own
   * people, or an arrival): the same person, back for more, at their desk or
   * out of the lift. Null if the hub has had nobody of that name this week.
   */
  private comeBack(name: string): Actor | null {
    const g = this.g;
    const s = g.save;
    const resolved = new Set(s.hub.resolved);
    const back = (idx: number): void => {
      s.hub.resolved = s.hub.resolved.filter((x) => x !== idx);
    };
    const r = s.hub.arrivals.find((x) => x.name === name && resolved.has(x.index));
    if (r !== undefined) {
      back(r.index);
      return this.spawnArrival(r, null);
    }
    for (let k = 0; k < g.level.spawns.length; k++) {
      const sp = g.level.spawns[k];
      const idx = k * 4;
      if (sp === undefined || !resolved.has(idx) || !WORKERS.includes(sp.kind)) continue;
      if (rollActor(sp.kind, g.floor, personRng(s.seed, idx), TICKETS.length).name !== name) continue;
      const at = freeNear(g.level, sp.x, sp.z);
      if (at === null) continue;
      back(idx);
      return g.spawnAt(sp.kind, at.x, at.z, sp.room, false, { spawnIndex: idx, colleague: true }, personRng(s.seed, idx));
    }
    return null;
  }

  /** A manager close by who is not after you can still smell the lonkero: caught, they are. */
  private smellTest(): void {
    const g = this.g;
    if (g.caughtCd > 0) return;
    const pp = g.player.pos;
    for (const m of g.actors) {
      if (m.kind !== 'manager' || !m.colleague || m.hostile || m.resolved) continue;
      if (Math.hypot(m.pos.x - pp.x, m.pos.z - pp.z) >= 3.5 || !lineOfSight(g.level, m.pos.x, m.pos.z, pp.x, pp.z)) continue;
      if (caughtCheck(g, m)) this.turn(m, 'caught', `${m.name} caught you, and will not let it go this week.`, null);
      return;
    }
  }

  private nextGap(): number {
    const h = this.g.save.hub;
    const r = new Rng((hubSeed(this.g.save.seed) ^ Math.imul(h.week + 1, 7919) ^ Math.imul(Math.round(h.lastWalkUp) + 1, 104729)) >>> 0);
    return r.range(WALKUP_GAP[0], WALKUP_GAP[1]);
  }

  /** Somebody with a problem, near enough to walk over, comes looking for you. */
  private startWalkUp(): void {
    const g = this.g;
    const h = g.save.hub;
    const lv = g.level;
    const pp = g.player.pos;
    const pool = g.actors.filter((a) => a.colleague && !a.hostile && !a.resolved && WALKERS.includes(a.kind)
      && Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z) < WALKUP_FROM && (g.field[toCell(a.pos.z) * lv.w + toCell(a.pos.x)] ?? -1) >= 0);
    if (pool.length === 0) {
      // Nobody in walking distance: look again in ten seconds.
      this.gap = h.clock - h.lastWalkUp + 10;
      return;
    }
    const a = new Rng((hubSeed(g.save.seed) ^ Math.imul(Math.round(h.clock) + 1, 2654435761)) >>> 0).pick(pool);
    h.lastWalkUp = h.clock;
    this.gap = this.nextGap();
    this.walker = a;
    this.reached = false;
    this.lineT = 0;
    this.walkerT = 0;
    setMarker(a, '?', '#7dd3ff');
    say(a, OPENERS[a.id % OPENERS.length] ?? 'Got a minute?', 3);
  }

  /**
   * The walk-up, frame by frame. They reach you only by standing at your
   * side (REACHED_DIST), in sight of you, with their line said and up for
   * LINE_TIME: walking past them is not stopping for them, so it is not
   * ignoring them either. Once they have reached you, walking off past
   * IGNORE_DIST counts one ignore. Somebody who never reaches you gives up
   * after WALKUP_GIVE_UP seconds, and that counts nothing. In a fight it
   * all waits: nothing counts, and they have to reach you again after it.
   */
  private tickWalkUp(dt: number, fight: boolean): void {
    const g = this.g;
    const a = this.walker;
    if (a === null) return;
    if (a.resolved || a.hostile) {
      this.walker = null;
      return;
    }
    if (fight) {
      this.reached = false;
      this.lineT = 0;
      return;
    }
    this.walkerT += dt;
    const pp = g.player.pos;
    const dist = Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z);
    if (this.reached) {
      // Waiting at your side is not giving up.
      if (dist <= IGNORE_DIST) this.walkerT = 0;
      else this.ignored(a);
    } else if (dist <= REACHED_DIST && lineOfSight(g.level, a.pos.x, a.pos.z, pp.x, pp.z)) {
      if (this.lineT === 0) say(a, `"${TICKETS[a.ticket]?.title ?? 'It is broken'}" - can you have a look?`, 3);
      this.lineT += dt;
      if (this.lineT >= LINE_TIME) {
        this.reached = true;
        this.walkerT = 0;
      }
    } else {
      // Gone past before they could say it: next time they catch you up, they start again.
      this.lineT = 0;
    }
    if (!this.reached && this.walkerT > WALKUP_GIVE_UP) this.settle(a, false);
  }

  /** Walked off on them, after they had reached you and said their piece: one ignore, remembered for IGNORE_MEMORY seconds of hub time. */
  private ignored(a: Actor): void {
    const g = this.g;
    this.reached = false;
    this.lineT = 0;
    const h = g.save.hub;
    const at = [...(h.ignores[a.spawnIndex] ?? []), h.clock];
    h.ignores[a.spawnIndex] = at;
    const n = at.length;
    if (n >= IGNORES_TO_TURN) {
      this.turn(a, 'ignored', `${a.name} has been ignored three times, and has had enough.`, 'RIGHT. I have asked you THREE times.');
      return;
    }
    say(a, n === 1 ? 'Hello? I was talking to you.' : 'I am not asking again. Nicely.', 3);
    g.hud.toast(`You walked off on ${a.name} (${n}/${IGNORES_TO_TURN}). They are still waiting.`, 'info');
  }

  /** Ignores older than IGNORE_MEMORY seconds of hub time are forgotten. */
  private forget(): void {
    const h = this.g.save.hub;
    for (const [idx, at] of Object.entries(h.ignores)) {
      const live = at.filter((t) => h.clock - t < IGNORE_MEMORY);
      if (live.length === 0) delete h.ignores[Number(idx)];
      else if (live.length !== at.length) h.ignores[Number(idx)] = live;
    }
  }

  /** The walk-up is over without a fight: talked to (which clears their ignores), or given up on (which does not). */
  private settle(a: Actor, talked: boolean): void {
    if (this.walker !== a) return;
    this.walker = null;
    setMarker(a, null);
    if (talked) delete this.g.save.hub.ignores[a.spawnIndex];
  }
}
