/**
 * The door: tester tokens, and the one decision they exist to make.
 *
 * A token is TWO keys in KV, and the split is the whole design.
 *
 *  - `<token>` is the POLICY: what it is called, how many admissions it is
 *    worth, when it stops working, and whether it has been revoked. It is
 *    written by the owner's CLI and by nothing else, ever.
 *  - `uses/<token>` is the COUNT, and it is the only thing the door writes.
 *
 * They used to be one record, and that shipped a defect that was found live on
 * the first day: an admission read the record, added one to the count, and
 * wrote the WHOLE record back. Any admission whose read happened before a
 * revocation landed put its stale copy back afterwards - `revoked: true`
 * quietly became `revoked: false`, and the link carried on letting people in.
 * Revocation was only as durable as the absence of traffic, which is precisely
 * backwards for the one field whose entire job is to work in a hurry.
 *
 * So no field has two writers. The door can still lose a COUNT to a race - two
 * admissions in the same instant both read four and both write five, and
 * somebody gets a free admission - and that is a miscount rather than a hole.
 * The policy cannot be lost at all, and `stillAdmitted` re-reads it on every
 * request, so a pass issued in the last stale moment before a revoke is dead by
 * that browser's next request.
 *
 * The decision itself is pure and lives here on its own. It is the piece with
 * six outcomes and five of them are refusals, which is exactly the shape of
 * thing that gets written once, tested through the happy path, and then quietly
 * lets an expired link in for a year.
 */

import type { KVNamespace } from './types';

/** What a token is allowed to look like before KV is asked anything. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

/**
 * The policy record. Owner-written, door-read.
 *
 * There is deliberately no live count on it. A count here would be a field two
 * writers could reach, which is the whole of what this shape exists to make
 * impossible.
 */
export interface TokenPolicy {
  /** Who it was given to, for the owner's own list. Never shown to anybody. */
  readonly label: string;
  /** How many admissions it is worth; null is a shared link with no limit. */
  readonly uses_max: number | null;
  /** Epoch milliseconds, or null for a link that does not time out. */
  readonly expires_at: number | null;
  readonly revoked: boolean;
  /**
   * A count found ON the policy record, which only a record written before the
   * split can have.
   *
   * It is read as the STARTING VALUE for the counter and never written back,
   * so a token minted by the old build keeps the admissions it had already
   * spent instead of quietly getting them all again. Nothing writes it.
   */
  readonly legacy_uses: number;
}

/**
 * Why a token did not admit somebody.
 *
 * It exists for the tests and for the owner's own CLI. It is deliberately NOT
 * carried into the response: "that link is expired" and "that link does not
 * exist" are the difference between a guess and a confirmed hit, and a door
 * that answers the difference is a door that can be enumerated.
 */
export type AdmissionRefusal =
  | 'malformed'
  | 'unknown'
  | 'unreadable'
  | 'revoked'
  | 'expired'
  | 'exhausted';

export type Admission =
  | {
    readonly ok: true;
    readonly policy: TokenPolicy;
    /** What the COUNTER should say once this admission is counted. */
    readonly spent: number;
  }
  | { readonly ok: false; readonly why: AdmissionRefusal };

export function isTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/**
 * Where the count lives.
 *
 * The slash is load-bearing: `isTokenShape` forbids one, so a counter key can
 * never be mistaken for a token and a token can never be mistaken for a
 * counter - which also means the CLI's listing can tell them apart without
 * having to know anything about either.
 */
export function usesKey(token: string): string {
  return `uses/${token}`;
}

/**
 * A policy record out of KV, read strictly.
 *
 * Anything that is not exactly this shape comes back null and the admission is
 * refused. A half-read token record is a door with an opinion about what the
 * missing half probably said.
 */
export function parseTokenPolicy(raw: string | null): TokenPolicy | null {
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

  const { label, uses_max, uses_count, expires_at, revoked } = parsed as
    Record<string, unknown>;

  const whole = (value: unknown): number | null | undefined => {
    if (value === null || value === undefined) {
      return null;
    }

    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  };

  const max = whole(uses_max);
  const expires = whole(expires_at);
  const legacy = whole(uses_count);

  if (
    typeof label !== 'string'
    || max === undefined
    || expires === undefined
    || legacy === undefined
  ) {
    return null;
  }

  return {
    label,
    uses_max: max,
    expires_at: expires,
    legacy_uses: legacy ?? 0,
    // Anything that is not literally `false` is a revoked token: a record with
    // the flag missing or misspelled must fail shut.
    revoked: revoked !== false,
  };
}

/**
 * How many admissions have been spent.
 *
 * A counter that is missing or unreadable falls back to whatever the policy
 * record carried: zero for anything minted since the split, and the real count
 * for anything minted before it.
 */
export function parseUses(raw: string | null, policy: TokenPolicy): number {
  // Digits and nothing else. `Number` is far too willing here - it reads an
  // EMPTY string as zero, which would turn a counter that had been blanked by
  // a bad write into a link with all its admissions back, and it reads `1e3`
  // and `0x10` as numbers nobody wrote. The door only ever puts `String(n)`,
  // so anything that is not a run of digits did not come from the door.
  if (raw === null || !/^\d+$/.test(raw)) {
    return policy.legacy_uses;
  }

  const count = Number(raw);

  return Number.isSafeInteger(count) ? count : policy.legacy_uses;
}

/**
 * Whether this token admits this request, and what the COUNTER should say
 * afterwards.
 *
 * The order is the whole of it. Revocation first, because it is the one that
 * has to beat every other fact - a revoked link that still has uses left and
 * has not expired is exactly the link somebody is trying. Then expiry, then
 * the count, and the count is `>=` rather than `>`: a token worth one
 * admission that has been used once is spent.
 */
export function admit(
  token: string,
  record: string | null,
  counter: string | null,
  now: number,
): Admission {
  if (!isTokenShape(token)) {
    return { ok: false, why: 'malformed' };
  }

  if (record === null) {
    return { ok: false, why: 'unknown' };
  }

  const policy = parseTokenPolicy(record);

  if (policy === null) {
    return { ok: false, why: 'unreadable' };
  }

  if (policy.revoked) {
    return { ok: false, why: 'revoked' };
  }

  if (policy.expires_at !== null && policy.expires_at <= now) {
    return { ok: false, why: 'expired' };
  }

  const used = parseUses(counter, policy);

  if (policy.uses_max !== null && used >= policy.uses_max) {
    return { ok: false, why: 'exhausted' };
  }

  return { ok: true, policy, spent: used + 1 };
}

/**
 * The same decision against a real KV, spending one admission.
 *
 * THE ONLY WRITE IS THE COUNTER. That is not tidiness and it is not an
 * optimisation - it is the invariant that keeps a revocation durable, and it is
 * asserted directly rather than left to be read off the code: the test drives
 * this function with a revoke landing between its read and its write, and
 * fails if the token key is written at all, for any reason, in any outcome.
 */
export async function spendAdmission(
  kv: KVNamespace,
  token: string,
  now: number,
): Promise<Admission> {
  if (!isTokenShape(token)) {
    return { ok: false, why: 'malformed' };
  }

  const record = await kv.get(token);
  const counter = await kv.get(usesKey(token));
  const outcome = admit(token, record, counter, now);

  if (outcome.ok) {
    await kv.put(usesKey(token), String(outcome.spent));
  }

  return outcome;
}
