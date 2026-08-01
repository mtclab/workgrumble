import { describe, expect, it } from 'vitest';

import { accountFacts, formatDay, retentionNote } from './account';
import type { Account } from './api';
import { lapsesAt, RETENTION_DAYS, RETENTION_MS } from '../shared/retention';

/** Midday, so the date is the same one in every timezone a tester is in. */
function noonOn(year: number, month: number, day: number): number {
  return new Date(year, month - 1, day, 12).getTime();
}

const ISSUED = noonOn(2026, 3, 4);
const SEEN = noonOn(2026, 7, 30);

const ACCOUNT: Account = {
  badge: 'WG-1234-AB',
  createdAt: ISSUED,
  lastSeen: SEEN,
  lapsesAt: lapsesAt({ created_at: ISSUED, last_seen: SEEN }),
};

describe('the date on a record card', () => {
  /**
   * Written out rather than left to the browser's locale: "3/4/2026" is two
   * different days depending on who is reading it, and this one is a deadline.
   */
  it('is a day, a month with a name, and a year', () => {
    expect(formatDay(noonOn(2026, 3, 4))).toBe('4 March 2026');
    expect(formatDay(noonOn(1998, 12, 31))).toBe('31 December 1998');
  });
});

describe('what the badge screen states', () => {
  it('gives the number, when it was made and when it was last used', () => {
    expect(accountFacts(ACCOUNT)).toEqual([
      { term: 'Badge', value: 'WG-1234-AB' },
      { term: 'Issued', value: '4 March 2026' },
      { term: 'Last seen', value: '30 July 2026' },
      { term: 'Cleared on', value: formatDay(SEEN + RETENTION_MS) },
    ]);
  });

  /**
   * The date shown is six months after the last visit, not after the minting.
   * An account used yesterday is not closer to being cleared out for having
   * been opened last year, and a screen that said otherwise would be telling
   * somebody their week is about to go when it is not.
   */
  it('counts the six months from the last visit, not from the mint', () => {
    const old: Account = { ...ACCOUNT, createdAt: ISSUED - RETENTION_MS * 3 };

    expect(accountFacts(old).at(-1)?.value)
      .toBe(formatDay(SEEN + RETENTION_MS));
  });

  /**
   * The number in the sentence and the number KV is handed are one constant.
   * The whole point of saying it out loud is that it is true.
   */
  it('says the same number of days the record actually gets', () => {
    expect(retentionNote()).toContain(String(RETENTION_DAYS));
    expect(retentionNote()).toContain('six months');
    expect(RETENTION_DAYS).toBe(180);
  });
});
