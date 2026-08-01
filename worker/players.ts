/**
 * The badge record: what an account IS on this side of the wire.
 *
 * Two facts and no third one. When it was minted, and when it was last used -
 * where "used" means a login or a cloud save, the two moments at which somebody
 * demonstrably still wants this week. A page load does not count and neither
 * does reading the save: those happen because a tab was left open, and an
 * account that renews itself forever on a forgotten tab is an account with no
 * retention rule at all.
 *
 * Every write here arms the TTL, without exception, and that is the whole
 * mechanism: there is no cleanup job in this Worker and no endpoint that
 * deletes anything. See `src/shared/retention.ts` for the number and why.
 */

import {
  type AccountRecord,
  RETENTION_SECONDS,
  readAccountRecord,
} from '../src/shared/retention';
import type { KVNamespace } from './types';

/** A badge, the moment it is issued. */
export function mintedAt(now: number): AccountRecord {
  return { created_at: now, last_seen: now };
}

/**
 * The same badge, seen again.
 *
 * `last_seen` is set to the Worker's clock rather than to the later of the two
 * stamps. One clock writes this field, so a stored value in the future is a
 * record somebody edited by hand or a runtime whose clock was corrected, and in
 * both cases the truthful answer to "when was this last used" is now.
 */
export function seenAt(
  record: Readonly<AccountRecord>,
  now: number,
): AccountRecord {
  return { created_at: record.created_at, last_seen: now };
}

/**
 * Writes a badge record and re-arms its six months.
 *
 * The TTL is passed on EVERY put rather than only on the first, because KV has
 * no way to touch an expiry: an update without `expirationTtl` would quietly
 * make the record immortal, which is the same bug as forgetting the TTL
 * entirely and considerably harder to notice.
 */
export async function keepAccount(
  players: KVNamespace,
  badge: string,
  record: Readonly<AccountRecord>,
): Promise<void> {
  await players.put(badge, JSON.stringify(record), {
    expirationTtl: RETENTION_SECONDS,
  });
}

export async function readAccount(
  players: KVNamespace,
  badge: string,
): Promise<AccountRecord | null> {
  return readAccountRecord(await players.get(badge));
}

/**
 * Stamps a badge as seen, and answers with what it now says.
 *
 * `null` means there is no such badge, and nothing has been written. That is
 * load-bearing on the login path: a badge nobody was issued must not be
 * CREATED by somebody typing it, or the log-on box would be a registration
 * form with worse odds.
 */
export async function touchAccount(
  players: KVNamespace,
  badge: string,
  now: number,
): Promise<AccountRecord | null> {
  const record = await readAccount(players, badge);

  if (record === null) {
    return null;
  }

  const seen = seenAt(record, now);
  await keepAccount(players, badge, seen);
  return seen;
}
