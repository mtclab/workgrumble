/**
 * Getting at storage without taking the tab down with you.
 *
 * `window.localStorage` is not a property, it is a decision somebody else's
 * browser makes. Reading it THROWS in a window with third-party storage
 * blocked, in a locked-down enterprise profile, and in private modes that
 * pretend to have it and refuse the first write. The boot sequence used to
 * touch it directly, before anything had rendered, so a player whose browser
 * says no got a blank page and an unhandled rejection.
 *
 * So it is acquired through here instead. The answer is always a working
 * Storage - a real one when the browser allows it, an in-memory one when it
 * does not - plus the honest sentence about which of the two it is. A game
 * that cannot save is a game that says so and keeps playing; it is not a game
 * that fails to start.
 */

export interface StorageHandle {
  /** Always usable. Reads and writes; may or may not survive the tab. */
  readonly storage: Storage;
  /** True when what is written will still be there tomorrow. */
  readonly durable: boolean;
  /** Why it will not be, in a sentence a player can read. Null when it will. */
  readonly reason: string | null;
}

export const NO_STORAGE_REASON = 'This browser will not let the page keep '
  + 'anything: storage is blocked, full, or switched off for this window. The '
  + 'week still plays, and it will be gone when the tab is.';

/**
 * A Storage that forgets when the tab does.
 *
 * It implements the whole interface rather than the three methods this game
 * happens to call, because a fallback that is a different shape from the thing
 * it replaces is a fallback that fails somewhere else later.
 */
export class MemoryStorage implements Storage {
  private readonly entries = new Map<string, string>();

  public get length(): number {
    return this.entries.size;
  }

  public key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  public getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.entries.set(key, value);
  }

  public removeItem(key: string): void {
    this.entries.delete(key);
  }

  public clear(): void {
    this.entries.clear();
  }
}

/** The key the probe writes and takes away again. */
const PROBE_KEY = 'workgrumble/storage-probe';

/**
 * Storage, or the honest substitute for it.
 *
 * The probe is a real write and a real delete, because a browser that hands
 * over a `Storage` object and then refuses every `setItem` is a browser that
 * exists: quota exhaustion and private modes both look exactly like that, and
 * only a write finds out.
 */
export function openStorage(source: () => Storage | undefined): StorageHandle {
  let storage: Storage | undefined;

  try {
    storage = source();
  } catch {
    storage = undefined;
  }

  if (storage === undefined) {
    return {
      storage: new MemoryStorage(),
      durable: false,
      reason: NO_STORAGE_REASON,
    };
  }

  try {
    storage.setItem(PROBE_KEY, '1');
    storage.removeItem(PROBE_KEY);
  } catch {
    return {
      storage: new MemoryStorage(),
      durable: false,
      reason: NO_STORAGE_REASON,
    };
  }

  return { storage, durable: true, reason: null };
}
