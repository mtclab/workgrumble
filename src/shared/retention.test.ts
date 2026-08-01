import { describe, expect, it } from 'vitest';

import {
  lapsesAt,
  parseAccountRecord,
  readAccountRecord,
  RETENTION_DAYS,
  RETENTION_MS,
  RETENTION_SECONDS,
} from './retention';

const NOW = 1_700_000_000_000;

describe('the number itself', () => {
  /**
   * One constant, three units, and no arithmetic anybody has to do twice. The
   * badge screen says the days, KV is handed the seconds, and the date the
   * player is shown is the milliseconds - and all three have to be the same
   * six months or the product is telling somebody a date it does not keep.
   */
  it('is one six-month period in whatever unit is being asked for', () => {
    expect(RETENTION_DAYS).toBe(180);
    expect(RETENTION_SECONDS).toBe(RETENTION_DAYS * 24 * 60 * 60);
    expect(RETENTION_MS).toBe(RETENTION_SECONDS * 1_000);
  });

  it('lapses six months after the last time somebody turned up', () => {
    expect(lapsesAt({ created_at: 0, last_seen: NOW })).toBe(NOW + RETENTION_MS);
    // The minting date has no say in it: an account used yesterday is not
    // closer to being cleared out for having been opened last year.
    expect(lapsesAt({ created_at: NOW - RETENTION_MS * 4, last_seen: NOW }))
      .toBe(NOW + RETENTION_MS);
  });
});

describe('reading a badge record', () => {
  it('takes the record this build writes', () => {
    expect(parseAccountRecord({ created_at: 1, last_seen: 2 }))
      .toEqual({ created_at: 1, last_seen: 2 });
    expect(readAccountRecord('{"created_at":1,"last_seen":2}'))
      .toEqual({ created_at: 1, last_seen: 2 });
  });

  /**
   * The badges that already exist, and the only lenient thing in this file.
   * A record from before `last_seen` was stamped reads as "last seen when it
   * was made", which is the last moment anybody can prove it was touched.
   */
  it('reads a badge from before anything was stamping it', () => {
    expect(parseAccountRecord({ created_at: NOW }))
      .toEqual({ created_at: NOW, last_seen: NOW });
    expect(parseAccountRecord({ created_at: NOW, last_seen: 'thursday' }))
      .toEqual({ created_at: NOW, last_seen: NOW });
  });

  it('reads nothing out of anything that is not a badge record', () => {
    expect(parseAccountRecord(null)).toBeNull();
    expect(parseAccountRecord([])).toBeNull();
    expect(parseAccountRecord({})).toBeNull();
    expect(parseAccountRecord({ created_at: -1 })).toBeNull();
    expect(parseAccountRecord({ created_at: 1.5 })).toBeNull();
    expect(parseAccountRecord({ created_at: '2026' })).toBeNull();
    expect(readAccountRecord(null)).toBeNull();
    expect(readAccountRecord('{')).toBeNull();
  });
});
