/**
 * What survives a firing, and what does not.
 *
 * This is a matrix rather than a happy path on purpose: a retry that quietly
 * kept the reputation that got the player fired would make the second attempt
 * unwinnable, and one that quietly lost the farm fund would break the only
 * joke the whole game is built on. Both halves are asserted - what is CARRIED
 * and what is RESET - because either one being wrong looks like the other one
 * working.
 */

import { beforeAll, describe, expect, it } from 'vitest';

import { loadEngineForTests } from '../engine-api/load-node';
import { COMPANY_IDS } from '../world/company';
import { FIELDS } from '../world/fields';
import { STARTING_REPUTATION } from '../world/meters';
import {
  createWorldSession,
  FIRST_WEEK,
  seedForAttempt,
  WORLD_SEED,
} from '../world/session';
import { buildDaySchedule } from '../world/day';
import { dayPlan } from '../world/week';
import { AppStateStore, createAppState } from './app-state';
import {
  carryFrom,
  hydrateFromRetry,
  parseRetryRecord,
  recordFrom,
  RETRY_KEY,
  RetrySlot,
  screensFrom,
} from './retry';

beforeAll(() => {
  loadEngineForTests();
});

class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }
}

function screensAfterAWeek(): AppStateStore {
  const store = new AppStateStore();
  store.patch('mail', { selectedId: 'mail/queue-nag', read: ['mail/onboarding'] });
  store.patch('kb', { selectedId: 'kb/print-spooler' });
  store.patch('chat', {
    threads: {
      [COMPANY_IDS.boss]: {
        nodeId: 'phone',
        rootUsed: 'phone',
        ended: false,
        lines: [{ who: 'them', text: 'My phone has stopped getting email.' }],
      },
    },
  });
  store.patch('windows', {
    open: [{ appId: 'browser', minimized: false }],
    focusedId: 'browser',
  });
  return store;
}

describe('what a firing leaves behind', () => {
  it('carries the fund, the article and the attempt, and nothing else', () => {
    const record = recordFrom(1, 12_345, screensAfterAWeek().snapshot(), 4);

    expect(record).toEqual({
      attempt: 2,
      farmFund: 12_345,
      kbSelected: 'kb/print-spooler',
      // A retry is the same week over: the attempt moves and the week of the
      // career does not, so a firing in the fourth week of an employer arc
      // starts the fourth week again rather than the first.
      arcWeek: 4,
    });

    const screens = screensFrom(record);
    // Kept: where the answer was written down.
    expect(screens.kb.selectedId).toBe('kb/print-spooler');
    // Reset: the conversation, the windows it happened in, and the WHOLE of
    // the inbox. A thread still marked read on the Monday of a new week is a
    // thread with its unread cue taken off - the security incident report and
    // the maintenance notice both arrive again and both matter again.
    expect(screens.chat).toEqual(createAppState().chat);
    expect(screens.windows).toEqual(createAppState().windows);
    expect(screens.mail).toEqual(createAppState().mail);
    expect(screens.day).toEqual(createAppState().day);
    expect(screens.caught).toEqual(createAppState().caught);
  });

  it('puts the reading back on the new week\'s screens', () => {
    const record = recordFrom(1, 500, screensAfterAWeek().snapshot());
    const fresh = new AppStateStore();
    hydrateFromRetry(fresh, record);

    expect(fresh.get().kb.selectedId).toBe('kb/print-spooler');
    expect(fresh.get().mail.read).toEqual([]);
    expect(fresh.get().windows.open).toEqual([]);
  });

  /** The record comes back off a disk anything on the machine can edit. */
  it('reads a record strictly, or not at all', () => {
    const good = recordFrom(2, 7, createAppState());
    expect(parseRetryRecord(JSON.parse(JSON.stringify(good)))).toEqual(good);

    expect(parseRetryRecord(null)).toBeNull();
    expect(parseRetryRecord([])).toBeNull();
    expect(parseRetryRecord({ ...good, attempt: 0 })).toBeNull();
    expect(parseRetryRecord({ ...good, attempt: 1.5 })).toBeNull();
    expect(parseRetryRecord({ ...good, farmFund: -1 })).toBeNull();
    expect(parseRetryRecord({ ...good, kbSelected: 7 })).toBeNull();
    expect(parseRetryRecord({ ...good, kbSelected: null })).not.toBeNull();
    // A record written by a build that still carried the inbox is a fund
    // somebody earned. The extra key is read past, not refused.
    expect(parseRetryRecord({ ...good, mailRead: ['mail/onboarding'] }))
      .toEqual(good);
    // And one written by a build that had only ever had one week in it is a
    // record about the probation week, which is what the missing key means
    // rather than a record to refuse.
    expect(parseRetryRecord({ ...good, arcWeek: undefined })?.arcWeek).toBe(1);
    expect(parseRetryRecord({ ...good, arcWeek: 0 })?.arcWeek).toBe(1);
    expect(parseRetryRecord({ ...good, arcWeek: 6 })?.arcWeek).toBe(6);
  });

  /**
   * Reading the slot must NOT empty it.
   *
   * The carry-over is the only copy of the fund until the new week has been
   * written down somewhere that survives the tab, and clearing it at the read
   * left a window - boot to the first day boundary - in which a refresh came
   * back as attempt one with nothing in it.
   */
  it('leaves the record in the slot until somebody lets go of it', () => {
    const storage = new MemoryStorage();
    const slot = new RetrySlot(storage);
    const record = recordFrom(1, 900, createAppState());

    expect(slot.peek()).toBeNull();
    expect(slot.write(record)).toEqual({ ok: true, value: undefined });
    expect(slot.peek()).toEqual(record);
    expect(slot.peek()).toEqual(record);

    slot.clear();
    expect(slot.peek()).toBeNull();

    // And rubbish in the slot is a week that starts fresh, not a crash.
    storage.setItem(RETRY_KEY, '{not json');
    expect(slot.peek()).toBeNull();
  });
});

describe('the week the retry starts', () => {
  it('keeps the fund and resets the world around it', () => {
    const carried = carryFrom(recordFrom(1, 30_000, createAppState()));
    const retried = createWorldSession(carried);
    const graph = retried.engine.graph;
    const read = (field: string): unknown => graph.getField(
      COMPANY_IDS.player,
      field,
    );

    // Kept.
    expect(read(FIELDS.farmFund)).toBe(30_000);
    expect(read(FIELDS.weekOpeningFund)).toBe(30_000);
    expect(read(FIELDS.weekAttempt)).toBe(2);

    // Reset: the meters, the review, the desk, the day and the queue.
    expect(read(FIELDS.reputation)).toBe(STARTING_REPUTATION);
    expect(read(FIELDS.stress)).toBe(0);
    expect(read(FIELDS.suspicion)).toBe(0);
    expect(read(FIELDS.reviewOutcome)).toBe('pending');
    expect(read(FIELDS.weekEnded)).toBe(false);
    expect(read(FIELDS.beerUnlocked)).toBe(false);
    expect(read(FIELDS.deskCans)).toBe(0);
    expect(read(FIELDS.dayState)).toBe('morning_brief');
    expect(retried.engine.now()).toBe(0);
    expect([...graph.nodesOfKind('ticket')].map((node) => node.id).sort())
      .toEqual([...dayPlan(1).inherited].sort());
  });

  /**
   * The same week, and not the same minutes. A retry that arrived tick for
   * tick would be a memory test rather than a second attempt.
   */
  it('moves the seed so the week differs without becoming another week', () => {
    expect(seedForAttempt(1)).toBe(WORLD_SEED);
    expect(seedForAttempt(2)).not.toBe(seedForAttempt(1));
    expect(seedForAttempt(3)).not.toBe(seedForAttempt(2));
    expect(seedForAttempt(2)).toBeLessThanOrEqual(0xffff_ffff);
    expect(seedForAttempt(2)).toBeGreaterThanOrEqual(0);
    expect(() => seedForAttempt(0)).toThrow(TypeError);

    const first = buildDaySchedule(1, seedForAttempt(1), dayPlan(1));
    const second = buildDaySchedule(1, seedForAttempt(2), dayPlan(1));

    // The same tickets, in the same order, on different minutes.
    expect(second.arrivals.map((arrival) => arrival.ticketId))
      .toEqual(first.arrivals.map((arrival) => arrival.ticketId));
    expect(second.arrivals.map((arrival) => arrival.tick))
      .not.toEqual(first.arrivals.map((arrival) => arrival.tick));
  });

  it('refuses a carry-over that is not one', () => {
    expect(() => createWorldSession({ farmFund: -1, attempt: 1 }))
      .toThrow(TypeError);
    expect(() => createWorldSession({ farmFund: 0, attempt: 0 }))
      .toThrow(TypeError);
    expect(createWorldSession(FIRST_WEEK).carry).toEqual(FIRST_WEEK);
  });
});
