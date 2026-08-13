/**
 * WHICH DESK YOU WERE HIRED ONTO: the start title, written down before there is
 * a world to write it into (E9, 0.35.0 slice B).
 *
 * D1 decided that the title you start at IS the difficulty select, and the
 * awkward fact about a new game is that the world is stood up before anybody
 * has been asked anything: `main.ts` builds the session, and only then does the
 * beige box POST and the log-on box appear. So the pick cannot be handed to a
 * running session - it has to be written where a BOOT will find it, which is
 * exactly the problem the retry slot and the switch slot already solve, and
 * this is their smallest sibling.
 *
 * ONE FIELD. The record holds the rung and nothing else, because everything
 * else about the start - which shop, which tier, which title, which week of the
 * arc - is on that rung's row in the table (`world/titles.ts`). A record that
 * carried the employer as well would be a second answer to a question the table
 * already answers, and the two would disagree the first time a row moved.
 *
 * NO SCHEMA MOVED, and that was checked before a line was written. The start
 * title rides the fields the career carry has held since 0.6.0 and E6 - the
 * title and the PAM tier - so a save taken at an engineer start is the same
 * shape as a save taken after a promotion, and a build that had never heard of
 * a rung table reads it as what it is: a Systems Engineer at the MSP. Adding a
 * schema version for a field the carry already holds would have been the second
 * answer this whole slice is against.
 *
 * The junior start writes NOTHING AT ALL. Its row is the shipped game, so the
 * carry it would produce is `FIRST_WEEK` down to the field - and a slot written
 * on every new game would be a slot to keep true for no gain.
 */

import {
  carryForAnotherWeek,
  carryForEmployer,
  FRESH_CAREER_TIER,
  type EmployerCareer,
} from '../world/career';
import {
  DEFAULT_RUNG,
  isBuiltRung,
  TITLE_TABLE,
  tierFor,
  type Rung,
} from '../world/titles';
import { STARTING_REPUTATION } from '../world/meters';
import { FIRST_WEEK, type WeekCarry } from '../world/session';
import type { SaveOutcome } from './save';

export const START_KEY = 'workgrumble/start';

export interface StartRecord {
  /** The rung the player was hired at. A built one, or the record is refused. */
  readonly rung: Rung;
}

/**
 * The career a hire IS, before a single day of it has been played.
 *
 * Three of the five fields are the interesting ones. The FUND starts at nought
 * because nobody has been paid yet - being hired at a better title does not
 * come with savings. There is no TRAIL, because there is no last job to have
 * left badly. And the STANDING is the shop's own starting figure rather than
 * the promotion's bar: a hire has earned nothing here yet, and what the title
 * buys them is the WORK - the tier, the pager, the blend - which is the whole
 * of D1. Written explicitly rather than left off, because a carry with no
 * standing on it means "leave the employer's seed", and this IS the employer's
 * seed: saying so is what makes a hired engineer and a promoted one the same
 * player on the Monday.
 */
function careerFor(rung: Rung): EmployerCareer {
  return {
    reputation: STARTING_REPUTATION,
    title: TITLE_TABLE[rung].title,
    farmFund: 0,
    trail: null,
    tier: tierFor(rung),
  };
}

/**
 * The week a start rung opens on.
 *
 * Through `carryForEmployer`, which is the promotion's own road: it is what
 * turns a career into the seed of an employer's first week, and it is what the
 * switch uses. Reusing it is the point - being an engineer has exactly ONE
 * implementation (the tier and the title on the player node, written by
 * `carrySetup` out of the carry), and a start that wrote those fields itself
 * would be a second way to be an engineer, free to drift from the first.
 */
export function carryForStart(rung: Rung): WeekCarry {
  if (rung === DEFAULT_RUNG) {
    // The bottom rung is the shipped game, byte for byte: same fund, same
    // attempt, same week of the arc, same shop, and no career fields at all.
    return FIRST_WEEK;
  }

  const row = TITLE_TABLE[rung];
  const employer = row.employer ?? '';

  /**
   * A rung that names a week of the arc opens on THAT week, through the road a
   * second week at the same shop already takes (E9, 0.36.0).
   *
   * The senior analyst is hired onto the probation shop's desk, and week one of
   * that shop is somebody's probation - the Monday that teaches the two basic
   * tools, reproduced byte for byte by the generator on purpose. Dealing it to
   * a senior would be the game insisting an experienced analyst be walked
   * through the ticket window; worse, it is the one week a rung's blend is
   * forbidden to touch, so the ratios on the row would mean nothing at all.
   *
   * `carryForAnotherWeek` rather than a field set here, for the reason
   * `carryForEmployer` is used below: being somewhere in an employer's arc has
   * one implementation, and a start that wrote `arcWeek` itself would be a
   * second one, free to drift.
   */
  return row.startsAt === null
    ? carryForEmployer(careerFor(rung), employer)
    : carryForAnotherWeek(careerFor(rung), employer, row.startsAt);
}

/** Whether a start record stands a player at the engineer tier (E6). */
export function startsPromoted(record: Readonly<StartRecord>): boolean {
  return tierFor(record.rung) !== FRESH_CAREER_TIER;
}

/**
 * Reads a start record back, or refuses it.
 *
 * A rung this build does not ship, or one it ships without the content to play,
 * is refused rather than dropped to the bottom of the ladder: a hand-edited
 * slot naming `architect` must not stand up a world calling somebody an
 * architect while dealing them a probationer's week. Refused reads as no record
 * at all, which is a new game at the desk - the honest answer.
 */
export function parseStartRecord(value: unknown): StartRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { rung } = value as Record<string, unknown>;

  return isBuiltRung(rung) ? { rung } : null;
}

/**
 * One start slot in whatever storage it is handed, written the same way the
 * save, retry and switch slots are: storage is passed in, and a browser that
 * refuses to keep it is a sentence rather than an exception.
 */
export class StartSlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = START_KEY,
  ) {}

  public write(record: Readonly<StartRecord>): SaveOutcome {
    try {
      this.storage.setItem(this.key, JSON.stringify({ rung: record.rung }));
      return { ok: true, value: undefined };
    } catch {
      return {
        ok: false,
        reason: 'The browser would not keep which desk you were hired onto. '
          + 'Storage is full, or this window is not allowed any.',
      };
    }
  }

  /**
   * Reads and LEAVES IT THERE, exactly as the retry and switch slots do and for
   * exactly the same reason: the pick is used once, but "used" means the new
   * week has been written to a save that survives the tab. Clearing it on the
   * boot that reads it would send a refresh in the seconds before the first day
   * boundary back to the service desk, wearing somebody else's job.
   */
  public peek(): StartRecord | null {
    let raw: string | null;

    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }

    if (raw === null) {
      return null;
    }

    try {
      return parseStartRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  public clear(): void {
    try {
      this.storage.removeItem(this.key);
    } catch {
      // A slot that cannot be cleared is a slot that was never written.
    }
  }
}
