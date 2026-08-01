import { describe, expect, it } from 'vitest';

import { fakeKv } from './kv-fake';
import {
  keepAccount,
  mintedAt,
  readAccount,
  seenAt,
  touchAccount,
} from './players';
import { keepSave, refreshSave } from './saves';
import { RETENTION_SECONDS } from '../src/shared/retention';

/**
 * The badge as an account with a life on it.
 *
 * Everything here is about ONE property with two halves: every write arms the
 * six months, and the six months start again every time somebody actually uses
 * the account. Both halves are asserted on the expiry the write asked KV for,
 * because that argument is the entire mechanism - there is no cleanup job to
 * catch a record that was written without it, and a record written without it
 * is immortal and looks exactly like a correct one from every other angle.
 */

const NOW = 1_700_000_000_000;
const BADGE = 'WG-1234-AB';
const LATER = NOW + 90 * 24 * 60 * 60 * 1_000;

describe('minting a badge', () => {
  it('records both stamps and arms the six months', async () => {
    const players = fakeKv();
    const record = mintedAt(NOW);

    expect(record).toEqual({ created_at: NOW, last_seen: NOW });

    await keepAccount(players, BADGE, record);

    expect(await readAccount(players, BADGE)).toEqual(record);
    expect(players.ttlOf(BADGE)).toBe(RETENTION_SECONDS);
  });

  /** Six months, in the unit KV counts in, said once in one file. */
  it('arms it for a hundred and eighty days', () => {
    expect(RETENTION_SECONDS).toBe(180 * 24 * 60 * 60);
  });
});

describe('being seen again', () => {
  it('moves the last-seen stamp and leaves the minting one alone', () => {
    const seen = seenAt(mintedAt(NOW), LATER);

    expect(seen).toEqual({ created_at: NOW, last_seen: LATER });
  });

  /**
   * The refresh itself, and the reason this file exists.
   *
   * A badge three months into its six is written back with a FULL six months,
   * not with what was left of the old one. KV cannot touch an expiry, so the
   * only way to push the date out is to write the record again with the TTL
   * attached - and an update that forgot the argument would leave the record
   * immortal while looking, from every other angle, exactly like this one.
   */
  it('re-arms the whole six months on every login', async () => {
    const players = fakeKv();
    await keepAccount(players, BADGE, mintedAt(NOW));

    const seen = await touchAccount(players, BADGE, LATER);

    expect(seen).toEqual({ created_at: NOW, last_seen: LATER });
    expect(await readAccount(players, BADGE)).toEqual(seen);
    expect(players.ttlOf(BADGE)).toBe(RETENTION_SECONDS);
  });

  /**
   * A badge nobody was issued is not created by somebody typing it. Without
   * this the log-on box is a registration form with worse odds, and every
   * mistyped digit is an orphan account sitting in KV for six months.
   */
  it('writes nothing at all for a badge that is not on file', async () => {
    const players = fakeKv();

    expect(await touchAccount(players, BADGE, NOW)).toBeNull();
    expect(players.writes()).toBe(0);
    expect(await readAccount(players, BADGE)).toBeNull();
  });

  /**
   * The badges that already exist. Real ones were minted in production before
   * anything stamped `last_seen`, and they carry `{ created_at }` and no TTL.
   * They have to be readable - a tester whose badge stopped working because we
   * added a field would be the migration failing in the only place it could -
   * and the first time one is used it becomes a full record with an expiry.
   */
  it('adopts a badge minted before any of this existed', async () => {
    const players = fakeKv({ [BADGE]: JSON.stringify({ created_at: NOW }) });

    expect(await readAccount(players, BADGE))
      .toEqual({ created_at: NOW, last_seen: NOW });
    expect(players.ttlOf(BADGE)).toBeUndefined();

    const seen = await touchAccount(players, BADGE, LATER);

    expect(seen).toEqual({ created_at: NOW, last_seen: LATER });
    expect(players.ttlOf(BADGE)).toBe(RETENTION_SECONDS);
  });

  it('reads nothing out of a record that is not one', async () => {
    for (const written of ['{', '[]', 'null', '{"last_seen":1}', '4']) {
      const players = fakeKv({ [BADGE]: written });
      expect(await readAccount(players, BADGE), written).toBeNull();
    }
  });
});

describe('the week filed against a badge', () => {
  const WEEK = JSON.stringify({ schema: 3, savedAt: NOW });

  it('is kept for exactly as long as the badge is', async () => {
    const saves = fakeKv();
    await keepSave(saves, BADGE, WEEK);

    expect(saves.entries.get(BADGE)).toBe(WEEK);
    expect(saves.ttlOf(BADGE)).toBe(RETENTION_SECONDS);
  });

  /**
   * The login that did not write a save still has to renew the save, or a
   * player who logs on every month but has not clocked off a day since spring
   * loses the week the badge exists to hold.
   */
  it('gets its six months back on a login, byte for byte', async () => {
    const saves = fakeKv({ [BADGE]: WEEK });

    expect(await refreshSave(saves, BADGE)).toBe(true);
    expect(saves.entries.get(BADGE)).toBe(WEEK);
    expect(saves.ttlOf(BADGE)).toBe(RETENTION_SECONDS);
  });

  it('says so, and writes nothing, when there is no week to renew', async () => {
    const saves = fakeKv();

    expect(await refreshSave(saves, BADGE)).toBe(false);
    expect(saves.writes()).toBe(0);
  });
});
