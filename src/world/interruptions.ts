/**
 * The interruption, as data.
 *
 * The research base (`docs/research/day-to-day-frustrations.md`) converges on
 * one engine-side idea: the thing that ruins a support day is not the work, it
 * is being taken off the work. A call, a summons, somebody at your shoulder -
 * each of them owns the screen for a while, and the queue does not stop for
 * any of them.
 *
 * The schedule is stateless, exactly like the lead's rounds (`boss.ts:208`):
 * `buildInterruptionSchedule` is a pure function of the seed, the day and the
 * day's authored plan, so a save restored mid-day recomputes the same
 * schedule, a save taken mid-meeting restores mid-meeting, and no engine-side
 * scheduler state has to be saved at all. What the player DID about an
 * interruption is a different question and lives in the world graph, written
 * by the three verbs in `actions/interruptions.ts`.
 *
 * Precedence is explicit rather than emergent. The screen holds one takeover
 * at a time, so an entry whose minutes are already spoken for - by the lead
 * being at your desk, by lunch, by another interruption - SLIDES to the next
 * minute that is clear, and one that cannot fit before the shift runs out is
 * dropped rather than squeezed into a moment nobody could read.
 *
 * Nothing here touches the DOM, dispatches, or reads the time of day.
 */

import { seededOffset } from './day';
import {
  isLunchtime,
  lunchWindow,
  requireDay,
  shiftWindow,
  tickAtMinute,
  type TickWindow,
} from './hours';

/* -- the vocabulary ------------------------------------------------------- */

/**
 * Where an interruption comes FROM, which is the one thing about it that
 * decides what refusing it costs. Declining a colleague reads nothing like
 * declining the lead, and the grammar is the same either way.
 */
export const INTERRUPTION_SOURCES = [
  'call',
  'meeting',
  'walk_up',
  'boss',
  'chat',
] as const;

export type InterruptionSource = (typeof INTERRUPTION_SOURCES)[number];

export function isInterruptionSource(
  value: unknown,
): value is InterruptionSource {
  return typeof value === 'string'
    && INTERRUPTION_SOURCES.some((source) => source === value);
}

/**
 * How much of the day this one is allowed to take, 1 to 3.
 *
 * The same shape as `impact` and `urgency` on a ticket, and for the same
 * reason: a graded whole number is a thing content can be written against and
 * a balance table can read, where a free-text adjective is a thing every
 * surface has its own opinion about. What it MEANS is deliberately not decided
 * here - the cost model reads the relation to the work, not the number.
 */
export const INTERRUPTION_SEVERITIES = [1, 2, 3] as const;

export type InterruptionSeverity = (typeof INTERRUPTION_SEVERITIES)[number];

export function isInterruptionSeverity(
  value: unknown,
): value is InterruptionSeverity {
  return INTERRUPTION_SEVERITIES.some((severity) => severity === value);
}

/**
 * The authored half: caller, subject, dialogue tree, whatever the content
 * wants. The schedule carries it and never reads it - the engine feature is
 * the cost model and the choice grammar, and the words are content rows.
 */
export type InterruptionFlavor = Readonly<Record<string, string>>;

/* -- the tunables --------------------------------------------------------- */

/**
 * Nobody rings at five past nine and nobody rings at two minutes to five. The
 * first is the half hour the morning queue is for; the second is an
 * interruption the player has no shift left to recover from, which is a cheat
 * rather than a difficulty.
 */
export const INTERRUPTION_OPENS_AFTER = 30;
export const INTERRUPTION_CLOSES_BEFORE = 45;

/**
 * How long "I will call you back" buys, in simulated minutes.
 *
 * One fixed number rather than a per-source table, because the mechanic is
 * that deferring does not make it go away: it comes back, it comes back at a
 * minute you did not choose, and the second time it is not declinable. Twenty
 * minutes is long enough to finish what is in front of you and short enough
 * that it is still the same morning.
 */
export const DEFER_MINUTES = 20;

/**
 * The shortest an interruption may be. A takeover the player cannot read is a
 * flicker, and a flicker is a bug wearing a mechanic's coat.
 */
export const MIN_INTERRUPTION_MINUTES = 1;

/* -- what content writes -------------------------------------------------- */

/**
 * One authored interruption: what it is, when it nominally happens, and how
 * far it is allowed to wander from that minute.
 *
 * `jitter` is 0 by default and that is the important default. A meeting is
 * ANNOUNCED - it is on the morning brief and a summons mail names the hour -
 * so a meeting that wandered by twelve minutes would make the brief a lie. A
 * call can be given some wander on purpose; nothing gets it by accident.
 */
export interface InterruptionSlot {
  /** Stable across the whole week: the world graph records what was done to
   * it by this id, and two entries sharing one would share a record. */
  readonly id: string;
  readonly source: InterruptionSource;
  /** Minute of the day, on the clock the player reads. */
  readonly minute: number;
  /** How long it owns the screen once it starts. */
  readonly minutes: number;
  /** The ticket it is about, or nothing at all - which is the cost model. */
  readonly relatedTicket: string | null;
  readonly declinable: boolean;
  /** Whether saying yes consumes the player's minutes while it runs. */
  readonly synchronous: boolean;
  readonly severity: InterruptionSeverity;
  readonly flavor: InterruptionFlavor;
  /** Minutes either side of `minute` the seed may move it. Announced things
   * take none. */
  readonly jitter?: number;
}

/** One interruption, placed. */
export interface InterruptionEntry {
  readonly id: string;
  readonly source: InterruptionSource;
  /** The minute it starts. */
  readonly tick: number;
  /** And the minute the screen is the player's again. */
  readonly endsTick: number;
  readonly relatedTicket: string | null;
  readonly declinable: boolean;
  readonly synchronous: boolean;
  readonly severity: InterruptionSeverity;
  readonly flavor: InterruptionFlavor;
  /** How far it had to slide off its authored minute to find clear air. */
  readonly slidFrom: number | null;
}

/**
 * What the day hands the builder: the authored slots, and the minutes the
 * screen is ALREADY spoken for.
 *
 * The blocked windows are the day's other takeovers - the lead's rounds and
 * the conversation being caught costs - handed in rather than computed here,
 * because this module has no business knowing how a patrol is shaped and a
 * test has every business constructing a collision by hand.
 */
export interface InterruptionPlan {
  readonly slots: readonly InterruptionSlot[];
  readonly blocked: readonly TickWindow[];
}

/**
 * A day with nothing on it, which is every day of the shipped probation week
 * until content is authored against these rails.
 *
 * It is the default so that `buildInterruptionSchedule(seed, day)` answers the
 * determinism question - the schedule is `f(seed, day)` - without a caller
 * having to invent a plan to ask it.
 */
export const EMPTY_INTERRUPTION_PLAN: InterruptionPlan = Object.freeze({
  slots: Object.freeze([]),
  blocked: Object.freeze([]),
});

export interface InterruptionSchedule {
  readonly day: number;
  readonly shift: TickWindow;
  /** Everything that found a minute, earliest first. */
  readonly entries: readonly InterruptionEntry[];
  /** And the ids of everything that could not, because the day ran out. */
  readonly dropped: readonly string[];
}

/* -- precedence ----------------------------------------------------------- */

/** Half-open, like every other window in this world: `to` is already clear. */
export function windowsOverlap(
  left: Readonly<TickWindow>,
  right: Readonly<TickWindow>,
): boolean {
  return left.from < right.to && right.from < left.to;
}

export function entryWindow(
  entry: Readonly<InterruptionEntry>,
): TickWindow {
  return { from: entry.tick, to: entry.endsTick };
}

/**
 * The slide, said once and used everywhere.
 *
 * An entry wants `minutes` of clear screen from `from` onwards. Anything
 * already booked pushes it to the far side of that booking, and it keeps
 * looking until it finds air or runs out of day. Answering null is the honest
 * outcome for the second one: an interruption that arrives at 16:58 is an
 * interruption nobody can do anything about, and dropping it is what the
 * patrol already does with a round that would not fit.
 *
 * `blocked` is sorted here rather than being trusted to arrive sorted, because
 * the loop's bound is "one hop per booking" and that is only true if each hop
 * moves forward past bookings it can never meet again.
 */
export function slideToClearTick(
  from: number,
  minutes: number,
  blocked: readonly TickWindow[],
  latestStart: number,
): number | null {
  if (!Number.isSafeInteger(minutes) || minutes < MIN_INTERRUPTION_MINUTES) {
    throw new TypeError(
      'An interruption owns the screen for a whole number of minutes, at '
      + `least ${String(MIN_INTERRUPTION_MINUTES)} of them.`,
    );
  }

  const bookings = [...blocked].sort((left, right) => left.from - right.from);
  let tick = from;

  // One hop per booking at the very most, plus the check that finds air.
  for (let hop = 0; hop <= bookings.length; hop += 1) {
    const clash = bookings.find(
      (booking) => windowsOverlap({ from: tick, to: tick + minutes }, booking),
    );

    if (clash === undefined) {
      return tick <= latestStart ? tick : null;
    }

    tick = clash.to;
  }

  return null;
}

/* -- the schedule --------------------------------------------------------- */

function requireSlot(slot: Readonly<InterruptionSlot>, day: number): void {
  const where = `Day ${String(day)}'s interruption "${slot.id}"`;

  if (slot.id.trim().length === 0) {
    throw new Error(`Day ${String(day)} carries an interruption with no id.`);
  }

  if (!isInterruptionSource(slot.source)) {
    throw new Error(`${where} comes from nowhere this world has a name for.`);
  }

  if (!isInterruptionSeverity(slot.severity)) {
    throw new Error(`${where} has no severity on it.`);
  }

  if (!Number.isSafeInteger(slot.minute) || slot.minute < 0) {
    throw new Error(`${where} happens at a minute that is not one.`);
  }

  if (
    !Number.isSafeInteger(slot.minutes)
    || slot.minutes < MIN_INTERRUPTION_MINUTES
  ) {
    throw new Error(
      `${where} takes ${String(slot.minutes)} minutes, and a takeover nobody `
      + 'can read is not a takeover.',
    );
  }

  const jitter = slot.jitter ?? 0;

  if (!Number.isSafeInteger(jitter) || jitter < 0) {
    throw new Error(`${where} wanders by something that is not minutes.`);
  }
}

/**
 * The minutes of a day an interruption may start in, both ends inclusive.
 *
 * The window is where it may BEGIN; the shift end is what it has to finish
 * inside, and `buildInterruptionSchedule` holds it to both.
 */
export function interruptionWindow(day: number): TickWindow {
  const shift = shiftWindow(day);
  const from = shift.from + INTERRUPTION_OPENS_AFTER;

  return { from, to: Math.max(from, shift.to - INTERRUPTION_CLOSES_BEFORE) };
}

/**
 * The day's interruptions, placed.
 *
 * Slots are placed earliest-authored-minute first and every placed entry
 * becomes a booking the next one has to get out of the way of - which is what
 * makes "one takeover at a time" a property of the schedule rather than a
 * thing the shell has to remember at runtime. Lunch is a booking too: the half
 * hour nobody is looking for you is the window the whole slack mechanic is
 * taught in, and a call at ten past twelve would make that tutorial a lie.
 *
 * The same seed and the same day give the same schedule, byte for byte,
 * however many times it is asked and whichever side of a save it is asked on.
 */
export function buildInterruptionSchedule(
  seed: number,
  day: number,
  plan: Readonly<InterruptionPlan> = EMPTY_INTERRUPTION_PLAN,
): InterruptionSchedule {
  requireDay(day);
  const shift = shiftWindow(day);
  const window = interruptionWindow(day);
  const lunch = lunchWindow(day);

  const seen = new Set<string>();

  for (const slot of plan.slots) {
    requireSlot(slot, day);

    if (seen.has(slot.id)) {
      throw new Error(
        `Day ${String(day)} schedules "${slot.id}" twice. Two interruptions `
        + 'sharing an id share the record of what was done about them.',
      );
    }

    seen.add(slot.id);
  }

  // Authored order is not placement order: the earliest minute goes first, and
  // ties are broken by id so two slots on the same minute always land the same
  // way round.
  const wanted = plan.slots
    .map((slot) => ({
      slot,
      at: tickAtMinute(day, slot.minute)
        + seededOffset(seed, day, `interruption:${slot.id}`, slot.jitter ?? 0),
    }))
    .sort((left, right) => (
      left.at === right.at
        ? left.slot.id.localeCompare(right.slot.id)
        : left.at - right.at
    ));

  const bookings: TickWindow[] = [{ ...lunch }, ...plan.blocked.map(
    (booking) => ({ ...booking }),
  )];
  const entries: InterruptionEntry[] = [];
  const dropped: string[] = [];

  for (const { slot, at } of wanted) {
    const wants = Math.max(window.from, at);
    const tick = slideToClearTick(
      wants,
      slot.minutes,
      bookings,
      Math.min(window.to, shift.to - slot.minutes),
    );

    if (tick === null) {
      dropped.push(slot.id);
      continue;
    }

    const entry: InterruptionEntry = {
      id: slot.id,
      source: slot.source,
      tick,
      endsTick: tick + slot.minutes,
      relatedTicket: slot.relatedTicket,
      declinable: slot.declinable,
      synchronous: slot.synchronous,
      severity: slot.severity,
      flavor: Object.freeze({ ...slot.flavor }),
      slidFrom: tick === at ? null : at,
    };

    entries.push(entry);
    bookings.push(entryWindow(entry));
  }

  entries.sort((left, right) => left.tick - right.tick);

  const schedule: InterruptionSchedule = {
    day,
    shift,
    entries: Object.freeze(entries),
    dropped: Object.freeze(dropped),
  };

  // The builder checks its own work, exactly as the patrol does, and for the
  // same reason: a bad seed would not look like a bug. It would look like two
  // takeovers on one screen once a fortnight, which is precisely the sort of
  // thing nobody reports.
  const broken = interruptionsClearOf(schedule, plan.blocked);

  if (broken !== null) {
    throw new Error(
      `The interruption schedule for day ${String(day)} ${broken}`,
    );
  }

  return schedule;
}

/* -- reading the schedule ------------------------------------------------- */

/** The interruption whose minutes cover this one, if any. */
export function interruptionAt(
  schedule: Readonly<InterruptionSchedule>,
  tick: number,
): InterruptionEntry | null {
  return schedule.entries.find(
    (entry) => tick >= entry.tick && tick < entry.endsTick,
  ) ?? null;
}

/** Everything that STARTS in `(after, upTo]` - what a clock step decides. */
export function interruptionsArrivingBetween(
  schedule: Readonly<InterruptionSchedule>,
  after: number,
  upTo: number,
): readonly InterruptionEntry[] {
  return schedule.entries.filter(
    (entry) => entry.tick > after && entry.tick <= upTo,
  );
}

/**
 * The same interruption, ringing again, `DEFER_MINUTES` later.
 *
 * It is a function of the entry rather than a second schedule, because it is a
 * consequence of something the player did and the schedule is not allowed to
 * know about that. The second arrival is NOT declinable, which is the true
 * version of what happens when you ask somebody to call back: they call back,
 * and this time you are having the conversation.
 */
export function deferredArrival(
  entry: Readonly<InterruptionEntry>,
): InterruptionEntry {
  const tick = entry.tick + DEFER_MINUTES;

  return {
    ...entry,
    tick,
    endsTick: tick + (entry.endsTick - entry.tick),
    declinable: false,
    slidFrom: entry.tick,
  };
}

/**
 * Whether an interruption is about the work in hand.
 *
 * Benign is the reporter of the ticket you are actually touching, ringing
 * about that ticket - it costs no focus, and handling it writes touch evidence
 * on the ticket, because a call CAN be how a ticket moves. Everything else is
 * malignant: a different department, a printer that is not yours, and the
 * twenty-three minutes it takes to find your place again.
 */
export function isBenign(
  entry: Readonly<InterruptionEntry>,
  ticketInHand: string | null,
): boolean {
  return entry.relatedTicket !== null
    && ticketInHand !== null
    && entry.relatedTicket === ticketInHand;
}

/**
 * The invariant the schedule owes the day, as the sentence that completes
 * "the interruption schedule for day N ...". Null when it owes nothing.
 *
 * Three things, and all three are the same thing said about different
 * neighbours: the screen holds ONE takeover at a time. Nothing may run through
 * lunch, nothing may sit on top of a booking the day handed in - the lead's
 * rounds, chiefly, because the boss is in the meeting too - and no two entries
 * may overlap each other.
 */
export function interruptionsClearOf(
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
): string | null {
  for (const entry of schedule.entries) {
    const window = entryWindow(entry);

    for (let tick = entry.tick; tick < entry.endsTick; tick += 1) {
      if (isLunchtime(tick)) {
        return `runs "${entry.id}" through lunch.`;
      }
    }

    if (entry.endsTick > schedule.shift.to) {
      return `runs "${entry.id}" past the end of the shift.`;
    }

    const clash = blocked.find((booking) => windowsOverlap(window, booking));

    if (clash !== undefined) {
      return `puts "${entry.id}" on top of the minutes from `
        + `${String(clash.from)} to ${String(clash.to)}, which were already `
        + 'somebody else\'s.';
    }

    const other = schedule.entries.find(
      (candidate) => candidate.id !== entry.id
        && windowsOverlap(window, entryWindow(candidate)),
    );

    if (other !== undefined) {
      return `puts "${entry.id}" and "${other.id}" on the screen at once.`;
    }
  }

  return null;
}

/* -- what the world records ----------------------------------------------- */

/**
 * What the player did about an interruption, in the three words the world
 * keeps lists of.
 *
 * Deliberately not "outcome" or a single settled flag: which list an id is in
 * IS the record, and the three verbs each append to exactly one of them.
 */
export const INTERRUPTION_CHOICES = ['accept', 'defer', 'decline'] as const;

export type InterruptionChoice = (typeof INTERRUPTION_CHOICES)[number];
