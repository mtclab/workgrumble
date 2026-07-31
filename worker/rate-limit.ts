/**
 * Counting how often somebody has done something lately.
 *
 * A fixed window in KV: one record per subject per limit, holding when the
 * window opened and how many attempts have landed in it. It is not exact -
 * KV is eventually consistent and two requests in the same millisecond will
 * both read the same count - and it does not need to be. What it is for is
 * stopping one machine from walking the token space or the badge space at
 * speed, and a limit that is occasionally one generous is still a limit.
 *
 * The decision is pure and separate from the storage, because the arithmetic
 * is the part with an off-by-one in it: a window that never rolls over is a
 * permanent ban, and a window that rolls over on every request is no limit at
 * all. Both of those are one character apart from the right answer.
 */

import type { KVNamespace } from './types';

export interface RateWindow {
  /** Epoch milliseconds the current window opened at. */
  readonly startedAt: number;
  readonly count: number;
}

export interface RateDecision {
  readonly allowed: boolean;
  /** What to write back: the window with this attempt counted, or not. */
  readonly next: RateWindow;
  /** Whole seconds until the window rolls over, for `Retry-After`. */
  readonly retryAfterSeconds: number;
}

export function parseRateWindow(raw: string | null): RateWindow | null {
  if (raw === null) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null;
  }

  const { startedAt, count } = parsed as Record<string, unknown>;

  if (
    typeof startedAt !== 'number'
    || !Number.isFinite(startedAt)
    || typeof count !== 'number'
    || !Number.isSafeInteger(count)
    || count < 0
  ) {
    return null;
  }

  return { startedAt, count };
}

/**
 * Whether this attempt is inside the limit, and what the counter looks like
 * afterwards.
 *
 * A refused attempt is still counted. Somebody hammering a door does not get
 * their window reset by being turned away, which is what "count only the ones
 * that got through" quietly means.
 */
export function rateDecision(
  window: RateWindow | null,
  now: number,
  limit: number,
  windowMs: number,
): RateDecision {
  const fresh = window === null
    || now - window.startedAt >= windowMs
    // A window stamped in the future is a clock that moved or a record
    // somebody wrote by hand; either way, start again from now.
    || window.startedAt > now;
  const current: RateWindow = fresh
    ? { startedAt: now, count: 0 }
    : window;
  const next: RateWindow = { startedAt: current.startedAt, count: current.count + 1 };
  const remainingMs = Math.max(0, current.startedAt + windowMs - now);

  return {
    allowed: current.count < limit,
    next,
    retryAfterSeconds: Math.max(1, Math.ceil(remainingMs / 1_000)),
  };
}

/**
 * The same decision, against a real counter, spending one attempt.
 *
 * The TTL is the window plus a minute: the record has nothing to say once its
 * window has rolled over, and KV that cleans itself up is KV nobody has to
 * remember to clean up.
 */
export async function consumeRate(
  kv: KVNamespace,
  key: string,
  now: number,
  limit: number,
  windowMs: number,
): Promise<RateDecision> {
  const decision = rateDecision(
    parseRateWindow(await kv.get(key)),
    now,
    limit,
    windowMs,
  );

  await kv.put(key, JSON.stringify(decision.next), {
    expirationTtl: Math.max(60, Math.ceil(windowMs / 1_000) + 60),
  });

  return decision;
}
