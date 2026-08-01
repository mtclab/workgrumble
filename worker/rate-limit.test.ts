import { describe, expect, it } from 'vitest';

import { fakeKv } from './kv-fake';
import {
  consumeRate,
  parseRateWindow,
  rateDecision,
  type RateWindow,
} from './rate-limit';

const NOW = 1_700_000_000_000;
const WINDOW = 60_000;

describe('reading a counter', () => {
  it('reads what it wrote, and refuses everything else', () => {
    expect(parseRateWindow(JSON.stringify({ startedAt: NOW, count: 2 })))
      .toEqual({ startedAt: NOW, count: 2 });

    expect(parseRateWindow(null)).toBeNull();
    expect(parseRateWindow('{')).toBeNull();
    expect(parseRateWindow('[]')).toBeNull();
    expect(parseRateWindow('{"startedAt":"now","count":1}')).toBeNull();
    expect(parseRateWindow('{"startedAt":1,"count":-1}')).toBeNull();
  });
});

describe('the decision', () => {
  it('allows up to the limit and then stops', () => {
    let window: RateWindow | null = null;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const decision = rateDecision(window, NOW, 3, WINDOW);
      expect(decision.allowed, `attempt ${String(attempt)}`).toBe(true);
      window = decision.next;
    }

    expect(rateDecision(window, NOW, 3, WINDOW).allowed).toBe(false);
  });

  /**
   * A refused attempt still counts. Otherwise the counter only ever reaches
   * the limit once and then sits there being reset by every refusal, which is
   * a rate limit that lets somebody knock as often as they like.
   */
  it('counts the attempts it turned away', () => {
    const spent: RateWindow = { startedAt: NOW, count: 5 };
    const decision = rateDecision(spent, NOW, 3, WINDOW);

    expect(decision.allowed).toBe(false);
    expect(decision.next.count).toBe(6);
    expect(decision.next.startedAt).toBe(NOW);
  });

  it('opens a new window once the old one is over, and not before', () => {
    const spent: RateWindow = { startedAt: NOW, count: 9 };

    expect(rateDecision(spent, NOW + WINDOW - 1, 3, WINDOW).allowed).toBe(false);

    const rolled = rateDecision(spent, NOW + WINDOW, 3, WINDOW);
    expect(rolled.allowed).toBe(true);
    expect(rolled.next).toEqual({ startedAt: NOW + WINDOW, count: 1 });
  });

  /** A record stamped in the future is a clock that moved, not a life ban. */
  it('starts again from a window that claims to be in the future', () => {
    const impossible: RateWindow = { startedAt: NOW + WINDOW, count: 99 };
    const decision = rateDecision(impossible, NOW, 3, WINDOW);

    expect(decision.allowed).toBe(true);
    expect(decision.next).toEqual({ startedAt: NOW, count: 1 });
  });

  it('says how long the caller has to wait, never less than a second', () => {
    const window: RateWindow = { startedAt: NOW, count: 9 };

    expect(rateDecision(window, NOW, 1, WINDOW).retryAfterSeconds).toBe(60);
    expect(rateDecision(window, NOW + 59_999, 1, WINDOW).retryAfterSeconds)
      .toBe(1);
  });
});

describe('against a counter that is really there', () => {
  it('spends one attempt per call and writes the count back', async () => {
    const kv = fakeKv();

    expect((await consumeRate(kv, 'k', NOW, 2, WINDOW)).allowed).toBe(true);
    expect((await consumeRate(kv, 'k', NOW, 2, WINDOW)).allowed).toBe(true);
    expect((await consumeRate(kv, 'k', NOW, 2, WINDOW)).allowed).toBe(false);

    expect(parseRateWindow(kv.entries.get('k') ?? null)?.count).toBe(3);
  });

  it('keeps one caller out of another one\'s count', async () => {
    const kv = fakeKv();

    await consumeRate(kv, 'one', NOW, 1, WINDOW);
    expect((await consumeRate(kv, 'two', NOW, 1, WINDOW)).allowed).toBe(true);
    expect((await consumeRate(kv, 'one', NOW, 1, WINDOW)).allowed).toBe(false);
  });
});
