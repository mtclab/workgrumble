/**
 * The on-call model, as pure functions (E6, 0.17.0).
 *
 * The determinism half of the version's teeth: whether a page is a fire or a
 * flap, when it woke you and when a flap settles are all seeded off the id, the
 * night and the world seed, so a save, a reload and a replay agree - and a fresh
 * attempt's seed can flip a night, which is the point of seeding it rather than
 * authoring it. The shipped pages are pinned to what the shipped seed makes them,
 * because a page that quietly stopped being a fire would walk straight past a
 * test that only checked the function was stable.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_SEED } from './session';
import {
  formatPageTime,
  isOnCall,
  ON_CALL_ANSWERED_REPUTATION,
  ON_CALL_MISS_REPUTATION,
  ON_CALL_SCRAMBLE_STRESS,
  pagedAtMinute,
  pageKind,
  pageSelfResolves,
  selfClearDelayMinutes,
  settledLine,
  severityLabel,
} from './on-call';
import { PLAYER_TIERS } from './fields';

describe('the on-call model (E6)', () => {
  describe('the fire/flap split is deterministic and seeded', () => {
    it('answers the same for the same id, night and seed', () => {
      for (let n = 1; n <= 4; n += 1) {
        expect(pageSelfResolves('page/x', n, WORLD_SEED))
          .toBe(pageSelfResolves('page/x', n, WORLD_SEED));
        expect(pagedAtMinute('page/x', n, WORLD_SEED))
          .toBe(pagedAtMinute('page/x', n, WORLD_SEED));
        expect(selfClearDelayMinutes('page/x', n, WORLD_SEED))
          .toBe(selfClearDelayMinutes('page/x', n, WORLD_SEED));
      }
    });

    it('a fresh attempt seed can flip a night', () => {
      // Not a promise that any one night flips, but that the seed is READ: over
      // a handful of nights, the two seeds disagree somewhere. A function that
      // ignored the seed would agree on every night, which is the bug.
      const other = (WORLD_SEED + 0x9e37_79b9) >>> 0;
      const flips = [1, 2, 3, 4, 5, 6, 7, 8].some(
        (n) => pageSelfResolves('page/x', n, WORLD_SEED)
          !== pageSelfResolves('page/x', n, other),
      );

      expect(flips).toBe(true);
    });

    it('pins the shipped pages to what the shipped seed makes them', () => {
      // The whole arc rests on these two: the Tuesday-night proxy page is a real
      // fire you fix, and the Wednesday-night timer page is a flap you learn to
      // leave. If a rename or a rate change flipped either, the arc would stop
      // teaching both and this reds.
      expect(pageKind('page/fc-nginx-down', 2, WORLD_SEED)).toBe('real');
      expect(pageKind('page/fc-backup-flap', 3, WORLD_SEED))
        .toBe('self_resolving');
    });

    it('wakes you in the small hours and settles a flap in a short window', () => {
      for (let n = 1; n <= 4; n += 1) {
        const at = pagedAtMinute('page/fc-backup-flap', n, WORLD_SEED);
        expect(at).toBeGreaterThanOrEqual(2 * 60);
        expect(at).toBeLessThanOrEqual(5 * 60 + 29);

        const delay = selfClearDelayMinutes('page/fc-backup-flap', n, WORLD_SEED);
        expect(delay).toBeGreaterThanOrEqual(5);
        expect(delay).toBeLessThanOrEqual(25);
      }
    });
  });

  describe('the vocabulary', () => {
    it('only an engineer carries the pager', () => {
      expect(isOnCall(PLAYER_TIERS.systemsEngineer)).toBe(true);
      expect(isOnCall(PLAYER_TIERS.serviceDesk)).toBe(false);
      // Absent is a desk player, which is every pre-promotion save.
      expect(isOnCall(undefined)).toBe(false);
    });

    it('formats the pager time and the severity the real way', () => {
      expect(formatPageTime(3 * 60 + 14)).toBe('03:14');
      expect(formatPageTime(5 * 60)).toBe('05:00');
      expect(severityLabel('sev1')).toBe('SEV-1');
      expect(severityLabel('sev2')).toBe('SEV-2');
    });

    it('builds the id@outcome line the settled record stores', () => {
      expect(settledLine('page/x', 'answered')).toBe('page/x@answered');
    });

    it('keeps the cost constants whole and in the honest order', () => {
      // Answering is worth less than missing costs, and both are meaningful.
      expect(ON_CALL_ANSWERED_REPUTATION).toBeGreaterThan(0);
      expect(ON_CALL_MISS_REPUTATION).toBeGreaterThan(ON_CALL_ANSWERED_REPUTATION);
      expect(ON_CALL_SCRAMBLE_STRESS).toBeGreaterThan(0);
    });
  });
});
