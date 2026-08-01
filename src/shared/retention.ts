/**
 * How long a badge lives when nobody uses it, in the one place that decides it.
 *
 * A badge is an ACCOUNT: it is minted once, it holds a week, and it is the only
 * thing that knows which week is whose. Nothing about it is a person - there is
 * no email, no name, no address anywhere in this product - so there is nothing
 * here that a privacy policy would be about. What there is, is disk: a badge
 * somebody was issued in a tester round and never used again is a record that
 * would otherwise sit in KV until the estate is turned off.
 *
 * So both halves of an account carry the same time-to-live, re-armed on every
 * login and every save:
 *
 *  - the badge record in `PLAYERS`
 *  - the week filed against it in `SAVES`
 *
 * WHY 180 DAYS. It has to be longer than the longest gap a real player leaves -
 * a tester who plays a week in January and comes back when the next slice lands
 * is the ordinary case, and losing their farm fund to a cleanup job would be
 * the game's own joke told at the player's expense. Six months clears the
 * genuinely abandoned and keeps everybody who ever intends to come back, and it
 * is a number a person can hold in their head, which matters because the badge
 * screen says it out loud.
 *
 * WHY A TTL AND NOT A CLEANUP JOB. KV expires records itself, on write, for
 * free. A cron would be a second thing to deploy, a second thing to get wrong,
 * and a surface that deletes accounts - and a surface that deletes accounts is
 * a surface that can be made to delete the wrong one. There is no cleanup
 * endpoint in this Worker and there is deliberately nothing to call.
 */

/** Said out loud on the badge screen, so it is a number rather than a policy. */
export const RETENTION_DAYS = 180;

/** What KV wants: whole seconds, handed to `expirationTtl` on every put. */
export const RETENTION_SECONDS = RETENTION_DAYS * 24 * 60 * 60;

/** What the shell wants: milliseconds, for the date the badge screen shows. */
export const RETENTION_MS = RETENTION_SECONDS * 1_000;

/**
 * The whole of a badge record.
 *
 * Snake case because this is the shape in KV and on the wire, and the field
 * that was already there - `created_at`, written by the badges minted in
 * production - is not worth renaming for tidiness.
 */
export interface AccountRecord {
  /** Epoch milliseconds the badge was minted at. */
  readonly created_at: number;
  /** Epoch milliseconds of the last login or cloud save. */
  readonly last_seen: number;
}

/**
 * A badge record from KV or from the wire, read leniently in exactly one way.
 *
 * `last_seen` is allowed to be missing, and that is not slack: the badges
 * minted during the live smoke of v0.1 carry `{ created_at }` and nothing else,
 * because nothing was stamping them yet. Reading one as "last seen when it was
 * made" is the only honest answer available - it is the last moment anybody can
 * prove the badge was touched - and it means a real tester's badge is adopted
 * by this build rather than refused as unreadable. The first login or save
 * after this ships writes the full record and arms its TTL.
 *
 * Everything else is strict. A record that has no `created_at` is not a badge.
 */
export function parseAccountRecord(value: unknown): AccountRecord | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  const { created_at, last_seen } = value as Record<string, unknown>;

  if (
    typeof created_at !== 'number'
    || !Number.isSafeInteger(created_at)
    || created_at < 0
  ) {
    return null;
  }

  const seen = typeof last_seen === 'number'
    && Number.isSafeInteger(last_seen)
    && last_seen >= 0
    ? last_seen
    : created_at;

  return { created_at, last_seen: seen };
}

/** The same, from the raw text KV hands back. */
export function readAccountRecord(raw: string | null): AccountRecord | null {
  if (raw === null) {
    return null;
  }

  try {
    return parseAccountRecord(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * When this account goes, if nobody comes back.
 *
 * Derived rather than stored, and derived on both sides from this one constant,
 * so the date the badge screen shows and the expiry KV is actually holding
 * cannot drift apart: there is no second number to update.
 */
export function lapsesAt(record: Readonly<AccountRecord>): number {
  return record.last_seen + RETENTION_MS;
}
