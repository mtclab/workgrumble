/**
 * The badge's copy of the week, and the rule for when two copies disagree.
 *
 * OFFLINE-FIRST, and that word is doing real work. `localStorage` is still the
 * store: it is what the running session writes to, what it loads from, and the
 * only one of the two that is guaranteed to be there. The copy on the badge is
 * a spare key under a mat - it exists so a week survives a cleared browser or
 * follows somebody to another machine, and the game plays identically with it
 * switched off, missing, or refusing to answer.
 *
 * So the sync is two moments and neither of them can fail loudly:
 *
 *  - At boot, once, if the browser is carrying a badge: fetch the copy and
 *    compare stamps. A copy that is NEWER than what is in this browser is
 *    adopted - written into the local slot and loaded into the session, which
 *    at boot means the player logs on into the week they left rather than into
 *    a Monday. A copy that is older loses and gets overwritten by this one.
 *  - After every write that lands locally: push the same bytes up.
 *
 * NOTHING IS DESTROYED WHEN THEY DISAGREE. The losing copy is kept, verbatim,
 * under its own key. Clocks on two machines are not the same clock, "newest
 * wins" is a rule about stamps rather than about truth, and the one outcome
 * this must never have is a player whose Thursday was overwritten by a Monday
 * they started on a laptop and can never get back.
 */

import type { ApiResult, CloudApi } from './api';
import { parseSaveFile, type SaveSlot } from './save';

/** Where a save that lost an argument goes, rather than nowhere. */
export const CONFLICT_KEY = 'workgrumble/save.conflict';

export type SyncChoice =
  /** Nothing on the badge, or what is here is newer. Push. */
  | 'local'
  /** The badge has the later copy. Adopt it. */
  | 'remote'
  /** The same file, by its own stamp. Do nothing. */
  | 'same';

/**
 * When two copies of a week disagree, which one is later.
 *
 * `null` means "there is no readable copy here", which loses to anything. That
 * covers three cases that would otherwise each need their own branch: a
 * browser that has never played, a slot that was cleared, and a save this
 * build cannot parse - and losing is the right answer to all three, because
 * none of them is a week anybody can resume.
 *
 * Ties go to `same` rather than to either side. Two files with the same stamp
 * are the same file: one of them arrived here from the other, and copying it
 * back and forth is how a sync loop starts.
 */
export function chooseSave(
  localStamp: number | null,
  remoteStamp: number | null,
): SyncChoice {
  if (remoteStamp === null) {
    return 'local';
  }

  if (localStamp === null) {
    return 'remote';
  }

  if (remoteStamp === localStamp) {
    return 'same';
  }

  return remoteStamp > localStamp ? 'remote' : 'local';
}

/** The wall clock inside a save file, or null if that is not what this is. */
export function stampOf(raw: string | null): number | null {
  if (raw === null) {
    return null;
  }

  const parsed = parseSaveFile(raw);
  return parsed.ok ? parsed.value.savedAt : null;
}

export type PullOutcome =
  /** The badge's copy is now the one in this browser, and was loaded. */
  | 'adopted'
  /** This browser had the later copy, and it has been sent up. */
  | 'pushed'
  /** Both sides already agree, or there was nothing to do. */
  | 'settled'
  /** There was no answer. The game carries on exactly as it would have. */
  | 'unavailable';

export interface CloudSavesParts {
  readonly api: CloudApi;
  readonly slot: SaveSlot;
  /** Where the losing copy is kept. The same storage the slot is in. */
  readonly storage: Storage;
  /**
   * Puts the local slot into the running session.
   *
   * Only ever called at boot, before anybody has logged on - which is the one
   * moment a load is not a load "under the player's feet", because the session
   * it replaces is an empty Monday nobody has touched.
   */
  load(): void;
}

/**
 * The badge's copy, wired to the local slot.
 *
 * Everything here is best-effort by construction: the failures are all
 * `unavailable`, and none of them changes what the player can do next.
 */
export class CloudSaves {
  /**
   * Whether pushing is switched on yet.
   *
   * It starts OFF and the boot sync switches it on. Without that, the sequence
   * that ends a retried week - boot writes the carried-over attempt, the badge
   * is asked about a moment later - would send the fresh Monday up first and
   * overwrite the real save before anybody had looked at it. Nothing goes up
   * until the two copies have been compared once.
   */
  private pushing = false;

  public constructor(private readonly parts: Readonly<CloudSavesParts>) {}

  /**
   * The one comparison, at boot.
   *
   * It is deliberately allowed to be slow: it happens after the shell has
   * started, so the boot gag is already on screen and the player is reading a
   * fake POST while this is in flight. Nothing waits for it.
   */
  public async settle(): Promise<PullOutcome> {
    const remote = await this.parts.api.fetchSave();

    if (!remote.ok) {
      // Offline, refused, or served by something that is not the Worker. The
      // push stays off: a session that could not read the badge's copy has no
      // business overwriting it.
      return 'unavailable';
    }

    const here = this.parts.slot.readRaw();
    const choice = chooseSave(stampOf(here), stampOf(remote.value));
    this.pushing = true;

    if (choice === 'same') {
      return 'settled';
    }

    if (choice === 'local') {
      return here === null || !(await this.send(here))
        ? 'settled'
        : 'pushed';
    }

    return this.adopt(remote.value, here);
  }

  /**
   * A write that landed locally, on its way up.
   *
   * Fire and forget on purpose. The save the player asked for has already been
   * written to the slot and reported by the time this is called; making them
   * wait on a network round trip to be told their day was kept would put the
   * slow half of an optional feature in front of the fast half of the point.
   */
  public push(): void {
    if (!this.pushing) {
      return;
    }

    const raw = this.parts.slot.readRaw();

    if (raw !== null) {
      void this.send(raw);
    }
  }

  private async send(raw: string): Promise<boolean> {
    const stored: ApiResult<void> = await this.parts.api.storeSave(raw);
    return stored.ok;
  }

  /**
   * Takes the badge's copy, keeping this browser's rather than dropping it.
   *
   * The order is the whole of it: the loser is written to its own key FIRST,
   * and the slot is only overwritten once that has worked. A browser with no
   * room left to keep the old copy keeps the old copy, because the alternative
   * is losing a week to a storage quota.
   */
  private adopt(remote: string | null, here: string | null): PullOutcome {
    if (remote === null) {
      return 'settled';
    }

    if (here !== null) {
      try {
        this.parts.storage.setItem(CONFLICT_KEY, here);
      } catch {
        return 'settled';
      }
    }

    if (!this.parts.slot.writeRaw(remote).ok) {
      return 'settled';
    }

    this.parts.load();
    return 'adopted';
  }
}
