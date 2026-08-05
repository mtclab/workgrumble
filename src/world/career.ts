/**
 * What crosses an employer, and what the way you left does to it.
 *
 * A firing does not end the game and neither does a redundancy - the game is
 * about the farm, not the job (`retry.ts`, `week.ts`) - so leaving one employer
 * for the next carries a CAREER: the standing you built, the title you hold, and
 * the fund that has always survived everything. This module is the pure
 * arithmetic of that carry. It seeds no world and reads no graph: it is handed
 * where you stand and how you left, and it answers with what you take with you.
 *
 * The three exits are the three ways a probation ends, from the carry's point of
 * view rather than the review screen's:
 *
 *  - COMPLETED. You passed. The career carries clean - the standing you earned,
 *    the title you hold, nothing following you.
 *  - RESIGNED. You left of your own accord. No hit to the standing, but a resign
 *    is on the record: the next employer's offer is allowed to read it.
 *  - FIRED. You were let go for cause. The standing takes a hit on the way out
 *    and the firing follows you, which is what a reference is.
 *
 * The fund survives all three, because the fund survives everything - that is
 * the one joke the whole game is built on, and it is asserted for each exit
 * rather than for one.
 *
 * The TRAIL is carry state and not world state on purpose: it changes the OFFER
 * the next employer makes (slice 2), not the world that employer stands up. So
 * it rides the career record across the switch and is dropped when the career is
 * turned into the seed for a week - a week's world has no field for "how you
 * left the last one", and inventing one would move the goldens for nothing.
 */

import { clampMeter } from './meters';
import { PROBATION_WEEK } from './pressure';
import type { WeekCarry } from './session';

/** The three ways a probation ends, as the carry sees them. */
export const EMPLOYER_EXITS = ['completed', 'resigned', 'fired'] as const;

export type EmployerExit = (typeof EMPLOYER_EXITS)[number];

export function isEmployerExit(value: unknown): value is EmployerExit {
  return typeof value === 'string'
    && EMPLOYER_EXITS.some((exit) => exit === value);
}

/**
 * What follows you to the next employer, or nothing.
 *
 * `completed` leaves no trail - a clean pass is the absence of a mark, not a
 * mark that says clean - so a completed career carries `null` here and the two
 * trails are exactly the two exits that are not a clean pass.
 */
export const EMPLOYER_TRAILS = ['resigned', 'fired'] as const;

export type EmployerTrail = (typeof EMPLOYER_TRAILS)[number];

export function isEmployerTrail(value: unknown): value is EmployerTrail {
  return typeof value === 'string'
    && EMPLOYER_TRAILS.some((trail) => trail === value);
}

/**
 * What a firing costs the standing on the way out the door.
 *
 * OVERSEER TUNING KNOB, and deliberately a dent rather than a wipe: a firing is
 * a worse start at the next place, not a different person. Fifteen points off a
 * meter that runs nought to a hundred is felt at the next Monday review without
 * making the next job unwinnable, which is the honest shape of "this follows
 * you" - slice 2 turns it into a worse offer, and the number is here so that
 * both slices read one figure rather than two.
 */
export const FIRED_REPUTATION_PENALTY = 15;

/** Where you stand at an employer, as the carry needs to read it off the graph. */
export interface CareerStanding {
  readonly reputation: number;
  readonly title: string;
  readonly farmFund: number;
}

/**
 * A career, in flight between two employers.
 *
 * The standing and title that continue, the fund that always continues, and the
 * trail the way-you-left wrote onto it. This is the thing that is written down
 * and read back across a switch, the same way a `RetryRecord` is across a
 * firing - and `parseCareer` is what makes reading one back a refusal rather
 * than a guess when the bytes are wrong.
 */
export interface EmployerCareer {
  readonly reputation: number;
  readonly title: string;
  readonly farmFund: number;
  readonly trail: EmployerTrail | null;
}

/**
 * The career you carry out of an employer, given how the probation ended.
 *
 * Pure: the exit decides the standing (a firing dents it, the other two leave
 * it) and the trail (a clean pass leaves none), and the fund is carried through
 * all three untouched but for the floor that says it is never negative.
 */
export function careerAfter(
  exit: EmployerExit,
  standing: Readonly<CareerStanding>,
): EmployerCareer {
  const reputation = exit === 'fired'
    ? clampMeter(standing.reputation - FIRED_REPUTATION_PENALTY)
    : clampMeter(standing.reputation);

  return {
    reputation,
    title: standing.title,
    // The joke that survives every ending: they take the desk, the lanyard and
    // the reference, and the money towards the farm is still yours.
    farmFund: Math.max(0, standing.farmFund),
    trail: exit === 'completed' ? null : exit,
  };
}

/**
 * The seed for the next employer's first week, from a carried career.
 *
 * Attempt one and week one, because a new employer is a fresh probation at that
 * employer rather than the same week over - the attempt and the arc position
 * belong to the employer you are ARRIVING at, and they start where every
 * employer starts. The standing and title ride across as the carry's optional
 * career fields, which is what makes `createWorldSession` seed the new player
 * node FROM them rather than fresh. The trail is deliberately not here: it is
 * the offer's business, not the world's.
 */
export function carryForEmployer(
  career: Readonly<EmployerCareer>,
  employer: string,
): WeekCarry {
  return {
    farmFund: career.farmFund,
    attempt: 1,
    arcWeek: PROBATION_WEEK,
    employer,
    reputation: career.reputation,
    title: career.title,
  };
}

/**
 * Reads a career back off whatever it was written to, or refuses it.
 *
 * The same shape of guard `parseRetryRecord` is: every field is checked, and a
 * record missing one or holding rubbish in one is `null` rather than a career
 * with a hole in it. A trail this build does not know is dropped to `null`
 * rather than refused - an unknown mark is no worse than no mark, and a save
 * from a later build that added a third trail is still a fund and a standing
 * somebody earned.
 */
export function parseCareer(value: unknown): EmployerCareer | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const {
    reputation,
    title,
    farmFund,
    trail,
  } = value as Record<string, unknown>;

  const whole = (candidate: unknown, least: number): number | null => (
    typeof candidate === 'number'
      && Number.isSafeInteger(candidate)
      && candidate >= least
      ? candidate
      : null
  );

  const rep = whole(reputation, 0);
  const fund = whole(farmFund, 0);

  if (rep === null || fund === null || typeof title !== 'string'
    || title.length === 0) {
    return null;
  }

  return {
    reputation: rep,
    title,
    farmFund: fund,
    trail: isEmployerTrail(trail) ? trail : null,
  };
}

/** The career as bytes, for the slot it is written to across a switch. */
export function serializeCareer(career: Readonly<EmployerCareer>): string {
  return JSON.stringify({
    reputation: career.reputation,
    title: career.title,
    farmFund: career.farmFund,
    trail: career.trail,
  });
}
