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
  carryForAnotherWeek,
  carryForEmployer,
  type EmployerCareer,
  parseCareer,
  serializeCareer,
} from '../world/career';
import { type CarriedValue, parseCarried } from '../world/carry';
import { isEmployerId } from '../world/employers';
import type { SaveOutcome } from './save';
import type { WeekCarry } from '../world/session';

export const SWITCH_KEY = 'workgrumble/switch';

export interface SwitchRecord {
  /** The employer being arrived at. A closed-set id the build ships. */
  readonly employer: string;
  /** The career crossing the threshold: standing, title, fund, trail. */
  readonly career: EmployerCareer;
  /**
   * WHICH week of that employer's arc is being arrived into (E11, 0.34.0).
   *
   * Absent is the probation week, which is what a change of employer always
   * is and what every record any earlier build wrote could only have been - the
   * same back-compat rule the carry and the retry record both read forwards.
   * PRESENT means the third door: staying at this employer for its week `n`,
   * which is the one arrival where the shop on either side of the threshold is
   * the same shop.
   *
   * It is one record for both doors rather than two slots because it is one
   * fact - an arrival, and where at - and because the durability latch that
   * protects a carried career (`acknowledgeCarry`) is a thing worth having once
   * and not worth having twice.
   */
  readonly arcWeek?: number;
  /**
   * And what the building keeps: the employer's declared estate delta, read off
   * the Friday that is ending.
   *
   * Only ever written by a STAY. A switch carries no estate, because the estate
   * it would carry belongs to a building the player has left.
   */
  readonly estate?: readonly CarriedValue[];
  /**
   * The toys still on the machine.
   *
   * The one carried thing that is not a graph field, and it is not one because
   * the web store's install set has never been one: it lives in the app state
   * the save file's `app` slice holds (`app-state.ts`), so a whitelist of graph
   * nodes and fields cannot reach it. It is carried anyway, because "installed
   * software" is the first class D-E11-1 names and because it is the carried
   * fact a player can SEE: the icon is on the desktop on the Monday, or the
   * persistence decision did not happen.
   *
   * Only ever written by a STAY, and for the same reason the estate is: a new
   * employer is a new machine, and the toys on the last one's desktop are on
   * the last one's desktop.
   */
  readonly installed?: readonly string[];
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
 * And what the session that STAYED hands to the session that arrives (E11,
 * 0.34.0): the same shop, the next week of its arc, and the two things the
 * building keeps.
 */
export function stayRecord(
  employer: string,
  career: Readonly<EmployerCareer>,
  arcWeek: number,
  estate: readonly CarriedValue[],
  installed: readonly string[],
): SwitchRecord {
  return { employer, career, arcWeek, estate, installed };
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

  const {
    employer,
    career,
    arcWeek,
    estate,
    installed,
  } = value as Record<string, unknown>;

  if (!isEmployerId(employer)) {
    return null;
  }

  const parsed = parseCareer(career);

  if (parsed === null) {
    return null;
  }

  // The three week-two fields are read the way the retry record reads its arc
  // week: absent is a legal, meaningful answer (a switch, which is every record
  // any earlier build wrote), and rubbish in one of them is REFUSED rather than
  // dropped. A record whose estate would not parse is an arrival that would
  // stand up a Monday missing exactly the half of the world nothing on any
  // screen would name.
  const week = arcWeek === undefined ? null : arcWeek;
  const at = typeof week === 'number' && Number.isSafeInteger(week) && week >= 1
    ? week
    : null;

  if (week !== null && at === null) {
    return null;
  }

  const delta = parseCarried(estate);

  if (delta === null) {
    return null;
  }

  const toys = installed === undefined
    ? []
    : Array.isArray(installed)
        && installed.every((id) => typeof id === 'string' && id.length > 0)
      ? installed as readonly string[]
      : null;

  if (toys === null) {
    return null;
  }

  return {
    employer,
    career: parsed,
    ...(at === null ? {} : { arcWeek: at }),
    ...(delta.length === 0 ? {} : { estate: delta }),
    ...(toys.length === 0 ? {} : { installed: toys }),
  };
}

/**
 * What the arriving employer's week is seeded with.
 *
 * Two doors, one function, and the record says which: no arc week on it is a
 * SWITCH - a fresh probation at a new shop, the 0.6.0 behaviour untouched to
 * the letter - and an arc week on it is a STAY, week `n` at the shop the player
 * did not leave, with the estate the building kept.
 */
export function carryForSwitch(record: Readonly<SwitchRecord>): WeekCarry {
  return record.arcWeek === undefined
    ? carryForEmployer(record.career, record.employer)
    : carryForAnotherWeek(
      record.career,
      record.employer,
      record.arcWeek,
      record.estate ?? [],
    );
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
        // Written field by field rather than by spreading the record, so a
        // switch's bytes are exactly the two keys they have always been and
        // only a stay's file grows. Nothing that reads an old record has to
        // learn a new shape, which is the whole of why the switch path is
        // untouched by week two.
        ...(record.arcWeek === undefined ? {} : { arcWeek: record.arcWeek }),
        ...(record.estate === undefined || record.estate.length === 0
          ? {}
          : { estate: record.estate }),
        ...(record.installed === undefined || record.installed.length === 0
          ? {}
          : { installed: record.installed }),
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
