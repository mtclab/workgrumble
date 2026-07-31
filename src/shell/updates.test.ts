import { describe, expect, it } from 'vitest';

import { BUILD_VERSION } from '../shared/build';
import { MemoryStorage } from './storage';
import { SEEN_VERSION_KEY, updateOnBoot, VersionSlot } from './updates';

/** A storage that refuses everything, which is a real browser setting. */
class SealedStorage extends MemoryStorage {
  public override setItem(): void {
    throw new DOMException('QuotaExceededError');
  }

  public override getItem(): string | null {
    throw new DOMException('SecurityError');
  }
}

describe('what this browser has been told about', () => {
  it('remembers a version across a boot', () => {
    const storage = new MemoryStorage();
    const slot = new VersionSlot(storage);

    expect(slot.read()).toBeNull();
    slot.write('0.1.0');

    expect(slot.read()).toBe('0.1.0');
    expect(storage.getItem(SEEN_VERSION_KEY)).toBe('0.1.0');
    expect(new VersionSlot(storage).read()).toBe('0.1.0');
  });

  /**
   * A browser that will not keep this gets told about the same update twice,
   * and that is the whole cost. Neither reading nor writing may throw: this
   * runs during boot, before anything is on screen, where an exception is a
   * blank page.
   */
  it('answers rather than throwing when storage refuses', () => {
    const slot = new VersionSlot(new SealedStorage());

    expect(() => {
      slot.write('0.1.0');
    }).not.toThrow();
    expect(slot.read()).toBeNull();
  });
});

describe('the update window at boot', () => {
  /**
   * The case that decides whether every player's first boot has a window in
   * front of it. A workstation that has only ever run this version has not
   * been updated - announcing an update that did not happen would be a lie
   * told to every new tester, forever.
   */
  it('says nothing at all on a workstation with no history', () => {
    expect(updateOnBoot(null, BUILD_VERSION)).toEqual([]);
  });

  it('says nothing when this browser is already up to date', () => {
    expect(updateOnBoot(BUILD_VERSION, BUILD_VERSION)).toEqual([]);
  });

  it('reads out everything published since the version last seen', () => {
    const shown = updateOnBoot('0.0.1', BUILD_VERSION);

    expect(shown.length).toBeGreaterThan(0);
    expect(shown[0]?.version).toBe(BUILD_VERSION);
  });

  /**
   * A stored version AHEAD of this build is a downgrade or a value somebody
   * edited. Reading out the notes for a version that is not installed would be
   * the update window's one job done backwards.
   */
  it('says nothing when the stored version is ahead of this build', () => {
    expect(updateOnBoot('99.0.0', BUILD_VERSION)).toEqual([]);
  });

  /** An unreadable stored version is older than anything, so it is shown. */
  it('treats a stored version nobody can read as out of date', () => {
    expect(updateOnBoot('rubbish', BUILD_VERSION).length).toBeGreaterThan(0);
  });
});
