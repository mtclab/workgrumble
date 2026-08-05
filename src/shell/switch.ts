/**
 * Carrying a career across a change of employer.
 *
 * A firing does not end the game and neither does passing probation - both are
 * a door out of one shop and into the next - so when the player takes the offer,
 * the thing that crosses the threshold is a CAREER: the standing they built, the
 * title they hold, and the fund that has survived everything. The world on the
 * far side (the company, the estate, the tickets, the accounts) is thrown away
 * and built again from the new employer's own seed; the career is seeded INTO
 * it.
 *
 * This is the retry slot's sibling, and it is a separate slot for the reason
 * retry is a separate slot from the save: the save is a world that no longer
 * exists the instant the offer is accepted, and the first thing an arrival does
 * is throw it away. What has to outlive the tab is the one record of who you are
 * and what you are worth, written down before the page is torn down and read
 * back on the boot that stands the new employer up.
 *
 * The record holds two things and no more: WHICH employer is being arrived at,
 * and the CAREER being carried in. Everything else - the attempt, the arc week,
 * the fresh screens - is what a first week at any employer starts with, so it is
 * rebuilt rather than carried.
 */

import {
  carryForEmployer,
  type EmployerCareer,
  parseCareer,
  serializeCareer,
} from '../world/career';
import { isEmployerId } from '../world/employers';
import type { SaveOutcome } from './save';
import type { WeekCarry } from '../world/session';

export const SWITCH_KEY = 'workgrumble/switch';

export interface SwitchRecord {
  /** The employer being arrived at. A closed-set id the build ships. */
  readonly employer: string;
  /** The career crossing the threshold: standing, title, fund, trail. */
  readonly career: EmployerCareer;
}

function refuse(reason: string): SaveOutcome<never> {
  return { ok: false, reason };
}

/** What the session that took the offer hands to the session that arrives. */
export function switchRecord(
  employer: string,
  career: Readonly<EmployerCareer>,
): SwitchRecord {
  return { employer, career };
}

/**
 * Reads a switch record back, or refuses it.
 *
 * The employer id is checked against the closed set the build ships, not merely
 * for being a string: a record that named an employer this version has never
 * heard of would stand the WRONG world up under a real career, which is a
 * silently wrong game rather than a stopped one - the same rule `employerFor`
 * keeps, applied one layer out at the storage boundary. The career is parsed by
 * its own guard, which refuses a fund or a standing that is not a whole number.
 */
export function parseSwitchRecord(value: unknown): SwitchRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { employer, career } = value as Record<string, unknown>;

  if (!isEmployerId(employer)) {
    return null;
  }

  const parsed = parseCareer(career);

  if (parsed === null) {
    return null;
  }

  return { employer, career: parsed };
}

/** What the arriving employer's first week is seeded with. */
export function carryForSwitch(record: Readonly<SwitchRecord>): WeekCarry {
  return carryForEmployer(record.career, record.employer);
}

/**
 * One switch slot in whatever storage it is handed, written the same way the
 * save and retry slots are: storage is passed in, and a browser that refuses to
 * keep it is a sentence rather than an exception.
 */
export class SwitchSlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = SWITCH_KEY,
  ) {}

  public write(record: Readonly<SwitchRecord>): SaveOutcome {
    try {
      this.storage.setItem(this.key, JSON.stringify({
        employer: record.employer,
        career: JSON.parse(serializeCareer(record.career)) as unknown,
      }));
      return { ok: true, value: undefined };
    } catch {
      return refuse(
        'The browser would not keep the offer. Storage is full, or this '
        + 'window is not allowed any.',
      );
    }
  }

  /**
   * Reads and LEAVES IT THERE, exactly as the retry slot does and for exactly
   * the same reason: an arrival is used once, but "used" means the new week has
   * been written to a save that survives the tab - not that a variable in this
   * session has read it. Clearing it here would destroy the only copy of the
   * carried career before anything durable existed, so a refresh in the seconds
   * between boot and the first day boundary would come back a fresh probationer.
   * The caller acknowledges it once the arrival is durable.
   */
  public peek(): SwitchRecord | null {
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
      return parseSwitchRecord(JSON.parse(raw));
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
