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
import { carryForStart, type StartRecord } from './start';
import { carryForSwitch, type SwitchRecord } from './switch';
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
