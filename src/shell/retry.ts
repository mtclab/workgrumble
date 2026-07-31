/**
 * Playing the week again after they have taken your lanyard off you.
 *
 * A firing does not end the game, because the game is not about the job. It is
 * about the farm, and the joke the whole thing hangs on is that the fund
 * SURVIVES every firing: they can have the desk back, the queue back and the
 * probation back, and the money towards twelve acres is still yours. So a
 * retry keeps three things and throws the rest away.
 *
 *  - The farm fund, in whole pence, because that is the joke.
 *  - What the player had READ - the mail they had opened, the article they had
 *    left up - because knowing where the answer is written down is the only
 *    thing a week at a helpdesk actually teaches, and taking it back would
 *    make a second attempt a memory test rather than a second attempt.
 *  - Which attempt this is, because that is what moves the seed: the same
 *    week, the same tickets, the same review on Friday, and not the same
 *    minutes.
 *
 * Everything else - the world, the meters, the queue, the reputation that got
 * you fired - is built again from nothing.
 *
 * The record lives in its own storage slot rather than in the save file: the
 * save is a world that no longer exists, and the first thing a retry does is
 * throw it away.
 */

import type { AppState, AppStateStore } from './app-state';
import { createAppState } from './app-state';
import type { SaveOutcome } from './save';
import type { WeekCarry } from '../world/session';

export const RETRY_KEY = 'it-career-sim/retry';

export interface RetryRecord {
  /** Which attempt the NEXT week is, counting from 1. */
  readonly attempt: number;
  readonly farmFund: number;
  /** The mail threads that had been opened. */
  readonly mailRead: readonly string[];
  /** The article that was up in the knowledge base, if there was one. */
  readonly kbSelected: string | null;
}

function refuse(reason: string): SaveOutcome<never> {
  return { ok: false, reason };
}

/** What the session that was fired hands to the session that replaces it. */
export function recordFrom(
  attempt: number,
  farmFund: number,
  screens: Readonly<AppState>,
): RetryRecord {
  return {
    attempt: attempt + 1,
    farmFund: Math.max(0, farmFund),
    mailRead: [...screens.mail.read],
    kbSelected: screens.kb.selectedId,
  };
}

export function parseRetryRecord(value: unknown): RetryRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { attempt, farmFund, mailRead, kbSelected } = value as
    Record<string, unknown>;
  const whole = (candidate: unknown, least: number): number | null => (
    typeof candidate === 'number'
      && Number.isSafeInteger(candidate)
      && candidate >= least
      ? candidate
      : null
  );
  const nextAttempt = whole(attempt, 1);
  const fund = whole(farmFund, 0);
  const read = Array.isArray(mailRead)
    && mailRead.every((entry) => typeof entry === 'string')
    ? mailRead
    : null;
  const selected = kbSelected === null || typeof kbSelected === 'string'
    ? kbSelected
    : undefined;

  if (
    nextAttempt === null
    || fund === null
    || read === null
    || selected === undefined
  ) {
    return null;
  }

  return {
    attempt: nextAttempt,
    farmFund: fund,
    mailRead: Object.freeze([...read]),
    kbSelected: selected,
  };
}

/** What the new world is seeded with. */
export function carryFrom(record: Readonly<RetryRecord>): WeekCarry {
  return { farmFund: record.farmFund, attempt: record.attempt };
}

/**
 * The screens a retried week opens with: a clean session, with what had been
 * read still read. The windows are deliberately NOT carried - a new week opens
 * on a desktop, not on the four windows the last one was fired in front of.
 */
export function screensFrom(record: Readonly<RetryRecord>): AppState {
  const fresh = createAppState();

  return {
    ...fresh,
    mail: { selectedId: null, read: Object.freeze([...record.mailRead]) },
    kb: { selectedId: record.kbSelected },
  };
}

/**
 * One retry slot in whatever storage it is handed, written the same way the
 * save slot is: storage is passed in, and a browser that refuses to keep it
 * is a sentence rather than an exception.
 */
export class RetrySlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = RETRY_KEY,
  ) {}

  public write(record: Readonly<RetryRecord>): SaveOutcome {
    try {
      this.storage.setItem(this.key, JSON.stringify(record));
      return { ok: true, value: undefined };
    } catch {
      return refuse(
        'The browser would not keep the one thing worth keeping. Storage is '
        + 'full, or this window is not allowed any.',
      );
    }
  }

  /** Reads and CLEARS: a carry-over is used once, by the week it starts. */
  public take(): RetryRecord | null {
    let raw: string | null;

    try {
      raw = this.storage.getItem(this.key);
    } catch {
      return null;
    }

    this.clear();

    if (raw === null) {
      return null;
    }

    try {
      return parseRetryRecord(JSON.parse(raw));
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

/** Puts a carried-over week's reading back on screen. */
export function hydrateFromRetry(
  store: AppStateStore,
  record: Readonly<RetryRecord>,
): void {
  store.hydrate(screensFrom(record));
}
