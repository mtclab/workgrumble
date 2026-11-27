/**
 * Version arithmetic shared by both games. It lives on its own so a page can
 * compare versions without importing another page's release notes.
 */

/**
 * Compares two `major.minor.patch` versions.
 *
 * Written out rather than compared as strings, because `'0.10.0' < '0.9.0'` is
 * true alphabetically and false in every other sense - and this decides
 * whether a player is shown an update window, which is the sort of thing that
 * goes unnoticed for exactly nine releases.
 *
 * Anything that is not three whole numbers sorts BELOW everything that is: an
 * unreadable stored version means "older than this build", which shows the
 * notes rather than hiding them.
 */
export function compareVersions(left: string, right: string): number {
  const parts = (value: string): readonly number[] => {
    const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());

    return matched === null
      ? [-1, -1, -1]
      : [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  };

  const a = parts(left);
  const b = parts(right);

  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);

    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }

  return 0;
}

/** Where a browser remembers the last version it was shown. */
export const SEEN_VERSION_KEY = 'workgrumble/seen-version';

export class VersionSlot {
  public constructor(
    private readonly storage: Storage,
    private readonly key: string = SEEN_VERSION_KEY,
  ) {}

  public read(): string | null {
    try {
      return this.storage.getItem(this.key);
    } catch {
      return null;
    }
  }

  public write(version: string): void {
    try {
      this.storage.setItem(this.key, version);
    } catch {
      // A browser that will not remember gets told twice. That is all.
    }
  }
}
