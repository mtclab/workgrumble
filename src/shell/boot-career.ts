/**
 * WHICH CAREER A BOOT IS, read off the four slots before a world exists
 * (#61, 0.41.0).
 *
 * Every boot of this game answers the same question in the same order, and
 * until this module the answer was four `?:` chains in `main.ts` that had to be
 * kept agreeing with each other by hand. Three of them already were - the carry
 * a world is built from, whether a job is being offered, which record the
 * ceremony names - and the fourth was missing entirely, which is the whole of
 * #61: a plain refresh stood a PROBATION Monday up while the week the player
 * was actually in sat in the save slot, unloaded, until somebody pressed Load.
 *
 * THE ORDER IS THE RULE, and it is the shipped one with a fifth rung under it:
 *
 *  1. AN ARRIVAL at a new employer, or a stay at this one. It is the latest
 *     decision a player made and it leads to a different world, so it wins.
 *  2. A RETRY after a firing: the same Monday again, with the fund.
 *  3. A DESK that was chosen and not yet saved (E9, 0.35.0). It is here rather
 *     than above the save because a start record is consumed by the boot after
 *     the one that wrote it - and because the START-FRESH door writes one
 *     deliberately, over a career this browser is carrying, having asked first.
 *  4. THE SAVED WEEK, resumed. Nothing was carried in, and there is a week in
 *     this browser: it is the player's, and a refresh is not a request for a
 *     new one.
 *  5. And a FIRST MONDAY, which is now exactly what it says: a browser with
 *     nothing in it at all.
 *
 * `resume` and `hiring` are the two halves of rung 4/5 and cannot both be true:
 * a browser either has a week to come back to or is being offered a job. That
 * pairing is why they are decided here together rather than a screen apart.
 */

import { carryFrom, type RetryRecord } from './retry';
import type { SaveOutcome } from './save';
import { carryForStart, type StartRecord } from './start';
import { carryForSwitch, type SwitchRecord } from './switch';
import { isBuiltRung } from '../world/titles';
import { FIRST_WEEK, type WeekCarry } from '../world/session';

/** What the slots held when this boot read them. All four are read-and-leave. */
export interface BootSlots {
  readonly arriving: SwitchRecord | null;
  readonly carried: RetryRecord | null;
  readonly started: StartRecord | null;
  /**
   * Whether there is a saved week in this browser - `SaveSlot.exists()`, not a
   * parse. A file that turns out to be unreadable is still a week somebody
   * played, and the honest answer to it is the LOAD's own refusal said out
   * loud, not a probation Monday stood up in silence.
   */
  readonly saved: boolean;
}

export interface BootCareer {
  /** The arrival this boot stands up, or null - the shipped precedence. */
  readonly arriving: SwitchRecord | null;
  readonly carried: RetryRecord | null;
  readonly started: StartRecord | null;
  /** What the world is BUILT from. */
  readonly opening: WeekCarry;
  /**
   * Whether the saved week is then loaded over it, through the shipped load.
   *
   * The world is built first and replaced second rather than being built from
   * the file, and that is deliberate: a save carries a whole serialized world,
   * so the only thing that can honestly stand it up is the loader every Load
   * button already goes through - preflight, rollback and all.
   */
  readonly resume: boolean;
  /** Whether this boot offers a job: a browser carrying nothing whatsoever. */
  readonly hiring: boolean;
}

export function bootCareer(slots: Readonly<BootSlots>): BootCareer {
  const arriving = slots.arriving;
  const carried = arriving === null ? slots.carried : null;
  const started = arriving === null && carried === null ? slots.started : null;
  const empty = arriving === null && carried === null && started === null;

  return {
    arriving,
    carried,
    started,
    opening: arriving !== null
      ? carryForSwitch(arriving)
      : carried !== null
        ? carryFrom(carried)
        : started === null ? FIRST_WEEK : carryForStart(started.rung),
    resume: empty && slots.saved,
    hiring: empty && !slots.saved,
  };
}

/** The slot a pick is written into: `StartSlot`, or anything that answers. */
export interface StartWriter {
  write(record: { readonly rung: string }): SaveOutcome;
}

/** A record of a career this browser is carrying, and can be let go of. */
export interface CareerRecord {
  clear(): void;
}

/**
 * TAKING A DESK, and - for the start-fresh door - letting go of the career that
 * was here first (#61, 0.41.0).
 *
 * One implementation for both doors, because they are one move with one
 * difference: a HIRE is offered to a browser carrying nothing, so `replaces` is
 * empty and this writes a pick; the DOOR is offered to a browser carrying a
 * career, has already asked and been answered, and hands over the save, the
 * retry and the switch to be let go of.
 *
 * THE ORDER IS THE WHOLE OF IT, and it is `acknowledgeCarry`'s rule read the
 * other way round. The pick is written FIRST and the old career is dropped only
 * once that write has said it worked, so a browser that will not keep the pick
 * refuses here with the old career sitting exactly where it was - rather than
 * clearing three slots and then discovering there is nowhere to put the new
 * one, which is a player left with neither career and nothing on screen to say
 * why.
 *
 * A rung nobody has written is refused rather than dropped to the bottom of the
 * ladder: the greying on the option is manners, and this is the rule. Nothing is
 * cleared on a refusal, at all, for any reason.
 */
export function beginCareer(
  start: StartWriter,
  rung: string,
  replaces: readonly CareerRecord[],
): SaveOutcome {
  if (!isBuiltRung(rung)) {
    return {
      ok: false,
      reason: 'Nobody has written that rung of the ladder yet. It is on the '
        + 'list because the ladder is the difficulty and this is where it runs '
        + 'out, not because the agency can place you on it.',
    };
  }

  const kept = start.write({ rung });

  if (!kept.ok) {
    return kept;
  }

  // The confirmed moment: every record of the old career, because any one left
  // behind stands itself up on the next boot instead of the desk just picked.
  for (const record of replaces) {
    record.clear();
  }

  return kept;
}
