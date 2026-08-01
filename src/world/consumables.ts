/**
 * The desk, as arithmetic.
 *
 * Two things live on it. The energy drink is legal, costs money, and buys a
 * window in which your hands do exactly what you tell them - followed, without
 * exception, by the bill for that window. The beer is visible, locked, and
 * exists this milestone purely so the player can read the tooltip and
 * understand what probation means.
 *
 * Everything here is pure. The state - when the current can was opened, how
 * many are in the run, how many empties are on the desk - lives on the player
 * node in the graph, so it survives a save and replays; this module only says
 * what those numbers MEAN at a given minute.
 */

import {
  fumbleThreshold,
  METER_CEILING,
  METER_FLOOR,
  REFOCUS_FUMBLE_DROP,
} from './meters';

/** What the machine takes for one can. It does not give change. */
export const DRINK_PRICE_PENCE = 120;

/**
 * The buff, in simulated minutes, for the first can of a run. Long enough to
 * be a decision (roughly one bad ticket) and short enough that the crash is
 * still inside the shift you bought it for.
 */
export const BUFF_TICKS = 45;
/** What each additional can inside the window takes off that. */
export const BUFF_TICKS_PER_CAN = 12;
/** The fourth can is still a can. It is just barely a buff. */
export const MIN_BUFF_TICKS = 12;

/** The crash, in simulated minutes, and what stacking adds to it. */
export const CRASH_TICKS = 20;
export const CRASH_TICKS_PER_CAN = 8;

/** What the crash lands on the stress meter, all at once. */
export const CRASH_STRESS = 6;
export const CRASH_STRESS_PER_CAN = 5;

/**
 * How long the body remembers the last can. A can opened inside this window of
 * the previous one is part of the same run, and the run is what tolerance is
 * counted in - which is why a second can at half three is a mistake and a
 * second can at half three tomorrow is not.
 */
export const TOLERANCE_WINDOW_TICKS = 180;

/** Four cans in a run is the point past which the joke stops improving. */
export const MAX_TOLERANCE = 4;

/** Cans the desk has room for before they are stacked in the bin lid. */
export const MAX_CANS = 12;

/**
 * Where the hands go while the crash is on: sooner than usual, because that is
 * what a crash is. The buff end of it is not a lower number but no number at
 * all - see `fumbleLimit`.
 */
export const CRASH_FUMBLE_THRESHOLD = 60;

/**
 * What the graph holds when there is no run and nothing to bill for.
 *
 * A number rather than an absent field: the op language moves fields it can
 * read, and a field that is sometimes missing is a refusal waiting for the
 * first player who never opens a can. -1 is not a minute, so it cannot be
 * mistaken for one.
 */
export const NO_RUN = -1;

export type DrinkPhase = 'none' | 'buff' | 'crash';

/** The desk as the graph holds it. `startedAt` is null when there is no run. */
export interface DrinkState {
  readonly startedAt: number | null;
  /** Cans in the current run, counting from 1. Zero when there is no run. */
  readonly tolerance: number;
}

function requireTick(tick: number): number {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new TypeError('A simulation tick is a non-negative whole number.');
  }

  return tick;
}

function cansInRun(tolerance: number): number {
  return Math.min(
    MAX_TOLERANCE,
    Math.max(1, Number.isSafeInteger(tolerance) ? tolerance : 1),
  );
}

/** How long the wired part lasts. Each extra can in the run buys less. */
export function buffTicks(tolerance: number): number {
  return Math.max(
    MIN_BUFF_TICKS,
    BUFF_TICKS - (cansInRun(tolerance) - 1) * BUFF_TICKS_PER_CAN,
  );
}

/** And how long the bill takes to pay. Each extra can makes it longer. */
export function crashTicks(tolerance: number): number {
  return CRASH_TICKS + (cansInRun(tolerance) - 1) * CRASH_TICKS_PER_CAN;
}

/** What the crash costs, as a lump of stress, the minute it lands. */
export function crashStress(tolerance: number): number {
  return CRASH_STRESS + (cansInRun(tolerance) - 1) * CRASH_STRESS_PER_CAN;
}

export function crashStartsAt(startedAt: number, tolerance: number): number {
  return requireTick(startedAt) + buffTicks(tolerance);
}

export function crashEndsAt(startedAt: number, tolerance: number): number {
  return crashStartsAt(startedAt, tolerance) + crashTicks(tolerance);
}

/** Where a run stands right now: wired, paying for it, or neither. */
/** Reads the two fields off the graph into a run, or into no run at all. */
export function drinkState(
  startedAt: unknown,
  tolerance: unknown,
): DrinkState {
  const started = typeof startedAt === 'number'
    && Number.isSafeInteger(startedAt)
    && startedAt >= 0
    ? startedAt
    : null;
  const cans = typeof tolerance === 'number' && Number.isSafeInteger(tolerance)
    ? tolerance
    : 0;

  return { startedAt: started, tolerance: started === null ? 0 : cans };
}

export function drinkPhase(
  state: Readonly<DrinkState>,
  now: number,
): DrinkPhase {
  requireTick(now);

  if (state.startedAt === null) {
    return 'none';
  }

  const started = requireTick(state.startedAt);

  if (now < started) {
    // A clock that has gone backwards under a run - a load of an older save -
    // is not a run this minute belongs to.
    return 'none';
  }

  if (now < crashStartsAt(started, state.tolerance)) {
    return 'buff';
  }

  return now < crashEndsAt(started, state.tolerance) ? 'crash' : 'none';
}

/**
 * The tolerance the NEXT can would be opened at.
 *
 * Inside the window of the last one it is one higher, up to the cap; outside
 * it, the run has ended and the next can starts a new one. This is the whole
 * stacking model, and it is deliberately a function of the graph and the clock
 * rather than of anything the shell has been remembering.
 */
export function nextTolerance(
  state: Readonly<DrinkState>,
  now: number,
): number {
  requireTick(now);

  if (state.startedAt === null || now < state.startedAt) {
    return 1;
  }

  return now - state.startedAt <= TOLERANCE_WINDOW_TICKS
    ? Math.min(MAX_TOLERANCE, cansInRun(state.tolerance) + 1)
    : 1;
}

/**
 * The stress the hands start going at.
 *
 * While the can is working there is no such number: the limit is above the top
 * of the meter, so no amount of queue makes you fumble. That is the "higher
 * ceiling" the design asks for, said as one number rather than as two rules
 * that could disagree. While the crash is on it is LOWER than usual, which is
 * what makes chaining cans a decision rather than a free action.
 *
 * `refocusing` is the interruption debuff, and it stacks with the crash
 * because they are two different reasons the hands are unreliable and both are
 * true at once. It does NOT touch the buff: a can that has put the ceiling
 * above the top of the meter has put it above every subtraction as well, which
 * is what "no such number" means. Buying your way out of a bad twenty minutes
 * with a can is a legitimate move and it costs what a can always costs.
 */
export function fumbleLimit(phase: DrinkPhase, refocusing = false): number {
  switch (phase) {
    case 'buff':
      return METER_CEILING + 1;
    case 'crash':
      return Math.max(
        METER_FLOOR,
        CRASH_FUMBLE_THRESHOLD - (refocusing ? REFOCUS_FUMBLE_DROP : 0),
      );
    case 'none':
      return fumbleThreshold(refocusing);
  }
}

/** Whether the hands are going, given the stress and what is in the blood. */
export function isFumblingWith(
  stress: number,
  phase: DrinkPhase,
  refocusing = false,
): boolean {
  return stress > fumbleLimit(phase, refocusing);
}

/** What the desk says about itself while a can is working. */
export const DRINK_LABELS: Readonly<Record<DrinkPhase, string>> = {
  none: 'Energy drink',
  buff: 'Wired',
  crash: 'Coming down',
};

export const BEER_TOOLTIP = 'Not during probation. It is in the fridge with '
  + 'your name on it, which is somehow worse.';

/**
 * The beer, which is the other kind of consumable entirely.
 *
 * The can is a decision with a bill attached. The beer is a REWARD, and it is
 * priced like one: it takes most of a week off the stress meter in one go, and
 * it is the single most incriminating thing that could be on the desk when
 * anybody walks past. Nobody is walking past at five o'clock on a Friday, which
 * is exactly why it unlocks then and not before.
 */
export const BEER_STRESS_RELIEF = 40;
export const BEER_SUSPICION = 25;

export const BEER_UNLOCKED_TOOLTIP = 'Probation is over, the office is empty, '
  + 'and it has been in that fridge with your name on it since Monday.';
