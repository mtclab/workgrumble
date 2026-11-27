import { describe, expect, it } from 'vitest';

import { MemoryStorage } from '../shell/storage';
import { compareVersions } from '../shared/versions';
import type { ReleaseNote } from '../world/releases';
import {
  HELLDESK_RELEASES,
  HELLDESK_SEEN_VERSION_KEY,
  HELLDESK_VERSION,
  helldeskReleasesNewestFirst,
  takeWhatsNew,
  whatsNew,
} from './releases';

/** A small made-up history, so the rules are pinned whatever ships next. */
const note = (version: string): ReleaseNote => ({
  version,
  date: '2026-01-01',
  summary: `Summary for ${version}, long enough to read.`,
  lines: [`A line for ${version} that is long enough to be a line.`],
});
const HISTORY: readonly ReleaseNote[] = [note('0.9.0'), note('0.10.0'), note('0.8.0'), note('0.11.0')];
const versions = (notes: readonly ReleaseNote[]): string[] => notes.map((n) => n.version);

describe('what counts as new', () => {
  /**
   * The case that decides whether every new player's first title screen has
   * a panel on it about changes to a game they never played.
   */
  it('shows nothing on a first visit', () => {
    expect(whatsNew(null)).toEqual([]);
    expect(whatsNew(null, '0.11.0', HISTORY)).toEqual([]);
  });

  it('shows nothing when this browser has seen this version, or a newer one', () => {
    expect(whatsNew(HELLDESK_VERSION)).toEqual([]);
    expect(whatsNew('0.11.0', '0.11.0', HISTORY)).toEqual([]);
    expect(whatsNew('0.12.0', '0.11.0', HISTORY)).toEqual([]);
  });

  /** Numbers, not strings: 0.10.0 is after 0.9.0, and newest comes first. */
  it('shows the notes after the seen version, up to this build, newest first', () => {
    expect(versions(whatsNew('0.9.0', '0.11.0', HISTORY))).toEqual(['0.11.0', '0.10.0']);
    expect(versions(whatsNew('0.8.0', '0.10.0', HISTORY))).toEqual(['0.10.0', '0.9.0']);
    expect(versions(whatsNew('0.1.0'))).toEqual(['0.2.0']);
  });

  /**
   * A stored value nobody can read means "older than anything": the notes
   * are shown. Telling somebody twice is a joke; not telling them is the
   * failure.
   */
  it('treats a malformed seen version as the oldest', () => {
    for (const junk of ['', 'nonsense', '0.1', '1.0.0-beta', '{}']) {
      expect(versions(whatsNew(junk, '0.11.0', HISTORY)), junk).toEqual(['0.11.0', '0.10.0', '0.9.0', '0.8.0']);
    }
    expect(versions(whatsNew('garbage'))).toEqual(versions(helldeskReleasesNewestFirst()));
  });
});

describe('asking at boot', () => {
  it('records this build on a first visit and shows nothing', () => {
    const storage = new MemoryStorage();
    expect(takeWhatsNew(storage)).toEqual([]);
    expect(storage.getItem(HELLDESK_SEEN_VERSION_KEY)).toBe(HELLDESK_VERSION);
  });

  /** Shown once: the reload after the panel has nothing to say. */
  it('shows an older browser the notes once, then never again', () => {
    const storage = new MemoryStorage();
    storage.setItem(HELLDESK_SEEN_VERSION_KEY, '0.1.0');
    expect(versions(takeWhatsNew(storage))).toEqual(['0.2.0']);
    expect(storage.getItem(HELLDESK_SEEN_VERSION_KEY)).toBe(HELLDESK_VERSION);
    expect(takeWhatsNew(storage)).toEqual([]);
  });

  /** Its own slot: the office sim's record of what it announced is not ours. */
  it('neither reads nor writes the office sim\'s slot', () => {
    const storage = new MemoryStorage();
    storage.setItem('workgrumble/seen-version', '0.1.0');
    expect(takeWhatsNew(storage)).toEqual([]);
    expect(storage.getItem('workgrumble/seen-version')).toBe('0.1.0');
  });

  it('shows nothing where the page has no storage at all', () => {
    expect(takeWhatsNew(null)).toEqual([]);
  });
});

describe('the Helldesk changelog', () => {
  it('is a list of dated, described, non-empty releases', () => {
    for (const release of HELLDESK_RELEASES) {
      expect(/^\d+\.\d+\.\d+$/.test(release.version), release.version).toBe(true);
      expect(/^\d{4}-\d{2}-\d{2}$/.test(release.date), release.version).toBe(true);
      expect(Number.isNaN(Date.parse(release.date)), release.date).toBe(false);
      expect(release.summary.length, release.version).toBeGreaterThan(20);
      expect(release.lines.length, release.version).toBeGreaterThan(0);
      for (const line of release.lines) expect(line.length, line).toBeGreaterThan(30);
    }
  });

  /** As written, not as sorted: the file reads top-down, newest first, no repeats. */
  it('is written newest first, strictly', () => {
    for (let i = 1; i < HELLDESK_RELEASES.length; i++) {
      const newer = HELLDESK_RELEASES[i - 1];
      const older = HELLDESK_RELEASES[i];
      if (newer === undefined || older === undefined) throw new Error('gap in the list');
      // 1, never 0: a repeated version is not descending either.
      expect(compareVersions(newer.version, older.version), `${newer.version} then ${older.version}`).toBe(1);
    }
  });

  /** A build cannot call itself a version whose notes nobody wrote. */
  it('has its newest note for the version this build calls itself', () => {
    expect(HELLDESK_RELEASES[0]?.version).toBe(HELLDESK_VERSION);
    expect(helldeskReleasesNewestFirst()[0]?.version).toBe(HELLDESK_VERSION);
  });
});
