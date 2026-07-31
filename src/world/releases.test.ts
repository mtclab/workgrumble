import { describe, expect, it } from 'vitest';

import { BUILD_VERSION } from '../shared/build';
import {
  compareVersions,
  CURRENT_VERSION,
  RELEASES,
  releasesNewestFirst,
  releasesSince,
} from './releases';

describe('the changelog', () => {
  /**
   * The gate that makes the version one number rather than three.
   *
   * `package.json` is what the build injects, this list is what the player is
   * shown, and the tag is cut after the live smoke. If the newest note and the
   * build disagree, a build has been made that announces a version whose notes
   * nobody wrote - which is exactly the release where somebody bumps the
   * package and forgets the changelog.
   */
  it('has an entry for the version this build calls itself', () => {
    expect(releasesNewestFirst()[0]?.version).toBe(BUILD_VERSION);
    expect(CURRENT_VERSION).toBe(BUILD_VERSION);
  });

  it('is a list of dated, described, non-empty releases', () => {
    const seen = new Set<string>();

    for (const note of RELEASES) {
      expect(/^\d+\.\d+\.\d+$/.test(note.version), note.version).toBe(true);
      expect(seen.has(note.version), note.version).toBe(false);
      seen.add(note.version);

      expect(/^\d{4}-\d{2}-\d{2}$/.test(note.date), note.version).toBe(true);
      expect(note.summary.length, note.version).toBeGreaterThan(20);
      expect(note.lines.length, note.version).toBeGreaterThan(0);

      for (const line of note.lines) {
        // A bullet, not a label. These are read out of a window by somebody
        // who wants to know what changed.
        expect(line.length, line).toBeGreaterThan(30);
      }
    }
  });
});

describe('comparing versions', () => {
  /**
   * The reason this is not a string comparison. `'0.10.0' < '0.9.0'` is true
   * alphabetically, and this decides whether a player is shown an update
   * window - so the bug would sit there quietly until the tenth release.
   */
  it('counts the parts as numbers', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBe(1);
    expect(compareVersions('0.9.0', '0.10.0')).toBe(-1);
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1);
    expect(compareVersions('0.1.1', '0.1.0')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions(' 0.1.0 ', '0.1.0')).toBe(0);
  });

  /**
   * A stored version nobody can read means "older than this build", so the
   * notes are SHOWN. Telling somebody about an update twice is a joke; not
   * telling them at all is the failure.
   */
  it('sorts anything unreadable below every real version', () => {
    expect(compareVersions('0.1.0', 'nonsense')).toBe(1);
    expect(compareVersions('0.0.0', '')).toBe(1);
    expect(compareVersions('0.1', '0.1.0')).toBe(-1);
    expect(compareVersions('nonsense', 'rubbish')).toBe(0);
  });
});

describe('what has come out since', () => {
  it('lists the releases after a version, newest first', () => {
    const since = releasesSince('0.0.1');

    expect(since.map((note) => note.version)).toEqual(
      releasesNewestFirst().map((note) => note.version),
    );
    expect(releasesSince(BUILD_VERSION)).toEqual([]);
    expect(releasesSince('99.0.0')).toEqual([]);
  });
});
