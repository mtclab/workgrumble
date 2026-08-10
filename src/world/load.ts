/**
 * What a day is actually asking for, in minutes - the arithmetic behind the
 * `load` column (E11, 0.31.0 slice 1).
 *
 * `load: 1..4` has been on every day of every week since the first build, and
 * until now it was a comment with a type on it: the loader checked it was a
 * positive integer, one test checked Monday was lighter than Thursday, and
 * nothing else in the product read it. A budget the generator is supposed to
 * sample against cannot be a field nobody can check, so this module makes it
 * arithmetic and the roster gate refuses a day whose number disagrees with it.
 *
 * THE UNIT IS COMMITTED MINUTES OF THE SHIFT, because that is the unit the
 * feasibility auditor already counts in and the only one that survives content
 * changing shape: a week twice the size scores exactly the same for the same
 * proportion of work done (`weekPerformance`), so ticket COUNT is not
 * difficulty - time pressure is.
 *
 * Every number below is borrowed rather than invented, which is the whole of
 * why the answer is checkable:
 *
 *  - a ticket's first dispatch owns `WORK_SEGMENT_MINUTES` (30), which is what
 *    the timesheet already says a stretch of work owns after the last act in
 *    it - the longest anybody can honestly claim they were still on it;
 *  - every further dispatch its cheapest advertised path needs owns
 *    `CAUGHT_MINUTES` (10), which is what the worst-schedule auditor already
 *    borrowed for "a chunk of the shift somebody lost" and calls the least
 *    clear air a ticket needs before the day has really dealt it;
 *  - an interruption about no ticket in hand costs its own minutes plus
 *    `REFOCUS_TICKS` (23), the figure the whole attention family is built on;
 *  - the lead's rounds are a floor of `PATROLS_PER_DAY * CAUGHT_MINUTES` (30),
 *    which every day pays whether or not anybody is caught;
 *  - and the whole ticket half is multiplied by D&D 5e's encounter group-size
 *    factor, because the same minutes partitioned differently are not the same
 *    day: five small tickets are five triages, five response clocks and five
 *    context switches, and a budget without a count term calls a shredder day
 *    and a deep-work day equivalent.
 *
 * The one place this departs from the spike (docs/research/week-generation.md
 * section 7.1c) is WHERE the count term applies: there it multiplies the whole
 * committed total, here it multiplies the ticket term only. Two reasons, and
 * the second one is decisive. An interruption is already priced with its own
 * context switch (the twenty-three minutes), so multiplying it again by a
 * partition factor charges the same switch twice. And the shipped Thursday -
 * five arrivals and three takeovers, the heaviest day in the game - comes out
 * at 1.39 shifts under the whole-total reading, which is past the ceiling this
 * module refuses at: a formula whose first act is to refuse the day the week is
 * shaped around is a formula that is wrong about the day.
 *
 * Nothing here dispatches, mutates, reads a clock or consumes the RNG.
 */

import { CAUGHT_MINUTES, PATROLS_PER_DAY } from './boss';
import { SHIFT_MINUTES } from './hours';
import { REFOCUS_TICKS } from './meters';
import { WORK_SEGMENT_MINUTES } from './timesheet';
import type { DayScript } from './week';

/**
 * The shape this arithmetic needs of a ticket: an id and its advertised ways
 * of being closed.
 *
 * Structural, like `RosterEntry` next door, so the gate can be called with the
 * real roster and a test can call it with three lines of fixture.
 */
export interface LoadTicket {
  readonly def: { readonly id: string };
  readonly paths: readonly {
    readonly steps: readonly { readonly optional_for_closure?: boolean }[];
  }[];
}

/** How a day's committed minutes are made up, for a table nobody has to trust. */
export interface DayLoad {
  readonly day: number;
  /** The ids the day can put on the desk, in the order they were counted. */
  readonly tickets: readonly string[];
  /** Their expected minutes, before the partition factor. */
  readonly ticketMinutes: number;
  /** The factor the count of them earns. */
  readonly partition: number;
  /** Takeovers, walk-ups, typing indicators and the lead's rounds. */
  readonly otherMinutes: number;
  /** The total: `round(ticketMinutes * partition) + otherMinutes`. */
  readonly committedMinutes: number;
  /** Which band that total falls in, 1 to 4. */
  readonly load: number;
}

/**
 * The top of each load band, as a fraction of the shift.
 *
 * Read as: 1 is a day you can breathe in, 2 is ordinary, 3 is tight and
 * something will slip, 4 is the Thursday - you cannot do all of it, and that is
 * the point of it. Band 1 is open at the bottom because the arithmetic has no
 * floor and does not need one: Bodgeworth's Friday deals nothing at all, which
 * is the whole joke of that shop and a perfectly good load 1.
 *
 * Band 4 is NOT open at the top, and the ceiling is the one refusal in this
 * module that is about a generator rather than about the four hand-written
 * weeks. A day past it is not a hard day, it is a day nobody could have been
 * given - and the sampler that produced it needs to hear so at load time rather
 * than shipping a Thursday that reads as content.
 */
export const LOAD_BAND_TOPS = [0.65, 0.85, 1.05, 1.3] as const;

/** The same, in minutes of the shift: 312, 408, 504, 624. */
export const LOAD_BAND_MINUTES: readonly number[] = Object.freeze(
  LOAD_BAND_TOPS.map((share) => Math.round(share * SHIFT_MINUTES)),
);

/**
 * D&D 5e's encounter multiplier, unchanged: one x1, two x1.5, three to six x2,
 * seven to ten x2.5, eleven to fourteen x3, fifteen or more x4.
 *
 * It is somebody else's table on purpose. The count term has to exist - the
 * external research is unambiguous that a budget without one prices a partition
 * wrong - and the alternative to borrowing a published one is inventing a curve
 * and then tuning it until the shipped weeks come out where somebody wanted
 * them, which is a spreadsheet wearing arithmetic's clothes.
 */
export function partitionFactor(count: number): number {
  if (count <= 1) {
    return 1;
  }

  if (count === 2) {
    return 1.5;
  }

  if (count <= 6) {
    return 2;
  }

  if (count <= 10) {
    return 2.5;
  }

  return count <= 14 ? 3 : 4;
}

/**
 * The cheapest number of dispatches this ticket can honestly be closed in.
 *
 * The cheapest ADVERTISED path, because that is the one a player who knows the
 * job takes, and steps declared `optional_for_closure` are left out for the
 * same reason: the solvability gate proves the ticket closes without them, so
 * a budget that charged for them would be charging for the check rather than
 * for the work. A ticket with no path at all is one dispatch, not nought - it
 * still has to be read, triaged and answered.
 */
export function requiredSteps(entry: Readonly<LoadTicket>): number {
  const lengths = entry.paths.map(
    (path) => path.steps.filter(
      (step) => step.optional_for_closure !== true,
    ).length,
  ).filter((length) => length > 0);

  return lengths.length === 0 ? 1 : Math.min(...lengths);
}

/** What one ticket is expected to cost the day, in minutes. */
export function expectedTicketMinutes(entry: Readonly<LoadTicket>): number {
  return WORK_SEGMENT_MINUTES + (requiredSteps(entry) - 1) * CAUGHT_MINUTES;
}

/** Which band a total falls in, or null if no load could honestly say it. */
export function loadForMinutes(minutes: number): number | null {
  const band = LOAD_BAND_MINUTES.findIndex((top) => minutes <= top);

  return band === -1 ? null : band + 1;
}

/**
 * Everything the day can put on the desk: what it deals, and what it can be
 * made to deal.
 *
 * The second half is the one worth arguing. A direct message, a walk-up and a
 * linked request each carry a ticket they raise if the player sends the person
 * to the form, and both answers are legitimate - so the day's work is either a
 * conversation or a ticket, and the honest budget prices the heavier branch.
 * That is the same worst-case discipline the feasibility auditor already uses
 * when it puts every takeover at the latest minute it could land on. Leave them
 * out and a generated day of six chatty favours reads as an empty Tuesday.
 */
export function dealtOrRaised(script: Readonly<DayScript>): readonly string[] {
  return [
    ...script.inherited,
    ...script.drip.map((slot) => slot.ticketId),
    ...(script.dms ?? []).map((slot) => slot.raises),
    ...(script.walkUps ?? []).map((slot) => slot.raises),
    ...(script.requests ?? []).map((slot) => slot.raises),
  ];
}

/** The minutes the day spends on things that are not tickets. */
function otherMinutes(script: Readonly<DayScript>): number {
  const takeovers = (script.interruptions ?? []).reduce(
    (total, slot) => total + slot.minutes
      + (slot.relatedTicket === null ? REFOCUS_TICKS : 0),
    0,
  );
  const walkUps = (script.walkUps ?? []).reduce(
    // Always the refocus: a walk-up is somebody asking for a favour, which is
    // by construction not the work in hand.
    (total, slot) => total + slot.slot.minutes + REFOCUS_TICKS,
    0,
  );
  const typing = (script.noHello ?? []).reduce(
    (total, slot) => total + slot.typingMinutes,
    0,
  );

  return takeovers + walkUps + typing + PATROLS_PER_DAY * CAUGHT_MINUTES;
}

/**
 * The day, priced. Throws rather than guesses if the week names a ticket the
 * roster does not hold - the same refusal `assertWeekTickets` makes, arriving
 * here first when this gate runs before it.
 */
export function dayLoad(
  script: Readonly<DayScript>,
  lookup: (id: string) => LoadTicket | undefined,
): DayLoad {
  const tickets = dealtOrRaised(script);
  const ticketMinutes = tickets.reduce((total, id) => {
    const entry = lookup(id);

    if (entry === undefined) {
      throw new Error(
        `Day ${String(script.day)} puts "${id}" on the desk, and the roster `
        + 'does not hold it, so there is no honest number of minutes for it.',
      );
    }

    return total + expectedTicketMinutes(entry);
  }, 0);
  const partition = partitionFactor(tickets.length);
  const other = otherMinutes(script);
  const committed = Math.round(ticketMinutes * partition) + other;

  return {
    day: script.day,
    tickets,
    ticketMinutes,
    partition,
    otherMinutes: other,
    committedMinutes: committed,
    load: loadForMinutes(committed) ?? LOAD_BAND_TOPS.length + 1,
  };
}

/** One employer's week, with a name a refusal can use. */
export interface NamedWeek {
  readonly at: string;
  readonly week: readonly DayScript[];
}

/**
 * The `load` column against the arithmetic, checked where the roster is built.
 *
 * The same shape and the same reason as `assertWeekTickets`: a day whose
 * authored difficulty disagrees with what it actually deals is quiet
 * wrongness, and quiet wrongness in this codebase is a boot failure with a
 * sentence attached rather than a number nobody re-reads. The arithmetic wins
 * every disagreement - it is the half that can be checked - so a day that has
 * grown or shrunk is fixed by writing down what it now is.
 *
 * It also holds the ramp: `load` may not go DOWN between Monday and Thursday.
 * Friday is exempt and always was, because Friday is about the conversation at
 * three rather than about the queue.
 */
export function assertWeekLoads<Entry extends LoadTicket>(
  roster: readonly Entry[],
  weeks: readonly NamedWeek[],
): readonly Entry[] {
  const known = new Map(roster.map((entry) => [entry.def.id, entry]));
  const lookup = (id: string): Entry | undefined => known.get(id);

  for (const { at, week } of weeks) {
    let previous = 0;

    for (const script of week) {
      const priced = dayLoad(script, lookup);

      if (loadForMinutes(priced.committedMinutes) === null) {
        throw new Error(
          `${script.label} at ${at} commits ${String(priced.committedMinutes)} `
          + `minutes of a ${String(SHIFT_MINUTES)}-minute shift, and no load `
          + 'says a day that heavy. A day nobody could have been given is not '
          + 'a hard day.',
        );
      }

      if (script.load !== priced.load) {
        throw new Error(
          `${script.label} at ${at} is authored load ${String(script.load)} `
          + `and commits ${String(priced.committedMinutes)} minutes - `
          + `${String(priced.tickets.length)} tickets at `
          + `${String(priced.ticketMinutes)} minutes times `
          + `${String(priced.partition)}, plus ${String(priced.otherMinutes)} `
          + `- which is load ${String(priced.load)}. The arithmetic is the `
          + 'half that can be checked, so the column follows it.',
        );
      }

      if (script.day <= 4 && script.load < previous) {
        throw new Error(
          `${script.label} at ${at} is load ${String(script.load)} where the `
          + `day before it is ${String(previous)}. The ramp is written down `
          + 'and it does not go backwards before Thursday.',
        );
      }

      previous = script.load;
    }
  }

  return roster;
}
