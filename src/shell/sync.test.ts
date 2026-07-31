import { describe, expect, it } from 'vitest';

import type { ApiResult, CloudApi } from './api';
import { OFFLINE_REASON } from './api';
import { SaveSlot } from './save';
import {
  chooseSave,
  CloudSaves,
  CONFLICT_KEY,
  stampOf,
} from './sync';

/**
 * The rule two copies of a week are settled by, and the promise that the loser
 * survives it.
 *
 * None of this touches a network: the badge is a fake with a string in it, so
 * every case a real sync can land in - including the three that only happen on
 * somebody else's machine - is a test that runs in the offline gate.
 */

class Memory implements Storage {
  private readonly entries = new Map<string, string>();
  public sealed = false;

  public get length(): number {
    return this.entries.size;
  }

  public clear(): void {
    this.entries.clear();
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public setItem(key: string, value: string): void {
    if (this.sealed) {
      throw new DOMException('QuotaExceededError');
    }

    this.entries.set(key, value);
  }
}

/** A save file, as far as anything in this module is concerned. */
function saveAt(savedAt: number, mark = 'here'): string {
  return JSON.stringify({
    schema: 3,
    savedAt,
    savedAtTick: 60,
    version: '0.1.0',
    label: mark,
    engine: '{}',
    app: {
      chat: { selectedId: null, threads: {} },
      mail: { selectedId: null, read: [] },
      kb: { selectedId: null },
      day: { briefShownFor: null, scorecardShownFor: null },
      browser: { siteId: null },
      caught: { appId: null, at: null },
      windows: { open: [], focusedId: null },
    },
    driver: { paused: false, speed: 1 },
  });
}

interface Badge {
  readonly api: CloudApi;
  /** What the badge is holding right now. */
  stored: string | null;
  /** Every body this session pushed, in order. */
  readonly pushes: string[];
}

function badge(held: string | null, reachable = true): Badge {
  const state: Badge = {
    stored: held,
    pushes: [],
    api: {
      session: () => Promise.resolve({ ok: true, value: 'WG-1234-AB' }),
      register: () => Promise.resolve({ ok: true, value: 'WG-1234-AB' }),
      logIn: () => Promise.resolve({ ok: true, value: 'WG-1234-AB' }),
      fetchSave: (): Promise<ApiResult<string | null>> => Promise.resolve(
        reachable
          ? { ok: true, value: state.stored }
          : { ok: false, offline: true, reason: OFFLINE_REASON },
      ),
      storeSave: (body: string): Promise<ApiResult<void>> => {
        if (!reachable) {
          return Promise.resolve({
            ok: false,
            offline: true,
            reason: OFFLINE_REASON,
          });
        }

        state.pushes.push(body);
        state.stored = body;
        return Promise.resolve({ ok: true, value: undefined });
      },
      sendFeedback: () => Promise.resolve(
        { ok: true, value: undefined } as ApiResult<void>,
      ),
    },
  };

  return state;
}

interface Wired {
  readonly cloud: CloudSaves;
  readonly storage: Memory;
  readonly slot: SaveSlot;
  readonly loads: () => number;
}

function wire(local: string | null, remote: Badge): Wired {
  const storage = new Memory();
  const slot = new SaveSlot(storage);
  let loads = 0;

  if (local !== null) {
    slot.writeRaw(local);
  }

  return {
    storage,
    slot,
    loads: () => loads,
    cloud: new CloudSaves({
      api: remote.api,
      slot,
      storage,
      load: () => {
        loads += 1;
      },
    }),
  };
}

describe('which copy is later', () => {
  it('takes the badge when it is ahead, and this browser when it is', () => {
    expect(chooseSave(100, 200)).toBe('remote');
    expect(chooseSave(200, 100)).toBe('local');
  });

  /**
   * A tie is not an argument. Two files with the same stamp are one file that
   * has been copied, and picking a side would send it back and forth forever.
   */
  it('does nothing when the two agree', () => {
    expect(chooseSave(100, 100)).toBe('same');
    expect(chooseSave(0, 0)).toBe('same');
  });

  /**
   * "No readable copy here" loses to anything, and it covers three cases at
   * once: a browser that has never played, a slot somebody cleared, and a file
   * this build cannot parse. None of the three is a week anybody can resume.
   */
  it('lets anything beat a browser with nothing readable in it', () => {
    expect(chooseSave(null, 1)).toBe('remote');
    expect(chooseSave(null, 0)).toBe('remote');
    expect(chooseSave(null, null)).toBe('local');
    expect(chooseSave(5, null)).toBe('local');
  });

  it('reads the stamp out of a real file and nothing out of rubbish', () => {
    expect(stampOf(saveAt(1_700_000_000_000))).toBe(1_700_000_000_000);
    expect(stampOf(null)).toBeNull();
    expect(stampOf('{ not json')).toBeNull();
    expect(stampOf(JSON.stringify({ schema: 99 }))).toBeNull();
  });
});

describe('settling at boot', () => {
  it('adopts the badge copy and loads it when the badge is ahead', async () => {
    const remote = badge(saveAt(2_000, 'thursday'));
    const wired = wire(saveAt(1_000, 'monday'), remote);

    expect(await wired.cloud.settle()).toBe('adopted');
    expect(wired.slot.readRaw()).toBe(saveAt(2_000, 'thursday'));
    expect(wired.loads()).toBe(1);
  });

  /**
   * The promise the whole rule rests on. Clocks on two machines are not the
   * same clock, so "newest wins" is a rule about stamps rather than about
   * truth - and the copy that loses is kept, byte for byte, where the player
   * can be pointed at it.
   */
  it('keeps the copy that lost rather than destroying it', async () => {
    const mine = saveAt(1_000, 'the week I actually played');
    const wired = wire(mine, badge(saveAt(2_000, 'the laptop')));

    await wired.cloud.settle();

    expect(wired.storage.getItem(CONFLICT_KEY)).toBe(mine);
  });

  /**
   * And it is kept FIRST. A browser with no room left to keep the old copy
   * keeps the old copy: losing a week to a storage quota is the one outcome
   * this file exists to prevent.
   */
  it('leaves the local save alone when the loser cannot be kept', async () => {
    const mine = saveAt(1_000, 'mine');
    const wired = wire(mine, badge(saveAt(2_000, 'theirs')));
    wired.storage.sealed = true;

    expect(await wired.cloud.settle()).toBe('settled');
    expect(wired.slot.readRaw()).toBe(mine);
    expect(wired.loads()).toBe(0);
  });

  it('adopts onto a browser that has never played here', async () => {
    const remote = badge(saveAt(2_000, 'elsewhere'));
    const wired = wire(null, remote);

    expect(await wired.cloud.settle()).toBe('adopted');
    expect(wired.slot.readRaw()).toBe(saveAt(2_000, 'elsewhere'));
    expect(wired.storage.getItem(CONFLICT_KEY)).toBeNull();
  });

  it('sends this browser up when it is the later one', async () => {
    const remote = badge(saveAt(1_000, 'old'));
    const wired = wire(saveAt(2_000, 'new'), remote);

    expect(await wired.cloud.settle()).toBe('pushed');
    expect(remote.stored).toBe(saveAt(2_000, 'new'));
    expect(wired.loads()).toBe(0);
  });

  it('leaves an agreeing pair alone', async () => {
    const remote = badge(saveAt(2_000));
    const wired = wire(saveAt(2_000), remote);

    expect(await wired.cloud.settle()).toBe('settled');
    expect(remote.pushes).toEqual([]);
    expect(wired.loads()).toBe(0);
  });
});

describe('pushing afterwards', () => {
  /**
   * The ordering bug this flag exists for.
   *
   * Boot writes a save before anything has been compared - a carried-over
   * retry does exactly that, on purpose, because the fund surviving a firing
   * is the joke the game is built on. If pushing were on from the start, that
   * fresh Monday would be sent up and would overwrite the badge's real week
   * before anybody had looked at either. Nothing goes up until the two copies
   * have been compared once.
   */
  it('sends nothing before the two copies have been compared', () => {
    const remote = badge(saveAt(5_000, 'the real week'));
    const wired = wire(saveAt(9_000, 'a fresh monday'), remote);

    wired.cloud.push();

    expect(remote.pushes).toEqual([]);
    expect(remote.stored).toBe(saveAt(5_000, 'the real week'));
  });

  it('sends every write up once the two copies have been compared', async () => {
    const remote = badge(null);
    const wired = wire(saveAt(1_000, 'first'), remote);

    await wired.cloud.settle();
    wired.slot.writeRaw(saveAt(2_000, 'second'));
    wired.cloud.push();

    expect(remote.pushes.at(-1)).toBe(saveAt(2_000, 'second'));
  });

  /**
   * A session that could not read the badge's copy has no business
   * overwriting it: it has no idea what it would be overwriting.
   */
  it('stays quiet for the whole session when the badge never answered', async () => {
    const remote = badge(saveAt(5_000), false);
    const wired = wire(saveAt(1_000), remote);

    expect(await wired.cloud.settle()).toBe('unavailable');
    wired.slot.writeRaw(saveAt(9_000));
    wired.cloud.push();

    expect(remote.pushes).toEqual([]);
  });
});
