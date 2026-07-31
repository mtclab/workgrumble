/**
 * The lead doing his rounds, as data.
 *
 * Desmond Frisk walks the floor a few times a shift. Where he walks is decided
 * before the day starts - a seeded schedule, exactly like the ticket drip - so
 * the same seed and the same day put him behind you at the same minute however
 * many times it is replayed, and a save carries no boss state at all: the
 * schedule is a function of the day, and the phase is a function of the tick.
 *
 * A visit has three moments. The TELEGRAPH is the corridor: footsteps, the
 * reflection in the monitor, the taskbar going unsteady - a fixed and tunable
 * number of minutes in which the player can do something about what is on their
 * screen. The ARRIVAL is the minute he is at your shoulder, and the only minute
 * anything is decided. The DEPARTURE is when he goes back to his office.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import {
  isLunchtime,
  lunchWindow,
  seededOffset,
  shiftWindow,
  type TickWindow,
} from './day';

/* -- the tunables --------------------------------------------------------- */

/**
 * The reaction window, in simulated minutes. This is THE difficulty knob of
 * the whole boss system: it is how long the player has between the first
 * footstep and the shoulder, and everything else about a patrol is scenery.
 */
export const TELEGRAPH_TICKS = 4;

/** How long he stands there being encouraging. */
export const PRESENCE_TICKS = 3;

/** Rounds per shift. Three is enough to be a rhythm and not a siege. */
export const PATROLS_PER_DAY = 3;

/** He is not up yet. Nobody patrols the floor at five past nine. */
const PATROL_OPENS_AFTER = 45;
/** And he leaves early, which is the one thing everybody relies on. */
const PATROL_CLOSES_BEFORE = 45;
/** How far either side of its nominal slot a round may wander. */
const PATROL_JITTER = 18;
/** Clear minutes between one round leaving and the next telegraphing. */
const PATROL_MIN_GAP = 30;

/** Pings per shift: the chat window opening itself with a question in it. */
export const PINGS_PER_DAY = 2;
const PING_OPENS_AFTER = 60;
const PING_CLOSES_BEFORE = 60;
const PING_JITTER = 22;

/** What one ping does to you. It is not much. There are two of them. */
export const PING_STRESS = 4;

/**
 * Where suspicion lands after being caught.
 *
 * A floor rather than zero: being caught does not launder the morning, it
 * resets the meter to the level of somebody who has just been spoken to. The
 * price is paid in reputation, which is the meter that does not drain.
 */
export const CAUGHT_SUSPICION_FLOOR = 15;
export const CAUGHT_REPUTATION_COST = 6;

/** Empties he will walk past without comment. The fourth one he counts. */
export const EMPTIES_TOLERATED = 3;
export const EMPTIES_SUSPICION_BUMP = 8;

/* -- the schedule --------------------------------------------------------- */

export interface BossVisit {
  /** Which round of the day this is, counting from 0. */
  readonly index: number;
  /** First footstep: the reaction window opens here. */
  readonly telegraphTick: number;
  /** At your shoulder. The only minute anything is decided. */
  readonly arrivalTick: number;
  /** Back to the office with the door. */
  readonly departureTick: number;
}

export interface BossPing {
  readonly index: number;
  readonly tick: number;
  /** What he says, in the chat thread he has always used. */
  readonly line: string;
  /**
   * A ticket this ping drops on the desk, if it drops one. The first ping of
   * the day carries the phone: high claimed urgency, one affected desk, and
   * the priority trap the triage matrix exists to catch.
   */
  readonly ticketId: string | null;
}

export interface PatrolSchedule {
  readonly day: number;
  readonly shift: TickWindow;
  readonly visits: readonly BossVisit[];
  readonly pings: readonly BossPing[];
}

/** The trap ticket the lead raises by not raising a ticket. */
export const BOSS_TRAP_TICKET = 'ticket:boss-phone';

/**
 * What he says when he pings, in order. Data, because it is content: the first
 * one is the one that lands a ticket, and it says so in his own words.
 */
export const BOSS_PING_LINES: readonly string[] = [
  'Pat - my phone has stopped getting email. I need it for the eleven '
  + 'o\'clock. I have not raised a ticket because I am telling you now, which '
  + 'is faster. Top priority, please.',
  'Pat - no rush at all on the phone thing, but is it done? Only I am about '
  + 'to walk into the eleven o\'clock. Which was at eleven.',
];

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function requireDay(day: number): void {
  if (!Number.isSafeInteger(day) || day < 1) {
    throw new TypeError('A day number starts at 1 and counts up.');
  }
}

/**
 * Slots spread evenly across a window and nudged by a seeded offset, earliest
 * first. The same shape the ticket drip uses, for the same reason: two days
 * with the same content must not arrive in lockstep, and the same day must
 * always arrive the same way.
 */
function spreadSlots(
  window: Readonly<TickWindow>,
  count: number,
  seed: number,
  day: number,
  key: string,
  jitter: number,
): readonly number[] {
  const first = window.from;
  const last = Math.max(first, window.to);
  const step = (last - first) / (count + 1);

  return Array.from({ length: count }, (_unused, index) => clamp(
    Math.round(first + step * (index + 1))
      + seededOffset(seed, day, `${key}:${String(index)}`, jitter),
    first,
    last,
  )).sort((left, right) => left - right);
}

/**
 * Moves a moment out of the lunch half hour.
 *
 * He does not patrol at lunch and he does not ping at lunch, because lunch is
 * the safe window the whole mechanic is taught in - a boss who turned up at
 * ten past twelve would make the tutorial a lie. `pad` is what has to be clear
 * BEFORE the moment as well, so a visit whose footsteps would start inside
 * lunch is moved too, not just one that arrives inside it.
 */
function afterLunch(
  tick: number,
  lunch: Readonly<TickWindow>,
  pad: number,
  latest: number,
): number {
  const opens = tick - pad;
  const closes = tick + PRESENCE_TICKS;
  const overlapsLunch = opens < lunch.to && closes > lunch.from;

  return overlapsLunch ? Math.min(latest, lunch.to + pad) : tick;
}

/**
 * The day's rounds and the day's pings.
 *
 * Rounds are pushed apart if the jitter stacked two of them: being caught by
 * the same man twice in six minutes is not a mechanic, it is a bug wearing
 * one. Anything that would run past the end of the window is dropped rather
 * than squeezed - a round that arrives at 16:59 is a round nobody can react to.
 */
export function buildPatrolSchedule(day: number, seed: number): PatrolSchedule {
  requireDay(day);
  const shift = shiftWindow(day);
  const lunch = lunchWindow(day);
  const patrolWindow: TickWindow = {
    from: shift.from + PATROL_OPENS_AFTER,
    to: shift.to - PATROL_CLOSES_BEFORE,
  };

  const visits: BossVisit[] = [];
  let earliest = patrolWindow.from;

  for (
    const slot of spreadSlots(
      patrolWindow,
      PATROLS_PER_DAY,
      seed,
      day,
      'boss:patrol',
      PATROL_JITTER,
    )
  ) {
    const spaced = Math.max(slot, earliest);
    const arrivalTick = afterLunch(
      spaced,
      lunch,
      TELEGRAPH_TICKS,
      patrolWindow.to,
    );

    if (arrivalTick > patrolWindow.to || arrivalTick < earliest) {
      continue;
    }

    const departureTick = arrivalTick + PRESENCE_TICKS;
    visits.push({
      index: visits.length,
      telegraphTick: arrivalTick - TELEGRAPH_TICKS,
      arrivalTick,
      departureTick,
    });
    earliest = departureTick + PATROL_MIN_GAP + TELEGRAPH_TICKS;
  }

  const pings: BossPing[] = spreadSlots(
    { from: shift.from + PING_OPENS_AFTER, to: shift.to - PING_CLOSES_BEFORE },
    PINGS_PER_DAY,
    seed,
    day,
    'boss:ping',
    PING_JITTER,
  ).map((slot, index) => ({
    index,
    tick: afterLunch(slot, lunch, 0, shift.to - PING_CLOSES_BEFORE),
    line: BOSS_PING_LINES[index] ?? BOSS_PING_LINES[0] ?? '',
    // Only the first one raises anything. The second is the same man asking
    // whether the first one is done yet, which is the joke.
    ticketId: index === 0 ? BOSS_TRAP_TICKET : null,
  }));

  return {
    day,
    shift,
    visits: Object.freeze(visits),
    pings: Object.freeze(pings),
  };
}

/* -- reading the schedule ------------------------------------------------- */

export type PatrolPhase = 'clear' | 'telegraph' | 'present';

/** The visit whose window covers this minute, if any. */
export function visitAt(
  schedule: Readonly<PatrolSchedule>,
  tick: number,
): BossVisit | null {
  return schedule.visits.find(
    (visit) => tick >= visit.telegraphTick && tick < visit.departureTick,
  ) ?? null;
}

export function patrolPhase(
  schedule: Readonly<PatrolSchedule>,
  tick: number,
): PatrolPhase {
  const visit = visitAt(schedule, tick);

  if (visit === null) {
    return 'clear';
  }

  return tick < visit.arrivalTick ? 'telegraph' : 'present';
}

/** How long is left to do something about it, in simulated minutes. */
export function ticksToArrival(
  schedule: Readonly<PatrolSchedule>,
  tick: number,
): number | null {
  const visit = visitAt(schedule, tick);

  return visit === null || tick >= visit.arrivalTick
    ? null
    : visit.arrivalTick - tick;
}

/** Every round that ARRIVES in `(after, upTo]` - what a clock step decides. */
export function visitsArrivingBetween(
  schedule: Readonly<PatrolSchedule>,
  after: number,
  upTo: number,
): readonly BossVisit[] {
  return schedule.visits.filter(
    (visit) => visit.arrivalTick > after && visit.arrivalTick <= upTo,
  );
}

/** Every round whose footsteps START in `(after, upTo]`. */
export function visitsTelegraphingBetween(
  schedule: Readonly<PatrolSchedule>,
  after: number,
  upTo: number,
): readonly BossVisit[] {
  return schedule.visits.filter(
    (visit) => visit.telegraphTick > after && visit.telegraphTick <= upTo,
  );
}

export function pingsBetween(
  schedule: Readonly<PatrolSchedule>,
  after: number,
  upTo: number,
): readonly BossPing[] {
  return schedule.pings.filter(
    (ping) => ping.tick > after && ping.tick <= upTo,
  );
}

/**
 * Which slack app gets you caught.
 *
 * The first one in the shell's own list, which is z-order from the bottom up:
 * the app named in the scene is one that was genuinely on the screen, and
 * picking deterministically is what lets a replay land on the same scene.
 */
export function caughtBy(openSlackApps: readonly string[]): string | null {
  return openSlackApps[0] ?? null;
}

/** Whether the desk itself is evidence, whatever is on the screen. */
export function emptiesNoticed(cans: number): boolean {
  return Number.isSafeInteger(cans) && cans > EMPTIES_TOLERATED;
}

/**
 * A last invariant the day owes the tutorial: nothing about a patrol may
 * happen inside the lunch window. Asserted rather than assumed, because the
 * jitter is what decides where a round lands and a bad seed is a silent
 * regression - it would simply catch somebody at lunch one day in twenty.
 */
export function patrolsClearOfLunch(
  schedule: Readonly<PatrolSchedule>,
): boolean {
  return schedule.visits.every(
    (visit) => !isLunchtime(visit.telegraphTick)
      && !isLunchtime(visit.arrivalTick)
      && !isLunchtime(visit.departureTick),
  ) && schedule.pings.every((ping) => !isLunchtime(ping.tick));
}
