/**
 * The door: tester tokens, and the one decision they exist to make.
 *
 * A token is a KV record with four facts on it - what it is called, how many
 * admissions it is worth, how many it has spent, and when it stops working -
 * plus a revocation flag that is checked on every single request rather than
 * being a deletion, because a link that has been handed out cannot be taken
 * back and the honest answer is to make it stop working with a record of why.
 *
 * The decision is pure and lives here on its own. It is the piece with five
 * outcomes and four of them are refusals, which is exactly the shape of thing
 * that gets written once, tested once through the happy path, and then quietly
 * lets an expired link in for a year.
 */

/** What a token is allowed to look like before KV is asked anything. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{8,64}$/;

export interface TokenRecord {
  /** Who it was given to, for the owner's own list. Never shown to anybody. */
  readonly label: string;
  /** How many admissions it is worth; null is a shared link with no limit. */
  readonly uses_max: number | null;
  readonly uses_count: number;
  /** Epoch milliseconds, or null for a link that does not time out. */
  readonly expires_at: number | null;
  readonly revoked: boolean;
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
  | { readonly ok: true; readonly spent: TokenRecord }
  | { readonly ok: false; readonly why: AdmissionRefusal };

export function isTokenShape(token: string): boolean {
  return TOKEN_SHAPE.test(token);
}

/**
 * A record out of KV, read strictly.
 *
 * Anything that is not exactly this shape comes back null and the admission is
 * refused. A half-read token record is a door with an opinion about what the
 * missing half probably said.
 */
export function parseTokenRecord(raw: string | null): TokenRecord | null {
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
  const count = typeof uses_count === 'number'
    && Number.isSafeInteger(uses_count)
    && uses_count >= 0
    ? uses_count
    : uses_count === undefined
      ? 0
      : null;

  if (
    typeof label !== 'string'
    || max === undefined
    || expires === undefined
    || count === null
  ) {
    return null;
  }

  return {
    label,
    uses_max: max,
    uses_count: count,
    expires_at: expires,
    // Anything that is not literally `false` is a revoked token: a record with
    // the flag missing or misspelled must fail shut.
    revoked: revoked !== false,
  };
}

/**
 * Whether this token admits this request, and what the record looks like
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
  raw: string | null,
  now: number,
): Admission {
  if (!isTokenShape(token)) {
    return { ok: false, why: 'malformed' };
  }

  if (raw === null) {
    return { ok: false, why: 'unknown' };
  }

  const record = parseTokenRecord(raw);

  if (record === null) {
    return { ok: false, why: 'unreadable' };
  }

  if (record.revoked) {
    return { ok: false, why: 'revoked' };
  }

  if (record.expires_at !== null && record.expires_at <= now) {
    return { ok: false, why: 'expired' };
  }

  if (record.uses_max !== null && record.uses_count >= record.uses_max) {
    return { ok: false, why: 'exhausted' };
  }

  return { ok: true, spent: { ...record, uses_count: record.uses_count + 1 } };
}
