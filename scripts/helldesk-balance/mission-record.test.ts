import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const source = readFileSync('scripts/helldesk-balance/mission-record.mjs', 'utf8').replaceAll('export ', '');
interface Measurement {
  card: string; seed: number; approach: string; finish: string; seconds: number; maxTier: number;
  detectedAt: number | null; noticedAt: number | null; repTotal: number;
  repBase: number; repQuietBonus: number; repResolves: number; repPerMin: number;
  combatSec: number; minSanityPct: number; noiseEvents?: number;
}
function state(finish = 'done', quiet = true) {
  return { card: 'stapler', seed: 17, finish, over: true, seconds: 120, maxTier: quiet ? 1 : 3,
    detectedAt: quiet ? null : 20, noticedAt: 10 as number | null, noiseEvents: 3,
    result: { quiet, base: finish === 'done' ? 120 : 0, bonus: quiet && finish === 'done' ? 48 : 0, perResolve: 20, repTotal: 150 } };
}
const api = runInNewContext(source + '\n({ missionRecord, validateMissionRecord })') as {
  missionRecord: (m: ReturnType<typeof state>, approach: string, combatSec: number, minSanityPct: number) => Measurement;
  validateMissionRecord: (r: unknown) => void;
};

describe('mission records', () => {
  it.each([['done', true, 'quiet'], ['done', false, 'loud'], ['aborted', false, 'aborted'], ['burnout', false, 'burnout']] as const)(
    'reports %s, quiet=%s, using the results card Rep delta and parts', (finish, quiet, expected) => {
      const r = api.missionRecord(state(finish, quiet), 'auto', 12, 75);
      expect(r).toEqual({ card: 'stapler', seed: 17, approach: 'auto', finish: expected,
        seconds: 120, maxTier: quiet ? 1 : 3, detectedAt: quiet ? null : 20, noticedAt: 10,
        repTotal: 150, repBase: finish === 'done' ? 120 : 0, repQuietBonus: quiet ? 48 : 0,
        repResolves: 20, repPerMin: 75, combatSec: 12, minSanityPct: 75, noiseEvents: 3 });
    },
  );

  it('requires results, retains a zero-second rate of zero and allows unexposed noise', () => {
    expect(() => api.missionRecord({ ...state(), over: false }, 'quiet', 0, 100)).toThrow('no results card');
    const m = { ...state(), seconds: 0, maxTier: 0, noticedAt: null };
    Reflect.deleteProperty(m, 'noiseEvents');
    const r = api.missionRecord(m, 'quiet', 0, 100);
    expect(r.repPerMin).toBe(0);
    expect(r).not.toHaveProperty('noiseEvents');
  });

  it.each([
    { detectedAt: undefined }, { noticedAt: undefined }, { seconds: NaN }, { repBase: undefined },
    { repPerMin: 999 }, { combatSec: 121 }, { minSanityPct: -1 }, { maxTier: 4 },
    { finish: 'done' }, { seed: -1 }, { noiseEvents: -1 }, { detectedAt: 121 },
  ])('refuses a malformed record before it can affect the report: %j', (bad) => {
    const r = api.missionRecord(state('done', false), 'loud', 12, 75);
    expect(() => api.validateMissionRecord({ ...r, ...bad })).toThrow('invalid mission record');
  });
});
