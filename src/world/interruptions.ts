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
import {
  DEFAULT_PRESENCE,
  DND_SLIDE_MINUTES,
  type Presence,
} from './presence';

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
  /**
   * Nobody. The workstation has decided, and there is no person on the other
   * end of it to be reasonable with - which is what makes it the one source
   * whose refusal cannot be a social one.
   */
  'machine',
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

/**
 * The flavor keys the two shipped surfaces read, named once.
 *
 * A bag of strings is the right shape for content - a walk-up wants different
 * words from a call, and neither should have to change this type - but the two
 * windows that exist have to be able to ASK for what they draw, and a window
 * asking for `'caler'` would render an empty caller rather than fail. So the
 * keys are constants, the reader below is the only way in, and `requireSlot`
 * refuses a slot whose source promises a surface it did not bring the words for.
 *
 * `opensFumbling` is the whole of the fumble condition, said as data: a second
 * authored opening line for a player whose hands are already going when they
 * pick the phone up. The meters decide WHICH; the content decides what is
 * said, which is the split every other scene in this world keeps.
 */
export const FLAVOR = {
  /** Person node doing the ringing. */
  caller: 'caller',
  /** One line of what it is about, on the ringing window and in the mail. */
  subject: 'subject',
  /** The dialogue node the conversation opens on when it is answered. */
  opens: 'opens',
  /** And the one it opens on instead, for somebody who is already shaking. */
  opensFumbling: 'opens_fumbling',
  /** The meeting scene this block is, from `world/scenes/meeting.ts`. */
  scene: 'scene',
} as const;

/** One authored string off an interruption, or null when it carries none. */
export function flavorText(
  entry: { readonly flavor: InterruptionFlavor },
  key: string,
): string | null {
  const value = entry.flavor[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

/**
 * The words a source cannot be drawn without.
 *
 * A call with no caller is a ringing phone with nobody on it; a meeting with
 * no scene is half an hour of blank window. Both are content bugs that look
 * like a quiet day, which is the class this module's loader exists for.
 */
const REQUIRED_FLAVOR: Readonly<Partial<Record<InterruptionSource, readonly string[]>>> = {
  call: [FLAVOR.caller, FLAVOR.subject, FLAVOR.opens],
  meeting: [FLAVOR.scene, FLAVOR.subject],
  // A machine has no caller and no room, and what it wants is the whole of
  // what it says: one line naming the thing it is about to do to your morning.
  machine: [FLAVOR.subject],
};

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

/**
 * How many times this one may be pushed, and how far each push buys.
 *
 * A list rather than a number, because the mechanic is that the windows
 * SHRINK: `[10, 5, 2]` is a machine that will let you finish what is in front
 * of you, then let you finish a sentence, then let you save. Each spend
 * re-queues the entry that many minutes past wherever it now stands, and the
 * arrival after the last one offers nothing at all.
 *
 * The default is 0.3.0's rule said as data rather than as code: one push of
 * twenty minutes for anything the player may wave off, and none for anything
 * they may not. Content that says nothing gets exactly the behaviour it had
 * before the budget existed, which is what makes the generalization invisible
 * at budget one.
 */
export function postponeBudget(
  slot: Readonly<Pick<InterruptionSlot, 'declinable' | 'postpones'>>,
): readonly number[] {
  if (slot.postpones !== undefined) {
    return slot.postpones;
  }

  return slot.declinable ? [DEFER_MINUTES] : [];
}

/**
 * The minutes the next push buys, counting from the arrival it is spent at.
 *
 * A spend past the end of the list is not this module's to refuse - the world
 * refuses it, with a sentence, because refusing is a rule about what the
 * player may do - so this answers the last window rather than throwing. It is
 * only ever reached by a caller that has already been told no.
 */
export function postponeWindow(
  entry: Readonly<InterruptionEntry>,
  spend: number,
): number {
  return entry.postpones[spend]
    ?? entry.postpones[entry.postpones.length - 1]
    ?? DEFER_MINUTES;
}

/**
 * Whether declining this one is a thing that was WITHDRAWN rather than a thing
 * that was never offered.
 *
 * Both refuse, and the two refusals are different sentences because they teach
 * different rules: a junior does not skip the sync (a hierarchy), and the
 * updates have been declined for four months (an arithmetic that ran out). The
 * source decides, here, once - so no surface has to know the register and no
 * content row can get it wrong.
 */
export function declineWithdrawn(
  entry: Readonly<Pick<InterruptionEntry, 'source'>>,
): boolean {
  return entry.source === 'machine';
}

/**
 * Whether a red dot is allowed to make this one go away for a while.
 *
 * Two exemptions, and both are by construction rather than by policy. A
 * MEETING is a room with a time on it and people already in it; a MACHINE has
 * decided and there is nobody on the other end of it to read anything. Neither
 * is somebody a status can be shown to, so the Wednesday sync and the Thursday
 * reboot stay undodgeable however the tray is set.
 *
 * The third condition is the declinable flag, and it is not a shortcut for the
 * two above it: it is the same question decline asks. Anything a person could
 * have been told no to is a thing that same person can decide not to ring, and
 * the loader already refuses a machine that claims to be declinable - so the
 * two sets are the same set, and saying all three out loud is what keeps that
 * true when a fourth source is authored.
 *
 * A CALLBACK is deliberately not dodgeable: `deferredArrival` marks it
 * undeclinable, which is 0.3.0's rule said in one place - you asked them to
 * call back, this is them calling back, and the second time is the
 * conversation whatever your dot says.
 */
export function dodgesUnderDnd(
  entry: Readonly<Pick<InterruptionEntry, 'source' | 'declinable'>>,
  presence: Presence,
): boolean {
  return presence === 'dnd'
    && entry.declinable
    && entry.source !== 'meeting'
    && entry.source !== 'machine';
}

/**
 * What being taken off the work costs the moment it happens, per point of
 * severity.
 *
 * Two, so the shipped week charges nothing for a call about the ticket in
 * hand, four for a printer in a building that is not yours, and six for half
 * an hour nobody chose to be in. It is deliberately small - OVERSEER TUNING
 * KNOB - because this is the price of being REACHABLE, which is paid whatever
 * the player then decides; the price of handling one is the refocus window,
 * and that is where the mechanic actually lives.
 */
export const ARRIVAL_STRESS_PER_SEVERITY = 2;

/**
 * The stress an arrival costs, which is nothing at all when it is about the
 * work already in hand.
 *
 * A call from the person whose ticket is on your screen is not an
 * interruption in the sense that matters: it is the job, arriving by phone.
 * Charging for it would be charging the player for having somebody ring them
 * about the thing they were already doing, which is the one shape of this
 * mechanic that would be a punishment rather than a cost.
 */
export function arrivalStress(
  entry: Readonly<InterruptionEntry>,
  benign: boolean,
): number {
  return benign ? 0 : entry.severity * ARRIVAL_STRESS_PER_SEVERITY;
}

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
  /**
   * How long it owns the screen once it starts - which is the same number
   * whether it is answered or rings out, because it is the minutes the thing
   * TAKES rather than the minutes a conversation lasts.
   *
   * PARKING LOT, and it is a real one: at x4 a six-minute window is a second
   * and a half of real time, which is not long enough for three buttons to be
   * a choice. The fix is not a longer window - that would be balance bent
   * around a frame rate - it is dropping the clock to x1 when a synchronous
   * takeover arrives, so the player gets the whole window in seconds they can
   * use. It changes what one run of the clock buys mid-stretch, so it is its
   * own slice with its own walk.
   */
  readonly minutes: number;
  /** The ticket it is about, or nothing at all - which is the cost model. */
  readonly relatedTicket: string | null;
  readonly declinable: boolean;
  readonly severity: InterruptionSeverity;
  readonly flavor: InterruptionFlavor;
  /** Minutes either side of `minute` the seed may move it. Announced things
   * take none. */
  readonly jitter?: number;
  /**
   * The shrinking windows a player may push this one out by, in order. Absent
   * is 0.3.0's rule: one push of twenty minutes if it can be waved off, and
   * nothing if it cannot. See `postponeBudget`.
   */
  readonly postpones?: readonly number[];
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
  readonly severity: InterruptionSeverity;
  readonly flavor: InterruptionFlavor;
  /** How far it had to slide off its authored minute to find clear air. */
  readonly slidFrom: number | null;
  /**
   * The windows this one may still be pushed by, resolved from the slot at
   * build time so no reader has to know the default. Empty is "this is
   * happening now".
   */
  readonly postpones: readonly number[];
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

/**
 * Two ids, ordered by codepoint.
 *
 * `localeCompare` was here and was wrong for the one job this comparator has:
 * it is a tie-break inside a SEEDED schedule, so its answer is part of what
 * "the same seed gives the same week" means - and `localeCompare` answers
 * according to the reader's locale and the browser's collation tables. Two
 * players on one seed would get two different weeks, in the one place nobody
 * would ever look. Codepoint order is the same everywhere, and it is the
 * ordering discipline the Rust side already keeps.
 */
export function byCodepoint(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
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

/**
 * The latest minute an entry can still be running, if everything about it goes
 * the slowest way the day allows.
 *
 * Jitter to the far side, every postpone spent, and then the minutes the thing
 * itself takes. Slides are not in it and cannot be - what a day's other
 * bookings do to this one is a property of the day rather than of the row -
 * but a slide only ever moves it LATER, and an entry with nowhere later to go
 * is dropped by the builder rather than squeezed. So this is the floor under
 * "does it fit", and the loader holds the entries nobody may wave off to it.
 */
export function worstCaseEndTick(
  slot: Readonly<InterruptionSlot>,
  day: number,
  blocked: readonly TickWindow[] = [],
): number {
  const from = Math.max(
    interruptionWindow(day).from,
    tickAtMinute(day, slot.minute) + (slot.jitter ?? 0),
  );
  const budget = postponeBudget(slot);
  // Every window spent, and spent as LATE as the dialog allows. A push buys
  // its minutes from the press, so a player who lets each arrival run to its
  // last readable minute before pushing adds that arrival's whole length to
  // the day - and that is a day the player can actually produce, which makes
  // it the day the loader has to hold.
  const pushed = budget.reduce(
    (total, window) => total + window + slot.minutes - 1,
    0,
  );
  // And the slide, which is the day's other bookings getting in the way of
  // every landing. A callback that lands on the lead's rounds is pushed to the
  // far side of them, and an entry nobody may wave off is never dropped for it
  // - so those minutes are part of what the day has to be able to hold.
  //
  // Every booking that could be in the way, counted whole: that is the most a
  // slide can cost. It is grown to a fixpoint because a booking pushed into by
  // an earlier slide brings the ones after it into range - three passes on any
  // day this game has, bounded by the number of bookings either way.
  const bookings = [{ ...lunchWindow(day) }, ...blocked];
  let end = from + pushed + slot.minutes;

  for (let pass = 0; pass <= bookings.length; pass += 1) {
    const shoved = bookings
      .filter((booking) => booking.to > from && booking.from < end)
      .reduce((total, booking) => total + (booking.to - booking.from), 0);
    const grown = from + pushed + shoved + slot.minutes;

    if (grown === end) {
      break;
    }

    end = grown;
  }

  return end;
}

function requireSlot(
  slot: Readonly<InterruptionSlot>,
  day: number,
  shift: Readonly<TickWindow>,
  blocked: readonly TickWindow[],
): void {
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

  for (const window of slot.postpones ?? []) {
    if (!Number.isSafeInteger(window) || window < MIN_INTERRUPTION_MINUTES) {
      throw new Error(
        `${where} may be pushed by ${String(window)} minutes, and a postpone `
        + 'that buys no time is a button that lies about what it did.',
      );
    }
  }

  // A machine is not a person, and the whole of what makes it different is
  // that there is nobody to say no to. Content that marked one declinable
  // would be offering a button the world is going to refuse every time, which
  // is the shape of a lie the player has to press twice to find.
  if (slot.source === 'machine' && slot.declinable) {
    throw new Error(
      `${where} is a machine and is marked declinable. There is nobody on the `
      + 'other end of it to be reasonable with.',
    );
  }

  // The one nobody can wave off has to FIT, worst case and all - because the
  // worst case is what the player is entitled to choose, and an entry that
  // ran out of day would either be dropped without a word or hand the desk
  // back after everybody had gone home. Quiet wrongness is the enemy; a day
  // that cannot hold what it schedules says so at load.
  //
  // The bookings are handed in because they are part of the worst case: a
  // callback that lands on the lead's rounds slides past them, and an entry
  // nobody may wave off is never dropped for it - it takes the minutes on the
  // far side. Those minutes have to be inside the shift, and this is where
  // that is guaranteed rather than hoped for.
  if (!slot.declinable && worstCaseEndTick(slot, day, blocked) > shift.to) {
    throw new Error(
      `${where} cannot be waved off and, with every postpone spent as late as `
      + 'it can be and every booking of the day in the way, is still running '
      + `at ${String(worstCaseEndTick(slot, day, blocked))} - which is past `
      + `the end of the shift at ${String(shift.to)}. Author the windows so `
      + 'the worst case lands inside the day, because the worst case is the '
      + 'player\'s to choose.',
    );
  }

  for (const key of REQUIRED_FLAVOR[slot.source] ?? []) {
    if (flavorText(slot, key) === null) {
      throw new Error(
        `${where} is a ${slot.source} and carries no "${key}". A surface `
        + 'drawn from words nobody wrote is a blank window with a clock '
        + 'running behind it.',
      );
    }
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
    requireSlot(slot, day, shift, plan.blocked);

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
        ? byCodepoint(left.slot.id, right.slot.id)
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
      severity: slot.severity,
      flavor: Object.freeze({ ...slot.flavor }),
      slidFrom: tick === at ? null : at,
      postpones: Object.freeze([...postponeBudget(slot)]),
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
 * The same interruption, ringing again, one spend of the budget later.
 *
 * It is a function of the entry rather than a second schedule, because it is a
 * consequence of something the player did and the schedule is not allowed to
 * know about that. The arrival is NOT declinable, which is the true version of
 * what happens when you ask somebody to call back: they call back, and this
 * time you are having the conversation.
 *
 * `spend` is which push of the budget this is - the zeroth is the first one -
 * so the windows shrink in the order they were authored.
 *
 * `spentAt` is the minute the button was actually pressed, and the window is
 * measured FROM IT rather than from the arrival. That is a fix rather than a
 * detail: measured from the arrival, a player who read the dialog for eleven
 * minutes and then pushed a ten-minute window bought nothing at all - the
 * budget went down, the desk did not come back, and the callback landed in a
 * minute that had already gone. A postpone buys its stated minutes from the
 * press, every time, or it is not a postpone.
 *
 * At a budget of one twenty-minute window pressed the moment the phone rings -
 * which is 0.3.0's call, and what every walk and every e2e does - the answer
 * is the arrival plus twenty, exactly as it was.
 */
export function deferredArrival(
  entry: Readonly<InterruptionEntry>,
  spend: number,
  spentAt: number,
): InterruptionEntry {
  const tick = spentAt + postponeWindow(entry, spend);

  return {
    ...entry,
    tick,
    endsTick: tick + (entry.endsTick - entry.tick),
    declinable: false,
    slidFrom: entry.tick,
  };
}

/**
 * What the world has recorded about the day's interruptions: the minute each
 * postpone was pressed, and the ids nobody is going to hear from again.
 *
 * It is the whole input to placement besides the schedule itself, and every
 * bit of it is read back off the player node - so placement is a pure function
 * of things a save carries, and a countdown reloads on the minute it was
 * taken on with the budget it had.
 */
export interface InterruptionLedger {
  /** The minutes each entry's pushes were spent at, oldest first, by id. */
  readonly spentAt: Readonly<Record<string, readonly number[]>>;
  /** Ids that were waved off. They own no minutes from that moment on. */
  readonly declined: readonly string[];
  /**
   * And the minutes a red dot slid each one past, oldest first, by id.
   *
   * Optional because a ledger from before the dot existed carries none, and
   * because that absence is the honest answer rather than a hole: nobody
   * dodged anything, which is what every save written before this slice says
   * and what every player who has never touched the tray produces.
   */
  readonly dodgedAt?: Readonly<Record<string, readonly number[]>>;
}

export const EMPTY_INTERRUPTION_LEDGER: InterruptionLedger = Object.freeze({
  spentAt: Object.freeze({}),
  declined: Object.freeze([]),
  dodgedAt: Object.freeze({}),
});

/**
 * Where an entry WANTS to be, given everything that has moved it.
 *
 * Two things can, and they are not the same thing: a postpone the player
 * pressed (its window comes out of the authored budget) and a slide the dot
 * caused (a fixed window nobody chose). Both buy their minutes from the moment
 * they happened rather than from the arrival, for the same reason - a window
 * measured from an arrival somebody spent eleven minutes reading is a window
 * that bought nothing.
 *
 * The answer is the LATEST of the two rather than the last one written, and
 * that is a guard rather than a subtlety: they interleave, they are counted
 * off two different fields, and an entry that went backwards because one list
 * was read after the other would be a call arriving in a minute that had
 * already gone.
 */
function wantedTick(
  entry: Readonly<InterruptionEntry>,
  spends: readonly number[],
  dodges: readonly number[],
): number {
  const spent = spends[spends.length - 1];
  const dodged = dodges[dodges.length - 1];

  return Math.max(
    spent === undefined
      ? entry.tick
      : deferredArrival(entry, spends.length - 1, spent).tick,
    dodged === undefined ? entry.tick : dodged + DND_SLIDE_MINUTES,
  );
}

/**
 * The day's interruptions as they now stand: every entry nobody has settled,
 * at the minute it is actually going to happen.
 *
 * This is the runtime half of "one takeover at a time", and it has to be one
 * function over the whole day rather than a question asked per entry. Asked
 * per entry it gets the answer wrong in a way nothing would notice until it
 * crashed a clock: a call deferred at 10:00 by twenty minutes and another
 * deferred at 10:10 by ten both want 10:20, and two placements that each
 * looked at the OTHER'S ORIGINAL window would both take it. So the pushed
 * entries are placed in the order they want to arrive, and each one becomes a
 * booking the next has to get out of the way of - exactly the discipline
 * `buildInterruptionSchedule` uses for the authored ones.
 *
 * A declinable entry with nowhere left to go is DROPPED, which is the honest
 * outcome: they rang, you asked them to try later, and there was no later.
 * One nobody may wave off is never dropped - it slides forward past whatever
 * is in the way and takes the first clear minutes it can, because an update
 * that vanished because the lead was at your desk is the quiet wrongness the
 * loader's refusal exists to prevent. The loader bounds its worst case
 * (`worstCaseEndTick`) so those minutes are always there; if they somehow are
 * not, this throws rather than losing it, because a mandatory interruption
 * that disappeared would look exactly like a quiet afternoon.
 */
export function placeInterruptions(
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
  ledger: Readonly<InterruptionLedger> = EMPTY_INTERRUPTION_LEDGER,
): readonly InterruptionEntry[] {
  const live = schedule.entries.filter(
    (entry) => !ledger.declined.includes(entry.id),
  );
  // An entry nobody has pushed is where the schedule put it and cannot move,
  // so it is a BOOKING before anything is placed rather than a thing waiting
  // its turn in the queue below. Booking them as they came up in wanted order
  // was a real hole: a pushed entry placed first could take minutes an
  // authored one still owned, and the only thing that would have noticed is
  // the runtime assert reporting a crashed clock.
  const fixed = live.filter(
    (entry) => (ledger.spentAt[entry.id] ?? []).length === 0
      && (ledger.dodgedAt?.[entry.id] ?? []).length === 0,
  );
  const bookings: TickWindow[] = [
    { ...lunchWindow(schedule.day) },
    ...blocked.map((booking) => ({ ...booking })),
    ...fixed.map(entryWindow),
  ];
  const placed: InterruptionEntry[] = [...fixed];
  // Wanted order, not authored order: a pushed entry is where its last press
  // put it, and ties break by id so two entries wanting one minute always land
  // the same way round.
  const wanted = live
    .filter((entry) => !fixed.includes(entry))
    .map((entry) => ({
      entry,
      at: wantedTick(
        entry,
        ledger.spentAt[entry.id] ?? [],
        ledger.dodgedAt?.[entry.id] ?? [],
      ),
    }))
    .sort((left, right) => (
      left.at === right.at
        ? byCodepoint(left.entry.id, right.entry.id)
        : left.at - right.at
    ));

  for (const { entry, at } of wanted) {
    const minutes = entry.endsTick - entry.tick;
    const spends = ledger.spentAt[entry.id] ?? [];
    const tick = slideToClearTick(
      at,
      minutes,
      bookings,
      schedule.shift.to - minutes,
    );

    if (tick === null) {
      // The authored flag rather than the callback's: `deferredArrival` marks
      // every callback undeclinable, and what decides whether an entry may be
      // LOST is whether anybody could ever have waved it off.
      if (!entry.declinable) {
        throw new Error(
          `"${entry.id}" cannot be waved off and has nowhere left in day `
          + `${String(schedule.day)} to happen. The loader bounds the worst `
          + 'case of everything mandatory, so this is a day that was built '
          + 'wrong rather than a day that ran out.',
        );
      }

      continue;
    }

    // A pushed entry is a CALLBACK - undeclinable, because this is them
    // ringing back - and one the dot merely slid past is not. Nobody asked
    // anybody for anything: the phone did not ring, so the three answers are
    // all still on the table whenever it does. Running a slide through
    // `deferredArrival` would have quietly taken decline away from a call the
    // player has never even been offered.
    const pushed = spends.length === 0
      ? { ...entry, slidFrom: entry.tick }
      : deferredArrival(
        entry,
        spends.length - 1,
        spends[spends.length - 1] ?? entry.tick,
      );
    const settled: InterruptionEntry = {
      ...pushed,
      tick,
      endsTick: tick + minutes,
    };

    placed.push(settled);
    bookings.push(entryWindow(settled));
  }

  return placed.sort((left, right) => left.tick - right.tick);
}

/**
 * One entry, placed, for a caller that only cares about that one.
 *
 * It goes through `placeInterruptions` rather than doing its own arithmetic,
 * because two placement functions are two answers waiting to disagree about
 * which minute a callback lands on - and the disagreement would be invisible
 * until two of them shared a screen.
 */
export function placeDeferred(
  entry: Readonly<InterruptionEntry>,
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
  spentAt: readonly number[],
  dodgedAt: readonly number[] = [],
): InterruptionEntry | null {
  return placeInterruptions(schedule, blocked, {
    spentAt: { [entry.id]: spentAt },
    declined: [],
    dodgedAt: { [entry.id]: dodgedAt },
  }).find((candidate) => candidate.id === entry.id) ?? null;
}

/**
 * The latest minute each push of a budget could possibly be pressed, and where
 * that leaves the entry.
 *
 * The last minute an arrival is on the screen is the last minute the button on
 * it can be pressed, and a window bought there buys its whole length from
 * there - so the worst case is not "every window spent" but "every window
 * spent as late as the dialog allows". It is what the solvability gate has to
 * walk against, because it is a day the player can actually produce.
 */
export function latestSpends(
  entry: Readonly<InterruptionEntry>,
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
  /**
   * The slides that already happened before the first push, if the day being
   * modelled is one where a dot moved it first. Empty is the ordinary case.
   */
  dodgedAt: readonly number[] = [],
): readonly number[] {
  const minutes = entry.endsTick - entry.tick;
  const spends: number[] = [];
  const dodged = dodgedAt.length === 0
    ? entry
    : placeDeferred(entry, schedule, blocked, [], dodgedAt);

  if (dodged === null) {
    return spends;
  }

  let arrival = dodged.tick;

  for (let spend = 0; spend < entry.postpones.length; spend += 1) {
    // The last minute it is still on the screen: `endsTick` is exclusive, so
    // an arrival at 14:10 lasting twelve minutes can be pushed at 14:21.
    const pressed = arrival + minutes - 1;
    spends.push(pressed);

    const placed = placeDeferred(entry, schedule, blocked, spends, dodgedAt);

    if (placed === null) {
      spends.pop();
      break;
    }

    arrival = placed.tick;
  }

  return spends;
}

/**
 * Every minute of the day a dodgeable interruption could END UP owning, if the
 * dot is red at every arrival it makes.
 *
 * It is a UNION rather than a single worst case, and that is the whole
 * argument for it. A postpone is a choice made once at an arrival, so the
 * worst version of it can be walked; a slide is a thing that happens whenever
 * the status happens to be red, so the player can produce a day in which it
 * lands on any link of the chain by simply setting the dot back before that
 * one. Nothing can enumerate which link the boss chose, so the gate is handed
 * ALL of them, booked at once - a day with more in it than any real day can
 * hold, which is what makes clear air found under it clear air that is
 * genuinely there.
 *
 * The chain terminates: every slide moves the entry at least
 * `DND_SLIDE_MINUTES` later, and an entry with nowhere left in the shift is
 * dropped rather than placed. The postpone branch off each landing is in it
 * too, because a player who goes back to Available at the third ring is a
 * player who can then push it.
 */
export function dodgeLandings(
  entry: Readonly<InterruptionEntry>,
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
): readonly TickWindow[] {
  const minutes = entry.endsTick - entry.tick;
  const windows: TickWindow[] = [];
  const dodges: number[] = [];
  let at = entry.tick;

  // One pass per slide the shift could possibly hold, which is the bound the
  // slide window gives: a loop whose only bound is "until it drops" is a loop
  // bounded by an invariant somewhere else.
  const most = Math.ceil(
    (schedule.shift.to - schedule.shift.from) / DND_SLIDE_MINUTES,
  ) + 1;

  for (let slide = 0; slide <= most; slide += 1) {
    windows.push({ from: at, to: at + minutes });

    // And everywhere a push from THIS arrival could take it, which is the day
    // where the player answers the dot's third attempt by asking them to ring
    // back.
    const spends = latestSpends(entry, schedule, blocked, dodges);

    for (let spend = 1; spend <= spends.length; spend += 1) {
      const pushed = placeDeferred(
        entry,
        schedule,
        blocked,
        spends.slice(0, spend),
        dodges,
      );

      if (pushed !== null) {
        windows.push(entryWindow(pushed));
      }
    }

    dodges.push(at);

    const next = placeDeferred(entry, schedule, blocked, [], dodges);

    if (next === null) {
      // It ran out of day. That is the drop, and a dropped interruption owns
      // no minutes at all - which is what the gate should be told.
      break;
    }

    at = next.tick;
  }

  return windows;
}

/**
 * The worst the day can do to the screen: every entry taken at the LATEST
 * minute it can be taken at.
 *
 * Deferring does not save any minutes - it moves them - so the worst case for
 * a ticket with a deadline is the version where every conversation happens as
 * late as it possibly can. That is what the solvability gate walks the
 * advertised paths against, and it is a pure function of the schedule and the
 * day's other bookings so the gate can ask it without building a world.
 *
 * A dropped callback is left OUT rather than replaced by the window it was
 * booked for. The mask that used to sit here (`?? entry`) hid the one thing
 * this function exists to surface: an entry that vanishes rather than moves.
 * The mandatory ones cannot vanish - `placeInterruptions` throws sooner - and
 * a declinable one that genuinely ran out of day owns no minutes at all, which
 * is what the gate should be told.
 */
export function worstCaseWindows(
  schedule: Readonly<InterruptionSchedule>,
  blocked: readonly TickWindow[],
  /**
   * The dot the day is being modelled under. Available is what every day
   * before this slice was, and what every day a player never touches the tray
   * on still is; do not disturb is the one that moves anything, and it moves
   * it by `dodgeLandings`.
   */
  presence: Presence = DEFAULT_PRESENCE,
): readonly TickWindow[] {
  return schedule.entries.flatMap((entry) => {
    if (dodgesUnderDnd(entry, presence)) {
      return dodgeLandings(entry, schedule, blocked);
    }

    // A block with no postpones in it is a block nobody can move - its worst
    // case is the half hour it was booked for, and a model that slid it would
    // be modelling a day that cannot happen.
    if (entry.postpones.length === 0) {
      return [entryWindow(entry)];
    }

    const placed = placeDeferred(
      entry,
      schedule,
      blocked,
      latestSpends(entry, schedule, blocked),
    );

    return placed === null ? [] : [entryWindow(placed)];
  });
}

/**
 * Minutes between `from` and `to` that nobody has already spoken for.
 *
 * Half-open at both ends, like every other window in this world, and counted
 * a minute at a time rather than by subtracting lengths - bookings overlap
 * each other and a subtraction would double-count the overlap, which is
 * exactly the arithmetic error that would make a solvability gate report air
 * that is not there.
 */
export function clearMinutes(
  from: number,
  to: number,
  booked: readonly TickWindow[],
): number {
  let clear = 0;

  for (let tick = from; tick < to; tick += 1) {
    if (isLunchtime(tick)) {
      continue;
    }

    if (!booked.some((window) => tick >= window.from && tick < window.to)) {
      clear += 1;
    }
  }

  return clear;
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
